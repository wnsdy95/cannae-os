#!/usr/bin/env node

const assert = require("assert");
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
const runtime = require("./dispatch-runtime-controller");
const gateway = require("./protected-tool-gateway");
const { gatewayEffectSubject, reviewGatewayEffects } = require("./gateway-effect-review");
const { computeRepositoryState, executeVerification, receiptDigest } = require("./verification-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");
const support = require("./protected-gateway-fixture-support").createGatewayFixtureSupport(repository => {
  // Real checker, synthetic observations: this demonstrates binding, never provider containment.
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
  assert(observed.synthetic);
  assert.strictEqual(observed.transaction_id, scope.subject.transaction_id);
  assert.strictEqual(observed.content_sha256, crypto.createHash("sha256").update(fs.readFileSync("README.md")).digest("hex"));
}
`);
});
const { ROOT, artifactRoot, temporaryRoot, toolInput, setupScenario, gatewayRequest, trustedOptions, readJson, digest, clone } = support;
let count = 0;
const check = (name, fn) => { fn(); count += 1; console.log(`PASS ${name}`); };
const at = seconds => `2026-07-24T01:00:${String(seconds).padStart(2, "0")}Z`;
const sample = name => readJson(`sample-payloads/${name}.json`);

function persist(setup, payload, kind, createdAt, scope = {}) {
  const result = write({ repositoryPath: setup.repository, artifactRoot,
    missionId: scope.mission_id || setup.plan.mission_id, waveId: scope.wave_id || setup.plan.wave_id,
    kind, artifactId: payload.id, payload, createdAt });
  return { artifact_id: payload.id, relative_path: result.relative_path, sha256: result.sha256 };
}

function scenario(name, state) {
  const setup = setupScenario(`EFFECT-${name}`);
  const request = gatewayRequest(setup, "001");
  const options = trustedOptions(setup, request, at(10));
  if (["request", "orphan"].includes(state)) {
    beforePublication = input => {
      if (input.kind !== (state === "request" ? "tool-gateway-transaction-events" : "tool-gateway-decisions")) return;
      beforePublication = null;
      throw new Error("SYNTHETIC_INTAKE_CRASH");
    };
    try { assert.throws(() => gateway.admitGatewayRequest(options, request, toolInput), /SYNTHETIC_INTAKE_CRASH/); }
    finally { beforePublication = null; }
    if (state === "orphan") gateway.recoverGatewayTransaction({ ...options, now: at(30) }, request.transaction_id);
  } else {
    if (state === "denied") options.verifiedPrincipalSha256 = digest("foreign-principal");
    gateway.admitGatewayRequest(options, request, toolInput);
    if (state === "aborted") gateway.recoverGatewayTransaction({ ...options, now: at(30) }, request.transaction_id, { toolInput });
    if (["executing", "recovered", "failed", "committed"].includes(state)) {
      const begun = gateway.beginGatewayExecution({ ...options, now: at(20) }, request.transaction_id);
      if (state === "recovered") gateway.recoverGatewayTransaction({ ...options, now: at(30) }, request.transaction_id);
      if (["failed", "committed"].includes(state)) gateway.commitGatewayExecution({ ...options, now: at(30) }, request.transaction_id, {
        executionEventRef: begun.execution_event_ref, toolInput, result: { synthetic: true },
        executor: sample("valid-tool-execution-receipt").executor, status: state === "failed" ? "failed" : "succeeded",
        startedAt: at(20), finishedAt: at(25), exitCode: state === "failed" ? 1 : 0
      });
    }
  }
  delete options.now;
  return { setup, request, options };
}

function bundle(context, name, mutate = {}) {
  const { setup, request, options } = context;
  const subject = gatewayEffectSubject(options, request.transaction_id);
  const base = Date.now() - 3000;
  const time = offset => new Date(base + offset).toISOString();
  const observation = { id: `OBS-${name}`, synthetic: true, transaction_id: request.transaction_id,
    content_sha256: digest(fs.readFileSync(path.join(setup.repository, "README.md"))) };
  const observationRef = persist(setup, observation, "gateway-effect-observations", mutate.observationTime || time(0), mutate.observationScope);
  const scope = { schema_version: "0.1", type: "GatewayEffectScope", id: `GES-${name}`,
    mission_id: request.mission_id, wave_id: request.wave_id, agent_id: request.agent_id,
    repository_binding: subject.repository_binding, subject,
    expected_repository_state: computeRepositoryState(setup.repository),
    coverage_statement: "Synthetic fixture: exact local observations exercise binding only, never scope completeness or containment.",
    resources: (subject.required_targets.length ? subject.required_targets : [{ boundary: "external_effects", target: `transaction:${request.transaction_id}` }])
      .map((target, index) => ({ ...target, id: `RES-${index}`, disposition: "observed",
        evidence_refs: [observationRef], check_ids: ["VCK-EFFECTS"] })),
    created_at: time(1000), expires_at: time(3601000) };
  if (mutate.scope) mutate.scope(scope);
  const scopeRef = persist(setup, scope, "gateway-effect-scopes", scope.created_at);
  const plan = sample("valid-verification-plan");
  Object.assign(plan, { id: `VP-${name}`, mission_id: request.mission_id, repository_binding: subject.repository_binding,
    candidate_id: scope.id, candidate_revision: runtime.inputDigest(scope), expected_repository_state: scope.expected_repository_state,
    created_at: time(2000) });
  plan.checks = [{ id: "VCK-EFFECTS", purpose: "Bind retained synthetic observations to the exact gateway scope.", executable: "node",
    args: ["check-effects.js", "--artifact-root", artifactRoot, "--effect-scope", scopeRef.relative_path,
      "--effect-scope-sha256", runtime.inputDigest(scope)], working_directory: ".", timeout_ms: 10000, expected_exit_codes: [0] }];
  const campaign = sample("valid-self-improvement-campaign");
  campaign.mission_id = request.mission_id;
  campaign.repository_binding = { ...subject.repository_binding, baseline_revision: scope.expected_repository_state.head_commit };
  const receipt = executeVerification(campaign, plan, setup.repository);
  assert.strictEqual(receipt.overall_status, "passed", JSON.stringify(receipt));
  if (mutate.plan) mutate.plan(plan);
  if (mutate.receipt) mutate.receipt(receipt);
  receipt.receipt_sha256 = receiptDigest(receipt);
  const planRef = persist(setup, plan, "verification-plans", plan.created_at);
  const receiptRef = persist(setup, receipt, "verification-receipts", receipt.finished_at);
  return { scope, plan, receipt, references: { scope_ref: scopeRef, verification_plan_ref: planRef, verification_receipt_ref: receiptRef } };
}

try {
  const contexts = {};
  for (const [state, expectedClass, nextAction] of [
    ["request", "unstarted", "recover"], ["authorized", "unstarted", "recover"],
    ["executing", "unknown_execution", "recover"], ["recovered", "unknown_execution", "review"],
    ["orphan", "orphan_admission", "review"], ["failed", "committed_unknown_effects", "review"],
    ["committed", "settled", "none"], ["aborted", "settled", "none"], ["denied", "settled", "none"]
  ]) check(`runtime-created ${state} history has a non-authorizing typed intake`, () => {
    const context = scenario(state, state);
    contexts[state] = context;
    const result = gatewayEffectSubject(context.options, context.request.transaction_id);
    assert.strictEqual(result.subject_class, expectedClass);
    assert.strictEqual(result.next_action, nextAction);
    assert.strictEqual(validatePayload(result, "gateway-effect-subject").valid, true);
    assert.strictEqual(result.effects_settled, false);
    assert.strictEqual(result.tool_execution_authorized, false);
    assert.strictEqual(result.release_authorized, false);
    if (state === "orphan") {
      assert.deepStrictEqual(result.references.execution_event_ref, runtime.NONE_REF);
      assert.deepStrictEqual(result.references.receipt_ref, runtime.NONE_REF);
      assert.deepStrictEqual(result.required_targets.map(item => item.boundary), ["admission", "external_effects"]);
    }
  });
  const context = contexts.recovered;
  for (const [name, kind, mutate] of [
    ["foreign-request-namespace", "tool-gateway-requests", item => { item.mission_id = "MIS-FOREIGN"; }],
    ["foreign-checkpoint-namespace", "agent-execution-checkpoints", item => { item.wave_id = "W2"; }],
    ["checkpoint-id-substitution", "agent-execution-checkpoints", item => { item.artifact_id = "AEC-SUBSTITUTED"; }]
  ]) check(name, () => {
    const view = require("./tool-effect-review").loadEffectView(context.options);
    const subject = gatewayEffectSubject(context.options, context.request.transaction_id, view);
    const reference = subject.references[kind === "tool-gateway-requests" ? "request_ref" : "checkpoint_ref"];
    const target = view.manifest.artifacts.find(item => item.relative_path === reference.relative_path);
    mutate(target);
    assert.throws(() => gatewayEffectSubject(context.options, context.request.transaction_id, view),
      /REFERENCE_SCOPE_MISMATCH|REFERENCE_ID_MISMATCH|CHECKPOINT_BINDING_MISMATCH/);
  });
  const good = bundle(context, "VALID");
  check("real check binds scope and receipt but leaves pending admission and gateway hold intact", () => {
    const before = runtime.dispatchStatus(context.options).leases;
    const result = reviewGatewayEffects({ ...context.options, writeArtifact: true }, good.references);
    assert.strictEqual(result.status, "evidence_bound", JSON.stringify(result));
    for (const key of ["effects_settled", "scope_completeness_verified", "verifier_identity_verified",
      "provider_containment_verified", "production_coordination_verified", "user_decision_verified",
      "tool_execution_authorized", "release_authorized"]) assert.strictEqual(result[key], false);
    assert.deepStrictEqual(runtime.dispatchStatus(context.options).leases, before);
    assert.strictEqual(before[0].pending_tool_requests, 1);
    assert.strictEqual(before[0].unresolved_gateway_transactions, 1);
    const retained = JSON.parse(fs.readFileSync(path.join(artifactRoot, result.artifact.relative_path), "utf8"));
    assert.strictEqual(validatePayload(retained, "gateway-effect-review").valid, true);
  });
  for (const state of ["orphan", "failed"]) check(`${state} review retains the original failure, never manufactures successful completion`, () => {
    const value = bundle(contexts[state], `GOOD-${state}`);
    const before = runtime.dispatchStatus(contexts[state].options).leases;
    assert.strictEqual(reviewGatewayEffects(contexts[state].options, value.references).status, "evidence_bound");
    assert.deepStrictEqual(runtime.dispatchStatus(contexts[state].options).leases, before);
  });
  for (const state of ["request", "authorized", "executing", "committed", "aborted", "denied"]) check(`${state} cannot enter reconciliation review`, () => {
    const value = bundle(contexts[state], `NOT-REVIEW-${state}`);
    const result = reviewGatewayEffects(contexts[state].options, value.references);
    assert(result.reason_codes.includes("GATEWAY_EFFECT_RECOVERY_OR_CANCELLATION_REQUIRED"), JSON.stringify(result));
  });
  const negatives = [
    ["omit-boundary", { scope: item => { item.resources.pop(); } }, "GATEWAY_EFFECT_REQUIRED_BOUNDARY_MISSING"],
    ["wrong-candidate", { receipt: item => { item.candidate_id = "GES-OTHER"; } }, "TOOL_EFFECT_VERIFICATION_SCOPE_MISMATCH"],
    ["wrong-plan", { receipt: item => { item.plan_sha256 = "b".repeat(64); } }, "TOOL_EFFECT_RECEIPT_BINDING_MISMATCH"],
    ["unresolved", { scope: item => { item.resources[0].disposition = "unresolved"; } }, "TOOL_EFFECT_RESOURCE_UNRESOLVED"],
    ["missing-check", { scope: item => { item.resources[0].check_ids = ["VCK-MISSING"]; } }, "TOOL_EFFECT_CHECK_SCOPE_NOT_BOUND"],
    ["duplicate-check", { receipt: item => { item.checks.push(clone(item.checks[0])); } }, "TOOL_EFFECT_CHECK_SET_MISMATCH"],
    ["wrong-argv", { receipt: item => { item.checks[0].argv = ["node", "different.js"]; } }, "TOOL_EFFECT_CHECK_RESULT_MISMATCH"],
    ["unbound-scope", { plan: item => { item.checks[0].args = ["check-effects.js"]; } }, "TOOL_EFFECT_CHECK_SCOPE_NOT_BOUND"],
    ["foreign-repository", { receipt: item => { item.repository_binding.identity_fingerprint = "b".repeat(64); } }, "GATEWAY_EFFECT_REPOSITORY_MISMATCH"],
    ["old-observation", { observationTime: "2026-07-24T00:00:00Z" }, "TOOL_EFFECT_OBSERVATION_TIME_INVALID"],
    ["future-receipt", { receipt: item => { item.finished_at = new Date(Date.now() + 3600000).toISOString(); } }, "TOOL_EFFECT_EVIDENCE_TIME_INVALID"]
  ];
  for (const [name, mutation, code] of negatives) check(name, () => {
    const value = bundle(context, name, mutation);
    const result = reviewGatewayEffects(context.options, value.references);
    assert.strictEqual(result.status, "blocked");
    assert(result.reason_codes.includes(code), JSON.stringify(result));
  });
  check("foreign observation namespace fails before a review is produced", () => {
    const value = bundle(context, "FOREIGN-WAVE", { observationScope: { wave_id: "W2" } });
    assert.throws(() => reviewGatewayEffects(context.options, value.references), /REFERENCE_SCOPE_MISMATCH/);
  });
  check("numeric timestamp ordering accepts equivalent offset notation", () => {
    const value = bundle(context, "OFFSET", { scope: item => {
      item.created_at = new Date(Date.parse(item.created_at) + 9 * 3600000).toISOString().replace("Z", "+09:00");
    } });
    assert.strictEqual(reviewGatewayEffects(context.options, value.references).status, "evidence_bound");
  });
  check("extra references and wrong artifact kind cannot override the scope", () => {
    assert.throws(() => reviewGatewayEffects(context.options, { ...good.references, subject: good.scope.subject }), /REFERENCES_INVALID/);
    const wrong = persist(context.setup, { ...good.receipt, id: "VR-WRONG-KIND" }, "deliverables", good.receipt.finished_at);
    assert.throws(() => reviewGatewayEffects(context.options, { ...good.references, verification_receipt_ref: wrong }), /REFERENCE_SCOPE_MISMATCH/);
  });
  for (const mutation of ["expiry", "repository"]) check(`${mutation} drift at publication cannot publish stale approval`, () => {
    const value = bundle(context, `PUBLICATION-${mutation}`);
    const options = { ...context.options, writeArtifact: true };
    const manifest = path.join(artifactRoot, "repositories", value.scope.repository_binding.repository_key, "manifest.json");
    const before = fs.readFileSync(manifest, "utf8");
    const readmePath = path.join(context.setup.repository, "README.md");
    const readme = fs.readFileSync(readmePath);
    let fired = false;
    beforePublication = input => {
      if (input.kind !== "gateway-effect-reviews") return;
      beforePublication = null;
      fired = true;
      if (mutation === "expiry") options.now = value.scope.expires_at;
      else fs.appendFileSync(readmePath, "synthetic drift\n");
    };
    try {
      assert.throws(() => reviewGatewayEffects(options, value.references), /CHANGED_BEFORE_PUBLICATION/);
      assert(fired);
      assert.strictEqual(fs.readFileSync(manifest, "utf8"), before);
    } finally { beforePublication = null; fs.writeFileSync(readmePath, readme); }
  });
  check("new terminal lease history invalidates frozen proof without erasing original failure", () => {
    const subject = gatewayEffectSubject(context.options, context.request.transaction_id);
    const checkpoint = JSON.parse(fs.readFileSync(path.join(artifactRoot, subject.references.checkpoint_ref.relative_path), "utf8"));
    Object.assign(checkpoint, { id: "AEC-LEGACY-TERMINAL", sequence: checkpoint.sequence + 1,
      previous_checkpoint_ref: subject.references.checkpoint_ref, checkpoint_kind: "completion", lease_status: "completed",
      tool_admission_ref: clone(runtime.NONE_REF), recorded_at: new Date().toISOString(),
      execution_result: { status: "not_applicable", external_effects: "none", provider_result_sha256: "none" } });
    persist(context.setup, checkpoint, "agent-execution-checkpoints", checkpoint.recorded_at);
    const changed = gatewayEffectSubject(context.options, context.request.transaction_id);
    assert.strictEqual(changed.subject_class, "unknown_execution");
    assert.strictEqual(changed.next_action, "review");
    assert.strictEqual(changed.lease_status, "completed");
    assert.notStrictEqual(changed.id, subject.id);
    assert(reviewGatewayEffects(context.options, good.references).reason_codes.includes("GATEWAY_EFFECT_SUBJECT_CHANGED"));
    assert.strictEqual(runtime.dispatchStatus(context.options).leases[0].unresolved_gateway_transactions, 1);
  });
  for (const tree of ["codex-skills", ".claude/skills"]) check(`${tree} installed-style wrapper preserves the non-authorizing subject from outside the repository`, () => {
    const result = spawnSync(process.execPath, [path.join(ROOT, tree, "controls-doctrine-operator/scripts/review_gateway_effects.js"),
      "subject", "--transaction", context.request.transaction_id, "--repository", context.setup.repository,
      "--artifact-root", artifactRoot], { cwd: os.tmpdir(), encoding: "utf8" });
    assert.strictEqual(result.status, 0, result.stderr);
    const subject = JSON.parse(result.stdout);
    assert.strictEqual(subject.subject_class, "unknown_execution");
    assert.strictEqual(subject.tool_execution_authorized, false);
  });
  for (const item of Object.values(contexts)) assert.strictEqual(store.verifyRepositoryArtifacts({
    repositoryPath: item.setup.repository, artifactRoot }).valid, true);
  console.log(JSON.stringify({ total: count, passed: count, failed: 0 }));
} finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
