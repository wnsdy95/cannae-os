#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const PROVIDERS = ["codex-skills", ".claude/skills"];
const MEMBERS = ["protocol.json", "routing-development.json", "routing-withheld.json",
  "authoring-development.json", "authoring-withheld.json", "reference-development.json", "reference-withheld.json"];
const DIMENSIONS = ["required_tasks", "source_fidelity", "authority_and_disclosure", "unsupported_findings",
  "source_locators", "uncertainty", "output_consistency"];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = message => { throw new Error(`SKILL_EVALUATION_${message}`); };
const keys = (value, names) => value && !Array.isArray(value) && typeof value === "object" &&
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const parse = (bytes, name) => {
  try { return JSON.parse(bytes); } catch { fail(`JSON_INVALID:${name}`); }
};

function readFile(root, name) {
  if (typeof name !== "string" || !name || path.isAbsolute(name) || /[\\\0]/.test(name) ||
      name.split("/").some(part => !part || part === "." || part === "..")) fail("PATH_INVALID");
  let current = fs.realpathSync(root);
  for (const part of name.split("/")) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) fail("SOURCE_SYMLINK");
  }
  if (!fs.statSync(current).isFile() || fs.statSync(current).size > 4 * 1024 * 1024) fail("SOURCE_INVALID");
  return fs.readFileSync(current);
}

function uniqueIds(rows, count) {
  if (!Array.isArray(rows) || rows.length !== count || rows.some(row => !/^[A-Z][A-Z0-9-]{2,39}$/.test(row?.id || "")) ||
      new Set(rows.map(row => row.id)).size !== count) fail("CASE_INVENTORY_INVALID");
}

function validateRouting(rows) {
  uniqueIds(rows, 12);
  for (const row of rows) {
    if (!keys(row, ["id", "family", "query", "options", "expected", "context_measurement"]) ||
        typeof row.family !== "string" || !row.family || typeof row.query !== "string" || !row.query.trim() ||
        row.query.length > 8000 || typeof row.context_measurement !== "boolean") fail("ROUTING_CASE_INVALID");
    const o = row.options, e = row.expected;
    if (!keys(o, ["actor", "role", "department", "authority", "objectives", "sources", "guarded"]) ||
        !["user", "ai"].includes(o.actor) || ![o.role, o.department, o.authority].every(v => v === null ||
          (typeof v === "string" && v.length > 0 && v.length < 100)) ||
        ![o.objectives, o.sources].every(v => Array.isArray(v) && v.every(s => typeof s === "string" && s.length > 0)) ||
        typeof o.guarded !== "boolean" || o.sources.some(s => !/^docs\/[a-z0-9.-]+\.md$/.test(s))) fail("ROUTING_OPTIONS_INVALID");
    if (!keys(e, ["exit_code", "capability", "required_documents", "absent_documents", "error_code"]) ||
        ![0, 2].includes(e.exit_code) || ![null, "covered", "gap_detected"].includes(e.capability) ||
        ![e.required_documents, e.absent_documents].every(v => Array.isArray(v) && v.every(s => typeof s === "string" && s)) ||
        !(e.error_code === null || /^[A-Z][A-Z0-9_]+$/.test(e.error_code)) ||
        e.required_documents.some(s => e.absent_documents.includes(s)) ||
        (e.exit_code === 0 ? e.error_code !== null : e.error_code === null)) fail("EXPECTATION_INVALID");
  }
}

