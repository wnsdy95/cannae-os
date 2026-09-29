#!/usr/bin/env node

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const artifactStore = require("./repository-artifact-store");
const originalWrite = artifactStore.writeRepositoryArtifact;
let beforeWrite = null;
artifactStore.writeRepositoryArtifact = options => { if (beforeWrite) beforeWrite(options); return originalWrite(options); };
const { validatePayload, validateSchemaPayload } = require("./validator-cli-prototype/validate");
const { orderForPlan, assertContextAssignment, proposeOrder, retainOrderEvidence, decideOrder, inspectOrder } = require("./order-adoption-controller");
const { openWave, recordWave, assertAdaptiveCampaignMayContinue } = require("./skill-mission-controller");
const { verifyRepositoryArtifacts } = require("./repository-artifact-store");
const { NONE, decisionOption } = require("./order-adoption-contract");
const { authorizeDispatchPolicy, issueLease, admitToolRequest, completeToolRequest } = require("./dispatch-runtime-controller");
const { clone, sample, read, optionsAt, persist, environment, propose, brief, retainBriefs, rehearsal, rehearse,
  decisionRequest, decision, adopt } = require("./order-adoption-fixtures/support");
const roots = [];
let passed = 0;
function setup() { const env = environment(); roots.push(env.root); return env; }
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

