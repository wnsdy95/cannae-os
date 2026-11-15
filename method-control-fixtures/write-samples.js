const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { samples, continuationSamples, clone, rekey } = require("./contracts"), { validatePayload } = require("../validator-cli-prototype/validate");
const examples = [...Object.entries(samples()).map(([type, value]) => [type, type, value]),
  ...Object.entries(continuationSamples()).map(([type, value]) => [type + "-continuation", type, value])];
for (const [name, type, valid] of examples) {
  let invalid = clone(valid);
  if (name === "method-control-channel-policy-continuation") delete invalid.continuation;
  else if (name === "method-control-launch-slot-continuation") delete invalid.interruption_checkpoint_ref;
  else if (name === "method-control-session-observation-continuation") invalid.source = "startup";
  else invalid.release_authorized = true;
  if (invalid.id) invalid = rekey(invalid);
  assert.equal(validatePayload(valid, type).valid, true, type);
  assert.equal(validatePayload(valid, type).can_execute, false, type);
  assert.equal(validatePayload(invalid, type).valid, false, type);
  for (const [prefix, payload] of [["valid", valid], ["invalid", invalid]]) {
    fs.writeFileSync(path.join(__dirname, "../sample-payloads", `${prefix}-${name}.json`), JSON.stringify(payload, null, 2) + "\n");
  }
}
console.log(JSON.stringify({ generated: examples.length * 2,
  scope: "Synthetic structural examples only, not retained execution or native-provider evidence.", release_authorized: false }));
