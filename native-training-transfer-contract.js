const { z } = require("zod"), t = require("./task-training-contract");
const { validOperatorSignature } = require("./operator-consent-contract");
const hex = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Z]+-[A-Za-z0-9_-]+$/).max(128), time = z.iso.datetime({ offset: true });
const flags = Object.fromEntries(Object.entries(t.FLAGS).map(([key, value]) => [key, z.literal(value)]));
const signature = z.strictObject({ algorithm: z.literal("Ed25519"), key_sha256: hex, value: z.string().regex(/^[A-Za-z0-9+/]{86}==$/) });
const record = z.record(z.string(), z.unknown());
const REVIEW = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("NativeTrainingTransferReviewRequest"), id,
  request_ref: t.ref, mission_id: id, wave_id: z.string().min(1).max(128), prompt_sha256: hex,
  labels: z.array(record).min(2).max(32), releasability_review: record, release_review: record,
  mission_eefi_items: z.array(z.strictObject({ id, term: z.string().min(1).max(256), class: z.enum(["output_forbidden", "tool_transfer_forbidden"]) })).max(32),
  created_at: time, expires_at: time, ...flags });
const AUTHORIZATION = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("NativeTrainingTransferAuthorization"), id,
  purpose: z.literal("authorize_one_reviewed_native_training_transfer"), action_id: z.uuid(), request_ref: t.ref, transfer_review_ref: t.ref,
  invocation_sha256: hex, preview_sha256: hex, displayed_invocation_sha256: hex, principal_id: z.uuid(), principal_epoch: z.number().int().min(1),
  authentication_method: z.literal("local_owner_password_reauthentication"), session_sha256: hex, nonce_sha256: hex, rationale_sha256: hex,
  mission_handling_acknowledged: z.literal(true), handling_completeness_independently_attested: z.literal(false),
  created_at: time, expires_at: time, ...flags, signature });
const RESULT = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("OperatorNativeTrainingProduct"), id, action_id: z.uuid(),
  status: z.enum(["collected", "held"]), invocation_sha256: hex, consent_sha256: hex, authorization_sha256: hex, rationale_sha256: hex,
  ended_at: time, collection: z.strictObject({ status: z.enum(["evaluated", "not_evaluated"]), journal_sha256: hex.nullable(),
    process_exit_confirmed: z.boolean(), process_group_absent: z.boolean(), stdout_sha256: hex, stderr_sha256: hex,
    response_sha256: hex.nullable(), failure_reasons: z.array(z.string().regex(/^(?:CONSOLE|SEMANTIC)_[A-Z0-9_]+$/)).max(100) }).nullable(),
  appraisal: require("./native-training-product-contract").APPRAISAL.nullable(), output_ref: t.ref.nullable(), authorization_ref: t.ref.nullable(),
  retained_artifact_refs: z.array(t.ref).max(3), error: z.string().regex(/^(?:CONSOLE|SEMANTIC)_[A-Z0-9_]+$/).nullable(),
  task_standard_evaluated: z.literal(false), evaluator_authenticated: z.literal(false), publication_finality_independently_attested: z.literal(false), ...flags, signature });
