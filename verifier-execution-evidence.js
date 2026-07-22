#!/usr/bin/env node

const crypto = require("crypto");
const {
  DSSE_PAYLOAD_TYPE,
  STATEMENT_TYPE,
  canonicalBytes,
  preAuthEncoding,
  publicKeyId,
  strictBase64
} = require("./verification-attestation");
const {
  computeVerifierIndependence,
  sameClaims
} = require("./verifier-independence");

const EXECUTION_PREDICATE_TYPE = "https://cannae.dev/attestations/verifier-execution/v0.1";
const EXECUTION_PREDICATE_TYPE_V2 = "https://cannae.dev/attestations/verifier-execution/v0.2";
const EXECUTION_BUILD_TYPE = "https://cannae.dev/build-types/verifier-execution/v1";

const PROVIDER_REQUIRED_CLAIMS = Object.freeze({
  generic_oci: ["runner_pool", "tenant"],
  github_actions: ["job_workflow_ref", "ref", "repository", "repository_id", "runner_environment", "sha"],
  gitlab_ci: [
    "ci_config_ref_uri", "ci_config_sha", "job_project_id", "job_project_path", "ref_path",
    "ref_protected", "runner_environment", "runner_id", "sha"
  ],
  local_sandbox: ["host_attestor_id", "sandbox_instance_id"],
  tee: ["appraisal_policy_sha256", "attestation_result", "measurement", "tee_type"]
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function evidenceDigest(evidence) {
  return sha256(canonicalBytes(evidence, "evidence_sha256"));
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]));
}

function sameValue(left, right) {
  return JSON.stringify(sortValue(left)) === JSON.stringify(sortValue(right));
}

function sameRef(left, right) {
  return Boolean(left && right && left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path && left.sha256 === right.sha256);
}

function safeArtifactRef(ref) {
  return Boolean(ref && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref.artifact_id || "") &&
    typeof ref.relative_path === "string" && ref.relative_path.length > 0 &&
    !ref.relative_path.startsWith("/") && !ref.relative_path.split(/[\\/]+/).includes("..") &&
    /^[a-f0-9]{64}$/.test(ref.sha256 || ""));
}

function resource(name, descriptor) {
  return { name, uri: descriptor.uri, digest: clone(descriptor.digest) };
}

function expectedStatement(evidence, profile) {
  const version = evidence.schema_version;
  return {
    _type: STATEMENT_TYPE,
    subject: [{ name: evidence.subject_ref.artifact_id, digest: { sha256: evidence.subject_ref.sha256 } }],
    predicateType: version === "0.2" ? EXECUTION_PREDICATE_TYPE_V2 : EXECUTION_PREDICATE_TYPE,
    predicate: {
      schema_version: version,
      trust_policy_id: evidence.trust_policy_id,
      runtime_policy: {
        id: evidence.runtime_policy_ref.artifact_id,
        relative_path: evidence.runtime_policy_ref.relative_path,
        sha256: evidence.runtime_policy_ref.sha256
      },
      verifier: {
        id: evidence.verifier_id,
        key_id: evidence.verifier_key_id,
        profile_id: evidence.profile_id,
        purpose: evidence.purpose
      },
      subject_ref: clone(evidence.subject_ref),
      workload_identity_evidence_ref: clone(evidence.workload_identity_evidence_ref),
      repository_binding: clone(evidence.repository_binding),
      repository_state: clone(evidence.repository_state),
      verification_target: clone(evidence.verification_target),
      buildDefinition: {
        buildType: EXECUTION_BUILD_TYPE,
        externalParameters: {
          purpose: evidence.purpose,
          subject_ref: clone(evidence.subject_ref),
          verification_target: clone(evidence.verification_target),
          repository_binding: clone(evidence.repository_binding),
          repository_state: clone(evidence.repository_state)
        },
        internalParameters: {
          argv: clone(evidence.execution.argv),
          tool_allowlist: clone(evidence.execution.tool_allowlist),
          network_policy: clone(evidence.execution.network_policy),
          sandbox_profile: clone(evidence.execution.sandbox_profile)
        },
        resolvedDependencies: [
          resource("verifier-code", evidence.execution.verifier_code),
          resource("dependency-lockfile", evidence.execution.dependency_lockfile),
          resource("harness", evidence.execution.harness),
          {
            name: "container-image",
            uri: evidence.execution.container_image.uri,
            digest: clone(evidence.execution.container_image.digest),
            mediaType: evidence.execution.container_image.media_type
          }
        ]
      },
      runDetails: {
        builder: { id: profile.builder.id },
        metadata: {
          invocationId: evidence.invocation.id,
          startedOn: evidence.invocation.started_at,
          finishedOn: evidence.invocation.finished_at
        }
      },
      cannae_environment: {
        provider: evidence.provider,
        provider_identity: clone(evidence.provider_identity),
        ...(version === "0.2" ? { independence: clone(evidence.independence) } : {}),
        exit_code: evidence.invocation.exit_code
      },
      issued_at: evidence.issued_at,
      expires_at: evidence.expires_at
    }
  };
}

