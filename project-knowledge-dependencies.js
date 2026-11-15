#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { TextDecoder } = require("node:util");
const terms = require("./project-terminology");
const { canonicalDocumentPath } = require("./context-document-integrity");
const { lintPayload } = require("./opsec-linter");

const OUTPUT = ".cannae/knowledge/dependencies", DRAFTS = ".cannae/knowledge/dependency-requests";
const MAX_RECORD = 128 * 1024, MAX_WORKS = 128;
const hash = value => createHash("sha256").update(value).digest("hex");
const encode = value => JSON.stringify(value, null, 2) + "\n";
const normalized = value => value.normalize("NFC").trim().toLowerCase();
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
const same = (a, b) => digest(a) === digest(b);
const fail = code => { throw new Error("KNOWLEDGE_DEPENDENCY_" + code); };
const workId = value => typeof value === "string" && /^WORK-[A-Z0-9][A-Z0-9_-]{0,74}$/.test(value);
const flags = () => ({ authorization_verified: false, work_quality_verified: false,
  dependency_completeness_verified: false, transfer_authorized: false });
const env = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));

function sourcePath(relative) {
  if (typeof relative !== "string") return false;
  const value = relative.startsWith(".cannae/document-drafts/") ? relative.slice(24) : relative;
  return canonicalDocumentPath(value) && value.split("/").every(part => !part.startsWith("."));
}

function dependencyIssues(value, type) {
  const issues = [], add = code => issues.push({ severity: "error", code: "KNOWLEDGE_DEPENDENCY_" + code,
    path: "$", message: "Declared dependency binding or review boundary failed." });
  if (type === "project-knowledge-dependency-request") {
    if (!workId(value.work_id) || (!value.subject.document && !value.subject.task) ||
        (value.subject.document !== null && !sourcePath(value.subject.document))) add("SUBJECT_INVALID");
    if (value.sources.some(source => !sourcePath(source.path))) add("SOURCE_PATH_INVALID");
    if (!value.sources.length && !value.terminology && !value.upstream.length) add("EMPTY_DEPENDENCIES");
    for (const ids of [value.sources.map(s => s.id), value.sources.map(s => s.path), value.upstream.map(s => s.work_id)]) {
      if (new Set(ids).size !== ids.length) add("DUPLICATE_DEPENDENCY");
    }
    if (value.upstream.some(s => s.work_id === value.work_id)) add("CYCLE");
    const binding = value.terminology;
    if (binding) {
      const names = binding.terms.map(normalized), required = binding.required_terms.map(normalized);
      if (new Set(names).size !== names.length || new Set(required).size !== required.length ||
          required.some(name => !names.includes(name)) || names.some(name => !name)) add("TERMS_INVALID");
      if ((binding.actor === "user" && (binding.role !== null || binding.department !== null)) ||
          (binding.actor === "ai" && (!binding.role?.trim() || !binding.department?.trim() ||
            ["USER", "COMMANDER"].includes(binding.role)))) add("READER_INVALID");
      if (!binding.domain.trim() || (binding.task !== null && !binding.task.trim())) add("TERMS_INVALID");
    }
    if ((value.review_reference !== null && !value.review_reference.trim()) ||
        (value.subject.task !== null && !value.subject.task.trim())) add("EMPTY_TEXT");
  } else {
    if (value.request_sha256 !== digest(value.request)) add("REQUEST_BINDING_MISMATCH");
    if (value.request.review_reference === null) add("REVIEW_REQUIRED");
    if ((value.version === 1) !== (value.request.previous_sha256 === null)) add("PREDECESSOR_INVALID");
    if (!same(value.term_observations.map(item => item.term), value.request.terminology?.terms ?? []) ||
        value.term_observations.some(item => (item.state === "confirmed") !== (item.confirmed_sha256 !== null))) add("TERM_BINDING_INVALID");
  }
  if (lintPayload(value).some(item => ["error", "critical"].includes(item.severity))) add("CONTENT_REVIEW_REQUIRED");
  return issues;
}

function validate(value, kind) {
  if (!require("./validator-cli-prototype/validate").validatePayload(value, "project-knowledge-dependency-" + kind).valid) fail("CONTRACT_INVALID");
}
function parse(bytes) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("INPUT_INVALID"); }
}

