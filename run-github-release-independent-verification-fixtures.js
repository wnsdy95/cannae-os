#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  independentVerificationDigest,
  validateIndependentVerificationEvidence,
  verifyGitHubReleaseBundle
} = require("./github-release-bundle-verifier");
const {
  sha256,
  trustedRootArtifactDigest,
  validateGitHubReleaseTrustedRoot
} = require("./github-release-trusted-root");
const {
  validatePayload
} = require("./validator-cli-prototype/validate");
const {
  findRuntimeRoot: findCodexRuntimeRoot
} = require(
  "./codex-skills/controls-doctrine-operator/scripts/operate_github_release_verification"
);
const {
  findRuntimeRoot: findClaudeRuntimeRoot
} = require(
  "./.claude/skills/controls-doctrine-operator/scripts/operate_github_release_verification"
);

const FIXTURE_DIRECTORY = path.join(
  __dirname,
  "github-release-independent-verification-fixtures"
);
const RAW_VERIFICATION_PATH = path.join(
  FIXTURE_DIRECTORY,
  "cli-v2.93.0-release-verification.json"
);
const TRUSTED_ROOT_PATH = path.join(
  FIXTURE_DIRECTORY,
  "github-trusted-root.json"
);
const VERIFIED_AT = "2026-07-27T00:05:00.000Z";
const EXPECTED = Object.freeze({
  repository: "cli/cli",
  tagName: "v2.93.0",
  commitSha: "f96972ce1c11fdb8eaa556257fde962a363dffde"
});
const RAW_FIXTURE_SHA256 =
  "1f8402869f4361c61dd25f17c6f6585394548afe70306ddc98175e3b6faa9d1c";
const ROOT_FIXTURE_SHA256 =
  "7594e70efc1cd9e94ca96d608b5b1ac22428b28bf5df0e60756747745201e131";

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

function mutateEncodedJson(encoded, callback) {
  const document = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf8")
  );
  callback(document);
  return Buffer.from(JSON.stringify(document), "utf8").toString("base64");
}

