#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  sha256,
  validateGitHubReleaseTrustedRoot,
  writeJsonAtomic
} = require("./github-release-trusted-root");
const { canonicalJsonBytes } = require("./verifier-identity-evidence");

const CHECKPOINT_SCHEMA_VERSION = "0.1";
const DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS = 12 * 60 * 60;
const TUF_ROLES = Object.freeze([
  "root",
  "timestamp",
  "snapshot",
  "targets"
]);

class GitHubReleaseTrustCheckpointError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GitHubReleaseTrustCheckpointError";
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function semanticIssue(code, pathValue, message) {
  return { code, path: pathValue, message };
}

function checkpointDigest(document) {
  const copy = clone(document);
  delete copy.checkpoint_sha256;
  return sha256(canonicalJsonBytes(copy));
}

function trustedStateFromRoot(trustedRoot, evaluatedAt) {
  const issues = validateGitHubReleaseTrustedRoot(trustedRoot, {
    evaluatedAt
  });
  if (issues.length > 0) {
    throw new GitHubReleaseTrustCheckpointError(
      issues[0].code,
      issues[0].message,
      { issues }
    );
  }
  return {
    artifact_id: trustedRoot.id,
    artifact_sha256: trustedRoot.artifact_sha256,
    trusted_root_sha256: trustedRoot.trusted_root_sha256,
    target_file_sha256: trustedRoot.source.target_file_sha256,
    source_fetched_at: trustedRoot.source.fetched_at,
    checkpoint_evaluated_at: new Date(
      parseTimestamp(evaluatedAt)
    ).toISOString(),
    metadata: Object.fromEntries(TUF_ROLES.map(role => [
      role,
      clone(trustedRoot.source.metadata[role])
    ]))
  };
}

function sameTrustedState(left, right) {
  return canonicalJsonBytes(left).equals(canonicalJsonBytes(right));
}

function assertRepository(repository) {
  if (!repository ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
        repository.full_name || ""
      ) ||
      typeof repository.default_branch !== "string" ||
      repository.default_branch.length === 0) {
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_REPOSITORY_INVALID",
      "Trust checkpoint requires one exact repository and default branch."
    );
  }
}

function normalizeProducer(producer) {
  const normalized = {
    kind: producer && producer.kind || "local_operator",
    repository_head_sha:
      producer && producer.repository_head_sha || "",
    workflow_ref: producer && producer.workflow_ref || "none",
    run_id: String(producer && producer.run_id || "local"),
    run_attempt: Number(producer && producer.run_attempt || 0)
  };
  if (!["repository_bootstrap", "github_actions", "local_operator"]
    .includes(normalized.kind) ||
      !/^[a-f0-9]{40}$/.test(normalized.repository_head_sha) ||
      !Number.isSafeInteger(normalized.run_attempt) ||
      normalized.run_attempt < 0) {
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_PRODUCER_INVALID",
      "Checkpoint producer must bind a supported producer, exact repository commit, and bounded run attempt."
    );
  }
  if (normalized.kind === "github_actions") {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github\/workflows\/[^@\s]+@refs\/heads\/[^@\s]+$/
      .test(normalized.workflow_ref) ||
        !/^[1-9][0-9]*$/.test(normalized.run_id) ||
        normalized.run_attempt < 1) {
      throw new GitHubReleaseTrustCheckpointError(
        "GITHUB_RELEASE_TRUST_CHECKPOINT_PRODUCER_INVALID",
        "GitHub Actions checkpoints require an exact workflow ref, numeric run ID, and positive attempt."
      );
    }
  } else if (normalized.workflow_ref !== "none") {
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_PRODUCER_INVALID",
      "Non-GitHub producers must use the exact none workflow sentinel."
    );
  }
  return normalized;
}

