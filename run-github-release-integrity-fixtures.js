#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  ReleaseIntegrityError,
  classifyPolicyInspectionFailure,
  monitorRepository,
  observationDigest,
  policyDigest,
  resolveRepositoryPath,
  validateIntegrityObservationSemantics,
  validateIntegrityPolicySemantics,
  validateRetainedInitialBootstrapFailureArtifact,
  validateRetainedFullObservationArtifact
} = require("./github-release-integrity-monitor");
const { ReleaseAuthorizationError } = require("./github-release-publisher");
const {
  HISTORICAL_VERIFIER_PROFILES,
  independentVerificationDigest
} = require("./github-release-bundle-verifier");
const { validatePayload } = require("./validator-cli-prototype/validate");
const {
  findRuntimeRoot: findCodexRuntimeRoot
} = require("./codex-skills/controls-doctrine-operator/scripts/operate_github_release_integrity");
const {
  findRuntimeRoot: findClaudeRuntimeRoot
} = require("./.claude/skills/controls-doctrine-operator/scripts/operate_github_release_integrity");
const {
  checkpointDigest,
  initializeGitHubReleaseTrustCheckpoint
} = require("./github-release-trust-checkpoint");

const BASELINE_SHA = "38109f7b7a6d46fe9ddbc11724f140792ec54725";
const FUTURE_SHA = "f96972ce1c11fdb8eaa556257fde962a363dffde";
const ACTIVATION_SHA = "28ffca6616b245fc56450235fe54802a49458286";
const OBSERVED_AT = "2026-07-27T12:00:00.000Z";
const RAW_RELEASE_VERIFICATION = JSON.parse(fs.readFileSync(
  path.join(
    __dirname,
    "github-release-independent-verification-fixtures",
    "cli-v2.93.0-release-verification.json"
  ),
  "utf8"
));
const TRUSTED_ROOT = JSON.parse(fs.readFileSync(
  path.join(
    __dirname,
    "github-release-independent-verification-fixtures",
    "github-trusted-root.json"
  ),
  "utf8"
));

function runGit(repositoryRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function makePolicy(options = {}) {
  const policy = {
    schema_version: "0.3",
    type: "GitHubReleaseIntegrityPolicy",
    id: "GRIP-fixture-20260727",
    repository: {
      full_name: "cli/cli",
      default_branch: "main",
      visibility: "PUBLIC"
    },
    activation: {
      receipt_id: "GRIR-fixture-activation",
      receipt_sha256:
        "db1195f627134148e016f30317e2d7d51e491d1469ac8ca6d1de8a29daff363d",
      activation_commit_sha:
        options.activationCommitSha || ACTIVATION_SHA,
      activated_at: "2026-07-27T10:00:00.000Z",
      future_releases_only: true
    },
    immutable_release_policy: {
      api_version: "2026-03-10",
      endpoint: "/repos/cli/cli/immutable-releases",
      expected_enabled: true
    },
    grandfathered_releases: [
      {
        tag_name: "v2.92.1",
        commit_sha: BASELINE_SHA,
        published_at: "2026-07-27T09:00:00.000Z",
        expected_immutable: false,
        attestation_required: false
      }
    ],
    attestation_policy: {
      required_for_non_grandfathered: true,
      verifier_tool: "gh",
      minimum_verifier_version: "2.93.0",
      output_format: "json",
      statement_type: "https://in-toto.io/Statement/v1",
      predicate_type: "https://in-toto.io/attestation/release/v0.2",
      signer_identity: "https://dotcom.releases.github.com",
      source_archives_in_scope: false,
      independent_verification_required: true,
      independent_verifier_package: "@sigstore/verify",
      minimum_independent_verifier_version: "4.1.0",
      trusted_root_tuf_mirror: "https://tuf-repo.github.com",
      trusted_root_bootstrap_path:
        ".github/tuf/github-release-root.json",
      maximum_trusted_root_age_seconds: 86400
    },
    monitoring: {
      cadence_minutes: 360,
      maximum_release_count: 100,
      attestation_retry_attempts: 2,
      attestation_retry_interval_seconds: 1,
      fail_closed_on_credential_unavailable: true,
      fail_closed_on_policy_drift: true,
      fail_closed_on_attestation_failure: true
    },
    trust_checkpoint_policy: {
      required: true,
      continuity_mode: "github_actions_artifact_chain",
      bootstrap_checkpoint_path:
        ".github/tuf/github-release-trust-checkpoint.json",
      bootstrap_trusted_root_path:
        ".github/tuf/github-release-trust-bootstrap-root.json",
      workflow_path: ".github/workflows/release-integrity.yml",
      artifact_name_prefix: "release-integrity-",
      checkpoint_file_name:
        "github-release-trust-checkpoint.json",
      trusted_root_file_name: "github-trusted-root.json",
      full_observation_file_name: "full-observation.json",
      maximum_checkpoint_age_seconds: 43200,
      bootstrap_window_seconds: 14400,
      maximum_run_history: 100,
      fail_closed_on_missing_previous: true,
      independent_persistence_required: false
    },
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      monitoring_authorized: true,
      repository_policy_change_authorized: false,
      release_authorized: false
    },
    repository_policy_change_authorized: false,
    release_authorized: false
  };
  policy.policy_sha256 = policyDigest(policy);
  return policy;
}

