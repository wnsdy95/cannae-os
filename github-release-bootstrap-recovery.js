#!/usr/bin/env node

const crypto = require("crypto");
const {
  canonicalJsonBytes
} = require("./verifier-identity-evidence");

const RECOVERY_SCHEMA_VERSION = "0.1";
const DEFAULT_MAXIMUM_RECOVERY_VALIDITY_SECONDS = 60 * 60;
const DEFAULT_BOOTSTRAP_WINDOW_SECONDS = 4 * 60 * 60;
const RECOVERABLE_CHECKPOINT_FAILURE_CODES = Object.freeze([
  "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
  "GITHUB_RELEASE_TRUST_CHECKPOINT_STALE"
]);

class GitHubReleaseBootstrapRecoveryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GitHubReleaseBootstrapRecoveryError";
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function recoveryDigest(document) {
  const copy = JSON.parse(JSON.stringify(document));
  delete copy.recovery_sha256;
  return sha256(canonicalJsonBytes(copy));
}

function semanticIssue(code, path, message) {
  return { code, path, message };
}

function sameCanonicalJson(left, right) {
  try {
    return canonicalJsonBytes(left).equals(
      canonicalJsonBytes(right)
    );
  } catch (error) {
    return false;
  }
}

function validateGitHubReleaseBootstrapRecovery(
  document,
  options = {}
) {
  const issues = [];
  const repository = document && document.repository || {};
  const policy = document && document.policy || {};
  const bootstrap = document && document.bootstrap || {};
  const blockedRuns = document && document.blocked_runs;
  const userGrant = document && document.user_grant || {};
  const authority = document && document.authority || {};
  const authorizedAt = parseTimestamp(
    document && document.authorized_at
  );
  const expiresAt = parseTimestamp(
    document && document.expires_at
  );
  const evaluatedAt = parseTimestamp(options.evaluatedAt);
  const introductionTime = parseTimestamp(
    policy.introduction_time
  );
  const grantedAt = parseTimestamp(userGrant.granted_at);

  if (!document ||
      document.schema_version !== RECOVERY_SCHEMA_VERSION ||
      document.type !== "GitHubReleaseBootstrapRecovery" ||
      document.recovery_sha256 !== recoveryDigest(document)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_DIGEST_INVALID",
      "$.recovery_sha256",
      "Initial bootstrap recovery must bind its complete canonical document."
    ));
  }
  if (repository.full_name !==
      (options.repository || repository.full_name) ||
      repository.default_branch !==
        (options.defaultBranch || repository.default_branch)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_REPOSITORY_MISMATCH",
      "$.repository",
      "Initial bootstrap recovery must bind the exact repository and default branch."
    ));
  }
  if (policy.relative_path !==
      ".github/release-integrity-policy.json" ||
      !/^[a-f0-9]{64}$/.test(policy.sha256 || "") ||
      !/^[a-f0-9]{64}$/.test(policy.head_blob_sha256 || "") ||
      !/^[a-f0-9]{40}$/.test(
        policy.introduction_commit_sha || ""
      ) ||
      introductionTime === null) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_POLICY_INVALID",
      "$.policy",
      "Initial bootstrap recovery requires the exact policy bytes and original introduction boundary."
    ));
  }
  if (Buffer.isBuffer(options.policyBytes)) {
    let currentPolicy = null;
    try {
      currentPolicy = JSON.parse(
        options.policyBytes.toString("utf8")
      );
    } catch (error) {
      currentPolicy = null;
    }
    if (!currentPolicy ||
        currentPolicy.id !== policy.id ||
        currentPolicy.policy_sha256 !== policy.sha256 ||
        sha256(options.policyBytes) !==
          policy.head_blob_sha256) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_POLICY_MISMATCH",
        "$.policy",
        "Recovery policy evidence does not equal the exact committed current policy."
      ));
    }
  }
  if (options.introduction &&
      (options.introduction.commit_sha !==
        policy.introduction_commit_sha ||
       options.introduction.committed_at !==
        policy.introduction_time)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_INTRODUCTION_MISMATCH",
      "$.policy",
      "Recovery must retain the original checkpoint-policy introduction commit and time."
    ));
  }

  const checkpoint = options.bootstrapCheckpoint;
  const trustedRoot = options.bootstrapTrustedRoot;
  const externalBootstrapSupplied =
    checkpoint !== undefined || trustedRoot !== undefined;
  if (bootstrap.checkpoint_relative_path !==
      ".github/tuf/github-release-trust-checkpoint.json" ||
      bootstrap.trusted_root_relative_path !==
        ".github/tuf/github-release-trust-bootstrap-root.json" ||
      !/^[a-f0-9]{64}$/.test(
        bootstrap.checkpoint_sha256 || ""
      ) ||
      !/^[a-f0-9]{64}$/.test(
        bootstrap.trusted_root_artifact_sha256 || ""
      ) ||
      (externalBootstrapSupplied &&
       (!checkpoint ||
        checkpoint.sequence !== 0 ||
        !checkpoint.predecessor ||
        checkpoint.predecessor.kind !== "genesis" ||
        checkpoint.checkpoint_sha256 !==
          bootstrap.checkpoint_sha256 ||
        checkpoint.id !== bootstrap.checkpoint_id ||
        !trustedRoot ||
        trustedRoot.id !==
          bootstrap.trusted_root_artifact_id ||
        trustedRoot.artifact_sha256 !==
          bootstrap.trusted_root_artifact_sha256 ||
        !checkpoint.trusted_state ||
        checkpoint.trusted_state.artifact_sha256 !==
          trustedRoot.artifact_sha256 ||
        !checkpoint.predecessor.bootstrap_authorization ||
        checkpoint.predecessor.bootstrap_authorization.grant_id !==
          userGrant.grant_id))) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_GENESIS_MISMATCH",
      "$.bootstrap",
      "Recovery must bind one fresh committed USER-authorized sequence-zero genesis and its exact trusted root."
    ));
  }

  if (!Array.isArray(blockedRuns) ||
      blockedRuns.length < 1 ||
      blockedRuns.length > 99) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_RUN_SET_INVALID",
      "$.blocked_runs",
      "Recovery requires one bounded non-empty set of retained initial failure artifacts."
    ));
  } else {
    const seenRuns = new Set();
    let previousRunNumber = 0;
    for (let index = 0; index < blockedRuns.length; index += 1) {
      const run = blockedRuns[index] || {};
      const runKey = `${run.run_id}:${run.run_attempt}`;
      const runCreatedAt = parseTimestamp(run.run_created_at);
      const observedAt = parseTimestamp(run.observed_at);
      const artifactCreatedAt = parseTimestamp(
        run.artifact_created_at
      );
      const artifactExpiresAt = parseTimestamp(
        run.artifact_expires_at
      );
      if (seenRuns.has(runKey) ||
          !Number.isSafeInteger(run.run_number) ||
          run.run_number <= previousRunNumber ||
          run.run_attempt !== 1 ||
          run.conclusion !== "failure" ||
          !RECOVERABLE_CHECKPOINT_FAILURE_CODES.includes(
            run.checkpoint_failure_code
          ) ||
          runCreatedAt === null ||
          observedAt === null ||
          artifactCreatedAt === null ||
          artifactExpiresAt === null ||
          runCreatedAt > observedAt ||
          observedAt > artifactCreatedAt + 60 * 1000 ||
          artifactCreatedAt > observedAt + 60 * 1000 ||
          (grantedAt !== null &&
           artifactCreatedAt > grantedAt) ||
          artifactExpiresAt < expiresAt) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_RUN_INVALID",
          `$.blocked_runs[${index}]`,
          "Every recovery run must be unique, ordered, recoverably blocked, and retained through recovery expiry."
        ));
      }
      seenRuns.add(runKey);
      previousRunNumber = run.run_number;
    }
  }
  if (Array.isArray(options.blockedRuns) &&
      !sameCanonicalJson(options.blockedRuns, blockedRuns)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_RUN_SET_MISMATCH",
      "$.blocked_runs",
      "Recovery must enumerate every exact policy-matching failed run and artifact without omission or substitution."
    ));
  }

  if (userGrant.authority !== "USER" ||
      userGrant.purpose !== "initial_bootstrap_recovery" ||
      typeof userGrant.grant_id !== "string" ||
      userGrant.grant_id.length < 1 ||
      grantedAt === null ||
      authorizedAt === null ||
      expiresAt === null ||
      evaluatedAt === null ||
      introductionTime === null ||
      grantedAt < introductionTime ||
      grantedAt > authorizedAt ||
      evaluatedAt < authorizedAt ||
      evaluatedAt >= expiresAt ||
      expiresAt - authorizedAt >
        DEFAULT_MAXIMUM_RECOVERY_VALIDITY_SECONDS * 1000 ||
      expiresAt >
        introductionTime +
          DEFAULT_BOOTSTRAP_WINDOW_SECONDS * 1000) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_AUTHORITY_INVALID",
      "$.user_grant",
      "Recovery requires one exact unexpired USER grant inside the original bootstrap window and a maximum sixty-minute validity."
    ));
  }
  if (authority.human_final_decision_authority !== "USER" ||
      authority.monitoring_only !== true ||
      authority.checkpoint_reset_authorized !== false ||
      authority.release_authorized !== false ||
      document.initial_bootstrap_recovery_authorized !== true ||
      document.checkpoint_reset_authorized !== false ||
      document.release_authorized !== false) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_AUTHORITY_DRIFT",
      "$.authority",
      "Initial recovery may authorize only one monitoring bootstrap and can never authorize checkpoint reset or release."
    ));
  }
  return issues;
}