function assertRootChainContinuity(previousState, currentRoot) {
  const previousVersion = previousState.metadata.root.version;
  const encoded = currentRoot &&
    currentRoot.source &&
    currentRoot.source.tuf_evidence &&
    currentRoot.source.tuf_evidence.root_chain_base64 &&
    currentRoot.source.tuf_evidence.root_chain_base64[
      previousVersion - 1
    ];
  if (typeof encoded !== "string" ||
      sha256(Buffer.from(encoded, "base64")) !==
        previousState.metadata.root.sha256) {
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TUF_CHECKPOINT_ROOT_CONTINUITY_FAILED",
      "The current retained root chain does not contain the exact previously trusted root version."
    );
  }
}

function compareTrustedStates(previousState, currentState, currentRoot) {
  const versionDeltas = {};
  for (const role of TUF_ROLES) {
    const previous = previousState.metadata[role];
    const current = currentState.metadata[role];
    if (current.version < previous.version) {
      throw new GitHubReleaseTrustCheckpointError(
        "GITHUB_RELEASE_TUF_CHECKPOINT_ROLLBACK_DETECTED",
        `TUF ${role} version moved backward from ${previous.version} to ${current.version}.`
      );
    }
    if (current.version === previous.version &&
        current.sha256 !== previous.sha256) {
      throw new GitHubReleaseTrustCheckpointError(
        "GITHUB_RELEASE_TUF_CHECKPOINT_EQUIVOCATION_DETECTED",
        `TUF ${role} changed bytes without advancing its version.`
      );
    }
    versionDeltas[role] = current.version - previous.version;
  }

  assertRootChainContinuity(previousState, currentRoot);
  if (currentState.metadata.targets.version ===
      previousState.metadata.targets.version &&
      (currentState.target_file_sha256 !==
        previousState.target_file_sha256 ||
       currentState.trusted_root_sha256 !==
        previousState.trusted_root_sha256)) {
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TUF_CHECKPOINT_TARGET_EQUIVOCATION_DETECTED",
      "GitHub trusted-root target bytes changed without a targets metadata version advance."
    );
  }
  const previousFetchedAt = parseTimestamp(
    previousState.source_fetched_at
  );
  const currentFetchedAt = parseTimestamp(
    currentState.source_fetched_at
  );
  if (previousFetchedAt === null || currentFetchedAt === null ||
      currentFetchedAt < previousFetchedAt) {
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TUF_CHECKPOINT_RETRIEVAL_TIME_ROLLBACK",
      "Current TUF retrieval time cannot precede the prior checkpoint retrieval time."
    );
  }

  return {
    classification: Object.values(versionDeltas).some(delta => delta > 0)
      ? "advanced"
      : "unchanged",
    version_deltas: versionDeltas,
    current_trusted_root_verified: true,
    root_chain_continuity_verified: true,
    same_version_digest_consistency_verified: true,
    rollback_detected: false,
    equivocation_detected: false
  };
}

