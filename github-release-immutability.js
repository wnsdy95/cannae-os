#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { canonicalJsonBytes } = require("./verifier-identity-evidence");
const {
  GITHUB_API_VERSION,
  ReleaseAuthorizationError,
  SystemGitHubReleaseAdapter,
  isSafeRelativePath,
  writeJsonAtomic
} = require("./github-release-publisher");

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

function commandResult(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
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

function addMinutes(isoTimestamp, minutes) {
  return new Date(Date.parse(isoTimestamp) + minutes * 60 * 1000).toISOString();
}

function policyEndpoint(repository) {
  return `/repos/${repository}/immutable-releases`;
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
      "The selected run is not the successful default-branch Validate push for the exact target commit.",
      { run: normalized }
    );
  }
  return normalized;
}

function assertRepositoryPreconditions(repository, expectedRepository) {
  if (repository.full_name !== expectedRepository) {
    throw new ReleaseAuthorizationError(
      "REPOSITORY_IDENTITY_MISMATCH",
      `Expected ${expectedRepository}, got ${repository.full_name}.`
    );
  }
  if (repository.origin_full_name !== repository.full_name) {
    throw new ReleaseAuthorizationError(
      "ORIGIN_REPOSITORY_MISMATCH",
      "The normalized Git origin must equal the GitHub repository."
    );
  }
  if (repository.branch !== repository.default_branch) {
    throw new ReleaseAuthorizationError(
      "POLICY_CHANGE_NOT_ON_DEFAULT_BRANCH",
      `Policy authorization requires branch ${repository.default_branch}.`
    );
  }
  if (!repository.clean) {
    throw new ReleaseAuthorizationError(
      "POLICY_CHANGE_REPOSITORY_DIRTY",
      "Policy authorization requires a clean repository."
    );
  }
  if (repository.head_sha !== repository.origin_default_branch_sha) {
    throw new ReleaseAuthorizationError(
      "POLICY_CHANGE_REPOSITORY_DRIFT",
      "Local HEAD must equal the live origin default branch."
    );
  }
  if (repository.visibility !== "PUBLIC") {
    throw new ReleaseAuthorizationError(
      "POLICY_CHANGE_REPOSITORY_NOT_PUBLIC",
      "Phase 19A is limited to an already-public repository."
    );
  }
  if (repository.viewer_permission !== "ADMIN") {
    throw new ReleaseAuthorizationError(
      "POLICY_CHANGE_ADMIN_REQUIRED",
      "Immutable-release policy activation requires repository ADMIN permission."
    );
  }
}

function sameJson(left, right) {
  return sha256(canonicalJsonBytes(left)) === sha256(canonicalJsonBytes(right));
}

class SystemGitHubReleaseImmutabilityAdapter extends SystemGitHubReleaseAdapter {
  inspectLatestReleaseState(repository) {
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
        "tagName,isLatest,isImmutable,isDraft,isPrerelease,publishedAt"
      ],
      {
        cwd: this.repositoryRoot,
        code: "GITHUB_RELEASE_LIST_FAILED"
      }
    ), "GITHUB_RELEASE_LIST_JSON_INVALID");
    const latest = releases.find(item =>
      item.isLatest === true &&
      item.isDraft === false &&
      item.isPrerelease === false);
    if (!latest) {
      throw new ReleaseAuthorizationError(
        "LATEST_RELEASE_MISSING",
        "Phase 19A requires one observable latest stable release."
      );
    }
    return {
      tag_name: latest.tagName,
      published_at: latest.publishedAt,
      immutable: latest.isImmutable === true
    };
  }

  enableReleaseImmutability(repository) {
    const result = commandResult(
      "gh",
      [
        "api",
        "--include",
        "--method",
        "PUT",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
        `repos/${repository}/immutable-releases`
      ],
      { cwd: this.repositoryRoot }
    );
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    if (result.status !== 0) {
      throw new ReleaseAuthorizationError(
        "GITHUB_RELEASE_IMMUTABILITY_ENABLE_FAILED",
        `GitHub rejected immutable-release activation.${detail ? ` ${detail}` : ""}`,
        { status: result.status }
      );
    }
    const statusMatch = /^HTTP\/\S+\s+(\d{3})/mi.exec(detail);
    if (!statusMatch) {
      throw new ReleaseAuthorizationError(
        "GITHUB_RELEASE_IMMUTABILITY_RESPONSE_MISSING",
        "GitHub activation response did not include an HTTP status line."
      );
    }
    const responseStatus = Number(statusMatch[1]);
    if (responseStatus !== 204) {
      throw new ReleaseAuthorizationError(
        "GITHUB_RELEASE_IMMUTABILITY_RESPONSE_INVALID",
        `Expected HTTP 204, got ${responseStatus}.`
      );
    }
    return { response_status: responseStatus };
  }
}

