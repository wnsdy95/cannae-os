#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const {
  appraiseGitLabCIOIDCToken,
  createGitLabCIOIDCEvidence,
  createGitLabCIOIDCTrustBundle,
  deriveGitLabCIIndependence,
  nativeEvidenceDigest,
  trustBundleDigest,
  verifyGitLabCIOIDCEvidence,
  verifyGitLabCIOIDCTrustBundle
} = require("./gitlab-ci-oidc");
const {
  createVerifierExecutionEvidence,
  verifyVerifierExecutionEvidence
} = require("./verifier-execution-evidence");
const {
  createVerificationAttestation,
  evaluateAttestationQuorum,
  publicKeyId
} = require("./verification-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ref(id, fill) {
  return { artifact_id: id, relative_path: `repositories/test/missions/MIS-14B/W1/${id}.json`, sha256: fill.repeat(64) };
}

function ed25519() {
  const pair = crypto.generateKeyPairSync("ed25519");
  return {
    keyId: publicKeyId(pair.publicKey),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" })
  };
}

const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const rsaPublic = rsa.publicKey.export({ format: "jwk" });
const jwk = { ...rsaPublic, use: "sig", kid: "phase-14b-test-key", alg: "RS256" };
const discovery = {
  issuer: "https://gitlab.com",
  jwks_uri: "https://gitlab.com/oauth/discovery/keys",
  id_token_signing_alg_values_supported: ["RS256"]
};
const trustBundle = createGitLabCIOIDCTrustBundle({
  id: "GLOTB-14B-001",
  discovery,
  jwks: { keys: [jwk] },
  sourceKind: "pinned_file",
  retrievedAt: "2026-07-23T01:00:00Z",
  expiresAt: "2026-07-24T01:00:00Z"
});
const trustBundleReference = ref(trustBundle.id, "a");
const commit = "1".repeat(40);
const claims = {
  iss: "https://gitlab.com",
  sub: "project_path:wnsdy95/controls:ref_type:branch:ref:main",
  aud: "cannae-verifier-execution",
  iat: Date.parse("2026-07-23T01:04:00Z") / 1000,
  nbf: Date.parse("2026-07-23T01:03:55Z") / 1000,
  exp: Date.parse("2026-07-23T01:09:00Z") / 1000,
  jti: "oidc-token-14b-001",
  project_id: "10001",
  project_path: "wnsdy95/controls",
  namespace_id: "20002",
  namespace_path: "wnsdy95",
  job_project_id: "10001",
  job_project_path: "wnsdy95/controls",
  job_namespace_id: "20002",
  job_namespace_path: "wnsdy95",
  pipeline_id: "30003",
  pipeline_source: "push",
  job_id: "40004",
  ref: "main",
  ref_type: "branch",
  ref_path: "refs/heads/main",
  ref_protected: "true",
  runner_id: 50005,
  runner_environment: "gitlab-hosted",
  sha: commit,
  ci_config_ref_uri: "gitlab.com/wnsdy95/controls//.gitlab-ci.yml@refs/heads/main",
  ci_config_sha: commit
};

