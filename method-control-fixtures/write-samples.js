const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { samples, clone, rekey } = require("./contracts"), { validatePayload } = require("../validator-cli-prototype/validate");
const examples = samples();
for (const [type, valid] of Object.entries(examples)) {
  let invalid = clone(valid); invalid.release_authorized = true;
  if (invalid.id) invalid = rekey(invalid);
  assert.equal(validatePayload(valid, type).valid, true, type);
  assert.equal(validatePayload(valid, type).can_execute, false, type);
  assert.equal(validatePayload(invalid, type).valid, false, type);
  for (const [prefix, payload] of [["valid", valid], ["invalid", invalid]]) {
    fs.writeFileSync(path.join(__dirname, "../sample-payloads", `${prefix}-${type}.json`), JSON.stringify(payload, null, 2) + "\n");
  }
}
console.log(JSON.stringify({ generated: Object.keys(examples).length * 2,
  scope: "Synthetic structural examples only, not retained execution or native-provider evidence.", release_authorized: false }));
