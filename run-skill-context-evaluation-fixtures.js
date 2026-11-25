#!/usr/bin/env node

const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { prepare, inspectPreparation, selectTaskSources, allowedCorpusPath } = require("./skill-context-evaluation");
const { inspectBundle, hash, MEMBERS, DIMENSIONS } = require("./skill-evaluation-runner");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "skill-context-evaluation-")));
const baseline = path.join(root, "baseline"), candidate = path.join(root, "candidate"), bundle = path.join(root, "bundle");
const json = value => JSON.stringify(value, null, 2) + "\n";
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const git = (cwd, args) => {
  const result = spawnSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args],
    { cwd, encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))) });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
};
let count = 0;
const check = (name, fn) => { fn(); count++; console.log("PASS " + name); };
try {
  for (const repo of [baseline, candidate]) {
    fs.mkdirSync(repo); git(repo, ["init", "-q"]);
    for (const provider of ["codex-skills", ".claude/skills"]) {
      write(path.join(repo, provider, "controls-doctrine-operator/SKILL.md"), `# ${repo === baseline ? "Baseline" : "Candidate"}\nPreserve sources.\n`);
      write(path.join(repo, provider, "controls-doctrine-operator/references/task.md"), "# Optional Task Guide\nRead when relevant.\n");
      write(path.join(repo, provider, "controls-doctrine-operator/scripts/route_controls_docs.js"),
        'console.log(JSON.stringify({query:process.argv.at(-1),repo_root:process.cwd(),operating_mode:{actor:"ai",role:"S3",department:"operations",authority:"read-only"},capability_query:process.argv.at(-1),capability_routing:{status:"covered",provisional_organization:{authority_expansion_authorized:false}},recommended_documents:[{path:"docs/source.md"}],validation_commands:["node retained-control.js"]}));\n');
    }
    write(path.join(repo, "docs/source.md"), "# Guidance\nFull source required.\n");
    write(path.join(repo, ".cannae/private.md"), "PRIVATE_STATE_MUST_NOT_ENTER_CATALOG");
    write(path.join(repo, "PRIVATE.md"), "UNASSIGNED_ROOT_DOCUMENT");
    git(repo, ["add", "."]); git(repo, ["commit", "-qm", "Synthetic revision"]);
  }
  const data = { "protocol.json": { version: 1, routing_count: 24, authoring_count: 8, native_transfer_authorized: false,
    candidate_frozen: false, dimensions: DIMENSIONS, holdout_limit: "Synthetic harness cases, not native evaluation." } };
  for (const [split, prefix] of [["development", "DEV"], ["withheld", "HLD"]]) {
    data[`routing-${split}.json`] = Array.from({ length: 12 }, (_, i) => ({ id: `${prefix}-R-${i}`, family: "fixture",
      query: `Original task ${i}: \uD55C\uAD6D\uC5B4. Do not publish.`, options: { actor: "ai", role: "S3", department: "operations",
        authority: "read-only", objectives: [], sources: [], guarded: false }, expected: { exit_code: 0, capability: "covered",
        required_documents: ["docs/source.md"], absent_documents: [], error_code: null }, context_measurement: split === "development" && i < 6 }));
    data[`authoring-${split}.json`] = ["sop", "research", "order-report", "handoff"].map((format, i) => ({ id: `${prefix}-A-${i}`,
      format, request: "Write only.", sources: [{ id: "SRC", version: "1", body: "# Policy\r\nRequired \uC6A9\uC5B4.\r\nDo not send." }], required_outputs: ["draft"] }));
    data[`reference-${split}.json`] = data[`authoring-${split}.json`].map(task => ({ id: task.id,
      checks: [{ id: "CHECK", dimension: "authority_and_disclosure", severity: "critical", source_id: "SRC", assertion: "DO_NOT_SEND_REFERENCE_ANSWER" }] }));
  }
  const manifest = { version: 1, baseline_commit: git(baseline, ["rev-parse", "HEAD"]), members: {},
    withheld_policy: "candidate_freeze_before_execution; no_tuning_exposure" };
  for (const name of MEMBERS) {
    const bytes = json(data[name]); write(path.join(bundle, name), bytes); manifest.members[name] = { bytes: Buffer.byteLength(bytes), sha256: hash(bytes) };
  }
  write(path.join(bundle, "manifest.json"), json(manifest));
  const frozen = inspectBundle(bundle), supplement = { version: 1, bundle_sha256: frozen.manifest_sha256,
    cases: frozen.development.filter(row => row.context_measurement).map(row => ({ case_id: row.id, source_task_id: "DEV-A-0", source_ids: ["SRC"] })) };
  const supplementFile = path.join(root, "supplement.json"); write(supplementFile, json(supplement));
  const options = { bundle, supplement: supplementFile, baseline, candidate,
    candidate_revision: git(candidate, ["rev-parse", "HEAD"]), output: path.join(root, "prepared") };
  check("task source supplement covers the exact frozen six without rewriting their requests", () => {
    const assigned = selectTaskSources(frozen, supplement);
    assert.equal(assigned.length, 6);
    for (const row of assigned) {
      assert.deepEqual(row.task, frozen.development.find(task => task.id === row.task.id));
      assert.deepEqual(row.sources, frozen.authoring[0].sources);
    }
  });
  check("missing duplicate unknown and withheld assignments fail before any preparation", () => {
    for (const edit of [s => s.cases.pop(), s => { s.cases[1] = s.cases[0]; }, s => { s.cases[0].source_task_id = "HLD-A-0"; },
      s => { s.cases[0].source_ids = ["UNKNOWN"]; }, s => { s.cases[0].source_ids = ["SRC", "SRC"]; },
      s => { s.cases[0].query = "Changed request"; }, s => { s.bundle_sha256 = "0".repeat(64); }]) {
      const changed = structuredClone(supplement); edit(changed); assert.throws(() => selectTaskSources(frozen, changed));
    }
  });
  check("guarded tasking and unsupported declared corpus inputs cannot be downgraded", () => {
    for (const edit of [b => { b.development[0].options.guarded = true; }, b => { b.development[0].options.sources = ["docs/source.md"]; }]) {
      const changed = structuredClone(frozen); edit(changed);
      assert.throws(() => selectTaskSources(changed, supplement), /CONTEXT_CASE_UNSUPPORTED/);
    }
  });
  check("only tracked document corpus path families are eligible for a local snapshot", () => {
    for (const file of ["README.md", "docs/source.md", "codex-skills/controls-doctrine-operator/references/task.md"]) assert(allowedCorpusPath(file));
    for (const file of ["../README.md", ".cannae/private.md", "PRIVATE.md", "docs/nested/private.md", "package.json", "docs/.secret.md"]) assert(!allowedCorpusPath(file));
  });
  const prepared = prepare(options);
  check("24 paired inputs preserve full sources and keep route controls without answers", () => {
    assert.equal(prepared.prepared_cases, 24); assert.equal(prepared.loaded_instruction_bytes, null);
    assert.equal(prepared.native_transfer_authorized, false);
    const index = JSON.parse(fs.readFileSync(path.join(prepared.output, "index.json")));
    for (const row of index.cases) {
      const prompt = fs.readFileSync(path.join(prepared.output, row.name, "prompt.md")), m = JSON.parse(fs.readFileSync(path.join(prepared.output, row.name, "manifest.json")));
      const segment = m.segments[2], task = JSON.parse(prompt.subarray(segment.start_byte, segment.end_byte_exclusive));
      assert.equal(task.original_request, frozen.development.find(task => task.id === row.case_id).query);
      assert.deepEqual(task.required_sources, frozen.authoring[0].sources);
      assert(prompt.includes(Buffer.from("node retained-control.js")));
      assert(!/DO_NOT_SEND_REFERENCE_ANSWER|HLD-|PRIVATE_STATE_MUST_NOT_ENTER_CATALOG/.test(prompt.toString()));
      assert.equal(m.prompt_bytes, prompt.length); assert.equal(m.prompt_sha256, hash(prompt));
      assert.equal(m.segments.reduce((sum, s) => sum + s.bytes, 0) + m.framing_bytes, prompt.length);
      assert.equal(m.required_source_bindings[0].bytes, Buffer.byteLength(task.required_sources[0].body));
      assert.equal(m.native_model_calls, 0); assert.equal(m.semantic_acceptance, false);
      assert.equal(fs.statSync(path.join(prepared.output, row.name, "prompt.md")).mode & 0o777, 0o600);
    }
    assert.equal(fs.statSync(prepared.output).mode & 0o777, 0o700);
    const catalog = fs.readFileSync(path.join(prepared.output, "snapshots/baseline/catalog.json"), "utf8");
    assert(!catalog.includes(".cannae/") && !catalog.includes("PRIVATE.md"));
    assert.equal(index.candidate_withheld_freeze, false);
  });
  check("inspection verifies all frozen snapshots and exact prompts without a delivery claim", () => {
    const result = inspectPreparation(prepared.output, prepared.index_sha256);
    assert.equal(result.valid, true); assert.equal(result.prepared_cases, 24);
    assert.equal(result.prepared_prompt_bytes, prepared.prepared_prompt_bytes);
    assert.equal(result.loaded_instruction_bytes, null); assert.equal(result.native_transfer_authorized, false);
  });
  check("prompt snapshot route supplement and manifest changes cannot retain the original binding", () => {
    for (const relative of ["baseline-codex-DEV-R-0/prompt.md", "baseline-codex-DEV-R-0/manifest.json", "baseline-codex-DEV-R-0/preparer-route.json",
      "snapshots/candidate/docs/source.md", "supplement.json", "index.json"]) {
      const file = path.join(prepared.output, relative), bytes = fs.readFileSync(file);
      try { fs.appendFileSync(file, " "); assert.throws(() => inspectPreparation(prepared.output, prepared.index_sha256)); }
      finally { fs.writeFileSync(file, bytes); }
    }
  });
  check("self-rehashed native approval flags still cannot become a valid preparation", () => {
    const file = path.join(prepared.output, "index.json"), bytes = fs.readFileSync(file), changed = JSON.parse(bytes);
    changed.native_transfer_authorized = true;
    try { fs.writeFileSync(file, json(changed)); assert.throws(() => inspectPreparation(prepared.output, hash(json(changed))), /INDEX_INVALID/); }
    finally { fs.writeFileSync(file, bytes); }
  });
  check("manifest byte accounting and delivery claims are checked even against a rehashed index", () => {
    const indexFile = path.join(prepared.output, "index.json"), indexBytes = fs.readFileSync(indexFile), index = JSON.parse(indexBytes);
    const manifestFile = path.join(prepared.output, index.cases[0].name, "manifest.json"), manifestBytes = fs.readFileSync(manifestFile);
    for (const [key, value] of [["assigned_task_bytes", 0], ["loaded_instruction_bytes", 1], ["native_transfer_authorized", true]]) {
      const changed = JSON.parse(manifestBytes); changed[key] = value;
      const changedIndex = structuredClone(index); changedIndex.cases[0].manifest_sha256 = hash(json(changed));
      try {
        fs.writeFileSync(manifestFile, json(changed)); fs.writeFileSync(indexFile, json(changedIndex));
        assert.throws(() => inspectPreparation(prepared.output, hash(json(changedIndex))), /ACCOUNTING_INVALID/);
      } finally { fs.writeFileSync(manifestFile, manifestBytes); fs.writeFileSync(indexFile, indexBytes); }
    }
  });
  check("unsafe snapshot links fail rather than loading their target", () => {
    const file = path.join(prepared.output, "snapshots/baseline/docs/source.md"), bytes = fs.readFileSync(file), target = path.join(root, "outside.md");
    write(target, bytes); fs.unlinkSync(file); fs.symlinkSync(target, file);
    try { assert.throws(() => inspectPreparation(prepared.output, prepared.index_sha256)); }
    finally { fs.unlinkSync(file); fs.writeFileSync(file, bytes); }
  });
  check("destination reuse wrong revision and dirty roots fail without overwriting evidence", () => {
    assert.throws(() => prepare(options), /DESTINATION_EXISTS/);
    assert.throws(() => prepare({ ...options, candidate_revision: "0".repeat(40) }), /REVISION_NOT_CLEAN_PINNED/);
    assert.throws(() => prepare({ ...options, output: path.join(candidate, "new-packet") }), /DESTINATION_INVALID/);
    const file = path.join(candidate, "docs/source.md"), bytes = fs.readFileSync(file);
    try { fs.appendFileSync(file, "Changed"); assert.throws(() => prepare(options), /REVISION_NOT_CLEAN_PINNED/); }
    finally { fs.writeFileSync(file, bytes); }
  });
  check("an incomplete directory has no valid preparation and is not silently replaced", () => {
    const incomplete = path.join(root, "interrupted"); fs.mkdirSync(incomplete);
    assert.throws(() => inspectPreparation(incomplete, prepared.index_sha256));
    assert.throws(() => prepare({ ...options, output: incomplete }), /DESTINATION_EXISTS/);
    assert.deepEqual(fs.readdirSync(incomplete), []);
  });
  check("unsupported execution and withheld CLI modes emit no prepared content", () => {
    for (const args of [["run"], ["prepare", "--withheld"], ["inspect", "--directory", prepared.output, "--index-sha256", "0".repeat(64)]]) {
      const result = spawnSync(process.execPath, [path.join(__dirname, "skill-context-evaluation.js"), ...args], { encoding: "utf8" });
      assert.equal(result.status, 1); assert.equal(result.stdout, "");
      assert.match(result.stderr, /^SKILL_CONTEXT_EVALUATION_[A-Z_]+\n$/);
    }
  });
  console.log(JSON.stringify({ valid: true, fixtures: count, native_model_calls: 0, actual_delivery_bytes: null, withheld_executions: 0 }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
