#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { canonicalJsonBytes } = require("./verifier-identity-evidence");
const {
  MINIMUM_SIGSTORE_VERIFY_VERSION,
  validateIndependentVerificationEvidence,
  verifyGitHubReleaseBundle
} = require("./github-release-bundle-verifier");
const {
  DEFAULT_MAXIMUM_AGE_SECONDS,
  GITHUB_TUF_BOOTSTRAP_PATH,
  GITHUB_TUF_MIRROR,
  validateGitHubReleaseTrustedRoot
} = require("./github-release-trusted-root");

const GITHUB_API_VERSION = "2026-03-10";
const RELEASE_ATTESTATION_MINIMUM_GH_VERSION = "2.93.0";
const RELEASE_ATTESTATION_STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
const RELEASE_ATTESTATION_PREDICATE_TYPE =
  "https://in-toto.io/attestation/release/v0.2";
const RELEASE_ATTESTATION_SIGNER_IDENTITY =
  "https://dotcom.releases.github.com";
const RELEASE_ATTESTATION_BUNDLE_MEDIA_TYPE =
  "application/vnd.dev.sigstore.bundle.v0.3+json";
const CURRENT_RELEASE_SCHEMA_VERSION = "0.4";

class ReleaseAuthorizationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ReleaseAuthorizationError";
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

function authorizationDigest(document) {
  return digestWithout(document, "authorization_sha256");
}

function receiptDigest(document) {
  return digestWithout(document, "receipt_sha256");
}

function userGrantDigest(grant) {
  return digestWithout(grant, "directive_sha256");
}

function parseTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function semanticIssue(code, pathValue, message) {
  return { code, path: pathValue, message };
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() ||
      path.isAbsolute(value) || value.includes("\\") || value.includes("\0")) {
    return false;
  }
  const normalized = path.posix.normalize(value);
  return normalized === value && normalized !== "." && !normalized.startsWith("../");
}

function parseSemverTag(value) {
  const match = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.exec(value || "");
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compareSemverTags(left, right) {
  const a = parseSemverTag(left);
  const b = parseSemverTag(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function compareVersions(left, right) {
  const parse = value => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value || ""));
    return match ? match.slice(1).map(Number) : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function sameCanonicalJson(left, right) {
  return sha256(canonicalJsonBytes(left)) ===
    sha256(canonicalJsonBytes(right));
}

function validateAuthorizationSemantics(document, options = {}) {
  const issues = [];
  const target = document && document.target || {};
  const repository = document && document.repository || {};
  const previous = document && document.previous_release || {};
  const notes = document && document.release_notes || {};
  const validation = document && document.main_validation || {};
  const state = document && document.repository_state || {};
  const review = document && document.release_review || {};
  const grant = document && document.user_grant || {};
  const authority = document && document.authority || {};
  const immutability = document && document.release_immutability || {};

  if (options.requireCurrentVersion === true &&
      (!document ||
      document.schema_version !== CURRENT_RELEASE_SCHEMA_VERSION)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_AUTHORIZATION_VERSION_DOWNGRADE",
      "$.schema_version",
      `Active publication requires authorization schema ${CURRENT_RELEASE_SCHEMA_VERSION}.`
    ));
  }
  if (document && document.authorization_sha256 !== authorizationDigest(document)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_AUTHORIZATION_DIGEST_MISMATCH",
      "$.authorization_sha256",
      "Authorization digest must bind the complete authorization document."
    ));
  }
  if (document && (document.release_authorized !== true ||
      document.single_use !== true || document.consumed !== false)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_AUTHORIZATION_NOT_SINGLE_USE",
      "$.release_authorized",
      "Only one unconsumed, single-use terminal authorization may carry release_authorized true."
    ));
  }
  if (authority.human_final_decision_authority !== "USER" ||
      authority.self_approval_prohibited !== true ||
      authority.ai_approval_accepted !== false ||
      authority.release_authorized !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_AUTHORITY_DRIFT",
      "$.authority",
      "The human USER must retain final authority and AI self-approval must remain prohibited."
    ));
  }
  if (grant.authority !== "USER" || grant.scope !== "single_github_release" ||
      grant.approved !== true || grant.directive_sha256 !== userGrantDigest(grant)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_USER_GRANT_INVALID",
      "$.user_grant",
      "The exact single-release USER grant and its canonical digest must be valid."
    ));
  }
  if (grant.repository !== repository.full_name ||
      grant.tag_name !== target.tag_name ||
      grant.target_commit_sha !== target.commit_sha ||
      grant.release_notes_sha256 !== notes.sha256) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_USER_GRANT_SCOPE_MISMATCH",
      "$.user_grant",
      "The USER grant must bind the exact repository, tag, commit, and release-notes digest."
    ));
  }
  if (repository.origin_full_name !== repository.full_name) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_ORIGIN_SCOPE_MISMATCH",
      "$.repository.origin_full_name",
      "The normalized Git origin repository must equal the authorized GitHub repository."
    ));
  }
  if (document &&
      ["0.2", "0.3", "0.4"].includes(document.schema_version)) {
    const checkedAt = parseTimestamp(immutability.checked_at);
    const issuedAt = parseTimestamp(document.issued_at);
    if (immutability.api_version !== GITHUB_API_VERSION ||
        immutability.enabled !== true ||
        typeof immutability.enforced_by_owner !== "boolean" ||
        checkedAt === null || issuedAt === null || checkedAt > issuedAt) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_IMMUTABILITY_NOT_VERIFIED",
        "$.release_immutability",
        "Release authorization v0.2 or later requires current repository release immutability evidence."
      ));
    }
  }
  if (document &&
      ["0.3", "0.4"].includes(document.schema_version)) {
    const attestation = document.release_attestation || {};
    if (attestation.required !== true ||
        attestation.verifier_tool !== "gh" ||
        attestation.minimum_verifier_version !==
          RELEASE_ATTESTATION_MINIMUM_GH_VERSION ||
        attestation.output_format !== "json" ||
        attestation.statement_type !== RELEASE_ATTESTATION_STATEMENT_TYPE ||
        attestation.predicate_type !== RELEASE_ATTESTATION_PREDICATE_TYPE ||
        attestation.signer_identity !== RELEASE_ATTESTATION_SIGNER_IDENTITY ||
        attestation.source_archives_in_scope !== false) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_ATTESTATION_POLICY_INVALID",
        "$.release_attestation",
        "Release authorization v0.3 or later requires the exact GitHub release-attestation verification profile."
      ));
    }
    if (document.schema_version === "0.4" &&
        (attestation.independent_verification_required !== true ||
        attestation.independent_verifier_package !== "@sigstore/verify" ||
        attestation.minimum_independent_verifier_version !==
          MINIMUM_SIGSTORE_VERIFY_VERSION ||
        attestation.trusted_root_tuf_mirror !== GITHUB_TUF_MIRROR ||
        attestation.trusted_root_bootstrap_path !==
          GITHUB_TUF_BOOTSTRAP_PATH ||
        attestation.maximum_trusted_root_age_seconds !==
          DEFAULT_MAXIMUM_AGE_SECONDS)) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_INDEPENDENT_VERIFICATION_POLICY_INVALID",
        "$.release_attestation",
        "Release authorization v0.4 requires the exact independent Sigstore and GitHub TUF profile."
      ));
    }
  }
  if (target.draft !== false || target.prerelease !== false ||
      target.latest !== true || target.fail_on_no_commits !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TARGET_MODE_INVALID",
      "$.target",
      "The authorized release must be a latest, non-draft, non-prerelease release with no-commit failure enabled."
    ));
  }
  if (compareSemverTags(target.tag_name, previous.tag_name) !== 1 ||
      target.commit_sha === previous.commit_sha) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_VERSION_NOT_ADVANCING",
      "$.previous_release",
      "The target tag must be greater than the previous release and point to a different commit."
    ));
  }
  if (!isSafeRelativePath(notes.relative_path)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_NOTES_PATH_UNSAFE",
      "$.release_notes.relative_path",
      "Release notes must use a normalized repository-relative path."
    ));
  }
  if (validation.head_sha !== target.commit_sha ||
      validation.head_branch !== repository.default_branch) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_CI_TARGET_MISMATCH",
      "$.main_validation",
      "The successful main validation run must bind the exact release commit and default branch."
    ));
  }
  if (validation.workflow_name !== "Validate" ||
      validation.required_check !== "Doctrine and runtime checks" ||
      !Number.isInteger(validation.required_check_job_id) ||
      validation.required_check_job_id < 1 ||
      validation.required_check_status !== "completed" ||
      validation.required_check_conclusion !== "success" ||
      validation.event !== "push" || validation.status !== "completed" ||
      validation.conclusion !== "success") {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_CI_NOT_SUCCESSFUL",
      "$.main_validation",
      "The exact default-branch Validate push run and required check must have completed successfully."
    ));
  }
  if (state.branch !== repository.default_branch ||
      state.head_sha !== target.commit_sha ||
      state.origin_default_branch_sha !== target.commit_sha ||
      state.clean !== true || state.tag_absent !== true ||
      state.release_absent !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_REPOSITORY_STATE_MISMATCH",
      "$.repository_state",
      "Authorization requires a clean default branch at the exact origin commit with no target tag or release."
    ));
  }
  if (review.reviewed_by !== "USER" || review.decision !== "approve" ||
      review.repository_visibility !== "PUBLIC" ||
      review.target_was_already_public !== true ||
      review.reviewed_commit_sha !== target.commit_sha ||
      review.reviewed_release_notes_sha256 !== notes.sha256) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_REVIEW_SCOPE_MISMATCH",
      "$.release_review",
      "The USER release decision must bind the already-public exact commit and release notes."
    ));
  }

  const issuedAt = parseTimestamp(document && document.issued_at);
  const expiresAt = parseTimestamp(document && document.expires_at);
  const grantedAt = parseTimestamp(grant.granted_at);
  const grantExpiresAt = parseTimestamp(grant.expires_at);
  const reviewedAt = parseTimestamp(review.reviewed_at);
  if (issuedAt === null || expiresAt === null || grantedAt === null ||
      grantExpiresAt === null || reviewedAt === null ||
      grantedAt > issuedAt || reviewedAt > issuedAt ||
      issuedAt >= expiresAt || expiresAt !== grantExpiresAt ||
      expiresAt - issuedAt > 60 * 60 * 1000) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_VALIDITY_INVALID",
      "$.expires_at",
      "Grant, review, issue, and expiry times must form one ordered bounded validity window."
    ));
  }
  if (options.requireFresh === true) {
    const now = parseTimestamp(options.now || new Date().toISOString());
    if (now === null || issuedAt === null || expiresAt === null ||
        now < issuedAt || now >= expiresAt) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_AUTHORIZATION_EXPIRED",
        "$.expires_at",
        "The single-use release authorization is not currently valid."
      ));
    }
  }

  return issues;
}

