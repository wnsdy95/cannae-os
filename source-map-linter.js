#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const OFFICIAL_HOST_PATTERNS = [
  /army\.mil$/,
  /armypubs\.army\.mil$/,
  /jcs\.mil$/,
  /marines\.mil$/,
  /trngcmd\.marines\.mil$/,
  /law\.go\.kr$/,
  /mnd\.go\.kr$/,
  /kida\.re\.kr$/,
  /usfk\.mil$/,
  /alssa\.mil$/,
  /armywarcollege\.edu$/,
  /afms\.edu$/,
  /esd\.whs\.mil$/,
  /first\.army\.mil$/,
  /socom\.mil$/,
  /gov\.uk$/,
  /canada\.ca$/,
  /fema\.gov$/,
  /rfc-editor\.org$/,
  /datatracker\.ietf\.org$/,
  /spiffe\.io$/,
  /sigstore\.dev$/,
  /slsa\.dev$/,
  /github\.com$/,
  /docs\.github\.com$/,
  /(^|\.)gitlab\.com$/,
  /docs\.gitlab\.com$/,
  /kubernetes\.io$/,
  /docs\.aws\.amazon\.com$/,
  /learn\.microsoft\.com$/,
  /docs\.cloud\.google\.com$/,
  /gvisor\.dev$/,
  /confidentialcontainers\.org$/,
  /etcd\.io$/,
  /nist\.gov$/,
  /w3\.org$/,
  /sre\.google$/,
  /developers\.openai\.com$/,
  /platform\.openai\.com$/
];

function markdownFiles(dir) {
  return fs.readdirSync(dir)
    .filter(file => file.endsWith(".md"))
    .map(file => path.join(dir, file));
}

function extractUrls(text) {
  const urls = [];
  for (const match of text.matchAll(/https?:\/\/[^\s)>"']+/g)) {
    urls.push(match[0].replace(/[.,;]+$/, ""));
  }
  return urls;
}

function officialHost(url) {
  try {
    const host = new URL(url).hostname;
    return OFFICIAL_HOST_PATTERNS.some(pattern => pattern.test(host)) ? host : null;
  } catch {
    return null;
  }
}

function lint() {
  const sourceMap = fs.readFileSync("docs/source-map.md", "utf8");
  const files = ["README.md", ...markdownFiles("docs")];
  const findings = [];
  const official = new Map();

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const url of extractUrls(text)) {
      const host = officialHost(url);
      if (!host) continue;
      if (!official.has(host)) official.set(host, new Set());
      official.get(host).add(file);
    }
  }

  for (const [host, filesWithHost] of official.entries()) {
    if (!sourceMap.includes(host)) {
      findings.push({
        severity: "error",
        code: "OFFICIAL_SOURCE_HOST_NOT_IN_SOURCE_MAP",
        host,
        files: [...filesWithHost].sort()
      });
    }
  }

  return {
    valid: findings.length === 0,
    checked_hosts: official.size,
    finding_count: findings.length,
    findings
  };
}

function coverageReport() {
  const sourceMap = fs.readFileSync("docs/source-map.md", "utf8");
  const files = ["README.md", ...markdownFiles("docs")];
  const official = new Map();
  const findings = [];

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const url of extractUrls(text)) {
      const host = officialHost(url);
      if (!host) continue;
      if (!official.has(host)) official.set(host, new Set());
      official.get(host).add(file);
    }
  }

  for (const [host, filesWithHost] of official.entries()) {
    if (!sourceMap.includes(host)) {
      findings.push({
        severity: "error",
        code: "OFFICIAL_SOURCE_HOST_NOT_IN_SOURCE_MAP",
        host,
        files: [...filesWithHost].sort()
      });
    }
  }

  return {
    report_type: "source-map-url-coverage",
    as_of: "2026-07-23",
    source_map: "docs/source-map.md",
    valid: findings.length === 0,
    checked_hosts: official.size,
    finding_count: findings.length,
    covered_hosts: [...official.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([host, filesWithHost]) => ({
        host,
        files: [...filesWithHost].sort()
      })),
    findings
  };
}

function main() {
  const writeReport = process.argv.includes("--write-report");
  const result = process.argv.includes("--report") || writeReport ? coverageReport() : lint();
  if (writeReport) {
    fs.writeFileSync("source-map-url-coverage-report.json", `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { coverageReport, lint };
