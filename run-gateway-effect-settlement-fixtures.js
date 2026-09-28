#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
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
const { settleGatewayEffects, decisionOption } = require("./gateway-effect-settlement");
const { createGatewaySettlementFixture, installEffectSettlementFixtureChecker } = require("./effect-settlement-fixture-support");
const { validatePayload } = require("./validator-cli-prototype/validate");
const support = require("./protected-gateway-fixture-support").createGatewayFixtureSupport(installEffectSettlementFixtureChecker);
const { setupScenario, gatewayRequest, trustedOptions, toolInput, artifactRoot, temporaryRoot } = support;
const clone = value => JSON.parse(JSON.stringify(value));
const sample = name => JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", `${name}.json`), "utf8"));
let count = 0;
function check(name, fn) { fn(); count++; console.log(`PASS ${name}`); }

try {
  const setup = setupScenario("SETTLEMENT-ORPHAN");
  const invocation = gatewayRequest(setup, "001");
  const admissionOptions = trustedOptions(setup, invocation, "2026-07-24T01:00:10Z");
  beforePublication = input => {
    if (input.kind !== "tool-gateway-decisions") return;
    beforePublication = null; throw new Error("SYNTHETIC_ADMISSION_CRASH");
  };
  assert.throws(() => gateway.admitGatewayRequest(admissionOptions, invocation, toolInput), /SYNTHETIC_ADMISSION_CRASH/);
  gateway.recoverGatewayTransaction({ ...admissionOptions, now: "2026-07-24T01:00:30Z" }, invocation.transaction_id);
  const options = { ...admissionOptions }; delete options.now;
  const proof = createGatewaySettlementFixture(options, invocation.transaction_id, path.join(temporaryRoot, "proof"));
  const { request, scope, subject, decision, persist } = proof;
  const fork = name => {
    const root = path.join(temporaryRoot, name); fs.cpSync(artifactRoot, root, { recursive: true });
    return { ...options, artifactRoot: root };
  };
  const valid = (payload, type) => assert.strictEqual(validatePayload(payload, type).valid, true, JSON.stringify(validatePayload(payload, type)));
  const state = local => runtime.dispatchStatus(local).leases[0];
  check("proof preparation does not discharge the pending orphan admission", () => {
    assert.strictEqual(state(options).pending_tool_requests, 1);
    assert.strictEqual(state(options).unresolved_gateway_transactions, 1);
    assert.deepStrictEqual(subject.references.receipt_ref, runtime.NONE_REF);
  });
  check("missing verifier quorum cannot settle", () => assert.throws(() => settleGatewayEffects(options,
    { ...request, attestation_refs: [request.attestation_refs[0]] }), /TOOL_EFFECT_ATTESTATION_INVALID/));
  check("request substitution invalidates exact USER consent", () => assert.throws(() => settleGatewayEffects(options,
    { ...request, id: "GESR-SUBSTITUTED" }), /TOOL_EFFECT_USER_DECISION_MISMATCH/));
  check("orphan cannot claim fabricated containment", () => assert.throws(() => settleGatewayEffects(options,
    { ...request, containment_observation_ref: proof.scopeRef }), /GATEWAY_SETTLEMENT_ORPHAN_BOUNDARY_INVALID/));
  check("AI cannot act as the final scope decision maker", () => {
    const local = fork("wrong-actor");
    const reference = persist({ ...decision, id: "DL-WRONG-ACTOR", decision_maker: "S3" }, "decision-logs", decision.decided_at, local.artifactRoot);
    assert.throws(() => settleGatewayEffects(local, { ...request, decision_ref: reference }), /TOOL_EFFECT_USER_DECISION_MISMATCH/);
  });
  check("later scope withdrawal blocks earlier approval", () => {
    const local = fork("withdrawn");
    persist({ ...decision, id: "DL-WITHDRAWN", decided_at: new Date().toISOString(), chosen_option: "keep-effects-unresolved" },
      "decision-logs", new Date().toISOString(), local.artifactRoot);
    assert.throws(() => settleGatewayEffects(local, request), /TOOL_EFFECT_USER_DECISION_CONFLICT/);
  });
  check("unbound review metadata cannot replace the original controller projection", () => {
    const local = fork("review-forged");
    const review = JSON.parse(fs.readFileSync(path.join(artifactRoot, request.review_ref.relative_path), "utf8"));
    review.id = "GER-FORGED";
    const reference = persist(review, "gateway-effect-reviews", review.reviewed_at, local.artifactRoot);
    assert.throws(() => settleGatewayEffects(local, { ...request, review_ref: reference }), /GATEWAY_SETTLEMENT_REVIEW_PROJECTION_MISMATCH/);
  });
  check("expired inspection evidence stays blocked", () => assert.throws(() => settleGatewayEffects({ ...options, now: scope.expires_at }, request),
    /GATEWAY_SETTLEMENT_REVIEW_NOT_BOUND/));
  for (const [name, mutate, pattern] of [
    ["target", input => { input.verificationTarget = { name: "GES-OTHER", digest: { sha256: "b".repeat(64) } }; }, /EXECUTION_EVIDENCE_EXPECTATION_MISMATCH/],
    ["identity", input => { input.workloadIdentityEvidenceReference = proof.identityRefs[1]; }, /TOOL_EFFECT_WORKLOAD_EVIDENCE_MISMATCH/],
    ["interval", input => { input.invocation.started_at = proof.receipt.finished_at; }, /TOOL_EFFECT_EXECUTION_WINDOW_MISMATCH/]
  ]) check(`signed verifier ${name} substitution cannot settle`, () => {
    const local = fork(`execution-${name}`);
    const input = clone(proof.executionInputs[0]); input.evidenceId = `VEE-WRONG-${name}`;
    mutate(input);
    const evidence = require("./verifier-execution-evidence").createVerifierExecutionEvidence(input);
    const evidenceRef = persist(evidence, "verifier-execution-evidence", evidence.issued_at, local.artifactRoot);
    const attestation = require("./verification-attestation").createVerificationAttestation({ receipt: proof.receipt,
      receiptReference: proof.receiptRef, verifier: proof.trust.verifiers[0], privateKeyPem: proof.keys[0].privateKey,
      executionEvidenceReference: evidenceRef, executionOrigin: "remote", invocationId: `INV-WRONG-${name}`,
      issuedAt: new Date().toISOString(), expiresAt: scope.expires_at, nonce: `synthetic-wrong-execution-${name}` });
    const attestationRef = persist(attestation, "verification-attestations", attestation.issued_at, local.artifactRoot);
    assert.throws(() => settleGatewayEffects(local, { ...request, attestation_refs: [attestationRef, proof.attestationRefs[1]] }), pattern);
  });
  for (const field of ["decision_ref", "cycle_order_ref"]) check(`hook-family ${field} consumption blocks gateway reuse`, () => {
    const local = fork(`cross-${field}`);
    const existing = sample("valid-tool-effect-settlement");
    existing.request.mission_id = request.mission_id; existing.request.wave_id = request.wave_id;
    existing.request[field] = request[field];
    existing.request_sha256 = runtime.inputDigest(existing.request); existing.id = `TESL-${existing.request_sha256.slice(0, 32)}`;
    valid(existing, "tool-effect-settlement");
    persist(existing, "tool-effect-settlements", existing.settled_at, local.artifactRoot);
    assert.throws(() => settleGatewayEffects(local, request), /EFFECT_SETTLEMENT_INPUT_ALREADY_CONSUMED/);
  });
  for (const mutation of ["manifest", "expiry", "repository"]) check(`${mutation} race at publication denies settlement`, () => {
    const local = fork(`race-${mutation}`);
    const readme = path.join(setup.repository, "README.md");
    const original = fs.readFileSync(readme);
    let fired = false;
    beforePublication = input => {
      if (input.kind !== "gateway-effect-settlements") return;
      beforePublication = null; fired = true;
      if (mutation === "expiry") local.now = scope.expires_at;
      else if (mutation === "repository") fs.appendFileSync(readme, "synthetic concurrent drift\n");
      else persist({ id: "OBS-RACE" }, "gateway-effect-observations", new Date().toISOString(), local.artifactRoot);
    };
    try {
      assert.throws(() => settleGatewayEffects(local, request), /GATEWAY_SETTLEMENT_(MANIFEST_CHANGED|EXPIRED|REVIEW_PROJECTION_MISMATCH)/);
      assert(fired);
    } finally { beforePublication = null; fs.writeFileSync(readme, original); }
    assert.strictEqual(state(local).pending_tool_requests, 1);
  });
  for (const stage of ["prepared", "artifact_written", "history_created", "manifest_committed"]) {
    check(`${stage} crash cannot bypass store recovery or reuse failed authority`, () => {
      const local = fork(`crash-${stage}`);
      let fired = false;
      beforePublication = input => {
        if (input.kind !== "gateway-effect-settlements") return;
        beforePublication = null; fired = true; input.faultInjectionStage = stage;
      };
      try { assert.throws(() => settleGatewayEffects(local, request), /Injected artifact transaction failure/); assert(fired); }
      finally { beforePublication = null; }
      assert.throws(() => state(local), /PENDING_TRANSACTION/);
      assert.strictEqual(store.verifyRepositoryArtifacts({ repositoryPath: setup.repository, artifactRoot: local.artifactRoot, recover: true }).valid, true);
      if (stage === "prepared") {
        assert.strictEqual(state(local).pending_tool_requests, 1);
        assert.throws(() => settleGatewayEffects({ ...local, now: scope.expires_at }, request), /GATEWAY_SETTLEMENT_REVIEW_NOT_BOUND/);
        assert.strictEqual(settleGatewayEffects(local, request).reused, false);
      } else {
        assert.strictEqual(settleGatewayEffects(local, request).reused, true);
      }
      assert.strictEqual(state(local).unresolved_gateway_transactions, 0);
      assert.strictEqual(state(local).failed_effect_revocation_required, true);
      assert.throws(() => runtime.completeLease(local, setup.issued.lease.id), /RECONCILED_FAILED_AGENT/);
    });
  }
  let settled;
  check("exact signed proof and USER judgement discharge only the orphan admission", () => {
    settled = settleGatewayEffects(options, request);
    valid(settled.settlement, "gateway-effect-settlement");
    assert.strictEqual(settled.reused, false);
    assert.deepStrictEqual(settled.settlement.effect_checkpoint_ref, runtime.NONE_REF);
    assert.strictEqual(settled.settlement.containment_required, false);
    assert.strictEqual(settled.settlement.tool_execution_authorized, false);
    assert.strictEqual(settled.settlement.release_authorized, false);
    const projection = state(options);
    assert.strictEqual(projection.pending_tool_requests, 0);
    assert.strictEqual(projection.unresolved_gateway_transactions, 0);
    assert.strictEqual(projection.reconciled_failed_effects, 1);
    assert.strictEqual(projection.failed_effect_revocation_required, true);
    assert.strictEqual(projection.status, "blocked");
    const status = gateway.gatewayStatus(options).transactions[0];
    assert.strictEqual(status.state, "denied");
    assert.strictEqual(status.effects_reconciled, true);
    assert.deepStrictEqual(status.receipt_ref, runtime.NONE_REF);
    assert.strictEqual(status.execution_permitted, false);
  });
  check("exact retry preserves the one retained settlement", () => {
    const retry = settleGatewayEffects(options, request);
    assert.strictEqual(retry.reused, true);
    assert.deepStrictEqual(retry.settlement_ref, settled.settlement_ref);
  });
  check("changed request cannot reuse the discharged admission", () => assert.throws(() => settleGatewayEffects(options,
    { ...request, id: "GESR-REUSE" }), /GATEWAY_SETTLEMENT_ALREADY_CONSUMED/));
  check("forged retained settlement cannot hide behind status or exact retry", () => {
    const local = fork("forged-retained");
    const forged = clone(settled.settlement);
    forged.request.id = "GESR-FORGED"; forged.request_sha256 = runtime.inputDigest(forged.request);
    for (const key of ["decision_ref", "cycle_order_ref"]) forged.request[key].sha256 = "f".repeat(64);
    forged.request_sha256 = runtime.inputDigest(forged.request);
    forged.id = `GESL-${forged.request_sha256.slice(0, 32)}`;
    persist(forged, "gateway-effect-settlements", forged.settled_at, local.artifactRoot);
    assert.throws(() => settleGatewayEffects(local, request), /GATEWAY_SETTLEMENT_PUBLICATION_MISMATCH/);
    assert.throws(() => runtime.dispatchStatus(local), /GATEWAY_SETTLEMENT_PUBLICATION_MISMATCH/);
  });
  for (const field of ["decision_ref", "cycle_order_ref"]) check(`later cross-family ${field} conflict cannot hide behind exact retry`, () => {
    const local = fork(`conflict-${field}`);
    const other = sample("valid-tool-effect-settlement");
    other.request.mission_id = request.mission_id; other.request.wave_id = request.wave_id;
    other.request[field] = request[field];
    other.request_sha256 = runtime.inputDigest(other.request); other.id = `TESL-${other.request_sha256.slice(0, 32)}`;
    persist(other, "tool-effect-settlements", other.settled_at, local.artifactRoot);
    assert.throws(() => settleGatewayEffects(local, request), /EFFECT_SETTLEMENT_INPUT_CONFLICT/);
    assert.throws(() => state(local), /EFFECT_SETTLEMENT_INPUT_CONFLICT/);
  });
  for (const status of ["active", "completed", "interrupted", "superseded"]) check(`legacy ${status} cannot hide reconciled gateway failure`, () => {
    const local = fork(`legacy-${status}`);
    const previous = JSON.parse(fs.readFileSync(path.join(artifactRoot, subject.references.checkpoint_ref.relative_path), "utf8"));
    const legacy = { ...previous, id: `AEC-LEGACY-${status}`, sequence: previous.sequence + 1,
      previous_checkpoint_ref: subject.references.checkpoint_ref,
      checkpoint_kind: { active: "post_tool", completed: "completion", interrupted: "interruption", superseded: "supersession" }[status],
      lease_status: status, tool_admission_ref: status === "active" ? subject.references.admission_ref : runtime.NONE_REF,
      execution_result: status === "active" ? { status: "succeeded", provider_result_sha256: "b".repeat(64), external_effects: "none" }
        : { status: "not_applicable", provider_result_sha256: "none", external_effects: "none" }, recorded_at: new Date().toISOString() };
    valid(legacy, "agent-execution-checkpoint");
    persist(legacy, "agent-execution-checkpoints", legacy.recorded_at, local.artifactRoot);
    assert.strictEqual(state(local).reconciled_failed_effects, 1);
    assert.strictEqual(state(local).failed_effect_revocation_required, true);
    assert.throws(() => runtime.completeLease(local, setup.issued.lease.id), /RECONCILED_FAILED_AGENT/);
    assert.throws(() => runtime.resumeLease(local, setup.issued.lease.id, { sessionId: "legacy", providerAgentId: "main" }), /RECONCILED_FAILED_AGENT/);
    assert.throws(() => runtime.authorizeDispatchPolicy(local, setup.draft), /RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED/);
    runtime.revokeLease(local, setup.issued.lease.id);
    assert.strictEqual(state(local).failed_effect_revocation_required, false);
  });
  for (const skill of ["codex-skills", ".claude/skills"]) check(`${skill} wrapper executes outside the doctrine repository`, () => {
    const requestPath = path.join(temporaryRoot, "settlement-request.json");
    fs.writeFileSync(requestPath, JSON.stringify(request));
    const script = path.join(__dirname, skill, "controls-doctrine-operator/scripts/settle_gateway_effects.js");
    for (const command of ["decision-option", "settle"]) {
      const args = [command, "--request", requestPath];
      if (command === "settle") args.push("--repository", setup.repository, "--artifact-root", artifactRoot);
      const run = spawnSync(process.execPath, [script, ...args], { cwd: temporaryRoot, encoding: "utf8" });
      assert.strictEqual(run.status, 0, run.stderr);
      if (command === "decision-option") assert.strictEqual(JSON.parse(run.stdout).chosen_option, decisionOption(request));
      else assert.strictEqual(JSON.parse(run.stdout).reused, true);
    }
  });
  check("settlement cannot complete or resume the failed agent", () => {
    assert.throws(() => runtime.completeLease(options, setup.issued.lease.id), /RECONCILED_FAILED_AGENT/);
    assert.throws(() => runtime.resumeLease(options, setup.issued.lease.id, { sessionId: "wrong", providerAgentId: "main" }), /RECONCILED_FAILED_AGENT/);
    assert.throws(() => runtime.authorizeDispatchPolicy(options, setup.draft), /RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED/);
  });
  check("post-settlement revocation is explicit and cannot be backdated", () => {
    assert.throws(() => runtime.revokeLease({ ...options, now: new Date(Date.parse(settled.settlement.settled_at) - 1).toISOString() },
      setup.issued.lease.id), /RECONCILED_FAILED_AGENT_REVOCATION_TIME_INVALID/);
    runtime.revokeLease(options, setup.issued.lease.id);
    assert.strictEqual(state(options).failed_effect_revocation_required, false);
    assert.strictEqual(state(options).reconciled_failed_effects, 1);
    assert.throws(() => runtime.completeLease(options, setup.issued.lease.id), /RECONCILED_FAILED_AGENT/);
  });
  check("historical settlement survives proof expiry and later repository work", () => {
    fs.appendFileSync(path.join(setup.repository, "README.md"), "later work\n");
    const projection = state({ ...options, now: new Date(Date.now() + 86400000).toISOString() });
    assert.strictEqual(projection.unresolved_gateway_transactions, 0);
    assert.strictEqual(projection.pending_tool_requests, 0);
    assert.strictEqual(projection.reconciled_failed_effects, 1);
  });
  for (const stage of ["recovered", "committed"]) check(`${stage} fixture execution cannot substitute inspection for containment`, () => {
    const other = setupScenario(`UNSUPPORTED-${stage}`);
    const otherRequest = gatewayRequest(other, "001");
    const initial = trustedOptions(other, otherRequest, "2026-07-24T01:00:10Z");
    gateway.admitGatewayRequest(initial, otherRequest, toolInput);
    const begun = gateway.beginGatewayExecution({ ...initial, now: "2026-07-24T01:00:20Z" }, otherRequest.transaction_id);
    if (stage === "recovered") gateway.recoverGatewayTransaction({ ...initial, now: "2026-07-24T01:00:30Z" }, otherRequest.transaction_id);
    else gateway.commitGatewayExecution({ ...initial, now: "2026-07-24T01:00:30Z" }, otherRequest.transaction_id, {
      executionEventRef: begun.execution_event_ref, toolInput, result: { synthetic: true },
      executor: sample("valid-tool-execution-receipt").executor, status: "failed",
      startedAt: "2026-07-24T01:00:20Z", finishedAt: "2026-07-24T01:00:25Z", exitCode: 1
    });
    const local = { ...initial }; delete local.now;
    const otherProof = createGatewaySettlementFixture(local, otherRequest.transaction_id, path.join(temporaryRoot, `proof-unsupported-${stage}`));
    assert.throws(() => settleGatewayEffects(local, otherProof.request), /GATEWAY_SETTLEMENT_CONTAINMENT_ADAPTER_REQUIRED/);
    assert.strictEqual(state(local).unresolved_gateway_transactions, 1);
  });
  assert.strictEqual(store.verifyRepositoryArtifacts({ repositoryPath: setup.repository, artifactRoot }).valid, true);
  console.log(JSON.stringify({ total: count, passed: count, failed: 0 }));
} finally { beforePublication = null; fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
