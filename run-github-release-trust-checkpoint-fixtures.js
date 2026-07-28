#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  advanceGitHubReleaseTrustCheckpoint,
  assertTrustedRootMatchesCheckpoint,
  checkpointDigest,
  compareTrustedStates,
  initializeGitHubReleaseTrustCheckpoint,
  trustedStateFromRoot,
  validateGitHubReleaseTrustCheckpoint
} = require("./github-release-trust-checkpoint");
const {
  DEFAULT_BOOTSTRAP_RECOVERY_PATH,
  GitHubReleaseCheckpointStoreError,
  SystemGitHubReleaseCheckpointStore,
  assertSafeArchiveEntries,
  latestPolicyChange,
  sha256
} = require("./github-release-checkpoint-store");
const {
  createGitHubReleaseBootstrapRecovery,
  recoveryDigest
} = require("./github-release-bootstrap-recovery");
const {
  trustedRootArtifactDigest
} = require("./github-release-trusted-root");
const {
  validatePayload
} = require("./validator-cli-prototype/validate");

const ROOT_PATH = path.join(
  __dirname,
  "github-release-independent-verification-fixtures",
  "github-trusted-root.json"
);
const REPOSITORY = Object.freeze({
  full_name: "wnsdy95/cannae-os",
  default_branch: "main"
});
const HEAD_SHA = "786c38af6af6b79c185991c3e7e7374fc47a9eea";
const BOOTSTRAP_TIME = "2026-07-27T00:05:00.000Z";
const ADVANCE_TIME = "2026-07-27T06:00:00.000Z";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectError(name, expectedCode, callback) {
  try {
    callback();
    return {
      name,
      ok: false,
      detail: `expected ${expectedCode}, operation succeeded`
    };
  } catch (error) {
    return {
      name,
      ok: error.code === expectedCode,
      detail: `${error.code || error.name}: ${error.message}`
    };
  }
}

function rehash(checkpoint) {
  checkpoint.checkpoint_sha256 = checkpointDigest(checkpoint);
  return checkpoint;
}

function bootstrap(root) {
  return initializeGitHubReleaseTrustCheckpoint({
    repository: REPOSITORY,
    trustedRoot: root,
    evaluatedAt: BOOTSTRAP_TIME,
    userGrantId: "USER-GRANT-PHASE-19D-20260727",
    grantedAt: BOOTSTRAP_TIME,
    producer: {
      repository_head_sha: HEAD_SHA,
      workflow_ref: "none",
      run_id: "bootstrap",
      run_attempt: 0
    }
  });
}

function advance(previous, root) {
  return advanceGitHubReleaseTrustCheckpoint({
    repository: REPOSITORY,
    previousCheckpoint: previous,
    previousTrustedRoot: root,
    trustedRoot: root,
    evaluatedAt: ADVANCE_TIME,
    maximumPreviousAgeSeconds: 12 * 60 * 60,
    producer: {
      kind: "github_actions",
      repository_head_sha: HEAD_SHA,
      workflow_ref:
        "wnsdy95/cannae-os/.github/workflows/release-integrity.yml@refs/heads/main",
      run_id: "30244695566",
      run_attempt: 1
    }
  });
}

