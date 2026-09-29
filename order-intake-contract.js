const crypto = require("crypto");
const { canonicalJsonBytes } = require("./verifier-identity-evidence");

const FIELDS = Object.freeze([
  "mission.statement", "mission.target_end_state", "intent.purpose", "intent.key_tasks", "intent.failure_to_avoid",
  "situation.known_facts", "situation.assumptions", "situation.constraints", "execution.concept",
  "execution.coordinating_instructions", "sustainment.tools", "sustainment.fallback",
  "command_and_signal.authority.requested", "command_and_signal.authority.approval_required",
  "command_and_signal.authority.prohibited", "command_and_signal.ccir.pir", "command_and_signal.ccir.ffir",
  "command_and_signal.ccir.eefi", "command_and_signal.reports.sitrep_trigger", "assessment.mop", "assessment.moe",
  "assessment.verification"
]);
const REQUIRED = Object.freeze(["mission.statement", "mission.target_end_state", "intent.purpose", "intent.key_tasks",
  "intent.failure_to_avoid", "execution.concept", "sustainment.fallback", "command_and_signal.authority.approval_required",
  "command_and_signal.authority.prohibited", "assessment.mop", "assessment.moe", "assessment.verification"]);
const DRAFT_TYPES = new Set(["mission-request", "mission-order-analysis", "order-draft"]);
const AUTHORITY = Object.freeze({ execution_authorized: false, release_authorized: false, human_final_decision_authority: "USER" });
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const digest = value => sha256(canonicalJsonBytes(value));
const same = (left, right) => digest(left) === digest(right);
const problem = (code, location, message) => ({ severity: "critical", code, path: location, message });

function requestIssues(request) {
  const issues = [];
  const bytes = Buffer.from(request.text, "utf8");
  if (!request.text.trim() || bytes.length > 131072 || bytes.toString("utf8") !== request.text || sha256(bytes) !== request.text_sha256) {
    issues.push(problem("ORDER_REQUEST_TEXT_BINDING_INVALID", "$.text", "Retain nonempty exact UTF-8 request bytes and their digest."));
  }
  const duration = Date.parse(request.expires_at) - Date.parse(request.recorded_at);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400000) {
    issues.push(problem("ORDER_REQUEST_VALIDITY_INVALID", "$.expires_at", "Request validity must be positive and at most 24 hours."));
  }
  return issues;
}

function analysisIssues(analysis) {
  const issues = [];
  const statements = new Map(analysis.statements.map(item => [item.id, item]));
  if (statements.size !== analysis.statements.length || new Set(analysis.tasks.map(item => item.id)).size !== analysis.tasks.length) {
    issues.push(problem("ORDER_ANALYSIS_DUPLICATE_ID", "$", "Statement and task identities must be unique within their lists."));
  }
  for (const item of analysis.statements) {
    const expectedSource = { request_quote: "request", evidence_quote: "artifact" }[item.kind] || "none";
    if (item.source.kind !== expectedSource || (item.kind !== "unknown" && item.blocking) || !item.text.trim()) {
      issues.push(problem("ORDER_ANALYSIS_STATEMENT_KIND_INVALID", "$.statements", "Quotes need their exact source; only unknowns carry a blocking flag."));
    }
    if (item.source.kind !== "none" && (!Number.isSafeInteger(item.source.start_byte) || !Number.isSafeInteger(item.source.end_byte) ||
        item.source.start_byte >= item.source.end_byte)) {
      issues.push(problem("ORDER_ANALYSIS_SPAN_INVALID", "$.statements", "Quote spans use ordered, safe UTF-8 byte offsets."));
    }
  }
  const uses = Object.entries(analysis.sections).map(([field, refs]) => ({ field, refs }));
  uses.push({ field: "retained_user_decisions", refs: analysis.retained_user_decisions });
  for (const task of analysis.tasks) for (const field of ["task", "purpose", "deliverables", "verification", "ccir"]) {
    uses.push({ field: `tasks.${task.id}.${field}`, refs: Array.isArray(task[field]) ? task[field] : [task[field]] });
  }
  for (const { field, refs } of uses) for (const id of refs) {
    const item = statements.get(id);
    if (!item) issues.push(problem("ORDER_ANALYSIS_REFERENCE_MISSING", `$.${field}`, `Unknown statement ${id}.`));
    else if (field === "situation.known_facts" && !["request_quote", "evidence_quote"].includes(item.kind)) {
      issues.push(problem("ORDER_ANALYSIS_UNSUPPORTED_FACT", `$.${field}`, "A source claim must remain an exact attributed quote, never a proposal or assumption."));
    } else if (field === "situation.assumptions" && item.kind !== "assumption") {
      issues.push(problem("ORDER_ANALYSIS_ASSUMPTION_KIND_INVALID", `$.${field}`, "Keep assumptions separate from source claims and unknowns."));
    }
  }
  return issues;
}

function binding(request, requestRef, analysis) {
  return digest({ request_ref: requestRef, request_text_sha256: request.text_sha256,
    repository_binding: request.repository_binding, analysis_sha256: digest(analysis) });
}

