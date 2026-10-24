#!/usr/bin/env node
const assert = require("assert/strict"), fs = require("fs"), os = require("os"), path = require("path");
const { spawnSync } = require("child_process");
const { digest, sha256 } = require("./order-intake-contract");
const contract = require("./workload-control-contract"), runner = require("./workload-control-runner");
const controller = require("./skill-mission-controller"), storeApi = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { samples, clone } = require("./workload-control-fixtures/samples");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-workload-")), repository = path.join(root, "target"), artifactRoot = path.join(root, "artifacts");
fs.mkdirSync(repository);
function git(...args) { const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); }
git("init", "-q"); git("config", "user.email", "fixtures@example.com"); git("config", "user.name", "Fixtures");
fs.writeFileSync(path.join(repository, "README.md"), "Synthetic workload fixture\n"); git("add", "."); git("commit", "-qm", "initial");
const options = { repository, artifactRoot, now: "2026-07-23T05:10:00+09:00" };
const plan = clone(require("./sample-payloads/valid-mission-wave-plan.json"));
let report, cleanReceipt, cleanInput;
const state = () => controller.repositoryStateDigest(repository);
function store() { const verification = storeApi.verifyRepositoryArtifacts({ repositoryPath: repository, artifactRoot });
  assert.equal(verification.valid, true); const identity = storeApi.resolveRepository(repository);
  const manifest = JSON.parse(fs.readFileSync(path.join(artifactRoot, "repositories", identity.key, "manifest.json"), "utf8"));
  assert.equal(storeApi.manifestDigest(manifest), verification.manifest_sha256);
  return { repository: identity, artifactRoot, verification, manifest }; }
