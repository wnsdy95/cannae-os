#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function collectPreflightBlocks(charter) {
  const blocks = [];
  const authority = charter.authority || {};
  const cells = charter.cells || {};
  const ccir = charter.ccir || {};
  const isolation = charter.isolation || {};
  const enablers = charter.enablers || {};
  const rehearsal = charter.rehearsal || {};
  const exit = charter.exit_criteria || {};

  if (!hasItems(charter.trigger && charter.trigger.conditions)) {
    blocks.push("Define concrete SOF TF activation trigger.");
  }
  if (!hasItems(authority.prohibited)) {
    blocks.push("State prohibited actions before activation.");
  }
  if (!hasItems(authority.retained_by_commander)) {
    blocks.push("Define commander-retained authority.");
  }
  if (cells.red_team && [cells.lead, cells.s3_execution, cells.opsec_release].includes(cells.red_team)) {
    blocks.push("Separate Red Team from lead, execution, and release review.");
  }
  if (cells.opsec_release && cells.opsec_release === cells.s3_execution) {
    blocks.push("Separate OPSEC/release reviewer from execution cell.");
  }
  if (cells.recorder !== "RECORDER") {
    blocks.push("Assign Recorder/KM cell.");
  }
  if (!["S4", "S6"].includes(cells.s4_s6_enabler)) {
    blocks.push("Assign S4/S6 enabler cell.");
  }
  if (!hasItems(ccir.eefi)) {
    blocks.push("Define EEFI before context distribution.");
  }
  if (!hasItems(ccir.decision_points)) {
    blocks.push("Define commander decision points.");
  }
  if (!hasItems(isolation.context_rules) || !hasItems(isolation.eefi_controls)) {
    blocks.push("Define need-to-know context and EEFI controls.");
  }
  if (enablers.source_map_required !== true) {
    blocks.push("Require source-map discipline.");
  }
  if (enablers.release_review_required !== true) {
    blocks.push("Require release review for SOF TF output.");
  }
  if (enablers.maintenance_check_required !== true) {
    blocks.push("Require tool/resource maintenance readiness check.");
  }
  if (!hasItems(enablers.fallback_plan)) {
    blocks.push("Define PACE/fallback plan.");
  }
  if (rehearsal.backbrief_required !== true || rehearsal.rehearsal_required !== true || rehearsal.dry_run_required !== true) {
    blocks.push("Complete backbrief, rehearsal, and dry run before execution.");
  }
  if (!hasItems(exit.abort) || !hasItems(exit.handoff)) {
    blocks.push("Define abort and handoff criteria.");
  }

  return blocks;
}

function buildContextDistribution(charter) {
  const cells = charter.cells || {};
  const needToKnow = new Set((charter.isolation && charter.isolation.need_to_know_roles) || []);
  return Object.entries(cells).map(([cell, role]) => ({
    cell,
    role,
    context_access: needToKnow.has(role) ? "need_to_know_packet" : "redacted_or_denied"
  }));
}

function runSofTfActivation(charter) {
  const preflight_blocks = collectPreflightBlocks(charter);
  const authority = charter.authority || {};
  const enablers = charter.enablers || {};
  const cells = charter.cells || {};

  const activation_decision = preflight_blocks.length === 0 ? "go" : "no_go";
  const approval_gates = [
    ...(authority.approval_required || []),
    ...(authority.retained_by_commander || []).map(item => `commander_retained: ${item}`)
  ];

  const required_support = [
    ...(enablers.source_map_required ? ["source_map"] : []),
    ...(enablers.release_review_required ? ["release_review"] : []),
    ...(enablers.maintenance_check_required ? ["maintenance_readiness"] : []),
    ...(enablers.fallback_plan || []).map((item, index) => `fallback_${index + 1}: ${item}`)
  ];

  return {
    schema_version: "0.1",
    type: "SofTfActivationProjection",
    charter_id: charter.id,
    mission_id: charter.mission_id,
    activation_decision,
    active_cells: Object.entries(cells).map(([cell, role]) => ({ cell, role })),
    context_distribution: buildContextDistribution(charter),
    approval_gates,
    required_support,
    preflight_blocks,
    commander_queue: (charter.ccir && charter.ccir.decision_points || []).map(point => ({
      type: "decision_point",
      point
    })),
    recorder_actions: [
      "Open TF event log.",
      "Capture source-map deltas.",
      "Prepare handoff packet before extraction.",
      "Queue AAR/readiness update after reset."
    ]
  };
}

function main() {
  const charterPath = process.argv[2];
  if (!charterPath) {
    console.error("Usage: node sof-tf-activation-runner.js <sof-tf-charter.json>");
    process.exit(2);
  }
  const charter = readJson(path.resolve(charterPath));
  process.stdout.write(`${JSON.stringify(runSofTfActivation(charter), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { runSofTfActivation };
