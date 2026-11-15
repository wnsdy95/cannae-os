const { z } = require("zod");
const { digest, sha256, AUTHORITY } = require("./order-intake-contract");
const { pointerValue } = require("./semantic-omission-contract");

const id = z.string().regex(/^[A-Z]+-[A-Za-z0-9_-]+$/), hex = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().min(1).max(8192), time = z.iso.datetime({ offset: true });
const reference = z.strictObject({ artifact_id: id, relative_path: z.string().min(1).max(4096), sha256: hex });
const flags = { execution_authorized: z.literal(false), release_authorized: z.literal(false), human_final_decision_authority: z.literal("USER") };
const fragment = z.strictObject({ id, start_byte: z.number().int().nonnegative(), end_byte: z.number().int().positive(),
  quote: z.string().min(1).max(131072), classification: z.enum(["operative", "context", "unknown"]),
  requirement_ids: z.array(id).max(1024), rationale: text });
const requirement = z.strictObject({ id, instruction: text, kind: z.enum(["obligation", "prohibition", "approval", "resource", "deadline", "condition"]),
  source_fragment_ids: z.array(id).min(1).max(2048), scope: z.enum(["global", "task"]), task_ids: z.array(id).max(64) });
const INVENTORY = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("RequirementInventory"), id,
  mission_id: id, wave_id: z.string().min(1).max(128), request_ref: reference, request_text_sha256: hex,
  classification: z.enum(["public", "internal", "restricted"]), recorded_at: time, expires_at: time,
  fragments: z.array(fragment).min(1).max(2048), requirements: z.array(requirement).max(1024),
  status: z.enum(["ready_for_review", "needs_clarification"]), semantic_completeness_proven: z.literal(false), ...flags });
const entry = z.strictObject({ requirement_id: id, target_id: z.string().min(1).max(256),
  disposition: z.enum(["preserved", "omitted", "contradicted", "uncertain", "not_applicable"]),
  pointer: z.string().max(2048), quote: z.string().max(8192), rationale: text });
const INVENTORY_INPUT = z.strictObject({ request_ref: reference, fragments: z.array(fragment).min(1).max(2048), requirements: z.array(requirement).max(1024) });
const COVERAGE_INPUT = z.strictObject({ inventory_ref: reference, coverage: z.array(entry).max(66560) });
const COVERAGE = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("SemanticCoverageProposal"), id,
  mission_id: id, wave_id: z.string().min(1).max(128), inventory_ref: reference, draft_ref: reference, plan_sha256: hex,
  request_text_sha256: hex, classification: z.enum(["public", "internal", "restricted"]),
  recorded_at: time, expires_at: time, coverage: z.array(entry).max(66560),
  status: z.enum(["ready_for_human_review", "needs_revision"]), review_class: z.literal("human_inventory_and_coverage"),
  model_calibrated_for_admission: z.literal(false), semantic_completeness_proven: z.literal(false), ...flags });
const ASSIGNMENT = z.strictObject({ type: z.literal("SemanticReviewAssignment"), review_ref: reference, inventory_ref: reference,
  review_class: z.literal("human_inventory_and_coverage"), plan_sha256: hex,
  requirements: z.array(z.strictObject({ id, instruction: text, kind: requirement.shape.kind, scope: requirement.shape.scope })).max(1024),
  model_calibrated_for_admission: z.literal(false), semantic_completeness_proven: z.literal(false) });
