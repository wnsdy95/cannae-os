#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  GITHUB_API_VERSION,
  RELEASE_ATTESTATION_MINIMUM_GH_VERSION,
  RELEASE_ATTESTATION_PREDICATE_TYPE,
  RELEASE_ATTESTATION_SIGNER_IDENTITY,
  RELEASE_ATTESTATION_STATEMENT_TYPE,
  SystemGitHubReleaseAdapter,
  commandResult,
  isSafeRelativePath,
  parseJsonOutput,
  requireCommand,
  validateReleaseAttestationEvidence,
  verifyReleaseAttestationWithRetry,
  writeJsonAtomic
} = require("./github-release-publisher");
const {
  MINIMUM_SIGSTORE_VERIFY_VERSION,
  validateIndependentVerificationEvidence,
  verifyGitHubReleaseBundle
} = require("./github-release-bundle-verifier");
const {
  DEFAULT_MAXIMUM_AGE_SECONDS,
  GITHUB_TUF_BOOTSTRAP_PATH,
  GITHUB_TUF_MIRROR,
  refreshGitHubReleaseTrustedRoot,
  validateGitHubReleaseTrustedRoot
} = require("./github-release-trusted-root");
const {
  DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS,
  advanceGitHubReleaseTrustCheckpoint,
  validateGitHubReleaseTrustCheckpoint
} = require("./github-release-trust-checkpoint");
const {
  CHECKPOINT_FILE_NAME,
  DEFAULT_ARTIFACT_NAME_PREFIX,
  DEFAULT_BOOTSTRAP_WINDOW_SECONDS,
  DEFAULT_MAXIMUM_RUN_HISTORY,
  DEFAULT_WORKFLOW_PATH,
  FULL_OBSERVATION_FILE_NAME,
  SystemGitHubReleaseCheckpointStore,
  TRUSTED_ROOT_FILE_NAME
} = require("./github-release-checkpoint-store");
const { canonicalJsonBytes } = require("./verifier-identity-evidence");

const ARTIFACT_TIMESTAMP_TOLERANCE_MS = 60 * 1000;

class ReleaseIntegrityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ReleaseIntegrityError";
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

function policyDigest(document) {
  return digestWithout(document, "policy_sha256");
}

function observationDigest(document) {
  return digestWithout(document, "observation_sha256");
}

function sameCanonicalJson(left, right) {
  return canonicalJsonBytes(left).equals(canonicalJsonBytes(right));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function semanticIssue(code, pathValue, message) {
  return { code, path: pathValue, message };
}

function expectedEndpoint(repository) {
  return `/repos/${repository}/immutable-releases`;
}

function validateIntegrityPolicySemantics(document) {
  const issues = [];
  const repository = document && document.repository || {};
  const activation = document && document.activation || {};
  const immutablePolicy = document && document.immutable_release_policy || {};
  const attestation = document && document.attestation_policy || {};
  const checkpoint = document &&
    document.trust_checkpoint_policy || {};
  const monitoring = document && document.monitoring || {};
  const authority = document && document.authority || {};
  const grandfathered = document && document.grandfathered_releases || [];

  if (document && document.policy_sha256 !== policyDigest(document)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_POLICY_DIGEST_MISMATCH",
      "$.policy_sha256",
      "Policy digest must bind the complete release-integrity policy."
    ));
  }
  if (immutablePolicy.api_version !== GITHUB_API_VERSION ||
      immutablePolicy.endpoint !== expectedEndpoint(repository.full_name) ||
      immutablePolicy.expected_enabled !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_POLICY_SCOPE_MISMATCH",
      "$.immutable_release_policy",
      "The immutable-release endpoint and expected enabled state must match the exact repository."
    ));
  }
  if (repository.visibility !== "PUBLIC" ||
      typeof repository.default_branch !== "string" ||
      repository.default_branch.length === 0) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_REPOSITORY_INVALID",
      "$.repository",
      "Phase 19B monitoring is limited to one exact public repository and default branch."
    ));
  }
  const activatedAt = parseTimestamp(activation.activated_at);
  if (activatedAt === null || activation.future_releases_only !== true ||
      !/^[a-f0-9]{40}$/.test(activation.activation_commit_sha || "") ||
      !/^[a-f0-9]{64}$/.test(activation.receipt_sha256 || "")) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_ACTIVATION_INVALID",
      "$.activation",
      "The policy must bind the exact prospective activation receipt, commit, and timestamp."
    ));
  }
  const tags = grandfathered.map(item => item && item.tag_name);
  const commits = grandfathered.map(item => item && item.commit_sha);
  if (grandfathered.length < 1 ||
      new Set(tags).size !== tags.length ||
      new Set(commits).size !== commits.length ||
      grandfathered.some(item =>
        !item || parseTimestamp(item.published_at) === null ||
        (activatedAt !== null && parseTimestamp(item.published_at) >= activatedAt) ||
        item.expected_immutable !== false ||
        item.attestation_required !== false)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_GRANDFATHER_SET_INVALID",
      "$.grandfathered_releases",
      "Grandfathered releases must be unique exact pre-activation releases and cannot require retroactive immutability or attestation."
    ));
  }
  if (attestation.required_for_non_grandfathered !== true ||
      attestation.verifier_tool !== "gh" ||
      attestation.minimum_verifier_version !==
        RELEASE_ATTESTATION_MINIMUM_GH_VERSION ||
      attestation.output_format !== "json" ||
      attestation.statement_type !== RELEASE_ATTESTATION_STATEMENT_TYPE ||
      attestation.predicate_type !== RELEASE_ATTESTATION_PREDICATE_TYPE ||
      attestation.signer_identity !== RELEASE_ATTESTATION_SIGNER_IDENTITY ||
      attestation.source_archives_in_scope !== false) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_ATTESTATION_POLICY_INVALID",
      "$.attestation_policy",
      "The policy must require the exact supported GitHub release-attestation profile for every non-grandfathered release."
    ));
  }
  if (document &&
      ["0.2", "0.3"].includes(document.schema_version) &&
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
      "GITHUB_RELEASE_INTEGRITY_INDEPENDENT_POLICY_INVALID",
      "$.attestation_policy",
      "Phase 19C monitoring requires the exact independent Sigstore verifier and GitHub TUF profile."
    ));
  }
  if (document && document.schema_version === "0.3") {
    if (checkpoint.required !== true ||
        checkpoint.continuity_mode !==
          "github_actions_artifact_chain" ||
        checkpoint.bootstrap_checkpoint_path !==
          ".github/tuf/github-release-trust-checkpoint.json" ||
        checkpoint.bootstrap_trusted_root_path !==
          ".github/tuf/github-release-trust-bootstrap-root.json" ||
        checkpoint.workflow_path !== DEFAULT_WORKFLOW_PATH ||
        checkpoint.artifact_name_prefix !==
          DEFAULT_ARTIFACT_NAME_PREFIX ||
        checkpoint.checkpoint_file_name !==
          CHECKPOINT_FILE_NAME ||
        checkpoint.trusted_root_file_name !==
          TRUSTED_ROOT_FILE_NAME ||
        checkpoint.full_observation_file_name !==
          FULL_OBSERVATION_FILE_NAME ||
        checkpoint.maximum_checkpoint_age_seconds !==
          DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS ||
        checkpoint.bootstrap_window_seconds !==
          DEFAULT_BOOTSTRAP_WINDOW_SECONDS ||
        checkpoint.maximum_run_history !==
          DEFAULT_MAXIMUM_RUN_HISTORY ||
        checkpoint.fail_closed_on_missing_previous !== true ||
        checkpoint.independent_persistence_required !== false) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_POLICY_INVALID",
        "$.trust_checkpoint_policy",
        "Integrity policy v0.3 requires the exact provider-retained monotonic checkpoint profile."
      ));
    }
  } else if (document &&
      document.trust_checkpoint_policy !== undefined) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_VERSION_MISMATCH",
      "$.trust_checkpoint_policy",
      "Trust checkpoint policy is available only in integrity policy v0.3."
    ));
  }
  if (!Number.isInteger(monitoring.cadence_minutes) ||
      monitoring.cadence_minutes < 60 ||
      monitoring.cadence_minutes > 1440 ||
      !Number.isInteger(monitoring.maximum_release_count) ||
      monitoring.maximum_release_count < 1 ||
      monitoring.maximum_release_count > 100 ||
      !Number.isInteger(monitoring.attestation_retry_attempts) ||
      monitoring.attestation_retry_attempts < 1 ||
      monitoring.attestation_retry_attempts > 12 ||
      !Number.isInteger(monitoring.attestation_retry_interval_seconds) ||
      monitoring.attestation_retry_interval_seconds < 1 ||
      monitoring.attestation_retry_interval_seconds > 60 ||
      monitoring.fail_closed_on_credential_unavailable !== true ||
      monitoring.fail_closed_on_policy_drift !== true ||
      monitoring.fail_closed_on_attestation_failure !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_MONITOR_PROFILE_INVALID",
      "$.monitoring",
      "Monitoring cadence, bounds, retries, and fail-closed controls must remain within the supported profile."
    ));
  }
  if (authority.human_final_decision_authority !== "USER" ||
      authority.self_approval_prohibited !== true ||
      authority.monitoring_authorized !== true ||
      authority.repository_policy_change_authorized !== false ||
      authority.release_authorized !== false ||
      document.repository_policy_change_authorized !== false ||
      document.release_authorized !== false) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_POLICY_AUTHORITY_DRIFT",
      "$.authority",
      "Release-integrity monitoring may observe and alert but cannot change repository policy or authorize a release."
    ));
  }
  return issues;
}

