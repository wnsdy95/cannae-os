const { digest, keyDigest, validOperatorSignature, signOperatorRecord } = require("./operator-consent-contract");
function createReconciliationContract(profile) {
  const { types, authorizationType, authorizationSchema, recordSchema, authorizationPrefix, recordPrefix, recordType } = profile;
  function contractIssues(value, type) {
    if (!types.has(type)) return [];
    const authorizationOnly = type === authorizationType, schema = authorizationOnly ? authorizationSchema : recordSchema;
    if (!schema.safeParse(value).success) return [{ severity: "critical", code: "MODEL_RECONCILIATION_SCHEMA_INVALID", path: "$", message: "Exact non-authorizing reconciliation contract required." }];
    const issues = [], a = authorizationOnly ? value : value.authorization, start = Date.parse(a.created_at), end = Date.parse(a.expires_at);
    if (a.id !== `${authorizationPrefix}-${a.reconciliation_id}` || a.action_id !== a.subject.action_id ||
      a.subject.trusted_key_sha256 !== a.signature.key_sha256 || !(Date.parse(a.subject.observed_at) <= start && start < end && end - start <= 120000) ||
      start - Date.parse(a.subject.observed_at) > 120000 || !a.rationale.trim()) issues.push({ severity: "critical", code: "MODEL_RECONCILIATION_AUTHORIZATION_BINDING_INVALID", path: "$", message: "Bind exact action, key, observation and finite fresh owner review." });
    if (!authorizationOnly && (value.id !== `${recordPrefix}-${a.reconciliation_id}` || value.reconciliation_id !== a.reconciliation_id ||
      value.action_id !== a.action_id || value.authorization_sha256 !== digest(a) || value.subject_sha256 !== digest(a.subject) ||
      value.signature.key_sha256 !== a.signature.key_sha256 || value.rechecked_at !== value.recorded_at ||
      !(start <= Date.parse(value.recorded_at) && Date.parse(value.recorded_at) < end))) issues.push({ severity: "critical", code: "MODEL_RECONCILIATION_RECORD_BINDING_INVALID", path: "$", message: "Receipt must bind exact fresh authorization and observed recheck." });
    return [...issues, ...(profile.subjectIssues?.(a.subject) || [])];
  }
  function requireThat(value, code) { if (!value) throw new Error(code); }
  function verifyAuthorization(value, key) {
    requireThat(contractIssues(value, authorizationType).length === 0 && value.subject.trusted_key_sha256 === keyDigest(key) && validOperatorSignature(value, key), "CONSOLE_MODEL_RECONCILIATION_AUTHORIZATION_INVALID");
    return value;
  }
  function verifyRecord(value, key) {
    requireThat(contractIssues(value, recordType).length === 0 && validOperatorSignature(value, key), "CONSOLE_MODEL_RECONCILIATION_RECORD_INVALID");
    verifyAuthorization(value.authorization, key); return value;
  }
  function recordFor(authorization, now, privateKey) {
    return signOperatorRecord({ schema_version: "0.1", type: profile.recordTag, id: `${recordPrefix}-${authorization.reconciliation_id}`,
      reconciliation_id: authorization.reconciliation_id, action_id: authorization.action_id, authorization, authorization_sha256: digest(authorization),
      subject_sha256: digest(authorization.subject), recorded_at: now, rechecked_at: now, resolution: authorization.resolution,
      original_failure_preserved: true, provider_billing_verified: false, provider_cancellation_verified: false,
      execution_authorized: false, release_authorized: false, human_final_decision_authority: "USER" }, privateKey);
  }
  return { contractIssues, verifyAuthorization, verifyRecord, recordFor };
}
module.exports = { createReconciliationContract };
