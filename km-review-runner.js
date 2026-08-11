#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { validatePayload } = require("./validator-cli-prototype/validate");

const SCHEMA_DIR = path.join(__dirname, "schema-files");
const VALID_TIERS = ["A", "B", "C", "D"];
const AUTHORITY_BASIS_TYPES = ["approval_scope", "board_decision", "retained_authority"];
const UNRESOLVED_STATUSES = ["draft", "pending", "in_progress", "blocked"];
const DEFAULT_STALE_AFTER_DAYS = 7;
const DEFAULT_BATTLE_RHYTHM_EVENT = "Next decision board.";
const ID_TOKEN_PATTERN = /[A-Z]+-[A-Za-z0-9_-]+/g;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
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

function resolvePointer(schema, fragment) {
  let current = schema;
  for (const part of fragment.replace(/^\//, "").split("/").filter(Boolean)) {
    current = current && current[part];
  }
  return current || null;
}

function checkSchema(value, schema, schemas, pointer, errors) {
  if (!schema || typeof schema !== "object") return;

  if (schema.$ref) {
    const [file, fragment] = schema.$ref.split("#");
    const target = file ? schemas[file] : null;
    const resolved = fragment ? resolvePointer(target, fragment) : target;
    if (!resolved) {
      errors.push(`${pointer}: cannot resolve schema ref ${schema.$ref}`);
      return;
    }
    checkSchema(value, resolved, schemas, pointer, errors);
    return;
  }

  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${pointer}: expected type ${schema.type}`);
    return;
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${pointer}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${pointer}: must be one of ${schema.enum.join(", ")}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${pointer}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${pointer}: does not match pattern ${schema.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${pointer}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.items) {
      value.forEach((item, index) => checkSchema(item, schema.items, schemas, `${pointer}[${index}]`, errors));
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const name of schema.required || []) {
      if (!(name in value)) errors.push(`${pointer}: missing required property ${name}`);
    }
    const properties = schema.properties || {};
    for (const [name, propertyValue] of Object.entries(value)) {
      if (properties[name]) {
        checkSchema(propertyValue, properties[name], schemas, `${pointer}.${name}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${pointer}: unexpected property ${name}`);
      }
    }
  }
}

function validateAgainstSchema(payload, schemaFileName) {
  const typeBySchema = {
    "decision-log.schema.json": "decision-log",
    "source-record.schema.json": "source-record",
    "handoff-packet.schema.json": "handoff-packet",
    "board-decision.schema.json": "board-decision",
    "approval-scope.schema.json": "approval-scope",
    "authority-matrix.schema.json": "authority-matrix",
    "opord.schema.json": "opord"
  };
  const type = typeBySchema[schemaFileName];
  if (!type) throw new Error(`Unsupported KM schema ${schemaFileName}.`);
  const result = validatePayload(payload, type);
  return {
    valid: result.valid,
    errors: result.issues.map(item => `${item.path}: ${item.message}`),
    issues: result.issues
  };
}

function safeRepositoryFile(repositoryRoot, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 ||
      path.isAbsolute(relativePath) || relativePath.includes("\\") ||
      relativePath.split("/").some(part => !part || part === "." || part === "..")) {
    return false;
  }
  try {
    const root = fs.realpathSync(repositoryRoot);
    const candidate = path.resolve(root, relativePath);
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    const realCandidate = fs.realpathSync(candidate);
    return realCandidate.startsWith(`${root}${path.sep}`);
  } catch (error) {
    return false;
  }
}

function authorityArtifactType(artifact) {
  const mapping = {
    BoardDecision: { basisType: "board_decision", schema: "board-decision.schema.json" },
    APPROVAL_SCOPE: { basisType: "approval_scope", schema: "approval-scope.schema.json" },
    AuthorityMatrix: { basisType: "retained_authority", schema: "authority-matrix.schema.json" },
    OPORD: { basisType: "retained_authority", schema: "opord.schema.json" }
  };
  return artifact && mapping[artifact.type] || null;
}

function buildAuthorityIndex(authorityArtifacts, findings) {
  const index = new Map();
  for (const artifact of authorityArtifacts) {
    const descriptor = authorityArtifactType(artifact);
    if (!descriptor || typeof artifact.id !== "string") {
      findings.push({
        kind: "authority",
        id: artifact && artifact.id || "unknown",
        code: "AUTHORITY_ARTIFACT_UNSUPPORTED",
        message: "Authority artifacts must be a BoardDecision, APPROVAL_SCOPE, AuthorityMatrix, or OPORD contract."
      });
      continue;
    }
    const validation = validateAgainstSchema(artifact, descriptor.schema);
    if (!validation.valid) {
      findings.push({
        kind: "authority",
        id: artifact.id,
        code: "AUTHORITY_ARTIFACT_SCHEMA_INVALID",
        message: `Authority artifact ${artifact.id} failed ${descriptor.schema}: ${validation.errors.join("; ")}`
      });
      continue;
    }
    if (index.has(artifact.id)) {
      findings.push({
        kind: "authority",
        id: artifact.id,
        code: "AUTHORITY_ARTIFACT_DUPLICATE",
        message: `Authority artifact id ${artifact.id} is duplicated.`
      });
      continue;
    }
    index.set(artifact.id, { artifact, basisType: descriptor.basisType });
  }
  return index;
}

function citesAuthorityBasis(entry) {
  const basis = entry.authority_basis;
  return Boolean(
    basis &&
    typeof basis === "object" &&
    AUTHORITY_BASIS_TYPES.includes(basis.basis_type) &&
    String(basis.reference || "").trim()
  );
}

function ageInDays(timestamp, asOf) {
  const decidedAt = new Date(timestamp).getTime();
  if (Number.isNaN(decidedAt)) return null;
  return (asOf.getTime() - decidedAt) / MILLISECONDS_PER_DAY;
}

function reviewKnowledgeManagement(input = {}) {
  const decisionLog = toList(input.decisionLog || input.decision_log);
  const sourceRecords = toList(input.sourceRecords || input.source_records);
  const handoffPacket = input.handoffPacket || input.handoff_packet || null;
  const authorityArtifacts = toList(input.authorityArtifacts || input.authority_artifacts);
  const repositoryRoot = path.resolve(input.repositoryRoot || input.repository_root || __dirname);
  const asOf = new Date(input.asOf || input.as_of || Date.now());
  const staleAfterDays = Number.isFinite(input.staleAfterDays || input.stale_after_days)
    ? (input.staleAfterDays || input.stale_after_days)
    : DEFAULT_STALE_AFTER_DAYS;
  const nextBattleRhythmEvent =
    input.nextBattleRhythmEvent || input.next_battle_rhythm_event || DEFAULT_BATTLE_RHYTHM_EVENT;

  const compliant = [];
  const findings = [];
  const escalations = [];
  const missionId =
    input.missionId ||
    input.mission_id ||
    (decisionLog[0] && decisionLog[0].mission_id) ||
    (handoffPacket && handoffPacket.mission_id) ||
    null;
  const authorityIndex = buildAuthorityIndex(authorityArtifacts, findings);
  const decisionIds = new Set(decisionLog.map(entry => entry.id).filter(Boolean));
  const trackedArtifacts = new Set();

  if (Number.isNaN(asOf.getTime())) {
    findings.push({
      kind: "review",
      id: "as_of",
      code: "KM_AS_OF_INVALID",
      message: "KM review requires a parseable as_of timestamp."
    });
  }
  if (!Number.isFinite(staleAfterDays) || staleAfterDays <= 0) {
    findings.push({
      kind: "review",
      id: "stale_after_days",
      code: "KM_STALE_THRESHOLD_INVALID",
      message: "stale_after_days must be a positive finite number."
    });
  }

  for (const entry of decisionLog) {
    let clean = true;
    const schemaValidation = validateAgainstSchema(entry, "decision-log.schema.json");
    if (!schemaValidation.valid) {
      clean = false;
      findings.push({
        kind: "decision",
        id: entry.id,
        code: "DECISION_SCHEMA_INVALID",
        message: `Decision ${entry.id || "unknown"} failed schema validation: ${schemaValidation.errors.join("; ")}`
      });
    }
    if (missionId && entry.mission_id !== missionId) {
      clean = false;
      findings.push({
        kind: "decision",
        id: entry.id,
        code: "DECISION_MISSION_MISMATCH",
        message: `Decision ${entry.id || "unknown"} belongs to ${entry.mission_id || "no mission"}, expected ${missionId}.`
      });
    }
    if (!citesAuthorityBasis(entry)) {
      clean = false;
      findings.push({
        kind: "decision",
        id: entry.id,
        code: "DECISION_WITHOUT_AUTHORITY_BASIS",
        message: `Decision ${entry.id} must cite an approval scope, board decision, or retained authority reference.`
      });
    } else {
      const resolved = authorityIndex.get(entry.authority_basis.reference);
      if (!resolved || resolved.basisType !== entry.authority_basis.basis_type) {
        clean = false;
        findings.push({
          kind: "decision",
          id: entry.id,
          code: "AUTHORITY_REFERENCE_UNRESOLVED",
          message: `Decision ${entry.id} authority reference ${entry.authority_basis.reference} does not resolve to a validated ${entry.authority_basis.basis_type} artifact.`
        });
      } else if (resolved.artifact.mission_id !== entry.mission_id) {
        clean = false;
        findings.push({
          kind: "decision",
          id: entry.id,
          code: "AUTHORITY_REFERENCE_MISSION_MISMATCH",
          message: `Decision ${entry.id} and authority artifact ${resolved.artifact.id} belong to different missions.`
        });
      }
    }
    const age = Number.isNaN(asOf.getTime()) ? null : ageInDays(entry.decided_at, asOf);
    if (UNRESOLVED_STATUSES.includes(entry.status) && age !== null && age > staleAfterDays) {
      clean = false;
      escalations.push({
        kind: "decision",
        id: entry.id,
        code: "STALE_UNRESOLVED_DECISION",
        message: `Decision ${entry.id} has been unresolved for ${Math.floor(age)} days (threshold ${staleAfterDays}).`,
        route_to: nextBattleRhythmEvent
      });
    }
    for (const artifact of entry.affected_artifacts || []) trackedArtifacts.add(artifact);
    if (clean) {
      compliant.push({ kind: "decision", id: entry.id, note: "Authority basis cited and decision is not stale." });
    }
  }

  for (const record of sourceRecords) {
    let clean = true;
    const schemaValidation = validateAgainstSchema(record, "source-record.schema.json");
    if (!schemaValidation.valid) {
      clean = false;
      findings.push({
        kind: "source",
        id: record.id,
        code: "SOURCE_SCHEMA_INVALID",
        message: `Source ${record.id || "unknown"} failed schema validation: ${schemaValidation.errors.join("; ")}`
      });
    }
    if (!VALID_TIERS.includes(record.tier)) {
      clean = false;
      findings.push({
        kind: "source",
        id: record.id,
        code: "SOURCE_TIER_INVALID",
        message: `Source ${record.id} tier must be one of ${VALID_TIERS.join(", ")}.`
      });
    }
    const linked = (record.linked_documents || []).filter(item => String(item || "").trim());
    if (linked.length === 0) {
      clean = false;
      findings.push({
        kind: "source",
        id: record.id,
        code: "SOURCE_WITHOUT_LINKED_DOCUMENT",
        message: `Source ${record.id} must link at least one local document.`
      });
    }
    for (const document of linked) {
      if (!safeRepositoryFile(repositoryRoot, document)) {
        clean = false;
        findings.push({
          kind: "source",
          id: record.id,
          code: "SOURCE_DOCUMENT_UNRESOLVED",
          message: `Source ${record.id || "unknown"} linked document ${document} does not resolve to a regular file inside the repository root.`
        });
      } else {
        trackedArtifacts.add(document);
      }
    }
    if (clean) {
      compliant.push({ kind: "source", id: record.id, note: "Tier is valid and linked documents are present." });
    }
  }

  if (handoffPacket) {
    let clean = true;
    const schemaValidation = validateAgainstSchema(handoffPacket, "handoff-packet.schema.json");
    if (!schemaValidation.valid) {
      clean = false;
      findings.push({
        kind: "handoff",
        id: handoffPacket.id,
        code: "HANDOFF_SCHEMA_INVALID",
        message: `Handoff ${handoffPacket.id || "unknown"} failed schema validation: ${schemaValidation.errors.join("; ")}`
      });
    }
    if (missionId && handoffPacket.mission_id !== missionId) {
      clean = false;
      findings.push({
        kind: "handoff",
        id: handoffPacket.id,
        code: "HANDOFF_MISSION_MISMATCH",
        message: `Handoff ${handoffPacket.id || "unknown"} belongs to ${handoffPacket.mission_id || "no mission"}, expected ${missionId}.`
      });
    }
    for (const item of handoffPacket.pending_decisions || []) {
      const tokens = String(item).match(ID_TOKEN_PATTERN) || [];
      if (!tokens.some(token => decisionIds.has(token))) {
        clean = false;
        findings.push({
          kind: "handoff",
          id: handoffPacket.id,
          code: "HANDOFF_REFERENCE_UNRESOLVED",
          message: `Handoff pending decision "${item}" does not resolve to a provided decision log entry.`
        });
      }
    }
    for (const file of handoffPacket.source_of_truth_files || []) {
      if (!safeRepositoryFile(repositoryRoot, file)) {
        clean = false;
        findings.push({
          kind: "handoff",
          id: handoffPacket.id,
          code: "HANDOFF_SOURCE_OF_TRUTH_UNRESOLVED",
          message: `Handoff source-of-truth file ${file} does not resolve to a regular file inside the repository root.`
        });
      }
      if (!trackedArtifacts.has(file)) {
        clean = false;
        findings.push({
          kind: "handoff",
          id: handoffPacket.id,
          code: "HANDOFF_SOURCE_OF_TRUTH_UNTRACKED",
          message: `Handoff source-of-truth file ${file} is not covered by the provided decision or source lists.`
        });
      }
    }
    if (clean) {
      compliant.push({ kind: "handoff", id: handoffPacket.id, note: "All handoff references resolve." });
    }
  }

  return {
    schema_version: "0.1",
    type: "KnowledgeManagementReviewProjection",
    mission_id: missionId,
    as_of: Number.isNaN(asOf.getTime()) ? null : asOf.toISOString(),
    stale_after_days: staleAfterDays,
    next_battle_rhythm_event: nextBattleRhythmEvent,
    status: findings.length === 0 && escalations.length === 0 ? "ready" : "blocked",
    counts: {
      decisions: decisionLog.length,
      source_records: sourceRecords.length,
      compliant: compliant.length,
      findings: findings.length,
      escalations: escalations.length
    },
    queues: { compliant, findings, escalations }
  };
}

function main() {
  const args = process.argv.slice(2);
  const positional = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--as-of" || token === "--stale-days" || token === "--next-event" ||
        token === "--authority-artifacts" || token === "--repository-root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        console.error(`${token} requires a value.`);
        process.exit(2);
      }
      if (token === "--as-of") options.asOf = value;
      if (token === "--stale-days") options.staleAfterDays = Number(value);
      if (token === "--next-event") options.nextBattleRhythmEvent = value;
      if (token === "--authority-artifacts") options.authorityArtifacts = toList(readJson(path.resolve(value)));
      if (token === "--repository-root") options.repositoryRoot = path.resolve(value);
      index += 1;
    } else {
      positional.push(token);
    }
  }

  const [decisionLogPath, sourceRecordsPath, handoffPacketPath] = positional;
  if (!decisionLogPath || !sourceRecordsPath) {
    console.error("Usage: node km-review-runner.js <decision-log.json> <source-records.json> [handoff-packet.json] --authority-artifacts <artifacts.json> [--repository-root <path>] [--as-of <timestamp>] [--stale-days <days>] [--next-event <label>]");
    process.exit(2);
  }

  const projection = reviewKnowledgeManagement({
    decisionLog: readJson(path.resolve(decisionLogPath)),
    sourceRecords: readJson(path.resolve(sourceRecordsPath)),
    handoffPacket: handoffPacketPath ? readJson(path.resolve(handoffPacketPath)) : null,
    ...options
  });
  process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
  process.exit(projection.status === "ready" ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { citesAuthorityBasis, reviewKnowledgeManagement, validateAgainstSchema };
