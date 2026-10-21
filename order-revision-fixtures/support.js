const base = require("../order-adoption-fixtures/support");
const { captureRequest, compileOrder } = require("../request-order-compiler");
const { completeAnalysis, REQUEST_TEXT } = require("../request-order-compiler-fixtures/support");
const { ADOPTION_AUTHORITY } = require("../order-adoption-contract");
const { retainOrderEvidence, decideOrder } = require("../order-adoption-controller");
const { proposeRevision } = require("../order-revision-controller");
const { inputDigest } = require("../dispatch-runtime-controller");
const { terminationDecisionOption } = require("../skill-mission-controller");

function successor(parent, wave = "W2", offset = 200, classification) {
  const env = { root: parent.root, epoch: parent.epoch + offset * 1000, options: parent.options, toolInput: parent.toolInput };
  const change = "Include migration effort in the comparison.";
  env.captured = captureRequest({ ...base.optionsAt(env, 0), mission: parent.plan.mission_id, wave,
    requestId: `MR-REVISION-${wave}`, text: `${REQUEST_TEXT}${change}\n`, validForSeconds: 7200, classification });
  const analysis = completeAnalysis(env.captured.artifact_ref, parent.plan.mission_id, wave);
  const start = Buffer.byteLength(REQUEST_TEXT);
  analysis.id = `MOA-REVISION-${wave}`;
  analysis.statements.push({ id: "ST-CHANGE", kind: "request_quote", text: change, blocking: false,
    source: { kind: "request", start_byte: start, end_byte: start + Buffer.byteLength(change) } });
  analysis.tasks[1].task = "ST-CHANGE";
  env.compiled = compileOrder(analysis, base.optionsAt(env, 10));
  env.draft = base.read(env, env.compiled.artifact_ref);
  const order = env.draft.opord;
  env.plan = { ...base.clone(parent.plan), id: `MWP-REVISION-${wave}`, wave_id: wave, title: `Revised comparison ${wave}`,
    objective: order.mission.statement, success_conditions: order.mission.target_end_state, failure_conditions: order.intent.failure_to_avoid,
    constraints: order.situation.constraints, created_at: base.optionsAt(env, 10).now, valid_until: env.draft.expires_at };
  env.plan.agents = order.execution.tasks.map(task => ({ ...base.clone(parent.plan.agents[0]), agent_id: `agent-${task.assigned_to}-${wave}`,
    operational_role: task.assigned_to, task: task.task, context_scope: env.draft.classification,
    allowed_actions: order.command_and_signal.authority.requested,
    approval_required: [...new Set([...task.retained_user_decisions, ...order.command_and_signal.authority.approval_required])],
    prohibited_actions: order.command_and_signal.authority.prohibited }));
  env.plan.mission_profile.classification = env.draft.classification;
  env.plan.order_binding = { draft_ref: env.compiled.artifact_ref,
    task_assignments: order.execution.tasks.map((task, index) => ({ task_order_id: task.id, agent_id: env.plan.agents[index].agent_id })) };
  env.policies = env.plan.agents.map(agent => ({ ...base.clone(parent.policies[0]), id: `DTP-${agent.agent_id}`, wave_id: wave,
    agent_id: agent.agent_id, approved_at: env.plan.created_at, valid_until: env.plan.valid_until }));
  env.plan.dispatch_control.policy_authorizations = env.policies.map(policy => ({ agent_id: policy.agent_id, provider: policy.provider,
    policy_id: policy.id, draft_sha256: inputDigest(policy) }));
  env.revisionRequest = { schema_version: "0.1", type: "OrderRevisionRequest", id: `ORR-${wave}`,
    mission_id: env.plan.mission_id, wave_id: wave, parent_plan_ref: parent.opened.plan_ref,
    parent_adoption_ref: parent.adopted.record_ref, change_request_ref: env.captured.artifact_ref,
    successor_plan: env.plan, ...ADOPTION_AUTHORITY };
  env.request = { schema_version: "0.1", type: "OrderAdoptionProposalRequest", id: `OAPR-${wave}`,
    mission_id: env.plan.mission_id, wave_id: wave, plan: env.plan, ...ADOPTION_AUTHORITY };
  return env;
}
function propose(env) {
  env.revision = proposeRevision(env.revisionRequest, base.optionsAt(env, 15));
  env.plan = env.revision.successor_plan;
  env.request.plan = env.plan;
  return env.revision;
}
function stageAdoption(env) {
  base.propose(env); base.retainBriefs(env);
  env.rehearsal = base.rehearsal(env); env.rehearsal.id = `ORH-${env.plan.wave_id}`; env.rehearsal.rehearsal.id = `RH-${env.plan.wave_id}`;
  env.rehearsalRef = retainOrderEvidence(env.rehearsal, base.optionsAt(env, 40), "order-rehearsals").artifact_ref;
  env.decisionRequest = base.decisionRequest(env); env.decisionRequest.id = `OADR-${env.plan.wave_id}`;
  env.decision = base.decision(env, env.decisionRequest); env.decision.id = `DL-ADOPT-${env.plan.wave_id}`;
  env.decisionRequest.decision_ref = base.persist(env, "decision-logs", env.decision);
  return env.decisionRequest;
}
function adopt(env) {
  stageAdoption(env);
  env.adopted = decideOrder(env.decisionRequest, base.optionsAt(env, 60));
  return env.adopted;
}
function termination(parent, child, seconds = 300) {
  const request = { schema_version: "0.1", type: "MissionWaveTerminationRequest", mission_id: parent.plan.mission_id,
    wave_id: parent.plan.wave_id, status: "superseded", reason: "Synthetic fixture: exact reviewed revision.",
    plan_ref: parent.opened.plan_ref, successor_plan_ref: child.opened.plan_ref,
    decision_ref: { artifact_id: "none", relative_path: "none", sha256: "none" } };
  const option = terminationDecisionOption(request);
  const decision = { ...base.sample("decision-log"), id: `DL-SUPERSEDE-${child.plan.wave_id}`, mission_id: parent.plan.mission_id,
    decided_at: base.optionsAt(parent, seconds).now, decision_maker: "USER", decision_type: "scope", status: "complete",
    question: "Synthetic fixture only: supersede the exact prior wave?", rationale: "No real USER consent.",
    authority_basis: { basis_type: "retained_authority", reference: parent.plan.id, summary: "Synthetic USER fixture." },
    options_considered: [option], chosen_option: option, affected_artifacts: [request.plan_ref.relative_path, request.successor_plan_ref.relative_path] };
  request.decision_ref = base.persist(parent, "decision-logs", decision, seconds);
  return request;
}
module.exports = { ...base, successor, proposeRevision: propose, stageAdoption, adoptRevision: adopt, termination };
