#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { evaluateRenewal } = require("./approval-renewal-runner");

const ROOT = __dirname;

const cases = [
  {
    name: "active scoped approval can be renewed without scope expansion",
    file: "approval-renewal-fixtures/valid-renewal-bundle.json",
    expected: { valid: true }
  },
  {
    name: "expired approval cannot be renewed retroactively",
    file: "approval-renewal-fixtures/expired-renewal-bundle.json",
    expected: { valid: false, code: "APPROVAL_NOT_ACTIVE_BEFORE_RENEWAL" }
  },
  {
    name: "renewal cannot change target or execution count",
    file: "approval-renewal-fixtures/scope-expansion-bundle.json",
    expected: { valid: false, code: "APPROVAL_RENEWAL_EXPANDS_EXECUTIONS" }
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
  const actual = evaluateRenewal(bundle.approval_scope, bundle.renewal_event);
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
