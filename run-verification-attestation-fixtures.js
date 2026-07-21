#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  attestationDigest,
  createVerificationAttestation,
  evaluateAttestationQuorum,
  publicKeyId,
  verifyVerificationAttestation
} = require("./verification-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function keyFixture(id, group, repositoryKey) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    verifier: {
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

const receiptPath = path.join(__dirname, "sample-payloads", "valid-verification-receipt.json");
const receiptBytes = fs.readFileSync(receiptPath);
const receipt = JSON.parse(receiptBytes);
const repositoryKey = receipt.repository_binding.repository_key;
const verifierA = keyFixture("VERIFIER-Cannae-A", "provider-a", repositoryKey);
const verifierB = keyFixture("VERIFIER-Cannae-B", "provider-b", repositoryKey);
const trustPolicy = {
  schema_version: "0.1",
  type: "VerifierTrustPolicy",
  id: "VTP-Cannae-001",
  repository_binding: receipt.repository_binding,
  policy_version: 1,
  quorum: {
    minimum_valid_attestations: 2,
    minimum_independence_groups: 2,
    require_distinct_key_ids: true,
    max_attestation_age_seconds: 900
  },
  verifiers: [verifierA.verifier, verifierB.verifier],
  created_at: "2026-07-21T18:00:00+09:00",
  expires_at: "2026-07-22T18:00:00+09:00"
};
const receiptReference = {
  artifact_id: receipt.id,
  relative_path: `repositories/${repositoryKey}/missions/${receipt.mission_id}/C1/verification-receipts/${receipt.id}.json`,
  sha256: sha256(receiptBytes)
};

function sign(key, invocationId) {
  return createVerificationAttestation({
    receipt,
    receiptReference,
    verifier: key.verifier,
    privateKeyPem: key.privateKeyPem,
    executionOrigin: "remote",
    invocationId,
    nonce: `${invocationId}-nonce`,
    issuedAt: "2026-07-21T18:23:00+09:00",
    expiresAt: "2026-07-21T18:30:00+09:00"
  });
}

const attestationA = sign(verifierA, "INV-Cannae-A");
const attestationB = sign(verifierB, "INV-Cannae-B");
const expectations = {
  receiptReferences: {
    [receipt.id]: {
      relative_path: receiptReference.relative_path,
      sha256: receiptReference.sha256,
      receipt_sha256: receipt.receipt_sha256
    }
  },
  campaignId: receipt.campaign_id,
  missionId: receipt.mission_id,
  cycleNumber: receipt.cycle_number,
  candidateId: receipt.candidate_id,
  candidateRevision: receipt.candidate_revision,
  repositoryKey,
  maxAttestationAgeSeconds: 900
};
const now = "2026-07-21T18:24:00+09:00";

assert.strictEqual(validatePayload(trustPolicy, "verifier-trust-policy").valid, true);
assert.strictEqual(validatePayload(attestationA, "verification-attestation").valid, true);
assert.strictEqual(verifyVerificationAttestation(attestationA, trustPolicy, {
  ...expectations,
  receiptId: receipt.id,
  receiptSha256: receiptReference.sha256
}, now).valid, true);
console.log("PASS Ed25519 DSSE attestation validates against the trusted public key");

const quorum = evaluateAttestationQuorum([attestationA, attestationB], trustPolicy, expectations, trustPolicy.quorum, now);
assert.strictEqual(quorum.valid, true, JSON.stringify(quorum, null, 2));
assert.strictEqual(quorum.key_ids.length, 2);
assert.strictEqual(quorum.independence_groups.length, 2);
console.log("PASS two trusted keys from independent groups satisfy quorum");

const duplicate = evaluateAttestationQuorum([attestationA, attestationA], trustPolicy, expectations, trustPolicy.quorum, now);
assert.strictEqual(duplicate.valid, false);
assert(duplicate.codes.includes("ATTESTATION_DUPLICATE_ID"));
assert(duplicate.codes.includes("ATTESTATION_VERIFIER_DIVERSITY_NOT_MET"));
console.log("PASS duplicated evidence cannot satisfy verifier diversity");

const tampered = JSON.parse(JSON.stringify(attestationA));
tampered.envelope.payload = `${tampered.envelope.payload.slice(0, -4)}AAAA`;
tampered.attestation_sha256 = attestationDigest(tampered);
const tamperedResult = verifyVerificationAttestation(tampered, trustPolicy, expectations, now);
assert.strictEqual(tamperedResult.valid, false);
assert(tamperedResult.codes.includes("ATTESTATION_SIGNATURE_INVALID"));
console.log("PASS signed payload tampering is rejected even with a recomputed outer digest");

const expired = evaluateAttestationQuorum([attestationA, attestationB], trustPolicy, expectations, trustPolicy.quorum, "2026-07-21T18:31:00+09:00");
assert.strictEqual(expired.valid, false);
assert(expired.codes.includes("ATTESTATION_EXPIRED_OR_NOT_YET_VALID"));
console.log("PASS expired attestations cannot be replayed");

const wrongRepository = verifyVerificationAttestation(attestationA, trustPolicy, { ...expectations, repositoryKey: "other-repository" }, now);
assert.strictEqual(wrongRepository.valid, false);
assert(wrongRepository.codes.includes("ATTESTATION_EXPECTATION_MISMATCH"));
console.log("PASS cross-repository attestation reuse is rejected");

const wrongReceiptContent = evaluateAttestationQuorum([attestationA, attestationB], trustPolicy, {
  ...expectations,
  receiptReferences: {
    [receipt.id]: {
      sha256: receiptReference.sha256,
      relative_path: receiptReference.relative_path,
      receipt_sha256: "0".repeat(64)
    }
  }
}, trustPolicy.quorum, now);
assert.strictEqual(wrongReceiptContent.valid, false);
assert(wrongReceiptContent.codes.includes("ATTESTATION_RECEIPT_CONTENT_MISMATCH"));
console.log("PASS attestation cannot be rebound to different receipt content at the same artifact reference");

const wrongReceiptPath = evaluateAttestationQuorum([attestationA, attestationB], trustPolicy, {
  ...expectations,
  receiptReferences: {
    [receipt.id]: {
      relative_path: "repositories/other/missions/other/receipt.json",
      sha256: receiptReference.sha256,
      receipt_sha256: receipt.receipt_sha256
    }
  }
}, trustPolicy.quorum, now);
assert.strictEqual(wrongReceiptPath.valid, false);
assert(wrongReceiptPath.codes.includes("ATTESTATION_EXPECTATION_MISMATCH"));
console.log("PASS attestation cannot be rebound to another persisted receipt path");

const cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-attestation-cli-"));
try {
  const policyPath = path.join(cliRoot, "policy.json");
  const copiedReceiptPath = path.join(cliRoot, "receipt.json");
  const privateKeyPath = path.join(cliRoot, "verifier-key.pem");
  fs.writeFileSync(policyPath, `${JSON.stringify(trustPolicy, null, 2)}\n`);
  fs.writeFileSync(copiedReceiptPath, receiptBytes);
  fs.writeFileSync(privateKeyPath, verifierA.privateKeyPem, { mode: 0o600 });
  const args = [
    "verification-attestation-runner.js", policyPath, copiedReceiptPath,
    "--verifier", verifierA.verifier.id,
    "--private-key", privateKeyPath,
    "--receipt-relative-path", receiptReference.relative_path,
    "--receipt-sha256", receiptReference.sha256,
    "--invocation-id", "INV-Remote-CLI",
    "--origin", "remote",
    "--issued-at", "2026-07-21T18:23:00+09:00",
    "--expires-at", "2026-07-21T18:30:00+09:00"
  ];
  const remoteRun = spawnSync("node", args, { cwd: __dirname, encoding: "utf8" });
  assert.strictEqual(remoteRun.status, 0, remoteRun.stderr || remoteRun.stdout);
  assert.strictEqual(JSON.parse(remoteRun.stdout).execution_origin, "remote");
  console.log("PASS remote verifier CLI emits a portable signed attestation");

  if (process.platform !== "win32") {
    fs.chmodSync(privateKeyPath, 0o644);
    const insecureKeyRun = spawnSync("node", args, { cwd: __dirname, encoding: "utf8" });
    assert.strictEqual(insecureKeyRun.status, 2);
    assert(/must not be readable/.test(insecureKeyRun.stderr));
  }
  console.log("PASS remote verifier CLI rejects an exposed private-key file");
} finally {
  fs.rmSync(cliRoot, { recursive: true, force: true });
}

console.log("Verification attestation fixtures: 10/10 passed");
