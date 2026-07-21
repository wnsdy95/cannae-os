#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyzeImprovement, loadProofContext } = require("./autonomous-improvement-controller");
const { attestationDigest, createVerificationAttestation, publicKeyId } = require("./verification-attestation");
const {
  comparativeAttestationDigest,
  createComparativeEvaluationAttestation
} = require("./comparative-evaluation-attestation");
const { reportDigest } = require("./comparative-evaluation-runner");
const { receiptDigest } = require("./verification-runner");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relativePath), "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function artifactRef(write, artifactId) {
  return { artifact_id: artifactId, relative_path: write.relative_path, sha256: write.sha256 };
}

function makeVerifier(id, group, repositoryKey) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    record: {
      id,
      key_id: publicKeyId(publicKeyPem),
      public_key_pem: publicKeyPem,
      independence_group: group,
      status: "active",
      allowed_repository_keys: [repositoryKey],
      allowed_execution_origins: ["remote"],
      allowed_attestation_types: ["verification_receipt", "comparative_evaluation_report"],
      valid_from: "2026-07-21T18:00:00+09:00",
      valid_until: "2026-07-22T18:00:00+09:00"
    }
  };
}

const campaignV2 = readJson("sample-payloads/valid-self-improvement-campaign.json");
const checkpointV2 = readJson("sample-payloads/valid-self-improvement-checkpoint.json");
const receiptFile = path.join(__dirname, "sample-payloads", "valid-verification-receipt.json");
const receiptBytes = fs.readFileSync(receiptFile);
const receipt = JSON.parse(receiptBytes);
const receiptReference = {
  artifact_id: receipt.id,
  relative_path: checkpointV2.verification_receipts[0].relative_path,
  sha256: sha256(receiptBytes)
};
const baseProof = {
  receipts: new Map([[receipt.id, receipt]]),
  attestations: new Map(),
  trustPolicy: null,
  parentDecision: null,
  approvalScope: null,
  consumptionEvent: null,
  manifestRevision: 3,
  manifestSha256: "d".repeat(64)
};

const legacyDecision = analyzeImprovement(campaignV2, checkpointV2, baseProof);
assert.strictEqual(legacyDecision.decision, "accept_working_state", JSON.stringify(legacyDecision, null, 2));
assert.strictEqual(legacyDecision.schema_version, "0.2");
console.log("PASS v0.2 receipt-only campaigns remain backward compatible");

const verifierA = makeVerifier("VERIFIER-Control-A", "provider-a", receipt.repository_binding.repository_key);
const verifierB = makeVerifier("VERIFIER-Control-B", "provider-b", receipt.repository_binding.repository_key);
const trustPolicy = {
  schema_version: "0.1",
  type: "VerifierTrustPolicy",
  id: "VTP-Control-001",
  repository_binding: receipt.repository_binding,
  policy_version: 1,
  quorum: {
    minimum_valid_attestations: 2,
    minimum_independence_groups: 2,
    require_distinct_key_ids: true,
    max_attestation_age_seconds: 900
  },
  verifiers: [verifierA.record, verifierB.record],
  created_at: "2026-07-21T18:00:00+09:00",
  expires_at: "2026-07-22T18:00:00+09:00"
};

function sign(verifier, invocation) {
  return createVerificationAttestation({
    receipt,
    receiptReference,
    verifier: verifier.record,
    privateKeyPem: verifier.privateKeyPem,
    executionOrigin: "remote",
    invocationId: invocation,
    nonce: `${invocation}-nonce`,
    issuedAt: "2026-07-21T18:23:00+09:00",
    expiresAt: "2026-07-21T18:30:00+09:00"
  });
}

