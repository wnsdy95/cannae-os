#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROE_RANK = { Green: 0, Amber: 1, Red: 2, Black: 3 };
const RISK_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function issue(code, pathName, message) {
  return { code, path: pathName, message };
}

function isValidDate(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function hasSubstantiveItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function intersects(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.some(item => right.includes(item));
}

function matchesBaseRule(rule, event) {
  const scope = event.delegation_scope || {};
  return (event.approving_for_roles || []).includes(rule.role) &&
    intersects(scope.task_scope || [], rule.task_scope || []) &&
    (rule.tool_scope || []).includes(scope.tool) &&
    (rule.target_scope || []).includes(scope.target) &&
    rule.decision === "approval_required" &&
    rule.approval_authority === event.delegator;
}

function evaluateDelegation(authorityMatrix, event) {
  const issues = [];
  const scope = event.delegation_scope || {};
  const matchingRules = (authorityMatrix.rules || []).filter(rule => matchesBaseRule(rule, event));

  if (authorityMatrix.id !== event.authority_matrix_id) {
    issues.push(issue("AUTHORITY_MATRIX_ID_MISMATCH", "$.delegation_event.authority_matrix_id", "Delegation event must reference the authority matrix id."));
  }
  if (authorityMatrix.mission_id !== event.mission_id) {
    issues.push(issue("DELEGATION_MISSION_MISMATCH", "$.delegation_event.mission_id", "Delegation event must stay in the same mission."));
  }
  if (event.delegator !== "COMMANDER") {
    issues.push(issue("DELEGATION_REQUIRES_COMMANDER", "$.delegation_event.delegator", "Approval delegation requires Commander authority."));
  }
  if (event.actor !== event.delegator) {
    issues.push(issue("DELEGATION_ACTOR_NOT_DELEGATOR", "$.delegation_event.actor", "Delegation actor must be the delegator."));
  }
  if (event.delegatee === event.delegator) {
    issues.push(issue("DELEGATION_SELF_DELEGATION", "$.delegation_event.delegatee", "Delegator and delegatee must be different roles."));
  }
  if ((event.approving_for_roles || []).includes(event.delegatee)) {
    issues.push(issue("DELEGATEE_CANNOT_APPROVE_SELF_ROLE", "$.delegation_event.approving_for_roles", "Delegatee cannot approve its own role through this delegation."));
  }
  if (matchingRules.length === 0) {
    issues.push(issue("DELEGATION_WITHOUT_BASE_AUTHORITY_RULE", "$.authority_matrix.rules", "Delegation must match an existing approval-required authority rule."));
  }
  for (const rule of matchingRules) {
    if (ROE_RANK[rule.roe_class] > ROE_RANK[scope.max_roe_class]) {
      issues.push(issue("DELEGATION_EXCEEDS_BASE_ROE", "$.delegation_event.delegation_scope.max_roe_class", "Delegation max ROE must cover the base rule without expanding beyond it."));
    }
    if (rule.roe_class === "Red" || rule.roe_class === "Black") {
      issues.push(issue("DELEGATION_BASE_RULE_COMMANDER_RETAINED", "$.authority_matrix.rules", "Red and Black approval rules remain Commander-retained in this prototype."));
    }
  }
  if (scope.max_roe_class === "Red" || scope.max_roe_class === "Black") {
    issues.push(issue("DELEGATION_CANNOT_INCLUDE_COMMANDER_RETAINED_ROE", "$.delegation_event.delegation_scope.max_roe_class", "Delegation cannot include Red or Black approvals."));
  }
  if (RISK_RANK[scope.max_residual_risk] >= RISK_RANK.high) {
    issues.push(issue("DELEGATION_CANNOT_ACCEPT_HIGH_RISK", "$.delegation_event.delegation_scope.max_residual_risk", "High or critical residual risk remains Commander-retained."));
  }
  if (!isValidDate(scope.valid_from) || !isValidDate(scope.expires_at) || Date.parse(scope.expires_at) <= Date.parse(scope.valid_from)) {
    issues.push(issue("DELEGATION_EXPIRY_NOT_AFTER_START", "$.delegation_event.delegation_scope.expires_at", "Delegation expiry must be after valid_from."));
  }
  if (!Number.isInteger(scope.max_approval_duration_minutes) || scope.max_approval_duration_minutes <= 0 || !Number.isInteger(scope.max_approvals) || scope.max_approvals <= 0) {
    issues.push(issue("DELEGATION_WITHOUT_LIMITS", "$.delegation_event.delegation_scope", "Delegation must include positive duration and approval-count limits."));
  }
  if (event.subdelegation_allowed === true) {
    issues.push(issue("DELEGATION_ALLOWS_SUBDELEGATION", "$.delegation_event.subdelegation_allowed", "Delegated approval authority cannot be subdelegated."));
  }
  if (!hasSubstantiveItems(scope.retained_authorities)) {
    issues.push(issue("DELEGATION_WITHOUT_RETAINED_AUTHORITIES", "$.delegation_event.delegation_scope.retained_authorities", "Delegation must state Commander-retained authorities."));
  }
  if (!(scope.prohibited_context_classes || []).includes("restricted")) {
    issues.push(issue("DELEGATION_WITHOUT_RESTRICTED_CONTEXT_GUARD", "$.delegation_event.delegation_scope.prohibited_context_classes", "Delegation must prohibit restricted context release."));
  }
  if (event.release_review_required_for_sensitive !== true) {
    issues.push(issue("DELEGATION_SENSITIVE_RELEASE_WITHOUT_REVIEW", "$.delegation_event.release_review_required_for_sensitive", "Delegation must preserve release review for sensitive context."));
  }
  if (event.requires_backbrief !== true) {
    issues.push(issue("DELEGATION_WITHOUT_BACKBRIEF", "$.delegation_event.requires_backbrief", "Delegated approval should require a backbrief."));
  }
  if (event.requires_post_action_evidence !== true) {
    issues.push(issue("DELEGATION_WITHOUT_POST_ACTION_EVIDENCE", "$.delegation_event.requires_post_action_evidence", "Delegated approval must require post-action evidence."));
  }
  if (event.delegation_status_after !== "active") {
    issues.push(issue("DELEGATION_NOT_MARKED_ACTIVE", "$.delegation_event.delegation_status_after", "Delegation creation must leave the delegation active."));
  }
  if (event.notification_required === true && !hasSubstantiveItems(event.notified_roles)) {
    issues.push(issue("DELEGATION_WITHOUT_NOTIFICATION", "$.delegation_event.notified_roles", "Delegation requiring notification must list notified roles."));
  }
  if (!hasText(event.reason)) {
    issues.push(issue("DELEGATION_WITHOUT_REASON", "$.delegation_event.reason", "Delegation must state the reason."));
  }
  if (!hasSubstantiveItems(event.evidence)) {
    issues.push(issue("DELEGATION_WITHOUT_EVIDENCE", "$.delegation_event.evidence", "Delegation must include evidence."));
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
    console.error("Usage: node approval-delegation-runner.js <bundle.json>");
    process.exit(2);
  }

  const bundle = readJson(path.resolve(process.cwd(), bundleArg));
  const result = evaluateDelegation(bundle.authority_matrix, bundle.delegation_event);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { evaluateDelegation };
