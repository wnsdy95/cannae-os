#!/usr/bin/env node

const { spawnSync } = require("child_process");

const cases = [
  {
    name: "valid release review passes against final context filter",
    review: "sample-payloads/valid-release-review.json",
    expected: 0
  },
  {
    name: "raw EEFI release review fails",
    review: "sample-payloads/invalid-release-review-eefi-approved.json",
    expected: 1
  },
  {
    name: "internal handoff review cannot authorize final output release",
    review: "sample-payloads/invalid-release-review-internal-handoff-target.json",
    expected: 1
  }
];

const results = cases.map(testCase => {
  const result = spawnSync("node", ["release-review-runner.js", testCase.review, "context-filter-prototype/context-items.demo.json", "FINAL_OUTPUT"], {
    encoding: "utf8"
  });
  return {
    ...testCase,
    status: result.status,
    ok: result.status === testCase.expected,
    stdout: result.stdout
  };
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok) {
    console.log(`  expected ${result.expected}, got ${result.status}`);
    console.log(result.stdout);
  }
}

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
