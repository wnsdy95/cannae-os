#!/usr/bin/env node

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const artifactStore = require("./repository-artifact-store");
const originalWrite = artifactStore.writeRepositoryArtifact;
let beforeWrite = null;
artifactStore.writeRepositoryArtifact = options => { if (beforeWrite) beforeWrite(options); return originalWrite(options); };
const s = require("./order-revision-fixtures/support");
const { openWave, terminateWave, recordWave } = require("./skill-mission-controller");
const { proposeRevision, inspectRevision, revisionProof, assertRevisionPreparation, assertRevisionDispatch,
  assertRevisionSupersession } = require("./order-revision-controller");
const { proposeOrder, decideOrder } = require("./order-adoption-controller");
const { digest } = require("./order-intake-contract");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { planChanges, revisionPayload, revisionPlan } = require("./order-revision-contract");
const { authorizeDispatchPolicy, issueLease, admitToolRequest, completeToolRequest, revokeLease } = require("./dispatch-runtime-controller");
const { validatePayload, validateSchemaPayload } = require("./validator-cli-prototype/validate");
const roots = [];
let passed = 0;
let lineageParent;
function setup() {
  const parent = s.environment(Date.now() + 3600000); roots.push(parent.root); s.adopt(parent);
  parent.opened = openWave(parent.plan, s.optionsAt(parent, 70));
  return parent;
}
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function prepare(parent) {
  const child = s.successor(parent); s.proposeRevision(child); s.adoptRevision(child);
  child.opened = openWave(child.plan, s.optionsAt(child, 70)); return child;
}
try {
  check("revision retains exact change bytes, full plan comparison and non-executable proposal", () => {
    const parent = setup(), child = s.successor(parent);
    for (const mutation of ["manifest", "rollback", "expired"]) {
      const options = s.optionsAt(child, 15);
      beforeWrite = write => {
        if (write.kind !== "order-revision-proposals") return;
        beforeWrite = null;
        if (mutation === "manifest") s.persist(child, "audit-notes", { id: "NOTE-REVISION-RACE", mission_id: child.plan.mission_id,
          wave_id: child.plan.wave_id, text: "Synthetic publication race." }, 15);
        else options.now = s.optionsAt(child, mutation === "rollback" ? 14 : 3615).now;
      };
      assert.throws(() => proposeRevision(child.revisionRequest, options), /ORDER_REVISION_PUBLICATION_CHANGED|ORDER_REVISION_EXPIRED_OR_FUTURE/);
      beforeWrite = null;
    }
    const result = s.proposeRevision(child);
    assert.equal(result.proposal.request.change_request_ref.sha256, child.captured.artifact_ref.sha256);
    assert(result.proposal.changes.some(row => row.path === "/agents" && row.change === "changed"));
    assert(result.proposal.changes.some(row => row.change === "retained"));
    assert(result.effective_changes.some(row => row.path === "/order_binding/revision_ref" && row.change === "added" && row.after.sha256 === result.proposal_ref.sha256));
    for (const [type, value] of [["order-revision-request", child.revisionRequest], ["order-revision-proposal", result.proposal]]) {
      for (const validate of [validatePayload, validateSchemaPayload]) {
        const checked = validate(value, type); assert.equal(checked.valid, true, JSON.stringify(checked.issues)); assert.equal(checked.can_execute, false);
      }
    }
    assert.deepEqual(proposeRevision(child.revisionRequest, s.optionsAt(child, 16)).proposal, result.proposal);
    const before = inspectRevision({ ...s.optionsAt(child, 16), proposalId: result.proposal.id });
    assert.deepEqual(before.effective_changes, result.effective_changes);
    assert.equal(before.revision_prerequisites_satisfied, false);
    assert.equal(child.plan.valid_until, result.proposal.expires_at);
    const stripped = s.clone(child.request); delete stripped.plan.order_binding.revision_ref;
    assert.throws(() => proposeOrder(stripped, s.optionsAt(child, 20)), /ORDER_REVISION_BINDING_REQUIRED/);
    const changed = s.clone(child.request); changed.plan.title = "Changed after proposal";
    assert.throws(() => proposeOrder(changed, s.optionsAt(child, 20)), /ORDER_REVISION_PLAN_SUBSTITUTED/);
    assert.throws(() => proposeRevision({ ...child.revisionRequest, id: "ORR-OTHER" }, s.optionsAt(child, 20)), /ORDER_REVISION_WAVE_ALREADY_PROPOSED/);
    assert.throws(() => proposeRevision(child.revisionRequest, s.optionsAt(child, 3615)), /ORDER_REVISION_EXPIRED_OR_FUTURE/);
    const expired = inspectRevision({ ...s.optionsAt(child, 3615), proposalId: result.proposal.id });
    assert.equal(expired.freshness, "expired"); assert.equal(expired.revision_prerequisites_satisfied, false);
    assertRevisionDispatch(parent.plan, s.optionsAt(child, 20));
    const publicChild = s.successor(parent, "WPUBLIC", 300, "public");
    assert.throws(() => proposeRevision(publicChild.revisionRequest, s.optionsAt(publicChild, 15)), /ORDER_REVISION_CLASSIFICATION_CHANGE_UNSUPPORTED/);
    const forged = s.successor(parent, "WFORGED", 400);
    const store = loadVerifiedStore(parent.options.repository, parent.options.artifactRoot);
    const snapshot = { revision: store.manifest.manifest_revision, sha256: store.verification.manifest_sha256 };
    const payload = revisionPayload(forged.revisionRequest, parent.plan, forged.draft, snapshot, s.optionsAt(forged, 15).now);
    payload.changes = payload.changes.filter(row => row.path !== "/agents");
    assert.equal(validatePayload(payload, "order-revision-proposal").valid, true);
    const reference = s.persist(forged, "order-revision-proposals", payload, 15);
    const current = loadVerifiedStore(parent.options.repository, parent.options.artifactRoot);
    assert.throws(() => revisionProof(current, reference, s.optionsAt(forged, 20)), /ORDER_REVISION_REPLAY_MISMATCH/);
    assert.throws(() => assertRevisionPreparation(revisionPlan(payload, reference), s.optionsAt(forged, 20)), /ORDER_REVISION_REPLAY_MISMATCH/);
  });
  check("successor contexts prepare while predecessor tool authority remains fenced until exact supersession", () => {
    const parent = setup(), child = s.successor(parent);
    s.proposeRevision(child);
    const competitor = s.successor(parent, "WCOMPETING", 300); s.proposeRevision(competitor);
    s.stageAdoption(child); s.stageAdoption(competitor);
    child.adopted = decideOrder(child.decisionRequest, s.optionsAt(parent, 370));
    child.opened = openWave(child.plan, s.optionsAt(parent, 380));
    assert.throws(() => decideOrder(competitor.decisionRequest, s.optionsAt(parent, 400)), /ORDER_REVISION_COMPETING_SUCCESSOR/);
    assert.equal(child.opened.status, "ready"); assert.equal(child.opened.tool_execution_authorized, false);
    assert.throws(() => authorizeDispatchPolicy(s.optionsAt(parent, 430), child.policies[0]), /ORDER_REVISION_PREDECESSOR_NOT_SETTLED/);
    const report = { ...s.sample("mission-wave-report"), id: "MWR-REVISION-METADATA", mission_id: child.plan.mission_id, wave_id: child.plan.wave_id,
      plan_ref: child.opened.plan_ref, routing_preflight_ref: child.opened.routing_preflight_ref, recorded_at: s.optionsAt(parent, 430).now,
      agent_results: child.opened.context_packs.map(item => ({ ...s.sample("mission-wave-report").agent_results[0], agent_id: item.agent_id,
        context_pack_ref: item.context_pack_ref, evidence_refs: [child.revision.proposal_ref] })) };
    assert.throws(() => recordWave(report, s.optionsAt(parent, 430)), /control metadata as execution evidence: order-revision-proposals/);
    const request = s.termination(parent, child, 450);
    const wrong = { ...request, successor_plan_ref: parent.opened.plan_ref };
    assert.throws(() => assertRevisionSupersession(wrong, s.optionsAt(parent, 460)), /ORDER_REVISION_SUCCESSOR_MISMATCH/);
    terminateWave(request, s.optionsAt(parent, 460));
    assertRevisionDispatch(child.plan, s.optionsAt(parent, 470));
    authorizeDispatchPolicy(s.optionsAt(parent, 470), child.policies[0]);
    const lease = issueLease(s.optionsAt(parent, 470), child.policies[0].id, { sessionId: "revised-session", providerAgentId: "main" });
    assert.equal(lease.status, "active"); assert.equal(lease.release_authorized, false);
    const inspected = inspectRevision({ ...s.optionsAt(parent, 470), proposalId: child.revision.proposal.id });
    assert.equal(inspected.revision_prerequisites_satisfied, true); assert.equal(inspected.execution_authorized, false);
    const actor = { missionId: child.plan.mission_id, waveId: child.plan.wave_id, agentId: child.policies[0].agent_id,
      provider: "codex", sessionId: "revised-session", providerAgentId: "main" };
    const input = { session_id: actor.sessionId, cwd: child.options.repository, hook_event_name: "PreToolUse", tool_name: "Bash",
      tool_use_id: "revised-tool", tool_input: child.toolInput };
    assert.equal(admitToolRequest(s.optionsAt(parent, 480), actor, input).decision, "allow");
    assert.equal(completeToolRequest(s.optionsAt(parent, 490), actor, { ...input, hook_event_name: "PostToolUse" }).checkpoint.execution_result.status, "succeeded");
    revokeLease(s.optionsAt(parent, 500), lease.lease.id, "FIXTURE_COMPLETE");
    lineageParent = child;
  });
  check("expiry during cleanup retains old results and requires a fresh reviewed successor", () => {
    const parent = setup(), policy = parent.policies[0], options = s.optionsAt(parent, 80);
    authorizeDispatchPolicy(options, policy);
    const lease = issueLease(options, policy.id, { sessionId: "old-session", providerAgentId: "main" });
    const actor = { missionId: parent.plan.mission_id, waveId: parent.plan.wave_id, agentId: policy.agent_id,
      provider: "codex", sessionId: "old-session", providerAgentId: "main" };
    const input = { session_id: actor.sessionId, cwd: parent.options.repository, hook_event_name: "PreToolUse", tool_name: "Bash",
      tool_use_id: "old-tool", tool_input: parent.toolInput };
    assert.equal(admitToolRequest(s.optionsAt(parent, 90), actor, input).decision, "allow");
    const child = prepare(parent);
    assert.throws(() => assertRevisionDispatch(parent.plan, s.optionsAt(parent, 270)), /ORDER_REVISION_PARENT_REPLACED/);
    const held = admitToolRequest(s.optionsAt(parent, 270), actor, { ...input, tool_use_id: "extra-old-tool" });
    assert.equal(held.decision, "deny");
    const expiry = (Date.parse(child.plan.valid_until) - parent.epoch) / 1000 + 1;
    assert.throws(() => assertRevisionDispatch(parent.plan, s.optionsAt(parent, expiry)), /ORDER_REVISION_PARENT_REPLACED/);
    const completed = completeToolRequest(s.optionsAt(parent, expiry), actor, { ...input, hook_event_name: "PostToolUse" });
    assert.equal(completed.checkpoint.execution_result.status, "succeeded");
    assert.equal(completed.execution_authorized, false);
    revokeLease(s.optionsAt(parent, expiry + 10), lease.lease.id, "REPLACED_SCOPE");
    assert.throws(() => authorizeDispatchPolicy(s.optionsAt(parent, expiry + 20), child.policies[0]), /EXPIRED|expired/);
    assert.throws(() => terminateWave(s.termination(parent, child, expiry + 30), s.optionsAt(parent, expiry + 40)), /Successor plan is not currently valid/);
    const fresh = s.successor(parent, "WFRESH", expiry + 100); s.proposeRevision(fresh); s.adoptRevision(fresh);
    fresh.opened = openWave(fresh.plan, s.optionsAt(fresh, 70));
    terminateWave(s.termination(parent, fresh, expiry + 200), s.optionsAt(parent, expiry + 210));
    authorizeDispatchPolicy(s.optionsAt(parent, expiry + 220), fresh.policies[0]);
  });
  check("a later change follows the selected successor lineage even after its review expires", () => {
    const parent = lineageParent, child = s.successor(parent, "W3", 4000);
    s.proposeRevision(child); s.adoptRevision(child); child.opened = openWave(child.plan, s.optionsAt(child, 70));
    terminateWave(s.termination(parent, child, 4300), s.optionsAt(parent, 4310));
    authorizeDispatchPolicy(s.optionsAt(parent, 4320), child.policies[0]);
  });
  check("unknown predecessor effects survive revocation and cannot satisfy supersession", () => {
    const parent = setup(), policy = parent.policies[0];
    authorizeDispatchPolicy(s.optionsAt(parent, 80), policy);
    const lease = issueLease(s.optionsAt(parent, 80), policy.id, { sessionId: "unknown-session", providerAgentId: "main" });
    const actor = { missionId: parent.plan.mission_id, waveId: parent.plan.wave_id, agentId: policy.agent_id,
      provider: "codex", sessionId: "unknown-session", providerAgentId: "main" };
    const input = { session_id: actor.sessionId, cwd: parent.options.repository, hook_event_name: "PreToolUse", tool_name: "Bash",
      tool_use_id: "unknown-tool", tool_input: parent.toolInput };
    assert.equal(admitToolRequest(s.optionsAt(parent, 90), actor, input).decision, "allow");
    assert.equal(completeToolRequest(s.optionsAt(parent, 100), actor, { ...input, hook_event_name: "PostToolUseFailure" }).checkpoint.execution_result.external_effects, "unknown");
    const child = prepare(parent), request = s.termination(parent, child);
    assert.throws(() => terminateWave(request, s.optionsAt(parent, 310)), /UNRESOLVED_TOOL_EFFECTS/);
    revokeLease(s.optionsAt(parent, 320), lease.lease.id, "ATTEMPTED_REVOCATION");
    assert.throws(() => terminateWave(request, s.optionsAt(parent, 330)), /UNRESOLVED_TOOL_EFFECTS/);
    assert.throws(() => authorizeDispatchPolicy(s.optionsAt(parent, 340), child.policies[0]), /PREDECESSOR_NOT_SETTLED/);
    const store = loadVerifiedStore(parent.options.repository, parent.options.artifactRoot);
    const retained = store.manifest.artifacts.filter(entry => entry.mission_id === parent.plan.mission_id && entry.wave_id === parent.plan.wave_id)
      .map(entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 }));
    const forged = { ...s.sample("mission-wave-termination"), ...request, type: "MissionWaveTermination", id: "MWT-W1",
      request_sha256: digest(request), plan_valid_until: parent.plan.valid_until, retained_artifact_refs: retained,
      dispatch_settled: true, execution_completion_claimed: false, continuation_authorized: false, release_authorized: false,
      terminated_at: s.optionsAt(parent, 350).now };
    s.persist(parent, "mission-wave-terminations", forged, 350);
    assert.throws(() => authorizeDispatchPolicy(s.optionsAt(parent, 360), child.policies[0]), /CAMPAIGN_TERMINAL_PREMATURE_WAVE_TERMINATION/);
  });
  check("field comparison retains exact JSON values and reports additions, removals and escaped paths", () => {
    const rows = planChanges({ stable: false, removed: null, changed: [1], "a/b~c": 1 }, { stable: false, added: null, changed: [1, 2], "a/b~c": 2 });
    assert(rows.some(row => row.path === "/stable" && row.change === "retained" && row.before === false));
    assert(rows.some(row => row.path === "/removed" && row.change === "removed" && row.before === null && !Object.hasOwn(row, "after")));
    assert(rows.some(row => row.path === "/added" && row.change === "added" && row.after === null && !Object.hasOwn(row, "before")));
    assert(rows.some(row => row.path === "/a~1b~0c" && row.change === "changed"));
  });
  check("both provider wrappers propose and inspect outside the checkout and reject clock or missing-scope overrides", () => {
    const parent = s.environment(Date.now() - 600000); roots.push(parent.root); s.adopt(parent);
    parent.opened = openWave(parent.plan, s.optionsAt(parent, 70));
    for (const [index, folder] of ["codex-skills/controls-doctrine-operator", ".claude/skills/controls-doctrine-operator"].entries()) {
      const child = s.successor(parent, `WCLI${index}`, 200 + index * 100), script = path.resolve(folder, "scripts/revise_controls_order.js");
      const input = path.join(parent.root, `revision-${index}.json`); fs.writeFileSync(input, JSON.stringify(child.revisionRequest));
      const args = ["--repository", parent.options.repository, "--artifact-root", parent.options.artifactRoot];
      const call = rest => spawnSync(process.execPath, [script, ...rest], { cwd: parent.root, encoding: "utf8" });
      const result = call(["propose", ...args, "--input", input]); assert.equal(result.status, 0, result.stderr);
      const proposed = JSON.parse(result.stdout); assert.equal(proposed.execution_authorized, false);
      const adoptionInput = path.join(parent.root, `adoption-${index}.json`);
      child.plan = proposed.successor_plan; child.request.plan = child.plan;
      s.prepareSemanticReview(child, new Date().toISOString());
      fs.writeFileSync(adoptionInput, JSON.stringify(child.request));
      const adoption = spawnSync(process.execPath, [path.resolve(folder, "scripts/adopt_controls_order.js"), "propose", ...args, "--input", adoptionInput],
        { cwd: parent.root, encoding: "utf8" });
      assert.equal(adoption.status, 0, adoption.stderr); assert.equal(JSON.parse(adoption.stdout).execution_authorized, false);
      const inspected = call(["inspect", ...args, "--proposal-id", proposed.proposal.id]); assert.equal(inspected.status, 0, inspected.stderr);
      assert.equal(JSON.parse(inspected.stdout).revision_prerequisites_satisfied, false);
      for (const invalid of [["propose", ...args, "--input", input, "--now", "2030-01-01T00:00:00Z"],
        ["propose", "--input", input], ["propose", ...args, "--input", input, "--repository", parent.options.repository]]) {
        assert.notEqual(call(invalid).status, 0);
      }
    }
  });
  console.log(JSON.stringify({ total: passed, passed, failed: 0 }, null, 2));
} finally { roots.forEach(root => fs.rmSync(root, { recursive: true, force: true })); }
