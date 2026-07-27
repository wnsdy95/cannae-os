#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { TrustedRoot } = require("@sigstore/protobuf-specs");
const { initTUF } = require("@sigstore/tuf");
const { toTrustMaterial } = require("@sigstore/verify");
const { Metadata, MetadataKind } = require("@tufjs/models");
const { canonicalJsonBytes } = require("./verifier-identity-evidence");

const GITHUB_TUF_MIRROR = "https://tuf-repo.github.com";
const GITHUB_TUF_TARGET = "trusted_root.json";
const GITHUB_TUF_BOOTSTRAP_PATH =
  ".github/tuf/github-release-root.json";
const GITHUB_TUF_BOOTSTRAP_SHA256 =
  "661d12d0fa0e13c5f702caddba0fe012d94c4ab7d947a1c2423b3168a7d092bd";
const GITHUB_TRUSTED_ROOT_MEDIA_TYPE =
  "application/vnd.dev.sigstore.trustedroot+json;version=0.1";
const GITHUB_RELEASE_SIGNER_IDENTITY =
  "https://dotcom.releases.github.com";
const GITHUB_AUTHORITY_ORGANIZATION = "GitHub, Inc.";
const DEFAULT_MAXIMUM_AGE_SECONDS = 24 * 60 * 60;
const MAXIMUM_TUF_ROOT_CHAIN_LENGTH = 100;

const VERIFICATION_PROFILE = Object.freeze({
  bundle_media_type: "application/vnd.dev.sigstore.bundle.v0.3+json",
  signer_identity: GITHUB_RELEASE_SIGNER_IDENTITY,
  certificate_authority_organization: GITHUB_AUTHORITY_ORGANIZATION,
  timestamp_authority_organization: GITHUB_AUTHORITY_ORGANIZATION,
  ctlog_threshold: 0,
  tlog_threshold: 0,
  timestamp_threshold: 1
});

class GitHubReleaseTrustError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GitHubReleaseTrustError";
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function digestWithout(document, field) {
  const copy = JSON.parse(JSON.stringify(document));
  delete copy[field];
  return sha256(canonicalJsonBytes(copy));
}

function trustedRootArtifactDigest(document) {
  return digestWithout(document, "artifact_sha256");
}

function parseTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function issue(code, pathValue, message) {
  return { code, path: pathValue, message };
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 ||
      value !== value.trim() || path.isAbsolute(value) ||
      value.includes("\\") || value.includes("\0")) {
    return false;
  }
  const normalized = path.posix.normalize(value);
  return normalized === value && normalized !== "." &&
    !normalized.startsWith("../");
}

function resolveRepositoryPath(repositoryRoot, relativePath, mustExist) {
  if (!isSafeRelativePath(relativePath)) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TRUST_PATH_UNSAFE",
      `Unsafe repository-relative path: ${relativePath}`
    );
  }
  const root = fs.realpathSync(repositoryRoot);
  const absolute = path.resolve(root, relativePath);
  const fromRoot = path.relative(root, absolute);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TRUST_PATH_ESCAPE",
      "Trusted-root paths must stay beneath the repository root."
    );
  }
  let current = root;
  for (const segment of relativePath.split("/").slice(0, -1)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new GitHubReleaseTrustError(
        "GITHUB_RELEASE_TRUST_PATH_ESCAPE",
        "Trusted-root paths cannot traverse a parent symlink."
      );
    }
  }
  if (mustExist) {
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile() ||
        fs.lstatSync(absolute).isSymbolicLink()) {
      throw new GitHubReleaseTrustError(
        "GITHUB_RELEASE_TRUST_FILE_INVALID",
        `Expected a regular tracked file: ${relativePath}`
      );
    }
    const real = fs.realpathSync(absolute);
    const realFromRoot = path.relative(root, real);
    if (realFromRoot.startsWith("..") || path.isAbsolute(realFromRoot)) {
      throw new GitHubReleaseTrustError(
        "GITHUB_RELEASE_TRUST_PATH_ESCAPE",
        "Trusted-root input resolved outside the repository."
      );
    }
  } else if (fs.existsSync(absolute) &&
      fs.lstatSync(absolute).isSymbolicLink()) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TRUST_PATH_ESCAPE",
      "Trusted-root output cannot be a symlink."
    );
  }
  return { root, absolute, relative_path: relativePath };
}

function normalizeTrustedRoot(value) {
  return TrustedRoot.toJSON(TrustedRoot.fromJSON(value));
}

