const { z } = require("zod"), t = require("./task-training-contract");
const { validOperatorSignature } = require("./operator-consent-contract");
const PURPOSE = "task_training_session_enrollment", ACK = "session_mapping_only_no_training_grade_or_grant";
const KINDS = Object.freeze({ proposals: "task-training-session-proposals", authorizations: "task-training-session-authorizations", bindings: "task-training-session-bindings" });
const hex = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Z]+-[A-Za-z0-9_-]+$/).max(128), time = z.iso.datetime({ offset: true });
const flags = { execution_authorized: z.literal(false), release_authorized: z.literal(false), human_final_decision_authority: z.literal("USER"),
  qualification_granted: z.literal(false), grant_restoration_authorized: z.literal(false) };
const REQUEST = z.strictObject({ mission_id: id, wave_id: z.string().min(1).max(128), capability_id: z.string().regex(/^CAP-[A-Za-z0-9_-]+$/),
  performer_id: z.string().regex(/^PERF-[A-Za-z0-9_-]+$/), expected_registry_head_ref: t.ref, lease_ref: t.ref,
  stage: z.enum(["crawl", "walk"]), case_ids: z.array(id).min(1).max(32), expires_at: time });
const PROPOSAL = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("TaskTrainingSessionProposal"), id,
  purpose: z.literal(PURPOSE), request: REQUEST, created_at: time, expires_at: time, ...flags });
const REVIEW = z.strictObject({ proposal_ref: t.ref, proposal: PROPOSAL, registry_head_ref: t.ref,
  repository_binding: z.strictObject({ repository_key: z.string().min(1).max(256), identity_fingerprint: hex }),
  observed_manifest: z.strictObject({ revision: z.number().int().min(1), sha256: hex }), source_state_sha256: hex, repository_state_sha256: hex,
  capability: z.json(), performer: z.json(), standard_ref: t.ref, standard: t.STANDARD,
  lease: z.json(), context_ref: t.ref, context: z.json(), policy_ref: t.ref, policy: z.json() });
const AUTHORIZATION = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("TaskTrainingSessionAuthorization"), id,
  purpose: z.literal(PURPOSE), acknowledgment: z.literal(ACK), challenge_id: z.uuid(), principal_id: z.uuid(), principal_epoch: z.number().int().min(1),
  authentication_method: z.literal("local_owner_password_reauthentication"), session_sha256: hex, nonce_sha256: hex,
  created_at: time, expires_at: time, rationale: z.string().trim().min(1).max(2000), review: REVIEW, review_sha256: hex, displayed_review_sha256: hex,
  ...flags, signature: z.strictObject({ algorithm: z.literal("Ed25519"), key_sha256: hex, value: z.string().min(1).max(128) }) });
