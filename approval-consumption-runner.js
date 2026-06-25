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

function evaluateConsumption(approval, event) {
  const issues = [];
  const scope = approval.scope || {};
  const snapshot = event.scope_snapshot || {};

  if (approval.status !== "active") {
    issues.push(issue("APPROVAL_NOT_ACTIVE_BEFORE_CONSUMPTION", "$.approval_scope.status", "Approval scope must be active before consumption."));
  }
  if (event.approval_scope_id !== approval.id) {
    issues.push(issue("APPROVAL_SCOPE_ID_MISMATCH", "$.consumption_event.approval_scope_id", "Consumption event must reference approval scope id."));
  }
  if (event.mission_id !== approval.mission_id) {
    issues.push(issue("APPROVAL_CONSUMPTION_MISSION_MISMATCH", "$.consumption_event.mission_id", "Consumption event must stay in the same mission."));
  }
  if (event.approval_request_id !== approval.approval_request_id) {
    issues.push(issue("APPROVAL_REQUEST_ID_MISMATCH", "$.consumption_event.approval_request_id", "Consumption event must reference the source approval request."));
  }
  if (approval.tool_request_id && event.tool_request_id !== approval.tool_request_id) {
    issues.push(issue("TOOL_REQUEST_ID_MISMATCH", "$.consumption_event.tool_request_id", "Consumption event must reference the approved tool request."));
  }
  if (event.actor !== approval.granted_to) {
    issues.push(issue("APPROVAL_CONSUMED_BY_WRONG_ACTOR", "$.consumption_event.actor", "Only granted_to may consume this approval."));
  }
  if (event.action !== scope.action) {
    issues.push(issue("APPROVAL_CONSUMPTION_ACTION_MISMATCH", "$.consumption_event.action", "Consumption action must match approval scope."));
  }
  if (event.tool !== scope.tool) {
    issues.push(issue("APPROVAL_CONSUMPTION_TOOL_MISMATCH", "$.consumption_event.tool", "Consumption tool must match approval scope."));
  }
  if (event.target !== scope.target) {
    issues.push(issue("APPROVAL_CONSUMPTION_TARGET_MISMATCH", "$.consumption_event.target", "Consumption target must match approval scope."));
  }
  if (!isWithinWindow(scope.valid_from, scope.expires_at, event.consumed_at)) {
    issues.push(issue("APPROVAL_CONSUMED_OUTSIDE_WINDOW", "$.consumption_event.consumed_at", "Consumption must occur inside approval window."));
  }
  if (snapshot.status_before !== approval.status) {
    issues.push(issue("APPROVAL_SNAPSHOT_STATUS_MISMATCH", "$.consumption_event.scope_snapshot.status_before", "Snapshot status must match approval status before consumption."));
  }
  if (snapshot.action !== scope.action || snapshot.tool !== scope.tool || snapshot.target !== scope.target) {
    issues.push(issue("APPROVAL_SNAPSHOT_SCOPE_MISMATCH", "$.consumption_event.scope_snapshot", "Snapshot scope must match approval scope."));
  }
  if (approval.decision === "approve_once" && event.execution_count_after !== 1) {
    issues.push(issue("APPROVE_ONCE_CONSUMPTION_COUNT_INVALID", "$.consumption_event.execution_count_after", "approve_once must be consumed exactly once."));
  }
  if (event.result === "executed" && event.approval_status_after !== "consumed") {
    issues.push(issue("EXECUTED_APPROVAL_NOT_MARKED_CONSUMED", "$.consumption_event.approval_status_after", "Executed approval must be consumed after execution."));
  }
  if (event.result === "executed" && !hasSubstantiveItems(event.evidence)) {
    issues.push(issue("APPROVAL_CONSUMPTION_WITHOUT_EVIDENCE", "$.consumption_event.evidence", "Executed consumption must include evidence."));
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
    console.error("Usage: node approval-consumption-runner.js <bundle.json>");
    process.exit(2);
  }

  const bundle = readJson(path.resolve(process.cwd(), bundleArg));
  const result = evaluateConsumption(bundle.approval_scope, bundle.consumption_event);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { evaluateConsumption };
