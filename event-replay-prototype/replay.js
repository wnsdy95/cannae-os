#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function initialProjection() {
  return {
    mission: null,
    current_order: null,
    tasks: {},
    tool_requests: {},
    pending_approvals: {},
    latest_sitrep: null,
    evidence_count: 0,
    aar_count: 0,
    readiness: {}
  };
}

function applyEvent(state, event) {
  const payload = event.payload || {};
  switch (event.event_type) {
    case "MissionCreated":
      state.mission = {
        id: event.mission_id,
        title: payload.title,
        mission_statement: payload.mission_statement,
        intent: payload.intent,
        status: "in_progress",
        created_at: event.timestamp
      };
      break;
    case "OPORDCreated":
      state.current_order = payload.order_id;
      break;
    case "TaskOrderIssued":
      state.tasks[payload.task_id] = {
        assigned_to: payload.assigned_to,
        task: payload.task,
        status: "issued"
      };
      break;
    case "ToolRequestCreated":
      state.tool_requests[payload.tool_request_id] = {
        actor: event.actor,
        tool: payload.tool,
        action: payload.action,
        target: payload.target,
        status: "requested"
      };
      break;
    case "PolicyDecisionMade":
      if (state.tool_requests[payload.tool_request_id]) {
        state.tool_requests[payload.tool_request_id].roe_class = payload.roe_class;
        state.tool_requests[payload.tool_request_id].blocked = payload.blocked;
        state.tool_requests[payload.tool_request_id].status = payload.blocked ? "blocked" : "approved_by_policy";
      }
      break;
    case "ToolExecuted":
      if (state.tool_requests[payload.tool_request_id]) {
        state.tool_requests[payload.tool_request_id].status = "executed";
        state.tool_requests[payload.tool_request_id].result = payload.result;
      }
      break;
    case "ApprovalRequested":
      state.pending_approvals[payload.approval_id] = {
        tool_request_id: payload.tool_request_id,
        actor: event.actor,
        status: payload.status || "pending"
      };
      break;
    case "ApprovalGranted":
    case "ApprovalRejected":
      if (state.pending_approvals[payload.approval_id]) {
        state.pending_approvals[payload.approval_id].status = event.event_type === "ApprovalGranted" ? "approved" : "rejected";
      }
      break;
    case "SITREPIssued":
      state.latest_sitrep = {
        status: payload.status,
        summary: payload.summary,
        timestamp: event.timestamp
      };
      break;
    case "EvidenceRecorded":
      state.evidence_count += 1;
      break;
    case "AARIssued":
      state.aar_count += 1;
      if (state.mission) {
        state.mission.status = "complete";
      }
      break;
    case "ReadinessUpdated":
      state.readiness[`${payload.agent_id}:${payload.task}`] = payload.rating;
      break;
    default:
      break;
  }
  return state;
}

function eventTime(event) {
  const time = Date.parse(event.timestamp);
  if (Number.isNaN(time)) {
    throw new Error(`INVALID_EVENT_TIMESTAMP: ${event.event_id || "unknown"} has timestamp ${event.timestamp || "missing"}`);
  }
  return time;
}

function replay(events) {
  for (const event of events) eventTime(event);
  return events
    .slice()
    .sort((a, b) => {
      const timeDelta = eventTime(a) - eventTime(b);
      if (timeDelta !== 0) return timeDelta;
      return String(a.event_id || "").localeCompare(String(b.event_id || ""));
    })
    .reduce(applyEvent, initialProjection());
}

function main() {
  const [, , fileArg] = process.argv;
  if (!fileArg) {
    console.error("Usage: node event-replay-prototype/replay.js <events.json>");
    process.exit(2);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  const events = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const projection = replay(events);
  console.log(JSON.stringify(projection, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { replay };
