#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { validateSkill } = require("./validate-controls-skill");

const ROOT = __dirname;
const ROUTERS = [
  "codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js",
  ".claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js"
];
let routedQueries = 0;
let rejectedSources = 0;
let rejectedObjectives = 0;
let taskIdentityChecks = 0;
const GITHUB_RELEASE_DOCS = [
  "docs/github-release-authorization.md",
  "docs/github-release-immutability.md",
  "docs/github-release-integrity-monitoring.md",
  "docs/github-release-independent-verification.md"
];
const AUTHORITY_CONTROLS = [
  "node run-authority-integration-fixtures.js",
  "node run-release-integration-fixtures.js",
  "node run-github-release-publisher-fixtures.js",
  "node run-github-release-immutability-fixtures.js",
  "node run-github-release-integrity-fixtures.js",
  "node run-github-release-independent-verification-fixtures.js"
];
const IMPROVEMENT_SPECIALIST_DOCS = [
  "docs/bounded-self-improvement-operations.md", "docs/campaign-terminal-reconciliation.md",
  "docs/campaign-successor-admission.md", "docs/sigstore-verifier-workload-admission.md",
  "docs/verifier-execution-integrity.md", "docs/github-actions-native-verifier-adapter.md",
  "docs/gitlab-ci-native-verifier-adapter.md", "docs/verifier-pre-dispatch-challenge.md",
  "docs/verifier-independence-assurance.md", "docs/transparency-operations.md",
  "docs/runtime-automation-roadmap.md"
];
const RUNTIME_SPECIALIST_DOCS = [
  "docs/reference-architecture.md", "docs/event-sourcing-model.md", "docs/command-post-dashboard.md",
  "docs/dashboard-wireframes.md", "docs/data-model.sql.md"
];

