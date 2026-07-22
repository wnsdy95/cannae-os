#!/usr/bin/env node

const crypto = require("crypto");
const { publicKeyId } = require("./verification-attestation");
const { verifyVerifierIdentityEvidence } = require("./verifier-identity-evidence");

const NONE_ARTIFACT_REF = Object.freeze({ artifact_id: "none", relative_path: "none", sha256: "none" });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyQuorum(required) {
  return {
    required,
    satisfied: !required,
    eligible_verifier_count: 0,
    distinct_key_count: 0,
    independence_group_count: 0,
    verifier_ids: [],
    key_ids: [],
    independence_groups: []
  };
}

function summarizeQuorum(verifiers, required, requirements) {
  const verifierIds = [...new Set(verifiers.map(item => item.id))].sort();
  const keyIds = [...new Set(verifiers.map(item => item.key_id))].sort();
  const groups = [...new Set(verifiers.map(item => item.independence_group))].sort();
  const enoughVerifiers = verifierIds.length >= requirements.minimum_valid_attestations;
  const enoughKeys = !requirements.require_distinct_key_ids ||
    keyIds.length >= requirements.minimum_valid_attestations;
  const enoughGroups = groups.length >= requirements.minimum_independence_groups;
  return {
    required,
    satisfied: !required || (enoughVerifiers && enoughKeys && enoughGroups),
    eligible_verifier_count: verifierIds.length,
    distinct_key_count: keyIds.length,
    independence_group_count: groups.length,
    verifier_ids: verifierIds,
    key_ids: keyIds,
    independence_groups: groups
  };
}

function verifierKeyIsValid(verifier) {
  try {
    const key = crypto.createPublicKey(verifier.public_key_pem);
    return key.asymmetricKeyType === "ed25519" && publicKeyId(key) === verifier.key_id;
  } catch (error) {
    return false;
  }
}

function identityArtifactRef(item) {
  const entry = item && item.entry;
  const payload = item && item.payload;
  if (!entry || !payload || entry.artifact_id !== payload.id || !/^[a-f0-9]{64}$/.test(entry.sha256 || "") ||
      typeof entry.relative_path !== "string" || entry.relative_path.length === 0) return null;
  return {
    artifact_id: entry.artifact_id,
    relative_path: entry.relative_path,
    sha256: entry.sha256
  };
}

function emptyIdentityAssurance(required) {
  return {
    required,
    satisfied: !required,
    authenticated_verifier_count: 0,
    distinct_trust_domain_count: 0,
    transparency_log_count: 0,
    evidence: [],
    blocking_codes: []
  };
}

