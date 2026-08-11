#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const ALLOWED_TARGETS = new Set([
  "codex-skills/controls-doctrine-operator",
  ".claude/skills/controls-doctrine-operator"
]);
const ALLOWED_FRONTMATTER = new Set(["name", "description", "license", "allowed-tools", "metadata"]);

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error("SKILL.md requires a leading YAML frontmatter block.");
  const values = {};
  for (const [index, line] of match[1].split("\n").entries()) {
    if (!line.trim()) continue;
    const field = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/);
    if (!field) throw new Error(`Unsupported frontmatter syntax on line ${index + 2}.`);
    const [, key, value] = field;
    if (!ALLOWED_FRONTMATTER.has(key)) throw new Error(`Unexpected frontmatter key ${key}.`);
    if (Object.prototype.hasOwnProperty.call(values, key)) throw new Error(`Duplicate frontmatter key ${key}.`);
    values[key] = value.trim();
  }
  return { values, body: content.slice(match[0].length) };
}

function validateSkill(target) {
  if (!ALLOWED_TARGETS.has(target)) throw new Error(`Unsupported skill target ${target}.`);
  const skillRoot = path.resolve(ROOT, target);
  if (!skillRoot.startsWith(`${ROOT}${path.sep}`)) throw new Error("Skill target escapes doctrine root.");
  const skillPath = path.join(skillRoot, "SKILL.md");
  const stat = fs.lstatSync(skillPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("SKILL.md must be a regular non-symlink file.");
  const content = fs.readFileSync(skillPath, "utf8");
  const { values, body } = parseFrontmatter(content);
  if (!values.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.name) || values.name.length > 64) {
    throw new Error("Skill name must be non-empty hyphen-case with at most 64 characters.");
  }
  if (!values.description || values.description.length > 1024 || /[<>]/.test(values.description)) {
    throw new Error("Skill description must be 1-1024 characters and contain no angle brackets.");
  }
  if (!body.trim()) throw new Error("SKILL.md instruction body is empty.");
  const lineCount = content.split("\n").length;
  if (lineCount > 500) throw new Error(`SKILL.md exceeds the 500-line progressive-disclosure limit (${lineCount}).`);
  for (const requiredPath of ["scripts/route_controls_docs.js", "references/document-routing.md"]) {
    const candidate = path.join(skillRoot, requiredPath);
    if (!fs.existsSync(candidate) || !fs.lstatSync(candidate).isFile()) {
      throw new Error(`Skill is missing required support file ${requiredPath}.`);
    }
  }
  return { target, name: values.name, description_length: values.description.length, line_count: lineCount };
}

function main() {
  const target = process.argv[2];
  if (!target || process.argv.length !== 3) {
    console.error("Usage: node validate-controls-skill.js <codex-skills/controls-doctrine-operator|.claude/skills/controls-doctrine-operator>");
    process.exit(2);
  }
  try {
    process.stdout.write(`${JSON.stringify({ valid: true, ...validateSkill(target) }, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ valid: false, target, error: error.message }, null, 2)}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { parseFrontmatter, validateSkill };
