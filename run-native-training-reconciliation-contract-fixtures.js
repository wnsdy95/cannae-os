#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process"), crypto = require("node:crypto"), assert = require("node:assert/strict"), { z } = require("zod");
const c = require("./operator-native-training-reconciliation-contract"), t = require("./task-training-contract"), v = require("./validator-cli-prototype/validate");
const { keyDigest, signOperatorRecord } = require("./operator-consent-contract"), key = require("./native-training-reconciliation-fixtures/public-key.json").public_key_pem;
const samples = Object.fromEntries(Object.keys(c.SCHEMAS).map(type => [type, require(`./sample-payloads/valid-${type}.json`)]));
const a = samples["operator-native-training-reconciliation-authorization"], pair = crypto.generateKeyPairSync("ed25519"), secret = pair.privateKey.export({ type: "pkcs8", format: "pem" }), publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const rekey = value => { const { id, ...body } = value; return t.identified("NTFAP", body); };
const signed = mutate => { const value = structuredClone(a); value.subject.trusted_key_sha256 = keyDigest(publicKey); value.subject.native_appraisal.trusted_key_sha256 = keyDigest(publicKey);
  value.subject.native_appraisal = rekey(value.subject.native_appraisal); value.displayed_subject_sha256 = t.digest(value.subject); mutate(value); return signOperatorRecord(value, secret); };
