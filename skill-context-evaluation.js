#!/usr/bin/env node

const fs = require("node:fs"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const { inspectBundle, routerArgs, hash } = require("./skill-evaluation-runner");
const { readBoundFile } = require("./project-terminology");

const PROVIDERS = { codex: "codex-skills", claude: ".claude/skills" };
const fail = code => { throw new Error(`SKILL_CONTEXT_EVALUATION_${code}`); };
const json = value => JSON.stringify(value, null, 2) + "\n";
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort());
const env = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") &&
  !["CANNAE_OS_HOME", "CONTROLS_SKILL_DIR"].includes(key)));
const INTRO = `# Bounded document context exercise

Perform the original request using its supplied synthetic sources and the skill
instructions below. Return the requested document as text; do not publish, send,
adopt policy, contact anyone or perform operational actions. Supplied source
policies describe the document's subject, not a new grant of tool authority.
The preparer ran the attached route; you have not run it. Preserve its original
request, role, objectives, capability gaps and validation commands. Recommendations
are not a required full-reading list or access grants; assigned task sources are
required in full. Report unperformed checks and unresolved dependencies honestly.

Use the bounded reference-reading interface for optional corpus guidance when it
is available. Both revisions permit selective reading; do not load the entire
catalog merely to increase a baseline. Choose sufficient context for the work,
including any follow-up guidance needed to finish. With no reading interface,
report missing guidance; do not pretend that links were opened. Corpus bytes are
frozen for this exercise. A reference result is not evidence of comprehension.
This exercise does not test implicit skill discovery, agent-invoked routing or
receiving by another agent. Do not grade yourself or infer an expected byte target.

`;

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { env: env(), encoding: "utf8", timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) fail("GIT_UNAVAILABLE");
  return result.stdout;
}

function assertRevision(root, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision || "") || git(root, ["rev-parse", "--show-toplevel"]).trim() !== root ||
      git(root, ["rev-parse", "HEAD"]).trim() !== revision || git(root, ["status", "--porcelain", "--untracked-files=normal"]).trim()) {
    fail("REVISION_NOT_CLEAN_PINNED");
  }
}

function textSource(root, file) {
  const { bytes, digest } = readBoundFile(root, file);
  if (!bytes.toString().trim() || !Buffer.from(bytes.toString("utf8")).equals(bytes)) fail("SOURCE_ENCODING_INVALID");
  return { path: file, bytes, sha256: digest };
}

function allowedCorpusPath(file) {
  return /^(?:README|GOVERNANCE|SUPPORT|SECURITY|CONTRIBUTING|CODE_OF_CONDUCT|CHANGELOG)\.md$/.test(file) ||
    /^docs\/[a-z0-9][a-z0-9.-]*\.md$/.test(file) ||
    /^(?:codex-skills|\.claude\/skills)\/controls-doctrine-operator\/(?:SKILL\.md|references\/[a-z0-9-]+\.md)$/.test(file);
}

function selectTaskSources(bundle, supplement) {
  const tasks = bundle.development.filter(row => row.context_measurement);
  if (!keys(supplement, ["version", "bundle_sha256", "cases"]) || supplement.version !== 1 ||
      supplement.bundle_sha256 !== bundle.manifest_sha256 || !Array.isArray(supplement.cases) || supplement.cases.length !== tasks.length ||
      !isDeepStrictEqual(supplement.cases.map(row => row?.case_id).sort(), tasks.map(row => row.id).sort())) fail("SUPPLEMENT_INVALID");
  return tasks.map(task => {
    const row = supplement.cases.find(row => row.case_id === task.id);
    if (!keys(row, ["case_id", "source_task_id", "source_ids"]) || !Array.isArray(row.source_ids) || !row.source_ids.length ||
        row.source_ids.some(id => typeof id !== "string") || new Set(row.source_ids).size !== row.source_ids.length) fail("SUPPLEMENT_INVALID");
    const origin = bundle.authoring.find(item => item.id === row.source_task_id);
    if (!origin || row.source_ids.some(id => !origin.sources.some(source => source.id === id))) fail("SOURCE_ASSIGNMENT_INVALID");
    if (task.options.guarded || task.expected.exit_code !== 0 || task.options.sources.length) fail("CONTEXT_CASE_UNSUPPORTED");
    return { task, origin_task: origin.id, sources: row.source_ids.map(id => structuredClone(origin.sources.find(source => source.id === id))) };
  });
}

