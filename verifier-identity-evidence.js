#!/usr/bin/env node

const crypto = require("crypto");
const { publicKeyId, strictBase64 } = require("./verification-attestation");

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

function canonicalJsonBytes(value) {
  return Buffer.from(JSON.stringify(canonicalValue(value)));
}

function buffersEqual(left, right) {
  return Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function identityEvidenceDigest(evidence) {
  const copy = JSON.parse(JSON.stringify(evidence));
  delete copy.evidence_sha256;
  return sha256(canonicalJsonBytes(copy));
}

function merkleLeafHash(input) {
  return sha256(Buffer.concat([Buffer.from([0]), Buffer.from(input)]));
}

function merkleNodeHash(left, right) {
  const leftBytes = Buffer.isBuffer(left) ? left : Buffer.from(left, "hex");
  const rightBytes = Buffer.isBuffer(right) ? right : Buffer.from(right, "hex");
  if (leftBytes.length !== 32 || rightBytes.length !== 32) throw new Error("Merkle nodes must be SHA-256 digests.");
  return sha256(Buffer.concat([Buffer.from([1]), leftBytes, rightBytes]));
}

function verifyMerkleInclusion({ leafHash, logIndex, treeSize, inclusionPath, rootHash }) {
  if (!/^[a-f0-9]{64}$/.test(leafHash || "") || !/^[a-f0-9]{64}$/.test(rootHash || "") ||
      !Number.isInteger(logIndex) || !Number.isInteger(treeSize) || treeSize < 1 || logIndex < 0 || logIndex >= treeSize ||
      !Array.isArray(inclusionPath) || inclusionPath.some(item => !/^[a-f0-9]{64}$/.test(item))) return false;

  let node = leafHash;
  let index = logIndex;
  let last = treeSize - 1;
  for (const sibling of inclusionPath) {
    if (index === last || (index & 1) === 1) {
      node = merkleNodeHash(sibling, node);
      while ((index & 1) === 0 && index !== 0) {
        index >>= 1;
        last >>= 1;
      }
    } else {
      node = merkleNodeHash(node, sibling);
    }
    index >>= 1;
    last >>= 1;
  }
  return last === 0 && node === rootHash;
}

function certificateSha256(certificate) {
  const parsed = certificate instanceof crypto.X509Certificate ? certificate : new crypto.X509Certificate(certificate);
  return sha256(parsed.raw);
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function expectedStatement(evidence) {
  return {
    schema_version: "0.1",
    type: "VerifierIdentityBinding",
    evidence_id: evidence.id,
    verifier_id: evidence.verifier_id,
    verifier_key_id: evidence.signatures && evidence.signatures.verifier_key_id,
    spiffe_id: evidence.workload_identity && evidence.workload_identity.spiffe_id,
    trust_root_id: evidence.workload_identity && evidence.workload_identity.trust_root_id,
    transparency_log_id: evidence.transparency && evidence.transparency.log_id,
    repository_binding: evidence.repository_binding,
    purposes: evidence.purposes,
    nonce: evidence.binding_statement && evidence.binding_statement.nonce,
    issued_at: evidence.issued_at,
    expires_at: evidence.expires_at
  };
}

function transparencyEntry(evidence) {
  return {
    schema_version: "0.1",
    type: "VerifierIdentityTransparencyEntry",
    evidence_id: evidence.id,
    statement_sha256: sha256(canonicalJsonBytes(evidence.binding_statement)),
    leaf_certificate_sha256: certificateSha256(evidence.workload_identity.leaf_certificate_pem),
    workload_signature_sha256: sha256(strictBase64(evidence.signatures.workload_signature_base64) || Buffer.alloc(0)),
    verifier_signature_sha256: sha256(strictBase64(evidence.signatures.verifier_signature_base64) || Buffer.alloc(0))
  };
}

function checkpointBytes(checkpoint) {
  const unsigned = JSON.parse(JSON.stringify(checkpoint));
  delete unsigned.signature_base64;
  return canonicalJsonBytes(unsigned);
}

function parseSpiffeId(certificate) {
  const subjectAltName = certificate.subjectAltName || "";
  const uriMarkers = subjectAltName.match(/(?:^|,\s*)URI:/g) || [];
  const matches = [...subjectAltName.matchAll(/(?:^|,\s*)URI:([^,]+)/g)];
  if (uriMarkers.length !== 1 || matches.length !== 1) return null;
  const value = matches[0][1];
  if (value.startsWith('"') || value.endsWith('"')) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "spiffe:" || !parsed.hostname || parsed.pathname === "/" || !parsed.pathname.startsWith("/") ||
        parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.href !== value) return null;
    return value;
  } catch (error) {
    return null;
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

function verifyCertificateChain({ evidence, trustedRoot, evaluatedTime, issuedTime, expiresTime, codes }) {
  let leaf;
  let root;
  let intermediates;
  try {
    leaf = new crypto.X509Certificate(evidence.workload_identity.leaf_certificate_pem);
    root = new crypto.X509Certificate(trustedRoot.certificate_pem);
    intermediates = (evidence.workload_identity.certificate_chain_pem || []).map(item => new crypto.X509Certificate(item));
  } catch (error) {
    addCode(codes, "IDENTITY_CERTIFICATE_PARSE_FAILED");
    return null;
  }

  if (leaf.ca || root.ca !== true || intermediates.some(item => item.ca !== true)) {
    addCode(codes, "IDENTITY_CERTIFICATE_ROLE_INVALID");
  }
  if (certificateSha256(root) !== trustedRoot.certificate_sha256) {
    addCode(codes, "IDENTITY_TRUST_ROOT_DIGEST_MISMATCH");
  }
  if (!root.verify(root.publicKey)) addCode(codes, "IDENTITY_TRUST_ROOT_SIGNATURE_INVALID");

  const chain = [leaf, ...intermediates, root];
  if (new Set(chain.map(certificateSha256)).size !== chain.length) {
    addCode(codes, "IDENTITY_CERTIFICATE_CHAIN_INVALID");
  }
  for (let index = 0; index < chain.length - 1; index += 1) {
    const child = chain[index];
    const parent = chain[index + 1];
    if (!child.checkIssued(parent) || !child.verify(parent.publicKey)) {
      addCode(codes, "IDENTITY_CERTIFICATE_CHAIN_INVALID");
      break;
    }
  }

  for (const certificate of chain) {
    const validFrom = certificate.validFromDate.getTime();
    const validUntil = certificate.validToDate.getTime();
    if (issuedTime < validFrom || issuedTime >= validUntil || evaluatedTime < validFrom || evaluatedTime >= validUntil) {
      addCode(codes, "IDENTITY_CERTIFICATE_NOT_ACTIVE");
    }
  }
  if (expiresTime > leaf.validToDate.getTime()) addCode(codes, "IDENTITY_EVIDENCE_EXCEEDS_CERTIFICATE_VALIDITY");

  const spiffeId = parseSpiffeId(leaf);
  if (!spiffeId) addCode(codes, "IDENTITY_SPIFFE_SAN_INVALID");
  return { leaf, spiffeId, validUntil: Math.min(...chain.map(item => item.validToDate.getTime())) };
}

function createVerifierIdentityEvidence(options) {
  const evidenceId = String(options.evidenceId || "");
  const verifier = options.verifier;
  const trustPolicy = options.trustPolicy;
  const repositoryBinding = options.repositoryBinding;
  const issuedAt = options.issuedAt || new Date().toISOString();
  const expiresAt = options.expiresAt;
  const purposes = [...new Set(options.purposes || [])].sort();
  const nonce = String(options.nonce || crypto.randomUUID());
  if (!evidenceId || !verifier || !trustPolicy || !repositoryBinding || purposes.length === 0) {
    throw new Error("Evidence ID, verifier, trust policy, repository binding, and purposes are required.");
  }
  if (timestamp(issuedAt) === null || timestamp(expiresAt) === null || timestamp(expiresAt) <= timestamp(issuedAt)) {
    throw new Error("Evidence expiry must be later than its issue time.");
  }
  if (nonce.length < 16 || nonce.length > 256) throw new Error("Evidence nonce must contain 16 to 256 characters.");
  const identity = verifier.workload_identity;
  if (!identity || identity.type !== "spiffe_x509") throw new Error("Verifier must declare a SPIFFE X.509 workload identity.");
  const log = (trustPolicy.identity_assurance && trustPolicy.identity_assurance.trusted_transparency_logs || [])
    .find(item => item.id === identity.transparency_log_id);
  if (!log) throw new Error("Verifier transparency log is not trusted by the policy.");

  const workloadPrivateKey = crypto.createPrivateKey(options.workloadPrivateKeyPem);
  const verifierPrivateKey = crypto.createPrivateKey(options.verifierPrivateKeyPem);
  const logPrivateKey = crypto.createPrivateKey(options.logPrivateKeyPem);
  const leaf = new crypto.X509Certificate(options.leafCertificatePem);
  if (workloadPrivateKey.asymmetricKeyType !== "ed25519" || verifierPrivateKey.asymmetricKeyType !== "ed25519" ||
      logPrivateKey.asymmetricKeyType !== "ed25519" || !leaf.checkPrivateKey(workloadPrivateKey)) {
    throw new Error("Workload, verifier, and log keys must be matching Ed25519 keys.");
  }
  if (publicKeyId(crypto.createPublicKey(verifierPrivateKey)) !== verifier.key_id ||
      publicKeyId(crypto.createPublicKey(logPrivateKey)) !== log.key_id) {
    throw new Error("Verifier or transparency-log private key does not match the trust policy.");
  }

  const evidence = {
    schema_version: "0.1",
    type: "VerifierIdentityEvidence",
    id: evidenceId,
    verifier_id: verifier.id,
    trust_policy_id: trustPolicy.id,
    repository_binding: JSON.parse(JSON.stringify(repositoryBinding)),
    purposes,
    workload_identity: {
      type: "spiffe_x509",
      spiffe_id: identity.spiffe_id,
      trust_root_id: identity.trust_root_id,
      leaf_certificate_pem: options.leafCertificatePem,
      certificate_chain_pem: options.certificateChainPem || []
    },
    binding_statement: null,
    signatures: null,
    transparency: null,
    evidence_sha256: "",
    issued_at: issuedAt,
    expires_at: expiresAt
  };
  evidence.signatures = {
    workload_key_id: publicKeyId(leaf.publicKey),
    workload_algorithm: "ed25519",
    workload_signature_base64: "",
    verifier_key_id: verifier.key_id,
    verifier_algorithm: "ed25519",
    verifier_signature_base64: ""
  };
  evidence.transparency = { log_id: log.id };
  evidence.binding_statement = {
    ...expectedStatement(evidence),
    nonce
  };
  const statementBytes = canonicalJsonBytes(evidence.binding_statement);
  evidence.signatures.workload_signature_base64 = crypto.sign(null, statementBytes, workloadPrivateKey).toString("base64");
  evidence.signatures.verifier_signature_base64 = crypto.sign(null, statementBytes, verifierPrivateKey).toString("base64");

  const entryBytes = canonicalJsonBytes(transparencyEntry(evidence));
  const leafHash = merkleLeafHash(entryBytes);
  const inclusion = options.inclusion || {};
  const rootHash = inclusion.rootHash || leafHash;
  const treeSize = inclusion.treeSize ?? 1;
  const logIndex = inclusion.logIndex ?? 0;
  const inclusionPath = inclusion.inclusionPath || [];
  if (!verifyMerkleInclusion({ leafHash, logIndex, treeSize, inclusionPath, rootHash })) {
    throw new Error("Transparency inclusion parameters do not prove the evidence leaf under the selected root.");
  }
  const checkpoint = {
    origin: log.origin,
    log_id: log.id,
    tree_size: treeSize,
    root_hash: rootHash,
    issued_at: options.checkpointIssuedAt || issuedAt,
    key_id: log.key_id,
    signature_algorithm: "ed25519",
    signature_base64: ""
  };
  checkpoint.signature_base64 = crypto.sign(null, checkpointBytes(checkpoint), logPrivateKey).toString("base64");
  evidence.transparency = {
    log_id: log.id,
    canonicalized_entry_base64: entryBytes.toString("base64"),
    leaf_hash: leafHash,
    log_index: logIndex,
    tree_size: treeSize,
    inclusion_path_sha256: inclusionPath,
    checkpoint
  };
  evidence.evidence_sha256 = identityEvidenceDigest(evidence);
  return evidence;
}

function verifyVerifierIdentityEvidence(options) {
  const evidence = options.evidence;
  const policy = options.trustPolicy;
  const verifier = options.verifier;
  const repository = options.repository;
  const evaluatedAt = options.evaluatedAt || new Date().toISOString();
  const codes = [];
  const evaluatedTime = timestamp(evaluatedAt);
  if (!evidence || !policy || !verifier || !repository || evaluatedTime === null) {
    return { valid: false, codes: ["IDENTITY_VERIFICATION_INPUT_INVALID"] };
  }
  if (!evidence.binding_statement || !evidence.workload_identity || !evidence.signatures || !evidence.transparency ||
      !evidence.transparency.checkpoint || !policy.identity_assurance || !verifier.workload_identity) {
    return { valid: false, codes: ["IDENTITY_EVIDENCE_STRUCTURE_INVALID"] };
  }
  const issuedTime = timestamp(evidence.issued_at);
  const expiresTime = timestamp(evidence.expires_at);
  if (issuedTime === null || expiresTime === null || expiresTime <= issuedTime || evaluatedTime < issuedTime || evaluatedTime >= expiresTime) {
    addCode(codes, "IDENTITY_EVIDENCE_NOT_ACTIVE");
  }
  const maxAge = policy.identity_assurance && policy.identity_assurance.max_evidence_age_seconds;
  if (!Number.isInteger(maxAge) || issuedTime === null || evaluatedTime >= issuedTime + maxAge * 1000) {
    addCode(codes, "IDENTITY_EVIDENCE_STALE");
  }
  if (evidence.evidence_sha256 !== identityEvidenceDigest(evidence)) addCode(codes, "IDENTITY_EVIDENCE_DIGEST_MISMATCH");
  if (evidence.verifier_id !== verifier.id || evidence.trust_policy_id !== policy.id) addCode(codes, "IDENTITY_POLICY_BINDING_MISMATCH");
  if (!evidence.repository_binding || evidence.repository_binding.repository_key !== repository.key ||
      evidence.repository_binding.identity_fingerprint !== repository.identity_fingerprint) {
    addCode(codes, "IDENTITY_REPOSITORY_BINDING_MISMATCH");
  }
  if (canonicalJsonBytes(evidence.binding_statement).toString("hex") !== canonicalJsonBytes(expectedStatement(evidence)).toString("hex")) {
    addCode(codes, "IDENTITY_STATEMENT_BINDING_MISMATCH");
  }

  const identity = verifier.workload_identity || {};
  if (!evidence.workload_identity || evidence.workload_identity.type !== "spiffe_x509" ||
      evidence.workload_identity.spiffe_id !== identity.spiffe_id ||
      evidence.workload_identity.trust_root_id !== identity.trust_root_id ||
      !evidence.transparency || evidence.transparency.log_id !== identity.transparency_log_id) {
    addCode(codes, "IDENTITY_POLICY_BINDING_MISMATCH");
  }
  const allowedPurposes = verifier.allowed_attestation_types || ["verification_receipt"];
  if (!Array.isArray(evidence.purposes) || evidence.purposes.length === 0 ||
      evidence.purposes.some(purpose => !allowedPurposes.includes(purpose))) {
    addCode(codes, "IDENTITY_PURPOSE_NOT_AUTHORIZED");
  }

  const trustedRoot = (policy.identity_assurance && policy.identity_assurance.trusted_x509_roots || [])
    .find(item => item.id === identity.trust_root_id);
  const trustedLog = (policy.identity_assurance && policy.identity_assurance.trusted_transparency_logs || [])
    .find(item => item.id === identity.transparency_log_id);
  if (!trustedRoot || !trustedLog) addCode(codes, "IDENTITY_TRUST_ANCHOR_UNAVAILABLE");

  let certificateResult = null;
  if (trustedRoot && issuedTime !== null && expiresTime !== null) {
    certificateResult = verifyCertificateChain({ evidence, trustedRoot, evaluatedTime, issuedTime, expiresTime, codes });
    if (certificateResult && certificateResult.spiffeId !== identity.spiffe_id) addCode(codes, "IDENTITY_SPIFFE_ID_MISMATCH");
    if (certificateResult && spiffeTrustDomain(certificateResult.spiffeId) !== trustedRoot.trust_domain) {
      addCode(codes, "IDENTITY_TRUST_DOMAIN_MISMATCH");
    }
  }

  const statementBytes = canonicalJsonBytes(evidence.binding_statement);
  const workloadSignature = evidence.signatures && strictBase64(evidence.signatures.workload_signature_base64);
  const verifierSignature = evidence.signatures && strictBase64(evidence.signatures.verifier_signature_base64);
  try {
    if (!certificateResult || certificateResult.leaf.publicKey.asymmetricKeyType !== "ed25519" ||
        evidence.signatures.workload_key_id !== publicKeyId(certificateResult.leaf.publicKey) || !workloadSignature ||
        !crypto.verify(null, statementBytes, certificateResult.leaf.publicKey, workloadSignature)) {
      addCode(codes, "IDENTITY_WORKLOAD_SIGNATURE_INVALID");
    }
  } catch (error) {
    addCode(codes, "IDENTITY_WORKLOAD_SIGNATURE_INVALID");
  }
  try {
    const verifierKey = crypto.createPublicKey(verifier.public_key_pem);
    if (verifierKey.asymmetricKeyType !== "ed25519" || evidence.signatures.verifier_key_id !== verifier.key_id ||
        publicKeyId(verifierKey) !== verifier.key_id || !verifierSignature ||
        !crypto.verify(null, statementBytes, verifierKey, verifierSignature)) {
      addCode(codes, "IDENTITY_VERIFIER_SIGNATURE_INVALID");
    }
  } catch (error) {
    addCode(codes, "IDENTITY_VERIFIER_SIGNATURE_INVALID");
  }

  if (trustedLog) {
    let expectedEntryBytes = null;
    try {
      expectedEntryBytes = canonicalJsonBytes(transparencyEntry(evidence));
    } catch (error) {
      addCode(codes, "IDENTITY_TRANSPARENCY_ENTRY_INVALID");
    }
    const suppliedEntryBytes = evidence.transparency && strictBase64(evidence.transparency.canonicalized_entry_base64);
    if (!buffersEqual(expectedEntryBytes, suppliedEntryBytes)) {
      addCode(codes, "IDENTITY_TRANSPARENCY_ENTRY_INVALID");
    }
    const expectedLeafHash = expectedEntryBytes ? merkleLeafHash(expectedEntryBytes) : null;
    if (!expectedLeafHash || evidence.transparency.leaf_hash !== expectedLeafHash ||
        !verifyMerkleInclusion({
          leafHash: evidence.transparency.leaf_hash,
          logIndex: evidence.transparency.log_index,
          treeSize: evidence.transparency.tree_size,
          inclusionPath: evidence.transparency.inclusion_path_sha256,
          rootHash: evidence.transparency.checkpoint && evidence.transparency.checkpoint.root_hash
        })) addCode(codes, "IDENTITY_TRANSPARENCY_INCLUSION_INVALID");

    const checkpoint = evidence.transparency.checkpoint || {};
    const checkpointTime = timestamp(checkpoint.issued_at);
    if (checkpoint.origin !== trustedLog.origin || checkpoint.log_id !== trustedLog.id ||
        checkpoint.tree_size !== evidence.transparency.tree_size || checkpoint.key_id !== trustedLog.key_id ||
        checkpoint.signature_algorithm !== "ed25519" || checkpointTime === null ||
        checkpointTime < issuedTime || checkpointTime > evaluatedTime || checkpointTime >= expiresTime) {
      addCode(codes, "IDENTITY_TRANSPARENCY_CHECKPOINT_INVALID");
    }
    try {
      const logKey = crypto.createPublicKey(trustedLog.public_key_pem);
      const checkpointSignature = strictBase64(checkpoint.signature_base64);
      if (logKey.asymmetricKeyType !== "ed25519" || publicKeyId(logKey) !== trustedLog.key_id || !checkpointSignature ||
          !crypto.verify(null, checkpointBytes(checkpoint), logKey, checkpointSignature)) {
        addCode(codes, "IDENTITY_TRANSPARENCY_SIGNATURE_INVALID");
      }
    } catch (error) {
      addCode(codes, "IDENTITY_TRANSPARENCY_SIGNATURE_INVALID");
    }
  }

  const freshnessUntil = issuedTime !== null && Number.isInteger(maxAge) ? issuedTime + maxAge * 1000 : null;
  const validity = [expiresTime, freshnessUntil, certificateResult && certificateResult.validUntil, timestamp(verifier.valid_until), timestamp(policy.expires_at)]
    .filter(value => Number.isFinite(value) && value > evaluatedTime);
  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    verifier_id: verifier.id,
    spiffe_id: certificateResult && certificateResult.spiffeId || evidence.workload_identity && evidence.workload_identity.spiffe_id || "unknown",
    trust_domain: certificateResult && spiffeTrustDomain(certificateResult.spiffeId) || "unknown",
    certificate_sha256: certificateResult ? certificateSha256(certificateResult.leaf) : "none",
    transparency_log_id: evidence.transparency && evidence.transparency.log_id || "unknown",
    purposes: Array.isArray(evidence.purposes) ? [...evidence.purposes].sort() : [],
    issued_at: evidence.issued_at,
    valid_until: validity.length > 0 ? new Date(Math.min(...validity)).toISOString() : "none"
  };
}

module.exports = {
  canonicalJsonBytes,
  certificateSha256,
  createVerifierIdentityEvidence,
  identityEvidenceDigest,
  merkleLeafHash,
  merkleNodeHash,
  parseSpiffeId,
  transparencyEntry,
  verifyMerkleInclusion,
  verifyVerifierIdentityEvidence
};
