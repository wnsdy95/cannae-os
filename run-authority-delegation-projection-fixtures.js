#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { projectDelegations } = require("./authority-delegation-projection-runner");

const input = JSON.parse(fs.readFileSync(path.join(__dirname, "authority-delegation-projection-fixtures/delegation-lifecycle-events.json"), "utf8"));
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "dashboard-ui-prototype/authority-delegation-projection-state.json"), "utf8"));
const actual = projectDelegations(input);

const cases = [
  {
    name: "projection matches checked-in dashboard state",
    ok: JSON.stringify(actual) === JSON.stringify(expected)
  },
  {
    name: "projection has active revoked and expired counts",
    ok: actual.summary.active === 1 && actual.summary.revoked === 1 && actual.summary.expired === 1
  },
  {
    name: "terminated delegations retain termination actor and reason",
    ok: actual.delegations
      .filter(item => item.termination)
      .every(item => item.termination.actor && item.termination.reason)
  },
  {
    name: "projection has no orphan terminations",
    ok: actual.orphan_terminations.length === 0
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
