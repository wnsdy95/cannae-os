#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const { samples, clone, rekey, none } = require("./contracts");
const directory = path.join(__dirname, "../sample-payloads");
for (const [name, value] of Object.entries(samples())) {
  const invalid = clone(value);
  if (name === "dispatch-lease-issuance-request") invalid.planned_lease.nonce = "0".repeat(64);
  else if (name === "dispatch-lease-issuance-resolution") {
    invalid.baseline_ref = none(); Object.assign(invalid, rekey(invalid));
  } else delete invalid.issuance_ref;
  for (const [prefix, payload] of [["valid", value], ["invalid", invalid]]) {
    fs.writeFileSync(path.join(directory, `${prefix}-${name}.json`), JSON.stringify(payload, null, 2) + "\n");
  }
}
console.log("Wrote six synthetic issuance contract samples; these are not retained execution authority.");
