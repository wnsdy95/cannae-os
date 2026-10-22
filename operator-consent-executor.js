const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { resolveRepository, manifestDigest, writeRepositoryArtifact } = require("./repository-artifact-store");
const { repositoryStateDigest } = require("./skill-mission-controller");
const { inspectOrderDecision, decideOrder } = require("./order-adoption-controller");
const { ADOPTION_AUTHORITY, NONE, decisionOption } = require("./order-adoption-contract");
const { entryId, readEntry } = require("./operator-console-evidence");
const { requireThat, privateFile, SESSION_MS } = require("./operator-console-auth");
const { hash } = require("./operator-consent-service");
const { digest, signConsent, verifyConsent } = require("./operator-consent-contract");

const reference = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
const snapshot = store => ({ revision: store.manifest.manifest_revision, sha256: manifestDigest(store.manifest) });
const subject = value => ({ request: value.request, proposal: value.proposal, draft: value.draft,
  backbriefs: value.backbriefs, rehearsal: value.rehearsal });
function load(configuration) {
  requireThat(resolveRepository(configuration.repository).identity_fingerprint === configuration.identity, "CONSOLE_REPOSITORY_IDENTITY_CHANGED", 409);
  return loadVerifiedStore(configuration.repository, configuration.artifactRoot);
}
function source(configuration) {
  const current = repositoryStateDigest(__dirname);
  requireThat(current === configuration.sourceSha256, "CONSOLE_SOURCE_CHANGED_RESTART_REQUIRED", 409);
  return current;
}
function prepareOrderDecision(configuration, input) {
  const store = load(configuration);
  requireThat(manifestDigest(store.manifest) === input.manifest, "CONSOLE_EVIDENCE_SNAPSHOT_STALE", 409);
  const proposal = store.manifest.artifacts.find(item => entryId(item) === input.entry_id && item.kind === "order-adoption-proposals");
  requireThat(proposal, "CONSOLE_EVIDENCE_NOT_FOUND", 404);
  readEntry(store, proposal);
  let rehearsal = null;
  if (input.rehearsal_id !== "none") {
    const entry = store.manifest.artifacts.find(item => entryId(item) === input.rehearsal_id && item.kind === "order-rehearsals" &&
      item.mission_id === proposal.mission_id && item.wave_id === proposal.wave_id);
    requireThat(entry, "CONSOLE_REHEARSAL_NOT_FOUND", 404);
    const value = JSON.parse(readEntry(store, entry));
    requireThat(digest(value.proposal_ref) === digest(reference(proposal)), "CONSOLE_REHEARSAL_SCOPE_MISMATCH", 409);
    let size = 0;
    for (const ref of value.backbrief_refs) {
      const brief = store.manifest.artifacts.find(item => digest(reference(item)) === digest(ref));
      requireThat(brief && brief.kind === "order-backbriefs", "CONSOLE_BACKBRIEF_NOT_FOUND", 409);
      size += Buffer.byteLength(readEntry(store, brief));
      requireThat(size <= 4 * 1024 * 1024, "CONSOLE_REVIEW_TOO_LARGE", 413);
    }
    rehearsal = { ref: reference(entry), payload: value };
  }
  const request = { schema_version: "0.1", type: "OrderAdoptionDecisionRequest", id: `OADR-${input.challenge_id}`,
    mission_id: proposal.mission_id, wave_id: proposal.wave_id, proposal_ref: reference(proposal),
    backbrief_refs: rehearsal?.payload.backbrief_refs || [], rehearsal_ref: rehearsal?.ref || { ...NONE },
    disposition: input.disposition, decision_ref: { ...NONE }, ...ADOPTION_AUTHORITY };
  const review = inspectOrderDecision(request, { repository: configuration.repository, artifactRoot: configuration.artifactRoot });
  requireThat(digest(review.observed_manifest) === digest(snapshot(store)) && manifestDigest(load(configuration).manifest) === input.manifest,
    "CONSOLE_EVIDENCE_SNAPSHOT_STALE", 409);
  return { ...review, source_state_sha256: source(configuration), repository_state_sha256: repositoryStateDigest(configuration.repository) };
}
function executeOrderDecision(configuration, id) {
  const file = path.join(configuration.stateDir, "operator.sqlite"); privateFile(file);
  const db = new DatabaseSync(file); db.exec("PRAGMA busy_timeout=5000");
  const meta = key => db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value;
  let row, preview, expected, attempted = false;
  try {
    row = db.prepare("SELECT * FROM operator_actions WHERE id=?").get(id);
    requireThat(row?.state === "executing", "CONSOLE_DECISION_NOT_RESERVED", 409);
    preview = JSON.parse(row.preview); expected = preview.observed_manifest.sha256;
    const options = { repository: configuration.repository, artifactRoot: configuration.artifactRoot };
    const guard = () => {
      requireThat(meta("operator-service-instance") === configuration.serviceInstance && Number(meta("operator-service-pid")) === process.pid &&
        meta("repository-binding") === hash(`${configuration.identity}\n${configuration.artifactRoot}`), "CONSOLE_DECISION_SERVICE_CHANGED", 409);
      const active = db.prepare("SELECT * FROM operator_actions WHERE id=?").get(id);
      const principal = db.prepare("SELECT * FROM users WHERE id=?").get(row.principal_id);
      const sessionRow = db.prepare("SELECT * FROM sessions WHERE digest=? AND expires>?").get(row.session_hash, Date.now());
      const session = sessionRow && JSON.parse(sessionRow.value);
      requireThat(active?.state === "executing" && active.preview === row.preview && principal?.active && principal.role === "owner" &&
        principal.epoch === row.epoch && session?.userId === row.principal_id && session.epoch === row.epoch &&
        Number.isFinite(session.startedAt) && session.startedAt + SESSION_MS > Date.now() && row.created <= Date.now() && row.expires > Date.now(),
      "CONSOLE_DECISION_AUTHORIZATION_EXPIRED", 409);
      requireThat(source(configuration) === preview.source_state_sha256 && repositoryStateDigest(configuration.repository) === preview.repository_state_sha256,
        "CONSOLE_DECISION_REPOSITORY_CHANGED", 409);
      const store = load(configuration);
      requireThat(manifestDigest(store.manifest) === expected, "CONSOLE_EVIDENCE_SNAPSHOT_STALE", 409);
      const current = inspectOrderDecision(preview.request, options);
      requireThat(digest(subject(current)) === digest(subject(preview)), "CONSOLE_DECISION_SUBJECT_CHANGED", 409);
      return true;
    };
    guard();
    const now = new Date().toISOString(), decision = {
      schema_version: "0.1", type: "DecisionLogEntry", id: `DL-OPERATOR-${id}`, mission_id: preview.request.mission_id,
      decided_at: now, decision_maker: "USER", decision_type: "scope", question: `Review exact order ${preview.proposal.id}`,
      options_considered: [decisionOption(preview.request)], chosen_option: decisionOption(preview.request), rationale: preview.rationale,
      authority_basis: { basis_type: "retained_authority", reference: preview.proposal.id,
        summary: `Authenticated local owner ${row.principal_id}; consent OCR-${id}.` },
      affected_artifacts: [preview.request.proposal_ref, ...preview.request.backbrief_refs,
        ...(preview.request.rehearsal_ref.artifact_id === "none" ? [] : [preview.request.rehearsal_ref])].map(item => item.relative_path),
      review_trigger: "Any changed plan, evidence or scope requires a new authenticated review.", status: "complete" };
    const consent = signConsent({ schema_version: "0.1", type: "OperatorConsentRecord", id: `OCR-${id}`, challenge_id: id,
      mission_id: preview.request.mission_id, wave_id: preview.request.wave_id, created_at: now, expires_at: new Date(row.expires).toISOString(),
      repository_binding: { repository_key: configuration.repositoryKey, identity_fingerprint: configuration.identity },
      principal_id: row.principal_id, principal_epoch: row.epoch, authentication_method: "local_owner_password_reauthentication",
      session_sha256: row.session_hash, nonce_sha256: row.nonce_hash, source_state_sha256: preview.source_state_sha256,
      repository_state_sha256: preview.repository_state_sha256, observed_manifest: preview.observed_manifest,
      plan_sha256: preview.proposal.plan_sha256, request: preview.request, decision_log_id: decision.id,
      decision_payload_sha256: digest(decision), human_final_decision_authority: "USER", execution_authorized: false, release_authorized: false
    }, meta("operator-signing-key"));
    verifyConsent(consent, crypto.createPublicKey(meta("operator-signing-key")).export({ type: "spki", format: "pem" }), decision);
    const base = { repositoryPath: configuration.repository, artifactRoot: configuration.artifactRoot,
      missionId: preview.request.mission_id, waveId: preview.request.wave_id, reuseExisting: false, createdAt: now, publicationGuard: guard };
    attempted = true;
    const consentWrite = writeRepositoryArtifact({ ...base, kind: "operator-consent-records", artifactId: consent.id, payload: consent });
    expected = consentWrite.manifest_sha256;
    const decisionWrite = writeRepositoryArtifact({ ...base, kind: "decision-logs", artifactId: decision.id, payload: decision });
    expected = decisionWrite.manifest_sha256;
    const decisionRef = { artifact_id: decision.id, relative_path: decisionWrite.relative_path, sha256: decisionWrite.sha256 };
    const result = decideOrder({ ...preview.request, decision_ref: decisionRef }, { ...options, orderDecisionGuard: guard });
    const terminal = { decision_recorded: true, adoption_status: result.record.status,
      consent_ref: { artifact_id: consent.id, relative_path: consentWrite.relative_path, sha256: consentWrite.sha256 },
      decision_ref: decisionRef, adoption_ref: result.record_ref,
      execution_authorized: false, continuation_authorized: false, release_authorized: false };
    db.prepare("UPDATE operator_actions SET state='applied', result=? WHERE id=? AND state='executing'").run(JSON.stringify(terminal), id);
    db.prepare("INSERT INTO audit(at,actor,action,subject) VALUES (?,?,?,?)").run(new Date().toISOString(), row.principal_id, "order_decision_applied", id);
    return terminal;
  } catch (error) {
    const code = /^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "CONSOLE_ORDER_DECISION_BLOCKED";
    db.prepare("UPDATE operator_actions SET state=?, result=? WHERE id=? AND state='executing'")
      .run(attempted ? "reconciliation_required" : "blocked", JSON.stringify({ error: code, execution_authorized: false, release_authorized: false }), id);
    throw error;
  } finally { db.close(); }
}
module.exports = { prepareOrderDecision, executeOrderDecision };
