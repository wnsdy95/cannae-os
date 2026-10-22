const crypto = require("node:crypto");
const { requireThat, assertSafeRationale } = require("./operator-console-auth");
const { digest, keyDigest, signOperatorRecord } = require("./operator-consent-contract");
const { cancellationForAuthorization, verifyAuthorization } = require("./operator-reconciliation-contract");

function openReconciliationService({ auth, configuration, owner, transaction, audit, hash }) {
  const db = auth.db, meta = key => db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value;
  const key = () => crypto.createPublicKey(meta("operator-signing-key")).export({ type: "spki", format: "pem" });
  function heldAction(id, subject) {
    const action = db.prepare("SELECT * FROM operator_actions WHERE id=?").get(id);
    requireThat(action?.state === "reconciliation_required" && digest(action) === subject.original_action_sha256,
      "CONSOLE_RECONCILIATION_SUBJECT_CHANGED", 409); return action;
  }
  return {
    prepare(session, appraisal) {
      const principal = owner(session), id = crypto.randomUUID(), raw = crypto.randomBytes(32).toString("base64url");
      const now = Date.now(), expires = now + 120000;
      requireThat(Buffer.byteLength(JSON.stringify(appraisal)) <= 4 * 1024 * 1024 &&
        appraisal.subject.trusted_key_sha256 === keyDigest(key()), "CONSOLE_RECONCILIATION_PREVIEW_INVALID", 409);
      transaction(() => {
        owner(session); heldAction(appraisal.action_id, appraisal.subject);
        db.prepare("UPDATE operator_reconciliations SET state='invalidated' WHERE state='pending' AND expires<=?").run(now);
        requireThat(db.prepare("SELECT COUNT(*) AS n FROM operator_reconciliations WHERE state='pending'").get().n < 100,
          "CONSOLE_PREVIEW_LIMIT", 429);
        requireThat(!db.prepare("SELECT id FROM operator_reconciliations WHERE action_id=? AND state='executing'").get(appraisal.action_id),
          "CONSOLE_RECONCILIATION_EXECUTION_UNCONFIRMED", 409);
        db.prepare(`INSERT INTO operator_reconciliations
          (id,action_id,nonce_hash,principal_id,epoch,session_hash,preview,created,expires,state)
          VALUES (?,?,?,?,?,?,?,?,?,'pending')`).run(id, appraisal.action_id, hash(raw), principal.id, principal.epoch,
          hash(session.sessionId), JSON.stringify(appraisal), now, expires);
        audit(principal.id, "terminal_review_previewed", id);
      });
      return { reconciliation_id: id, nonce: raw, expires_at: new Date(expires).toISOString(), review: appraisal,
        execution_authorized: false, continuation_authorized: false, release_authorized: false };
    },
    async reserve(session, input) {
      await auth.reauthenticate(session, input.password); assertSafeRationale(input, session);
      return transaction(() => {
        const principal = owner(session), row = db.prepare("SELECT * FROM operator_reconciliations WHERE id=?").get(input.reconciliation_id);
        requireThat(row?.state === "pending" && row.principal_id === principal.id && row.epoch === principal.epoch &&
          row.session_hash === hash(session.sessionId) && row.nonce_hash === hash(input.nonce) && row.created <= Date.now() && row.expires > Date.now(),
        "CONSOLE_RECONCILIATION_CHALLENGE_DENIED", 409);
        requireThat(!db.prepare("SELECT id FROM operator_reconciliations WHERE action_id=? AND state='executing'").get(row.action_id),
          "CONSOLE_RECONCILIATION_EXECUTION_UNCONFIRMED", 409);
        const preview = JSON.parse(row.preview), action = heldAction(row.action_id, preview.subject);
        const value = { schema_version: "0.1", type: "OperatorReconciliationAuthorization", id: `ORA-${row.id}`,
          reconciliation_id: row.id, action_id: row.action_id, mission_id: preview.subject.request.mission_id, wave_id: preview.subject.request.wave_id,
          created_at: new Date().toISOString(), expires_at: new Date(row.expires).toISOString(),
          repository_binding: { repository_key: configuration.repositoryKey, identity_fingerprint: configuration.identity },
          principal_id: principal.id, principal_epoch: principal.epoch, authentication_method: "local_owner_password_reauthentication",
          session_sha256: row.session_hash, nonce_sha256: row.nonce_hash, subject: preview.subject,
          resolution: preview.resolution, rationale: input.rationale, previous_result_sha256: digest(JSON.parse(action.result || "null")),
          cancellation_decision: null, human_final_decision_authority: "USER", execution_authorized: false, continuation_authorized: false, release_authorized: false };
        if (value.resolution === "cancel_unconsumed") value.cancellation_decision = cancellationForAuthorization(value);
        const authorization = signOperatorRecord(value, meta("operator-signing-key")); verifyAuthorization(authorization, key());
        db.prepare("UPDATE operator_reconciliations SET state='executing',authorization=?,original_row=? WHERE id=? AND state='pending'")
          .run(JSON.stringify(authorization), JSON.stringify(action), row.id);
        audit(principal.id, "terminal_reconciliation_reserved", row.id);
        return row.id;
      });
    },
    fail(id, code) {
      db.prepare("UPDATE operator_reconciliations SET state='reconciliation_required',result=? WHERE id=? AND state='executing'")
        .run(JSON.stringify({ error: /^CONSOLE_[A-Z_]+$/.test(code) ? code : "CONSOLE_RECONCILIATION_FAILED",
          execution_authorized: false, release_authorized: false }), id);
    },
    list(session, actionId) {
      owner(session);
      return db.prepare("SELECT id,action_id,state,created,expires,preview,result,original_row FROM operator_reconciliations WHERE action_id=? ORDER BY created DESC LIMIT 100")
        .all(actionId).map(row => ({ id: row.id, action_id: row.action_id, state: row.state, resolution: JSON.parse(row.preview).resolution,
          created_at: new Date(row.created).toISOString(), expires_at: new Date(row.expires).toISOString(),
          original_failure: (() => { const error = row.original_row && JSON.parse(JSON.parse(row.original_row).result || "null")?.error;
            return typeof error === "string" && /^CONSOLE_[A-Z_]+$/.test(error) ? error : "none"; })(),
          result: row.result ? JSON.parse(row.result) : null, execution_authorized: false, release_authorized: false }));
    }
  };
}
module.exports = { openReconciliationService };
