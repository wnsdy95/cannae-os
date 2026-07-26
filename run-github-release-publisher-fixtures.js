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

const TARGET_SHA = "130c09a02a6b03da30564666df46cf26838afee3";
const PREVIOUS_SHA = "38109f7b7a6d46fe9ddbc11724f140792ec54725";
const ISSUED_AT = "2026-07-26T10:00:00.000Z";
const RELEASE_TAG = "v0.2.0";

class FakeReleaseAdapter {
  constructor(repositoryRoot) {
    this.repositoryRoot = repositoryRoot;
    this.clock = ISSUED_AT;
    this.createCalls = [];
    this.tags = new Map();
    this.releases = new Map();
    this.repository = {
      root: repositoryRoot,
      branch: "main",
      head_sha: TARGET_SHA,
      origin_default_branch_sha: TARGET_SHA,
      clean: true,
      full_name: "wnsdy95/cannae-os",
      origin_full_name: "wnsdy95/cannae-os",
      default_branch: "main",
      visibility: "PUBLIC",
      viewer_permission: "ADMIN",
      notes_tracked: relativePath => relativePath === "docs/releases/v0.2.0.md"
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
      url: "https://github.com/wnsdy95/cannae-os/actions/runs/30202562268",
      jobs: [
        {
          databaseId: 89794946579,
          name: "Doctrine and runtime checks",
          status: "completed",
          conclusion: "success",
          url: "https://github.com/wnsdy95/cannae-os/actions/runs/30202562268/job/89794946579"
        }
      ]
    };
    this.previousRelease = {
      tag_name: "v0.1.0",
      commit_sha: PREVIOUS_SHA,
      published_at: "2026-06-25T05:06:43Z"
    };
  }

  now() {
    return this.clock;
  }

  inspectRepository() {
    return { ...this.repository };
  }

  inspectRun() {
    return { ...this.run };
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
    const release = this.releases.get(tagName);
    return Boolean(release && release.latest === true);
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
      apiUrl: "https://api.github.com/repos/wnsdy95/cannae-os/releases/200000001",
      body: fs.readFileSync(notesAbsolutePath, "utf8"),
      databaseId: 200000001,
      id: "RE_kwDOCannae4Ltest",
      isDraft: false,
      isPrerelease: false,
      latest: true,
      name: target.release_name,
      publishedAt: "2026-07-26T10:05:00.000Z",
      tagName: target.tag_name,
      targetCommitish: target.commit_sha,
      url: "https://github.com/wnsdy95/cannae-os/releases/tag/v0.2.0"
    });
    this.clock = "2026-07-26T10:05:01.000Z";
    return "https://github.com/wnsdy95/cannae-os/releases/tag/v0.2.0";
  }
}

function makeFixture() {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-release-"));
  const notesDirectory = path.join(repositoryRoot, "docs", "releases");
  fs.mkdirSync(notesDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(notesDirectory, "v0.2.0.md"),
    "# Cannae OS v0.2.0\n\nExact release fixture notes.\n"
  );
  return {
    repositoryRoot,
    adapter: new FakeReleaseAdapter(repositoryRoot),
    authorizationPath: path.join(repositoryRoot, ".cannae", "releases", "v0.2.0", "authorization.json")
  };
}

function authorizationOptions(fixture) {
  return {
    repositoryRoot: fixture.repositoryRoot,
    repository: "wnsdy95/cannae-os",
    tagName: RELEASE_TAG,
    releaseName: "Cannae OS v0.2.0",
    notesPath: "docs/releases/v0.2.0.md",
    runId: 30202562268,
    grantId: "UGR-v0_2_0",
    expiresInMinutes: 30,
    now: ISSUED_AT
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
        authorization.authorization_sha256 === authorizationDigest(authorization) &&
        validateAuthorizationSemantics(authorization).length === 0 &&
        schema.valid === true
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
    fixture.adapter.clock = "2026-07-26T10:31:00.000Z";
    results.push(expectError(
      "expired authorization cannot publish",
      "GITHUB_RELEASE_AUTHORIZATION_EXPIRED",
      () => publishAuthorizedRelease({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: fixture.authorizationPath
      }, fixture.adapter)
    ));
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
        repositoryRoot: fixture.repositoryRoot,
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
    fs.appendFileSync(
      path.join(fixture.repositoryRoot, "docs", "releases", "v0.2.0.md"),
      "\nTampered after authorization.\n"
    );
    results.push(expectError(
      "release notes tamper blocks publication",
      "AUTHORIZED_RELEASE_NOTES_DRIFT",
      () => publishAuthorizedRelease({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: fixture.authorizationPath
      }, fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    const receipt = publishAuthorizedRelease({
      repositoryRoot: fixture.repositoryRoot,
      authorizationPath: fixture.authorizationPath
    }, fixture.adapter);
    const firstCreateCount = fixture.adapter.createCalls.length;
    const replayReceipt = publishAuthorizedRelease({
      repositoryRoot: fixture.repositoryRoot,
      authorizationPath: fixture.authorizationPath
    }, fixture.adapter);
    const schema = validatePayload(receipt, "github-release-receipt");
    results.push({
      name: "exact release publishes once and an exact retry is idempotent",
      ok: firstCreateCount === 1 &&
        fixture.adapter.createCalls.length === 1 &&
        receipt.release_authorized === true &&
        receipt.authorization_consumed === true &&
        receipt.release.resolved_tag_commit_sha === TARGET_SHA &&
        receipt.receipt_sha256 === receiptDigest(receipt) &&
        validateReceiptSemantics(receipt).length === 0 &&
        replayReceipt.release.database_id === receipt.release.database_id &&
        schema.valid === true
    });
  }

  {
    const fixture = makeFixture();
    const authorization = authorizeRelease(authorizationOptions(fixture), fixture.adapter);
    persistAuthorization(fixture, authorization);
    fixture.adapter.tags.set(RELEASE_TAG, PREVIOUS_SHA);
    fixture.adapter.releases.set(RELEASE_TAG, {
      apiUrl: "https://api.github.com/repos/wnsdy95/cannae-os/releases/200000001",
      body: fs.readFileSync(path.join(fixture.repositoryRoot, "docs", "releases", "v0.2.0.md"), "utf8"),
      databaseId: 200000001,
      id: "RE_kwDOCannae4Ltest",
      isDraft: false,
      isPrerelease: false,
      latest: true,
      name: "Cannae OS v0.2.0",
      publishedAt: "2026-07-26T10:05:00.000Z",
      tagName: RELEASE_TAG,
      targetCommitish: PREVIOUS_SHA,
      url: "https://github.com/wnsdy95/cannae-os/releases/tag/v0.2.0"
    });
    results.push(expectError(
      "existing release at a different commit cannot satisfy idempotency",
      "PUBLISHED_RELEASE_MISMATCH",
      () => publishAuthorizedRelease({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: fixture.authorizationPath
      }, fixture.adapter)
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
      () => publishAuthorizedRelease({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: fixture.authorizationPath
      }, fixture.adapter)
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