function validateAuthorizationSemantics(document, options = {}) {
  const issues = [];
  const repository = document && document.repository || {};
  const policy = document && document.policy || {};
  const validation = document && document.main_validation || {};
  const state = document && document.repository_state || {};
  const latest = document && document.latest_release_snapshot || {};
  const grant = document && document.user_grant || {};
  const authority = document && document.authority || {};

  if (document && document.authorization_sha256 !== authorizationDigest(document)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_AUTH_DIGEST_MISMATCH",
      "$.authorization_sha256",
      "Authorization digest must bind the complete repository-policy authorization."
    ));
  }
  if (document && (document.single_use !== true || document.consumed !== false ||
      document.repository_policy_change_authorized !== true ||
      document.release_authorized !== false)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_AUTHORITY_INVALID",
      "$.repository_policy_change_authorized",
      "Only one unconsumed repository-policy action may be authorized and release must remain false."
    ));
  }
  if (authority.human_final_decision_authority !== "USER" ||
      authority.self_approval_prohibited !== true ||
      authority.ai_approval_accepted !== false ||
      authority.repository_policy_change_authorized !== true ||
      authority.release_authorized !== false) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_AUTHORITY_DRIFT",
      "$.authority",
      "The USER must retain policy authority and AI approval cannot be accepted."
    ));
  }
  if (repository.origin_full_name !== repository.full_name ||
      repository.viewer_permission !== "ADMIN") {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_REPOSITORY_SCOPE_INVALID",
      "$.repository",
      "Repository identity, normalized origin, and ADMIN permission must match."
    ));
  }
  if (policy.api_version !== GITHUB_API_VERSION ||
      policy.endpoint !== policyEndpoint(repository.full_name) ||
      policy.method !== "PUT" ||
      policy.operation !== "enable_repository_release_immutability" ||
      policy.previous_state && policy.previous_state.enabled !== false ||
      policy.desired_state && policy.desired_state.enabled !== true ||
      policy.future_releases_only !== true ||
      policy.rollback_operation !== "disable_for_future_releases") {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_POLICY_SCOPE_INVALID",
      "$.policy",
      "The policy must bind one exact disabled-to-enabled future-release transition."
    ));
  }
  if (validation.head_branch !== repository.default_branch ||
      validation.head_sha !== state.head_sha ||
      validation.workflow_name !== "Validate" ||
      validation.required_check !== "Doctrine and runtime checks" ||
      validation.required_check_status !== "completed" ||
      validation.required_check_conclusion !== "success" ||
      validation.event !== "push" || validation.status !== "completed" ||
      validation.conclusion !== "success") {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_CI_INVALID",
      "$.main_validation",
      "The exact default-branch Validate push and required check must succeed."
    ));
  }
  if (state.branch !== repository.default_branch ||
      state.head_sha !== state.origin_default_branch_sha ||
      state.clean !== true) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_REPOSITORY_STATE_INVALID",
      "$.repository_state",
      "Policy authorization requires a clean, origin-synchronized default branch."
    ));
  }
  if (typeof latest.immutable !== "boolean") {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_LATEST_RELEASE_INVALID",
      "$.latest_release_snapshot",
      "The current latest release immutability state must be explicit."
    ));
  }
  if (grant.authority !== "USER" ||
      grant.scope !== "enable_repository_release_immutability" ||
      grant.repository !== repository.full_name ||
      grant.policy_endpoint !== policy.endpoint ||
      grant.target_commit_sha !== state.head_sha ||
      grant.desired_enabled !== true ||
      grant.approved !== true ||
      grant.directive_sha256 !== userGrantDigest(grant)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_USER_GRANT_INVALID",
      "$.user_grant",
      "The exact USER grant must bind repository, endpoint, commit, desired state, and validity."
    ));
  }

  const issuedAt = parseTimestamp(document && document.issued_at);
  const expiresAt = parseTimestamp(document && document.expires_at);
  const grantedAt = parseTimestamp(grant.granted_at);
  const grantExpiresAt = parseTimestamp(grant.expires_at);
  if (issuedAt === null || expiresAt === null || grantedAt === null ||
      grantExpiresAt === null || grantedAt > issuedAt ||
      issuedAt >= expiresAt || grantExpiresAt !== expiresAt ||
      expiresAt - issuedAt > 60 * 60 * 1000) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_VALIDITY_INVALID",
      "$.expires_at",
      "The USER grant and authorization require one ordered validity window of at most 60 minutes."
    ));
  }
  if (options.requireFresh === true) {
    const now = parseTimestamp(options.now || new Date().toISOString());
    if (now === null || issuedAt === null || expiresAt === null ||
        now < issuedAt || now >= expiresAt) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_IMMUTABILITY_AUTHORIZATION_EXPIRED",
        "$.expires_at",
        "The repository-policy authorization is not currently valid."
      ));
    }
  }
  return issues;
}

