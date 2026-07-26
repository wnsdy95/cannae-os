#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  createProductionSandboxAdmission,
  evaluateProductionEvidenceQuorum,
  objectDigest,
  productionSandboxAdmissionDigest,
  productionSandboxEvidenceDigest,
  signProductionSandboxEvidence,
  verifyProductionSandboxAdmissionBundle
} = require("./production-sandbox-admission");
const {
  issueProductionSandboxAdmission,
  persistProductionSandboxEvidence,
  persistProductionSandboxPolicy,
  verifyProductionSandboxAdmission
} = require("./production-sandbox-admission-adapter");
const {
  resolveRepository,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const { publicKeyId } = require("./verification-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");

const ROOT = __dirname;
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "cannae-production-sandbox-")
);
const artifactRoot = path.join(temporaryRoot, "artifacts");
const missionId = "MIS-PRODUCTION-SANDBOX";
const waveId = "W1";
const baseTime = Date.parse("2026-07-26T01:00:00Z");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function iso(offsetMs) {
  return new Date(baseTime + offsetMs).toISOString();
}

function keyPair() {
  const pair = crypto.generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({
    type: "spki",
    format: "pem"
  });
  const privateKey = pair.privateKey.export({
    type: "pkcs8",
    format: "pem"
  });
  return {
    publicKey,
    privateKey,
    keyId: publicKeyId(pair.publicKey)
  };
}

function runGit(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "git failed").trim()
    );
  }
  return result.stdout.trim();
}

function initRepository() {
  const repository = path.join(temporaryRoot, "repository");
  fs.mkdirSync(repository, { recursive: true });
  runGit(repository, ["init", "-q"]);
  runGit(repository, ["config", "user.email", "fixtures@example.com"]);
  runGit(repository, ["config", "user.name", "Production Sandbox Fixture"]);
  fs.writeFileSync(
    path.join(repository, "README.md"),
    "production sandbox fixture\n"
  );
  runGit(repository, ["add", "README.md"]);
  runGit(repository, ["commit", "-qm", "initial"]);
  writeRepositoryArtifact({
    repositoryPath: repository,
    artifactRoot,
    missionId,
    waveId,
    kind: "bootstrap",
    artifactId: "EVD-PRODUCTION-BOOTSTRAP",
    payload: {
      id: "EVD-PRODUCTION-BOOTSTRAP",
      type: "ProductionSandboxFixtureBootstrap"
    },
    createdAt: iso(0)
  });
  return repository;
}

function refFromWrite(write, artifactId) {
  return {
    artifact_id: artifactId,
    relative_path: write.relative_path,
    sha256: write.sha256
  };
}

function writeOciPolicy(repository, repositoryBinding, gateway) {
  const policy = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "sample-payloads/valid-oci-linux-sandbox-policy.json"),
      "utf8"
    )
  );
  policy.id = "OLSP-PRODUCTION-001";
  policy.repository_binding = clone(repositoryBinding);
  policy.gateway_binding_sha256 = objectDigest(gateway);
  policy.valid_from = iso(-60000);
  policy.expires_at = iso(3600000);
  const validation = validatePayload(policy, "oci-linux-sandbox-policy");
  assert.strictEqual(validation.valid, true, JSON.stringify(validation, null, 2));
  const write = writeRepositoryArtifact({
    repositoryPath: repository,
    artifactRoot,
    missionId,
    waveId,
    kind: "oci-linux-sandbox-policies",
    artifactId: policy.id,
    payload: policy,
    createdAt: policy.valid_from
  });
  return {
    payload: policy,
    ref: refFromWrite(write, policy.id)
  };
}

function independence(label) {
  return {
    provider_id: `cannae:provider:${label}`,
    operator_id: `cannae:operator:${label}`,
    control_plane_id: `cannae:control-plane:${label}`,
    account_id: `cannae:account:${label}`,
    project_id: `cannae:project:${label}`,
    runner_pool_id: `cannae:runner-pool:${label}`,
    infrastructure_id: `cannae:infrastructure:${label}`,
    region_id: `cannae:region:${label}`,
    zone_id: `cannae:zone:${label}`
  };
}