function validateGitHubReleaseTrustCheckpoint(document, options = {}) {
  const issues = [];
  const repository = document && document.repository || {};
  const predecessor = document && document.predecessor || {};
  const state = document && document.trusted_state || {};
  const metadata = state.metadata || {};
  const transition = document && document.transition || {};
  const producer = document && document.producer || {};
  const authority = document && document.authority || {};
  const evaluatedAtMs = parseTimestamp(options.evaluatedAt);
  const recordedAtMs = parseTimestamp(document && document.recorded_at);
  const stateEvaluatedAtMs = parseTimestamp(
    state.checkpoint_evaluated_at
  );
  const fetchedAtMs = parseTimestamp(state.source_fetched_at);

  if (!document ||
      document.schema_version !== CHECKPOINT_SCHEMA_VERSION ||
      document.type !== "GitHubReleaseTrustCheckpoint") {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_STRUCTURE_INVALID",
      "$",
      "Expected a GitHubReleaseTrustCheckpoint v0.1 artifact."
    ));
    return issues;
  }
  if (document.checkpoint_sha256 !== checkpointDigest(document)) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_DIGEST_MISMATCH",
      "$.checkpoint_sha256",
      "Checkpoint digest must bind the complete artifact."
    ));
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
    repository.full_name || ""
  ) || typeof repository.default_branch !== "string" ||
      repository.default_branch.length === 0) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_REPOSITORY_INVALID",
      "$.repository",
      "Checkpoint repository scope is invalid."
    ));
  }
  if (!Number.isSafeInteger(document.sequence) ||
      document.sequence < 0) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_SEQUENCE_INVALID",
      "$.sequence",
      "Checkpoint sequence must be a non-negative safe integer."
    ));
  } else if (document.sequence === 0) {
    const bootstrap = predecessor.bootstrap_authorization || {};
    if (predecessor.kind !== "genesis" ||
        predecessor.checkpoint_id !== undefined ||
        predecessor.checkpoint_sha256 !== undefined ||
        predecessor.sequence !== undefined ||
        bootstrap.authority !== "USER" ||
        typeof bootstrap.grant_id !== "string" ||
        bootstrap.grant_id.length === 0 ||
        parseTimestamp(bootstrap.granted_at) === null) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_TRUST_CHECKPOINT_GENESIS_INVALID",
        "$.predecessor",
        "Sequence zero requires one explicit USER-authorized genesis."
      ));
    }
  } else if (predecessor.kind !== "checkpoint" ||
      typeof predecessor.checkpoint_id !== "string" ||
      !/^[a-f0-9]{64}$/.test(
        predecessor.checkpoint_sha256 || ""
      ) ||
      predecessor.sequence !== document.sequence - 1 ||
      predecessor.bootstrap_authorization !== undefined) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_PREDECESSOR_INVALID",
      "$.predecessor",
      "Every non-genesis checkpoint must bind the exact immediately preceding sequence and digest."
    ));
  }
  for (const role of TUF_ROLES) {
    const projection = metadata[role] || {};
    if (!Number.isSafeInteger(projection.version) ||
        projection.version < 1 ||
        !/^[a-f0-9]{64}$/.test(projection.sha256 || "") ||
        parseTimestamp(projection.expires) === null ||
        projection.type !== role) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_TRUST_CHECKPOINT_METADATA_INVALID",
        `$.trusted_state.metadata.${role}`,
        `Checkpoint TUF ${role} projection is invalid.`
      ));
    }
  }
  if (!/^[a-f0-9]{64}$/.test(state.artifact_sha256 || "") ||
      !/^[a-f0-9]{64}$/.test(state.trusted_root_sha256 || "") ||
      !/^[a-f0-9]{64}$/.test(state.target_file_sha256 || "") ||
      fetchedAtMs === null ||
      stateEvaluatedAtMs === null ||
      recordedAtMs === null ||
      stateEvaluatedAtMs !== recordedAtMs ||
      fetchedAtMs > stateEvaluatedAtMs) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_STATE_INVALID",
      "$.trusted_state",
      "Checkpoint trusted state must bind exact digests and non-backdated retrieval, evaluation, and record times."
    ));
  }
  if (document.sequence === 0) {
    if (transition.classification !== "bootstrap" ||
        Object.values(transition.version_deltas || {})
          .some(delta => delta !== 0)) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_TRUST_CHECKPOINT_TRANSITION_INVALID",
        "$.transition",
        "Genesis checkpoint must use the bootstrap transition."
      ));
    }
  } else if (!["unchanged", "advanced"].includes(
    transition.classification
  )) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_TRANSITION_INVALID",
      "$.transition.classification",
      "Non-genesis checkpoints must record an unchanged or advanced transition."
    ));
  }
  if (TUF_ROLES.some(role =>
    !Number.isSafeInteger(
      transition.version_deltas &&
      transition.version_deltas[role]
    ) ||
    transition.version_deltas[role] < 0
  ) ||
      transition.current_trusted_root_verified !== true ||
      transition.root_chain_continuity_verified !== true ||
      transition.same_version_digest_consistency_verified !== true ||
      transition.rollback_detected !== false ||
      transition.equivocation_detected !== false) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_TRANSITION_INVALID",
      "$.transition",
      "Checkpoint transition must retain verified monotonic and consistency results."
    ));
  }
  try {
    normalizeProducer(producer);
  } catch (error) {
    issues.push(semanticIssue(
      error.code,
      "$.producer",
      error.message
    ));
  }
  if (authority.human_final_decision_authority !== "USER" ||
      authority.monitoring_only !== true ||
      authority.checkpoint_reset_authorized !== false ||
      authority.release_authorized !== false ||
      document.checkpoint_reset_authorized !== false ||
      document.release_authorized !== false) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_AUTHORITY_DRIFT",
      "$.authority",
      "Trust checkpoints may observe continuity but cannot reset trust or authorize a release."
    ));
  }
  if (evaluatedAtMs === null) {
    issues.push(semanticIssue(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_EVALUATION_TIME_REQUIRED",
      "$.recorded_at",
      "Checkpoint validation requires an explicit external evaluation time."
    ));
  } else {
    if (recordedAtMs !== null && evaluatedAtMs < recordedAtMs) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_TRUST_CHECKPOINT_FROM_FUTURE",
        "$.recorded_at",
        "Checkpoint record time cannot be later than its evaluation time."
      ));
    }
    const maximumAgeSeconds = Number(
      options.maximumAgeSeconds === undefined
        ? DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS
        : options.maximumAgeSeconds
    );
    if (!Number.isFinite(maximumAgeSeconds) ||
        maximumAgeSeconds < 1) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_TRUST_CHECKPOINT_MAXIMUM_AGE_INVALID",
        "$.recorded_at",
        "Checkpoint maximum age must be a positive finite number."
      ));
    } else if (recordedAtMs !== null &&
        evaluatedAtMs - recordedAtMs >
          maximumAgeSeconds * 1000) {
      issues.push(semanticIssue(
        "GITHUB_RELEASE_TRUST_CHECKPOINT_STALE",
        "$.recorded_at",
        "Checkpoint exceeds the allowed continuity age."
      ));
    }
    if (options.requiredFreshUntil !== undefined) {
      const requiredFreshUntilMs = parseTimestamp(
        options.requiredFreshUntil
      );
      if (requiredFreshUntilMs === null) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_TRUST_CHECKPOINT_VALIDITY_TIME_INVALID",
          "$.recorded_at",
          "Required checkpoint freshness boundary is invalid."
        ));
      } else if (recordedAtMs !== null &&
          requiredFreshUntilMs - recordedAtMs >
            maximumAgeSeconds * 1000) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_TRUST_CHECKPOINT_VALIDITY_TOO_SHORT",
          "$.recorded_at",
          "Checkpoint will exceed its maximum age before the required operation boundary."
        ));
      }
    }
  }
  if (options.trustedRoot) {
    try {
      const trustIssues = validateGitHubReleaseTrustedRoot(
        options.trustedRoot,
        {
          evaluatedAt: options.evaluatedAt,
          ...(options.requiredFreshUntil
            ? { requiredValidUntil: options.requiredFreshUntil }
            : {})
        }
      );
      if (trustIssues.length > 0) {
        throw new GitHubReleaseTrustCheckpointError(
          trustIssues[0].code,
          trustIssues[0].message,
          { issues: trustIssues }
        );
      }
      const expected = trustedStateFromRoot(
        options.trustedRoot,
        state.checkpoint_evaluated_at
      );
      if (!sameTrustedState(state, expected)) {
        issues.push(semanticIssue(
          "GITHUB_RELEASE_TRUST_CHECKPOINT_ROOT_MISMATCH",
          "$.trusted_state",
          "Checkpoint does not bind the exact supplied trusted-root artifact and evaluation time."
        ));
      }
    } catch (error) {
      issues.push(semanticIssue(
        error.code ||
          "GITHUB_RELEASE_TRUST_CHECKPOINT_ROOT_INVALID",
        "$.trusted_state",
        error.message
      ));
    }
  }
  return issues;
}