function validateReceiptSemantics(document) {
  const issues = [];
  const repository = document && document.repository || {};
  const policy = document && document.policy || {};
  const existingRelease = document && document.existing_release_observation || {};
  const authority = document && document.authority || {};
  const beforeEnabled = policy.before && policy.before.enabled;
  const afterEnabled = policy.after && policy.after.enabled;
  if (document && document.receipt_sha256 !== receiptDigest(document)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_RECEIPT_DIGEST_MISMATCH",
      "$.receipt_sha256",
      "Receipt digest must bind the complete repository-policy receipt."
    ));
  }
  if (document && (document.authorization_consumed !== true ||
      document.policy_change_executed !== true ||
      document.policy_verified !== true ||
      document.repository_policy_change_authorized !== true ||
      document.release_authorized !== false)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_RECEIPT_NOT_TERMINAL",
      "$.policy_verified",
      "The receipt must record consumed authority, executed and verified policy, and no release authority."
    ));
  }
  if (authority.human_final_decision_authority !== "USER" ||
      authority.self_approval_prohibited !== true ||
      authority.repository_policy_change_authorized !== true ||
      authority.release_authorized !== false) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_RECEIPT_AUTHORITY_DRIFT",
      "$.authority",
      "The receipt must preserve USER policy authority and release false."
    ));
  }
  if (policy.api_version !== GITHUB_API_VERSION ||
      policy.endpoint !== policyEndpoint(repository.full_name) ||
      policy.method !== "PUT" ||
      policy.operation !== "enable_repository_release_immutability" ||
      policy.before && policy.before.api_version !== GITHUB_API_VERSION ||
      policy.after && policy.after.api_version !== GITHUB_API_VERSION ||
      ![false, true].includes(beforeEnabled) ||
      afterEnabled !== true ||
      policy.before && policy.after &&
        policy.before.enforced_by_owner !== policy.after.enforced_by_owner ||
      policy.future_releases_only !== true ||
      typeof policy.request_performed !== "boolean" ||
      (policy.request_performed === true &&
        (beforeEnabled !== false || policy.response_status !== 204)) ||
      (policy.request_performed === false &&
        (beforeEnabled !== true || policy.response_status !== null))) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_RECEIPT_POLICY_INVALID",
      "$.policy",
      "The receipt must preserve either one exact disabled-to-enabled request or an already-enabled idempotent verification."
    ));
  }
  if (existingRelease.immutable_before !== existingRelease.immutable_after) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_HISTORICAL_RELEASE_DRIFT",
      "$.existing_release_observation",
      "Repository policy activation must not change the pre-existing release immutability state."
    ));
  }
  if (!isSafeRelativePath(document && document.authorization_ref &&
      document.authorization_ref.relative_path)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_RECEIPT_PATH_INVALID",
      "$.authorization_ref.relative_path",
      "The consumed authorization reference must remain repository-relative."
    ));
  }
  const recordedAt = parseTimestamp(document && document.recorded_at);
  const verifiedAt = parseTimestamp(policy.verified_at);
  if (recordedAt === null || verifiedAt === null || recordedAt < verifiedAt) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_IMMUTABILITY_RECEIPT_TIME_INVALID",
      "$.recorded_at",
      "The receipt must be recorded at or after policy verification."
    ));
  }
  return issues;
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
      "RELEASE_IMMUTABILITY_DOCUMENT_INVALID",
      `${type} failed schema or semantic validation.`,
      { result }
    );
  }
}

