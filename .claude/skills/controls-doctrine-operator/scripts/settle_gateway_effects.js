#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");
const { findRuntimeRoot } = require("./operate_dispatch_runtime");

try {
  const result = spawnSync(process.execPath, [path.join(findRuntimeRoot(), "gateway-effect-settlement.js"), ...process.argv.slice(2)], {
    cwd: process.cwd(), stdio: "inherit"
  });
  if (result.error) throw result.error;
  process.exitCode = result.status === null ? 2 : result.status;
} catch (error) { console.error(error.message); process.exitCode = 2; }
