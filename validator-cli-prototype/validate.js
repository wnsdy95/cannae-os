#!/usr/bin/env node

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { attestationDigest, publicKeyId, strictBase64 } = require("../verification-attestation");
const {
  COMPARATIVE_PREDICATE_TYPE,
  comparativeAttestationDigest
} = require("../comparative-evaluation-attestation");
const {
  canonicalJsonBytes,
  certificateSha256,
  identityEvidenceDigest,
  merkleLeafHash,
  parseSpiffeId,
  transparencyEntry
} = require("../verifier-identity-evidence");
const { verifySigstoreTrustedRoot } = require("../sigstore-trusted-root");
const {
  expectedStatement: expectedSigstoreIdentityStatement,
  normalizeBundle,
  sigstoreEvidenceDigest
} = require("../sigstore-verifier-identity-evidence");
const {
  EXECUTION_PREDICATE_TYPE,
  EXECUTION_PREDICATE_TYPE_V2,
  PROVIDER_REQUIRED_CLAIMS,
  evidenceDigest: verifierExecutionEvidenceDigest
} = require("../verifier-execution-evidence");
const {
  computeVerifierIndependence,
  exactDimensions,
  profileClaimsMatchProvider,
  validClaims
} = require("../verifier-independence");

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
  "model-force-assignment-plan": "model-force-assignment-plan.schema.json",
  "model-registry": "model-registry.schema.json",
  "model-assignment-request": "model-assignment-request.schema.json",
  "integrated-mission-preflight": "integrated-mission-preflight.schema.json",
  "model-usage-event": "model-usage-event.schema.json",
  "repository-artifact-manifest": "repository-artifact-manifest.schema.json",
  "self-improvement-campaign": "self-improvement-campaign.schema.json",
  "self-improvement-checkpoint": "self-improvement-checkpoint.schema.json",
  "self-improvement-decision": "self-improvement-decision.schema.json",
  "self-improvement-cycle-order": "self-improvement-cycle-order.schema.json",
  "comparative-evaluation-set": "comparative-evaluation-set.schema.json",
  "comparative-evaluation-plan": "comparative-evaluation-plan.schema.json",
  "comparative-evaluation-report": "comparative-evaluation-report.schema.json",
  "verification-plan": "verification-plan.schema.json",
  "verification-receipt": "verification-receipt.schema.json",
  "verifier-trust-policy": "verifier-trust-policy.schema.json",
  "verifier-identity-evidence": "verifier-identity-evidence.schema.json",
  "sigstore-trusted-root": "sigstore-trusted-root.schema.json",
  "sigstore-verifier-identity-evidence": "sigstore-verifier-identity-evidence.schema.json",
  "verifier-runtime-policy": "verifier-runtime-policy.schema.json",
  "verifier-execution-evidence": "verifier-execution-evidence.schema.json",
  "verifier-challenge-set": "verifier-challenge-set.schema.json",
  "verification-attestation": "verification-attestation.schema.json",
  "comparative-evaluation-attestation": "comparative-evaluation-attestation.schema.json"
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

function resolveRef(ref, schemas, rootSchema) {
  const [file, fragment] = ref.split("#");
  const schema = file ? schemas[file] : rootSchema;
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

function validateSchema(value, schema, schemas, pointer = "$", seen = new Set(), rootSchema = schema) {
  const issues = [];
  if (!schema || typeof schema !== "object") return issues;

  if (schema.$ref) {
    const key = `${schema.$ref}@${pointer}`;
    if (seen.has(key)) return issues;
    seen.add(key);
    const resolved = resolveRef(schema.$ref, schemas, rootSchema);
    if (!resolved) {
      issues.push(issue("error", "UNRESOLVED_REF", pointer, `Cannot resolve schema ref ${schema.$ref}.`));
      return issues;
    }
    return validateSchema(value, resolved, schemas, pointer, seen, schema.$ref.startsWith("#") ? rootSchema : resolved);
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
        issues.push(...validateSchema(child, props[key], schemas, `${pointer}.${key}`, new Set(seen), rootSchema));
      } else if (schema.additionalProperties === false) {
        issues.push(issue("error", "ADDITIONAL_PROPERTY", `${pointer}.${key}`, `Unexpected field ${key}.`));
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        issues.push(...validateSchema(child, schema.additionalProperties, schemas, `${pointer}.${key}`, new Set(seen), rootSchema));
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
        issues.push(...validateSchema(value[index], schema.items, schemas, `${pointer}[${index}]`, new Set(seen), rootSchema));
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

function sortedJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedJsonValue(value[key])]));
}

function sameJson(left, right) {
  return JSON.stringify(sortedJsonValue(left)) === JSON.stringify(sortedJsonValue(right));
}

