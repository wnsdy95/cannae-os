const { z } = require("zod");
const { digest, validOperatorSignature } = require("./operator-consent-contract");
const { RESPONSE, materialize } = require("./order-analysis-generation-contract");
const { buildDraft } = require("./order-intake-contract");
const TYPES = new Set(["operator-order-analysis"]), hex = z.string().regex(/^[a-f0-9]{64}$/), time = z.iso.datetime({ offset: true });
const code = z.string().min(1).max(128).regex(/^(?:SEMANTIC|CONSOLE)_[A-Z0-9_]+$/);
const flags = { execution_authorized: z.literal(false), release_authorized: z.literal(false), human_final_decision_authority: z.literal("USER") };
const signature = z.strictObject({ algorithm: z.literal("Ed25519"), key_sha256: hex, value: z.string().regex(/^[A-Za-z0-9+/]{86}==$/) });
const reference = z.strictObject({ artifact_id: z.string().min(1), relative_path: z.string().min(1), sha256: hex });
const assessment = z.strictObject({ verdict: z.enum(["ready_for_review", "needs_clarification"]), analysis_sha256: hex,
  semantic_completeness_proven: z.literal(false), calibrated_for_admission: z.literal(false), ...flags });
const collection = z.strictObject({ status: z.enum(["evaluated", "not_evaluated"]), journal_sha256: hex.nullable(),
  process_exit_confirmed: z.boolean(), process_group_absent: z.boolean(), stdout_sha256: hex, stderr_sha256: hex,
  response_sha256: hex.nullable(), failure_reasons: z.array(code).max(100) });
const EVALUATION = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("OperatorOrderAnalysis"), id: z.uuid(),
  status: z.enum(["evaluated", "held"]), invocation_sha256: hex, consent_sha256: hex, rationale_sha256: hex,
  ended_at: time, started_at: time.optional(), requested_model: z.string().min(1).max(128).optional(), method_sha256: hex.optional(),
  cli_executable_sha256: hex.optional(), assessment: assessment.nullable(), response: RESPONSE.nullable(), response_payload_sha256: hex.nullable(),
  draft_ref: reference.nullable(), draft_status: z.enum(["ready_for_review", "needs_clarification"]).nullable(),
  collection: collection.nullable(), error: code.optional(), ...flags, signature });
function evaluationIssues(value, type) {
  if (!TYPES.has(type)) return [];
  const issue = name => ({ severity: "critical", code: name, path: "$", message: "Preserve the exact purpose-bound proposed analysis, compiled draft and original collection journal without execution authority." });
  if (!EVALUATION.safeParse(value).success) return [issue("ORDER_ANALYSIS_RESULT_SCHEMA_INVALID")];
  const issues = [];
  if (value.started_at && Date.parse(value.started_at) > Date.parse(value.ended_at)) issues.push(issue("ORDER_ANALYSIS_RESULT_TIME_INVALID"));
  if (value.status === "evaluated") {
    if (!value.started_at || !value.requested_model || !value.method_sha256 || !value.cli_executable_sha256 || value.error || !value.response ||
      !value.assessment || !value.draft_ref || value.draft_status !== value.assessment.verdict || value.collection?.status !== "evaluated" ||
      !value.collection.journal_sha256 || !value.collection.response_sha256 || value.collection.process_exit_confirmed !== true ||
      value.collection.process_group_absent !== true || value.collection.failure_reasons.length || digest(value.response) !== value.response_payload_sha256) {
      issues.push(issue("ORDER_ANALYSIS_RESULT_STATE_INVALID"));
    }
  } else if (value.response !== null || value.assessment !== null || value.response_payload_sha256 !== null || value.draft_ref !== null || value.draft_status !== null) {
    issues.push(issue("ORDER_ANALYSIS_RESULT_STATE_INVALID"));
  }
  return issues;
}
function verifyEvaluation(value, key, invocation) {
  if (evaluationIssues(value, "operator-order-analysis").length || !validOperatorSignature(value, key) || invocation?.type !== "CodexOrderAnalysisInvocation" ||
    value.invocation_sha256 !== invocation.invocation_sha256) throw new Error("CONSOLE_ANALYSIS_RESULT_INVALID");
  if (value.status === "evaluated") {
    const analysis = materialize(value.response, invocation.preview), draft = buildDraft(invocation.preview.input.request, invocation.preview.request_ref, analysis, invocation.preview.prepared_at);
    if (value.assessment.verdict !== draft.status || value.assessment.analysis_sha256 !== digest(analysis) ||
      value.requested_model !== invocation.profile.requested_model || value.method_sha256 !== invocation.preview.method_sha256 ||
      value.cli_executable_sha256 !== invocation.profile.executable_sha256 || value.draft_ref.artifact_id !== draft.id || value.draft_status !== draft.status) throw new Error("CONSOLE_ANALYSIS_RESULT_INVALID");
  }
  return value;
}
module.exports = { TYPES, EVALUATION, evaluationIssues, verifyEvaluation };
