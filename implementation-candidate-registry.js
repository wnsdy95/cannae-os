#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { validatePayload } = require("./validator-cli-prototype/validate");

const REGISTRY_PATH = "docs/implementation-candidate-registry.json";
const SELF_FIXTURE = "run-implementation-candidate-registry-fixtures.js";
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function safeFile(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath) ||
      relativePath.includes("\\") || relativePath.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe repository path: ${relativePath}`);
  }
  const realRoot = fs.realpathSync(root);
  const target = path.join(realRoot, relativePath);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || !fs.realpathSync(target).startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`Not a contained regular file: ${relativePath}`);
  }
  return target;
}

function repositoryFiles(root) {
  const result = spawnSync("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Registry inspection requires a Git source inventory.");
  return [...new Set(result.stdout.split("\0").filter(Boolean))].sort();
}

function candidateId(document, key) {
  return `IC-${sha256(`${document}\0${key}`).slice(0, 16)}`;
}

// This is a parser for the corpus's heading-and-list convention, not general Markdown.
function extractCandidates(document, text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let fence = null;
  let start = -1;
  let end = lines.length;
  let level = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const marker = lines[index].match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = lines[index].match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (!heading) continue;
    if (/^(?:\d+\.\s*)?Implementation Candidates$/i.test(heading[2])) {
      if (start !== -1) throw new Error(`Multiple candidate sections in ${document}.`);
      start = index;
      level = heading[1].length;
    } else if (start !== -1 && end === lines.length && heading[1].length <= level) {
      end = index;
    }
  }
  if (start === -1) return null;
  const body = lines.slice(start + 1, end);
  const items = [];
  fence = null;
  for (const line of body) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const item = line.match(/^\s*(?:[-*+] |\d+[.)] )(.+)$/);
    if (item) items.push(item[1].trim());
    else if (/^\s+\S/.test(line) && items.length) items[items.length - 1] += ` ${line.trim()}`;
  }
  if (!items.length) throw new Error(`Empty or unsupported candidate list in ${document}.`);
  const candidates = items.map(description => {
    // Only leading filenames name candidates; inline fixture references are supporting evidence.
    const file = description.match(/^`([^`]+(?:\.(?:json|js|md|html)|\/))`/);
    const key = file ? file[1] : description;
    return { id: candidateId(document, key), source_document: document, candidate_key: key,
      kind: file ? "artifact" : "capability", description };
  });
  if (new Set(candidates.map(item => item.id)).size !== candidates.length) {
    throw new Error(`Duplicate candidate in ${document}.`);
  }
  return { document, section_sha256: sha256(lines.slice(start, end).join("\n")), candidates };
}

function scanCandidates(root) {
  const files = repositoryFiles(root);
  const sources = [];
  for (const document of files.filter(file => file.startsWith("docs/") && file.endsWith(".md"))) {
    const section = extractCandidates(document, fs.readFileSync(safeFile(root, document), "utf8"));
    if (section) sources.push(section);
  }
  return { sources: sources.map(({ candidates: _candidates, ...source }) => source),
    candidates: sources.flatMap(source => source.candidates), files };
}

function compileCheck(command, root, files) {
  const { compileValidationCommand } = require("./skill-mission-controller");
  const control = compileValidationCommand(command, root);
  if (!/^(?:(?:validator-cli|readiness-gate|context-filter|event-replay|alert-router)-prototype\/)?run-[a-z0-9-]+\.js$/.test(control.script_path) ||
      ["run-all-fixtures.js", SELF_FIXTURE].includes(control.script_path) || control.argv.length) {
    throw new Error(`Registry verification requires a dedicated, argument-free fixture suite: ${command}`);
  }
  if (!files.includes(control.script_path)) throw new Error(`Validation script is outside the source inventory: ${control.script_path}`);
  safeFile(root, control.script_path);
  return control;
}

