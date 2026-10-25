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

for (const [name, mutate, reason] of [
  ["valid release review cannot repair below-minimum readiness", value => { value.authority_request.readiness = "P"; }, "READINESS_BELOW_MINIMUM"],
  ["valid release review cannot substitute a different authority target", value => { value.authority_request.target = "production"; }, "AUTHORITY_REQUEST_TARGET_MISMATCH"]
]) cases.push({ name, file: "release-integration-fixtures/valid-release-bundle.json", mutate,
  expected: { allowed: false, blocked: true, final_decision: "prohibit", reason } });
cases.push({ name: "valid release review cannot erase explicit Green request approval", file: "release-integration-fixtures/valid-release-bundle.json",
  mutate(value) {
    Object.assign(value.tool_request, { tool: "validator", action: "validate", target: "local workspace", risk_level: "low", roe_class: "Green", approval_required: true });
    Object.assign(value.authority_request, { tool: "validator", target: "local workspace", roe_class: "Green", readiness: "T" });
    Object.assign(value.authority_matrix.rules[0], { tool_scope: ["validator"], target_scope: ["local workspace"], roe_class: "Green", decision: "allow" });
    delete value.authority_matrix.rules[0].approval_authority; delete value.approval_scope; delete value.risk_acceptance;
  }, expected: { allowed: false, blocked: true, final_decision: "blocked_pending_authority", reason: "MISSING_APPROVAL_SCOPE" } });

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
  const bundle = readJson(testCase.file);
  if (testCase.mutate) {
    bundle.authority_bundle = JSON.parse(fs.readFileSync(path.resolve(path.dirname(bundlePath), bundle.authority_bundle_path), "utf8"));
    delete bundle.authority_bundle_path; testCase.mutate(bundle.authority_bundle);
  }
  const actual = integrate(bundle, { baseDir: path.dirname(bundlePath) });
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
