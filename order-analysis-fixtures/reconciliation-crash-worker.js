const fs = require("node:fs"), assert = require("node:assert/strict");
const { environment, failed, review, ackInput, row } = require("./reconciliation-support"), { digest } = require("../operator-consent-contract");
async function main() {
  const [file, phase] = process.argv.slice(2); assert(file); assert(["reserved", "committed"].includes(phase));
  let env;
  try {
    env = await environment({ model: "analysis-valid" }); const id = await failed(env, "after_publication"), p = await review(env, id);
    const context = { root: env.root, configuration: env.configuration, options: env.options, action_id: id, reconciliation_id: p.reconciliation_id,
      original_sha256: digest(row(env, id)), phase, receipt_boundary_reached: false, commit_returned: false };
    const save = () => fs.writeFileSync(file, JSON.stringify(context), { mode: 0o600 }); save();
    const prototype = Object.getPrototypeOf(env.service.auth.db), prepare = prototype.prepare, exec = prototype.exec; let receiptPending = false;
    prototype.prepare = function(sql, ...args) {
      if (sql.startsWith("UPDATE operator_model_reconciliations SET state='committed'")) {
        context.receipt_boundary_reached = true; save(); receiptPending = true;
        if (phase === "reserved") process.kill(process.pid, "SIGKILL");
      }
      return prepare.call(this, sql, ...args);
    };
    prototype.exec = function(sql, ...args) {
      const result = exec.call(this, sql, ...args);
      if (sql === "COMMIT" && receiptPending && phase === "committed") { context.commit_returned = true; save(); process.kill(process.pid, "SIGKILL"); }
      return result;
    };
    await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p)); throw new Error("Synthetic receipt boundary was not interrupted");
  } catch (error) { if (env) { await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); } throw error; }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
