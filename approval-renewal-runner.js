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

function isAfter(left, right) {
  return isValidDate(left) && isValidDate(right) && Date.parse(left) > Date.parse(right);
}

function hasSubstantiveItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function evaluateRenewal(approval, event) {
  const issues = [];
  const scope = approval.scope || {};
  const snapshot = event.scope_snapshot || {};

  if (approval.status !== "active") {
    issues.push(issue("APPROVAL_NOT_ACTIVE_BEFORE_RENEWAL", "$.approval_scope.status", "Approval scope must be active before renewal."));
  }
  if (event.approval_scope_id !== approval.id) {
    issues.push(issue("APPROVAL_SCOPE_ID_MISMATCH", "$.renewal_event.approval_scope_id", "Renewal event must reference approval scope id."));
  }
  if (event.mission_id !== approval.mission_id) {
    issues.push(issue("APPROVAL_RENEWAL_MISSION_MISMATCH", "$.renewal_event.mission_id", "Renewal event must stay in the same mission."));
  }
  if (event.approval_request_id !== approval.approval_request_id) {
    issues.push(issue("APPROVAL_REQUEST_ID_MISMATCH", "$.renewal_event.approval_request_id", "Renewal event must reference the source approval request."));
  }
  if (approval.tool_request_id && event.tool_request_id !== approval.tool_request_id) {
    issues.push(issue("TOOL_REQUEST_ID_MISMATCH", "$.renewal_event.tool_request_id", "Renewal event must reference the approved tool request."));
  }
  if (event.renewal_authority !== "COMMANDER") {
    issues.push(issue("APPROVAL_RENEWAL_REQUIRES_COMMANDER", "$.renewal_event.renewal_authority", "Renewal requires Commander authority."));
  }
  if (event.renewal_authority !== approval.granted_by) {
    issues.push(issue("APPROVAL_RENEWAL_AUTHORITY_MISMATCH", "$.renewal_event.renewal_authority", "Renewal authority must match the granting authority."));
  }
  if (event.approval_status_before !== approval.status || snapshot.status_before !== approval.status) {
    issues.push(issue("APPROVAL_RENEWAL_STATUS_MISMATCH", "$.renewal_event.approval_status_before", "Renewal status snapshot must match approval status before renewal."));
  }
  if (event.action !== scope.action) {
    issues.push(issue("APPROVAL_RENEWAL_ACTION_MISMATCH", "$.renewal_event.action", "Renewal action must match approval scope."));
  }
  if (event.tool !== scope.tool) {
    issues.push(issue("APPROVAL_RENEWAL_TOOL_MISMATCH", "$.renewal_event.tool", "Renewal tool must match approval scope."));
  }
  if (event.target !== scope.target) {
    issues.push(issue("APPROVAL_RENEWAL_TARGET_MISMATCH", "$.renewal_event.target", "Renewal target must match approval scope."));
  }
  if (!isWithinWindow(scope.valid_from, scope.expires_at, event.renewed_at)) {
    issues.push(issue("APPROVAL_RENEWED_OUTSIDE_WINDOW", "$.renewal_event.renewed_at", "Renewal must occur inside the current approval window."));
  }
  if (event.previous_valid_from !== scope.valid_from || event.previous_expires_at !== scope.expires_at) {
    issues.push(issue("APPROVAL_RENEWAL_WINDOW_SNAPSHOT_MISMATCH", "$.renewal_event.previous_expires_at", "Renewal must snapshot the current approval window."));
  }
  if (!isAfter(event.new_expires_at, event.previous_expires_at)) {
    issues.push(issue("APPROVAL_RENEWAL_NOT_EXTENSION", "$.renewal_event.new_expires_at", "Renewal must extend expires_at beyond the previous expiry."));
  }
  if (!isAfter(event.new_expires_at, event.renewed_at)) {
    issues.push(issue("APPROVAL_RENEWAL_EXPIRES_BEFORE_RENEWED_AT", "$.renewal_event.new_expires_at", "Renewed expiry must be after renewed_at."));
  }
  if (snapshot.granted_by !== approval.granted_by || snapshot.granted_to !== approval.granted_to) {
    issues.push(issue("APPROVAL_RENEWAL_PARTY_MISMATCH", "$.renewal_event.scope_snapshot", "Snapshot parties must match approval scope."));
  }
  if (snapshot.action !== scope.action || snapshot.tool !== scope.tool || snapshot.target !== scope.target) {
    issues.push(issue("APPROVAL_RENEWAL_SNAPSHOT_SCOPE_MISMATCH", "$.renewal_event.scope_snapshot", "Snapshot scope must match approval scope."));
  }
  if (event.max_executions_before !== scope.max_executions || event.max_executions_after !== scope.max_executions || snapshot.max_executions !== scope.max_executions) {
    issues.push(issue("APPROVAL_RENEWAL_EXPANDS_EXECUTIONS", "$.renewal_event.max_executions_after", "Renewal must not change max executions; request a new approval instead."));
  }
  if (approval.decision === "approve_once" && event.execution_count_before !== 0) {
    issues.push(issue("APPROVE_ONCE_ALREADY_USED_BEFORE_RENEWAL", "$.renewal_event.execution_count_before", "approve_once renewal must occur before the approval is used."));
  }
  if (event.approval_status_after !== "active") {
    issues.push(issue("APPROVAL_RENEWAL_NOT_MARKED_ACTIVE", "$.renewal_event.approval_status_after", "Renewed approval must remain active after renewal."));
  }
  if (!hasText(event.reason)) {
    issues.push(issue("APPROVAL_RENEWAL_WITHOUT_REASON", "$.renewal_event.reason", "Renewal must state the reason."));
  }
  if (!hasSubstantiveItems(event.evidence)) {
    issues.push(issue("APPROVAL_RENEWAL_WITHOUT_EVIDENCE", "$.renewal_event.evidence", "Renewal must include evidence."));
  }
  if (event.notification_required === true && !hasSubstantiveItems(event.notified_roles)) {
    issues.push(issue("APPROVAL_RENEWAL_WITHOUT_NOTIFICATION", "$.renewal_event.notified_roles", "Renewal requiring notification must list notified roles."));
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
    console.error("Usage: node approval-renewal-runner.js <bundle.json>");
    process.exit(2);
  }

  const bundle = readJson(path.resolve(process.cwd(), bundleArg));
  const result = evaluateRenewal(bundle.approval_scope, bundle.renewal_event);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { evaluateRenewal };
