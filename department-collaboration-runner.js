#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function pairKey(left, right) {
  return [left, right].sort().join("::");
}

function analyzeCollaboration(charter) {
  const departments = charter.departments || [];
  const departmentIds = new Set(departments.map(department => department.id));
  const relationships = charter.relationships || [];
  const liaisonRules = charter.liaison_rules || [];
  const liaisons = new Set(
    liaisonRules
      .filter(rule => Array.isArray(rule.between) && rule.between.length === 2)
      .map(rule => pairKey(rule.between[0], rule.between[1]))
  );

  const preflight_blocks = [];
  const missing_liaisons = [];
  const unknown_dependencies = [];

  if (!departmentIds.has("command")) preflight_blocks.push("Add command/CoS integration department.");
  if (!departmentIds.has("recorder")) preflight_blocks.push("Add Recorder/KM department.");
  if (!departmentIds.has("protection")) preflight_blocks.push("Add Protection/Release department.");

  for (const relationship of relationships) {
    const supportedKnown = departmentIds.has(relationship.supported_department);
    const supportingKnown = departmentIds.has(relationship.supporting_department);
    if (!supportedKnown || !supportingKnown) {
      unknown_dependencies.push({
        phase: relationship.phase,
        supported_department: relationship.supported_department,
        supporting_department: relationship.supporting_department
      });
      preflight_blocks.push(`Resolve unknown department in ${relationship.phase}.`);
      continue;
    }
    if (!liaisons.has(pairKey(relationship.supported_department, relationship.supporting_department))) {
      missing_liaisons.push({
        phase: relationship.phase,
        supported_department: relationship.supported_department,
        supporting_department: relationship.supporting_department
      });
      preflight_blocks.push(`Add liaison for ${relationship.supported_department}<->${relationship.supporting_department}.`);
    }
    if (!hasItems(relationship.required_outputs)) {
      preflight_blocks.push(`Define required outputs for ${relationship.phase} ${relationship.supporting_department}->${relationship.supported_department}.`);
    }
    if (/^none$/i.test(String(relationship.handoff_interface || "").trim())) {
      preflight_blocks.push(`Define handoff interface for ${relationship.phase} ${relationship.supporting_department}->${relationship.supported_department}.`);
    }
  }

  const controls = charter.collaboration_controls || {};
  for (const [field, description] of [
    ["no_silent_scope_change", "silent scope change control"],
    ["source_map_required", "source-map discipline"],
    ["shared_glossary_required", "shared glossary"],
    ["handoff_required", "handoff discipline"],
    ["aar_required", "AAR discipline"]
  ]) {
    if (controls[field] !== true) preflight_blocks.push(`Enable ${description}.`);
  }

  const conflict = charter.conflict_resolution || {};
  if (!["COMMANDER", "COS"].includes(conflict.authority)) {
    preflight_blocks.push("Route cross-department conflict through Commander or CoS.");
  }
  if (conflict.decision_packet_required !== true) {
    preflight_blocks.push("Require decision packet for cross-department conflicts.");
  }

  const status = preflight_blocks.length === 0 ? "ready" : "blocked";
  return {
    schema_version: "0.1",
    type: "DepartmentCollaborationProjection",
    charter_id: charter.id,
    mission_id: charter.mission_id,
    status,
    departments: departments.map(department => ({
      id: department.id,
      function: department.function,
      lead_role: department.lead_role,
      outputs: department.outputs || []
    })),
    relationship_edges: relationships.map(relationship => ({
      phase: relationship.phase,
      supported_department: relationship.supported_department,
      supporting_department: relationship.supporting_department,
      support_type: relationship.support_type,
      handoff_interface: relationship.handoff_interface
    })),
    missing_liaisons,
    unknown_dependencies,
    commander_queue: [
      ...((charter.synchronization && charter.synchronization.decision_points) || []).map(point => ({
        type: "decision_point",
        point
      })),
      ...((conflict.commander_escalation) || []).map(point => ({
        type: "commander_escalation",
        point
      }))
    ],
    sync_events: (charter.synchronization && charter.synchronization.battle_rhythm_events) || [],
    preflight_blocks,
    recorder_actions: [
      "Maintain shared source-of-truth index.",
      "Record relationship output delivery and quality gates.",
      "Capture conflict decisions and unresolved dependencies.",
      "Prepare handoff and AAR inputs at phase close."
    ]
  };
}

function main() {
  const charterPath = process.argv[2];
  if (!charterPath) {
    console.error("Usage: node department-collaboration-runner.js <department-collaboration-charter.json>");
    process.exit(2);
  }
  const charter = readJson(path.resolve(charterPath));
  process.stdout.write(`${JSON.stringify(analyzeCollaboration(charter), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { analyzeCollaboration };
