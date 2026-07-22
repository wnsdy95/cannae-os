#!/usr/bin/env node

const crypto = require("crypto");
const { publicKeyId } = require("./verification-attestation");
const { verifyVerifierIdentityEvidence } = require("./verifier-identity-evidence");
const { verifySigstoreVerifierIdentityEvidence } = require("./sigstore-verifier-identity-evidence");
const { challengeSetMatchesOrder, verifyVerifierChallengeSet } = require("./verifier-challenge-set");
const { computeVerifierIndependence } = require("./verifier-independence");

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

function sameReference(left, right) {
  return Boolean(left && right && left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path && left.sha256 === right.sha256);
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

function summarizeQuorum(verifiers, required, requirements, domainByVerifier = null) {
  const verifierIds = [...new Set(verifiers.map(item => item.id))].sort();
  const keyIds = [...new Set(verifiers.map(item => item.key_id))].sort();
  const groups = [...new Set(verifiers.map(item => domainByVerifier
    ? (domainByVerifier.get(item.id) || "none")
    : item.independence_group))].sort();
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

function emptyChallengeAssurance(required) {
  return {
    required,
    satisfied: !required,
    challenge_ref: clone(NONE_ARTIFACT_REF),
    issued_at: "none",
    valid_until: "none",
    responder_count: 0,
    responses: [],
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
  const identityRequired = Boolean(required && policy && ["0.2", "0.3", "0.4", "0.5", "0.6"].includes(policy.schema_version));
  const executionPolicyRequired = Boolean(required && policy && ["0.4", "0.5", "0.6"].includes(policy.schema_version));
  const challengeRequired = Boolean(required && policy && ["0.5", "0.6"].includes(policy.schema_version));
  const independenceRequired = Boolean(required && policy && policy.schema_version === "0.6");
  const runtimePolicy = options.runtimePolicy || null;
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
  if (challengeRequired && (!policy.challenge_assurance || policy.challenge_assurance.required !== true ||
      policy.challenge_assurance.single_use !== true)) {
    addCode(blockingCodes, "TRUST_ADMISSION_CHALLENGE_POLICY_INVALID");
  }
  if (policy && (policy.repository_binding.repository_key !== repository.key ||
      policy.repository_binding.identity_fingerprint !== repository.identity_fingerprint)) {
    addCode(blockingCodes, "TRUST_ADMISSION_REPOSITORY_MISMATCH");
  }
  if (executionPolicyRequired) {
    const runtimeRef = policy.execution_assurance && policy.execution_assurance.runtime_policy_ref;
    if (!runtimePolicy || !runtimeRef || runtimePolicy.id !== runtimeRef.artifact_id ||
        runtimePolicy.trust_policy_id !== policy.id) {
      addCode(blockingCodes, "TRUST_ADMISSION_RUNTIME_POLICY_REFERENCE_INVALID");
    } else if (runtimePolicy.repository_binding.repository_key !== repository.key ||
        runtimePolicy.repository_binding.identity_fingerprint !== repository.identity_fingerprint) {
      addCode(blockingCodes, "TRUST_ADMISSION_RUNTIME_POLICY_REPOSITORY_MISMATCH");
    } else {
      const profiles = new Set((runtimePolicy.profiles || []).map(item => item.id));
      const assignments = runtimePolicy.assignments || [];
      const assignmentIds = assignments.map(item => item.verifier_id);
      const complete = (policy.verifiers || []).every(verifier => {
        const matches = assignments.filter(item => item.verifier_id === verifier.id);
        const requiredPurposes = verifier.allowed_attestation_types || ["verification_receipt"];
        return matches.length === 1 && profiles.has(matches[0].profile_id) &&
          requiredPurposes.every(purpose => matches[0].allowed_purposes.includes(purpose));
      });
      if (!complete || new Set(assignmentIds).size !== assignmentIds.length) {
        addCode(blockingCodes, "TRUST_ADMISSION_RUNTIME_POLICY_ASSIGNMENT_INVALID");
      }
    }
  }
  const independence = computeVerifierIndependence(policy, runtimePolicy);
  if (independenceRequired) {
    for (const code of independence.blocking_codes) addCode(blockingCodes, code);
  }

  const policyStart = policy ? timestamp(policy.created_at) : null;
  const policyEnd = policy ? timestamp(policy.expires_at) : null;
  if (policy && (policyStart === null || policyEnd === null || evaluatedTime < policyStart || evaluatedTime >= policyEnd)) {
    addCode(blockingCodes, "TRUST_ADMISSION_POLICY_NOT_ACTIVE");
  }
  const runtimePolicyStart = runtimePolicy ? timestamp(runtimePolicy.created_at) : null;
  const runtimePolicyEnd = runtimePolicy ? timestamp(runtimePolicy.expires_at) : null;
  if (executionPolicyRequired && runtimePolicy && (runtimePolicyStart === null || runtimePolicyEnd === null ||
      evaluatedTime < runtimePolicyStart || evaluatedTime >= runtimePolicyEnd)) {
    addCode(blockingCodes, "TRUST_ADMISSION_RUNTIME_POLICY_NOT_ACTIVE");
  }

  const challengeBlockingCodes = [];
  let selectedChallenge = null;
  let selectedChallengeRef = null;
  if (challengeRequired) {
    const dispatchOrder = options.dispatchOrder;
    const projectionMatches = dispatchOrder ? (options.challengeSets || []).filter(item => item && item.payload &&
      challengeSetMatchesOrder(item.payload, dispatchOrder)) : [];
    const matches = projectionMatches.filter(item => {
      const issued = timestamp(item.payload.issued_at);
      const expires = timestamp(item.payload.expires_at);
      return issued !== null && expires !== null && evaluatedTime >= issued && evaluatedTime < expires;
    });
    if (matches.length === 0) {
      addCode(challengeBlockingCodes, "TRUST_ADMISSION_CHALLENGE_SET_UNAVAILABLE");
    } else if (matches.length > 1) {
      addCode(challengeBlockingCodes, "TRUST_ADMISSION_CHALLENGE_SET_AMBIGUOUS");
    } else {
      selectedChallenge = matches[0].payload;
      selectedChallengeRef = identityArtifactRef(matches[0]);
      const verification = selectedChallengeRef && verifyVerifierChallengeSet({
        challengeSet: selectedChallenge,
        campaign,
        trustPolicy: policy,
        order: dispatchOrder,
        repository,
        evaluatedAt,
        manifestHistory: options.manifestHistory,
        currentManifestRevision: options.currentManifestRevision
      });
      if (!selectedChallengeRef || !verification || !verification.valid) {
        addCode(challengeBlockingCodes, "TRUST_ADMISSION_CHALLENGE_SET_INVALID");
      }
      const consumedBy = (options.existingOrders || []).filter(item => item && item.payload &&
        item.payload.status === "ready" && item.payload.trust_policy_admission &&
        item.payload.trust_policy_admission.challenge_assurance &&
        sameReference(item.payload.trust_policy_admission.challenge_assurance.challenge_ref, selectedChallengeRef));
      if (consumedBy.some(item => !challengeSetMatchesOrder(selectedChallenge, item.payload))) {
        addCode(challengeBlockingCodes, "TRUST_ADMISSION_CHALLENGE_REPLAYED");
      }
    }
  }
  for (const code of challengeBlockingCodes) addCode(blockingCodes, code);

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
      const isSigstore = verifier.workload_identity && verifier.workload_identity.type === "sigstore_bundle";
      const evidencePool = isSigstore ? options.sigstoreIdentityEvidence : options.identityEvidence;
      const trustedRoot = isSigstore ? (options.sigstoreTrustedRoots || [])
        .find(item => item && item.payload && item.payload.id === verifier.workload_identity.trust_root_id) : null;
      const candidates = (evidencePool || []).filter(item => item && item.payload &&
        item.payload.verifier_id === verifier.id && item.payload.trust_policy_id === policy.id &&
        item.payload.repository_binding && item.payload.repository_binding.repository_key === repository.key &&
        item.payload.repository_binding.identity_fingerprint === repository.identity_fingerprint &&
        (!challengeRequired || (selectedChallenge && (() => {
          const challenge = selectedChallenge.challenges.find(value => value.verifier_id === verifier.id);
          const issued = timestamp(item.payload.issued_at);
          return challenge && item.payload.binding_statement && item.payload.binding_statement.nonce === challenge.nonce &&
            issued !== null && issued >= timestamp(selectedChallenge.issued_at) && issued < timestamp(selectedChallenge.expires_at) &&
            item.payload.expires_at && timestamp(item.payload.expires_at) > evaluatedTime;
        })())));
      const validCandidates = candidates.map(item => ({
        item,
        ref: identityArtifactRef(item),
        result: isSigstore ? verifySigstoreVerifierIdentityEvidence({
          evidence: item.payload,
          trustPolicy: policy,
          verifier,
          trustedRootArtifact: trustedRoot && trustedRoot.payload,
          repository,
          evaluatedAt
        }) : verifyVerifierIdentityEvidence({
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
  const domainByVerifier = independenceRequired ? independence.domain_by_verifier : null;
  const receiptQuorum = summarizeQuorum(receiptEligible, receiptRequired, requirements, domainByVerifier);
  const comparativeQuorum = summarizeQuorum(comparativeEligible, comparativeRequired, requirements, domainByVerifier);

  const genericIdentity = policy && ["0.3", "0.4", "0.5", "0.6"].includes(policy.schema_version);
  const identityEvidence = identityRequired ? authenticated.map(item => genericIdentity ? {
    verifier_id: item.verifier.id,
    identity_provider: item.result.identity_provider || "spiffe_x509",
    identity: item.result.identity || item.result.spiffe_id,
    identity_authority: item.result.identity_authority || item.result.trust_domain,
    trust_root_id: item.result.trust_root_id || item.verifier.workload_identity.trust_root_id,
    certificate_sha256: item.result.certificate_sha256,
    transparency_log_ids: item.result.transparency_log_ids || [item.result.transparency_log_id],
    purposes: item.result.purposes,
    evidence_ref: item.ref,
    issued_at: item.result.issued_at,
    valid_until: item.result.valid_until
  } : {
    verifier_id: item.verifier.id,
    spiffe_id: item.result.spiffe_id,
    trust_domain: item.result.trust_domain,
    certificate_sha256: item.result.certificate_sha256,
    transparency_log_id: item.result.transparency_log_id,
    purposes: item.result.purposes,
    evidence_ref: item.ref,
    issued_at: item.result.issued_at,
    valid_until: item.result.valid_until
  }).sort((left, right) => left.verifier_id.localeCompare(right.verifier_id)) : [];
  const identitySatisfied = !identityRequired || (receiptQuorum.satisfied && comparativeQuorum.satisfied);
  const identityBlockingCodes = [];
  if (!identitySatisfied) identityBlockingCodes.push("TRUST_ADMISSION_WORKLOAD_IDENTITY_UNAVAILABLE");
  const identityAssurance = {
    required: Boolean(identityRequired),
    satisfied: identitySatisfied,
    authenticated_verifier_count: identityEvidence.length,
    distinct_trust_domain_count: new Set(identityEvidence.map(item => item.trust_domain).filter(Boolean)).size,
    ...(genericIdentity ? {
      distinct_identity_authority_count: new Set(identityEvidence.map(item => item.identity_authority)).size
    } : {}),
    transparency_log_count: new Set(identityEvidence.flatMap(item => item.transparency_log_ids || [item.transparency_log_id])).size,
    evidence: identityEvidence,
    blocking_codes: identityBlockingCodes
  };

  const challengeResponses = challengeRequired && selectedChallenge ? authenticated.map(item => ({
    verifier_id: item.verifier.id,
    purposes: [...item.result.purposes].sort(),
    identity_evidence_ref: clone(item.ref),
    responded_at: item.result.issued_at
  })).sort((left, right) => left.verifier_id.localeCompare(right.verifier_id)) : [];
  const challengeSatisfied = !challengeRequired || (challengeBlockingCodes.length === 0 &&
    receiptQuorum.satisfied && comparativeQuorum.satisfied);
  const challengeResponseCodes = [...challengeBlockingCodes];
  if (challengeRequired && !challengeSatisfied && selectedChallenge && challengeBlockingCodes.length === 0) {
    addCode(challengeResponseCodes, "TRUST_ADMISSION_CHALLENGE_RESPONSE_UNAVAILABLE");
  }
  const challengeAssurance = challengeRequired ? {
    required: true,
    satisfied: challengeSatisfied,
    challenge_ref: selectedChallengeRef ? clone(selectedChallengeRef) : clone(NONE_ARTIFACT_REF),
    issued_at: selectedChallenge ? selectedChallenge.issued_at : "none",
    valid_until: selectedChallenge ? selectedChallenge.expires_at : "none",
    responder_count: challengeResponses.length,
    responses: challengeResponses,
    blocking_codes: challengeResponseCodes.sort()
  } : emptyChallengeAssurance(false);

  if (receiptRequired && !receiptQuorum.satisfied) addCode(blockingCodes, "TRUST_ADMISSION_RECEIPT_QUORUM_UNAVAILABLE");
  if (comparativeRequired && !comparativeQuorum.satisfied) addCode(blockingCodes, "TRUST_ADMISSION_COMPARATIVE_QUORUM_UNAVAILABLE");
  if (!identitySatisfied) addCode(blockingCodes, "TRUST_ADMISSION_WORKLOAD_IDENTITY_UNAVAILABLE");
  if (challengeRequired && !challengeSatisfied) {
    for (const code of challengeResponseCodes) addCode(blockingCodes, code);
  }

  let validUntil = "none";
  const satisfied = blockingCodes.length === 0 && receiptQuorum.satisfied && comparativeQuorum.satisfied;
  if (satisfied) {
    const requiredVerifiers = [...receiptEligible, ...(comparativeRequired ? comparativeEligible : [])];
    const identityBoundaries = identityRequired ? authenticated.map(item => timestamp(item.result.valid_until)) : [];
    const challengeBoundary = challengeRequired && selectedChallenge ? timestamp(selectedChallenge.expires_at) : null;
    const boundaries = [policyEnd, ...(executionPolicyRequired ? [runtimePolicyEnd] : []), challengeBoundary,
      ...requiredVerifiers.map(item => timestamp(item.valid_until)), ...identityBoundaries]
      .filter(value => value !== null && value > evaluatedTime);
    if (boundaries.length > 0) validUntil = new Date(Math.min(...boundaries)).toISOString();
    if (validUntil === "none") {
      addCode(blockingCodes, "TRUST_ADMISSION_VALIDITY_WINDOW_UNAVAILABLE");
    }
  }

  return {
    required: true,
    satisfied: blockingCodes.length === 0 && receiptQuorum.satisfied && comparativeQuorum.satisfied,
    assurance_scope: independenceRequired
      ? "failure_domain_verified_fresh_challenged_workload_and_policy_eligibility"
      : challengeRequired ? "fresh_challenged_workload_and_policy_eligibility"
      : identityRequired ? "authenticated_workload_and_policy_eligibility" : "policy_eligibility_only",
    evaluated_at: evaluatedAt,
    valid_until: blockingCodes.length === 0 ? validUntil : "none",
    trust_policy_ref: trustPolicyRef,
    effective_requirements: requirements,
    receipt_quorum: receiptQuorum,
    comparative_quorum: comparativeQuorum,
    identity_assurance: identityAssurance,
    ...(challengeRequired ? { challenge_assurance: challengeAssurance } : {}),
    ...(independenceRequired ? { independence_assurance: {
      required: true,
      satisfied: independence.satisfied,
      required_dimensions: independence.required_dimensions,
      minimum_independent_domains: independence.minimum_independent_domains,
      domain_count: independence.domain_count,
      domains: independence.domains,
      bindings: independence.bindings,
      blocking_codes: independence.blocking_codes
    } } : {}),
    blocking_codes: blockingCodes.sort()
  };
}

module.exports = { evaluateVerifierTrustReadiness };
