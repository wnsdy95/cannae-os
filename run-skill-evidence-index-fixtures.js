#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict"), { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto"), { identity } = require("./project-terminology");
const { inspectIndex, validateIndex } = require("./skill-evidence-index");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-evidence-index-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
const relative = ".cannae/maintenance/evidence-index.json", file = path.join(root, relative);
let passed = 0;
const test = (name, run) => { run(); passed++; console.log("PASS " + name); };
try {
  assert.equal(spawnSync("git", ["init", "-q", root], { env }).status, 0);
  write(path.join(root, "source.js"), "synthetic source\n");
  write(path.join(root, "result.log"), "FAIL synthetic result; metadata is not an appraisal\n");
  const binding = name => { const bytes = fs.readFileSync(path.join(root, name)); return { path: name, sha256: sha(bytes), bytes: bytes.length }; };
  const base = { version: 1, cycle: "skill-reliability", repository: identity(root), entries: [{
    id: "LOCAL-EXAMPLE", criteria: ["SR17"], scope: "focused", recorded_outcome: "pass", source_revision: "1".repeat(40),
    command: ["touch", path.join(root, "must-not-exist")], source_files: [binding("source.js")], evidence_files: [binding("result.log")]
  }] };
  const save = value => write(file, JSON.stringify(value, null, 2) + "\n");
  const inspect = () => inspectIndex(root, relative);
  save(base);
  test("retained bytes do not execute commands, appraise a result, attest a revision or authorize a merge", () => {
    const result = inspect(); assert.equal(result.integrity_ok, true);
    assert.equal(result.inspector_sources.length, 2);
    assert.equal(result.entries[0].recorded_outcome, "pass"); assert.equal(result.entries[0].evidence_state, "retained");
    for (const flag of ["recorded_commands_executed", "result_semantics_verified", "revision_attribution_verified", "semantic_acceptance", "merge_authorized"]) assert.equal(result[flag], false);
    assert(!fs.existsSync(path.join(root, "must-not-exist"))); assert(!JSON.stringify(result).includes("FAIL synthetic result"));
  });
  test("a retained failed result stays failed even when all declared files match", () => {
    const value = structuredClone(base); value.entries[0].recorded_outcome = "fail"; save(value);
    const result = inspect(); assert.equal(result.integrity_ok, true); assert.equal(result.entries[0].recorded_outcome, "fail"); save(base);
  });
  test("missing and changed evidence is unavailable, never rebuilt or replaced with a current pass", () => {
    const log = path.join(root, "result.log"), bytes = fs.readFileSync(log), before = fs.readFileSync(file);
    fs.unlinkSync(log); let result = inspect(); assert.equal(result.integrity_ok, false);
    assert.equal(result.entries[0].evidence_files[0].state, "missing"); assert(!fs.existsSync(log));
    write(log, Buffer.alloc(bytes.length, 65)); result = inspect();
    assert.equal(result.entries[0].evidence_files[0].state, "content_changed"); assert.equal(result.entries[0].recorded_outcome, "pass");
    assert.deepEqual(fs.readFileSync(file), before); write(log, bytes);
  });
  test("source drift is separate from retained historical result bytes", () => {
    const source = path.join(root, "source.js"), bytes = fs.readFileSync(source); write(source, "different source\n");
    const result = inspect(); assert.equal(result.integrity_ok, false);
    assert.equal(result.entries[0].source_state, "differs_or_unavailable"); assert.equal(result.entries[0].evidence_state, "retained"); write(source, bytes);
  });
  test("historical and current versions of the same source remain distinct entries", () => {
    const value = structuredClone(base), old = structuredClone(value.entries[0]); old.id = "HISTORICAL";
    old.source_files[0].sha256 = "0".repeat(64); value.entries.push(old); save(value);
    const result = inspect(); assert.equal(result.entries[0].source_state, "matches_declared_files");
    assert.equal(result.entries[1].source_state, "differs_or_unavailable"); save(base);
  });
  test("unexecuted checks remain not-recorded and incomplete runs are not passed", () => {
    const value = structuredClone(base); value.entries[0].recorded_outcome = "not_run"; value.entries[0].evidence_files = []; save(value);
    let result = inspect(); assert.equal(result.integrity_ok, false); assert.equal(result.entries[0].evidence_state, "not_recorded");
    value.entries[0].recorded_outcome = "incomplete"; value.entries[0].evidence_files = base.entries[0].evidence_files; save(value);
    result = inspect(); assert.equal(result.entries[0].recorded_outcome, "incomplete"); save(base);
  });
  test("wrong repository identity is rejected even with identical copied files", () => {
    const other = path.join(root, "other"); fs.mkdirSync(other);
    assert.equal(spawnSync("git", ["init", "-q", other], { env }).status, 0);
    for (const name of ["source.js", "result.log", relative]) write(path.join(other, name), fs.readFileSync(path.join(root, name)));
    assert.throws(() => inspectIndex(other, relative), /SKILL_EVIDENCE_REPOSITORY_MISMATCH/);
  });
  test("unsafe references, duplicate IDs, additional fields and malformed bindings fail before observation", () => {
    const mutations = [
      value => { value.entries[0].source_files[0].path = "../source.js"; },
      value => { value.entries[0].source_files[0].path = "/source.js"; },
      value => { value.entries[0].source_files[0].path = ".git/config"; },
      value => { value.entries[0].source_files[0].path = "folder\\source.js"; },
      value => { value.entries[0].source_files[0].bytes = -1; },
      value => { value.entries[0].source_files[0].bytes = 64 * 1024 * 1024 + 1; },
      value => { value.entries[0].source_files[0].sha256 = "short"; },
      value => { value.entries.push(structuredClone(value.entries[0])); },
      value => { value.entries[0].source_files.push(value.entries[0].source_files[0]); },
      value => { value.entries[0].criteria = ["SR17", "SR17"]; },
      value => { value.entries[0].criteria = ["SR19"]; },
      value => { value.entries[0].scope = "all_pass"; },
      value => { value.entries[0].recorded_outcome = "not_run"; },
      value => { value.entries[0].evidence_files = []; },
      value => { value.entries[0].source_files = []; },
      value => { value.entries[0].merge_authorized = true; },
      value => { value.extra = true; }
    ];
    for (const mutate of mutations) { const value = structuredClone(base); mutate(value); assert.throws(() => validateIndex(value), /SKILL_EVIDENCE_/); }
  });
  test("symlinks, hardlinks and directory substitutions are unavailable without content disclosure", () => {
    const log = path.join(root, "result.log"), backup = path.join(root, "backup.log"); fs.renameSync(log, backup);
    for (const kind of ["symlink", "hardlink", "directory"]) {
      if (kind === "symlink") fs.symlinkSync(backup, log);
      else if (kind === "hardlink") fs.linkSync(backup, log);
      else fs.mkdirSync(log);
      const result = inspect(); assert.equal(result.integrity_ok, false); assert.equal(result.entries[0].evidence_files[0].state, "unsafe_or_unavailable");
      if (kind === "directory") fs.rmdirSync(log); else fs.unlinkSync(log);
    }
    fs.renameSync(backup, log);
    const value = structuredClone(base), directory = path.join(root, "alias"); fs.symlinkSync(root, directory);
    value.entries[0].evidence_files[0].path = "alias/result.log"; save(value);
    assert.equal(inspect().entries[0].evidence_files[0].state, "unsafe_or_unavailable"); fs.unlinkSync(directory); save(base);
  });
  test("a result changed between observations is not treated as a stable match", () => {
    const log = path.join(root, "result.log"), bytes = fs.readFileSync(log), open = fs.openSync; let seen = 0;
    fs.openSync = function(name, ...args) { if (name === log && ++seen === 2) write(log, Buffer.alloc(bytes.length, 66)); return open.call(fs, name, ...args); };
    try { assert.equal(inspect().entries[0].evidence_files[0].state, "changed_during_inspection"); }
    finally { fs.openSync = open; write(log, bytes); }
  });
  test("index drift or a self reference fails instead of returning a newly rebound snapshot", () => {
    const bytes = fs.readFileSync(file), open = fs.openSync; let seen = 0;
    fs.openSync = function(name, ...args) { if (name === file && ++seen === 2) write(file, Buffer.concat([bytes, Buffer.from(" ")])); return open.call(fs, name, ...args); };
    try { assert.throws(inspect, /SKILL_EVIDENCE_INDEX_OR_REPOSITORY_CHANGED/); }
    finally { fs.openSync = open; write(file, bytes); }
    const value = structuredClone(base); value.entries[0].evidence_files[0].path = relative; save(value);
    assert.throws(inspect, /SKILL_EVIDENCE_SELF_REFERENCE/); save(base);
  });
  test("CLI works from another cwd, does not leak malformed JSON and marks missing inputs unavailable", () => {
    const run = args => spawnSync(process.execPath, [path.join(__dirname, "skill-evidence-index.js"), ...args],
      { cwd: os.tmpdir(), env, encoding: "utf8", timeout: 20000 });
    const args = ["--repository", root, "--index", relative];
    let result = run(args); assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(JSON.parse(result.stdout).recorded_commands_executed, false);
    write(file, '{"private-marker-should-not-appear": broken'); result = run(args); assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).code, "SKILL_EVIDENCE_JSON_INVALID"); assert(!result.stdout.includes("private-marker"));
    fs.unlinkSync(file); result = run(args); assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).inspection_complete, false); save(base);
    result = run([...args, "--index", relative]); assert.equal(JSON.parse(result.stdout).code, "SKILL_EVIDENCE_ARGUMENTS_INVALID");
  });
  test("the current full aggregate discovers the new evidence fixtures without a skip mode", () => {
    assert(require("./run-all-fixtures").fixtureFiles({}).includes(path.basename(__filename)));
  });
  console.log(JSON.stringify({ valid: true, fixtures: passed, native_model_calls: 0, indexed_commands_executed: false }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