function validateReceiptSemantics(document, options = {}) {
  const issues = [];
  const target = document && document.target || {};
  const release = document && document.release || {};
  const authority = document && document.authority || {};

  if (options.requireCurrentVersion === true &&
      (!document ||
      document.schema_version !== CURRENT_RELEASE_SCHEMA_VERSION)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_RECEIPT_VERSION_DOWNGRADE",
      "$.schema_version",
      `Active publication requires receipt schema ${CURRENT_RELEASE_SCHEMA_VERSION}.`
    ));
  }
  if (document && document.receipt_sha256 !== receiptDigest(document)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_RECEIPT_DIGEST_MISMATCH",
      "$.receipt_sha256",
      "Receipt digest must bind the complete terminal release record."
    ));
  }
  if (document && (document.release_authorized !== true ||
      document.authorization_consumed !== true ||
      document.published !== true || document.verified !== true)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_RECEIPT_NOT_TERMINAL",
      "$.verified",
      "A release receipt must record consumed authorization and a published, verified release."
    ));
  }
  if (authority.human_final_decision_authority !== "USER" ||
      authority.self_approval_prohibited !== true ||
      authority.release_authorized !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_RECEIPT_AUTHORITY_DRIFT",
      "$.authority",
      "The terminal receipt must preserve USER final authority."
    ));
  }
  if (release.tag_name !== target.tag_name ||
      release.target_commitish !== target.commit_sha ||
      release.resolved_tag_commit_sha !== target.commit_sha ||
      release.draft !== false || release.prerelease !== false ||
      release.latest !== true ||
      target.draft !== false || target.prerelease !== false ||
      target.latest !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_RECEIPT_TARGET_MISMATCH",
      "$.release",
      "The observed GitHub release and resolved tag must match the exact authorized target."
    ));
  }
  if (document &&
      ["0.2", "0.3", "0.4"].includes(document.schema_version) &&
      release.immutable !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_RECEIPT_NOT_IMMUTABLE",
      "$.release.immutable",
      "Release receipt v0.2 or later requires the observed GitHub release to be immutable."
    ));
  }
  if (document &&
      ["0.3", "0.4"].includes(document.schema_version)) {
    const attestationIssues = validateReleaseAttestationEvidence(
      document.attestation,
      {
        repository: document.repository && document.repository.full_name,
        tagName: target.tag_name,
        commitSha: target.commit_sha,
        minimumVerifierVersion: RELEASE_ATTESTATION_MINIMUM_GH_VERSION,
        statementType: RELEASE_ATTESTATION_STATEMENT_TYPE,
        predicateType: RELEASE_ATTESTATION_PREDICATE_TYPE,
        signerIdentity: RELEASE_ATTESTATION_SIGNER_IDENTITY
      }
    );
    for (const attestationIssue of attestationIssues) {
      issues.push(semanticIssue(
        attestationIssue.code,
        `$.attestation${attestationIssue.path === "$" ? "" :
          attestationIssue.path.slice(1)}`,
        attestationIssue.message
      ));
    }
  }
  if (document && document.schema_version === "0.4") {
    const independentIssues = validateIndependentVerificationEvidence(
      document.independent_verification,
      document.attestation && document.attestation.raw_verification,
      document.trusted_root,
      {
        repository: document.repository && document.repository.full_name,
        tagName: target.tag_name,
        commitSha: target.commit_sha,
        signerIdentity: RELEASE_ATTESTATION_SIGNER_IDENTITY
      },
      {
        maximumTrustedRootAgeSeconds:
          DEFAULT_MAXIMUM_AGE_SECONDS
      }
    );
    for (const independentIssue of independentIssues) {
      issues.push(semanticIssue(
        independentIssue.code,
        `$.independent_verification${
          independentIssue.path === "$"
            ? ""
            : independentIssue.path.slice(1)
        }`,
        independentIssue.message
      ));
    }
  }
  if (!isSafeRelativePath(document && document.authorization_ref &&
      document.authorization_ref.relative_path)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_RECEIPT_AUTH_PATH_UNSAFE",
      "$.authorization_ref.relative_path",
      "The authorization reference must use a normalized repository-relative path."
    ));
  }
  const publishedAt = parseTimestamp(release.published_at);
  const recordedAt = parseTimestamp(document && document.recorded_at);
  if (publishedAt === null || recordedAt === null || recordedAt < publishedAt) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_RECEIPT_TIME_INVALID",
      "$.recorded_at",
      "The terminal receipt must be recorded at or after the observed publication time."
    ));
  }
  return issues;
}

function commandResult(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) {
    throw new ReleaseAuthorizationError(
      "COMMAND_START_FAILED",
      `Could not start ${executable}: ${result.error.message}`
    );
  }
  return result;
}

function requireCommand(executable, args, options = {}) {
  const result = commandResult(executable, args, options);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new ReleaseAuthorizationError(
      options.code || "COMMAND_FAILED",
      `${executable} ${args.join(" ")} failed.${detail ? ` ${detail}` : ""}`,
      { status: result.status }
    );
  }
  return result.stdout.trim();
}

function parseJsonOutput(output, code) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new ReleaseAuthorizationError(code, `Command returned invalid JSON: ${error.message}`);
  }
}