const attestationA = sign(verifierA, "INV-Control-A");
const attestationB = sign(verifierB, "INV-Control-B");
const campaignV3 = clone(campaignV2);
campaignV3.schema_version = "0.3";
campaignV3.attestation_policy = {
  required: true,
  trust_policy_ref: {
    artifact_id: trustPolicy.id,
    relative_path: `repositories/${receipt.repository_binding.repository_key}/missions/${receipt.mission_id}/C0/verifier-trust-policies/${trustPolicy.id}.json`,
    sha256: "a".repeat(64)
  },
  minimum_valid_attestations: 2,
  minimum_independence_groups: 2,
  require_distinct_key_ids: true,
  max_attestation_age_seconds: 900
};
const checkpointV3 = clone(checkpointV2);
checkpointV3.schema_version = "0.3";
checkpointV3.verification_receipts[0].sha256 = receiptReference.sha256;
checkpointV3.verification_attestations = [attestationA, attestationB].map(attestation => ({
  attestation_id: attestation.id,
  receipt_id: receipt.id,
  verifier_id: attestation.verifier_id,
  relative_path: `repositories/${receipt.repository_binding.repository_key}/missions/${receipt.mission_id}/C1/verification-attestations/${attestation.id}.json`,
  sha256: sha256(Buffer.from(`${JSON.stringify(attestation, null, 2)}\n`))
}));

function proof(attestations, policy = trustPolicy) {
  return {
    ...baseProof,
    attestations: new Map(attestations.map(item => [item.id, item])),
    trustPolicy: policy
  };
}

const quorumDecision = analyzeImprovement(campaignV3, checkpointV3, proof([attestationA, attestationB]));
assert.strictEqual(quorumDecision.decision, "accept_working_state", JSON.stringify(quorumDecision, null, 2));
assert.strictEqual(quorumDecision.schema_version, "0.3");
assert.strictEqual(quorumDecision.proof.attestation_quorum_satisfied, true);
assert.strictEqual(quorumDecision.proof.verifier_key_ids.length, 2);
console.log("PASS v0.3 promotion carries a two-key, two-group signed quorum");

const oneRefCheckpoint = clone(checkpointV3);
oneRefCheckpoint.verification_attestations = [oneRefCheckpoint.verification_attestations[0]];
const oneSignerDecision = analyzeImprovement(campaignV3, oneRefCheckpoint, proof([attestationA]));
assert.strictEqual(oneSignerDecision.decision, "escalate");
assert(oneSignerDecision.blocking_codes.includes("ATTESTATION_QUORUM_NOT_MET"));
console.log("PASS one signer cannot promote a v0.3 candidate");

const duplicateRefCheckpoint = clone(checkpointV3);
duplicateRefCheckpoint.verification_attestations[1] = clone(duplicateRefCheckpoint.verification_attestations[0]);
const duplicateDecision = analyzeImprovement(campaignV3, duplicateRefCheckpoint, proof([attestationA]));
assert.strictEqual(duplicateDecision.decision, "escalate");
assert(duplicateDecision.blocking_codes.includes("ATTESTATION_VERIFIER_DIVERSITY_NOT_MET"));
console.log("PASS duplicate signer evidence cannot satisfy quorum");

const tampered = clone(attestationB);
tampered.envelope.payload = `${tampered.envelope.payload.slice(0, -4)}AAAA`;
tampered.attestation_sha256 = attestationDigest(tampered);
const tamperedDecision = analyzeImprovement(campaignV3, checkpointV3, proof([attestationA, tampered]));
assert.strictEqual(tamperedDecision.decision, "escalate");
assert(tamperedDecision.blocking_codes.includes("ATTESTATION_SIGNATURE_INVALID"));
console.log("PASS a tampered remote attestation blocks promotion");

const expiredPolicy = clone(trustPolicy);
expiredPolicy.expires_at = "2026-07-21T18:23:30+09:00";
const expiredPolicyDecision = analyzeImprovement(campaignV3, checkpointV3, proof([attestationA, attestationB], expiredPolicy));
assert.strictEqual(expiredPolicyDecision.decision, "escalate");
assert(expiredPolicyDecision.blocking_codes.includes("ATTESTATION_TRUST_POLICY_BINDING_INVALID"));
console.log("PASS expired root-of-trust policy blocks promotion");