function validateIntegrityObservationSemantics(document) {
  const issues = [];
  const repository = document && document.repository || {};
  const policyRef = document && document.policy_ref || {};
  const trigger = document && document.trigger || {};
  const policyObservation = document && document.policy_observation || {};
  const trustedRootObservation =
    document && document.trusted_root_observation || {};
  const trustCheckpointObservation =
    document && document.trust_checkpoint_observation || {};
  const releases = document && document.releases || [];
  const recordedIssues = document && document.issues || [];
  const summary = document && document.summary || {};
  const authority = document && document.authority || {};
  const independentVerificationRequired =
    document &&
    ["0.2", "0.3"].includes(document.schema_version);
  const trustCheckpointRequired =
    document && document.schema_version === "0.3";
  let trustedRoot = null;

  if (document && document.observation_sha256 !== observationDigest(document)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_OBSERVATION_DIGEST_MISMATCH",
      "$.observation_sha256",
      "Observation digest must bind the complete release-integrity result."
    ));
  }
  if (!isSafeRelativePath(document && document.policy_ref &&
      document.policy_ref.relative_path)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_POLICY_REF_UNSAFE",
      "$.policy_ref.relative_path",
      "The integrity policy reference must use a normalized repository-relative path."
    ));
  }
  if (policyRef.committed_at_head !== true ||
      !/^[a-f0-9]{64}$/.test(policyRef.head_blob_sha256 || "")) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_POLICY_REF_UNCOMMITTED",
      "$.policy_ref",
      "The observation must bind the exact policy blob committed at the observed HEAD."
    ));
  }
  if (independentVerificationRequired) {
    if (trustedRootObservation.status === "verified" &&
        trustedRootObservation.artifact &&
        trustedRootObservation.failure_code === undefined &&
        trustedRootObservation.message === undefined) {
      trustedRoot = trustedRootObservation.artifact;
      for (const trustIssue of validateGitHubReleaseTrustedRoot(
        trustedRoot,
        {
          evaluatedAt: document.observed_at,
          maximumAgeSeconds: DEFAULT_MAXIMUM_AGE_SECONDS
        }
      )) {
        issues.push(semanticIssue(
          trustIssue.code,
          "$.trusted_root_observation.artifact",
          trustIssue.message
        ));
      }
    } else if (trustedRootObservation.status === "unavailable" &&
        trustedRootObservation.artifact === undefined &&
        typeof trustedRootObservation.failure_code === "string" &&
        trustedRootObservation.failure_code.length > 0 &&
        typeof trustedRootObservation.message === "string" &&
        trustedRootObservation.message.length > 0) {
      if (!recordedIssues.some(item =>
        item && item.code === trustedRootObservation.failure_code)) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_INTEGRITY_TRUST_FAILURE_UNRECORDED",
          "$.trusted_root_observation.failure_code",
          "Unavailable trusted-root evidence must have a matching retained monitor issue."
        ));
      }
    } else {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_INTEGRITY_TRUST_OBSERVATION_INVALID",
        "$.trusted_root_observation",
        "Phase 19C observations must retain either a verified trusted root or an explicit acquisition failure."
      ));
    }
  }
  if (trustCheckpointRequired) {
    if (trustCheckpointObservation.status === "verified" &&
        trustCheckpointObservation.provenance &&
        trustCheckpointObservation.previous_checkpoint &&
        trustCheckpointObservation.previous_trusted_root &&
        trustCheckpointObservation.current_checkpoint &&
        trustCheckpointObservation.failure_code === undefined &&
        trustCheckpointObservation.message === undefined &&
        trustedRoot) {
      const previous =
        trustCheckpointObservation.previous_checkpoint;
      const previousRoot =
        trustCheckpointObservation.previous_trusted_root;
      const current =
        trustCheckpointObservation.current_checkpoint;
      for (const checkpointIssue of
        validateGitHubReleaseTrustCheckpoint(previous, {
          evaluatedAt: document.observed_at,
          maximumAgeSeconds:
            DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS
        })) {
        issues.push(semanticIssue(
          checkpointIssue.code,
          "$.trust_checkpoint_observation.previous_checkpoint",
          checkpointIssue.message
        ));
      }
      try {
        const expected = advanceGitHubReleaseTrustCheckpoint({
          repository: {
            full_name: repository.full_name,
            default_branch: repository.default_branch
          },
          previousCheckpoint: previous,
          previousTrustedRoot: previousRoot,
          trustedRoot,
          evaluatedAt: document.observed_at,
          maximumPreviousAgeSeconds:
            DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS,
          producer: current.producer
        });
        if (!sameCanonicalJson(expected, current)) {
          issues.push(semanticIssue(
            "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_REPLAY_MISMATCH",
            "$.trust_checkpoint_observation.current_checkpoint",
            "Current trust checkpoint must exactly equal deterministic advancement from retained predecessor evidence."
          ));
        }
      } catch (error) {
        issues.push(semanticIssue(
          error.code ||
            "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_REPLAY_FAILED",
          "$.trust_checkpoint_observation",
          error.message
        ));
      }
      for (const provenanceIssue of validateCheckpointProvenance(
        trustCheckpointObservation.provenance,
        previous,
        previousRoot,
        document.observed_at
      )) {
        issues.push(provenanceIssue);
      }
      if (summary.trust_checkpoint_continuity_verified !== true) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_SUMMARY_INVALID",
          "$.summary.trust_checkpoint_continuity_verified",
          "Verified checkpoint continuity must be reflected in the observation summary."
        ));
      }
    } else if (trustCheckpointObservation.status === "unavailable" &&
        trustCheckpointObservation.provenance === undefined &&
        trustCheckpointObservation.previous_checkpoint === undefined &&
        trustCheckpointObservation.previous_trusted_root === undefined &&
        trustCheckpointObservation.current_checkpoint === undefined &&
        typeof trustCheckpointObservation.failure_code === "string" &&
        trustCheckpointObservation.failure_code.length > 0 &&
        typeof trustCheckpointObservation.message === "string" &&
        trustCheckpointObservation.message.length > 0) {
      if (!recordedIssues.some(item =>
        item && item.code ===
          trustCheckpointObservation.failure_code)) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_FAILURE_UNRECORDED",
          "$.trust_checkpoint_observation.failure_code",
          "Unavailable checkpoint continuity must have a matching retained monitor issue."
        ));
      }
      if (summary.trust_checkpoint_continuity_verified !== false) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_SUMMARY_INVALID",
          "$.summary.trust_checkpoint_continuity_verified",
          "Unavailable checkpoint continuity must remain false in the observation summary."
        ));
      }
    } else {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_OBSERVATION_INVALID",
        "$.trust_checkpoint_observation",
        "Phase 19D observations must retain a replayable checkpoint transition or an explicit continuity failure."
      ));
    }
  } else if (document &&
      document.trust_checkpoint_observation !== undefined) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_VERSION_MISMATCH",
      "$.trust_checkpoint_observation",
      "Trust checkpoint observation is available only in schema v0.3."
    ));
  }
  if (policyObservation.api_version !== GITHUB_API_VERSION ||
      policyObservation.endpoint !== expectedEndpoint(repository.full_name) ||
      parseTimestamp(policyObservation.checked_at) === null) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_POLICY_OBSERVATION_INVALID",
      "$.policy_observation",
      "The policy observation must bind the exact repository endpoint and a valid check time."
    ));
  }
  if (document.scope === "full") {
    if (policyObservation.status === "not_requested" ||
        summary.policy_assessment_complete !==
          (policyObservation.status === "verified") ||
        summary.policy_drift_assessed !==
          (policyObservation.status === "verified") ||
        (policyObservation.status === "verified" &&
          (typeof policyObservation.enabled !== "boolean" ||
           typeof policyObservation.enforced_by_owner !== "boolean")) ||
        summary.policy_drift_detected !==
          (policyObservation.status === "verified" &&
           policyObservation.enabled === false)) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_INTEGRITY_FULL_POLICY_RESULT_INVALID",
        "$.policy_observation",
        "A full observation must either verify the live policy state or remain explicitly incomplete and blocked."
      ));
    }
  } else if (document.scope === "release_attestation") {
    if (policyObservation.status !== "not_requested" ||
        summary.policy_assessment_complete !== false ||
        summary.policy_drift_assessed !== false ||
        summary.policy_drift_detected !== false ||
        trigger.kind !== "release") {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_INTEGRITY_ATTESTATION_SCOPE_INVALID",
        "$.scope",
        "Release-attestation scope must be release-triggered and cannot claim a policy assessment."
      ));
    }
  }

  const tagNames = releases.map(release => release && release.tag_name);
  if (new Set(tagNames).size !== tagNames.length) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_DUPLICATE_RELEASE",
      "$.releases",
      "Each observed release tag must appear exactly once."
    ));
  }
  for (const [index, release] of releases.entries()) {
    const pointer = `$.releases[${index}]`;
    const attestation = release && release.attestation || {};
    if (!release || !/^[a-f0-9]{40}$/.test(release.commit_sha || "") ||
        parseTimestamp(release.published_at) === null) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_INTEGRITY_RELEASE_INVALID",
        pointer,
        "Every release observation must resolve one exact tag commit and publication time."
      ));
      continue;
    }
    if (release.classification === "grandfathered") {
      if (attestation.required !== false ||
          attestation.status !== "not_required" ||
          attestation.evidence !== undefined ||
          attestation.independent_verification !== undefined ||
          attestation.failure_code !== undefined) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_INTEGRITY_GRANDFATHER_DRIFT",
          pointer,
          "Grandfathered releases cannot be reclassified as requiring an attestation."
        ));
      }
    } else if (release.classification === "post_activation") {
      if (attestation.required !== true ||
          !["verified", "failed"].includes(attestation.status)) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_INTEGRITY_POST_ACTIVATION_PROFILE_INVALID",
          `${pointer}.attestation`,
          "Every post-activation release requires an explicit verified or failed attestation result."
        ));
      }
      if (attestation.status === "verified") {
        if (attestation.failure_code !== undefined ||
            release.immutable !== true) {
          issues.push(semanticIssue(
            "GITHUB_RELEASE_INTEGRITY_MUTABLE_VERIFIED_RELEASE",
            pointer,
            "A post-activation release cannot be accepted as verified while mutable."
          ));
        }
        for (const evidenceIssue of validateReleaseAttestationEvidence(
          attestation.evidence,
          {
            repository: repository.full_name,
            tagName: release.tag_name,
            commitSha: release.commit_sha,
            minimumVerifierVersion: RELEASE_ATTESTATION_MINIMUM_GH_VERSION,
            statementType: RELEASE_ATTESTATION_STATEMENT_TYPE,
            predicateType: RELEASE_ATTESTATION_PREDICATE_TYPE,
            signerIdentity: RELEASE_ATTESTATION_SIGNER_IDENTITY
          }
        )) {
          issues.push(semanticIssue(
            evidenceIssue.code,
            `${pointer}.attestation.evidence`,
            evidenceIssue.message
          ));
        }
        if (independentVerificationRequired) {
          for (const independentIssue of
            validateIndependentVerificationEvidence(
              attestation.independent_verification,
              attestation.evidence &&
                attestation.evidence.raw_verification,
              trustedRoot,
              {
                repository: repository.full_name,
                tagName: release.tag_name,
                commitSha: release.commit_sha,
                signerIdentity:
                  RELEASE_ATTESTATION_SIGNER_IDENTITY,
                assets: attestation.evidence &&
                  attestation.evidence.statement &&
                  attestation.evidence.statement.asset_subjects
              },
              {
                maximumTrustedRootAgeSeconds:
                  DEFAULT_MAXIMUM_AGE_SECONDS
              }
            )) {
            issues.push(semanticIssue(
              independentIssue.code,
              `${pointer}.attestation.independent_verification`,
              independentIssue.message
            ));
          }
        }
      } else if (!attestation.failure_code ||
          attestation.evidence !== undefined ||
          attestation.independent_verification !== undefined) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_INTEGRITY_ATTESTATION_FAILURE_UNEXPLAINED",
          `${pointer}.attestation.failure_code`,
          "A failed release attestation must retain a machine-readable failure code."
        ));
      }
    }
  }

  const grandfatheredCount = releases.filter(release =>
    release.classification === "grandfathered").length;
  const postActivationCount = releases.length - grandfatheredCount;
  const requiredAttestationCount = releases.filter(release =>
    release.attestation && release.attestation.required === true).length;
  const verifiedAttestationCount = releases.filter(release =>
    release.attestation && release.attestation.status === "verified").length;
  const independentlyVerifiedAttestationCount = releases.filter(release =>
    release.attestation &&
    release.attestation.independent_verification &&
    release.attestation.independent_verification
      .cryptographic_verification_succeeded === true).length;
  if (summary.release_count !== releases.length ||
      summary.grandfathered_count !== grandfatheredCount ||
      summary.post_activation_count !== postActivationCount ||
      summary.required_attestation_count !== requiredAttestationCount ||
      summary.verified_attestation_count !== verifiedAttestationCount ||
      (independentVerificationRequired &&
       (summary.independently_verified_attestation_count !==
          independentlyVerifiedAttestationCount ||
        independentlyVerifiedAttestationCount !==
          verifiedAttestationCount)) ||
      summary.issue_count !== recordedIssues.length ||
      summary.release_integrity_assessed !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_SUMMARY_COUNT_MISMATCH",
      "$.summary",
      "Observation summary counts and assessment flags must be derived from the exact release and issue arrays."
    ));
  }
  const shouldBeReady = recordedIssues.length === 0 &&
    (!independentVerificationRequired ||
      trustedRootObservation.status === "verified") &&
    (!trustCheckpointRequired ||
      trustCheckpointObservation.status === "verified") &&
    (document.scope === "release_attestation" ||
      (policyObservation.status === "verified" &&
       policyObservation.enabled === true));
  if (shouldBeReady &&
      (repository.branch !== repository.default_branch ||
       repository.observed_head_sha !==
         repository.origin_default_branch_sha)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_READY_REPOSITORY_STATE_INVALID",
      "$.repository",
      "A ready observation must run from the current origin default-branch commit."
    ));
  }
  if (summary.status !== (shouldBeReady ? "ready" : "blocked") ||
      summary.monitoring_complete !== shouldBeReady) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_TERMINAL_STATE_MISMATCH",
      "$.summary",
      "Only a complete issue-free assessment may report ready."
    ));
  }
  if (authority.human_final_decision_authority !== "USER" ||
      authority.self_approval_prohibited !== true ||
      authority.monitoring_only !== true ||
      authority.repository_policy_change_authorized !== false ||
      authority.release_authorized !== false ||
      document.repository_policy_change_authorized !== false ||
      document.release_authorized !== false) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_OBSERVATION_AUTHORITY_DRIFT",
      "$.authority",
      "An integrity observation is read-only evidence and cannot authorize policy mutation or release."
    ));
  }
  return issues;
}

