const { digest, sha256, AUTHORITY } = require("./order-intake-contract");
const { NONE } = require("./order-adoption-contract");
const { keyDigest, validOperatorSignature } = require("./operator-consent-contract");
const FLAGS = Object.freeze({ ...AUTHORITY, qualification_granted: false, standing_activation_authorized: false });
const KINDS = Object.freeze({ proposals: "force-registry-proposals", authorizations: "force-registry-authorizations", events: "force-registry-events" });
const TYPES = new Set(["force-registry-entity", "force-registry-request", "force-registry-proposal", "force-registry-authorization", "force-registry-event"]);
const NON_WORK_TYPES = new Set(["ForceRegistryEntity", "ForceRegistryRequest", "ForceRegistryProposal", "ForceRegistryAuthorization", "ForceRegistryEvent", "ForceRegistryInspection"]);
const same = (left, right) => digest(left) === digest(right);
const fail = code => { throw new Error(code); };
const need = (condition, code) => { if (!condition) fail(code); };
const identified = (prefix, body) => ({ ...body, id: `${prefix}-${digest(body).slice(0, 40)}` });
const none = ref => same(ref, NONE);
function entityIssues(entity) {
  const issues = [], add = code => issues.push({ severity: "critical", code, path: "$", message: code });
  const prefix = { organization: "ORG-", capability: "CAP-", performer: "PERF-" }[entity.kind];
  if (!entity.id.startsWith(prefix) || entity.kind !== entity.data.kind) { add("FORCE_ENTITY_KIND_BINDING_INVALID"); return issues; }
  if (entity.kind === "capability") {
    const aliases = entity.data.aliases.map(digest);
    if (new Set(aliases).size !== aliases.length) add("FORCE_ENTITY_ALIAS_DUPLICATE");
  }
  if (entity.kind === "performer" && [entity.data.model_id, entity.data.model_revision].some(value => /^(latest|default|auto|current|not_required|none)$/i.test(value))) add("FORCE_ENTITY_FLOATING_MODEL_INVALID");
  return issues;
}
function issues(value, type) {
  if (!TYPES.has(type)) return [];
  const result = [], add = code => result.push({ severity: "critical", code, path: "$", message: code });
  if (type === "force-registry-entity") return entityIssues(value);
  const prefixes = { "force-registry-request": "FRQ", "force-registry-proposal": "FRP", "force-registry-event": "FRE" };
  if (prefixes[type]) { const { id, ...body } = value; if (id !== identified(prefixes[type], body).id) add("FORCE_REGISTRY_ID_BINDING_INVALID"); }
  if (type === "force-registry-proposal") {
    if (value.request_sha256 !== digest(value.request)) add("FORCE_REGISTRY_REQUEST_BINDING_INVALID");
    const from = Date.parse(value.created_at), to = Date.parse(value.expires_at);
    if (!(to > from && to - from <= 3600000)) add("FORCE_REGISTRY_PROPOSAL_WINDOW_INVALID");
  }
  if (type === "force-registry-authorization") {
    if (value.id !== `FRA-${value.challenge_id}` || value.review_sha256 !== digest(value.review)) add("FORCE_REGISTRY_AUTHORIZATION_BINDING_INVALID");
    const from = Date.parse(value.created_at), to = Date.parse(value.expires_at);
    if (!(to > from && to - from <= 120000) || to > Date.parse(value.review.proposal.expires_at) ||
        from < Date.parse(value.review.proposal.created_at)) add("FORCE_REGISTRY_AUTHORIZATION_WINDOW_INVALID");
    if (!same(value.review.registry_head_ref, value.review.proposal.request.expected_head_ref) ||
        value.review.proposal_ref.artifact_id !== value.review.proposal.id || value.review.next_sequence < 1) add("FORCE_REGISTRY_REVIEW_SCOPE_INVALID");
    const request = value.review.proposal.request, previous = value.review.previous_entity;
    if (request.operation === "enroll" ? previous !== null || request.entity.version !== 1 :
      !previous || previous.id !== request.entity.id || previous.kind !== request.entity.kind || previous.enrollment_state !== "enrolled" || previous.version + 1 !== request.entity.version) add("FORCE_REGISTRY_REVIEW_REVISION_INVALID");
    if ((value.review.next_sequence === 1) !== none(value.review.registry_head_ref)) add("FORCE_REGISTRY_REVIEW_SCOPE_INVALID");
    const references = new Map(request.evidence_refs.map(reference => [digest(reference), reference]));
    if (request.entity.kind === "capability" && request.entity.data.kind === "capability") references.set(digest(request.entity.data.standard_ref), request.entity.data.standard_ref);
    const observed = value.review.materials.map(item => digest(item.reference));
    if (new Set(observed).size !== observed.length || !same([...references.keys()].sort(), [...observed].sort()) ||
        value.review.materials.some(item => item.text_sha256 !== item.reference.sha256)) add("FORCE_REGISTRY_REVIEW_MATERIAL_INVALID");
    if (!observed.length && value.displayed_review_sha256 !== value.review_sha256) add("FORCE_REGISTRY_DISPLAY_BINDING_INVALID");
  }
  if (["force-registry-request", "force-registry-event"].includes(type) && ((value.operation === "retire") !== (value.entity.enrollment_state === "retired"))) add("FORCE_REGISTRY_OPERATION_STATE_INVALID");
  return result;
}
function createRequest(input) { return identified("FRQ", { schema_version: "0.1", type: "ForceRegistryRequest", purpose: "force_registry_enrollment", ...input, ...FLAGS }); }
function createProposal(request, now = new Date().toISOString()) {
  return identified("FRP", { schema_version: "0.1", type: "ForceRegistryProposal", purpose: "force_registry_enrollment", request,
    request_sha256: digest(request), created_at: now, expires_at: new Date(Date.parse(now) + 1800000).toISOString(), ...FLAGS });
}
function publicReview(review) {
  return { ...review, materials: review.materials.map(item => ({ reference: item.reference, text_sha256: sha256(Buffer.from(item.text)) })) };
}
function transition(entities, aliases, request) {
  const proposed = request.entity, previous = entities.get(proposed.id) || null;
  if (request.operation === "enroll") need(!previous && proposed.version === 1 && proposed.enrollment_state === "enrolled", "FORCE_REGISTRY_ENROLLMENT_CONFLICT");
  else need(previous && previous.enrollment_state === "enrolled" && previous.kind === proposed.kind && proposed.version === previous.version + 1,
    "FORCE_REGISTRY_REVISION_INVALID");
  need(entities.size < 256 || previous, "FORCE_REGISTRY_ENTITY_LIMIT");
  const next = new Map(entities); next.set(proposed.id, proposed);
  const enrolled = id => next.get(id)?.kind === "organization" && next.get(id)?.enrollment_state === "enrolled";
  for (const entity of next.values()) {
    if (entity.enrollment_state !== "enrolled") continue;
    if (entity.kind === "organization") {
      let parent = entity.data.parent_id; const seen = new Set([entity.id]);
      while (parent !== "none") {
        need(enrolled(parent) && !seen.has(parent), "FORCE_REGISTRY_ORGANIZATION_PARENT_INVALID");
        seen.add(parent); parent = next.get(parent).data.parent_id;
      }
    } else need(enrolled(entity.data.owner_id), "FORCE_REGISTRY_OWNER_UNAVAILABLE");
  }
  if (proposed.kind === "capability") for (const alias of proposed.data.aliases) {
    const priorOwner = aliases.get(digest(alias));
    need(!priorOwner || priorOwner === proposed.id, "FORCE_REGISTRY_ALIAS_HISTORY_CONFLICT");
  }
  return { previous, next, entity: proposed };
}
function verifyAuthorization(value, trustedPublicKey) {
  require("./workload-control-contract").assertJsonLimits(value);
  need(Buffer.byteLength(JSON.stringify(value, null, 2) + "\n") <= 262144, "FORCE_REGISTRY_RECORD_TOO_LARGE");
  need(trustedPublicKey && validOperatorSignature(value, trustedPublicKey), "FORCE_REGISTRY_OPERATOR_SIGNATURE_INVALID");
  need(value.signature.key_sha256 === keyDigest(trustedPublicKey), "FORCE_REGISTRY_OPERATOR_KEY_MISMATCH");
  const validation = require("./validator-cli-prototype/validate").validatePayload(value, "force-registry-authorization");
  need(validation.valid, "FORCE_REGISTRY_AUTHORIZATION_INVALID"); return value;
}
function eventForAuthorization(authorization, authorizationRef) {
  const review = authorization.review;
  return identified("FRE", { schema_version: "0.1", type: "ForceRegistryEvent", purpose: "force_registry_enrollment",
    sequence: review.next_sequence, previous_ref: review.registry_head_ref, authorization_ref: authorizationRef,
    proposal_ref: review.proposal_ref, operation: review.proposal.request.operation, entity: review.proposal.request.entity,
    repository_binding: review.repository_binding, recorded_at: authorization.created_at, ...FLAGS });
}
module.exports = { FLAGS, KINDS, TYPES, NON_WORK_TYPES, NONE, digest, same, need, none, identified, issues,
  transition, createRequest, createProposal, publicReview, verifyAuthorization, eventForAuthorization };
