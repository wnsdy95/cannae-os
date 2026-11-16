#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { createHash } = require("node:crypto"), { spawnSync } = require("node:child_process");
const changes = require("./project-terminology-change"), terms = require("./project-terminology");
const { validatePayload } = require("./validator-cli-prototype/validate");
const sample = require("./sample-payloads/valid-project-terminology-change-request.json");
const ROOT = __dirname, temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-term-change-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CANNAE_OS_HOME"));
const hash = value => createHash("sha256").update(value).digest("hex");
const copy = value => structuredClone(value);
let passed = 0;
function check(name, run) { run(); passed++; console.log("PASS " + name); }
function write(file, bytes) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
function project(name) {
  const root = path.join(temporary, name);
  fs.mkdirSync(root);
  assert.equal(spawnSync("git", ["init", "-q", root], { env }).status, 0);
  write(path.join(root, ".gitignore"), ".cannae/\n");
  const request = copy(sample);
  write(path.join(root, request.source.path), request.change.basis.excerpt + "\n");
  return { root, request };
}
function ledger(root, entries = []) {
  const value = { schema_version: "0.1", type: "ProjectTerminology", repository: terms.identity(root), entries };
  write(path.join(root, terms.RELATIVE), JSON.stringify(value, null, 2) + "\n");
  return terms.read(root);
}
function invalid(value, type, code) {
  const result = validatePayload(value, type);
  assert.equal(result.valid, false); assert.equal(result.can_execute, false);
  assert(result.issues.some(issue => issue.code === code), JSON.stringify(result.issues));
}
function cli(script, args, status = 0) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: temporary, env, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 30000 });
  assert.equal(result.status, status, result.stderr);
  if (status) { assert.equal(result.stdout, ""); assert(!result.stderr.includes(temporary)); return result.stderr.trim(); }
  return JSON.parse(result.stdout);
}

