#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyzeCollaboration } = require("./department-collaboration-runner");

const ROOT = __dirname;

function readJson(relativePath) {
  return require(path.join(ROOT, relativePath));
}

function validate(file, expectedCode, requiredCodes = []) {
  const result = spawnSync("node", ["validator-cli-prototype/validate.js", file, "department-collaboration-charter"], {
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
    name: "valid department collaboration charter is ready",
    file: "sample-payloads/valid-department-collaboration-charter.json",
    validate() {
      validate(this.file, 0);
      const projection = analyzeCollaboration(readJson(this.file));
      assert.strictEqual(projection.status, "ready");
      assert.strictEqual(projection.preflight_blocks.length, 0);
      assert(projection.relationship_edges.length >= 5, "expected cross-functional relationship edges");
      assert(projection.commander_queue.some(item => /Release target mismatch/.test(item.point)), "expected release decision point");
      assert(projection.sync_events.includes("Release go/no-go."), "expected release go/no-go sync event");
    }
  },
  {
    name: "siloed department collaboration charter is blocked",
    file: "sample-payloads/invalid-department-collaboration-charter-siloed.json",
    validate() {
      validate(this.file, 1, [
        "COLLABORATION_TOO_FEW_DEPARTMENTS",
        "COLLABORATION_WITHOUT_COMMAND",
        "COLLABORATION_WITHOUT_RECORDER",
        "DEPARTMENT_WITHOUT_SOURCE_OF_TRUTH",
        "RELATIONSHIP_UNKNOWN_SUPPORTING_DEPARTMENT",
        "RELATIONSHIP_WITHOUT_REQUIRED_OUTPUTS",
        "RELATIONSHIP_WITHOUT_HANDOFF_INTERFACE",
        "RELATIONSHIP_WITHOUT_LIAISON",
        "LIAISON_NOT_PAIRWISE",
        "COLLABORATION_CONFLICT_AUTHORITY_TOO_LOW",
        "COLLABORATION_WITHOUT_DECISION_PACKET_ROUTE",
        "COLLABORATION_WITHOUT_SOURCE_MAP",
        "COLLABORATION_WITHOUT_EEFI_CONTROLS"
      ]);
      const projection = analyzeCollaboration(readJson(this.file));
      assert.strictEqual(projection.status, "blocked");
      assert(projection.missing_liaisons.length > 0, "expected missing liaison projection");
      assert(projection.unknown_dependencies.length > 0, "expected unknown dependency projection");
      assert(projection.preflight_blocks.some(block => /source-map/.test(block)), "expected source-map block");
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

console.log(`Department collaboration fixtures: ${passed}/${fixtures.length} passed`);
