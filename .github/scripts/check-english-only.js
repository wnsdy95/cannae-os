#!/usr/bin/env node

const fs = require("fs");
const { execFileSync } = require("child_process");

const hangulPattern = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF]/u;
const files = execFileSync("git", ["ls-files", "-z"])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const failures = [];

for (const file of files) {
  const contents = fs.readFileSync(file);
  if (contents.includes(0)) continue;

  const lines = contents.toString("utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!hangulPattern.test(lines[index])) continue;
    failures.push(`${file}:${index + 1}: ${lines[index].trim()}`);
  }
}

if (failures.length) {
  console.error("English-only check failed. Translate the following Hangul text:");
  console.error(failures.slice(0, 100).join("\n"));
  if (failures.length > 100) {
    console.error(`... ${failures.length - 100} additional matches omitted`);
  }
  process.exit(1);
}

console.log(`English-only check OK: ${files.length} tracked files scanned`);
