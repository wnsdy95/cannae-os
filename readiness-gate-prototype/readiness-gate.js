#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const READINESS_RANK = { X: 0, U: 1, P: 2, T: 3 };

function scopeMatches(scopes, value) {
  return scopes.some(scope => scope === "any" || scope === value);
}

function readinessMeets(actual, minimum) {
  return Object.hasOwn(READINESS_RANK, actual) && Object.hasOwn(READINESS_RANK, minimum) &&
    READINESS_RANK[actual] >= READINESS_RANK[minimum];
}

function decisionBlocked(decision) {
  return decision === "approval_required" || decision === "prohibit";
}

function findRules(matrix, request) {
  return matrix.rules.filter(rule =>
    rule.role === request.role &&
    rule.roe_class === request.roe_class &&
    scopeMatches(rule.task_scope, request.task) &&
    scopeMatches(rule.tool_scope, request.tool) &&
    scopeMatches(rule.target_scope, request.target)
  );
}

function decide(matrix, request, options = {}) {
  const deny = (code, rules = []) => ({ decision: "prohibit", blocked: true, report_required: true,
    matched_rule_id: rules.length === 1 ? rules[0].rule_id : null, matched_rule_ids: rules.map(rule => rule.rule_id).sort(), reasons: [code] });
  const fields = ["role", "task", "tool", "target", "roe_class", "readiness"];
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      Object.keys(request).some(key => !fields.includes(key)) || fields.some(key => typeof request[key] !== "string" || !request[key].trim()) ||
      !Object.hasOwn(READINESS_RANK, request.readiness) || !["Green", "Amber", "Red", "Black"].includes(request.roe_class)) return deny("READINESS_REQUEST_INVALID");
  if (request.roe_class === "Black") return deny("BLACK_ACTION_PROHIBITED");
  if (Object.hasOwn(options, "now") && (typeof options.now !== "string" || !options.now)) return deny("READINESS_CLOCK_INVALID");
  const now = Date.parse(Object.hasOwn(options, "now") ? options.now : new Date().toISOString());
  if (!Number.isFinite(now)) return deny("READINESS_CLOCK_INVALID");
  let validation;
  try { validation = require("../validator-cli-prototype/validate").validatePayload(matrix, "authority-matrix"); }
  catch { return deny("AUTHORITY_MATRIX_INVALID"); }
  if (!validation.valid || new Set(matrix.rules.map(rule => rule.rule_id)).size !== matrix.rules.length ||
      matrix.rules.some(rule => [rule.task_scope, rule.tool_scope, rule.target_scope].some(scopes => !scopes.length || scopes.some(scope => !scope.trim())))) return deny("AUTHORITY_MATRIX_INVALID");
  const rules = findRules(matrix, request).sort((left, right) => left.rule_id.localeCompare(right.rule_id));
  if (!rules.length) return deny("NO_MATCHING_RULE");
  if (rules.some(rule => rule.expires_at && (!Number.isFinite(Date.parse(rule.expires_at)) || Date.parse(rule.expires_at) <= now))) return deny("AUTHORITY_RULE_EXPIRED", rules);
  if (rules.some(rule => rule.decision === "prohibit")) return deny("AUTHORITY_RULE_PROHIBITS", rules);
  if (rules.some(rule => !readinessMeets(request.readiness, rule.readiness_min))) return deny("READINESS_BELOW_MINIMUM", rules);
  if (READINESS_RANK[request.readiness] < READINESS_RANK.P) return deny("READINESS_DRAFT_ONLY", rules);
  // All matching restrictions intersect. Neither array order nor approval can lift a floor.
  const ranks = { allow: 0, report_required: 1, approval_required: 2, prohibit: 3 };
  const decision = rules.reduce((value, rule) => ranks[rule.decision] > ranks[value] ? rule.decision : value, "allow");
  const approvers = [...new Set(rules.filter(rule => rule.decision === "approval_required").map(rule => rule.approval_authority))];
  if (approvers.length > 1) return deny("AUTHORITY_APPROVAL_CONFLICT", rules);
  const unique = key => [...new Set(rules.flatMap(rule => rule[key] || []))];
  return { decision, blocked: decisionBlocked(decision), report_required: decision !== "allow",
    approval_authority: decision === "approval_required" ? approvers[0] : undefined,
    matched_rule_id: rules.length === 1 ? rules[0].rule_id : null, matched_rule_ids: rules.map(rule => rule.rule_id),
    readiness_min: rules.reduce((value, rule) => READINESS_RANK[rule.readiness_min] > READINESS_RANK[value] ? rule.readiness_min : value, "X"),
    reasons: rules.map(rule => `MATCHED_${rule.rule_id}`), evidence_required: unique("evidence_required"), ccir_triggers: unique("ccir_triggers") };
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
  const result = decide(matrix, request);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.blocked ? 1 : 0;
}

if (require.main === module) {
  main();
}

module.exports = { decide };
