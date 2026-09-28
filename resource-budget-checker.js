#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { validatePayload } = require("./validator-cli-prototype/validate");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function remainingRatio(resource) {
  if (!(resource.capacity > 0)) return 0;
  return Math.min(1, Math.max(0, resource.current_level / resource.capacity));
}

function classifyResource(resource) {
  const ratio = remainingRatio(resource);
  const bands = resource.threshold_bands || {};
  const greenFloor = bands.green ? bands.green.min_remaining_ratio : 0.4;
  const amberFloor = bands.amber ? bands.amber.min_remaining_ratio : 0.15;

  let band = "Red";
  if (ratio >= greenFloor) band = "Green";
  else if (ratio >= amberFloor) band = "Amber";

  return { band, remaining_ratio: Math.round(ratio * 1000) / 1000 };
}

function gatesCurrentPhase(resource, missionPhase) {
  return Boolean(missionPhase) && (resource.gates_phases || []).includes(missionPhase);
}

function percentText(ratio) {
  return `${Math.round(ratio * 100)}%`;
}

function makeWatchItem(resource, classification) {
  return {
    resource_id: resource.id,
    resource_class: resource.resource_class,
    band: "Amber",
    remaining_ratio: classification.remaining_ratio,
    route: "Report to COS/S4 resource watch",
    sitrep_field: "risk",
    entry: `${resource.resource_class} at ${percentText(classification.remaining_ratio)} remaining (${resource.trend}); approaching limit, prioritization needed.`
  };
}

function makeAlertCandidate(resource, classification, missionId, missionPhase) {
  const blocking = gatesCurrentPhase(resource, missionPhase);
  return {
    schema_version: "0.1",
    type: "CCIRAlert",
    id: `ALERT-${resource.id}`,
    mission_id: missionId,
    ccir_type: "FFIR",
    severity: "Red",
    source_event_id: resource.id,
    owner: resource.owner || "S4",
    title: `${resource.resource_class} red: ${percentText(classification.remaining_ratio)} remaining`,
    why_it_matters: blocking
      ? `Own-force resource ${resource.id} gates the ${missionPhase} phase and mission failure is possible without replenishment or reprioritization.`
      : `Own-force resource ${resource.id} is below its red threshold and mission failure is possible without replenishment or reprioritization.`,
    recommended_route: "Commander Board",
    required_decision: "Reprioritize tasks, extend the budget, or issue FRAGO.",
    deadline: "before next resource-consuming action",
    sensitive: false,
    blocks_execution: blocking,
    status: blocking ? "blocked" : "pending"
  };
}

function buildBudgetWatch(input) {
  const resources = Array.isArray(input) ? input : input.resources || [];
  const missionId = (Array.isArray(input) ? null : input.mission_id)
    || (resources[0] && resources[0].mission_id)
    || "M-UNKNOWN";
  const missionPhase = Array.isArray(input) ? null : input.mission_phase || null;
  const missionIds = new Set(resources.map(resource => resource.mission_id).filter(Boolean));
  if (missionIds.size > 1 || (missionId && missionIds.size === 1 && !missionIds.has(missionId))) {
    throw new Error("RESOURCE_MISSION_MISMATCH: all resources must belong to the projected mission.");
  }
  const resourceIds = resources.map(resource => resource.id);
  if (new Set(resourceIds).size !== resourceIds.length) {
    throw new Error("DUPLICATE_RESOURCE_ID: resource ids must be unique.");
  }
  let latestMeasurement = null;
  for (const resource of resources) {
    const validation = validatePayload(resource, "resource-status");
    if (!validation.valid) {
      throw new Error(`INVALID_RESOURCE_STATUS: ${resource.id || "unknown"}: ${validation.issues.map(item => item.code).join(", ")}.`);
    }
    const measuredAt = Date.parse(resource.measured_at);
    if (!Number.isFinite(measuredAt)) {
      throw new Error(`INVALID_RESOURCE_TIMESTAMP: ${resource.id || "unknown"}.`);
    }
    if (latestMeasurement === null || measuredAt > latestMeasurement) latestMeasurement = measuredAt;
  }
  let generatedAt = latestMeasurement === null ? null : new Date(latestMeasurement).toISOString();
  if (!Array.isArray(input) && input.generated_at) {
    const parsedGeneratedAt = Date.parse(input.generated_at);
    if (!Number.isFinite(parsedGeneratedAt)) throw new Error("INVALID_GENERATED_AT: generated_at must be a timestamp.");
    if (latestMeasurement !== null && parsedGeneratedAt < latestMeasurement) {
      throw new Error("GENERATED_AT_PRECEDES_MEASUREMENT: projection cannot predate its latest resource measurement.");
    }
    generatedAt = new Date(parsedGeneratedAt).toISOString();
  }

  const sitrepWatchItems = [];
  const ccirAlertCandidates = [];

  const projected = resources.map(resource => {
    const classification = classifyResource(resource);
    const blocking = classification.band === "Red" && gatesCurrentPhase(resource, missionPhase);

    if (classification.band === "Amber") {
      sitrepWatchItems.push(makeWatchItem(resource, classification));
    }
    if (classification.band === "Red") {
      ccirAlertCandidates.push(makeAlertCandidate(resource, classification, missionId, missionPhase));
    }

    return {
      resource_id: resource.id,
      resource_class: resource.resource_class,
      owner: resource.owner,
      unit: resource.unit,
      current_level: resource.current_level,
      capacity: resource.capacity,
      remaining_ratio: classification.remaining_ratio,
      band: classification.band,
      trend: resource.trend,
      gates_current_phase: gatesCurrentPhase(resource, missionPhase),
      blocking
    };
  });

  const amber = projected.filter(resource => resource.band === "Amber");
  const red = projected.filter(resource => resource.band === "Red");
  const blockingResources = red.filter(resource => resource.blocking).map(resource => resource.resource_id);

  return {
    schema_version: "0.1",
    type: "ResourceBudgetWatch",
    id: `RBW-${missionId}`,
    mission_id: missionId,
    mission_phase: missionPhase,
    owner: "S4",
    generated_at: generatedAt,
    overall_resource_readiness: red.length > 0 ? "Red" : amber.length > 0 ? "Amber" : "Green",
    resources: projected,
    sitrep_watch_items: sitrepWatchItems,
    ccir_alert_candidates: ccirAlertCandidates,
    summary: {
      green: projected.length - amber.length - red.length,
      amber: amber.length,
      red: red.length,
      blocking_resources: blockingResources.length ? blockingResources : ["None"],
      commander_decision_required: red.length > 0,
      next_actions: red.length > 0
        ? ["Route red FFIR alert candidates to the Commander Board.", "Hold resource-gated actions until commander decision or FRAGO."]
        : amber.length > 0
          ? ["Bind amber watch items into the next SITREP risk section.", "Reprioritize consumption with COS/S4 before the limit."]
          : ["Continue; resource readiness is Green."]
    }
  };
}

function main() {
  const [, , inputArg] = process.argv;
  if (!inputArg) {
    console.error("Usage: node resource-budget-checker.js <resource-status-list.json>");
    process.exit(2);
  }

  const projection = buildBudgetWatch(readJson(inputArg));
  process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { classifyResource, buildBudgetWatch };
