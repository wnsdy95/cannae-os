#!/usr/bin/env node

const crypto = require("crypto");
const { canonicalBytes } = require("./verification-attestation");
const { componentId, validClaims } = require("./verifier-independence");

const GITLAB_CI_ISSUER = "https://gitlab.com";
const GITLAB_CI_DISCOVERY_URI = `${GITLAB_CI_ISSUER}/.well-known/openid-configuration`;
const GITLAB_CI_JWKS_URI = `${GITLAB_CI_ISSUER}/oauth/discovery/keys`;
const GITLAB_CI_ALGORITHM = "RS256";
const IDENTIFIER_CLAIMS = Object.freeze([
  "project_id", "namespace_id", "job_project_id", "job_namespace_id",
  "pipeline_id", "job_id", "runner_id"
]);
const REQUIRED_CLAIMS = Object.freeze([
  "iss", "sub", "aud", "exp", "iat", "nbf", "jti",
  "project_id", "project_path", "namespace_id", "namespace_path",
  "job_project_id", "job_project_path", "job_namespace_id", "job_namespace_path",
  "pipeline_id", "pipeline_source", "job_id", "ref", "ref_type", "ref_path",
  "ref_protected", "runner_id", "runner_environment", "sha", "ci_config_ref_uri",
  "ci_config_sha"
]);
const PINNED_CLAIMS = Object.freeze([
  "project_id", "project_path", "namespace_id", "namespace_path",
  "job_project_id", "job_project_path", "job_namespace_id", "job_namespace_path",
  "pipeline_source", "ref", "ref_type", "ref_path", "ref_protected",
  "runner_environment", "sha", "ci_config_ref_uri", "ci_config_sha"
]);
const PROJECTED_CLAIMS = Object.freeze([
  "project_id", "project_path", "namespace_id", "namespace_path",
  "job_project_id", "job_project_path", "job_namespace_id", "job_namespace_path",
  "pipeline_id", "pipeline_source", "job_id", "ref", "ref_type", "ref_path",
  "ref_protected", "runner_id", "runner_environment", "sha", "ci_config_ref_uri",
  "ci_config_sha"
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function digest(value, omittedKey) {
  return sha256(canonicalBytes(value, omittedKey));
}

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function exactKeys(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()));
}

function safeArtifactRef(ref) {
  return Boolean(ref && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref.artifact_id || "") &&
    typeof ref.relative_path === "string" && ref.relative_path.length > 0 &&
    !ref.relative_path.startsWith("/") && !ref.relative_path.split(/[\\/]+/).includes("..") &&
    /^[a-f0-9]{64}$/.test(ref.sha256 || ""));
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function epochTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value * 1000 : null;
}

function strictBase64Url(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("=") || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const bytes = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + padding, "base64");
  return bytes.toString("base64url") === value ? bytes : null;
}

