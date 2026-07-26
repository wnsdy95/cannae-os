#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  ReleaseAuthorizationError
} = require("./github-release-publisher");
const {
  authorizationDigest,
  authorizePolicyChange,
  executePolicyChange,
  receiptDigest,
  validateAuthorizationSemantics,
  validateReceiptSemantics
} = require("./github-release-immutability");
const { validatePayload } = require("./validator-cli-prototype/validate");
const {
  findRuntimeRoot: findCodexRuntimeRoot
} = require(
  "./codex-skills/controls-doctrine-operator/scripts/operate_github_release_immutability"
);
const {
  findRuntimeRoot: findClaudeRuntimeRoot
} = require(
  "./.claude/skills/controls-doctrine-operator/scripts/operate_github_release_immutability"
);

const TARGET_SHA = "f7d3e2751d715f1c7bb67f818b1135a10e90d888";
const ISSUED_AT = "2026-07-27T00:00:00.000Z";
const RUN_ID = 30207884692;

class FakeImmutabilityAdapter {
  constructor(repositoryRoot) {
    this.repositoryRoot = repositoryRoot;
    this.clock = ISSUED_AT;
    this.enableCalls = 0;
    this.enableChangesState = true;
    this.mutateLatestOnEnable = false;
    this.releaseImmutability = {
      api_version: "2026-03-10",
      enabled: false,
      enforced_by_owner: false
    };
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
      viewer_permission: "ADMIN"
    };
    this.run = {
      databaseId: RUN_ID,
      workflowName: "Validate",
      name: "Doctrine and runtime checks",
      event: "push",
      status: "completed",
      conclusion: "success",
      headBranch: "main",
      headSha: TARGET_SHA,
      url: `https://github.com/wnsdy95/cannae-os/actions/runs/${RUN_ID}`,
      jobs: [
        {
          databaseId: 89809016677,
          name: "Doctrine and runtime checks",
          status: "completed",
          conclusion: "success",
          url: `https://github.com/wnsdy95/cannae-os/actions/runs/${RUN_ID}/job/89809016677`
        }
      ]
    };
    this.latestRelease = {
      tag_name: "v0.2.0",
      published_at: "2026-07-26T15:25:25Z",
      immutable: false
    };
  }

  now() {
    return this.clock;
  }

  inspectRepository() {
    return { ...this.repository };
  }

  inspectRun() {
    return JSON.parse(JSON.stringify(this.run));
  }

  inspectReleaseImmutability() {
    return { ...this.releaseImmutability };
  }

  inspectLatestReleaseState() {
    return { ...this.latestRelease };
  }

  inspectReleaseListing(repository, tagName) {
    if (tagName !== this.latestRelease.tag_name) return null;
    return {
      latest: true,
      immutable: this.latestRelease.immutable
    };
  }

  enableReleaseImmutability() {
    this.enableCalls += 1;
    if (this.enableChangesState) this.releaseImmutability.enabled = true;
    if (this.mutateLatestOnEnable) this.latestRelease.immutable = true;
    return { response_status: 204 };
  }
}

function makeFixture() {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "cannae-release-immutability-")
  );
  const authorizationPath = path.join(
    repositoryRoot,
    ".cannae",
    "release-policy",
    "immutability",
    "authorization.json"
  );
  return {
    repositoryRoot,
    authorizationPath,
    adapter: new FakeImmutabilityAdapter(repositoryRoot)
  };
}

function authorizationOptions(fixture) {
  return {
    repositoryRoot: fixture.repositoryRoot,
    repository: "wnsdy95/cannae-os",
    runId: RUN_ID,
    grantId: "UGR-enable_release_immutability",
    expiresInMinutes: 30,
    now: ISSUED_AT
  };
}

