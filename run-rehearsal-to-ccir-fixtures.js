#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { routeRehearsal } = require("./rehearsal-to-ccir-router");

const ROOT = __dirname;
const VALIDATOR = path.join(ROOT, "validator-cli-prototype", "validate.js");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validatePayload(payload, type) {
  const tmp = path.join(ROOT, `.tmp-${type}.json`);
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  const result = spawnSync("node", [VALIDATOR, tmp, type], { encoding: "utf8" });
  fs.unlinkSync(tmp);
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateRouting(output) {
  for (const alert of output.alerts) {
    const result = validatePayload(alert, "ccir-alert");
    assert(result.status === 0, `alert did not validate: ${result.stdout || result.stderr}`);
  }
  for (const packet of output.decision_packets) {
    const result = validatePayload(packet, "decision-packet");
    assert(result.status === 0, `decision packet did not validate: ${result.stdout || result.stderr}`);
  }
}

const fixtures = [
  {
    name: "medium friction creates Amber FFIR alert",
    rehearsal: readJson(path.join(ROOT, "sample-payloads", "valid-rehearsal.json")),
    verify(output) {
      assert(output.alerts.some(alert => alert.ccir_type === "FFIR" && alert.severity === "Amber"), "expected Amber FFIR alert");
      assert(output.decision_packets.length === 1, "expected deployment approval decision point packet");
    }
  },
  {
    name: "high friction creates blocked decision alert and packet",
    rehearsal: readJson(path.join(ROOT, "rehearsal-to-ccir-fixtures", "high-friction-rehearsal.json")),
    verify(output) {
      assert(output.alerts.some(alert => alert.ccir_type === "DECISION_POINT" && alert.severity === "Red" && alert.blocks_execution), "expected blocked Red decision alert");
      assert(output.decision_packets.length >= 1, "expected decision packet");
      assert(output.decision_packets[0].decision_type === "scope", "expected scope decision packet");
    }
  },
  {
    name: "sensitive friction creates Black EEFI alert",
    rehearsal: readJson(path.join(ROOT, "rehearsal-to-ccir-fixtures", "sensitive-friction-rehearsal.json")),
    verify(output) {
      assert(output.alerts.some(alert => alert.ccir_type === "EEFI" && alert.severity === "Black" && alert.blocks_execution), "expected Black EEFI alert");
      assert(output.decision_packets.length >= 1, "expected decision packet for critical friction");
    }
  }
];

let passed = 0;

for (const fixture of fixtures) {
  try {
    const output = routeRehearsal(fixture.rehearsal);
    fixture.verify(output);
    validateRouting(output);
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({ total: fixtures.length, passed, failed: fixtures.length - passed }, null, 2));
