const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { requireThat, assertSafeRationale } = require("./operator-console-auth");
const { digest, keyDigest, signOperatorRecord } = require("./operator-consent-contract");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { repositoryStateDigest } = require("./skill-mission-controller");
const { verifyAuthorization, verifyRecord, recordFor } = require("./operator-model-reconciliation-contract");
const { isModelCode } = require("./operator-semantic-evaluation-contract");
const AUTHORITY = { execution_authorized: false, release_authorized: false, human_final_decision_authority: "USER" };
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
function readJournal(directory, name) {
  const fd = fs.openSync(path.join(directory, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd); requireThat(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid() && stat.size > 0 && stat.size <= 1048576,
      "CONSOLE_MODEL_RECONCILIATION_JOURNAL_INVALID", 409);
    const buffer = Buffer.alloc(stat.size + 1), length = fs.readSync(fd, buffer, 0, buffer.length, 0), bytes = buffer.subarray(0, length);
    requireThat(length === stat.size && Buffer.from(bytes.toString("utf8")).equals(bytes), "CONSOLE_MODEL_RECONCILIATION_JOURNAL_CHANGED", 409);
    return { value: JSON.parse(bytes.toString("utf8")), sha256: hash(bytes) };
  } finally { fs.closeSync(fd); }
}
function absent(pid) {
  try { process.kill(pid, 0); return false; } catch (error) { return error.code === "ESRCH"; }
}
function openModelReconciliation({ auth, configuration, owner, transaction, audit, rowFor, verifiedResult, active, stateRoot, sourceCurrent, consentService }) {
  const db = auth.db, meta = key => db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value, key = () => consentService.publicKey();
  db.exec(`CREATE TABLE IF NOT EXISTS operator_model_reconciliations (
    id TEXT PRIMARY KEY, action_id TEXT NOT NULL, nonce_hash TEXT NOT NULL, principal_id TEXT NOT NULL, epoch INTEGER NOT NULL,
    session_hash TEXT NOT NULL, preview TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL,
    authorization TEXT, record TEXT, original_row TEXT, failure TEXT, reserved_sequence INTEGER UNIQUE);
    CREATE UNIQUE INDEX IF NOT EXISTS one_reserved_model_reconciliation ON operator_model_reconciliations(action_id) WHERE state='reserved';`);
  db.prepare("UPDATE operator_model_reconciliations SET state='failed',failure='CONSOLE_MODEL_RECONCILIATION_INTERRUPTED' WHERE state='reserved'").run();
  db.prepare("UPDATE operator_model_reconciliations SET state='invalidated' WHERE state='pending'").run();
  const rows = id => db.prepare("SELECT * FROM operator_model_reconciliations WHERE action_id=? AND state NOT IN ('pending','invalidated') ORDER BY reserved_sequence").all(id);
  function history(id, excluded) { return rows(id).filter(row => row.id !== excluded); }
  function signedAttempt(row) {
    const a = verifyAuthorization(JSON.parse(row.authorization), key());
    requireThat(a.reconciliation_id === row.id && a.action_id === row.action_id && a.principal_id === row.principal_id && a.principal_epoch === row.epoch &&
      a.sequence === row.reserved_sequence && a.nonce_sha256 === row.nonce_hash && a.session_sha256 === row.session_hash && digest(a.subject) === digest(JSON.parse(row.preview)) &&
      digest(JSON.parse(row.original_row)) === a.subject.original_action_sha256, "CONSOLE_MODEL_RECONCILIATION_ATTEMPT_CHANGED", 409);
    return a;
  }
  function completed(row, action) {
    const a = signedAttempt(row), record = verifyRecord(JSON.parse(row.record), key());
    const result = JSON.parse(action.result);
    requireThat(row.state === "committed" && digest(record.authorization) === digest(a) && digest(action) === a.subject.original_action_sha256 &&
      result.schema_version === "0.2" && result.collection?.journal_sha256 === a.subject.journal_sha256 &&
      digest(history(row.action_id, row.id).filter(prior => prior.reserved_sequence < row.reserved_sequence)) === a.subject.prior_attempts_sha256,
      "CONSOLE_MODEL_RECONCILIATION_HISTORY_CHANGED", 409);
    const directory = path.join(stateRoot, action.id), stat = fs.lstatSync(directory);
    requireThat(stat.isDirectory() && !stat.isSymbolicLink() && readJournal(directory, "result.json").sha256 === a.subject.journal_sha256 &&
      digest(readJournal(directory, "invocation.json").value) === digest(JSON.parse(action.preview)) &&
      digest(readJournal(directory, "consent.json").value) === digest(JSON.parse(action.consent)), "CONSOLE_MODEL_RECONCILIATION_HISTORY_CHANGED", 409);
    return record;
  }
  function status(action) {
    const attempts = rows(action.id); if (!attempts.length) return { state: "none", verified: false, record: null };
    try {
      let record = null;
      for (const row of attempts) {
        signedAttempt(row);
        requireThat(row.state !== "reserved", "CONSOLE_MODEL_RECONCILIATION_EXECUTION_UNCONFIRMED", 409);
        if (row.state === "committed") record = completed(row, action);
        else requireThat(row.state === "failed" && !row.record, "CONSOLE_MODEL_RECONCILIATION_HISTORY_CHANGED", 409);
      }
      return { state: record ? "acknowledged_failed_transfer" : "review_required", verified: !!record, record };
    } catch { return { state: "unverifiable", verified: false, record: null }; }
  }
  function subject(id, excluded) {
    sourceCurrent(configuration);
    const action = rowFor(id), result = action.result && JSON.parse(action.result), invocation = JSON.parse(action.preview);
    requireThat(action.state === "held" && verifiedResult(action) && !active.has(id), "CONSOLE_MODEL_RECONCILIATION_VERIFIED_FAILURE_REQUIRED", 409);
    const previous = history(id, excluded);
    requireThat(!previous.some(row => row.state === "reserved" || row.state === "committed"), "CONSOLE_MODEL_RECONCILIATION_ALREADY_RESERVED", 409);
    for (const row of previous) { signedAttempt(row); requireThat(row.state === "failed" && !row.record, "CONSOLE_MODEL_RECONCILIATION_HISTORY_CHANGED", 409); }
    const directory = path.join(stateRoot, id), stat = fs.lstatSync(directory);
    requireThat(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0,
      "CONSOLE_MODEL_RECONCILIATION_JOURNAL_INVALID", 409);
    const journal = readJournal(directory, "result.json"), retainedInvocation = readJournal(directory, "invocation.json"), consent = readJournal(directory, "consent.json");
    const value = journal.value, collection = result.collection;
    requireThat(result.schema_version === "0.2" && typeof collection?.journal_sha256 === "string" && /^[a-f0-9]{64}$/.test(collection.journal_sha256),
      "CONSOLE_MODEL_RECONCILIATION_JOURNAL_BINDING_REQUIRED", 409);
    requireThat(collection.journal_sha256 === journal.sha256, "CONSOLE_MODEL_RECONCILIATION_JOURNAL_CHANGED", 409);
    requireThat(digest(retainedInvocation.value) === digest(invocation) && digest(consent.value) === digest(JSON.parse(action.consent)) &&
      value.type === "CodexSemanticCollection" && value.invocation_sha256 === invocation.invocation_sha256 && value.consent_id === id &&
      ["evaluated", "not_evaluated"].includes(value.status) && value.result_persisted === true &&
      value.process_exit_confirmed === true && value.process_group_absent === true && collection?.process_exit_confirmed === true &&
      collection.process_group_absent === true && value.stdout_sha256 === collection.stdout_sha256 && value.stderr_sha256 === collection.stderr_sha256 &&
      value.status === collection.status && Number.isSafeInteger(value.pid) && value.pid > 1 &&
      Date.parse(value.ended_at) >= action.created && Date.parse(value.ended_at) <= Date.now(), "CONSOLE_MODEL_RECONCILIATION_TERMINATION_UNVERIFIED", 409);
    requireThat(absent(value.pid) && absent(-value.pid), "CONSOLE_MODEL_RECONCILIATION_PROCESS_PRESENT", 409);
    const reasons = [...new Set([...(collection.failure_reasons || []), ...(result.error ? [result.error] : [])])];
    requireThat(reasons.length && reasons.every(isModelCode), "CONSOLE_MODEL_RECONCILIATION_FAILURE_REQUIRED", 409);
    const store = loadVerifiedStore(configuration.repository, configuration.artifactRoot);
    return { action_id: id, repository_binding: { repository_key: configuration.repositoryKey, identity_fingerprint: configuration.identity },
      original_action_sha256: digest(action), invocation_sha256: invocation.invocation_sha256, consent_sha256: digest(JSON.parse(action.consent)),
      result_sha256: digest(result), journal_sha256: journal.sha256, prior_attempts_sha256: digest(previous), manifest_sha256: store.verification.manifest_sha256,
      repository_state_sha256: repositoryStateDigest(configuration.repository), runtime_source_sha256: configuration.sourceSha256,
      trusted_key_sha256: keyDigest(key()), process_id: value.pid, observed_at: new Date().toISOString(), child_exit_recorded: true,
      child_absence_observed: true, process_group_absence_observed: true, failure_reasons: reasons,
      transfer_effects: "possibly_transmitted", provider_billing_verified: false, provider_cancellation_verified: false };
  }
  function currentSubject(preview, id) {
    const current = subject(preview.action_id, id);
    requireThat(digest({ ...current, observed_at: preview.observed_at }) === digest(preview), "CONSOLE_MODEL_RECONCILIATION_SUBJECT_CHANGED", 409);
  }
  return {
    status,
    prepare(session, actionId) {
      const user = owner(session), review = subject(actionId), id = crypto.randomUUID(), nonce = crypto.randomBytes(32).toString("base64url"), now = Date.now();
      transaction(() => {
        owner(session); currentSubject(review, id);
        db.prepare("UPDATE operator_model_reconciliations SET state='invalidated' WHERE state='pending' AND expires<=?").run(now);
        requireThat(db.prepare("SELECT count(*) AS n FROM operator_model_reconciliations").get().n < 1000 &&
          db.prepare("SELECT count(*) AS n FROM operator_model_reconciliations WHERE action_id=?").get(actionId).n < 100 &&
          db.prepare("SELECT count(*) AS n FROM operator_model_reconciliations WHERE state='pending'").get().n < 20, "CONSOLE_MODEL_RECONCILIATION_HISTORY_LIMIT", 429);
        db.prepare("INSERT INTO operator_model_reconciliations VALUES (?,?,?,?,?,?,?,?,?,'pending',NULL,NULL,NULL,NULL,NULL)")
          .run(id, actionId, hash(nonce), user.id, user.epoch, hash(session.sessionId), JSON.stringify(review), now, now + 120000);
        audit(user.id, "model_reconciliation_previewed", id);
      });
      return { reconciliation_id: id, nonce, expires_at: new Date(now + 120000).toISOString(), subject: review, ...AUTHORITY };
    },
    async commit(session, input) {
      owner(session); await auth.reauthenticate(session, input.password); assertSafeRationale(input, session);
      requireThat(input.acknowledge_provider_uncertainty === true, "CONSOLE_MODEL_PROVIDER_UNCERTAINTY_ACKNOWLEDGMENT_REQUIRED", 409);
      const id = transaction(() => {
        const user = owner(session), row = db.prepare("SELECT * FROM operator_model_reconciliations WHERE id=?").get(input.reconciliation_id);
        requireThat(row?.state === "pending" && row.principal_id === user.id && row.epoch === user.epoch && row.session_hash === hash(session.sessionId) &&
          row.nonce_hash === hash(input.nonce) && row.created <= Date.now() && Date.now() < row.expires, "CONSOLE_MODEL_RECONCILIATION_CHALLENGE_DENIED", 409);
        const review = JSON.parse(row.preview); currentSubject(review, row.id);
        const sequence = db.prepare("SELECT coalesce(max(reserved_sequence),0)+1 AS n FROM operator_model_reconciliations").get().n;
        const authorization = signOperatorRecord({ schema_version: "0.1", type: "OperatorModelReconciliationAuthorization", id: `OMRA-${row.id}`, sequence,
          reconciliation_id: row.id, action_id: row.action_id, purpose: "acknowledge_one_failed_model_transfer", resolution: "acknowledge_failed_transfer",
          principal_id: user.id, principal_epoch: user.epoch, authentication_method: "local_owner_password_reauthentication", session_sha256: row.session_hash,
          nonce_sha256: row.nonce_hash, rationale: input.rationale, created_at: new Date().toISOString(), expires_at: new Date(row.expires).toISOString(),
          subject: review, provider_uncertainty_acknowledged: true, ...AUTHORITY }, meta("operator-signing-key"));
        verifyAuthorization(authorization, key());
        db.prepare("UPDATE operator_model_reconciliations SET state='reserved',authorization=?,original_row=?,reserved_sequence=? WHERE id=?")
          .run(JSON.stringify(authorization), JSON.stringify(rowFor(row.action_id)), sequence, row.id);
        audit(user.id, "model_reconciliation_reserved", row.id); return row.id;
      });
      try {
        return transaction(() => {
          owner(session); const row = db.prepare("SELECT * FROM operator_model_reconciliations WHERE id=?").get(id);
          requireThat(row.state === "reserved" && Date.now() >= row.created && Date.now() < row.expires,
            "CONSOLE_MODEL_RECONCILIATION_EXPIRED_OR_CHANGED", 409);
          const authorization = signedAttempt(row); currentSubject(authorization.subject, row.id);
          const record = recordFor(authorization, new Date().toISOString(), meta("operator-signing-key")); verifyRecord(record, key());
          db.prepare("UPDATE operator_model_reconciliations SET state='committed',record=? WHERE id=? AND state='reserved'").run(JSON.stringify(record), id);
          const persisted = db.prepare("SELECT * FROM operator_model_reconciliations WHERE id=?").get(id);
          requireThat(persisted?.state === "committed" && persisted.record === JSON.stringify(record),
            "CONSOLE_MODEL_RECONCILIATION_RECORD_NOT_PERSISTED", 409);
          requireThat(digest(completed(persisted, rowFor(row.action_id))) === digest(record),
            "CONSOLE_MODEL_RECONCILIATION_RECORD_NOT_PERSISTED", 409);
          audit(row.principal_id, "model_reconciliation_committed", id);
          return { record, original_failure_preserved: true, new_model_invocation_started: false, ...AUTHORITY };
        });
      } catch (error) {
        db.prepare("UPDATE operator_model_reconciliations SET state='failed',failure=? WHERE id=? AND state='reserved'")
          .run(/^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "CONSOLE_MODEL_RECONCILIATION_FAILED", id);
        throw error;
      }
    },
    list(session, actionId) {
      owner(session); rowFor(actionId);
      return { entries: db.prepare("SELECT * FROM operator_model_reconciliations WHERE action_id=? ORDER BY created,id LIMIT 100").all(actionId).map(row => {
        let record = null;
        try { if (row.state === "committed") record = completed(row, rowFor(actionId)); } catch { /* Inspection preserves a changed receipt as unverifiable. */ }
        return { id: row.id, action_id: row.action_id, state: row.state === "committed" && !record ? "unverifiable" : row.state,
          created_at: new Date(row.created).toISOString(), failure: row.failure, record, ...AUTHORITY };
      }), ...AUTHORITY };
    },
    close() { db.prepare("UPDATE operator_model_reconciliations SET state='invalidated' WHERE state='pending'").run(); }
  };
}
module.exports = { openModelReconciliation, readJournal };
