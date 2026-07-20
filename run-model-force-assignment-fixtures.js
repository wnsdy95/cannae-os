#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyzeModelForceAssignment } = require("./model-force-assignment-runner");

const ROOT = __dirname;

function readJson(relativePath) {
  return require(path.join(ROOT, relativePath));
}

function validate(file, expectedCode, requiredCodes = []) {
  const result = spawnSync("node", ["validator-cli-prototype/validate.js", file, "model-force-assignment-plan"], {
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
    name: "validated mixed model force is ready",
    file: "sample-payloads/valid-model-force-assignment-plan.json",
    run() {
      validate(this.file, 0);
      const projection = analyzeModelForceAssignment(readJson(this.file));
      assert.strictEqual(projection.assignment_status, "ready");
      assert.strictEqual(projection.preflight_blocks.length, 0);
      assert.strictEqual(projection.assurance_status.different_model_family, true);
      assert.strictEqual(projection.pace_status.profiles_distinct, true);
      assert(projection.active_billets.some(item => item.force_class === "line" && item.capability_band === "C1"));
      assert(projection.active_billets.some(item => item.force_class === "command" && item.capability_band === "C3"));
      assert(projection.commander_queue.some(item => /external release/i.test(item.item)));
    }
  },
  {
    name: "unready model monoculture is blocked",
    file: "sample-payloads/invalid-model-force-assignment-plan-monoculture.json",
    run() {
      validate(this.file, 1, [
        "MODEL_ASSIGNMENT_FLOATING_VERSION",
        "MODEL_ASSIGNMENT_WITHOUT_EVIDENCE",
        "MODEL_ASSIGNMENT_TASK_NOT_EVALUATED",
        "MODEL_ASSIGNMENT_INSUFFICIENT_READINESS",
        "MODEL_ASSIGNMENT_CONTEXT_INELIGIBLE",
        "MODEL_ASSIGNMENT_SELF_FALLBACK",
        "MODEL_ASSIGNMENT_FALLBACK_NOT_QUALIFIED",
        "MODEL_ASSIGNMENT_FALLBACK_UNREADY",
        "MODEL_ASSIGNMENT_FALLBACK_CONTEXT_INELIGIBLE",
        "MODEL_ASSIGNMENT_CRITICAL_BILLET_WITHOUT_DEPTH",
        "MODEL_ASSIGNMENT_ROUTER_UNREADY",
        "MODEL_ASSIGNMENT_ROUTER_WITHOUT_HELD_OUT_EVAL",
        "MODEL_ASSIGNMENT_CONFIDENCE_ONLY",
        "MODEL_ASSIGNMENT_ASSURANCE_PROFILE_NOT_BILLETED",
        "MODEL_ASSIGNMENT_CORRELATED_ASSURANCE",
        "MODEL_ASSIGNMENT_WITHOUT_DETERMINISTIC_CHECKS",
        "MODEL_ASSIGNMENT_PACE_NOT_DISTINCT",
        "MODEL_ASSIGNMENT_PACE_NOT_TASK_READY",
        "MODEL_ASSIGNMENT_AUTHORITY_FROM_MODEL",
        "MODEL_ASSIGNMENT_HUMAN_AUTHORITY_MISSING",
        "MODEL_ASSIGNMENT_FORCE_MONOCULTURE"
      ]);
      const projection = analyzeModelForceAssignment(readJson(this.file));
      assert.strictEqual(projection.assignment_status, "blocked");
      assert(projection.preflight_blocks.some(block => /monoculture/.test(block)));
      assert(projection.preflight_blocks.some(block => /human final decision authority/.test(block)));
      assert(projection.preflight_blocks.some(block => /distinct primary/.test(block)));
      assert(projection.preflight_blocks.some(block => /T\/P-ready router/.test(block)));
    }
  }
];

let passed = 0;
for (const fixture of fixtures) {
  try {
    fixture.run();
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

console.log(`Model force assignment fixtures: ${passed}/${fixtures.length} passed`);
