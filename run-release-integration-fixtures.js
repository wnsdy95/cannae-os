#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { integrate } = require("./policy-engine-release-integration");

const ROOT = __dirname;

const cases = [
  {
    name: "approved Red execution also passes release review",
    file: "release-integration-fixtures/valid-release-bundle.json",
    expected: {
      allowed: true,
      blocked: false,
      final_decision: "allow_scoped_execution_and_release"
    }
  },
  {
    name: "release-required execution is blocked without release review",
    file: "release-integration-fixtures/missing-release-review-bundle.json",
    expected: {
      allowed: false,
      blocked: true,
      final_decision: "blocked_pending_release_review",
      reason: "MISSING_RELEASE_REVIEW"
    }
  },
  {
    name: "release-required execution is blocked by invalid release review",
    file: "release-integration-fixtures/invalid-release-review-bundle.json",
    expected: {
      allowed: false,
      blocked: true,
      final_decision: "blocked_pending_release_review",
      reason: "RELEASE_REVIEW_FAILED"
    }
  },
  {
    name: "release review target must match requested release target",
    file: "release-integration-fixtures/target-mismatch-release-review-bundle.json",
    expected: {
      allowed: false,
      blocked: true,
      final_decision: "blocked_pending_release_review",
      reason: "RELEASE_REVIEW_TARGET_MISMATCH"
    }
  },
  {
    name: "valid release review cannot override missing risk acceptance",
    file: "release-integration-fixtures/blocked-authority-valid-release-bundle.json",
    expected: {
      allowed: false,
      blocked: true,
      final_decision: "blocked_pending_authority",
      reason: "MISSING_RISK_ACCEPTANCE"
    }
  }
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function matches(actual, expected) {
  return Object.entries(expected).every(([key, value]) => {
    if (key === "reason") return actual.reasons && actual.reasons.includes(value);
    return actual[key] === value;
  });
}

const results = cases.map(testCase => {
  const bundlePath = path.join(ROOT, testCase.file);
  const actual = integrate(readJson(testCase.file), { baseDir: path.dirname(bundlePath) });
  return {
    name: testCase.name,
    ok: matches(actual, testCase.expected),
    expected: testCase.expected,
    actual
  };
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok) {
    console.log(`  expected ${JSON.stringify(result.expected)}`);
    console.log(`  got ${JSON.stringify({
      allowed: result.actual.allowed,
      blocked: result.actual.blocked,
      final_decision: result.actual.final_decision,
      reasons: result.actual.reasons
    })}`);
  }
}

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
