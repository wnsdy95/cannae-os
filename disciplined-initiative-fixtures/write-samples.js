const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const support = require("./support");
const gate = require("../method-deviation-gate");
const { identified } = require("../method-deviation-contract");
const { validatePayload } = require("../validator-cli-prototype/validate");
const env = support.environment();
function reidentify(value) {
  const { schema_version, type, id, execution_authorized, continuation_authorized, release_authorized, human_final_decision_authority, ...body } = value;
  return identified(type, body);
}
try {
  support.start(env);
  const event = gate.proposeMethod(support.optionsAt(env, 90), { leaseId: env.leaseId, stepId: "inspect", methodId: "short_read",
    rationale: "Synthetic example: use the reviewed bounded first-line read." });
  support.admit(env, support.inputs.after, "sample-method", 100); support.complete(env, support.inputs.after, "sample-method", 101);
  const report = gate.reportMethod(support.optionsAt(env, 105), { deviationRef: event.artifact_ref, phase: "after" });
  support.admit(env, support.inputs.unplanned, "sample-drift", 110);
  const loaded = gate.load(env.options), entry = loaded.manifest.artifacts.find(item => item.kind === gate.INCIDENTS);
  const incident = gate.read(loaded, gate.reference(entry), gate.INCIDENTS, "degeneration-incident-event").payload;
  const examples = [
    ["mission-wave-plan-methods", env.plan, value => { value.method_control.agents.pop(); }],
    ["agent-context-pack-methods", support.read(env, env.opened.context_packs[0].context_pack_ref), value => { value.method_assignment.baseline_sha256 = "0".repeat(64); }],
    ["method-control-baseline", env.plan.method_control, value => { value.agents[0].steps[1].step_id = value.agents[0].steps[0].step_id; }],
    ["method-deviation-event", event.event, value => { value.expires_at = value.recorded_at; }],
    ["initiative-deviation-report", report.report, value => { value.phase = "before"; }],
    ["degeneration-incident-event", incident, value => { value.release_authorized = true; }]
  ];
  for (const [type, valid, mutate] of examples) {
    let invalid = support.clone(valid); mutate(invalid);
    if (["method-deviation-event", "initiative-deviation-report"].includes(type)) invalid = reidentify(invalid);
    const contract = { "mission-wave-plan-methods": "mission-wave-plan", "agent-context-pack-methods": "agent-context-pack" }[type] || type;
    assert.equal(validatePayload(valid, contract).valid, true, type);
    assert.equal(validatePayload(valid, contract).can_execute, false, type);
    assert.equal(validatePayload(invalid, contract).valid, false, type);
    for (const [prefix, payload] of [["valid", valid], ["invalid", invalid]]) {
      fs.writeFileSync(path.join(__dirname, "../sample-payloads", `${prefix}-${type}.json`), JSON.stringify(payload, null, 2) + "\n");
    }
  }
  fs.writeFileSync(path.join(__dirname, "policy-draft.json"), JSON.stringify(env.policies[0], null, 2) + "\n");
  console.log(JSON.stringify({ generated: examples.length * 2, real_user_authority: false, source: "synthetic isolated fixture execution" }));
} finally { fs.rmSync(env.root, { recursive: true, force: true }); }
