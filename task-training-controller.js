const { sha256 } = require("./order-intake-contract");
const { readEntry } = require("./operator-console-evidence");
const force = require("./force-registry-controller"), c = require("./task-training-contract");
const { prefixBeforeEntry } = require("./campaign-terminal-controller");
const dispatch = require("./dispatch-runtime-controller");
const { validOperatorSignature } = require("./operator-consent-contract");
const same = (left, right) => c.digest(left) === c.digest(right);
const ref = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
function source(store, reference, kind) {
  const entries = store.manifest.artifacts.filter(entry => same(ref(entry), reference) && (!kind || entry.kind === kind));
  c.need(entries.length === 1, "TRAINING_REFERENCE_INVALID");
  const text = readEntry(store, entries[0]);
  c.need(sha256(Buffer.from(text)) === reference.sha256, "TRAINING_SOURCE_ENCODING_CHANGED");
  return { entry: entries[0], text, ref: reference };
}
function record(store, reference, kind, type) {
  const result = source(store, reference, kind); let payload;
  try { payload = JSON.parse(result.text); } catch { throw new Error("TRAINING_SOURCE_JSON_INVALID"); }
  c.need(payload?.id === result.entry.artifact_id, "TRAINING_MANIFEST_ID_MISMATCH");
  if (type) c.need(require("./validator-cli-prototype/validate").validatePayload(payload, type).valid, "TRAINING_HISTORY_CONTRACT_INVALID");
  return { ...result, payload };
}
function enrolled(state, id, kind) {
  const entity = state.entities.get(id);
  c.need(entity?.kind === kind && entity.enrollment_state === "enrolled", "TRAINING_ENTITY_UNAVAILABLE"); return entity;
}
function scope(payload, request, actor, includesProvider = true) {
  c.need(payload.mission_id === request.mission_id && payload.wave_id === request.wave_id && payload.agent_id === actor.agent_id &&
    (!includesProvider || payload.provider === actor.provider), "TRAINING_EXECUTION_SCOPE_MISMATCH");
}
function appraiseTrial(options, input, trustedPublicKey) {
  const request = c.checked(input, "task-training-trial-request"), store = force.load(options);
  c.need(store.manifest, "TRAINING_HISTORY_REQUIRED");
  const state = force.replay(store, trustedPublicKey);
  c.need(!state.unresolved.length && same(state.head, request.registry_head_ref), "TRAINING_REGISTRY_HELD_OR_CHANGED");
  const capability = enrolled(state, request.capability_id, "capability"), performer = enrolled(state, request.performer_id, "performer");
  const standardRecord = record(store, capability.data.standard_ref, "capability-standards"), standard = c.checked(standardRecord.payload, "task-training-standard");
  c.need(standard.schema_version === "0.1", "TRAINING_NATIVE_PRODUCT_PATH_REQUIRED");
  c.need(standard.capability_id === capability.id && standard.metl_id === capability.data.metl_id &&
    performer.data.owner_id === standard.performer_organization_id, "TRAINING_STANDARD_OR_ORGANIZATION_MISMATCH");
  const trainingCase = standard.cases.find(item => item.case_id === request.case_id);
  c.need(trainingCase, "TRAINING_CASE_NOT_FOUND");
  const lease = record(store, request.lease_ref, "agent-dispatch-leases", "agent-dispatch-lease");
  scope(lease.payload, request, lease.payload);
  c.need(performer.data.provider === ({ claude_code: "claude", codex: "codex" }[lease.payload.provider]), "TRAINING_PERFORMER_PROVIDER_MISMATCH");
  const session = record(store, request.session_binding_ref, "task-training-session-bindings"); c.checked(session.payload, "task-training-session-binding");
  const binding = session.payload;
  c.need(trustedPublicKey && validOperatorSignature(binding, trustedPublicKey), "TRAINING_SESSION_SIGNATURE_INVALID");
  const ceremonyVerified = binding.schema_version === "0.2";
  if (ceremonyVerified) require("./training-session-controller").verifyBinding(store, session, trustedPublicKey);
  c.need(binding.performer_id === performer.id && binding.performer_version === performer.version && binding.capability_id === capability.id &&
    binding.capability_version === capability.version && binding.configuration_sha256 === c.digest(performer.data) &&
    same(binding.lease_ref, request.lease_ref) && binding.provider === lease.payload.provider && same(binding.session_binding, lease.payload.session_binding),
  "TRAINING_PERFORMER_SESSION_MISMATCH");
  c.need(binding.stage === trainingCase.stage && binding.case_ids.includes(trainingCase.case_id) && binding.case_ids.every(caseId =>
    standard.cases.some(item => item.case_id === caseId && item.stage === binding.stage)), "TRAINING_CASE_OUTSIDE_SESSION_SCOPE");
  const context = record(store, lease.payload.context_pack_ref, "agent-context-packs", "agent-context-pack");
  // Context packs have no provider field; the lease and signed mapping bind it.
  scope(context.payload, request, lease.payload, false);
  c.need(same(context.payload.plan_ref, lease.payload.plan_ref) && capability.data.aliases.some(alias =>
    alias.operational_role === context.payload.operational_role && alias.task === context.payload.task), "TRAINING_TASK_ALIAS_MISMATCH");
  const completion = record(store, request.completion_ref, "agent-execution-checkpoints", "agent-execution-checkpoint");
  scope(completion.payload, request, lease.payload);
  c.need(same(completion.payload.lease_ref, request.lease_ref) && same(completion.payload.session_binding, lease.payload.session_binding) &&
    completion.payload.checkpoint_kind === "post_tool", "TRAINING_COMPLETION_NOT_A_TRIAL");
  const admission = record(store, completion.payload.tool_admission_ref, "tool-admission-events", "tool-admission-event");
  scope(admission.payload, request, lease.payload);
  c.need(same(admission.payload.lease_ref, request.lease_ref) && same(admission.payload.session_binding, lease.payload.session_binding) &&
    admission.payload.decision === "allow" && admission.payload.tool_name === trainingCase.tool_name &&
    admission.payload.tool_input_sha256 === trainingCase.tool_input_sha256, "TRAINING_ADMISSION_OR_CASE_MISMATCH");
  const introduced = prefixBeforeEntry(store, admission.entry), initial = force.replay(introduced, trustedPublicKey);
  c.need(initial.entities.has(capability.id) && initial.entities.has(performer.id) &&
    same(initial.entities.get(capability.id), capability) && same(initial.entities.get(performer.id), performer) &&
    !initial.unresolved.length, "TRAINING_DEFINITION_NOT_ENROLLED_BEFORE_CALL");
  c.need(introduced.manifest.artifacts.some(entry => same(ref(entry), request.session_binding_ref)), "TRAINING_SESSION_NOT_BOUND_BEFORE_CALL");
  const observedAt = Date.parse(admission.payload.decided_at), finishedAt = Date.parse(completion.payload.recorded_at);
  c.need(observedAt >= Date.parse(standard.created_at) && finishedAt >= observedAt && finishedAt < Date.parse(standard.expires_at) &&
    finishedAt <= Date.now() && observedAt >= Date.parse(binding.created_at) && finishedAt < Date.parse(binding.expires_at), "TRAINING_OBSERVATION_TIME_INVALID");
  const history = dispatch.inspectDispatchHistory(store, request.lease_ref);
  c.need(history.checkpoints.some(item => same(item.ref, request.completion_ref)), "TRAINING_COMPLETION_OUTSIDE_LINEAGE");
  c.need(["completed", "revoked", "superseded"].includes(history.latest.payload.lease_status) && !history.pending_tool_requests && !history.unresolved_tool_effects &&
    !history.unresolved_gateway_transactions, "TRAINING_EXECUTION_OR_EFFECTS_UNSETTLED");
  const result = record(store, request.completion_input_ref, "task-training-completion-inputs");
  c.checked(result.payload, "task-training-completion-input"); const hook = result.payload.hook_input;
  c.need(hook.tool_name === admission.payload.tool_name && hook.tool_use_id === admission.payload.tool_use_id &&
    dispatch.inputDigest(hook.tool_input) === admission.payload.tool_input_sha256 &&
    dispatch.toolCompletionResultDigest(hook) === completion.payload.execution_result.provider_result_sha256, "TRAINING_PROVIDER_RESULT_SUBSTITUTED");
  const output = source(store, request.observed_output_ref, "task-training-observed-outputs"), value = hook.tool_response?.[trainingCase.output_pointer.slice(1)];
  c.need([result, output].every(item => item.entry.mission_id === request.mission_id && item.entry.wave_id === request.wave_id), "TRAINING_RESULT_ARTIFACT_SCOPE_MISMATCH");
  c.need(typeof value === "string" && Buffer.byteLength(value) >= trainingCase.minimum_output_bytes && Buffer.byteLength(value) <= 65536 && output.text === value &&
    sha256(Buffer.from(value)) === output.ref.sha256, "TRAINING_OBSERVED_OUTPUT_SUBSTITUTED");
  const current = force.load(options); c.need(same(force.manifestState(current), force.manifestState(store)), "TRAINING_SNAPSHOT_CHANGED");
  const body = { schema_version: "0.2", type: "TaskTrainingTrialAppraisal", owner_session_ceremony_verified: ceremonyVerified, request, request_sha256: c.digest(request),
    source_state_sha256: require("./skill-mission-controller").repositoryStateDigest(__dirname),
    repository_binding: force.binding(store), observed_manifest: force.manifestState(store), registry_head_ref: state.head,
    capability_sha256: c.digest(capability), performer_sha256: c.digest(performer), standard_ref: standardRecord.ref, case_id: trainingCase.case_id,
    stage: trainingCase.stage, admission_ref: admission.ref, completion_ref: completion.ref,
    execution_succeeded: hook.hook_event_name === "PostToolUse" && completion.payload.execution_result.status === "succeeded", observed_output_sha256: output.ref.sha256,
    status: "observed_result_bound", valid_for_training_review_until: new Date(Math.min(Date.parse(standard.expires_at),
      finishedAt + standard.sustainment_seconds * 1000)).toISOString(), actual_model_execution_attested: false, configuration_attested: false,
    conditions_observed: false, task_standard_evaluated: false, evaluator_authenticated: false, ...c.FLAGS };
  return c.checked(c.identified("TTA", body), "task-training-trial-appraisal");
}
module.exports = { appraiseTrial, source, record };
