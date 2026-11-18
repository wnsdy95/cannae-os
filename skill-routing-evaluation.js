#!/usr/bin/env node

const fs = require("node:fs"), path = require("node:path");
const { spawnSync } = require("node:child_process"), { randomUUID } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const evaluation = require("./skill-evaluation-runner");
const { hash, readFile, inspectBundle, validateRouting, routerArgs, assess } = evaluation;
const PROVIDERS = ["codex-skills", ".claude/skills"];
const SOURCES = ["skill-routing-evaluation.js", "skill-evaluation-runner.js"];
const json = value => JSON.stringify(value, null, 2) + "\n";
const fail = code => { throw new Error("SKILL_ROUTING_EVALUATION_" + code); };
const keys = (value, names) => value && typeof value === "object" && !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...names].sort());
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const commit = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const environment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") &&
  !["CANNAE_OS_HOME", "CONTROLS_SKILL_DIR"].includes(key)));
const runtime = () => ({ node_version: process.version, node_path: process.execPath,
  node_options_sha256: hash(process.env.NODE_OPTIONS || "") });
const harnessSources = () => Object.fromEntries(SOURCES.map(file => [file, hash(readFile(__dirname, file))]));
const loadedHarness = harnessSources();
const inside = (file, root) => file === root || file.startsWith(root + path.sep);

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { env: environment(), encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.signal || result.status !== 0) fail("GIT_UNAVAILABLE");
  return result.stdout.trim();
}

function pin(repository, revision) {
  if (typeof repository !== "string" || !path.isAbsolute(repository) || !commit(revision)) fail("REVISION_REQUIRED");
  const root = fs.realpathSync(repository);
  if (fs.realpathSync(git(root, ["rev-parse", "--show-toplevel"])) !== root ||
      git(root, ["rev-parse", "HEAD"]) !== revision || git(root, ["status", "--porcelain", "--untracked-files=normal"])) {
    fail("REVISION_NOT_CLEAN_PINNED");
  }
  const source_bindings = {};
  for (const provider of PROVIDERS) for (const suffix of ["SKILL.md", "scripts/route_controls_docs.js"]) {
    const file = `${provider}/controls-doctrine-operator/${suffix}`;
    source_bindings[file] = hash(readFile(root, file));
  }
  return { root, revision, tree: git(root, ["rev-parse", "HEAD^{tree}"]), source_bindings };
}

function freezeCandidate(bundlePath, baselinePath, candidatePath, candidateRevision, destination) {
  const bundle = inspectBundle(bundlePath);
  if (candidateRevision === bundle.manifest.baseline_commit) fail("CANDIDATE_EQUALS_BASELINE");
  const baseline = pin(baselinePath, bundle.manifest.baseline_commit), candidate = pin(candidatePath, candidateRevision);
  if (typeof destination !== "string" || !path.isAbsolute(destination)) fail("DESTINATION_INVALID");
  const output = path.join(fs.realpathSync(path.dirname(destination)), path.basename(destination));
  if (output !== path.resolve(destination) || [bundle.root, baseline.root, candidate.root].some(root => inside(output, root))) fail("DESTINATION_INVALID");
  if (!isDeepStrictEqual(loadedHarness, harnessSources())) fail("HARNESS_CHANGED");
  const freeze = { type: "SkillRoutingCandidateFreeze", version: 1, created_at: new Date().toISOString(), output_root: output,
    bundle: { root: bundle.root, sha256: bundle.manifest_sha256 }, baseline, candidate,
    harness_sources: loadedHarness, runtime: runtime(), case_count: 24, process_count: 96, per_process_timeout_ms: 20000,
    total_timeout_ms: 600000, native_transfer_authorized: false, native_model_calls: 0,
    authoring_execution_authorized: false, semantic_acceptance: false, promotion_authorized: false };
  if (!isDeepStrictEqual(pin(baseline.root, baseline.revision), baseline) ||
      !isDeepStrictEqual(pin(candidate.root, candidate.revision), candidate) ||
      inspectBundle(bundle.root).manifest_sha256 !== bundle.manifest_sha256 ||
      !isDeepStrictEqual(loadedHarness, harnessSources())) fail("FREEZE_INPUT_CHANGED");
  const bytes = json(freeze);
  fs.mkdirSync(output, { mode: 0o700 });
  fs.writeFileSync(path.join(output, "freeze.json"), bytes, { flag: "wx", mode: 0o600 });
  return { freeze_path: path.join(output, "freeze.json"), freeze_sha256: hash(bytes),
    candidate_commit: candidateRevision, native_transfer_authorized: false, withheld_executions: 0 };
}

