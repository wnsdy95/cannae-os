#!/usr/bin/env node

const crypto = require("crypto");
const { publicKeyId, strictBase64 } = require("./verification-attestation");
const { canonicalJsonBytes } = require("./verifier-identity-evidence");
const {
  INDEPENDENCE_DIMENSIONS,
  exactDimensions,
  validClaims
} = require("./verifier-independence");

const OCI_MANIFEST_MEDIA_TYPE = "application/vnd.oci.image.manifest.v1+json";
const IN_TOTO_STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
const SLSA_PROVENANCE_PREDICATE_TYPE = "https://slsa.dev/provenance/v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function objectDigest(value) {
  return sha256(canonicalJsonBytes(value));
}

function sameObject(left, right) {
  return Boolean(left && right &&
    canonicalJsonBytes(left).equals(canonicalJsonBytes(right)));
}

function sameRef(left, right) {
  return Boolean(left && right &&
    left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path &&
    left.sha256 === right.sha256);
}

function artifactRefKind(ref) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return "malformed";
  const keys = Object.keys(ref).sort();
  if (JSON.stringify(keys) !==
      JSON.stringify(["artifact_id", "relative_path", "sha256"])) {
    return "malformed";
  }
  const values = [ref.artifact_id, ref.relative_path, ref.sha256];
  if (values.every(value => value === "none")) return "none";
  if (values.some(value => value === "none")) return "malformed";
  if (!/^[A-Z]+-[A-Za-z0-9_-]+$/.test(ref.artifact_id || "") ||
      typeof ref.relative_path !== "string" || ref.relative_path.length === 0 ||
      !/^[a-f0-9]{64}$/.test(ref.sha256 || "")) {
    return "malformed";
  }
  return "concrete";
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function addCodes(codes, additions) {
  for (const code of additions || []) addCode(codes, code);
}

function validSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function validSourceCommit(value) {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(String(value || ""));
}

function validEd25519PublicKey(keyId, publicKeyPem) {
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    return publicKey.asymmetricKeyType === "ed25519" &&
      publicKeyId(publicKey) === keyId;
  } catch (error) {
    return false;
  }
}

function validAuthority(authority, productionExecutionAuthorized) {
  return Boolean(authority &&
    authority.human_final_decision_authority === "USER" &&
    authority.self_approval_prohibited === true &&
    authority.production_execution_authorized === productionExecutionAuthorized &&
    authority.release_authorized === false);
}

function unsignedArtifactBytes(payload, digestField) {
  const copy = clone(payload);
  delete copy.signature;
  delete copy[digestField];
  return canonicalJsonBytes(copy);
}

function signedArtifactDigest(payload, digestField) {
  const copy = clone(payload);
  delete copy[digestField];
  return sha256(canonicalJsonBytes(copy));
}

function productionSandboxEvidenceDigest(evidence) {
  return signedArtifactDigest(evidence, "evidence_sha256");
}

function productionSandboxAdmissionDigest(admission) {
  return signedArtifactDigest(admission, "admission_sha256");
}

function signArtifact(payload, privateKeyPem, digestField) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Production sandbox artifacts require an Ed25519 signing key.");
  }
  const signed = clone(payload);
  delete signed.signature;
  delete signed[digestField];
  signed.signature = {
    key_id: publicKeyId(crypto.createPublicKey(privateKey)),
    algorithm: "ed25519",
    signature_base64: crypto.sign(
      null,
      unsignedArtifactBytes(signed, digestField),
      privateKey
    ).toString("base64")
  };
  signed[digestField] = signedArtifactDigest(signed, digestField);
  return signed;
}

function signProductionSandboxEvidence(evidence, privateKeyPem) {
  return signArtifact(evidence, privateKeyPem, "evidence_sha256");
}

function signProductionSandboxAdmission(admission, privateKeyPem) {
  return signArtifact(admission, privateKeyPem, "admission_sha256");
}

