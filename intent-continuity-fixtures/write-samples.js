const fs = require("fs");
const path = require("path");
const s = require("./support");
const { analyzeIntentContinuity } = require("../intent-continuity-runner");
const { validatePayload } = require("../validator-cli-prototype/validate");
const plan = s.nested(s.fixturePlan()), root = plan.intent_continuity.intents[0], edge = plan.intent_continuity.delegations[0];
const pack = s.context(plan), projection = analyzeIntentContinuity(plan);
const badRoot = s.clone(root); badRoot.parent_intent_id = root.id;
const badEdge = s.clone(edge); badEdge.delegate_agent_id = edge.delegator_agent_id;
const badPlan = s.clone(plan); badPlan.intent_continuity.intents.at(-1).key_tasks.pop();
const badPack = s.clone(pack); delete badPack.intent_assignment;
const rows = [
  ["commander-intent", "commander-intent", root, badRoot],
  ["intent-delegation-event", "intent-delegation-event", edge, badEdge],
  ["mission-wave-plan-intent", "mission-wave-plan", plan, badPlan],
  ["agent-context-pack-intent", "agent-context-pack", pack, badPack],
  ["intent-continuity-projection", "intent-continuity-projection", projection, { ...projection, release_authorized: true }]
];
for (const [name, type, valid, invalid] of rows) {
  for (const [prefix, payload, expected] of [["valid", valid, true], ["invalid", invalid, false]]) {
    const result = validatePayload(payload, type);
    if (result.valid !== expected) throw new Error(`${prefix}-${name}: ${JSON.stringify(result.issues)}`);
    fs.writeFileSync(path.join(__dirname, "..", "sample-payloads", `${prefix}-${name}.json`), JSON.stringify(payload, null, 2) + "\n");
  }
}
console.log(JSON.stringify({ samples_written: rows.length * 2 }, null, 2));
