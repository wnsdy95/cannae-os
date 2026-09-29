#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { AUTHORITY, FIELDS, sha256, same, buildDraft } = require("./order-intake-contract");

const REQUESTS = "mission-requests";
const DRAFTS = "order-drafts";
const SOURCE_KINDS = new Set(["deliverables", "source-records", "information-reports", "intelligence-assessments"]);
const reference = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
function requireTrue(value, code) { if (!value) throw new Error(code); }
function valid(payload, type) {
  const result = validatePayload(payload, type);
  requireTrue(result.valid, `ORDER_INTAKE_INVALID:${type}:${result.issues.map(item => item.code).join(",")}`);
}
function clock(options) {
  const value = options.now || new Date().toISOString();
  requireTrue(Number.isFinite(Date.parse(value)), "ORDER_INTAKE_CLOCK_INVALID");
  return value;
}
function context(options) {
  const repository = resolveRepository(options.repository);
  return { repository, artifactRoot: path.resolve(options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")) };
}
function load(options) {
  const current = context(options);
  return loadVerifiedStore(current.repository.root, current.artifactRoot);
}
function find(store, id, kind) {
  const matches = store.manifest.artifacts.filter(item => item.artifact_id === id && item.kind === kind);
  requireTrue(matches.length <= 1, "ORDER_INTAKE_ID_AMBIGUOUS");
  return matches[0];
}
function readBytes(store, ref, scope, kinds) {
  const entries = store.manifest.artifacts.filter(item => same(reference(item), ref));
  requireTrue(entries.length === 1, "ORDER_INTAKE_REFERENCE_NOT_RETAINED");
  const entry = entries[0];
  requireTrue(kinds.has(entry.kind) && (!scope || (entry.mission_id === scope.mission_id && entry.wave_id === scope.wave_id)),
    "ORDER_INTAKE_REFERENCE_SCOPE_MISMATCH");
  const namespace = fs.realpathSync(path.join(store.artifactRoot, "repositories", store.verification.repository.key));
  const file = fs.realpathSync(path.resolve(store.artifactRoot, entry.relative_path));
  requireTrue(file.startsWith(`${namespace}${path.sep}`) && fs.statSync(file).isFile() && fs.statSync(file).size <= 8388608,
    "ORDER_INTAKE_REFERENCE_PATH_INVALID");
  const bytes = fs.readFileSync(file);
  requireTrue(sha256(bytes) === ref.sha256, "ORDER_INTAKE_REFERENCE_DIGEST_MISMATCH");
  return { entry, bytes };
}
function readRequest(store, ref, scope) {
  const result = readBytes(store, ref, scope, new Set([REQUESTS]));
  const request = JSON.parse(result.bytes.toString("utf8"));
  valid(request, "mission-request");
  const repository = store.verification.repository;
  requireTrue(request.id === result.entry.artifact_id && request.mission_id === result.entry.mission_id && request.wave_id === result.entry.wave_id &&
    request.repository_binding.repository_key === repository.key && request.repository_binding.identity_fingerprint === repository.identity_fingerprint &&
    Date.parse(request.recorded_at) === Date.parse(result.entry.created_at), "ORDER_INTAKE_REQUEST_SCOPE_MISMATCH");
  return request;
}
function fresh(request, now) {
  requireTrue(Date.parse(request.recorded_at) <= Date.parse(now) && Date.parse(now) < Date.parse(request.expires_at), "ORDER_INTAKE_REQUEST_EXPIRED_OR_FUTURE");
}
function utf8(bytes) {
  const text = bytes.toString("utf8");
  requireTrue(Buffer.from(text, "utf8").equals(bytes), "ORDER_INTAKE_UTF8_INVALID");
  return text;
}
function quote(bytes, source, text) {
  requireTrue(source.start_byte >= 0 && source.end_byte > source.start_byte && source.end_byte <= bytes.length,
    "ORDER_INTAKE_QUOTE_RANGE_INVALID");
  requireTrue(utf8(bytes.subarray(source.start_byte, source.end_byte)) === text, "ORDER_INTAKE_QUOTE_MISMATCH");
}
function appraise(store, analysis, now) {
  valid(analysis, "mission-order-analysis");
  const request = readRequest(store, analysis.request_ref, analysis);
  fresh(request, now);
  for (const statement of analysis.statements) {
    if (statement.kind === "request_quote") quote(Buffer.from(request.text, "utf8"), statement.source, statement.text);
    if (statement.kind === "evidence_quote") {
      const { entry, bytes } = readBytes(store, statement.source.artifact_ref, analysis, SOURCE_KINDS);
      requireTrue(Date.parse(entry.created_at) <= Date.parse(now), "ORDER_INTAKE_SOURCE_FROM_FUTURE");
      utf8(bytes);
      quote(bytes, statement.source, statement.text);
    }
  }
  return request;
}
function summary(payload, ref, existing = false) {
  return { id: payload.id, status: payload.status || "captured", classification: payload.classification,
    expires_at: payload.expires_at, artifact_ref: ref, existing, ...AUTHORITY };
}

function captureRequest(options) {
  const current = context(options);
  if (typeof options.text !== "string") {
    const stat = fs.statSync(options.requestFile);
    requireTrue(stat.isFile() && stat.size <= 131072, "ORDER_INTAKE_REQUEST_FILE_INVALID");
  }
  const text = typeof options.text === "string" ? options.text : utf8(fs.readFileSync(options.requestFile));
  const ttl = options.validForSeconds === undefined ? 3600 : Number(options.validForSeconds);
  requireTrue(Number.isSafeInteger(ttl) && ttl > 0 && ttl <= 86400, "ORDER_INTAKE_VALIDITY_INVALID");
  const recordedAt = clock(options);
  const request = { schema_version: "0.1", type: "MissionRequest", id: options.requestId, mission_id: options.mission,
    wave_id: options.wave, repository_binding: { repository_key: current.repository.key, identity_fingerprint: current.repository.identity_fingerprint },
    classification: options.classification || "internal", recorded_at: recordedAt,
    expires_at: new Date(Date.parse(recordedAt) + ttl * 1000).toISOString(), text, text_sha256: sha256(Buffer.from(text, "utf8")), ...AUTHORITY };
  valid(request, "mission-request");
  if (fs.existsSync(path.join(current.artifactRoot, "repositories", current.repository.key, "manifest.json"))) {
    const store = load(options);
    const existing = find(store, request.id, REQUESTS);
    if (existing) {
      const retained = readRequest(store, reference(existing), request);
      requireTrue(same({ ...request, recorded_at: retained.recorded_at, expires_at: retained.expires_at }, retained) &&
        Date.parse(retained.expires_at) - Date.parse(retained.recorded_at) === ttl * 1000, "ORDER_INTAKE_REQUEST_ID_CONFLICT");
      fresh(retained, recordedAt);
      return summary(retained, reference(existing), true);
    }
  }
  const written = writeRepositoryArtifact({ repositoryPath: current.repository.root, artifactRoot: current.artifactRoot,
    missionId: request.mission_id, waveId: request.wave_id, kind: REQUESTS, artifactId: request.id, payload: request,
    createdAt: recordedAt, reuseExisting: true, publicationGuard: () => { fresh(request, clock(options)); return true; } });
  return summary(request, { artifact_id: request.id, relative_path: written.relative_path, sha256: written.sha256 });
}

function analysisTemplate(options) {
  const store = load(options);
  const entry = find(store, options.requestId, REQUESTS);
  requireTrue(entry, "ORDER_INTAKE_REQUEST_NOT_FOUND");
  const requestRef = reference(entry);
  const request = readRequest(store, requestRef);
  fresh(request, clock(options));
  const sections = Object.fromEntries(FIELDS.map(field => [field, []]));
  sections["mission.statement"] = ["ST-REQUEST"];
  const analysis = { schema_version: "0.1", type: "MissionOrderAnalysis", id: options.analysisId,
    mission_id: request.mission_id, wave_id: request.wave_id, request_ref: requestRef,
    statements: [{ id: "ST-REQUEST", kind: "request_quote", text: request.text, blocking: false,
      source: { kind: "request", start_byte: 0, end_byte: Buffer.byteLength(request.text, "utf8") } }],
    sections, tasks: [], retained_user_decisions: [], ...AUTHORITY };
  valid(analysis, "mission-order-analysis");
  return analysis;
}

function replayDraft(store, entry) {
  const retained = readBytes(store, reference(entry), null, new Set([DRAFTS]));
  const draft = JSON.parse(retained.bytes.toString("utf8"));
  valid(draft, "order-draft");
  requireTrue(draft.id === entry.artifact_id && draft.mission_id === entry.mission_id && draft.wave_id === entry.wave_id &&
    Date.parse(draft.compiled_at) === Date.parse(entry.created_at), "ORDER_INTAKE_DRAFT_SCOPE_MISMATCH");
  const request = appraise(store, draft.analysis, draft.compiled_at);
  requireTrue(same(draft, buildDraft(request, draft.request_ref, draft.analysis, draft.compiled_at)), "ORDER_INTAKE_DRAFT_REPLAY_MISMATCH");
  return draft;
}

function compileOrder(analysis, options) {
  const store = load(options);
  const now = clock(options);
  const request = appraise(store, analysis, now);
  const draft = buildDraft(request, analysis.request_ref, analysis, now);
  valid(draft, "order-draft");
  const existing = find(store, draft.id, DRAFTS);
  if (existing) {
    const retained = replayDraft(store, existing);
    requireTrue(Date.parse(retained.compiled_at) <= Date.parse(now), "ORDER_INTAKE_DRAFT_FROM_FUTURE");
    return summary(retained, reference(existing), true);
  }
  const refs = [analysis.request_ref, ...analysis.statements.filter(item => item.kind === "evidence_quote").map(item => item.source.artifact_ref)];
  const written = writeRepositoryArtifact({ repositoryPath: store.verification.repository.root, artifactRoot: store.artifactRoot,
    missionId: draft.mission_id, waveId: draft.wave_id, kind: DRAFTS, artifactId: draft.id, payload: draft, createdAt: now, reuseExisting: true,
    publicationGuard: ({ manifest }) => {
      fresh(request, clock(options));
      requireTrue(refs.every(ref => manifest.artifacts.some(entry => same(reference(entry), ref) &&
        entry.mission_id === draft.mission_id && entry.wave_id === draft.wave_id)), "ORDER_INTAKE_PUBLICATION_SOURCE_CHANGED");
      return true;
    } });
  return summary(draft, { artifact_id: draft.id, relative_path: written.relative_path, sha256: written.sha256 });
}

function inspectDraft(options) {
  const store = load(options);
  const entry = find(store, options.draftId, DRAFTS);
  requireTrue(entry, "ORDER_INTAKE_DRAFT_NOT_FOUND");
  const draft = replayDraft(store, entry);
  const now = clock(options);
  requireTrue(Date.parse(now) >= Date.parse(draft.compiled_at), "ORDER_INTAKE_DRAFT_FROM_FUTURE");
  return { ...summary(draft, reference(entry), true), freshness: Date.parse(now) < Date.parse(draft.expires_at) ? "current" : "expired",
    request: readRequest(store, draft.request_ref, draft), draft };
}

function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const allowed = {
    capture: ["repository", "artifact-root", "request-file", "request-id", "mission", "wave", "classification", "valid-for-seconds"],
    template: ["repository", "artifact-root", "request-id", "analysis-id"],
    compile: ["repository", "artifact-root", "analysis"],
    inspect: ["repository", "artifact-root", "draft-id"]
  };
  requireTrue(allowed[command], "Usage: request-order-compiler.js <capture|template|compile|inspect> --repository <repo> [options]");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index].slice(2);
    requireTrue(rest[index].startsWith("--") && allowed[command].includes(key) && rest[index + 1] && !rest[index + 1].startsWith("--"), "ORDER_INTAKE_CLI_OPTION_INVALID");
    const property = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    requireTrue(options[property] === undefined, "ORDER_INTAKE_CLI_DUPLICATE_OPTION");
    options[property] = rest[index + 1];
  }
  const required = { capture: ["requestFile", "requestId", "mission", "wave"], template: ["requestId", "analysisId"], compile: ["analysis"], inspect: ["draftId"] };
  requireTrue(options.repository && required[command].every(key => options[key]), "ORDER_INTAKE_CLI_INPUT_REQUIRED");
  const output = command === "capture" ? captureRequest(options) : command === "template" ? analysisTemplate(options)
    : command === "compile" ? compileOrder(JSON.parse(fs.readFileSync(options.analysis, "utf8")), options) : inspectDraft(options);
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { captureRequest, analysisTemplate, compileOrder, inspectDraft, replayDraft, readRequest, main };
