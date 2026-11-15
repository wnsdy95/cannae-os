#!/usr/bin/env node
const assert = require("node:assert/strict");
const path = require("node:path"), { spawnSync } = require("node:child_process");
const root = __dirname, results = [];
const platform = ["docs/reference-architecture.md", "docs/event-sourcing-model.md", "docs/data-model.sql.md"];
const base = "\uc81c\uacf5\ub41c \uc815\ucc45\uc744 \uadfc\uac70\ub85c \uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574. \uacf5\uac1c\ud558\uac70\ub098 \ub300\uc2dc\ubcf4\ub4dc\ub97c \ub9cc\ub4e4\uc9c0 \ub9c8.";
for (const provider of ["codex-skills", ".claude/skills"]) {
  const router = path.join(root, provider, "controls-doctrine-operator/scripts/route_controls_docs.js");
  const run = (query, args = []) => spawnSync(process.execPath, [router, "--doctrine-root=" + root, ...args, "--", query],
    { cwd: root, encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  const route = (query, args) => {
    const r = run(query, args); assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout); assert.equal(v.query, query);
    assert.equal(v.request_intake.normalization.kind, "bounded_korean_lexical_view_v1");
    assert.equal(v.request_intake.normalization.complete_translation, false);
    assert.equal(v.request_intake.semantic_completeness_verified, false);
    assert.equal(v.request_intake.authority_changed, false);
    assert.equal(v.capability_routing.provisional_organization.authority_expansion_authorized, false);
    return v;
  };
  const test = (name, fn) => { try { fn(); results.push({ provider, name, passed: true }); }
    catch (error) { results.push({ provider, name, passed: false, error: error.message }); } };
  for (const query of [base, "\uc694\uccad: " + base, "**\uacfc\uc5c5:** " + base,
    "\uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574\uc8fc\uc138\uc694. \ub300\uc2dc\ubcf4\ub4dc\uc640 \uc11c\ubc84\ub294 \ubcf4\ub958\ud574.",
    "\uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574. \ub300\uc2dc\ubcf4\ub4dc\uc640 \uc11c\ubc84\ub97c \uc81c\uc678\ud574.",
    "\uc778\uc218\uc778\uacc4 \ubb38\uc11c\ub97c \uc791\uc131\ud574. \ub300\uc2dc\ubcf4\ub4dc\ub97c \ub9cc\ub4e4\uc9c0 \ub9c8\uc138\uc694.",
    "\uc870\uc0ac \ubcf4\uace0\uc11c\ub97c \uc791\uc131\ud574. \ub300\uc2dc\ubcf4\ub4dc\ub294 \ubcf4\ub958."]) test("original Korean format and exclusions: " + query, () => {
      const v = route(query, ["--actor=ai", "--role=S4", "--department=knowledge", "--authority=read-only"]);
      assert.equal(v.capability_routing.status, "covered");
      assert(v.recommended_documents.some(d => d.path === "docs/document-authoring-workflow.md"));
      assert(v.recommended_documents.some(d => d.path === "docs/knowledge-management-sop.md"));
      assert(!v.recommended_documents.some(d => platform.includes(d.path)));
      assert.equal(v.operating_mode.role, "S4"); assert.equal(v.operating_mode.authority, "read-only");
    });
  test("retained exclusions still select release controls", () => {
    const v = route(base);
    assert(v.validation_commands.includes("node run-release-integration-fixtures.js"));
  });
  for (const query of ["\uace0\uac1d \uc2dc\uc7a5\uc744 \ubd84\uc11d\ud558\uace0 \uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574. \uacf5\uac1c\ud558\uc9c0 \ub9c8.",
    "\uace0\uac1d \uc2dc\uc7a5\uc744 \ubd84\uc11d\ud558\uace0 \uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574. \uacf5\uac1c\ud558\uc9c0 \ub9c8.".normalize("NFD"),
    "\uace0\uac1d \uc2dc\uc7a5\uc744 \ube44\uad50\ud55c \ub4a4 \uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574.",
    "\uace0\uac1d \uc2dc\uc7a5\uc744 \ubd84\uc11d\ud574. \uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574.",
    "Analyze the customer market; \uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574."]) test("compound Korean gap: " + query, () => {
      const v = route(query); assert.equal(v.capability_routing.status, "gap_detected");
      assert.equal(v.capability_assessments.length, 2);
      assert.equal(v.capability_assessments[0].status, "gap_detected");
      assert.equal(v.capability_assessments[1].status, "covered");
      for (const item of v.capability_assessments) assert(query.includes(item.query));
      assert(v.validation_commands.includes("node run-force-structure-change-fixtures.js"));
    });
  for (const query of ["\ub300\uc2dc\ubcf4\ub4dc\ub97c \uac80\ud1a0\ud574. \uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574.",
    "\uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574. \uc2b9\uc778 \uc5c6\uc774\ub294 \ub300\uc2dc\ubcf4\ub4dc\ub97c \ub9cc\ub4e4\uc9c0 \ub9c8.",
    "\ub300\uc2dc\ubcf4\ub4dc\ub97c \ub9cc\ub4e4\uc9c0 \ub9c8. \uadf8 \uc124\uacc4\ub97c \uac80\ud1a0\ud574."]) test("retain actual or conditional technical context: " + query, () => {
      const v = route(query); assert(v.recommended_documents.some(d => platform.includes(d.path)));
    });
  test("explicit technical source survives an exclusion", () => {
    const v = route(base, ["--source=docs/event-sourcing-model.md"]);
    assert(v.recommended_documents.some(d => d.path === "docs/event-sourcing-model.md"));
  });
  test("explicit parent objective keeps its technical sources", () => {
    const v = route(base, ["--capability-query=Review the dashboard architecture"]);
    assert(v.recommended_documents.some(d => d.path === "docs/reference-architecture.md"));
    assert.equal(v.capability_query, "Review the dashboard architecture");
  });
  test("output language does not imply military source reading", () => {
    const v = route("\uc6d0\ubcf8 \uc815\ucc45\uc744 \uac80\ud1a0\ud558\uace0 \uc870\uc0ac \ubcf4\uace0\uc11c\ub97c \ud55c\uad6d\uc5b4\ub85c \uc791\uc131\ud574.");
    assert.equal(v.capability_routing.status, "covered");
    assert(!v.recommended_documents.some(d => d.path === "docs/korean-military-sources.md"));
  });
  test("military subject still needs its source guides", () => {
    const v = route("\ud55c\uad6d\uad70 \uad50\ub9ac\ub97c \uac80\ud1a0\ud558\uace0 \uc870\uc0ac \ubcf4\uace0\uc11c\ub97c \uc791\uc131\ud574.");
    assert(v.recommended_documents.some(d => d.path === "docs/korean-military-sources.md"));
  });
  test("quotes cannot manufacture independent objectives", () => {
    const v = route('"\uace0\uac1d \uc2dc\uc7a5\uc744 \ubd84\uc11d\ud558\uace0 \uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574"\ub77c\ub294 \uc694\uccad\uc744 \uac80\ud1a0\ud574.');
    assert.equal(v.capability_assessments, undefined);
  });
  test("canonical Unicode matching does not rewrite original bytes", () => {
    const query = base.normalize("NFD"), v = route(query);
    assert.equal(v.query, query); assert.equal(v.capability_routing.status, "covered");
  });
  test("a noun prefix is not an alias for a longer unknown word", () => {
    assert.equal(route("\uc808\ucc28\uc11c\ub958\ub97c \uc815\ub9ac\ud574.").capability_routing.status, "gap_detected");
  });
  test("an explicitly declared Korean parent remains separate from a covered format", () => {
    const parent = "\uace0\uac1d \uc2dc\uc7a5\uc744 \ubd84\uc11d\ud574.", v = route(base, ["--capability-query=" + parent]);
    assert.equal(v.capability_query, parent); assert.equal(v.capability_routing.status, "gap_detected");
  });
  test("a single original-language guarded parent retains full receipt controls", () => {
    const query = "\uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574.";
    const r = run(query, ["--receipt", "--scope=agent", "--mission=MIS-KO", "--wave=W1", "--agent=ko-agent",
      "--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution", "--capability-query=" + query]);
    assert.equal(r.status, 0, r.stderr);
    const receipt = JSON.parse(r.stdout); assert.equal(receipt.router_query, query); assert.equal(receipt.capability_query, query);
    assert.equal(receipt.request_intake, undefined);
    assert(receipt.recommended_documents.some(d => d.path === "docs/protected-process-execution.md"));
  });
  test("English task exposes normalization provenance for its Korean parent", () => {
    const parent = "\uace0\uac1d \uc2dc\uc7a5\uc744 \ubd84\uc11d\ud574.", v = route("Draft a support SOP.", ["--capability-query=" + parent]);
    assert.equal(v.capability_query, parent); assert.equal(v.capability_routing.status, "gap_detected");
    const n = v.request_intake.normalization;
    assert.equal(n.original_objectives_in, "capability_query");
    assert.equal(n.objective_views.length, 1); assert.equal(n.objective_views[0].objective_index, 0);
    assert(n.objective_views[0].matching_query.startsWith("analyze "));
  });
  test("operational clauses cannot hide behind a Korean or English document match", () => {
    for (const query of ["\uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574. \ub3c4\uad6c\ub97c \uc2e4\ud589\ud574.", "Draft a support SOP. Execute the supplied tool."]) {
      const r = run(query, ["--actor=ai", "--role=S3", "--department=operations", "--authority=read-only"]);
      assert.equal(r.status, 0, r.stderr); const v = JSON.parse(r.stdout);
      assert.equal(v.operating_mode.authority, "read-only"); assert.equal(v.capability_routing.status, "gap_detected");
      assert(v.recommended_documents.some(d => d.path === "docs/protected-process-execution.md"));
      assert.deepEqual(v.capability_assessments.map(x => x.status), ["covered", "gap_detected"]);
      const guarded = run(query, ["--receipt", "--scope=agent", "--mission=MIS-KO", "--wave=W1", "--agent=ko-agent",
        "--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"]);
      assert.equal(guarded.status, 2); assert.match(guarded.stderr, /MULTI_OBJECTIVE_MODE_UNSUPPORTED/);
      assert.equal(guarded.stdout, "");
    }
  });
  test("automatic compound guarded tasking fails without a receipt", () => {
    const r = run("\uace0\uac1d \uc2dc\uc7a5\uc744 \ubd84\uc11d\ud558\uace0 \uc9c0\uc6d0 \uc808\ucc28\uc11c\ub97c \uc791\uc131\ud574.", ["--receipt", "--scope=agent", "--mission=KO", "--wave=W1",
      "--agent=S3", "--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"]);
    assert.equal(r.status, 2); assert.match(r.stderr, /MULTI_OBJECTIVE_MODE_UNSUPPORTED/); assert.equal(r.stdout, "");
  });
}
for (const r of results) console.log(`${r.passed ? "PASS" : "FAIL"} ${r.provider}: ${r.name}${r.error ? ": " + r.error : ""}`);
console.log(JSON.stringify({ valid: results.every(r => r.passed), fixtures: results.length,
  passed: results.filter(r => r.passed).length, native_model_calls: 0, withheld_executions: 0 }));
process.exitCode = results.every(r => r.passed) ? 0 : 1;