function verifySignedArtifact(payload, publicKeyPem, digestField, expectedDigest) {
  const codes = [];
  if (signedArtifactDigest(payload, digestField) !== expectedDigest) {
    addCode(codes, "DIGEST_MISMATCH");
  }
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const signature = strictBase64(
      payload.signature && payload.signature.signature_base64
    );
    if (publicKey.asymmetricKeyType !== "ed25519" ||
        publicKeyId(publicKey) !==
          (payload.signature && payload.signature.key_id) ||
        (payload.signature && payload.signature.algorithm) !== "ed25519" ||
        !signature ||
        !crypto.verify(
          null,
          unsignedArtifactBytes(payload, digestField),
          publicKey,
          signature
        )) {
      addCode(codes, "SIGNATURE_INVALID");
    }
  } catch (error) {
    addCode(codes, "SIGNATURE_INVALID");
  }
  return codes;
}

function validateProductionSandboxPolicy(policy, evaluatedAt) {
  const codes = [];
  if (!policy || policy.type !== "ProductionSandboxPolicy" ||
      policy.schema_version !== "0.1") {
    return { valid: false, codes: ["PRODUCTION_SANDBOX_POLICY_INVALID"] };
  }
  const start = timestamp(policy.valid_from);
  const end = timestamp(policy.expires_at);
  const evaluated = evaluatedAt === undefined ? null : timestamp(evaluatedAt);
  if (start === null || end === null || start >= end ||
      (evaluatedAt !== undefined &&
       (evaluated === null || evaluated < start || evaluated >= end))) {
    addCode(codes, "PRODUCTION_SANDBOX_POLICY_NOT_ACTIVE");
  }
  if (!policy.gateway ||
      policy.gateway.assurance_level !== "managed_exclusive" ||
      policy.gateway.exclusive_path_verified !== true) {
    addCode(codes, "PRODUCTION_SANDBOX_POLICY_GATEWAY_INVALID");
  }
  const authority = policy.admission_authority || {};
  if (!validEd25519PublicKey(
    authority.key_id,
    authority.public_key_pem
  )) {
    addCode(codes, "PRODUCTION_SANDBOX_POLICY_ADMISSION_KEY_INVALID");
  }
  const appraisers = Array.isArray(policy.appraisers) ? policy.appraisers : [];
  const appraiserIds = new Set();
  const keyIds = new Set();
  const spiffeIds = new Set();
  for (const appraiser of appraisers) {
    if (!appraiser || appraiserIds.has(appraiser.id) ||
        keyIds.has(appraiser.key_id) ||
        spiffeIds.has(appraiser.workload_identity &&
          appraiser.workload_identity.spiffe_id) ||
        !validEd25519PublicKey(appraiser.key_id, appraiser.public_key_pem) ||
        !validClaims(appraiser.independence)) {
      addCode(codes, "PRODUCTION_SANDBOX_POLICY_APPRAISER_INVALID");
      continue;
    }
    appraiserIds.add(appraiser.id);
    keyIds.add(appraiser.key_id);
    spiffeIds.add(appraiser.workload_identity.spiffe_id);
    try {
      const parsed = new URL(appraiser.workload_identity.spiffe_id);
      if (parsed.protocol !== "spiffe:" ||
          parsed.hostname !== appraiser.workload_identity.trust_domain ||
          parsed.pathname === "/" || parsed.search || parsed.hash) {
        addCode(codes, "PRODUCTION_SANDBOX_POLICY_APPRAISER_IDENTITY_INVALID");
      }
    } catch (error) {
      addCode(codes, "PRODUCTION_SANDBOX_POLICY_APPRAISER_IDENTITY_INVALID");
    }
  }
  if (authority.key_id && keyIds.has(authority.key_id)) {
    addCode(codes, "PRODUCTION_SANDBOX_POLICY_KEY_SEPARATION_INVALID");
  }
  const quorum = policy.quorum || {};
  if (!Number.isInteger(quorum.minimum_valid_evidence) ||
      !Number.isInteger(quorum.minimum_independent_domains) ||
      quorum.minimum_valid_evidence < 2 ||
      quorum.minimum_independent_domains < 2 ||
      quorum.minimum_valid_evidence > appraisers.length ||
      quorum.minimum_independent_domains > appraisers.length ||
      quorum.require_distinct_key_ids !== true ||
      quorum.correlation_rule !== "shared_required_component" ||
      !exactDimensions(quorum.required_dimensions)) {
    addCode(codes, "PRODUCTION_SANDBOX_POLICY_QUORUM_INVALID");
  }
  const evidenceProfile = policy.evidence_profile || {};
  if (evidenceProfile.adapter !== "rats_attestation_result_v1" ||
      evidenceProfile.nonce_bytes < 32 ||
      evidenceProfile.max_evidence_age_seconds < 1 ||
      evidenceProfile.max_evidence_age_seconds > 3600 ||
      evidenceProfile.require_reference_values !== true ||
      evidenceProfile.require_endorsements !== true) {
    addCode(codes, "PRODUCTION_SANDBOX_POLICY_EVIDENCE_PROFILE_INVALID");
  }
  const scope = policy.execution_scope || {};
  if (!Array.isArray(scope.allowed_operation_classes) ||
      scope.allowed_operation_classes.length === 0 ||
      !Array.isArray(scope.allowed_execution_modes) ||
      scope.allowed_execution_modes.length !== 1 ||
      scope.allowed_execution_modes[0] !== "oci_linux_sandbox_reference" ||
      !Array.isArray(scope.executor_policy_refs) ||
      scope.executor_policy_refs.length === 0 ||
      scope.executor_policy_refs.some(ref => artifactRefKind(ref) !== "concrete") ||
      new Set(scope.executor_policy_refs.map(ref => ref.sha256)).size !==
        scope.executor_policy_refs.length) {
    addCode(codes, "PRODUCTION_SANDBOX_POLICY_EXECUTION_SCOPE_INVALID");
  }
  const required = policy.required_controls || {};
  for (const field of [
    "host_attestation",
    "runtime_attestation",
    "image_provenance",
    "credential_key_custody",
    "rootless_or_userns",
    "mandatory_access_control",
    "application_minimal_seccomp",
    "read_only_filesystems",
    "linearizable_coordination",
    "storage_fencing",
    "exclusive_gateway_path",
    "gateway_outage_denies_tools",
    "sandbox_outage_denies_tools"
  ]) {
    if (required[field] !== true) {
      addCode(codes, "PRODUCTION_SANDBOX_POLICY_REQUIRED_CONTROL_MISSING");
      break;
    }
  }
  if (required.network_policy !== "none_or_authenticated_allowlist") {
    addCode(codes, "PRODUCTION_SANDBOX_POLICY_NETWORK_CONTROL_INVALID");
  }
  if (!validAuthority(policy.authority, false)) {
    addCode(codes, "PRODUCTION_SANDBOX_POLICY_AUTHORITY_INVALID");
  }
  return { valid: codes.length === 0, codes: codes.sort() };
}

