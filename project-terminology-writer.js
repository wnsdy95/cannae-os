#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const terms = require("./project-terminology"), changes = require("./project-terminology-change");
const { lintPayload } = require("./opsec-linter");
const KNOWLEDGE = ".cannae/knowledge", TRANSACTIONS = KNOWLEDGE + "/transactions";
const LOCK = KNOWLEDGE + "/terminology-write.lock.json", MAX_LEDGER = 4 * 1024 * 1024;
const hash = value => createHash("sha256").update(value).digest("hex");
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const flags = () => ({ authorization_verified: false, source_authenticity_verified: false,
  policy_adoption_authorized: false, transfer_authorized: false, can_execute: false });
const fail = code => { throw new Error("TERMINOLOGY_WRITER_" + code); };
const transactionId = (proposal, review) => hash(proposal + "\n" + review);
const transactionPattern = /^\.cannae\/knowledge\/transactions\/([a-f0-9]{64})\/transaction\.json$/;

function writerIssues(value, type) {
  const issues = [], add = code => issues.push({ severity: "error", code: "TERMINOLOGY_WRITER_" + code,
    path: "$", message: "Terminology review or transaction binding failed." });
  if (type === "project-terminology-change-review") {
    const start = Date.parse(value.created_at), end = Date.parse(value.expires_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86400000) add("VALIDITY_INVALID");
    if (!value.review_reference.trim()) add("REVIEW_REFERENCE_EMPTY");
  } else {
    if (value.id !== transactionId(value.proposal_sha256, value.review_sha256)) add("TRANSACTION_ID_MISMATCH");
    if (value.before_ledger_sha256 === value.after_ledger_sha256) add("UNCHANGED_LEDGER");
  }
  if (lintPayload(value).some(row => ["error", "critical"].includes(row.severity))) add("CONTENT_REVIEW_REQUIRED");
  return issues;
}

function directory(root, relative, create = false) {
  let current = root;
  for (const part of relative.split("/")) {
    if (!part || [".", ".."].includes(part) || /[\\:\x00-\x1f]/.test(part)) fail("PATH_INVALID");
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!stat && create) { fs.mkdirSync(current, { mode: 0o700 }); stat = fs.lstatSync(current); }
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) fail("PATH_INVALID");
    if (!stat && !create) fail("DIRECTORY_MISSING");
  }
  return current;
}

function ignored(root, relatives) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  for (const relative of relatives) {
    const result = spawnSync("git", ["-C", root, "check-ignore", "--quiet", "--", relative],
      { env, timeout: 5000, encoding: "utf8" });
    if (result.status !== 0) fail("OUTPUT_NOT_IGNORED");
  }
}

