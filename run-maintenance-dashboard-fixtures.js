#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { projectMaintenanceDashboard } = require("./maintenance-dashboard-runner");

const input = JSON.parse(fs.readFileSync(path.join(__dirname, "maintenance-dashboard-fixtures/maintenance-readiness-report.json"), "utf8"));
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "dashboard-ui-prototype/maintenance-readiness-dashboard-state.json"), "utf8"));
const actual = projectMaintenanceDashboard(input);

const cases = [
  {
    name: "projection matches checked-in dashboard state",
    ok: JSON.stringify(actual) === JSON.stringify(expected)
  },
  {
    name: "projection separates ready degraded and unavailable assets",
    ok: actual.summary.fully === 1 && actual.summary.degraded === 1 && actual.summary.unavailable === 1
  },
  {
    name: "unavailable asset is visible as down alert",
    ok: actual.assets.some(item => item.dashboard.label === "DOWN" && item.dashboard.class === "red")
  },
  {
    name: "commander decision flag is preserved",
    ok: actual.commander_decision_required === true
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
