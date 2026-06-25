#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasRoutes(receipt) {
  return Array.isArray(receipt.matched_routes) && receipt.matched_routes.some(route => route && route.id);
}

function hasRecommendedDocs(receipt) {
  return Array.isArray(receipt.recommended_documents) && receipt.recommended_documents.some(document => document && document.path);
}

function validInventory(receipt) {
  return receipt.route_inventory && receipt.route_inventory.unrouted_artifact_count === 0;
}

function checkCommonReceipt(receipt, bundle, preflightBlocks) {
  const label = receipt.agent_id || receipt.id || "unknown receipt";

  if (receipt.type !== "RoutingReceipt") {
    preflightBlocks.push(`${label}: receipt type must be RoutingReceipt.`);
  }
  if (receipt.mission_id !== bundle.mission_id) {
    preflightBlocks.push(`${label}: mission_id does not match preflight bundle.`);
  }
  if (receipt.wave_id !== bundle.wave_id) {
    preflightBlocks.push(`${label}: wave_id does not match preflight bundle.`);
  }
  if (receipt.actor !== "ai" || receipt.routing_mode !== "delegated_ai_role_department_authority") {
    preflightBlocks.push(`${label}: receipt must be delegated AI routing.`);
  }
  if (!/route_controls_docs\.js/.test(receipt.router_command || "")) {
    preflightBlocks.push(`${label}: receipt was not produced by route_controls_docs.js.`);
  }
  if (!/--actor(?:=|\s+)ai\b/.test(receipt.router_command || "")) {
    preflightBlocks.push(`${label}: router command must include --actor=ai.`);
  }
  if (!hasRoutes(receipt)) {
    preflightBlocks.push(`${label}: matched_routes is empty.`);
  }
  if (!hasRecommendedDocs(receipt)) {
    preflightBlocks.push(`${label}: recommended_documents is empty.`);
  }
  if (!validInventory(receipt)) {
    preflightBlocks.push(`${label}: route inventory has unrouted artifacts.`);
  }
}

function checkWaveReceipt(receipt, bundle, preflightBlocks) {
  checkCommonReceipt(receipt, bundle, preflightBlocks);
  if (receipt.agent_role !== "COS") {
    preflightBlocks.push(`${receipt.agent_id}: wave routing must use COS role.`);
  }
  if (receipt.department !== "coordination") {
    preflightBlocks.push(`${receipt.agent_id}: wave routing must use coordination department.`);
  }
  if (receipt.authority_scope !== "tasking") {
    preflightBlocks.push(`${receipt.agent_id}: wave routing must use tasking authority.`);
  }
}

function checkAgentReceipt(receipt, bundle, preflightBlocks) {
  checkCommonReceipt(receipt, bundle, preflightBlocks);
  if (receipt.agent_role !== "S3") {
    preflightBlocks.push(`${receipt.agent_id}: agent routing must use S3 role.`);
  }
  if (receipt.department !== "operations") {
    preflightBlocks.push(`${receipt.agent_id}: agent routing must use operations department.`);
  }
  if (receipt.authority_scope !== "scoped-execution") {
    preflightBlocks.push(`${receipt.agent_id}: agent routing must use scoped-execution authority.`);
  }
}

function analyzeRoutingPreflight(bundle) {
  const receipts = Array.isArray(bundle.receipts) ? bundle.receipts : [];
  const expectedAgents = Array.isArray(bundle.expected_agents) ? bundle.expected_agents : [];
  const preflight_blocks = [];
  const accepted_receipts = [];

  if (bundle.type !== "AgentRoutingPreflightBundle") {
    preflight_blocks.push("Preflight bundle type must be AgentRoutingPreflightBundle.");
  }
  if (!bundle.mission_id) {
    preflight_blocks.push("Preflight bundle must declare mission_id.");
  }
  if (!bundle.wave_id) {
    preflight_blocks.push("Preflight bundle must declare wave_id.");
  }
  if (expectedAgents.length === 0) {
    preflight_blocks.push("Declare expected_agents before routing preflight.");
  }

  const waveReceipts = receipts.filter(receipt => receipt.wave_scope === "wave");
  if (waveReceipts.length !== 1) {
    preflight_blocks.push(`Expected exactly one wave-level COS routing receipt, found ${waveReceipts.length}.`);
  } else {
    checkWaveReceipt(waveReceipts[0], bundle, preflight_blocks);
  }

  const agentReceipts = receipts.filter(receipt => receipt.wave_scope === "agent");
  const receiptsByAgent = new Map();
  for (const receipt of agentReceipts) {
    if (!receiptsByAgent.has(receipt.agent_id)) receiptsByAgent.set(receipt.agent_id, []);
    receiptsByAgent.get(receipt.agent_id).push(receipt);
  }

  for (const agentId of expectedAgents) {
    const matches = receiptsByAgent.get(agentId) || [];
    if (matches.length === 0) {
      preflight_blocks.push(`Missing agent routing receipt for ${agentId}.`);
      continue;
    }
    if (matches.length > 1) {
      preflight_blocks.push(`Duplicate agent routing receipts for ${agentId}.`);
    }
    for (const receipt of matches) {
      checkAgentReceipt(receipt, bundle, preflight_blocks);
    }
  }

  for (const receipt of receipts) {
    if (receipt.wave_scope !== "wave" && receipt.wave_scope !== "agent") {
      preflight_blocks.push(`${receipt.agent_id || receipt.id}: receipt has unknown wave_scope.`);
    }
    if (receipt.wave_scope === "agent" && !expectedAgents.includes(receipt.agent_id)) {
      preflight_blocks.push(`${receipt.agent_id}: agent receipt is not in expected_agents.`);
    }
  }

  for (const receipt of receipts) {
    if (receipt.type === "RoutingReceipt" && receipt.mission_id === bundle.mission_id && receipt.wave_id === bundle.wave_id && validInventory(receipt) && hasRoutes(receipt)) {
      accepted_receipts.push({
        id: receipt.id,
        agent_id: receipt.agent_id,
        wave_scope: receipt.wave_scope,
        agent_role: receipt.agent_role,
        department: receipt.department,
        authority_scope: receipt.authority_scope
      });
    }
  }

  return {
    schema_version: "0.1",
    type: "AgentRoutingPreflightProjection",
    mission_id: bundle.mission_id || null,
    wave_id: bundle.wave_id || null,
    status: preflight_blocks.length === 0 ? "ready" : "blocked",
    required_receipts: {
      wave: 1,
      agents: expectedAgents.length,
      expected_agents: expectedAgents
    },
    routing_receipt_count: receipts.length,
    accepted_receipts,
    preflight_blocks
  };
}

function main() {
  const bundlePath = process.argv[2];
  if (!bundlePath) {
    console.error("Usage: node agent-routing-preflight-runner.js <agent-routing-preflight-bundle.json>");
    process.exit(2);
  }
  const bundle = readJson(path.resolve(bundlePath));
  const projection = analyzeRoutingPreflight(bundle);
  process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
  process.exit(projection.status === "ready" ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { analyzeRoutingPreflight };
