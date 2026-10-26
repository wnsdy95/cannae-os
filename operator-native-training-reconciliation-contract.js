const { z } = require("zod"), t = require("./task-training-contract"), legacy = require("./operator-model-reconciliation-contract");
const { createReconciliationContract } = require("./operator-reconciliation-contract-core"), { signOperatorRecord } = require("./operator-consent-contract");
const hex = z.string().regex(/^[a-f0-9]{64}$/), flags = Object.fromEntries(Object.entries(t.FLAGS).map(([key, value]) => [key, z.literal(value)]));
const REJECTIONS = Object.freeze(["SEMANTIC_TRAINING_RESPONSE_SUBSTITUTED", "SEMANTIC_TRAINING_CONTRACT_INVALID", "SEMANTIC_TRAINING_PRODUCT_SIZE_INVALID",
  "SEMANTIC_TRAINING_CONTROL_METADATA_NOT_PRODUCT", "SEMANTIC_TRAINING_OUTPUT_QUARANTINED"]);
const RESPONSE = z.strictObject({ original_file_sha256: hex.nullable(), observed_file_sha256: hex, canonical_payload_sha256: hex, original_file_bytes_bound: z.boolean() });
const ASSESSMENT = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("rejected_response"), rejection_code: z.enum(REJECTIONS) }),
  z.strictObject({ kind: z.literal("accepted_native_product"), appraisal_sha256: hex, output_sha256: hex, output_bytes: z.number().int().min(1).max(65536) })
]);
const PUBLICATION = z.strictObject({ state: z.enum(["none", "authorization_only", "authorization_and_output", "complete"]),
  authorization_ref: t.ref.nullable(), output_ref: t.ref.nullable(), result_ref: t.ref.nullable(),
  artifact_settlement_authorized: z.literal(false), task_output_admitted: z.literal(false) });
const APPRAISAL = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("NativeTrainingFailureAppraisal"), id: z.string().regex(/^NTFAP-[a-f0-9]{40}$/),
  action_id: z.uuid(), collection_id: z.uuid(), request_ref: t.ref, original_action_sha256: hex, invocation_sha256: hex, consent_sha256: hex,
  result_sha256: hex, journal_sha256: hex, reservation_sha256: hex, transfer_authorization_sha256: hex, producer_method_sha256: hex, trusted_key_sha256: hex,
  native_events_sha256: hex, native_thread_id: z.uuid(), process_id: z.number().int().min(2), child_exit_recorded: z.literal(true),
  child_absence_observed: z.literal(true), process_group_absence_observed: z.literal(true), response: RESPONSE, assessment: ASSESSMENT, publication: PUBLICATION,
  inspection_only: z.literal(true), private_history_required_for_consumption: z.literal(true), process_identity_independently_attested: z.literal(false),
  actual_model_execution_attested: z.literal(false), task_standard_evaluated: z.literal(false), evaluator_authenticated: z.literal(false),
  hold_discharge_authorized: z.literal(false), ...flags });
const SUBJECT = legacy.SUBJECT.extend({ model_purpose: z.literal("native_training"), native_appraisal: APPRAISAL });
const AUTHORIZATION = legacy.AUTHORIZATION.extend({ type: z.literal("OperatorNativeTrainingReconciliationAuthorization"), id: z.string().regex(/^ONTRA-[a-f0-9-]{36}$/),
  purpose: z.literal("acknowledge_one_failed_native_training_transfer"), subject: SUBJECT, displayed_subject_sha256: hex,
  native_publication_acknowledged: z.literal(true), unbound_response_observation_acknowledged: z.literal(true), ...flags });
const RECORD = legacy.RECORD.extend({ type: z.literal("OperatorNativeTrainingReconciliationRecord"), id: z.string().regex(/^ONTRR-[a-f0-9-]{36}$/),
  authorization: AUTHORIZATION, artifact_settlement_authorized: z.literal(false), task_output_admitted: z.literal(false), ...flags });
