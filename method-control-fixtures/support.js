const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/client"), { StdioClientTransport } = require("@modelcontextprotocol/client/stdio");
const methods = require("../disciplined-initiative-fixtures/support"), contract = require("../method-control-contract"), broker = require("../method-control-broker");
const { policy } = require("./contracts"), adapter = require("../dispatch-hook-adapter");
function environment(configuration = {}) {
  const env = methods.environment(Date.now() - 90000), old = env.root;
  env.root = fs.realpathSync(env.root); env.options.repository = fs.realpathSync(env.options.repository);
  env.options.artifactRoot = path.join(env.root, path.relative(old, env.options.artifactRoot));
  env.plan.method_control.schema_version = "0.2"; env.plan.method_control.broker = { ...policy(), ...configuration.broker };
  for (const value of env.policies) value.provider = configuration.provider || "codex";
  env.policies.forEach((value, index) => { value.provider = configuration.providers?.[index] || value.provider; });
  env.plan.dispatch_control.policy_authorizations = env.policies.map(value => ({ agent_id: value.agent_id, provider: value.provider,
    policy_id: value.id, draft_sha256: methods.dispatch.inputDigest(value) }));
  try {
    methods.adopt(env); env.opened = require("../skill-mission-controller").openWave(env.plan, methods.optionsAt(env, 70));
    env.policy = env.policies[0]; methods.dispatch.authorizeDispatchPolicy(methods.optionsAt(env, 80), env.policy);
    env.actor = { missionId: env.plan.mission_id, waveId: env.plan.wave_id, agentId: env.policy.agent_id,
      provider: env.policy.provider, sessionId: "method-fixture-session", providerAgentId: "main" };
    env.privateFile = path.join(env.root, "private", "enrollment.json");
    env.prepared = broker.prepare(env.options, env.policy.id, env.privateFile);
    env.enrolled = env.prepared;
    if (configuration.enroll !== false) activate(env);
  } catch (error) { fs.rmSync(env.root, { recursive: true, force: true }); throw error; }
  env.clients = [];
  return env;
}
function activate(env) {
  const old = bindings(env), previous = Object.fromEntries(Object.keys(old).map(key => [key, process.env[key]]));
  Object.assign(process.env, old);
  try {
    const started = adapter.handle(env.actor.provider, { hook_event_name: "SessionStart", cwd: env.options.repository,
      session_id: env.actor.sessionId, source: "startup" });
    assert(started.hookSpecificOutput.additionalContext.includes("Await trusted operator enrollment"));
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
  env.issued = methods.dispatch.issueLease(env.options, env.policy.id, { sessionId: env.actor.sessionId, providerAgentId: env.actor.providerAgentId });
  env.leaseId = env.issued.lease_ref.artifact_id;
  env.enrolled = broker.enroll(env.options, env.leaseId, env.privateFile);
}
async function connect(env, mode = "legacy") {
  const client = new Client({ name: "synthetic-controls-probe", version: "0.1.0" }, { versionNegotiation: { mode } });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(__dirname, "../method-control-server.js"), "--enrollment", env.privateFile], cwd: path.join(__dirname, ".."), stderr: "pipe" });
  let stderr = ""; transport.stderr.on("data", chunk => { stderr = (stderr + chunk.toString("utf8")).slice(-4096); });
  env.clients.push({ client, transport });
  try { await client.connect(transport, { timeout: 15000 }); }
  catch (error) { throw new Error(`${error.message}; isolated server stderr: ${stderr}`); }
  return client;
}
const bindings = env => ({ CANNAE_REPOSITORY: env.options.repository, CANNAE_ARTIFACT_ROOT: env.options.artifactRoot,
  CANNAE_MISSION_ID: env.actor.missionId, CANNAE_WAVE_ID: env.actor.waveId, CANNAE_AGENT_ID: env.actor.agentId,
  CANNAE_PROVIDER_AGENT_ID: env.actor.providerAgentId, CANNAE_METHOD_CONTROL_ENROLLMENT: env.privateFile });
async function withEnvironment(env, callback) {
  const values = bindings(env), previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return await callback(); }
  finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
function hook(env, operation, input, event = "PreToolUse", result) {
  return { hook_event_name: event, cwd: env.options.repository, session_id: env.actor.sessionId,
    tool_name: `mcp__${env.enrolled.server_name}__${operation}`, tool_use_id: `native-${input.request_id}`, tool_input: input,
    ...(env.actor.provider === "claude_code" ? { mcp_server: { name: env.enrolled.server_name, source: "project" } } : {}),
    ...(result ? { tool_response: result } : {}) };
}
async function call(env, client, operation, input) {
  return withEnvironment(env, async () => {
    assert.equal(adapter.handle(env.actor.provider, hook(env, operation, input)), null);
    const result = await client.callTool({ name: operation, arguments: input }, { timeout: 20000 });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(adapter.handle(env.actor.provider, hook(env, operation, input, "PostToolUse", result)), null);
    return result.structuredContent;
  });
}
function readTask(env, input, id) {
  return withEnvironment(env, () => {
    const pre = { hook_event_name: "PreToolUse", cwd: env.options.repository, session_id: env.actor.sessionId,
      tool_use_id: id, tool_name: "Read", tool_input: input };
    assert.equal(adapter.handle(env.actor.provider, pre), null);
    const result = { content: fs.readFileSync(path.join(env.options.repository, input.file_path), "utf8") }; env.readCount++;
    assert.equal(adapter.handle(env.actor.provider, { ...pre, hook_event_name: "PostToolUse", tool_response: result }), null);
    return result;
  });
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } };
async function cleanup(env) {
  for (const { transport } of env.clients) {
    const pid = transport.pid; await transport.close();
    for (let index = 0; pid && alive(pid) && index < 100; index++) await new Promise(resolve => setTimeout(resolve, 20));
    assert(!pid || !alive(pid), "The owned MCP server must actually exit before removing its synthetic state.");
  }
  fs.rmSync(env.root, { recursive: true, force: true });
}
module.exports = { ...methods, environment, activate, connect, withEnvironment, hook, call, readTask, cleanup, broker, contract };
