#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const AUTHORITY_LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function levelAtLeast(actual, minimum) {
  return AUTHORITY_LEVELS.indexOf(actual) >= AUTHORITY_LEVELS.indexOf(minimum);
}

function documentDecision(document, role, duty, authorityLevel) {
  if (!(document.allowed_roles || []).includes(role)) {
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
  return { allowed: true, reason: "role_duty_authority_match" };
}

function projectDocumentAccess(manifest, role, duty, authorityLevel) {
  const preflightBlocks = [];
  const controls = manifest.controls || {};
  if (manifest.default_decision !== "deny") preflightBlocks.push("Manifest must default to deny.");
  if (controls.need_to_know !== true) preflightBlocks.push("Manifest must enforce need-to-know.");
  if (controls.no_bulk_read !== true) preflightBlocks.push("Manifest must prohibit bulk read.");
  if (controls.audit_required !== true) preflightBlocks.push("Manifest must require access audit.");
  if (controls.exception_requires_approval !== true) preflightBlocks.push("Manifest exceptions must require approval.");

  const profile = (manifest.role_profiles || [])
    .filter(item => item.role === role && item.duty === duty && levelAtLeast(authorityLevel, item.authority_level))
    .sort((left, right) => AUTHORITY_LEVELS.indexOf(right.authority_level) - AUTHORITY_LEVELS.indexOf(left.authority_level))[0];
  if (!profile) preflightBlocks.push(`No role profile for ${role}/${duty}/${authorityLevel}.`);

  const allowedDocuments = [];
  const deniedDocuments = [];
  for (const document of manifest.documents || []) {
    const decision = documentDecision(document, role, duty, authorityLevel);
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

  const allowedPaths = new Set(allowedDocuments.map(item => item.path));
  const requiredDocuments = (profile ? profile.required_documents : []).map(pathName => ({
    path: pathName,
    satisfied: allowedPaths.has(pathName)
  }));
  for (const item of requiredDocuments) {
    if (!item.satisfied) preflightBlocks.push(`Required document is not readable: ${item.path}`);
  }

  const explicitlyDenied = new Set(profile ? profile.denied_documents : []);
  for (const allowed of allowedDocuments) {
    if (explicitlyDenied.has(allowed.path)) {
      preflightBlocks.push(`Denied document was allowed: ${allowed.path}`);
    }
  }

  return {
    schema_version: "0.1",
    type: "DocumentAccessProjection",
    manifest_id: manifest.id,
    mission_id: manifest.mission_id,
    role,
    duty,
    authority_level: authorityLevel,
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
  if (!manifestPath || !role || !duty || !authorityLevel) {
    console.error("Usage: node document-access-runner.js <manifest.json> <ROLE> <DUTY> <L0-L5>");
    process.exit(2);
  }
  const manifest = readJson(path.resolve(manifestPath));
  process.stdout.write(`${JSON.stringify(projectDocumentAccess(manifest, role, duty, authorityLevel), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { documentDecision, projectDocumentAccess };
