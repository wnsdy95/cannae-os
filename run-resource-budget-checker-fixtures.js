#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { buildBudgetWatch } = require("./resource-budget-checker");

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

const greenToken = readJson(path.join(ROOT, "sample-payloads", "valid-resource-status.json"));

const greenClock = {
  ...greenToken,
  id: "RS-DEMO-CLOCK-001",
  resource_class: "wall_clock",
  unit: "minutes",
  capacity: 120,
  current_level: 90,
  gates_phases: ["execute"]
};

const amberToken = {
  ...greenToken,
  current_level: 50000,
  trend: "degrading"
};

const redQuota = {
  ...greenToken,
  id: "RS-DEMO-QUOTA-002",
  resource_class: "api_quota",
  unit: "requests_per_hour",
  capacity: 1000,
  current_level: 40,
  trend: "degrading",
  gates_phases: ["execute"]
};

const nonGatingRedContext = {
  ...greenToken,
  id: "RS-DEMO-CONTEXT-RED",
  resource_class: "context_size",
  unit: "tokens",
  capacity: 100000,
  current_level: 5000,
  trend: "degrading",
  measured_at: "2026-06-18T04:30:00Z",
  gates_phases: ["release"]
};

function watchInput(resources) {
  return { mission_id: "M-DEMO-001", mission_phase: "execute", resources };
}

const fixtures = [
  {
    name: "all-green resources pass quietly",
    input: watchInput([greenToken, greenClock]),
    verify(watch) {
      assert(watch.overall_resource_readiness === "Green", "expected Green overall readiness");
      assert(watch.sitrep_watch_items.length === 0, "expected no SITREP watch items");
      assert(watch.ccir_alert_candidates.length === 0, "expected no CCIR alert candidates");
      assert(watch.summary.commander_decision_required === false, "did not expect commander decision");
    }
  },
  {
    name: "amber token budget produces SITREP watch item not alert",
    input: watchInput([amberToken, greenClock]),
    verify(watch) {
      assert(watch.overall_resource_readiness === "Amber", "expected Amber overall readiness");
      assert(watch.sitrep_watch_items.length === 1, "expected one SITREP watch item");
      assert(watch.sitrep_watch_items[0].resource_class === "token_budget", "expected token_budget watch item");
      assert(watch.sitrep_watch_items[0].sitrep_field === "risk", "expected watch item bound to SITREP risk");
      assert(watch.ccir_alert_candidates.length === 0, "amber must not produce an alert candidate");
      assert(watch.summary.commander_decision_required === false, "amber must not force commander decision");
    }
  },
  {
    name: "red quota gating the phase produces blocking FFIR alert candidate",
    input: watchInput([greenToken, redQuota]),
    verify(watch) {
      assert(watch.overall_resource_readiness === "Red", "expected Red overall readiness");
      const alert = watch.ccir_alert_candidates[0];
      assert(Boolean(alert), "expected a CCIR alert candidate");
      assert(alert.ccir_type === "FFIR", "expected FFIR own-force alert");
      assert(alert.severity === "Red" && alert.blocks_execution === true, "expected blocking Red alert");
      assert(alert.status === "blocked", "expected blocked status for phase-gating resource");
      assert(watch.summary.blocking_resources.includes("RS-DEMO-QUOTA-002"), "expected quota listed as blocking");
      assert(watch.summary.commander_decision_required === true, "expected commander decision");
      const result = validatePayload(alert, "ccir-alert");
      assert(result.status === 0, `alert candidate did not validate: ${result.stdout || result.stderr}`);
    }
  },
  {
    name: "non-gating red resource remains non-blocking in projection and alert",
    input: watchInput([greenToken, nonGatingRedContext]),
    verify(watch) {
      const projected = watch.resources.find(item => item.resource_id === nonGatingRedContext.id);
      const alert = watch.ccir_alert_candidates.find(item => item.source_event_id === nonGatingRedContext.id);
      assert(projected && projected.blocking === false, "projection must mark non-gating Red resource non-blocking");
      assert(alert && alert.blocks_execution === false, "alert must agree with projection blocking state");
      assert(alert.status === "pending", "non-gating alert must remain pending");
      assert(watch.generated_at === "2026-06-18T04:30:00.000Z", "mixed-offset timestamps must select the actual latest measurement");
    }
  }
];

let passed = 0;

for (const fixture of fixtures) {
  try {
    const watch = buildBudgetWatch(fixture.input);
    fixture.verify(watch);
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({ total: fixtures.length, passed, failed: fixtures.length - passed }, null, 2));