function assertNoSemanticIssues(issues) {
  if (issues.length > 0) {
    const first = issues[0];
    throw new ReleaseIntegrityError(first.code, first.message, { issues });
  }
}

function requireSchemaValid(document, type) {
  const { validatePayload } = require("./validator-cli-prototype/validate");
  const result = validatePayload(document, type);
  if (!result.valid) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_SCHEMA_INVALID",
      `${type} failed schema or semantic validation.`,
      { result }
    );
  }
}

function validateRetainedFullObservationArtifact(
  artifact,
  options = {}
) {
  const observation = artifact && artifact.full_observation;
  const checkpoint = artifact && artifact.checkpoint;
  const trustedRoot = artifact && artifact.trusted_root;
  const provenance = artifact && artifact.provenance || {};
  if (!observation || !checkpoint || !trustedRoot ||
      !Buffer.isBuffer(options.policyBytes)) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_ARTIFACT_INCOMPLETE",
      `A retained checkpoint artifact must contain exactly one ${FULL_OBSERVATION_FILE_NAME}, ${CHECKPOINT_FILE_NAME}, and ${TRUSTED_ROOT_FILE_NAME}.`
    );
  }

  let policy;
  try {
    policy = JSON.parse(options.policyBytes.toString("utf8"));
  } catch (error) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_ARTIFACT_POLICY_INVALID",
      "The policy used to validate retained observation evidence is not JSON."
    );
  }
  requireSchemaValid(
    observation,
    "github-release-integrity-observation"
  );
  assertNoSemanticIssues(
    validateIntegrityObservationSemantics(observation)
  );

  const repository = options.repository;
  const defaultBranch = options.defaultBranch;
  const workflowPath = options.workflowPath;
  const policyPath = options.policyPath;
  const expectedWorkflowRef =
    `${repository}/${workflowPath}@refs/heads/${defaultBranch}`;
  const expectedRef = `refs/heads/${defaultBranch}`;
  const checkpointObservation =
    observation.trust_checkpoint_observation || {};
  const trustedRootObservation =
    observation.trusted_root_observation || {};
  const observedAt = parseTimestamp(observation.observed_at);
  const artifactCreatedAt = parseTimestamp(
    provenance.artifact_created_at
  );
  const readyRequired = options.requireReady === true;
  const bindingInvalid =
    observation.schema_version !== "0.3" ||
      observation.scope !== "full" ||
      observation.repository.full_name !== repository ||
      observation.repository.default_branch !== defaultBranch ||
      observation.repository.branch !== defaultBranch ||
      observation.repository.observed_head_sha !==
        provenance.head_sha ||
      observation.repository.origin_default_branch_sha !==
        provenance.head_sha ||
      observation.repository.clean !== true ||
      observation.policy_ref.relative_path !== policyPath ||
      observation.policy_ref.sha256 !== policy.policy_sha256 ||
      observation.policy_ref.head_blob_sha256 !==
        sha256(options.policyBytes) ||
      observation.trigger.run_id !== provenance.run_id ||
      observation.trigger.ref !== expectedRef ||
      observation.trigger.kind === "release" ||
      checkpointObservation.status !== "verified" ||
      trustedRootObservation.status !== "verified" ||
      !sameCanonicalJson(
        checkpointObservation.current_checkpoint,
        checkpoint
      ) ||
      !sameCanonicalJson(
        trustedRootObservation.artifact,
        trustedRoot
      ) ||
      checkpoint.producer.kind !== "github_actions" ||
      checkpoint.producer.workflow_ref !== expectedWorkflowRef ||
      checkpoint.producer.run_id !== provenance.run_id ||
      checkpoint.producer.run_attempt !==
        provenance.run_attempt ||
      checkpoint.producer.repository_head_sha !==
        provenance.head_sha ||
      observedAt === null ||
      artifactCreatedAt === null ||
      observedAt >
        artifactCreatedAt + ARTIFACT_TIMESTAMP_TOLERANCE_MS;
  if (bindingInvalid) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_ARTIFACT_BINDING_INVALID",
      "Retained full-monitor evidence does not bind the exact policy, repository, workflow run, root, and checkpoint."
    );
  }
  if (readyRequired &&
      (provenance.conclusion !== "success" ||
       observation.summary.status !== "ready" ||
       observation.summary.monitoring_complete !== true ||
       observation.summary.policy_assessment_complete !== true ||
       observation.summary.trust_checkpoint_continuity_verified !==
         true ||
       observation.issues.length !== 0)) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_ARTIFACT_NOT_READY",
      "Release authorization requires an exact successful ready full-monitor observation."
    );
  }
  return true;
}

