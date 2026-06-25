#!/usr/bin/env node

const fs = require("fs");
const { spawnSync } = require("child_process");

const result = spawnSync("rg", ["--files", "-g", "*.json"], { encoding: "utf8" });

if (result.status !== 0 && !result.stdout.trim()) {
  console.error(result.stderr || "Failed to list JSON files");
  process.exit(result.status || 1);
}

const files = result.stdout.trim().split(/\n/).filter(Boolean);
const failures = [];

for (const file of files) {
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`JSON parse OK: ${files.length} files`);
