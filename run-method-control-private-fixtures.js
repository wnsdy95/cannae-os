#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const privateState = require("./method-control-private-state"), runner = require("./method-control-runner");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-method-private-")));
const repository = path.join(root, "repo"), file = path.join(root, "private", "enrollment.json");
fs.mkdirSync(repository);
const value = { schema_version: "0.1", launch_slot_id: "MCTL-" + "1".repeat(40), enrollment_id: "pending", credential: "2".repeat(64),
  repository, artifact_root: path.join(root, "proof"), launch_descriptor: { synthetic: true } };
let passed = 0;
const check = (name, callback) => { callback(); passed++; console.log(`PASS ${name}`); };
try {
  check("missing private reads never create state", () => {
    const missing = path.join(root, "missing", "record.json");
    assert.throws(() => privateState.read(missing), /METHOD_CONTROL_PRIVATE_PATH_INVALID/);
    assert.equal(fs.existsSync(path.dirname(missing)), false);
  });
  check("repository-contained private state is rejected before directory creation", () => {
    const inside = path.join(repository, "private", "enrollment.json");
    assert.throws(() => privateState.create(inside, value, repository), /METHOD_CONTROL_STATE_INSIDE_REPOSITORY/);
    assert.deepEqual(fs.readdirSync(repository), []);
  });
  check("exclusive owner-only state is readable but never overwritten", () => {
    privateState.create(file, value, repository); assert.deepEqual(privateState.read(file), value);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
    assert.throws(() => privateState.create(file, value, repository), { code: "EEXIST" });
  });
  check("broader file and directory permissions fail closed", () => {
    fs.chmodSync(file, 0o644);
    try { assert.throws(() => privateState.read(file), /METHOD_CONTROL_PRIVATE_FILE_UNSAFE/); } finally { fs.chmodSync(file, 0o600); }
    fs.chmodSync(path.dirname(file), 0o755);
    try { assert.throws(() => privateState.read(file), /METHOD_CONTROL_PRIVATE_DIRECTORY_UNSAFE/); } finally { fs.chmodSync(path.dirname(file), 0o700); }
  });
  check("symlink traversal and hardlinked credentials fail closed", () => {
    const link = path.join(path.dirname(file), "link.json"); fs.symlinkSync(file, link);
    assert.throws(() => privateState.read(link), { code: "ELOOP" }); fs.unlinkSync(link);
    const parent = path.join(root, "alias"); fs.symlinkSync(path.dirname(file), parent);
    assert.throws(() => privateState.read(path.join(parent, "enrollment.json")), /METHOD_CONTROL_PRIVATE_PATH_INVALID/);
    fs.linkSync(file, link);
    try { assert.throws(() => privateState.read(file), /METHOD_CONTROL_PRIVATE_FILE_UNSAFE/); } finally { fs.unlinkSync(link); }
  });
  check("binding changes only pending enrollment once without credential rotation", () => {
    const id = "MCTL-" + "3".repeat(40); privateState.bind(file, id);
    assert.deepEqual(privateState.read(file), { ...value, enrollment_id: id });
    assert.throws(() => privateState.bind(file, "MCTL-" + "4".repeat(40)), /METHOD_CONTROL_PRIVATE_ALREADY_BOUND/);
    assert.deepEqual(privateState.read(file), { ...value, enrollment_id: id });
  });
  check("trusted CLI rejects caller authority and clock extensions before reading state", () => {
    for (const key of ["role", "now", "session", "release-authorized", "max-requests"]) {
      assert.throws(() => runner.main(["describe", "--private-file", file, `--${key}`, "USER"]), /Unsupported, duplicate or incomplete/);
    }
  });
  check("actual hook errors never disclose private paths or malformed private contents", () => {
    const original = fs.readFileSync(file);
    const invoke = () => {
      const output = require("node:child_process").execFileSync(process.execPath, [path.join(__dirname, "dispatch-hook-adapter.js"), "--provider", "codex"], {
        cwd: repository, encoding: "utf8", input: JSON.stringify({ hook_event_name: "PreToolUse", cwd: repository, session_id: "fixture-session",
          tool_name: "mcp__cannae_method_fixture__method_status", tool_use_id: "private-fault", tool_input: { request_id: "fault" } }),
        env: { ...process.env, CANNAE_REPOSITORY: repository, CANNAE_ARTIFACT_ROOT: value.artifact_root,
          CANNAE_MISSION_ID: "MIS-FIXTURE", CANNAE_WAVE_ID: "W1", CANNAE_AGENT_ID: "fixture-agent",
          CANNAE_PROVIDER_AGENT_ID: "main", CANNAE_METHOD_CONTROL_ENROLLMENT: file }
      });
      const result = JSON.parse(output);
      assert.equal(result.hookSpecificOutput.permissionDecision, "deny");
      assert(result.hookSpecificOutput.permissionDecisionReason.includes("METHOD_CONTROL_PRIVATE_UNAVAILABLE"));
      assert(!output.includes(file) && !output.includes("SENTINEL"));
    };
    fs.renameSync(file, file + ".offline");
    try { invoke(); } finally { fs.renameSync(file + ".offline", file); }
    fs.writeFileSync(file, "SENTINEL-SYNTHETIC-PRIVATE-NOT-A-REAL-CREDENTIAL");
    try { invoke(); } finally { fs.writeFileSync(file, original); }
  });
  console.log(JSON.stringify({ total: passed, passed, failed: 0, scope: "Synthetic POSIX private-file and CLI boundaries; not OS isolation or protected key custody." }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
