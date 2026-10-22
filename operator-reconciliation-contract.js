const { digest, keyDigest, validOperatorSignature } = require("./operator-consent-contract");
const { NONE } = require("./order-adoption-contract");
const same = (a, b) => digest(a) === digest(b);
const absent = ref => same(ref, NONE);
const TYPES = new Set(["operator-reconciliation-authorization", "operator-reconciliation-record"]);
const AUDIT_TYPES = new Set(["OperatorConsentRecord", "OperatorReconciliationAuthorization", "OperatorDecisionReconciliationRecord"]);
function cancellationOption(auth) {
  return `cancel-interrupted-order:${digest({ action_id: auth.action_id, authorization_id: auth.id,
    subject: auth.subject, principal_id: auth.principal_id, principal_epoch: auth.principal_epoch, created_at: auth.created_at })}`;
}
function cancellationForAuthorization(auth) {
  const option = cancellationOption(auth), proposal = auth.subject.request.proposal_ref;
  return { schema_version: "0.1", type: "DecisionLogEntry", id: `DL-OPERATOR-CANCEL-${auth.reconciliation_id}`,
    mission_id: auth.mission_id, decided_at: auth.created_at, decision_maker: "USER", decision_type: "scope",
    question: `Cancel preexisting unconsumed decisions for order ${proposal.artifact_id}`,
    options_considered: [option], chosen_option: option, rationale: auth.rationale,
    authority_basis: { basis_type: "retained_authority", reference: proposal.artifact_id,
      summary: `Authenticated local owner ${auth.principal_id}; terminal consent ${auth.id}.` },
    affected_artifacts: [proposal.relative_path], review_trigger: "Any future order requires new exact review; original consent is not renewed.", status: "complete" };
}
function authorizationIssues(value) {
  const issues = [], add = code => issues.push({ code, severity: "critical", path: "$", message: code });
  const s = value.subject;
  if (value.id !== `ORA-${value.reconciliation_id}` || s.request.id !== `OADR-${value.action_id}` || !absent(s.request.decision_ref) ||
      value.mission_id !== s.request.mission_id || value.wave_id !== s.request.wave_id ||
      value.signature.key_sha256 !== s.trusted_key_sha256) add("OPERATOR_RECONCILIATION_SCOPE_INVALID");
  const start = Date.parse(value.created_at), end = Date.parse(value.expires_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 120000) add("OPERATOR_RECONCILIATION_VALIDITY_INVALID");
  const refs = [!absent(s.consent_ref), !absent(s.decision_ref), !absent(s.adoption_ref)];
  const expected = { applied: [true, true, true], unconsumed_decision: [true, true, false], partial_consent: [true, false, false], no_adoption_recorded: [false, false, false] }[s.recorded_outcome];
  if (!same(refs, expected) || (refs[0] && s.consent_ref.artifact_id !== `OCR-${value.action_id}`) ||
      (refs[1] && s.decision_ref.artifact_id !== `DL-OPERATOR-${value.action_id}`)) add("OPERATOR_RECONCILIATION_OUTCOME_INVALID");
  if (s.recorded_outcome === "applied") {
    const status = { approve: "adopted", reject: "rejected", revise: "revision_required" }[s.request.disposition];
    if (s.adoption_status !== status || value.resolution !== "acknowledge_recorded" || !absent(s.prior_cancellation_ref)) add("OPERATOR_RECONCILIATION_OUTCOME_INVALID");
  } else if (s.adoption_status !== "none" || value.resolution === "acknowledge_recorded") add("OPERATOR_RECONCILIATION_OUTCOME_INVALID");
  if (value.resolution === "cancel_unconsumed") {
    if (!absent(s.prior_cancellation_ref) || !same(value.cancellation_decision, cancellationForAuthorization(value))) add("OPERATOR_RECONCILIATION_CANCELLATION_INVALID");
  } else if (value.cancellation_decision !== null || (value.resolution === "acknowledge_prior_cancellation" && absent(s.prior_cancellation_ref))) {
    add("OPERATOR_RECONCILIATION_CANCELLATION_INVALID");
  }
  return issues;
}
function reconciliationIssues(value, type) {
  if (!TYPES.has(type)) return [];
  if (type === "operator-reconciliation-authorization") return authorizationIssues(value);
  const a = value.authorization, issues = [], add = code => issues.push({ code, severity: "critical", path: "$", message: code });
  if (value.id !== `ORR-${a.reconciliation_id}` || value.mission_id !== a.mission_id || value.wave_id !== a.wave_id ||
      value.signature.key_sha256 !== a.subject.trusted_key_sha256) add("OPERATOR_RECONCILIATION_RECORD_SCOPE_INVALID");
  if (Date.parse(value.recorded_at) < Date.parse(a.created_at) || Date.parse(value.recorded_at) >= Date.parse(a.expires_at)) add("OPERATOR_RECONCILIATION_RECORD_TIME_INVALID");
  const expectedState = a.resolution === "acknowledge_recorded" ? "applied" : "cancelled";
  if (value.terminal_state !== expectedState) add("OPERATOR_RECONCILIATION_RECORD_SCOPE_INVALID");
  if (a.resolution === "acknowledge_recorded") {
    if (!absent(value.cancellation_ref) || value.prior_authorization !== null) add("OPERATOR_RECONCILIATION_CANCELLATION_INVALID");
  } else if (a.resolution === "cancel_unconsumed") {
    if (absent(value.cancellation_ref) || value.cancellation_ref.artifact_id !== a.cancellation_decision?.id || value.prior_authorization !== null) add("OPERATOR_RECONCILIATION_CANCELLATION_INVALID");
  } else {
    const prior = value.prior_authorization;
    if (!same(value.cancellation_ref, a.subject.prior_cancellation_ref) || !prior || prior.resolution !== "cancel_unconsumed" ||
        prior.action_id !== a.action_id || prior.mission_id !== a.mission_id || prior.wave_id !== a.wave_id ||
        !same(prior.repository_binding, a.repository_binding) || !same(prior.subject.request, a.subject.request) ||
        prior.subject.original_action_sha256 !== a.subject.original_action_sha256 ||
        value.cancellation_ref.artifact_id !== prior.cancellation_decision?.id) add("OPERATOR_RECONCILIATION_PRIOR_CANCELLATION_INVALID");
  }
  const delta = a.resolution === "cancel_unconsumed" ? 1 : 0;
  if (value.observed_manifest.revision !== a.subject.observed_manifest.revision + delta ||
      (delta === 0 ? !same(value.observed_manifest, a.subject.observed_manifest) : value.observed_manifest.sha256 === a.subject.observed_manifest.sha256)) {
    add("OPERATOR_RECONCILIATION_MANIFEST_INVALID");
  }
  return issues;
}
function verifyAuthorization(value, trustedPublicKey) {
  const v = require("./validator-cli-prototype/validate").validatePayload(value, "operator-reconciliation-authorization");
  if (!v.valid) throw new Error("OPERATOR_RECONCILIATION_AUTHORIZATION_INVALID");
  if (!validOperatorSignature(value, trustedPublicKey) || value.subject.trusted_key_sha256 !== keyDigest(trustedPublicKey)) throw new Error("OPERATOR_RECONCILIATION_SIGNATURE_INVALID");
  return { valid: true, execution_authorized: false, continuation_authorized: false, release_authorized: false };
}
function verifyReconciliationRecord(value, trustedPublicKey) {
  const v = require("./validator-cli-prototype/validate").validatePayload(value, "operator-reconciliation-record");
  if (!v.valid) throw new Error("OPERATOR_RECONCILIATION_RECORD_INVALID");
  verifyAuthorization(value.authorization, trustedPublicKey);
  if (value.prior_authorization) verifyAuthorization(value.prior_authorization, trustedPublicKey);
  if (!validOperatorSignature(value, trustedPublicKey)) throw new Error("OPERATOR_RECONCILIATION_SIGNATURE_INVALID");
  return { valid: true, execution_authorized: false, continuation_authorized: false, release_authorized: false };
}
function resultForRecord(record, recordRef) {
  const subject = record.authorization.subject;
  return { reconciled: true, terminal_state: record.terminal_state, recorded_original_outcome: subject.recorded_outcome,
    adoption_status: subject.adoption_status, consent_ref: subject.consent_ref, decision_ref: subject.decision_ref, adoption_ref: subject.adoption_ref,
    cancellation_ref: record.cancellation_ref, reconciliation_ref: recordRef, original_consent_expires_at: subject.original_consent_expires_at,
    execution_authorized: false, continuation_authorized: false, release_authorized: false };
}
module.exports = { TYPES, AUDIT_TYPES, cancellationOption, cancellationForAuthorization, reconciliationIssues, verifyAuthorization, verifyReconciliationRecord, resultForRecord };