function metadataProjection(filePath, expectedType, observedAtMs) {
  const bytes = fs.readFileSync(filePath);
  const document = JSON.parse(bytes.toString("utf8"));
  const signed = document && document.signed || {};
  const expiresMs = parseTimestamp(signed.expires);
  if (signed._type !== expectedType ||
      !Number.isInteger(signed.version) || signed.version < 1 ||
      expiresMs === null || expiresMs <= observedAtMs) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_METADATA_INVALID",
      `TUF ${expectedType} metadata is malformed or expired.`
    );
  }
  return {
    type: expectedType,
    version: signed.version,
    expires: new Date(expiresMs).toISOString(),
    sha256: sha256(bytes)
  };
}

function decodeStrictBase64(value, label) {
  if (typeof value !== "string" || value.length === 0 ||
      value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_EVIDENCE_ENCODING_INVALID",
      `${label} is not strict base64.`
    );
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_EVIDENCE_ENCODING_INVALID",
      `${label} is not canonically encoded base64.`
    );
  }
  return bytes;
}

function parseTufMetadata(bytes, expectedType, label) {
  try {
    return Metadata.fromJSON(
      expectedType,
      JSON.parse(bytes.toString("utf8"))
    );
  } catch (error) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_METADATA_INVALID",
      `${label} is not valid ${expectedType} metadata: ${error.message}`
    );
  }
}

function assertMetadataProjection(
  bytes,
  metadataDocument,
  projection,
  expectedType,
  observedAt
) {
  if (!projection || projection.type !== expectedType ||
      projection.version !== metadataDocument.signed.version ||
      projection.expires !==
        new Date(metadataDocument.signed.expires).toISOString() ||
      projection.sha256 !== sha256(bytes) ||
      metadataDocument.signed.isExpired(observedAt)) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_METADATA_BINDING_MISMATCH",
      `Retained ${expectedType} metadata does not match its projection or is expired.`
    );
  }
}

function verifyTargetFileBinding(targetFile, targetBytes) {
  if (!targetFile || targetFile.length !== targetBytes.length ||
      !targetFile.hashes ||
      targetFile.hashes.sha256 !== sha256(targetBytes)) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_TARGET_BINDING_MISMATCH",
      "Signed targets metadata does not bind the retained trusted-root target."
    );
  }
  for (const [algorithm, expectedDigest] of
    Object.entries(targetFile.hashes)) {
    let observedDigest;
    try {
      observedDigest = crypto.createHash(algorithm)
        .update(targetBytes)
        .digest("hex");
    } catch (error) {
      throw new GitHubReleaseTrustError(
        "GITHUB_RELEASE_TUF_TARGET_HASH_UNSUPPORTED",
        `TUF target uses unsupported hash algorithm ${algorithm}.`
      );
    }
    if (observedDigest !== expectedDigest) {
      throw new GitHubReleaseTrustError(
        "GITHUB_RELEASE_TUF_TARGET_BINDING_MISMATCH",
        `TUF target ${algorithm} digest does not match retained bytes.`
      );
    }
  }
}

