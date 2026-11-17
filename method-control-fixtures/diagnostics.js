const { performance } = require("node:perf_hooks");
const { isPromise } = require("node:util").types;
const phases = new Set(["sdk_connect", "sdk_request", "tool_preflight", "sdk_tool_call", "tool_postflight", "cleanup", "transport_close"]);
const denials = new Set(["METHOD_CONTROL_ENROLLMENT_EXPIRED", "METHOD_CONTROL_REQUEST_EXPIRED", "METHOD_CONTROL_DELIVERY_UNRESOLVED",
  "METHOD_CONTROL_REQUEST_REPLAY", "METHOD_CONTROL_BUDGET_EXHAUSTED", "METHOD_CONTROL_NATIVE_REQUEST_REQUIRED",
  "METHOD_CONTROL_ACTIVE_LEASE_REQUIRED", "METHOD_CONTROL_CHANNEL_SUPERSEDED"]);
let instances = 0;
function errorMetadata(error) {
  try {
    return { error_class: ["Error", "SdkError", "TypeError", "AssertionError"].includes(error?.name) ? error.name : "other",
      request_timed_out: error?.message === "Request timed out", denial: denials.has(error?.message) ? error.message : null };
  } catch { return { error_class: "other", request_timed_out: false, denial: null }; }
}
function metadata(value) {
  const result = {};
  if (["initialize", "tools/list", "tools/call", "ping"].includes(value.protocol_method)) result.protocol_method = value.protocol_method;
  if (["method_status", "method_propose", "method_report_after"].includes(value.tool_name)) result.tool_name = value.tool_name;
  if (Number.isInteger(value.timeout_ms) && value.timeout_ms > 0 && value.timeout_ms <= 60000) result.timeout_ms = value.timeout_ms;
  if (Number.isInteger(value.client_index) && value.client_index > 0 && value.client_index <= 4096) result.client_index = value.client_index;
  return result;
}
function createDiagnostics(options = {}) {
  const scope = `fixture-${++instances}`, clock = options.clock || (() => performance.now()), cpu = options.cpu || (() => process.cpuUsage());
  const sink = options.sink || (value => process.stderr.write(`METHOD_FIXTURE ${JSON.stringify(value)}\n`));
  let sequence = 0, dropped = 0;
  const emit = value => { try { sink({ scope, sequence: ++sequence, ...value }); } catch { dropped++; } };
  function run(phase, callback, extra = {}) {
    if (!phases.has(phase)) throw new Error("FIXTURE_DIAGNOSTIC_PHASE_INVALID");
    const safe = metadata(extra), started = clock(), before = cpu(); emit({ phase, event: "start", ...safe });
    const finish = (ok, error) => {
      const after = cpu(), errorFields = ok ? {} : errorMetadata(error);
      emit({ phase, event: "end", ...safe, ok, elapsed_ms: Math.max(0, clock() - started),
        local_parent_cpu_ms: Math.max(0, after.user + after.system - before.user - before.system) / 1000, ...errorFields });
    };
    let value;
    try { value = callback(); } catch (error) { finish(false, error); throw error; }
    if (isPromise(value)) return Promise.prototype.then.call(value, result => { finish(true); return result; }, error => { finish(false, error); throw error; });
    finish(true); return value;
  }
  return { run, statistics: () => ({ emitted_events: sequence, dropped_events: dropped }) };
}
function instrumentClient(client, reporter, clientIndex) {
  const request = client.request;
  client.request = function(...args) {
    return reporter.run("sdk_request", () => request.apply(this, args),
      { protocol_method: args[0]?.method, timeout_ms: args[1]?.timeout, client_index: clientIndex });
  };
}
module.exports = { createDiagnostics, instrumentClient };
