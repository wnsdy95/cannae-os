#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { validatePayload, validateSchemaPayload } = require("./validator-cli-prototype/validate");
const DEFINITIONS = require("./schema-files/common.schema.json").$defs;

const AUTHORITY_LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function levelAtLeast(actual, minimum) {
  return AUTHORITY_LEVELS.includes(actual) && AUTHORITY_LEVELS.includes(minimum) &&
    AUTHORITY_LEVELS.indexOf(actual) >= AUTHORITY_LEVELS.indexOf(minimum);
}

function documentDecision(document, role, duty, authorityLevel) {
  if (!document || !DEFINITIONS.role_id.enum.includes(role) ||
      typeof duty !== "string" || !duty.trim() ||
      !AUTHORITY_LEVELS.includes(authorityLevel) ||
      !AUTHORITY_LEVELS.includes(document.minimum_authority_level) ||
      !DEFINITIONS.classification.enum.includes(document.classification) ||
      !["raw", "summary", "reference_only"].includes(document.delivery_mode) ||
      !Array.isArray(document.allowed_roles) || !Array.isArray(document.duties)) {
    return { allowed: false, reason: "invalid_access_context" };
  }
  if (!document.allowed_roles.includes(role)) {
    return { allowed: false, reason: "role_not_allowed" };
  }
  if (!((document.duties || []).includes(duty) || (document.duties || []).includes("mission_common"))) {
    return { allowed: false, reason: "duty_not_allowed" };
  }
  if (!levelAtLeast(authorityLevel, document.minimum_authority_level)) {
    return { allowed: false, reason: "authority_too_low" };
  }
  if (document.classification === "restricted" && document.delivery_mode === "raw") {
    return { allowed: false, reason: "restricted_raw_blocked" };
  }
  if (document.classification === "sensitive" && document.delivery_mode === "raw" &&
      (document.allowed_roles.includes("EXECUTOR") || document.allowed_roles.length > 3)) {
    return { allowed: false, reason: "sensitive_raw_too_broad" };
  }
  return { allowed: true, reason: "role_duty_authority_match" };
}

function projectDocumentAccess(manifest, role, duty, authorityLevel) {
  const structural = validateSchemaPayload(manifest, "document-access-manifest");
  const validation = structural.valid ? validatePayload(manifest, "document-access-manifest") : structural;
  const preflightBlocks = validation.issues
    .filter(item => ["error", "critical"].includes(item.severity))
    .map(item => `${item.code}: ${item.message}`);
  const controls = structural.valid ? manifest.controls : {};
  const documents = structural.valid ? manifest.documents : [];
  const contextValid = DEFINITIONS.role_id.enum.includes(role) &&
    typeof duty === "string" && Boolean(duty.trim()) && AUTHORITY_LEVELS.includes(authorityLevel);
  if (!contextValid) preflightBlocks.push("DOCUMENT_ACCESS_CONTEXT_INVALID: role, duty and authority must be known and explicit.");

  const profile = (structural.valid && contextValid ? manifest.role_profiles : [])
    .filter(item => item.role === role && item.duty === duty && levelAtLeast(authorityLevel, item.authority_level))
    .sort((left, right) => AUTHORITY_LEVELS.indexOf(right.authority_level) - AUTHORITY_LEVELS.indexOf(left.authority_level))[0];
  if (!profile) preflightBlocks.push(`No role profile for ${role}/${duty}/${authorityLevel}.`);

  let allowedDocuments = [];
  const deniedDocuments = [];
  const needed = new Set(profile ? [...profile.required_documents, ...profile.optional_documents] : []);
  const explicitlyDenied = new Set(profile ? profile.denied_documents : []);
  for (const document of documents) {
    const decision = explicitlyDenied.has(document.path)
      ? { allowed: false, reason: "profile_explicit_deny" }
      : !needed.has(document.path)
        ? { allowed: false, reason: "not_selected_by_profile" }
        : documentDecision(document, role, duty, authorityLevel);
    const projected = {
      path: document.path,
      title: document.title,
      classification: document.classification,
      delivery_mode: decision.allowed ? document.delivery_mode : "denied",
      reason: decision.reason
    };
    if (decision.allowed) allowedDocuments.push(projected);
    else deniedDocuments.push(projected);
  }

  const allowedPaths = new Set(allowedDocuments.filter(item => item.delivery_mode !== "reference_only").map(item => item.path));
  const requiredDocuments = (profile ? profile.required_documents : []).map(pathName => ({
    path: pathName,
    satisfied: allowedPaths.has(pathName)
  }));
  for (const item of requiredDocuments) {
    if (!item.satisfied) preflightBlocks.push(`Required document is not readable: ${item.path}`);
  }

  if (preflightBlocks.length) {
    deniedDocuments.push(...allowedDocuments.map(item => ({ ...item, delivery_mode: "denied", reason: "preflight_blocked" })));
    allowedDocuments = [];
    for (const required of requiredDocuments) required.satisfied = false;
  }

  return {
    schema_version: "0.1",
    type: "DocumentAccessProjection",
    manifest_id: structural.valid ? manifest.id : null,
    mission_id: structural.valid ? manifest.mission_id : null,
    role,
    duty,
    authority_level: authorityLevel,
    authorization_verified: false,
    status: preflightBlocks.length === 0 ? "ready" : "blocked",
    required_documents: requiredDocuments,
    allowed_documents: allowedDocuments,
    denied_documents: deniedDocuments,
    preflight_blocks: preflightBlocks,
    audit_requirements: {
      audit_required: controls.audit_required === true,
      source_of_truth: controls.source_of_truth,
      event_fields: ["manifest_id", "role", "duty", "authority_level", "document_path", "delivery_mode", "timestamp"]
    }
  };
}

function main() {
  const [, , manifestPath, role, duty, authorityLevel] = process.argv;
  if (process.argv.length !== 6 || !manifestPath || !role || !duty || !authorityLevel) {
    console.error("Usage: node document-access-runner.js <manifest.json> <ROLE> <DUTY> <L0-L5>");
    process.exit(2);
  }
  try {
    const manifest = readJson(path.resolve(manifestPath));
    const projection = projectDocumentAccess(manifest, role, duty, authorityLevel);
    process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
    process.exitCode = projection.status === "ready" ? 0 : 1;
  } catch {
    console.error("Document access input could not be evaluated.");
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main();
}

module.exports = { documentDecision, projectDocumentAccess };
