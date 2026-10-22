#!/usr/bin/env node
const { McpServer } = require("@modelcontextprotocol/server");
const { serveStdio } = require("@modelcontextprotocol/server/stdio");
const z = require("zod");
const broker = require("./method-control-broker"), contract = require("./method-control-contract");
const artifact = z.object({ artifact_id: z.string(), relative_path: z.string(), sha256: z.string() }).strict();
const output = z.object({ schema_version: z.literal("0.1"), type: z.literal("MethodControlResponse"),
  enrollment_ref: artifact, request_ref: artifact, receipt_ref: artifact, result: z.unknown(),
  execution_authorized: z.literal(false), continuation_authorized: z.literal(false), release_authorized: z.literal(false),
  human_final_decision_authority: z.literal("USER") }).strict();
function createServer(privateFile) {
  // Discovery is read-only: protocol probes must never enroll a client or consume a request.
  const prepared = broker.inspectLaunch(privateFile);
  const server = new McpServer({ name: prepared.slot.payload.server_name, version: "0.1.0" }, {
    instructions: "Use only your enrolled method assignment. These tools record control metadata, not task work. Propose only an exact reviewed alternative; report actual results before another task call. They cannot approve, resume, complete, release or extend a lease. A failed or undelivered control response leaves work held for trusted operator inspection. Do not use Bash or write artifact metadata to bypass this channel."
  });
  const descriptions = { method_status: "Inspect only this enrolled agent's reviewed method assignment and actual method state.",
    method_propose: "Record one already reviewed exact method choice for the current step. This never admits the task tool.",
    method_report_after: "Record the actual retained result of this agent's deviation; no caller-provided result or USER approval." };
  for (const operation of contract.OPERATIONS) server.registerTool(operation, {
    description: descriptions[operation], inputSchema: contract.ARGUMENTS[operation], outputSchema: output,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async input => {
    try {
      const value = broker.execute(privateFile, operation, input);
      return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
    } catch (error) {
      const code = /^METHOD_[A-Z_]+$/.test(error.message) ? error.message : "METHOD_CONTROL_INTERNAL_ERROR";
      return { content: [{ type: "text", text: code }], isError: true };
    }
  });
  return server;
}
function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== "--enrollment" || !require("node:path").isAbsolute(argv[1])) throw new Error("METHOD_CONTROL_PRIVATE_PATH_INVALID");
  return serveStdio(() => createServer(argv[1]));
}
module.exports = { createServer, main };
if (require.main === module) {
  try { main(); }
  catch (error) { console.error(/^METHOD_[A-Z_]+$/.test(error.message) ? error.message : "METHOD_CONTROL_STARTUP_FAILED"); process.exitCode = 1; }
}
