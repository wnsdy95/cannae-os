#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { decide } = require("./readiness-gate");

const ROOT = path.resolve(__dirname, "..");
const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-authority-matrix.json"), "utf8"));

const cases = [
  {
    name: "S3 practiced local validation is allowed",
    request: {
      role: "S3",
      task: "runtime prototype",
      tool: "validator-cli-prototype/validate.js",
      target: "local workspace",
      roe_class: "Green",
      readiness: "P"
    },
    expected: {
      decision: "allow",
      blocked: false,
      matched_rule_id: "RUL-DEMO-001"
    }
  },
  {
    name: "S3 production deploy requires commander approval",
    request: {
      role: "S3",
      task: "deployment",
      tool: "deploy",
      target: "production",
      roe_class: "Red",
      readiness: "T"
    },
    expected: {
      decision: "approval_required",
      blocked: true,
      approval_authority: "COMMANDER",
      matched_rule_id: "RUL-DEMO-002"
    }
  },
  {
    name: "Black credential request is prohibited",
    request: {
      role: "EXECUTOR",
      task: "any",
      tool: "env",
      target: "secrets",
      roe_class: "Black",
      readiness: "T"
    },
    expected: {
      decision: "prohibit",
      blocked: true,
      matched_rule_id: "RUL-DEMO-003"
    }
  },
  {
    name: "Insufficient readiness escalates otherwise allowed action",
    request: {
      role: "S3",
      task: "runtime prototype",
      tool: "runtime-demo-runner.js",
      target: "local workspace",
      roe_class: "Green",
      readiness: "U"
    },
    expected: {
      decision: "approval_required",
      blocked: true,
      approval_authority: "COMMANDER",
      matched_rule_id: "RUL-DEMO-001",
      reason: "READINESS_BELOW_MINIMUM"
    }
  }
];

function matches(actual, expected) {
  return Object.entries(expected).every(([key, value]) => {
    if (key === "reason") return actual.reasons && actual.reasons.includes(value);
    return actual[key] === value;
  });
}

const results = cases.map(testCase => {
  const actual = decide(matrix, testCase.request);
  return {
    name: testCase.name,
    ok: matches(actual, testCase.expected),
    actual,
    expected: testCase.expected
  };
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok) {
    console.log(`  expected ${JSON.stringify(result.expected)}`);
    console.log(`  got ${JSON.stringify(result.actual)}`);
  }
}

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