function validateDeploymentClaims(policy, evidence) {
  const codes = [];
  const deployment = evidence.deployment || {};
  const attestation = evidence.attestation_result || {};
  if (evidence.deployment_identity_sha256 !== objectDigest(deployment)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_DEPLOYMENT_DIGEST_MISMATCH");
  }
  if (evidence.execution_scope_sha256 !==
      objectDigest(policy.execution_scope)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_SCOPE_DIGEST_MISMATCH");
  }
  if (!sameObject(deployment.gateway, policy.gateway)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_GATEWAY_MISMATCH");
  }
  const host = deployment.host || {};
  if (!validSha256(host.attestation_result_sha256) ||
      host.attestation_result_sha256 !==
        (attestation.result && attestation.result.sha256) ||
      !validSha256(host.boot_measurement_sha256) ||
      !validSha256(host.host_configuration_sha256)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_HOST_ATTESTATION_INVALID");
  }
  const runtime = deployment.runtime || {};
  if (runtime.engine !== "docker" ||
      !validSha256(runtime.daemon_sha256) ||
      !validSha256(runtime.runtime_sha256) ||
      !validSha256(runtime.daemon_configuration_sha256) ||
      !(runtime.rootless === true ||
        ["private", "remapped"].includes(runtime.user_namespace_mode))) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_RUNTIME_INVALID");
  }
  const image = deployment.image || {};
  if (image.manifest_media_type !== OCI_MANIFEST_MEDIA_TYPE ||
      !validSha256(image.manifest_sha256) ||
      image.statement_type !== IN_TOTO_STATEMENT_TYPE ||
      image.provenance_predicate_type !== SLSA_PROVENANCE_PREDICATE_TYPE ||
      !validSha256(image.provenance_statement_sha256) ||
      image.provenance_verified !== true ||
      image.signature_verified !== true ||
      image.transparency_verified !== true ||
      !validSourceCommit(image.source_commit)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_IMAGE_PROVENANCE_INVALID");
  }
  const credentials = deployment.credentials || {};
  if (!["kms", "hsm", "spiffe_workload_api"].includes(
    credentials.key_custody
  ) ||
      credentials.workload_identity_verified !== true ||
      credentials.rotation_managed !== true ||
      credentials.revocation_managed !== true ||
      !validSha256(credentials.configuration_sha256)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_CREDENTIALS_INVALID");
  }
  const mac = deployment.mandatory_access_control || {};
  if (!["apparmor", "selinux", "landlock"].includes(mac.provider) ||
      mac.enforcing !== true ||
      !validSha256(mac.profile_sha256)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_MAC_INVALID");
  }
  const seccomp = deployment.seccomp || {};
  if (seccomp.mode !== "application_minimal" ||
      seccomp.default_action !== "SCMP_ACT_ERRNO" ||
      seccomp.enforced !== true ||
      !validSha256(seccomp.profile_sha256)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_SECCOMP_INVALID");
  }
  const filesystem = deployment.filesystem || {};
  if (filesystem.rootfs_read_only !== true ||
      filesystem.repository_read_only !== true ||
      filesystem.host_mounts_prohibited !== true ||
      !validSha256(filesystem.policy_sha256)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_FILESYSTEM_INVALID");
  }
  const network = deployment.network || {};
  if (!["none", "authenticated_allowlist"].includes(network.mode) ||
      network.enforced !== true ||
      network.dns_policy_verified !== true ||
      network.proxy_policy_verified !== true ||
      !validSha256(network.policy_sha256)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_NETWORK_INVALID");
  }
  const coordination = deployment.coordination || {};
  if (coordination.backend !== "external_linearizable" ||
      coordination.storage_fencing_verified !== true ||
      coordination.lease_expiry_verified !== true ||
      !validSha256(coordination.adapter_sha256) ||
      !validSha256(coordination.configuration_sha256) ||
      !validSha256(coordination.fencing_test_sha256)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_COORDINATION_INVALID");
  }
  const exclusive = deployment.exclusive_path || {};
  if (exclusive.gateway_only === true &&
      exclusive.direct_tool_path_blocked === true &&
      exclusive.gateway_outage_tool_unreachable === true &&
      exclusive.sandbox_outage_tool_unreachable === true &&
      exclusive.adversarial_tests_passed === true &&
      validSha256(exclusive.test_suite_sha256) &&
      timestamp(exclusive.tested_at) !== null) {
    return codes;
  }
  addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_EXCLUSIVE_PATH_INVALID");
  return codes;
}