function parseGhVersionOutput(output) {
  const match = /^gh version (\d+\.\d+\.\d+)\b/m.exec(String(output || ""));
  if (!match) {
    throw new ReleaseAuthorizationError(
      "GITHUB_CLI_VERSION_INVALID",
      "Could not parse the installed GitHub CLI version."
    );
  }
  return match[1];
}

function releasePackageUri(repository, tagName) {
  return `pkg:github/${repository}@${tagName}`;
}

function decodeDssePayload(value) {
  if (typeof value !== "string" || value.length === 0 ||
      value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_ATTESTATION_PAYLOAD_INVALID",
      "Release attestation DSSE payload must be strict base64."
    );
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_ATTESTATION_PAYLOAD_INVALID",
      "Release attestation DSSE payload is not canonical base64."
    );
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_ATTESTATION_PAYLOAD_INVALID",
      `Release attestation DSSE payload is not JSON: ${error.message}`
    );
  }
}

function normalizeReleaseAttestationEvidence(rawVerification, options) {
  if (!rawVerification || typeof rawVerification !== "object" ||
      Array.isArray(rawVerification)) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_ATTESTATION_OUTPUT_INVALID",
      "GitHub release verification must return one JSON object."
    );
  }
  const repository = options && options.repository;
  const tagName = options && options.tagName;
  const commitSha = options && options.commitSha;
  const ghVersion = options && options.ghVersion;
  const verifiedAt = options && options.verifiedAt;
  const minimumVerifierVersion = options && options.minimumVerifierVersion ||
    RELEASE_ATTESTATION_MINIMUM_GH_VERSION;
  const statementType = options && options.statementType ||
    RELEASE_ATTESTATION_STATEMENT_TYPE;
  const predicateType = options && options.predicateType ||
    RELEASE_ATTESTATION_PREDICATE_TYPE;
  const signerIdentity = options && options.signerIdentity ||
    RELEASE_ATTESTATION_SIGNER_IDENTITY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "") ||
      !parseSemverTag(tagName) ||
      !/^[a-f0-9]{40}$/.test(commitSha || "") ||
      compareVersions(ghVersion, minimumVerifierVersion) === null ||
      compareVersions(ghVersion, minimumVerifierVersion) === -1 ||
      parseTimestamp(verifiedAt) === null) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_ATTESTATION_EXPECTATION_INVALID",
      "Release-attestation verification requires an exact repository, stable tag, commit, supported gh version, and timestamp."
    );
  }

  const attestation = rawVerification.attestation || {};
  const bundle = attestation.bundle || {};
  const envelope = bundle.dsseEnvelope || {};
  const result = rawVerification.verificationResult || {};
  const statement = result.statement || {};
  const envelopeStatement = decodeDssePayload(envelope.payload);
  const predicate = statement.predicate || {};
  const certificate = result.signature && result.signature.certificate || {};
  const subjects = Array.isArray(statement.subject) ? statement.subject : [];
  const packageUri = releasePackageUri(repository, tagName);
  const packageSubjects = subjects.filter(subject => subject &&
    subject.uri === packageUri && subject.name === undefined);
  const assetSubjects = subjects.filter(subject => subject &&
    typeof subject.name === "string" && subject.uri === undefined);
  const invalidSubjects = subjects.filter(subject => !subject ||
    !((subject.uri === packageUri && subject.name === undefined) ||
      (typeof subject.name === "string" && subject.uri === undefined)));
  const duplicateAssets = new Set(assetSubjects.map(subject => subject.name)).size !==
    assetSubjects.length;
  const normalizedAssets = assetSubjects.map(subject => ({
    name: subject.name,
    sha256: subject.digest && subject.digest.sha256
  })).sort((left, right) => left.name.localeCompare(right.name));
  const timestamps = Array.isArray(result.verifiedTimestamps)
    ? result.verifiedTimestamps.map(timestamp => ({
      type: timestamp && timestamp.type,
      uri: timestamp && timestamp.uri,
      timestamp: timestamp && timestamp.timestamp
    }))
    : [];
  const verifiedAtMs = parseTimestamp(verifiedAt);
  const timestampsValid = timestamps.length > 0 && timestamps.every(timestamp =>
    typeof timestamp.type === "string" && timestamp.type.length > 0 &&
    typeof timestamp.uri === "string" && timestamp.uri.length > 0 &&
    parseTimestamp(timestamp.timestamp) !== null &&
    parseTimestamp(timestamp.timestamp) <= verifiedAtMs);

  if (bundle.mediaType !== RELEASE_ATTESTATION_BUNDLE_MEDIA_TYPE ||
      envelope.payloadType !== "application/vnd.in-toto+json" ||
      typeof envelope.payload !== "string" || envelope.payload.length === 0 ||
      !Array.isArray(envelope.signatures) || envelope.signatures.length < 1 ||
      envelope.signatures.some(signature =>
        !signature || typeof signature.sig !== "string" ||
        signature.sig.length === 0) ||
      typeof result.mediaType !== "string" ||
      !result.mediaType.startsWith(
        "application/vnd.dev.sigstore.verificationresult+json"
      ) ||
      statement._type !== statementType ||
      !sameCanonicalJson(envelopeStatement, statement) ||
      statement.predicateType !== predicateType ||
      predicate.repository !== repository ||
      predicate.tag !== tagName ||
      predicate.purl !== packageUri ||
      packageSubjects.length !== 1 ||
      !packageSubjects[0].digest ||
      packageSubjects[0].digest.sha1 !== commitSha ||
      invalidSubjects.length > 0 ||
      duplicateAssets ||
      normalizedAssets.some(asset =>
        asset.name.length === 0 ||
        !/^[a-f0-9]{64}$/.test(asset.sha256 || "")) ||
      certificate.subjectAlternativeName !== signerIdentity ||
      typeof certificate.certificateIssuer !== "string" ||
      certificate.certificateIssuer.length === 0 ||
      !timestampsValid) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_ATTESTATION_SCOPE_MISMATCH",
      "The verified GitHub attestation does not bind the exact repository, tag, commit, signer, predicate, or asset digest set."
    );
  }

  const rawCopy = JSON.parse(JSON.stringify(rawVerification));
  return {
    verification_succeeded: true,
    verifier: {
      tool: "gh",
      version: ghVersion,
      minimum_version: minimumVerifierVersion,
      command: [
        "release",
        "verify",
        tagName,
        "--repo",
        repository,
        "--format",
        "json"
      ],
      output_format: "json"
    },
    verified_at: verifiedAt,
    attestation_sha256: sha256(canonicalJsonBytes(rawCopy)),
    bundle_media_type: bundle.mediaType,
    verification_result_media_type: result.mediaType,
    certificate: {
      issuer: certificate.certificateIssuer,
      subject_alternative_name: certificate.subjectAlternativeName
    },
    verified_timestamps: timestamps,
    statement: {
      statement_type: statement._type,
      predicate_type: statement.predicateType,
      repository,
      tag_name: tagName,
      package_uri: packageUri,
      commit_sha1: commitSha,
      asset_subjects: normalizedAssets
    },
    raw_verification: rawCopy
  };
}

function validateReleaseAttestationEvidence(evidence, expected) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return [{
      code: "GITHUB_RELEASE_ATTESTATION_EVIDENCE_MISSING",
      path: "$",
      message: "Release receipt v0.3 requires retained GitHub attestation evidence."
    }];
  }
  try {
    const normalized = normalizeReleaseAttestationEvidence(
      evidence.raw_verification,
      {
        repository: expected.repository,
        tagName: expected.tagName,
        commitSha: expected.commitSha,
        ghVersion: evidence.verifier && evidence.verifier.version,
        verifiedAt: evidence.verified_at,
        minimumVerifierVersion: expected.minimumVerifierVersion,
        statementType: expected.statementType,
        predicateType: expected.predicateType,
        signerIdentity: expected.signerIdentity
      }
    );
    if (sha256(canonicalJsonBytes(normalized)) !==
        sha256(canonicalJsonBytes(evidence))) {
      return [{
        code: "GITHUB_RELEASE_ATTESTATION_EVIDENCE_MISMATCH",
        path: "$",
        message: "Retained attestation evidence must equal the normalized verified GitHub output."
      }];
    }
  } catch (error) {
    return [{
      code: error.code || "GITHUB_RELEASE_ATTESTATION_EVIDENCE_INVALID",
      path: "$",
      message: error.message
    }];
  }
  return [];
}

