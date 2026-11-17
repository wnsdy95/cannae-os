#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process"), assert = require("node:assert/strict"), { z } = require("zod");
const c = require("./native-training-producer"), t = require("./task-training-contract"), v = require("./validator-cli-prototype/validate");
let passed = 0; const test = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
test("the fixed historical sample and schema remain exact non-authorizing contracts", () => {
  const type = "native-training-producer-inspection", value = require(`./sample-payloads/valid-${type}.json`);
  assert.deepEqual(c.inspect(c.legacySnapshot().method_sha256), value);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, "schema-files", type + ".schema.json"))), { ...z.toJSONSchema(c.INSPECTION), $id: `https://controls.local/schema-files/${type}.schema.json` });
  for (const validate of [v.validatePayload, v.validateSchemaPayload]) { const result = validate(value, type); assert.equal(result.valid, true); assert.equal(result.can_execute, false); }
  assert(v.validatePayload(require(`./sample-payloads/invalid-${type}.json`), type).issues.some(item => item.code === "NATIVE_TRAINING_PRODUCER_SUBSTITUTED"));
});
test("current measured bytes and the exact historical tuple are distinct", () => {
  const current = c.inspect(), old = c.inspect(c.legacySnapshot().method_sha256);
  assert.equal(current.profile, "current"); assert.equal(old.profile, "historical_cab6d09"); assert.notEqual(current.method_sha256, old.method_sha256);
  assert.equal(current.method_sha256, t.digest(current.method_files)); assert.equal(old.method_sha256, t.digest(old.method_files));
  assert(current.method_files.some(item => item.file === "native-training-producer.js"));
  for (const file of ["operator-model-reconciliation-service.js", "operator-console-server.js"]) assert(current.method_files.some(item => item.file === file));
  assert.equal(old.source_revision, "cab6d098a1229ede35dff4697994ac34f5ad7418");
});
test("the later captured producer is historical-only with its exact schema and semantic bindings", () => {
  const later = c.inspect(c.legacySnapshot("bcb79dd").method_sha256), type = "native-training-producer-inspection";
  assert.equal(later.profile, "historical_bcb79dd"); assert.equal(later.source_revision, "bcb79dd9009e96d4ffd4acd5f449d218ba768846");
  assert.deepEqual(require("./sample-payloads/valid-native-training-producer-inspection-bcb.json"), later);
  for (const validate of [v.validatePayload, v.validateSchemaPayload]) { const result = validate(later, type); assert.equal(result.valid, true); assert.equal(result.can_execute, false); }
  assert(v.validatePayload(require("./sample-payloads/invalid-native-training-producer-inspection-bcb.json"), type).issues.some(item => item.code === "NATIVE_TRAINING_PRODUCER_SUBSTITUTED"));
  assert.notEqual(c.inspect().method_sha256, later.method_sha256); assert.equal(later.historical_execution_authorized, false); assert.equal(later.hold_discharge_authorized, false);
});
test("unknown same-version and hybrid metadata fail closed without an ignored digest", () => {
  const old = c.inspect(c.legacySnapshot().method_sha256), changed = JSON.parse(JSON.stringify(old));
  changed.method_files[0].sha256 = "0".repeat(64);
  assert(c.issues(changed, "native-training-producer-inspection").some(item => item.code === "NATIVE_TRAINING_PRODUCER_SUBSTITUTED"));
  changed.method_sha256 = t.digest(changed.method_files);
  assert.throws(() => c.inspect(changed.method_sha256), /SEMANTIC_TRAINING_PRODUCER_UNKNOWN/);
  for (const field of ["source_tree", "dependency_lock_sha256"]) assert(c.issues({ ...old, [field]: "0".repeat(field === "source_tree" ? 40 : 64) }, "native-training-producer-inspection").length);
});
test("inspection cannot add authority, become work or mutate the next observation", () => {
  const current = c.inspect(); current.method_files[0].sha256 = "0".repeat(64); assert.notEqual(c.inspect().method_files[0].sha256, current.method_files[0].sha256);
  const old = c.inspect(c.legacySnapshot().method_sha256);
  for (const field of ["execution_authorized", "release_authorized", "producer_trust_admitted", "historical_execution_authorized", "hold_discharge_authorized", "qualification_granted"])
    assert.equal(v.validatePayload({ ...old, [field]: true }, "native-training-producer-inspection").valid, false);
  for (const type of ["NativeTrainingProducerInspection", "NativeTrainingHistoricalProducerSnapshot"]) assert(require("./semantic-control-types").isNonWorkPayload({ copied: [{ type }] }));
});
test("both actual skill wrappers inspect but cannot sign, settle or run a historical producer", () => {
  for (const provider of ["codex-skills", ".claude/skills"]) {
    const script = path.join(__dirname, provider, "controls-doctrine-operator/scripts/inspect_controls_training_producer.js"), options = { cwd: __dirname, encoding: "utf8", env: { PATH: process.env.PATH, CANNAE_OS_HOME: __dirname, HOME: __dirname } };
    for (const name of c.snapshotNames()) {
      const result = cp.spawnSync(process.execPath, [script, "inspect", c.legacySnapshot(name).method_sha256], options); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).hold_discharge_authorized, false);
    }
    for (const action of ["run", "authorize", "settle"]) assert.equal(cp.spawnSync(process.execPath, [script, action], options).status, 1);
    const invalid = cp.spawnSync(process.execPath, [script, "inspect", "PRIVATEVALUE-CANARY"], options); assert.equal(invalid.status, 1); assert(!invalid.stderr.includes("PRIVATEVALUE")); assert.equal(invalid.stdout, "");
  }
});
console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, inspection_grants_hold_discharge: false, all_eight_goals_complete: false }));
