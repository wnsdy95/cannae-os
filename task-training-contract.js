const { z } = require("zod");
const { digest, AUTHORITY } = require("./order-intake-contract");
const FLAGS = Object.freeze({ ...AUTHORITY, qualification_granted: false, grant_restoration_authorized: false });
const hex = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Z]+-[A-Za-z0-9_-]+$/).max(128);
const text = z.string().min(1).max(2048), time = z.iso.datetime({ offset: true });
const ref = z.strictObject({ artifact_id: id, relative_path: z.string().min(1).max(4096), sha256: hex });
const flags = { execution_authorized: z.literal(false), release_authorized: z.literal(false), human_final_decision_authority: z.literal("USER"),
  qualification_granted: z.literal(false), grant_restoration_authorized: z.literal(false) };
const step = z.strictObject({ step_id: id, standard: text, critical: z.boolean(),
  evidence_class: z.enum(["task_product", "boundary_behavior"]), not_applicable_permitted: z.boolean() });
const trainingCase = z.strictObject({ case_id: id, stage: z.enum(["crawl", "walk"]), tool_name: z.string().min(1).max(256),
  tool_input_sha256: hex, output_pointer: z.enum(["/stdout", "/content"]), minimum_output_bytes: z.number().int().min(0).max(65536), conditions: z.array(text).min(1).max(16) });
const STANDARD = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("TaskTrainingStandard"), id,
  capability_id: z.string().regex(/^CAP-[A-Za-z0-9_-]+$/), metl_id: id, metl_task_id: id,
  performer_organization_id: z.string().regex(/^ORG-[A-Za-z0-9_-]+$/), version: z.number().int().min(1),
  created_at: time, expires_at: time, sustainment_seconds: z.number().int().min(60).max(2592000),
  minimum_distinct_trials: z.number().int().min(3).max(16), steps: z.array(step).min(1).max(16),
  cases: z.array(trainingCase).min(3).max(32), ...flags });
const TRIAL = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("TaskTrainingTrialRequest"), id,
  mission_id: id, wave_id: z.string().min(1).max(128), capability_id: z.string().regex(/^CAP-[A-Za-z0-9_-]+$/),
  performer_id: z.string().regex(/^PERF-[A-Za-z0-9_-]+$/), registry_head_ref: ref, case_id: id,
  session_binding_ref: ref, lease_ref: ref, completion_ref: ref, completion_input_ref: ref, observed_output_ref: ref, ...flags });
const LEGACY_SESSION = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("TaskTrainingSessionBinding"), id,
  purpose: z.literal("task_training_session_binding"), capability_id: z.string().regex(/^CAP-[A-Za-z0-9_-]+$/), capability_version: z.number().int().min(1),
  performer_id: z.string().regex(/^PERF-[A-Za-z0-9_-]+$/), performer_version: z.number().int().min(1), configuration_sha256: hex,
  stage: z.enum(["crawl", "walk"]), case_ids: z.array(id).min(1).max(32),
  lease_ref: ref, provider: z.enum(["codex", "claude_code"]),
  session_binding: z.strictObject({ session_id: z.string().min(1).max(128), provider_agent_id: z.string().min(1).max(128) }),
  principal_id: z.uuid(), principal_epoch: z.number().int().min(1),
  authentication_method: z.literal("local_owner_password_reauthentication"), created_at: time, expires_at: time,
  model_identity_attested: z.literal(false), ...flags,
  signature: z.strictObject({ algorithm: z.literal("Ed25519"), key_sha256: hex, value: z.string().min(1).max(128) }) });
const SESSION = z.union([LEGACY_SESSION, LEGACY_SESSION.extend({ schema_version: z.literal("0.2"), authorization_ref: ref })]);
const COMPLETION_INPUT = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("TaskTrainingCompletionInput"), id,
  hook_input: z.strictObject({ hook_event_name: z.enum(["PostToolUse", "PostToolUseFailure"]), tool_name: z.string().min(1).max(256),
    tool_use_id: z.string().min(1).max(512), tool_input: z.record(z.string(), z.json()), tool_response: z.json() }), ...flags });
const LEGACY_APPRAISAL = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("TaskTrainingTrialAppraisal"), id,
  request: TRIAL, request_sha256: hex, source_state_sha256: hex,
  repository_binding: z.strictObject({ repository_key: z.string().min(1).max(256), identity_fingerprint: hex }),
  observed_manifest: z.strictObject({ revision: z.number().int().min(1), sha256: hex }), registry_head_ref: ref,
  capability_sha256: hex, performer_sha256: hex, standard_ref: ref, case_id: id, stage: z.enum(["crawl", "walk"]),
  admission_ref: ref, completion_ref: ref, execution_succeeded: z.boolean(), observed_output_sha256: hex,
  status: z.literal("observed_result_bound"), valid_for_training_review_until: time,
  actual_model_execution_attested: z.literal(false), configuration_attested: z.literal(false),
  conditions_observed: z.literal(false), task_standard_evaluated: z.literal(false), evaluator_authenticated: z.literal(false), ...flags });
