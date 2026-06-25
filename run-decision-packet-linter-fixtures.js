#!/usr/bin/env node

const { spawnSync } = require("child_process");

const cases = [
  {
    name: "valid packet passes linter",
    file: "sample-payloads/valid-decision-packet.json",
    exitCode: 0
  },
  {
    name: "packet without options fails linter",
    file: "sample-payloads/invalid-decision-packet-no-options.json",
    exitCode: 1
  }
];

const results = cases.map(testCase => {
  const result = spawnSync("node", ["decision-packet-linter.js", testCase.file], {
    encoding: "utf8"
  });
  return {
    ...testCase,
    ok: result.status === testCase.exitCode,
    status: result.status,
    stdout: result.stdout
  };
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
  if (!result.ok) {
    console.log(`  expected ${result.exitCode}, got ${result.status}`);
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
