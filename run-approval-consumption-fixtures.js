#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { evaluateConsumption } = require("./approval-consumption-runner");

const ROOT = __dirname;

const cases = [
  {
    name: "active scoped approval is consumed by matching execution",
    file: "approval-consumption-fixtures/valid-consumption-bundle.json",
    expected: { valid: true }
  },
  {
    name: "target mismatch cannot consume approval",
    file: "approval-consumption-fixtures/target-mismatch-bundle.json",
    expected: { valid: false, code: "APPROVAL_CONSUMPTION_TARGET_MISMATCH" }
  },
  {
    name: "already consumed approval cannot be consumed again",
    file: "approval-consumption-fixtures/reused-approval-bundle.json",
    expected: { valid: false, code: "APPROVAL_NOT_ACTIVE_BEFORE_CONSUMPTION" }
  }
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function matches(actual, expected) {
  if (actual.valid !== expected.valid) return false;
  if (expected.code) return actual.issues.some(item => item.code === expected.code);
  return true;
}

const results = cases.map(testCase => {
  const bundle = readJson(testCase.file);
  const actual = evaluateConsumption(bundle.approval_scope, bundle.consumption_event);
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
