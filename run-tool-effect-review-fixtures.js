#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const store = require("./repository-artifact-store");
const write = store.writeRepositoryArtifact;
let beforePublication = null;
store.writeRepositoryArtifact = options => {
  if (beforePublication) beforePublication(options);
  return write(options);
};
const { reviewToolEffects } = require("./tool-effect-review");
const runtime = require("./dispatch-runtime-controller");
const { computeRepositoryState, executeVerification, receiptDigest } = require("./verification-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-effect-review-"));
const repository = path.join(temporaryRoot, "repository");
const artifactRoot = path.join(temporaryRoot, "artifacts");
const options = { repository, artifactRoot };
const baseTime = Date.now() - 10000;
const time = offset => new Date(baseTime + offset).toISOString();
const sample = name => JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", `${name}.json`), "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
let count = 0;

function git(...args) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
}

function persist(payload, kind, createdAt, scope = {}) {
  const result = write({ repositoryPath: repository, artifactRoot,
    missionId: scope.mission_id || lease.mission_id, waveId: scope.wave_id || lease.wave_id,
    kind, artifactId: payload.id, payload, createdAt });
  return { artifact_id: payload.id, relative_path: result.relative_path, sha256: result.sha256 };
}

function check(name, fn) {
  fn();
  count += 1;
  console.log(`PASS ${name}`);
}

fs.mkdirSync(repository);
fs.writeFileSync(path.join(repository, "README.md"), "synthetic effect fixture\n");
// The positive fixture executes a real checker over both retained scope and observation.
fs.writeFileSync(path.join(repository, "check-effects.js"), `
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { inputDigest } = require(${JSON.stringify(path.join(__dirname, "dispatch-runtime-controller.js"))});
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const root = value("--artifact-root");
const scope = JSON.parse(fs.readFileSync(path.join(root, value("--effect-scope")), "utf8"));
assert.strictEqual(inputDigest(scope), value("--effect-scope-sha256"));
for (const resource of scope.resources) {
  const observed = JSON.parse(fs.readFileSync(path.join(root, resource.evidence_refs[0].relative_path), "utf8"));
  const actual = crypto.createHash("sha256").update(fs.readFileSync(resource.target)).digest("hex");
  assert.strictEqual(actual, observed.content_sha256);
}
`);
git("init", "-q");
git("config", "user.name", "Effect Fixture");
git("config", "user.email", "effect-fixture@example.com");
git("add", ".");
git("commit", "-qm", "synthetic baseline");
const resolved = store.resolveRepository(repository);
const binding = { repository_key: resolved.key, identity_fingerprint: resolved.identity_fingerprint };
const lease = sample("valid-agent-dispatch-lease");
lease.repository_binding = binding;
lease.initial_repository_state = runtime.runtimeRepositoryState(repository);
const leaseRef = persist(lease, "agent-dispatch-leases", lease.issued_at);
const baseline = sample("valid-agent-execution-checkpoint");
baseline.lease_ref = leaseRef;
baseline.repository_state = lease.initial_repository_state;
const baselineRef = persist(baseline, "agent-execution-checkpoints", baseline.recorded_at);
const admission = sample("valid-tool-admission-event");
admission.lease_ref = leaseRef;
admission.checkpoint_ref = baselineRef;
admission.state_before = baseline.repository_state;
const admissionRef = persist(admission, "tool-admission-events", admission.decided_at);
const failure = { ...clone(baseline), id: "AEC-EFFECT-FAILURE", sequence: 1, checkpoint_kind: "post_tool",
  lease_status: "blocked", previous_checkpoint_ref: baselineRef, tool_admission_ref: admissionRef,
  execution_result: { status: "failed", provider_result_sha256: "a".repeat(64), external_effects: "unknown" },
  reason_codes: ["SYNTHETIC_PROVIDER_FAILURE"], recorded_at: time(0) };
const failureRef = persist(failure, "agent-execution-checkpoints", failure.recorded_at);
const observation = { id: "OBS-EFFECT-README", synthetic: true,
  content_sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(repository, "README.md"))).digest("hex") };
const observationRef = persist(observation, "tool-effect-observations", time(1000));

