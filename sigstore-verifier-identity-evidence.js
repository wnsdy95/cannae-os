#!/usr/bin/env node

const crypto = require("crypto");
const { bundleFromJSON, bundleToJSON } = require("@sigstore/bundle");
const { Verifier, toSignedEntity } = require("@sigstore/verify");
const sigstore = require("sigstore");
const { publicKeyId, strictBase64 } = require("./verification-attestation");
const {
  canonicalJsonBytes,
  sha256,
  trustMaterialFromArtifact,
  verifySigstoreTrustedRoot
} = require("./sigstore-trusted-root");

const SUPPORTED_BUNDLE_MEDIA_TYPES = new Set([
  "application/vnd.dev.sigstore.bundle+json;version=0.2",
  "application/vnd.dev.sigstore.bundle.v0.3+json",
  "application/vnd.dev.sigstore.bundle+json;version=0.3"
]);

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBundle(value) {
  return bundleToJSON(bundleFromJSON(value));
}

function bundleDigest(value) {
  return sha256(canonicalJsonBytes(normalizeBundle(value)));
}

function sigstoreEvidenceDigest(evidence) {
  const copy = JSON.parse(JSON.stringify(evidence));
  delete copy.evidence_sha256;
  return sha256(canonicalJsonBytes(copy));
}

function expectedStatement(evidence) {
  return {
    schema_version: "0.1",
    type: "SigstoreVerifierIdentityBinding",
    evidence_id: evidence.id,
    verifier_id: evidence.verifier_id,
    verifier_key_id: evidence.signatures && evidence.signatures.verifier_key_id,
    certificate_identity_type: evidence.workload_identity && evidence.workload_identity.certificate_identity_type,
    certificate_identity: evidence.workload_identity && evidence.workload_identity.certificate_identity,
    certificate_issuer: evidence.workload_identity && evidence.workload_identity.certificate_issuer,
    trust_root_id: evidence.workload_identity && evidence.workload_identity.trust_root_id,
    trusted_root_sha256: evidence.workload_identity && evidence.workload_identity.trusted_root_sha256,
    repository_binding: evidence.repository_binding,
    purposes: evidence.purposes,
    nonce: evidence.binding_statement && evidence.binding_statement.nonce,
    issued_at: evidence.issued_at,
    expires_at: evidence.expires_at
  };
}

function createSigstoreIdentityBindingStatement(options) {
  const identity = options.verifier.workload_identity;
  return {
    schema_version: "0.1",
    type: "SigstoreVerifierIdentityBinding",
    evidence_id: String(options.evidenceId),
    verifier_id: options.verifier.id,
    verifier_key_id: options.verifier.key_id,
    certificate_identity_type: identity.certificate_identity_type,
    certificate_identity: identity.certificate_identity,
    certificate_issuer: identity.certificate_issuer,
    trust_root_id: identity.trust_root_id,
    trusted_root_sha256: options.trustedRootArtifact.trusted_root_sha256,
    repository_binding: JSON.parse(JSON.stringify(options.repositoryBinding)),
    purposes: [...new Set(options.purposes)].sort(),
    nonce: String(options.nonce),
    issued_at: options.issuedAt,
    expires_at: options.expiresAt
  };
}

function sigstoreIdentityConfigurationIsValid(identity) {
  return Boolean(identity && identity.type === "sigstore_bundle" &&
    ["email", "uri"].includes(identity.certificate_identity_type) &&
    typeof identity.certificate_identity === "string" && identity.certificate_identity.length > 0 &&
    typeof identity.certificate_issuer === "string" && identity.certificate_issuer.length > 0 &&
    typeof identity.trust_root_id === "string" && identity.trust_root_id.length > 0 &&
    SUPPORTED_BUNDLE_MEDIA_TYPES.has(identity.bundle_media_type) &&
    [identity.ctlog_threshold, identity.tlog_threshold, identity.timestamp_threshold]
      .every(value => Number.isInteger(value) && value >= 1 && value <= 5));
}

