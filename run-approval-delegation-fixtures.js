#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { evaluateDelegation } = require("./approval-delegation-runner");

const ROOT = __dirname;

const cases = [
  {
    name: "commander delegates bounded Amber approval to CoS",
    file: "approval-delegation-fixtures/valid-delegation-bundle.json",
    expected: { valid: true }
  },
  {
    name: "staff cannot delegate retained Commander approval",
    file: "approval-delegation-fixtures/staff-retained-delegation-bundle.json",
    expected: { valid: false, code: "DELEGATION_REQUIRES_COMMANDER" }
  },
  {
    name: "Red base authority rule cannot be delegated",
    file: "approval-delegation-fixtures/red-base-rule-bundle.json",
    expected: { valid: false, code: "DELEGATION_BASE_RULE_COMMANDER_RETAINED" }
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
  const actual = evaluateDelegation(bundle.authority_matrix, bundle.delegation_event);
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