function route(router, args, query, repository = ROOT) {
  const result = spawnSync(process.execPath, [path.join(ROOT, router), ...args, query, repository], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  routedQueries++;
  return JSON.parse(result.stdout);
}

function assertRoutes(result, expectedRoutes) {
  const routeIds = new Set(result.matched_routes.map(item => item.id));
  for (const expected of expectedRoutes) {
    assert(routeIds.has(expected), `Expected route ${expected}; received ${[...routeIds].join(", ")}.`);
  }
  assert.strictEqual(result.route_inventory.unrouted_artifact_count, 0);
}

function testOrdinaryAuthoring(router) {
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S3", "--department=operations", "--authority=read-only"]]) {
    for (const query of ["Draft this document", "Please revise the document", "Write documents",
      "Edit our documentation", "Update those documents", "Draft or revise this document", "DRAFT\nTHE DOCUMENT",
      "Write an evidence-grounded research report", "Progress report", "STATUS\nREPORTS", "Decision briefs",
      "Draft a progress and decision summary recording actual source reads and calculations, unknowns, USER decisions, and next permitted work.",
      "Progress and decision summary: what was actually read and computed, unverified items, items requiring USER judgment, and next permitted action"]) {
      const result = route(router, args, query);
      assertRoutes(result, ["document-authoring"]);
      assert(result.capability_routing.matched_capability_routes.includes("document-authoring"));
      for (const file of ["docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md", "docs/sop-library.md"]) {
        assert(result.recommended_documents.some(d => d.path === file), query + ": " + file);
      }
      assert(result.validation_commands.includes("node source-map-linter.js"));
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
    }
    for (const query of ["Read this document", "Draft a budget", "Document museum visits", "Indecision summary",
      "Progress reporter configuration", "Research reporting database connection"]) {
      const result = route(router, args, query);
      assert(!result.matched_routes.some(r => r.id === "document-authoring"), query);
    }
    const domain = "Analyze museum attendance by city", writing = "Revise this document";
    const result = route(router, [...args, `--capability-query=${domain}`, `--capability-query=${writing}`], `${domain}; ${writing}`);
    assert.deepEqual(result.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
    assert.equal(result.capability_routing.status, "gap_detected", "A writing match must not clear a separately declared domain gap");
    const report = "Write a research report and decision summary";
    const compound = route(router, [...args, `--capability-query=${domain}`, `--capability-query=${report}`], `${domain}; ${report}`);
    assert.deepEqual(compound.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
    assert.equal(compound.capability_routing.status, "gap_detected");
    assert.equal(compound.capability_routing.provisional_organization.authority_expansion_authorized, false);
  }
}

function testS6Reading(router) {
  const args = ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"];
  const query = "Draft a handoff document from supplied policy. Do not publish.";
  const output = route(router, args, query);
  const base = ["docs/role-document-access-policy.md", "docs/agent-roles-and-authority.md",
    "docs/approval-scope-policy.md", "docs/tool-use-roe.md", "docs/knowledge-management-sop.md",
    "docs/context-releasability-policy.md", "docs/opsec-classification-model.md"];
  assert.deepEqual(output.operating_mode.mode_documents, base, "S6 must use its knowledge-management policy bundle");
  const technical = ["docs/reference-architecture.md", "docs/event-sourcing-model.md", "docs/command-post-dashboard.md"];
  for (const document of technical) assert(!output.recommended_documents.some(x => x.path === document),
    "ordinary prose handoff does not require runtime event architecture");
  const sop = route(router, args, "Draft a support SOP. Do not publish.");
  for (const document of technical) assert(!sop.recommended_documents.some(x => x.path === document));
  const human = route(router, ["--actor=user"], query);
  const humanWithRole = route(router, ["--actor=user", "--role=S6", "--department=knowledge", "--authority=read-only"], query);
  assert.deepEqual(humanWithRole.recommended_documents, human.recommended_documents);
  assert.deepEqual(humanWithRole.validation_commands, human.validation_commands);
  assert.equal(humanWithRole.operating_mode.decision_authority, "human_user");
  for (const document of base) assert(output.recommended_documents.some(x => x.path === document));
  for (const command of AUTHORITY_CONTROLS) assert(output.validation_commands.includes(command));
  for (const department of ["systems", "platform", "architecture"]) {
    const systems = route(router, [...args, `--department=${department}`], query);
    for (const document of technical.slice(0, 2)) assert(systems.recommended_documents.some(x => x.path === document));
    assert(!systems.recommended_documents.some(x => x.path === technical[2]));
    assert.deepEqual(systems.matched_routes, output.matched_routes);
    assert.deepEqual(systems.validation_commands, output.validation_commands);
    assert.deepEqual(systems.capability_routing, output.capability_routing);
  }
  for (const extra of [["--source=docs/command-post-dashboard.md"], ["--capability-query=Review dashboard architecture"]]) {
    const explicit = route(router, [...args, ...extra], query);
    assert(explicit.recommended_documents.some(x => x.path === technical[2]));
    assert.equal(explicit.operating_mode.authority, "read-only");
    assert.equal(explicit.capability_routing.provisional_organization.authority_expansion_authorized, false);
  }
  for (const task of ["Review dashboard architecture and event projection.",
    "Do not skip dashboard verification."]) {
    const explicit = route(router, args, task);
    for (const document of technical) assert(explicit.recommended_documents.some(x => x.path === document));
    assert(explicit.validation_commands.includes("node run-maintenance-dashboard-fixtures.js"));
  }
  const execution = route(router, [...args, "--authority=scoped-execution"], query);
  for (const document of base) assert(execution.recommended_documents.some(x => x.path === document));
  for (const document of ["docs/enforced-dispatch-and-resume.md", "docs/protected-tool-gateway-contract.md",
    "docs/protected-process-execution.md", "docs/production-sandbox-admission.md"]) {
    assert(execution.recommended_documents.some(x => x.path === document));
  }
  const incomplete = route(router, ["--actor=ai", "--role=S6", "--authority=read-only"], query);
  assert(incomplete.operating_mode.escalation_required_when.some(x => x.includes("missing department")));
  assert.equal(incomplete.operating_mode.department, "unspecified");
}

function testTaskReadingScope(router) {
  const controls = ["node run-maintenance-dashboard-fixtures.js", "node event-replay-prototype/run-event-fixtures.js"];
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
    const plain = route(router, args, "Draft a handoff document.");
    for (const file of RUNTIME_SPECIALIST_DOCS) assert(!plain.recommended_documents.some(row => row.path === file));
    for (const clause of ["Do not build a dashboard.", "Please do not deploy the dashboard yet.",
      "Don't create a dashboard.", "Never launch a dashboard.", "Dashboard is out of scope.",
      "Dashboard development is deferred.", "Dashboard and standalone service development remain deferred.",
      "DO NOT BUILD A DASHBOARD!"]) {
      const query = "Draft a handoff document. " + clause;
      const result = route(router, args, query);
      assert.equal(result.query, query);
      assert.equal(result.capability_routing.capability_scope, query);
      assertRoutes(result, ["continuity-handoff", "runtime-architecture-dashboard"]);
      for (const file of RUNTIME_SPECIALIST_DOCS) {
        assert(!result.recommended_documents.some(row => row.path === file), query + ": " + file);
      }
      for (const command of [...plain.validation_commands, ...controls]) assert(result.validation_commands.includes(command));
      for (const file of ["docs/handoff-packet-template.md", "docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md"]) {
        assert(result.recommended_documents.some(row => row.path === file));
      }
      assert(!result.capability_routing.matched_capability_routes.includes("runtime-architecture-dashboard"));
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
    }
    for (const task of ["Review dashboard architecture. Do not deploy it.", "Do not skip dashboard verification.",
      "Do not omit dashboard review.", "Do not build a dashboard but review its design.",
      "Do not build a dashboard unless the review requires it.", "Compare workflows with and without a dashboard.",
      "A dashboard is not required, but assess its event projection.", "Build a dashboard later.",
      "Do not build a dashboard. Review its design.", "Do not build a dashboard; inspect its layout.",
      "Do not build a dashboard. Unless the assessment requires it.",
      "Do not build a dashboard; review its architecture.", "Do not build\na dashboard."]) {
      const result = route(router, args, task);
      for (const file of RUNTIME_SPECIALIST_DOCS) assert(result.recommended_documents.some(row => row.path === file), task + ": " + file);
      assert(result.capability_routing.matched_capability_routes.includes("runtime-architecture-dashboard"));
      for (const command of controls) assert(result.validation_commands.includes(command));
    }
    const excluded = "Draft a handoff document. Do not build a dashboard.";
    for (const extra of [["--source=docs/command-post-dashboard.md"], ["--capability-query=Review dashboard architecture"]]) {
      const result = route(router, [...args, ...extra], excluded);
      for (const file of RUNTIME_SPECIALIST_DOCS) assert(result.recommended_documents.some(row => row.path === file), extra + ": " + file);
      for (const command of controls) assert(result.validation_commands.includes(command));
    }
    const inline = route(router, args, excluded + " Read docs/event-sourcing-model.md.");
    assert(inline.task_references.resolved.some(row => row.path === "docs/event-sourcing-model.md"));
    assert(inline.recommended_documents.some(row => row.path === "docs/event-sourcing-model.md"));
    const domain = "Analyze museum attendance by city. Do not build a dashboard.";
    const gap = route(router, args, domain);
    assert.equal(gap.capability_routing.status, "gap_detected", "an excluded platform topic cannot hide a domain gap");
    assert.equal(gap.capability_routing.provisional_organization.required, true);
    assert.equal(gap.capability_routing.provisional_organization.standing_department_activation_authorized, false);
    for (const command of [...controls, "node run-force-structure-change-fixtures.js"]) assert(gap.validation_commands.includes(command));
    const compound = route(router, [...args, "--capability-query=" + domain, "--capability-query=Draft a handoff document"], domain + " Draft a handoff document.");
    assert.deepEqual(compound.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
    assert.equal(compound.capability_routing.status, "gap_detected");
  }
  const technical = route(router, ["--actor=ai", "--role=S6", "--department=systems", "--authority=read-only"],
    "Draft a handoff document. Do not build a dashboard.");
  for (const file of ["docs/reference-architecture.md", "docs/event-sourcing-model.md"]) {
    assert(technical.operating_mode.mode_documents.includes(file));
    assert(technical.recommended_documents.some(row => row.path === file));
  }
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "controls-runtime-input-")));
  try {
    fs.writeFileSync(path.join(project, "dashboard-notes.md"), "PRIVATE-TECHNICAL-INPUT\n");
    const init = spawnSync("git", ["init", "-q", project], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const result = route(router, ["--actor=user", `--input-repository=${project}`, "--input-source=dashboard-notes.md"],
      "Draft a handoff document. Do not build a dashboard.");
    assert.deepEqual(result.task_inputs.sources, [{ path: "dashboard-notes.md", exists: true }]);
    assert.equal(result.task_inputs.content_loaded, false);
    assert.equal(result.task_inputs.authorization_verified, false);
    for (const file of RUNTIME_SPECIALIST_DOCS) assert(result.recommended_documents.some(row => row.path === file));
    assert(!JSON.stringify(result).includes("PRIVATE-TECHNICAL-INPUT"));
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
}

function testSourceReadingScope(router) {
  const korean = ["docs/korean-military-sources.md", "docs/korean-org-culture.md"];
  const multinational = "docs/multinational-doctrine-consistency-review.md";
  const specialists = [...korean, multinational];
  const general = ["docs/source-map.md", "docs/research-compendium.md", "docs/source-reliability-rubric.md"];
  const controls = ["node source-map-linter.js", "node run-doctrine-consistency-fixtures.js"];
  const scenarios = [
    ["Review the source quality of a support SOP. Do not publish.", []],
    ["Write a research note comparing the support and security reporting rules.", []],
    ["Write a source-grounded support SOP in Korean. Do not publish.", []],
    ["Draft a Korean-language research note about support reporting.", []],
    ["Review the Korean translation of a support reporting SOP against source policy.", []],
    ["Review Korean wording in this support SOP against its source policy.", []],
    ["Research U.S. military mission command doctrine using official sources.", [multinational]],
    ["Research NATO and UK military doctrine using official sources.", [multinational]],
    ["Research military doctrine without selecting a national source family yet.", [multinational]],
    ["Research Korean military doctrine and organizational culture using official sources.", specialists],
    ["Research ROK military reporting and backbriefs.", specialists],
    ["Review Korea's organizational culture and its reporting sources.", specialists],
    ["Compare Korean and U.S. military doctrine.", specialists],
    ["Review multinational doctrine consistency using all source families.", specialists],
    ["Write a source review of all military systems.", specialists],
    ["Do not skip Korean military source review.", specialists],
    ["Review a support SOP. Do not research Korean military doctrine.", specialists],
    ["Translate Korean military doctrine into English and record sources.", specialists],
    ["Write a research note about reporting in Korean military organizations.", specialists],
    ["Research terminology translated into Korean military doctrine.", specialists],
    ["Translate U.S. military source notes into Korean.", [multinational]],
    ["Draft a source note in Korean.\nReview U.S. military doctrine.", [multinational]],
    ["Research military reporting for a Korean-language document.", [multinational]]
  ];
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S2", "--department=intelligence", "--authority=read-only"]]) {
    for (const [query, expected] of scenarios) {
      const result = route(router, [...args, "--all"], query);
      assert.equal(result.query, query); assert.equal(result.capability_query, query);
      assert(result.matched_routes.some(row => row.id === "sources-research"), "Missing research route: " + query);
      const paths = result.recommended_documents.map(row => row.path);
      for (const file of specialists) {
        assert.equal(paths.includes(file), expected.includes(file), query + ": " + file);
        assert([...result.recommended_documents, ...result.supporting_artifacts].some(row => row.path === file), "Specialist remains discoverable: " + file);
      }
      for (const file of [...general, ...result.operating_mode.mode_documents]) assert(paths.includes(file));
      for (const command of controls) assert(result.validation_commands.includes(command));
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
    }
    const query = "Review source quality for a support SOP. Do not publish.";
    const plain = route(router, args, query);
    for (const file of specialists) {
      const result = route(router, [...args, "--source=" + file], query);
      assert(result.recommended_documents.some(row => row.path === file));
      assert(result.task_references.resolved.some(row => row.path === file));
      assert.deepEqual(result.matched_routes, plain.matched_routes);
      assert.deepEqual(result.validation_commands, plain.validation_commands);
      assert.deepEqual(result.capability_routing, plain.capability_routing);
    }
    for (const extra of [["--capability-query=Research Korean military doctrine"],
      ["--capability-query=Research Korean military doctrine", "--capability-query=Draft a support SOP"]]) {
      const result = route(router, [...args, ...extra], query);
      for (const file of specialists) assert(result.recommended_documents.some(row => row.path === file));
    }
    const inline = route(router, args, query + " Read docs/korean-org-culture.md.");
    assert(inline.task_references.resolved.some(row => row.path === korean[1]));
    for (const file of specialists) assert(inline.recommended_documents.some(row => row.path === file));
  }
  const department = route(router, ["--actor=ai", "--role=S2", "--department=korean-doctrine", "--authority=read-only"], "Review source quality for a support SOP.");
  for (const file of specialists) assert(department.recommended_documents.some(row => row.path === file));
  const human = route(router, ["--actor=user", "--department=korean-doctrine"], "Review source quality for a support SOP.");
  for (const file of specialists) assert(!human.recommended_documents.some(row => row.path === file));
  const force = route(router, ["--actor=user"], "Review force structure sources for a capability gap.");
  assert(force.recommended_documents.some(row => row.path === multinational), "Other routes retain their own doctrine requirements.");
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "controls-national-input-")));
  try {
    fs.writeFileSync(path.join(project, "korean-doctrine-notes.md"), "PRIVATE-NATIONAL-INPUT\n");
    const init = spawnSync("git", ["init", "-q", project], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const result = route(router, ["--actor=user", `--input-repository=${project}`, "--input-source=korean-doctrine-notes.md"], "Review the source quality of a support SOP.");
    assert.deepEqual(result.task_inputs.sources, [{ path: "korean-doctrine-notes.md", exists: true }]);
    assert.equal(result.task_inputs.content_loaded, false);
    assert.equal(result.task_inputs.authorization_verified, false);
    for (const file of specialists) assert(result.recommended_documents.some(row => row.path === file));
    assert(!JSON.stringify(result).includes("PRIVATE-NATIONAL-INPUT"));
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
}

function testComparisonRouting(router) {
  const specialist = route(router, ["--actor=user"], "Review self-improvement operations");
  const checks = specialist.validation_commands;
  assert.equal(checks.length, 36, "Keep the existing improvement control set");
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
    for (const query of ["Compare museum attendance by city", "A comparison of museum attendance by city", "Establish a museum attendance baseline"]) {
      const output = route(router, args, query);
      assert.equal(output.query, query);
      assert.equal(output.capability_routing.status, "gap_detected", `${query}: generic comparison is not domain coverage`);
      assert.equal(output.capability_routing.provisional_organization.required, true);
      assert.equal(output.capability_routing.provisional_organization.authority_expansion_authorized, false);
      assert.equal(output.capability_routing.provisional_organization.standing_department_activation_authorized, false);
      assertRoutes(output, ["bounded-self-improvement", "force-structure"]);
      for (const document of IMPROVEMENT_SPECIALIST_DOCS) {
        assert(!output.recommended_documents.some(x => x.path === document), `${query}: unrelated ${document}`);
      }
      for (const command of checks) assert(output.validation_commands.includes(command));
      assert(output.validation_commands.includes("node run-force-structure-change-fixtures.js"));
    }
    const query = "Compare two SOP revisions against source policy";
    const ordinary = route(router, args, query);
    assert.equal(ordinary.capability_routing.status, "covered");
    assert(ordinary.capability_routing.matched_capability_routes.includes("document-authoring"));
    assert(!ordinary.capability_routing.matched_capability_routes.includes("bounded-self-improvement"));
    for (const document of ["docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md", "docs/approval-scope-policy.md"]) {
      assert(ordinary.recommended_documents.some(x => x.path === document));
    }
    for (const document of IMPROVEMENT_SPECIALIST_DOCS) assert(!ordinary.recommended_documents.some(x => x.path === document));
    for (const command of checks) assert(ordinary.validation_commands.includes(command));

    for (const extra of [["--source=docs/verifier-execution-integrity.md"], ["--source=docs/campaign-terminal-reconciliation.md"],
      ["--source=docs/runtime-automation-roadmap.md"],
      ["--capability-query=Review verifier execution integrity before comparative promotion"]]) {
      const explicit = route(router, [...args, ...extra], query);
      for (const document of IMPROVEMENT_SPECIALIST_DOCS) assert(explicit.recommended_documents.some(x => x.path === document), document);
      for (const command of checks) assert(explicit.validation_commands.includes(command));
      if (!extra[0].startsWith("--capability-query=")) {
        assert.deepEqual(explicit.matched_routes, ordinary.matched_routes);
        assert.deepEqual(explicit.validation_commands, ordinary.validation_commands);
        assert.deepEqual(explicit.capability_routing, ordinary.capability_routing);
      }
    }
    for (const task of [
      "Compare a runtime-control candidate against an accepted baseline before promotion",
      "Compare two SOP revisions; also review verifier execution integrity",
      "Compare two SOP revisions. Do not skip verifier execution integrity checks.",
      "Compare two SOP revisions. Do not start a self-improvement campaign."
    ]) {
      const explicit = route(router, args, task);
      for (const document of IMPROVEMENT_SPECIALIST_DOCS) assert(explicit.recommended_documents.some(x => x.path === document), task + ': ' + document);
      for (const command of checks) assert(explicit.validation_commands.includes(command));
    }
  }
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "controls-comparison-input-")));
  try {
    fs.mkdirSync(path.join(project, "inputs"));
    const source = "inputs/verifier-execution-integrity.md";
    fs.writeFileSync(path.join(project, source), "PRIVATE-PROJECT-COMPARISON-SOURCE\n");
    const init = spawnSync("git", ["init", "-q", project], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
      const result = route(router, [...args, `--input-repository=${project}`, `--input-source=${source}`],
        "Compare two SOP revisions against source policy");
      for (const document of IMPROVEMENT_SPECIALIST_DOCS) assert(result.recommended_documents.some(x => x.path === document));
      for (const command of checks) assert(result.validation_commands.includes(command));
      assert.deepEqual(result.task_inputs.sources, [{ path: source, exists: true }]);
      assert.equal(result.task_inputs.content_loaded, false);
      assert.equal(result.task_inputs.authorization_verified, false);
      assert(!JSON.stringify(result).includes("PRIVATE-PROJECT-COMPARISON-SOURCE"));
    }
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
}

