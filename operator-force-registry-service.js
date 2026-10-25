const crypto = require("node:crypto");
const { requireThat, assertSafeRationale } = require("./operator-console-auth");
const { FLAGS, digest } = require("./force-registry-contract");
function openForceRegistryService({ auth, owner, transaction, audit, hash }) {
  const db = auth.db;
  db.exec(`CREATE TABLE IF NOT EXISTS operator_force_actions (
    id TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL, principal_id TEXT NOT NULL, epoch INTEGER NOT NULL,
    session_hash TEXT NOT NULL, preview TEXT NOT NULL, registry_key TEXT NOT NULL,
    created INTEGER NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL, result TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS one_unresolved_force_change ON operator_force_actions(registry_key)
      WHERE state IN ('executing','reconciliation_required');`);
  transaction(() => {
    db.prepare("UPDATE operator_force_actions SET state='invalidated' WHERE state='pending'").run();
    db.prepare("UPDATE operator_force_actions SET state='reconciliation_required' WHERE state='executing'").run();
  });
  const held = () => db.prepare("SELECT id FROM operator_force_actions WHERE state IN ('executing','reconciliation_required')").get();
  const view = row => ({ id: row.id, state: row.state, created_at: new Date(row.created).toISOString(), expires_at: new Date(row.expires).toISOString(),
    proposal_id: JSON.parse(row.preview).proposal.id, entity_id: JSON.parse(row.preview).proposal.request.entity.id,
    result: row.result ? JSON.parse(row.result) : null, ...FLAGS });
  return {
    prepare(session, review) {
      const current = owner(session), id = crypto.randomUUID(), nonce = crypto.randomBytes(32).toString("base64url"), now = Date.now();
      const expires = Math.min(now + 120000, Date.parse(review.proposal.expires_at));
      requireThat(expires > now && Buffer.byteLength(JSON.stringify(review)) <= 196608, "CONSOLE_FORCE_REVIEW_INVALID", 409);
      transaction(() => {
        owner(session); requireThat(!held(), "CONSOLE_FORCE_RECONCILIATION_REQUIRED", 409);
        db.prepare("UPDATE operator_force_actions SET state='invalidated' WHERE state='pending' AND expires<=?").run(now);
        requireThat(db.prepare("SELECT COUNT(*) AS n FROM operator_force_actions WHERE state='pending'").get().n < 100, "CONSOLE_FORCE_PREVIEW_LIMIT", 429);
        db.prepare("INSERT INTO operator_force_actions VALUES (?,?,?,?,?,?,?,?,?,'pending',NULL)").run(id, hash(nonce), current.id, current.epoch,
          hash(session.sessionId), JSON.stringify(review), review.repository_binding.identity_fingerprint, now, expires);
        audit(current.id, "force_enrollment_preview_created", id);
      });
      return { challenge_id: id, nonce, expires_at: new Date(expires).toISOString(), review, displayed_review_sha256: digest(review), ...FLAGS };
    },
    async reserve(session, input) {
      const current = owner(session); await auth.reauthenticate(session, input.password); assertSafeRationale(input, session);
      requireThat(input.acknowledge_definition_only === true, "CONSOLE_FORCE_ACKNOWLEDGMENT_REQUIRED", 400);
      return transaction(() => {
        owner(session); requireThat(!held(), "CONSOLE_FORCE_RECONCILIATION_REQUIRED", 409);
        const row = db.prepare("SELECT * FROM operator_force_actions WHERE id=?").get(input.challenge_id);
        requireThat(row?.state === "pending" && row.principal_id === current.id && row.epoch === current.epoch &&
          row.session_hash === hash(session.sessionId) && row.nonce_hash === hash(input.nonce) && row.created <= Date.now() && row.expires > Date.now(),
          "CONSOLE_FORCE_CHALLENGE_DENIED", 409);
        const preview = JSON.parse(row.preview);
        requireThat(input.displayed_review_sha256 === digest(preview), "CONSOLE_FORCE_DISPLAY_SUBJECT_CHANGED", 409);
        db.prepare("UPDATE operator_force_actions SET state='executing', preview=? WHERE id=?").run(JSON.stringify({ ...preview,
          owner_rationale: input.rationale, owner_display_sha256: input.displayed_review_sha256 }), row.id);
        audit(current.id, "force_enrollment_reserved", row.id); return row.id;
      });
    },
    fail(id) { db.prepare("UPDATE operator_force_actions SET state='reconciliation_required', result=? WHERE id=? AND state='executing'")
      .run(JSON.stringify({ error: "CONSOLE_FORCE_CHANGE_UNCERTAIN", ...FLAGS }), id); },
    list(session) { owner(session); return db.prepare("SELECT * FROM operator_force_actions ORDER BY created DESC LIMIT 100").all().map(view); },
    inspect(session, id) { owner(session); const row = db.prepare("SELECT * FROM operator_force_actions WHERE id=?").get(id);
      requireThat(row, "CONSOLE_FORCE_CHANGE_NOT_FOUND", 404); return view(row); },
    close() {
      db.prepare("UPDATE operator_force_actions SET state='invalidated' WHERE state='pending'").run();
      db.prepare("UPDATE operator_force_actions SET state='reconciliation_required' WHERE state='executing'").run();
    }
  };
}
module.exports = { openForceRegistryService };