function verifyRetainedTufEvidence(document, evaluatedAt) {
  const source = document && document.source || {};
  const evidence = source.tuf_evidence || {};
  const metadata = source.metadata || {};
  const fetchedAtMs = parseTimestamp(source.fetched_at);
  const evaluatedAtMs = parseTimestamp(evaluatedAt);
  if (fetchedAtMs === null) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TRUST_TIME_INVALID",
      "Retained TUF evidence requires a valid retrieval time."
    );
  }
  if (evaluatedAtMs === null) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TRUST_EVALUATION_TIME_REQUIRED",
      "Retained TUF evidence requires an explicit evaluation time."
    );
  }
  if (!Array.isArray(evidence.root_chain_base64) ||
      evidence.root_chain_base64.length < 1 ||
      evidence.root_chain_base64.length >
        MAXIMUM_TUF_ROOT_CHAIN_LENGTH ||
      evidence.root_chain_base64.length !== metadata.root.version) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_ROOT_CHAIN_INVALID",
      "Retained TUF root chain must contain every version from 1 through the current root."
    );
  }

  const rootBytes = evidence.root_chain_base64.map((encoded, index) =>
    decodeStrictBase64(encoded, `TUF root v${index + 1}`));
  if (sha256(rootBytes[0]) !== GITHUB_TUF_BOOTSTRAP_SHA256) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_BOOTSTRAP_DIGEST_MISMATCH",
      "Retained TUF root v1 does not match the pinned bootstrap root."
    );
  }

  let trustedRoot = parseTufMetadata(
    rootBytes[0],
    MetadataKind.Root,
    "TUF root v1"
  );
  if (trustedRoot.signed.version !== 1) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_ROOT_CHAIN_INVALID",
      "Retained TUF root chain must begin at version 1."
    );
  }
  try {
    trustedRoot.verifyDelegate(MetadataKind.Root, trustedRoot);
    for (let index = 1; index < rootBytes.length; index += 1) {
      const nextVersion = index + 1;
      const nextRoot = parseTufMetadata(
        rootBytes[index],
        MetadataKind.Root,
        `TUF root v${nextVersion}`
      );
      if (nextRoot.signed.version !== nextVersion ||
          nextRoot.signed.version !== trustedRoot.signed.version + 1) {
        throw new GitHubReleaseTrustError(
          "GITHUB_RELEASE_TUF_ROOT_CHAIN_INVALID",
          "TUF root versions must increase by exactly one."
        );
      }
      trustedRoot.verifyDelegate(MetadataKind.Root, nextRoot);
      nextRoot.verifyDelegate(MetadataKind.Root, nextRoot);
      trustedRoot = nextRoot;
    }
  } catch (error) {
    if (error instanceof GitHubReleaseTrustError) throw error;
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_ROOT_SIGNATURE_INVALID",
      `TUF root rotation signature validation failed: ${error.message}`
    );
  }

  const observedAt = new Date(evaluatedAtMs);
  assertMetadataProjection(
    rootBytes[rootBytes.length - 1],
    trustedRoot,
    metadata.root,
    MetadataKind.Root,
    observedAt
  );

  const timestampBytes = decodeStrictBase64(
    evidence.timestamp_base64,
    "TUF timestamp metadata"
  );
  const snapshotBytes = decodeStrictBase64(
    evidence.snapshot_base64,
    "TUF snapshot metadata"
  );
  const targetsBytes = decodeStrictBase64(
    evidence.targets_base64,
    "TUF targets metadata"
  );
  const timestamp = parseTufMetadata(
    timestampBytes,
    MetadataKind.Timestamp,
    "TUF timestamp"
  );
  const snapshot = parseTufMetadata(
    snapshotBytes,
    MetadataKind.Snapshot,
    "TUF snapshot"
  );
  const targets = parseTufMetadata(
    targetsBytes,
    MetadataKind.Targets,
    "TUF targets"
  );

  try {
    trustedRoot.verifyDelegate(MetadataKind.Timestamp, timestamp);
    timestamp.signed.snapshotMeta.verify(snapshotBytes);
    trustedRoot.verifyDelegate(MetadataKind.Snapshot, snapshot);
    const targetsMeta = snapshot.signed.meta["targets.json"];
    if (!targetsMeta) {
      throw new Error("snapshot does not reference targets.json");
    }
    targetsMeta.verify(targetsBytes);
    trustedRoot.verifyDelegate(MetadataKind.Targets, targets);
    if (timestamp.signed.snapshotMeta.version !== snapshot.signed.version ||
        targetsMeta.version !== targets.signed.version) {
      throw new Error("snapshot or targets metadata version link changed");
    }
  } catch (error) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_METADATA_SIGNATURE_INVALID",
      `TUF metadata signature or version validation failed: ${error.message}`
    );
  }

  assertMetadataProjection(
    timestampBytes,
    timestamp,
    metadata.timestamp,
    MetadataKind.Timestamp,
    observedAt
  );
  assertMetadataProjection(
    snapshotBytes,
    snapshot,
    metadata.snapshot,
    MetadataKind.Snapshot,
    observedAt
  );
  assertMetadataProjection(
    targetsBytes,
    targets,
    metadata.targets,
    MetadataKind.Targets,
    observedAt
  );

  const targetBytes = decodeStrictBase64(
    source.target_base64,
    "GitHub release trusted-root target"
  );
  verifyTargetFileBinding(
    targets.signed.targets[GITHUB_TUF_TARGET],
    targetBytes
  );
  if (source.target_byte_length !== targetBytes.length ||
      source.target_file_sha256 !== sha256(targetBytes)) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_TARGET_BINDING_MISMATCH",
      "Retained target bytes do not match their artifact projection."
    );
  }
  return {
    root_version: trustedRoot.signed.version,
    timestamp_version: timestamp.signed.version,
    snapshot_version: snapshot.signed.version,
    targets_version: targets.signed.version,
    target_file_sha256: sha256(targetBytes)
  };
}

