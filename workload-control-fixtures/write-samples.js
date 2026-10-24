const fs = require("fs"), path = require("path"), assert = require("assert/strict");
const { samples, clone } = require("./samples"), { validatePayload } = require("../validator-cli-prototype/validate");
for (const [type, valid] of Object.entries(samples())) {
  const invalid = clone(valid); invalid.release_authorized = true;
  assert.equal(validatePayload(valid, type).valid, true, type);
  assert.equal(validatePayload(valid, type).can_execute, false, type);
  assert.equal(validatePayload(invalid, type).valid, false, type);
  for (const [prefix, value] of [["valid", valid], ["invalid", invalid]]) fs.writeFileSync(path.join(__dirname, "../sample-payloads", `${prefix}-${type}.json`), JSON.stringify(value, null, 2) + "\n");
}
console.log("Generated six synthetic metadata examples; none is retained execution proof.");
