#!/usr/bin/env node
const fs = require("node:fs");
const omission = require("./operator-model-reconciliation-contract"), analysis = require("./operator-analysis-reconciliation-contract");
const native = require("./operator-native-training-reconciliation-contract");
function main(argv = process.argv.slice(2)) {
  if (argv.length !== 3 || argv[1] !== "--public-key") throw new Error("CONSOLE_MODEL_RECONCILIATION_AUDIT_INPUT_INVALID");
  function read(file, limit) {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size < 1 || stat.size > limit) throw new Error("CONSOLE_MODEL_RECONCILIATION_AUDIT_INPUT_TOO_LARGE");
      const buffer = Buffer.alloc(stat.size + 1), length = fs.readSync(fd, buffer, 0, buffer.length, 0), bytes = buffer.subarray(0, length);
      if (length !== stat.size || !Buffer.from(bytes.toString("utf8")).equals(bytes)) throw new Error("CONSOLE_MODEL_RECONCILIATION_AUDIT_INPUT_CHANGED");
      return JSON.parse(bytes.toString("utf8"));
    } finally { fs.closeSync(fd); }
  }
  const value = read(argv[0], 1048576), key = read(argv[2], 65536);
  if (!key || Object.keys(key).length !== 1 || typeof key.public_key_pem !== "string") throw new Error("CONSOLE_MODEL_RECONCILIATION_AUDIT_KEY_INVALID");
  if (value.type === "OperatorNativeTrainingReconciliationAuthorization") native.verifyAuthorization(value, key.public_key_pem);
  else if (value.type === "OperatorNativeTrainingReconciliationRecord") native.verifyRecord(value, key.public_key_pem);
  else if (value.type === "OperatorAnalysisReconciliationAuthorization") analysis.verifyAuthorization(value, key.public_key_pem);
  else if (value.type === "OperatorAnalysisReconciliationRecord") analysis.verifyRecord(value, key.public_key_pem);
  else if (value.type === "OperatorModelReconciliationAuthorization") omission.verifyAuthorization(value, key.public_key_pem);
  else omission.verifyRecord(value, key.public_key_pem);
  const result = { valid: true, signature_valid: true, private_history_verified: false, process_absence_observed_by_runner: false,
    issuer_trust_established_by_record: false, hold_discharged: false, new_model_invocation_started: false,
    can_execute: false, execution_authorized: false, release_authorized: false };
  console.log(JSON.stringify(result, null, 2)); return result;
}
module.exports = { main };
if (require.main === module) { try { main(); } catch (error) { console.error(/^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "CONSOLE_MODEL_RECONCILIATION_AUDIT_FAILED"); process.exitCode = 1; } }
