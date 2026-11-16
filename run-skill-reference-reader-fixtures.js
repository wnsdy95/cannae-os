#!/usr/bin/env node

const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readReference, parseArgs } = require("./skill-reference-reader");
const { hash } = require("./skill-evaluation-runner");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "skill-reference-")));
const repo = path.join(root, "doctrine"), project = path.join(root, "target");
const file = "docs/example.md";
const original = Buffer.from("# Guide\r\n\r\nIntro \uD55C\uAD6D\uC5B4.\r\n## Procedure\r\nRetain the stop.\r\n\r\n## History\r\nOld event.");
let passed = 0;
const fixture = (name, fn) => { fn(); passed++; console.log("PASS " + name); };
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CANNAE_OS_HOME"));
const git = args => {
  const result = spawnSync("git", ["-C", repo, ...args], { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
};
const read = (selection = {}) => readReference(repo, { file, mode: "index", ...selection });
const bound = (selection = {}) => read({ mode: "lines", sha256: hash(original), start_line: 4, end_line: 5, ...selection });
try {
  fs.mkdirSync(path.join(repo, "docs"), { recursive: true }); fs.mkdirSync(project);
  fs.writeFileSync(path.join(repo, file), original); git(["init", "-q"]); git(["add", "--", file]);
  fixture("navigation does not claim body delivery or Markdown section parsing", () => {
    const result = read();
    assert.deepEqual(result.navigation.entries.map(row => row.line), [1, 4, 7]);
    assert.equal(result.navigation.kind, "literal_heading_lines_not_markdown_parse");
    assert.equal(result.emitted_body_bytes, 0); assert(result.navigation_text_bytes > 0);
    assert.equal(result.content, undefined); assert.equal(result.source_content_complete, false);
    assert.equal(result.source_sha256, hash(original)); assert.equal(result.source_bytes, original.length);
    for (const key of ["native_read_verified", "access_authorized", "transfer_authorized", "issued_controls_changed", "semantic_completeness_verified"]) assert.equal(result[key], false);
  });
  fixture("range preserves exact CRLF and multibyte byte offsets without trimming", () => {
    const result = bound();
    assert.equal(result.content, "## Procedure\r\nRetain the stop.\r\n");
    assert.equal(result.range.start_byte, Buffer.byteLength("# Guide\r\n\r\nIntro \uD55C\uAD6D\uC5B4.\r\n"));
    assert.equal(result.content, original.subarray(result.range.start_byte, result.range.end_byte_exclusive).toString());
    assert.equal(result.excerpt_sha256, hash(result.content)); assert.equal(result.emitted_body_bytes, Buffer.byteLength(result.content));
    assert.equal(result.source_content_complete, false);
  });
  fixture("full reads and a full range preserve the exact final non-newline bytes", () => {
    const full = read({ mode: "full", sha256: hash(original) });
    const range = bound({ start_line: 1, end_line: 8 });
    assert.equal(full.content, original.toString()); assert.equal(range.content, full.content);
    assert.equal(full.source_content_complete, true); assert.equal(range.source_content_complete, true);
    assert.equal(full.excerpt_sha256, full.source_sha256);
  });
  fixture("repeated and overlapping reads are not silently deduplicated", () => {
    const first = bound(), second = bound(), overlap = bound({ start_line: 5, end_line: 7 });
    assert.deepEqual(first, second);
    assert.equal(first.emitted_body_bytes + second.emitted_body_bytes, Buffer.byteLength(first.content) * 2);
    assert(overlap.range.start_byte < first.range.end_byte_exclusive);
  });
  fixture("unread tail changes invalidate a previously selected span", () => {
    fs.appendFileSync(path.join(repo, file), "\nChanged history.");
    try { assert.throws(() => bound(), /SKILL_REFERENCE_SOURCE_CHANGED/); }
    finally { fs.writeFileSync(path.join(repo, file), original); }
  });
  fixture("invalid digest ranges and extra grant fields fail", () => {
    for (const args of [{ start_line: 0 }, { end_line: 9 }, { start_line: 6 }, { start_line: 1.1 },
      { end_line: Number.MAX_SAFE_INTEGER + 1 }]) assert.throws(() => bound(args), /RANGE_INVALID/);
    assert.throws(() => bound({ sha256: "bad" }), /SELECTION_INVALID/);
    assert.throws(() => bound({ transfer_authorized: true }), /SELECTION_INVALID/);
    assert.throws(() => read({ mode: "guarded" }), /SELECTION_INVALID/);
  });
  fixture("project private paths traversal arbitrary code and untracked documents fail", () => {
    for (const candidate of ["../README.md", ".cannae/prompt.md", "docs/../README.md", "docs/a/b.md", "package.json", "docs\\example.md", "/tmp/source.md"]) {
      assert.throws(() => read({ file: candidate }), /PATH_INVALID/);
    }
    fs.writeFileSync(path.join(repo, "docs/untracked.md"), "Local private draft.");
    assert.throws(() => read({ file: "docs/untracked.md" }), /UNTRACKED_SOURCE/);
    assert.throws(() => readReference(path.join(repo, "docs"), { file, mode: "index" }), /ROOT_INVALID/);
  });
  fixture("linked hardlinked directory missing empty and invalid UTF-8 sources fail", () => {
    const source = path.join(repo, file), outside = path.join(root, "other.md");
    fs.writeFileSync(outside, original);
    for (const type of ["link", "hardlink", "directory", "missing", "empty", "encoding"]) {
      fs.unlinkSync(source);
      try {
        if (type === "link") fs.symlinkSync(outside, source);
        if (type === "hardlink") fs.linkSync(outside, source);
        if (type === "directory") fs.mkdirSync(source);
        if (type === "empty") fs.writeFileSync(source, " \n");
        if (type === "encoding") fs.writeFileSync(source, Buffer.from([0xff]));
        assert.throws(() => read());
      } finally {
        if (fs.existsSync(source)) fs.rmSync(source, { recursive: true });
        fs.writeFileSync(source, original);
      }
    }
    const docs = path.join(repo, "docs"), moved = path.join(repo, "held");
    fs.renameSync(docs, moved); fs.symlinkSync(moved, docs);
    try { assert.throws(() => read()); } finally { fs.unlinkSync(docs); fs.renameSync(moved, docs); }
  });
  fixture("CLI selection modes are exclusive and unknown authority flags cannot pass", () => {
    assert.deepEqual(parseArgs(["--file", file, "--index"]), { file, mode: "index" });
    assert.deepEqual(parseArgs(["--file", file, "--lines", "4:5", "--sha256", hash(original)]),
      { file, mode: "lines", sha256: hash(original), start_line: 4, end_line: 5 });
    for (const args of [["--file", file], ["--file", file, "--full"], ["--file", file, "--index", "--sha256", hash(original)],
      ["--file", file, "--index", "--full"], ["--file", file, "--index", "--index"], ["--file", file, "--index", "--receipt"],
      ["--file", file, "--lines", "0:2", "--sha256", hash(original)], ["--file", file, "--index", "--root", root]]) {
      assert.throws(() => parseArgs(args), /ARGUMENTS_INVALID/);
    }
  });
  fixture("CLI errors do not emit partial content or local paths", () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, "skill-reference-reader.js"), "--file", "docs/missing.md", "--index"],
      { cwd: project, env, encoding: "utf8" });
    assert.equal(result.status, 2); assert.equal(result.stdout, "");
    assert.equal(result.stderr, "SKILL_REFERENCE_UNTRACKED_SOURCE\n");
  });
  for (const provider of ["codex-skills", ".claude/skills"]) fixture(provider + ": installed link and copy resolve doctrine from another project", () => {
    const sourceSkill = path.join(__dirname, provider, "controls-doctrine-operator");
    for (const type of ["link", "copy"]) {
      const install = path.join(root, provider.replaceAll("/", "-"), type);
      fs.mkdirSync(path.dirname(install), { recursive: true });
      if (type === "link") fs.symlinkSync(sourceSkill, install);
      else {
        fs.cpSync(sourceSkill, install, { recursive: true });
        fs.writeFileSync(path.join(install, ".cannae-os-root"), __dirname + "\n");
      }
      const invoke = args => spawnSync(process.execPath, [path.join(install, "scripts/read_controls_reference.js"), ...args],
        { cwd: project, env, encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
      const index = invoke(["--file", "docs/document-authoring-workflow.md", "--index"]);
      assert.equal(index.status, 0, index.stderr);
      const selection = JSON.parse(index.stdout);
      const complete = invoke(["--file", selection.path, "--full", "--sha256", selection.source_sha256]);
      assert.equal(complete.status, 0, complete.stderr);
      assert.equal(JSON.parse(complete.stdout).content, fs.readFileSync(path.join(__dirname, selection.path), "utf8"));
      const mismatch = invoke(["--file", selection.path, "--lines", "1:2", "--sha256", "0".repeat(64)]);
      assert.equal(mismatch.status, 2); assert.equal(mismatch.stdout, "");
      assert.equal(mismatch.stderr, "SKILL_REFERENCE_SOURCE_CHANGED\n");
    }
  });
  fixture("both provider wrappers and new reading instructions agree", () => {
    const providers = ["codex-skills", ".claude/skills"].map(p => path.join(__dirname, p, "controls-doctrine-operator"));
    assert.deepEqual(...providers.map(p => fs.readFileSync(path.join(p, "scripts/read_controls_reference.js"))));
    for (const provider of providers) {
      const entry = fs.readFileSync(path.join(provider, "SKILL.md"), "utf8");
      const guide = fs.readFileSync(path.join(provider, "references/document-routing.md"), "utf8");
      assert(entry.includes("retain full assigned sources"));
      for (const phrase of ["--sha256", "not a complete source", "Repeated reads", "guarded"]) assert(guide.includes(phrase));
    }
  });
  console.log(JSON.stringify({ valid: true, fixtures: passed, native_model_calls: 0, actual_native_delivery_bytes: null }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
