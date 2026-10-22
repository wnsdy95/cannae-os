const { digest, same: sameCanonical } = require("./order-intake-contract");

const GRADES = Object.freeze(["green", "amber", "red", "black"]);
const NONE = Object.freeze({ artifact_id: "none", relative_path: "none", sha256: "none" });
const TYPES = new Set(["commander-intent", "intent-delegation-event", "intent-continuity-projection"]);
const unique = values => [...new Set(values)];
const clone = value => JSON.parse(JSON.stringify(value));
const same = (left, right) => left !== undefined && right !== undefined && sameCanonical(left, right);
const id = (prefix, value) => `${prefix}-${digest(value).slice(0, 32)}`;
const problem = (code, message, location = "$") => ({ severity: "critical", code, path: location, message });
const includes = (child, parent) => parent.every(value => child.includes(value));
const universe = boundary => unique(GRADES.flatMap(grade => boundary[grade]));
function gradeOf(boundary, action) {
  const found = GRADES.flatMap((grade, index) => boundary[grade].includes(action) ? [index] : []);
  return found.length ? Math.max(...found) : 3;
}
function agentBoundary(agent) {
  const values = { green: agent.allowed_actions, amber: [], red: agent.approval_required, black: agent.prohibited_actions };
  const boundary = Object.fromEntries(GRADES.map(grade => [grade, []]));
  for (const action of universe(values)) boundary[GRADES[gradeOf(values, action)]].push(action);
  return boundary;
}
function rootBoundary(plan) {
  const boundaries = plan.agents.map(agentBoundary);
  const root = Object.fromEntries(GRADES.map(grade => [grade, []]));
  for (const action of unique(boundaries.flatMap(universe))) {
    root[GRADES[Math.min(...boundaries.map(boundary => gradeOf(boundary, action)))]].push(action);
  }
  return root;
}
function intentId(plan, agentId) { return id("INT", [plan.mission_id, plan.wave_id, plan.id, agentId]); }
function keyTasks(plan) {
  return plan.agents.map(agent => ({
    task_id: plan.order_binding?.task_assignments.find(value => value.agent_id === agent.agent_id)?.task_order_id ||
      id("TASK", [plan.mission_id, plan.wave_id, agent.agent_id]),
    task_sha256: digest(agent.task), owner_agent_id: agent.agent_id
  }));
}
function rootIntent(plan) {
  return { schema_version: "0.1", type: "CommanderIntent", id: intentId(plan, "USER"),
    mission_id: plan.mission_id, wave_id: plan.wave_id, plan_id: plan.id, agent_id: "USER", parent_intent_id: null,
    purpose: plan.objective, key_tasks: keyTasks(plan), end_state: clone(plan.success_conditions),
    failure_to_avoid: clone(plan.failure_conditions), constraints: clone(plan.constraints), authority_boundary: rootBoundary(plan) };
}
function delegation(parent, child) {
  const body = { mission_id: child.mission_id, wave_id: child.wave_id, parent_intent_id: parent.id,
    child_intent_id: child.id, delegator_agent_id: parent.agent_id, delegate_agent_id: child.agent_id,
    delegated_boundary: clone(child.authority_boundary), approval_scope_ref: { ...NONE } };
  return { schema_version: "0.1", type: "IntentDelegationEvent", id: id("IDE", body), ...body };
}
function defaultTree(plan) {
  const root = rootIntent(plan);
  const children = plan.agents.map(agent => ({ ...clone(root), id: intentId(plan, agent.agent_id), agent_id: agent.agent_id,
    parent_intent_id: root.id, authority_boundary: agentBoundary(agent) }));
  return { root_intent_id: root.id, intents: [root, ...children], delegations: children.map(child => delegation(root, child)) };
}
function boundaryIssues(boundary, location) {
  const issues = [], actions = GRADES.flatMap(grade => boundary[grade]);
  if (GRADES.some(grade => boundary[grade].length > 256)) issues.push(problem("INTENT_BOUNDARY_LIMIT", "Each explicit action grade has at most 256 finite identifiers.", location));
  if (new Set(actions).size !== actions.length) issues.push(problem("INTENT_BOUNDARY_AMBIGUOUS", "An action has exactly one declared grade.", location));
  return issues;
}
function analyzePlan(plan) {
  const expectedRoot = rootIntent(plan), tree = clone(plan.intent_continuity || defaultTree(plan)), issues = [];
  const add = (code, message) => issues.push(problem(code, message));
  if (plan.agents.length > 256 || plan.agents.some(agent => agent.agent_id === "USER") ||
      new Set(plan.agents.map(agent => agent.agent_id)).size !== plan.agents.length) {
    add("INTENT_ROSTER_INVALID", "Bind one finite, distinct mission-agent roster; USER is reserved for the root.");
  }
  const byId = new Map(tree.intents.map(intent => [intent.id, intent]));
  const byAgent = new Map(tree.intents.map(intent => [intent.agent_id, intent]));
  if (tree.intents.length !== plan.agents.length + 1 || byId.size !== tree.intents.length || byAgent.size !== tree.intents.length ||
      tree.root_intent_id !== expectedRoot.id || !same(byId.get(expectedRoot.id), expectedRoot)) {
    add("INTENT_ROOT_OR_ROSTER_MISMATCH", "The root is derived from the complete plan and every agent has one distinct intent.");
  }
  const links = new Map();
  if (tree.delegations.length !== plan.agents.length || new Set(tree.delegations.map(event => event.id)).size !== tree.delegations.length) {
    add("INTENT_DELEGATION_COVERAGE", "Every non-root intent has exactly one distinct delegation.");
  }
  for (const event of tree.delegations) {
    const list = links.get(event.child_intent_id) || []; list.push(event); links.set(event.child_intent_id, list);
  }
  for (const intent of tree.intents) issues.push(...boundaryIssues(intent.authority_boundary, `$.intents.${intent.id}`));
  for (const agent of plan.agents) {
    const child = byAgent.get(agent.agent_id), declared = agentBoundary(agent);
    if (!child || child.id !== intentId(plan, agent.agent_id) || child.mission_id !== plan.mission_id ||
        child.wave_id !== plan.wave_id || child.plan_id !== plan.id || !same(child.authority_boundary, declared)) {
      add("INTENT_AGENT_SCOPE_MISMATCH", "Agent identity and its graded boundary must match the exact authored plan."); continue;
    }
    if (!agent.allowed_actions.every(action => gradeOf(declared, action) === 0)) {
      add("INTENT_AGENT_BOUNDARY_CONFLICT", "An allowed action cannot simultaneously require approval or be prohibited.");
    }
    const path = new Set(); let current = child;
    while (current && current.id !== expectedRoot.id) {
      if (path.has(current.id)) { add("INTENT_LINEAGE_CYCLE", "Intent delegation must reach the one USER root without a cycle."); break; }
      path.add(current.id);
      const parent = byId.get(current.parent_intent_id), events = links.get(current.id) || [];
      if (!parent || events.length !== 1) { add("INTENT_PARENT_OR_DELEGATION_MISSING", "Every child must have one retained parent and delegation."); break; }
      const event = events[0];
      if (!same(event, delegation(parent, current))) add("INTENT_DELEGATION_SCOPE_MISMATCH", "The exact edge and delegated scope must match; approval-bearing adapters cannot be invented.");
      if (current.purpose !== parent.purpose || !same(current.key_tasks, parent.key_tasks) ||
          !includes(current.end_state, parent.end_state) || !includes(current.failure_to_avoid, parent.failure_to_avoid) ||
          !includes(current.constraints, parent.constraints)) {
        add("INTENT_INHERITANCE_LOST", "Purpose, complete key-task commitments, end state, failures and constraints survive every echelon.");
      }
      for (const action of unique([...universe(current.authority_boundary), ...universe(event.delegated_boundary)])) {
        if (gradeOf(current.authority_boundary, action) < gradeOf(parent.authority_boundary, action) ||
            gradeOf(event.delegated_boundary, action) < gradeOf(parent.authority_boundary, action)) {
          add("INTENT_AUTHORITY_WIDENED", "A child cannot unlock an absent/prohibited action or lower its parent's approval grade.");
        }
      }
      current = parent;
    }
    if (!current || current.id !== expectedRoot.id) add("INTENT_ROOT_UNREACHABLE", "Every mission agent must reach the exact USER root.");
  }
  return { tree, issues, tree_sha256: digest(tree), plan_sha256: digest(plan) };
}
function assignmentForPlan(plan, agentId) {
  const result = analyzePlan(plan);
  if (result.issues.length) throw new Error(result.issues.map(issue => issue.code).join(","));
  const byId = new Map(result.tree.intents.map(intent => [intent.id, intent]));
  let node = result.tree.intents.find(intent => intent.agent_id === agentId);
  if (!node || agentId === "USER") throw new Error("INTENT_AGENT_NOT_ASSIGNED");
  const lineage = [], delegations = [];
  while (node) {
    lineage.unshift(node);
    if (node.parent_intent_id === null) break;
    delegations.unshift(result.tree.delegations.find(event => event.child_intent_id === node.id));
    node = byId.get(node.parent_intent_id);
  }
  return { schema_version: "0.1", type: "AgentIntentAssignment", agent_id: agentId,
    plan_sha256: result.plan_sha256, tree_sha256: result.tree_sha256, root_intent_id: result.tree.root_intent_id,
    lineage, delegations, assigned_task: keyTasks(plan).find(task => task.owner_agent_id === agentId) };
}
function assertIntentContext(context, plan) {
  if (context.schema_version !== "0.4" || !context.intent_assignment) throw new Error("INTENT_CONTEXT_UPGRADE_REQUIRED");
  if (context.mission_id !== plan.mission_id || context.wave_id !== plan.wave_id ||
      !same(context.intent_assignment, assignmentForPlan(plan, context.agent_id))) throw new Error("INTENT_CONTEXT_SUBSTITUTED");
  const agent = plan.agents.find(value => value.agent_id === context.agent_id);
  if (context.plan_ref.artifact_id !== plan.id || context.operational_role !== agent.operational_role ||
      context.department !== agent.department || context.classification !== agent.context_scope ||
      context.capability_query !== plan.objective || context.authority.delegated_authority !== agent.delegated_authority ||
      context.task !== agent.task || !same(context.authority.allowed_actions, agent.allowed_actions) ||
      !same(context.authority.approval_required, agent.approval_required) || !same(context.authority.prohibited_actions, agent.prohibited_actions)) {
    throw new Error("INTENT_CONTEXT_AUTHORITY_MISMATCH");
  }
  require("./method-deviation-contract").assertMethodContext(context, plan);
  return context.intent_assignment;
}
function assertIntentPolicy(policy, assignment) {
  if (policy.agent_id !== assignment.agent_id) throw new Error("INTENT_POLICY_AGENT_MISMATCH");
  for (const rule of policy.tool_rules) {
    if (assignment.lineage.some(intent => gradeOf(intent.authority_boundary, rule.mission_action) !== 0) ||
        assignment.delegations.some(event => gradeOf(event.delegated_boundary, rule.mission_action) !== 0)) {
      throw new Error("INTENT_POLICY_ACTION_NOT_AUTONOMOUS");
    }
  }
}
function intentIssues(payload, type) {
  if (type === "mission-wave-plan") return analyzePlan(payload).issues;
  if (type === "commander-intent") {
    const issues = boundaryIssues(payload.authority_boundary, "$.authority_boundary");
    if ((payload.agent_id === "USER") !== (payload.parent_intent_id === null) || payload.parent_intent_id === payload.id ||
        new Set(payload.key_tasks.map(task => task.task_id)).size !== payload.key_tasks.length ||
        new Set(payload.key_tasks.map(task => task.owner_agent_id)).size !== payload.key_tasks.length) {
      issues.push(problem("INTENT_LOCAL_IDENTITY_INVALID", "Only USER is a root; each key-task commitment has one distinct owner and identity."));
    }
    return issues;
  }
  if (type === "intent-delegation-event") {
    const { schema_version, type: ignoredType, id: ignoredId, ...body } = payload;
    return payload.id !== id("IDE", body) || !same(payload.approval_scope_ref, NONE) ||
      payload.parent_intent_id === payload.child_intent_id || payload.delegator_agent_id === payload.delegate_agent_id
      ? [problem("INTENT_DELEGATION_BINDING_INVALID", "Delegation identity binds its exact fields; approval-bearing scope requires a separate reviewed adapter.")]
      : boundaryIssues(payload.delegated_boundary, "$.delegated_boundary");
  }
  if (type === "agent-context-pack" && payload.schema_version === "0.4") {
    const assignment = payload.intent_assignment, lineage = assignment.lineage, issues = [];
    const first = lineage[0], last = lineage.at(-1);
    if (first.agent_id !== "USER" || first.parent_intent_id !== null || first.id !== assignment.root_intent_id ||
        last.agent_id !== payload.agent_id || assignment.agent_id !== payload.agent_id ||
        assignment.delegations.length !== lineage.length - 1 || new Set(lineage.map(node => node.id)).size !== lineage.length ||
        !same(assignment.assigned_task, last.key_tasks.find(task => task.owner_agent_id === payload.agent_id)) ||
        assignment.assigned_task.task_sha256 !== digest(payload.task)) {
      issues.push(problem("INTENT_CONTEXT_LINEAGE_INVALID", "Context lineage and assigned task must identify this exact receiving agent and task."));
    }
    lineage.forEach((node, index) => {
      issues.push(...intentIssues(node, "commander-intent"));
      if (node.mission_id !== payload.mission_id || node.wave_id !== payload.wave_id || node.plan_id !== payload.plan_ref.artifact_id) {
        issues.push(problem("INTENT_CONTEXT_SCOPE_INVALID", "Every intent node belongs to the exact plan, mission and wave."));
      }
      if (!index) return;
      const parent = lineage[index - 1], event = assignment.delegations[index - 1];
      if (node.parent_intent_id !== parent.id || !same(event, delegation(parent, node)) || node.purpose !== parent.purpose ||
          !same(node.key_tasks, parent.key_tasks) || !includes(node.end_state, parent.end_state) ||
          !includes(node.failure_to_avoid, parent.failure_to_avoid) || !includes(node.constraints, parent.constraints) ||
          universe(node.authority_boundary).some(action => gradeOf(node.authority_boundary, action) < gradeOf(parent.authority_boundary, action))) {
        issues.push(problem("INTENT_CONTEXT_INHERITANCE_INVALID", "Every rendered echelon preserves intent and can only narrow delegated authority."));
      }
    });
    return issues;
  }
  if (type === "intent-continuity-projection") {
    const blocked = payload.issues.some(issue => ["error", "critical"].includes(issue.severity));
    if ((payload.status === "blocked") !== blocked || payload.status === "ready" &&
        (!payload.checked_agents.length || payload.plan_sha256 === "none" || payload.tree_sha256 === "none")) {
      return [problem("INTENT_PROJECTION_STATUS_INVALID", "Readiness must agree with findings and concrete plan/tree commitments.")];
    }
  }
  return [];
}
module.exports = { GRADES, TYPES, NONE, gradeOf, rootIntent, defaultTree, delegation, analyzePlan,
  assignmentForPlan, assertIntentContext, assertIntentPolicy, intentIssues };
