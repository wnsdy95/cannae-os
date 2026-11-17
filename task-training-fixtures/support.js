const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const base = require("../disciplined-initiative-fixtures/support"), f = require("../force-registry-fixtures/support");
const c = require("../task-training-contract"), { signOperatorRecord } = require("../operator-consent-contract");
const { createConsole } = require("../operator-console-server"), { openWave } = require("../skill-mission-controller");
const { writeRepositoryArtifact, writeRepositoryFileArtifact } = require("../repository-artifact-store");
const core = require("../task-training-controller");
const standard = task => require("./contracts").standard(Date.now(), task);
function persist(env, kind, payload, now = new Date().toISOString()) {
  const item = writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
    missionId: env.plan.mission_id, waveId: env.plan.wave_id, kind, artifactId: payload.id, payload, createdAt: now });
  return { artifact_id: payload.id, relative_path: item.relative_path, sha256: item.sha256 };
}
function output(env, text, id = "OUT-TRAINING") {
  const file = path.join(env.root, `${id}.txt`); fs.writeFileSync(file, text);
  const item = writeRepositoryFileArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
    missionId: env.plan.mission_id, waveId: env.plan.wave_id, kind: "task-training-observed-outputs", artifactId: id, sourcePath: file });
  return { artifact_id: id, relative_path: item.relative_path, sha256: item.sha256 };
}
async function environment({ syntheticBinding = true } = {}) {
  const env = base.environment(Date.now() - 180000);
  try {
    base.adopt(env); env.opened = openWave(env.plan, base.optionsAt(env, 70)); env.policy = env.policies[0];
    base.dispatch.authorizeDispatchPolicy(base.optionsAt(env, 80), env.policy);
    env.stateDir = path.join(fs.realpathSync(env.root), "private");
    env.service = await createConsole({ ...env.options, stateDir: env.stateDir, port: 4317 }); await env.service.app.ready();
    env.owner = f.client(env.service); await env.owner.session();
    await env.owner.post("/api/setup", { username: "owner", password: f.password, token: env.service.auth.createBootstrap() }); await env.owner.session();
    await f.enroll(env, f.organization()); env.standard = standard();
    const standardRef = persist(env, "capability-standards", env.standard);
    env.capability = f.capability(standardRef, "CAP-TRAINING", [{ operational_role: env.plan.agents[0].operational_role, task: env.plan.agents[0].task }]);
    env.performer = f.performer("PERF-TRAINING");
    await f.enroll(env, env.capability); await f.enroll(env, env.performer);
    env.registry = await env.owner.get("/api/force-registry");
    env.actor = { missionId: env.plan.mission_id, waveId: env.plan.wave_id, agentId: env.policy.agent_id,
      provider: "codex", sessionId: "training-session", providerAgentId: "main" };
    env.issued = base.dispatch.issueLease({ ...env.options, now: new Date().toISOString() }, env.policy.id,
      { sessionId: env.actor.sessionId, providerAgentId: env.actor.providerAgentId }); env.leaseId = env.issued.lease_ref.artifact_id;
    env.publicKey = env.service.consent.publicKey();
    if (!syntheticBinding) return env;
    // Synthetic controller evidence only. A real owner-session issuance ceremony is not implemented here.
    const key = env.service.auth.db.prepare("SELECT value FROM meta WHERE key='operator-signing-key'").get().value;
    env.syntheticPrivateKey = key;
    env.publicKey = crypto.createPublicKey(key).export({ type: "spki", format: "pem" });
    const at = Date.now(), body = { schema_version: "0.1", type: "TaskTrainingSessionBinding", id: "TSB-SYNTHETIC",
      purpose: "task_training_session_binding", capability_id: env.capability.id, capability_version: env.capability.version,
      performer_id: env.performer.id, performer_version: env.performer.version, configuration_sha256: c.digest(env.performer.data),
      stage: "crawl", case_ids: ["CASE-crawl-0", "CASE-crawl-1", "CASE-crawl-2"],
      lease_ref: env.issued.lease_ref, provider: "codex", session_binding: { session_id: env.actor.sessionId, provider_agent_id: "main" },
      principal_id: env.owner.storedSession().userId, principal_epoch: 1, authentication_method: "local_owner_password_reauthentication",
      created_at: new Date(at).toISOString(), expires_at: new Date(at + 600000).toISOString(), model_identity_attested: false, ...c.FLAGS };
    env.binding = c.checked(signOperatorRecord(body, key), "task-training-session-binding");
    env.bindingRef = persist(env, "task-training-session-bindings", env.binding);
    return env;
  } catch (error) { if (env.service) await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); throw error; }
}
function observe(env) {
  const options = () => ({ ...env.options, now: new Date().toISOString() });
  const before = base.dispatch.admitToolRequest(options(), env.actor, base.hook(env, base.inputs.planned, "training-call")); assert.equal(before.decision, "allow");
  const content = fs.readFileSync(path.join(env.options.repository, "README.md"), "utf8");
  const hook = { hook_event_name: "PostToolUse", tool_use_id: "training-call", tool_name: "Read", tool_input: base.inputs.planned, tool_response: { content } };
  env.completion = base.dispatch.completeToolRequest(options(), env.actor, hook); assert.equal(env.completion.status, "active");
  const second = base.dispatch.admitToolRequest(options(), env.actor, base.hook(env, base.inputs.safeguard, "training-verify")); assert.equal(second.decision, "allow");
  base.dispatch.completeToolRequest(options(), env.actor, { ...base.hook(env, base.inputs.safeguard, "training-verify", "PostToolUse"), tool_response: { content } });
  assert.equal(base.dispatch.completeLease(options(), env.leaseId).status, "completed");
  const resultRef = persist(env, "task-training-completion-inputs", c.completionInput(hook)), outputRef = output(env, content);
  env.request = c.trial({ mission_id: env.plan.mission_id, wave_id: env.plan.wave_id, capability_id: env.capability.id,
    performer_id: env.performer.id, registry_head_ref: env.registry.head_ref, case_id: "CASE-crawl-0", session_binding_ref: env.bindingRef,
    lease_ref: env.issued.lease_ref, completion_ref: env.completion.checkpoint_ref, completion_input_ref: resultRef, observed_output_ref: outputRef });
  return env;
}
async function close(env) { if (env.service) await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); }
module.exports = { c, f, base, core, standard, persist, output, environment, observe, close };
