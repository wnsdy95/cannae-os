#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyzeForceStructureChange } = require("./force-structure-change-runner");

const ROOT = __dirname;

function readJson(relativePath) {
  return require(path.join(ROOT, relativePath));
}

function validate(file, expectedCode, requiredCodes = []) {
  const result = spawnSync("node", ["validator-cli-prototype/validate.js", file, "force-structure-change-order"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.strictEqual(result.status, expectedCode, result.stdout || result.stderr);
  const parsed = JSON.parse(result.stdout);
  const codes = new Set((parsed.issues || []).map(issue => issue.code));
  for (const code of requiredCodes) {
    assert(codes.has(code), `expected validator issue ${code}`);
  }
}

const fixtures = [
  {
    name: "valid force structure change order is ready",
    file: "sample-payloads/valid-force-structure-change-order.json",
    validate() {
      validate(this.file, 0);
      const projection = analyzeForceStructureChange(readJson(this.file));
      assert.strictEqual(projection.status, "ready");
      assert.strictEqual(projection.preflight_blocks.length, 0);
      assert(projection.commander_queue.some(item => /External release/.test(item.item)), "expected release commander queue");
      assert(projection.documentation_queue.some(item => item.kind === "schema_updates"), "expected schema documentation queue");
      assert(projection.sunset_watch.conditions.length >= 2, "expected sunset watch");
    }
  },
  {
    name: "unjustified force structure expansion is blocked",
    file: "sample-payloads/invalid-force-structure-change-order-unjustified.json",
    validate() {
      validate(this.file, 1, [
        "FORCE_CHANGE_WITHOUT_EVIDENCE",
        "FORCE_CHANGE_WITHOUT_ALTERNATIVES",
        "FORCE_CHANGE_WITHOUT_NON_ORG_ALTERNATIVE",
        "FORCE_CHANGE_INCOMPLETE_DOTMLPF",
        "FORCE_CHANGE_REQUIRES_COMMANDER",
        "FORCE_CHANGE_WITHOUT_APPROVAL_EVIDENCE",
        "FORCE_CHANGE_WITHOUT_MAINTAINER",
        "FORCE_CHANGE_LOW_READINESS_TARGET",
        "FORCE_CHANGE_WITHOUT_VALIDATION_FIXTURE",
        "FORCE_CHANGE_WITHOUT_HANDOFF",
        "FORCE_CHANGE_WITHOUT_SUNSET",
        "FORCE_CHANGE_WITHOUT_DOC_UPDATE",
        "FORCE_CHANGE_WITHOUT_MOE",
        "FORCE_CHANGE_WITHOUT_SUNSET_CONDITION"
      ]);
      const projection = analyzeForceStructureChange(readJson(this.file));
      assert.strictEqual(projection.status, "blocked");
      assert(projection.preflight_blocks.some(block => /evidence/.test(block)), "expected evidence block");
      assert(projection.preflight_blocks.some(block => /Commander/.test(block)), "expected commander approval block");
      assert(projection.preflight_blocks.some(block => /sunset/.test(block)), "expected sunset block");
    }
  }
];

let passed = 0;
for (const fixture of fixtures) {
  try {
    fixture.validate();
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

console.log(`Force structure change fixtures: ${passed}/${fixtures.length} passed`);
