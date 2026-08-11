#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const MS_PER_MINUTE = 60 * 1000;
const ARTIFACT_ID_FIELDS = new Set([
  "artifact_id",
  "board_decision_id",
  "context_release_id",
  "decision_packet_id",
  "evidence_id",
  "handoff_packet_id",
  "order_id",
  "release_review_id",
  "report_id",
  "sitrep_id"
]);
const ARTIFACT_LIST_FIELDS = new Set(["artifact_ids", "artifact_refs", "evidence_refs", "source_of_truth_refs"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asList(value, key) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value[key])) return value[key];
  return [];
}

function collectAvailableArtifacts(eventLog, missionId = null) {
  const available = new Set();
  const visit = (value, key = "") => {
    if (typeof value === "string" && ARTIFACT_ID_FIELDS.has(key)) {
      available.add(value);
    } else if (Array.isArray(value)) {
      if (ARTIFACT_LIST_FIELDS.has(key)) {
        value.filter(item => typeof item === "string").forEach(item => available.add(item));
      } else {
        value.forEach(item => visit(item));
      }
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey));
    }
  };
  for (const event of eventLog) {
    if (missionId && event.mission_id !== missionId) continue;
    visit(event.payload || {});
  }
  return available;
}

function referenceTime(eventLog, events) {
  let latest = null;
  for (const event of eventLog) {
    const time = Date.parse(event.timestamp);
    if (!Number.isFinite(time)) {
      throw new Error(`INVALID_EVENT_TIMESTAMP: ${event.event_id || "unknown"} has timestamp ${event.timestamp || "missing"}.`);
    }
    if (latest === null || time > latest) latest = time;
  }
  if (latest !== null) return new Date(latest);
  for (const definition of events) {
    const anchor = Date.parse(definition.cadence && definition.cadence.anchor);
    if (Number.isFinite(anchor) && (latest === null || anchor > latest)) latest = anchor;
  }
  return latest === null ? null : new Date(latest);
}

