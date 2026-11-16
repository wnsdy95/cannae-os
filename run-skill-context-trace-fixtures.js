#!/usr/bin/env node
const assert = require("node:assert/strict");
const { hash } = require("./skill-evaluation-runner");
const { createNativeTrace, inspectTransport, reconcileContextTrace } = require("./skill-context-trace");

const server = "cannae_context", body = "# Source\r\n\uC6A9\uC5B4 \uC815\uC758.\r\n", prompt = Buffer.from("Task and full sources.\n");
const manifest = { prompt_bytes: prompt.length, prompt_sha256: hash(prompt) };
const selection = { path: "docs/source.md", mode: "full", sha256: hash(body) };
const resultText = JSON.stringify({ content: body, transfer_authorized: false });
const expectedRead = () => ({ text: resultText, emitted_body_bytes: Buffer.byteLength(body) });
const result = { content: [{ type: "text", text: resultText }] };
const request = (id, method, params) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
const response = (id, value) => ({ jsonrpc: "2.0", id, result: value });
function transcript(count = 2) {
  const records = [{ sequence: 0, kind: "started", version: 1 }];
  const add = (direction, value) => {
    const wire = JSON.stringify(value) + "\n";
    records.push({ sequence: records.length, kind: "message", direction, wire, bytes: Buffer.byteLength(wire), sha256: hash(wire) });
  };
  add("to_adapter", request(0, "initialize", {}));
  add("to_client", response(0, { instructions: "Choose useful references.", capabilities: {}, protocolVersion: "fixture" }));
  add("to_adapter", { jsonrpc: "2.0", method: "notifications/initialized" });
  add("to_adapter", request(1, "tools/list"));
  add("to_client", response(1, { tools: [{ name: "read_reference", inputSchema: { type: "object" } }] }));
  for (let i = 0; i < count; i++) {
    add("to_adapter", request(i + 2, "tools/call", { name: "read_reference", arguments: selection }));
    add("to_client", response(i + 2, result));
  }
  records.push({ sequence: records.length, kind: "closed", code: 0, signal: null, failure: null });
  return records;
}
function events(provider, count = 2) {
  const session = "fixture-session";
  if (provider === "codex") return [
    { type: "thread.started", thread_id: session }, { type: "turn.started" },
    ...Array.from({ length: count }, (_, i) => [
      { type: "item.started", item: { id: "call-" + i, type: "mcp_tool_call", server, tool: "read_reference", arguments: selection } },
      { type: "item.completed", item: { id: "call-" + i, type: "mcp_tool_call", server, tool: "read_reference", arguments: selection,
        status: "completed", error: null, result: { ...result, structured_content: null } } }
    ]).flat(),
    { type: "item.completed", item: { id: "final", type: "agent_message", text: "Draft with unresolved decisions." } }, { type: "turn.completed" }
  ];
  return [
    { type: "system", subtype: "init", session_id: session, model: "fixture-model", permissionMode: "dontAsk",
      tools: [`mcp__${server}__read_reference`], mcp_servers: [{ name: server, status: "connected" }] },
    ...Array.from({ length: count }, (_, i) => [
      { type: "assistant", session_id: session, message: { content: [{ type: "tool_use", id: "call-" + i, name: `mcp__${server}__read_reference`, input: selection }] } },
      { type: "user", session_id: session, message: { content: [{ type: "tool_result", tool_use_id: "call-" + i, content: resultText }] } }
    ]).flat(),
    { type: "result", session_id: session, subtype: "success", is_error: false, permission_denials: [], result: "Draft with unresolved decisions." }
  ];
}
function observe(provider, input = events(provider), limit = 8) {
  const observer = createNativeTrace({ provider, server, call_limit: limit });
  input.forEach(event => observer.observe(event)); return observer.finish();
}
const measure = (provider, overrides = {}) => reconcileContextTrace({ prompt, manifest, native: observe(provider),
  records: transcript(), call_limit: 8, expectedRead, ...overrides });
