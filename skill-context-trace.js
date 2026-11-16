const { isDeepStrictEqual } = require("node:util");
const { hash } = require("./skill-evaluation-runner");
const { classifyReviewEvent, classifyClaudeReviewEvent } = require("./authoring-review-packet");

const fail = code => { throw new Error("SKILL_CONTEXT_TRACE_" + code); };
const requireThat = (condition, code) => { if (!condition) fail(code); };
const object = value => value && typeof value === "object" && !Array.isArray(value);
const bytes = value => Buffer.byteLength(value, "utf8");
const same = (a, b) => isDeepStrictEqual(a, b);

function textResult(value) {
  requireThat(object(value) && Array.isArray(value.content) && value.content.length === 1 &&
    value.content[0]?.type === "text" && typeof value.content[0].text === "string" &&
    Object.keys(value.content[0]).every(key => ["type", "text"].includes(key)) &&
    Object.keys(value).every(key => ["content", "isError", "structured_content"].includes(key)) &&
    (value.structured_content === null || value.structured_content === undefined) &&
    (value.isError === undefined || typeof value.isError === "boolean"), "RESULT_SHAPE");
  return { text: value.content[0].text, error: value.isError === true };
}

function createNativeTrace({ provider, server, call_limit }) {
  requireThat(["codex", "claude"].includes(provider) && /^[a-z][a-z0-9_]+$/.test(server || "") &&
    Number.isSafeInteger(call_limit) && call_limit > 0 && call_limit <= 128, "OPTIONS");
  const calls = new Map(), messages = [];
  let initialized = false, running = false, completed = false, session = null, model = null, final = null, diagnostics = 0;
  const start = (id, tool, input) => {
    requireThat(typeof id === "string" && id && !calls.has(id) && calls.size < call_limit &&
      tool === "read_reference" && object(input), "CALL_START");
    calls.set(id, { id, input: structuredClone(input), completed: false });
  };
  const finish = (id, result) => {
    const call = calls.get(id);
    requireThat(call && !call.completed, "CALL_FINISH");
    Object.assign(call, { completed: true, ...result });
  };
  const done = text => {
    requireThat(initialized && !completed && typeof text === "string" && text.trim() &&
      [...calls.values()].every(call => call.completed), "INCOMPLETE");
    completed = true; final = text;
  };
  return {
    observe(e) {
      requireThat(object(e) && !completed, "EVENT_AFTER_COMPLETION");
      if (provider === "codex") {
        if (e.type === "thread.started") {
          requireThat(!initialized && typeof e.thread_id === "string" && e.thread_id, "INITIALIZATION");
          initialized = true; session = e.thread_id; return;
        }
        requireThat(initialized, "INITIALIZATION");
        if (e.type === "turn.started") { requireThat(!running, "MULTIPLE_TURNS"); running = true; return; }
        if (!running && e.type === "item.completed" && e.item?.type === "error") {
          // Codex can report startup diagnostics between thread and turn creation.
          // They neither complete the turn nor authorize tools or missing sources.
          requireThat(same(Object.keys(e).sort(), ["item", "type"]) &&
            same(Object.keys(e.item).sort(), ["id", "message", "type"]) &&
            typeof e.item.id === "string" && e.item.id && typeof e.item.message === "string" && e.item.message.trim(), "STARTUP_DIAGNOSTIC");
          diagnostics++; return;
        }
        requireThat(running, "TURN_NOT_STARTED");
        const item = e.item;
        if (item?.type === "mcp_tool_call") {
          final = null; requireThat(item.server === server, "TOOL_SERVER");
          if (e.type === "item.started") start(item.id, item.tool, item.arguments);
          else {
            const call = calls.get(item.id);
            requireThat(call && !call.completed && item.tool === "read_reference" && same(call.input, item.arguments), "CALL_CHANGED");
            if (e.type === "item.completed") {
              requireThat(item.status === "completed" && !item.error, "CALL_FAILED");
              finish(item.id, textResult(item.result));
            } else requireThat(e.type === "item.updated", "TOOL_EVENT");
          }
          return;
        }
        const category = classifyReviewEvent(e);
        requireThat(!["failure", "prohibited_item"].includes(category), "PROHIBITED_EVENT");
        if (category === "diagnostic") diagnostics++;
        if (category === "message" && e.type === "item.completed") {
          requireThat(typeof item.text === "string", "MESSAGE"); final = item.text;
          messages.push({ text: item.text, completed_calls: [...calls.values()].filter(call => call.completed).length });
        } else if (e.type === "turn.completed") done(final);
        else final = null;
      } else {
        if (e.type === "system" && e.subtype === "init") {
          requireThat(!initialized && same(e.tools, [`mcp__${server}__read_reference`]) &&
            e.permissionMode === "dontAsk" && Array.isArray(e.mcp_servers) && e.mcp_servers.length === 1 &&
            e.mcp_servers[0].name === server && e.mcp_servers[0].status === "connected" &&
            typeof e.session_id === "string" && e.session_id && typeof e.model === "string" && e.model, "INITIALIZATION");
          initialized = true; session = e.session_id; model = e.model; return;
        }
        requireThat(initialized && e.session_id === session, "SESSION_CHANGED");
        if (e.type === "assistant") {
          requireThat(!e.error && !e.is_api_error_message && Array.isArray(e.message?.content) && e.message.content.length, "MESSAGE");
          for (const block of e.message.content) {
            if (block.type === "tool_use") {
              requireThat(block.name === `mcp__${server}__read_reference`, "TOOL_SERVER");
              start(block.id, "read_reference", block.input);
            } else {
              requireThat(["text", "thinking", "redacted_thinking"].includes(block.type), "PROHIBITED_EVENT");
              if (block.type === "text") {
                requireThat(typeof block.text === "string", "MESSAGE");
                messages.push({ text: block.text, completed_calls: [...calls.values()].filter(call => call.completed).length });
              }
            }
          }
        } else if (e.type === "user") {
          requireThat(Array.isArray(e.message?.content) && e.message.content.length, "RESULT_SHAPE");
          for (const block of e.message.content) {
            requireThat(block.type === "tool_result", "PROHIBITED_EVENT");
            finish(block.tool_use_id, textResult({ content: typeof block.content === "string" ?
              [{ type: "text", text: block.content }] : block.content, isError: block.is_error }));
          }
        } else {
          const category = classifyClaudeReviewEvent(e);
          requireThat(["diagnostic", "result"].includes(category), "PROHIBITED_EVENT");
          if (category === "diagnostic") diagnostics++; else done(e.result);
        }
      }
    },
    finish() {
      requireThat(completed, "INCOMPLETE");
      return { provider, server, session, model, calls: [...calls.values()], messages, response: final, diagnostics };
    }
  };
}

