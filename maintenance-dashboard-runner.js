#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function classFor(asset) {
  if (asset.readiness === "Fully") return "green";
  if (asset.readiness === "Poorly" || asset.readiness === "Unknown") return "amber";
  return "red";
}

function labelFor(asset) {
  if (asset.readiness === "Fully") return "READY";
  if (asset.readiness === "Poorly") return "DEGRADED";
  if (asset.readiness === "Unknown") return "UNKNOWN";
  return "DOWN";
}

function bodyFor(asset) {
  if (asset.readiness === "Fully") {
    return `${asset.check_command} passed; fallback: ${asset.fallback}`;
  }
  return `${asset.check_command} ${asset.last_result}; fallback: ${asset.fallback}; CCIR: ${asset.ccir_trigger}`;
}

function projectMaintenanceDashboard(report) {
  const assets = (report.assets || [])
    .slice()
    .sort((left, right) => left.asset_id.localeCompare(right.asset_id))
    .map(asset => ({
      asset_id: asset.asset_id,
      asset_type: asset.asset_type,
      owner: asset.owner,
      readiness: asset.readiness,
      last_result: asset.last_result,
      dependencies: asset.dependencies || [],
      fallback: asset.fallback,
      ccir_trigger: asset.ccir_trigger,
      dashboard: {
        class: classFor(asset),
        label: labelFor(asset),
        title: `${asset.asset_id} ${asset.readiness}`,
        body: bodyFor(asset)
      }
    }));

  return {
    mission_id: report.mission_id,
    generated_at: report.generated_at,
    owner: report.owner,
    overall_readiness: report.overall_readiness,
    commander_decision_required: report.summary?.commander_decision_required === true,
    summary: {
      total_assets: assets.length,
      fully: assets.filter(asset => asset.readiness === "Fully").length,
      degraded: assets.filter(asset => asset.readiness === "Poorly" || asset.readiness === "Unknown").length,
      unavailable: assets.filter(asset => asset.readiness === "Unavailable").length,
      next_actions: report.summary?.next_actions || []
    },
    assets
  };
}

function main() {
  const [, , reportArg] = process.argv;
  if (!reportArg) {
    console.error("Usage: node maintenance-dashboard-runner.js <maintenance-readiness-report.json>");
    process.exit(2);
  }

  const projection = projectMaintenanceDashboard(readJson(reportArg));
  process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { projectMaintenanceDashboard };
