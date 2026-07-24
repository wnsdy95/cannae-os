#!/usr/bin/env node

const crypto = require("crypto");
const { publicKeyId, strictBase64 } = require("./verification-attestation");
const {
  canonicalJsonBytes,
  certificateSha256,
  parseSpiffeId
} = require("./verifier-identity-evidence");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function objectDigest(value) {
  return sha256(Buffer.concat([canonicalJsonBytes(value), Buffer.from("\n")]));
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function artifactRefKind(ref) {
  if (!ref || typeof ref !== "object") return "malformed";
  const values = [ref.artifact_id, ref.relative_path, ref.sha256];
  if (values.every(value => value === "none")) return "none";
  if (values.some(value => value === "none")) return "malformed";
  return "concrete";
}

function sameRef(left, right) {
  return Boolean(left && right &&
    left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path &&
    left.sha256 === right.sha256);
}

function sameObject(left, right) {
  return Boolean(left && right &&
    canonicalJsonBytes(left).equals(canonicalJsonBytes(right)));
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

function gatewayChallengeDigest(challenge) {
  return signedArtifactDigest(challenge, "challenge_sha256");
}

function gatewayEvidenceDigest(evidence) {
  return signedArtifactDigest(evidence, "evidence_sha256");
}

function signArtifact(payload, privateKeyPem, digestField) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Gateway identity artifacts require an Ed25519 signing key.");
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

function signGatewayChallenge(challenge, privateKeyPem) {
  return signArtifact(challenge, privateKeyPem, "challenge_sha256");
}

function signGatewayPrincipalEvidence(evidence, privateKeyPem) {
  return signArtifact(evidence, privateKeyPem, "evidence_sha256");
}

function verifySignedArtifact(payload, publicKeyPem, digestField, expectedDigest, codes, prefix) {
  if (signedArtifactDigest(payload, digestField) !== expectedDigest) {
    addCode(codes, `${prefix}_DIGEST_MISMATCH`);
  }
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const signature = strictBase64(payload.signature && payload.signature.signature_base64);
    if (publicKey.asymmetricKeyType !== "ed25519" ||
        publicKeyId(publicKey) !== (payload.signature && payload.signature.key_id) ||
        (payload.signature && payload.signature.algorithm) !== "ed25519" ||
        !signature ||
        !crypto.verify(
          null,
          unsignedArtifactBytes(payload, digestField),
          publicKey,
          signature
        )) {
      addCode(codes, `${prefix}_SIGNATURE_INVALID`);
    }
  } catch (error) {
    addCode(codes, `${prefix}_SIGNATURE_INVALID`);
  }
}

function spiffeTrustDomain(spiffeId) {
  try {
    const parsed = new URL(spiffeId);
    return parsed.protocol === "spiffe:" ? parsed.hostname : null;
  } catch (error) {
    return null;
  }
}

function pemFromRaw(raw) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw || []);
  if (bytes.length === 0) throw new Error("Certificate bytes are required.");
  const body = bytes.toString("base64").match(/.{1,64}/g).join("\n");
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