const SCHEMAS = { "native-training-transfer-review-request": REVIEW, "native-training-transfer-authorization": AUTHORIZATION, "operator-native-training-product": RESULT };
const KINDS = { reviews: "task-training-transfer-reviews", authorizations: "task-training-transfer-authorizations", outputs: "task-training-native-outputs", results: "task-training-native-results" };
const need = (value, code) => { if (!value) throw new Error(code); };
function issues(value, type) {
  if (!SCHEMAS[type]) return [];
  const codes = [], add = code => codes.push({ severity: "critical", code, path: "$", message: "A reviewed native transfer is not a grade, qualification or general release." });
  if (type === "native-training-transfer-review-request") {
    const { id, ...body } = value; if (t.identified("NTDR", body).id !== id) add("NATIVE_TRAINING_REVIEW_ID_INVALID");
    if (!(Date.parse(value.expires_at) > Date.parse(value.created_at) && Date.parse(value.expires_at) - Date.parse(value.created_at) <= 86400000)) add("NATIVE_TRAINING_REVIEW_WINDOW_INVALID");
    const validate = require("./validator-cli-prototype/validate").validatePayload;
    for (const [nested, schema] of [...value.labels.map(label => [label, "classification-label"]),
      [value.releasability_review, "releasability-review"], [value.release_review, "release-review"]]) if (!validate(nested, schema).valid) add("NATIVE_TRAINING_NESTED_REVIEW_INVALID");
    if (new Set(value.labels.map(label => label.id)).size !== value.labels.length || new Set(value.mission_eefi_items.map(item => item.id)).size !== value.mission_eefi_items.length ||
        value.mission_eefi_items.some(item => !item.term.trim())) add("NATIVE_TRAINING_HANDLING_INVENTORY_INVALID");
  } else if (type === "native-training-transfer-authorization") {
    if (value.id !== `NTFA-${value.action_id}` || value.invocation_sha256 !== value.displayed_invocation_sha256 ||
        !(Date.parse(value.expires_at) > Date.parse(value.created_at) && Date.parse(value.expires_at) - Date.parse(value.created_at) <= 120000)) add("NATIVE_TRAINING_AUTHORIZATION_BINDING_INVALID");
  } else {
    if (value.id !== `NTOR-${value.action_id}` || (value.status === "collected" ? (!value.appraisal || !value.output_ref || !value.authorization_ref || value.error ||
        !value.collection?.journal_sha256 || value.collection.status !== "evaluated" || !value.collection.process_exit_confirmed || !value.collection.process_group_absent || value.collection.failure_reasons?.length) :
      value.appraisal !== null || value.output_ref !== null || !value.error)) add("NATIVE_TRAINING_RESULT_BINDING_INVALID");
    if (value.appraisal && (!require("./native-training-product-contract").APPRAISAL.safeParse(value.appraisal).success ||
      require("./native-training-product-contract").issues(value.appraisal, "native-training-product-appraisal").length ||
      value.appraisal.observed_output_sha256 !== value.output_ref?.sha256 || value.appraisal.journal_sha256 !== value.collection?.journal_sha256 ||
      value.appraisal.invocation_sha256 !== value.invocation_sha256 || value.appraisal.consent_sha256 !== value.consent_sha256)) add("NATIVE_TRAINING_APPRAISAL_INVALID");
  }
  return codes;
}
function checked(value, type) {
  require("./workload-control-contract").assertJsonLimits(value);
  need(Buffer.byteLength(JSON.stringify(value)) <= 262144 && SCHEMAS[type]?.safeParse(value).success, "SEMANTIC_TRAINING_TRANSFER_CONTRACT_INVALID");
  const failures = issues(value, type); need(!failures.length, failures[0]?.code); return value;
}
function review(input) { return checked(t.identified("NTDR", { schema_version: "0.1", type: "NativeTrainingTransferReviewRequest", ...input, ...t.FLAGS }), "native-training-transfer-review-request"); }
function verifySigned(value, type, key) { checked(value, type); need(validOperatorSignature(value, key), "CONSOLE_TRAINING_TRANSFER_SIGNATURE_INVALID"); return value; }
function validateReview(value, input, requestRef, at, retainedLabels = []) {
  checked(value, "native-training-transfer-review-request");
  const { request, standard } = input, now = Date.parse(at), classification = request.classification;
  need(t.digest(value.request_ref) === t.digest(requestRef) && value.mission_id === request.mission_id && value.wave_id === request.wave_id &&
    value.prompt_sha256 === require("./order-intake-contract").sha256(Buffer.from(require("./native-training-product-contract").promptFor(input))) &&
    Date.parse(value.created_at) <= now && now < Date.parse(value.expires_at), "SEMANTIC_TRAINING_TRANSFER_REVIEW_SUBSTITUTED");
  const required = new Set([request.id, standard.id]), rank = { public: 0, internal: 1, sensitive: 2, restricted: 3 };
  for (const [label, retained] of [...value.labels.map(label => [label, false]), ...retainedLabels.map(label => [label, true])]) {
    const missions = retained && label.subject_id === standard.id ? [request.mission_id, input.source_standard?.mission_id || request.mission_id] : [request.mission_id];
    need(required.has(label.subject_id) && missions.includes(label.mission_id) && label.eefi_class === "none" &&
      ["partner", "public"].includes(label.releasability) && rank[label.classification] <= rank[classification] &&
      now < Date.parse(label.review_by), "SEMANTIC_TRAINING_TRANSFER_LABEL_DENIED");
    need(label.classification === "public" || label.need_to_know_roles.includes(input.context.operational_role), "SEMANTIC_TRAINING_TRANSFER_ROLE_DENIED");
  }
  need([...required].every(subject => value.labels.some(label => label.subject_id === subject)) && value.labels.every(label => label.labeling_authority === "USER"),
    "SEMANTIC_TRAINING_TRANSFER_LABEL_SCOPE_INVALID");
  const per = value.releasability_review, release = value.release_review;
  need(per.mission_id === request.mission_id && t.digest(per.artifact) === t.digest(requestRef) && per.requested_audience === "partner" && per.reviewer === "USER" &&
    per.decision === "release" && per.release_review_id === release.id && Date.parse(per.reviewed_at) <= now && now < Date.parse(per.expires_at) &&
    !per.findings.some(finding => ["error", "critical"].includes(finding.severity)) && per.labels.length === value.labels.length &&
    value.labels.every(label => per.labels.some(item => item.label_id === label.id && item.classification === label.classification && item.eefi_class === label.eefi_class)),
  "SEMANTIC_TRAINING_TRANSFER_RELEASABILITY_DENIED");
  need(release.mission_id === request.mission_id && release.reviewer === "USER" && release.target === "external_tool" && release.decision === "approve" &&
    release.classification === classification && Date.parse(release.created_at) <= now && release.items.length === 1 &&
    release.items[0].item_id === request.id && release.items[0].classification === classification && !release.items[0].eefi && release.items[0].delivery_mode === "raw",
  "SEMANTIC_TRAINING_TRANSFER_RELEASE_DENIED");
  const target = "external_tool", filtered = require("./context-filter-prototype/context-filter").filterContext([{ id: request.id, classification,
    eefi: false, allowed_roles: [target], raw_value: require("./native-training-product-contract").promptFor(input), summary: "", source: requestRef.relative_path }], target);
  need(filtered.items[0].delivery_mode === "raw" && require("./release-review-runner").evaluateRelease(release, filtered, target).length === 0,
    "SEMANTIC_TRAINING_TRANSFER_FILTER_DENIED");
  const detector = require("./eefi-detector");
  if (value.mission_eefi_items.length) need(!detector.detectEefi({ prompt: require("./native-training-product-contract").promptFor(input) },
    detector.compileEefiItems(value.mission_eefi_items)).length, "SEMANTIC_TRAINING_MISSION_TRANSFER_DENIED");
  return Math.min(Date.parse(value.expires_at), Date.parse(per.expires_at), ...value.labels.map(label => Date.parse(label.review_by)), ...retainedLabels.map(label => Date.parse(label.review_by)));
}
module.exports = { SCHEMAS, REVIEW, AUTHORIZATION, RESULT, KINDS, issues, checked, review, verifySigned, validateReview, need };
