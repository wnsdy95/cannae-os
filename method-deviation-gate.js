#!/usr/bin/env node

const path = require("path");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { loadSettlementArtifact } = require("./effect-settlement-proof");
const { prefixBeforeEntry } = require("./campaign-terminal-controller");
const { writeRepositoryArtifact } = require("./repository-artifact-store");
const { digest, same } = require("./order-intake-contract");
const { baseline, methods, identified, assertMethodPolicy, clone } = require("./method-deviation-contract");

const DEVIATIONS = "method-deviation-events", REPORTS = "initiative-deviation-reports", INCIDENTS = "degeneration-incidents";
const historicalPrefixes = new WeakMap();
const requireTrue = (value, code) => { if (!value) throw new Error(code); };
const reference = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
const sameRef = (a, b) => Boolean(a && b && same(a, b));
const at = value => { const n = typeof value === "string" ? Date.parse(value) : NaN; requireTrue(Number.isFinite(n), "METHOD_TIME_INVALID"); return n; };
function now(options) { const value = options.now || new Date().toISOString(); at(value); return value; }
function requestFields(value, required, optional = []) {
  requireTrue(value && typeof value === "object" && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => [...required, ...optional].includes(key)), "METHOD_REQUEST_FIELD_FORBIDDEN");
}
function load(options) { return loadVerifiedStore(options.repository, options.artifactRoot || path.join(options.repository, ".cannae", "artifacts")); }
function read(store, ref, kind, type, scope = {}) {
  const payload = loadSettlementArtifact(store, ref, kind, type);
  const entry = store.manifest.artifacts.find(item => sameRef(reference(item), ref));
  requireTrue(entry && payload.id === entry.artifact_id && payload.mission_id === entry.mission_id &&
    (payload.wave_id === undefined || payload.wave_id === entry.wave_id) &&
    (!scope.mission_id || entry.mission_id === scope.mission_id) && (!scope.wave_id || entry.wave_id === scope.wave_id) &&
    (!scope.agent_id || payload.agent_id === undefined || payload.agent_id === scope.agent_id), "METHOD_REFERENCE_SCOPE_MISMATCH");
  return { entry, payload, ref: reference(entry) };
}
function records(store, scope, kind, type) {
  return store.manifest.artifacts.filter(entry => entry.kind === kind && entry.mission_id === scope.mission_id &&
    (!scope.wave_id || entry.wave_id === scope.wave_id)).map(entry => read(store, reference(entry), kind, type))
    .filter(item => !scope.agent_id || item.payload.agent_id === undefined || item.payload.agent_id === scope.agent_id);
}
// The manifest is sorted inventory; verified introduction prefixes establish causality.
function before(store, item) {
  let cache = historicalPrefixes.get(store);
  if (!cache) { cache = new Map(); historicalPrefixes.set(store, cache); }
  const key = digest(item.ref);
  if (!cache.has(key)) cache.set(key, prefixBeforeEntry(store, item.entry));
  return cache.get(key);
}
function precedes(store, first, second) {
  return before(store, second).manifest.artifacts.some(entry => sameRef(reference(entry), first.ref)) &&
    at(first.entry.created_at) <= at(second.entry.created_at);
}
function driftDenials(store, missionId) {
  return records(store, { mission_id: missionId }, "tool-admission-events", "tool-admission-event")
    .filter(item => item.payload.decision === "deny" && item.payload.reason_codes.some(code => code.startsWith("METHOD_DRIFT_")));
}
function assertNoMethodDrift(options, missionId, store = load(options)) {
  requireTrue(driftDenials(store, missionId).length === 0, "METHOD_DRIFT_REVIEW_REQUIRED");
}
function scopeForLease(store, leaseRef) {
  const lease = read(store, leaseRef, "agent-dispatch-leases", "agent-dispatch-lease");
  const plan = read(store, lease.payload.plan_ref, "mission-wave-plans", "mission-wave-plan", lease.payload);
  if (!plan.payload.method_control) return { lease, plan, agent: null };
  const context = read(store, lease.payload.context_pack_ref, "agent-context-packs", "agent-context-pack", lease.payload);
  const policy = read(store, lease.payload.tool_policy_ref, "dispatch-tool-policies", "dispatch-tool-policy", lease.payload);
  const assignment = require("./intent-continuity-contract").assertIntentContext(context.payload, plan.payload);
  assertMethodPolicy(plan.payload, policy.payload);
  return { lease, plan, context, policy, assignment, agent: baseline(plan.payload, lease.payload.agent_id) };
}
function deviationProof(store, ref, bundle, checkpointRef, evaluatedAt) {
  const item = read(store, ref, DEVIATIONS, "method-deviation-event", bundle.lease.payload), value = item.payload;
  const step = bundle.agent.steps.find(step => step.step_id === value.step_id);
  const method = step?.alternatives.find(method => method.method_id === value.method_id);
  requireTrue(method && sameRef(value.lease_ref, bundle.lease.ref) && sameRef(value.plan_ref, bundle.plan.ref) &&
    sameRef(value.context_ref, bundle.context.ref) && sameRef(value.policy_ref, bundle.policy.ref) &&
    (!checkpointRef || sameRef(value.checkpoint_ref, checkpointRef)) && value.baseline_sha256 === digest(bundle.agent) &&
    value.intent_sha256 === digest(bundle.assignment) && value.input_sha256 === method.input_sha256 && value.rule_id === method.rule_id &&
    value.tool_name === method.tool_name && value.report_timing === method.report_timing && at(value.recorded_at) === at(item.entry.created_at) &&
    at(value.expires_at) <= at(value.recorded_at) + bundle.plan.payload.method_control.max_deviation_age_seconds * 1000 &&
    at(value.expires_at) <= at(bundle.lease.payload.expires_at) && at(value.expires_at) <= at(bundle.plan.payload.valid_until), "METHOD_DEVIATION_BINDING_INVALID");
  const checkpoint = read(store, value.checkpoint_ref, "agent-execution-checkpoints", "agent-execution-checkpoint", value);
  requireTrue(sameRef(checkpoint.payload.lease_ref, bundle.lease.ref) && checkpoint.payload.lease_status === "active" &&
    precedes(store, bundle.lease, item) && precedes(store, checkpoint, item), "METHOD_DEVIATION_PREDECESSOR_INVALID");
  if (evaluatedAt) requireTrue(at(value.recorded_at) <= at(evaluatedAt) && at(evaluatedAt) < at(value.expires_at), "METHOD_DEVIATION_STALE");
  return item;
}
function decisionProof(store, decisionRef, deviation, evaluatedAt) {
  const item = read(store, decisionRef, "decision-logs", "decision-log", deviation.payload), value = item.payload;
  const option = `acknowledge_method:${deviation.payload.id}`;
  requireTrue(value.decision_maker === "USER" && value.decision_type === "scope" && value.status === "complete" &&
    value.authority_basis.basis_type === "retained_authority" && value.authority_basis.reference === deviation.payload.id &&
    value.chosen_option === option && value.options_considered.includes(option) &&
    same([...value.affected_artifacts].sort(), [deviation.ref.relative_path]) && precedes(store, deviation, item) &&
    at(value.decided_at) >= at(deviation.payload.recorded_at) && at(value.decided_at) <= at(item.entry.created_at) &&
    at(item.entry.created_at) <= at(evaluatedAt) && at(evaluatedAt) < at(deviation.payload.expires_at), "METHOD_USER_ACKNOWLEDGMENT_REQUIRED");
  const conflict = records(store, deviation.payload, "decision-logs", "decision-log").some(other => !sameRef(other.ref, item.ref) &&
    other.payload.decision_maker === "USER" && other.payload.decision_type === "scope" && other.payload.status === "complete" &&
    other.payload.authority_basis.reference === deviation.payload.id && at(other.payload.decided_at) >= at(value.decided_at));
  requireTrue(!conflict, "METHOD_USER_ACKNOWLEDGMENT_CONFLICT");
  return item;
}
function sitrepFor(deviation, phase, decisionRef, completion, recordedAt) {
  const value = deviation.payload, failed = completion && completion.payload.execution_result.status !== "succeeded";
  return { id: `SITREP-${digest({ deviation: deviation.ref, phase, decisionRef, result: completion?.ref || null }).slice(0, 32)}`,
    mission_id: value.mission_id, timestamp: recordedAt, status: phase === "before" ? "in_progress" : failed ? "blocked" : "complete",
    completed: [`Method ${value.step_id}: ${value.method_id}; ${value.tool_name}; input ${value.input_sha256}.`,
      `Rationale: ${value.rationale}`, phase === "before" ? `Exact USER acknowledgment: ${decisionRef.artifact_id}. No authority expansion.` :
        `Observed result: ${completion.payload.execution_result.status}; checkpoint ${completion.ref.artifact_id}; result ${digest(completion.payload.execution_result)}.`],
    in_progress: phase === "before" ? ["Await ordinary dispatch admission; acknowledgment is not execution permission."] : [],
    blocked: failed ? ["The failed result remains subject to ordinary effect settlement and revocation."] : [],
    ccir: failed ? [{ type: "FFIR", item: "Method execution failed.", action: "Preserve unknown effects and use the existing settlement procedure." }] : [],
    risk: failed ? ["Unresolved effects are not cleared by this report."] : [],
    next_action: [phase === "before" ? "Apply ordinary tool and method admission." : "Continue only within current unexpired authority; report does not renew it."] };
}
function completionFor(store, admission) {
  const matches = records(store, admission.payload, "agent-execution-checkpoints", "agent-execution-checkpoint")
    .filter(item => sameRef(item.payload.tool_admission_ref, admission.ref) && item.payload.checkpoint_kind === "post_tool");
  requireTrue(matches.length <= 1, "METHOD_RESULT_AMBIGUOUS");
  if (!matches.length) return null;
  const result = matches[0];
  requireTrue(sameRef(result.payload.lease_ref, admission.payload.lease_ref) && precedes(store, admission, result), "METHOD_RESULT_BINDING_INVALID");
  return result;
}
function reportProof(store, report, deviation, admission = null, completion = null) {
  const value = report.payload;
  requireTrue(sameRef(value.deviation_ref, deviation.ref) && precedes(store, deviation, report) &&
    at(value.recorded_at) === at(report.entry.created_at), "METHOD_REPORT_BINDING_INVALID");
  const prefix = before(store, report);
  let decision;
  if (value.phase === "before") {
    requireTrue(deviation.payload.report_timing === "before_and_after", "METHOD_BEFORE_REPORT_NOT_REQUIRED");
    decision = decisionProof(prefix, value.decision_ref, deviation, value.recorded_at);
    requireTrue(!records(prefix, deviation.payload, "tool-admission-events", "tool-admission-event")
      .some(item => sameRef(item.payload.method_binding?.deviation_ref, deviation.ref)), "METHOD_BEFORE_REPORT_TOO_LATE");
  } else {
    requireTrue(admission && completion && sameRef(value.admission_ref, admission.ref) &&
      sameRef(value.result_checkpoint_ref, completion.ref) && value.result_sha256 === digest(completion.payload.execution_result) &&
      precedes(store, completion, report), "METHOD_REPORT_RESULT_MISMATCH");
  }
  const sitrep = read(store, value.sitrep_ref, "sitreps", "sitrep", { mission_id: value.mission_id, wave_id: value.wave_id });
  requireTrue(precedes(store, decision || completion, sitrep) && precedes(store, sitrep, report) &&
    at(sitrep.payload.timestamp) === at(sitrep.entry.created_at) && at(sitrep.payload.timestamp) <= at(value.recorded_at) &&
    same(sitrep.payload, sitrepFor(deviation, value.phase, value.decision_ref, completion, sitrep.payload.timestamp)),
    "METHOD_SITREP_REPLAY_MISMATCH");
  return report;
}
function reportsFor(store, deviation, phase) {
  const values = records(store, deviation.payload, REPORTS, "initiative-deviation-report")
    .filter(item => item.payload.phase === phase && sameRef(item.payload.deviation_ref, deviation.ref));
  requireTrue(values.length <= 1, "METHOD_REPORT_AMBIGUOUS"); return values;
}