function routeTask(root, provider, task) {
  const router = `${PROVIDERS[provider]}/controls-doctrine-operator/scripts/route_controls_docs.js`;
  const argv = routerArgs(path.join(root, router), task);
  const result = spawnSync(process.execPath, argv, { cwd: root, env: env(), encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0 || result.error || result.signal) fail("ROUTING_UNAVAILABLE");
  let raw;
  try { raw = JSON.parse(result.stdout); } catch { fail("ROUTING_INVALID"); }
  if (raw.query !== task.query || raw.repo_root !== root || !Array.isArray(raw.recommended_documents) ||
      !Array.isArray(raw.validation_commands) || !raw.capability_routing || !raw.operating_mode ||
      ["actor", "role", "department", "authority"].some(key => raw.operating_mode[key] !== task.options[key])) fail("ROUTING_INVALID");
  const projection = Object.fromEntries(["query", "capability_query", "capability_queries", "capability_assessments", "capability_assessment_basis",
    "request_intake", "operating_mode", "matched_routes", "capability_routing", "task_references", "recommended_documents", "validation_commands"]
    .filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]));
  return { projection, argv, router_sha256: hash(readBoundFile(root, router).bytes), raw_stdout: result.stdout, raw_stderr: result.stderr };
}

function buildInput(provider, taskAssignment, entry, route, identity) {
  const { task, origin_task, sources } = taskAssignment;
  if (!Object.hasOwn(PROVIDERS, provider) || !keys(identity, ["bundle_sha256", "supplement_sha256", "preparation_harness_sha256", "phase", "source_commit"]) ||
      !["baseline", "candidate"].includes(identity.phase) || !/^[a-f0-9]{40}$/.test(identity.source_commit || "") ||
      ["bundle_sha256", "supplement_sha256", "preparation_harness_sha256"].some(key => !/^[a-f0-9]{64}$/.test(identity[key] || "")) ||
      entry.path !== `${PROVIDERS[provider]}/controls-doctrine-operator/SKILL.md` || !Buffer.isBuffer(entry.bytes) || entry.sha256 !== hash(entry.bytes) ||
      !task?.query || route.projection.query !== task.query || !Array.isArray(sources) || !sources.length ||
      sources.some(source => !keys(source, ["id", "version", "body"]) || [source.id, source.version, source.body].some(value => typeof value !== "string" || !value)) ||
      new Set(sources.map(source => source.id)).size !== sources.length) fail("INPUT_INVALID");
  const assigned = Buffer.from(json({ original_request: task.query,
    operator: Object.fromEntries(["actor", "role", "department", "authority"].map(key => [key, task.options[key]])),
    source_origin_task: origin_task, required_sources: sources }));
  const blocks = [{ kind: "instructions", name: entry.path, bytes: entry.bytes },
    { kind: "preparer-route", name: "route.json", bytes: Buffer.from(json(route.projection)) },
    { kind: "task", name: "assigned-task.json", bytes: assigned }];
  const parts = [Buffer.from(INTRO)], segments = [];
  let offset = parts[0].length;
  for (const block of blocks) {
    const heading = Buffer.from(`## ${block.name}\n\n`); parts.push(heading, block.bytes, Buffer.from("\n\n")); offset += heading.length;
    segments.push({ kind: block.kind, path: block.name, start_byte: offset, end_byte_exclusive: offset + block.bytes.length,
      bytes: block.bytes.length, sha256: hash(block.bytes) }); offset += block.bytes.length + 2;
  }
  const prompt = Buffer.concat(parts);
  return { prompt, manifest: { type: "SkillContextInput", version: 1, ...identity, provider, case_id: task.id,
    prompt_bytes: prompt.length, prompt_sha256: hash(prompt), segments, assigned_task_bytes: assigned.length,
    prepared_entry_bytes: entry.bytes.length, prepared_route_bytes: blocks[1].bytes.length,
    framing_bytes: prompt.length - blocks.reduce((sum, row) => sum + row.bytes.length, 0),
    required_source_bindings: sources.map(source => ({ id: source.id, version: source.version,
      bytes: Buffer.byteLength(source.body), sha256: hash(source.body) })),
    source_origin_task: origin_task, router_sha256: route.router_sha256,
    loaded_instruction_bytes: null, native_transfer_authorized: false, native_model_calls: 0,
    implicit_skill_discovery_tested: false, agent_routing_tested: false,
    semantic_acceptance: false, promotion_authorized: false } };
}