function resolveRepositoryPath(repositoryRoot, candidatePath, mustExist) {
  const root = fs.realpathSync(repositoryRoot);
  const absolute = path.resolve(root, candidatePath);
  const lexicalRelative = path.relative(root, absolute)
    .split(path.sep).join("/");
  if (!isSafeRelativePath(lexicalRelative)) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_PATH_ESCAPE",
      "Integrity policy and observation paths must remain inside the target repository."
    );
  }
  if (mustExist && (!fs.existsSync(absolute) ||
      !fs.statSync(absolute).isFile())) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_FILE_MISSING",
      `Required repository file is missing: ${candidatePath}`
    );
  }
  if (mustExist) {
    const resolved = fs.realpathSync(absolute);
    const relative = path.relative(root, resolved)
      .split(path.sep).join("/");
    if (!isSafeRelativePath(relative)) {
      throw new ReleaseIntegrityError(
        "GITHUB_RELEASE_INTEGRITY_PATH_ESCAPE",
        "Integrity policy and observation paths must remain inside the target repository."
      );
    }
    return { absolute: resolved, relative };
  }

  const parent = path.dirname(absolute);
  let existingAncestor = parent;
  while (!fs.existsSync(existingAncestor)) {
    const next = path.dirname(existingAncestor);
    if (next === existingAncestor) break;
    existingAncestor = next;
  }
  const realAncestor = fs.realpathSync(existingAncestor);
  const ancestorRelative = path.relative(root, realAncestor)
    .split(path.sep).join("/");
  if (ancestorRelative && !isSafeRelativePath(ancestorRelative)) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_PATH_ESCAPE",
      "Integrity policy and observation paths must remain inside the target repository."
    );
  }
  fs.mkdirSync(parent, { recursive: true });
  const realParent = fs.realpathSync(parent);
  const parentRelative = path.relative(root, realParent)
    .split(path.sep).join("/");
  if (parentRelative && !isSafeRelativePath(parentRelative)) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_PATH_ESCAPE",
      "Integrity policy and observation paths must remain inside the target repository."
    );
  }
  if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_OUTPUT_NOT_FILE",
      "The integrity observation output path resolves to a directory."
    );
  }
  return { absolute, relative: lexicalRelative };
}

function inspectCommittedPolicy(repositoryRoot, relativePath, currentBytes) {
  const result = commandResult(
    "git",
    ["show", `HEAD:${relativePath}`],
    { cwd: repositoryRoot }
  );
  if (result.status !== 0) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_POLICY_NOT_COMMITTED",
      "The release-integrity policy must exist in the current HEAD commit."
    );
  }
  const headBytes = Buffer.from(result.stdout, "utf8");
  if (!headBytes.equals(currentBytes)) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_POLICY_NOT_COMMITTED",
      "The working release-integrity policy must exactly equal its current HEAD blob."
    );
  }
  return sha256(headBytes);
}

function assertActivationCommitIsAncestor(repositoryRoot, activationCommitSha) {
  const result = commandResult(
    "git",
    ["merge-base", "--is-ancestor", activationCommitSha, "HEAD"],
    { cwd: repositoryRoot }
  );
  if (result.status !== 0) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_ACTIVATION_COMMIT_UNBOUND",
      "The immutable-release activation commit must exist in the monitored HEAD ancestry."
    );
  }
}

