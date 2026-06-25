#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { decide } = require("./policy-engine");

const ROOT = path.resolve(__dirname, "..");

const fixtures = [
  {
    name: "green local markdown create",
    file: "sample-payloads/valid-tool-request-green.json",
    expected: {
      roe_class: "Green",
      allowed: true,
      approval_required: false,
      blocked: false
    }
  },
  {
    name: "red without approval sample",
    file: "sample-payloads/invalid-tool-request-red-without-approval.json",
    expected: {
      roe_class: "Red",
      allowed: false,
      approval_required: true,
      blocked: true
    }
  },
  {
    name: "demo green tool request",
    file: "runtime-demo-payloads/tool-request-green.json",
    expected: {
      roe_class: "Green",
      allowed: true,
      approval_required: false,
      blocked: false
    }
  },
  {
    name: "demo red deploy request",
    file: "runtime-demo-payloads/tool-request-red.json",
    expected: {
      roe_class: "Red",
      allowed: false,
      approval_required: true,
      blocked: true
    }
  }
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function matches(decision, expected) {
  return Object.entries(expected).every(([key, value]) => decision[key] === value);
}

const results = fixtures.map(fixture => {
  const input = readJson(fixture.file);
  const decision = decide(input);
  const ok = matches(decision, fixture.expected);
  return { fixture, decision, ok };
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.fixture.name}`);
  if (!result.ok) {
    console.log("  expected:", JSON.stringify(result.fixture.expected));
    console.log("  actual:", JSON.stringify({
      roe_class: result.decision.roe_class,
      allowed: result.decision.allowed,
      approval_required: result.decision.approval_required,
      blocked: result.decision.blocked
    }));
  }
}

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
