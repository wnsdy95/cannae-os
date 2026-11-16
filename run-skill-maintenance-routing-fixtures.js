#!/usr/bin/env node
const assert = require("node:assert/strict"), path = require("node:path"), { spawnSync } = require("node:child_process");
const root = __dirname;
const providers = ["codex-skills", ".claude/skills"];
const original = "Maintain the Controls skills and prepare a paired native context-reading evaluation for six fixed document tasks. Preserve exact historical and current instructions, assigned sources, authority and all reading bytes. No model transmission, dashboard or server development.";
const proposalRequest = "Maintain the Controls skill-context-evaluation: reconcile exact paired reference delivery and native client traces, preserve source appraisal and prepare a bounded approval proposal. No model transmission, dashboard or server development.";
const runtimeDocs = ["docs/reference-architecture.md", "docs/event-sourcing-model.md", "docs/command-post-dashboard.md",
  "docs/dashboard-wireframes.md", "docs/data-model.sql.md"];
let observations = 0, rejected = 0;
function route(provider, args, query) {
  const result = spawnSync(process.execPath, [path.join(root, provider, "controls-doctrine-operator/scripts/route_controls_docs.js"),
    ...args, "--", query], { cwd: root, encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout); observations++;
  assert.equal(out.query, query);
  assert.equal(out.capability_routing.provisional_organization.authority_expansion_authorized, false);
  assert.equal(out.capability_routing.provisional_organization.standing_department_activation_authorized, false);
  return out;
}
for (const provider of providers) {
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
    for (const query of ["Maintain the Controls skills", "Request: Maintain the Controls skills.",
      "Review our Cannae OS skills.", "Audit the installed Controls skill instructions.",
      "Fix the Controls document router.", "Please improve the Cannae document routing."]) {
      const out = route(provider, args, query);
      assert.equal(out.capability_routing.status, "covered", query);
      assert(out.capability_routing.matched_capability_routes.includes("skill-operations"));
      assert(out.recommended_documents.some(row => row.path === "docs/completion-backlog.md"));
      assert(out.validation_commands.includes("node run-skill-control-enforcement-fixtures.js"));
      if (args.length > 1) {
        assert.equal(out.operating_mode.role, "S6"); assert.equal(out.operating_mode.authority, "read-only");
      }
    }
    for (const query of ["Prepare a paired native context-reading evaluation for six fixed document tasks.",
      "Request: Review the context delivery measurement.", "Freeze the skill context-reading evaluation."]) {
      const out = route(provider, args, query);
      assert.equal(out.capability_routing.status, "covered");
      assert(out.capability_routing.matched_capability_routes.includes("skill-context-evaluation"));
      assert(out.recommended_documents.some(row => row.path === "docs/evaluation-metrics.md"));
      assert(out.recommended_documents.some(row => row.path === provider + "/controls-doctrine-operator/references/client-operation.md"));
    }
    const corrected = route(provider, args, original);
    assert.deepEqual(corrected.capability_assessments.map(row => row.status), ["covered", "covered"]);
    assert.deepEqual(corrected.capability_assessments.map(row => row.query), ["Maintain the Controls skills",
      "prepare a paired native context-reading evaluation for six fixed document tasks."]);
    assert(!corrected.request_intake.runtime_relevance_query.includes("dashboard"));
    for (const file of runtimeDocs) assert(!corrected.recommended_documents.some(row => row.path === file));
    // Excluding deliverables narrows reading, not controls selected by retained task words.
    for (const cmd of ["node run-maintenance-dashboard-fixtures.js", "node event-replay-prototype/run-event-fixtures.js",
      "node run-authority-integration-fixtures.js", "node run-model-force-assignment-fixtures.js",
      "node run-skill-context-evaluation-fixtures.js", "node run-skill-control-enforcement-fixtures.js"]) {
      assert(corrected.validation_commands.includes(cmd), cmd);
    }
    for (const query of ["Maintain the Controls skills and analyze ICP sales targets.",
      "Analyze ICP sales targets and maintain the Controls skills."]) {
      const out = route(provider, args, query);
      assert.equal(out.capability_routing.status, "gap_detected");
      assert.deepEqual(out.capability_assessments.map(row => row.status).sort(), ["covered", "gap_detected"]);
      assert(out.validation_commands.includes("node run-force-structure-change-fixtures.js"));
      assert(out.capability_routing.provisional_organization.organization_id.startsWith("CELL-"));
    }
    for (const query of ["Prepare a bounded approval proposal.", "Task: Draft an internal approval proposal. Do not publish.",
      "Revise the unsent approval proposal.", "Write approval-proposals."]) {
      const out = route(provider, args, query);
      assert.equal(out.capability_routing.status, "covered", query);
      assert(out.capability_routing.matched_capability_routes.includes("document-authoring"));
      assert(out.recommended_documents.some(row => row.path === "docs/document-authoring-workflow.md"));
      assert(out.recommended_documents.some(row => row.path === "docs/approval-scope-policy.md"));
      assert(out.validation_commands.includes("node run-authority-integration-fixtures.js"));
    }
    const proposal = route(provider, args, proposalRequest);
    assert.deepEqual(proposal.capability_assessments.map(row => row.status), ["covered", "covered"]);
    assert.equal(proposal.capability_assessments[1].query, "prepare a bounded approval proposal.");
    assert(proposal.capability_assessments[1].matched_capability_routes.includes("document-authoring"));
    assert.equal(proposal.request_intake.authority_changed, false);
    assert(proposal.recommended_documents.some(row => row.path === "docs/document-authoring-workflow.md"));
    for (const file of runtimeDocs) assert(!proposal.recommended_documents.some(row => row.path === file));
    for (const cmd of ["node run-authority-integration-fixtures.js", "node run-skill-control-enforcement-fixtures.js"]) {
      assert(proposal.validation_commands.includes(cmd));
    }
    for (const query of ["Prepare a bounded approval proposal and analyze ICP sales targets.",
      "Prepare a bounded approval proposal: analyze ICP sales targets.",
      "Maintain the Controls skill-context-evaluation: analyze ICP sales targets.",
      "Fix the Controls document router: analyze ICP sales targets.",
      "Task: Repair the Controls skills: please analyze ICP sales targets."]) {
      const out = route(provider, args, query);
      assert.equal(out.capability_routing.status, "gap_detected", query);
      assert.deepEqual(out.capability_assessments.map(row => row.status), ["covered", "gap_detected"]);
      assert(out.validation_commands.includes("node run-force-structure-change-fixtures.js"));
    }
    for (const query of ["Prepare an approval proposal for ICP sales targeting.", "Approve ICP sales targets."]) {
      const out = route(provider, args, query);
      assert.equal(out.capability_routing.status, "gap_detected", query);
    }
    const timed = route(provider, args, "Prepare a bounded approval proposal. Keep the recorded time 14:30 unchanged.");
    assert.equal(timed.capability_assessments, undefined);
    const quoted = route(provider, args, 'Prepare a bounded approval proposal. The source says "inspect: analyze ICP sales targets".');
    assert.equal(quoted.capability_assessments, undefined);
    for (const query of ["Write a skill for ICP sales targeting.", "Create Controls skills for museum attendance analysis.",
      "Use the Codex skill to analyze ICP sales targets.", "Use Controls skills for museum attendance analysis.",
      "Prepare a context-reading evaluation for ICP sales targeting.", "Analyze maintenance productivity."]) {
      const out = route(provider, args, query);
      assert.equal(out.capability_routing.status, "gap_detected", query);
    }
    for (const query of ["Use the Codex skill to draft a support SOP.", "Write a skill for drafting a support SOP."]) {
      const out = route(provider, args, query);
      assert.equal(out.capability_routing.status, "covered");
      assert(out.capability_routing.matched_capability_routes.includes("document-authoring"));
    }
    for (const query of ["Use the Codex skill to inspect mission lifecycle.", "Use Controls skills to inspect mission lifecycle."]) {
      const out = route(provider, args, query);
      assert.equal(out.capability_routing.status, "covered");
      assert(out.capability_routing.matched_capability_routes.includes("skill-operations"));
      assert(out.recommended_documents.some(row => row.path === "docs/skill-operational-mission-lifecycle.md"));
      assert(out.validation_commands.includes("node run-skill-control-enforcement-fixtures.js"));
    }
    const explicit = route(provider, [...args, "--source=docs/reference-architecture.md"], original);
    assert(explicit.recommended_documents.some(row => row.path === "docs/reference-architecture.md"));
    const parent = route(provider, [...args, "--capability-query=Review dashboard architecture"], original);
    for (const file of runtimeDocs) assert(parent.recommended_documents.some(row => row.path === file));
    const technical = route(provider, args, "Review dashboard architecture. No model transmission, dashboard or server development.");
    for (const file of runtimeDocs) assert(technical.recommended_documents.some(row => row.path === file));
    for (const query of ["Review maintenance dashboard architecture.", "Review maintenance dashboards."]) {
      const maintenance = route(provider, args, query);
      assert.equal(maintenance.capability_routing.status, "covered");
      assert(maintenance.capability_routing.matched_capability_routes.includes("runtime-architecture-dashboard"));
      assert(maintenance.validation_commands.includes("node run-maintenance-dashboard-fixtures.js"));
      for (const file of runtimeDocs) assert(maintenance.recommended_documents.some(row => row.path === file));
    }
    const partial = route(provider, args, "Draft an SOP. No model transmission, dashboard or server development except a review panel.");
    for (const file of runtimeDocs) assert(partial.recommended_documents.some(row => row.path === file));
  }
  for (const extra of [[], ["--capability-query=Maintain the Controls skills", "--capability-query=Analyze ICP sales targets"]]) {
    const result = spawnSync(process.execPath, [path.join(root, provider, "controls-doctrine-operator/scripts/route_controls_docs.js"),
      "--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution", "--receipt", "--scope=agent",
      "--mission=MIS-MAINTENANCE", "--wave=W1", "--agent=writer", ...extra, "--", original],
    { cwd: root, encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 2); assert.equal(result.stdout, "");
    assert.match(result.stderr, /MULTI_OBJECTIVE_MODE_UNSUPPORTED/); rejected++;
  }
  for (const query of [proposalRequest, "Maintain the Controls skill-context-evaluation: analyze ICP sales targets.",
    "Prepare a bounded approval proposal: execute a model transmission.", "Fix the Controls document router: analyze ICP sales targets."]) {
    const result = spawnSync(process.execPath, [path.join(root, provider, "controls-doctrine-operator/scripts/route_controls_docs.js"),
      "--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution", "--receipt", "--scope=agent",
      "--mission=MIS-PROPOSAL", "--wave=W1", "--agent=writer", "--", query], { cwd: root, encoding: "utf8", timeout: 20000 });
    assert.equal(result.status, 2); assert.equal(result.stdout, "");
    assert.match(result.stderr, /MULTI_OBJECTIVE_MODE_UNSUPPORTED/); rejected++;
  }
}
console.log(JSON.stringify({ valid: true, routed_observations: observations, guarded_rejections: rejected,
  native_model_calls: 0, withheld_executions: 0 }));
