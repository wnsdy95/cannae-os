#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { bundleFromJSON } = require("@sigstore/bundle");
const { Verifier, toSignedEntity } = require("@sigstore/verify");
const { evaluateVerifierTrustReadiness } = require("./verifier-trust-readiness");
const { superviseCampaign } = require("./campaign-supervisor");
const {
  createSigstoreIdentityBindingStatement,
  sigstoreEvidenceDigest,
  verifySigstoreVerifierIdentityEvidence
} = require("./sigstore-verifier-identity-evidence");
const {
  trustMaterialFromArtifact,
  verifySigstoreTrustedRoot
} = require("./sigstore-trusted-root");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { publicKeyId } = require("./verification-attestation");

const FIXTURES = path.join(__dirname, "sigstore-fixtures");
const root = read("pgi-trusted-root.json");
const policy = read("valid-trust-policy.json");
const evidence = read("valid-identity-evidence.json");
const repository = {
  key: policy.repository_binding.repository_key,
  identity_fingerprint: policy.repository_binding.identity_fingerprint
};
const evaluatedAt = new Date(Date.parse(evidence.issued_at) + 5000).toISOString();
const completed = [];

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixtureRef(name, artifactId) {
  const bytes = fs.readFileSync(path.join(FIXTURES, name));
  return {
    entry: {
      artifact_id: artifactId,
      relative_path: `sigstore-fixtures/${name}`,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex")
    },
    payload: read(name)
  };
}

function verify(overrides = {}) {
  const selectedEvidence = overrides.evidence || evidence;
  const selectedPolicy = overrides.policy || policy;
  const selectedRoot = overrides.root || root;
  return verifySigstoreVerifierIdentityEvidence({
    evidence: selectedEvidence,
    trustPolicy: selectedPolicy,
    verifier: selectedPolicy.verifiers[0],
    trustedRootArtifact: selectedRoot,
    repository,
    evaluatedAt: overrides.evaluatedAt || evaluatedAt
  });
}

