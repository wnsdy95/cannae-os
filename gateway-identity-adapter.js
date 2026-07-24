#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const tls = require("tls");
const {
  resolveRepository,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const {
  acquireRepositoryLease,
  releaseRepositoryLease
} = require("./repository-lease");
const { publicKeyId } = require("./verification-attestation");
const {
  objectDigest,
  pemFromRaw,
  sameRef,
  signGatewayChallenge,
  signGatewayPrincipalEvidence,
  verifyGatewayIdentityBundle
} = require("./gateway-identity-evidence");
const {
  certificateSha256,
  parseSpiffeId
} = require("./verifier-identity-evidence");
const { validatePayload } = require("./validator-cli-prototype/validate");

const KINDS = Object.freeze({
  policy: "gateway-identity-policies",
  challenge: "gateway-identity-challenges",
  evidence: "gateway-principal-evidence",
  request: "tool-gateway-requests"
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`);
  return parsed;
}

function assertValid(payload, type, label) {
  const validation = validatePayload(payload, type);
  const failures = validation.issues.filter(item =>
    item.severity === "error" || item.severity === "critical");
  if (failures.length > 0) {
    throw new Error(`${label} failed validation: ${unique(failures.map(item => item.code)).join(", ")}`);
  }
}

function authority() {
  return {
    human_final_decision_authority: "USER",
    self_approval_prohibited: true,
    production_execution_authorized: false,
    release_authorized: false
  };
}

function artifactRef(result, artifactId) {
  return {
    artifact_id: artifactId,
    relative_path: result.relative_path,
    sha256: result.sha256
  };
}

function storeView(options) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(
    options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")
  );
  const verification = verifyRepositoryArtifacts({
    repositoryPath: repository.root,
    artifactRoot
  });
  if (!verification.valid) {
    throw new Error(
      `Repository artifact store is invalid: ${verification.issues.map(item => item.code).join(", ")}`
    );
  }
  const namespacePath = path.join(artifactRoot, "repositories", repository.key);
  const manifest = JSON.parse(fs.readFileSync(path.join(namespacePath, "manifest.json"), "utf8"));
  return { artifactRoot, manifest, namespacePath, repository, verification };
}

function safeArtifactPath(view, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]+/).includes("..")) {
    throw new Error("Artifact reference path is unsafe.");
  }
  const candidate = path.resolve(view.artifactRoot, relativePath);
  if (candidate !== view.artifactRoot &&
      !candidate.startsWith(`${view.artifactRoot}${path.sep}`)) {
    throw new Error("Artifact reference resolves outside the artifact root.");
  }
  return candidate;
}

function loadEntry(view, entry) {
  const bytes = fs.readFileSync(safeArtifactPath(view, entry.relative_path));
  if (sha256(bytes) !== entry.sha256) {
    throw new Error(`Artifact bytes changed: ${entry.relative_path}`);
  }
  return JSON.parse(bytes.toString("utf8"));
}

function listArtifacts(view, kind) {
  return (view.manifest.artifacts || [])
    .filter(entry => !kind || entry.kind === kind)
    .map(entry => ({
      entry,
      payload: loadEntry(view, entry),
      ref: {
        artifact_id: entry.artifact_id,
        relative_path: entry.relative_path,
        sha256: entry.sha256
      }
    }));
}

function loadArtifactRef(view, ref, type) {
  const matches = (view.manifest.artifacts || []).filter(entry =>
    ref &&
    entry.artifact_id === ref.artifact_id &&
    entry.relative_path === ref.relative_path &&
    entry.sha256 === ref.sha256);
  if (matches.length !== 1) {
    throw new Error(`Artifact reference is not uniquely retained: ${ref && ref.artifact_id || "missing"}`);
  }
  const payload = loadEntry(view, matches[0]);
  assertValid(payload, type, type);
  return {
    entry: matches[0],
    payload,
    ref: clone(ref)
  };
}

function writeJsonArtifact(options, descriptor) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(
    options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")
  );
  const result = writeRepositoryArtifact({
    repositoryPath: repository.root,
    artifactRoot,
    missionId: descriptor.missionId,
    waveId: descriptor.waveId,
    kind: descriptor.kind,
    artifactId: descriptor.artifactId,
    payload: descriptor.payload,
    createdAt: descriptor.createdAt
  });
  return { result, ref: artifactRef(result, descriptor.artifactId) };
}

function withIdentityLock(options, operation) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(
    options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")
  );
  const lockRoot = path.join(
    artifactRoot,
    "repositories",
    repository.key,
    ".gateway-identity-adapter"
  );
  const lease = acquireRepositoryLease(lockRoot, {
    leaseTimeoutMs: options.identityLockTimeoutMs || 5000,
    leaseTtlMs: options.identityLockTtlMs || 30000
  });
  try {
    return operation();
  } finally {
    releaseRepositoryLease(lease);
  }
}

function assertRepositoryBinding(repository, binding) {
  if (!binding ||
      binding.repository_key !== repository.key ||
      binding.identity_fingerprint !== repository.identity_fingerprint) {
    throw new Error("Gateway identity artifact does not match the target repository.");
  }
}

function assertAdapterPrivateKey(policy, privateKeyPem) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const keyId = publicKeyId(crypto.createPublicKey(privateKey));
  if (privateKey.asymmetricKeyType !== "ed25519" ||
      keyId !== policy.adapter_profile.signing_key_id) {
    throw new Error("Gateway adapter private key does not match the identity policy.");
  }
  return privateKey;
}

function deterministicId(prefix, ...parts) {
  return `${prefix}-${sha256(Buffer.from(parts.join(":"))).slice(0, 24)}`;
}

function persistGatewayIdentityPolicy(options, policy) {
  assertValid(policy, "gateway-identity-policy", "Gateway identity policy");
  const repository = resolveRepository(options.repository);
  assertRepositoryBinding(repository, policy.repository_binding);
  const written = writeJsonArtifact(options, {
    missionId: options.missionId,
    waveId: options.waveId,
    kind: KINDS.policy,
    artifactId: policy.id,
    payload: policy,
    createdAt: policy.valid_from
  });
  return {
    policy: clone(policy),
    policy_ref: written.ref,
    production_execution_authorized: false,
    release_authorized: false
  };
}

function activePolicy(view, ref, evaluatedAt) {
  const record = loadArtifactRef(view, ref, "gateway-identity-policy");
  assertRepositoryBinding(view.repository, record.payload.repository_binding);
  const now = timestamp(evaluatedAt, "Gateway identity evaluation time");
  if (now < timestamp(record.payload.valid_from, "Policy valid_from") ||
      now >= timestamp(record.payload.expires_at, "Policy expires_at")) {
    throw new Error("Gateway identity policy is not active.");
  }
  return record;
}

function issueGatewayIdentityChallengeUnlocked(options, descriptor) {
  const issuedAt = options.now || new Date().toISOString();
  const view = storeView(options);
  const policyRecord = activePolicy(view, descriptor.identityPolicyRef, issuedAt);
  const policy = policyRecord.payload;
  assertAdapterPrivateKey(policy, options.adapterPrivateKeyPem);
  const matchingPrincipals = policy.principals.filter(item =>
    item.agent_id === descriptor.agentId && item.provider === descriptor.provider);
  if (matchingPrincipals.length !== 1 ||
      policy.revocations.principal_ids.includes(matchingPrincipals[0].id)) {
    throw new Error("Gateway identity policy does not authorize this mission principal.");
  }
  const existing = listArtifacts(view, KINDS.challenge)
    .filter(item => item.payload.transaction_id === descriptor.transactionId);
  if (existing.length > 0) {
    throw new Error("A gateway identity challenge already exists for this transaction.");
  }
  const issuedTime = timestamp(issuedAt, "Challenge issued_at");
  const expiresTime = Math.min(
    issuedTime + policy.challenge_ttl_seconds * 1000,
    timestamp(policy.expires_at, "Policy expires_at")
  );
  if (expiresTime <= issuedTime) throw new Error("Gateway identity policy cannot issue a live challenge.");
  const nonce = crypto.randomBytes(32).toString("hex");
  const challenge = signGatewayChallenge({
    schema_version: "0.1",
    type: "GatewayIdentityChallenge",
    id: descriptor.challengeId || deterministicId(
      "GIC",
      descriptor.transactionId,
      nonce
    ),
    identity_policy_ref: clone(policyRecord.ref),
    transaction_id: descriptor.transactionId,
    mission_id: descriptor.missionId,
    wave_id: descriptor.waveId,
    agent_id: descriptor.agentId,
    provider: descriptor.provider,
    session_binding: {
      session_id: descriptor.sessionId,
      provider_agent_id: descriptor.providerAgentId
    },
    gateway_binding_sha256: objectDigest(policy.gateway),
    repository_binding: clone(policy.repository_binding),
    nonce,
    issued_at: issuedAt,
    expires_at: new Date(expiresTime).toISOString(),
    authority: authority()
  }, options.adapterPrivateKeyPem);
  assertValid(challenge, "gateway-identity-challenge", "Gateway identity challenge");
  const written = writeJsonArtifact(options, {
    missionId: challenge.mission_id,
    waveId: challenge.wave_id,
    kind: KINDS.challenge,
    artifactId: challenge.id,
    payload: challenge,
    createdAt: challenge.issued_at
  });
  return {
    challenge,
    challenge_ref: written.ref,
    production_execution_authorized: false,
    release_authorized: false
  };
}

function issueGatewayIdentityChallenge(options, descriptor) {
  return withIdentityLock(options, () =>
    issueGatewayIdentityChallengeUnlocked(options, descriptor));
}

function peerCertificateChain(socket) {
  const certificates = [];
  let current = socket.getPeerCertificate(true);
  const seen = new Set();
  while (current && current.raw) {
    const certificate = new crypto.X509Certificate(current.raw);
    const digest = certificateSha256(certificate);
    if (seen.has(digest)) break;
    seen.add(digest);
    certificates.push(certificate);
    if (!current.issuerCertificate || !current.issuerCertificate.raw) break;
    current = current.issuerCertificate;
  }
  return certificates;
}

function observeMutualTlsSocket(socket, policy) {
  if (!(socket instanceof tls.TLSSocket) || socket.encrypted !== true) {
    throw new Error("Gateway identity observation requires a live server-side TLSSocket.");
  }
  if (socket.authorized !== true) {
    throw new Error(`mTLS peer authorization failed: ${socket.authorizationError || "unknown"}`);
  }
  const protocol = socket.getProtocol();
  if (protocol !== "TLSv1.3") {
    throw new Error(`Gateway identity transport requires TLSv1.3, received ${protocol || "none"}.`);
  }
  const chain = peerCertificateChain(socket);
  const peer = socket.getPeerX509Certificate
    ? socket.getPeerX509Certificate()
    : chain[0];
  const local = socket.getX509Certificate
    ? socket.getX509Certificate()
    : new crypto.X509Certificate(socket.getCertificate().raw);
  if (!peer || !local) throw new Error("TLS peer and local certificates must be observable.");
  const spiffeId = parseSpiffeId(peer);
  if (!spiffeId) throw new Error("TLS client certificate must contain exactly one valid SPIFFE URI SAN.");

  const roots = policy.trusted_x509_roots.map(root => ({
    policy: root,
    certificate: new crypto.X509Certificate(root.certificate_pem)
  }));
  let selectedRoot = roots.find(root =>
    chain.some(item => certificateSha256(item) === root.policy.certificate_sha256));
  if (!selectedRoot) {
    const issuer = chain.at(-1) || peer;
    const candidates = roots.filter(root =>
      issuer.checkIssued(root.certificate) && issuer.verify(root.certificate.publicKey));
    if (candidates.length === 1) selectedRoot = candidates[0];
  }
  if (!selectedRoot) throw new Error("TLS client chain does not terminate at one policy trust root.");
  const leafDigest = certificateSha256(peer);
  const rootDigest = selectedRoot.policy.certificate_sha256;
  const intermediates = chain
    .filter(item => {
      const digest = certificateSha256(item);
      return digest !== leafDigest && digest !== rootDigest;
    })
    .map(item => pemFromRaw(item.raw));
  const exporter = socket.exportKeyingMaterial(
    policy.transport_profile.tls_exporter_length,
    policy.transport_profile.tls_exporter_label,
    Buffer.alloc(0)
  );
  const cipher = socket.getCipher();
  return {
    mode: "mtls_spiffe_x509",
    tls_version: protocol,
    cipher_suite: cipher && (cipher.standardName || cipher.name) || "unknown",
    peer_authorized: true,
    authorization_error: "none",
    spiffe_id: spiffeId,
    trust_root_id: selectedRoot.policy.id,
    leaf_certificate_pem: pemFromRaw(peer.raw),
    certificate_chain_pem: intermediates,
    client_certificate_sha256: leafDigest,
    server_certificate_sha256: certificateSha256(local),
    tls_exporter_sha256: sha256(exporter)
  };
}

function placeholderRef(artifactId) {
  return {
    artifact_id: artifactId,
    relative_path: "pending",
    sha256: "0000000000000000000000000000000000000000000000000000000000000000"
  };
}

function requestProjection(descriptor, policy, challengeRef, evidenceRef, principal) {
  return {
    transaction_id: descriptor.transactionId,
    mission_id: descriptor.missionId,
    wave_id: descriptor.waveId,
    agent_id: descriptor.agentId,
    provider: descriptor.provider,
    gateway: clone(policy.gateway),
    authenticated_principal: clone(principal),
    identity_policy_ref: clone(descriptor.identityPolicyRef),
    identity_challenge_ref: clone(challengeRef),
    principal_evidence_ref: clone(evidenceRef),
    repository_binding: clone(policy.repository_binding)
  };
}

function createGatewayPrincipalEvidenceUnlocked(options, descriptor) {
  const observedAt = options.now || new Date().toISOString();
  const view = storeView(options);
  const policyRecord = activePolicy(view, descriptor.identityPolicyRef, observedAt);
  const challengeRecord = loadArtifactRef(
    view,
    descriptor.identityChallengeRef,
    "gateway-identity-challenge"
  );
  const policy = policyRecord.payload;
  const challenge = challengeRecord.payload;
  assertAdapterPrivateKey(policy, options.adapterPrivateKeyPem);
  if (!sameRef(challenge.identity_policy_ref, policyRecord.ref)) {
    throw new Error("Gateway challenge does not bind the selected identity policy.");
  }
  if (listArtifacts(view, KINDS.evidence)
    .some(item => sameRef(item.payload.identity_challenge_ref, challengeRecord.ref))) {
    throw new Error("Gateway identity challenge has already been consumed.");
  }
  const scalarBindings = {
    transaction_id: descriptor.transactionId,
    mission_id: descriptor.missionId,
    wave_id: descriptor.waveId,
    agent_id: descriptor.agentId,
    provider: descriptor.provider
  };
  for (const [field, expected] of Object.entries(scalarBindings)) {
    if (challenge[field] !== expected) {
      throw new Error(`Gateway challenge ${field} does not match the evidence request.`);
    }
  }
  if (challenge.session_binding.session_id !== descriptor.sessionId ||
      challenge.session_binding.provider_agent_id !== descriptor.providerAgentId) {
    throw new Error("Gateway challenge session does not match the evidence request.");
  }
  const observation = observeMutualTlsSocket(descriptor.tlsSocket, policy);
  const principals = policy.principals.filter(item =>
    item.agent_id === descriptor.agentId &&
    item.provider === descriptor.provider &&
    item.spiffe_id === observation.spiffe_id &&
    item.trust_root_id === observation.trust_root_id);
  if (principals.length !== 1) {
    throw new Error("Observed SPIFFE principal is not authorized by the gateway identity policy.");
  }
  const principalRecord = principals[0];
  if (policy.revocations.principal_ids.includes(principalRecord.id) ||
      policy.revocations.certificate_sha256.includes(observation.client_certificate_sha256)) {
    throw new Error("Observed gateway principal or certificate is revoked.");
  }
  const leaf = new crypto.X509Certificate(observation.leaf_certificate_pem);
  const root = policy.trusted_x509_roots
    .find(item => item.id === principalRecord.trust_root_id);
  const chain = (observation.certificate_chain_pem || [])
    .map(item => new crypto.X509Certificate(item));
  const evidenceEnd = Math.min(
    timestamp(observedAt, "Evidence observed_at") + policy.evidence_ttl_seconds * 1000,
    timestamp(challenge.expires_at, "Challenge expires_at"),
    timestamp(policy.expires_at, "Policy expires_at"),
    timestamp(root.valid_until, "Trust root valid_until"),
    leaf.validToDate.getTime(),
    ...chain.map(item => item.validToDate.getTime())
  );
  if (evidenceEnd <= timestamp(observedAt, "Evidence observed_at")) {
    throw new Error("Gateway principal evidence has no positive validity window.");
  }
  const principal = {
    authentication_method: "mtls",
    issuer: `spiffe://${root.trust_domain}`,
    subject: observation.spiffe_id,
    audience: policy.gateway.audience,
    credential_sha256: observation.client_certificate_sha256,
    proof_sha256: observation.tls_exporter_sha256,
    proof_verified: true,
    session_id: descriptor.sessionId,
    provider_agent_id: descriptor.providerAgentId,
    authenticated_at: observedAt,
    expires_at: new Date(evidenceEnd).toISOString()
  };
  const evidenceId = descriptor.evidenceId || deterministicId(
    "GPE",
    descriptor.transactionId,
    challenge.nonce
  );
  const evidence = signGatewayPrincipalEvidence({
    schema_version: "0.1",
    type: "GatewayPrincipalEvidence",
    id: evidenceId,
    identity_policy_ref: clone(policyRecord.ref),
    identity_challenge_ref: clone(challengeRecord.ref),
    transaction_id: descriptor.transactionId,
    mission_id: descriptor.missionId,
    wave_id: descriptor.waveId,
    agent_id: descriptor.agentId,
    provider: descriptor.provider,
    session_binding: {
      session_id: descriptor.sessionId,
      provider_agent_id: descriptor.providerAgentId
    },
    principal_id: principalRecord.id,
    gateway_binding_sha256: objectDigest(policy.gateway),
    principal_binding_sha256: objectDigest(principal),
    repository_binding: clone(policy.repository_binding),
    transport: observation,
    adapter: {
      adapter_id: policy.adapter_profile.adapter_id,
      adapter_version: policy.adapter_profile.adapter_version,
      adapter_sha256: policy.adapter_profile.adapter_sha256,
      runtime_sha256: policy.adapter_profile.runtime_sha256,
      configuration_sha256: policy.adapter_profile.configuration_sha256
    },
    observed_at: observedAt,
    expires_at: principal.expires_at,
    authority: authority()
  }, options.adapterPrivateKeyPem);
  assertValid(evidence, "gateway-principal-evidence", "Gateway principal evidence");
  const pendingRequest = requestProjection(
    descriptor,
    policy,
    challengeRecord.ref,
    placeholderRef(evidence.id),
    principal
  );
  const pendingVerification = verifyGatewayIdentityBundle({
    policy,
    challenge,
    evidence,
    request: pendingRequest,
    evaluatedAt: observedAt
  });
  if (!pendingVerification.valid) {
    throw new Error(`Gateway principal observation failed: ${pendingVerification.codes.join(", ")}`);
  }
  const written = writeJsonArtifact(options, {
    missionId: evidence.mission_id,
    waveId: evidence.wave_id,
    kind: KINDS.evidence,
    artifactId: evidence.id,
    payload: evidence,
    createdAt: evidence.observed_at
  });
  return {
    evidence,
    evidence_ref: written.ref,
    authenticated_principal: principal,
    gateway: clone(policy.gateway),
    identity_policy_ref: clone(policyRecord.ref),
    identity_challenge_ref: clone(challengeRecord.ref),
    verification: pendingVerification,
    production_execution_authorized: false,
    release_authorized: false
  };
}

function createGatewayPrincipalEvidence(options, descriptor) {
  return withIdentityLock(options, () =>
    createGatewayPrincipalEvidenceUnlocked(options, descriptor));
}

function verifyGatewayPrincipalEvidence(options) {
  const request = options.request;
  const evaluatedAt = options.evaluatedAt || options.now || new Date().toISOString();
  try {
    const view = storeView(options);
    const policy = loadArtifactRef(
      view,
      request.identity_policy_ref,
      "gateway-identity-policy"
    );
    const challenge = loadArtifactRef(
      view,
      request.identity_challenge_ref,
      "gateway-identity-challenge"
    );
    const evidence = loadArtifactRef(
      view,
      request.principal_evidence_ref,
      "gateway-principal-evidence"
    );
    const result = verifyGatewayIdentityBundle({
      policy: policy.payload,
      challenge: challenge.payload,
      evidence: evidence.payload,
      request,
      evaluatedAt
    });
    const codes = [...result.codes];
    const challengeEvidence = listArtifacts(view, KINDS.evidence)
      .filter(item => sameRef(item.payload.identity_challenge_ref, challenge.ref));
    if (challengeEvidence.length !== 1 ||
        !sameRef(challengeEvidence[0].ref, evidence.ref)) {
      codes.push("GATEWAY_IDENTITY_CHALLENGE_REUSE_DETECTED");
    }
    const challengeTransactions = listArtifacts(view, KINDS.challenge)
      .filter(item => item.payload.transaction_id === request.transaction_id);
    if (challengeTransactions.length !== 1 ||
        !sameRef(challengeTransactions[0].ref, challenge.ref)) {
      codes.push("GATEWAY_IDENTITY_TRANSACTION_CHALLENGE_AMBIGUOUS");
    }
    const foreignRequests = listArtifacts(view, KINDS.request)
      .filter(item => item.payload.transaction_id !== request.transaction_id)
      .filter(item =>
        sameRef(item.payload.identity_challenge_ref, challenge.ref) ||
        sameRef(item.payload.principal_evidence_ref, evidence.ref));
    if (foreignRequests.length > 0) {
      codes.push("GATEWAY_IDENTITY_REQUEST_REPLAY_DETECTED");
    }
    const finalCodes = [...new Set(codes)].sort();
    return {
      ...result,
      valid: finalCodes.length === 0,
      codes: finalCodes,
      identity_policy_ref: clone(policy.ref),
      identity_challenge_ref: clone(challenge.ref),
      principal_evidence_ref: clone(evidence.ref)
    };
  } catch (error) {
    return {
      valid: false,
      codes: ["GATEWAY_IDENTITY_ARTIFACT_UNAVAILABLE"],
      message: error.message,
      verified_principal_sha256: "none",
      valid_until: "none"
    };
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const valueFlags = new Set([
    "repository",
    "artifact-root",
    "mission",
    "wave",
    "policy",
    "policy-ref",
    "request",
    "private-key",
    "transaction",
    "agent",
    "provider",
    "session",
    "provider-agent",
    "challenge-id",
    "at"
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--") || !valueFlags.has(arg.slice(2))) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    index += 1;
    if (index >= rest.length) throw new Error(`${arg} requires a value.`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    options[key] = rest[index];
  }
  return { command, options };
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function readJson(filePath, label) {
  return JSON.parse(fs.readFileSync(path.resolve(required(filePath, label)), "utf8"));
}

function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const common = {
      repository: path.resolve(required(parsed.options.repository, "--repository")),
      artifactRoot: parsed.options.artifactRoot
        ? path.resolve(parsed.options.artifactRoot)
        : undefined,
      now: parsed.options.at
    };
    let result;
    if (parsed.command === "persist-policy") {
      result = persistGatewayIdentityPolicy({
        ...common,
        missionId: required(parsed.options.mission, "--mission"),
        waveId: required(parsed.options.wave, "--wave")
      }, readJson(parsed.options.policy, "--policy"));
    } else if (parsed.command === "issue-challenge") {
      result = issueGatewayIdentityChallenge({
        ...common,
        adapterPrivateKeyPem: fs.readFileSync(
          path.resolve(required(parsed.options.privateKey, "--private-key")),
          "utf8"
        )
      }, {
        identityPolicyRef: readJson(parsed.options.policyRef, "--policy-ref"),
        transactionId: required(parsed.options.transaction, "--transaction"),
        missionId: required(parsed.options.mission, "--mission"),
        waveId: required(parsed.options.wave, "--wave"),
        agentId: required(parsed.options.agent, "--agent"),
        provider: required(parsed.options.provider, "--provider"),
        sessionId: required(parsed.options.session, "--session"),
        providerAgentId: required(parsed.options.providerAgent, "--provider-agent"),
        challengeId: parsed.options.challengeId
      });
    } else if (parsed.command === "verify") {
      result = verifyGatewayPrincipalEvidence({
        ...common,
        request: readJson(parsed.options.request, "--request")
      });
    } else {
      throw new Error(
        "Usage: node gateway-identity-adapter.js " +
        "<persist-policy|issue-challenge|verify> --repository <repo> ..."
      );
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.valid === false) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  createGatewayPrincipalEvidence,
  issueGatewayIdentityChallenge,
  observeMutualTlsSocket,
  persistGatewayIdentityPolicy,
  verifyGatewayPrincipalEvidence
};
