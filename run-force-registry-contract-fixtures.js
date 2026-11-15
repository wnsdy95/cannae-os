#!/usr/bin/env node
const assert = require("node:assert/strict"), { validatePayload } = require("./validator-cli-prototype/validate"), c = require("./force-registry-contract");
const { samples, capability, performer, publicKey, clone } = require("./force-registry-fixtures/contracts");
const values = samples(), cases = [];
function test(name, run) { cases.push({ name, run }); }
test("all force contracts are strict, nested and permanently non-authorizing", () => {
  for (const [type, value] of Object.entries(values)) {
    assert.equal(validatePayload(value, type).valid, true, type); assert.equal(validatePayload(value, type).can_execute, false, type);
    for (const field of ["release_authorized", "execution_authorized", "qualification_granted", "standing_activation_authorized"]) {
      assert.equal(validatePayload({ ...value, [field]: true }, type).valid, false, `${type}:${field}`);
    }
    assert.equal(validatePayload({ ...value, actor: "USER" }, type).valid, false);
  }
});
test("complete review is signed against a separately pinned synthetic key", () => {
  c.verifyAuthorization(values["force-registry-authorization"], publicKey);
  const value = clone(values["force-registry-authorization"]); value.review.proposal.request.entity.label = "Changed";
  assert.throws(() => c.verifyAuthorization(value, publicKey), /SIGNATURE_INVALID/);
});
test("partial none references, malformed null branches and incomplete nested entities fail", () => {
  const request = clone(values["force-registry-request"]); request.expected_head_ref.relative_path = "not-none";
  assert.equal(validatePayload(request, "force-registry-request").valid, false);
  const value = clone(values["force-registry-authorization"]); value.review.previous_entity = {};
  assert.equal(validatePayload(value, "force-registry-authorization").valid, false);
  value.review.previous_entity = null; value.review.proposal.request.entity.data = null;
  assert.equal(validatePayload(value, "force-registry-authorization").valid, false);
});
test("stable kind, version, model configuration and alias constraints are checked", () => {
  const definition = capability({ artifact_id: "STD-FIXTURE", relative_path: "standard.json", sha256: "a".repeat(64) });
  assert.equal(validatePayload(definition, "force-registry-entity").valid, true);
  definition.data.aliases.push(definition.data.aliases[0]); assert.equal(validatePayload(definition, "force-registry-entity").valid, false);
  for (const mutate of [value => { value.data.model_revision = "latest"; }, value => { value.data.tool_policy_sha256 = "floating"; },
    value => { value.kind = "capability"; }, value => { value.version = 0; }, value => { value.qualification_state = "T"; }]) {
    const value = performer(); mutate(value); assert.equal(validatePayload(value, "force-registry-entity").valid, false);
  }
});
test("rekeying cannot hide contradictory enrollment operation, revision, sequence or consent window", () => {
  const value = clone(values["force-registry-authorization"]); value.review.previous_entity = clone(values["force-registry-entity"]);
  value.review_sha256 = c.digest(value.review); assert.equal(validatePayload(value, "force-registry-authorization").valid, false);
  for (const mutate of [value => { value.review.next_sequence = 2; }, value => { value.expires_at = value.created_at; },
    value => { value.review.proposal.request.operation = "retire"; }, value => { value.review.materials = [{ reference: { artifact_id: "EVD-FIXTURE", relative_path: "x", sha256: "a".repeat(64) }, text: "Unbound" }]; }]) {
    const changed = clone(values["force-registry-authorization"]); mutate(changed); changed.review_sha256 = c.digest(changed.review);
    assert.equal(validatePayload(changed, "force-registry-authorization").valid, false);
  }
});
test("all definition and enrollment metadata remains non-work inside wrappers", () => {
  for (const value of Object.values(values)) assert.equal(require("./semantic-control-types").isNonWorkPayload({ result: [value] }), true);
});
let passed = 0;
for (const item of cases) { try { item.run(); passed++; console.log(`PASS ${item.name}`); }
  catch (error) { console.error(`FAIL ${item.name}\n${error.stack}`); process.exitCode = 1; } }
console.log(JSON.stringify({ total: cases.length, passed, failed: cases.length - passed, scope: "Structural and synthetic-key checks, not actual owner enrollment or qualification." }, null, 2));
