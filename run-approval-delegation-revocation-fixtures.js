#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { evaluateDelegationTermination } = require("./approval-delegation-revocation-runner");

const ROOT = __dirname;

const cases = [
  {
    name: "commander revokes active delegated approval authority",
    file: "approval-delegation-revocation-fixtures/valid-revocation-bundle.json",
    expected: { valid: true }
  },
  {
    name: "recorder projects delegated approval authority expiry",
    file: "approval-delegation-revocation-fixtures/valid-expiry-bundle.json",
    expected: { valid: true }
  },
  {
    name: "staff cannot revoke delegated approval authority",
    file: "approval-delegation-revocation-fixtures/staff-revocation-bundle.json",
    expected: { valid: false, code: "DELEGATION_REVOCATION_REQUIRES_COMMANDER" }
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
  const actual = evaluateDelegationTermination(bundle.delegation_event, bundle.termination_event);
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
