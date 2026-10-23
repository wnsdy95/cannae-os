const { z } = require("zod");
const { digest, same } = require("./order-intake-contract");
const { NONE } = require("./order-adoption-contract");
const FLAGS = { execution_authorized: z.literal(false), release_authorized: z.literal(false), human_final_decision_authority: z.literal("USER") };
const text = z.string().min(1).max(8192), id = z.string().regex(/^[A-Z]+-[A-Za-z0-9_-]+$/);
const safe = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/), hex = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.strictObject({ artifact_id: z.string(), relative_path: text, sha256: z.string() });
const strings = z.array(text).min(1).max(256);
const exact = z.strictObject({ mode: z.literal("exact_sha256"), allowed_sha256: z.array(hex).min(1).max(256) });
const paths = mode => z.strictObject({ mode: z.literal(mode), path_fields: z.array(z.string().min(1).max(1024).regex(/^(?:\/(?:[^~/]|~[01])*)+$/)).min(1).max(64),
  allowed_path_prefixes: z.array(z.string().min(1).max(1024)).min(1).max(256) });
const rule = z.strictObject({ rule_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/), mission_action: z.string().min(1).max(1024),
  tool_name: z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:+/-]*$/),
  operation_class: z.enum(["observe", "repository_read", "repository_write", "process_execute"]),
  input_match: z.union([exact, paths("path_prefix"), paths("patch_paths")]), max_uses: z.number().int().min(1).max(1000000) });
const template = z.strictObject({ provider: z.enum(["codex", "claude_code"]), tool_rules: z.array(rule).min(1).max(256),
  max_total_admissions: z.number().int().min(1).max(1000000), lease_ttl_seconds: z.number().int().min(1).max(86400),
  repository_state: z.strictObject({ require_head_match: z.literal(true), require_serial_state_chain: z.literal(true), require_clean_start: z.literal(true) }) });
const candidate = z.strictObject({ agent_id: safe, operational_role: z.enum(["COS", "S2", "S3", "S4", "S6", "RED_TEAM", "EVALUATOR", "EXECUTOR", "RECORDER"]),
  department: z.enum(["coordination", "research", "intelligence", "operations", "effects", "sustainment", "protection", "systems", "red_team", "recorder", "maintenance"]),
  model_billet_id: text, delegated_authority: z.enum(["scoped-execution", "source-verification", "release-review", "risk-review", "maintenance", "coordination", "document-routing"]),
  allowed_task_ids: z.array(id).min(1).max(64), allowed_actions: strings, approval_required: strings, prohibited_actions: strings,
  enabled: z.boolean(), estimated_cost_units: z.number().int().min(0).max(1000000), policy_template: template });
const jsonObject = z.record(z.string(), z.json());
const REQUEST = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("BoundedPlanningRequest"), id, mission_id: id, wave_id: safe,
  draft_ref: ref, mode: z.enum(["initial", "revision"]), parent_plan_ref: ref, parent_adoption_ref: ref,
  parent_policy_drafts: z.array(jsonObject).max(64),
  envelope: z.strictObject({ title: text, risk_level: z.enum(["low", "medium", "high", "critical"]), roe_class: z.enum(["Green", "Amber", "Red"]),
    release_target: z.enum(["internal_working", "internal_handoff", "final_output", "external_release"]),
    candidates: z.array(candidate).min(1).max(64), limits: z.strictObject({ max_agents: z.number().int().min(1).max(64),
      max_estimated_cost_units: z.number().int().min(0).max(64000000), max_search_states: z.number().int().min(1).max(4096),
      valid_for_seconds: z.number().int().min(1).max(3600) }),
    controls: z.strictObject({ model_assignment: jsonObject, adaptive_work: jsonObject, method_control: jsonObject.optional() }) }), ...FLAGS });
const PROPOSAL = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("BoundedPlanningProposal"), id, mission_id: id, wave_id: safe,
  request: REQUEST, request_sha256: hex, parent_plan_sha256: z.union([hex, z.literal("none")]),
  parent_budget_remaining: jsonObject.nullable(),
  status: z.enum(["ready_for_review", "blocked"]), plan: jsonObject.nullable(), policy_drafts: z.array(jsonObject).max(64),
  selected_agent_ids: z.array(safe).max(64), estimated_cost_units: z.number().int().nonnegative().nullable(), block_reasons: z.array(text).max(64),
  search: z.strictObject({ states: z.number().int().nonnegative(), complete_allocations: z.number().int().nonnegative(), limit_reached: z.boolean() }),
  observed_manifest: z.strictObject({ revision: z.number().int().nonnegative(), sha256: hex }), recorded_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }), classification: z.enum(["public", "internal", "restricted"]),
  generation_class: z.literal("bounded_structural_synthesis_v1"), model_invocations: z.literal(0), semantic_completeness_proven: z.literal(false),
  readiness_attested: z.literal(false), provider_cost_cap_enforced: z.literal(false), ...FLAGS });
