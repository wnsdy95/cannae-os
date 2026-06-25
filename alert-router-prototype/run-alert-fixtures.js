#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { routeAlerts } = require("./route-alerts");

const ROOT = path.resolve(__dirname, "..");
const events = JSON.parse(fs.readFileSync(path.join(ROOT, "event-fixtures", "demo-events.json"), "utf8"));
const alerts = routeAlerts(events);
const offsetAlerts = routeAlerts([
  {
    event_id: "EVT-ALERT-OFFSET-001",
    mission_id: "M-ALERT-OFFSET-001",
    event_type: "ToolRequestCreated",
    actor: "S3",
    timestamp: "2026-06-18T11:00:00+09:00",
    payload: {
      tool_request_id: "TR-ALERT-OFFSET-001",
      tool: "deploy",
      action: "deploy_production",
      target: "prod.command-post-dashboard"
    }
  },
  {
    event_id: "EVT-ALERT-OFFSET-002",
    mission_id: "M-ALERT-OFFSET-001",
    event_type: "PolicyDecisionMade",
    actor: "POLICY_ENGINE",
    timestamp: "2026-06-18T02:01:00Z",
    payload: {
      tool_request_id: "TR-ALERT-OFFSET-001",
      roe_class: "Red",
      blocked: true
    }
  }
]);

const checks = [
  {
    name: "blocked Red policy decision becomes commander decision alert",
    ok: alerts.some(alert => alert.ccir_type === "DECISION_POINT" && alert.severity === "Red" && alert.blocks_execution === true && alert.title.includes("deploy_production"))
  },
  {
    name: "evidence record becomes PIR alert",
    ok: alerts.some(alert => alert.ccir_type === "PIR" && alert.severity === "Amber" && alert.owner === "S2")
  },
  {
    name: "blocked SITREP becomes FFIR alert",
    ok: alerts.some(alert => alert.ccir_type === "FFIR" && alert.severity === "Amber" && alert.owner === "COS")
  },
  {
    name: "high severity alerts state required decision",
    ok: alerts
      .filter(alert => alert.severity === "Red" || alert.severity === "Black")
      .every(alert => alert.required_decision && alert.blocks_execution === true)
  },
  {
    name: "all alert ids are unique",
    ok: new Set(alerts.map(alert => alert.id)).size === alerts.length
  },
  {
    name: "offset-aware alert routing preserves request context",
    ok: offsetAlerts.some(alert => alert.ccir_type === "DECISION_POINT" && alert.title.includes("deploy_production"))
  },
  {
    name: "invalid alert event timestamp is rejected",
    ok: (() => {
      try {
        routeAlerts([{ event_id: "EVT-ALERT-BAD-TIME", event_type: "EvidenceRecorded", timestamp: "not-a-time", payload: {} }]);
        return false;
      } catch (error) {
        return /INVALID_EVENT_TIMESTAMP/.test(error.message);
      }
    })()
  }
];

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
}

console.log(JSON.stringify({
  total: checks.length,
  passed: checks.filter(check => check.ok).length,
  failed: checks.filter(check => !check.ok).length,
  alert_count: alerts.length
}, null, 2));

process.exit(checks.every(check => check.ok) ? 0 : 1);