function parseCompactJwt(token) {
  if (typeof token !== "string" || token.length > 32768) return null;
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  const decoded = segments.map(strictBase64Url);
  if (decoded.some(item => !item)) return null;
  try {
    const header = JSON.parse(decoded[0].toString("utf8"));
    const claims = JSON.parse(decoded[1].toString("utf8"));
    if (!header || typeof header !== "object" || Array.isArray(header) ||
        !claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    return {
      token,
      header,
      claims,
      signature: decoded[2],
      signingInput: Buffer.from(`${segments[0]}.${segments[1]}`)
    };
  } catch (error) {
    return null;
  }
}

function normalizedJwk(jwk) {
  return {
    kty: jwk.kty,
    use: jwk.use,
    kid: jwk.kid,
    alg: jwk.alg,
    n: jwk.n,
    e: jwk.e
  };
}

function validRsaJwk(jwk) {
  if (!jwk || jwk.kty !== "RSA" || jwk.use !== "sig" || jwk.alg !== GITLAB_CI_ALGORITHM ||
      typeof jwk.kid !== "string" || jwk.kid.length === 0 || !strictBase64Url(jwk.n) ||
      strictBase64Url(jwk.n).length < 256 || jwk.e !== "AQAB") return false;
  try {
    return crypto.createPublicKey({ key: normalizedJwk(jwk), format: "jwk" }).asymmetricKeyType === "rsa";
  } catch (error) {
    return false;
  }
}

function normalizedIdentifier(value) {
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

function projectedClaims(claims) {
  const projected = {};
  for (const name of PROJECTED_CLAIMS) {
    projected[name] = IDENTIFIER_CLAIMS.includes(name) ? normalizedIdentifier(claims[name]) : claims[name];
  }
  return projected;
}

function trustBundleDigest(bundle) {
  return digest(bundle, "bundle_sha256");
}

function nativeEvidenceDigest(evidence) {
  return digest(evidence, "evidence_sha256");
}

function createGitLabCIOIDCTrustBundle(options) {
  const discovery = options.discovery || {};
  const jwks = options.jwks || {};
  if (discovery.issuer !== GITLAB_CI_ISSUER || discovery.jwks_uri !== GITLAB_CI_JWKS_URI ||
      !Array.isArray(discovery.id_token_signing_alg_values_supported) ||
      !discovery.id_token_signing_alg_values_supported.includes(GITLAB_CI_ALGORITHM)) {
    throw new Error("GitLab CI OIDC discovery metadata is not the expected GitLab.com issuer contract.");
  }
  const keys = (jwks.keys || []).map(normalizedJwk).sort((left, right) => left.kid.localeCompare(right.kid));
  if (keys.length === 0 || keys.some(key => !validRsaJwk(key)) || new Set(keys.map(key => key.kid)).size !== keys.length) {
    throw new Error("GitLab CI OIDC JWKS must contain unique RS256 signing keys.");
  }
  const retrieved = timestamp(options.retrievedAt);
  const expires = timestamp(options.expiresAt);
  if (retrieved === null || expires === null || expires <= retrieved) throw new Error("Trust-bundle expiry must follow retrieval.");
  const bundle = {
    schema_version: "0.1",
    type: "GitLabCIOIDCTrustBundle",
    id: options.id,
    issuer: GITLAB_CI_ISSUER,
    discovery_uri: GITLAB_CI_DISCOVERY_URI,
    jwks_uri: GITLAB_CI_JWKS_URI,
    algorithms: [GITLAB_CI_ALGORITHM],
    keys,
    source: {
      kind: options.sourceKind || "https_discovery",
      retrieved_at: options.retrievedAt,
      expires_at: options.expiresAt
    },
    bundle_sha256: ""
  };
  bundle.bundle_sha256 = trustBundleDigest(bundle);
  return bundle;
}

function verifyGitLabCIOIDCTrustBundle(bundle, evaluatedAt) {
  const codes = [];
  if (!bundle || !exactKeys(bundle, [
    "schema_version", "type", "id", "issuer", "discovery_uri", "jwks_uri", "algorithms", "keys", "source", "bundle_sha256"
  ]) || bundle.type !== "GitLabCIOIDCTrustBundle" || bundle.schema_version !== "0.1" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(bundle.id || "") ||
      !exactKeys(bundle.source, ["kind", "retrieved_at", "expires_at"]) ||
      !["https_discovery", "pinned_file"].includes(bundle.source.kind)) {
    addCode(codes, "GITLAB_OIDC_TRUST_BUNDLE_STRUCTURE_INVALID");
  }
  if (!bundle || bundle.issuer !== GITLAB_CI_ISSUER || bundle.discovery_uri !== GITLAB_CI_DISCOVERY_URI ||
      bundle.jwks_uri !== GITLAB_CI_JWKS_URI || JSON.stringify(bundle.algorithms) !== JSON.stringify([GITLAB_CI_ALGORITHM])) {
    addCode(codes, "GITLAB_OIDC_TRUST_BUNDLE_ISSUER_INVALID");
  }
  const keys = bundle && bundle.keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.some(key => !validRsaJwk(key)) ||
      keys.some(key => !exactKeys(key, ["kty", "use", "kid", "alg", "n", "e"])) ||
      new Set((keys || []).map(key => key.kid)).size !== (keys || []).length ||
      JSON.stringify(keys) !== JSON.stringify([...(keys || [])].sort((left, right) => left.kid.localeCompare(right.kid)))) {
    addCode(codes, "GITLAB_OIDC_TRUST_BUNDLE_KEYS_INVALID");
  }
  if (bundle && bundle.bundle_sha256 !== trustBundleDigest(bundle)) addCode(codes, "GITLAB_OIDC_TRUST_BUNDLE_DIGEST_INVALID");
  const evaluated = timestamp(evaluatedAt);
  const retrieved = timestamp(bundle && bundle.source && bundle.source.retrieved_at);
  const expires = timestamp(bundle && bundle.source && bundle.source.expires_at);
  if (evaluated === null || retrieved === null || expires === null || expires <= retrieved || evaluated < retrieved || evaluated >= expires) {
    addCode(codes, "GITLAB_OIDC_TRUST_BUNDLE_TIME_INVALID");
  }
  return { valid: codes.length === 0, codes: codes.sort() };
}

function deriveGitLabCIIndependence(claims) {
  return {
    provider_id: "cannae:provider:gitlab_ci",
    operator_id: componentId("gitlab_ci", "operator", "gitlab"),
    control_plane_id: componentId("gitlab_ci", "control-plane", "gitlab.com-hosted"),
    account_id: componentId("gitlab_ci", "job-namespace", normalizedIdentifier(claims.job_namespace_id)),
    project_id: componentId("gitlab_ci", "job-project", normalizedIdentifier(claims.job_project_id)),
    runner_pool_id: componentId("gitlab_ci", "runner-environment", claims.runner_environment),
    infrastructure_id: componentId("gitlab_ci", "infrastructure", "shared-unknown"),
    region_id: componentId("gitlab_ci", "region", "shared-unknown"),
    zone_id: componentId("gitlab_ci", "zone", "shared-unknown")
  };
}

function expectedNativePolicy(profile) {
  return profile && profile.native_identity && profile.native_identity.adapter === "gitlab_ci_oidc_v1"
    ? profile.native_identity
    : null;
}

function appraiseGitLabCIOIDCToken(options) {
  const token = parseCompactJwt(options.token);
  const profile = options.profile;
  const nativePolicy = expectedNativePolicy(profile);
  const bundle = options.trustBundle;
  const evaluated = timestamp(options.evaluatedAt);
  const codes = [];
  if (!token) addCode(codes, "GITLAB_OIDC_TOKEN_MALFORMED");
  const trustResult = verifyGitLabCIOIDCTrustBundle(bundle, options.evaluatedAt);
  for (const code of trustResult.codes) addCode(codes, code);
  if (!nativePolicy || profile.provider !== "gitlab_ci") addCode(codes, "GITLAB_OIDC_PROFILE_INVALID");
  if (token && (token.header.alg !== GITLAB_CI_ALGORITHM || token.header.typ !== "JWT" ||
      typeof token.header.kid !== "string" || Object.keys(token.header).some(key => !["alg", "kid", "typ"].includes(key)))) {
    addCode(codes, "GITLAB_OIDC_HEADER_INVALID");
  }
  const key = token && bundle && (bundle.keys || []).find(item => item.kid === token.header.kid);
  if (token && !key) addCode(codes, "GITLAB_OIDC_SIGNING_KEY_UNKNOWN");
  if (token && key) {
    try {
      const publicKey = crypto.createPublicKey({ key: normalizedJwk(key), format: "jwk" });
      if (!crypto.verify("RSA-SHA256", token.signingInput, publicKey, token.signature)) addCode(codes, "GITLAB_OIDC_SIGNATURE_INVALID");
    } catch (error) {
      addCode(codes, "GITLAB_OIDC_SIGNATURE_INVALID");
    }
  }
  const claims = token && token.claims || {};
  if (REQUIRED_CLAIMS.some(name => claims[name] === undefined || claims[name] === null || claims[name] === "") ||
      PROJECTED_CLAIMS.some(name => !IDENTIFIER_CLAIMS.includes(name) && typeof claims[name] !== "string") ||
      IDENTIFIER_CLAIMS.some(name => normalizedIdentifier(claims[name]) === null)) {
    addCode(codes, "GITLAB_OIDC_CLAIMS_INCOMPLETE");
  }
  if (claims.iss !== GITLAB_CI_ISSUER || !nativePolicy || claims.sub !== profile.provider_identity.subject ||
      typeof claims.aud !== "string" || claims.aud !== profile.provider_identity.audience) {
    addCode(codes, "GITLAB_OIDC_IDENTITY_MISMATCH");
  }
  const pinned = profile && profile.provider_identity && profile.provider_identity.required_claims || {};
  if (PINNED_CLAIMS.some(name => typeof pinned[name] !== "string" || pinned[name].length === 0) ||
      Object.entries(pinned).some(([name, value]) => {
        const observed = IDENTIFIER_CLAIMS.includes(name) ? normalizedIdentifier(claims[name]) : claims[name];
        return observed !== value;
      })) {
    addCode(codes, "GITLAB_OIDC_PINNED_CLAIM_MISMATCH");
  }
  if (claims.runner_environment !== "gitlab-hosted" || nativePolicy && nativePolicy.required_runner_environment !== "gitlab-hosted") {
    addCode(codes, "GITLAB_OIDC_RUNNER_UNSUPPORTED");
  }
  if (claims.ref_protected !== "true" || claims.ref_type !== "branch" ||
      claims.ref_path !== `refs/heads/${claims.ref || "missing"}` ||
      nativePolicy && nativePolicy.require_protected_ref !== true) {
    addCode(codes, "GITLAB_OIDC_REF_UNPROTECTED");
  }
  const sameProject = normalizedIdentifier(claims.project_id) === normalizedIdentifier(claims.job_project_id) &&
    claims.project_path === claims.job_project_path &&
    normalizedIdentifier(claims.namespace_id) === normalizedIdentifier(claims.job_namespace_id) &&
    claims.namespace_path === claims.job_namespace_path;
  const configPrefix = `gitlab.com/${claims.job_project_path || "missing"}//`;
  if (!sameProject || nativePolicy && nativePolicy.require_same_project_config !== true ||
      !/^[a-f0-9]{40}$/.test(claims.sha || "") || claims.ci_config_sha !== claims.sha ||
      !String(claims.ci_config_ref_uri || "").startsWith(configPrefix) ||
      !String(claims.ci_config_ref_uri || "").endsWith(`@${claims.ref_path || "missing"}`)) {
    addCode(codes, "GITLAB_OIDC_CONFIG_NOT_IMMUTABLE");
  }
  if (typeof claims.jti !== "string" || claims.jti.length < 8) addCode(codes, "GITLAB_OIDC_STABLE_ID_INVALID");
  const issued = epochTimestamp(claims.iat);
  const notBefore = epochTimestamp(claims.nbf);
  const expires = epochTimestamp(claims.exp);
  const skew = nativePolicy && nativePolicy.clock_skew_seconds * 1000;
  const maxAge = nativePolicy && nativePolicy.max_token_age_seconds * 1000;
  if (evaluated === null || issued === null || notBefore === null || expires === null ||
      expires <= issued || notBefore > expires || evaluated + skew < notBefore || evaluated - skew >= expires ||
      issued > evaluated + skew || evaluated - issued > maxAge) {
    addCode(codes, "GITLAB_OIDC_TOKEN_TIME_INVALID");
  }
  const providerIdentity = token ? {
    issuer: claims.iss,
    subject: claims.sub,
    audience: claims.aud,
    claims: projectedClaims(claims)
  } : null;
  const independence = token ? deriveGitLabCIIndependence(claims) : null;
  return {
    valid: codes.length === 0,
    codes: codes.sort(),
    token_sha256: token ? sha256(token.token) : "none",
    header: token ? clone(token.header) : null,
    claims: token ? clone(token.claims) : null,
    provider_identity: providerIdentity,
    independence,
    issued_at: issued === null ? "none" : new Date(issued).toISOString(),
    not_before: notBefore === null ? "none" : new Date(notBefore).toISOString(),
    expires_at: expires === null ? "none" : new Date(expires).toISOString()
  };
}

function sameRef(left, right) {
  return Boolean(left && right && left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path && left.sha256 === right.sha256);
}

function createGitLabCIOIDCEvidence(options) {
  if (!safeArtifactRef(options.trustBundleReference) ||
      options.trustBundleReference.artifact_id !== (options.trustBundle && options.trustBundle.id)) {
    throw new Error("GitLab CI OIDC evidence requires an exact trust-bundle reference.");
  }
  const result = appraiseGitLabCIOIDCToken(options);
  if (!result.valid) throw new Error(`GitLab CI OIDC token appraisal failed: ${result.codes.join(", ")}`);
  const evidence = {
    schema_version: "0.1",
    type: "GitLabCIOIDCEvidence",
    id: options.id || `GLOIDC-${result.token_sha256.slice(0, 24)}`,
    trust_bundle_ref: clone(options.trustBundleReference),
    compact_jwt: options.token,
    token_sha256: result.token_sha256,
    header: result.header,
    provider_identity: result.provider_identity,
    independence: result.independence,
    issued_at: result.issued_at,
    not_before: result.not_before,
    expires_at: result.expires_at,
    evidence_sha256: ""
  };
  evidence.evidence_sha256 = nativeEvidenceDigest(evidence);
  return evidence;
}

function verifyGitLabCIOIDCEvidence(options) {
  const evidence = options.evidence;
  const codes = [];
  if (!evidence || !exactKeys(evidence, [
    "schema_version", "type", "id", "trust_bundle_ref", "compact_jwt", "token_sha256", "header",
    "provider_identity", "independence", "issued_at", "not_before", "expires_at", "evidence_sha256"
  ]) || evidence.type !== "GitLabCIOIDCEvidence" || evidence.schema_version !== "0.1" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(evidence.id || "") || !safeArtifactRef(evidence.trust_bundle_ref) ||
      !exactKeys(evidence.header, ["alg", "kid", "typ"]) ||
      !exactKeys(evidence.provider_identity, ["issuer", "subject", "audience", "claims"]) ||
      !exactKeys(evidence.provider_identity.claims, PROJECTED_CLAIMS) || !validClaims(evidence.independence)) {
    addCode(codes, "GITLAB_OIDC_EVIDENCE_STRUCTURE_INVALID");
  }
  if (evidence && evidence.evidence_sha256 !== nativeEvidenceDigest(evidence)) addCode(codes, "GITLAB_OIDC_EVIDENCE_DIGEST_INVALID");
  if (!sameRef(evidence && evidence.trust_bundle_ref, options.trustBundleReference)) {
    addCode(codes, "GITLAB_OIDC_TRUST_BUNDLE_REFERENCE_INVALID");
  }
  const profileRef = options.profile && options.profile.native_identity && options.profile.native_identity.trust_bundle_ref;
  if (!sameRef(profileRef, options.trustBundleReference)) addCode(codes, "GITLAB_OIDC_PROFILE_TRUST_BUNDLE_MISMATCH");
  if (!options.trustBundle || !options.trustBundleReference ||
      options.trustBundle.id !== options.trustBundleReference.artifact_id) {
    addCode(codes, "GITLAB_OIDC_TRUST_BUNDLE_REFERENCE_INVALID");
  }
  const result = appraiseGitLabCIOIDCToken({
    token: evidence && evidence.compact_jwt,
    trustBundle: options.trustBundle,
    profile: options.profile,
    evaluatedAt: options.evaluatedAt
  });
  for (const code of result.codes) addCode(codes, code);
  if (evidence && (evidence.token_sha256 !== result.token_sha256 ||
      JSON.stringify(evidence.header) !== JSON.stringify(result.header) ||
      JSON.stringify(evidence.provider_identity) !== JSON.stringify(result.provider_identity) ||
      JSON.stringify(evidence.independence) !== JSON.stringify(result.independence) ||
      evidence.issued_at !== result.issued_at || evidence.not_before !== result.not_before || evidence.expires_at !== result.expires_at)) {
    addCode(codes, "GITLAB_OIDC_EVIDENCE_PROJECTION_INVALID");
  }
  return {
    valid: codes.length === 0,
    codes: codes.sort(),
    evidence_id: evidence && evidence.id,
    token_sha256: result.token_sha256,
    provider_identity: result.provider_identity,
    independence: result.independence,
    valid_until: codes.length === 0 ? result.expires_at : "none"
  };
}

module.exports = {
  GITLAB_CI_ALGORITHM,
  GITLAB_CI_DISCOVERY_URI,
  GITLAB_CI_ISSUER,
  GITLAB_CI_JWKS_URI,
  PINNED_CLAIMS,
  PROJECTED_CLAIMS,
  REQUIRED_CLAIMS,
  appraiseGitLabCIOIDCToken,
  createGitLabCIOIDCEvidence,
  createGitLabCIOIDCTrustBundle,
  deriveGitLabCIIndependence,
  nativeEvidenceDigest,
  parseCompactJwt,
  projectedClaims,
  trustBundleDigest,
  verifyGitLabCIOIDCEvidence,
  verifyGitLabCIOIDCTrustBundle
};
