#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const artifacts = require("./repository-artifact-store");
const originalWrite = artifacts.writeRepositoryArtifact;
let beforePublication = null;
artifacts.writeRepositoryArtifact = options => {
  if (beforePublication) beforePublication(options);
  return originalWrite(options);
};
const { stopCampaign, stopDecisionOption } = require("./campaign-stop-controller");
const runtime = require("./dispatch-runtime-controller");
const originalHistoricalProjection = runtime.historicalDispatchStatus;
let afterHistoricalProjection = null;
runtime.historicalDispatchStatus = (...args) => {
  const result = originalHistoricalProjection(...args);
  if (afterHistoricalProjection) afterHistoricalProjection();
  return result;
};
const { campaignTerminalStatus, reconcileCampaignTerminal } = require("./campaign-terminal-controller");
const { openWave, recordWave, closeWave, terminateWave } = require("./skill-mission-controller");
const { historicalDispatchStatus } = require("./dispatch-runtime-controller");
const { superviseCampaign } = require("./campaign-supervisor");
const { validatePayload } = require("./validator-cli-prototype/validate");
const NONE = { artifact_id: "none", relative_path: "none", sha256: "none" };
const roots = [];
let passed = 0;
const sample = name => JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", `valid-${name}.json`), "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function git(repository, ...args) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
}
function environment(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-terminal-"));
  roots.push(root);
  const repository = path.join(root, "repo");
  const artifactRoot = path.join(root, "artifacts");
  fs.mkdirSync(repository);
  git(repository, "init", "-q"); git(repository, "config", "user.name", "Fixture"); git(repository, "config", "user.email", "fixture@example.com");
  fs.writeFileSync(path.join(repository, "README.md"), "Terminal fixture\n");
  git(repository, "add", "README.md"); git(repository, "commit", "-qm", "fixture");
  const identity = artifacts.resolveRepository(repository);
  const now = new Date(Date.now() + 10000).toISOString();
  const created = new Date(Date.now() - 60000).toISOString();
  const options = { repository, artifactRoot, doctrineRoot: __dirname, now };
  const campaign = sample("self-improvement-campaign");
  Object.assign(campaign, { id: `SIC-${name}`, mission_id: `MIS-${name}`, created_at: created,
    repository_binding: { repository_key: identity.key, identity_fingerprint: identity.identity_fingerprint, baseline_revision: identity.head_commit } });
  const env = { root, options, campaign, identity, now, created };
  env.campaignRef = persist(env, campaign, "self-improvement-campaigns", "C0", created);
  return env;
}
function persist(env, payload, kind, wave = "C0", time = env.now) {
  const result = artifacts.writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
    missionId: env.campaign.mission_id, waveId: wave, kind, artifactId: payload.id, payload, createdAt: time });
  return { artifact_id: payload.id, relative_path: result.relative_path, sha256: result.sha256 };
}
function stop(env) {
  const request = { schema_version: "0.1", type: "CampaignStopRequest", mission_id: env.campaign.mission_id,
    campaign_ref: env.campaignRef, decision_ref: NONE, reason: "Fixture USER stops work; preserve all admitted outcomes." };
  const decision = sample("decision-log");
  Object.assign(decision, { id: "DL-Terminal-Stop", mission_id: env.campaign.mission_id, decided_at: env.now,
    decision_maker: "USER", decision_type: "scope", status: "complete", chosen_option: stopDecisionOption(request),
    authority_basis: { basis_type: "retained_authority", reference: env.campaign.id, summary: "Synthetic exact fixture grant." },
    affected_artifacts: [env.campaignRef.relative_path] });
  decision.options_considered = [decision.chosen_option];
  request.decision_ref = persist(env, decision, "decision-logs");
  const stopped = stopCampaign(request, env.options);
  env.request = { schema_version: "0.1", type: "CampaignTerminalRequest", mission_id: env.campaign.mission_id,
    campaign_ref: env.campaignRef, stop_ref: stopped.record_ref };
  return env.request;
}
function plan(env, wave = "W1") {
  const value = sample("mission-wave-plan");
  Object.assign(value, { id: `MWP-${wave}`, mission_id: env.campaign.mission_id, wave_id: wave,
    created_at: env.created, valid_until: new Date(Date.parse(env.now) + 60000).toISOString() });
  value.adaptive_work.enabled = false;
  value.adaptive_work.campaign_id = env.campaign.id;
  return value;
}
function expire(env, value, planRef) {
  env.now = new Date(Date.parse(value.valid_until) + 1000).toISOString(); env.options.now = env.now;
  return terminateWave({ schema_version: "0.1", type: "MissionWaveTerminationRequest", mission_id: value.mission_id, wave_id: value.wave_id,
    status: "expired", reason: "Do not claim success for abandoned work.", plan_ref: planRef, successor_plan_ref: NONE, decision_ref: NONE }, env.options);
}
function manifest(env) {
  return JSON.parse(fs.readFileSync(path.join(env.options.artifactRoot, "repositories", env.identity.key, "manifest.json"), "utf8"));
}

