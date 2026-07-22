#!/usr/bin/env node

const crypto = require("crypto");
const { TrustedRoot } = require("@sigstore/protobuf-specs");
const { toTrustMaterial } = require("@sigstore/verify");

const SUPPORTED_MEDIA_TYPES = new Set([
  "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
  "application/vnd.dev.sigstore.trustedroot.v0.2+json"
]);

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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeTrustedRoot(value) {
  return TrustedRoot.toJSON(TrustedRoot.fromJSON(value));
}

function trustedRootDigest(value) {
  return sha256(canonicalJsonBytes(normalizeTrustedRoot(value)));
}

function createSigstoreTrustedRoot(options) {
  const trustedRoot = normalizeTrustedRoot(options.trustedRoot);
  if (!SUPPORTED_MEDIA_TYPES.has(trustedRoot.mediaType)) {
    throw new Error(`Unsupported Sigstore TrustedRoot media type: ${trustedRoot.mediaType || "missing"}.`);
  }
  return {
    schema_version: "0.1",
    type: "SigstoreTrustedRoot",
    id: String(options.id || ""),
    media_type: trustedRoot.mediaType,
    trusted_root: trustedRoot,
    trusted_root_sha256: sha256(canonicalJsonBytes(trustedRoot)),
    source: {
      kind: options.sourceKind || "sigstore_tuf",
      uri: String(options.sourceUri || ""),
      retrieved_at: options.retrievedAt || new Date().toISOString()
    }
  };
}

function verifySigstoreTrustedRoot(artifact) {
  const codes = [];
  let normalized = null;
  try {
    normalized = normalizeTrustedRoot(artifact && artifact.trusted_root);
  } catch (error) {
    codes.push("SIGSTORE_TRUSTED_ROOT_PARSE_FAILED");
  }
  if (!artifact || artifact.type !== "SigstoreTrustedRoot" || artifact.schema_version !== "0.1") {
    codes.push("SIGSTORE_TRUSTED_ROOT_STRUCTURE_INVALID");
  }
  if (normalized) {
    if (!SUPPORTED_MEDIA_TYPES.has(normalized.mediaType) || artifact.media_type !== normalized.mediaType) {
      codes.push("SIGSTORE_TRUSTED_ROOT_MEDIA_TYPE_INVALID");
    }
    if (!Array.isArray(normalized.tlogs) || normalized.tlogs.length === 0 ||
        !Array.isArray(normalized.certificateAuthorities) || normalized.certificateAuthorities.length === 0 ||
        !Array.isArray(normalized.ctlogs) || normalized.ctlogs.length === 0) {
      codes.push("SIGSTORE_TRUSTED_ROOT_MATERIAL_INCOMPLETE");
    }
    if (!canonicalJsonBytes(normalized).equals(canonicalJsonBytes(artifact.trusted_root))) {
      codes.push("SIGSTORE_TRUSTED_ROOT_NOT_NORMALIZED");
    }
    if (artifact.trusted_root_sha256 !== sha256(canonicalJsonBytes(normalized))) {
      codes.push("SIGSTORE_TRUSTED_ROOT_DIGEST_MISMATCH");
    }
  }
  if (!artifact || !artifact.source || !Number.isFinite(Date.parse(artifact.source.retrieved_at)) ||
      typeof artifact.source.uri !== "string" || artifact.source.uri.length === 0) {
    codes.push("SIGSTORE_TRUSTED_ROOT_SOURCE_INVALID");
  }
  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    normalized_root: normalized
  };
}

function trustMaterialFromArtifact(artifact) {
  const result = verifySigstoreTrustedRoot(artifact);
  if (!result.valid) throw new Error(`Sigstore TrustedRoot invalid: ${result.codes.join(", ")}`);
  return toTrustMaterial(TrustedRoot.fromJSON(result.normalized_root));
}

module.exports = {
  SUPPORTED_MEDIA_TYPES,
  canonicalJsonBytes,
  createSigstoreTrustedRoot,
  normalizeTrustedRoot,
  sha256,
  trustedRootDigest,
  trustMaterialFromArtifact,
  verifySigstoreTrustedRoot
};