const comparisonReportFile = path.join(__dirname, "sample-payloads", "valid-comparative-evaluation-report.json");
const comparisonReportBytes = fs.readFileSync(comparisonReportFile);
const comparisonReport = JSON.parse(comparisonReportBytes);
const comparisonPlan = readJson("sample-payloads/valid-comparative-evaluation-plan.json");
const comparisonSet = readJson("sample-payloads/valid-comparative-evaluation-set.json");
const comparisonReference = {
  artifact_id: comparisonReport.id,
  relative_path: `repositories/${receipt.repository_binding.repository_key}/missions/${receipt.mission_id}/C1/comparative-evaluation-reports/${comparisonReport.id}.json`,
  sha256: sha256(comparisonReportBytes)
};

function signComparison(verifier, invocation) {
  return createComparativeEvaluationAttestation({
    report: comparisonReport,
    reportReference: comparisonReference,
    verifier: verifier.record,
    privateKeyPem: verifier.privateKeyPem,
    executionOrigin: "remote",
    invocationId: invocation,
    nonce: `${invocation}-nonce`,
    issuedAt: "2026-07-21T18:23:00+09:00",
    expiresAt: "2026-07-21T18:30:00+09:00"
  });
}

const comparativeAttestationA = signComparison(verifierA, "INV-Control-Comparative-A");
const comparativeAttestationB = signComparison(verifierB, "INV-Control-Comparative-B");
const campaignV4 = clone(campaignV3);
campaignV4.schema_version = "0.4";
const policylessV4 = clone(campaignV4);
delete policylessV4.comparative_evaluation_policy;
const policylessValidation = require("./validator-cli-prototype/validate").validatePayload(policylessV4, "self-improvement-campaign");
assert.strictEqual(policylessValidation.valid, false);
assert(policylessValidation.issues.some(item => item.code === "SELF_IMPROVEMENT_V04_COMPARATIVE_POLICY_MISSING"));
console.log("PASS v0.4 cannot omit the signed comparative evaluation policy surface");
const checkpointV4 = clone(checkpointV3);
checkpointV4.schema_version = "0.4";
checkpointV4.target.target_type = "runtime_control";
checkpointV4.target.state = "candidate";
checkpointV4.target.artifact_paths = ["autonomous-improvement-controller.js"];
checkpointV4.candidate.changed_files = ["autonomous-improvement-controller.js"];
checkpointV4.independent_evaluation = {
  required: true,
  evaluator: "EVALUATOR",
  status: "passed",
  evidence_receipt_ids: [receipt.id]
};
checkpointV4.comparative_evaluation_ref = {
  required: true,
  report_id: comparisonReport.id,
  relative_path: comparisonReference.relative_path,
  sha256: comparisonReference.sha256
};
checkpointV4.comparative_evaluation_attestations = [comparativeAttestationA, comparativeAttestationB].map(attestation => ({
  attestation_id: attestation.id,
  report_id: comparisonReport.id,
  verifier_id: attestation.verifier_id,
  relative_path: `repositories/${receipt.repository_binding.repository_key}/missions/${receipt.mission_id}/C1/comparative-evaluation-attestations/${attestation.id}.json`,
  sha256: sha256(Buffer.from(`${JSON.stringify(attestation, null, 2)}\n`))
}));

function comparativeProof(attestations) {
  return {
    ...proof([attestationA, attestationB]),
    comparativeReport: comparisonReport,
    comparativePlan: comparisonPlan,
    comparativeEvaluationSet: comparisonSet,
    comparativeAttestations: new Map(attestations.map(item => [item.id, item]))
  };
}

