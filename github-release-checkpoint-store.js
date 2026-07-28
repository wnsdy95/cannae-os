#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  commandResult,
  parseJsonOutput
} = require("./github-release-publisher");
const {
  validateGitHubReleaseBootstrapRecovery
} = require("./github-release-bootstrap-recovery");

const DEFAULT_ARTIFACT_NAME_PREFIX = "release-integrity-";
const DEFAULT_BOOTSTRAP_RECOVERY_PATH =
  ".github/tuf/github-release-bootstrap-recovery.json";
const DEFAULT_BOOTSTRAP_WINDOW_SECONDS = 4 * 60 * 60;
const DEFAULT_MAXIMUM_RUN_HISTORY = 100;
const DEFAULT_WORKFLOW_PATH =
  ".github/workflows/release-integrity.yml";
const CHECKPOINT_FILE_NAME = "github-release-trust-checkpoint.json";
const FULL_OBSERVATION_FILE_NAME = "full-observation.json";
const TRUSTED_ROOT_FILE_NAME = "github-trusted-root.json";
const MAXIMUM_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAXIMUM_ARCHIVE_ENTRIES = 100;

class GitHubReleaseCheckpointStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GitHubReleaseCheckpointStoreError";
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

function isSafeRelativePath(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value !== "." &&
    path.posix.normalize(value) === value &&
    !path.posix.isAbsolute(value) &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    !value.startsWith("-") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !value.split("/").includes("..");
}

function binaryCommandResult(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: null,
    maxBuffer: options.maxBuffer || MAXIMUM_ARCHIVE_BYTES
  });
  if (result.error) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_COMMAND_START_FAILED",
      `Could not start ${executable}: ${result.error.message}`
    );
  }
  return result;
}

function requireJsonCommand(executable, args, options = {}) {
  const result = commandResult(executable, args, options);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new GitHubReleaseCheckpointStoreError(
      options.code || "GITHUB_RELEASE_CHECKPOINT_COMMAND_FAILED",
      `${executable} ${args.join(" ")} failed.${
        detail ? ` ${detail}` : ""
      }`,
      { status: result.status }
    );
  }
  try {
    return parseJsonOutput(
      result.stdout,
      options.jsonCode ||
        "GITHUB_RELEASE_CHECKPOINT_JSON_INVALID"
    );
  } catch (error) {
    throw new GitHubReleaseCheckpointStoreError(
      error.code || "GITHUB_RELEASE_CHECKPOINT_JSON_INVALID",
      error.message
    );
  }
}

function assertRepositoryPath(repositoryRoot, relativePath, mustExist) {
  if (!isSafeRelativePath(relativePath)) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_PATH_INVALID",
      "Checkpoint store paths must remain normalized and repository-relative."
    );
  }
  const root = fs.realpathSync(repositoryRoot);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_PATH_ESCAPE",
      "Checkpoint store path escapes the repository."
    );
  }
  if (mustExist &&
      (!fs.existsSync(absolute) ||
       !fs.statSync(absolute).isFile())) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_FILE_MISSING",
      `Required checkpoint file is missing: ${relativePath}`
    );
  }
  if (mustExist) {
    const resolved = fs.realpathSync(absolute);
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_CHECKPOINT_PATH_ESCAPE",
        "Checkpoint store path resolves outside the repository."
      );
    }
    return { absolute: resolved, relative: relativePath };
  }
  return { absolute, relative: relativePath };
}

function assertCommittedFile(
  repositoryRoot,
  relativePath,
  expectedBytes
) {
  const result = commandResult(
    "git",
    ["show", `HEAD:${relativePath}`],
    { cwd: repositoryRoot }
  );
  if (result.status !== 0 ||
      !Buffer.from(result.stdout, "utf8").equals(expectedBytes)) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_BOOTSTRAP_UNCOMMITTED",
      `Bootstrap file must exactly equal its current HEAD blob: ${relativePath}`
    );
  }
}

