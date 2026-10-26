#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), assert = require("node:assert/strict"), { spawnSync } = require("node:child_process");
const s = require("./native-training-reconciliation-fixtures/support"), { digest } = require("./operator-consent-contract");
async function main() {
  let passed = 0;
  for (const phase of ["reserved", "committed"]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-native-recovery-crash-")), file = path.join(directory, "context.json"); let context, service;
    try {
      const child = spawnSync(process.execPath, [path.join(__dirname, "native-training-reconciliation-fixtures/crash-worker.js"), file, phase], { encoding: "utf8", timeout: 180000 });
      if (fs.existsSync(file)) context = JSON.parse(fs.readFileSync(file)); assert.equal(child.signal, "SIGKILL"); assert(context.receipt_boundary_reached); assert.equal(context.commit_returned, phase === "committed");
      service = await require("./operator-console-server").createConsole({ ...context.configuration, training: null }); await service.app.ready();
      const env = { ...context, service, owner: s.boundedClient(s.f.client(service)) }; await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password: s.password }); await env.owner.session();
      const row = service.auth.db.prepare("SELECT * FROM operator_model_reconciliations WHERE id=?").get(context.reconciliation_id);
      assert.equal(row.state, phase === "reserved" ? "failed" : "committed"); assert(row.authorization);
      const current = await s.inspect(env, context.action_id); assert.equal(current.state, "held"); assert.equal(current.hold_preserved, phase === "reserved");
      assert.equal(digest(s.row(env, context.action_id)), context.original_sha256);
      if (phase === "reserved") { const p = await s.review(env, context.action_id); await env.owner.post("/api/native-training-reconciliations/commit", s.ackInput(p)); }
      assert.equal((await s.inspect(env, context.action_id)).hold_preserved, false); assert.equal((await env.owner.session()).native_training_available, false);
      assert.equal(fs.readdirSync(path.join(env.stateDir, "model-evaluations")).filter(name => !name.startsWith("collection-")).length, 1);
      passed++; console.log(`PASS actual native receipt process death at ${phase} preserves original failure without replay`);
    } finally { if (service) await service.app.close(); if (context) fs.rmSync(context.root, { recursive: true, force: true }); fs.rmSync(directory, { recursive: true, force: true }); }
  }
  console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, all_eight_goals_complete: false, release_authorized: false }));
}
main().catch(error => { console.error(/^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "NATIVE_RECOVERY_CRASH_FIXTURE_FAILED"); process.exitCode = 1; });