// The relay records exact JSON-RPC lines after each destination write completes.
// Its trace is client-bound I/O evidence, not a protected-host/backend attestation.
function inspectTransport(records, callLimit) {
  requireThat(Array.isArray(records) && records.length >= 3 && Number.isSafeInteger(callLimit) &&
    callLimit > 0 && callLimit <= 128, "TRANSPORT_RECORDS");
  const requests = new Map(), calls = [];
  let wireBytes = 0, instructionsBytes = 0, catalogBytes = 0, resultTextBytes = 0, terminal = false, initialized = false;
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    requireThat(object(row) && row.sequence === i && !terminal, "TRANSPORT_SEQUENCE");
    if (i === 0) { requireThat(row.kind === "started" && row.version === 1, "TRANSPORT_START"); continue; }
    if (row.kind === "closed") {
      requireThat(i === records.length - 1 && row.code === 0 && row.signal === null && row.failure === null, "TRANSPORT_CLOSE");
      terminal = true; continue;
    }
    requireThat(row.kind === "message" && ["to_adapter", "to_client"].includes(row.direction) &&
      typeof row.wire === "string" && row.wire.endsWith("\n") && row.wire.trim().split("\n").length === 1 &&
      bytes(row.wire) === row.bytes && hash(row.wire) === row.sha256, "TRANSPORT_WIRE");
    let m; try { m = JSON.parse(row.wire); } catch { fail("TRANSPORT_JSON"); }
    requireThat(object(m) && m.jsonrpc === "2.0", "TRANSPORT_JSON");
    if (row.direction === "to_adapter") {
      if (m.id === undefined) {
        requireThat(m.method === "notifications/initialized" && initialized, "TRANSPORT_NOTIFICATION"); continue;
      }
      requireThat((typeof m.id === "string" || Number.isSafeInteger(m.id)) && !requests.has(m.id) &&
        ["initialize", "tools/list", "tools/call", "ping"].includes(m.method), "TRANSPORT_REQUEST");
      requireThat(m.method === "initialize" ? requests.size === 0 : initialized, "TRANSPORT_INITIALIZATION");
      const request = { id: m.id, method: m.method, params: m.params, completed: false };
      requests.set(m.id, request);
      if (m.method === "tools/call") {
        requireThat(m.params?.name === "read_reference" && object(m.params.arguments) && calls.length < callLimit, "TRANSPORT_CALL");
        calls.push(request);
      }
    } else {
      wireBytes += row.bytes;
      const request = requests.get(m.id);
      requireThat(request && !request.completed && object(m.result) && !m.error && !m.method, "TRANSPORT_RESPONSE");
      request.completed = true;
      if (request.method === "initialize") {
        requireThat(!initialized && typeof m.result.instructions === "string", "TRANSPORT_INITIALIZATION");
        initialized = true; instructionsBytes += bytes(m.result.instructions);
      } else if (request.method === "tools/list") {
        requireThat(Array.isArray(m.result.tools) && m.result.tools.length === 1 && m.result.tools[0].name === "read_reference" &&
          object(m.result.tools[0].inputSchema) && !m.result.nextCursor, "TRANSPORT_CATALOG");
        catalogBytes += bytes(JSON.stringify(m.result.tools));
      } else if (request.method === "tools/call") {
        request.result = textResult(m.result); resultTextBytes += bytes(request.result.text);
      }
    }
  }
  requireThat(terminal && initialized && catalogBytes > 0 && [...requests.values()].every(row => row.completed), "TRANSPORT_INCOMPLETE");
  return { calls: calls.map(row => ({ input: row.params.arguments, ...row.result })),
    wire_bytes_to_client: wireBytes, advertised_instructions_bytes: instructionsBytes,
    advertised_catalog_bytes: catalogBytes, result_text_bytes: resultTextBytes };
}

