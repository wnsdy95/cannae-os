#!/usr/bin/env node

const fs = require("fs");
const { writeRepositoryArtifact } = require("./repository-artifact-store");
const { NONE_REF, inputDigest, dispatchLeaseHistory } = require("./dispatch-runtime-controller");
const { gatewayEffectHistory, bindingDigests } = require("./protected-tool-gateway");
const { loadEffectView, loadEffectArtifact: load, sameEffectRef: sameRef } = require("./tool-effect-review");
const { appraiseEffectInspection } = require("./effect-review-evidence");
const { computeRepositoryState } = require("./verification-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");

const EXECUTION_KINDS = Object.freeze({
  "protected-execution-envelopes": "protected-execution-envelope",
  "protected-execution-observations": "protected-execution-observation",
  "oci-sandbox-execution-envelopes": "oci-sandbox-execution-envelope",
  "oci-sandbox-execution-observations": "oci-sandbox-execution-observation",
  "oci-sandbox-probe-observations": "oci-sandbox-probe-observation"
});

function assert(condition, code) { if (!condition) throw new Error(code); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function ref(entry) { return { artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 }; }
function assertValid(payload, type) {
  const issues = validatePayload(payload, type).issues.filter(item => ["error", "critical"].includes(item.severity));
  assert(!issues.length, `${type}: ${issues.map(item => item.code).join(", ")}`);
}
function sameBinding(left, right) {
  return Boolean(left && right && left.repository_key === right.repository_key && left.identity_fingerprint === right.identity_fingerprint);
}

function validateHistory(current, history, dispatch) {
  const request = history.request.payload;
  for (const entry of current.manifest.artifacts.filter(item => item.kind === "agent-execution-checkpoints")) {
    const candidate = load(current, ref(entry), entry.kind).payload;
    if (!sameRef(candidate.lease_ref, request.lease_ref)) continue;
    load(current, ref(entry), entry.kind, "agent-execution-checkpoint", request);
    assert(dispatch.checkpoints.some(item => sameRef(item.ref, entry)), "GATEWAY_EFFECT_CHECKPOINT_BINDING_MISMATCH");
  }
  const records = [[history.request, "tool-gateway-requests", "tool-gateway-request"],
    [history.decision, "tool-gateway-decisions", "tool-gateway-decision"],
    [history.receipt, "tool-execution-receipts", "tool-execution-receipt"],
    [history.admission, "tool-admission-events", "tool-admission-event"],
    [dispatch.lease, "agent-dispatch-leases", "agent-dispatch-lease"],
    ...history.events.map(record => [record, "tool-gateway-transaction-events", "tool-gateway-transaction-event"]),
    ...dispatch.checkpoints.map(record => [record, "agent-execution-checkpoints", "agent-execution-checkpoint"])];
  for (const [record, kind, schema] of records.filter(([record]) => record)) {
    const payload = load(current, record.ref, kind, schema, request).payload;
    assert(["mission_id", "wave_id", "agent_id"].every(key => payload[key] === request[key]),
      "GATEWAY_EFFECT_HISTORY_BINDING_MISMATCH");
    if (payload.checkpoint_ref) {
      const checkpoint = dispatch.checkpoints.find(item => sameRef(item.ref, payload.checkpoint_ref));
      assert(checkpoint, "GATEWAY_EFFECT_CHECKPOINT_BINDING_MISMATCH");
      assert(Date.parse(payload.requested_at || payload.decided_at || payload.recorded_at) >= Date.parse(checkpoint.payload.recorded_at),
        "GATEWAY_EFFECT_HISTORY_TIME_INVALID");
    }
    if (payload.admission_ref && !sameRef(payload.admission_ref, NONE_REF)) {
      assert(history.admission && sameRef(payload.admission_ref, history.admission.ref),
        "GATEWAY_EFFECT_ADMISSION_BINDING_MISMATCH");
    }
  }
  const baseline = dispatch.checkpoints.find(item => sameRef(item.ref, request.checkpoint_ref));
  assert(baseline && inputDigest(baseline.payload.repository_state) === inputDigest(request.expected_repository_state),
    "GATEWAY_EFFECT_CHECKPOINT_STATE_MISMATCH");
  if (history.admission) {
    const admission = history.admission.payload;
    assert(sameRef(admission.checkpoint_ref, request.checkpoint_ref) && sameRef(admission.tool_policy_ref, request.tool_policy_ref) &&
      inputDigest(admission.state_before) === inputDigest(request.expected_repository_state),
      "GATEWAY_EFFECT_ADMISSION_BINDING_MISMATCH");
  }
  if (history.completion) assert(dispatch.checkpoints.some(item => sameRef(item.ref, history.completion.ref)),
    "GATEWAY_EFFECT_COMPLETION_BINDING_MISMATCH");
}

function executionRecords(current, history, execution) {
  const request = history.request.payload;
  const records = [];
  const kinds = new Set();
  for (const entry of current.manifest.artifacts.filter(item => EXECUTION_KINDS[item.kind])) {
    const reference = ref(entry);
    const candidate = load(current, reference, entry.kind).payload;
    if (candidate.transaction_id !== request.transaction_id && !sameRef(candidate.request_ref, history.request.ref)) continue;
    const payload = load(current, reference, entry.kind, EXECUTION_KINDS[entry.kind], request).payload;
    assert(!kinds.has(entry.kind), "GATEWAY_EFFECT_EXECUTION_HISTORY_AMBIGUOUS");
    kinds.add(entry.kind);
    assert(execution && payload.transaction_id === request.transaction_id, "GATEWAY_EFFECT_EXECUTION_BINDING_MISMATCH");
    if (entry.kind !== "oci-sandbox-probe-observations") {
      assert(["mission_id", "wave_id", "agent_id", "provider"].every(key => payload[key] === request[key]) &&
        sameRef(payload.request_ref, history.request.ref) && history.decision && sameRef(payload.decision_ref, history.decision.ref) &&
        sameRef(payload.execution_event_ref, execution.ref) && payload.tool_input_sha256 === request.tool_call.tool_input_sha256 &&
        sameBinding(payload.repository_binding, request.repository_binding), "GATEWAY_EFFECT_EXECUTION_BINDING_MISMATCH");
    }
    records.push({ entry, ref: reference, payload });
  }
  const envelopes = records.filter(item => item.entry.kind.endsWith("-envelopes"));
  assert(envelopes.length <= 1, "GATEWAY_EFFECT_EXECUTION_MODE_CONFLICT");
  for (const record of records.filter(item => item.payload.execution_envelope_ref)) {
    assert(envelopes.length === 1 && sameRef(record.payload.execution_envelope_ref, envelopes[0].ref),
      "GATEWAY_EFFECT_EXECUTION_ENVELOPE_MISMATCH");
  }
  for (const record of records.filter(item => item.payload.probe_observation_ref)) {
    assert(records.some(item => item.entry.kind === "oci-sandbox-probe-observations" &&
      sameRef(item.ref, record.payload.probe_observation_ref)), "GATEWAY_EFFECT_PROBE_MISMATCH");
  }
  const policies = new Map();
  for (const record of records) {
    const oci = record.entry.kind.startsWith("oci-");
    const policyRef = record.payload[oci ? "sandbox_policy_ref" : "executor_policy_ref"];
    if (!policyRef) continue;
    const policy = load(current, policyRef, oci ? "oci-linux-sandbox-policies" : "protected-executor-policies",
      oci ? "oci-linux-sandbox-policy" : "protected-executor-policy", request);
    assert(policy.payload.providers.includes(request.provider) && policy.payload.gateway_binding_sha256 === bindingDigests(request).gateway &&
      sameBinding(policy.payload.repository_binding, request.repository_binding), "GATEWAY_EFFECT_EXECUTOR_POLICY_MISMATCH");
    policies.set(policyRef.sha256, { ...policy, ref: policyRef });
  }
  assert(policies.size <= 1, "GATEWAY_EFFECT_EXECUTOR_POLICY_MISMATCH");
  for (const key of ["executor_policy_ref", "execution_envelope_ref", "execution_observation_ref"]) {
    const reference = history.receipt && history.receipt.payload.executor[key];
    if (reference && !sameRef(reference, NONE_REF)) assert([...records, ...policies.values()].some(item => sameRef(item.ref, reference)),
      "GATEWAY_EFFECT_RECEIPT_EXECUTION_MISMATCH");
  }
  records.push(...policies.values());
  return records.sort((a, b) => a.ref.relative_path.localeCompare(b.ref.relative_path));
}

function gatewayEffectSubject(options, transactionId, retainedSnapshot) {
  const current = retainedSnapshot || loadEffectView(options);
  const history = gatewayEffectHistory(current, transactionId);
  const request = history.request.payload;
  load(current, history.request.ref, "tool-gateway-requests", "tool-gateway-request", request);
  const dispatch = dispatchLeaseHistory(current, request.lease_ref);
  validateHistory(current, history, dispatch);
  const lease = dispatch.lease.payload;
  const binding = { repository_key: current.repository.key, identity_fingerprint: current.repository.identity_fingerprint };
  assert([request, lease].every(value => sameBinding(value.repository_binding, binding)) &&
    ["mission_id", "wave_id", "agent_id", "provider"].every(key => request[key] === lease[key]) &&
    request.authenticated_principal.session_id === lease.session_binding.session_id &&
    request.authenticated_principal.provider_agent_id === lease.session_binding.provider_agent_id &&
    sameRef(request.tool_policy_ref, lease.tool_policy_ref), "GATEWAY_EFFECT_LEASE_BINDING_MISMATCH");
  const executions = history.events.filter(item => item.payload.state === "executing");
  assert(executions.length <= 1, "GATEWAY_EFFECT_EXECUTION_HISTORY_AMBIGUOUS");
  const execution = executions[0];
  const retained = executionRecords(current, history, execution);
  const declaredModes = [request.tool_call.execution_mode, history.receipt && history.receipt.payload.executor.execution_mode];
  for (const item of retained) declaredModes.push(item.entry.kind.startsWith("oci-") ? "oci_linux_sandbox_reference" : "bounded_process_reference");
  const modes = [...new Set(declaredModes.filter(value => value && value !== "none"))];
  assert(modes.length <= 1, "GATEWAY_EFFECT_EXECUTION_MODE_CONFLICT");
  const state = history.latest ? history.latest.payload.state : "request_persisted";
  let subjectClass = execution ? "unknown_execution" : "unstarted";
  let nextAction = "recover";
  if (history.safe_terminal) { subjectClass = "settled"; nextAction = "none"; }
  else if (state === "denied" && !execution && history.admission && history.admission.payload.decision === "allow") {
    subjectClass = "orphan_admission"; nextAction = "review";
  } else if (state === "committed" && history.receipt && history.receipt.payload.execution.external_effects === "unknown") {
    subjectClass = "committed_unknown_effects"; nextAction = "review";
  } else if (state === "recovery_required" && history.receipt) nextAction = "review";

  const targets = [];
  if (!history.safe_terminal && history.admission && history.admission.payload.decision === "allow") {
    targets.push({ boundary: "admission", target: `admission:${history.admission.ref.sha256}` });
    targets.push({ boundary: "external_effects", target: `transaction:${request.transaction_id}` });
  }
  if (execution && !history.safe_terminal) {
    const envelope = retained.find(item => item.entry.kind.endsWith("-envelopes"));
    targets.push({ boundary: "containment", target: envelope
      ? envelope.payload.launch ? `oci-container-name:${envelope.payload.launch.container_name}` : `process-envelope:${envelope.ref.sha256}`
      : `gateway-execution:${execution.ref.sha256}` });
  }
  const productionRef = request.production_sandbox_admission_ref || NONE_REF;
  if (productionRef.artifact_id !== "none" && !history.safe_terminal) {
    load(current, productionRef, "production-sandbox-admissions", "production-sandbox-admission");
    targets.push({ boundary: "coordination", target: `production-admission:${productionRef.sha256}` });
  }
  const sourceRecords = [history.request, history.decision, history.admission, history.receipt,
    ...history.events, ...dispatch.checkpoints, ...retained].filter(Boolean);
  const times = [request.requested_at, dispatch.latest.payload.recorded_at,
    ...history.events.map(item => item.payload.recorded_at),
    ...(history.receipt ? [history.receipt.payload.recorded_at] : []),
    ...sourceRecords.flatMap(item => [item.entry.created_at, item.payload.decided_at, item.payload.issued_at, item.payload.finished_at,
      item.payload.execution && item.payload.execution.finished_at].filter(value => value && value !== "none"))].map(Date.parse);
  assert(times.every(Number.isFinite), "GATEWAY_EFFECT_HISTORY_TIME_INVALID");
  const body = { schema_version: "0.1", type: "GatewayEffectSubject", mission_id: request.mission_id,
    wave_id: request.wave_id, agent_id: request.agent_id, provider: request.provider, repository_binding: binding,
    transaction_id: transactionId, idempotency_key: request.idempotency_key, tool_input_sha256: request.tool_call.tool_input_sha256,
    execution_mode: modes[0] || "unknown", transaction_state: state, lease_status: dispatch.latest.payload.lease_status,
    subject_class: subjectClass, next_action: nextAction,
    references: { request_ref: history.request.ref, decision_ref: history.decision ? history.decision.ref : NONE_REF,
      admission_ref: history.admission ? history.admission.ref : NONE_REF, lease_ref: request.lease_ref,
      checkpoint_ref: dispatch.latest.ref, latest_event_ref: history.latest ? history.latest.ref : NONE_REF,
      execution_event_ref: execution ? execution.ref : NONE_REF, receipt_ref: history.receipt ? history.receipt.ref : NONE_REF,
      production_sandbox_admission_ref: productionRef },
    retained_execution_refs: retained.map(item => item.ref), required_targets: targets,
    observed_after: new Date(Math.max(...times)).toISOString(),
    effects_settled: false, tool_execution_authorized: false, release_authorized: false };
  const subject = { ...body, id: `GESUB-${inputDigest(body).slice(0, 32)}` };
  assertValid(subject, "gateway-effect-subject");
  return clone(subject);
}

function inspectGatewayEffects(options, references, retainedSnapshot) {
  assert(references && Object.keys(references).sort().join(",") === "scope_ref,verification_plan_ref,verification_receipt_ref",
    "GATEWAY_EFFECT_REVIEW_REFERENCES_INVALID");
  const current = retainedSnapshot || loadEffectView(options);
  const scope = load(current, references.scope_ref, "gateway-effect-scopes", "gateway-effect-scope").payload;
  load(current, references.scope_ref, "gateway-effect-scopes", "gateway-effect-scope", scope);
  const subject = gatewayEffectSubject(options, scope.subject.transaction_id, current);
  const plan = load(current, references.verification_plan_ref, "verification-plans", "verification-plan", scope).payload;
  const receipt = load(current, references.verification_receipt_ref, "verification-receipts", "verification-receipt", scope).payload;
  const at = options.now || new Date().toISOString();
  assert(Number.isFinite(Date.parse(at)), "GATEWAY_EFFECT_REVIEW_TIME_INVALID");
  const codes = new Set();
  const requireCondition = (condition, code) => { if (!condition) codes.add(code); };
  requireCondition(inputDigest(subject) === inputDigest(scope.subject), "GATEWAY_EFFECT_SUBJECT_CHANGED");
  requireCondition(subject.next_action === "review", "GATEWAY_EFFECT_RECOVERY_OR_CANCELLATION_REQUIRED");
  requireCondition([scope, plan, receipt].every(item => sameBinding(item.repository_binding, subject.repository_binding)),
    "GATEWAY_EFFECT_REPOSITORY_MISMATCH");
  for (const target of subject.required_targets) {
    requireCondition(scope.resources.some(resource => resource.boundary === target.boundary && resource.target === target.target),
      "GATEWAY_EFFECT_REQUIRED_BOUNDARY_MISSING");
  }
  appraiseEffectInspection({ scope, scopeRef: references.scope_ref, plan, receipt, at,
    repositoryState: retainedSnapshot ? retainedSnapshot.repositoryState : computeRepositoryState(current.repository.root),
    predecessorTimes: [subject.observed_after], observationSince: subject.observed_after,
    loadObservation: reference => load(current, reference, "gateway-effect-observations", null, scope), requireCondition });
  const report = { schema_version: "0.1", type: "GatewayEffectReview", id: `GER-${inputDigest({ references, at }).slice(0, 32)}`,
    mission_id: scope.mission_id, wave_id: scope.wave_id, agent_id: scope.agent_id, repository_binding: subject.repository_binding,
    ...references, scope_sha256: inputDigest(scope), subject_sha256: inputDigest(subject),
    status: codes.size ? "blocked" : "evidence_bound", reason_codes: [...codes].sort(), reviewed_at: at,
    effects_settled: false, scope_completeness_verified: false, verifier_identity_verified: false,
    provider_containment_verified: false, production_coordination_verified: false, user_decision_verified: false,
    tool_execution_authorized: false, release_authorized: false };
  assertValid(report, "gateway-effect-review");
  return report;
}

function reviewGatewayEffects(options, references) {
  const frozen = clone(references);
  const report = inspectGatewayEffects(options, frozen);
  if (!options.writeArtifact) return report;
  const artifact = writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: options.artifactRoot,
    missionId: report.mission_id, waveId: report.wave_id, kind: "gateway-effect-reviews", artifactId: report.id,
    payload: report, createdAt: report.reviewed_at, publicationGuard: () => {
      const refreshed = inspectGatewayEffects(options, frozen);
      assert(inputDigest({ ...refreshed, id: report.id, reviewed_at: report.reviewed_at }) === inputDigest(report),
        "GATEWAY_EFFECT_REVIEW_CHANGED_BEFORE_PUBLICATION");
      return true;
    } });
  return { ...report, artifact };
}

function main() {
  try {
    const args = process.argv.slice(2);
    const command = args.shift();
    const options = {};
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === "--write-artifact") { assert(!options.writeArtifact, "Repeated --write-artifact"); options.writeArtifact = true; continue; }
      const key = { "--repository": "repository", "--artifact-root": "artifactRoot", "--transaction": "transactionId", "--references": "references" }[args[index]];
      assert(key && args[index + 1] && !options[key], "Invalid or repeated gateway effect review argument.");
      options[key] = args[++index];
    }
    assert(options.repository && ((command === "subject" && options.transactionId && !options.references && !options.writeArtifact) ||
      (command === "review" && options.references && !options.transactionId)),
    "Usage: node gateway-effect-review.js <subject --transaction <id>|review --references <file> [--write-artifact]> --repository <repo> [--artifact-root <root>]");
    const result = command === "subject" ? gatewayEffectSubject(options, options.transactionId)
      : reviewGatewayEffects(options, JSON.parse(fs.readFileSync(options.references, "utf8")));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === "blocked") process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}

module.exports = { gatewayEffectSubject, inspectGatewayEffects, reviewGatewayEffects };
if (require.main === module) main();
