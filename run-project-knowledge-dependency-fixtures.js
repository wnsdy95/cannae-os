#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process"), { createHash } = require("node:crypto");
const deps = require("./project-knowledge-dependencies"), terms = require("./project-terminology");
const { validatePayload } = require("./validator-cli-prototype/validate");
const sample = require("./sample-payloads/valid-project-knowledge-dependency-request.json");
const entry = require("./sample-payloads/valid-project-terminology.json").entries[0];
const ROOT = __dirname, temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-dependencies-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CANNAE_OS_HOME"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex"), copy = value => structuredClone(value);
let passed = 0;
const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
const json = (file, value) => write(file, JSON.stringify(value, null, 2) + "\n");
function check(name, fn) { fn(); console.log("PASS " + name); passed++; }
function project(name) {
  const root = path.join(temp, name); fs.mkdirSync(root);
  assert.equal(spawnSync("git", ["init", "-q", root], { env }).status, 0);
  write(path.join(root, ".gitignore"), ".cannae/\n"); write(path.join(root, "policy.md"), "Policy version one.\n");
  return { root, request: copy(sample) };
}
function ledger(p, entries = [copy(entry)]) {
  const value = { schema_version: "0.1", type: "ProjectTerminology", repository: terms.identity(p.root), entries };
  json(path.join(p.root, terms.RELATIVE), value); return terms.read(p.root);
}
function withTerms(p, required = ["ICP"]) {
  p.request.terminology = { ledger_sha256: ledger(p).digest, domain: "sales", task: null,
    actor: "ai", role: "S3", department: "sales", terms: ["ICP"], required_terms: required };
  return p;
}
const observation = (p, id = p.request.work_id) => deps.inspect(p.root, id).results[0];
function refresh(p, result) {
  const draft = deps.prepareRefresh(p.root, p.request.work_id, result.record_sha256);
  const request = JSON.parse(fs.readFileSync(path.join(p.root, draft.request_path)));
  assert.equal(request.review_reference, null); assert.equal(draft.canonical_record_written, false);
  request.review_reference = "Synthetic reappraisal against original task and revised inputs.";
  return { draft, request };
}
function invalid(value, kind, code) {
  const result = validatePayload(value, "project-knowledge-dependency-" + kind);
  assert.equal(result.valid, false); assert.equal(result.can_execute, false);
  assert(result.issues.some(issue => issue.code === code), JSON.stringify(result.issues));
}
function cli(script, args, status = 0) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: temp, env, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, status, result.stderr);
  if (status) { assert.equal(result.stdout, ""); assert(!result.stderr.includes(temp)); return result.stderr.trim(); }
  return JSON.parse(result.stdout);
}
try {
  check("registration binds declared inputs without reading a planned output or granting authority", () => {
    const p = project("initial"), result = deps.register(p.request, p.root);
    assert.equal(result.results[0].status, "registered_inputs_current");
    assert.equal(result.results[0].version, 1);
    assert(!fs.existsSync(path.join(p.root, p.request.subject.document)));
    for (const flag of ["can_execute", "authorization_verified", "work_quality_verified", "dependency_completeness_verified", "transfer_authorized", "unregistered_dependencies_assessed"]) assert.equal(result[flag], false);
    const record = JSON.parse(fs.readFileSync(path.join(p.root, result.record_path)));
    assert.equal(validatePayload(record, "project-knowledge-dependency-record").valid, true);
    assert.equal(validatePayload(record, "project-knowledge-dependency-record").can_execute, false);
    assert.equal(fs.statSync(path.join(p.root, result.record_path)).mode & 0o777, 0o600);
    assert.throws(() => deps.register(p.request, p.root), /PREDECESSOR_STALE/);
  });
  check("required source revision holds only dependent work and retains historical bytes on refresh", () => {
    const p = project("source impact"), first = deps.register(p.request, p.root);
    write(path.join(p.root, "independent.md"), "Independent source.");
    const independent = copy(p.request); independent.work_id = "WORK-INDEPENDENT";
    independent.sources[0] = { ...independent.sources[0], path: "independent.md", sha256: hash("Independent source.") };
    deps.register(independent, p.root);
    const before = fs.readFileSync(path.join(p.root, first.record_path));
    write(path.join(p.root, "policy.md"), "Revised policy with retained obligation.\n");
    const results = deps.inspect(p.root).results;
    assert.equal(results.find(row => row.work_id === "WORK-SOP").status, "held");
    assert.equal(results.find(row => row.work_id === "WORK-INDEPENDENT").status, "registered_inputs_current");
    const { request, draft } = refresh(p, first);
    assert.equal(observation(p).status, "held");
    const unreviewed = copy(request); unreviewed.review_reference = null;
    assert.throws(() => deps.register(unreviewed, p.root), /REVIEW_REQUIRED/);
    const second = deps.register(request, p.root);
    assert.equal(second.results[0].status, "registered_inputs_current"); assert.equal(second.results[0].version, 2);
    assert.deepEqual(fs.readFileSync(path.join(p.root, first.record_path)), before);
    assert.equal(JSON.parse(fs.readFileSync(path.join(p.root, draft.request_path))).review_reference, null);
    assert.throws(() => deps.prepareRefresh(p.root, p.request.work_id, first.record_sha256), /PREDECESSOR_STALE/);
  });
  check("optional missing or changed source warns while required missing input prevents a refresh", () => {
    const p = project("missing source"), first = deps.register(p.request, p.root);
    fs.unlinkSync(path.join(p.root, "policy.md"));
    assert.equal(observation(p).status, "held");
    assert.throws(() => refresh(p, first), /MISSING/);
    const q = project("optional source"); q.request.sources[0].required = false;
    const optional = deps.register(q.request, q.root);
    write(path.join(q.root, "policy.md"), "Changed optional context.");
    assert.equal(observation(q).status, "review_needed");
    fs.unlinkSync(path.join(q.root, "policy.md"));
    assert.equal(observation(q).status, "review_needed");
    assert.throws(() => refresh(q, optional), /MISSING/);
  });
  check("confirmed correction affects scoped terms while unrelated and formatting changes only refresh bindings", () => {
    const p = withTerms(project("term impact")), first = deps.register(p.request, p.root);
    const other = copy(entry); other.id = "TERM-OTHER"; other.concept_id = "CONCEPT-OTHER"; other.term = "Other"; other.aliases = [];
    ledger(p, [copy(entry), other]);
    assert.equal(observation(p).status, "binding_refresh_required");
    const current = terms.read(p.root); fs.writeFileSync(path.join(p.root, terms.RELATIVE), JSON.stringify(current.value));
    assert.equal(observation(p).status, "binding_refresh_required");
    const correction = copy(entry); correction.id = "TERM-ICP-2"; correction.version = 2; correction.supersedes = entry.id;
    correction.definition = "A revised company fit criterion.";
    ledger(p, [copy(entry), correction]);
    const result = observation(p); assert.equal(result.status, "held");
    assert(result.findings.some(item => item.code === "meaning_changed"));
    const second = deps.register(refresh(p, first).request, p.root);
    assert.equal(second.results[0].status, "registered_inputs_current");
  });
  check("a pending candidate does not replace the last confirmed meaning", () => {
    const p = withTerms(project("candidate")), first = deps.register(p.request, p.root);
    const candidate = { ...copy(entry), id: "TERM-ICP-2", version: 2, supersedes: entry.id, status: "candidate", definition: "Tentative change." };
    candidate.basis.kind = "ai_inference";
    ledger(p, [copy(entry), candidate]);
    const result = observation(p); assert.equal(result.status, "binding_refresh_required");
    assert(result.findings.some(item => item.code === "candidate_observation_changed"));
    assert(!result.findings.some(item => item.code === "meaning_changed"));
    deps.register(refresh(p, first).request, p.root); assert.equal(observation(p).status, "registered_inputs_current");
  });
  check("reviewed writer append and source revision require actual document repair before a fresh context record", () => {
    const changes = require("./project-terminology-change"), writer = require("./project-terminology-writer");
    const p = withTerms(project("writer and document repair"));
    const original = "Company fit is assessed at company level. Review within five days. Do not publish.\n";
    write(path.join(p.root, "policy.md"), original); p.request.sources[0].sha256 = hash(original);
    const oldDraft = "Draft SOP: assess company-level fit; review within five days; do not publish.\n";
    write(path.join(p.root, "drafts/sop.md"), oldDraft);
    const first = deps.register(p.request, p.root), retained = fs.readFileSync(path.join(p.root, first.record_path));
    const change = copy(require("./sample-payloads/valid-project-terminology-change-request.json"));
    change.expected_ledger_sha256 = terms.read(p.root).digest;
    change.change.concept_id = entry.concept_id; change.change.scope = copy(entry.scope);
    change.change.term = "ICP"; change.change.definition = "Company fit including the procurement readiness criterion.";
    change.change.basis = { kind: "user_statement", reference: "Synthetic user revision 2",
      excerpt: "ICP now means company fit including procurement readiness; do not infer contact-level fit." };
    const quote = change.change.basis.excerpt + "\n";
    change.source.sha256 = hash(quote); change.source.start_byte = 0; change.source.end_byte = Buffer.byteLength(change.change.basis.excerpt);
    write(path.join(p.root, change.source.path), quote);
    const proposal = changes.prepare(change, p.root);
    const review = { ...copy(require("./sample-payloads/valid-project-terminology-change-review.json")),
      proposal_sha256: proposal.proposal_sha256, created_at: new Date(Date.now() - 1000).toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString() };
    const reviewPath = path.posix.dirname(proposal.proposal_path) + "/review.json";
    json(path.join(p.root, reviewPath), review);
    writer.adopt(p.root, proposal.proposal_path, proposal.proposal_sha256, hash(fs.readFileSync(path.join(p.root, reviewPath))));
    write(path.join(p.root, "policy.md"), "Company fit includes procurement readiness. Review within two days. Do not publish.\n");
    const held = observation(p); assert.equal(held.status, "held");
    assert(held.findings.some(item => item.code === "source_changed"));
    assert(held.findings.some(item => item.code === "meaning_changed"));
    assert.equal(fs.readFileSync(path.join(p.root, "drafts/sop.md"), "utf8"), oldDraft);
    const candidate = refresh(p, first);
    write(path.join(p.root, "drafts/sop.previous.md"), oldDraft);
    const repaired = "Draft SOP: assess company-level fit including procurement readiness; review within two days; do not publish.\n";
    write(path.join(p.root, "drafts/sop.md"), repaired);
    const appraisal = "Synthetic local appraisal: preserved company-level scope and publication prohibition; added procurement readiness and changed five to two days. Not a native or authenticated review.\n";
    write(path.join(p.root, "reviews/sop-revision-2.md"), appraisal);
    candidate.request.review_reference = "reviews/sop-revision-2.md sha256:" + hash(appraisal);
    const second = deps.register(candidate.request, p.root);
    assert.equal(second.results[0].status, "registered_inputs_current"); assert.equal(second.work_quality_verified, false);
    assert.deepEqual(fs.readFileSync(path.join(p.root, first.record_path)), retained);
    assert.equal(fs.readFileSync(path.join(p.root, "drafts/sop.previous.md"), "utf8"), oldDraft);
    assert.equal(fs.readFileSync(path.join(p.root, "drafts/sop.md"), "utf8"), repaired);
    assert.equal(terms.read(p.root).value.entries.length, 2);
  });
  check("explicit internal drafts are hashable inputs but source and subject remain separate", () => {
    const p = project("internal draft"), relative = ".cannae/document-drafts/review/source.md";
    write(path.join(p.root, relative), "Policy version one.\n"); p.request.sources[0].path = relative;
    assert.equal(deps.register(p.request, p.root).results[0].status, "registered_inputs_current");
    assert(!fs.existsSync(path.join(p.root, p.request.subject.document)));
  });
  for (const state of ["candidate_only", "retired", "conflict", "unavailable"]) check("required " + state + " meaning remains held even after re-registration", () => {
    const p = withTerms(project(state)), first = deps.register(p.request, p.root);
    let entries;
    if (state === "candidate_only") entries = [{ ...copy(entry), status: "candidate", basis: { ...entry.basis, kind: "ai_inference" } }];
    else if (state === "retired") entries = [copy(entry), { ...copy(entry), id: "TERM-ICP-2", version: 2, supersedes: entry.id, status: "retired" }];
    else if (state === "conflict") entries = [copy(entry), { ...copy(entry), id: "TERM-OTHER", concept_id: "CONCEPT-OTHER" }];
    else entries = [copy(entry), { ...copy(entry), id: "TERM-ICP-2", version: 2, supersedes: entry.id, allowed_roles: ["S6"] }];
    ledger(p, entries); const result = observation(p); assert.equal(result.status, "held");
    assert(result.findings.some(item => item.code === "meaning_" + state));
    assert(!JSON.stringify(result).includes(entry.definition));
    deps.register(refresh(p, first).request, p.root); assert.equal(observation(p).status, "held");
  });
  check("same spelling across projects and domains remains scoped and denied meanings stay hidden", () => {
    const p = withTerms(project("scope one")), q = withTerms(project("scope two"));
    deps.register(p.request, p.root); deps.register(q.request, q.root);
    ledger(p, [copy(entry), { ...copy(entry), id: "TERM-ENG", concept_id: "CONCEPT-ENG", scope: { domain: "engineering", task: null } }]);
    assert.equal(observation(p).status, "binding_refresh_required"); assert.equal(observation(q).status, "registered_inputs_current");
    const denied = withTerms(project("denied")); denied.request.terminology.role = "S4";
    assert.equal(deps.register(denied.request, denied.root).results[0].status, "held");
    const record = JSON.parse(fs.readFileSync(path.join(denied.root, deps.OUTPUT, "WORK-SOP", "000001.json")));
    assert.equal(record.term_observations[0].state, "unavailable"); assert.equal(record.term_observations[0].confirmed_sha256, null);
    assert(!JSON.stringify(record).includes(entry.definition));
  });
  check("an absent ledger is recorded as absence; later creation cannot silently supply a prerequisite", () => {
    const p = withTerms(project("absent ledger")); fs.unlinkSync(path.join(p.root, terms.RELATIVE)); p.request.terminology.ledger_sha256 = null;
    const first = deps.register(p.request, p.root); assert.equal(first.results[0].status, "held");
    ledger(p); assert.equal(observation(p).status, "held");
    deps.register(refresh(p, first).request, p.root); assert.equal(observation(p).status, "registered_inputs_current");
    write(path.join(p.root, terms.RELATIVE), "malformed");
    assert.equal(observation(p).status, "held"); assert.throws(() => deps.prepareRefresh(p.root, "WORK-SOP", observation(p).record_sha256), /UNAVAILABLE/);
  });
  check("reviewed refresh cannot remove requirements change scope reader work source path or upstream", () => {
    const p = withTerms(project("scope guard")), first = deps.register(p.request, p.root), prepared = refresh(p, first).request;
    const edits = [v => { v.sources = []; }, v => { v.sources[0].required = false; }, v => { v.sources[0].path = "other.md"; },
      v => { v.terminology.required_terms = []; }, v => { v.terminology.actor = "user"; v.terminology.role = null; v.terminology.department = null; },
      v => { v.terminology.domain = "engineering"; }, v => { v.subject.task = "Different work"; }, v => { v.terminology.terms = ["other"]; v.terminology.required_terms = []; }];
    for (const edit of edits) { const request = copy(prepared); edit(request); assert.throws(() => deps.register(request, p.root), /REFRESH_SCOPE_CHANGED/); }
    const request = copy(prepared); request.subject = { task: prepared.subject.task, document: prepared.subject.document };
    assert.equal(deps.register(request, p.root).results[0].status, "registered_inputs_current");
  });
  check("upstream holds propagate before a dependent document is rewritten and require separate reappraisal", () => {
    const p = project("graph"), first = deps.register(p.request, p.root);
    const child = { ...copy(p.request), work_id: "WORK-CHILD", sources: [], upstream: [{ work_id: "WORK-SOP", record_sha256: first.record_sha256, required: true }] };
    const second = deps.register(child, p.root);
    const optional = copy(child); optional.work_id = "WORK-OPTIONAL"; optional.upstream[0].required = false;
    deps.register(optional, p.root);
    write(path.join(p.root, "policy.md"), "Revised source.");
    assert.equal(observation(p, "WORK-CHILD").status, "held"); assert.equal(observation(p, "WORK-OPTIONAL").status, "review_needed");
    deps.register(refresh(p, first).request, p.root);
    assert.equal(observation(p, "WORK-CHILD").status, "held");
    const draft = deps.prepareRefresh(p.root, "WORK-CHILD", second.record_sha256);
    const request = JSON.parse(fs.readFileSync(path.join(p.root, draft.request_path))); request.review_reference = "Synthetic downstream reappraisal.";
    deps.register(request, p.root); assert.equal(observation(p, "WORK-CHILD").status, "registered_inputs_current");
    const missing = copy(child); missing.work_id = "WORK-MISSING"; missing.upstream[0].work_id = "WORK-UNKNOWN";
    assert.throws(() => deps.register(missing, p.root), /RECORD_UNAVAILABLE/);
  });
  check("malformed partial gapped and copied histories hold affected work without hiding independent work", () => {
    for (const kind of ["partial", "gap", "copy", "edited"]) {
      const p = project("history-" + kind), first = deps.register(p.request, p.root);
      const other = copy(p.request); other.work_id = "WORK-OTHER"; deps.register(other, p.root);
      if (kind === "partial") write(path.join(p.root, deps.OUTPUT, "WORK-SOP", "000002.json"), "{");
      else if (kind === "gap") fs.renameSync(path.join(p.root, first.record_path), path.join(p.root, deps.OUTPUT, "WORK-SOP", "000002.json"));
      else if (kind === "copy") { const otherProject = project("copied-repository"); fs.cpSync(path.join(p.root, deps.OUTPUT, "WORK-SOP"), path.join(otherProject.root, deps.OUTPUT, "WORK-SOP"), { recursive: true }); assert.equal(observation(otherProject).status, "held"); continue; }
      else { const record = JSON.parse(fs.readFileSync(path.join(p.root, first.record_path))); record.request.sources[0].required = false; json(path.join(p.root, first.record_path), record); }
      const results = deps.inspect(p.root).results;
      assert.equal(results.find(row => row.work_id === "WORK-SOP").status, "held");
      assert.equal(results.find(row => row.work_id === "WORK-OTHER").status, "registered_inputs_current");
      assert.throws(() => refresh(p, first));
    }
  });
  check("cycles are rejected in requests and conservatively held in externally edited local state", () => {
    const p = project("cycle"), request = copy(p.request);
    request.upstream = [{ work_id: request.work_id, record_sha256: "0".repeat(64), required: true }];
    invalid(request, "request", "KNOWLEDGE_DEPENDENCY_CYCLE");
    const a = deps.register(p.request, p.root), bRequest = { ...copy(p.request), work_id: "WORK-B", upstream: [{ work_id: "WORK-SOP", record_sha256: a.record_sha256, required: true }] };
    const b = deps.register(bRequest, p.root), file = path.join(p.root, a.record_path), record = JSON.parse(fs.readFileSync(file));
    record.request.upstream = [{ work_id: "WORK-B", record_sha256: b.record_sha256, required: true }]; record.request_sha256 = deps.digest(record.request); json(file, record);
    assert.equal(observation(p).status, "held"); assert.equal(observation(p, "WORK-B").status, "held");
  });
  check("unsafe sources hardlinks oversized files nested repositories and output symlinks fail closed", () => {
    for (const relative of [".env", ".git/config", "../policy.md", "notes/.secret", ".cannae/knowledge/terminology.json", "node_modules/policy.md"]) {
      const request = copy(sample); request.sources[0].path = relative;
      invalid(request, "request", "KNOWLEDGE_DEPENDENCY_SOURCE_PATH_INVALID");
    }
    const p = project("unsafe"), source = path.join(p.root, "policy.md"), saved = path.join(p.root, "saved.md"); fs.renameSync(source, saved);
    for (const kind of ["link", "hardlink"]) {
      if (kind === "link") fs.symlinkSync(saved, source); else fs.linkSync(saved, source);
      assert.throws(() => deps.register(p.request, p.root), /TERMINOLOGY_(PATH|FILE)_INVALID/); fs.unlinkSync(source);
    }
    fs.renameSync(saved, source); fs.writeFileSync(source, Buffer.alloc(4 * 1024 * 1024 + 1));
    assert.throws(() => deps.register(p.request, p.root), /FILE_INVALID/);
    fs.writeFileSync(source, "Policy version one.\n");
    const child = path.join(p.root, "nested"); fs.mkdirSync(child); spawnSync("git", ["init", "-q", child], { env });
    write(path.join(child, "policy.md"), "Policy version one.\n"); p.request.sources[0].path = "nested/policy.md";
    assert.throws(() => deps.register(p.request, p.root), /SOURCE_REPOSITORY_MISMATCH/);
    p.request.sources[0].path = "policy.md";
    const outside = project("outside"); fs.symlinkSync(outside.root, path.join(p.root, ".cannae"));
    assert.throws(() => deps.register(p.request, p.root), /DIRECTORY_INVALID/);
  });
  check("exact private outputs must be ignored and a tracked exception is not accepted", () => {
    const p = project("ignore"); fs.writeFileSync(path.join(p.root, ".gitignore"), "");
    assert.throws(() => deps.register(p.request, p.root), /OUTPUT_NOT_IGNORED/);
    assert(!fs.existsSync(path.join(p.root, deps.OUTPUT)));
    fs.writeFileSync(path.join(p.root, ".gitignore"), ".cannae/\n");
    const result = deps.register(p.request, p.root);
    assert.equal(spawnSync("git", ["-C", p.root, "add", "-f", result.record_path], { env }).status, 0);
    const request = refresh(p, result).request;
    fs.writeFileSync(path.join(p.root, ".gitignore"), ".cannae/*\n!.cannae/knowledge/\n.cannae/knowledge/*\n!.cannae/knowledge/dependencies/\n");
    assert.throws(() => deps.register(request, p.root), /OUTPUT_NOT_IGNORED/);
  });
  check("source mutation during read and after publication is never reported as current", () => {
    const p = project("mutating"), source = path.join(p.root, "policy.md"), read = fs.readSync; let changed = false;
    fs.readSync = function(...args) { const n = read.apply(fs, args); if (!changed) { changed = true; fs.appendFileSync(source, "changed"); } return n; };
    try { assert.throws(() => deps.register(p.request, p.root), /FILE_CHANGED/); } finally { fs.readSync = read; }
    fs.writeFileSync(source, "Policy version one.\n");
    const sync = fs.fsyncSync;
    fs.fsyncSync = function(...args) { const result = sync.apply(fs, args); fs.appendFileSync(source, "changed after write"); return result; };
    try { assert.equal(deps.register(p.request, p.root).results[0].status, "held"); } finally { fs.fsyncSync = sync; }
  });
  check("competing publication cannot overwrite the chosen numeric version", () => {
    const p = project("competing"), open = fs.openSync; let injected = false;
    fs.openSync = function(file, mode, ...args) {
      if (mode === "wx" && !injected) { injected = true; fs.writeFileSync(file, "Partial competing writer", { flag: "wx" }); }
      return open.call(fs, file, mode, ...args);
    };
    try { assert.throws(() => deps.register(p.request, p.root), /CONCURRENT_VERSION/); } finally { fs.openSync = open; }
    assert.equal(observation(p).status, "held");
    assert.equal(fs.readFileSync(path.join(p.root, deps.OUTPUT, "WORK-SOP", "000001.json"), "utf8"), "Partial competing writer");
  });
  check("invalid selectors nested records and review/authority claims are rejected by the validator", () => {
    const p = withTerms(project("validator"));
    const bad = copy(p.request); bad.terminology.required_terms = ["not selected"];
    invalid(bad, "request", "KNOWLEDGE_DEPENDENCY_TERMS_INVALID");
    const role = copy(p.request); role.terminology.role = "USER";
    invalid(role, "request", "KNOWLEDGE_DEPENDENCY_READER_INVALID");
    const result = deps.register(p.request, p.root), record = JSON.parse(fs.readFileSync(path.join(p.root, result.record_path)));
    record.request.review_reference = null; record.request_sha256 = deps.digest(record.request);
    invalid(record, "record", "KNOWLEDGE_DEPENDENCY_REVIEW_REQUIRED");
    record.transfer_authorized = true; invalid(record, "record", "CONST_MISMATCH");
  });
  check("same-path Git replacement and metadata credential values cannot silently refresh a record", () => {
    const p = project("root replacement"), first = deps.register(p.request, p.root);
    fs.renameSync(path.join(p.root, ".git"), path.join(p.root, "prior-git"));
    assert.equal(spawnSync("git", ["init", "-q", p.root], { env }).status, 0);
    assert.equal(observation(p).status, "held"); assert.throws(() => refresh(p, first), /HISTORY_BINDING_INVALID/);
    const secret = copy(sample); secret.review_reference = 'password="synthetic-hunter2"';
    invalid(secret, "request", "KNOWLEDGE_DEPENDENCY_CONTENT_REVIEW_REQUIRED");
  });
  for (const provider of ["codex-skills", ".claude/skills"]) check(provider + " linked and copied helpers register inspect and prepare from unrelated cwd", () => {
    const source = path.join(ROOT, provider, "controls-doctrine-operator"), linked = path.join(temp, provider.replaceAll("/", "-") + "-link"), copied = linked + "-copy";
    fs.symlinkSync(source, linked); fs.cpSync(source, copied, { recursive: true }); write(path.join(copied, ".cannae-os-root"), ROOT + "\n");
    for (const directory of [linked, copied]) {
      const p = project(path.basename(directory) + "-project"), relative = deps.DRAFTS + "/initial.json";
      json(path.join(p.root, relative), p.request); const bytes = fs.readFileSync(path.join(p.root, relative));
      const wrapper = path.join(directory, "scripts/project_terminology.js");
      const registered = cli(wrapper, ["register-dependencies", "--repository", p.root, "--request", relative, "--request-sha256", hash(bytes)]);
      assert.equal(cli(wrapper, ["inspect-dependencies", "--repository", p.root]).results[0].status, "registered_inputs_current");
      assert.equal(cli(wrapper, ["prepare-dependency-refresh", "--repository", p.root, "--work-id", "WORK-SOP", "--record-sha256", registered.record_sha256]).status, "refresh_draft_pending_appraisal");
      assert.equal(cli(wrapper, ["register-dependencies", "--repository", p.root, "--request", relative, "--request-sha256", "0".repeat(64)], 1), "KNOWLEDGE_DEPENDENCY_REQUEST_STALE");
      assert.equal(cli(wrapper, ["inspect-dependencies", "--repository", p.root, "--approve", "true"], 1), "KNOWLEDGE_DEPENDENCY_USAGE");
    }
  });
  console.log(JSON.stringify({ valid: true, fixtures: passed, native_model_calls: 0, semantic_discovery_tested: false, protected_storage_tested: false }));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
