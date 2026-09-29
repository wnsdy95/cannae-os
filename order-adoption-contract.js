const { digest, same, AUTHORITY } = require("./order-intake-contract");

const NONE = Object.freeze({ artifact_id: "none", relative_path: "none", sha256: "none" });
const ADOPTION_AUTHORITY = Object.freeze({ ...AUTHORITY, continuation_authorized: false });
const ADOPTION_TYPES = new Set([
  "order-adoption-proposal-request", "order-adoption-proposal", "order-backbrief",
  "order-rehearsal", "order-adoption-decision-request", "order-adoption-record"
]);
const TYPES = Object.freeze({
  "order-adoption-proposal-request": "OrderAdoptionProposalRequest",
  "order-adoption-proposal": "OrderAdoptionProposal",
  "order-backbrief": "OrderBackbrief",
  "order-rehearsal": "OrderRehearsal",
  "order-adoption-decision-request": "OrderAdoptionDecisionRequest",
  "order-adoption-record": "OrderAdoptionRecord"
});
const unique = values => [...new Set(values)];
const includesAll = (values, required) => required.every(value => values.includes(value));
const problem = (code, location, message) => ({ severity: "critical", code, path: location, message });

function decisionOption(request) {
  return `review-order:${digest({ ...request, decision_ref: NONE })}`;
}

function proposalPayload(request, draft, observedManifest, now) {
  return {
    schema_version: "0.1", type: TYPES["order-adoption-proposal"],
    id: `OAP-${digest(request).slice(0, 32)}`, mission_id: request.mission_id, wave_id: request.wave_id,
    request, request_sha256: digest(request), plan_sha256: digest(request.plan),
    observed_manifest: observedManifest, recorded_at: now,
    expires_at: new Date(Math.min(Date.parse(now) + 3600000, Date.parse(draft.expires_at), Date.parse(request.plan.valid_until))).toISOString(),
    classification: draft.classification, ...ADOPTION_AUTHORITY
  };
}

function recordPayload(request, proposal, observedManifest, now) {
  const bound = digest(request);
  return {
    schema_version: "0.1", type: TYPES["order-adoption-record"], id: `OAR-${bound.slice(0, 32)}`,
    mission_id: request.mission_id, wave_id: request.wave_id, request, request_sha256: bound,
    plan_sha256: proposal.plan_sha256, status: { approve: "adopted", reject: "rejected", revise: "revision_required" }[request.disposition],
    issued_order_id: request.disposition === "approve" ? `IO-${bound.slice(0, 32)}` : "none",
    observed_manifest: observedManifest, recorded_at: now, expires_at: proposal.expires_at,
    classification: proposal.classification, ...ADOPTION_AUTHORITY
  };
}

function assignedTask(plan, draft, agentId) {
  const binding = plan.order_binding.task_assignments.find(item => item.agent_id === agentId);
  return binding && draft.opord.execution.tasks.find(task => task.id === binding.task_order_id);
}

