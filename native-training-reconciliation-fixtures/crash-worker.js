const fs = require("node:fs"), assert = require("node:assert/strict"), s = require("./support"), { digest } = require("../operator-consent-contract");
async function main() {
  const [file, phase] = process.argv.slice(2); assert(file); assert(["reserved", "committed"].includes(phase)); let env;
  try {
    env = await s.environment(); const id = await s.failed(env), p = await s.review(env, id);
    const context = { root: env.root, stateDir: env.stateDir, configuration: env.configuration, action_id: id, reconciliation_id: p.reconciliation_id,
      original_sha256: digest(s.row(env, id)), receipt_boundary_reached: false, commit_returned: false };
    const save = () => fs.writeFileSync(file, JSON.stringify(context), { mode: 0o600 }); save();
    const prototype = Object.getPrototypeOf(env.service.auth.db), prepare = prototype.prepare, exec = prototype.exec; let pending = false;
    prototype.prepare = function(sql, ...args) {
      if (sql.startsWith("UPDATE operator_model_reconciliations SET state='committed'")) {
        context.receipt_boundary_reached = true; save(); pending = true; if (phase === "reserved") process.kill(process.pid, "SIGKILL");
      }
      return prepare.call(this, sql, ...args);
    };
    prototype.exec = function(sql, ...args) { const value = exec.call(this, sql, ...args);
      if (sql === "COMMIT" && pending && phase === "committed") { context.commit_returned = true; save(); process.kill(process.pid, "SIGKILL"); } return value; };
    await env.owner.post("/api/native-training-reconciliations/commit", s.ackInput(p)); throw new Error("NATIVE_RECOVERY_CRASH_BOUNDARY_MISSING");
  } catch (error) { if (env) await s.close(env); throw error; }
}
main().catch(error => { console.error(/^NATIVE_[A-Z_]+$/.test(error.message) ? error.message : "NATIVE_RECOVERY_CRASH_WORKER_FAILED"); process.exitCode = 1; });
