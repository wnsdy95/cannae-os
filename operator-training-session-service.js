const crypto = require("node:crypto"), t = require("./task-training-contract");
const { requireThat, assertSafeRationale } = require("./operator-console-auth");
function openTrainingSessionService({ auth, owner, transaction, audit, hash }) {
  const db = auth.db;
  db.exec(`CREATE TABLE IF NOT EXISTS operator_training_sessions (
    id TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL, principal_id TEXT NOT NULL, epoch INTEGER NOT NULL,
    session_hash TEXT NOT NULL, preview TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL, result TEXT);`);
  transaction(() => { db.prepare("UPDATE operator_training_sessions SET state='invalidated' WHERE state='pending'").run();
    db.prepare("UPDATE operator_training_sessions SET state='reconciliation_required' WHERE state='executing'").run(); });
  const held = () => db.prepare("SELECT id FROM operator_training_sessions WHERE state IN ('executing','reconciliation_required')").get();
  const view = row => ({ id: row.id, state: row.state, created_at: new Date(row.created).toISOString(), expires_at: new Date(row.expires).toISOString(),
    proposal_id: JSON.parse(row.preview).proposal.id, performer_id: JSON.parse(row.preview).proposal.request.performer_id,
    result: row.result ? JSON.parse(row.result) : null, ...t.FLAGS });
  return {
    prepare(session, review) {
      const current = owner(session), now = Date.now(), expires = Math.min(now + 120000, Date.parse(review.proposal.expires_at));
      requireThat(expires > now && Buffer.byteLength(JSON.stringify(review)) <= 196608, "CONSOLE_TRAINING_REVIEW_INVALID", 409);
      const id = crypto.randomUUID(), nonce = crypto.randomBytes(32).toString("base64url");
      transaction(() => { owner(session); requireThat(!held(), "CONSOLE_TRAINING_RECONCILIATION_REQUIRED", 409);
        db.prepare("UPDATE operator_training_sessions SET state='invalidated' WHERE state='pending' AND expires<=?").run(now);
        requireThat(db.prepare("SELECT COUNT(*) AS n FROM operator_training_sessions WHERE state='pending'").get().n < 100, "CONSOLE_TRAINING_PREVIEW_LIMIT", 429);
        db.prepare("INSERT INTO operator_training_sessions VALUES (?,?,?,?,?,?,?,?,'pending',NULL)")
          .run(id, hash(nonce), current.id, current.epoch, hash(session.sessionId), JSON.stringify(review), now, expires);
        audit(current.id, "training_session_preview_created", id);
      });
      return { challenge_id: id, nonce, expires_at: new Date(expires).toISOString(), review, displayed_review_sha256: t.digest(review), ...t.FLAGS };
    },
    async reserve(session, input) {
      const current = owner(session); await auth.reauthenticate(session, input.password); assertSafeRationale(input, session);
      requireThat(input.acknowledge_session_only === true, "CONSOLE_TRAINING_ACKNOWLEDGMENT_REQUIRED", 400);
      return transaction(() => { owner(session); requireThat(!held(), "CONSOLE_TRAINING_RECONCILIATION_REQUIRED", 409);
        const row = db.prepare("SELECT * FROM operator_training_sessions WHERE id=?").get(input.challenge_id);
        requireThat(row?.state === "pending" && row.principal_id === current.id && row.epoch === current.epoch && row.session_hash === hash(session.sessionId) &&
          row.nonce_hash === hash(input.nonce) && row.created <= Date.now() && row.expires > Date.now(), "CONSOLE_TRAINING_CHALLENGE_DENIED", 409);
        const preview = JSON.parse(row.preview); requireThat(input.displayed_review_sha256 === t.digest(preview), "CONSOLE_TRAINING_DISPLAY_SUBJECT_CHANGED", 409);
        db.prepare("UPDATE operator_training_sessions SET state='executing', preview=? WHERE id=?").run(JSON.stringify({ ...preview,
          owner_rationale: input.rationale, owner_display_sha256: input.displayed_review_sha256 }), row.id);
        audit(current.id, "training_session_reserved", row.id); return row.id;
      });
    },
    fail(id) { db.prepare("UPDATE operator_training_sessions SET state='reconciliation_required', result=? WHERE id=? AND state='executing'")
      .run(JSON.stringify({ error: "CONSOLE_TRAINING_OUTCOME_UNCERTAIN", ...t.FLAGS }), id); },
    list(session) { owner(session); return { actions: db.prepare("SELECT * FROM operator_training_sessions ORDER BY created DESC LIMIT 100").all().map(view), mutation_held: !!held(), ...t.FLAGS }; },
    inspect(session, id) { owner(session); const row = db.prepare("SELECT * FROM operator_training_sessions WHERE id=?").get(id);
      requireThat(row, "CONSOLE_TRAINING_ACTION_NOT_FOUND", 404); return view(row); },
    close() { db.prepare("UPDATE operator_training_sessions SET state='invalidated' WHERE state='pending'").run();
      db.prepare("UPDATE operator_training_sessions SET state='reconciliation_required' WHERE state='executing'").run(); }
  };
}
module.exports = { openTrainingSessionService };