function appraiser(id, key, label) {
  return {
    id,
    key_id: key.keyId,
    algorithm: "ed25519",
    public_key_pem: key.publicKey,
    workload_identity: {
      spiffe_id: `spiffe://appraisers.controls.test/${label}`,
      trust_domain: "appraisers.controls.test"
    },
    independence: independence(label)
  };
}

function productionPolicy(
  repositoryBinding,
  gateway,
  executorPolicyRef,
  admissionKey,
  appraisers
) {
  return {
    schema_version: "0.1",
    type: "ProductionSandboxPolicy",
    id: "PSP-PRODUCTION-001",
    repository_binding: clone(repositoryBinding),
    gateway: clone(gateway),
    admission_authority: {
      key_id: admissionKey.keyId,
      algorithm: "ed25519",
      public_key_pem: admissionKey.publicKey
    },
    appraisers: clone(appraisers),
    quorum: {
      minimum_valid_evidence: 2,
      minimum_independent_domains: 2,
      require_distinct_key_ids: true,
      correlation_rule: "shared_required_component",
      required_dimensions: [
        "provider_id",
        "operator_id",
        "control_plane_id",
        "account_id",
        "project_id",
        "runner_pool_id",
        "infrastructure_id",
        "region_id",
        "zone_id"
      ]
    },
    evidence_profile: {
      adapter: "rats_attestation_result_v1",
      eat_profile: "https://controls.example/eat/production-sandbox/v1",
      nonce_bytes: 32,
      max_evidence_age_seconds: 300,
      require_reference_values: true,
      require_endorsements: true
    },
    execution_scope: {
      allowed_operation_classes: ["process_execute"],
      allowed_execution_modes: ["oci_linux_sandbox_reference"],
      executor_policy_refs: [clone(executorPolicyRef)]
    },
    required_controls: {
      host_attestation: true,
      runtime_attestation: true,
      image_provenance: true,
      credential_key_custody: true,
      rootless_or_userns: true,
      mandatory_access_control: true,
      application_minimal_seccomp: true,
      network_policy: "none_or_authenticated_allowlist",
      read_only_filesystems: true,
      linearizable_coordination: true,
      storage_fencing: true,
      exclusive_gateway_path: true,
      gateway_outage_denies_tools: true,
      sandbox_outage_denies_tools: true
    },
    valid_from: iso(-60000),
    expires_at: iso(3600000),
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      production_execution_authorized: false,
      release_authorized: false
    }
  };
}