function planDraftIssues(plan, draft) {
  const issues = [];
  const order = draft.opord;
  const assignments = plan.order_binding.task_assignments;
  const agents = plan.agents;
  const taskIds = order.execution.tasks.map(task => task.id);
  const agentIds = agents.map(agent => agent.agent_id);
  if (draft.status !== "ready_for_review" || plan.mission_id !== draft.mission_id || plan.wave_id !== draft.wave_id ||
      plan.objective !== order.mission.statement || !includesAll(plan.success_conditions, order.mission.target_end_state) ||
      !includesAll(plan.failure_conditions, order.intent.failure_to_avoid) || !includesAll(plan.constraints, order.situation.constraints)) {
    issues.push(problem("ORDER_PLAN_INTENT_MISMATCH", "$", "The exact ready draft, mission, outcome, failure conditions and constraints must survive plan adoption."));
  }
  if (Date.parse(plan.created_at) < Date.parse(draft.compiled_at) || Date.parse(plan.valid_until) > Date.parse(draft.expires_at)) {
    issues.push(problem("ORDER_PLAN_VALIDITY_MISMATCH", "$.plan", "Plan validity must stay inside its retained draft lifetime."));
  }
  if (plan.mission_profile.classification !== draft.classification || agents.some(agent => agent.context_scope !== draft.classification)) {
    issues.push(problem("ORDER_PLAN_CLASSIFICATION_MISMATCH", "$.plan", "Every receiving agent must retain the adopted draft's handling level."));
  }
  if (assignments.length !== taskIds.length || assignments.length !== agentIds.length ||
      new Set(assignments.map(item => item.task_order_id)).size !== taskIds.length ||
      new Set(assignments.map(item => item.agent_id)).size !== agentIds.length ||
      assignments.some(item => !taskIds.includes(item.task_order_id) || !agentIds.includes(item.agent_id))) {
    issues.push(problem("ORDER_PLAN_ASSIGNMENT_MISMATCH", "$.plan.order_binding", "Bind every exact task and agent once; role labels alone do not identify agents."));
    return issues;
  }
  for (const agent of agents) {
    const task = assignedTask(plan, draft, agent.agent_id);
    if (agent.operational_role !== task.assigned_to || agent.task !== task.task) {
      issues.push(problem("ORDER_PLAN_TASK_MISMATCH", "$.plan.agents", "Task text and operational role must match the exact assigned draft task."));
    }
    const approvalRequired = unique([...order.command_and_signal.authority.approval_required, ...task.retained_user_decisions]);
    if (!includesAll(agent.approval_required, approvalRequired) ||
        !includesAll(agent.prohibited_actions, order.command_and_signal.authority.prohibited) ||
        !agent.allowed_actions.every(action => order.command_and_signal.authority.requested.includes(action))) {
      issues.push(problem("ORDER_PLAN_AUTHORITY_MISMATCH", "$.plan.agents", "Preserve retained boundaries; proposed actions become plan scope only through exact USER adoption."));
    }
  }
  return issues;
}

function backbriefIssues(payload, proposal, draft) {
  const issues = [];
  const plan = proposal.request.plan;
  const agent = plan.agents.find(item => item.agent_id === payload.agent_id);
  const task = agent && assignedTask(plan, draft, agent.agent_id);
  const brief = payload.backbrief;
  const order = draft.opord;
  if (!agent || !task) return [problem("ORDER_BACKBRIEF_AGENT_MISMATCH", "$.agent_id", "The backbrief must identify an assigned agent, not only a role.")];
  if (brief.parent_order !== proposal.id || brief.task_order !== task.id || brief.actor !== agent.operational_role ||
      brief.mission_id !== plan.mission_id || brief.classification !== draft.classification ||
      brief.understanding.commander_intent !== order.intent.purpose || brief.understanding.assigned_task !== task.task ||
      brief.understanding.purpose !== task.purpose || !includesAll(brief.understanding.end_state, plan.success_conditions) ||
      !includesAll(brief.understanding.constraints, plan.constraints) || !includesAll(brief.stop_conditions, plan.failure_conditions) ||
      !includesAll(brief.approval_awareness.approval_required_actions, agent.approval_required) ||
      !includesAll(brief.approval_awareness.prohibited_actions, agent.prohibited_actions) ||
      !includesAll(brief.assumptions, order.situation.assumptions) ||
      !same(payload.task_acknowledgement, task) ||
      !brief.planned_actions.every(action => agent.allowed_actions.includes(action))) {
    issues.push(problem("ORDER_BACKBRIEF_SCOPE_MISMATCH", "$.backbrief", "The agent must acknowledge the full task and inherited plan boundaries without adding unapproved actions."));
  }
  if (brief.requested_clarifications.length || brief.approval_awareness.commander_decision_needed || brief.confidence === "low") {
    issues.push(problem("ORDER_BACKBRIEF_UNRESOLVED", "$.backbrief", "Resolve the agent's outstanding questions before approving execution scope."));
  }
  return issues;
}

