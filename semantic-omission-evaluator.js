#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const { inspectDraft } = require("./request-order-compiler");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { repositoryStateDigest } = require("./skill-mission-controller");
const { digest, AUTHORITY } = require("./order-intake-contract");
const { lintPayload } = require("./opsec-linter");
const { DEFAULT_EEFI_ITEMS, compileEefiItems, detectEefi } = require("./eefi-detector");
const { RESPONSE, methodBinding, targetsFor, promptFor, requireThat } = require("./semantic-omission-contract");

function prepareEvaluation(options) {
  const now = options.now || new Date().toISOString();
  requireThat(Number.isFinite(Date.parse(now)), "SEMANTIC_CLOCK_INVALID");
  const repository = fs.realpathSync(options.repository), artifactRoot = path.resolve(options.artifactRoot || path.join(repository, ".cannae", "artifacts"));
  const store = loadVerifiedStore(repository, artifactRoot);
  const selected = inspectDraft({ repository, artifactRoot, draftId: options.draftId, now });
  requireThat(selected.freshness === "current", "SEMANTIC_DRAFT_EXPIRED");
  requireThat(["public", "internal"].includes(selected.classification), "SEMANTIC_TRANSFER_CLASSIFICATION_DENIED");
  const targets = targetsFor(selected.draft);
  requireThat(targets.length <= 101 && new Set(targets.map(item => item.id)).size === targets.length, "SEMANTIC_TARGET_LIMIT_OR_ID_INVALID");
  const input = { request: selected.request.text, targets };
  requireThat(lintPayload(input).length === 0 && detectEefi(input, compileEefiItems(DEFAULT_EEFI_ITEMS)).length === 0, "SEMANTIC_TRANSFER_OPSEC_DENIED");
  const prepared = { schema_version: "0.1", type: "SemanticEvaluationPreview", repository, artifact_root: artifactRoot,
    repository_key: store.verification.repository.key, identity_fingerprint: store.verification.repository.identity_fingerprint,
    mission_id: selected.draft.mission_id, wave_id: selected.draft.wave_id, draft_ref: selected.artifact_ref,
    request_ref: selected.draft.request_ref, analysis_sha256: digest(selected.draft.analysis),
    repository_state_sha256: repositoryStateDigest(repository), doctrine_state_sha256: repositoryStateDigest(__dirname), manifest_sha256: digest(store.manifest),
    classification: selected.classification, prepared_at: now,
    expires_at: new Date(Math.min(Date.parse(selected.expires_at), Date.parse(now) + 300000)).toISOString(),
    method_sha256: methodBinding(), response_schema: z.toJSONSchema(RESPONSE),
    input, prompt: promptFor(input.request, targets), ...AUTHORITY };
  return { ...prepared, preview_sha256: digest(prepared) };
}
function revalidatePreview(preview, now = new Date().toISOString()) {
  const { preview_sha256: expected, ...body } = preview;
  requireThat(expected === digest(body), "SEMANTIC_PREVIEW_SUBSTITUTED");
  requireThat(Number.isFinite(Date.parse(now)) && Date.parse(preview.prepared_at) <= Date.parse(now) &&
    Date.parse(now) < Date.parse(preview.expires_at), "SEMANTIC_PREVIEW_EXPIRED_OR_FUTURE");
  const current = prepareEvaluation({ repository: preview.repository, artifactRoot: preview.artifact_root,
    draftId: preview.draft_ref.artifact_id, now: preview.prepared_at });
  requireThat(current.preview_sha256 === expected, "SEMANTIC_PREVIEW_SOURCE_CHANGED");
  return true;
}
function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv, options = {};
  requireThat(command === "prepare" && args.length % 2 === 0, "Usage: semantic-omission-evaluator.js prepare --repository <repo> --draft-id <id> [--artifact-root <root>]");
  for (let index = 0; index < args.length; index += 2) {
    const key = { "--repository": "repository", "--draft-id": "draftId", "--artifact-root": "artifactRoot" }[args[index]];
    requireThat(key && !Object.hasOwn(options, key) && args[index + 1] && !args[index + 1].startsWith("--"), "SEMANTIC_OPTION_INVALID");
    options[key] = args[index + 1];
  }
  requireThat(options.repository && options.draftId, "SEMANTIC_INPUT_REQUIRED");
  console.log(JSON.stringify(prepareEvaluation(options), null, 2));
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { prepareEvaluation, revalidatePreview, main };
