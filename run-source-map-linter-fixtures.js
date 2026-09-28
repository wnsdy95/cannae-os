#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { coverageReport, doctrineIndexAudit } = require("./source-map-linter");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-source-map-"));
  const output = "docs/example-doctrine.md";
  const readmeIndex = `[Example](${output})\n`;
  const doctrineIndex = `\`${output}\`\n`;

  try {
    write(root, "docs/military-operating-deep-research-queue.md", [
      "<!-- doctrine-index:start -->",
      "- `example-doctrine.md`: fixture",
      "<!-- doctrine-index:end -->",
      ""
    ].join("\n"));
    write(root, output, "# Example Doctrine\n");
    write(root, "README.md", readmeIndex);
    write(root, "docs/source-map.md", doctrineIndex);
    write(root, "docs/research-compendium.md", doctrineIndex);

    const valid = doctrineIndexAudit(root);
    assert(valid.findings.length === 0, "fully indexed doctrine should pass");

    write(root, "docs/research-compendium.md", "missing\n");
    const unindexed = doctrineIndexAudit(root);
    assert(unindexed.findings.some(item =>
      item.code === "DOCTRINE_OUTPUT_NOT_INDEXED" &&
      item.path === output &&
      item.index === "docs/research-compendium.md"),
    "missing compendium index should fail");

    fs.unlinkSync(path.join(root, output));
    const missing = doctrineIndexAudit(root);
    assert(missing.findings.some(item =>
      item.code === "DOCTRINE_OUTPUT_MISSING" && item.path === output),
    "missing doctrine output should fail");

    write(root, "docs/military-operating-deep-research-queue.md", [
      "<!-- doctrine-index:start -->",
      "- `../outside.md`: traversal fixture",
      "<!-- doctrine-index:end -->",
      ""
    ].join("\n"));
    const traversal = doctrineIndexAudit(root);
    assert(traversal.findings.some(item => item.code === "DOCTRINE_INDEX_PATH_INVALID"),
      "traversal doctrine path should fail");

    const before = new Date().toISOString().slice(0, 10);
    const report = coverageReport();
    const after = new Date().toISOString().slice(0, 10);
    assert([before, after].includes(report.as_of), "coverage snapshot must use the actual UTC audit date");

    process.stdout.write("PASS source-map doctrine index fixtures (5/5)\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  process.stderr.write(`FAIL ${error.message}\n`);
  process.exit(1);
}
