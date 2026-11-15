#!/usr/bin/env node
const assert = require("node:assert/strict"), path = require("node:path"), crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const contract = require("./operator-analysis-reconciliation-contract"), legacy = require("./operator-model-reconciliation-contract");
const { digest, keyDigest, signOperatorRecord, validOperatorSignature } = require("./operator-consent-contract");
const { validatePayload } = require("./validator-cli-prototype/validate"), { samePublicationHistory } = require("./operator-analysis-publication");
const key = require("./order-analysis-fixtures/reconciliation-public-key.json").public_key_pem;
const authorization = require("./sample-payloads/valid-operator-analysis-reconciliation-authorization.json"), record = require("./sample-payloads/valid-operator-analysis-reconciliation-record.json");
const pair = crypto.generateKeyPairSync("ed25519"), privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }), publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const clone = value => structuredClone(value), signed = mutate => { const a = clone(authorization); a.subject.trusted_key_sha256 = keyDigest(publicKey); mutate(a); return signOperatorRecord(a, privateKey); };
let passed = 0; const check = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
check("unchanged omission v0.1 examples still verify through the shared contract core", () => {
  const oldKey = require("./operator-semantic-fixtures/model-reconciliation-public-key.json").public_key_pem;
  legacy.verifyAuthorization(require("./sample-payloads/valid-operator-model-reconciliation-authorization.json"), oldKey);
  legacy.verifyRecord(require("./sample-payloads/valid-operator-model-reconciliation-record.json"), oldKey);
});
check("analysis signatures and actual generic validation bind exact purpose with no execution authority", () => {
  contract.verifyAuthorization(authorization, key); contract.verifyRecord(record, key);
  for (const [suffix, value] of [["authorization", authorization], ["record", record]]) {
    const result = validatePayload(value, `operator-analysis-reconciliation-${suffix}`); assert.equal(result.valid, true, JSON.stringify(result.issues)); assert.equal(result.can_execute, false);
  }
});
check("all three explicit compiler-observation classes remain non-authorizing", () => {
  for (const mode of ["no_accepted_response", "not_in_verified_manifest", "published"]) {
    const value = signed(a => { const p = a.subject.publication;
      if (mode === "no_accepted_response") a.subject.publication = { kind: mode, request_ref: p.request_ref, draft_adoption_authorized: false, artifact_settlement_authorized: false };
      else if (mode === "not_in_verified_manifest") Object.assign(p, { publication_state: mode, draft_ref: null, draft_status: null });
    });
    contract.verifyAuthorization(value, publicKey); contract.verifyRecord(contract.recordFor(value, "2026-10-24T00:00:02Z", privateKey), publicKey);
  }
});
check("fresh signatures cannot bless contradictory publication state or another draft", () => {
  for (const mutate of [p => { p.draft_ref = null; }, p => { p.draft_ref.artifact_id = `OD-${"0".repeat(32)}`; },
    p => { p.publication_state = "not_in_verified_manifest"; }]) {
    const value = signed(a => mutate(a.subject.publication)); assert.equal(validOperatorSignature(value, publicKey), true);
    assert(contract.contractIssues(value, "operator-analysis-reconciliation-authorization").some(row => row.code === "ANALYSIS_RECONCILIATION_PUBLICATION_INVALID"));
    assert.throws(() => contract.verifyAuthorization(value, publicKey), /AUTHORIZATION_INVALID/);
  }
});
check("adoption, artifact settlement and tool/release expansion remain prohibited even with a new signature", () => {
  for (const mutate of [a => { a.subject.publication.draft_adoption_authorized = true; }, a => { a.subject.publication.artifact_settlement_authorized = true; },
    a => { a.execution_authorized = true; }, a => { a.release_authorized = true; }]) assert.throws(() => contract.verifyAuthorization(signed(mutate), publicKey), /AUTHORIZATION_INVALID/);
});
check("neither purpose can borrow the other purpose's signed authorization or receipt", () => {
  const oldKey = require("./operator-semantic-fixtures/model-reconciliation-public-key.json").public_key_pem;
  assert.throws(() => legacy.verifyAuthorization(authorization, key), /AUTHORIZATION_INVALID/);
  assert.throws(() => legacy.verifyRecord(record, key), /RECORD_INVALID/);
  assert.throws(() => contract.verifyAuthorization(require("./sample-payloads/valid-operator-model-reconciliation-authorization.json"), oldKey), /AUTHORIZATION_INVALID/);
  assert.throws(() => contract.verifyRecord(require("./sample-payloads/valid-operator-model-reconciliation-record.json"), oldKey), /RECORD_INVALID/);
});
check("freshly signed inverted, stale or overlong owner review remains invalid", () => {
  for (const mutate of [a => { a.expires_at = a.created_at; }, a => { a.expires_at = "2026-10-24T01:00:00Z"; }, a => { a.subject.observed_at = "2026-10-23T00:00:00Z"; }]) {
    assert.throws(() => contract.verifyAuthorization(signed(mutate), publicKey), /AUTHORIZATION_INVALID/);
  }
});
check("nested substitution cannot hide behind intact outer data or signatures", () => {
  const changed = clone(record); changed.authorization.subject.publication.response_sha256 = "0".repeat(64);
  assert.throws(() => contract.verifyRecord(changed, key), /RECORD_INVALID/);
  const a = signed(() => {}), receipt = contract.recordFor(a, "2026-10-24T00:00:02Z", privateKey);
  receipt.authorization.rationale = "Changed after signing."; receipt.authorization_sha256 = digest(receipt.authorization); receipt.subject_sha256 = digest(receipt.authorization.subject);
  assert.throws(() => contract.verifyRecord(signOperatorRecord(receipt, privateKey), publicKey), /AUTHORIZATION_INVALID/);
});
check("subsequent independently approved publication does not rewrite a prior absence observation", () => {
  const published = clone(authorization.subject.publication), absent = { ...published, publication_state: "not_in_verified_manifest", draft_ref: null, draft_status: null };
  assert.equal(samePublicationHistory(absent, published), true); assert.equal(samePublicationHistory(published, absent), false);
  assert.equal(samePublicationHistory(absent, { ...published, response_sha256: "0".repeat(64) }), false);
  assert.equal(samePublicationHistory(published, { ...published, draft_ref: { ...published.draft_ref, sha256: "0".repeat(64) } }), false);
});
check("actual offline audit verifies the new signatures but cannot clear a hold", () => {
  const child = spawnSync(process.execPath, [path.join(__dirname, "operator-model-reconciliation-runner.js"),
    path.join(__dirname, "sample-payloads/valid-operator-analysis-reconciliation-record.json"), "--public-key", path.join(__dirname, "order-analysis-fixtures/reconciliation-public-key.json")], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr); const result = JSON.parse(child.stdout);
  assert.equal(result.signature_valid, true); assert.equal(result.private_history_verified, false); assert.equal(result.hold_discharged, false); assert.equal(result.can_execute, false);
});
check("issuance and channel bindings measure shared verification, publication appraisal and both new schemas", () => {
  const fs = require("node:fs");
  for (const binding of [require("./method-control-contract"), require("./dispatch-issuance-contract")]) {
    for (const file of ["operator-reconciliation-contract-core.js", "operator-analysis-reconciliation-contract.js", "operator-analysis-publication.js",
      "schema-files/operator-analysis-reconciliation-authorization.schema.json", "schema-files/operator-analysis-reconciliation-record.schema.json"]) {
      assert(binding.CODE.includes(file)); const original = fs.readFileSync, before = binding.runtimeDigest();
      fs.readFileSync = function(filename, ...args) { const value = original.call(this, filename, ...args); return typeof filename === "string" && path.resolve(filename) === path.join(__dirname, file)
        ? Buffer.concat([Buffer.from(value), Buffer.from("\n")]) : value; };
      try { assert.notEqual(binding.runtimeDigest(), before); } finally { fs.readFileSync = original; }
    }
  }
});
console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, release_authorized: false }, null, 2));
