const fs = require("node:fs"), path = require("node:path"), base = require("../native-training-product-fixtures/support"), native = require("../operator-native-training"), f = require("./contracts");
function boundedClient(client) {
  const { assertHttpStatus } = require("../operator-consent-fixtures/support");
  return { ...client, async get(url, status = 200) { const response = await client.request("GET", url);
    assertHttpStatus(response, status, "GET", url, "Unexpected fixture HTTP status; response body withheld."); return response.json(); },
  async post(url, input, status = 200) { const response = await client.request("POST", url, input);
    assertHttpStatus(response, status, "POST", url, "Unexpected fixture HTTP status; response body withheld."); return response.json(); } };
}
async function environment(options = {}) { const env = await base.environment({ ...options, operatorTraining: true }); env.owner = boundedClient(env.owner); return env; }
function draft(env, mode = "success") {
  const crypto = require("node:crypto"), now = Date.now(), proposed = base.core.propose({ collection_id: crypto.randomUUID(), mission_id: env.plan.mission_id, wave_id: env.plan.wave_id,
    capability_id: env.capability.id, performer_id: env.performer.id, registry_head_ref: env.registry.head_ref, context_ref: env.contextRef,
    case_id: `CASE-crawl-${mode}`, classification: "internal", created_at: new Date(now).toISOString(), expires_at: new Date(now + 600000).toISOString() }, env.options);
  return { proposed, preview: base.core.prepareProduct({ ...env.options, requestId: proposed.request.id }, env.publicKey) };
}
async function preview(env, mode = "success", mutate, status = 200) {
  const prepared = draft(env, mode), plan = f.reviewFor(prepared.preview);
  let input = plan; if (mutate) { const { id, ...body } = plan; mutate(body); input = require("../native-training-transfer-contract").review(body); }
  const { id: proposedId, ...recipe } = input;
  native.proposeReview(recipe, env.options);
  const store = base.force.load(env.options), entry = store.manifest.artifacts.find(value => value.artifact_id === prepared.proposed.request.id);
  env.previewInput = { entry_id: require("../operator-console-evidence").entryId(entry), manifest: base.force.manifestState(store).sha256 };
  return env.owner.post("/api/training-products/preview", env.previewInput, status);
}
function commitInput(p) { return { challenge_id: p.challenge_id, nonce: p.nonce, password: require("../force-registry-fixtures/support").password,
  rationale: "Synthetic exact native task transfer only.", displayed_invocation_sha256: p.invocation.invocation_sha256, acknowledge_mission_handling: true }; }
async function terminal(env, id) {
  for (let count = 0; count < 300; count++) { const value = await env.owner.get(`/api/model-evaluations/${id}`); if (value.state !== "running") return value;
    await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("Synthetic native transfer did not reach a terminal observation.");
}
module.exports = { ...base, boundedClient, environment, draft, preview, commitInput, terminal, password: require("../force-registry-fixtures/support").password };