function auditRegistry(registry, root = __dirname) {
  const findings = [];
  const add = (code, message, id = null) => findings.push({ severity: "error", code, id, message });
  const validation = validatePayload(registry, "implementation-candidate-registry");
  if (!validation.valid) return { valid: false, scope: "implementation_candidates_only", verification_executed: false,
    release_authorized: false, execution_authorized: false, findings: validation.issues, entries: [] };
  const scan = scanCandidates(root);
  const sourceMap = new Map(scan.sources.map(source => [source.document, source.section_sha256]));
  const registeredSources = new Map(registry.sources.map(source => [source.document, source.section_sha256]));
  for (const [document, digest] of sourceMap) {
    if (registeredSources.get(document) !== digest) add("CANDIDATE_SOURCE_DRIFT", `Register the current candidate section: ${document}`);
  }
  for (const document of registeredSources.keys()) {
    if (!sourceMap.has(document)) add("CANDIDATE_SOURCE_REMOVED", `Registered source no longer has a candidate section: ${document}`);
  }
  const scanned = new Map(scan.candidates.map(candidate => [candidate.id, candidate]));
  const registered = new Map(registry.entries.map(entry => [entry.id, entry]));
  for (const candidate of scan.candidates) {
    if (!registered.has(candidate.id)) add("CANDIDATE_UNREGISTERED", `Unregistered requirement: ${candidate.candidate_key}`, candidate.id);
  }
  const rows = [];
  for (const entry of registry.entries) {
    const source = scanned.get(entry.id);
    if (!source || entry.source_document !== source.source_document || entry.candidate_key !== source.candidate_key || entry.kind !== source.kind) {
      add("CANDIDATE_IDENTITY_MISMATCH", "Entry must bind an exact current source requirement and deterministic ID.", entry.id);
    }
    for (const file of entry.implementation_paths) {
      try {
        if (!scan.files.includes(file)) throw new Error("not in source inventory");
        safeFile(root, file);
      } catch (error) { add("CANDIDATE_IMPLEMENTATION_MISSING", `${file}: ${error.message}`, entry.id); }
    }
    for (const criterion of entry.acceptance_criteria) {
      for (const command of criterion.validation_commands) {
        try { compileCheck(command, root, scan.files); }
        catch (error) { add("CANDIDATE_CHECK_UNSAFE", error.message, entry.id); }
      }
    }
    const proposedPaths = entry.kind === "artifact" ? scan.files.filter(file => file === entry.candidate_key ||
      (entry.candidate_key.endsWith("/") && file.startsWith(entry.candidate_key)) ||
      (!entry.candidate_key.includes("/") && path.basename(file) === entry.candidate_key)) : [];
    rows.push({ id: entry.id, candidate_key: entry.candidate_key, source_document: entry.source_document,
      workstream_id: entry.workstream_id, implementation_status: entry.implementation_status,
      proposed_path_present: proposedPaths.length > 0, proposed_path_matches: proposedPaths,
      implementation_paths: entry.implementation_paths, remaining_work: entry.remaining_work });
  }
  return { valid: !findings.length, scope: "implementation_candidates_only", verification_executed: false,
    registry_sha256: sha256(JSON.stringify(registry)), source_count: scan.sources.length,
    candidate_count: scan.candidates.length,
    declared_status_counts: Object.fromEntries(["planned", "partial", "implemented"].map(status =>
      [status, rows.filter(row => row.implementation_status === status).length])),
    remaining_count: rows.filter(row => row.implementation_status !== "implemented").length,
    release_authorized: false, execution_authorized: false, findings, entries: rows };
}

