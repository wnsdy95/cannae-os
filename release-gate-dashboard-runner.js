#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function eventPayload(event) {
  return event.payload || event;
}

function classFor(decision) {
  if (decision.final_decision === "allow_scoped_execution_and_release") return "green";
  if (decision.final_decision === "blocked_pending_release_review") return "red";
  if (decision.final_decision === "blocked_pending_authority") return "amber";
  if (decision.final_decision === "prohibit") return "black";
  return "gray";
}

function labelFor(decision) {
  if (decision.final_decision === "allow_scoped_execution_and_release") return "RELEASED";
  if (decision.final_decision === "blocked_pending_release_review") return "REVIEW";
  if (decision.final_decision === "blocked_pending_authority") return "AUTH";
  if (decision.final_decision === "prohibit") return "PROHIBIT";
  return "GATE";
}

function titleFor(decision) {
  return `${decision.tool_request_id} ${decision.final_decision}`;
}

function bodyFor(decision) {
  const release = decision.release_review || {};
  if (decision.final_decision === "allow_scoped_execution_and_release") {
    return `Authority and ${release.review_id || "release review"} allow ${decision.release_target}.`;
  }
  if (decision.final_decision === "blocked_pending_release_review") {
    return `Authority allows execution, but ${decision.release_target} is blocked pending release review.`;
  }
  if (decision.final_decision === "blocked_pending_authority") {
    return `Release review cannot override authority block for ${decision.tool_request_id}.`;
  }
  return (decision.reasons || []).join(" ");
}

function projectReleaseGateDashboard(input) {
  const decisions = (input.events || [])
    .filter(event => event.event_type === "ReleaseGateDecided" || eventPayload(event).type === "RELEASE_GATE_DECISION_EVENT")
    .map(event => eventPayload(event))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(decision => ({
      id: decision.id,
      tool_request_id: decision.tool_request_id,
      actor: decision.actor,
      release_target: decision.release_target,
      final_decision: decision.final_decision,
      blocked: decision.blocked,
      authority: decision.authority,
      release_review: decision.release_review,
      reasons: decision.reasons || [],
      evidence: decision.evidence || [],
      dashboard: {
        class: classFor(decision),
        label: labelFor(decision),
        title: titleFor(decision),
        body: bodyFor(decision)
      }
    }));

  const summary = decisions.reduce((counts, decision) => {
    counts.total += 1;
    if (decision.final_decision === "allow_scoped_execution_and_release") counts.released += 1;
    if (decision.final_decision === "blocked_pending_release_review") counts.blocked_release_review += 1;
    if (decision.final_decision === "blocked_pending_authority") counts.blocked_authority += 1;
    if (decision.final_decision === "prohibit") counts.prohibited += 1;
    return counts;
  }, { total: 0, released: 0, blocked_release_review: 0, blocked_authority: 0, prohibited: 0 });

  return {
    mission_id: input.mission_id,
    generated_at: input.generated_at,
    summary,
    release_gate_decisions: decisions
  };
}

function main() {
  const [, , eventsArg] = process.argv;
  if (!eventsArg) {
    console.error("Usage: node release-gate-dashboard-runner.js <release-gate-events.json>");
    process.exit(2);
  }

  const projection = projectReleaseGateDashboard(readJson(eventsArg));
  process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { projectReleaseGateDashboard };
