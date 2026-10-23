const { z } = require("zod");
const { digest, keyDigest, validOperatorSignature, signOperatorRecord } = require("./operator-consent-contract");
const TYPES = new Set(["operator-model-reconciliation-authorization", "operator-model-reconciliation-record"]);
const hex = z.string().regex(/^[a-f0-9]{64}$/), time = z.iso.datetime({ offset: true });
const flags = { execution_authorized: z.literal(false), release_authorized: z.literal(false), human_final_decision_authority: z.literal("USER") };
const signature = z.strictObject({ algorithm: z.literal("Ed25519"), key_sha256: hex, value: z.string().regex(/^[A-Za-z0-9+/]{86}==$/) });
const SUBJECT = z.strictObject({
  action_id: z.uuid(), repository_binding: z.strictObject({ repository_key: z.string().min(1).max(256), identity_fingerprint: hex }),
  original_action_sha256: hex, invocation_sha256: hex, consent_sha256: hex, result_sha256: hex, journal_sha256: hex,
  prior_attempts_sha256: hex, manifest_sha256: hex, repository_state_sha256: hex, runtime_source_sha256: hex, trusted_key_sha256: hex,
  process_id: z.number().int().min(2), observed_at: time,
  child_exit_recorded: z.literal(true), child_absence_observed: z.literal(true), process_group_absence_observed: z.literal(true),
  failure_reasons: z.array(z.string().regex(/^(?:SEMANTIC|CONSOLE)_[A-Z_]+$/)).min(1).max(100),
  transfer_effects: z.literal("possibly_transmitted"), provider_billing_verified: z.literal(false), provider_cancellation_verified: z.literal(false)
});
const AUTHORIZATION = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("OperatorModelReconciliationAuthorization"),
  id: z.string().regex(/^OMRA-[a-f0-9-]{36}$/), reconciliation_id: z.uuid(), action_id: z.uuid(), sequence: z.number().int().positive(),
  purpose: z.literal("acknowledge_one_failed_model_transfer"), resolution: z.literal("acknowledge_failed_transfer"),
  principal_id: z.uuid(), principal_epoch: z.number().int().positive(), authentication_method: z.literal("local_owner_password_reauthentication"),
  session_sha256: hex, nonce_sha256: hex, rationale: z.string().min(1).max(2000),
  created_at: time, expires_at: time, subject: SUBJECT, provider_uncertainty_acknowledged: z.literal(true), ...flags, signature });
const RECORD = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("OperatorModelReconciliationRecord"),
  id: z.string().regex(/^OMRR-[a-f0-9-]{36}$/), reconciliation_id: z.uuid(), action_id: z.uuid(),
  authorization: AUTHORIZATION, authorization_sha256: hex, subject_sha256: hex, recorded_at: time, rechecked_at: time,
  resolution: z.literal("acknowledge_failed_transfer"), original_failure_preserved: z.literal(true),
  provider_billing_verified: z.literal(false), provider_cancellation_verified: z.literal(false), ...flags, signature });
function requireThat(value, code) { if (!value) throw new Error(code); }
function contractIssues(value, type) {
  if (!TYPES.has(type)) return [];
  const authorizationOnly = type === "operator-model-reconciliation-authorization", schema = authorizationOnly ? AUTHORIZATION : RECORD;
  const issues = [];
  if (!schema.safeParse(value).success) return [{ severity: "critical", code: "MODEL_RECONCILIATION_SCHEMA_INVALID", path: "$", message: "Exact non-authorizing model reconciliation contract required." }];
  const a = authorizationOnly ? value : value.authorization, start = Date.parse(a.created_at), end = Date.parse(a.expires_at);
  if (a.id !== `OMRA-${a.reconciliation_id}` || a.action_id !== a.subject.action_id ||
      a.subject.trusted_key_sha256 !== a.signature.key_sha256 || !(Date.parse(a.subject.observed_at) <= start && start < end && end - start <= 120000) ||
      start - Date.parse(a.subject.observed_at) > 120000 || !a.rationale.trim()) {
    issues.push({ severity: "critical", code: "MODEL_RECONCILIATION_AUTHORIZATION_BINDING_INVALID", path: "$", message: "Bind exact action, key, observation and finite fresh owner review." });
  }
  if (!authorizationOnly && (value.id !== `OMRR-${a.reconciliation_id}` || value.reconciliation_id !== a.reconciliation_id ||
      value.action_id !== a.action_id || value.authorization_sha256 !== digest(a) || value.subject_sha256 !== digest(a.subject) ||
      value.signature.key_sha256 !== a.signature.key_sha256 || value.rechecked_at !== value.recorded_at ||
      !(start <= Date.parse(value.recorded_at) && Date.parse(value.recorded_at) < end))) {
    issues.push({ severity: "critical", code: "MODEL_RECONCILIATION_RECORD_BINDING_INVALID", path: "$", message: "Receipt must bind exact fresh authorization and observed recheck." });
  }
  return issues;
}
function verifyAuthorization(value, key) {
  requireThat(contractIssues(value, "operator-model-reconciliation-authorization").length === 0 &&
    value.subject.trusted_key_sha256 === keyDigest(key) && validOperatorSignature(value, key), "CONSOLE_MODEL_RECONCILIATION_AUTHORIZATION_INVALID");
  return value;
}
function verifyRecord(value, key) {
  requireThat(contractIssues(value, "operator-model-reconciliation-record").length === 0 && validOperatorSignature(value, key),
    "CONSOLE_MODEL_RECONCILIATION_RECORD_INVALID"); verifyAuthorization(value.authorization, key); return value;
}
function recordFor(authorization, now, privateKey) {
  return signOperatorRecord({ schema_version: "0.1", type: "OperatorModelReconciliationRecord", id: `OMRR-${authorization.reconciliation_id}`,
    reconciliation_id: authorization.reconciliation_id, action_id: authorization.action_id, authorization, authorization_sha256: digest(authorization),
    subject_sha256: digest(authorization.subject), recorded_at: now, rechecked_at: now, resolution: authorization.resolution,
    original_failure_preserved: true, provider_billing_verified: false, provider_cancellation_verified: false,
    execution_authorized: false, release_authorized: false, human_final_decision_authority: "USER" }, privateKey);
}
module.exports = { TYPES, SUBJECT, AUTHORIZATION, RECORD, contractIssues, verifyAuthorization, verifyRecord, recordFor };
