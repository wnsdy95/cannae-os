#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function roleUnavailable(event) {
  return new Set([...(event.unavailable_roles || []), event.role].filter(Boolean));
}

function findSuccessor(rule, unavailable) {
  return (rule.successors || []).find(role => !unavailable.has(role)) || null;
}

function runContinuityDrill(plan, event) {
  const unavailable = roleUnavailable(event);
  const successionByRole = new Map((plan.succession_rules || []).map(rule => [rule.from_role, rule]));
  const activated = [];
  const blockedFunctions = [];

  for (const fn of plan.essential_functions || []) {
    if (!unavailable.has(fn.owner_role)) continue;
    const rule = successionByRole.get(fn.owner_role);
    const successor = rule ? findSuccessor(rule, unavailable) : null;
    if (!successor || !(fn.backup_roles || []).includes(successor)) {
      blockedFunctions.push({
        function_id: fn.function_id,
        owner_role: fn.owner_role,
        reason: successor ? "SUCCESSOR_NOT_AUTHORIZED_BACKUP" : "NO_AVAILABLE_SUCCESSOR"
      });
      continue;
    }
    activated.push({
      function_id: fn.function_id,
      from_role: fn.owner_role,
      acting_role: successor,
      authority_limits: rule.authority_limits || [],
      source_of_truth_files: fn.source_of_truth_files || [],
      handoff_required: fn.handoff_required === true
    });
  }

  const rotation = (plan.rotation_windows || []).find(item => item.role === event.role);
  const requiredActions = [
    "Generate or refresh HandoffPacket.",
    "Notify Commander, CoS, S6, and Recorder as applicable.",
    "Update event log and current projection.",
    "Run incoming role backbrief before execution.",
    "Record AAR/readiness update after continuity drill."
  ];
  if (rotation && rotation.rehearsal_required) {
    requiredActions.push("Run focused rehearsal before high-risk execution.");
  }

  const commanderUnavailable = unavailable.has("COMMANDER");
  const pausedFunctions = commanderUnavailable
    ? plan.degradation_policy.functions_to_pause
    : (blockedFunctions.length ? plan.degradation_policy.functions_to_pause : []);

  return {
    schema_version: "0.1",
    type: "ContinuityDrillResult",
    plan_id: plan.id,
    mission_id: plan.mission_id,
    event_id: event.id,
    event_type: event.event_type,
    unavailable_roles: [...unavailable],
    generated_at: "2026-06-19T12:30:00+09:00",
    activated_successions: activated,
    blocked_functions: blockedFunctions,
    paused_functions: pausedFunctions || [],
    commander_retained_decisions: plan.degradation_policy.commander_retained_decisions || [],
    required_actions: requiredActions,
    status: blockedFunctions.length ? "degraded" : "covered"
  };
}

function main() {
  const [, , planArg, eventArg] = process.argv;
  if (!planArg || !eventArg) {
    console.error("Usage: node continuity-drill-runner.js <continuity-plan.json> <continuity-event.json>");
    process.exit(2);
  }
  const result = runContinuityDrill(readJson(planArg), readJson(eventArg));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === "covered" || result.status === "degraded" ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { runContinuityDrill };
