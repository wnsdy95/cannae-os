#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { decide: decidePolicy } = require("./policy-engine-prototype/policy-engine");
const { decide: decideReadiness } = require("./readiness-gate-prototype/readiness-gate");

const HIGH_RISK = new Set(["high", "critical"]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isValidDate(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isWithinWindow(validFrom, expiresAt, now) {
  const nowTime = Date.parse(now);
  return isValidDate(validFrom) &&
    isValidDate(expiresAt) &&
    Date.parse(validFrom) <= nowTime &&
    nowTime < Date.parse(expiresAt);
}

function scopeMatchesApproval(approval, request, now) {
  if (!approval) return { valid: false, reasons: ["MISSING_APPROVAL_SCOPE"] };

  const reasons = [];
  const scope = approval.scope || {};
  const approvingDecision = approval.decision === "approve_once" || approval.decision === "approve_with_constraints";

  if (!approvingDecision) reasons.push("APPROVAL_DECISION_NOT_APPROVING");
  if (approval.status !== "active") reasons.push("APPROVAL_NOT_ACTIVE");
  if (approval.mission_id !== request.mission_id) reasons.push("APPROVAL_MISSION_MISMATCH");
  if (approval.granted_to !== request.actor) reasons.push("APPROVAL_ACTOR_MISMATCH");
  if (scope.action !== request.action) reasons.push("APPROVAL_ACTION_MISMATCH");
  if (scope.tool !== request.tool) reasons.push("APPROVAL_TOOL_MISMATCH");
  if (scope.target !== request.target) reasons.push("APPROVAL_TARGET_MISMATCH");
  if (!isWithinWindow(scope.valid_from, scope.expires_at, now)) reasons.push("APPROVAL_NOT_IN_VALID_WINDOW");
  if (approval.decision === "approve_once" && scope.max_executions !== 1) reasons.push("APPROVAL_NOT_SINGLE_USE");

  return {
    valid: reasons.length === 0,
    reasons
  };
}

function scopeMatchesRiskAcceptance(riskAcceptance, request, now) {
  if (!riskAcceptance) return { valid: false, reasons: ["MISSING_RISK_ACCEPTANCE"] };

  const reasons = [];
  const duration = riskAcceptance.duration || {};

  if (riskAcceptance.decision !== "accept") reasons.push("RISK_NOT_ACCEPTED");
  if (riskAcceptance.status !== "active") reasons.push("RISK_ACCEPTANCE_NOT_ACTIVE");
  if (riskAcceptance.mission_id !== request.mission_id) reasons.push("RISK_ACCEPTANCE_MISSION_MISMATCH");
  if (riskAcceptance.risk_owner !== request.actor) reasons.push("RISK_OWNER_MISMATCH");
  if (riskAcceptance.action !== request.action) reasons.push("RISK_ACCEPTANCE_ACTION_MISMATCH");
  if (riskAcceptance.tool !== request.tool) reasons.push("RISK_ACCEPTANCE_TOOL_MISMATCH");
  if (riskAcceptance.target !== request.target) reasons.push("RISK_ACCEPTANCE_TARGET_MISMATCH");
  if (!isWithinWindow(duration.valid_from, duration.expires_at, now)) reasons.push("RISK_ACCEPTANCE_NOT_IN_VALID_WINDOW");
  if ((riskAcceptance.residual_risk === "high" || riskAcceptance.residual_risk === "critical" || riskAcceptance.reversibility === "irreversible") && riskAcceptance.accepted_by !== "COMMANDER") {
    reasons.push("RISK_ACCEPTANCE_REQUIRES_COMMANDER");
  }

  return {
    valid: reasons.length === 0,
    reasons
  };
}

function integrate(bundle) {
  const now = bundle.now || new Date().toISOString();
  const toolRequest = bundle.tool_request;
  const authorityRequest = bundle.authority_request || {
    role: toolRequest.actor,
    task: toolRequest.task || toolRequest.task_id || "any",
    tool: toolRequest.tool,
    target: toolRequest.target,
    roe_class: toolRequest.roe_class,
    readiness: bundle.readiness || "P"
  };

  const policy = decidePolicy(toolRequest);
  const readiness = decideReadiness(bundle.authority_matrix, authorityRequest);

  const reasons = [
    ...policy.reason,
    ...(readiness.reasons || [])
  ];

  if (policy.roe_class === "Black" || readiness.decision === "prohibit") {
    return {
      allowed: false,
      blocked: true,
      final_decision: "prohibit",
      policy,
      readiness,
      approval: { required: false, valid: false, reasons: [] },
      risk_acceptance: { required: false, valid: false, reasons: [] },
      reasons: [...new Set([...reasons, "PROHIBITED_BY_POLICY_OR_AUTHORITY"])]
    };
  }

  const approvalRequired = policy.approval_required === true || readiness.decision === "approval_required";
  const approval = {
    required: approvalRequired,
    ...scopeMatchesApproval(bundle.approval_scope, toolRequest, now)
  };

  const riskRequired = HIGH_RISK.has(String(toolRequest.risk_level || "").toLowerCase()) || policy.roe_class === "Red";
  const riskAcceptance = {
    required: riskRequired,
    ...scopeMatchesRiskAcceptance(bundle.risk_acceptance, toolRequest, now)
  };

  if (!approvalRequired) {
    approval.valid = true;
    approval.reasons = [];
  }
  if (!riskRequired) {
    riskAcceptance.valid = true;
    riskAcceptance.reasons = [];
  }

  const blocked = (approval.required && !approval.valid) || (riskAcceptance.required && !riskAcceptance.valid);

  return {
    allowed: !blocked,
    blocked,
    final_decision: blocked ? "blocked_pending_authority" : "allow_scoped_execution",
    policy,
    readiness,
    approval,
    risk_acceptance: riskAcceptance,
    reasons: [...new Set([...reasons, ...approval.reasons, ...riskAcceptance.reasons])]
  };
}

function main() {
  const [, , bundleArg] = process.argv;
  if (!bundleArg) {
    console.error("Usage: node policy-engine-authority-integration.js <bundle.json>");
    process.exit(2);
  }

  const bundle = readJson(path.resolve(process.cwd(), bundleArg));
  const decision = integrate(bundle);
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  process.exit(decision.blocked ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { integrate, scopeMatchesApproval, scopeMatchesRiskAcceptance };
