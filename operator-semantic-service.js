const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { requireThat, assertSafeRationale, privateDirectory } = require("./operator-console-auth");
const { digest, signOperatorRecord, validOperatorSignature } = require("./operator-consent-contract");
const { prepareEvaluation } = require("./semantic-omission-evaluator");
const { prepareInvocation, collectEvaluation, verifyTransferConsent } = require("./codex-semantic-collector");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { entryId } = require("./operator-console-evidence");
const { repositoryStateDigest } = require("./skill-mission-controller");
const { openModelReconciliation, readJournal } = require("./operator-model-reconciliation-service");
const { verifyEvaluation, isModelCode } = require("./operator-semantic-evaluation-contract");
const AUTHORITY = Object.freeze({ execution_authorized: false, release_authorized: false, human_final_decision_authority: "USER" });
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
function modelError(error) { return isModelCode(error?.message) ? error.message : "CONSOLE_MODEL_COLLECTION_FAILED"; }
function sourceCurrent(configuration) {
  requireThat(configuration.sourceSha256 === repositoryStateDigest(__dirname), "CONSOLE_MODEL_SOURCE_CHANGED", 409);
}
function prepareSemanticEvaluation(configuration, request) {
  requireThat(configuration.semantic, "CONSOLE_MODEL_NOT_CONFIGURED", 409); sourceCurrent(configuration);
  const store = loadVerifiedStore(configuration.repository, configuration.artifactRoot);
  requireThat(store.verification.manifest_sha256 === request.manifest, "CONSOLE_EVIDENCE_SNAPSHOT_STALE", 409);
  const entries = store.manifest.artifacts.filter(item => entryId(item) === request.entry_id && item.kind === "order-drafts");
  requireThat(entries.length === 1, "CONSOLE_MODEL_DRAFT_REQUIRED", 409);
  const preview = prepareEvaluation({ repository: configuration.repository, artifactRoot: configuration.artifactRoot, draftId: entries[0].artifact_id });
  const invocation = prepareInvocation(preview, configuration.semantic);
  requireThat(loadVerifiedStore(configuration.repository, configuration.artifactRoot).verification.manifest_sha256 === request.manifest,
    "CONSOLE_EVIDENCE_SNAPSHOT_STALE", 409);
  sourceCurrent(configuration);
  return invocation;
}
function openSemanticService(auth, configuration, consentService) {
  const db = auth.db, active = new Map(); let closing = false;
  db.exec(`CREATE TABLE IF NOT EXISTS operator_model_actions (
    id TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL, principal_id TEXT NOT NULL, epoch INTEGER NOT NULL,
    session_hash TEXT NOT NULL, preview TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL,
    state TEXT NOT NULL, consent TEXT, result TEXT, cancellation TEXT, rationale TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS one_live_model_action ON operator_model_actions((1)) WHERE state='running';`);
  db.prepare("UPDATE operator_model_actions SET state='held' WHERE state='running'").run();
  db.prepare("UPDATE operator_model_actions SET state='invalidated' WHERE state='pending'").run();
  const stateRoot = privateDirectory(path.join(auth.root, "model-evaluations"));
  const meta = key => db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value;
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE"); try { const result = fn(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const audit = (actor, action, subject) => db.prepare("INSERT INTO audit(at,actor,action,subject) VALUES (?,?,?,?)")
    .run(new Date().toISOString(), actor, action, subject);
  function owner(session) {
    const user = auth.authenticate(session);
    requireThat(user.role === "owner", "CONSOLE_OWNER_REQUIRED", 403);
    const stored = db.prepare("SELECT value,expires FROM sessions WHERE digest=?").get(hash(session.sessionId));
    const value = stored ? JSON.parse(stored.value) : null;
    requireThat(stored?.expires > Date.now() && value?.userId === user.id && value.epoch === user.epoch && value.startedAt === session.startedAt,
      "CONSOLE_SESSION_REVOKED", 401);
    requireThat(meta("operator-service-instance") === consentService.instance && !closing, "CONSOLE_MODEL_SERVICE_STOPPED", 409);
    return user;
  }
  function rowFor(id) {
    const row = db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(id);
    requireThat(row, "CONSOLE_MODEL_ACTION_NOT_FOUND", 404); return row;
  }
  function verifiedResult(row) {
    try {
      const result = JSON.parse(row.result), consent = JSON.parse(row.consent), invocation = JSON.parse(row.preview);
      verifyEvaluation(result, consentService.publicKey());
      verifyTransferConsent(consent, invocation, consentService.publicKey(), Date.parse(consent.created_at));
      return validOperatorSignature(consent, consentService.publicKey()) && validOperatorSignature(result, consentService.publicKey()) &&
        consent.type === "SemanticEvaluationTransferConsent" && consent.purpose === "one_semantic_evaluation_transfer" &&
        consent.id === row.id && consent.principal_id === row.principal_id && consent.invocation_sha256 === invocation.invocation_sha256 &&
        result.type === "OperatorSemanticEvaluation" && ["0.1", "0.2"].includes(result.schema_version) && result.id === row.id && result.consent_sha256 === digest(consent) &&
        result.invocation_sha256 === invocation.invocation_sha256 && result.status === row.state && result.rationale_sha256 === hash(row.rationale || "") &&
        result.execution_authorized === false && result.release_authorized === false &&
        (result.schema_version !== "0.2" || result.status !== "evaluated" || /^[a-f0-9]{64}$/.test(result.collection?.journal_sha256 || "")) &&
        (!result.response || digest(result.response) === result.response_payload_sha256);
    } catch { return false; }
  }
  function noHold() {
    const rows = db.prepare("SELECT * FROM operator_model_actions WHERE consent IS NOT NULL OR result IS NOT NULL OR state IN ('running','held','evaluated')").all();
    requireThat(!rows.some(row => !verifiedResult(row) || (row.state !== "evaluated" && !reconciliation.status(row).verified)), "CONSOLE_MODEL_RECONCILIATION_REQUIRED", 409);
  }
  function checkInvocation(invocation) {
    try {
      sourceCurrent(configuration);
      requireThat(configuration.semantic && digest(prepareInvocation(invocation.preview, configuration.semantic)) === digest(invocation) &&
        invocation.preview.repository === configuration.repository && invocation.preview.artifact_root === configuration.artifactRoot &&
        invocation.preview.identity_fingerprint === configuration.identity, "CONSOLE_MODEL_PREVIEW_CHANGED", 409);
    } catch (error) {
      if (/^CONSOLE_[A-Z_]+$/.test(error.message)) throw error;
      const failure = new Error("CONSOLE_MODEL_PREVIEW_CHANGED"); failure.statusCode = 409; failure.reason_codes = [modelError(error)]; throw failure;
    }
  }
  function view(row, details = false) {
    const invocation = JSON.parse(row.preview), verified = row.result && verifiedResult(row);
    const unverifiable = !verified && (!!row.result || row.state === "evaluated");
    const reconciled = reconciliation.status(row);
    return { type: "OperatorSemanticEvaluation", id: row.id, state: unverifiable ? "unverifiable" : row.state,
      mission_id: invocation.preview.mission_id, wave_id: invocation.preview.wave_id, draft_id: invocation.preview.draft_ref.artifact_id,
      model: invocation.profile.requested_model, created_at: new Date(row.created).toISOString(), expires_at: new Date(row.expires).toISOString(),
      hold_preserved: (row.state === "held" && !reconciled.verified) || !!unverifiable, cancellation_requested: !!row.cancellation,
      reconciliation_state: reconciled.state, reconciliation_verified: reconciled.verified,
      result_verified: !!verified, verdict: verified ? JSON.parse(row.result).assessment?.verdict || null : null,
      ...(details ? { invocation_sha256: invocation.invocation_sha256, consent: row.consent ? JSON.parse(row.consent) : null,
        rationale: row.rationale, result: verified ? JSON.parse(row.result) : null, reconciliation: reconciled.record } : {}), ...AUTHORITY };
  }
  async function run(id, session) {
    const control = active.get(id), row = rowFor(id), invocation = JSON.parse(row.preview), consent = JSON.parse(row.consent);
    let collection, journalSha256 = null;
    function unchanged() {
      const current = rowFor(id);
      requireThat(current.state === "running" && ["preview", "consent", "principal_id", "epoch", "session_hash", "expires", "rationale"]
        .every(key => current[key] === row[key]), "CONSOLE_MODEL_ACTION_CHANGED", 409);
    }
    const guard = setInterval(() => {
      try { owner(session); unchanged(); }
      catch (error) { control.reason ||= error.message === "CONSOLE_MODEL_ACTION_CHANGED" ? error.message : "CONSOLE_MODEL_SESSION_ENDED"; control.abort.abort(); }
    }, 250);
    try {
      owner(session); checkInvocation(invocation);
      control.enteredCollector = true;
      collection = await collectEvaluation(invocation, consent, { trustedPublicKey: consentService.publicKey(), stateRoot, signal: control.abort.signal });
      const journal = readJournal(path.join(stateRoot, id), "result.json"), { directory, journal_sha256: writtenSha256, ...observed } = collection;
      requireThat(collection.result_persisted === true && /^[a-f0-9]{64}$/.test(writtenSha256 || "") && journal.sha256 === writtenSha256 &&
        digest(journal.value) === digest(observed), "CONSOLE_MODEL_COLLECTION_JOURNAL_CHANGED", 409);
      journalSha256 = writtenSha256;
      let response = null;
      if (collection.status === "evaluated") {
        owner(session);
        const file = path.join(stateRoot, id, "response.json"), fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
          const stat = fs.fstatSync(fd); requireThat(stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= 1048576, "CONSOLE_MODEL_RESPONSE_INVALID", 409);
          const buffer = Buffer.alloc(stat.size + 1), length = fs.readSync(fd, buffer, 0, buffer.length, 0), bytes = buffer.subarray(0, length);
          requireThat(length === stat.size && hash(bytes) === collection.response_sha256, "CONSOLE_MODEL_RESPONSE_CHANGED", 409);
          response = JSON.parse(bytes.toString("utf8"));
        }
        finally { fs.closeSync(fd); }
      }
      const evaluated = collection.status === "evaluated" && collection.process_exit_confirmed && collection.process_group_absent && !control.reason;
      const state = evaluated ? "evaluated" : "held";
      const result = signOperatorRecord({ schema_version: "0.2", type: "OperatorSemanticEvaluation", id, status: state,
        invocation_sha256: invocation.invocation_sha256, consent_sha256: digest(consent),
        rationale_sha256: hash(row.rationale || ""),
        started_at: collection.started_at, ended_at: collection.ended_at, requested_model: invocation.profile.requested_model,
        method_sha256: invocation.preview.method_sha256, cli_executable_sha256: invocation.profile.executable_sha256,
        assessment: evaluated ? collection.assessment : null, response: evaluated ? response : null,
        response_payload_sha256: evaluated ? digest(response) : null,
        collection: { status: collection.status, journal_sha256: journalSha256, process_exit_confirmed: collection.process_exit_confirmed, process_group_absent: collection.process_group_absent,
          stdout_sha256: collection.stdout_sha256, stderr_sha256: collection.stderr_sha256, response_sha256: collection.response_sha256 || null,
          failure_reasons: [...collection.failure_reasons, ...(control.reason ? [control.reason] : [])] }, ...AUTHORITY }, meta("operator-signing-key"));
      transaction(() => {
        requireThat(meta("operator-service-instance") === consentService.instance, "CONSOLE_MODEL_SERVICE_STOPPED", 409);
        unchanged();
        db.prepare("UPDATE operator_model_actions SET state=?,result=? WHERE id=? AND state='running'").run(state, JSON.stringify(result), id);
        audit(row.principal_id, `model_${state}`, id);
      });
    } catch (error) {
      const failure = signOperatorRecord({ schema_version: "0.2", type: "OperatorSemanticEvaluation", id, status: "held",
        invocation_sha256: invocation.invocation_sha256, consent_sha256: digest(consent), rationale_sha256: hash(row.rationale || ""),
        ended_at: new Date().toISOString(), error: modelError(error), assessment: null, response: null,
        collection: collection ? { status: collection.status, journal_sha256: journalSha256, process_exit_confirmed: collection.process_exit_confirmed,
          process_group_absent: collection.process_group_absent, stdout_sha256: collection.stdout_sha256, stderr_sha256: collection.stderr_sha256,
          response_sha256: collection.response_sha256 || null, failure_reasons: [...collection.failure_reasons, modelError(error), ...(control.reason ? [control.reason] : [])] } : null,
        ...AUTHORITY }, meta("operator-signing-key"));
      db.prepare("UPDATE operator_model_actions SET state='held',result=? WHERE id=? AND state='running'").run(JSON.stringify(failure), id);
      audit(row.principal_id, "model_held", id);
      control.error = modelError(error);
    } finally {
      clearInterval(guard); control.collection = collection; control.finished = true;
      if (!control.enteredCollector || collection?.process_group_absent) active.delete(id);
    }
  }
  const reconciliation = openModelReconciliation({ auth, configuration, owner, transaction, audit, rowFor, verifiedResult, active, stateRoot, sourceCurrent, consentService });
  return {
    reconciliation,
    available: !!configuration.semantic,
    prepare(session, invocation) {
      const user = owner(session); checkInvocation(invocation); noHold();
      const id = crypto.randomUUID(), nonce = crypto.randomBytes(32).toString("base64url"), now = Date.now();
      const expires = Math.min(now + 120000, Date.parse(invocation.preview.expires_at));
      requireThat(expires > now && Buffer.byteLength(JSON.stringify(invocation)) <= 1048576, "CONSOLE_MODEL_PREVIEW_TOO_LARGE", 409);
      transaction(() => {
        owner(session); noHold();
        db.prepare("UPDATE operator_model_actions SET state='expired' WHERE state='pending' AND expires<=?").run(now);
        requireThat(db.prepare("SELECT count(*) AS n FROM operator_model_actions").get().n < 1000 &&
          db.prepare("SELECT count(*) AS n FROM operator_model_actions WHERE state='pending'").get().n < 20, "CONSOLE_MODEL_HISTORY_LIMIT", 429);
        db.prepare("INSERT INTO operator_model_actions VALUES (?,?,?,?,?,?,?,?,'pending',NULL,NULL,NULL,NULL)")
          .run(id, hash(nonce), user.id, user.epoch, hash(session.sessionId), JSON.stringify(invocation), now, expires);
        audit(user.id, "model_transfer_preview", id);
      });
      return { challenge_id: id, nonce, expires_at: new Date(expires).toISOString(), invocation, ...AUTHORITY };
    },
    async commit(session, input) {
      const user = owner(session); await auth.reauthenticate(session, input.password); assertSafeRationale(input, session);
      const id = transaction(() => {
        owner(session); noHold(); const row = rowFor(input.challenge_id);
        requireThat(row.state === "pending" && row.principal_id === user.id && row.epoch === user.epoch && row.session_hash === hash(session.sessionId) &&
          row.nonce_hash === hash(input.nonce) && row.created <= Date.now() && Date.now() < row.expires, "CONSOLE_MODEL_CHALLENGE_DENIED", 409);
        const invocation = JSON.parse(row.preview); checkInvocation(invocation);
        const consent = signOperatorRecord({ schema_version: "0.1", type: "SemanticEvaluationTransferConsent", id: row.id,
          purpose: "one_semantic_evaluation_transfer", invocation_sha256: invocation.invocation_sha256, principal_id: user.id,
          created_at: new Date().toISOString(), expires_at: new Date(row.expires).toISOString(), execution_authorized: false, release_authorized: false }, meta("operator-signing-key"));
        db.prepare("UPDATE operator_model_actions SET state='running',consent=?,rationale=? WHERE id=?").run(JSON.stringify(consent), input.rationale, row.id);
        audit(user.id, "model_transfer_reserved", row.id); return row.id;
      });
      const control = { abort: new AbortController(), finished: false }; active.set(id, control);
      const snapshot = { userId: session.userId, epoch: session.epoch, startedAt: session.startedAt, sessionId: session.sessionId };
      control.promise = run(id, snapshot).catch(error => { control.error = modelError(error); });
      return view(rowFor(id));
    },
    list(session) { owner(session); const entries = db.prepare("SELECT * FROM operator_model_actions ORDER BY created DESC").all().map(row => view(row));
      return { entries, held_count: entries.filter(row => row.hold_preserved).length, ...AUTHORITY }; },
    inspect(session, id) { owner(session); return view(rowFor(id), true); },
    cancel(session, id) {
      const user = owner(session), row = rowFor(id), control = active.get(id);
      requireThat(row.state === "running" && control, "CONSOLE_MODEL_NOT_RUNNING", 409);
      db.prepare("UPDATE operator_model_actions SET cancellation='owner_stop' WHERE id=?").run(id);
      audit(user.id, "model_stop_requested", id); control.reason = "CONSOLE_MODEL_OWNER_STOP"; control.abort.abort();
      return view(rowFor(id));
    },
    async close() {
      closing = true;
      for (const control of active.values()) { control.reason ||= "CONSOLE_MODEL_SHUTDOWN"; control.abort.abort(); }
      await Promise.all([...active.values()].map(control => control.promise));
      requireThat(active.size === 0, "CONSOLE_MODEL_PROCESS_EXIT_UNCONFIRMED", 409);
      reconciliation.close();
      db.prepare("UPDATE operator_model_actions SET state='invalidated' WHERE state='pending'").run();
    }
  };
}
module.exports = { prepareSemanticEvaluation, openSemanticService };
