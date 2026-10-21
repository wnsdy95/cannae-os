const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { writeRepositoryArtifact } = require("../repository-artifact-store");
const { captureRequest, compileOrder } = require("../request-order-compiler");
const { REQUEST_TEXT, completeAnalysis } = require("../request-order-compiler-fixtures/support");
const { ADOPTION_AUTHORITY, NONE, decisionOption } = require("../order-adoption-contract");
const { proposeOrder, retainOrderEvidence, decideOrder } = require("../order-adoption-controller");
const { inputDigest } = require("../dispatch-runtime-controller");
const clone = value => JSON.parse(JSON.stringify(value));
const sample = name => clone(require(`../sample-payloads/valid-${name}.json`));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}
function read(env, ref) { return JSON.parse(fs.readFileSync(path.join(env.options.artifactRoot, ref.relative_path))); }
function optionsAt(env, seconds) { return { ...env.options, now: new Date(env.epoch + seconds * 1000).toISOString() }; }
function persist(env, kind, payload, seconds = 50, overrides = {}) {
  const result = writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
    missionId: env.plan.mission_id, waveId: env.plan.wave_id, kind, artifactId: payload.id, payload,
    createdAt: optionsAt(env, seconds).now, ...overrides });
  return { artifact_id: payload.id, relative_path: result.relative_path, sha256: result.sha256 };
}
function environment(epoch = Date.parse("2026-09-29T16:00:00.000Z"), validForSeconds = 3600) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-adoption-"));
  const repository = path.join(root, "repo"); fs.mkdirSync(repository);
  run("git", ["init", "-q"], repository);
  run("git", ["config", "user.name", "Fixture"], repository);
  run("git", ["config", "user.email", "fixture@example.com"], repository);
  fs.writeFileSync(path.join(repository, "README.md"), "Order adoption fixture\n");
  run("git", ["add", "README.md"], repository); run("git", ["commit", "-qm", "fixture"], repository);
  const env = { root, epoch, options: { repository, artifactRoot: path.join(root, "proof"), doctrineRoot: path.resolve(__dirname, "..") } };
  env.captured = captureRequest({ ...optionsAt(env, 0), mission: "MIS-ADOPTION", wave: "W1", requestId: "MR-ADOPTION", text: REQUEST_TEXT, validForSeconds });
  env.compiled = compileOrder(completeAnalysis(env.captured.artifact_ref, "MIS-ADOPTION"), optionsAt(env, 10));
  env.draft = read(env, env.compiled.artifact_ref);
  const order = env.draft.opord;
  env.plan = { ...sample("mission-wave-plan"), schema_version: "0.2", id: "MWP-ADOPTION", mission_id: "MIS-ADOPTION",
    objective: order.mission.statement, success_conditions: order.mission.target_end_state, failure_conditions: order.intent.failure_to_avoid,
    constraints: order.situation.constraints, created_at: optionsAt(env, 10).now, valid_until: env.draft.expires_at };
  env.plan.adaptive_work.enabled = false;
  env.plan.agents = order.execution.tasks.map(task => ({ ...sample("mission-wave-plan").agents[0], agent_id: `agent-${task.assigned_to}`,
    operational_role: task.assigned_to, task: task.task, context_scope: env.draft.classification,
    allowed_actions: order.command_and_signal.authority.requested,
    approval_required: [...new Set([...task.retained_user_decisions, ...order.command_and_signal.authority.approval_required])],
    prohibited_actions: order.command_and_signal.authority.prohibited }));
  env.plan.order_binding = { draft_ref: env.compiled.artifact_ref,
    task_assignments: order.execution.tasks.map((task, index) => ({ task_order_id: task.id, agent_id: env.plan.agents[index].agent_id })) };
  env.toolInput = { command: "git status --short" };
  env.policies = env.plan.agents.map(agent => ({ schema_version: "0.1", type: "DispatchToolPolicy", id: `DTP-${agent.agent_id}`,
    mission_id: env.plan.mission_id, wave_id: env.plan.wave_id, agent_id: agent.agent_id, provider: "codex", default_decision: "deny",
    tool_rules: [{ rule_id: "DTR-READ", mission_action: agent.allowed_actions[0], tool_name: "Bash", operation_class: "process_execute",
      input_match: { mode: "exact_sha256", allowed_sha256: [inputDigest(env.toolInput)] }, max_uses: 2 }],
    max_total_admissions: 2, lease_ttl_seconds: 600,
    repository_state: { require_head_match: true, require_serial_state_chain: true, require_clean_start: true },
    authority: { human_final_decision_authority: "USER", self_approval_prohibited: true, release_authorized: false },
    approved_at: env.plan.created_at, valid_until: env.plan.valid_until }));
  env.plan.dispatch_control = { required: true, enforcement_level: "guardrail", gateway_exclusive: false,
    policy_authorizations: env.policies.map(policy => ({ agent_id: policy.agent_id, provider: policy.provider,
      policy_id: policy.id, draft_sha256: inputDigest(policy) })) };
  env.request = { schema_version: "0.1", type: "OrderAdoptionProposalRequest", id: "OAPR-ADOPTION",
    mission_id: env.plan.mission_id, wave_id: env.plan.wave_id, plan: env.plan, ...ADOPTION_AUTHORITY };
  return env;
}
function propose(env) { env.proposed = proposeOrder(env.request, optionsAt(env, 20)); return env.proposed; }
function brief(env, index) {
  const agent = env.plan.agents[index], task = env.draft.opord.execution.tasks[index], order = env.draft.opord;
  return { schema_version: "0.1", type: "OrderBackbrief", id: `OBB-${agent.agent_id}`, mission_id: env.plan.mission_id,
    wave_id: env.plan.wave_id, proposal_ref: env.proposed.proposal_ref, agent_id: agent.agent_id,
    backbrief: { ...sample("backbrief"), id: `BB-${agent.agent_id}`, mission_id: env.plan.mission_id, parent_order: env.proposed.proposal.id,
      task_order: task.id, actor: agent.operational_role, classification: env.draft.classification,
      understanding: { commander_intent: order.intent.purpose, assigned_task: task.task, purpose: task.purpose,
        end_state: env.plan.success_conditions, constraints: env.plan.constraints },
      planned_actions: agent.allowed_actions, stop_conditions: env.plan.failure_conditions,
      approval_awareness: { approval_required_actions: agent.approval_required, prohibited_actions: agent.prohibited_actions, commander_decision_needed: false },
      assumptions: order.situation.assumptions, requested_clarifications: [], created_at: optionsAt(env, 30).now },
    task_acknowledgement: task, ...ADOPTION_AUTHORITY };
}
function retainBriefs(env) {
  env.briefs = env.plan.agents.map((_, index) => brief(env, index));
  env.briefRefs = env.briefs.map(value => retainOrderEvidence(value, optionsAt(env, 30), "order-backbriefs").artifact_ref);
  return env.briefs;
}
function rehearsal(env) {
  return { schema_version: "0.1", type: "OrderRehearsal", id: "ORH-ADOPTION", mission_id: env.plan.mission_id, wave_id: env.plan.wave_id,
    proposal_ref: env.proposed.proposal_ref, backbrief_refs: env.briefRefs, agent_sequence: env.plan.agents.map(agent => agent.agent_id),
    rehearsal: { ...sample("rehearsal"), id: "RH-ADOPTION", mission_id: env.plan.mission_id, parent_order: env.proposed.proposal.id,
      backbriefs: env.briefs.map(value => value.backbrief.id), classification: env.draft.classification,
      sequence: env.draft.opord.execution.tasks.map((task, index) => ({ step: index + 1, actor: task.assigned_to, action: task.task,
        expected_result: task.deliverables.join("\n"), evidence_required: task.verification })),
      friction_points: [], decision_points: [], required_changes: [], created_at: optionsAt(env, 40).now }, ...ADOPTION_AUTHORITY };
}
function rehearse(env) {
  env.rehearsal = rehearsal(env);
  env.rehearsalRef = retainOrderEvidence(env.rehearsal, optionsAt(env, 40), "order-rehearsals").artifact_ref;
}
function decisionRequest(env, disposition = "approve") {
  return { schema_version: "0.1", type: "OrderAdoptionDecisionRequest", id: "OADR-ADOPTION", mission_id: env.plan.mission_id,
    wave_id: env.plan.wave_id, proposal_ref: env.proposed.proposal_ref, backbrief_refs: env.briefRefs || [],
    rehearsal_ref: env.rehearsalRef || { ...NONE }, disposition, decision_ref: { ...NONE }, ...ADOPTION_AUTHORITY };
}
function decision(env, request) {
  const option = decisionOption(request);
  return { ...sample("decision-log"), id: "DL-ADOPTION", mission_id: env.plan.mission_id, decided_at: optionsAt(env, 50).now,
    decision_maker: "USER", decision_type: "scope", options_considered: [option], chosen_option: option,
    question: "Synthetic fixture: adopt this exact plan?", rationale: "Synthetic test only; no real USER authorization.",
    authority_basis: { basis_type: "retained_authority", reference: env.proposed.proposal.id, summary: "Synthetic USER fixture." },
    affected_artifacts: [request.proposal_ref, ...request.backbrief_refs,
      ...(request.rehearsal_ref.artifact_id === "none" ? [] : [request.rehearsal_ref])].map(ref => ref.relative_path) };
}
function adopt(env) {
  propose(env); retainBriefs(env); rehearse(env);
  env.decisionRequest = decisionRequest(env);
  env.decision = decision(env, env.decisionRequest);
  env.decisionRequest.decision_ref = persist(env, "decision-logs", env.decision);
  env.adopted = decideOrder(env.decisionRequest, optionsAt(env, 60));
  return env.adopted;
}
module.exports = { clone, run, sample, read, optionsAt, persist, environment, propose, brief, retainBriefs,
  rehearsal, rehearse, decisionRequest, decision, adopt };
