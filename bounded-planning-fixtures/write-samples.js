const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const s = require("./support"), { generatePlan } = require("../bounded-planning-controller"), { validatePayload } = require("../validator-cli-prototype/validate");
const env = s.environment();
try {
  const request = s.requestFor(env), proposal = generatePlan(request, s.optionsAt(env, 12)).proposal;
  for (const [type, payload] of [["bounded-planning-request", request], ["bounded-planning-proposal", proposal]]) {
    const invalid = s.clone(payload);
    if (type === "bounded-planning-request") invalid.envelope.candidates.push(s.clone(invalid.envelope.candidates[0])); else invalid.id = "BPP-invalid-binding";
    for (const [prefix, value, expected] of [["valid", payload, true], ["invalid", invalid, false]]) {
      const result = validatePayload(value, type); assert.equal(result.valid, expected, JSON.stringify(result.issues)); assert.equal(result.can_execute, false);
      fs.writeFileSync(path.join(__dirname, `../sample-payloads/${prefix}-${type}.json`), JSON.stringify(value, null, 2) + "\n");
    }
  }
} finally { fs.rmSync(env.root, { recursive: true, force: true }); }
