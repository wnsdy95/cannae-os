#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs");
const artifactStore = require("./repository-artifact-store"), originalWrite = artifactStore.writeRepositoryArtifact;
let failReceipt = false;
artifactStore.writeRepositoryArtifact = value => {
  if (failReceipt && value.kind === "method-control-receipts") throw new Error("SYNTHETIC_RECEIPT_PUBLICATION_FAILURE");
  return originalWrite(value);
};
const s = require("./method-control-fixtures/support");
const adapter = require("./dispatch-hook-adapter"), runner = require("./method-control-runner");
const gate = require("./method-deviation-gate");
const entries = env => gate.load(env.options).manifest.artifacts;
const count = (env, kind) => entries(env).filter(item => item.kind === kind).length;
async function main() {
  let passed = 0;
  const pass = name => { passed++; console.log(`PASS ${name}`); };
  const env = s.environment({ enroll: false });
  try {
    const privateBytes = fs.readFileSync(env.privateFile), before = entries(env);
    const client = await s.connect(env), tools = await client.listTools();
    const modern = await s.connect(env, { pin: "2026-07-28" });
    assert.deepEqual((await modern.listTools()).tools.map(tool => tool.name).sort(), [...s.contract.OPERATIONS].sort());
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), [...s.contract.OPERATIONS].sort());
    assert(tools.tools.every(tool => tool.annotations.readOnlyHint === false));
    assert.deepEqual(entries(env), before); assert.deepEqual(fs.readFileSync(env.privateFile), privateBytes);
    assert.equal(runner.main(["describe", "--private-file", env.privateFile]).enrollment_status, "awaiting_trusted_operator");
    const premature = await client.callTool({ name: "method_status", arguments: { request_id: "premature" } });
    assert.equal(premature.isError, true); assert(premature.content[0].text.includes("METHOD_CONTROL_ENROLLMENT_REQUIRED"));
    assert.equal(count(env, "method-control-requests"), 0);
    pass("legacy and pinned-modern SDK discovery work before native startup without enrollment, writes or authority");
    s.activate(env);
    const current = s.broker.load(env.privateFile);
    assert.equal(current.observation.payload.session_binding.session_id, env.actor.sessionId);
    assert.equal(current.enrollment.payload.provider_startup_verified, false);
    const bound = fs.readFileSync(env.privateFile);
    assert.equal(s.broker.observeSession(env.privateFile, env.options, { ...env.actor, sessionId: "peer" }, { source: "startup" }), null);
    assert.deepEqual(fs.readFileSync(env.privateFile), bound);
    pass("the already-connected server activates only after observed startup, exact lease and one-way enrollment");
    const unsolicited = await client.callTool({ name: "method_status", arguments: { request_id: "unsolicited" } });
    assert.equal(unsolicited.isError, true); assert(unsolicited.content[0].text.includes("METHOD_CONTROL_NATIVE_REQUEST_REQUIRED"));
    for (const change of [{ sessionId: "peer" }, { agentId: "peer" }, { providerAgentId: "peer" }]) {
      assert.throws(() => s.broker.preflight(env.privateFile, env.options, { ...env.actor, ...change }, s.hook(env, "method_status", { request_id: "wrong-actor" })), /METHOD_CONTROL_ACTOR_MISMATCH/);
    }
    assert.throws(() => s.broker.preflight(env.privateFile, env.options, env.actor, s.hook(env, "method_status", { request_id: "bad", role: "USER" })), /METHOD_CONTROL_ARGUMENTS_INVALID/);
    assert.equal(s.broker.preflight(env.privateFile, env.options, env.actor, { ...s.hook(env, "method_status", { request_id: "bad-name" }), tool_name: "mcp__cannae_method_unregistered__method_status" }), false);
    pass("unsolicited SDK, peer identities, role injection and similar tool prefixes cannot acquire a request");

    const lostInput = { request_id: "lost-status" }, lostPre = s.hook(env, "method_status", lostInput);
    await s.withEnvironment(env, () => assert.equal(adapter.handle(env.actor.provider, lostPre), null));
    const lost = await modern.callTool({ name: "method_status", arguments: lostInput });
    assert.notEqual(lost.isError, true);
    const poisoned = structuredClone(lost); poisoned.content[0].text = JSON.stringify({ ...lost.structuredContent, release_authorized: true });
    await s.withEnvironment(env, () => assert.throws(() => adapter.handle(env.actor.provider,
      s.hook(env, "method_status", lostInput, "PostToolUse", poisoned)), /METHOD_CONTROL_RESULT_MISMATCH/));
    assert.throws(() => s.dispatch.completeLease(env.options, env.leaseId), /METHOD_CONTROL_DELIVERY_UNRESOLVED/);
    assert.throws(() => s.dispatch.admitToolRequest(env.options, env.actor, { ...s.hook(env, "method_status", {}), tool_name: "Read", tool_input: s.inputs.planned }), /METHOD_CONTROL_DELIVERY_UNRESOLVED/);
    assert.equal(env.readCount, 0);
    const acknowledged = s.broker.reconcile(env.privateFile, lost.structuredContent.request_ref);
    assert.equal(acknowledged.execution_authorized, false);
    assert.deepEqual(s.broker.reconcile(env.privateFile, lost.structuredContent.request_ref), acknowledged);
    pass("mismatched or lost responses hold actual work and completion until neutral exact-receipt reconciliation");

    const status = await s.call(env, client, "method_status", { request_id: "status" });
    assert.equal(status.execution_authorized, false); assert.equal(status.result.assignment.baseline.agent_id, env.actor.agentId);
    assert.throws(() => s.broker.preflight(env.privateFile, env.options, env.actor, s.hook(env, "method_status", { request_id: "status" })), /METHOD_CONTROL_REQUEST_REPLAY/);
    pass("status contains only the reviewed receiver assignment and native request IDs cannot replay");

    const proposalInput = { request_id: "proposal", step_id: "inspect", method_id: "short_read", rationale: "Synthetic scoped transport execution." };
    await s.withEnvironment(env, () => assert.equal(adapter.handle(env.actor.provider, s.hook(env, "method_propose", proposalInput)), null));
    try {
      failReceipt = true;
      assert.throws(() => s.broker.execute(env.privateFile, "method_propose", proposalInput), /SYNTHETIC_RECEIPT_PUBLICATION_FAILURE/);
    } finally { failReceipt = false; }
    assert.equal(count(env, "method-deviation-events"), 1);
    assert.throws(() => s.dispatch.completeLease(env.options, env.leaseId), /METHOD_CONTROL_DELIVERY_UNRESOLVED/);
    const proposalResponse = await client.callTool({ name: "method_propose", arguments: proposalInput });
    assert.notEqual(proposalResponse.isError, true, JSON.stringify(proposalResponse));
    const proposed = proposalResponse.structuredContent;
    await s.withEnvironment(env, () => assert.equal(adapter.handle(env.actor.provider,
      s.hook(env, "method_propose", proposalInput, "PostToolUse", proposalResponse)), null));
    assert.equal(count(env, "method-deviation-events"), 1); assert.equal(env.readCount, 0);
    pass("an interrupted receipt publication recovers the exact real deviation once without task execution");
    assert.equal(proposed.execution_authorized, false);

    const actualPre = { ...s.hook(env, "method_status", {}), tool_name: "Read", tool_use_id: "actual-read", tool_input: s.inputs.after };
    await s.withEnvironment(env, () => assert.equal(adapter.handle(env.actor.provider, actualPre), null));
    const actual = { content: fs.readFileSync(require("node:path").join(env.options.repository, "README.md"), "utf8") }; env.readCount++;
    fs.renameSync(env.privateFile, env.privateFile + ".offline");
    try {
      await s.withEnvironment(env, () => assert.equal(adapter.handle(env.actor.provider,
        { ...actualPre, hook_event_name: "PostToolUse", tool_response: actual }), null));
    } finally { fs.renameSync(env.privateFile + ".offline", env.privateFile); }
    assert(actual.content.includes("fixture"));
    pass("an already-admitted real task result remains recordable while the private metadata channel is offline");
    const report = await s.call(env, client, "method_report_after", { request_id: "after", deviation_ref: proposed.result.deviation_ref });
    assert.equal(report.result.kind, "after_report"); assert.equal(report.release_authorized, false);
    await s.readTask(env, s.inputs.safeguard, "actual-safeguard");
    assert.equal(s.dispatch.completeLease(env.options, env.leaseId).status, "completed");
    assert.equal(env.readCount, 2);
    const inventory = s.broker.load(env.privateFile).store.manifest.artifacts;
    assert.equal(inventory.filter(item => item.kind === "method-control-requests").length, 4);
    assert.equal(inventory.filter(item => item.kind === "method-control-receipts").length, 4);
    assert.equal(inventory.filter(item => item.kind === "method-control-deliveries").length, 4);
    assert(!JSON.stringify(inventory).includes(JSON.parse(fs.readFileSync(env.privateFile)).credential));
    pass("actual task reads, after-report delivery and safeguard complete the exact lease without exposing credentials");
  } finally { await s.cleanup(env); }

  const claude = s.environment({ provider: "claude_code", broker: { max_requests: 1 } });
  try {
    const client = await s.connect(claude), input = { request_id: "claude-status" };
    for (const mcp_server of [undefined, { name: claude.enrolled.server_name, source: "unknown" }, { name: "peer", source: "project" }]) {
      assert.throws(() => s.broker.preflight(claude.privateFile, claude.options, claude.actor,
        { ...s.hook(claude, "method_status", input), mcp_server }), /METHOD_CONTROL_PROVENANCE_MISMATCH/);
    }
    const result = await s.call(claude, client, "method_status", input);
    assert.equal(result.execution_authorized, false);
    assert.throws(() => s.broker.preflight(claude.privateFile, claude.options, claude.actor,
      s.hook(claude, "method_status", { request_id: "budget" })), /METHOD_CONTROL_BUDGET_EXHAUSTED/);
    pass("Claude synthetic hooks require exact native provenance and the reviewed request budget is enforced");
    const expiredOptions = { ...claude.options, now: s.broker.load(claude.privateFile).enrollment.payload.expires_at };
    assert.throws(() => s.broker.preflight(claude.privateFile, expiredOptions, claude.actor,
      s.hook(claude, "method_status", { request_id: "expired" })), /METHOD_CONTROL_ENROLLMENT_EXPIRED/);
    assert.equal(s.broker.reconcile(claude.privateFile, result.request_ref, expiredOptions).execution_authorized, false);
    pass("expiry cannot admit new metadata authority but an exact retained receipt remains neutrally reconcilable");
  } finally { await s.cleanup(claude); }

  const late = s.environment({ enroll: false });
  try {
    late.issued = s.dispatch.issueLease(late.options, late.policy.id,
      { sessionId: late.actor.sessionId, providerAgentId: late.actor.providerAgentId });
    late.leaseId = late.issued.lease_ref.artifact_id;
    const observation = s.broker.observeSession(late.privateFile, late.options, late.actor, { source: "startup" });
    assert.throws(() => s.broker.enroll(late.options, late.leaseId, late.privateFile), /METHOD_CONTROL_OBSERVED_SESSION_REQUIRED/);
    const slot = s.broker.inspectLaunch(late.privateFile).slot;
    const { schema_version, type, id, ...body } = slot.payload;
    const forged = s.contract.identified("MethodControlEnrollment", { ...body, launch_slot_ref: slot.ref,
      session_observation_ref: observation.session_observation_ref, lease_ref: late.issued.lease_ref,
      session_binding: { session_id: late.actor.sessionId, provider_agent_id: late.actor.providerAgentId }, recorded_at: new Date().toISOString() });
    assert.equal(require("./validator-cli-prototype/validate").validatePayload(forged, "method-control-enrollment").valid, true);
    originalWrite({ repositoryPath: late.options.repository, artifactRoot: late.options.artifactRoot,
      missionId: late.actor.missionId, waveId: late.actor.waveId, kind: "method-control-enrollments", artifactId: forged.id,
      payload: forged, createdAt: forged.recorded_at });
    assert.throws(() => s.dispatch.admitToolRequest(late.options, late.actor, { hook_event_name: "PreToolUse", tool_name: "Read",
      tool_use_id: "forged-lineage", tool_input: s.inputs.planned }), /METHOD_CONTROL_SESSION_BINDING_INVALID/);
    assert.equal(late.readCount, 0); assert.equal(count(late, "tool-admission-events"), 0);
    pass("a schema-valid raw enrollment with retrospective startup cannot bypass the actual task gate");
  } finally { await s.cleanup(late); }
  console.log(JSON.stringify({ total: passed, passed, failed: 0,
    scope: "Actual official SDK stdio legacy/modern transport and dispatch consumers with synthetic Codex/Claude native hook envelopes. No native agent-client/model execution, provider startup attestation, semantic mission completion or production claim." }, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
