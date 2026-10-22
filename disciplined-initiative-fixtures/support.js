const fs = require("node:fs"), path = require("node:path");
const support = require("../order-adoption-fixtures/support");
const dispatch = require("../dispatch-runtime-controller");
const { digest } = require("../order-intake-contract");
const { openWave } = require("../skill-mission-controller");
const inputs = Object.freeze({ planned: { file_path: "README.md" }, safeguard: { file_path: "README.md", offset: 1 },
  after: { file_path: "README.md", limit: 1 }, before: { file_path: "README.md", offset: 1, limit: 1 },
  unplanned: { file_path: "other.md" } });
function environment(epoch) {
  const env = support.environment(epoch); env.readCount = 0;
  for (const policy of env.policies) {
    policy.tool_rules[0].tool_name = "Read"; policy.tool_rules[0].operation_class = "repository_read";
    policy.tool_rules[0].input_match.allowed_sha256 = Object.values(inputs).map(dispatch.inputDigest);
    policy.tool_rules[0].max_uses = 8; policy.max_total_admissions = 8;
  }
  env.plan.dispatch_control.policy_authorizations = env.policies.map(policy => ({ agent_id: policy.agent_id, provider: policy.provider,
    policy_id: policy.id, draft_sha256: dispatch.inputDigest(policy) }));
  const method = input => ({ tool_name: "Read", rule_id: "DTR-READ", input_sha256: dispatch.inputDigest(input),
    instructions: `Call Read with this exact JSON input: ${JSON.stringify(input)}. Preserve the reviewed task and every subsequent safeguard.` });
  env.plan.method_control = { schema_version: "0.1", type: "MethodControlBaseline", required: true,
    after_report_due: "before_next_tool_or_completion", max_deviation_age_seconds: 300,
    agents: env.plan.agents.map(agent => ({ agent_id: agent.agent_id,
      task_id: env.plan.order_binding.task_assignments.find(item => item.agent_id === agent.agent_id).task_order_id,
      task_sha256: digest(agent.task), steps: [
        { step_id: "inspect", kind: "work", mission_action: agent.allowed_actions[0], planned: method(inputs.planned), alternatives: [
          { method_id: "short_read", ...method(inputs.after), report_timing: "after" },
          { method_id: "coordinated_read", ...method(inputs.before), report_timing: "before_and_after" }
        ] },
        { step_id: "verify", kind: "safeguard", mission_action: agent.allowed_actions[0], planned: method(inputs.safeguard), alternatives: [] }
      ] })) };
  return env;
}
function start(env) {
  support.adopt(env); env.opened = openWave(env.plan, support.optionsAt(env, 70));
  env.policy = env.policies[0]; dispatch.authorizeDispatchPolicy(support.optionsAt(env, 80), env.policy);
  env.actor = { missionId: env.plan.mission_id, waveId: env.plan.wave_id, agentId: env.policy.agent_id,
    provider: "codex", sessionId: "method-fixture-session", providerAgentId: "main" };
  env.issued = dispatch.issueLease(support.optionsAt(env, 80), env.policy.id,
    { sessionId: env.actor.sessionId, providerAgentId: env.actor.providerAgentId });
  env.leaseId = env.issued.lease_ref.artifact_id; return env;
}
function hook(env, input, id, event = "PreToolUse") {
  return { session_id: env.actor.sessionId, cwd: env.options.repository, hook_event_name: event, tool_name: "Read",
    tool_use_id: id, tool_input: input };
}
function admit(env, input, id, seconds = 100) {
  return dispatch.admitToolRequest(support.optionsAt(env, seconds), env.actor, hook(env, input, id));
}
function complete(env, input, id, seconds = 101, failed = false) {
  const text = fs.readFileSync(path.join(env.options.repository, input.file_path), "utf8"); env.readCount++;
  return dispatch.completeToolRequest(support.optionsAt(env, seconds), env.actor,
    { ...hook(env, input, id, failed ? "PostToolUseFailure" : "PostToolUse"), tool_response: { content: text } });
}
function acknowledge(env, deviation, seconds = 95, mutate = () => {}) {
  const option = `acknowledge_method:${deviation.event.id}`;
  const value = { ...support.sample("decision-log"), id: `DL-METHOD-${seconds}`, mission_id: env.plan.mission_id,
    decision_maker: "USER", decision_type: "scope", status: "complete", decided_at: support.optionsAt(env, seconds).now,
    authority_basis: { basis_type: "retained_authority", reference: deviation.event.id, summary: "Synthetic acknowledgment, not expanded authority." },
    options_considered: [option], chosen_option: option, affected_artifacts: [deviation.artifact_ref.relative_path],
    rationale: "Synthetic fixture only; no actual USER decision." };
  mutate(value); return support.persist(env, "decision-logs", value, seconds);
}
module.exports = { ...support, environment, start, inputs, hook, admit, complete, acknowledge, dispatch };