function evidence(id, payload, mission = plan.mission_id) {
  const written = storeApi.writeRepositoryArtifact({ repositoryPath: repository, artifactRoot, missionId: mission, waveId: plan.wave_id,
    kind: "deliverables", artifactId: id, payload, createdAt: "2026-07-23T04:50:00+09:00" });
  return { artifact_id: id, relative_path: written.relative_path, sha256: written.sha256 };
}
function rekey(value, prefix) { const { id, ...body } = value; return contract.identified(prefix, body); }
const cases = [];
function test(name, run) { cases.push({ name, run }); }
test("all three metadata contracts are non-authorizing and reject added fields", () => {
  for (const [type, value] of Object.entries(samples())) {
    assert.equal(validatePayload(value, type).valid, true, type);
    assert.equal(validatePayload(value, type).can_execute, false, type);
    assert.equal(validatePayload({ ...value, ignore_policy: true }, type).valid, false);
    assert.equal(validatePayload({ ...value, release_authorized: true }, type).valid, false);
  }
});
test("malformed nullable assessment cannot pass the null schema branch", () => {
  const value = samples()["workload-control-receipt"]; value.assessment = { status: "passed" };
  assert.equal(validatePayload(value, "workload-control-receipt").valid, false);
  const input = samples()["workload-control-input"]; input.report.agent_results = [null];
  assert.equal(validatePayload(input, "workload-control-input").valid, false);
});
test("actual open creates real report and work evidence bindings", () => {
  const opened = controller.openWave(plan, { ...options, doctrineRoot: __dirname, now: "2026-07-23T04:30:00+09:00" });
  const ref = evidence("EVD-WORKLOAD-CLEAN", { result: "Scoped synthetic evidence." });
  report = { schema_version: "0.1", type: "MissionWaveReport", id: "MWR-WORKLOAD-CLEAN", mission_id: plan.mission_id, wave_id: plan.wave_id,
    plan_ref: opened.plan_ref, routing_preflight_ref: opened.routing_preflight_ref,
    agent_results: plan.agents.map(agent => ({ agent_id: agent.agent_id, context_pack_ref: opened.context_packs.find(item => item.agent_id === agent.agent_id).context_pack_ref,
      status: "complete", summary: "Scoped work complete.", completed_actions: ["Completed work."], blockers: [], evidence_refs: [ref], improvement_candidates: [], next_actions: [] })),
    wave_status: "complete", human_decisions_required: [], release_requested: false, recorded_at: "2026-07-23T05:00:00+09:00" };
  assert.equal(validatePayload(report, "mission-wave-report").valid, true);
  cleanInput = runner.buildInput(report, store(), state(), options.now);
});
test("real bounded worker consumes the clean report and exact evidence bytes", () => {
  cleanReceipt = runner.executeInput(cleanInput, state);
  assert.equal(cleanReceipt.status, "passed");
  assert.equal(cleanReceipt.process.stdin_sha256, digest(cleanInput));
  assert.equal(cleanReceipt.process.sandbox_enforced, false);
  assert.equal(validatePayload(cleanReceipt, "workload-control-receipt").can_execute, false);
  runner.assertCurrent(cleanReceipt, report, store(), state(), options.now);
});
test("actual report admission blocks a credential in the report and retains only sanitized receipt", () => {
  const value = clone(report); value.id = "MWR-WORKLOAD-REPORT-BLOCKED";
  value.agent_results[0].summary = "password=synthetic-workload-fixture-only";
  assert.throws(() => controller.recordWave(value, options), /WORKLOAD_CONTROL_BLOCKED: POLICY_FINDINGS/);
  const snapshot = store();
  assert.equal(snapshot.manifest.artifacts.some(item => item.kind === "mission-wave-reports"), false);
  assert.equal(snapshot.manifest.artifacts.some(item => item.kind === "control-execution-receipts"), false);
  const entry = snapshot.manifest.artifacts.find(item => item.kind === "workload-control-receipts");
  const raw = fs.readFileSync(path.join(artifactRoot, entry.relative_path), "utf8");
  assert.equal(raw.includes("synthetic-workload-fixture-only"), false);
  assert.equal(raw.includes("Scoped work complete"), false);
  assert.equal(JSON.parse(raw).assessment.status, "blocked");
});
test("actual report admission scans credential-bearing work evidence, not only report claims", () => {
  const value = clone(report); value.id = "MWR-WORKLOAD-EVIDENCE-BLOCKED";
  value.agent_results[0].evidence_refs = [evidence("EVD-WORKLOAD-SECRET", { password: "synthetic-evidence-only" })];
  assert.throws(() => controller.recordWave(value, options), /WORKLOAD_CONTROL_BLOCKED: POLICY_FINDINGS/);
  assert.equal(store().manifest.artifacts.some(item => item.kind === "mission-wave-reports"), false);
});
test("report, work evidence, nonce, purpose and source substitutions cannot reuse an assessment", () => {
  for (const key of ["invocation_id", "input_id", "report_input_sha256", "policy_source_sha256", "purpose"]) {
    const value = clone(cleanReceipt.assessment); value[key] = "substituted";
    assert.equal(runner.assessmentMatches(cleanInput, value), false, key);
  }
  const changed = clone(report); changed.agent_results[0].summary = "Changed work result.";
  assert.throws(() => runner.assertCurrent(cleanReceipt, changed, store(), state(), options.now), /STALE_OR_BLOCKED/);
});
test("complete input hash cannot conceal changed work bytes or an omitted subject after rekeying", () => {
  for (const mutate of [value => { value.evidence[0].text = "Changed evidence"; }, value => { value.evidence = []; },
    value => { value.report.agent_results[0].summary = "Changed report"; }, value => { value.agent_bindings = value.agent_bindings.slice(1); }]) {
    const value = clone(cleanInput); mutate(value);
    assert.equal(validatePayload(rekey(value, "WCI"), "workload-control-input").valid, false);
  }
});
test("actual report rejects workload control metadata disguised as a deliverable", () => {
  const value = clone(report); value.id = "MWR-WORKLOAD-METADATA";
  value.agent_results[0].evidence_refs = [evidence("EVD-WORKLOAD-METADATA", { wrapper: [cleanReceipt] })];
  assert.throws(() => controller.recordWave(value, options), /control metadata/);
});
test("worker rejects stale source and malformed stdin without echoing its payload", () => {
  const input = clone(cleanInput); input.policy_source_sha256 = "0".repeat(64);
  input.subject_set_sha256 = contract.subjectDigest(input);
  assert.throws(() => runner.executeInput(rekey(input, "WCI"), state), /INPUT_STALE/);
  const result = spawnSync(process.execPath, [path.join(__dirname, "workload-control-worker.js")], {
    input: '{"password":"synthetic-malformed-only",', encoding: "utf8", timeout: 10000, shell: false,
    env: { PATH: process.env.PATH || "" }
  });
  assert.equal(result.status, 1); assert.equal(result.stdout.includes("synthetic-malformed-only"), false);
  assert.equal(JSON.parse(result.stdout).type, "WorkloadControlFailure");
});
test("foreign mission references cannot become policy inputs", () => {
  const value = clone(report); value.agent_results[0].evidence_refs = [evidence("EVD-WORKLOAD-FOREIGN", { result: "Foreign evidence." }, "MIS-WORKLOAD-FOREIGN")];
  assert.throws(() => runner.buildInput(value, store(), state(), options.now), /REFERENCE_INVALID/);
});
test("intermediate symlinks are rejected even when they resolve inside the artifact root", () => {
  const original = path.join(artifactRoot, report.agent_results[0].evidence_refs[0].relative_path), parent = path.dirname(original), renamed = parent + "-saved";
  fs.renameSync(parent, renamed); fs.symlinkSync(renamed, parent);
  try { assert.throws(() => runner.boundedEvidence({ manifest: { artifacts: [{ ...report.agent_results[0].evidence_refs[0], mission_id: report.mission_id, wave_id: report.wave_id }] }, artifactRoot }, report.agent_results[0].evidence_refs[0], report), /PATH_INVALID/); }
  finally { fs.unlinkSync(parent); fs.renameSync(renamed, parent); }
});
test("invalid UTF8, NUL and oversized files hold instead of truncating or passing", () => {
  for (const [name, data, code] of [["invalid", Buffer.from([255]), /ENCODING_INVALID/], ["nul", Buffer.from("a\0b"), /ENCODING_INVALID/], ["large", Buffer.alloc(contract.LIMITS.file_bytes + 1, 65), /BYTES_EXCEEDED/]]) {
    const relative = `${name}.bin`, ref = { artifact_id: `EVD-${name}`, relative_path: relative, sha256: sha256(data) };
    fs.writeFileSync(path.join(root, relative), data);
    const snapshot = { artifactRoot: root, manifest: { artifacts: [{ ...ref, mission_id: report.mission_id, wave_id: report.wave_id }] } };
    assert.throws(() => runner.boundedEvidence(snapshot, ref, report), code);
  }
});
test("receipt hashes, flags, verdict and scope are semantically checked after rekeying", () => {
  for (const mutate of [value => { value.input_binding.invocation_id = "b".repeat(32); }, value => { value.repository_unchanged = false; },
    value => { value.assessment = null; }, value => { value.status = "blocked"; value.failure_code = "POLICY_FINDINGS"; },
    value => { value.mission_id = "MIS-SUBSTITUTED"; }]) {
    const value = clone(cleanReceipt); mutate(value);
    assert.equal(validatePayload(rekey(value, "WCR"), "workload-control-receipt").valid, false);
  }
});
test("publication recheck detects target drift while generated receipt refs preserve input digest", () => {
  assert.equal(contract.reportInputDigest(report), contract.reportInputDigest({ ...report, workload_control_receipt_refs: [{ artifact_id: "WCR-GENERATED", relative_path: "generated.json", sha256: "a".repeat(64) }] }));
  fs.writeFileSync(path.join(repository, "README.md"), "Changed target\n");
  assert.throws(() => runner.assertCurrent(cleanReceipt, report, store(), state(), options.now), /STALE_OR_BLOCKED/);
});
test("all workload metadata remains non-work even inside wrappers", () => {
  for (const value of Object.values(samples())) assert.equal(require("./semantic-control-types").isNonWorkPayload({ result: [value] }), true);
});
let passed = 0;
try { for (const item of cases) { try { item.run(); passed++; console.log(`PASS ${item.name}`); }
  catch (error) { console.error(`FAIL ${item.name}\n${error.stack}`); process.exitCode = 1; } } }
finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ total: cases.length, passed, failed: cases.length - passed, scope: "Synthetic local checks; no model call, owner consent, isolation or release authority." }, null, 2));
