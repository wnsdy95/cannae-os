#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { analyzeImprovement } = require("./autonomous-improvement-controller");
const { attestationDigest, createVerificationAttestation, publicKeyId } = require("./verification-attestation");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relativePath), "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

console.log("Signed self-improvement fixtures: 6/6 passed");
