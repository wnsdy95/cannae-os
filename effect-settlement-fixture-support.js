const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { inputDigest, NONE_REF } = require("./dispatch-runtime-controller");
const { writeRepositoryArtifact } = require("./repository-artifact-store");
const { gatewayEffectSubject, reviewGatewayEffects } = require("./gateway-effect-review");
const { computeRepositoryState, executeVerification } = require("./verification-runner");
const { superviseCampaign } = require("./campaign-supervisor");
const { keyPair, makeCa, makeLeaf } = require("./verifier-identity-fixture-support");
const { certificateSha256, createVerifierIdentityEvidence } = require("./verifier-identity-evidence");
const { createVerifierExecutionEvidence } = require("./verifier-execution-evidence");
const { createVerificationAttestation } = require("./verification-attestation");
const { decisionOption } = require("./gateway-effect-settlement");

const sample = name => JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", `${name}.json`), "utf8"));
const now = () => new Date().toISOString();
const digest = value => crypto.createHash("sha256").update(value).digest("hex");

// Real checker and ephemeral signatures; identity, isolation and USER claims are synthetic.
function createGatewaySettlementFixture(options, transactionId, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const subject = gatewayEffectSubject(options, transactionId);
  const binding = subject.repository_binding;
  const repository = options.repository;
  const artifactRoot = options.artifactRoot;
  const horizon = new Date(Date.now() + 900000).toISOString();
  const past = new Date(Date.now() - 10000).toISOString();
  const persist = (payload, kind, createdAt = now(), root = artifactRoot) => {
    const written = writeRepositoryArtifact({ repositoryPath: repository, artifactRoot: root,
      missionId: subject.mission_id, waveId: subject.wave_id, kind, artifactId: payload.id, payload, createdAt });
    return { artifact_id: payload.id, relative_path: written.relative_path, sha256: written.sha256 };
  };
  const observationRef = persist({ id: "OBS-GATEWAY-SETTLEMENT", synthetic: true, transaction_id: transactionId,
    content_sha256: digest(fs.readFileSync(path.join(repository, "README.md"))) }, "gateway-effect-observations");
  const scope = { schema_version: "0.1", type: "GatewayEffectScope", id: "GES-SETTLEMENT-FIXTURE",
    mission_id: subject.mission_id, wave_id: subject.wave_id, agent_id: subject.agent_id,
    repository_binding: binding, subject, expected_repository_state: computeRepositoryState(repository),
    coverage_statement: "Synthetic USER effect scope. Local README evidence exercises checker binding, not arbitrary effect completeness.",
    resources: subject.required_targets.map((target, index) => ({ ...target, id: `RES-${index}`, disposition: "observed",
      evidence_refs: [observationRef], check_ids: ["VCK-EFFECTS"] })), created_at: now(), expires_at: horizon };
  const scopeRef = persist(scope, "gateway-effect-scopes", scope.created_at);
  const plan = sample("valid-verification-plan");
  Object.assign(plan, { mission_id: subject.mission_id, repository_binding: binding, candidate_id: scope.id,
    candidate_revision: inputDigest(scope), expected_repository_state: scope.expected_repository_state, created_at: now() });
  plan.checks = [{ id: "VCK-EFFECTS", purpose: "Inspect exact synthetic scope and local README observation.", executable: "node",
    args: ["check-effects.js", "--artifact-root", artifactRoot, "--effect-scope", scopeRef.relative_path, "--effect-scope-sha256", inputDigest(scope)],
    working_directory: ".", timeout_ms: 10000, expected_exit_codes: [0] }];
  const ca = makeCa(directory, "settlement-root");
  const logKey = keyPair();
  const builderKey = keyPair();
  const keys = [keyPair(), keyPair()];
  const trust = sample("valid-verifier-trust-policy-v0.4");
  Object.assign(trust, { repository_binding: binding, created_at: past, expires_at: horizon });
  Object.assign(trust.quorum, { minimum_valid_attestations: 2, minimum_independence_groups: 2, max_attestation_age_seconds: 900 });
  trust.identity_assurance.trusted_x509_roots = [{ id: "ROOT-SETTLEMENT", trust_domain: "verification.example.test",
    certificate_pem: ca.certificate, certificate_sha256: certificateSha256(ca.certificate) }];
  trust.identity_assurance.trusted_transparency_logs = [{ id: "LOG-SETTLEMENT", origin: "settlement.example.test/log",
    key_id: logKey.keyId, public_key_pem: logKey.publicKey }];
  trust.identity_assurance.sigstore_trusted_root_refs = [persist(sample("valid-sigstore-trusted-root"), "sigstore-trusted-roots")];
  trust.verifiers = keys.map((key, index) => ({ id: `VERIFIER-SETTLEMENT-${index}`, key_id: key.keyId, public_key_pem: key.publicKey,
    independence_group: `synthetic-group-${index}`, status: "active", allowed_repository_keys: [binding.repository_key],
    allowed_execution_origins: ["remote"], allowed_attestation_types: ["verification_receipt", "comparative_evaluation_report"],
    workload_identity: { type: "spiffe_x509", spiffe_id: `spiffe://verification.example.test/settlement/${index}`,
      trust_root_id: "ROOT-SETTLEMENT", transparency_log_id: "LOG-SETTLEMENT" }, valid_from: past, valid_until: horizon }));
  const runtimePolicy = sample("valid-verifier-runtime-policy");
  Object.assign(runtimePolicy, { repository_binding: binding, created_at: past, expires_at: horizon });
  const profile = runtimePolicy.profiles[0];
  profile.provider = "generic_oci";
  profile.builder = { id: "https://settlement.example.test/builder", key_id: builderKey.keyId, public_key_pem: builderKey.publicKey };
  profile.provider_identity = { issuer: "https://settlement.example.test", subject: "synthetic-builder",
    audience: "cannae-verifier-execution", required_claims: { runner_pool: "synthetic-pool", tenant: "fixture" } };
  profile.execution.argv = ["node", ...plan.checks[0].args];
  runtimePolicy.assignments = trust.verifiers.map(verifier => ({ verifier_id: verifier.id, profile_id: profile.id,
    allowed_purposes: verifier.allowed_attestation_types }));
  const runtimeRef = persist(runtimePolicy, "verifier-runtime-policies");
  trust.execution_assurance.runtime_policy_ref = runtimeRef;
  const trustRef = persist(trust, "verifier-trust-policies");
  const identityRefs = trust.verifiers.map((verifier, index) => {
    const leaf = makeLeaf(directory, ca, `settlement-leaf-${index}`, [verifier.workload_identity.spiffe_id]);
    const evidence = createVerifierIdentityEvidence({ evidenceId: `VIE-SETTLEMENT-${index}`, verifier, trustPolicy: trust,
      repositoryBinding: binding, workloadPrivateKeyPem: leaf.key, verifierPrivateKeyPem: keys[index].privateKey,
      logPrivateKeyPem: logKey.privateKey, leafCertificatePem: leaf.certificate, purposes: verifier.allowed_attestation_types,
      nonce: `settlement-identity-nonce-${index}`, issuedAt: now(), checkpointIssuedAt: now(), expiresAt: horizon });
    return persist(evidence, "verifier-identity-evidence", evidence.issued_at);
  });
  const campaign = sample("valid-self-improvement-campaign");
  Object.assign(campaign, { schema_version: "0.3", mission_id: scope.mission_id, created_at: past,
    repository_binding: { ...binding, baseline_revision: scope.expected_repository_state.head_commit },
    attestation_policy: { required: true, trust_policy_ref: trustRef, minimum_valid_attestations: 2, minimum_independence_groups: 2,
      require_distinct_key_ids: true, max_attestation_age_seconds: 900 } });
  const campaignRef = persist(campaign, "self-improvement-campaigns", past);
  const order = superviseCampaign({ repositoryPath: repository, artifactRoot, campaignId: campaign.id }).order;
  assert.strictEqual(order.status, "ready", JSON.stringify(order));
  const orderRef = persist(order, "self-improvement-cycle-orders", order.generated_at);
  plan.campaign_id = campaign.id;
  const receipt = executeVerification(campaign, plan, repository);
  assert.strictEqual(receipt.overall_status, "passed", JSON.stringify(receipt));
  const planRef = persist(plan, "verification-plans", plan.created_at);
  const receiptRef = persist(receipt, "verification-receipts", receipt.finished_at);
  const executionInputs = [];
  const attestationRefs = trust.verifiers.map((verifier, index) => {
    const input = { trustPolicy: trust, runtimePolicy, runtimePolicyReference: runtimeRef,
      verifierId: verifier.id, purpose: "verification_receipt", subjectReference: receiptRef,
      workloadIdentityEvidenceReference: identityRefs[index], repositoryBinding: binding,
      repositoryState: { ...receipt.repository_state_before, dirty: false },
      verificationTarget: { name: scope.id, digest: { sha256: inputDigest(scope) } },
      providerIdentity: { issuer: profile.provider_identity.issuer, subject: profile.provider_identity.subject,
        audience: profile.provider_identity.audience, claims: profile.provider_identity.required_claims },
      invocation: { id: `INV-SETTLEMENT-${index}`, started_at: receipt.started_at, finished_at: receipt.finished_at, exit_code: 0 },
      builderPrivateKeyPem: builderKey.privateKey, verifierPrivateKeyPem: keys[index].privateKey,
      issuedAt: now(), expiresAt: horizon, evidenceId: `VEE-SETTLEMENT-${index}` };
    executionInputs.push(input);
    const execution = createVerifierExecutionEvidence(input);
    const executionRef = persist(execution, "verifier-execution-evidence", execution.issued_at);
    const attestation = createVerificationAttestation({ receipt, receiptReference: receiptRef, verifier,
      privateKeyPem: keys[index].privateKey, executionEvidenceReference: executionRef, executionOrigin: "remote",
      invocationId: `INV-ATTEST-SETTLEMENT-${index}`, issuedAt: now(), expiresAt: horizon, nonce: `settlement-attestation-nonce-${index}` });
    return persist(attestation, "verification-attestations", attestation.issued_at);
  });
  const review = reviewGatewayEffects({ ...options, writeArtifact: true }, {
    scope_ref: scopeRef, verification_plan_ref: planRef, verification_receipt_ref: receiptRef });
  assert.strictEqual(review.status, "evidence_bound", JSON.stringify(review));
  const reviewRef = { artifact_id: review.id, relative_path: review.artifact.relative_path, sha256: review.artifact.sha256 };
  const request = { schema_version: "0.1", type: "GatewayEffectSettlementRequest", id: "GESR-SETTLEMENT", mission_id: scope.mission_id,
    wave_id: scope.wave_id, review_ref: reviewRef, campaign_ref: campaignRef, cycle_order_ref: orderRef,
    attestation_refs: attestationRefs, decision_ref: scopeRef,
    containment_observation_ref: subject.containment_history ? subject.containment_history.latest_ref : NONE_REF,
    scope_coverage_accepted: true, inspection_method_accepted: true };
  const decision = sample("valid-decision-log");
  Object.assign(decision, { id: "DL-GATEWAY-SETTLEMENT", mission_id: scope.mission_id, decided_at: now(), decision_maker: "USER",
    decision_type: "scope", chosen_option: decisionOption(request),
    authority_basis: { basis_type: "retained_authority", reference: scope.id, summary: "Synthetic exact USER scope acceptance." },
    affected_artifacts: [reviewRef, campaignRef, orderRef, scopeRef, planRef, receiptRef, ...attestationRefs,
      ...(subject.containment_history ? [subject.containment_history.latest_ref] : [])].map(item => item.relative_path) });
  decision.options_considered = [decision.chosen_option, "keep-effects-unresolved"];
  request.decision_ref = persist(decision, "decision-logs", decision.decided_at);
  return { request, subject, scope, scopeRef, plan, planRef, receipt, receiptRef, campaign, campaignRef, order, orderRef,
    review, reviewRef, decision, persist, trust, keys, executionInputs, identityRefs, attestationRefs };
}

function checkFixtureEffects() {
  const args = process.argv.slice(2);
  const value = flag => args[args.indexOf(flag) + 1];
  const root = value("--artifact-root");
  const scope = JSON.parse(fs.readFileSync(path.join(root, value("--effect-scope")), "utf8"));
  assert.strictEqual(inputDigest(scope), value("--effect-scope-sha256"));
  for (const resource of scope.resources) {
    const observed = JSON.parse(fs.readFileSync(path.join(root, resource.evidence_refs[0].relative_path), "utf8"));
    assert(observed.synthetic);
    assert.strictEqual(observed.transaction_id, scope.subject.transaction_id);
    assert.strictEqual(observed.content_sha256, digest(fs.readFileSync("README.md")));
  }
}
function installEffectSettlementFixtureChecker(repository) {
  fs.writeFileSync(path.join(repository, "check-effects.js"),
    `require(${JSON.stringify(__filename)}).checkFixtureEffects();\n`);
}
module.exports = { createGatewaySettlementFixture, installEffectSettlementFixtureChecker, checkFixtureEffects };