function run(name, test) {
  test();
  completed.push(name);
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

try {
  run("manifest artifact schemas and semantic digests accept the pinned root and keyless evidence", () => {
    assert.strictEqual(validatePayload(root, "sigstore-trusted-root").valid, true);
    assert.strictEqual(validatePayload(policy, "verifier-trust-policy").valid, true);
    assert.strictEqual(validatePayload(evidence, "sigstore-verifier-identity-evidence").valid, true);
    assert.strictEqual(verifySigstoreTrustedRoot(root).valid, true);
  });

  run("official verifier accepts the Fulcio identity, Rekor proof, artifact binding, and static verifier signature", () => {
    const result = verify();
    assert.strictEqual(result.valid, true, JSON.stringify(result, null, 2));
    assert.strictEqual(result.identity_provider, "sigstore_bundle");
    assert.strictEqual(result.identity, policy.verifiers[0].workload_identity.certificate_identity);
    assert.strictEqual(result.identity_authority, policy.verifiers[0].workload_identity.certificate_issuer);
    assert.strictEqual(result.transparency_log_ids.length, 1);
  });

  run("TrustedRoot CLI normalizes a pinned official root without network access", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "controls-sigstore-root-cli-"));
    try {
      const input = path.join(directory, "trusted-root.json");
      fs.writeFileSync(input, `${JSON.stringify(root.trusted_root)}\n`);
      const result = spawnSync("node", [
        "sigstore-trusted-root-runner.js", "--id", "STR-CLI-Fixture", "--input", input,
        "--source-uri", "fixture://pinned-root", "--retrieved-at", evidence.issued_at
      ], { cwd: __dirname, encoding: "utf8" });
      assert.strictEqual(result.status, 0, result.stderr);
      assert.strictEqual(validatePayload(JSON.parse(result.stdout), "sigstore-trusted-root").valid, true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  run("statement-only CLI emits the exact canonical bytes required for external Cosign signing", () => {
    const result = spawnSync("node", [
      "sigstore-verifier-identity-runner.js",
      "--policy", "sigstore-fixtures/valid-trust-policy.json",
      "--trusted-root", "sigstore-fixtures/pgi-trusted-root.json",
      "--verifier", policy.verifiers[0].id,
      "--evidence-id", "SVE-CLI-Fixture",
      "--repository", ".",
      "--purpose", "verification_receipt",
      "--nonce", "sigstore-cli-fixture-nonce-001",
      "--issued-at", evidence.issued_at,
      "--expires-at", evidence.expires_at,
      "--statement-only"
    ], { cwd: __dirname, encoding: null });
    assert.strictEqual(result.status, 0, result.stderr && result.stderr.toString());
    const localRepository = resolveRepository(__dirname);
    const expected = createSigstoreIdentityBindingStatement({
      evidenceId: "SVE-CLI-Fixture",
      verifier: policy.verifiers[0],
      trustedRootArtifact: root,
      repositoryBinding: {
        repository_key: localRepository.key,
        identity_fingerprint: localRepository.identity_fingerprint
      },
      purposes: ["verification_receipt"],
      nonce: "sigstore-cli-fixture-nonce-001",
      issuedAt: evidence.issued_at,
      expiresAt: evidence.expires_at
    });
    assert(result.stdout.equals(require("./sigstore-trusted-root").canonicalJsonBytes(expected)));
  });

  run("an exact certificate identity mismatch fails closed", () => {
    const changed = clone(policy);
    changed.verifiers[0].workload_identity.certificate_identity = "other@example.test";
    const result = verify({ policy: changed });
    assert.strictEqual(result.valid, false);
    assert(result.codes.includes("SIGSTORE_IDENTITY_POLICY_BINDING_MISMATCH"));
  });

  run("a zero verification threshold fails closed in both the low-level verifier and CLI", () => {
    const changed = clone(policy);
    changed.verifiers[0].workload_identity.tlog_threshold = 0;
    const result = verify({ policy: changed });
    assert.strictEqual(result.valid, false);
    assert(result.codes.includes("SIGSTORE_IDENTITY_POLICY_CONFIGURATION_INVALID"));

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "controls-sigstore-invalid-policy-"));
    try {
      const policyPath = path.join(directory, "policy.json");
      fs.writeFileSync(policyPath, `${JSON.stringify(changed)}\n`);
      const cli = spawnSync("node", [
        "sigstore-verifier-identity-runner.js",
        "--policy", policyPath,
        "--trusted-root", "sigstore-fixtures/pgi-trusted-root.json",
        "--verifier", changed.verifiers[0].id,
        "--evidence-id", "SVE-Invalid-Policy",
        "--repository", ".",
        "--purpose", "verification_receipt",
        "--nonce", "sigstore-invalid-policy-nonce-001",
        "--issued-at", evidence.issued_at,
        "--expires-at", evidence.expires_at,
        "--statement-only"
      ], { cwd: __dirname, encoding: "utf8" });
      assert.notStrictEqual(cli.status, 0);
      assert.match(cli.stderr, /failed validation/i);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  run("certificate SAN kind must match the policy identity kind", () => {
    const changed = clone(policy);
    changed.verifiers[0].workload_identity.certificate_identity_type = "uri";
    const result = verify({ policy: changed });
    assert.strictEqual(result.valid, false);
    assert(result.codes.includes("SIGSTORE_IDENTITY_CERTIFICATE_SAN_TYPE_MISMATCH"));
  });

  run("a recomputed wrapper digest cannot conceal a changed static verifier signature", () => {
    const changed = clone(evidence);
    changed.signatures.verifier_signature_base64 = `${changed.signatures.verifier_signature_base64.slice(0, -4)}AAAA`;
    changed.evidence_sha256 = sigstoreEvidenceDigest(changed);
    const result = verify({ evidence: changed });
    assert.strictEqual(result.valid, false);
    assert(result.codes.includes("SIGSTORE_IDENTITY_VERIFIER_SIGNATURE_INVALID"));
  });

  run("a stale pinned TrustedRoot cannot admit an otherwise valid bundle", () => {
    const changedRoot = clone(root);
    changedRoot.source.retrieved_at = new Date(Date.parse(evidence.issued_at) - 120000).toISOString();
    const changedPolicy = clone(policy);
    changedPolicy.identity_assurance.max_trusted_root_age_seconds = 60;
    const result = verify({ root: changedRoot, policy: changedPolicy });
    assert.strictEqual(result.valid, false);
    assert(result.codes.includes("SIGSTORE_IDENTITY_TRUST_ROOT_STALE"));
  });

  run("the official conformance happy bundle verifies under the pinned public-good root", () => {
    const artifact = fs.readFileSync(path.join(FIXTURES, "conformance-a.txt"));
    const bundle = bundleFromJSON(read("conformance-happy-bundle.json"));
    const verifier = new Verifier(trustMaterialFromArtifact(root), {
      ctlogThreshold: 1,
      tlogThreshold: 1,
      timestampThreshold: 1
    });
    assert.doesNotThrow(() => verifier.verify(toSignedEntity(bundle, artifact)));
  });

  for (const [name, fixture] of [
    ["artifact-to-Rekor digest/signature mismatch", "wrong-artifact-bundle.json"],
    ["unrelated Rekor entry", "wrong-rekor-entry-bundle.json"]
  ]) {
    run(`${name} is rejected by the pinned official verifier`, () => {
      const artifact = fs.readFileSync(path.join(FIXTURES, "conformance-a.txt"));
      const bundle = bundleFromJSON(read(fixture));
      const verifier = new Verifier(trustMaterialFromArtifact(root), {
        ctlogThreshold: 1,
        tlogThreshold: 1,
        timestampThreshold: 1
      });
      assert.throws(() => verifier.verify(toSignedEntity(bundle, artifact)), error => error.code === "TLOG_BODY_ERROR");
    });
  }

  run("readiness emits generic identity authority evidence and admits the authenticated verifier", () => {
    const campaign = {
      schema_version: "0.4",
      attestation_policy: {
        trust_policy_ref: { artifact_id: policy.id, relative_path: "policy.json", sha256: "b".repeat(64) },
        minimum_valid_attestations: 1,
        minimum_independence_groups: 1,
        require_distinct_key_ids: true
      }
    };
    const result = evaluateVerifierTrustReadiness({
      campaign,
      repository,
      trustPolicy: policy,
      sigstoreTrustedRoots: [fixtureRef("pgi-trusted-root.json", root.id)],
      sigstoreIdentityEvidence: [fixtureRef("valid-identity-evidence.json", evidence.id)],
      evaluatedAt
    });
    assert.strictEqual(result.satisfied, true, JSON.stringify(result, null, 2));
    assert.strictEqual(result.identity_assurance.distinct_identity_authority_count, 1);
    assert.strictEqual(result.identity_assurance.evidence[0].identity_provider, "sigstore_bundle");
    assert.strictEqual(result.receipt_quorum.satisfied, true);
    assert.strictEqual(result.comparative_quorum.satisfied, true);
  });

  run("missing Sigstore evidence removes the verifier from both quorums", () => {
    const campaign = {
      schema_version: "0.4",
      attestation_policy: {
        trust_policy_ref: { artifact_id: policy.id, relative_path: "policy.json", sha256: "b".repeat(64) },
        minimum_valid_attestations: 1,
        minimum_independence_groups: 1,
        require_distinct_key_ids: true
      }
    };
    const result = evaluateVerifierTrustReadiness({
      campaign,
      repository,
      trustPolicy: policy,
      sigstoreTrustedRoots: [fixtureRef("pgi-trusted-root.json", root.id)],
      sigstoreIdentityEvidence: [],
      evaluatedAt
    });
    assert.strictEqual(result.satisfied, false);
    assert(result.blocking_codes.includes("TRUST_ADMISSION_WORKLOAD_IDENTITY_UNAVAILABLE"));
  });

  run("campaign supervisor reloads the exact manifest-bound root and fails closed without evidence", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "controls-sigstore-supervisor-"));
    try {
      const repositoryPath = path.join(directory, "repo");
      const artifactRoot = path.join(directory, "artifacts");
      fs.mkdirSync(repositoryPath, { recursive: true });
      git(repositoryPath, ["init", "-q"]);
      git(repositoryPath, ["config", "user.email", "fixtures@controls.local"]);
      git(repositoryPath, ["config", "user.name", "Controls Fixtures"]);
      fs.writeFileSync(path.join(repositoryPath, "README.md"), "sigstore supervisor fixture\n");
      git(repositoryPath, ["add", "README.md"]);
      git(repositoryPath, ["commit", "-qm", "fixture baseline"]);
      const localRepository = resolveRepository(repositoryPath);
      const missionId = "MIS-Sigstore-Supervisor";
      const rootWrite = writeRepositoryArtifact({
        repositoryPath,
        artifactRoot,
        missionId,
        waveId: "C0",
        kind: "sigstore-trusted-roots",
        artifactId: root.id,
        payload: root,
        createdAt: root.source.retrieved_at
      });
      const selectedPolicy = clone(policy);
      selectedPolicy.id = "VTP-Sigstore-Supervisor";
      selectedPolicy.repository_binding = {
        repository_key: localRepository.key,
        identity_fingerprint: localRepository.identity_fingerprint
      };
      selectedPolicy.verifiers[0].allowed_repository_keys = [localRepository.key];
      const secondPair = crypto.generateKeyPairSync("ed25519");
      const secondVerifier = clone(selectedPolicy.verifiers[0]);
      secondVerifier.id = "VERIFIER-Sigstore-Supervisor-B";
      secondVerifier.key_id = publicKeyId(secondPair.publicKey);
      secondVerifier.public_key_pem = secondPair.publicKey.export({ type: "spki", format: "pem" });
      secondVerifier.independence_group = "sigstore-supervisor-b";
      selectedPolicy.verifiers.push(secondVerifier);
      selectedPolicy.quorum.minimum_valid_attestations = 2;
      selectedPolicy.quorum.minimum_independence_groups = 2;
      selectedPolicy.identity_assurance.sigstore_trusted_root_refs = [{
        artifact_id: root.id,
        relative_path: rootWrite.relative_path,
        sha256: rootWrite.sha256
      }];
      const policyWrite = writeRepositoryArtifact({
        repositoryPath,
        artifactRoot,
        missionId,
        waveId: "C0",
        kind: "verifier-trust-policies",
        artifactId: selectedPolicy.id,
        payload: selectedPolicy,
        createdAt: selectedPolicy.created_at
      });
      const campaign = read("../sample-payloads/valid-self-improvement-campaign.json");
      campaign.schema_version = "0.4";
      campaign.id = "SIC-Sigstore-Supervisor";
      campaign.mission_id = missionId;
      campaign.repository_binding = {
        repository_key: localRepository.key,
        identity_fingerprint: localRepository.identity_fingerprint,
        baseline_revision: localRepository.head_commit
      };
      campaign.created_at = selectedPolicy.created_at;
      campaign.attestation_policy = {
        required: true,
        trust_policy_ref: {
          artifact_id: selectedPolicy.id,
          relative_path: policyWrite.relative_path,
          sha256: policyWrite.sha256
        },
        minimum_valid_attestations: 2,
        minimum_independence_groups: 2,
        require_distinct_key_ids: true,
        max_attestation_age_seconds: 300
      };
      writeRepositoryArtifact({
        repositoryPath,
        artifactRoot,
        missionId,
        waveId: "C0",
        kind: "self-improvement-campaigns",
        artifactId: campaign.id,
        payload: campaign,
        createdAt: campaign.created_at
      });
      const result = superviseCampaign({ repositoryPath, artifactRoot, campaignId: campaign.id, evaluatedAt });
      assert.strictEqual(result.history.sigstoreTrustedRoots.length, 1);
      assert.strictEqual(result.order.schema_version, "0.4");
      assert.strictEqual(result.order.status, "blocked");
      assert(result.order.blocking_codes.includes("TRUST_ADMISSION_WORKLOAD_IDENTITY_UNAVAILABLE"));
      assert.strictEqual(validatePayload(result.order, "self-improvement-cycle-order").valid, true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  process.stdout.write(`${JSON.stringify({ valid: true, fixture_count: completed.length, fixtures: completed }, null, 2)}\n`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
