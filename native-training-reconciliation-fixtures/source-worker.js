const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), s = require("./support"), { digest } = require("../operator-consent-contract");
async function main() {
  const file = path.resolve(__dirname, "../README.md"), bytes = fs.readFileSync(file); let env;
  try {
    env = await s.environment(); const id = await s.failed(env), p = await s.review(env, id), original = digest(s.row(env, id));
    fs.appendFileSync(file, "\nSynthetic isolated runtime source drift.\n");
    assert.equal((await env.owner.post("/api/native-training-reconciliations/commit", s.ackInput(p), 409)).error, "CONSOLE_MODEL_SOURCE_CHANGED");
    assert.equal(env.service.auth.db.prepare("SELECT authorization FROM operator_model_reconciliations WHERE id=?").get(p.reconciliation_id).authorization, null);
    assert.equal(digest(s.row(env, id)), original); assert.equal((await s.inspect(env, id)).hold_preserved, true);
    console.log(JSON.stringify({ passed: true, actual_copied_source_changed: true, public_worker_projection_used_as_fault: false, original_failure_preserved: true,
      actual_model_invocations: 0, real_owner_actions: 0, release_authorized: false }));
  } finally { fs.writeFileSync(file, bytes); if (env) await s.close(env); }
}
main().catch(error => { console.error(/^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "NATIVE_RECOVERY_SOURCE_FIXTURE_FAILED"); process.exitCode = 1; });
