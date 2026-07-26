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
const { canonicalJsonBytes } = require("./verifier-identity-evidence");

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
  const releases = document && document.releases || [];
  const recordedIssues = document && document.issues || [];
  const summary = document && document.summary || {};
  const authority = document && document.authority || {};

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
      } else if (!attestation.failure_code ||
          attestation.evidence !== undefined) {
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
  if (summary.release_count !== releases.length ||
      summary.grandfathered_count !== grandfatheredCount ||
      summary.post_activation_count !== postActivationCount ||
      summary.required_attestation_count !== requiredAttestationCount ||
      summary.verified_attestation_count !== verifiedAttestationCount ||
      summary.issue_count !== recordedIssues.length ||
      summary.release_integrity_assessed !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_INTEGRITY_SUMMARY_COUNT_MISMATCH",
      "$.summary",
      "Observation summary counts and assessment flags must be derived from the exact release and issue arrays."
    ));
  }
  const shouldBeReady = recordedIssues.length === 0 &&
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

function inspectOneRelease(policy, observed, runtime, issues) {
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
        attestation = {
          required: true,
          status: "verified",
          evidence
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
    inspectOneRelease(policy, observed, runtime, issues)
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
  const ready = issues.length === 0 &&
    (scope === "release_attestation" ||
      (policyAssessmentComplete && policyObservation.enabled === true));
  const observation = {
    schema_version: "0.1",
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
    "  node github-release-integrity-monitor.js monitor --repository-root <path> --policy <repo-relative.json> --output <repo-relative.json> [--scope full|release_attestation] [--expected-tag <tag>] [--trigger manual|schedule|release] [--actor <actor>] [--run-id <id>] [--ref <ref>]"
  ].join("\n");
}

function main(argv = process.argv.slice(2)) {
  try {
    const { command, options } = parseCli(argv);
    if (command !== "monitor") {
      throw new ReleaseIntegrityError(
        "GITHUB_RELEASE_INTEGRITY_COMMAND_INVALID",
        "Expected monitor command."
      );
    }
    for (const field of ["policy", "output"]) {
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
    const observation = monitorRepository({
      repositoryRoot,
      policyPath: options.policy,
      scope: options.scope || "full",
      expectedTag: options["expected-tag"],
      triggerKind: options.trigger || "manual",
      actor: options.actor,
      runId: options["run-id"],
      ref: options.ref
    });
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
  expectedEndpoint,
  main,
  monitorRepository,
  observationDigest,
  policyDigest,
  resolveRepositoryPath,
  validateIntegrityObservationSemantics,
  validateIntegrityPolicySemantics
};

if (require.main === module) main();