function evaluateVerifierTrustReadiness(options) {
  const campaign = options.campaign;
  const repository = options.repository;
  const policy = options.trustPolicy || null;
  const evaluatedAt = options.evaluatedAt || new Date().toISOString();
  const evaluatedTime = timestamp(evaluatedAt);
  if (!campaign || !repository || evaluatedTime === null) {
    throw new Error("campaign, repository, and a valid evaluatedAt timestamp are required.");
  }

  const receiptRequired = ["0.3", "0.4"].includes(campaign.schema_version);
  const comparativeRequired = campaign.schema_version === "0.4";
  const required = receiptRequired || comparativeRequired;
  const identityRequired = Boolean(required && policy && policy.schema_version === "0.2");
  const campaignPolicy = campaign.attestation_policy || null;
  const trustPolicyRef = campaignPolicy ? clone(campaignPolicy.trust_policy_ref) : clone(NONE_ARTIFACT_REF);
  const policyQuorum = policy && policy.quorum ? policy.quorum : {};
  const requirements = {
    minimum_valid_attestations: required
      ? Math.max(campaignPolicy ? campaignPolicy.minimum_valid_attestations : 0, policyQuorum.minimum_valid_attestations || 0)
      : 0,
    minimum_independence_groups: required
      ? Math.max(campaignPolicy ? campaignPolicy.minimum_independence_groups : 0, policyQuorum.minimum_independence_groups || 0)
      : 0,
    require_distinct_key_ids: required
      ? Boolean((campaignPolicy && campaignPolicy.require_distinct_key_ids) || policyQuorum.require_distinct_key_ids)
      : false
  };
  const blockingCodes = [...new Set(options.blockingCodes || [])];

  if (!required) {
    return {
      required: false,
      satisfied: true,
      assurance_scope: "policy_eligibility_only",
      evaluated_at: evaluatedAt,
      valid_until: "none",
      trust_policy_ref: trustPolicyRef,
      effective_requirements: requirements,
      receipt_quorum: emptyQuorum(false),
      comparative_quorum: emptyQuorum(false),
      identity_assurance: emptyIdentityAssurance(false),
      blocking_codes: []
    };
  }

  if (!campaignPolicy || !policy) addCode(blockingCodes, "TRUST_ADMISSION_POLICY_REFERENCE_INVALID");
  if (policy && campaignPolicy && policy.id !== campaignPolicy.trust_policy_ref.artifact_id) {
    addCode(blockingCodes, "TRUST_ADMISSION_POLICY_REFERENCE_INVALID");
  }
  if (identityRequired && (!policy.identity_assurance || policy.identity_assurance.required !== true)) {
    addCode(blockingCodes, "TRUST_ADMISSION_POLICY_SCHEMA_INVALID");
  }
  if (policy && (policy.repository_binding.repository_key !== repository.key ||
      policy.repository_binding.identity_fingerprint !== repository.identity_fingerprint)) {
    addCode(blockingCodes, "TRUST_ADMISSION_REPOSITORY_MISMATCH");
  }

  const policyStart = policy ? timestamp(policy.created_at) : null;
  const policyEnd = policy ? timestamp(policy.expires_at) : null;
  if (policy && (policyStart === null || policyEnd === null || evaluatedTime < policyStart || evaluatedTime >= policyEnd)) {
    addCode(blockingCodes, "TRUST_ADMISSION_POLICY_NOT_ACTIVE");
  }

  const policyUsable = policy && blockingCodes.length === 0;
  const policyEligible = policyUsable ? policy.verifiers.filter(verifier => {
    const validFrom = timestamp(verifier.valid_from);
    const validUntil = timestamp(verifier.valid_until);
    return verifier.status === "active" &&
      Array.isArray(verifier.allowed_repository_keys) && verifier.allowed_repository_keys.includes(repository.key) &&
      validFrom !== null && validUntil !== null && evaluatedTime >= validFrom && evaluatedTime < validUntil &&
      verifierKeyIsValid(verifier);
  }) : [];
  const authenticated = [];
  if (identityRequired) {
    for (const verifier of policyEligible) {
      const candidates = (options.identityEvidence || []).filter(item => item && item.payload &&
        item.payload.verifier_id === verifier.id && item.payload.trust_policy_id === policy.id &&
        item.payload.repository_binding && item.payload.repository_binding.repository_key === repository.key &&
        item.payload.repository_binding.identity_fingerprint === repository.identity_fingerprint);
      const validCandidates = candidates.map(item => ({
        item,
        ref: identityArtifactRef(item),
        result: verifyVerifierIdentityEvidence({
          evidence: item.payload,
          trustPolicy: policy,
          verifier,
          repository,
          evaluatedAt
        })
      })).filter(item => item.ref && item.result.valid && item.result.valid_until !== "none")
        .sort((left, right) => Date.parse(right.result.issued_at) - Date.parse(left.result.issued_at) ||
          left.item.payload.id.localeCompare(right.item.payload.id));
      if (validCandidates.length > 0) authenticated.push({ verifier, ...validCandidates[0] });
    }
  } else {
    for (const verifier of policyEligible) authenticated.push({ verifier, result: null, ref: null });
  }

  const purposeAuthorized = purpose => authenticated.filter(item => {
    const configured = item.verifier.allowed_attestation_types;
    const policyAllows = configured === undefined ? purpose === "verification_receipt" : configured.includes(purpose);
    const identityAllows = !identityRequired || item.result.purposes.includes(purpose);
    return policyAllows && identityAllows;
  }).map(item => item.verifier);
  const receiptEligible = purposeAuthorized("verification_receipt");
  const comparativeEligible = purposeAuthorized("comparative_evaluation_report");
  const receiptQuorum = summarizeQuorum(receiptEligible, receiptRequired, requirements);
  const comparativeQuorum = summarizeQuorum(comparativeEligible, comparativeRequired, requirements);

  const identityEvidence = identityRequired ? authenticated.map(item => ({
    verifier_id: item.verifier.id,
    spiffe_id: item.result.spiffe_id,
    trust_domain: item.result.trust_domain,
    certificate_sha256: item.result.certificate_sha256,
    transparency_log_id: item.result.transparency_log_id,
    purposes: item.result.purposes,
    evidence_ref: item.ref,
    issued_at: item.result.issued_at,
    valid_until: item.result.valid_until
  })).sort((left, right) => left.verifier_id.localeCompare(right.verifier_id)) : [];
  const identitySatisfied = !identityRequired || (receiptQuorum.satisfied && comparativeQuorum.satisfied);
  const identityBlockingCodes = [];
  if (!identitySatisfied) identityBlockingCodes.push("TRUST_ADMISSION_WORKLOAD_IDENTITY_UNAVAILABLE");
  const identityAssurance = {
    required: Boolean(identityRequired),
    satisfied: identitySatisfied,
    authenticated_verifier_count: identityEvidence.length,
    distinct_trust_domain_count: new Set(identityEvidence.map(item => item.trust_domain)).size,
    transparency_log_count: new Set(identityEvidence.map(item => item.transparency_log_id)).size,
    evidence: identityEvidence,
    blocking_codes: identityBlockingCodes
  };

  if (receiptRequired && !receiptQuorum.satisfied) addCode(blockingCodes, "TRUST_ADMISSION_RECEIPT_QUORUM_UNAVAILABLE");
  if (comparativeRequired && !comparativeQuorum.satisfied) addCode(blockingCodes, "TRUST_ADMISSION_COMPARATIVE_QUORUM_UNAVAILABLE");
  if (!identitySatisfied) addCode(blockingCodes, "TRUST_ADMISSION_WORKLOAD_IDENTITY_UNAVAILABLE");

  let validUntil = "none";
  const satisfied = blockingCodes.length === 0 && receiptQuorum.satisfied && comparativeQuorum.satisfied;
  if (satisfied) {
    const requiredVerifiers = [...receiptEligible, ...(comparativeRequired ? comparativeEligible : [])];
    const identityBoundaries = identityRequired ? authenticated.map(item => timestamp(item.result.valid_until)) : [];
    const boundaries = [policyEnd, ...requiredVerifiers.map(item => timestamp(item.valid_until)), ...identityBoundaries]
      .filter(value => value !== null && value > evaluatedTime);
    if (boundaries.length > 0) validUntil = new Date(Math.min(...boundaries)).toISOString();
    if (validUntil === "none") {
      addCode(blockingCodes, "TRUST_ADMISSION_VALIDITY_WINDOW_UNAVAILABLE");
    }
  }

  return {
    required: true,
    satisfied: blockingCodes.length === 0 && receiptQuorum.satisfied && comparativeQuorum.satisfied,
    assurance_scope: identityRequired ? "authenticated_workload_and_policy_eligibility" : "policy_eligibility_only",
    evaluated_at: evaluatedAt,
    valid_until: blockingCodes.length === 0 ? validUntil : "none",
    trust_policy_ref: trustPolicyRef,
    effective_requirements: requirements,
    receipt_quorum: receiptQuorum,
    comparative_quorum: comparativeQuorum,
    identity_assurance: identityAssurance,
    blocking_codes: blockingCodes.sort()
  };
}

module.exports = { evaluateVerifierTrustReadiness };