function deployment(gateway) {
  const attestationResultSha256 = digest("rats-attestation-result");
  return {
    deployment_id: "production-sandbox-deployment-001",
    gateway: clone(gateway),
    host: {
      platform: "linux-amd64-tpm2",
      host_id: "host-production-001",
      boot_id: "boot-production-001",
      attestation_result_sha256: attestationResultSha256,
      boot_measurement_sha256: digest("boot-measurement"),
      host_configuration_sha256: digest("host-configuration")
    },
    runtime: {
      engine: "docker",
      daemon_sha256: digest("dockerd-binary"),
      runtime_name: "runc",
      runtime_sha256: digest("runc-binary"),
      daemon_configuration_sha256: digest("dockerd-configuration"),
      rootless: true,
      user_namespace_mode: "private"
    },
    image: {
      reference: "registry.example/cannae/sandbox@sha256:" +
        digest("oci-manifest"),
      manifest_media_type: "application/vnd.oci.image.manifest.v1+json",
      manifest_sha256: digest("oci-manifest"),
      statement_type: "https://in-toto.io/Statement/v1",
      provenance_predicate_type: "https://slsa.dev/provenance/v1",
      provenance_statement_sha256: digest("slsa-provenance"),
      provenance_verified: true,
      signature_verified: true,
      transparency_verified: true,
      builder_id: "https://builder.example/cannae/production",
      source_repository: "https://github.com/wnsdy95/cannae-os",
      source_commit: "0123456789abcdef0123456789abcdef01234567"
    },
    credentials: {
      key_custody: "spiffe_workload_api",
      workload_identity_verified: true,
      rotation_managed: true,
      revocation_managed: true,
      configuration_sha256: digest("workload-api-configuration")
    },
    mandatory_access_control: {
      provider: "apparmor",
      enforcing: true,
      profile_sha256: digest("apparmor-profile")
    },
    seccomp: {
      mode: "application_minimal",
      default_action: "SCMP_ACT_ERRNO",
      enforced: true,
      profile_sha256: digest("application-minimal-seccomp")
    },
    filesystem: {
      rootfs_read_only: true,
      repository_read_only: true,
      host_mounts_prohibited: true,
      policy_sha256: digest("filesystem-policy")
    },
    network: {
      mode: "none",
      enforced: true,
      dns_policy_verified: true,
      proxy_policy_verified: true,
      policy_sha256: digest("network-policy")
    },
    coordination: {
      backend: "external_linearizable",
      adapter_sha256: digest("coordinator-adapter"),
      configuration_sha256: digest("coordinator-configuration"),
      storage_fencing_verified: true,
      lease_expiry_verified: true,
      fencing_test_sha256: digest("coordinator-fencing-test")
    },
    exclusive_path: {
      gateway_only: true,
      direct_tool_path_blocked: true,
      gateway_outage_tool_unreachable: true,
      sandbox_outage_tool_unreachable: true,
      adversarial_tests_passed: true,
      test_suite_sha256: digest("exclusive-path-test-suite"),
      tested_at: iso(1000)
    }
  };
}

function evidence(
  policy,
  policyRef,
  appraiserRecord,
  appraiserKey,
  commonDeployment,
  suffix
) {
  const nonce = digest(`production-evidence-nonce:${suffix}`);
  return signProductionSandboxEvidence({
    schema_version: "0.1",
    type: "ProductionSandboxEvidence",
    id: `PSE-PRODUCTION-${suffix}`,
    policy_ref: clone(policyRef),
    appraiser_id: appraiserRecord.id,
    repository_binding: clone(policy.repository_binding),
    gateway: clone(policy.gateway),
    nonce,
    appraiser_identity: {
      spiffe_id: appraiserRecord.workload_identity.spiffe_id,
      trust_domain: appraiserRecord.workload_identity.trust_domain,
      credential_sha256: digest(`credential:${suffix}`),
      proof_verified: true,
      authenticated_at: iso(1000),
      expires_at: iso(300000),
      independence: clone(appraiserRecord.independence)
    },
    attestation_result: {
      architecture: "rats_rfc9334",
      adapter: "rats_attestation_result_v1",
      eat_profile: policy.evidence_profile.eat_profile,
      freshness_nonce: nonce,
      appraisal: "pass",
      evidence: {
        uri: `urn:cannae:rats:evidence:${suffix}`,
        sha256: digest(`rats-evidence:${suffix}`)
      },
      result: {
        uri: `urn:cannae:rats:result:${suffix}`,
        sha256: commonDeployment.host.attestation_result_sha256
      },
      appraisal_policy: {
        uri: "urn:cannae:rats:appraisal-policy:v1",
        sha256: digest("rats-appraisal-policy")
      },
      reference_values: {
        uri: "urn:cannae:rats:reference-values:v1",
        sha256: digest("rats-reference-values")
      },
      endorsements: {
        uri: "urn:cannae:rats:endorsements:v1",
        sha256: digest("rats-endorsements")
      }
    },
    deployment: clone(commonDeployment),
    deployment_identity_sha256: objectDigest(commonDeployment),
    execution_scope_sha256: objectDigest(policy.execution_scope),
    observed_at: iso(2000),
    expires_at: iso(240000),
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      production_execution_authorized: false,
      release_authorized: false
    }
  }, appraiserKey.privateKey);
}