function verifyReleaseAttestationWithRetry(document, runtime, options = {}) {
  const attempts = Number(options.attempts || 6);
  const intervalSeconds = Number(options.intervalSeconds || 10);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 12 ||
      !Number.isInteger(intervalSeconds) || intervalSeconds < 1 ||
      intervalSeconds > 60) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_ATTESTATION_RETRY_INVALID",
      "Attestation retry attempts and interval are outside the bounded profile."
    );
  }
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const observed = runtime.inspectReleaseAttestation(
        document.repository.full_name,
        document.target.tag_name
      );
      return normalizeReleaseAttestationEvidence(observed.raw_verification, {
        repository: document.repository.full_name,
        tagName: document.target.tag_name,
        commitSha: document.target.commit_sha,
        ghVersion: observed.gh_version,
        verifiedAt: runtime.now(),
        minimumVerifierVersion:
          document.release_attestation.minimum_verifier_version,
        statementType: document.release_attestation.statement_type,
        predicateType: document.release_attestation.predicate_type,
        signerIdentity: document.release_attestation.signer_identity
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) runtime.sleep(intervalSeconds * 1000);
    }
  }
  throw new ReleaseAuthorizationError(
    "GITHUB_RELEASE_ATTESTATION_UNAVAILABLE",
    `GitHub release attestation did not verify after ${attempts} attempt(s).`,
    {
      last_code: lastError && lastError.code,
      last_message: lastError && lastError.message
    }
  );
}

function loadTrustedRootForRelease(
  repositoryRoot,
  relativePath,
  verifiedAt,
  requiredValidUntil
) {
  if (!relativePath) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_TRUSTED_ROOT_REQUIRED",
      "Active publication requires a repository-contained trusted-root artifact."
    );
  }
  if (!isSafeRelativePath(relativePath)) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_TRUSTED_ROOT_PATH_UNSAFE",
      "Independent release verification requires a repository-relative trusted-root artifact."
    );
  }
  const root = fs.realpathSync(repositoryRoot);
  const absolute = path.resolve(root, relativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile() ||
      fs.lstatSync(absolute).isSymbolicLink()) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_TRUSTED_ROOT_MISSING",
      `Trusted-root artifact does not exist: ${relativePath}`
    );
  }
  const real = fs.realpathSync(absolute);
  const fromRoot = path.relative(root, real);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_TRUSTED_ROOT_PATH_ESCAPE",
      "Trusted-root artifact must resolve beneath the release repository."
    );
  }
  let trustedRoot;
  try {
    trustedRoot = JSON.parse(fs.readFileSync(real, "utf8"));
  } catch (error) {
    throw new ReleaseAuthorizationError(
      "GITHUB_RELEASE_TRUSTED_ROOT_INVALID",
      `Trusted-root artifact is not JSON: ${error.message}`
    );
  }
  const issues = validateGitHubReleaseTrustedRoot(trustedRoot, {
    evaluatedAt: verifiedAt,
    maximumAgeSeconds: DEFAULT_MAXIMUM_AGE_SECONDS,
    requiredValidUntil
  });
  if (issues.length > 0) {
    throw new ReleaseAuthorizationError(
      issues[0].code,
      issues[0].message,
      { issues }
    );
  }
  return trustedRoot;
}

function independentlyVerifyReleaseAttestation(
  document,
  attestation,
  trustedRoot
) {
  try {
    return verifyGitHubReleaseBundle({
      rawVerification: attestation.raw_verification,
      trustedRoot,
      expected: {
        repository: document.repository.full_name,
        tagName: document.target.tag_name,
        commitSha: document.target.commit_sha,
        signerIdentity: document.release_attestation.signer_identity,
        assets: attestation.statement.asset_subjects
      },
      verifiedAt: attestation.verified_at,
      maximumTrustedRootAgeSeconds:
        document.release_attestation.maximum_trusted_root_age_seconds
    });
  } catch (error) {
    throw new ReleaseAuthorizationError(
      error.code ||
        "GITHUB_RELEASE_INDEPENDENT_VERIFICATION_FAILED",
      error.message,
      error.details || {}
    );
  }
}

function resolveRepositoryFile(repositoryRoot, relativePath) {
  if (!isSafeRelativePath(relativePath)) {
    throw new ReleaseAuthorizationError(
      "RELEASE_NOTES_PATH_UNSAFE",
      `Unsafe repository-relative path: ${relativePath}`
    );
  }
  const root = fs.realpathSync(repositoryRoot);
  const candidate = path.resolve(root, relativePath);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    throw new ReleaseAuthorizationError(
      "RELEASE_NOTES_MISSING",
      `Release notes file does not exist: ${relativePath}`
    );
  }
  const realCandidate = fs.realpathSync(candidate);
  const fromRoot = path.relative(root, realCandidate);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    throw new ReleaseAuthorizationError(
      "RELEASE_NOTES_PATH_ESCAPE",
      "Release notes must resolve inside the target repository."
    );
  }
  return realCandidate;
}

function inspectReleaseNotes(repositoryRoot, relativePath) {
  const absolutePath = resolveRepositoryFile(repositoryRoot, relativePath);
  const bytes = fs.readFileSync(absolutePath);
  return {
    relative_path: relativePath,
    absolute_path: absolutePath,
    sha256: sha256(bytes),
    byte_length: bytes.length
  };
}

function normalizeVisibility(value) {
  return String(value || "").toUpperCase();
}

function githubRepositoryFromRemote(remoteUrl) {
  const value = String(remoteUrl || "").trim();
  const match = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(value);
  return match ? match[1] : null;
}

class SystemGitHubReleaseAdapter {
  constructor(repositoryRoot) {
    this.repositoryRoot = fs.realpathSync(repositoryRoot);
  }

  now() {
    return new Date().toISOString();
  }

