#!/usr/bin/env node
const fs = require("node:fs");
const { verifyConsent } = require("./operator-consent-contract");
function main(argv = process.argv.slice(2)) {
  if (argv.length !== 5 || argv[1] !== "--public-key" || argv[3] !== "--decision") {
    throw new Error("Usage: operator-consent-runner.js <record.json> --public-key <pinned-public-key.json> --decision <decision-log.json>");
  }
  const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
  const result = verifyConsent(read(argv[0]), read(argv[2]).public_key_pem, read(argv[4]));
  console.log(JSON.stringify({ ...result, can_execute: false, issuer_trust_established_by_record: false }, null, 2));
}
module.exports = { main };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
