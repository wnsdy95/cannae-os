#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { reviewKnowledgeManagement, validateAgainstSchema } = require("./km-review-runner");

const ROOT = __dirname;
const AS_OF = "2026-08-01T09:00:00+09:00";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function findingCodes(projection) {
  return new Set(projection.queues.findings.map(item => item.code));
}

function authorityArtifacts() {
  return [readJson("sample-payloads/valid-board-decision.json")];
}

function handoffPacket(overrides = {}) {
  return {
    ...readJson("sample-payloads/valid-handoff-packet.json"),
    id: "HP-DEMO-KM-001",
    pending_decisions: ["DL-DEMO-001 review at the next AAR."],
    source_of_truth_files: ["docs/knowledge-management-sop.md", "docs/source-map.md"],
    ...overrides
  };
}

function reviewInput(overrides = {}) {
  return {
    authorityArtifacts: authorityArtifacts(),
    repositoryRoot: ROOT,
    asOf: AS_OF,
    ...overrides
  };
}

const cases = [
  {
    name: "compliant KM set passes",
    check() {
      const decision = readJson("sample-payloads/valid-decision-log.json");
      const source = readJson("sample-payloads/valid-source-record.json");
      assert.deepStrictEqual(validateAgainstSchema(decision, "decision-log.schema.json").errors, []);
      assert.deepStrictEqual(validateAgainstSchema(source, "source-record.schema.json").errors, []);
      const projection = reviewKnowledgeManagement(reviewInput({
        decisionLog: [decision],
        sourceRecords: [source],
        handoffPacket: handoffPacket()
      }));
      assert.strictEqual(projection.status, "ready");
      assert.strictEqual(projection.mission_id, "M-DEMO-001");
      assert.strictEqual(projection.queues.findings.length, 0);
      assert.strictEqual(projection.queues.escalations.length, 0);
      assert.strictEqual(projection.queues.compliant.length, 3);
    }
  },
  {
    name: "decision without authority basis is flagged",
    check() {
      const decision = readJson("sample-payloads/invalid-decision-log-no-authority-basis.json");
      const schemaResult = validateAgainstSchema(decision, "decision-log.schema.json");
      assert.strictEqual(schemaResult.valid, false);
      assert(schemaResult.errors.some(error => /authority_basis/.test(error)), "expected schema error for authority_basis");
      const projection = reviewKnowledgeManagement(reviewInput({ decisionLog: [decision], sourceRecords: [] }));
      assert.strictEqual(projection.status, "blocked");
      assert(findingCodes(projection).has("DECISION_WITHOUT_AUTHORITY_BASIS"));
    }
  },
  {
    name: "source record with invalid tier is flagged",
    check() {
      const source = readJson("sample-payloads/invalid-source-record-bad-tier.json");
      const schemaResult = validateAgainstSchema(source, "source-record.schema.json");
      assert.strictEqual(schemaResult.valid, false);
      assert(schemaResult.errors.some(error => /tier/.test(error)), "expected schema error for tier");
      const projection = reviewKnowledgeManagement(reviewInput({ decisionLog: [], sourceRecords: [source] }));
      assert.strictEqual(projection.status, "blocked");
      assert(findingCodes(projection).has("SOURCE_TIER_INVALID"));
    }
  },
  {
    name: "stale unresolved decision escalates to the next battle-rhythm event",
    check() {
      const decision = {
        ...readJson("sample-payloads/valid-decision-log.json"),
        id: "DL-DEMO-003",
        status: "pending",
        decided_at: "2026-07-10T09:00:00+09:00"
      };
      const projection = reviewKnowledgeManagement(reviewInput({
        decisionLog: [decision],
        sourceRecords: [],
        staleAfterDays: 7,
        nextBattleRhythmEvent: "Demo decision board."
      }));
      assert.strictEqual(projection.status, "blocked");
      assert.strictEqual(projection.queues.findings.length, 0);
      const escalation = projection.queues.escalations.find(item => item.code === "STALE_UNRESOLVED_DECISION");
      assert(escalation, "expected stale unresolved decision escalation");
      assert.strictEqual(escalation.id, "DL-DEMO-003");
      assert.strictEqual(escalation.route_to, "Demo decision board.");
    }
  },
  {
    name: "handoff reference to an unknown decision is flagged",
    check() {
      const projection = reviewKnowledgeManagement(reviewInput({
        decisionLog: [readJson("sample-payloads/valid-decision-log.json")],
        sourceRecords: [readJson("sample-payloads/valid-source-record.json")],
        handoffPacket: handoffPacket({
          id: "HP-DEMO-KM-102",
          pending_decisions: ["DL-DEMO-999 commander disposition."],
          source_of_truth_files: ["docs/source-map.md"]
        })
      }));
      assert.strictEqual(projection.status, "blocked");
      assert(findingCodes(projection).has("HANDOFF_REFERENCE_UNRESOLVED"));
    }
  },
  {
    name: "schema-invalid decision cannot enter the compliant queue",
    check() {
      const decision = {
        ...readJson("sample-payloads/valid-decision-log.json"),
        decision_type: "fabricated_decision_type"
      };
      const projection = reviewKnowledgeManagement(reviewInput({ decisionLog: [decision], sourceRecords: [] }));
      assert.strictEqual(projection.status, "blocked");
      assert(findingCodes(projection).has("DECISION_SCHEMA_INVALID"));
      assert(!projection.queues.compliant.some(item => item.id === decision.id));
    }
  },
  {
    name: "schema-invalid source cannot enter the compliant queue",
    check() {
      const source = readJson("sample-payloads/valid-source-record.json");
      source.claims[0].label = "Opinion";
      const projection = reviewKnowledgeManagement(reviewInput({ decisionLog: [], sourceRecords: [source] }));
      assert.strictEqual(projection.status, "blocked");
      assert(findingCodes(projection).has("SOURCE_SCHEMA_INVALID"));
      assert(!projection.queues.compliant.some(item => item.id === source.id));
    }
  },
  {
    name: "nonexistent authority reference is blocked",
    check() {
      const decision = readJson("sample-payloads/valid-decision-log.json");
      decision.authority_basis.reference = "BD-GHOST-999";
      const projection = reviewKnowledgeManagement(reviewInput({ decisionLog: [decision], sourceRecords: [] }));
      assert.strictEqual(projection.status, "blocked");
      assert(findingCodes(projection).has("AUTHORITY_REFERENCE_UNRESOLVED"));
    }
  },
  {
    name: "nonexistent linked document is blocked",
    check() {
      const source = readJson("sample-payloads/valid-source-record.json");
      source.linked_documents = ["docs/does-not-exist.md"];
      const projection = reviewKnowledgeManagement(reviewInput({ decisionLog: [], sourceRecords: [source] }));
      assert.strictEqual(projection.status, "blocked");
      assert(findingCodes(projection).has("SOURCE_DOCUMENT_UNRESOLVED"));
    }
  }
];

let passed = 0;
for (const testCase of cases) {
  try {
    testCase.check();
    passed += 1;
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    console.log(`FAIL ${testCase.name}`);
    console.log(error.stack || error.message);
  }
}

console.log(JSON.stringify({
  total: cases.length,
  passed,
  failed: cases.length - passed
}, null, 2));

process.exit(passed === cases.length ? 0 : 1);
