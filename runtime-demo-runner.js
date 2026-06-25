#!/usr/bin/env node

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = __dirname;
const VALIDATOR = path.join(ROOT, "validator-cli-prototype", "validate.js");
const POLICY = path.join(ROOT, "policy-engine-prototype", "policy-engine.js");

const validations = [
  ["runtime-demo-payloads/mission.json", "mission"],
  ["runtime-demo-payloads/opord.json", "opord"],
  ["runtime-demo-payloads/task-order.json", "task-order"],
  ["runtime-demo-payloads/backbrief.json", "backbrief"],
  ["runtime-demo-payloads/rehearsal.json", "rehearsal"],
  ["runtime-demo-payloads/tool-request-green.json", "tool-request"],
  ["runtime-demo-payloads/tool-request-red.json", "tool-request"],
  ["runtime-demo-payloads/approval-request.json", "approval-request"],
  ["runtime-demo-payloads/sitrep.json", "sitrep"],
  ["runtime-demo-payloads/evidence.json", "evidence"],
  ["runtime-demo-payloads/aar.json", "aar"]
];

const policyChecks = [
  {
    file: "runtime-demo-payloads/tool-request-green.json",
    expected: { roe_class: "Green", blocked: false }
  },
  {
    file: "runtime-demo-payloads/tool-request-red.json",
    expected: { roe_class: "Red", blocked: true }
  }
];

function runNode(args) {
  return spawnSync("node", args, { cwd: ROOT, encoding: "utf8" });
}

function parseJson(stdout) {
  return JSON.parse(stdout);
}

const results = [];

for (const [file, type] of validations) {
  const result = runNode([VALIDATOR, file, type]);
  let parsed = null;
  try {
    parsed = parseJson(result.stdout);
  } catch (error) {
    results.push({ ok: false, name: `validate ${file}`, reason: error.message });
    continue;
  }
  results.push({
    ok: result.status === 0 && parsed.valid === true,
    name: `validate ${file}`,
    reason: result.status === 0 ? "" : `exit ${result.status}`
  });
}

for (const check of policyChecks) {
  const result = runNode([POLICY, check.file]);
  let parsed = null;
  try {
    parsed = parseJson(result.stdout);
  } catch (error) {
    results.push({ ok: false, name: `policy ${check.file}`, reason: error.message });
    continue;
  }
  const ok = Object.entries(check.expected).every(([key, value]) => parsed[key] === value);
  results.push({
    ok,
    name: `policy ${check.file}`,
    reason: ok ? "" : `expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(parsed)}`
  });
}

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok && result.reason) {
    console.log(`  ${result.reason}`);
  }
}

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
