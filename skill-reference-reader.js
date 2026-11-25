#!/usr/bin/env node

const fs = require("node:fs"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readBoundFile } = require("./project-terminology");
const { hash } = require("./skill-evaluation-runner");

const fail = code => { throw new Error(`SKILL_REFERENCE_${code}`); };
const allowed = file => typeof file === "string" && (/^docs\/[a-z0-9][a-z0-9.-]*\.md$/.test(file) ||
  file === "README.md" || /^(?:codex-skills|\.claude\/skills)\/controls-doctrine-operator\/(?:SKILL\.md|references\/[a-z0-9-]+\.md)$/.test(file));

function trackedRoot(repository, file) {
  if (!allowed(file)) fail("PATH_INVALID");
  const root = fs.realpathSync(repository);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const git = args => spawnSync("git", ["-C", root, ...args], { env, encoding: "utf8", timeout: 10000 });
  const top = git(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0 || top.stdout.trim() !== root) fail("ROOT_INVALID");
  if (git(["ls-files", "--error-unmatch", "--", file]).status !== 0) fail("UNTRACKED_SOURCE");
  return root;
}

function readReference(repository, selection) {
  const names = selection?.mode === "index" ? ["file", "mode"] : selection?.mode === "full"
    ? ["file", "mode", "sha256"] : ["file", "mode", "sha256", "start_line", "end_line"];
  if (!selection || Array.isArray(selection) || typeof selection !== "object" ||
      Object.keys(selection).length !== names.length || !names.every(key => Object.hasOwn(selection, key)) ||
      !["index", "full", "lines"].includes(selection.mode) ||
      (selection.mode !== "index" && !/^[a-f0-9]{64}$/.test(selection.sha256 || ""))) fail("SELECTION_INVALID");
  const root = trackedRoot(repository, selection.file);
  const { bytes, digest } = readBoundFile(root, selection.file);
  const content = bytes.toString("utf8");
  if (!content.trim() || !Buffer.from(content).equals(bytes)) fail("ENCODING_INVALID");
  if (selection.mode !== "index" && selection.sha256 !== digest) fail("SOURCE_CHANGED");
  // Physical lines, not Markdown sections: ranges retain original CRLF/UTF-8 bytes.
  const lines = content.match(/[^\n]*\n|[^\n]+$/g) || [];
  const result = {
    type: "ControlsReferenceRead", version: 1, path: selection.file, mode: selection.mode,
    source_sha256: digest, source_bytes: bytes.length, source_lines: lines.length,
    emitted_body_bytes: 0, navigation_text_bytes: 0, source_content_complete: false, semantic_completeness_verified: false,
    native_read_verified: false, access_authorized: false, transfer_authorized: false,
    issued_controls_changed: false
  };
  if (selection.mode === "index") {
    result.navigation = { kind: "literal_heading_lines_not_markdown_parse",
      entries: lines.flatMap((line, index) => /^#{1,6} /.test(line)
        ? [{ line: index + 1, text: line.replace(/\r?\n$/, "") }] : []) };
    result.navigation_text_bytes = result.navigation.entries.reduce((sum, entry) => sum + Buffer.byteLength(entry.text), 0);
  } else {
    const first = selection.mode === "full" ? 1 : selection.start_line;
    const last = selection.mode === "full" ? lines.length : selection.end_line;
    if (![first, last].every(Number.isSafeInteger) || first < 1 || last < first || last > lines.length) fail("RANGE_INVALID");
    const start = Buffer.byteLength(lines.slice(0, first - 1).join(""));
    const end = start + Buffer.byteLength(lines.slice(first - 1, last).join(""));
    const selected = bytes.subarray(start, end);
    Object.assign(result, { content: selected.toString("utf8"), emitted_body_bytes: selected.length,
      excerpt_sha256: hash(selected), source_content_complete: start === 0 && end === bytes.length,
      range: { start_line: first, end_line: last, start_byte: start, end_byte_exclusive: end } });
  }
  if (readBoundFile(root, selection.file).digest !== digest) fail("SOURCE_CHANGED");
  return result;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (!["--file", "--sha256", "--lines", "--index", "--full"].includes(key) || Object.hasOwn(options, key)) fail("ARGUMENTS_INVALID");
    if (["--index", "--full"].includes(key)) options[key] = true;
    else {
      const value = argv[++index];
      if (!value || value.startsWith("--")) fail("ARGUMENTS_INVALID");
      options[key] = value;
    }
  }
  if (!options["--file"] || ["--index", "--full", "--lines"].filter(key => Object.hasOwn(options, key)).length !== 1 ||
      Boolean(options["--index"]) === Object.hasOwn(options, "--sha256")) fail("ARGUMENTS_INVALID");
  const selection = { file: options["--file"], mode: options["--index"] ? "index" : options["--full"] ? "full" : "lines" };
  if (selection.mode !== "index") selection.sha256 = options["--sha256"];
  if (selection.mode === "lines") {
    if (!/^[1-9]\d*:[1-9]\d*$/.test(options["--lines"])) fail("ARGUMENTS_INVALID");
    [selection.start_line, selection.end_line] = options["--lines"].split(":").map(Number);
  }
  return selection;
}

function main(argv = process.argv.slice(2), repository = __dirname) {
  try {
    const result = readReference(repository, parseArgs(argv));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    console.error(/^SKILL_REFERENCE_[A-Z_]+$/.test(error.message) ? error.message : "SKILL_REFERENCE_UNAVAILABLE");
    process.exitCode = 2;
  }
}

if (require.main === module) main();
module.exports = { readReference, parseArgs, main };
