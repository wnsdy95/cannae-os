#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function issue(code, pathName, message) {
  return { code, path: pathName, message };
}

function isValidDate(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isWithinWindow(validFrom, expiresAt, timestamp) {
  return isValidDate(validFrom) &&
    isValidDate(expiresAt) &&
    isValidDate(timestamp) &&
    Date.parse(validFrom) <= Date.parse(timestamp) &&
    Date.parse(timestamp) < Date.parse(expiresAt);
}

function hasSubstantiveItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function evaluateRevocation(approval, event) {
  const issues = [];
  const scope = approval.scope || {};
  const snapshot = event.scope_snapshot || {};

  if (approval.status !== "active") {
    issues.push(issue("APPROVAL_NOT_ACTIVE_BEFORE_REVOCATION", "$.approval_scope.status", "Approval scope must be active before revocation."));
  }
  if (event.approval_scope_id !== approval.id) {
    issues.push(issue("APPROVAL_SCOPE_ID_MISMATCH", "$.revocation_event.approval_scope_id", "Revocation event must reference approval scope id."));
  }
  if (event.mission_id !== approval.mission_id) {
    issues.push(issue("APPROVAL_REVOCATION_MISSION_MISMATCH", "$.revocation_event.mission_id", "Revocation event must stay in the same mission."));
  }
  if (event.approval_request_id !== approval.approval_request_id) {
    issues.push(issue("APPROVAL_REQUEST_ID_MISMATCH", "$.revocation_event.approval_request_id", "Revocation event must reference the source approval request."));
  }
  if (approval.tool_request_id && event.tool_request_id !== approval.tool_request_id) {
    issues.push(issue("TOOL_REQUEST_ID_MISMATCH", "$.revocation_event.tool_request_id", "Revocation event must reference the approved tool request."));
  }
  if (event.revocation_authority !== "COMMANDER") {
    issues.push(issue("APPROVAL_REVOCATION_REQUIRES_COMMANDER", "$.revocation_event.revocation_authority", "Revocation requires Commander authority."));
  }
  if (event.revocation_authority !== approval.granted_by) {
    issues.push(issue("APPROVAL_REVOCATION_AUTHORITY_MISMATCH", "$.revocation_event.revocation_authority", "Revocation authority must match the granting authority."));
  }
  if (event.approval_status_before !== approval.status || snapshot.status_before !== approval.status) {
    issues.push(issue("APPROVAL_REVOCATION_STATUS_MISMATCH", "$.revocation_event.approval_status_before", "Revocation status snapshot must match approval status before revocation."));
  }
  if (event.action !== scope.action) {
    issues.push(issue("APPROVAL_REVOCATION_ACTION_MISMATCH", "$.revocation_event.action", "Revocation action must match approval scope."));
  }
  if (event.tool !== scope.tool) {
    issues.push(issue("APPROVAL_REVOCATION_TOOL_MISMATCH", "$.revocation_event.tool", "Revocation tool must match approval scope."));
  }
  if (event.target !== scope.target) {
    issues.push(issue("APPROVAL_REVOCATION_TARGET_MISMATCH", "$.revocation_event.target", "Revocation target must match approval scope."));
  }
  if (!isWithinWindow(scope.valid_from, scope.expires_at, event.revoked_at)) {
    issues.push(issue("APPROVAL_REVOKED_OUTSIDE_WINDOW", "$.revocation_event.revoked_at", "Revocation must occur inside approval window."));
  }
  if (snapshot.granted_by !== approval.granted_by || snapshot.granted_to !== approval.granted_to) {
    issues.push(issue("APPROVAL_REVOCATION_PARTY_MISMATCH", "$.revocation_event.scope_snapshot", "Snapshot parties must match approval scope."));
  }
  if (snapshot.action !== scope.action || snapshot.tool !== scope.tool || snapshot.target !== scope.target) {
    issues.push(issue("APPROVAL_REVOCATION_SNAPSHOT_SCOPE_MISMATCH", "$.revocation_event.scope_snapshot", "Snapshot scope must match approval scope."));
  }
  if (event.approval_status_after !== "revoked") {
    issues.push(issue("APPROVAL_REVOCATION_NOT_MARKED_REVOKED", "$.revocation_event.approval_status_after", "Revoked approval must be marked revoked after revocation."));
  }
  if (!hasText(event.reason)) {
    issues.push(issue("APPROVAL_REVOCATION_WITHOUT_REASON", "$.revocation_event.reason", "Revocation must state the reason."));
  }
  if (!hasSubstantiveItems(event.evidence)) {
    issues.push(issue("APPROVAL_REVOCATION_WITHOUT_EVIDENCE", "$.revocation_event.evidence", "Revocation must include evidence."));
  }
  if (event.notification_required === true && !hasSubstantiveItems(event.notified_roles)) {
    issues.push(issue("APPROVAL_REVOCATION_WITHOUT_NOTIFICATION", "$.revocation_event.notified_roles", "Revocation requiring notification must list notified roles."));
  }

  return {
    valid: issues.length === 0,
    issue_count: issues.length,
    issues
  };
}

function main() {
  const [, , bundleArg] = process.argv;
  if (!bundleArg) {
    console.error("Usage: node approval-revocation-runner.js <bundle.json>");
    process.exit(2);
  }

  const bundle = readJson(path.resolve(process.cwd(), bundleArg));
  const result = evaluateRevocation(bundle.approval_scope, bundle.revocation_event);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { evaluateRevocation };