function createGitHubReleaseBootstrapRecovery(options = {}) {
  const grantedAtMs = parseTimestamp(options.grantedAt);
  const authorizedAtMs = parseTimestamp(options.authorizedAt);
  const expiresAtMs = parseTimestamp(options.expiresAt);
  if (grantedAtMs === null ||
      authorizedAtMs === null ||
      expiresAtMs === null) {
    throw new GitHubReleaseBootstrapRecoveryError(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_TIME_INVALID",
      "Recovery creation requires exact authorization and expiry times."
    );
  }
  const document = {
    schema_version: RECOVERY_SCHEMA_VERSION,
    type: "GitHubReleaseBootstrapRecovery",
    id: `GRBR-${sha256(canonicalJsonBytes({
      repository: options.repository,
      policy: options.policy,
      blocked_runs: options.blockedRuns,
      grant_id: options.userGrantId
    })).slice(0, 12)}`,
    repository: JSON.parse(JSON.stringify(options.repository)),
    policy: JSON.parse(JSON.stringify(options.policy)),
    bootstrap: {
      checkpoint_relative_path:
        ".github/tuf/github-release-trust-checkpoint.json",
      checkpoint_id: options.bootstrapCheckpoint.id,
      checkpoint_sha256:
        options.bootstrapCheckpoint.checkpoint_sha256,
      trusted_root_relative_path:
        ".github/tuf/github-release-trust-bootstrap-root.json",
      trusted_root_artifact_id: options.bootstrapTrustedRoot.id,
      trusted_root_artifact_sha256:
        options.bootstrapTrustedRoot.artifact_sha256
    },
    blocked_runs: JSON.parse(JSON.stringify(options.blockedRuns)),
    user_grant: {
      authority: "USER",
      grant_id: options.userGrantId,
      purpose: "initial_bootstrap_recovery",
      granted_at: new Date(grantedAtMs).toISOString()
    },
    authority: {
      human_final_decision_authority: "USER",
      monitoring_only: true,
      checkpoint_reset_authorized: false,
      release_authorized: false
    },
    initial_bootstrap_recovery_authorized: true,
    checkpoint_reset_authorized: false,
    release_authorized: false,
    authorized_at: new Date(authorizedAtMs).toISOString(),
    expires_at: new Date(expiresAtMs).toISOString()
  };
  document.recovery_sha256 = recoveryDigest(document);
  const issues = validateGitHubReleaseBootstrapRecovery(
    document,
    {
      evaluatedAt: document.authorized_at,
      repository: document.repository.full_name,
      defaultBranch: document.repository.default_branch,
      policyBytes: options.policyBytes,
      introduction: options.introduction,
      bootstrapCheckpoint: options.bootstrapCheckpoint,
      bootstrapTrustedRoot: options.bootstrapTrustedRoot,
      blockedRuns: options.blockedRuns
    }
  );
  if (issues.length > 0) {
    throw new GitHubReleaseBootstrapRecoveryError(
      issues[0].code,
      issues[0].message,
      { issues }
    );
  }
  return document;
}

module.exports = {
  DEFAULT_BOOTSTRAP_WINDOW_SECONDS,
  DEFAULT_MAXIMUM_RECOVERY_VALIDITY_SECONDS,
  GitHubReleaseBootstrapRecoveryError,
  RECOVERABLE_CHECKPOINT_FAILURE_CODES,
  RECOVERY_SCHEMA_VERSION,
  createGitHubReleaseBootstrapRecovery,
  recoveryDigest,
  validateGitHubReleaseBootstrapRecovery
};
