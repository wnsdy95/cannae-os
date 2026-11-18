#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");

const TOPICS = Object.freeze({
  "project-content": "references/project-content.md",
  "client-operation": "references/client-operation.md",
  "project-terms": "references/project-terms.md",
  "delegated-waves": "references/delegated-waves.md"
});
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const fail = code => { throw new Error(code); };

function readLocal(root, relative) {
  let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail("SKILL_INSTRUCTION_SYMLINK");
  }
  if (!fs.statSync(current).isFile()) fail("SKILL_INSTRUCTION_NOT_FILE");
  const bytes = fs.readFileSync(current), content = bytes.toString("utf8");
  if (!Buffer.from(content).equals(bytes)) fail("SKILL_INSTRUCTION_ENCODING_INVALID");
  if (!content.trim()) fail("SKILL_INSTRUCTION_EMPTY");
  return content;
}

function readInstructions(directory, topics = []) {
  if (!Array.isArray(topics) || topics.some(topic => typeof topic !== "string" || !Object.hasOwn(TOPICS, topic)) ||
      new Set(topics).size !== topics.length) fail("SKILL_INSTRUCTION_TOPICS_INVALID");
  const root = fs.realpathSync(directory);
  const entry = readLocal(root, "SKILL.md");
  const selected = Object.keys(TOPICS).filter(topic => topics.includes(topic));
  const texts = [["SKILL.md", entry]];
  for (const topic of selected) {
    const relative = TOPICS[topic];
    if (!entry.includes("](" + relative + ")")) fail("SKILL_INSTRUCTION_NOT_LINKED");
    texts.push([relative, readLocal(root, relative)]);
  }
  const documents = texts.map(([relative, content]) => ({
    path: relative, content, bytes: Buffer.byteLength(content), sha256: hash(content)
  }));
  return {
    type: "ControlsInstructionContext", version: "0.1", topics: selected, documents,
    emitted_content_bytes: documents.reduce((sum, document) => sum + document.bytes, 0),
    content_set_sha256: hash(JSON.stringify(documents.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })))),
    semantic_completeness_verified: false, native_read_verified: false,
    project_content_read: false, transfer_authorized: false
  };
}

function parseArgs(argv) {
  const topics = [];
  let all = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--all" && !all) all = true;
    else if (arg.startsWith("--topic=")) topics.push(arg.slice("--topic=".length));
    else if (arg === "--topic" && index + 1 < argv.length) topics.push(argv[++index]);
    else fail("SKILL_INSTRUCTION_ARGUMENTS_INVALID");
  }
  if (all && topics.length) fail("SKILL_INSTRUCTION_ARGUMENTS_INVALID");
  const selected = all ? Object.keys(TOPICS) : topics;
  if (selected.some(topic => !Object.hasOwn(TOPICS, topic)) || new Set(selected).size !== selected.length) {
    fail("SKILL_INSTRUCTION_TOPICS_INVALID");
  }
  return selected;
}

function main() {
  try {
    const topics = parseArgs(process.argv.slice(2));
    const context = readInstructions(path.resolve(__dirname, ".."), topics);
    process.stdout.write(JSON.stringify(context, null, 2) + "\n");
  } catch (error) {
    const known = /^SKILL_INSTRUCTION_[A-Z_]+$/.test(error.message || "");
    console.error(known ? error.message : "SKILL_INSTRUCTION_READ_FAILED");
    process.exitCode = 2;
  }
}
if (require.main === module) main();
module.exports = { TOPICS, readInstructions, parseArgs };