try {
  check("exact plan, individual backbriefs, rehearsal and USER decision produce review-only adoption", () => {
    const env = setup(), result = adopt(env);
    assert.equal(result.record.status, "adopted");
    for (const key of ["execution_authorized", "continuation_authorized", "release_authorized"]) assert.equal(result[key], false);
    assert.equal(orderForPlan(env.plan, optionsAt(env, 70)).payload.id, result.record.id);
    assert.deepEqual(inspectOrder({ ...optionsAt(env, 70), proposalId: env.proposed.proposal.id }).record, result.record);
    for (const [type, value] of [["order-adoption-proposal-request", env.request], ["order-adoption-proposal", env.proposed.proposal],
      ["order-backbrief", env.briefs[0]], ["order-rehearsal", env.rehearsal], ["order-adoption-decision-request", env.decisionRequest],
      ["order-adoption-record", result.record], ["mission-wave-plan", env.plan]]) {
      for (const validate of [validatePayload, validateSchemaPayload]) {
        const checked = validate(value, type); assert.equal(checked.valid, true, JSON.stringify(checked.issues)); assert.equal(checked.can_execute, false);
      }
    }
    assert.equal(verifyRepositoryArtifacts({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot }).valid, true);
  });
  check("captured intake cannot open directly or downgrade to a legacy plan", () => {
    const env = setup();
    assert.throws(() => openWave(env.plan, optionsAt(env, 70)), /ORDER_ADOPTION_REQUIRED/);
    const legacy = clone(env.plan); legacy.schema_version = "0.1"; delete legacy.order_binding;
    assert.throws(() => openWave(legacy, optionsAt(env, 70)), /ORDER_ADOPTION_DOWNGRADE_PROHIBITED/);
    propose(env); assert.throws(() => openWave(env.plan, optionsAt(env, 70)), /ORDER_ADOPTION_REQUIRED/);
  });
  check("opened contexts carry exact adopted assignments without granting tool authority", () => {
    const env = setup(); adopt(env);
    const opened = openWave(env.plan, optionsAt(env, 70));
    assert.equal(opened.status, "ready"); assert.equal(opened.tool_execution_authorized, false);
    for (const item of opened.context_packs) {
      const context = read(env, item.context_pack_ref);
      assert.equal(context.created_at, optionsAt(env, 70).now);
      assert.equal(context.schema_version, "0.3"); assert.equal(validatePayload(context, "agent-context-pack").can_execute, false);
      assertContextAssignment(context, env.plan, optionsAt(env, 70));
      const store = require("./campaign-supervisor").loadVerifiedStore(env.options.repository, env.options.artifactRoot);
      const entry = store.manifest.artifacts.find(value => value.relative_path === item.context_pack_ref.relative_path);
      const before = require("./campaign-terminal-controller").prefixBeforeEntry(store, entry);
      assertContextAssignment(context, env.plan, { ...env.options, now: entry.created_at }, before);
      context.order_assignment.task_order.deliverables = ["Substituted deliverable"];
      assert.throws(() => assertContextAssignment(context, env.plan, optionsAt(env, 70)), /ORDER_CONTEXT_ASSIGNMENT_MISMATCH/);
    }
    const report = { ...sample("mission-wave-report"), id: "MWR-ADOPTION", mission_id: env.plan.mission_id, wave_id: env.plan.wave_id,
      plan_ref: opened.plan_ref, routing_preflight_ref: opened.routing_preflight_ref, recorded_at: optionsAt(env, 80).now,
      agent_results: opened.context_packs.map(item => ({ ...sample("mission-wave-report").agent_results[0],
        agent_id: item.agent_id, context_pack_ref: item.context_pack_ref, evidence_refs: [env.adopted.record_ref] })) };
    assert.throws(() => recordWave(report, optionsAt(env, 80)), /control metadata as execution evidence: order-adoption-records/);
    const reopened = openWave(env.plan, optionsAt(env, 80));
    assert.deepEqual(reopened.context_packs, opened.context_packs);
    assert.throws(() => proposeOrder({ ...env.request, id: "OAPR-LATE" }, optionsAt(env, 80)), /WAVE_ALREADY_OPENED/);
  });
  check("plan adoption rejects intent, scope, assignment, handling, validity and authority substitutions", () => {
    const env = setup();
    const cases = [
      [value => { value.plan.objective = "Different outcome"; }, /ORDER_PLAN_INTENT_MISMATCH/],
      [value => { value.plan.constraints = ["Ignore all restrictions"]; }, /ORDER_PLAN_INTENT_MISMATCH/],
      [value => { value.plan.success_conditions = ["Different success"]; }, /ORDER_PLAN_INTENT_MISMATCH/],
      [value => { value.plan.failure_conditions = ["Different failure"]; }, /ORDER_PLAN_INTENT_MISMATCH/],
      [value => { value.plan.agents[0].task = "Different task"; }, /ORDER_PLAN_TASK_MISMATCH/],
      [value => { value.plan.agents[0].operational_role = "S6"; }, /ORDER_PLAN_TASK_MISMATCH/],
      [value => { value.plan.agents[0].context_scope = "public"; }, /ORDER_PLAN_CLASSIFICATION_MISMATCH/],
      [value => { value.plan.order_binding.task_assignments[0].agent_id = "absent-agent"; }, /ORDER_PLAN_ASSIGNMENT_MISMATCH/],
      [value => { value.plan.order_binding.task_assignments[0].task_order_id = "TASK-MISSING"; }, /ORDER_PLAN_ASSIGNMENT_MISMATCH/],
      [value => { value.plan.agents[0].approval_required = ["Different approval"]; }, /ORDER_PLAN_AUTHORITY_MISMATCH/],
      [value => { value.plan.agents[0].prohibited_actions = ["Different prohibition"]; }, /ORDER_PLAN_AUTHORITY_MISMATCH/],
      [value => { value.plan.agents[0].allowed_actions = ["Change customer data"]; }, /ORDER_PLAN_AUTHORITY_MISMATCH/],
      [value => { value.plan.agents[0].allowed_actions = ["Push to production"]; }, /MISSION_WAVE_RETAINED_ACTION_DELEGATED/],
      [value => { value.plan.valid_until = optionsAt(env, 3700).now; }, /ORDER_PLAN_VALIDITY_MISMATCH/],
      [value => { value.plan.created_at = optionsAt(env, 9).now; }, /ORDER_PLAN_VALIDITY_MISMATCH/],
      [value => { value.plan.order_binding.draft_ref.sha256 = "a".repeat(64); }, /DRAFT_NOT_RETAINED/]
    ];
    for (const [mutate, expected] of cases) {
      const value = clone(env.request); mutate(value); assert.throws(() => proposeOrder(value, optionsAt(env, 20)), expected);
    }
  });
  check("every backbrief preserves the full task and inherited boundaries for one exact agent", () => {
    const env = setup(); propose(env);
    const cases = [
      value => { value.agent_id = "agent-missing"; }, value => { value.agent_id = "agent-S3"; },
      value => { value.backbrief.understanding.commander_intent = "Different intent"; },
      value => { value.backbrief.understanding.constraints = []; }, value => { value.backbrief.stop_conditions = []; },
      value => { value.task_acknowledgement.ccir = []; }, value => { value.backbrief.assumptions = []; },
      value => { value.backbrief.planned_actions = ["Unapproved action"]; },
      value => { value.backbrief.requested_clarifications = ["Who approves this?"]; },
      value => { value.backbrief.created_at = optionsAt(env, 10).now; },
      value => { value.backbrief.created_at = optionsAt(env, 31).now; }
    ];
    for (const mutate of cases) {
      const value = clone(brief(env, 0)); mutate(value);
      assert.throws(() => retainOrderEvidence(value, optionsAt(env, 30), "order-backbriefs"), /ORDER_BACKBRIEF_|BACKBRIEF_WITHOUT_STOP_CONDITIONS/);
    }
    const invalid = clone(brief(env, 0)); invalid.backbrief.risk_controls = [];
    assert.throws(() => retainOrderEvidence(invalid, optionsAt(env, 30), "order-backbriefs"), /BACKBRIEF_WITHOUT_RISK_CONTROLS/);
    assert.throws(() => retainOrderEvidence(brief(env, 0), optionsAt(env, 30), "deliverables"), /EVIDENCE_KIND_INVALID/);
  });
  check("rehearsal requires all individual agents, exact actions, deliverables, evidence and resolved risk", () => {
    const env = setup(); propose(env); retainBriefs(env);
    const cases = [
      value => { value.backbrief_refs.pop(); }, value => { value.agent_sequence[0] = "agent-missing"; },
      value => { value.rehearsal.sequence[0].actor = "S6"; }, value => { value.rehearsal.sequence[0].action = "Different action"; },
      value => { value.rehearsal.sequence[0].expected_result = `NOT ${value.rehearsal.sequence[0].expected_result}`; },
      value => { value.rehearsal.sequence[0].evidence_required = []; },
      value => { value.rehearsal.friction_points = [{ issue: "Data loss", severity: "high", mitigation: "None", owner: "S3" }];
        value.rehearsal.decision_points = ["USER must accept risk"]; },
      value => { value.rehearsal.required_changes = ["Fix this first"]; },
      value => { value.rehearsal.created_at = optionsAt(env, 29).now; }
    ];
    for (const mutate of cases) {
      const value = clone(rehearsal(env)); mutate(value);
      assert.throws(() => retainOrderEvidence(value, optionsAt(env, 40), "order-rehearsals"), /ORDER_REHEARSAL_|EXECUTE_WITH_UNRESOLVED_CHANGES/);
    }
  });
  check("only an exact, fresh, complete USER scope decision may adopt the plan", () => {
    const env = setup(); propose(env); retainBriefs(env); rehearse(env);
    const mutations = [
      value => { value.decision_maker = "S3"; }, value => { value.status = "draft"; },
      value => { value.decision_type = "approval"; }, value => { value.chosen_option = "approve"; value.options_considered = ["approve"]; },
      value => { value.authority_basis.reference = "OAP-Different"; }, value => { value.affected_artifacts.pop(); },
      value => { value.decided_at = optionsAt(env, 39).now; }, value => { value.decided_at = optionsAt(env, 61).now; }
    ];
    for (const [index, mutate] of mutations.entries()) {
      const request = decisionRequest(env), value = decision(env, request); value.id = `DL-BAD-${index}`; mutate(value);
      request.decision_ref = persist(env, "decision-logs", value);
      assert.throws(() => decideOrder(request, optionsAt(env, 60)), /ORDER_ADOPTION_USER_DECISION_REQUIRED|ORDER_ADOPTION_DECISION_PRECEDES_SUBJECT|failed validation/);
    }
    const request = decisionRequest(env); request.backbrief_refs.pop();
    assert.throws(() => decideOrder(request, optionsAt(env, 60)), /ORDER_ADOPTION_REHEARSAL_REQUIRED/);
  });
  check("reject and revise cannot be replayed as approval or open a wave", () => {
    for (const disposition of ["reject", "revise"]) {
      const env = setup(); propose(env);
      const request = decisionRequest(env, disposition), value = decision(env, request);
      request.decision_ref = persist(env, "decision-logs", value);
      const result = decideOrder(request, optionsAt(env, 60));
      assert.equal(result.record.status, disposition === "reject" ? "rejected" : "revision_required");
      assert.equal(result.record.issued_order_id, "none");
      assert.throws(() => openWave(env.plan, optionsAt(env, 70)), /ORDER_ADOPTION_REQUIRED/);
      const replacement = { ...request, id: "OADR-RETRY" };
      const nextDecision = { ...decision(env, replacement), id: "DL-RETRY", decided_at: optionsAt(env, 70).now };
      replacement.decision_ref = persist(env, "decision-logs", nextDecision, 70);
      assert.throws(() => decideOrder(replacement, optionsAt(env, 80)), /ORDER_ADOPTION_DECISION_ALREADY_CONSUMED/);
    }
  });
  check("exact retries preserve retained time and expiry; changed requests or later USER dispositions cannot reuse approval", () => {
    const env = setup(); adopt(env);
    const retried = decideOrder(env.decisionRequest, optionsAt(env, 70));
    assert.equal(retried.existing, true); assert.deepEqual(retried.record, env.adopted.record);
    assert.equal(decideOrder(env.decisionRequest, optionsAt(env, 3600)).freshness, "expired");
    assert.throws(() => orderForPlan(env.plan, optionsAt(env, 3600)), /EXPIRED_OR_FUTURE/);
    assert.throws(() => decideOrder(env.decisionRequest, optionsAt(env, 59)), /RECORD_FROM_FUTURE/);
    assert.throws(() => inspectOrder({ ...optionsAt(env, 59), proposalId: env.proposed.proposal.id }), /RECORD_FROM_FUTURE/);
    assert.throws(() => proposeOrder(env.request, optionsAt(env, 19)), /EXPIRED_OR_FUTURE/);
    assert.throws(() => proposeOrder(env.request, optionsAt(env, 3600)), /EXPIRED_OR_FUTURE/);
    assert.throws(() => decideOrder({ ...env.decisionRequest, id: "OADR-CHANGED" }, optionsAt(env, 70)), /USER_DECISION_REQUIRED/);
    const modifiedPlan = clone(env.plan); modifiedPlan.title = "Substituted reviewed plan";
    assert.throws(() => orderForPlan(modifiedPlan, optionsAt(env, 70)), /PLAN_SUBSTITUTED/);
    const later = { ...env.decision, id: "DL-REVOKE", chosen_option: "Reject scope", decided_at: optionsAt(env, 80).now };
    later.options_considered = [later.chosen_option]; persist(env, "decision-logs", later, 80);
    assert.throws(() => assertAdaptiveCampaignMayContinue(env.plan, optionsAt(env, 90)), /CONFLICTING_USER_DECISION/);
  });
  check("schema versions cannot strip or invent adoption bindings", () => {
    const env = setup();
    const missing = clone(env.plan); delete missing.order_binding;
    assert.equal(validatePayload(missing, "mission-wave-plan").valid, false);
    const legacy = clone(env.plan); legacy.schema_version = "0.1";
    assert.equal(validatePayload(legacy, "mission-wave-plan").valid, false);
    const duplicate = clone(env.plan); duplicate.order_binding.task_assignments[0].agent_id = duplicate.order_binding.task_assignments[1].agent_id;
    assert(validatePayload(duplicate, "mission-wave-plan").issues.some(item => item.code === "ORDER_PLAN_ASSIGNMENT_MISMATCH"));
  });
  check("context time starts after adoption, cannot lie in the future and ends at the shorter review lifetime", () => {
    const env = environment(undefined, 7200); roots.push(env.root); adopt(env);
    const opened = openWave(env.plan, optionsAt(env, 70));
    const context = read(env, opened.context_packs[0].context_pack_ref);
    assert(Date.parse(env.plan.valid_until) > Date.parse(env.adopted.record.expires_at));
    assert.equal(context.valid_until, env.adopted.record.expires_at);
    for (const mutate of [value => { value.created_at = optionsAt(env, 59).now; },
      value => { value.created_at = optionsAt(env, 71).now; }, value => { value.valid_until = env.plan.valid_until; }]) {
      const altered = clone(context); mutate(altered);
      assert.throws(() => assertContextAssignment(altered, env.plan, optionsAt(env, 70)), /ORDER_CONTEXT_VALIDITY_MISMATCH/);
    }
    assert.throws(() => openWave(env.plan, optionsAt(env, 69)), /ORDER_CONTEXT_VALIDITY_MISMATCH/);
  });
  check("dispatch still requires exact policy and lease, and expiry denies new work without discarding an admitted result", () => {
    const env = setup(); adopt(env); openWave(env.plan, optionsAt(env, 70));
    const options = optionsAt(env, 3500), policy = env.policies[0];
    const actor = { missionId: env.plan.mission_id, waveId: env.plan.wave_id, agentId: policy.agent_id,
      provider: "codex", sessionId: "session-adoption", providerAgentId: "main" };
    const input = { session_id: actor.sessionId, cwd: env.options.repository, hook_event_name: "PreToolUse", tool_name: "Bash",
      tool_use_id: "tool-adoption", tool_input: env.toolInput };
    assert.equal(admitToolRequest(options, actor, input).decision, "deny");
    authorizeDispatchPolicy(options, policy);
    const lease = issueLease(options, policy.id, { sessionId: actor.sessionId, providerAgentId: actor.providerAgentId });
    assert.equal(lease.release_authorized, false);
    assert.equal(admitToolRequest(optionsAt(env, 3510), actor, input).decision, "allow");
    const result = completeToolRequest(optionsAt(env, 3601), actor, { ...input, hook_event_name: "PostToolUse" });
    assert.notEqual(result.decision, "deny"); assert(result.checkpoint);
    const denied = admitToolRequest(optionsAt(env, 3602), actor, { ...input, tool_use_id: "tool-expired" });
    assert.equal(denied.decision, "deny"); assert(denied.reason_codes.includes("CAMPAIGN_CONTINUATION_BLOCKED"));
  });
  check("publication rejects manifest races, live expiry and rollback without retaining a proposal", () => {
    for (const mutation of ["manifest", "expired", "rollback"]) {
      const env = setup(), options = optionsAt(env, 20);
      beforeWrite = write => {
        if (write.kind !== "order-adoption-proposals") return;
        beforeWrite = null;
        if (mutation === "manifest") persist(env, "deliverables", { id: "DATA-RACE", observation: "Changed snapshot" }, 20);
        if (mutation === "expired") options.now = optionsAt(env, 3600).now;
        if (mutation === "rollback") options.now = optionsAt(env, 19).now;
      };
      try { assert.throws(() => proposeOrder(env.request, options), /SNAPSHOT_CHANGED|EXPIRED_OR_FUTURE|CLOCK_ROLLBACK/); }
      finally { beforeWrite = null; }
      assert.throws(() => orderForPlan(env.plan, optionsAt(env, 30)), /ORDER_ADOPTION_REQUIRED/);
    }
  });
  check("raw-store records and cross-wave decisions cannot masquerade as controller-issued adoption", () => {
    const env = setup(); propose(env); retainBriefs(env); rehearse(env);
    const request = decisionRequest(env), value = decision(env, request);
    request.decision_ref = persist(env, "decision-logs", value, 50, { waveId: "W2" });
    assert.throws(() => decideOrder(request, optionsAt(env, 60)), /USER_DECISION_REQUIRED/);
    const good = setup(); adopt(good);
    const forged = clone(good.adopted.record); forged.mission_id = env.plan.mission_id;
    persist(env, "order-adoption-records", forged, 60);
    assert.throws(() => orderForPlan(env.plan, optionsAt(env, 70)), /RECORD_HISTORY_INVALID|REFERENCE_NOT_RETAINED/);
  });
  check("both CLI wrappers work outside the checkout and refuse clock overrides or missing targets", () => {
    const env = environment(Date.now() - 60000); roots.push(env.root);
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const wrapper = path.join(__dirname, provider, "controls-doctrine-operator/scripts/adopt_controls_order.js");
      const file = path.join(env.root, "proposal.json");
      const current = environment(Date.now() - 60000); roots.push(current.root);
      fs.writeFileSync(file, JSON.stringify(current.request));
      const call = args => spawnSync(process.execPath, [wrapper, ...args], { cwd: env.root, encoding: "utf8" });
      const args = ["propose", "--repository", current.options.repository, "--artifact-root", current.options.artifactRoot, "--input", file];
      const result = call(args); assert.equal(result.status, 0, result.stderr);
      const proposal = JSON.parse(result.stdout);
      const inspected = call(["inspect", "--repository", current.options.repository, "--artifact-root", current.options.artifactRoot,
        "--proposal-id", proposal.proposal.id]);
      assert.equal(inspected.status, 0, inspected.stderr); assert.equal(JSON.parse(inspected.stdout).status, "awaiting_review");
      assert.notEqual(call([...args, "--now", new Date().toISOString()]).status, 0);
      assert.notEqual(call(["propose", "--input", file]).status, 0);
      const optionRequest = { ...decisionRequest({ ...current, proposed: proposal }, "revise"), decision_ref: { ...NONE } };
      fs.writeFileSync(file, JSON.stringify(optionRequest));
      const option = call(["decision-option", "--input", file]);
      assert.equal(option.status, 0, option.stderr); assert.equal(JSON.parse(option.stdout).option, decisionOption(optionRequest));
    }
  });
} finally { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ total: passed, passed, failed: 0 }, null, 2));