function expectThrow(fn, pattern) {
  let caught;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert(caught, "expected operation to throw");
  if (pattern) assert(pattern.test(caught.message), caught.message);
}

function fixture(name, operation) {
  try {
    operation();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

function main() {
  const repository = initRepository();
  const repositoryBinding = {
    repository_key: resolveRepository(repository).key,
    identity_fingerprint:
      resolveRepository(repository).identity_fingerprint
  };
  const gateway = {
    gateway_id: "cannae-managed-gateway",
    instance_id: "production-gateway-001",
    audience: "cannae-protected-tools",
    deployment_sha256: digest("gateway-deployment"),
    configuration_sha256: digest("gateway-configuration"),
    assurance_level: "managed_exclusive",
    exclusive_path_verified: true
  };
  const ociPolicy = writeOciPolicy(
    repository,
    repositoryBinding,
    gateway
  );
  const admissionKey = keyPair();
  const appraiserKeyA = keyPair();
  const appraiserKeyB = keyPair();
  const appraiserA = appraiser(
    "APPRAISER-PRODUCTION-A",
    appraiserKeyA,
    "operator-a"
  );
  const appraiserB = appraiser(
    "APPRAISER-PRODUCTION-B",
    appraiserKeyB,
    "operator-b"
  );
  const policy = productionPolicy(
    repositoryBinding,
    gateway,
    ociPolicy.ref,
    admissionKey,
    [appraiserA, appraiserB]
  );
  const persistedPolicy = persistProductionSandboxPolicy({
    repository,
    artifactRoot,
    missionId,
    waveId
  }, policy);
  const commonDeployment = deployment(gateway);
  const evidenceA = evidence(
    policy,
    persistedPolicy.policy_ref,
    appraiserA,
    appraiserKeyA,
    commonDeployment,
    "A"
  );
  const evidenceB = evidence(
    policy,
    persistedPolicy.policy_ref,
    appraiserB,
    appraiserKeyB,
    commonDeployment,
    "B"
  );
  const persistedA = persistProductionSandboxEvidence({
    repository,
    artifactRoot,
    missionId,
    waveId,
    now: iso(3000)
  }, evidenceA);
  const persistedB = persistProductionSandboxEvidence({
    repository,
    artifactRoot,
    missionId,
    waveId,
    now: iso(3000)
  }, evidenceB);
  const evidenceRecords = [
    { payload: evidenceA, ref: persistedA.evidence_ref },
    { payload: evidenceB, ref: persistedB.evidence_ref }
  ];
  const issued = issueProductionSandboxAdmission({
    repository,
    artifactRoot,
    missionId,
    waveId,
    now: iso(4000),
    admissionPrivateKeyPem: admissionKey.privateKey
  }, {
    policyRef: persistedPolicy.policy_ref,
    evidenceRefs: [
      persistedA.evidence_ref,
      persistedB.evidence_ref
    ],
    admissionId: "PSA-PRODUCTION-001"
  });

  fixture("two independent signed appraisals authorize one deployment", () => {
    assert.strictEqual(issued.verification.valid, true);
    assert.strictEqual(
      issued.verification.quorum.independent_domain_count,
      2
    );
    assert.strictEqual(issued.production_execution_authorized, true);
    assert.strictEqual(issued.release_authorized, false);
  });

  fixture("manifest-backed request scope verifies exact OCI policy", () => {
    const request = {
      schema_version: "0.3",
      gateway: clone(gateway),
      repository_binding: clone(repositoryBinding),
      production_sandbox_admission_ref: clone(issued.admission_ref),
      tool_call: {
        operation_class: "process_execute",
        execution_mode: "oci_linux_sandbox_reference"
      }
    };
    const result = verifyProductionSandboxAdmission({
      repository,
      artifactRoot,
      request,
      toolInput: {
        schema_version: "0.1",
        type: "OciSandboxToolInput",
        sandbox_policy_ref: clone(ociPolicy.ref),
        rule_id: ociPolicy.payload.rules[0].rule_id
      },
      evaluatedAt: iso(5000)
    });
    assert.strictEqual(result.valid, true, JSON.stringify(result, null, 2));
    assert.strictEqual(result.production_deployment_verified, true);
    assert.strictEqual(result.release_authorized, false);
  });

  fixture("a different executor policy is outside production scope", () => {
    const request = {
      schema_version: "0.3",
      gateway: clone(gateway),
      repository_binding: clone(repositoryBinding),
      production_sandbox_admission_ref: clone(issued.admission_ref),
      tool_call: {
        operation_class: "process_execute",
        execution_mode: "oci_linux_sandbox_reference"
      }
    };
    const result = verifyProductionSandboxAdmission({
      repository,
      artifactRoot,
      request,
      toolInput: {
        type: "OciSandboxToolInput",
        sandbox_policy_ref: {
          artifact_id: "OLSP-FOREIGN",
          relative_path: "foreign.json",
          sha256: digest("foreign-policy")
        },
        rule_id: "foreign"
      },
      evaluatedAt: iso(5000)
    });
    assert.strictEqual(result.valid, false);
    assert(result.codes.includes("PRODUCTION_SANDBOX_EXECUTOR_POLICY_DENIED"));
  });

  fixture("shared failure-domain components collapse the quorum", () => {
    const correlatedPolicy = clone(policy);
    correlatedPolicy.appraisers[1].independence.account_id =
      correlatedPolicy.appraisers[0].independence.account_id;
    const correlatedB = clone(appraiserB);
    correlatedB.independence =
      clone(correlatedPolicy.appraisers[1].independence);
    const correlatedEvidenceB = evidence(
      correlatedPolicy,
      persistedPolicy.policy_ref,
      correlatedB,
      appraiserKeyB,
      commonDeployment,
      "CORRELATED"
    );
    const result = evaluateProductionEvidenceQuorum({
      policy: correlatedPolicy,
      policyRef: persistedPolicy.policy_ref,
      evidenceRecords: [
        { payload: evidenceA, ref: persistedA.evidence_ref },
        {
          payload: correlatedEvidenceB,
          ref: {
            artifact_id: correlatedEvidenceB.id,
            relative_path: "correlated.json",
            sha256: digest("correlated-ref")
          }
        }
      ],
      evaluatedAt: iso(5000)
    });
    assert.strictEqual(result.valid, false);
    assert(
      result.codes.includes(
        "PRODUCTION_SANDBOX_INDEPENDENCE_QUORUM_NOT_MET"
      )
    );
  });

  fixture("different deployment appraisals cannot form consensus", () => {
    const driftedDeployment = clone(commonDeployment);
    driftedDeployment.host.boot_id = "boot-production-drifted";
    const drifted = evidence(
      policy,
      persistedPolicy.policy_ref,
      appraiserB,
      appraiserKeyB,
      driftedDeployment,
      "DRIFTED"
    );
    const result = evaluateProductionEvidenceQuorum({
      policy,
      policyRef: persistedPolicy.policy_ref,
      evidenceRecords: [
        { payload: evidenceA, ref: persistedA.evidence_ref },
        {
          payload: drifted,
          ref: {
            artifact_id: drifted.id,
            relative_path: "drifted.json",
            sha256: digest("drifted-ref")
          }
        }
      ],
      evaluatedAt: iso(5000)
    });
    assert.strictEqual(result.valid, false);
    assert(
      result.codes.includes(
        "PRODUCTION_SANDBOX_DEPLOYMENT_CONSENSUS_MISSING"
      )
    );
  });

  fixture("tampering with signed appraiser evidence fails closed", () => {
    const tampered = clone(evidenceB);
    tampered.deployment.runtime.rootless = false;
    tampered.deployment.runtime.user_namespace_mode = "host";
    tampered.deployment_identity_sha256 =
      objectDigest(tampered.deployment);
    tampered.evidence_sha256 = productionSandboxEvidenceDigest(tampered);
    const result = evaluateProductionEvidenceQuorum({
      policy,
      policyRef: persistedPolicy.policy_ref,
      evidenceRecords: [
        { payload: evidenceA, ref: persistedA.evidence_ref },
        {
          payload: tampered,
          ref: {
            artifact_id: tampered.id,
            relative_path: "tampered.json",
            sha256: digest("tampered-ref")
          }
        }
      ],
      evaluatedAt: iso(5000)
    });
    assert.strictEqual(result.valid, false);
    assert(result.codes.includes("PRODUCTION_SANDBOX_EVIDENCE_INVALID"));
    assert(
      result.invalid_evidence[0].codes.includes(
        "PRODUCTION_SANDBOX_EVIDENCE_SIGNATURE_INVALID"
      )
    );
    assert(
      result.invalid_evidence[0].codes.includes(
        "PRODUCTION_SANDBOX_EVIDENCE_RUNTIME_INVALID"
      )
    );
  });

  fixture("expired evidence removes production admission", () => {
    const result = verifyProductionSandboxAdmissionBundle({
      policy,
      policyRef: persistedPolicy.policy_ref,
      evidenceRecords,
      admission: issued.admission,
      evaluatedAt: evidenceA.expires_at
    });
    assert.strictEqual(result.valid, false);
    assert(
      result.codes.includes("PRODUCTION_SANDBOX_EVIDENCE_INVALID")
    );
    assert(
      result.invalid_evidence.every(item =>
        item.codes.includes("PRODUCTION_SANDBOX_EVIDENCE_NOT_ACTIVE"))
    );
    assert(
      result.codes.includes("PRODUCTION_SANDBOX_ADMISSION_NOT_ACTIVE")
    );
  });

  fixture("repaired admission digest does not repair its signature", () => {
    const tampered = clone(issued.admission);
    tampered.deployment_identity_sha256 = digest("foreign-deployment");
    tampered.admission_sha256 = productionSandboxAdmissionDigest(tampered);
    const result = verifyProductionSandboxAdmissionBundle({
      policy,
      policyRef: persistedPolicy.policy_ref,
      evidenceRecords,
      admission: tampered,
      evaluatedAt: iso(5000)
    });
    assert.strictEqual(result.valid, false);
    assert(
      result.codes.includes(
        "PRODUCTION_SANDBOX_ADMISSION_SIGNATURE_INVALID"
      )
    );
    assert(
      result.codes.includes(
        "PRODUCTION_SANDBOX_ADMISSION_PROJECTION_MISMATCH"
      )
    );
  });

  fixture("admission issuance rejects an appraiser signing-key mismatch", () => {
    const foreignKey = keyPair();
    const unsignedEvidence = clone(evidenceB);
    delete unsignedEvidence.signature;
    delete unsignedEvidence.evidence_sha256;
    const invalidEvidence = signProductionSandboxEvidence(
      unsignedEvidence,
      foreignKey.privateKey
    );
    expectThrow(() => createProductionSandboxAdmission({
      policy,
      policyRef: persistedPolicy.policy_ref,
      evidenceRecords: [
        { payload: evidenceA, ref: persistedA.evidence_ref },
        {
          payload: invalidEvidence,
          ref: {
            artifact_id: invalidEvidence.id,
            relative_path: "foreign-key.json",
            sha256: digest("foreign-key-ref")
          }
        }
      ],
      admissionPrivateKeyPem: admissionKey.privateKey,
      issuedAt: iso(5000)
    }), /evidence quorum failed/i);
  });

  if (process.exitCode) process.exit(process.exitCode);
  process.stdout.write(
    `${JSON.stringify({ total: 9, passed: 9 }, null, 2)}\n`
  );
}

main();
