#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { replay } = require("./event-replay-prototype/replay");
const { routeAlerts } = require("./alert-router-prototype/route-alerts");

function titleCase(value) {
  return String(value || "unknown")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function generateHandoff(events) {
  const projection = replay(events);
  const alerts = routeAlerts(events);
  const blockedRequests = Object.entries(projection.tool_requests || {})
    .filter(([, request]) => request.blocked)
    .map(([id, request]) => `${id}: ${request.action} on ${request.target} is blocked.`);
  const pendingDecisions = Object.entries(projection.pending_approvals || {})
    .filter(([, approval]) => approval.status === "pending")
    .map(([id, approval]) => `${id}: commander disposition for ${approval.tool_request_id}.`);

  return {
    schema_version: "0.1",
    type: "HandoffPacket",
    id: "HP-DEMO-GENERATED",
    mission_id: projection.mission ? projection.mission.id : "M-DEMO-001",
    created_by: "S6",
    classification: "internal",
    current_order: projection.current_order || "OPORD-DEMO-001",
    commander_intent: projection.mission ? projection.mission.intent : "Maintain current mission state from event log.",
    completed: [
      `Mission status: ${projection.mission ? titleCase(projection.mission.status) : "Unknown"}.`,
      `${projection.evidence_count} evidence item(s), ${projection.aar_count} AAR item(s).`
    ],
    in_progress: [
      projection.latest_sitrep ? projection.latest_sitrep.summary : "No latest SITREP recorded."
    ],
    blocked: blockedRequests.length ? blockedRequests : ["No blocked tool requests in projection."],
    pending_decisions: pendingDecisions.length ? pendingDecisions : ["No pending commander decisions."],
    active_risks: alerts.map(alert => `${alert.severity} ${alert.ccir_type}: ${alert.title}`),
    source_of_truth_files: [
      "event-fixtures/demo-events.json",
      "runtime-demo-payloads/opord.json",
      "docs/military-llm-framework-v0.1.md",
      "docs/source-map.md"
    ],
    verification_status: [
      "Run node validator-cli-prototype/run-fixtures.js.",
      "Run node event-replay-prototype/run-event-fixtures.js.",
      "Run node alert-router-prototype/run-alert-fixtures.js."
    ],
    next_actions: [
      "Resolve pending Red approval or keep deployment blocked.",
      "Update readiness and SOP after commander decision.",
      "Continue context filtering and release review automation."
    ],
    do_not_do: [
      "Do not execute production deployment without scoped commander approval.",
      "Do not expose credentials, secrets, private data, or restricted context."
    ],
    created_at: "2026-06-18T12:30:00+09:00"
  };
}

function main() {
  const [, , eventsArg] = process.argv;
  if (!eventsArg) {
    console.error("Usage: node handoff-generator.js <events.json>");
    process.exit(2);
  }
  const eventsPath = path.resolve(process.cwd(), eventsArg);
  const events = JSON.parse(fs.readFileSync(eventsPath, "utf8"));
  process.stdout.write(`${JSON.stringify(generateHandoff(events), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { generateHandoff };
