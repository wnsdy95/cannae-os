#!/usr/bin/env node

const { spawnSync } = require("child_process");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cases = [
  {
    name: "clean payload passes opsec linter",
    args: ["opsec-linter-fixtures/clean-payload.json"],
    exitCode: 0,
    verify(output) {
      assert(output.valid === true, "expected valid output");
      assert(output.finding_count === 0, "expected zero findings");
    }
  },
  {
    name: "embedded credential is detected with digest-only finding",
    args: ["opsec-linter-fixtures/credential-payload.json"],
    exitCode: 1,
    verify(output, stdout) {
      const match = output.findings.find(item => item.code === "CREDENTIAL_ASSIGNMENT");
      assert(match, "expected CREDENTIAL_ASSIGNMENT finding");
      assert(/^[a-f0-9]{64}$/.test(match.value_sha256), "expected sha256 digest in finding");
      assert(!stdout.includes("demo-4f9c-embedded-value"), "linter output must not leak the credential value");
    }
  },
  {
    name: "quoted credential assignment is detected",
    args: ["opsec-linter-fixtures/quoted-credential-payload.json"],
    exitCode: 1,
    verify(output, stdout) {
      const match = output.findings.find(item => item.code === "CREDENTIAL_ASSIGNMENT");
      assert(match, "expected quoted CREDENTIAL_ASSIGNMENT finding");
      assert(!stdout.includes("hunter2-synthetic"), "linter output must not leak the quoted credential value");
    }
  },
  {
    name: "token budget metadata is not treated as a secret token",
    args: ["opsec-linter-fixtures/token-budget-payload.json"],
    exitCode: 0,
    verify(output) {
      assert(output.valid === true, "expected token budget payload to pass");
      assert(output.finding_count === 0, "expected zero token budget findings");
    }
  },
  {
    name: "registered EEFI pattern is detected",
    args: ["opsec-linter-fixtures/eefi-term-payload.json", "opsec-linter-fixtures/eefi-patterns.json"],
    exitCode: 1,
    verify(output, stdout) {
      const match = output.findings.find(item => item.code === "EEFI_PATTERN_MATCH");
      assert(match, "expected EEFI_PATTERN_MATCH finding");
      assert(match.eefi_id === "EEFI-DEMO-001", "expected finding to reference EEFI-DEMO-001");
      assert(/^[a-f0-9]{64}$/.test(match.value_sha256), "expected sha256 digest in finding");
      assert(!stdout.includes("prod.command-post-dashboard"), "linter output must not leak the EEFI value");
    }
  }
];

const results = cases.map(testCase => {
  const result = spawnSync("node", ["opsec-linter.js", ...testCase.args], {
    encoding: "utf8"
  });
  let ok = result.status === testCase.exitCode;
  let detail = ok ? "" : `expected exit ${testCase.exitCode}, got ${result.status}`;
  if (ok && testCase.verify) {
    try {
      testCase.verify(JSON.parse(result.stdout), result.stdout);
    } catch (error) {
      ok = false;
      detail = error.message;
    }
  }
  return { ...testCase, ok, detail, stdout: result.stdout };
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok) {
    console.log(`  ${result.detail}`);
    console.log(result.stdout);
  }
}

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
