#!/usr/bin/env node
const assert = require("node:assert/strict");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { samples, rekey, clone, none } = require("./dispatch-issuance-fixtures/contracts");
const values = samples(); let passed = 0;
const check = (name, callback) => { callback(); passed++; console.log(`PASS ${name}`); };
function invalid(type, value, code) {
  const result = validatePayload(value, type);
  assert.equal(result.valid, false); assert.equal(result.can_execute, false);
  assert(result.issues.some(item => item.code === code), JSON.stringify(result));
}
for (const type of ["dispatch-lease-issuance-request", "dispatch-lease-issuance-resolution"]) {
  check(`${type} is strictly non-authorizing`, () => {
    const result = validatePayload(values[type], type); assert.equal(result.valid, true, JSON.stringify(result)); assert.equal(result.can_execute, false);
    invalid(type, { ...values[type], execution_authorized: true }, "CONST_MISMATCH");
    invalid(type, { ...values[type], actor: "USER" }, "ADDITIONAL_PROPERTY");
  });
}
check("new leases require the exact issuance reference and legacy leases cannot smuggle one", () => {
  const lease = clone(values["agent-dispatch-lease-issuance"]);
  assert.equal(validatePayload(lease, "agent-dispatch-lease").valid, true);
  assert.equal(validatePayload(lease, "agent-dispatch-lease").can_execute, false);
  assert.equal(validatePayload(values["dispatch-lease-issuance-request"].planned_lease, "agent-dispatch-lease").can_execute, false);
  const missing = clone(lease); delete missing.issuance_ref; invalid("agent-dispatch-lease", missing, "MISSING_REQUIRED");
  lease.schema_version = "0.1"; invalid("agent-dispatch-lease", lease, "NOT_SCHEMA_MATCH");
});
check("records bind the exact frozen nonce and complete body", () => {
  const changed = clone(values["dispatch-lease-issuance-request"]); changed.planned_lease.nonce = "0".repeat(64);
  invalid("dispatch-lease-issuance-request", changed, "DISPATCH_ISSUANCE_ID_MISMATCH");
});
check("request scope and lease scope cannot diverge even after rekeying", () => {
  const changed = clone(values["dispatch-lease-issuance-request"]); changed.agent_id = "another-agent";
  invalid("dispatch-lease-issuance-request", rekey(changed), "DISPATCH_ISSUANCE_DRAFT_BINDING_INVALID");
});
check("recovery cannot independently extend the original expiry", () => {
  const changed = clone(values["dispatch-lease-issuance-request"]); changed.expires_at = new Date(Date.parse(changed.expires_at) + 1000).toISOString();
  invalid("dispatch-lease-issuance-request", rekey(changed), "DISPATCH_ISSUANCE_DRAFT_BINDING_INVALID");
});
check("initial issuance cannot claim an interrupted predecessor", () => {
  const changed = clone(values["dispatch-lease-issuance-request"]); changed.interruption_checkpoint_ref = values["dispatch-lease-issuance-resolution"].baseline_ref;
  invalid("dispatch-lease-issuance-request", rekey(changed), "DISPATCH_ISSUANCE_PREDECESSOR_INVALID");
});
check("resolution cannot claim commitment without an actual lease and baseline", () => {
  const changed = clone(values["dispatch-lease-issuance-resolution"]); changed.lease_ref = none();
  invalid("dispatch-lease-issuance-resolution", rekey(changed), "DISPATCH_ISSUANCE_RESOLUTION_INVALID");
});
check("cancellation cannot invent a baseline without a lease", () => {
  const changed = clone(values["dispatch-lease-issuance-resolution"]); changed.outcome = "cancelled"; changed.lease_ref = none();
  invalid("dispatch-lease-issuance-resolution", rekey(changed), "DISPATCH_ISSUANCE_RESOLUTION_INVALID");
});
check("a blank cancellation reason cannot become a terminal audit record", () => {
  const changed = clone(values["dispatch-lease-issuance-resolution"]); changed.reason = " ";
  invalid("dispatch-lease-issuance-resolution", rekey(changed), "DISPATCH_ISSUANCE_RESOLUTION_INVALID");
});
console.log(JSON.stringify({ total: passed, passed, failed: 0, scope: "Pure issuance contracts only; no runtime, native agent or production authority claim." }, null, 2));
