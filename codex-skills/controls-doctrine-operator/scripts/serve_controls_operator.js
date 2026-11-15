#!/usr/bin/env node
const path = require("path");
const { findRuntimeRoot } = require("./operate_dispatch_runtime");
try {
  const runtime = require(path.join(findRuntimeRoot(), "operator-console-server.js"));
  runtime.main().catch(error => { console.error(/^(?:CONSOLE|SEMANTIC)_[A-Z_]+$/.test(error.message) ? error.message : "CONSOLE_START_FAILED"); process.exitCode = 1; });
} catch (error) { console.error("CONSOLE_RUNTIME_UNAVAILABLE"); process.exitCode = 1; }