function validateCreateInputs(options) {
  const verifier = options.verifier;
  const policy = options.trustPolicy;
  const root = options.trustedRootArtifact;
  const identity = verifier && verifier.workload_identity;
  if (!options.evidenceId || !verifier || !policy || !root || !options.repositoryBinding ||
      !Array.isArray(options.purposes) || options.purposes.length === 0) {
    throw new Error("Evidence ID, verifier, policy, trusted root, repository binding, and purposes are required.");
  }
  if (!sigstoreIdentityConfigurationIsValid(identity)) {
    throw new Error("Verifier must declare a complete Sigstore identity with an exact supported bundle media type and nonzero verification thresholds.");
  }
  const rootResult = verifySigstoreTrustedRoot(root);
  if (!rootResult.valid || identity.trust_root_id !== root.id) {
    throw new Error("Verifier Sigstore root is missing, invalid, or does not match policy.");
  }
}

async function createSigstoreVerifierIdentityEvidence(options) {
  validateCreateInputs(options);
  const verifier = options.verifier;
  const identity = verifier.workload_identity;
  const issuedAt = options.issuedAt || new Date().toISOString();
  const expiresAt = options.expiresAt;
  const nonce = String(options.nonce || crypto.randomUUID());
  const issuedTime = timestamp(issuedAt);
  const expiresTime = timestamp(expiresAt);
  if (issuedTime === null || expiresTime === null || expiresTime <= issuedTime) {
    throw new Error("Evidence expiry must be later than its issue time.");
  }
  if (nonce.length < 16 || nonce.length > 256) throw new Error("Evidence nonce must contain 16 to 256 characters.");

  const privateKey = crypto.createPrivateKey(options.verifierPrivateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519" || publicKeyId(crypto.createPublicKey(privateKey)) !== verifier.key_id) {
    throw new Error("Verifier private key must be Ed25519 and match the trust policy.");
  }
  const purposes = [...new Set(options.purposes)].sort();
  const evidence = {
    schema_version: "0.1",
    type: "SigstoreVerifierIdentityEvidence",
    id: String(options.evidenceId),
    verifier_id: verifier.id,
    trust_policy_id: options.trustPolicy.id,
    repository_binding: JSON.parse(JSON.stringify(options.repositoryBinding)),
    purposes,
    workload_identity: {
      type: "sigstore_bundle",
      certificate_identity_type: identity.certificate_identity_type,
      certificate_identity: identity.certificate_identity,
      certificate_issuer: identity.certificate_issuer,
      trust_root_id: identity.trust_root_id,
      trusted_root_sha256: options.trustedRootArtifact.trusted_root_sha256
    },
    binding_statement: null,
    signatures: {
      verifier_key_id: verifier.key_id,
      verifier_algorithm: "ed25519",
      verifier_signature_base64: ""
    },
    sigstore: {
      bundle_media_type: "",
      bundle_sha256: "",
      bundle: null
    },
    evidence_sha256: "",
    issued_at: issuedAt,
    expires_at: expiresAt
  };
  evidence.binding_statement = createSigstoreIdentityBindingStatement({
    evidenceId: evidence.id,
    verifier,
    trustedRootArtifact: options.trustedRootArtifact,
    repositoryBinding: evidence.repository_binding,
    purposes,
    nonce,
    issuedAt,
    expiresAt
  });
  const statementBytes = canonicalJsonBytes(evidence.binding_statement);
  evidence.signatures.verifier_signature_base64 = crypto.sign(null, statementBytes, privateKey).toString("base64");
  const rawBundle = options.bundle || await sigstore.sign(statementBytes, options.signOptions || {});
  const bundle = normalizeBundle(rawBundle);
  evidence.sigstore = {
    bundle_media_type: bundle.mediaType,
    bundle_sha256: sha256(canonicalJsonBytes(bundle)),
    bundle
  };
  evidence.evidence_sha256 = sigstoreEvidenceDigest(evidence);
  return evidence;
}