function authorizePolicyChange(options, adapter = null) {
  const repositoryRoot = fs.realpathSync(options.repositoryRoot || process.cwd());
  const runtime = adapter || new SystemGitHubReleaseImmutabilityAdapter(repositoryRoot);
  const repository = runtime.inspectRepository();
  assertRepositoryPreconditions(repository, options.repository);
  if (!/^[A-Z]+-[A-Za-z0-9_-]+$/.test(options.grantId || "")) {
    throw new ReleaseAuthorizationError(
      "USER_GRANT_ID_INVALID",
      "Grant ID must use the Controls ID format."
    );
  }
  const currentPolicy = runtime.inspectReleaseImmutability(repository.full_name);
  if (currentPolicy.enabled === true) {
    throw new ReleaseAuthorizationError(
      "RELEASE_IMMUTABILITY_ALREADY_ENABLED",
      "Repository release immutability is already enabled."
    );
  }
  const latestRelease = runtime.inspectLatestReleaseState(repository.full_name);
  const mainValidation = assertRun(
    runtime.inspectRun(repository.full_name, options.runId),
    repository,
    repository.head_sha,
    options.runId
  );
  const issuedAt = options.now || runtime.now();
  const validityMinutes = Number(options.expiresInMinutes || 30);
  if (!Number.isInteger(validityMinutes) || validityMinutes < 1 || validityMinutes > 60) {
    throw new ReleaseAuthorizationError(
      "POLICY_CHANGE_VALIDITY_OUT_OF_RANGE",
      "Policy authorization validity must be between 1 and 60 minutes."
    );
  }
  const expiresAt = addMinutes(issuedAt, validityMinutes);
  const endpoint = policyEndpoint(repository.full_name);
  const grant = {
    grant_id: options.grantId,
    authority: "USER",
    scope: "enable_repository_release_immutability",
    repository: repository.full_name,
    policy_endpoint: endpoint,
    target_commit_sha: repository.head_sha,
    desired_enabled: true,
    approved: true,
    granted_at: issuedAt,
    expires_at: expiresAt
  };
  grant.directive_sha256 = userGrantDigest(grant);

  const document = {
    schema_version: "0.1",
    type: "GitHubReleaseImmutabilityAuthorization",
    id: `GRIA-enable-${repository.head_sha.slice(0, 12)}`,
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
    policy: {
      api_version: GITHUB_API_VERSION,
      endpoint,
      method: "PUT",
      operation: "enable_repository_release_immutability",
      previous_state: currentPolicy,
      desired_state: {
        enabled: true
      },
      future_releases_only: true,
      rollback_operation: "disable_for_future_releases"
    },
    repository_state: {
      branch: repository.branch,
      head_sha: repository.head_sha,
      origin_default_branch_sha: repository.origin_default_branch_sha,
      clean: true
    },
    main_validation: mainValidation,
    latest_release_snapshot: latestRelease,
    user_grant: grant,
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      ai_approval_accepted: false,
      repository_policy_change_authorized: true,
      release_authorized: false
    },
    repository_policy_change_authorized: true,
    release_authorized: false
  };
  document.authorization_sha256 = authorizationDigest(document);
  assertNoSemanticIssues(validateAuthorizationSemantics(document));
  requireSchemaValid(document, "github-release-immutability-authorization");
  return document;
}

