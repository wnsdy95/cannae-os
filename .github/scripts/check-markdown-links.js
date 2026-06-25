#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const excludedDirs = new Set([".git", "node_modules"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excludedDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

const repoRoot = process.cwd();
const files = walk(repoRoot).map(file => path.relative(repoRoot, file).split(path.sep).join("/")).sort();
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