const SCHEMAS = Object.freeze({ "training-session-proposal": PROPOSAL, "training-session-authorization": AUTHORIZATION });
const NON_WORK_TYPES = new Set(["TaskTrainingSessionProposal", "TaskTrainingSessionAuthorization"]);
function issues(value, type) {
  if (!SCHEMAS[type]) return [];
  const result = [], add = code => result.push({ severity: "critical", code, path: "$", message: code });
  const proposal = type === "training-session-proposal" ? value : value.review.proposal, request = proposal.request;
  const { id: proposalId, ...body } = proposal;
  if (proposalId !== t.identified("TSP", body).id) add("TRAINING_SESSION_PROPOSAL_ID_INVALID");
  const start = Date.parse(proposal.created_at), end = Date.parse(proposal.expires_at);
  if (!(end > start && end - start <= 600000 && end <= Date.parse(request.expires_at))) add("TRAINING_SESSION_PROPOSAL_WINDOW_INVALID");
  if (new Set(request.case_ids).size !== request.case_ids.length) add("TRAINING_SESSION_CASE_DUPLICATE");
  if (type === "training-session-authorization") {
    const review = value.review;
    if (value.id !== `TSA-${value.challenge_id}` || value.review_sha256 !== t.digest(review) || value.displayed_review_sha256 !== value.review_sha256 ||
      review.proposal_ref.artifact_id !== proposal.id || t.digest(review.registry_head_ref) !== t.digest(request.expected_registry_head_ref)) add("TRAINING_SESSION_AUTHORIZATION_SUBJECT_INVALID");
    const from = Date.parse(value.created_at), to = Date.parse(value.expires_at);
    if (!(from >= start && to > from && to - from <= 120000 && to <= end)) add("TRAINING_SESSION_AUTHORIZATION_WINDOW_INVALID");
    for (const [field, childType] of [["capability", "force-registry-entity"], ["performer", "force-registry-entity"], ["standard", "task-training-standard"],
      ["lease", "agent-dispatch-lease"], ["context", "agent-context-pack"], ["policy", "dispatch-tool-policy"]]) {
      if (!require("./validator-cli-prototype/validate").validatePayload(review[field], childType).valid) add("TRAINING_SESSION_REVIEW_CHILD_INVALID");
    }
    if (result.some(item => item.code === "TRAINING_SESSION_REVIEW_CHILD_INVALID")) return result;
    if (review.capability?.id !== request.capability_id || review.performer?.id !== request.performer_id || review.lease?.id !== request.lease_ref.artifact_id ||
      review.context?.id !== review.context_ref.artifact_id || review.policy?.id !== review.policy_ref.artifact_id || review.standard?.capability_id !== request.capability_id) add("TRAINING_SESSION_REVIEW_SCOPE_INVALID");
    if (review.capability.kind !== "capability" || review.performer.kind !== "performer" || review.lease.schema_version !== "0.2" ||
      t.digest(review.context_ref) !== t.digest(review.lease.context_pack_ref) || t.digest(review.policy_ref) !== t.digest(review.lease.tool_policy_ref) ||
      t.digest(review.standard_ref) !== t.digest(review.capability.data.standard_ref) ||
      !request.case_ids.every(id => review.standard.cases.some(item => item.case_id === id && item.stage === request.stage))) add("TRAINING_SESSION_REVIEW_SCOPE_INVALID");
    if (!(Date.parse(request.expires_at) <= Math.min(Date.parse(review.standard.expires_at), Date.parse(review.lease.expires_at)) &&
      Date.parse(value.created_at) >= Math.max(Date.parse(review.standard.created_at), Date.parse(review.lease.not_before)))) add("TRAINING_SESSION_AUTHORIZATION_WINDOW_INVALID");
  }
  return result;
}
function checked(value, type) {
  require("./workload-control-contract").assertJsonLimits(value);
  t.need(Buffer.byteLength(JSON.stringify(value, null, 2) + "\n") <= 196608, "TRAINING_SESSION_RECORD_TOO_LARGE");
  t.need(SCHEMAS[type]?.safeParse(value).success, "TRAINING_SESSION_CONTRACT_INVALID");
  const found = issues(value, type); t.need(!found.length, found[0]?.code); return value;
}
function proposal(request, now = new Date().toISOString()) {
  const expires = new Date(Math.min(Date.parse(now) + 600000, Date.parse(request.expires_at))).toISOString();
  return checked(t.identified("TSP", { schema_version: "0.1", type: "TaskTrainingSessionProposal", purpose: PURPOSE, request,
    created_at: now, expires_at: expires, ...t.FLAGS }), "training-session-proposal");
}
function verifyAuthorization(value, key) {
  checked(value, "training-session-authorization"); t.need(key && validOperatorSignature(value, key), "TRAINING_SESSION_SIGNATURE_INVALID"); return value;
}
function bindingBody(value, authorizationRef) {
  const review = value.review, request = review.proposal.request;
  return { schema_version: "0.2", type: "TaskTrainingSessionBinding", id: `TSB-${value.challenge_id}`, purpose: "task_training_session_binding",
    capability_id: request.capability_id, capability_version: review.capability.version, performer_id: request.performer_id, performer_version: review.performer.version,
    configuration_sha256: t.digest(review.performer.data), stage: request.stage, case_ids: request.case_ids, lease_ref: request.lease_ref,
    provider: review.lease.provider, session_binding: review.lease.session_binding, principal_id: value.principal_id, principal_epoch: value.principal_epoch,
    authentication_method: value.authentication_method, created_at: value.created_at, expires_at: request.expires_at,
    authorization_ref: authorizationRef, model_identity_attested: false, ...t.FLAGS };
}
module.exports = { PURPOSE, ACK, KINDS, SCHEMAS, NON_WORK_TYPES, REQUEST, PROPOSAL, REVIEW, AUTHORIZATION, issues, checked, proposal, verifyAuthorization, bindingBody };