const v4Decision = analyzeImprovement(campaignV4, checkpointV4, comparativeProof([comparativeAttestationA, comparativeAttestationB]));
assert.strictEqual(v4Decision.decision, "accept_working_state", JSON.stringify(v4Decision, null, 2));
assert.strictEqual(v4Decision.schema_version, "0.4");
assert.strictEqual(v4Decision.proof.comparative_attestation_quorum_satisfied, true);
assert.strictEqual(v4Decision.proof.comparative_verifier_key_ids.length, 2);
console.log("PASS v0.4 control-plane promotion requires and carries a signed comparative quorum");

const oneComparativeCheckpoint = clone(checkpointV4);
oneComparativeCheckpoint.comparative_evaluation_attestations = [oneComparativeCheckpoint.comparative_evaluation_attestations[0]];
const oneComparativeDecision = analyzeImprovement(campaignV4, oneComparativeCheckpoint, comparativeProof([comparativeAttestationA]));
assert.strictEqual(oneComparativeDecision.decision, "escalate");
assert(oneComparativeDecision.blocking_codes.includes("COMPARATIVE_ATTESTATION_QUORUM_NOT_MET"));
console.log("PASS one signed comparison cannot promote a v0.4 control-plane candidate");

const tamperedComparative = clone(comparativeAttestationB);
tamperedComparative.candidate_revision = "WT-tampered-comparative-revision";
tamperedComparative.attestation_sha256 = comparativeAttestationDigest(tamperedComparative);
const tamperedComparativeDecision = analyzeImprovement(campaignV4, checkpointV4,
  comparativeProof([comparativeAttestationA, tamperedComparative]));
assert.strictEqual(tamperedComparativeDecision.decision, "escalate");
assert(tamperedComparativeDecision.blocking_codes.includes("COMPARATIVE_ATTESTATION_PREDICATE_BINDING_MISMATCH"));
console.log("PASS exposed comparative bindings cannot diverge from the signed statement");

const replayedComparative = clone(comparativeAttestationB);
replayedComparative.campaign_id = "SIC-Other-Campaign";
replayedComparative.attestation_sha256 = comparativeAttestationDigest(replayedComparative);
const replayedComparativeDecision = analyzeImprovement(campaignV4, checkpointV4,
  comparativeProof([comparativeAttestationA, replayedComparative]));
assert.strictEqual(replayedComparativeDecision.decision, "escalate");
assert(replayedComparativeDecision.blocking_codes.includes("COMPARATIVE_ATTESTATION_EXPECTATION_MISMATCH"));
console.log("PASS cross-campaign comparative attestation replay is rejected");

const integrationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-signed-comparative-controller-"));
try {
  const repositoryPath = path.join(integrationRoot, "repository");
  const artifactRoot = path.join(integrationRoot, "artifacts");
  fs.mkdirSync(repositoryPath, { recursive: true });
  git(repositoryPath, ["init", "-q"]);
  git(repositoryPath, ["config", "user.email", "fixtures@controls.local"]);
  git(repositoryPath, ["config", "user.name", "Controls Fixtures"]);
  fs.writeFileSync(path.join(repositoryPath, "README.md"), "signed comparative controller fixture\n");
  git(repositoryPath, ["add", "README.md"]);
  git(repositoryPath, ["commit", "-qm", "fixture baseline"]);
  const repository = resolveRepository(repositoryPath);
  const binding = { repository_key: repository.key, identity_fingerprint: repository.identity_fingerprint };
  const integrationVerifierA = makeVerifier("VERIFIER-Integration-A", "provider-a", repository.key);
  const integrationVerifierB = makeVerifier("VERIFIER-Integration-B", "provider-b", repository.key);
  const integrationTrust = clone(trustPolicy);
  integrationTrust.id = "VTP-Integration-001";
  integrationTrust.repository_binding = binding;
  integrationTrust.verifiers = [integrationVerifierA.record, integrationVerifierB.record];
  const trustWrite = writeRepositoryArtifact({
    repositoryPath, artifactRoot, missionId: campaignV4.mission_id, waveId: "C0",
    kind: "verifier-trust-policies", artifactId: integrationTrust.id, payload: integrationTrust,
    createdAt: integrationTrust.created_at
  });

  const integrationCampaign = clone(campaignV4);
  integrationCampaign.repository_binding = { ...binding, baseline_revision: checkpointV4.target.baseline_revision };
  integrationCampaign.attestation_policy.trust_policy_ref = artifactRef(trustWrite, integrationTrust.id);
  writeRepositoryArtifact({
    repositoryPath, artifactRoot, missionId: integrationCampaign.mission_id, waveId: "C0",
    kind: "self-improvement-campaigns", artifactId: integrationCampaign.id, payload: integrationCampaign,
    createdAt: integrationCampaign.created_at
  });

  const integrationReceipt = clone(receipt);
  integrationReceipt.repository_binding = binding;
  integrationReceipt.receipt_sha256 = receiptDigest(integrationReceipt);
  const receiptWrite = writeRepositoryArtifact({
    repositoryPath, artifactRoot, missionId: integrationReceipt.mission_id, waveId: "C1",
    kind: "verification-receipts", artifactId: integrationReceipt.id, payload: integrationReceipt,
    createdAt: integrationReceipt.finished_at
  });
  const integrationReceiptReference = artifactRef(receiptWrite, integrationReceipt.id);
  function integrationReceiptAttestation(verifier, invocation) {
    return createVerificationAttestation({
      receipt: integrationReceipt,
      receiptReference: integrationReceiptReference,
      verifier: verifier.record,
      privateKeyPem: verifier.privateKeyPem,
      executionOrigin: "remote",
      invocationId: invocation,
      nonce: `${invocation}-nonce`,
      issuedAt: "2026-07-21T18:23:00+09:00",
      expiresAt: "2026-07-21T18:30:00+09:00"
    });
  }
  const integrationReceiptAttestations = [
    integrationReceiptAttestation(integrationVerifierA, "INV-Integration-Receipt-A"),
    integrationReceiptAttestation(integrationVerifierB, "INV-Integration-Receipt-B")
  ];
  const integrationReceiptAttestationWrites = integrationReceiptAttestations.map(attestation => writeRepositoryArtifact({
    repositoryPath, artifactRoot, missionId: integrationReceipt.mission_id, waveId: "C1",
    kind: "verification-attestations", artifactId: attestation.id, payload: attestation,
    createdAt: attestation.issued_at
  }));

  const integrationSet = clone(comparisonSet);
  const setWrite = writeRepositoryArtifact({
    repositoryPath, artifactRoot, missionId: integrationSet.mission_id, waveId: "C0",
    kind: "comparative-evaluation-sets", artifactId: integrationSet.id, payload: integrationSet,
    createdAt: integrationSet.created_at
  });
  const integrationPlan = clone(comparisonPlan);
  integrationPlan.repository_binding = binding;
  integrationPlan.evaluation_set_ref = artifactRef(setWrite, integrationSet.id);
  integrationPlan.subjects.baseline.repository_binding = binding;
  integrationPlan.subjects.candidate.repository_binding = binding;
  const planWrite = writeRepositoryArtifact({
    repositoryPath, artifactRoot, missionId: integrationPlan.mission_id, waveId: "C1",
    kind: "comparative-evaluation-plans", artifactId: integrationPlan.id, payload: integrationPlan,
    createdAt: integrationPlan.created_at
  });
  const integrationReport = clone(comparisonReport);
  integrationReport.repository_binding = binding;
  integrationReport.plan_ref = artifactRef(planWrite, integrationPlan.id);
  integrationReport.evaluation_set_ref = artifactRef(setWrite, integrationSet.id);
  integrationReport.executions.baseline.repository_binding = binding;
  integrationReport.executions.candidate.repository_binding = binding;
  for (const execution of [integrationReport.executions.baseline, integrationReport.executions.candidate]) {
    execution.observation.evaluation_set.sha256 = setWrite.sha256;
    const observationBytes = Buffer.from(`${JSON.stringify(execution.observation, null, 2)}\n`);
    execution.stdout.byte_size = observationBytes.length;
    execution.stdout.sha256 = sha256(observationBytes);
    execution.stdout.truncated = false;
  }
  integrationReport.report_sha256 = reportDigest(integrationReport);
  const reportWrite = writeRepositoryArtifact({
    repositoryPath, artifactRoot, missionId: integrationReport.mission_id, waveId: "C1",
    kind: "comparative-evaluation-reports", artifactId: integrationReport.id, payload: integrationReport,
    createdAt: integrationReport.finished_at
  });
  function integrationComparativeAttestation(verifier, invocation) {
    return createComparativeEvaluationAttestation({
      report: integrationReport,
      reportReference: artifactRef(reportWrite, integrationReport.id),
      verifier: verifier.record,
      privateKeyPem: verifier.privateKeyPem,
      executionOrigin: "remote",
      invocationId: invocation,
      nonce: `${invocation}-nonce`,
      issuedAt: "2026-07-21T18:23:00+09:00",
      expiresAt: "2026-07-21T18:30:00+09:00"
    });
  }
  const integrationComparativeAttestations = [
    integrationComparativeAttestation(integrationVerifierA, "INV-Integration-Comparative-A"),
    integrationComparativeAttestation(integrationVerifierB, "INV-Integration-Comparative-B")
  ];
  const integrationComparativeAttestationWrites = integrationComparativeAttestations.map(attestation => writeRepositoryArtifact({
    repositoryPath, artifactRoot, missionId: integrationReport.mission_id, waveId: "C1",
    kind: "comparative-evaluation-attestations", artifactId: attestation.id, payload: attestation,
    createdAt: attestation.issued_at
  }));

  const integrationCheckpoint = clone(checkpointV4);
  integrationCheckpoint.repository_binding = binding;
  integrationCheckpoint.verification_receipts[0] = {
    receipt_id: integrationReceipt.id,
    plan_id: integrationReceipt.plan_id,
    relative_path: receiptWrite.relative_path,
    sha256: receiptWrite.sha256,
    required_check_ids: [integrationReceipt.checks[0].id]
  };
  integrationCheckpoint.verification_attestations = integrationReceiptAttestations.map((attestation, index) => ({
    attestation_id: attestation.id,
    receipt_id: integrationReceipt.id,
    verifier_id: attestation.verifier_id,
    relative_path: integrationReceiptAttestationWrites[index].relative_path,
    sha256: integrationReceiptAttestationWrites[index].sha256
  }));
  integrationCheckpoint.comparative_evaluation_ref = {
    required: true,
    report_id: integrationReport.id,
    relative_path: reportWrite.relative_path,
    sha256: reportWrite.sha256
  };
  integrationCheckpoint.comparative_evaluation_attestations = integrationComparativeAttestations.map((attestation, index) => ({
    attestation_id: attestation.id,
    report_id: integrationReport.id,
    verifier_id: attestation.verifier_id,
    relative_path: integrationComparativeAttestationWrites[index].relative_path,
    sha256: integrationComparativeAttestationWrites[index].sha256
  }));
  const loadedProof = loadProofContext(integrationCampaign, integrationCheckpoint, repositoryPath, artifactRoot);
  const integrationDecision = analyzeImprovement(integrationCampaign, integrationCheckpoint, loadedProof);
  assert.strictEqual(integrationDecision.decision, "accept_working_state", JSON.stringify(integrationDecision, null, 2));
  assert.strictEqual(integrationDecision.proof.attestation_quorum_satisfied, true);
  assert.strictEqual(integrationDecision.proof.comparative_attestation_quorum_satisfied, true);
  assert.strictEqual(integrationDecision.proof.comparative_evaluation_attestation_ids.length, 2);
  console.log("PASS controller reloads both signed quorums and comparative contracts from the verified repository manifest");
} finally {
  fs.rmSync(integrationRoot, { recursive: true, force: true });
}

console.log("Signed self-improvement fixtures: 12/12 passed");
