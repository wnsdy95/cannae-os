#!/usr/bin/env node

const crypto = require("crypto");
const { publicKeyId, strictBase64 } = require("./verification-attestation");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalDigest(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalValue(value))));
}

function signingBytes(challengeSet) {
  const copy = clone(challengeSet);
  delete copy.issuer_signature;
  return Buffer.from(JSON.stringify(canonicalValue(copy)));
}

function challengeSetId(challengeSet) {
  const identity = {
    campaign_id: challengeSet.campaign_id,
    mission_id: challengeSet.mission_id,
    dispatch_binding: challengeSet.dispatch_binding,
    issued_at: challengeSet.issued_at,
    nonces: (challengeSet.challenges || []).map(item => item.nonce)
  };
  return `VCS-${sha256(JSON.stringify(identity)).slice(0, 24)}`;
}

function sameReference(left, right, idField = "artifact_id") {
  return Boolean(left && right && left[idField] === right[idField] &&
    left.relative_path === right.relative_path && left.sha256 === right.sha256);
}

function dispatchBindingFromOrder(order) {
  return {
    cycle_number: order.cycle_number,
    attempt_number: order.attempt_number,
    transition: order.transition,
    baseline_revision: order.baseline_revision,
    parent_decision_ref: clone(order.parent_decision_ref),
    source_checkpoint_ref: clone(order.source_checkpoint_ref),
    source_decision_ref: clone(order.source_decision_ref),
    checkpoint_trigger: order.checkpoint_trigger,
    task_sha256: canonicalDigest(order.task_order),
    proof_requirements_sha256: canonicalDigest(order.proof_requirements)
  };
}

function challengeSetMatchesOrder(challengeSet, order) {
  return Boolean(challengeSet && order &&
    challengeSet.campaign_id === order.campaign_id &&
    challengeSet.mission_id === order.mission_id &&
    challengeSet.repository_binding.repository_key === order.repository_binding.repository_key &&
    challengeSet.repository_binding.identity_fingerprint === order.repository_binding.identity_fingerprint &&
    JSON.stringify(challengeSet.dispatch_binding) === JSON.stringify(dispatchBindingFromOrder(order)) &&
    sameReference(challengeSet.trust_policy_ref, order.proof_requirements.trust_policy_ref));
}

function createVerifierChallengeSet(options) {
  const { campaign, trustPolicy, order, repository, observedManifest } = options;
  const issuedAt = options.issuedAt || new Date().toISOString();
  const issuedTime = Date.parse(issuedAt);
  const assurance = trustPolicy && trustPolicy.challenge_assurance;
  if (!campaign || !trustPolicy || !order || !repository || !observedManifest || !assurance || assurance.required !== true) {
    throw new Error("Campaign, trust policy, projected order, repository, manifest, and required challenge assurance are required.");
  }
  if (!Number.isFinite(issuedTime)) throw new Error("Challenge issue time is invalid.");
  const nonceBytes = assurance.nonce_bytes;
  if (!Number.isInteger(nonceBytes) || nonceBytes < 32 || nonceBytes > 64) {
    throw new Error("Challenge nonces must contain 32 to 64 random bytes.");
  }
  const issuerPrivateKey = crypto.createPrivateKey(options.issuerPrivateKeyPem);
  const issuerPublicKey = crypto.createPublicKey(issuerPrivateKey);
  if (issuerPrivateKey.asymmetricKeyType !== "ed25519" || publicKeyId(issuerPublicKey) !== assurance.issuer_key_id ||
      publicKeyId(assurance.issuer_public_key_pem) !== assurance.issuer_key_id) {
    throw new Error("Challenge issuer private key must match the policy-pinned Ed25519 issuer key.");
  }
  const expiryTime = Math.min(
    issuedTime + assurance.response_timeout_seconds * 1000,
    Date.parse(trustPolicy.expires_at)
  );
  if (!Number.isFinite(expiryTime) || expiryTime <= issuedTime) throw new Error("Challenge validity window is unavailable.");
  const challenges = (trustPolicy.verifiers || []).filter(verifier =>
    verifier.status === "active" &&
    (verifier.allowed_repository_keys || []).includes(repository.key) &&
    Date.parse(verifier.valid_from) <= issuedTime && issuedTime < Date.parse(verifier.valid_until)
  ).map(verifier => ({
    verifier_id: verifier.id,
    purposes: [...new Set(verifier.allowed_attestation_types || ["verification_receipt"])].sort(),
    nonce: crypto.randomBytes(nonceBytes).toString("hex")
  })).sort((left, right) => left.verifier_id.localeCompare(right.verifier_id));
  if (challenges.length === 0) throw new Error("No active verifier is eligible to receive a challenge.");

  const challengeSet = {
    schema_version: "0.1",
    type: "VerifierChallengeSet",
    id: "VCS-pending",
    campaign_id: campaign.id,
    mission_id: campaign.mission_id,
    repository_binding: {
      repository_key: repository.key,
      identity_fingerprint: repository.identity_fingerprint
    },
    trust_policy_ref: clone(order.proof_requirements.trust_policy_ref),
    runtime_policy_ref: clone(trustPolicy.execution_assurance.runtime_policy_ref),
    observed_manifest: clone(observedManifest),
    dispatch_binding: dispatchBindingFromOrder(order),
    issued_by: campaign.command_team.campaign_supervisor || campaign.command_team.campaign_owner,
    challenges,
    issued_at: issuedAt,
    expires_at: new Date(expiryTime).toISOString(),
    single_use: true,
    release_authorized: false,
    issuer_signature: null
  };
  challengeSet.id = challengeSetId(challengeSet);
  challengeSet.issuer_signature = {
    key_id: assurance.issuer_key_id,
    algorithm: "ed25519",
    signature_base64: crypto.sign(null, signingBytes(challengeSet), issuerPrivateKey).toString("base64")
  };
  return challengeSet;
}

