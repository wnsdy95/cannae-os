const crypto = require("node:crypto"), path = require("node:path"), { DatabaseSync } = require("node:sqlite");
const c = require("./training-session-contract"), t = require("./task-training-contract"), core = require("./training-session-controller");
const force = require("./force-registry-controller"), artifacts = require("./repository-artifact-store"), dispatch = require("./dispatch-runtime-controller");
const { requireThat, privateFile, SESSION_MS } = require("./operator-console-auth"), { repositoryStateDigest } = require("./skill-mission-controller");
const { signOperatorRecord, keyDigest } = require("./operator-consent-contract"), { entryId } = require("./operator-console-evidence");
const { hash } = require("./operator-consent-service");
function executeTrainingSession(configuration, id) {
  const file = path.join(configuration.stateDir, "operator.sqlite"); privateFile(file);
  const db = new DatabaseSync(file); db.exec("PRAGMA busy_timeout=5000");
  const meta = key => db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value;
  let attempted = false;
  try {
    const row = db.prepare("SELECT * FROM operator_training_sessions WHERE id=?").get(id);
    requireThat(row?.state === "executing", "CONSOLE_TRAINING_NOT_RESERVED", 409);
    const { owner_rationale: rationale, owner_display_sha256: display, ...review } = JSON.parse(row.preview);
    requireThat(display === t.digest(review), "CONSOLE_TRAINING_DISPLAY_SUBJECT_CHANGED", 409);
    const publicKey = crypto.createPublicKey(meta("operator-signing-key")).export({ type: "spki", format: "pem" });
    requireThat(keyDigest(publicKey) === keyDigest(configuration.forceRegistryPublicKey), "CONSOLE_TRAINING_OPERATOR_KEY_CHANGED", 409);
    const options = { repository: configuration.repository, artifactRoot: configuration.artifactRoot };
    const proposed = require("./task-training-controller").record(force.load(options), review.proposal_ref, c.KINDS.proposals);
    let expected = review.observed_manifest.sha256, ownAuthorization = null;
    return dispatch.withDispatchControlLock(options, review.proposal.request.lease_ref.artifact_id, (_loaded, renew) => {
      const subject = value => { const { observed_manifest, ...body } = value; return body; };
      const guard = () => {
        renew();
        const active = db.prepare("SELECT * FROM operator_training_sessions WHERE id=?").get(id), principal = db.prepare("SELECT * FROM users WHERE id=?").get(row.principal_id);
        const stored = db.prepare("SELECT value FROM sessions WHERE digest=? AND expires>?").get(row.session_hash, Date.now());
        const session = stored && JSON.parse(stored.value);
        requireThat(meta("operator-service-instance") === configuration.serviceInstance && Number(meta("operator-service-pid")) === process.pid &&
          meta("repository-binding") === hash(`${configuration.identity}\n${configuration.artifactRoot}`) &&
          keyDigest(crypto.createPublicKey(meta("operator-signing-key"))) === keyDigest(configuration.forceRegistryPublicKey), "CONSOLE_TRAINING_SERVICE_CHANGED", 409);
        requireThat(active?.state === "executing" && active.preview === row.preview && principal?.active && principal.role === "owner" && principal.epoch === row.epoch &&
          session?.userId === row.principal_id && session.epoch === row.epoch && Number.isFinite(session.startedAt) && session.startedAt + SESSION_MS > Date.now() &&
          row.created <= Date.now() && row.expires > Date.now(), "CONSOLE_TRAINING_AUTHORIZATION_EXPIRED", 409);
        requireThat(repositoryStateDigest(__dirname) === configuration.sourceSha256 && repositoryStateDigest(configuration.repository) === review.repository_state_sha256,
          "CONSOLE_TRAINING_SOURCE_OR_REPOSITORY_CHANGED", 409);
        const current = core.prepareReview(configuration, { entry_id: entryId(proposed.entry), manifest: expected }, ownAuthorization);
        requireThat(t.digest(subject(current)) === t.digest(subject(review)), "CONSOLE_TRAINING_SUBJECT_CHANGED", 409); renew(); return true;
      };
      guard();
      const authorization = c.checked(signOperatorRecord({ schema_version: "0.1", type: "TaskTrainingSessionAuthorization", id: `TSA-${id}`,
        purpose: c.PURPOSE, acknowledgment: c.ACK, challenge_id: id, principal_id: row.principal_id, principal_epoch: row.epoch,
        authentication_method: "local_owner_password_reauthentication", session_sha256: row.session_hash, nonce_sha256: row.nonce_hash,
        created_at: new Date().toISOString(), expires_at: new Date(row.expires).toISOString(), rationale, review, review_sha256: t.digest(review),
        displayed_review_sha256: display, ...t.FLAGS }, meta("operator-signing-key")), "training-session-authorization");
      c.verifyAuthorization(authorization, publicKey);
      const base = { repositoryPath: configuration.repository, artifactRoot: configuration.artifactRoot, missionId: review.proposal.request.mission_id,
        waveId: review.proposal.request.wave_id, createdAt: authorization.created_at, publicationGuard: guard, reuseExisting: false };
      attempted = true;
      const signed = artifacts.writeRepositoryArtifact({ ...base, kind: c.KINDS.authorizations, artifactId: authorization.id, payload: authorization });
      ownAuthorization = { artifact_id: authorization.id, relative_path: signed.relative_path, sha256: signed.sha256 }; expected = signed.manifest_sha256;
      const binding = t.checked(signOperatorRecord(c.bindingBody(authorization, ownAuthorization), meta("operator-signing-key")), "task-training-session-binding");
      const bound = artifacts.writeRepositoryArtifact({ ...base, kind: c.KINDS.bindings, artifactId: binding.id, payload: binding });
      const terminal = { authorization_ref: ownAuthorization, session_binding_ref: { artifact_id: binding.id, relative_path: bound.relative_path, sha256: bound.sha256 }, ...t.FLAGS };
      db.prepare("UPDATE operator_training_sessions SET state='applied', result=? WHERE id=? AND state='executing'").run(JSON.stringify(terminal), id);
      db.prepare("INSERT INTO audit(at,actor,action,subject) VALUES (?,?,?,?)").run(new Date().toISOString(), row.principal_id, "training_session_applied", id);
      return terminal;
    });
  } catch (error) {
    const reasons = [...new Set(error.message.match(/\b(?:TRAINING|CONSOLE_TRAINING|CAMPAIGN|READINESS|DISPATCH)_[A-Z_]+\b/g) || [])].slice(0, 8);
    db.prepare("UPDATE operator_training_sessions SET state=?, result=? WHERE id=? AND state='executing'")
      .run(attempted ? "reconciliation_required" : "blocked", JSON.stringify({ error: "CONSOLE_TRAINING_SESSION_BLOCKED", reason_codes: reasons, ...t.FLAGS }), id);
    throw Object.assign(new Error("CONSOLE_TRAINING_SESSION_BLOCKED"), { statusCode: 409, reason_codes: reasons });
  } finally { db.close(); }
}
module.exports = { executeTrainingSession };