function readCommittedJson(repositoryRoot, relativePath) {
  const resolved = assertRepositoryPath(
    repositoryRoot,
    relativePath,
    true
  );
  const bytes = fs.readFileSync(resolved.absolute);
  assertCommittedFile(repositoryRoot, relativePath, bytes);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_BOOTSTRAP_JSON_INVALID",
      `Bootstrap file is not valid JSON: ${relativePath}`
    );
  }
}

function policyMatchesCommit(
  repositoryRoot,
  commitSha,
  policyPath,
  policyBytes
) {
  const result = commandResult(
    "git",
    ["show", `${commitSha}:${policyPath}`],
    { cwd: repositoryRoot }
  );
  return result.status === 0 &&
    Buffer.from(result.stdout, "utf8").equals(policyBytes);
}

function isAncestor(repositoryRoot, ancestor, descendant = "HEAD") {
  return commandResult(
    "git",
    ["merge-base", "--is-ancestor", ancestor, descendant],
    { cwd: repositoryRoot }
  ).status === 0;
}

function latestPolicyChange(repositoryRoot, policyPath) {
  const result = commandResult(
    "git",
    [
      "log",
      "--reverse",
      "--format=%H%x00%cI",
      "-S",
      "\"trust_checkpoint_policy\"",
      "--",
      policyPath
    ],
    { cwd: repositoryRoot }
  );
  const firstRecord = result.stdout.split(/\r?\n/)
    .find(line => line.includes("\0"));
  if (result.status !== 0 || !firstRecord) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_POLICY_HISTORY_MISSING",
      "Could not resolve the checkpoint-policy introduction commit."
    );
  }
  const [commitSha, committedAt] = firstRecord.split("\0");
  if (!/^[a-f0-9]{40}$/.test(commitSha) ||
      parseTimestamp(committedAt) === null) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_POLICY_HISTORY_INVALID",
      "Checkpoint policy history returned an invalid commit or time."
    );
  }
  return { commit_sha: commitSha, committed_at: committedAt };
}

function assertSafeArchiveEntries(output) {
  const entries = String(output || "")
    .split(/\r?\n/)
    .filter(Boolean);
  if (entries.length < 1 ||
      entries.length > MAXIMUM_ARCHIVE_ENTRIES) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_ENTRY_COUNT_INVALID",
      "Checkpoint artifact archive entry count is outside the supported bound."
    );
  }
  for (const entry of entries) {
    if (!isSafeRelativePath(entry.replace(/\/$/, ""))) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_PATH_INVALID",
        "Checkpoint artifact contains an unsafe archive path."
      );
    }
  }
  return entries;
}

function findUniqueEntry(entries, baseName) {
  const matches = entries.filter(entry =>
    !entry.endsWith("/") &&
    path.posix.basename(entry) === baseName);
  if (matches.length !== 1) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
      `Checkpoint artifact must contain exactly one ${baseName}.`
    );
  }
  return matches[0];
}

function readBoundedArchiveJson(
  archivePath,
  entry,
  maximumBytes,
  label
) {
  const result = binaryCommandResult(
    "unzip",
    ["-p", archivePath, entry],
    {
      cwd: path.dirname(archivePath),
      maxBuffer: maximumBytes
    }
  );
  if (result.status !== 0 ||
      !Buffer.isBuffer(result.stdout) ||
      result.stdout.length < 2 ||
      result.stdout.length > maximumBytes) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_FILE_SIZE_INVALID",
      `${label} could not be read within its supported size bound.`
    );
  }
  try {
    return JSON.parse(result.stdout.toString("utf8"));
  } catch (error) {
    throw new GitHubReleaseCheckpointStoreError(
      "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_JSON_INVALID",
      `${label} is not valid JSON.`
    );
  }
}

class SystemGitHubReleaseCheckpointStore {
  constructor(repositoryRoot) {
    this.repositoryRoot = fs.realpathSync(repositoryRoot);
  }