function directory(root, relative, create = false) {
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code !== "ENOENT") fail("DIRECTORY_UNAVAILABLE"); }
    if (!stat && create) {
      try { fs.mkdirSync(current, { mode: 0o700 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
      stat = fs.lstatSync(current);
    }
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) fail("DIRECTORY_INVALID");
  }
  return current;
}
function ignored(root, relative) {
  const result = spawnSync("git", ["-C", root, "check-ignore", "--quiet", "--", relative],
    { env: env(), encoding: "utf8", timeout: 5000 });
  if (result.status !== 0) fail("OUTPUT_NOT_IGNORED");
}
function sourceDigest(root, relative) {
  if (!sourcePath(relative)) fail("SOURCE_PATH_INVALID");
  const belongs = () => {
    const result = spawnSync("git", ["-C", path.dirname(path.join(root, relative)), "rev-parse", "--show-toplevel"],
      { env: env(), encoding: "utf8", timeout: 5000 });
    if (result.status !== 0 || fs.realpathSync(result.stdout.trim()) !== root) fail("SOURCE_REPOSITORY_MISMATCH");
  };
  belongs();
  const result = terms.readBoundFile(root, relative);
  belongs();
  return result.digest;
}

// Restrict refresh to new versions of the same declared work, reader and requirements.
function scope(request) {
  const value = structuredClone(request);
  delete value.previous_sha256; delete value.review_reference;
  for (const source of value.sources) delete source.sha256;
  for (const upstream of value.upstream) delete upstream.record_sha256;
  if (value.terminology) delete value.terminology.ledger_sha256;
  return value;
}

function history(origin, id, allowMissing = false) {
  if (!workId(id)) fail("WORK_ID_INVALID");
  const parent = directory(origin.root, OUTPUT + "/" + id);
  let files;
  try { files = fs.readdirSync(parent).sort(); }
  catch (error) { if (allowMissing && error.code === "ENOENT") return null; fail("RECORD_UNAVAILABLE"); }
  if (!files.length && allowMissing) return null;
  if (!files.length || files.length > 256 || files.some((file, index) => file !== String(index + 1).padStart(6, "0") + ".json")) fail("HISTORY_INVALID");
  let previous = null;
  for (const [index, file] of files.entries()) {
    const relative = OUTPUT + "/" + id + "/" + file;
    const stored = terms.readBoundFile(origin.root, relative, MAX_RECORD), record = parse(stored.bytes);
    validate(record, "record");
    if (!same(record.repository, origin) || record.request.work_id !== id || record.version !== index + 1 ||
        record.request.previous_sha256 !== (previous?.digest ?? null)) fail("HISTORY_BINDING_INVALID");
    if (previous && !same(scope(previous.value.request), scope(record.request))) fail("REFRESH_SCOPE_CHANGED");
    previous = { value: record, digest: stored.digest, relative };
  }
  return previous;
}

function termObservation(root, binding) {
  if (!binding) return { ledger_sha256: null, observations: [] };
  let ledger;
  try { ledger = terms.read(root); }
  catch (error) {
    if (error.message !== "TERMINOLOGY_MISSING") throw error;
    ledger = { digest: null, value: { schema_version: "0.1", type: "ProjectTerminology", repository: terms.identity(root), entries: [] } };
  }
  const selection = terms.select(ledger.value, binding);
  const observations = binding.terms.map(term => {
    const matches = entry => [entry.term, ...entry.aliases].some(name => normalized(name) === normalized(term));
    const selected = Object.fromEntries(["confirmed", "candidates", "retired"].map(kind =>
      [kind, selection[kind].filter(matches).sort((a, b) => a.id.localeCompare(b.id))]));
    const state = selected.confirmed.length > 1 ? "conflict" : selected.confirmed.length === 1 ? "confirmed" :
      selected.candidates.length ? "candidate_only" : selected.retired.length ? "retired" : "unavailable";
    return { term, state, confirmed_sha256: state === "confirmed" ? digest(selected.confirmed[0]) : null,
      selection_sha256: digest(selected) };
  });
  return { ledger_sha256: ledger.digest, observations };
}

