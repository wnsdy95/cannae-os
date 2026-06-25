#!/usr/bin/env node

const { spawnSync } = require("child_process");

const CHECKS = [
  {
    asset_id: "TOOL-VALIDATOR-001",
    asset_type: "tool",
    owner: "S6",
    check_command: "node validator-cli-prototype/run-fixtures.js",
    dependencies: ["node", "schema-files", "sample-payloads"],
    fallback: "Manual schema review and targeted validator patch.",
    ccir_trigger: "Validator runner fails or cannot execute."
  },
  {
    asset_id: "TOOL-POLICY-001",
    asset_type: "tool",
    owner: "S3",
    check_command: "node policy-engine-prototype/run-policy-fixtures.js",
    dependencies: ["node", "policy-engine-prototype", "sample-payloads"],
    fallback: "Manual ROE review against docs/tool-use-roe.md.",
    ccir_trigger: "Policy runner allows Red action or cannot execute."
  },
  {
    asset_id: "TOOL-RUNTIME-001",
    asset_type: "verification",
    owner: "S6",
    check_command: "node runtime-demo-runner.js",
    dependencies: ["runtime-demo-payloads", "validator-cli-prototype", "policy-engine-prototype"],
    fallback: "Run validator and policy checks individually.",
    ccir_trigger: "Runtime demo runner fails."
  },
  {
    asset_id: "TOOL-EVENT-001",
    asset_type: "verification",
    owner: "S6",
    check_command: "node event-replay-prototype/run-event-fixtures.js",
    dependencies: ["event-fixtures/demo-events.json", "event-replay-prototype/replay.js"],
    fallback: "Inspect event projection manually.",
    ccir_trigger: "Event replay fails to preserve Red block or pending approval."
  },
  {
    asset_id: "TOOL-ALERTS-001",
    asset_type: "verification",
    owner: "COS",
    check_command: "node alert-router-prototype/run-alert-fixtures.js",
    dependencies: ["event-fixtures/demo-events.json", "alert-router-prototype/route-alerts.js"],
    fallback: "Manual CCIR review from event log.",
    ccir_trigger: "Alert router misses Red blocked action."
  },
  {
    asset_id: "TOOL-CONTEXT-001",
    asset_type: "verification",
    owner: "S6",
    check_command: "node context-filter-prototype/run-context-filter-fixtures.js",
    dependencies: ["context-filter-prototype/context-filter.js", "context-filter-prototype/context-items.demo.json"],
    fallback: "Manually apply context releasability policy.",
    ccir_trigger: "Context filter releases EEFI or restricted content."
  }
];

function runCheck(check) {
  const [command, ...args] = check.check_command.split(" ");
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ...check,
    readiness: result.status === 0 ? "Fully" : "Unavailable",
    last_result: result.status === 0 ? "pass" : "fail"
  };
}

function buildReport() {
  const assets = CHECKS.map(runCheck);
  const unavailable = assets.filter(asset => asset.readiness === "Unavailable").map(asset => asset.asset_id);
  const degraded = assets.filter(asset => asset.readiness === "Poorly" || asset.readiness === "Unknown").map(asset => asset.asset_id);

  return {
    schema_version: "0.1",
    type: "MaintenanceReadinessReport",
    id: "MR-DEMO-GENERATED",
    mission_id: "M-DEMO-001",
    owner: "S6",
    classification: "internal",
    generated_at: "2026-06-18T12:50:00+09:00",
    overall_readiness: unavailable.length > 0 ? "Unavailable" : degraded.length > 0 ? "Poorly" : "Fully",
    assets,
    summary: {
      unavailable_assets: unavailable.length ? unavailable : ["None"],
      degraded_assets: degraded.length ? degraded : ["None"],
      commander_decision_required: unavailable.length > 0,
      next_actions: unavailable.length
        ? ["Open FFIR alert for unavailable critical assets.", "Assign S4/S6 repair task."]
        : ["Continue scheduled maintenance readiness checks."]
    }
  };
}

function main() {
  process.stdout.write(`${JSON.stringify(buildReport(), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { buildReport };
