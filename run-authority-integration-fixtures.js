#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { integrate } = require("./policy-engine-authority-integration");

const ROOT = __dirname;

const cases = [
  {
    name: "approved Red deployment is released only with scoped approval and risk acceptance",
    file: "authority-integration-fixtures/approved-red-bundle.json",
    expected: {
      allowed: true,
      blocked: false,
      final_decision: "allow_scoped_execution"
    }
  },
  {
    name: "consumed approval cannot be reused",
    file: "authority-integration-fixtures/consumed-approval-bundle.json",
    expected: {
      allowed: false,
      blocked: true,
      reason: "APPROVAL_NOT_ACTIVE"
    }
  },
  {
    name: "high risk request remains blocked without risk acceptance",
    file: "authority-integration-fixtures/missing-risk-acceptance-bundle.json",
    expected: {
      allowed: false,
      blocked: true,
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
  const actual = integrate(readJson(testCase.file));
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
