#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const SELF = path.basename(__filename);

function fixtureFiles(environment = process.env) {
  return fs.readdirSync(ROOT)
    .filter(file => /^run-.*\.js$/.test(file) && file !== SELF)
    .filter(file => !(environment.CANNAE_MANDATORY_CONTROL === "1" &&
      file === "run-skill-mission-controller-fixtures.js"))
    .sort();
}

function runAll(environment = process.env) {
  const files = fixtureFiles(environment);
  const results = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, [path.join(ROOT, file)], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...environment, CONTROLS_AGGREGATE_RUNNER: "1" },
      maxBuffer: 64 * 1024 * 1024
    });
    const ok = result.status === 0;
    results.push({ file, ok, exit_code: result.status });
    console.log(`${ok ? "PASS" : "FAIL"} ${file}`);
    if (!ok) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
  }
  return results;
}

function main() {
  const results = runAll();
  const failed = results.filter(result => !result.ok);
  console.log(JSON.stringify({
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    mandatory_control_mode: process.env.CANNAE_MANDATORY_CONTROL === "1"
  }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { fixtureFiles, runAll };