function initializeGitHubReleaseTrustCheckpoint(options = {}) {
  assertRepository(options.repository);
  const evaluatedAtMs = parseTimestamp(options.evaluatedAt);
  const grantedAtMs = parseTimestamp(options.grantedAt);
  if (evaluatedAtMs === null || grantedAtMs === null ||
      grantedAtMs > evaluatedAtMs ||
      typeof options.userGrantId !== "string" ||
      options.userGrantId.length === 0) {
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_BOOTSTRAP_AUTHORITY_INVALID",
      "Checkpoint genesis requires an explicit USER grant and valid grant/evaluation times."
    );
  }
  const trustedState = trustedStateFromRoot(
    options.trustedRoot,
    options.evaluatedAt
  );
  const producer = normalizeProducer({
    ...options.producer,
    kind: "repository_bootstrap"
  });
  const checkpoint = {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    type: "GitHubReleaseTrustCheckpoint",
    id: `GRTC-0-${sha256(canonicalJsonBytes({
      repository: options.repository,
      trustedState,
      userGrantId: options.userGrantId
    })).slice(0, 12)}`,
    sequence: 0,
    repository: clone(options.repository),
    predecessor: {
      kind: "genesis",
      bootstrap_authorization: {
        authority: "USER",
        grant_id: options.userGrantId,
        granted_at: new Date(grantedAtMs).toISOString()
      }
    },
    trusted_state: trustedState,
    transition: {
      classification: "bootstrap",
      version_deltas: Object.fromEntries(
        TUF_ROLES.map(role => [role, 0])
      ),
      current_trusted_root_verified: true,
      root_chain_continuity_verified: true,
      same_version_digest_consistency_verified: true,
      rollback_detected: false,
      equivocation_detected: false
    },
    producer,
    authority: {
      human_final_decision_authority: "USER",
      monitoring_only: true,
      checkpoint_reset_authorized: false,
      release_authorized: false
    },
    checkpoint_reset_authorized: false,
    release_authorized: false,
    recorded_at: new Date(evaluatedAtMs).toISOString()
  };
  checkpoint.checkpoint_sha256 = checkpointDigest(checkpoint);
  const issues = validateGitHubReleaseTrustCheckpoint(checkpoint, {
    evaluatedAt: checkpoint.recorded_at,
    trustedRoot: options.trustedRoot
  });
  if (issues.length > 0) {
    throw new GitHubReleaseTrustCheckpointError(
      issues[0].code,
      issues[0].message,
      { issues }
    );
  }
  return checkpoint;
}