class FakeIntegrityAdapter {
  constructor(repositoryRoot) {
    this.repositoryRoot = repositoryRoot;
    this.clock = OBSERVED_AT;
    this.policyEnabled = true;
    this.policyError = null;
    this.attestationCommitDrift = false;
    this.attestationUnavailable = false;
    this.repositoryStateDrift = false;
    this.sleepCalls = [];
    this.tags = new Map([
      ["v2.92.1", BASELINE_SHA],
      ["v2.93.0", FUTURE_SHA]
    ]);
    this.releases = [
      {
        tagName: "v2.93.0",
        name: "GitHub CLI 2.93.0",
        isDraft: false,
        isPrerelease: false,
        isLatest: true,
        isImmutable: true,
        publishedAt: "2026-07-27T10:10:00.000Z"
      },
      {
        tagName: "v2.92.1",
        name: "GitHub CLI 2.92.1",
        isDraft: false,
        isPrerelease: false,
        isLatest: false,
        isImmutable: false,
        publishedAt: "2026-07-27T09:00:00.000Z"
      }
    ];
  }

  now() {
    return this.clock;
  }

  sleep(milliseconds) {
    this.sleepCalls.push(milliseconds);
  }

  inspectRepository() {
    return {
      root: this.repositoryRoot,
      branch: "main",
      head_sha: FUTURE_SHA,
      origin_default_branch_sha: this.repositoryStateDrift
        ? BASELINE_SHA
        : FUTURE_SHA,
      clean: true,
      full_name: "cli/cli",
      origin_full_name: "cli/cli",
      default_branch: "main",
      visibility: "PUBLIC",
      viewer_permission: "READ",
      notes_tracked: () => false
    };
  }

  inspectIntegrityPolicy() {
    if (this.policyError) throw this.policyError;
    return {
      api_version: "2026-03-10",
      enabled: this.policyEnabled,
      enforced_by_owner: false
    };
  }

  inspectPublishedReleases() {
    return JSON.parse(JSON.stringify(this.releases));
  }

  resolveRemoteTag(tagName) {
    return this.tags.get(tagName) || null;
  }

  inspectReleaseAttestation(repository, tagName) {
    if (this.attestationUnavailable) {
      throw new ReleaseAuthorizationError(
        "GITHUB_RELEASE_ATTESTATION_VERIFY_FAILED",
        "fixture attestation unavailable"
      );
    }
    const rawVerification =
      JSON.parse(JSON.stringify(RAW_RELEASE_VERIFICATION));
    if (this.attestationCommitDrift) {
      const statement = JSON.parse(Buffer.from(
        rawVerification.attestation.bundle.dsseEnvelope.payload,
        "base64"
      ).toString("utf8"));
      statement.subject[0].digest.sha1 = BASELINE_SHA;
      rawVerification.attestation.bundle.dsseEnvelope.payload =
        Buffer.from(JSON.stringify(statement), "utf8")
          .toString("base64");
      rawVerification.verificationResult.statement
        .subject[0].digest.sha1 = BASELINE_SHA;
    }
    return {
      gh_version: "2.93.0",
      raw_verification: rawVerification
    };
  }
}

function makeFixture() {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "cannae-release-integrity-")
  );
  runGit(repositoryRoot, ["init", "-b", "main"]);
  runGit(repositoryRoot, ["config", "user.email", "fixture@example.com"]);
  runGit(repositoryRoot, ["config", "user.name", "Cannae Fixture"]);
  fs.writeFileSync(
    path.join(repositoryRoot, "activation.txt"),
    "immutable release activation\n"
  );
  runGit(repositoryRoot, ["add", "activation.txt"]);
  runGit(repositoryRoot, ["commit", "-m", "fixture activation"]);
  const activationCommitSha = runGit(
    repositoryRoot,
    ["rev-parse", "HEAD"]
  );
  const policyPath = path.join(
    repositoryRoot,
    ".github",
    "release-integrity-policy.json"
  );
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.writeFileSync(
    policyPath,
    `${JSON.stringify(makePolicy({ activationCommitSha }), null, 2)}\n`
  );
  runGit(repositoryRoot, ["add", ".github/release-integrity-policy.json"]);
  runGit(repositoryRoot, ["commit", "-m", "fixture policy"]);
  return {
    repositoryRoot,
    policyPath: ".github/release-integrity-policy.json",
    adapter: new FakeIntegrityAdapter(repositoryRoot)
  };
}

