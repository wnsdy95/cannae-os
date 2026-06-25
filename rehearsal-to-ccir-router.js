#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SEVERITY_TO_ALERT = {
  low: "Watch",
  medium: "Amber",
  high: "Red",
  critical: "Black"
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isSensitive(text) {
  return /secret|token|credential|password|private[_ -]?key|eefi|restricted/i.test(String(text || ""));
}

function needsDecision(text, severity) {
  return severity === "high"
    || severity === "critical"
    || /approval|commander|deploy|credential|scope|frago|authority|risk/i.test(String(text || ""));
}

function decisionType(text, severity) {
  if (/scope|frago/i.test(text)) return "scope";
  if (/approval|authority|deploy|credential/i.test(text)) return "approval";
  if (severity === "high" || severity === "critical") return "risk_acceptance";
  return "priority";
}

function makeAlert(rehearsal, index, fields) {
  return {
    schema_version: "0.1",
    type: "CCIRAlert",
    id: `ALERT-${rehearsal.id}-${String(index + 1).padStart(3, "0")}`,
    mission_id: rehearsal.mission_id,
    source_event_id: rehearsal.id,
    status: fields.blocks_execution ? "blocked" : "pending",
    sensitive: false,
    ...fields
  };
}

function makeDecisionPacket(rehearsal, index, friction) {
  const text = `${friction.issue} ${friction.mitigation}`;
  const packetType = decisionType(text, friction.severity);
  const recommended = friction.severity === "critical" ? "OPT-REJECT" : "OPT-REVISE";

  return {
    schema_version: "0.1",
    type: "DecisionPacket",
    id: `DP-${rehearsal.id}-${String(index + 1).padStart(3, "0")}`,
    mission_id: rehearsal.mission_id,
    prepared_by: rehearsal.facilitator || "COS",
    classification: rehearsal.classification || "internal",
    decision_type: packetType,
    commander_question: `How should the team handle rehearsal friction: ${friction.issue}?`,
    background: [
      `Rehearsal ${rehearsal.id} found ${friction.severity} friction owned by ${friction.owner}.`,
      `Mitigation proposed: ${friction.mitigation}`
    ],
    options: [
      {
        option_id: "OPT-REVISE",
        summary: "Revise the order or execution sequence before proceeding.",
        decision: "revise",
        benefit: ["Prevents distorted execution before live action."],
        risk: ["Delays execution while the order or rehearsal is corrected."],
        tradeoff: ["Prioritizes control and shared understanding over speed."]
      },
      {
        option_id: "OPT-APPROVE-CONSTRAINTS",
        summary: "Approve execution only with the proposed mitigation and post-action evidence.",
        decision: "approve_with_constraints",
        benefit: ["Allows limited progress while keeping commander constraints explicit."],
        risk: ["Residual friction may still affect execution."],
        tradeoff: ["Accepts controlled risk to preserve tempo."]
      },
      {
        option_id: "OPT-REJECT",
        summary: "Reject execution until the friction is removed.",
        decision: "reject",
        benefit: ["Avoids executing through an unresolved high-risk condition."],
        risk: ["Mission output is delayed or requires FRAGO."],
        tradeoff: ["Prioritizes safety and authority discipline over immediate completion."]
      }
    ],
    recommended_option: recommended,
    risk: {
      level: friction.severity,
      summary: friction.issue,
      mitigations: [friction.mitigation]
    },
    authority_required: packetType === "priority" ? ["COS"] : ["COMMANDER"],
    evidence: [
      `source rehearsal: ${rehearsal.id}`,
      `friction owner: ${friction.owner}`,
      `parent order: ${rehearsal.parent_order}`
    ],
    deadline: "2026-06-18T14:00:00+09:00",
    if_no_decision: "Hold execution and issue SITREP with unresolved rehearsal friction.",
    status: "pending"
  };
}

function routeRehearsal(rehearsal) {
  const alerts = [];
  const decisionPackets = [];

  for (const [index, friction] of (rehearsal.friction_points || []).entries()) {
    const text = `${friction.issue} ${friction.mitigation}`;
    const sensitive = isSensitive(text);
    const blocks = friction.severity === "high" || friction.severity === "critical";

    alerts.push(makeAlert(rehearsal, alerts.length, {
      ccir_type: sensitive ? "EEFI" : blocks ? "DECISION_POINT" : "FFIR",
      severity: sensitive ? "Black" : SEVERITY_TO_ALERT[friction.severity] || "Amber",
      owner: friction.owner || "COS",
      title: `Rehearsal friction: ${friction.issue}`,
      why_it_matters: `The rehearsal found ${friction.severity} friction before execution. Mitigation: ${friction.mitigation}`,
      recommended_route: blocks ? "Commander Board" : "Current Ops Sync",
      required_decision: blocks ? "Revise, approve with constraints, reject, or issue FRAGO." : "Track mitigation before execution.",
      deadline: "before execution",
      sensitive,
      blocks_execution: blocks || sensitive
    }));

    if (needsDecision(text, friction.severity)) {
      decisionPackets.push(makeDecisionPacket(rehearsal, index, friction));
    }
  }

  for (const [index, point] of (rehearsal.decision_points || []).entries()) {
    if (/^none$/i.test(String(point).trim())) continue;
    const sensitive = isSensitive(point);
    const decisionRequired = needsDecision(point, "medium");

    alerts.push(makeAlert(rehearsal, alerts.length, {
      ccir_type: sensitive ? "EEFI" : "DECISION_POINT",
      severity: sensitive ? "Black" : decisionRequired ? "Red" : "Amber",
      owner: "COS",
      title: `Rehearsal decision point ${index + 1}`,
      why_it_matters: point,
      recommended_route: decisionRequired ? "Commander Board" : "Current Ops Sync",
      required_decision: decisionRequired ? point : "Monitor and report if triggered.",
      deadline: "before execution",
      sensitive,
      blocks_execution: sensitive || decisionRequired
    }));

    if (decisionRequired || sensitive) {
      decisionPackets.push(makeDecisionPacket(rehearsal, (rehearsal.friction_points || []).length + index, {
        issue: point,
        severity: sensitive ? "critical" : "medium",
        mitigation: sensitive ? "Block release and require redaction review." : "Route decision before execution.",
        owner: "COS"
      }));
    }
  }

  return {
    schema_version: "0.1",
    type: "RehearsalCCIRRouting",
    rehearsal_id: rehearsal.id,
    mission_id: rehearsal.mission_id,
    generated_at: "2026-06-18T13:55:00+09:00",
    alerts,
    decision_packets: decisionPackets
  };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node rehearsal-to-ccir-router.js <rehearsal.json>");
    process.exit(2);
  }

  const rehearsal = readJson(path.resolve(process.cwd(), filePath));
  process.stdout.write(`${JSON.stringify(routeRehearsal(rehearsal), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { routeRehearsal };