async function fetchBytes(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("empty response");
    }
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTufRootChain(bootstrapBytes, finalVersion, timeoutMs) {
  if (!Number.isInteger(finalVersion) || finalVersion < 1 ||
      finalVersion > MAXIMUM_TUF_ROOT_CHAIN_LENGTH) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_ROOT_CHAIN_INVALID",
      `TUF root version must be between 1 and ${MAXIMUM_TUF_ROOT_CHAIN_LENGTH}.`
    );
  }
  const rootChain = [bootstrapBytes];
  for (let version = 2; version <= finalVersion; version += 1) {
    rootChain.push(await fetchBytes(
      `${GITHUB_TUF_MIRROR}/${version}.root.json`,
      timeoutMs
    ));
  }
  return rootChain;
}

function assertGitHubTrustedRootMaterial(trustedRoot) {
  const certificateAuthorities =
    trustedRoot.certificateAuthorities || [];
  const timestampAuthorities =
    trustedRoot.timestampAuthorities || [];
  const tlogs = trustedRoot.tlogs || [];
  const ctlogs = trustedRoot.ctlogs || [];
  if (trustedRoot.mediaType !== GITHUB_TRUSTED_ROOT_MEDIA_TYPE ||
      certificateAuthorities.length < 1 ||
      timestampAuthorities.length < 1 ||
      tlogs.length !== 0 || ctlogs.length !== 0 ||
      certificateAuthorities.some(authority =>
        !authority.subject ||
        authority.subject.organization !==
          GITHUB_AUTHORITY_ORGANIZATION) ||
      timestampAuthorities.some(authority =>
        !authority.subject ||
        authority.subject.organization !==
          GITHUB_AUTHORITY_ORGANIZATION)) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TRUST_MATERIAL_INVALID",
      "The TUF target is not the exact GitHub Fulcio/TSA release trust profile."
    );
  }
}

function validateBootstrapRoot(bytes) {
  if (sha256(bytes) !== GITHUB_TUF_BOOTSTRAP_SHA256) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_BOOTSTRAP_DIGEST_MISMATCH",
      "The committed GitHub TUF bootstrap root digest changed."
    );
  }
  const document = JSON.parse(bytes.toString("utf8"));
  const signed = document && document.signed || {};
  if (signed._type !== "root" || signed.version !== 1 ||
      !signed.roles || !signed.roles.root ||
      signed.roles.root.threshold !== 3 ||
      !Array.isArray(document.signatures) ||
      document.signatures.length < 3) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_BOOTSTRAP_INVALID",
      "The GitHub TUF bootstrap root is not the pinned threshold root."
    );
  }
  return signed.version;
}

