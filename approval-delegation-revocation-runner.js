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

function isAtOrAfter(left, right) {
  return isValidDate(left) && isValidDate(right) && Date.parse(left) >= Date.parse(right);
}

function hasSubstantiveItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sameList(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => item === right[index]);
}

function evaluateDelegationTermination(delegation, event) {
  const issues = [];
  const scope = delegation.delegation_scope || {};
  const snapshot = event.delegation_snapshot || {};

  if (delegation.delegation_status_after !== "active") {
    issues.push(issue("DELEGATION_NOT_ACTIVE_BEFORE_TERMINATION", "$.delegation_event.delegation_status_after", "Delegation must be active before termination."));
  }
  if (event.delegation_event_id !== delegation.id) {
    issues.push(issue("DELEGATION_EVENT_ID_MISMATCH", "$.termination_event.delegation_event_id", "Termination event must reference the delegation event id."));
  }
  if (event.mission_id !== delegation.mission_id) {
    issues.push(issue("DELEGATION_TERMINATION_MISSION_MISMATCH", "$.termination_event.mission_id", "Termination event must stay in the same mission."));
  }
  if (event.authority_matrix_id !== delegation.authority_matrix_id) {
    issues.push(issue("AUTHORITY_MATRIX_ID_MISMATCH", "$.termination_event.authority_matrix_id", "Termination event must reference the same authority matrix."));
  }
  if (event.delegatee !== delegation.delegatee || snapshot.delegatee !== delegation.delegatee) {
    issues.push(issue("DELEGATION_TERMINATION_DELEGATEE_MISMATCH", "$.termination_event.delegatee", "Termination event delegatee must match the delegation."));
  }
  if (event.termination_authority !== delegation.delegator || snapshot.delegator !== delegation.delegator) {
    issues.push(issue("DELEGATION_TERMINATION_AUTHORITY_MISMATCH", "$.termination_event.termination_authority", "Termination authority must match the delegator."));
  }
  if (event.termination_kind === "revoked" && event.termination_authority !== "COMMANDER") {
    issues.push(issue("DELEGATION_REVOCATION_REQUIRES_COMMANDER", "$.termination_event.termination_authority", "Delegation revocation requires Commander authority."));
  }
  if (event.termination_kind === "revoked" && event.actor !== event.termination_authority) {
    issues.push(issue("DELEGATION_REVOCATION_ACTOR_MISMATCH", "$.termination_event.actor", "Revocation actor must be the termination authority."));
  }
  if (event.termination_kind === "expired" && !(event.actor === "RECORDER" || event.actor === event.termination_authority)) {
    issues.push(issue("DELEGATION_EXPIRY_ACTOR_INVALID", "$.termination_event.actor", "Expiry projection must be recorded by RECORDER or the termination authority."));
  }
  if (event.delegation_status_before !== "active") {
    issues.push(issue("DELEGATION_TERMINATION_NOT_ACTIVE", "$.termination_event.delegation_status_before", "Delegation must be active before termination."));
  }
  if (event.delegation_status_after !== event.termination_kind) {
    issues.push(issue("DELEGATION_TERMINATION_STATUS_MISMATCH", "$.termination_event.delegation_status_after", "Delegation status after termination must match termination kind."));
  }
  if (event.termination_kind === "revoked" && !isWithinWindow(scope.valid_from, scope.expires_at, event.terminated_at)) {
    issues.push(issue("DELEGATION_REVOKED_OUTSIDE_WINDOW", "$.termination_event.terminated_at", "Revocation must occur inside the active delegation window."));
  }
  if (event.termination_kind === "expired" && !isAtOrAfter(event.terminated_at, scope.expires_at)) {
    issues.push(issue("DELEGATION_EXPIRY_BEFORE_EXPIRY", "$.termination_event.terminated_at", "Expiry projection must occur at or after delegation expiry."));
  }
  if (snapshot.delegation_type !== delegation.delegation_type ||
    !sameList(snapshot.approving_for_roles, delegation.approving_for_roles) ||
    !sameList(snapshot.delegated_decisions, delegation.delegated_decisions)) {
    issues.push(issue("DELEGATION_TERMINATION_DECISION_SNAPSHOT_MISMATCH", "$.termination_event.delegation_snapshot", "Delegation decision snapshot must match the source delegation."));
  }
  if (!sameList(snapshot.task_scope, scope.task_scope) ||
    snapshot.action !== scope.action ||
    snapshot.tool !== scope.tool ||
    snapshot.target !== scope.target ||
    snapshot.max_roe_class !== scope.max_roe_class ||
    snapshot.max_residual_risk !== scope.max_residual_risk) {
    issues.push(issue("DELEGATION_TERMINATION_SCOPE_MISMATCH", "$.termination_event.delegation_snapshot", "Delegation scope snapshot must match the source delegation."));
  }
  if (snapshot.valid_from !== scope.valid_from ||
    snapshot.expires_at !== scope.expires_at ||
    snapshot.max_approval_duration_minutes !== scope.max_approval_duration_minutes ||
    snapshot.max_approvals !== scope.max_approvals) {
    issues.push(issue("DELEGATION_TERMINATION_LIMITS_MISMATCH", "$.termination_event.delegation_snapshot", "Delegation limits snapshot must match the source delegation."));
  }
  if (!sameList(snapshot.retained_authorities, scope.retained_authorities) ||
    !sameList(snapshot.prohibited_context_classes, scope.prohibited_context_classes)) {
    issues.push(issue("DELEGATION_TERMINATION_GUARDRAIL_MISMATCH", "$.termination_event.delegation_snapshot", "Delegation retained authorities and context guardrails must match the source delegation."));
  }
  if (snapshot.subdelegation_allowed !== delegation.subdelegation_allowed ||
    snapshot.release_review_required_for_sensitive !== delegation.release_review_required_for_sensitive) {
    issues.push(issue("DELEGATION_TERMINATION_CONTROL_MISMATCH", "$.termination_event.delegation_snapshot", "Delegation control flags must match the source delegation."));
  }
  if (!hasText(event.reason)) {
    issues.push(issue("DELEGATION_TERMINATION_WITHOUT_REASON", "$.termination_event.reason", "Termination must state the reason."));
  }
  if (!hasSubstantiveItems(event.evidence)) {
    issues.push(issue("DELEGATION_TERMINATION_WITHOUT_EVIDENCE", "$.termination_event.evidence", "Termination must include evidence."));
  }
  if (event.notification_required === true && !hasSubstantiveItems(event.notified_roles)) {
    issues.push(issue("DELEGATION_TERMINATION_WITHOUT_NOTIFICATION", "$.termination_event.notified_roles", "Termination requiring notification must list notified roles."));
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
    console.error("Usage: node approval-delegation-revocation-runner.js <bundle.json>");
    process.exit(2);
  }

  const bundle = readJson(path.resolve(process.cwd(), bundleArg));
  const result = evaluateDelegationTermination(bundle.delegation_event, bundle.termination_event);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { evaluateDelegationTermination };