function verifyProductionSandboxEvidence(options) {
  const {
    policy,
    policyRef,
    evidence,
    evaluatedAt = new Date().toISOString()
  } = options || {};
  const codes = [];
  if (!policy || !evidence) {
    return {
      valid: false,
      codes: ["PRODUCTION_SANDBOX_EVIDENCE_INPUT_INVALID"]
    };
  }
  addCodes(codes, validateProductionSandboxPolicy(policy, evaluatedAt).codes);
  if (evidence.type !== "ProductionSandboxEvidence" ||
      evidence.schema_version !== "0.1") {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_INVALID");
  }
  if (artifactRefKind(evidence.policy_ref) !== "concrete" ||
      !sameRef(evidence.policy_ref, policyRef) ||
      evidence.policy_ref.artifact_id !== policy.id) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_POLICY_REF_MISMATCH");
  }
  if (!sameObject(evidence.repository_binding, policy.repository_binding) ||
      !sameObject(evidence.gateway, policy.gateway)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_SUBJECT_MISMATCH");
  }
  const appraisers = (policy.appraisers || []).filter(item =>
    item.id === evidence.appraiser_id);
  if (appraisers.length !== 1) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_APPRAISER_UNTRUSTED");
  }
  const appraiser = appraisers[0] || {};
  const identity = evidence.appraiser_identity || {};
  if (identity.spiffe_id !==
        (appraiser.workload_identity && appraiser.workload_identity.spiffe_id) ||
      identity.trust_domain !==
        (appraiser.workload_identity && appraiser.workload_identity.trust_domain) ||
      identity.proof_verified !== true ||
      !validSha256(identity.credential_sha256) ||
      !sameObject(identity.independence, appraiser.independence)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_APPRAISER_IDENTITY_MISMATCH");
  }
  const observed = timestamp(evidence.observed_at);
  const expires = timestamp(evidence.expires_at);
  const evaluated = timestamp(evaluatedAt);
  const authenticated = timestamp(identity.authenticated_at);
  const identityExpires = timestamp(identity.expires_at);
  const maximumAge = Number(
    policy.evidence_profile &&
    policy.evidence_profile.max_evidence_age_seconds
  ) * 1000;
  if (observed === null || expires === null || evaluated === null ||
      authenticated === null || identityExpires === null ||
      authenticated > observed || observed >= expires ||
      evaluated < observed || evaluated >= expires ||
      expires > observed + maximumAge ||
      expires > identityExpires ||
      expires > timestamp(policy.expires_at)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_NOT_ACTIVE");
  }
  const nonceBytes = Number(
    policy.evidence_profile && policy.evidence_profile.nonce_bytes
  );
  if (!new RegExp(`^[a-f0-9]{${nonceBytes * 2}}$`).test(
    String(evidence.nonce || "")
  )) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_NONCE_INVALID");
  }
  const result = evidence.attestation_result || {};
  if (result.architecture !== "rats_rfc9334" ||
      result.adapter !== policy.evidence_profile.adapter ||
      result.eat_profile !== policy.evidence_profile.eat_profile ||
      result.freshness_nonce !== evidence.nonce ||
      result.appraisal === "fail" ||
      result.appraisal !== "pass" ||
      !result.evidence || !validSha256(result.evidence.sha256) ||
      !result.result || !validSha256(result.result.sha256) ||
      !result.appraisal_policy ||
        !validSha256(result.appraisal_policy.sha256) ||
      !result.reference_values ||
        !validSha256(result.reference_values.sha256) ||
      !result.endorsements || !validSha256(result.endorsements.sha256)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_ATTESTATION_RESULT_INVALID");
  }
  addCodes(codes, validateDeploymentClaims(policy, evidence));
  const signatureCodes = verifySignedArtifact(
    evidence,
    appraiser.public_key_pem,
    "evidence_sha256",
    evidence.evidence_sha256
  );
  if (signatureCodes.includes("DIGEST_MISMATCH")) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_DIGEST_MISMATCH");
  }
  if (signatureCodes.includes("SIGNATURE_INVALID")) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_SIGNATURE_INVALID");
  }
  if (!validAuthority(evidence.authority, false)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_AUTHORITY_INVALID");
  }
  return {
    valid: codes.length === 0,
    codes: codes.sort(),
    appraiser_id: evidence.appraiser_id,
    key_id: appraiser.key_id || "none",
    deployment_identity_sha256: evidence.deployment_identity_sha256 || "none"
  };
}