function profileFor(runtimePolicy, profileId) {
  return (runtimePolicy && runtimePolicy.profiles || []).find(item => item.id === profileId) || null;
}

function assignmentFor(runtimePolicy, verifierId) {
  return (runtimePolicy && runtimePolicy.assignments || []).find(item => item.verifier_id === verifierId) || null;
}

function verifierFor(trustPolicy, verifierId) {
  return (trustPolicy && trustPolicy.verifiers || []).find(item => item.id === verifierId) || null;
}

function assertPrivateKey(privateKeyPem, expectedKeyId, label) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error(`${label} private key must be Ed25519.`);
  if (publicKeyId(crypto.createPublicKey(privateKey)) !== expectedKeyId) {
    throw new Error(`${label} private key does not match the policy key ID.`);
  }
  return privateKey;
}

function createVerifierExecutionEvidence(options) {
  const trustPolicy = options.trustPolicy;
  const runtimePolicy = options.runtimePolicy;
  const verifier = verifierFor(trustPolicy, options.verifierId);
  const assignment = assignmentFor(runtimePolicy, options.verifierId);
  const profile = assignment && profileFor(runtimePolicy, assignment.profile_id);
  if (!trustPolicy || !["0.4", "0.5", "0.6"].includes(trustPolicy.schema_version) || !verifier || verifier.status !== "active") {
    throw new Error("An active verifier from execution-assured VerifierTrustPolicy v0.4+ is required.");
  }
  if (!runtimePolicy || runtimePolicy.type !== "VerifierRuntimePolicy" || !assignment || !profile) {
    throw new Error("The verifier requires one assigned runtime profile.");
  }
  const independenceRequired = trustPolicy.schema_version === "0.6";
  if (independenceRequired && (runtimePolicy.schema_version !== "0.2" ||
      !sameClaims(options.independence, profile.independence))) {
    throw new Error("Trust-policy v0.6 requires observed independence claims matching runtime-policy v0.2.");
  }
  if (independenceRequired && !computeVerifierIndependence(trustPolicy, runtimePolicy).valid) {
    throw new Error("Trust-policy v0.6 runtime independence identities are invalid.");
  }
  if (!(assignment.allowed_purposes || []).includes(options.purpose)) {
    throw new Error("The runtime profile is not authorized for this evidence purpose.");
  }
  const runtimePolicyRef = clone(options.runtimePolicyReference);
  if (!safeArtifactRef(runtimePolicyRef) || runtimePolicyRef.artifact_id !== runtimePolicy.id ||
      !sameRef(runtimePolicyRef, trustPolicy.execution_assurance && trustPolicy.execution_assurance.runtime_policy_ref)) {
    throw new Error("The runtime policy reference must match the exact trust-policy reference.");
  }
  if (!safeArtifactRef(options.subjectReference) || !safeArtifactRef(options.workloadIdentityEvidenceReference)) {
    throw new Error("Subject and workload identity evidence require exact artifact references.");
  }
  if (!options.repositoryState || typeof options.repositoryState.dirty !== "boolean" ||
      !/^[a-f0-9]{64}$/.test(options.repositoryState.worktree_fingerprint || "")) {
    throw new Error("Execution evidence requires a clean, content-bound repository state.");
  }
  const started = timestamp(options.invocation && options.invocation.started_at);
  const finished = timestamp(options.invocation && options.invocation.finished_at);
  const issued = timestamp(options.issuedAt);
  const expires = timestamp(options.expiresAt);
  if (started === null || finished === null || issued === null || expires === null ||
      finished < started || issued < finished || expires <= issued || options.invocation.exit_code !== 0) {
    throw new Error("Execution, issue, and expiry times must be ordered and the invocation must pass.");
  }
  if (finished - started > profile.max_execution_duration_seconds * 1000) {
    throw new Error("Execution duration exceeds the selected runtime profile.");
  }
  const builderKeyId = profile.builder.key_id;
  if (builderKeyId === verifier.key_id) throw new Error("Builder and verifier signing keys must be distinct.");
  const builderPrivateKey = assertPrivateKey(options.builderPrivateKeyPem, builderKeyId, "Builder");
  const verifierPrivateKey = assertPrivateKey(options.verifierPrivateKeyPem, verifier.key_id, "Verifier");

  const evidence = {
    schema_version: independenceRequired ? "0.2" : "0.1",
    type: "VerifierExecutionEvidence",
    id: options.evidenceId || `VEE-${sha256(`${options.verifierId}\n${options.subjectReference.sha256}\n${options.invocation.id}`).slice(0, 24)}`,
    trust_policy_id: trustPolicy.id,
    runtime_policy_ref: runtimePolicyRef,
    verifier_id: verifier.id,
    profile_id: profile.id,
    purpose: options.purpose,
    subject_ref: clone(options.subjectReference),
    workload_identity_evidence_ref: clone(options.workloadIdentityEvidenceReference),
    repository_binding: clone(options.repositoryBinding),
    repository_state: clone(options.repositoryState),
    verification_target: clone(options.verificationTarget),
    provider: profile.provider,
    provider_identity: clone(options.providerIdentity),
    ...(independenceRequired ? { independence: clone(options.independence) } : {}),
    execution: clone(profile.execution),
    invocation: clone(options.invocation),
    builder_key_id: builderKeyId,
    verifier_key_id: verifier.key_id,
    envelope: null,
    issued_at: options.issuedAt,
    expires_at: options.expiresAt,
    evidence_sha256: ""
  };
  const statement = expectedStatement(evidence, profile);
  const payload = canonicalBytes(statement);
  const pae = preAuthEncoding(DSSE_PAYLOAD_TYPE, payload);
  evidence.envelope = {
    payloadType: DSSE_PAYLOAD_TYPE,
    payload: payload.toString("base64"),
    signatures: [
      { keyid: builderKeyId, sig: crypto.sign(null, pae, builderPrivateKey).toString("base64") },
      { keyid: verifier.key_id, sig: crypto.sign(null, pae, verifierPrivateKey).toString("base64") }
    ]
  };
  evidence.evidence_sha256 = evidenceDigest(evidence);
  return evidence;
}

