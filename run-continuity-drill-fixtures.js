#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { runContinuityDrill } = require("./continuity-drill-runner");

const ROOT = __dirname;
const PLAN = path.join(ROOT, "sample-payloads", "valid-continuity-plan.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validatePlan() {
  const result = spawnSync("node", ["validator-cli-prototype/validate.js", "sample-payloads/valid-continuity-plan.json", "continuity-plan"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert(result.status === 0, result.stdout || result.stderr);
}

const plan = readJson(PLAN);

const fixtures = [
  {
    name: "commander unavailable activates CoS and pauses retained decisions",
    event: readJson(path.join(ROOT, "continuity-drill-fixtures", "commander-unavailable-event.json")),
    verify(result) {
      assert(result.status === "covered", "expected covered continuity state");
      assert(result.activated_successions.some(item => item.from_role === "COMMANDER" && item.acting_role === "COS"), "expected COS acting successor");
      assert(result.paused_functions.includes("Risk acceptance."), "expected risk acceptance paused");
      assert(result.commander_retained_decisions.includes("Mission scope change."), "expected commander retained decisions preserved");
    }
  },
  {
    name: "S6 rotation activates Recorder and requires handoff discipline",
    event: readJson(path.join(ROOT, "continuity-drill-fixtures", "s6-rotation-event.json")),
    verify(result) {
      const s6 = result.activated_successions.find(item => item.from_role === "S6");
      assert(s6 && s6.acting_role === "RECORDER", "expected Recorder to assume S6 continuity function");
      assert(s6.handoff_required === true, "expected handoff requirement");
      assert(result.required_actions.some(action => /backbrief/i.test(action)), "expected backbrief action");
      assert(result.required_actions.some(action => /rehearsal/i.test(action)), "expected rehearsal action");
      assert(result.paused_functions.length === 0, "S6 covered rotation should not pause all degraded functions");
    }
  }
];

let passed = 0;

try {
  validatePlan();
  for (const fixture of fixtures) {
    const result = runContinuityDrill(plan, fixture.event);
    fixture.verify(result);
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  }
} catch (error) {
  console.error(`FAIL ${fixtures[passed] ? fixtures[passed].name : "continuity plan validation"}`);
  console.error(error.message);
  process.exitCode = 1;
}

console.log(JSON.stringify({ total: fixtures.length, passed, failed: fixtures.length - passed }, null, 2));
