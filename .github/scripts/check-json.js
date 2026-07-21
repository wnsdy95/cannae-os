#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const excludedDirs = new Set([".cannae", ".git", "node_modules"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excludedDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files;
}

const repoRoot = process.cwd();
const files = walk(repoRoot).map(file => path.relative(repoRoot, file).split(path.sep).join("/")).sort();
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
