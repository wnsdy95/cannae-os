#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), c = require("./native-training-transfer-contract"), f = require("./native-training-transfer-fixtures/contracts");
let passed = 0; const test = (name, run) => { run(); console.log(`PASS ${name}`); passed++; };
for (const [type, value] of Object.entries(f.samples())) test(`${type} has exact current schema/sample, strict nested validation and no authority`, () => {
  c.checked(value, type); assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", `valid-${type}.json`))), value);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, "schema-files", `${type}.schema.json`))), require("./native-training-transfer-fixtures/write-samples").schemaFor(type, c.SCHEMAS[type]));
  for (const validate of [require("./validator-cli-prototype/validate").validatePayload, require("./validator-cli-prototype/validate").validateSchemaPayload]) {
    const result = validate(value, type); assert(result.valid, JSON.stringify(result.issues)); assert.equal(result.can_execute, false);
    assert.equal(validate({ ...value, qualification_granted: true }, type).valid, false);
  }
  assert(require("./semantic-control-types").isNonWorkPayload({ copied: [value] }));
});
test("unknown nested review fields fail both authoritative validators after rebuilding the content ID", () => {
  const { id, ...body } = structuredClone(f.samples()["native-training-transfer-review-request"]); body.labels[0].unreviewed_authority = true;
  const value = require("./task-training-contract").identified("NTDR", body);
  assert.throws(() => c.checked(value, "native-training-transfer-review-request"), /NATIVE_TRAINING_NESTED_REVIEW_INVALID/);
  for (const validate of [require("./validator-cli-prototype/validate").validatePayload, require("./validator-cli-prototype/validate").validateSchemaPayload])
    assert.equal(validate(value, "native-training-transfer-review-request").valid, false);
});
test("only a pinned original owner signature authenticates a transfer authorization", () => {
  const value = f.samples()["native-training-transfer-authorization"]; c.verifySigned(value, "native-training-transfer-authorization", f.publicKey);
  assert.throws(() => c.verifySigned({ ...value, principal_epoch: 2 }, "native-training-transfer-authorization", f.publicKey), /SIGNATURE_INVALID/);
});
test("canonical path aliases preserve one pinned root while symlink retargeting fails closed", () => {
  const native = require("./operator-native-training"), root = fs.realpathSync(fs.mkdtempSync(path.join(require("node:os").tmpdir(), "native-root-scope-")));
  try { const a = path.join(root, "a"), b = path.join(root, "b"), alias = path.join(root, "alias"); fs.mkdirSync(a); fs.mkdirSync(b); fs.symlinkSync(a, alias);
    const configuration = { artifactRoot: alias, trainingArtifactRoot: native.canonicalScopePath(alias) }; assert.equal(configuration.trainingArtifactRoot, a); native.assertRoot(configuration);
    fs.unlinkSync(alias); fs.symlinkSync(b, alias); assert.throws(() => native.assertRoot(configuration), /CONSOLE_TRAINING_ARTIFACT_ROOT_CHANGED/);
    assert.equal(native.canonicalScopePath(path.join(a, "future")), path.join(a, "future"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, qualification_supported: false }));
