const { z } = require("zod");
const { RESPONSE } = require("./semantic-omission-contract");
const { digest, validOperatorSignature } = require("./operator-consent-contract");
const TYPES = new Set(["operator-semantic-evaluation"]);
const CODE = z.string().min(1).max(128).regex(/^(?:SEMANTIC|CONSOLE)_[A-Z0-9_]+$/);
const isModelCode = value => CODE.safeParse(value).success;
const hex = z.string().regex(/^[a-f0-9]{64}$/), time = z.iso.datetime({ offset: true });
const flags = { execution_authorized: z.literal(false), release_authorized: z.literal(false), human_final_decision_authority: z.literal("USER") };
const signature = z.strictObject({ algorithm: z.literal("Ed25519"), key_sha256: hex, value: z.string().regex(/^[A-Za-z0-9+/]{86}==$/) });
const assessment = z.strictObject({ verdict: z.enum(["complete", "incomplete", "uncertain"]), semantic_completeness_proven: z.literal(false), calibrated_for_admission: z.literal(false), ...flags });
const reasons = z.array(CODE).max(100);
const common = { type: z.literal("OperatorSemanticEvaluation"), id: z.uuid(), invocation_sha256: hex, consent_sha256: hex, rationale_sha256: hex,
  ended_at: time, ...flags, signature };
function collection(version, failure) {
  return z.strictObject({ status: z.enum(["evaluated", "not_evaluated"]), process_exit_confirmed: z.boolean(), process_group_absent: z.boolean(),
    stdout_sha256: failure && version === "0.1" ? hex.optional() : hex,
    stderr_sha256: failure && version === "0.1" ? hex.optional() : hex,
    response_sha256: failure && version === "0.1" ? hex.nullable().optional() : hex.nullable(), failure_reasons: reasons,
    ...(version === "0.2" ? { journal_sha256: failure ? hex.nullable() : hex } : {}) });
}
const EVALUATION = z.union(["0.1", "0.2"].flatMap(version => [
  z.strictObject({ ...common, schema_version: z.literal(version), status: z.enum(["evaluated", "held"]),
    started_at: time, requested_model: z.string().min(1).max(128), method_sha256: hex, cli_executable_sha256: hex,
    assessment: assessment.nullable(), response: RESPONSE.nullable(), response_payload_sha256: hex.nullable(), collection: collection(version, false) }),
  z.strictObject({ ...common, schema_version: z.literal(version), status: z.literal("held"), error: CODE,
    assessment: z.null(), response: z.null(), collection: collection(version, true).nullable() })
]));
function evaluationIssues(value, type) {
  if (!TYPES.has(type)) return [];
  const issue = code => ({ severity: "critical", code, path: "$", message: "The signed model observation must preserve exact versioned state, response and journal bindings without authority." });
  if (!EVALUATION.safeParse(value).success) return [issue("MODEL_EVALUATION_SCHEMA_INVALID")];
  const issues = [];
  if (value.started_at && Date.parse(value.started_at) > Date.parse(value.ended_at)) issues.push(issue("MODEL_EVALUATION_TIME_INVALID"));
  if (value.status === "evaluated") {
    if (!value.response || !value.assessment || value.collection?.status !== "evaluated" || value.collection?.process_exit_confirmed !== true ||
        value.collection?.process_group_absent !== true || value.collection?.failure_reasons.length ||
        (value.schema_version === "0.2" && !value.collection.journal_sha256) || digest(value.response) !== value.response_payload_sha256) {
      issues.push(issue("MODEL_EVALUATION_STATE_BINDING_INVALID"));
    } else {
      const entries = value.response.requirements.flatMap(item => item.coverage);
      const verdict = value.response.conflicts.length || entries.some(item => item.disposition === "uncertain") ? "uncertain" :
        entries.some(item => ["omitted", "contradicted"].includes(item.disposition)) ? "incomplete" : "complete";
      if (value.assessment.verdict !== verdict) issues.push(issue("MODEL_EVALUATION_VERDICT_BINDING_INVALID"));
    }
  } else if (value.response !== null || value.assessment !== null || (Object.hasOwn(value, "response_payload_sha256") && value.response_payload_sha256 !== null)) {
    issues.push(issue("MODEL_EVALUATION_STATE_BINDING_INVALID"));
  }
  return issues;
}
function verifyEvaluation(value, trustedKey) {
  if (evaluationIssues(value, "operator-semantic-evaluation").length || !validOperatorSignature(value, trustedKey)) throw new Error("CONSOLE_MODEL_RESULT_INVALID");
  return value;
}
module.exports = { TYPES, CODE, isModelCode, EVALUATION, evaluationIssues, verifyEvaluation };
