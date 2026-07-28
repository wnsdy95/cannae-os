#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  DEFAULT_BOOTSTRAP_RECOVERY_PATH,
  SystemGitHubReleaseCheckpointStore,
  latestPolicyChange,
  policyMatchesCommit,
  sha256
} = require("./github-release-checkpoint-store");
const {
  createGitHubReleaseBootstrapRecovery
} = require("./github-release-bootstrap-recovery");
const {
  commandResult,
  writeJsonAtomic
} = require("./github-release-publisher");
const {
  resolveRepositoryPath,
  validateRetainedInitialBootstrapFailureArtifact
} = require("./github-release-integrity-monitor");
const {
  validateGitHubReleaseTrustCheckpoint
} = require("./github-release-trust-checkpoint");
const {
  validateGitHubReleaseTrustedRoot
} = require("./github-release-trusted-root");

class GitHubReleaseBootstrapRecoveryOperatorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name =
      "GitHubReleaseBootstrapRecoveryOperatorError";
    this.code = code;
    this.details = details;
  }
}

function parseTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseOptions(argv) {
  const [command, ...tokens] = argv;
  const options = { command };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--") ||
        !tokens[index + 1] ||
        tokens[index + 1].startsWith("--")) {
      throw new GitHubReleaseBootstrapRecoveryOperatorError(
        "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_OPTION_INVALID",
        `Expected --name value, received ${token}.`
      );
    }
    options[token.slice(2)] = tokens[index + 1];
    index += 1;
  }
  return options;
}

function isAncestor(repositoryRoot, ancestor) {
  return commandResult(
    "git",
    ["merge-base", "--is-ancestor", ancestor, "HEAD"],
    { cwd: repositoryRoot }
  ).status === 0;
}

function readJson(repositoryRoot, relativePath) {
  const resolved = resolveRepositoryPath(
    repositoryRoot,
    relativePath,
    true
  );
  try {
    return JSON.parse(fs.readFileSync(resolved.absolute, "utf8"));
  } catch (error) {
    throw new GitHubReleaseBootstrapRecoveryOperatorError(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_INPUT_INVALID",
      `Recovery input is not valid JSON: ${relativePath}`
    );
  }
}

function blockedRunRecord(run, artifact) {
  const observation = artifact.full_observation;
  return {
    run_id: String(run.id),
    run_number: run.run_number,
    run_attempt: run.run_attempt,
    run_created_at: run.created_at,
    head_sha: run.head_sha,
    conclusion: run.conclusion,
    artifact_id: artifact.provenance.artifact_id,
    artifact_name: artifact.provenance.artifact_name,
    artifact_digest: artifact.provenance.artifact_digest,
    artifact_created_at:
      artifact.provenance.artifact_created_at,
    artifact_expires_at:
      artifact.provenance.artifact_expires_at,
    observation_id: observation.id,
    observation_sha256: observation.observation_sha256,
    observed_at: observation.observed_at,
    checkpoint_failure_code:
      observation.trust_checkpoint_observation.failure_code
  };
}

