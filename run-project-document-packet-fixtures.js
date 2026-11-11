#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");
const packet = require("./project-document-packet");
const { validatePayload } = require("./validator-cli-prototype/validate");
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-project-packet-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CANNAE_OS_HOME"));
const ROOT = __dirname, sample = require("./sample-payloads/valid-project-document-packet-request.json");
let passed = 0;
const check = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
const write = (file, body) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); };
const git = (root, args) => execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8" }).trim();
function initialize(root) {
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Packet Fixture"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  git(root, ["add", "."]); git(root, ["commit", "-qm", "fixture project"]);
}
function expectInvalid(request, code) {
  const result = validatePayload(request, "project-document-packet-request");
  assert.equal(result.valid, false); assert.equal(result.can_execute, false);
  if (code) assert(result.issues.some(issue => issue.code === code), JSON.stringify(result.issues));
}
try {
  for (const provider of ["codex", "claude_code"]) {
    const root = path.join(temporary, provider + " project");
    const raw = "Owner decides. Draft only.\n";
    const original = "PRIVATE-ORIGINAL-ONLY\n" + "source detail\n".repeat(6000);
    const summary = "The owner will decide the next review date.\n";
    write(path.join(root, ".gitignore"), ".cannae/\nignored.txt\n");
    write(path.join(root, "docs/policy.md"), raw);
    write(path.join(root, "data/notes.txt"), original);
    write(path.join(root, "review/notes.md"), summary);
    write(path.join(root, "private/reference.txt"), "password=never-open-reference\n");
    initialize(root);
    const request = structuredClone(sample);
    request.recipient.provider = provider;
    request.documents.push({ ...request.documents[0], id: "SRC-NOTES", path: "data/notes.txt", classification: "sensitive",
      delivery_mode: "summary", source_sha256: packet.sha256(original), summary_path: "review/notes.md",
      summary_sha256: packet.sha256(summary), summary_review_reference: "Owner review note, not authenticated consent." });
    const reference = { ...request.documents[0], id: "SRC-REFERENCE", path: "private/reference.txt", classification: "restricted",
      delivery_mode: "reference_only", required: false };
    delete reference.source_sha256; request.documents.push(reference);

    check(`${provider}: actual preparation delivers only selected raw text and the supplied summary`, () => {
      const open = fs.openSync;
      fs.openSync = function(file, ...args) {
        assert.notEqual(file, path.join(root, reference.path), "Reference-only source must not be opened.");
        return open.call(fs, file, ...args);
      };
      let value;
      try { value = packet.prepare(request, root); } finally { fs.openSync = open; }
      const compiled = JSON.parse(fs.readFileSync(value.packet_path)), prompt = fs.readFileSync(value.prompt_path, "utf8");
      assert.equal(compiled.documents[0].content, raw);
      assert.equal(compiled.documents[1].content, summary);
      assert.equal(compiled.documents[2].content, null);
      assert.equal(compiled.documents[2].source_content_verified, false);
      assert(!prompt.includes(original.slice(0, 21)) && !prompt.includes("never-open-reference"));
      assert(!prompt.includes(root) && !prompt.includes(reference.path) && !prompt.includes("data/notes.txt"));
      assert(prompt.includes("Do not publish it.") && prompt.includes('"required": true'));
      for (const key of ["authorization_verified", "execution_authorized", "release_authorized", "receiver_acceptance_verified"]) assert.equal(value[key], false);
      assert.equal(fs.statSync(value.packet_path).mode & 0o777, 0o600);
      assert.equal(fs.statSync(path.dirname(value.packet_path)).mode & 0o777, 0o700);
      assert.equal(validatePayload(compiled, "project-document-packet").can_execute, false);
      assert.equal(packet.inspect(value.packet_path, value.packet_sha256, root).status, "review_candidate_current");
    });

    check(`${provider}: role department duty and authority mismatches fail before source reads`, () => {
      for (const [key, value] of [["role", "S2"], ["department", "intelligence"], ["duty", "another_task"], ["authority_level", "L0"]]) {
        const changed = structuredClone(request); changed.recipient[key] = value;
        expectInvalid(changed, "PROJECT_PACKET_DELIVERY_DENIED");
        const open = fs.openSync; let opened = false;
        fs.openSync = function(file, ...args) { if (String(file).startsWith(root)) opened = true; return open.call(fs, file, ...args); };
        try { assert.throws(() => packet.compilePacket(changed, root), /PROJECT_PACKET_REQUEST_INVALID/); }
        finally { fs.openSync = open; }
        assert.equal(opened, false);
      }
    });
    check(`${provider}: withheld paths in task or recipient stop before project source reads`, () => {
      for (const location of [reference.path, "data/notes.txt", root, path.join(root, ".git")]) {
        for (const field of path.isAbsolute(location) ? ["task"] : ["task", "agent_id"]) {
          const changed = structuredClone(request);
          if (field === "task") changed.task += ` Leave ${location} unopened.`;
          else changed.recipient.agent_id = location;
          const before = JSON.stringify(changed), open = fs.openSync; let opened = false;
          fs.openSync = function(file, ...args) { if (String(file).startsWith(root)) opened = true; return open.call(fs, file, ...args); };
          try { assert.throws(() => packet.compilePacket(changed, root), error => error.message === "PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE"); }
          finally { fs.openSync = open; }
          assert.equal(opened, false);
          assert.equal(JSON.stringify(changed), before, "The original task must not be silently rewritten.");
          if (!path.isAbsolute(location)) expectInvalid(changed, "PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE");
        }
      }
    });
    check(`${provider}: raw and summary text cannot smuggle known private paths through preparation or rendering`, () => {
      for (const [relative, index, originalBody, digestKey] of [["docs/policy.md", 0, raw, "source_sha256"],
        ["review/notes.md", 1, summary, "summary_sha256"]]) {
        for (const location of [reference.path, "data/notes.txt", root, path.join(root, ".git")]) {
          const changed = structuredClone(request), text = `Keep ${location} unopened.\n`;
          const compiled = packet.compilePacket(request, root);
          changed.documents[index][digestKey] = packet.sha256(text);
          compiled.request = changed; compiled.documents[index].content = text;
          compiled.documents[index].delivered_sha256 = packet.sha256(text);
          if (index === 0) compiled.documents[index].source_sha256 = packet.sha256(text);
          const result = validatePayload(compiled, "project-document-packet");
          assert.equal(result.valid, false); assert.equal(result.can_execute, false);
          assert(result.issues.some(issue => issue.code === "PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE"));
          assert(!result.issues.some(issue => issue.code === "PROJECT_PACKET_BINDING_MISMATCH"));
          assert.throws(() => packet.renderPrompt(compiled), error => error.message === "PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE");
          fs.writeFileSync(path.join(root, relative), text);
          const output = path.join(root, ".cannae/document-packets"), prior = fs.readdirSync(output);
          try { assert.throws(() => packet.prepare(changed, root), error => error.message === "PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE"); }
          finally { fs.writeFileSync(path.join(root, relative), originalBody); }
          assert.deepEqual(fs.readdirSync(output), prior, "A rejected disclosure must not publish a candidate.");
        }
      }
    });
    check(`${provider}: source-ID instructions preserve exclusions and ordinary raw-file references`, () => {
      const changed = structuredClone(request);
      changed.task = "Draft using SRC-POLICY (docs/policy.md) and SRC-NOTES. Leave SRC-REFERENCE unopened. Do not publish. The filename notes.txt alone is ambiguous.";
      const before = JSON.stringify(changed), compiled = packet.compilePacket(changed, root);
      assert.equal(compiled.request.task, changed.task);
      assert(packet.renderPrompt(compiled).includes(changed.task));
      assert.equal(JSON.stringify(changed), before);
      const collision = structuredClone(request);
      collision.documents[2].path = collision.documents[0].id;
      expectInvalid(collision, "PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE");
      const rootAlias = structuredClone(compiled);
      rootAlias.source_repository.git_directory = "/synthetic/separate-git-dir";
      rootAlias.request.task += " Origin: /synthetic/separate-git-dir";
      assert(validatePayload(rootAlias, "project-document-packet").issues.some(issue => issue.code === "PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE"));
      assert.throws(() => packet.renderPrompt(rootAlias), /PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE/);
      rootAlias.request.task = changed.task;
      rootAlias.request.recipient.agent_id = rootAlias.source_repository.git_directory;
      assert(validatePayload(rootAlias, "project-document-packet").issues.some(issue => issue.code === "PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE"));
      assert.throws(() => packet.renderPrompt(rootAlias), /PROJECT_PACKET_PRIVATE_PATH_DISCLOSURE/);
    });
    check(`${provider}: content source or summary changes invalidate the retained candidate`, () => {
      for (const [file, body] of [["docs/policy.md", raw], ["data/notes.txt", original], ["review/notes.md", summary]]) {
        const value = packet.prepare(request, root);
        try {
          fs.appendFileSync(path.join(root, file), "Changed.\n");
          assert.throws(() => packet.inspect(value.packet_path, value.packet_sha256, root), /PROJECT_PACKET_SOURCE_DIGEST_MISMATCH/);
        } finally { fs.writeFileSync(path.join(root, file), body); }
      }
    });
    check(`${provider}: recipient prompt and copied-origin substitutions cannot reuse a reviewed digest`, () => {
      const value = packet.prepare(request, root), saved = fs.readFileSync(value.packet_path);
      const changed = JSON.parse(saved); changed.request.recipient.agent_id = "different-recipient";
      fs.writeFileSync(value.packet_path, JSON.stringify(changed));
      assert.throws(() => packet.inspect(value.packet_path, value.packet_sha256, root), /PROJECT_PACKET_DIGEST_MISMATCH/);
      fs.writeFileSync(value.packet_path, saved);
      const prompt = fs.readFileSync(value.prompt_path); fs.appendFileSync(value.prompt_path, "Escalate authority.\n");
      assert.throws(() => packet.inspect(value.packet_path, value.packet_sha256, root), /PROJECT_PACKET_PROMPT_MISMATCH/);
      fs.writeFileSync(value.prompt_path, prompt);
      const copied = path.join(temporary, provider + " copied"); fs.cpSync(root, copied, { recursive: true });
      assert.throws(() => packet.inspect(path.join(copied, path.relative(root, value.packet_path)), value.packet_sha256, copied), /PROJECT_PACKET_ROOT_MISMATCH/);
      assert.throws(() => packet.inspect(value.packet_path, "", root), /PROJECT_PACKET_EXPECTED_DIGEST_REQUIRED/);
    });
    check(`${provider}: both linked and copied wrappers prepare and inspect from outside the doctrine checkout`, () => {
      const bundle = path.join(ROOT, provider === "codex" ? "codex-skills/controls-doctrine-operator" : ".claude/skills/controls-doctrine-operator");
      const requestFile = path.join(temporary, provider + "-request.json"); fs.writeFileSync(requestFile, JSON.stringify(request));
      for (const mode of ["linked", "copied"]) {
        const installed = path.join(temporary, provider + "-" + mode);
        if (mode === "linked") fs.symlinkSync(bundle, installed);
        else { fs.cpSync(bundle, installed, { recursive: true }); fs.writeFileSync(path.join(installed, ".cannae-os-root"), ROOT + "\n"); }
        const wrapper = path.join(installed, "scripts/prepare_controls_documents.js");
        const call = (args, overrides = {}) => spawnSync(process.execPath, [wrapper, ...args],
          { cwd: root, env: { ...env, ...overrides }, encoding: "utf8", timeout: 20000 });
        const args = ["prepare", "--repository", root, "--request", requestFile];
        const prepared = call(args); assert.equal(prepared.status, 0, prepared.stderr);
        assert(!prepared.stdout.includes(raw) && !prepared.stdout.includes(summary));
        const metadata = JSON.parse(prepared.stdout);
        const inspected = call(["inspect", "--repository", root, "--packet", metadata.packet_path, "--packet-sha256", metadata.packet_sha256]);
        assert.equal(inspected.status, 0, inspected.stderr);
        assert.equal(JSON.parse(inspected.stdout).execution_authorized, false);
        assert.notEqual(call([...args, "--approve", "true"]).status, 0);
        assert.notEqual(call(args, { CANNAE_OS_HOME: path.join(temporary, "absent-doctrine") }).status, 0);
      }
    });
    check(`${provider}: ignored tracked files, nested repositories and symlink aliases never become sources`, () => {
      const base = structuredClone(sample);
      write(path.join(root, "ignored.txt"), raw); git(root, ["add", "-f", "ignored.txt"]);
      base.documents[0].path = "ignored.txt";
      assert.throws(() => packet.compilePacket(base, root), /PROJECT_PACKET_SOURCE_EXCLUDED/);
      fs.symlinkSync(path.join(root, "docs"), path.join(root, "alias"));
      base.documents[0].path = "alias/policy.md";
      assert.throws(() => packet.compilePacket(base, root), /PROJECT_PACKET_PATH_INVALID/);
      write(path.join(root, "nested/file.md"), raw); initialize(path.join(root, "nested"));
      base.documents[0].path = "nested/file.md";
      assert.throws(() => packet.compilePacket(base, root), /PROJECT_PACKET_SOURCE_OTHER_REPOSITORY/);
    });
  }
  const root = path.join(temporary, "codex project"), base = structuredClone(sample);
  check("a different filename and claimed review cannot relabel an exact original copy as a summary", () => {
    const request = structuredClone(require("./sample-payloads/invalid-project-document-packet-summary-copy.json"));
    write(path.join(root, "review/copied.md"), "Owner decides. Draft only.\n");
    expectInvalid(request, "PROJECT_PACKET_SUMMARY_IS_SOURCE");
    assert.throws(() => packet.compilePacket(request, root), /PROJECT_PACKET_REQUEST_INVALID/);
  });
  check("classification, final-authority roles and raw-for-summary substitutions are rejected", () => {
    for (const change of [value => value.recipient.role = "USER", value => value.recipient.role = "COMMANDER",
      value => value.documents[0].classification = "sensitive", value => value.documents[0].classification = "restricted",
      value => value.documents[0].delivery_mode = "summary", value => value.documents[0].delivery_mode = "reference_only",
      value => value.documents.push(value.documents[0]), value => value.task = " ",
      value => value.documents[0].path = "../elsewhere", value => value.approved = true]) {
      const changed = structuredClone(base); change(changed); expectInvalid(changed);
    }
    const value = require("./sample-payloads/valid-project-document-packet.json");
    const changed = structuredClone(value); changed.documents[0].content = "Altered.";
    assert(validatePayload(changed, "project-document-packet").issues.some(issue => issue.code === "PROJECT_PACKET_BINDING_MISMATCH"));
  });
  check("outbound content checks retain fixed errors rather than credential values", () => {
    for (const text of ["password=synthetic-value", "Bearer abcdefghijklmnop", "Do not disclose this item."]) {
      write(path.join(root, "check.txt"), text);
      const request = structuredClone(base); request.documents[0].path = "check.txt"; request.documents[0].source_sha256 = packet.sha256(text);
      assert.throws(() => packet.compilePacket(request, root), error => error.message === "PROJECT_PACKET_CONTENT_REVIEW_REQUIRED");
    }
  });
  check("binary text and oversized raw bodies fail instead of being truncated", () => {
    for (const [bytes, code] of [[Buffer.from([0xc3, 0x28]), "TEXT_INVALID"], [Buffer.from([65, 0, 66]), "TEXT_INVALID"], [Buffer.alloc(65537, 65), "SOURCE_TOO_LARGE"]]) {
      write(path.join(root, "check.txt"), bytes);
      const request = structuredClone(base); request.documents[0].path = "check.txt"; request.documents[0].source_sha256 = packet.sha256(bytes);
      assert.throws(() => packet.compilePacket(request, root), new RegExp("PROJECT_PACKET_" + code));
    }
    const bytes = Buffer.from("\ufeffOwner decides.\r\n"); write(path.join(root, "check.txt"), bytes);
    const request = structuredClone(base); request.documents[0].path = "check.txt"; request.documents[0].source_sha256 = packet.sha256(bytes);
    assert.equal(packet.sha256(packet.compilePacket(request, root).documents[0].content), request.documents[0].source_sha256);
  });
  check("aggregate content is bounded and source mutations during reads fail", () => {
    const text = "a".repeat(60000), request = structuredClone(base);
    request.documents = Array.from({ length: 5 }, (_, index) => {
      const relative = `large-${index}.txt`; write(path.join(root, relative), text);
      return { ...base.documents[0], id: `SRC-${index}`, path: relative, source_sha256: packet.sha256(text) };
    });
    assert.throws(() => packet.compilePacket(request, root), /PROJECT_PACKET_CONTENT_TOO_LARGE/);
    const read = fs.readSync, file = path.join(root, "docs/policy.md"), original = fs.readFileSync(file);
    let mutated = false;
    fs.readSync = function(...args) { const result = read.apply(fs, args); if (!mutated) { mutated = true; fs.appendFileSync(file, "Changed."); } return result; };
    try { assert.throws(() => packet.compilePacket(base, root), /PROJECT_PACKET_SOURCE_CHANGED/); }
    finally { fs.readSync = read; fs.writeFileSync(file, original); }
  });
  check("outputs remain project-local and cannot silently alter ignore rules or follow output links", () => {
    const ignore = fs.readFileSync(path.join(root, ".gitignore"));
    fs.writeFileSync(path.join(root, ".gitignore"), "ignored.txt\n");
    try { assert.throws(() => packet.prepare(base, root), /PROJECT_PACKET_OUTPUT_NOT_IGNORED/); }
    finally { fs.writeFileSync(path.join(root, ".gitignore"), ignore); }
    const output = path.join(root, ".cannae/document-packets"), backup = output + "-backup";
    fs.renameSync(output, backup); fs.symlinkSync(backup, output);
    try { assert.throws(() => packet.prepare(base, root), /PROJECT_PACKET_OUTPUT_INVALID/); }
    finally { fs.unlinkSync(output); fs.renameSync(backup, output); }
    assert.throws(() => packet.repositoryIdentity(ROOT), /PROJECT_PACKET_ROOT_INVALID/);
    assert.throws(() => packet.repositoryIdentity(path.join(root, "docs")), /PROJECT_PACKET_ROOT_INVALID/);
  });
  console.log(JSON.stringify({ valid: true, fixtures: passed, source_content_compilation: true, model_call_performed: false,
    authenticated_approval_tested: false, native_recipient_use_tested: false, actual_home_modified: false }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