function verifyCertificateChain(options) {
  const { evidence, trustedRoot, evaluatedTime, codes } = options;
  const observedTime = timestamp(evidence.observed_at);
  const expiresTime = timestamp(evidence.expires_at);
  let leaf;
  let root;
  let intermediates;
  try {
    leaf = new crypto.X509Certificate(evidence.transport.leaf_certificate_pem);
    root = new crypto.X509Certificate(trustedRoot.certificate_pem);
    intermediates = (evidence.transport.certificate_chain_pem || [])
      .map(item => new crypto.X509Certificate(item));
  } catch (error) {
    addCode(codes, "GATEWAY_IDENTITY_CERTIFICATE_PARSE_FAILED");
    return null;
  }

  if (leaf.ca || root.ca !== true || intermediates.some(item => item.ca !== true)) {
    addCode(codes, "GATEWAY_IDENTITY_CERTIFICATE_ROLE_INVALID");
  }
  if (certificateSha256(root) !== trustedRoot.certificate_sha256) {
    addCode(codes, "GATEWAY_IDENTITY_TRUST_ROOT_DIGEST_MISMATCH");
  }
  if (!root.verify(root.publicKey)) {
    addCode(codes, "GATEWAY_IDENTITY_TRUST_ROOT_SIGNATURE_INVALID");
  }

  const chain = [leaf, ...intermediates, root];
  if (new Set(chain.map(certificateSha256)).size !== chain.length) {
    addCode(codes, "GATEWAY_IDENTITY_CERTIFICATE_CHAIN_INVALID");
  }
  for (let index = 0; index < chain.length - 1; index += 1) {
    if (!chain[index].checkIssued(chain[index + 1]) ||
        !chain[index].verify(chain[index + 1].publicKey)) {
      addCode(codes, "GATEWAY_IDENTITY_CERTIFICATE_CHAIN_INVALID");
      break;
    }
  }
  for (const certificate of chain) {
    const validFrom = certificate.validFromDate.getTime();
    const validUntil = certificate.validToDate.getTime();
    if (observedTime === null || evaluatedTime === null ||
        observedTime < validFrom || observedTime >= validUntil ||
        evaluatedTime < validFrom || evaluatedTime >= validUntil) {
      addCode(codes, "GATEWAY_IDENTITY_CERTIFICATE_NOT_ACTIVE");
    }
  }
  if (expiresTime !== null &&
      expiresTime > Math.min(...chain.map(item => item.validToDate.getTime()))) {
    addCode(codes, "GATEWAY_IDENTITY_EVIDENCE_EXCEEDS_CERTIFICATE_VALIDITY");
  }

  const spiffeId = parseSpiffeId(leaf);
  if (!spiffeId) addCode(codes, "GATEWAY_IDENTITY_SPIFFE_SAN_INVALID");
  return {
    leaf,
    spiffeId,
    validUntil: Math.min(...chain.map(item => item.validToDate.getTime()))
  };
}