function bundle(name, mutate = {}) {
  const scope = sample("valid-tool-effect-scope");
  Object.assign(scope, { id: `TES-${name}`, repository_binding: binding,
    lease_ref: leaseRef, checkpoint_ref: failureRef, admission_ref: admissionRef,
    expected_repository_state: computeRepositoryState(repository), created_at: time(2000), expires_at: time(3602000) });
  scope.resources[0].evidence_refs = [observationRef];
  if (mutate.scope) mutate.scope(scope);
  const scopeRef = persist(scope, "tool-effect-scopes", scope.created_at);
  const plan = sample("valid-verification-plan");
  Object.assign(plan, { id: `VP-${name}`, mission_id: scope.mission_id, repository_binding: binding,
    candidate_id: scope.id, candidate_revision: runtime.inputDigest(scope),
    expected_repository_state: scope.expected_repository_state, created_at: time(3000) });
  plan.checks = [{ id: "VCK-README", purpose: "Read exact retained scope, observation, and current README bytes.",
    executable: "node", args: ["check-effects.js", "--artifact-root", artifactRoot,
      "--effect-scope", scopeRef.relative_path, "--effect-scope-sha256", runtime.inputDigest(scope)],
    working_directory: ".", timeout_ms: 10000, expected_exit_codes: [0] }];
  const campaign = sample("valid-self-improvement-campaign");
  campaign.mission_id = scope.mission_id;
  campaign.repository_binding = { ...binding, baseline_revision: resolved.head_commit };
  const receipt = executeVerification(campaign, plan, repository);
  assert.strictEqual(receipt.overall_status, "passed", JSON.stringify(receipt));
  if (mutate.plan) mutate.plan(plan);
  if (mutate.receipt) mutate.receipt(receipt);
  receipt.receipt_sha256 = receiptDigest(receipt);
  const planRef = persist(plan, "verification-plans", plan.created_at);
  const receiptRef = persist(receipt, "verification-receipts", receipt.finished_at);
  return { scope, plan, receipt, references: { scope_ref: scopeRef, verification_plan_ref: planRef, verification_receipt_ref: receiptRef } };
}

