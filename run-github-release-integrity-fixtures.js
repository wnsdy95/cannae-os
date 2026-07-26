#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  ReleaseIntegrityError,
  monitorRepository,
  observationDigest,
  policyDigest,
  resolveRepositoryPath,
  validateIntegrityObservationSemantics,
  validateIntegrityPolicySemantics
} = require("./github-release-integrity-monitor");
const { ReleaseAuthorizationError } = require("./github-release-publisher");
const { validatePayload } = require("./validator-cli-prototype/validate");
const {
  findRuntimeRoot: findCodexRuntimeRoot
} = require("./codex-skills/controls-doctrine-operator/scripts/operate_github_release_integrity");
const {
  findRuntimeRoot: findClaudeRuntimeRoot
} = require("./.claude/skills/controls-doctrine-operator/scripts/operate_github_release_integrity");

const BASELINE_SHA = "38109f7b7a6d46fe9ddbc11724f140792ec54725";
const FUTURE_SHA = "130c09a02a6b03da30564666df46cf26838afee3";
const ACTIVATION_SHA = "28ffca6616b245fc56450235fe54802a49458286";
const OBSERVED_AT = "2026-07-27T12:00:00.000Z";

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
    schema_version: "0.1",
    type: "GitHubReleaseIntegrityPolicy",
    id: "GRIP-fixture-20260727",
    repository: {
      full_name: "wnsdy95/cannae-os",
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
      endpoint: "/repos/wnsdy95/cannae-os/immutable-releases",
      expected_enabled: true
    },
    grandfathered_releases: [
      {
        tag_name: "v0.1.0",
        commit_sha: BASELINE_SHA,
        published_at: "2026-06-25T05:06:43Z",
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
      source_archives_in_scope: false
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
      ["v0.1.0", BASELINE_SHA],
      ["v0.2.0", FUTURE_SHA]
    ]);
    this.releases = [
      {
        tagName: "v0.2.0",
        name: "Cannae OS v0.2.0",
        isDraft: false,
        isPrerelease: false,
        isLatest: true,
        isImmutable: true,
        publishedAt: "2026-07-27T10:10:00.000Z"
      },
      {
        tagName: "v0.1.0",
        name: "Cannae OS v0.1.0",
        isDraft: false,
        isPrerelease: false,
        isLatest: false,
        isImmutable: false,
        publishedAt: "2026-06-25T05:06:43Z"
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
      full_name: "wnsdy95/cannae-os",
      origin_full_name: "wnsdy95/cannae-os",
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
    const commitSha = this.attestationCommitDrift
      ? BASELINE_SHA
      : this.tags.get(tagName);
    const packageUri = `pkg:github/${repository}@${tagName}`;
    const statement = {
      _type: "https://in-toto.io/Statement/v1",
      subject: [
        {
          uri: packageUri,
          digest: { sha1: commitSha }
        },
        {
          name: "cannae-os.txt",
          digest: {
            sha256:
              "40d06bd25e36d85728990018e84f08c8dd633259e5327436f78a1eeec0bde98c"
          }
        }
      ],
      predicateType:
        "https://in-toto.io/attestation/release/v0.2",
      predicate: {
        databaseId: "200000001",
        ownerId: "1000",
        packageId: "2000",
        purl: packageUri,
        repository,
        repositoryId: "2000",
        tag: tagName
      }
    };
    return {
      gh_version: "2.93.0",
      raw_verification: {
        attestation: {
          bundle: {
            mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
            dsseEnvelope: {
              payload: Buffer.from(
                JSON.stringify(statement),
                "utf8"
              ).toString("base64"),
              payloadType: "application/vnd.in-toto+json",
              signatures: [
                { sig: "fixture-signature" }
              ]
            }
          }
        },
        verificationResult: {
          mediaType:
            "application/vnd.dev.sigstore.verificationresult+json;version=0.1",
          signature: {
            certificate: {
              certificateIssuer:
                "CN=Fulcio Intermediate l1,O=GitHub\\, Inc.",
              subjectAlternativeName:
                "https://dotcom.releases.github.com"
            }
          },
          verifiedTimestamps: [
            {
              type: "TimestampAuthority",
              uri: "timestamp.githubapp.com",
              timestamp: "2026-07-27T10:10:01.000Z"
            }
          ],
          statement
        }
      }
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
  return {
    repositoryRoot: fixture.repositoryRoot,
    policyPath: fixture.policyPath,
    scope: "full",
    triggerKind: "schedule",
    actor: "github-actions",
    runId: "12345",
    ref: "refs/heads/main",
    now: OBSERVED_AT,
    ...overrides
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
    const fixture = makeFixture();
    const observation = monitorRepository(
      monitorOptions(fixture),
      fixture.adapter
    );
    results.push({
      name: "full monitor verifies policy baseline and future attestation",
      ok: observation.summary.status === "ready" &&
        observation.summary.policy_assessment_complete === true &&
        observation.summary.release_count === 2 &&
        observation.summary.grandfathered_count === 1 &&
        observation.summary.post_activation_count === 1 &&
        observation.summary.verified_attestation_count === 1 &&
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
      name: "release workflow grants read-only attestation access and avoids shell expression injection",
      ok: workflow.includes("attestations: read") &&
        workflow.includes('EXPECTED_TAG: ${{ github.event.release.tag_name }}') &&
        workflow.includes('--expected-tag "${EXPECTED_TAG}"') &&
        (workflow.match(/fetch-depth: 0/g) || []).length === 2 &&
        (workflow.match(/node-version: "22\.22\.3"/g) || []).length === 2 &&
        (workflow.match(/CANNAE_IMMUTABILITY_MONITOR_TOKEN:/g) || [])
          .length === 1 &&
        !/--(?:expected-tag|actor|run-id|ref|trigger)[^\n]*\$\{\{/.test(
          workflow
        ) &&
        !/\b(?:contents|attestations): write\b/.test(workflow)
    });
  }

  {
    const fixture = makeFixture();
    fixture.adapter.policyEnabled = false;
    const observation = monitorRepository(
      monitorOptions(fixture),
      fixture.adapter
    );
    results.push({
      name: "disabled immutable-release policy produces retained blocked drift evidence",
      ok: observation.summary.status === "blocked" &&
        observation.summary.policy_drift_detected === true &&
        observation.issues.some(issue =>
          issue.code === "GITHUB_RELEASE_INTEGRITY_POLICY_DRIFT") &&
        validatePayload(
          observation,
          "github-release-integrity-observation"
        ).valid === true
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
    fixture.adapter.tags.set("v0.1.0", FUTURE_SHA);
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
      release.tagName !== "v0.1.0");
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
        expectedTag: "v0.2.0",
        ref: "refs/tags/v0.2.0"
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
