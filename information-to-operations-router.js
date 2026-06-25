#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasOutput(assessment, output) {
  return (assessment.recommended_outputs || []).includes(output);
}

function alertSeverity(ccirType, assessment) {
  if (ccirType === "EEFI" || assessment.operational_impact === "release_block") return "Black";
  if (ccirType === "DECISION_POINT" || assessment.commander_decision_required) return "Red";
  if (assessment.confidence === "low") return "Watch";
  return "Amber";
}

function alertOwner(ccirType) {
  if (ccirType === "PIR") return "S2";
  if (ccirType === "FFIR") return "S4";
  if (ccirType === "EEFI") return "S6";
  return "COS";
}

function makeAlerts(report, assessment) {
  return (assessment.ccir_classification || []).map((ccirType, index) => {
    const severity = alertSeverity(ccirType, assessment);
    const blocks = severity === "Red" || severity === "Black";
    return {
      schema_version: "0.1",
      type: "CCIRAlert",
      id: `ALERT-${assessment.id}-${String(index + 1).padStart(3, "0")}`,
      mission_id: assessment.mission_id,
      ccir_type: ccirType,
      severity,
      source_event_id: assessment.id,
      owner: alertOwner(ccirType),
      title: `${ccirType} from information assessment ${assessment.id}`,
      why_it_matters: assessment.assessment[0],
      recommended_route: blocks ? "Commander Board" : ccirType === "PIR" ? "Source Review Working Group" : "Current Ops Sync",
      required_decision: blocks ? "Approve scope change, issue FRAGO, block release, or request more information." : "Track in running estimate and report if trigger escalates.",
      deadline: "before changing tasking or releasing output",
      sensitive: ccirType === "EEFI" || report.eefi_risk === true,
      blocks_execution: blocks,
      status: blocks ? "blocked" : "pending"
    };
  });
}

function makeDecisionPacket(report, assessment) {
  if (!hasOutput(assessment, "DECISION_PACKET") && !assessment.commander_decision_required) return null;

  const decisionType = assessment.operational_impact === "frago_scope_change"
    ? "scope"
    : assessment.operational_impact === "release_block"
      ? "release"
      : "priority";

  return {
    schema_version: "0.1",
    type: "DecisionPacket",
    id: `DP-${assessment.id}`,
    mission_id: assessment.mission_id,
    prepared_by: "COS",
    classification: assessment.classification,
    decision_type: decisionType,
    commander_question: `How should we act on information assessment ${assessment.id}?`,
    background: [
      `Information report: ${report.id}`,
      `Summary: ${report.summary}`,
      `Assessment: ${assessment.assessment[0]}`
    ],
    options: [
      {
        option_id: "OPT-FRAGO",
        summary: "Issue FRAGO or scope-change order before tasking changes.",
        decision: "issue_frago",
        benefit: ["Keeps mission scope and authority changes explicit."],
        risk: ["Slows execution while downstream roles backbrief and rehearse."],
        tradeoff: ["Prioritizes intent preservation over speed."]
      },
      {
        option_id: "OPT-WATCH",
        summary: "Hold order change and keep the item in PIR/running estimate.",
        decision: "revise",
        benefit: ["Avoids overreacting to information before downstream impact is confirmed."],
        risk: ["May delay needed adjustment if the information is already decisive."],
        tradeoff: ["Preserves optionality while gathering more evidence."]
      },
      {
        option_id: "OPT-REJECT",
        summary: "Reject operational change and retain current order.",
        decision: "reject",
        benefit: ["Avoids unnecessary scope drift."],
        risk: ["Current plan may continue with an outdated assumption."],
        tradeoff: ["Prioritizes stability over adaptation."]
      }
    ],
    recommended_option: assessment.operational_impact === "frago_scope_change" ? "OPT-FRAGO" : "OPT-WATCH",
    risk: {
      level: assessment.operational_impact === "release_block" ? "critical" : "high",
      summary: assessment.assessment[0],
      mitigations: [
        "Preserve raw information separately from assessment.",
        "Require commander decision before changing tasking or release posture."
      ]
    },
    authority_required: ["COMMANDER"],
    evidence: [
      `information report: ${report.id}`,
      `intelligence assessment: ${assessment.id}`,
      ...assessment.key_facts.map(fact => `fact: ${fact}`)
    ],
    deadline: "2026-06-19T10:00:00+09:00",
    if_no_decision: "Hold execution changes and continue current OPORD while tracking PIR.",
    status: "pending"
  };
}