class SystemGitHubReleaseIntegrityAdapter extends SystemGitHubReleaseAdapter {
  inspectIntegrityPolicy(repository) {
    const monitorToken =
      process.env.CANNAE_IMMUTABILITY_MONITOR_TOKEN || "";
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
      {
        cwd: this.repositoryRoot,
        ...(monitorToken ? {
          env: {
            ...process.env,
            GH_TOKEN: monitorToken,
            GITHUB_TOKEN: monitorToken
          }
        } : {})
      }
    );
    if (result.status !== 0) {
      const detail = [result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n")
        .trim();
      const credentialFailure =
        /\b(?:401|403)\b|requires authentication|resource not accessible|insufficient/i
          .test(detail);
      throw new ReleaseIntegrityError(
        credentialFailure
          ? "GITHUB_RELEASE_POLICY_MONITOR_CREDENTIAL_UNAVAILABLE"
          : "GITHUB_RELEASE_POLICY_INSPECTION_FAILED",
        credentialFailure
          ? "The policy monitor credential is missing or lacks repository Administration read permission."
          : "GitHub immutable-release policy inspection failed.",
        { status: result.status }
      );
    }
    const policy = parseJsonOutput(
      result.stdout,
      "GITHUB_RELEASE_POLICY_JSON_INVALID"
    );
    return {
      api_version: GITHUB_API_VERSION,
      enabled: policy.enabled === true,
      enforced_by_owner: policy.enforced_by_owner === true
    };
  }

  inspectPublishedReleases(repository, maximumReleaseCount) {
    return parseJsonOutput(requireCommand(
      "gh",
      [
        "release",
        "list",
        "--repo",
        repository,
        "--limit",
        String(maximumReleaseCount),
        "--exclude-drafts",
        "--json",
        "tagName,name,isDraft,isPrerelease,isLatest,isImmutable,publishedAt"
      ],
      {
        cwd: this.repositoryRoot,
        code: "GITHUB_RELEASE_INTEGRITY_LIST_FAILED"
      }
    ), "GITHUB_RELEASE_INTEGRITY_LIST_JSON_INVALID");
  }
}

function monitorIssue(code, scope, message, tagName) {
  return {
    severity: "critical",
    code,
    scope,
    ...(tagName ? { tag_name: tagName } : {}),
    message
  };
}

function validateCheckpointProvenance(
  provenance,
  previousCheckpoint,
  previousTrustedRoot,
  observedAt
) {
  const issues = [];
  if (provenance.source === "repository_bootstrap") {
    if (!/^[a-f0-9]{40}$/.test(
      provenance.policy_introduction_commit || ""
    ) ||
        parseTimestamp(provenance.policy_introduction_time) === null ||
        provenance.bootstrap_checkpoint_path !==
          ".github/tuf/github-release-trust-checkpoint.json" ||
        provenance.bootstrap_checkpoint_sha256 !==
          previousCheckpoint.checkpoint_sha256 ||
        provenance.bootstrap_trusted_root_path !==
          ".github/tuf/github-release-trust-bootstrap-root.json" ||
        provenance.bootstrap_trusted_root_sha256 !==
          previousTrustedRoot.artifact_sha256 ||
        previousCheckpoint.sequence !== 0 ||
        previousCheckpoint.producer.kind !==
          "repository_bootstrap") {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_BOOTSTRAP_PROVENANCE_INVALID",
        "$.trust_checkpoint_observation.provenance",
        "Repository bootstrap provenance must bind the exact committed genesis checkpoint and trusted-root artifact."
      ));
    }
  } else if (provenance.source === "github_actions_artifact") {
    const createdAt = parseTimestamp(provenance.artifact_created_at);
    const expiresAt = parseTimestamp(provenance.artifact_expires_at);
    const observedAtMs = parseTimestamp(observedAt);
    if (!/^[1-9][0-9]*$/.test(provenance.run_id || "") ||
        !Number.isSafeInteger(provenance.run_attempt) ||
        provenance.run_attempt < 1 ||
        !/^[a-f0-9]{40}$/.test(provenance.head_sha || "") ||
        !["success", "failure"].includes(provenance.conclusion) ||
        !/^[1-9][0-9]*$/.test(provenance.artifact_id || "") ||
        typeof provenance.artifact_name !== "string" ||
        provenance.artifact_name.length < 1 ||
        !/^sha256:[a-f0-9]{64}$/.test(
          provenance.artifact_digest || ""
        ) ||
        createdAt === null ||
        expiresAt === null ||
        observedAtMs === null ||
        createdAt > observedAtMs ||
        expiresAt <= observedAtMs ||
        previousCheckpoint.producer.kind !== "github_actions" ||
        previousCheckpoint.producer.repository_head_sha !==
          provenance.head_sha ||
        previousCheckpoint.producer.run_id !== provenance.run_id ||
        previousCheckpoint.producer.run_attempt !==
          provenance.run_attempt) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_ARTIFACT_PROVENANCE_INVALID",
        "$.trust_checkpoint_observation.provenance",
        "GitHub artifact provenance must be live and exactly match the retained checkpoint producer."
      ));
    }
  } else {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_CHECKPOINT_PROVENANCE_INVALID",
      "$.trust_checkpoint_observation.provenance.source",
      "Checkpoint predecessor provenance must use a supported retention channel."
    ));
  }
  return issues;
}

function buildTrustedRootObservation(
  policy,
  options,
  observedAt,
  issues
) {
  if (!["0.2", "0.3"].includes(policy.schema_version)) return null;
  if (options.trustedRoot) {
    const trustIssues = validateGitHubReleaseTrustedRoot(
      options.trustedRoot,
      {
        evaluatedAt: observedAt,
        maximumAgeSeconds:
          policy.attestation_policy.maximum_trusted_root_age_seconds
      }
    );
    if (trustIssues.length === 0) {
      return {
        status: "verified",
        artifact: JSON.parse(JSON.stringify(options.trustedRoot))
      };
    }
    const first = trustIssues[0];
    issues.push(monitorIssue(
      first.code,
      "attestation",
      first.message
    ));
    return {
      status: "unavailable",
      failure_code: first.code,
      message: first.message
    };
  }
  const failure = options.trustedRootFailure || {};
  const failureCode = failure.code ||
    "GITHUB_RELEASE_TRUSTED_ROOT_UNAVAILABLE";
  const message = failure.message ||
    "GitHub TUF trusted-root evidence was not available.";
  issues.push(monitorIssue(
    failureCode,
    "attestation",
    message
  ));
  return {
    status: "unavailable",
    failure_code: failureCode,
    message
  };
}

function buildTrustCheckpointObservation(
  policy,
  options,
  observedAt,
  issues,
  repository,
  trustedRootObservation
) {
  if (policy.schema_version !== "0.3") return null;
  const failure = options.trustCheckpointFailure || {};
  if (!trustedRootObservation ||
      trustedRootObservation.status !== "verified") {
    const failureCode = failure.code ||
      "GITHUB_RELEASE_CHECKPOINT_CURRENT_ROOT_UNAVAILABLE";
    const message = failure.message ||
      "Current trusted-root evidence is unavailable, so checkpoint continuity cannot advance.";
    issues.push(monitorIssue(
      failureCode,
      "checkpoint",
      message
    ));
    return {
      status: "unavailable",
      failure_code: failureCode,
      message
    };
  }
  if (!options.previousTrustCheckpoint ||
      !options.previousTrustedRoot ||
      !options.checkpointProvenance) {
    const failureCode = failure.code ||
      "GITHUB_RELEASE_CHECKPOINT_PREDECESSOR_UNAVAILABLE";
    const message = failure.message ||
      "Prior trust checkpoint lineage was not available.";
    issues.push(monitorIssue(
      failureCode,
      "checkpoint",
      message
    ));
    return {
      status: "unavailable",
      failure_code: failureCode,
      message
    };
  }
  const producer = options.checkpointProducer || (
    process.env.GITHUB_ACTIONS === "true"
      ? {
        kind: "github_actions",
        repository_head_sha: repository.head_sha,
        workflow_ref:
          `${policy.repository.full_name}/${
            policy.trust_checkpoint_policy.workflow_path
          }@refs/heads/${policy.repository.default_branch}`,
        run_id: String(
          options.runId || process.env.GITHUB_RUN_ID || ""
        ),
        run_attempt: Number(
          options.runAttempt ||
          process.env.GITHUB_RUN_ATTEMPT ||
          0
        )
      }
      : {
        kind: "local_operator",
        repository_head_sha: repository.head_sha,
        workflow_ref: "none",
        run_id: String(options.runId || "local"),
        run_attempt: 0
      }
  );
  try {
    const currentCheckpoint =
      advanceGitHubReleaseTrustCheckpoint({
        repository: {
          full_name: policy.repository.full_name,
          default_branch: policy.repository.default_branch
        },
        previousCheckpoint: options.previousTrustCheckpoint,
        previousTrustedRoot: options.previousTrustedRoot,
        trustedRoot: trustedRootObservation.artifact,
        evaluatedAt: observedAt,
        maximumPreviousAgeSeconds:
          policy.trust_checkpoint_policy
            .maximum_checkpoint_age_seconds,
        producer
      });
    return {
      status: "verified",
      provenance: cloneJson(options.checkpointProvenance),
      previous_checkpoint:
        cloneJson(options.previousTrustCheckpoint),
      previous_trusted_root:
        cloneJson(options.previousTrustedRoot),
      current_checkpoint: currentCheckpoint
    };
  } catch (error) {
    const failureCode = error.code ||
      "GITHUB_RELEASE_CHECKPOINT_ADVANCE_FAILED";
    issues.push(monitorIssue(
      failureCode,
      "checkpoint",
      error.message
    ));
    return {
      status: "unavailable",
      failure_code: failureCode,
      message: error.message
    };
  }
}