function persistAuthorization(fixture, authorization, targetPath = null) {
  const outputPath = targetPath || fixture.authorizationPath;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(authorization, null, 2)}\n`);
  return outputPath;
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
      ok: error instanceof ReleaseAuthorizationError &&
        error.code === expectedCode,
      detail: `${error.code || error.name}: ${error.message}`
    };
  }
}

function runFixtures() {
  const results = [];

  {
    const fixture = makeFixture();
    const authorization = authorizePolicyChange(
      authorizationOptions(fixture),
      fixture.adapter
    );
    const schema = validatePayload(
      authorization,
      "github-release-immutability-authorization"
    );
    results.push({
      name: "exact USER grant creates one valid future-release policy authorization",
      ok: authorization.repository_policy_change_authorized === true &&
        authorization.release_authorized === false &&
        authorization.policy.previous_state.enabled === false &&
        authorization.policy.desired_state.enabled === true &&
        authorization.authorization_sha256 === authorizationDigest(authorization) &&
        validateAuthorizationSemantics(authorization).length === 0 &&
        schema.valid === true
    });
  }

  {
    const fixture = makeFixture();
    fixture.adapter.repository.viewer_permission = "WRITE";
    results.push(expectError(
      "non-admin principal cannot authorize repository release policy",
      "POLICY_CHANGE_ADMIN_REQUIRED",
      () => authorizePolicyChange(authorizationOptions(fixture), fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizePolicyChange(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    fixture.adapter.mutateLatestOnEnable = true;
    results.push(expectError(
      "historical latest-release mutation during activation fails terminal verification",
      "RELEASE_IMMUTABILITY_RETROACTIVITY_MISMATCH",
      () => executePolicyChange({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: fixture.authorizationPath
      }, fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizePolicyChange(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    executePolicyChange({
      repositoryRoot: fixture.repositoryRoot,
      authorizationPath: fixture.authorizationPath
    }, fixture.adapter);
    fixture.adapter.releaseImmutability.enforced_by_owner = true;
    results.push(expectError(
      "owner-enforcement drift cannot satisfy an idempotent retry",
      "AUTHORIZED_POLICY_STATE_DRIFT",
      () => executePolicyChange({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: fixture.authorizationPath
      }, fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    fixture.adapter.releaseImmutability.enabled = true;
    results.push(expectError(
      "already-enabled policy cannot mint a new activation authorization",
      "RELEASE_IMMUTABILITY_ALREADY_ENABLED",
      () => authorizePolicyChange(authorizationOptions(fixture), fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    fixture.adapter.run.headSha =
      "38109f7b7a6d46fe9ddbc11724f140792ec54725";
    results.push(expectError(
      "validation for a different main commit blocks authorization",
      "MAIN_VALIDATION_MISMATCH",
      () => authorizePolicyChange(authorizationOptions(fixture), fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    fixture.adapter.repository.origin_full_name = "attacker/cannae-os";
    results.push(expectError(
      "foreign Git origin blocks policy authorization",
      "ORIGIN_REPOSITORY_MISMATCH",
      () => authorizePolicyChange(authorizationOptions(fixture), fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizePolicyChange(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    fixture.adapter.clock = "2026-07-27T00:31:00.000Z";
    results.push(expectError(
      "expired policy authorization cannot execute",
      "GITHUB_RELEASE_IMMUTABILITY_AUTHORIZATION_EXPIRED",
      () => executePolicyChange({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: fixture.authorizationPath
      }, fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizePolicyChange(
      authorizationOptions(fixture),
      fixture.adapter
    );
    const externalRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cannae-release-immutability-auth-")
    );
    const externalPath = persistAuthorization(
      fixture,
      authorization,
      path.join(externalRoot, "authorization.json")
    );
    const result = expectError(
      "authorization outside the repository is denied before PUT",
      "AUTHORIZATION_PATH_OUTSIDE_REPOSITORY",
      () => executePolicyChange({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: externalPath
      }, fixture.adapter)
    );
    result.ok = result.ok && fixture.adapter.enableCalls === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizePolicyChange(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    const externalRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cannae-release-immutability-receipt-")
    );
    const result = expectError(
      "receipt outside the repository is denied before PUT",
      "POLICY_ARTIFACT_PATH_OUTSIDE_REPOSITORY",
      () => executePolicyChange({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: fixture.authorizationPath,
        receiptPath: path.join(externalRoot, "receipt.json")
      }, fixture.adapter)
    );
    result.ok = result.ok && fixture.adapter.enableCalls === 0;
    results.push(result);
  }

  {
    const fixture = makeFixture();
    const authorization = authorizePolicyChange(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    const relativeAuthorizationPath = path.relative(
      fixture.repositoryRoot,
      fixture.authorizationPath
    );
    const firstReceipt = executePolicyChange({
      repositoryRoot: fixture.repositoryRoot,
      authorizationPath: relativeAuthorizationPath
    }, fixture.adapter);
    const replayReceipt = executePolicyChange({
      repositoryRoot: fixture.repositoryRoot,
      authorizationPath: relativeAuthorizationPath
    }, fixture.adapter);
    const firstSchema = validatePayload(
      firstReceipt,
      "github-release-immutability-receipt"
    );
    const replaySchema = validatePayload(
      replayReceipt,
      "github-release-immutability-receipt"
    );
    results.push({
      name: "activation executes once and exact retry performs idempotent verification",
      ok: fixture.adapter.enableCalls === 1 &&
        firstReceipt.policy.request_performed === true &&
        firstReceipt.policy.before.enabled === false &&
        firstReceipt.policy.response_status === 204 &&
        replayReceipt.policy.request_performed === false &&
        replayReceipt.policy.before.enabled === true &&
        replayReceipt.policy.response_status === null &&
        firstReceipt.existing_release_observation.immutable_after === false &&
        firstReceipt.receipt_sha256 === receiptDigest(firstReceipt) &&
        replayReceipt.receipt_sha256 === receiptDigest(replayReceipt) &&
        validateReceiptSemantics(firstReceipt).length === 0 &&
        validateReceiptSemantics(replayReceipt).length === 0 &&
        firstSchema.valid === true &&
        replaySchema.valid === true
    });
  }

  {
    const fixture = makeFixture();
    const authorization = authorizePolicyChange(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    fixture.adapter.enableChangesState = false;
    results.push(expectError(
      "HTTP success without enabled policy state fails closed",
      "RELEASE_IMMUTABILITY_VERIFICATION_FAILED",
      () => executePolicyChange({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: fixture.authorizationPath
      }, fixture.adapter)
    ));
  }

  {
    const fixture = makeFixture();
    const authorization = authorizePolicyChange(
      authorizationOptions(fixture),
      fixture.adapter
    );
    persistAuthorization(fixture, authorization);
    fixture.adapter.latestRelease.immutable = true;
    results.push(expectError(
      "pre-existing release state drift blocks activation",
      "AUTHORIZED_LATEST_RELEASE_DRIFT",
      () => executePolicyChange({
        repositoryRoot: fixture.repositoryRoot,
        authorizationPath: fixture.authorizationPath
      }, fixture.adapter)
    ));
  }

  {
    const validAuthorization = JSON.parse(fs.readFileSync(
      path.join(
        __dirname,
        "sample-payloads",
        "valid-github-release-immutability-authorization.json"
      ),
      "utf8"
    ));
    const invalidAuthorization = JSON.parse(fs.readFileSync(
      path.join(
        __dirname,
        "sample-payloads",
        "invalid-github-release-immutability-authorization-ai-approval.json"
      ),
      "utf8"
    ));
    const validReceipt = JSON.parse(fs.readFileSync(
      path.join(
        __dirname,
        "sample-payloads",
        "valid-github-release-immutability-receipt.json"
      ),
      "utf8"
    ));
    const invalidReceipt = JSON.parse(fs.readFileSync(
      path.join(
        __dirname,
        "sample-payloads",
        "invalid-github-release-immutability-receipt-release-authority.json"
      ),
      "utf8"
    ));
    results.push({
      name: "static valid and adversarial immutability contracts retain expected outcomes",
      ok: validatePayload(
        validAuthorization,
        "github-release-immutability-authorization"
      ).valid === true &&
        validatePayload(
          invalidAuthorization,
          "github-release-immutability-authorization"
        ).valid === false &&
        validatePayload(
          validReceipt,
          "github-release-immutability-receipt"
        ).valid === true &&
        validatePayload(
          invalidReceipt,
          "github-release-immutability-receipt"
        ).valid === false
    });
  }

  {
    const expectedRoot = fs.realpathSync(__dirname);
    results.push({
      name: "Codex and Claude immutability wrappers resolve the same runtime",
      ok: fs.realpathSync(findCodexRuntimeRoot()) === expectedRoot &&
        fs.realpathSync(findClaudeRuntimeRoot()) === expectedRoot
    });
  }

  {
    const runtimeSource = fs.readFileSync(
      path.join(__dirname, "github-release-immutability.js"),
      "utf8"
    );
    const exportsIndex = runtimeSource.indexOf("module.exports = {");
    const mainIndex = runtimeSource.indexOf("if (require.main === module) main();");
    results.push({
      name: "CLI entry installs immutability exports before validator re-entry",
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
