#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const {
  createVerifierExecutionEvidence,
  evidenceDigest,
  verifyVerifierExecutionEvidence
} = require("./verifier-execution-evidence");
const {
  createVerificationAttestation,
  evaluateAttestationQuorum,
  publicKeyId,
  verifyVerificationAttestation
} = require("./verification-attestation");
const {
  createComparativeEvaluationAttestation,
  verifyComparativeEvaluationAttestation
} = require("./comparative-evaluation-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");

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

function ref(id, digestCharacter) {
  return {
    artifact_id: id,
    relative_path: `repositories/example/missions/MIS-12A/C1/${id}.json`,
    sha256: digestCharacter.repeat(64)
  };
}

const verifierKey = pair();
const builderKey = pair();
const repositoryBinding = {
  repository_key: "cannae-os-aaaaaaaaaaaa",
  identity_fingerprint: "a".repeat(64)
};
const runtimePolicyReference = ref("VRP-12A-001", "b");
const identityEvidenceReference = ref("SVE-12A-001", "c");
const subjectReference = ref("VRR-12A-001", "d");
const repositoryState = {
  head_commit: "1".repeat(40),
  worktree_fingerprint: "e".repeat(64),
  dirty: false
};
const verificationTarget = { name: "CAN-12A-001", digest: { sha256: "e".repeat(64) } };
const providerIdentity = {
  issuer: "https://attestor.example.test",
  subject: "spiffe://example.test/builder/verifier",
  audience: "cannae-verifier-execution",
  claims: { runner_pool: "pool-a", tenant: "controls" }
};
const execution = {
  verifier_code: { uri: "git+https://example.test/controls@1111111#verifier.js", digest: { sha256: "1".repeat(64) } },
  container_image: {
    uri: "registry.example.test/cannae/verifier@sha256:" + "2".repeat(64),
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
const trustPolicy = {
  schema_version: "0.4",
  type: "VerifierTrustPolicy",
  id: "VTP-12A-001",
  repository_binding: repositoryBinding,
  execution_assurance: { required: true, runtime_policy_ref: runtimePolicyReference },
  verifiers: [{
    id: "VERIFIER-12A-A",
    key_id: verifierKey.keyId,
    public_key_pem: verifierKey.publicKeyPem,
    independence_group: "group-a",
    status: "active",
    allowed_repository_keys: [repositoryBinding.repository_key],
    allowed_execution_origins: ["remote"],
    allowed_attestation_types: ["verification_receipt", "comparative_evaluation_report"],
    valid_from: "2026-07-22T00:00:00Z",
    valid_until: "2026-07-23T00:00:00Z"
  }],
  created_at: "2026-07-22T00:00:00Z",
  expires_at: "2026-07-23T00:00:00Z"
};
const runtimePolicy = {
  schema_version: "0.1",
  type: "VerifierRuntimePolicy",
  id: runtimePolicyReference.artifact_id,
  trust_policy_id: trustPolicy.id,
  repository_binding: repositoryBinding,
  policy_version: 1,
  profiles: [{
    id: "PROFILE-12A-GENERIC",
    adapter: "in_toto_slsa_oci_dsse_v1",
    provider: "generic_oci",
    builder: { id: "https://attestor.example.test/builders/verifier-v1", key_id: builderKey.keyId, public_key_pem: builderKey.publicKeyPem },
    provider_identity: {
      issuer: providerIdentity.issuer,
      subject: providerIdentity.subject,
      audience: providerIdentity.audience,
      required_claims: clone(providerIdentity.claims)
    },
    execution,
    max_evidence_age_seconds: 300,
    max_execution_duration_seconds: 120
  }],
  assignments: [{
    verifier_id: trustPolicy.verifiers[0].id,
    profile_id: "PROFILE-12A-GENERIC",
    allowed_purposes: ["verification_receipt", "comparative_evaluation_report"]
  }],
  created_at: "2026-07-22T00:00:00Z",
  expires_at: "2026-07-23T00:00:00Z"
};
const createOptions = {
  trustPolicy,
  runtimePolicy,
  runtimePolicyReference,
  verifierId: trustPolicy.verifiers[0].id,
  purpose: "verification_receipt",
  subjectReference,
  workloadIdentityEvidenceReference: identityEvidenceReference,
  repositoryBinding,
  repositoryState,
  verificationTarget,
  providerIdentity,
  invocation: {
    id: "INV-12A-001",
    started_at: "2026-07-22T09:00:00Z",
    finished_at: "2026-07-22T09:01:00Z",
    exit_code: 0
  },
  builderPrivateKeyPem: builderKey.privateKeyPem,
  verifierPrivateKeyPem: verifierKey.privateKeyPem,
  issuedAt: "2026-07-22T09:01:01Z",
  expiresAt: "2026-07-22T09:06:01Z",
  evidenceId: "VEE-12A-001"
};
const evidence = createVerifierExecutionEvidence(createOptions);
const executionEvidenceReference = ref(evidence.id, "9");
const receipt = {
  type: "VerificationReceipt",
  id: subjectReference.artifact_id,
  plan_id: "VP-12A-001",
  receipt_sha256: "8".repeat(64),
  candidate_id: verificationTarget.name,
  candidate_revision: `WT-${repositoryState.worktree_fingerprint}`,
  campaign_id: "SIC-12A-001",
  mission_id: "MIS-12A",
  cycle_number: 1,
  repository_binding: repositoryBinding
};
const executionBoundAttestation = createVerificationAttestation({
  receipt,
  receiptReference: subjectReference,
  verifier: trustPolicy.verifiers[0],
  privateKeyPem: verifierKey.privateKeyPem,
  executionEvidenceReference,
  executionOrigin: "remote",
  invocationId: "INV-12A-ATTEST-001",
  issuedAt: "2026-07-22T09:02:00Z",
  expiresAt: "2026-07-22T09:05:00Z",
  nonce: "NONCE-12A-ATTEST-001"
});
const attestationExpectations = {
  receiptReferences: {
    [receipt.id]: {
      relative_path: subjectReference.relative_path,
      sha256: subjectReference.sha256,
      receipt_sha256: receipt.receipt_sha256,
      repository_state: repositoryState,
      verification_target: verificationTarget
    }
  },
  executionEvidence: [{
    entry: { ...executionEvidenceReference, artifact_id: evidence.id },
    payload: evidence
  }],
  runtimePolicy,
  runtimePolicyReference,
  campaignId: receipt.campaign_id,
  missionId: receipt.mission_id,
  cycleNumber: receipt.cycle_number,
  candidateId: receipt.candidate_id,
  candidateRevision: receipt.candidate_revision,
  repositoryKey: repositoryBinding.repository_key
};
const reportReference = ref("CER-12A-001", "0");
const reportTarget = { name: reportReference.artifact_id, digest: { sha256: reportReference.sha256 } };
const comparativeEvidence = createVerifierExecutionEvidence({
  ...createOptions,
  purpose: "comparative_evaluation_report",
  subjectReference: reportReference,
  verificationTarget: reportTarget,
  invocation: {
    id: "INV-12A-COMP-EXEC-001",
    started_at: "2026-07-22T09:01:10Z",
    finished_at: "2026-07-22T09:01:30Z",
    exit_code: 0
  },
  issuedAt: "2026-07-22T09:01:31Z",
  evidenceId: "VEE-12A-COMP-001"
});
const comparativeEvidenceReference = ref(comparativeEvidence.id, "f");
const report = {
  type: "ComparativeEvaluationReport",
  id: reportReference.artifact_id,
  report_sha256: "a".repeat(64),
  plan_ref: { artifact_id: "CEP-12A-001" },
  evaluation_set_ref: { artifact_id: "CES-12A-001" },
  outcome: "promotable",
  campaign_id: receipt.campaign_id,
  mission_id: receipt.mission_id,
  cycle_number: 1,
  target_type: "runtime_control",
  repository_binding: repositoryBinding,
  evaluator: { evaluator_id: "EVAL-12A-001", invocation_id: "INV-EVAL-12A-001" },
  executions: {
    baseline: { observation: { subject: { candidate_id: "BASE-12A-001", revision: "1".repeat(40) } } },
    candidate: { observation: { subject: { candidate_id: verificationTarget.name, revision: `WT-${repositoryState.worktree_fingerprint}` } } }
  }
};
const comparativeAttestation = createComparativeEvaluationAttestation({
  report,
  reportReference,
  verifier: trustPolicy.verifiers[0],
  privateKeyPem: verifierKey.privateKeyPem,
  executionEvidenceReference: comparativeEvidenceReference,
  executionOrigin: "remote",
  invocationId: "INV-12A-COMP-ATTEST-001",
  issuedAt: "2026-07-22T09:02:00Z",
  expiresAt: "2026-07-22T09:05:00Z",
  nonce: "NONCE-12A-COMP-001"
});
const comparativeExpectations = {
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
  runtimePolicy,
  runtimePolicyReference,
  executionEvidence: [{
    entry: { ...comparativeEvidenceReference, artifact_id: comparativeEvidence.id },
    payload: comparativeEvidence
  }],
  repositoryState,
  verificationTarget: reportTarget
};
const baseVerify = {
  evidence,
  trustPolicy,
  runtimePolicy,
  runtimePolicyReference,
  evaluatedAt: "2026-07-22T09:02:00Z",
  expectations: {
    purpose: "verification_receipt",
    verifierId: trustPolicy.verifiers[0].id,
    subjectReference,
    workloadIdentityEvidenceReference: identityEvidenceReference,
    repositoryState,
    verificationTarget,
    repositoryKey: repositoryBinding.repository_key,
    repositoryFingerprint: repositoryBinding.identity_fingerprint
  }
};

function verify(changes = {}) {
  return verifyVerifierExecutionEvidence({ ...baseVerify, ...changes });
}

function mutate(path, value) {
  const copy = clone(evidence);
  let current = copy;
  for (const key of path.slice(0, -1)) current = current[key];
  current[path[path.length - 1]] = value;
  copy.evidence_sha256 = evidenceDigest(copy);
  return copy;
}

function hasCode(result, code) {
  assert(result.codes.includes(code), `Expected ${code}; got ${result.codes.join(", ")}`);
}

const completed = [];
function run(name, action) {
  action();
  completed.push(name);
}

try {
  run("valid dual-signed execution evidence", () => assert.strictEqual(verify().valid, true));

  run("runtime, execution, and attestation contracts validate", () => {
    assert.strictEqual(validatePayload(runtimePolicy, "verifier-runtime-policy").valid, true);
    assert.strictEqual(validatePayload(evidence, "verifier-execution-evidence").valid, true);
    assert.strictEqual(validatePayload(executionBoundAttestation, "verification-attestation").valid, true);
  });

  run("execution-bound receipt attestation may enter quorum", () => {
    const result = evaluateAttestationQuorum(
      [executionBoundAttestation],
      { ...trustPolicy, quorum: { minimum_valid_attestations: 1, minimum_independence_groups: 1, require_distinct_key_ids: true } },
      attestationExpectations,
      { minimum_valid_attestations: 1, minimum_independence_groups: 1, require_distinct_key_ids: true },
      "2026-07-22T09:03:00Z"
    );
    assert.strictEqual(result.valid, true, result.codes.join(", "));
    assert.deepStrictEqual(result.results.map(item => item.execution_evidence_id), [evidence.id]);
  });

  run("legacy receipt attestation cannot enter a v0.4 quorum", () => {
    const legacy = createVerificationAttestation({
      receipt,
      receiptReference: subjectReference,
      verifier: trustPolicy.verifiers[0],
      privateKeyPem: verifierKey.privateKeyPem,
      executionOrigin: "remote",
      invocationId: "INV-12A-LEGACY",
      issuedAt: "2026-07-22T09:02:00Z",
      expiresAt: "2026-07-22T09:05:00Z",
      nonce: "NONCE-12A-LEGACY"
    });
    const result = verifyVerificationAttestation(legacy, trustPolicy, attestationExpectations, "2026-07-22T09:03:00Z");
    hasCode(result, "ATTESTATION_EXECUTION_EVIDENCE_REQUIRED");
  });

  run("execution-bound comparative attestation may enter quorum", () => {
    const result = verifyComparativeEvaluationAttestation(
      comparativeAttestation,
      trustPolicy,
      comparativeExpectations,
      "2026-07-22T09:03:00Z"
    );
    assert.strictEqual(result.valid, true, result.codes.join(", "));
    assert.strictEqual(result.execution_evidence_id, comparativeEvidence.id);
    assert.strictEqual(validatePayload(comparativeAttestation, "comparative-evaluation-attestation").valid, true);
  });

  const environmentMutations = [
    [["execution", "verifier_code", "digest", "sha256"], "6".repeat(64)],
    [["execution", "container_image", "digest", "sha256"], "6".repeat(64)],
    [["execution", "dependency_lockfile", "digest", "sha256"], "6".repeat(64)],
    [["execution", "harness", "digest", "sha256"], "6".repeat(64)],
    [["execution", "argv"], ["node", "other.js"]],
    [["execution", "tool_allowlist"], ["node"]],
    [["execution", "network_policy"], { mode: "allowlist", allowed_endpoints: ["evil.example"] }],
    [["execution", "sandbox_profile", "privileged"], true]
  ];
  for (const [index, [targetPath, value]] of environmentMutations.entries()) {
    run(`environment mutation ${index + 1} is rejected`, () => {
      hasCode(verify({ evidence: mutate(targetPath, value) }), "EXECUTION_EVIDENCE_ENVIRONMENT_MISMATCH");
    });
  }

  run("provider claim mismatch is rejected", () => {
    hasCode(verify({ evidence: mutate(["provider_identity", "claims", "runner_pool"], "pool-b") }), "EXECUTION_EVIDENCE_PROVIDER_IDENTITY_INVALID");
  });

  run("repository dirty-state mismatch is rejected", () => {
    hasCode(verify({ evidence: mutate(["repository_state", "dirty"], true) }), "EXECUTION_EVIDENCE_EXPECTATION_MISMATCH");
  });

  run("content-bound dirty repository state is accepted", () => {
    const dirtyRepositoryState = { ...repositoryState, dirty: true };
    const dirtyEvidence = createVerifierExecutionEvidence({
      ...createOptions,
      repositoryState: dirtyRepositoryState,
      evidenceId: "VEE-12A-DIRTY-001"
    });
    const result = verifyVerifierExecutionEvidence({
      ...baseVerify,
      evidence: dirtyEvidence,
      expectations: { ...baseVerify.expectations, repositoryState: dirtyRepositoryState }
    });
    assert.strictEqual(result.valid, true, result.codes.join(", "));
  });

  run("wrong verification target is rejected", () => {
    const expectations = clone(baseVerify.expectations);
    expectations.verificationTarget.digest.sha256 = "f".repeat(64);
    hasCode(verify({ expectations }), "EXECUTION_EVIDENCE_EXPECTATION_MISMATCH");
  });

  run("wrong workload identity reference is rejected", () => {
    const expectations = clone(baseVerify.expectations);
    expectations.workloadIdentityEvidenceReference.sha256 = "f".repeat(64);
    hasCode(verify({ expectations }), "EXECUTION_EVIDENCE_EXPECTATION_MISMATCH");
  });

  run("builder signature tampering is rejected", () => {
    const copy = clone(evidence);
    copy.envelope.signatures[0].sig = Buffer.alloc(64, 7).toString("base64");
    copy.evidence_sha256 = evidenceDigest(copy);
    hasCode(verify({ evidence: copy }), "EXECUTION_EVIDENCE_BUILDER_SIGNATURE_INVALID");
  });

  run("verifier signature tampering is rejected", () => {
    const copy = clone(evidence);
    copy.envelope.signatures[1].sig = Buffer.alloc(64, 8).toString("base64");
    copy.evidence_sha256 = evidenceDigest(copy);
    hasCode(verify({ evidence: copy }), "EXECUTION_EVIDENCE_VERIFIER_SIGNATURE_INVALID");
  });

  run("stale evidence is rejected", () => {
    hasCode(verify({ evaluatedAt: "2026-07-22T09:06:02Z" }), "EXECUTION_EVIDENCE_STALE");
  });

  run("runtime policy reference substitution is rejected", () => {
    const wrongRef = clone(runtimePolicyReference);
    wrongRef.sha256 = "f".repeat(64);
    hasCode(verify({ runtimePolicyReference: wrongRef }), "EXECUTION_EVIDENCE_RUNTIME_POLICY_REFERENCE_INVALID");
  });

  run("unassigned profile is rejected", () => {
    const changedPolicy = clone(runtimePolicy);
    changedPolicy.assignments[0].profile_id = "PROFILE-OTHER";
    hasCode(verify({ runtimePolicy: changedPolicy }), "EXECUTION_EVIDENCE_PROFILE_UNASSIGNED");
  });

  run("builder and verifier key correlation is rejected", () => {
    const changedPolicy = clone(runtimePolicy);
    changedPolicy.profiles[0].builder.key_id = verifierKey.keyId;
    changedPolicy.profiles[0].builder.public_key_pem = verifierKey.publicKeyPem;
    hasCode(verify({ runtimePolicy: changedPolicy }), "EXECUTION_EVIDENCE_BUILDER_UNTRUSTED");
  });

  process.stdout.write(`${JSON.stringify({ valid: true, fixture_count: completed.length, fixtures: completed }, null, 2)}\n`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
