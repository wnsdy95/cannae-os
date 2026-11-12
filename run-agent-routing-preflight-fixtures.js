#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
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

function routeWithSkill(skillRoot, query, args = [], expectedStatus = 0) {
  const result = spawnSync(process.execPath, [
    path.join(ROOT, skillRoot, "scripts/route_controls_docs.js"),
    ...args, query, ROOT
  ], { cwd: os.tmpdir(), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.strictEqual(result.status, expectedStatus, result.stderr || result.stdout);
  if (expectedStatus) {
    assert.equal(result.stdout, "", "a rejected receipt must not emit JSON");
    return result;
  }
  return JSON.parse(result.stdout);
}

const delegatedArgs = ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"];
const routingCases = [
  {
    name: "ordinary source review keeps controls without national specialist reading",
    query: "Draft a support SOP from source policy in Korean. Do not publish.",
    extra: ["--capability-query=Draft a support SOP from source policy."],
    required: ["docs/source-map.md", "docs/source-reliability-rubric.md", "docs/document-authoring-workflow.md"],
    absent: ["docs/korean-military-sources.md", "docs/korean-org-culture.md", "docs/multinational-doctrine-consistency-review.md"],
    command: "node run-doctrine-consistency-fixtures.js",
    gap: false
  },
  {
    name: "a narrow source task retains its national parent objective in receipt and context",
    query: "Draft a support SOP from source policy. Do not publish.",
    extra: ["--capability-query=Research reporting in Korean military organizations."],
    required: ["docs/korean-military-sources.md", "docs/korean-org-culture.md", "docs/multinational-doctrine-consistency-review.md"],
    command: "node run-doctrine-consistency-fixtures.js",
    gap: false
  },
  {
    name: "explicit national input survives ordinary source review and receipt generation",
    query: "Draft a support SOP from source policy in Korean. Do not publish.",
    extra: ["--capability-query=Draft a support SOP.", "--source=docs/korean-org-culture.md"],
    required: ["docs/korean-org-culture.md", "docs/korean-military-sources.md", "docs/multinational-doctrine-consistency-review.md"],
    command: "node source-map-linter.js",
    gap: false
  },
  {
    name: "excluded dashboard work cannot mask a parent domain gap in receipts",
    query: "Draft a handoff document. Do not build a dashboard.",
    extra: ["--capability-query=Analyze museum attendance by city. Do not build a dashboard."],
    required: ["docs/force-structure-change-policy.md", "docs/handoff-packet-template.md", "docs/approval-scope-policy.md"],
    absent: ["docs/event-sourcing-model.md", "docs/reference-architecture.md", "docs/command-post-dashboard.md"],
    command: "node run-maintenance-dashboard-fixtures.js"
  },
  {
    name: "technical review after an exclusion retains specialist reading in receipts",
    query: "Draft a handoff document. Do not build a dashboard. Review its design.",
    extra: ["--capability-query=Review dashboard architecture"],
    required: ["docs/event-sourcing-model.md", "docs/reference-architecture.md", "docs/command-post-dashboard.md"],
    command: "node run-maintenance-dashboard-fixtures.js",
    gap: false
  },
  {
    name: "generic comparison preserves a capability gap and selected controls in receipts",
    query: "Compare museum attendance by city",
    extra: ["--capability-query=Compare museum attendance by city"],
    required: ["docs/force-structure-change-policy.md", "docs/approval-scope-policy.md", "docs/knowledge-management-sop.md"],
    absent: ["docs/bounded-self-improvement-operations.md", "docs/transparency-operations.md", "docs/verifier-execution-integrity.md"],
    command: "node run-self-improvement-fixtures.js"
  },
  {
    name: "comparison reading retains specialist requirements from its parent mission",
    query: "Compare two SOP revisions against source policy",
    extra: ["--capability-query=Review verifier execution integrity before comparative promotion"],
    required: ["docs/document-authoring-workflow.md", "docs/verifier-execution-integrity.md", "docs/transparency-operations.md"],
    command: "node run-self-improvement-fixtures.js",
    gap: false
  },
  {
    name: "supplied policies survive direct routing and receipt generation",
    query: "Draft a support SOP from SUPPORT.md and SECURITY.md. Do not publish it.",
    extra: ["--capability-query=Draft a support SOP.", "--source=GOVERNANCE.md"],
    required: ["SUPPORT.md", "SECURITY.md", "GOVERNANCE.md", "docs/document-authoring-workflow.md"],
    command: "node run-release-integration-fixtures.js",
    absent: ["docs/github-release-authorization.md", "docs/github-release-immutability.md",
      "docs/github-release-integrity-monitoring.md", "docs/github-release-independent-verification.md"],
    gap: false
  },
  {
    name: "a narrow authoring task retains its mission-level GitHub release reading",
    query: "Draft a support SOP from SUPPORT.md. Do not publish it.",
    extra: ["--capability-query=Review GitHub release approval."],
    required: ["SUPPORT.md", "docs/github-release-authorization.md", "docs/github-release-immutability.md",
      "docs/github-release-integrity-monitoring.md", "docs/github-release-independent-verification.md"],
    command: "node run-github-release-publisher-fixtures.js",
    gap: false
  },
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
  },
  {
    name: "a seventh-ranked terminology route reaches direct output and the receipt",
    query: "Draft an SOP and handoff document for a multi-agent sales task. Preserve approval scope, authority and release rules. Store outputs as repository artifacts. Maintain the project glossary.",
    extra: ["--capability-query=Research ICP and sales targeting using the canonical track view"],
    required: ["docs/project-terminology-workflow.md", "docs/repository-artifact-isolation-policy.md",
      "docs/handoff-packet-template.md", "docs/force-structure-change-policy.md"],
    command: "node run-project-terminology-handoff-fixtures.js"
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
      for (const document of fixture.absent || []) {
        assert(!paths.includes(document), `unrelated specialist reading: ${document}`);
      }
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
      for (const sourceOption of extra.filter(arg => arg.startsWith("--source="))) {
        assert(receipt.router_command.includes(sourceOption), "receipt lost an explicit required input");
      }
      const validation = validatePayload(receipt, "routing-receipt");
      assert(validation.valid, `generated receipt failed schema validation: ${JSON.stringify(validation.issues)}`);
      assert.strictEqual(routed.operating_mode.decision_authority, "bounded_ai_delegate");
      assert.strictEqual(routed.capability_routing.provisional_organization.authority_expansion_authorized, false);
      assert.strictEqual(routed.capability_routing.provisional_organization.standing_department_activation_authorized, false);
      if (fixture.extra) assert.strictEqual(routed.capability_routing.status, fixture.gap === false ? "covered" : "gap_detected");
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

for (const skillRoot of ["codex-skills/controls-doctrine-operator", ".claude/skills/controls-doctrine-operator"]) {
  const query = "Draft a handoff document from supplied policy. Do not publish.";
  const mode = ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only", `--capability-query=${query}`];
  const routed = routeWithSkill(skillRoot, query, mode);
  const scope = ["--receipt", "--mission=MIS-S6-READING", "--wave=W1"];
  const rejected = routeWithSkill(skillRoot, query, [...mode, ...scope, "--scope=agent", "--agent=reader"], 2);
  for (const code of ["AGENT_ROUTING_NOT_S3", "AGENT_ROUTING_WRONG_DEPARTMENT", "AGENT_ROUTING_WRONG_AUTHORITY"]) {
    assert(rejected.stderr.includes(code));
  }
  for (const document of ["docs/knowledge-management-sop.md", "docs/context-releasability-policy.md",
    "docs/opsec-classification-model.md", "docs/approval-scope-policy.md"]) {
    assert(routed.recommended_documents.some(x => x.path === document));
  }
  for (const document of ["docs/reference-architecture.md", "docs/command-post-dashboard.md", "docs/event-sourcing-model.md"]) {
    assert(!routed.recommended_documents.some(x => x.path === document));
  }
  const receipt = routeWithSkill(skillRoot, query, [...delegatedArgs, `--capability-query=${query}`,
    ...scope, "--scope=agent", "--agent=reader"]);
  // Downstream gates must still reject a hand-edited receipt, even after the producer is hardened.
  receipt.agent_role = "S6"; receipt.department = "knowledge"; receipt.authority_scope = "read-only";
  const validation = validatePayload(receipt, "routing-receipt");
  assert.equal(validation.valid, false, "ordinary S6 reading cannot replace the mandatory S3 work receipt");
  for (const code of ["AGENT_ROUTING_NOT_S3", "AGENT_ROUTING_WRONG_DEPARTMENT", "AGENT_ROUTING_WRONG_AUTHORITY"]) {
    assert(validation.issues.some(x => x.code === code));
  }
  const wave = routeWithSkill(skillRoot, query, ["--actor=ai", "--role=COS", "--department=coordination",
    "--authority=tasking", `--capability-query=${query}`, ...scope, "--scope=wave", "--agent=chief-of-staff"]);
  assert(validatePayload(wave, "routing-receipt").valid);
  const projection = analyzeRoutingPreflight({ type: "AgentRoutingPreflightBundle", mission_id: "MIS-S6-READING",
    wave_id: "W1", expected_agents: ["reader"], receipts: [wave, receipt] });
  assert.equal(projection.status, "blocked");
  assert.deepEqual(projection.preflight_blocks, ["reader: agent routing must use S3 role.",
    "reader: agent routing must use operations department.", "reader: agent routing must use scoped-execution authority."]);
}
console.log("PASS S6 reading preserves policy context without bypassing the S3 receipt boundary (both skills)");

const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "controls-receipt-emission-")));
try {
  const target = path.join(temporary, "target"); fs.mkdirSync(target);
  const init = spawnSync("git", ["init", "-q", target], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const query = "Draft a support SOP. Do not publish. SYNTHETIC-PRIVATE-TASK";
  const common = ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution",
    "--receipt", "--scope=agent", "--mission=MIS-EMISSION", "--wave=W1", "--agent=reader"];
  const variants = [
    { args: ["--role=S6"], code: "AGENT_ROUTING_NOT_S3" },
    { args: ["--department=research"], code: "AGENT_ROUTING_WRONG_DEPARTMENT" },
    { args: ["--authority=release-review"], code: "AGENT_ROUTING_WRONG_AUTHORITY" },
    { args: ["--scope=wave"], code: "WAVE_ROUTING_NOT_COS" },
    { args: ["--scope=wave", "--role=COS"], code: "WAVE_ROUTING_WRONG_DEPARTMENT" },
    { args: ["--scope=wave", "--role=COS", "--department=coordination"], code: "WAVE_ROUTING_WRONG_AUTHORITY" },
    { args: ["--mission=invalid"], code: "PATTERN_MISMATCH" },
    { args: [], omitCapability: true, code: "ROUTING_RECEIPT_CAPABILITY_QUERY_NOT_REPLAYABLE" }
  ];
  const snapshot = root => fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => {
      const file = path.join(entry.parentPath, entry.name);
      return [path.relative(root, file), fs.readFileSync(file).toString("base64")];
    }).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [index, skillRoot] of ["codex-skills/controls-doctrine-operator", ".claude/skills/controls-doctrine-operator"].entries()) {
    const artifactRoot = path.join(temporary, `artifacts-${index}`);
    const persist = ["--write-artifact", `--target-repository=${target}`, `--artifact-root=${artifactRoot}`];
    for (const flags of [["--receipt"], ["--write-artifact"], ["--overwrite-artifact"], [...common, ...persist]]) {
      const result = routeWithSkill(skillRoot, query, ["--coverage", ...flags, "--"], 2);
      assert(result.stderr.includes("ROUTING_MODE_CONFLICT"));
      assert(!fs.existsSync(artifactRoot));
    }
    for (const variant of variants) {
      for (const outputMode of [[], persist]) {
        const result = routeWithSkill(skillRoot, query, [...common,
          ...(variant.omitCapability ? [] : [`--capability-query=${query}`]), ...variant.args, ...outputMode, "--"], 2);
        assert(result.stderr.includes("ROUTING_RECEIPT_INVALID"));
        assert(result.stderr.includes(variant.code), result.stderr);
        assert(!result.stderr.includes("SYNTHETIC-PRIVATE-TASK"), "validation diagnostics must not echo task contents");
        assert(!fs.existsSync(artifactRoot), "rejected receipt created an artifact store");
      }
    }
    const accepted = routeWithSkill(skillRoot, query, [...common, `--capability-query=${query}`, ...persist, "--"]);
    assert(validatePayload(accepted, "routing-receipt").valid);
    const before = snapshot(artifactRoot);
    assert(before.length > 0, "valid receipt must actually persist");
    const deniedOverwrite = routeWithSkill(skillRoot, query, [...common, `--capability-query=${query}`,
      "--role=S6", ...persist, "--overwrite-artifact", "--"], 2);
    assert(deniedOverwrite.stderr.includes("AGENT_ROUTING_NOT_S3"));
    assert.deepEqual(snapshot(artifactRoot), before, "invalid overwrite modified existing evidence or store metadata");
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log("PASS receipt validation precedes emission, creation and overwrite (both skills, eight invalid variants and mixed-mode rejection)");
console.log(`Agent routing preflight fixtures: ${passed + routingPassed + 2}/${fixtures.length + routingCases.length + 2} passed`);
