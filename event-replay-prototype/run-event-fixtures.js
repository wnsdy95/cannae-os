#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { replay } = require("./replay");
const { projectionToDashboardState } = require("../dashboard-ui-prototype/render-state");

const ROOT = path.resolve(__dirname, "..");
const fixturePath = path.join(ROOT, "event-fixtures", "demo-events.json");
const events = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const projection = replay(events);
const dashboard = projectionToDashboardState(projection);

const offsetOrderingProjection = replay([
  {
    event_id: "EVT-OFFSET-001",
    mission_id: "M-OFFSET-001",
    event_type: "MissionCreated",
    actor: "USER",
    timestamp: "2026-06-18T11:00:00+09:00",
    payload: {
      title: "Offset Ordering",
      mission_statement: "Verify offset-aware event replay.",
      intent: "AAR must apply after mission creation."
    }
  },
  {
    event_id: "EVT-OFFSET-002",
    mission_id: "M-OFFSET-001",
    event_type: "AARIssued",
    actor: "EVALUATOR",
    timestamp: "2026-06-18T02:30:00Z",
    payload: {
      aar_id: "AAR-OFFSET-001",
      summary: "AAR occurs after MissionCreated in absolute time."
    }
  }
]);

const s6Projection = replay([
  {
    event_id: "EVT-ACTOR-001",
    mission_id: "M-ACTOR-001",
    event_type: "MissionCreated",
    actor: "USER",
    timestamp: "2026-06-18T11:00:00+09:00",
    payload: {
      title: "Actor Projection",
      mission_statement: "Verify approval actor projection.",
      intent: "Preserve tool request actor."
    }
  },
  {
    event_id: "EVT-ACTOR-002",
    mission_id: "M-ACTOR-001",
    event_type: "ToolRequestCreated",
    actor: "S6",
    timestamp: "2026-06-18T11:01:00+09:00",
    payload: {
      tool_request_id: "TR-ACTOR-001",
      tool: "release",
      action: "publish_final",
      target: "final.output"
    }
  },
  {
    event_id: "EVT-ACTOR-003",
    mission_id: "M-ACTOR-001",
    event_type: "ApprovalRequested",
    actor: "S6",
    timestamp: "2026-06-18T11:02:00+09:00",
    payload: {
      approval_id: "AR-ACTOR-001",
      tool_request_id: "TR-ACTOR-001",
      status: "pending"
    }
  }
]);
const s6Dashboard = projectionToDashboardState(s6Projection);

const checks = [
  {
    name: "mission is completed after AAR",
    ok: projection.mission && projection.mission.status === "complete"
  },
  {
    name: "current OPORD is retained",
    ok: projection.current_order === "OPORD-DEMO-001"
  },
  {
    name: "task order is projected",
    ok: projection.tasks["T-DEMO-001"] && projection.tasks["T-DEMO-001"].assigned_to === "S3"
  },
  {
    name: "green request executed",
    ok: projection.tool_requests["TR-DEMO-001"] && projection.tool_requests["TR-DEMO-001"].status === "executed"
  },
  {
    name: "red request remains blocked",
    ok: projection.tool_requests["TR-DEMO-002"] && projection.tool_requests["TR-DEMO-002"].blocked === true
  },
  {
    name: "pending approval retained",
    ok: projection.pending_approvals["AR-DEMO-001"] && projection.pending_approvals["AR-DEMO-001"].status === "pending"
  },
  {
    name: "sitrep summary retained",
    ok: projection.latest_sitrep && projection.latest_sitrep.summary.includes("Red deploy request blocked")
  },
  {
    name: "evidence and AAR counts retained",
    ok: projection.evidence_count === 1 && projection.aar_count === 1
  },
  {
    name: "readiness update retained",
    ok: projection.readiness["S3:runtime prototype"] === "P"
  },
  {
    name: "dashboard exposes commander approval queue",
    ok: dashboard.approvals.length === 1 && dashboard.approvals[0].action === "deploy_production"
  },
  {
    name: "dashboard mission risk reflects blocked request",
    ok: dashboard.mission.risk === "High"
  },
  {
    name: "offset-aware replay keeps AAR after mission creation",
    ok: offsetOrderingProjection.mission && offsetOrderingProjection.mission.status === "complete"
  },
  {
    name: "invalid event timestamp is rejected",
    ok: (() => {
      try {
        replay([{ event_id: "EVT-BAD-TIME", event_type: "MissionCreated", timestamp: "not-a-time", payload: {} }]);
        return false;
      } catch (error) {
        return /INVALID_EVENT_TIMESTAMP/.test(error.message);
      }
    })()
  },
  {
    name: "dashboard approval row preserves tool request actor",
    ok: s6Dashboard.approvals.length === 1 && s6Dashboard.approvals[0].actor === "S6"
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

process.exit(failed.length === 0 ? 0 : 1);