function adoptionIssues(payload, type) {
  const issues = [];
  if (type === "mission-wave-plan" && payload.schema_version === "0.2") {
    const assigned = payload.order_binding.task_assignments;
    const agents = payload.agents.map(item => item.agent_id);
    if (assigned.length !== agents.length || new Set(assigned.map(item => item.agent_id)).size !== agents.length ||
        new Set(assigned.map(item => item.task_order_id)).size !== agents.length || assigned.some(item => !agents.includes(item.agent_id))) {
      issues.push(problem("ORDER_PLAN_ASSIGNMENT_MISMATCH", "$.order_binding", "Each agent must have exactly one distinct task assignment."));
    }
  }
  if (type === "agent-context-pack" && payload.schema_version === "0.3") {
    const task = payload.order_assignment.task_order;
    if (task.mission_id !== payload.mission_id || task.assigned_to !== payload.operational_role || task.task !== payload.task) {
      issues.push(problem("ORDER_CONTEXT_TASK_MISMATCH", "$.order_assignment", "Context and assigned task must retain the exact mission, role and text."));
    }
  }
  if (type === "order-adoption-proposal-request") {
    if (payload.plan.schema_version !== "0.2" || payload.mission_id !== payload.plan.mission_id || payload.wave_id !== payload.plan.wave_id) {
      issues.push(problem("ORDER_PROPOSAL_PLAN_SCOPE_MISMATCH", "$.plan", "Adoption requires a versioned plan in the proposal's exact mission and wave."));
    }
  }
  if (type === "order-adoption-proposal") {
    issues.push(...adoptionIssues(payload.request, "order-adoption-proposal-request"));
    if (payload.id !== `OAP-${digest(payload.request).slice(0, 32)}` || payload.request_sha256 !== digest(payload.request) ||
        payload.plan_sha256 !== digest(payload.request.plan) || payload.mission_id !== payload.request.mission_id || payload.wave_id !== payload.request.wave_id) {
      issues.push(problem("ORDER_PROPOSAL_BINDING_MISMATCH", "$", "The proposal must bind its complete request and plan."));
    }
  }
  if (type === "order-adoption-record") {
    const bound = digest(payload.request);
    if (payload.id !== `OAR-${bound.slice(0, 32)}` || payload.request_sha256 !== bound ||
        payload.mission_id !== payload.request.mission_id || payload.wave_id !== payload.request.wave_id ||
        payload.status !== { approve: "adopted", reject: "rejected", revise: "revision_required" }[payload.request.disposition] ||
        payload.issued_order_id !== (payload.request.disposition === "approve" ? `IO-${bound.slice(0, 32)}` : "none") ||
        same(payload.request.decision_ref, NONE)) {
      issues.push(problem("ORDER_ADOPTION_BINDING_MISMATCH", "$", "The retained disposition and issued-order identity must bind the exact decision request."));
    }
  }
  if (type === "order-adoption-decision-request" && payload.disposition === "approve" &&
      (payload.backbrief_refs.length === 0 || same(payload.rehearsal_ref, NONE))) {
    issues.push(problem("ORDER_ADOPTION_REHEARSAL_REQUIRED", "$", "Approval requires exact retained backbriefs and rehearsal references."));
  }
  if (["order-backbrief", "order-rehearsal"].includes(type)) {
    const body = payload[type === "order-backbrief" ? "backbrief" : "rehearsal"];
    if (body.mission_id !== payload.mission_id || body.parent_order !== payload.proposal_ref.artifact_id) {
      issues.push(problem("ORDER_EVIDENCE_SCOPE_MISMATCH", "$", "The enclosed evidence must identify this mission and proposal."));
    }
  }
  if (["order-adoption-proposal", "order-adoption-record"].includes(type) &&
      (!(Date.parse(payload.recorded_at) < Date.parse(payload.expires_at)) || Date.parse(payload.expires_at) - Date.parse(payload.recorded_at) > 3600000)) {
    issues.push(problem("ORDER_ADOPTION_VALIDITY_INVALID", "$.expires_at", "A proposal or decision record must have a positive lifetime of at most one hour."));
  }
  return issues;
}

module.exports = { NONE, ADOPTION_AUTHORITY, ADOPTION_TYPES, TYPES, decisionOption, proposalPayload, recordPayload,
  assignedTask, planDraftIssues, backbriefIssues, adoptionIssues };
