#!/usr/bin/env node

const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const runner = require("./skill-evaluation-runner");
const authoring = require("./skill-authoring-evaluation");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "skill-evaluation-")));
let count = 0;
const check = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const json = value => JSON.stringify(value, null, 2) + "\n";
const command = (exe, args, cwd) => {
  const result = spawnSync(exe, args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
};

function dataset(commit) {
  const data = { "protocol.json": { version: 1, routing_count: 24, authoring_count: 8,
    native_transfer_authorized: false, candidate_frozen: false, dimensions: runner.DIMENSIONS,
    holdout_limit: "Fixture-only dataset; no model or independent blinding." } };
  for (const [split, prefix] of [["development", "DEV"], ["withheld", "HLD"]]) {
    data[`routing-${split}.json`] = Array.from({ length: 12 }, (_, i) => ({ id: `${prefix}-R-${i}`, family: "fixture",
      query: `Draft an SOP ${i}.`, options: { actor: "user", role: null, department: null, authority: null,
        objectives: [], sources: [], guarded: false }, expected: { exit_code: 0, capability: "covered",
        required_documents: ["docs/source.md"], absent_documents: [], error_code: null },
      context_measurement: split === "development" && i < 6 }));
    data[`authoring-${split}.json`] = ["sop", "research", "order-report", "handoff"].map((format, i) => ({
      id: `${prefix}-A-${i}`, format, request: "Draft, do not publish.", sources: [{ id: "SRC", version: "1", body: "Synthetic source." }],
      required_outputs: ["draft"] }));
    data[`reference-${split}.json`] = data[`authoring-${split}.json`].map(row => ({ id: row.id,
      checks: [{ id: "C1", dimension: "authority_and_disclosure", severity: "critical", source_id: "SRC", assertion: "No publication." }] }));
  }
  return { data, manifest: { version: 1, baseline_commit: commit, members: {},
    withheld_policy: "candidate_freeze_before_execution; no_tuning_exposure" } };
}

const repo = path.join(root, "repository"), bundle = path.join(root, "bundle");
fs.mkdirSync(repo); fs.mkdirSync(bundle);
const git = args => command("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], repo);
try {
  git(["init", "-q"]);
  for (const provider of ["codex-skills", ".claude/skills"]) {
    write(path.join(repo, provider, "controls-doctrine-operator/SKILL.md"), "Fixture instructions.\n");
    write(path.join(repo, provider, "controls-doctrine-operator/scripts/route_controls_docs.js"),
      'const q=process.argv.at(-1);console.log(JSON.stringify({query:q,recommended_documents:[{path:"docs/source.md"}],operating_mode:{actor:"user",role:null,department:null,authority:null},capability_routing:{status:"covered",provisional_organization:{authority_expansion_authorized:false,standing_department_activation_authorized:false}}}));\n');
  }
  write(path.join(repo, "docs/source.md"), "Synthetic policy.\n");
  for (const provider of ["codex", "claude"]) for (const format of ["sop", "research", "order-report", "handoff"]) {
    for (const file of authoring.instructionPaths(provider, format)) {
      if (!fs.existsSync(path.join(repo, file))) write(path.join(repo, file), "# Synthetic Guide\nFixture-only instructions.\n");
    }
  }
  git(["add", "."]); git(["commit", "-qm", "Fixture baseline"]);
  const frozen = dataset(git(["rev-parse", "HEAD"]));
  function publish() {
    for (const name of runner.MEMBERS) {
      const bytes = json(frozen.data[name]); write(path.join(bundle, name), bytes);
      frozen.manifest.members[name] = { sha256: runner.hash(bytes), bytes: Buffer.byteLength(bytes) };
    }
    write(path.join(bundle, "manifest.json"), json(frozen.manifest));
  }
  publish();
  check("inspection validates all split counts without returning held-out tasks or references", () => {
    const result = runner.inspectBundle(bundle);
    assert.equal(result.development.length, 12); assert.equal(result.authoring.length, 4);
    assert(!JSON.stringify(result).includes("HLD-R-") && !JSON.stringify(result).includes("HLD-A-"));
  });
  check("changed member bytes fail without a silent manifest refresh", () => {
    fs.appendFileSync(path.join(bundle, "routing-withheld.json"), " ");
    assert.throws(() => runner.inspectBundle(bundle), /MEMBER_CHANGED/); publish();
  });
  check("malformed withheld JSON does not disclose its contents in errors", () => {
    const name = "routing-withheld.json", bytes = "WITHHELD-PRIVATE-CONTENT";
    write(path.join(bundle, name), bytes);
    frozen.manifest.members[name] = { sha256: runner.hash(bytes), bytes: Buffer.byteLength(bytes) };
    write(path.join(bundle, "manifest.json"), json(frozen.manifest));
    assert.throws(() => runner.inspectBundle(bundle), error => error.message === `SKILL_EVALUATION_JSON_INVALID:${name}`);
    publish();
  });
  check("duplicate source or rubric IDs cannot make evidence ambiguous", () => {
    const task = frozen.data["authoring-development.json"][0];
    task.sources.push(structuredClone(task.sources[0])); publish();
    assert.throws(() => runner.inspectBundle(bundle), /AUTHORING_CASE_INVALID/);
    task.sources.pop(); publish();
    const ref = frozen.data["reference-development.json"][0];
    ref.checks.push(structuredClone(ref.checks[0])); publish();
    assert.throws(() => runner.inspectBundle(bundle), /REFERENCE_INVALID/);
    ref.checks.pop(); publish();
  });
  check("duplicate split IDs and wrong subset sizes fail", () => {
    const rows = frozen.data["routing-withheld.json"], original = rows[0].id;
    rows[0].id = frozen.data["routing-development.json"][0].id; publish();
    assert.throws(() => runner.inspectBundle(bundle), /SPLIT_ID_COLLISION/);
    rows[0].id = original; rows[0].context_measurement = true; publish();
    assert.throws(() => runner.inspectBundle(bundle), /CONTEXT_SUBSET_INVALID/);
    rows[0].context_measurement = false; publish();
  });
  check("symlinked or escaping source paths fail", () => {
    const file = path.join(bundle, "protocol.json"), held = path.join(root, "policy.json");
    fs.renameSync(file, held); fs.symlinkSync(held, file);
    assert.throws(() => runner.inspectBundle(bundle), /SOURCE_SYMLINK/);
    fs.unlinkSync(file); fs.renameSync(held, file);
    assert.throws(() => runner.readFile(bundle, "../policy.json"), /PATH_INVALID/);
  });
  check("extra execution options cannot become arbitrary commands", () => {
    const rows = structuredClone(frozen.data["routing-development.json"]);
    rows[0].options.command = "unexpected";
    assert.throws(() => runner.validateRouting(rows), /ROUTING_OPTIONS_INVALID/);
  });
  check("option-like query text stays after the end-of-options boundary", () => {
    const row = structuredClone(frozen.data["routing-development.json"][0]); row.query = "--actor=ai Do not publish.";
    const args = runner.routerArgs("router.js", row);
    assert.deepEqual(args.slice(-2), ["--", row.query]); assert.equal(args[1], "--actor=user");
  });
  check("null route output cannot pass because semantic checks were skipped", () => {
    const result = runner.assess(frozen.data["routing-development.json"][0], { status: 0, stdout: "null", stderr: "" });
    assert(result.issues.includes("ROUTE_OUTPUT_SHAPE"));
  });
  check("known error must be exact and stdout empty", () => {
    const row = structuredClone(frozen.data["routing-development.json"][0]);
    row.expected.exit_code = 2; row.expected.error_code = "MULTI_OBJECTIVE_MODE_UNSUPPORTED";
    assert.deepEqual(runner.assess(row, { status: 2, stderr: "MULTI_OBJECTIVE_MODE_UNSUPPORTED", stdout: "" }).issues, []);
    assert(runner.assess(row, { status: 2, stderr: "other error", stdout: "" }).issues.includes("ERROR_BOUNDARY"));
    assert(runner.assess(row, { status: 2, stderr: "NOT_MULTI_OBJECTIVE_MODE_UNSUPPORTED: other error", stdout: "" }).issues.includes("ERROR_BOUNDARY"));
  });
  check("baseline captures all development runs but neither native use nor held-out execution", () => {
    const result = runner.baseline(bundle, repo);
    assert.equal(result.case_count, 24); assert.equal(result.matched_expectations, 24);
    assert.equal(result.withheld_executions, 0); assert.equal(result.native_model_calls, 0);
    assert.equal(result.semantic_acceptance, false); assert.equal(result.promotion_authorized, false);
    assert(result.results.every(row => row.loaded_instruction_bytes === null && row.selected_bytes > 0));
  });
  check("dirty or wrong baseline revisions fail before measurement", () => {
    write(path.join(repo, "docs/source.md"), "Changed.\n");
    assert.throws(() => runner.baseline(bundle, repo), /BASELINE_NOT_CLEAN_PINNED_REVISION/);
    write(path.join(repo, "docs/source.md"), "Synthetic policy.\n");
    const original = frozen.manifest.baseline_commit; frozen.manifest.baseline_commit = "1".repeat(40); publish();
    assert.throws(() => runner.baseline(bundle, repo), /BASELINE_NOT_CLEAN_PINNED_REVISION/);
    frozen.manifest.baseline_commit = original; publish();
  });
  check("CLI inspection is summary-only and withheld execution is unsupported", () => {
    const script = path.join(__dirname, "skill-evaluation-runner.js");
    const summary = JSON.parse(command(process.execPath, [script, "inspect", "--bundle", bundle], repo));
    assert.equal(summary.withheld_execution_supported, false);
    const denied = spawnSync(process.execPath, [script, "withheld", "--bundle", bundle], { encoding: "utf8" });
    assert.equal(denied.status, 1); assert.equal(denied.stdout, "");
  });
  check("authoring preparation preserves every development task with exact full instruction spans", () => {
    for (const provider of ["codex", "claude"]) for (const task of frozen.data["authoring-development.json"]) {
      const packet = authoring.buildPacket(repo, provider, task, { baseline_commit: frozen.manifest.baseline_commit,
        bundle_sha256: runner.hash(fs.readFileSync(path.join(bundle, "manifest.json"))) });
      const result = authoring.verifyPacket(packet.prompt, packet.manifest);
      assert.equal(result.valid, true); assert.equal(result.loaded_instruction_bytes, null);
      assert.equal(result.native_transfer_authorized, false); assert.equal(result.semantic_acceptance, false);
      for (const segment of packet.manifest.segments.filter(row => row.kind === "instruction")) {
        assert(packet.prompt.subarray(segment.start_byte, segment.end_byte).equals(fs.readFileSync(path.join(repo, segment.path))));
      }
      const segment = packet.manifest.segments.at(-1);
      assert.deepEqual(JSON.parse(packet.prompt.subarray(segment.start_byte, segment.end_byte)), task);
      assert(!packet.prompt.toString().includes("HLD-"));
    }
  });
  const sampleTask = frozen.data["authoring-development.json"][0];
  const packet = () => authoring.buildPacket(repo, "codex", sampleTask, {
    baseline_commit: frozen.manifest.baseline_commit, bundle_sha256: runner.hash(fs.readFileSync(path.join(bundle, "manifest.json"))) });
  check("task serialization excludes attached evaluator fields and preserves multibyte source text", () => {
    const task = structuredClone(sampleTask); task.checks = "ANSWER-NOT-FOR-MODEL";
    task.sources[0].body += "\n\uC6A9\uC5B4 \uC815\uC758.\n"; task.sources[0].assertion = "ANSWER-NOT-FOR-MODEL";
    const prepared = authoring.buildPacket(repo, "claude", task, {});
    assert(!prepared.prompt.includes("ANSWER-NOT-FOR-MODEL"));
    assert(prepared.prompt.includes(task.sources[0].body.replace(/\n/g, "\\n")));
    assert.equal(authoring.verifyPacket(prepared.prompt, prepared.manifest).valid, true);
  });
  check("changed bytes and segment digests cannot be counted as delivered context", () => {
    const prepared = packet(), changed = Buffer.from(prepared.prompt); changed[changed.length - 1] = 0;
    assert.throws(() => authoring.verifyPacket(changed, prepared.manifest), /PACKET_INVALID/);
    for (const mutate of [m => m.segments[0].sha256 = "0".repeat(64), m => m.segments[0].start_byte++,
      m => m.segments[0].end_byte++, m => m.segments.pop(), m => m.prepared_instruction_bytes++,
      m => m.framing_bytes++, m => m.task_sha256 = "0".repeat(64), m => m.segments[0].path = "../secret"]) {
      const manifest = structuredClone(prepared.manifest); mutate(manifest);
      assert.throws(() => authoring.verifyPacket(prepared.prompt, manifest), /SKILL_AUTHORING_EVALUATION_/);
    }
  });
  check("preparation cannot become an authority or native receipt through manifest flag edits", () => {
    const prepared = packet();
    for (const [key, value] of [["native_transfer_authorized", true], ["loaded_instruction_bytes", 1],
      ["native_model_calls", 1], ["semantic_acceptance", true], ["promotion_authorized", true],
      ["split", "withheld"], ["phase", "candidate"]]) {
      assert.throws(() => authoring.verifyPacket(prepared.prompt, { ...prepared.manifest, [key]: value }), /PACKET_INVALID/);
    }
  });
  check("full packet framing has no uncounted trailing instructions", () => {
    const prepared = packet(), changed = Buffer.concat([prepared.prompt, Buffer.from("Injected instructions")]);
    const manifest = { ...prepared.manifest, prompt_sha256: runner.hash(changed), prompt_bytes: changed.length };
    assert.throws(() => authoring.verifyPacket(changed, manifest), /ACCOUNTING_INVALID/);
  });
  check("missing symlinked and hardlinked full-body guides stop preparation", () => {
    const file = path.join(repo, "docs/knowledge-management-sop.md"), backup = path.join(root, "saved-guide.md");
    fs.renameSync(file, backup);
    try {
      assert.throws(packet, /MISSING/);
      fs.symlinkSync(backup, file); assert.throws(packet, /PATH_INVALID/); fs.unlinkSync(file);
      fs.linkSync(backup, file); assert.throws(packet, /FILE_INVALID/); fs.unlinkSync(file);
    } finally { fs.renameSync(backup, file); }
  });
  check("empty or invalid UTF-8 instructions do not make valid packets", () => {
    const file = path.join(repo, "docs/knowledge-management-sop.md"), original = fs.readFileSync(file);
    try { for (const bytes of [Buffer.alloc(0), Buffer.from([0xff])]) {
      fs.writeFileSync(file, bytes); assert.throws(packet, /INSTRUCTION_ENCODING_INVALID/);
    } } finally { fs.writeFileSync(file, original); }
  });
  check("baseline preparation writes all eight private packets without executing a client", () => {
    const output = path.join(root, "prepared");
    const result = authoring.prepareBaseline(bundle, repo, output);
    assert.equal(result.cases.length, 8); assert.equal(result.native_model_calls, 0);
    assert.equal(result.withheld_executions, 0); assert.equal(result.loaded_instruction_bytes, null);
    for (const row of result.cases) {
      const directory = path.join(output, row.name), bytes = fs.readFileSync(path.join(directory, "prompt.md"));
      assert.equal(runner.hash(bytes), row.prompt_sha256);
      assert.equal(fs.statSync(path.join(directory, "prompt.md")).mode & 0o777, 0o600);
      assert.equal(authoring.verifyPacket(bytes, JSON.parse(fs.readFileSync(path.join(directory, "manifest.json")))).valid, true);
    }
    assert.throws(() => authoring.prepareBaseline(bundle, repo, output), /EEXIST/);
    assert.throws(() => authoring.prepareBaseline(bundle, repo, path.join(repo, "outputs")), /DESTINATION_INVALID/);
    assert.throws(() => authoring.prepareBaseline(bundle, repo, path.join(bundle, "outputs")), /DESTINATION_INVALID/);
    write(path.join(repo, "docs/source.md"), "changed");
    try { assert.throws(() => authoring.prepareBaseline(bundle, repo, path.join(root, "dirty")), /BASELINE_NOT_CLEAN_PINNED_REVISION/); }
    finally { write(path.join(repo, "docs/source.md"), "Synthetic policy.\n"); }
  });
  check("native candidate and withheld launch options are unsupported", () => {
    for (const verb of ["execute", "withheld", "candidate"]) {
      const denied = spawnSync(process.execPath, [path.join(__dirname, "skill-authoring-evaluation.js"), verb], { encoding: "utf8" });
      assert.equal(denied.status, 1); assert.equal(denied.stdout, "");
      assert.equal(denied.stderr, "SKILL_AUTHORING_EVALUATION_USAGE\n");
    }
  });
  console.log(JSON.stringify({ valid: true, fixtures: count, native_model_calls: 0, actual_evaluation_withheld_executions: 0 }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
