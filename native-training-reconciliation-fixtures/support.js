const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const s = require("../native-training-transfer-fixtures/support"), native = require("../operator-native-training"), artifacts = require("../repository-artifact-store"), transfer = require("../native-training-transfer-contract");
const row = (env, id) => env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(id);
async function failed(env, mode = "rejected_response") {
  const p = await s.preview(env, mode === "rejected_response" ? "wrongcase" : "success");
  const write = artifacts.writeRepositoryArtifact, fileWrite = artifacts.writeRepositoryFileArtifact, publish = native.publish;
  artifacts.writeRepositoryArtifact = function(options) {
    if (mode === "before_authorization" && options.kind === transfer.KINDS.authorizations || mode === "before_result" && options.kind === transfer.KINDS.results)
      throw new Error("CONSOLE_MODEL_COLLECTION_FAILED"); return write.call(this, options);
  };
  artifacts.writeRepositoryFileArtifact = function(options) { if (mode === "before_output" && options.kind === transfer.KINDS.outputs) throw new Error("CONSOLE_MODEL_COLLECTION_FAILED"); return fileWrite.call(this, options); };
  native.publish = function(...args) { const value = publish.apply(this, args); if (mode === "after_result") throw new Error("CONSOLE_MODEL_COLLECTION_FAILED"); return value; };
  try {
    await env.owner.post("/api/training-products/commit", s.commitInput(p), 202); const current = await s.terminal(env, p.challenge_id);
    assert.equal(current.state, "held"); assert(current.result_verified && current.hold_preserved); return p.challenge_id;
  } finally { artifacts.writeRepositoryArtifact = write; artifacts.writeRepositoryFileArtifact = fileWrite; native.publish = publish; }
}
const review = (env, id, status = 200) => env.owner.post(`/api/training-products/${id}/reconciliation/preview`, {}, status);
const ackInput = p => ({ reconciliation_id: p.reconciliation_id, nonce: p.nonce, password: s.password, rationale: "Synthetic native failed-transfer acknowledgment; no rerun, grade, settlement or grant.",
  displayed_subject_sha256: p.displayed_subject_sha256, acknowledge_provider_uncertainty: true, acknowledge_native_publication: true, acknowledge_response_observation: true });
const inspect = (env, id) => env.owner.get(`/api/model-evaluations/${id}`);
const directory = (env, id) => path.join(env.stateDir, "model-evaluations", id);
async function restart(env, enabled = true) {
  await env.service.app.close(); env.service = await require("../operator-console-server").createConsole({ ...env.configuration, training: enabled ? env.profile : null });
  await env.service.app.ready(); env.owner = s.boundedClient(s.f.client(env.service)); await env.owner.session();
  await env.owner.post("/api/login", { username: "owner", password: s.password }); await env.owner.session();
}
module.exports = { ...s, row, failed, review, ackInput, inspect, directory, restart };
