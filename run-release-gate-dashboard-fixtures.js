#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { projectReleaseGateDashboard } = require("./release-gate-dashboard-runner");

const input = JSON.parse(fs.readFileSync(path.join(__dirname, "release-gate-dashboard-fixtures/release-gate-decision-events.json"), "utf8"));
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "dashboard-ui-prototype/release-gate-dashboard-state.json"), "utf8"));
const actual = projectReleaseGateDashboard(input);

const cases = [
  {
    name: "projection matches checked-in dashboard state",
    ok: JSON.stringify(actual) === JSON.stringify(expected)
  },
  {
    name: "projection separates released release-review-blocked and authority-blocked decisions",
    ok: actual.summary.released === 1 && actual.summary.blocked_release_review === 1 && actual.summary.blocked_authority === 1
  },
  {
    name: "blocked release review row is visible as review alert",
    ok: actual.release_gate_decisions.some(item => item.dashboard.label === "REVIEW" && item.dashboard.class === "red")
  }
];

for (const testCase of cases) {
  console.log(`${testCase.ok ? "PASS" : "FAIL"} ${testCase.name}`);
}

const failed = cases.filter(testCase => !testCase.ok);
console.log(JSON.stringify({
  total: cases.length,
  passed: cases.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
