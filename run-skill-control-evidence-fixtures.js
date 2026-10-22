#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const store = require("./repository-artifact-store"), write = store.writeRepositoryArtifact;
let beforeWrite;
store.writeRepositoryArtifact = descriptor => { if (beforeWrite) beforeWrite(descriptor); return write(descriptor); };
const { openWave, recordWave } = require("./skill-mission-controller");
const clone = value => JSON.parse(JSON.stringify(value));
const sample = name => clone(require(`./sample-payloads/valid-${name}.json`));
const roots = []; let passed = 0;
const check = (name, callback) => { callback(); passed++; console.log(`PASS ${name}`); };
function environment() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-control-evidence-")); roots.push(root);
  const repository = path.join(root, "repo"); fs.mkdirSync(repository);
  const git = argv => execFileSync("git", argv, { cwd: repository, encoding: "utf8" });
  git(["init", "-q"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.com"]);
  fs.writeFileSync(path.join(repository, "README.md"), "Synthetic note for metadata-boundary tests.\n");
  git(["add", "README.md"]); git(["commit", "-qm", "fixture"]);
  const epoch = Date.parse("2026-10-22T00:00:00Z"), at = seconds => new Date(epoch + seconds * 1000).toISOString();
  const options = { repository, artifactRoot: path.join(root, "proof"), doctrineRoot: __dirname };
  const plan = sample("mission-wave-plan");
  Object.assign(plan, { id: "MWP-CONTROL-EVIDENCE", mission_id: "MIS-CONTROL-EVIDENCE", objective: "Inspect the local note.",
    title: "Synthetic note inspection", created_at: at(0), valid_until: at(3600),
    success_conditions: ["The note has a retained summary."], failure_conditions: ["The note is modified."],
    constraints: ["Read only the local note; do not publish."] });
  plan.adaptive_work.enabled = false;
  plan.agents = [{ ...plan.agents[0], task: "Summarize the local note.", allowed_actions: ["Inspect the local note."],
    approval_required: ["Any mutation or scope change."], prohibited_actions: ["Self-approval.", "External release."] }];
  const opened = openWave(plan, { ...options, now: at(10) });
  const read = ref => JSON.parse(fs.readFileSync(path.join(options.artifactRoot, ref.relative_path)));
  const persist = (kind, value, seconds) => {
    const result = store.writeRepositoryArtifact({ repositoryPath: repository, artifactRoot: options.artifactRoot,
      missionId: plan.mission_id, waveId: plan.wave_id, kind, artifactId: value.id, payload: value, createdAt: at(seconds) });
    return { artifact_id: value.id, relative_path: result.relative_path, sha256: result.sha256 };
  };
  const fileArtifact = (id, value, extension = "json") => {
    const file = path.join(root, `${id}.${extension}`); fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
    const result = store.writeRepositoryFileArtifact({ repositoryPath: repository, artifactRoot: options.artifactRoot,
      missionId: plan.mission_id, waveId: plan.wave_id, kind: "deliverables", artifactId: id, sourcePath: file, createdAt: at(20) });
    return { artifact_id: id, relative_path: result.relative_path, sha256: result.sha256 };
  };
  const report = (id, evidence) => ({ ...sample("mission-wave-report"), id, mission_id: plan.mission_id, wave_id: plan.wave_id,
    plan_ref: opened.plan_ref, routing_preflight_ref: opened.routing_preflight_ref, recorded_at: at(30),
    agent_results: [{ ...sample("mission-wave-report").agent_results[0], agent_id: plan.agents[0].agent_id,
      context_pack_ref: opened.context_packs[0].context_pack_ref, evidence_refs: [evidence] }] });
  const sitrep = { ...sample("sitrep"), id: "SITREP-CONTROL-EVIDENCE", mission_id: plan.mission_id, timestamp: at(20) };
  return { root, options, plan, opened, at, read, persist, fileArtifact, report, sitrep };
}
try {
  const env = environment();
  check("untyped retained controls remain metadata after JSON key order and MIME changes", () => {
    env.persist("sitreps", env.sitrep, 20);
    for (const extension of ["txt", "bin", "json"]) {
      const copy = Object.fromEntries(Object.entries(env.sitrep).reverse());
      const ref = env.fileArtifact(`DATA-CONTROL-COPY-${extension}`, copy, extension);
      assert.throws(() => recordWave(env.report(`MWR-COPY-${extension}`, ref), { ...env.options, now: env.at(30) }),
        /control metadata as execution evidence/);
    }
  });
  check("ordinary JSON work is admitted only after every actually routed control executes", () => {
    const work = env.fileArtifact("DATA-NOTE-SUMMARY", { source_line: fs.readFileSync(path.join(env.options.repository, "README.md"), "utf8"),
      summary: "The supplied local note is explicitly synthetic." });
    const result = recordWave(env.report("MWR-ORDINARY-WORK", work), { ...env.options, now: env.at(30) });
    assert.equal(result.status, "complete"); assert.equal(result.release_authorized, false);
    const context = env.read(env.opened.context_packs[0].context_pack_ref);
    assert.equal(result.control_receipt_refs.length, context.required_controls.length);
    for (const ref of result.control_receipt_refs) assert.equal(env.read(ref).status, "passed");
  });
  check("report publication reappraises newly retained control aliases and fresh-ID retry reruns controls", () => {
    const value = environment(), alias = value.fileArtifact("DATA-FUTURE-CONTROL", Object.fromEntries(Object.entries(value.sitrep).reverse()), "txt");
    beforeWrite = descriptor => {
      if (descriptor.kind !== "mission-wave-reports") return;
      beforeWrite = null; value.persist("sitreps", value.sitrep, 20);
    };
    try { assert.throws(() => recordWave(value.report("MWR-PUBLICATION-RACE", alias), { ...value.options, now: value.at(30) }),
      /control metadata as execution evidence/); } finally { beforeWrite = null; }
    const verified = store.verifyRepositoryArtifacts({ repositoryPath: value.options.repository, artifactRoot: value.options.artifactRoot });
    assert.equal(verified.valid, true);
    const manifest = JSON.parse(fs.readFileSync(path.join(value.options.artifactRoot, "repositories", verified.repository.key, "manifest.json")));
    assert(!manifest.artifacts.some(item => item.kind === "mission-wave-reports"));
    const earlier = manifest.artifacts.filter(item => item.kind === "control-execution-receipts"); assert(earlier.length > 0);
    const work = value.fileArtifact("DATA-LEGITIMATE-SUMMARY", "Synthetic summary from the actual local note.\n", "txt");
    const result = recordWave(value.report("MWR-FRESH-ID-RETRY", work), { ...value.options, now: value.at(30) });
    assert.equal(result.status, "complete"); assert.equal(result.release_authorized, false);
    assert(result.control_receipt_refs.length > 0);
    assert(result.control_receipt_refs.every(ref => !earlier.some(item => item.artifact_id === ref.artifact_id)));
  });
  console.log(JSON.stringify({ total: passed, passed, failed: 0,
    scope: "Legacy data-only waves exercise actual report publication and routed controls; method dispatch has its separate integration suite." }, null, 2));
} finally {
  beforeWrite = null; for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}