function methodState(store, plan, agentId) {
  const agent = baseline(plan.payload, agentId);
  if (!agent) return { configured: false, completed_steps: [], pending_reports: [] };
  const scope = { mission_id: plan.payload.mission_id, wave_id: plan.payload.wave_id, agent_id: agentId };
  const admissions = records(store, scope, "tool-admission-events", "tool-admission-event").filter(item => item.payload.decision === "allow")
    .sort((left, right) => before(store, left).manifest.manifest_revision - before(store, right).manifest.manifest_revision);
  let next = 0;
  const completed = [], pendingReports = [], reportBoundaries = [];
  for (const admission of admissions) {
    requireTrue(reportBoundaries.every(report => report && precedes(store, report, admission)), "METHOD_ADMISSION_REPORTING_DRIFT");
    const bundle = scopeForLease(store, admission.payload.lease_ref), binding = admission.payload.method_binding;
    const step = agent.steps[next], method = step && methods(step).find(item => item.method_id === binding?.method_id);
    requireTrue(sameRef(bundle.plan.ref, plan.ref) && binding && step && method && binding.step_id === step.step_id && binding.baseline_sha256 === digest(agent) &&
      method.input_sha256 === admission.payload.tool_input_sha256 && method.rule_id === admission.payload.rule_id &&
      method.tool_name === admission.payload.tool_name, "METHOD_ADMISSION_HISTORY_INVALID");
    let deviation;
    if (binding.method_id === "planned") requireTrue(binding.deviation_ref === null, "METHOD_PLANNED_BINDING_INVALID");
    else {
      deviation = deviationProof(store, binding.deviation_ref, bundle, admission.payload.checkpoint_ref, admission.payload.decided_at);
      requireTrue(precedes(store, deviation, admission) && deviation.payload.step_id === step.step_id && deviation.payload.method_id === method.method_id,
        "METHOD_DEVIATION_ORDER_INVALID");
      if (method.report_timing === "before_and_after") {
        const before = reportsFor(store, deviation, "before");
        requireTrue(before.length === 1 && precedes(store, before[0], admission), "METHOD_BEFORE_REPORT_REQUIRED");
        reportProof(store, before[0], deviation);
        decisionProof(prefixBeforeEntry(store, admission.entry), before[0].payload.decision_ref, deviation, admission.payload.decided_at);
      }
    }
    const completion = completionFor(store, admission);
    if (completion?.payload.execution_result.status === "succeeded") { completed.push(step.step_id); next++; }
    if (deviation && completion) {
      const after = reportsFor(store, deviation, "after");
      if (after.length) reportProof(store, after[0], deviation, admission, completion);
      else pendingReports.push({ deviation_ref: deviation.ref, admission_ref: admission.ref, result_checkpoint_ref: completion.ref });
      reportBoundaries.push(after[0] || null);
    }
  }
  return { configured: true, completed_steps: completed, pending_reports: pendingReports, next_step: agent.steps[next] || null };
}