function inspect(repository, selectedId) {
  const origin = terms.identity(repository), cache = new Map();
  const inspectOne = (id, stack = []) => {
    if (stack.includes(id)) return { work_id: id, status: "held", record_sha256: null, findings: [{ kind: "registry", code: "cycle", required: true }] };
    if (cache.has(id)) return cache.get(id);
    if (cache.size + stack.length >= MAX_WORKS) fail("GRAPH_LIMIT");
    const findings = [], add = (kind, id, code, required, extra = {}) => findings.push({ kind, id, code, required, ...extra });
    let current;
    try { current = history(origin, id); }
    catch { const failed = { work_id: id, record_sha256: null, status: "held", findings: [{ kind: "registry", code: "record_unavailable_or_invalid", required: true }] }; cache.set(id, failed); return failed; }
    const request = current.value.request;
    for (const source of request.sources) {
      try { const actual = sourceDigest(origin.root, source.path);
        if (actual !== source.sha256) add("source", source.id, "source_changed", source.required, { expected_sha256: source.sha256, actual_sha256: actual });
      } catch { add("source", source.id, "source_unavailable", source.required); }
    }
    if (request.terminology) {
      const binding = request.terminology;
      try {
        const actual = termObservation(origin.root, binding);
        if (actual.ledger_sha256 !== binding.ledger_sha256) add("terminology", "ledger", "binding_refresh_required", false);
        for (const [index, observation] of actual.observations.entries()) {
          const required = binding.required_terms.some(term => normalized(term) === normalized(observation.term));
          const previous = current.value.term_observations[index];
          if (observation.state !== "confirmed") add("term", observation.term, "meaning_" + observation.state, required);
          else if (previous.confirmed_sha256 !== observation.confirmed_sha256) add("term", observation.term, "meaning_changed", required);
          else if (previous.selection_sha256 !== observation.selection_sha256) add("term", observation.term, "candidate_observation_changed", false);
        }
      } catch { add("terminology", "ledger", "ledger_unavailable", binding.required_terms.length > 0); }
    }
    for (const dependency of request.upstream) {
      const upstream = inspectOne(dependency.work_id, [...stack, id]);
      if (upstream.status === "held") add("upstream", dependency.work_id, "upstream_held", dependency.required);
      if (upstream.record_sha256 !== dependency.record_sha256) add("upstream", dependency.work_id, "upstream_revision_changed", dependency.required);
      else if (["review_needed", "binding_refresh_required"].includes(upstream.status)) add("upstream", dependency.work_id, "upstream_review_needed", false);
    }
    const status = findings.some(item => item.required) ? "held" : findings.some(item =>
      !["binding_refresh_required", "candidate_observation_changed", "upstream_review_needed"].includes(item.code)) ? "review_needed" :
      findings.length ? "binding_refresh_required" : "registered_inputs_current";
    const result = { work_id: id, subject: request.subject, record_sha256: current.digest, version: current.value.version, status, findings };
    cache.set(id, result); return result;
  };
  let ids;
  if (selectedId !== undefined) { if (!workId(selectedId)) fail("WORK_ID_INVALID"); ids = [selectedId]; }
  else {
    const parent = directory(origin.root, OUTPUT);
    try { ids = fs.readdirSync(parent).sort(); }
    catch (error) { if (error.code !== "ENOENT") throw error; ids = []; }
    if (ids.length > MAX_WORKS || ids.some(id => !workId(id))) fail("REGISTRY_INVALID");
  }
  const results = ids.map(id => inspectOne(id));
  if (!same(origin, terms.identity(repository))) fail("ROOT_CHANGED");
  return { status: "registered_dependency_observation", results, registered_work_count: ids.length,
    unregistered_dependencies_assessed: false, can_execute: false, ...flags() };
}

function compile(request, origin) {
  validate(request, "request");
  if (request.review_reference === null) fail("REVIEW_REQUIRED");
  const previous = history(origin, request.work_id, true);
  if (request.previous_sha256 !== (previous?.digest ?? null)) fail("PREDECESSOR_STALE");
  if (previous && !same(scope(previous.value.request), scope(request))) fail("REFRESH_SCOPE_CHANGED");
  for (const source of request.sources) if (sourceDigest(origin.root, source.path) !== source.sha256) fail("SOURCE_STALE");
  const actual = termObservation(origin.root, request.terminology);
  if (request.terminology && actual.ledger_sha256 !== request.terminology.ledger_sha256) fail("LEDGER_STALE");
  const visited = new Set();
  const visit = id => {
    if (id === request.work_id) fail("CYCLE");
    if (visited.has(id)) return;
    if (visited.size >= MAX_WORKS) fail("GRAPH_LIMIT");
    visited.add(id);
    for (const dependency of history(origin, id).value.request.upstream) visit(dependency.work_id);
  };
  for (const upstream of request.upstream) {
    if (history(origin, upstream.work_id).digest !== upstream.record_sha256) fail("UPSTREAM_STALE");
    visit(upstream.work_id);
  }
  const record = { schema_version: "0.1", type: "ProjectKnowledgeDependencyRecord", repository: origin,
    version: (previous?.value.version ?? 0) + 1, request: structuredClone(request), request_sha256: digest(request),
    term_observations: actual.observations, ...flags() };
  validate(record, "record");
  return record;
}

