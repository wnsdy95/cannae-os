#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { verifyAuthorization, verifyRecord, contractIssues } = require("./operator-model-reconciliation-contract");
const { signOperatorRecord, digest } = require("./operator-consent-contract");
const { validatePayload } = require("./validator-cli-prototype/validate");
const key = require("./operator-semantic-fixtures/model-reconciliation-public-key.json").public_key_pem;
const authorization = require("./sample-payloads/valid-operator-model-reconciliation-authorization.json");
const record = require("./sample-payloads/valid-operator-model-reconciliation-record.json");
const clone = value => JSON.parse(JSON.stringify(value)); let passed = 0;
const check = (name, callback) => { callback(); passed++; console.log(`PASS ${name}`); };
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-model-reconciliation-contract-"));
try {
  check("both exact signatures and nested digest bindings verify without execution authority", () => {
    verifyAuthorization(authorization, key); verifyRecord(record, key);
    for (const [suffix, value] of [["authorization", authorization], ["record", record]]) {
      const result = validatePayload(value, `operator-model-reconciliation-${suffix}`); assert.equal(result.valid, true); assert.equal(result.can_execute, false);
    }
  });
  check("nested changes cannot hide behind an unchanged outer signature", () => {
    const changed = clone(record); changed.authorization.subject.manifest_sha256 = "0".repeat(64);
    assert.throws(() => verifyRecord(changed, key), /CONSOLE_MODEL_RECONCILIATION_RECORD_INVALID/);
  });
  check("a fresh unrelated signer cannot establish the pinned owner", () => {
    const pair = crypto.generateKeyPairSync("ed25519"), changed = signOperatorRecord(record, pair.privateKey.export({ type: "pkcs8", format: "pem" }));
    assert.throws(() => verifyRecord(changed, key), /CONSOLE_MODEL_RECONCILIATION_RECORD_INVALID/);
  });
  check("schema-valid terminal time and subject substitutions fail specific semantic bindings", () => {
    const changed = clone(record); changed.recorded_at = changed.authorization.expires_at;
    assert(contractIssues(changed, "operator-model-reconciliation-record").some(item => item.code === "MODEL_RECONCILIATION_RECORD_BINDING_INVALID"));
    const a = clone(authorization); a.subject.action_id = a.reconciliation_id;
    assert(contractIssues(a, "operator-model-reconciliation-authorization").some(item => item.code === "MODEL_RECONCILIATION_AUTHORIZATION_BINDING_INVALID"));
  });
  check("actual offline CLI verifies only signatures, never history or hold discharge", () => {
    const child = spawnSync(process.execPath, [path.join(__dirname, "operator-model-reconciliation-runner.js"),
      path.join(__dirname, "sample-payloads/valid-operator-model-reconciliation-record.json"), "--public-key",
      path.join(__dirname, "operator-semantic-fixtures/model-reconciliation-public-key.json")], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr); const value = JSON.parse(child.stdout);
    assert.equal(value.signature_valid, true); assert.equal(value.private_history_verified, false);
    assert.equal(value.process_absence_observed_by_runner, false); assert.equal(value.hold_discharged, false); assert.equal(value.can_execute, false);
  });
  check("actual offline CLI rejects tampered, unknown and oversized input", () => {
    for (const kind of ["tampered", "unknown", "oversized"]) {
      const file = path.join(directory, kind + ".json"), value = clone(record);
      if (kind === "tampered") value.authorization_sha256 = digest({ changed: true });
      if (kind === "unknown") value.type = "DecisionLogEntry";
      fs.writeFileSync(file, kind === "oversized" ? "x".repeat(1048577) : JSON.stringify(value));
      const result = spawnSync(process.execPath, [path.join(__dirname, "operator-model-reconciliation-runner.js"), file, "--public-key",
        path.join(__dirname, "operator-semantic-fixtures/model-reconciliation-public-key.json")], { encoding: "utf8" });
      assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert(!result.stderr.includes("PRIVATE KEY"));
    }
  });
  console.log(JSON.stringify({ total: passed, passed, failed: 0, actual_model_invocations: 0 }));
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
