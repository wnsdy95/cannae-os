const s = require("../order-adoption-fixtures/support");
const { AUTHORITY } = require("../order-intake-contract");
const { NONE } = require("../order-adoption-contract");
function requestFor(env, parent) {
  const roster = parent || env;
  return { schema_version: "0.1", type: "BoundedPlanningRequest", id: `BPR-${env.plan.wave_id}`, mission_id: env.draft.mission_id,
    wave_id: env.draft.wave_id, draft_ref: env.compiled.artifact_ref, mode: parent ? "revision" : "initial",
    parent_plan_ref: parent ? parent.opened.plan_ref : { ...NONE }, parent_adoption_ref: parent ? parent.adopted.record_ref : { ...NONE },
    parent_policy_drafts: [],
    envelope: { title: "Synthetic bounded comparison plan", risk_level: roster.plan.mission_profile.risk_level,
      roe_class: roster.plan.mission_profile.roe_class, release_target: roster.plan.mission_profile.release_target,
      candidates: roster.plan.agents.map((agent, index) => {
        const { task, context_scope, ...identity } = s.clone(agent), policy = roster.policies[index];
        return { ...identity, allowed_task_ids: env.draft.opord.execution.tasks.filter(task => task.assigned_to === agent.operational_role).map(task => task.id),
          enabled: true, estimated_cost_units: index + 1, policy_template: Object.fromEntries(["provider", "tool_rules", "max_total_admissions", "lease_ttl_seconds", "repository_state"].map(key => [key, s.clone(policy[key])])) };
      }), limits: { max_agents: 4, max_estimated_cost_units: 10, max_search_states: 128, valid_for_seconds: 600 },
      controls: { model_assignment: s.clone(roster.plan.model_assignment), adaptive_work: s.clone(roster.plan.adaptive_work),
        ...(roster.plan.method_control ? { method_control: s.clone(roster.plan.method_control) } : {}) } }, ...AUTHORITY };
}
function useGenerated(env, generated) {
  env.generated = generated; env.plan = generated.plan; env.policies = generated.proposal.policy_drafts; env.request.plan = env.plan;
  return env;
}
function adoptGeneratedRevision(env) {
  const adoption = require("../order-adoption-controller");
  s.propose(env);
  env.briefs = env.plan.agents.map((_, index) => {
    const value = s.brief(env, index); value.id += `-${env.plan.wave_id}`; value.backbrief.id += `-${env.plan.wave_id}`; return value;
  });
  env.briefRefs = env.briefs.map(value => adoption.retainOrderEvidence(value, s.optionsAt(env, 30), "order-backbriefs").artifact_ref);
  env.rehearsal = s.rehearsal(env); env.rehearsal.id = `ORH-${env.plan.wave_id}`; env.rehearsal.rehearsal.id = `RH-${env.plan.wave_id}`;
  env.rehearsalRef = adoption.retainOrderEvidence(env.rehearsal, s.optionsAt(env, 40), "order-rehearsals").artifact_ref;
  env.decisionRequest = s.decisionRequest(env); env.decisionRequest.id = `OADR-${env.plan.wave_id}`;
  env.decision = s.decision(env, env.decisionRequest); env.decision.id = `DL-ADOPT-${env.plan.wave_id}`;
  env.decisionRequest.decision_ref = s.persist(env, "decision-logs", env.decision);
  env.adopted = adoption.decideOrder(env.decisionRequest, s.optionsAt(env, 60)); return env.adopted;
}
module.exports = { ...s, requestFor, useGenerated, adoptGeneratedRevision };