const SCHEMAS = { "native-training-failure-appraisal": APPRAISAL, "operator-native-training-reconciliation-authorization": AUTHORIZATION, "operator-native-training-reconciliation-record": RECORD };
const TYPES = new Set(Object.keys(SCHEMAS)), issue = code => ({ severity: "critical", code, path: "$", message: "Exact native evidence and fresh purpose-specific owner review grant no execution, publication or qualification." });
function appraisalIssues(value) {
  if (!APPRAISAL.safeParse(value).success) return [issue("NATIVE_RECONCILIATION_APPRAISAL_SCHEMA_INVALID")];
  const { id, ...body } = value, errors = [];
  if (t.identified("NTFAP", body).id !== id) errors.push(issue("NATIVE_RECONCILIATION_APPRAISAL_ID_INVALID"));
  try { require("./native-training-producer").inspect(value.producer_method_sha256); } catch { errors.push(issue("NATIVE_RECONCILIATION_PRODUCER_UNKNOWN")); }
  const response = value.response, p = value.publication, refs = [p.authorization_ref, p.output_ref, p.result_ref], count = refs.filter(Boolean).length;
  if (response.original_file_bytes_bound !== (response.original_file_sha256 !== null) ||
    response.original_file_sha256 !== null && response.original_file_sha256 !== response.observed_file_sha256 ||
    value.assessment.kind === "accepted_native_product" && !response.original_file_bytes_bound) errors.push(issue("NATIVE_RECONCILIATION_RESPONSE_COMMITMENT_INVALID"));
  if (["none", "authorization_only", "authorization_and_output", "complete"][count] !== p.state || refs.some((ref, index) => ref && refs.slice(0, index).some(prior => !prior)) ||
    p.authorization_ref && p.authorization_ref.artifact_id !== `NTFA-${value.action_id}` ||
    p.output_ref && p.output_ref.artifact_id !== `NTO-${value.collection_id}` || p.result_ref && p.result_ref.artifact_id !== `NTOR-${value.action_id}` ||
    value.assessment.kind === "rejected_response" && count !== 0 || value.assessment.kind === "accepted_native_product" && p.output_ref && p.output_ref.sha256 !== value.assessment.output_sha256)
    errors.push(issue("NATIVE_RECONCILIATION_PUBLICATION_INVALID"));
  return errors;
}
const core = createReconciliationContract({ types: new Set([...TYPES].filter(type => type !== "native-training-failure-appraisal")),
  authorizationType: "operator-native-training-reconciliation-authorization", recordType: "operator-native-training-reconciliation-record",
  authorizationSchema: AUTHORIZATION, recordSchema: RECORD, authorizationPrefix: "ONTRA", recordPrefix: "ONTRR", recordTag: "OperatorNativeTrainingReconciliationRecord",
  subjectIssues(subject) {
    const a = subject.native_appraisal, errors = appraisalIssues(a);
    for (const field of ["action_id", "original_action_sha256", "invocation_sha256", "consent_sha256", "result_sha256", "journal_sha256", "trusted_key_sha256", "process_id",
      "child_exit_recorded", "child_absence_observed", "process_group_absence_observed"]) if (a[field] !== subject[field]) { errors.push(issue("NATIVE_RECONCILIATION_SUBJECT_INVALID")); break; }
    return errors;
  } });
function contractIssues(value, type) {
  if (!TYPES.has(type)) return [];
  if (type === "native-training-failure-appraisal") return appraisalIssues(value);
  const errors = core.contractIssues(value, type);
  const a = type.endsWith("authorization") ? value : value?.authorization;
  if (AUTHORIZATION.safeParse(a).success && a.displayed_subject_sha256 !== t.digest(a.subject)) errors.push(issue("NATIVE_RECONCILIATION_DISPLAY_INVALID"));
  return errors;
}
function verifyAuthorization(value, key) { t.need(contractIssues(value, "operator-native-training-reconciliation-authorization").length === 0, "CONSOLE_NATIVE_RECONCILIATION_AUTHORIZATION_INVALID"); return core.verifyAuthorization(value, key); }
function verifyRecord(value, key) { t.need(contractIssues(value, "operator-native-training-reconciliation-record").length === 0, "CONSOLE_NATIVE_RECONCILIATION_RECORD_INVALID"); core.verifyRecord(value, key); verifyAuthorization(value.authorization, key); return value; }
function recordFor(authorization, now, privateKey) {
  const { signature, ...body } = core.recordFor(authorization, now, privateKey);
  return signOperatorRecord({ ...body, artifact_settlement_authorized: false, task_output_admitted: false, ...t.FLAGS }, privateKey);
}
function checkedAppraisal(body) { const value = t.identified("NTFAP", body), errors = appraisalIssues(value); t.need(!errors.length, errors[0]?.code); return value; }
module.exports = { REJECTIONS, RESPONSE, ASSESSMENT, PUBLICATION, APPRAISAL, SUBJECT, AUTHORIZATION, RECORD, SCHEMAS, TYPES, appraisalIssues, contractIssues, checkedAppraisal, verifyAuthorization, verifyRecord, recordFor };
