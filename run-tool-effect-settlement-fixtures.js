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
const lifecycle = require("./skill-mission-controller");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-effect-settlement-"));
const repository = path.join(directory, "repository");
const artifactRoot = path.join(directory, "artifacts");
const options = { repository, artifactRoot };
const sample = name => JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", `${name}.json`), "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const horizon = new Date(Date.now() + 900000).toISOString();
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
  const wavePlan = sample("valid-mission-wave-plan");
  Object.assign(wavePlan, { mission_id: lease.mission_id, wave_id: lease.wave_id, created_at: past, valid_until: future() });
  wavePlan.adaptive_work.enabled = false;
  wavePlan.agents = [{ ...wavePlan.agents[0], agent_id: lease.agent_id }];
  const draft = sample("valid-dispatch-tool-policy");
  draft.schema_version = "0.1"; delete draft.authorization;
  draft.approved_at = past; draft.valid_until = future();
  wavePlan.dispatch_control = { required: true, enforcement_level: "guardrail", gateway_exclusive: false,
    policy_authorizations: [{ agent_id: lease.agent_id, provider: lease.provider, policy_id: draft.id, draft_sha256: runtime.inputDigest(draft) }] };
  const opened = lifecycle.openWave(wavePlan, { ...options, doctrineRoot: __dirname });
  assert.strictEqual(opened.status, "ready", JSON.stringify(opened));
  lease.plan_ref = opened.plan_ref;
  lease.routing_preflight_ref = opened.routing_preflight_ref;
  lease.context_pack_ref = opened.context_packs[0].context_pack_ref;
  lease.tool_policy_ref = runtime.authorizeDispatchPolicy(options, draft).policy_ref;
  lease.not_before = past; lease.issued_at = past; lease.expires_at = future();
  const leaseRef = persist(lease, "agent-dispatch-leases", lease.issued_at);
  const baseline = sample("valid-agent-execution-checkpoint");
  baseline.lease_ref = leaseRef;
  baseline.repository_state = lease.initial_repository_state;
  const baselineRef = persist(baseline, "agent-execution-checkpoints", baseline.recorded_at);
  const admission = sample("valid-tool-admission-event");
  admission.lease_ref = leaseRef; admission.checkpoint_ref = baselineRef; admission.state_before = baseline.repository_state;
  admission.tool_policy_ref = lease.tool_policy_ref;
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
  trust.quorum.max_attestation_age_seconds = 900;
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
      require_distinct_key_ids: true, max_attestation_age_seconds: 900 } });
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
  for (const [name, mutate] of [
    ["metadata", value => { value.mission_id = "MIS-FORGED"; value.reviewed_at = new Date(Date.parse(value.reviewed_at) + 1).toISOString(); }],
    ["chronology", value => { value.reviewed_at = scope.created_at; }]
  ]) {
    check(`retained review ${name} must match its original projection`, () => {
      const isolated = forkStore(`review-${name}`);
      const forged = JSON.parse(fs.readFileSync(path.join(artifactRoot, reviewRef.relative_path), "utf8"));
      mutate(forged);
      const references = { scope_ref: forged.scope_ref, verification_plan_ref: forged.verification_plan_ref,
        verification_receipt_ref: forged.verification_receipt_ref };
      forged.id = `TER-${runtime.inputDigest({ references, at: forged.reviewed_at }).slice(0, 32)}`;
      valid(forged, "tool-effect-review");
      const reference = persist(forged, "tool-effect-reviews", forged.reviewed_at, isolated.artifactRoot);
      assert.throws(() => settleToolEffects(isolated, { ...request, review_ref: reference }), /TOOL_EFFECT_REVIEW_PROJECTION_MISMATCH/);
    });
  }
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
    try { assert.throws(() => settleToolEffects(options, request), /TOOL_EFFECT_REVIEW_PROJECTION_MISMATCH/); assert(fired); }
    finally { beforePublication = null; fs.writeFileSync(path.join(repository, "README.md"), "synthetic settlement fixture\n"); }
  });
  function legacyCheckpoint(isolated, status, suffix, recordedAt = now()) {
    const active = status === "active";
    const legacy = { ...clone(failure), id: `AEC-LEGACY-${suffix}`, sequence: 2,
      checkpoint_kind: active ? "post_tool" : { completed: "completion", superseded: "supersession", revoked: "revocation", interrupted: "interruption" }[status],
      lease_status: status, previous_checkpoint_ref: failureRef,
      tool_admission_ref: active ? admissionRef : clone(runtime.NONE_REF),
      execution_result: active ? { status: "succeeded", provider_result_sha256: "b".repeat(64), external_effects: "none" }
        : { status: "not_applicable", provider_result_sha256: "none", external_effects: "none" },
      reason_codes: ["SYNTHETIC_LEGACY_HISTORY"], recorded_at: recordedAt };
    valid(legacy, "agent-execution-checkpoint");
    return persist(legacy, "agent-execution-checkpoints", legacy.recorded_at, isolated.artifactRoot);
  }
  check("legacy revocation before reconciliation does not satisfy post-settlement revocation", () => {
    const isolated = forkStore("legacy-revoked-before-settlement");
    const sameTime = now();
    legacyCheckpoint(isolated, "revoked", "REVOKED-BEFORE", sameTime);
    settleToolEffects({ ...isolated, now: sameTime }, request);
    assert.strictEqual(runtime.dispatchStatus(isolated).leases[0].failed_effect_revocation_required, true);
    assert.strictEqual(runtime.revokeLease(isolated, lease.id).status, "revoked");
    assert.strictEqual(runtime.dispatchStatus(isolated).leases[0].failed_effect_revocation_required, false);
  });
  for (const status of ["active", "interrupted"]) check(`publication rejects reconciliation racing ${status === "active" ? "completion" : "resume"}`, () => {
    const isolated = forkStore(`publication-race-${status}`);
    const child = { ...clone(lease), id: `ADL-RACE-${status}`, previous_lease_ref: leaseRef, issuance_reason: "resume",
      session_binding: { session_id: `race-${status}`, provider_agent_id: "main" } };
    const childRef = persist(child, "agent-dispatch-leases", now(), isolated.artifactRoot);
    const childBaseline = { ...clone(baseline), id: `AEC-RACE-BASE-${status}`, lease_ref: childRef,
      session_binding: child.session_binding, recorded_at: now() };
    const childBaselineRef = persist(childBaseline, "agent-execution-checkpoints", childBaseline.recorded_at, isolated.artifactRoot);
    if (status === "interrupted") {
      const interrupted = { ...clone(childBaseline), id: "AEC-RACE-INTERRUPTED", sequence: 1,
        previous_checkpoint_ref: childBaselineRef, checkpoint_kind: "interruption", lease_status: "interrupted", recorded_at: now() };
      valid(interrupted, "agent-execution-checkpoint");
      persist(interrupted, "agent-execution-checkpoints", interrupted.recorded_at, isolated.artifactRoot);
    }
    let fired = false;
    beforePublication = input => {
      if (input.kind !== "agent-execution-checkpoints") return;
      beforePublication = null; fired = true;
      settleToolEffects(isolated, request);
    };
    try {
      assert.throws(() => status === "active" ? runtime.completeLease(isolated, child.id)
        : runtime.resumeLease(isolated, child.id, { sessionId: "race-resume", providerAgentId: "main" }), /RECONCILED_FAILED_AGENT/);
      assert(fired, "must reach the publication boundary before injecting settlement");
      assert.strictEqual(runtime.dispatchStatus(isolated).leases.find(item => item.lease_id === child.id).status, status);
    } finally { beforePublication = null; }
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
    assert.strictEqual(status.reconciled_failed_effects, 1);
    assert.deepStrictEqual(status.reconciled_effect_checkpoint_refs, [failureRef]);
    assert.strictEqual(status.failed_effect_revocation_required, true);
  });
  check("exact settlement retry is idempotent", () => {
    const retry = settleToolEffects(options, request);
    assert.strictEqual(retry.reused, true); assert.deepStrictEqual(retry.settlement_ref, settled.settlement_ref);
  });
  check("historical hook projection replays its own settlement prefix without permitting stale live views", () => {
    const isolated = forkStore("historical-dispatch");
    const verified = require("./campaign-supervisor").loadVerifiedStore(repository, isolated.artifactRoot);
    const observed = { revision: verified.manifest.manifest_revision, sha256: verified.verification.manifest_sha256 };
    const staleView = { ...verified, repository: verified.verification.repository };
    persist({ id: "NOTE-Historical", note: "Later evidence is not earlier settlement." }, "notes", now(), isolated.artifactRoot);
    const before = runtime.historicalDispatchStatus(isolated, settled.settlement.observed_manifest).leases[0];
    const after = runtime.historicalDispatchStatus(isolated, observed).leases[0];
    assert.strictEqual(before.unresolved_tool_effects, 1);
    assert.strictEqual(after.unresolved_tool_effects, 0);
    assert.strictEqual(after.failed_effect_revocation_required, true);
    assert.throws(() => require("./tool-effect-settlement").settledToolEffectState(staleView, failure.lease_ref), /EFFECT_SETTLEMENT_STORE_CHANGED/);
  });
  check("post-settlement revocation cannot be backdated", () => {
    assert.throws(() => runtime.revokeLease({ ...options, now: new Date(Date.parse(settled.settlement.settled_at) - 1).toISOString() }, lease.id),
      /RECONCILED_FAILED_AGENT_REVOCATION_TIME_INVALID/);
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
    for (const key of ["decision_ref", "cycle_order_ref"]) forged.request[key].sha256 = "f".repeat(64);
    forged.request_sha256 = runtime.inputDigest(forged.request);
    forged.id = `TESL-${forged.request_sha256.slice(0, 32)}`;
    persist(forged, "tool-effect-settlements", forged.settled_at, isolated.artifactRoot);
    assert.throws(() => settleToolEffects(isolated, request), /TOOL_EFFECT_SETTLEMENT_PUBLICATION_MISMATCH/);
    assert.throws(() => runtime.dispatchStatus(isolated), /TOOL_EFFECT_SETTLEMENT_PUBLICATION_MISMATCH/);
  });
  for (const key of ["decision_ref", "cycle_order_ref"]) check(`gateway ${key} cannot reuse a hook settlement input`, () => {
    const isolated = forkStore(`gateway-consumption-${key}`);
    const other = sample("valid-gateway-effect-settlement");
    other.request.mission_id = request.mission_id; other.request.wave_id = request.wave_id;
    other.request[key] = request[key];
    other.request_sha256 = runtime.inputDigest(other.request); other.id = `GESL-${other.request_sha256.slice(0, 32)}`;
    persist(other, "gateway-effect-settlements", other.settled_at, isolated.artifactRoot);
    assert.throws(() => settleToolEffects(isolated, request), /EFFECT_SETTLEMENT_INPUT_CONFLICT/);
    assert.throws(() => runtime.dispatchStatus(isolated), /EFFECT_SETTLEMENT_INPUT_CONFLICT/);
  });
  function waveReport() {
    const report = sample("valid-mission-wave-report");
    Object.assign(report, { mission_id: lease.mission_id, wave_id: lease.wave_id, plan_ref: opened.plan_ref,
      routing_preflight_ref: opened.routing_preflight_ref, recorded_at: now() });
    report.agent_results = [{ ...report.agent_results[0], agent_id: lease.agent_id, context_pack_ref: lease.context_pack_ref,
      evidence_refs: [observationRef] }];
    valid(report, "mission-wave-report");
    return report;
  }
  for (const status of ["active", "completed", "interrupted", "superseded"]) {
    check(`legacy ${status} cannot conceal a reconciled failure or enable reuse`, () => {
      const isolated = forkStore(`legacy-${status}-after-settlement`);
      legacyCheckpoint(isolated, status, status.toUpperCase());
      const projection = runtime.dispatchStatus(isolated).leases[0];
      assert.strictEqual(projection.status, status);
      assert.strictEqual(projection.reconciled_failed_effects, 1);
      assert.strictEqual(projection.failed_effect_revocation_required, true);
      assert.throws(() => runtime.completeLease(isolated, lease.id), /RECONCILED_FAILED_AGENT/);
      assert.throws(() => runtime.resumeLease(isolated, lease.id, { sessionId: "forbidden-resume", providerAgentId: "main" }), /RECONCILED_FAILED_AGENT/);
      assert.throws(() => runtime.authorizeDispatchPolicy(isolated, draft), /RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED/);
      assert.throws(() => runtime.issueLease(isolated, draft.id, { sessionId: "forbidden-new", providerAgentId: "main" }), /RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED/);
      assert.throws(() => lifecycle.openWave({ ...wavePlan, id: "MWP-SUCCESSOR", wave_id: "W2" }, { ...isolated, doctrineRoot: __dirname }),
        /RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED/);
      assert.throws(() => lifecycle.recordWave(waveReport(), isolated), /RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED/);
      if (["active", "interrupted"].includes(status)) {
        assert.strictEqual(runtime.activeLease(isolated, { missionId: lease.mission_id, waveId: lease.wave_id,
          agentId: lease.agent_id, provider: lease.provider, sessionId: lease.session_binding.session_id,
          providerAgentId: lease.session_binding.provider_agent_id }).code, "RECONCILED_FAILED_AGENT");
      }
      const revoked = runtime.revokeLease(isolated, lease.id);
      assert.strictEqual(revoked.status, "revoked");
      assert.strictEqual(runtime.dispatchStatus(isolated).leases[0].failed_effect_revocation_required, false);
      assert.strictEqual(runtime.authorizeDispatchPolicy(isolated, draft).status, "existing");
      assert.throws(() => lifecycle.recordWave(waveReport(), isolated), /RECONCILED_FAILED_AGENT/);
      const failed = waveReport();
      failed.wave_status = "failed";
      failed.agent_results[0].status = "failed";
      failed.agent_results[0].blockers = ["Original failed invocation remains a failure after reconciliation."];
      assert.strictEqual(lifecycle.recordWave(failed, isolated).continuation_authorized, false);
    });
  }
  check("a legacy resumed descendant inherits the same agent failure", () => {
    const isolated = forkStore("legacy-resumed-descendant");
    assert.strictEqual(runtime.revokeLease(isolated, lease.id).status, "revoked");
    const child = { ...clone(lease), id: "ADL-LEGACY-CHILD", previous_lease_ref: leaseRef, issuance_reason: "resume",
      session_binding: { session_id: "legacy-child", provider_agent_id: "main" } };
    valid(child, "agent-dispatch-lease");
    const childRef = persist(child, "agent-dispatch-leases", now(), isolated.artifactRoot);
    const childBaseline = { ...clone(baseline), id: "AEC-LEGACY-CHILD", lease_ref: childRef,
      session_binding: child.session_binding, recorded_at: now() };
    valid(childBaseline, "agent-execution-checkpoint");
    persist(childBaseline, "agent-execution-checkpoints", childBaseline.recorded_at, isolated.artifactRoot);
    const identity = { missionId: lease.mission_id, waveId: lease.wave_id, agentId: lease.agent_id, provider: lease.provider,
      sessionId: child.session_binding.session_id, providerAgentId: "main" };
    assert.strictEqual(runtime.activeLease(isolated, identity).code, "RECONCILED_FAILED_AGENT");
    assert.throws(() => runtime.completeLease(isolated, child.id), /RECONCILED_FAILED_AGENT/);
    assert.throws(() => runtime.resumeLease(isolated, child.id, { sessionId: "again", providerAgentId: "main" }), /RECONCILED_FAILED_AGENT/);
    assert.throws(() => runtime.assertReconciledFailureRevocations(isolated), /RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED/);
    assert.strictEqual(runtime.revokeLease(isolated, child.id).status, "revoked");
    runtime.assertReconciledFailureRevocations(isolated);
    assert(runtime.dispatchStatus(isolated).leases.every(item => item.reconciled_failed_effects === 1 && !item.failed_effect_revocation_required));
  });
  check("termination requires post-settlement revocation and rechecks exact retry", () => {
    const isolated = forkStore("termination-after-reconciliation");
    legacyCheckpoint(isolated, "completed", "TERMINATION");
    const termination = { ...sample("valid-mission-wave-termination-request"), mission_id: lease.mission_id,
      wave_id: lease.wave_id, plan_ref: opened.plan_ref };
    const expired = { ...isolated, now: new Date(Date.parse(horizon) + 1000).toISOString() };
    assert.throws(() => lifecycle.terminateWave(termination, expired), /RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED/);
    const revoked = runtime.revokeLease(isolated, lease.id);
    assert.strictEqual(lifecycle.terminateWave(termination, expired).status, "expired");
    assert.strictEqual(lifecycle.terminateWave(termination, expired).status, "expired");
    const stop = require("./campaign-stop-controller");
    const terminal = require("./campaign-terminal-controller");
    const stopRequest = { schema_version: "0.1", type: "CampaignStopRequest", mission_id: lease.mission_id,
      campaign_ref: campaignRef, decision_ref: runtime.NONE_REF, reason: "Synthetic terminal reconciliation fixture." };
    const stopDecision = sample("valid-decision-log");
    Object.assign(stopDecision, { id: "DL-Terminal-Stop", mission_id: lease.mission_id, decided_at: expired.now, decision_maker: "USER",
      decision_type: "scope", status: "complete", chosen_option: stop.stopDecisionOption(stopRequest),
      authority_basis: { basis_type: "retained_authority", reference: campaign.id, summary: "Synthetic exact stop grant." },
      affected_artifacts: [campaignRef.relative_path] });
    stopDecision.options_considered = [stopDecision.chosen_option];
    stopRequest.decision_ref = persist(stopDecision, "decision-logs", expired.now, isolated.artifactRoot);
    const stopped = stop.stopCampaign(stopRequest, expired);
    const terminalRequest = { schema_version: "0.1", type: "CampaignTerminalRequest", mission_id: lease.mission_id,
      campaign_ref: campaignRef, stop_ref: stopped.record_ref };
    const terminalResult = terminal.reconcileCampaignTerminal(terminalRequest, expired);
    assert.strictEqual(terminalResult.record.settlement_complete, true);
    assert.strictEqual(terminal.campaignTerminalStatus(terminalRequest, expired).settlement_complete, true);
    const successor = require("./campaign-successor-fixture-support").admitFixtureSuccessor(expired, campaign, terminalResult.record_ref);
    assert.strictEqual(successor.result.stop_fence_satisfied, true);
    const order = superviseCampaign({ repositoryPath: repository, artifactRoot: isolated.artifactRoot,
      campaignId: successor.campaign.id, evaluatedAt: expired.now }).order;
    assert.strictEqual(order.execution_authorized, false, "Admission must not renew expired verifier trust.");
    assert(!order.blocking_codes.includes("CAMPAIGN_STOP_REQUESTED"));
    const legacy = { ...clone(revoked.checkpoint), id: "AEC-POST-TERMINATION-LEGACY", sequence: revoked.checkpoint.sequence + 1,
      previous_checkpoint_ref: revoked.checkpoint_ref, checkpoint_kind: "completion", lease_status: "completed", recorded_at: expired.now };
    valid(legacy, "agent-execution-checkpoint");
    persist(legacy, "agent-execution-checkpoints", legacy.recorded_at, isolated.artifactRoot);
    assert.throws(() => lifecycle.terminateWave(termination, expired), /RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED/);
    assert.throws(() => terminal.campaignTerminalStatus(terminalRequest, expired), /CAMPAIGN_TERMINAL_DISPATCH_NOT_SETTLED/);
  });
  check("closeout cannot reuse a legacy successful report after reconciliation", () => {
    const isolated = forkStore("closeout-after-reconciliation");
    legacyCheckpoint(isolated, "completed", "CLOSEOUT");
    const report = waveReport();
    persist(report, "mission-wave-reports", report.recorded_at, isolated.artifactRoot);
    const aar = sample("valid-aar"); aar.mission_id = lease.mission_id;
    assert.throws(() => lifecycle.closeWave(aar, { ...isolated, missionId: lease.mission_id, waveId: lease.wave_id }),
      /RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED/);
    runtime.revokeLease(isolated, lease.id);
    assert.throws(() => lifecycle.closeWave(aar, { ...isolated, missionId: lease.mission_id, waveId: lease.wave_id }), /RECONCILED_FAILED_AGENT/);
  });
  check("settlement does not turn a failed agent into a successful agent", () => {
    assert.throws(() => runtime.completeLease(options, lease.id), /RECONCILED_FAILED_AGENT/);
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
