#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { bundleFromJSON, bundleToJSON } = require("@sigstore/bundle");
const { Verifier, toSignedEntity } = require("@sigstore/verify");
const { canonicalJsonBytes } = require("./verifier-identity-evidence");
const {
  DEFAULT_MAXIMUM_AGE_SECONDS,
  GITHUB_RELEASE_SIGNER_IDENTITY,
  GitHubReleaseTrustError,
  trustMaterialFromGitHubReleaseRoot,
  validateGitHubReleaseTrustedRoot,
  writeJsonAtomic
} = require("./github-release-trusted-root");

const RELEASE_STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
const RELEASE_PREDICATE_TYPE =
  "https://in-toto.io/attestation/release/v0.2";
const BUNDLE_MEDIA_TYPE =
  "application/vnd.dev.sigstore.bundle.v0.3+json";
const VERIFICATION_RESULT_MEDIA_TYPE =
  "application/vnd.dev.sigstore.verificationresult+json;version=0.1";
const PAYLOAD_TYPE = "application/vnd.in-toto+json";
const MINIMUM_SIGSTORE_VERIFY_VERSION = "4.1.0";

class GitHubReleaseBundleVerificationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GitHubReleaseBundleVerificationError";
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

function independentVerificationDigest(document) {
  return digestWithout(document, "verification_sha256");
}

