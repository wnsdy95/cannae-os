#!/usr/bin/env node

const crypto = require("crypto");
const {
  objectDigest,
  signProductionSandboxEvidence
} = require("./production-sandbox-admission");
const { publicKeyId } = require("./verification-attestation");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createProductionSandboxFixtureBuilders(at) {
  if (typeof at !== "function") {
    throw new Error("Production sandbox fixture builders require a clock.");
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
      valid_from: at(-60000),
      expires_at: at(3600000),
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
        tested_at: at(1000)
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
        authenticated_at: at(1000),
        expires_at: at(300000),
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
      observed_at: at(2000),
      expires_at: at(240000),
      authority: {
        human_final_decision_authority: "USER",
        self_approval_prohibited: true,
        production_execution_authorized: false,
        release_authorized: false
      }
    }, appraiserKey.privateKey);
  }

  return {
    appraiser,
    deployment,
    evidence,
    independence,
    keyPair,
    productionPolicy
  };
}

module.exports = {
  createProductionSandboxFixtureBuilders
};
