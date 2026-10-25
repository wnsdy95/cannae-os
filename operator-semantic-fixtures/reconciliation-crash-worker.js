const fs = require("node:fs"), assert = require("node:assert/strict");
const { environment, preview, commitInput, terminal } = require("./support");
const { reconcileInput } = require("../run-operator-model-reconciliation-fixtures");
const { digest } = require("../operator-consent-contract");
async function main() {
  const file = process.argv[2]; assert(file);
  const env = await environment({ model: "fixture-invalid" }), p = await preview(env);
  await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202); await terminal(env, p.challenge_id);
  const review = await env.owner.post(`/api/model-evaluations/${p.challenge_id}/reconciliation/preview`, {});
  const context = { root: env.root, configuration: env.configuration, options: env.options, action_id: p.challenge_id,
    reconciliation_id: review.reconciliation_id, original_sha256: digest(env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(p.challenge_id)),
    process_id: process.pid, actual_receipt_boundary_reached: false };
  fs.writeFileSync(file, JSON.stringify(context), { mode: 0o600 });
  const prototype = Object.getPrototypeOf(env.service.auth.db), original = prototype.prepare;
  prototype.prepare = function(sql, ...args) {
    if (sql.startsWith("UPDATE operator_model_reconciliations SET state='committed'")) {
      context.actual_receipt_boundary_reached = true; fs.writeFileSync(file, JSON.stringify(context), { mode: 0o600 });
      process.kill(process.pid, "SIGKILL");
    }
    return original.call(this, sql, ...args);
  };
  await env.owner.post("/api/model-reconciliations/commit", reconcileInput(review));
  throw new Error("Synthetic receipt-boundary process was not terminated");
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