function computeFailureDomains(bindings) {
  const parent = new Map(bindings.map(binding => [
    binding.appraiser_id,
    binding.appraiser_id
  ]));
  const find = id => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    parent.set(second, first);
  };
  for (const dimension of INDEPENDENCE_DIMENSIONS) {
    const owner = new Map();
    for (const binding of bindings) {
      const value = binding.independence[dimension];
      if (owner.has(value)) union(binding.appraiser_id, owner.get(value));
      else owner.set(value, binding.appraiser_id);
    }
  }
  const membersByRoot = new Map();
  for (const binding of bindings) {
    const root = find(binding.appraiser_id);
    const members = membersByRoot.get(root) || [];
    members.push(binding);
    membersByRoot.set(root, members);
  }
  return [...membersByRoot.values()].map(members => {
    members.sort((left, right) =>
      left.appraiser_id.localeCompare(right.appraiser_id));
    const identity = {
      required_dimensions: INDEPENDENCE_DIMENSIONS,
      members: members.map(member => ({
        appraiser_id: member.appraiser_id,
        independence: member.independence
      }))
    };
    return {
      domain_id: `PSD-${sha256(canonicalJsonBytes(identity)).slice(0, 24)}`,
      appraiser_ids: members.map(member => member.appraiser_id),
      shared_dimensions: INDEPENDENCE_DIMENSIONS.filter(dimension =>
        new Set(members.map(member => member.independence[dimension])).size <
          members.length)
    };
  }).sort((left, right) => left.domain_id.localeCompare(right.domain_id));
}

