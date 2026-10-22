const crypto = require("node:crypto"), path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { resolveRepository, manifestDigest, writeRepositoryArtifact } = require("./repository-artifact-store");
const { repositoryStateDigest } = require("./skill-mission-controller");
const { privateFile, requireThat, SESSION_MS } = require("./operator-console-auth");
const { inspectDecisionOutcome } = require("./operator-consent-outcome");
const { digest, keyDigest, signOperatorRecord } = require("./operator-consent-contract");
const { verifyAuthorization, verifyReconciliationRecord, resultForRecord } = require("./operator-reconciliation-contract");
const { ref, same, absent, snapshot, at, find, readBound, prefix, cancellationProof, receiptProof } = require("./operator-reconciliation-proof");
const { NONE } = require("./order-adoption-contract");
const { hash } = require("./operator-consent-service");

const meta = (db, key) => db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value;
const publicKey = db => crypto.createPublicKey(meta(db, "operator-signing-key")).export({ type: "spki", format: "pem" });
function priorRows(db, actionId, ignoredId) {
  return db.prepare("SELECT * FROM operator_reconciliations WHERE action_id=? AND id<>? ORDER BY created,id").all(actionId, ignoredId || "none");
}
function attemptsDigest(rows) {
  return digest(rows.filter(row => row.authorization).map(row => ({ id: row.id, state: row.state,
    authorization_sha256: digest(JSON.parse(row.authorization)), original_row_sha256: digest(JSON.parse(row.original_row)),
    result_sha256: digest(JSON.parse(row.result || "null")) })));
}
function assertService(configuration, db) {
  requireThat(resolveRepository(configuration.repository).identity_fingerprint === configuration.identity &&
    meta(db, "repository-binding") === hash(`${configuration.identity}\n${configuration.artifactRoot}`), "CONSOLE_REPOSITORY_IDENTITY_CHANGED", 409);
  requireThat(meta(db, "operator-service-instance") === configuration.serviceInstance && Number(meta(db, "operator-service-pid")) === process.pid,
    "CONSOLE_DECISION_SERVICE_CHANGED", 409);
  requireThat(repositoryStateDigest(__dirname) === configuration.sourceSha256, "CONSOLE_SOURCE_CHANGED_RESTART_REQUIRED", 409);
}
function withState(configuration, readOnly, callback) {
  const file = path.join(configuration.stateDir, "operator.sqlite"); privateFile(file);
  const db = new DatabaseSync(file, { readOnly }); db.exec("PRAGMA busy_timeout=5000");
  try { assertService(configuration, db); return callback(db); } finally { db.close(); }
}
function appraisal(configuration, db, actionId, options = {}) {
  assertService(configuration, db);
  const original = db.prepare("SELECT * FROM operator_actions WHERE id=?").get(actionId);
  requireThat(original?.state === "reconciliation_required", "CONSOLE_RECONCILIATION_ACTION_NOT_HELD", 409);
  requireThat(!db.prepare("SELECT id FROM operator_reconciliations WHERE action_id=? AND state='executing' AND id<>?")
    .get(actionId, options.ignoreAttemptId || "none"), "CONSOLE_RECONCILIATION_EXECUTION_UNCONFIRMED", 409);
  const trustedKey = publicKey(db), outcome = inspectDecisionOutcome(configuration, actionId), initial = JSON.parse(original.preview);
  requireThat(["applied", "unconsumed_decision", "partial_consent", "no_adoption_recorded"].includes(outcome.outcome),
    "CONSOLE_RECONCILIATION_OUTCOME_UNRESOLVED", 409);
  const store = loadVerifiedStore(configuration.repository, configuration.artifactRoot);
  requireThat(same(snapshot(store), outcome.observed_manifest), "CONSOLE_OUTCOME_SNAPSHOT_CHANGED", 409);
  const originalView = prefix(store, initial.observed_manifest), earlier = new Set(originalView.manifest.artifacts.map(entry => digest(ref(entry))));
  const rows = priorRows(db, actionId, options.ignoreAttemptId);
  const authorized = rows.filter(row => row.authorization), cancellations = [], knownScope = new Set(), knownReceipts = new Set();
  requireThat(rows.every(row => row.authorization || ["pending", "invalidated"].includes(row.state)), "CONSOLE_RECONCILIATION_OUTBOX_INCOMPLETE", 409);
  const authorizations = new Map();
  for (const row of authorized) {
    requireThat(row.original_row, "CONSOLE_RECONCILIATION_OUTBOX_INCOMPLETE", 409);
    const auth = JSON.parse(row.authorization), saved = JSON.parse(row.original_row), previous = JSON.parse(row.preview);
    verifyAuthorization(auth, trustedKey);
    requireThat(auth.reconciliation_id === row.id && auth.action_id === actionId && auth.principal_id === row.principal_id &&
      auth.principal_epoch === row.epoch && auth.session_sha256 === row.session_hash && auth.nonce_sha256 === row.nonce_hash &&
      auth.expires_at === new Date(row.expires).toISOString() && at(auth.created_at) >= row.created && at(auth.created_at) <= Date.now() &&
      same(auth.subject, previous.subject) && auth.resolution === previous.resolution &&
      same(auth.repository_binding, { repository_key: configuration.repositoryKey, identity_fingerprint: configuration.identity }) &&
      same(auth.subject.request, initial.request) && auth.subject.original_action_sha256 === digest(saved) && same(saved, original) &&
      auth.previous_result_sha256 === digest(JSON.parse(saved.result || "null")), "CONSOLE_RECONCILIATION_OUTBOX_INVALID", 409);
    const observed = prefix(store, auth.subject.observed_manifest);
    for (const reference of [auth.subject.request.proposal_ref, auth.subject.consent_ref, auth.subject.decision_ref, auth.subject.adoption_ref, auth.subject.prior_cancellation_ref]) {
      requireThat(absent(reference) || observed.manifest.artifacts.some(entry => same(ref(entry), reference)), "CONSOLE_RECONCILIATION_SUBJECT_HISTORY_INVALID", 409);
    }
    for (const field of ["consent_ref", "decision_ref", "adoption_ref"]) {
      requireThat(absent(auth.subject[field]) || same(auth.subject[field], outcome[field]), "CONSOLE_RECONCILIATION_SUBJECT_HISTORY_INVALID", 409);
    }
    authorizations.set(auth.id, auth);
    if (auth.resolution === "cancel_unconsumed") {
      const entry = find(store, "decision-logs", auth.cancellation_decision.id);
      if (entry) { const proof = cancellationProof(store, auth, ref(entry), trustedKey); cancellations.push(proof); knownScope.add(digest(proof.ref)); }
    }
  }
  requireThat(cancellations.length <= 1, "CONSOLE_RECONCILIATION_CONFLICTING_CANCELLATIONS", 409);
  if (options.ownedCancellation) {
    requireThat(options.ownedCancellation.authorization.reconciliation_id === options.ignoreAttemptId, "CONSOLE_RECONCILIATION_CANCELLATION_INVALID", 409);
    const proof = cancellationProof(store, options.ownedCancellation.authorization, options.ownedCancellation.ref, trustedKey); knownScope.add(digest(proof.ref));
  }
  for (const row of authorized) {
    const auth = authorizations.get(`ORA-${row.id}`), entry = find(store, "operator-reconciliation-records", `ORR-${row.id}`);
    if (!entry) continue;
    const proof = receiptProof(store, entry, auth, trustedKey);
    requireThat(!proof.payload.prior_authorization || (authorizations.has(proof.payload.prior_authorization.id) &&
      same(authorizations.get(proof.payload.prior_authorization.id), proof.payload.prior_authorization)),
      "CONSOLE_RECONCILIATION_PRIOR_OUTBOX_MISSING", 409); knownReceipts.add(digest(proof.ref));
  }
  for (const entry of store.manifest.artifacts.filter(item => item.mission_id === outcome.mission_id && item.wave_id === outcome.wave_id)) {
    if (entry.kind === "decision-logs") {
      const value = readBound(store, entry, initial.request, "decision-log");
      const relevant = value.authority_basis.reference === initial.proposal.id || value.affected_artifacts.includes(initial.request.proposal_ref.relative_path);
      if (relevant && value.decision_maker === "USER" && value.decision_type === "scope" && value.status === "complete") {
        requireThat(earlier.has(digest(ref(entry))) || same(ref(entry), outcome.decision_ref) || knownScope.has(digest(ref(entry))),
          "CONSOLE_RECONCILIATION_NEW_SCOPE_DECISION", 409);
      }
    } else if (entry.kind === "operator-reconciliation-records") {
      const value = readBound(store, entry, initial.request, "operator-reconciliation-record");
      requireThat(value.authorization.action_id !== actionId || knownReceipts.has(digest(ref(entry))), "CONSOLE_RECONCILIATION_UNOWNED_RECEIPT", 409);
    }
  }
  const prior = cancellations[0] || null;
  requireThat(!prior || outcome.outcome !== "applied", "CONSOLE_RECONCILIATION_CONFLICTING_CANCELLATIONS", 409);
  const subject = { original_action_sha256: digest(original), request: initial.request, observed_manifest: outcome.observed_manifest,
    recorded_outcome: outcome.outcome, consent_ref: outcome.consent_ref, decision_ref: outcome.decision_ref, adoption_ref: outcome.adoption_ref,
    adoption_status: outcome.adoption_status, original_consent_expires_at: outcome.original_consent_expires_at,
    source_state_sha256: outcome.source_state_sha256, repository_state_sha256: outcome.repository_state_sha256,
    trusted_key_sha256: keyDigest(trustedKey), attempts_sha256: attemptsDigest(rows),
    prior_cancellation_ref: prior?.ref || { ...NONE } };
  const result = { action_id: actionId, subject,
    resolution: outcome.outcome === "applied" ? "acknowledge_recorded" : prior ? "acknowledge_prior_cancellation" : "cancel_unconsumed",
    prior_authorization: prior?.authorization || null, execution_authorized: false, continuation_authorized: false, release_authorized: false };
  assertService(configuration, db);
  requireThat(publicKey(db) === trustedKey && repositoryStateDigest(configuration.repository) === outcome.repository_state_sha256 &&
    same(snapshot(loadVerifiedStore(configuration.repository, configuration.artifactRoot)), outcome.observed_manifest) &&
    same(db.prepare("SELECT * FROM operator_actions WHERE id=?").get(actionId), original), "CONSOLE_OUTCOME_SNAPSHOT_CHANGED", 409);
  return result;
}
function prepareReconciliation(configuration, actionId, manifest) {
  return withState(configuration, true, db => {
    const review = appraisal(configuration, db, actionId);
    requireThat(review.subject.observed_manifest.sha256 === manifest, "CONSOLE_EVIDENCE_SNAPSHOT_STALE", 409); return review;
  });
}
function executeReconciliation(configuration, id) {
  return withState(configuration, false, db => {
    let row, authorization, expected, ownedCancellation = null, terminalRef = null, publicationAttempted = false;
    try {
      row = db.prepare("SELECT * FROM operator_reconciliations WHERE id=?").get(id);
      requireThat(row?.state === "executing" && row.authorization && row.original_row, "CONSOLE_RECONCILIATION_NOT_RESERVED", 409);
      authorization = JSON.parse(row.authorization); const review = JSON.parse(row.preview), original = JSON.parse(row.original_row);
      verifyAuthorization(authorization, publicKey(db)); expected = authorization.subject.observed_manifest.sha256;
      requireThat(authorization.reconciliation_id === row.id && authorization.action_id === row.action_id &&
        authorization.principal_id === row.principal_id && authorization.principal_epoch === row.epoch &&
        authorization.session_sha256 === row.session_hash && authorization.nonce_sha256 === row.nonce_hash &&
        authorization.expires_at === new Date(row.expires).toISOString() && at(authorization.created_at) >= row.created &&
        same(authorization.subject, review.subject) && authorization.resolution === review.resolution &&
        authorization.subject.original_action_sha256 === digest(original) &&
        authorization.previous_result_sha256 === digest(JSON.parse(original.result || "null")) &&
        same(authorization.repository_binding, { repository_key: configuration.repositoryKey, identity_fingerprint: configuration.identity }),
      "CONSOLE_RECONCILIATION_OUTBOX_INVALID", 409);
      const guard = () => {
        assertService(configuration, db);
        const active = db.prepare("SELECT * FROM operator_reconciliations WHERE id=?").get(id);
        const principal = db.prepare("SELECT * FROM users WHERE id=?").get(row.principal_id);
        const sessionRow = db.prepare("SELECT * FROM sessions WHERE digest=? AND expires>?").get(row.session_hash, Date.now());
        const session = sessionRow && JSON.parse(sessionRow.value);
        requireThat(active?.state === "executing" && same(active, row) &&
          principal?.active && principal.role === "owner" && principal.epoch === row.epoch && session?.userId === row.principal_id &&
          session.epoch === row.epoch && Number.isFinite(session.startedAt) && session.startedAt + SESSION_MS > Date.now() &&
          row.created <= Date.now() && at(authorization.created_at) <= Date.now() && row.expires > Date.now(),
        "CONSOLE_RECONCILIATION_AUTHORIZATION_EXPIRED", 409);
        requireThat(same(db.prepare("SELECT * FROM operator_actions WHERE id=?").get(row.action_id), original) && original.state === "reconciliation_required" &&
          attemptsDigest(priorRows(db, row.action_id, id)) === authorization.subject.attempts_sha256 &&
          repositoryStateDigest(configuration.repository) === authorization.subject.repository_state_sha256 &&
          configuration.sourceSha256 === authorization.subject.source_state_sha256 &&
          keyDigest(publicKey(db)) === authorization.subject.trusted_key_sha256, "CONSOLE_RECONCILIATION_SUBJECT_CHANGED", 409);
        const store = loadVerifiedStore(configuration.repository, configuration.artifactRoot);
        requireThat(manifestDigest(store.manifest) === expected, "CONSOLE_EVIDENCE_SNAPSHOT_STALE", 409);
        if (terminalRef) {
          const entry = find(store, "operator-reconciliation-records", terminalRef.artifact_id);
          requireThat(entry && same(ref(entry), terminalRef), "CONSOLE_RECONCILIATION_RECEIPT_INVALID", 409);
          receiptProof(store, entry, authorization, publicKey(db));
        } else {
          const current = appraisal(configuration, db, row.action_id, { ignoreAttemptId: id, ownedCancellation });
          const subject = ownedCancellation ? { ...current.subject, observed_manifest: authorization.subject.observed_manifest } : current.subject;
          requireThat(same(subject, authorization.subject) && current.resolution === review.resolution &&
            same(current.prior_authorization, review.prior_authorization), "CONSOLE_RECONCILIATION_SUBJECT_CHANGED", 409);
        }
        return true;
      };
      guard();
      const publish = (payload, kind) => {
        const now = new Date().toISOString();
        requireThat(at(now) >= at(authorization.created_at), "CONSOLE_RECONCILIATION_TIME_INVALID", 409);
        publicationAttempted = true;
        const stored = writeRepositoryArtifact({ repositoryPath: configuration.repository, artifactRoot: configuration.artifactRoot,
          missionId: authorization.mission_id, waveId: authorization.wave_id, kind, artifactId: payload.id, payload, createdAt: now, reuseExisting: false,
          publicationGuard: () => { requireThat(Date.now() >= at(now), "CONSOLE_RECONCILIATION_TIME_INVALID", 409); return guard(); } });
        expected = stored.manifest_sha256;
        return { artifact_id: payload.id, relative_path: stored.relative_path, sha256: stored.sha256 };
      };
      let cancellationRef = { ...authorization.subject.prior_cancellation_ref };
      if (authorization.resolution === "cancel_unconsumed") {
        cancellationRef = publish(authorization.cancellation_decision, "decision-logs");
        ownedCancellation = { ref: cancellationRef, authorization };
      }
      guard();
      const record = signOperatorRecord({ schema_version: "0.1", type: "OperatorDecisionReconciliationRecord", id: `ORR-${id}`,
        mission_id: authorization.mission_id, wave_id: authorization.wave_id, recorded_at: new Date().toISOString(),
        authorization, prior_authorization: review.prior_authorization, cancellation_ref: cancellationRef,
        observed_manifest: snapshot(loadVerifiedStore(configuration.repository, configuration.artifactRoot)),
        terminal_state: authorization.resolution === "acknowledge_recorded" ? "applied" : "cancelled",
        human_final_decision_authority: "USER", execution_authorized: false, continuation_authorized: false, release_authorized: false }, meta(db, "operator-signing-key"));
      verifyReconciliationRecord(record, publicKey(db));
      // Receipt time and manifest publication time must be identical for replay.
      publicationAttempted = true;
      const stored = writeRepositoryArtifact({ repositoryPath: configuration.repository, artifactRoot: configuration.artifactRoot,
        missionId: record.mission_id, waveId: record.wave_id, kind: "operator-reconciliation-records", artifactId: record.id, payload: record,
        createdAt: record.recorded_at, reuseExisting: false, publicationGuard: () => {
          requireThat(Date.now() >= at(record.recorded_at), "CONSOLE_RECONCILIATION_TIME_INVALID", 409); return guard();
        } });
      expected = stored.manifest_sha256; terminalRef = { artifact_id: record.id, relative_path: stored.relative_path, sha256: stored.sha256 };
      const result = resultForRecord(record, terminalRef);
      db.exec("BEGIN IMMEDIATE");
      try {
        guard();
        requireThat(db.prepare("UPDATE operator_actions SET state=?,result=? WHERE id=? AND state='reconciliation_required'")
          .run(record.terminal_state, JSON.stringify(result), row.action_id).changes === 1, "CONSOLE_RECONCILIATION_SUBJECT_CHANGED", 409);
        requireThat(db.prepare("UPDATE operator_reconciliations SET state='applied',result=? WHERE id=? AND state='executing'")
          .run(JSON.stringify(result), id).changes === 1, "CONSOLE_RECONCILIATION_SUBJECT_CHANGED", 409);
        db.prepare("INSERT INTO audit(at,actor,action,subject) VALUES (?,?,?,?)")
          .run(new Date().toISOString(), row.principal_id, "terminal_reconciliation_applied", id);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      return result;
    } catch (error) {
      db.prepare("UPDATE operator_reconciliations SET state='reconciliation_required',result=? WHERE id=? AND state='executing'")
        .run(JSON.stringify({ error: /^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "CONSOLE_RECONCILIATION_BLOCKED",
          publication_attempted: publicationAttempted, execution_authorized: false, release_authorized: false }), id);
      throw error;
    }
  });
}
module.exports = { prepareReconciliation, executeReconciliation };