  sleep(milliseconds) {
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)),
      0,
      0,
      milliseconds
    );
  }

  inspectGhVersion() {
    return parseGhVersionOutput(requireCommand(
      "gh",
      ["--version"],
      { cwd: this.repositoryRoot, code: "GITHUB_CLI_VERSION_INSPECTION_FAILED" }
    ));
  }

  inspectReleaseAttestation(repository, tagName) {
    const rawVerification = parseJsonOutput(requireCommand(
      "gh",
      [
        "release",
        "verify",
        tagName,
        "--repo",
        repository,
        "--format",
        "json"
      ],
      {
        cwd: this.repositoryRoot,
        code: "GITHUB_RELEASE_ATTESTATION_VERIFY_FAILED"
      }
    ), "GITHUB_RELEASE_ATTESTATION_JSON_INVALID");
    return {
      gh_version: this.inspectGhVersion(),
      raw_verification: rawVerification
    };
  }

  inspectRepository() {
    const topLevel = requireCommand(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: this.repositoryRoot, code: "NOT_A_GIT_REPOSITORY" }
    );
    const root = fs.realpathSync(topLevel);
    if (root !== this.repositoryRoot) {
      throw new ReleaseAuthorizationError(
        "REPOSITORY_ROOT_MISMATCH",
        `Expected repository root ${this.repositoryRoot}, got ${root}.`
      );
    }
    const branch = requireCommand(
      "git",
      ["branch", "--show-current"],
      { cwd: root, code: "GIT_BRANCH_INSPECTION_FAILED" }
    );
    const headSha = requireCommand(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: root, code: "GIT_HEAD_INSPECTION_FAILED" }
    );
    const status = requireCommand(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      { cwd: root, code: "GIT_STATUS_INSPECTION_FAILED" }
    );
    const originUrl = requireCommand(
      "git",
      ["remote", "get-url", "origin"],
      { cwd: root, code: "ORIGIN_REMOTE_INSPECTION_FAILED" }
    );
    const originFullName = githubRepositoryFromRemote(originUrl);
    if (!originFullName) {
      throw new ReleaseAuthorizationError(
        "ORIGIN_REPOSITORY_INVALID",
        "Origin must be an exact github.com owner/repository remote."
      );
    }
    const metadata = parseJsonOutput(requireCommand(
      "gh",
      [
        "repo",
        "view",
        originFullName,
        "--json",
        "nameWithOwner,defaultBranchRef,visibility,viewerPermission"
      ],
      { cwd: root, code: "GITHUB_REPOSITORY_INSPECTION_FAILED" }
    ), "GITHUB_REPOSITORY_JSON_INVALID");
    const defaultBranch = metadata.defaultBranchRef && metadata.defaultBranchRef.name;
    if (!defaultBranch) {
      throw new ReleaseAuthorizationError(
        "GITHUB_DEFAULT_BRANCH_MISSING",
        "GitHub did not report a default branch."
      );
    }
    const originDefaultBranchOutput = requireCommand(
      "git",
      ["ls-remote", "--heads", "origin", `refs/heads/${defaultBranch}`],
      { cwd: root, code: "ORIGIN_DEFAULT_BRANCH_INSPECTION_FAILED" }
    );
    const originDefaultBranchRows = originDefaultBranchOutput
      .split("\n")
      .filter(Boolean)
      .map(line => line.trim().split(/\s+/));
    if (originDefaultBranchRows.length !== 1 ||
        originDefaultBranchRows[0][1] !== `refs/heads/${defaultBranch}`) {
      throw new ReleaseAuthorizationError(
        "ORIGIN_DEFAULT_BRANCH_AMBIGUOUS",
        `Could not resolve exactly one origin/${defaultBranch} branch.`
      );
    }
    const originDefaultBranchSha = originDefaultBranchRows[0][0];
    const notesTracked = relativePath => commandResult(
      "git",
      ["ls-files", "--error-unmatch", "--", relativePath],
      { cwd: root }
    ).status === 0;

    return {
      root,
      branch,
      head_sha: headSha,
      origin_default_branch_sha: originDefaultBranchSha,
      clean: status.length === 0,
      full_name: metadata.nameWithOwner,
      origin_full_name: originFullName,
      default_branch: defaultBranch,
      visibility: normalizeVisibility(metadata.visibility),
      viewer_permission: String(metadata.viewerPermission || "").toUpperCase(),
      notes_tracked: notesTracked
    };
  }

  inspectRun(repository, runId) {
    return parseJsonOutput(requireCommand(
      "gh",
      [
        "run",
        "view",
        String(runId),
        "--repo",
        repository,
        "--json",
        "databaseId,workflowName,name,event,status,conclusion,headBranch,headSha,url,jobs"
      ],
      { cwd: this.repositoryRoot, code: "GITHUB_RUN_INSPECTION_FAILED" }
    ), "GITHUB_RUN_JSON_INVALID");
  }

  inspectReleaseImmutability(repository) {
    const result = commandResult(
      "gh",
      [
        "api",
        "--method",
        "GET",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
        `repos/${repository}/immutable-releases`
      ],
      { cwd: this.repositoryRoot }
    );
    if (result.status !== 0) {
      const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      throw new ReleaseAuthorizationError(
        "GITHUB_RELEASE_IMMUTABILITY_INSPECTION_FAILED",
        `Could not inspect immutable-release policy.${detail ? ` ${detail}` : ""}`
      );
    }
    const policy = parseJsonOutput(
      result.stdout,
      "GITHUB_RELEASE_IMMUTABILITY_JSON_INVALID"
    );
    return {
      api_version: GITHUB_API_VERSION,
      enabled: policy.enabled === true,
      enforced_by_owner: policy.enforced_by_owner === true
    };
  }

  resolveRemoteTag(tagName) {
    const output = requireCommand(
      "git",
      [
        "ls-remote",
        "--tags",
        "origin",
        `refs/tags/${tagName}`,
        `refs/tags/${tagName}^{}`
      ],
      { cwd: this.repositoryRoot, code: "REMOTE_TAG_INSPECTION_FAILED" }
    );
    const rows = output.split("\n").filter(Boolean).map(line => {
      const [commitSha, ref] = line.trim().split(/\s+/);
      return { commitSha, ref };
    });
    const peeled = rows.find(row => row.ref === `refs/tags/${tagName}^{}`);
    const direct = rows.find(row => row.ref === `refs/tags/${tagName}`);
    return peeled ? peeled.commitSha : direct ? direct.commitSha : null;
  }

  inspectLatestRelease(repository) {
    const releases = parseJsonOutput(requireCommand(
      "gh",
      [
        "release",
        "list",
        "--repo",
        repository,
        "--limit",
        "100",
        "--json",
        "tagName,name,isDraft,isPrerelease,isLatest,publishedAt"
      ],
      { cwd: this.repositoryRoot, code: "GITHUB_RELEASE_LIST_FAILED" }
    ), "GITHUB_RELEASE_LIST_JSON_INVALID");
    const latest = releases.find(item =>
      item.isLatest === true &&
      item.isDraft === false &&
      item.isPrerelease === false &&
      parseSemverTag(item.tagName));
    if (!latest) {
      throw new ReleaseAuthorizationError(
        "PREVIOUS_RELEASE_MISSING",
        "An exact prior latest release is required for this release path."
      );
    }
    const commitSha = this.resolveRemoteTag(latest.tagName);
    if (!commitSha) {
      throw new ReleaseAuthorizationError(
        "PREVIOUS_RELEASE_TAG_MISSING",
        `Could not resolve previous release tag ${latest.tagName}.`
      );
    }
    return {
      tag_name: latest.tagName,
      commit_sha: commitSha,
      published_at: latest.publishedAt
    };
  }

  inspectRelease(repository, tagName) {
    const result = commandResult(
      "gh",
      [
        "release",
        "view",
        tagName,
        "--repo",
        repository,
        "--json",
        "apiUrl,body,databaseId,id,isDraft,isPrerelease,name,publishedAt,tagName,targetCommitish,url"
      ],
      { cwd: this.repositoryRoot }
    );
    if (result.status !== 0) {
      const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
      if (/release not found|not found/i.test(detail)) return null;
      throw new ReleaseAuthorizationError(
        "GITHUB_RELEASE_INSPECTION_FAILED",
        `Could not inspect GitHub release ${tagName}: ${detail.trim()}`
      );
    }
    return parseJsonOutput(result.stdout, "GITHUB_RELEASE_JSON_INVALID");
  }

  inspectReleaseListing(repository, tagName) {
    const releases = parseJsonOutput(requireCommand(
      "gh",
      [
        "release",
        "list",
        "--repo",
        repository,
        "--limit",
        "100",
        "--json",
        "tagName,isLatest,isImmutable"
      ],
      { cwd: this.repositoryRoot, code: "GITHUB_RELEASE_LIST_FAILED" }
    ), "GITHUB_RELEASE_LIST_JSON_INVALID");
    const release = releases.find(item => item.tagName === tagName);
    return release ? {
      latest: release.isLatest === true,
      immutable: release.isImmutable === true
    } : null;
  }

  isLatestRelease(repository, tagName) {
    const listing = this.inspectReleaseListing(repository, tagName);
    return Boolean(listing && listing.latest);
  }

  createRelease(repository, target, notesAbsolutePath) {
    return requireCommand(
      "gh",
      [
        "release",
        "create",
        target.tag_name,
        "--repo",
        repository,
        "--target",
        target.commit_sha,
        "--title",
        target.release_name,
        "--notes-file",
        notesAbsolutePath,
        "--fail-on-no-commits",
        "--latest"
      ],
      { cwd: this.repositoryRoot, code: "GITHUB_RELEASE_CREATE_FAILED" }
    );
  }
}

function assertNoSemanticIssues(issues) {
  if (issues.length > 0) {
    const first = issues[0];
    throw new ReleaseAuthorizationError(first.code, first.message, { issues });
  }
}

