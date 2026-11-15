#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { TextDecoder } = require("node:util");

const RELATIVE = ".cannae/knowledge/terminology.json";
const TYPE = "project-terminology";
const normalize = value => value.normalize("NFC").trim().toLowerCase();
const hash = value => createHash("sha256").update(value).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = code => { throw new Error(`TERMINOLOGY_${code}`); };

function terminologyIssues(value) {
  const issues = [], ids = new Set(), latest = new Map();
  const add = (code, index) => issues.push({ severity: "error", code: `TERMINOLOGY_${code}`,
    path: `$.entries[${index}]`, message: "Terminology provenance or revision boundary failed." });
  for (const [index, entry] of value.entries.entries()) {
    const strings = [entry.term, entry.definition, entry.scope.domain, entry.basis.reference, entry.basis.excerpt,
      ...entry.aliases, ...entry.allowed_departments, ...(entry.scope.task === null ? [] : [entry.scope.task])];
    if (strings.some(item => !item.trim())) add("EMPTY_TEXT", index);
    if (ids.has(entry.id)) add("DUPLICATE_ID", index);
    ids.add(entry.id);
    if (entry.status !== "candidate" && entry.basis.kind === "ai_inference") add("INFERRED_DECISION", index);
    const names = [entry.term, ...entry.aliases].map(normalize);
    if (new Set(names).size !== names.length) add("DUPLICATE_ALIAS", index);
    const previous = latest.get(entry.concept_id);
    if (entry.version !== (previous ? previous.version + 1 : 1) || entry.supersedes !== (previous?.id ?? null)) {
      add("REVISION_CHAIN", index);
    }
    if (previous && ((entry.scope.domain !== previous.scope.domain || entry.scope.task !== previous.scope.task) ||
        (entry.status === "candidate" && (!same(entry.allowed_roles, previous.allowed_roles) ||
          !same(entry.allowed_departments, previous.allowed_departments))))) add("SCOPE_CHANGE", index);
    latest.set(entry.concept_id, entry);
  }
  return issues;
}

function validate(value) {
  const result = require("./validator-cli-prototype/validate").validatePayload(value, TYPE);
  if (!result.valid) fail("INVALID");
  return result;
}

function identity(repository) {
  try {
    if (!path.isAbsolute(repository)) fail("ROOT_INVALID");
    const root = fs.realpathSync(repository);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
    const git = args => spawnSync("git", ["-C", root, ...args], { env, encoding: "utf8", timeout: 5000, maxBuffer: 65536 });
    const top = git(["rev-parse", "--show-toplevel"]), directory = git(["rev-parse", "--absolute-git-dir"]);
    if (top.status !== 0 || directory.status !== 0 || fs.realpathSync(top.stdout.trim()) !== root) fail("ROOT_INVALID");
    const gitDirectory = fs.realpathSync(directory.stdout.trim());
    const rootStat = fs.statSync(root, { bigint: true }), gitStat = fs.statSync(gitDirectory, { bigint: true });
    return { root, git_directory: gitDirectory, device: String(rootStat.dev), inode: String(rootStat.ino),
      git_device: String(gitStat.dev), git_inode: String(gitStat.ino) };
  } catch { fail("ROOT_INVALID"); }
}

function readBoundFile(root, relative, maximum = 4 * 1024 * 1024) {
  if (typeof relative !== "string" || !relative || /[\\\\:\x00-\x1f]/.test(relative) ||
      relative.startsWith("/") || relative.split("/").some(part => !part || [".", ".."].includes(part))) fail("PATH_INVALID");
  let file = root, fd;
  try {
    for (const component of relative.split("/")) {
      file = path.join(file, component);
      if (fs.lstatSync(file).isSymbolicLink()) fail("PATH_INVALID");
    }
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(maximum)) fail("FILE_INVALID");
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let size = 0, count;
    do { count = fs.readSync(fd, buffer, size, buffer.length - size, null); size += count; }
    while (count && size < buffer.length);
    if (size > maximum) fail("FILE_INVALID");
    if (size !== Number(before.size)) fail("FILE_CHANGED");
    const after = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(file, { bigint: true });
    if (["dev", "ino", "nlink", "size", "mtimeNs", "ctimeNs"].some(key => before[key] !== after[key] || after[key] !== named[key]) ||
        named.isSymbolicLink() || fs.realpathSync(file) !== file) fail("FILE_CHANGED");
    const bytes = buffer.subarray(0, size);
    return { bytes, digest: hash(bytes) };
  } catch (error) {
    if (/^TERMINOLOGY_[A-Z_]+$/.test(error.message)) throw error;
    fail(error.code === "ENOENT" ? "MISSING" : "UNAVAILABLE");
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function read(repository) {
  const origin = identity(repository), { bytes, digest } = readBoundFile(origin.root, RELATIVE);
  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("UNAVAILABLE"); }
  validate(value);
  if (Object.keys(origin).some(key => value.repository[key] !== origin[key])) fail("ROOT_MISMATCH");
  return { value, digest };
}

