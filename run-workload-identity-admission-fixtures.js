#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { superviseCampaign } = require("./campaign-supervisor");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");
const {
  certificateSha256,
  createVerifierIdentityEvidence
} = require("./verifier-identity-evidence");
const { keyPair, makeCa, makeLeaf } = require("./verifier-identity-fixture-support");
const { validatePayload } = require("./validator-cli-prototype/validate");

const CAMPAIGN_SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", "valid-self-improvement-campaign.json"), "utf8"));
const completed = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function makeEnvironment(name, evidenceMode) {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `controls-workload-admission-${name}-`));
  const repositoryPath = path.join(rootDirectory, "repo");
  const artifactRoot = path.join(rootDirectory, "artifacts");
  const certificateDirectory = path.join(rootDirectory, "certificates");
  fs.mkdirSync(repositoryPath, { recursive: true });
  fs.mkdirSync(certificateDirectory, { recursive: true });
  git(repositoryPath, ["init", "-q"]);
  git(repositoryPath, ["config", "user.email", "fixtures@controls.local"]);
  git(repositoryPath, ["config", "user.name", "Controls Fixtures"]);
  fs.writeFileSync(path.join(repositoryPath, "README.md"), `${name}\n`);
  git(repositoryPath, ["add", "README.md"]);
  git(repositoryPath, ["commit", "-qm", "fixture baseline"]);

  const repository = resolveRepository(repositoryPath);
  const ca = makeCa(certificateDirectory, "workload-root");
  const logKey = keyPair();
  const now = Date.now();
  const createdAt = new Date(now - 60000).toISOString();
  const issuedAt = new Date(now + 1000).toISOString();
  const evaluatedAt = new Date(now + 2000).toISOString();
  const expiresAt = new Date(now + 301000).toISOString();
  const policyExpiresAt = new Date(now + 86400000).toISOString();
  const verifierMaterials = ["a", "b"].map((suffix, index) => {
    const staticKey = keyPair();
    const spiffeId = `spiffe://verification.example.test/campaign/verifier-${suffix}`;
    const leaf = makeLeaf(certificateDirectory, ca, `workload-${suffix}`, [spiffeId]);
    return {
      staticKey,
      leaf,
      verifier: {
        id: `VERIFIER-Workload-${suffix.toUpperCase()}`,
        key_id: staticKey.keyId,
        public_key_pem: staticKey.publicKey,
        independence_group: `provider-${suffix}`,
        status: "active",
        allowed_repository_keys: [repository.key],
        allowed_execution_origins: ["remote"],
        allowed_attestation_types: ["verification_receipt", "comparative_evaluation_report"],
        workload_identity: {
          type: "spiffe_x509",
          spiffe_id: spiffeId,
          trust_root_id: "ROOT-Workload",
          transparency_log_id: "LOG-Workload"
        },
        valid_from: createdAt,
        valid_until: policyExpiresAt
      },
      index
    };
  });
  const trustPolicy = {
    schema_version: "0.2",
    type: "VerifierTrustPolicy",
    id: `VTP-Workload-${name}`,
    repository_binding: {
      repository_key: repository.key,
      identity_fingerprint: repository.identity_fingerprint
    },
    policy_version: 2,
    quorum: {
      minimum_valid_attestations: 2,
      minimum_independence_groups: 2,
      require_distinct_key_ids: true,
      max_attestation_age_seconds: 300
    },
    identity_assurance: {
      required: true,
      max_evidence_age_seconds: 60,
      trusted_x509_roots: [{
        id: "ROOT-Workload",
        trust_domain: "verification.example.test",
        certificate_pem: ca.certificate,
        certificate_sha256: certificateSha256(ca.certificate)
      }],
      trusted_transparency_logs: [{
        id: "LOG-Workload",
        origin: "controls.example.test/workload-log",
        key_id: logKey.keyId,
        public_key_pem: logKey.publicKey
      }]
    },
    verifiers: verifierMaterials.map(item => item.verifier),
    created_at: createdAt,
    expires_at: policyExpiresAt
  };
  const policyWrite = writeRepositoryArtifact({
    repositoryPath,
    artifactRoot,
    missionId: `MIS-Workload-${name}`,
    waveId: "C0",
    kind: "verifier-trust-policies",
    artifactId: trustPolicy.id,
    payload: trustPolicy,
    createdAt
  });

  const evidenceWrites = [];
  const evidenceCount = evidenceMode === "missing" ? 1 : 2;
  for (const material of verifierMaterials.slice(0, evidenceCount)) {
    const evidence = createVerifierIdentityEvidence({
      evidenceId: `VIE-Workload-${name}-${material.index + 1}`,
      verifier: material.verifier,
      trustPolicy,
      repositoryBinding: trustPolicy.repository_binding,
      workloadPrivateKeyPem: material.leaf.key,
      verifierPrivateKeyPem: material.staticKey.privateKey,
      logPrivateKeyPem: logKey.privateKey,
      leafCertificatePem: material.leaf.certificate,
      purposes: material.verifier.allowed_attestation_types,
      nonce: `fixture-workload-nonce-${material.index + 1}`,
      issuedAt,
      checkpointIssuedAt: issuedAt,
      expiresAt
    });
    if (evidenceMode === "invalid" && material.index === 1) evidence.evidence_sha256 = "f".repeat(64);
    evidenceWrites.push(writeRepositoryArtifact({
      repositoryPath,
      artifactRoot,
      missionId: `MIS-Workload-${name}`,
      waveId: "C0",
      kind: "verifier-identity-evidence",
      artifactId: evidence.id,
      payload: evidence,
      createdAt: issuedAt
    }));
  }

  const campaign = clone(CAMPAIGN_SAMPLE);
  campaign.schema_version = "0.4";
  campaign.id = `SIC-Workload-${name}`;
  campaign.mission_id = `MIS-Workload-${name}`;
  campaign.repository_binding = {
    repository_key: repository.key,
    identity_fingerprint: repository.identity_fingerprint,
    baseline_revision: repository.head_commit
  };
  campaign.created_at = createdAt;
  campaign.attestation_policy = {
    required: true,
    trust_policy_ref: {
      artifact_id: trustPolicy.id,
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
    missionId: campaign.mission_id,
    waveId: "C0",
    kind: "self-improvement-campaigns",
    artifactId: campaign.id,
    payload: campaign,
    createdAt
  });
  return { rootDirectory, repositoryPath, artifactRoot, campaign, evaluatedAt, evidenceWrites };
}