function evaluateProductionEvidenceQuorum(options) {
  const {
    policy,
    policyRef,
    evidenceRecords = [],
    evaluatedAt = new Date().toISOString()
  } = options || {};
  const codes = [];
  const policyResult = validateProductionSandboxPolicy(policy, evaluatedAt);
  addCodes(codes, policyResult.codes);
  const appraisers = new Map((policy && policy.appraisers || []).map(item => [
    item.id,
    item
  ]));
  const validRecords = [];
  const invalidEvidence = [];
  for (const record of evidenceRecords) {
    const result = verifyProductionSandboxEvidence({
      policy,
      policyRef,
      evidence: record && record.payload,
      evaluatedAt
    });
    if (result.valid) {
      validRecords.push({
        record,
        result,
        appraiser: appraisers.get(result.appraiser_id)
      });
    } else {
      invalidEvidence.push({
        evidence_id: record && record.payload && record.payload.id || "missing",
        codes: result.codes
      });
    }
  }
  if (invalidEvidence.length > 0) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_INVALID");
  }
  const evidenceIds = validRecords.map(item => item.record.payload.id);
  const appraiserIds = validRecords.map(item => item.result.appraiser_id);
  const keyIds = validRecords.map(item => item.result.key_id);
  if (new Set(evidenceIds).size !== evidenceIds.length ||
      new Set(appraiserIds).size !== appraiserIds.length) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_DUPLICATE");
  }
  const deploymentDigests = new Set(validRecords.map(item =>
    item.result.deployment_identity_sha256));
  if (deploymentDigests.size !== 1) {
    addCode(codes, "PRODUCTION_SANDBOX_DEPLOYMENT_CONSENSUS_MISSING");
  }
  const bindings = validRecords.map(item => ({
    appraiser_id: item.result.appraiser_id,
    independence: clone(item.appraiser.independence)
  }));
  const domains = bindings.length > 0 ? computeFailureDomains(bindings) : [];
  const quorum = policy && policy.quorum || {};
  if (validRecords.length < Number(quorum.minimum_valid_evidence || 0)) {
    addCode(codes, "PRODUCTION_SANDBOX_EVIDENCE_QUORUM_NOT_MET");
  }
  if (new Set(keyIds).size < Number(quorum.minimum_valid_evidence || 0)) {
    addCode(codes, "PRODUCTION_SANDBOX_KEY_DIVERSITY_NOT_MET");
  }
  if (domains.length < Number(quorum.minimum_independent_domains || 0)) {
    addCode(codes, "PRODUCTION_SANDBOX_INDEPENDENCE_QUORUM_NOT_MET");
  }
  const summary = {
    valid_evidence_ids: evidenceIds.sort(),
    appraiser_ids: appraiserIds.sort(),
    key_ids: keyIds.sort(),
    independence_domains: domains,
    valid_evidence_count: validRecords.length,
    distinct_key_count: new Set(keyIds).size,
    independent_domain_count: domains.length,
    minimum_valid_evidence: Number(quorum.minimum_valid_evidence || 0),
    minimum_independent_domains:
      Number(quorum.minimum_independent_domains || 0),
    satisfied: codes.length === 0
  };
  return {
    valid: codes.length === 0,
    codes: codes.sort(),
    invalid_evidence: invalidEvidence,
    deployment_identity_sha256:
      deploymentDigests.size === 1 ? [...deploymentDigests][0] : "none",
    execution_scope_sha256: policy
      ? objectDigest(policy.execution_scope)
      : "none",
    coordination_configuration_sha256:
      validRecords.length > 0
        ? validRecords[0].record.payload.deployment.coordination
          .configuration_sha256
        : "none",
    coordination_adapter_sha256:
      validRecords.length > 0
        ? validRecords[0].record.payload.deployment.coordination
          .adapter_sha256
        : "none",
    exclusive_path_test_suite_sha256:
      validRecords.length > 0
        ? validRecords[0].record.payload.deployment.exclusive_path
          .test_suite_sha256
        : "none",
    summary,
    valid_records: validRecords
  };
}