function select(value, options) {
  validate(value);
  const { domain, task = null, actor, role = null, department = null, terms } = options;
  if (!domain?.trim() || (task !== null && !task.trim()) || !["user", "ai"].includes(actor) ||
      (actor === "ai" && (!role?.trim() || !department?.trim() || ["USER", "COMMANDER"].includes(role))) ||
      (actor === "user" && (role !== null || department !== null)) ||
      !Array.isArray(terms) || !terms.length || terms.length > 32 || terms.some(term => typeof term !== "string" || !term.trim())) fail("SELECTION_INVALID");
  const wanted = [...new Set(terms.map(normalize))], groups = new Map();
  for (const entry of value.entries) {
    if (entry.scope.domain !== domain || (entry.scope.task !== null && entry.scope.task !== task)) continue;
    if (!groups.has(entry.concept_id)) groups.set(entry.concept_id, []);
    groups.get(entry.concept_id).push(entry);
  }
  const confirmed = [], candidates = [], retired = [];
  const allowed = entry => actor === "user" ||
    (entry.allowed_roles.includes(role) && entry.allowed_departments.includes(department));
  const matches = entry => [entry.term, ...entry.aliases].some(name => wanted.includes(normalize(name)));
  const view = entry => ({ id: entry.id, concept_id: entry.concept_id, version: entry.version,
    scope: entry.scope, term: entry.term, aliases: entry.aliases, definition: entry.definition,
    not_meaning: entry.not_meaning, status: entry.status });
  for (const history of groups.values()) {
    const decision = history.findLast(entry => entry.status !== "candidate");
    const latest = history.at(-1);
    // Current restrictions apply before matching; do not expose historical definitions after revocation.
    if (!allowed(latest)) continue;
    if (decision && allowed(decision) && matches(decision)) {
      (decision.status === "confirmed" ? confirmed : retired).push(view(decision));
    }
    if (latest.status === "candidate" && allowed(latest) && matches(latest)) candidates.push(view(latest));
  }
  const conflicts = wanted.filter(term => confirmed.filter(entry => [entry.term, ...entry.aliases].some(name => normalize(name) === term)).length > 1);
  const missing = wanted.filter(term => ![...confirmed, ...candidates, ...retired]
    .some(entry => [entry.term, ...entry.aliases].some(name => normalize(name) === term)));
  return { type: "ProjectTerminologySelection", status: conflicts.length ? "clarification_required" : "review_candidate",
    selection: { domain, task, actor, role, department, terms }, confirmed, candidates, retired,
    conflicts, unavailable_terms: missing,
    authorization_verified: false, can_execute: false, release_authorized: false,
    receiver_acceptance_verified: false };
}

function projectSelection(repository, options, expectedDigest) {
  const { value, digest } = read(repository);
  if (expectedDigest !== undefined && expectedDigest !== digest) fail("STALE");
  return { ...select(value, options), ledger_sha256: digest };
}

function renderSelection(selection) {
  return JSON.stringify(selection, null, 2) + "\n";
}

function main(argv = process.argv.slice(2)) {
  if (["propose-change", "inspect-change"].includes(argv[0])) return require("./project-terminology-change").main(argv);
  try {
    const [command, ...args] = argv, values = {}, terms = [];
    const names = command === "init" || command === "check" ? ["repository"] : command === "select"
      ? ["repository", "domain", "task", "actor", "role", "department", "term", "expected-sha256"] : [];
    if (!names.length || args.length % 2) fail("USAGE");
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].slice(2), value = args[i + 1];
      if (!args[i].startsWith("--") || !names.includes(key) || !value || value.startsWith("--") ||
          (key !== "term" && Object.hasOwn(values, key))) fail("USAGE");
      if (key === "term") terms.push(value); else values[key] = value;
    }
    if (!values.repository) fail("USAGE");
    if (command === "init") {
      console.log(JSON.stringify({ schema_version: "0.1", type: "ProjectTerminology", repository: identity(values.repository), entries: [] }, null, 2));
      return;
    }
    const result = command === "check"
      ? { status: "structurally_valid", can_execute: false, ledger_sha256: read(values.repository).digest }
      : projectSelection(values.repository, { domain: values.domain, task: values.task, actor: values.actor,
        role: values.role, department: values.department, terms }, values["expected-sha256"]);
    process.stdout.write(renderSelection(result));
  } catch (error) {
    console.error(/^TERMINOLOGY_[A-Z_]+$/.test(error.message) ? error.message : "TERMINOLOGY_UNAVAILABLE");
    process.exitCode = 1;
  }
}

module.exports = { terminologyIssues, identity, read, readBoundFile, select, projectSelection, renderSelection, main, RELATIVE };
if (require.main === module) main();
