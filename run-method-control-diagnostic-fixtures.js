#!/usr/bin/env node
const assert = require("node:assert/strict"), { createDiagnostics, instrumentClient } = require("./method-control-fixtures/diagnostics");
let passed = 0;
async function check(name, callback) { await callback(); passed++; console.log(`PASS ${name}`); }
async function main() {
  await check("synchronous values and asynchronous results preserve identity and execute once", async () => {
    const events = [], value = { execution_authorized: false }; let calls = 0, tick = 0;
    const reporter = createDiagnostics({ sink: event => events.push(event), clock: () => ++tick, cpu: () => ({ user: tick * 1000, system: 0 }) });
    assert.equal(reporter.run("tool_preflight", () => { calls++; return value; }), value);
    assert.equal(await reporter.run("sdk_tool_call", async () => { calls++; return value; }, { tool_name: "method_status", timeout_ms: 20000 }), value);
    assert.equal(calls, 2); assert.equal(events.length, 4); assert.deepEqual(events.map(event => event.event), ["start", "end", "start", "end"]);
    assert(events.filter(event => event.event === "end").every(event => event.elapsed_ms >= 0 && event.local_parent_cpu_ms >= 0 && event.ok));
  });
  await check("original synchronous and asynchronous errors are never replaced or retried", async () => {
    const events = [], reporter = createDiagnostics({ sink: event => events.push(event) }), error = new Error("METHOD_CONTROL_ENROLLMENT_EXPIRED"); let calls = 0;
    assert.throws(() => reporter.run("tool_preflight", () => { calls++; throw error; }), value => value === error);
    await assert.rejects(reporter.run("sdk_request", async () => { calls++; throw error; }), value => value === error);
    assert.equal(calls, 2); assert(events.filter(event => event.event === "end").every(event => !event.ok && event.denial === error.message));
  });
  await check("diagnostics exclude arguments, credentials and arbitrary error text", async () => {
    const events = [], reporter = createDiagnostics({ sink: event => events.push(event) }), secret = "synthetic-private-nonce-password-canary";
    const error = Object.assign(new Error(secret), { name: secret, code: secret, data: { password: secret } });
    await assert.rejects(reporter.run("sdk_request", async () => { throw error; }, { protocol_method: secret, tool_name: secret, arguments: { password: secret },
      credential: secret, nonce: secret, private_file: secret, timeout_ms: 15000 }), value => value === error);
    assert(!JSON.stringify(events).includes(secret)); assert.equal(events[1].error_class, "other"); assert.equal(events[1].denial, null);
    assert.equal(events[1].timeout_ms, 15000); assert.equal(events[1].request_timed_out, false);
    assert.deepEqual(Object.keys(events[1]).sort(), ["scope", "sequence", "phase", "event", "timeout_ms", "ok", "elapsed_ms", "local_parent_cpu_ms", "error_class", "request_timed_out", "denial"].sort());
  });
  await check("SDK timeouts and protocol method are distinguishable without changing timeout options", async () => {
    const events = [], reporter = createDiagnostics({ sink: event => events.push(event) }), options = Object.freeze({ timeout: 20000 });
    const error = Object.assign(new Error("Request timed out"), { name: "SdkError" });
    await assert.rejects(reporter.run("sdk_request", () => Promise.reject(error), { protocol_method: "tools/call", timeout_ms: options.timeout }), value => value === error);
    assert.equal(events[1].protocol_method, "tools/call"); assert.equal(events[1].timeout_ms, 20000); assert.equal(events[1].request_timed_out, true); assert.equal(options.timeout, 20000);
  });
  await check("a failed diagnostic sink cannot mask the original return or denial", async () => {
    const reporter = createDiagnostics({ sink: () => { throw new Error("Synthetic diagnostic sink failure"); } }), value = {}, error = new Error("Original denial");
    assert.equal(reporter.run("cleanup", () => value), value);
    await assert.rejects(reporter.run("sdk_request", () => Promise.reject(error)), value => value === error);
    assert.equal(reporter.statistics().dropped_events, 4);
  });
  await check("the client wrapper preserves receiver, exact arguments, timeout, signal and original rejection", async () => {
    const events = [], reporter = createDiagnostics({ sink: event => events.push(event) }), secret = "synthetic-private-request-canary";
    const input = Object.freeze({ method: "tools/call", params: { password: secret } }), options = Object.freeze({ timeout: 20000, signal: new AbortController().signal }), extra = {};
    let calls = 0, fail = false; const output = {}, error = new Error("Original request refusal");
    const client = { request(...args) { assert.equal(this, client); assert.equal(args[0], input); assert.equal(args[1], options); assert.equal(args[2], extra);
      calls++; return fail ? Promise.reject(error) : Promise.resolve(output); } };
    instrumentClient(client, reporter, 2);
    assert.equal(await client.request(input, options, extra), output); fail = true;
    await assert.rejects(client.request(input, options, extra), value => value === error);
    assert.equal(calls, 2); assert.equal(options.timeout, 20000); assert.equal(options.signal.aborted, false);
    assert(!JSON.stringify(events).includes(secret)); assert(events.every(event => event.protocol_method === "tools/call" && event.client_index === 2));
  });
  await check("unknown phases fail before invoking a callback or emitting private labels", () => {
    const events = [], reporter = createDiagnostics({ sink: event => events.push(event) }); let called = false;
    assert.throws(() => reporter.run("synthetic-private-phase", () => { called = true; }), /FIXTURE_DIAGNOSTIC_PHASE_INVALID/);
    assert.equal(called, false); assert.deepEqual(events, []);
  });
  await check("opaque thrown values cannot replace the original denial or leak through getters", () => {
    const events = [], reporter = createDiagnostics({ sink: event => events.push(event) }), opaque = {};
    Object.defineProperty(opaque, "name", { get() { throw new Error("synthetic-private-getter-canary"); } });
    assert.throws(() => reporter.run("tool_preflight", () => { throw opaque; }), value => value === opaque);
    assert.equal(events[1].error_class, "other"); assert(!JSON.stringify(events).includes("canary"));
  });
  console.log(JSON.stringify({ passed, failed: 0, actual_sdk_transport_exercised: false, sdk_timeout_fixed: false, execution_authorized: false, release_authorized: false }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