try {
  check("an empty stopped campaign reconciles once without granting execution or success", () => {
    const env = environment("Empty"); stop(env);
    assert.strictEqual(campaignTerminalStatus(env.request, env.options).status, "ready_for_reconciliation");
    const result = reconcileCampaignTerminal(env.request, env.options);
    assert.strictEqual(validatePayload(result.record, "campaign-terminal-record").valid, true);
    assert.strictEqual(result.record.settlement_complete, true);
    assert.strictEqual(result.record.execution_completion_claimed, false);
    assert.strictEqual(result.continuation_authorized, false);
    assert.strictEqual(result.release_authorized, false);
    assert.strictEqual(reconcileCampaignTerminal(env.request, env.options).existing, true);
    assert.strictEqual(campaignTerminalStatus(env.request, env.options).status, "known_obligations_settled");
    assert.strictEqual(superviseCampaign({ ...env.options, repositoryPath: env.options.repository, campaignId: env.campaign.id,
      evaluatedAt: env.now }).order.execution_authorized, false);
  });
  check("missing stop, wrong mission and substituted campaign references fail closed", () => {
    const env = environment("Scope"); stop(env);
    for (const request of [{ ...env.request, stop_ref: { ...env.request.stop_ref, sha256: "a".repeat(64) } },
      { ...env.request, mission_id: "MIS-Other" }, { ...env.request, campaign_ref: { ...env.campaignRef, sha256: "b".repeat(64) } }]) {
      assert.throws(() => reconcileCampaignTerminal(request, env.options), /EXACT_STOP_REQUIRED|REFERENCE/);
    }
  });
  check("partial non-adaptive waves block until an authentic expiry termination is retained", () => {
    const env = environment("Partial");
    const value = plan(env);
    const planRef = persist(env, value, "mission-wave-plans", value.wave_id, env.created);
    stop(env);
    assert.throws(() => reconcileCampaignTerminal(env.request, env.options), /WAVE_NOT_DISPOSED/);
    expire(env, value, planRef);
    const result = reconcileCampaignTerminal(env.request, env.options);
    assert.strictEqual(result.record.inventory.waves.length, 1);
    assert.strictEqual(result.record.inventory.waves[0].status, "expired");
    assert.strictEqual(reconcileCampaignTerminal(env.request, env.options).existing, true);
  });
  check("a retained stop is not an early-abort USER grant", () => {
    const env = environment("Abort"); const value = plan(env);
    const planRef = persist(env, value, "mission-wave-plans", value.wave_id, env.created); stop(env);
    assert.throws(() => terminateWave({ schema_version: "0.1", type: "MissionWaveTerminationRequest", mission_id: value.mission_id,
      wave_id: value.wave_id, status: "aborted", reason: "Invalid reuse", plan_ref: planRef, successor_plan_ref: NONE,
      decision_ref: env.request.stop_ref }, env.options), /Manifest does not contain/);
  });
  check("a forged termination cannot replace exact historical inventory", () => {
    const env = environment("Forged"); const value = plan(env);
    const planRef = persist(env, value, "mission-wave-plans", value.wave_id, env.created); stop(env);
    const sampleValue = sample("mission-wave-termination");
    env.now = new Date(Date.parse(value.valid_until) + 1000).toISOString(); env.options.now = env.now;
    Object.assign(sampleValue, { id: "MWT-Forged", mission_id: value.mission_id, wave_id: value.wave_id, status: "expired",
      plan_ref: planRef, plan_valid_until: value.valid_until, retained_artifact_refs: [planRef], terminated_at: env.now,
      request_sha256: "a".repeat(64), successor_plan_ref: NONE, decision_ref: NONE });
    persist(env, sampleValue, "mission-wave-terminations", value.wave_id);
    assert.throws(() => reconcileCampaignTerminal(env.request, env.options), /TERMINATION_REQUEST_MISMATCH/);
  });
  check("an exact independent USER abort is replayed without reusing campaign stop consent", () => {
    const env = environment("Exact-Abort"); const value = plan(env);
    const planRef = persist(env, value, "mission-wave-plans", value.wave_id, env.created); stop(env);
    const request = { schema_version: "0.1", type: "MissionWaveTerminationRequest", mission_id: value.mission_id, wave_id: value.wave_id,
      status: "aborted", reason: "Explicit fixture wave abort.", plan_ref: planRef, successor_plan_ref: NONE, decision_ref: NONE };
    const decision = sample("decision-log");
    Object.assign(decision, { id: "DL-Exact-Abort", mission_id: value.mission_id, decided_at: env.now, decision_type: "scope",
      decision_maker: "USER", status: "complete", chosen_option: `terminate:aborted:${planRef.sha256}:none`,
      authority_basis: { basis_type: "retained_authority", reference: value.id, summary: "Synthetic separate wave abort consent." },
      affected_artifacts: [planRef.relative_path] });
    decision.options_considered = [decision.chosen_option];
    request.decision_ref = persist(env, decision, "decision-logs", value.wave_id);
    terminateWave(request, env.options);
    assert.strictEqual(reconcileCampaignTerminal(env.request, env.options).record.inventory.waves[0].status, "aborted");
  });
  for (const state of ["active", "pending", "unknown", "late-completed", "orphan-checkpoint", "orphan-gateway"]) {
    check(`a wave termination cannot hide later ${state} obligations`, () => {
      const env = environment(`Dispatch-${state}`); const value = plan(env);
      const planRef = persist(env, value, "mission-wave-plans", value.wave_id, env.created); stop(env);
      expire(env, value, planRef);
      if (state === "orphan-gateway") {
        const request = sample("tool-gateway-request");
        Object.assign(request, { mission_id: value.mission_id, wave_id: value.wave_id });
        persist(env, request, "tool-gateway-requests", value.wave_id);
        assert.throws(() => reconcileCampaignTerminal(env.request, env.options), /REFERENCE_NOT_RETAINED/);
        return;
      }
      const lease = sample("agent-dispatch-lease");
      Object.assign(lease, { mission_id: value.mission_id, wave_id: value.wave_id, plan_ref: planRef,
        repository_binding: { repository_key: env.identity.key, identity_fingerprint: env.identity.identity_fingerprint } });
      const policy = sample("dispatch-tool-policy");
      Object.assign(policy, { mission_id: value.mission_id, wave_id: value.wave_id });
      lease.tool_policy_ref = persist(env, policy, "dispatch-tool-policies", value.wave_id);
      const leaseRef = state === "orphan-checkpoint" ? { artifact_id: lease.id, relative_path: "missing.json", sha256: "a".repeat(64) }
        : persist(env, lease, "agent-dispatch-leases", value.wave_id);
      const baseline = sample("agent-execution-checkpoint");
      Object.assign(baseline, { mission_id: value.mission_id, wave_id: value.wave_id, lease_ref: leaseRef,
        agent_id: lease.agent_id, provider: lease.provider, session_binding: lease.session_binding });
      const baselineRef = persist(env, baseline, "agent-execution-checkpoints", value.wave_id);
      if (state === "late-completed") persist(env, { ...baseline, id: "AEC-Late-Completed", sequence: 1, previous_checkpoint_ref: baselineRef,
        checkpoint_kind: "completion", lease_status: "completed", recorded_at: env.now }, "agent-execution-checkpoints", value.wave_id);
      if (["pending", "unknown"].includes(state)) {
        const admission = sample("tool-admission-event");
        Object.assign(admission, { mission_id: value.mission_id, wave_id: value.wave_id, lease_ref: leaseRef, checkpoint_ref: baselineRef,
          tool_policy_ref: lease.tool_policy_ref, agent_id: lease.agent_id, provider: lease.provider, session_binding: lease.session_binding });
        const admissionRef = persist(env, admission, "tool-admission-events", value.wave_id);
        const terminal = { ...baseline, id: "AEC-Legacy-Terminal", sequence: 1, previous_checkpoint_ref: baselineRef,
          checkpoint_kind: state === "unknown" ? "post_tool" : "revocation", lease_status: state === "unknown" ? "blocked" : "revoked",
          recorded_at: env.now };
        if (state === "unknown") Object.assign(terminal, { tool_admission_ref: admissionRef,
          execution_result: { status: "failed", provider_result_sha256: "a".repeat(64), external_effects: "unknown" } });
        persist(env, terminal, "agent-execution-checkpoints", value.wave_id);
      }
      assert.throws(() => reconcileCampaignTerminal(env.request, env.options),
        state === "orphan-checkpoint" ? /REFERENCE_NOT_RETAINED/ : state === "late-completed" ? /POST_DISPOSITION_AUTHORITY/ : /DISPATCH_NOT_SETTLED/);
    });
  }
  check("blocked closeouts are terminal dispositions, never success claims", () => {
    const env = environment("Closeout"); const value = plan(env);
    const opened = openWave(value, env.options);
    const report = { schema_version: "0.1", type: "MissionWaveReport", id: "MWR-Terminal", mission_id: value.mission_id,
      wave_id: value.wave_id, plan_ref: opened.plan_ref, routing_preflight_ref: opened.routing_preflight_ref,
      agent_results: value.agents.map(agent => ({ agent_id: agent.agent_id,
        context_pack_ref: opened.context_packs.find(item => item.agent_id === agent.agent_id).context_pack_ref,
        status: "blocked", summary: "Work was not executed.", completed_actions: [], blockers: ["Awaiting input."], evidence_refs: [],
        improvement_candidates: [], next_actions: ["Preserve the blocked result."] })),
      wave_status: "blocked", human_decisions_required: [], release_requested: false, recorded_at: env.now };
    recordWave(report, env.options);
    const aar = sample("aar"); aar.mission_id = value.mission_id;
    closeWave(aar, { ...env.options, missionId: value.mission_id, waveId: value.wave_id });
    stop(env);
    const result = reconcileCampaignTerminal(env.request, env.options);
    assert.strictEqual(result.record.inventory.waves[0].status, "blocked_pending_execution");
    assert.strictEqual(result.record.execution_completion_claimed, false);
  });
  check("later mission history invalidates current terminal status and creates a new immutable record", () => {
    const env = environment("Freshness"); stop(env);
    const first = reconcileCampaignTerminal(env.request, env.options);
    persist(env, { id: "NOTE-New", detail: "Additional retained handoff evidence." }, "notes");
    assert.strictEqual(campaignTerminalStatus(env.request, env.options).settlement_complete, false);
    const next = reconcileCampaignTerminal(env.request, env.options);
    assert.notStrictEqual(next.record.id, first.record.id);
    assert.strictEqual(next.existing, false);
  });
  check("status cannot present a stale terminal inventory after a concurrent wave appears", () => {
    const env = environment("Status-Race"); stop(env);
    reconcileCampaignTerminal(env.request, env.options);
    afterHistoricalProjection = () => {
      afterHistoricalProjection = null;
      persist(env, plan(env, "W2"), "mission-wave-plans", "W2");
    };
    assert.throws(() => campaignTerminalStatus(env.request, env.options), /CAMPAIGN_TERMINAL_STATUS_CHANGED/);
  });
  check("a completed wave replays real report-bound control receipts without rerunning them", () => {
    const env = environment("Completed"); const value = plan(env);
    value.title = "Research public sources"; value.objective = value.title;
    value.agents = [{ ...value.agents[0], task: value.title }];
    const opened = openWave(value, env.options);
    const evidence = persist(env, { id: "OUT-Research", summary: "Synthetic fixture research result." }, "deliverables", value.wave_id);
    const report = { schema_version: "0.1", type: "MissionWaveReport", id: "MWR-Completed", mission_id: value.mission_id,
      wave_id: value.wave_id, plan_ref: opened.plan_ref, routing_preflight_ref: opened.routing_preflight_ref,
      agent_results: [{ agent_id: value.agents[0].agent_id, context_pack_ref: opened.context_packs[0].context_pack_ref,
        status: "complete", summary: "Synthetic result with real controls.", completed_actions: ["Compiled fixture evidence."], blockers: [],
        evidence_refs: [evidence], improvement_candidates: [], next_actions: ["Retain the result."] }],
      wave_status: "complete", human_decisions_required: [], release_requested: false, recorded_at: env.now };
    const admitted = recordWave(report, env.options);
    assert(admitted.control_receipt_refs.length > 0);
    const aar = sample("aar"); aar.mission_id = value.mission_id;
    env.now = new Date(Math.max(Date.now() + 1000, Date.parse(env.now) + 1000)).toISOString(); env.options.now = env.now;
    closeWave(aar, { ...env.options, missionId: value.mission_id, waveId: value.wave_id });
    stop(env);
    const result = reconcileCampaignTerminal(env.request, env.options);
    assert(result.record.inventory.retained_artifact_refs.some(item => item.artifact_id === admitted.control_receipt_refs[0].artifact_id));
    assert.strictEqual(reconcileCampaignTerminal(env.request, env.options).existing, true);
  });
  check("historical replay never imports a later wave or accepts an invented prefix", () => {
    const env = environment("Replay"); stop(env);
    const original = manifest(env);
    const observed = { revision: original.manifest_revision, sha256: artifacts.manifestDigest(original) };
    const first = historicalDispatchStatus(env.options, observed);
    persist(env, plan(env, "W2"), "mission-wave-plans", "W2");
    assert.deepStrictEqual(historicalDispatchStatus(env.options, observed), first);
    assert.throws(() => historicalDispatchStatus(env.options, { ...observed, sha256: "f".repeat(64) }), /HISTORY_MISMATCH/);
    assert.throws(() => reconcileCampaignTerminal(env.request, env.options), /WAVE_NOT_DISPOSED/);
  });
  for (const skill of ["codex-skills", ".claude/skills"]) check(`${skill} terminal wrapper operates outside the doctrine checkout`, () => {
    const env = environment(skill === "codex-skills" ? "Codex" : "Claude");
    env.now = new Date().toISOString(); env.options.now = env.now;
    stop(env);
    const requestPath = path.join(env.root, "terminal.json"); fs.writeFileSync(requestPath, JSON.stringify(env.request));
    const script = path.join(__dirname, skill, "controls-doctrine-operator/scripts/reconcile_controls_campaign.js");
    for (const command of ["reconcile", "status"]) {
      const run = spawnSync(process.execPath, [script, command, "--request", requestPath, "--repository", env.options.repository,
        "--artifact-root", env.options.artifactRoot], { cwd: os.tmpdir(), encoding: "utf8" });
      assert.strictEqual(run.status, 0, run.stderr);
      const result = JSON.parse(run.stdout);
      assert.strictEqual(result.execution_authorized, false);
      assert.strictEqual(result.continuation_authorized, false);
      if (command === "status") assert.strictEqual(result.settlement_complete, true);
    }
  });
  for (const race of ["wave", "clock", "unrelated"]) check(`terminal publication rejects ${race} races`, () => {
    const env = environment(`Race-${race}`); stop(env);
    beforePublication = descriptor => {
      if (descriptor.kind !== "campaign-terminal-records") return;
      beforePublication = null;
      if (race === "wave") persist(env, plan(env, "W2"), "mission-wave-plans", "W2");
      else if (race === "clock") env.options.now = new Date(Date.parse(env.now) - 1).toISOString();
      else persist(env, { id: "NOTE-Race", note: "Concurrent writer." }, "notes");
    };
    assert.throws(() => reconcileCampaignTerminal(env.request, env.options), /WAVE_NOT_DISPOSED|CLOCK_ROLLBACK|INVENTORY_CHANGED/);
    assert(!manifest(env).artifacts.some(item => item.kind === "campaign-terminal-records"));
  });
  for (const stage of ["prepared", "artifact_written", "history_created", "manifest_committed"]) {
    check(`terminal recovery preserves exact historical publication at ${stage}`, () => {
      const env = environment(`Crash-${stage}`); stop(env);
      let fired = false;
      beforePublication = descriptor => {
        if (descriptor.kind !== "campaign-terminal-records") return;
        beforePublication = null;
        fired = true;
        descriptor.faultInjectionStage = stage;
      };
      assert.throws(() => reconcileCampaignTerminal(env.request, env.options), /Injected artifact transaction failure/);
      assert(fired, stage);
      const recovered = artifacts.verifyRepositoryArtifacts({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, recover: true });
      assert.strictEqual(recovered.valid, true, JSON.stringify(recovered.issues));
      const retry = reconcileCampaignTerminal(env.request, env.options);
      assert.strictEqual(retry.existing, stage !== "prepared");
      assert.strictEqual(retry.record.settlement_complete, true);
      assert.strictEqual(campaignTerminalStatus(env.request, env.options).settlement_complete, true);
    });
  }
  console.log(JSON.stringify({ passed, failed: 0 }, null, 2));
} finally {
  beforePublication = null;
  afterHistoricalProjection = null;
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}
