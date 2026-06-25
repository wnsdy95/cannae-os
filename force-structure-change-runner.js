#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function analyzeForceStructureChange(order) {
  const blocks = [];
  const warnings = [];
  const authority = order.authority || {};
  const resources = order.resources || {};
  const readiness = order.readiness || {};
  const transition = order.transition_plan || {};
  const docs = order.documentation_updates || {};
  const assessment = order.assessment || {};

  if (!hasItems(order.capability_gap && order.capability_gap.evidence)) {
    blocks.push("Provide evidence for capability gap, overload, redundancy, or risk.");
  }
  if (!hasItems(order.alternatives_considered) || order.alternatives_considered.length < 2) {
    blocks.push("Analyze at least two alternatives before changing organization.");
  }
  if (!["COMMANDER"].includes(authority.approving_authority)) {
    blocks.push("Route force structure change to Commander approval.");
  }
  if (!hasItems(authority.approval_evidence)) {
    blocks.push("Attach approval evidence.");
  }
  if (!hasItems(resources.maintainer_roles)) {
    blocks.push("Assign maintainer roles.");
  }
  if (!hasItems(resources.fallback)) {
    blocks.push("Define fallback plan.");
  }
  if (readiness.required_rating === "U" || readiness.required_rating === "X") {
    blocks.push("Raise readiness requirement above U/X before activation or expansion.");
  }
  if (!hasItems(readiness.validation_fixture)) {
    blocks.push("Add validation fixture.");
  }
  if (transition.handoff_required !== true) {
    blocks.push("Require handoff for force structure change.");
  }
  if (!hasItems(transition.deactivation_or_sunset)) {
    blocks.push("Define deactivation or sunset plan.");
  }
  if (!hasItems(assessment.sunset_condition)) {
    blocks.push("Define sunset condition.");
  }
  if (!hasItems(assessment.moe)) {
    blocks.push("Define measurable effectiveness.");
  }

  for (const [field, value] of Object.entries(docs)) {
    if (!hasItems(value)) warnings.push(`Documentation queue missing ${field}.`);
  }

  const status = blocks.length === 0 ? "ready" : "blocked";
  return {
    schema_version: "0.1",
    type: "ForceStructureChangeProjection",
    order_id: order.id,
    mission_id: order.mission_id,
    change_type: order.change_type,
    target: order.target && {
      kind: order.target.kind,
      id: order.target.id,
      name: order.target.name,
      proposed_state: order.target.proposed_state
    },
    status,
    preflight_blocks: blocks,
    warnings,
    commander_queue: [
      ...(authority.commander_retained_decisions || []).map(item => ({
        type: "commander_retained_decision",
        item
      })),
      ...((assessment.aar_trigger) || []).map(item => ({
        type: "aar_trigger",
        item
      }))
    ],
    transition_tasks: [
      ...((transition.activation_steps) || []).map(item => ({ type: "activation", item })),
      ...((transition.data_migration) || []).map(item => ({ type: "data_migration", item })),
      ...((transition.rollback) || []).map(item => ({ type: "rollback", item }))
    ],
    documentation_queue: Object.entries(docs).flatMap(([kind, items]) =>
      (items || []).map(item => ({ kind, item }))
    ),
    readiness_requirements: {
      required_rating: readiness.required_rating,
      metl_tasks: readiness.metl_tasks || [],
      validation_fixture: readiness.validation_fixture || [],
      backup_or_successor: readiness.backup_or_successor || []
    },
    sunset_watch: {
      review_at: assessment.review_at,
      conditions: [
        ...((transition.deactivation_or_sunset) || []),
        ...((assessment.sunset_condition) || [])
      ]
    }
  };
}

function main() {
  const orderPath = process.argv[2];
  if (!orderPath) {
    console.error("Usage: node force-structure-change-runner.js <force-structure-change-order.json>");
    process.exit(2);
  }
  const order = readJson(path.resolve(orderPath));
  process.stdout.write(`${JSON.stringify(analyzeForceStructureChange(order), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { analyzeForceStructureChange };
