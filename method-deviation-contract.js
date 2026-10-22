const { digest, same } = require("./order-intake-contract");

const TYPES = new Set(["method-control-baseline", "method-deviation-event", "initiative-deviation-report", "degeneration-incident-event"]);
const PREFIXES = { MethodDeviationEvent: "MDEV", InitiativeDeviationReport: "IDR", DegenerationIncidentEvent: "DIE" };
const AUTHORITY = Object.freeze({ execution_authorized: false, continuation_authorized: false, release_authorized: false,
  human_final_decision_authority: "USER" });
const METHOD_DOCUMENT = "docs/method-deviation-runtime.md";
const METHOD_CHECK = "node run-method-deviation-contract-fixtures.js";
const problem = (code, message) => ({ severity: "critical", code, path: "$", message });
const clone = value => JSON.parse(JSON.stringify(value));
function identified(type, body) {
  const value = { schema_version: "0.1", type, ...body, ...AUTHORITY };
  return { ...value, id: `${PREFIXES[type]}-${digest(value).slice(0, 32)}` };
}
function baseline(plan, agentId) { return plan.method_control?.agents.find(item => item.agent_id === agentId); }
function methods(step) { return [{ method_id: "planned", ...step.planned }, ...step.alternatives]; }
function methodAssignment(plan, agentId) {
  if (!plan.method_control) return null;
  const value = baseline(plan, agentId); if (!value) throw new Error("METHOD_AGENT_NOT_ASSIGNED");
  return { schema_version: "0.1", type: "AgentMethodAssignment", control_channel: "trusted_operator_control_plane",
    plan_sha256: digest(plan), baseline_sha256: digest(value),
    baseline: clone(value), after_report_due: plan.method_control.after_report_due,
    max_deviation_age_seconds: plan.method_control.max_deviation_age_seconds };
}
function assertMethodContext(context, plan) {
  const expected = methodAssignment(plan, context.agent_id);
  if (expected ? (!context.method_assignment || !same(context.method_assignment, expected)) : Object.hasOwn(context, "method_assignment")) {
    throw new Error("METHOD_CONTEXT_ASSIGNMENT_MISMATCH");
  }
  if (expected && (!context.documents.some(item => item.path === METHOD_DOCUMENT) || !context.validation_commands.includes(METHOD_CHECK) ||
      !context.required_controls.some(item => item.command === METHOD_CHECK))) throw new Error("METHOD_CONTEXT_PROCEDURE_MISSING");
}
function baselineIssues(value) {
  const issues = [];
  if (new Set(value.agents.map(item => item.agent_id)).size !== value.agents.length) {
    issues.push(problem("METHOD_DUPLICATE_AGENT", "A method ruleset contains each agent exactly once."));
  }
  for (const agent of value.agents) {
    if (new Set(agent.steps.map(step => step.step_id)).size !== agent.steps.length) {
      issues.push(problem("METHOD_DUPLICATE_STEP", "Each finite mandatory step has a distinct identity."));
    }
    for (const step of agent.steps) {
      const all = methods(step);
      if (all.some(item => !item.instructions.trim())) {
        issues.push(problem("METHOD_INSTRUCTIONS_EMPTY", "Every reviewed method needs usable receiver-facing instructions, not just an input digest."));
      }
      if (new Set(all.map(item => item.method_id)).size !== all.length ||
          new Set(all.map(item => `${item.tool_name}:${item.input_sha256}`)).size !== all.length) {
        issues.push(problem("METHOD_AMBIGUOUS_ALTERNATIVE", "Planned and alternative methods must have unique identities and exact tool/input pairs."));
      }
    }
  }
  return issues;
}
function planIssues(plan) {
  if (!plan.method_control) return [];
  const issues = baselineIssues(plan.method_control);
  if (plan.schema_version !== "0.2" || !plan.order_binding || plan.dispatch_control?.required !== true) {
    issues.push(problem("METHOD_REVIEWED_DISPATCH_REQUIRED", "Method control requires a captured, full-plan-adopted dispatch-controlled wave."));
  }
  if (!same(plan.method_control.agents.map(item => item.agent_id).sort(), plan.agents.map(item => item.agent_id).sort())) {
    issues.push(problem("METHOD_AGENT_COVERAGE", "The reviewed method roster must cover every mission agent exactly."));
  }
  for (const value of plan.method_control.agents) {
    const agent = plan.agents.find(item => item.agent_id === value.agent_id);
    const task = plan.order_binding?.task_assignments.find(item => item.agent_id === value.agent_id);
    if (!agent || !task || value.task_id !== task.task_order_id || value.task_sha256 !== digest(agent.task)) {
      issues.push(problem("METHOD_TASK_COMMITMENT_MISMATCH", "The baseline must preserve the exact assigned task identity and text digest."));
    }
    if (agent && value.steps.some(step => !agent.allowed_actions.includes(step.mission_action) ||
        agent.approval_required.includes(step.mission_action) || agent.prohibited_actions.includes(step.mission_action))) {
      issues.push(problem("METHOD_ACTION_NOT_AUTONOMOUS", "Method choice never unlocks an absent, approval-required or prohibited mission action."));
    }
  }
  return issues;
}
function assertMethodPolicy(plan, policy) {
  if (!plan.method_control) return;
  const issues = planIssues(plan); if (issues.length) throw new Error(issues.map(item => item.code).join(","));
  const agent = baseline(plan, policy.agent_id);
  if (!agent) throw new Error("METHOD_AGENT_NOT_ASSIGNED");
  for (const step of agent.steps) {
    let operationClass;
    for (const method of methods(step)) {
      const rule = policy.tool_rules.find(item => item.rule_id === method.rule_id);
      if (!rule || rule.mission_action !== step.mission_action || rule.tool_name !== method.tool_name ||
          rule.input_match.mode !== "exact_sha256" || !rule.input_match.allowed_sha256.includes(method.input_sha256)) {
        throw new Error("METHOD_POLICY_BINDING_MISMATCH");
      }
      if (operationClass && rule.operation_class !== operationClass) throw new Error("METHOD_OPERATION_CLASS_CHANGED");
      operationClass = rule.operation_class;
    }
  }
}
function methodIssues(payload, type) {
  if (type === "agent-context-pack" && payload.method_assignment) {
    const value = payload.method_assignment, task = payload.intent_assignment?.assigned_task;
    const issues = baselineIssues({ agents: [value.baseline] });
    if (value.baseline.agent_id !== payload.agent_id || value.baseline_sha256 !== digest(value.baseline) ||
      value.plan_sha256 !== payload.intent_assignment?.plan_sha256 || !task || value.baseline.task_id !== task.task_id ||
      value.baseline.task_sha256 !== task.task_sha256 || !payload.documents.some(item => item.path === METHOD_DOCUMENT) ||
      !payload.validation_commands.includes(METHOD_CHECK) || !payload.required_controls.some(item => item.command === METHOD_CHECK)) {
      issues.push(problem("METHOD_CONTEXT_BINDING_INVALID", "The receiver gets only its exact task-bound baseline and mandatory method procedure/control."));
    }
    return issues;
  }
  if (type === "mission-wave-plan") return planIssues(payload);
  if (type === "method-control-baseline") return baselineIssues(payload);
  if (!TYPES.has(type)) return [];
  const { id, ...body } = payload;
  const issues = id === `${PREFIXES[payload.type]}-${digest(body).slice(0, 32)}` ? [] :
    [problem("METHOD_RECORD_ID_BINDING_MISMATCH", "The record ID must bind the entire exact non-authorizing projection.")];
  if (type === "method-deviation-event") {
    const start = Date.parse(payload.recorded_at), end = Date.parse(payload.expires_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 600000) {
      issues.push(problem("METHOD_DEVIATION_VALIDITY_INVALID", "A deviation has positive validity of no more than ten minutes; it never extends its lease."));
    }
  }
  if (type === "initiative-deviation-report") {
    const before = payload.phase === "before";
    if (before ? (!payload.decision_ref || payload.admission_ref !== null || payload.result_checkpoint_ref !== null || payload.result_sha256 !== null) :
      (payload.decision_ref !== null || !payload.admission_ref || !payload.result_checkpoint_ref || payload.result_sha256 === null)) {
      issues.push(problem("METHOD_REPORT_PHASE_BINDING_INVALID", "Before reports bind one USER acknowledgment; after reports bind the actual admission and result checkpoint."));
    }
  }
  return issues;
}
module.exports = { TYPES, PREFIXES, AUTHORITY, METHOD_DOCUMENT, METHOD_CHECK, identified, baseline, methods, methodAssignment,
  assertMethodContext, baselineIssues, planIssues, assertMethodPolicy, methodIssues, clone };
