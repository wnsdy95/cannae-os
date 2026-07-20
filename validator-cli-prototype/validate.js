#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA_DIR = path.join(ROOT, "schema-files");

const TYPE_TO_SCHEMA = {
  mission: "mission.schema.json",
  agent: "agent.schema.json",
  opord: "opord.schema.json",
  "task-order": "task-order.schema.json",
  "tool-request": "tool-request.schema.json",
  "approval-request": "approval-request.schema.json",
  sitrep: "sitrep.schema.json",
  frago: "frago.schema.json",
  "frago-scope-change": "frago-scope-change.schema.json",
  annex: "annex.schema.json",
  "information-report": "information-report.schema.json",
  "intelligence-assessment": "intelligence-assessment.schema.json",
  evidence: "evidence.schema.json",
  aar: "aar.schema.json",
  "aar-readiness-update": "aar-readiness-update.schema.json",
  "readiness-ledger": "readiness-ledger.schema.json",
  "authority-matrix": "authority-matrix.schema.json",
  "decision-packet": "decision-packet.schema.json",
  "working-group": "working-group.schema.json",
  "sof-tf-charter": "sof-tf-charter.schema.json",
  "department-collaboration-charter": "department-collaboration-charter.schema.json",
  "force-structure-change-order": "force-structure-change-order.schema.json",
  "document-access-manifest": "document-access-manifest.schema.json",
  "doctrine-consistency-review": "doctrine-consistency-review.schema.json",
  "ccir-alert": "ccir-alert.schema.json",
  "handoff-packet": "handoff-packet.schema.json",
  "continuity-plan": "continuity-plan.schema.json",
  "context-item": "context-item.schema.json",
  "release-review": "release-review.schema.json",
  "maintenance-readiness": "maintenance-readiness.schema.json",
  backbrief: "backbrief.schema.json",
  rehearsal: "rehearsal.schema.json",
  "approval-scope": "approval-scope.schema.json",
  "risk-acceptance": "risk-acceptance.schema.json",
  "approval-consumption-event": "approval-consumption-event.schema.json",
  "approval-revocation-event": "approval-revocation-event.schema.json",
  "approval-renewal-event": "approval-renewal-event.schema.json",
  "approval-delegation-event": "approval-delegation-event.schema.json",
  "approval-delegation-revocation-event": "approval-delegation-revocation-event.schema.json",
  "release-gate-decision-event": "release-gate-decision-event.schema.json",
  "routing-receipt": "routing-receipt.schema.json",
  "model-force-assignment-plan": "model-force-assignment-plan.schema.json"
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function issue(severity, code, pointer, message, fix) {
  return { severity, code, path: pointer || "$", message, ...(fix ? { fix } : {}) };
}

function loadSchemas() {
  const schemas = {};
  for (const file of fs.readdirSync(SCHEMA_DIR)) {
    if (file.endsWith(".json")) {
      schemas[file] = readJson(path.join(SCHEMA_DIR, file));
    }
  }
  return schemas;
}

function resolveRef(ref, schemas) {
  const [file, fragment] = ref.split("#");
  const schemaFile = file || "common.schema.json";
  const schema = schemas[schemaFile];
  if (!schema) return null;
  if (!fragment) return schema;
  const parts = fragment.replace(/^\//, "").split("/").filter(Boolean);
  let current = schema;
  for (const part of parts) {
    current = current && current[part];
  }
  return current || null;
}

function typeMatches(value, expected) {
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (expected === "string") return typeof value === "string";
  if (expected === "boolean") return typeof value === "boolean";
  if (expected === "number") return typeof value === "number";
  if (expected === "integer") return Number.isInteger(value);
  return true;
}

function validateSchema(value, schema, schemas, pointer = "$", seen = new Set()) {
  const issues = [];
  if (!schema || typeof schema !== "object") return issues;

  if (schema.$ref) {
    const key = `${schema.$ref}@${pointer}`;
    if (seen.has(key)) return issues;
    seen.add(key);
    const resolved = resolveRef(schema.$ref, schemas);
    if (!resolved) {
      issues.push(issue("error", "UNRESOLVED_REF", pointer, `Cannot resolve schema ref ${schema.$ref}.`));
      return issues;
    }
    return validateSchema(value, resolved, schemas, pointer, seen);
  }

  if (schema.type && !typeMatches(value, schema.type)) {
    issues.push(issue("error", "TYPE_MISMATCH", pointer, `Expected ${schema.type}.`));
    return issues;
  }

  if (schema.const !== undefined && value !== schema.const) {
    issues.push(issue("error", "CONST_MISMATCH", pointer, `Expected constant ${JSON.stringify(schema.const)}.`));
  }

  if (schema.enum && !schema.enum.includes(value)) {
    issues.push(issue("error", "ENUM_MISMATCH", pointer, `Expected one of ${schema.enum.join(", ")}.`));
  }

  if (schema.type === "string" && typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength) {
      issues.push(issue("error", "MIN_LENGTH", pointer, `String must have length >= ${schema.minLength}.`));
    }
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
      issues.push(issue("error", "PATTERN_MISMATCH", pointer, `String does not match ${schema.pattern}.`));
    }
    if (schema.format === "uri" && !/^https?:\/\//.test(value)) {
      issues.push(issue("warning", "FORMAT_URI_WEAK", pointer, "Expected an http(s) URI."));
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      issues.push(issue("warning", "FORMAT_DATETIME_WEAK", pointer, "Expected parseable date-time."));
    }
  }

  if ((schema.type === "number" || schema.type === "integer") && typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push(issue("error", "MINIMUM", pointer, `Number must be >= ${schema.minimum}.`));
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push(issue("error", "MAXIMUM", pointer, `Number must be <= ${schema.maximum}.`));
    }
  }

  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required || []) {
      if (!(required in value)) {
        issues.push(issue("error", "MISSING_REQUIRED", `${pointer}.${required}`, `Missing required field ${required}.`));
      }
    }
    const props = schema.properties || {};
    for (const [key, child] of Object.entries(value)) {
      if (props[key]) {
        issues.push(...validateSchema(child, props[key], schemas, `${pointer}.${key}`, new Set(seen)));
      } else if (schema.additionalProperties === false) {
        issues.push(issue("error", "ADDITIONAL_PROPERTY", `${pointer}.${key}`, `Unexpected field ${key}.`));
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        issues.push(...validateSchema(child, schema.additionalProperties, schemas, `${pointer}.${key}`, new Set(seen)));
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push(issue("error", "MIN_ITEMS", pointer, `Array must contain at least ${schema.minItems} item(s).`));
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push(issue("error", "MAX_ITEMS", pointer, `Array must contain at most ${schema.maxItems} item(s).`));
    }
    if (schema.uniqueItems === true) {
      const serialized = value.map(item => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        issues.push(issue("error", "UNIQUE_ITEMS", pointer, "Array items must be unique."));
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      if (schema.items) {
        issues.push(...validateSchema(value[index], schema.items, schemas, `${pointer}[${index}]`, new Set(seen)));
      }
    }
  }

  return issues;
}

function isEmptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

function hasSubstantiveItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function isValidDate(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isBefore(left, right) {
  return isValidDate(left) && isValidDate(right) && Date.parse(left) < Date.parse(right);
}

const ROE_RANK = { Green: 0, Amber: 1, Red: 2, Black: 3 };
const RISK_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const AUTHORITY_RANK = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 };
const READINESS_RANK = { X: 0, U: 1, P: 2, T: 3 };

function authorityAtLeast(actual, minimum) {
  return AUTHORITY_RANK[actual] >= AUTHORITY_RANK[minimum];
}