function makeSitrep(report, assessment) {
  if (!hasOutput(assessment, "SITREP") && assessment.operational_impact !== "sitrep") return null;

  return {
    id: `SITREP-${assessment.id}`,
    mission_id: assessment.mission_id,
    timestamp: "2026-06-19T09:20:00+09:00",
    status: assessment.commander_decision_required ? "blocked" : "in_progress",
    completed: [
      `Information report ${report.id} received and assessed.`
    ],
    in_progress: [
      "Updating running estimate and routing CCIR outputs."
    ],
    blocked: assessment.commander_decision_required
      ? [`Commander decision required for ${assessment.operational_impact}.`]
      : [],
    ccir: (assessment.ccir_classification || []).map(type => ({
      type,
      item: assessment.assessment[0],
      action: assessment.commander_decision_required ? "Route to commander board." : "Track in current ops."
    })),
    risk: assessment.information_gaps.length
      ? assessment.information_gaps
      : ["No additional information gaps identified."],
    next_action: [
      assessment.commander_decision_required ? "Prepare decision packet." : "Update running estimate.",
      hasOutput(assessment, "FRAGO_SCOPE_CHANGE") ? "Draft FRAGO scope change if approved." : "No FRAGO draft required."
    ]
  };
}

function makeFragoScopeChange(report, assessment) {
  if (!hasOutput(assessment, "FRAGO_SCOPE_CHANGE")) return null;

  return {
    schema_version: "0.1",
    type: "FRAGOScopeChange",
    id: `FSC-${assessment.id}`,
    mission_id: assessment.mission_id,
    parent_order: "OPORD-DEMO-001",
    issued_by: "COMMANDER",
    classification: assessment.classification,
    reason: assessment.assessment[0],
    changed_elements: ["tasks", "constraints"],
    unchanged_intent: [
      "Preserve commander intent unless explicitly changed by Commander.",
      "Do not change production, release, or credential authority without separate approval."
    ],
    scope_changes: [
      {
        element: "tasks",
        previous: "Current tasking follows the previous source-annex assumption.",
        revised: "Update tasking only after commander accepts the assessed information.",
        rationale: assessment.key_facts[0]
      }
    ],
    authority_changes: [],
    affected_roles: ["COMMANDER", "COS", "S2", "S3", "S6"],
    requires_backbrief: true,
    requires_rehearsal: true,
    not_an_annex_update_reason: "The information may alter task scope or constraints, so the change cannot be hidden inside a specialist annex.",
    issued_at: "2026-06-19T09:25:00+09:00"
  };
}

function routeInformation(report, assessment) {
  const alerts = hasOutput(assessment, "CCIR_ALERT") || assessment.ccir_classification.length
    ? makeAlerts(report, assessment)
    : [];
  const decisionPacket = makeDecisionPacket(report, assessment);
  const sitrep = makeSitrep(report, assessment);
  const fragoScopeChange = makeFragoScopeChange(report, assessment);

  return {
    schema_version: "0.1",
    type: "InformationOperationsRouting",
    mission_id: assessment.mission_id,
    information_report_id: report.id,
    intelligence_assessment_id: assessment.id,
    generated_at: "2026-06-19T09:30:00+09:00",
    running_estimate_update: {
      owner: assessment.assessed_by,
      key_facts: assessment.key_facts,
      assessment: assessment.assessment,
      information_gaps: assessment.information_gaps
    },
    alerts,
    decision_packet: decisionPacket,
    sitrep,
    frago_scope_change: fragoScopeChange,
    annex_update_recommendation: hasOutput(assessment, "ANNEX_UPDATE")
      ? "Update relevant annex after commander disposition and source verification."
      : "No annex update required."
  };
}

function main() {
  const [, , reportArg, assessmentArg] = process.argv;
  if (!reportArg || !assessmentArg) {
    console.error("Usage: node information-to-operations-router.js <information-report.json> <intelligence-assessment.json>");
    process.exit(2);
  }

  const report = readJson(path.resolve(process.cwd(), reportArg));
  const assessment = readJson(path.resolve(process.cwd(), assessmentArg));
  process.stdout.write(`${JSON.stringify(routeInformation(report, assessment), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { routeInformation };