function monitorOptions(fixture, overrides = {}) {
  const previousTrustCheckpoint =
    initializeGitHubReleaseTrustCheckpoint({
      repository: {
        full_name: "cli/cli",
        default_branch: "main"
      },
      trustedRoot: TRUSTED_ROOT,
      evaluatedAt: "2026-07-27T00:05:00.000Z",
      userGrantId: "USER-GRANT-FIXTURE-PHASE-19D",
      grantedAt: "2026-07-27T00:05:00.000Z",
      producer: {
        repository_head_sha: FUTURE_SHA,
        workflow_ref: "none",
        run_id: "bootstrap",
        run_attempt: 0
      }
    });
  return {
    repositoryRoot: fixture.repositoryRoot,
    policyPath: fixture.policyPath,
    scope: "full",
    triggerKind: "schedule",
    actor: "github-actions",
    runId: "12345",
    ref: "refs/heads/main",
    now: OBSERVED_AT,
    trustedRoot: JSON.parse(JSON.stringify(TRUSTED_ROOT)),
    previousTrustCheckpoint,
    previousTrustedRoot:
      JSON.parse(JSON.stringify(TRUSTED_ROOT)),
    checkpointProvenance: {
      source: "repository_bootstrap",
      policy_introduction_commit: FUTURE_SHA,
      policy_introduction_time: "2026-07-27T11:00:00.000Z",
      bootstrap_checkpoint_path:
        ".github/tuf/github-release-trust-checkpoint.json",
      bootstrap_checkpoint_sha256:
        previousTrustCheckpoint.checkpoint_sha256,
      bootstrap_trusted_root_path:
        ".github/tuf/github-release-trust-bootstrap-root.json",
      bootstrap_trusted_root_sha256:
        TRUSTED_ROOT.artifact_sha256
    },
    checkpointProducer: {
      kind: "github_actions",
      repository_head_sha: FUTURE_SHA,
      workflow_ref:
        "cli/cli/.github/workflows/release-integrity.yml@refs/heads/main",
      run_id: "12345",
      run_attempt: 1
    },
    runAttempt: 1,
    ...overrides
  };
}

function retainedArtifact(observation, conclusion = "success") {
  return {
    checkpoint: JSON.parse(JSON.stringify(
      observation.trust_checkpoint_observation.current_checkpoint
    )),
    trusted_root: JSON.parse(JSON.stringify(
      observation.trusted_root_observation.artifact
    )),
    full_observation: JSON.parse(JSON.stringify(observation)),
    provenance: {
      source: "github_actions_artifact",
      run_id: observation.trigger.run_id,
      run_attempt:
        observation.trust_checkpoint_observation
          .current_checkpoint.producer.run_attempt,
      head_sha: observation.repository.observed_head_sha,
      conclusion,
      artifact_id: "54321",
      artifact_name:
        `release-integrity-${observation.trigger.run_id}-1`,
      artifact_digest: `sha256:${"a".repeat(64)}`,
      artifact_created_at: "2026-07-27T12:00:01.000Z",
      artifact_expires_at: "2026-08-26T12:00:01.000Z"
    }
  };
}

function retainedValidationOptions(fixture, requireReady) {
  return {
    repository: "cli/cli",
    defaultBranch: "main",
    workflowPath: ".github/workflows/release-integrity.yml",
    policyPath: fixture.policyPath,
    policyBytes: fs.readFileSync(
      path.join(fixture.repositoryRoot, fixture.policyPath)
    ),
    requireReady
  };
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
      ok: error instanceof ReleaseIntegrityError &&
        error.code === expectedCode,
      detail: `${error.code || error.name}: ${error.message}`
    };
  }
}