function signToken(overrides = {}, headerOverrides = {}, key = rsa.privateKey) {
  const header = { alg: "RS256", kid: jwk.kid, typ: "JWT", ...headerOverrides };
  const payload = { ...claims, ...overrides };
  const input = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  return `${input}.${crypto.sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
}

const token = signToken();
const nativePolicy = {
  adapter: "gitlab_ci_oidc_v1",
  trust_bundle_ref: trustBundleReference,
  algorithm: "RS256",
  required_runner_environment: "gitlab-hosted",
  require_protected_ref: true,
  require_same_project_config: true,
  max_token_age_seconds: 300,
  clock_skew_seconds: 30
};
const pinnedClaimNames = [
  "project_id", "project_path", "namespace_id", "namespace_path",
  "job_project_id", "job_project_path", "job_namespace_id", "job_namespace_path",
  "pipeline_source", "ref", "ref_type", "ref_path", "ref_protected",
  "runner_environment", "sha", "ci_config_ref_uri", "ci_config_sha"
];
const providerIdentityPolicy = {
  issuer: claims.iss,
  subject: claims.sub,
  audience: claims.aud,
  required_claims: Object.fromEntries(pinnedClaimNames.map(name => [name, claims[name]]))
};
const builder = ed25519();
const verifier = ed25519();
const execution = {
  verifier_code: { uri: `git+https://gitlab.com/wnsdy95/controls@${commit}#verification-runner.js`, digest: { sha256: "3".repeat(64) } },
  container_image: {
    uri: `registry.gitlab.com/wnsdy95/controls/verifier@sha256:${"4".repeat(64)}`,
    digest: { sha256: "4".repeat(64) },
    media_type: "application/vnd.oci.image.manifest.v1+json"
  },
  dependency_lockfile: { uri: `git+https://gitlab.com/wnsdy95/controls@${commit}#package-lock.json`, digest: { sha256: "5".repeat(64) } },
  harness: { uri: `git+https://gitlab.com/wnsdy95/controls@${commit}#verification-runner.js`, digest: { sha256: "6".repeat(64) } },
  argv: ["node", "verification-runner.js", "--plan", "plan.json"],
  tool_allowlist: ["git", "node"],
  network_policy: { mode: "denied", allowed_endpoints: [] },
  sandbox_profile: {
    kind: "gvisor", profile_uri: "oci://registry.gitlab.com/wnsdy95/verifier-policy@sha256:test",
    profile_sha256: "7".repeat(64), rootfs_read_only: true, no_new_privileges: true,
    privileged: false, host_network: false, host_pid: false, host_mounts: false
  }
};
const profile = {
  id: "PROFILE-14B-GITLAB",
  adapter: "in_toto_slsa_oci_dsse_v1",
  provider: "gitlab_ci",
  builder: { id: "https://gitlab.com", key_id: builder.keyId, public_key_pem: builder.publicKeyPem },
  provider_identity: providerIdentityPolicy,
  native_identity: nativePolicy,
  independence: deriveGitLabCIIndependence(claims),
  execution,
  max_evidence_age_seconds: 300,
  max_execution_duration_seconds: 120
};
const runtimePolicyReference = ref("VRP-14B-001", "b");
const repositoryBinding = { repository_key: "controls-14b", identity_fingerprint: "8".repeat(64) };
const runtimePolicy = {
  schema_version: "0.3",
  type: "VerifierRuntimePolicy",
  id: runtimePolicyReference.artifact_id,
  trust_policy_id: "VTP-14B-001",
  repository_binding: repositoryBinding,
  policy_version: 1,
  profiles: [profile],
  assignments: [{ verifier_id: "VERIFIER-14B-001", profile_id: profile.id, allowed_purposes: ["verification_receipt"] }],
  created_at: "2026-07-23T01:00:00Z",
  expires_at: "2026-07-24T01:00:00Z"
};
const trustPolicy = {
  schema_version: "0.6",
  type: "VerifierTrustPolicy",
  id: runtimePolicy.trust_policy_id,
  repository_binding: repositoryBinding,
  quorum: { minimum_valid_attestations: 1, minimum_independence_groups: 1, require_distinct_key_ids: true },
  execution_assurance: { required: true, runtime_policy_ref: runtimePolicyReference },
  independence_assurance: {
    required: true,
    required_dimensions: ["provider_id", "operator_id", "control_plane_id", "account_id", "project_id", "runner_pool_id", "infrastructure_id", "region_id", "zone_id"],
    correlation_rule: "shared_required_component",
    minimum_independent_domains: 2
  },
  verifiers: [{
    id: "VERIFIER-14B-001", status: "active", key_id: verifier.keyId, public_key_pem: verifier.publicKeyPem,
    independence_group: "legacy-declared", allowed_attestation_types: ["verification_receipt"],
    allowed_execution_origins: ["remote"], allowed_repository_keys: [repositoryBinding.repository_key],
    valid_from: "2026-07-23T01:00:00Z", valid_until: "2026-07-24T01:00:00Z"
  }]
};
const nativeEvidence = createGitLabCIOIDCEvidence({
  id: "GLOE-14B-001",
  token,
  trustBundle,
  trustBundleReference,
  profile,
  evaluatedAt: "2026-07-23T01:04:30Z"
});
const nativeEvidenceReference = ref(nativeEvidence.id, "c");

function appraisal(changes = {}) {
  return appraiseGitLabCIOIDCToken({
    token: changes.token || token,
    trustBundle: changes.trustBundle || trustBundle,
    profile: changes.profile || profile,
    evaluatedAt: changes.evaluatedAt || "2026-07-23T01:04:30Z"
  });
}

function hasCode(result, code) {
  assert(result.codes.includes(code), `Expected ${code}; got ${result.codes.join(", ")}`);
}