  listCompletedRuns(
    repository,
    defaultBranch,
    workflowPath,
    maximumRunHistory
  ) {
    const workflowName = path.basename(workflowPath);
    const response = requireJsonCommand(
      "gh",
      [
        "api",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "X-GitHub-Api-Version: 2026-03-10",
        `repos/${repository}/actions/workflows/${workflowName}/runs?branch=${encodeURIComponent(defaultBranch)}&status=completed&per_page=${maximumRunHistory}`
      ],
      {
        cwd: this.repositoryRoot,
        code: "GITHUB_RELEASE_CHECKPOINT_RUN_LIST_FAILED"
      }
    );
    if (!response || !Array.isArray(response.workflow_runs)) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_CHECKPOINT_RUN_LIST_INVALID",
        "GitHub workflow run listing did not return workflow_runs."
      );
    }
    return response.workflow_runs;
  }

  inspectRunAttempt(repository, runId, runAttempt = null) {
    const suffix = runAttempt === null
      ? `repos/${repository}/actions/runs/${runId}`
      : `repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}`;
    return requireJsonCommand(
      "gh",
      [
        "api",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "X-GitHub-Api-Version: 2026-03-10",
        suffix
      ],
      {
        cwd: this.repositoryRoot,
        code: "GITHUB_RELEASE_CHECKPOINT_RUN_INSPECTION_FAILED"
      }
    );
  }

  inspectArtifact(repository, run, artifactName) {
    const response = requireJsonCommand(
      "gh",
      [
        "api",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "X-GitHub-Api-Version: 2026-03-10",
        `repos/${repository}/actions/runs/${run.id}/artifacts?name=${encodeURIComponent(artifactName)}&per_page=100`
      ],
      {
        cwd: this.repositoryRoot,
        code: "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_LIST_FAILED"
      }
    );
    const artifacts = response && response.artifacts;
    if (!Array.isArray(artifacts) || artifacts.length !== 1) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_MISSING",
        "The latest checkpoint-producing workflow run must retain exactly one expected full-monitor artifact."
      );
    }
    const artifact = artifacts[0];
    if (artifact.name !== artifactName ||
        artifact.expired !== false ||
        !Number.isSafeInteger(artifact.id) ||
        !/^sha256:[a-f0-9]{64}$/.test(artifact.digest || "") ||
        !artifact.workflow_run ||
        Number(artifact.workflow_run.id) !== Number(run.id) ||
        artifact.workflow_run.head_sha !== run.head_sha ||
        parseTimestamp(artifact.created_at) === null ||
        parseTimestamp(artifact.expires_at) === null) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_METADATA_INVALID",
        "Checkpoint artifact metadata is expired, ambiguous, or not bound to the expected workflow run."
      );
    }
    return artifact;
  }

  downloadArtifact(repository, artifact) {
    const result = binaryCommandResult(
      "gh",
      [
        "api",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "X-GitHub-Api-Version: 2026-03-10",
        `repos/${repository}/actions/artifacts/${artifact.id}/zip`
      ],
      {
        cwd: this.repositoryRoot,
        maxBuffer: MAXIMUM_ARCHIVE_BYTES
      }
    );
    if (result.status !== 0 ||
        !Buffer.isBuffer(result.stdout) ||
        result.stdout.length < 1 ||
        result.stdout.length > MAXIMUM_ARCHIVE_BYTES) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_DOWNLOAD_FAILED",
        "Could not download the prior checkpoint artifact within the supported size bound.",
        { status: result.status }
      );
    }
    if (`sha256:${sha256(result.stdout)}` !== artifact.digest) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_DIGEST_MISMATCH",
        "Downloaded checkpoint archive does not match the GitHub artifact digest."
      );
    }
    return result.stdout;
  }

  loadArtifact(repository, run, artifactName) {
    const artifact = this.inspectArtifact(
      repository,
      run,
      artifactName
    );
    const archive = this.downloadArtifact(repository, artifact);
    const temp = fs.mkdtempSync(
      path.join(os.tmpdir(), "cannae-release-checkpoint-")
    );
    try {
      const archivePath = path.join(temp, "checkpoint.zip");
      fs.writeFileSync(archivePath, archive);
      const listing = commandResult(
        "unzip",
        ["-Z1", archivePath],
        { cwd: temp }
      );
      if (listing.status !== 0) {
        throw new GitHubReleaseCheckpointStoreError(
          "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_INVALID",
          "Prior checkpoint artifact is not a valid ZIP archive."
        );
      }
      const entries = assertSafeArchiveEntries(listing.stdout);
      const checkpointEntry = findUniqueEntry(
        entries,
        CHECKPOINT_FILE_NAME
      );
      const trustedRootEntry = findUniqueEntry(
        entries,
        TRUSTED_ROOT_FILE_NAME
      );
      const fullObservationEntry = findUniqueEntry(
        entries,
        FULL_OBSERVATION_FILE_NAME
      );
      return {
        checkpoint: readBoundedArchiveJson(
          archivePath,
          checkpointEntry,
          512 * 1024,
          "Trust checkpoint"
        ),
        trusted_root: readBoundedArchiveJson(
          archivePath,
          trustedRootEntry,
          2 * 1024 * 1024,
          "Trusted-root artifact"
        ),
        full_observation: readBoundedArchiveJson(
          archivePath,
          fullObservationEntry,
          16 * 1024 * 1024,
          "Full integrity observation"
        ),
        provenance: {
          source: "github_actions_artifact",
          run_id: String(run.id),
          run_attempt: run.run_attempt,
          head_sha: run.head_sha,
          conclusion: run.conclusion,
          artifact_id: String(artifact.id),
          artifact_name: artifact.name,
          artifact_digest: artifact.digest,
          artifact_created_at: artifact.created_at,
          artifact_expires_at: artifact.expires_at
        }
      };
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }

  loadInitialBootstrapFailureArtifact(
    repository,
    run,
    artifactName
  ) {
    const artifact = this.inspectArtifact(
      repository,
      run,
      artifactName
    );
    const archive = this.downloadArtifact(repository, artifact);
    const temp = fs.mkdtempSync(
      path.join(os.tmpdir(), "cannae-bootstrap-recovery-")
    );
    try {
      const archivePath = path.join(temp, "blocked.zip");
      fs.writeFileSync(archivePath, archive);
      const listing = commandResult(
        "unzip",
        ["-Z1", archivePath],
        { cwd: temp }
      );
      if (listing.status !== 0) {
        throw new GitHubReleaseCheckpointStoreError(
          "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_ARCHIVE_INVALID",
          "Initial recovery artifact is not a valid ZIP archive."
        );
      }
      const entries = assertSafeArchiveEntries(listing.stdout);
      const files = entries.filter(entry => !entry.endsWith("/"));
      const checkpointMatches = files.filter(entry =>
        path.posix.basename(entry) === CHECKPOINT_FILE_NAME);
      if (files.length !== 2 || checkpointMatches.length !== 0) {
        throw new GitHubReleaseCheckpointStoreError(
          "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_ARCHIVE_CONTENT_INVALID",
          "Initial recovery requires exactly one full observation and trusted root with no checkpoint or additional file."
        );
      }
      const trustedRootEntry = findUniqueEntry(
        entries,
        TRUSTED_ROOT_FILE_NAME
      );
      const fullObservationEntry = findUniqueEntry(
        entries,
        FULL_OBSERVATION_FILE_NAME
      );
      return {
        trusted_root: readBoundedArchiveJson(
          archivePath,
          trustedRootEntry,
          2 * 1024 * 1024,
          "Recovery trusted-root artifact"
        ),
        full_observation: readBoundedArchiveJson(
          archivePath,
          fullObservationEntry,
          16 * 1024 * 1024,
          "Recovery full integrity observation"
        ),
        provenance: {
          source: "github_actions_artifact",
          run_id: String(run.id),
          run_attempt: run.run_attempt,
          head_sha: run.head_sha,
          conclusion: run.conclusion,
          artifact_id: String(artifact.id),
          artifact_name: artifact.name,
          artifact_digest: artifact.digest,
          artifact_created_at: artifact.created_at,
          artifact_expires_at: artifact.expires_at
        }
      };
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }

  resolveInitialBootstrapRecovery(options = {}) {
    const {
      repository,
      defaultBranch,
      policyPath,
      policyBytes,
      bootstrapCheckpointPath,
      bootstrapTrustedRootPath,
      bootstrapRecoveryPath =
        DEFAULT_BOOTSTRAP_RECOVERY_PATH,
      workflowPath,
      artifactNamePrefix,
      maximumRunHistory,
      bootstrapWindowSeconds,
      now,
      currentRunId,
      currentRunAttempt,
      candidates,
      introduction,
      runHistoryComplete,
      initialBootstrapFailureValidator
    } = options;
    if (runHistoryComplete !== true ||
        Number(currentRunAttempt) !== 1 ||
        !/^[1-9][0-9]*$/.test(String(currentRunId || "")) ||
        candidates.length < 1 ||
        candidates.length >= maximumRunHistory ||
        typeof initialBootstrapFailureValidator !== "function" ||
        parseTimestamp(now) - parseTimestamp(
          introduction.committed_at
        ) > bootstrapWindowSeconds * 1000) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_NOT_ELIGIBLE",
        "Initial bootstrap recovery is unavailable outside one exact first-attempt, bounded, original-window failure set."
      );
    }
    const currentRun = this.inspectRunAttempt(
      repository,
      Number(currentRunId),
      Number(currentRunAttempt)
    );
    const currentHeadResult = commandResult(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: this.repositoryRoot }
    );
    const currentHeadSha = currentHeadResult.status === 0
      ? currentHeadResult.stdout.trim()
      : "";
    const newestCandidateRunNumber = Math.max(
      ...candidates.map(run => run.run_number)
    );
    if (!currentRun ||
        Number(currentRun.id) !== Number(currentRunId) ||
        currentRun.run_attempt !== 1 ||
        currentRun.run_number <= newestCandidateRunNumber ||
        currentRun.path !== workflowPath ||
        currentRun.status !== "in_progress" ||
        currentRun.head_branch !== defaultBranch ||
        !["push", "schedule", "workflow_dispatch"].includes(
          currentRun.event
        ) ||
        parseTimestamp(currentRun.created_at) === null ||
        !/^[a-f0-9]{40}$/.test(currentRun.head_sha || "") ||
        currentRun.head_sha !== currentHeadSha ||
        !policyMatchesCommit(
          this.repositoryRoot,
          currentRun.head_sha,
          policyPath,
          policyBytes
        )) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_CURRENT_RUN_INVALID",
        "Initial bootstrap recovery requires the exact newest in-progress first attempt at the current policy-bound HEAD."
      );
    }
    const recovery = readCommittedJson(
      this.repositoryRoot,
      bootstrapRecoveryPath
    );
    const checkpoint = readCommittedJson(
      this.repositoryRoot,
      bootstrapCheckpointPath
    );
    const trustedRoot = readCommittedJson(
      this.repositoryRoot,
      bootstrapTrustedRootPath
    );
    const orderedRuns = [...candidates].sort((left, right) =>
      left.run_number - right.run_number ||
      left.id - right.id);
    const blockedRuns = orderedRuns.map(run => {
      const artifactName = `${artifactNamePrefix}${run.id}-${
        run.run_attempt
      }`;
      const loaded = this.loadInitialBootstrapFailureArtifact(
        repository,
        run,
        artifactName
      );
      initialBootstrapFailureValidator(loaded, {
        repository,
        defaultBranch,
        workflowPath,
        policyPath,
        policyBytes,
        expectedRun: run,
        expectedArtifactName: artifactName
      });
      const observation = loaded.full_observation;
      return {
        run_id: String(run.id),
        run_number: run.run_number,
        run_attempt: run.run_attempt,
        run_created_at: run.created_at,
        head_sha: run.head_sha,
        conclusion: run.conclusion,
        artifact_id: loaded.provenance.artifact_id,
        artifact_name: loaded.provenance.artifact_name,
        artifact_digest: loaded.provenance.artifact_digest,
        artifact_created_at:
          loaded.provenance.artifact_created_at,
        artifact_expires_at:
          loaded.provenance.artifact_expires_at,
        observation_id: observation.id,
        observation_sha256: observation.observation_sha256,
        observed_at: observation.observed_at,
        checkpoint_failure_code:
          observation.trust_checkpoint_observation.failure_code
      };
    });
    const {
      validateSchemaPayload
    } = require("./validator-cli-prototype/validate");
    const schemaResult = validateSchemaPayload(
      recovery,
      "github-release-bootstrap-recovery"
    );
    const recoveryIssues =
      validateGitHubReleaseBootstrapRecovery(recovery, {
        evaluatedAt: now,
        repository,
        defaultBranch,
        policyBytes,
        introduction,
        bootstrapCheckpoint: checkpoint,
        bootstrapTrustedRoot: trustedRoot,
        blockedRuns
      });
    if (!schemaResult.valid || recoveryIssues.length > 0) {
      const first = schemaResult.issues[0] ||
        recoveryIssues[0] || {};
      throw new GitHubReleaseCheckpointStoreError(
        first.code ||
          "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_INVALID",
        first.message ||
          "Initial bootstrap recovery authorization is invalid."
      );
    }
    return {
      checkpoint,
      trusted_root: trustedRoot,
      provenance: {
        source: "repository_bootstrap_recovery",
        policy_introduction_commit: introduction.commit_sha,
        policy_introduction_time: introduction.committed_at,
        bootstrap_checkpoint_path: bootstrapCheckpointPath,
        bootstrap_checkpoint_sha256:
          checkpoint.checkpoint_sha256,
        bootstrap_trusted_root_path: bootstrapTrustedRootPath,
        bootstrap_trusted_root_sha256:
          trustedRoot.artifact_sha256,
        recovery_authorization_path: bootstrapRecoveryPath,
        recovery_authorization_sha256:
          recovery.recovery_sha256,
        recovery_grant_id: recovery.user_grant.grant_id,
        blocked_run_count: blockedRuns.length
      }
    };
  }

  resolve(options = {}) {
    const {
      repository,
      defaultBranch,
      policyPath,
      policyBytes,
      bootstrapCheckpointPath,
      bootstrapTrustedRootPath,
      bootstrapRecoveryPath =
        DEFAULT_BOOTSTRAP_RECOVERY_PATH,
      workflowPath = DEFAULT_WORKFLOW_PATH,
      artifactNamePrefix = DEFAULT_ARTIFACT_NAME_PREFIX,
      maximumRunHistory = DEFAULT_MAXIMUM_RUN_HISTORY,
      bootstrapWindowSeconds =
        DEFAULT_BOOTSTRAP_WINDOW_SECONDS,
      now,
      currentRunId,
      currentRunAttempt,
      initialBootstrapFailureValidator
    } = options;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
      repository || ""
    ) ||
        typeof defaultBranch !== "string" ||
        defaultBranch.length === 0 ||
        !isSafeRelativePath(policyPath) ||
        !Buffer.isBuffer(policyBytes) ||
        !isSafeRelativePath(workflowPath) ||
        !Number.isSafeInteger(maximumRunHistory) ||
        maximumRunHistory < 1 ||
        maximumRunHistory > 100 ||
        !Number.isSafeInteger(bootstrapWindowSeconds) ||
        bootstrapWindowSeconds < 60 ||
        parseTimestamp(now) === null ||
        (Number(currentRunAttempt) > 1 &&
         !/^[1-9][0-9]*$/.test(String(currentRunId || ""))) ||
        (currentRunId !== undefined &&
         (!/^[1-9][0-9]*$/.test(String(currentRunId)) ||
          !Number.isSafeInteger(Number(currentRunAttempt)) ||
          Number(currentRunAttempt) < 1))) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_CHECKPOINT_STORE_OPTIONS_INVALID",
        "Checkpoint store options are incomplete or outside supported bounds."
      );
    }

    const runs = this.listCompletedRuns(
      repository,
      defaultBranch,
      workflowPath,
      maximumRunHistory
    );
    const introduction = latestPolicyChange(
      this.repositoryRoot,
      policyPath
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
    const runHistoryComplete =
      runs.length < maximumRunHistory ||
      (oldestListedRunTime !== null &&
       oldestListedRunTime <=
         parseTimestamp(introduction.committed_at));
    const workflowRef =
      `${repository}/${workflowPath}@refs/heads/${defaultBranch}`;
    const isEligibleCompletedRun = run =>
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
      isAncestor(this.repositoryRoot, run.head_sha) &&
      policyMatchesCommit(
        this.repositoryRoot,
        run.head_sha,
        policyPath,
        policyBytes
      );
    const candidates = runs
      .filter(run =>
        isEligibleCompletedRun(run) &&
        String(run.id) !== String(currentRunId || ""))
      .sort((left, right) =>
        right.run_number - left.run_number ||
        right.id - left.id);

    let selected = null;
    if (Number(currentRunAttempt) > 1 &&
        /^[1-9][0-9]*$/.test(String(currentRunId || ""))) {
      const current = this.inspectRunAttempt(
        repository,
        Number(currentRunId),
        Number(currentRunAttempt)
      );
      if (!current ||
          Number(current.id) !== Number(currentRunId) ||
          current.run_attempt !== Number(currentRunAttempt) ||
          !Number.isSafeInteger(current.run_number) ||
          current.run_number < 1 ||
          current.path !== workflowPath ||
          current.status !== "in_progress" ||
          current.head_branch !== defaultBranch ||
          parseTimestamp(current.created_at) === null ||
          !/^[a-f0-9]{40}$/.test(current.head_sha || "") ||
          !isAncestor(this.repositoryRoot, current.head_sha) ||
          !policyMatchesCommit(
            this.repositoryRoot,
            current.head_sha,
            policyPath,
            policyBytes
          )) {
        throw new GitHubReleaseCheckpointStoreError(
          "GITHUB_RELEASE_CHECKPOINT_CURRENT_RERUN_INVALID",
          "The current rerun is not bound to the exact eligible workflow, commit, and policy."
        );
      }
      if (candidates.some(run =>
        run.run_number > current.run_number ||
        (run.run_number === current.run_number &&
         Number(run.id) !== Number(current.id)))) {
        throw new GitHubReleaseCheckpointStoreError(
          "GITHUB_RELEASE_CHECKPOINT_RERUN_FORK_BLOCKED",
          "A historical workflow rerun cannot branch from an older checkpoint after a newer eligible run exists."
        );
      }
      const previousAttempt = this.inspectRunAttempt(
        repository,
        Number(currentRunId),
        Number(currentRunAttempt) - 1
      );
      if (!isEligibleCompletedRun(previousAttempt) ||
          Number(previousAttempt.id) !== Number(current.id) ||
          previousAttempt.run_number !== current.run_number ||
          previousAttempt.run_attempt !==
            Number(currentRunAttempt) - 1 ||
          previousAttempt.head_sha !== current.head_sha) {
        throw new GitHubReleaseCheckpointStoreError(
          "GITHUB_RELEASE_CHECKPOINT_PREVIOUS_ATTEMPT_INVALID",
          "A rerun requires one exact completed immediately preceding attempt from the same stable run."
        );
      }
      selected = previousAttempt;
    } else if (candidates.length > 0) {
      selected = candidates[0];
    }

    if (selected) {
      const artifactName = `${artifactNamePrefix}${selected.id}-${
        selected.run_attempt
      }`;
      let loaded;
      try {
        loaded = this.loadArtifact(
          repository,
          selected,
          artifactName
        );
      } catch (error) {
        if (error.code !==
            "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID") {
          throw error;
        }
        if (typeof initialBootstrapFailureValidator !==
            "function") {
          throw error;
        }
        return this.resolveInitialBootstrapRecovery({
          repository,
          defaultBranch,
          policyPath,
          policyBytes,
          bootstrapCheckpointPath,
          bootstrapTrustedRootPath,
          bootstrapRecoveryPath,
          workflowPath,
          artifactNamePrefix,
          maximumRunHistory,
          bootstrapWindowSeconds,
          now,
          currentRunId,
          currentRunAttempt,
          candidates,
          introduction,
          runHistoryComplete,
          initialBootstrapFailureValidator
        });
      }
      const producer = loaded.checkpoint &&
        loaded.checkpoint.producer || {};
      if (producer.kind !== "github_actions" ||
          producer.repository_head_sha !== selected.head_sha ||
          producer.workflow_ref !== workflowRef ||
          producer.run_id !== String(selected.id) ||
          producer.run_attempt !== selected.run_attempt) {
        throw new GitHubReleaseCheckpointStoreError(
          "GITHUB_RELEASE_CHECKPOINT_PRODUCER_MISMATCH",
          "Retained checkpoint producer does not match its exact workflow run."
        );
      }
      return loaded;
    }

    if (parseTimestamp(now) - parseTimestamp(
      introduction.committed_at
    ) > bootstrapWindowSeconds * 1000) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_CHECKPOINT_BOOTSTRAP_WINDOW_EXPIRED",
        "No prior checkpoint lineage exists and the one-time repository bootstrap window has expired."
      );
    }
    const checkpoint = readCommittedJson(
      this.repositoryRoot,
      bootstrapCheckpointPath
    );
    const trustedRoot = readCommittedJson(
      this.repositoryRoot,
      bootstrapTrustedRootPath
    );
    return {
      checkpoint,
      trusted_root: trustedRoot,
      provenance: {
        source: "repository_bootstrap",
        policy_introduction_commit: introduction.commit_sha,
        policy_introduction_time: introduction.committed_at,
        bootstrap_checkpoint_path: bootstrapCheckpointPath,
        bootstrap_checkpoint_sha256:
          checkpoint.checkpoint_sha256,
        bootstrap_trusted_root_path: bootstrapTrustedRootPath,
        bootstrap_trusted_root_sha256:
          trustedRoot.artifact_sha256
      }
    };
  }
}

module.exports = {
  CHECKPOINT_FILE_NAME,
  DEFAULT_ARTIFACT_NAME_PREFIX,
  DEFAULT_BOOTSTRAP_RECOVERY_PATH,
  DEFAULT_BOOTSTRAP_WINDOW_SECONDS,
  DEFAULT_MAXIMUM_RUN_HISTORY,
  DEFAULT_WORKFLOW_PATH,
  FULL_OBSERVATION_FILE_NAME,
  GitHubReleaseCheckpointStoreError,
  MAXIMUM_ARCHIVE_BYTES,
  MAXIMUM_ARCHIVE_ENTRIES,
  SystemGitHubReleaseCheckpointStore,
  TRUSTED_ROOT_FILE_NAME,
  assertCommittedFile,
  assertSafeArchiveEntries,
  binaryCommandResult,
  isSafeRelativePath,
  latestPolicyChange,
  policyMatchesCommit,
  readCommittedJson,
  sha256
};
