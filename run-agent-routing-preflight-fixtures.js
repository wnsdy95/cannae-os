#!/usr/bin/env node

const assert = require("assert");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyzeRoutingPreflight } = require("./agent-routing-preflight-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");

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

function routeWithSkill(skillRoot, query, args = []) {
  const result = spawnSync(process.execPath, [
    path.join(ROOT, skillRoot, "scripts/route_controls_docs.js"),
    ...args, query, ROOT
  ], { cwd: os.tmpdir(), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const delegatedArgs = ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"];
const routingCases = [
  {
    name: "effect settlement keeps both task documents behind a large role bundle",
    query: "effect settlement exact USER verification evidence",
    required: ["docs/tool-effect-review.md", "docs/tool-effect-settlement.md"],
    command: "node run-tool-effect-settlement-fixtures.js"
  },
  {
    name: "multiple selected routes retain their full task documents",
    query: "opord backbrief model allocation model registry",
    required: ["docs/model-force-assignment-policy.md", "docs/model-force-v0.2-operations.md",
      "docs/prompt-templates.md", "docs/opord-annex-model.md", "docs/backbrief-and-rehearsal-sop.md"],
    command: "node run-model-force-v0.2-fixtures.js"
  },
  {
    name: "capability-gap documents do not displace authority or scoped task documents",
    query: "effect settlement",
    extra: ["--capability-query=Analyze ICP and rank sales targets from the canonical track view."],
    required: ["docs/tool-effect-review.md", "docs/tool-effect-settlement.md",
      "docs/force-structure-change-policy.md", "schema-files/force-structure-change-order.schema.json"],
    command: "node run-force-structure-change-fixtures.js"
  }
];

let routingPassed = 0;
for (const fixture of routingCases) {
  try {
    const outputs = [];
    for (const skillRoot of ["codex-skills/controls-doctrine-operator", ".claude/skills/controls-doctrine-operator"]) {
      const extra = fixture.extra || [`--capability-query=${fixture.query}`];
      const human = routeWithSkill(skillRoot, fixture.query, ["--actor=user", ...extra]);
      const routed = routeWithSkill(skillRoot, fixture.query, [...delegatedArgs, ...extra, "--limit=1"]);
      const receipt = routeWithSkill(skillRoot, fixture.query, [...delegatedArgs, ...extra,
        "--receipt", "--scope=agent", "--mission=MIS-ROUTING", "--wave=W1", "--agent=fixture-agent"]);
      const paths = routed.recommended_documents.map(item => item.path);
      assert.strictEqual(new Set(paths).size, paths.length, "recommended documents must remain unique");
      for (const expected of [...fixture.required, ...routed.operating_mode.mode_documents,
        ...human.recommended_documents.map(item => item.path)]) {
        assert(paths.includes(expected), `missing selected task or authority document: ${expected}`);
      }
      assert(paths.length > 16, "regression must exceed the former document cap");
      assert(routed.validation_commands.includes(fixture.command), "task control disappeared");
      assert.strictEqual(routed.supporting_artifacts.length, 1, "supporting artifact limit must still apply");
      assert(routed.supporting_artifacts_truncated, "supporting truncation must remain explicit");
      assert(routed.supporting_artifacts.every(item => !paths.includes(item.path)), "duplicate supporting document");
      assert.deepStrictEqual(receipt.recommended_documents, routed.recommended_documents,
        "receipt or --limit changed the selected documents");
      assert.deepStrictEqual(receipt.validation_commands, routed.validation_commands);
      const validation = validatePayload(receipt, "routing-receipt");
      assert(validation.valid, `generated receipt failed schema validation: ${JSON.stringify(validation.issues)}`);
      assert.strictEqual(routed.operating_mode.decision_authority, "bounded_ai_delegate");
      assert.strictEqual(routed.capability_routing.provisional_organization.authority_expansion_authorized, false);
      assert.strictEqual(routed.capability_routing.provisional_organization.standing_department_activation_authorized, false);
      if (fixture.extra) assert.strictEqual(routed.capability_routing.status, "gap_detected");
      outputs.push(routed);
    }
    assert.deepStrictEqual(outputs[0].recommended_documents, outputs[1].recommended_documents,
      "Codex and Claude selected different documents");
    assert.deepStrictEqual(outputs[0].validation_commands, outputs[1].validation_commands);
    routingPassed += 1;
    console.log(`PASS ${fixture.name} (both skills, direct and receipt)`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

console.log(`Agent routing preflight fixtures: ${passed + routingPassed}/${fixtures.length + routingCases.length} passed`);
