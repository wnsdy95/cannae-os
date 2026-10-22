#!/usr/bin/env node
const assert = require("node:assert/strict");
const { validatePayload } = require("./validator-cli-prototype/validate");
const contract = require("./method-control-contract"), { samples, clone, rekey, policy } = require("./method-control-fixtures/contracts");
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
const values = samples();
check("the trusted fingerprint command reports exact reviewed source bytes without authority", () => {
  const result = require("./method-control-runner").main(["fingerprint"]);
  assert.equal(result.runtime_sha256, contract.runtimeDigest()); assert.deepEqual(result.measured_files, contract.CODE);
  assert.equal(result.execution_authorized, false); assert.equal(result.release_authorized, false);
});
for (const [type, value] of Object.entries(values)) check(`${type} is a bounded non-authorizing contract`, () => {
  const result = validatePayload(value, type); assert.equal(result.valid, true, JSON.stringify(result.issues)); assert.equal(result.can_execute, false);
});
check("a broker requires a newly reviewed method baseline version", () => {
  const value = clone(require("./sample-payloads/valid-method-control-baseline.json")); value.broker = policy();
  assert(validatePayload(value, "method-control-baseline").issues.some(item => item.code === "METHOD_CONTROL_REVIEW_REQUIRED"));
  value.schema_version = "0.2"; assert.equal(validatePayload(value, "method-control-baseline").valid, true);
  delete value.broker; assert(validatePayload(value, "method-control-baseline").issues.some(item => item.code === "METHOD_CONTROL_REVIEW_REQUIRED"));
});
check("native provider startup is not fabricated from local enrollment", () => {
  const value = rekey({ ...values["method-control-enrollment"], provider_startup_verified: true });
  assert.equal(validatePayload(value, "method-control-enrollment").valid, false);
});
check("request argument meaning must match its declared operation", () => {
  const value = rekey({ ...values["method-control-request"], operation: "method_status" });
  assert(validatePayload(value, "method-control-request").issues.some(item => item.code === "METHOD_CONTROL_ARGUMENTS_INVALID"));
});
check("tool arguments cannot choose repository, lease, USER role, results or an approval", () => {
  for (const field of ["repository", "leaseId", "role", "result_sha256", "decisionRef", "phase", "release_authorized"]) {
    assert.throws(() => contract.assertArguments("method_report_after", { request_id: "fixture", deviation_ref: values["method-control-receipt"].result.deviation_ref, [field]: "forged" }), /METHOD_CONTROL_ARGUMENTS_INVALID/);
  }
});
check("enrollment and request validity are positive and independently bounded", () => {
  for (const type of ["method-control-enrollment", "method-control-request"]) {
    const value = rekey({ ...values[type], expires_at: "2026-10-23T00:00:00Z" });
    assert(validatePayload(value, type).issues.some(item => item.code === "METHOD_CONTROL_TIME_INVALID"));
  }
});
check("records commit to both their whole body and exact input", () => {
  const value = clone(values["method-control-request"]); value.arguments.rationale = "Substituted.";
  const codes = validatePayload(value, "method-control-request").issues.map(item => item.code);
  assert(codes.includes("METHOD_CONTROL_ID_MISMATCH") && codes.includes("METHOD_CONTROL_INPUT_MISMATCH"));
});
check("control channel budgets and assurance cannot be self-expanded", () => {
  for (const [field, value] of [["max_requests", 129], ["max_validity_seconds", 3601], ["request_validity_seconds", 61], ["output_max_bytes", 262145],
    ["identity_assurance", "authenticated_production"], ["execution_authorized", true]]) {
    assert.equal(validatePayload({ ...policy(), [field]: value }, "method-control-channel-policy").valid, false);
  }
});
check("an agent can receive only its own deterministic channel name", () => {
  const plan = { id: "PLAN", mission_id: "MIS", wave_id: "W1", method_control: { broker: policy() } };
  assert.notEqual(contract.pocket(plan, "a").server_name, contract.pocket(plan, "b").server_name);
  assert.deepEqual(contract.pocket(plan, "a").operations, contract.OPERATIONS);
});
check("an empty rationale, unknown operation and oversized input are denied", () => {
  assert.throws(() => contract.assertArguments("method_propose", { request_id: "a", step_id: "b", method_id: "c", rationale: " " }), /METHOD_CONTROL_ARGUMENTS_INVALID/);
  assert.throws(() => contract.assertArguments("release", { request_id: "a" }), /METHOD_CONTROL_ARGUMENTS_INVALID/);
  assert.throws(() => contract.assertArguments("method_propose", { request_id: "a", step_id: "b", method_id: "c", rationale: "x".repeat(2049) }), /METHOD_CONTROL_ARGUMENTS_INVALID/);
});
console.log(JSON.stringify({ total: passed, passed, failed: 0, scope: "Pure contract checks only; these do not establish live broker, native provider identity or task execution." }, null, 2));