try {
  const good = bundle("VALID");
  check("real checker binds exact invocation, scope, retained observation, plan, and receipt without settling effects", () => {
    const before = runtime.dispatchStatus(options);
    const result = reviewToolEffects({ ...options, writeArtifact: true }, good.references);
    assert.strictEqual(result.status, "evidence_bound", JSON.stringify(result));
    assert.strictEqual(result.effects_settled, false);
    assert.strictEqual(result.verifier_identity_verified, false);
    assert.strictEqual(result.scope_completeness_verified, false);
    assert.strictEqual(result.user_decision_verified, false);
    assert.strictEqual(result.tool_execution_authorized, false);
    assert.strictEqual(result.release_authorized, false);
    assert.deepStrictEqual(runtime.dispatchStatus(options).leases, before.leases);
    const retained = JSON.parse(fs.readFileSync(path.join(artifactRoot, result.artifact.relative_path), "utf8"));
    assert.strictEqual(validatePayload(retained, "tool-effect-review").valid, true);
  });
  const negatives = [
    ["wrong-receipt-candidate", { receipt: item => { item.candidate_id = "TES-OTHER"; } }, "TOOL_EFFECT_VERIFICATION_SCOPE_MISMATCH"],
    ["wrong-plan-digest", { receipt: item => { item.plan_sha256 = "b".repeat(64); } }, "TOOL_EFFECT_RECEIPT_BINDING_MISMATCH"],
    ["unresolved-resource", { scope: item => { item.resources[0].disposition = "unresolved"; } }, "TOOL_EFFECT_RESOURCE_UNRESOLVED"],
    ["missing-resource-check", { scope: item => { item.resources[0].check_ids = ["VCK-MISSING"]; } }, "TOOL_EFFECT_CHECK_SCOPE_NOT_BOUND"],
    ["receipt-check-omission", { receipt: item => { item.checks = []; } }, null],
    ["duplicate-receipt-check", { receipt: item => { item.checks.push(clone(item.checks[0])); } }, "TOOL_EFFECT_CHECK_SET_MISMATCH"],
    ["check-argv-substitution", { receipt: item => { item.checks[0].argv = ["node", "different.js"]; } }, "TOOL_EFFECT_CHECK_RESULT_MISMATCH"],
    ["unbound-check", { plan: item => { item.checks[0].args = ["check-effects.js"]; } }, "TOOL_EFFECT_CHECK_SCOPE_NOT_BOUND"],
    ["wrong-repository", { receipt: item => { item.repository_binding.identity_fingerprint = "b".repeat(64); } }, "TOOL_EFFECT_REPOSITORY_MISMATCH"],
    ["baseline-substitution", { scope: item => { item.checkpoint_ref = baselineRef; } }, "TOOL_EFFECT_INVOCATION_MISMATCH"],
    ["future-receipt", { receipt: item => { item.finished_at = time(1800000); } }, "TOOL_EFFECT_EVIDENCE_TIME_INVALID"]
  ];
  for (const [name, mutation, code] of negatives) {
    check(name, () => {
      const value = bundle(name, mutation);
      if (!code) assert.throws(() => reviewToolEffects(options, value.references), /verification-receipt/);
      else {
        const result = reviewToolEffects(options, value.references);
        assert.strictEqual(result.status, "blocked");
        assert(result.reason_codes.includes(code), JSON.stringify(result));
      }
    });
  }
  check("scope expiry blocks review without erasing unknown history", () => {
    const result = reviewToolEffects({ ...options, now: good.scope.expires_at }, good.references);
    assert(result.reason_codes.includes("TOOL_EFFECT_EVIDENCE_TIME_INVALID"));
    assert.strictEqual(runtime.dispatchStatus(options).leases[0].unresolved_tool_effects, 1);
  });
  check("cross-wave observation reference fails before producing a projection", () => {
    const wrong = persist({ ...observation, id: "OBS-W2" }, "tool-effect-observations", time(1000), { wave_id: "W2" });
    const value = bundle("cross-wave", { scope: item => { item.resources[0].evidence_refs = [wrong]; } });
    assert.throws(() => reviewToolEffects(options, value.references), /REFERENCE_SCOPE_MISMATCH/);
  });
  check("an old observation cannot prove a later failure", () => {
    const old = persist({ ...observation, id: "OBS-OLD" }, "tool-effect-observations", time(-1000));
    const value = bundle("old-observation", { scope: item => { item.resources[0].evidence_refs = [old]; } });
    assert(reviewToolEffects(options, value.references).reason_codes.includes("TOOL_EFFECT_OBSERVATION_TIME_INVALID"));
  });
  check("extra reference fields cannot override scope identity", () => {
    assert.throws(() => reviewToolEffects(options, { ...good.references, mission_id: "MIS-SPOOF" }), /REFERENCES_INVALID/);
  });
  check("numeric timestamp ordering accepts equivalent offset notation", () => {
    const value = bundle("offset-time", { scope: item => {
      item.created_at = new Date(Date.parse(item.created_at) + 9 * 3600000).toISOString().replace("Z", "+09:00");
    } });
    assert.strictEqual(reviewToolEffects(options, value.references).status, "evidence_bound");
  });
  check("a retained object in the wrong kind cannot substitute a verification receipt", () => {
    const wrongKind = persist({ ...good.receipt, id: "VR-WRONG-KIND" }, "deliverables", good.receipt.finished_at);
    assert.throws(() => reviewToolEffects(options, { ...good.references, verification_receipt_ref: wrongKind }), /REFERENCE_SCOPE_MISMATCH/);
  });
  check("scope expiry at publication cannot retain the earlier evidence-bound result", () => {
    const value = bundle("publication-expiry");
    const mutableOptions = { ...options, now: new Date().toISOString(), writeArtifact: true };
    const manifestPath = path.join(artifactRoot, "repositories", resolved.key, "manifest.json");
    const before = fs.readFileSync(manifestPath, "utf8");
    let fired = false;
    beforePublication = input => {
      if (input.kind !== "tool-effect-reviews") return;
      beforePublication = null;
      fired = true;
      mutableOptions.now = value.scope.expires_at;
    };
    try {
      assert.throws(() => reviewToolEffects(mutableOptions, value.references), /CHANGED_BEFORE_PUBLICATION/);
      assert(fired);
      assert.strictEqual(fs.readFileSync(manifestPath, "utf8"), before);
    } finally { beforePublication = null; }
  });
  check("repository drift at namespace publication leaves no positive review", () => {
    const value = bundle("publication-race");
    const manifestPath = path.join(artifactRoot, "repositories", resolved.key, "manifest.json");
    const before = fs.readFileSync(manifestPath, "utf8");
    let fired = false;
    beforePublication = input => {
      if (input.kind !== "tool-effect-reviews") return;
      beforePublication = null;
      fired = true;
      fs.appendFileSync(path.join(repository, "README.md"), "concurrent mutation\n");
    };
    try {
      assert.throws(() => reviewToolEffects({ ...options, writeArtifact: true }, value.references), /CHANGED_BEFORE_PUBLICATION/);
      assert(fired);
      assert.strictEqual(fs.readFileSync(manifestPath, "utf8"), before);
    } finally {
      beforePublication = null;
      fs.writeFileSync(path.join(repository, "README.md"), "synthetic effect fixture\n");
    }
  });
  assert.strictEqual(store.verifyRepositoryArtifacts({ repositoryPath: repository, artifactRoot }).valid, true);
  console.log(JSON.stringify({ total: count, passed: count, failed: 0 }));
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
