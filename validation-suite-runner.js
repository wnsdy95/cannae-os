#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname;

function runNode(label, script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed (${script}).${detail ? `\n${detail}` : ""}`);
  }
  return { label, script };
}

function runCommand(label, executable, args) {
  const result = spawnSync(executable, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed.${detail ? `\n${detail}` : ""}`);
  }
  return { label, script: [executable, ...args].join(" ") };
}

function runSuite() {
  const completed = [];
  completed.push(runNode("routing coverage", "codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js", ["--coverage", "."]));
  completed.push(runNode("JSON parsing", ".github/scripts/check-json.js"));
  completed.push(runNode("English-only corpus", ".github/scripts/check-english-only.js"));
  completed.push(runNode("Markdown links", ".github/scripts/check-markdown-links.js"));
  completed.push(runNode("validator fixtures", "validator-cli-prototype/run-fixtures.js"));

  const runners = fs.readdirSync(ROOT)
    .filter(file => /^run-.*\.js$/.test(file))
    .sort();
  for (const runner of runners) completed.push(runNode(`runner fixture ${runner}`, runner));

  completed.push(runNode("source-map linter", "source-map-linter.js"));
  const trackedJavaScript = runCommand("tracked JavaScript inventory", "git", ["ls-files", "*.js"]);
  completed.push(trackedJavaScript);
  const inventory = spawnSync("git", ["ls-files", "*.js"], { cwd: ROOT, encoding: "utf8" });
  for (const file of inventory.stdout.split("\n").filter(Boolean)) {
    completed.push(runCommand(`syntax ${file}`, process.execPath, ["--check", path.join(ROOT, file)]));
  }
  completed.push(runCommand("whitespace diff", "git", ["diff", "--check"]));

  return {
    valid: true,
    check_count: completed.length,
    runner_fixture_count: runners.length,
    checks: completed
  };
}

function main() {
  try {
    const result = runSuite();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { runSuite };
