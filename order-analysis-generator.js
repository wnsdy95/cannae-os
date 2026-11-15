#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), { z } = require("zod");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { readRequest, compileOrder } = require("./request-order-compiler");
const { repositoryStateDigest } = require("./skill-mission-controller");
const { digest, AUTHORITY } = require("./order-intake-contract");
const { lintPayload } = require("./opsec-linter");
const { DEFAULT_EEFI_ITEMS, compileEefiItems, detectEefi } = require("./eefi-detector");
const contract = require("./order-analysis-generation-contract");
const need = (value, code) => { if (!value) throw new Error(code); };
const ref = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
function prepareAnalysis(options) {
  const now = options.now || new Date().toISOString(); need(Number.isFinite(Date.parse(now)), "SEMANTIC_ANALYSIS_CLOCK_INVALID");
  const repository = fs.realpathSync(options.repository), artifactRoot = path.resolve(options.artifactRoot || path.join(repository, ".cannae/artifacts"));
  const store = loadVerifiedStore(repository, artifactRoot), entries = store.manifest.artifacts.filter(item => item.kind === "mission-requests" && item.artifact_id === options.requestId);
  need(entries.length === 1, "SEMANTIC_ANALYSIS_REQUEST_REQUIRED"); const requestRef = ref(entries[0]), request = readRequest(store, requestRef);
  need(Date.parse(request.recorded_at) <= Date.parse(now) && Date.parse(now) < Date.parse(request.expires_at), "SEMANTIC_ANALYSIS_REQUEST_NOT_CURRENT");
  need(["public", "internal"].includes(request.classification), "SEMANTIC_ANALYSIS_CLASSIFICATION_DENIED");
  const roles = options.allowedRoles || ["S2", "S3"];
  need(Array.isArray(roles) && roles.length > 0 && roles.length <= contract.ROLES.length && new Set(roles).size === roles.length &&
    roles.every(role => contract.ROLES.includes(role)), "SEMANTIC_ANALYSIS_ROLE_ENVELOPE_INVALID");
  const input = { request, allowed_roles: [...roles].sort() };
  need(lintPayload({ request: request.text }).length === 0 && detectEefi({ request: request.text }, compileEefiItems(DEFAULT_EEFI_ITEMS)).length === 0,
    "SEMANTIC_ANALYSIS_TRANSFER_OPSEC_DENIED");
  const body = { schema_version: "0.1", type: "OrderAnalysisPreview", repository, artifact_root: artifactRoot,
    repository_key: store.verification.repository.key, identity_fingerprint: store.verification.repository.identity_fingerprint,
    mission_id: request.mission_id, wave_id: request.wave_id, request_ref: requestRef,
    repository_state_sha256: repositoryStateDigest(repository), doctrine_state_sha256: repositoryStateDigest(__dirname), manifest_sha256: digest(store.manifest),
    classification: request.classification, prepared_at: now, expires_at: new Date(Math.min(Date.parse(request.expires_at), Date.parse(now) + 300000)).toISOString(),
    method_sha256: contract.methodBinding(), response_schema: z.toJSONSchema(contract.RESPONSE), input, prompt: contract.promptFor(request, input.allowed_roles), ...AUTHORITY };
  return { ...body, preview_sha256: digest(body) };
}
function revalidatePreview(preview, now = new Date().toISOString()) {
  const { preview_sha256: expected, ...body } = preview;
  need(preview.type === "OrderAnalysisPreview" && expected === digest(body), "SEMANTIC_ANALYSIS_PREVIEW_SUBSTITUTED");
  need(Number.isFinite(Date.parse(now)) && Date.parse(preview.prepared_at) <= Date.parse(now) && Date.parse(now) < Date.parse(preview.expires_at), "SEMANTIC_ANALYSIS_PREVIEW_NOT_CURRENT");
  need(prepareAnalysis({ repository: preview.repository, artifactRoot: preview.artifact_root, requestId: preview.request_ref.artifact_id,
    allowedRoles: preview.input.allowed_roles, now: preview.prepared_at }).preview_sha256 === expected, "SEMANTIC_ANALYSIS_PREVIEW_SOURCE_CHANGED");
  return true;
}
function compileAnalysis(response, preview, options = {}) {
  revalidatePreview(preview, options.now || new Date().toISOString());
  const analysis = contract.materialize(response, preview), result = compileOrder(analysis, { repository: preview.repository, artifactRoot: preview.artifact_root, now: options.now });
  need(result.execution_authorized === false && result.release_authorized === false, "SEMANTIC_ANALYSIS_AUTHORITY_INVALID");
  return { type: "OrderAnalysisOperation", analysis_sha256: digest(analysis), draft: { ...result, type: "OrderDraftReference" }, ...AUTHORITY };
}
function main(argv = process.argv.slice(2)) {
  const [action, ...args] = argv, options = {};
  need(action === "prepare" && args.length % 2 === 0, "Usage: order-analysis-generator.js prepare --repository <repo> --request-id <retained-request> [--artifact-root <root>]");
  for (let i = 0; i < args.length; i += 2) {
    const key = { "--repository": "repository", "--artifact-root": "artifactRoot", "--request-id": "requestId" }[args[i]];
    need(key && !Object.hasOwn(options, key) && args[i + 1] && !args[i + 1].startsWith("--"), "SEMANTIC_ANALYSIS_CLI_OPTION_INVALID"); options[key] = args[i + 1];
  }
  need(options.repository && options.requestId, "SEMANTIC_ANALYSIS_CLI_INPUT_REQUIRED"); console.log(JSON.stringify(prepareAnalysis(options), null, 2));
}
module.exports = { prepareAnalysis, revalidatePreview, compileAnalysis, main };
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