function requireSchemaValid(document, type) {
  const { validatePayload } = require("./validator-cli-prototype/validate");
  const result = validatePayload(document, type);
  if (!result.valid) {
    throw new ReleaseAuthorizationError(
      "RELEASE_DOCUMENT_SCHEMA_INVALID",
      `${type} failed schema or semantic validation.`,
      { result }
    );
  }
}

function assertRepositoryPreconditions(repository, expectedRepository) {
  if (expectedRepository && repository.full_name !== expectedRepository) {
    throw new ReleaseAuthorizationError(
      "REPOSITORY_IDENTITY_MISMATCH",
      `Expected ${expectedRepository}, got ${repository.full_name}.`
    );
  }
  if (repository.origin_full_name !== repository.full_name) {
    throw new ReleaseAuthorizationError(
      "ORIGIN_REPOSITORY_MISMATCH",
      `Origin ${repository.origin_full_name || "unknown"} does not match GitHub repository ${repository.full_name}.`
    );
  }
  if (repository.branch !== repository.default_branch) {
    throw new ReleaseAuthorizationError(
      "RELEASE_NOT_ON_DEFAULT_BRANCH",
      `Release authorization requires branch ${repository.default_branch}, got ${repository.branch || "detached HEAD"}.`
    );
  }
  if (!repository.clean) {
    throw new ReleaseAuthorizationError(
      "RELEASE_REPOSITORY_DIRTY",
      "Release authorization requires a clean repository."
    );
  }
  if (repository.head_sha !== repository.origin_default_branch_sha) {
    throw new ReleaseAuthorizationError(
      "RELEASE_REPOSITORY_DRIFT",
      "Local HEAD must equal origin/default-branch before authorization."
    );
  }
  if (repository.visibility !== "PUBLIC") {
    throw new ReleaseAuthorizationError(
      "RELEASE_REPOSITORY_NOT_PUBLIC",
      "This exact release path is limited to an already-public repository."
    );
  }
  if (!["ADMIN", "MAINTAIN", "WRITE"].includes(repository.viewer_permission)) {
    throw new ReleaseAuthorizationError(
      "RELEASE_PERMISSION_INSUFFICIENT",
      "The authenticated GitHub principal lacks write-level release permission."
    );
  }
}

function normalizeRun(run) {
  const requiredJobs = Array.isArray(run.jobs)
    ? run.jobs.filter(job => job.name === "Doctrine and runtime checks")
    : [];
  if (requiredJobs.length !== 1) {
    throw new ReleaseAuthorizationError(
      "MAIN_REQUIRED_CHECK_MISMATCH",
      "The Validate run must contain exactly one Doctrine and runtime checks job."
    );
  }
  const requiredJob = requiredJobs[0];
  return {
    workflow_name: run.workflowName,
    required_check: "Doctrine and runtime checks",
    required_check_job_id: Number(requiredJob.databaseId),
    required_check_job_url: requiredJob.url,
    required_check_status: requiredJob.status,
    required_check_conclusion: requiredJob.conclusion,
    run_id: Number(run.databaseId),
    run_url: run.url,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    head_branch: run.headBranch,
    head_sha: run.headSha
  };
}

function assertRun(run, repository, targetCommitSha, requestedRunId) {
  const normalized = normalizeRun(run);
  if (normalized.run_id !== Number(requestedRunId) ||
      normalized.workflow_name !== "Validate" ||
      !Number.isInteger(normalized.required_check_job_id) ||
      normalized.required_check_job_id < 1 ||
      normalized.required_check_status !== "completed" ||
      normalized.required_check_conclusion !== "success" ||
      normalized.event !== "push" ||
      normalized.status !== "completed" ||
      normalized.conclusion !== "success" ||
      normalized.head_branch !== repository.default_branch ||
      normalized.head_sha !== targetCommitSha) {
    throw new ReleaseAuthorizationError(
      "MAIN_VALIDATION_MISMATCH",
      "The selected GitHub Actions run is not the successful default-branch Validate push for the exact target commit.",
      { run: normalized }
    );
  }
  return normalized;
}

function addMinutes(isoTimestamp, minutes) {
  return new Date(Date.parse(isoTimestamp) + minutes * 60 * 1000).toISOString();
}

function authorizeRelease(options, adapter = null) {
  const repositoryRoot = fs.realpathSync(options.repositoryRoot || process.cwd());
  const runtime = adapter || new SystemGitHubReleaseAdapter(repositoryRoot);
  const repository = runtime.inspectRepository();
  assertRepositoryPreconditions(repository, options.repository);

  if (!parseSemverTag(options.tagName)) {
    throw new ReleaseAuthorizationError(
      "RELEASE_TAG_INVALID",
      "Release tag must be a stable semantic version such as v0.2.0."
    );
  }
  if (typeof options.releaseName !== "string" || options.releaseName.trim().length === 0) {
    throw new ReleaseAuthorizationError("RELEASE_NAME_MISSING", "Release name is required.");
  }
  if (!/^[A-Z]+-[A-Za-z0-9_-]+$/.test(options.grantId || "")) {
    throw new ReleaseAuthorizationError(
      "USER_GRANT_ID_INVALID",
      "Grant ID must use the Controls ID format."
    );
  }

  const notes = inspectReleaseNotes(repositoryRoot, options.notesPath);
  if (!repository.notes_tracked(options.notesPath)) {
    throw new ReleaseAuthorizationError(
      "RELEASE_NOTES_UNTRACKED",
      "Release notes must be tracked in the exact clean release commit."
    );
  }
  const existingTagCommit = runtime.resolveRemoteTag(options.tagName);
  if (existingTagCommit) {
    throw new ReleaseAuthorizationError(
      "RELEASE_TAG_ALREADY_EXISTS",
      `Tag ${options.tagName} already exists at ${existingTagCommit}.`
    );
  }
  if (runtime.inspectRelease(repository.full_name, options.tagName)) {
    throw new ReleaseAuthorizationError(
      "RELEASE_ALREADY_EXISTS",
      `Release ${options.tagName} already exists.`
    );
  }

  const previousRelease = runtime.inspectLatestRelease(repository.full_name);
  if (compareSemverTags(options.tagName, previousRelease.tag_name) !== 1 ||
      repository.head_sha === previousRelease.commit_sha) {
    throw new ReleaseAuthorizationError(
      "RELEASE_VERSION_NOT_ADVANCING",
      "The target release must advance the latest stable release and contain a different commit."
    );
  }
  const mainValidation = assertRun(
    runtime.inspectRun(repository.full_name, options.runId),
    repository,
    repository.head_sha,
    options.runId
  );

  const validityMinutes = Number(options.expiresInMinutes || 30);
  if (!Number.isInteger(validityMinutes) || validityMinutes < 1 || validityMinutes > 60) {
    throw new ReleaseAuthorizationError(
      "RELEASE_VALIDITY_OUT_OF_RANGE",
      "Release authorization validity must be between 1 and 60 minutes."
    );
  }
  const releaseImmutability = runtime.inspectReleaseImmutability(repository.full_name);
  if (releaseImmutability.enabled !== true) {
    throw new ReleaseAuthorizationError(
      "RELEASE_IMMUTABILITY_NOT_ENABLED",
      "Future release authorization requires repository release immutability."
    );
  }
  const ghVersion = runtime.inspectGhVersion();
  if (compareVersions(ghVersion, RELEASE_ATTESTATION_MINIMUM_GH_VERSION) === null ||
      compareVersions(ghVersion, RELEASE_ATTESTATION_MINIMUM_GH_VERSION) === -1) {
    throw new ReleaseAuthorizationError(
      "GITHUB_CLI_ATTESTATION_UNSUPPORTED",
      `GitHub CLI ${RELEASE_ATTESTATION_MINIMUM_GH_VERSION} or newer is required for release attestation verification.`
    );
  }
  const issuedAt = options.now || runtime.now();
  const expiresAt = addMinutes(issuedAt, validityMinutes);
  const grant = {
    grant_id: options.grantId,
    authority: "USER",
    scope: "single_github_release",
    repository: repository.full_name,
    tag_name: options.tagName,
    target_commit_sha: repository.head_sha,
    release_notes_sha256: notes.sha256,
    approved: true,
    granted_at: issuedAt,
    expires_at: expiresAt
  };
  grant.directive_sha256 = userGrantDigest(grant);

  const document = {
    schema_version: "0.4",
    type: "GitHubReleaseAuthorization",
    id: `GRA-${options.tagName.replace(/[^A-Za-z0-9]/g, "_")}-${repository.head_sha.slice(0, 12)}`,
    issued_at: issuedAt,
    expires_at: expiresAt,
    single_use: true,
    consumed: false,
    repository: {
      full_name: repository.full_name,
      origin_full_name: repository.origin_full_name,
      default_branch: repository.default_branch,
      visibility: repository.visibility,
      viewer_permission: repository.viewer_permission
    },
    release_immutability: {
      api_version: releaseImmutability.api_version,
      enabled: true,
      enforced_by_owner: releaseImmutability.enforced_by_owner,
      checked_at: issuedAt
    },
    release_attestation: {
      required: true,
      verifier_tool: "gh",
      minimum_verifier_version: RELEASE_ATTESTATION_MINIMUM_GH_VERSION,
      output_format: "json",
      statement_type: RELEASE_ATTESTATION_STATEMENT_TYPE,
      predicate_type: RELEASE_ATTESTATION_PREDICATE_TYPE,
      signer_identity: RELEASE_ATTESTATION_SIGNER_IDENTITY,
      source_archives_in_scope: false,
      independent_verification_required: true,
      independent_verifier_package: "@sigstore/verify",
      minimum_independent_verifier_version:
        MINIMUM_SIGSTORE_VERIFY_VERSION,
      trusted_root_tuf_mirror: GITHUB_TUF_MIRROR,
      trusted_root_bootstrap_path: GITHUB_TUF_BOOTSTRAP_PATH,
      maximum_trusted_root_age_seconds:
        DEFAULT_MAXIMUM_AGE_SECONDS
    },
    target: {
      tag_name: options.tagName,
      release_name: options.releaseName.trim(),
      commit_sha: repository.head_sha,
      draft: false,
      prerelease: false,
      latest: true,
      fail_on_no_commits: true
    },
    previous_release: previousRelease,
    release_notes: {
      relative_path: notes.relative_path,
      sha256: notes.sha256,
      byte_length: notes.byte_length
    },
    main_validation: mainValidation,
    repository_state: {
      branch: repository.branch,
      head_sha: repository.head_sha,
      origin_default_branch_sha: repository.origin_default_branch_sha,
      clean: true,
      tag_absent: true,
      release_absent: true
    },
    release_review: {
      reviewed_by: "USER",
      decision: "approve",
      repository_visibility: repository.visibility,
      target_was_already_public: true,
      reviewed_commit_sha: repository.head_sha,
      reviewed_release_notes_sha256: notes.sha256,
      reviewed_at: issuedAt
    },
    user_grant: grant,
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      ai_approval_accepted: false,
      release_authorized: true
    },
    release_authorized: true
  };
  document.authorization_sha256 = authorizationDigest(document);
  assertNoSemanticIssues(validateAuthorizationSemantics(document));
  requireSchemaValid(document, "github-release-authorization");
  return document;
}

