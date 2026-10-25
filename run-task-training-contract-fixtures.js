#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), { z } = require("zod");
const c = require("./task-training-contract"), { samples } = require("./task-training-fixtures/contracts");
const { validatePayload, validateSchemaPayload } = require("./validator-cli-prototype/validate"), { isNonWorkPayload } = require("./semantic-control-types");
let passed = 0;
function check(name, run) { run(); passed++; console.log(`PASS ${name}`); }
const values = samples();
for (const [type, value] of Object.entries(values)) {
  check(`${type} has exact current generated schema and sample`, () => {
    const expected = { ...z.toJSONSchema(c.SCHEMAS[type]), $id: `https://controls.local/schema-files/${type}.schema.json` };
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, "schema-files", `${type}.schema.json`))), expected);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", `valid-${type}.json`))), value);
  });
  check(`${type} remains non-executable through both APIs and cannot become work`, () => {
    for (const validate of [validatePayload, validateSchemaPayload]) { const result = validate(value, type); assert.equal(result.valid, true, JSON.stringify(result.issues)); assert.equal(result.can_execute, false); }
    assert.equal(isNonWorkPayload({ copied: [JSON.parse(JSON.stringify(value))] }), true);
    const invalid = validatePayload({ ...value, execution_authorized: true }, type); assert.equal(invalid.valid, false); assert.equal(invalid.can_execute, false);
  });
}
for (const [name, mutate, code] of [
  ["unobserved critical step cannot be omitted", value => { value.steps = []; }, "TRAINING_CONTRACT_INVALID"],
  ["critical steps cannot use N/A", value => { value.steps[0].not_applicable_permitted = true; }, "TRAINING_STANDARD_CRITICAL_OR_PRODUCT_MISSING"],
  ["walk case coverage cannot be replaced by crawl repeats", value => { value.cases = value.cases.filter(item => item.stage === "crawl"); }, "TRAINING_STANDARD_CASE_COVERAGE_INVALID"],
  ["duplicate case labels fail", value => { value.cases[1].case_id = value.cases[0].case_id; }, "TRAINING_STANDARD_DUPLICATE_ID"],
  ["blank standards are not observations", value => { value.steps[0].standard = "   "; }, "TRAINING_STANDARD_TEXT_MISSING"],
  ["invalid standards stop before semantic array access", value => { value.steps = null; }, "TRAINING_CONTRACT_INVALID"]
]) check(name, () => { const value = structuredClone(values["task-training-standard"]); mutate(value); assert.throws(() => c.checked(value, "task-training-standard"), new RegExp(code)); });
check("role labels are not authenticated principal identities", () => {
  const value = { ...values["task-training-session-binding"], principal_id: "EVALUATOR" };
  assert.throws(() => c.checked(value, "task-training-session-binding"), /TRAINING_CONTRACT_INVALID/);
});
check("a rekeyed appraisal cannot conceal a non-canonical nested request", () => {
  const { id, ...body } = structuredClone(values["task-training-trial-appraisal"]); body.request.id = "TTR-REPLACED"; body.request_sha256 = c.digest(body.request);
  assert.throws(() => c.checked(c.identified("TTA", body), "task-training-trial-appraisal"), /TRAINING_INPUT_ID_BINDING_INVALID/);
});
console.log(JSON.stringify({ passed, failed: 0, qualification_supported: false, execution_authorized: false, release_authorized: false }, null, 2));
