#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function makeAlertId(index) {
  return `ALERT-DEMO-${String(index + 1).padStart(3, "0")}`;
}

function maybeSecretText(value) {
  return /secret|token|private[_-]?key|password|credential/i.test(String(value || ""));
}

function eventTime(event) {
  const time = Date.parse(event.timestamp);
  if (Number.isNaN(time)) {
    throw new Error(`INVALID_EVENT_TIMESTAMP: ${event.event_id || "unknown"} has timestamp ${event.timestamp || "missing"}`);
  }
  return time;
}

function routeAlerts(events) {
  const alerts = [];
  const toolRequests = {};
  for (const event of events) eventTime(event);

  for (const event of events.slice().sort((a, b) => {
    const timeDelta = eventTime(a) - eventTime(b);
    if (timeDelta !== 0) return timeDelta;
    return String(a.event_id || "").localeCompare(String(b.event_id || ""));
  })) {
    const payload = event.payload || {};

    if (event.event_type === "ToolRequestCreated") {
      toolRequests[payload.tool_request_id] = {
        actor: event.actor,
        tool: payload.tool,
        action: payload.action,
        target: payload.target
      };

      if (maybeSecretText(`${payload.tool} ${payload.action} ${payload.target}`)) {
        alerts.push({
          schema_version: "0.1",
          type: "CCIRAlert",
          id: makeAlertId(alerts.length),
          mission_id: event.mission_id,
          ccir_type: "EEFI",
          severity: "Black",
          source_event_id: event.event_id,
          owner: "S6",
          title: "Possible sensitive information exposure",
          why_it_matters: "Tool request references sensitive credential-like material and must be suppressed before execution.",
          recommended_route: "Protection Review",
          required_decision: "Reject the action or create a redacted release packet.",
          deadline: "before tool execution",
          sensitive: true,
          blocks_execution: true,
          status: "blocked"
        });
      }
    }

    if (event.event_type === "PolicyDecisionMade" && payload.blocked === true) {
      const request = toolRequests[payload.tool_request_id] || {};
      alerts.push({
        schema_version: "0.1",
        type: "CCIRAlert",
        id: makeAlertId(alerts.length),
        mission_id: event.mission_id,
        ccir_type: "DECISION_POINT",
        severity: payload.roe_class === "Black" ? "Black" : "Red",
        source_event_id: event.event_id,
        owner: "COS",
        title: `${request.action || payload.tool_request_id} blocked`,
        why_it_matters: `${request.tool || "tool"} request targets ${request.target || "unknown target"} and cannot execute without commander disposition.`,
        recommended_route: "Commander Board",
        required_decision: "Approve once, approve with constraints, revise, reject, or issue FRAGO.",
        deadline: "before tool execution",
        sensitive: false,
        blocks_execution: true,
        status: "pending"
      });
    }

    if (event.event_type === "EvidenceRecorded") {
      alerts.push({
        schema_version: "0.1",
        type: "CCIRAlert",
        id: makeAlertId(alerts.length),
        mission_id: event.mission_id,
        ccir_type: "PIR",
        severity: "Amber",
        source_event_id: event.event_id,
        owner: "S2",
        title: "Evidence interpretation review",
        why_it_matters: "Recorded evidence must keep source-backed claim separate from local interpretation before commander release.",
        recommended_route: "Source Review Working Group",
        deadline: "before final release",
        sensitive: false,
        blocks_execution: false,
        status: "pending"
      });
    }

    if (event.event_type === "SITREPIssued" && /blocked|failed/i.test(`${payload.status} ${payload.summary}`)) {
      alerts.push({
        schema_version: "0.1",
        type: "CCIRAlert",
        id: makeAlertId(alerts.length),
        mission_id: event.mission_id,
        ccir_type: "FFIR",
        severity: "Amber",
        source_event_id: event.event_id,
        owner: "COS",
        title: "Current operations blocker reported",
        why_it_matters: "SITREP indicates blocked or failed work that may affect mission execution.",
        recommended_route: "Current Ops Sync",
        deadline: "next SITREP",
        sensitive: false,
        blocks_execution: false,
        status: "pending"
      });
    }
  }

  return alerts;
}

function main() {
  const [, , eventsArg] = process.argv;
  if (!eventsArg) {
    console.error("Usage: node alert-router-prototype/route-alerts.js <events.json>");
    process.exit(2);
  }

  const eventsPath = path.resolve(process.cwd(), eventsArg);
  const events = JSON.parse(fs.readFileSync(eventsPath, "utf8"));
  process.stdout.write(`${JSON.stringify(routeAlerts(events), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { routeAlerts };
