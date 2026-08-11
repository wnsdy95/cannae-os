#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { routeRehearsal } = require("./rehearsal-to-ccir-router");

const ROOT = __dirname;
const FIXTURE_PATH = path.join(ROOT, "event-fixtures", "rehearsal-event-fixtures.json");

function sortedByParsedTimestamp(events) {
  for (const event of events) {
    const parsed = Date.parse(event.timestamp);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid event timestamp: ${event.event_id} ${event.timestamp}`);
    }
  }
  return events.slice().sort((left, right) =>
    Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

function projectRehearsalEvents(events) {
  const state = {
    rehearsals: {},
    order_revisions: []
  };

  for (const event of sortedByParsedTimestamp(events)) {
    const payload = event.payload || {};

    if (event.event_type === "RehearsalStarted") {
      state.rehearsals[payload.rehearsal_id] = {
        parent_order: payload.parent_order,
        rehearsal_type: payload.rehearsal_type,
        facilitator: payload.facilitator,
        backbriefs: payload.backbriefs || [],
        status: "in_progress",
        friction_points: [],
        alerts: [],
        decision_packets: [],
        disposition: "none",
        required_changes: []
      };
    }

    const rehearsal = state.rehearsals[payload.rehearsal_id];

    if (event.event_type === "RehearsalFrictionRaised" && rehearsal) {
      rehearsal.friction_points.push({
        issue: payload.issue,
        severity: payload.severity,
        mitigation: payload.mitigation,
        owner: payload.owner
      });
    }

    if (event.event_type === "RehearsalCCIRAlertRouted" && rehearsal) {
      rehearsal.alerts.push({
        alert_id: payload.alert_id,
        ccir_type: payload.ccir_type,
        severity: payload.severity,
        blocks_execution: payload.blocks_execution
      });
    }

    if (event.event_type === "RehearsalDecisionPacketPrepared" && rehearsal) {
      rehearsal.decision_packets.push({
        decision_packet_id: payload.decision_packet_id,
        decision_type: payload.decision_type,
        recommended_option: payload.recommended_option
      });
    }

    if (event.event_type === "RehearsalCompleted" && rehearsal) {
      rehearsal.status = "completed";
      rehearsal.disposition = payload.disposition;
      rehearsal.required_changes = payload.required_changes || [];
    }

    if (event.event_type === "OrderRevisionRequested") {
      state.order_revisions.push({
        parent_order: payload.parent_order,
        source_rehearsal_id: payload.source_rehearsal_id,
        revision_type: payload.revision_type,
        reason: payload.reason
      });
    }
  }

  return state;
}

function rehearsalPayloadFromEvents(rehearsalId, projection) {
  const rehearsal = projection.rehearsals[rehearsalId];
  return {
    id: rehearsalId,
    mission_id: "M-DEMO-001",
    parent_order: rehearsal.parent_order,
    facilitator: rehearsal.facilitator,
    classification: "internal",
    friction_points: rehearsal.friction_points,
    decision_points: []
  };
}

function runFixtures() {
  const events = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  const projection = projectRehearsalEvents(events);
  const executePath = projection.rehearsals["RH-DEMO-001"];
  const revisePath = projection.rehearsals["RH-DEMO-002"];

  let invalidTimestampRejected = false;
  try {
    projectRehearsalEvents([
      ...events,
      {
        event_id: "EVT-RH-BAD",
        mission_id: "M-DEMO-001",
        event_type: "RehearsalStarted",
        actor: "COS",
        timestamp: "not-a-timestamp",
        payload: { rehearsal_id: "RH-DEMO-BAD" }
      }
    ]);
  } catch (error) {
    invalidTimestampRejected = /Invalid event timestamp/.test(error.message);
  }

  const routedRevise = routeRehearsal(
    rehearsalPayloadFromEvents("RH-DEMO-002", projection)
  );
  const routedExecute = routeRehearsal(
    rehearsalPayloadFromEvents("RH-DEMO-001", projection)
  );

  const checks = [
    {
      name: "events sort by parsed absolute timestamp across mixed offsets",
      ok: (() => {
        const ordered = sortedByParsedTimestamp(events).map(event => event.event_id);
        return ordered.indexOf("EVT-RH-002") === ordered.indexOf("EVT-RH-001") + 1 &&
          ordered.indexOf("EVT-RH-006") === ordered.indexOf("EVT-RH-005") + 1;
      })()
    },
    {
      name: "invalid timestamp is rejected",
      ok: invalidTimestampRejected
    },
    {
      name: "execute-path rehearsal completes without order revision",
      ok: Boolean(executePath) &&
        executePath.status === "completed" &&
        executePath.disposition === "execute" &&
        projection.order_revisions.every(revision =>
          revision.source_rehearsal_id !== "RH-DEMO-001")
    },
    {
      name: "medium friction routes one non-blocking Amber FFIR alert",
      ok: Boolean(executePath) &&
        executePath.alerts.length === 1 &&
        executePath.alerts[0].severity === "Amber" &&
        executePath.alerts[0].ccir_type === "FFIR" &&
        executePath.alerts[0].blocks_execution === false
    },
    {
      name: "high friction routes one blocking Red decision-point alert with a decision packet",
      ok: Boolean(revisePath) &&
        revisePath.alerts.length === 1 &&
        revisePath.alerts[0].severity === "Red" &&
        revisePath.alerts[0].ccir_type === "DECISION_POINT" &&
        revisePath.alerts[0].blocks_execution === true &&
        revisePath.decision_packets.length === 1 &&
        revisePath.decision_packets[0].recommended_option === "OPT-REVISE"
    },
    {
      name: "revise-path rehearsal completes with revise disposition and requests a FRAGO",
      ok: Boolean(revisePath) &&
        revisePath.status === "completed" &&
        revisePath.disposition === "revise" &&
        projection.order_revisions.length === 1 &&
        projection.order_revisions[0].source_rehearsal_id === "RH-DEMO-002" &&
        projection.order_revisions[0].revision_type === "frago"
    },
    {
      name: "routed alert events match the real rehearsal-to-ccir router",
      ok: routedRevise.alerts.length === 1 &&
        routedRevise.alerts[0].severity === revisePath.alerts[0].severity &&
        routedRevise.alerts[0].ccir_type === revisePath.alerts[0].ccir_type &&
        routedRevise.alerts[0].blocks_execution === revisePath.alerts[0].blocks_execution &&
        routedRevise.decision_packets.length === 1 &&
        routedRevise.decision_packets[0].decision_type ===
          revisePath.decision_packets[0].decision_type &&
        routedExecute.alerts.length === 1 &&
        routedExecute.alerts[0].severity === executePath.alerts[0].severity &&
        routedExecute.decision_packets.length === 0
    }
  ];

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  }

  const failed = checks.filter(check => !check.ok);
  console.log(JSON.stringify({
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length
  }, null, 2));

  return failed.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(runFixtures());
}

module.exports = { projectRehearsalEvents };
