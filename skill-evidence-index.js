#!/usr/bin/env node
const path = require("node:path");
const { identity, readBoundFile } = require("./project-terminology");

const MAX_FILE = 64 * 1024 * 1024, MAX_TOTAL = 256 * 1024 * 1024;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = code => { throw new Error("SKILL_EVIDENCE_" + code); };
const keys = (value, names) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const relativePath = value => typeof value === "string" && value.length > 0 && value.length <= 1024 &&
  !/[\\:\x00-\x1f\x7f]/.test(value) && !path.isAbsolute(value) &&
  value.split("/").every(part => part && ![".", "..", ".git"].includes(part));
const flags = () => ({ recorded_commands_executed: false, result_semantics_verified: false,
  revision_attribution_verified: false, semantic_acceptance: false, merge_authorized: false });

function validateIndex(value) {
  if (!keys(value, ["version", "cycle", "repository", "entries"]) || value.version !== 1 ||
      typeof value.cycle !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.cycle) ||
      !keys(value.repository, ["root", "git_directory", "device", "inode", "git_device", "git_inode"]) ||
      !Array.isArray(value.entries) || !value.entries.length || value.entries.length > 512) fail("INDEX_INVALID");
  const ids = new Set(), limits = new Map();
  for (const entry of value.entries) {
    if (!keys(entry, ["id", "criteria", "scope", "recorded_outcome", "source_revision", "command", "source_files", "evidence_files"]) ||
        !/^[A-Z][A-Z0-9-]{0,79}$/.test(entry.id) || ids.has(entry.id) ||
        !Array.isArray(entry.criteria) || !entry.criteria.length || entry.criteria.some(id => !/^SR(?:0[1-9]|1[0-8])$/.test(id)) ||
        new Set(entry.criteria).size !== entry.criteria.length ||
        !["focused", "full_integration", "native", "source_appraisal"].includes(entry.scope) ||
        !["pass", "fail", "incomplete", "not_run"].includes(entry.recorded_outcome) ||
        !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(entry.source_revision) ||
        !(entry.command === null || (Array.isArray(entry.command) && entry.command.length > 0 && entry.command.length <= 128 &&
          entry.command.every(arg => typeof arg === "string" && arg.length > 0 && arg.length <= 4096 && !/[\x00\r\n]/.test(arg))))) fail("ENTRY_INVALID");
    ids.add(entry.id);
    for (const name of ["source_files", "evidence_files"]) {
      const files = entry[name];
      if (!Array.isArray(files) || files.length > 256 || new Set(files.map(file => file?.path)).size !== files.length ||
          (name === "source_files" && !files.length) ||
          (name === "evidence_files" && (entry.recorded_outcome === "not_run" ? files.length !== 0 : !files.length))) fail("FILES_INVALID");
      for (const file of files) {
        if (!keys(file, ["path", "sha256", "bytes"]) || !relativePath(file.path) ||
            !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_FILE) fail("FILE_BINDING_INVALID");
        limits.set(file.path, Math.max(limits.get(file.path) || 0, file.bytes));
      }
    }
  }
  if (limits.size > 1024 || [...limits.values()].reduce((sum, bytes) => sum + bytes, 0) > MAX_TOTAL) fail("INVENTORY_LIMIT");
  return limits;
}

function observe(root, file, maximum) {
  try {
    const result = readBoundFile(root, file, Math.min(MAX_FILE, maximum + 1));
    return { state: "available", sha256: result.digest, bytes: result.bytes.length };
  } catch (error) {
    return { state: error.message === "TERMINOLOGY_MISSING" ? "missing" : "unsafe_or_unavailable", sha256: null, bytes: null };
  }
}

function inspectIndex(repository, indexPath) {
  if (!relativePath(indexPath)) fail("INDEX_PATH_INVALID");
  const inspectorSources = ["skill-evidence-index.js", "project-terminology.js"].map(file => {
    const value = readBoundFile(__dirname, file);
    return { path: file, sha256: value.digest, bytes: value.bytes.length };
  });
  const origin = identity(repository), original = readBoundFile(origin.root, indexPath);
  let index;
  try { index = JSON.parse(original.bytes); } catch { fail("JSON_INVALID"); }
  const limits = validateIndex(index);
  if (!Object.keys(origin).every(key => index.repository[key] === origin[key])) fail("REPOSITORY_MISMATCH");
  if (limits.has(indexPath)) fail("SELF_REFERENCE");
  const before = new Map([...limits].map(([file, maximum]) => [file, observe(origin.root, file, maximum)]));
  const after = new Map([...limits].map(([file, maximum]) => [file, observe(origin.root, file, maximum)]));
  if (readBoundFile(origin.root, indexPath).digest !== original.digest || !equal(origin, identity(repository))) fail("INDEX_OR_REPOSITORY_CHANGED");
  if (inspectorSources.some(file => readBoundFile(__dirname, file.path).digest !== file.sha256)) fail("INSPECTOR_SOURCE_CHANGED");
  const appraisal = file => {
    const actual = after.get(file.path);
    const state = !equal(before.get(file.path), actual) ? "changed_during_inspection" :
      actual.state !== "available" ? actual.state :
      file.sha256 === actual.sha256 && file.bytes === actual.bytes ? "matches" : "content_changed";
    return { ...file, state, observed_sha256: actual.sha256, observed_bytes: actual.bytes };
  };
  const entries = index.entries.map(entry => {
    const sources = entry.source_files.map(appraisal), evidence = entry.evidence_files.map(appraisal);
    return { ...entry, source_files: sources, evidence_files: evidence,
      source_state: sources.every(file => file.state === "matches") ? "matches_declared_files" : "differs_or_unavailable",
      evidence_state: !evidence.length ? "not_recorded" : evidence.every(file => file.state === "matches") ? "retained" : "changed_or_unavailable" };
  });
  return { type: "SkillEvidenceIndexInspection", version: 1, inspected_at: new Date().toISOString(),
    inspection_complete: true, cycle: index.cycle, index_sha256: original.digest, repository: origin, inspector_sources: inspectorSources,
    integrity_ok: entries.every(entry => entry.source_state === "matches_declared_files" && entry.evidence_state === "retained"),
    comparison_basis: "declared_files_only_not_dependency_completeness_or_test_result_appraisal", entries, ...flags() };
}

function main(argv = process.argv.slice(2)) {
  try {
    if (argv.length !== 4) fail("ARGUMENTS_INVALID");
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
      if (!["--repository", "--index"].includes(argv[i]) || Object.hasOwn(args, argv[i]) || !argv[i + 1]) fail("ARGUMENTS_INVALID");
      args[argv[i]] = argv[i + 1];
    }
    const result = inspectIndex(args["--repository"], args["--index"]);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.integrity_ok) process.exitCode = 1;
  } catch (error) {
    const code = /^SKILL_EVIDENCE_[A-Z_]+$/.test(error.message || "") ? error.message : "SKILL_EVIDENCE_INPUT_UNAVAILABLE";
    process.stdout.write(JSON.stringify({ inspection_complete: false, integrity_ok: false, code, ...flags() }) + "\n");
    process.exitCode = 1;
  }
}
module.exports = { inspectIndex, validateIndex, main };
if (require.main === module) main();