const TYPES = new Set(["requirement-inventory", "semantic-coverage-proposal", "semantic-review-assignment"]);
const unique = values => new Set(values).size === values.length;
function identified(value, prefix) { const { id, ...body } = value; return { ...body, id: `${prefix}-${digest(body).slice(0, 32)}` }; }
function statusFor(fragments, requirements) {
  return requirements.length && fragments.every(item => item.classification !== "unknown") ? "ready_for_review" : "needs_clarification";
}
function issues(value, type) {
  if (!TYPES.has(type)) return [];
  const add = code => ({ severity: "critical", code, path: "$", message: code });
  const schema = { "requirement-inventory": INVENTORY, "semantic-coverage-proposal": COVERAGE, "semantic-review-assignment": ASSIGNMENT }[type];
  if (!schema.safeParse(value).success) return [add("SEMANTIC_REVIEW_SCHEMA_INVALID")];
  if (type === "semantic-review-assignment") return unique(value.requirements.map(item => item.id)) ? [] : [add("REQUIREMENT_INVENTORY_DUPLICATE_ID")];
  const findings = [], prefix = type === "requirement-inventory" ? "RI" : "SCV";
  if (identified(value, prefix).id !== value.id) findings.push(add("SEMANTIC_REVIEW_ID_BINDING_INVALID"));
  if (!(Date.parse(value.recorded_at) < Date.parse(value.expires_at)) || Date.parse(value.expires_at) - Date.parse(value.recorded_at) > 86400000) {
    findings.push(add("SEMANTIC_REVIEW_VALIDITY_INVALID"));
  }
  if (type !== "requirement-inventory") {
    if (!unique(value.coverage.map(item => `${item.requirement_id}:${item.target_id}`))) findings.push(add("SEMANTIC_COVERAGE_DUPLICATE"));
    return findings;
  }
  if (!unique(value.fragments.map(item => item.id)) || !unique(value.requirements.map(item => item.id))) findings.push(add("REQUIREMENT_INVENTORY_DUPLICATE_ID"));
  let offset = 0; const parts = [], fragments = new Map(value.fragments.map(item => [item.id, item]));
  const requirements = new Map(value.requirements.map(item => [item.id, item]));
  for (const item of value.fragments) {
    const bytes = Buffer.from(item.quote);
    if (bytes.toString("utf8") !== item.quote || item.start_byte !== offset || item.end_byte !== offset + bytes.length ||
        !unique(item.requirement_ids) || (item.classification === "operative" ? !item.requirement_ids.length : item.requirement_ids.length !== 0)) {
      findings.push(add("REQUIREMENT_INVENTORY_PARTITION_INVALID"));
    }
    offset = item.end_byte; parts.push(bytes);
    for (const requirementId of item.requirement_ids) {
      if (!requirements.get(requirementId)?.source_fragment_ids.includes(item.id)) findings.push(add("REQUIREMENT_INVENTORY_SOURCE_BINDING_INVALID"));
    }
  }
  if (offset > 131072 || sha256(Buffer.concat(parts)) !== value.request_text_sha256 || value.status !== statusFor(value.fragments, value.requirements)) {
    findings.push(add("REQUIREMENT_INVENTORY_REQUEST_BINDING_INVALID"));
  }
  for (const item of value.requirements) {
    if (!unique(item.source_fragment_ids) || !unique(item.task_ids) || (item.scope === "global" ? item.task_ids.length !== 0 : item.task_ids.length === 0)) {
      findings.push(add("REQUIREMENT_INVENTORY_APPLICABILITY_INVALID"));
    }
    for (const fragmentId of item.source_fragment_ids) {
      const source = fragments.get(fragmentId);
      if (source?.classification !== "operative" || !source.requirement_ids.includes(item.id)) findings.push(add("REQUIREMENT_INVENTORY_SOURCE_BINDING_INVALID"));
    }
  }
  return findings;
}
function buildInventory(request, requestRef, input, recordedAt) {
  return identified({ schema_version: "0.1", type: "RequirementInventory", mission_id: request.mission_id, wave_id: request.wave_id,
    request_ref: requestRef, request_text_sha256: request.text_sha256, classification: request.classification,
    recorded_at: recordedAt, expires_at: request.expires_at, fragments: input.fragments, requirements: input.requirements,
    status: statusFor(input.fragments, input.requirements), semantic_completeness_proven: false, ...AUTHORITY }, "RI");
}
function templateFor(request) {
  return { fragments: [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(request.text)].map((item, index) => ({
    id: `FR-${index + 1}`, start_byte: Buffer.byteLength(request.text.slice(0, item.index)),
    end_byte: Buffer.byteLength(request.text.slice(0, item.index + item.segment.length)), quote: item.segment,
    classification: "unknown", requirement_ids: [], rationale: "Requires explicit source classification and requirement extraction." })), requirements: [] };
}
function reviewTargets(draft, plan) {
  const assignments = new Map(plan.order_binding.task_assignments.map(item => [item.task_order_id, item.agent_id]));
  return [{ id: "order", content: draft.opord }, ...draft.opord.execution.tasks.map(task => ({ id: task.id,
    content: { task_order: task, agent: plan.agents.find(agent => agent.agent_id === assignments.get(task.id)) } }))];
}
function assessCoverage(value, inventory, draft, plan) {
  const findings = [], targets = reviewTargets(draft, plan), targetMap = new Map(targets.map(item => [item.id, item.content]));
  const requirements = new Map(inventory.requirements.map(item => [item.id, item]));
  const need = condition => { if (!condition) findings.push("SEMANTIC_COVERAGE_BINDING_INVALID"); };
  need(inventory.status === "ready_for_review" && inventory.requirements.length > 0);
  need(value.plan_sha256 === digest(plan) && value.request_text_sha256 === inventory.request_text_sha256);
  need(value.coverage.length === requirements.size * targetMap.size);
  need(unique(value.coverage.map(item => `${item.requirement_id}:${item.target_id}`)));
  for (const requirement of inventory.requirements) need(requirement.task_ids.every(id => targetMap.has(id) && id !== "order"));
  for (const item of value.coverage) {
    const requirement = requirements.get(item.requirement_id), target = targetMap.get(item.target_id);
    if (!requirement || !target) { need(false); continue; }
    const applicable = item.target_id === "order" || requirement.scope === "global" || requirement.task_ids.includes(item.target_id);
    need(applicable ? item.disposition !== "not_applicable" : item.disposition === "not_applicable");
    if (["preserved", "contradicted"].includes(item.disposition)) {
      try { const resolved = pointerValue(target, item.pointer); need(typeof resolved === "string" && !!item.quote && resolved.includes(item.quote)); }
      catch { need(false); }
    } else need(item.pointer === "" && item.quote === "");
  }
  const ready = findings.length === 0 && value.coverage.every(item => ["preserved", "not_applicable"].includes(item.disposition));
  return { status: ready ? "ready_for_human_review" : "needs_revision", findings: [...new Set(findings)] };
}
function assignmentFor(review, agentId, plan) {
  const task = plan.order_binding.task_assignments.find(item => item.agent_id === agentId);
  if (!task) throw new Error("SEMANTIC_REVIEW_AGENT_MISMATCH");
  return { type: "SemanticReviewAssignment", review_ref: review.coverage.ref, inventory_ref: review.inventory.ref,
    review_class: "human_inventory_and_coverage", plan_sha256: digest(plan),
    requirements: review.inventory.payload.requirements.filter(item => item.scope === "global" || item.task_ids.includes(task.task_order_id))
      .map(({ id, instruction, kind, scope }) => ({ id, instruction, kind, scope })),
    model_calibrated_for_admission: false, semantic_completeness_proven: false };
}
module.exports = { TYPES, INVENTORY, COVERAGE, ASSIGNMENT, INVENTORY_INPUT, COVERAGE_INPUT, issues, identified, buildInventory, templateFor, reviewTargets, assessCoverage, assignmentFor };
