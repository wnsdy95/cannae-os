const fs = require("node:fs"), path = require("node:path");
const { digest, same } = require("./order-intake-contract");
const z = require("zod");
const DOCUMENT = "docs/method-control-channel.md", CHECK = "node run-method-control-contract-fixtures.js";
const OPERATIONS = Object.freeze(["method_status", "method_propose", "method_report_after"]);
const RECORDS = Object.freeze({ MethodControlLaunchSlot: "method-control-launch-slots", MethodControlSessionObservation: "method-control-session-observations",
  MethodControlEnrollment: "method-control-enrollments", MethodControlRequest: "method-control-requests",
  MethodControlReceipt: "method-control-receipts", MethodControlDelivery: "method-control-deliveries" });
const TYPES = new Set(["method-control-channel-policy", "method-control-launch-slot", "method-control-session-observation", "method-control-enrollment", "method-control-request", "method-control-receipt", "method-control-delivery", "method-control-response"]);
const NON_WORK_TYPES = new Set([...Object.keys(RECORDS), "MethodControlChannelPolicy", "MethodControlResponse"]);
const AUTHORITY = Object.freeze({ execution_authorized: false, continuation_authorized: false, release_authorized: false,
  human_final_decision_authority: "USER" });
const CODE = ["method-control-contract.js", "method-control-broker.js", "method-control-private-state.js", "method-control-server.js",
  "dispatch-issuance-contract.js", "schema-files/agent-dispatch-lease.schema.json", "schema-files/dispatch-lease-issuance-request.schema.json", "schema-files/dispatch-lease-issuance-resolution.schema.json",
  "method-control-runner.js", "dispatch-hook-adapter.js", "dispatch-runtime-controller.js", "method-deviation-contract.js", "method-deviation-gate.js",
  "order-adoption-contract.js", "semantic-control-types.js", "operator-model-reconciliation-contract.js",
  "schema-files/operator-model-reconciliation-authorization.schema.json", "schema-files/operator-model-reconciliation-record.schema.json",
  "operator-semantic-evaluation-contract.js", "schema-files/operator-semantic-evaluation.schema.json", "semantic-omission-contract.js",
  "requirement-inventory-contract.js", "requirement-inventory-controller.js", "order-adoption-controller.js",
  "schema-files/requirement-inventory.schema.json", "schema-files/semantic-coverage-proposal.schema.json", "schema-files/semantic-review-assignment.schema.json",
  "schema-files/order-adoption-common.schema.json", "schema-files/order-adoption-proposal-request.schema.json",
  "schema-files/order-adoption-proposal.schema.json", "schema-files/order-adoption-decision-request.schema.json", "schema-files/order-adoption-record.schema.json",
  "validator-cli-prototype/validate.js", "operational-cop-contract.js", "schema-files/operational-cop.schema.json", "package.json", "package-lock.json",
  ...fs.readdirSync(path.join(__dirname, "schema-files")).filter(file => file.startsWith("method-control-") && file.endsWith(".schema.json"))
    .sort().map(file => `schema-files/${file}`)];
const identifier = () => z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const artifactRef = z.object({ artifact_id: z.string().min(1).max(512), relative_path: z.string().min(1).max(2048),
  sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const ARGUMENTS = Object.freeze({
  method_status: z.object({ request_id: identifier() }).strict(),
  method_propose: z.object({ request_id: identifier(), step_id: identifier(), method_id: identifier(), rationale: z.string().trim().min(1).max(2048) }).strict(),
  method_report_after: z.object({ request_id: identifier(), deviation_ref: artifactRef }).strict()
});
function assertArguments(operation, value) {
  if (!ARGUMENTS[operation]?.safeParse(value).success || Buffer.byteLength(JSON.stringify(value)) > 4096) throw new Error("METHOD_CONTROL_ARGUMENTS_INVALID");
  return value;
}
function runtimeDigest() { return digest(CODE.map(file => ({ file, sha256: require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(__dirname, file))).digest("hex") }))); }
function identified(type, body) {
  const value = { schema_version: "0.1", type, ...body, ...AUTHORITY };
  return { ...value, id: `MCTL-${digest(value).slice(0, 40)}` };
}
function pocket(plan, agentId) {
  const policy = plan.method_control?.broker;
  return policy ? { ...policy, server_name: `cannae_method_${digest({ plan: plan.id, mission: plan.mission_id, wave: plan.wave_id, agent: agentId, policy }).slice(0, 20)}`,
    operations: [...OPERATIONS] } : null;
}
function issues(payload, type) {
  const failure = (code, message) => ({ severity: "critical", code, path: "$", message });
  const result = [];
  if (type === "method-control-channel-policy") return result;
  if (Object.hasOwn(RECORDS, payload.type)) {
    const { id, ...body } = payload;
    if (id !== `MCTL-${digest(body).slice(0, 40)}`) result.push(failure("METHOD_CONTROL_ID_MISMATCH", "Control record IDs commit to their complete non-authorizing body."));
  }
  if (["method-control-launch-slot", "method-control-enrollment", "method-control-request"].includes(type)) {
    const start = Date.parse(payload.recorded_at), end = Date.parse(payload.expires_at);
    const maximum = type === "method-control-request" ? 60000 : 3600000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > maximum) {
      result.push(failure("METHOD_CONTROL_TIME_INVALID", "The control channel and each request have finite positive validity."));
    }
  }
  if (type === "method-control-request" && payload.input_sha256 !== digest(payload.arguments)) {
    result.push(failure("METHOD_CONTROL_INPUT_MISMATCH", "A request commits to exact bounded tool arguments."));
  }
  if (type === "method-control-request") {
    try { assertArguments(payload.operation, payload.arguments); }
    catch { result.push(failure("METHOD_CONTROL_ARGUMENTS_INVALID", "Operations accept only their exact bounded request fields.")); }
  }
  if ((type === "mission-wave-plan" && payload.method_control) || type === "method-control-baseline") {
    const value = type === "mission-wave-plan" ? payload.method_control : payload;
    if ((value.schema_version === "0.2") !== Boolean(value.broker)) result.push(failure("METHOD_CONTROL_REVIEW_REQUIRED", "Only a newly reviewed method baseline v0.2 may contain a broker policy."));
  }
  if (type === "agent-context-pack" && payload.method_assignment) {
    const value = payload.method_assignment, broker = value.broker;
    if ((value.schema_version === "0.2") !== Boolean(broker) ||
        value.control_channel !== (broker ? "enrolled_mcp_stdio_reference" : "trusted_operator_control_plane") ||
        (broker && (!same(broker.operations, OPERATIONS) || !payload.documents.some(item => item.path === DOCUMENT) ||
          !payload.validation_commands.includes(CHECK) || !payload.required_controls.some(item => item.command === CHECK)))) {
      result.push(failure("METHOD_CONTROL_CONTEXT_INVALID", "The receiver must acknowledge the exact enrolled channel, finite operations and required procedure."));
    }
  }
  return result;
}
module.exports = { DOCUMENT, CHECK, OPERATIONS, RECORDS, TYPES, NON_WORK_TYPES, AUTHORITY, CODE, ARGUMENTS, assertArguments, runtimeDigest, identified, pocket, issues };
