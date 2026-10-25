const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { samples, clone, publicKey } = require("./contracts"), { validatePayload } = require("../validator-cli-prototype/validate");
for (const [type, valid] of Object.entries(samples())) {
  const invalid = clone(valid); invalid.release_authorized = true;
  assert.equal(validatePayload(valid, type).valid, true, type); assert.equal(validatePayload(valid, type).can_execute, false, type);
  assert.equal(validatePayload(invalid, type).valid, false, type);
  for (const [prefix, value] of [["valid", valid], ["invalid", invalid]]) fs.writeFileSync(path.join(__dirname, "../sample-payloads", `${prefix}-${type}.json`), JSON.stringify(value, null, 2) + "\n");
}
fs.writeFileSync(path.join(__dirname, "public-key.json"), JSON.stringify({ public_key_pem: publicKey, purpose: "Public deterministic synthetic fixture only; never install as an operator identity." }, null, 2) + "\n");
console.log("Generated ten deterministic synthetic structural examples, not retained owner consent or enrollment history.");
