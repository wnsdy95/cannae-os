#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  ReleaseAuthorizationError,
  authorizationDigest,
  authorizeRelease,
  publishAuthorizedRelease,
  receiptDigest,
  userGrantDigest,
  validateAuthorizationSemantics,
  validateReceiptSemantics
} = require("./github-release-publisher");
const { validatePayload } = require("./validator-cli-prototype/validate");
const {
  findRuntimeRoot: findCodexRuntimeRoot
} = require("./codex-skills/controls-doctrine-operator/scripts/operate_github_release");
const {
  findRuntimeRoot: findClaudeRuntimeRoot
} = require("./.claude/skills/controls-doctrine-operator/scripts/operate_github_release");
const {
  advanceGitHubReleaseTrustCheckpoint,
  checkpointDigest,
  initializeGitHubReleaseTrustCheckpoint
} = require("./github-release-trust-checkpoint");
const {
  trustedRootArtifactDigest
} = require("./github-release-trusted-root");

const TARGET_SHA = "f96972ce1c11fdb8eaa556257fde962a363dffde";
const PREVIOUS_SHA = "38109f7b7a6d46fe9ddbc11724f140792ec54725";
const ISSUED_AT = "2026-07-27T00:00:00.000Z";
const RELEASE_TAG = "v2.93.0";
const TRUSTED_ROOT_RELATIVE_PATH =
  ".cannae/release-integrity/github-trusted-root.json";
const TRUST_CHECKPOINT_RELATIVE_PATH =
  ".cannae/release-integrity/github-trust-checkpoint.json";
const RAW_RELEASE_VERIFICATION = JSON.parse(fs.readFileSync(
  path.join(
    __dirname,
    "github-release-independent-verification-fixtures",
    "cli-v2.93.0-release-verification.json"
  ),
  "utf8"
));

class FakeReleaseAdapter {
  constructor(repositoryRoot) {
    this.repositoryRoot = repositoryRoot;
    this.clock = ISSUED_AT;
    this.createCalls = [];
    this.forceCreatedReleaseMutable = false;
    this.forceAttestationUnavailable = false;
    this.forceAttestationCommitDrift = false;
    this.forceAttestationEnvelopeDrift = false;
    this.sleepCalls = [];
    this.tags = new Map();
    this.releases = new Map();
    this.releaseImmutability = {
      api_version: "2026-03-10",
      enabled: true,
      enforced_by_owner: false
    };
    this.repository = {
      root: repositoryRoot,
      branch: "main",
      head_sha: TARGET_SHA,
      origin_default_branch_sha: TARGET_SHA,
      clean: true,
      full_name: "cli/cli",
      origin_full_name: "cli/cli",
      default_branch: "main",
      visibility: "PUBLIC",
      viewer_permission: "ADMIN",
      notes_tracked: relativePath =>
        relativePath === "docs/releases/v2.93.0.md"
    };
    this.run = {
      databaseId: 30202562268,
      workflowName: "Validate",
      name: "Doctrine and runtime checks",
      event: "push",
      status: "completed",
      conclusion: "success",
      headBranch: "main",
      headSha: TARGET_SHA,
      url: "https://github.com/cli/cli/actions/runs/30202562268",
      jobs: [
        {
          databaseId: 89794946579,
          name: "Doctrine and runtime checks",
          status: "completed",
          conclusion: "success",
          url: "https://github.com/cli/cli/actions/runs/30202562268/job/89794946579"
        }
      ]
    };
    this.previousRelease = {
      tag_name: "v2.92.1",
      commit_sha: PREVIOUS_SHA,
      published_at: "2026-06-25T05:06:43Z"
    };
  }

  now() {
    return this.clock;
  }

  sleep(milliseconds) {
    this.sleepCalls.push(milliseconds);
  }

  inspectGhVersion() {
    return "2.93.0";
  }

  inspectRepository() {
    return { ...this.repository };
  }

  inspectRun() {
    return { ...this.run };
  }

  inspectReleaseImmutability() {
    return { ...this.releaseImmutability };
  }

  resolveRemoteTag(tagName) {
    if (tagName === this.previousRelease.tag_name) return this.previousRelease.commit_sha;
    return this.tags.get(tagName) || null;
  }

  inspectLatestRelease() {
    const latest = [...this.releases.values()].find(release => release.latest === true);
    if (latest) {
      return {
        tag_name: latest.tagName,
        commit_sha: this.tags.get(latest.tagName),
        published_at: latest.publishedAt
      };
    }
    return { ...this.previousRelease };
  }