function inspectBundle(directory) {
  const root = fs.realpathSync(directory), manifestBytes = readFile(root, "manifest.json");
  const manifest = parse(manifestBytes, "manifest.json");
  if (!keys(manifest, ["version", "baseline_commit", "members", "withheld_policy"]) || manifest.version !== 1 ||
      !/^[a-f0-9]{40}$/.test(manifest.baseline_commit) || !keys(manifest.members, MEMBERS) ||
      manifest.withheld_policy !== "candidate_freeze_before_execution; no_tuning_exposure") fail("MANIFEST_INVALID");
  const data = {};
  for (const name of MEMBERS) {
    const bytes = readFile(root, name), entry = manifest.members[name];
    if (!keys(entry, ["sha256", "bytes"]) || entry.sha256 !== hash(bytes) || entry.bytes !== bytes.length) fail("MEMBER_CHANGED");
    data[name] = parse(bytes, name);
  }
  for (const split of ["development", "withheld"]) {
    validateRouting(data[`routing-${split}.json`]);
    uniqueIds(data[`authoring-${split}.json`], 4);
    uniqueIds(data[`reference-${split}.json`], 4);
    const tasks = data[`authoring-${split}.json`], refs = data[`reference-${split}.json`];
    if (new Set(tasks.map(row => row.format)).size !== 4 || tasks.some(row =>
      !["sop", "research", "order-report", "handoff"].includes(row.format) ||
      !keys(row, ["id", "format", "request", "sources", "required_outputs"]) ||
      typeof row.request !== "string" || !row.request.trim() || !Array.isArray(row.sources) || !row.sources.length ||
      row.sources.some(s => !keys(s, ["id", "version", "body"]) || ![s.id, s.version, s.body].every(v => typeof v === "string" && v)) ||
      new Set(row.sources.map(s => s.id)).size !== row.sources.length ||
      !Array.isArray(row.required_outputs) || !row.required_outputs.length ||
      row.required_outputs.some(s => typeof s !== "string" || !s))) fail("AUTHORING_CASE_INVALID");
    if (refs.some(row => !keys(row, ["id", "checks"]) || !tasks.some(t => t.id === row.id) ||
      !Array.isArray(row.checks) || !row.checks.length || new Set(row.checks.map(c => c.id)).size !== row.checks.length || row.checks.some(c =>
        !keys(c, ["id", "dimension", "severity", "source_id", "assertion"]) ||
        !["critical", "major", "minor"].includes(c.severity) || !DIMENSIONS.includes(c.dimension) ||
        typeof c.id !== "string" || !c.id || typeof c.assertion !== "string" || !c.assertion ||
        !tasks.find(t => t.id === row.id).sources.some(s => s.id === c.source_id)))) fail("REFERENCE_INVALID");
  }
  for (const family of ["routing", "authoring"]) {
    const all = [...data[`${family}-development.json`], ...data[`${family}-withheld.json`]];
    if (new Set(all.map(row => row.id)).size !== all.length) fail("SPLIT_ID_COLLISION");
  }
  if (data["routing-development.json"].filter(row => row.context_measurement).length !== 6 ||
      data["routing-withheld.json"].some(row => row.context_measurement)) fail("CONTEXT_SUBSET_INVALID");
  const protocol = data["protocol.json"];
  if (protocol.version !== 1 || protocol.routing_count !== 24 || protocol.authoring_count !== 8 ||
      protocol.native_transfer_authorized !== false || protocol.candidate_frozen !== false ||
      JSON.stringify(protocol.dimensions) !== JSON.stringify(DIMENSIONS) || typeof protocol.holdout_limit !== "string" ||
      !protocol.holdout_limit) fail("PROTOCOL_INVALID");
  return { root, manifest, manifest_sha256: hash(manifestBytes), protocol,
    development: data["routing-development.json"], authoring: data["authoring-development.json"] };
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10000 });
  if (result.status !== 0) fail("GIT_INSPECTION_FAILED");
  return result.stdout.trim();
}

function assertBaseline(root, commit) {
  if (git(root, ["rev-parse", "HEAD"]) !== commit ||
      git(root, ["status", "--porcelain", "--untracked-files=normal"])) fail("BASELINE_NOT_CLEAN_PINNED_REVISION");
}

function routerArgs(file, row) {
  const o = row.options;
  return [file, `--actor=${o.actor}`, ...["role", "department", "authority"].filter(k => o[k] !== null).map(k => `--${k}=${o[k]}`),
    ...o.objectives.map(s => `--capability-query=${s}`), ...o.sources.map(s => `--source=${s}`),
    ...(o.guarded ? ["--receipt", "--scope=agent", "--mission=MIS-EVALUATION", "--wave=W1", "--agent=writer"] : []),
    "--", row.query];
}

function assess(row, result) {
  const issues = [], expected = row.expected;
  if (result.status !== expected.exit_code || result.error || result.signal) issues.push("PROCESS_RESULT");
  if (expected.error_code !== null && (String(result.stderr || "").split(":", 1)[0].trim() !== expected.error_code || result.stdout)) issues.push("ERROR_BOUNDARY");
  let output = null;
  if (result.status === 0) {
    try { output = JSON.parse(result.stdout); } catch { issues.push("JSON_OUTPUT"); }
    if (!output || Array.isArray(output) || typeof output !== "object" || !Array.isArray(output.recommended_documents) ||
        !output.operating_mode || !output.capability_routing) { issues.push("ROUTE_OUTPUT_SHAPE"); output = null; }
  }
  if (output) {
    const docs = new Set((output.recommended_documents || []).map(row => row.path));
    if (output.query !== row.query) issues.push("ORIGINAL_QUERY_CHANGED");
    if (expected.capability !== null && output.capability_routing?.status !== expected.capability) issues.push("CAPABILITY_RESULT");
    for (const document of expected.required_documents) if (!docs.has(document)) issues.push(`MISSING:${document}`);
    for (const document of expected.absent_documents) if (docs.has(document)) issues.push(`EXCESS:${document}`);
    for (const key of ["actor", "role", "department", "authority"]) {
      if (output.operating_mode?.[key] !== row.options[key]) issues.push(`CONTEXT_CHANGED:${key}`);
    }
    if (row.options.objectives.length > 1 && JSON.stringify(output.capability_queries) !== JSON.stringify(row.options.objectives)) issues.push("OBJECTIVES_CHANGED");
    const organization = output.capability_routing?.provisional_organization;
    if (organization?.authority_expansion_authorized || organization?.standing_department_activation_authorized) issues.push("AUTHORITY_EXPANSION");
  }
  return { issues, output };
}

