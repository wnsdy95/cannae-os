const { requireThat } = require("./operator-console-auth");
const { manifestDigest } = require("./repository-artifact-store");
const { readEntry } = require("./operator-console-evidence");
const { digest } = require("./operator-consent-contract");
const { verifyAuthorization, verifyReconciliationRecord, resultForRecord } = require("./operator-reconciliation-contract");
const { prefixBeforeEntry } = require("./campaign-terminal-controller");
const { historicalSettlementStore } = require("./effect-settlement-proof");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { NONE } = require("./order-adoption-contract");
const ref = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
const same = (a, b) => digest(a) === digest(b), absent = value => same(value, NONE);
const snapshot = store => ({ revision: store.manifest.manifest_revision, sha256: manifestDigest(store.manifest) });
function at(value) { const time = Date.parse(value); requireThat(Number.isFinite(time), "CONSOLE_RECONCILIATION_TIME_INVALID", 409); return time; }
function find(store, kind, id) {
  const matches = store.manifest.artifacts.filter(entry => entry.kind === kind && entry.artifact_id === id);
  requireThat(matches.length <= 1, "CONSOLE_RECONCILIATION_REFERENCE_AMBIGUOUS", 409); return matches[0];
}
function readBound(store, entry, scope, type) {
  const value = JSON.parse(readEntry(store, entry));
  requireThat(validatePayload(value, type).valid && value.id === entry.artifact_id && value.mission_id === entry.mission_id &&
    entry.mission_id === scope.mission_id && entry.wave_id === scope.wave_id &&
    (type === "decision-log" || value.wave_id === entry.wave_id), "CONSOLE_RECONCILIATION_EVIDENCE_INVALID", 409);
  return value;
}
function prefix(store, observed) {
  if (same(snapshot(store), observed)) return store;
  return historicalSettlementStore(store, observed.revision, observed.sha256);
}
function subjectReferences(store, authorization) {
  requireThat(authorization.repository_binding.repository_key === store.verification.repository.key &&
    authorization.repository_binding.identity_fingerprint === store.verification.repository.identity_fingerprint,
  "CONSOLE_RECONCILIATION_REPOSITORY_MISMATCH", 409);
  const subject = authorization.subject, view = prefix(store, subject.observed_manifest);
  for (const [reference, kind] of [[subject.request.proposal_ref, "order-adoption-proposals"],
    ...subject.request.backbrief_refs.map(value => [value, "order-backbriefs"]), [subject.request.rehearsal_ref, "order-rehearsals"],
    [subject.consent_ref, "operator-consent-records"], [subject.decision_ref, "decision-logs"],
    [subject.adoption_ref, "order-adoption-records"], [subject.prior_cancellation_ref, "decision-logs"]]) {
    requireThat(absent(reference) || view.manifest.artifacts.some(entry => entry.kind === kind && same(ref(entry), reference) &&
      entry.mission_id === authorization.mission_id && entry.wave_id === authorization.wave_id),
    "CONSOLE_RECONCILIATION_SUBJECT_HISTORY_INVALID", 409);
  }
}
function cancellationProof(store, authorization, reference, trustedKey) {
  verifyAuthorization(authorization, trustedKey);
  subjectReferences(store, authorization);
  const entry = find(store, "decision-logs", reference.artifact_id);
  requireThat(entry && same(ref(entry), reference) && authorization.resolution === "cancel_unconsumed", "CONSOLE_RECONCILIATION_CANCELLATION_MISSING", 409);
  const payload = readBound(store, entry, authorization, "decision-log");
  requireThat(same(payload, authorization.cancellation_decision) &&
    same(snapshot(prefixBeforeEntry(store, entry)), authorization.subject.observed_manifest) &&
    at(entry.created_at) >= at(authorization.created_at) && at(entry.created_at) < at(authorization.expires_at) &&
    at(entry.created_at) <= Date.now(), "CONSOLE_RECONCILIATION_CANCELLATION_INVALID", 409);
  return { entry, payload, ref: ref(entry), authorization };
}
function receiptProof(store, entry, authorization, trustedKey) {
  const payload = readBound(store, entry, authorization, "operator-reconciliation-record");
  verifyReconciliationRecord(payload, trustedKey);
  subjectReferences(store, authorization);
  requireThat(same(payload.authorization, authorization) && payload.recorded_at === entry.created_at && at(payload.recorded_at) <= Date.now() &&
    same(snapshot(prefixBeforeEntry(store, entry)), payload.observed_manifest), "CONSOLE_RECONCILIATION_RECEIPT_INVALID", 409);
  if (authorization.resolution !== "acknowledge_recorded") {
    const cancelAuth = payload.prior_authorization || authorization;
    cancellationProof(prefixBeforeEntry(store, entry), cancelAuth, payload.cancellation_ref, trustedKey);
  }
  return { entry, payload, ref: ref(entry) };
}
function terminalProjectionProof(store, original, db, trustedKey) {
  const result = JSON.parse(original.result || "null"), request = JSON.parse(original.preview).request;
  const reference = result?.reconciliation_ref;
  requireThat(reference && !absent(reference), "CONSOLE_RECONCILIATION_PROJECTION_INVALID", 409);
  const entry = find(store, "operator-reconciliation-records", reference.artifact_id);
  requireThat(entry && same(ref(entry), reference), "CONSOLE_RECONCILIATION_PROJECTION_INVALID", 409);
  const record = readBound(store, entry, request, "operator-reconciliation-record");
  const row = db.prepare("SELECT * FROM operator_reconciliations WHERE id=?").get(record.authorization.reconciliation_id);
  requireThat(row?.state === "applied" && row.action_id === original.id && row.original_row && row.authorization,
    "CONSOLE_RECONCILIATION_PROJECTION_INVALID", 409);
  const archived = JSON.parse(row.original_row), auth = record.authorization;
  requireThat(archived.state === "reconciliation_required" && same({ ...archived, state: original.state, result: original.result }, original) &&
    original.state === record.terminal_state && same(auth.subject.request, request) && auth.action_id === original.id &&
    auth.reconciliation_id === row.id && auth.principal_id === row.principal_id && auth.principal_epoch === row.epoch &&
    auth.session_sha256 === row.session_hash && auth.nonce_sha256 === row.nonce_hash && auth.expires_at === new Date(row.expires).toISOString() &&
    at(auth.created_at) >= row.created && at(auth.created_at) <= at(record.recorded_at) &&
    digest(archived) === auth.subject.original_action_sha256 && auth.previous_result_sha256 === digest(JSON.parse(archived.result || "null")) &&
    same(JSON.parse(row.authorization), auth) && same(JSON.parse(row.result), result) && same(resultForRecord(record, reference), result),
  "CONSOLE_RECONCILIATION_PROJECTION_INVALID", 409);
  return receiptProof(store, entry, auth, trustedKey);
}
module.exports = { ref, same, absent, snapshot, at, find, readBound, prefix, cancellationProof, receiptProof, terminalProjectionProof };