  inspectRelease(repository, tagName) {
    const release = this.releases.get(tagName);
    return release ? { ...release } : null;
  }

  isLatestRelease(repository, tagName) {
    const listing = this.inspectReleaseListing(repository, tagName);
    return Boolean(listing && listing.latest);
  }

  inspectReleaseListing(repository, tagName) {
    const release = this.releases.get(tagName);
    return release ? {
      latest: release.latest === true,
      immutable: release.immutable === true
    } : null;
  }

  inspectReleaseAttestation(repository, tagName) {
    if (this.forceAttestationUnavailable) {
      throw new ReleaseAuthorizationError(
        "GITHUB_RELEASE_ATTESTATION_VERIFY_FAILED",
        "fixture attestation unavailable"
      );
    }
    const release = this.releases.get(tagName);
    if (!release) {
      throw new ReleaseAuthorizationError(
        "GITHUB_RELEASE_ATTESTATION_VERIFY_FAILED",
        "fixture release missing"
      );
    }
    const rawVerification =
      JSON.parse(JSON.stringify(RAW_RELEASE_VERIFICATION));
    const envelopeStatement = JSON.parse(Buffer.from(
      rawVerification.attestation.bundle.dsseEnvelope.payload,
      "base64"
    ).toString("utf8"));
    if (this.forceAttestationCommitDrift) {
      envelopeStatement.subject[0].digest.sha1 = PREVIOUS_SHA;
      rawVerification.verificationResult.statement
        .subject[0].digest.sha1 = PREVIOUS_SHA;
    }
    if (this.forceAttestationEnvelopeDrift) {
      envelopeStatement.predicate.tag = "v9.9.9";
    }
    rawVerification.attestation.bundle.dsseEnvelope.payload =
      Buffer.from(JSON.stringify(envelopeStatement), "utf8")
        .toString("base64");
    return {
      gh_version: "2.93.0",
      raw_verification: rawVerification
    };
  }

  createRelease(repository, target, notesAbsolutePath) {
    this.createCalls.push({
      repository,
      target: JSON.parse(JSON.stringify(target)),
      notesAbsolutePath
    });
    this.tags.set(target.tag_name, target.commit_sha);
    for (const release of this.releases.values()) release.latest = false;
    this.releases.set(target.tag_name, {
      apiUrl: "https://api.github.com/repos/cli/cli/releases/200000001",
      body: fs.readFileSync(notesAbsolutePath, "utf8"),
      databaseId: 200000001,
      id: "RE_kwDOCannae4Ltest",
      isDraft: false,
      isPrerelease: false,
      latest: true,
      immutable: this.releaseImmutability.enabled === true &&
        this.forceCreatedReleaseMutable !== true,
      name: target.release_name,
      publishedAt: "2026-07-27T00:05:00.000Z",
      tagName: target.tag_name,
      targetCommitish: target.commit_sha,
      url: "https://github.com/cli/cli/releases/tag/v2.93.0"
    });
    this.clock = "2026-07-27T00:05:01.000Z";
    return "https://github.com/cli/cli/releases/tag/v2.93.0";
  }
}