function createProductionSandboxAdmission(options) {
  const {
    policy,
    policyRef,
    evidenceRecords,
    admissionPrivateKeyPem,
    admissionId,
    issuedAt = new Date().toISOString()
  } = options || {};
  const quorum = evaluateProductionEvidenceQuorum({
    policy,
    policyRef,
    evidenceRecords,
    evaluatedAt: issuedAt
  });
  if (!quorum.valid) {
    throw new Error(
      `Production sandbox evidence quorum failed: ${quorum.codes.join(", ")}`
    );
  }
  const privateKey = crypto.createPrivateKey(admissionPrivateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519" ||
      publicKeyId(crypto.createPublicKey(privateKey)) !==
        policy.admission_authority.key_id) {
    throw new Error(
      "Production sandbox admission key does not match the policy authority."
    );
  }
  const issued = timestamp(issuedAt);
  const expiry = Math.min(
    timestamp(policy.expires_at),
    ...quorum.valid_records.map(item => timestamp(item.record.payload.expires_at))
  );
  if (issued === null || expiry <= issued) {
    throw new Error("Production sandbox admission has no positive validity window.");
  }
  const id = admissionId ||
    `PSA-${sha256(Buffer.from(
      `${policy.id}:${quorum.deployment_identity_sha256}:${issuedAt}`
    )).slice(0, 24)}`;
  return signProductionSandboxAdmission({
    schema_version: "0.1",
    type: "ProductionSandboxAdmission",
    id,
    policy_ref: clone(policyRef),
    evidence_refs: quorum.valid_records.map(item => clone(item.record.ref))
      .sort((left, right) => left.artifact_id.localeCompare(right.artifact_id)),
    repository_binding: clone(policy.repository_binding),
    gateway: clone(policy.gateway),
    deployment_identity_sha256: quorum.deployment_identity_sha256,
    execution_scope_sha256: quorum.execution_scope_sha256,
    quorum: quorum.summary,
    assurance_level: "managed_exclusive",
    production_execution_authorized: true,
    production_deployment_verified: true,
    release_authorized: false,
    issued_at: issuedAt,
    expires_at: new Date(expiry).toISOString(),
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      production_execution_authorized: true,
      release_authorized: false
    }
  }, admissionPrivateKeyPem);
}