function advanceGitHubReleaseTrustCheckpoint(options = {}) {
  assertRepository(options.repository);
  const previousIssues = validateGitHubReleaseTrustCheckpoint(
    options.previousCheckpoint,
    {
      evaluatedAt: options.evaluatedAt,
      maximumAgeSeconds:
        options.maximumPreviousAgeSeconds === undefined
          ? DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS
          : options.maximumPreviousAgeSeconds
    }
  );
  if (previousIssues.length > 0) {
    throw new GitHubReleaseTrustCheckpointError(
      previousIssues[0].code,
      previousIssues[0].message,
      { issues: previousIssues }
    );
  }
  const previous = options.previousCheckpoint;
  if (!options.previousTrustedRoot) {
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_PREVIOUS_ROOT_REQUIRED",
      "Checkpoint advancement requires the exact trusted-root artifact bound by the predecessor."
    );
  }
  const previousRootIssues = validateGitHubReleaseTrustedRoot(
    options.previousTrustedRoot,
    {
      evaluatedAt: previous.recorded_at
    }
  );
  if (previousRootIssues.length > 0) {
    throw new GitHubReleaseTrustCheckpointError(
      previousRootIssues[0].code,
      previousRootIssues[0].message,
      { issues: previousRootIssues }
    );
  }
  const previousExpectedState = trustedStateFromRoot(
    options.previousTrustedRoot,
    previous.trusted_state.checkpoint_evaluated_at
  );
  if (!sameTrustedState(
    previous.trusted_state,
    previousExpectedState
  )) {
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_PREVIOUS_ROOT_MISMATCH",
      "Prior checkpoint does not bind the exact retained predecessor trusted-root artifact."
    );
  }
  if (previous.repository.full_name !== options.repository.full_name ||
      previous.repository.default_branch !==
        options.repository.default_branch) {
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_REPOSITORY_MISMATCH",
      "Prior checkpoint does not belong to the current repository scope."
    );
  }
  const currentState = trustedStateFromRoot(
    options.trustedRoot,
    options.evaluatedAt
  );
  const transition = compareTrustedStates(
    previous.trusted_state,
    currentState,
    options.trustedRoot
  );
  const producer = normalizeProducer(options.producer);
  const sequence = previous.sequence + 1;
  const checkpoint = {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    type: "GitHubReleaseTrustCheckpoint",
    id: `GRTC-${sequence}-${sha256(canonicalJsonBytes({
      previous: previous.checkpoint_sha256,
      currentState,
      producer
    })).slice(0, 12)}`,
    sequence,
    repository: clone(options.repository),
    predecessor: {
      kind: "checkpoint",
      checkpoint_id: previous.id,
      checkpoint_sha256: previous.checkpoint_sha256,
      sequence: previous.sequence
    },
    trusted_state: currentState,
    transition,
    producer,
    authority: {
      human_final_decision_authority: "USER",
      monitoring_only: true,
      checkpoint_reset_authorized: false,
      release_authorized: false
    },
    checkpoint_reset_authorized: false,
    release_authorized: false,
    recorded_at: new Date(
      parseTimestamp(options.evaluatedAt)
    ).toISOString()
  };
  checkpoint.checkpoint_sha256 = checkpointDigest(checkpoint);
  const issues = validateGitHubReleaseTrustCheckpoint(checkpoint, {
    evaluatedAt: checkpoint.recorded_at,
    trustedRoot: options.trustedRoot
  });
  if (issues.length > 0) {
    throw new GitHubReleaseTrustCheckpointError(
      issues[0].code,
      issues[0].message,
      { issues }
    );
  }
  return checkpoint;
}