function verifyRegistry(registry, root = __dirname, options = {}) {
  const { repositoryStateDigest } = require("./skill-mission-controller");
  const before = repositoryStateDigest(root);
  const audit = auditRegistry(registry, root);
  if (!audit.valid) return { ...audit, verification_status: "blocked", checks: [] };
  if (repositoryStateDigest(root) !== before) return { ...audit, valid: false, verification_status: "blocked",
    repository_state_sha256: before, repository_unchanged: false, checks: [],
    findings: [{ severity: "error", code: "CANDIDATE_AUDIT_DRIFT", message: "Source changed during the candidate audit; rerun from a stable tree." }] };
  if (process.env.CANNAE_REGISTRY_VERIFY === "1") throw new Error("Recursive registry verification is prohibited.");
  if (options.workstream && !registry.workstreams.some(item => item.id === options.workstream)) throw new Error("Unknown workstream filter.");
  if (options.candidate && !registry.entries.some(item => item.id === options.candidate)) throw new Error("Unknown candidate filter.");
  const selected = registry.entries.filter(entry => (!options.workstream || entry.workstream_id === options.workstream) &&
    (!options.candidate || entry.id === options.candidate));
  if (!selected.length) throw new Error("The verification selection is empty.");
  const inventory = repositoryFiles(root);
  const commands = [...new Set(selected.flatMap(entry => entry.acceptance_criteria.flatMap(criterion => criterion.validation_commands)))];
  const checks = [];
  const environment = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "CANNAE_REQUIRE_LIVE_OCI"]
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  environment.CANNAE_REGISTRY_VERIFY = "1";
  for (const command of commands) {
    const control = compileCheck(command, root, inventory);
    const script = safeFile(root, control.script_path);
    const scriptDigest = sha256(fs.readFileSync(script));
    const result = spawnSync(process.execPath, [script], { cwd: root, shell: false,
      timeout: options.timeoutMs || 300000, maxBuffer: 16 * 1024 * 1024, encoding: "utf8", env: environment });
    const unchanged = repositoryStateDigest(root) === before;
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    checks.push({ command, command_sha256: control.command_sha256, script_sha256: scriptDigest,
      exit_code: Number.isInteger(result.status) ? result.status : null,
      status: result.status === 0 && !result.error && unchanged ? "passed" : "failed",
      repository_unchanged: unchanged, stdout_sha256: sha256(stdout), stderr_sha256: sha256(stderr),
      stdout_bytes: Buffer.byteLength(stdout), stderr_bytes: Buffer.byteLength(stderr) });
    if (checks.at(-1).status !== "passed") break;
  }
  const passed = new Set(checks.filter(check => check.status === "passed").map(check => check.command));
  const verified = selected.filter(entry => entry.implementation_status === "implemented" &&
    entry.acceptance_criteria.every(criterion => criterion.validation_commands.every(command => passed.has(command))));
  const unchanged = repositoryStateDigest(root) === before;
  const success = checks.length === commands.length && checks.every(check => check.status === "passed") && unchanged;
  return { ...audit, valid: success, verification_executed: checks.length > 0,
    verification_status: !commands.length ? "no_executable_checks" : success ? "passed" : "failed",
    selected_candidate_ids: selected.map(entry => entry.id),
    verified_implemented_ids: success ? verified.map(entry => entry.id) : [],
    selected_scope_complete: success && selected.every(entry => verified.includes(entry)),
    entire_registry_complete: success && selected.length === registry.entries.length && verified.length === registry.entries.length,
    repository_state_sha256: before, repository_unchanged: unchanged, checks };
}

function main(argv = process.argv.slice(2)) {
  try {
    const [command = "audit", ...args] = argv;
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      if (!["--root", "--registry", "--workstream", "--candidate"].includes(args[index]) || !args[index + 1]) {
        throw new Error("Usage: node implementation-candidate-registry.js scan|audit|verify [--root <repo>] [--registry <relative-json>] [--workstream <id>] [--candidate <id>]");
      }
      if (options[args[index].slice(2)]) throw new Error(`Duplicate option: ${args[index]}`);
      options[args[index].slice(2)] = args[index + 1];
    }
    const root = fs.realpathSync(options.root || __dirname);
    let result;
    if (command === "scan") {
      const scan = scanCandidates(root);
      result = { sources: scan.sources, candidates: scan.candidates };
    } else if (["audit", "verify"].includes(command)) {
      const registry = JSON.parse(fs.readFileSync(safeFile(root, options.registry || REGISTRY_PATH), "utf8"));
      result = command === "audit" ? auditRegistry(registry, root) : verifyRegistry(registry, root, options);
    } else throw new Error(`Unknown registry command: ${command}`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.valid === false) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = { REGISTRY_PATH, auditRegistry, candidateId, extractCandidates, safeFile, scanCandidates, verifyRegistry };
