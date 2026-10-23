#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), { execFileSync } = require("node:child_process");
const artifactStore = require("./repository-artifact-store"), originalWrite = artifactStore.writeRepositoryArtifact;
let beforePublication = null;
artifactStore.writeRepositoryArtifact = options => { if (beforePublication) beforePublication(options); return originalWrite(options); };
const base = require("./disciplined-initiative-fixtures/support"), runner = require("./readiness-drop-revocation-runner");
const support = { ...base,
  admit(env, input, id, seconds = 100) {
    if (!env.legacy) return base.admit(env, input, id, seconds);
    return base.dispatch.admitToolRequest(base.optionsAt(env, seconds), env.actor, { hook_event_name: "PreToolUse",
      tool_name: "Bash", tool_use_id: id, tool_input: env.toolInput });
  },
  complete(env, input, id, seconds = 101) {
    if (!env.legacy) return base.complete(env, input, id, seconds);
    const stdout = execFileSync("git", ["status", "--short"], { cwd: env.options.repository, encoding: "utf8" });
    return base.dispatch.completeToolRequest(base.optionsAt(env, seconds), env.actor, { hook_event_name: "PostToolUse",
      tool_name: "Bash", tool_use_id: id, tool_input: env.toolInput, tool_response: { stdout } });
  }
};
const { validatePayload } = require("./validator-cli-prototype/validate");
const roots = [];
function environment(captured = false) {
  if (captured) { const env = support.environment(Date.now() - 180000); roots.push(env.root); return support.start(env); }
  const gateway = require("./protected-gateway-fixture-support").createGatewayFixtureSupport(); roots.push(gateway.temporaryRoot);
  const setup = gateway.setupScenario("READINESS-CASE");
  return { legacy: true, root: gateway.temporaryRoot, epoch: Date.parse("2026-07-24T01:00:00Z"),
    options: { repository: setup.repository, artifactRoot: gateway.artifactRoot }, plan: setup.plan, policy: setup.draft,
    actor: setup.identity, leaseId: setup.issued.lease_ref.artifact_id, toolInput: gateway.toolInput };
}
const historyEnvironment = () => { const env = support.environment(Date.now() - 180000); roots.push(env.root); return env; };
const ceilings = { T: { Green: "allow", Amber: "report_required", Red: "approval_required", Black: "prohibit" },
  P: { Green: "allow", Amber: "approval_required", Red: "approval_required", Black: "prohibit" },
  X: { Green: "draft_only", Amber: "draft_only", Red: "approval_required", Black: "prohibit" } };
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function drop(env, { previous = "T", next = "X", seconds = 102, mission = env.plan.mission_id, task = env.plan.agents[0].task,
  role = env.plan.agents[0].operational_role, mutate = () => {} } = {}) {
  const event = support.sample("readiness-event");
  Object.assign(event, { id: `RE-DROP-${seconds}`, mission_id: mission, task, agent_id: role, previous_rating: previous, new_rating: next,
    effective_at: support.optionsAt(env, seconds).now, evidence: ["Synthetic evaluator record one", "Synthetic evaluator record two", "Synthetic evaluator record three"] });
  event.authority_impact.roe_effects = ["Green", "Amber", "Red", "Black"].map(roe_class => ({ roe_class,
    previous_decision: ceilings[previous][roe_class], new_decision: ceilings[next][roe_class] }));
  mutate(event);
  return { event, ref: support.persist(env, "readiness-events", event, seconds, { missionId: mission }) };
}
const status = env => support.dispatch.dispatchStatus(env.options).leases.find(item => item.lease_id === env.leaseId);
try {
  check("actual next-call admission denies a retained exact-role/task drop and durably revokes the old grant", () => {
    const env = environment(true); assert.equal(support.admit(env, support.inputs.planned, "before").decision, "allow"); support.complete(env, support.inputs.planned, "before");
    drop(env); const denied = support.admit(env, support.inputs.safeguard, "after", 104);
    assert.equal(denied.decision, "deny"); assert.deepEqual(denied.reason_codes, ["READINESS_REQUALIFICATION_REQUIRED"]);
    assert.equal(status(env).status, "revoked"); assert(denied.readiness_checkpoint_ref);
    assert.throws(() => support.dispatch.completeLease(support.optionsAt(env, 105), env.leaseId), /READINESS_REQUALIFICATION_REQUIRED/);
    assert.throws(() => support.dispatch.issueLease(support.optionsAt(env, 105), env.policy.id, { sessionId: "new-session", providerAgentId: "main" }), /READINESS_REQUALIFICATION_REQUIRED/);
  });
  check("cross-mission evidence in this repository fences the same exact role/task instead of resetting at a mission boundary", () => {
    const env = environment(); drop(env, { mission: "MIS-OTHER" });
    const observed = runner.inspect(support.optionsAt(env, 104)); assert.equal(observed.affected_leases.length, 1);
    assert.equal(support.admit(env, support.inputs.planned, "cross-mission", 104).decision, "deny");
  });
  check("different tasks or roles do not borrow a demotion from the same repository", () => {
    for (const override of [{ task: "A genuinely different exact task" }, { role: "S6" }]) {
      const env = environment(); drop(env, override); assert.equal(runner.inspect(support.optionsAt(env, 104)).affected_leases.length, 0);
      assert.equal(support.admit(env, support.inputs.planned, "unaffected", 104).decision, "allow");
      support.complete(env, support.inputs.planned, "unaffected", 105);
    }
  });
  check("already admitted work remains collectable while readiness reconciliation blocks, then revokes only after settlement", () => {
    const env = environment(); assert.equal(support.admit(env, support.inputs.planned, "pending").decision, "allow"); drop(env);
    const first = runner.reconcile(support.optionsAt(env, 104)); assert.equal(first.results[0].status, "blocked");
    assert.equal(first.execution_authorized, false); assert.equal(first.release_authorized, false);
    const completed = support.complete(env, support.inputs.planned, "pending", 105); assert.equal(completed.status, "blocked"); assert.equal(completed.execution_authorized, false);
    const second = runner.reconcile(support.optionsAt(env, 106)); assert.equal(second.results[0].status, "revoked");
    assert.equal(runner.inspect(support.optionsAt(env, 107)).affected_leases.length, 0);
    const payload = support.read(env, second.artifact_ref), validation = validatePayload(payload, "readiness-drop-reconciliation");
    assert.equal(validation.valid, true); assert.equal(validation.can_execute, false);
    const changed = structuredClone(payload); changed.results[0].status = "blocked";
    assert(validatePayload(changed, "readiness-drop-reconciliation").issues.some(item => item.code === "READINESS_RECONCILIATION_ID_INVALID"));
  });
  check("a later schema-valid promotion never resurrects existing grants or substitutes for fresh requalification", () => {
    const env = environment(); drop(env, { next: "P" }); drop(env, { previous: "P", next: "T", seconds: 103 });
    assert.equal(support.admit(env, support.inputs.planned, "promotion-is-not-consent", 104).decision, "deny");
    assert.equal(status(env).status, "revoked");
  });
  check("forged actor, extra authority, future observations and conflicting progression fail closed", () => {
    for (const [index, mutate] of [event => { event.actor = "S3"; }, event => { event.execution_authorized = true; },
      event => { event.effective_at = new Date(Date.parse(event.effective_at) + 60000).toISOString(); }].entries()) {
      const env = historyEnvironment(); drop(env, { mutate });
      const store = require("./campaign-supervisor").loadVerifiedStore(env.options.repository, env.options.artifactRoot);
      assert.throws(() => runner.assessment(store, env.plan.agents[0], support.optionsAt(env, 104).now),
        new RegExp(`^Error: READINESS_HISTORY_${index === 2 ? "TIME" : "SCOPE"}_INVALID$`));
    }
    const env = environment(); drop(env, { next: "P" }); drop(env, { previous: "T", next: "X", seconds: 103 });
    assert.equal(support.admit(env, support.inputs.planned, "conflict", 104).reason_codes[0], "READINESS_HISTORY_TRANSITION_CONFLICT");
  });
  check("numeric timestamps preserve offset chronology and both wrappers reject caller clock or restore flags", () => {
    const env = environment(); drop(env, { next: "P", mutate: event => { event.id = "RE-Z-EARLY";
      event.effective_at = new Date(Date.parse(event.effective_at) + 9 * 3600000).toISOString().replace("Z", "+09:00"); } });
    drop(env, { previous: "P", next: "T", seconds: 103, mutate: event => { event.id = "RE-A-LATE"; } });
    for (const tree of ["codex-skills", ".claude/skills"]) {
      const wrapper = path.join(__dirname, tree, "controls-doctrine-operator/scripts/reconcile_controls_readiness.js");
      const args = ["inspect", "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot];
      assert.equal(JSON.parse(execFileSync(process.execPath, [wrapper, ...args], { encoding: "utf8", cwd: env.root })).affected_leases.length, 1);
      for (const flag of ["--at", "--restore"]) assert.throws(() => execFileSync(process.execPath, [wrapper, ...args, flag, "not-allowed"], { stdio: "pipe" }));
    }
  });
  check("manifest path sorting cannot fabricate a progression conflict or revoke unchanged T observations", () => {
    const env = environment(); drop(env, { previous: "T", next: "T", mutate: event => { event.id = "RE-Z-EARLY"; } });
    drop(env, { previous: "T", next: "T", seconds: 103, mutate: event => { event.id = "RE-A-LATE"; } });
    const admitted = support.admit(env, support.inputs.planned, "unchanged-observation", 104);
    assert.equal(admitted.decision, "allow"); support.complete(env, support.inputs.planned, "unchanged-observation", 105);
  });
  check("a readiness drop after gateway admission prevents the actual gateway begin without discharging ownership", () => {
    const gateway = require("./protected-gateway-fixture-support").createGatewayFixtureSupport(); roots.push(gateway.temporaryRoot);
    const setup = gateway.setupScenario("READINESS-DROP"), request = gateway.gatewayRequest(setup, "001");
    const api = require("./protected-tool-gateway"), options = gateway.trustedOptions(setup, request, "2026-07-24T01:00:10Z");
    assert.equal(api.admitGatewayRequest(options, request, gateway.toolInput).state, "authorized");
    const env = { epoch: Date.parse("2026-07-24T01:00:00Z"), options: { repository: setup.repository, artifactRoot: gateway.artifactRoot }, plan: setup.plan };
    drop(env, { seconds: 20 });
    assert.throws(() => api.beginGatewayExecution({ ...options, now: "2026-07-24T01:00:30Z" }, request.transaction_id),
      /Gateway authorization no longer matches active dispatch state: READINESS_REQUALIFICATION_REQUIRED/);
    assert.equal(api.gatewayStatus(options, { transactionId: request.transaction_id }).transactions[0].state, "authorized");
    assert.equal(support.dispatch.dispatchStatus(env.options).leases[0].unresolved_gateway_transactions, 1);
    const result = runner.reconcile({ ...env.options, now: "2026-07-24T01:00:31Z" });
    assert.equal(result.results[0].status, "blocked");
    assert.equal(support.dispatch.dispatchStatus(env.options).leases[0].unresolved_gateway_transactions, 1);
  });
  check("the gateway executing-event publication reappraises a newly introduced drop without starting the tool", () => {
    const gateway = require("./protected-gateway-fixture-support").createGatewayFixtureSupport(); roots.push(gateway.temporaryRoot);
    const setup = gateway.setupScenario("READINESS-PUBLICATION"), request = gateway.gatewayRequest(setup, "001");
    const api = require("./protected-tool-gateway"), options = gateway.trustedOptions(setup, request, "2026-07-24T01:00:10Z");
    assert.equal(api.admitGatewayRequest(options, request, gateway.toolInput).state, "authorized");
    const env = { epoch: Date.parse("2026-07-24T01:00:00Z"), options: { repository: setup.repository, artifactRoot: gateway.artifactRoot }, plan: setup.plan };
    let injected = false;
    beforePublication = write => { if (write.payload?.type === "ToolGatewayTransactionEvent" && write.payload.state === "executing") {
      beforePublication = null; drop(env, { seconds: 29 }); injected = true;
    } };
    try { assert.throws(() => api.beginGatewayExecution({ ...options, now: "2026-07-24T01:00:30Z" }, request.transaction_id),
      /Gateway publication no longer matches active dispatch state: READINESS_REQUALIFICATION_REQUIRED/); }
    finally { beforePublication = null; }
    assert.equal(injected, true); assert.equal(api.gatewayStatus(options, { transactionId: request.transaction_id }).transactions[0].state, "authorized");
  });
  check("dispatch admission publication cannot outrun a drop that appears after its first checks", () => {
    const env = environment(); let injected = false;
    beforePublication = write => { if (write.payload?.type === "ToolAdmissionEvent" && write.payload.decision === "allow") {
      beforePublication = null; drop(env, { seconds: 99 }); injected = true;
    } };
    try { assert.throws(() => support.admit(env, support.inputs.planned, "publication-race", 100),
      /Dispatch publication no longer matches active authority: READINESS_REQUALIFICATION_REQUIRED/); }
    finally { beforePublication = null; }
    assert.equal(injected, true); assert.equal(status(env).pending_tool_requests, 0);
    assert.equal(support.admit(env, support.inputs.planned, "after-publication-denial", 104).decision, "deny");
    assert.equal(status(env).status, "revoked");
  });
  console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0,
    cross_mission_capability_registry_complete: false, qualified_readiness_proven: false, release_authorized: false }, null, 2));
} finally { beforePublication = null; artifactStore.writeRepositoryArtifact = originalWrite; for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); }
