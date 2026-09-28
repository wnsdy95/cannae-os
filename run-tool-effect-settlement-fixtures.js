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
const { reviewToolEffects } = require("./tool-effect-review");
const { decisionOption, settleToolEffects } = require("./tool-effect-settlement");
const { computeRepositoryState, executeVerification } = require("./verification-runner");
const { superviseCampaign } = require("./campaign-supervisor");
const { keyPair, makeCa, makeLeaf } = require("./verifier-identity-fixture-support");
const { certificateSha256, createVerifierIdentityEvidence } = require("./verifier-identity-evidence");
const { createVerifierExecutionEvidence } = require("./verifier-execution-evidence");
const { createVerificationAttestation } = require("./verification-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-effect-settlement-"));
const repository = path.join(directory, "repository");
const artifactRoot = path.join(directory, "artifacts");
const options = { repository, artifactRoot };
const sample = name => JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", `${name}.json`), "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const horizon = new Date(Date.now() + 240000).toISOString();
const future = () => horizon;
const past = new Date(Date.now() - 10000).toISOString();
let count = 0;
function check(name, fn) { fn(); count++; console.log(`PASS ${name}`); }
function git(...args) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
}
function persist(payload, kind, createdAt = now(), root = artifactRoot) {
  const result = write({ repositoryPath: repository, artifactRoot: root, missionId: lease.mission_id, waveId: lease.wave_id,
    kind, artifactId: payload.id, payload, createdAt });
  return { artifact_id: payload.id, relative_path: result.relative_path, sha256: result.sha256 };
}
function valid(payload, type) { assert.strictEqual(validatePayload(payload, type).valid, true, JSON.stringify(validatePayload(payload, type))); }
function forkStore(name) {
  const root = path.join(directory, name);
  fs.cpSync(artifactRoot, root, { recursive: true });
  return { ...options, artifactRoot: root };
}