function repositoryRelativeRealPath(repositoryRoot, filePath) {
  const candidatePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(repositoryRoot, filePath);
  const absolutePath = fs.realpathSync(candidatePath);
  const relativePath = path.relative(repositoryRoot, absolutePath)
    .split(path.sep).join("/");
  if (!isSafeRelativePath(relativePath)) {
    throw new ReleaseAuthorizationError(
      "AUTHORIZATION_PATH_OUTSIDE_REPOSITORY",
      "The policy authorization must be stored beneath the repository root."
    );
  }
  return { absolutePath, relativePath };
}

function prepareRepositoryOutputPath(repositoryRoot, filePath) {
  const root = fs.realpathSync(repositoryRoot);
  const absolutePath = path.resolve(root, filePath);
  const relativePath = path.relative(root, absolutePath)
    .split(path.sep).join("/");
  if (!isSafeRelativePath(relativePath)) {
    throw new ReleaseAuthorizationError(
      "POLICY_ARTIFACT_PATH_OUTSIDE_REPOSITORY",
      "Policy authorization and receipt outputs must remain beneath the repository root."
    );
  }
  const parentPath = path.dirname(absolutePath);
  fs.mkdirSync(parentPath, { recursive: true });
  const realParent = fs.realpathSync(parentPath);
  const parentRelative = path.relative(root, realParent)
    .split(path.sep).join("/");
  if (parentRelative && !isSafeRelativePath(parentRelative)) {
    throw new ReleaseAuthorizationError(
      "POLICY_ARTIFACT_PATH_OUTSIDE_REPOSITORY",
      "Policy artifact parent directory resolves outside the repository root."
    );
  }
  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
    throw new ReleaseAuthorizationError(
      "POLICY_ARTIFACT_OUTPUT_NOT_FILE",
      "Policy artifact output path resolves to a directory."
    );
  }
  return { absolutePath, relativePath };
}

