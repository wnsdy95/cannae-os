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
  const value = await env.owner.post("/api/training-sessions/preview", { entry_id: entry.id, manifest: list.manifest_sha256 }, expected);
  if (value.challenge_id) env.lastTrainingPreview = value;
  return value;
}
function challengeObservation(env) {
  try {
    const p = env.lastTrainingPreview, now = Date.now(); if (!p) return { available: false };
    const row = env.service.auth.db.prepare("SELECT * FROM operator_training_sessions WHERE id=?").get(p.challenge_id), session = env.owner.storedSession();
    const hash = value => require("node:crypto").createHash("sha256").update(value).digest("hex");
    return { available: true, observed_at: new Date(now).toISOString(), row_exists: !!row, state: row?.state,
      milliseconds_since_created: row ? now - row.created : null, milliseconds_until_expiry: row ? row.expires - now : null,
      principal_matches: row?.principal_id === session.userId, epoch_matches: row?.epoch === session.epoch,
      session_matches: row?.session_hash === hash(session.sessionId), correct_nonce_matches: row?.nonce_hash === hash(p.nonce) };
  } catch { return { available: false }; }
}
const input = value => ({ challenge_id: value.challenge_id, nonce: value.nonce, password: s.f.password, rationale: "Synthetic session registration only, not real USER consent.",
  acknowledge_session_only: true, displayed_review_sha256: value.displayed_review_sha256 });
const count = (env, kind) => force.load(env.options).manifest.artifacts.filter(entry => entry.kind === kind).length;
const configuration = env => ({ ...env.service.configuration, forceRegistryPublicKey: env.service.consent.publicKey() });
module.exports = { ...s, c, core, force, environment, preview, input, count, configuration, challengeObservation };