function runFixtures() {
  const results = [];

  {
    const unauthorized = classifyPolicyInspectionFailure(
      "gh: Bad credentials (HTTP 401)",
      1
    );
    const forbidden = classifyPolicyInspectionFailure(
      "gh: Resource not accessible by personal access token (HTTP 403)",
      1
    );
    const unavailable = classifyPolicyInspectionFailure(
      "gh: upstream transport failed (HTTP 502)",
      1
    );
    const bareNumber = classifyPolicyInspectionFailure(
      "gh: transfer aborted after 401 bytes",
      1
    );
    const statusContext = classifyPolicyInspectionFailure(
      "gh: request rejected with status 401",
      1
    );
    results.push({
      name: "policy credential diagnostics distinguish 401, 403, bare-number, status-context, and non-credential failures without response text",
      ok:
        unauthorized.code ===
          "GITHUB_RELEASE_POLICY_MONITOR_CREDENTIAL_UNAVAILABLE" &&
        unauthorized.details.http_status === 401 &&
        unauthorized.message.includes("invalid, expired, or malformed") &&
        !unauthorized.message.includes("Bad credentials") &&
        forbidden.code ===
          "GITHUB_RELEASE_POLICY_MONITOR_CREDENTIAL_UNAVAILABLE" &&
        forbidden.details.http_status === 403 &&
        forbidden.message.includes("Administration read") &&
        !forbidden.message.includes("Resource not accessible") &&
        unavailable.code ===
          "GITHUB_RELEASE_POLICY_INSPECTION_FAILED" &&
        unavailable.details.http_status === 502 &&
        !unavailable.message.includes("upstream transport") &&
        bareNumber.code === "GITHUB_RELEASE_POLICY_INSPECTION_FAILED" &&
        bareNumber.details.http_status === undefined &&
        statusContext.code ===
          "GITHUB_RELEASE_POLICY_MONITOR_CREDENTIAL_UNAVAILABLE" &&
        statusContext.details.http_status === 401
    });
  }

  {
    const policy = makePolicy();
    results.push({
      name: "read-only USER policy is digest-bound and schema valid",
      ok: policy.policy_sha256 === policyDigest(policy) &&
        validateIntegrityPolicySemantics(policy).length === 0 &&
        validatePayload(
          policy,
          "github-release-integrity-policy"
        ).valid === true
    });
  }

  {
    const policy = makePolicy();
    policy.attestation_policy.minimum_verifier_version = "2.94.0";
    policy.policy_sha256 = policyDigest(policy);
    results.push({
      name: "policy cannot silently widen the fixed verifier profile",
      ok: validateIntegrityPolicySemantics(policy).some(issue =>
        issue.code ===
          "GITHUB_RELEASE_INTEGRITY_ATTESTATION_POLICY_INVALID") &&
        validatePayload(
          policy,
          "github-release-integrity-policy"
        ).valid === false
    });
  }

  {
    const policy = makePolicy();
    policy.attestation_policy
      .minimum_independent_verifier_version = "4.2.0";
    policy.policy_sha256 = policyDigest(policy);
    results.push({
      name: "policy cannot weaken or substitute the independent verifier",
      ok: validateIntegrityPolicySemantics(policy).some(issue =>
        issue.code ===
          "GITHUB_RELEASE_INTEGRITY_INDEPENDENT_POLICY_INVALID") &&
        validatePayload(
          policy,
          "github-release-integrity-policy"
        ).valid === false
    });
  }

  {
    const fixture = makeFixture();
    const observation = monitorRepository(
      monitorOptions(fixture),
      fixture.adapter
    );
    const artifact = retainedArtifact(observation);
    results.push({
      name: "full monitor verifies policy baseline and future attestation",
      ok: observation.summary.status === "ready" &&
        observation.schema_version === "0.3" &&
        observation.summary.policy_assessment_complete === true &&
        observation.summary.release_count === 2 &&
        observation.summary.grandfathered_count === 1 &&
        observation.summary.post_activation_count === 1 &&
        observation.summary.verified_attestation_count === 1 &&
        observation.summary
          .independently_verified_attestation_count === 1 &&
        observation.trusted_root_observation.status === "verified" &&
        observation.trusted_root_observation.artifact
          .release_authorized === false &&
        observation.trust_checkpoint_observation.status ===
          "verified" &&
        observation.trust_checkpoint_observation
          .current_checkpoint.sequence === 1 &&
        observation.summary
          .trust_checkpoint_continuity_verified === true &&
        observation.releases[1].attestation
          .independent_verification
          .cryptographic_verification_succeeded === true &&
        observation.releases[1].attestation
          .independent_verification.release_authorized === false &&
        observation.policy_ref.committed_at_head === true &&
        /^[a-f0-9]{64}$/.test(
          observation.policy_ref.head_blob_sha256
        ) &&
        observation.repository.branch === "main" &&
        observation.release_authorized === false &&
        observation.repository_policy_change_authorized === false &&
        observation.observation_sha256 === observationDigest(observation) &&
        validateIntegrityObservationSemantics(observation).length === 0 &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true &&
        validateRetainedFullObservationArtifact(
          artifact,
          retainedValidationOptions(fixture, true)
        ) === true
    });

    // Synthetic old-producer wrappers around the real signed public bundle.
    for (const profile of HISTORICAL_VERIFIER_PROFILES) {
      const historical = JSON.parse(JSON.stringify(artifact));
      const retainedObservation = historical.full_observation;
      const evidence = retainedObservation.releases[1].attestation.independent_verification;
      evidence.schema_version = profile.schema_version;
      evidence.verifier.version = profile.version;
      evidence.verifier.module_sha256 = profile.module_sha256;
      evidence.verifier.dependency_lock_sha256 = profile.dependency_lock_sha256;
      evidence.verification_sha256 = independentVerificationDigest(evidence);
      retainedObservation.observation_sha256 = observationDigest(retainedObservation);
      const retainedBytes = JSON.stringify(historical);
      results.push({
        name: `full retained observation replays historical producer ${profile.commit.slice(0, 7)} without mutation`,
        ok: validateRetainedFullObservationArtifact(
          historical, retainedValidationOptions(fixture, true)
        ) === true && JSON.stringify(historical) === retainedBytes
      });

      const unknown = JSON.parse(retainedBytes);
      const unknownEvidence = unknown.full_observation.releases[1].attestation.independent_verification;
      unknownEvidence.verifier.dependency_lock_sha256 = "0".repeat(64);
      unknownEvidence.verification_sha256 = independentVerificationDigest(unknownEvidence);
      unknown.full_observation.observation_sha256 = observationDigest(unknown.full_observation);
      results.push(expectError(
        `retained observation rejects an unknown historical lockfile for ${profile.commit.slice(0, 7)}`,
        "GITHUB_RELEASE_INTEGRITY_SCHEMA_INVALID",
        () => validateRetainedFullObservationArtifact(unknown, retainedValidationOptions(fixture, true))
      ));

      const wrongRun = JSON.parse(retainedBytes);
      wrongRun.provenance.run_id = "99999";
      results.push(expectError(
        `historical producer compatibility preserves provider-run binding for ${profile.commit.slice(0, 7)}`,
        "GITHUB_RELEASE_INTEGRITY_ARTIFACT_BINDING_INVALID",
        () => validateRetainedFullObservationArtifact(wrongRun, retainedValidationOptions(fixture, true))
      ));
    }

    const missingObservation = JSON.parse(
      JSON.stringify(artifact)
    );
    delete missingObservation.full_observation;
    results.push(expectError(
      "checkpoint artifact without its full observation is never release-ready",
      "GITHUB_RELEASE_INTEGRITY_ARTIFACT_INCOMPLETE",
      () => validateRetainedFullObservationArtifact(
        missingObservation,
        retainedValidationOptions(fixture, true)
      )
    ));

    const roundedArtifactTime = JSON.parse(
      JSON.stringify(artifact)
    );
    roundedArtifactTime.provenance.artifact_created_at =
      "2026-07-27T11:59:01.000Z";
    results.push({
      name: "bounded artifact timestamp precision tolerance accepts a 59-second skew",
      ok: validateRetainedFullObservationArtifact(
        roundedArtifactTime,
        retainedValidationOptions(fixture, true)
      ) === true
    });

    const reversedArtifactTime = JSON.parse(
      JSON.stringify(artifact)
    );
    reversedArtifactTime.provenance.artifact_created_at =
      "2026-07-27T11:58:59.000Z";
    results.push(expectError(
      "artifact creation more than 60 seconds before observation is rejected",
      "GITHUB_RELEASE_INTEGRITY_ARTIFACT_BINDING_INVALID",
      () => validateRetainedFullObservationArtifact(
        reversedArtifactTime,
        retainedValidationOptions(fixture, true)
      )
    ));

    const delayedArtifactTime = JSON.parse(
      JSON.stringify(artifact)
    );
    delayedArtifactTime.provenance.artifact_created_at =
      "2026-07-27T12:01:01.000Z";
    results.push(expectError(
      "artifact creation more than 60 seconds after observation is rejected",
      "GITHUB_RELEASE_INTEGRITY_ARTIFACT_BINDING_INVALID",
      () => validateRetainedFullObservationArtifact(
        delayedArtifactTime,
        retainedValidationOptions(fixture, true)
      )
    ));

    const forgedTransition = JSON.parse(
      JSON.stringify(artifact)
    );
    forgedTransition.checkpoint.transition
      .version_deltas.root = 999;
    forgedTransition.checkpoint.checkpoint_sha256 =
      checkpointDigest(forgedTransition.checkpoint);
    forgedTransition.full_observation
      .trust_checkpoint_observation.current_checkpoint =
        JSON.parse(JSON.stringify(
          forgedTransition.checkpoint
        ));
    forgedTransition.full_observation.observation_sha256 =
      observationDigest(forgedTransition.full_observation);
    results.push(expectError(
      "self-rehashed observation cannot forge checkpoint transition replay",
      "GITHUB_RELEASE_INTEGRITY_SCHEMA_INVALID",
      () => validateRetainedFullObservationArtifact(
        forgedTransition,
        retainedValidationOptions(fixture, true)
      )
    ));
  }

  {
    const fixture = makeFixture();
    const observation = monitorRepository(
      monitorOptions(fixture, {
        previousTrustCheckpoint: null,
        previousTrustedRoot: null,
        checkpointProvenance: null,
        trustCheckpointFailure: {
          code: "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_MISSING",
          message: "fixture predecessor artifact missing"
        }
      }),
      fixture.adapter
    );
    results.push({
      name: "missing predecessor artifact blocks without bootstrap fallback",
      ok: observation.summary.status === "blocked" &&
        observation.trust_checkpoint_observation.status ===
          "unavailable" &&
        observation.trust_checkpoint_observation.failure_code ===
          "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_MISSING" &&
        observation.summary
          .trust_checkpoint_continuity_verified === false &&
        observation.issues.some(issue =>
          issue.code ===
            "GITHUB_RELEASE_CHECKPOINT_ARTIFACT_MISSING") &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const fixture = makeFixture();
    const observation = monitorRepository(
      monitorOptions(fixture, {
        previousTrustCheckpoint: null,
        previousTrustedRoot: null,
        checkpointProvenance: null,
        trustCheckpointFailure: {
          code: "GITHUB_RELEASE_TRUST_CHECKPOINT_STALE",
          message: "fixture genesis exceeded its age bound"
        }
      }),
      fixture.adapter
    );
    const artifactName =
      `release-integrity-${observation.trigger.run_id}-1`;
    const artifact = {
      trusted_root: JSON.parse(JSON.stringify(
        observation.trusted_root_observation.artifact
      )),
      full_observation:
        JSON.parse(JSON.stringify(observation)),
      provenance: {
        source: "github_actions_artifact",
        run_id: observation.trigger.run_id,
        run_attempt: 1,
        head_sha: observation.repository.observed_head_sha,
        conclusion: "failure",
        artifact_id: "54322",
        artifact_name: artifactName,
        artifact_digest: `sha256:${"b".repeat(64)}`,
        artifact_created_at:
          "2026-07-27T12:00:01.000Z",
        artifact_expires_at:
          "2026-08-26T12:00:01.000Z"
      }
    };
    const options = {
      ...retainedValidationOptions(fixture, false),
      expectedRun: {
        id: Number(observation.trigger.run_id),
        run_attempt: 1,
        head_sha: observation.repository.observed_head_sha,
        conclusion: "failure",
        path: ".github/workflows/release-integrity.yml",
        status: "completed",
        event: "schedule",
        created_at: "2026-07-27T11:59:00.000Z"
      },
      expectedArtifactName: artifactName
    };
    results.push({
      name: "recoverable initial failure artifact replays one exact blocked observation and root",
      ok: validateRetainedInitialBootstrapFailureArtifact(
        artifact,
        options
      ) === true
    });

    const unknownIssue = JSON.parse(JSON.stringify(artifact));
    unknownIssue.full_observation.issues.push({
      severity: "critical",
      code: "GITHUB_RELEASE_UNKNOWN_RECOVERY_BYPASS",
      scope: "checkpoint",
      message: "fixture unknown issue"
    });
    unknownIssue.full_observation.summary.issue_count += 1;
    unknownIssue.full_observation.observation_sha256 =
      observationDigest(unknownIssue.full_observation);
    results.push(expectError(
      "unknown blocked issue cannot enter initial recovery",
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_ARTIFACT_INVALID",
      () => validateRetainedInitialBootstrapFailureArtifact(
        unknownIssue,
        options
      )
    ));

    const completedArtifact = JSON.parse(JSON.stringify(artifact));
    completedArtifact.checkpoint =
      monitorOptions(fixture).previousTrustCheckpoint;
    results.push(expectError(
      "artifact carrying any checkpoint cannot enter initial recovery",
      "GITHUB_RELEASE_BOOTSTRAP_RECOVERY_ARTIFACT_INVALID",
      () => validateRetainedInitialBootstrapFailureArtifact(
        completedArtifact,
        options
      )
    ));
  }

  {
    const fixture = makeFixture();
    const baseOptions = monitorOptions(fixture);
    const observation = monitorRepository(
      {
        ...baseOptions,
        checkpointProvenance: {
          source: "repository_bootstrap_recovery",
          policy_introduction_commit: FUTURE_SHA,
          policy_introduction_time:
            "2026-07-27T11:00:00.000Z",
          bootstrap_checkpoint_path:
            ".github/tuf/github-release-trust-checkpoint.json",
          bootstrap_checkpoint_sha256:
            baseOptions.previousTrustCheckpoint
              .checkpoint_sha256,
          bootstrap_trusted_root_path:
            ".github/tuf/github-release-trust-bootstrap-root.json",
          bootstrap_trusted_root_sha256:
            TRUSTED_ROOT.artifact_sha256,
          recovery_authorization_path:
            ".github/tuf/github-release-bootstrap-recovery.json",
          recovery_authorization_sha256:
            "c".repeat(64),
          recovery_grant_id:
            "USER-GRANT-FIXTURE-PHASE-19D",
          blocked_run_count: 2
        }
      },
      fixture.adapter
    );
    results.push({
      name: "recovered genesis provenance remains schema-valid and replayable in sequence one",
      ok: observation.trust_checkpoint_observation.status ===
          "verified" &&
        observation.trust_checkpoint_observation.provenance
          .source === "repository_bootstrap_recovery" &&
        validateIntegrityObservationSemantics(observation)
          .length === 0 &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const fixture = makeFixture();
    const observation = monitorRepository(
      monitorOptions(fixture, {
        trustedRoot: null,
        trustedRootFailure: {
          code: "GITHUB_RELEASE_TUF_REFRESH_FAILED",
          message: "fixture TUF refresh failed"
        }
      }),
      fixture.adapter
    );
    results.push({
      name: "trusted-root acquisition failure is retained and fails closed",
      ok: observation.summary.status === "blocked" &&
        observation.summary
          .independently_verified_attestation_count === 0 &&
        observation.trusted_root_observation.status === "unavailable" &&
        observation.trusted_root_observation.failure_code ===
          "GITHUB_RELEASE_TUF_REFRESH_FAILED" &&
        observation.releases[1].attestation.status === "failed" &&
        observation.releases[1].attestation.failure_code ===
          "GITHUB_RELEASE_TUF_REFRESH_FAILED" &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const fixture = makeFixture();
    const policyPath = path.join(
      fixture.repositoryRoot,
      fixture.policyPath
    );
    const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    policy.monitoring.cadence_minutes = 361;
    policy.policy_sha256 = policyDigest(policy);
    fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
    results.push(expectError(
      "working policy cannot replace the exact committed HEAD policy",
      "GITHUB_RELEASE_INTEGRITY_POLICY_NOT_COMMITTED",
      () => monitorRepository(
        monitorOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const fixture = makeFixture();
    fixture.adapter.repositoryStateDrift = true;
    const observation = monitorRepository(
      monitorOptions(fixture),
      fixture.adapter
    );
    results.push({
      name: "stale default-branch checkout cannot report ready",
      ok: observation.summary.status === "blocked" &&
        observation.issues.some(issue =>
          issue.code ===
            "GITHUB_RELEASE_INTEGRITY_REPOSITORY_STATE_DRIFT") &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const repositoryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cannae-release-integrity-path-")
    );
    const outsideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cannae-release-integrity-outside-")
    );
    fs.symlinkSync(
      outsideRoot,
      path.join(repositoryRoot, "observation-link"),
      "dir"
    );
    results.push(expectError(
      "observation output cannot escape through a parent symlink",
      "GITHUB_RELEASE_INTEGRITY_PATH_ESCAPE",
      () => resolveRepositoryPath(
        repositoryRoot,
        "observation-link/result.json",
        false
      )
    ));
  }

  {
    const workflow = fs.readFileSync(
      path.join(
        __dirname,
        ".github",
        "workflows",
        "release-integrity.yml"
      ),
      "utf8"
    );
    results.push({
      name: "release workflow pins immutable default-branch code and runs every main push",
      ok: workflow.includes("actions: read") &&
        workflow.includes("attestations: read") &&
        workflow.includes('EXPECTED_TAG: ${{ github.event.release.tag_name }}') &&
        workflow.includes('--expected-tag "${EXPECTED_TAG}"') &&
        (workflow.match(/--trusted-root-output/g) || []).length === 2 &&
        (workflow.match(/--trust-checkpoint-output/g) || [])
          .length === 2 &&
        (workflow.match(/--run-attempt/g) || []).length === 2 &&
        (workflow.match(/fetch-depth: 0/g) || []).length === 2 &&
        (workflow.match(/ref: \$\{\{ github\.workflow_sha \}\}/g) || [])
          .length === 2 &&
        !workflow.includes("ref: ${{ github.sha }}") &&
        (workflow.match(/git checkout -B main HEAD/g) || [])
          .length === 2 &&
        (workflow.match(
          /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g
        ) || []).length === 2 &&
        (workflow.match(
          /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/g
        ) || []).length === 2 &&
        (workflow.match(
          /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/g
        ) || []).length === 2 &&
        !workflow.includes("@v7") &&
        (workflow.match(
          /github\.workflow_ref == format\('\{0\}\/\.github\/workflows\/release-integrity\.yml@refs\/heads\/main', github\.repository\)/g
        ) || []).length === 2 &&
        workflow.includes("github.event_name != 'release'") &&
        (workflow.match(/node-version: "22\.22\.3"/g) || []).length === 2 &&
        (workflow.match(/npm ci --ignore-scripts/g) || []).length === 2 &&
        (workflow.match(/CANNAE_IMMUTABILITY_MONITOR_TOKEN:/g) || [])
          .length === 1 &&
        workflow.includes("push:") &&
        !workflow.includes("    paths:") &&
        !/--(?:expected-tag|actor|run-id|ref|trigger)[^\n]*\$\{\{/.test(
          workflow
        ) &&
        !/\b(?:actions|contents|attestations): write\b/.test(workflow)
    });
  }

  {
    const fixture = makeFixture();
    fixture.adapter.policyEnabled = false;
    const observation = monitorRepository(
      monitorOptions(fixture),
      fixture.adapter
    );
    const artifact = retainedArtifact(
      observation,
      "failure"
    );
    const predecessorAccepted =
      validateRetainedFullObservationArtifact(
        artifact,
        retainedValidationOptions(fixture, false)
      ) === true;
    let releaseReadyDenied = false;
    try {
      validateRetainedFullObservationArtifact(
        artifact,
        retainedValidationOptions(fixture, true)
      );
    } catch (error) {
      releaseReadyDenied =
        error.code ===
          "GITHUB_RELEASE_INTEGRITY_ARTIFACT_NOT_READY";
    }
    results.push({
      name: "disabled immutable-release policy produces retained blocked drift evidence",
      ok: observation.summary.status === "blocked" &&
        observation.summary.policy_drift_detected === true &&
        observation.issues.some(issue =>
          issue.code === "GITHUB_RELEASE_INTEGRITY_POLICY_DRIFT") &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true &&
        predecessorAccepted &&
        releaseReadyDenied
    });
  }

  {
    const fixture = makeFixture();
    fixture.adapter.policyError = new ReleaseIntegrityError(
      "GITHUB_RELEASE_POLICY_MONITOR_CREDENTIAL_UNAVAILABLE",
      "fixture credential unavailable"
    );
    const observation = monitorRepository(
      monitorOptions(fixture),
      fixture.adapter
    );
    results.push({
      name: "missing Administration read credential fails closed without claiming no drift",
      ok: observation.summary.status === "blocked" &&
        observation.policy_observation.status ===
          "credential_unavailable" &&
        observation.summary.policy_drift_assessed === false &&
        observation.summary.policy_drift_detected === false &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const fixture = makeFixture();
    fixture.adapter.releases[0].isImmutable = false;
    const observation = monitorRepository(
      monitorOptions(fixture),
      fixture.adapter
    );
    results.push({
      name: "mutable post-activation release blocks before attestation acceptance",
      ok: observation.summary.status === "blocked" &&
        observation.releases[1].attestation.status === "failed" &&
        observation.issues.some(issue =>
          issue.code ===
            "GITHUB_RELEASE_INTEGRITY_POST_ACTIVATION_MUTABLE") &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const fixture = makeFixture();
    fixture.adapter.attestationCommitDrift = true;
    const observation = monitorRepository(
      monitorOptions(fixture),
      fixture.adapter
    );
    results.push({
      name: "attestation commit substitution fails after bounded retries",
      ok: observation.summary.status === "blocked" &&
        observation.summary.verified_attestation_count === 0 &&
        fixture.adapter.sleepCalls.length === 1 &&
        observation.issues.some(issue =>
          issue.code === "GITHUB_RELEASE_ATTESTATION_UNAVAILABLE") &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const fixture = makeFixture();
    fixture.adapter.tags.set("v2.92.1", FUTURE_SHA);
    const observation = monitorRepository(
      monitorOptions(fixture),
      fixture.adapter
    );
    results.push({
      name: "grandfathered tag drift is visible and blocked",
      ok: observation.summary.status === "blocked" &&
        observation.issues.some(issue =>
          issue.code ===
            "GITHUB_RELEASE_INTEGRITY_GRANDFATHER_BASELINE_DRIFT") &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const fixture = makeFixture();
    fixture.adapter.releases = fixture.adapter.releases.filter(release =>
      release.tagName !== "v2.92.1");
    const observation = monitorRepository(
      monitorOptions(fixture),
      fixture.adapter
    );
    results.push({
      name: "missing activation-baseline release is blocked",
      ok: observation.summary.status === "blocked" &&
        observation.issues.some(issue =>
          issue.code ===
            "GITHUB_RELEASE_INTEGRITY_GRANDFATHER_RELEASE_MISSING") &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const fixture = makeFixture();
    const observation = monitorRepository(
      monitorOptions(fixture, {
        scope: "release_attestation",
        triggerKind: "release",
        expectedTag: "v2.93.0",
        ref: "refs/tags/v2.93.0"
      }),
      fixture.adapter
    );
    results.push({
      name: "release-event scope verifies one exact attestation without overclaiming policy state",
      ok: observation.summary.status === "ready" &&
        observation.policy_observation.status === "not_requested" &&
        observation.summary.policy_assessment_complete === false &&
        observation.summary.release_count === 1 &&
        observation.summary.verified_attestation_count === 1 &&
        observation.summary
          .independently_verified_attestation_count === 1 &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const fixture = makeFixture();
    const observation = monitorRepository(
      monitorOptions(fixture, {
        scope: "release_attestation",
        triggerKind: "release",
        expectedTag: "v9.9.9",
        ref: "refs/tags/v9.9.9"
      }),
      fixture.adapter
    );
    results.push({
      name: "release event for an absent tag is retained as blocked evidence",
      ok: observation.summary.status === "blocked" &&
        observation.issues.some(issue =>
          issue.code ===
            "GITHUB_RELEASE_INTEGRITY_EXPECTED_RELEASE_MISSING") &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
    });
  }

  {
    const fixture = makeFixture();
    const policyPath = path.join(
      fixture.repositoryRoot,
      fixture.policyPath
    );
    const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    policy.authority.release_authorized = true;
    policy.release_authorized = true;
    policy.policy_sha256 = policyDigest(policy);
    fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
    results.push(expectError(
      "monitor policy cannot be repaired into release authority",
      "GITHUB_RELEASE_INTEGRITY_POLICY_AUTHORITY_DRIFT",
      () => monitorRepository(
        monitorOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const expectedRoot = fs.realpathSync(__dirname);
    results.push({
      name: "Codex and Claude integrity wrappers resolve the same runtime",
      ok: fs.realpathSync(findCodexRuntimeRoot()) === expectedRoot &&
        fs.realpathSync(findClaudeRuntimeRoot()) === expectedRoot
    });
  }

  return results;
}

const results = runFixtures();
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok && result.detail) console.log(`  ${result.detail}`);
}
const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
