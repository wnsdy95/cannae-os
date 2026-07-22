#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const { evaluateVerifierTrustReadiness } = require("./verifier-trust-readiness");
const { publicKeyId } = require("./verification-attestation");

const REPOSITORY = {
  key: "controls-fixture-aaaaaaaaaaaa",
  identity_fingerprint: "a".repeat(64)
};
const EVALUATED_AT = "2026-07-22T09:00:00Z";
const completed = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeVerifier(id, group, purposes = ["verification_receipt", "comparative_evaluation_report"]) {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return {
    id,
    key_id: publicKeyId(publicKey),
    public_key_pem: publicKeyPem,
    independence_group: group,
    status: "active",
    allowed_repository_keys: [REPOSITORY.key],
    allowed_execution_origins: ["remote"],
    allowed_attestation_types: purposes,
    valid_from: "2026-07-22T08:00:00Z",
    valid_until: "2026-07-23T08:00:00Z"
  };
}

function makePolicy() {
  return {
    schema_version: "0.1",
    type: "VerifierTrustPolicy",
    id: "VTP-Readiness-Fixture",
    repository_binding: {
      repository_key: REPOSITORY.key,
      identity_fingerprint: REPOSITORY.identity_fingerprint
    },
    policy_version: 1,
    quorum: {
      minimum_valid_attestations: 2,
      minimum_independence_groups: 2,
      require_distinct_key_ids: true,
      max_attestation_age_seconds: 900
    },
    verifiers: [
      makeVerifier("VERIFIER-Readiness-A", "provider-a"),
      makeVerifier("VERIFIER-Readiness-B", "provider-b")
    ],
    created_at: "2026-07-22T08:00:00Z",
    expires_at: "2026-07-23T08:00:00Z"
  };
}

function makeCampaign(schemaVersion = "0.4") {
  const campaign = { schema_version: schemaVersion };
  if (["0.3", "0.4"].includes(schemaVersion)) {
    campaign.attestation_policy = {
      required: true,
      trust_policy_ref: {
        artifact_id: "VTP-Readiness-Fixture",
        relative_path: `repositories/${REPOSITORY.key}/missions/MIS-Readiness/C0/verifier-trust-policies/VTP-Readiness-Fixture.json`,
        sha256: "b".repeat(64)
      },
      minimum_valid_attestations: 2,
      minimum_independence_groups: 2,
      require_distinct_key_ids: true,
      max_attestation_age_seconds: 900
    };
  }
  return campaign;
}

function evaluate(policy, campaign = makeCampaign(), repository = REPOSITORY, runtimePolicy = null) {
  return evaluateVerifierTrustReadiness({
    campaign,
    repository,
    trustPolicy: policy,
    runtimePolicy,
    evaluatedAt: EVALUATED_AT
  });
}

function run(name, test) {
  test();
  completed.push(name);
}

