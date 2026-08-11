#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const missionCcirList = [
  { "id": "CCIR-20260618-FFIR-001", "ccir_type": "FFIR", "item": "Validator runtime availability" },
  { "id": "CCIR-20260618-PIR-001", "ccir_type": "PIR", "item": "Upstream schema publication status" }
];

const fixtures = {
  "classified-sitrep.json": {
    id: "SITREP-20260618-101",
    mission_id: "M-20260618-001",
    timestamp: "2026-06-18T11:00:00+09:00",
    status: "blocked",
    completed: ["JSON Schema files created."],
    in_progress: ["Policy engine rules documentation."],
    blocked: ["Validator runtime unavailable (CCIR-20260618-FFIR-001)."],
    ccir: [
      {
        ccir_id: "CCIR-20260618-FFIR-001",
        type: "FFIR",
        item: "Validator runtime unavailable (CCIR-20260618-FFIR-001).",
        action: "Escalate to S6 for runtime restore."
      }
    ],
    risk: ["Runtime outage delays the validation gate."],
    next_action: ["Wait for S6 runtime restore confirmation."]
  },
  "unclassified-blocker-sitrep.json": {
    id: "SITREP-20260618-102",
    mission_id: "M-20260618-001",
    timestamp: "2026-06-18T12:00:00+09:00",
    status: "blocked",
    completed: ["JSON Schema files created."],
    in_progress: ["Policy engine rules documentation."],
    blocked: [
      "Validator runtime unavailable.",
      "External source confirmation pending."
    ],
    ccir: [
      {
        type: "FFIR",
        item: "Validator runtime unavailable.",
        action: "Escalate to S6 for runtime restore."
      }
    ],
    risk: ["Runtime outage delays the validation gate."],
    next_action: ["Classify the remaining blocker before reporting."]
  },
  "unknown-reference-sitrep.json": {
    id: "SITREP-20260618-103",
    mission_id: "M-20260618-001",
    timestamp: "2026-06-18T13:00:00+09:00",
    status: "blocked",
    completed: ["JSON Schema files created."],
    in_progress: ["Policy engine rules documentation."],
    blocked: ["External source confirmation pending (CCIR-20260618-PIR-999)."],
    ccir: [
      {
        ccir_id: "CCIR-20260618-PIR-999",
        type: "PIR",
        item: "External source confirmation pending (CCIR-20260618-PIR-999).",
        action: "Route to S2 for source review."
      }
    ],
    risk: ["Unverified source blocks the evidence packet."],
    next_action: ["Confirm the CCIR reference against the mission CCIR list."]
  },
  "omitted-reference-sitrep.json": {
    id: "SITREP-20260618-104",
    mission_id: "M-20260618-001",
    timestamp: "2026-06-18T14:00:00+09:00",
    status: "blocked",
    completed: [],
    in_progress: ["Validator recovery."],
    blocked: ["Validator runtime unavailable."],
    ccir: [{
      type: "FFIR",
      item: "Validator runtime unavailable.",
      action: "Route an arbitrary FFIR without a catalog id."
    }],
    risk: ["Runtime outage delays validation."],
    next_action: ["Bind the actual mission CCIR id."]
  }
};

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccir-linter-fixtures-"));

function writeFixture(name, payload) {
  const filePath = path.join(fixtureDir, name);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
}

const fixturePaths = {};
for (const [name, payload] of Object.entries(fixtures)) {
  fixturePaths[name] = writeFixture(name, payload);
}
const ccirListPath = writeFixture("mission-ccir-list.json", missionCcirList);

const cases = [
  {
    name: "sitrep with all blocked items CCIR-classified passes",
    args: [fixturePaths["classified-sitrep.json"], ccirListPath],
    exitCode: 0
  },
  {
    name: "blocked item without CCIR classification fails",
    args: [fixturePaths["unclassified-blocker-sitrep.json"]],
    exitCode: 1,
    expectedCodes: ["BLOCKED_ITEM_WITHOUT_CCIR"]
  },
  {
    name: "blocked item referencing unknown CCIR id fails",
    args: [fixturePaths["unknown-reference-sitrep.json"], ccirListPath],
    exitCode: 1,
    expectedCodes: ["UNKNOWN_CCIR_REFERENCE"]
  },
  {
    name: "CCIR row cannot omit its mission catalog id",
    args: [fixturePaths["omitted-reference-sitrep.json"], ccirListPath],
    exitCode: 1,
    expectedCodes: ["MISSING_CCIR_REFERENCE"]
  },
  {
    name: "sitrep with no blocked items passes",
    args: ["sample-payloads/valid-sitrep.json"],
    exitCode: 0
  }
];

const results = cases.map(testCase => {
  const result = spawnSync("node", ["ccir-linter.js", ...testCase.args], {
    cwd: __dirname,
    encoding: "utf8"
  });
  let codes = [];
  try {
    codes = (JSON.parse(result.stdout).findings || []).map(item => item.code);
  } catch (error) {
    codes = [];
  }
  const missingCodes = (testCase.expectedCodes || []).filter(code => !codes.includes(code));
  return {
    ...testCase,
    ok: result.status === testCase.exitCode && missingCodes.length === 0,
    status: result.status,
    missingCodes,
    stdout: result.stdout
  };
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok) {
    console.log(`  expected exit ${result.exitCode}, got ${result.status}`);
    if (result.missingCodes.length > 0) {
      console.log(`  missing finding codes: ${result.missingCodes.join(", ")}`);
    }
    console.log(result.stdout);
  }
}

fs.rmSync(fixtureDir, { recursive: true, force: true });

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
