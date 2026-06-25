#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const READINESS_RANK = { X: 0, U: 1, P: 2, T: 3 };

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function scopeMatches(scopes, value) {
  const normalizedValue = normalize(value);
  return (scopes || []).some(scope => {
    const normalizedScope = normalize(scope);
    return normalizedScope === "any" ||
      normalizedScope === normalizedValue ||
      normalizedValue.includes(normalizedScope) ||
      normalizedScope.includes(normalizedValue);
  });
}

function readinessMeets(actual, minimum) {
  return (READINESS_RANK[actual] || 0) >= (READINESS_RANK[minimum] || 0);
}

function decisionBlocked(decision) {
  return decision === "approval_required" || decision === "prohibit";
}

function findRule(matrix, request) {
  return (matrix.rules || []).find(rule =>
    rule.role === request.role &&
    rule.roe_class === request.roe_class &&
    scopeMatches(rule.task_scope, request.task) &&
    scopeMatches(rule.tool_scope, request.tool) &&
    scopeMatches(rule.target_scope, request.target)
  );
}

function decide(matrix, request) {
  const rule = findRule(matrix, request);
  if (!rule) {
    const decision = matrix.default_decision || "report_required";
    return {
      decision,
      blocked: decisionBlocked(decision),
      report_required: decision !== "allow",
      approval_authority: decision === "approval_required" ? matrix.owner : undefined,
      matched_rule_id: null,
      reasons: ["NO_MATCHING_RULE"]
    };
  }

  const reasons = [`MATCHED_${rule.rule_id}`];
  let decision = rule.decision;

  if (!readinessMeets(request.readiness, rule.readiness_min)) {
    decision = "approval_required";
    reasons.push("READINESS_BELOW_MINIMUM");
  }

  if (rule.roe_class === "Black") {
    decision = "prohibit";
    reasons.push("BLACK_ACTION_PROHIBITED");
  }

  return {
    decision,
    blocked: decisionBlocked(decision),
    report_required: decision !== "allow",
    approval_authority: decision === "approval_required" ? (rule.approval_authority || matrix.owner) : undefined,
    matched_rule_id: rule.rule_id,
    readiness_min: rule.readiness_min,
    reasons,
    evidence_required: rule.evidence_required || [],
    ccir_triggers: rule.ccir_triggers || []
  };
}

function main() {
  const [, , matrixArg, requestArg] = process.argv;
  if (!matrixArg || !requestArg) {
    console.error("Usage: node readiness-gate-prototype/readiness-gate.js <authority-matrix.json> '<request-json>'");
    process.exit(2);
  }

  const matrixPath = path.resolve(process.cwd(), matrixArg);
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  const request = JSON.parse(requestArg);
  process.stdout.write(`${JSON.stringify(decide(matrix, request), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { decide };
