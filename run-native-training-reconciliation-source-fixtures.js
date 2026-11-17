#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), cp = require("node:child_process"), vm = require("node:vm"), assert = require("node:assert/strict");
const { groups, registryGroups, assertPartition } = require("./native-training-reconciliation-fixtures/control-group");
async function main() {
  assertPartition(); assert.deepEqual(Object.values(groups).map(group => group.length), [5, 6, 8, 6]);
  const runtime = require("./skill-mission-controller");
  for (const group of Object.keys(groups)) {
    const value = runtime.compileValidationCommand(`node native-training-reconciliation-fixtures/control-group.js ${group}`, __dirname);
    assert.equal(value.runner, "node"); assert.deepEqual(value.argv, [group]); assert.equal(value.shell, false);
  }
  for (const args of [[], ["CANARY-UNKNOWN-GROUP"], ["prefixes", "--role=USER"]]) {
    const child = cp.spawnSync(process.execPath, [path.join(__dirname, "native-training-reconciliation-fixtures/control-group.js"), ...args], { encoding: "utf8" });
    assert.equal(child.status, 2); assert.equal(child.stdout, ""); assert(!child.stderr.includes("CANARY"));
  }
  for (const [group, selected] of Object.entries(registryGroups)) {
    const file = path.join(__dirname, `run-native-training-reconciliation-${group}-fixtures.js`), source = fs.readFileSync(file, "utf8"), calls = [];
    const control = runtime.compileValidationCommand(`node ${path.basename(file)}`, __dirname);
    assert.deepEqual(control.argv, []); assert.equal(control.shell, false);
    const context = { process: { argv: [process.execPath, file] }, console: { error() { throw new Error("Unexpected wrapper denial."); } }, require(name) {
      if (name === "./native-training-reconciliation-fixtures/control-group") return { groups, registryGroups, assertPartition };
      assert.equal(name, "./run-native-training-reconciliation-fixtures");
      return { run(value) { calls.push(value); return { then(callback) { callback({ failed: 0 }); } }; } };
    } };
    vm.runInNewContext(source, context, { filename: file }); assert.deepEqual(calls, [selected]); assert.equal(context.process.exitCode, 0);
    const denied = cp.spawnSync(process.execPath, [file, "CANARY-UNEXPECTED-ARGUMENT"], { encoding: "utf8" });
    assert.equal(denied.status, 2); assert.equal(denied.stdout, ""); assert.equal(denied.stderr.trim(), "NATIVE_RECOVERY_REGISTRY_ARGUMENTS_INVALID");
  }
  const registry = require("./implementation-candidate-registry");
  assert.equal(registry.auditRegistry(JSON.parse(fs.readFileSync(path.join(__dirname, registry.REGISTRY_PATH))), __dirname).valid, true);
  const clients = require("./operator-consent-fixtures/support"), bounded = require("./native-training-transfer-fixtures/support").boundedClient;
  const canary = "CANARY-private-body-password", response = { statusCode: 409, cookies: [], body: canary,
    json() { return { error: "CONSOLE_SYNTHETIC_GUARD", reason_codes: ["FORCE_REGISTRY_SYNTHETIC", canary], password: canary }; } };
  const originalClient = clients.client({ app: { async inject() { return response; } } });
  for (const client of [originalClient, bounded(originalClient)]) {
    await assert.rejects(client.get(`/api/force-registry?password=${canary}`), error => {
      assert.equal(error.actual, 409); assert.equal(error.expected, 200); assert.equal(error.fixture_http.error_code, "CONSOLE_SYNTHETIC_GUARD");
      assert.equal(error.fixture_http.route, "/api/force-registry"); assert.deepEqual(error.fixture_http.reason_codes, ["FORCE_REGISTRY_SYNTHETIC"]);
      assert(!JSON.stringify(error.fixture_http).includes("CANARY")); return true;
    });
    assert.equal((await client.get("/api/force-registry", 409)).error, "CONSOLE_SYNTHETIC_GUARD");
  }
  const malformed = { ...response, json() { throw new Error(canary); } };
  assert.throws(() => clients.assertHttpStatus(malformed, 200, "POST", "http://[", "withheld"), error => error.actual === 409 && error.fixture_http.route === "other" && error.fixture_http.error_code === null);
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-native-recovery-source-"))), root = path.join(temporary, "runtime"); fs.mkdirSync(root);
  try {
    const files = cp.execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: __dirname }).toString().split("\0").filter(Boolean);
    for (const file of new Set(files)) { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(__dirname, file), target); }
    fs.appendFileSync(path.join(root, ".gitignore"), "\nnode_modules\n"); cp.execFileSync("git", ["init", "-q"], { cwd: root }); cp.execFileSync("git", ["add", "--all"], { cwd: root });
    cp.execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "synthetic runtime copy"], { cwd: root });
    fs.symlinkSync(path.join(__dirname, "node_modules"), path.join(root, "node_modules"), "dir");
    const child = cp.spawnSync(process.execPath, [path.join(root, "native-training-reconciliation-fixtures/source-worker.js")], { cwd: temporary, encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(child.status, 0, "Copied native source guard failed; child output withheld."); const value = JSON.parse(child.stdout); assert(value.passed && value.actual_copied_source_changed);
    console.log(JSON.stringify({ passed: 4, failed: 0, control_partition_complete: true, required_group_sizes: [5, 6, 8, 6], registry_group_sizes: [5, 6, 4, 4, 6], argument_free_registry_wrappers_verified: true, bounded_first_http_guard_diagnostics_verified: true, copied_source_guard: value,
      shared_pinned_dependencies_are_not_independent_attestation: true, all_eight_goals_complete: false, release_authorized: false }));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
main().catch(error => { console.error(/^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "NATIVE_RECOVERY_SOURCE_FIXTURE_FAILED"); process.exitCode = 1; });