function nextIntervalOccurrence(cadence, now) {
  const anchor = Date.parse(cadence.anchor);
  const intervalMs = Number(cadence.interval_minutes) * MS_PER_MINUTE;
  if (!Number.isFinite(anchor) || !Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  if (anchor > now.getTime()) return new Date(anchor);
  const steps = Math.floor((now.getTime() - anchor) / intervalMs) + 1;
  return new Date(anchor + steps * intervalMs);
}

function nextCronOccurrence(cadence, now) {
  const parts = String(cadence.cron_expression || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (dayOfMonth !== "*" || month !== "*") return null;
  const minuteValue = Number(minute);
  const hourValue = Number(hour);
  if (!Number.isInteger(minuteValue) || !Number.isInteger(hourValue)) return null;
  if (dayOfWeek !== "*" && !Number.isInteger(Number(dayOfWeek))) return null;
  const candidate = new Date(now.getTime());
  candidate.setUTCHours(hourValue, minuteValue, 0, 0);
  for (let day = 0; day < 8; day += 1) {
    const dayMatches = dayOfWeek === "*" || Number(dayOfWeek) === candidate.getUTCDay();
    if (dayMatches && candidate.getTime() > now.getTime()) return candidate;
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return null;
}

function nextOccurrence(definition, now) {
  const cadence = definition.cadence || {};
  if (cadence.kind === "interval") return nextIntervalOccurrence(cadence, now);
  if (cadence.kind === "cron") return nextCronOccurrence(cadence, now);
  return null;
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

function proposeSchedule(events, eventLog, options = {}) {
  const definitions = asList(events, "events");
  const missionIds = new Set(definitions.map(item => item.mission_id).filter(Boolean));
  if (missionIds.size > 1) throw new Error("MIXED_MISSION_DEFINITIONS: schedule one mission at a time.");
  const missionId = [...missionIds][0] || null;
  const log = asList(eventLog, "events").filter(event => !missionId || event.mission_id === missionId);
  const available = collectAvailableArtifacts(log, missionId);
  let now;
  if (options.asOf !== undefined) {
    const parsed = Date.parse(options.asOf);
    if (!Number.isFinite(parsed)) throw new Error(`INVALID_AS_OF: ${options.asOf}.`);
    now = new Date(parsed);
  } else {
    now = referenceTime(log, definitions);
  }

  const proposals = [];
  const windows = [];
  for (const definition of definitions) {
    const requiredInputs = definition.required_inputs || {};
    const inputs = [
      ...(requiredInputs.read_ahead || []),
      ...(requiredInputs.decision_packets_due || [])
    ];
    const inputs_ready = inputs.filter(input => available.has(input));
    const inputs_missing = inputs.filter(input => !available.has(input));
    const occurrence = now === null ? null : nextOccurrence(definition, now);

    const blocking_reasons = [];
    if (occurrence === null) {
      blocking_reasons.push("Cadence could not be evaluated from the event log; CoS must set the next occurrence.");
    }
    for (const input of inputs_missing) {
      blocking_reasons.push(`Required input ${input} is not present in the event log.`);
    }

    const state = blocking_reasons.length === 0 ? "proposed" : "blocked";
    const proposed_agenda = [
      ...(requiredInputs.decision_packets_due || []).map(packet => `Decide on decision packet ${packet}.`),
      ...(definition.expected_outputs || []).map(output => `Produce: ${output}`)
    ];

    proposals.push({
      event_id: definition.id,
      event_name: definition.name,
      event_class: definition.event_class,
      proposed_occurrence: occurrence === null ? null : occurrence.toISOString(),
      state,
      inputs_ready,
      inputs_missing,
      blocking_reasons,
      proposed_agenda
    });

    if (occurrence !== null) {
      windows.push({
        event_id: definition.id,
        participants: new Set(definition.participants || []),
        start: occurrence.getTime(),
        end: occurrence.getTime() + Number(definition.duration_minutes || 1) * MS_PER_MINUTE
      });
    }
  }

  const conflicts = [];
  for (let left = 0; left < windows.length; left += 1) {
    for (let right = left + 1; right < windows.length; right += 1) {
      if (!overlaps(windows[left], windows[right])) continue;
      const eventIds = [windows[left].event_id, windows[right].event_id];
      conflicts.push({
        conflict_type: "overlapping_events",
        event_ids: eventIds,
        detail: `Proposed occurrences of ${eventIds[0]} and ${eventIds[1]} overlap in time.`
      });
      const shared = [...windows[left].participants].filter(role => windows[right].participants.has(role));
      if (shared.length > 0) {
        conflicts.push({
          conflict_type: "participant_collision",
          event_ids: eventIds,
          detail: `Participants ${shared.join(", ")} are double-booked across ${eventIds[0]} and ${eventIds[1]}.`,
          shared_participants: shared
        });
      }
    }
  }

  const confirmation_queue = [
    ...proposals.map(proposal => ({
      action: proposal.state === "proposed" ? "confirm_schedule" : "resolve_blockers",
      authority: "COS",
      event_ids: [proposal.event_id],
      note: proposal.state === "proposed"
        ? `Confirm next occurrence of ${proposal.event_name} before it is placed on the battle rhythm.`
        : `Resolve blockers for ${proposal.event_name} before it can be scheduled.`
    })),
    ...conflicts.map(conflict => ({
      action: "resolve_conflict",
      authority: "COS",
      event_ids: conflict.event_ids,
      note: conflict.detail
    }))
  ];

  const resolvedMissionId = missionId || (log[0] && log[0].mission_id);
  const missionSuffix = String(resolvedMissionId || "M-UNKNOWN").replace(/^[A-Z]+-/, "");

  return {
    schema_version: "0.1",
    type: "BattleRhythmSchedulerProposal",
    id: `BRS-${missionSuffix}`,
    mission_id: resolvedMissionId,
    generated_at: now === null ? null : now.toISOString(),
    generated_by: "COS",
    event_log_refs: log.map(event => event.event_id).filter(Boolean),
    proposals,
    conflicts,
    confirmation_queue,
    auto_execution: false,
    classification: "internal",
    status: "pending"
  };
}

function main() {
  const eventsPath = process.argv[2];
  const eventLogPath = process.argv[3];
  const asOfIndex = process.argv.indexOf("--as-of");
  if (!eventsPath || !eventLogPath) {
    console.error("Usage: node battle-rhythm-scheduler.js <battle-rhythm-events.json> <event-log.json> [--as-of <timestamp>]");
    process.exit(2);
  }
  if (asOfIndex !== -1 && (!process.argv[asOfIndex + 1] || process.argv[asOfIndex + 1].startsWith("--"))) {
    console.error("--as-of requires a timestamp.");
    process.exit(2);
  }
  const events = readJson(path.resolve(eventsPath));
  const eventLog = readJson(path.resolve(eventLogPath));
  process.stdout.write(`${JSON.stringify(proposeSchedule(events, eventLog, {
    ...(asOfIndex === -1 ? {} : { asOf: process.argv[asOfIndex + 1] })
  }), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { proposeSchedule, nextOccurrence, collectAvailableArtifacts, referenceTime };
