#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyzeDoctrineConsistency } = require("./doctrine-consistency-runner");

const ROOT = __dirname;

function readJson(relativePath) {
  return require(path.join(ROOT, relativePath));
}

function validate(file, expectedCode, requiredCodes = []) {
  const result = spawnSync("node", ["validator-cli-prototype/validate.js", file, "doctrine-consistency-review"], {
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
    name: "multinational doctrine review is ready",
    file: "sample-payloads/valid-doctrine-consistency-review.json",
    validate() {
      validate(this.file, 0);
      const projection = analyzeDoctrineConsistency(readJson(this.file));
      assert.strictEqual(projection.status, "ready");
      assert.strictEqual(projection.source_family_coverage.total, 5);
      assert.strictEqual(projection.source_family_coverage.non_us_total, 4);
      assert(projection.policy_update_queue.some(item => item.target === "docs/tool-use-roe.md"), "expected ROE policy update queue");
      assert.strictEqual(projection.unresolved_conflicts.length, 0);
    }
  },
  {
    name: "US-only doctrine review is blocked",
    file: "sample-payloads/invalid-doctrine-consistency-review-us-only.json",
    validate() {
      validate(this.file, 1, [
        "DOCTRINE_REVIEW_TOO_FEW_SOURCE_FAMILIES",
        "DOCTRINE_REVIEW_TOO_FEW_NON_US_FAMILIES",
        "DOCTRINE_REVIEW_US_ONLY_DISPOSITION",
        "DOCTRINE_REVIEW_CONTROL_DISABLED",
        "DOCTRINE_REVIEW_UNVERIFIED_FINDING",
        "DOCTRINE_REVIEW_PLACEHOLDER_DOC_UPDATE",
        "DOCTRINE_REVIEW_ROLE_ALIAS_MISSING",
        "DOCTRINE_REVIEW_JURISDICTION_GATE_MISSING"
      ]);
      const projection = analyzeDoctrineConsistency(readJson(this.file));
      assert.strictEqual(projection.status, "blocked");
      assert(projection.preflight_blocks.some(block => /non-US/.test(block)), "expected non-US coverage block");
      assert(projection.unresolved_conflicts.some(item => /US-only/.test(item.reason)), "expected US-only conflict");
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

console.log(`Doctrine consistency fixtures: ${passed}/${fixtures.length} passed`);