function makeFixture() {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-release-"));
  const notesDirectory = path.join(repositoryRoot, "docs", "releases");
  fs.mkdirSync(notesDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(notesDirectory, "v2.93.0.md"),
    "# GitHub CLI 2.93.0\n\nExact release fixture notes.\n"
  );
  const trustedRootPath = path.join(
    repositoryRoot,
    TRUSTED_ROOT_RELATIVE_PATH
  );
  fs.mkdirSync(path.dirname(trustedRootPath), { recursive: true });
  fs.copyFileSync(
    path.join(
      __dirname,
      "github-release-independent-verification-fixtures",
      "github-trusted-root.json"
    ),
    trustedRootPath
  );
  const trustedRoot = JSON.parse(fs.readFileSync(
    trustedRootPath,
    "utf8"
  ));
  const trustCheckpointPath = path.join(
    repositoryRoot,
    TRUST_CHECKPOINT_RELATIVE_PATH
  );
  const genesisCheckpoint = initializeGitHubReleaseTrustCheckpoint({
    repository: {
      full_name: "cli/cli",
      default_branch: "main"
    },
    trustedRoot,
    evaluatedAt: ISSUED_AT,
    userGrantId: "USER-GRANT-PHASE-19D-FIXTURE",
    grantedAt: ISSUED_AT,
    producer: {
      repository_head_sha: TARGET_SHA,
      workflow_ref: "none",
      run_id: "local",
      run_attempt: 0
    }
  });
  const trustCheckpoint = advanceGitHubReleaseTrustCheckpoint({
    repository: {
      full_name: "cli/cli",
      default_branch: "main"
    },
    previousCheckpoint: genesisCheckpoint,
    previousTrustedRoot: trustedRoot,
    trustedRoot,
    evaluatedAt: ISSUED_AT,
    producer: {
      kind: "github_actions",
      repository_head_sha: TARGET_SHA,
      workflow_ref:
        "cli/cli/.github/workflows/release-integrity.yml@refs/heads/main",
      run_id: "41001",
      run_attempt: 1
    }
  });
  fs.writeFileSync(
    trustCheckpointPath,
    `${JSON.stringify(trustCheckpoint, null, 2)}\n`
  );
  const checkpointStore = {
    resolveCalls: [],
    artifact: {
      checkpoint: trustCheckpoint,
      trusted_root: trustedRoot,
      full_observation: {
        fixture_status: "ready"
      },
      provenance: {
        source: "github_actions_artifact",
        run_id: "41001",
        run_attempt: 1,
        head_sha: TARGET_SHA,
        conclusion: "success",
        artifact_id: "51001",
        artifact_name: "release-integrity-41001-1",
        artifact_digest: `sha256:${"a".repeat(64)}`,
        artifact_created_at: "2026-07-26T23:59:00.000Z",
        artifact_expires_at: "2026-08-26T23:59:00.000Z"
      }
    },
    resolve(options) {
      this.resolveCalls.push(JSON.parse(JSON.stringify(options)));
      return JSON.parse(JSON.stringify(this.artifact));
    }
  };
  const integrityPolicyContext = {
    policyBytes: Buffer.from("{}", "utf8"),
    policy: {
      repository: {
        full_name: "cli/cli",
        default_branch: "main"
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
        maximum_run_history: 100,
        bootstrap_window_seconds: 14400
      }
    }
  };
  const integrityObservationValidator = artifact => {
    if (!artifact ||
        !artifact.full_observation ||
        artifact.full_observation.fixture_status !== "ready") {
      const error = new Error(
        "Fixture full-monitor observation is not ready."
      );
      error.code =
        "GITHUB_RELEASE_INTEGRITY_ARTIFACT_NOT_READY";
      throw error;
    }
    return true;
  };
  return {
    repositoryRoot,
    adapter: new FakeReleaseAdapter(repositoryRoot),
    checkpointStore,
    integrityPolicyContext,
    integrityObservationValidator,
    trustCheckpoint,
    trustedRoot,
    genesisCheckpoint,
    authorizationPath: path.join(
      repositoryRoot,
      ".cannae",
      "releases",
      "v2.93.0",
      "authorization.json"
    )
  };
}

function authorizationOptions(fixture) {
  return {
    repositoryRoot: fixture.repositoryRoot,
    repository: "cli/cli",
    tagName: RELEASE_TAG,
    releaseName: "GitHub CLI 2.93.0",
    notesPath: "docs/releases/v2.93.0.md",
    runId: 30202562268,
    grantId: "UGR-v2_93_0",
    expiresInMinutes: 30,
    now: ISSUED_AT,
    trustedRootPath: TRUSTED_ROOT_RELATIVE_PATH,
    trustCheckpointPath: TRUST_CHECKPOINT_RELATIVE_PATH,
    checkpointStore: fixture.checkpointStore,
    integrityPolicyContext: fixture.integrityPolicyContext,
    integrityObservationValidator:
      fixture.integrityObservationValidator
  };
}

function publicationOptions(fixture) {
  return {
    repositoryRoot: fixture.repositoryRoot,
    authorizationPath: fixture.authorizationPath,
    trustedRootPath: TRUSTED_ROOT_RELATIVE_PATH,
    trustCheckpointPath: TRUST_CHECKPOINT_RELATIVE_PATH,
    checkpointStore: fixture.checkpointStore,
    integrityPolicyContext: fixture.integrityPolicyContext,
    integrityObservationValidator:
      fixture.integrityObservationValidator
  };
}