const changeAppraisal = (value, mutate) => { mutate(value.subject.native_appraisal); value.subject.native_appraisal = rekey(value.subject.native_appraisal); value.displayed_subject_sha256 = t.digest(value.subject); };
let passed = 0; const test = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
test("three exact schema/sample contracts and both validators remain non-executable", () => {
  for (const [type, value] of Object.entries(samples)) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, "schema-files", type + ".schema.json"))), { ...z.toJSONSchema(c.SCHEMAS[type]), $id: `${type}.schema.json` });
    for (const validate of [v.validatePayload, v.validateSchemaPayload]) { const result = validate(value, type); assert.equal(result.valid, true, JSON.stringify(result.issues)); assert.equal(result.can_execute, false); }
    assert.equal(v.validatePayload({ ...value, release_authorized: true }, type).valid, false);
  }
  c.verifyAuthorization(a, key); c.verifyRecord(samples["operator-native-training-reconciliation-record"], key);
});
test("a current file observation cannot manufacture a missing original byte commitment", () => {
  for (const mutate of [value => { value.response.original_file_bytes_bound = true; }, value => { value.response.original_file_sha256 = "0".repeat(64); },
    value => { value.response.original_file_bytes_bound = true; value.response.original_file_sha256 = "0".repeat(64); }]) {
    const value = rekey(Object.assign(structuredClone(samples["native-training-failure-appraisal"]), {})); mutate(value);
    assert(c.appraisalIssues(rekey(value)).some(issue => issue.code === "NATIVE_RECONCILIATION_RESPONSE_COMMITMENT_INVALID"));
  }
  const value = structuredClone(samples["native-training-failure-appraisal"]); value.response.original_file_sha256 = value.response.observed_file_sha256; value.response.original_file_bytes_bound = true;
  assert.deepEqual(c.appraisalIssues(rekey(value)), []);
});
test("all four accepted-product publication prefixes have exact IDs and no task admission", () => {
  for (const count of [0, 1, 2, 3]) {
    const value = signed(auth => changeAppraisal(auth, p => {
      p.assessment = { kind: "accepted_native_product", appraisal_sha256: "1".repeat(64), output_sha256: "2".repeat(64), output_bytes: 32 };
      p.response.original_file_bytes_bound = true; p.response.original_file_sha256 = p.response.observed_file_sha256;
      p.publication.state = ["none", "authorization_only", "authorization_and_output", "complete"][count];
      for (const [index, [field, id]] of [["authorization_ref", `NTFA-${p.action_id}`], ["output_ref", `NTO-${p.collection_id}`], ["result_ref", `NTOR-${p.action_id}`]].entries())
        p.publication[field] = count > index ? { artifact_id: id, relative_path: `synthetic/${id}`, sha256: index === 1 ? p.assessment.output_sha256 : "3".repeat(64) } : null;
    }));
    c.verifyAuthorization(value, publicKey); const record = c.recordFor(value, "2026-10-26T00:00:02Z", secret); c.verifyRecord(record, publicKey);
    assert.equal(record.qualification_granted, false); assert.equal(record.task_output_admitted, false); assert.equal(record.artifact_settlement_authorized, false);
  }
});
test("rejected outputs, broken publication prefixes, foreign IDs and unknown producers fail despite new signatures", () => {
  for (const mutate of [p => { p.publication.state = "authorization_only"; p.publication.authorization_ref = { artifact_id: `NTFA-${p.action_id}`, relative_path: "synthetic/a", sha256: "0".repeat(64) }; },
    p => { p.publication.state = "none"; p.publication.result_ref = { artifact_id: `NTOR-${p.action_id}`, relative_path: "synthetic/r", sha256: "0".repeat(64) }; },
    p => { p.producer_method_sha256 = "0".repeat(64); }]) assert.throws(() => c.verifyAuthorization(signed(value => changeAppraisal(value, mutate)), publicKey), /AUTHORIZATION_INVALID/);
});
test("displayed subject, original row and process evidence cannot be substituted independently", () => {
  for (const mutate of [value => { value.displayed_subject_sha256 = "0".repeat(64); }, value => { value.subject.original_action_sha256 = "0".repeat(64); value.displayed_subject_sha256 = t.digest(value.subject); },
    value => changeAppraisal(value, p => { p.process_id++; }), value => changeAppraisal(value, p => { p.child_absence_observed = false; })])
    assert.throws(() => c.verifyAuthorization(signed(mutate), publicKey), /AUTHORIZATION_INVALID/);
});
test("qualification, release, settlement and authority expansion stay forbidden in every wrapper", () => {
  for (const field of ["execution_authorized", "release_authorized", "qualification_granted", "grant_restoration_authorized"])
    assert.throws(() => c.verifyAuthorization(signed(value => { value[field] = true; }), publicKey), /AUTHORIZATION_INVALID/);
  for (const type of ["NativeTrainingFailureAppraisal", "OperatorNativeTrainingReconciliationAuthorization", "OperatorNativeTrainingReconciliationRecord"])
    assert(require("./semantic-control-types").isNonWorkPayload({ nested: [{ type }] }));
});
test("native consent cannot borrow omission/analysis signatures or expand its finite time window", () => {
  for (const prefix of ["operator-model", "operator-analysis"]) {
    const foreign = require(`./sample-payloads/valid-${prefix}-reconciliation-authorization.json`);
    assert.throws(() => c.verifyAuthorization(foreign, key), /AUTHORIZATION_INVALID/);
    assert.throws(() => require(`./${prefix}-reconciliation-contract`).verifyAuthorization(a, key), /AUTHORIZATION_INVALID/);
  }
  for (const mutate of [value => { value.expires_at = value.created_at; }, value => { value.expires_at = "2026-10-26T01:00:00Z"; }, value => { value.subject.observed_at = "2026-10-25T00:00:00Z"; }])
    assert.throws(() => c.verifyAuthorization(signed(mutate), publicKey), /AUTHORIZATION_INVALID/);
});
test("actual generic CLI and offline signature audit do not imply private-history consumption", () => {
  for (const type of Object.keys(samples)) for (const prefix of ["valid", "invalid"]) {
    const result = cp.spawnSync(process.execPath, ["validator-cli-prototype/validate.js", `sample-payloads/${prefix}-${type}.json`, type], { cwd: __dirname, encoding: "utf8" });
    assert.equal(result.status, prefix === "valid" ? 0 : 1, result.stderr); assert.equal(JSON.parse(result.stdout).can_execute, false);
  }
  const audit = cp.spawnSync(process.execPath, ["operator-model-reconciliation-runner.js", "sample-payloads/valid-operator-native-training-reconciliation-record.json", "--public-key", "native-training-reconciliation-fixtures/public-key.json"], { cwd: __dirname, encoding: "utf8" });
  assert.equal(audit.status, 0, audit.stderr); const result = JSON.parse(audit.stdout); assert.equal(result.signature_valid, true); assert.equal(result.private_history_verified, false); assert.equal(result.hold_discharged, false);
});
test("native, issuance and channel bindings measure the appraisal, contracts and exact schemas", () => {
  for (const binding of [require("./method-control-contract"), require("./dispatch-issuance-contract")]) {
    for (const file of ["operator-native-training-failure.js", "operator-native-training-reconciliation-contract.js", "schema-files/native-training-failure-appraisal.schema.json",
      "schema-files/operator-native-training-reconciliation-authorization.schema.json", "schema-files/operator-native-training-reconciliation-record.schema.json"]) {
      assert(binding.CODE.includes(file)); assert(require("./native-training-producer").METHOD_FILES.includes(file));
      const read = fs.readFileSync, before = binding.runtimeDigest();
      fs.readFileSync = function(filename, ...args) { const bytes = read.call(this, filename, ...args); return typeof filename === "string" && path.resolve(filename) === path.join(__dirname, file)
        ? Buffer.concat([Buffer.from(bytes), Buffer.from("\n")]) : bytes; };
      try { assert.notEqual(binding.runtimeDigest(), before); } finally { fs.readFileSync = read; }
    }
  }
});
console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, native_owner_ceremony_exercised: false, hold_discharge_exercised: false, all_eight_goals_complete: false }));
