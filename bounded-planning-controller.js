const path = require("node:path");
const { digest, same, AUTHORITY } = require("./order-intake-contract");
const { resolveRepository, writeRepositoryArtifact, manifestDigest } = require("./repository-artifact-store");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { replayDraft } = require("./request-order-compiler");
const { planDraftIssues, NONE } = require("./order-adoption-contract");
const { withinOrderReplay, retainedOrderReplay } = require("./order-replay-context");
const contract = require("./bounded-planning-contract");
const KIND = "bounded-planning-proposals", clone = value => JSON.parse(JSON.stringify(value));
const ref = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
const need = (value, code) => { if (!value) throw new Error(code); };
function valid(value, type) {
  const result = require("./validator-cli-prototype/validate").validatePayload(value, type);
  need(result.valid, `PLANNING_INVALID:${result.issues.map(item => item.code).join(",")}`);
}
function clock(options) { const now = options.now || new Date().toISOString(); need(Number.isFinite(Date.parse(now)), "PLANNING_CLOCK_INVALID"); return now; }
function load(options) { const repo = resolveRepository(options.repository); return loadVerifiedStore(repo.root, options.artifactRoot || path.join(repo.root, ".cannae/artifacts")); }
function read(store, reference, kind, type) {
  const payload = require("./effect-settlement-proof").loadSettlementArtifact(store, reference, kind, type);
  const entry = store.manifest.artifacts.find(item => same(ref(item), reference));
  need(entry && payload.id === entry.artifact_id && payload.mission_id === entry.mission_id && payload.wave_id === entry.wave_id, "PLANNING_REFERENCE_SCOPE_INVALID");
  return { payload, entry, ref: ref(entry) };
}
function parentPolicies(store, parent, adopted, supplied) {
  const before = require("./campaign-terminal-controller").prefixBeforeEntry(store, adopted.entry);
  return parent.dispatch_control.policy_authorizations.map(binding => {
    const candidates = [...supplied];
    for (const entry of before.manifest.artifacts.filter(item => item.mission_id === parent.mission_id && item.wave_id === parent.wave_id && item.kind === KIND)) {
      const payload = read(before, ref(entry), KIND, "bounded-planning-proposal").payload;
      candidates.push(...payload.policy_drafts);
    }
    const matches = candidates.filter(policy => policy.id === binding.policy_id && policy.agent_id === binding.agent_id && policy.provider === binding.provider &&
      policy.mission_id === parent.mission_id && policy.wave_id === parent.wave_id && require("./dispatch-runtime-controller").inputDigest(policy) === binding.draft_sha256);
    need(matches.length > 0 && matches.every(item => same(item, matches[0])), "PLANNING_PARENT_POLICY_PROOF_REQUIRED"); return matches[0];
  });
}
function remainingBudgets(store, parent, policies, now) {
  const budgets = {};
  const parentEntries = store.manifest.artifacts.filter(item => item.kind === "mission-wave-plans" && item.artifact_id === parent.id && item.mission_id === parent.mission_id && item.wave_id === parent.wave_id);
  need(parentEntries.length === 1, "PLANNING_PARENT_SCOPE_INVALID");
  for (const policy of policies) {
    const used = [];
    for (const entry of store.manifest.artifacts.filter(item => item.kind === "tool-admission-events" && item.mission_id === parent.mission_id && item.wave_id === parent.wave_id)) {
      const event = read(store, ref(entry), "tool-admission-events", "tool-admission-event").payload;
      if (event.agent_id !== policy.agent_id || event.decision !== "allow") continue;
      const beforeEvent = require("./campaign-terminal-controller").prefixBeforeEntry(store, entry);
      const compiled = read(beforeEvent, event.tool_policy_ref, "dispatch-tool-policies", "dispatch-tool-policy").payload;
      const { authorization, ...body } = compiled;
      // The real compiler replaces only the draft's proposed approval timestamp.
      need(same({ ...body, schema_version: "0.1", approved_at: policy.approved_at }, policy) &&
        authorization.draft_sha256 === require("./dispatch-runtime-controller").inputDigest(policy) && same(authorization.plan_ref, ref(parentEntries[0])) &&
        Date.parse(compiled.approved_at) >= Date.parse(policy.approved_at) && Date.parse(compiled.approved_at) <= Date.parse(event.decided_at) && event.provider === policy.provider &&
        Date.parse(event.decided_at) === Date.parse(entry.created_at) && Date.parse(event.decided_at) <= Date.parse(now) &&
        policy.tool_rules.some(rule => rule.rule_id === event.rule_id), "PLANNING_PARENT_ADMISSION_SCOPE_INVALID");
      used.push(event);
    }
    budgets[policy.agent_id] = { total: Math.max(0, policy.max_total_admissions - used.length), rules: Object.fromEntries(policy.tool_rules.map(rule =>
      [rule.rule_id, Math.max(0, rule.max_uses - used.filter(event => event.rule_id === rule.rule_id).length)])) };
  }
  return budgets;
}
function appraise(store, request, now, options) {
  valid(request, "bounded-planning-request");
  if (request.mode === "initial") need(!store.manifest.artifacts.some(item => item.mission_id === request.mission_id && item.wave_id === request.wave_id &&
    ["mission-wave-plans", "order-adoption-proposals", "order-adoption-records", "mission-wave-terminations", "mission-wave-closeouts"].includes(item.kind)), "PLANNING_WAVE_ALREADY_COMMITTED");
  if (request.mode === "initial") need(!store.manifest.artifacts.some(item => item.mission_id === request.mission_id && item.wave_id !== request.wave_id &&
    ["mission-wave-plans", "order-adoption-records", "mission-wave-terminations", "mission-wave-closeouts"].includes(item.kind)), "PLANNING_MISSION_REQUIRES_REVISION");
  const entry = store.manifest.artifacts.find(item => item.kind === "order-drafts" && same(ref(item), request.draft_ref));
  need(entry, "PLANNING_DRAFT_REQUIRED"); const draft = replayDraft(store, entry);
  need(draft.mission_id === request.mission_id && draft.wave_id === request.wave_id && draft.status === "ready_for_review" &&
    Date.parse(draft.compiled_at) <= Date.parse(now) && Date.parse(now) < Date.parse(draft.expires_at), "PLANNING_DRAFT_NOT_CURRENT_OR_READY");
  const tasks = draft.opord.execution.tasks, taskIds = tasks.map(item => item.id), source = draft.opord.command_and_signal.authority;
  need(tasks.length > 0 && tasks.length <= 64 && new Set(taskIds).size === tasks.length, "PLANNING_TASK_LIMIT_OR_DUPLICATE");
  for (const candidate of request.envelope.candidates) {
    need(candidate.allowed_task_ids.every(id => taskIds.includes(id)) && candidate.allowed_actions.every(action => source.requested.includes(action) &&
      !source.approval_required.includes(action) && !source.prohibited.includes(action)), "PLANNING_CANDIDATE_EXCEEDS_DRAFT");
  }
  let parent = null, budgets = null;
  if (request.mode === "revision") {
    const item = read(store, request.parent_plan_ref, "mission-wave-plans", "mission-wave-plan"); parent = item.payload;
    let ancestor = parent; const seen = new Set();
    while (ancestor.order_binding?.planning_ref) {
      const key = digest(ancestor.order_binding.planning_ref); need(!seen.has(key) && seen.size < 32, "PLANNING_LINEAGE_LIMIT_OR_CYCLE"); seen.add(key);
      const prior = read(store, ancestor.order_binding.planning_ref, KIND, "bounded-planning-proposal").payload;
      if (prior.request.mode === "initial") break;
      ancestor = read(store, prior.request.parent_plan_ref, "mission-wave-plans", "mission-wave-plan").payload;
    }
    const adopted = require("./order-adoption-controller").recordProof(store, request.parent_adoption_ref);
    need(adopted.payload.status === "adopted" && same(adopted.proposal.payload.request.plan, parent) && parent.mission_id === request.mission_id &&
      parent.wave_id !== request.wave_id && parent.dispatch_control?.required === true && Date.parse(parent.created_at) <= Date.parse(now) &&
      Date.parse(adopted.payload.recorded_at) <= Date.parse(now) && Date.parse(now) < Date.parse(parent.valid_until), "PLANNING_PARENT_SCOPE_INVALID");
    need(!store.manifest.artifacts.some(item => item.mission_id === parent.mission_id && item.wave_id === parent.wave_id &&
      ["mission-wave-terminations", "mission-wave-closeouts"].includes(item.kind)), "PLANNING_PARENT_TERMINAL");
    need(draft.opord.intent.purpose === adopted.proposal.draft.opord.intent.purpose && same(parent.mission_profile,
      { classification: draft.classification, risk_level: request.envelope.risk_level, roe_class: request.envelope.roe_class, release_target: request.envelope.release_target }), "PLANNING_PARENT_INTENT_OR_PROFILE_CHANGED");
    const controls = request.envelope.controls;
    need(same(controls.adaptive_work, parent.adaptive_work) && same(controls.method_control || null, parent.method_control || null) &&
      controls.model_assignment.required === parent.model_assignment.required, "PLANNING_PARENT_CONTROL_WEAKENED");
    need(!parent.intent_continuity || same(parent.intent_continuity, require("./intent-continuity-contract").defaultTree(parent)), "PLANNING_CUSTOM_INTENT_TREE_REQUIRES_REVIEW");
    const policies = parentPolicies(store, parent, adopted, request.parent_policy_drafts);
    budgets = remainingBudgets(store, parent, policies, now);
    for (const candidate of request.envelope.candidates) {
      const old = parent.agents.find(item => item.agent_id === candidate.agent_id), policy = policies.find(item => item.agent_id === candidate.agent_id), template = candidate.policy_template;
      need(old && policy && ["operational_role", "department", "model_billet_id", "delegated_authority"].every(key => old[key] === candidate[key]) &&
        candidate.allowed_actions.every(action => old.allowed_actions.includes(action)) && old.approval_required.every(action => candidate.approval_required.includes(action)) &&
        old.prohibited_actions.every(action => candidate.prohibited_actions.includes(action)), "PLANNING_PARENT_AGENT_SCOPE_EXPANDED");
      need(template.provider === policy.provider && template.max_total_admissions <= policy.max_total_admissions && template.lease_ttl_seconds <= policy.lease_ttl_seconds &&
        same(template.repository_state, policy.repository_state) && template.tool_rules.every(rule => policy.tool_rules.some(previous => {
          const { max_uses: before, ...left } = previous, { max_uses: after, ...right } = rule; return same(left, right) && after <= before;
        })), "PLANNING_PARENT_POLICY_EXPANDED");
    }
  }
  return { draft, parent, budgets };
}
function build(request, draft, parent, budgets, now, manifest) {
  const generated = contract.synthesize(request, draft, now, parent, budgets); delete generated.best;
  if (generated.plan) {
    valid(generated.plan, "mission-wave-plan");
    need(planDraftIssues(generated.plan, draft).length === 0 && require("./intent-continuity-contract").analyzePlan(generated.plan).issues.length === 0, "PLANNING_GENERATED_PLAN_INVALID");
    need(Date.parse(now) < Date.parse(generated.plan.valid_until), "PLANNING_PLAN_EXPIRED");
  }
  const value = { schema_version: "0.1", type: "BoundedPlanningProposal", mission_id: request.mission_id, wave_id: request.wave_id,
    request, request_sha256: digest(request), parent_plan_sha256: parent ? digest(parent) : "none", parent_budget_remaining: budgets, ...generated,
    status: generated.plan ? "ready_for_review" : "blocked", observed_manifest: { revision: manifest.manifest_revision, sha256: manifestDigest(manifest) },
    recorded_at: now, expires_at: generated.plan?.valid_until || new Date(Math.min(Date.parse(draft.expires_at), Date.parse(now) + 300000,
      parent ? Date.parse(parent.valid_until) : Infinity)).toISOString(),
    classification: draft.classification, generation_class: "bounded_structural_synthesis_v1", model_invocations: 0,
    semantic_completeness_proven: false, readiness_attested: false, provider_cost_cap_enforced: false, ...AUTHORITY };
  return { ...value, id: `BPP-${digest(value).slice(0, 32)}` };
}
function proposalProof(store, reference, options) {
  const item = read(store, reference, KIND, "bounded-planning-proposal");
  return clone(retainedOrderReplay(store, `bounded-planning:${digest(reference)}`, () => {
    const before = require("./campaign-terminal-controller").prefixBeforeEntry(store, item.entry), value = item.payload;
    need(Date.parse(value.recorded_at) === Date.parse(item.entry.created_at), "PLANNING_HISTORY_INVALID");
    const proof = appraise(before, value.request, value.recorded_at, { ...options, now: value.recorded_at });
    need(same(value, build(value.request, proof.draft, proof.parent, proof.budgets, value.recorded_at, before.manifest)), "PLANNING_REPLAY_MISMATCH");
    return { ...item, ...proof };
  }));
}
function planFor(item) { need(item.payload.plan, "PLANNING_PROPOSAL_BLOCKED"); const plan = clone(item.payload.plan); plan.order_binding.planning_ref = item.ref; return plan; }
function assertPlanning(plan, options, knownStore, allowUnlinkedRevision = false) {
  const store = knownStore || load(options), reference = plan.order_binding?.planning_ref;
  const entries = store.manifest.artifacts.filter(item => item.kind === KIND && item.mission_id === plan.mission_id && item.wave_id === plan.wave_id);
  if (!reference && !entries.length) return null;
  need(reference, "PLANNING_BINDING_REQUIRED"); const item = proposalProof(store, reference, options), now = clock(options);
  need(item.payload.status === "ready_for_review" && Date.parse(item.payload.recorded_at) <= Date.parse(now) && Date.parse(now) < Date.parse(item.payload.expires_at), "PLANNING_PROPOSAL_EXPIRED_OR_BLOCKED");
  if (item.payload.request.mode === "initial") need(!store.manifest.artifacts.some(entry => entry.mission_id === plan.mission_id && entry.wave_id !== plan.wave_id &&
    ["mission-wave-plans", "order-adoption-records", "mission-wave-terminations", "mission-wave-closeouts"].includes(entry.kind)), "PLANNING_MISSION_REQUIRES_REVISION");
  if (item.payload.request.mode === "revision") {
    const adopted = require("./order-adoption-controller").recordProof(store, item.payload.request.parent_adoption_ref);
    const current = remainingBudgets(store, item.parent, parentPolicies(store, item.parent, adopted, item.payload.request.parent_policy_drafts), now);
    need(item.payload.policy_drafts.every(policy => policy.max_total_admissions <= current[policy.agent_id].total &&
      policy.tool_rules.every(rule => rule.max_uses <= current[policy.agent_id].rules[rule.rule_id])), "PLANNING_PARENT_BUDGET_CHANGED");
  }
  let expected = planFor(item);
  if (item.payload.request.mode === "revision" && !allowUnlinkedRevision) {
    need(plan.order_binding.revision_ref, "PLANNING_REVISION_BINDING_REQUIRED");
    const revision = require("./order-revision-controller").revisionProof(store, plan.order_binding.revision_ref, options);
    need(same(revision.payload.request.successor_plan, expected) && same(revision.payload.request.parent_plan_ref, item.payload.request.parent_plan_ref) &&
      same(revision.payload.request.parent_adoption_ref, item.payload.request.parent_adoption_ref), "PLANNING_REVISION_SCOPE_MISMATCH");
    expected = require("./order-revision-contract").revisionPlan(revision.payload, revision.ref);
  }
  need(same(plan, expected), "PLANNING_PLAN_SUBSTITUTED"); return item;
}
function generatePlan(input, options) {
  need(Buffer.byteLength(JSON.stringify(input)) <= 1048576, "PLANNING_INPUT_LIMIT");
  const request = clone(input), store = load(options), now = clock(options); valid(request, "bounded-planning-request");
  const existing = store.manifest.artifacts.filter(item => item.kind === KIND && item.mission_id === request.mission_id && item.wave_id === request.wave_id)
    .map(entry => read(store, ref(entry), KIND, "bounded-planning-proposal")).find(item => same(item.payload.request, request));
  if (existing) {
    const item = proposalProof(store, existing.ref, options);
    need(Date.parse(item.payload.recorded_at) <= Date.parse(now) && Date.parse(now) < Date.parse(item.payload.expires_at), "PLANNING_PROPOSAL_EXPIRED_OR_BLOCKED");
    return { type: "BoundedPlanningOperation", action: "generate", proposal: item.payload, proposal_ref: item.ref, plan: item.payload.plan ? planFor(item) : null, existing: true, ...AUTHORITY };
  }
  const proof = appraise(store, request, now, options), payload = build(request, proof.draft, proof.parent, proof.budgets, now, store.manifest); valid(payload, "bounded-planning-proposal");
  const saved = writeRepositoryArtifact({ repositoryPath: store.verification.repository.root, artifactRoot: store.artifactRoot, missionId: payload.mission_id,
    waveId: payload.wave_id, kind: KIND, artifactId: payload.id, payload, createdAt: now, reuseExisting: true, publicationGuard: ({ manifest }) => withinOrderReplay(() => {
      const current = load(options), time = clock(options);
      need(manifestDigest(manifest) === store.verification.manifest_sha256 && current.verification.manifest_sha256 === store.verification.manifest_sha256 &&
        Date.parse(time) >= Date.parse(now) && Date.parse(time) < Date.parse(payload.expires_at), "PLANNING_PUBLICATION_CHANGED_OR_EXPIRED");
      const fresh = appraise(current, request, time, options);
      need(same(fresh.draft, proof.draft) && same(fresh.parent, proof.parent), "PLANNING_PUBLICATION_SOURCE_CHANGED"); return true;
    }, true) });
  const reference = { artifact_id: payload.id, relative_path: saved.relative_path, sha256: saved.sha256 };
  return { type: "BoundedPlanningOperation", action: "generate", proposal: payload, proposal_ref: reference, plan: payload.plan ? planFor({ payload, ref: reference }) : null, existing: false, ...AUTHORITY };
}
function prepareRevision(reference, options) {
  const store = load(options), item = proposalProof(store, reference, options), plan = planFor(item);
  need(item.payload.request.mode === "revision", "PLANNING_REVISION_REQUIRED"); assertPlanning(plan, options, store, true);
  const result = require("./order-revision-controller").proposeRevision({ schema_version: "0.1", type: "OrderRevisionRequest", id: `ORR-${digest(reference).slice(0, 32)}`,
    mission_id: plan.mission_id, wave_id: plan.wave_id, parent_plan_ref: item.payload.request.parent_plan_ref, parent_adoption_ref: item.payload.request.parent_adoption_ref,
    change_request_ref: item.draft.request_ref, successor_plan: plan, ...require("./order-adoption-contract").ADOPTION_AUTHORITY }, options);
  return { ...result, type: "BoundedPlanningOperation", action: "prepare_revision" };
}
function main(argv = process.argv.slice(2)) {
  const [action, ...rest] = argv, options = {};
  need(["generate", "inspect", "prepare-revision"].includes(action) && rest.length % 2 === 0, "Usage: bounded-planning-controller.js <generate|inspect|prepare-revision> --repository <target> [options]");
  for (let index = 0; index < rest.length; index += 2) {
    const key = { "--repository": "repository", "--artifact-root": "artifactRoot", "--input": "input", "--proposal-id": "proposalId" }[rest[index]], value = rest[index + 1];
    need(key && options[key] === undefined && value && !value.startsWith("--"), "PLANNING_CLI_OPTION_INVALID"); options[key] = value;
  }
  need(options.repository && (action === "generate" ? options.input && !options.proposalId : options.proposalId && !options.input), "PLANNING_CLI_INPUT_REQUIRED");
  let result;
  if (action === "generate") {
    const fs = require("node:fs"), stat = fs.statSync(options.input); need(stat.isFile() && stat.size <= 1048576, "PLANNING_INPUT_LIMIT");
    result = generatePlan(JSON.parse(fs.readFileSync(options.input, "utf8")), options);
  }
  else {
    const store = load(options), entries = store.manifest.artifacts.filter(item => item.kind === KIND && item.artifact_id === options.proposalId);
    need(entries.length === 1, "PLANNING_PROPOSAL_NOT_FOUND");
    if (action === "prepare-revision") result = prepareRevision(ref(entries[0]), options);
    else { const item = proposalProof(store, ref(entries[0]), options); result = { type: "BoundedPlanningOperation", action: "inspect", proposal: item.payload, proposal_ref: item.ref,
      plan: item.payload.plan ? planFor(item) : null, freshness: Date.parse(clock(options)) < Date.parse(item.payload.expires_at) ? "current" : "expired", ...AUTHORITY }; }
  }
  console.log(JSON.stringify(result, null, 2));
}
const scoped = fn => (...args) => withinOrderReplay(() => fn(...args));
module.exports = { generatePlan: scoped(generatePlan), prepareRevision: scoped(prepareRevision), proposalProof: scoped(proposalProof), assertPlanning: scoped(assertPlanning), main };
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