function assertAuthorizationAgainstCurrentState(document, repositoryRoot, runtime) {
  assertNoSemanticIssues(validateAuthorizationSemantics(document, {
    requireCurrentVersion: true,
    requireFresh: true,
    now: runtime.now()
  }));
  requireSchemaValid(document, "github-release-authorization");

  const repository = runtime.inspectRepository();
  assertRepositoryPreconditions(repository, document.repository.full_name);
  if (repository.default_branch !== document.repository.default_branch ||
      repository.head_sha !== document.target.commit_sha ||
      repository.origin_default_branch_sha !== document.target.commit_sha) {
    throw new ReleaseAuthorizationError(
      "AUTHORIZED_COMMIT_DRIFT",
      "The current repository no longer matches the exact authorized commit."
    );
  }
  if (["0.2", "0.3", "0.4"].includes(document.schema_version)) {
    const releaseImmutability = runtime.inspectReleaseImmutability(
      document.repository.full_name
    );
    if (releaseImmutability.api_version !== document.release_immutability.api_version ||
        releaseImmutability.enabled !== true ||
        releaseImmutability.enforced_by_owner !==
          document.release_immutability.enforced_by_owner) {
      throw new ReleaseAuthorizationError(
        "AUTHORIZED_RELEASE_IMMUTABILITY_DRIFT",
        "Repository release-immutability state changed after authorization."
      );
    }
  }
  const notes = inspectReleaseNotes(repositoryRoot, document.release_notes.relative_path);
  if (!repository.notes_tracked(document.release_notes.relative_path) ||
      notes.sha256 !== document.release_notes.sha256 ||
      notes.byte_length !== document.release_notes.byte_length) {
    throw new ReleaseAuthorizationError(
      "AUTHORIZED_RELEASE_NOTES_DRIFT",
      "Release notes changed after authorization."
    );
  }
  const mainValidation = assertRun(
    runtime.inspectRun(document.repository.full_name, document.main_validation.run_id),
    repository,
    document.target.commit_sha,
    document.main_validation.run_id
  );
  if (sha256(canonicalJsonBytes(mainValidation)) !==
      sha256(canonicalJsonBytes(document.main_validation))) {
    throw new ReleaseAuthorizationError(
      "AUTHORIZED_MAIN_VALIDATION_DRIFT",
      "The observed GitHub Actions run no longer matches the authorization."
    );
  }
  const existingRelease = runtime.inspectRelease(
    document.repository.full_name,
    document.target.tag_name
  );
  const existingTagCommit = runtime.resolveRemoteTag(document.target.tag_name);
  if (Boolean(existingRelease) !== Boolean(existingTagCommit)) {
    throw new ReleaseAuthorizationError(
      "PARTIAL_RELEASE_STATE",
      "The target tag and GitHub release must either both be absent or form one exact existing release."
    );
  }
  if (!existingRelease) {
    const previousRelease = runtime.inspectLatestRelease(document.repository.full_name);
    if (previousRelease.tag_name !== document.previous_release.tag_name ||
        previousRelease.commit_sha !== document.previous_release.commit_sha ||
        previousRelease.published_at !== document.previous_release.published_at) {
      throw new ReleaseAuthorizationError(
        "AUTHORIZED_PREVIOUS_RELEASE_DRIFT",
        "The latest prior release changed after authorization."
      );
    }
  }
  return { repository, notes, existingRelease, existingTagCommit };
}

function verifyPublishedRelease(document, observed, runtime, notes) {
  if (!observed) {
    throw new ReleaseAuthorizationError(
      "PUBLISHED_RELEASE_MISSING",
      `Release ${document.target.tag_name} is missing after publication.`
    );
  }
  const tagCommitSha = runtime.resolveRemoteTag(document.target.tag_name);
  const listing = runtime.inspectReleaseListing(
    document.repository.full_name,
    document.target.tag_name
  );
  const bodyDigest = sha256(Buffer.from(observed.body || "", "utf8"));
  if (observed.tagName !== document.target.tag_name ||
      observed.name !== document.target.release_name ||
      observed.targetCommitish !== document.target.commit_sha ||
      tagCommitSha !== document.target.commit_sha ||
      observed.isDraft !== false || observed.isPrerelease !== false ||
      !listing || listing.latest !== true ||
      (["0.2", "0.3", "0.4"].includes(document.schema_version) &&
        listing.immutable !== true) ||
      bodyDigest !== notes.sha256) {
    throw new ReleaseAuthorizationError(
      "PUBLISHED_RELEASE_MISMATCH",
      "Observed GitHub release, resolved tag, mode, or notes do not match the exact authorization.",
      {
        observed_tag: observed.tagName,
        observed_target: observed.targetCommitish,
        resolved_tag_commit_sha: tagCommitSha,
        latest: listing && listing.latest,
        immutable: listing && listing.immutable,
        observed_notes_sha256: bodyDigest
      }
    );
  }
  const release = {
    database_id: Number(observed.databaseId),
    node_id: observed.id,
    url: observed.url,
    api_url: observed.apiUrl,
    tag_name: observed.tagName,
    target_commitish: observed.targetCommitish,
    resolved_tag_commit_sha: tagCommitSha,
    published_at: observed.publishedAt,
    draft: false,
    prerelease: false,
    latest: true
  };
  if (["0.2", "0.3", "0.4"].includes(document.schema_version)) {
    release.immutable = true;
  }
  return release;
}