function certificateFromBundle(bundle) {
  const content = bundle.verificationMaterial && bundle.verificationMaterial.content;
  if (!content) return null;
  if (content.$case === "certificate") return new crypto.X509Certificate(content.certificate.rawBytes);
  if (content.$case === "x509CertificateChain" && content.x509CertificateChain.certificates.length > 0) {
    return new crypto.X509Certificate(content.x509CertificateChain.certificates[0].rawBytes);
  }
  return null;
}

function exactPattern(value) {
  return new RegExp(`^${String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "u");
}

function verifySigstoreVerifierIdentityEvidence(options) {
  const evidence = options.evidence;
  const policy = options.trustPolicy;
  const verifier = options.verifier;
  const root = options.trustedRootArtifact;
  const repository = options.repository;
  const evaluatedAt = options.evaluatedAt || new Date().toISOString();
  const evaluatedTime = timestamp(evaluatedAt);
  const codes = [];
  if (!evidence || !policy || !verifier || !root || !repository || evaluatedTime === null) {
    return { valid: false, codes: ["SIGSTORE_IDENTITY_VERIFICATION_INPUT_INVALID"] };
  }
  const identity = verifier.workload_identity || {};
  if (evidence.type !== "SigstoreVerifierIdentityEvidence" || identity.type !== "sigstore_bundle" ||
      !evidence.workload_identity || !evidence.binding_statement || !evidence.signatures || !evidence.sigstore) {
    return { valid: false, codes: ["SIGSTORE_IDENTITY_EVIDENCE_STRUCTURE_INVALID"] };
  }
  const identityConfigurationValid = sigstoreIdentityConfigurationIsValid(identity);
  if (!identityConfigurationValid) addCode(codes, "SIGSTORE_IDENTITY_POLICY_CONFIGURATION_INVALID");

  const issuedTime = timestamp(evidence.issued_at);
  const expiresTime = timestamp(evidence.expires_at);
  if (issuedTime === null || expiresTime === null || expiresTime <= issuedTime || evaluatedTime < issuedTime || evaluatedTime >= expiresTime) {
    addCode(codes, "SIGSTORE_IDENTITY_EVIDENCE_NOT_ACTIVE");
  }
  const maxAge = policy.identity_assurance && policy.identity_assurance.max_evidence_age_seconds;
  if (!Number.isInteger(maxAge) || issuedTime === null || evaluatedTime >= issuedTime + maxAge * 1000) {
    addCode(codes, "SIGSTORE_IDENTITY_EVIDENCE_STALE");
  }
  if (evidence.evidence_sha256 !== sigstoreEvidenceDigest(evidence)) addCode(codes, "SIGSTORE_IDENTITY_EVIDENCE_DIGEST_MISMATCH");
  if (evidence.verifier_id !== verifier.id || evidence.trust_policy_id !== policy.id) {
    addCode(codes, "SIGSTORE_IDENTITY_POLICY_BINDING_MISMATCH");
  }
  if (!evidence.repository_binding || evidence.repository_binding.repository_key !== repository.key ||
      evidence.repository_binding.identity_fingerprint !== repository.identity_fingerprint) {
    addCode(codes, "SIGSTORE_IDENTITY_REPOSITORY_BINDING_MISMATCH");
  }
  if (!policy.repository_binding || policy.repository_binding.repository_key !== repository.key ||
      policy.repository_binding.identity_fingerprint !== repository.identity_fingerprint ||
      !Array.isArray(verifier.allowed_repository_keys) || !verifier.allowed_repository_keys.includes(repository.key)) {
    addCode(codes, "SIGSTORE_IDENTITY_POLICY_REPOSITORY_MISMATCH");
  }
  const policyStart = timestamp(policy.created_at);
  const policyEnd = timestamp(policy.expires_at);
  const verifierStart = timestamp(verifier.valid_from);
  const verifierEnd = timestamp(verifier.valid_until);
  if (policyStart === null || policyEnd === null || verifierStart === null || verifierEnd === null ||
      evaluatedTime < policyStart || evaluatedTime >= policyEnd || evaluatedTime < verifierStart ||
      evaluatedTime >= verifierEnd || verifier.status !== "active") {
    addCode(codes, "SIGSTORE_IDENTITY_POLICY_NOT_ACTIVE");
  }
  if (!canonicalJsonBytes(evidence.binding_statement).equals(canonicalJsonBytes(expectedStatement(evidence)))) {
    addCode(codes, "SIGSTORE_IDENTITY_STATEMENT_BINDING_MISMATCH");
  }
  const evidenceIdentity = evidence.workload_identity;
  for (const field of ["certificate_identity_type", "certificate_identity", "certificate_issuer", "trust_root_id"]) {
    if (evidenceIdentity[field] !== identity[field]) addCode(codes, "SIGSTORE_IDENTITY_POLICY_BINDING_MISMATCH");
  }
  if (evidenceIdentity.trusted_root_sha256 !== root.trusted_root_sha256 || identity.trust_root_id !== root.id) {
    addCode(codes, "SIGSTORE_IDENTITY_TRUST_ROOT_BINDING_MISMATCH");
  }
  const allowedPurposes = verifier.allowed_attestation_types || ["verification_receipt"];
  if (!Array.isArray(evidence.purposes) || evidence.purposes.length === 0 ||
      evidence.purposes.some(purpose => !allowedPurposes.includes(purpose))) {
    addCode(codes, "SIGSTORE_IDENTITY_PURPOSE_NOT_AUTHORIZED");
  }

  const rootResult = verifySigstoreTrustedRoot(root);
  if (!rootResult.valid) addCode(codes, "SIGSTORE_IDENTITY_TRUST_ROOT_INVALID");
  const rootRetrievedTime = root.source && timestamp(root.source.retrieved_at);
  const maxRootAge = policy.identity_assurance && policy.identity_assurance.max_trusted_root_age_seconds;
  if (!Number.isInteger(maxRootAge) || rootRetrievedTime === null || evaluatedTime < rootRetrievedTime ||
      evaluatedTime >= rootRetrievedTime + maxRootAge * 1000) {
    addCode(codes, "SIGSTORE_IDENTITY_TRUST_ROOT_STALE");
  }

  const statementBytes = canonicalJsonBytes(evidence.binding_statement);
  const staticSignature = strictBase64(evidence.signatures.verifier_signature_base64);
  try {
    const verifierKey = crypto.createPublicKey(verifier.public_key_pem);
    if (verifierKey.asymmetricKeyType !== "ed25519" || publicKeyId(verifierKey) !== verifier.key_id ||
        evidence.signatures.verifier_key_id !== verifier.key_id || evidence.signatures.verifier_algorithm !== "ed25519" ||
        !staticSignature || !crypto.verify(null, statementBytes, verifierKey, staticSignature)) {
      addCode(codes, "SIGSTORE_IDENTITY_VERIFIER_SIGNATURE_INVALID");
    }
  } catch (error) {
    addCode(codes, "SIGSTORE_IDENTITY_VERIFIER_SIGNATURE_INVALID");
  }

  let parsedBundle = null;
  let certificate = null;
  let signer = null;
  let transparencyLogIds = [];
  try {
    parsedBundle = bundleFromJSON(evidence.sigstore.bundle);
    const normalized = bundleToJSON(parsedBundle);
    if (!canonicalJsonBytes(normalized).equals(canonicalJsonBytes(evidence.sigstore.bundle))) {
      addCode(codes, "SIGSTORE_IDENTITY_BUNDLE_NOT_NORMALIZED");
    }
    if (!SUPPORTED_BUNDLE_MEDIA_TYPES.has(normalized.mediaType) || evidence.sigstore.bundle_media_type !== normalized.mediaType ||
        identity.bundle_media_type !== normalized.mediaType) {
      addCode(codes, "SIGSTORE_IDENTITY_BUNDLE_MEDIA_TYPE_INVALID");
    }
    if (evidence.sigstore.bundle_sha256 !== sha256(canonicalJsonBytes(normalized))) {
      addCode(codes, "SIGSTORE_IDENTITY_BUNDLE_DIGEST_MISMATCH");
    }
    if (parsedBundle.content.$case !== "messageSignature") {
      addCode(codes, "SIGSTORE_IDENTITY_BUNDLE_CONTENT_INVALID");
    }
    certificate = certificateFromBundle(parsedBundle);
    if (!certificate) addCode(codes, "SIGSTORE_IDENTITY_CERTIFICATE_MISSING");
    const entries = parsedBundle.verificationMaterial.tlogEntries || [];
    transparencyLogIds = [...new Set(entries.map(entry => Buffer.from(entry.logId.keyId).toString("hex")))].sort();
    if (rootResult.valid && identityConfigurationValid && parsedBundle.content.$case === "messageSignature") {
      const bundleVerifier = new Verifier(trustMaterialFromArtifact(root), {
        ctlogThreshold: identity.ctlog_threshold,
        tlogThreshold: identity.tlog_threshold,
        timestampThreshold: identity.timestamp_threshold
      });
      signer = bundleVerifier.verify(toSignedEntity(parsedBundle, statementBytes), {
        subjectAlternativeName: exactPattern(identity.certificate_identity),
        extensions: { issuer: identity.certificate_issuer }
      });
    }
  } catch (error) {
    addCode(codes, "SIGSTORE_IDENTITY_BUNDLE_VERIFICATION_FAILED");
  }

  if (signer && (signer.identity.subjectAlternativeName !== identity.certificate_identity ||
      signer.identity.extensions.issuer !== identity.certificate_issuer)) {
    addCode(codes, "SIGSTORE_IDENTITY_CERTIFICATE_IDENTITY_MISMATCH");
  }
  let certificateSha256 = "none";
  let certificateValidUntil = null;
  if (certificate) {
    certificateSha256 = sha256(certificate.raw);
    const expectedSan = `${identity.certificate_identity_type === "uri" ? "URI" : "email"}:${identity.certificate_identity}`;
    if (certificate.subjectAltName !== expectedSan) {
      addCode(codes, "SIGSTORE_IDENTITY_CERTIFICATE_SAN_TYPE_MISMATCH");
    }
    const validFrom = certificate.validFromDate.getTime();
    certificateValidUntil = certificate.validToDate.getTime();
    if (issuedTime === null || issuedTime < validFrom - 60000 || issuedTime >= certificateValidUntil ||
        evaluatedTime < validFrom || evaluatedTime >= certificateValidUntil ||
        expiresTime === null || expiresTime > certificateValidUntil) {
      addCode(codes, "SIGSTORE_IDENTITY_CERTIFICATE_NOT_ACTIVE");
    }
  }

  const rootFreshUntil = Number.isInteger(maxRootAge) && rootRetrievedTime !== null
    ? rootRetrievedTime + maxRootAge * 1000
    : null;
  const evidenceFreshUntil = Number.isInteger(maxAge) && issuedTime !== null ? issuedTime + maxAge * 1000 : null;
  const validity = [expiresTime, evidenceFreshUntil, certificateValidUntil, rootFreshUntil,
    timestamp(verifier.valid_until), timestamp(policy.expires_at)]
    .filter(value => Number.isFinite(value) && value > evaluatedTime);
  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    verifier_id: verifier.id,
    identity_provider: "sigstore_bundle",
    identity: identity.certificate_identity,
    identity_authority: identity.certificate_issuer,
    trust_root_id: identity.trust_root_id,
    certificate_sha256: certificateSha256,
    transparency_log_ids: transparencyLogIds,
    purposes: Array.isArray(evidence.purposes) ? [...evidence.purposes].sort() : [],
    issued_at: evidence.issued_at,
    valid_until: validity.length > 0 ? new Date(Math.min(...validity)).toISOString() : "none"
  };
}

module.exports = {
  SUPPORTED_BUNDLE_MEDIA_TYPES,
  bundleDigest,
  createSigstoreIdentityBindingStatement,
  createSigstoreVerifierIdentityEvidence,
  expectedStatement,
  normalizeBundle,
  sigstoreIdentityConfigurationIsValid,
  sigstoreEvidenceDigest,
  verifySigstoreVerifierIdentityEvidence
};
