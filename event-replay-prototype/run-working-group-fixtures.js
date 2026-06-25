#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function projectWorkingGroups(events) {
  const state = {
    working_groups: {},
    decision_packets: {},
    board_decisions: {}
  };

  for (const event of events.slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))) {
    const payload = event.payload || {};

    if (event.event_type === "WorkingGroupOpened") {
      state.working_groups[payload.working_group_id] = {
        name: payload.name,
        chair: payload.chair,
        participants: payload.participants || [],
        deliverables: payload.deliverables || [],
        disband_condition: payload.disband_condition || [],
        status: "open"
      };
    }

    if (event.event_type === "DecisionPacketPrepared") {
      state.decision_packets[payload.decision_packet_id] = {
        working_group_id: payload.working_group_id,
        decision_type: payload.decision_type,
        recommended_option: payload.recommended_option,
        status: "prepared"
      };
    }

    if (event.event_type === "BoardDecisionMade") {
      state.board_decisions[payload.decision_packet_id] = {
        decision: payload.decision,
        rationale: payload.rationale,
        actor: event.actor
      };
      if (state.decision_packets[payload.decision_packet_id]) {
        state.decision_packets[payload.decision_packet_id].status = "decided";
      }
    }

    if (event.event_type === "WorkingGroupClosed" && state.working_groups[payload.working_group_id]) {
      state.working_groups[payload.working_group_id].status = "closed";
      state.working_groups[payload.working_group_id].closure_reason = payload.closure_reason;
    }
  }

  return state;
}

function projectWorkingGroupDashboardState(events) {
  const projection = projectWorkingGroups(events);
  const missionId = events.find(event => event.mission_id)?.mission_id || "M-UNKNOWN";

  const workingGroups = Object.entries(projection.working_groups)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, group]) => ({
      id,
      name: group.name,
      chair: group.chair,
      status: group.status,
      deliverables: group.deliverables,
      closure_reason: group.closure_reason
    }));

  const decisionPackets = Object.entries(projection.decision_packets)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, packet]) => ({
      id,
      working_group_id: packet.working_group_id,
      decision_type: packet.decision_type,
      recommended_option: packet.recommended_option,
      status: packet.status,
      decision: projection.board_decisions[id]?.decision
    }));

  const boardDecisions = Object.entries(projection.board_decisions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([decision_packet_id, decision]) => ({
      decision_packet_id,
      decision: decision.decision,
      rationale: decision.rationale,
      actor: decision.actor
    }));

  return {
    mission_id: missionId,
    working_groups: workingGroups,
    decision_packets: decisionPackets,
    board_decisions: boardDecisions
  };
}

function runFixture() {
  const ROOT = path.resolve(__dirname, "..");
  const events = JSON.parse(fs.readFileSync(path.join(ROOT, "event-fixtures", "working-group-event-fixtures.json"), "utf8"));
  const projection = projectWorkingGroups(events);

  const checks = [
    {
      name: "working group opens with CoS chair",
      ok: projection.working_groups["WG-DEMO-001"] && projection.working_groups["WG-DEMO-001"].chair === "COS"
    },
    {
      name: "decision packet is prepared",
      ok: projection.decision_packets["DP-DEMO-001"] && projection.decision_packets["DP-DEMO-001"].status === "decided"
    },
    {
      name: "board decision is recorded",
      ok: projection.board_decisions["DP-DEMO-001"] && projection.board_decisions["DP-DEMO-001"].decision === "reject"
    },
    {
      name: "working group closes after decision",
      ok: projection.working_groups["WG-DEMO-001"] && projection.working_groups["WG-DEMO-001"].status === "closed"
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
  process.exit(runFixture());
}

module.exports = { projectWorkingGroups, projectWorkingGroupDashboardState };
