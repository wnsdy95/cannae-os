#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validatePayload } = require("./validator-cli-prototype/validate");

const SAMPLE = JSON.parse(fs.readFileSync(
  path.join(__dirname, "sample-payloads", "valid-self-improvement-cycle-order.json"),
  "utf8"
));
const completed = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function codes(result) {
  return result.issues.map(item => item.code);
}

function run(name, test) {
  test();
  completed.push(name);
}

try {
  run("valid v0.2 unsigned order carries an explicit no-op admission", () => {
    const result = validatePayload(SAMPLE, "self-improvement-cycle-order");
    assert.strictEqual(result.valid, true, JSON.stringify(result, null, 2));
  });

  run("self-declared quorum satisfaction is recomputed and rejected", () => {
    const order = clone(SAMPLE);
    const trustRef = {
      artifact_id: "VTP-Forged-Admission",
      relative_path: "repositories/controls-fixture/missions/MIS-Cannae-001/C0/verifier-trust-policies/VTP-Forged-Admission.json",
      sha256: "e".repeat(64)
    };
    order.proof_requirements.signed_attestation_required = true;
    order.proof_requirements.minimum_valid_attestations = 2;
    order.proof_requirements.minimum_independence_groups = 2;
    order.proof_requirements.require_distinct_key_ids = true;
    order.proof_requirements.trust_policy_ref = trustRef;
    order.trust_policy_admission.required = true;
    order.trust_policy_admission.satisfied = true;
    order.trust_policy_admission.valid_until = "2026-07-21T20:00:00+09:00";
    order.trust_policy_admission.trust_policy_ref = clone(trustRef);
    order.trust_policy_admission.effective_requirements = {
      minimum_valid_attestations: 2,
      minimum_independence_groups: 2,
      require_distinct_key_ids: true
    };
    order.trust_policy_admission.receipt_quorum = {
      required: true,
      satisfied: true,
      eligible_verifier_count: 1,
      distinct_key_count: 1,
      independence_group_count: 1,
      verifier_ids: ["VERIFIER-Forged-A"],
      key_ids: ["f".repeat(64)],
      independence_groups: ["provider-a"]
    };
    const result = validatePayload(order, "self-improvement-cycle-order");
    assert.strictEqual(result.valid, false);
    assert(codes(result).includes("CYCLE_ORDER_ADMISSION_FALSE_SATISFACTION"));
  });

  run("admission evaluation time cannot drift from order issuance", () => {
    const order = clone(SAMPLE);
    order.trust_policy_admission.evaluated_at = "2026-07-21T18:25:00+09:00";
    const result = validatePayload(order, "self-improvement-cycle-order");
    assert.strictEqual(result.valid, false);
    assert(codes(result).includes("CYCLE_ORDER_ADMISSION_TIME_MISMATCH"));
  });

  run("v0.1 order cannot smuggle a v0.2 admission claim", () => {
    const order = clone(SAMPLE);
    order.schema_version = "0.1";
    const result = validatePayload(order, "self-improvement-cycle-order");
    assert.strictEqual(result.valid, false);
    assert(codes(result).includes("CYCLE_ORDER_V01_ADMISSION_UNSUPPORTED"));
  });

  process.stdout.write(`${JSON.stringify({ valid: true, fixture_count: completed.length, fixtures: completed }, null, 2)}\n`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
