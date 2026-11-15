#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { TextDecoder } = require("node:util");
const terms = require("./project-terminology");
const { lintPayload } = require("./opsec-linter");

const OUTPUT = ".cannae/knowledge/changes", MAX_INPUT = 128 * 1024;
const hash = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sameScope = (left, right) => left.domain === right.domain && left.task === right.task;
const fail = code => { throw new Error("TERMINOLOGY_CHANGE_" + code); };
const encode = value => JSON.stringify(value, null, 2) + "\n";
const normalize = value => value.normalize("NFC").trim().toLowerCase();
const flags = () => ({ authorization_verified: false, canonical_ledger_written: false,
  confirmation_adopted: false, transfer_authorized: false });

function inputPath(relative, privateKind = "observations") {
  if (typeof relative !== "string" || !relative || /[\\\\:\x00-\x1f]/.test(relative) || relative.startsWith("/")) return false;
  const parts = relative.split("/");
  if (parts.some(part => !part || [".", "..", "node_modules"].includes(part))) return false;
  if (parts[0] === ".cannae") {
    return parts.length > 3 && parts[1] === "knowledge" && parts[2] === privateKind &&
      parts.slice(3).every(part => !part.startsWith("."));
  }
  return parts.every(part => !part.startsWith("."));
}

function nextEntry(request, predecessor) {
  const change = request.change;
  return { id: "TERM-" + hash(JSON.stringify({ request, predecessor })).slice(0, 32),
    concept_id: change.concept_id, version: predecessor ? predecessor.version + 1 : 1,
    supersedes: predecessor?.id ?? null, scope: structuredClone(change.scope),
    term: change.term, aliases: [...change.aliases], definition: change.definition,
    not_meaning: change.not_meaning, status: change.status, basis: structuredClone(change.basis),
    allowed_roles: predecessor ? [...predecessor.allowed_roles] : [],
    allowed_departments: predecessor ? [...predecessor.allowed_departments] : [] };
}

function changeIssues(value, type) {
  const issues = [], add = code => issues.push({ severity: "error", code: "TERMINOLOGY_CHANGE_" + code,
    path: "$", message: "Terminology change boundary or source binding failed." });
  if (type === "project-terminology-change-request") {
    const change = value.change, source = value.source;
    if (!inputPath(source.path)) add("SOURCE_PATH_INVALID");
    if (source.end_byte <= source.start_byte ||
        source.end_byte - source.start_byte !== Buffer.byteLength(change.basis.excerpt)) add("SOURCE_RANGE_INVALID");
    if (change.status !== "candidate" && change.basis.kind === "ai_inference") add("INFERRED_DECISION");
    if (change.status === "retired" && value.expected_ledger_sha256 === null) add("RETIREMENT_WITHOUT_PREDECESSOR");
    const names = [change.term, ...change.aliases].map(normalize);
    if (new Set(names).size !== names.length) add("DUPLICATE_ALIAS");
    if ([change.term, change.definition, change.scope.domain, change.basis.reference, change.basis.excerpt,
      ...change.aliases, ...(change.scope.task === null ? [] : [change.scope.task])].some(text => !text.trim())) add("EMPTY_TEXT");
  } else {
    const request = value.request, previous = value.predecessor;
    if (value.request_sha256 !== hash(JSON.stringify(request)) || !same(value.entry, nextEntry(request, previous))) add("ENTRY_BINDING_MISMATCH");
    if (previous && (request.expected_ledger_sha256 === null || previous.concept_id !== request.change.concept_id ||
        !sameScope(previous.scope, request.change.scope))) add("PREDECESSOR_MISMATCH");
    if (!previous && request.change.status === "retired") add("RETIREMENT_WITHOUT_PREDECESSOR");
  }
  if (lintPayload(value).some(finding => ["error", "critical"].includes(finding.severity))) add("CONTENT_REVIEW_REQUIRED");
  return issues;
}

function validate(value, type) {
  const result = require("./validator-cli-prototype/validate").validatePayload(value, type);
  if (!result.valid) fail("CONTRACT_INVALID");
}

function currentLedger(repository, expected) {
  let current;
  try { current = terms.read(repository); }
  catch (error) {
    if (error.message !== "TERMINOLOGY_MISSING") throw error;
    if (expected !== null) fail("BASE_MISSING");
    return { value: { schema_version: "0.1", type: "ProjectTerminology", repository: terms.identity(repository), entries: [] }, digest: null };
  }
  if (expected !== current.digest) fail("BASE_STALE");
  return current;
}