function evaluate(name, mode) {
  const environment = makeEnvironment(name, mode);
  try {
    const result = superviseCampaign({
      repositoryPath: environment.repositoryPath,
      artifactRoot: environment.artifactRoot,
      campaignId: environment.campaign.id,
      evaluatedAt: environment.evaluatedAt
    });
    const validation = validatePayload(result.order, "self-improvement-cycle-order");
    assert.strictEqual(validation.valid, true, JSON.stringify(validation, null, 2));
    return { order: result.order, evidenceWrites: environment.evidenceWrites };
  } finally {
    fs.rmSync(environment.rootDirectory, { recursive: true, force: true });
  }
}

function run(name, test) {
  test();
  completed.push(name);
}

try {
  run("two manifest-backed workload identities satisfy v0.2 trust policy admission", () => {
    const { order, evidenceWrites } = evaluate("valid", "valid");
    assert.strictEqual(order.schema_version, "0.3");
    assert.strictEqual(order.status, "ready");
    assert.strictEqual(order.trust_policy_admission.assurance_scope, "authenticated_workload_and_policy_eligibility");
    assert.strictEqual(order.trust_policy_admission.identity_assurance.satisfied, true);
    assert.strictEqual(order.trust_policy_admission.identity_assurance.authenticated_verifier_count, 2);
    assert.strictEqual(Date.parse(order.trust_policy_admission.valid_until), Date.parse(order.trust_policy_admission.identity_assurance.evidence[0].issued_at) + 60000);
    assert.deepStrictEqual(order.trust_policy_admission.identity_assurance.evidence.map(item => item.evidence_ref.sha256).sort(),
      evidenceWrites.map(item => item.sha256).sort());
  });

  run("missing workload identity evidence removes verifier from both purpose quorums", () => {
    const { order } = evaluate("missing", "missing");
    assert.strictEqual(order.status, "blocked");
    assert.strictEqual(order.trust_policy_admission.identity_assurance.authenticated_verifier_count, 1);
    assert(order.blocking_codes.includes("TRUST_ADMISSION_WORKLOAD_IDENTITY_UNAVAILABLE"));
  });

  run("schema-invalid workload identity evidence cannot enter admission", () => {
    const { order } = evaluate("invalid", "invalid");
    assert.strictEqual(order.status, "blocked");
    assert.strictEqual(order.trust_policy_admission.identity_assurance.authenticated_verifier_count, 1);
    assert(order.trust_policy_admission.blocking_codes.includes("TRUST_ADMISSION_WORKLOAD_IDENTITY_UNAVAILABLE"));
  });

  process.stdout.write(`${JSON.stringify({ valid: true, fixture_count: completed.length, fixtures: completed }, null, 2)}\n`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