function publishAuthorizedRelease(options, adapter = null) {
  const repositoryRoot = fs.realpathSync(options.repositoryRoot || process.cwd());
  const runtime = adapter || new SystemGitHubReleaseAdapter(repositoryRoot);
  const authorizationPath = fs.realpathSync(path.resolve(options.authorizationPath));
  const authorizationRelativePath = path.relative(repositoryRoot, authorizationPath)
    .split(path.sep).join("/");
  if (!isSafeRelativePath(authorizationRelativePath)) {
    throw new ReleaseAuthorizationError(
      "AUTHORIZATION_PATH_OUTSIDE_REPOSITORY",
      "The consumed authorization must be stored beneath the repository root."
    );
  }
  const document = JSON.parse(fs.readFileSync(authorizationPath, "utf8"));
  const { notes, existingRelease } = assertAuthorizationAgainstCurrentState(
    document,
    repositoryRoot,
    runtime
  );
  const trustedRoot = loadTrustedRootForRelease(
    repositoryRoot,
    options.trustedRootPath,
    runtime.now(),
    document.expires_at
  );

  let observed = existingRelease;
  if (!observed) {
    try {
      runtime.createRelease(
        document.repository.full_name,
        document.target,
        notes.absolute_path
      );
    } catch (error) {
      observed = runtime.inspectRelease(
        document.repository.full_name,
        document.target.tag_name
      );
      if (!observed) throw error;
    }
    observed = runtime.inspectRelease(
      document.repository.full_name,
      document.target.tag_name
    );
  }
  const release = verifyPublishedRelease(document, observed, runtime, notes);
  const attestation = verifyReleaseAttestationWithRetry(document, runtime);
  const independentVerification = independentlyVerifyReleaseAttestation(
    document,
    attestation,
    trustedRoot
  );
  const receipt = {
    schema_version: document.schema_version,
    type: "GitHubReleaseReceipt",
    id: `GRR-${document.target.tag_name.replace(/[^A-Za-z0-9]/g, "_")}-${document.target.commit_sha.slice(0, 12)}`,
    authorization_ref: {
      authorization_id: document.id,
      relative_path: authorizationRelativePath,
      sha256: document.authorization_sha256
    },
    repository: {
      full_name: document.repository.full_name,
      default_branch: document.repository.default_branch
    },
    target: {
      tag_name: document.target.tag_name,
      release_name: document.target.release_name,
      commit_sha: document.target.commit_sha,
      draft: false,
      prerelease: false,
      latest: true
    },
    release,
    attestation,
    trusted_root: trustedRoot,
    independent_verification: independentVerification,
    release_notes_sha256: document.release_notes.sha256,
    authorization_consumed: true,
    published: true,
    verified: true,
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: true
    },
    release_authorized: true,
    recorded_at: runtime.now()
  };
  receipt.receipt_sha256 = receiptDigest(receipt);
  assertNoSemanticIssues(validateReceiptSemantics(receipt, {
    requireCurrentVersion: true
  }));
  requireSchemaValid(receipt, "github-release-receipt");
  return receipt;
}

function writeJsonAtomic(filePath, value) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, absolutePath);
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new ReleaseAuthorizationError("CLI_ARGUMENT_INVALID", `Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ReleaseAuthorizationError("CLI_ARGUMENT_MISSING_VALUE", `Missing value for --${key}.`);
    }
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function usage() {
  return [
    "Usage:",
    "  node github-release-publisher.js authorize --repository-root <path> --repository <owner/repo> --tag <vX.Y.Z> --name <name> --notes <repo-relative.md> --run-id <id> --grant-id <ID> --output <authorization.json> [--expires-in-minutes <1-60>]",
    "  node github-release-publisher.js publish --repository-root <path> --authorization <authorization.json> --trusted-root <repo-relative.json> --receipt <receipt.json>"
  ].join("\n");
}

function main(argv = process.argv.slice(2)) {
  try {
    const { command, options } = parseCli(argv);
    if (command === "authorize") {
      for (const field of ["repository", "tag", "name", "notes", "run-id", "grant-id", "output"]) {
        if (!options[field]) throw new ReleaseAuthorizationError("CLI_ARGUMENT_REQUIRED", `--${field} is required.`);
      }
      const authorization = authorizeRelease({
        repositoryRoot: options["repository-root"] || process.cwd(),
        repository: options.repository,
        tagName: options.tag,
        releaseName: options.name,
        notesPath: options.notes,
        runId: Number(options["run-id"]),
        grantId: options["grant-id"],
        expiresInMinutes: options["expires-in-minutes"]
      });
      writeJsonAtomic(options.output, authorization);
      process.stdout.write(`${JSON.stringify({
        authorized: true,
        release_authorized: true,
        authorization_id: authorization.id,
        authorization_sha256: authorization.authorization_sha256,
        repository: authorization.repository.full_name,
        tag_name: authorization.target.tag_name,
        commit_sha: authorization.target.commit_sha,
        expires_at: authorization.expires_at,
        output: path.resolve(options.output)
      }, null, 2)}\n`);
      return;
    }
    if (command === "publish") {
      for (const field of ["authorization", "trusted-root", "receipt"]) {
        if (!options[field]) throw new ReleaseAuthorizationError("CLI_ARGUMENT_REQUIRED", `--${field} is required.`);
      }
      const receipt = publishAuthorizedRelease({
        repositoryRoot: options["repository-root"] || process.cwd(),
        authorizationPath: options.authorization,
        trustedRootPath: options["trusted-root"]
      });
      writeJsonAtomic(options.receipt, receipt);
      process.stdout.write(`${JSON.stringify({
        published: true,
        verified: true,
        release_authorized: true,
        receipt_id: receipt.id,
        receipt_sha256: receipt.receipt_sha256,
        repository: receipt.repository.full_name,
        tag_name: receipt.target.tag_name,
        commit_sha: receipt.target.commit_sha,
        release_url: receipt.release.url,
        output: path.resolve(options.receipt)
      }, null, 2)}\n`);
      return;
    }
    throw new ReleaseAuthorizationError("CLI_COMMAND_INVALID", usage());
  } catch (error) {
    const output = {
      valid: false,
      code: error.code || "GITHUB_RELEASE_OPERATION_FAILED",
      message: error.message
    };
    if (error.details && Object.keys(error.details).length > 0) output.details = error.details;
    console.error(JSON.stringify(output, null, 2));
    if (!error.code) console.error(usage());
    process.exitCode = 1;
  }
}

module.exports = {
  GITHUB_API_VERSION,
  RELEASE_ATTESTATION_BUNDLE_MEDIA_TYPE,
  RELEASE_ATTESTATION_MINIMUM_GH_VERSION,
  RELEASE_ATTESTATION_PREDICATE_TYPE,
  RELEASE_ATTESTATION_SIGNER_IDENTITY,
  RELEASE_ATTESTATION_STATEMENT_TYPE,
  ReleaseAuthorizationError,
  SystemGitHubReleaseAdapter,
  authorizationDigest,
  authorizeRelease,
  commandResult,
  compareSemverTags,
  compareVersions,
  inspectReleaseNotes,
  independentlyVerifyReleaseAttestation,
  isSafeRelativePath,
  main,
  normalizeReleaseAttestationEvidence,
  parseGhVersionOutput,
  parseJsonOutput,
  publishAuthorizedRelease,
  receiptDigest,
  releasePackageUri,
  requireCommand,
  sha256,
  userGrantDigest,
  validateAuthorizationSemantics,
  validateReleaseAttestationEvidence,
  validateReceiptSemantics,
  verifyReleaseAttestationWithRetry,
  loadTrustedRootForRelease,
  writeJsonAtomic
};

if (require.main === module) main();