function syncDirectory(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function createFile(root, relative, bytes) {
  ignored(root, [relative]); directory(root, path.posix.dirname(relative));
  const fd = fs.openSync(path.join(root, relative), fs.constants.O_WRONLY | fs.constants.O_CREAT |
    fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function readJson(root, relative, maximum, expected) {
  const stored = terms.readBoundFile(root, relative, maximum);
  if (expected !== undefined && stored.digest !== expected) fail("DIGEST_MISMATCH");
  return { ...stored, value: changes.parse(stored.bytes) };
}

function current(root, expected) {
  const state = changes.currentLedger(root, expected);
  const bytes = expected === null ? Buffer.from("null\n") : terms.readBoundFile(root, terms.RELATIVE).bytes;
  if (expected !== null && hash(bytes) !== expected) fail("BASE_CHANGED");
  return { ...state, bytes };
}

function assessment(review, proposal, checkTime = false) {
  changes.validate(review, "project-terminology-change-review");
  if (review.decision !== "append") fail("REVIEW_NOT_APPEND");
  const expected = { candidate: "candidate_only", confirmed: "explicit_user_definition", retired: "explicit_user_retirement" }[proposal.entry.status];
  if (review.source_assessment !== expected || (proposal.entry.status !== "candidate" && proposal.entry.basis.kind === "ai_inference")) fail("ASSESSMENT_MISMATCH");
  if (checkTime && (Date.parse(review.created_at) > Date.now() || Date.parse(review.expires_at) <= Date.now())) fail("REVIEW_NOT_CURRENT");
}

function candidate(root, proposalPath, proposalHash, reviewHash) {
  changes.inspect(root, proposalPath, proposalHash);
  if (!/^[a-f0-9]{64}$/.test(reviewHash || "")) fail("DIGEST_INVALID");
  const proposal = readJson(root, proposalPath, 256 * 1024, proposalHash);
  const review = readJson(root, path.posix.dirname(proposalPath) + "/review.json", 16384, reviewHash);
  assessment(review.value, proposal.value, true);
  if (review.value.proposal_sha256 !== proposalHash) fail("REVIEW_PROPOSAL_MISMATCH");
  return { proposal, review };
}

function readOwner(root) {
  directory(root, KNOWLEDGE);
  const stored = readJson(root, LOCK, 16384), owner = stored.value;
  const keys = ["type", "id", "pid", "hostname", "repository", "transaction_path", "transaction_sha256", "before_sha256", "after_sha256"];
  if (!owner || !equal(Object.keys(owner).sort(), keys.sort()) || owner.type !== "TerminologyWriterLock" ||
      !/^[a-f0-9-]{36}$/.test(owner.id) || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
      typeof owner.hostname !== "string" || !transactionPattern.test(owner.transaction_path) ||
      !/^[a-f0-9]{64}$/.test(owner.transaction_sha256) || !/^[a-f0-9]{64}$/.test(owner.after_sha256) ||
      !(owner.before_sha256 === null || /^[a-f0-9]{64}$/.test(owner.before_sha256)) ||
      !equal(owner.repository, terms.identity(root))) fail("LOCK_INVALID");
  return { ...stored, stat: fs.lstatSync(path.join(root, LOCK), { bigint: true }) };
}

function assertOwner(root, lock) {
  const latest = readOwner(root);
  if (latest.digest !== lock.digest || latest.stat.ino !== lock.stat.ino || latest.stat.dev !== lock.stat.dev) fail("LOCK_CHANGED");
  return latest;
}

function release(root, lock) {
  assertOwner(root, lock);
  fs.unlinkSync(path.join(root, LOCK));
  syncDirectory(path.join(root, KNOWLEDGE));
}

function acquire(root, record, recordHash) {
  const owner = { type: "TerminologyWriterLock", id: randomUUID(), pid: process.pid, hostname: os.hostname(),
    repository: record.repository, transaction_path: TRANSACTIONS + "/" + record.id + "/transaction.json",
    transaction_sha256: recordHash, before_sha256: record.before_ledger_sha256, after_sha256: record.after_ledger_sha256 };
  try { createFile(root, LOCK, encode(owner)); }
  catch (error) { if (error.code === "EEXIST") fail("BUSY"); throw error; }
  syncDirectory(path.join(root, KNOWLEDGE));
  const lock = readOwner(root);
  if (!equal(lock.value, owner)) fail("LOCK_CHANGED");
  return lock;
}

function loadTransaction(repository, relative, expected) {
  const origin = terms.identity(repository), match = transactionPattern.exec(relative || "");
  if (!match || !/^[a-f0-9]{64}$/.test(expected || "")) fail("TRANSACTION_LOCATION_INVALID");
  const record = readJson(origin.root, relative, 16384, expected).value;
  changes.validate(record, "project-terminology-change-transaction");
  if (record.id !== match[1] || !equal(record.repository, origin)) fail("TRANSACTION_ORIGIN_MISMATCH");
  const parent = path.posix.dirname(relative);
  const proposal = readJson(origin.root, parent + "/proposal.json", 256 * 1024, record.proposal_sha256).value;
  const review = readJson(origin.root, parent + "/review.json", 16384, record.review_sha256).value;
  changes.validate(proposal, "project-terminology-change-proposal"); assessment(review, proposal);
  if (review.proposal_sha256 !== record.proposal_sha256 || !equal(proposal.repository, origin) ||
      proposal.request.expected_ledger_sha256 !== record.before_ledger_sha256 || proposal.entry.id !== record.entry_id) fail("TRANSACTION_BINDING_MISMATCH");
  const before = readJson(origin.root, parent + "/before.json", MAX_LEDGER,
    record.before_ledger_sha256 ?? hash(Buffer.from("null\n"))).value;
  if (record.before_ledger_sha256 === null ? before !== null : before === null) fail("SNAPSHOT_INVALID");
  const base = before || { schema_version: "0.1", type: "ProjectTerminology", repository: origin, entries: [] };
  changes.validate(base, "project-terminology");
  const after = readJson(origin.root, parent + "/after.json", MAX_LEDGER, record.after_ledger_sha256).value;
  changes.validate(after, "project-terminology");
  if (!equal(base.repository, origin) || !equal(after, { ...base, entries: [...base.entries, proposal.entry] }) ||
      !equal(proposal.predecessor, base.entries.findLast(entry => entry.concept_id === proposal.entry.concept_id) ?? null)) fail("SNAPSHOT_INVALID");
  return { origin, record, after };
}

function observedLedger(root) {
  try { return terms.read(root); }
  catch (error) { if (error.message !== "TERMINOLOGY_MISSING") throw error; return { value: null, digest: null }; }
}

function inspectAdoption(repository, relative, expected) {
  const { origin, record, after } = loadTransaction(repository, relative, expected), latest = observedLedger(origin.root);
  const state = latest.digest === record.before_ledger_sha256 ? "matches_before" :
    latest.digest === record.after_ledger_sha256 ? "matches_after" :
      equal(latest.value, after) ? "after_content_reencoded" :
        latest.value && latest.value.entries.length > after.entries.length &&
        equal(latest.value.entries.slice(0, after.entries.length), after.entries) ? "extends_after" : "diverged";
  if (state === "diverged") fail("LEDGER_DIVERGED");
  return { status: "adoption_observation", current_state: state, transaction_path: relative,
    transaction_sha256: expected, ledger_sha256: latest.digest, entry_id: record.entry_id,
    canonical_entry_present: state !== "matches_before", canonical_ledger_written: false, ...flags() };
}

function adopt(repository, proposalPath, proposalHash, reviewHash) {
  const origin = terms.identity(repository), root = origin.root;
  const input = candidate(root, proposalPath, proposalHash, reviewHash);
  const base = current(root, input.proposal.value.request.expected_ledger_sha256);
  const after = { ...base.value, entries: [...base.value.entries, input.proposal.value.entry] }, afterBytes = encode(after);
  changes.validate(after, "project-terminology");
  if (afterBytes.length > MAX_LEDGER) fail("LEDGER_TOO_LARGE");
  const id = transactionId(proposalHash, reviewHash), parent = TRANSACTIONS + "/" + id;
  const record = { schema_version: "0.1", type: "ProjectTerminologyChangeTransaction", id, repository: origin,
    proposal_sha256: proposalHash, review_sha256: reviewHash, before_ledger_sha256: base.digest,
    after_ledger_sha256: hash(afterBytes), entry_id: input.proposal.value.entry.id,
    authorization_verified: false, transfer_authorized: false, policy_adoption_authorized: false };
  changes.validate(record, "project-terminology-change-transaction");
  const recordBytes = encode(record), recordHash = hash(recordBytes), relative = parent + "/transaction.json";
  const temporary = KNOWLEDGE + "/.terminology-" + randomUUID() + ".tmp";
  const outputs = [LOCK, terms.RELATIVE, temporary,
    ...["proposal.json", "review.json", "before.json", "after.json", "transaction.json"].map(name => parent + "/" + name)];
  ignored(root, outputs);
  directory(root, KNOWLEDGE);
  const lock = acquire(root, record, recordHash);
  let writeAttempted = false;
  try {
    const fresh = () => {
      assertOwner(root, lock);
      if (!equal(origin, terms.identity(repository))) fail("ROOT_CHANGED");
      ignored(root, outputs);
      candidate(root, proposalPath, proposalHash, reviewHash);
      current(root, base.digest);
    };
    fresh(); directory(root, TRANSACTIONS, true);
    try { fs.mkdirSync(path.join(root, parent), { mode: 0o700 }); }
    catch (error) { if (error.code === "EEXIST") fail("REVIEW_ALREADY_USED"); throw error; }
    const snapshots = { "proposal.json": input.proposal.bytes, "review.json": input.review.bytes,
      "before.json": base.bytes, "after.json": afterBytes, "transaction.json": recordBytes };
    for (const [name, bytes] of Object.entries(snapshots)) { assertOwner(root, lock); createFile(root, parent + "/" + name, bytes); }
    syncDirectory(path.join(root, parent)); syncDirectory(path.join(root, TRANSACTIONS));
    loadTransaction(root, relative, recordHash);
    createFile(root, temporary, afterBytes);
    fresh();
    writeAttempted = true;
    fs.renameSync(path.join(root, temporary), path.join(root, terms.RELATIVE));
    syncDirectory(path.join(root, KNOWLEDGE));
    if (terms.read(root).digest !== record.after_ledger_sha256) fail("WRITE_NOT_CONFIRMED");
    const observed = inspectAdoption(root, relative, recordHash);
    release(root, lock);
    return { ...observed, status: "reviewed_append_completed", canonical_ledger_written: true };
  } catch (error) {
    // Once publication was attempted, preserve the lock for explicit observation/recovery.
    if (!writeAttempted) {
      try { release(root, lock); }
      catch (cleanup) { throw new AggregateError([error, cleanup], "TERMINOLOGY_WRITER_FAILURE_LOCK_RETAINED"); }
    }
    throw error;
  }
}

function processState(owner) {
  if (owner.hostname !== os.hostname()) return "unverifiable";
  try { process.kill(owner.pid, 0); return "running"; }
  catch (error) { return error.code === "ESRCH" ? "exited" : "unverifiable"; }
}

function inspectWriter(repository) {
  const root = terms.identity(repository).root, lock = readOwner(root), owner = lock.value;
  return { status: "writer_lock_present", lock_id: owner.id, transaction_path: owner.transaction_path,
    transaction_sha256: owner.transaction_sha256, process_state: processState(owner), ...flags() };
}

function recover(repository, lockId, transactionHash) {
  const root = terms.identity(repository).root, lock = readOwner(root), owner = lock.value;
  if (owner.id !== lockId || owner.transaction_sha256 !== transactionHash) fail("RECOVERY_BINDING_MISMATCH");
  if (processState(owner) !== "exited") fail("WRITER_NOT_EXITED");
  let state;
  try { state = inspectAdoption(root, owner.transaction_path, transactionHash).current_state; }
  catch (error) {
    if (error.message !== "TERMINOLOGY_MISSING" || observedLedger(root).digest !== owner.before_sha256) throw error;
    state = "incomplete_record_matches_before";
  }
  assertOwner(root, lock);
  if (processState(owner) !== "exited") fail("WRITER_NOT_EXITED");
  release(root, lock);
  return { status: "writer_lock_reconciled", current_state: state, transaction_path: owner.transaction_path,
    transaction_sha256: transactionHash, canonical_ledger_written: false, ...flags() };
}

function main(argv = process.argv.slice(2)) {
  try {
    const [command, ...args] = argv, values = {};
    const required = { "adopt-change": ["repository", "proposal", "proposal-sha256", "review-sha256"],
      "inspect-adoption": ["repository", "transaction", "transaction-sha256"], "inspect-writer": ["repository"],
      "recover-adoption": ["repository", "lock-id", "transaction-sha256"] }[command];
    if (!required || args.length !== required.length * 2) fail("USAGE");
    for (let index = 0; index < args.length; index += 2) {
      const name = args[index].slice(2), value = args[index + 1];
      if (!args[index].startsWith("--") || !required.includes(name) || Object.hasOwn(values, name) || !value || value.startsWith("--")) fail("USAGE");
      values[name] = value;
    }
    const result = command === "adopt-change" ? adopt(values.repository, values.proposal, values["proposal-sha256"], values["review-sha256"]) :
      command === "inspect-adoption" ? inspectAdoption(values.repository, values.transaction, values["transaction-sha256"]) :
        command === "inspect-writer" ? inspectWriter(values.repository) : recover(values.repository, values["lock-id"], values["transaction-sha256"]);
    process.stdout.write(encode(result));
  } catch (error) {
    console.error(/^TERMINOLOGY_[A-Z_]+$/.test(error.message || "") ? error.message : "TERMINOLOGY_WRITER_INPUT_UNAVAILABLE");
    process.exitCode = 1;
  }
}
module.exports = { writerIssues, adopt, inspectAdoption, inspectWriter, recover, main, LOCK, TRANSACTIONS };
if (require.main === module) main();