function findTufCacheRoot(cachePath) {
  const direct = path.join(cachePath, "tuf-repo.github.com");
  if (fs.existsSync(direct)) return direct;
  const candidates = fs.readdirSync(cachePath)
    .map(name => path.join(cachePath, name))
    .filter(candidate => fs.statSync(candidate).isDirectory());
  if (candidates.length !== 1) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_CACHE_AMBIGUOUS",
      "Could not identify one verified GitHub TUF cache."
    );
  }
  return candidates[0];
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath =
    `${filePath}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    { mode: 0o600 }
  );
  fs.renameSync(temporaryPath, filePath);
}

async function refreshGitHubReleaseTrustedRoot(options = {}) {
  const repositoryRoot = fs.realpathSync(
    options.repositoryRoot || process.cwd()
  );
  const bootstrap = resolveRepositoryPath(
    repositoryRoot,
    options.bootstrapPath || GITHUB_TUF_BOOTSTRAP_PATH,
    true
  );
  const fetchedAt = options.fetchedAt || new Date().toISOString();
  const fetchedAtMs = parseTimestamp(fetchedAt);
  if (fetchedAtMs === null) {
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TRUST_TIME_INVALID",
      "Trusted-root retrieval time must be a valid timestamp."
    );
  }
  const bootstrapBytes = fs.readFileSync(bootstrap.absolute);
  const bootstrapVersion = validateBootstrapRoot(bootstrapBytes);
  const cachePath = fs.mkdtempSync(
    path.join(os.tmpdir(), "cannae-github-release-tuf-")
  );
  try {
    const tuf = await initTUF({
      cachePath,
      mirrorURL: GITHUB_TUF_MIRROR,
      rootPath: bootstrap.absolute,
      forceCache: true,
      forceInit: true,
      timeout: Number(options.timeoutMs || 10000),
      retry: Number(options.retryCount === undefined
        ? 2
        : options.retryCount)
    });
    const targetText = await tuf.getTarget(GITHUB_TUF_TARGET);
    const targetBytes = Buffer.from(targetText, "utf8");
    const targetFileSha256 = sha256(targetBytes);
    const trustedRoot = normalizeTrustedRoot(JSON.parse(targetText));
    assertGitHubTrustedRootMaterial(trustedRoot);

    const cacheRoot = findTufCacheRoot(cachePath);
    const metadataPaths = {
      root: path.join(cacheRoot, "root.json"),
      timestamp: path.join(cacheRoot, "timestamp.json"),
      snapshot: path.join(cacheRoot, "snapshot.json"),
      targets: path.join(cacheRoot, "targets.json")
    };
    const metadataBytes = Object.fromEntries(
      Object.entries(metadataPaths).map(([type, filePath]) =>
        [type, fs.readFileSync(filePath)])
    );
    const metadata = {
      root: metadataProjection(
        metadataPaths.root,
        "root",
        fetchedAtMs
      ),
      timestamp: metadataProjection(
        metadataPaths.timestamp,
        "timestamp",
        fetchedAtMs
      ),
      snapshot: metadataProjection(
        metadataPaths.snapshot,
        "snapshot",
        fetchedAtMs
      ),
      targets: metadataProjection(
        metadataPaths.targets,
        "targets",
        fetchedAtMs
      )
    };
    const targetsDocument = JSON.parse(metadataBytes.targets.toString("utf8"));
    const targetMetadata = targetsDocument.signed &&
      targetsDocument.signed.targets &&
      targetsDocument.signed.targets[GITHUB_TUF_TARGET];
    if (!targetMetadata ||
        targetMetadata.hashes.sha256 !== targetFileSha256 ||
        targetMetadata.length !== targetBytes.length) {
      throw new GitHubReleaseTrustError(
        "GITHUB_RELEASE_TUF_TARGET_BINDING_MISMATCH",
        "Verified TUF target metadata does not bind the fetched trusted root."
      );
    }
    const rootChain = await fetchTufRootChain(
      bootstrapBytes,
      metadata.root.version,
      Number(options.timeoutMs || 10000)
    );

    const trustedRootSha256 = sha256(canonicalJsonBytes(trustedRoot));
    const artifact = {
      schema_version: "0.1",
      type: "GitHubReleaseTrustedRoot",
      id: `GRTR-${metadata.targets.version}-${trustedRootSha256.slice(0, 12)}`,
      source: {
        tuf_mirror: GITHUB_TUF_MIRROR,
        target_name: GITHUB_TUF_TARGET,
        bootstrap_root: {
          relative_path: bootstrap.relative_path,
          version: bootstrapVersion,
          sha256: GITHUB_TUF_BOOTSTRAP_SHA256
        },
        metadata,
        tuf_evidence: {
          root_chain_base64: rootChain.map(bytes =>
            bytes.toString("base64")),
          timestamp_base64: metadataBytes.timestamp.toString("base64"),
          snapshot_base64: metadataBytes.snapshot.toString("base64"),
          targets_base64: metadataBytes.targets.toString("base64")
        },
        target_base64: targetBytes.toString("base64"),
        target_file_sha256: targetFileSha256,
        target_byte_length: targetBytes.length,
        fetched_at: new Date(fetchedAtMs).toISOString()
      },
      media_type: trustedRoot.mediaType,
      trusted_root: trustedRoot,
      trusted_root_sha256: trustedRootSha256,
      verification_profile: { ...VERIFICATION_PROFILE },
      authority: {
        human_final_decision_authority: "USER",
        monitoring_only: true,
        release_authorized: false
      },
      release_authorized: false
    };
    artifact.artifact_sha256 = trustedRootArtifactDigest(artifact);
    const issues = validateGitHubReleaseTrustedRoot(artifact, {
      evaluatedAt: fetchedAt,
      maximumAgeSeconds: DEFAULT_MAXIMUM_AGE_SECONDS
    });
    if (issues.length > 0) {
      throw new GitHubReleaseTrustError(
        issues[0].code,
        issues[0].message,
        { issues }
      );
    }
    return artifact;
  } catch (error) {
    if (error instanceof GitHubReleaseTrustError) throw error;
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TUF_REFRESH_FAILED",
      `GitHub TUF trusted-root refresh failed: ${error.message}`
    );
  } finally {
    fs.rmSync(cachePath, { recursive: true, force: true });
  }
}

function validateGitHubReleaseTrustedRoot(document, options = {}) {
  const issues = [];
  const source = document && document.source || {};
  const bootstrap = source.bootstrap_root || {};
  const metadata = source.metadata || {};
  const profile = document && document.verification_profile || {};
  const authority = document && document.authority || {};
  if (!document || document.schema_version !== "0.1" ||
      document.type !== "GitHubReleaseTrustedRoot") {
    issues.push(issue(
      "GITHUB_RELEASE_TRUST_STRUCTURE_INVALID",
      "$",
      "Expected a GitHubReleaseTrustedRoot v0.1 artifact."
    ));
    return issues;
  }
  if (document.artifact_sha256 !== trustedRootArtifactDigest(document)) {
    issues.push(issue(
      "GITHUB_RELEASE_TRUST_ARTIFACT_DIGEST_MISMATCH",
      "$.artifact_sha256",
      "Trusted-root artifact digest does not bind the complete artifact."
    ));
  }
  if (source.tuf_mirror !== GITHUB_TUF_MIRROR ||
      source.target_name !== GITHUB_TUF_TARGET ||
      bootstrap.relative_path !== GITHUB_TUF_BOOTSTRAP_PATH ||
      bootstrap.version !== 1 ||
      bootstrap.sha256 !== GITHUB_TUF_BOOTSTRAP_SHA256) {
    issues.push(issue(
      "GITHUB_RELEASE_TRUST_SOURCE_INVALID",
      "$.source",
      "Trusted root must descend from the exact pinned GitHub TUF source."
    ));
  }
  const fetchedAtMs = parseTimestamp(source.fetched_at);
  const evaluatedAtMs = parseTimestamp(options.evaluatedAt);
  const requiredValidUntilProvided =
    options.requiredValidUntil !== undefined &&
    options.requiredValidUntil !== null;
  const requiredValidUntilMs = requiredValidUntilProvided
    ? parseTimestamp(options.requiredValidUntil)
    : null;
  if (evaluatedAtMs === null) {
    issues.push(issue(
      "GITHUB_RELEASE_TRUST_EVALUATION_TIME_REQUIRED",
      "$.source.fetched_at",
      "Trusted-root validation requires an explicit evaluation time."
    ));
  }
  if (requiredValidUntilProvided &&
      (requiredValidUntilMs === null || evaluatedAtMs === null ||
      requiredValidUntilMs < evaluatedAtMs)) {
    issues.push(issue(
      "GITHUB_RELEASE_TRUST_REQUIRED_VALIDITY_INVALID",
      "$.source.metadata",
      "Required trusted-root validity must be a valid time at or after evaluation."
    ));
  }
  for (const type of ["root", "timestamp", "snapshot", "targets"]) {
    const item = metadata[type] || {};
    const expiresMs = parseTimestamp(item.expires);
    if (item.type !== type || !Number.isInteger(item.version) ||
        item.version < 1 || !/^[a-f0-9]{64}$/.test(item.sha256 || "") ||
        expiresMs === null || fetchedAtMs === null ||
        expiresMs <= fetchedAtMs) {
      issues.push(issue(
        "GITHUB_RELEASE_TUF_METADATA_INVALID",
        `$.source.metadata.${type}`,
        `TUF ${type} metadata must be current and digest-bound.`
      ));
    }
    if (expiresMs !== null && evaluatedAtMs !== null &&
        expiresMs <= evaluatedAtMs) {
      issues.push(issue(
        "GITHUB_RELEASE_TUF_METADATA_EXPIRED",
        `$.source.metadata.${type}.expires`,
        `TUF ${type} metadata is expired at the explicit evaluation time.`
      ));
    }
    if (expiresMs !== null && requiredValidUntilMs !== null &&
        expiresMs <= requiredValidUntilMs) {
      issues.push(issue(
        "GITHUB_RELEASE_TUF_METADATA_VALIDITY_TOO_SHORT",
        `$.source.metadata.${type}.expires`,
        `TUF ${type} metadata does not remain valid through the required operation window.`
      ));
    }
  }
  if (evaluatedAtMs !== null) {
    try {
      verifyRetainedTufEvidence(document, options.evaluatedAt);
    } catch (error) {
      issues.push(issue(
        error.code || "GITHUB_RELEASE_TUF_EVIDENCE_INVALID",
        "$.source.tuf_evidence",
        error.message
      ));
    }
  }
  if (!/^[a-f0-9]{64}$/.test(source.target_file_sha256 || "") ||
      !Number.isInteger(source.target_byte_length) ||
      source.target_byte_length < 1) {
    issues.push(issue(
      "GITHUB_RELEASE_TUF_TARGET_INVALID",
      "$.source.target_file_sha256",
      "Trusted-root TUF target must retain its exact file digest and length."
    ));
  }
  let targetBytes = null;
  let targetDocument = null;
  try {
    if (typeof source.target_base64 !== "string" ||
        source.target_base64.length === 0 ||
        source.target_base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(source.target_base64)) {
      throw new Error("TUF target bytes are not strict base64.");
    }
    targetBytes = Buffer.from(source.target_base64, "base64");
    if (targetBytes.toString("base64") !== source.target_base64 ||
        targetBytes.length !== source.target_byte_length ||
        sha256(targetBytes) !== source.target_file_sha256) {
      throw new Error("TUF target bytes do not match their retained length and digest.");
    }
    targetDocument = JSON.parse(targetBytes.toString("utf8"));
  } catch (error) {
    issues.push(issue(
      "GITHUB_RELEASE_TUF_TARGET_BYTES_INVALID",
      "$.source.target_base64",
      error.message
    ));
  }
  let normalized = null;
  try {
    normalized = normalizeTrustedRoot(document.trusted_root);
    assertGitHubTrustedRootMaterial(normalized);
  } catch (error) {
    issues.push(issue(
      error.code || "GITHUB_RELEASE_TRUST_MATERIAL_INVALID",
      "$.trusted_root",
      error.message
    ));
  }
  if (normalized) {
    if (!canonicalJsonBytes(normalized).equals(
      canonicalJsonBytes(document.trusted_root)
    ) || document.media_type !== normalized.mediaType ||
        document.trusted_root_sha256 !==
          sha256(canonicalJsonBytes(normalized))) {
      issues.push(issue(
        "GITHUB_RELEASE_TRUST_NORMALIZATION_MISMATCH",
        "$.trusted_root",
        "Trusted-root bytes, media type, and digest must be normalized."
      ));
    }
    if (targetDocument && !canonicalJsonBytes(normalized).equals(
      canonicalJsonBytes(normalizeTrustedRoot(targetDocument))
    )) {
      issues.push(issue(
        "GITHUB_RELEASE_TUF_TARGET_BINDING_MISMATCH",
        "$.trusted_root",
        "Normalized trusted root does not equal the retained TUF target bytes."
      ));
    }
  }
  if (canonicalJsonBytes(profile).toString("hex") !==
      canonicalJsonBytes(VERIFICATION_PROFILE).toString("hex")) {
    issues.push(issue(
      "GITHUB_RELEASE_TRUST_PROFILE_INVALID",
      "$.verification_profile",
      "The GitHub release verifier profile cannot weaken its exact thresholds or identity."
    ));
  }
  if (authority.human_final_decision_authority !== "USER" ||
      authority.monitoring_only !== true ||
      authority.release_authorized !== false ||
      document.release_authorized !== false) {
    issues.push(issue(
      "GITHUB_RELEASE_TRUST_AUTHORITY_DRIFT",
      "$.authority",
      "Trusted-root evidence is monitoring-only and cannot authorize release."
    ));
  }
  const maximumAgeSeconds = Number(
    options.maximumAgeSeconds ?? DEFAULT_MAXIMUM_AGE_SECONDS
  );
  if (!Number.isInteger(maximumAgeSeconds) ||
      maximumAgeSeconds < 60 || maximumAgeSeconds > 7 * 24 * 60 * 60 ||
      (fetchedAtMs !== null && evaluatedAtMs !== null &&
      (evaluatedAtMs < fetchedAtMs ||
      evaluatedAtMs >= fetchedAtMs + maximumAgeSeconds * 1000))) {
    issues.push(issue(
      "GITHUB_RELEASE_TRUST_STALE",
      "$.source.fetched_at",
      "Trusted-root evidence is future-dated, stale, or outside the bounded age policy."
    ));
  }
  if (Number.isInteger(maximumAgeSeconds) &&
      maximumAgeSeconds >= 60 &&
      maximumAgeSeconds <= 7 * 24 * 60 * 60 &&
      fetchedAtMs !== null && requiredValidUntilMs !== null &&
      requiredValidUntilMs >=
        fetchedAtMs + maximumAgeSeconds * 1000) {
    issues.push(issue(
      "GITHUB_RELEASE_TRUST_VALIDITY_TOO_SHORT",
      "$.source.fetched_at",
      "Trusted-root wrapper freshness does not cover the required operation window."
    ));
  }
  return issues;
}

function trustMaterialFromGitHubReleaseRoot(document, options = {}) {
  const issues = validateGitHubReleaseTrustedRoot(document, options);
  if (issues.length > 0) {
    throw new GitHubReleaseTrustError(
      issues[0].code,
      issues[0].message,
      { issues }
    );
  }
  return toTrustMaterial(TrustedRoot.fromJSON(document.trusted_root));
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new GitHubReleaseTrustError(
        "GITHUB_RELEASE_TRUST_ARGUMENT_INVALID",
        `Unexpected argument: ${token}`
      );
    }
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase());
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = value;
      index += 1;
    }
  }
  return options;
}

async function main() {
  try {
    const options = parseCli(process.argv.slice(2));
    if (options.command === "refresh") {
      if (!options.output) {
        throw new GitHubReleaseTrustError(
          "GITHUB_RELEASE_TRUST_OUTPUT_REQUIRED",
          "refresh requires --output."
        );
      }
      const repositoryRoot = fs.realpathSync(
        options.repositoryRoot || process.cwd()
      );
      const output = resolveRepositoryPath(
        repositoryRoot,
        options.output,
        false
      );
      const artifact = await refreshGitHubReleaseTrustedRoot({
        repositoryRoot,
        bootstrapPath: options.bootstrap ||
          GITHUB_TUF_BOOTSTRAP_PATH,
        fetchedAt: options.fetchedAt,
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount
      });
      writeJsonAtomic(output.absolute, artifact);
      process.stdout.write(`${JSON.stringify({
        id: artifact.id,
        trusted_root_sha256: artifact.trusted_root_sha256,
        artifact_sha256: artifact.artifact_sha256,
        output: output.relative_path,
        release_authorized: false
      }, null, 2)}\n`);
      return;
    }
    if (options.command === "verify") {
      if (!options.input) {
        throw new GitHubReleaseTrustError(
          "GITHUB_RELEASE_TRUST_INPUT_REQUIRED",
          "verify requires --input."
        );
      }
      if (!options.evaluatedAt) {
        throw new GitHubReleaseTrustError(
          "GITHUB_RELEASE_TRUST_EVALUATION_TIME_REQUIRED",
          "verify requires --evaluated-at."
        );
      }
      const document = JSON.parse(fs.readFileSync(options.input, "utf8"));
      const issues = validateGitHubReleaseTrustedRoot(document, {
        evaluatedAt: options.evaluatedAt,
        maximumAgeSeconds: options.maximumAgeSeconds
      });
      process.stdout.write(`${JSON.stringify({
        valid: issues.length === 0,
        issues
      }, null, 2)}\n`);
      if (issues.length > 0) process.exitCode = 1;
      return;
    }
    throw new GitHubReleaseTrustError(
      "GITHUB_RELEASE_TRUST_COMMAND_INVALID",
      "Usage: node github-release-trusted-root.js refresh --repository-root <path> --output <relative.json> [--bootstrap <relative.json>] | verify --input <json> --evaluated-at <timestamp>"
    );
  } catch (error) {
    console.error(JSON.stringify({
      error: error.code || error.name,
      message: error.message,
      details: error.details || {}
    }));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_MAXIMUM_AGE_SECONDS,
  GITHUB_AUTHORITY_ORGANIZATION,
  GITHUB_RELEASE_SIGNER_IDENTITY,
  GITHUB_TRUSTED_ROOT_MEDIA_TYPE,
  GITHUB_TUF_BOOTSTRAP_PATH,
  GITHUB_TUF_BOOTSTRAP_SHA256,
  GITHUB_TUF_MIRROR,
  GITHUB_TUF_TARGET,
  GitHubReleaseTrustError,
  MAXIMUM_TUF_ROOT_CHAIN_LENGTH,
  VERIFICATION_PROFILE,
  decodeStrictBase64,
  normalizeTrustedRoot,
  refreshGitHubReleaseTrustedRoot,
  resolveRepositoryPath,
  sha256,
  trustMaterialFromGitHubReleaseRoot,
  trustedRootArtifactDigest,
  validateGitHubReleaseTrustedRoot,
  verifyRetainedTufEvidence,
  writeJsonAtomic
};
