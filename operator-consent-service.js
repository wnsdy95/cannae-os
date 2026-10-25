const crypto = require("node:crypto");
const { requireThat, assertSafeRationale } = require("./operator-console-auth");
const { openReconciliationService } = require("./operator-reconciliation-service");
const { openForceRegistryService } = require("./operator-force-registry-service");
const { openTrainingSessionService } = require("./operator-training-session-service");

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
function openConsentService(auth, configuration) {
  const db = auth.db;
  db.exec(`CREATE TABLE IF NOT EXISTS operator_actions (
    id TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL, principal_id TEXT NOT NULL, epoch INTEGER NOT NULL,
    session_hash TEXT NOT NULL, preview TEXT NOT NULL, proposal_key TEXT NOT NULL,
    created INTEGER NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL, result TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS one_unresolved_operator_proposal ON operator_actions(proposal_key)
      WHERE state IN ('executing','reconciliation_required');
    CREATE TABLE IF NOT EXISTS operator_reconciliations (
      id TEXT PRIMARY KEY, action_id TEXT NOT NULL, nonce_hash TEXT NOT NULL, principal_id TEXT NOT NULL,
      epoch INTEGER NOT NULL, session_hash TEXT NOT NULL, preview TEXT NOT NULL, created INTEGER NOT NULL,
      expires INTEGER NOT NULL, state TEXT NOT NULL, authorization TEXT, original_row TEXT, result TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS one_executing_operator_reconciliation ON operator_reconciliations(action_id) WHERE state='executing';`);
  const meta = key => db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value;
  const setMeta = (key, value) => db.prepare("INSERT OR REPLACE INTO meta VALUES (?,?)").run(key, value);
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try { const value = fn(); db.exec("COMMIT"); return value; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const instance = crypto.randomUUID();
  transaction(() => {
    const pid = Number(meta("operator-service-pid"));
    if (Number.isInteger(pid) && pid > 0) {
      let live = true;
      try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") live = false; }
      requireThat(!live, "CONSOLE_DECISION_SERVICE_ALREADY_LIVE", 409);
    }
    db.prepare("UPDATE operator_actions SET state='reconciliation_required' WHERE state='executing'").run();
    db.prepare("UPDATE operator_actions SET state='invalidated' WHERE state='pending'").run();
    db.prepare("UPDATE operator_reconciliations SET state='reconciliation_required' WHERE state='executing'").run();
    db.prepare("UPDATE operator_reconciliations SET state='invalidated' WHERE state='pending'").run();
    if (!meta("operator-signing-key")) {
      const pair = crypto.generateKeyPairSync("ed25519");
      setMeta("operator-signing-key", pair.privateKey.export({ type: "pkcs8", format: "pem" }));
    }
    setMeta("operator-service-pid", String(process.pid)); setMeta("operator-service-instance", instance);
  });
  const audit = (actor, action, subject) => db.prepare("INSERT INTO audit(at,actor,action,subject) VALUES (?,?,?,?)")
    .run(new Date().toISOString(), actor, action, subject);
  const owner = session => {
    const user = auth.authenticate(session);
    requireThat(user.role === "owner", "CONSOLE_OWNER_REQUIRED", 403); return user;
  };
  const view = row => { const preview = JSON.parse(row.preview);
    return { id: row.id, state: row.state, mission_id: preview.request.mission_id, wave_id: preview.request.wave_id,
      proposal_id: preview.request.proposal_ref.artifact_id, disposition: preview.request.disposition,
      created_at: new Date(row.created).toISOString(), expires_at: new Date(row.expires).toISOString(),
      result: row.result ? JSON.parse(row.result) : null, execution_authorized: false, release_authorized: false }; };
  const forceRegistry = openForceRegistryService({ auth, owner, transaction, audit, hash });
  const trainingSessions = openTrainingSessionService({ auth, owner, transaction, audit, hash });
  return {
    instance,
    forceRegistry,
    trainingSessions,
    reconciliation: openReconciliationService({ auth, configuration, owner, transaction, audit, hash }),
    publicKey() { return crypto.createPublicKey(meta("operator-signing-key")).export({ type: "spki", format: "pem" }); },
    prepare(session, preview) {
      const current = owner(session), id = preview.request.id.slice("OADR-".length), raw = crypto.randomBytes(32).toString("base64url");
      const now = Date.now(), expires = Math.min(now + 120000, Date.parse(preview.proposal.expires_at));
      requireThat(expires > now && Buffer.byteLength(JSON.stringify(preview)) <= 4 * 1024 * 1024, "CONSOLE_PREVIEW_SCOPE_INVALID", 409);
      transaction(() => {
        owner(session);
        db.prepare("DELETE FROM operator_actions WHERE state='pending' AND expires<=?").run(now);
        requireThat(db.prepare("SELECT COUNT(*) AS n FROM operator_actions WHERE state='pending'").get().n < 100, "CONSOLE_PREVIEW_LIMIT", 429);
        requireThat(!db.prepare("SELECT id FROM operator_actions WHERE proposal_key=? AND state IN ('executing','reconciliation_required')")
          .get(preview.request.proposal_ref.relative_path), "CONSOLE_DECISION_RECONCILIATION_REQUIRED", 409);
        db.prepare("INSERT INTO operator_actions VALUES (?,?,?,?,?,?,?,?,?,'pending',NULL)").run(id, hash(raw), current.id,
          current.epoch, hash(session.sessionId), JSON.stringify(preview), preview.request.proposal_ref.relative_path, now, expires);
        audit(current.id, "order_preview_created", id);
      });
      return { challenge_id: id, nonce: raw, expires_at: new Date(expires).toISOString(), review: preview,
        execution_authorized: false, release_authorized: false };
    },
    async reserve(session, input) {
      const current = owner(session);
      await auth.reauthenticate(session, input.password);
      assertSafeRationale(input, session);
      return transaction(() => {
        owner(session);
        const row = db.prepare("SELECT * FROM operator_actions WHERE id=?").get(input.challenge_id);
        requireThat(row && row.state === "pending" && row.principal_id === current.id && row.epoch === current.epoch &&
          row.session_hash === hash(session.sessionId) && row.nonce_hash === hash(input.nonce) && row.created <= Date.now() &&
          row.expires > Date.now(), "CONSOLE_DECISION_CHALLENGE_DENIED", 409);
        requireThat(!db.prepare("SELECT id FROM operator_actions WHERE proposal_key=? AND state IN ('executing','reconciliation_required')")
          .get(row.proposal_key), "CONSOLE_DECISION_RECONCILIATION_REQUIRED", 409);
        const preview = JSON.parse(row.preview);
        preview.rationale = input.rationale;
        db.prepare("UPDATE operator_actions SET state='executing', preview=? WHERE id=?").run(JSON.stringify(preview), row.id);
        audit(current.id, "order_decision_reserved", row.id);
        return row.id;
      });
    },
    fail(id, code) {
      db.prepare("UPDATE operator_actions SET state='reconciliation_required', result=? WHERE id=? AND state='executing'")
        .run(JSON.stringify({ error: /^CONSOLE_[A-Z_]+$/.test(code) ? code : "CONSOLE_DECISION_FAILED", execution_authorized: false, release_authorized: false }), id);
    },
    inspect(session, id) {
      owner(session); const row = db.prepare("SELECT * FROM operator_actions WHERE id=?").get(id);
      requireThat(row, "CONSOLE_DECISION_NOT_FOUND", 404); return view(row);
    },
    list(session) { owner(session); return db.prepare("SELECT * FROM operator_actions ORDER BY created DESC LIMIT 100").all().map(view); },
    close() { transaction(() => { if (meta("operator-service-instance") === instance) {
      forceRegistry.close();
      trainingSessions.close();
      db.prepare("UPDATE operator_actions SET state='reconciliation_required' WHERE state='executing'").run();
      db.prepare("UPDATE operator_reconciliations SET state='reconciliation_required' WHERE state='executing'").run();
      db.prepare("UPDATE operator_reconciliations SET state='invalidated' WHERE state='pending'").run();
      setMeta("operator-service-pid", "0"); setMeta("operator-service-instance", "none");
    } }); },
    workerConfiguration: { ...configuration, stateDir: auth.root, serviceInstance: instance }
  };
}
module.exports = { openConsentService, hash };