function inspectFreeze(file, expectedDigest) {
  if (typeof file !== "string" || !path.isAbsolute(file) || !digest(expectedDigest) ||
      path.basename(file) !== "freeze.json" || fs.realpathSync(path.dirname(file)) !== path.dirname(file)) fail("FREEZE_BINDING_INVALID");
  const bytes = readFile(path.dirname(file), "freeze.json");
  if (hash(bytes) !== expectedDigest) fail("FREEZE_DIGEST_MISMATCH");
  let freeze;
  try { freeze = JSON.parse(bytes); } catch { fail("FREEZE_INVALID"); }
  if (!keys(freeze, ["type", "version", "created_at", "output_root", "bundle", "baseline", "candidate", "harness_sources", "runtime", "case_count", "process_count",
    "per_process_timeout_ms", "total_timeout_ms", "native_transfer_authorized", "native_model_calls", "authoring_execution_authorized",
    "semantic_acceptance", "promotion_authorized"]) || freeze.type !== "SkillRoutingCandidateFreeze" || freeze.version !== 1 ||
    !Number.isFinite(Date.parse(freeze.created_at)) || freeze.output_root !== path.dirname(file) ||
    !keys(freeze.bundle, ["root", "sha256"]) || !digest(freeze.bundle.sha256) || typeof freeze.bundle.root !== "string" ||
    !path.isAbsolute(freeze.bundle.root) || fs.realpathSync(freeze.bundle.root) !== freeze.bundle.root ||
    freeze.case_count !== 24 || freeze.process_count !== 96 || freeze.per_process_timeout_ms !== 20000 || freeze.total_timeout_ms !== 600000 ||
    freeze.native_transfer_authorized !== false || freeze.native_model_calls !== 0 || freeze.authoring_execution_authorized !== false ||
    freeze.semantic_acceptance !== false || freeze.promotion_authorized !== false) fail("FREEZE_INVALID");
  if (!isDeepStrictEqual(freeze.harness_sources, loadedHarness) || !isDeepStrictEqual(loadedHarness, harnessSources())) fail("HARNESS_CHANGED");
  if (!isDeepStrictEqual(freeze.runtime, runtime())) fail("RUNTIME_CHANGED");
  const bundle = inspectBundle(freeze.bundle.root);
  if (bundle.manifest_sha256 !== freeze.bundle.sha256 || bundle.manifest.baseline_commit !== freeze.baseline?.revision ||
      freeze.candidate?.revision === freeze.baseline.revision) fail("BUNDLE_MISMATCH");
  for (const name of ["baseline", "candidate"]) {
    const bound = freeze[name];
    if (!keys(bound, ["root", "revision", "tree", "source_bindings"]) || !isDeepStrictEqual(pin(bound.root, bound.revision), bound)) fail("REVISION_CHANGED");
    if (inside(file, bound.root)) fail("DESTINATION_INVALID");
  }
  if (inside(file, bundle.root)) fail("DESTINATION_INVALID");
  return { freeze, bundle };
}