try {
  const a = project("first project"), b = project("second project");
  let prepared, proposal;
  check("explicit user capture creates only a private pending proposal, not a ledger", () => {
    prepared = changes.prepare(a.request, a.root);
    proposal = JSON.parse(fs.readFileSync(path.join(a.root, prepared.proposal_path)));
    assert.equal(validatePayload(proposal, "project-terminology-change-proposal").valid, true);
    assert.equal(validatePayload(proposal, "project-terminology-change-proposal").can_execute, false);
    assert.equal(prepared.proposed_status, "confirmed");
    assert.equal(prepared.proposed_version, 1);
    for (const key of ["canonical_ledger_written", "confirmation_adopted", "transfer_authorized", "authorization_verified",
      "source_authenticity_verified", "semantic_accuracy_verified", "can_execute"]) assert.equal(prepared[key], false);
    assert.deepEqual(proposal.entry.allowed_roles, []); assert.deepEqual(proposal.entry.allowed_departments, []);
    assert.equal(proposal.entry.basis.excerpt, a.request.change.basis.excerpt);
    assert(!fs.existsSync(path.join(a.root, terms.RELATIVE)));
    assert.equal(fs.statSync(path.join(a.root, prepared.proposal_path)).mode & 0o777, 0o600);
    assert(!JSON.stringify(prepared).includes(a.request.change.definition));
    assert.throws(() => terms.projectSelection(a.root, { domain: "sales", actor: "user", terms: ["ICP"] }), /TERMINOLOGY_MISSING/);
  });
  check("fresh-process inspection retains exact bindings without accepting the definition", () => {
    const output = cli(path.join(ROOT, "project-terminology.js"), ["inspect-change", "--repository", a.root,
      "--proposal", prepared.proposal_path, "--proposal-sha256", prepared.proposal_sha256]);
    assert.deepEqual(output, prepared);
    assert.throws(() => changes.inspect(a.root, prepared.proposal_path, "0".repeat(64)), /PROPOSAL_DIGEST_MISMATCH/);
  });
  check("AI inference cannot request confirmation or retirement", () => {
    for (const status of ["confirmed", "retired"]) {
      const request = copy(a.request); request.change.basis.kind = "ai_inference"; request.change.status = status;
      invalid(request, "project-terminology-change-request", "TERMINOLOGY_CHANGE_INFERRED_DECISION");
      assert.throws(() => changes.prepare(request, a.root), /CONTRACT_INVALID/);
    }
    const request = copy(a.request); request.change.basis.kind = "ai_inference"; request.change.status = "candidate";
    const result = changes.prepare(request, a.root);
    assert.equal(result.proposed_status, "candidate"); assert.equal(result.confirmation_adopted, false);
  });
  check("real credential-shaped values are refused without echoing them", () => {
    const request = copy(a.request); request.change.definition = 'password="synthetic-hunter2"';
    invalid(request, "project-terminology-change-request", "TERMINOLOGY_CHANGE_CONTENT_REVIEW_REQUIRED");
    assert.throws(() => changes.prepare(request, a.root), /CONTRACT_INVALID/);
    const file = ".cannae/knowledge/change-requests/blocked.json"; write(path.join(a.root, file), JSON.stringify(request));
    const failure = cli(path.join(ROOT, "project-terminology.js"), ["propose-change", "--repository", a.root, "--request", file], 1);
    assert.equal(failure, "TERMINOLOGY_CHANGE_CONTRACT_INVALID"); assert(!failure.includes("hunter2"));
    const label = copy(a.request); label.change.term = "token_budget"; label.change.definition = "The permitted token count.";
    assert.equal(validatePayload(label, "project-terminology-change-request").valid, true);
  });
  check("source hashes exact excerpts byte ranges and original Unicode remain distinct", () => {
    const request = copy(a.request), source = path.join(a.root, request.source.path), original = fs.readFileSync(source);
    try {
      fs.appendFileSync(source, "Changed source.\n");
      assert.throws(() => changes.inspect(a.root, prepared.proposal_path, prepared.proposal_sha256), /SOURCE_STALE/);
    } finally { fs.writeFileSync(source, original); }
    const wrongQuote = copy(request); wrongQuote.change.basis.excerpt = request.change.basis.excerpt.replace("fit", "FIT");
    assert.throws(() => changes.compile(wrongQuote, a.root), /SOURCE_EXCERPT_MISMATCH/);
    const range = copy(request); range.source.end_byte--;
    invalid(range, "project-terminology-change-request", "TERMINOLOGY_CHANGE_SOURCE_RANGE_INVALID");
    const unicode = project("unicode");
    const quote = "\uace0\uac1d\uc0ac \uc870\uac74\uc740 \ud68c\uc0ac \uc218\uc900\uc758 \uc801\ud569\uc131\uc774\uc57c.";
    const prefix = "\uace0\uac1d\uc758 \uc124\uba85: ";
    unicode.request.change.basis.excerpt = quote;
    unicode.request.change.term = "\uace0\uac1d\uc0ac \uc870\uac74";
    unicode.request.change.aliases = ["ICP", "caf\u00e9"];
    const body = prefix + quote + "\n";
    unicode.request.source = { ...unicode.request.source, sha256: hash(body),
      start_byte: Buffer.byteLength(prefix), end_byte: Buffer.byteLength(prefix + quote) };
    write(path.join(unicode.root, unicode.request.source.path), body);
    const captured = changes.compile(unicode.request, unicode.root);
    assert.equal(captured.entry.term, unicode.request.change.term); assert.equal(captured.entry.basis.excerpt, quote);
    unicode.request.change.aliases.push("cafe\u0301");
    invalid(unicode.request, "project-terminology-change-request", "TERMINOLOGY_CHANGE_DUPLICATE_ALIAS");
  });
  check("new ledger creation invalidates a proposal that expected absence", () => {
    const stored = ledger(a.root, [proposal.entry]);
    assert.throws(() => changes.inspect(a.root, prepared.proposal_path, prepared.proposal_sha256), /BASE_STALE/);
    assert.equal(stored.value.entries.length, 1);
  });
  check("corrections preserve the predecessor scope access and current canonical selection", () => {
    const original = copy(proposal.entry); original.allowed_roles = ["S3"]; original.allowed_departments = ["sales"];
    const base = ledger(a.root, [original]), request = copy(a.request);
    request.expected_ledger_sha256 = base.digest;
    request.change.status = "candidate"; request.change.basis.kind = "ai_inference";
    request.change.definition = "A tentative narrower company segment.";
    const before = fs.readFileSync(path.join(a.root, terms.RELATIVE));
    const result = changes.prepare(request, a.root), candidate = JSON.parse(fs.readFileSync(path.join(a.root, result.proposal_path)));
    assert.equal(candidate.entry.version, 2); assert.equal(candidate.entry.supersedes, original.id);
    assert.deepEqual(candidate.predecessor, original);
    assert.deepEqual(candidate.entry.allowed_roles, original.allowed_roles);
    assert.deepEqual(candidate.entry.allowed_departments, original.allowed_departments);
    assert.deepEqual(fs.readFileSync(path.join(a.root, terms.RELATIVE)), before);
    const current = terms.projectSelection(a.root, { domain: "sales", actor: "ai", role: "S3", department: "sales", terms: ["ICP"] });
    assert.equal(current.confirmed[0].version, 1); assert.equal(current.candidates.length, 0);
    const reordered = copy(request);
    reordered.change.scope = { task: request.change.scope.task, domain: request.change.scope.domain };
    const reorderedProposal = changes.compile(reordered, a.root);
    assert.deepEqual(reorderedProposal.entry.scope, original.scope);
    assert.equal(validatePayload(reorderedProposal, "project-terminology-change-proposal").valid, true);
    assert.equal(reorderedProposal.entry.version, 2);
    request.change.scope.domain = "other";
    assert.throws(() => changes.prepare(request, a.root), /SCOPE_CHANGE/);
    request.change.scope.domain = "sales"; request.change.allowed_roles = ["S6"];
    invalid(request, "project-terminology-change-request", "ADDITIONAL_PROPERTY");
  });
  check("candidate corrections retirement and unavailable recipients do not self-adopt", () => {
    const base = terms.read(a.root), request = copy(a.request); request.expected_ledger_sha256 = base.digest;
    request.change.status = "retired"; request.change.basis.kind = "user_confirmation";
    const result = changes.prepare(request, a.root);
    assert.equal(result.proposed_status, "retired");
    assert.equal(terms.projectSelection(a.root, { domain: "sales", actor: "user", terms: ["ICP"] }).confirmed.length, 1);
    assert.equal(terms.projectSelection(a.root, { domain: "sales", actor: "ai", role: "S4", department: "sales", terms: ["ICP"] }).confirmed.length, 0);
    request.change.concept_id = "CONCEPT-UNKNOWN";
    assert.throws(() => changes.prepare(request, a.root), /RETIREMENT_WITHOUT_PREDECESSOR/);
  });
  check("independent proposals become stale after a changed ledger without rewriting prior evidence", () => {
    const request = copy(a.request); request.expected_ledger_sha256 = terms.read(a.root).digest;
    const result = changes.prepare(request, a.root), file = path.join(a.root, result.proposal_path), before = fs.readFileSync(file);
    const unrelated = copy(proposal.entry); unrelated.id = "TERM-OTHER"; unrelated.concept_id = "CONCEPT-OTHER"; unrelated.term = "Other";
    ledger(a.root, [...terms.read(a.root).value.entries, unrelated]);
    assert.throws(() => changes.inspect(a.root, result.proposal_path, result.proposal_sha256), /BASE_STALE/);
    assert.deepEqual(fs.readFileSync(file), before);
  });
  check("two projects and same spelling in different scopes remain isolated", () => {
    const first = changes.compile(b.request, b.root);
    const other = copy(b.request); other.change.scope.domain = "engineering"; other.change.definition = "Another scoped interpretation.";
    assert.notDeepEqual(first.entry.scope, changes.compile(other, b.root).entry.scope);
    const target = path.join(b.root, prepared.proposal_path); write(target, JSON.stringify(proposal));
    assert.throws(() => changes.inspect(b.root, prepared.proposal_path, hash(fs.readFileSync(target))), /ROOT_MISMATCH/);
  });
  check("edited proposal entries and authority flags fail before inspection", () => {
    const extra = copy(proposal); extra.entry.allowed_roles = ["S6"];
    invalid(extra, "project-terminology-change-proposal", "TERMINOLOGY_CHANGE_ENTRY_BINDING_MISMATCH");
    const flag = copy(proposal); flag.confirmation_adopted = true;
    assert.equal(validatePayload(flag, "project-terminology-change-proposal").valid, false);
    const nested = copy(proposal); nested.request.change.basis.kind = "ai_inference";
    invalid(nested, "project-terminology-change-proposal", "TERMINOLOGY_CHANGE_INFERRED_DECISION");
  });
  check("ignored private output is required and known invalid inputs create no proposal", () => {
    const p = project("not ignored"); fs.writeFileSync(path.join(p.root, ".gitignore"), "");
    assert.throws(() => changes.prepare(p.request, p.root), /OUTPUT_NOT_IGNORED/);
    assert(!fs.existsSync(path.join(p.root, ".cannae")));
    for (const source of ["../outside.md", ".git/config", ".env", "notes//turn.md", "/etc/passwd",
      "node_modules/x.md", ".cannae/knowledge/terminology.json"]) {
      const request = copy(p.request); request.source.path = source;
      invalid(request, "project-terminology-change-request", "TERMINOLOGY_CHANGE_SOURCE_PATH_INVALID");
    }
  });
  check("symlinked source ancestors leaf files output directories and hardlinks are rejected", () => {
    const p = project("links"), source = path.join(p.root, p.request.source.path), backup = path.join(p.root, "original.md");
    fs.renameSync(source, backup);
    for (const kind of ["symbolic", "hard"]) {
      if (kind === "symbolic") fs.symlinkSync(backup, source); else fs.linkSync(backup, source);
      assert.throws(() => changes.prepare(p.request, p.root), /TERMINOLOGY_(PATH|FILE)_INVALID/);
      fs.unlinkSync(source);
    }
    fs.renameSync(backup, source);
    const notes = path.dirname(source); fs.renameSync(notes, notes + "-real"); fs.symlinkSync(notes + "-real", notes);
    assert.throws(() => changes.prepare(p.request, p.root), /TERMINOLOGY_PATH_INVALID/);
    fs.unlinkSync(notes); fs.renameSync(notes + "-real", notes);
    fs.symlinkSync(path.join(b.root, ".cannae"), path.join(p.root, ".cannae"));
    assert.throws(() => changes.prepare(p.request, p.root), /OUTPUT_INVALID/);
  });
  const exposedProposalRules = ".cannae/knowledge/changes/**\n!.cannae/knowledge/changes/*/\n!.cannae/knowledge/changes/*/proposal.json\n";
  check("an ignored probe does not authorize an unignored exact proposal path", () => {
    const p = project("exact output exception");
    fs.writeFileSync(path.join(p.root, ".gitignore"), exposedProposalRules);
    assert.equal(spawnSync("git", ["-C", p.root, "check-ignore", "--quiet", "--", changes.OUTPUT + "/probe"], { env }).status, 0);
    assert.throws(() => changes.prepare(p.request, p.root), /TERMINOLOGY_CHANGE_OUTPUT_NOT_IGNORED/);
    assert(!fs.existsSync(path.join(p.root, changes.OUTPUT)));
    assert(!fs.existsSync(path.join(p.root, terms.RELATIVE)));
  });
  check("exact ignore rules are rechecked after directory creation before private bytes are written", () => {
    const p = project("output exception before write"), mkdir = fs.mkdirSync;
    let proposalDirectory;
    fs.mkdirSync = function(file, ...args) {
      const result = mkdir.call(fs, file, ...args);
      if (typeof file === "string" && path.dirname(file) === path.join(p.root, changes.OUTPUT)) {
        proposalDirectory = file;
        fs.writeFileSync(path.join(p.root, ".gitignore"), exposedProposalRules);
      }
      return result;
    };
    try { assert.throws(() => changes.prepare(p.request, p.root), /TERMINOLOGY_CHANGE_OUTPUT_NOT_IGNORED/); }
    finally { fs.mkdirSync = mkdir; }
    assert(proposalDirectory); assert(!fs.existsSync(path.join(proposalDirectory, "proposal.json")));
    assert(!fs.existsSync(path.join(p.root, terms.RELATIVE)));
  });
  check("changed ignore rules and force-tracked proposals stop inspection without deleting evidence", () => {
    const p = project("existing output exception"), result = changes.prepare(p.request, p.root);
    const file = path.join(p.root, result.proposal_path), original = fs.readFileSync(file);
    fs.writeFileSync(path.join(p.root, ".gitignore"), exposedProposalRules);
    assert.throws(() => changes.inspect(p.root, result.proposal_path, result.proposal_sha256), /TERMINOLOGY_CHANGE_OUTPUT_NOT_IGNORED/);
    assert.deepEqual(fs.readFileSync(file), original);
    fs.writeFileSync(path.join(p.root, ".gitignore"), ".cannae/\n");
    assert.equal(changes.inspect(p.root, result.proposal_path, result.proposal_sha256).status, "change_proposal_current_pending_review");
    assert.equal(spawnSync("git", ["-C", p.root, "add", "-f", "--", result.proposal_path], { env }).status, 0);
    assert.throws(() => changes.inspect(p.root, result.proposal_path, result.proposal_sha256), /TERMINOLOGY_CHANGE_OUTPUT_NOT_IGNORED/);
    assert.deepEqual(fs.readFileSync(file), original);
    assert(!fs.existsSync(path.join(p.root, terms.RELATIVE)));
  });
  check("invalid UTF-8 oversized files and mutation during bounded read fail", () => {
    const p = project("read integrity"), source = path.join(p.root, p.request.source.path), original = fs.readFileSync(source);
    try {
      const invalidBytes = Buffer.concat([original, Buffer.from([0xff])]); fs.writeFileSync(source, invalidBytes);
      p.request.source.sha256 = hash(invalidBytes);
      assert.throws(() => changes.prepare(p.request, p.root), /SOURCE_ENCODING_INVALID/);
      fs.writeFileSync(source, Buffer.alloc(128 * 1024 + 1));
      assert.throws(() => changes.prepare(p.request, p.root), /TERMINOLOGY_FILE_INVALID/);
    } finally { fs.writeFileSync(source, original); p.request.source.sha256 = hash(original); }
    const read = fs.readSync; let changed = false;
    fs.readSync = function(...args) {
      const result = read.apply(fs, args);
      if (!changed) { changed = true; fs.appendFileSync(source, "Concurrent source edit."); }
      return result;
    };
    try { assert.throws(() => changes.compile(p.request, p.root), /TERMINOLOGY_FILE_CHANGED/); }
    finally { fs.readSync = read; fs.writeFileSync(source, original); }
  });
  check("short reads finish completely but identical-byte named-file replacement fails", () => {
    const p = project("short reads"), source = path.join(p.root, p.request.source.path);
    const original = fs.readFileSync(source), read = fs.readSync;
    fs.readSync = function(fd, buffer, offset, length, position) {
      return read.call(fs, fd, buffer, offset, Math.min(length, 3), position);
    };
    try { assert.deepEqual(terms.readBoundFile(p.root, p.request.source.path).bytes, original); }
    finally { fs.readSync = read; }
    let replaced = false;
    fs.readSync = function(...args) {
      const result = read.apply(fs, args);
      if (!replaced) {
        replaced = true;
        fs.writeFileSync(source + ".replacement", original);
        fs.renameSync(source + ".replacement", source);
      }
      return result;
    };
    try { assert.throws(() => changes.compile(p.request, p.root), /TERMINOLOGY_FILE_CHANGED/); }
    finally { fs.readSync = read; }
  });
  check("same-path repository replacement cannot inspect an old proposal", () => {
    const p = project("replacement"), result = changes.prepare(p.request, p.root);
    fs.renameSync(path.join(p.root, ".git"), path.join(p.root, "old-git"));
    assert.equal(spawnSync("git", ["init", "-q", p.root], { env }).status, 0);
    assert.throws(() => changes.inspect(p.root, result.proposal_path, result.proposal_sha256), /ROOT_MISMATCH/);
  });
  for (const provider of ["codex-skills", ".claude/skills"]) check(provider + ": linked/copied wrappers prepare and inspect from another directory", () => {
    const p = project(provider.replaceAll("/", "-")), requestPath = ".cannae/knowledge/change-requests/one.json";
    write(path.join(p.root, requestPath), JSON.stringify(p.request));
    const source = path.join(ROOT, provider, "controls-doctrine-operator"), linked = path.join(temporary, provider.replaceAll("/", "-") + "-link"), copied = linked + "-copy";
    fs.symlinkSync(source, linked); fs.cpSync(source, copied, { recursive: true }); write(path.join(copied, ".cannae-os-root"), ROOT + "\n");
    for (const directory of [linked, copied]) {
      const wrapper = path.join(directory, "scripts/project_terminology.js");
      const result = cli(wrapper, ["propose-change", "--repository", p.root, "--request", requestPath]);
      assert.deepEqual(cli(wrapper, ["inspect-change", "--repository", p.root, "--proposal", result.proposal_path,
        "--proposal-sha256", result.proposal_sha256]), result);
      assert.equal(cli(wrapper, ["propose-change", "--repository", p.root, "--request", requestPath, "--confirm", "true"], 1), "TERMINOLOGY_CHANGE_USAGE");
    }
  });
  console.log(JSON.stringify({ valid: true, fixtures: passed, native_model_calls: 0, canonical_adoption_tested: false, impact_tracking_tested: false }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
