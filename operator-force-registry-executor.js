const crypto = require("node:crypto"), path = require("node:path"), { DatabaseSync } = require("node:sqlite");
const artifacts = require("./repository-artifact-store"), core = require("./force-registry-controller"), c = require("./force-registry-contract");
const { requireThat, privateFile, SESSION_MS } = require("./operator-console-auth");
const { repositoryStateDigest } = require("./skill-mission-controller");
const { signOperatorRecord, keyDigest } = require("./operator-consent-contract");
const { entryId } = require("./operator-console-evidence");
const { hash } = require("./operator-consent-service");
function executeForceRegistryChange(configuration, id) {
  const file = path.join(configuration.stateDir, "operator.sqlite"); privateFile(file);
  const db = new DatabaseSync(file); db.exec("PRAGMA busy_timeout=5000");
  const meta = key => db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value;
  let attempted = false;
  try {
    const row = db.prepare("SELECT * FROM operator_force_actions WHERE id=?").get(id);
    requireThat(row?.state === "executing", "CONSOLE_FORCE_CHANGE_NOT_RESERVED", 409);
    const saved = JSON.parse(row.preview), { owner_rationale: rationale, owner_display_sha256: displayedDigest, ...review } = saved;
    requireThat(displayedDigest === c.digest(review), "CONSOLE_FORCE_DISPLAY_SUBJECT_CHANGED", 409);
    const options = { repository: configuration.repository, artifactRoot: configuration.artifactRoot };
    const publicKey = crypto.createPublicKey(meta("operator-signing-key")).export({ type: "spki", format: "pem" });
    requireThat(keyDigest(publicKey) === keyDigest(configuration.forceRegistryPublicKey), "CONSOLE_FORCE_OPERATOR_KEY_CHANGED", 409);
    const proposalEntry = core.record(core.load(options), review.proposal_ref, c.KINDS.proposals).entry;
    let expected = review.observed_manifest.sha256, ownAuthorizationRef = null;
    const semanticSubject = value => { const { observed_manifest: _snapshot, ...subject } = value; return subject; };
    const guard = () => {
      requireThat(meta("operator-service-instance") === configuration.serviceInstance && Number(meta("operator-service-pid")) === process.pid &&
        meta("repository-binding") === hash(`${configuration.identity}\n${configuration.artifactRoot}`) &&
        keyDigest(crypto.createPublicKey(meta("operator-signing-key"))) === keyDigest(configuration.forceRegistryPublicKey), "CONSOLE_FORCE_SERVICE_CHANGED", 409);
      const active = db.prepare("SELECT * FROM operator_force_actions WHERE id=?").get(id), principal = db.prepare("SELECT * FROM users WHERE id=?").get(row.principal_id);
      const sessionRow = db.prepare("SELECT value FROM sessions WHERE digest=? AND expires>?").get(row.session_hash, Date.now());
      const session = sessionRow && JSON.parse(sessionRow.value);
      requireThat(active?.state === "executing" && active.preview === row.preview && principal?.active && principal.role === "owner" &&
        principal.epoch === row.epoch && session?.userId === row.principal_id && session.epoch === row.epoch &&
        Number.isFinite(session.startedAt) && session.startedAt + SESSION_MS > Date.now() && row.created <= Date.now() && row.expires > Date.now(), "CONSOLE_FORCE_AUTHORIZATION_EXPIRED", 409);
      requireThat(repositoryStateDigest(__dirname) === configuration.sourceSha256 && repositoryStateDigest(configuration.repository) === review.repository_state_sha256,
        "CONSOLE_FORCE_REPOSITORY_OR_SOURCE_CHANGED", 409);
      const current = core.prepareReview(configuration, { entry_id: entryId(proposalEntry), manifest: expected }, ownAuthorizationRef);
      requireThat(c.same(semanticSubject(current), semanticSubject(review)), "CONSOLE_FORCE_SUBJECT_CHANGED", 409); return true;
    };
    guard();
    const authorization = core.checked(signOperatorRecord({ schema_version: "0.1", type: "ForceRegistryAuthorization", id: `FRA-${id}`,
      purpose: "force_registry_enrollment", acknowledgment: "definition_only_no_qualification_or_execution", challenge_id: id, principal_id: row.principal_id, principal_epoch: row.epoch,
      authentication_method: "local_owner_password_reauthentication", session_sha256: row.session_hash, nonce_sha256: row.nonce_hash,
      created_at: new Date().toISOString(), expires_at: new Date(row.expires).toISOString(), rationale,
      review: c.publicReview(review), review_sha256: c.digest(c.publicReview(review)), displayed_review_sha256: displayedDigest, ...c.FLAGS },
    meta("operator-signing-key")), "force-registry-authorization");
    c.verifyAuthorization(authorization, publicKey);
    const base = { repositoryPath: configuration.repository, artifactRoot: configuration.artifactRoot, missionId: review.proposal.request.mission_id,
      waveId: review.proposal.request.wave_id, createdAt: authorization.created_at, publicationGuard: guard, reuseExisting: false };
    attempted = true;
    const consentWrite = artifacts.writeRepositoryArtifact({ ...base, kind: c.KINDS.authorizations, artifactId: authorization.id, payload: authorization });
    ownAuthorizationRef = { artifact_id: authorization.id, relative_path: consentWrite.relative_path, sha256: consentWrite.sha256 }; expected = consentWrite.manifest_sha256;
    const event = core.checked(c.eventForAuthorization(authorization, ownAuthorizationRef), "force-registry-event");
    const eventWrite = artifacts.writeRepositoryArtifact({ ...base, kind: c.KINDS.events, artifactId: event.id, payload: event });
    const terminal = { event_ref: { artifact_id: event.id, relative_path: eventWrite.relative_path, sha256: eventWrite.sha256 },
      authorization_ref: ownAuthorizationRef, entity_id: event.entity.id, version: event.entity.version, enrollment_state: event.entity.enrollment_state, ...c.FLAGS };
    db.prepare("UPDATE operator_force_actions SET state='applied', result=? WHERE id=? AND state='executing'").run(JSON.stringify(terminal), id);
    db.prepare("INSERT INTO audit(at,actor,action,subject) VALUES (?,?,?,?)").run(new Date().toISOString(), row.principal_id, "force_enrollment_applied", id);
    return terminal;
  } catch (error) {
    const reason = [...new Set(error.message.match(/\b(?:FORCE_REGISTRY|FORCE_ENTITY|CONSOLE_FORCE)_[A-Z_]+\b/g) || [])].slice(0, 8);
    db.prepare("UPDATE operator_force_actions SET state=?, result=? WHERE id=? AND state='executing'")
      .run(attempted ? "reconciliation_required" : "blocked", JSON.stringify({ error: "CONSOLE_FORCE_CHANGE_BLOCKED", reason_codes: reason, ...c.FLAGS }), id);
    throw Object.assign(new Error("CONSOLE_FORCE_CHANGE_BLOCKED"), { statusCode: 409, reason_codes: reason });
  } finally { db.close(); }
}
module.exports = { executeForceRegistryChange };