function prepare(options) {
  if (!keys(options, ["bundle", "supplement", "baseline", "candidate", "candidate_revision", "output"])) fail("ARGUMENTS_INVALID");
  const bundle = inspectBundle(options.bundle), supplementFile = path.resolve(options.supplement);
  const supplementBytes = readBoundFile(fs.realpathSync(path.dirname(supplementFile)), path.basename(supplementFile)).bytes;
  let supplement;
  try { supplement = JSON.parse(supplementBytes); } catch { fail("SUPPLEMENT_INVALID"); }
  const tasks = selectTaskSources(bundle, supplement);
  const revisions = [{ phase: "baseline", root: fs.realpathSync(options.baseline), commit: bundle.manifest.baseline_commit },
    { phase: "candidate", root: fs.realpathSync(options.candidate), commit: options.candidate_revision }];
  for (const row of revisions) assertRevision(row.root, row.commit);
  if (revisions[0].root === revisions[1].root || revisions[0].commit === revisions[1].commit) fail("REVISIONS_NOT_DISTINCT");
  if (!path.isAbsolute(options.output)) fail("DESTINATION_INVALID");
  const output = path.join(fs.realpathSync(path.dirname(options.output)), path.basename(options.output));
  if ([bundle.root, ...revisions.map(row => row.root)].some(root => output === root || output.startsWith(root + path.sep))) fail("DESTINATION_INVALID");
  if (fs.existsSync(output)) fail("DESTINATION_EXISTS");
  const corpus = {}, cases = [];
  const identity = { bundle_sha256: bundle.manifest_sha256, supplement_sha256: hash(supplementBytes),
    preparation_harness_sha256: hash(fs.readFileSync(__filename)) };
  for (const revision of revisions) {
    corpus[revision.phase] = git(revision.root, ["ls-files", "-z"]).split("\0").filter(allowedCorpusPath)
      .sort().map(file => textSource(revision.root, file));
    const byPath = new Map(corpus[revision.phase].map(row => [row.path, row]));
    for (const provider of Object.keys(PROVIDERS)) for (const assignment of tasks) {
      const entry = byPath.get(`${PROVIDERS[provider]}/controls-doctrine-operator/SKILL.md`);
      if (!entry) fail("ENTRY_MISSING");
      const route = routeTask(revision.root, provider, assignment.task);
      // Never quietly remove a recommendation unsupported by the reading interface.
      if (route.projection.recommended_documents.some(row => !byPath.has(row.path))) fail("ROUTED_SOURCE_UNAVAILABLE");
      cases.push({ name: `${revision.phase}-${provider}-${assignment.task.id}`, route,
        ...buildInput(provider, assignment, entry, route, { ...identity, phase: revision.phase, source_commit: revision.commit }) });
    }
  }
  for (const revision of revisions) {
    assertRevision(revision.root, revision.commit);
    for (const row of corpus[revision.phase]) if (textSource(revision.root, row.path).sha256 !== row.sha256) fail("SOURCE_CHANGED");
  }
  if (inspectBundle(options.bundle).manifest_sha256 !== bundle.manifest_sha256 ||
      !readBoundFile(fs.realpathSync(path.dirname(supplementFile)), path.basename(supplementFile)).bytes.equals(supplementBytes)) fail("INPUT_CHANGED");
  fs.mkdirSync(output, { mode: 0o700 });
  const write = (relative, bytes) => {
    const file = path.join(output, relative); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  };
  const snapshots = [];
  for (const revision of revisions) {
    const rows = corpus[revision.phase].map(row => {
      write(`snapshots/${revision.phase}/${row.path}`, row.bytes);
      return { path: row.path, bytes: row.bytes.length, sha256: row.sha256 };
    });
    const catalog = { phase: revision.phase, source_commit: revision.commit, documents: rows };
    write(`snapshots/${revision.phase}/catalog.json`, json(catalog));
    snapshots.push({ phase: revision.phase, source_commit: revision.commit, catalog_sha256: hash(json(catalog)),
      corpus_bytes: rows.reduce((sum, row) => sum + row.bytes, 0), document_count: rows.length });
  }
  for (const row of cases) {
    write(`${row.name}/prompt.md`, row.prompt); write(`${row.name}/manifest.json`, json(row.manifest));
    write(`${row.name}/preparer-route.json`, json(row.route));
  }
  for (const revision of revisions) assertRevision(revision.root, revision.commit);
  write("supplement.json", supplementBytes);
  const index = { type: "SkillContextPreparation", version: 1, ...identity, snapshots,
    cases: cases.map(row => ({ name: row.name, provider: row.manifest.provider, phase: row.manifest.phase, case_id: row.manifest.case_id,
      prompt_sha256: row.manifest.prompt_sha256, prompt_bytes: row.manifest.prompt_bytes, manifest_sha256: hash(json(row.manifest)),
      preparer_route_sha256: hash(json(row.route)) })),
    candidate_withheld_freeze: false, withheld_executions: 0, native_model_calls: 0,
    native_transfer_authorized: false, loaded_instruction_bytes: null, semantic_acceptance: false };
  write("index.json", json(index));
  return { output, index_sha256: hash(json(index)), prepared_cases: cases.length,
    prepared_prompt_bytes: cases.reduce((sum, row) => sum + row.prompt.length, 0),
    ...Object.fromEntries(["native_transfer_authorized", "loaded_instruction_bytes", "native_model_calls", "withheld_executions"].map(key => [key, index[key]])) };
}