function verifyVerifierChallengeSet(options) {
  const codes = [];
  const { challengeSet, campaign, trustPolicy, order, repository } = options;
  const evaluatedTime = Date.parse(options.evaluatedAt || new Date().toISOString());
  const add = code => { if (!codes.includes(code)) codes.push(code); };
  if (!challengeSet || challengeSet.type !== "VerifierChallengeSet" || challengeSet.schema_version !== "0.1") {
    return { valid: false, codes: ["CHALLENGE_SET_TYPE_INVALID"] };
  }
  if (!campaign || challengeSet.campaign_id !== campaign.id || challengeSet.mission_id !== campaign.mission_id ||
      challengeSet.issued_by !== (campaign.command_team.campaign_supervisor || campaign.command_team.campaign_owner)) {
    add("CHALLENGE_SET_CAMPAIGN_BINDING_INVALID");
  }
  if (!repository || challengeSet.repository_binding.repository_key !== repository.key ||
      challengeSet.repository_binding.identity_fingerprint !== repository.identity_fingerprint) {
    add("CHALLENGE_SET_REPOSITORY_BINDING_INVALID");
  }
  if (!trustPolicy || !sameReference(challengeSet.trust_policy_ref, order.proof_requirements.trust_policy_ref) ||
      !sameReference(challengeSet.runtime_policy_ref, trustPolicy.execution_assurance.runtime_policy_ref)) {
    add("CHALLENGE_SET_POLICY_BINDING_INVALID");
  }
  if (!challengeSetMatchesOrder(challengeSet, order)) add("CHALLENGE_SET_DISPATCH_BINDING_INVALID");
  const issuedTime = Date.parse(challengeSet.issued_at);
  const expiresTime = Date.parse(challengeSet.expires_at);
  if (!Number.isFinite(evaluatedTime) || !Number.isFinite(issuedTime) || !Number.isFinite(expiresTime) ||
      expiresTime <= issuedTime || evaluatedTime < issuedTime || evaluatedTime >= expiresTime) {
    add("CHALLENGE_SET_NOT_ACTIVE");
  }
  const policyCreated = Date.parse(trustPolicy && trustPolicy.created_at);
  const timeout = trustPolicy && trustPolicy.challenge_assurance && trustPolicy.challenge_assurance.response_timeout_seconds;
  if (!Number.isFinite(policyCreated) || !Number.isInteger(timeout) || issuedTime < policyCreated ||
      expiresTime - issuedTime > timeout * 1000 || expiresTime > Date.parse(trustPolicy.expires_at)) {
    add("CHALLENGE_SET_WINDOW_POLICY_INVALID");
  }
  if (challengeSet.id !== challengeSetId(challengeSet)) add("CHALLENGE_SET_ID_INVALID");
  const issuer = challengeSet.issuer_signature || {};
  const issuerSignature = strictBase64(issuer.signature_base64);
  try {
    const issuerKey = crypto.createPublicKey(trustPolicy.challenge_assurance.issuer_public_key_pem);
    if (issuerKey.asymmetricKeyType !== "ed25519" || issuer.key_id !== trustPolicy.challenge_assurance.issuer_key_id ||
        publicKeyId(issuerKey) !== issuer.key_id || issuer.algorithm !== "ed25519" || !issuerSignature ||
        !crypto.verify(null, signingBytes(challengeSet), issuerKey, issuerSignature)) {
      add("CHALLENGE_SET_ISSUER_SIGNATURE_INVALID");
    }
  } catch (error) {
    add("CHALLENGE_SET_ISSUER_SIGNATURE_INVALID");
  }
  if (options.manifestHistory) {
    const observed = challengeSet.observed_manifest || {};
    if (options.manifestHistory.get(observed.revision) !== observed.sha256 ||
        (Number.isInteger(options.currentManifestRevision) && observed.revision >= options.currentManifestRevision)) {
      add("CHALLENGE_SET_MANIFEST_BINDING_INVALID");
    }
  }
  if (challengeSet.single_use !== true || challengeSet.release_authorized !== false) add("CHALLENGE_SET_AUTHORITY_INVALID");
  const verifierIds = new Set();
  const nonces = new Set();
  const nonceBytes = trustPolicy && trustPolicy.challenge_assurance && trustPolicy.challenge_assurance.nonce_bytes;
  const expectedVerifierIds = new Set((trustPolicy && trustPolicy.verifiers || []).filter(verifier =>
    verifier.status === "active" &&
    (verifier.allowed_repository_keys || []).includes(repository.key) &&
    Date.parse(verifier.valid_from) <= issuedTime && issuedTime < Date.parse(verifier.valid_until)
  ).map(verifier => verifier.id));
  for (const challenge of challengeSet.challenges || []) {
    const verifier = trustPolicy && (trustPolicy.verifiers || []).find(item => item.id === challenge.verifier_id);
    if (!verifier || verifier.status !== "active" || !(verifier.allowed_repository_keys || []).includes(repository.key) ||
        Date.parse(verifier.valid_from) > issuedTime || issuedTime >= Date.parse(verifier.valid_until) ||
        verifierIds.has(challenge.verifier_id)) add("CHALLENGE_SET_VERIFIER_INVALID");
    verifierIds.add(challenge.verifier_id);
    if (!Number.isInteger(nonceBytes) || !new RegExp(`^[a-f0-9]{${nonceBytes * 2}}$`).test(challenge.nonce || "") ||
        nonces.has(challenge.nonce)) add("CHALLENGE_SET_NONCE_INVALID");
    nonces.add(challenge.nonce);
    const allowed = [...new Set(verifier && (verifier.allowed_attestation_types || ["verification_receipt"]) || [])].sort();
    if (JSON.stringify(challenge.purposes) !== JSON.stringify(allowed)) add("CHALLENGE_SET_PURPOSE_BINDING_INVALID");
  }
  if (verifierIds.size !== expectedVerifierIds.size || [...expectedVerifierIds].some(id => !verifierIds.has(id))) {
    add("CHALLENGE_SET_VERIFIER_POPULATION_INVALID");
  }
  return { valid: codes.length === 0, codes: codes.sort(), valid_until: codes.length === 0 ? challengeSet.expires_at : "none" };
}

module.exports = {
  canonicalDigest,
  challengeSetId,
  challengeSetMatchesOrder,
  createVerifierChallengeSet,
  dispatchBindingFromOrder,
  signingBytes,
  verifyVerifierChallengeSet
};