const completed = [];
let executionEvidence = null;
let executionEvidenceReference = null;
let executionSubjectReference = null;
let executionRepositoryState = null;
let executionVerificationTarget = null;
function run(name, action) {
  action();
  completed.push(name);
}

try {
  run("pinned GitLab.com JWKS trust bundle validates", () => {
    assert.strictEqual(verifyGitLabCIOIDCTrustBundle(trustBundle, "2026-07-23T01:04:30Z").valid, true);
    assert.strictEqual(validatePayload(trustBundle, "gitlab-ci-oidc-trust-bundle").valid, true);
  });
  run("valid GitLab CI JWT is cryptographically appraised", () => assert.strictEqual(appraisal().valid, true));
  run("native evidence schema and signed projection validate", () => {
    assert.strictEqual(validatePayload(nativeEvidence, "gitlab-ci-oidc-evidence").valid, true);
    assert.strictEqual(verifyGitLabCIOIDCEvidence({
      evidence: nativeEvidence, trustBundle, trustBundleReference, profile, evaluatedAt: "2026-07-23T01:04:30Z"
    }).valid, true);
  });
  run("algorithm confusion is rejected", () => hasCode(appraisal({ token: signToken({}, { alg: "HS256" }) }), "GITLAB_OIDC_HEADER_INVALID"));
  run("unknown key ID is rejected", () => hasCode(appraisal({ token: signToken({}, { kid: "unknown" }) }), "GITLAB_OIDC_SIGNING_KEY_UNKNOWN"));
  run("signature tampering is rejected", () => {
    const parts = token.split(".");
    parts[2] = Buffer.alloc(256, 1).toString("base64url");
    hasCode(appraisal({ token: parts.join(".") }), "GITLAB_OIDC_SIGNATURE_INVALID");
  });
  run("audience substitution is rejected", () => hasCode(appraisal({ token: signToken({ aud: "other" }) }), "GITLAB_OIDC_IDENTITY_MISMATCH"));
  run("audience arrays are rejected by the strict profile", () => hasCode(appraisal({ token: signToken({ aud: [claims.aud] }) }), "GITLAB_OIDC_IDENTITY_MISMATCH"));
  run("job project ID substitution is rejected", () => hasCode(appraisal({ token: signToken({ job_project_id: "99999" }) }), "GITLAB_OIDC_PINNED_CLAIM_MISMATCH"));
  run("source and job project divergence is rejected", () => hasCode(appraisal({ token: signToken({ project_id: "99999" }) }), "GITLAB_OIDC_CONFIG_NOT_IMMUTABLE"));
  run("unprotected refs are rejected", () => hasCode(appraisal({ token: signToken({ ref_protected: "false" }) }), "GITLAB_OIDC_REF_UNPROTECTED"));
  run("self-hosted runners are rejected", () => hasCode(appraisal({ token: signToken({ runner_environment: "self-hosted" }) }), "GITLAB_OIDC_RUNNER_UNSUPPORTED"));
  run("external or missing pipeline config is rejected", () => hasCode(appraisal({ token: signToken({ ci_config_ref_uri: null, ci_config_sha: null }) }), "GITLAB_OIDC_CONFIG_NOT_IMMUTABLE"));
  run("config commit drift is rejected", () => hasCode(appraisal({ token: signToken({ ci_config_sha: "2".repeat(40) }) }), "GITLAB_OIDC_CONFIG_NOT_IMMUTABLE"));
  run("expired tokens are rejected", () => hasCode(appraisal({ evaluatedAt: "2026-07-23T01:10:00Z" }), "GITLAB_OIDC_TOKEN_TIME_INVALID"));
  run("trust-bundle substitution is rejected", () => {
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ format: "jwk" });
    const changed = createGitLabCIOIDCTrustBundle({
      id: trustBundle.id, discovery, jwks: { keys: [{ ...other, use: "sig", kid: jwk.kid, alg: "RS256" }] },
      sourceKind: "pinned_file", retrievedAt: "2026-07-23T01:00:00Z", expiresAt: "2026-07-24T01:00:00Z"
    });
    hasCode(appraisal({ trustBundle: changed }), "GITLAB_OIDC_SIGNATURE_INVALID");
  });
  run("trust-bundle payload ID must match its manifest reference", () => {
    const changed = clone(trustBundle);
    changed.id = "GLOTB-14B-SUBSTITUTED";
    changed.bundle_sha256 = trustBundleDigest(changed);
    const result = verifyGitLabCIOIDCEvidence({
      evidence: nativeEvidence, trustBundle: changed, trustBundleReference, profile,
      evaluatedAt: "2026-07-23T01:04:30Z"
    });
    hasCode(result, "GITLAB_OIDC_TRUST_BUNDLE_REFERENCE_INVALID");
  });
  run("projection tampering is rejected after recomputing artifact digest", () => {
    const changed = clone(nativeEvidence);
    changed.independence.region_id = "cannae:gitlab_ci:region:invented";
    changed.evidence_sha256 = nativeEvidenceDigest(changed);
    const result = verifyGitLabCIOIDCEvidence({
      evidence: changed, trustBundle, trustBundleReference, profile, evaluatedAt: "2026-07-23T01:04:30Z"
    });
    hasCode(result, "GITLAB_OIDC_EVIDENCE_PROJECTION_INVALID");
  });
  run("additional native evidence fields fail closed", () => {
    const changed = clone(nativeEvidence);
    changed.authority_override = true;
    changed.evidence_sha256 = nativeEvidenceDigest(changed);
    const result = verifyGitLabCIOIDCEvidence({
      evidence: changed, trustBundle, trustBundleReference, profile, evaluatedAt: "2026-07-23T01:04:30Z"
    });
    hasCode(result, "GITLAB_OIDC_EVIDENCE_STRUCTURE_INVALID");
  });
  run("missing native trust material fails closed without an exception", () => {
    const result = verifyGitLabCIOIDCEvidence({
      evidence: nativeEvidence, trustBundle: null, trustBundleReference, profile,
      evaluatedAt: "2026-07-23T01:04:30Z"
    });
    hasCode(result, "GITLAB_OIDC_TRUST_BUNDLE_REFERENCE_INVALID");
    hasCode(result, "GITLAB_OIDC_TRUST_BUNDLE_STRUCTURE_INVALID");
  });
  run("runtime-policy v0.3 accepts authenticated conservative GitLab domains", () => {
    assert.strictEqual(validatePayload(runtimePolicy, "verifier-runtime-policy").valid, true);
    assert.strictEqual(profile.independence.infrastructure_id, "cannae:gitlab_ci:infrastructure:shared-unknown");
  });
  run("dynamic runner IDs cannot create false runner-pool diversity", () => {
    const other = deriveGitLabCIIndependence({ ...claims, runner_id: 99999 });
    assert.deepStrictEqual(other, profile.independence);
  });
  run("native execution evidence enters the common verifier contract", () => {
    executionRepositoryState = { head_commit: commit, worktree_fingerprint: "9".repeat(64), dirty: false };
    executionSubjectReference = ref("VR-14B-001", "d");
    executionVerificationTarget = { name: "candidate-14b", digest: { sha256: executionRepositoryState.worktree_fingerprint } };
    executionEvidence = createVerifierExecutionEvidence({
      trustPolicy, runtimePolicy, runtimePolicyReference, verifierId: trustPolicy.verifiers[0].id,
      purpose: "verification_receipt", subjectReference: executionSubjectReference, workloadIdentityEvidenceReference: ref("VIE-14B-001", "e"),
      repositoryBinding, repositoryState: executionRepositoryState, verificationTarget: executionVerificationTarget,
      nativeProviderEvidence: nativeEvidence, nativeProviderEvidenceReference: nativeEvidenceReference,
      nativeTrustBundle: trustBundle, nativeTrustBundleReference: trustBundleReference,
      invocation: { id: "INV-14B-001", started_at: "2026-07-23T01:04:10Z", finished_at: "2026-07-23T01:04:20Z", exit_code: 0 },
      builderPrivateKeyPem: builder.privateKeyPem, verifierPrivateKeyPem: verifier.privateKeyPem,
      issuedAt: "2026-07-23T01:04:30Z", expiresAt: "2026-07-23T01:08:00Z", evidenceId: "VEE-14B-001"
    });
    executionEvidenceReference = ref(executionEvidence.id, "0");
    assert.strictEqual(executionEvidence.schema_version, "0.3");
    assert.strictEqual(validatePayload(executionEvidence, "verifier-execution-evidence").valid, true);
    const result = verifyVerifierExecutionEvidence({
      evidence: executionEvidence, trustPolicy, runtimePolicy, runtimePolicyReference,
      nativeProviderEvidence: nativeEvidence, nativeTrustBundle: trustBundle,
      nativeTrustBundleReference: trustBundleReference, evaluatedAt: "2026-07-23T01:05:00Z",
      expectations: {
        purpose: "verification_receipt", verifierId: trustPolicy.verifiers[0].id,
        subjectReference: executionSubjectReference, repositoryState: executionRepositoryState,
        verificationTarget: executionVerificationTarget
      }
    });
    assert.strictEqual(result.valid, true, result.codes.join(", "));
  });
  run("native GitLab evidence is required by the receipt quorum path", () => {
    const receipt = {
      type: "VerificationReceipt", id: executionSubjectReference.artifact_id, plan_id: "VP-14B-001",
      receipt_sha256: "f".repeat(64), candidate_id: "candidate-14b", candidate_revision: `WT-${executionRepositoryState.worktree_fingerprint}`,
      campaign_id: "SIC-14B-001", mission_id: "MIS-14B", cycle_number: 1, repository_binding: repositoryBinding
    };
    const attestation = createVerificationAttestation({
      receipt, receiptReference: executionSubjectReference, verifier: trustPolicy.verifiers[0],
      privateKeyPem: verifier.privateKeyPem, executionEvidenceReference, executionOrigin: "remote",
      invocationId: "INV-14B-ATTEST", issuedAt: "2026-07-23T01:04:40Z",
      expiresAt: "2026-07-23T01:08:00Z", nonce: "NONCE-14B-ATTEST"
    });
    const expectations = {
      receiptReferences: {
        [receipt.id]: {
          relative_path: executionSubjectReference.relative_path, sha256: executionSubjectReference.sha256,
          receipt_sha256: receipt.receipt_sha256, repository_state: executionRepositoryState,
          verification_target: executionVerificationTarget
        }
      },
      campaignId: receipt.campaign_id, missionId: receipt.mission_id, cycleNumber: 1,
      candidateId: receipt.candidate_id, candidateRevision: receipt.candidate_revision,
      repositoryKey: repositoryBinding.repository_key, runtimePolicy, runtimePolicyReference,
      executionEvidence: [{ entry: executionEvidenceReference, payload: executionEvidence }],
      nativeProviderEvidence: [{ entry: nativeEvidenceReference, payload: nativeEvidence }],
      nativeTrustBundles: [{ entry: trustBundleReference, payload: trustBundle }]
    };
    const result = evaluateAttestationQuorum([attestation], trustPolicy, expectations, trustPolicy.quorum, "2026-07-23T01:05:00Z");
    assert.strictEqual(result.valid, true, result.codes.join(", "));
    const missing = evaluateAttestationQuorum(
      [attestation], trustPolicy, { ...expectations, nativeProviderEvidence: [] }, trustPolicy.quorum, "2026-07-23T01:05:00Z"
    );
    assert.strictEqual(missing.valid, false);
    assert(missing.codes.includes("EXECUTION_EVIDENCE_NATIVE_PROVIDER_REQUIRED"));
  });
  run("dirty native repository state cannot create execution evidence", () => {
    assert.throws(() => createVerifierExecutionEvidence({
      trustPolicy, runtimePolicy, runtimePolicyReference, verifierId: trustPolicy.verifiers[0].id,
      purpose: "verification_receipt", subjectReference: ref("VR-14B-DIRTY", "f"), workloadIdentityEvidenceReference: ref("VIE-14B-DIRTY", "1"),
      repositoryBinding, repositoryState: { head_commit: commit, worktree_fingerprint: "9".repeat(64), dirty: true },
      verificationTarget: { name: "dirty", digest: { sha256: "9".repeat(64) } },
      nativeProviderEvidence: nativeEvidence, nativeProviderEvidenceReference: nativeEvidenceReference,
      nativeTrustBundle: trustBundle, nativeTrustBundleReference: trustBundleReference,
      invocation: { id: "INV-14B-DIRTY", started_at: "2026-07-23T01:04:10Z", finished_at: "2026-07-23T01:04:20Z", exit_code: 0 },
      builderPrivateKeyPem: builder.privateKeyPem, verifierPrivateKeyPem: verifier.privateKeyPem,
      issuedAt: "2026-07-23T01:04:30Z", expiresAt: "2026-07-23T01:08:00Z"
    }), /clean repository/);
  });
  process.stdout.write(`${JSON.stringify({ valid: true, fixture_count: completed.length, fixtures: completed }, null, 2)}\n`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}

module.exports = { nativeEvidence, profile, runtimePolicy, trustBundle };