try {
  fs.mkdirSync(repository);
  fs.writeFileSync(path.join(repository, "README.md"), "synthetic settlement fixture\n");
  fs.writeFileSync(path.join(repository, "check-effects.js"), `
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { inputDigest } = require(${JSON.stringify(path.join(__dirname, "dispatch-runtime-controller.js"))});
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const root = value("--artifact-root");
const scope = JSON.parse(fs.readFileSync(path.join(root, value("--effect-scope")), "utf8"));
assert.strictEqual(inputDigest(scope), value("--effect-scope-sha256"));
for (const resource of scope.resources) {
  const observed = JSON.parse(fs.readFileSync(path.join(root, resource.evidence_refs[0].relative_path), "utf8"));
  assert.strictEqual(fs.readFileSync(resource.target, "utf8"), observed.content);
}
`);
  git("init", "-q"); git("config", "user.name", "Settlement Fixture"); git("config", "user.email", "settlement@example.test");
  git("add", "."); git("commit", "-qm", "synthetic baseline");
  const resolved = store.resolveRepository(repository);
  const binding = { repository_key: resolved.key, identity_fingerprint: resolved.identity_fingerprint };
  var lease = sample("valid-agent-dispatch-lease");
  lease.repository_binding = binding;
  lease.initial_repository_state = runtime.runtimeRepositoryState(repository);
  const leaseRef = persist(lease, "agent-dispatch-leases", lease.issued_at);
  const baseline = sample("valid-agent-execution-checkpoint");
  baseline.lease_ref = leaseRef;
  baseline.repository_state = lease.initial_repository_state;
  const baselineRef = persist(baseline, "agent-execution-checkpoints", baseline.recorded_at);
  const admission = sample("valid-tool-admission-event");
  admission.lease_ref = leaseRef; admission.checkpoint_ref = baselineRef; admission.state_before = baseline.repository_state;
  const admissionRef = persist(admission, "tool-admission-events", admission.decided_at);
  const failure = { ...clone(baseline), id: "AEC-SETTLEMENT-FAILURE", sequence: 1, checkpoint_kind: "post_tool",
    lease_status: "blocked", previous_checkpoint_ref: baselineRef, tool_admission_ref: admissionRef,
    execution_result: { status: "failed", provider_result_sha256: "a".repeat(64), external_effects: "unknown" },
    reason_codes: ["SYNTHETIC_PROVIDER_FAILURE"], recorded_at: past };
  const failureRef = persist(failure, "agent-execution-checkpoints", past);
  const observationRef = persist({ id: "OBS-SETTLEMENT", synthetic: true, content: "synthetic settlement fixture\n" }, "tool-effect-observations");
  const scope = sample("valid-tool-effect-scope");
  Object.assign(scope, { repository_binding: binding, lease_ref: leaseRef, checkpoint_ref: failureRef, admission_ref: admissionRef,
    expected_repository_state: computeRepositoryState(repository), created_at: now(), expires_at: future() });
  scope.resources[0].evidence_refs = [observationRef];
  const scopeRef = persist(scope, "tool-effect-scopes", scope.created_at);
  const scopeHash = runtime.inputDigest(scope);
  const plan = sample("valid-verification-plan");
  Object.assign(plan, { mission_id: scope.mission_id, repository_binding: binding, candidate_id: scope.id, candidate_revision: scopeHash,
    expected_repository_state: scope.expected_repository_state, created_at: now() });
  plan.checks = [{ id: "VCK-README", purpose: "Inspect exact retained scope and README observation.", executable: "node",
    args: ["check-effects.js", "--artifact-root", artifactRoot, "--effect-scope", scopeRef.relative_path, "--effect-scope-sha256", scopeHash],
    working_directory: ".", timeout_ms: 10000, expected_exit_codes: [0] }];

  // Cryptography is real; provider/isolation claims are synthetic fixture inputs, not deployment evidence.
  const ca = makeCa(directory, "settlement-root");
  const logKey = keyPair();
  const builderKey = keyPair();
  const keys = [keyPair(), keyPair()];
  const trust = sample("valid-verifier-trust-policy-v0.4");
  trust.repository_binding = binding; trust.created_at = past; trust.expires_at = future();
  trust.quorum.minimum_valid_attestations = 2; trust.quorum.minimum_independence_groups = 2;
  trust.identity_assurance.trusted_x509_roots = [{ id: "ROOT-SETTLEMENT", trust_domain: "verification.example.test",
    certificate_pem: ca.certificate, certificate_sha256: certificateSha256(ca.certificate) }];
  trust.identity_assurance.trusted_transparency_logs = [{ id: "LOG-SETTLEMENT", origin: "settlement.example.test/log",
    key_id: logKey.keyId, public_key_pem: logKey.publicKey }];
  trust.identity_assurance.sigstore_trusted_root_refs = [persist(sample("valid-sigstore-trusted-root"), "sigstore-trusted-roots")];
  trust.verifiers = keys.map((key, index) => ({ id: `VERIFIER-SETTLEMENT-${index}`, key_id: key.keyId, public_key_pem: key.publicKey,
    independence_group: `synthetic-group-${index}`, status: "active", allowed_repository_keys: [resolved.key],
    allowed_execution_origins: ["remote"], allowed_attestation_types: ["verification_receipt", "comparative_evaluation_report"],
    workload_identity: { type: "spiffe_x509", spiffe_id: `spiffe://verification.example.test/settlement/${index}`,
      trust_root_id: "ROOT-SETTLEMENT", transparency_log_id: "LOG-SETTLEMENT" }, valid_from: past, valid_until: future() }));
  const runtimePolicy = sample("valid-verifier-runtime-policy");
  runtimePolicy.repository_binding = binding; runtimePolicy.created_at = past; runtimePolicy.expires_at = future();
  const profile = runtimePolicy.profiles[0];
  profile.provider = "generic_oci";
  profile.builder = { id: "https://settlement.example.test/builder", key_id: builderKey.keyId, public_key_pem: builderKey.publicKey };
  profile.provider_identity = { issuer: "https://settlement.example.test", subject: "synthetic-builder",
    audience: "cannae-verifier-execution", required_claims: { runner_pool: "synthetic-pool", tenant: "fixture" } };
  profile.execution.argv = ["node", ...plan.checks[0].args];
  runtimePolicy.assignments = trust.verifiers.map(verifier => ({ verifier_id: verifier.id, profile_id: profile.id,
    allowed_purposes: verifier.allowed_attestation_types }));
  valid(runtimePolicy, "verifier-runtime-policy");
  const runtimeRef = persist(runtimePolicy, "verifier-runtime-policies");
  trust.execution_assurance.runtime_policy_ref = runtimeRef;
  valid(trust, "verifier-trust-policy");
  const trustRef = persist(trust, "verifier-trust-policies");
  const identityRefs = trust.verifiers.map((verifier, index) => {
    const leaf = makeLeaf(directory, ca, `settlement-leaf-${index}`, [verifier.workload_identity.spiffe_id]);
    const evidence = createVerifierIdentityEvidence({ evidenceId: `VIE-SETTLEMENT-${index}`, verifier, trustPolicy: trust,
      repositoryBinding: binding, workloadPrivateKeyPem: leaf.key, verifierPrivateKeyPem: keys[index].privateKey,
      logPrivateKeyPem: logKey.privateKey, leafCertificatePem: leaf.certificate, purposes: verifier.allowed_attestation_types,
      nonce: `settlement-identity-nonce-${index}`, issuedAt: now(), checkpointIssuedAt: now(), expiresAt: future() });
    return persist(evidence, "verifier-identity-evidence", evidence.issued_at);
  });
  const campaign = sample("valid-self-improvement-campaign");
  Object.assign(campaign, { schema_version: "0.3", mission_id: scope.mission_id, created_at: past,
    repository_binding: { ...binding, baseline_revision: resolved.head_commit },
    attestation_policy: { required: true, trust_policy_ref: trustRef, minimum_valid_attestations: 2, minimum_independence_groups: 2,
      require_distinct_key_ids: true, max_attestation_age_seconds: 300 } });
  valid(campaign, "self-improvement-campaign");
  const campaignRef = persist(campaign, "self-improvement-campaigns", past);
  const order = superviseCampaign({ repositoryPath: repository, artifactRoot, campaignId: campaign.id }).order;
  assert.strictEqual(order.status, "ready", JSON.stringify(order));
  const orderRef = persist(order, "self-improvement-cycle-orders", order.generated_at);
  plan.campaign_id = campaign.id;
  const receipt = executeVerification(campaign, plan, repository);
  assert.strictEqual(receipt.overall_status, "passed", JSON.stringify(receipt));
  const planRef = persist(plan, "verification-plans", plan.created_at);
  const receiptRef = persist(receipt, "verification-receipts", receipt.finished_at);
  const executionOptions = [];
  const attestationRefs = trust.verifiers.map((verifier, index) => {
    const input = { trustPolicy: trust, runtimePolicy, runtimePolicyReference: runtimeRef,
      verifierId: verifier.id, purpose: "verification_receipt", subjectReference: receiptRef,
      workloadIdentityEvidenceReference: identityRefs[index], repositoryBinding: binding,
      repositoryState: { ...receipt.repository_state_before, dirty: false }, verificationTarget: { name: scope.id, digest: { sha256: scopeHash } },
      providerIdentity: { issuer: profile.provider_identity.issuer, subject: profile.provider_identity.subject,
        audience: profile.provider_identity.audience, claims: profile.provider_identity.required_claims },
      invocation: { id: `INV-SETTLEMENT-${index}`, started_at: receipt.started_at, finished_at: receipt.finished_at, exit_code: 0 },
      builderPrivateKeyPem: builderKey.privateKey, verifierPrivateKeyPem: keys[index].privateKey,
      issuedAt: now(), expiresAt: future(), evidenceId: `VEE-SETTLEMENT-${index}` };
    executionOptions.push(input);
    const execution = createVerifierExecutionEvidence(input);
    const executionRef = persist(execution, "verifier-execution-evidence", execution.issued_at);
    const attestation = createVerificationAttestation({ receipt, receiptReference: receiptRef, verifier,
      privateKeyPem: keys[index].privateKey, executionEvidenceReference: executionRef, executionOrigin: "remote",
      invocationId: `INV-ATTEST-SETTLEMENT-${index}`, issuedAt: now(), expiresAt: future(), nonce: `settlement-attestation-nonce-${index}` });
    return persist(attestation, "verification-attestations", attestation.issued_at);
  });
  const review = reviewToolEffects({ ...options, writeArtifact: true }, {
    scope_ref: scopeRef, verification_plan_ref: planRef, verification_receipt_ref: receiptRef });
  assert.strictEqual(review.status, "evidence_bound", JSON.stringify(review));
  const reviewRef = { artifact_id: review.id, relative_path: review.artifact.relative_path, sha256: review.artifact.sha256 };
  const request = { schema_version: "0.1", type: "ToolEffectSettlementRequest", id: "TESR-SETTLEMENT", mission_id: scope.mission_id,
    wave_id: scope.wave_id, review_ref: reviewRef, campaign_ref: campaignRef, cycle_order_ref: orderRef,
    attestation_refs: attestationRefs, decision_ref: scopeRef, scope_coverage_accepted: true, inspection_method_accepted: true };
  const decision = sample("valid-decision-log");
  Object.assign(decision, { id: "DL-SETTLEMENT", mission_id: scope.mission_id, decided_at: now(), decision_maker: "USER",
    decision_type: "scope", chosen_option: decisionOption(request),
    authority_basis: { basis_type: "retained_authority", reference: scope.id, summary: "Synthetic exact USER scope acceptance." },
    affected_artifacts: [reviewRef, campaignRef, orderRef, scopeRef, planRef, receiptRef, ...attestationRefs].map(item => item.relative_path) });
  decision.options_considered = [decision.chosen_option, "keep-effects-unresolved"];
  request.decision_ref = persist(decision, "decision-logs", decision.decided_at);

  check("review alone leaves unknown effects blocked", () => assert.strictEqual(runtime.dispatchStatus(options).leases[0].unresolved_tool_effects, 1));
  check("missing quorum blocks settlement", () => assert.throws(() => settleToolEffects(options, {
    ...request, attestation_refs: [attestationRefs[0]] }), /TOOL_EFFECT_ATTESTATION_INVALID/));
  check("wrong USER actor cannot clear effects", () => {
    const wrong = persist({ ...decision, id: "DL-WRONG-ACTOR", decision_maker: "S3" }, "decision-logs");
    assert.throws(() => settleToolEffects(options, { ...request, decision_ref: wrong }), /TOOL_EFFECT_USER_DECISION_MISMATCH/);
  });
  check("request substitution invalidates the exact USER decision", () => assert.throws(() => settleToolEffects(options, {
    ...request, id: "TESR-SUBSTITUTED" }), /TOOL_EFFECT_USER_DECISION_MISMATCH/));
  check("a later USER scope decision prevents reusing an earlier consent", () => {
    const isolated = forkStore("later-user-decision");
    const withdrawn = { ...clone(decision), id: "DL-WITHDRAWN", decided_at: now(), chosen_option: "keep-effects-unresolved" };
    persist(withdrawn, "decision-logs", withdrawn.decided_at, isolated.artifactRoot);
    assert.throws(() => settleToolEffects(isolated, request), /TOOL_EFFECT_USER_DECISION_CONFLICT/);
  });
  check("expired admission remains blocked", () => assert.throws(() => settleToolEffects({ ...options, now: scope.expires_at }, request), /TOOL_EFFECT_REVIEW_NOT_BOUND/));
  check("another campaign cannot substitute its trust policy", () => {
    const weak = clone(trust); weak.id = "VTP-WEAK"; weak.schema_version = "0.3"; delete weak.execution_assurance;
    const weakRef = persist(weak, "verifier-trust-policies");
    const other = clone(campaign); other.id = "SIC-WEAK"; other.attestation_policy.trust_policy_ref = weakRef;
    const otherRef = persist(other, "self-improvement-campaigns");
    assert.throws(() => settleToolEffects(options, { ...request, campaign_ref: otherRef }), /TOOL_EFFECT_VERIFICATION_CAMPAIGN_MISMATCH/);
  });
  function substituteExecution(name, change, pattern) {
    const input = { ...executionOptions[0], evidenceId: `VEE-${name}` };
    change(input);
    const execution = createVerifierExecutionEvidence(input);
    const executionRef = persist(execution, "verifier-execution-evidence", execution.issued_at);
    const attestation = createVerificationAttestation({ receipt, receiptReference: receiptRef, verifier: trust.verifiers[0],
      privateKeyPem: keys[0].privateKey, executionEvidenceReference: executionRef, executionOrigin: "remote",
      invocationId: `INV-${name}`, issuedAt: now(), expiresAt: future(), nonce: `synthetic-substitution-${name}` });
    const reference = persist(attestation, "verification-attestations", attestation.issued_at);
    assert.throws(() => settleToolEffects(options, { ...request, attestation_refs: [reference, attestationRefs[1]] }), pattern);
  }
  check("signed evidence for another verification target cannot settle this scope", () => substituteExecution("WRONG-TARGET",
    input => { input.verificationTarget = { name: "TES-OTHER", digest: { sha256: "a".repeat(64) } }; }, /EXECUTION_EVIDENCE_EXPECTATION_MISMATCH/));
  check("signed execution must bind the currently admitted workload evidence", () => substituteExecution("WRONG-IDENTITY",
    input => { input.workloadIdentityEvidenceReference = identityRefs[1]; }, /TOOL_EFFECT_WORKLOAD_EVIDENCE_MISMATCH/));
  check("signed execution window must include the real receipt", () => substituteExecution("WRONG-WINDOW",
    input => { input.invocation = { ...input.invocation, started_at: receipt.finished_at }; }, /TOOL_EFFECT_EXECUTION_WINDOW_MISMATCH/));
  check("schema-valid forged order must match historical pre-dispatch appraisal", () => {
    const isolated = forkStore("forged-order");
    const forged = { ...clone(order), id: "SCO-FORGED" };
    forged.task_order.task = "Substituted inspection task.";
    valid(forged, "self-improvement-cycle-order");
    const reference = persist(forged, "self-improvement-cycle-orders", forged.generated_at, isolated.artifactRoot);
    assert.throws(() => settleToolEffects(isolated, { ...request, cycle_order_ref: reference }), /TOOL_EFFECT_DISPATCH_PROOF_MISMATCH/);
  });
  check("gateway decision requires separate transaction settlement", () => {
    const isolated = forkStore("gateway-decision");
    const gateway = sample("valid-tool-gateway-decision"); gateway.admission_ref = admissionRef;
    persist(gateway, "tool-gateway-decisions", now(), isolated.artifactRoot);
    assert.throws(() => settleToolEffects(isolated, request), /TOOL_EFFECT_GATEWAY_SETTLEMENT_REQUIRED/);
  });
  check("gateway request without a decision still cannot use hook settlement", () => {
    const isolated = forkStore("gateway-request");
    const gateway = sample("valid-tool-gateway-request"); gateway.lease_ref = leaseRef;
    gateway.tool_call.tool_use_id = admission.tool_use_id;
    persist(gateway, "tool-gateway-requests", now(), isolated.artifactRoot);
    assert.throws(() => settleToolEffects(isolated, request), /TOOL_EFFECT_GATEWAY_SETTLEMENT_REQUIRED/);
  });
  check("expiry between appraisal and publication denies settlement", () => {
    const mutable = { ...options, now: now() };
    beforePublication = input => {
      if (input.kind !== "tool-effect-settlements") return;
      beforePublication = null; mutable.now = horizon;
    };
    try { assert.throws(() => settleToolEffects(mutable, request), /TOOL_EFFECT_SETTLEMENT_EXPIRED/); }
    finally { beforePublication = null; }
  });
  check("concurrent manifest changes deny settlement publication", () => {
    let fired = false;
    beforePublication = input => {
      if (input.kind !== "tool-effect-settlements") return;
      beforePublication = null; fired = true;
      persist({ id: "OBS-CONCURRENT", synthetic: true }, "tool-effect-observations");
    };
    try { assert.throws(() => settleToolEffects(options, request), /TOOL_EFFECT_SETTLEMENT_MANIFEST_CHANGED/); assert(fired); }
    finally { beforePublication = null; }
  });
  check("publication-time repository mutation cannot persist a settlement", () => {
    let fired = false;
    beforePublication = input => {
      if (input.kind !== "tool-effect-settlements") return;
      beforePublication = null; fired = true;
      fs.appendFileSync(path.join(repository, "README.md"), "concurrent change\n");
    };
    try { assert.throws(() => settleToolEffects(options, request), /TOOL_EFFECT_REVIEW_NOT_BOUND/); assert(fired); }
    finally { beforePublication = null; fs.writeFileSync(path.join(repository, "README.md"), "synthetic settlement fixture\n"); }
  });
  let settled;
  check("exact signed execution quorum and USER decision settle only the failed invocation", () => {
    settled = settleToolEffects(options, request);
    valid(settled.settlement, "tool-effect-settlement");
    assert.strictEqual(settled.reused, false);
    assert.strictEqual(settled.settlement.effects_settled, true);
    assert.strictEqual(settled.settlement.tool_execution_authorized, false);
    assert.strictEqual(settled.settlement.release_authorized, false);
    assert.strictEqual(settled.settlement.user_identity_authenticated, false);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(artifactRoot, failureRef.relative_path), "utf8")), failure);
    const status = runtime.dispatchStatus(options).leases[0];
    assert.strictEqual(status.unresolved_tool_effects, 0);
    assert.strictEqual(status.status, "blocked");
  });
  check("exact settlement retry is idempotent", () => {
    const retry = settleToolEffects(options, request);
    assert.strictEqual(retry.reused, true); assert.deepStrictEqual(retry.settlement_ref, settled.settlement_ref);
  });
  for (const skill of ["codex-skills/controls-doctrine-operator", ".claude/skills/controls-doctrine-operator"]) {
    check(`${skill} wrapper resolves doctrine outside the target repository`, () => {
      const requestPath = path.join(directory, "request.json");
      fs.writeFileSync(requestPath, `${JSON.stringify(request)}\n`);
      const script = path.join(__dirname, skill, "scripts", "settle_tool_effects.js");
      const command = args => spawnSync(process.execPath, [script, ...args, "--request", requestPath], {
        cwd: directory, encoding: "utf8", env: { ...process.env, CANNAE_OS_HOME: __dirname }
      });
      const option = command(["decision-option"]);
      assert.strictEqual(option.status, 0, option.stderr);
      assert.strictEqual(JSON.parse(option.stdout).chosen_option, decision.chosen_option);
      const result = command(["settle", "--repository", repository, "--artifact-root", artifactRoot]);
      assert.strictEqual(result.status, 0, result.stderr);
      assert.strictEqual(JSON.parse(result.stdout).reused, true);
    });
  }
  check("settlement cannot be republished with another request identity", () => assert.throws(() => settleToolEffects(options, {
    ...request, id: "TESR-REUSE" }), /TOOL_EFFECT_SETTLEMENT_ALREADY_CONSUMED/));
  check("forged retained settlement cannot hide behind an idempotent retry", () => {
    const isolated = forkStore("forged-settlement");
    const forged = clone(settled.settlement);
    forged.request.id = "TESR-FORGED";
    forged.request_sha256 = runtime.inputDigest(forged.request);
    forged.id = `TESL-${forged.request_sha256.slice(0, 32)}`;
    persist(forged, "tool-effect-settlements", forged.settled_at, isolated.artifactRoot);
    assert.throws(() => settleToolEffects(isolated, request), /TOOL_EFFECT_SETTLEMENT_PUBLICATION_MISMATCH/);
    assert.throws(() => runtime.dispatchStatus(isolated), /TOOL_EFFECT_SETTLEMENT_PUBLICATION_MISMATCH/);
  });
  check("settlement does not turn a failed agent into a successful agent", () => {
    assert.throws(() => runtime.completeLease(options, lease.id), /blocked, not active/);
    const revoked = runtime.revokeLease(options, lease.id);
    assert.strictEqual(revoked.status, "revoked");
    assert.strictEqual(revoked.execution_authorized, false);
  });
  check("historical proof replay survives later repository drift and evidence expiry", () => {
    fs.appendFileSync(path.join(repository, "README.md"), "later authorized work\n");
    assert.strictEqual(runtime.dispatchStatus({ ...options, now: new Date(Date.now() + 86400000).toISOString() }).leases[0].unresolved_tool_effects, 0);
  });
  assert.strictEqual(store.verifyRepositoryArtifacts({ repositoryPath: repository, artifactRoot }).valid, true);
  console.log(JSON.stringify({ total: count, passed: count, failed: 0 }));
} finally { beforePublication = null; fs.rmSync(directory, { recursive: true, force: true }); }