function assertTrustedRootMatchesCheckpoint(
  checkpoint,
  trustedRoot,
  options = {}
) {
  const issues = validateGitHubReleaseTrustCheckpoint(checkpoint, {
    evaluatedAt: options.evaluatedAt,
    maximumAgeSeconds:
      options.maximumAgeSeconds === undefined
        ? DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS
        : options.maximumAgeSeconds,
    requiredFreshUntil: options.requiredFreshUntil,
    trustedRoot
  });
  if (issues.length > 0) {
    throw new GitHubReleaseTrustCheckpointError(
      issues[0].code,
      issues[0].message,
      { issues }
    );
  }
  return true;
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new GitHubReleaseTrustCheckpointError(
        "GITHUB_RELEASE_TRUST_CHECKPOINT_CLI_ARGUMENT_INVALID",
        `Unexpected argument: ${token}`
      );
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new GitHubReleaseTrustCheckpointError(
        "GITHUB_RELEASE_TRUST_CHECKPOINT_CLI_ARGUMENT_MISSING",
        `Missing value for ${token}.`
      );
    }
    options[token.slice(2)] = value;
    index += 1;
  }
  return { command, options };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function main(argv = process.argv.slice(2)) {
  try {
    const { command, options } = parseCli(argv);
    if (command === "verify") {
      if (!options.input || !options["evaluated-at"]) {
        throw new GitHubReleaseTrustCheckpointError(
          "GITHUB_RELEASE_TRUST_CHECKPOINT_OPTION_MISSING",
          "verify requires --input and --evaluated-at."
        );
      }
      const checkpoint = readJson(options.input);
      const issues = validateGitHubReleaseTrustCheckpoint(checkpoint, {
        evaluatedAt: options["evaluated-at"],
        maximumAgeSeconds: options["maximum-age-seconds"] === undefined
          ? DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS
          : Number(options["maximum-age-seconds"])
      });
      process.stdout.write(`${JSON.stringify({
        valid: issues.length === 0,
        checkpoint_id: checkpoint.id,
        sequence: checkpoint.sequence,
        issue_codes: issues.map(item => item.code),
        release_authorized: false
      }, null, 2)}\n`);
      if (issues.length > 0) process.exitCode = 1;
      return;
    }
    if (command === "initialize") {
      for (const field of [
        "trusted-root",
        "repository",
        "default-branch",
        "evaluated-at",
        "user-grant-id",
        "granted-at",
        "repository-head-sha",
        "output"
      ]) {
        if (!options[field]) {
          throw new GitHubReleaseTrustCheckpointError(
            "GITHUB_RELEASE_TRUST_CHECKPOINT_OPTION_MISSING",
            `initialize requires --${field}.`
          );
        }
      }
      const checkpoint = initializeGitHubReleaseTrustCheckpoint({
        repository: {
          full_name: options.repository,
          default_branch: options["default-branch"]
        },
        trustedRoot: readJson(options["trusted-root"]),
        evaluatedAt: options["evaluated-at"],
        userGrantId: options["user-grant-id"],
        grantedAt: options["granted-at"],
        producer: {
          repository_head_sha: options["repository-head-sha"],
          workflow_ref: "none",
          run_id: "bootstrap",
          run_attempt: 0
        }
      });
      writeJsonAtomic(path.resolve(options.output), checkpoint);
      process.stdout.write(`${JSON.stringify({
        valid: true,
        checkpoint_id: checkpoint.id,
        sequence: checkpoint.sequence,
        output: path.resolve(options.output),
        release_authorized: false
      }, null, 2)}\n`);
      return;
    }
    if (command === "advance") {
      for (const field of [
        "previous",
        "previous-trusted-root",
        "trusted-root",
        "repository",
        "default-branch",
        "evaluated-at",
        "repository-head-sha",
        "producer-kind",
        "output"
      ]) {
        if (!options[field]) {
          throw new GitHubReleaseTrustCheckpointError(
            "GITHUB_RELEASE_TRUST_CHECKPOINT_OPTION_MISSING",
            `advance requires --${field}.`
          );
        }
      }
      const producerKind = options["producer-kind"];
      const checkpoint = advanceGitHubReleaseTrustCheckpoint({
        repository: {
          full_name: options.repository,
          default_branch: options["default-branch"]
        },
        previousCheckpoint: readJson(options.previous),
        previousTrustedRoot: readJson(
          options["previous-trusted-root"]
        ),
        trustedRoot: readJson(options["trusted-root"]),
        evaluatedAt: options["evaluated-at"],
        maximumPreviousAgeSeconds:
          options["maximum-previous-age-seconds"] === undefined
            ? DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS
            : Number(options["maximum-previous-age-seconds"]),
        producer: {
          kind: producerKind,
          repository_head_sha: options["repository-head-sha"],
          workflow_ref: options["workflow-ref"] || "none",
          run_id: options["run-id"] || "local",
          run_attempt: Number(options["run-attempt"] || 0)
        }
      });
      writeJsonAtomic(path.resolve(options.output), checkpoint);
      process.stdout.write(`${JSON.stringify({
        valid: true,
        checkpoint_id: checkpoint.id,
        sequence: checkpoint.sequence,
        transition: checkpoint.transition.classification,
        output: path.resolve(options.output),
        release_authorized: false
      }, null, 2)}\n`);
      return;
    }
    throw new GitHubReleaseTrustCheckpointError(
      "GITHUB_RELEASE_TRUST_CHECKPOINT_COMMAND_INVALID",
      "Expected initialize, advance, or verify command."
    );
  } catch (error) {
    console.error(JSON.stringify({
      valid: false,
      code: error.code ||
        "GITHUB_RELEASE_TRUST_CHECKPOINT_OPERATION_FAILED",
      message: error.message,
      ...(error.details && Object.keys(error.details).length > 0
        ? { details: error.details }
        : {}),
      release_authorized: false
    }, null, 2));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  CHECKPOINT_SCHEMA_VERSION,
  DEFAULT_MAXIMUM_CHECKPOINT_AGE_SECONDS,
  GitHubReleaseTrustCheckpointError,
  TUF_ROLES,
  advanceGitHubReleaseTrustCheckpoint,
  assertTrustedRootMatchesCheckpoint,
  checkpointDigest,
  compareTrustedStates,
  initializeGitHubReleaseTrustCheckpoint,
  main,
  sameTrustedState,
  trustedStateFromRoot,
  validateGitHubReleaseTrustCheckpoint
};
