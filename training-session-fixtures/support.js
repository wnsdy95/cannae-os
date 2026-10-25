const s = require("../task-training-fixtures/support"), c = require("../training-session-contract"), core = require("../training-session-controller");
const force = require("../force-registry-controller");
async function environment() {
  const env = await s.environment({ syntheticBinding: false });
  try {
  const lease = force.record(force.load(env.options), env.issued.lease_ref).payload;
  env.proposed = core.propose({ mission_id: env.plan.mission_id, wave_id: env.plan.wave_id, capability_id: env.capability.id, performer_id: env.performer.id,
    expected_registry_head_ref: env.registry.head_ref, lease_ref: env.issued.lease_ref, stage: "crawl",
    case_ids: ["CASE-crawl-0", "CASE-crawl-1", "CASE-crawl-2"], expires_at: lease.expires_at }, env.options);
  return env;
  } catch (error) { await s.close(env); throw error; }
}
async function preview(env, expected = 200) {
  const list = await env.owner.get(`/api/evidence?kind=${c.KINDS.proposals}`), entry = list.entries.find(item => item.artifact_id === env.proposed.proposal.id);
  return env.owner.post("/api/training-sessions/preview", { entry_id: entry.id, manifest: list.manifest_sha256 }, expected);
}
const input = value => ({ challenge_id: value.challenge_id, nonce: value.nonce, password: s.f.password, rationale: "Synthetic session registration only, not real USER consent.",
  acknowledge_session_only: true, displayed_review_sha256: value.displayed_review_sha256 });
const count = (env, kind) => force.load(env.options).manifest.artifacts.filter(entry => entry.kind === kind).length;
const configuration = env => ({ ...env.service.configuration, forceRegistryPublicKey: env.service.consent.publicKey() });
module.exports = { ...s, c, core, force, environment, preview, input, count, configuration };
