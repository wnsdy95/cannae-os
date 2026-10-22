#!/usr/bin/env node
const fs = require("node:fs"), crypto = require("node:crypto");
const { digest } = require("./operator-consent-contract");
const { verifyAuthorization, verifyReconciliationRecord } = require("./operator-reconciliation-contract");
function main(argv = process.argv.slice(2)) {
  if (![3, 5].includes(argv.length) || argv[1] !== "--public-key" || (argv.length === 5 && argv[3] !== "--cancellation")) {
    throw new Error("OPERATOR_RECONCILIATION_AUDIT_INPUT_INVALID");
  }
  const read = file => JSON.parse(fs.readFileSync(file, "utf8")), payload = read(argv[0]), key = read(argv[2]);
  if (!key || Object.keys(key).length !== 1 || !Object.hasOwn(key, "public_key_pem") || typeof key.public_key_pem !== "string") throw new Error("OPERATOR_RECONCILIATION_AUDIT_KEY_INVALID");
  let cancellationBound = false;
  if (payload.type === "OperatorReconciliationAuthorization") {
    if (argv.length !== 3) throw new Error("OPERATOR_RECONCILIATION_AUDIT_INPUT_INVALID");
    verifyAuthorization(payload, key.public_key_pem);
  } else {
    verifyReconciliationRecord(payload, key.public_key_pem);
    if (payload.terminal_state === "cancelled") {
      if (argv.length !== 5) throw new Error("OPERATOR_RECONCILIATION_AUDIT_CANCELLATION_REQUIRED");
      const bytes = fs.readFileSync(argv[4]), value = JSON.parse(bytes.toString("utf8"));
      const expected = (payload.prior_authorization || payload.authorization).cancellation_decision;
      if (crypto.createHash("sha256").update(bytes).digest("hex") !== payload.cancellation_ref.sha256 ||
          digest(value) !== digest(expected)) throw new Error("OPERATOR_RECONCILIATION_AUDIT_CANCELLATION_SUBSTITUTED");
      cancellationBound = true;
    } else if (argv.length !== 3) throw new Error("OPERATOR_RECONCILIATION_AUDIT_INPUT_INVALID");
  }
  const result = { valid: true, signature_valid: true, cancellation_payload_bound: cancellationBound,
    artifact_history_verified: false, issuer_trust_established_by_record: false, can_execute: false,
    execution_authorized: false, continuation_authorized: false, release_authorized: false };
  console.log(JSON.stringify(result, null, 2)); return result;
}
module.exports = { main };
if (require.main === module) {
  try { main(); } catch (error) { console.error(/^OPERATOR_[A-Z_]+$/.test(error.message) ? error.message : "OPERATOR_RECONCILIATION_AUDIT_FAILED"); process.exitCode = 1; }
}