function authorize(options) {
  for (const field of [
    "repository-root",
    "user-grant-id",
    "granted-at",
    "authorized-at",
    "expires-at"
  ]) {
    if (!options[field]) {
      throw new GitHubReleaseBootstrapRecoveryOperatorError(
        "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_OPTION_MISSING",
        `authorize requires --${field}.`
      );
    }
  }
  const repositoryRoot = fs.realpathSync(
    path.resolve(options["repository-root"])
  );
  const policyPath = options.policy ||
    ".github/release-integrity-policy.json";
  const outputPath = options.output ||
    DEFAULT_BOOTSTRAP_RECOVERY_PATH;
  if (outputPath !== DEFAULT_BOOTSTRAP_RECOVERY_PATH) {
    throw new GitHubReleaseBootstrapRecoveryOperatorError(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_OUTPUT_INVALID",
      `Recovery authorization must use ${DEFAULT_BOOTSTRAP_RECOVERY_PATH}.`
    );
  }
  const policyInput = resolveRepositoryPath(
    repositoryRoot,
    policyPath,
    true
  );
  const policyBytes = fs.readFileSync(policyInput.absolute);
  const committedPolicy = commandResult(
    "git",
    ["show", `HEAD:${policyInput.relative}`],
    { cwd: repositoryRoot }
  );
  if (committedPolicy.status !== 0 ||
      !Buffer.from(committedPolicy.stdout, "utf8")
        .equals(policyBytes)) {
    throw new GitHubReleaseBootstrapRecoveryOperatorError(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_POLICY_UNCOMMITTED",
      "Recovery authorization requires exact current-HEAD policy bytes."
    );
  }
  const policy = JSON.parse(policyBytes.toString("utf8"));
  const {
    validatePayload
  } = require("./validator-cli-prototype/validate");
  const policyValidation = validatePayload(
    policy,
    "github-release-integrity-policy"
  );
  if (!policyValidation.valid) {
    throw new GitHubReleaseBootstrapRecoveryOperatorError(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_POLICY_INVALID",
      "Recovery authorization requires a schema-valid read-only release-integrity policy.",
      { issues: policyValidation.issues }
    );
  }
  const checkpointPolicy = policy.trust_checkpoint_policy || {};
  const repository = options.repository ||
    policy.repository && policy.repository.full_name;
  const defaultBranch = options["default-branch"] ||
    policy.repository && policy.repository.default_branch;
  if (repository !==
      (policy.repository && policy.repository.full_name) ||
      defaultBranch !==
        (policy.repository && policy.repository.default_branch)) {
    throw new GitHubReleaseBootstrapRecoveryOperatorError(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_REPOSITORY_MISMATCH",
      "Recovery repository and default branch must equal the committed policy."
    );
  }
  const authorizedAt = options["authorized-at"];
  if (parseTimestamp(options["granted-at"]) === null ||
      parseTimestamp(authorizedAt) === null ||
      parseTimestamp(options["expires-at"]) === null) {
    throw new GitHubReleaseBootstrapRecoveryOperatorError(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_TIME_INVALID",
      "Recovery grant, authorization, and expiry require exact timestamps."
    );
  }
  const bootstrapCheckpointPath =
    checkpointPolicy.bootstrap_checkpoint_path;
  const bootstrapTrustedRootPath =
    checkpointPolicy.bootstrap_trusted_root_path;
  const workflowPath = checkpointPolicy.workflow_path;
  const artifactNamePrefix =
    checkpointPolicy.artifact_name_prefix;
  const maximumRunHistory =
    checkpointPolicy.maximum_run_history;
  const checkpoint = readJson(
    repositoryRoot,
    bootstrapCheckpointPath
  );
  const trustedRoot = readJson(
    repositoryRoot,
    bootstrapTrustedRootPath
  );
  const trustIssues = [
    ...validateGitHubReleaseTrustedRoot(trustedRoot, {
      evaluatedAt: authorizedAt
    }),
    ...validateGitHubReleaseTrustCheckpoint(checkpoint, {
      evaluatedAt: authorizedAt,
      trustedRoot
    })
  ];
  if (trustIssues.length > 0 ||
      checkpoint.sequence !== 0 ||
      !checkpoint.predecessor ||
      checkpoint.predecessor.kind !== "genesis" ||
      !checkpoint.predecessor.bootstrap_authorization ||
      checkpoint.predecessor.bootstrap_authorization.grant_id !==
        options["user-grant-id"] ||
      checkpoint.producer.kind !== "repository_bootstrap" ||
      checkpoint.checkpoint_reset_authorized !== false ||
      checkpoint.release_authorized !== false) {
    throw new GitHubReleaseBootstrapRecoveryOperatorError(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_GENESIS_INVALID",
      "Recovery requires one fresh sequence-zero USER genesis and exact retained trusted root.",
      { issues: trustIssues }
    );
  }

  const store = new SystemGitHubReleaseCheckpointStore(
    repositoryRoot
  );
  const introduction = latestPolicyChange(
    repositoryRoot,
    policyInput.relative
  );
  const runs = store.listCompletedRuns(
    repository,
    defaultBranch,
    workflowPath,
    maximumRunHistory
  );
  const oldestListedRunTime = runs.reduce(
    (oldest, run) => {
      const candidate = parseTimestamp(run && run.created_at);
      if (candidate === null) return oldest;
      return oldest === null || candidate < oldest
        ? candidate
        : oldest;
    },
    null
  );
  if (runs.length >= maximumRunHistory &&
      (oldestListedRunTime === null ||
       oldestListedRunTime >
         parseTimestamp(introduction.committed_at))) {
    throw new GitHubReleaseBootstrapRecoveryOperatorError(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_RUN_HISTORY_INCOMPLETE",
      "The bounded workflow history cannot prove the complete initial failure set."
    );
  }
  const candidates = runs.filter(run =>
    Number.isSafeInteger(run && run.id) &&
    Number.isSafeInteger(run.run_number) &&
    run.run_number >= 1 &&
    run.path === workflowPath &&
    run.status === "completed" &&
    run.head_branch === defaultBranch &&
    ["success", "failure"].includes(run.conclusion) &&
    Number.isSafeInteger(run.run_attempt) &&
    run.run_attempt >= 1 &&
    parseTimestamp(run.created_at) !== null &&
    /^[a-f0-9]{40}$/.test(run.head_sha || "") &&
    isAncestor(repositoryRoot, run.head_sha) &&
    policyMatchesCommit(
      repositoryRoot,
      run.head_sha,
      policyInput.relative,
      policyBytes
    )
  ).sort((left, right) =>
    left.run_number - right.run_number ||
    left.id - right.id);
  if (candidates.length < 1 || candidates.length > 99) {
    throw new GitHubReleaseBootstrapRecoveryOperatorError(
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_RUN_SET_INVALID",
      "Recovery requires one complete bounded initial failure set."
    );
  }
  const blockedRuns = candidates.map(run => {
    const artifactName = `${artifactNamePrefix}${run.id}-${
      run.run_attempt
    }`;
    const artifact =
      store.loadInitialBootstrapFailureArtifact(
        repository,
        run,
        artifactName
      );
    validateRetainedInitialBootstrapFailureArtifact(
      artifact,
      {
        repository,
        defaultBranch,
        workflowPath,
        policyPath: policyInput.relative,
        policyBytes,
        expectedRun: run,
        expectedArtifactName: artifactName
      }
    );
    return blockedRunRecord(run, artifact);
  });
  const recovery = createGitHubReleaseBootstrapRecovery({
    repository: {
      full_name: repository,
      default_branch: defaultBranch
    },
    policy: {
      id: policy.id,
      relative_path: policyInput.relative,
      sha256: policy.policy_sha256,
      head_blob_sha256: sha256(policyBytes),
      introduction_commit_sha: introduction.commit_sha,
      introduction_time: introduction.committed_at
    },
    introduction,
    policyBytes,
    bootstrapCheckpoint: checkpoint,
    bootstrapTrustedRoot: trustedRoot,
    blockedRuns,
    userGrantId: options["user-grant-id"],
    grantedAt: options["granted-at"],
    authorizedAt,
    expiresAt: options["expires-at"]
  });
  const output = resolveRepositoryPath(
    repositoryRoot,
    outputPath,
    false
  );
  writeJsonAtomic(output.absolute, recovery);
  return {
    valid: true,
    recovery_id: recovery.id,
    recovery_sha256: recovery.recovery_sha256,
    repository,
    policy_id: policy.id,
    blocked_run_ids:
      blockedRuns.map(run => run.run_id),
    blocked_run_count: blockedRuns.length,
    output: output.relative,
    checkpoint_reset_authorized: false,
    release_authorized: false
  };
}

function usage() {
  return "Usage: node github-release-bootstrap-recovery-operator.js " +
    "authorize --repository-root <path> --user-grant-id <USER grant> " +
    "--granted-at <timestamp> --authorized-at <timestamp> " +
    "--expires-at <timestamp> [--repository <owner/repo>] " +
    "[--default-branch <branch>] [--policy <relative.json>] " +
    `[--output ${DEFAULT_BOOTSTRAP_RECOVERY_PATH}]`;
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseOptions(argv);
    if (options.command !== "authorize") {
      throw new GitHubReleaseBootstrapRecoveryOperatorError(
        "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_COMMAND_INVALID",
        usage()
      );
    }
    const result = authorize(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(JSON.stringify({
      valid: false,
      code: error.code ||
        "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_OPERATION_FAILED",
      message: error.message,
      ...(error.details && Object.keys(error.details).length > 0
        ? { details: error.details }
        : {}),
      checkpoint_reset_authorized: false,
      release_authorized: false
    }, null, 2));
    if (!error.code) console.error(usage());
    process.exitCode = 1;
  }
}

module.exports = {
  GitHubReleaseBootstrapRecoveryOperatorError,
  authorize,
  blockedRunRecord,
  main,
  parseOptions
};

if (require.main === module) main();