function verifyGatewayIdentityBundle(options) {
  const {
    policy,
    challenge,
    evidence,
    request,
    evaluatedAt = new Date().toISOString()
  } = options || {};
  const codes = [];
  const evaluatedTime = timestamp(evaluatedAt);
  if (!policy || !challenge || !evidence || !request || evaluatedTime === null) {
    return { valid: false, codes: ["GATEWAY_IDENTITY_VERIFICATION_INPUT_INVALID"] };
  }

  const policyStart = timestamp(policy.valid_from);
  const policyEnd = timestamp(policy.expires_at);
  const challengeStart = timestamp(challenge.issued_at);
  const challengeEnd = timestamp(challenge.expires_at);
  const evidenceStart = timestamp(evidence.observed_at);
  const evidenceEnd = timestamp(evidence.expires_at);
  if (policyStart === null || policyEnd === null || policyStart >= policyEnd ||
      evaluatedTime < policyStart || evaluatedTime >= policyEnd) {
    addCode(codes, "GATEWAY_IDENTITY_POLICY_NOT_ACTIVE");
  }
  if (challengeStart === null || challengeEnd === null ||
      challengeStart >= challengeEnd || evaluatedTime < challengeStart ||
      evaluatedTime >= challengeEnd ||
      challengeEnd > challengeStart + Number(policy.challenge_ttl_seconds) * 1000) {
    addCode(codes, "GATEWAY_IDENTITY_CHALLENGE_NOT_ACTIVE");
  }
  if (evidenceStart === null || evidenceEnd === null ||
      evidenceStart >= evidenceEnd || evaluatedTime < evidenceStart ||
      evaluatedTime >= evidenceEnd ||
      evidenceEnd > evidenceStart + Number(policy.evidence_ttl_seconds) * 1000 ||
      challengeStart === null || challengeEnd === null ||
      evidenceStart < challengeStart || evidenceStart >= challengeEnd ||
      evidenceEnd > challengeEnd || evidenceEnd > policyEnd) {
    addCode(codes, "GATEWAY_IDENTITY_EVIDENCE_NOT_ACTIVE");
  }

  const adapterProfile = policy.adapter_profile || {};
  verifySignedArtifact(
    challenge,
    adapterProfile.signing_public_key_pem,
    "challenge_sha256",
    challenge.challenge_sha256,
    codes,
    "GATEWAY_IDENTITY_CHALLENGE"
  );
  verifySignedArtifact(
    evidence,
    adapterProfile.signing_public_key_pem,
    "evidence_sha256",
    evidence.evidence_sha256,
    codes,
    "GATEWAY_IDENTITY_EVIDENCE"
  );
  try {
    const adapterKey = crypto.createPublicKey(adapterProfile.signing_public_key_pem);
    if (adapterKey.asymmetricKeyType !== "ed25519" ||
        publicKeyId(adapterKey) !== adapterProfile.signing_key_id) {
      addCode(codes, "GATEWAY_IDENTITY_POLICY_SIGNING_KEY_INVALID");
    }
  } catch (error) {
    addCode(codes, "GATEWAY_IDENTITY_POLICY_SIGNING_KEY_INVALID");
  }

  const refs = [
    request.identity_policy_ref,
    request.identity_challenge_ref,
    request.principal_evidence_ref
  ];
  if (refs.some(ref => artifactRefKind(ref) !== "concrete") ||
      request.identity_policy_ref.artifact_id !== policy.id ||
      request.identity_challenge_ref.artifact_id !== challenge.id ||
      request.principal_evidence_ref.artifact_id !== evidence.id ||
      !sameRef(challenge.identity_policy_ref, request.identity_policy_ref) ||
      !sameRef(evidence.identity_policy_ref, request.identity_policy_ref) ||
      !sameRef(evidence.identity_challenge_ref, request.identity_challenge_ref)) {
    addCode(codes, "GATEWAY_IDENTITY_ARTIFACT_REF_MISMATCH");
  }

  const scalarBindings = [
    ["transaction_id", "GATEWAY_IDENTITY_TRANSACTION_MISMATCH"],
    ["mission_id", "GATEWAY_IDENTITY_MISSION_MISMATCH"],
    ["wave_id", "GATEWAY_IDENTITY_WAVE_MISMATCH"],
    ["agent_id", "GATEWAY_IDENTITY_AGENT_MISMATCH"],
    ["provider", "GATEWAY_IDENTITY_PROVIDER_MISMATCH"]
  ];
  for (const [field, code] of scalarBindings) {
    if (challenge[field] !== request[field] || evidence[field] !== request[field]) {
      addCode(codes, code);
    }
  }
  const principal = request.authenticated_principal || {};
  const expectedSession = {
    session_id: principal.session_id,
    provider_agent_id: principal.provider_agent_id
  };
  if (!sameObject(challenge.session_binding, expectedSession) ||
      !sameObject(evidence.session_binding, expectedSession)) {
    addCode(codes, "GATEWAY_IDENTITY_SESSION_MISMATCH");
  }
  if (!sameObject(policy.repository_binding, request.repository_binding) ||
      !sameObject(challenge.repository_binding, request.repository_binding) ||
      !sameObject(evidence.repository_binding, request.repository_binding)) {
    addCode(codes, "GATEWAY_IDENTITY_REPOSITORY_MISMATCH");
  }
  if (!sameObject(policy.gateway, request.gateway) ||
      challenge.gateway_binding_sha256 !== objectDigest(request.gateway) ||
      evidence.gateway_binding_sha256 !== objectDigest(request.gateway)) {
    addCode(codes, "GATEWAY_IDENTITY_GATEWAY_MISMATCH");
  }
  if (evidence.principal_binding_sha256 !== objectDigest(principal)) {
    addCode(codes, "GATEWAY_IDENTITY_PRINCIPAL_BINDING_MISMATCH");
  }

  const selectedPrincipals = (policy.principals || []).filter(item =>
    item.id === evidence.principal_id &&
    item.agent_id === request.agent_id &&
    item.provider === request.provider);
  if (selectedPrincipals.length !== 1) {
    addCode(codes, "GATEWAY_IDENTITY_PRINCIPAL_NOT_AUTHORIZED");
  }
  const selectedPrincipal = selectedPrincipals[0] || {};
  if ((policy.revocations && policy.revocations.principal_ids || [])
    .includes(selectedPrincipal.id)) {
    addCode(codes, "GATEWAY_IDENTITY_PRINCIPAL_REVOKED");
  }
  const roots = (policy.trusted_x509_roots || [])
    .filter(item => item.id === selectedPrincipal.trust_root_id);
  if (roots.length !== 1 ||
      evidence.transport.trust_root_id !== selectedPrincipal.trust_root_id) {
    addCode(codes, "GATEWAY_IDENTITY_TRUST_ROOT_MISMATCH");
  }
  const trustedRoot = roots[0];
  const certificateResult = trustedRoot
    ? verifyCertificateChain({ evidence, trustedRoot, evaluatedTime, codes })
    : null;
  const clientCertificateSha256 = certificateResult
    ? certificateSha256(certificateResult.leaf)
    : "none";
  if ((policy.revocations && policy.revocations.certificate_sha256 || [])
    .includes(clientCertificateSha256)) {
    addCode(codes, "GATEWAY_IDENTITY_CERTIFICATE_REVOKED");
  }
  if (!certificateResult ||
      certificateResult.spiffeId !== selectedPrincipal.spiffe_id ||
      evidence.transport.spiffe_id !== selectedPrincipal.spiffe_id ||
      !trustedRoot ||
      spiffeTrustDomain(selectedPrincipal.spiffe_id) !== trustedRoot.trust_domain ||
      timestamp(trustedRoot.valid_until) === null ||
      evaluatedTime >= timestamp(trustedRoot.valid_until)) {
    addCode(codes, "GATEWAY_IDENTITY_SPIFFE_BINDING_MISMATCH");
  }
  if (evidence.transport.client_certificate_sha256 !== clientCertificateSha256) {
    addCode(codes, "GATEWAY_IDENTITY_CLIENT_CERTIFICATE_MISMATCH");
  }

  const transportProfile = policy.transport_profile || {};
  const transport = evidence.transport || {};
  if (transport.mode !== transportProfile.transport ||
      transport.tls_version !== "TLSv1.3" ||
      transport.peer_authorized !== true ||
      transport.authorization_error !== "none" ||
      transport.server_certificate_sha256 !==
        transportProfile.server_certificate_sha256) {
    addCode(codes, "GATEWAY_IDENTITY_TRANSPORT_MISMATCH");
  }
  const adapter = evidence.adapter || {};
  for (const field of [
    "adapter_id",
    "adapter_version",
    "adapter_sha256",
    "runtime_sha256",
    "configuration_sha256"
  ]) {
    if (adapter[field] !== adapterProfile[field]) {
      addCode(codes, "GATEWAY_IDENTITY_ADAPTER_MEASUREMENT_MISMATCH");
      break;
    }
  }

  const expectedIssuer = trustedRoot ? `spiffe://${trustedRoot.trust_domain}` : "unknown";
  if (principal.authentication_method !== "mtls" ||
      principal.issuer !== expectedIssuer ||
      principal.subject !== selectedPrincipal.spiffe_id ||
      principal.audience !== request.gateway.audience ||
      principal.credential_sha256 !== transport.client_certificate_sha256 ||
      principal.proof_sha256 !== transport.tls_exporter_sha256 ||
      principal.proof_verified !== true ||
      principal.authenticated_at !== evidence.observed_at ||
      principal.expires_at !== evidence.expires_at) {
    addCode(codes, "GATEWAY_IDENTITY_PRINCIPAL_PROJECTION_MISMATCH");
  }

  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    principal_id: evidence.principal_id || "unknown",
    spiffe_id: certificateResult && certificateResult.spiffeId || "unknown",
    client_certificate_sha256: clientCertificateSha256,
    tls_exporter_sha256: transport.tls_exporter_sha256 || "none",
    verified_principal_sha256: objectDigest(principal),
    valid_until: evidence.expires_at || "none"
  };
}

module.exports = {
  artifactRefKind,
  gatewayChallengeDigest,
  gatewayEvidenceDigest,
  objectDigest,
  pemFromRaw,
  sameRef,
  signGatewayChallenge,
  signGatewayPrincipalEvidence,
  unsignedArtifactBytes,
  verifyGatewayIdentityBundle
};
