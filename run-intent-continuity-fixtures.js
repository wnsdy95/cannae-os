#!/usr/bin/env node
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const artifacts = require("./repository-artifact-store");
const originalWrite = artifacts.writeRepositoryArtifact;
let legacyProducer = false;
artifacts.writeRepositoryArtifact = options => {
  if (legacyProducer && options.kind === "agent-context-packs") {
    const payload = { ...options.payload, schema_version: "0.3" }; delete payload.intent_assignment;
    return originalWrite({ ...options, payload });
  }
  return originalWrite(options);
};
const s = require("./intent-continuity-fixtures/support");
const intent = require("./intent-continuity-contract");
const { analyzeIntentContinuity } = require("./intent-continuity-runner");
const { validatePayload, validateSchemaPayload } = require("./validator-cli-prototype/validate");
const { openWave, recordWave } = require("./skill-mission-controller");
const dispatch = require("./dispatch-runtime-controller");
const roots = [];
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
function env() { const value = s.environment(Date.now() + 3600000); roots.push(value.root); return value; }
function checked(plan, expectedCode) {
  const result = validatePayload(plan, "mission-wave-plan");
  assert.equal(result.valid, !expectedCode, JSON.stringify(result.issues));
  if (expectedCode) assert(result.issues.some(issue => issue.code === expectedCode), JSON.stringify(result.issues));
  return result;
}
function hookIdentity(value, policy, sessionId) {
  return { missionId: value.plan.mission_id, waveId: value.plan.wave_id, agentId: policy.agent_id,
    provider: "codex", sessionId, providerAgentId: "main" };
}
function hook(value, identity, toolUseId) {
  return { session_id: identity.sessionId, cwd: value.options.repository, hook_event_name: "PreToolUse",
    tool_name: "Bash", tool_use_id: toolUseId, tool_input: value.toolInput };
}
try {
  check("default and multi-echelon scopes preserve exact commitments without copying sibling task text", () => {
    const plan = s.fixturePlan(), before = JSON.stringify(plan); checked(plan);
    const flat = intent.assignmentForPlan(plan, plan.agents[0].agent_id);
    assert.equal(JSON.stringify(plan), before); assert.equal(flat.lineage.length, 2);
    assert.equal(flat.lineage[0].agent_id, "USER");
    assert.equal(flat.lineage.at(-1).key_tasks.length, plan.agents.length);
    assert(!JSON.stringify(flat).includes(plan.agents[1].task));
    const nested = s.nested(plan); checked(nested);
    assert.equal(intent.assignmentForPlan(nested, nested.agents.at(-1).agent_id).lineage.length, plan.agents.length + 1);
    const projection = analyzeIntentContinuity(nested);
    assert.equal(projection.status, "ready"); assert.equal(projection.execution_authorized, false);
    assert.equal(validatePayload(projection, "intent-continuity-projection").can_execute, false);
  });
  check("each echelon rejects omitted task commitments, changed purpose, constraints and end conditions", () => {
    for (const field of ["key_tasks", "end_state", "failure_to_avoid", "constraints", "purpose"]) {
      const plan = s.nested(s.fixturePlan()), child = plan.intent_continuity.intents.at(-1);
      if (field === "purpose") child.purpose = "A different objective";
      else if (field === "key_tasks") child.key_tasks.pop();
      else child[field] = ["Different retained requirement"];
      checked(plan, "INTENT_INHERITANCE_LOST");
      assert.equal(analyzeIntentContinuity(plan).status, "blocked");
    }
    const plan = s.nested(s.fixturePlan()); plan.intent_continuity.intents[0].key_tasks[0].task_sha256 = "0".repeat(64);
    checked(plan, "INTENT_ROOT_OR_ROSTER_MISMATCH");
  });
  check("cycles, missing or duplicate parents, changed scope and unrostered identities fail closed", () => {
    for (const mutation of ["cycle", "missing", "duplicate", "scope", "roster", "root-identity"]) {
      const plan = s.nested(s.fixturePlan()), tree = plan.intent_continuity, first = tree.intents[1], last = tree.intents.at(-1);
      if (mutation === "cycle") {
        first.parent_intent_id = last.id; tree.delegations[0] = intent.delegation(last, first);
      } else if (mutation === "missing") last.parent_intent_id = "INT-MISSING";
      else if (mutation === "duplicate") tree.delegations.push(s.clone(tree.delegations[0]));
      else if (mutation === "scope") last.wave_id = "ANOTHER";
      else if (mutation === "roster") last.agent_id = "unrostered-agent";
      else tree.intents[0].id = "INT-SUBSTITUTED-ROOT";
      assert.equal(validatePayload(plan, "mission-wave-plan").valid, false, mutation);
    }
  });
  check("an absent, approval-required or prohibited parent action never becomes a child's Green action", () => {
    for (const grade of ["absent", "red", "black"]) {
      const plan = s.fixturePlan(), parent = plan.agents[0], action = plan.agents[1].allowed_actions[1];
      parent.allowed_actions = [parent.allowed_actions[0]];
      if (grade === "red") parent.approval_required.push(action);
      if (grade === "black") parent.prohibited_actions.push(action);
      checked(s.nested(plan), "INTENT_AUTHORITY_WIDENED");
    }
    const plan = s.fixturePlan(); plan.agents[0].approval_required.push(plan.agents[0].allowed_actions[0]);
    checked(plan, "INTENT_AGENT_BOUNDARY_CONFLICT");
  });
  check("schema and semantic validation reject root confusion, extra fields and substituted delegation", () => {
    const plan = s.nested(s.fixturePlan()), tree = plan.intent_continuity;
    for (const [type, payload] of [["commander-intent", tree.intents[0]], ["intent-delegation-event", tree.delegations[0]]]) {
      for (const validate of [validatePayload, validateSchemaPayload]) {
        const result = validate(payload, type); assert.equal(result.valid, true); assert.equal(result.can_execute, false);
        assert.equal(validate({ ...payload, user_approved: true }, type).valid, false);
      }
    }
    const invalid = s.clone(tree.intents[1]); invalid.parent_intent_id = {};
    assert.equal(validateSchemaPayload(invalid, "commander-intent").valid, false);
    invalid.parent_intent_id = null;
    assert.equal(validatePayload(invalid, "commander-intent").valid, false);
    const event = s.clone(tree.delegations[0]); event.delegated_boundary.green.push("Unapproved action");
    assert.equal(validatePayload(event, "intent-delegation-event").valid, false);
  });
  check("rendered assignment binds exact plan, root, task, authority and every delegation", () => {
    const plan = s.nested(s.fixturePlan()), pack = s.context(plan, plan.agents.at(-1));
    assert.equal(validatePayload(pack, "agent-context-pack").valid, true);
    intent.assertIntentContext(pack, plan);
    for (const mutation of ["plan", "task", "authority", "root", "edge", "missing", "legacy", "role", "department", "classification", "delegated-authority"]) {
      const bad = s.clone(pack);
      if (mutation === "plan") bad.intent_assignment.plan_sha256 = "0".repeat(64);
      if (mutation === "task") bad.task = "A substituted assignment";
      if (mutation === "authority") bad.authority.allowed_actions.push("Publish externally");
      if (mutation === "root") bad.intent_assignment.lineage[0].purpose = "Different purpose";
      if (mutation === "edge") bad.intent_assignment.delegations.pop();
      if (mutation === "missing") delete bad.intent_assignment;
      if (mutation === "role") bad.operational_role = "S6";
      if (mutation === "department") bad.department = "systems";
      if (mutation === "classification") bad.classification = "public";
      if (mutation === "delegated-authority") bad.authority.delegated_authority = "release-review";
      if (mutation === "legacy") { bad.schema_version = "0.2"; delete bad.intent_assignment; }
      assert.throws(() => intent.assertIntentContext(bad, plan), /INTENT_/);
    }
    const policy = { agent_id: pack.agent_id, tool_rules: [{ mission_action: plan.agents.at(-1).approval_required[0] }] };
    assert.throws(() => intent.assertIntentPolicy(policy, pack.intent_assignment), /INTENT_POLICY_ACTION_NOT_AUTONOMOUS/);
    const partialEdge = s.clone(pack); partialEdge.intent_assignment.delegations.pop();
    assert.equal(validateSchemaPayload(partialEdge, "agent-context-pack").valid, true);
    const invalid = validatePayload(partialEdge, "agent-context-pack");
    assert.equal(invalid.valid, false);
    assert(invalid.issues.some(issue => issue.code === "INTENT_CONTEXT_INHERITANCE_INVALID"));
  });
  check("full adoption, nested contexts and actual policy lease and tool consumers use the mandatory lineage", () => {
    const value = env(); value.plan.intent_continuity = s.nested(value.plan).intent_continuity;
    s.adopt(value); value.opened = openWave(value.plan, s.optionsAt(value, 70));
    const policy = value.policies.at(-1), contextRef = value.opened.context_packs.find(row => row.agent_id === policy.agent_id).context_pack_ref;
    const context = s.read(value, contextRef);
    assert.equal(context.schema_version, "0.4"); assert.equal(context.intent_assignment.lineage.length, 3);
    intent.assertIntentContext(context, value.plan);
    dispatch.authorizeDispatchPolicy(s.optionsAt(value, 80), policy);
    const lease = dispatch.issueLease(s.optionsAt(value, 80), policy.id, { sessionId: "intent-session", providerAgentId: "main" });
    const actor = hookIdentity(value, policy, "intent-session"), input = hook(value, actor, "intent-tool");
    assert.equal(dispatch.admitToolRequest(s.optionsAt(value, 90), actor, input).decision, "allow");
    const result = dispatch.completeToolRequest(s.optionsAt(value, 100), actor, { ...input, hook_event_name: "PostToolUse" });
    assert.equal(result.checkpoint.execution_result.status, "succeeded");
    dispatch.revokeLease(s.optionsAt(value, 110), lease.lease.id, "SYNTHETIC_TEST_COMPLETE");
    assert.equal(artifacts.verifyRepositoryArtifacts({ repositoryPath: value.options.repository, artifactRoot: value.options.artifactRoot }).valid, true);
  });
  check("legacy contexts deny new authority but retain already-admitted results and revocation", () => {
    const value = env(); s.adopt(value);
    legacyProducer = true;
    try { value.opened = openWave(value.plan, s.optionsAt(value, 70)); } finally { legacyProducer = false; }
    const policy = value.policies[0], actor = hookIdentity(value, policy, "legacy-intent-session"), input = hook(value, actor, "legacy-admitted-tool");
    const originalContextGuard = intent.assertIntentContext, originalPolicyGuard = intent.assertIntentPolicy;
    let lease;
    // Synthetic predecessor producer only; no public bypass flag or real consent.
    try {
      intent.assertIntentContext = context => intent.assignmentForPlan(value.plan, context.agent_id);
      intent.assertIntentPolicy = () => {};
      dispatch.authorizeDispatchPolicy(s.optionsAt(value, 80), policy);
      lease = dispatch.issueLease(s.optionsAt(value, 80), policy.id, { sessionId: actor.sessionId, providerAgentId: "main" });
      assert.equal(dispatch.admitToolRequest(s.optionsAt(value, 90), actor, input).decision, "allow");
    } finally { intent.assertIntentContext = originalContextGuard; intent.assertIntentPolicy = originalPolicyGuard; }
    const denied = dispatch.admitToolRequest(s.optionsAt(value, 100), actor, { ...input, tool_use_id: "new-legacy-tool" });
    assert.equal(denied.decision, "deny"); assert(denied.reason_codes.includes("INTENT_CONTEXT_UPGRADE_REQUIRED"));
    assert.throws(() => dispatch.authorizeDispatchPolicy(s.optionsAt(value, 100), policy), /INTENT_CONTEXT_UPGRADE_REQUIRED/);
    assert.throws(() => openWave(value.plan, s.optionsAt(value, 100)), /INTENT_CONTEXT_UPGRADE_REQUIRED/);
    const report = { ...s.sample("mission-wave-report"), mission_id: value.plan.mission_id, wave_id: value.plan.wave_id,
      plan_ref: value.opened.plan_ref, routing_preflight_ref: value.opened.routing_preflight_ref,
      recorded_at: s.optionsAt(value, 100).now, agent_results: value.opened.context_packs.map(row => ({
        ...s.sample("mission-wave-report").agent_results[0], agent_id: row.agent_id, context_pack_ref: row.context_pack_ref, evidence_refs: [value.opened.plan_ref] })) };
    assert.throws(() => recordWave(report, s.optionsAt(value, 100)), /INTENT_CONTEXT_UPGRADE_REQUIRED/);
    const completed = dispatch.completeToolRequest(s.optionsAt(value, 110), actor, { ...input, hook_event_name: "PostToolUse" });
    assert.equal(completed.checkpoint.execution_result.status, "succeeded"); assert.equal(completed.execution_authorized, false);
    dispatch.interruptLease(s.optionsAt(value, 120), lease.lease.id, "SYNTHETIC_UPGRADE_HOLD");
    assert.throws(() => dispatch.resumeLease(s.optionsAt(value, 130), lease.lease.id,
      { sessionId: "new-session", providerAgentId: "main" }), /INTENT_CONTEXT_UPGRADE_REQUIRED/);
    dispatch.revokeLease(s.optionsAt(value, 140), lease.lease.id, "SYNTHETIC_UPGRADE_COMPLETE");
  });
  check("both skill wrappers check plan and rendered context outside the checkout", () => {
    const plan = s.nested(s.fixturePlan()), value = env(), input = path.join(value.root, "intent-plan.json"), contextFile = path.join(value.root, "intent-context.json");
    fs.writeFileSync(input, JSON.stringify(plan)); fs.writeFileSync(contextFile, JSON.stringify(s.context(plan)));
    for (const folder of ["codex-skills", ".claude/skills"]) {
      const wrapper = path.resolve(folder, "controls-doctrine-operator/scripts/check_controls_intent.js");
      const result = spawnSync(process.execPath, [wrapper, input, contextFile], { cwd: value.root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, "ready");
      const wrong = spawnSync(process.execPath, [wrapper, input, contextFile, "--approve"], { cwd: value.root, encoding: "utf8" });
      assert.notEqual(wrong.status, 0);
    }
  });
  console.log(JSON.stringify({ total: passed, passed, failed: 0 }, null, 2));
} finally { legacyProducer = false; roots.forEach(root => fs.rmSync(root, { recursive: true, force: true })); }
