const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { digest, same } = require("./order-intake-contract");
const TYPES = new Set(["dispatch-lease-issuance-request", "dispatch-lease-issuance-resolution"]);
const NON_WORK_TYPES = new Set(["DispatchLeaseIssuanceRequest", "DispatchLeaseIssuanceResolution"]);
const REQUESTS = "dispatch-lease-issuance-requests", RESOLUTIONS = "dispatch-lease-issuance-resolutions";
const AUTHORITY = Object.freeze({ execution_authorized: false, continuation_authorized: false, release_authorized: false,
  human_final_decision_authority: "USER" });
const CODE = ["dispatch-runtime-controller.js", "dispatch-issuance-contract.js", "repository-artifact-store.js", "repository-lease.js",
  "intent-continuity-contract.js", "method-deviation-gate.js", "method-control-broker.js", "order-adoption-controller.js",
  "order-revision-controller.js", "skill-mission-controller.js", "semantic-control-types.js", "operator-model-reconciliation-contract.js",
  "schema-files/operator-model-reconciliation-authorization.schema.json", "schema-files/operator-model-reconciliation-record.schema.json",
  "operator-reconciliation-contract-core.js", "operator-analysis-reconciliation-contract.js", "operator-analysis-publication.js",
  "schema-files/operator-analysis-reconciliation-authorization.schema.json", "schema-files/operator-analysis-reconciliation-record.schema.json",
  "operator-semantic-evaluation-contract.js", "schema-files/operator-semantic-evaluation.schema.json", "semantic-omission-contract.js",
  "codex-bounded-collector.js", "codex-order-analysis-collector.js", "order-analysis-generation-contract.js", "order-analysis-generator.js", "operator-order-analysis-contract.js",
  "order-intake-contract.js", "request-order-compiler.js",
  "schema-files/order-analysis-response.schema.json", "schema-files/operator-order-analysis.schema.json",
  "requirement-inventory-contract.js", "requirement-inventory-controller.js", "order-adoption-contract.js",
  "bounded-planning-contract.js", "bounded-planning-controller.js", "schema-files/bounded-planning-request.schema.json", "schema-files/bounded-planning-proposal.schema.json",
  "schema-files/requirement-inventory.schema.json", "schema-files/semantic-coverage-proposal.schema.json", "schema-files/semantic-review-assignment.schema.json",
  "schema-files/order-adoption-common.schema.json", "schema-files/order-adoption-proposal-request.schema.json",
  "schema-files/order-adoption-proposal.schema.json", "schema-files/order-adoption-decision-request.schema.json", "schema-files/order-adoption-record.schema.json",
  "validator-cli-prototype/validate.js", "operational-cop-contract.js", "schema-files/operational-cop.schema.json", "package-lock.json",
  "schema-files/agent-dispatch-lease.schema.json", "schema-files/dispatch-lease-issuance-request.schema.json",
  "schema-files/dispatch-lease-issuance-resolution.schema.json"];
const none = value => value?.artifact_id === "none" && value.relative_path === "none" && value.sha256 === "none";
function runtimeDigest() {
  return digest(CODE.map(file => ({ file, sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, file))).digest("hex") })));
}
function identified(type, body) {
  const value = { schema_version: "0.1", type, ...body, ...AUTHORITY };
  return { ...value, id: `DLI-${digest(value).slice(0, 40)}` };
}
function leaseForRequest(request) {
  return { ...request.payload.planned_lease, schema_version: "0.2", issuance_ref: request.ref };
}
function issues(payload, type) {
  if (!TYPES.has(type)) return [];
  const result = [], fail = (code, message) => result.push({ severity: "critical", code, path: "$", message });
  const { id, ...body } = payload;
  if (id !== `DLI-${digest(body).slice(0, 40)}`) fail("DISPATCH_ISSUANCE_ID_MISMATCH", "Issuance records commit to their complete body.");
  if (type === "dispatch-lease-issuance-request") {
    const lease = payload.planned_lease, supersession = payload.planned_supersession;
    if (!["mission_id", "wave_id", "agent_id"].every(key => payload[key] === lease[key]) ||
        lease.schema_version !== "0.1" || lease.issued_at !== payload.recorded_at || lease.not_before !== payload.recorded_at ||
        lease.expires_at !== payload.expires_at) fail("DISPATCH_ISSUANCE_DRAFT_BINDING_INVALID", "The frozen draft must preserve exact scope, issuance time and expiry.");
    const start = Date.parse(payload.recorded_at), end = Date.parse(payload.expires_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86400000) {
      fail("DISPATCH_ISSUANCE_TIME_INVALID", "Recovery has positive finite validity and cannot renew the frozen lease.");
    }
    if (lease.issuance_reason === "initial" ? (!none(lease.previous_lease_ref) || !none(payload.interruption_checkpoint_ref) || supersession !== null) :
      (none(lease.previous_lease_ref) || none(payload.interruption_checkpoint_ref) || !supersession ||
        supersession.checkpoint_kind !== "supersession" || supersession.lease_status !== "superseded" ||
        !same(supersession.lease_ref, lease.previous_lease_ref) || !same(supersession.previous_checkpoint_ref, payload.interruption_checkpoint_ref) ||
        !same(supersession.repository_state, lease.initial_repository_state) || supersession.recorded_at !== payload.recorded_at ||
        !["mission_id", "wave_id", "agent_id", "provider"].every(key => supersession[key] === lease[key]))) {
      fail("DISPATCH_ISSUANCE_PREDECESSOR_INVALID", "Only an exact interrupted predecessor may have a frozen supersession.");
    }
  } else if (!payload.reason.trim() || (payload.outcome === "committed" && (none(payload.lease_ref) || none(payload.baseline_ref))) ||
      (!none(payload.baseline_ref) && none(payload.lease_ref))) {
    fail("DISPATCH_ISSUANCE_RESOLUTION_INVALID", "Commit requires actual lease and baseline references; cancellation never invents them.");
  }
  return result;
}
module.exports = { TYPES, NON_WORK_TYPES, REQUESTS, RESOLUTIONS, AUTHORITY, CODE, none, runtimeDigest, identified, leaseForRequest, issues };