function executePolicyChange(options, adapter = null) {
  const repositoryRoot = fs.realpathSync(options.repositoryRoot || process.cwd());
  if (options.receiptPath) {
    prepareRepositoryOutputPath(repositoryRoot, options.receiptPath);
  }
  const runtime = adapter || new SystemGitHubReleaseImmutabilityAdapter(repositoryRoot);
  const authorizationFile = repositoryRelativeRealPath(
    repositoryRoot,
    options.authorizationPath
  );
  const document = JSON.parse(fs.readFileSync(authorizationFile.absolutePath, "utf8"));
  assertNoSemanticIssues(validateAuthorizationSemantics(document, {
    requireFresh: true,
    now: runtime.now()
  }));
  requireSchemaValid(document, "github-release-immutability-authorization");

  const repository = runtime.inspectRepository();
  assertRepositoryPreconditions(repository, document.repository.full_name);
  if (repository.default_branch !== document.repository.default_branch ||
      repository.head_sha !== document.repository_state.head_sha ||
      repository.origin_default_branch_sha !== document.repository_state.head_sha) {
    throw new ReleaseAuthorizationError(
      "AUTHORIZED_POLICY_COMMIT_DRIFT",
      "The repository no longer matches the authorized policy commit."
    );
  }
  const observedRun = assertRun(
    runtime.inspectRun(document.repository.full_name, document.main_validation.run_id),
    repository,
    document.repository_state.head_sha,
    document.main_validation.run_id
  );
  if (!sameJson(observedRun, document.main_validation)) {
    throw new ReleaseAuthorizationError(
      "AUTHORIZED_POLICY_CI_DRIFT",
      "The observed main validation no longer matches the authorization."
    );
  }
  const latestRelease = runtime.inspectLatestReleaseState(document.repository.full_name);
  if (!sameJson(latestRelease, document.latest_release_snapshot)) {
    throw new ReleaseAuthorizationError(
      "AUTHORIZED_LATEST_RELEASE_DRIFT",
      "The latest release changed after policy authorization."
    );
  }

  const before = runtime.inspectReleaseImmutability(document.repository.full_name);
  let requestPerformed = false;
  let responseStatus = null;
  const expectedEnabledState = {
    ...document.policy.previous_state,
    enabled: true
  };
  if (before.enabled === false) {
    if (!sameJson(before, document.policy.previous_state)) {
      throw new ReleaseAuthorizationError(
        "AUTHORIZED_POLICY_STATE_DRIFT",
        "The current immutable-release state differs from the authorized previous state."
      );
    }
    const response = runtime.enableReleaseImmutability(document.repository.full_name);
    requestPerformed = true;
    responseStatus = response.response_status;
  } else if (!sameJson(before, expectedEnabledState)) {
    throw new ReleaseAuthorizationError(
      "AUTHORIZED_POLICY_STATE_DRIFT",
      "The already-enabled immutable-release state differs from the authorized target state."
    );
  }
  const after = runtime.inspectReleaseImmutability(document.repository.full_name);
  if (!sameJson(after, expectedEnabledState)) {
    throw new ReleaseAuthorizationError(
      "RELEASE_IMMUTABILITY_VERIFICATION_FAILED",
      "GitHub did not report the exact authorized release-immutability state after the operation."
    );
  }
  const latestReleaseAfter = runtime.inspectLatestReleaseState(
    document.repository.full_name
  );
  if (!sameJson(latestReleaseAfter, document.latest_release_snapshot)) {
    throw new ReleaseAuthorizationError(
      "RELEASE_IMMUTABILITY_RETROACTIVITY_MISMATCH",
      "The pre-existing latest release changed during policy activation."
    );
  }
  const verifiedAt = runtime.now();
  const receipt = {
    schema_version: "0.1",
    type: "GitHubReleaseImmutabilityReceipt",
    id: `GRIR-enable-${document.repository_state.head_sha.slice(0, 12)}`,
    authorization_ref: {
      authorization_id: document.id,
      relative_path: authorizationFile.relativePath,
      sha256: document.authorization_sha256
    },
    repository: {
      full_name: document.repository.full_name,
      default_branch: document.repository.default_branch
    },
    policy: {
      api_version: GITHUB_API_VERSION,
      endpoint: document.policy.endpoint,
      method: "PUT",
      operation: "enable_repository_release_immutability",
      before,
      after,
      request_performed: requestPerformed,
      response_status: responseStatus,
      future_releases_only: true,
      verified_at: verifiedAt
    },
    existing_release_observation: {
      tag_name: document.latest_release_snapshot.tag_name,
      published_at: document.latest_release_snapshot.published_at,
      immutable_before: document.latest_release_snapshot.immutable,
      immutable_after: latestReleaseAfter.immutable
    },
    authorization_consumed: true,
    policy_change_executed: true,
    policy_verified: true,
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      repository_policy_change_authorized: true,
      release_authorized: false
    },
    repository_policy_change_authorized: true,
    release_authorized: false,
    recorded_at: runtime.now()
  };
  receipt.receipt_sha256 = receiptDigest(receipt);
  assertNoSemanticIssues(validateReceiptSemantics(receipt));
  requireSchemaValid(receipt, "github-release-immutability-receipt");
  return receipt;
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
      throw new ReleaseAuthorizationError(
        "CLI_ARGUMENT_MISSING_VALUE",
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
    "  node github-release-immutability.js authorize --repository-root <path> --repository <owner/repo> --run-id <id> --grant-id <ID> --output <authorization.json> [--expires-in-minutes <1-60>]",
    "  node github-release-immutability.js enable --repository-root <path> --authorization <authorization.json> --receipt <receipt.json>"
  ].join("\n");
}

