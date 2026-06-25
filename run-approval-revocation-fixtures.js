#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { evaluateRevocation } = require("./approval-revocation-runner");

const ROOT = __dirname;

const cases = [
  {
    name: "active scoped approval can be revoked by granting authority",
    file: "approval-revocation-fixtures/valid-revocation-bundle.json",
    expected: { valid: true }
  },
  {
    name: "consumed approval cannot be revoked retroactively",
    file: "approval-revocation-fixtures/consumed-revocation-bundle.json",
    expected: { valid: false, code: "APPROVAL_NOT_ACTIVE_BEFORE_REVOCATION" }
  },
  {
    name: "staff role cannot revoke commander approval",
    file: "approval-revocation-fixtures/wrong-authority-bundle.json",
    expected: { valid: false, code: "APPROVAL_REVOCATION_AUTHORITY_MISMATCH" }
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
  const actual = evaluateRevocation(bundle.approval_scope, bundle.revocation_event);
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