function keyMatches(publicKeyPem, keyId) {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return key.asymmetricKeyType === "ed25519" && publicKeyId(key) === keyId;
  } catch (error) {
    return false;
  }
}

function providerIdentityValid(profile, evidence) {
  const expected = profile.provider_identity || {};
  const actual = evidence.provider_identity || {};
  if (actual.issuer !== expected.issuer || actual.subject !== expected.subject || actual.audience !== expected.audience) return false;
  const required = PROVIDER_REQUIRED_CLAIMS[profile.provider] || [];
  const pinned = expected.required_claims || {};
  const observed = actual.claims || {};
  if (required.some(key => typeof pinned[key] !== "string" || pinned[key].length === 0)) return false;
  if (Object.entries(pinned).some(([key, value]) => observed[key] !== value)) return false;
  if (profile.provider === "tee" && observed.attestation_result !== "affirming") return false;
  return true;
}

function verifyVerifierExecutionEvidence(options) {
  const evidence = options.evidence;
  const trustPolicy = options.trustPolicy;
  const runtimePolicy = options.runtimePolicy;
  const runtimePolicyReference = options.runtimePolicyReference;
  const evaluatedAt = options.evaluatedAt || new Date().toISOString();
  const evaluatedTime = timestamp(evaluatedAt);
  const codes = [];
  if (!evidence || evidence.type !== "VerifierExecutionEvidence") addCode(codes, "EXECUTION_EVIDENCE_TYPE_INVALID");
  if (evidence && evidence.evidence_sha256 !== evidenceDigest(evidence)) addCode(codes, "EXECUTION_EVIDENCE_DIGEST_INVALID");
  if (!trustPolicy || !["0.4", "0.5", "0.6"].includes(trustPolicy.schema_version) || !trustPolicy.execution_assurance) {
    addCode(codes, "EXECUTION_EVIDENCE_TRUST_POLICY_INVALID");
  }
  const independenceRequired = Boolean(trustPolicy && trustPolicy.schema_version === "0.6");
  const expectedRuntimeVersion = independenceRequired ? "0.2" : "0.1";
  const expectedEvidenceVersion = independenceRequired ? "0.2" : "0.1";
  if (!runtimePolicy || runtimePolicy.type !== "VerifierRuntimePolicy" || runtimePolicy.schema_version !== expectedRuntimeVersion) {
    addCode(codes, "EXECUTION_EVIDENCE_RUNTIME_POLICY_INVALID");
  }
  if (!evidence || evidence.schema_version !== expectedEvidenceVersion) {
    addCode(codes, "EXECUTION_EVIDENCE_SCHEMA_VERSION_INVALID");
  }
  if (evaluatedTime === null) addCode(codes, "EXECUTION_EVIDENCE_EVALUATION_TIME_INVALID");

  const verifier = verifierFor(trustPolicy, evidence && evidence.verifier_id);
  const assignment = assignmentFor(runtimePolicy, evidence && evidence.verifier_id);
  const profile = assignment && profileFor(runtimePolicy, assignment.profile_id);
  if (!verifier || verifier.status !== "active" || !keyMatches(verifier.public_key_pem, verifier.key_id)) {
    addCode(codes, "EXECUTION_EVIDENCE_VERIFIER_UNTRUSTED");
  }
  if (!assignment || !profile || assignment.profile_id !== (evidence && evidence.profile_id)) {
    addCode(codes, "EXECUTION_EVIDENCE_PROFILE_UNASSIGNED");
  }
  if (assignment && !(assignment.allowed_purposes || []).includes(evidence && evidence.purpose)) {
    addCode(codes, "EXECUTION_EVIDENCE_PURPOSE_UNAUTHORIZED");
  }
  if (profile && (!keyMatches(profile.builder.public_key_pem, profile.builder.key_id) ||
      profile.builder.key_id === (verifier && verifier.key_id))) {
    addCode(codes, "EXECUTION_EVIDENCE_BUILDER_UNTRUSTED");
  }

  if (!safeArtifactRef(evidence && evidence.runtime_policy_ref) || !safeArtifactRef(runtimePolicyReference) ||
      !sameRef(evidence && evidence.runtime_policy_ref, runtimePolicyReference) ||
      !sameRef(runtimePolicyReference, trustPolicy && trustPolicy.execution_assurance && trustPolicy.execution_assurance.runtime_policy_ref) ||
      runtimePolicyReference.artifact_id !== (runtimePolicy && runtimePolicy.id)) {
    addCode(codes, "EXECUTION_EVIDENCE_RUNTIME_POLICY_REFERENCE_INVALID");
  }
  if (!safeArtifactRef(evidence && evidence.subject_ref) || !safeArtifactRef(evidence && evidence.workload_identity_evidence_ref)) {
    addCode(codes, "EXECUTION_EVIDENCE_ARTIFACT_REFERENCE_INVALID");
  }
  if (evidence && trustPolicy && evidence.trust_policy_id !== trustPolicy.id) {
    addCode(codes, "EXECUTION_EVIDENCE_TRUST_POLICY_BINDING_INVALID");
  }
  if (runtimePolicy && trustPolicy && runtimePolicy.trust_policy_id !== trustPolicy.id) {
    addCode(codes, "EXECUTION_EVIDENCE_RUNTIME_TRUST_BINDING_INVALID");
  }
  const repository = evidence && evidence.repository_binding;
  if (!repository || !runtimePolicy || !trustPolicy ||
      repository.repository_key !== runtimePolicy.repository_binding.repository_key ||
      repository.identity_fingerprint !== runtimePolicy.repository_binding.identity_fingerprint ||
      repository.repository_key !== trustPolicy.repository_binding.repository_key ||
      repository.identity_fingerprint !== trustPolicy.repository_binding.identity_fingerprint) {
    addCode(codes, "EXECUTION_EVIDENCE_REPOSITORY_BINDING_INVALID");
  }
  if (!evidence || !evidence.repository_state || typeof evidence.repository_state.dirty !== "boolean" ||
      !/^[a-f0-9]{64}$/.test(evidence.repository_state.worktree_fingerprint || "")) {
    addCode(codes, "EXECUTION_EVIDENCE_REPOSITORY_STATE_INVALID");
  }
  if (profile && (evidence.provider !== profile.provider || !providerIdentityValid(profile, evidence))) {
    addCode(codes, "EXECUTION_EVIDENCE_PROVIDER_IDENTITY_INVALID");
  }
  if (profile && !sameValue(evidence.execution, profile.execution)) {
    addCode(codes, "EXECUTION_EVIDENCE_ENVIRONMENT_MISMATCH");
  }
  let independenceDomainId = "none";
  if (independenceRequired) {
    const independence = computeVerifierIndependence(trustPolicy, runtimePolicy);
    independenceDomainId = independence.domain_by_verifier.get(evidence && evidence.verifier_id) || "none";
    if (!independence.valid || independenceDomainId === "none") {
      addCode(codes, "EXECUTION_EVIDENCE_INDEPENDENCE_POLICY_INVALID");
    }
    if (!profile || !sameClaims(evidence && evidence.independence, profile.independence)) {
      addCode(codes, "EXECUTION_EVIDENCE_INDEPENDENCE_MISMATCH");
    }
  }

  const issued = timestamp(evidence && evidence.issued_at);
  const expires = timestamp(evidence && evidence.expires_at);
  const started = timestamp(evidence && evidence.invocation && evidence.invocation.started_at);
  const finished = timestamp(evidence && evidence.invocation && evidence.invocation.finished_at);
  const policyStart = timestamp(runtimePolicy && runtimePolicy.created_at);
  const policyEnd = timestamp(runtimePolicy && runtimePolicy.expires_at);
  const verifierStart = timestamp(verifier && verifier.valid_from);
  const verifierEnd = timestamp(verifier && verifier.valid_until);
  if ([issued, expires, started, finished, policyStart, policyEnd, verifierStart, verifierEnd].some(value => value === null) ||
      finished < started || issued < finished || expires <= issued ||
      evidence.invocation.exit_code !== 0 || evaluatedTime < issued || evaluatedTime >= expires ||
      issued < policyStart || expires > policyEnd || issued < verifierStart || expires > verifierEnd) {
    addCode(codes, "EXECUTION_EVIDENCE_TIME_INVALID");
  }
  if (profile && started !== null && finished !== null && finished - started > profile.max_execution_duration_seconds * 1000) {
    addCode(codes, "EXECUTION_EVIDENCE_DURATION_EXCEEDED");
  }
  if (profile && issued !== null && evaluatedTime !== null && evaluatedTime - issued > profile.max_evidence_age_seconds * 1000) {
    addCode(codes, "EXECUTION_EVIDENCE_STALE");
  }

  const envelope = evidence && evidence.envelope;
  const payload = envelope && strictBase64(envelope.payload);
  const signatures = envelope && Array.isArray(envelope.signatures) ? envelope.signatures : [];
  const signatureByKey = new Map(signatures.map(item => [item.keyid, strictBase64(item.sig)]));
  if (!envelope || envelope.payloadType !== DSSE_PAYLOAD_TYPE || !payload || signatures.length !== 2 ||
      signatureByKey.size !== 2 || !profile || !verifier ||
      !signatureByKey.get(profile.builder.key_id) || !signatureByKey.get(verifier.key_id)) {
    addCode(codes, "EXECUTION_EVIDENCE_DSSE_INVALID");
  } else {
    const pae = preAuthEncoding(envelope.payloadType, payload);
    try {
      if (!crypto.verify(null, pae, profile.builder.public_key_pem, signatureByKey.get(profile.builder.key_id))) {
        addCode(codes, "EXECUTION_EVIDENCE_BUILDER_SIGNATURE_INVALID");
      }
    } catch (error) {
      addCode(codes, "EXECUTION_EVIDENCE_BUILDER_SIGNATURE_INVALID");
    }
    try {
      if (!crypto.verify(null, pae, verifier.public_key_pem, signatureByKey.get(verifier.key_id))) {
        addCode(codes, "EXECUTION_EVIDENCE_VERIFIER_SIGNATURE_INVALID");
      }
    } catch (error) {
      addCode(codes, "EXECUTION_EVIDENCE_VERIFIER_SIGNATURE_INVALID");
    }
  }

  let statement = null;
  if (payload) {
    try { statement = JSON.parse(payload.toString("utf8")); } catch (error) { addCode(codes, "EXECUTION_EVIDENCE_STATEMENT_INVALID"); }
  }
  if (statement && profile) {
    if (!sameValue(statement, expectedStatement(evidence, profile))) {
      addCode(codes, "EXECUTION_EVIDENCE_STATEMENT_BINDING_INVALID");
    }
  }

  const expectations = options.expectations || {};
  const expectedPairs = [
    ["purpose", evidence && evidence.purpose],
    ["verifierId", evidence && evidence.verifier_id],
    ["profileId", evidence && evidence.profile_id],
    ["repositoryKey", repository && repository.repository_key],
    ["repositoryFingerprint", repository && repository.identity_fingerprint]
  ];
  if (expectedPairs.some(([key, actual]) => expectations[key] !== undefined && expectations[key] !== actual)) {
    addCode(codes, "EXECUTION_EVIDENCE_EXPECTATION_MISMATCH");
  }
  const objectExpectations = [
    [expectations.subjectReference, evidence && evidence.subject_ref],
    [expectations.workloadIdentityEvidenceReference, evidence && evidence.workload_identity_evidence_ref],
    [expectations.verificationTarget, evidence && evidence.verification_target]
  ];
  if (objectExpectations.some(([expected, actual]) => expected !== undefined && !sameValue(expected, actual))) {
    addCode(codes, "EXECUTION_EVIDENCE_EXPECTATION_MISMATCH");
  }
  const expectedState = expectations.repositoryState;
  const actualState = evidence && evidence.repository_state;
  if (expectedState && (!actualState || expectedState.head_commit !== actualState.head_commit ||
      expectedState.worktree_fingerprint !== actualState.worktree_fingerprint ||
      (expectedState.dirty !== undefined && expectedState.dirty !== actualState.dirty))) {
    addCode(codes, "EXECUTION_EVIDENCE_EXPECTATION_MISMATCH");
  }

  const validUntilCandidates = [expires, policyEnd, verifierEnd].filter(value => value !== null);
  return {
    valid: codes.length === 0,
    codes: codes.sort(),
    evidence_id: evidence && evidence.id,
    verifier_id: evidence && evidence.verifier_id,
    profile_id: evidence && evidence.profile_id,
    provider: evidence && evidence.provider,
    independence_domain_id: independenceDomainId,
    independence_claims: independenceRequired && evidence ? clone(evidence.independence) : null,
    subject_ref: evidence && evidence.subject_ref,
    valid_until: codes.length === 0 && validUntilCandidates.length > 0
      ? new Date(Math.min(...validUntilCandidates)).toISOString()
      : "none"
  };
}

module.exports = {
  EXECUTION_BUILD_TYPE,
  EXECUTION_PREDICATE_TYPE,
  EXECUTION_PREDICATE_TYPE_V2,
  PROVIDER_REQUIRED_CLAIMS,
  createVerifierExecutionEvidence,
  evidenceDigest,
  expectedStatement,
  verifyVerifierExecutionEvidence
};