function baseline(directory, repository) {
  const bundle = inspectBundle(directory), root = fs.realpathSync(repository);
  assertBaseline(root, bundle.manifest.baseline_commit);
  const results = [], sourceBindings = {};
  for (const provider of PROVIDERS) {
    const router = `${provider}/controls-doctrine-operator/scripts/route_controls_docs.js`;
    const entry = `${provider}/controls-doctrine-operator/SKILL.md`;
    sourceBindings[router] = hash(readFile(root, router));
    sourceBindings[entry] = hash(readFile(root, entry));
    for (const row of bundle.development) {
      const argv = routerArgs(path.join(root, router), row);
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") &&
        !["CANNAE_OS_HOME", "CONTROLS_SKILL_DIR"].includes(key)));
      const result = spawnSync(process.execPath, argv, { cwd: root, env, encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
      const assessed = assess(row, result);
      const inputFiles = [entry, ...(assessed.output?.recommended_documents || []).map(item => item.path)];
      const selected = [...new Set(inputFiles)].map(file => {
        const bytes = readFile(root, file);
        return { path: file, bytes: bytes.length, sha256: hash(bytes) };
      });
      results.push({ provider, case_id: row.id, argv, exit_code: result.status, signal: result.signal,
        process_error: result.error?.code || null, stdout: result.stdout || "", stderr: result.stderr || "",
        issues: assessed.issues, selected_files: selected,
        selected_bytes: selected.reduce((sum, file) => sum + file.bytes, 0),
        context_measurement: row.context_measurement, loaded_instruction_bytes: null });
    }
  }
  assertBaseline(root, bundle.manifest.baseline_commit);
  if (inspectBundle(directory).manifest_sha256 !== bundle.manifest_sha256) fail("BUNDLE_CHANGED_DURING_RUN");
  return { type: "SkillEvaluationBaseline", version: 1, observed_at: new Date().toISOString(),
    baseline_commit: bundle.manifest.baseline_commit, bundle_sha256: bundle.manifest_sha256,
    harness_sha256: hash(fs.readFileSync(__filename)), node_version: process.version,
    source_bindings: sourceBindings, split: "development", case_count: results.length,
    matched_expectations: results.filter(row => row.issues.length === 0).length,
    failed_expectations: results.filter(row => row.issues.length !== 0).length, results,
    native_model_calls: 0, withheld_executions: 0, semantic_acceptance: false, promotion_authorized: false };
}

function main(argv = process.argv.slice(2)) {
  try {
    const [command, ...args] = argv;
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!["--bundle", "--repository"].includes(args[i]) || Object.hasOwn(options, args[i]) ||
          !args[i + 1] || args[i + 1].startsWith("--")) fail("ARGUMENTS_INVALID");
      options[args[i]] = args[i + 1];
    }
    if (!options["--bundle"] || !["inspect", "baseline"].includes(command) ||
        (command === "baseline") !== Boolean(options["--repository"])) fail("ARGUMENTS_INVALID");
    const bundle = inspectBundle(options["--bundle"]);
    if (command === "inspect") {
      console.log(JSON.stringify({ valid: true, manifest_sha256: bundle.manifest_sha256,
        baseline_commit: bundle.manifest.baseline_commit, routing: { development: 12, withheld: 12 },
        authoring: { development: 4, withheld: 4 }, withheld_execution_supported: false,
        native_transfer_authorized: false }, null, 2));
    } else {
      const report = baseline(options["--bundle"], options["--repository"]);
      const file = path.join(bundle.root, `baseline-${randomUUID()}.json`);
      const bytes = JSON.stringify(report, null, 2) + "\n";
      fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ report: file, sha256: hash(bytes), case_count: report.case_count,
        matched_expectations: report.matched_expectations, failed_expectations: report.failed_expectations,
        measurement_completed: true, product_pass: false, native_model_calls: 0, withheld_executions: 0 }, null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (require.main === module) main();
module.exports = { hash, readFile, inspectBundle, validateRouting, routerArgs, assess, baseline, main, MEMBERS, DIMENSIONS };
