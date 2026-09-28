#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { auditRegistry, candidateId, extractCandidates, scanCandidates, verifyRegistry } = require("./implementation-candidate-registry");
const { validatePayload } = require("./validator-cli-prototype/validate");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-registry-"));
const document = "docs/example.md";
const source = "# Example\n\n## 9. Implementation Candidates\n\n- `feature.js`: an example check.\n\n## Other\n- Not a candidate.\n";
const clone = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed += 1; console.log(`PASS ${name}`); }
function write(file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}
function git(args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
}
function hasCode(result, code) {
  assert.strictEqual(result.valid, false);
  assert((result.findings || result.issues).some(finding => finding.code === code), JSON.stringify(result));
}

try {
  git(["init", "--quiet"]);
  write(document, source);
  write("feature.js", "module.exports = true;\n");
  write("run-feature-fixtures.js", "process.stdout.write('synthetic-check-output');\n");
  git(["add", "."]);
  git(["-c", "user.name=Registry Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "fixture"]);
  const scan = scanCandidates(root);
  const registry = {
    schema_version: "0.1", type: "ImplementationCandidateRegistry",
    authority: { human_final_decision_authority: "USER", release_authorized: false, execution_authorized: false },
    sources: scan.sources,
    workstreams: [{ id: "example", title: "Example", owner_role: "S6", completion_criteria: ["Example behavior is tested."] }],
    entries: [{ ...scan.candidates[0], workstream_id: "example", implementation_status: "implemented",
      implementation_paths: ["feature.js"], acceptance_criteria: [{ id: "AC-1", requirement: "Example behavior is tested.",
        validation_commands: ["node run-feature-fixtures.js"] }], remaining_work: [], rationale: "Synthetic parser and execution fixture." }]
  };
  delete registry.entries[0].description;

  test("leading artifacts, directories, and narrative requirements, not inline references", () => {
    const text = "# Implementation Candidates\n- `feature.js`: checked by `run-extra.js`.\n- Panel: current work.\n- `feature/`: a directory.\n```md\n- `ignored.js`\n```\n# End\n- `other.js`\n";
    const found = extractCandidates(document, text).candidates;
    assert.deepStrictEqual(found.map(item => item.candidate_key), ["feature.js", "Panel: current work.", "feature/"]);
    assert.strictEqual(found[1].kind, "capability");
  });
  test("CRLF, nested subheadings, and multiline requirements", () => {
    const a = "## Implementation Candidates\n### Runners\n1. `feature.js`: checks\n   several conditions.\n";
    assert.deepStrictEqual(extractCandidates(document, a), extractCandidates(document, a.replace(/\n/g, "\r\n")));
    assert.match(extractCandidates(document, a).candidates[0].description, /several conditions/);
  });
  test("fenced heading cannot introduce a candidate section", () => assert.strictEqual(extractCandidates(document, "```md\n# Implementation Candidates\n- `fake.js`\n```\n"), null));
  test("empty, duplicate, and repeated sections fail", () => {
    for (const text of ["# Implementation Candidates\n", "# Implementation Candidates\n- `x.js`\n- `x.js`\n",
      "# Implementation Candidates\n- `x.js`\n# End\n# Implementation Candidates\n- `y.js`\n"]) {
      assert.throws(() => extractCandidates(document, text));
    }
  });
  test("identity binds source and key", () => {
    assert.notStrictEqual(candidateId("docs/other.md", "feature.js"), registry.entries[0].id);
    const changed = clone(registry); changed.entries[0].candidate_key = "other.js";
    hasCode(validatePayload(changed, "implementation-candidate-registry"), "CANDIDATE_ID_BINDING_MISMATCH");
  });
  test("valid audit is not execution proof or permission", () => {
    const result = auditRegistry(registry, root);
    assert.strictEqual(result.valid, true, JSON.stringify(result));
    assert.strictEqual(result.verification_executed, false);
    assert.strictEqual(result.release_authorized, false);
    assert.strictEqual(result.entries[0].proposed_path_present, true);
  });
  test("source drift fails", () => {
    write(document, source.replace("example check", "changed check"));
    hasCode(auditRegistry(registry, root), "CANDIDATE_SOURCE_DRIFT"); write(document, source);
  });
  test("new source and new candidate cannot go unregistered", () => {
    write("docs/extra.md", "# Implementation Candidates\n- `extra.js`\n");
    const result = auditRegistry(registry, root);
    hasCode(result, "CANDIDATE_SOURCE_DRIFT"); hasCode(result, "CANDIDATE_UNREGISTERED");
    fs.unlinkSync(path.join(root, "docs/extra.md"));
  });
  test("removed source is not silently dropped", () => {
    write(document, "# No candidates\n"); hasCode(auditRegistry(registry, root), "CANDIDATE_SOURCE_REMOVED"); write(document, source);
  });
  test("orphan entry fails", () => {
    const changed = clone(registry); changed.entries[0].candidate_key = "other.js";
    changed.entries[0].id = candidateId(document, "other.js");
    hasCode(auditRegistry(changed, root), "CANDIDATE_IDENTITY_MISMATCH");
  });
  test("duplicate identities fail", () => {
    for (const field of ["entries", "sources", "workstreams"]) {
      const changed = clone(registry); changed[field].push(clone(changed[field][0]));
      hasCode(validatePayload(changed, "implementation-candidate-registry"), "CANDIDATE_DUPLICATE_IDENTITY");
    }
  });
  test("unknown workstream fails", () => {
    const changed = clone(registry); changed.entries[0].workstream_id = "unregistered";
    hasCode(validatePayload(changed, "implementation-candidate-registry"), "CANDIDATE_REFERENCE_UNKNOWN");
  });
  test("completion needs files, every criterion's check, and no residual work", () => {
    for (const mutation of [entry => entry.implementation_paths = [], entry => entry.remaining_work = ["Unfinished"],
      entry => entry.acceptance_criteria[0].validation_commands = [], entry => entry.acceptance_criteria = []]) {
      const changed = clone(registry); mutation(changed.entries[0]);
      hasCode(validatePayload(changed, "implementation-candidate-registry"), "CANDIDATE_COMPLETION_UNPROVEN");
    }
  });
  test("unfinished statuses cannot hide remaining work", () => {
    const changed = clone(registry); changed.entries[0].implementation_status = "partial";
    hasCode(validatePayload(changed, "implementation-candidate-registry"), "CANDIDATE_REMAINING_WORK_REQUIRED");
    changed.entries[0].remaining_work = ["Integrate."]; changed.entries[0].implementation_paths = [];
    hasCode(validatePayload(changed, "implementation-candidate-registry"), "CANDIDATE_PARTIAL_MAPPING_REQUIRED");
  });
  test("authority cannot be gained from a registry", () => {
    const changed = clone(registry); changed.authority.release_authorized = true;
    hasCode(validatePayload(changed, "implementation-candidate-registry"), "CONST_MISMATCH");
  });
  test("additional properties fail", () => {
    const changed = clone(registry); changed.entries[0].verified = true;
    hasCode(validatePayload(changed, "implementation-candidate-registry"), "ADDITIONAL_PROPERTY");
  });
  test("missing and escaped mappings fail", () => {
    for (const file of ["missing.js", "../outside.js", "./feature.js"]) {
      const changed = clone(registry); changed.entries[0].implementation_paths = [file];
      hasCode(auditRegistry(changed, root), "CANDIDATE_IMPLEMENTATION_MISSING");
    }
  });
  test("symlink implementation cannot supply evidence", () => {
    fs.symlinkSync(path.join(root, "feature.js"), path.join(root, "link.js"));
    const changed = clone(registry); changed.entries[0].implementation_paths = ["link.js"];
    hasCode(auditRegistry(changed, root), "CANDIDATE_IMPLEMENTATION_MISSING"); fs.unlinkSync(path.join(root, "link.js"));
  });
  test("shell, non-fixture, argument, recursive, and escaped checks fail", () => {
    write("run-all-fixtures.js", "process.exit(0);\n");
    write("run-implementation-candidate-registry-fixtures.js", "process.exit(0);\n");
    for (const command of ["node run-feature-fixtures.js; id", "node feature.js", "node run-feature-fixtures.js --skip",
      "node run-all-fixtures.js", "node run-implementation-candidate-registry-fixtures.js", "node ../run-outside.js"]) {
      const changed = clone(registry); changed.entries[0].acceptance_criteria[0].validation_commands = [command];
      hasCode(auditRegistry(changed, root), "CANDIDATE_CHECK_UNSAFE");
    }
  });
  test("parent symlink cannot escape the source root", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-registry-outside-"));
    try {
      fs.writeFileSync(path.join(outside, "run-outside.js"), "process.exit(0);\n");
      fs.symlinkSync(outside, path.join(root, "context-filter-prototype"));
      const changed = clone(registry);
      changed.entries[0].acceptance_criteria[0].validation_commands = ["node context-filter-prototype/run-outside.js"];
      hasCode(auditRegistry(changed, root), "CANDIDATE_CHECK_UNSAFE");
    } finally {
      fs.unlinkSync(path.join(root, "context-filter-prototype"));
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
  test("execution records hashes, not raw output", () => {
    const result = verifyRegistry(registry, root);
    assert.strictEqual(result.valid, true, JSON.stringify(result));
    assert.strictEqual(result.entire_registry_complete, true);
    assert.strictEqual(result.checks[0].status, "passed");
    assert.strictEqual(JSON.stringify(result).includes("synthetic-check-output"), false);
    assert.match(result.checks[0].script_sha256, /^[a-f0-9]{64}$/);
    assert.strictEqual(result.release_authorized, false);
  });
  test("source mutation during audit blocks before any check starts", () => {
    const readFileSync = fs.readFileSync;
    const sourcePath = path.join(fs.realpathSync(root), document);
    let mutated = false;
    try {
      fs.readFileSync = function(file, ...args) {
        const content = readFileSync.call(this, file, ...args);
        if (!mutated && file === sourcePath) {
          mutated = true;
          write(document, source + "Changed during audit.\n");
        }
        return content;
      };
      const result = verifyRegistry(registry, root);
      hasCode(result, "CANDIDATE_AUDIT_DRIFT");
      assert.strictEqual(result.verification_executed, false);
      assert.deepStrictEqual(result.checks, []);
    } finally {
      fs.readFileSync = readFileSync;
      write(document, source);
    }
  });
  test("unknown and conflicting selections cannot become completion", () => {
    assert.throws(() => verifyRegistry(registry, root, { candidate: "missing" }), /Unknown/);
    assert.throws(() => verifyRegistry(registry, root, { workstream: "missing" }), /Unknown/);
  });
  test("subset success cannot complete the entire registry and repeated checks run once", () => {
    const changed = clone(registry);
    write("docs/second.md", "# Implementation Candidates\n- `second.js`\n");
    changed.sources = scanCandidates(root).sources;
    changed.workstreams.push({ id: "second", title: "Second", owner_role: "S6", completion_criteria: ["Second integration."] });
    changed.entries.push({ ...clone(changed.entries[0]), id: candidateId("docs/second.md", "second.js"),
      source_document: "docs/second.md", candidate_key: "second.js", workstream_id: "second",
      implementation_status: "planned", implementation_paths: [], remaining_work: ["Second integration."] });
    const selected = verifyRegistry(changed, root, { workstream: "example" });
    assert.strictEqual(selected.valid, true); assert.strictEqual(selected.selected_scope_complete, true);
    assert.strictEqual(selected.entire_registry_complete, false);
    const all = verifyRegistry(changed, root);
    assert.strictEqual(all.checks.length, 1); assert.strictEqual(all.entire_registry_complete, false);
    assert.throws(() => verifyRegistry(changed, root, { workstream: "second", candidate: changed.entries[0].id }), /empty/);
    fs.unlinkSync(path.join(root, "docs/second.md"));
  });
  test("provider credential environment is not forwarded", () => {
    const previous = process.env.CANNAE_FIXTURE_TOKEN;
    try {
      process.env.CANNAE_FIXTURE_TOKEN = "synthetic-never-forward";
      write("run-feature-fixtures.js", "if (process.env.CANNAE_FIXTURE_TOKEN) process.exit(1);\n");
      assert.strictEqual(verifyRegistry(registry, root).valid, true);
    } finally {
      if (previous === undefined) delete process.env.CANNAE_FIXTURE_TOKEN;
      else process.env.CANNAE_FIXTURE_TOKEN = previous;
    }
  });
  test("existing filename alone does not complete a planned requirement", () => {
    const changed = clone(registry); changed.entries[0].implementation_status = "planned";
    changed.entries[0].remaining_work = ["Implement integration."];
    changed.entries[0].acceptance_criteria[0].validation_commands = [];
    const result = verifyRegistry(changed, root);
    assert.strictEqual(result.verification_status, "no_executable_checks");
    assert.strictEqual(result.entire_registry_complete, false);
    assert.deepStrictEqual(result.verified_implemented_ids, []);
  });
  test("nonzero exit cannot prove implementation", () => {
    write("run-feature-fixtures.js", "process.exit(1);\n");
    const result = verifyRegistry(registry, root);
    assert.strictEqual(result.valid, false); assert.deepStrictEqual(result.verified_implemented_ids, []);
  });
  test("source mutation invalidates a zero-exit check", () => {
    write("run-feature-fixtures.js", "require('fs').appendFileSync('feature.js', '// changed\\n');\n");
    const result = verifyRegistry(registry, root);
    assert.strictEqual(result.valid, false); assert.strictEqual(result.repository_unchanged, false);
    assert.strictEqual(result.checks[0].status, "failed");
  });
  test("timeout cannot prove implementation", () => {
    write("run-feature-fixtures.js", "setTimeout(() => {}, 10000);\n");
    const result = verifyRegistry(registry, root, { timeoutMs: 30 });
    assert.strictEqual(result.valid, false); assert.strictEqual(result.checks[0].exit_code, null);
  });
  test("canonical registry covers current corpus", () => {
    const canonical = JSON.parse(fs.readFileSync(path.join(__dirname, "docs/implementation-candidate-registry.json"), "utf8"));
    const result = auditRegistry(canonical, __dirname);
    assert.strictEqual(result.valid, true, JSON.stringify(result.findings));
  });
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({ valid: true, total: passed, passed, failed: 0 }));
