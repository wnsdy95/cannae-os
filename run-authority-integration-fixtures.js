#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { integrate } = require("./policy-engine-authority-integration");

const ROOT = __dirname;

const cases = [
  {
    name: "approved Red deployment is released only with scoped approval and risk acceptance",
    file: "authority-integration-fixtures/approved-red-bundle.json",
    expected: {
      allowed: true,
      blocked: false,
      final_decision: "allow_scoped_execution"
    }
  },
  {
    name: "consumed approval cannot be reused",
    file: "authority-integration-fixtures/consumed-approval-bundle.json",
    expected: {
      allowed: false,
      blocked: true,
      reason: "APPROVAL_NOT_ACTIVE"
    }
  },
  {
    name: "high risk request remains blocked without risk acceptance",
    file: "authority-integration-fixtures/missing-risk-acceptance-bundle.json",
    expected: {
      allowed: false,
      blocked: true,
      reason: "MISSING_RISK_ACCEPTANCE"
    }
  }
];

function mutationCase(name, mutate, reason) {
  cases.push({ name, mutate, file: "authority-integration-fixtures/approved-red-bundle.json", expected: { allowed: false, blocked: true, reason } });
}
mutationCase("scoped approval cannot replace minimum readiness", bundle => { bundle.authority_request.readiness = "P"; }, "READINESS_BELOW_MINIMUM");
for (const [field, value] of [["role", "S6"], ["task", "different-task"], ["tool", "different-tool"], ["target", "production"], ["roe_class", "Green"]]) {
  mutationCase(`authority ${field} cannot describe a different request`, bundle => { bundle.authority_request[field] = value; }, `AUTHORITY_REQUEST_${field.toUpperCase()}_MISMATCH`);
}
mutationCase("another mission's matrix cannot authorize the request", bundle => { bundle.authority_matrix.mission_id = "M-OTHER"; }, "AUTHORITY_MATRIX_MISSION_MISMATCH");
mutationCase("unknown risk does not mean low risk", bundle => { bundle.tool_request.risk_level = "unknown"; }, "AUTHORITY_TOOL_REQUEST_INVALID");
mutationCase("missing rating is never implicitly P", bundle => { delete bundle.authority_request; }, "READINESS_REQUEST_INVALID");
mutationCase("expiry uses numeric offset chronology", bundle => { bundle.authority_matrix.rules[0].expires_at = "2026-06-18T16:45:00+09:00"; }, "AUTHORITY_RULE_EXPIRED");
mutationCase("an unrelated signer does not satisfy the rule's approver", bundle => { bundle.approval_scope.granted_by = "S3"; }, "APPROVAL_AUTHORITY_MISMATCH");
mutationCase("approval for another request is not reusable", bundle => { bundle.approval_scope.tool_request_id = "TR-OTHER"; }, "APPROVAL_REQUEST_BINDING_MISMATCH");
mutationCase("approval for another task is not reusable", bundle => { bundle.approval_scope.scope.task_order = "T-OTHER"; }, "APPROVAL_REQUEST_BINDING_MISMATCH");
mutationCase("an unmatched scope is not execution permission from the report default", bundle => { bundle.authority_matrix.rules[0].target_scope = ["different-target"]; }, "NO_MATCHING_RULE");
mutationCase("invalid clock cannot satisfy expiry or consent", bundle => { bundle.now = "not-a-time"; }, "AUTHORITY_CLOCK_INVALID");
mutationCase("schema-valid Green prohibition cannot become approvable at P", bundle => {
  Object.assign(bundle.tool_request, { tool: "validator", action: "validate", target: "local workspace", risk_level: "low", roe_class: "Green", approval_required: false });
  Object.assign(bundle.authority_request, { tool: "validator", target: "local workspace", roe_class: "Green", readiness: "P" });
  const rule = bundle.authority_matrix.rules[0];
  Object.assign(rule, { tool_scope: ["validator"], target_scope: ["local workspace"], roe_class: "Green", decision: "prohibit" });
  delete rule.approval_authority;
  Object.assign(bundle.approval_scope.scope, { tool: "validator", action: "validate", target: "local workspace" });
  if (!require("./validator-cli-prototype/validate").validatePayload(bundle.authority_matrix, "authority-matrix").valid) throw new Error("Negative fixture must have a valid matrix");
}, "AUTHORITY_RULE_PROHIBITS");
cases.push({ name: "derived request uses exact identity and explicit rating without a separate projection", file: "authority-integration-fixtures/approved-red-bundle.json",
  mutate(bundle) { delete bundle.authority_request; bundle.readiness = "T"; }, expected: { allowed: true, blocked: false } });

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function matches(actual, expected) {
  return Object.entries(expected).every(([key, value]) => {
    if (key === "reason") return actual.reasons && actual.reasons.includes(value);
    return actual[key] === value;
  });
}

const results = cases.map(testCase => {
  const bundle = readJson(testCase.file); testCase.mutate?.(bundle);
  const actual = integrate(bundle);
  return {
    name: testCase.name,
    ok: matches(actual, testCase.expected),
    expected: testCase.expected,
    actual
  };
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok) {
    console.log(`  expected ${JSON.stringify(result.expected)}`);
    console.log(`  got ${JSON.stringify({
      allowed: result.actual.allowed,
      blocked: result.actual.blocked,
      final_decision: result.actual.final_decision,
      reasons: result.actual.reasons
    })}`);
  }
}

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