function runGit(repositoryRoot, args, environment = {}) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...environment
    }
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`
    );
  }
  return result.stdout.trim();
}

function makeStoreFixture(root) {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "cannae-checkpoint-store-")
  );
  runGit(repositoryRoot, ["init", "-q", "-b", "main"]);
  runGit(repositoryRoot, ["config", "user.name", "Controls Fixture"]);
  runGit(repositoryRoot, [
    "config",
    "user.email",
    "controls-fixture@example.invalid"
  ]);
  const policyPath = ".github/release-integrity-policy.json";
  const workflowPath =
    ".github/workflows/release-integrity.yml";
  const bootstrapCheckpointPath =
    ".github/tuf/github-release-trust-checkpoint.json";
  const bootstrapTrustedRootPath =
    ".github/tuf/github-release-trust-bootstrap-root.json";
  for (const relativePath of [
    policyPath,
    workflowPath,
    bootstrapCheckpointPath,
    bootstrapTrustedRootPath
  ]) {
    fs.mkdirSync(path.dirname(
      path.join(repositoryRoot, relativePath)
    ), { recursive: true });
  }
  const policy = {
    schema_version: "0.3",
    type: "GitHubReleaseIntegrityPolicy",
    id: "GRIP-checkpoint-store-fixture",
    policy_sha256: "d".repeat(64),
    trust_checkpoint_policy: {
      required: true,
      continuity_mode: "github_actions_artifact_chain"
    }
  };
  const genesis = bootstrap(root);
  fs.writeFileSync(
    path.join(repositoryRoot, policyPath),
    `${JSON.stringify(policy, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(repositoryRoot, workflowPath),
    "name: Release integrity fixture\n"
  );
  fs.writeFileSync(
    path.join(repositoryRoot, bootstrapCheckpointPath),
    `${JSON.stringify(genesis, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(repositoryRoot, bootstrapTrustedRootPath),
    `${JSON.stringify(root, null, 2)}\n`
  );
  runGit(repositoryRoot, ["add", "."]);
  const commitEnvironment = {
    GIT_AUTHOR_DATE: "2026-07-27T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-07-27T00:00:00Z"
  };
  runGit(
    repositoryRoot,
    ["commit", "-q", "-m", "checkpoint store fixture"],
    commitEnvironment
  );
  const headSha = runGit(repositoryRoot, ["rev-parse", "HEAD"]);
  const policyBytes = fs.readFileSync(
    path.join(repositoryRoot, policyPath)
  );
  const options = {
    repository: REPOSITORY.full_name,
    defaultBranch: REPOSITORY.default_branch,
    policyPath,
    policyBytes,
    bootstrapCheckpointPath,
    bootstrapTrustedRootPath,
    workflowPath,
    artifactNamePrefix: "release-integrity-",
    maximumRunHistory: 100,
    bootstrapWindowSeconds: 4 * 60 * 60,
    now: "2026-07-27T02:00:00.000Z",
    currentRunId: "9000",
    currentRunAttempt: 1
  };
  return {
    repositoryRoot,
    genesis,
    headSha,
    options,
    cleanup: () => fs.rmSync(
      repositoryRoot,
      { recursive: true, force: true }
    )
  };
}

class FixtureCheckpointStore extends SystemGitHubReleaseCheckpointStore {
  constructor(
    repositoryRoot,
    runs,
    loader,
    attemptInspector = null,
    recoveryLoader = null
  ) {
    super(repositoryRoot);
    this.runs = runs;
    this.loader = loader;
    this.attemptInspector = attemptInspector;
    this.recoveryLoader = recoveryLoader;
    this.loadCalls = [];
    this.recoveryLoadCalls = [];
  }

  listCompletedRuns() {
    return clone(this.runs);
  }

  loadArtifact(repository, run, artifactName) {
    this.loadCalls.push({
      repository,
      run: clone(run),
      artifactName
    });
    return this.loader(repository, run, artifactName);
  }

  loadInitialBootstrapFailureArtifact(
    repository,
    run,
    artifactName
  ) {
    this.recoveryLoadCalls.push({
      repository,
      run: clone(run),
      artifactName
    });
    if (!this.recoveryLoader) {
      return super.loadInitialBootstrapFailureArtifact(
        repository,
        run,
        artifactName
      );
    }
    return clone(this.recoveryLoader(
      repository,
      run,
      artifactName
    ));
  }

  inspectRunAttempt(repository, runId, runAttempt) {
    if (!this.attemptInspector) {
      throw new Error("run attempt inspector must not run");
    }
    return clone(this.attemptInspector(
      repository,
      runId,
      runAttempt
    ));
  }
}

function makeBlockedRun(fixture, id, runNumber, createdAt) {
  return {
    id,
    run_number: runNumber,
    path: fixture.options.workflowPath,
    status: "completed",
    head_branch: "main",
    conclusion: "failure",
    run_attempt: 1,
    created_at: createdAt,
    updated_at: createdAt,
    head_sha: fixture.headSha
  };
}

function makeBlockedArtifact(run, root, failureCode, index) {
  const observedAt = new Date(
    Date.parse(run.created_at) + 5 * 60 * 1000
  ).toISOString();
  const artifactCreatedAt = new Date(
    Date.parse(observedAt) + 1000
  ).toISOString();
  return {
    trusted_root: clone(root),
    full_observation: {
      id: `GRIO-bootstrap-recovery-${index}`,
      observation_sha256:
        String(index).repeat(64).slice(0, 64),
      observed_at: observedAt,
      trust_checkpoint_observation: {
        status: "unavailable",
        failure_code: failureCode
      }
    },
    provenance: {
      source: "github_actions_artifact",
      run_id: String(run.id),
      run_attempt: run.run_attempt,
      head_sha: run.head_sha,
      conclusion: run.conclusion,
      artifact_id: String(8100 + index),
      artifact_name:
        `release-integrity-${run.id}-${run.run_attempt}`,
      artifact_digest:
        `sha256:${String(index + 1).repeat(64).slice(0, 64)}`,
      artifact_created_at: artifactCreatedAt,
      artifact_expires_at: "2026-08-26T02:00:00.000Z"
    }
  };
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

function commitRecoveryFixture(
  fixture,
  root,
  runs,
  artifacts,
  mutate = null
) {
  const introduction = latestPolicyChange(
    fixture.repositoryRoot,
    fixture.options.policyPath
  );
  const policy = JSON.parse(
    fixture.options.policyBytes.toString("utf8")
  );
  const blockedRuns = runs.map((run, index) =>
    blockedRunRecord(run, artifacts[index]));
  const recovery = createGitHubReleaseBootstrapRecovery({
    repository: {
      full_name: REPOSITORY.full_name,
      default_branch: REPOSITORY.default_branch
    },
    policy: {
      id: policy.id,
      relative_path: fixture.options.policyPath,
      sha256: policy.policy_sha256,
      head_blob_sha256: sha256(fixture.options.policyBytes),
      introduction_commit_sha: introduction.commit_sha,
      introduction_time: introduction.committed_at
    },
    introduction,
    policyBytes: fixture.options.policyBytes,
    bootstrapCheckpoint: fixture.genesis,
    bootstrapTrustedRoot: root,
    blockedRuns,
    userGrantId:
      fixture.genesis.predecessor
        .bootstrap_authorization.grant_id,
    grantedAt: "2026-07-27T01:40:00.000Z",
    authorizedAt: "2026-07-27T01:40:00.000Z",
    expiresAt: "2026-07-27T02:30:00.000Z"
  });
  if (mutate) {
    mutate(recovery);
    recovery.recovery_sha256 = recoveryDigest(recovery);
  }
  const recoveryPath = path.join(
    fixture.repositoryRoot,
    DEFAULT_BOOTSTRAP_RECOVERY_PATH
  );
  fs.writeFileSync(
    recoveryPath,
    `${JSON.stringify(recovery, null, 2)}\n`
  );
  runGit(fixture.repositoryRoot, [
    "add",
    DEFAULT_BOOTSTRAP_RECOVERY_PATH
  ]);
  runGit(
    fixture.repositoryRoot,
    ["commit", "-q", "-m", "authorize bootstrap recovery"],
    {
      GIT_AUTHOR_DATE: "2026-07-27T01:45:00Z",
      GIT_COMMITTER_DATE: "2026-07-27T01:45:00Z"
    }
  );
  return {
    recovery,
    blockedRuns,
    currentHeadSha: runGit(
      fixture.repositoryRoot,
      ["rev-parse", "HEAD"]
    )
  };
}

function recoveryCurrentRun(fixture, headSha, overrides = {}) {
  return {
    id: Number(fixture.options.currentRunId),
    run_number: 83,
    path: fixture.options.workflowPath,
    status: "in_progress",
    head_branch: "main",
    conclusion: null,
    event: "push",
    run_attempt: 1,
    created_at: "2026-07-27T01:50:00.000Z",
    updated_at: "2026-07-27T02:00:00.000Z",
    head_sha: headSha,
    ...overrides
  };
}

class ArchiveFixtureCheckpointStore
  extends SystemGitHubReleaseCheckpointStore {
  constructor(repositoryRoot, run, artifact, archive) {
    super(repositoryRoot);
    this.run = run;
    this.artifact = artifact;
    this.archive = archive;
    this.inspectCalls = [];
    this.downloadCalls = [];
  }

  listCompletedRuns() {
    return [clone(this.run)];
  }

  inspectArtifact(repository, run, artifactName) {
    this.inspectCalls.push({
      repository,
      run: clone(run),
      artifactName
    });
    return clone(this.artifact);
  }

  downloadArtifact(repository, artifact) {
    this.downloadCalls.push({
      repository,
      artifact: clone(artifact)
    });
    if (`sha256:${sha256(this.archive)}` !==
        artifact.digest) {
      throw new GitHubReleaseCheckpointStoreError(
        "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_DIGEST_MISMATCH",
        "Fixture archive does not match artifact metadata."
      );
    }
    return Buffer.from(this.archive);
  }
}

function checkpointArtifact(genesis, run) {
  const checkpoint = clone(genesis);
  checkpoint.producer = {
    kind: "github_actions",
    repository_head_sha: run.head_sha,
    workflow_ref:
      "wnsdy95/cannae-os/.github/workflows/release-integrity.yml@refs/heads/main",
    run_id: String(run.id),
    run_attempt: run.run_attempt
  };
  rehash(checkpoint);
  return {
    checkpoint,
    trusted_root: JSON.parse(fs.readFileSync(ROOT_PATH, "utf8")),
    provenance: {
      source: "github_actions_artifact",
      run_id: String(run.id)
    }
  };
}

function runFixtures() {
  const results = [];
  const root = JSON.parse(fs.readFileSync(ROOT_PATH, "utf8"));
  const genesis = bootstrap(root);

  results.push({
    name: "USER-authorized genesis checkpoint is schema and semantically valid",
    ok: genesis.sequence === 0 &&
      genesis.predecessor.kind === "genesis" &&
      genesis.transition.classification === "bootstrap" &&
      genesis.authority.human_final_decision_authority === "USER" &&
      genesis.checkpoint_reset_authorized === false &&
      genesis.release_authorized === false &&
      validateGitHubReleaseTrustCheckpoint(genesis, {
        evaluatedAt: BOOTSTRAP_TIME,
        trustedRoot: root
      }).length === 0 &&
      validatePayload(
        genesis,
        "github-release-trust-checkpoint",
        { evaluatedAt: BOOTSTRAP_TIME }
      ).valid === true
  });

  {
    const attacked = clone(genesis);
    attacked.predecessor.unexpected_policy_override = true;
    rehash(attacked);
    const result = validatePayload(
      attacked,
      "github-release-trust-checkpoint",
      { evaluatedAt: BOOTSTRAP_TIME }
    );
    results.push({
      name: "checkpoint predecessor rejects nested additional properties through oneOf",
      ok: result.valid === false &&
        result.issues.some(item =>
          item.code === "ONE_OF_MISMATCH")
    });
  }

  {
    const result = validatePayload(
      genesis,
      "github-release-trust-checkpoint"
    );
    results.push({
      name: "generic checkpoint validation requires an external clock",
      ok: result.valid === false &&
        result.issues.some(item =>
          item.code ===
            "GITHUB_RELEASE_TRUST_CHECKPOINT_EVALUATION_TIME_REQUIRED")
    });
  }

  const current = advance(genesis, root);
  results.push({
    name: "unchanged signed TUF state advances exactly one checkpoint sequence",
    ok: current.sequence === 1 &&
      current.predecessor.checkpoint_sha256 ===
        genesis.checkpoint_sha256 &&
      current.transition.classification === "unchanged" &&
      Object.values(current.transition.version_deltas)
        .every(delta => delta === 0) &&
      validatePayload(
        current,
        "github-release-trust-checkpoint",
        { evaluatedAt: ADVANCE_TIME }
      ).valid === true
  });

  results.push({
    name: "a later consumer can match the exact root without rewriting checkpoint time",
    ok: assertTrustedRootMatchesCheckpoint(
      current,
      root,
      {
        evaluatedAt: "2026-07-27T07:00:00.000Z",
        maximumAgeSeconds: 12 * 60 * 60
      }
    ) === true
  });

  {
    const attacked = clone(genesis);
    attacked.trusted_state.metadata.timestamp.version += 1;
    rehash(attacked);
    results.push(expectError(
      "rehashed prior version inflation cannot replace signed predecessor state",
      "GITHUB_RELEASE_TRUST_CHECKPOINT_PREVIOUS_ROOT_MISMATCH",
      () => advance(attacked, root)
    ));
  }

  {
    const attacked = clone(genesis);
    attacked.trusted_state.metadata.timestamp.sha256 = "a".repeat(64);
    rehash(attacked);
    results.push(expectError(
      "same-version metadata substitution cannot replace signed predecessor state",
      "GITHUB_RELEASE_TRUST_CHECKPOINT_PREVIOUS_ROOT_MISMATCH",
      () => advance(attacked, root)
    ));
  }

  {
    const priorState = clone(genesis.trusted_state);
    priorState.metadata.timestamp.version += 1;
    const currentState = trustedStateFromRoot(root, ADVANCE_TIME);
    results.push(expectError(
      "authenticated higher prior state detects signed current rollback",
      "GITHUB_RELEASE_TUF_CHECKPOINT_ROLLBACK_DETECTED",
      () => compareTrustedStates(priorState, currentState, root)
    ));
  }

  {
    const priorState = clone(genesis.trusted_state);
    priorState.metadata.timestamp.sha256 = "c".repeat(64);
    const currentState = trustedStateFromRoot(root, ADVANCE_TIME);
    results.push(expectError(
      "authenticated same-version conflict detects equivocation",
      "GITHUB_RELEASE_TUF_CHECKPOINT_EQUIVOCATION_DETECTED",
      () => compareTrustedStates(priorState, currentState, root)
    ));
  }

  {
    const attacked = clone(genesis);
    attacked.trusted_state.metadata.root.version = 8;
    attacked.trusted_state.metadata.root.sha256 = "b".repeat(64);
    rehash(attacked);
    const currentState = trustedStateFromRoot(root, ADVANCE_TIME);
    results.push(expectError(
      "state comparison requires the exact prior root in the current chain",
      "GITHUB_RELEASE_TUF_CHECKPOINT_ROOT_CONTINUITY_FAILED",
      () => compareTrustedStates(
        attacked.trusted_state,
        currentState,
        root
      )
    ));
  }

  {
    const attacked = clone(genesis);
    attacked.trusted_state.source_fetched_at =
      "2026-07-27T00:04:00.000Z";
    rehash(attacked);
    const backdatedRoot = clone(root);
    backdatedRoot.source.fetched_at = "2026-07-27T00:03:00.000Z";
    backdatedRoot.artifact_sha256 =
      trustedRootArtifactDigest(backdatedRoot);
    const currentState = trustedStateFromRoot(
      backdatedRoot,
      ADVANCE_TIME
    );
    results.push(expectError(
      "backdated current retrieval cannot follow a newer checkpoint",
      "GITHUB_RELEASE_TUF_CHECKPOINT_RETRIEVAL_TIME_ROLLBACK",
      () => compareTrustedStates(
        attacked.trusted_state,
        currentState,
        backdatedRoot
      )
    ));
  }

  {
    const stale = clone(genesis);
    results.push(expectError(
      "stale predecessor cannot silently reset to genesis",
      "GITHUB_RELEASE_TRUST_CHECKPOINT_STALE",
      () => advanceGitHubReleaseTrustCheckpoint({
        repository: REPOSITORY,
        previousCheckpoint: stale,
        previousTrustedRoot: root,
        trustedRoot: root,
        evaluatedAt: "2026-07-27T13:05:01.000Z",
        maximumPreviousAgeSeconds: 12 * 60 * 60,
        producer: {
          kind: "local_operator",
          repository_head_sha: HEAD_SHA,
          workflow_ref: "none",
          run_id: "local",
          run_attempt: 0
        }
      })
    ));
  }

  {
    const attacked = clone(current);
    attacked.predecessor.sequence = 0;
    attacked.sequence = 3;
    rehash(attacked);
    const issues = validateGitHubReleaseTrustCheckpoint(attacked, {
      evaluatedAt: ADVANCE_TIME
    });
    results.push({
      name: "sequence gaps and predecessor forks fail semantic validation",
      ok: issues.some(item =>
        item.code ===
          "GITHUB_RELEASE_TRUST_CHECKPOINT_PREDECESSOR_INVALID")
    });
  }

  {
    const attacked = clone(current);
    attacked.authority.release_authorized = true;
    attacked.release_authorized = true;
    rehash(attacked);
    const result = validatePayload(
      attacked,
      "github-release-trust-checkpoint",
      { evaluatedAt: ADVANCE_TIME }
    );
    results.push({
      name: "checkpoint continuity cannot expand release authority",
      ok: result.valid === false &&
        result.issues.some(item =>
          item.code ===
            "GITHUB_RELEASE_TRUST_CHECKPOINT_AUTHORITY_DRIFT")
    });
  }

  {
    const attackedRoot = clone(root);
    attackedRoot.id = "GRTR-10-substituted";
    attackedRoot.artifact_sha256 =
      trustedRootArtifactDigest(attackedRoot);
    results.push(expectError(
      "publisher-style root matching rejects a substituted artifact",
      "GITHUB_RELEASE_TRUST_CHECKPOINT_ROOT_MISMATCH",
      () => assertTrustedRootMatchesCheckpoint(
        current,
        attackedRoot,
        {
          evaluatedAt: "2026-07-27T07:00:00.000Z",
          maximumAgeSeconds: 12 * 60 * 60
        }
      )
    ));
  }

  {
    const temp = path.join(
      __dirname,
      ".tmp-github-release-trust-checkpoint.json"
    );
    fs.writeFileSync(temp, `${JSON.stringify(current, null, 2)}\n`);
    const missingClock = spawnSync(process.execPath, [
      path.join(__dirname, "validator-cli-prototype", "validate.js"),
      temp,
      "github-release-trust-checkpoint"
    ], { encoding: "utf8" });
    const withClock = spawnSync(process.execPath, [
      path.join(__dirname, "validator-cli-prototype", "validate.js"),
      temp,
      "github-release-trust-checkpoint",
      "--evaluated-at",
      ADVANCE_TIME
    ], { encoding: "utf8" });
    fs.rmSync(temp, { force: true });
    results.push({
      name: "validator CLI fails closed without checkpoint evaluation time",
      ok: missingClock.status === 1 &&
        JSON.parse(missingClock.stdout).valid === false &&
        withClock.status === 0 &&
        JSON.parse(withClock.stdout).valid === true
    });
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [],
        () => {
          throw new Error("artifact loader must not run");
        }
      );
      const loaded = store.resolve(fixture.options);
      results.push({
        name: "repository bootstrap is accepted only when no matching artifact lineage exists",
        ok: loaded.provenance.source === "repository_bootstrap" &&
          loaded.checkpoint.checkpoint_sha256 ===
            fixture.genesis.checkpoint_sha256 &&
          store.loadCalls.length === 0
      });
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    const archiveRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cannae-checkpoint-archive-")
    );
    try {
      const run = {
        id: 7051,
        run_number: 75,
        path: fixture.options.workflowPath,
        status: "completed",
        head_branch: "main",
        conclusion: "failure",
        run_attempt: 1,
        created_at: "2026-07-27T01:00:00.000Z",
        updated_at: "2026-07-27T02:00:00.000Z",
        head_sha: fixture.headSha
      };
      const checkpoint =
        advanceGitHubReleaseTrustCheckpoint({
          repository: REPOSITORY,
          previousCheckpoint: fixture.genesis,
          previousTrustedRoot: root,
          trustedRoot: root,
          evaluatedAt: "2026-07-27T02:00:00.000Z",
          producer: {
            kind: "github_actions",
            repository_head_sha: run.head_sha,
            workflow_ref:
              "wnsdy95/cannae-os/.github/workflows/release-integrity.yml@refs/heads/main",
            run_id: String(run.id),
            run_attempt: run.run_attempt
          }
        });
      const payloadDirectory = path.join(
        archiveRoot,
        "payload",
        "nested"
      );
      fs.mkdirSync(payloadDirectory, { recursive: true });
      fs.writeFileSync(
        path.join(
          payloadDirectory,
          "github-release-trust-checkpoint.json"
        ),
        `${JSON.stringify(checkpoint, null, 2)}\n`
      );
      fs.writeFileSync(
        path.join(payloadDirectory, "github-trusted-root.json"),
        `${JSON.stringify(root, null, 2)}\n`
      );
      fs.writeFileSync(
        path.join(payloadDirectory, "full-observation.json"),
        `${JSON.stringify({
          type: "FullObservationArchiveFixture"
        }, null, 2)}\n`
      );
      const archivePath = path.join(
        archiveRoot,
        "release-integrity.zip"
      );
      const zipped = spawnSync(
        "zip",
        ["-q", "-r", archivePath, "."],
        {
          cwd: path.join(archiveRoot, "payload"),
          encoding: "utf8"
        }
      );
      if (zipped.status !== 0) {
        throw new Error(
          `zip fixture failed: ${zipped.stderr || zipped.stdout}`
        );
      }
      const archive = fs.readFileSync(archivePath);
      const artifactName = `release-integrity-${run.id}-${
        run.run_attempt
      }`;
      const artifact = {
        id: 8051,
        name: artifactName,
        expired: false,
        digest: `sha256:${sha256(archive)}`,
        created_at: "2026-07-27T02:00:00.000Z",
        expires_at: "2026-08-26T02:00:00.000Z",
        workflow_run: {
          id: run.id,
          head_sha: run.head_sha
        }
      };
      const missingObservationArchivePath = path.join(
        archiveRoot,
        "release-integrity-missing-observation.zip"
      );
      fs.copyFileSync(
        archivePath,
        missingObservationArchivePath
      );
      const removed = spawnSync(
        "zip",
        [
          "-q",
          "-d",
          missingObservationArchivePath,
          "nested/full-observation.json"
        ],
        { encoding: "utf8" }
      );
      if (removed.status !== 0) {
        throw new Error(
          `zip fixture removal failed: ${
            removed.stderr || removed.stdout
          }`
        );
      }
      const missingObservationArchive = fs.readFileSync(
        missingObservationArchivePath
      );
      const missingObservationArtifact = {
        ...artifact,
        digest:
          `sha256:${sha256(missingObservationArchive)}`
      };
      const missingObservationStore =
        new ArchiveFixtureCheckpointStore(
          fixture.repositoryRoot,
          run,
          missingObservationArtifact,
          missingObservationArchive
        );
      results.push(expectError(
        "real artifact ZIP without full observation is rejected",
        "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
        () => missingObservationStore.resolve(fixture.options)
      ));
      const store = new ArchiveFixtureCheckpointStore(
        fixture.repositoryRoot,
        run,
        artifact,
        archive
      );
      const loaded = store.resolve(fixture.options);
      results.push({
        name: "latest eligible artifact ZIP is parsed into one exact checkpoint lineage",
        ok: loaded.checkpoint.checkpoint_sha256 ===
            checkpoint.checkpoint_sha256 &&
          loaded.trusted_root.artifact_sha256 ===
            root.artifact_sha256 &&
          loaded.full_observation.type ===
            "FullObservationArchiveFixture" &&
          loaded.provenance.run_id === String(run.id) &&
          loaded.provenance.artifact_digest ===
            artifact.digest &&
          store.inspectCalls.length === 1 &&
          store.inspectCalls[0].artifactName === artifactName &&
          store.downloadCalls.length === 1
      });
    } finally {
      fs.rmSync(
        archiveRoot,
        { recursive: true, force: true }
      );
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const policyAbsolutePath = path.join(
        fixture.repositoryRoot,
        fixture.options.policyPath
      );
      const policy = JSON.parse(fs.readFileSync(
        policyAbsolutePath,
        "utf8"
      ));
      policy.operational_revision = 2;
      fs.writeFileSync(
        policyAbsolutePath,
        `${JSON.stringify(policy, null, 2)}\n`
      );
      runGit(fixture.repositoryRoot, [
        "add",
        fixture.options.policyPath
      ]);
      runGit(
        fixture.repositoryRoot,
        ["commit", "-q", "-m", "ordinary policy revision"],
        {
          GIT_AUTHOR_DATE: "2026-07-27T06:00:00Z",
          GIT_COMMITTER_DATE: "2026-07-27T06:00:00Z"
        }
      );
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [],
        () => {
          throw new Error("artifact loader must not run");
        }
      );
      results.push(expectError(
        "ordinary policy edits cannot reopen the one-time bootstrap window",
        "GITHUB_RELEASE_CHECKPOINT_BOOTSTRAP_WINDOW_EXPIRED",
        () => store.resolve({
          ...fixture.options,
          policyBytes: fs.readFileSync(policyAbsolutePath),
          now: "2026-07-27T06:01:00.000Z"
        })
      ));
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [],
        () => {
          throw new Error("artifact loader must not run");
        }
      );
      results.push(expectError(
        "repository bootstrap expires after the bounded introduction window",
        "GITHUB_RELEASE_CHECKPOINT_BOOTSTRAP_WINDOW_EXPIRED",
        () => store.resolve({
          ...fixture.options,
          now: "2026-07-27T04:00:01.000Z"
        })
      ));
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const older = {
        id: 7001,
        run_number: 71,
        path: fixture.options.workflowPath,
        status: "completed",
        head_branch: "main",
        conclusion: "success",
        run_attempt: 1,
        created_at: "2026-07-27T01:00:00.000Z",
        updated_at: "2026-07-27T02:00:00.000Z",
        head_sha: fixture.headSha
      };
      const latest = {
        ...older,
        id: 7002,
        run_number: 72,
        conclusion: "failure",
        created_at: "2026-07-27T01:30:00.000Z",
        updated_at: "2026-07-27T01:30:00.000Z"
      };
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [older, latest],
        (repository, run) =>
          checkpointArtifact(fixture.genesis, run)
      );
      const loaded = store.resolve(fixture.options);
      results.push({
        name: "latest policy-matching completed run is the sole artifact lineage predecessor",
        ok: loaded.checkpoint.producer.run_id === "7002" &&
          store.loadCalls.length === 1 &&
          store.recoveryLoadCalls.length === 0 &&
          store.loadCalls[0].artifactName ===
            "release-integrity-7002-1"
      });
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const older = {
        id: 7101,
        run_number: 81,
        path: fixture.options.workflowPath,
        status: "completed",
        head_branch: "main",
        conclusion: "success",
        run_attempt: 1,
        created_at: "2026-07-27T01:00:00.000Z",
        updated_at: "2026-07-27T01:00:00.000Z",
        head_sha: fixture.headSha
      };
      const latest = {
        ...older,
        id: 7102,
        run_number: 82,
        created_at: "2026-07-27T01:30:00.000Z",
        updated_at: "2026-07-27T01:30:00.000Z"
      };
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [older, latest],
        (repository, run) => {
          throw new GitHubReleaseCheckpointStoreError(
            "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_MISSING",
            `artifact missing for ${run.id}`
          );
        }
      );
      const result = expectError(
        "missing latest artifact never falls back to an older run or repository bootstrap",
        "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_MISSING",
        () => store.resolve(fixture.options)
      );
      result.ok = result.ok &&
        store.loadCalls.length === 1 &&
        store.loadCalls[0].run.id === 7102;
      results.push(result);
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const run = {
        id: 7201,
        run_number: 91,
        path: fixture.options.workflowPath,
        status: "completed",
        head_branch: "main",
        conclusion: "success",
        run_attempt: 1,
        created_at: "2026-07-27T01:00:00.000Z",
        updated_at: "2026-07-27T01:00:00.000Z",
        head_sha: fixture.headSha
      };
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [run],
        () => {
          const loaded = checkpointArtifact(
            fixture.genesis,
            run
          );
          loaded.checkpoint.producer.run_id = "999999";
          rehash(loaded.checkpoint);
          return loaded;
        }
      );
      results.push(expectError(
        "artifact checkpoint producer must equal its exact workflow run",
        "GITHUB_RELEASE_CHECKPOINT_PRODUCER_MISMATCH",
        () => store.resolve(fixture.options)
      ));
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [],
        () => {
          throw new Error("artifact loader must not run");
        }
      );
      results.push(expectError(
        "rerun attempt without an exact stable run ID is rejected",
        "GITHUB_RELEASE_CHECKPOINT_STORE_OPTIONS_INVALID",
        () => store.resolve({
          ...fixture.options,
          currentRunId: undefined,
          currentRunAttempt: 2
        })
      ));
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const historicalRunId = 7301;
      const historicalRunNumber = 101;
      const newer = {
        id: 7302,
        run_number: 102,
        path: fixture.options.workflowPath,
        status: "completed",
        head_branch: "main",
        conclusion: "success",
        run_attempt: 1,
        created_at: "2026-07-27T01:30:00.000Z",
        updated_at: "2026-07-27T01:30:00.000Z",
        head_sha: fixture.headSha
      };
      const attemptInspector = (
        repository,
        runId,
        runAttempt
      ) => ({
        id: runId,
        run_number: historicalRunNumber,
        path: fixture.options.workflowPath,
        status: runAttempt === 2 ? "in_progress" : "completed",
        head_branch: "main",
        conclusion: runAttempt === 2 ? null : "success",
        run_attempt: runAttempt,
        created_at: "2026-07-27T01:00:00.000Z",
        updated_at: "2026-07-27T02:00:00.000Z",
        head_sha: fixture.headSha
      });
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [newer],
        () => {
          throw new Error("artifact loader must not run");
        },
        attemptInspector
      );
      const result = expectError(
        "historical rerun cannot fork after a newer eligible run",
        "GITHUB_RELEASE_CHECKPOINT_RERUN_FORK_BLOCKED",
        () => store.resolve({
          ...fixture.options,
          currentRunId: String(historicalRunId),
          currentRunAttempt: 2
        })
      );
      result.ok = result.ok && store.loadCalls.length === 0;
      results.push(result);
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const latestRunId = 7401;
      const latestRunNumber = 111;
      const attemptInspector = (
        repository,
        runId,
        runAttempt
      ) => ({
        id: runId,
        run_number: latestRunNumber,
        path: fixture.options.workflowPath,
        status: runAttempt === 2 ? "in_progress" : "completed",
        head_branch: "main",
        conclusion: runAttempt === 2 ? null : "failure",
        run_attempt: runAttempt,
        created_at: "2026-07-27T01:00:00.000Z",
        updated_at: "2026-07-27T01:30:00.000Z",
        head_sha: fixture.headSha
      });
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [],
        (repository, run) =>
          checkpointArtifact(fixture.genesis, run),
        attemptInspector
      );
      const loaded = store.resolve({
        ...fixture.options,
        currentRunId: String(latestRunId),
        currentRunAttempt: 2
      });
      results.push({
        name: "latest rerun can consume only its exact immediately preceding attempt",
        ok: loaded.checkpoint.producer.run_id ===
            String(latestRunId) &&
          loaded.checkpoint.producer.run_attempt === 1 &&
          store.loadCalls.length === 1 &&
          store.loadCalls[0].artifactName ===
            `release-integrity-${latestRunId}-1`
      });
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const runId = 7501;
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [],
        () => {
          throw new Error("artifact loader must not run");
        },
        (repository, inspectedRunId, runAttempt) => ({
          id: inspectedRunId,
          run_number: 121,
          path: fixture.options.workflowPath,
          status: "in_progress",
          head_branch: "main",
          conclusion: runAttempt === 2 ? null : "failure",
          run_attempt: runAttempt,
          created_at: "2026-07-27T01:00:00.000Z",
          updated_at: "2026-07-27T01:30:00.000Z",
          head_sha: fixture.headSha
        })
      );
      results.push(expectError(
        "rerun predecessor must be a completed prior attempt",
        "GITHUB_RELEASE_CHECKPOINT_PREVIOUS_ATTEMPT_INVALID",
        () => store.resolve({
          ...fixture.options,
          currentRunId: String(runId),
          currentRunAttempt: 2
        })
      ));
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const runId = 7601;
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [],
        () => {
          throw new Error("artifact loader must not run");
        },
        (repository, inspectedRunId, runAttempt) => ({
          id: inspectedRunId,
          run_number: 131,
          path: fixture.options.workflowPath,
          status: runAttempt === 2
            ? "in_progress"
            : "completed",
          head_branch: "feature/off-default",
          conclusion: runAttempt === 2 ? null : "success",
          run_attempt: runAttempt,
          created_at: "2026-07-27T01:00:00.000Z",
          updated_at: "2026-07-27T01:30:00.000Z",
          head_sha: fixture.headSha
        })
      );
      results.push(expectError(
        "rerun current attempt must originate on the default branch",
        "GITHUB_RELEASE_CHECKPOINT_CURRENT_RERUN_INVALID",
        () => store.resolve({
          ...fixture.options,
          currentRunId: String(runId),
          currentRunAttempt: 2
        })
      ));
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const runs = [
        makeBlockedRun(
          fixture,
          8001,
          81,
          "2026-07-27T01:00:00.000Z"
        ),
        makeBlockedRun(
          fixture,
          8002,
          82,
          "2026-07-27T01:20:00.000Z"
        )
      ];
      const artifacts = [
        makeBlockedArtifact(
          runs[0],
          root,
          "GITHUB_RELEASE_TRUST_CHECKPOINT_STALE",
          1
        ),
        makeBlockedArtifact(
          runs[1],
          root,
          "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
          2
        )
      ];
      const committed = commitRecoveryFixture(
        fixture,
        root,
        runs,
        artifacts
      );
      let validatedArtifactCount = 0;
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        runs,
        () => {
          throw new GitHubReleaseCheckpointStoreError(
            "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
            "fixture initial artifact has no checkpoint"
          );
        },
        () => recoveryCurrentRun(
          fixture,
          committed.currentHeadSha
        ),
        (repository, run) =>
          artifacts[runs.findIndex(item => item.id === run.id)]
      );
      const loaded = store.resolve({
        ...fixture.options,
        initialBootstrapFailureValidator:
          (artifact, options) => {
            validatedArtifactCount += 1;
            if (String(options.expectedRun.id) !==
                artifact.provenance.run_id) {
              throw new Error("fixture run binding mismatch");
            }
            return true;
          }
      });
      results.push({
        name: "one exact USER recovery admits the complete retained initial failure set once",
        ok: loaded.provenance.source ===
            "repository_bootstrap_recovery" &&
          loaded.provenance.recovery_authorization_sha256 ===
            committed.recovery.recovery_sha256 &&
          loaded.provenance.blocked_run_count === 2 &&
          loaded.checkpoint.checkpoint_sha256 ===
            fixture.genesis.checkpoint_sha256 &&
          validatedArtifactCount === 2 &&
          store.loadCalls.length === 1 &&
          store.recoveryLoadCalls.length === 2 &&
          validatePayload(
            committed.recovery,
            "github-release-bootstrap-recovery",
            { evaluatedAt: fixture.options.now }
          ).valid === true
      });
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const runs = [
        makeBlockedRun(
          fixture,
          8011,
          81,
          "2026-07-27T01:00:00.000Z"
        ),
        makeBlockedRun(
          fixture,
          8012,
          82,
          "2026-07-27T01:20:00.000Z"
        )
      ];
      const artifacts = [
        makeBlockedArtifact(
          runs[0],
          root,
          "GITHUB_RELEASE_TRUST_CHECKPOINT_STALE",
          3
        ),
        makeBlockedArtifact(
          runs[1],
          root,
          "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
          4
        )
      ];
      const committed = commitRecoveryFixture(
        fixture,
        root,
        runs,
        artifacts,
        recovery => {
          recovery.blocked_runs.pop();
        }
      );
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        runs,
        () => {
          throw new GitHubReleaseCheckpointStoreError(
            "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
            "fixture initial artifact has no checkpoint"
          );
        },
        () => recoveryCurrentRun(
          fixture,
          committed.currentHeadSha
        ),
        (repository, run) =>
          artifacts[runs.findIndex(item => item.id === run.id)]
      );
      results.push(expectError(
        "recovery cannot omit one policy-matching failed run",
        "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_RUN_SET_MISMATCH",
        () => store.resolve({
          ...fixture.options,
          initialBootstrapFailureValidator: () => true
        })
      ));
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const run = makeBlockedRun(
        fixture,
        8021,
        82,
        "2026-07-27T01:20:00.000Z"
      );
      const artifact = makeBlockedArtifact(
        run,
        root,
        "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
        5
      );
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [run],
        () => {
          throw new GitHubReleaseCheckpointStoreError(
            "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
            "fixture initial artifact has no checkpoint"
          );
        },
        () => recoveryCurrentRun(
          fixture,
          fixture.headSha
        ),
        () => artifact
      );
      results.push(expectError(
        "missing committed recovery never falls back to repository bootstrap",
        "GITHUB_RELEASE_CHECKPOINT_FILE_MISSING",
        () => store.resolve({
          ...fixture.options,
          initialBootstrapFailureValidator: () => true
        })
      ));
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const run = makeBlockedRun(
        fixture,
        8031,
        82,
        "2026-07-27T01:20:00.000Z"
      );
      const artifact = makeBlockedArtifact(
        run,
        root,
        "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
        6
      );
      const committed = commitRecoveryFixture(
        fixture,
        root,
        [run],
        [artifact]
      );
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [run],
        () => {
          throw new GitHubReleaseCheckpointStoreError(
            "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
            "fixture initial artifact has no checkpoint"
          );
        },
        () => recoveryCurrentRun(
          fixture,
          committed.currentHeadSha,
          { status: "completed" }
        ),
        () => artifact
      );
      results.push(expectError(
        "recovery cannot run from an offline or completed workflow attempt",
        "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_CURRENT_RUN_INVALID",
        () => store.resolve({
          ...fixture.options,
          initialBootstrapFailureValidator: () => true
        })
      ));
    } finally {
      fixture.cleanup();
    }
  }

  {
    const fixture = makeStoreFixture(root);
    try {
      const run = makeBlockedRun(
        fixture,
        8041,
        82,
        "2026-07-27T01:20:00.000Z"
      );
      const artifact = makeBlockedArtifact(
        run,
        root,
        "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
        7
      );
      const committed = commitRecoveryFixture(
        fixture,
        root,
        [run],
        [artifact]
      );
      const store = new FixtureCheckpointStore(
        fixture.repositoryRoot,
        [run],
        () => {
          throw new GitHubReleaseCheckpointStoreError(
            "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_CONTENT_INVALID",
            "fixture initial artifact has no checkpoint"
          );
        },
        () => recoveryCurrentRun(
          fixture,
          committed.currentHeadSha
        ),
        () => artifact
      );
      results.push(expectError(
        "expired initial recovery is never renewed from repository state",
        "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_AUTHORITY_INVALID",
        () => store.resolve({
          ...fixture.options,
          now: "2026-07-27T02:30:00.000Z",
          initialBootstrapFailureValidator: () => true
        })
      ));
    } finally {
      fixture.cleanup();
    }
  }

  results.push(expectError(
    "archive traversal paths are rejected before extraction",
    "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_PATH_INVALID",
    () => assertSafeArchiveEntries(
      "github-release-trust-checkpoint.json\n../outside.json\n"
    )
  ));
  results.push(expectError(
    "archive member names cannot inject unzip options",
    "GITHUB_RELEASE_CHECKPOINT_ARCHIVE_PATH_INVALID",
    () => assertSafeArchiveEntries(
      "-x\noutside.json\n"
    )
  ));

  return {
    valid: results.every(result => result.ok),
    fixture_count: results.length,
    results
  };
}

function main() {
  const report = runFixtures();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  runFixtures
};