function deriveOrder(analysis, classification, bound) {
  const statements = new Map(analysis.statements.map(item => [item.id, item]));
  const labels = { request_quote: "Request quote", evidence_quote: "Evidence quote", assumption: "Assumption", proposal: "Proposal", unknown: "Unknown" };
  const render = id => `${labels[statements.get(id).kind]}: ${statements.get(id).text}`;
  const resolve = refs => refs.map(render);
  const clarifications = [];
  const opord = { schema_version: "0.1", type: "OPORD_DRAFT", id: `DOPORD-${bound.slice(0, 32)}`,
    mission_id: analysis.mission_id, created_by: "S3", classification };
  for (const field of FIELDS) {
    const parts = field.split(".");
    let parent = opord;
    for (const part of parts.slice(0, -1)) parent = parent[part] || (parent[part] = {});
    const values = resolve(analysis.sections[field]);
    parent[parts.at(-1)] = ["mission.statement", "intent.purpose"].includes(field)
      ? (values[0] || `Unresolved: ${field}`) : values;
    if (REQUIRED.includes(field) && values.length === 0) clarifications.push(`Missing ${field}`);
  }
  const used = new Set([...Object.values(analysis.sections).flat(), ...analysis.retained_user_decisions,
    ...analysis.tasks.flatMap(task => [task.task, task.purpose, ...task.deliverables, ...task.verification, ...task.ccir])]);
  for (const item of analysis.statements) {
    if (item.kind === "unknown" && (item.blocking || used.has(item.id))) clarifications.push(`Resolve ${item.id}: ${item.text}`);
  }
  if (analysis.tasks.length === 0) clarifications.push("Missing role task decomposition");
  if (analysis.retained_user_decisions.length === 0) clarifications.push("Missing retained USER decisions");
  opord.execution.tasks = analysis.tasks.map(task => {
    if (!task.deliverables.length || !task.verification.length) clarifications.push(`Missing deliverables or verification for ${task.id}`);
    return { type: "TASK_ORDER_DRAFT", id: task.id, mission_id: analysis.mission_id, assigned_to: task.assigned_to,
      task: render(task.task), purpose: render(task.purpose), deliverables: resolve(task.deliverables),
      verification: resolve(task.verification), ccir: resolve(task.ccir), status: "draft",
      inherited_constraints: resolve(analysis.sections["situation.constraints"]),
      retained_user_decisions: resolve(analysis.retained_user_decisions), draft_binding_sha256: bound, execution_authorized: false };
  });
  opord.draft_binding_sha256 = bound;
  opord.execution_authorized = false;
  return { opord, clarifications, status: clarifications.length ? "needs_clarification" : "ready_for_review" };
}

function buildDraft(request, requestRef, analysis, compiledAt) {
  const bound = binding(request, requestRef, analysis);
  // Unclassified external evidence cannot lower the captured request's handling level.
  const classification = analysis.statements.some(item => item.kind === "evidence_quote") ? "restricted" : request.classification;
  return { schema_version: "0.1", type: "OrderDraft", id: `OD-${bound.slice(0, 32)}`,
    mission_id: request.mission_id, wave_id: request.wave_id, repository_binding: request.repository_binding,
    request_ref: requestRef, request_text_sha256: request.text_sha256, analysis, analysis_sha256: digest(analysis),
    draft_binding_sha256: bound, compiled_at: compiledAt, expires_at: request.expires_at,
    ...deriveOrder(analysis, classification, bound), classification, review_required: true, source_claims_verified: false, ...AUTHORITY };
}

function draftIssues(draft) {
  const issues = analysisIssues(draft.analysis);
  if (issues.length) return issues;
  const request = { text_sha256: draft.request_text_sha256, repository_binding: draft.repository_binding };
  const bound = binding(request, draft.request_ref, draft.analysis);
  const projection = deriveOrder(draft.analysis, draft.classification, bound);
  if (draft.id !== `OD-${bound.slice(0, 32)}` || draft.draft_binding_sha256 !== bound || digest(draft.analysis) !== draft.analysis_sha256 ||
      !same(draft.request_ref, draft.analysis.request_ref) || draft.mission_id !== draft.analysis.mission_id || draft.wave_id !== draft.analysis.wave_id ||
      !same(draft.opord, projection.opord) || !same(draft.clarifications, projection.clarifications) || draft.status !== projection.status) {
    issues.push(problem("ORDER_DRAFT_BINDING_INVALID", "$", "Draft, analysis, scope, inherited boundaries and status must replay exactly."));
  }
  if (!(Date.parse(draft.compiled_at) < Date.parse(draft.expires_at)) ||
      Date.parse(draft.expires_at) - Date.parse(draft.compiled_at) > 86400000) {
    issues.push(problem("ORDER_DRAFT_VALIDITY_INVALID", "$.expires_at", "Draft time must remain within the bounded request validity."));
  }
  if (draft.analysis.statements.some(item => item.kind === "evidence_quote") && draft.classification !== "restricted") {
    issues.push(problem("ORDER_DRAFT_CLASSIFICATION_DOWNGRADE", "$.classification", "Quoted evidence has conservative restricted handling."));
  }
  return issues;
}

function intakeIssues(payload, type) {
  if (type === "mission-request") return requestIssues(payload);
  if (type === "mission-order-analysis") return analysisIssues(payload);
  if (type === "order-draft") return draftIssues(payload);
  return [];
}

module.exports = { AUTHORITY, DRAFT_TYPES, FIELDS, sha256, digest, same, intakeIssues, buildDraft };
