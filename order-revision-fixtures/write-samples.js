const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const s = require("./support");
const { openWave } = require("../skill-mission-controller");
const { validatePayload } = require("../validator-cli-prototype/validate");

const parent = s.environment(Date.now() + 3600000);
try {
  s.adopt(parent); parent.opened = openWave(parent.plan, s.optionsAt(parent, 70));
  const child = s.successor(parent); s.proposeRevision(child);
  const invalidRequest = s.clone(child.revisionRequest); invalidRequest.wave_id = "W3";
  const invalidProposal = s.clone(child.revision.proposal); invalidProposal.request_sha256 = "f".repeat(64);
  const invalidPlan = s.clone(child.plan); invalidPlan.order_binding.revision_ref.approved = true;
  const cases = [
    ["valid-order-revision-request", child.revisionRequest, "order-revision-request", true],
    ["valid-order-revision-proposal", child.revision.proposal, "order-revision-proposal", true],
    ["valid-mission-wave-plan-revision", child.plan, "mission-wave-plan", true],
    ["invalid-order-revision-request-scope", invalidRequest, "order-revision-request", false],
    ["invalid-order-revision-proposal-binding", invalidProposal, "order-revision-proposal", false],
    ["invalid-mission-wave-plan-revision-extra", invalidPlan, "mission-wave-plan", false]
  ];
  for (const [name, value, type, expected] of cases) {
    const result = validatePayload(value, type); assert.equal(result.valid, expected, JSON.stringify(result.issues));
    fs.writeFileSync(path.join(__dirname, "../sample-payloads", `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
    console.log(name);
  }
} finally { fs.rmSync(parent.root, { recursive: true, force: true }); }
