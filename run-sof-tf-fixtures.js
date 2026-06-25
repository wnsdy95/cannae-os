#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const { runSofTfActivation } = require("./sof-tf-activation-runner");

const ROOT = __dirname;

function readJson(relativePath) {
  return require(path.join(ROOT, relativePath));
}

function validate(file, expectedCode, requiredCodes = []) {
  const result = spawnSync("node", ["validator-cli-prototype/validate.js", file, "sof-tf-charter"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.strictEqual(result.status, expectedCode, result.stdout || result.stderr);
  const parsed = JSON.parse(result.stdout);
  const codes = new Set((parsed.issues || []).map(item => item.code));
  for (const code of requiredCodes) {
    assert(codes.has(code), `expected validator issue ${code}`);
  }
}

const fixtures = [
  {
    name: "valid SOF TF charter activates with independent cells",
    file: "sample-payloads/valid-sof-tf-charter.json",
    validate() {
      validate(this.file, 0);
      const projection = runSofTfActivation(readJson(this.file));
      assert.strictEqual(projection.activation_decision, "go");
      assert.strictEqual(projection.preflight_blocks.length, 0);
      assert(projection.active_cells.some(cell => cell.cell === "red_team" && cell.role === "RED_TEAM"));
      assert(projection.active_cells.some(cell => cell.cell === "opsec_release" && cell.role === "EVALUATOR"));
      assert(projection.approval_gates.some(gate => /external release/i.test(gate)));
      assert(projection.required_support.includes("source_map"));
      assert(projection.required_support.includes("release_review"));
      assert(projection.required_support.includes("maintenance_readiness"));
    }
  },
  {
    name: "unbounded SOF TF charter is blocked",
    file: "sample-payloads/invalid-sof-tf-charter-unbounded.json",
    validate() {
      validate(this.file, 1, [
        "SOF_TF_WITHOUT_TRIGGER",
        "SOF_TF_WITHOUT_RED_RETAINED_AUTHORITY",
        "SOF_TF_DIRECT_ACTION_WITHOUT_APPROVAL",
        "SOF_TF_RED_TEAM_NOT_INDEPENDENT",
        "SOF_TF_RELEASE_REVIEW_NOT_INDEPENDENT",
        "SOF_TF_WITHOUT_RECORDER",
        "SOF_TF_SOURCE_MAP_NOT_REQUIRED",
        "SOF_TF_RELEASE_REVIEW_NOT_REQUIRED",
        "SOF_TF_WITHOUT_FALLBACK_PLAN",
        "SOF_TF_WITHOUT_ABORT_CRITERIA"
      ]);
      const projection = runSofTfActivation(readJson(this.file));
      assert.strictEqual(projection.activation_decision, "no_go");
      assert(projection.preflight_blocks.some(block => /Separate Red Team/.test(block)));
      assert(projection.preflight_blocks.some(block => /source-map/.test(block)));
      assert(projection.preflight_blocks.some(block => /backbrief/.test(block)));
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

console.log(`SOF TF fixtures: ${passed}/${fixtures.length} passed`);
