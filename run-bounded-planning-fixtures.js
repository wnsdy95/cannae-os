#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const artifacts = require("./repository-artifact-store"), write = artifacts.writeRepositoryArtifact;
let beforeWrite;
artifacts.writeRepositoryArtifact = descriptor => { if (beforeWrite) beforeWrite(descriptor); return write(descriptor); };
const s = require("./bounded-planning-fixtures/support"), controller = require("./bounded-planning-controller"), contract = require("./bounded-planning-contract");
const { loadVerifiedStore } = require("./campaign-supervisor"), adoption = require("./order-adoption-controller");
const { validatePayload } = require("./validator-cli-prototype/validate"), { openWave, terminateWave } = require("./skill-mission-controller");
const dispatch = require("./dispatch-runtime-controller"), roots = []; let passed = 0;
function environment(epoch) { const env = s.environment(epoch); roots.push(env.root); return env; }
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function generate(env, request = s.requestFor(env)) { return controller.generatePlan(request, s.optionsAt(env, 12)); }
try {
  check("actual draft tasks automatically produce a bounded complete plan, policies and intent tree without accepting a manual plan", () => {
    const env = environment(), request = s.requestFor(env), before = s.clone(request), generated = generate(env, request);
    assert.deepEqual(request, before); assert.equal(generated.proposal.status, "ready_for_review");
    assert.equal(generated.proposal.estimated_cost_units, 3); assert.equal(generated.proposal.search.complete_allocations, 1);
    assert.deepEqual(generated.plan.agents.map(item => item.task), env.draft.opord.execution.tasks.map(item => item.task));
    assert.deepEqual(generated.plan.order_binding.planning_ref, generated.proposal_ref);
    assert.equal(generated.proposal.plan.order_binding.planning_ref, undefined); assert.equal(generated.execution_authorized, false);
    for (const [type, value] of [["bounded-planning-request", request], ["bounded-planning-proposal", generated.proposal], ["mission-wave-plan", generated.plan]]) {
      const result = validatePayload(value, type); assert.equal(result.valid, true, JSON.stringify(result.issues)); assert.equal(result.can_execute, false);
    }
    assert.deepEqual(generate(env, request).proposal, generated.proposal);
    controller.assertPlanning(generated.plan, s.optionsAt(env, 15));
    const substituted = s.clone(generated.plan); substituted.title = "Unreviewed substitution";
    assert.throws(() => controller.assertPlanning(substituted, s.optionsAt(env, 15)), /PLANNING_PLAN_SUBSTITUTED/);
    delete substituted.order_binding.planning_ref;
    assert.throws(() => controller.assertPlanning(substituted, s.optionsAt(env, 15)), /PLANNING_BINDING_REQUIRED/);
    const forged = s.clone(generated.proposal), current = loadVerifiedStore(env.options.repository, env.options.artifactRoot);
    forged.plan.title = "Synthetic counterfeit generation"; forged.recorded_at = s.optionsAt(env, 13).now;
    forged.observed_manifest = { revision: current.manifest.manifest_revision, sha256: current.verification.manifest_sha256 };
    const { id, ...body } = forged; forged.id = `BPP-${require("./order-intake-contract").digest(body).slice(0, 32)}`;
    assert.equal(validatePayload(forged, "bounded-planning-proposal").valid, true);
    const reference = s.persist(env, "bounded-planning-proposals", forged, 13);
    assert.throws(() => controller.proposalProof(loadVerifiedStore(env.options.repository, env.options.artifactRoot), reference, s.optionsAt(env, 15)), /PLANNING_REPLAY_MISMATCH/);
  });
  check("finite search chooses the lowest declared estimate, uses each agent once and retains all tasks", () => {
    const env = environment(), request = s.requestFor(env), alternate = s.clone(request.envelope.candidates[0]); alternate.agent_id = "alternate-S2"; alternate.estimated_cost_units = 0;
    request.envelope.candidates.push(alternate); const result = generate(env, request);
    assert.deepEqual(result.proposal.selected_agent_ids, ["alternate-S2", "agent-S3"]); assert.equal(result.proposal.estimated_cost_units, 2);
    assert.equal(result.proposal.search.complete_allocations, 2); assert.equal(result.plan.agents.length, env.draft.opord.execution.tasks.length);
  });
  for (const [name, mutate, code] of [
    ["state exhaustion cannot present a partial incumbent as a ready plan", request => { request.envelope.limits.max_search_states = 2; }, "PLANNING_SEARCH_LIMIT"],
    ["budget exhaustion cannot omit a required task", request => { request.envelope.limits.max_estimated_cost_units = 0; }, "PLANNING_NO_FEASIBLE_ALLOCATION"],
    ["agent limit cannot produce a shortened task list", request => { request.envelope.limits.max_agents = 1; }, "PLANNING_AGENT_LIMIT"],
    ["disabled roster member cannot be selected", request => { request.envelope.candidates[0].enabled = false; }, "PLANNING_NO_FEASIBLE_ALLOCATION"]
  ]) check(name, () => { const env = environment(), request = s.requestFor(env); mutate(request); const result = generate(env, request);
    assert.equal(result.plan, null); assert.equal(result.proposal.status, "blocked"); assert(result.proposal.block_reasons.includes(code)); assert.deepEqual(result.proposal.policy_drafts, []); });
  check("invalid unknown, duplicated and authority-expanding inputs fail rather than receiving defaults", () => {
    const env = environment();
    for (const change of [request => { request.envelope.risk_level = "unknown"; }, request => { request.envelope.limits.max_estimated_cost_units = -1; },
      request => { request.envelope.candidates.push(s.clone(request.envelope.candidates[0])); }, request => { request.envelope.candidates[0].allowed_actions.push("Publish externally."); },
      request => { request.envelope.candidates[0].policy_template.tool_rules[0].mission_action = "Approve own work."; },
      request => { const match = request.envelope.candidates[0].policy_template.tool_rules[0].input_match; match.allowed_sha256.push(match.allowed_sha256[0]); },
      request => { request.parent_plan_ref = request.draft_ref; }, request => { request.plan = env.plan; },
      request => { request.envelope.candidates[0].policy_template.repository_state.require_head_match = false; }]) {
      const request = s.requestFor(env); change(request); assert.throws(() => generate(env, request), /PLANNING_INVALID|PLANNING_CANDIDATE_EXCEEDS_DRAFT/);
    }
    const oversized = s.requestFor(env); oversized.envelope.title = "x".repeat(1048577); assert.throws(() => generate(env, oversized), /PLANNING_INPUT_LIMIT/);
  });
  check("freshness, future clocks and cross-wave draft substitutions cannot generate a plan", () => {
    const env = environment(), request = s.requestFor(env);
    assert.throws(() => controller.generatePlan(request, s.optionsAt(env, 9)), /PLANNING_DRAFT_NOT_CURRENT_OR_READY/);
    assert.throws(() => controller.generatePlan(request, s.optionsAt(env, 3601)), /PLANNING_DRAFT_NOT_CURRENT_OR_READY/);
    request.wave_id = "OTHER"; assert.throws(() => generate(env, request), /PLANNING_DRAFT_NOT_CURRENT_OR_READY/);
  });
  check("publication checks actual manifest, rollback and expiry before retaining the proposal", () => {
    for (const change of ["manifest", "rollback", "expiry"]) {
      const env = environment(), request = s.requestFor(env), options = s.optionsAt(env, 12);
      beforeWrite = descriptor => { if (descriptor.kind !== "bounded-planning-proposals") return; beforeWrite = null;
        if (change === "manifest") s.persist(env, "audit-notes", { id: "NOTE-RACE", observation: "Synthetic concurrent write." }, 12);
        else options.now = s.optionsAt(env, change === "rollback" ? 11 : 612).now; };
      try { assert.throws(() => controller.generatePlan(request, options), /PLANNING_PUBLICATION_CHANGED_OR_EXPIRED/); } finally { beforeWrite = null; }
      assert(!loadVerifiedStore(env.options.repository, env.options.artifactRoot).manifest.artifacts.some(item => item.kind === "bounded-planning-proposals"));
    }
  });
  check("generated provenance is enforced by actual coverage, adoption, owner inspection, context, policy, lease and next-call consumers", () => {
    const env = environment(Date.now() + 3600000); s.useGenerated(env, generate(env));
    assert.throws(() => openWave(env.plan, s.optionsAt(env, 15)), /ORDER_ADOPTION_REQUIRED/);
    s.prepareSemanticReview(env);
    const stripped = s.clone(env.request); delete stripped.plan.order_binding.planning_ref;
    assert.throws(() => adoption.proposeOrder(stripped, s.optionsAt(env, 20)), /PLANNING_BINDING_REQUIRED/);
    s.adopt(env); env.opened = openWave(env.plan, s.optionsAt(env, 70));
    const inspection = adoption.inspectOrder({ ...s.optionsAt(env, 75), proposalId: env.proposed.proposal.id });
    assert.deepEqual(inspection.planning_review, env.generated.proposal);
    const actor = { missionId: env.plan.mission_id, waveId: env.plan.wave_id, agentId: env.plan.agents[0].agent_id, provider: "codex", sessionId: "planning-session", providerAgentId: "main" };
    const options = s.optionsAt(env, 80), policy = env.policies[0]; dispatch.authorizeDispatchPolicy(options, policy);
    const lease = dispatch.issueLease(options, policy.id, { sessionId: actor.sessionId, providerAgentId: actor.providerAgentId }); assert.equal(lease.release_authorized, false);
    const input = { session_id: actor.sessionId, cwd: env.options.repository, hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "planning-observe", tool_input: env.toolInput };
    assert.equal(dispatch.admitToolRequest(s.optionsAt(env, 90), actor, input).decision, "allow");
    assert(dispatch.completeToolRequest(s.optionsAt(env, 91), actor, { ...input, hook_event_name: "PostToolUse" }).checkpoint);
    const child = require("./order-revision-fixtures/support").successor(env), revised = generate(child, s.requestFor(child, env));
    assert.equal(revised.proposal.parent_budget_remaining[actor.agentId].total, 1);
    assert.equal(revised.proposal.policy_drafts[0].max_total_admissions, 1);
    const another = { ...input, tool_use_id: "planning-second" };
    assert.equal(dispatch.admitToolRequest(s.optionsAt(env, 220), actor, another).decision, "allow");
    assert(dispatch.completeToolRequest(s.optionsAt(env, 221), actor, { ...another, hook_event_name: "PostToolUse" }).checkpoint);
    assert.throws(() => controller.prepareRevision(revised.proposal_ref, s.optionsAt(env, 222)), /PLANNING_PARENT_BUDGET_CHANGED/);
    const expired = dispatch.admitToolRequest(s.optionsAt(env, 613), actor, { ...input, tool_use_id: "planning-expired" }); assert.equal(expired.decision, "deny");
    assert.throws(() => controller.generatePlan({ ...s.requestFor(env), id: "BPR-AFTER-OPEN" }, s.optionsAt(env, 95)), /PLANNING_WAVE_ALREADY_COMMITTED/);
  });
  check("automatic revision preserves parent caps and finalizes its real revision before fresh coverage/adoption", () => {
    const parent = environment(Date.now() + 3600000); s.useGenerated(parent, generate(parent)); s.adopt(parent); parent.opened = openWave(parent.plan, s.optionsAt(parent, 70));
    const revisionSupport = require("./order-revision-fixtures/support"), child = revisionSupport.successor(parent), request = s.requestFor(child, parent);
    const future = revisionSupport.successor(parent, "WFUTURE", 0);
    assert.throws(() => generate(future, s.requestFor(future, parent)), /PLANNING_PARENT_SCOPE_INVALID/);
    const relabeled = s.clone(request); relabeled.mode = "initial"; relabeled.parent_plan_ref = relabeled.parent_adoption_ref = s.clone(require("./order-adoption-contract").NONE);
    assert.throws(() => generate(child, relabeled), /PLANNING_MISSION_REQUIRES_REVISION/);
    const result = generate(child, request); s.useGenerated(child, result);
    assert(Date.parse(child.plan.valid_until) <= Date.parse(parent.plan.valid_until));
    for (const constraint of parent.plan.constraints) assert(child.plan.constraints.includes(constraint));
    assert.throws(() => controller.assertPlanning(child.plan, s.optionsAt(child, 14)), /PLANNING_REVISION_BINDING_REQUIRED/);
    for (const change of [request => { request.envelope.candidates[0].policy_template.max_total_admissions++; },
      request => { request.envelope.candidates[0].delegated_authority = "release-review"; },
      request => { request.envelope.controls.adaptive_work.enabled = true; }, request => { request.envelope.risk_level = "low"; }]) {
      const altered = s.clone(request); altered.id = `BPR-ALTERED-${passed}`; change(altered);
      assert.throws(() => generate(child, altered), /PLANNING_PARENT_POLICY_EXPANDED|PLANNING_PARENT_AGENT_SCOPE_EXPANDED|PLANNING_PARENT_CONTROL_WEAKENED|PLANNING_PARENT_INTENT_OR_PROFILE_CHANGED/);
    }
    const prepared = controller.prepareRevision(result.proposal_ref, s.optionsAt(child, 15)); child.plan = prepared.successor_plan; child.request.plan = child.plan;
    assert(child.plan.order_binding.revision_ref); controller.assertPlanning(child.plan, s.optionsAt(child, 16));
    s.adoptGeneratedRevision(child); child.opened = openWave(child.plan, s.optionsAt(child, 70));
    assert.throws(() => dispatch.authorizeDispatchPolicy(s.optionsAt(parent, 300), child.policies[0]), /ORDER_REVISION_PREDECESSOR_NOT_SETTLED/);
    terminateWave(revisionSupport.termination(parent, child, 350), s.optionsAt(parent, 350));
    dispatch.authorizeDispatchPolicy(s.optionsAt(parent, 360), child.policies[0]);
    assert.equal(artifacts.verifyRepositoryArtifacts({ repositoryPath: parent.options.repository, artifactRoot: parent.options.artifactRoot }).valid, true);
  });
  check("manual parents require original adopted policy preimages and cannot reconstruct them from a later compiled timestamp", () => {
    const parent = environment(Date.now() + 3600000); s.adopt(parent); parent.opened = openWave(parent.plan, s.optionsAt(parent, 70));
    const authorized = dispatch.authorizeDispatchPolicy(s.optionsAt(parent, 80), parent.policies[0]);
    assert.notEqual(authorized.policy.approved_at, parent.policies[0].approved_at);
    const child = require("./order-revision-fixtures/support").successor(parent), request = s.requestFor(child, parent);
    assert.throws(() => generate(child, request), /PLANNING_PARENT_POLICY_PROOF_REQUIRED/);
    request.parent_policy_drafts = s.clone(parent.policies);
    const forged = s.clone(request); forged.parent_policy_drafts[0].approved_at = authorized.policy.approved_at;
    assert.throws(() => generate(child, forged), /PLANNING_PARENT_POLICY_PROOF_REQUIRED/);
    assert.equal(generate(child, request).proposal.status, "ready_for_review");
  });
  check("both installed-skill wrappers construct and inspect actual retained plans outside the checkout and expose no clock or model run override", () => {
    const env = environment(Date.now() - 120000), request = s.requestFor(env), input = path.join(env.root, "request.json"); fs.writeFileSync(input, JSON.stringify(request));
    let id;
    for (const tree of ["codex-skills", ".claude/skills"]) {
      const script = path.join(__dirname, tree, "controls-doctrine-operator/scripts/plan_controls_mission.js");
      const run = args => spawnSync(process.execPath, [script, ...args], { cwd: env.root, encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
      const args = ["generate", "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot, "--input", input], generated = run(args);
      assert.equal(generated.status, 0, generated.stderr); const value = JSON.parse(generated.stdout); assert.equal(value.proposal.status, "ready_for_review");
      if (id) assert.equal(value.proposal.id, id); id = value.proposal.id;
      assert.equal(value.proposal.model_invocations, 0); assert.equal(value.execution_authorized, false);
      const inspected = run(["inspect", "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot, "--proposal-id", id]);
      assert.equal(inspected.status, 0, inspected.stderr); assert.deepEqual(JSON.parse(inspected.stdout).plan, value.plan);
      for (const extra of [["--now", "2026-01-01T00:00:00Z"], ["--model", "unreviewed"]]) assert.notEqual(run([...args, ...extra]).status, 0);
      assert.notEqual(run(args.filter((_, index) => ![1, 2].includes(index))).status, 0);
    }
  });
  console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_consent_created: false,
    generation_class: "bounded_structural_synthesis_v1", calibrated_semantic_planning_complete: false, execution_authorized: false, release_authorized: false }, null, 2));
} finally { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); }