function assessMethodRequest(options, lease, checkpoint, rule, hookInput, verifiedView) {
  if (verifiedView && !scopeForLease(verifiedView, lease.ref).agent) return { configured: false };
  const store = load(options), bundle = scopeForLease(store, lease.ref);
  if (!bundle.agent) return { configured: false };
  assertNoMethodDrift(options, lease.payload.mission_id, store);
  const state = methodState(store, bundle.plan, lease.payload.agent_id);
  if (state.pending_reports.length) return { configured: true, code: "METHOD_DRIFT_REPORTING", drift: true };
  const step = state.next_step;
  const input = require("./dispatch-runtime-controller").inputDigest(hookInput.tool_input);
  const method = step && methods(step).find(item => item.tool_name === hookInput.tool_name && item.input_sha256 === input && item.rule_id === rule?.rule_id);
  if (!method) return { configured: true, code: "METHOD_DRIFT_SEQUENCE_OR_SCOPE", drift: true };
  const binding = { baseline_sha256: digest(bundle.agent), step_id: step.step_id, method_id: method.method_id, deviation_ref: null };
  if (method.method_id !== "planned") {
    const candidates = records(store, lease.payload, DEVIATIONS, "method-deviation-event").filter(item =>
      item.payload.step_id === step.step_id && item.payload.method_id === method.method_id && sameRef(item.payload.lease_ref, lease.ref) &&
      sameRef(item.payload.checkpoint_ref, checkpoint.ref));
    requireTrue(candidates.length <= 1, "METHOD_DEVIATION_AMBIGUOUS");
    if (!candidates.length) return { configured: true, code: "METHOD_DEVIATION_REQUIRED", drift: false };
    const deviation = deviationProof(store, candidates[0].ref, bundle, checkpoint.ref, now(options));
    if (method.report_timing === "before_and_after") {
      const before = reportsFor(store, deviation, "before");
      if (!before.length) return { configured: true, code: "METHOD_BEFORE_REPORT_REQUIRED", drift: false };
      reportProof(store, before[0], deviation); decisionProof(store, before[0].payload.decision_ref, deviation, now(options));
    }
    binding.deviation_ref = deviation.ref;
  }
  return { configured: true, binding };
}
function assertMethodComplete(options, leaseRef, verifiedView) {
  if (verifiedView && !scopeForLease(verifiedView, leaseRef).agent) return;
  const store = load(options), bundle = scopeForLease(store, leaseRef);
  if (!bundle.agent) return;
  assertNoMethodDrift(options, bundle.lease.payload.mission_id, store);
  const state = methodState(store, bundle.plan, bundle.lease.payload.agent_id);
  requireTrue(state.pending_reports.length === 0, "METHOD_AFTER_REPORT_REQUIRED");
  requireTrue(state.next_step === null, "METHOD_REQUIRED_STEP_INCOMPLETE");
}
function assertMethodWaveReport(options, plan, report) {
  if (!plan.method_control) return;
  const store = load(options);
  for (const result of report.agent_results.filter(item => item.status === "complete")) {
    const planEntry = store.manifest.artifacts.find(entry => entry.kind === "mission-wave-plans" && entry.artifact_id === plan.id &&
      entry.mission_id === plan.mission_id && entry.wave_id === plan.wave_id);
    requireTrue(planEntry, "METHOD_PLAN_NOT_RETAINED");
    assertNoMethodDrift(options, plan.mission_id, store);
    const state = methodState(store, read(store, reference(planEntry), "mission-wave-plans", "mission-wave-plan"), result.agent_id);
    requireTrue(state.pending_reports.length === 0 && state.next_step === null, "METHOD_WAVE_NOT_COMPLETE");
  }
}
function publish(options, payload, kind, appraise) {
  const validation = require("./validator-cli-prototype/validate").validatePayload(payload,
    { MethodDeviationEvent: "method-deviation-event", InitiativeDeviationReport: "initiative-deviation-report", DegenerationIncidentEvent: "degeneration-incident-event", undefined: "sitrep" }[payload.type]);
  requireTrue(validation.valid, `METHOD_RECORD_INVALID:${validation.issues.map(item => item.code).join(",")}`);
  const result = writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: options.artifactRoot,
    missionId: payload.mission_id, waveId: options.waveId || payload.wave_id, kind, artifactId: payload.id,
    payload, createdAt: payload.recorded_at || payload.timestamp, reuseExisting: true,
    publicationGuard: () => { appraise(load(options), now(options)); return true; } });
  return { artifact_id: payload.id, relative_path: result.relative_path, sha256: result.sha256 };
}
function activeBundle(options, leaseId) {
  const store = load(options);
  const entries = store.manifest.artifacts.filter(item => item.kind === "agent-dispatch-leases" && item.artifact_id === leaseId);
  requireTrue(entries.length === 1, "METHOD_LEASE_REQUIRED");
  const bundle = scopeForLease(store, reference(entries[0])); requireTrue(bundle.agent, "METHOD_CONTROL_NOT_CONFIGURED");
  const lease = bundle.lease.payload;
  const identity = { missionId: lease.mission_id, waveId: lease.wave_id, agentId: lease.agent_id, provider: lease.provider,
    sessionId: lease.session_binding.session_id, providerAgentId: lease.session_binding.provider_agent_id };
  const active = require("./dispatch-runtime-controller").activeLease(options, identity, now(options));
  requireTrue(active.code === "LEASE_ACTIVE" && sameRef(active.leaseRecord.ref, bundle.lease.ref), `METHOD_LEASE_NOT_ACTIVE:${active.code}`);
  return { ...bundle, store, checkpoint: active.checkpointRecord };
}
function proposeMethod(options, request) {
  requestFields(request, ["leaseId", "stepId", "methodId", "rationale"]);
  request = clone(request);
  const evaluatedAt = now(options);
  const appraise = () => {
    const bundle = activeBundle(options, request.leaseId), state = methodState(bundle.store, bundle.plan, bundle.lease.payload.agent_id);
    requireTrue(state.pending_reports.length === 0 && state.next_step?.step_id === request.stepId, "METHOD_STEP_NOT_CURRENT");
    const method = state.next_step.alternatives.find(item => item.method_id === request.methodId);
    requireTrue(method && typeof request.rationale === "string" && request.rationale.trim(), "METHOD_ALTERNATIVE_REQUIRED");
    const value = identified("MethodDeviationEvent", { mission_id: bundle.lease.payload.mission_id, wave_id: bundle.lease.payload.wave_id,
      agent_id: bundle.lease.payload.agent_id, plan_ref: bundle.plan.ref, context_ref: bundle.context.ref, lease_ref: bundle.lease.ref,
      policy_ref: bundle.policy.ref, checkpoint_ref: bundle.checkpoint.ref, baseline_sha256: digest(bundle.agent), intent_sha256: digest(bundle.assignment),
      step_id: request.stepId, method_id: request.methodId, tool_name: method.tool_name, rule_id: method.rule_id,
      input_sha256: method.input_sha256, report_timing: method.report_timing, rationale: request.rationale,
      recorded_at: evaluatedAt, expires_at: new Date(Math.min(at(bundle.lease.payload.expires_at), at(bundle.plan.payload.valid_until),
        at(evaluatedAt) + bundle.plan.payload.method_control.max_deviation_age_seconds * 1000)).toISOString() });
    requireTrue(at(now(options)) < at(value.expires_at), "METHOD_DEVIATION_STALE");
    requireTrue(at(now(options)) >= at(evaluatedAt), "METHOD_CLOCK_ROLLBACK");
    const existing = records(bundle.store, bundle.lease.payload, DEVIATIONS, "method-deviation-event").filter(item =>
      item.payload.step_id === request.stepId && item.payload.method_id === request.methodId && sameRef(item.payload.lease_ref, bundle.lease.ref) &&
      sameRef(item.payload.checkpoint_ref, bundle.checkpoint.ref));
    requireTrue(existing.length === 0 || (existing.length === 1 && same(existing[0].payload, value)), "METHOD_DEVIATION_ALREADY_RECORDED");
    return value;
  };
  const value = appraise(), ref = publish(options, value, DEVIATIONS, () => requireTrue(same(appraise(), value), "METHOD_PROPOSAL_CHANGED"));
  return { event: value, artifact_ref: ref };
}