function verifyProductionSandboxAdmissionBundle(options) {
  const {
    policy,
    policyRef,
    evidenceRecords = [],
    admission,
    evaluatedAt = new Date().toISOString()
  } = options || {};
  const codes = [];
  if (!admission || admission.type !== "ProductionSandboxAdmission" ||
      admission.schema_version !== "0.1") {
    return {
      valid: false,
      codes: ["PRODUCTION_SANDBOX_ADMISSION_INVALID"]
    };
  }
  const quorum = evaluateProductionEvidenceQuorum({
    policy,
    policyRef,
    evidenceRecords,
    evaluatedAt
  });
  addCodes(codes, quorum.codes);
  if (!sameRef(admission.policy_ref, policyRef) ||
      admission.policy_ref.artifact_id !== (policy && policy.id)) {
    addCode(codes, "PRODUCTION_SANDBOX_ADMISSION_POLICY_REF_MISMATCH");
  }
  const expectedRefs = evidenceRecords.map(item => item.ref)
    .sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
  const actualRefs = (admission.evidence_refs || [])
    .slice()
    .sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
  if (!sameObject(expectedRefs, actualRefs) ||
      actualRefs.some(ref => artifactRefKind(ref) !== "concrete")) {
    addCode(codes, "PRODUCTION_SANDBOX_ADMISSION_EVIDENCE_REF_MISMATCH");
  }
  if (!sameObject(admission.repository_binding,
    policy && policy.repository_binding) ||
      !sameObject(admission.gateway, policy && policy.gateway) ||
      admission.deployment_identity_sha256 !==
        quorum.deployment_identity_sha256 ||
      admission.execution_scope_sha256 !== quorum.execution_scope_sha256 ||
      !sameObject(admission.quorum, quorum.summary)) {
    addCode(codes, "PRODUCTION_SANDBOX_ADMISSION_PROJECTION_MISMATCH");
  }
  const issued = timestamp(admission.issued_at);
  const expires = timestamp(admission.expires_at);
  const evaluated = timestamp(evaluatedAt);
  if (issued === null || expires === null || evaluated === null ||
      issued >= expires || evaluated < issued || evaluated >= expires ||
      expires > timestamp(policy && policy.expires_at) ||
      evidenceRecords.some(item =>
        expires > timestamp(item.payload && item.payload.expires_at))) {
    addCode(codes, "PRODUCTION_SANDBOX_ADMISSION_NOT_ACTIVE");
  }
  const signatureCodes = verifySignedArtifact(
    admission,
    policy && policy.admission_authority &&
      policy.admission_authority.public_key_pem,
    "admission_sha256",
    admission.admission_sha256
  );
  if (signatureCodes.includes("DIGEST_MISMATCH")) {
    addCode(codes, "PRODUCTION_SANDBOX_ADMISSION_DIGEST_MISMATCH");
  }
  if (signatureCodes.includes("SIGNATURE_INVALID")) {
    addCode(codes, "PRODUCTION_SANDBOX_ADMISSION_SIGNATURE_INVALID");
  }
  if (admission.assurance_level !== "managed_exclusive" ||
      admission.production_execution_authorized !== true ||
      admission.production_deployment_verified !== true ||
      admission.release_authorized !== false ||
      !validAuthority(admission.authority, true)) {
    addCode(codes, "PRODUCTION_SANDBOX_ADMISSION_AUTHORITY_INVALID");
  }
  return {
    valid: codes.length === 0,
    codes: codes.sort(),
    production_execution_authorized: codes.length === 0,
    production_deployment_verified: codes.length === 0,
    release_authorized: false,
    deployment_identity_sha256:
      quorum.deployment_identity_sha256,
    execution_scope_sha256: quorum.execution_scope_sha256,
    coordination_configuration_sha256:
      quorum.coordination_configuration_sha256,
    coordination_adapter_sha256:
      quorum.coordination_adapter_sha256,
    exclusive_path_test_suite_sha256:
      quorum.exclusive_path_test_suite_sha256,
    quorum: quorum.summary,
    invalid_evidence: quorum.invalid_evidence
  };
}

module.exports = {
  IN_TOTO_STATEMENT_TYPE,
  OCI_MANIFEST_MEDIA_TYPE,
  SLSA_PROVENANCE_PREDICATE_TYPE,
  artifactRefKind,
  computeFailureDomains,
  createProductionSandboxAdmission,
  evaluateProductionEvidenceQuorum,
  objectDigest,
  productionSandboxAdmissionDigest,
  productionSandboxEvidenceDigest,
  signProductionSandboxAdmission,
  signProductionSandboxEvidence,
  validateProductionSandboxPolicy,
  verifyProductionSandboxAdmissionBundle,
  verifyProductionSandboxEvidence
};
