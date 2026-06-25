#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { buildUpdate } = require("./aar-to-readiness-update");

const ROOT = __dirname;
const VALIDATOR = path.join(ROOT, "validator-cli-prototype", "validate.js");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runValidator(payload) {
  const tmp = path.join(ROOT, ".tmp-aar-readiness-update.json");
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  const result = spawnSync("node", [VALIDATOR, tmp, "aar-readiness-update"], { encoding: "utf8" });
  fs.unlinkSync(tmp);
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const fixtures = [
  {
    name: "normal AAR creates S6 hold/train update",
    aar: readJson(path.join(ROOT, "sample-payloads", "valid-aar.json")),
    verify(update) {
      const recommendation = update.readiness_recommendations[0];
      assert(recommendation.agent_id === "S6", "expected S6 recommendation");
      assert(recommendation.readiness_action === "hold_and_train", "expected hold_and_train");
      assert(update.maintenance_actions.some(action => action.action_type === "verification_update"), "expected verification action");
      assert(update.commander_decision_required === false, "did not expect commander review");
    }
  },
  {
    name: "critical source failure creates Red Team commander review",
    aar: readJson(path.join(ROOT, "aar-readiness-update-fixtures", "critical-unsupported-source-aar.json")),
    verify(update) {
      const recommendation = update.readiness_recommendations[0];
      assert(recommendation.agent_id === "RED_TEAM", "expected Red Team recommendation");
      assert(recommendation.readiness_action === "downgrade_or_hold", "expected downgrade_or_hold");
      assert(recommendation.recommended_rating === "U", "expected U rating");
      assert(update.commander_decision_required === true, "expected commander review");
      assert(update.ccir_triggers.length > 0, "expected CCIR trigger");
    }
  },
  {
    name: "sustain-only AAR creates sustain/raise update",
    aar: readJson(path.join(ROOT, "aar-readiness-update-fixtures", "sustain-only-aar.json")),
    verify(update) {
      const recommendation = update.readiness_recommendations[0];
      assert(recommendation.readiness_action === "sustain_or_raise", "expected sustain_or_raise");
      assert(recommendation.recommended_rating === "T", "expected T rating");
      assert(update.commander_decision_required === false, "did not expect commander review");
    }
  }
];

let passed = 0;

for (const fixture of fixtures) {
  try {
    const update = buildUpdate(fixture.aar);
    fixture.verify(update);
    const validation = runValidator(update);
    assert(validation.status === 0, validation.stdout || validation.stderr);
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({ total: fixtures.length, passed, failed: fixtures.length - passed }, null, 2));
