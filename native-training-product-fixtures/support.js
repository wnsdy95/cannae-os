const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const base = require("../disciplined-initiative-fixtures/support"), f = require("../force-registry-fixtures/support"), t = require("../task-training-contract");
const c = require("../native-training-product-contract"), core = require("../native-training-product-controller"), collector = require("../codex-training-product-collector");
const force = require("../force-registry-controller"), { writeRepositoryArtifact } = require("../repository-artifact-store");
async function environment(options = {}) {
  const env = base.environment(Date.now() - 180000);
  try {
    base.adopt(env); env.opened = require("../skill-mission-controller").openWave(env.plan, base.optionsAt(env, 70));
    env.stateDir = path.join(fs.realpathSync(env.root), "private");
    env.profile = { executable: path.join(__dirname, "fake-codex.js"), model: "synthetic-test-model", timeoutMs: 20000, maxOutputBytes: 131072 };
    env.configuration = { ...env.options, stateDir: env.stateDir, port: 4317, ...(options.operatorTraining ? { training: env.profile } : {}) };
    env.service = await require("../operator-console-server").createConsole(env.configuration); await env.service.app.ready();
    env.owner = f.client(env.service); await env.owner.session();
    await env.owner.post("/api/setup", { username: "owner", password: f.password, token: env.service.auth.createBootstrap() }); await env.owner.session();
    await f.enroll(env, f.organization()); env.standard = require("./contracts").standard();
    const write = writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: options.standardMission || env.plan.mission_id,
      waveId: env.plan.wave_id, kind: "capability-standards", artifactId: env.standard.id, payload: env.standard });
    env.standardRef = { artifact_id: env.standard.id, relative_path: write.relative_path, sha256: write.sha256 };
    env.capability = f.capability(env.standardRef, "CAP-NATIVE", [{ operational_role: env.plan.agents[0].operational_role, task: env.plan.agents[0].task }]);
    env.performer = f.performer("PERF-NATIVE"); Object.assign(env.performer.data, collector.preparePerformerCommitments(env.profile));
    await f.enroll(env, env.capability); await f.enroll(env, env.performer); env.registry = await env.owner.get("/api/force-registry");
    env.publicKey = env.service.consent.publicKey();
    // The legacy reference fixture exports a synthetic key; owner-path fixtures must use the authenticated producer.
    if (!options.operatorTraining) env.syntheticKey = env.service.auth.db.prepare("SELECT value FROM meta WHERE key='operator-signing-key'").get().value;
    env.stateRoot = path.join(fs.realpathSync(env.root), "native-collections"); fs.mkdirSync(env.stateRoot, { mode: 0o700 });
    const store = force.load(env.options), contexts = store.manifest.artifacts.filter(value => value.kind === "agent-context-packs");
    env.contextRef = force.ref(contexts.find(value => force.record(store, force.ref(value)).payload.agent_id === env.plan.agents[0].agent_id));
    return env;
  } catch (error) { await close(env); throw error; }
}
function prepare(env, mode = "success") {
  const now = Date.now(), proposed = core.propose({ collection_id: crypto.randomUUID(), mission_id: env.plan.mission_id, wave_id: env.plan.wave_id,
    capability_id: env.capability.id, performer_id: env.performer.id, registry_head_ref: env.registry.head_ref, context_ref: env.contextRef,
    case_id: `CASE-crawl-${mode}`, classification: "internal", created_at: new Date(now).toISOString(), expires_at: new Date(now + 600000).toISOString() }, env.options);
  const preview = core.prepareProduct({ ...env.options, requestId: proposed.request.id }, env.publicKey), invocation = collector.prepareInvocation(preview, env.profile);
  const consentAt = Date.now();
  const consent = require("../operator-consent-contract").signOperatorRecord({ schema_version: "0.1", type: "TrainingProductTransferConsent", id: crypto.randomUUID(),
    purpose: c.PURPOSE, invocation_sha256: invocation.invocation_sha256, principal_id: env.owner.storedSession().userId,
    created_at: new Date(consentAt).toISOString(), expires_at: new Date(consentAt + 120000).toISOString(), execution_authorized: false, release_authorized: false }, env.syntheticKey);
  return { proposed, preview, invocation, consent };
}
const configuration = env => ({ trustedPublicKey: env.publicKey, stateRoot: env.stateRoot });
async function close(env) { if (env.service) await env.service.app.close(); if (env.root) fs.rmSync(env.root, { recursive: true, force: true }); }
module.exports = { environment, prepare, close, configuration, c, core, collector, force, t, base, f };