const APPRAISAL = z.union([LEGACY_APPRAISAL, LEGACY_APPRAISAL.extend({ schema_version: z.literal("0.2"), owner_session_ceremony_verified: z.boolean() })]);
const SCHEMAS = Object.freeze({ "task-training-standard": STANDARD, "task-training-trial-request": TRIAL,
  "task-training-completion-input": COMPLETION_INPUT, "task-training-session-binding": SESSION, "task-training-trial-appraisal": APPRAISAL });
const NON_WORK_TYPES = new Set(["TaskTrainingStandard", "TaskTrainingTrialRequest", "TaskTrainingCompletionInput", "TaskTrainingSessionBinding", "TaskTrainingTrialAppraisal"]);
function need(condition, code) { if (!condition) throw new Error(code); }
function identified(prefix, body) { return { ...body, id: `${prefix}-${digest(body).slice(0, 40)}` }; }
function issues(value, type) {
  if (!SCHEMAS[type]) return [];
  const result = [], add = code => result.push({ severity: "critical", code, path: "$", message: "Training input binds observed evidence, never a grade or authority grant." });
  if (type === "task-training-standard") {
    if (value.steps.some(item => !item.standard.trim()) || value.cases.some(item => item.conditions.some(condition => !condition.trim()))) add("TRAINING_STANDARD_TEXT_MISSING");
    if (new Set(value.steps.map(item => item.step_id)).size !== value.steps.length ||
        new Set(value.cases.map(item => item.case_id)).size !== value.cases.length) add("TRAINING_STANDARD_DUPLICATE_ID");
    if (!value.steps.some(item => item.critical) || !value.steps.some(item => item.evidence_class === "task_product") ||
        value.steps.some(item => item.critical && item.not_applicable_permitted)) add("TRAINING_STANDARD_CRITICAL_OR_PRODUCT_MISSING");
    const start = Date.parse(value.created_at), end = Date.parse(value.expires_at);
    if (!(end > start && end - start <= 2592000000 && value.sustainment_seconds * 1000 <= end - start)) add("TRAINING_STANDARD_WINDOW_INVALID");
    for (const stage of ["crawl", "walk"]) {
      const cases = value.cases.filter(item => item.stage === stage);
      if (cases.length < value.minimum_distinct_trials || new Set(cases.map(item => `${item.tool_name}\0${item.tool_input_sha256}`)).size !== cases.length) add("TRAINING_STANDARD_CASE_COVERAGE_INVALID");
    }
  } else if (type === "task-training-session-binding") {
    const start = Date.parse(value.created_at), end = Date.parse(value.expires_at);
    if (!(end > start && end - start <= 86400000)) add("TRAINING_SESSION_WINDOW_INVALID");
    if (new Set(value.case_ids).size !== value.case_ids.length) add("TRAINING_SESSION_CASE_DUPLICATE");
  } else {
    const { id: expected, ...body } = value, prefix = { "task-training-trial-request": "TTR", "task-training-completion-input": "TCI", "task-training-trial-appraisal": "TTA" }[type];
    if (identified(prefix, body).id !== expected) add("TRAINING_INPUT_ID_BINDING_INVALID");
    if (type === "task-training-trial-appraisal") result.push(...issues(value.request, "task-training-trial-request"));
    if (type === "task-training-trial-appraisal" && (value.request_sha256 !== digest(value.request) || value.case_id !== value.request.case_id ||
      value.observed_output_sha256 !== value.request.observed_output_ref.sha256 || !value.completion_ref ||
      digest(value.completion_ref) !== digest(value.request.completion_ref) || digest(value.registry_head_ref) !== digest(value.request.registry_head_ref))) add("TRAINING_APPRAISAL_SUBJECT_INVALID");
  }
  return result;
}
function checked(value, type) {
  require("./workload-control-contract").assertJsonLimits(value);
  need(Buffer.byteLength(JSON.stringify(value, null, 2) + "\n") <= 262144, "TRAINING_INPUT_TOO_LARGE");
  need(SCHEMAS[type]?.safeParse(value).success, "TRAINING_CONTRACT_INVALID");
  const failures = issues(value, type); need(!failures.length, failures[0]?.code); return value;
}
function trial(input) { return checked(identified("TTR", { schema_version: "0.1", type: "TaskTrainingTrialRequest", ...input, ...FLAGS }), "task-training-trial-request"); }
function completionInput(input) { return checked(identified("TCI", { schema_version: "0.1", type: "TaskTrainingCompletionInput", hook_input: input, ...FLAGS }), "task-training-completion-input"); }
module.exports = { SCHEMAS, STANDARD, TRIAL, SESSION, COMPLETION_INPUT, APPRAISAL, NON_WORK_TYPES, FLAGS, ref, digest, need, identified, issues, checked, trial, completionInput };