try {
  run("two purpose-authorized keys and groups satisfy both quorums", () => {
    const result = evaluate(makePolicy());
    assert.strictEqual(result.satisfied, true);
    assert.strictEqual(result.receipt_quorum.distinct_key_count, 2);
    assert.strictEqual(result.comparative_quorum.independence_group_count, 2);
    assert.strictEqual(result.valid_until, "2026-07-23T08:00:00.000Z");
  });

  run("receipt authorization does not imply comparative authorization", () => {
    const policy = makePolicy();
    policy.verifiers[1].allowed_attestation_types = ["verification_receipt"];
    const result = evaluate(policy);
    assert.strictEqual(result.receipt_quorum.satisfied, true);
    assert.strictEqual(result.comparative_quorum.satisfied, false);
    assert(result.blocking_codes.includes("TRUST_ADMISSION_COMPARATIVE_QUORUM_UNAVAILABLE"));
  });

  run("suspended verifier cannot satisfy admission", () => {
    const policy = makePolicy();
    policy.verifiers[1].status = "suspended";
    const result = evaluate(policy);
    assert.strictEqual(result.satisfied, false);
    assert(result.blocking_codes.includes("TRUST_ADMISSION_RECEIPT_QUORUM_UNAVAILABLE"));
  });

  run("future verifier cannot satisfy admission", () => {
    const policy = makePolicy();
    policy.verifiers[1].valid_from = "2026-07-22T10:00:00Z";
    const result = evaluate(policy);
    assert.strictEqual(result.satisfied, false);
    assert.strictEqual(result.receipt_quorum.eligible_verifier_count, 1);
  });

  run("repository allowlist is enforced", () => {
    const policy = makePolicy();
    policy.verifiers[1].allowed_repository_keys = ["different-repository"];
    const result = evaluate(policy);
    assert.strictEqual(result.satisfied, false);
    assert.strictEqual(result.receipt_quorum.eligible_verifier_count, 1);
  });

  run("one public key cannot fill two distinct-key positions", () => {
    const policy = makePolicy();
    policy.verifiers[1].public_key_pem = policy.verifiers[0].public_key_pem;
    policy.verifiers[1].key_id = policy.verifiers[0].key_id;
    const result = evaluate(policy);
    assert.strictEqual(result.satisfied, false);
    assert.strictEqual(result.receipt_quorum.eligible_verifier_count, 2);
    assert.strictEqual(result.receipt_quorum.distinct_key_count, 1);
  });

  run("one independence group cannot fill a two-group quorum", () => {
    const policy = makePolicy();
    policy.verifiers[1].independence_group = policy.verifiers[0].independence_group;
    const result = evaluate(policy);
    assert.strictEqual(result.satisfied, false);
    assert.strictEqual(result.receipt_quorum.independence_group_count, 1);
  });

  run("inactive policy blocks every signed purpose", () => {
    const policy = makePolicy();
    policy.expires_at = "2026-07-22T08:30:00Z";
    const result = evaluate(policy);
    assert.strictEqual(result.satisfied, false);
    assert(result.blocking_codes.includes("TRUST_ADMISSION_POLICY_NOT_ACTIVE"));
    assert.strictEqual(result.valid_until, "none");
  });

  run("v0.3 legacy omitted purpose allows receipts only", () => {
    const policy = makePolicy();
    delete policy.verifiers[0].allowed_attestation_types;
    delete policy.verifiers[1].allowed_attestation_types;
    const result = evaluate(policy, makeCampaign("0.3"));
    assert.strictEqual(result.satisfied, true);
    assert.strictEqual(result.receipt_quorum.satisfied, true);
    assert.strictEqual(result.comparative_quorum.required, false);
  });

  run("v0.2 campaign receives a deterministic no-op admission", () => {
    const result = evaluate(null, makeCampaign("0.2"));
    assert.strictEqual(result.required, false);
    assert.strictEqual(result.satisfied, true);
    assert.strictEqual(result.valid_until, "none");
    assert.deepStrictEqual(result.blocking_codes, []);
  });

  run("policy repository identity must match the artifact store", () => {
    const policy = makePolicy();
    policy.repository_binding.identity_fingerprint = "c".repeat(64);
    const result = evaluate(policy);
    assert.strictEqual(result.satisfied, false);
    assert(result.blocking_codes.includes("TRUST_ADMISSION_REPOSITORY_MISMATCH"));
  });

  run("policy v0.2 cannot fall back to static-key admission when identity assurance is missing", () => {
    const policy = makePolicy();
    policy.schema_version = "0.2";
    const result = evaluate(policy);
    assert.strictEqual(result.satisfied, false);
    assert.strictEqual(result.identity_assurance.required, true);
    assert(result.blocking_codes.includes("TRUST_ADMISSION_POLICY_SCHEMA_INVALID"));
    assert(result.blocking_codes.includes("TRUST_ADMISSION_WORKLOAD_IDENTITY_UNAVAILABLE"));
  });

  run("policy v0.4 cannot dispatch without its exact runtime policy", () => {
    const policy = makePolicy();
    policy.schema_version = "0.4";
    policy.execution_assurance = {
      required: true,
      runtime_policy_ref: {
        artifact_id: "VRP-Readiness-Fixture",
        relative_path: "repositories/controls/missions/MIS-Readiness/C0/verifier-runtime-policies/VRP-Readiness-Fixture.json",
        sha256: "c".repeat(64)
      }
    };
    const result = evaluate(policy);
    assert(result.blocking_codes.includes("TRUST_ADMISSION_RUNTIME_POLICY_REFERENCE_INVALID"));
  });

  run("policy v0.4 requires one complete runtime assignment per verifier", () => {
    const policy = makePolicy();
    policy.schema_version = "0.4";
    policy.execution_assurance = {
      required: true,
      runtime_policy_ref: {
        artifact_id: "VRP-Readiness-Fixture",
        relative_path: "repositories/controls/missions/MIS-Readiness/C0/verifier-runtime-policies/VRP-Readiness-Fixture.json",
        sha256: "c".repeat(64)
      }
    };
    const runtimePolicy = {
      id: "VRP-Readiness-Fixture",
      trust_policy_id: policy.id,
      repository_binding: policy.repository_binding,
      profiles: [{ id: "PROFILE-A" }],
      assignments: [{
        verifier_id: policy.verifiers[0].id,
        profile_id: "PROFILE-A",
        allowed_purposes: ["verification_receipt", "comparative_evaluation_report"]
      }],
      created_at: "2026-07-22T08:00:00Z",
      expires_at: "2026-07-23T08:00:00Z"
    };
    const result = evaluate(policy, makeCampaign(), REPOSITORY, runtimePolicy);
    assert(result.blocking_codes.includes("TRUST_ADMISSION_RUNTIME_POLICY_ASSIGNMENT_INVALID"));
  });

  process.stdout.write(`${JSON.stringify({ valid: true, fixture_count: completed.length, fixtures: completed }, null, 2)}\n`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
