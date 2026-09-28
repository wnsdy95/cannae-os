#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { proposeSchedule } = require("./battle-rhythm-scheduler");

const ROOT = __dirname;

function readJson(relativePath) {
  return require(path.join(ROOT, relativePath));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const boardEvent = readJson("sample-payloads/valid-battle-rhythm-event.json");

const fullLog = [
  {
    event_id: "EVT-WG-001",
    mission_id: "M-DEMO-001",
    event_type: "WorkingGroupOpened",
    actor: "COS",
    timestamp: "2026-06-18T12:00:00+09:00",
    payload: { working_group_id: "WG-DEMO-001" }
  },
  {
    event_id: "EVT-WG-002",
    mission_id: "M-DEMO-001",
    event_type: "DecisionPacketPrepared",
    actor: "COS",
    timestamp: "2026-06-18T12:08:00+09:00",
    payload: { working_group_id: "WG-DEMO-001", decision_packet_id: "DP-DEMO-001" }
  },
  {
    event_id: "EVT-WG-005",
    mission_id: "M-DEMO-001",
    event_type: "SITREPIssued",
    actor: "COS",
    timestamp: "2026-06-18T12:15:00+09:00",
    payload: { sitrep_id: "SITREP-DEMO-001" }
  }
];

function collidingWorkingGroup() {
  const event = clone(boardEvent);
  event.id = "BRE-DEMO-003";
  event.name = "Red Team Findings Working Group";
  event.event_class = "working_group";
  event.chair = "COS";
  event.participants = ["COS", "S2", "RED_TEAM"];
  event.quorum = { minimum_participants: 2, required_roles: ["COS"] };
  event.required_inputs = { read_ahead: [], decision_packets_due: [] };
  event.expected_outputs = ["Risk finding list for the commander decision board."];
  return event;
}

const outputs = [];

const fixtures = [
  {
    name: "weekly board with ready inputs schedules next occurrence",
    validate() {
      const proposal = proposeSchedule([clone(boardEvent)], clone(fullLog));
      outputs.push(proposal);
      assert.strictEqual(proposal.type, "BattleRhythmSchedulerProposal");
      assert.strictEqual(proposal.mission_id, "M-DEMO-001");
      const board = proposal.proposals[0];
      assert.strictEqual(board.state, "proposed");
      assert.strictEqual(board.proposed_occurrence, "2026-06-25T03:00:00.000Z");
      assert.deepStrictEqual(board.inputs_missing, []);
      assert.deepStrictEqual(board.inputs_ready, ["SITREP-DEMO-001", "DP-DEMO-001"]);
      assert(board.proposed_agenda.some(item => /DP-DEMO-001/.test(item)), "expected packet on agenda");
      assert.deepStrictEqual(proposal, readJson("sample-payloads/valid-battle-rhythm-scheduler.json"));
    }
  },
  {
    name: "missing read-ahead blocks the event instead of silently scheduling it",
    validate() {
      const logWithoutSitrep = fullLog.filter(event => event.event_type !== "SITREPIssued");
      const proposal = proposeSchedule([clone(boardEvent)], clone(logWithoutSitrep));
      outputs.push(proposal);
      const board = proposal.proposals[0];
      assert.strictEqual(board.state, "blocked");
      assert.deepStrictEqual(board.inputs_missing, ["SITREP-DEMO-001"]);
      assert(board.blocking_reasons.some(reason => /SITREP-DEMO-001/.test(reason)), "expected blocking reason for read-ahead");
      const queueEntry = proposal.confirmation_queue.find(item => item.event_ids.includes("BRE-DEMO-001"));
      assert(queueEntry, "expected blocked event in confirmation queue");
      assert.strictEqual(queueEntry.action, "resolve_blockers");
    }
  },
  {
    name: "participant collision between two events is detected as a conflict",
    validate() {
      const proposal = proposeSchedule([clone(boardEvent), collidingWorkingGroup()], clone(fullLog));
      outputs.push(proposal);
      const overlap = proposal.conflicts.find(conflict => conflict.conflict_type === "overlapping_events");
      assert(overlap, "expected overlapping_events conflict");
      assert.deepStrictEqual(overlap.event_ids.slice().sort(), ["BRE-DEMO-001", "BRE-DEMO-003"]);
      const collision = proposal.conflicts.find(conflict => conflict.conflict_type === "participant_collision");
      assert(collision, "expected participant_collision conflict");
      assert.deepStrictEqual(collision.shared_participants.slice().sort(), ["COS", "RED_TEAM"]);
      const queueEntry = proposal.confirmation_queue.find(item => item.action === "resolve_conflict");
      assert(queueEntry, "expected conflict in confirmation queue");
      assert.strictEqual(queueEntry.authority, "COS");
    }
  },
  {
    name: "scheduler output never marks an event executed",
    validate() {
      assert(outputs.length >= 3, "expected prior fixtures to produce outputs");
      for (const proposal of outputs) {
        assert.strictEqual(proposal.auto_execution, false);
        assert.strictEqual(proposal.status, "pending");
        for (const item of proposal.proposals) {
          assert(["proposed", "blocked"].includes(item.state), `unexpected proposal state ${item.state}`);
          assert(!("executed" in item), "proposal must not carry an executed flag");
        }
        for (const entry of proposal.confirmation_queue) {
          assert(["confirm_schedule", "resolve_blockers", "resolve_conflict"].includes(entry.action));
          assert(["USER", "COMMANDER", "COS"].includes(entry.authority));
        }
      }
    }
  },
  {
    name: "arbitrary strings and foreign-mission events cannot satisfy required inputs",
    validate() {
      const misleadingLog = [
        {
          event_id: "EVT-ERROR-001",
          mission_id: "M-DEMO-001",
          event_type: "ToolFailed",
          actor: "S6",
          timestamp: "2026-06-18T12:15:00+09:00",
          payload: { error_message: "SITREP-DEMO-001 and DP-DEMO-001 were not produced." }
        },
        {
          event_id: "EVT-FOREIGN-001",
          mission_id: "M-OTHER-001",
          event_type: "DecisionPacketPrepared",
          actor: "COS",
          timestamp: "2026-06-18T12:16:00+09:00",
          payload: { decision_packet_id: "DP-DEMO-001", sitrep_id: "SITREP-DEMO-001" }
        }
      ];
      const proposal = proposeSchedule([clone(boardEvent)], misleadingLog);
      assert.strictEqual(proposal.proposals[0].state, "blocked");
      assert.deepStrictEqual(proposal.proposals[0].inputs_missing, ["SITREP-DEMO-001", "DP-DEMO-001"]);
      assert.deepStrictEqual(proposal.event_log_refs, ["EVT-ERROR-001"]);
    }
  },
  {
    name: "invalid relevant event timestamp is rejected",
    validate() {
      assert.throws(
        () => proposeSchedule([clone(boardEvent)], [{
          event_id: "EVT-BAD-TIME",
          mission_id: "M-DEMO-001",
          timestamp: "not-a-time",
          payload: {}
        }]),
        /INVALID_EVENT_TIMESTAMP/
      );
    }
  }
];

let passed = 0;
for (const fixture of fixtures) {
  try {
    fixture.validate();
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.stack || error.message);
  }
}

const failed = fixtures.length - passed;
console.log(JSON.stringify({
  total: fixtures.length,
  passed,
  failed
}, null, 2));

process.exit(failed === 0 ? 0 : 1);
