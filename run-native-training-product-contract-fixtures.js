#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process"), { z } = require("zod");
const c = require("./native-training-product-contract"), t = require("./task-training-contract"), f = require("./native-training-product-fixtures/contracts");
const validator = require("./validator-cli-prototype/validate"); let passed = 0;
const test = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
test("strict native contracts and both validator APIs remain non-executable", () => {
  for (const [type, value] of Object.entries(f.samples())) {
    c.checked(value, type);
    for (const validate of [validator.validatePayload, validator.validateSchemaPayload]) { const result = validate(value, type); assert.equal(result.valid, true, JSON.stringify(result.issues)); assert.equal(result.can_execute, false); }
    assert(!validator.validatePayload({ ...value, release_authorized: true }, type).valid);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, "schema-files", `${type}.schema.json`))),
      { ...z.toJSONSchema(c.SCHEMAS[type]), $id: `https://controls.local/schema-files/${type}.schema.json` });
  }
});
test("native standards keep explicit methods and distinct stage inputs without reinterpreting legacy standards", () => {
  t.checked(f.standard(), "task-training-standard"); t.checked(require("./task-training-fixtures/contracts").samples()["task-training-standard"], "task-training-standard");
  const value = f.standard(); value.cases[1].input_text = value.cases[0].input_text;
  assert.throws(() => t.checked(value, "task-training-standard"), /TRAINING_STANDARD_CASE_COVERAGE_INVALID/);
  value.cases[1].input_text += "different"; delete value.cases[0].execution_method;
  assert.throws(() => t.checked(value, "task-training-standard"), /TRAINING_CONTRACT_INVALID/);
});
test("request identity and freshness are semantic bindings, not mutable labels", () => {
  const request = f.request(); assert(validator.validatePayload({ ...request, case_id: "CASE-foreign" }, "native-training-product-request").issues.some(x => x.code === "NATIVE_TRAINING_REQUEST_ID_INVALID"));
  const { id, ...input } = request;
  assert.throws(() => c.request({ ...input, expires_at: request.created_at }), /NATIVE_TRAINING_REQUEST_WINDOW_INVALID/);
});
test("transport wrappers and nested collection copies are not work", () => {
  for (const type of c.NON_WORK_TYPES) assert(require("./semantic-control-types").isNonWorkPayload({ copied: [{ type }] }));
});
test("response case, byte encoding, size and control-metadata boundaries are checked independently", () => {
  const request = f.request(), preview = { input: { request, training_case: { case_id: request.case_id, minimum_output_bytes: 5 } } }, response = f.samples()["native-training-product-response"];
  assert.equal(c.assessResponse(response, preview).qualification_granted, false);
  assert.throws(() => c.assessResponse({ ...response, case_id: "CASE-other" }, preview), /SEMANTIC_TRAINING_RESPONSE_SUBSTITUTED/);
  assert.throws(() => c.assessResponse({ ...response, output: "x" }, preview), /SEMANTIC_TRAINING_PRODUCT_SIZE_INVALID/);
  assert.throws(() => c.assessResponse({ ...response, output: "\ud800".repeat(10) }, preview), /WORKLOAD_JSON_UNICODE_INVALID/);
  assert.throws(() => c.assessResponse({ ...response, output: JSON.stringify({ type: "NativeTrainingProductRequest" }) }, preview), /SEMANTIC_TRAINING_CONTROL_METADATA_NOT_PRODUCT/);
});
test("actual CLI returns valid non-executable JSON rather than relying on an import", () => {
  const result = cp.spawnSync(process.execPath, ["validator-cli-prototype/validate.js", "sample-payloads/valid-native-training-product-request.json", "native-training-product-request"], { cwd: __dirname, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).can_execute, false);
});
test("OPSEC checks the actual minimized prompt and still rejects forbidden selected content", () => {
  const input = { request: f.request(), standard: f.standard(), training_case: f.standard().cases[0] };
  input.standard.cases[8].input_text = 'password="synthetic-unused-case"';
  c.assertTransferPermitted(input);
  assert(!c.promptFor(input).includes("synthetic-unused-case"));
  input.training_case = { ...input.training_case, input_text: 'password="synthetic-selected-case"' };
  assert.throws(() => c.assertTransferPermitted(input), /SEMANTIC_TRAINING_TRANSFER_OPSEC_DENIED/);
});
test("metadata profile discovery cannot mutate the shared disabled-feature envelope", () => {
  const collector = require("./codex-training-product-collector"), options = { executable: path.join(__dirname, "native-training-product-fixtures/fake-codex.js"), model: "synthetic-test-model" };
  const first = collector.prepareProfile(options); first.disabled_features.length = 0;
  assert(collector.prepareProfile(options).disabled_features.includes("shell_tool"));
});
test("proposal CLI emits a bounded code without a malformed-input canary", () => {
  const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "native-proposal-canary-")), file = path.join(directory, "malformed.json");
  try {
    fs.writeFileSync(file, "PRIVATEVALUE-CANARY-invalid-json", { mode: 0o600 });
    const result = cp.spawnSync(process.execPath, [path.join(__dirname, "native-training-product-cli.js"), "propose", file,
      "--repository", directory, "--artifact-root", path.join(directory, "artifacts")], { cwd: directory, encoding: "utf8", env: { PATH: process.env.PATH, HOME: directory } });
    assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr.trim(), "SEMANTIC_TRAINING_PROPOSAL_FAILED"); assert(!result.stderr.includes("PRIVATEVALUE"));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, owner_consent_producer_implemented: false, qualification_supported: false }));
