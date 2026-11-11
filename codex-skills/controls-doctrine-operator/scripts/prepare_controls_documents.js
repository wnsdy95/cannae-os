#!/usr/bin/env node

const path = require("node:path");
const { spawnSync } = require("node:child_process");

try {
  // Reuse the installed router's explicit binding and copy-marker rules.
  const routed = spawnSync(process.execPath, [path.join(__dirname, "route_controls_docs.js"), "--coverage"],
    { encoding: "utf8", timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
  if (routed.status !== 0) throw new Error();
  const root = JSON.parse(routed.stdout).repo_root;
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new Error();
  require(path.join(root, "project-document-packet.js")).main();
} catch {
  console.error("PROJECT_PACKET_DOCTRINE_UNAVAILABLE");
  process.exitCode = 1;
}
