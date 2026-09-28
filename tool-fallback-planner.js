#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DATA_LOSS_ORDER = { none: 0, low: 1, medium: 2, high: 3 };
const CRITICALITIES = new Set(["low", "medium", "high", "critical"]);
const REQUIRED_AUTHORITY_CONDITIONS = [
  "named_in_readiness_report",
  "output_within_acceptance_criteria",
  "deadline_unchanged",
  "cost_cap_unchanged",
  "risk_decision_unchanged",
  "next_sitrep_report_required"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function findCapability(capabilities, toolId) {
  const tools = Array.isArray(capabilities) ? capabilities : capabilities.tools || [];
  return tools.find(tool => tool.tool_id === toolId) || null;
}

function assertDataLossRisk(value, context) {
  const risk = value || "none";
  if (!Object.prototype.hasOwnProperty.call(DATA_LOSS_ORDER, risk)) {
    throw new Error(`UNKNOWN_DATA_LOSS_RISK: ${context} uses ${JSON.stringify(risk)}.`);
  }
  return risk;
}

function normalizeAuthorityConditions(value) {
  const conditions = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(REQUIRED_AUTHORITY_CONDITIONS.map(name => [name, conditions[name] === true]));
}

function requiresCommanderDecision(step) {
  if (!step) return true;
  const allConditionsMet = REQUIRED_AUTHORITY_CONDITIONS.every(name => step.authority_conditions[name] === true);
  return !allConditionsMet;
}

function maxDataLossRisk(chain) {
  let worst = "none";
  for (const step of chain) {
    const risk = assertDataLossRisk(step.data_loss_risk, step.reference || `step ${step.step}`);
    if (DATA_LOSS_ORDER[risk] > DATA_LOSS_ORDER[worst]) worst = risk;
  }
  return worst;
}

function buildChain(capability) {
  const chain = [];

  for (const alternative of (capability && capability.degraded_alternatives) || []) {
    const dataLossRisk = assertDataLossRisk(alternative.data_loss_risk, alternative.alternative_id || "degraded alternative");
    const authorityConditions = normalizeAuthorityConditions(alternative.authority_conditions);
    chain.push({
      step: chain.length + 1,
      mode: "degraded",
      reference: alternative.alternative_id,
      description: alternative.description,
      constraints: alternative.constraints || [],
      data_loss_risk: dataLossRisk,
      authority_conditions: authorityConditions,
      commander_decision_required: !REQUIRED_AUTHORITY_CONDITIONS.every(name => authorityConditions[name] === true)
    });
  }

  if (capability && capability.manual_procedure) {
    const dataLossRisk = assertDataLossRisk(
      capability.manual_procedure.data_loss_risk,
      capability.manual_procedure.reference || "manual procedure"
    );
    const authorityConditions = normalizeAuthorityConditions(capability.manual_procedure.authority_conditions);
    chain.push({
      step: chain.length + 1,
      mode: "manual",
      reference: capability.manual_procedure.reference,
      description: capability.manual_procedure.description || "Manual procedure executed by the owning staff section.",
      constraints: capability.manual_procedure.constraints || [],
      data_loss_risk: dataLossRisk,
      authority_conditions: authorityConditions,
      commander_decision_required: !REQUIRED_AUTHORITY_CONDITIONS.every(name => authorityConditions[name] === true)
    });
  }

  return chain;
}

function planFallback(failureReport, capabilities) {
  if (!failureReport || typeof failureReport !== "object" || Array.isArray(failureReport)) {
    throw new Error("INVALID_FAILURE_REPORT: expected an object.");
  }
  if (!failureReport.tool_id || !failureReport.mission_id) {
    throw new Error("INVALID_FAILURE_REPORT: mission_id and tool_id are required.");
  }
  if (!CRITICALITIES.has(failureReport.criticality)) {
    throw new Error(`UNKNOWN_CRITICALITY: ${JSON.stringify(failureReport.criticality)}.`);
  }
  const capability = findCapability(capabilities, failureReport.tool_id);
  const chain = buildChain(capability);
  const blocked = chain.length === 0;
  const selectedStep = chain[0] || null;
  const outcome = blocked ? "blocked" : chain[0].mode === "degraded" ? "degraded" : "manual";
  const dataLossRisk = selectedStep ? selectedStep.data_loss_risk : "none";
  const commanderDecisionRequired = blocked || requiresCommanderDecision(selectedStep);

  const degradedModeConstraints = blocked
    ? []
    : [
        "Restricted operation after Amber report to COS/S4.",
        "Supervised execution; verify partial output before use.",
        ...chain.flatMap(step => step.constraints)
      ];

  return {
    schema_version: "0.1",
    type: "ToolFallbackPlan",
    id: `TFP-${failureReport.tool_id}`,
    mission_id: failureReport.mission_id,
    mission_phase: failureReport.mission_phase || null,
    owner: failureReport.owner || "S4",
    tool_id: failureReport.tool_id,
    failure_class: failureReport.failure_class,
    criticality: failureReport.criticality,
    outcome,
    tool_readiness: blocked ? "Unavailable" : "Poorly",
    execution_authority: blocked
      ? "Blocked"
      : commanderDecisionRequired
        ? "Blocked pending COMMANDER decision"
        : "Restricted after Amber report",
    fallback_chain: chain,
    degraded_mode_constraints: degradedModeConstraints,
    data_loss_risk: dataLossRisk,
    commander_decision_required: commanderDecisionRequired,
    decision_packet_candidate: commanderDecisionRequired && !blocked
      ? {
          decision_type: "risk_acceptance",
          commander_question: `Authorize ${failureReport.tool_id} to continue in ${outcome} mode with ${dataLossRisk} data loss risk during ${failureReport.mission_phase || "the current phase"}?`,
          options: ["approve_with_constraints", "revise", "reject"],
          authority_required: ["COMMANDER"],
          if_no_decision: "Hold dependent actions and report Amber in the next SITREP."
        }
      : null,
    escalation: blocked
      ? {
          required: true,
          ccir_type: "FFIR",
          severity: "Red",
          route: "Commander Board",
          trigger: `Tool ${failureReport.tool_id} unavailable with no degraded or manual fallback.`,
          blocks_execution: true
        }
      : null,
    next_actions: blocked
      ? [
          "Open blocked FFIR alert for the unavailable tool.",
          "Assign S4/S6 repair task for fault isolation and recovery.",
          "Hold dependent actions until commander decision or FRAGO."
        ]
      : commanderDecisionRequired
        ? [
            "Route the risk-acceptance decision packet to the commander.",
            "Prepare the fallback chain but do not execute until approved."
          ]
        : [
            "Execute the fallback chain under degraded-mode constraints.",
            "Report Amber tool status to COS/S4 and schedule repair."
          ]
  };
}

function main() {
  const [, , failureArg, capabilitiesArg] = process.argv;
  if (!failureArg || !capabilitiesArg) {
    console.error("Usage: node tool-fallback-planner.js <tool-failure-report.json> <fallback-capabilities.json>");
    process.exit(2);
  }

  const plan = planFallback(readJson(failureArg), readJson(capabilitiesArg));
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_AUTHORITY_CONDITIONS,
  buildChain,
  maxDataLossRisk,
  planFallback,
  requiresCommanderDecision
};
