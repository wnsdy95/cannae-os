const assert = require("node:assert/strict");
const base = require("../operator-consent-fixtures/support");
function installFaults(getFault) {
  const artifacts = require("../repository-artifact-store"), write = artifacts.writeRepositoryArtifact;
  artifacts.writeRepositoryArtifact = options => { const fault = getFault(); return fault ? fault(options, write) : write(options); };
  return write;
}
const action = (env, id) => env.service.auth.db.prepare("SELECT * FROM operator_actions WHERE id=?").get(id);
async function holdOriginal(env, stage, setFault) {
  const p = await base.preview(env); await env.service.consent.reserve(env.owner.storedSession(), base.commitInput(p));
  setFault((options, write) => {
    const stop = { "before-consent": "operator-consent-records", "after-consent": "decision-logs", "after-decision": "order-adoption-records" }[stage];
    if (options.kind === stop) throw new Error("CONSOLE_FIXTURE_ORIGINAL_INTERRUPTED");
    const result = write(options);
    if (stage === "after-adoption" && options.kind === "order-adoption-records") throw new Error("CONSOLE_FIXTURE_ORIGINAL_INTERRUPTED");
    return result;
  });
  try { assert.throws(() => require("../operator-consent-executor").executeOrderDecision(env.service.configuration, p.challenge_id), /ORIGINAL_INTERRUPTED/); }
  finally { setFault(null); }
  assert.equal(action(env, p.challenge_id).state, "reconciliation_required"); return p;
}
async function terminalPreview(env, id) {
  const inspected = await env.owner.post(`/api/order-decisions/${id}/inspect`, {});
  return env.owner.post(`/api/order-decisions/${id}/reconciliation/preview`, { manifest: inspected.observed_manifest.sha256 });
}
const terminalInput = p => ({ reconciliation_id: p.reconciliation_id, nonce: p.nonce, password: base.password,
  rationale: "Synthetic fixture terminal decision; not actual USER consent." });
module.exports = { installFaults, action, holdOriginal, terminalPreview, terminalInput };
