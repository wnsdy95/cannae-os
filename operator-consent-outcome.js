const crypto = require("node:crypto"), path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { resolveRepository, manifestDigest } = require("./repository-artifact-store");
const { repositoryStateDigest } = require("./skill-mission-controller");
const { requireThat, privateFile } = require("./operator-console-auth");
const { readEntry } = require("./operator-console-evidence");
const { hash } = require("./operator-consent-service");
const { digest, verifyConsent, decisionForAction } = require("./operator-consent-contract");
const { proposalProof, recordProof } = require("./order-adoption-controller");
const { prefixBeforeEntry } = require("./campaign-terminal-controller");
const { NONE } = require("./order-adoption-contract");
const reference = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
const same = (left, right) => digest(left) === digest(right);
const snapshot = store => ({ revision: store.manifest.manifest_revision, sha256: manifestDigest(store.manifest) });

function inspectDecisionOutcome(configuration, id) {
  requireThat(repositoryStateDigest(__dirname) === configuration.sourceSha256, "CONSOLE_SOURCE_CHANGED_RESTART_REQUIRED", 409);
  requireThat(resolveRepository(configuration.repository).identity_fingerprint === configuration.identity,
    "CONSOLE_REPOSITORY_IDENTITY_CHANGED", 409);
  const file = path.join(configuration.stateDir, "operator.sqlite"); privateFile(file);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const meta = key => db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value;
    const signingKey = meta("operator-signing-key");
    requireThat(meta("repository-binding") === hash(`${configuration.identity}\n${configuration.artifactRoot}`),
      "CONSOLE_REPOSITORY_IDENTITY_CHANGED", 409);
    requireThat(meta("operator-service-instance") === configuration.serviceInstance && Number(meta("operator-service-pid")) === process.pid,
      "CONSOLE_DECISION_SERVICE_CHANGED", 409);
    const row = db.prepare("SELECT * FROM operator_actions WHERE id=?").get(id);
    requireThat(row, "CONSOLE_DECISION_NOT_FOUND", 404);
    const preview = JSON.parse(row.preview), store = loadVerifiedStore(configuration.repository, configuration.artifactRoot);
    const observed = snapshot(store), now = new Date(Date.now()).toISOString(), repositoryState = repositoryStateDigest(configuration.repository);
    const result = { action_id: id, action_state: row.state, mission_id: preview.request.mission_id, wave_id: preview.request.wave_id,
      proposal_ref: preview.request.proposal_ref, observed_manifest: observed, inspected_at: now,
      action_row_sha256: digest(row), source_state_sha256: configuration.sourceSha256, repository_state_sha256: repositoryState,
      outcome: "unverifiable", reasons: [], consent_ref: { ...NONE }, decision_ref: { ...NONE }, adoption_ref: { ...NONE },
      adoption_status: "none", original_consent_expires_at: new Date(row.expires).toISOString(),
      original_consent_freshness: row.expires > Date.now() ? "current" : "expired", hold_preserved: ["executing", "reconciliation_required"].includes(row.state),
      inspection_only: true, mutation_authorized: false, execution_authorized: false, continuation_authorized: false, release_authorized: false };
    function read(entry) {
      const value = JSON.parse(readEntry(store, entry));
      requireThat(value.id === entry.artifact_id && value.mission_id === entry.mission_id &&
        entry.mission_id === preview.request.mission_id && entry.wave_id === preview.request.wave_id &&
        (value.type === "DecisionLogEntry" || value.wave_id === entry.wave_id), "CONSOLE_OUTCOME_SCOPE_INVALID", 409);
      return value;
    }
    function find(kind, artifactId) {
      const matches = store.manifest.artifacts.filter(entry => entry.kind === kind && entry.artifact_id === artifactId);
      requireThat(matches.length <= 1, "CONSOLE_OUTCOME_REFERENCE_AMBIGUOUS", 409); return matches[0];
    }
    try {
      requireThat(preview.request.id === `OADR-${id}` && same(preview.request.decision_ref, NONE), "CONSOLE_OUTCOME_SCOPE_INVALID", 409);
      const proposal = proposalProof(store, preview.request.proposal_ref, preview.request);
      requireThat(same(proposal.payload, preview.proposal) && same(proposal.draft, preview.draft), "CONSOLE_OUTCOME_SCOPE_INVALID", 409);
      const consentEntry = find("operator-consent-records", `OCR-${id}`), decisionEntry = find("decision-logs", `DL-OPERATOR-${id}`);
      let consent, decision;
      if (consentEntry) {
        consent = read(consentEntry);
        const expectedDecision = decisionForAction(row, preview, consent.created_at);
        verifyConsent(consent, crypto.createPublicKey(signingKey).export({ type: "spki", format: "pem" }), expectedDecision);
        requireThat(consent.challenge_id === id && consent.principal_id === row.principal_id && consent.principal_epoch === row.epoch &&
          consent.session_sha256 === row.session_hash && consent.nonce_sha256 === row.nonce_hash &&
          consent.repository_binding.repository_key === configuration.repositoryKey && consent.repository_binding.identity_fingerprint === configuration.identity &&
          consent.source_state_sha256 === preview.source_state_sha256 && consent.repository_state_sha256 === preview.repository_state_sha256 &&
          consent.plan_sha256 === proposal.payload.plan_sha256 && same(consent.request, preview.request) &&
          same(consent.observed_manifest, preview.observed_manifest) && same(snapshot(prefixBeforeEntry(store, consentEntry)), consent.observed_manifest) &&
          consent.created_at === consentEntry.created_at && Date.parse(consent.created_at) >= row.created && Date.parse(consent.created_at) <= Date.now() &&
          consent.expires_at === new Date(row.expires).toISOString(), "CONSOLE_OUTCOME_CONSENT_BINDING_INVALID", 409);
        result.consent_ref = reference(consentEntry);
        if (decisionEntry) {
          decision = read(decisionEntry);
          verifyConsent(consent, crypto.createPublicKey(signingKey).export({ type: "spki", format: "pem" }), decision);
          requireThat(same(decision, expectedDecision) && decisionEntry.created_at === consent.created_at &&
            prefixBeforeEntry(store, decisionEntry).manifest.artifacts.some(entry => same(reference(entry), reference(consentEntry))),
          "CONSOLE_OUTCOME_DECISION_BINDING_INVALID", 409);
          result.decision_ref = reference(decisionEntry);
        }
      } else requireThat(!decisionEntry, "CONSOLE_OUTCOME_DECISION_WITHOUT_CONSENT", 409);
      const related = [];
      for (const entry of store.manifest.artifacts.filter(item => item.kind === "order-adoption-records" &&
        item.mission_id === preview.request.mission_id && item.wave_id === preview.request.wave_id)) {
        const retained = recordProof(store, reference(entry));
        requireThat(Date.parse(retained.payload.recorded_at) <= Date.now(), "CONSOLE_OUTCOME_FUTURE_RECORD", 409);
        if (same(retained.payload.request.proposal_ref, preview.request.proposal_ref) || retained.payload.status === "adopted") related.push(retained);
      }
      const exact = related.filter(item => decisionEntry && same(item.payload.request, { ...preview.request, decision_ref: reference(decisionEntry) }));
      if (related.length) {
        if (related.length !== 1 || exact.length !== 1) {
          result.outcome = "conflicting"; result.reasons = ["CONSOLE_OUTCOME_OTHER_ORDER_RECORDED"];
        } else {
          requireThat(consent && decision, "CONSOLE_OUTCOME_INCOMPLETE_AUDIT_CHAIN", 409);
          result.outcome = "applied"; result.adoption_status = exact[0].payload.status; result.adoption_ref = exact[0].ref;
        }
      } else {
        requireThat(!["applied", "cancelled"].includes(row.state), "CONSOLE_OUTCOME_PROJECTION_WITHOUT_RECORD", 409);
        result.outcome = row.state === "executing" ? "execution_unconfirmed" : decision ? "unconsumed_decision" :
          consent ? "partial_consent" : ["pending", "invalidated"].includes(row.state) ? "not_submitted" : "no_adoption_recorded";
      }
    } catch (error) {
      result.outcome = "unverifiable";
      result.reasons = [...new Set(error.message.match(/\b(?:CONSOLE|ORDER|OPERATOR)_[A-Z_]+\b/g) || [])].slice(0, 8);
      if (!result.reasons.length) result.reasons = ["CONSOLE_OUTCOME_UNVERIFIABLE"];
    }
    requireThat(db.prepare("SELECT * FROM operator_actions WHERE id=?").get(id)?.preview === row.preview &&
      same(db.prepare("SELECT * FROM operator_actions WHERE id=?").get(id), row) &&
      meta("operator-signing-key") === signingKey && meta("repository-binding") === hash(`${configuration.identity}\n${configuration.artifactRoot}`) &&
      meta("operator-service-instance") === configuration.serviceInstance && Number(meta("operator-service-pid")) === process.pid &&
      same(snapshot(loadVerifiedStore(configuration.repository, configuration.artifactRoot)), observed) &&
      repositoryStateDigest(configuration.repository) === repositoryState &&
      repositoryStateDigest(__dirname) === configuration.sourceSha256,
    "CONSOLE_OUTCOME_SNAPSHOT_CHANGED", 409);
    return result;
  } finally { db.close(); }
}
module.exports = { inspectDecisionOutcome };
