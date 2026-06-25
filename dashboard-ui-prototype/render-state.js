#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { replay } = require("../event-replay-prototype/replay");

function titleCaseStatus(value) {
  return String(value || "unknown")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function readinessRows(readiness) {
  return Object.entries(readiness || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, rating]) => {
      const [agent, task] = key.split(":");
      return {
        agent,
        task: task || "general",
        rating
      };
    });
}

function approvalRows(projection) {
  return Object.entries(projection.pending_approvals || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([approvalId, approval]) => {
      const request = projection.tool_requests[approval.tool_request_id] || {};
      return {
        class: "red",
        label: "RED",
        action: request.action || approval.tool_request_id,
        tool: request.tool || "unknown",
        target: request.target || "unknown",
        actor: request.actor || approval.actor || "unknown",
        risk: `Approval ${approvalId} is ${approval.status}; blocked action must not execute without commander release.`,
        rollback: "Keep prior state and require a new approved FRAGO before execution."
      };
    });
}

function taskRows(tasks) {
  return Object.entries(tasks || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([taskId, task]) => ({
      agent: task.assigned_to,
      task: task.task,
      status: titleCaseStatus(task.status),
      verification: `Task order ${taskId}; verify against OPORD and SITREP.`
    }));
}

function ccirRows(projection) {
  const rows = [];

  for (const [requestId, request] of Object.entries(projection.tool_requests || {})) {
    if (request.blocked) {
      rows.push({
        class: "red",
        label: "RED",
        title: `${request.action} blocked`,
        body: `${request.tool} request ${requestId} targets ${request.target}; explicit approval is required before execution.`
      });
    }
  }

  if (projection.evidence_count > 0) {
    rows.push({
      class: "amber",
      label: "PIR",
      title: "Evidence interpretation review",
      body: `${projection.evidence_count} evidence item(s) recorded; separate sourced claim from local interpretation before release.`
    });
  }

  return rows;
}

function riskRows(projection) {
  const blockedCount = Object.values(projection.tool_requests || {}).filter(request => request.blocked).length;
  const pendingCount = Object.values(projection.pending_approvals || {}).filter(approval => approval.status === "pending").length;

  return [
    {
      id: "R-003",
      title: "Unauthorized action",
      body: `Control: policy gate has blocked ${blockedCount} high-risk request(s).`
    },
    {
      id: "R-012",
      title: "Context loss",
      body: "Control: current state is rebuilt from event log instead of conversational memory."
    },
    {
      id: "R-021",
      title: "Pending decision latency",
      body: `Control: ${pendingCount} pending approval(s) require commander disposition or scoped FRAGO.`
    }
  ];
}

function sitrepRows(projection) {
  const rows = [];
  if (projection.latest_sitrep) {
    rows.push({
      label: titleCaseStatus(projection.latest_sitrep.status),
      text: projection.latest_sitrep.summary
    });
  }
  rows.push({
    label: "Order",
    text: `Current order: ${projection.current_order || "none"}.`
  });
  rows.push({
    label: "Evidence",
    text: `${projection.evidence_count} evidence item(s), ${projection.aar_count} AAR item(s).`
  });
  rows.push({
    label: "Next",
    text: "Resolve pending approvals, update readiness, and issue FRAGO if scope changes."
  });
  return rows;
}

function projectionToDashboardState(projection) {
  const mission = projection.mission || {};
  const blocked = Object.values(projection.tool_requests || {}).filter(request => request.blocked).length;
  const pending = Object.values(projection.pending_approvals || {}).filter(approval => approval.status === "pending").length;
  const decisionCount = Object.keys(projection.tool_requests || {}).length + pending;

  return {
    mission: {
      id: mission.id || "M-UNKNOWN",
      title: mission.title || "Command Post Dashboard",
      status: titleCaseStatus(mission.status),
      risk: blocked || pending ? "High" : "Medium",
      decision_count: decisionCount,
      intent: mission.intent || mission.mission_statement || "No mission intent recorded."
    },
    ccir_alerts: ccirRows(projection),
    approvals: approvalRows(projection),
    risks: riskRows(projection),
    tasks: taskRows(projection.tasks),
    evidence: {
      claim: "Dashboard state is derived from replayed event log.",
      interpretation: "Projection-based UI reduces reliance on unstated conversational memory."
    },
    readiness: readinessRows(projection.readiness),
    sitrep: sitrepRows(projection)
  };
}

function main() {
  const [, , eventsArg, outputArg] = process.argv;
  if (!eventsArg) {
    console.error("Usage: node dashboard-ui-prototype/render-state.js <events.json> [output.json]");
    process.exit(2);
  }

  const eventsPath = path.resolve(process.cwd(), eventsArg);
  const events = JSON.parse(fs.readFileSync(eventsPath, "utf8"));
  const dashboardState = projectionToDashboardState(replay(events));
  const output = `${JSON.stringify(dashboardState, null, 2)}\n`;

  if (outputArg) {
    const outputPath = path.resolve(process.cwd(), outputArg);
    fs.writeFileSync(outputPath, output);
    return;
  }

  process.stdout.write(output);
}

if (require.main === module) {
  main();
}

module.exports = { projectionToDashboardState };