function isValidDate(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isBefore(left, right) {
  return isValidDate(left) && isValidDate(right) && Date.parse(left) < Date.parse(right);
}

function canonicalDigestWithout(value, fieldPath) {
  const clone = JSON.parse(JSON.stringify(value));
  let cursor = clone;
  for (let index = 0; index < fieldPath.length - 1; index += 1) cursor = cursor && cursor[fieldPath[index]];
  if (cursor) delete cursor[fieldPath.at(-1)];
  return crypto.createHash("sha256").update(`${JSON.stringify(clone, null, 2)}\n`).digest("hex");
}

const ROE_RANK = { Green: 0, Amber: 1, Red: 2, Black: 3 };
const RISK_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const AUTHORITY_RANK = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 };
const READINESS_RANK = { X: 0, U: 1, P: 2, T: 3 };
const CLASSIFICATION_RANK = { public: 0, internal: 1, sensitive: 2, restricted: 3 };

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

  if (type === "self-improvement-campaign") {
    const commandTeam = payload.command_team || {};
    const authority = payload.authority_envelope || {};
    const quality = payload.quality_model || {};
    const dimensions = quality.dimensions || [];
    const checkpoints = (payload.checkpoint_policy && payload.checkpoint_policy.required_triggers) || [];
    const verification = payload.verification_policy || {};
    if (payload.final_decision_authority !== "USER") {
      issues.push(issue("critical", "SELF_IMPROVEMENT_HUMAN_AUTHORITY_MISSING", "$.final_decision_authority", "Bounded self-improvement must preserve the human user as final decision authority."));
    }
    if (commandTeam.improvement_controller === commandTeam.independent_evaluator) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_EVALUATOR_NOT_INDEPENDENT", "$.command_team", "The improvement controller cannot independently approve its own control-plane changes."));
    }
    if (!hasSubstantiveItems(payload.protected_invariants)) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_WITHOUT_INVARIANTS", "$.protected_invariants", "A self-improvement campaign must state protected invariants."));
    }
    if (!hasSubstantiveItems(payload.stop_conditions)) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_WITHOUT_STOP_CONDITIONS", "$.stop_conditions", "A self-improvement campaign must state stop conditions."));
    }
    if (!hasSubstantiveItems(payload.objective && payload.objective.acceptance_criteria)) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_WITHOUT_ACCEPTANCE_CRITERIA", "$.objective.acceptance_criteria", "A self-improvement campaign requires observable acceptance criteria."));
    }
    if (!["local_reversible", "bounded_structural"].includes(authority.max_change_class)) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_ENVELOPE_TOO_BROAD", "$.authority_envelope.max_change_class", "Autonomous change authority cannot include authority changes, release, or destructive action."));
    }
    for (const field of ["push_requires_human", "merge_requires_human", "release_requires_human", "authority_change_requires_human", "policy_change_requires_human", "destructive_action_prohibited", "self_approval_prohibited"]) {
      if (authority[field] !== true) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_RETAINED_AUTHORITY_MISSING", `$.authority_envelope.${field}`, `${field} must remain human-retained or prohibited.`));
      }
    }
    const dimensionIds = dimensions.map(item => item.id);
    if (new Set(dimensionIds).size !== dimensionIds.length) {
      issues.push(issue("error", "SELF_IMPROVEMENT_DUPLICATE_QUALITY_DIMENSION", "$.quality_model.dimensions", "Quality dimension IDs must be unique."));
    }
    const weightSum = dimensions.reduce((sum, item) => sum + Number(item.weight || 0), 0);
    if (Math.abs(weightSum - 1) > 0.000001) {
      issues.push(issue("error", "SELF_IMPROVEMENT_QUALITY_WEIGHTS_INVALID", "$.quality_model.dimensions", "Quality dimension weights must sum to 1."));
    }
    for (const [index, dimension] of dimensions.entries()) {
      if (dimension.target < 0 || dimension.target > 1) {
        issues.push(issue("error", "SELF_IMPROVEMENT_TARGET_NOT_NORMALIZED", `$.quality_model.dimensions[${index}].target`, "Quality targets must use the normalized 0..1 scale."));
      }
      if (!hasSubstantiveItems(dimension.evidence_required)) {
        issues.push(issue("error", "SELF_IMPROVEMENT_DIMENSION_WITHOUT_EVIDENCE", `$.quality_model.dimensions[${index}].evidence_required`, "Every quality dimension requires external evidence."));
      }
    }
    for (const required of ["before_completion", "scope_change", "validation_failure"]) {
      if (!checkpoints.includes(required)) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_CHECKPOINT_TRIGGER_MISSING", "$.checkpoint_policy.required_triggers", `Checkpoint trigger ${required} is mandatory.`));
      }
    }
    if (verification.proof_required !== true || verification.repository_state_must_remain_unchanged !== true || verification.receipt_persistence_required !== true) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_PROOF_POLICY_MISSING", "$.verification_policy", "Adaptive work requires persisted verification receipts and an unchanged repository state during checks."));
    }
    if ((verification.allowed_executables || []).some(item => ["sh", "bash", "zsh", "fish", "cmd", "powershell", "pwsh", "sudo", "env"].includes(String(item).toLowerCase()))) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_SHELL_VERIFIER_ALLOWED", "$.verification_policy.allowed_executables", "Campaign verification cannot authorize shells or privilege wrappers."));
    }
    const comparative = payload.comparative_evaluation_policy;
    if (comparative) {
      const requiredTargets = comparative.required_target_types || [];
      if (requiredTargets.length !== 2 || !requiredTargets.includes("runtime_control") || !requiredTargets.includes("skill")) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_COMPARATIVE_TARGETS_WEAK", "$.comparative_evaluation_policy.required_target_types", "Comparative evaluation must cover both runtime-control and skill candidates."));
      }
      if (comparative.same_evaluation_set_required !== true || comparative.identical_harness_required !== true || comparative.independent_evaluator_required !== true) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_COMPARATIVE_POLICY_WEAK", "$.comparative_evaluation_policy", "Comparative evaluation requires one immutable evaluation set, one identical harness, and an independent evaluator."));
      }
      const thresholdIds = (comparative.dimension_thresholds || []).map(item => item.dimension_id);
      if (new Set(thresholdIds).size !== thresholdIds.length || thresholdIds.length !== dimensionIds.length || dimensionIds.some(id => !thresholdIds.includes(id))) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_COMPARATIVE_THRESHOLDS_INCOMPLETE", "$.comparative_evaluation_policy.dimension_thresholds", "Every quality dimension requires exactly one maximum-regression threshold."));
      }
    }
    if (payload.schema_version === "0.4" && !comparative) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_V04_COMPARATIVE_POLICY_MISSING", "$.comparative_evaluation_policy", "v0.4 requires the comparative policy used by signed control-plane evaluation."));
    }
    if (["0.3", "0.4"].includes(payload.schema_version)) {
      const attestation = payload.attestation_policy || {};
      const trustRef = attestation.trust_policy_ref || {};
      if (attestation.required !== true || !trustRef.artifact_id || !/^[a-f0-9]{64}$/.test(trustRef.sha256 || "")) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_ATTESTATION_POLICY_MISSING", "$.attestation_policy", "v0.3+ campaigns require a hash-bound verifier trust policy."));
      }
      if (path.isAbsolute(trustRef.relative_path || "") || String(trustRef.relative_path || "").split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_TRUST_POLICY_PATH_INVALID", "$.attestation_policy.trust_policy_ref.relative_path", "Trust policy references must remain repository-artifact-relative."));
      }
      if (!Number.isInteger(attestation.minimum_valid_attestations) || attestation.minimum_valid_attestations < 2 ||
          !Number.isInteger(attestation.minimum_independence_groups) || attestation.minimum_independence_groups < 2 ||
          attestation.minimum_independence_groups > attestation.minimum_valid_attestations || attestation.require_distinct_key_ids !== true) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_ATTESTATION_QUORUM_WEAK", "$.attestation_policy", "v0.3+ requires at least two distinct verifier keys from at least two independence groups."));
      }
    } else if (payload.attestation_policy !== undefined) {
      issues.push(issue("error", "SELF_IMPROVEMENT_V02_ATTESTATION_POLICY", "$.attestation_policy", "Signed quorum policy requires campaign schema version 0.3 or later."));
    }
  }

  if (type === "self-improvement-checkpoint") {
    const target = payload.target || {};
    const candidate = payload.candidate || {};
    const externalities = payload.externalities || {};
    const approval = payload.approval_binding || {};
    const parentRef = payload.parent_decision_ref || {};
    if (payload.cycle_number === 1 && (payload.parent_decision_id !== "none" || parentRef.decision_id !== "none" || parentRef.relative_path !== "none" || parentRef.sha256 !== "none")) {
      issues.push(issue("error", "SELF_IMPROVEMENT_FIRST_CYCLE_HAS_PARENT", "$.parent_decision_id", "The first cycle must start from the campaign baseline, not a prior decision."));
    }
    if (payload.cycle_number > 1 && /^none$/i.test(String(payload.parent_decision_id || ""))) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_PARENT_DECISION_MISSING", "$.parent_decision_id", "Follow-on cycles must identify the accepted parent decision."));
    }
    const unsafePaths = [...(target.artifact_paths || []), ...(candidate.changed_files || [])]
      .filter(value => typeof value !== "string" || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.split(/[\\/]+/).includes(".."));
    if (unsafePaths.length > 0) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_PATH_TRAVERSAL", "$.target.artifact_paths", "Self-improvement targets and changed files must stay inside the bound repository."));
    }
    if (new Set(candidate.changed_files || []).size !== (candidate.changed_files || []).length) {
      issues.push(issue("error", "SELF_IMPROVEMENT_DUPLICATE_CHANGED_FILE", "$.candidate.changed_files", "Changed file paths must be unique."));
    }
    if (hasSubstantiveItems(candidate.protected_invariants_affected)) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_PROTECTED_INVARIANT_CHANGE", "$.candidate.protected_invariants_affected", "A candidate that affects a protected invariant cannot be promoted by this campaign."));
    }
    if (candidate.disposition !== "no_change" && !hasSubstantiveItems(candidate.rollback_steps)) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_ROLLBACK_MISSING", "$.candidate.rollback_steps", "Every change candidate requires a rollback plan."));
    }
    for (const [index, metric] of (payload.metric_results || []).entries()) {
      if (metric.before < 0 || metric.before > 1 || metric.after < 0 || metric.after > 1) {
        issues.push(issue("error", "SELF_IMPROVEMENT_METRIC_NOT_NORMALIZED", `$.metric_results[${index}]`, "Checkpoint metrics must use the normalized 0..1 scale."));
      }
      if (!hasSubstantiveItems(metric.evidence_receipt_ids)) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_METRIC_WITHOUT_VERIFICATION_RECEIPT", `$.metric_results[${index}].evidence_receipt_ids`, "Checkpoint metrics must cite persisted verification receipt IDs."));
      }
    }
    const receiptIds = (payload.verification_receipts || []).map(item => item.receipt_id);
    if (new Set(receiptIds).size !== receiptIds.length) {
      issues.push(issue("error", "SELF_IMPROVEMENT_DUPLICATE_RECEIPT", "$.verification_receipts", "Checkpoint verification receipt IDs must be unique."));
    }
    for (const [index, receipt] of (payload.verification_receipts || []).entries()) {
      if (path.isAbsolute(receipt.relative_path || "") || String(receipt.relative_path || "").split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_RECEIPT_PATH_INVALID", `$.verification_receipts[${index}].relative_path`, "Verification receipt references must remain repository-artifact-relative."));
      }
    }
    const controlPlaneTarget = ["runtime_control", "skill", "policy"].includes(target.target_type);
    const comparativeTarget = ["runtime_control", "skill"].includes(target.target_type);
    const independent = payload.independent_evaluation || {};
    if (controlPlaneTarget && (independent.required !== true || independent.evaluator === "S3" || independent.status === "not_required" || !hasSubstantiveItems(independent.evidence_receipt_ids))) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_CONTROL_PLANE_SELF_REVIEW", "$.independent_evaluation", "Runtime, skill, and policy candidates require independent evaluation."));
    }
    const comparisonRef = payload.comparative_evaluation_ref || {};
    if (comparativeTarget && (comparisonRef.required !== true || comparisonRef.report_id === "none" || comparisonRef.relative_path === "none" || comparisonRef.sha256 === "none")) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_COMPARATIVE_EVALUATION_MISSING", "$.comparative_evaluation_ref", "Runtime-control and skill candidates require a manifest-backed baseline-versus-candidate report."));
    }
    if (comparisonRef.required === true && (path.isAbsolute(comparisonRef.relative_path || "") || String(comparisonRef.relative_path || "").split(/[\\/]+/).includes(".."))) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_COMPARATIVE_REPORT_PATH_INVALID", "$.comparative_evaluation_ref.relative_path", "Comparative report references must remain repository-artifact-relative."));
    }
    const humanRetained = externalities.scope_changed || externalities.authority_changed || externalities.policy_changed || externalities.release_requested ||
      ["authority_affecting", "external_release", "destructive"].includes(candidate.change_class) || target.target_type === "policy";
    if (humanRetained && !(approval.required === true && approval.action === "promote_self_improvement_candidate" &&
        approval.tool === "autonomous-improvement-controller" && approval.target === candidate.id &&
        approval.approval_scope_ref && approval.approval_scope_ref.sha256 !== "none" &&
        approval.consumption_event_ref && approval.consumption_event_ref.sha256 !== "none")) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_CONSUMED_APPROVAL_MISSING", "$.approval_binding", "Human-retained candidates require references to an exact approval scope and its consumed execution event."));
    }
    if (externalities.destructive_action || externalities.cross_repository_write || candidate.change_class === "destructive") {
      issues.push(issue("critical", "SELF_IMPROVEMENT_PROHIBITED_EXTERNALITY", "$.externalities", "Destructive and cross-repository self-improvement actions are prohibited."));
    }
    if (!humanRetained && approval.required === true) {
      issues.push(issue("error", "SELF_IMPROVEMENT_UNNECESSARY_APPROVAL_BINDING", "$.approval_binding", "A checkpoint cannot attach unrelated approval evidence."));
    }
    if (["0.3", "0.4"].includes(payload.schema_version)) {
      const attestations = payload.verification_attestations || [];
      if (attestations.length < 2) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_SIGNED_QUORUM_MISSING", "$.verification_attestations", "v0.3+ checkpoints require at least two signed verification attestations."));
      }
      const ids = attestations.map(item => item.attestation_id);
      if (new Set(ids).size !== ids.length) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_DUPLICATE_ATTESTATION", "$.verification_attestations", "Checkpoint attestation IDs must be unique."));
      }
      for (const [index, attestation] of attestations.entries()) {
        if (!receiptIds.includes(attestation.receipt_id)) {
          issues.push(issue("critical", "SELF_IMPROVEMENT_ATTESTATION_RECEIPT_UNKNOWN", `$.verification_attestations[${index}].receipt_id`, "Every attestation must bind a receipt cited by the checkpoint."));
        }
        if (path.isAbsolute(attestation.relative_path || "") || String(attestation.relative_path || "").split(/[\\/]+/).includes("..")) {
          issues.push(issue("critical", "SELF_IMPROVEMENT_ATTESTATION_PATH_INVALID", `$.verification_attestations[${index}].relative_path`, "Attestation references must remain repository-artifact-relative."));
        }
      }
    } else if (payload.verification_attestations !== undefined) {
      issues.push(issue("error", "SELF_IMPROVEMENT_V02_ATTESTATIONS", "$.verification_attestations", "Signed attestations require checkpoint schema version 0.3 or later."));
    }
    const comparativeAttestations = payload.comparative_evaluation_attestations || [];
    if (payload.schema_version === "0.4" && comparativeTarget) {
      if (comparativeAttestations.length < 2) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_COMPARATIVE_SIGNED_QUORUM_MISSING", "$.comparative_evaluation_attestations", "v0.4 comparative checkpoints require at least two signed report attestations."));
      }
      const ids = comparativeAttestations.map(item => item.attestation_id);
      if (new Set(ids).size !== ids.length) {
        issues.push(issue("critical", "SELF_IMPROVEMENT_DUPLICATE_COMPARATIVE_ATTESTATION", "$.comparative_evaluation_attestations", "Comparative attestation IDs must be unique."));
      }
      for (const [index, attestation] of comparativeAttestations.entries()) {
        if (attestation.report_id !== comparisonRef.report_id) {
          issues.push(issue("critical", "SELF_IMPROVEMENT_COMPARATIVE_ATTESTATION_REPORT_UNKNOWN", `$.comparative_evaluation_attestations[${index}].report_id`, "Every comparative attestation must bind the checkpoint report."));
        }
        if (path.isAbsolute(attestation.relative_path || "") || String(attestation.relative_path || "").split(/[\\/]+/).includes("..")) {
          issues.push(issue("critical", "SELF_IMPROVEMENT_COMPARATIVE_ATTESTATION_PATH_INVALID", `$.comparative_evaluation_attestations[${index}].relative_path`, "Comparative attestation references must remain repository-artifact-relative."));
        }
      }
    } else if (payload.comparative_evaluation_attestations !== undefined) {
      issues.push(issue("error", "SELF_IMPROVEMENT_COMPARATIVE_ATTESTATION_VERSION_MISMATCH", "$.comparative_evaluation_attestations", "Comparative report attestations are allowed only for v0.4 comparative checkpoints."));
    }
  }

  if (type === "comparative-evaluation-set") {
    const fixtureIds = (payload.fixtures || []).map(item => item.id);
    if (new Set(fixtureIds).size !== fixtureIds.length) {
      issues.push(issue("critical", "COMPARATIVE_EVALUATION_DUPLICATE_FIXTURE", "$.fixtures", "Comparative fixture IDs must be unique and order-stable."));
    }
    const controls = payload.contamination_controls || {};
    if (controls.sealed_before_candidate_execution !== true || controls.candidate_context_excludes_expected_outputs !== true || controls.same_fixture_order_required !== true) {
      issues.push(issue("critical", "COMPARATIVE_EVALUATION_CONTAMINATION_CONTROL_MISSING", "$.contamination_controls", "The fixture set must be sealed before execution and exclude expected outputs from candidate context."));
    }
  }

  if (type === "comparative-evaluation-plan") {
    const baseline = payload.subjects && payload.subjects.baseline;
    const candidateSubject = payload.subjects && payload.subjects.candidate;
    const check = payload.harness && payload.harness.check;
    if (baseline && candidateSubject && baseline.candidate_id === candidateSubject.candidate_id) {
      issues.push(issue("critical", "COMPARATIVE_EVALUATION_SUBJECTS_NOT_DISTINCT", "$.subjects", "Baseline and candidate must have distinct immutable identities."));
    }
    if (baseline && candidateSubject && payload.evaluation_purpose === "candidate_promotion" && baseline.revision === candidateSubject.revision) {
      issues.push(issue("critical", "COMPARATIVE_EVALUATION_PROMOTION_REVISIONS_NOT_DISTINCT", "$.subjects", "Candidate promotion requires distinct baseline and candidate revisions."));
    }
    if (baseline && candidateSubject && payload.evaluation_purpose === "completion_revalidation" && baseline.revision !== candidateSubject.revision) {
      issues.push(issue("critical", "COMPARATIVE_EVALUATION_COMPLETION_REVISIONS_MISMATCH", "$.subjects", "Completion revalidation must execute the same accepted revision in both isolated worktrees."));
    }
    for (const [subjectName, subject] of Object.entries(payload.subjects || {})) {
      const state = subject.expected_repository_state || {};
      if (subject.revision !== state.head_commit && subject.revision !== `WT-${state.worktree_fingerprint}`) {
        issues.push(issue("critical", "COMPARATIVE_EVALUATION_REVISION_STATE_MISMATCH", `$.subjects.${subjectName}.revision`, "A subject revision must be its Git head or exact worktree fingerprint identity."));
      }
    }
    if (check) {
      const cwd = String(check.working_directory || "");
      if (path.isAbsolute(cwd) || /^[A-Za-z]:[\\/]/.test(cwd) || cwd.split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "COMPARATIVE_EVALUATION_WORKDIR_INVALID", "$.harness.check.working_directory", "Comparative harness working directories must remain repository-relative."));
      }
      if (!check.args || !check.args[0] || check.args[0].startsWith("-") || !check.args[0].endsWith(".js") || check.args[0].split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "COMPARATIVE_EVALUATION_HARNESS_INVALID", "$.harness.check.args", "Comparative evaluation requires a repository-relative JavaScript harness."));
      }
    }
    const ref = payload.evaluation_set_ref || {};
    if (path.isAbsolute(ref.relative_path || "") || String(ref.relative_path || "").split(/[\\/]+/).includes("..")) {
      issues.push(issue("critical", "COMPARATIVE_EVALUATION_SET_PATH_INVALID", "$.evaluation_set_ref.relative_path", "Evaluation-set references must remain repository-artifact-relative."));
    }
  }

  if (type === "comparative-evaluation-report") {
    const baseline = payload.executions && payload.executions.baseline;
    const candidateExecution = payload.executions && payload.executions.candidate;
    const comparisonIds = (payload.comparisons || []).map(item => item.dimension_id);
    if (new Set(comparisonIds).size !== comparisonIds.length) {
      issues.push(issue("critical", "COMPARATIVE_REPORT_DUPLICATE_DIMENSION", "$.comparisons", "Comparative report dimensions must be unique."));
    }
    for (const [subject, execution] of Object.entries(payload.executions || {})) {
      if (execution.observation) {
        const bytes = Buffer.from(`${JSON.stringify(execution.observation, null, 2)}\n`);
        const digest = crypto.createHash("sha256").update(bytes).digest("hex");
        if (!execution.stdout || execution.stdout.truncated !== false || execution.stdout.byte_size !== bytes.length || execution.stdout.sha256 !== digest) {
          issues.push(issue("critical", "COMPARATIVE_REPORT_OBSERVATION_OUTPUT_MISMATCH", `$.executions.${subject}.stdout`, "Parsed observations must match the exact structured stdout bytes recorded by the execution."));
        }
      }
    }
    if (payload.outcome === "promotable" && (payload.working_state_promotion_recommended !== true || (payload.blocking_codes || []).length > 0 ||
        !baseline || !candidateExecution || baseline.status !== "passed" || candidateExecution.status !== "passed" ||
        baseline.repository_state_unchanged !== true || candidateExecution.repository_state_unchanged !== true ||
        (payload.comparisons || []).length === 0 || payload.comparisons.some(item => item.passed !== true))) {
      issues.push(issue("critical", "COMPARATIVE_REPORT_FALSE_PROMOTION", "$.outcome", "A promotable report requires two unchanged passing executions and every comparison threshold to pass."));
    }
    if (payload.outcome !== "promotable" && payload.working_state_promotion_recommended !== false) {
      issues.push(issue("critical", "COMPARATIVE_REPORT_UNSAFE_RECOMMENDATION", "$.working_state_promotion_recommended", "Rollback and inconclusive reports cannot recommend promotion."));
    }
    if (payload.execution_authorized !== false || payload.release_authorized !== false) {
      issues.push(issue("critical", "COMPARATIVE_REPORT_AUTHORITY_EXPANSION", "$", "Comparative evaluation never authorizes execution or release."));
    }
    if (!isValidDate(payload.started_at) || !isValidDate(payload.finished_at) || Date.parse(payload.finished_at) < Date.parse(payload.started_at)) {
      issues.push(issue("error", "COMPARATIVE_REPORT_TIME_INVALID", "$.finished_at", "Comparative evaluation finish time cannot precede start time."));
    }
    if (payload.report_sha256 !== canonicalDigestWithout(payload, ["report_sha256"])) {
      issues.push(issue("critical", "COMPARATIVE_REPORT_DIGEST_INVALID", "$.report_sha256", "Comparative report digest must match its canonical content."));
    }
  }

  if (type === "verification-plan") {
    const ids = (payload.checks || []).map(item => item.id);
    if (new Set(ids).size !== ids.length) issues.push(issue("error", "VERIFICATION_PLAN_DUPLICATE_CHECK", "$.checks", "Verification check IDs must be unique."));
    for (const [index, check] of (payload.checks || []).entries()) {
      const executable = String(check.executable || "").toLowerCase();
      if (["sh", "bash", "zsh", "fish", "cmd", "powershell", "pwsh", "sudo", "env"].includes(executable)) {
        issues.push(issue("critical", "VERIFICATION_PLAN_SHELL_PROHIBITED", `$.checks[${index}].executable`, "Verification plans cannot use a shell or privilege wrapper."));
      }
      const cwd = String(check.working_directory || "");
      if (path.isAbsolute(cwd) || /^[A-Za-z]:[\\/]/.test(cwd) || cwd.split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "VERIFICATION_PLAN_WORKDIR_INVALID", `$.checks[${index}].working_directory`, "Verification working directories must remain repository-relative."));
      }
      if (executable === "node" && (!check.args || !check.args[0] || check.args[0].startsWith("-") || !check.args[0].endsWith(".js") || check.args[0].split(/[\\/]+/).includes(".."))) {
        issues.push(issue("critical", "VERIFICATION_PLAN_NODE_SCRIPT_INVALID", `$.checks[${index}].args`, "Node verification must name a repository-relative JavaScript file, not inline code or loader flags."));
      }
    }
  }

  if (type === "verification-receipt") {
    if (payload.runner && payload.runner.shell_used !== false) issues.push(issue("critical", "VERIFICATION_RECEIPT_SHELL_USED", "$.runner.shell_used", "A proof receipt is invalid if a shell was used."));
    if (payload.overall_status === "passed" && (payload.repository_state_unchanged !== true || (payload.checks || []).some(item => item.status !== "passed"))) {
      issues.push(issue("critical", "VERIFICATION_RECEIPT_FALSE_PASS", "$.overall_status", "A passed receipt requires every check to pass without repository mutation."));
    }
    if (payload.repository_state_unchanged === true && JSON.stringify(payload.repository_state_before) !== JSON.stringify(payload.repository_state_after)) {
      issues.push(issue("critical", "VERIFICATION_RECEIPT_STATE_MISMATCH", "$.repository_state_unchanged", "An unchanged claim must have identical before and after repository state."));
    }
    if (!isValidDate(payload.started_at) || !isValidDate(payload.finished_at) || Date.parse(payload.finished_at) < Date.parse(payload.started_at)) {
      issues.push(issue("error", "VERIFICATION_RECEIPT_TIME_INVALID", "$.finished_at", "Verification finish time cannot precede start time."));
    }
    if (payload.receipt_sha256 !== canonicalDigestWithout(payload, ["receipt_sha256"])) {
      issues.push(issue("critical", "VERIFICATION_RECEIPT_DIGEST_INVALID", "$.receipt_sha256", "Verification receipt digest must match its canonical content."));
    }
  }

  if (type === "verifier-trust-policy") {
    const verifiers = payload.verifiers || [];
    const ids = new Set();
    const keyIds = new Set();
    const activeGroups = new Set();
    const spiffeIds = new Set();
    const identityAssurance = payload.identity_assurance || {};
    const trustedRootIds = new Set();
    const trustedLogIds = new Set();

    if (["0.2", "0.3", "0.4", "0.5", "0.6"].includes(payload.schema_version) && !payload.identity_assurance) {
      issues.push(issue("critical", "VERIFIER_POLICY_IDENTITY_ASSURANCE_REQUIRED", "$.identity_assurance", "Policy v0.2+ requires workload identity assurance."));
    }
    if (payload.schema_version === "0.1" && (payload.identity_assurance || verifiers.some(item => item.workload_identity))) {
      issues.push(issue("error", "VERIFIER_POLICY_VERSION_CONTRACT_INVALID", "$.schema_version", "Workload identity assurance requires policy schema v0.2 or later."));
    }
    const sigstoreRootRefs = identityAssurance.sigstore_trusted_root_refs || [];
    const sigstoreRootIds = new Set();
    for (const [index, ref] of sigstoreRootRefs.entries()) {
      const pointer = `$.identity_assurance.sigstore_trusted_root_refs[${index}]`;
      if (sigstoreRootIds.has(ref.artifact_id)) issues.push(issue("critical", "VERIFIER_POLICY_DUPLICATE_SIGSTORE_ROOT", `${pointer}.artifact_id`, "Sigstore TrustedRoot references must be unique."));
      sigstoreRootIds.add(ref.artifact_id);
      if (path.isAbsolute(ref.relative_path || "") || String(ref.relative_path || "").split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "VERIFIER_POLICY_SIGSTORE_ROOT_PATH_INVALID", `${pointer}.relative_path`, "Sigstore TrustedRoot references must remain repository-artifact-relative."));
      }
    }
    if (["0.3", "0.4", "0.5", "0.6"].includes(payload.schema_version) && (sigstoreRootRefs.length === 0 || !Number.isInteger(identityAssurance.max_trusted_root_age_seconds))) {
      issues.push(issue("critical", "VERIFIER_POLICY_SIGSTORE_ROOT_REQUIRED", "$.identity_assurance", "Policy v0.3+ requires a manifest-bound Sigstore TrustedRoot and freshness limit."));
    }
    const executionAssurance = payload.execution_assurance;
    if (["0.4", "0.5", "0.6"].includes(payload.schema_version)) {
      const runtimeRef = executionAssurance && executionAssurance.runtime_policy_ref;
      if (!executionAssurance || executionAssurance.required !== true || !runtimeRef) {
        issues.push(issue("critical", "VERIFIER_POLICY_EXECUTION_ASSURANCE_REQUIRED", "$.execution_assurance", "Policy v0.4+ requires an exact verifier runtime policy reference."));
      } else if (path.isAbsolute(runtimeRef.relative_path || "") || String(runtimeRef.relative_path || "").split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "VERIFIER_POLICY_RUNTIME_POLICY_PATH_INVALID", "$.execution_assurance.runtime_policy_ref.relative_path", "Runtime policy references must remain repository-artifact-relative."));
      }
    } else if (executionAssurance !== undefined) {
      issues.push(issue("error", "VERIFIER_POLICY_EXECUTION_ASSURANCE_VERSION_INVALID", "$.execution_assurance", "Execution assurance requires trust-policy schema v0.4 or later."));
    }
    const challengeAssurance = payload.challenge_assurance;
    if (["0.5", "0.6"].includes(payload.schema_version)) {
      if (!challengeAssurance || challengeAssurance.required !== true || challengeAssurance.single_use !== true ||
          !Number.isInteger(challengeAssurance.nonce_bytes) || challengeAssurance.nonce_bytes < 32 ||
          !Number.isInteger(challengeAssurance.response_timeout_seconds)) {
        issues.push(issue("critical", "VERIFIER_POLICY_CHALLENGE_ASSURANCE_REQUIRED", "$.challenge_assurance", "Policy v0.5 requires a single-use challenge with at least 32 random bytes and a finite response timeout."));
      }
      try {
        const issuerKey = crypto.createPublicKey(challengeAssurance.issuer_public_key_pem);
        if (issuerKey.asymmetricKeyType !== "ed25519" || publicKeyId(issuerKey) !== challengeAssurance.issuer_key_id) {
          issues.push(issue("critical", "VERIFIER_POLICY_CHALLENGE_ISSUER_KEY_INVALID", "$.challenge_assurance.issuer_key_id", "Challenge issuer key must be Ed25519 and match the SHA-256 SPKI key ID."));
        }
        if (verifiers.some(item => item.key_id === challengeAssurance.issuer_key_id)) {
          issues.push(issue("critical", "VERIFIER_POLICY_CHALLENGE_ISSUER_KEY_CORRELATED", "$.challenge_assurance.issuer_key_id", "The supervisor challenge issuer key must be distinct from every verifier key."));
        }
      } catch (error) {
        issues.push(issue("critical", "VERIFIER_POLICY_CHALLENGE_ISSUER_KEY_INVALID", "$.challenge_assurance.issuer_public_key_pem", "Challenge issuer public key must be valid SPKI PEM."));
      }
    } else if (challengeAssurance !== undefined) {
      issues.push(issue("error", "VERIFIER_POLICY_CHALLENGE_ASSURANCE_VERSION_INVALID", "$.challenge_assurance", "Pre-dispatch challenge assurance requires trust-policy schema v0.5 or later."));
    }
    const independenceAssurance = payload.independence_assurance;
    if (payload.schema_version === "0.6") {
      if (!independenceAssurance || independenceAssurance.required !== true ||
          independenceAssurance.correlation_rule !== "shared_required_component" ||
          !exactDimensions(independenceAssurance.required_dimensions) ||
          !Number.isInteger(independenceAssurance.minimum_independent_domains) ||
          independenceAssurance.minimum_independent_domains < (payload.quorum && payload.quorum.minimum_independence_groups || 0)) {
        issues.push(issue("critical", "VERIFIER_POLICY_INDEPENDENCE_ASSURANCE_INVALID", "$.independence_assurance", "Policy v0.6 requires the complete ordered failure-domain dimensions and a threshold at least as strong as the attestation quorum."));
      }
    } else if (independenceAssurance !== undefined) {
      issues.push(issue("error", "VERIFIER_POLICY_INDEPENDENCE_ASSURANCE_VERSION_INVALID", "$.independence_assurance", "Failure-domain assurance requires trust-policy schema v0.6."));
    }
    for (const [index, root] of (identityAssurance.trusted_x509_roots || []).entries()) {
      const pointer = `$.identity_assurance.trusted_x509_roots[${index}]`;
      if (trustedRootIds.has(root.id)) issues.push(issue("critical", "VERIFIER_POLICY_DUPLICATE_TRUST_ROOT", `${pointer}.id`, "Trusted X.509 root IDs must be unique."));
      trustedRootIds.add(root.id);
      try {
        const certificate = new crypto.X509Certificate(root.certificate_pem);
        if (certificate.ca !== true || !certificate.verify(certificate.publicKey)) {
          issues.push(issue("critical", "VERIFIER_POLICY_TRUST_ROOT_INVALID", `${pointer}.certificate_pem`, "Trusted X.509 roots must be self-signed CA certificates."));
        }
        if (certificateSha256(certificate) !== root.certificate_sha256) {
          issues.push(issue("critical", "VERIFIER_POLICY_TRUST_ROOT_DIGEST_MISMATCH", `${pointer}.certificate_sha256`, "Trusted X.509 root digest must match the certificate DER bytes."));
        }
      } catch (error) {
        issues.push(issue("critical", "VERIFIER_POLICY_TRUST_ROOT_INVALID", `${pointer}.certificate_pem`, "Trusted X.509 root must be a valid PEM certificate."));
      }
    }
    for (const [index, log] of (identityAssurance.trusted_transparency_logs || []).entries()) {
      const pointer = `$.identity_assurance.trusted_transparency_logs[${index}]`;
      if (trustedLogIds.has(log.id)) issues.push(issue("critical", "VERIFIER_POLICY_DUPLICATE_TRANSPARENCY_LOG", `${pointer}.id`, "Trusted transparency-log IDs must be unique."));
      trustedLogIds.add(log.id);
      try {
        const key = crypto.createPublicKey(log.public_key_pem);
        if (key.asymmetricKeyType !== "ed25519" || publicKeyId(key) !== log.key_id) {
          issues.push(issue("critical", "VERIFIER_POLICY_TRANSPARENCY_KEY_INVALID", `${pointer}.key_id`, "Transparency-log keys must be Ed25519 keys whose SPKI digest matches key_id."));
        }
      } catch (error) {
        issues.push(issue("critical", "VERIFIER_POLICY_TRANSPARENCY_KEY_INVALID", `${pointer}.public_key_pem`, "Transparency-log public key must be valid SPKI PEM."));
      }
    }
    for (const [index, verifier] of verifiers.entries()) {
      const pointer = `$.verifiers[${index}]`;
      if (ids.has(verifier.id)) issues.push(issue("critical", "VERIFIER_POLICY_DUPLICATE_ID", `${pointer}.id`, "Verifier IDs must be unique."));
      if (keyIds.has(verifier.key_id)) issues.push(issue("critical", "VERIFIER_POLICY_DUPLICATE_KEY", `${pointer}.key_id`, "One public key cannot satisfy more than one verifier identity."));
      ids.add(verifier.id);
      keyIds.add(verifier.key_id);
      if (verifier.status === "active") activeGroups.add(verifier.independence_group);
      try {
        if (publicKeyId(verifier.public_key_pem) !== verifier.key_id) {
          issues.push(issue("critical", "VERIFIER_POLICY_KEY_ID_MISMATCH", `${pointer}.key_id`, "Verifier key_id must be the SHA-256 digest of the Ed25519 SPKI public key."));
        }
        if (crypto.createPublicKey(verifier.public_key_pem).asymmetricKeyType !== "ed25519") {
          issues.push(issue("critical", "VERIFIER_POLICY_KEY_NOT_ED25519", `${pointer}.public_key_pem`, "Verifier keys must use Ed25519."));
        }
      } catch (error) {
        issues.push(issue("critical", "VERIFIER_POLICY_PUBLIC_KEY_INVALID", `${pointer}.public_key_pem`, "Verifier public key must be valid SPKI PEM."));
      }
      if (!isValidDate(verifier.valid_from) || !isValidDate(verifier.valid_until) || Date.parse(verifier.valid_until) <= Date.parse(verifier.valid_from)) {
        issues.push(issue("critical", "VERIFIER_POLICY_KEY_WINDOW_INVALID", pointer, "Verifier validity must end after it begins."));
      }
      if (!(verifier.allowed_repository_keys || []).includes(payload.repository_binding && payload.repository_binding.repository_key)) {
        issues.push(issue("critical", "VERIFIER_POLICY_REPOSITORY_NOT_ALLOWED", `${pointer}.allowed_repository_keys`, "Every trusted verifier must explicitly allow the policy repository."));
      }
      if (["0.2", "0.3", "0.4", "0.5", "0.6"].includes(payload.schema_version)) {
        const workload = verifier.workload_identity;
        if (!workload) {
          issues.push(issue("critical", "VERIFIER_POLICY_WORKLOAD_IDENTITY_REQUIRED", `${pointer}.workload_identity`, "Every verifier in policy v0.2+ requires a workload identity."));
        } else if (workload.type === "spiffe_x509") {
          if (spiffeIds.has(workload.spiffe_id)) issues.push(issue("critical", "VERIFIER_POLICY_DUPLICATE_SPIFFE_ID", `${pointer}.workload_identity.spiffe_id`, "SPIFFE IDs must be unique across verifier identities."));
          spiffeIds.add(workload.spiffe_id);
          if (!trustedRootIds.has(workload.trust_root_id)) issues.push(issue("critical", "VERIFIER_POLICY_TRUST_ROOT_REFERENCE_INVALID", `${pointer}.workload_identity.trust_root_id`, "Verifier workload identity must reference a trusted X.509 root."));
          if (!trustedLogIds.has(workload.transparency_log_id)) issues.push(issue("critical", "VERIFIER_POLICY_TRANSPARENCY_LOG_REFERENCE_INVALID", `${pointer}.workload_identity.transparency_log_id`, "Verifier workload identity must reference a trusted transparency log."));
          try {
            const spiffe = new URL(workload.spiffe_id);
            const root = (identityAssurance.trusted_x509_roots || []).find(item => item.id === workload.trust_root_id);
            if (spiffe.protocol !== "spiffe:" || !spiffe.hostname || spiffe.pathname === "/" || spiffe.search || spiffe.hash ||
                spiffe.href !== workload.spiffe_id || (root && spiffe.hostname !== root.trust_domain)) {
              issues.push(issue("critical", "VERIFIER_POLICY_SPIFFE_ID_INVALID", `${pointer}.workload_identity.spiffe_id`, "SPIFFE ID must use the selected root's trust domain and a non-root path."));
            }
          } catch (error) {
            issues.push(issue("critical", "VERIFIER_POLICY_SPIFFE_ID_INVALID", `${pointer}.workload_identity.spiffe_id`, "Verifier workload identity must be a valid SPIFFE URI."));
          }
        } else if (["0.3", "0.4", "0.5", "0.6"].includes(payload.schema_version) && workload.type === "sigstore_bundle") {
          const requiredFields = ["certificate_identity_type", "certificate_identity", "certificate_issuer", "trust_root_id", "bundle_media_type", "ctlog_threshold", "tlog_threshold", "timestamp_threshold"];
          if (requiredFields.some(field => workload[field] === undefined)) {
            issues.push(issue("critical", "VERIFIER_POLICY_SIGSTORE_IDENTITY_INCOMPLETE", `${pointer}.workload_identity`, "Sigstore identity requires exact SAN, issuer, root, bundle media type, and nonzero verification thresholds."));
          }
          if (!sigstoreRootIds.has(workload.trust_root_id)) {
            issues.push(issue("critical", "VERIFIER_POLICY_SIGSTORE_ROOT_REFERENCE_INVALID", `${pointer}.workload_identity.trust_root_id`, "Sigstore workload identity must reference a manifest-bound TrustedRoot."));
          }
        } else {
          issues.push(issue("critical", "VERIFIER_POLICY_WORKLOAD_IDENTITY_TYPE_INVALID", `${pointer}.workload_identity.type`, "Policy workload identity type is not supported by this schema version."));
        }
      }
    }
    const active = verifiers.filter(item => item.status === "active");
    const quorum = payload.quorum || {};
    if (quorum.minimum_valid_attestations > active.length) {
      issues.push(issue("critical", "VERIFIER_POLICY_QUORUM_IMPOSSIBLE", "$.quorum.minimum_valid_attestations", "The active verifier population cannot satisfy the required attestation quorum."));
    }
    if ((payload.schema_version !== "0.6" && quorum.minimum_independence_groups > activeGroups.size) ||
        quorum.minimum_independence_groups > quorum.minimum_valid_attestations) {
      issues.push(issue("critical", "VERIFIER_POLICY_GROUP_QUORUM_IMPOSSIBLE", "$.quorum.minimum_independence_groups", "The active independence groups cannot satisfy the group quorum."));
    }
    if (!isValidDate(payload.created_at) || !isValidDate(payload.expires_at) || Date.parse(payload.expires_at) <= Date.parse(payload.created_at)) {
      issues.push(issue("critical", "VERIFIER_POLICY_WINDOW_INVALID", "$.expires_at", "Trust policy expiry must be later than creation."));
    }
  }

  if (type === "verifier-runtime-policy") {
    const profiles = payload.profiles || [];
    const assignments = payload.assignments || [];
    const profileIds = new Set();
    const assignedVerifiers = new Set();
    for (const [index, profile] of profiles.entries()) {
      const pointer = `$.profiles[${index}]`;
      if (profileIds.has(profile.id)) issues.push(issue("critical", "VERIFIER_RUNTIME_PROFILE_DUPLICATE", `${pointer}.id`, "Runtime profile IDs must be unique."));
      profileIds.add(profile.id);
      try {
        const key = crypto.createPublicKey(profile.builder && profile.builder.public_key_pem);
        if (key.asymmetricKeyType !== "ed25519" || publicKeyId(key) !== (profile.builder && profile.builder.key_id)) {
          issues.push(issue("critical", "VERIFIER_RUNTIME_BUILDER_KEY_INVALID", `${pointer}.builder.key_id`, "Builder keys must be Ed25519 keys whose SPKI digest matches key_id."));
        }
      } catch (error) {
        issues.push(issue("critical", "VERIFIER_RUNTIME_BUILDER_KEY_INVALID", `${pointer}.builder.public_key_pem`, "Builder public key must be valid SPKI PEM."));
      }
      const requiredClaims = PROVIDER_REQUIRED_CLAIMS[profile.provider] || [];
      const pinnedClaims = profile.provider_identity && profile.provider_identity.required_claims || {};
      if (requiredClaims.some(key => typeof pinnedClaims[key] !== "string" || pinnedClaims[key].length === 0)) {
        issues.push(issue("critical", "VERIFIER_RUNTIME_PROVIDER_CLAIMS_INCOMPLETE", `${pointer}.provider_identity.required_claims`, "Provider-specific stable execution identity claims must be pinned exactly."));
      }
      if (payload.schema_version === "0.2" && (!validClaims(profile.independence) || !profileClaimsMatchProvider(profile))) {
        issues.push(issue("critical", "VERIFIER_RUNTIME_INDEPENDENCE_CLAIMS_INVALID", `${pointer}.independence`, "Runtime-policy v0.2 requires complete identities and canonical provider/project/runner mappings from pinned provider claims."));
      }
      if (payload.schema_version === "0.1" && profile.independence !== undefined) {
        issues.push(issue("error", "VERIFIER_RUNTIME_INDEPENDENCE_VERSION_INVALID", `${pointer}.independence`, "Failure-domain claims require runtime-policy schema v0.2."));
      }
      const execution = profile.execution || {};
      const image = execution.container_image || {};
      const imageDigest = image.digest && image.digest.sha256;
      if (!imageDigest || !String(image.uri || "").endsWith(`@sha256:${imageDigest}`)) {
        issues.push(issue("critical", "VERIFIER_RUNTIME_IMAGE_NOT_DIGEST_PINNED", `${pointer}.execution.container_image`, "OCI images must use a manifest digest URI matching the descriptor digest."));
      }
      if (!(execution.tool_allowlist || []).includes((execution.argv || [])[0])) {
        issues.push(issue("critical", "VERIFIER_RUNTIME_ENTRYPOINT_NOT_ALLOWED", `${pointer}.execution.tool_allowlist`, "The exact argv entrypoint must be present in the tool allowlist."));
      }
      const network = execution.network_policy || {};
      if ((network.mode === "denied" && (network.allowed_endpoints || []).length !== 0) ||
          (network.mode === "allowlist" && (network.allowed_endpoints || []).length === 0)) {
        issues.push(issue("critical", "VERIFIER_RUNTIME_NETWORK_POLICY_INVALID", `${pointer}.execution.network_policy`, "Denied networking requires an empty list; allowlist mode requires explicit endpoints."));
      }
    }
    for (const [index, assignment] of assignments.entries()) {
      const pointer = `$.assignments[${index}]`;
      if (assignedVerifiers.has(assignment.verifier_id)) issues.push(issue("critical", "VERIFIER_RUNTIME_ASSIGNMENT_DUPLICATE", `${pointer}.verifier_id`, "Each verifier must have exactly one runtime profile assignment."));
      assignedVerifiers.add(assignment.verifier_id);
      if (!profileIds.has(assignment.profile_id)) issues.push(issue("critical", "VERIFIER_RUNTIME_PROFILE_REFERENCE_INVALID", `${pointer}.profile_id`, "Runtime assignments must reference an existing profile."));
    }
    if (!isValidDate(payload.created_at) || !isValidDate(payload.expires_at) || Date.parse(payload.expires_at) <= Date.parse(payload.created_at)) {
      issues.push(issue("critical", "VERIFIER_RUNTIME_POLICY_WINDOW_INVALID", "$.expires_at", "Runtime policy expiry must be later than creation."));
    }
  }

  if (type === "verifier-challenge-set") {
    const challenges = payload.challenges || [];
    const verifierIds = challenges.map(item => item.verifier_id);
    const nonces = challenges.map(item => item.nonce);
    if (new Set(verifierIds).size !== verifierIds.length) {
      issues.push(issue("critical", "CHALLENGE_SET_DUPLICATE_VERIFIER", "$.challenges", "A verifier may receive only one nonce in a challenge set."));
    }
    if (new Set(nonces).size !== nonces.length) {
      issues.push(issue("critical", "CHALLENGE_SET_DUPLICATE_NONCE", "$.challenges", "Every verifier challenge nonce must be unique."));
    }
    if (!isValidDate(payload.issued_at) || !isValidDate(payload.expires_at) ||
        Date.parse(payload.expires_at) <= Date.parse(payload.issued_at)) {
      issues.push(issue("critical", "CHALLENGE_SET_WINDOW_INVALID", "$.expires_at", "Challenge expiry must be later than issuance."));
    }
    if (payload.single_use !== true || payload.release_authorized !== false) {
      issues.push(issue("critical", "CHALLENGE_SET_AUTHORITY_INVALID", "$", "A challenge set must be single-use and cannot grant release authority."));
    }
    for (const field of ["trust_policy_ref", "runtime_policy_ref"]) {
      const ref = payload[field] || {};
      if (path.isAbsolute(ref.relative_path || "") || String(ref.relative_path || "").split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "CHALLENGE_SET_REFERENCE_INVALID", `$.${field}.relative_path`, "Challenge policy references must remain repository-artifact-relative."));
      }
    }
  }

  if (type === "verifier-execution-evidence") {
    if (payload.evidence_sha256 !== verifierExecutionEvidenceDigest(payload)) {
      issues.push(issue("critical", "EXECUTION_EVIDENCE_DIGEST_INVALID", "$.evidence_sha256", "Execution evidence digest must match its canonical content."));
    }
    if (payload.builder_key_id === payload.verifier_key_id) {
      issues.push(issue("critical", "EXECUTION_EVIDENCE_SIGNER_CORRELATION", "$.builder_key_id", "Builder and verifier signatures require distinct keys."));
    }
    if (payload.schema_version === "0.2" && !validClaims(payload.independence)) {
      issues.push(issue("critical", "EXECUTION_EVIDENCE_INDEPENDENCE_CLAIMS_INVALID", "$.independence", "Execution evidence v0.2 requires the complete observed failure-domain identity."));
    }
    const invocation = payload.invocation || {};
    if (!isValidDate(invocation.started_at) || !isValidDate(invocation.finished_at) ||
        !isValidDate(payload.issued_at) || !isValidDate(payload.expires_at) ||
        Date.parse(invocation.finished_at) < Date.parse(invocation.started_at) ||
        Date.parse(payload.issued_at) < Date.parse(invocation.finished_at) ||
        Date.parse(payload.expires_at) <= Date.parse(payload.issued_at)) {
      issues.push(issue("critical", "EXECUTION_EVIDENCE_TIME_INVALID", "$.invocation", "Execution, issue, and expiry times must be ordered."));
    }
    const network = payload.execution && payload.execution.network_policy || {};
    if ((network.mode === "denied" && (network.allowed_endpoints || []).length !== 0) ||
        (network.mode === "allowlist" && (network.allowed_endpoints || []).length === 0)) {
      issues.push(issue("critical", "EXECUTION_EVIDENCE_NETWORK_POLICY_INVALID", "$.execution.network_policy", "Observed network policy must be internally consistent."));
    }
    const envelope = payload.envelope || {};
    const envelopePayload = strictBase64(envelope.payload);
    const signatures = envelope.signatures || [];
    if (signatures.length !== 2 || new Set(signatures.map(item => item.keyid)).size !== 2 ||
        !signatures.some(item => item.keyid === payload.builder_key_id) ||
        !signatures.some(item => item.keyid === payload.verifier_key_id)) {
      issues.push(issue("critical", "EXECUTION_EVIDENCE_DSSE_SIGNERS_INVALID", "$.envelope.signatures", "Execution evidence requires exactly one trusted-builder and one verifier signature."));
    }
    if (!envelopePayload) {
      issues.push(issue("critical", "EXECUTION_EVIDENCE_STATEMENT_INVALID", "$.envelope.payload", "Execution evidence must contain a strict base64 in-toto statement."));
    } else {
      try {
        const statement = JSON.parse(envelopePayload.toString("utf8"));
        const subject = Array.isArray(statement.subject) && statement.subject.length === 1 ? statement.subject[0] : {};
        const predicate = statement.predicate || {};
        const verifier = predicate.verifier || {};
        const expectedPredicateType = payload.schema_version === "0.2" ? EXECUTION_PREDICATE_TYPE_V2 : EXECUTION_PREDICATE_TYPE;
        if (statement._type !== "https://in-toto.io/Statement/v1" || statement.predicateType !== expectedPredicateType ||
            subject.name !== payload.subject_ref.artifact_id || !subject.digest || subject.digest.sha256 !== payload.subject_ref.sha256) {
          issues.push(issue("critical", "EXECUTION_EVIDENCE_STATEMENT_SUBJECT_INVALID", "$.envelope.payload", "The in-toto subject must bind the exact persisted receipt or report digest."));
        }
        if (predicate.trust_policy_id !== payload.trust_policy_id || verifier.id !== payload.verifier_id ||
            verifier.key_id !== payload.verifier_key_id || verifier.profile_id !== payload.profile_id ||
            verifier.purpose !== payload.purpose || !sameJson(predicate.repository_binding, payload.repository_binding) ||
            !sameJson(predicate.repository_state, payload.repository_state) ||
            !sameJson(predicate.verification_target, payload.verification_target) ||
            (payload.schema_version === "0.2" && !sameJson(predicate.cannae_environment && predicate.cannae_environment.independence, payload.independence))) {
          issues.push(issue("critical", "EXECUTION_EVIDENCE_STATEMENT_BINDING_INVALID", "$.envelope.payload", "The signed statement must bind policy, verifier, repository, purpose, and target fields exactly."));
        }
      } catch (error) {
        issues.push(issue("critical", "EXECUTION_EVIDENCE_STATEMENT_INVALID", "$.envelope.payload", "Execution evidence payload must be valid JSON."));
      }
    }
  }

  if (type === "verifier-identity-evidence") {
    if (payload.evidence_sha256 !== identityEvidenceDigest(payload)) {
      issues.push(issue("critical", "IDENTITY_EVIDENCE_DIGEST_INVALID", "$.evidence_sha256", "Identity evidence digest must match its canonical content."));
    }
    if (!isValidDate(payload.issued_at) || !isValidDate(payload.expires_at) || Date.parse(payload.expires_at) <= Date.parse(payload.issued_at)) {
      issues.push(issue("critical", "IDENTITY_EVIDENCE_TIME_INVALID", "$.expires_at", "Identity evidence expiry must be later than issue time."));
    }
    const statement = payload.binding_statement || {};
    const expected = {
      schema_version: "0.1",
      type: "VerifierIdentityBinding",
      evidence_id: payload.id,
      verifier_id: payload.verifier_id,
      verifier_key_id: payload.signatures && payload.signatures.verifier_key_id,
      spiffe_id: payload.workload_identity && payload.workload_identity.spiffe_id,
      trust_root_id: payload.workload_identity && payload.workload_identity.trust_root_id,
      transparency_log_id: payload.transparency && payload.transparency.log_id,
      repository_binding: payload.repository_binding,
      purposes: payload.purposes,
      nonce: statement.nonce,
      issued_at: payload.issued_at,
      expires_at: payload.expires_at
    };
    if (!canonicalJsonBytes(statement).equals(canonicalJsonBytes(expected))) {
      issues.push(issue("critical", "IDENTITY_EVIDENCE_STATEMENT_MISMATCH", "$.binding_statement", "Signed identity statement must exactly bind all top-level policy, identity, repository, purpose, and time fields."));
    }
    try {
      const leaf = new crypto.X509Certificate(payload.workload_identity.leaf_certificate_pem);
      if (leaf.ca || parseSpiffeId(leaf) !== payload.workload_identity.spiffe_id || leaf.publicKey.asymmetricKeyType !== "ed25519" ||
          publicKeyId(leaf.publicKey) !== payload.signatures.workload_key_id) {
        issues.push(issue("critical", "IDENTITY_EVIDENCE_LEAF_CERTIFICATE_INVALID", "$.workload_identity.leaf_certificate_pem", "Leaf certificate must be a non-CA Ed25519 certificate with exactly the bound SPIFFE URI SAN."));
      }
    } catch (error) {
      issues.push(issue("critical", "IDENTITY_EVIDENCE_LEAF_CERTIFICATE_INVALID", "$.workload_identity.leaf_certificate_pem", "Leaf certificate must be valid X.509 PEM."));
    }
    const workloadSignature = payload.signatures && strictBase64(payload.signatures.workload_signature_base64);
    const verifierSignature = payload.signatures && strictBase64(payload.signatures.verifier_signature_base64);
    if (!workloadSignature || !verifierSignature) {
      issues.push(issue("critical", "IDENTITY_EVIDENCE_SIGNATURE_ENCODING_INVALID", "$.signatures", "Identity signatures must use strict canonical base64 encoding."));
    }
    try {
      const expectedEntry = canonicalJsonBytes(transparencyEntry(payload));
      const suppliedEntry = strictBase64(payload.transparency.canonicalized_entry_base64);
      if (!suppliedEntry || !suppliedEntry.equals(expectedEntry) || payload.transparency.leaf_hash !== merkleLeafHash(expectedEntry)) {
        issues.push(issue("critical", "IDENTITY_EVIDENCE_TRANSPARENCY_ENTRY_INVALID", "$.transparency", "Transparency entry and leaf hash must bind the certificate, statement, and both signatures."));
      }
    } catch (error) {
      issues.push(issue("critical", "IDENTITY_EVIDENCE_TRANSPARENCY_ENTRY_INVALID", "$.transparency", "Transparency entry must be parseable and canonically bound."));
    }
    const transparency = payload.transparency || {};
    const checkpoint = transparency.checkpoint || {};
    if (checkpoint.log_id !== transparency.log_id || checkpoint.tree_size !== transparency.tree_size ||
        !isValidDate(checkpoint.issued_at) || (isValidDate(payload.issued_at) && Date.parse(checkpoint.issued_at) < Date.parse(payload.issued_at)) ||
        (isValidDate(payload.expires_at) && Date.parse(checkpoint.issued_at) >= Date.parse(payload.expires_at))) {
      issues.push(issue("critical", "IDENTITY_EVIDENCE_CHECKPOINT_BINDING_INVALID", "$.transparency.checkpoint", "Checkpoint must bind the same log and tree and fall inside the evidence validity window."));
    }
  }

  if (type === "sigstore-trusted-root") {
    const result = verifySigstoreTrustedRoot(payload);
    for (const code of result.codes) {
      issues.push(issue("critical", code, "$", "Sigstore TrustedRoot must be normalized, complete, source-attributed, and digest-valid."));
    }
  }

  if (type === "sigstore-verifier-identity-evidence") {
    if (payload.evidence_sha256 !== sigstoreEvidenceDigest(payload)) {
      issues.push(issue("critical", "SIGSTORE_IDENTITY_EVIDENCE_DIGEST_INVALID", "$.evidence_sha256", "Sigstore identity evidence digest must match its canonical content."));
    }
    if (!isValidDate(payload.issued_at) || !isValidDate(payload.expires_at) || Date.parse(payload.expires_at) <= Date.parse(payload.issued_at)) {
      issues.push(issue("critical", "SIGSTORE_IDENTITY_EVIDENCE_TIME_INVALID", "$.expires_at", "Sigstore identity evidence expiry must be later than issue time."));
    }
    if (!canonicalJsonBytes(payload.binding_statement || {}).equals(canonicalJsonBytes(expectedSigstoreIdentityStatement(payload)))) {
      issues.push(issue("critical", "SIGSTORE_IDENTITY_EVIDENCE_STATEMENT_MISMATCH", "$.binding_statement", "Sigstore and static signatures must bind the same policy, identity, repository, purpose, nonce, root, and validity statement."));
    }
    if (!strictBase64(payload.signatures && payload.signatures.verifier_signature_base64)) {
      issues.push(issue("critical", "SIGSTORE_IDENTITY_EVIDENCE_SIGNATURE_ENCODING_INVALID", "$.signatures.verifier_signature_base64", "Static verifier signature must use strict canonical base64."));
    }
    try {
      const normalized = normalizeBundle(payload.sigstore.bundle);
      if (!canonicalJsonBytes(normalized).equals(canonicalJsonBytes(payload.sigstore.bundle)) ||
          payload.sigstore.bundle_media_type !== normalized.mediaType ||
          payload.sigstore.bundle_sha256 !== crypto.createHash("sha256").update(canonicalJsonBytes(normalized)).digest("hex")) {
        issues.push(issue("critical", "SIGSTORE_IDENTITY_EVIDENCE_BUNDLE_BINDING_INVALID", "$.sigstore", "Bundle media type, normalized bytes, and digest must match."));
      }
    } catch (error) {
      issues.push(issue("critical", "SIGSTORE_IDENTITY_EVIDENCE_BUNDLE_INVALID", "$.sigstore.bundle", "Sigstore bundle must parse under the pinned official library."));
    }
  }

  if (type === "verification-attestation") {
    if (payload.attestation_sha256 !== attestationDigest(payload)) {
      issues.push(issue("critical", "ATTESTATION_DIGEST_INVALID", "$.attestation_sha256", "Attestation digest must match the complete signed envelope and bindings."));
    }
    if (!isValidDate(payload.issued_at) || !isValidDate(payload.expires_at) || Date.parse(payload.expires_at) <= Date.parse(payload.issued_at)) {
      issues.push(issue("critical", "ATTESTATION_TIME_INVALID", "$.expires_at", "Attestation expiry must be later than issue time."));
    }
    if (path.isAbsolute(payload.receipt_relative_path || "") || String(payload.receipt_relative_path || "").split(/[\\/]+/).includes("..")) {
      issues.push(issue("critical", "ATTESTATION_RECEIPT_PATH_INVALID", "$.receipt_relative_path", "Attestation receipt paths must remain repository-artifact-relative."));
    }
    if (payload.schema_version === "0.2") {
      const ref = payload.execution_evidence_ref;
      if (!ref || path.isAbsolute(ref.relative_path || "") || String(ref.relative_path || "").split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "ATTESTATION_EXECUTION_EVIDENCE_REFERENCE_INVALID", "$.execution_evidence_ref", "Attestation v0.2 requires an exact repository-artifact-relative execution evidence reference."));
      }
    } else if (payload.execution_evidence_ref !== undefined) {
      issues.push(issue("error", "ATTESTATION_EXECUTION_EVIDENCE_VERSION_INVALID", "$.execution_evidence_ref", "Execution evidence references require attestation schema v0.2."));
    }
    let statement = null;
    try { statement = JSON.parse(Buffer.from(payload.envelope.payload, "base64").toString("utf8")); } catch (error) { /* reported below */ }
    const subject = statement && Array.isArray(statement.subject) && statement.subject.length === 1 ? statement.subject[0] : {};
    const predicate = (statement && statement.predicate) || {};
    const receipt = predicate.receipt || {};
    const verifier = predicate.verifier || {};
    if (!statement || statement._type !== "https://in-toto.io/Statement/v1" ||
        statement.predicateType !== "https://cannae.dev/attestations/verification-receipt/v0.3") {
      issues.push(issue("critical", "ATTESTATION_STATEMENT_INVALID", "$.envelope.payload", "DSSE payload must contain the Cannae verification in-toto statement."));
    } else if (predicate.schema_version !== payload.schema_version ||
        (payload.schema_version === "0.2" && !sameJson(predicate.execution_evidence_ref, payload.execution_evidence_ref)) ||
        subject.name !== payload.receipt_id || !subject.digest || subject.digest.sha256 !== payload.receipt_sha256 ||
        receipt.id !== payload.receipt_id || receipt.relative_path !== payload.receipt_relative_path ||
        receipt.campaign_id !== payload.campaign_id || receipt.mission_id !== payload.mission_id ||
        receipt.cycle_number !== payload.cycle_number || receipt.candidate_id !== payload.candidate_id ||
        receipt.candidate_revision !== payload.candidate_revision || verifier.id !== payload.verifier_id || verifier.key_id !== payload.key_id ||
        verifier.independence_group !== payload.independence_group || verifier.execution_origin !== payload.execution_origin ||
        verifier.invocation_id !== payload.invocation_id || predicate.issued_at !== payload.issued_at || predicate.expires_at !== payload.expires_at ||
        JSON.stringify(predicate.repository_binding) !== JSON.stringify(payload.repository_binding)) {
      issues.push(issue("critical", "ATTESTATION_STATEMENT_BINDING_MISMATCH", "$.envelope.payload", "Signed statement fields must exactly match the exposed attestation bindings."));
    }
    if (!payload.envelope || !Array.isArray(payload.envelope.signatures) || payload.envelope.signatures.length !== 1 ||
        payload.envelope.signatures[0].keyid !== payload.key_id) {
      issues.push(issue("critical", "ATTESTATION_SIGNATURE_BINDING_INVALID", "$.envelope.signatures", "Attestation must contain exactly one signature from its declared key."));
    }
  }

  if (type === "comparative-evaluation-attestation") {
    if (payload.attestation_sha256 !== comparativeAttestationDigest(payload)) {
      issues.push(issue("critical", "COMPARATIVE_ATTESTATION_DIGEST_INVALID", "$.attestation_sha256", "Comparative attestation digest must match its envelope and exposed bindings."));
    }
    if (!isValidDate(payload.issued_at) || !isValidDate(payload.expires_at) || Date.parse(payload.expires_at) <= Date.parse(payload.issued_at)) {
      issues.push(issue("critical", "COMPARATIVE_ATTESTATION_TIME_INVALID", "$.expires_at", "Comparative attestation expiry must be later than issue time."));
    }
    if (path.isAbsolute(payload.report_relative_path || "") || String(payload.report_relative_path || "").split(/[\\/]+/).includes("..")) {
      issues.push(issue("critical", "COMPARATIVE_ATTESTATION_REPORT_PATH_INVALID", "$.report_relative_path", "Attested report paths must remain repository-artifact-relative."));
    }
    if (payload.schema_version === "0.2") {
      const ref = payload.execution_evidence_ref;
      if (!ref || path.isAbsolute(ref.relative_path || "") || String(ref.relative_path || "").split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "COMPARATIVE_ATTESTATION_EXECUTION_EVIDENCE_REFERENCE_INVALID", "$.execution_evidence_ref", "Comparative attestation v0.2 requires an exact execution evidence reference."));
      }
    } else if (payload.execution_evidence_ref !== undefined) {
      issues.push(issue("error", "COMPARATIVE_ATTESTATION_EXECUTION_EVIDENCE_VERSION_INVALID", "$.execution_evidence_ref", "Execution evidence references require comparative attestation schema v0.2."));
    }
    let statement = null;
    try { statement = JSON.parse(Buffer.from(payload.envelope.payload, "base64").toString("utf8")); } catch (error) { /* reported below */ }
    const subject = statement && Array.isArray(statement.subject) && statement.subject.length === 1 ? statement.subject[0] : {};
    const predicate = (statement && statement.predicate) || {};
    const report = predicate.report || {};
    const subjects = predicate.subjects || {};
    const baseline = subjects.baseline || {};
    const candidate = subjects.candidate || {};
    const evaluator = predicate.evaluator || {};
    const verifier = predicate.verifier || {};
    if (!statement || statement._type !== "https://in-toto.io/Statement/v1" || statement.predicateType !== COMPARATIVE_PREDICATE_TYPE) {
      issues.push(issue("critical", "COMPARATIVE_ATTESTATION_STATEMENT_INVALID", "$.envelope.payload", "DSSE payload must contain the Cannae comparative-report in-toto statement."));
    } else if (predicate.schema_version !== payload.schema_version ||
        (payload.schema_version === "0.2" && !sameJson(predicate.execution_evidence_ref, payload.execution_evidence_ref)) ||
        subject.name !== payload.report_id || !subject.digest || subject.digest.sha256 !== payload.report_sha256 ||
        report.id !== payload.report_id || report.relative_path !== payload.report_relative_path ||
        report.report_sha256 !== payload.report_content_sha256 || report.plan_id !== payload.plan_id ||
        report.evaluation_set_id !== payload.evaluation_set_id || report.campaign_id !== payload.campaign_id ||
        report.mission_id !== payload.mission_id || report.cycle_number !== payload.cycle_number || report.target_type !== payload.target_type ||
        baseline.candidate_id !== payload.baseline_candidate_id || baseline.revision !== payload.baseline_revision ||
        candidate.candidate_id !== payload.candidate_id || candidate.revision !== payload.candidate_revision ||
        evaluator.id !== payload.evaluator_id || evaluator.invocation_id !== payload.evaluator_invocation_id ||
        verifier.id !== payload.verifier_id || verifier.key_id !== payload.key_id || verifier.independence_group !== payload.independence_group ||
        verifier.execution_origin !== payload.execution_origin || verifier.invocation_id !== payload.invocation_id ||
        predicate.issued_at !== payload.issued_at || predicate.expires_at !== payload.expires_at ||
        JSON.stringify(predicate.repository_binding) !== JSON.stringify(payload.repository_binding)) {
      issues.push(issue("critical", "COMPARATIVE_ATTESTATION_STATEMENT_BINDING_MISMATCH", "$.envelope.payload", "Signed comparative statement fields must exactly match the exposed attestation bindings."));
    }
    if (!payload.envelope || !Array.isArray(payload.envelope.signatures) || payload.envelope.signatures.length !== 1 ||
        payload.envelope.signatures[0].keyid !== payload.key_id) {
      issues.push(issue("critical", "COMPARATIVE_ATTESTATION_SIGNATURE_BINDING_INVALID", "$.envelope.signatures", "Comparative attestation must contain exactly one signature from its declared key."));
    }
  }

  if (type === "self-improvement-decision") {
    if (payload.release_authorized !== false) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_SELF_RELEASE", "$.release_authorized", "The improvement controller cannot authorize merge, push, or external release."));
    }
    if (["escalate", "terminate", "complete"].includes(payload.decision) && payload.execution_authorized === true) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_DECISION_EXECUTION_MISMATCH", "$.execution_authorized", "Escalation, termination, and completion decisions cannot authorize candidate execution."));
    }
    if (payload.decision !== "rollback" && payload.blocking_codes && payload.blocking_codes.length > 0 && payload.execution_authorized === true) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_BLOCKED_EXECUTION", "$.blocking_codes", "A decision with blocking codes cannot authorize candidate execution."));
    }
    if (payload.human_decision_required === true && /^none$/i.test(String(payload.required_human_decision || ""))) {
      issues.push(issue("error", "SELF_IMPROVEMENT_HUMAN_DECISION_UNSPECIFIED", "$.required_human_decision", "Human escalation must state the required decision."));
    }
    if (payload.decision === "accept_working_state" && (payload.execution_authorized !== true || payload.promotion_scope === "none")) {
      issues.push(issue("error", "SELF_IMPROVEMENT_ACCEPT_WITHOUT_PROMOTION", "$", "An accepted working state must authorize a bounded promotion scope."));
    }
    if (["accept_working_state", "complete"].includes(payload.decision) && /^none$/i.test(String(payload.accepted_revision || ""))) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_ACCEPTED_REVISION_MISSING", "$.accepted_revision", "Promoted states must identify the exact accepted revision."));
    }
    if (payload.decision === "accept_working_state" && !hasSubstantiveItems(payload.proof && payload.proof.verification_receipt_ids)) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_DECISION_WITHOUT_PROOF", "$.proof.verification_receipt_ids", "Accepted working states require verified receipt IDs."));
    }
    if (["0.3", "0.4"].includes(payload.schema_version) && ["accept_working_state", "complete"].includes(payload.decision) &&
        (!(payload.proof && payload.proof.attestation_quorum_satisfied === true) ||
         !hasSubstantiveItems(payload.proof && payload.proof.verification_attestation_ids) ||
         !hasSubstantiveItems(payload.proof && payload.proof.verifier_key_ids) ||
         !hasSubstantiveItems(payload.proof && payload.proof.verifier_independence_groups))) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_DECISION_WITHOUT_SIGNED_QUORUM", "$.proof", "v0.3+ promotion and completion decisions require a satisfied signed verifier quorum."));
    }
    if (payload.schema_version === "0.4" && ["accept_working_state", "complete"].includes(payload.decision) &&
        payload.proof && payload.proof.comparative_evaluation_report_id !== "none" &&
        (payload.proof.comparative_attestation_quorum_satisfied !== true ||
         !hasSubstantiveItems(payload.proof.comparative_evaluation_attestation_ids) ||
         !hasSubstantiveItems(payload.proof.comparative_verifier_key_ids) ||
         !hasSubstantiveItems(payload.proof.comparative_verifier_independence_groups))) {
      issues.push(issue("critical", "SELF_IMPROVEMENT_DECISION_WITHOUT_COMPARATIVE_SIGNED_QUORUM", "$.proof", "v0.4 comparative promotion and completion decisions require a signed report quorum."));
    }
  }

  if (type === "self-improvement-cycle-order") {
    const ready = payload.status === "ready";
    const parent = payload.parent_decision_ref || {};
    const sourceCheckpoint = payload.source_checkpoint_ref || {};
    const sourceDecision = payload.source_decision_ref || {};
    const proof = payload.proof_requirements || {};
    const admission = payload.trust_policy_admission || {};
    if (payload.release_authorized !== false) {
      issues.push(issue("critical", "CYCLE_ORDER_SELF_RELEASE", "$.release_authorized", "A campaign cycle order cannot authorize merge, push, or release."));
    }
    if (ready !== (payload.execution_authorized === true)) {
      issues.push(issue("critical", "CYCLE_ORDER_EXECUTION_STATUS_MISMATCH", "$.execution_authorized", "Only a ready cycle order may authorize bounded execution."));
    }
    if (ready && hasSubstantiveItems(payload.blocking_codes)) {
      issues.push(issue("critical", "CYCLE_ORDER_BLOCKED_EXECUTION", "$.blocking_codes", "A ready cycle order cannot carry blocking codes."));
    }
    if (!ready && payload.transition !== "hold") {
      issues.push(issue("error", "CYCLE_ORDER_NONREADY_TRANSITION", "$.transition", "A non-ready cycle order must hold execution."));
    }
    if (payload.status === "blocked" && payload.human_decision_required !== true) {
      issues.push(issue("error", "CYCLE_ORDER_BLOCK_WITHOUT_HUMAN_DECISION", "$.human_decision_required", "A blocked cycle order must identify a human or corrective decision."));
    }
    if (payload.human_decision_required === true && /^none$/i.test(String(payload.required_human_decision || ""))) {
      issues.push(issue("error", "CYCLE_ORDER_HUMAN_DECISION_UNSPECIFIED", "$.required_human_decision", "A human-held order must state the required decision."));
    }
    if (payload.transition === "start" &&
        (!(parent.decision_id === "none" && parent.relative_path === "none" && parent.sha256 === "none") ||
         !(sourceCheckpoint.artifact_id === "none" && sourceCheckpoint.relative_path === "none" && sourceCheckpoint.sha256 === "none") ||
         !(sourceDecision.artifact_id === "none" && sourceDecision.relative_path === "none" && sourceDecision.sha256 === "none"))) {
      issues.push(issue("critical", "CYCLE_ORDER_START_WITH_HISTORY", "$", "A start order cannot claim a parent, checkpoint, or source decision."));
    }
    if (["advance", "before_completion"].includes(payload.transition) &&
        (parent.decision_id === "none" || sourceCheckpoint.artifact_id === "none" || sourceDecision.artifact_id === "none")) {
      issues.push(issue("critical", "CYCLE_ORDER_ADVANCE_WITHOUT_ACCEPTED_PARENT", "$", "An advancing order requires exact checkpoint, decision, and accepted-parent references."));
    }
    if (payload.transition === "before_completion" && payload.checkpoint_trigger !== "before_completion") {
      issues.push(issue("error", "CYCLE_ORDER_COMPLETION_TRIGGER_MISMATCH", "$.checkpoint_trigger", "The completion transition must require a before-completion checkpoint."));
    }
    if (proof.signed_attestation_required === true &&
        (!(proof.minimum_valid_attestations >= 2) || !(proof.minimum_independence_groups >= 2) ||
         proof.require_distinct_key_ids !== true || !proof.trust_policy_ref || proof.trust_policy_ref.artifact_id === "none")) {
      issues.push(issue("critical", "CYCLE_ORDER_SIGNED_QUORUM_UNDERSPECIFIED", "$.proof_requirements", "A signed cycle order requires a distinct-key, multi-group quorum and an exact trust-policy reference."));
    }
    if (proof.signed_attestation_required === false &&
        (proof.minimum_valid_attestations !== 0 || proof.minimum_independence_groups !== 0 ||
         proof.require_distinct_key_ids !== false || !proof.trust_policy_ref || proof.trust_policy_ref.artifact_id !== "none")) {
      issues.push(issue("error", "CYCLE_ORDER_UNSIGNED_PROOF_MISMATCH", "$.proof_requirements", "An unsigned campaign order must not claim signed-quorum requirements."));
    }
    if (proof.signed_comparative_attestation_required === true && proof.signed_attestation_required !== true) {
      issues.push(issue("critical", "CYCLE_ORDER_COMPARATIVE_QUORUM_UNDERSPECIFIED", "$.proof_requirements", "Signed comparative evidence requires the campaign trust policy and signed receipt quorum."));
    }
    if (payload.schema_version === "0.1" && payload.trust_policy_admission !== undefined) {
      issues.push(issue("error", "CYCLE_ORDER_V01_ADMISSION_UNSUPPORTED", "$.trust_policy_admission", "Trust-policy admission evidence requires cycle-order schema version 0.2."));
    }
    if (["0.2", "0.3", "0.4", "0.5", "0.6"].includes(payload.schema_version)) {
      const receipt = admission.receipt_quorum || {};
      const comparative = admission.comparative_quorum || {};
      const requirements = admission.effective_requirements || {};
      const admissionTrustRef = admission.trust_policy_ref || {};
      const proofTrustRef = proof.trust_policy_ref || {};
      const sameTrustRef = admissionTrustRef.artifact_id === proofTrustRef.artifact_id &&
        admissionTrustRef.relative_path === proofTrustRef.relative_path &&
        admissionTrustRef.sha256 === proofTrustRef.sha256;
      const quorumCountsMatch = quorum =>
        quorum.eligible_verifier_count === (quorum.verifier_ids || []).length &&
        quorum.distinct_key_count === (quorum.key_ids || []).length &&
        quorum.independence_group_count === (quorum.independence_groups || []).length;
      const quorumSatisfied = quorum => quorum.required !== true ||
        (quorum.eligible_verifier_count >= requirements.minimum_valid_attestations &&
         quorum.independence_group_count >= requirements.minimum_independence_groups &&
         (requirements.require_distinct_key_ids !== true || quorum.distinct_key_count >= requirements.minimum_valid_attestations));
      const expectedSatisfied = (admission.blocking_codes || []).length === 0 && quorumSatisfied(receipt) && quorumSatisfied(comparative);

      if (admission.required !== proof.signed_attestation_required || receipt.required !== proof.signed_attestation_required ||
          comparative.required !== proof.signed_comparative_attestation_required || !sameTrustRef) {
        issues.push(issue("critical", "CYCLE_ORDER_ADMISSION_REQUIREMENT_MISMATCH", "$.trust_policy_admission", "Admission purpose and trust-policy bindings must exactly match the cycle-order proof requirements."));
      }
      if (requirements.minimum_valid_attestations < proof.minimum_valid_attestations ||
          requirements.minimum_independence_groups < proof.minimum_independence_groups ||
          (proof.require_distinct_key_ids === true && requirements.require_distinct_key_ids !== true)) {
        issues.push(issue("critical", "CYCLE_ORDER_ADMISSION_THRESHOLD_WEAKENED", "$.trust_policy_admission.effective_requirements", "Admission may strengthen but cannot weaken the campaign quorum."));
      }
      if (!quorumCountsMatch(receipt) || !quorumCountsMatch(comparative)) {
        issues.push(issue("critical", "CYCLE_ORDER_ADMISSION_COUNT_MISMATCH", "$.trust_policy_admission", "Admission counts must equal their distinct evidence lists."));
      }
      if (admission.satisfied !== expectedSatisfied || receipt.satisfied !== quorumSatisfied(receipt) ||
          comparative.satisfied !== quorumSatisfied(comparative)) {
        issues.push(issue("critical", "CYCLE_ORDER_ADMISSION_FALSE_SATISFACTION", "$.trust_policy_admission", "Admission satisfaction must be derived from its effective thresholds, distinct identities, keys, groups, and blocking codes."));
      }
      if (payload.generated_at !== admission.evaluated_at) {
        issues.push(issue("critical", "CYCLE_ORDER_ADMISSION_TIME_MISMATCH", "$.trust_policy_admission.evaluated_at", "Admission must be evaluated at the exact cycle-order issuance time."));
      }
      if (admission.required === true && admission.satisfied === true &&
          (!isValidDate(admission.valid_until) || Date.parse(admission.valid_until) <= Date.parse(admission.evaluated_at))) {
        issues.push(issue("critical", "CYCLE_ORDER_ADMISSION_WINDOW_INVALID", "$.trust_policy_admission.valid_until", "A satisfied trust admission must expire after its evaluation time."));
      }
      if (admission.required === false &&
          (admission.satisfied !== true || admission.valid_until !== "none" ||
           requirements.minimum_valid_attestations !== 0 || requirements.minimum_independence_groups !== 0 ||
           requirements.require_distinct_key_ids !== false || admission.trust_policy_ref.artifact_id !== "none")) {
        issues.push(issue("error", "CYCLE_ORDER_UNSIGNED_ADMISSION_MISMATCH", "$.trust_policy_admission", "An unsigned campaign requires an explicit satisfied no-op admission with no trust policy or quorum."));
      }
      if (ready && (admission.satisfied !== true || (admission.required === true && admission.valid_until === "none"))) {
        issues.push(issue("critical", "CYCLE_ORDER_WITHOUT_TRUST_ADMISSION", "$.trust_policy_admission", "A ready cycle order requires a satisfied, time-bounded trust-policy admission."));
      }
      if (ready && (admission.blocking_codes || []).some(code => !(payload.blocking_codes || []).includes(code))) {
        issues.push(issue("critical", "CYCLE_ORDER_ADMISSION_BLOCK_NOT_PROPAGATED", "$.blocking_codes", "Ready execution cannot discard a trust-admission blocking code."));
      }
      if (["0.3", "0.4", "0.5", "0.6"].includes(payload.schema_version)) {
        const identity = admission.identity_assurance || {};
        const evidence = identity.evidence || [];
        const verifierIds = evidence.map(item => item.verifier_id);
        const genericIdentity = ["0.4", "0.5", "0.6"].includes(payload.schema_version);
        const trustDomains = evidence.map(item => item.trust_domain).filter(Boolean);
        const identityAuthorities = evidence.map(item => item.identity_authority).filter(Boolean);
        const logIds = evidence.flatMap(item => item.transparency_log_ids || [item.transparency_log_id]).filter(Boolean);
        const uniqueVerifierIds = new Set(verifierIds);
        const expectedIdentitySatisfied = identity.required !== true ||
          ((identity.blocking_codes || []).length === 0 && receipt.satisfied === true && comparative.satisfied === true);
        if (!admission.identity_assurance) {
          issues.push(issue("critical", "CYCLE_ORDER_IDENTITY_ADMISSION_REQUIRED", "$.trust_policy_admission.identity_assurance", "Cycle-order v0.3 requires an explicit workload identity admission projection."));
        } else {
          if (identity.authenticated_verifier_count !== evidence.length || uniqueVerifierIds.size !== evidence.length ||
              identity.distinct_trust_domain_count !== new Set(trustDomains).size ||
              (genericIdentity && identity.distinct_identity_authority_count !== new Set(identityAuthorities).size) ||
              identity.transparency_log_count !== new Set(logIds).size) {
            issues.push(issue("critical", "CYCLE_ORDER_IDENTITY_COUNT_MISMATCH", "$.trust_policy_admission.identity_assurance", "Identity admission counts must equal its distinct evidence bindings."));
          }
          const expectedIdentityScope = payload.schema_version === "0.6"
            ? "failure_domain_verified_fresh_challenged_workload_and_policy_eligibility"
            : payload.schema_version === "0.5" ? "fresh_challenged_workload_and_policy_eligibility"
            : "authenticated_workload_and_policy_eligibility";
          if (identity.satisfied !== expectedIdentitySatisfied || (identity.required === true && admission.assurance_scope !== expectedIdentityScope) ||
              (identity.required !== true && admission.assurance_scope !== "policy_eligibility_only")) {
            issues.push(issue("critical", "CYCLE_ORDER_IDENTITY_FALSE_SATISFACTION", "$.trust_policy_admission.identity_assurance", "Identity satisfaction and assurance scope must be derived from authenticated workload evidence."));
          }
          const evidenceByVerifier = new Map(evidence.map(item => [item.verifier_id, item]));
          const receiptBindingsValid = (receipt.verifier_ids || []).every(id => evidenceByVerifier.has(id) && evidenceByVerifier.get(id).purposes.includes("verification_receipt"));
          const comparativeBindingsValid = (comparative.verifier_ids || []).every(id => evidenceByVerifier.has(id) && evidenceByVerifier.get(id).purposes.includes("comparative_evaluation_report"));
          if (identity.required === true && (!receiptBindingsValid || !comparativeBindingsValid)) {
            issues.push(issue("critical", "CYCLE_ORDER_IDENTITY_PURPOSE_BINDING_INVALID", "$.trust_policy_admission.identity_assurance.evidence", "Every verifier counted for a purpose quorum requires matching authenticated identity evidence."));
          }
          for (const [index, item] of evidence.entries()) {
            const ref = item.evidence_ref || {};
            if (ref.artifact_id === "none" || path.isAbsolute(ref.relative_path || "") || String(ref.relative_path || "").split(/[\\/]+/).includes("..")) {
              issues.push(issue("critical", "CYCLE_ORDER_IDENTITY_REFERENCE_INVALID", `$.trust_policy_admission.identity_assurance.evidence[${index}].evidence_ref`, "Identity evidence must cite an exact repository-artifact-relative manifest reference."));
            }
            if (!isValidDate(item.issued_at) || !isValidDate(item.valid_until) ||
                Date.parse(item.issued_at) > Date.parse(admission.evaluated_at) || Date.parse(item.valid_until) <= Date.parse(admission.evaluated_at) ||
                (isValidDate(admission.valid_until) && Date.parse(admission.valid_until) > Date.parse(item.valid_until))) {
              issues.push(issue("critical", "CYCLE_ORDER_IDENTITY_WINDOW_INVALID", `$.trust_policy_admission.identity_assurance.evidence[${index}]`, "Identity evidence must be active at admission and bound the admission validity window."));
            }
          }
          if (identity.required !== true && (identity.satisfied !== true || evidence.length !== 0 ||
              identity.authenticated_verifier_count !== 0 || identity.distinct_trust_domain_count !== 0 ||
              (genericIdentity && identity.distinct_identity_authority_count !== 0) ||
              identity.transparency_log_count !== 0 || (identity.blocking_codes || []).length !== 0)) {
            issues.push(issue("error", "CYCLE_ORDER_IDENTITY_NOOP_MISMATCH", "$.trust_policy_admission.identity_assurance", "A policy-only admission requires an explicit empty, satisfied identity no-op."));
          }
          if ((identity.blocking_codes || []).some(code => !(admission.blocking_codes || []).includes(code))) {
            issues.push(issue("critical", "CYCLE_ORDER_IDENTITY_BLOCK_NOT_PROPAGATED", "$.trust_policy_admission.blocking_codes", "Identity-admission blocking codes must propagate to the trust admission."));
          }
        }
      }
      if (["0.5", "0.6"].includes(payload.schema_version)) {
        const challenge = admission.challenge_assurance || {};
        const responses = challenge.responses || [];
        const responderIds = responses.map(item => item.verifier_id);
        const responseByVerifier = new Map(responses.map(item => [item.verifier_id, item]));
        const expectedChallengeSatisfied = challenge.required === true &&
          (challenge.blocking_codes || []).length === 0 && receipt.satisfied === true && comparative.satisfied === true;
        if (!admission.challenge_assurance) {
          issues.push(issue("critical", "CYCLE_ORDER_CHALLENGE_ADMISSION_REQUIRED", "$.trust_policy_admission.challenge_assurance", "Cycle-order v0.5 requires an explicit pre-dispatch challenge projection."));
        } else {
          if (challenge.responder_count !== responses.length || new Set(responderIds).size !== responses.length) {
            issues.push(issue("critical", "CYCLE_ORDER_CHALLENGE_RESPONSE_COUNT_MISMATCH", "$.trust_policy_admission.challenge_assurance", "Challenge responder counts must equal distinct response evidence bindings."));
          }
          if (challenge.satisfied !== expectedChallengeSatisfied || challenge.required !== true) {
            issues.push(issue("critical", "CYCLE_ORDER_CHALLENGE_FALSE_SATISFACTION", "$.trust_policy_admission.challenge_assurance", "Challenge satisfaction requires a valid response from every verifier counted in each required quorum."));
          }
          if (challenge.satisfied === true && (challenge.challenge_ref || {}).artifact_id === "none") {
            issues.push(issue("critical", "CYCLE_ORDER_CHALLENGE_REFERENCE_INVALID", "$.trust_policy_admission.challenge_assurance.challenge_ref", "Satisfied challenge admission requires an exact challenge-set reference."));
          }
          const requiredResponders = new Set([...(receipt.verifier_ids || []), ...(comparative.verifier_ids || [])]);
          if ([...requiredResponders].some(id => !responseByVerifier.has(id))) {
            issues.push(issue("critical", "CYCLE_ORDER_CHALLENGE_PURPOSE_BINDING_INVALID", "$.trust_policy_admission.challenge_assurance.responses", "Every verifier counted in a required quorum must have a challenge response."));
          }
          for (const [index, response] of responses.entries()) {
            const ref = response.identity_evidence_ref || {};
            if (path.isAbsolute(ref.relative_path || "") || String(ref.relative_path || "").split(/[\\/]+/).includes("..") ||
                !isValidDate(response.responded_at) || (isValidDate(challenge.issued_at) && Date.parse(response.responded_at) < Date.parse(challenge.issued_at)) ||
                (isValidDate(challenge.valid_until) && Date.parse(response.responded_at) >= Date.parse(challenge.valid_until))) {
              issues.push(issue("critical", "CYCLE_ORDER_CHALLENGE_RESPONSE_INVALID", `$.trust_policy_admission.challenge_assurance.responses[${index}]`, "Challenge responses require an exact identity-evidence reference inside the challenge window."));
            }
          }
          if ((challenge.blocking_codes || []).some(code => !(admission.blocking_codes || []).includes(code))) {
            issues.push(issue("critical", "CYCLE_ORDER_CHALLENGE_BLOCK_NOT_PROPAGATED", "$.trust_policy_admission.blocking_codes", "Challenge-admission blocking codes must propagate to trust admission."));
          }
        }
      }
      if (payload.schema_version === "0.6") {
        const independence = admission.independence_assurance || {};
        const bindings = independence.bindings || [];
        const domains = independence.domains || [];
        const trustPolicyId = admissionTrustRef.artifact_id;
        const profiles = [...new Map(bindings.map(binding => [binding.profile_id, {
          id: binding.profile_id,
          independence: binding.claims
        }])).values()];
        const projected = computeVerifierIndependence({
          schema_version: "0.6",
          id: trustPolicyId,
          independence_assurance: {
            required: true,
            correlation_rule: "shared_required_component",
            required_dimensions: independence.required_dimensions,
            minimum_independent_domains: independence.minimum_independent_domains
          },
          quorum: { minimum_independence_groups: requirements.minimum_independence_groups },
          verifiers: bindings.map(binding => ({ id: binding.verifier_id, status: "active" }))
        }, {
          schema_version: "0.2",
          type: "VerifierRuntimePolicy",
          id: "VRP-projection",
          trust_policy_id: trustPolicyId,
          profiles,
          assignments: bindings.map(binding => ({ verifier_id: binding.verifier_id, profile_id: binding.profile_id }))
        });
        const bindingIds = bindings.map(binding => binding.verifier_id);
        const domainIds = new Set(domains.map(domain => domain.domain_id));
        const allQuorumBindings = [...(receipt.verifier_ids || []), ...(comparative.verifier_ids || [])];
        const bindingByVerifier = new Map(bindings.map(binding => [binding.verifier_id, binding]));
        const quorumDomainsMatch = allQuorumBindings.every(verifierId => {
          const binding = bindingByVerifier.get(verifierId);
          const quorums = [receipt, comparative].filter(quorum => (quorum.verifier_ids || []).includes(verifierId));
          return binding && quorums.every(quorum => (quorum.independence_groups || []).includes(binding.domain_id));
        });
        if (!admission.independence_assurance || !exactDimensions(independence.required_dimensions) ||
            independence.required !== true || new Set(bindingIds).size !== bindings.length ||
            independence.domain_count !== domains.length || !domains.every(domain => domainIds.has(domain.domain_id)) ||
            !sameJson(domains, projected.domains) || !sameJson(bindings, projected.bindings)) {
          issues.push(issue("critical", "CYCLE_ORDER_INDEPENDENCE_PROJECTION_INVALID", "$.trust_policy_admission.independence_assurance", "Cycle-order v0.6 must reproduce the runtime-policy correlation graph and its deterministic failure domains exactly."));
        }
        if (independence.minimum_independent_domains !== projected.minimum_independent_domains ||
            independence.satisfied !== projected.satisfied ||
            !sameJson(independence.blocking_codes || [], projected.blocking_codes) || !quorumDomainsMatch) {
          issues.push(issue("critical", "CYCLE_ORDER_INDEPENDENCE_FALSE_SATISFACTION", "$.trust_policy_admission.independence_assurance", "Independence satisfaction and quorum groups must derive from verified failure-domain bindings."));
        }
        if ((independence.blocking_codes || []).some(code => !(admission.blocking_codes || []).includes(code))) {
          issues.push(issue("critical", "CYCLE_ORDER_INDEPENDENCE_BLOCK_NOT_PROPAGATED", "$.trust_policy_admission.blocking_codes", "Independence blocking codes must propagate to trust admission."));
        }
      }
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

  if (type === "model-registry") {
    const profiles = payload.profiles || [];
    const profileIds = new Set();
    const registryTime = Date.parse(payload.created_at);

    if (/^(latest|current|default)$/i.test(String(payload.registry_version || "").trim())) {
      issues.push(issue("critical", "MODEL_REGISTRY_FLOATING_VERSION", "$.registry_version", "Registry versions must identify an immutable snapshot."));
    }

    for (const [index, profile] of profiles.entries()) {
      const pointer = `$.profiles[${index}]`;
      if (profileIds.has(profile.id)) {
        issues.push(issue("critical", "MODEL_REGISTRY_DUPLICATE_PROFILE", `${pointer}.id`, "Model registry profile IDs must be unique."));
      }
      profileIds.add(profile.id);
      for (const field of ["model_version", "harness_version", "system_prompt_version", "tool_schema_version"]) {
        if (/^(latest|current|default)$/i.test(String(profile[field] || "").trim())) {
          issues.push(issue("critical", "MODEL_REGISTRY_FLOATING_IDENTITY", `${pointer}.${field}`, "Registry identity fields must use immutable versions."));
        }
      }
      if (/api[_-]?key|token|password|private[_-]?key|plaintext[_-]?secret/i.test(String(profile.endpoint_ref || ""))) {
        issues.push(issue("critical", "MODEL_REGISTRY_SECRET_IN_ENDPOINT_REF", `${pointer}.endpoint_ref`, "Endpoint references must not contain credentials or secret values."));
      }
      const tasks = new Set();
      for (const [taskIndex, readiness] of (profile.task_readiness || []).entries()) {
        const taskPointer = `${pointer}.task_readiness[${taskIndex}]`;
        if (tasks.has(readiness.task)) {
          issues.push(issue("error", "MODEL_REGISTRY_DUPLICATE_TASK_READINESS", `${taskPointer}.task`, "A profile may have only one readiness record per task."));
        }
        tasks.add(readiness.task);
        if (["T", "P"].includes(readiness.readiness_rating) && !hasSubstantiveItems(readiness.evidence)) {
          issues.push(issue("critical", "MODEL_REGISTRY_READY_WITHOUT_EVIDENCE", `${taskPointer}.evidence`, "T/P readiness requires substantive evaluation evidence."));
        }
        if (!isValidDate(readiness.evaluated_at) || !isValidDate(readiness.expires_at) || !isBefore(readiness.evaluated_at, readiness.expires_at)) {
          issues.push(issue("critical", "MODEL_REGISTRY_INVALID_EVALUATION_WINDOW", taskPointer, "Readiness evaluation must expire after it was evaluated."));
        }
        if (["T", "P"].includes(readiness.readiness_rating) && !Number.isNaN(registryTime) && Date.parse(readiness.expires_at) <= registryTime) {
          issues.push(issue("critical", "MODEL_REGISTRY_EXPIRED_READINESS", `${taskPointer}.expires_at`, "Expired readiness cannot remain T/P in the active registry."));
        }
      }
    }
    if (!payload.governance || !["S4", "COS", "COMMANDER"].includes(payload.governance.owner_role)) {
      issues.push(issue("error", "MODEL_REGISTRY_INVALID_OWNER", "$.governance.owner_role", "Model registry governance must be owned by sustainment or command authority."));
    }
    if (!payload.governance || payload.governance.human_final_decision_authority !== true) {
      issues.push(issue("critical", "MODEL_REGISTRY_HUMAN_AUTHORITY_MISSING", "$.governance.human_final_decision_authority", "Registry governance must preserve human final decision authority."));
    }
  }

  if (type === "model-assignment-request") {
    const mission = payload.mission_profile || {};
    const billets = payload.billet_requirements || [];
    const weights = payload.selection_policy && payload.selection_policy.weights;
    const highImpact = ["high", "critical"].includes(mission.risk_level)
      || mission.roe_class === "Red"
      || ["final_output", "external_release"].includes(mission.release_target)
      || mission.tool_impact === "irreversible_mutation";
    const billetIds = new Set();

    if (/^(latest|current|default)$/i.test(String(payload.registry_version || "").trim())) {
      issues.push(issue("critical", "MODEL_REQUEST_REGISTRY_VERSION_FLOATING", "$.registry_version", "Assignment requests must target an immutable registry snapshot."));
    }

    if (weights && Object.values(weights).reduce((sum, value) => sum + value, 0) !== 100) {
      issues.push(issue("critical", "MODEL_REQUEST_WEIGHTS_NOT_100", "$.selection_policy.weights", "Selection weights must total 100."));
    }
    if (payload.classification !== mission.classification) {
      issues.push(issue("critical", "MODEL_REQUEST_CLASSIFICATION_MISMATCH", "$.classification", "Request and mission profile classifications must match."));
    }
    if (mission.roe_class === "Black") {
      issues.push(issue("critical", "MODEL_REQUEST_BLACK_PROHIBITED", "$.mission_profile.roe_class", "Black missions cannot be compiled into executable model assignments."));
    }
    for (const [index, billet] of billets.entries()) {
      const pointer = `$.billet_requirements[${index}]`;
      if (billetIds.has(billet.id)) {
        issues.push(issue("error", "MODEL_REQUEST_DUPLICATE_BILLET", `${pointer}.id`, "Billet requirement IDs must be unique."));
      }
      billetIds.add(billet.id);
      if (!["T", "P"].includes(billet.required_readiness)) {
        issues.push(issue("critical", "MODEL_REQUEST_UNREADY_TARGET", `${pointer}.required_readiness`, "Executable billet requirements must target T or P readiness."));
      }
      if ((CLASSIFICATION_RANK[billet.context_scope] ?? 99) > (CLASSIFICATION_RANK[mission.classification] ?? -1)) {
        issues.push(issue("critical", "MODEL_REQUEST_CONTEXT_EXCEEDS_MISSION", `${pointer}.context_scope`, "Billet context cannot exceed the mission classification."));
      }
      if (["command", "sof", "assurance"].includes(billet.force_class) && billet.fallback_depth < 2) {
        issues.push(issue("critical", "MODEL_REQUEST_CRITICAL_BILLET_WITHOUT_DEPTH", `${pointer}.fallback_depth`, "Command, SOF, and assurance billets require alternate and contingency depth."));
      }
    }
    if (!hasSubstantiveItems(payload.constraints && payload.constraints.allowed_deployment_boundaries)) {
      issues.push(issue("critical", "MODEL_REQUEST_WITHOUT_DEPLOYMENT_BOUNDARY", "$.constraints.allowed_deployment_boundaries", "Assignment request requires approved deployment boundaries."));
    }
    const routerBillet = billets.find(item => item.task === (payload.constraints && payload.constraints.router_task));
    if (!routerBillet || !["T", "P"].includes(payload.constraints && payload.constraints.router_required_readiness)) {
      issues.push(issue("critical", "MODEL_REQUEST_WITHOUT_READY_ROUTER", "$.constraints", "Assignment request requires a T/P router billet."));
    }
    if (highImpact && !billets.some(item => item.force_class === "command" || item.force_class === "sof")) {
      issues.push(issue("critical", "MODEL_REQUEST_MISSING_COMMAND", "$.billet_requirements", "High-impact assignment requires command or SOF integration."));
    }
    if (highImpact && (!payload.assurance || payload.assurance.required !== true)) {
      issues.push(issue("critical", "MODEL_REQUEST_REQUIRES_ASSURANCE", "$.assurance.required", "High-impact assignment requires independent assurance."));
    }
    if (payload.assurance && payload.assurance.required === true && !billets.some(item => item.force_class === "assurance")) {
      issues.push(issue("critical", "MODEL_REQUEST_MISSING_ASSURANCE_BILLET", "$.billet_requirements", "Required assurance needs an assurance billet."));
    }
    if (payload.assurance && payload.assurance.required === true && !hasSubstantiveItems(payload.assurance.deterministic_checks)) {
      issues.push(issue("critical", "MODEL_REQUEST_WITHOUT_DETERMINISTIC_CHECKS", "$.assurance.deterministic_checks", "Assurance requires deterministic checks."));
    }
    if (!payload.authority || payload.authority.inherited_from_model !== false) {
      issues.push(issue("critical", "MODEL_REQUEST_AUTHORITY_FROM_MODEL", "$.authority.inherited_from_model", "Model capability cannot create authority."));
    }
    if (!payload.authority || payload.authority.human_final_decision_authority !== true || !hasSubstantiveItems(payload.authority.commander_retained_decisions)) {
      issues.push(issue("critical", "MODEL_REQUEST_HUMAN_AUTHORITY_MISSING", "$.authority", "Human final decision authority and retained decisions are required."));
    }
  }

  if (type === "integrated-mission-preflight") {
    const pathFields = ["model_registry_path", "model_assignment_request_path", "routing_bundle_path"];
    for (const field of pathFields) {
      const value = payload[field];
      if (typeof value !== "string" || path.isAbsolute(value) || value.split(/[\\/]+/).includes("..")) {
        issues.push(issue("critical", "INTEGRATED_PREFLIGHT_PATH_TRAVERSAL", `$.${field}`, "Integrated preflight paths must stay inside the repository."));
      }
    }
    const bindings = payload.agent_bindings || [];
    for (const [field, code] of [
      ["agent_id", "INTEGRATED_PREFLIGHT_DUPLICATE_AGENT"],
      ["billet_id", "INTEGRATED_PREFLIGHT_DUPLICATE_BILLET"],
      ["routing_receipt_id", "INTEGRATED_PREFLIGHT_DUPLICATE_RECEIPT"]
    ]) {
      const values = bindings.map(item => item[field]);
      if (new Set(values).size !== values.length) {
        issues.push(issue("critical", code, "$.agent_bindings", `Integrated preflight ${field} bindings must be one-to-one.`));
      }
    }
    const controls = payload.dispatch_controls || {};
    if (controls.require_ready_routing !== true || controls.require_ready_model_assignment !== true) {
      issues.push(issue("critical", "INTEGRATED_PREFLIGHT_BYPASS", "$.dispatch_controls", "Routing and model assignment must both be ready before dispatch."));
    }
    if (controls.human_final_decision_authority !== true) {
      issues.push(issue("critical", "INTEGRATED_PREFLIGHT_HUMAN_AUTHORITY_MISSING", "$.dispatch_controls.human_final_decision_authority", "Integrated preflight must preserve human final decision authority."));
    }
  }

  if (type === "model-usage-event") {
    for (const field of ["registry_version", "model_version", "harness_version", "system_prompt_version", "tool_schema_version"]) {
      if (/^(latest|current|default)$/i.test(String(payload[field] || "").trim())) {
        issues.push(issue("critical", "MODEL_USAGE_FLOATING_VERSION", `$.${field}`, "Usage telemetry requires immutable model, harness, prompt, and tool-schema versions."));
      }
    }
    if (!hasSubstantiveItems(payload.authority_scope_snapshot)) {
      issues.push(issue("critical", "MODEL_USAGE_WITHOUT_AUTHORITY_SNAPSHOT", "$.authority_scope_snapshot", "Usage telemetry must preserve the dispatched authority scope."));
    }
    if (!hasSubstantiveItems(payload.evidence) || (payload.evidence || []).every(item => /self[- ]?(approval|confidence)|model self/i.test(item))) {
      issues.push(issue("critical", "MODEL_USAGE_WITHOUT_EXTERNAL_EVIDENCE", "$.evidence", "Usage telemetry requires routing, preflight, test, or other external evidence."));
    }
    if (["failed", "blocked"].includes(payload.event_type) && !hasSubstantiveItems(payload.failure_codes)) {
      issues.push(issue("error", "MODEL_USAGE_FAILURE_WITHOUT_CODE", "$.failure_codes", "Failed or blocked usage events require failure codes."));
    }
    if (["escalated", "fallback_activated"].includes(payload.event_type)) {
      if (!payload.previous_profile_id || !payload.next_profile_id || payload.previous_profile_id === payload.next_profile_id) {
        issues.push(issue("critical", "MODEL_USAGE_INVALID_TRANSITION", "$", "Escalation and fallback events require distinct previous and next profiles."));
      }
    }
  }

  if (type === "repository-artifact-manifest") {
    const repository = payload.repository || {};
    const expectedNamespace = `repositories/${repository.key || "missing"}`;
    const artifacts = payload.artifacts || [];
    if (payload.namespace_root !== expectedNamespace) {
      issues.push(issue("critical", "REPOSITORY_ARTIFACT_NAMESPACE_MISMATCH", "$.namespace_root", "Manifest namespace must match the repository identity key."));
    }
    if (payload.artifact_count !== artifacts.length) {
      issues.push(issue("error", "REPOSITORY_ARTIFACT_COUNT_MISMATCH", "$.artifact_count", "Manifest artifact_count must match the artifact entry count."));
    }
    if (!Number.isInteger(payload.manifest_revision) || payload.manifest_revision < artifacts.length) {
      issues.push(issue("error", "REPOSITORY_ARTIFACT_REVISION_INVALID", "$.manifest_revision", "Manifest revision must be monotonic and cannot be lower than the retained artifact count."));
    }
    if (!payload.isolation || payload.isolation.cross_process_manifest_lock !== true || payload.isolation.stale_lock_recovery_fail_closed !== true ||
        payload.isolation.cross_process_manifest_lease !== true || payload.isolation.fencing_tokens !== true || payload.isolation.write_ahead_journal !== true) {
      issues.push(issue("critical", "REPOSITORY_ARTIFACT_CONCURRENCY_GUARD_MISSING", "$.isolation", "Repository artifact manifests require a lease, fencing tokens, write-ahead journal, and fail-closed recovery."));
    }
    if (!payload.coordination || !Number.isInteger(payload.coordination.fencing_token) || payload.coordination.fencing_token < 1) {
      issues.push(issue("critical", "REPOSITORY_ARTIFACT_FENCING_TOKEN_MISSING", "$.coordination", "Manifest commits require a positive fencing token from the committing lease."));
    }
    const integrity = payload.integrity || {};
    if (!Number.isInteger(integrity.history_start_revision) || !Number.isInteger(integrity.history_length) ||
        integrity.history_start_revision + integrity.history_length - 1 !== payload.manifest_revision) {
      issues.push(issue("error", "REPOSITORY_ARTIFACT_HISTORY_RANGE_INVALID", "$.integrity", "Manifest history start and length must terminate at the current revision."));
    }
    if (integrity.pending_transaction_count !== 0) {
      issues.push(issue("critical", "REPOSITORY_ARTIFACT_PENDING_TRANSACTION", "$.integrity.pending_transaction_count", "A committed manifest cannot claim pending transactions."));
    }
    if (integrity.canonical_manifest_sha256 !== canonicalDigestWithout(payload, ["integrity", "canonical_manifest_sha256"])) {
      issues.push(issue("critical", "REPOSITORY_ARTIFACT_MANIFEST_DIGEST_INVALID", "$.integrity.canonical_manifest_sha256", "Manifest canonical digest does not match its content."));
    }
    const paths = new Set();
    for (const [index, artifact] of artifacts.entries()) {
      const pointer = `$.artifacts[${index}].relative_path`;
      const relativePath = String(artifact.relative_path || "").replace(/\\/g, "/");
      if (path.isAbsolute(relativePath) || /^[A-Za-z]:\//.test(relativePath) || relativePath.split("/").includes("..")) {
        issues.push(issue("critical", "REPOSITORY_ARTIFACT_PATH_TRAVERSAL", pointer, "Artifact paths must be relative and cannot traverse namespaces."));
      }
      const expectedPrefix = `${expectedNamespace}/missions/${artifact.mission_id}/${artifact.wave_id}/${artifact.kind}/`;
      if (!relativePath.startsWith(expectedPrefix)) {
        issues.push(issue("critical", "REPOSITORY_ARTIFACT_CROSS_REPOSITORY_PATH", pointer, "Every artifact path must remain inside its repository, mission, wave, and kind namespace."));
      }
      if (path.posix.basename(relativePath) !== artifact.file_name || !String(artifact.file_name || "").startsWith(`${artifact.artifact_id}.`)) {
        issues.push(issue("error", "REPOSITORY_ARTIFACT_ID_PATH_MISMATCH", pointer, "Artifact filename must match file_name and begin with artifact_id."));
      }
      if (paths.has(relativePath)) {
        issues.push(issue("error", "REPOSITORY_ARTIFACT_DUPLICATE_PATH", pointer, "Manifest artifact paths must be unique."));
      }
      paths.add(relativePath);
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

function validatePayload(payload, type) {
  if (!TYPE_TO_SCHEMA[type]) throw new Error(`Unknown payload type: ${type}`);
  const schemas = loadSchemas();
  const schema = schemas[TYPE_TO_SCHEMA[type]];
  const issues = [
    ...validateSchema(payload, schema, schemas).map(item => ({ ...item, layer: "schema" })),
    ...semanticRules(payload, type).map(item => ({ ...item, layer: "semantic" }))
  ];
  const severity = maxSeverity(issues);
  return {
    valid: !issues.some(item => item.severity === "error" || item.severity === "critical"),
    can_execute: !issues.some(item => item.severity === "error" || item.severity === "critical"),
    max_severity: severity,
    issue_count: issues.length,
    issues
  };
}

function main() {
  const [, , payloadArg, typeArg] = process.argv;
  if (!payloadArg || !typeArg || !TYPE_TO_SCHEMA[typeArg]) {
    console.error(`Usage: node validator-cli-prototype/validate.js <payload.json> <${Object.keys(TYPE_TO_SCHEMA).join("|")}>`);
    process.exit(2);
  }

  try {
    const payloadPath = path.resolve(process.cwd(), payloadArg);
    const payload = readJson(payloadPath);
    const result = validatePayload(payload, typeArg);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { validatePayload };