const TYPES = new Set(["bounded-planning-request", "bounded-planning-proposal"]);
const unique = list => [...new Set(list)], clone = value => JSON.parse(JSON.stringify(value));
function requestIssues(value) {
  const problems = [], need = (condition, code) => { if (!condition) problems.push(code); };
  const concrete = reference => /^[A-Z]+-[A-Za-z0-9_-]+$/.test(reference.artifact_id) && /^[a-f0-9]{64}$/.test(reference.sha256) && reference.relative_path !== "none";
  need(concrete(value.draft_ref), "PLANNING_DRAFT_REFERENCE_INVALID");
  need(value.mode === "initial" ? same(value.parent_plan_ref, NONE) && same(value.parent_adoption_ref, NONE) :
    concrete(value.parent_plan_ref) && concrete(value.parent_adoption_ref), "PLANNING_PARENT_REFERENCE_INVALID");
  need(value.mode !== "initial" || value.parent_policy_drafts.length === 0, "PLANNING_PARENT_REFERENCE_INVALID");
  need(unique(value.envelope.candidates.map(item => item.agent_id)).length === value.envelope.candidates.length, "PLANNING_DUPLICATE_AGENT");
  for (const item of value.envelope.candidates) {
    need(unique(item.allowed_task_ids).length === item.allowed_task_ids.length && unique(item.policy_template.tool_rules.map(rule => rule.rule_id)).length === item.policy_template.tool_rules.length,
      "PLANNING_DUPLICATE_TASK_OR_RULE");
    need(!["USER", "COMMANDER"].includes(item.agent_id) && item.allowed_actions.every(action => !item.approval_required.includes(action) && !item.prohibited_actions.includes(action)) &&
      item.policy_template.tool_rules.every(rule => item.allowed_actions.includes(rule.mission_action)), "PLANNING_AUTHORITY_CONFLICT");
    need(item.policy_template.tool_rules.every(rule => {
      const match = rule.input_match;
      return match.mode === "exact_sha256" ? unique(match.allowed_sha256).length === match.allowed_sha256.length :
        unique(match.path_fields).length === match.path_fields.length && unique(match.allowed_path_prefixes).length === match.allowed_path_prefixes.length;
    }), "PLANNING_DUPLICATE_INPUT_MATCH");
  }
  return unique(problems);
}
function issues(value, type) {
  if (!TYPES.has(type)) return [];
  const add = code => ({ severity: "critical", code, path: "$", message: code });
  if (!(type === "bounded-planning-request" ? REQUEST : PROPOSAL).safeParse(value).success) return [add("PLANNING_SCHEMA_INVALID")];
  const request = type === "bounded-planning-request" ? value : value.request, problems = requestIssues(request);
  if (type === "bounded-planning-proposal") {
    const { id, ...body } = value;
    if (id !== `BPP-${digest(body).slice(0, 32)}` || value.request_sha256 !== digest(request) || value.mission_id !== request.mission_id || value.wave_id !== request.wave_id) problems.push("PLANNING_PROPOSAL_BINDING_INVALID");
    if (!(Date.parse(value.recorded_at) < Date.parse(value.expires_at)) || Date.parse(value.expires_at) - Date.parse(value.recorded_at) > 3600000) problems.push("PLANNING_VALIDITY_INVALID");
    if (value.status === "ready_for_review" ? !value.plan || value.block_reasons.length || value.search.limit_reached || value.estimated_cost_units === null ||
      value.policy_drafts.length !== value.selected_agent_ids.length || !value.selected_agent_ids.length :
      value.plan !== null || !value.block_reasons.length || value.policy_drafts.length || value.selected_agent_ids.length || value.estimated_cost_units !== null) problems.push("PLANNING_STATUS_INVALID");
  }
  return unique(problems).map(add);
}
function allocate(request, draft, budgets) {
  const tasks = draft.opord.execution.tasks, { candidates, limits } = request.envelope;
  const search = { states: 0, complete_allocations: 0, limit_reached: false }; let best = null;
  const choices = tasks.map(task => candidates.filter(item => item.enabled && item.operational_role === task.assigned_to && item.allowed_task_ids.includes(task.id) &&
    (!budgets || budgets[item.agent_id]?.total > 0 && item.policy_template.tool_rules.some(rule => budgets[item.agent_id].rules[rule.rule_id] > 0)))
    .sort((a, b) => a.estimated_cost_units - b.estimated_cost_units || (a.agent_id < b.agent_id ? -1 : a.agent_id > b.agent_id ? 1 : 0)));
  function visit(index, selected, used, cost) {
    if (search.states >= limits.max_search_states) { search.limit_reached = true; return; } search.states++;
    if (index === tasks.length) { search.complete_allocations++; if (!best || cost < best.cost) best = { selected: [...selected], cost }; return; }
    for (const item of choices[index]) {
      if (used.has(item.agent_id) || cost + item.estimated_cost_units > limits.max_estimated_cost_units) continue;
      used.add(item.agent_id); selected.push(item); visit(index + 1, selected, used, cost + item.estimated_cost_units); selected.pop(); used.delete(item.agent_id);
      if (search.limit_reached) return;
    }
  }
  if (tasks.length <= limits.max_agents && tasks.length <= 64) visit(0, [], new Set(), 0);
  const block_reasons = tasks.length > limits.max_agents || tasks.length > 64 ? ["PLANNING_AGENT_LIMIT"] :
    search.limit_reached ? ["PLANNING_SEARCH_LIMIT"] : !best ? ["PLANNING_NO_FEASIBLE_ALLOCATION"] : [];
  return { search, best: block_reasons.length ? null : best, block_reasons };
}
function synthesize(request, draft, now, parent = null, budgets = null) {
  const order = draft.opord, envelope = request.envelope, result = allocate(request, draft, budgets);
  if (!result.best) return { ...result, plan: null, policy_drafts: [], selected_agent_ids: [], estimated_cost_units: null };
  const until = new Date(Math.min(Date.parse(draft.expires_at), Date.parse(now) + envelope.limits.valid_for_seconds * 1000,
    parent ? Date.parse(parent.valid_until) : Infinity)).toISOString();
  const agents = result.best.selected.map((candidate, index) => ({ agent_id: candidate.agent_id, operational_role: candidate.operational_role,
    department: candidate.department, model_billet_id: candidate.model_billet_id, delegated_authority: candidate.delegated_authority,
    task: order.execution.tasks[index].task, allowed_actions: clone(candidate.allowed_actions),
    approval_required: unique([...candidate.approval_required, ...order.command_and_signal.authority.approval_required, ...order.execution.tasks[index].retained_user_decisions]),
    prohibited_actions: unique([...candidate.prohibited_actions, ...order.command_and_signal.authority.prohibited]), context_scope: draft.classification }));
  const policy_drafts = result.best.selected.map(candidate => ({ schema_version: "0.1", type: "DispatchToolPolicy",
    id: `DTP-${digest([request, candidate.agent_id]).slice(0, 32)}`, mission_id: request.mission_id, wave_id: request.wave_id, agent_id: candidate.agent_id,
    default_decision: "deny", ...clone(candidate.policy_template),
    ...(budgets ? { max_total_admissions: Math.min(candidate.policy_template.max_total_admissions, budgets[candidate.agent_id].total),
      tool_rules: candidate.policy_template.tool_rules.filter(rule => budgets[candidate.agent_id].rules[rule.rule_id] > 0)
        .map(rule => ({ ...clone(rule), max_uses: Math.min(rule.max_uses, budgets[candidate.agent_id].rules[rule.rule_id]) })) } : {}),
    authority: { human_final_decision_authority: "USER", self_approval_prohibited: true, release_authorized: false }, approved_at: now, valid_until: until }));
  const plan = { schema_version: "0.2", type: "MissionWavePlan", id: `MWP-${digest(request).slice(0, 32)}`, mission_id: request.mission_id, wave_id: request.wave_id,
    title: envelope.title, objective: order.mission.statement,
    success_conditions: unique([...(parent?.success_conditions || []), ...order.mission.target_end_state]),
    failure_conditions: unique([...(parent?.failure_conditions || []), ...order.intent.failure_to_avoid]),
    constraints: unique([...(parent?.constraints || []), ...order.situation.constraints]),
    mission_profile: { classification: draft.classification, risk_level: envelope.risk_level, roe_class: envelope.roe_class, release_target: envelope.release_target },
    agents, ...clone(envelope.controls),
    authority: { human_final_decision_authority: "USER", routing_required_every_wave: true, repository_artifacts_required: true,
      approval_required_for_scope_change: true, approval_required_for_commit: true, approval_required_for_push: true,
      approval_required_for_merge: true, approval_required_for_release: true, self_approval_prohibited: true },
    dispatch_control: { required: true, enforcement_level: "guardrail", gateway_exclusive: false, policy_authorizations: policy_drafts.map(policy => ({ agent_id: policy.agent_id,
      provider: policy.provider, policy_id: policy.id, draft_sha256: require("./dispatch-runtime-controller").inputDigest(policy) })) },
    order_binding: { draft_ref: clone(request.draft_ref), task_assignments: agents.map((agent, index) => ({ task_order_id: order.execution.tasks[index].id, agent_id: agent.agent_id })) },
    created_at: now, valid_until: until };
  plan.intent_continuity = require("./intent-continuity-contract").defaultTree(plan);
  return { search: result.search, block_reasons: [], plan, policy_drafts, selected_agent_ids: agents.map(item => item.agent_id), estimated_cost_units: result.best.cost };
}
module.exports = { REQUEST, PROPOSAL, TYPES, requestIssues, issues, allocate, synthesize };