function makeAttestationDocument(policy, release) {
  return {
    repository: { full_name: policy.repository.full_name },
    target: {
      tag_name: release.tagName,
      commit_sha: release.commitSha
    },
    release_attestation: {
      minimum_verifier_version:
        policy.attestation_policy.minimum_verifier_version,
      statement_type: policy.attestation_policy.statement_type,
      predicate_type: policy.attestation_policy.predicate_type,
      signer_identity: policy.attestation_policy.signer_identity
    }
  };
}

function inspectOneRelease(
  policy,
  observed,
  runtime,
  issues,
  trustedRootObservation
) {
  const grandfathered = new Map(
    policy.grandfathered_releases.map(item => [item.tag_name, item])
  );
  const baseline = grandfathered.get(observed.tagName);
  const commitSha = runtime.resolveRemoteTag(observed.tagName);
  if (!commitSha) {
    issues.push(monitorIssue(
      "GITHUB_RELEASE_INTEGRITY_TAG_UNRESOLVED",
      "release",
      "The published release tag could not be resolved from origin.",
      observed.tagName
    ));
  }
  const release = {
    tagName: observed.tagName,
    releaseName: observed.name || observed.tagName,
    commitSha: commitSha || "0000000000000000000000000000000000000000",
    publishedAt: observed.publishedAt,
    draft: observed.isDraft === true,
    prerelease: observed.isPrerelease === true,
    latest: observed.isLatest === true,
    immutable: observed.isImmutable === true,
    classification: baseline ? "grandfathered" : "post_activation"
  };

  if (release.draft || release.prerelease ||
      !/^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/
        .test(release.tagName) ||
      parseTimestamp(release.publishedAt) === null) {
    issues.push(monitorIssue(
      "GITHUB_RELEASE_INTEGRITY_UNSUPPORTED_RELEASE",
      "release",
      "The current release policy permits only published stable semantic-version releases.",
      release.tagName
    ));
  }

  let attestation;
  if (baseline) {
    if (release.commitSha !== baseline.commit_sha ||
        release.publishedAt !== baseline.published_at ||
        release.immutable !== baseline.expected_immutable) {
      issues.push(monitorIssue(
        "GITHUB_RELEASE_INTEGRITY_GRANDFATHER_BASELINE_DRIFT",
        "release",
        "A grandfathered release no longer matches its exact activation baseline.",
        release.tagName
      ));
    }
    attestation = {
      required: false,
      status: "not_required"
    };
  } else {
    if (parseTimestamp(release.publishedAt) !== null &&
        parseTimestamp(release.publishedAt) <=
          parseTimestamp(policy.activation.activated_at)) {
      issues.push(monitorIssue(
        "GITHUB_RELEASE_INTEGRITY_UNDECLARED_PREACTIVATION_RELEASE",
        "release",
        "A non-grandfathered release predates policy activation and is not in the reviewed baseline.",
        release.tagName
      ));
    }
    if (release.immutable !== true) {
      issues.push(monitorIssue(
        "GITHUB_RELEASE_INTEGRITY_POST_ACTIVATION_MUTABLE",
        "release",
        "Every post-activation release must be immutable.",
        release.tagName
      ));
    }
    if (release.immutable !== true) {
      attestation = {
        required: true,
        status: "failed",
        failure_code: "GITHUB_RELEASE_INTEGRITY_POST_ACTIVATION_MUTABLE"
      };
    } else if (["0.2", "0.3"].includes(policy.schema_version) &&
        (!trustedRootObservation ||
         trustedRootObservation.status !== "verified")) {
      attestation = {
        required: true,
        status: "failed",
        failure_code:
          trustedRootObservation &&
          trustedRootObservation.failure_code ||
          "GITHUB_RELEASE_TRUSTED_ROOT_UNAVAILABLE"
      };
    } else {
      try {
        const evidence = verifyReleaseAttestationWithRetry(
          makeAttestationDocument(policy, release),
          runtime,
          {
            attempts: policy.monitoring.attestation_retry_attempts,
            intervalSeconds:
              policy.monitoring.attestation_retry_interval_seconds
          }
        );
        const independentVerification =
          ["0.2", "0.3"].includes(policy.schema_version)
            ? verifyGitHubReleaseBundle({
              rawVerification: evidence.raw_verification,
              trustedRoot: trustedRootObservation.artifact,
              expected: {
                repository: policy.repository.full_name,
                tagName: release.tagName,
                commitSha: release.commitSha,
                signerIdentity:
                  policy.attestation_policy.signer_identity,
                assets: evidence.statement.asset_subjects
              },
              verifiedAt: evidence.verified_at,
              maximumTrustedRootAgeSeconds:
                policy.attestation_policy
                  .maximum_trusted_root_age_seconds
            })
            : null;
        attestation = {
          required: true,
          status: "verified",
          evidence,
          ...(independentVerification
            ? { independent_verification: independentVerification }
            : {})
        };
      } catch (error) {
        const failureCode = error.code ||
          "GITHUB_RELEASE_INTEGRITY_ATTESTATION_FAILED";
        issues.push(monitorIssue(
          failureCode,
          "attestation",
          "The GitHub-signed release attestation did not verify against the exact release.",
          release.tagName
        ));
        attestation = {
          required: true,
          status: "failed",
          failure_code: failureCode
        };
      }
    }
  }

  return {
    tag_name: release.tagName,
    release_name: release.releaseName,
    commit_sha: release.commitSha,
    published_at: release.publishedAt,
    draft: release.draft,
    prerelease: release.prerelease,
    latest: release.latest,
    immutable: release.immutable,
    classification: release.classification,
    attestation
  };
}

