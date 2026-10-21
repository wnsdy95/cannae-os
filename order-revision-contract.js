const { digest, same } = require("./order-intake-contract");
const { ADOPTION_AUTHORITY } = require("./order-adoption-contract");

const REVISION_TYPES = new Set(["order-revision-request", "order-revision-proposal"]);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function planChanges(before, after, pointer = "") {
  if (object(before) && object(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(key => {
      const location = `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (!Object.hasOwn(before, key)) return [{ path: location, change: "added", after: after[key] }];
      if (!Object.hasOwn(after, key)) return [{ path: location, change: "removed", before: before[key] }];
      return planChanges(before[key], after[key], location);
    });
  }
  return [{ path: pointer || "/", change: same(before, after) ? "retained" : "changed", before, after }];
}

function revisionPayload(request, parentPlan, draft, manifest, now) {
  return {
    schema_version: "0.1", type: "OrderRevisionProposal", id: `ORP-${digest(request).slice(0, 32)}`,
    mission_id: request.mission_id, wave_id: request.wave_id, request, request_sha256: digest(request),
    parent_plan_sha256: digest(parentPlan), successor_plan_sha256: digest(request.successor_plan),
    classification: parentPlan.mission_profile.classification,
    changes: planChanges(parentPlan, request.successor_plan), observed_manifest: manifest,
    recorded_at: now, expires_at: new Date(Math.min(Date.parse(now) + 3600000,
      Date.parse(draft.expires_at), Date.parse(request.successor_plan.valid_until))).toISOString(),
    ...ADOPTION_AUTHORITY
  };
}

function revisionPlan(proposal, reference) {
  const plan = JSON.parse(JSON.stringify(proposal.request.successor_plan));
  plan.order_binding.revision_ref = reference;
  plan.valid_until = new Date(Math.min(Date.parse(plan.valid_until), Date.parse(proposal.expires_at))).toISOString();
  return plan;
}

function revisionIssues(payload, type) {
  const issues = [];
  const add = (code, message) => issues.push({ severity: "critical", code, path: "$", message });
  const request = type === "order-revision-proposal" ? payload.request : payload;
  if (!REVISION_TYPES.has(type)) return issues;
  if (request.successor_plan.schema_version !== "0.2" || request.successor_plan.order_binding.revision_ref ||
      request.mission_id !== request.successor_plan.mission_id || request.wave_id !== request.successor_plan.wave_id) {
    add("ORDER_REVISION_PLAN_SCOPE_INVALID", "A revision reviews one complete unbound adopted-plan version in its exact successor scope.");
  }
  if (type === "order-revision-proposal") {
    if (payload.classification !== request.successor_plan.mission_profile.classification) {
      add("ORDER_REVISION_CLASSIFICATION_INVALID", "The full comparison must retain the reviewed scope's handling level.");
    }
    if (payload.id !== `ORP-${digest(request).slice(0, 32)}` || payload.request_sha256 !== digest(request) ||
        payload.successor_plan_sha256 !== digest(request.successor_plan) || payload.mission_id !== request.mission_id ||
        payload.wave_id !== request.wave_id) add("ORDER_REVISION_BINDING_INVALID", "The proposal must bind its complete revision request and successor plan.");
    const start = Date.parse(payload.recorded_at), end = Date.parse(payload.expires_at);
    if (!(start < end) || end - start > 3600000) add("ORDER_REVISION_VALIDITY_INVALID", "Revision review has a positive lifetime of at most one hour.");
  }
  return issues;
}

module.exports = { REVISION_TYPES, planChanges, revisionPayload, revisionPlan, revisionIssues };
