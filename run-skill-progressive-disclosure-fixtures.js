#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { TOPICS, readInstructions, parseArgs } = require("./codex-skills/controls-doctrine-operator/scripts/read_controls_instructions");
const { validateSkill } = require("./validate-controls-skill");

const ROOT = __dirname, NAME = "controls-doctrine-operator";
const providers = ["codex-skills", ".claude/skills"];
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-instructions-")));
const hash = value => createHash("sha256").update(value).digest("hex");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CANNAE_OS_HOME"));
let passed = 0;
function fixture(name, check) { check(); passed++; console.log("PASS " + name); }
function execute(script, args, status = 0) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: temporary, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, status, result.stderr);
  if (status) { assert.equal(result.stdout, ""); return result; }
  return JSON.parse(result.stdout);
}
function route(provider, query, args = []) {
  return execute(path.join(ROOT, provider, NAME, "scripts/route_controls_docs.js"),
    ["--actor=user", "--explain-reading", "--doctrine-root=" + ROOT, ...args, "--", query]);
}
const paths = topic => providers.map(provider => provider + "/" + NAME + "/" + TOPICS[topic]);
function containsTopics(result, topics) {
  for (const topic of topics) for (const file of paths(topic)) {
    assert(result.recommended_documents.some(row => row.path === file), file);
    assert(result.reading_selection.documents.find(row => row.path === file).reasons.some(reason =>
      reason.kind === "conditional_instruction" && reason.selected), file);
  }
  assert.equal(result.reading_selection.access_authorized, false);
  assert.equal(result.reading_selection.required_reading_assessed, false);
}
try {
  const project = path.join(temporary, "input-project");
  fs.mkdirSync(project);
  const initialized = spawnSync("git", ["init", "-q", project], { env, encoding: "utf8" });
  assert.equal(initialized.status, 0, initialized.stderr);
  fs.writeFileSync(path.join(project, "SUPPORT.md"), "Synthetic project source. No publication.\n");
  for (const [index, provider] of providers.entries()) {
    const directory = path.join(ROOT, provider, NAME), helper = path.join(directory, "scripts/read_controls_instructions.js");
    fixture(provider + ": entry reduction preserves linked phase instructions", () => {
      const entry = readInstructions(directory);
      assert.equal(entry.documents.length, 1);
      assert(entry.emitted_content_bytes <= [32902, 32916][index] * 0.8);
      const result = validateSkill(provider + "/" + NAME);
      assert(result.line_count <= 500); assert.equal(result.instruction_document_count, 5);
      for (const topic of Object.keys(TOPICS)) assert(entry.documents[0].content.includes("](" + TOPICS[topic] + ")"));
      for (const text of ["before its corresponding phase", "a link is not delivery", "not unrelated permitted drafting"]) {
        assert(entry.documents[0].content.includes(text));
      }
    });
    fixture(provider + ": helper emits exact linked content and no receipt or reading claim", () => {
      for (const topics of [[], ["project-content"], ["project-terms"], Object.keys(TOPICS).reverse()]) {
        const context = execute(helper, topics.map(topic => "--topic=" + topic));
        assert.deepEqual(context, readInstructions(directory, topics));
        assert.deepEqual(context.topics, Object.keys(TOPICS).filter(topic => topics.includes(topic)));
        for (const document of context.documents) {
          const source = fs.readFileSync(path.join(directory, document.path));
          assert.equal(document.content, source.toString("utf8"));
          assert.equal(document.bytes, source.length); assert.equal(document.sha256, hash(source));
        }
        assert.equal(context.emitted_content_bytes, context.documents.reduce((sum, row) => sum + row.bytes, 0));
        assert.equal(context.content_set_sha256, hash(JSON.stringify(context.documents.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })))));
        for (const key of ["native_read_verified", "semantic_completeness_verified", "transfer_authorized", "project_content_read"]) assert.equal(context[key], false);
      }
      assert.deepEqual(execute(helper, ["--all"]), readInstructions(directory, Object.keys(TOPICS)));
    });
    fixture(provider + ": invalid topic arguments emit no partial instruction data", () => {
      for (const args of [["--topic=../secret"], ["--topic"], ["--topic=project-terms", "--topic", "project-terms"],
        ["--all", "--all"], ["--all", "--topic=project-content"], ["--root=" + ROOT], ["project-terms"]]) {
        const rejected = execute(helper, args, 2);
        assert.match(rejected.stderr, /^SKILL_INSTRUCTION_(ARGUMENTS|TOPICS)_INVALID\n$/);
      }
    });
    fixture(provider + ": ordinary drafting does not automatically load specialist modules", () => {
      for (const task of ["Draft a support SOP.", "Task: Draft a support SOP through Codex.",
        "Revise a support SOP. Do not build a dashboard.", "Review a research note without a standalone server.",
        "Draft an OPORD from the supplied policy.", "Draft an ordinary handoff document from supplied text."]) {
        const result = route(provider, task);
        assert(!result.recommended_documents.some(row => Object.keys(TOPICS).some(topic => paths(topic).includes(row.path))), task);
        assert(result.recommended_documents.some(row => row.path === "docs/document-authoring-workflow.md" ||
          row.path === "docs/prompt-templates.md"), task);
      }
    });
    fixture(provider + ": terminology sensitive content and client phases select their guides", () => {
      containsTopics(route(provider, "Review the project glossary."), ["project-terms"]);
      containsTopics(route(provider, "Prepare a project document packet."), ["project-content"]);
      const input = route(provider, "Draft a support SOP.", ["--input-repository=" + project, "--input-source=SUPPORT.md"]);
      containsTopics(input, ["project-content"]);
      assert(input.task_inputs.sources.some(row => row.path === "SUPPORT.md"));
      assert.equal(input.task_inputs.content_loaded, false);
      assert.equal(input.task_inputs.authorization_verified, false);
      containsTopics(route(provider, "Review document access manifest sources."), ["project-content"]);
      containsTopics(route(provider, "Diagnose native CLI tool-channel failure."), ["client-operation"]);
      containsTopics(route(provider, "Maintain the operator skill instructions."), Object.keys(TOPICS));
      const file = paths("project-content")[index];
      const explicit = route(provider, "Draft a support SOP.", ["--source=" + file, "--source=SUPPORT.md"]);
      containsTopics(explicit, ["project-content"]);
      for (const topic of ["project-terms", "delegated-waves", "client-operation"]) {
        assert(!explicit.recommended_documents.some(row => paths(topic).includes(row.path)));
      }
      assert(explicit.recommended_documents.some(row => row.path === "SUPPORT.md"));
      const released = route(provider, "Draft a support SOP. Do not publish.");
      for (const command of ["node run-authority-integration-fixtures.js", "node run-release-integration-fixtures.js"]) {
        assert(released.validation_commands.includes(command));
      }
    });
  }
  fixture("mirrored readers and guides are byte-identical", () => {
    for (const file of ["scripts/read_controls_instructions.js", ...Object.values(TOPICS)]) {
      assert.deepEqual(...providers.map(provider => fs.readFileSync(path.join(ROOT, provider, NAME, file))));
    }
  });
  fixture("ambiguous generic order wording retains its unresolved capability gap", () => {
    for (const provider of providers) {
      const result = route(provider, "Draft an order from the supplied policy.");
      assert.equal(result.capability_routing.status, "gap_detected");
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
    }
  });
  fixture("topic parsing and direct library calls reject unknown or duplicate values", () => {
    assert.deepEqual(parseArgs(["--topic", "project-terms"]), ["project-terms"]);
    for (const topics of ["project-terms", [null], ["bad"], ["project-terms", "project-terms"]]) {
      assert.throws(() => readInstructions(path.join(ROOT, providers[0], NAME), topics), /SKILL_INSTRUCTION_TOPICS_INVALID/);
    }
  });
  const copy = path.join(temporary, "copy");
  fs.cpSync(path.join(ROOT, providers[0], NAME), copy, { recursive: true });
  const helper = path.join(copy, "scripts/read_controls_instructions.js"), reference = path.join(copy, TOPICS["project-content"]);
  const original = fs.readFileSync(reference), entry = path.join(copy, "SKILL.md"), entryBytes = fs.readFileSync(entry);
  fixture("missing unlinked empty and invalid UTF-8 files fail without partial emission", () => {
    for (const mode of ["missing", "unlinked", "empty", "encoding"]) {
      try {
        if (mode === "missing") fs.unlinkSync(reference);
        if (mode === "unlinked") fs.writeFileSync(entry, entryBytes.toString().replace("](" + TOPICS["project-content"] + ")", "](not-assigned.md)"));
        if (mode === "empty") fs.writeFileSync(reference, " \n");
        if (mode === "encoding") fs.writeFileSync(reference, Buffer.from([0xff]));
        const result = execute(helper, ["--topic=project-content"], 2);
        assert.match(result.stderr, /^SKILL_INSTRUCTION_[A-Z_]+\n$/);
        assert(!result.stderr.includes(temporary));
      } finally { fs.writeFileSync(reference, original); fs.writeFileSync(entry, entryBytes); }
    }
  });
  fixture("symlinked entries references and intermediate directories fail closed", () => {
    for (const relative of ["SKILL.md", TOPICS["project-content"], "references"]) {
      const file = path.join(copy, relative), backup = file + ".backup";
      fs.renameSync(file, backup);
      try {
        fs.symlinkSync(backup, file);
        const result = execute(helper, ["--topic=project-content"], 2);
        assert.equal(result.stderr, "SKILL_INSTRUCTION_SYMLINK\n");
      } finally { fs.unlinkSync(file); fs.renameSync(backup, file); }
    }
  });
  console.log(JSON.stringify({ valid: true, fixtures: passed, native_client_execution: false,
    actual_client_delivery_bytes: null, actual_home_modified: false }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