function monitorRepository(options, adapter = null) {
  const repositoryRoot = fs.realpathSync(
    options.repositoryRoot || process.cwd()
  );
  const policyPath = resolveRepositoryPath(
    repositoryRoot,
    options.policyPath,
    true
  );
  const policyBytes = fs.readFileSync(policyPath.absolute);
  const policy = JSON.parse(policyBytes.toString("utf8"));
  assertNoSemanticIssues(validateIntegrityPolicySemantics(policy));
  requireSchemaValid(policy, "github-release-integrity-policy");

  const tracked = commandResult(
    "git",
    ["ls-files", "--error-unmatch", "--", policyPath.relative],
    { cwd: repositoryRoot }
  ).status === 0;
  if (!tracked) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_POLICY_UNTRACKED",
      "The release-integrity policy must be tracked in the monitored repository."
    );
  }
  const headPolicyBlobSha256 = inspectCommittedPolicy(
    repositoryRoot,
    policyPath.relative,
    policyBytes
  );
  assertActivationCommitIsAncestor(
    repositoryRoot,
    policy.activation.activation_commit_sha
  );

  const runtime = adapter ||
    new SystemGitHubReleaseIntegrityAdapter(repositoryRoot);
  const observedAt = options.now || runtime.now();
  const repository = runtime.inspectRepository();
  const issues = [];
  if (repository.full_name !== policy.repository.full_name ||
      repository.origin_full_name !== policy.repository.full_name ||
      repository.default_branch !== policy.repository.default_branch ||
      repository.visibility !== policy.repository.visibility) {
    issues.push(monitorIssue(
      "GITHUB_RELEASE_INTEGRITY_REPOSITORY_SCOPE_MISMATCH",
      "repository",
      "The observed repository, origin, default branch, or visibility does not match the integrity policy."
    ));
  }
  if (repository.branch !== policy.repository.default_branch ||
      repository.head_sha !== repository.origin_default_branch_sha) {
    issues.push(monitorIssue(
      "GITHUB_RELEASE_INTEGRITY_REPOSITORY_STATE_DRIFT",
      "repository",
      "The monitor must execute from the current origin default-branch commit."
    ));
  }
  const trustedRootObservation = buildTrustedRootObservation(
    policy,
    options,
    observedAt,
    issues
  );
  const trustCheckpointObservation =
    buildTrustCheckpointObservation(
      policy,
      options,
      observedAt,
      issues,
      repository,
      trustedRootObservation
    );

  const scope = options.scope || "full";
  const policyObservation = {
    api_version: GITHUB_API_VERSION,
    endpoint: expectedEndpoint(policy.repository.full_name),
    status: "not_requested",
    checked_at: observedAt
  };
  if (scope === "full") {
    try {
      const observedPolicy = runtime.inspectIntegrityPolicy(
        policy.repository.full_name
      );
      policyObservation.status = "verified";
      policyObservation.enabled = observedPolicy.enabled;
      policyObservation.enforced_by_owner =
        observedPolicy.enforced_by_owner;
      if (observedPolicy.enabled !== true) {
        issues.push(monitorIssue(
          "GITHUB_RELEASE_INTEGRITY_POLICY_DRIFT",
          "policy",
          "The repository immutable-release policy is no longer enabled."
        ));
      }
    } catch (error) {
      const credentialUnavailable =
        error.code ===
        "GITHUB_RELEASE_POLICY_MONITOR_CREDENTIAL_UNAVAILABLE";
      policyObservation.status = credentialUnavailable
        ? "credential_unavailable"
        : "inspection_failed";
      issues.push(monitorIssue(
        error.code || "GITHUB_RELEASE_POLICY_INSPECTION_FAILED",
        "policy",
        error.message
      ));
    }
  } else if (scope !== "release_attestation") {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_SCOPE_INVALID",
      "Monitor scope must be full or release_attestation."
    );
  }

  let observedReleases;
  try {
    observedReleases = runtime.inspectPublishedReleases(
      policy.repository.full_name,
      policy.monitoring.maximum_release_count
    );
  } catch (error) {
    throw new ReleaseIntegrityError(
      error.code || "GITHUB_RELEASE_INTEGRITY_LIST_FAILED",
      error.message
    );
  }
  if (!Array.isArray(observedReleases)) {
    throw new ReleaseIntegrityError(
      "GITHUB_RELEASE_INTEGRITY_LIST_INVALID",
      "GitHub release listing must be an array."
    );
  }
  if (observedReleases.length >=
      policy.monitoring.maximum_release_count) {
    issues.push(monitorIssue(
      "GITHUB_RELEASE_INTEGRITY_LIST_TRUNCATED",
      "release",
      "The release listing reached its configured bound and cannot prove complete coverage."
    ));
  }

  let selectedReleases = observedReleases;
  if (scope === "release_attestation") {
    if (!options.expectedTag) {
      throw new ReleaseIntegrityError(
        "GITHUB_RELEASE_INTEGRITY_EXPECTED_TAG_MISSING",
        "Release-attestation scope requires --expected-tag."
      );
    }
    selectedReleases = observedReleases.filter(release =>
      release.tagName === options.expectedTag);
    if (selectedReleases.length !== 1) {
      issues.push(monitorIssue(
        "GITHUB_RELEASE_INTEGRITY_EXPECTED_RELEASE_MISSING",
        "release",
        "The release event tag was not found exactly once in the published release list.",
        options.expectedTag
      ));
    }
  }

  const releases = selectedReleases.map(observed =>
    inspectOneRelease(
      policy,
      observed,
      runtime,
      issues,
      trustedRootObservation
    )
  ).sort((left, right) => {
    const timeOrder = Date.parse(left.published_at) - Date.parse(right.published_at);
    return timeOrder === 0
      ? left.tag_name.localeCompare(right.tag_name)
      : timeOrder;
  });

  if (scope === "full") {
    const observedTags = new Set(releases.map(release => release.tag_name));
    for (const baseline of policy.grandfathered_releases) {
      if (!observedTags.has(baseline.tag_name)) {
        issues.push(monitorIssue(
          "GITHUB_RELEASE_INTEGRITY_GRANDFATHER_RELEASE_MISSING",
          "release",
          "A release recorded in the activation baseline is missing from GitHub.",
          baseline.tag_name
        ));
      }
    }
  }

  const policyAssessmentComplete =
    policyObservation.status === "verified";
  const policyDriftDetected = policyAssessmentComplete &&
    policyObservation.enabled === false;
  const grandfatheredCount = releases.filter(release =>
    release.classification === "grandfathered").length;
  const postActivationCount = releases.length - grandfatheredCount;
  const requiredAttestationCount = releases.filter(release =>
    release.attestation.required === true).length;
  const verifiedAttestationCount = releases.filter(release =>
    release.attestation.status === "verified").length;
  const independentlyVerifiedAttestationCount = releases.filter(release =>
    release.attestation.independent_verification &&
    release.attestation.independent_verification
      .cryptographic_verification_succeeded === true).length;
  const ready = issues.length === 0 &&
    (!["0.2", "0.3"].includes(policy.schema_version) ||
      trustedRootObservation.status === "verified") &&
    (policy.schema_version !== "0.3" ||
      trustCheckpointObservation.status === "verified") &&
    (scope === "release_attestation" ||
      (policyAssessmentComplete && policyObservation.enabled === true));
  const observation = {
    schema_version: policy.schema_version,
    type: "GitHubReleaseIntegrityObservation",
    id: `GRIO-${observedAt.replace(/[^0-9]/g, "").slice(0, 14)}-${
      sha256(Buffer.from(
        `${policy.id}:${scope}:${options.expectedTag || "all"}:${observedAt}`,
        "utf8"
      )).slice(0, 12)
    }`,
    scope,
    policy_ref: {
      policy_id: policy.id,
      relative_path: policyPath.relative,
      sha256: policy.policy_sha256,
      head_blob_sha256: headPolicyBlobSha256,
      committed_at_head: true
    },
    repository: {
      full_name: repository.full_name,
      default_branch: repository.default_branch,
      visibility: repository.visibility,
      branch: repository.branch,
      observed_head_sha: repository.head_sha,
      origin_default_branch_sha: repository.origin_default_branch_sha,
      clean: repository.clean
    },
    trigger: {
      kind: options.triggerKind || "manual",
      actor: options.actor || process.env.GITHUB_ACTOR || "local-operator",
      run_id: String(options.runId || process.env.GITHUB_RUN_ID || "local"),
      ref: options.ref || process.env.GITHUB_REF || "local"
    },
    policy_observation: policyObservation,
    ...(trustedRootObservation
      ? { trusted_root_observation: trustedRootObservation }
      : {}),
    ...(trustCheckpointObservation
      ? {
        trust_checkpoint_observation:
          trustCheckpointObservation
      }
      : {}),
    releases,
    issues,
    summary: {
      status: ready ? "ready" : "blocked",
      monitoring_complete: ready,
      policy_assessment_complete: policyAssessmentComplete,
      policy_drift_assessed: policyAssessmentComplete,
      policy_drift_detected: policyDriftDetected,
      release_integrity_assessed: true,
      release_count: releases.length,
      grandfathered_count: grandfatheredCount,
      post_activation_count: postActivationCount,
      required_attestation_count: requiredAttestationCount,
      verified_attestation_count: verifiedAttestationCount,
      ...(["0.2", "0.3"].includes(policy.schema_version)
        ? {
          independently_verified_attestation_count:
            independentlyVerifiedAttestationCount
        }
        : {}),
      ...(policy.schema_version === "0.3"
        ? {
          trust_checkpoint_continuity_verified:
            trustCheckpointObservation.status === "verified"
        }
        : {}),
      issue_count: issues.length
    },
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      monitoring_only: true,
      repository_policy_change_authorized: false,
      release_authorized: false
    },
    repository_policy_change_authorized: false,
    release_authorized: false,
    observed_at: observedAt
  };
  observation.observation_sha256 = observationDigest(observation);
  assertNoSemanticIssues(validateIntegrityObservationSemantics(observation));
  requireSchemaValid(observation, "github-release-integrity-observation");
  return observation;
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new ReleaseIntegrityError(
        "GITHUB_RELEASE_INTEGRITY_CLI_ARGUMENT_INVALID",
        `Unexpected argument: ${token}`
      );
    }
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ReleaseIntegrityError(
        "GITHUB_RELEASE_INTEGRITY_CLI_ARGUMENT_MISSING",
        `Missing value for --${key}.`
      );
    }
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function usage() {
  return [
    "Usage:",
    "  node github-release-integrity-monitor.js monitor --repository-root <path> --policy <repo-relative.json> --trusted-root-output <repo-relative.json> --trust-checkpoint-output <repo-relative.json> --output <repo-relative.json> [--scope full|release_attestation] [--expected-tag <tag>] [--trigger manual|schedule|release|push] [--actor <actor>] [--run-id <id>] [--run-attempt <n>] [--ref <ref>]"
  ].join("\n");
}

