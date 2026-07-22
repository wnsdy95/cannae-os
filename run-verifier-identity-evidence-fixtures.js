#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  certificateSha256,
  createVerifierIdentityEvidence,
  identityEvidenceDigest,
  merkleLeafHash,
  merkleNodeHash,
  parseSpiffeId,
  verifyMerkleInclusion,
  verifyVerifierIdentityEvidence
} = require("./verifier-identity-evidence");
const { keyPair, makeCa, makeLeaf } = require("./verifier-identity-fixture-support");
const { validatePayload } = require("./validator-cli-prototype/validate");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function redigest(evidence) {
  evidence.evidence_sha256 = identityEvidenceDigest(evidence);
  return evidence;
}

function flipBase64(value) {
  return `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
}

function assertRejected(baseOptions, evidence, code, evaluatedAt) {
  const result = verifyVerifierIdentityEvidence({ ...baseOptions, evidence, evaluatedAt: evaluatedAt || baseOptions.evaluatedAt });
  assert.strictEqual(result.valid, false, `${code} fixture unexpectedly passed.`);
  assert(result.codes.includes(code), `${code} fixture returned ${result.codes.join(", ")}`);
}

function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "controls-identity-"));
  try {
    const root = makeCa(directory, "controls-root");
    const forgedRoot = makeCa(directory, "forged-root");
    const spiffeId = "spiffe://verification.example.test/campaign/verifier-a";
    const leaf = makeLeaf(directory, root, "verifier-a-workload", [spiffeId]);
    const wrongLeaf = makeLeaf(directory, root, "wrong-workload", ["spiffe://verification.example.test/campaign/wrong"]);
    const multipleSanLeaf = makeLeaf(directory, root, "multiple-san-workload", [spiffeId, "spiffe://verification.example.test/campaign/second"]);
    const forgedLeaf = makeLeaf(directory, forgedRoot, "forged-workload", [spiffeId]);
    const verifierKey = keyPair();
    const logKey = keyPair();
    const now = Date.now();
    const issuedAt = new Date(now + 1000).toISOString();
    const evaluatedAt = new Date(now + 2000).toISOString();
    const expiresAt = new Date(now + 301000).toISOString();
    const repository = {
      key: "controls-test",
      identity_fingerprint: "a".repeat(64)
    };
    const verifier = {
      id: "VERIFIER-WORKLOAD-A",
      key_id: verifierKey.keyId,
      public_key_pem: verifierKey.publicKey,
      independence_group: "external-a",
      status: "active",
      allowed_repository_keys: [repository.key],
      allowed_execution_origins: ["remote"],
      allowed_attestation_types: ["verification_receipt", "comparative_evaluation_report"],
      workload_identity: {
        type: "spiffe_x509",
        spiffe_id: spiffeId,
        trust_root_id: "ROOT-A",
        transparency_log_id: "LOG-A"
      },
      valid_from: new Date(now - 60000).toISOString(),
      valid_until: new Date(now + 86400000).toISOString()
    };
    const trustPolicy = {
      schema_version: "0.2",
      type: "VerifierTrustPolicy",
      id: "TRUST-POLICY-WORKLOAD-001",
      repository_binding: {
        repository_key: repository.key,
        identity_fingerprint: repository.identity_fingerprint
      },
      policy_version: 2,
      quorum: {
        minimum_valid_attestations: 1,
        minimum_independence_groups: 1,
        require_distinct_key_ids: true,
        max_attestation_age_seconds: 300
      },
      identity_assurance: {
        required: true,
        max_evidence_age_seconds: 60,
        trusted_x509_roots: [{
          id: "ROOT-A",
          trust_domain: "verification.example.test",
          certificate_pem: root.certificate,
          certificate_sha256: certificateSha256(root.certificate)
        }],
        trusted_transparency_logs: [{
          id: "LOG-A",
          origin: "controls.example.test/log-a",
          key_id: logKey.keyId,
          public_key_pem: logKey.publicKey
        }]
      },
      verifiers: [verifier],
      created_at: new Date(now - 60000).toISOString(),
      expires_at: new Date(now + 86400000).toISOString()
    };
    const createOptions = {
      evidenceId: "IDENTITY-EVIDENCE-001",
      verifier,
      trustPolicy,
      repositoryBinding: trustPolicy.repository_binding,
      workloadPrivateKeyPem: leaf.key,
      verifierPrivateKeyPem: verifierKey.privateKey,
      logPrivateKeyPem: logKey.privateKey,
      leafCertificatePem: leaf.certificate,
      purposes: verifier.allowed_attestation_types,
      nonce: "fixture-nonce-00000001",
      issuedAt,
      checkpointIssuedAt: issuedAt,
      expiresAt
    };
    const evidence = createVerifierIdentityEvidence(createOptions);
    const verifyOptions = { trustPolicy, verifier, repository, evaluatedAt };

    if (process.argv.includes("--write-samples")) {
      const validPath = path.join(__dirname, "sample-payloads", "valid-verifier-identity-evidence.json");
      const invalidPath = path.join(__dirname, "sample-payloads", "invalid-verifier-identity-evidence.json");
      const invalid = clone(evidence);
      invalid.authority_override = "self_authorized";
      redigest(invalid);
      fs.writeFileSync(validPath, `${JSON.stringify(evidence, null, 2)}\n`);
      fs.writeFileSync(invalidPath, `${JSON.stringify(invalid, null, 2)}\n`);
    }

    assert.strictEqual(validatePayload(trustPolicy, "verifier-trust-policy").valid, true);
    assert.strictEqual(validatePayload(evidence, "verifier-identity-evidence").valid, true);
    const valid = verifyVerifierIdentityEvidence({ ...verifyOptions, evidence });
    assert.deepStrictEqual(valid.codes, []);
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.spiffe_id, spiffeId);
    assert.strictEqual(valid.valid_until, new Date(Date.parse(issuedAt) + 60000).toISOString());
    assert.deepStrictEqual(verifyVerifierIdentityEvidence({ ...verifyOptions, evidence: { ...evidence, binding_statement: null } }).codes,
      ["IDENTITY_EVIDENCE_STRUCTURE_INVALID"]);
    assert.throws(() => createVerifierIdentityEvidence({
      ...createOptions,
      evidenceId: "IDENTITY-EVIDENCE-BAD-PROOF",
      inclusion: { treeSize: 2, logIndex: 0, rootHash: evidence.transparency.leaf_hash, inclusionPath: [] }
    }), /do not prove/);

    const wrongRepository = createVerifierIdentityEvidence({
      ...createOptions,
      evidenceId: "IDENTITY-EVIDENCE-WRONG-REPO",
      repositoryBinding: { repository_key: "other-repository", identity_fingerprint: "b".repeat(64) }
    });
    assertRejected(verifyOptions, wrongRepository, "IDENTITY_REPOSITORY_BINDING_MISMATCH");

    const wrongSan = createVerifierIdentityEvidence({
      ...createOptions,
      evidenceId: "IDENTITY-EVIDENCE-WRONG-SAN",
      workloadPrivateKeyPem: wrongLeaf.key,
      leafCertificatePem: wrongLeaf.certificate
    });
    assertRejected(verifyOptions, wrongSan, "IDENTITY_SPIFFE_ID_MISMATCH");

    const multipleSan = createVerifierIdentityEvidence({
      ...createOptions,
      evidenceId: "IDENTITY-EVIDENCE-MULTIPLE-SAN",
      workloadPrivateKeyPem: multipleSanLeaf.key,
      leafCertificatePem: multipleSanLeaf.certificate
    });
    assert.strictEqual(parseSpiffeId(new crypto.X509Certificate(multipleSanLeaf.certificate)), null);
    assertRejected(verifyOptions, multipleSan, "IDENTITY_SPIFFE_SAN_INVALID");

    const forgedChain = createVerifierIdentityEvidence({
      ...createOptions,
      evidenceId: "IDENTITY-EVIDENCE-FORGED-CHAIN",
      workloadPrivateKeyPem: forgedLeaf.key,
      leafCertificatePem: forgedLeaf.certificate
    });
    assertRejected(verifyOptions, forgedChain, "IDENTITY_CERTIFICATE_CHAIN_INVALID");

    const workloadTampered = clone(evidence);
    workloadTampered.signatures.workload_signature_base64 = flipBase64(workloadTampered.signatures.workload_signature_base64);
    assertRejected(verifyOptions, redigest(workloadTampered), "IDENTITY_WORKLOAD_SIGNATURE_INVALID");

    const verifierTampered = clone(evidence);
    verifierTampered.signatures.verifier_signature_base64 = flipBase64(verifierTampered.signatures.verifier_signature_base64);
    assertRejected(verifyOptions, redigest(verifierTampered), "IDENTITY_VERIFIER_SIGNATURE_INVALID");

    const logTampered = clone(evidence);
    logTampered.transparency.checkpoint.signature_base64 = flipBase64(logTampered.transparency.checkpoint.signature_base64);
    assertRejected(verifyOptions, redigest(logTampered), "IDENTITY_TRANSPARENCY_SIGNATURE_INVALID");

    const inclusionTampered = clone(evidence);
    inclusionTampered.transparency.checkpoint.root_hash = "f".repeat(64);
    assertRejected(verifyOptions, redigest(inclusionTampered), "IDENTITY_TRANSPARENCY_INCLUSION_INVALID");

    assertRejected(verifyOptions, evidence, "IDENTITY_EVIDENCE_NOT_ACTIVE", new Date(now + 302000).toISOString());
    assertRejected(verifyOptions, evidence, "IDENTITY_EVIDENCE_STALE", new Date(Date.parse(issuedAt) + 60000).toISOString());

    const leaf0 = merkleLeafHash(Buffer.from("zero"));
    const leaf1 = merkleLeafHash(Buffer.from("one"));
    const leaf2 = merkleLeafHash(Buffer.from("two"));
    const left = merkleNodeHash(leaf0, leaf1);
    const rootHash = merkleNodeHash(left, leaf2);
    assert.strictEqual(verifyMerkleInclusion({ leafHash: leaf2, logIndex: 2, treeSize: 3, inclusionPath: [left], rootHash }), true);
    assert.strictEqual(verifyMerkleInclusion({ leafHash: leaf2, logIndex: 2, treeSize: 3, inclusionPath: [leaf0], rootHash }), false);

    console.log("Verifier identity evidence fixtures passed: valid dual proof and 12 adversarial identity/transparency cases.");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main();
