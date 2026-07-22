#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  computeVerifierIndependence,
  INDEPENDENCE_DIMENSIONS
} = require("./verifier-independence");
const {
  createVerifierExecutionEvidence,
  evidenceDigest,
  verifyVerifierExecutionEvidence
} = require("./verifier-execution-evidence");
const {
  createVerificationAttestation,
  evaluateAttestationQuorum,
  publicKeyId
} = require("./verification-attestation");
const {
  createComparativeEvaluationAttestation,
  evaluateComparativeAttestationQuorum
} = require("./comparative-evaluation-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { parseArgs: parseExecutionArgs } = require("./verifier-execution-runner");

function pair() {
  const value = crypto.generateKeyPairSync("ed25519");
  return {
    privateKeyPem: value.privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKeyPem: value.publicKey.export({ type: "spki", format: "pem" }),
    keyId: publicKeyId(value.publicKey)
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ref(id, character) {
  return {
    artifact_id: id,
    relative_path: `repositories/example/missions/MIS-12C/C1/${id}.json`,
    sha256: character.repeat(64)
  };
}

function claims(label, overrides = {}) {
  return {
    provider_id: `urn:provider:${label}`,
    operator_id: `urn:operator:${label}`,
    control_plane_id: `urn:control-plane:${label}`,
    account_id: `urn:account:${label}`,
    project_id: `urn:project:${label}`,
    runner_pool_id: `urn:runner-pool:${label}`,
    infrastructure_id: `urn:infrastructure:${label}`,
    region_id: `urn:region:${label}`,
    zone_id: `urn:zone:${label}`,
    ...overrides
  };
}

function correlationPolicy(verifierIds) {
  return {
    schema_version: "0.6",
    id: "VTP-12C-CORRELATION",
    quorum: { minimum_independence_groups: 2 },
    independence_assurance: {
      required: true,
      correlation_rule: "shared_required_component",
      required_dimensions: [...INDEPENDENCE_DIMENSIONS],
      minimum_independent_domains: 2
    },
    verifiers: verifierIds.map((id, index) => ({
      id,
      status: "active",
      independence_group: `declared-group-${index + 1}`
    }))
  };
}

function correlationRuntime(policy, values) {
  return {
    schema_version: "0.2",
    type: "VerifierRuntimePolicy",
    id: "VRP-12C-CORRELATION",
    trust_policy_id: policy.id,
    profiles: values.map((value, index) => ({ id: `PROFILE-${index + 1}`, independence: value })),
    assignments: values.map((_value, index) => ({
      verifier_id: policy.verifiers[index].id,
      profile_id: `PROFILE-${index + 1}`
    }))
  };
}

const verifierKeys = [pair(), pair()];
const builderKeys = [pair(), pair()];
const repositoryBinding = {
  repository_key: "cannae-os-cccccccccccc",
  identity_fingerprint: "c".repeat(64)
};
const runtimePolicyReference = ref("VRP-12C-001", "a");
const subjectReference = ref("VRR-12C-001", "b");
const identityEvidenceReferences = [ref("SVE-12C-A", "d"), ref("SVE-12C-B", "e")];
const repositoryState = {
  head_commit: "1".repeat(40),
  worktree_fingerprint: "f".repeat(64),
  dirty: false
};
const verificationTarget = { name: "CAN-12C-001", digest: { sha256: "9".repeat(64) } };
function providerIdentity(index) {
  return index === 0 ? {
    issuer: "https://attestor-a.example.test",
    subject: "spiffe://example.test/builder/verifier-a",
    audience: "cannae-verifier-execution",
    claims: { runner_pool: "pool-a", tenant: "controls-a" }
  } : {
    issuer: "https://attestor-b.example.test",
    subject: "spiffe://example.test/builder/verifier-b",
    audience: "cannae-verifier-execution",
    claims: { host_attestor_id: "host-b", sandbox_instance_id: "sandbox-b" }
  };
}

function operationalClaims() {
  return [
    claims("a", {
      provider_id: "cannae:provider:generic_oci",
      control_plane_id: `cannae:builder:key:${builderKeys[0].keyId}`,
      account_id: "cannae:generic_oci:tenant:controls-a",
      runner_pool_id: "cannae:generic_oci:runner-pool:pool-a"
    }),
    claims("b", {
      provider_id: "cannae:provider:local_sandbox",
      control_plane_id: `cannae:builder:key:${builderKeys[1].keyId}`,
      infrastructure_id: "cannae:local_sandbox:host-attestor:host-b",
      runner_pool_id: "cannae:local_sandbox:sandbox-instance:sandbox-b"
    })
  ];
}
const execution = {
  verifier_code: { uri: "git+https://example.test/controls@1111111#verifier.js", digest: { sha256: "1".repeat(64) } },
  container_image: {
    uri: `registry.example.test/cannae/verifier@sha256:${"2".repeat(64)}`,
    digest: { sha256: "2".repeat(64) },
    media_type: "application/vnd.oci.image.manifest.v1+json"
  },
  dependency_lockfile: { uri: "git+https://example.test/controls@1111111#package-lock.json", digest: { sha256: "3".repeat(64) } },
  harness: { uri: "git+https://example.test/controls@1111111#verification-runner.js", digest: { sha256: "4".repeat(64) } },
  argv: ["node", "verification-runner.js", "--plan", "plan.json"],
  tool_allowlist: ["git", "node"],
  network_policy: { mode: "denied", allowed_endpoints: [] },
  sandbox_profile: {
    kind: "gvisor",
    profile_uri: "git+https://example.test/policies@1111111#gvisor-verifier.json",
    profile_sha256: "5".repeat(64),
    rootfs_read_only: true,
    no_new_privileges: true,
    privileged: false,
    host_network: false,
    host_pid: false,
    host_mounts: false
  }
};

function buildOperationalPolicies(independenceClaims) {
  const trustPolicy = {
    ...correlationPolicy(["VERIFIER-12C-A", "VERIFIER-12C-B"]),
    type: "VerifierTrustPolicy",
    id: "VTP-12C-001",
    repository_binding: repositoryBinding,
    policy_version: 1,
    quorum: {
      minimum_valid_attestations: 2,
      minimum_independence_groups: 2,
      require_distinct_key_ids: true,
      max_attestation_age_seconds: 300
    },
    execution_assurance: { required: true, runtime_policy_ref: runtimePolicyReference },
    verifiers: verifierKeys.map((key, index) => ({
      id: `VERIFIER-12C-${index === 0 ? "A" : "B"}`,
      key_id: key.keyId,
      public_key_pem: key.publicKeyPem,
      independence_group: `self-declared-${index + 1}`,
      status: "active",
      allowed_repository_keys: [repositoryBinding.repository_key],
      allowed_execution_origins: ["remote"],
      allowed_attestation_types: ["verification_receipt", "comparative_evaluation_report"],
      valid_from: "2026-07-22T00:00:00Z",
      valid_until: "2026-07-23T00:00:00Z"
    })),
    created_at: "2026-07-22T00:00:00Z",
    expires_at: "2026-07-23T00:00:00Z"
  };
  const runtimePolicy = {
    schema_version: "0.2",
    type: "VerifierRuntimePolicy",
    id: runtimePolicyReference.artifact_id,
    trust_policy_id: trustPolicy.id,
    repository_binding: repositoryBinding,
    policy_version: 1,
    profiles: independenceClaims.map((value, index) => {
      const identity = providerIdentity(index);
      return ({
      id: `PROFILE-12C-${index === 0 ? "A" : "B"}`,
      adapter: "in_toto_slsa_oci_dsse_v1",
      provider: index === 0 ? "generic_oci" : "local_sandbox",
      builder: {
        id: `https://attestor.example.test/builders/${index + 1}`,
        key_id: builderKeys[index].keyId,
        public_key_pem: builderKeys[index].publicKeyPem
      },
      provider_identity: {
        issuer: identity.issuer,
        subject: identity.subject,
        audience: identity.audience,
        required_claims: clone(identity.claims)
      },
      independence: value,
      execution,
      max_evidence_age_seconds: 300,
      max_execution_duration_seconds: 120
    });
    }),
    assignments: independenceClaims.map((_value, index) => ({
      verifier_id: trustPolicy.verifiers[index].id,
      profile_id: `PROFILE-12C-${index === 0 ? "A" : "B"}`,
      allowed_purposes: ["verification_receipt", "comparative_evaluation_report"]
    })),
    created_at: "2026-07-22T00:00:00Z",
    expires_at: "2026-07-23T00:00:00Z"
  };
  return { trustPolicy, runtimePolicy };
}

const receipt = {
  type: "VerificationReceipt",
  id: subjectReference.artifact_id,
  plan_id: "VP-12C-001",
  receipt_sha256: "8".repeat(64),
  candidate_id: verificationTarget.name,
  candidate_revision: `WT-${repositoryState.worktree_fingerprint}`,
  campaign_id: "SIC-12C-001",
  mission_id: "MIS-12C",
  cycle_number: 1,
  repository_binding: repositoryBinding
};

function buildEvidenceAndAttestations(independenceClaims, suffix) {
  const { trustPolicy, runtimePolicy } = buildOperationalPolicies(independenceClaims);
  const evidence = verifierKeys.map((key, index) => createVerifierExecutionEvidence({
    trustPolicy,
    runtimePolicy,
    runtimePolicyReference,
    verifierId: trustPolicy.verifiers[index].id,
    purpose: "verification_receipt",
    subjectReference,
    workloadIdentityEvidenceReference: identityEvidenceReferences[index],
    repositoryBinding,
    repositoryState,
    verificationTarget,
    providerIdentity: providerIdentity(index),
    independence: independenceClaims[index],
    invocation: {
      id: `INV-12C-${suffix}-${index + 1}`,
      started_at: "2026-07-22T09:00:00Z",
      finished_at: "2026-07-22T09:01:00Z",
      exit_code: 0
    },
    builderPrivateKeyPem: builderKeys[index].privateKeyPem,
    verifierPrivateKeyPem: key.privateKeyPem,
    issuedAt: "2026-07-22T09:01:01Z",
    expiresAt: "2026-07-22T09:06:01Z",
    evidenceId: `VEE-12C-${suffix}-${index + 1}`
  }));
  const evidenceReferences = evidence.map((item, index) => ref(item.id, index === 0 ? "6" : "7"));
  const attestations = verifierKeys.map((key, index) => createVerificationAttestation({
    receipt,
    receiptReference: subjectReference,
    verifier: trustPolicy.verifiers[index],
    privateKeyPem: key.privateKeyPem,
    executionEvidenceReference: evidenceReferences[index],
    executionOrigin: "remote",
    invocationId: `INV-12C-ATTEST-${suffix}-${index + 1}`,
    issuedAt: "2026-07-22T09:02:00Z",
    expiresAt: "2026-07-22T09:05:00Z",
    nonce: `NONCE-12C-${suffix}-${index + 1}`
  }));
  const expectations = {
    receiptReferences: {
      [receipt.id]: {
        relative_path: subjectReference.relative_path,
        sha256: subjectReference.sha256,
        receipt_sha256: receipt.receipt_sha256,
        repository_state: repositoryState,
        verification_target: verificationTarget
      }
    },
    executionEvidence: evidence.map((item, index) => ({
      entry: evidenceReferences[index],
      payload: item
    })),
    runtimePolicy,
    runtimePolicyReference,
    campaignId: receipt.campaign_id,
    missionId: receipt.mission_id,
    cycleNumber: receipt.cycle_number,
    candidateId: receipt.candidate_id,
    candidateRevision: receipt.candidate_revision,
    repositoryKey: repositoryBinding.repository_key
  };
  return { trustPolicy, runtimePolicy, evidence, attestations, expectations };
}

function buildComparativeQuorum(context, independenceClaims) {
  const reportReference = ref("CER-12C-001", "0");
  const reportTarget = { name: reportReference.artifact_id, digest: { sha256: reportReference.sha256 } };
  const report = {
    type: "ComparativeEvaluationReport",
    id: reportReference.artifact_id,
    report_sha256: "a".repeat(64),
    plan_ref: { artifact_id: "CEP-12C-001" },
    evaluation_set_ref: { artifact_id: "CES-12C-001" },
    outcome: "promotable",
    campaign_id: receipt.campaign_id,
    mission_id: receipt.mission_id,
    cycle_number: 1,
    target_type: "runtime_control",
    repository_binding: repositoryBinding,
    evaluator: { evaluator_id: "EVAL-12C-001", invocation_id: "INV-EVAL-12C-001" },
    executions: {
      baseline: { observation: { subject: { candidate_id: "BASE-12C-001", revision: "1".repeat(40) } } },
      candidate: { observation: { subject: { candidate_id: verificationTarget.name, revision: `WT-${repositoryState.worktree_fingerprint}` } } }
    }
  };
  const evidence = verifierKeys.map((key, index) => createVerifierExecutionEvidence({
    trustPolicy: context.trustPolicy,
    runtimePolicy: context.runtimePolicy,
    runtimePolicyReference,
    verifierId: context.trustPolicy.verifiers[index].id,
    purpose: "comparative_evaluation_report",
    subjectReference: reportReference,
    workloadIdentityEvidenceReference: identityEvidenceReferences[index],
    repositoryBinding,
    repositoryState,
    verificationTarget: reportTarget,
    providerIdentity: providerIdentity(index),
    independence: independenceClaims[index],
    invocation: {
      id: `INV-12C-COMP-${index + 1}`,
      started_at: "2026-07-22T09:00:00Z",
      finished_at: "2026-07-22T09:01:00Z",
      exit_code: 0
    },
    builderPrivateKeyPem: builderKeys[index].privateKeyPem,
    verifierPrivateKeyPem: key.privateKeyPem,
    issuedAt: "2026-07-22T09:01:01Z",
    expiresAt: "2026-07-22T09:06:01Z",
    evidenceId: `VEE-12C-COMP-${index + 1}`
  }));
  const evidenceReferences = evidence.map((item, index) => ref(item.id, index === 0 ? "2" : "3"));
  const attestations = verifierKeys.map((key, index) => createComparativeEvaluationAttestation({
    report,
    reportReference,
    verifier: context.trustPolicy.verifiers[index],
    privateKeyPem: key.privateKeyPem,
    executionEvidenceReference: evidenceReferences[index],
    executionOrigin: "remote",
    invocationId: `INV-12C-COMP-ATTEST-${index + 1}`,
    issuedAt: "2026-07-22T09:02:00Z",
    expiresAt: "2026-07-22T09:05:00Z",
    nonce: `NONCE-12C-COMP-${index + 1}`
  }));
  const expectations = {
    reportId: report.id,
    reportRelativePath: reportReference.relative_path,
    reportSha256: reportReference.sha256,
    reportContentSha256: report.report_sha256,
    planId: report.plan_ref.artifact_id,
    evaluationSetId: report.evaluation_set_ref.artifact_id,
    campaignId: report.campaign_id,
    missionId: report.mission_id,
    cycleNumber: report.cycle_number,
    targetType: report.target_type,
    baselineCandidateId: report.executions.baseline.observation.subject.candidate_id,
    baselineRevision: report.executions.baseline.observation.subject.revision,
    candidateId: report.executions.candidate.observation.subject.candidate_id,
    candidateRevision: report.executions.candidate.observation.subject.revision,
    evaluatorId: report.evaluator.evaluator_id,
    evaluatorInvocationId: report.evaluator.invocation_id,
    repositoryKey: repositoryBinding.repository_key,
    repositoryFingerprint: repositoryBinding.identity_fingerprint,
    runtimePolicy: context.runtimePolicy,
    runtimePolicyReference,
    executionEvidence: evidence.map((item, index) => ({ entry: evidenceReferences[index], payload: item })),
    repositoryState,
    verificationTarget: reportTarget
  };
  return { attestations, expectations };
}

function buildSamples(independent) {
  const trustSample = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", "valid-verifier-trust-policy-v0.5.json")));
  const secondVerifier = clone(trustSample.verifiers[0]);
  const secondKey = pair();
  secondVerifier.id = "VERIFIER-Cannae-Independence-B";
  secondVerifier.key_id = secondKey.keyId;
  secondVerifier.public_key_pem = secondKey.publicKeyPem;
  secondVerifier.independence_group = "declared-provider-b";
  trustSample.schema_version = "0.6";
  trustSample.id = "VTP-Cannae-Independence-Sample";
  trustSample.quorum.minimum_valid_attestations = 2;
  trustSample.quorum.minimum_independence_groups = 2;
  trustSample.verifiers[0].independence_group = "declared-provider-a";
  trustSample.verifiers.push(secondVerifier);
  trustSample.independence_assurance = {
    required: true,
    correlation_rule: "shared_required_component",
    required_dimensions: [...INDEPENDENCE_DIMENSIONS],
    minimum_independent_domains: 2
  };

  const cycleSample = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", "valid-self-improvement-cycle-order-v0.5.json")));
  const cycleClaims = [claims("challenge-a"), claims("challenge-b")];
  const cyclePolicy = correlationPolicy(["VERIFIER-Challenge-A", "VERIFIER-Challenge-B"]);
  cyclePolicy.id = cycleSample.trust_policy_admission.trust_policy_ref.artifact_id;
  const cycleIndependence = computeVerifierIndependence(cyclePolicy, correlationRuntime(cyclePolicy, cycleClaims));
  cycleSample.schema_version = "0.6";
  cycleSample.trust_policy_admission.assurance_scope = "failure_domain_verified_fresh_challenged_workload_and_policy_eligibility";
  cycleSample.trust_policy_admission.independence_assurance = {
    required: true,
    satisfied: cycleIndependence.satisfied,
    required_dimensions: cycleIndependence.required_dimensions,
    minimum_independent_domains: cycleIndependence.minimum_independent_domains,
    domain_count: cycleIndependence.domain_count,
    domains: cycleIndependence.domains,
    bindings: cycleIndependence.bindings,
    blocking_codes: cycleIndependence.blocking_codes
  };
  const domains = cycleSample.trust_policy_admission.independence_assurance.bindings
    .map(binding => binding.domain_id).sort();
  cycleSample.trust_policy_admission.receipt_quorum.independence_groups = domains;
  cycleSample.trust_policy_admission.comparative_quorum.independence_groups = domains;

  const invalidRuntimePolicy = clone(independent.runtimePolicy);
  delete invalidRuntimePolicy.profiles[0].independence.zone_id;
  const invalidExecutionEvidence = clone(independent.evidence[0]);
  invalidExecutionEvidence.independence.account_id = "urn:account:unsigned-substitution";
  invalidExecutionEvidence.evidence_sha256 = evidenceDigest(invalidExecutionEvidence);

  return {
    trustPolicy: trustSample,
    runtimePolicy: independent.runtimePolicy,
    executionEvidence: independent.evidence[0],
    cycleOrder: cycleSample,
    invalidRuntimePolicy,
    invalidExecutionEvidence
  };
}

const completed = [];
function run(name, action) {
  action();
  completed.push(name);
}

try {
  run("self-declared group names cannot hide a shared account", () => {
    const policy = correlationPolicy(["VERIFIER-A", "VERIFIER-B"]);
    const runtime = correlationRuntime(policy, [claims("a"), claims("b", { account_id: "urn:account:a" })]);
    const result = computeVerifierIndependence(policy, runtime);
    assert.strictEqual(result.domain_count, 1);
    assert.strictEqual(result.satisfied, false);
    assert(result.blocking_codes.includes("INDEPENDENCE_DOMAIN_QUORUM_UNAVAILABLE"));
  });

  run("correlation is transitive across different shared components", () => {
    const policy = correlationPolicy(["VERIFIER-A", "VERIFIER-B", "VERIFIER-C"]);
    const runtime = correlationRuntime(policy, [
      claims("a"),
      claims("b", { account_id: "urn:account:a" }),
      claims("c", { runner_pool_id: "urn:runner-pool:b" })
    ]);
    assert.strictEqual(computeVerifierIndependence(policy, runtime).domain_count, 1);
  });

  run("fully disjoint component identities form independent domains", () => {
    const policy = correlationPolicy(["VERIFIER-A", "VERIFIER-B"]);
    const result = computeVerifierIndependence(policy, correlationRuntime(policy, [claims("a"), claims("b")]));
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.satisfied, true);
    assert.strictEqual(result.domain_count, 2);
  });

  run("provider-native claims cannot be renamed into a different provider domain", () => {
    const values = operationalClaims();
    values[0].provider_id = "cannae:provider:renamed-generic";
    const { trustPolicy, runtimePolicy } = buildOperationalPolicies(values);
    const result = computeVerifierIndependence(trustPolicy, runtimePolicy);
    assert.strictEqual(result.valid, false);
    assert(result.blocking_codes.includes("INDEPENDENCE_CLAIMS_INVALID"));
    const validation = validatePayload(runtimePolicy, "verifier-runtime-policy");
    assert(validation.issues.some(item => item.code === "VERIFIER_RUNTIME_INDEPENDENCE_CLAIMS_INVALID"));
  });

  const independentClaims = operationalClaims();
  const independent = buildEvidenceAndAttestations(independentClaims, "INDEPENDENT");
  const samples = buildSamples(independent);
  run("v0.6 trust, runtime, execution, and cycle contracts validate", () => {
    assert.strictEqual(validatePayload(samples.trustPolicy, "verifier-trust-policy").valid, true);
    assert.strictEqual(validatePayload(samples.runtimePolicy, "verifier-runtime-policy").valid, true);
    assert.strictEqual(validatePayload(samples.executionEvidence, "verifier-execution-evidence").valid, true);
    assert.strictEqual(validatePayload(samples.cycleOrder, "self-improvement-cycle-order").valid, true);
  });
  run("execution runner accepts an explicit independence observation", () => {
    const options = parseExecutionArgs(["create", "--independence", "independence.json"]);
    assert.strictEqual(options.independence, "independence.json");
  });
  run("v0.2 execution evidence binds the observed domain identity", () => {
    const result = verifyVerifierExecutionEvidence({
      evidence: independent.evidence[0],
      trustPolicy: independent.trustPolicy,
      runtimePolicy: independent.runtimePolicy,
      runtimePolicyReference,
      evaluatedAt: "2026-07-22T09:03:00Z",
      expectations: {
        purpose: "verification_receipt",
        verifierId: independent.trustPolicy.verifiers[0].id,
        subjectReference,
        workloadIdentityEvidenceReference: identityEvidenceReferences[0],
        repositoryState,
        verificationTarget,
        repositoryKey: repositoryBinding.repository_key,
        repositoryFingerprint: repositoryBinding.identity_fingerprint
      }
    });
    assert.strictEqual(result.valid, true, result.codes.join(", "));
    assert.match(result.independence_domain_id, /^VID-[a-f0-9]{24}$/);
  });

  run("two independently executed verifiers satisfy receipt quorum", () => {
    const result = evaluateAttestationQuorum(
      independent.attestations,
      independent.trustPolicy,
      independent.expectations,
      independent.trustPolicy.quorum,
      "2026-07-22T09:03:00Z"
    );
    assert.strictEqual(result.valid, true, result.codes.join(", "));
    assert.strictEqual(result.independence_groups.length, 2);
    assert(result.independence_groups.every(id => /^VID-[a-f0-9]{24}$/.test(id)));
  });

  run("two independently executed verifiers satisfy comparative quorum", () => {
    const comparative = buildComparativeQuorum(independent, independentClaims);
    const result = evaluateComparativeAttestationQuorum(
      comparative.attestations,
      independent.trustPolicy,
      comparative.expectations,
      independent.trustPolicy.quorum,
      "2026-07-22T09:03:00Z"
    );
    assert.strictEqual(result.valid, true, result.codes.join(", "));
    assert.strictEqual(result.independence_groups.length, 2);
  });

  run("signed execution evidence rejects a top-level domain mutation", () => {
    const changed = clone(independent.evidence[0]);
    changed.independence.account_id = "urn:account:substituted";
    changed.evidence_sha256 = evidenceDigest(changed);
    const result = verifyVerifierExecutionEvidence({
      evidence: changed,
      trustPolicy: independent.trustPolicy,
      runtimePolicy: independent.runtimePolicy,
      runtimePolicyReference,
      evaluatedAt: "2026-07-22T09:03:00Z"
    });
    assert(result.codes.includes("EXECUTION_EVIDENCE_INDEPENDENCE_MISMATCH"));
    assert(result.codes.includes("EXECUTION_EVIDENCE_STATEMENT_BINDING_INVALID"));
  });

  const correlatedClaims = operationalClaims();
  correlatedClaims[1].operator_id = correlatedClaims[0].operator_id;
  const correlated = buildEvidenceAndAttestations(correlatedClaims, "CORRELATED");
  run("correlated execution domains cannot satisfy a two-domain quorum", () => {
    const result = evaluateAttestationQuorum(
      correlated.attestations,
      correlated.trustPolicy,
      correlated.expectations,
      correlated.trustPolicy.quorum,
      "2026-07-22T09:03:00Z"
    );
    assert.strictEqual(result.valid, false);
    assert(result.codes.includes("ATTESTATION_GROUP_DIVERSITY_NOT_MET"));
    assert.strictEqual(result.independence_groups.length, 1);
  });

  if (process.argv.includes("--write-samples")) {
    const outputs = [
      ["valid-verifier-trust-policy-v0.6.json", samples.trustPolicy],
      ["valid-verifier-runtime-policy-v0.2.json", samples.runtimePolicy],
      ["valid-verifier-execution-evidence-v0.2.json", samples.executionEvidence],
      ["valid-self-improvement-cycle-order-v0.6.json", samples.cycleOrder],
      ["invalid-verifier-runtime-policy-v0.2-missing-domain.json", samples.invalidRuntimePolicy],
      ["invalid-verifier-execution-evidence-v0.2-domain-substitution.json", samples.invalidExecutionEvidence]
    ];
    for (const [name, value] of outputs) {
      fs.writeFileSync(path.join(__dirname, "sample-payloads", name), `${JSON.stringify(value, null, 2)}\n`);
    }
  }

  process.stdout.write(`${JSON.stringify({ valid: true, fixture_count: completed.length, fixtures: completed }, null, 2)}\n`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
