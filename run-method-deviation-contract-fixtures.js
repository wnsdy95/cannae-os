#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { assertMethodPolicy } = require("./method-deviation-contract");
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", name)));
let passed = 0;
for (const [suffix, type, code] of [
  ["mission-wave-plan-methods", "mission-wave-plan", "METHOD_AGENT_COVERAGE"],
  ["agent-context-pack-methods", "agent-context-pack", "METHOD_CONTEXT_BINDING_INVALID"],
  ["method-control-baseline", "method-control-baseline", "METHOD_DUPLICATE_STEP"],
  ["method-deviation-event", "method-deviation-event", "METHOD_DEVIATION_VALIDITY_INVALID"],
  ["initiative-deviation-report", "initiative-deviation-report", "METHOD_REPORT_PHASE_BINDING_INVALID"],
  ["degeneration-incident-event", "degeneration-incident-event", "CONST_MISMATCH"]
]) {
  const valid = validatePayload(read(`valid-${suffix}.json`), type);
  assert.equal(valid.valid, true, suffix); assert.equal(valid.can_execute, false, suffix);
  const invalid = validatePayload(read(`invalid-${suffix}.json`), type);
  assert.equal(invalid.valid, false, suffix); assert.equal(invalid.can_execute, false, suffix);
  assert(invalid.issues.some(issue => issue.code === code), suffix);
  passed += 2; console.log(`PASS non-authorizing ${suffix} positive/negative contracts`);
}
const plan = read("valid-mission-wave-plan-methods.json");
const policy = JSON.parse(fs.readFileSync(path.join(__dirname, "disciplined-initiative-fixtures/policy-draft.json")));
assertMethodPolicy(plan, policy); passed++;
const changed = JSON.parse(JSON.stringify(policy)); changed.tool_rules[0].input_match.allowed_sha256 = ["0".repeat(64)];
assert.throws(() => assertMethodPolicy(plan, changed), /METHOD_POLICY_BINDING_MISMATCH/); passed++;
console.log(JSON.stringify({ total: passed, passed, failed: 0, scope: "pure contract checks; full operational integration has its separate fixture runner" }, null, 2));
