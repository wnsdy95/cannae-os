#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto"), { TextDecoder } = require("node:util");
const { identity, readBoundFile } = require("./project-terminology");

const ROOT = __dirname, NAME = "controls-doctrine-operator", MARKER = ".cannae-os-root";
const hash = value => createHash("sha256").update(value).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = code => { throw new Error("SKILL_INSTALLATION_" + code); };
const flags = () => ({ installed_code_executed: false, native_discovery_verified: false,
  native_body_read_verified: false, workflow_execution_verified: false,
  settings_changed: false, installation_changed: false, can_execute: false });
function git(root, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const result = spawnSync("git", ["-C", root, ...args], { env, encoding: "utf8", timeout: 5000, maxBuffer: 128 * 1024 });
  if (result.status !== 0) fail("SOURCE_UNAVAILABLE");
  return result.stdout;
}
function sourceInventory(root, prefix) {
  const files = [...new Set(git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", prefix]).split("\0").filter(Boolean))].sort();
  const relative = files.map(file => file.slice(prefix.length + 1));
  if (!files.length || files.length > 256 || files.some(file => !file.startsWith(prefix + "/")) ||
      relative.some(file => !file || file.split("/").some(part => !part || part.startsWith(".")) || /[\\:\x00-\x1f\x7f]/.test(file)) ||
      !relative.includes("SKILL.md") || !relative.includes("scripts/route_controls_docs.js")) fail("SOURCE_INVENTORY_INVALID");
  return relative;
}
function fileObservation(root, relative) {
  const value = readBoundFile(root, relative, 4 * 1024 * 1024);
  return { sha256: value.digest, bytes: value.bytes.length, executable: Boolean(fs.lstatSync(path.join(root, relative)).mode & 0o111) };
}
function sourceSnapshot(root, prefix) {
  const files = sourceInventory(root, prefix);
  return { revision: git(root, ["rev-parse", "HEAD"]).trim(),
    files: files.map(file => ({ path: file, ...fileObservation(root, prefix + "/" + file) })) };
}
function installedSnapshot(root, expected, sourceRoot, corpusRoot) {
  const findings = [], add = (file, code) => findings.push({ path: file, code });
  const expectedFiles = new Set(expected.map(item => item.path)), directories = new Set([""]);
  for (const file of expectedFiles) {
    const parts = file.split("/"); parts.pop();
    while (parts.length) { directories.add(parts.join("/")); parts.pop(); }
  }
  // Inspect only the known bundle tree. Never traverse or read an unexpected file.
  const walk = relative => {
    let entries;
    try { entries = fs.readdirSync(path.join(root, relative)); }
    catch { add(relative || ".", "directory_unavailable"); return; }
    if (entries.length > 256) fail("INSTALLED_INVENTORY_LIMIT");
    for (const name of entries.sort()) {
      const file = relative ? relative + "/" + name : name;
      if (!relative && name === MARKER) continue;
      if (!expectedFiles.has(file) && !directories.has(file)) { add(file, "unexpected_entry"); continue; }
      const stat = fs.lstatSync(path.join(root, file));
      if (stat.isSymbolicLink()) { add(file, "unsafe_entry"); continue; }
      if (directories.has(file)) {
        if (!stat.isDirectory()) add(file, "directory_unavailable"); else walk(file);
      }
    }
  };
  walk("");
  const files = expected.map(item => {
    try {
      const actual = fileObservation(root, item.path);
      if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) add(item.path, "content_differs");
      if (actual.executable !== item.executable) add(item.path, "executable_mode_differs");
      return { path: item.path, ...actual };
    } catch { add(item.path, "file_unavailable_or_unsafe"); return { path: item.path, sha256: null, bytes: null, executable: null }; }
  });
  let binding, markerSha256 = null;
  try {
    fs.lstatSync(path.join(root, MARKER));
    const value = readBoundFile(root, MARKER, 4096); markerSha256 = value.digest;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(value.bytes).replace(/\r?\n$/, "");
    if (!path.isAbsolute(text) || /[\r\n\x00]/.test(text)) binding = "marker_invalid";
    else binding = fs.realpathSync(text) === corpusRoot ? "marker_matches" : "marker_mismatch";
  } catch (error) {
    binding = error.code === "ENOENT" && markerSha256 === null
      ? root === sourceRoot ? "source_ancestry_matches" : "marker_missing"
      : "marker_unavailable_or_unsafe";
  }
  if (!["marker_matches", "source_ancestry_matches"].includes(binding)) add(MARKER, binding);
  return { files, findings, binding, marker_sha256: markerSha256 };
}

function inspectInstallation(provider, installed, repository = ROOT) {
  if (!["codex", "claude"].includes(provider) || typeof installed !== "string" || !path.isAbsolute(installed)) fail("ARGUMENTS_INVALID");
  const origin = identity(repository), prefix = (provider === "codex" ? "codex-skills" : ".claude/skills") + "/" + NAME;
  const sourceRoot = path.join(origin.root, prefix), source = sourceSnapshot(origin.root, prefix);
  const destination = fs.realpathSync(installed), installedStat = fs.lstatSync(installed);
  if (!fs.statSync(destination).isDirectory()) fail("INSTALLED_UNAVAILABLE");
  const actual = installedSnapshot(destination, source.files, sourceRoot, origin.root);
  if (!same(source, sourceSnapshot(origin.root, prefix)) || !same(origin, identity(repository))) fail("SOURCE_CHANGED");
  if (fs.realpathSync(installed) !== destination || !same(actual, installedSnapshot(destination, source.files, sourceRoot, origin.root))) fail("INSTALLED_CHANGED");
  const current = actual.findings.length === 0;
  return { type: "ControlsSkillInstallationInspection", version: "0.1", valid: current,
    status: current ? "matches_current_source" : "differs_or_unavailable", provider,
    installation: installedStat.isSymbolicLink() ? "link" : "directory", installed_path: installed,
    resolved_path: destination, corpus_root: origin.root, source_revision: source.revision,
    comparison_basis: "current_worktree_bytes_not_a_claim_of_committed_or_trusted_code",
    source_set_sha256: hash(JSON.stringify(source.files)), installed_set_sha256: hash(JSON.stringify(actual.files)),
    binding_scope: "default_marker_or_source_ancestry_only_invocation_overrides_not_assessed",
    binding: actual.binding, marker_sha256: actual.marker_sha256,
    source_files: source.files, installed_files: actual.files, findings: actual.findings, ...flags() };
}

function main(argv = process.argv.slice(2)) {
  try {
    const values = {};
    if (argv.length !== 4) fail("ARGUMENTS_INVALID");
    for (let index = 0; index < argv.length; index += 2) {
      const key = argv[index], value = argv[index + 1];
      if (!["--provider", "--installed"].includes(key) || Object.hasOwn(values, key) || !value) fail("ARGUMENTS_INVALID");
      values[key] = value;
    }
    const result = inspectInstallation(values["--provider"], values["--installed"]);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    const code = /^SKILL_INSTALLATION_[A-Z_]+$/.test(error.message || "") ? error.message : "SKILL_INSTALLATION_INPUT_UNAVAILABLE";
    process.stdout.write(JSON.stringify({ valid: false, status: "unavailable", code, ...flags() }) + "\n");
    process.exitCode = 1;
  }
}
module.exports = { inspectInstallation, main };
if (require.main === module) main();