function compile(request, repository) {
  validate(request, "project-terminology-change-request");
  const origin = terms.identity(repository), current = currentLedger(origin.root, request.expected_ledger_sha256);
  const source = terms.readBoundFile(origin.root, request.source.path, MAX_INPUT);
  if (source.digest !== request.source.sha256) fail("SOURCE_STALE");
  try { new TextDecoder("utf-8", { fatal: true }).decode(source.bytes); }
  catch { fail("SOURCE_ENCODING_INVALID"); }
  const excerpt = Buffer.from(request.change.basis.excerpt);
  if (request.source.end_byte > source.bytes.length ||
      !source.bytes.subarray(request.source.start_byte, request.source.end_byte).equals(excerpt)) fail("SOURCE_EXCERPT_MISMATCH");
  const previous = current.value.entries.findLast(entry => entry.concept_id === request.change.concept_id) ?? null;
  if (previous && !sameScope(previous.scope, request.change.scope)) fail("SCOPE_CHANGE");
  if (!previous && request.change.status === "retired") fail("RETIREMENT_WITHOUT_PREDECESSOR");
  const entry = nextEntry(request, previous);
  validate({ ...current.value, entries: [...current.value.entries, entry] }, "project-terminology");
  const proposal = { schema_version: "0.1", type: "ProjectTerminologyChangeProposal", repository: origin,
    request: structuredClone(request), request_sha256: hash(JSON.stringify(request)), predecessor: previous,
    entry, ...flags() };
  validate(proposal, "project-terminology-change-proposal");
  if (!same(origin, terms.identity(repository))) fail("ROOT_CHANGED");
  return proposal;
}

function outputParent(root, create = false) {
  const walk = make => {
    let directory = root;
    for (const part of OUTPUT.split("/")) {
      directory = path.join(directory, part);
      let stat;
      try { stat = fs.lstatSync(directory); }
      catch (error) { if (error.code !== "ENOENT") fail("OUTPUT_INVALID"); }
      if (!stat && make) { fs.mkdirSync(directory, { mode: 0o700 }); stat = fs.lstatSync(directory); }
      if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) fail("OUTPUT_INVALID");
    }
    return directory;
  };
  const directory = walk(false);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const ignored = spawnSync("git", ["-C", root, "check-ignore", "--no-index", "--quiet", "--", OUTPUT + "/probe"],
    { env, timeout: 5000, encoding: "utf8" });
  if (ignored.status !== 0) fail("OUTPUT_NOT_IGNORED");
  return create ? walk(true) : directory;
}

function parse(bytes) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("INPUT_INVALID"); }
}

function inspect(repository, relative, expected) {
  const origin = terms.identity(repository);
  if (typeof relative !== "string" || !/^\.cannae\/knowledge\/changes\/[a-f0-9-]{36}\/proposal\.json$/.test(relative) ||
      !/^[a-f0-9]{64}$/.test(expected || "")) fail("PROPOSAL_LOCATION_INVALID");
  outputParent(origin.root);
  const stored = terms.readBoundFile(origin.root, relative, 2 * MAX_INPUT);
  if (stored.digest !== expected) fail("PROPOSAL_DIGEST_MISMATCH");
  const proposal = parse(stored.bytes);
  validate(proposal, "project-terminology-change-proposal");
  if (!same(proposal.repository, origin)) fail("ROOT_MISMATCH");
  if (!same(proposal, compile(proposal.request, origin.root))) fail("PROPOSAL_CHANGED");
  return { status: "change_proposal_current_pending_review", proposal_path: relative, proposal_sha256: stored.digest,
    concept_id: proposal.entry.concept_id, proposed_entry_id: proposal.entry.id, proposed_version: proposal.entry.version,
    proposed_status: proposal.entry.status, base_ledger_sha256: proposal.request.expected_ledger_sha256,
    source_authenticity_verified: false, semantic_accuracy_verified: false, can_execute: false, ...flags() };
}

function prepare(request, repository) {
  const origin = terms.identity(repository);
  outputParent(origin.root);
  const proposal = compile(request, origin.root), bytes = encode(proposal);
  if (!same(origin, proposal.repository)) fail("ROOT_CHANGED");
  if (!same(proposal, compile(request, origin.root))) fail("INPUT_CHANGED");
  const id = randomUUID(), directory = path.join(outputParent(origin.root, true), id);
  fs.mkdirSync(directory, { mode: 0o700 });
  const relative = OUTPUT + "/" + id + "/proposal.json";
  fs.writeFileSync(path.join(origin.root, relative), bytes, { flag: "wx", mode: 0o600 });
  // A failed final inspection may leave a private pending candidate, never an adopted entry.
  return inspect(origin.root, relative, hash(bytes));
}

function main(argv = process.argv.slice(2)) {
  try {
    const [command, ...args] = argv, values = {};
    const required = command === "propose-change" ? ["repository", "request"] :
      command === "inspect-change" ? ["repository", "proposal", "proposal-sha256"] : [];
    if (!required.length || args.length !== required.length * 2) fail("USAGE");
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index].slice(2), value = args[index + 1];
      if (!args[index].startsWith("--") || !required.includes(key) || Object.hasOwn(values, key) || !value || value.startsWith("--")) fail("USAGE");
      values[key] = value;
    }
    let result;
    if (command === "inspect-change") result = inspect(values.repository, values.proposal, values["proposal-sha256"]);
    else {
      if (!inputPath(values.request, "change-requests")) fail("REQUEST_PATH_INVALID");
      const root = terms.identity(values.repository).root;
      result = prepare(parse(terms.readBoundFile(root, values.request, MAX_INPUT).bytes), root);
    }
    process.stdout.write(encode(result));
  } catch (error) {
    console.error(/^TERMINOLOGY_[A-Z_]+$/.test(error.message || "") ? error.message : "TERMINOLOGY_CHANGE_INPUT_UNAVAILABLE");
    process.exitCode = 1;
  }
}

module.exports = { changeIssues, compile, prepare, inspect, main, OUTPUT };
if (require.main === module) main();
