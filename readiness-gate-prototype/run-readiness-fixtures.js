#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { decide } = require("./readiness-gate");

const ROOT = path.resolve(__dirname, "..");
const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-authority-matrix.json"), "utf8"));

const cases = [
  {
    name: "S3 practiced local validation is allowed",
    request: {
      role: "S3",
      task: "runtime prototype",
      tool: "validator-cli-prototype/validate.js",
      target: "local workspace",
      roe_class: "Green",
      readiness: "P"
    },
    expected: {
      decision: "allow",
      blocked: false,
      matched_rule_id: "RUL-DEMO-001"
    }
  },
  {
    name: "S3 production deploy requires commander approval",
    request: {
      role: "S3",
      task: "deployment",
      tool: "deploy",
      target: "production",
      roe_class: "Red",
      readiness: "T"
    },
    expected: {
      decision: "approval_required",
      blocked: true,
      approval_authority: "COMMANDER",
      matched_rule_id: "RUL-DEMO-002"
    }
  },
  {
    name: "Black credential request is prohibited",
    request: {
      role: "EXECUTOR",
      task: "any",
      tool: "env",
      target: "secrets",
      roe_class: "Black",
      readiness: "T"
    },
    expected: {
      decision: "prohibit",
      blocked: true,
      matched_rule_id: null,
      reason: "BLACK_ACTION_PROHIBITED"
    }
  },
  {
    name: "Insufficient readiness is not overridable by approval",
    request: {
      role: "S3",
      task: "runtime prototype",
      tool: "runtime-demo-runner.js",
      target: "local workspace",
      roe_class: "Green",
      readiness: "U"
    },
    expected: {
      decision: "prohibit",
      blocked: true,
      matched_rule_id: "RUL-DEMO-001",
      reason: "READINESS_BELOW_MINIMUM"
    }
  }
];

const green = cases[0].request;
for (const [name, field, value] of [
  ["suffix tool is not the approved tool", "tool", `${green.tool}.bak`],
  ["short target is not the approved target", "target", "local"],
  ["task substring is not task identity", "task", "prototype"],
  ["case changes do not broaden exact scope", "target", "LOCAL WORKSPACE"],
  ["empty scope input cannot match every string", "task", ""],
  ["unknown readiness does not become X", "readiness", "unknown"]
]) cases.push({ name, request: { ...green, [field]: value }, expected: { decision: "prohibit", blocked: true,
  reason: value === "" || field === "readiness" ? "READINESS_REQUEST_INVALID" : "NO_MATCHING_RULE" } });
function matrixCase(name, mutate, reason, request = { ...green, readiness: "T" }) {
  const modified = structuredClone(matrix); mutate(modified);
  cases.push({ name, matrix: modified, request, expected: { decision: "prohibit", blocked: true, reason } });
}
matrixCase("prohibition survives lower readiness", value => { value.rules[0].decision = "prohibit"; value.rules[0].readiness_min = "T"; }, "AUTHORITY_RULE_PROHIBITS", green);
for (const reverse of [false, true]) matrixCase(`overlapping prohibition wins independently of rule order ${reverse}`, value => {
  value.rules.push({ ...structuredClone(value.rules[0]), rule_id: "RUL-DENY-OVERLAP", decision: "prohibit" });
  if (reverse) value.rules.reverse();
}, "AUTHORITY_RULE_PROHIBITS");
matrixCase("duplicate IDs fail closed", value => { value.rules.push(structuredClone(value.rules[0])); }, "AUTHORITY_MATRIX_INVALID");
matrixCase("unknown matrix readiness fails closed", value => { value.rules[0].readiness_min = "unknown"; }, "AUTHORITY_MATRIX_INVALID");
matrixCase("rule expiry is enforced at exact boundary", value => { value.rules[0].expires_at = "2026-06-18T07:45:00Z"; }, "AUTHORITY_RULE_EXPIRED");
matrixCase("empty configured scope is invalid", value => { value.rules[0].target_scope = [""]; }, "AUTHORITY_MATRIX_INVALID");
matrixCase("an inappropriately low rule floor does not unlock U", value => { value.rules[0].readiness_min = "U"; }, "READINESS_DRAFT_ONLY", { ...green, readiness: "U" });
matrixCase("an inappropriately low rule floor does not unlock X", value => { value.rules[0].readiness_min = "X"; }, "READINESS_DRAFT_ONLY", { ...green, readiness: "X" });
matrixCase("another overlapping rule's higher floor still applies", value => {
  value.rules.push({ ...structuredClone(value.rules[0]), rule_id: "RUL-HIGHER-FLOOR", readiness_min: "T" });
}, "READINESS_BELOW_MINIMUM", green);
matrixCase("conflicting overlapping approvers require separate policy review", value => {
  const original = value.rules[0]; original.decision = "approval_required"; original.approval_authority = "COMMANDER";
  value.rules.push({ ...structuredClone(original), rule_id: "RUL-SECOND-APPROVER", approval_authority: "COS" });
}, "AUTHORITY_APPROVAL_CONFLICT");
cases.push({ name: "Black stays prohibited without a matching role or task", request: { ...green, task: "unlisted", roe_class: "Black" },
  expected: { decision: "prohibit", blocked: true, reason: "BLACK_ACTION_PROHIBITED" } });

function matches(actual, expected) {
  return Object.entries(expected).every(([key, value]) => {
    if (key === "reason") return actual.reasons && actual.reasons.includes(value);
    return actual[key] === value;
  });
}

const results = cases.map(testCase => {
  const actual = decide(testCase.matrix || matrix, testCase.request, { now: "2026-06-18T16:45:00+09:00" });
  return {
    name: testCase.name,
    ok: matches(actual, testCase.expected),
    actual,
    expected: testCase.expected
  };
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok) {
    console.log(`  expected ${JSON.stringify(result.expected)}`);
    console.log(`  got ${JSON.stringify(result.actual)}`);
  }
}

const failed = results.filter(result => !result.ok);
for (const [readiness, status] of [["P", 0], ["U", 1], ["unknown", 1]]) {
  const cli = spawnSync(process.execPath, [path.join(__dirname, "readiness-gate.js"), path.join(ROOT, "sample-payloads/valid-authority-matrix.json"),
    JSON.stringify({ ...green, readiness })], { encoding: "utf8", timeout: 10000 });
  assert(!cli.error); assert.equal(cli.status, status); assert.equal(JSON.parse(cli.stdout).blocked, status !== 0);
  if (status) assert.deepEqual(JSON.parse(cli.stdout).reasons, [readiness === "U" ? "READINESS_BELOW_MINIMUM" : "READINESS_REQUEST_INVALID"]);
}
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