function testObjectiveRouting(router) {
  const gap = "Research ICP and sales targeting using the canonical track view";
  const glossary = "Maintain the project glossary";
  const cases = [
    { objectives: ["Compare October museum Gallery A and Gallery B visit performance",
      "Draft next-round preparation priority review based on valid-visit ratio",
      "Draft a handoff SOP for the next guidance duty owner under current work rules",
      "Record a field term as an unconfirmed glossary proposal"],
    statuses: ["gap_detected", "gap_detected", "covered", "covered"] },
    { objectives: ["Compare museum attendance by city", "Draft a handoff document"], statuses: ["gap_detected", "covered"] },
    { objectives: [gap, glossary], statuses: ["gap_detected", "covered"] },
    { objectives: ["Assess ceramic glaze defects", "Draft a research note"], statuses: ["gap_detected", "covered"] },
    { objectives: [gap, "Assess ceramic glaze defects"], statuses: ["gap_detected", "gap_detected"] },
    { objectives: [glossary, "Prepare an OPORD"], statuses: ["covered", "covered"] },
    { objectives: ["Explain Cannae OS", "Read the README"], statuses: ["covered", "covered"] },
    { objectives: ["Explain Cannae OS", gap], statuses: ["covered", "gap_detected"] },
    { objectives: [gap, "Review GitHub release approval", glossary], statuses: ["gap_detected", "covered", "covered"] }
  ];
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
    for (const test of cases) {
      const query = `${test.objectives.join("; also ")}. Do not publish.`;
      const permutations = [test.objectives, [...test.objectives].reverse()];
      if (test.objectives.length > 2) permutations.push([...test.objectives.slice(1), test.objectives[0]]);
      let baseline;
      for (const objectives of permutations) {
        const flags = objectives.flatMap((objective, index) => index % 2
          ? ["--capability-query", objective] : [`--capability-query=${objective}`]);
        const result = route(router, [...args, ...flags, "--limit=1"], query);
        assert.equal(result.query, query);
        assert.equal(result.capability_query, query);
        assert.deepEqual(result.capability_queries, objectives);
        assert.deepEqual(result.capability_assessments.map(item => item.query), objectives);
        for (const assessment of result.capability_assessments) {
          assert.equal(assessment.status, test.statuses[test.objectives.indexOf(assessment.query)]);
          assert(!Object.hasOwn(assessment, "provisional_organization"), "only the combined request owns a provisional cell");
        }
        const hasGap = test.statuses.includes("gap_detected");
        assert.equal(result.capability_routing.status, hasGap ? "gap_detected" : "covered");
        assert.equal(result.capability_routing.provisional_organization.required, hasGap);
        assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
        assert.equal(result.capability_routing.provisional_organization.standing_department_activation_authorized, false);
        assert(result.capability_assessment_basis.includes("unverified"));
        if (args.includes("--actor=ai")) assert.equal(result.operating_mode.authority, "read-only");
        else assert.equal(result.operating_mode.decision_authority, "human_user");
        if (hasGap) assert(result.validation_commands.includes("node run-force-structure-change-fixtures.js"));
        if (test.objectives.includes(glossary)) {
          assert(result.recommended_documents.some(item => item.path === "docs/project-terminology-workflow.md"));
          assert(result.validation_commands.includes("node run-project-terminology-fixtures.js"));
        }
        if (test.objectives.includes("Review GitHub release approval")) {
          for (const document of GITHUB_RELEASE_DOCS) assert(result.recommended_documents.some(item => item.path === document));
          for (const command of AUTHORITY_CONTROLS) assert(result.validation_commands.includes(command));
        }
        assert.equal(result.supporting_artifacts.length, 1);
        if (baseline) {
          assert.deepEqual(result.capability_routing, baseline.capability_routing);
          assert.deepEqual(result.matched_routes, baseline.matched_routes);
          assert.deepEqual(result.recommended_documents, baseline.recommended_documents);
          assert.deepEqual(result.validation_commands, baseline.validation_commands);
        }
        baseline = result;
      }
    }
    const legacy = route(router, args, glossary);
    const explicit = route(router, [...args, `--capability-query=${glossary}`], glossary);
    assert.deepEqual(explicit, legacy);
    assert(!Object.hasOwn(legacy, "capability_assessments"));
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "controls-objective-rejection-"));
  try {
    const objectives = [`--capability-query=${gap}`, `--capability-query=${glossary}`];
    const blocked = [
      ["--receipt"], ["--write-artifact"], ["--coverage"], [`--target-repository=${temporary}`],
      [`--artifact-root=${temporary}`], ["--overwrite-artifact"], ["--scope=agent"],
      ["--mission=MIS-OBJECTIVES"], ["--wave=W1"], ["--agent=fixture-agent"],
      ["--receipt", "--write-artifact", `--target-repository=${temporary}`, "--scope=agent", "--mission=MIS-OBJECTIVES", "--wave=W1", "--agent=fixture-agent"]
    ];
    const negatives = blocked.map(flags => ({ flags: [...objectives, ...flags], code: "MULTI_OBJECTIVE_MODE_UNSUPPORTED" }));
    negatives.push({ flags: [`--capability-query=${gap}`, `--capability-query=${gap}`], code: "CAPABILITY_QUERY_DUPLICATE" });
    negatives.push({ flags: ["--capability-query=   "], code: "CAPABILITY_QUERY_EMPTY" });
    negatives.push({ flags: ["--capability-query", "\t"], code: "CAPABILITY_QUERY_EMPTY" });
    for (const { flags, code } of negatives) {
      const run = spawnSync(process.execPath, [path.join(ROOT, router), "--actor=ai", "--role=S6",
        "--department=knowledge", "--authority=read-only", ...flags, "Review the original request.", ROOT],
      { cwd: temporary, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      assert.equal(run.status, 2, run.stderr || run.stdout);
      assert(run.stderr.includes(code), run.stderr);
      assert.equal(run.stdout, "", "a rejected objective declaration must not emit a receipt or routing report");
      assert.deepEqual(fs.readdirSync(temporary), [], "intake rejection must not publish artifacts");
      rejectedObjectives++;
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function testDirectTaskIdentity(router) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "controls-task-identity-")));
  const other = path.join(root, "other"), alias = path.join(root, "alias");
  fs.mkdirSync(other); fs.symlinkSync(other, alias);
  const fixed = ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"];
  const binding = ["--task-id=TASK-61", `--task-root=${root}`];
  const objectives = ["--capability-query=Analyze museum attendance", "--capability-query=Draft an SOP"];
  const call = (flags, query, cwd = ROOT) => {
    const run = spawnSync(process.execPath, [path.join(ROOT, router), ...fixed, ...flags,
      `--doctrine-root=${ROOT}`, "--", query], { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    taskIdentityChecks++;
    return run;
  };
  const positive = (flags, query, cwd) => {
    const run = call(flags, query, cwd); assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  };
  const cell = result => result.capability_routing.provisional_organization.organization_id;
  try {
    const first = positive([...binding, ...objectives], "Analyze museum attendance and draft an SOP. Do not publish.");
    const next = positive([...binding, ...objectives.slice().reverse()], "Compare the next museum inventory and revise the SOP. Do not publish.", other);
    const peer = positive([...binding, ...objectives, "--role=S2", "--department=intelligence"], "Review the museum findings. Do not publish.");
    assert.equal(cell(next), cell(first)); assert.equal(cell(peer), cell(first));
    assert.equal(next.capability_routing.force_structure_review.candidate_department_id, first.capability_routing.force_structure_review.candidate_department_id);
    assert.deepEqual(first.task_context, { id: "TASK-61", root, basis: "caller_declared_project_task", authorization_verified: false });
    assert.equal(peer.operating_mode.role, "S2"); assert.equal(peer.operating_mode.authority, "read-only");
    assert.deepEqual(next.capability_assessments.map(row => row.status), ["covered", "gap_detected"]);
    assert.equal(first.capability_routing.provisional_organization.authority_expansion_authorized, false);
    assert.equal(first.capability_routing.provisional_organization.standing_department_activation_authorized, false);
    const legacy = positive(objectives, first.query);
    assert(!Object.hasOwn(legacy, "task_context"));
    for (const key of ["recommended_documents", "validation_commands", "operating_mode", "capability_assessments", "task_references"]) assert.deepEqual(first[key], legacy[key]);
    const distinct = positive(["--task-id=TASK-62", `--task-root=${root}`, ...objectives], first.query);
    const separate = positive(["--task-id=TASK-61", `--task-root=${other}`, ...objectives], first.query);
    const canonical = positive(["--task-id", "TASK-61", "--task-root", alias, ...objectives], first.query);
    assert.notEqual(cell(distinct), cell(first)); assert.notEqual(cell(separate), cell(first));
    assert.equal(cell(canonical), cell(separate)); assert.equal(canonical.task_context.root, other);
    const covered = positive(binding, "Draft an SOP");
    assert.equal(covered.capability_routing.status, "covered"); assert.equal(cell(covered), "none");
    const literal = positive(binding, "--task-id=REPLACEMENT"); assert.equal(literal.task_context.id, "TASK-61");
    const blocked = [
      [["--task-id=TASK-61"], "TASK_CONTEXT_INCOMPLETE"], [[`--task-root=${root}`], "TASK_CONTEXT_INCOMPLETE"],
      [["--task-id= ../bad", `--task-root=${root}`], "TASK_CONTEXT_ID_INVALID"],
      [["--task-id=" + "A".repeat(101), `--task-root=${root}`], "TASK_CONTEXT_ID_INVALID"],
      [["--task-id=TASK-61", "--task-root=relative"], "TASK_CONTEXT_ROOT_INVALID"],
      [["--task-id=TASK-61", `--task-root=${root}/missing`], "TASK_CONTEXT_ROOT_INVALID"],
      [[...binding, "--task-id", "OTHER"], "TASK_CONTEXT_DUPLICATE"],
      [[...binding, "--task-root", other], "TASK_CONTEXT_DUPLICATE"],
      ...[["--receipt"], ["--coverage"], ["--write-artifact"], ["--overwrite-artifact"],
        ["--mission=MIS-61"], ["--wave=W1"], ["--agent=a"], ["--scope=agent"],
        [`--target-repository=${root}`], [`--artifact-root=${root}`]].map(flags => [[...binding, ...flags], "TASK_CONTEXT_MODE_UNSUPPORTED"])
    ];
    for (const [flags, code] of blocked) {
      const run = call(flags, "Analyze museum attendance"); assert.equal(run.status, 2, run.stderr);
      assert(run.stderr.includes(code), run.stderr); assert.equal(run.stdout, "");
    }
    assert.deepEqual(fs.readdirSync(root).sort(), ["alias", "other"]);
    const init = spawnSync("git", ["init", "-q", other], { encoding: "utf8" }); assert.equal(init.status, 0, init.stderr);
    fs.writeFileSync(path.join(other, "input.md"), "# Synthetic input\n");
    const input = [`--input-repository=${other}`, "--input-source=input.md"];
    const mismatch = call([...binding, ...input], "Analyze museum attendance");
    assert.equal(mismatch.status, 2); assert(mismatch.stderr.includes("TASK_CONTEXT_ROOT_MISMATCH")); assert.equal(mismatch.stdout, "");
    const matching = positive(["--task-id=TASK-61", `--task-root=${other}`, ...input, ...objectives], first.query);
    assert.equal(cell(matching), cell(separate)); assert.equal(matching.task_inputs.content_loaded, false);
    assert.equal(matching.task_inputs.authorization_verified, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

for (const router of ROUTERS) {
  validateSkill(path.posix.dirname(path.posix.dirname(router)));
  testDirectTaskIdentity(router);
  testS6Reading(router);
  testTaskReadingScope(router);
  testSourceReadingScope(router);
  testOrdinaryAuthoring(router);
  testComparisonRouting(router);
  testObjectiveRouting(router);
  for (const query of ["--actor=user", "--role=COMMANDER", "--authority=release", "--receipt",
    "--coverage", "--write-artifact", "--doctrine-root=/not-the-corpus", "--source=missing.md"]) {
    const result = route(router, ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only", "--"], query);
    assert.equal(result.query, query);
    assert.equal(result.repo_root, ROOT);
    assert.equal(result.operating_mode.actor, "ai");
    assert.equal(result.operating_mode.role, "S6");
    assert.equal(result.operating_mode.department, "knowledge");
    assert.equal(result.operating_mode.authority, "read-only");
    assert(!Object.hasOwn(result, "artifact_ref"));
    assert(!Object.hasOwn(result, "type"));
  }
  for (const query of ["Maintain the project glossary", "Capture user vocabulary", "Review terminology definitions"]) {
    for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
      const result = route(router, args, query);
      assertRoutes(result, ["project-terminology"]);
      assert(result.recommended_documents.some(item => item.path === "docs/project-terminology-workflow.md"));
      assert(result.recommended_documents.some(item => item.path === "docs/glossary.md"));
      assert(result.validation_commands.includes("node run-project-terminology-fixtures.js"));
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
      assert(!result.matched_routes.some(item => ["local-operator-console", "enforced-dispatch"].includes(item.id)));
      if (args.includes("--actor=ai")) assert.equal(result.operating_mode.authority, "read-only");
    }
  }
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S3", "--department=operations", "--authority=read-only"]]) {
    const result = route(router, args, "Prepare a project document packet from the named inputs.");
    assertRoutes(result, ["project-document-delivery"]);
    assert(result.recommended_documents.some(item => item.path === "docs/role-document-access-policy.md"));
    assert(result.validation_commands.includes("node run-project-document-packet-fixtures.js"));
    assert.strictEqual(result.capability_routing.status, "covered");
    const ordinary = route(router, args, "Review document access for an existing policy.");
    assertRoutes(ordinary, ["document-access-context"]);
    assert(!ordinary.validation_commands.includes("node run-project-document-packet-fixtures.js"),
      "project content preparation checks must not become mandatory for unrelated document access");
  }
  for (const query of ["document authoring and document routing",
    "Draft an SOP and handoff document from the supplied policy.",
    "Revise a document", "docs/document-authoring-workflow.md",
    "Prepare an authoring review", "Inspect the authoring-review packet"]) {
    for (const args of [["--actor=user"],
      ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
      const result = route(router, args, query);
      assertRoutes(result, ["document-authoring"]);
      assert.strictEqual(result.capability_routing.status, "covered");
      for (const document of ["docs/document-authoring-workflow.md",
        "docs/knowledge-management-sop.md", "docs/prompt-templates.md",
        "docs/handoff-packet-template.md", "docs/skill-first-product-scope.md"]) {
        assert(result.recommended_documents.some(item => item.path === document),
          `${query}: missing authoring reference ${document}`);
      }
      const delegated = args.includes("--actor=ai");
      assert.strictEqual(result.operating_mode.decision_authority,
        delegated ? "bounded_ai_delegate" : "human_user");
      if (delegated) {
        assert.strictEqual(result.operating_mode.role, "S6");
        assert.strictEqual(result.operating_mode.authority, "read-only");
      }
      assert(!result.matched_routes.some(item =>
        ["local-operator-console", "runtime-architecture-dashboard", "enforced-dispatch"].includes(item.id)));
      assert(!result.validation_commands.some(command =>
        /operator-console|operator-consent|protected-tool-gateway|github-release/.test(command)));
      if (query.includes("authoring review") || query.includes("authoring-review")) {
        assert(result.supporting_artifacts.some(item => item.path === "authoring-review-packet.js"));
      }
    }
  }
  for (const query of [
    "Draft a support escalation SOP from SUPPORT.md, GOVERNANCE.md and SECURITY.md. Preserve best-effort support and private vulnerability reporting. Do not publish it.",
    "Revise the support escalation SOP to add a handoff section without changing policy.",
    "Write a research note comparing the support and security reporting rules.",
    "Review the standard operating procedure for support triage."
  ]) {
    for (const args of [["--actor=user"],
      ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
      const result = route(router, args, query);
      assertRoutes(result, ["document-authoring"]);
      for (const document of ["docs/document-authoring-workflow.md", "docs/sop-library.md",
        "docs/prompt-templates.md", "docs/handoff-packet-template.md"]) {
        assert(result.recommended_documents.some(item => item.path === document),
          `${query}: missing task reference ${document}`);
      }
      const delegated = args.includes("--actor=ai");
      assert.strictEqual(result.operating_mode.decision_authority,
        delegated ? "bounded_ai_delegate" : "human_user");
      if (delegated) assert.strictEqual(result.operating_mode.authority, "read-only");
      if (query.includes("SUPPORT.md")) {
        for (const source of ["SUPPORT.md", "GOVERNANCE.md", "SECURITY.md"]) {
          assert(result.recommended_documents.some(item => item.path === source), `missing supplied source ${source}`);
          assert(result.task_references.resolved.some(item => item.path === source));
        }
        assert.strictEqual(result.task_references.unresolved.length, 0);
        assert(!result.recommended_documents.some(item => GITHUB_RELEASE_DOCS.includes(item.path)),
          "generic support writing must not require GitHub release manuals");
        assert.deepStrictEqual(result.validation_commands, [
          ...AUTHORITY_CONTROLS, "node run-document-access-fixtures.js",
          "node run-release-review-fixtures.js", "node source-map-linter.js"
        ], "the original task must retain its entire selected control list");
        assert(result.validation_commands.includes("node run-github-release-publisher-fixtures.js"),
          "source resolution must not remove a selected release control");
      }
    }
  }
  for (const query of [
    "Draft a support SOP. Do not publish.",
    "Draft a support SOP. Do not release.",
    "Review approval scope for the support SOP.",
    "Publish the support SOP only after USER approval.",
    "Draft a support approval SOP for GitHub issue triage.",
    "Draft a support SOP; do not skip approval."
  ]) {
    for (const args of [["--actor=user"],
      ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"]]) {
      const result = route(router, args, query);
      assertRoutes(result, ["authority-risk-release", "document-authoring"]);
      assert(!result.recommended_documents.some(item => GITHUB_RELEASE_DOCS.includes(item.path)), query);
      for (const required of ["docs/agent-roles-and-authority.md", "docs/tool-use-roe.md",
        "docs/approval-scope-policy.md", "docs/risk-acceptance-authority.md",
        "docs/context-releasability-policy.md", "docs/policy-engine-rules.md"]) {
        assert(result.recommended_documents.some(item => item.path === required), `${query}: lost ${required}`);
      }
      for (const command of AUTHORITY_CONTROLS) assert(result.validation_commands.includes(command));
      assert.strictEqual(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
      if (args.includes("--actor=ai")) assert.strictEqual(result.operating_mode.authority, "scoped-execution");
    }
  }
  for (const query of [
    "Review GitHub release approval.",
    "Do not skip verification before publishing a release on GitHub.",
    "Draft an SOP. Do not publish a GitHub release.",
    "Do not publish now; later review GitHub release integrity.",
    "Run gh release view as a read-only review.",
    "Review a release asset on GitHub.",
    "Check CANNAE_IMMUTABILITY_MONITOR_TOKEN scope."
  ]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["authority-risk-release"]);
    for (const document of GITHUB_RELEASE_DOCS) {
      assert(result.recommended_documents.some(item => item.path === document), `${query}: lost ${document}`);
    }
    for (const command of AUTHORITY_CONTROLS) assert(result.validation_commands.includes(command));
  }
  const readingQuery = "Draft a support SOP. Do not publish.";
  const genericReading = route(router, ["--actor=user"], readingQuery);
  const explicitReading = route(router, ["--actor=user",
    "--source=docs/github-release-authorization.md"], readingQuery);
  assert.deepStrictEqual(explicitReading.matched_routes, genericReading.matched_routes);
  assert.deepStrictEqual(explicitReading.validation_commands, genericReading.validation_commands);
  assert.deepStrictEqual(explicitReading.capability_routing, genericReading.capability_routing);
  assert.deepStrictEqual(explicitReading.operating_mode, genericReading.operating_mode);
  assert.deepStrictEqual(explicitReading.recommended_documents.map(item => item.path).sort(),
    [...genericReading.recommended_documents.map(item => item.path), ...GITHUB_RELEASE_DOCS].sort(),
    "an explicit specialist source changes reading only, not task/control selection");
  const inheritedReading = route(router, ["--actor=ai", "--role=S3", "--department=operations",
    "--authority=scoped-execution", "--capability-query=Review GitHub release approval."], readingQuery);
  for (const document of GITHUB_RELEASE_DOCS) {
    assert(inheritedReading.recommended_documents.some(item => item.path === document),
      "the narrowed subtask must retain applicable mission-level release reading");
  }
  const handoff = route(router, ["--actor=user"],
    "Prepare a receiver-ready handoff for this documentation task.");
  assertRoutes(handoff, ["continuity-handoff"]);
  assert(handoff.recommended_documents.some(item => item.path === "docs/handoff-packet-template.md"));
  assert(handoff.validation_commands.includes("node run-handoff-generation-fixtures.js"));
  const unrelated = route(router, ["--actor=user"], "Analyze soap sales and rank sales targets");
  assert(!unrelated.matched_routes.some(item => item.id === "document-authoring"));
  assert.strictEqual(unrelated.capability_routing.status, "gap_detected");
  const authoringGap = route(router, ["--actor=ai", "--role=S6",
    "--department=knowledge", "--authority=read-only",
    "--capability-query=Research ICP and sales targeting using the canonical track view"],
  "Draft a sales targeting SOP");
  assertRoutes(authoringGap, ["document-authoring", "force-structure"]);
  assert.strictEqual(authoringGap.capability_routing.status, "gap_detected");
  assert.strictEqual(authoringGap.operating_mode.authority, "read-only");
  assert.strictEqual(authoringGap.capability_routing.provisional_organization.authority_expansion_authorized, false);
  assert.strictEqual(authoringGap.capability_routing.provisional_organization.standing_department_activation_authorized, false);
  assert(authoringGap.recommended_documents.some(item => item.path === "docs/document-authoring-workflow.md"));
  const mixedObjective = "Research ICP and sales targeting using the canonical track view";
  const mixedTask = "Draft an SOP and handoff document for a multi-agent sales task. Preserve approval scope, authority and release rules. Store outputs as repository artifacts. Maintain the project glossary.";
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
    const scoped = [...args, `--capability-query=${mixedObjective}`];
    const mixed = route(router, scoped, mixedTask);
    const limited = route(router, [...scoped, "--limit=1"], mixedTask);
    assertRoutes(mixed, ["force-structure", "authority-risk-release", "document-authoring",
      "multi-agent-organization", "repository-artifact-isolation", "continuity-handoff", "project-terminology"]);
    assert.equal(mixed.capability_routing.status, "gap_detected");
    assert.equal(mixed.capability_routing.provisional_organization.authority_expansion_authorized, false);
    assert.equal(mixed.capability_routing.provisional_organization.standing_department_activation_authorized, false);
    assert.equal(mixed.query, mixedTask);
    if (args.includes("--actor=ai")) assert.equal(mixed.operating_mode.authority, "read-only");
    for (const document of ["docs/project-terminology-workflow.md", "docs/repository-artifact-isolation-policy.md",
      "docs/handoff-packet-template.md", "docs/force-structure-change-policy.md", "docs/tool-use-roe.md"]) {
      assert(mixed.recommended_documents.some(item => item.path === document), `low-ranked route lost ${document}`);
    }
    for (const command of ["node run-project-terminology-fixtures.js", "node run-project-terminology-handoff-fixtures.js",
      "node run-repository-artifact-isolation-fixtures.js", "node run-handoff-generation-fixtures.js", ...AUTHORITY_CONTROLS]) {
      assert(mixed.validation_commands.includes(command), `low-ranked route lost ${command}`);
    }
    assert.deepEqual(limited.recommended_documents, mixed.recommended_documents);
    assert.deepEqual(limited.validation_commands, mixed.validation_commands);
    assert.deepEqual(limited.capability_routing, mixed.capability_routing);
    assert.equal(limited.supporting_artifacts.length, 1);
  }
  for (const query of ["operator console", "local-operator-console", "evidence api", "viewer invitation", "serve_controls_operator"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["local-operator-console"]);
    assert(result.recommended_documents.some(item => item.path === "docs/local-operator-console.md"));
    assert(result.validation_commands.includes("node run-operator-console-fixtures.js"));
    assert.equal(result.capability_routing.status, "covered");
  }
  for (const query of ["operator consent", "operator-consent", "authenticated order review"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["local-operator-console"]);
    assert(result.recommended_documents.some(item => item.path === "docs/operator-consent-and-adoption.md"));
    assert(result.validation_commands.includes("node run-operator-consent-fixtures.js"));
  }
  for (const query of ["order revision", "order-revision-controller.js", "revise_controls_order.js", "order replay", "FRAGO"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["orders"]);
    assert(result.recommended_documents.some(item => item.path === "docs/order-revision-and-supersession.md"));
    assert(result.validation_commands.includes("node run-order-revision-fixtures.js"));
  }
  for (const query of ["order adoption", "order-adoption-controller.js", "adopt_controls_order.js", "order-backbrief", "order-rehearsal"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["orders"]);
    assert(result.recommended_documents.some(item => item.path === "docs/order-adoption-and-plan-binding.md"));
    assert(result.validation_commands.includes("node run-order-adoption-fixtures.js"));
  }
  for (const query of ["request intake", "mission analysis", "request-order-compiler.js", "compile_controls_order.js", "order-intake-contract.js", "mission-order-analysis", "order-draft"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["orders"]);
    assert(result.recommended_documents.some(item => item.path === "docs/request-order-intake.md"));
    assert(result.validation_commands.includes("node run-request-order-compiler-fixtures.js"));
    assert(!result.validation_commands.some(command => command.includes("sample-payloads/valid-backbrief.json")));
  }
  for (const query of ["dependency migration retained verifier evidence ip-address security update",
    "verifier dependency", "producer compatibility", "lockfile update", "ip-address"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["authority-risk-release"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/github-release-independent-verification.md"));
    assert(result.validation_commands.includes("node run-github-release-independent-verification-fixtures.js"));
  }
  for (const query of ["reconciled failure", "reconciled_failed_effects", "post-settlement revocation"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["tool-effect-review"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert.strictEqual(result.operating_mode.decision_authority, "bounded_ai_delegate");
    assert(result.recommended_documents.some(item => item.path === "docs/tool-effect-settlement.md"));
    assert(result.validation_commands.includes("node run-tool-effect-settlement-fixtures.js"));
  }
  for (const query of ["gateway effect review", "gateway settlement", "orphan admission"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["gateway-effect-review"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/gateway-effect-review.md"));
    assert(result.validation_commands.includes("node run-gateway-effect-review-fixtures.js"));
  }
  for (const query of ["gateway ownership", "gateway obligations", "late gateway callback"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["enforced-dispatch"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/protected-tool-gateway-contract.md"));
    assert(result.recommended_documents.some(item => item.path === "docs/enforced-dispatch-and-resume.md"));
    assert(result.validation_commands.includes("node run-protected-tool-gateway-fixtures.js"));
  }
  for (const query of ["Audit implementation candidates and the completion backlog",
    "Audit implementation-candidate-registry.js and completion-backlog.md"]) {
    const registry = route(router, ["--actor=user"], query);
    assertRoutes(registry, ["skill-operations"]);
    assert.strictEqual(registry.capability_routing.status, "covered");
    assert(registry.recommended_documents.some(item => item.path === "docs/implementation-candidate-registry.md"));
    assert(registry.validation_commands.includes("node implementation-candidate-registry.js audit"));
  }
  const termination = route(router, ["--actor=user"], "Reconcile expired wave termination and supersession");
  for (const query of ["commander intent autonomy boundaries drift FRAGO", "intent continuity and task conservation",
    "mission command and disciplined initiative", "check_controls_intent context upgrade"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["intent-initiative"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    for (const document of ["docs/mission-command-runtime-policy.md", "docs/disciplined-initiative-rules.md", "docs/intent-continuity-runtime.md"]) {
      assert(result.recommended_documents.some(item => item.path === document), `${query}: ${document} must be a primary recommendation`);
    }
    assert(result.validation_commands.includes("node run-intent-continuity-fixtures.js"));
  }
  assertRoutes(termination, ["skill-operations"]);
  assert(termination.recommended_documents.some(item => item.path === "docs/skill-operational-mission-lifecycle.md"));
  const capabilityGapQuery = "Research ICP and sales targeting using the canonical track view";
  const capabilityGap = route(router, ["--actor=ai", "--role=COS", "--department=coordination", "--authority=tasking"],
    capabilityGapQuery);
  assertRoutes(capabilityGap, ["force-structure", "sources-research"]);
  assert.strictEqual(capabilityGap.capability_query, capabilityGapQuery);
  assert.strictEqual(capabilityGap.capability_routing.status, "gap_detected");
  assert.strictEqual(capabilityGap.capability_routing.reason_code, "NO_CAPABILITY_ROUTE");
  assert.strictEqual(capabilityGap.capability_routing.capability_scope, capabilityGapQuery);
  assert.strictEqual(capabilityGap.capability_routing.provisional_organization.required, true);
  assert.strictEqual(capabilityGap.capability_routing.provisional_organization.task_organization_status, "task_organized");
  assert.strictEqual(capabilityGap.capability_routing.provisional_organization.authority_expansion_authorized, false);
  assert.strictEqual(capabilityGap.capability_routing.provisional_organization.standing_department_activation_authorized, false);
  assert.strictEqual(capabilityGap.capability_routing.force_structure_review.required, true);
  assert.strictEqual(capabilityGap.capability_routing.force_structure_review.status, "analysis_required");
  assert.strictEqual(capabilityGap.capability_routing.force_structure_review.final_decision_authority, "USER");
  assert(capabilityGap.recommended_documents.some(item =>
    item.path === "docs/force-structure-change-policy.md"));
  assert(capabilityGap.validation_commands.includes("node run-force-structure-change-fixtures.js"));

  const orientation = route(router, ["--actor=user"],
    "Give me an overview of this framework");
  assertRoutes(orientation, ["orientation"]);
  assert.strictEqual(orientation.capability_routing.status, "covered");
  assert.strictEqual(orientation.capability_routing.reason_code, "CORPUS_ORIENTATION_REQUEST");

  const corpusAsTool = route(router, ["--actor=user"],
    "Use this repository to analyze ICP and rank sales targets");
  assertRoutes(corpusAsTool, ["force-structure"]);
  assert.strictEqual(corpusAsTool.capability_routing.status, "gap_detected");
  assert.strictEqual(corpusAsTool.capability_routing.reason_code, "NO_CAPABILITY_ROUTE");

  const comparison = route(router, ["--actor=user"],
    "Compare a runtime-control candidate against an accepted baseline before promotion");
  assert.strictEqual(comparison.operating_mode.mode, "human_final_decision_authority");
  assertRoutes(comparison, ["bounded-self-improvement", "runtime-validation"]);

  const delegated = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"],
    "Run a canary promotion gate for this skill candidate");
  assert.strictEqual(delegated.operating_mode.mode, "delegated_ai_role_department_authority");
  assert.strictEqual(delegated.operating_mode.decision_authority, "bounded_ai_delegate");
  assert(delegated.operating_mode.escalation_required_when.some(item => item.includes("exceeds delegated")));
  assertRoutes(delegated, ["bounded-self-improvement", "skill-operations"]);

  const adaptation = route(router, ["--actor=user"],
    "Require a mandatory skill improvement after every framework improvement");
  assertRoutes(adaptation, ["skill-operations"]);
  assert(adaptation.recommended_documents.some(item =>
    item.path === "codex-skills/controls-doctrine-operator/references/self-improvement-loop.md"));
  assert(adaptation.recommended_documents.some(item =>
    item.path === ".claude/skills/controls-doctrine-operator/references/self-improvement-loop.md"));
  assert(adaptation.validation_commands.some(command =>
    command === "node validate-controls-skill.js codex-skills/controls-doctrine-operator"));
  assert(adaptation.validation_commands.some(command =>
    command === "node validate-controls-skill.js .claude/skills/controls-doctrine-operator"));
  assert(adaptation.validation_commands.every(command => !command.includes("/Users/work")));

  const ignoredStateDir = path.join(ROOT, ".cxt");
  const ignoredStatePath = path.join(
    ignoredStateDir,
    `routing-fixture-${path.basename(path.dirname(path.dirname(router)))}.json`
  );
  const beforeIgnoredState = route(
    router,
    ["--actor=user"],
    "Check ignored local state routing coverage"
  );
  const ignoredStateDirExisted = fs.existsSync(ignoredStateDir);
  fs.mkdirSync(ignoredStateDir, { recursive: true });
  try {
    fs.writeFileSync(
      ignoredStatePath,
      `${JSON.stringify({ local_runtime_state: true })}\n`
    );
    const afterIgnoredState = route(
      router,
      ["--actor=user"],
      "Check ignored local state routing coverage"
    );
    assert.strictEqual(
      afterIgnoredState.route_inventory.routable_artifact_count,
      beforeIgnoredState.route_inventory.routable_artifact_count
    );
    assert.strictEqual(
      afterIgnoredState.route_inventory.unrouted_artifact_count,
      0
    );
  } finally {
    fs.rmSync(ignoredStatePath, { force: true });
    if (
      !ignoredStateDirExisted &&
      fs.existsSync(ignoredStateDir) &&
      fs.readdirSync(ignoredStateDir).length === 0
    ) {
      fs.rmdirSync(ignoredStateDir);
    }
  }
}

const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "controls-task-sources-"));
try {
  const write = (file, content = "# Fixture source\n") => {
    const destination = path.join(sourceRoot, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  };
  for (const file of ["README.md", "SUPPORT.md", "docs/source-map.md", "schema-files/README.md",
    "docs/unique-source.md", "docs/space source.md", "docs/a/shared.md", "docs/b/shared.md",
    ".cannae/retained.md", ".cxt/retained.md", "ignored-source.md"]) write(file);
  write(".gitignore", "ignored-source.md\n.cannae/\n.cxt/\n");
  const git = spawnSync("git", ["init", "-q"], { cwd: sourceRoot, encoding: "utf8" });
  assert.strictEqual(git.status, 0, git.stderr);
  // Tracked local-state files must still be excluded from a corpus inventory.
  const tracked = spawnSync("git", ["add", "-f", ".cxt/retained.md"], { cwd: sourceRoot, encoding: "utf8" });
  assert.strictEqual(tracked.status, 0, tracked.stderr);
  fs.symlinkSync("SUPPORT.md", path.join(sourceRoot, "alias.md"));
  fs.symlinkSync(path.join(ROOT, "SUPPORT.md"), path.join(sourceRoot, "outside.md"));
  fs.symlinkSync("absent.md", path.join(sourceRoot, "dangling.md"));
  fs.symlinkSync(path.join(ROOT, "docs"), path.join(sourceRoot, "linked-docs"));

  for (const router of ROUTERS) {
    const resolved = route(router, ["--actor=user", "--source=SUPPORT.md", "--source", "docs/unique-source.md"],
      "Draft an SOP from ./SUPPORT.md, unique-source.md:12, `docs/space source.md` and [policy](docs/unique-source.md#section).",
      sourceRoot);
    for (const expected of ["SUPPORT.md", "docs/unique-source.md", "docs/space source.md"]) {
      assert(resolved.recommended_documents.some(item => item.path === expected), `source resolution missed ${expected}`);
    }
    const selectedPaths = resolved.recommended_documents.map(item => item.path);
    assert.strictEqual(new Set(selectedPaths).size, selectedPaths.length);
    assert.strictEqual(resolved.task_references.unresolved.length, 0);
    const referenceOnly = route(router, ["--actor=user", "--source=SUPPORT.md"],
      "Analyze ICP sales targets.", sourceRoot);
    assert.strictEqual(referenceOnly.capability_routing.status, "gap_detected",
      "an explicit source cannot supply a capability match");
    assert.strictEqual(referenceOnly.capability_routing.provisional_organization.authority_expansion_authorized, false);

    const missing = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"],
      "Draft an SOP in new-output.md; compare shared.md and missing/unique-source.md.", sourceRoot);
    assert.deepStrictEqual(missing.task_references.unresolved, [
      { reference: "new-output.md", reason: "not_in_corpus" },
      { reference: "shared.md", reason: "ambiguous_basename" },
      { reference: "missing/unique-source.md", reason: "not_in_corpus" }
    ]);
    assert(missing.operating_mode.escalation_required_when.some(item => item.includes("new-output.md")));
    assert(!missing.recommended_documents.some(item => item.path.endsWith("shared.md") || item.path.endsWith("unique-source.md")),
      "do not guess a basename for an ambiguous or qualified missing path");
    const external = route(router, ["--actor=user"],
      "Draft an SOP from https://example.invalid/SUPPORT.md and [external](https://example.invalid/docs/unique-source.md).",
      sourceRoot);
    assert.deepStrictEqual(external.task_references, { resolved: [], unresolved: [] });
    assert(!external.recommended_documents.some(item => item.path === "SUPPORT.md"));

    const invalidSources = [
      "absent.md", "", "shared.md", "missing/unique-source.md", "../SUPPORT.md",
      "docs/../SUPPORT.md", path.join(ROOT, "SUPPORT.md"), "C:\\private\\SUPPORT.md",
      ".cannae/retained.md", ".cxt/retained.md", "ignored-source.md", "alias.md", "outside.md",
      "dangling.md", "linked-docs/source-map.md", "https://example.invalid/SUPPORT.md"
    ];
    for (const source of invalidSources) {
      const result = spawnSync(process.execPath, [path.join(ROOT, router),
        "--receipt", "--scope=agent", "--mission=MIS-SOURCE", "--wave=W1", "--agent=source-agent",
        "--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution",
        `--source=${source}`, "Draft an SOP.", sourceRoot],
      { cwd: sourceRoot, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
      assert.strictEqual(result.status, 2, `${source}: expected required-source rejection, ${result.stderr}`);
      assert(result.stderr.includes("TASK_SOURCE_UNRESOLVED"));
      assert.strictEqual(result.stdout, "", "an unresolved required input must not emit a receipt");
      rejectedSources++;
    }
    const ignored = route(router, ["--actor=user", "--all"],
      "Read alias.md, outside.md, dangling.md, linked-docs/source-map.md and .cxt/retained.md.", sourceRoot);
    assert.strictEqual(ignored.task_references.resolved.length, 0);
    for (const item of [...ignored.recommended_documents, ...ignored.supporting_artifacts]) {
      assert(!invalidSources.includes(item.path), "unsafe reference appeared in a reading recommendation");
    }
  }
} finally {
  fs.rmSync(sourceRoot, { recursive: true, force: true });
}

const linkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "controls-document-links-"));
try {
  fs.mkdirSync(path.join(linkRoot, "docs"));
  fs.writeFileSync(path.join(linkRoot, "README.md"), "[Guide](docs/guide.md)\n");
  fs.writeFileSync(path.join(linkRoot, "docs/guide.md"), "# Guide\n");
  for (const directory of [".cannae", ".cxt"]) {
    fs.mkdirSync(path.join(linkRoot, directory));
    fs.writeFileSync(path.join(linkRoot, directory, "retained.md"), "[Old relative link](missing.md)\n");
  }
  const checkLinks = () => spawnSync(process.execPath,
    [path.join(ROOT, ".github/scripts/check-markdown-links.js")],
    { cwd: linkRoot, encoding: "utf8" });
  const valid = checkLinks();
  assert.strictEqual(valid.status, 0, valid.stderr);
  assert(valid.stdout.includes("2 files"), "Local history must not be scanned as current doctrine.");
  fs.writeFileSync(path.join(linkRoot, "docs/guide.md"), "[Missing source](absent.md)\n");
  const brokenDoc = checkLinks();
  assert.strictEqual(brokenDoc.status, 1);
  assert(brokenDoc.stderr.includes("docs/guide.md: absent.md"));
  fs.writeFileSync(path.join(linkRoot, "docs/guide.md"), "# Guide\n");
  fs.mkdirSync(path.join(linkRoot, ".claude/skills/example"), { recursive: true });
  fs.writeFileSync(path.join(linkRoot, ".claude/skills/example/SKILL.md"), "[Missing reference](missing.md)\n");
  const brokenSkill = checkLinks();
  assert.strictEqual(brokenSkill.status, 1);
  assert(brokenSkill.stderr.includes(".claude/skills/example/SKILL.md: missing.md"));
} finally {
  fs.rmSync(linkRoot, { recursive: true, force: true });
}

console.log(`Document routing fixtures passed: ${routedQueries} routed queries across ${ROUTERS.length} providers; ${taskIdentityChecks} direct-task identity checks; ${rejectedSources} required-source rejections; ${rejectedObjectives} objective-declaration rejections; 3 link-inventory checks.`);
