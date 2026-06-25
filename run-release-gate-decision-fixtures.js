#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { evaluateReleaseGateDecision } = require("./release-gate-decision-runner");

const ROOT = __dirname;

const cases = [
  {
    name: "release gate decision matches allowed execution and release",
    file: "release-gate-decision-fixtures/valid-release-gate-decision-bundle.json",
    expected: { valid: true }
  },
  {
    name: "release gate event cannot claim allow when review is missing",
    file: "release-gate-decision-fixtures/missing-review-claims-allow-bundle.json",
    expected: { valid: false, code: "RELEASE_GATE_FINAL_DECISION_MISMATCH" }
  },
  {
    name: "valid release review cannot override authority block",
    file: "release-gate-decision-fixtures/authority-blocked-valid-release-bundle.json",
    expected: { valid: true }
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
  const bundlePath = path.join(ROOT, testCase.file);
  const actual = evaluateReleaseGateDecision(readJson(testCase.file), { baseDir: path.dirname(bundlePath) });
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
