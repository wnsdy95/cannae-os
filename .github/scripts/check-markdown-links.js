#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const result = spawnSync("rg", ["--files", "-g", "*.md"], { encoding: "utf8" });

if (result.status !== 0 && !result.stdout.trim()) {
  console.error(result.stderr || "Failed to list Markdown files");
  process.exit(result.status || 1);
}

const files = result.stdout.trim().split(/\n/).filter(Boolean);
const missing = [];
const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  let match;

  while ((match = linkPattern.exec(text))) {
    const rawTarget = match[1].split("#")[0].trim();
    if (!rawTarget) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) continue;

    const unwrapped = rawTarget.replace(/^<|>$/g, "");
    const target = path.resolve(path.dirname(file), unwrapped);
    if (!fs.existsSync(target)) {
      missing.push(`${file}: ${match[1]}`);
    }
  }
}

if (missing.length) {
  console.error(missing.join("\n"));
  process.exit(1);
}

console.log(`Markdown local links OK: ${files.length} files`);