function changeWire(records, index, edit) {
  const value = JSON.parse(records[index].wire); edit(value);
  const wire = JSON.stringify(value) + "\n";
  Object.assign(records[index], { wire, bytes: Buffer.byteLength(wire), sha256: hash(wire) });
}
let passed = 0;
function check(name, fn) { fn(); passed++; console.log("PASS " + name); }
for (const provider of ["codex", "claude"]) {
  check(provider + " joins exact native completion with client-bound I/O, not transcript echoes", () => {
    const measured = measure(provider), wire = transcript().filter(row => row.direction === "to_client").reduce((sum, row) => sum + row.bytes, 0);
    assert.equal(measured.reference_body_bytes, Buffer.byteLength(body) * 2);
    assert.equal(measured.tool_result_text_bytes, Buffer.byteLength(resultText) * 2);
    assert.equal(measured.controlled_client_input_bytes, prompt.length + wire);
    assert.equal(measured.backend_context_bytes, null); assert.equal(measured.savings_acceptance_established, false);
    assert.equal(measured.native_execution_independently_verified, false); assert.equal(measured.semantic_acceptance, false);
  });
  check(provider + " includes navigation and error responses without turning them into source body", () => {
    const records = transcript(), native = observe(provider);
    const nav = JSON.stringify({ navigation: [{ line: 1, text: "# Source" }] }), error = JSON.stringify({ error: "CONTEXT_REFERENCE_DIGEST_MISMATCH", transfer_authorized: false });
    changeWire(records, 6, m => { m.params.arguments = { path: "docs/source.md", mode: "index" }; });
    changeWire(records, 7, m => { m.result.content[0].text = nav; });
    changeWire(records, 9, m => { m.result = { isError: true, content: [{ type: "text", text: error }] }; });
    native.calls[0].input = { path: "docs/source.md", mode: "index" }; native.calls[0].text = nav; native.calls[1].text = error;
    const measured = measure(provider, { records, native, expectedRead: () => ({ text: nav, emitted_body_bytes: 0 }) });
    assert.equal(measured.reference_body_bytes, 0); assert.equal(measured.navigation_response_bytes, Buffer.byteLength(nav));
    assert.equal(measured.error_response_bytes, Buffer.byteLength(error));
  });
  check(provider + " cannot claim completion from missing, duplicated, changed or unobserved results", () => {
    const native = observe(provider);
    for (const edit of [n => n.calls.pop(), n => n.calls.push(n.calls[0]), n => { n.calls[0].completed = false; },
      n => { n.calls[0].text += " "; }, n => { n.calls[0].input.path = "docs/other.md"; }]) {
      const changed = structuredClone(native); edit(changed); assert.throws(() => measure(provider, { native: changed }));
    }
    assert.throws(() => measure(provider, { expectedRead: () => ({ text: resultText + " ", emitted_body_bytes: 0 }) }), /SOURCE_MISMATCH/);
    assert.throws(() => measure(provider, { prompt: Buffer.from("Other source") }), /INPUT_BINDING/);
  });
  check(provider + " rejects interrupted, duplicate, unknown and over-budget native activity", () => {
    assert.throws(() => observe(provider, events(provider).slice(0, -1)), /INCOMPLETE/);
    assert.throws(() => observe(provider, events(provider), 1), /CALL_START/);
    assert.throws(() => observe(provider, [...events(provider), events(provider).at(-1)]), /EVENT_AFTER_COMPLETION/);
    const e = events(provider); e.splice(1, 0, { type: "unrecognized", session_id: "fixture-session" });
    assert.throws(() => observe(provider, e));
    const duplicate = events(provider); duplicate.splice(provider === "codex" ? 3 : 2, 0, structuredClone(duplicate[provider === "codex" ? 2 : 1]));
    assert.throws(() => observe(provider, duplicate), /CALL_START/);
  });
}
check("transport requires a full one-process lifecycle with every response correlated", () => {
  for (const edit of [r => r.pop(), r => { r.at(-1).code = 1; }, r => { r.at(-1).failure = "expired"; },
    r => { r[2].sequence = 1; }, r => { r[2].sha256 = "0".repeat(64); },
    r => { changeWire(r, 2, m => { m.id = "unknown"; }); }, r => { changeWire(r, 8, m => { m.id = 2; }); },
    r => { changeWire(r, 9, m => { delete m.result; m.error = { code: -1 }; }); }]) {
    const changed = transcript(); edit(changed); assert.throws(() => inspectTransport(changed, 8));
  }
});
check("transport rejects arbitrary tools, duplicate bodies, resource callbacks and catalog expansion", () => {
  for (const [index, edit] of [[6, m => { m.params.name = "shell"; }], [7, m => { m.result.structuredContent = {}; }],
    [7, m => { m.result.content.push(m.result.content[0]); }], [5, m => { m.result.tools.push({ name: "read_any_file" }); }],
    [4, m => { m.method = "resources/read"; }], [3, m => { m.method = "notifications/cancelled"; }]]) {
    const changed = transcript(); changeWire(changed, index, edit); assert.throws(() => inspectTransport(changed, 8));
  }
  assert.throws(() => inspectTransport(transcript(), 1), /TRANSPORT_CALL/);
});
check("Codex diagnostics remain diagnostics while tool failures and builtins stop the trace", () => {
  const good = events("codex"); good.splice(2, 0, { type: "item.completed", item: { type: "error", message: "startup warning" } });
  assert.equal(observe("codex", good).diagnostics, 1);
  for (const edit of [e => { e[3].item.status = "failed"; }, e => { e[2].item.server = "other"; },
    e => { e[2].item.type = "command_execution"; }, e => { e[3].item.result.structured_content = {}; },
    e => { e[3].item.arguments = { ...selection, end_line: 2 }; }, e => { e[3].type = "turn.completed"; }]) {
    const changed = structuredClone(events("codex")); edit(changed); assert.throws(() => observe("codex", changed));
  }
});
check("Claude checks the exact session, advertised tool, final status and unfiltered result blocks", () => {
  for (const edit of [e => { e[0].tools.push("Bash"); }, e => { e[0].permissionMode = "default"; },
    e => { e[1].session_id = "other"; }, e => { e[1].message.content[0].name = "Bash"; },
    e => { e[2].message.content[0].content = [{ type: "image", data: "hidden" }]; },
    e => { e.at(-1).permission_denials.push({ tool: "Bash" }); }, e => { e.at(-1).is_error = true; }]) {
    const changed = structuredClone(events("claude")); edit(changed); assert.throws(() => observe("claude", changed));
  }
});
check("zero-read trace consistency is not proof of sufficient reading or quality", () => {
  const measured = measure("codex", { native: observe("codex", events("codex", 0)), records: transcript(0) });
  assert.equal(measured.calls, 0); assert.equal(measured.semantic_acceptance, false);
});
console.log(JSON.stringify({ valid: true, fixtures: passed, native_model_calls: 0 }));