function runFixtures() {
  const results = [];
  const rawBytes = fs.readFileSync(RAW_VERIFICATION_PATH);
  const rootBytes = fs.readFileSync(TRUSTED_ROOT_PATH);
  const rawVerification = JSON.parse(rawBytes.toString("utf8"));
  const trustedRoot = JSON.parse(rootBytes.toString("utf8"));

  results.push({
    name: "public release and retained TUF fixtures keep exact file digests",
    ok: sha256(rawBytes) === RAW_FIXTURE_SHA256 &&
      sha256(rootBytes) === ROOT_FIXTURE_SHA256
  });

  results.push({
    name: "retained GitHub TUF chain replays offline and remains schema valid",
    ok: validateGitHubReleaseTrustedRoot(trustedRoot, {
      evaluatedAt: VERIFIED_AT
    }).length === 0 &&
      validatePayload(
        trustedRoot,
        "github-release-trusted-root",
        { evaluatedAt: VERIFIED_AT }
      ).valid === true
  });

  {
    const withoutClock = validatePayload(
      trustedRoot,
      "github-release-trusted-root"
    );
    results.push({
      name: "trusted-root validation requires an explicit evaluation clock",
      ok: withoutClock.valid === false &&
        withoutClock.issues.some(item =>
          item.code ===
            "GITHUB_RELEASE_TRUST_EVALUATION_TIME_REQUIRED")
    });
  }

  {
    const withoutClock = spawnSync(process.execPath, [
      path.join(__dirname, "github-release-trusted-root.js"),
      "verify",
      "--input",
      TRUSTED_ROOT_PATH
    ], { encoding: "utf8" });
    const withClock = spawnSync(process.execPath, [
      path.join(__dirname, "github-release-trusted-root.js"),
      "verify",
      "--input",
      TRUSTED_ROOT_PATH,
      "--evaluated-at",
      VERIFIED_AT
    ], { encoding: "utf8" });
    results.push({
      name: "trusted-root CLI requires and consumes an explicit clock",
      ok: withoutClock.status === 1 &&
        withoutClock.stderr.includes(
          "GITHUB_RELEASE_TRUST_EVALUATION_TIME_REQUIRED"
        ) &&
        withClock.status === 0 &&
        JSON.parse(withClock.stdout).valid === true
    });
  }

  {
    const withoutClock = spawnSync(process.execPath, [
      path.join(__dirname, "validator-cli-prototype", "validate.js"),
      TRUSTED_ROOT_PATH,
      "github-release-trusted-root"
    ], { encoding: "utf8" });
    const withClock = spawnSync(process.execPath, [
      path.join(__dirname, "validator-cli-prototype", "validate.js"),
      TRUSTED_ROOT_PATH,
      "github-release-trusted-root",
      "--evaluated-at",
      VERIFIED_AT
    ], { encoding: "utf8" });
    const output = JSON.parse(withoutClock.stdout);
    const validOutput = JSON.parse(withClock.stdout);
    results.push({
      name: "generic validator requires and consumes an explicit root clock",
      ok: withoutClock.status === 1 && output.valid === false &&
        output.issues.some(item =>
          item.code ===
            "GITHUB_RELEASE_TRUST_EVALUATION_TIME_REQUIRED") &&
        withClock.status === 0 && validOutput.valid === true
    });
  }

  {
    const issues = validateGitHubReleaseTrustedRoot(trustedRoot, {
      evaluatedAt: VERIFIED_AT,
      requiredValidUntil: "2026-08-03T02:00:00.000Z"
    });
    results.push({
      name: "trusted root must remain valid through a preflighted operation window",
      ok: issues.some(item =>
        item.code === "GITHUB_RELEASE_TUF_METADATA_VALIDITY_TOO_SHORT") &&
        issues.some(item =>
          item.code === "GITHUB_RELEASE_TRUST_VALIDITY_TOO_SHORT")
    });
  }

  {
    const attacked = clone(trustedRoot);
    attacked.source.fetched_at = "2026-08-03T01:30:00.000Z";
    attacked.artifact_sha256 = trustedRootArtifactDigest(attacked);
    const evaluatedAt = "2026-08-03T02:30:00.000Z";
    const issues = validateGitHubReleaseTrustedRoot(attacked, {
      evaluatedAt
    });
    const bundleResult = expectError(
      "expired signed TUF metadata cannot remain usable within wrapper age",
      "GITHUB_RELEASE_TUF_METADATA_EXPIRED",
      () => verifyGitHubReleaseBundle({
        rawVerification,
        trustedRoot: attacked,
        expected: EXPECTED,
        verifiedAt: evaluatedAt
      })
    );
    results.push({
      ...bundleResult,
      ok: bundleResult.ok && issues.some(item =>
        item.code === "GITHUB_RELEASE_TUF_METADATA_EXPIRED")
    });
  }

  const evidence = verifyGitHubReleaseBundle({
    rawVerification,
    trustedRoot,
    expected: EXPECTED,
    verifiedAt: VERIFIED_AT
  });
  results.push({
    name: "independent verifier validates the real GitHub release bundle",
    ok: evidence.cryptographic_verification_succeeded === true &&
      evidence.statement.repository === EXPECTED.repository &&
      evidence.statement.tag_name === EXPECTED.tagName &&
      evidence.statement.commit_sha1 === EXPECTED.commitSha &&
      evidence.bundle.tlog_entry_count === 0 &&
      evidence.bundle.rfc3161_timestamp_count === 1 &&
      evidence.cli_cross_check.statement_equal === true &&
      evidence.authority.human_final_decision_authority === "USER" &&
      evidence.release_authorized === false &&
      evidence.verification_sha256 ===
        independentVerificationDigest(evidence) &&
      validatePayload(
        evidence,
        "github-release-independent-verification"
      ).valid === true
  });

  results.push({
    name: "retained evidence exactly equals an independent cryptographic replay",
    ok: validateIndependentVerificationEvidence(
      evidence,
      rawVerification,
      trustedRoot,
      EXPECTED
    ).length === 0
  });

  {
    const attacked = clone(trustedRoot);
    attacked.source.tuf_evidence.root_chain_base64.pop();
    attacked.artifact_sha256 = trustedRootArtifactDigest(attacked);
    results.push({
      name: "missing root rotation version is rejected",
      ok: validateGitHubReleaseTrustedRoot(attacked, {
        evaluatedAt: VERIFIED_AT
      }).some(item =>
        item.code === "GITHUB_RELEASE_TUF_ROOT_CHAIN_INVALID")
    });
  }

  {
    const attacked = clone(trustedRoot);
    const finalIndex =
      attacked.source.tuf_evidence.root_chain_base64.length - 1;
    attacked.source.tuf_evidence.root_chain_base64[finalIndex] =
      mutateEncodedJson(
        attacked.source.tuf_evidence.root_chain_base64[finalIndex],
        root => {
          root.signed.phase19c_tampered = true;
        }
      );
    const finalBytes = Buffer.from(
      attacked.source.tuf_evidence.root_chain_base64[finalIndex],
      "base64"
    );
    attacked.source.metadata.root.sha256 = sha256(finalBytes);
    attacked.artifact_sha256 = trustedRootArtifactDigest(attacked);
    results.push({
      name: "recomputed wrapper digest cannot hide a forged TUF root body",
      ok: validateGitHubReleaseTrustedRoot(attacked, {
        evaluatedAt: VERIFIED_AT
      }).some(item =>
        item.code === "GITHUB_RELEASE_TUF_ROOT_SIGNATURE_INVALID")
    });
  }

  {
    const attacked = clone(trustedRoot);
    attacked.source.tuf_evidence.targets_base64 = mutateEncodedJson(
      attacked.source.tuf_evidence.targets_base64,
      targets => {
        targets.signed.targets["trusted_root.json"].length += 1;
      }
    );
    attacked.source.metadata.targets.sha256 = sha256(Buffer.from(
      attacked.source.tuf_evidence.targets_base64,
      "base64"
    ));
    attacked.artifact_sha256 = trustedRootArtifactDigest(attacked);
    results.push({
      name: "recomputed wrapper digest cannot hide forged targets metadata",
      ok: validateGitHubReleaseTrustedRoot(attacked, {
        evaluatedAt: VERIFIED_AT
      }).some(item =>
        item.code ===
          "GITHUB_RELEASE_TUF_METADATA_SIGNATURE_INVALID")
    });
  }

  {
    const attacked = clone(rawVerification);
    attacked.verificationResult.statement.predicate.repository =
      "attacker/repository";
    results.push(expectError(
      "CLI result substitution cannot replace the signed DSSE statement",
      "GITHUB_RELEASE_INDEPENDENT_CLI_CROSS_CHECK_FAILED",
      () => verifyGitHubReleaseBundle({
        rawVerification: attacked,
        trustedRoot,
        expected: EXPECTED,
        verifiedAt: VERIFIED_AT
      })
    ));
  }

  {
    const attacked = clone(rawVerification);
    attacked.attestation.bundle.dsseEnvelope.payload =
      mutateEncodedJson(
        attacked.attestation.bundle.dsseEnvelope.payload,
        statement => {
          statement.predicate.repository = "attacker/repository";
        }
      );
    attacked.verificationResult.statement.predicate.repository =
      "attacker/repository";
    results.push(expectError(
      "modified DSSE payload fails independent cryptographic verification",
      "GITHUB_RELEASE_INDEPENDENT_CRYPTOGRAPHIC_VERIFICATION_FAILED",
      () => verifyGitHubReleaseBundle({
        rawVerification: attacked,
        trustedRoot,
        expected: EXPECTED,
        verifiedAt: VERIFIED_AT
      })
    ));
  }

  results.push(expectError(
    "valid signature cannot authorize a substituted commit",
    "GITHUB_RELEASE_INDEPENDENT_SCOPE_MISMATCH",
    () => verifyGitHubReleaseBundle({
      rawVerification,
      trustedRoot,
      expected: {
        ...EXPECTED,
        commitSha: "0000000000000000000000000000000000000000"
      },
      verifiedAt: VERIFIED_AT
    })
  ));

  {
    const attacked = clone(evidence);
    attacked.authority.release_authorized = true;
    attacked.release_authorized = true;
    attacked.verification_sha256 =
      independentVerificationDigest(attacked);
    const issues = validateIndependentVerificationEvidence(
      attacked,
      rawVerification,
      trustedRoot,
      EXPECTED
    );
    results.push({
      name: "independent evidence cannot be repaired into release authority",
      ok: issues.some(item =>
        item.code ===
          "GITHUB_RELEASE_INDEPENDENT_EVIDENCE_AUTHORITY_DRIFT") &&
        issues.some(item =>
          item.code ===
            "GITHUB_RELEASE_INDEPENDENT_EVIDENCE_REPLAY_MISMATCH")
    });
  }

  results.push({
    name: "Codex and Claude wrappers resolve the same independent verifier",
    ok: fs.realpathSync(findCodexRuntimeRoot()) ===
      fs.realpathSync(__dirname) &&
      fs.realpathSync(findClaudeRuntimeRoot()) ===
        fs.realpathSync(__dirname)
  });

  return results;
}

const results = runFixtures();
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok && result.detail) {
    console.log(`  ${result.detail}`);
  }
}
const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
