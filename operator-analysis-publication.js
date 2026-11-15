const { digest } = require("./operator-consent-contract");
const { materialize } = require("./order-analysis-generation-contract");
const { buildDraft } = require("./order-intake-contract");
const { inspectDraft, readRequest } = require("./request-order-compiler");
const need = (value, code) => { if (!value) throw new Error(code); };
function analysisPublication(action, store, readJournal, directory) {
  const invocation = JSON.parse(action.preview), result = JSON.parse(action.result), preview = invocation.preview;
  const request = readRequest(store, preview.request_ref);
  need(digest(request) === digest(preview.input.request), "CONSOLE_ANALYSIS_RECONCILIATION_REQUEST_CHANGED");
  const flags = { request_ref: preview.request_ref, draft_adoption_authorized: false, artifact_settlement_authorized: false };
  if (result.collection.status === "not_evaluated") return { kind: "no_accepted_response", ...flags };
  const response = readJournal(directory, "response.json");
  need(response.sha256 === result.collection.response_sha256, "CONSOLE_ANALYSIS_RECONCILIATION_RESPONSE_CHANGED");
  const analysis = materialize(response.value, preview), expected = buildDraft(request, preview.request_ref, analysis, preview.prepared_at);
  const entries = store.manifest.artifacts.filter(entry => entry.kind === "order-drafts" && entry.artifact_id === expected.id);
  need(entries.length <= 1, "CONSOLE_ANALYSIS_RECONCILIATION_DRAFT_AMBIGUOUS");
  let retained = null;
  if (entries.length) {
    retained = inspectDraft({ repository: preview.repository, artifactRoot: preview.artifact_root, draftId: expected.id });
    need(digest(retained.draft.analysis) === digest(analysis) && retained.draft.request_text_sha256 === request.text_sha256 &&
      retained.draft.mission_id === preview.mission_id && retained.draft.wave_id === preview.wave_id && retained.draft.execution_authorized === false &&
      retained.draft.release_authorized === false, "CONSOLE_ANALYSIS_RECONCILIATION_DRAFT_CHANGED");
  }
  return { kind: "accepted_response", response_sha256: response.sha256, analysis_sha256: digest(analysis), expected_draft_id: expected.id,
    publication_state: retained ? "published" : "not_in_verified_manifest", draft_ref: retained?.artifact_ref || null, draft_status: retained?.status || null, ...flags };
}
function samePublicationHistory(previous, current) {
  if (previous.kind !== "accepted_response" || previous.publication_state === "published") return digest(previous) === digest(current);
  // Later independently approved work may publish the same deterministic draft; it does not rewrite the prior observation of absence.
  return current.kind === "accepted_response" && digest({ ...current, publication_state: previous.publication_state,
    draft_ref: previous.draft_ref, draft_status: previous.draft_status }) === digest(previous);
}
module.exports = { analysisPublication, samePublicationHistory };
