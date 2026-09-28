#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DOCTRINE_QUEUE = "docs/military-operating-deep-research-queue.md";
const DOCTRINE_INDEX_TARGETS = [
  "README.md",
  "docs/source-map.md",
  "docs/research-compendium.md"
];

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
  /learn\.chatgpt\.com$/,
  /code\.claude\.com$/,
  /developers\.openai\.com$/,
  /docs\.docker\.com$/,
  /nodejs\.org$/,
  /cwe\.mitre\.org$/,
  /kernel\.org$/,
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

function doctrineIndexAudit(rootPath = process.cwd()) {
  const findings = [];
  const queuePath = path.join(rootPath, DOCTRINE_QUEUE);
  if (!fs.existsSync(queuePath)) {
    return {
      doctrine_outputs: [],
      findings: [{
        severity: "error",
        code: "DOCTRINE_INDEX_QUEUE_MISSING",
        path: DOCTRINE_QUEUE
      }]
    };
  }

  const queue = fs.readFileSync(queuePath, "utf8");
  const match = queue.match(/<!-- doctrine-index:start -->([\s\S]*?)<!-- doctrine-index:end -->/);
  if (!match) {
    return {
      doctrine_outputs: [],
      findings: [{
        severity: "error",
        code: "DOCTRINE_INDEX_MARKERS_MISSING",
        path: DOCTRINE_QUEUE
      }]
    };
  }

  const doctrineOutputs = [];
  for (const item of match[1].matchAll(/`([^`]+\.md)`/g)) {
    const relativePath = item[1].startsWith("docs/") ? item[1].slice(5) : item[1];
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(relativePath)) {
      findings.push({
        severity: "error",
        code: "DOCTRINE_INDEX_PATH_INVALID",
        path: item[1]
      });
      continue;
    }
    doctrineOutputs.push(`docs/${relativePath}`);
  }
  const uniqueOutputs = [...new Set(doctrineOutputs)].sort();
  if (uniqueOutputs.length === 0) {
    findings.push({
      severity: "error",
      code: "DOCTRINE_INDEX_EMPTY",
      path: DOCTRINE_QUEUE
    });
  }

  const targetTexts = new Map();
  for (const target of DOCTRINE_INDEX_TARGETS) {
    const targetPath = path.join(rootPath, target);
    if (!fs.existsSync(targetPath)) {
      findings.push({
        severity: "error",
        code: "DOCTRINE_INDEX_TARGET_MISSING",
        path: target
      });
      continue;
    }
    targetTexts.set(target, fs.readFileSync(targetPath, "utf8"));
  }

  for (const output of uniqueOutputs) {
    const outputPath = path.join(rootPath, output);
    let outputExists = false;
    try {
      outputExists = fs.statSync(outputPath).isFile() && !fs.lstatSync(outputPath).isSymbolicLink();
    } catch {
      outputExists = false;
    }
    if (!outputExists) {
      findings.push({
        severity: "error",
        code: "DOCTRINE_OUTPUT_MISSING",
        path: output
      });
    }

    for (const [target, targetText] of targetTexts.entries()) {
      const indexed = target === "README.md"
        ? targetText.includes(`](${output})`)
        : targetText.includes(`\`${output}\``);
      if (!indexed) {
        findings.push({
          severity: "error",
          code: "DOCTRINE_OUTPUT_NOT_INDEXED",
          path: output,
          index: target
        });
      }
    }
  }

  return { doctrine_outputs: uniqueOutputs, findings };
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

  const doctrineAudit = doctrineIndexAudit();
  findings.push(...doctrineAudit.findings);

  return {
    valid: findings.length === 0,
    checked_hosts: official.size,
    indexed_doctrine_outputs: doctrineAudit.doctrine_outputs.length,
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

  const doctrineAudit = doctrineIndexAudit();
  findings.push(...doctrineAudit.findings);

  return {
    report_type: "source-map-url-coverage",
    as_of: new Date().toISOString().slice(0, 10),
    source_map: "docs/source-map.md",
    valid: findings.length === 0,
    checked_hosts: official.size,
    indexed_doctrine_outputs: doctrineAudit.doctrine_outputs.length,
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

module.exports = { coverageReport, doctrineIndexAudit, lint };