function main(argv = process.argv.slice(2)) {
  try {
    const { command, options } = parseCli(argv);
    if (command === "authorize") {
      for (const field of ["repository", "run-id", "grant-id", "output"]) {
        if (!options[field]) {
          throw new ReleaseAuthorizationError(
            "CLI_ARGUMENT_REQUIRED",
            `--${field} is required.`
          );
        }
      }
      const repositoryRoot = options["repository-root"] || process.cwd();
      const outputPath = prepareRepositoryOutputPath(repositoryRoot, options.output);
      const authorization = authorizePolicyChange({
        repositoryRoot,
        repository: options.repository,
        runId: Number(options["run-id"]),
        grantId: options["grant-id"],
        expiresInMinutes: options["expires-in-minutes"]
      });
      writeJsonAtomic(outputPath.absolutePath, authorization);
      process.stdout.write(`${JSON.stringify({
        authorized: true,
        repository_policy_change_authorized: true,
        release_authorized: false,
        authorization_id: authorization.id,
        authorization_sha256: authorization.authorization_sha256,
        repository: authorization.repository.full_name,
        desired_enabled: true,
        expires_at: authorization.expires_at,
        output: outputPath.absolutePath
      }, null, 2)}\n`);
      return;
    }
    if (command === "enable") {
      for (const field of ["authorization", "receipt"]) {
        if (!options[field]) {
          throw new ReleaseAuthorizationError(
            "CLI_ARGUMENT_REQUIRED",
            `--${field} is required.`
          );
        }
      }
      const repositoryRoot = options["repository-root"] || process.cwd();
      const receiptPath = prepareRepositoryOutputPath(repositoryRoot, options.receipt);
      const receipt = executePolicyChange({
        repositoryRoot,
        authorizationPath: options.authorization,
        receiptPath: receiptPath.absolutePath
      });
      writeJsonAtomic(receiptPath.absolutePath, receipt);
      process.stdout.write(`${JSON.stringify({
        enabled: true,
        verified: true,
        repository_policy_change_authorized: true,
        release_authorized: false,
        receipt_id: receipt.id,
        receipt_sha256: receipt.receipt_sha256,
        repository: receipt.repository.full_name,
        request_performed: receipt.policy.request_performed,
        output: receiptPath.absolutePath
      }, null, 2)}\n`);
      return;
    }
    throw new ReleaseAuthorizationError("CLI_COMMAND_INVALID", usage());
  } catch (error) {
    const output = {
      valid: false,
      code: error.code || "GITHUB_RELEASE_IMMUTABILITY_OPERATION_FAILED",
      message: error.message
    };
    if (error.details && Object.keys(error.details).length > 0) output.details = error.details;
    console.error(JSON.stringify(output, null, 2));
    if (!error.code) console.error(usage());
    process.exitCode = 1;
  }
}

module.exports = {
  SystemGitHubReleaseImmutabilityAdapter,
  authorizationDigest,
  authorizePolicyChange,
  executePolicyChange,
  main,
  policyEndpoint,
  prepareRepositoryOutputPath,
  receiptDigest,
  userGrantDigest,
  validateAuthorizationSemantics,
  validateReceiptSemantics
};

if (require.main === module) main();
