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
    if (fs.existsSync(path.join(root, "protected-process-executor.js")) &&
        fs.existsSync(path.join(root, "docs", "source-map.md"))) {
      return root;
    }
  }
  throw new Error(
    "Cannae OS protected executor runtime not found. Reinstall the skill or set CANNAE_OS_HOME."
  );
}

function main() {
  try {
    const root = findRuntimeRoot();
    const result = spawnSync(
      process.execPath,
      [path.join(root, "protected-process-executor.js"), ...process.argv.slice(2)],
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
