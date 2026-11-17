#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { z } = require("zod");
const c = require("./training-session-contract"), t = require("./task-training-contract"), { samples, publicKey } = require("./training-session-fixtures/contracts");
const { validatePayload, validateSchemaPayload } = require("./validator-cli-prototype/validate"), values = samples();
let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
test("the actual positional CLI exports nested validation before entering main", () => {
  const result = require("node:child_process").spawnSync(process.execPath, ["validator-cli-prototype/validate.js", "sample-payloads/valid-training-session-authorization.json", "training-session-authorization"],
    { cwd: __dirname, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr); const value = JSON.parse(result.stdout); assert.equal(value.valid, true); assert.equal(value.can_execute, false);
});
for (const [type, value] of Object.entries(values)) test(`${type} is strict, non-executable and matches the exact synthetic sample`, () => {
  const actualType = type.replace("-current", "");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", `valid-${type}.json`))), value);
  for (const validate of [validatePayload, validateSchemaPayload]) {
    const result = validate(value, actualType); assert(result.valid, JSON.stringify(result.issues)); assert.equal(result.can_execute, false);
  }
  assert.equal(require("./semantic-control-types").isNonWorkPayload({ nested: [value] }), true);
  for (const field of ["execution_authorized", "release_authorized", "qualification_granted", "grant_restoration_authorized"]) assert.equal(validatePayload({ ...value, [field]: true }, actualType).valid, false);
});
for (const [type, schema] of Object.entries(c.SCHEMAS)) test(`${type} has exact generated schema`, () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, "schema-files", `${type}.schema.json`))), { ...z.toJSONSchema(schema), $id: `https://controls.local/schema-files/${type}.schema.json` });
});
test("a session purpose is not definition consent and role text is not a principal", () => {
  for (const mutate of [v => { v.purpose = "force_registry_enrollment"; }, v => { v.principal_id = "USER"; }, v => { v.review.capability = null; }]) {
    const value = structuredClone(values["training-session-authorization"]); mutate(value); assert.equal(validatePayload(value, "training-session-authorization").valid, false);
  }
});
test("separately pinned signature authenticates the exact complete displayed subject", () => {
  c.verifyAuthorization(values["training-session-authorization"], publicKey);
  const value = structuredClone(values["training-session-authorization"]); value.displayed_review_sha256 = "0".repeat(64);
  assert.throws(() => c.verifyAuthorization(value, publicKey), /TRAINING_SESSION_AUTHORIZATION_SUBJECT_INVALID/);
});
test("digest-derived proposals cannot hide duplicate cases, expired windows or substitution", () => {
  const value = values["training-session-proposal"];
  assert.throws(() => c.checked({ ...value, request: { ...value.request, stage: "walk" } }, "training-session-proposal"), /PROPOSAL_ID_INVALID/);
  assert.throws(() => c.proposal({ ...value.request, case_ids: ["CASE-crawl-0", "CASE-crawl-0"] }, value.created_at), /CASE_DUPLICATE/);
  assert.throws(() => c.proposal({ ...value.request, expires_at: value.created_at }, value.created_at), /WINDOW_INVALID/);
});
test("legacy mappings remain readable without retrospectively claiming owner ceremony", () => {
  const value = require("./task-training-fixtures/contracts").samples()["task-training-session-binding"];
  assert.equal(t.checked(value, "task-training-session-binding"), value); assert.equal(value.schema_version, "0.1"); assert.equal(value.authorization_ref, undefined);
});
console.log(JSON.stringify({ passed, failed: 0, real_owner_actions: 0, qualification_supported: false, execution_authorized: false, release_authorized: false }, null, 2));
