#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const s = require("./method-control-fixtures/support"), adapter = require("./dispatch-hook-adapter"), gate = require("./method-deviation-gate");
const cli = require("./method-control-runner");
const policy = () => ({ schema_version: "0.2", continuation: { mode: "observed_session_lineage", max_handoffs: 1 } });
async function transfer(env, source, sessionId) {
  const oldFile = env.privateFile, oldLease = env.leaseId;
  const interrupted = s.dispatch.interruptLease(env.options, oldLease);
  env.handoffs = (env.handoffs || 0) + 1;
  const nextFile = path.join(env.root, `private-next-${env.handoffs}`, "enrollment.json");
  const prepared = s.broker.prepareContinuation(oldFile, interrupted.checkpoint_ref, nextFile, source);
  env.privateFile = nextFile; env.prepared = prepared; env.enrolled = prepared; env.actor = { ...env.actor, sessionId };
  const client = await s.connect(env);
  await s.withEnvironment(env, () => adapter.handle(env.actor.provider, { hook_event_name: "SessionStart", cwd: env.options.repository, session_id: sessionId, source }));
  env.issued = s.dispatch.resumeLease(env.options, oldLease, { sessionId, providerAgentId: env.actor.providerAgentId });
  env.leaseId = env.issued.lease_ref.artifact_id; env.enrolled = s.broker.enroll(env.options, env.leaseId, nextFile);
  return { client, oldFile, oldLease, interrupted, prepared };
}
async function main() {
  let passed = 0;
  const pass = name => { passed++; console.log(`PASS ${name}`); };
  const env = s.environment({ broker: { schema_version: "0.2", max_requests: 2, continuation: { mode: "observed_session_lineage", max_handoffs: 1 } } });
  try {
    const original = s.broker.load(env.privateFile), originalFile = env.privateFile, originalBytes = fs.readFileSync(originalFile);
    const first = await s.connect(env);
    await s.call(env, first, "method_status", { request_id: "before-interrupt" });
    await s.readTask(env, s.inputs.planned, "first-read");
    const deniedFile = path.join(env.root, "private-next", "denied.json");
    assert.throws(() => s.broker.prepareContinuation(originalFile, env.issued.checkpoint_ref, deniedFile, "resume"), /METHOD_CONTROL_INTERRUPTION_REQUIRED/);
    assert.equal(fs.existsSync(path.dirname(deniedFile)), false);
    const interrupted = s.dispatch.interruptLease(env.options, env.leaseId);
    assert.equal(interrupted.status, "interrupted");
    assert.throws(() => s.broker.prepareContinuation(originalFile, env.issued.checkpoint_ref, deniedFile, "resume"), /METHOD_CONTROL_INTERRUPTION_REQUIRED/);
    assert.equal(fs.existsSync(path.dirname(deniedFile)), false);
    const nextFile = path.join(env.root, "private-next", "enrollment.json");
    const checkpointFile = path.join(env.root, "interruption-ref.json");
    fs.writeFileSync(checkpointFile, JSON.stringify(interrupted.checkpoint_ref));
    const args = ["prepare-continuation", "--previous-file", originalFile, "--checkpoint-ref", checkpointFile,
      "--private-file", nextFile, "--source", "resume"];
    assert.throws(() => cli.main([...args, "--repository", env.options.repository]), /Unsupported, duplicate or incomplete/);
    assert.throws(() => cli.main([...args, "--now", new Date().toISOString()]), /Unsupported, duplicate or incomplete/);
    const prepared = cli.main(args);
    assert.equal(prepared.execution_authorized, false); assert.equal(prepared.continuation_authorized, false);
    assert.equal(prepared.expires_at, original.slot.payload.expires_at);
    assert.deepEqual(fs.readFileSync(originalFile), originalBytes);
    assert.throws(() => s.broker.prepareContinuation(originalFile, interrupted.checkpoint_ref, deniedFile, "resume"), /METHOD_CONTROL_CHANNEL_SUPERSEDED/);
    pass("only an exact interrupted checkpoint creates one new slot, retaining the root deadline and original private file");
    assert.throws(() => s.broker.preflight(originalFile, env.options, env.actor, s.hook(env, "method_status", { request_id: "old-session" })), /METHOD_CONTROL_CHANNEL_SUPERSEDED/);
    const previousLease = env.leaseId;
    env.privateFile = nextFile; env.prepared = prepared; env.enrolled = prepared;
    env.actor = { ...env.actor, sessionId: "resumed-method-session" };
    const next = await s.connect(env, { pin: "2026-07-28" });
    assert.equal((await next.listTools()).tools.length, 3);
    const waiting = await next.callTool({ name: "method_status", arguments: { request_id: "not-enrolled" } });
    assert.equal(waiting.isError, true);
    assert.throws(() => s.broker.observeSession(nextFile, env.options, env.actor, { source: "startup" }), /METHOD_CONTROL_START_SOURCE_MISMATCH/);
    await s.withEnvironment(env, () => {
      const observed = adapter.handle(env.actor.provider, { hook_event_name: "SessionStart", cwd: env.options.repository,
        session_id: env.actor.sessionId, source: "resume" });
      assert(observed.hookSpecificOutput.additionalContext.includes("Await trusted operator enrollment"));
    });
    const described = cli.main(["describe", "--private-file", nextFile]);
    assert.equal(described.session_observation.session_binding.session_id, env.actor.sessionId);
    assert.equal(described.session_observation.source, "resume"); assert.equal(described.execution_authorized, false);
    env.issued = s.dispatch.resumeLease(env.options, previousLease, { sessionId: env.actor.sessionId, providerAgentId: env.actor.providerAgentId });
    env.leaseId = env.issued.lease_ref.artifact_id;
    assert.throws(() => s.dispatch.admitToolRequest(env.options, env.actor, { hook_event_name: "PreToolUse", tool_name: "Read",
      tool_use_id: "before-resumed-enrollment", tool_input: s.inputs.safeguard }), /METHOD_CONTROL_ENROLLMENT_REQUIRED/);
    env.enrolled = s.broker.enroll(env.options, env.leaseId, nextFile);
    assert.throws(() => s.broker.preflight(nextFile, env.options, env.actor,
      s.hook(env, "method_status", { request_id: "before-interrupt" })), /METHOD_CONTROL_REQUEST_REPLAY/);
    const status = await s.call(env, next, "method_status", { request_id: "after-interrupt" });
    assert.deepEqual(status.result.completed_steps, ["inspect"]);
    assert.equal(status.result.next_step.step_id, "verify");
    assert.equal(s.broker.load(nextFile).enrollment.payload.expires_at, original.enrollment.payload.expires_at);
    pass("actual SDK discovery, synthetic resumed-session observation and explicit dispatch resume preserve completed work before the new enrollment");
    assert.throws(() => s.broker.preflight(nextFile, env.options, env.actor, s.hook(env, "method_status", { request_id: "budget-reset" })), /METHOD_CONTROL_BUDGET_EXHAUSTED/);
    await s.readTask(env, s.inputs.safeguard, "resumed-safeguard");
    assert.equal(env.readCount, 2);
    assert.equal(s.dispatch.completeLease(env.options, env.leaseId).status, "completed");
    const records = gate.load(env.options).manifest.artifacts;
    assert.equal(records.filter(item => item.kind === "method-control-requests").length, 2);
    assert.equal(records.filter(item => item.kind === "method-control-launch-slots").length, 2);
    pass("resumption cannot reset the shared request budget or repeat the completed task read");
  } finally { await s.cleanup(env); }
  const twice = s.environment({ broker: { ...policy(), continuation: { mode: "observed_session_lineage", max_handoffs: 2 } } });
  try {
    await s.readTask(twice, s.inputs.planned, "lineage-first-read");
    const first = await transfer(twice, "resume", "first-continuation-session");
    await s.call(twice, first.client, "method_status", { request_id: "first-continuation-status" });
    await s.readTask(twice, s.inputs.safeguard, "lineage-second-read");
    const second = await transfer(twice, "clear", "second-continuation-session");
    const status = await s.call(twice, second.client, "method_status", { request_id: "second-continuation-status" });
    const current = s.broker.load(twice.privateFile);
    assert.deepEqual(status.result.completed_steps, ["inspect", "verify"]);
    assert.equal(status.result.next_step, null); assert.equal(current.family.length, 3);
    assert.equal(current.slot.payload.continuation_index, 2);
    assert.equal(current.enrollment.payload.expires_at, current.rootSlot.payload.expires_at);
    assert.throws(() => s.broker.preflight(twice.privateFile, twice.options, twice.actor,
      s.hook(twice, "method_status", { request_id: "first-continuation-status" })), /METHOD_CONTROL_REQUEST_REPLAY/);
    assert.equal(twice.readCount, 2);
    assert.equal(s.dispatch.completeLease(twice.options, twice.leaseId).status, "completed");
    pass("two explicitly observed handoffs retain the complete linear lineage, completed steps, request history and original expiry");
  } finally { await s.cleanup(twice); }
  for (const [name, provider, configure, reason] of [
    ["whole-policy", "codex", value => { value.policies[0].max_total_admissions = 1; }, "LEASE_REQUEST_BUDGET_EXHAUSTED"],
    ["per-rule", "claude_code", value => { value.policies[0].tool_rules[0].max_uses = 1; }, "TOOL_RULE_BUDGET_EXHAUSTED"]
  ]) {
    const value = s.environment({ provider, broker: policy(), configure });
    try {
      await s.readTask(value, s.inputs.planned, "budget-first-read");
      const previous = await transfer(value, provider === "codex" ? "resume" : "fork", value.actor.sessionId);
      const denied = s.dispatch.admitToolRequest(value.options, value.actor, { hook_event_name: "PreToolUse", tool_name: "Read",
        tool_use_id: "cannot-reset-task-budget", tool_input: s.inputs.safeguard });
      assert.equal(denied.decision, "deny"); assert(denied.reason_codes.includes(reason), JSON.stringify(denied));
      assert.equal(value.readCount, 1); assert.equal(gate.driftDenials(gate.load(value.options), value.plan.mission_id).length, 0);
      assert.throws(() => s.broker.preflight(previous.oldFile, value.options, value.actor,
        s.hook(value, "method_status", { request_id: "same-session-old-file" })), /METHOD_CONTROL_CHANNEL_SUPERSEDED/);
      const paused = s.dispatch.interruptLease(value.options, value.leaseId), destination = path.join(value.root, "forbidden-extra", "enrollment.json");
      assert.throws(() => s.broker.prepareContinuation(value.privateFile, paused.checkpoint_ref, destination, "clear"), /METHOD_CONTROL_CONTINUATION_BUDGET_EXHAUSTED/);
      assert.equal(fs.existsSync(path.dirname(destination)), false);
      assert.equal(s.dispatch.revokeLease(value.options, value.leaseId).status, "revoked");
      pass(`${name} task use limits survive explicit same-session resume, and exhausted handoff limits create no private state`);
    } finally { await s.cleanup(value); }
  }
  const pending = s.environment({ broker: policy() });
  try {
    const client = await s.connect(pending);
    const proposal = await s.call(pending, client, "method_propose", { request_id: "pending-proposal", step_id: "inspect", method_id: "short_read", rationale: "Synthetic pending-report handoff." });
    await s.readTask(pending, s.inputs.after, "pending-real-read");
    const paused = s.dispatch.interruptLease(pending.options, pending.leaseId), destination = path.join(pending.root, "pending-next", "enrollment.json");
    assert.throws(() => s.broker.prepareContinuation(pending.privateFile, paused.checkpoint_ref, destination, "clear"), /METHOD_CONTROL_REPORT_PENDING/);
    assert.equal(fs.existsSync(path.dirname(destination)), false);
    await s.call(pending, client, "method_report_after", { request_id: "settled-after-report", deviation_ref: proposal.result.deviation_ref });
    assert.equal(s.dispatch.activeLease(pending.options, pending.actor).code, "LEASE_INTERRUPTED");
    const prepared = s.broker.prepareContinuation(pending.privateFile, paused.checkpoint_ref, destination, "clear");
    assert.equal(prepared.execution_authorized, false); assert.equal(pending.readCount, 1);
    const expired = path.join(pending.root, "expired-next", "enrollment.json");
    assert.throws(() => s.broker.prepareContinuation(pending.privateFile, paused.checkpoint_ref, expired, "clear", { ...pending.options, now: prepared.expires_at }), /METHOD_CONTROL_ENROLLMENT_EXPIRED/);
    assert.equal(fs.existsSync(path.dirname(expired)), false);
    assert.equal(s.dispatch.revokeLease(pending.options, pending.leaseId).status, "revoked");
    pass("an unreported actual result blocks preparation; a delivered late report settles metadata without reviving or extending authority");
  } finally { await s.cleanup(pending); }
  const lost = s.environment({ broker: policy() });
  try {
    const client = await s.connect(lost); await s.readTask(lost, s.inputs.planned, "lost-read");
    const input = { request_id: "lost-before-handoff" };
    await s.withEnvironment(lost, () => assert.equal(adapter.handle(lost.actor.provider, s.hook(lost, "method_status", input)), null));
    const response = await client.callTool({ name: "method_status", arguments: input }); assert.notEqual(response.isError, true);
    const paused = s.dispatch.interruptLease(lost.options, lost.leaseId), target = path.join(lost.root, "lost-next", "enrollment.json");
    assert.throws(() => s.broker.prepareContinuation(lost.privateFile, paused.checkpoint_ref, target, "resume"), /METHOD_CONTROL_DELIVERY_UNRESOLVED/);
    assert.equal(fs.existsSync(path.dirname(target)), false);
    assert.equal(s.broker.reconcile(lost.privateFile, response.structuredContent.request_ref).execution_authorized, false);
    assert.equal(s.broker.prepareContinuation(lost.privateFile, paused.checkpoint_ref, target, "resume").execution_authorized, false);
    assert.equal(lost.readCount, 1); assert.equal(s.dispatch.revokeLease(lost.options, lost.leaseId).status, "revoked");
    pass("a lost native metadata callback blocks handoff until its real receipt is neutrally reconciled without repeating work");
  } finally { await s.cleanup(lost); }
  const unknown = s.environment({ broker: policy() });
  try {
    const pre = { hook_event_name: "PreToolUse", cwd: unknown.options.repository, session_id: unknown.actor.sessionId,
      tool_name: "Read", tool_use_id: "unknown-effect-read", tool_input: s.inputs.planned };
    await s.withEnvironment(unknown, () => assert.equal(adapter.handle(unknown.actor.provider, pre), null));
    fs.readFileSync(path.join(unknown.options.repository, "README.md")); unknown.readCount++;
    await s.withEnvironment(unknown, () => assert(adapter.handle(unknown.actor.provider,
      { ...pre, hook_event_name: "PostToolUseFailure", error: "Synthetic result transport failure." })));
    const target = path.join(unknown.root, "unknown-next", "enrollment.json");
    assert.throws(() => s.broker.prepareContinuation(unknown.privateFile, unknown.issued.checkpoint_ref, target, "resume"), /METHOD_CONTROL_INTERRUPTION_REQUIRED/);
    const state = s.dispatch.dispatchStatus(unknown.options).leases.find(item => item.lease_id === unknown.leaseId);
    assert(state.unresolved_tool_effects > 0); assert.equal(unknown.readCount, 1); assert.equal(fs.existsSync(path.dirname(target)), false);
    pass("actual failed-result checkpoints retain unknown-effect holds and cannot be converted into a continuation slot");
  } finally { await s.cleanup(unknown); }
  for (const attack of ["branch", "deadline"]) {
    const value = s.environment({ broker: { ...policy(), continuation: { mode: "observed_session_lineage", max_handoffs: 2 } } });
    try {
      await s.readTask(value, s.inputs.planned, "integrity-first-read");
      await transfer(value, "resume", "integrity-resumed-session");
      const current = s.broker.load(value.privateFile), clone = structuredClone(current.slot.payload);
      clone.credential_sha256 = "a".repeat(64); clone.recorded_at = new Date().toISOString();
      if (attack === "deadline") {
        clone.continuation_index = 2; clone.predecessor_enrollment_ref = current.enrollment.ref;
        clone.expires_at = new Date(Date.parse(current.rootSlot.payload.expires_at) + 60000).toISOString();
      }
      const forged = require("./method-control-fixtures/contracts").rekey(clone);
      assert.equal(require("./validator-cli-prototype/validate").validatePayload(forged, "method-control-launch-slot").valid, true);
      require("./repository-artifact-store").writeRepositoryArtifact({ repositoryPath: value.options.repository, artifactRoot: value.options.artifactRoot,
        missionId: value.actor.missionId, waveId: value.actor.waveId, kind: "method-control-launch-slots", artifactId: forged.id,
        payload: forged, createdAt: forged.recorded_at });
      assert.throws(() => s.dispatch.admitToolRequest(value.options, value.actor, { hook_event_name: "PreToolUse", tool_name: "Read",
        tool_use_id: "forged-continuation", tool_input: s.inputs.safeguard }), /METHOD_CONTROL_CONTINUATION_CHAIN_INVALID/);
      assert.equal(value.readCount, 1);
      pass(`a schema-valid raw ${attack} continuation fails the actual work gate before a second task read`);
    } finally { await s.cleanup(value); }
  }
  console.log(JSON.stringify({ total: passed, passed, failed: 0,
    scope: "Actual official SDK stdio and dispatch continuation with synthetic provider hooks; no actual native agent-client startup, semantic mission completion, approval or production claim." }, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
