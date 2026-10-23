#!/usr/bin/env node
const path = require("node:path"), { spawnSync } = require("node:child_process");
const { findRuntimeRoot } = require("./operate_dispatch_runtime");
try {
  const result = spawnSync(process.execPath, [path.join(findRuntimeRoot(), "force-registry-cli.js"), ...process.argv.slice(2)],
    { cwd: process.cwd(), stdio: "inherit", shell: false });
  if (result.error) throw result.error; process.exitCode = result.status === null ? 2 : result.status;
} catch (error) { console.error(error.message); process.exitCode = 2; }
