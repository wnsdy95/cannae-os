#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function findRuntimeRoot() {
  const candidates = [];
  if (process.env.CANNAE_OS_HOME) candidates.push(process.env.CANNAE_OS_HOME);
  const skillRoot = path.resolve(__dirname, "..");
  const marker = path.join(skillRoot, ".cannae-os-root");
  if (fs.existsSync(marker)) {
    candidates.push(fs.readFileSync(marker, "utf8").trim());
  }
  for (const start of [fs.realpathSync(__dirname), process.cwd()]) {
    let current = path.resolve(start);
    while (true) {
      candidates.push(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  for (const candidate of candidates.filter(Boolean)) {
    const root = path.resolve(candidate);
    if (fs.existsSync(
      path.join(root, "github-release-integrity-monitor.js")
    ) && fs.existsSync(path.join(root, "docs", "source-map.md"))) {
      return root;
    }
  }
  throw new Error(
    "Cannae OS GitHub release integrity runtime not found. " +
    "Reinstall the skill or set CANNAE_OS_HOME."
  );
}

function main() {
  try {
    const root = findRuntimeRoot();
    const args = process.argv.slice(2);
    const bootstrapRecovery =
      args[0] === "authorize-bootstrap-recovery";
    const runtime = bootstrapRecovery
      ? "github-release-bootstrap-recovery-operator.js"
      : "github-release-integrity-monitor.js";
    const runtimeArgs = bootstrapRecovery
      ? ["authorize", ...args.slice(1)]
      : args;
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, runtime),
        ...runtimeArgs
      ],
      { cwd: process.cwd(), stdio: "inherit" }
    );
    if (result.error) throw result.error;
    process.exitCode = result.status === null ? 2 : result.status;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = { findRuntimeRoot };
