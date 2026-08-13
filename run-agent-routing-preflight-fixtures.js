#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { analyzeRoutingPreflight } = require("./agent-routing-preflight-runner");

const ROOT = __dirname;

function readJson(relativePath) {
  return require(path.join(ROOT, relativePath));
}

const fixtures = [
  {
    name: "valid wave and agent routing receipts are ready",
    file: "agent-routing-preflight-fixtures/valid-wave-routing-bundle.json",
    expectedStatus: "ready",
    expectedBlocks: []
  },
  {
    name: "missing agent routing receipt blocks wave",
    file: "agent-routing-preflight-fixtures/missing-agent-routing-bundle.json",
    expectedStatus: "blocked",
    expectedBlocks: ["Missing agent routing receipt for terms-agent."]
  },
  {
    name: "stale wave routing receipt blocks wave",
    file: "agent-routing-preflight-fixtures/stale-wave-routing-bundle.json",
    expectedStatus: "blocked",
    expectedBlocks: ["chief-of-staff: wave_id does not match preflight bundle."]
  },
  {
    name: "partial capability gap inheritance blocks wave",
    file: "agent-routing-preflight-fixtures/partial-capability-gap-routing-bundle.json",
    expectedStatus: "blocked",
    expectedBlocks: ["Capability-gap routing must apply one mission-scoped provisional organization to the wave and every expected agent."]
  },
  {
    name: "mixed covered capability decisions block wave",
    file: "agent-routing-preflight-fixtures/valid-wave-routing-bundle.json",
    mutate(bundle) {
      const receipt = bundle.receipts.find(item => item.wave_scope === "agent");
      receipt.capability_routing.matched_capability_routes = ["orders"];
      receipt.matched_routes.push({ id: "orders", score: 1 });
    },
    expectedStatus: "blocked",
    expectedBlocks: ["Wave and agent receipts must share one mission capability query and routing decision."]
  }
];

let passed = 0;
for (const fixture of fixtures) {
  try {
    const bundle = JSON.parse(JSON.stringify(readJson(fixture.file)));
    if (fixture.mutate) fixture.mutate(bundle);
    const projection = analyzeRoutingPreflight(bundle);
    assert.strictEqual(projection.status, fixture.expectedStatus);
    for (const expectedBlock of fixture.expectedBlocks) {
      assert(
        projection.preflight_blocks.includes(expectedBlock),
        `expected preflight block: ${expectedBlock}\nactual: ${projection.preflight_blocks.join("\n")}`
      );
    }
    if (fixture.expectedStatus === "ready") {
      assert.strictEqual(projection.preflight_blocks.length, 0);
      assert(projection.accepted_receipts.some(receipt => receipt.wave_scope === "wave" && receipt.agent_role === "COS"));
      assert.strictEqual(projection.accepted_receipts.filter(receipt => receipt.wave_scope === "agent").length, 2);
    }
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

console.log(`Agent routing preflight fixtures: ${passed}/${fixtures.length} passed`);