function reportMethod(options, request) {
  requestFields(request, ["deviationRef", "phase"], ["decisionRef"]);
  request = clone(request);
  const evaluatedAt = now(options);
  const appraisal = store => {
    requireTrue(at(now(options)) >= at(evaluatedAt), "METHOD_CLOCK_ROLLBACK");
    const deviation = read(store, request.deviationRef, DEVIATIONS, "method-deviation-event");
    const bundle = scopeForLease(store, deviation.payload.lease_ref);
    deviationProof(store, deviation.ref, bundle, null, request.phase === "before" ? now(options) : null);
    let admission = null, completion = null;
    if (request.phase === "before") {
      requireTrue(deviation.payload.report_timing === "before_and_after", "METHOD_BEFORE_REPORT_NOT_REQUIRED");
      const active = activeBundle(options, bundle.lease.payload.id);
      requireTrue(sameRef(active.checkpoint.ref, deviation.payload.checkpoint_ref), "METHOD_BEFORE_CHECKPOINT_CHANGED");
      decisionProof(store, request.decisionRef, deviation, now(options));
      requireTrue(!records(store, deviation.payload, "tool-admission-events", "tool-admission-event")
        .some(item => sameRef(item.payload.method_binding?.deviation_ref, deviation.ref)), "METHOD_BEFORE_REPORT_TOO_LATE");
      requireTrue(!records(store, deviation.payload, REPORTS, "initiative-deviation-report")
        .some(item => sameRef(item.payload.decision_ref, request.decisionRef)), "METHOD_USER_ACKNOWLEDGMENT_CONSUMED");
    } else {
      requireTrue(request.phase === "after" && !request.decisionRef, "METHOD_REPORT_PHASE_INVALID");
      const matches = records(store, deviation.payload, "tool-admission-events", "tool-admission-event")
        .filter(item => item.payload.decision === "allow" && sameRef(item.payload.method_binding?.deviation_ref, deviation.ref));
      requireTrue(matches.length === 1, "METHOD_ADMITTED_EXECUTION_REQUIRED"); admission = matches[0];
      methodState(store, bundle.plan, bundle.lease.payload.agent_id);
      completion = completionFor(store, admission);
      requireTrue(completion && at(completion.entry.created_at) <= at(evaluatedAt), "METHOD_ACTUAL_RESULT_REQUIRED");
    }
    const prior = reportsFor(store, deviation, request.phase); requireTrue(prior.length === 0, "METHOD_REPORT_ALREADY_RECORDED");
    return { deviation, admission, completion };
  };
  const initial = appraisal(load(options)), decisionRef = request.decisionRef || null;
  const sitrep = sitrepFor(initial.deviation, request.phase, decisionRef, initial.completion, evaluatedAt);
  const current = load(options), existing = current.manifest.artifacts.find(entry => entry.kind === "sitreps" && entry.artifact_id === sitrep.id);
  let sitrepRef;
  if (existing) {
    const retained = read(current, reference(existing), "sitreps", "sitrep", initial.deviation.payload);
    requireTrue(at(retained.payload.timestamp) === at(retained.entry.created_at) && at(retained.payload.timestamp) <= at(evaluatedAt) &&
      same(retained.payload, sitrepFor(initial.deviation, request.phase, decisionRef, initial.completion, retained.payload.timestamp)),
      "METHOD_RETAINED_SITREP_MISMATCH");
    sitrepRef = retained.ref;
  } else sitrepRef = publish({ ...options, waveId: initial.deviation.payload.wave_id }, sitrep, "sitreps", store => appraisal(store));
  const value = identified("InitiativeDeviationReport", { mission_id: initial.deviation.payload.mission_id, wave_id: initial.deviation.payload.wave_id,
    agent_id: initial.deviation.payload.agent_id, deviation_ref: initial.deviation.ref, phase: request.phase, decision_ref: decisionRef,
    admission_ref: initial.admission?.ref || null, result_checkpoint_ref: initial.completion?.ref || null,
    result_sha256: initial.completion ? digest(initial.completion.payload.execution_result) : null, sitrep_ref: sitrepRef, recorded_at: evaluatedAt });
  const reportRef = publish(options, value, REPORTS, store => {
    const facts = appraisal(store), retained = read(store, sitrepRef, "sitreps", "sitrep", facts.deviation.payload);
    const predecessor = facts.completion || decisionProof(store, decisionRef, facts.deviation, now(options));
    requireTrue(precedes(store, predecessor, retained) && at(retained.payload.timestamp) === at(retained.entry.created_at) &&
      same(retained.payload, sitrepFor(facts.deviation, request.phase, decisionRef, facts.completion, retained.payload.timestamp)),
      "METHOD_RETAINED_SITREP_ORDER_INVALID");
  });
  return { report: value, artifact_ref: reportRef, sitrep_ref: sitrepRef };
}
function respondToDrift(options, denyRef) {
  let store = load(options), denial = read(store, denyRef, "tool-admission-events", "tool-admission-event");
  denyRef = denial.ref;
  requireTrue(denial.payload.decision === "deny" && denial.payload.reason_codes.some(code => code.startsWith("METHOD_DRIFT_")), "METHOD_DRIFT_DENIAL_REQUIRED");
  const lease = read(store, denial.payload.lease_ref, "agent-dispatch-leases", "agent-dispatch-lease", denial.payload);
  const existing = records(store, denial.payload, INCIDENTS, "degeneration-incident-event").filter(item => sameRef(item.payload.deny_ref, denyRef));
  if (existing.length) {
    requireTrue(existing.length === 1, "METHOD_INCIDENT_AMBIGUOUS");
    const value = existing[0].payload;
    const checkpoint = read(store, value.response_checkpoint_ref, "agent-execution-checkpoints", "agent-execution-checkpoint", denial.payload);
    requireTrue(sameRef(value.lease_ref, lease.ref) && sameRef(checkpoint.payload.lease_ref, lease.ref) &&
      checkpoint.payload.checkpoint_kind === "revocation" && checkpoint.payload.lease_status === value.response_status &&
      same(value.reason_codes, denial.payload.reason_codes) && precedes(store, denial, checkpoint) && precedes(store, checkpoint, existing[0]),
      "METHOD_ACTUAL_REVOCATION_REQUIRED");
    return existing[0];
  }
  const retained = records(store, denial.payload, "agent-execution-checkpoints", "agent-execution-checkpoint").filter(item =>
    sameRef(item.payload.lease_ref, lease.ref) && item.payload.checkpoint_kind === "revocation" &&
    item.payload.reason_codes.includes("METHOD_DRIFT_REVOKED") && precedes(store, denial, item))
    .sort((left, right) => left.payload.sequence - right.payload.sequence).at(-1);
  const revocation = retained ? { checkpoint_ref: retained.ref } :
    require("./dispatch-runtime-controller").revokeLease(options, lease.payload.id, "METHOD_DRIFT_REVOKED");
  store = load(options);
  const checkpoint = read(store, revocation.checkpoint_ref, "agent-execution-checkpoints", "agent-execution-checkpoint", denial.payload);
  requireTrue(checkpoint.payload.checkpoint_kind === "revocation" && sameRef(checkpoint.payload.lease_ref, lease.ref) &&
    ["revoked", "blocked"].includes(checkpoint.payload.lease_status) && precedes(store, denial, checkpoint), "METHOD_ACTUAL_REVOCATION_REQUIRED");
  requireTrue(at(now(options)) >= at(checkpoint.entry.created_at), "METHOD_CLOCK_ROLLBACK");
  const value = identified("DegenerationIncidentEvent", { mission_id: denial.payload.mission_id, wave_id: denial.payload.wave_id,
    agent_id: denial.payload.agent_id, deny_ref: denyRef, lease_ref: lease.ref, response_checkpoint_ref: checkpoint.ref,
    required_response: "revoke", response_status: checkpoint.payload.lease_status, reason_codes: denial.payload.reason_codes, recorded_at: now(options) });
  const ref = publish(options, value, INCIDENTS, current => {
    const actual = read(current, checkpoint.ref, "agent-execution-checkpoints", "agent-execution-checkpoint", denial.payload);
    requireTrue(actual.payload.checkpoint_kind === "revocation" && actual.payload.lease_status === value.response_status, "METHOD_RESPONSE_CHANGED");
  });
  return { payload: value, ref };
}

module.exports = { DEVIATIONS, REPORTS, INCIDENTS, assertNoMethodDrift, assertMethodComplete, assertMethodWaveReport,
  assessMethodRequest, methodState, proposeMethod, reportMethod, respondToDrift, load, read, reference, scopeForLease, driftDenials };
