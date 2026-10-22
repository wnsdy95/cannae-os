#!/usr/bin/env node
const fs = require("fs");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { analyzePlan, assertIntentContext } = require("./intent-continuity-contract");

function analyzeIntentContinuity(plan, context) {
  const checked = validatePayload(plan, "mission-wave-plan");
  const issues = [...checked.issues];
  let proof = null;
  if (checked.valid) {
    proof = analyzePlan(plan);
    if (context) {
      const result = validatePayload(context, "agent-context-pack"); issues.push(...result.issues);
      if (result.valid) {
        try { assertIntentContext(context, plan); }
        catch (error) { issues.push({ severity: "critical", code: error.message, path: "$.context", message: "The context does not preserve the exact plan intent lineage." }); }
      }
    }
  }
  return { schema_version: "0.1", type: "IntentContinuityProjection", mission_id: plan.mission_id, wave_id: plan.wave_id,
    status: issues.some(issue => ["error", "critical"].includes(issue.severity)) ? "blocked" : "ready",
    checked_agents: proof ? plan.agents.map(agent => agent.agent_id) : [],
    plan_sha256: proof?.plan_sha256 || "none", tree_sha256: proof?.tree_sha256 || "none", issues,
    execution_authorized: false, release_authorized: false };
}
module.exports = { analyzeIntentContinuity };
if (require.main === module) {
  try {
    const [input, context, ...extra] = process.argv.slice(2);
    if (!input || extra.length || input.startsWith("--") || context?.startsWith("--")) throw new Error("Usage: intent-continuity-runner.js <plan.json> [context.json]");
    const result = analyzeIntentContinuity(JSON.parse(fs.readFileSync(input, "utf8")), context && JSON.parse(fs.readFileSync(context, "utf8")));
    console.log(JSON.stringify(result, null, 2)); if (result.status !== "ready") process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