async function main(argv = process.argv.slice(2)) {
  try {
    const { command, options } = parseCli(argv);
    if (command !== "monitor") {
      throw new ReleaseIntegrityError(
        "GITHUB_RELEASE_INTEGRITY_COMMAND_INVALID",
        "Expected monitor command."
      );
    }
    for (const field of [
      "policy",
      "trusted-root-output",
      "trust-checkpoint-output",
      "output"
    ]) {
      if (!options[field]) {
        throw new ReleaseIntegrityError(
          "GITHUB_RELEASE_INTEGRITY_OPTION_MISSING",
          `Missing --${field}.`
        );
      }
    }
    const repositoryRoot = fs.realpathSync(
      options["repository-root"] || process.cwd()
    );
    const outputPath = resolveRepositoryPath(
      repositoryRoot,
      options.output,
      false
    );
    const trustedRootOutputPath = resolveRepositoryPath(
      repositoryRoot,
      options["trusted-root-output"],
      false
    );
    const trustCheckpointOutputPath = resolveRepositoryPath(
      repositoryRoot,
      options["trust-checkpoint-output"],
      false
    );
    const policyInputPath = resolveRepositoryPath(
      repositoryRoot,
      options.policy,
      true
    );
    const policyBytes = fs.readFileSync(policyInputPath.absolute);
    const policy = JSON.parse(policyBytes.toString("utf8"));
    const observedAt = new Date().toISOString();
    let trustedRoot = null;
    let trustedRootFailure = null;
    try {
      trustedRoot = await refreshGitHubReleaseTrustedRoot({
        repositoryRoot,
        fetchedAt: observedAt
      });
      writeJsonAtomic(trustedRootOutputPath.absolute, trustedRoot);
    } catch (error) {
      trustedRootFailure = {
        code: error.code ||
          "GITHUB_RELEASE_TRUSTED_ROOT_UNAVAILABLE",
        message: error.message
      };
    }
    let previousTrustCheckpoint = null;
    let previousTrustedRoot = null;
    let checkpointProvenance = null;
    let trustCheckpointFailure = null;
    if (policy.schema_version === "0.3" &&
        policy.trust_checkpoint_policy) {
      try {
        const checkpointStore =
          new SystemGitHubReleaseCheckpointStore(repositoryRoot);
        const previous = checkpointStore.resolve({
          repository: policy.repository.full_name,
          defaultBranch: policy.repository.default_branch,
          policyPath: policyInputPath.relative,
          policyBytes,
          bootstrapCheckpointPath:
            policy.trust_checkpoint_policy
              .bootstrap_checkpoint_path,
          bootstrapTrustedRootPath:
            policy.trust_checkpoint_policy
              .bootstrap_trusted_root_path,
          workflowPath:
            policy.trust_checkpoint_policy.workflow_path,
          artifactNamePrefix:
            policy.trust_checkpoint_policy
              .artifact_name_prefix,
          maximumRunHistory:
            policy.trust_checkpoint_policy
              .maximum_run_history,
          bootstrapWindowSeconds:
            policy.trust_checkpoint_policy
              .bootstrap_window_seconds,
          now: observedAt,
          currentRunId:
            options["run-id"] || process.env.GITHUB_RUN_ID,
          currentRunAttempt:
            options["run-attempt"] ||
            process.env.GITHUB_RUN_ATTEMPT ||
            1
        });
        if (previous.provenance.source ===
            "github_actions_artifact") {
          validateRetainedFullObservationArtifact(previous, {
            repository: policy.repository.full_name,
            defaultBranch: policy.repository.default_branch,
            workflowPath:
              policy.trust_checkpoint_policy.workflow_path,
            policyPath: policyInputPath.relative,
            policyBytes,
            requireReady: false
          });
        }
        previousTrustCheckpoint = previous.checkpoint;
        previousTrustedRoot = previous.trusted_root;
        checkpointProvenance = previous.provenance;
      } catch (error) {
        trustCheckpointFailure = {
          code: error.code ||
            "GITHUB_RELEASE_CHECKPOINT_PREDECESSOR_UNAVAILABLE",
          message: error.message
        };
      }
    }
    const observation = monitorRepository({
      repositoryRoot,
      policyPath: options.policy,
      scope: options.scope || "full",
      expectedTag: options["expected-tag"],
      triggerKind: options.trigger || "manual",
      actor: options.actor,
      runId: options["run-id"],
      runAttempt: Number(
        options["run-attempt"] ||
        process.env.GITHUB_RUN_ATTEMPT ||
        1
      ),
      ref: options.ref,
      now: observedAt,
      trustedRoot,
      trustedRootFailure,
      previousTrustCheckpoint,
      previousTrustedRoot,
      checkpointProvenance,
      trustCheckpointFailure
    });
    if (observation.trust_checkpoint_observation &&
        observation.trust_checkpoint_observation.status ===
          "verified") {
      writeJsonAtomic(
        trustCheckpointOutputPath.absolute,
        observation.trust_checkpoint_observation
          .current_checkpoint
      );
    }
    writeJsonAtomic(outputPath.absolute, observation);
    process.stdout.write(`${JSON.stringify({
      valid: observation.summary.status === "ready",
      observation_id: observation.id,
      observation_sha256: observation.observation_sha256,
      repository: observation.repository.full_name,
      scope: observation.scope,
      status: observation.summary.status,
      policy_status: observation.policy_observation.status,
      release_count: observation.summary.release_count,
      verified_attestation_count:
        observation.summary.verified_attestation_count,
      independently_verified_attestation_count:
        observation.summary
          .independently_verified_attestation_count || 0,
      trust_checkpoint_status:
        observation.trust_checkpoint_observation
          ? observation.trust_checkpoint_observation.status
          : "not_required",
      trust_checkpoint_sequence:
        observation.trust_checkpoint_observation &&
        observation.trust_checkpoint_observation
          .current_checkpoint
          ? observation.trust_checkpoint_observation
            .current_checkpoint.sequence
          : null,
      issue_codes: observation.issues.map(issue => issue.code),
      output: outputPath.absolute,
      release_authorized: false
    }, null, 2)}\n`);
    if (observation.summary.status !== "ready") {
      if (process.env.GITHUB_ACTIONS === "true") {
        console.error(
          "::error title=Release integrity monitor blocked::" +
          observation.issues.map(issue => issue.code).join(",")
        );
      }
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(JSON.stringify({
      valid: false,
      code: error.code || "GITHUB_RELEASE_INTEGRITY_OPERATION_FAILED",
      message: error.message,
      ...(error.details && Object.keys(error.details).length > 0
        ? { details: error.details }
        : {}),
      release_authorized: false
    }, null, 2));
    if (!error.code) console.error(usage());
    process.exitCode = 1;
  }
}

module.exports = {
  ReleaseIntegrityError,
  SystemGitHubReleaseIntegrityAdapter,
  buildTrustedRootObservation,
  expectedEndpoint,
  main,
  monitorRepository,
  observationDigest,
  policyDigest,
  resolveRepositoryPath,
  validateIntegrityObservationSemantics,
  validateIntegrityPolicySemantics,
  validateRetainedFullObservationArtifact
};

if (require.main === module) main();