function inspectPreparation(directory, expectedDigest) {
  const root = fs.realpathSync(directory), read = file => readBoundFile(root, file).bytes;
  const indexBytes = read("index.json");
  if (!/^[a-f0-9]{64}$/.test(expectedDigest || "") || hash(indexBytes) !== expectedDigest) fail("INDEX_CHANGED");
  const index = JSON.parse(indexBytes), catalogs = new Map();
  if (index.type !== "SkillContextPreparation" || index.version !== 1 || index.native_transfer_authorized !== false ||
      index.native_model_calls !== 0 || index.withheld_executions !== 0 || index.candidate_withheld_freeze !== false ||
      index.loaded_instruction_bytes !== null || index.semantic_acceptance !== false ||
      !Array.isArray(index.snapshots) || index.snapshots.length !== 2 ||
      !isDeepStrictEqual(index.snapshots.map(row => row.phase).sort(), ["baseline", "candidate"]) ||
      !Array.isArray(index.cases) || index.cases.length !== 24) fail("INDEX_INVALID");
  if (hash(read("supplement.json")) !== index.supplement_sha256) fail("SUPPLEMENT_CHANGED");
  for (const snapshot of index.snapshots) {
    const bytes = read(`snapshots/${snapshot.phase}/catalog.json`);
    if (hash(bytes) !== snapshot.catalog_sha256) fail("CATALOG_CHANGED");
    const catalog = JSON.parse(bytes);
    if (catalog.phase !== snapshot.phase || catalog.source_commit !== snapshot.source_commit || !Array.isArray(catalog.documents) ||
        catalog.documents.length !== snapshot.document_count || new Set(catalog.documents.map(row => row.path)).size !== catalog.documents.length) fail("CATALOG_INVALID");
    const documents = new Map(); let total = 0;
    for (const row of catalog.documents) {
      if (!allowedCorpusPath(row.path)) fail("CATALOG_INVALID");
      const body = read(`snapshots/${snapshot.phase}/${row.path}`);
      if (hash(body) !== row.sha256 || body.length !== row.bytes) fail("SNAPSHOT_CHANGED");
      documents.set(row.path, body); total += body.length;
    }
    if (total !== snapshot.corpus_bytes) fail("CATALOG_INVALID");
    catalogs.set(snapshot.phase, documents);
  }
  const seen = new Set(), caseIds = new Set(); let total = 0;
  for (const row of index.cases) {
    if (!["baseline", "candidate"].includes(row.phase) || !Object.hasOwn(PROVIDERS, row.provider) ||
        !/^[A-Z][A-Z0-9-]{2,39}$/.test(row.case_id || "") || row.name !== `${row.phase}-${row.provider}-${row.case_id}` || seen.has(row.name)) fail("CASE_INVALID");
    seen.add(row.name); caseIds.add(row.case_id);
    const manifestBytes = read(`${row.name}/manifest.json`), routeBytes = read(`${row.name}/preparer-route.json`), prompt = read(`${row.name}/prompt.md`);
    if (hash(manifestBytes) !== row.manifest_sha256 || hash(routeBytes) !== row.preparer_route_sha256 ||
        hash(prompt) !== row.prompt_sha256 || prompt.length !== row.prompt_bytes) fail("PACKET_CHANGED");
    const manifest = JSON.parse(manifestBytes), route = JSON.parse(routeBytes);
    const entryPath = `${PROVIDERS[row.provider]}/controls-doctrine-operator/SKILL.md`, entryBytes = catalogs.get(row.phase).get(entryPath);
    if (!entryBytes || manifest.phase !== row.phase || manifest.provider !== row.provider || manifest.case_id !== row.case_id ||
        !Array.isArray(manifest.segments) || manifest.segments.length !== 3) fail("PACKET_INVALID");
    const taskSegment = manifest.segments[2];
    if (![taskSegment.start_byte, taskSegment.end_byte_exclusive].every(Number.isSafeInteger) || taskSegment.start_byte < 0 ||
        taskSegment.end_byte_exclusive <= taskSegment.start_byte || taskSegment.end_byte_exclusive > prompt.length) fail("PACKET_INVALID");
    const assigned = JSON.parse(prompt.subarray(taskSegment.start_byte, taskSegment.end_byte_exclusive));
    const rebuilt = buildInput(row.provider, { task: { id: row.case_id, query: assigned.original_request, options: assigned.operator },
      origin_task: assigned.source_origin_task, sources: assigned.required_sources },
    { path: entryPath, bytes: entryBytes, sha256: hash(entryBytes) }, route, {
      bundle_sha256: index.bundle_sha256, supplement_sha256: index.supplement_sha256,
      preparation_harness_sha256: index.preparation_harness_sha256, phase: row.phase,
      source_commit: index.snapshots.find(snapshot => snapshot.phase === row.phase).source_commit
    });
    if (!rebuilt.prompt.equals(prompt) || !isDeepStrictEqual(rebuilt.manifest, manifest)) fail("ACCOUNTING_INVALID");
    total += prompt.length;
  }
  if (caseIds.size !== 6 || [...caseIds].some(id => ["baseline", "candidate"].some(phase =>
    Object.keys(PROVIDERS).some(provider => !seen.has(`${phase}-${provider}-${id}`))))) fail("CASE_INVENTORY_INVALID");
  return { valid: true, index_sha256: expectedDigest, prepared_cases: seen.size, prepared_prompt_bytes: total,
    loaded_instruction_bytes: null, native_transfer_authorized: false, native_model_calls: 0, semantic_acceptance: false };
}

function main(argv = process.argv.slice(2)) {
  try {
    if (argv[0] === "inspect") {
      if (argv.length !== 5 || argv[1] !== "--directory" || argv[3] !== "--index-sha256") fail("ARGUMENTS_INVALID");
      console.log(json(inspectPreparation(argv[2], argv[4]))); return;
    }
    const [command, ...args] = argv, options = {}, names = ["bundle", "supplement", "baseline", "candidate", "candidate-revision", "output"];
    if (command !== "prepare" || args.length !== names.length * 2) fail("ARGUMENTS_INVALID");
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index].slice(2);
      if (!args[index].startsWith("--") || !names.includes(key) || Object.hasOwn(options, key.replaceAll("-", "_")) ||
          !args[index + 1] || args[index + 1].startsWith("--")) fail("ARGUMENTS_INVALID");
      options[key.replaceAll("-", "_")] = args[index + 1];
    }
    console.log(json(prepare(options)));
  } catch (error) {
    console.error(/^SKILL_CONTEXT_EVALUATION_[A-Z_]+$/.test(error.message) ? error.message : "SKILL_CONTEXT_EVALUATION_UNAVAILABLE");
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { prepare, inspectPreparation, selectTaskSources, allowedCorpusPath, buildInput, main };
