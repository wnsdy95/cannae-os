const base = require("../order-adoption-fixtures/support");
const intent = require("../intent-continuity-contract");
const { digest } = require("../order-intake-contract");
function fixturePlan() {
  const plan = base.sample("mission-wave-plan");
  plan.adaptive_work.enabled = false;
  for (const agent of plan.agents) {
    agent.allowed_actions = ["Inspect supplied evidence", "Prepare an internal draft"];
    agent.approval_required = ["Change mission scope", "Publish externally"];
    agent.prohibited_actions = ["Expose credentials"];
  }
  return plan;
}
function nested(plan) {
  const result = base.clone(plan), tree = intent.defaultTree(result);
  for (let index = 2; index < tree.intents.length; index++) {
    const child = tree.intents[index], parent = tree.intents[index - 1];
    child.parent_intent_id = parent.id;
    tree.delegations[index - 1] = intent.delegation(parent, child);
  }
  result.intent_continuity = tree; return result;
}
function context(plan, agent = plan.agents[0]) {
  const value = base.sample("agent-context-pack");
  Object.assign(value, { schema_version: "0.4", mission_id: plan.mission_id, wave_id: plan.wave_id,
    agent_id: agent.agent_id, operational_role: agent.operational_role, department: agent.department, task: agent.task,
    classification: agent.context_scope, capability_query: plan.objective,
    plan_ref: { ...value.plan_ref, artifact_id: plan.id, sha256: digest(plan) },
    intent_assignment: intent.assignmentForPlan(plan, agent.agent_id),
    authority: { ...value.authority, delegated_authority: agent.delegated_authority,
      allowed_actions: agent.allowed_actions, approval_required: agent.approval_required, prohibited_actions: agent.prohibited_actions } });
  value.capability_routing.capability_scope = plan.objective;
  return value;
}
module.exports = { ...base, fixturePlan, nested, context };