function semanticRules(payload, type) {
  const issues = [];

  if (type === "mission") {
    if (!payload.intent || !payload.intent.purpose) {
      issues.push(issue("critical", "MISSING_INTENT", "$.intent.purpose", "Mission requires explicit intent purpose.", "Add intent.purpose."));
    }
    if (payload.mission_statement && /well|properly|optimally|better/i.test(payload.mission_statement)) {
      issues.push(issue("warning", "VAGUE_MISSION", "$.mission_statement", "Mission statement appears vague.", "Use an observable end state."));
    }
  }

  if (type === "opord") {
    const authority = payload.command_and_signal && payload.command_and_signal.authority;
    if (!authority) {
      issues.push(issue("critical", "MISSING_AUTHORITY", "$.command_and_signal.authority", "OPORD cannot execute without authority boundaries."));
    } else {
      if (isEmptyArray(authority.prohibited)) {
        issues.push(issue("error", "EMPTY_PROHIBITED_ACTIONS", "$.command_and_signal.authority.prohibited", "Prohibited actions must be explicit."));
      }
    }
    const assessment = payload.assessment || {};
    if (isEmptyArray(assessment.moe)) {
      issues.push(issue("warning", "MOP_ONLY", "$.assessment.moe", "OPORD has no MOE; output may be assessed only by activity."));
    }
  }

  if (type === "tool-request") {
    if (payload.roe_class === "Black") {
      issues.push(issue("critical", "BLACK_ACTION_REQUESTED", "$.roe_class", "Black actions are prohibited and cannot be approved."));
    }
    if (payload.roe_class === "Red" && payload.approval_required !== true) {
      issues.push(issue("critical", "RED_WITHOUT_APPROVAL", "$.approval_required", "Red tool request requires approval."));
    }
    if (/secret|token|private_key|password/i.test(`${payload.action} ${payload.target}`)) {
      issues.push(issue("critical", "POSSIBLE_EEFI", "$.target", "Possible sensitive data exposure; suppress output and escalate."));
    }
  }

  if (type === "authority-matrix") {
    if (payload.default_decision === "allow") {
      issues.push(issue("error", "DEFAULT_ALLOW_TOO_BROAD", "$.default_decision", "Authority matrix must not default to allow.", "Use report_required, approval_required, or prohibit."));
    }
    if (!payload.rules || isEmptyArray(payload.rules)) {
      issues.push(issue("critical", "MISSING_AUTHORITY_RULES", "$.rules", "Authority matrix requires explicit scoped rules."));
    }
    for (const [index, rule] of (payload.rules || []).entries()) {
      const pointer = `$.rules[${index}]`;
      if (rule.roe_class === "Red") {
        if (rule.decision !== "approval_required") {
          issues.push(issue("critical", "RED_NOT_APPROVAL_REQUIRED", `${pointer}.decision`, "Red authority rule must require approval."));
        }
        if (!rule.approval_authority) {
          issues.push(issue("critical", "RED_WITHOUT_APPROVAL_AUTHORITY", `${pointer}.approval_authority`, "Red authority rule must name an approval authority."));
        }
      }
      if (rule.roe_class === "Black") {
        if (rule.decision !== "prohibit") {
          issues.push(issue("critical", "BLACK_NOT_PROHIBITED", `${pointer}.decision`, "Black authority rule must prohibit execution."));
        }
        if (rule.approval_authority) {
          issues.push(issue("critical", "BLACK_CANNOT_BE_APPROVED", `${pointer}.approval_authority`, "Black actions cannot be made approvable."));
        }
      }
      if ((rule.roe_class === "Red" || rule.roe_class === "Black") && rule.decision === "allow") {
        issues.push(issue("critical", "HIGH_RISK_ALLOW", `${pointer}.decision`, "High-risk authority rule cannot allow direct execution."));
      }
      if (rule.decision === "approval_required" && !rule.approval_authority) {
        issues.push(issue("error", "APPROVAL_WITHOUT_AUTHORITY", `${pointer}.approval_authority`, "Approval-required rule must name who can approve."));
      }
      if (isEmptyArray(rule.evidence_required)) {
        issues.push(issue("warning", "NO_EVIDENCE_REQUIREMENT", `${pointer}.evidence_required`, "Authority rule should state post-action evidence requirement."));
      }
    }
  }

  if (type === "decision-packet") {
    if (!payload.options || isEmptyArray(payload.options)) {
      issues.push(issue("critical", "DECISION_PACKET_WITHOUT_OPTIONS", "$.options", "Decision packet must present at least one decision option."));
    }
    const optionIds = new Set((payload.options || []).map(option => option.option_id));
    if (payload.recommended_option && !optionIds.has(payload.recommended_option)) {
      issues.push(issue("error", "RECOMMENDATION_NOT_IN_OPTIONS", "$.recommended_option", "Recommended option must match one of the packet options."));
    }
    if ((payload.decision_type === "approval" || payload.decision_type === "risk_acceptance") && isEmptyArray(payload.authority_required)) {
      issues.push(issue("critical", "AUTHORITY_REQUIRED_EMPTY", "$.authority_required", "Approval and risk-acceptance packets must state required authority."));
    }
    if (isEmptyArray(payload.evidence)) {
      issues.push(issue("error", "DECISION_WITHOUT_EVIDENCE", "$.evidence", "Decision packet must cite evidence or source-of-truth files."));
    }
  }

  if (type === "working-group") {
    if (!payload.participants || !payload.participants.includes(payload.chair)) {
      issues.push(issue("error", "CHAIR_NOT_IN_PARTICIPANTS", "$.participants", "Working group chair must be listed as a participant."));
    }
    if (isEmptyArray(payload.deliverables)) {
      issues.push(issue("error", "WORKING_GROUP_WITHOUT_DELIVERABLE", "$.deliverables", "Working group requires a deliverable such as a decision packet."));
    }
    if (isEmptyArray(payload.disband_condition)) {
      issues.push(issue("critical", "NO_DISBAND_CONDITION", "$.disband_condition", "Working group must have an explicit disband condition."));
    }
  }

  if (type === "department-collaboration-charter") {
    const departments = payload.departments || [];
    const departmentIds = new Set(departments.map(department => department.id));
    const relationships = payload.relationships || [];
    const liaisonRules = payload.liaison_rules || [];

    if (departments.length < 4) {
      issues.push(issue("error", "COLLABORATION_TOO_FEW_DEPARTMENTS", "$.departments", "Cross-functional collaboration should involve at least four functional departments."));
    }
    if (!departmentIds.has("command")) {
      issues.push(issue("critical", "COLLABORATION_WITHOUT_COMMAND", "$.departments", "Collaboration charter requires command/CoS integration department."));
    }
    if (!departmentIds.has("recorder")) {
      issues.push(issue("critical", "COLLABORATION_WITHOUT_RECORDER", "$.departments", "Collaboration charter requires Recorder/KM department for source-of-truth and handoff."));
    }
    if (!departmentIds.has("protection")) {
      issues.push(issue("critical", "COLLABORATION_WITHOUT_PROTECTION", "$.departments", "Collaboration charter requires protection/release department."));
    }

    for (const [index, department] of departments.entries()) {
      const pointer = `$.departments[${index}]`;
      if (!hasSubstantiveItems(department.responsibilities)) {
        issues.push(issue("error", "DEPARTMENT_WITHOUT_RESPONSIBILITIES", `${pointer}.responsibilities`, "Department must state responsibilities."));
      }
      if (!hasSubstantiveItems(department.outputs)) {
        issues.push(issue("error", "DEPARTMENT_WITHOUT_OUTPUTS", `${pointer}.outputs`, "Department must state output contract."));
      }
      if (!hasSubstantiveItems(department.authority_boundary)) {
        issues.push(issue("critical", "DEPARTMENT_WITHOUT_AUTHORITY_BOUNDARY", `${pointer}.authority_boundary`, "Department must state authority boundary."));
      }
      if (!hasSubstantiveItems(department.ccir)) {
        issues.push(issue("warning", "DEPARTMENT_WITHOUT_CCIR", `${pointer}.ccir`, "Department should state reporting triggers."));
      }
      if (!hasSubstantiveItems(department.source_of_truth_files)) {
        issues.push(issue("critical", "DEPARTMENT_WITHOUT_SOURCE_OF_TRUTH", `${pointer}.source_of_truth_files`, "Department must name source-of-truth files."));
      }
    }

    function hasLiaison(left, right) {
      return liaisonRules.some(rule => {
        const between = new Set(rule.between || []);
        return between.has(left) && between.has(right);
      });
    }

    for (const [index, rel] of relationships.entries()) {
      const pointer = `$.relationships[${index}]`;
      if (!departmentIds.has(rel.supported_department)) {
        issues.push(issue("critical", "RELATIONSHIP_UNKNOWN_SUPPORTED_DEPARTMENT", `${pointer}.supported_department`, "Supported department must exist in departments."));
      }
      if (!departmentIds.has(rel.supporting_department)) {
        issues.push(issue("critical", "RELATIONSHIP_UNKNOWN_SUPPORTING_DEPARTMENT", `${pointer}.supporting_department`, "Supporting department must exist in departments."));
      }
      if (rel.supported_department === rel.supporting_department) {
        issues.push(issue("error", "RELATIONSHIP_SELF_SUPPORTING", pointer, "A department cannot be both supported and supporting for the same relationship."));
      }
      if (!hasSubstantiveItems(rel.required_outputs)) {
        issues.push(issue("critical", "RELATIONSHIP_WITHOUT_REQUIRED_OUTPUTS", `${pointer}.required_outputs`, "Supporting relationship requires output contract."));
      }
      if (!hasSubstantiveItems(rel.quality_gate)) {
        issues.push(issue("error", "RELATIONSHIP_WITHOUT_QUALITY_GATE", `${pointer}.quality_gate`, "Supporting output needs a quality gate."));
      }
      if (/^none$/i.test(String(rel.handoff_interface || "").trim())) {
        issues.push(issue("critical", "RELATIONSHIP_WITHOUT_HANDOFF_INTERFACE", `${pointer}.handoff_interface`, "Supporting relationship requires a real handoff interface."));
      }
      if (!hasSubstantiveItems(rel.escalation_trigger)) {
        issues.push(issue("error", "RELATIONSHIP_WITHOUT_ESCALATION_TRIGGER", `${pointer}.escalation_trigger`, "Supporting relationship needs escalation trigger."));
      }
      if (departmentIds.has(rel.supported_department) && departmentIds.has(rel.supporting_department) && !hasLiaison(rel.supported_department, rel.supporting_department)) {
        issues.push(issue("critical", "RELATIONSHIP_WITHOUT_LIAISON", pointer, "Every supported/supporting relationship requires a liaison rule."));
      }
    }

    for (const [index, rule] of liaisonRules.entries()) {
      const pointer = `$.liaison_rules[${index}]`;
      if (!Array.isArray(rule.between) || rule.between.length !== 2) {
        issues.push(issue("error", "LIAISON_NOT_PAIRWISE", `${pointer}.between`, "Liaison rule should connect exactly two departments."));
      }
      for (const department of rule.between || []) {
        if (!departmentIds.has(department)) {
          issues.push(issue("critical", "LIAISON_UNKNOWN_DEPARTMENT", `${pointer}.between`, "Liaison rule references unknown department."));
        }
      }
      if (!hasSubstantiveItems(rule.information_to_exchange)) {
        issues.push(issue("error", "LIAISON_WITHOUT_INFORMATION_EXCHANGE", `${pointer}.information_to_exchange`, "Liaison must define information to exchange."));
      }
      if (/^none$/i.test(String(rule.update_cadence || "").trim())) {
        issues.push(issue("warning", "LIAISON_WITHOUT_CADENCE", `${pointer}.update_cadence`, "Liaison should define update cadence."));
      }
      if (!hasSubstantiveItems(rule.conflict_route)) {
        issues.push(issue("error", "LIAISON_WITHOUT_CONFLICT_ROUTE", `${pointer}.conflict_route`, "Liaison must define conflict route."));
      }
    }

    const sync = payload.synchronization || {};
    if (!hasSubstantiveItems(sync.battle_rhythm_events)) {
      issues.push(issue("error", "COLLABORATION_WITHOUT_BATTLE_RHYTHM", "$.synchronization.battle_rhythm_events", "Collaboration requires battle rhythm events."));
    }
    if (!hasSubstantiveItems(sync.decision_points)) {
      issues.push(issue("critical", "COLLABORATION_WITHOUT_DECISION_POINTS", "$.synchronization.decision_points", "Collaboration requires decision points."));
    }
    for (const [index, dependency] of (sync.dependency_matrix || []).entries()) {
      const pointer = `$.synchronization.dependency_matrix[${index}]`;
      if (!departmentIds.has(dependency.from_department) || !departmentIds.has(dependency.to_department)) {
        issues.push(issue("critical", "DEPENDENCY_UNKNOWN_DEPARTMENT", pointer, "Dependency matrix references unknown department."));
      }
    }

    const conflict = payload.conflict_resolution || {};
    if (!["COMMANDER", "COS"].includes(conflict.authority)) {
      issues.push(issue("critical", "COLLABORATION_CONFLICT_AUTHORITY_TOO_LOW", "$.conflict_resolution.authority", "Cross-department conflict resolution must route through Commander or CoS."));
    }
    if (conflict.decision_packet_required !== true) {
      issues.push(issue("critical", "COLLABORATION_WITHOUT_DECISION_PACKET_ROUTE", "$.conflict_resolution.decision_packet_required", "Mission, authority, risk, or release conflicts require decision packet route."));
    }
    const commanderEscalation = (conflict.commander_escalation || []).join("\n").toLowerCase();
    for (const [needle, code] of [
      ["red", "COLLABORATION_WITHOUT_RED_ESCALATION"],
      ["release", "COLLABORATION_WITHOUT_RELEASE_ESCALATION"],
      ["risk", "COLLABORATION_WITHOUT_RISK_ESCALATION"],
      ["scope", "COLLABORATION_WITHOUT_SCOPE_ESCALATION"]
    ]) {
      if (!commanderEscalation.includes(needle)) {
        issues.push(issue("critical", code, "$.conflict_resolution.commander_escalation", `Commander escalation must include ${needle} decisions.`));
      }
    }

    const controls = payload.collaboration_controls || {};
    for (const [field, code] of [
      ["no_silent_scope_change", "COLLABORATION_ALLOWS_SILENT_SCOPE_CHANGE"],
      ["source_map_required", "COLLABORATION_WITHOUT_SOURCE_MAP"],
      ["shared_glossary_required", "COLLABORATION_WITHOUT_SHARED_GLOSSARY"],
      ["handoff_required", "COLLABORATION_WITHOUT_HANDOFF"],
      ["aar_required", "COLLABORATION_WITHOUT_AAR"]
    ]) {
      if (controls[field] !== true) {
        issues.push(issue("error", code, `$.collaboration_controls.${field}`, `Collaboration control ${field} must be true.`));
      }
    }

    const infoPolicy = payload.information_policy || {};
    if (!hasSubstantiveItems(infoPolicy.need_to_know)) {
      issues.push(issue("error", "COLLABORATION_WITHOUT_NEED_TO_KNOW", "$.information_policy.need_to_know", "Collaboration must define need-to-know information policy."));
    }
    if (!hasSubstantiveItems(infoPolicy.context_sharing)) {
      issues.push(issue("error", "COLLABORATION_WITHOUT_CONTEXT_SHARING", "$.information_policy.context_sharing", "Collaboration must define context sharing policy."));
    }
    if (!hasSubstantiveItems(infoPolicy.eefi_controls)) {
      issues.push(issue("critical", "COLLABORATION_WITHOUT_EEFI_CONTROLS", "$.information_policy.eefi_controls", "Collaboration must define EEFI controls."));
    }

    const exit = payload.exit_criteria || {};
    if (!hasSubstantiveItems(exit.abort)) {
      issues.push(issue("critical", "COLLABORATION_WITHOUT_ABORT_CRITERIA", "$.exit_criteria.abort", "Collaboration must define abort criteria."));
    }
    if (!hasSubstantiveItems(exit.handoff)) {
      issues.push(issue("error", "COLLABORATION_WITHOUT_HANDOFF_CRITERIA", "$.exit_criteria.handoff", "Collaboration must define handoff criteria."));
    }
  }

  if (type === "force-structure-change-order") {
    const changeType = payload.change_type;
    const capability = payload.capability_gap || {};
    if (!hasSubstantiveItems(capability.evidence)) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_EVIDENCE", "$.capability_gap.evidence", "Force structure change requires evidence for the capability gap, overload, redundancy, or risk."));
    }
    if (!hasSubstantiveItems(capability.operational_impact)) {
      issues.push(issue("error", "FORCE_CHANGE_WITHOUT_OPERATIONAL_IMPACT", "$.capability_gap.operational_impact", "Force structure change must state operational impact."));
    }

    const alternatives = payload.alternatives_considered || [];
    if (alternatives.length < 2) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_ALTERNATIVES", "$.alternatives_considered", "Force structure change requires multiple alternatives before organization change."));
    }
    if (!alternatives.some(option => option.type !== "organization" && option.type !== "no_change")) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_NON_ORG_ALTERNATIVE", "$.alternatives_considered", "Consider SOP, training, tooling, authority, policy, or automation before changing organization."));
    }
    for (const [index, option] of alternatives.entries()) {
      const pointer = `$.alternatives_considered[${index}]`;
      if (/^none$/i.test(String(option.option || "").trim()) || /^none$/i.test(String(option.reason_not_sufficient || "").trim())) {
        issues.push(issue("error", "FORCE_CHANGE_PLACEHOLDER_ALTERNATIVE", pointer, "Alternatives must not be placeholder 'none' entries."));
      }
    }

    const dotmlpf = payload.dotmlpf_p || {};
    for (const [field, value] of Object.entries(dotmlpf)) {
      if (!hasSubstantiveItems(value)) {
        issues.push(issue("error", "FORCE_CHANGE_INCOMPLETE_DOTMLPF", `$.dotmlpf_p.${field}`, "DOTMLPF-P section must be substantively addressed."));
      }
    }

    const authority = payload.authority || {};
    if (["create", "activate", "expand", "merge", "split", "reduce", "deactivate", "disband"].includes(changeType) && authority.approving_authority !== "COMMANDER") {
      issues.push(issue("critical", "FORCE_CHANGE_REQUIRES_COMMANDER", "$.authority.approving_authority", "Force structure changes require Commander approval."));
    }
    const retained = (authority.commander_retained_decisions || []).join("\n").toLowerCase();
    for (const [needle, code] of [
      ["release", "FORCE_CHANGE_WITHOUT_RELEASE_RETAINED"],
      ["risk", "FORCE_CHANGE_WITHOUT_RISK_RETAINED"],
      ["scope", "FORCE_CHANGE_WITHOUT_SCOPE_RETAINED"]
    ]) {
      if (!retained.includes(needle)) {
        issues.push(issue("critical", code, "$.authority.commander_retained_decisions", `Commander-retained decisions must include ${needle}.`));
      }
    }
    if (!hasSubstantiveItems(authority.prohibited_changes)) {
      issues.push(issue("error", "FORCE_CHANGE_WITHOUT_PROHIBITIONS", "$.authority.prohibited_changes", "Force structure change must state prohibited changes."));
    }
    if (!hasSubstantiveItems(authority.approval_evidence)) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_APPROVAL_EVIDENCE", "$.authority.approval_evidence", "Force structure change needs approval evidence."));
    }

    const resources = payload.resources || {};
    if (!hasSubstantiveItems(resources.maintainer_roles)) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_MAINTAINER", "$.resources.maintainer_roles", "New or changed organization needs maintainer roles."));
    }
    if (!hasSubstantiveItems(resources.tooling)) {
      issues.push(issue("error", "FORCE_CHANGE_WITHOUT_TOOLING", "$.resources.tooling", "Force structure change must name required tooling or runner support."));
    }
    if (/unbounded/i.test(`${resources.context_budget || ""} ${resources.time_budget || ""}`)) {
      issues.push(issue("error", "FORCE_CHANGE_UNBOUNDED_RESOURCE", "$.resources", "Context/time budget must be bounded."));
    }
    if (!hasSubstantiveItems(resources.fallback)) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_FALLBACK", "$.resources.fallback", "Force structure change requires fallback plan."));
    }

    const readiness = payload.readiness || {};
    if (readiness.required_rating === "U" || readiness.required_rating === "X") {
      issues.push(issue("critical", "FORCE_CHANGE_LOW_READINESS_TARGET", "$.readiness.required_rating", "Cannot activate or expand force structure with U/X readiness requirement."));
    }
    if (!hasSubstantiveItems(readiness.metl_tasks)) {
      issues.push(issue("error", "FORCE_CHANGE_WITHOUT_METL", "$.readiness.metl_tasks", "Force structure change must define METL tasks."));
    }
    if (!hasSubstantiveItems(readiness.evidence)) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_READINESS_EVIDENCE", "$.readiness.evidence", "Force structure change requires readiness evidence."));
    }
    if (!hasSubstantiveItems(readiness.backup_or_successor)) {
      issues.push(issue("error", "FORCE_CHANGE_WITHOUT_SUCCESSOR", "$.readiness.backup_or_successor", "Changed organization requires backup or successor plan."));
    }
    if (!hasSubstantiveItems(readiness.validation_fixture)) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_VALIDATION_FIXTURE", "$.readiness.validation_fixture", "Force structure change requires validation fixture."));
    }

    const transition = payload.transition_plan || {};
    if (!hasSubstantiveItems(transition.activation_steps)) {
      issues.push(issue("error", "FORCE_CHANGE_WITHOUT_ACTIVATION_STEPS", "$.transition_plan.activation_steps", "Force structure change requires activation or execution steps."));
    }
    if (transition.handoff_required !== true) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_HANDOFF", "$.transition_plan.handoff_required", "Force structure change requires handoff."));
    }
    if (!hasSubstantiveItems(transition.data_migration)) {
      issues.push(issue("error", "FORCE_CHANGE_WITHOUT_DATA_MIGRATION", "$.transition_plan.data_migration", "Force structure change must preserve or migrate source-of-truth data."));
    }
    if (!hasSubstantiveItems(transition.deactivation_or_sunset)) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_SUNSET", "$.transition_plan.deactivation_or_sunset", "Force structure change requires deactivation or sunset conditions."));
    }
    if (!hasSubstantiveItems(transition.rollback)) {
      issues.push(issue("error", "FORCE_CHANGE_WITHOUT_ROLLBACK", "$.transition_plan.rollback", "Force structure change requires rollback plan."));
    }

    const docs = payload.documentation_updates || {};
    for (const [field, value] of Object.entries(docs)) {
      if (!hasSubstantiveItems(value)) {
        issues.push(issue("error", "FORCE_CHANGE_WITHOUT_DOC_UPDATE", `$.documentation_updates.${field}`, "Force structure change must update schema/sample/runner/index documentation as applicable."));
      }
    }

    const assessment = payload.assessment || {};
    if (!hasSubstantiveItems(assessment.mop)) {
      issues.push(issue("error", "FORCE_CHANGE_WITHOUT_MOP", "$.assessment.mop", "Force structure change must define MOP."));
    }
    if (!hasSubstantiveItems(assessment.moe)) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_MOE", "$.assessment.moe", "Force structure change must define MOE."));
    }
    if (!hasSubstantiveItems(assessment.aar_trigger)) {
      issues.push(issue("error", "FORCE_CHANGE_WITHOUT_AAR_TRIGGER", "$.assessment.aar_trigger", "Force structure change must define AAR triggers."));
    }
    if (!isBefore(payload.created_at, assessment.review_at)) {
      issues.push(issue("error", "FORCE_CHANGE_REVIEW_NOT_FUTURE", "$.assessment.review_at", "Review date must be after order creation."));
    }
    if (!hasSubstantiveItems(assessment.sunset_condition)) {
      issues.push(issue("critical", "FORCE_CHANGE_WITHOUT_SUNSET_CONDITION", "$.assessment.sunset_condition", "Force structure change must define sunset/disband condition."));
    }

    if ((changeType === "reduce" || changeType === "deactivate" || changeType === "disband") && !hasSubstantiveItems(transition.data_migration)) {
      issues.push(issue("critical", "FORCE_REDUCTION_WITHOUT_TRANSFER", "$.transition_plan.data_migration", "Reduction/deactivation/disband must transfer essential functions and records."));
    }
  }

  if (type === "document-access-manifest") {
    if (payload.default_decision !== "deny") {
      issues.push(issue("critical", "DOCUMENT_ACCESS_DEFAULT_NOT_DENY", "$.default_decision", "Document access manifest must default to deny."));
    }

    const controls = payload.controls || {};
    if (controls.need_to_know !== true) {
      issues.push(issue("critical", "DOCUMENT_ACCESS_WITHOUT_NEED_TO_KNOW", "$.controls.need_to_know", "Document access must enforce need-to-know."));
    }
    if (controls.no_bulk_read !== true) {
      issues.push(issue("critical", "DOCUMENT_ACCESS_ALLOWS_BULK_READ", "$.controls.no_bulk_read", "Document access must prohibit bulk read."));
    }
    if (controls.audit_required !== true) {
      issues.push(issue("critical", "DOCUMENT_ACCESS_WITHOUT_AUDIT", "$.controls.audit_required", "Document access must require audit events."));
    }
    if (controls.exception_requires_approval !== true) {
      issues.push(issue("critical", "DOCUMENT_ACCESS_EXCEPTION_WITHOUT_APPROVAL", "$.controls.exception_requires_approval", "Document access exceptions must require approval."));
    }
    if (!controls.source_of_truth || /^none$/i.test(String(controls.source_of_truth).trim())) {
      issues.push(issue("error", "DOCUMENT_ACCESS_WITHOUT_SOURCE_OF_TRUTH", "$.controls.source_of_truth", "Document access manifest must name a source-of-truth policy."));
    }

    const documents = payload.documents || [];
    const documentByPath = new Map();
    for (const [index, document] of documents.entries()) {
      const pointer = `$.documents[${index}]`;
      documentByPath.set(document.path, document);
      if (document.path === "*" || /\/\*$/.test(document.path || "")) {
        issues.push(issue("critical", "DOCUMENT_ACCESS_WILDCARD_PATH", `${pointer}.path`, "Document access must name explicit files, not wildcard paths."));
      }
      if (/^https?:\/\//.test(document.path || "") || path.isAbsolute(document.path || "") || (document.path || "").includes("..")) {
        issues.push(issue("error", "DOCUMENT_ACCESS_NONLOCAL_PATH", `${pointer}.path`, "Document access manifest should point to controlled local repository paths."));
      }
      if (document.path && document.path !== "*" && !/^https?:\/\//.test(document.path) && !path.isAbsolute(document.path) && !document.path.includes("..")) {
        if (!fs.existsSync(path.join(ROOT, document.path))) {
          issues.push(issue("error", "DOCUMENT_ACCESS_DOC_PATH_MISSING", `${pointer}.path`, "Declared document path does not exist."));
        }
      }
      if (!hasSubstantiveItems(document.allowed_roles)) {
        issues.push(issue("critical", "DOCUMENT_ACCESS_WITHOUT_ALLOWED_ROLES", `${pointer}.allowed_roles`, "Each document must list allowed roles."));
      }
      if (!hasSubstantiveItems(document.duties)) {
        issues.push(issue("critical", "DOCUMENT_ACCESS_WITHOUT_DUTIES", `${pointer}.duties`, "Each document must list allowed duties."));
      }
      if (document.classification === "restricted" && document.delivery_mode === "raw") {
        issues.push(issue("critical", "DOCUMENT_ACCESS_RESTRICTED_RAW", `${pointer}.delivery_mode`, "Restricted documents cannot be delivered raw by manifest."));
      }
      if (document.classification === "sensitive" && document.delivery_mode === "raw") {
        const roles = document.allowed_roles || [];
        if (roles.includes("EXECUTOR") || roles.length > 3) {
          issues.push(issue("critical", "DOCUMENT_ACCESS_SENSITIVE_RAW_TOO_BROAD", `${pointer}.delivery_mode`, "Sensitive raw access must not be broad or defaulted to executors."));
        }
      }
    }

    for (const [index, profile] of (payload.role_profiles || []).entries()) {
      const pointer = `$.role_profiles[${index}]`;
      if (!hasSubstantiveItems(profile.required_documents)) {
        issues.push(issue("critical", "DOCUMENT_ACCESS_PROFILE_WITHOUT_REQUIRED_DOCS", `${pointer}.required_documents`, "Each role profile must define required reading."));
      }
      if (profile.escalation_role === profile.role) {
        issues.push(issue("critical", "DOCUMENT_ACCESS_ESCALATION_SELF", `${pointer}.escalation_role`, "Document access exceptions must escalate to another role."));
      }

      const denied = new Set(profile.denied_documents || []);
      for (const docPath of profile.required_documents || []) {
        if (denied.has(docPath)) {
          issues.push(issue("critical", "DOCUMENT_ACCESS_DENIED_DOC_REQUIRED", `${pointer}.required_documents`, "Required reading cannot include a denied document."));
        }
        const document = documentByPath.get(docPath);
        if (!document) {
          issues.push(issue("critical", "DOCUMENT_ACCESS_REQUIRED_DOC_NOT_DECLARED", `${pointer}.required_documents`, "Required document must be declared in documents list."));
          continue;
        }
        const roleAllowed = (document.allowed_roles || []).includes(profile.role);
        const dutyAllowed = (document.duties || []).includes(profile.duty) || (document.duties || []).includes("mission_common");
        const authorityAllowed = authorityAtLeast(profile.authority_level, document.minimum_authority_level);
        const restrictedRaw = document.classification === "restricted" && document.delivery_mode === "raw";
        if (!roleAllowed || !dutyAllowed || !authorityAllowed || restrictedRaw) {
          issues.push(issue("critical", "DOCUMENT_ACCESS_REQUIRED_DOC_NOT_READABLE", `${pointer}.required_documents`, "Required document is not readable by the profile role, duty, authority, or delivery rule."));
        }
      }

      for (const docPath of profile.optional_documents || []) {
        if (!documentByPath.has(docPath)) {
          issues.push(issue("error", "DOCUMENT_ACCESS_OPTIONAL_DOC_NOT_DECLARED", `${pointer}.optional_documents`, "Optional document must be declared in documents list."));
        }
      }
    }
  }

  if (type === "ccir-alert") {
    if ((payload.severity === "Red" || payload.severity === "Black") && !payload.blocks_execution) {
      issues.push(issue("critical", "HIGH_SEVERITY_ALERT_NOT_BLOCKING", "$.blocks_execution", "Red and Black alerts must block execution until disposition."));
    }
    if ((payload.severity === "Red" || payload.severity === "Black") && !payload.required_decision) {
      issues.push(issue("critical", "HIGH_SEVERITY_WITHOUT_DECISION", "$.required_decision", "Red and Black alerts must state the required commander decision."));
    }
    if (payload.ccir_type === "EEFI" && payload.sensitive !== true) {
      issues.push(issue("error", "EEFI_NOT_MARKED_SENSITIVE", "$.sensitive", "EEFI alerts must be marked sensitive."));
    }
  }

  if (type === "handoff-packet") {
    if (!payload.source_of_truth_files || isEmptyArray(payload.source_of_truth_files)) {
      issues.push(issue("critical", "HANDOFF_WITHOUT_SOURCE_OF_TRUTH", "$.source_of_truth_files", "Handoff packet must identify source-of-truth files."));
    }
    if (payload.blocked && payload.blocked.length > 0 && isEmptyArray(payload.pending_decisions)) {
      issues.push(issue("critical", "BLOCKED_WITHOUT_PENDING_DECISION", "$.pending_decisions", "Blocked handoff items must name pending commander decisions."));
    }
    if (isEmptyArray(payload.do_not_do)) {
      issues.push(issue("warning", "HANDOFF_WITHOUT_PROHIBITIONS", "$.do_not_do", "Handoff should restate do-not-do boundaries."));
    }
  }

  if (type === "continuity-plan") {
    const successionByRole = new Map((payload.succession_rules || []).map(rule => [rule.from_role, rule]));
    for (const [index, fn] of (payload.essential_functions || []).entries()) {
      const pointer = `$.essential_functions[${index}]`;
      if (!hasSubstantiveItems(fn.backup_roles) || fn.backup_roles.length < 2) {
        issues.push(issue("critical", "ESSENTIAL_FUNCTION_NOT_TWO_DEEP", `${pointer}.backup_roles`, "Essential functions require at least two backup roles."));
      }
      if ((fn.backup_roles || []).includes(fn.owner_role)) {
        issues.push(issue("critical", "SUCCESSOR_CANNOT_BE_SELF", `${pointer}.backup_roles`, "Backup roles cannot be the same as the unavailable owner role."));
      }
      if (fn.handoff_required !== true) {
        issues.push(issue("error", "ESSENTIAL_FUNCTION_WITHOUT_HANDOFF", `${pointer}.handoff_required`, "Essential function continuity requires a handoff packet."));
      }
      if (!hasSubstantiveItems(fn.source_of_truth_files)) {
        issues.push(issue("error", "ESSENTIAL_FUNCTION_WITHOUT_VITAL_RECORDS", `${pointer}.source_of_truth_files`, "Essential function needs source-of-truth files."));
      }
      if (!successionByRole.has(fn.owner_role)) {
        issues.push(issue("critical", "ESSENTIAL_FUNCTION_WITHOUT_SUCCESSION_RULE", `${pointer}.owner_role`, "Essential function owner must have a succession rule."));
      }
    }
    for (const [index, rule] of (payload.succession_rules || []).entries()) {
      const pointer = `$.succession_rules[${index}]`;
      if (!hasSubstantiveItems(rule.successors) || rule.successors.length < 2) {
        issues.push(issue("critical", "SUCCESSION_RULE_NOT_TWO_DEEP", `${pointer}.successors`, "Succession rule requires at least two successors."));
      }
      if ((rule.successors || []).includes(rule.from_role)) {
        issues.push(issue("critical", "SUCCESSION_RULE_SELF_SUCCESSOR", `${pointer}.successors`, "A role cannot succeed itself after loss or unavailability."));
      }
      if (!hasSubstantiveItems(rule.activation_triggers)) {
        issues.push(issue("error", "SUCCESSION_WITHOUT_TRIGGER", `${pointer}.activation_triggers`, "Succession rule needs activation triggers."));
      }
      if (!hasSubstantiveItems(rule.authority_limits)) {
        issues.push(issue("critical", "SUCCESSION_WITHOUT_AUTHORITY_LIMITS", `${pointer}.authority_limits`, "Successor authority must be bounded."));
      }
      if (!hasSubstantiveItems(rule.notification_roles)) {
        issues.push(issue("warning", "SUCCESSION_WITHOUT_NOTIFICATION", `${pointer}.notification_roles`, "Succession should notify affected command and KM roles."));
      }
    }
    for (const [index, rotation] of (payload.rotation_windows || []).entries()) {
      const pointer = `$.rotation_windows[${index}]`;
      if (rotation.overlap_required !== true) {
        issues.push(issue("error", "ROTATION_WITHOUT_OVERLAP", `${pointer}.overlap_required`, "Role rotation requires overlap."));
      }
      if (rotation.backbrief_required !== true) {
        issues.push(issue("error", "ROTATION_WITHOUT_BACKBRIEF", `${pointer}.backbrief_required`, "Incoming role must backbrief before assuming duties."));
      }
      if (rotation.handoff_packet_required !== true) {
        issues.push(issue("error", "ROTATION_WITHOUT_HANDOFF_PACKET", `${pointer}.handoff_packet_required`, "Rotation requires a handoff packet."));
      }
      if (rotation.rehearsal_required !== true) {
        issues.push(issue("warning", "ROTATION_WITHOUT_REHEARSAL", `${pointer}.rehearsal_required`, "High-risk rotations should rehearse before execution."));
      }
    }
    const vitalRecords = (payload.vital_records || []).join("\n").toLowerCase();
    if (!/authority/.test(vitalRecords)) {
      issues.push(issue("critical", "CONTINUITY_WITHOUT_AUTHORITY_RECORD", "$.vital_records", "Continuity vital records must include authority source of truth."));
    }
    if (!/handoff/.test(vitalRecords)) {
      issues.push(issue("critical", "CONTINUITY_WITHOUT_HANDOFF_RECORD", "$.vital_records", "Continuity vital records must include handoff source of truth."));
    }
    const degradation = payload.degradation_policy || {};
    if (!hasSubstantiveItems(degradation.functions_to_pause)) {
      issues.push(issue("critical", "DEGRADED_MODE_WITHOUT_PAUSED_FUNCTIONS", "$.degradation_policy.functions_to_pause", "Continuity plan must pause high-risk functions in degraded mode."));
    }
    if (!hasSubstantiveItems(degradation.commander_retained_decisions)) {
      issues.push(issue("critical", "CONTINUITY_WITHOUT_COMMANDER_RETAINED_DECISIONS", "$.degradation_policy.commander_retained_decisions", "Continuity plan must preserve commander-retained decisions."));
    }
    if (!hasSubstantiveItems(degradation.recovery_actions)) {
      issues.push(issue("error", "CONTINUITY_WITHOUT_RECOVERY_ACTIONS", "$.degradation_policy.recovery_actions", "Continuity plan needs recovery actions."));
    }
    if (!hasSubstantiveItems(payload.validation && payload.validation.tested_scenarios)) {
      issues.push(issue("warning", "CONTINUITY_WITHOUT_DRILL_SCENARIOS", "$.validation.tested_scenarios", "Continuity plan should be drill-tested."));
    }
  }

  if (type === "sof-tf-charter") {
    const trigger = payload.trigger || {};
    if (!hasSubstantiveItems(trigger.conditions) || /^none$/i.test(String(trigger.why_general_workflow_insufficient || "").trim())) {
      issues.push(issue("critical", "SOF_TF_WITHOUT_TRIGGER", "$.trigger", "SOF TF activation requires a concrete trigger and reason general workflow is insufficient."));
    }
    if (!hasSubstantiveItems(payload.activity_mapping)) {
      issues.push(issue("error", "SOF_TF_WITHOUT_ACTIVITY_MAPPING", "$.activity_mapping", "SOF TF must map the mission to a safe AI activity category."));
    }
    if (trigger.risk_level === "low" && trigger.urgency === "routine") {
      issues.push(issue("warning", "SOF_TF_LOW_RISK_ACTIVATION", "$.trigger.risk_level", "Routine low-risk work should normally use the standard workflow, not SOF TF."));
    }

    const authority = payload.authority || {};
    const retained = (authority.retained_by_commander || []).join("\n").toLowerCase();
    if (!/red/.test(retained)) {
      issues.push(issue("critical", "SOF_TF_WITHOUT_RED_RETAINED_AUTHORITY", "$.authority.retained_by_commander", "Red approval must remain commander-retained."));
    }
    if (!/release/.test(retained)) {
      issues.push(issue("critical", "SOF_TF_WITHOUT_RELEASE_RETAINED_AUTHORITY", "$.authority.retained_by_commander", "External release approval must remain commander-retained."));
    }
    if (!/risk/.test(retained)) {
      issues.push(issue("critical", "SOF_TF_WITHOUT_RISK_RETAINED_AUTHORITY", "$.authority.retained_by_commander", "High or critical residual risk acceptance must remain commander-retained."));
    }
    if (isEmptyArray(authority.prohibited)) {
      issues.push(issue("critical", "SOF_TF_WITHOUT_PROHIBITIONS", "$.authority.prohibited", "SOF TF charter must state prohibited actions."));
    }
    if ((payload.activity_mapping || []).includes("direct_action") && !hasSubstantiveItems(authority.approval_required)) {
      issues.push(issue("critical", "SOF_TF_DIRECT_ACTION_WITHOUT_APPROVAL", "$.authority.approval_required", "Direct-action-like AI work requires explicit approval-required actions."));
    }

    const cells = payload.cells || {};
    if (cells.red_team && [cells.lead, cells.s3_execution, cells.opsec_release].includes(cells.red_team)) {
      issues.push(issue("critical", "SOF_TF_RED_TEAM_NOT_INDEPENDENT", "$.cells.red_team", "Red Team must be independent from lead, executor, and release reviewer."));
    }
    if (cells.opsec_release && cells.opsec_release === cells.s3_execution) {
      issues.push(issue("critical", "SOF_TF_RELEASE_REVIEW_NOT_INDEPENDENT", "$.cells.opsec_release", "OPSEC/release reviewer cannot be the execution cell."));
    }
    if (cells.recorder !== "RECORDER") {
      issues.push(issue("error", "SOF_TF_WITHOUT_RECORDER", "$.cells.recorder", "SOF TF requires a Recorder/KM cell for audit and handoff."));
    }
    if (!["S4", "S6"].includes(cells.s4_s6_enabler)) {
      issues.push(issue("error", "SOF_TF_WITHOUT_SUSTAINMENT_ENABLER", "$.cells.s4_s6_enabler", "SOF TF requires an S4/S6 enabler, not only an executor."));
    }

    const ccir = payload.ccir || {};
    if (!hasSubstantiveItems(ccir.eefi)) {
      issues.push(issue("critical", "SOF_TF_WITHOUT_EEFI", "$.ccir.eefi", "SOF TF must define EEFI before distributing context."));
    }
    if (!hasSubstantiveItems(ccir.decision_points)) {
      issues.push(issue("error", "SOF_TF_WITHOUT_DECISION_POINTS", "$.ccir.decision_points", "SOF TF must define commander decision points."));
    }

    const isolation = payload.isolation || {};
    if (!hasSubstantiveItems(isolation.context_rules)) {
      issues.push(issue("error", "SOF_TF_WITHOUT_CONTEXT_RULES", "$.isolation.context_rules", "SOF TF needs need-to-know context distribution rules."));
    }
    if (!hasSubstantiveItems(isolation.eefi_controls)) {
      issues.push(issue("critical", "SOF_TF_WITHOUT_EEFI_CONTROLS", "$.isolation.eefi_controls", "SOF TF must define EEFI controls."));
    }

    const enablers = payload.enablers || {};
    if (enablers.source_map_required !== true) {
      issues.push(issue("critical", "SOF_TF_SOURCE_MAP_NOT_REQUIRED", "$.enablers.source_map_required", "SOF TF requires source-map discipline."));
    }
    if (enablers.release_review_required !== true) {
      issues.push(issue("critical", "SOF_TF_RELEASE_REVIEW_NOT_REQUIRED", "$.enablers.release_review_required", "SOF TF output requires release review."));
    }
    if (enablers.maintenance_check_required !== true) {
      issues.push(issue("error", "SOF_TF_WITHOUT_MAINTENANCE_CHECK", "$.enablers.maintenance_check_required", "SOF TF requires tool/resource readiness check."));
    }
    if (!hasSubstantiveItems(enablers.fallback_plan)) {
      issues.push(issue("critical", "SOF_TF_WITHOUT_FALLBACK_PLAN", "$.enablers.fallback_plan", "SOF TF requires PACE/fallback plan."));
    }
    const supportRoles = new Set(enablers.support_roles || []);
    if (!supportRoles.has("S6") && !supportRoles.has("S4")) {
      issues.push(issue("error", "SOF_TF_WITHOUT_SUPPORT_ROLE", "$.enablers.support_roles", "SOF TF needs S4/S6 support roles."));
    }

    const rehearsal = payload.rehearsal || {};
    if (rehearsal.backbrief_required !== true) {
      issues.push(issue("error", "SOF_TF_WITHOUT_BACKBRIEF", "$.rehearsal.backbrief_required", "SOF TF activation requires backbrief."));
    }
    if (rehearsal.rehearsal_required !== true) {
      issues.push(issue("error", "SOF_TF_WITHOUT_REHEARSAL", "$.rehearsal.rehearsal_required", "SOF TF activation requires rehearsal."));
    }
    if (rehearsal.dry_run_required !== true) {
      issues.push(issue("error", "SOF_TF_WITHOUT_DRY_RUN", "$.rehearsal.dry_run_required", "SOF TF activation requires dry run before execution."));
    }

    const exit = payload.exit_criteria || {};
    if (!hasSubstantiveItems(exit.abort)) {
      issues.push(issue("critical", "SOF_TF_WITHOUT_ABORT_CRITERIA", "$.exit_criteria.abort", "SOF TF must define abort criteria."));
    }
    if (!hasSubstantiveItems(exit.handoff)) {
      issues.push(issue("error", "SOF_TF_WITHOUT_HANDOFF_CRITERIA", "$.exit_criteria.handoff", "SOF TF must define handoff criteria."));
    }
  }

  if (type === "doctrine-consistency-review") {
    const sourceFamilies = payload.source_families || [];
    const nonUsFamilies = sourceFamilies.filter(source => String(source.family_id || "").toUpperCase() !== "US");
    if (sourceFamilies.length < 4) {
      issues.push(issue("critical", "DOCTRINE_REVIEW_TOO_FEW_SOURCE_FAMILIES", "$.source_families", "Doctrine consistency review must compare at least four official source families."));
    }
    if (nonUsFamilies.length < 3) {
      issues.push(issue("critical", "DOCTRINE_REVIEW_TOO_FEW_NON_US_FAMILIES", "$.source_families", "Doctrine consistency review must include at least three non-US source families."));
    }
    for (const [index, source] of sourceFamilies.entries()) {
      const pointer = `$.source_families[${index}]`;
      if (!hasSubstantiveItems(source.official_source_urls)) {
        issues.push(issue("critical", "DOCTRINE_REVIEW_SOURCE_WITHOUT_OFFICIAL_URL", `${pointer}.official_source_urls`, "Each source family must cite official source URLs."));
      }
      if (!hasSubstantiveItems(source.doctrine_scope)) {
        issues.push(issue("error", "DOCTRINE_REVIEW_SOURCE_WITHOUT_SCOPE", `${pointer}.doctrine_scope`, "Each source family must state doctrine or policy scope."));
      }
      if (!hasSubstantiveItems(source.comparison_use)) {
        issues.push(issue("error", "DOCTRINE_REVIEW_SOURCE_WITHOUT_COMPARISON_USE", `${pointer}.comparison_use`, "Each source family must state how it is used in comparison."));
      }
    }

    for (const [index, finding] of (payload.policy_findings || []).entries()) {
      const pointer = `$.policy_findings[${index}]`;
      if (finding.disposition === "adopt_us_only") {
        issues.push(issue("critical", "DOCTRINE_REVIEW_US_ONLY_DISPOSITION", `${pointer}.disposition`, "US-only adoption is not a valid disposition for multinational consistency review."));
      }
      if ((finding.consistency_risk === "medium" || finding.consistency_risk === "high" || finding.consistency_risk === "critical") && !hasSubstantiveItems(finding.policy_update_targets)) {
        issues.push(issue("critical", "DOCTRINE_REVIEW_FINDING_WITHOUT_POLICY_TARGET", `${pointer}.policy_update_targets`, "Medium or higher consistency findings require policy update targets."));
      }
      if (finding.verification && finding.verification.status !== "verified") {
        issues.push(issue("error", "DOCTRINE_REVIEW_UNVERIFIED_FINDING", `${pointer}.verification.status`, "Doctrine consistency findings must be verified before the review is complete."));
      }
      if (finding.category === "role_staff_terminology" && !/alias|local|terminology/i.test(`${finding.resolution || ""} ${(finding.policy_update_targets || []).join(" ")}`)) {
        issues.push(issue("critical", "DOCTRINE_REVIEW_ROLE_ALIAS_MISSING", `${pointer}.resolution`, "Role/staff terminology conflicts require alias or local terminology handling."));
      }
      if (finding.category === "roe_legal_authority" && !/jurisdiction|legal|local/i.test(`${finding.resolution || ""} ${(finding.policy_update_targets || []).join(" ")}`)) {
        issues.push(issue("critical", "DOCTRINE_REVIEW_JURISDICTION_GATE_MISSING", `${pointer}.resolution`, "ROE/legal authority conflicts require local jurisdiction review."));
      }
      if (finding.category === "force_structure" && !/capability|lifecycle|DOTMLPF/i.test(finding.resolution || "")) {
        issues.push(issue("warning", "DOCTRINE_REVIEW_FORCE_STRUCTURE_NOT_GENERALIZED", `${pointer}.resolution`, "Force structure findings should translate US terms into a capability lifecycle review."));
      }
    }

    const controls = payload.resolution_controls || {};
    for (const [field, value] of Object.entries(controls)) {
      if (value !== true) {
        issues.push(issue("critical", "DOCTRINE_REVIEW_CONTROL_DISABLED", `$.resolution_controls.${field}`, `Doctrine consistency control ${field} must be true.`));
      }
    }

    const docs = payload.documentation_updates || {};
    for (const [field, value] of Object.entries(docs)) {
      if (!hasSubstantiveItems(value)) {
        issues.push(issue("error", "DOCTRINE_REVIEW_PLACEHOLDER_DOC_UPDATE", `$.documentation_updates.${field}`, "Doctrine consistency review must name documentation updates, not placeholder none."));
      }
    }
  }

  if (type === "context-item") {
    if (payload.eefi === true && payload.release_to_final === true) {
      issues.push(issue("critical", "EEFI_RELEASE_TO_FINAL", "$.release_to_final", "EEFI context cannot be released directly to final output."));
    }
    if (payload.classification === "restricted" && payload.release_to_final === true) {
      issues.push(issue("critical", "RESTRICTED_RELEASE_TO_FINAL", "$.release_to_final", "Restricted context cannot be released directly to final output."));
    }
    if (isEmptyArray(payload.allowed_roles)) {
      issues.push(issue("error", "NO_ALLOWED_ROLES", "$.allowed_roles", "Context item must name allowed receiving roles."));
    }
    if (payload.eefi === true && /password|token|secret|private[_-]?key|credential/i.test(payload.raw_value || "")) {
      issues.push(issue("warning", "RAW_EEFI_PRESENT", "$.raw_value", "Raw EEFI is present; prefer redacted source storage."));
    }
  }

  if (type === "release-review") {
    if (isEmptyArray(payload.items)) {
      issues.push(issue("critical", "RELEASE_REVIEW_WITHOUT_ITEMS", "$.items", "Release review must evaluate at least one context item."));
    }
    if (isEmptyArray(payload.output_constraints)) {
      issues.push(issue("error", "NO_RELEASE_CONSTRAINTS", "$.output_constraints", "Release review must state output constraints."));
    }
    for (const [index, item] of (payload.items || []).entries()) {
      const pointer = `$.items[${index}]`;
      if ((item.eefi === true || item.classification === "restricted") && item.delivery_mode === "raw") {
        issues.push(issue("critical", "RESTRICTED_OR_EEFI_RAW_RELEASE", `${pointer}.delivery_mode`, "Restricted or EEFI item cannot be released raw."));
      }
      if (payload.target === "final_output" && item.delivery_mode === "raw" && item.classification !== "public") {
        issues.push(issue("error", "NON_PUBLIC_RAW_FINAL_OUTPUT", `${pointer}.delivery_mode`, "Final output should not include raw non-public context."));
      }
      if ((item.delivery_mode === "redacted" || item.delivery_mode === "denied") && isEmptyArray(item.redactions)) {
        issues.push(issue("warning", "REDACTION_NOT_EXPLAINED", `${pointer}.redactions`, "Redacted or denied item should explain redactions."));
      }
    }
  }

  if (type === "release-gate-decision-event") {
    const authority = payload.authority || {};
    const release = payload.release_review || {};
    const allowingDecision = payload.final_decision === "allow_scoped_execution" || payload.final_decision === "allow_scoped_execution_and_release";
    const blockingDecision = payload.final_decision === "prohibit" || payload.final_decision === "blocked_pending_authority" || payload.final_decision === "blocked_pending_release_review";

    if (payload.blocked !== blockingDecision) {
      issues.push(issue("critical", "RELEASE_GATE_BLOCKED_FLAG_MISMATCH", "$.blocked", "Release gate blocked flag must match final_decision."));
    }
    if (authority.blocked === true && allowingDecision) {
      issues.push(issue("critical", "RELEASE_GATE_ALLOW_WITH_AUTHORITY_BLOCK", "$.final_decision", "Release gate cannot allow when authority integration is blocked."));
    }
    if (authority.blocked === true && !(payload.final_decision === "blocked_pending_authority" || payload.final_decision === "prohibit")) {
      issues.push(issue("critical", "RELEASE_GATE_AUTHORITY_BLOCK_NOT_FINAL", "$.final_decision", "Authority block must drive the final release gate decision."));
    }
    if (authority.allowed === true && release.required === true && release.valid !== true && payload.final_decision !== "blocked_pending_release_review") {
      issues.push(issue("critical", "RELEASE_GATE_RELEASE_BLOCK_NOT_FINAL", "$.final_decision", "Failed or missing release review must block otherwise authorized execution."));
    }
    if (authority.allowed === true && release.required === true && release.valid === true && payload.final_decision !== "allow_scoped_execution_and_release") {
      issues.push(issue("error", "RELEASE_GATE_VALID_REVIEW_NOT_RELEASED", "$.final_decision", "Authorized execution with valid required release review should allow scoped execution and release."));
    }
    if (authority.allowed === true && release.required !== true && payload.final_decision !== "allow_scoped_execution") {
      issues.push(issue("error", "RELEASE_GATE_UNREQUIRED_REVIEW_DECISION_MISMATCH", "$.final_decision", "When release review is not required, final decision should mirror scoped execution."));
    }
    if (release.required === true && release.valid === true && !release.review_id) {
      issues.push(issue("error", "RELEASE_GATE_VALID_REVIEW_WITHOUT_ID", "$.release_review.review_id", "Valid release gate review must reference the release review id."));
    }
    if (release.required === true && release.valid !== true && allowingDecision) {
      issues.push(issue("critical", "RELEASE_GATE_ALLOW_WITH_FAILED_RELEASE_REVIEW", "$.final_decision", "Release gate cannot allow final/external output with a failed or missing release review."));
    }
    if (payload.blocked === true && !hasSubstantiveItems(payload.reasons)) {
      issues.push(issue("error", "RELEASE_GATE_BLOCK_WITHOUT_REASONS", "$.reasons", "Blocked release gate decision must include reasons."));
    }
    if (!hasSubstantiveItems(payload.evidence)) {
      issues.push(issue("error", "RELEASE_GATE_WITHOUT_EVIDENCE", "$.evidence", "Release gate decision event must include evidence."));
    }
  }

  if (type === "routing-receipt") {
    if (!isValidDate(payload.created_at)) {
      issues.push(issue("critical", "ROUTING_RECEIPT_INVALID_TIMESTAMP", "$.created_at", "Routing receipt must have a valid timestamp."));
    }
    if (!hasSubstantiveItems((payload.matched_routes || []).map(route => route.id))) {
      issues.push(issue("critical", "ROUTING_RECEIPT_WITHOUT_MATCHED_ROUTES", "$.matched_routes", "Routing receipt must record at least one matched route."));
    }
    if (!hasSubstantiveItems((payload.recommended_documents || []).map(document => document.path))) {
      issues.push(issue("critical", "ROUTING_RECEIPT_WITHOUT_RECOMMENDED_DOCS", "$.recommended_documents", "Routing receipt must record recommended documents."));
    }
    const recommendedPaths = new Set((payload.recommended_documents || []).map(document => document.path));
    if (!recommendedPaths.has("docs/source-map.md")) {
      issues.push(issue("error", "ROUTING_RECEIPT_WITHOUT_SOURCE_MAP", "$.recommended_documents", "Routing receipt must keep source-map visible as a baseline document."));
    }
    if (!recommendedPaths.has("README.md")) {
      issues.push(issue("error", "ROUTING_RECEIPT_WITHOUT_README", "$.recommended_documents", "Routing receipt must keep README visible as an orientation document."));
    }
    const inventory = payload.route_inventory || {};
    if (inventory.unrouted_artifact_count !== 0) {
      issues.push(issue("critical", "ROUTING_RECEIPT_UNROUTED_ARTIFACTS", "$.route_inventory.unrouted_artifact_count", "Routing receipt cannot be accepted while corpus artifacts are unrouted."));
    }
    if (!/route_controls_docs\.js/.test(payload.router_command || "")) {
      issues.push(issue("critical", "ROUTING_RECEIPT_NOT_FROM_CONTROLS_ROUTER", "$.router_command", "Routing receipt must be produced by the Controls document router."));
    }
    if (!/--actor(?:=|\s+)ai\b/.test(payload.router_command || "")) {
      issues.push(issue("critical", "ROUTING_RECEIPT_NOT_AI_ACTOR", "$.router_command", "Delegated routing receipt must be produced with --actor=ai."));
    }
    if (payload.actor !== "ai" || payload.routing_mode !== "delegated_ai_role_department_authority") {
      issues.push(issue("critical", "ROUTING_RECEIPT_NOT_DELEGATED_AI", "$.actor", "Routing receipt for agent preflight must be delegated AI routing."));
    }

    if (payload.wave_scope === "wave") {
      if (payload.agent_role !== "COS") {
        issues.push(issue("critical", "WAVE_ROUTING_NOT_COS", "$.agent_role", "Wave-level routing must be opened by COS."));
      }
      if (payload.department !== "coordination") {
        issues.push(issue("critical", "WAVE_ROUTING_WRONG_DEPARTMENT", "$.department", "Wave-level routing must use coordination department."));
      }
      if (payload.authority_scope !== "tasking") {
        issues.push(issue("critical", "WAVE_ROUTING_WRONG_AUTHORITY", "$.authority_scope", "Wave-level routing must use tasking authority."));
      }
    }

    if (payload.wave_scope === "agent") {
      if (payload.agent_role !== "S3") {
        issues.push(issue("critical", "AGENT_ROUTING_NOT_S3", "$.agent_role", "Agent work receipt must route through S3 execution role."));
      }
      if (payload.department !== "operations") {
        issues.push(issue("critical", "AGENT_ROUTING_WRONG_DEPARTMENT", "$.department", "Agent work receipt must use operations department."));
      }
      if (payload.authority_scope !== "scoped-execution") {
        issues.push(issue("critical", "AGENT_ROUTING_WRONG_AUTHORITY", "$.authority_scope", "Agent work receipt must use scoped-execution authority."));
      }
    }
  }

  if (type === "maintenance-readiness") {
    if (!payload.assets || isEmptyArray(payload.assets)) {
      issues.push(issue("critical", "NO_MAINTENANCE_ASSETS", "$.assets", "Maintenance readiness report must include critical assets."));
    }
    const unavailable = (payload.assets || []).filter(asset => asset.readiness === "Unavailable");
    const degraded = (payload.assets || []).filter(asset => asset.readiness === "Poorly" || asset.readiness === "Unknown");
    if (payload.overall_readiness === "Fully" && (unavailable.length > 0 || degraded.length > 0)) {
      issues.push(issue("critical", "OVERALL_FULLY_WITH_BAD_ASSETS", "$.overall_readiness", "Overall readiness cannot be Fully when any asset is degraded or unavailable."));
    }
    for (const [index, asset] of (payload.assets || []).entries()) {
      const pointer = `$.assets[${index}]`;
      if (asset.last_result === "fail" && (!asset.fallback || asset.fallback.length < 1)) {
        issues.push(issue("critical", "FAILED_ASSET_WITHOUT_FALLBACK", `${pointer}.fallback`, "Failed asset must have a fallback."));
      }
      if (asset.readiness === "Unavailable" && (!asset.ccir_trigger || asset.ccir_trigger.length < 1)) {
        issues.push(issue("critical", "UNAVAILABLE_WITHOUT_CCIR", `${pointer}.ccir_trigger`, "Unavailable critical asset must define a CCIR trigger."));
      }
    }
    if ((unavailable.length > 0 || degraded.length > 0) && payload.summary && payload.summary.commander_decision_required !== true) {
      issues.push(issue("warning", "BAD_ASSETS_WITHOUT_COMMANDER_DECISION_FLAG", "$.summary.commander_decision_required", "Bad assets should be reviewed for commander decision or FRAGO need."));
    }
  }

  if (type === "backbrief") {
    if (!hasSubstantiveItems(payload.planned_actions)) {
      issues.push(issue("critical", "BACKBRIEF_WITHOUT_ACTIONS", "$.planned_actions", "Backbrief must state planned actions before execution."));
    }
    if (!hasSubstantiveItems(payload.stop_conditions)) {
      issues.push(issue("critical", "BACKBRIEF_WITHOUT_STOP_CONDITIONS", "$.stop_conditions", "Backbrief must state stop conditions to prevent distorted execution."));
    }
    if (!hasSubstantiveItems(payload.risk_controls)) {
      issues.push(issue("error", "BACKBRIEF_WITHOUT_RISK_CONTROLS", "$.risk_controls", "Backbrief should state risk controls."));
    }
    const approval = payload.approval_awareness || {};
    if (!hasSubstantiveItems(approval.approval_required_actions)) {
      issues.push(issue("warning", "BACKBRIEF_WITHOUT_APPROVAL_BOUNDARIES", "$.approval_awareness.approval_required_actions", "Backbrief should restate actions that require approval."));
    }
    if (!hasSubstantiveItems(approval.prohibited_actions)) {
      issues.push(issue("warning", "BACKBRIEF_WITHOUT_PROHIBITIONS", "$.approval_awareness.prohibited_actions", "Backbrief should restate prohibited actions."));
    }
    if (payload.confidence === "low" && !hasSubstantiveItems(payload.requested_clarifications)) {
      issues.push(issue("error", "LOW_CONFIDENCE_WITHOUT_CLARIFICATION", "$.requested_clarifications", "Low-confidence backbrief must request clarification."));
    }
    if (approval.commander_decision_needed === true && !hasSubstantiveItems(payload.requested_clarifications)) {
      issues.push(issue("error", "DECISION_NEEDED_WITHOUT_QUESTION", "$.requested_clarifications", "Backbrief that needs commander decision must state the question."));
    }
  }

  if (type === "rehearsal") {
    if (!hasSubstantiveItems(payload.backbriefs)) {
      issues.push(issue("critical", "REHEARSAL_WITHOUT_BACKBRIEF", "$.backbriefs", "Rehearsal must reference at least one backbrief."));
    }
    if (!payload.sequence || isEmptyArray(payload.sequence)) {
      issues.push(issue("critical", "REHEARSAL_WITHOUT_SEQUENCE", "$.sequence", "Rehearsal must walk the execution sequence before approval."));
    }
    if (payload.disposition === "execute" && hasSubstantiveItems(payload.required_changes)) {
      issues.push(issue("critical", "EXECUTE_WITH_UNRESOLVED_CHANGES", "$.required_changes", "Rehearsal cannot clear execution while required changes remain."));
    }
    const highFriction = (payload.friction_points || []).some(point => point.severity === "high" || point.severity === "critical");
    if (highFriction && !hasSubstantiveItems(payload.decision_points)) {
      issues.push(issue("critical", "HIGH_FRICTION_WITHOUT_DECISION_POINT", "$.decision_points", "High-friction rehearsal requires a decision point or commander question."));
    }
    if (payload.disposition === "request_approval" && !hasSubstantiveItems(payload.decision_points)) {
      issues.push(issue("error", "APPROVAL_REHEARSAL_WITHOUT_DECISION_POINT", "$.decision_points", "Approval disposition must state the decision point."));
    }
  }

  if (type === "approval-scope") {
    const approvingDecision = payload.decision === "approve_once" || payload.decision === "approve_with_constraints";
    const terminalStatusForNonApproval = {
      reject: "rejected",
      revise: "revision_required",
      issue_frago: "frago_required",
      revoke: "revoked"
    };
    const scope = payload.scope || {};

    if (approvingDecision) {
      if (!isValidDate(scope.expires_at)) {
        issues.push(issue("critical", "APPROVAL_WITHOUT_EXPIRY", "$.scope.expires_at", "Approval scope must have a valid expiry."));
      }
      if (isValidDate(scope.valid_from) && isValidDate(scope.expires_at) && !isBefore(scope.valid_from, scope.expires_at)) {
        issues.push(issue("critical", "APPROVAL_EXPIRY_NOT_AFTER_START", "$.scope.expires_at", "Approval expiry must be after valid_from."));
      }
      if (payload.decision === "approve_once" && scope.max_executions !== 1) {
        issues.push(issue("critical", "APPROVE_ONCE_NOT_SINGLE_USE", "$.scope.max_executions", "approve_once must allow exactly one execution."));
      }
      if (!hasSubstantiveItems(payload.conditions)) {
        issues.push(issue("warning", "APPROVAL_WITHOUT_CONDITIONS", "$.conditions", "Approval should state execution conditions."));
      }
      if (!hasSubstantiveItems(payload.rollback)) {
        issues.push(issue("critical", "APPROVAL_WITHOUT_ROLLBACK", "$.rollback", "Approval for high-risk action must include rollback or compensation plan."));
      }
      if (!hasSubstantiveItems(payload.evidence_required)) {
        issues.push(issue("error", "APPROVAL_WITHOUT_EVIDENCE", "$.evidence_required", "Approval must state post-action evidence requirements."));
      }
    }

    if (payload.status === "consumed" && (!payload.consumed_by || !payload.consumed_at)) {
      issues.push(issue("critical", "CONSUMED_APPROVAL_WITHOUT_CONSUMPTION_EVENT", "$.consumed_at", "Consumed approval must record consumed_by and consumed_at."));
    }
    if (payload.status === "active" && (payload.consumed_by || payload.consumed_at)) {
      issues.push(issue("error", "ACTIVE_APPROVAL_HAS_CONSUMPTION_EVENT", "$.status", "Active approval must not already have consumption metadata."));
    }
    if (!approvingDecision && payload.status !== terminalStatusForNonApproval[payload.decision]) {
      issues.push(issue("error", "NON_APPROVAL_STATUS_MISMATCH", "$.status", "Non-approval decision must use the matching terminal status."));
    }
    if (/credential|secret|password|private[_-]?key|restricted|external/i.test(`${scope.action || ""} ${scope.target || ""}`) && payload.release_review_required !== true) {
      issues.push(issue("warning", "SENSITIVE_APPROVAL_WITHOUT_RELEASE_REVIEW_FLAG", "$.release_review_required", "Sensitive or external approval should flag whether release review is required."));
    }
  }

  if (type === "approval-consumption-event") {
    const snapshot = payload.scope_snapshot || {};
    if (snapshot.status_before !== "active") {
      issues.push(issue("critical", "APPROVAL_ALREADY_CONSUMED_OR_INACTIVE", "$.scope_snapshot.status_before", "Approval must be active before it can be consumed."));
    }
    if (payload.actor !== snapshot.granted_to) {
      issues.push(issue("critical", "APPROVAL_CONSUMED_BY_WRONG_ACTOR", "$.actor", "Consumption actor must match granted_to."));
    }
    if (payload.action !== snapshot.action) {
      issues.push(issue("critical", "APPROVAL_CONSUMPTION_ACTION_MISMATCH", "$.action", "Consumption action must match approval scope."));
    }
    if (payload.tool !== snapshot.tool) {
      issues.push(issue("critical", "APPROVAL_CONSUMPTION_TOOL_MISMATCH", "$.tool", "Consumption tool must match approval scope."));
    }
    if (payload.target !== snapshot.target) {
      issues.push(issue("critical", "APPROVAL_CONSUMPTION_TARGET_MISMATCH", "$.target", "Consumption target must match approval scope."));
    }
    if (!isValidDate(payload.consumed_at) || !isValidDate(snapshot.valid_from) || !isValidDate(snapshot.expires_at) || Date.parse(payload.consumed_at) < Date.parse(snapshot.valid_from) || Date.parse(payload.consumed_at) >= Date.parse(snapshot.expires_at)) {
      issues.push(issue("critical", "APPROVAL_CONSUMED_OUTSIDE_WINDOW", "$.consumed_at", "Approval consumption must occur inside the valid approval window."));
    }
    if (snapshot.decision === "approve_once" && payload.execution_count_after !== 1) {
      issues.push(issue("critical", "APPROVE_ONCE_CONSUMPTION_COUNT_INVALID", "$.execution_count_after", "approve_once consumption must leave execution_count_after at exactly 1."));
    }
    if (payload.result === "executed" && payload.approval_status_after !== "consumed") {
      issues.push(issue("critical", "EXECUTED_APPROVAL_NOT_MARKED_CONSUMED", "$.approval_status_after", "Executed approval must be marked consumed after execution."));
    }
    if (payload.result === "executed" && !hasSubstantiveItems(payload.evidence)) {
      issues.push(issue("error", "APPROVAL_CONSUMPTION_WITHOUT_EVIDENCE", "$.evidence", "Executed approval consumption must include evidence."));
    }
  }

  if (type === "approval-revocation-event") {
    const snapshot = payload.scope_snapshot || {};

    if (payload.approval_status_before !== "active" || snapshot.status_before !== "active") {
      issues.push(issue("critical", "APPROVAL_REVOCATION_NOT_ACTIVE", "$.approval_status_before", "Approval must be active before it can be revoked."));
    }
    if (payload.revocation_authority !== "COMMANDER") {
      issues.push(issue("critical", "APPROVAL_REVOCATION_REQUIRES_COMMANDER", "$.revocation_authority", "Approval revocation requires Commander authority."));
    }
    if (snapshot.granted_by && payload.revocation_authority !== snapshot.granted_by) {
      issues.push(issue("critical", "APPROVAL_REVOCATION_AUTHORITY_MISMATCH", "$.revocation_authority", "Revocation authority must match the granting authority."));
    }
    if (payload.action !== snapshot.action) {
      issues.push(issue("critical", "APPROVAL_REVOCATION_ACTION_MISMATCH", "$.action", "Revocation action must match approval scope."));
    }
    if (payload.tool !== snapshot.tool) {
      issues.push(issue("critical", "APPROVAL_REVOCATION_TOOL_MISMATCH", "$.tool", "Revocation tool must match approval scope."));
    }
    if (payload.target !== snapshot.target) {
      issues.push(issue("critical", "APPROVAL_REVOCATION_TARGET_MISMATCH", "$.target", "Revocation target must match approval scope."));
    }
    if (!isValidDate(payload.revoked_at) || !isValidDate(snapshot.valid_from) || !isValidDate(snapshot.expires_at) || Date.parse(payload.revoked_at) < Date.parse(snapshot.valid_from) || Date.parse(payload.revoked_at) >= Date.parse(snapshot.expires_at)) {
      issues.push(issue("critical", "APPROVAL_REVOKED_OUTSIDE_WINDOW", "$.revoked_at", "Approval revocation must occur inside the valid approval window."));
    }
    if (payload.approval_status_after !== "revoked") {
      issues.push(issue("critical", "APPROVAL_REVOCATION_NOT_MARKED_REVOKED", "$.approval_status_after", "Revocation event must mark the approval as revoked."));
    }
    if (!payload.reason || payload.reason.trim().length === 0) {
      issues.push(issue("error", "APPROVAL_REVOCATION_WITHOUT_REASON", "$.reason", "Approval revocation must state a reason."));
    }
    if (!hasSubstantiveItems(payload.evidence)) {
      issues.push(issue("error", "APPROVAL_REVOCATION_WITHOUT_EVIDENCE", "$.evidence", "Approval revocation must include evidence."));
    }
    if (payload.notification_required === true && !hasSubstantiveItems(payload.notified_roles)) {
      issues.push(issue("error", "APPROVAL_REVOCATION_WITHOUT_NOTIFICATION", "$.notified_roles", "Approval revocation requiring notification must list notified roles."));
    }
  }

  if (type === "approval-renewal-event") {
    const snapshot = payload.scope_snapshot || {};

    if (payload.approval_status_before !== "active" || snapshot.status_before !== "active") {
      issues.push(issue("critical", "APPROVAL_RENEWAL_NOT_ACTIVE", "$.approval_status_before", "Approval must be active before it can be renewed."));
    }
    if (payload.renewal_authority !== "COMMANDER") {
      issues.push(issue("critical", "APPROVAL_RENEWAL_REQUIRES_COMMANDER", "$.renewal_authority", "Approval renewal requires Commander authority."));
    }
    if (snapshot.granted_by && payload.renewal_authority !== snapshot.granted_by) {
      issues.push(issue("critical", "APPROVAL_RENEWAL_AUTHORITY_MISMATCH", "$.renewal_authority", "Renewal authority must match the granting authority."));
    }
    if (payload.action !== snapshot.action) {
      issues.push(issue("critical", "APPROVAL_RENEWAL_ACTION_MISMATCH", "$.action", "Renewal action must match approval scope."));
    }
    if (payload.tool !== snapshot.tool) {
      issues.push(issue("critical", "APPROVAL_RENEWAL_TOOL_MISMATCH", "$.tool", "Renewal tool must match approval scope."));
    }
    if (payload.target !== snapshot.target) {
      issues.push(issue("critical", "APPROVAL_RENEWAL_TARGET_MISMATCH", "$.target", "Renewal target must match approval scope."));
    }
    if (!isValidDate(payload.renewed_at) || !isValidDate(payload.previous_valid_from) || !isValidDate(payload.previous_expires_at) || Date.parse(payload.renewed_at) < Date.parse(payload.previous_valid_from) || Date.parse(payload.renewed_at) >= Date.parse(payload.previous_expires_at)) {
      issues.push(issue("critical", "APPROVAL_RENEWED_OUTSIDE_WINDOW", "$.renewed_at", "Approval renewal must occur inside the current approval window."));
    }
    if (payload.previous_valid_from !== snapshot.valid_from || payload.previous_expires_at !== snapshot.expires_at) {
      issues.push(issue("error", "APPROVAL_RENEWAL_WINDOW_SNAPSHOT_MISMATCH", "$.previous_expires_at", "Renewal must snapshot the current approval window."));
    }
    if (!isValidDate(payload.new_expires_at) || !isValidDate(payload.previous_expires_at) || Date.parse(payload.new_expires_at) <= Date.parse(payload.previous_expires_at)) {
      issues.push(issue("critical", "APPROVAL_RENEWAL_NOT_EXTENSION", "$.new_expires_at", "Renewal must extend expires_at beyond the previous expiry."));
    }
    if (!isValidDate(payload.new_expires_at) || !isValidDate(payload.renewed_at) || Date.parse(payload.new_expires_at) <= Date.parse(payload.renewed_at)) {
      issues.push(issue("critical", "APPROVAL_RENEWAL_EXPIRES_BEFORE_RENEWED_AT", "$.new_expires_at", "Renewed expiry must be after renewed_at."));
    }
    if (payload.max_executions_before !== snapshot.max_executions || payload.max_executions_after !== snapshot.max_executions) {
      issues.push(issue("critical", "APPROVAL_RENEWAL_EXPANDS_EXECUTIONS", "$.max_executions_after", "Renewal must not change max executions; request a new approval instead."));
    }
    if (snapshot.decision === "approve_once" && payload.execution_count_before !== 0) {
      issues.push(issue("critical", "APPROVE_ONCE_ALREADY_USED_BEFORE_RENEWAL", "$.execution_count_before", "approve_once renewal must occur before the approval is used."));
    }
    if (payload.approval_status_after !== "active") {
      issues.push(issue("critical", "APPROVAL_RENEWAL_NOT_MARKED_ACTIVE", "$.approval_status_after", "Renewal event must leave the approval active."));
    }
    if (!payload.reason || payload.reason.trim().length === 0) {
      issues.push(issue("error", "APPROVAL_RENEWAL_WITHOUT_REASON", "$.reason", "Approval renewal must state a reason."));
    }
    if (!hasSubstantiveItems(payload.evidence)) {
      issues.push(issue("error", "APPROVAL_RENEWAL_WITHOUT_EVIDENCE", "$.evidence", "Approval renewal must include evidence."));
    }
    if (payload.notification_required === true && !hasSubstantiveItems(payload.notified_roles)) {
      issues.push(issue("error", "APPROVAL_RENEWAL_WITHOUT_NOTIFICATION", "$.notified_roles", "Approval renewal requiring notification must list notified roles."));
    }
  }

  if (type === "approval-delegation-event") {
    const scope = payload.delegation_scope || {};

    if (payload.delegator !== "COMMANDER") {
      issues.push(issue("critical", "DELEGATION_REQUIRES_COMMANDER", "$.delegator", "Approval delegation requires Commander authority."));
    }
    if (payload.actor !== payload.delegator) {
      issues.push(issue("critical", "DELEGATION_ACTOR_NOT_DELEGATOR", "$.actor", "Delegation actor must be the delegator."));
    }
    if (payload.delegatee === payload.delegator) {
      issues.push(issue("error", "DELEGATION_SELF_DELEGATION", "$.delegatee", "Delegator and delegatee must be different roles."));
    }
    if ((payload.approving_for_roles || []).includes(payload.delegatee)) {
      issues.push(issue("critical", "DELEGATEE_CANNOT_APPROVE_SELF_ROLE", "$.approving_for_roles", "Delegatee cannot approve its own role through this delegation."));
    }
    if (scope.max_roe_class === "Red" || scope.max_roe_class === "Black") {
      issues.push(issue("critical", "DELEGATION_CANNOT_INCLUDE_COMMANDER_RETAINED_ROE", "$.delegation_scope.max_roe_class", "Delegation cannot include Red or Black approvals."));
    }
    if (RISK_RANK[scope.max_residual_risk] >= RISK_RANK.high) {
      issues.push(issue("critical", "DELEGATION_CANNOT_ACCEPT_HIGH_RISK", "$.delegation_scope.max_residual_risk", "High or critical residual risk remains Commander-retained."));
    }
    if (isEmptyArray(scope.task_scope)) {
      issues.push(issue("error", "DELEGATION_WITHOUT_TASK_SCOPE", "$.delegation_scope.task_scope", "Delegation must state task scope."));
    }
    if (!isValidDate(scope.valid_from) || !isValidDate(scope.expires_at) || !isBefore(scope.valid_from, scope.expires_at)) {
      issues.push(issue("critical", "DELEGATION_EXPIRY_NOT_AFTER_START", "$.delegation_scope.expires_at", "Delegation expiry must be after valid_from."));
    }
    if (!Number.isInteger(scope.max_approval_duration_minutes) || scope.max_approval_duration_minutes <= 0 || !Number.isInteger(scope.max_approvals) || scope.max_approvals <= 0) {
      issues.push(issue("critical", "DELEGATION_WITHOUT_LIMITS", "$.delegation_scope", "Delegation must include positive duration and approval-count limits."));
    }
    if (payload.subdelegation_allowed === true) {
      issues.push(issue("critical", "DELEGATION_ALLOWS_SUBDELEGATION", "$.subdelegation_allowed", "Delegated approval authority cannot be subdelegated."));
    }
    if (!hasSubstantiveItems(scope.retained_authorities)) {
      issues.push(issue("critical", "DELEGATION_WITHOUT_RETAINED_AUTHORITIES", "$.delegation_scope.retained_authorities", "Delegation must state Commander-retained authorities."));
    }
    if (!(scope.prohibited_context_classes || []).includes("restricted")) {
      issues.push(issue("error", "DELEGATION_WITHOUT_RESTRICTED_CONTEXT_GUARD", "$.delegation_scope.prohibited_context_classes", "Delegation must prohibit restricted context release."));
    }
    if (payload.release_review_required_for_sensitive !== true) {
      issues.push(issue("error", "DELEGATION_SENSITIVE_RELEASE_WITHOUT_REVIEW", "$.release_review_required_for_sensitive", "Delegation must preserve release review for sensitive context."));
    }
    if (payload.requires_backbrief !== true) {
      issues.push(issue("warning", "DELEGATION_WITHOUT_BACKBRIEF", "$.requires_backbrief", "Delegated approval should require a backbrief."));
    }
    if (payload.requires_post_action_evidence !== true) {
      issues.push(issue("error", "DELEGATION_WITHOUT_POST_ACTION_EVIDENCE", "$.requires_post_action_evidence", "Delegated approval must require post-action evidence."));
    }
    if (payload.delegation_status_after !== "active") {
      issues.push(issue("critical", "DELEGATION_NOT_MARKED_ACTIVE", "$.delegation_status_after", "Delegation creation must leave the delegation active."));
    }
    if (payload.notification_required === true && !hasSubstantiveItems(payload.notified_roles)) {
      issues.push(issue("error", "DELEGATION_WITHOUT_NOTIFICATION", "$.notified_roles", "Delegation requiring notification must list notified roles."));
    }
    if (!payload.reason || payload.reason.trim().length === 0) {
      issues.push(issue("error", "DELEGATION_WITHOUT_REASON", "$.reason", "Delegation must state the reason."));
    }
    if (!hasSubstantiveItems(payload.evidence)) {
      issues.push(issue("error", "DELEGATION_WITHOUT_EVIDENCE", "$.evidence", "Delegation must include evidence."));
    }
  }

  if (type === "approval-delegation-revocation-event") {
    const snapshot = payload.delegation_snapshot || {};

    if (payload.delegation_status_before !== "active") {
      issues.push(issue("critical", "DELEGATION_TERMINATION_NOT_ACTIVE", "$.delegation_status_before", "Delegation must be active before termination."));
    }
    if (payload.delegation_status_after !== payload.termination_kind) {
      issues.push(issue("critical", "DELEGATION_TERMINATION_STATUS_MISMATCH", "$.delegation_status_after", "Delegation status after termination must match termination kind."));
    }
    if (payload.termination_authority !== snapshot.delegator) {
      issues.push(issue("critical", "DELEGATION_TERMINATION_AUTHORITY_MISMATCH", "$.termination_authority", "Termination authority must match the delegator."));
    }
    if (payload.delegatee !== snapshot.delegatee) {
      issues.push(issue("critical", "DELEGATION_TERMINATION_DELEGATEE_MISMATCH", "$.delegatee", "Termination delegatee must match the delegation snapshot."));
    }
    if (payload.termination_kind === "revoked" && payload.termination_authority !== "COMMANDER") {
      issues.push(issue("critical", "DELEGATION_REVOCATION_REQUIRES_COMMANDER", "$.termination_authority", "Delegation revocation requires Commander authority."));
    }
    if (payload.termination_kind === "revoked" && payload.actor !== payload.termination_authority) {
      issues.push(issue("critical", "DELEGATION_REVOCATION_ACTOR_MISMATCH", "$.actor", "Revocation actor must be the termination authority."));
    }
    if (payload.termination_kind === "expired" && !(payload.actor === "RECORDER" || payload.actor === payload.termination_authority)) {
      issues.push(issue("error", "DELEGATION_EXPIRY_ACTOR_INVALID", "$.actor", "Expiry projection must be recorded by RECORDER or the termination authority."));
    }
    if (payload.termination_kind === "revoked" && (!isValidDate(payload.terminated_at) || !isValidDate(snapshot.valid_from) || !isValidDate(snapshot.expires_at) || Date.parse(payload.terminated_at) < Date.parse(snapshot.valid_from) || Date.parse(payload.terminated_at) >= Date.parse(snapshot.expires_at))) {
      issues.push(issue("critical", "DELEGATION_REVOKED_OUTSIDE_WINDOW", "$.terminated_at", "Delegation revocation must occur inside the active delegation window."));
    }
    if (payload.termination_kind === "expired" && (!isValidDate(payload.terminated_at) || !isValidDate(snapshot.expires_at) || Date.parse(payload.terminated_at) < Date.parse(snapshot.expires_at))) {
      issues.push(issue("critical", "DELEGATION_EXPIRY_BEFORE_EXPIRY", "$.terminated_at", "Delegation expiry projection must occur at or after expiry."));
    }
    if (snapshot.subdelegation_allowed === true) {
      issues.push(issue("warning", "TERMINATED_DELEGATION_HAD_SUBDELEGATION", "$.delegation_snapshot.subdelegation_allowed", "Terminated delegation snapshot shows subdelegation was allowed."));
    }
    if (snapshot.release_review_required_for_sensitive !== true) {
      issues.push(issue("warning", "TERMINATED_DELEGATION_WITHOUT_RELEASE_REVIEW", "$.delegation_snapshot.release_review_required_for_sensitive", "Terminated delegation snapshot did not preserve sensitive release review."));
    }
    if (!payload.reason || payload.reason.trim().length === 0) {
      issues.push(issue("error", "DELEGATION_TERMINATION_WITHOUT_REASON", "$.reason", "Delegation termination must state a reason."));
    }
    if (!hasSubstantiveItems(payload.evidence)) {
      issues.push(issue("error", "DELEGATION_TERMINATION_WITHOUT_EVIDENCE", "$.evidence", "Delegation termination must include evidence."));
    }
    if (payload.notification_required === true && !hasSubstantiveItems(payload.notified_roles)) {
      issues.push(issue("error", "DELEGATION_TERMINATION_WITHOUT_NOTIFICATION", "$.notified_roles", "Delegation termination requiring notification must list notified roles."));
    }
  }

  if (type === "risk-acceptance") {
    const commanderRetained = payload.residual_risk === "high" || payload.residual_risk === "critical" || payload.reversibility === "irreversible";
    const accepting = payload.decision === "accept";
    const duration = payload.duration || {};

    if (accepting && commanderRetained && payload.accepted_by !== "COMMANDER") {
      issues.push(issue("critical", "RISK_ACCEPTANCE_REQUIRES_COMMANDER", "$.accepted_by", "High, critical, or irreversible residual risk requires Commander acceptance."));
    }
    if (accepting && !isValidDate(duration.expires_at)) {
      issues.push(issue("critical", "RISK_ACCEPTANCE_WITHOUT_EXPIRY", "$.duration.expires_at", "Risk acceptance must have a valid expiry."));
    }
    if (isValidDate(duration.valid_from) && isValidDate(duration.expires_at) && !isBefore(duration.valid_from, duration.expires_at)) {
      issues.push(issue("critical", "RISK_ACCEPTANCE_EXPIRY_NOT_AFTER_START", "$.duration.expires_at", "Risk acceptance expiry must be after valid_from."));
    }
    if (accepting && !hasSubstantiveItems(payload.controls)) {
      issues.push(issue("critical", "RISK_ACCEPTANCE_WITHOUT_CONTROLS", "$.controls", "Risk cannot be accepted without controls."));
    }
    if (accepting && !hasSubstantiveItems(payload.supervision_plan)) {
      issues.push(issue("error", "RISK_ACCEPTANCE_WITHOUT_SUPERVISION", "$.supervision_plan", "Risk acceptance must state supervision plan."));
    }
    if (accepting && !hasSubstantiveItems(payload.evidence_required)) {
      issues.push(issue("error", "RISK_ACCEPTANCE_WITHOUT_EVIDENCE", "$.evidence_required", "Risk acceptance must state evidence requirements."));
    }
    if (accepting && !hasSubstantiveItems(payload.aar_trigger)) {
      issues.push(issue("warning", "RISK_ACCEPTANCE_WITHOUT_AAR_TRIGGER", "$.aar_trigger", "Risk acceptance should state AAR triggers."));
    }
    if (!accepting && payload.status === "active") {
      issues.push(issue("error", "NON_ACCEPTED_RISK_ACTIVE", "$.status", "Rejected or revise risk decision cannot be active."));
    }
  }

  if (type === "evidence") {
    if (payload.claim && payload.interpretation && payload.claim === payload.interpretation) {
      issues.push(issue("warning", "SOURCE_INTERPRETATION_MERGED", "$.interpretation", "Claim and interpretation should be separated."));
    }
  }

  if (type === "aar") {
    if (isEmptyArray(payload.sop_updates)) {
      issues.push(issue("warning", "NO_SOP_UPDATE", "$.sop_updates", "AAR should state whether SOP updates are needed."));
    }
  }

  if (type === "aar-readiness-update") {
    if (!hasSubstantiveItems((payload.readiness_recommendations || []).map(item => item.rationale))) {
      issues.push(issue("critical", "AAR_UPDATE_WITHOUT_RECOMMENDATION", "$.readiness_recommendations", "AAR readiness update must contain at least one readiness recommendation."));
    }
    const downgrade = (payload.readiness_recommendations || []).some(item => item.readiness_action === "downgrade_or_hold");
    if (downgrade && payload.commander_decision_required !== true) {
      issues.push(issue("critical", "DOWNGRADE_WITHOUT_COMMANDER_REVIEW", "$.commander_decision_required", "Downgrade or hold recommendations require commander review."));
    }
    if (payload.commander_decision_required === true && !hasSubstantiveItems(payload.ccir_triggers)) {
      issues.push(issue("error", "COMMANDER_REVIEW_WITHOUT_CCIR", "$.ccir_triggers", "Commander review must include CCIR trigger text."));
    }
    if (!hasSubstantiveItems([...(payload.sop_updates || []), ...(payload.maintenance_actions || []).map(item => item.description)])) {
      issues.push(issue("warning", "AAR_UPDATE_WITHOUT_ACTION", "$.maintenance_actions", "AAR readiness update should create at least one SOP or maintenance action."));
    }
  }

  if (type === "annex") {
    if (payload.intent_impact === "changes") {
      issues.push(issue("critical", "ANNEX_CHANGES_INTENT", "$.intent_impact", "Annex cannot change OPORD intent; use FRAGO scope change."));
    }
    if (payload.authority_impact === "changes") {
      issues.push(issue("critical", "ANNEX_CHANGES_AUTHORITY", "$.authority_impact", "Annex cannot change authority boundary; use FRAGO or approval scope update."));
    }
    if (!hasSubstantiveItems(payload.outputs)) {
      issues.push(issue("warning", "ANNEX_WITHOUT_OUTPUTS", "$.outputs", "Annex should state role-specific outputs."));
    }
    if (!hasSubstantiveItems(payload.verification)) {
      issues.push(issue("error", "ANNEX_WITHOUT_VERIFICATION", "$.verification", "Annex should define verification for its specialist plan."));
    }
    if (payload.classification === "restricted" && !payload.releasability) {
      issues.push(issue("error", "RESTRICTED_ANNEX_WITHOUT_RELEASABILITY", "$.releasability", "Restricted annex must define releasability."));
    }
  }

  if (type === "frago-scope-change") {
    if (!hasSubstantiveItems(payload.changed_elements)) {
      issues.push(issue("critical", "FRAGO_SCOPE_WITHOUT_CHANGED_ELEMENTS", "$.changed_elements", "FRAGO scope change must identify changed mission elements."));
    }
    if (!hasSubstantiveItems((payload.scope_changes || []).map(item => item.rationale))) {
      issues.push(issue("critical", "FRAGO_SCOPE_WITHOUT_CHANGE_DETAILS", "$.scope_changes", "FRAGO scope change must state previous, revised, and rationale for changes."));
    }
    if ((payload.changed_elements || []).includes("authority_boundary") && isEmptyArray(payload.authority_changes)) {
      issues.push(issue("critical", "AUTHORITY_CHANGE_WITHOUT_AUTHORITY_DETAILS", "$.authority_changes", "Authority boundary change must include authority change details."));
    }
    if (!hasSubstantiveItems(payload.affected_roles)) {
      issues.push(issue("error", "FRAGO_SCOPE_WITHOUT_AFFECTED_ROLES", "$.affected_roles", "FRAGO scope change must list affected roles for dissemination."));
    }
    if (payload.requires_backbrief !== true) {
      issues.push(issue("critical", "FRAGO_SCOPE_WITHOUT_BACKBRIEF", "$.requires_backbrief", "Scope-changing FRAGO requires backbrief to prevent distorted execution."));
    }
    if (payload.requires_rehearsal !== true) {
      issues.push(issue("error", "FRAGO_SCOPE_WITHOUT_REHEARSAL", "$.requires_rehearsal", "Scope-changing FRAGO should require rehearsal before execution."));
    }
    if (!payload.not_an_annex_update_reason || payload.not_an_annex_update_reason.length < 1) {
      issues.push(issue("error", "FRAGO_SCOPE_WITHOUT_ANNEX_BOUNDARY_REASON", "$.not_an_annex_update_reason", "FRAGO scope change must explain why this is not merely an annex update."));
    }
    if (payload.issued_by !== "COMMANDER" && (payload.changed_elements || []).includes("authority_boundary")) {
      issues.push(issue("critical", "AUTHORITY_FRAGO_REQUIRES_COMMANDER", "$.issued_by", "Authority boundary change requires Commander issue or approval."));
    }
  }

  if (type === "model-force-assignment-plan") {
    const mission = payload.mission_profile || {};
    const profiles = payload.model_profiles || [];
    const billets = payload.billets || [];
    const routing = payload.routing_policy || {};
    const assurance = payload.assurance || {};
    const pace = payload.pace || {};
    const authority = payload.authority || {};
    const profileById = new Map();

    for (const [index, profile] of profiles.entries()) {
      const pointer = `$.model_profiles[${index}]`;
      if (profileById.has(profile.id)) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_DUPLICATE_PROFILE", `${pointer}.id`, "Model profile IDs must be unique."));
      }
      profileById.set(profile.id, profile);
      if (/^(latest|current|default)$/i.test(String(profile.model_version || "").trim())) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_FLOATING_VERSION", `${pointer}.model_version`, "Mission assignment requires an immutable model version."));
      }
      if (!hasSubstantiveItems(profile.evidence)) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_WITHOUT_EVIDENCE", `${pointer}.evidence`, "Every model profile requires task-relevant readiness evidence."));
      }
    }

    for (const [index, billet] of billets.entries()) {
      const pointer = `$.billets[${index}]`;
      const profile = profileById.get(billet.model_profile_id);
      if (!profile) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_UNKNOWN_PROFILE", `${pointer}.model_profile_id`, "Billet references an unknown model profile."));
        continue;
      }
      if (profile.availability === "unavailable") {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_UNAVAILABLE_PROFILE", `${pointer}.model_profile_id`, "Unavailable model profile cannot fill an active billet."));
      }
      if (!(profile.evaluated_tasks || []).includes(billet.task)) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_TASK_NOT_EVALUATED", `${pointer}.task`, "Billet task is outside the model profile's evaluated METL."));
      }
      if (!(profile.force_classes || []).includes(billet.force_class)) {
        issues.push(issue("error", "MODEL_ASSIGNMENT_FORCE_CLASS_MISMATCH", `${pointer}.force_class`, "Model profile is not qualified for the billet force class."));
      }
      if ((READINESS_RANK[profile.readiness_rating] ?? -1) < (READINESS_RANK[billet.required_readiness] ?? 99)) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_INSUFFICIENT_READINESS", `${pointer}.required_readiness`, "Model profile does not meet billet readiness requirement."));
      }
      if (!(profile.allowed_context_classes || []).includes(billet.context_scope)) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_CONTEXT_INELIGIBLE", `${pointer}.context_scope`, "Model profile is not approved for the billet context class."));
      }
      for (const [fallbackIndex, fallbackId] of (billet.fallback_profile_ids || []).entries()) {
        const fallbackPointer = `${pointer}.fallback_profile_ids[${fallbackIndex}]`;
        const fallback = profileById.get(fallbackId);
        if (!fallback) {
          issues.push(issue("error", "MODEL_ASSIGNMENT_UNKNOWN_FALLBACK", `${pointer}.fallback_profile_ids[${fallbackIndex}]`, "Fallback references an unknown model profile."));
          continue;
        }
        if (fallbackId === billet.model_profile_id) {
          issues.push(issue("critical", "MODEL_ASSIGNMENT_SELF_FALLBACK", fallbackPointer, "A billet fallback must differ from its primary profile."));
        }
        if (fallback.availability === "unavailable") {
          issues.push(issue("critical", "MODEL_ASSIGNMENT_FALLBACK_UNAVAILABLE", fallbackPointer, "Unavailable profile cannot serve as a fallback."));
        }
        if (!(fallback.evaluated_tasks || []).includes(billet.task) || !(fallback.force_classes || []).includes(billet.force_class)) {
          issues.push(issue("critical", "MODEL_ASSIGNMENT_FALLBACK_NOT_QUALIFIED", fallbackPointer, "Fallback must be evaluated for the billet task and force class."));
        }
        if ((READINESS_RANK[fallback.readiness_rating] ?? -1) < READINESS_RANK.P) {
          issues.push(issue("critical", "MODEL_ASSIGNMENT_FALLBACK_UNREADY", fallbackPointer, "Fallback must have at least P readiness."));
        }
        if (!(fallback.allowed_context_classes || []).includes(billet.context_scope)) {
          issues.push(issue("critical", "MODEL_ASSIGNMENT_FALLBACK_CONTEXT_INELIGIBLE", fallbackPointer, "Fallback is not approved for the billet context class."));
        }
      }
      if (["command", "sof", "assurance"].includes(billet.force_class) && (billet.fallback_profile_ids || []).length < 2) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_CRITICAL_BILLET_WITHOUT_DEPTH", `${pointer}.fallback_profile_ids`, "Command, SOF, and assurance billets require alternate and contingency profiles."));
      }
    }

    const routerProfile = profileById.get(routing.router_profile_id);
    if (!routerProfile) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_UNKNOWN_ROUTER", "$.routing_policy.router_profile_id", "Routing policy references an unknown model profile."));
    }
    if (!["T", "P"].includes(routing.router_readiness) || (routerProfile && !["T", "P"].includes(routerProfile.readiness_rating))) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_ROUTER_UNREADY", "$.routing_policy.router_readiness", "Router must be T or P before it assigns mission work."));
    }
    if (!hasSubstantiveItems(routing.held_out_evaluation)) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_ROUTER_WITHOUT_HELD_OUT_EVAL", "$.routing_policy.held_out_evaluation", "Router requires held-out, task-relevant evaluation evidence."));
    }
    const acceptanceEvidence = (routing.acceptance_evidence || []).map(item => String(item).trim());
    if (!hasSubstantiveItems(acceptanceEvidence) || acceptanceEvidence.every(item => /confidence|self[- ]?report/i.test(item))) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_CONFIDENCE_ONLY", "$.routing_policy.acceptance_evidence", "Model verbal confidence cannot be the only acceptance evidence."));
    }

    const assuranceRequired = ["high", "critical"].includes(mission.risk_level)
      || mission.roe_class === "Red"
      || ["final_output", "external_release"].includes(mission.release_target)
      || mission.tool_impact === "irreversible_mutation";
    if (assuranceRequired && assurance.required !== true) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_REQUIRES_ASSURANCE", "$.assurance.required", "Mission risk, release, or tool impact requires independent assurance."));
    }
    if (assurance.required === true) {
      const assuranceProfile = profileById.get(assurance.independent_profile_id);
      if (!assuranceProfile || !(assuranceProfile.force_classes || []).includes("assurance")) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_INVALID_ASSURANCE_PROFILE", "$.assurance.independent_profile_id", "Independent assurance requires an assurance-qualified model profile."));
      }
      if (!billets.some(billet => billet.force_class === "assurance" && billet.model_profile_id === assurance.independent_profile_id)) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_ASSURANCE_PROFILE_NOT_BILLETED", "$.assurance.independent_profile_id", "Independent assurance profile must fill the assurance billet."));
      }
      const primaryProfile = profileById.get(pace.primary_profile_id);
      if (assurance.different_model_family_required === true && assuranceProfile && primaryProfile && assuranceProfile.model_family === primaryProfile.model_family) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_CORRELATED_ASSURANCE", "$.assurance.independent_profile_id", "Independent assurance must use a different model family from the primary profile."));
      }
      if (!hasSubstantiveItems(assurance.deterministic_checks)) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_WITHOUT_DETERMINISTIC_CHECKS", "$.assurance.deterministic_checks", "Independent assurance requires deterministic checks."));
      }
    }

    const paceIds = [pace.primary_profile_id, pace.alternate_profile_id, pace.contingency_profile_id];
    for (const [index, profileId] of paceIds.entries()) {
      if (!profileById.has(profileId)) {
        issues.push(issue("critical", "MODEL_ASSIGNMENT_UNKNOWN_PACE_PROFILE", `$.pace.${["primary_profile_id", "alternate_profile_id", "contingency_profile_id"][index]}`, "PACE references an unknown model profile."));
      }
    }
    if (new Set(paceIds).size !== paceIds.length) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_PACE_NOT_DISTINCT", "$.pace", "Primary, alternate, and contingency profiles must be distinct."));
    }
    const paceProfiles = paceIds.map(profileId => profileById.get(profileId)).filter(Boolean);
    const pacePrimaryTasks = new Set((paceProfiles[0] && paceProfiles[0].evaluated_tasks) || []);
    if (paceProfiles.some(profile => (READINESS_RANK[profile.readiness_rating] ?? -1) < READINESS_RANK.P
      || !(profile.allowed_context_classes || []).includes(mission.classification))
      || paceProfiles.slice(1).some(profile => !(profile.evaluated_tasks || []).some(task => pacePrimaryTasks.has(task)))) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_PACE_NOT_TASK_READY", "$.pace", "Every PACE profile must be P/T ready, context eligible, and share evaluated mission coverage."));
    }

    if (authority.inherited_from_model !== false) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_AUTHORITY_FROM_MODEL", "$.authority.inherited_from_model", "Model capability must never create or expand authority."));
    }
    if (authority.human_final_decision_authority !== true || !hasSubstantiveItems(authority.commander_retained_decisions)) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_HUMAN_AUTHORITY_MISSING", "$.authority", "The human Commander must retain final decisions and explicit retained authorities."));
    }
    if (mission.roe_class === "Black") {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_BLACK_PROHIBITED", "$.mission_profile.roe_class", "Black actions cannot receive an executable model assignment."));
    }
    if (assuranceRequired && !billets.some(billet => billet.force_class === "command" || billet.force_class === "sof")) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_MISSING_COMMAND", "$.billets", "High-impact missions require command or SOF integration capacity."));
    }
    if (routing.default_strategy === "sof_composition" && new Set(billets.map(billet => billet.model_profile_id)).size < 3) {
      issues.push(issue("critical", "MODEL_ASSIGNMENT_FORCE_MONOCULTURE", "$.billets", "SOF composition requires distinct command, execution, and assurance capacity."));
    }
  }

  if (type === "information-report") {
    const ccir = payload.related_ccir || [];
    if ((payload.operational_relevance === "order_change" || payload.operational_relevance === "report_up") && isEmptyArray(ccir)) {
      issues.push(issue("critical", "INFORMATION_RELEVANT_WITHOUT_CCIR", "$.related_ccir", "Information that changes orders or must be reported up requires CCIR classification."));
    }
    if (payload.operational_relevance === "order_change" && payload.recommended_handling !== "frago_review" && payload.recommended_handling !== "decision_packet") {
      issues.push(issue("critical", "ORDER_CHANGE_NOT_ROUTED_TO_DECISION", "$.recommended_handling", "Order-changing information must route to FRAGO review or decision packet."));
    }
    if (payload.eefi_risk === true && !ccir.includes("EEFI")) {
      issues.push(issue("critical", "EEFI_INFORMATION_WITHOUT_EEFI_CCIR", "$.related_ccir", "Information with EEFI risk must be classified as EEFI."));
    }
    if (payload.eefi_risk === true && payload.recommended_handling !== "suppress_raw") {
      issues.push(issue("critical", "EEFI_INFORMATION_WITHOUT_SUPPRESSION", "$.recommended_handling", "EEFI-risk information must suppress raw propagation."));
    }
    if ((payload.source_reliability === "unverified" || payload.source_reliability === "unknown") && payload.operational_relevance === "order_change") {
      issues.push(issue("error", "UNVERIFIED_INFORMATION_CANNOT_CHANGE_ORDER", "$.source_reliability", "Unverified information cannot directly drive order change."));
    }
  }

  if (type === "intelligence-assessment") {
    const outputs = payload.recommended_outputs || [];
    if (outputs.includes("FRAGO_SCOPE_CHANGE") && payload.operational_impact !== "frago_scope_change") {
      issues.push(issue("error", "FRAGO_OUTPUT_WITHOUT_FRAGO_IMPACT", "$.operational_impact", "FRAGO output requires frago_scope_change operational impact."));
    }
    if (outputs.includes("FRAGO_SCOPE_CHANGE") && payload.confidence !== "high") {
      issues.push(issue("critical", "LOW_CONFIDENCE_FRAGO", "$.confidence", "Low or medium confidence assessment cannot directly recommend FRAGO scope change."));
    }
    if ((payload.operational_impact === "frago_scope_change" || payload.operational_impact === "decision_packet") && payload.commander_decision_required !== true) {
      issues.push(issue("critical", "OPERATIONAL_CHANGE_WITHOUT_COMMANDER_DECISION", "$.commander_decision_required", "Operational change or decision packet impact requires commander decision."));
    }
    if ((payload.operational_impact === "frago_scope_change" || payload.operational_impact === "decision_packet") && !hasSubstantiveItems(payload.ccir_classification)) {
      issues.push(issue("critical", "ASSESSMENT_CHANGE_WITHOUT_CCIR", "$.ccir_classification", "Operationally relevant assessment must include CCIR classification."));
    }
    if (payload.confidence === "low" && !hasSubstantiveItems(payload.information_gaps)) {
      issues.push(issue("warning", "LOW_CONFIDENCE_WITHOUT_GAPS", "$.information_gaps", "Low confidence assessment should state information gaps."));
    }
    if (payload.operational_impact === "release_block" && !payload.ccir_classification.includes("EEFI")) {
      issues.push(issue("critical", "RELEASE_BLOCK_WITHOUT_EEFI", "$.ccir_classification", "Release block impact should include EEFI classification."));
    }
  }

  if (type === "sitrep") {
    if (payload.blocked && payload.blocked.length > 0 && (!payload.ccir || payload.ccir.length === 0)) {
      issues.push(issue("error", "BLOCKED_WITHOUT_ESCALATION", "$.ccir", "Blocked SITREP should include CCIR or decision request."));
    }
  }

  return issues;
}

function maxSeverity(issues) {
  const order = ["info", "warning", "error", "critical"];
  return issues.reduce((max, item) => order.indexOf(item.severity) > order.indexOf(max) ? item.severity : max, "info");
}

function main() {
  const [, , payloadArg, typeArg] = process.argv;
  if (!payloadArg || !typeArg || !TYPE_TO_SCHEMA[typeArg]) {
    console.error(`Usage: node validator-cli-prototype/validate.js <payload.json> <${Object.keys(TYPE_TO_SCHEMA).join("|")}>`);
    process.exit(2);
  }

  try {
    const schemas = loadSchemas();
    const payloadPath = path.resolve(process.cwd(), payloadArg);
    const payload = readJson(payloadPath);
    const schema = schemas[TYPE_TO_SCHEMA[typeArg]];
    const issues = [
      ...validateSchema(payload, schema, schemas),
      ...semanticRules(payload, typeArg)
    ];
    const severity = maxSeverity(issues);
    const result = {
      valid: !issues.some(item => item.severity === "error" || item.severity === "critical"),
      can_execute: !issues.some(item => item.severity === "error" || item.severity === "critical"),
      max_severity: severity,
      issue_count: issues.length,
      issues
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

main();
