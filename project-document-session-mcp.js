const { McpServer } = require("@modelcontextprotocol/server");
const { serveStdio } = require("@modelcontextprotocol/server/stdio");
const z = require("zod");
const { readOutput, sha256 } = require("./project-document-packet");
const { createDocumentSession } = require("./project-document-session");
const path = require("node:path");

function createServer(options) {
  const session = createDocumentSession(options);
  let latestRouteRequest;
  class DocumentServer extends McpServer {
    connect(transport) {
      let receiver;
      // Retire at the public transport boundary, before SDK argument validation.
      const guarded = {
        start: () => transport.start(), send: (...args) => transport.send(...args), close: () => transport.close(),
        get sessionId() { return transport.sessionId; },
        get hasPerRequestStream() { return transport.hasPerRequestStream; },
        setProtocolVersion: transport.setProtocolVersion?.bind(transport),
        setSupportedProtocolVersions: transport.setSupportedProtocolVersions?.bind(transport),
        get onclose() { return transport.onclose; }, set onclose(fn) { transport.onclose = fn; },
        get onerror() { return transport.onerror; }, set onerror(fn) { transport.onerror = fn; },
        get onmessage() { return receiver; },
        set onmessage(fn) {
          receiver = fn;
          transport.onmessage = (message, extra) => {
            if (message.method === "tools/call" && message.params?.name === "route_current_task") {
              session.retireRoute(); latestRouteRequest = message.id;
            }
            fn?.(message, extra);
          };
        }
      };
      return super.connect(guarded);
    }
  }
  const server = new DocumentServer({ name: "cannae_documents", version: "0.1.0" }, {
    instructions: "Read-only document receiving for one fixed assignment. Route each phase; preserve original intent, required sources and holds. Returned source IDs are not evidence of comprehension, human consent or execution authority."
  });
  const tools = [
    ["route_current_task", z.object({ query: z.string().min(1).max(8000), objectives: z.array(z.string().min(1).max(2000)).min(1).max(8) }).strict(),
      "Route the current task using the fixed recipient and project identity. Original assignment and all declared objectives are retained. The catalog contains source IDs, not private project paths."],
    ["read_document", z.object({ route_id: z.string(), source_id: z.string() }).strict(),
      "Read an assigned source ID in the current route. Preserve delivery mode and source bindings. A held or reference-only source is not readable; no arbitrary file access is provided."]
  ];
  for (const [name, inputSchema, description] of tools) {
    if (options.phase === "brief" && name === "read_document") continue;
    server.registerTool(name, { inputSchema, description,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false } }, async (input, context) => {
      // A later request can arrive while the SDK awaits the earlier validation.
      const value = name === "route_current_task" && context.mcpReq.id !== latestRouteRequest
        ? { error: "PROJECT_SESSION_SUPERSEDED_ROUTE", authorization_verified: false, execution_authorized: false,
          release_authorized: false, receiver_acceptance_verified: false }
        : session.execute(name, input);
      return { ...(value.error ? { isError: true } : {}), content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
    });
  }
  return server;
}

if (require.main === module) {
  try {
    const [file, expected, ...extra] = process.argv.slice(2);
    if (!file || !path.isAbsolute(file) || extra.length || !/^[a-f0-9]{64}$/.test(expected || "")) throw new Error();
    const bytes = readOutput(file, 128 * 1024);
    if (sha256(bytes) !== expected) throw new Error();
    const options = JSON.parse(bytes), server = createServer(options);
    const handle = serveStdio(() => server, { onerror: () => console.error("PROJECT_SESSION_TRANSPORT_FAILED") });
    setTimeout(() => { handle.close().catch(() => { console.error("PROJECT_SESSION_CLOSE_FAILED"); process.exitCode = 1; }); }, options.deadline_ms).unref();
  } catch {
    console.error("PROJECT_SESSION_CONFIG_UNAVAILABLE"); process.exitCode = 1;
  }
}

module.exports = { createServer };