function publish(origin, relative, bytes, recheck) {
  ignored(origin.root, relative);
  directory(origin.root, path.posix.dirname(relative), true);
  recheck();
  ignored(origin.root, relative);
  directory(origin.root, path.posix.dirname(relative));
  if (!same(origin, terms.identity(origin.root))) fail("ROOT_CHANGED");
  let fd;
  try {
    fd = fs.openSync(path.join(origin.root, relative), "wx", 0o600);
    fs.writeFileSync(fd, bytes); fs.fsyncSync(fd);
  } catch (error) { if (error.code === "EEXIST") fail("CONCURRENT_VERSION"); throw error; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
  if (terms.readBoundFile(origin.root, relative, MAX_RECORD).digest !== hash(bytes)) fail("OUTPUT_CHANGED");
}

function register(request, repository, recheckRequest = () => {}) {
  const origin = terms.identity(repository), record = compile(request, origin);
  const relative = OUTPUT + "/" + request.work_id + "/" + String(record.version).padStart(6, "0") + ".json";
  publish(origin, relative, encode(record), () => {
    recheckRequest();
    if (!same(record, compile(request, origin))) fail("INPUT_CHANGED");
  });
  return { record_path: relative, record_sha256: hash(encode(record)), ...inspect(repository, request.work_id) };
}

function prepareRefresh(repository, id, expected) {
  const origin = terms.identity(repository), previous = history(origin, id);
  if (previous.digest !== expected) fail("PREDECESSOR_STALE");
  const request = structuredClone(previous.value.request);
  request.previous_sha256 = expected; request.review_reference = null;
  for (const source of request.sources) source.sha256 = sourceDigest(origin.root, source.path);
  if (request.terminology) request.terminology.ledger_sha256 = termObservation(origin.root, request.terminology).ledger_sha256;
  for (const upstream of request.upstream) upstream.record_sha256 = history(origin, upstream.work_id).digest;
  const relative = DRAFTS + "/" + randomUUID() + ".json", bytes = encode(request);
  // Reuse registration's full freshness checks with a non-persisted appraisal marker.
  const probe = { ...request, review_reference: "Unreviewed freshness probe; never adopted." };
  const compiled = compile(probe, origin);
  publish(origin, relative, bytes, () => { if (!same(compiled, compile(probe, origin))) fail("INPUT_CHANGED"); });
  return { status: "refresh_draft_pending_appraisal", request_path: relative, request_sha256: hash(bytes),
    predecessor_sha256: expected, canonical_record_written: false, can_execute: false, ...flags() };
}

function main(argv = process.argv.slice(2)) {
  try {
    const [command, ...args] = argv, values = {};
    const names = command === "register-dependencies" ? ["repository", "request", "request-sha256"] :
      command === "inspect-dependencies" ? ["repository", "work-id"] :
      command === "prepare-dependency-refresh" ? ["repository", "work-id", "record-sha256"] : [];
    if (!names.length || args.length % 2) fail("USAGE");
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].slice(2), value = args[i + 1];
      if (!args[i].startsWith("--") || !names.includes(key) || Object.hasOwn(values, key) || !value || value.startsWith("--")) fail("USAGE");
      values[key] = value;
    }
    if (names.some(name => !(command === "inspect-dependencies" && name === "work-id") && !values[name])) fail("USAGE");
    let result;
    if (command === "inspect-dependencies") result = inspect(values.repository, values["work-id"]);
    else if (command === "prepare-dependency-refresh") result = prepareRefresh(values.repository, values["work-id"], values["record-sha256"]);
    else {
      if (!new RegExp("^" + DRAFTS.replaceAll(".", "\\.") + "/[A-Za-z0-9_-]+\\.json$").test(values.request)) fail("REQUEST_PATH_INVALID");
      const root = terms.identity(values.repository).root;
      const read = () => { const stored = terms.readBoundFile(root, values.request, MAX_RECORD);
        if (stored.digest !== values["request-sha256"]) fail("REQUEST_STALE"); return parse(stored.bytes); };
      result = register(read(), root, read);
    }
    process.stdout.write(encode(result));
  } catch (error) {
    console.error(/^KNOWLEDGE_DEPENDENCY_[A-Z_]+$/.test(error.message || "") ? error.message : "KNOWLEDGE_DEPENDENCY_INPUT_UNAVAILABLE");
    process.exitCode = 1;
  }
}

module.exports = { dependencyIssues, register, inspect, prepareRefresh, main, OUTPUT, DRAFTS, digest };
if (require.main === module) main();
