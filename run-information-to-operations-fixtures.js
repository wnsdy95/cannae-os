#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { routeInformation } = require("./information-to-operations-router");

const ROOT = __dirname;
const VALIDATOR = path.join(ROOT, "validator-cli-prototype", "validate.js");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validatePayload(payload, type) {
  const tmp = path.join(ROOT, `.tmp-information-${type}.json`);
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
    assert(result.status === 0, `alert failed validation: ${result.stdout || result.stderr}`);
  }
  if (output.decision_packet) {
    const result = validatePayload(output.decision_packet, "decision-packet");
    assert(result.status === 0, `decision packet failed validation: ${result.stdout || result.stderr}`);
  }
  if (output.sitrep) {
    const result = validatePayload(output.sitrep, "sitrep");
    assert(result.status === 0, `sitrep failed validation: ${result.stdout || result.stderr}`);
  }
  if (output.frago_scope_change) {
    const result = validatePayload(output.frago_scope_change, "frago-scope-change");
    assert(result.status === 0, `frago scope change failed validation: ${result.stdout || result.stderr}`);
  }
}

const fixtures = [
  {
    name: "order-changing information routes to commander decision and FRAGO draft",
    report: readJson(path.join(ROOT, "sample-payloads", "valid-information-report.json")),
    assessment: readJson(path.join(ROOT, "sample-payloads", "valid-intelligence-assessment.json")),
    verify(output) {
      assert(output.alerts.some(alert => alert.ccir_type === "PIR"), "expected PIR alert");
      assert(output.alerts.some(alert => alert.ccir_type === "DECISION_POINT" && alert.blocks_execution), "expected blocked decision alert");
      assert(output.decision_packet && output.decision_packet.decision_type === "scope", "expected scope decision packet");
      assert(output.sitrep && output.sitrep.status === "blocked", "expected blocked SITREP");
      assert(output.frago_scope_change && output.frago_scope_change.requires_backbrief === true, "expected FRAGO scope-change draft");
    }
  },
  {
    name: "own-force information routes to FFIR SITREP without FRAGO",
    report: readJson(path.join(ROOT, "information-to-operations-fixtures", "own-force-information-report.json")),
    assessment: readJson(path.join(ROOT, "information-to-operations-fixtures", "own-force-intelligence-assessment.json")),
    verify(output) {
      assert(output.alerts.some(alert => alert.ccir_type === "FFIR" && alert.severity === "Amber"), "expected Amber FFIR alert");
      assert(output.sitrep && output.sitrep.status === "in_progress", "expected in-progress SITREP");
      assert(!output.frago_scope_change, "did not expect FRAGO draft");
    }
  },
  {
    name: "EEFI information blocks release without repeating raw value",
    report: readJson(path.join(ROOT, "information-to-operations-fixtures", "eefi-information-report.json")),
    assessment: readJson(path.join(ROOT, "information-to-operations-fixtures", "eefi-intelligence-assessment.json")),
    verify(output) {
      assert(output.alerts.some(alert => alert.ccir_type === "EEFI" && alert.severity === "Black" && alert.blocks_execution), "expected Black EEFI alert");
      assert(output.sitrep && output.sitrep.status === "blocked", "expected blocked SITREP");
      assert(JSON.stringify(output).includes("raw value is suppressed"), "expected suppression note");
      assert(!/sk-[A-Za-z0-9]/.test(JSON.stringify(output)), "must not repeat credential-like raw value");
    }
  }
];

let passed = 0;

for (const fixture of fixtures) {
  try {
    const output = routeInformation(fixture.report, fixture.assessment);
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