function persistAuthorization(fixture, authorization) {
  fs.mkdirSync(path.dirname(fixture.authorizationPath), { recursive: true });
  fs.writeFileSync(fixture.authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`);
}

function expectError(name, expectedCode, callback) {
  try {
    callback();
    return { name, ok: false, detail: `expected ${expectedCode}, operation succeeded` };
  } catch (error) {
    return {
      name,
      ok: error instanceof ReleaseAuthorizationError && error.code === expectedCode,
      detail: `${error.code || error.name}: ${error.message}`
    };
  }
}

function runFixtures() {
  const results = [];

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    const schema = validatePayload(authorization, "github-release-authorization");
    results.push({
      name: "exact USER grant creates one valid release_authorized true terminal authorization",
      ok: authorization.release_authorized === true &&
        authorization.authority.release_authorized === true &&
        authorization.trust_checkpoint.sequence === 1 &&
        authorization.trust_checkpoint.lineage_artifact.run_id ===
          "41001" &&
        fixture.checkpointStore.resolveCalls.length === 1 &&
        authorization.authorization_sha256 === authorizationDigest(authorization) &&
        validateAuthorizationSemantics(authorization).length === 0 &&
        schema.valid === true
    });
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    const foreignWorkflow = JSON.parse(JSON.stringify(
      authorization
    ));
    foreignWorkflow.trust_checkpoint.lineage_artifact.workflow_ref =
      "attacker/repository/.github/workflows/release-integrity.yml@refs/heads/main";
    foreignWorkflow.authorization_sha256 =
      authorizationDigest(foreignWorkflow);
    const unrelatedArtifact = JSON.parse(JSON.stringify(
      authorization
    ));
    unrelatedArtifact.trust_checkpoint.lineage_artifact
      .artifact_name = "unrelated";
    unrelatedArtifact.authorization_sha256 =
      authorizationDigest(unrelatedArtifact);
    results.push({
      name: "standalone authorization semantics bind exact monitor workflow and artifact name",
      ok: validateAuthorizationSemantics(
        foreignWorkflow
      ).some(issue =>
        issue.code ===
          "GITHUB_RELEASE_TRUST_CHECKPOINT_POLICY_INVALID") &&
        validateAuthorizationSemantics(
          unrelatedArtifact
        ).some(issue =>
          issue.code ===
            "GITHUB_RELEASE_TRUST_CHECKPOINT_POLICY_INVALID")
    });
  }

  {
    const fixture = makeFixture();
    fixture.checkpointStore.artifact.full_observation
      .fixture_status = "blocked";
    const result = expectError(
      "blocked full-monitor observation cannot enter release authorization",
      "GITHUB_RELEASE_INTEGRITY_ARTIFACT_NOT_READY",
      () => authorizeRelease(
        authorizationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok &&
      fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const localCheckpoint = advanceGitHubReleaseTrustCheckpoint({
      repository: {
        full_name: "cli/cli",
        default_branch: "main"
      },
      previousCheckpoint: fixture.genesisCheckpoint,
      previousTrustedRoot: fixture.trustedRoot,
      trustedRoot: fixture.trustedRoot,
      evaluatedAt: ISSUED_AT,
      producer: {
        kind: "local_operator",
        repository_head_sha: TARGET_SHA,
        workflow_ref: "none",
        run_id: "local",
        run_attempt: 0
      }
    });
    fs.writeFileSync(
      path.join(
        fixture.repositoryRoot,
        TRUST_CHECKPOINT_RELATIVE_PATH
      ),
      `${JSON.stringify(localCheckpoint, null, 2)}\n`
    );
    fixture.checkpointStore.artifact.checkpoint = localCheckpoint;
    const result = expectError(
      "a locally produced non-genesis checkpoint cannot enter release quorum",
      "GITHUB_RELEASE_LINEAGE_ARTIFACT_MISMATCH",
      () => authorizeRelease(
        authorizationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok && fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const malformed = JSON.parse(JSON.stringify(
      fixture.trustCheckpoint
    ));
    malformed.predecessor.policy_override = "allow-release";
    malformed.checkpoint_sha256 = checkpointDigest(malformed);
    fs.writeFileSync(
      path.join(
        fixture.repositoryRoot,
        TRUST_CHECKPOINT_RELATIVE_PATH
      ),
      `${JSON.stringify(malformed, null, 2)}\n`
    );
    fixture.checkpointStore.artifact.checkpoint = malformed;
    const result = expectError(
      "nested checkpoint schema drift is denied before artifact lookup or release creation",
      "RELEASE_DOCUMENT_SCHEMA_INVALID",
      () => authorizeRelease(
        authorizationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok &&
      fixture.checkpointStore.resolveCalls.length === 0 &&
      fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    const rootPath = path.join(
      fixture.repositoryRoot,
      TRUSTED_ROOT_RELATIVE_PATH
    );
    const trustedRoot = JSON.parse(fs.readFileSync(
      rootPath,
      "utf8"
    ));
    trustedRoot.policy_override = "allow-release";
    trustedRoot.artifact_sha256 =
      trustedRootArtifactDigest(trustedRoot);
    fs.writeFileSync(
      rootPath,
      `${JSON.stringify(trustedRoot, null, 2)}\n`
    );
    const result = expectError(
      "schema-invalid trusted root is denied before immutable publication",
      "RELEASE_DOCUMENT_SCHEMA_INVALID",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok &&
      fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    authorization.release_attestation.minimum_verifier_version = "2.94.0";
    authorization.authorization_sha256 =
      authorizationDigest(authorization);
    results.push({
      name: "authorization cannot widen the fixed release-attestation profile",
      ok: validateAuthorizationSemantics(authorization).some(issue =>
        issue.code === "GITHUB_RELEASE_ATTESTATION_POLICY_INVALID") &&
        validatePayload(
          authorization,
          "github-release-authorization"
        ).valid === false
    });
  }

  {
    const fixture = makeFixture();
    fixture.adapter.repository.clean = false;
    results.push(expectError(
      "dirty worktree blocks authorization",
      "RELEASE_REPOSITORY_DIRTY",
      () => authorizeRelease(authorizationOptions(fixture), fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fixture.adapter.forceAttestationEnvelopeDrift = true;
    results.push(expectError(
      "DSSE payload and verification-result statement cannot diverge",
      "GITHUB_RELEASE_ATTESTATION_UNAVAILABLE",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const fixture = makeFixture();
    fixture.adapter.releaseImmutability.enabled = false;
    results.push(expectError(
      "disabled repository release immutability blocks future authorization",
      "RELEASE_IMMUTABILITY_NOT_ENABLED",
      () => authorizeRelease(authorizationOptions(fixture), fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    fixture.adapter.run.headSha = PREVIOUS_SHA;
    results.push(expectError(
      "successful CI for a different commit blocks authorization",
      "MAIN_VALIDATION_MISMATCH",
      () => authorizeRelease(authorizationOptions(fixture), fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    fixture.adapter.run.jobs[0].conclusion = "failure";
    results.push(expectError(
      "failed required check blocks authorization even when the workflow reports success",
      "MAIN_VALIDATION_MISMATCH",
      () => authorizeRelease(authorizationOptions(fixture), fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    fixture.adapter.repository.full_name = "attacker/cannae-os";
    results.push(expectError(
      "foreign repository substitution blocks authorization",
      "REPOSITORY_IDENTITY_MISMATCH",
      () => authorizeRelease(authorizationOptions(fixture), fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    fixture.adapter.repository.origin_full_name = "attacker/cannae-os";
    results.push(expectError(
      "foreign Git origin substitution blocks authorization",
      "ORIGIN_REPOSITORY_MISMATCH",
      () => authorizeRelease(authorizationOptions(fixture), fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fixture.adapter.clock = "2026-07-27T00:31:00.000Z";
    results.push(expectError(
      "expired authorization cannot publish",
      "GITHUB_RELEASE_AUTHORIZATION_EXPIRED",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    authorization.schema_version = "0.4";
    delete authorization.trust_checkpoint;
    delete authorization.user_grant.trust_checkpoint_sha256;
    delete authorization.user_grant.trusted_root_artifact_sha256;
    authorization.user_grant.directive_sha256 =
      userGrantDigest(authorization.user_grant);
    authorization.authorization_sha256 =
      authorizationDigest(authorization);
    persistAuthorization(fixture, authorization);
    const result = expectError(
      "legacy authorization cannot downgrade active publication",
      "GITHUB_RELEASE_AUTHORIZATION_VERSION_DOWNGRADE",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok && fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    const rootPath = path.join(
      fixture.repositoryRoot,
      TRUSTED_ROOT_RELATIVE_PATH
    );
    const trustedRoot = JSON.parse(fs.readFileSync(rootPath, "utf8"));
    trustedRoot.source.fetched_at = "2026-07-25T00:00:00.000Z";
    trustedRoot.artifact_sha256 =
      trustedRootArtifactDigest(trustedRoot);
    fs.writeFileSync(
      rootPath,
      `${JSON.stringify(trustedRoot, null, 2)}\n`
    );
    const result = expectError(
      "stale trusted root is denied before immutable publication",
      "GITHUB_RELEASE_TRUST_STALE",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok && fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    fs.unlinkSync(path.join(
      fixture.repositoryRoot,
      TRUSTED_ROOT_RELATIVE_PATH
    ));
    const result = expectError(
      "missing trusted root artifact is denied before immutable publication",
      "GITHUB_RELEASE_TRUSTED_ROOT_MISSING",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok && fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    fs.unlinkSync(path.join(
      fixture.repositoryRoot,
      TRUST_CHECKPOINT_RELATIVE_PATH
    ));
    const result = expectError(
      "missing trust checkpoint is denied before immutable publication",
      "GITHUB_RELEASE_TRUST_CHECKPOINT_MISSING",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok && fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    const rootPath = path.join(
      fixture.repositoryRoot,
      TRUSTED_ROOT_RELATIVE_PATH
    );
    const alternate = initializeGitHubReleaseTrustCheckpoint({
      repository: {
        full_name: "cli/cli",
        default_branch: "main"
      },
      trustedRoot: JSON.parse(fs.readFileSync(rootPath, "utf8")),
      evaluatedAt: ISSUED_AT,
      userGrantId: "USER-GRANT-ALTERNATE-FIXTURE",
      grantedAt: ISSUED_AT,
      producer: {
        repository_head_sha: TARGET_SHA,
        workflow_ref: "none",
        run_id: "local",
        run_attempt: 0
      }
    });
    fs.writeFileSync(
      path.join(
        fixture.repositoryRoot,
        TRUST_CHECKPOINT_RELATIVE_PATH
      ),
      `${JSON.stringify(alternate, null, 2)}\n`
    );
    const result = expectError(
      "a different valid checkpoint cannot replace the USER-authorized checkpoint",
      "GITHUB_RELEASE_LINEAGE_ARTIFACT_MISMATCH",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok && fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const rootPath = path.join(
      fixture.repositoryRoot,
      TRUSTED_ROOT_RELATIVE_PATH
    );
    const trustedRoot = JSON.parse(fs.readFileSync(rootPath, "utf8"));
    const staleAt = "2026-07-26T11:59:59.000Z";
    trustedRoot.source.fetched_at = staleAt;
    trustedRoot.artifact_sha256 =
      trustedRootArtifactDigest(trustedRoot);
    fs.writeFileSync(
      rootPath,
      `${JSON.stringify(trustedRoot, null, 2)}\n`
    );
    const staleCheckpoint = initializeGitHubReleaseTrustCheckpoint({
      repository: {
        full_name: "cli/cli",
        default_branch: "main"
      },
      trustedRoot,
      evaluatedAt: staleAt,
      userGrantId: "USER-GRANT-STALE-FIXTURE",
      grantedAt: staleAt,
      producer: {
        repository_head_sha: TARGET_SHA,
        workflow_ref: "none",
        run_id: "local",
        run_attempt: 0
      }
    });
    fs.writeFileSync(
      path.join(
        fixture.repositoryRoot,
        TRUST_CHECKPOINT_RELATIVE_PATH
      ),
      `${JSON.stringify(staleCheckpoint, null, 2)}\n`
    );
    const result = expectError(
      "a checkpoint older than twelve hours cannot authorize publication",
      "GITHUB_RELEASE_TRUST_CHECKPOINT_STALE",
      () => authorizeRelease(
        authorizationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok && fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    const options = publicationOptions(fixture);
    delete options.trustCheckpointPath;
    const result = expectError(
      "publication cannot substitute or omit an authorized trust path",
      "GITHUB_RELEASE_TRUST_CHECKPOINT_PATH_MISMATCH",
      () => publishAuthorizedRelease(options, fixture.adapter)
    );
    result.ok = result.ok && fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    fixture.adapter.clock = "2026-07-27T00:29:59.000Z";
    const originalResolve =
      fixture.checkpointStore.resolve;
    fixture.checkpointStore.resolve = function resolve(options) {
      const artifact = originalResolve.call(this, options);
      if (this.resolveCalls.length === 2) {
        fixture.adapter.clock =
          "2026-07-27T00:31:00.000Z";
      }
      return artifact;
    };
    const result = expectError(
      "authorization expiry during lineage resolution blocks before create",
      "GITHUB_RELEASE_AUTHORIZATION_EXPIRED",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok &&
      fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    const originalResolve =
      fixture.checkpointStore.resolve;
    fixture.checkpointStore.resolve = function resolve(options) {
      const artifact = originalResolve.call(this, options);
      if (this.resolveCalls.length === 2) {
        fixture.adapter.releaseImmutability.enabled = false;
      }
      return artifact;
    };
    const result = expectError(
      "immutability drift during lineage resolution blocks before create",
      "AUTHORIZED_RELEASE_IMMUTABILITY_DRIFT",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok &&
      fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    const externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-release-auth-"));
    const externalAuthorizationPath = path.join(externalDirectory, "authorization.json");
    fs.writeFileSync(
      externalAuthorizationPath,
      `${JSON.stringify(authorization, null, 2)}\n`
    );
    const result = expectError(
      "authorization outside the repository is denied before publication",
      "AUTHORIZATION_PATH_OUTSIDE_REPOSITORY",
      () => publishAuthorizedRelease({
        ...publicationOptions(fixture),
        authorizationPath: externalAuthorizationPath
      }, fixture.adapter)
    );
    result.ok = result.ok && fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fixture.checkpointStore.artifact.provenance.artifact_id =
      "51002";
    fixture.checkpointStore.artifact.provenance.artifact_digest =
      `sha256:${"b".repeat(64)}`;
    const result = expectError(
      "publication re-resolves and rejects changed latest checkpoint artifact lineage",
      "GITHUB_RELEASE_TRUST_CHECKPOINT_AUTHORIZATION_MISMATCH",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    );
    result.ok = result.ok &&
      fixture.checkpointStore.resolveCalls.length === 2 &&
      fixture.adapter.createCalls.length === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fixture.adapter.releaseImmutability.enabled = false;
    results.push(expectError(
      "release-immutability policy drift blocks publication",
      "AUTHORIZED_RELEASE_IMMUTABILITY_DRIFT",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fixture.adapter.forceCreatedReleaseMutable = true;
    results.push(expectError(
      "a newly published mutable release cannot produce a v0.5 receipt",
      "PUBLISHED_RELEASE_MISMATCH",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fs.appendFileSync(
      path.join(fixture.repositoryRoot, "docs", "releases", "v2.93.0.md"),
      "\nTampered after authorization.\n"
    );
    results.push(expectError(
      "release notes tamper blocks publication",
      "AUTHORIZED_RELEASE_NOTES_DRIFT",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    const receipt = publishAuthorizedRelease(
      publicationOptions(fixture),
      fixture.adapter
    );
    const firstCreateCount = fixture.adapter.createCalls.length;
    const replayReceipt = publishAuthorizedRelease(
      publicationOptions(fixture),
      fixture.adapter
    );
    const schema = validatePayload(receipt, "github-release-receipt");
    results.push({
      name: "exact release and GitHub attestation publish once and retry idempotently",
      ok: firstCreateCount === 1 &&
        fixture.adapter.createCalls.length === 1 &&
        receipt.release_authorized === true &&
        receipt.authorization_consumed === true &&
        receipt.schema_version === "0.5" &&
        receipt.release.resolved_tag_commit_sha === TARGET_SHA &&
        receipt.attestation.verification_succeeded === true &&
        receipt.attestation.statement.commit_sha1 === TARGET_SHA &&
        receipt.attestation.statement.repository === "cli/cli" &&
        receipt.trusted_root.release_authorized === false &&
        receipt.trust_checkpoint.release_authorized === false &&
        receipt.trust_checkpoint.checkpoint_sha256 ===
          checkpointDigest(receipt.trust_checkpoint) &&
        receipt.independent_verification
          .cryptographic_verification_succeeded === true &&
        receipt.independent_verification.release_authorized === false &&
        receipt.receipt_sha256 === receiptDigest(receipt) &&
        validateReceiptSemantics(receipt).length === 0 &&
        replayReceipt.release.database_id === receipt.release.database_id &&
        schema.valid === true
    });
    const genesisReceipt = JSON.parse(JSON.stringify(receipt));
    genesisReceipt.trust_checkpoint =
      JSON.parse(JSON.stringify(fixture.genesisCheckpoint));
    genesisReceipt.receipt_sha256 =
      receiptDigest(genesisReceipt);
    results.push({
      name: "standalone v0.5 receipt semantics reject genesis checkpoint substitution",
      ok: validateReceiptSemantics(genesisReceipt).some(issue =>
        issue.code ===
          "GITHUB_RELEASE_RECEIPT_CHECKPOINT_LINEAGE_INVALID")
    });
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fixture.adapter.forceAttestationUnavailable = true;
    results.push(expectError(
      "release without a verifiable GitHub attestation cannot produce a receipt",
      "GITHUB_RELEASE_ATTESTATION_UNAVAILABLE",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    fixture.adapter.forceAttestationUnavailable = true;
    const firstResult = expectError(
      "post-create verification failure retains one exact immutable release",
      "GITHUB_RELEASE_ATTESTATION_UNAVAILABLE",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    );
    fixture.adapter.forceAttestationUnavailable = false;
    fixture.adapter.clock = "2026-07-27T00:31:00.000Z";
    const recovered = publishAuthorizedRelease(
      publicationOptions(fixture),
      fixture.adapter
    );
    firstResult.ok = firstResult.ok &&
      fixture.adapter.createCalls.length === 1 &&
      recovered.verified === true &&
      recovered.release.resolved_tag_commit_sha === TARGET_SHA;
    results.push(firstResult);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fixture.adapter.forceAttestationCommitDrift = true;
    results.push(expectError(
      "attestation for a different commit cannot satisfy the release receipt",
      "GITHUB_RELEASE_ATTESTATION_UNAVAILABLE",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fixture.adapter.tags.set(RELEASE_TAG, PREVIOUS_SHA);
    fixture.adapter.releases.set(RELEASE_TAG, {
      apiUrl: "https://api.github.com/repos/cli/cli/releases/200000001",
      body: fs.readFileSync(
        path.join(
          fixture.repositoryRoot,
          "docs",
          "releases",
          "v2.93.0.md"
        ),
        "utf8"
      ),
      databaseId: 200000001,
      id: "RE_kwDOCannae4Ltest",
      isDraft: false,
      isPrerelease: false,
      latest: true,
      name: "GitHub CLI 2.93.0",
      publishedAt: "2026-07-27T00:05:00.000Z",
      tagName: RELEASE_TAG,
      targetCommitish: PREVIOUS_SHA,
      url: "https://github.com/cli/cli/releases/tag/v2.93.0"
    });
    results.push(expectError(
      "existing release at a different commit cannot satisfy idempotency",
      "PUBLISHED_RELEASE_MISMATCH",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fixture.adapter.tags.set(RELEASE_TAG, TARGET_SHA);
    results.push(expectError(
      "orphan target tag blocks publication",
      "PARTIAL_RELEASE_STATE",
      () => publishAuthorizedRelease(
        publicationOptions(fixture),
        fixture.adapter
      )
    ));
  }

  {
    const validAuthorization = JSON.parse(fs.readFileSync(
      path.join(__dirname, "sample-payloads", "valid-github-release-authorization.json"),
      "utf8"
    ));
    const invalidAuthorization = JSON.parse(fs.readFileSync(
      path.join(__dirname, "sample-payloads", "invalid-github-release-authorization-ai-approval.json"),
      "utf8"
    ));
    const validReceipt = JSON.parse(fs.readFileSync(
      path.join(__dirname, "sample-payloads", "valid-github-release-receipt.json"),
      "utf8"
    ));
    const invalidReceipt = JSON.parse(fs.readFileSync(
      path.join(__dirname, "sample-payloads", "invalid-github-release-receipt-tag-drift.json"),
      "utf8"
    ));
    results.push({
      name: "static valid and adversarial release contracts retain expected validator outcomes",
      ok: validatePayload(validAuthorization, "github-release-authorization").valid === true &&
        validatePayload(invalidAuthorization, "github-release-authorization").valid === false &&
        validatePayload(validReceipt, "github-release-receipt").valid === true &&
        validatePayload(invalidReceipt, "github-release-receipt").valid === false
    });
  }

  {
    const expectedRoot = fs.realpathSync(__dirname);
    results.push({
      name: "Codex and Claude release wrappers resolve the same runtime",
      ok: fs.realpathSync(findCodexRuntimeRoot()) === expectedRoot &&
        fs.realpathSync(findClaudeRuntimeRoot()) === expectedRoot
    });
  }

  {
    const publisherSource = fs.readFileSync(
      path.join(__dirname, "github-release-publisher.js"),
      "utf8"
    );
    const exportsIndex = publisherSource.indexOf("module.exports = {");
    const mainIndex = publisherSource.indexOf("if (require.main === module) main();");
    results.push({
      name: "CLI entry installs publisher exports before validator re-entry",
      ok: exportsIndex >= 0 && mainIndex > exportsIndex
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