function packageVersion(packageName) {
  const entrypoint = require.resolve(packageName);
  let current = path.dirname(entrypoint);
  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) {
      const manifest = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (manifest.name === packageName) return manifest.version;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new GitHubReleaseBundleVerificationError(
    "GITHUB_RELEASE_INDEPENDENT_VERIFIER_VERSION_UNAVAILABLE",
    `Could not resolve ${packageName} package metadata.`
  );
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value || "");
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(actual, minimum) {
  const left = parseVersion(actual);
  const right = parseVersion(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}

function exactPattern(value) {
  return new RegExp(
    `^${String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    "u"
  );
}

function strictBase64(value) {
  if (typeof value !== "string" || value.length === 0 ||
      value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_PAYLOAD_INVALID",
      "The DSSE payload must use strict canonical base64."
    );
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_PAYLOAD_INVALID",
      "The DSSE payload base64 is not canonical."
    );
  }
  return bytes;
}

function parseStatement(payload) {
  const bytes = strictBase64(payload);
  try {
    return {
      bytes,
      statement: JSON.parse(bytes.toString("utf8"))
    };
  } catch (error) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_STATEMENT_INVALID",
      `The signed DSSE payload is not JSON: ${error.message}`
    );
  }
}

function releasePackageUri(repository, tagName) {
  return `pkg:github/${repository}@${tagName}`;
}

function normalizeExpectedAssets(assets) {
  if (assets === undefined) return null;
  if (!Array.isArray(assets)) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_EXPECTATION_INVALID",
      "Expected assets must be an array when supplied."
    );
  }
  return assets.map(asset => ({
    name: asset && asset.name,
    sha256: asset && asset.sha256
  })).sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function normalizeSignedReleaseStatement(statement, expected) {
  const repository = expected && expected.repository;
  const tagName = expected && expected.tagName;
  const commitSha = expected && expected.commitSha;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "") ||
      !/^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/
        .test(tagName || "") ||
      !/^[a-f0-9]{40}$/.test(commitSha || "")) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_EXPECTATION_INVALID",
      "Independent verification requires an exact repository, stable tag, and full commit."
    );
  }
  const packageUri = releasePackageUri(repository, tagName);
  const subjects = Array.isArray(statement && statement.subject)
    ? statement.subject
    : [];
  const packageSubjects = subjects.filter(subject => subject &&
    subject.uri === packageUri && subject.name === undefined);
  const assets = subjects.filter(subject => subject &&
    typeof subject.name === "string" && subject.uri === undefined)
    .map(subject => ({
      name: subject.name,
      sha256: subject.digest && subject.digest.sha256
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const invalidSubjects = subjects.filter(subject => !subject ||
    !((subject.uri === packageUri && subject.name === undefined) ||
      (typeof subject.name === "string" && subject.uri === undefined)));
  const expectedAssets = normalizeExpectedAssets(expected.assets);
  const predicate = statement && statement.predicate || {};
  if (!statement || statement._type !== RELEASE_STATEMENT_TYPE ||
      statement.predicateType !== RELEASE_PREDICATE_TYPE ||
      predicate.repository !== repository ||
      predicate.tag !== tagName ||
      predicate.purl !== packageUri ||
      packageSubjects.length !== 1 ||
      !packageSubjects[0].digest ||
      packageSubjects[0].digest.sha1 !== commitSha ||
      invalidSubjects.length > 0 ||
      new Set(assets.map(asset => asset.name)).size !== assets.length ||
      assets.some(asset => asset.name.length === 0 ||
        !/^[a-f0-9]{64}$/.test(asset.sha256 || "")) ||
      (expectedAssets && canonicalJsonBytes(expectedAssets).toString("hex") !==
        canonicalJsonBytes(assets).toString("hex"))) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_SCOPE_MISMATCH",
      "The signed statement does not bind the exact repository, tag, commit, package, and asset set."
    );
  }
  return {
    statement_type: statement._type,
    predicate_type: statement.predicateType,
    repository,
    tag_name: tagName,
    package_uri: packageUri,
    commit_sha1: commitSha,
    asset_subjects: assets
  };
}

function certificateFromBundle(bundle) {
  const content = bundle.verificationMaterial &&
    bundle.verificationMaterial.content;
  if (!content) return null;
  if (content.$case === "certificate") {
    return new crypto.X509Certificate(content.certificate.rawBytes);
  }
  if (content.$case === "x509CertificateChain" &&
      content.x509CertificateChain.certificates.length > 0) {
    return new crypto.X509Certificate(
      content.x509CertificateChain.certificates[0].rawBytes
    );
  }
  return null;
}

function verifierImplementation() {
  const version = packageVersion("@sigstore/verify");
  if (!versionAtLeast(version, MINIMUM_SIGSTORE_VERIFY_VERSION)) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_VERIFIER_VERSION_UNSUPPORTED",
      `@sigstore/verify ${MINIMUM_SIGSTORE_VERIFY_VERSION} or newer is required.`
    );
  }
  return {
    package: "@sigstore/verify",
    version,
    minimum_version: MINIMUM_SIGSTORE_VERIFY_VERSION,
    module_sha256: sha256(fs.readFileSync(__filename)),
    dependency_lock_sha256: sha256(
      fs.readFileSync(path.join(__dirname, "package-lock.json"))
    ),
    node_minimum_version: "22.22.2"
  };
}

function verifyGitHubReleaseBundle(options) {
  const rawVerification = options && options.rawVerification;
  const trustedRoot = options && options.trustedRoot;
  const expected = options && options.expected || {};
  const verifiedAt = options && options.verifiedAt ||
    new Date().toISOString();
  if (!rawVerification || typeof rawVerification !== "object" ||
      Array.isArray(rawVerification)) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_INPUT_INVALID",
      "Independent verification requires one raw GitHub verification object."
    );
  }
  const trustedRootIssues = validateGitHubReleaseTrustedRoot(trustedRoot, {
    evaluatedAt: verifiedAt,
    maximumAgeSeconds: Number(
      options.maximumTrustedRootAgeSeconds ||
      DEFAULT_MAXIMUM_AGE_SECONDS
    )
  });
  if (trustedRootIssues.length > 0) {
    throw new GitHubReleaseBundleVerificationError(
      trustedRootIssues[0].code,
      trustedRootIssues[0].message,
      { issues: trustedRootIssues }
    );
  }
  const rawBundle = rawVerification.attestation &&
    rawVerification.attestation.bundle;
  let bundle;
  let normalizedBundle;
  try {
    bundle = bundleFromJSON(rawBundle);
    normalizedBundle = bundleToJSON(bundle);
  } catch (error) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_BUNDLE_PARSE_FAILED",
      `Sigstore bundle parsing failed: ${error.message}`
    );
  }
  if (canonicalJsonBytes(normalizedBundle).toString("hex") !==
      canonicalJsonBytes(rawBundle).toString("hex") ||
      normalizedBundle.mediaType !== BUNDLE_MEDIA_TYPE ||
      !bundle.content || bundle.content.$case !== "dsseEnvelope" ||
      normalizedBundle.dsseEnvelope.payloadType !== PAYLOAD_TYPE ||
      normalizedBundle.dsseEnvelope.signatures.length !== 1) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_BUNDLE_PROFILE_INVALID",
      "Release bundle must be one normalized Sigstore v0.3 DSSE envelope."
    );
  }
  const profile = trustedRoot.verification_profile;
  const tlogEntries = bundle.verificationMaterial.tlogEntries || [];
  const timestamps = bundle.verificationMaterial.timestampVerificationData &&
    bundle.verificationMaterial.timestampVerificationData.rfc3161Timestamps ||
    [];
  if (tlogEntries.length !== profile.tlog_threshold ||
      timestamps.length < profile.timestamp_threshold) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_TIMESTAMP_PROFILE_INVALID",
      "GitHub release bundles require TSA evidence and no transparency-log substitution."
    );
  }

  let signer;
  try {
    const verifier = new Verifier(
      trustMaterialFromGitHubReleaseRoot(trustedRoot, {
        evaluatedAt: verifiedAt,
        maximumAgeSeconds: Number(
          options.maximumTrustedRootAgeSeconds ||
          DEFAULT_MAXIMUM_AGE_SECONDS
        )
      }),
      {
        ctlogThreshold: profile.ctlog_threshold,
        tlogThreshold: profile.tlog_threshold,
        timestampThreshold: profile.timestamp_threshold
      }
    );
    signer = verifier.verify(toSignedEntity(bundle), {
      subjectAlternativeName: exactPattern(
        expected.signerIdentity || GITHUB_RELEASE_SIGNER_IDENTITY
      )
    });
  } catch (error) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_CRYPTOGRAPHIC_VERIFICATION_FAILED",
      `Independent Sigstore verification failed: ${error.message}`,
      { verifier_code: error.code }
    );
  }
  const signerIdentity = signer && signer.identity &&
    signer.identity.subjectAlternativeName;
  if (signerIdentity !==
      (expected.signerIdentity || GITHUB_RELEASE_SIGNER_IDENTITY)) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_SIGNER_MISMATCH",
      "The independently verified certificate identity is not the GitHub release service."
    );
  }
  const parsed = parseStatement(normalizedBundle.dsseEnvelope.payload);
  const statement = normalizeSignedReleaseStatement(
    parsed.statement,
    expected
  );
  const verificationResult = rawVerification.verificationResult || {};
  const resultCertificate = verificationResult.signature &&
    verificationResult.signature.certificate || {};
  if (verificationResult.mediaType !== VERIFICATION_RESULT_MEDIA_TYPE ||
      canonicalJsonBytes(verificationResult.statement).toString("hex") !==
        canonicalJsonBytes(parsed.statement).toString("hex") ||
      resultCertificate.subjectAlternativeName !== signerIdentity) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_CLI_CROSS_CHECK_FAILED",
      "GitHub CLI result metadata diverges from the independently verified signed bundle."
    );
  }
  const certificate = certificateFromBundle(bundle);
  if (!certificate) {
    throw new GitHubReleaseBundleVerificationError(
      "GITHUB_RELEASE_INDEPENDENT_CERTIFICATE_MISSING",
      "The independently verified bundle has no signing certificate."
    );
  }
  const implementation = verifierImplementation();
  const bundleSha256 = sha256(canonicalJsonBytes(normalizedBundle));
  const evidence = {
    schema_version: "0.1",
    type: "GitHubReleaseIndependentVerification",
    id: `GRIV-${expected.tagName.replace(/[^A-Za-z0-9]/g, "_")}-${bundleSha256.slice(0, 12)}`,
    verified_at: new Date(Date.parse(verifiedAt)).toISOString(),
    verifier: implementation,
    trusted_root_ref: {
      artifact_id: trustedRoot.id,
      artifact_sha256: trustedRoot.artifact_sha256,
      trusted_root_sha256: trustedRoot.trusted_root_sha256,
      target_file_sha256: trustedRoot.source.target_file_sha256,
      fetched_at: trustedRoot.source.fetched_at
    },
    profile: {
      bundle_media_type: BUNDLE_MEDIA_TYPE,
      payload_type: PAYLOAD_TYPE,
      signer_identity: signerIdentity,
      ctlog_threshold: profile.ctlog_threshold,
      tlog_threshold: profile.tlog_threshold,
      timestamp_threshold: profile.timestamp_threshold
    },
    bundle: {
      sha256: bundleSha256,
      dsse_payload_sha256: sha256(parsed.bytes),
      signature_count: normalizedBundle.dsseEnvelope.signatures.length,
      tlog_entry_count: tlogEntries.length,
      rfc3161_timestamp_count: timestamps.length,
      certificate_sha256: sha256(certificate.raw)
    },
    statement,
    cli_cross_check: {
      raw_verification_sha256:
        sha256(canonicalJsonBytes(rawVerification)),
      statement_equal: true,
      signer_identity_equal: true
    },
    cryptographic_verification_succeeded: true,
    authority: {
      human_final_decision_authority: "USER",
      monitoring_only: true,
      release_authorized: false
    },
    release_authorized: false
  };
  evidence.verification_sha256 =
    independentVerificationDigest(evidence);
  return evidence;
}

function validateIndependentVerificationEvidence(
  evidence,
  rawVerification,
  trustedRoot,
  expected,
  options = {}
) {
  const issues = [];
  if (!evidence || evidence.schema_version !== "0.1" ||
      evidence.type !== "GitHubReleaseIndependentVerification") {
    return [{
      code: "GITHUB_RELEASE_INDEPENDENT_EVIDENCE_MISSING",
      path: "$",
      message: "Independent GitHub release verification evidence is required."
    }];
  }
  if (evidence.verification_sha256 !==
      independentVerificationDigest(evidence)) {
    issues.push({
      code: "GITHUB_RELEASE_INDEPENDENT_EVIDENCE_DIGEST_MISMATCH",
      path: "$.verification_sha256",
      message: "Independent verification digest does not bind the evidence."
    });
  }
  try {
    const replayed = verifyGitHubReleaseBundle({
      rawVerification,
      trustedRoot,
      expected,
      verifiedAt: evidence.verified_at,
      maximumTrustedRootAgeSeconds:
        options.maximumTrustedRootAgeSeconds
    });
    if (canonicalJsonBytes(replayed).toString("hex") !==
        canonicalJsonBytes(evidence).toString("hex")) {
      issues.push({
        code: "GITHUB_RELEASE_INDEPENDENT_EVIDENCE_REPLAY_MISMATCH",
        path: "$",
        message: "Retained evidence does not equal a fresh independent replay."
      });
    }
  } catch (error) {
    issues.push({
      code: error.code ||
        "GITHUB_RELEASE_INDEPENDENT_EVIDENCE_REPLAY_FAILED",
      path: "$",
      message: error.message
    });
  }
  if (!evidence.authority ||
      evidence.authority.human_final_decision_authority !== "USER" ||
      evidence.authority.monitoring_only !== true ||
      evidence.authority.release_authorized !== false ||
      evidence.release_authorized !== false ||
      evidence.cryptographic_verification_succeeded !== true) {
    issues.push({
      code: "GITHUB_RELEASE_INDEPENDENT_EVIDENCE_AUTHORITY_DRIFT",
      path: "$.authority",
      message: "Independent evidence is monitoring-only and cannot grant release authority."
    });
  }
  return issues;
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new GitHubReleaseBundleVerificationError(
        "GITHUB_RELEASE_INDEPENDENT_ARGUMENT_INVALID",
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

function main() {
  try {
    const options = parseCli(process.argv.slice(2));
    if (options.command !== "verify" || !options.rawVerification ||
        !options.trustedRoot || !options.repository || !options.tag ||
        !options.commit || !options.verifiedAt) {
      throw new GitHubReleaseBundleVerificationError(
        "GITHUB_RELEASE_INDEPENDENT_COMMAND_INVALID",
        "Usage: node github-release-bundle-verifier.js verify --raw-verification <json> --trusted-root <json> --repository <owner/repo> --tag <vX.Y.Z> --commit <sha> --verified-at <timestamp> [--output <json>]"
      );
    }
    const rawVerification = JSON.parse(
      fs.readFileSync(options.rawVerification, "utf8")
    );
    const trustedRoot = JSON.parse(
      fs.readFileSync(options.trustedRoot, "utf8")
    );
    const evidence = verifyGitHubReleaseBundle({
      rawVerification,
      trustedRoot,
      expected: {
        repository: options.repository,
        tagName: options.tag,
        commitSha: options.commit,
        signerIdentity: options.signerIdentity ||
          GITHUB_RELEASE_SIGNER_IDENTITY
      },
      verifiedAt: options.verifiedAt,
      maximumTrustedRootAgeSeconds:
        options.maximumTrustedRootAgeSeconds
    });
    if (options.output) {
      writeJsonAtomic(path.resolve(options.output), evidence);
    }
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } catch (error) {
    const normalized = error instanceof GitHubReleaseTrustError
      ? new GitHubReleaseBundleVerificationError(
        error.code,
        error.message,
        error.details
      )
      : error;
    console.error(JSON.stringify({
      error: normalized.code || normalized.name,
      message: normalized.message,
      details: normalized.details || {}
    }));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  BUNDLE_MEDIA_TYPE,
  GitHubReleaseBundleVerificationError,
  MINIMUM_SIGSTORE_VERIFY_VERSION,
  PAYLOAD_TYPE,
  RELEASE_PREDICATE_TYPE,
  RELEASE_STATEMENT_TYPE,
  independentVerificationDigest,
  normalizeSignedReleaseStatement,
  releasePackageUri,
  validateIndependentVerificationEvidence,
  verifierImplementation,
  verifyGitHubReleaseBundle
};