function evaluateFrozen(file, expectedDigest) {
  const { freeze, bundle } = inspectFreeze(file, expectedDigest), directory = path.dirname(file);
  // An exclusive marker survives errors/crashes. Reusing this freeze never starts another batch.
  const attempt = { id: randomUUID(), freeze_sha256: expectedDigest, started_at: new Date().toISOString(), native_model_calls: 0 };
  try { fs.writeFileSync(path.join(directory, "attempt.json"), json(attempt), { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code === "EEXIST") fail("ALREADY_ATTEMPTED"); throw error; }
  const report = { type: "SkillRoutingEvaluation", version: 1, ...attempt, baseline_commit: freeze.baseline.revision,
    candidate_commit: freeze.candidate.revision, bundle_sha256: bundle.manifest_sha256, harness_sources: loadedHarness,
    node_version: process.version, holdout_limit: bundle.protocol.holdout_limit, results: [], reserved_inputs_opened: false,
    native_transfer_authorized: false, loaded_instruction_bytes: null, semantic_acceptance: false, promotion_authorized: false };
  const started = Date.now(), monotonic = performance.now();
  let journal, failure = null;
  try {
    journal = fs.openSync(path.join(directory, "results.jsonl"), "wx", 0o600);
    const withheld = JSON.parse(readFile(bundle.root, "routing-withheld.json")); validateRouting(withheld);
    report.reserved_inputs_opened = true;
    for (const phase of ["baseline", "candidate"]) for (const provider of PROVIDERS) {
      const root = freeze[phase].root, router = `${provider}/controls-doctrine-operator/scripts/route_controls_docs.js`;
      for (const [split, rows] of [["development", bundle.development], ["withheld", withheld]]) for (const row of rows) {
        const remaining = freeze.total_timeout_ms - Math.max(Date.now() - started, performance.now() - monotonic);
        if (remaining <= 0) fail("BATCH_DEADLINE");
        const argv = routerArgs(path.join(root, router), row);
        const result = spawnSync(process.execPath, argv, { cwd: root, env: environment(), encoding: "utf8",
          timeout: Math.min(freeze.per_process_timeout_ms, Math.floor(remaining)), maxBuffer: 8 * 1024 * 1024 });
        let assessed;
        try { assessed = assess(row, result); }
        catch { assessed = { issues: ["ASSESSMENT_FAILED"], output: null }; }
        const selected = [];
        const observed = { phase, provider, split, case_id: row.id, argv, exit_code: result.status, signal: result.signal,
          process_error: result.error?.code || null, stdout: result.stdout || "", stderr: result.stderr || "", issues: assessed.issues,
          selected_files: selected, selection_completed: false, selected_bytes: 0, loaded_instruction_bytes: null };
        try {
          if (assessed.issues.includes("ASSESSMENT_FAILED")) fail("ROUTE_ASSESSMENT_FAILED");
          for (const file of new Set([`${provider}/controls-doctrine-operator/SKILL.md`,
            ...(assessed.output?.recommended_documents || []).map(document => document.path)])) {
            const bytes = readFile(root, file); selected.push({ path: file, sha256: hash(bytes), bytes: bytes.length });
          }
          observed.selection_completed = true;
        } finally {
          observed.selected_bytes = selected.reduce((sum, row) => sum + row.bytes, 0);
          fs.writeSync(journal, JSON.stringify(observed) + "\n"); report.results.push(observed);
        }
        if (result.error || result.signal || !Number.isInteger(result.status)) fail("PROCESS_INCOMPLETE");
      }
    }
    inspectFreeze(file, expectedDigest);
    if (Math.max(Date.now() - started, performance.now() - monotonic) >= freeze.total_timeout_ms) fail("BATCH_DEADLINE");
  } catch (error) {
    failure = /^SKILL_(?:ROUTING_)?EVALUATION_[A-Z_:.-]+$/.test(error.message) ? error.message : "SKILL_ROUTING_EVALUATION_UNAVAILABLE";
  } finally { if (journal !== undefined) fs.closeSync(journal); }
  report.completed_at = new Date().toISOString(); report.failure = failure;
  report.measurement_completed = !failure && report.results.length === freeze.process_count;
  report.unexecuted_processes = freeze.process_count - report.results.length;
  report.withheld_executions = report.results.filter(row => row.split === "withheld").length;
  report.counts = Object.fromEntries(["baseline", "candidate"].map(phase => [phase, {
    observed: report.results.filter(row => row.phase === phase).length,
    matched: report.results.filter(row => row.phase === phase && row.issues.length === 0).length }]));
  report.candidate_matches_all = report.measurement_completed && report.counts.candidate.matched === 48;
  const reportPath = path.join(directory, "report.json"), bytes = json(report);
  fs.writeFileSync(reportPath, bytes, { flag: "wx", mode: 0o600 });
  return { report_path: reportPath, report_sha256: hash(bytes), measurement_completed: report.measurement_completed,
    candidate_matches_all: report.candidate_matches_all, counts: report.counts, failure,
    withheld_executions: report.withheld_executions, native_model_calls: 0, semantic_acceptance: false, promotion_authorized: false };
}

function main(argv = process.argv.slice(2)) {
  try {
    const [command, ...args] = argv, options = {};
    const names = command === "freeze-candidate" ? ["--bundle", "--baseline", "--candidate", "--candidate-revision", "--output"]
      : command === "evaluate" ? ["--freeze", "--freeze-sha256"] : [];
    if (!names.length || args.length !== names.length * 2) fail("USAGE");
    for (let i = 0; i < args.length; i += 2) {
      if (!names.includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) fail("USAGE");
      options[args[i]] = args[i + 1];
    }
    const result = command === "freeze-candidate" ? freezeCandidate(options["--bundle"], options["--baseline"], options["--candidate"],
      options["--candidate-revision"], options["--output"]) : evaluateFrozen(options["--freeze"], options["--freeze-sha256"]);
    console.log(json(result));
    if (command === "evaluate" && !result.measurement_completed) process.exitCode = 1;
  } catch (error) {
    console.error(/^SKILL_(?:ROUTING_)?EVALUATION_[A-Z_:.-]+$/.test(error.message) ? error.message : "SKILL_ROUTING_EVALUATION_UNAVAILABLE");
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { freezeCandidate, inspectFreeze, evaluateFrozen, main };