function reconcileContextTrace({ prompt, manifest, native, records, call_limit, expectedRead }) {
  requireThat(Buffer.isBuffer(prompt) && manifest?.prompt_bytes === prompt.length && manifest.prompt_sha256 === hash(prompt) &&
    typeof expectedRead === "function" && object(native) && Array.isArray(native.calls) &&
    typeof native.response === "string" && native.response.trim(), "INPUT_BINDING");
  const transport = inspectTransport(records, call_limit), unmatched = [...transport.calls];
  requireThat(native.calls.length === unmatched.length, "CALL_COUNT");
  let bodyBytes = 0, navigationBytes = 0, errorBytes = 0;
  for (const call of native.calls) {
    const match = unmatched.findIndex(row => same(row.input, call.input) && row.text === call.text);
    requireThat(call.completed && match >= 0, "DELIVERY_MISMATCH");
    const wire = unmatched.splice(match, 1)[0];
    // Some clients omit the MCP isError marker; the exact text and wire marker
    // remain authoritative. A positive native error cannot become wire success.
    requireThat(!call.error || wire.error, "ERROR_MISMATCH");
    if (wire.error) {
      let value; try { value = JSON.parse(wire.text); } catch { fail("ERROR_SHAPE"); }
      requireThat(/^CONTEXT_REFERENCE_[A-Z_]+$/.test(value?.error || "") && value.transfer_authorized === false, "ERROR_SHAPE");
      errorBytes += bytes(wire.text);
    } else {
      const expected = expectedRead(call.input);
      requireThat(expected?.text === wire.text && Number.isSafeInteger(expected.emitted_body_bytes) && expected.emitted_body_bytes >= 0, "SOURCE_MISMATCH");
      bodyBytes += expected.emitted_body_bytes;
      if (call.input.mode === "index") navigationBytes += bytes(wire.text);
    }
  }
  return { type: "SkillContextTraceAccounting", version: 1, trace_consistent: true,
    prompt_bytes: prompt.length, prompt_sha256: hash(prompt), calls: native.calls.length,
    reference_body_bytes: bodyBytes, navigation_response_bytes: navigationBytes, error_response_bytes: errorBytes,
    tool_result_text_bytes: transport.result_text_bytes,
    advertised_instructions_bytes: transport.advertised_instructions_bytes, advertised_catalog_bytes: transport.advertised_catalog_bytes,
    wire_bytes_to_client: transport.wire_bytes_to_client,
    controlled_client_input_bytes: prompt.length + transport.wire_bytes_to_client,
    backend_context_bytes: null, semantic_acceptance: false, transfer_authorized: false,
    native_execution_independently_verified: false, savings_acceptance_established: false };
}

module.exports = { createNativeTrace, inspectTransport, reconcileContextTrace };
