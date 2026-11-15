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
let referenceIntegrityChecks = 0;
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

function testReadingProvenance(router) {
  const query = "Draft a handoff document. Do not build a dashboard.";
  const modes = [[], ["--role=S4", "--department=knowledge", "--authority=read-only"]];
  const explained = (args, task = query) => {
    const legacy = route(router, args, task);
    const result = route(router, [...args, "--explain-reading"], task);
    const { reading_selection: reading, ...rest } = result;
    assert.deepEqual(rest, legacy, "Explanation must not change any existing result field");
    for (const flag of ["semantic_relevance_verified", "access_authorized", "required_reading_assessed", "source_content_read"]) assert.equal(reading[flag], false);
    assert.deepEqual(reading.objective_queries, result.capability_queries || [result.capability_query]);
    assert.equal(new Set(reading.documents.map(row => row.path)).size, reading.documents.length);
    assert.deepEqual(reading.documents.filter(row => row.recommended).map(row => row.path).sort(), result.recommended_documents.map(row => row.path).sort());
    for (const row of reading.documents) {
      assert.equal(row.recommended, row.in_inventory && row.reasons.some(reason => reason.selected));
      for (const reason of row.reasons.filter(item => item.kind === "route")) {
        assert.equal(reason.selected, reason.excluded_by.length === 0);
        assert(result.matched_routes.some(item => item.id === reason.route_id));
        for (const index of reason.objective_indexes) assert(Number.isInteger(index) && index >= 0 && index < reading.objective_queries.length);
      }
    }
    return result;
  };
  for (const extra of modes) {
    const actor = extra.length ? "ai" : "user", result = explained([`--actor=${actor}`, ...extra]);
    const row = result.reading_selection.documents.find(d => d.path === "docs/data-model.sql.md");
    assert.equal(row.recommended, false);
    assert(row.reasons.some(r => r.kind === "route" && !r.selected && r.excluded_by.includes("runtime_specialist")));
    assert.equal(row.reasons.some(r => r.kind === "role" && r.value === "S4" && !r.selected &&
      r.excluded_by.includes("read_only_document_role")), actor === "ai");
  }
  const withReference = explained(["--actor=user", "--source=docs/data-model.sql.md"]);
  assert(withReference.reading_selection.documents.find(d => d.path === "docs/data-model.sql.md").reasons.some(r => r.kind === "source_argument" && r.reference === "docs/data-model.sql.md"));
  const inline = explained(["--actor=user"], "Draft an SOP from docs/knowledge-management-sop.md.");
  assert(inline.reading_selection.documents.find(d => d.path === "docs/knowledge-management-sop.md").reasons.some(r => r.kind === "task_reference"));
  const compound = explained(["--actor=user", "--capability-query=Analyze museum attendance", "--capability-query=Maintain project terminology"], "Write the bounded comparison.");
  const term = compound.reading_selection.documents.find(d => d.path === "docs/project-terminology-workflow.md");
  assert(term.reasons.some(r => r.kind === "route" && r.route_id === "project-terminology" && !r.task_match && r.objective_indexes.includes(1)));
  const force = compound.reading_selection.documents.find(d => d.path === "docs/force-structure-change-policy.md");
  assert(force.reasons.some(r => r.kind === "capability_gap"));
  assert(force.reasons.some(r => r.kind === "route" && r.gap_fallback));
  for (const [task, file, exclusion] of [
    ["Draft an SOP with approval boundaries.", "docs/github-release-authorization.md", "github_release_specialist"],
    ["Compare two proposed SOP drafts.", "docs/bounded-self-improvement-operations.md", "improvement_specialist"],
    ["Review source policies and write a report in Korean.", "docs/korean-military-sources.md", "korean_subject"],
    ["Review source policies and write a report in Korean.", "docs/multinational-doctrine-consistency-review.md", "multinational_subject"],
    ["Use the Codex skill to draft a support SOP.", "docs/completion-backlog.md", "skill_maintenance"]
  ]) {
    const row = explained(["--actor=user"], task).reading_selection.documents.find(d => d.path === file);
    assert(row, file);
    assert(row.reasons.some(r => r.kind === "route" && !r.selected && r.excluded_by.includes(exclusion)), exclusion);
    if (exclusion === "multinational_subject") {
      assert(row.recommended);
      assert(row.reasons.some(r => r.kind === "route" && r.route_id === "force-structure" && r.selected && r.gap_fallback));
    } else assert(!row.recommended, file);
  }
  const human = explained(["--actor=user", "--role=S3", "--department=systems", "--authority=execution"]);
  assert(!human.reading_selection.documents.some(d => d.reasons.some(r => ["role", "department", "authority", "delegation_boundary"].includes(r.kind))));
  const delegated = explained(["--actor=ai", "--role=S6", "--department=systems", "--authority=release"]);
  assert(delegated.reading_selection.documents.find(d => d.path === "docs/reference-architecture.md").reasons.some(r => r.kind === "department"));
  assert(delegated.reading_selection.documents.find(d => d.path === "docs/context-releasability-policy.md").reasons.some(r => r.kind === "authority"));
  const short = route(router, ["--actor=user", "--explain-reading", "--limit=1"], query);
  const all = route(router, ["--actor=user", "--explain-reading", "--all"], query);
  assert.deepEqual(short.reading_selection, all.reading_selection);
  for (const flags of [["--receipt"], ["--coverage"], ["--write-artifact"], ["--overwrite-artifact"], ["--scope=wave"],
    ["--mission=synthetic"], ["--wave=W1"], ["--agent=S3"], ["--artifact-root=unused"], [`--target-repository=${ROOT}`]]) {
    const result = spawnSync(process.execPath, [path.join(ROOT, router), "--explain-reading", ...flags, "--", query], { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 2); assert.equal(result.stdout, ""); assert(result.stderr.includes("READING_EXPLANATION_MODE_UNSUPPORTED"));
  }
  const literal = route(router, ["--actor=user", "--"], "Explain --explain-reading in this document.");
  assert(!Object.hasOwn(literal, "reading_selection"));
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

function testReadOnlyOperationsDocuments(router) {
  const specialist = ["docs/enforced-dispatch-and-resume.md", "docs/protected-tool-gateway-contract.md",
    "docs/protected-process-execution.md", "docs/oci-linux-sandbox-provider.md", "docs/production-sandbox-admission.md"];
  const args = ["--actor=ai", "--role=S3", "--department=operations", "--authority=read-only"];
  const core = ["docs/role-document-access-policy.md", "docs/agent-roles-and-authority.md", "docs/approval-scope-policy.md",
    "docs/tool-use-roe.md", "docs/policy-engine-rules.md", "docs/orders-production-pipeline.md",
    "docs/information-to-operations-cycle.md", "docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md"];
  const query = "Draft a handoff document from supplied policy. Do not publish.";
  for (const task of [query, "Draft a support SOP. Do not publish.", "Write a research report from supplied sources.",
    "Draft an OPORD. Do not execute it."]) {
    const ordinary = route(router, [...args, "--explain-reading"], task);
    for (const file of core) assert(ordinary.recommended_documents.some(doc => doc.path === file), file);
    for (const file of specialist) {
      assert(!ordinary.recommended_documents.some(doc => doc.path === file));
      assert(!ordinary.operating_mode.mode_documents.includes(file));
      const reason = ordinary.reading_selection.documents.find(doc => doc.path === file);
      assert.equal(reason.recommended, false);
      assert(reason.reasons.some(r => r.kind === "role" && !r.selected && r.excluded_by.includes("read_only_document_role")));
    }
    const retained = route(router, [...args, "--mission=MIS-READING-CONTEXT"], task);
    for (const file of specialist) assert(retained.recommended_documents.some(doc => doc.path === file));
    assert.deepEqual(retained.matched_routes, ordinary.matched_routes);
    assert.deepEqual(retained.validation_commands, ordinary.validation_commands);
    assert.equal(ordinary.operating_mode.authority, "read-only");
    assert.equal(ordinary.capability_routing.provisional_organization.authority_expansion_authorized, false);
  }
  for (const extra of [["--authority=scoped-execution"], ["--authority=L1"], ["--department=systems"],
    ["--source=docs/protected-process-execution.md"], ["--capability-query=Review production sandbox admission"],
    ["--capability-query=Analyze museum attendance"], ["--wave=W1"], ["--scope=agent"], ["--agent=writer"],
    [`--target-repository=${ROOT}`], ["--artifact-root=unused-reading-artifacts"]]) {
    const result = route(router, [...args, ...extra], query);
    for (const file of specialist) assert(result.recommended_documents.some(doc => doc.path === file), `${extra}: ${file}`);
  }
  for (const task of ["Inspect the current situation.", "Review the protected process contract.",
    "Execute the support SOP.", "Publish the research report.", "Draft a document and run the assigned command.",
    "Draft an OPORD. Do not execute it; run the inspection instead.",
    "Draft an SOP for gateway recovery.", "Draft a handoff document from docs/protected-process-execution.md.",
    "Draft a handoff document about event replay."]) {
    const result = route(router, args, task);
    for (const file of specialist) assert(result.recommended_documents.some(doc => doc.path === file), `${task}: ${file}`);
  }
  const receiptArgs = ["--receipt", "--scope=agent", "--mission=MIS-READONLY-DOCUMENT",
    "--wave=W1", "--agent=writer", `--capability-query=${query}`];
  const rejected = spawnSync(process.execPath, [path.join(ROOT, router), ...args, ...receiptArgs, "--", query],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(rejected.status, 2);
  assert.equal(rejected.stdout, "");
  assert(rejected.stderr.includes("AGENT_ROUTING_WRONG_AUTHORITY"));
  const guarded = route(router, [...args, ...receiptArgs, "--authority=scoped-execution"], query);
  for (const file of specialist) assert(guarded.recommended_documents.some(doc => doc.path === file));
  assert.equal(guarded.authority_scope, "scoped-execution");
  const incomplete = route(router, ["--actor=ai", "--role=S3", "--authority=read-only"], query);
  for (const file of specialist) assert(incomplete.recommended_documents.some(doc => doc.path === file));
  assert(incomplete.operating_mode.escalation_required_when.some(text => text.includes("missing department")));
  const human = route(router, ["--actor=user"], query);
  const humanRole = route(router, [...args, "--actor=user"], query);
  assert.deepEqual(humanRole.recommended_documents, human.recommended_documents);
  assert.deepEqual(humanRole.validation_commands, human.validation_commands);
  const mixed = route(router, [...args, "--capability-query=Analyze museum attendance", "--capability-query=Draft an OPORD"], query);
  assert.deepEqual(mixed.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
  assert.equal(mixed.capability_routing.status, "gap_detected");
  assert.equal(mixed.capability_routing.provisional_organization.standing_department_activation_authorized, false);
}

function testOrderDocumentFormats(router) {
  for (const query of ["Draft an OPORD from the approved objective. Do not execute it.",
    "Write a WARNO.", "Revise the current FRAGO.", "Edit these SITREPs.", "Update our AARs.",
    "Draft or revise proposed project OPORDs."]) {
    for (const mode of [["--actor=user"], ["--actor=ai", "--role=S3", "--department=operations", "--authority=read-only"]]) {
      const result = route(router, mode, query);
      assertRoutes(result, ["document-authoring", "orders"]);
      for (const file of ["docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md", "docs/prompt-templates.md"]) {
        assert(result.recommended_documents.some(doc => doc.path === file));
      }
      assert.equal(result.query, query);
    }
  }
  for (const query of ["Execute the OPORD.", "Read the AAR.", "Approve the FRAGO.",
    "Draft a purchase order.", "Draft an OPORDish plan.", "Update the AARON biography."]) {
    const result = route(router, ["--actor=user"], query);
    assert(!result.matched_routes.some(row => row.id === "document-authoring"), query);
  }
}

function testReadOnlyLogisticsDocuments(router) {
  const args = ["--actor=ai", "--role=S4", "--department=logistics", "--authority=read-only"];
  const sql = "docs/data-model.sql.md", query = "Draft a support SOP from supplied policy. Do not publish.";
  const ordinary = route(router, [...args, "--explain-reading"], query);
  assert(!ordinary.recommended_documents.some(d => d.path === sql));
  assert(!ordinary.operating_mode.mode_documents.includes(sql));
  const reason = ordinary.reading_selection.documents.find(d => d.path === sql);
  assert(reason.reasons.some(r => r.kind === "role" && !r.selected && r.excluded_by.includes("read_only_document_role")));
  for (const file of ["docs/maintenance-readiness-model.md", "docs/agent-readiness-ledger.md",
    "docs/role-document-access-policy.md", "docs/approval-scope-policy.md", "docs/tool-use-roe.md",
    "docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md"]) {
    assert(ordinary.recommended_documents.some(d => d.path === file), file);
  }
  for (const extra of [["--source=" + sql], ["--department=systems"], ["--authority=L1"],
    ["--authority=scoped-execution"], ["--mission=MIS-S4-PROSE"], ["--wave=W1"],
    ["--capability-query=Draft a document about SQL tables."],
    ["--capability-query=Analyze museum attendance."]]) {
    const retained = route(router, [...args, ...extra], query);
    assert(retained.recommended_documents.some(d => d.path === sql), String(extra));
  }
  for (const task of ["Draft a document about SQL tables.", "Review the proposed report against the supplied database records.",
    "Draft a document about relational storage.", "Draft a document about the storage schema.",
    "Draft a document about schema migrations.", "Draft an SOP using docs/data-model.sql.md.",
    "Draft an SOP and run the assigned command.", "Inspect the current situation."]) {
    assert(route(router, args, task).recommended_documents.some(d => d.path === sql), task);
  }
  const incomplete = route(router, ["--actor=ai", "--role=S4", "--authority=read-only"], query);
  assert(incomplete.recommended_documents.some(d => d.path === sql));
  assert(incomplete.operating_mode.escalation_required_when.some(x => x.includes("missing department")));
  const rejected = spawnSync(process.execPath, [path.join(ROOT, router), ...args, "--authority=scoped-execution",
    "--receipt", "--scope=agent", "--mission=MIS-S4-READING", "--wave=W1", "--agent=writer",
    `--capability-query=${query}`, "--", query], { cwd: ROOT, encoding: "utf8" });
  assert.equal(rejected.status, 2); assert.equal(rejected.stdout, "");
  assert(rejected.stderr.includes("AGENT_ROUTING_NOT_S3"));
  const baseline = route(router, [...args, "--mission=MIS-S4-PROSE"], query);
  for (const key of ["matched_routes", "validation_commands", "capability_routing"]) assert.deepEqual(ordinary[key], baseline[key]);
}

function testDocumentSessionAuthority(router) {
  const query = "Review the supplied handoff against its original requirements. Do not publish.";
  for (const role of ["S3", "S4"]) {
    const args = ["--actor=ai", "--role=" + role, "--department=" + (role === "S3" ? "operations" : "logistics")];
    const ordinary = route(router, [...args, "--authority=read-only"], query);
    const bounded = route(router, [...args, "--authority=document-only-verification"], query);
    const expected = structuredClone(ordinary); expected.operating_mode.authority = "document-only-verification";
    assert.deepEqual(bounded, expected);
    const specialist = role === "S3" ? "docs/protected-process-execution.md" : "docs/data-model.sql.md";
    for (const extra of [["--authority=document-only-verification-and-execution"], ["--authority=L1"],
      ["--mission=MIS-READING"], ["--scope=agent"], ["--source=" + specialist]]) {
      assert(route(router, [...args, "--authority=document-only-verification", ...extra], query).recommended_documents.some(row => row.path === specialist));
    }
    const rejected = spawnSync(process.execPath, [path.join(ROOT, router), ...args, "--authority=document-only-verification",
      "--receipt", "--scope=agent", "--mission=MIS-DOCUMENT-SESSION", "--wave=W1", "--agent=reader", `--capability-query=${query}`, "--", query],
    { cwd: ROOT, encoding: "utf8" });
    assert.equal(rejected.status, 2); assert.equal(rejected.stdout, "");
    assert(rejected.stderr.includes(role === "S3" ? "AGENT_ROUTING_WRONG_AUTHORITY" : "AGENT_ROUTING_NOT_S3"));
  }
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

function testSourceBoundDraftReview(router) {
  const observed = "Review the S6 draft (SRC-DRAFT) against the original request and sources and produce a corrected follow-on result in Korean, preserving S6 provenance and current S2 role.";
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S2", "--department=research", "--authority=read-only"]]) {
    for (const query of [observed, "Check the writer's draft against its original requirements.",
      "Compare current drafts to the initial request.", "Review a draft against original requirements.",
      "Review the proposed report against the original sources.", "Check these documents against the assigned evidence.",
      "Compare reports with supplied records.", "Appraise the revised document against its original requirements.",
      "Assess the current report against actual policy."]) {
      const result = route(router, args, query);
      assert.equal(result.query, query); assert.equal(result.capability_query, query);
      assert.equal(result.capability_routing.status, "covered", query);
      assert(result.capability_routing.matched_capability_routes.includes("document-authoring"));
      for (const file of ["docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md", "docs/handoff-packet-template.md"]) {
        assert(result.recommended_documents.some(row => row.path === file), query + ": " + file);
      }
      assert(result.validation_commands.includes("node source-map-linter.js"));
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
    }
    for (const query of ["Review supplier quality.", "Review the draft statute for legal enforceability.",
      "Compare library digitization supplier estimates."]) {
      const result = route(router, args, query);
      assert.equal(result.capability_routing.status, "gap_detected", query);
      assert(!result.capability_routing.matched_capability_routes.includes("document-authoring"));
    }
    for (const query of ["Review revenue against supplied records.", "Compare reports per day against supplied records.",
      "Read the proposed document.", "Approve the proposed report against the original sources.",
      "Review the reporting database against the supplied records."]) {
      const result = route(router, args, query);
      assert(!result.matched_routes.some(row => row.id === "document-authoring"), query);
    }
    const result = route(router, [...args, "--capability-query=Compare library digitization supplier estimates.", "--capability-query=" + observed], observed);
    assert.deepEqual(result.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
    assert.equal(result.capability_routing.status, "gap_detected");
    assert(result.validation_commands.includes("node run-force-structure-change-fixtures.js"));
    assert.equal(result.capability_routing.provisional_organization.standing_department_activation_authorized, false);
  }
}

function testDocumentReviewWorkflow(router) {
  const authoring = [
    "Appraise every SRC-REVIEW finding with source-grounded disposition and exact-quote location checks",
    "Produce a change/unchanged-requirement map and a work report with limits and next bounded action",
    "Reroute and reread all required sources for final self-review of the draft and findings",
    "Reroute and reread all required sources for final self-review of actual V2 and findings.",
    "Assess the supplied findings against actual policy.",
    "Check each finding with source bound evidence.",
    "Review current drafts against the supplied records.",
    "Compare your draft with source policy.",
    "Self review your revised documents before returning them.",
    "Prepare review reports with unresolved source questions."
  ];
  const handoffs = [
    "Declare one successor review unit with V2, review, five verbatim project bodies, full digest bindings and three guide dependencies",
    "Prepare follow-on review packets with the original request and sources.",
    "Assemble next recipient document review bundles without sending them."
  ];
  const unsupported = ["Appraise supplier quality.", "Assess clinical findings against medical sources.",
    "Assess findings about neutron scattering.", "Inspect self-review settings.",
    "Self-review the draft statute for legal enforceability.",
    "Review the draft statute for legal enforceability.", "Inspect work reporting hours.",
    "Identify successors for semiconductor units.", "Appraise findings. Read sources later."];
  for (const mode of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
    for (const [queries, routeId, command] of [[authoring, "document-authoring", "node source-map-linter.js"],
      [handoffs, "continuity-handoff", "node run-handoff-generation-fixtures.js"]]) {
      for (const query of queries) {
        const result = route(router, mode, query);
        assert.equal(result.query, query);
        assert.equal(result.capability_query, query);
        assert.equal(result.capability_routing.status, "covered", query);
        assert(result.capability_routing.matched_capability_routes.includes(routeId), query);
        for (const file of ["docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md", "docs/handoff-packet-template.md"]) {
          assert(result.recommended_documents.some(doc => doc.path === file), query + ": " + file);
        }
        assert(result.validation_commands.includes(command));
        assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
        assert.equal(result.capability_routing.provisional_organization.standing_department_activation_authorized, false);
        if (mode.includes("--actor=ai")) assert.equal(result.operating_mode.authority, "read-only");
      }
    }
    for (const query of unsupported) {
      const result = route(router, mode, query);
      assert.equal(result.capability_routing.status, "gap_detected", query);
      assert(!result.capability_routing.matched_capability_routes.includes("document-authoring"), query);
      assert(!result.capability_routing.matched_capability_routes.includes("continuity-handoff"), query);
    }
    const domain = "Research ICP and sales targeting using the canonical track view";
    const objectives = [domain, authoring[0], authoring[1], authoring[2], handoffs[0]];
    const query = objectives.join("; ") + ". Preserve authority, approval and release limits. Do not publish.";
    const result = route(router, [...mode, ...objectives.map(q => "--capability-query=" + q),
      "--source=docs/reference-architecture.md", "--explain-reading"], query);
    assert.deepEqual(result.capability_queries, objectives);
    assert.equal(result.query, query);
    assert.deepEqual(result.capability_assessments.map(item => item.status), ["gap_detected", "covered", "covered", "covered", "covered"]);
    assert.equal(result.capability_routing.status, "gap_detected");
    assert(result.recommended_documents.some(doc => doc.path === "docs/reference-architecture.md"));
    assert(result.reading_selection.documents.find(doc => doc.path === "docs/handoff-packet-template.md").reasons
      .some(reason => reason.kind === "route" && reason.route_id === "continuity-handoff" && reason.objective_indexes.includes(4)));
    for (const command of [...AUTHORITY_CONTROLS, "node run-force-structure-change-fixtures.js",
      "node validator-cli-prototype/validate.js sample-payloads/valid-force-structure-change-order.json force-structure-change-order"]) {
      assert(result.validation_commands.includes(command));
    }
    assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
    assert.equal(result.capability_routing.provisional_organization.standing_department_activation_authorized, false);
  }
}

function testPlatformExclusionLists(router) {
  const controls = ["node run-maintenance-dashboard-fixtures.js", "node event-replay-prototype/run-event-fixtures.js"];
  const noWork = "No publication, external operations, dashboard or server development.";
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
    const plain = route(router, args, "Draft a handoff document.");
    for (const clause of [noWork, "Dashboard and service development remain deferred.",
      "No dashboard implementation, database development, or server work.",
      "The dashboard, a separate server and service implementation are out of scope.",
      "Do not build a dashboard or a server.", "No publication and external operation or dashboard implementation."]) {
      const query = "Draft a handoff document. " + clause, result = route(router, args, query);
      assert.equal(result.query, query); assert.equal(result.capability_query, query);
      for (const file of RUNTIME_SPECIALIST_DOCS) assert(!result.recommended_documents.some(row => row.path === file), query + ": " + file);
      for (const command of [...plain.validation_commands, ...controls]) assert(result.validation_commands.includes(command));
      for (const row of plain.recommended_documents) assert(result.recommended_documents.some(d => d.path === row.path));
      assert(!result.capability_routing.matched_capability_routes.includes("runtime-architecture-dashboard"));
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
    }
    for (const clause of [noWork + " Review its design.", noWork + " Inspect the server design.",
      "Dashboard and service development remain deferred. Review service contracts.",
      "No dashboard or server development unless the review requires it.",
      "No publication, dashboard or unknown work.", "No external operations or dashboard review omission.",
      "Do not build a dashboard or a server but review the design.",
      "No dashboard implementation approval is needed."]) {
      const query = "Draft a handoff document. " + clause, result = route(router, args, query);
      for (const file of RUNTIME_SPECIALIST_DOCS) assert(result.recommended_documents.some(row => row.path === file), query + ": " + file);
      for (const command of controls) assert(result.validation_commands.includes(command));
    }
    const query = "Draft a handoff document. " + noWork;
    for (const extra of [["--source=docs/command-post-dashboard.md"], ["--capability-query=Review dashboard architecture."]]) {
      const result = route(router, [...args, ...extra], query);
      for (const file of RUNTIME_SPECIALIST_DOCS) assert(result.recommended_documents.some(row => row.path === file));
    }
    const domain = "Analyze museum attendance. " + noWork, gap = route(router, args, domain);
    assert.equal(gap.query, domain); assert.equal(gap.capability_routing.status, "gap_detected");
    assert(gap.capability_routing.provisional_organization.required);
    assert.equal(gap.capability_routing.provisional_organization.standing_department_activation_authorized, false);
    for (const command of [...controls, "node run-force-structure-change-fixtures.js"]) assert(gap.validation_commands.includes(command));
    const compound = route(router, [...args, "--capability-query=" + domain, "--capability-query=Draft a handoff document."], query + " " + domain);
    assert.deepEqual(compound.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
  }
  const task = "Draft a handoff document. " + noWork;
  const systems = route(router, ["--actor=ai", "--role=S6", "--department=systems", "--authority=read-only"], task);
  for (const file of ["docs/reference-architecture.md", "docs/event-sourcing-model.md"]) {
    assert(systems.recommended_documents.some(row => row.path === file));
  }
  const args = ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution", "--capability-query=Review dashboard architecture."];
  const direct = route(router, args, task);
  const receipt = route(router, [...args, "--receipt", "--scope=agent", "--mission=MIS-EXCLUSION-READING", "--wave=W1", "--agent=writer"], task);
  assert.equal(receipt.router_query, task);
  for (const key of ["matched_routes", "validation_commands", "capability_routing", "recommended_documents"]) assert.deepEqual(receipt[key], direct[key]);
}

function testDocumentReadinessScope(router) {
  const observed = "Revise outgoing document handoffs and verification worksheets against their original request, current assignment, supplied sources and predecessor. Preserve explicit restrictions, USER decision ownership, unknown operational assignees and useful allowed drafting. Clarify document readiness versus operational completion without adding an unsupported quality threshold. Maintain mirrored Codex and Claude guidance and regression evidence; no publication, private-source exception, dashboard or service work.";
  const controls = ["node run-maintenance-dashboard-fixtures.js", "node event-replay-prototype/run-event-fixtures.js"];
  const check = (result, technical, query) => {
    assert.equal(result.type === "RoutingReceipt" ? result.router_query : result.query, query);
    for (const file of RUNTIME_SPECIALIST_DOCS) {
      assert.equal(result.recommended_documents.some(row => row.path === file), technical, query + ": " + file);
    }
    for (const command of controls) assert(result.validation_commands.includes(command));
    assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
  };
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
    const actual = route(router, args, observed);
    assertRoutes(actual, ["document-authoring", "continuity-handoff"]);
    check(actual, false, observed);
    for (const file of ["docs/handoff-packet-template.md", "docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md"]) {
      assert(actual.recommended_documents.some(row => row.path === file));
    }
    assert(!actual.capability_routing.matched_capability_routes.includes("runtime-architecture-dashboard"));
    for (const query of [
      "Draft a handoff document. Clarify document readiness.",
      "Revise the outgoing documents. Assess the readiness of the drafts.",
      "Update the current documentation. Check worksheet preparedness.",
      "Write a proposed document. Review the preparedness of this report.",
      "Draft a handoff document; no publication, private-source exception, dashboard or service work.",
      "Draft a handoff document; no dashboard, database, or standalone service work.",
      "Draft a handoff document; no dashboard and database work.",
      "Draft a handoff document; no publication or dashboard work."
    ]) {
      const result = route(router, args, query);
      check(result, false, query);
      assertRoutes(result, ["document-authoring"]);
      assert(result.recommended_documents.some(row => row.path === "docs/handoff-packet-template.md"));
      assert(!result.capability_routing.matched_capability_routes.includes("runtime-architecture-dashboard"));
    }
    for (const query of [
      "Draft a handoff document. Review tool readiness and dashboard architecture.",
      "Revise outgoing documents. Clarify document readiness. Review unit readiness.",
      "Draft a handoff document. Document readiness failures.",
      "Document readiness failures.",
      "Draft readiness documentation.",
      "Draft a handoff document. Review readiness of the dashboard.",
      "Draft a handoff document; no publication, dashboard or service work. Review its design.",
      "Draft a handoff document; no dashboard or service work unless the review requires it.",
      "Draft a handoff document; no dashboard review omission.",
      "Draft a handoff document; no skipped dashboard verification.",
      "Draft a handoff document; no dashboard, unknown task or service work."
    ]) {
      const result = route(router, args, query);
      check(result, true, query);
      assert(result.capability_routing.matched_capability_routes.includes("runtime-architecture-dashboard"));
    }
    const prose = "Revise outgoing document handoffs. Clarify document readiness; no publication, dashboard or service work.";
    for (const extra of [["--source=docs/command-post-dashboard.md"], ["--capability-query=Review tool readiness and dashboard architecture"]]) {
      const result = route(router, [...args, ...extra], prose);
      check(result, true, prose);
    }
    const inline = prose + " Read docs/event-sourcing-model.md.";
    check(route(router, args, inline), true, inline);
    const domain = "Analyze museum attendance by city; no publication, dashboard or service work.";
    const gap = route(router, args, domain);
    check(gap, false, domain);
    assert.equal(gap.capability_routing.status, "gap_detected");
    assert(gap.validation_commands.includes("node run-force-structure-change-fixtures.js"));
    const combined = domain + " " + prose;
    const compound = route(router, [...args, "--capability-query=" + domain, "--capability-query=" + prose], combined);
    check(compound, false, combined);
    assert.deepEqual(compound.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
  }
  const query = "Revise outgoing document handoffs. Clarify document readiness; no dashboard or service work.";
  const technical = route(router, ["--actor=ai", "--role=S6", "--department=systems", "--authority=read-only"], query);
  for (const file of ["docs/reference-architecture.md", "docs/event-sourcing-model.md"]) {
    assert(technical.recommended_documents.some(row => row.path === file));
  }
  const args = ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution",
    "--capability-query=Review tool readiness and dashboard architecture"];
  const direct = route(router, args, query);
  const receipt = route(router, [...args, "--receipt", "--scope=agent", "--mission=MIS-DOCUMENT-READINESS",
    "--wave=W1", "--agent=writer"], query);
  check(receipt, true, query);
  for (const key of ["matched_routes", "validation_commands", "capability_routing"]) assert.deepEqual(receipt[key], direct[key]);
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "controls-readiness-input-")));
  try {
    fs.writeFileSync(path.join(project, "dashboard-review.md"), "PRIVATE-READINESS-INPUT\n");
    assert.equal(spawnSync("git", ["init", "-q", project]).status, 0);
    const result = route(router, ["--actor=user", `--input-repository=${project}`, "--input-source=dashboard-review.md"], query);
    check(result, true, query);
    assert.equal(result.task_inputs.content_loaded, false);
    assert.equal(result.task_inputs.authorization_verified, false);
    assert(!JSON.stringify(result).includes("PRIVATE-READINESS-INPUT"));
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

function testSkillOperationsReading(router) {
  const general = ["docs/skill-first-product-scope.md", "docs/document-authoring-workflow.md",
    "codex-skills/controls-doctrine-operator/references/document-routing.md"];
  const specialists = ["docs/implementation-candidate-registry.md", "docs/completion-backlog.md",
    "install-ai-cli-skills.sh", "docs/skill-operational-mission-lifecycle.md",
    ...["codex-skills", ".claude/skills"].flatMap(provider => [
      `${provider}/controls-doctrine-operator/SKILL.md`,
      `${provider}/controls-doctrine-operator/references/self-improvement-loop.md`])];
  const controls = ["node run-skill-control-enforcement-fixtures.js", "node run-skill-installation-fixtures.js",
    "node run-agent-routing-preflight-fixtures.js", "node implementation-candidate-registry.js audit"];
  const ordinary = "Use document routing to draft a support SOP. Do not publish.";
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
    for (const [query, maintenance] of [
      [ordinary, false], ["Use the Codex skill to draft a handoff document.", false],
      ["Draft an inventory SOP using Claude Code.", false], ["Draft a coverage report for the corpus.", true],
      ["Use CLI routing to write this document.", false], ["Write a skill-based training SOP.", false],
      ["Use the operator skill to review the support SOP.", false],
      ["Install the Codex and Claude skills.", true], ["Update both skill instructions.", true],
      ["Review our Codex and Claude skills.", true], ["Improve document routing.", true],
      ["Update Codex CLI skills.", true], ["Modify the Claude Code skill.", true],
      ["Upgrade our routing rules.", true], ["Change the existing skill.", true],
      ["Revise both Codex CLI and Claude Code CLI skills.", true],
      ["Use Codex CLI to revise a support SOP.", false],
      ["Fix routing rules.", true], ["Audit the installed skill.", true],
      ["Check skill discovery and configuration.", true],
      ["Inventory the corpus and assess routing coverage.", true],
      ["Draft a skill maintenance note.", true], ["Open a wave and prepare the context pack.", true],
      ["Use routing to draft a support SOP. Do not skip skill installation review.", true]
    ]) {
      const result = route(router, [...args, "--all"], query), paths = result.recommended_documents.map(row => row.path);
      assertRoutes(result, ["skill-operations"]);
      assert.equal(result.query, query); assert.equal(result.capability_query, query);
      for (const file of [...general, ...result.operating_mode.mode_documents]) assert(paths.includes(file), query + ": " + file);
      for (const file of specialists) {
        assert.equal(paths.includes(file), maintenance, query + ": " + file);
        assert([...result.recommended_documents, ...result.supporting_artifacts].some(row => row.path === file),
          "Conditional manuals must remain discoverable: " + file);
      }
      for (const command of controls) assert(result.validation_commands.includes(command));
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
    }
    const plain = route(router, args, ordinary);
    for (const file of specialists) {
      const result = route(router, [...args, "--source=" + file], ordinary);
      assert(result.task_references.resolved.some(row => row.path === file));
      for (const required of specialists) assert(result.recommended_documents.some(row => row.path === required));
      for (const key of ["query", "matched_routes", "validation_commands", "capability_routing", "operating_mode"]) {
        assert.deepEqual(result[key], plain[key], "Explicit input changed " + key);
      }
    }
    for (const extra of [["--capability-query=Review skill installation"],
      ["--capability-query=Review skill installation", "--capability-query=Draft a support SOP"]]) {
      const result = route(router, [...args, ...extra], ordinary);
      for (const file of specialists) assert(result.recommended_documents.some(row => row.path === file));
    }
    const compound = route(router, [...args, "--capability-query=Compare archival digitization offers",
      "--capability-query=Draft an inventory SOP"], "Compare archival digitization offers and draft an inventory SOP using Claude.");
    assert.deepEqual(compound.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
    assert.equal(compound.capability_routing.status, "gap_detected");
    for (const file of specialists) assert(!compound.recommended_documents.some(row => row.path === file));
    for (const command of [...controls, "node run-force-structure-change-fixtures.js"]) assert(compound.validation_commands.includes(command));
  }
  const ai = ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"];
  const plain = route(router, ai, ordinary);
  const department = route(router, [...ai, "--department=skill-maintenance"], ordinary);
  for (const file of specialists) assert(department.recommended_documents.some(row => row.path === file));
  for (const key of ["matched_routes", "validation_commands", "capability_routing"]) assert.deepEqual(department[key], plain[key]);
  const human = route(router, ["--actor=user"], ordinary);
  const humanMetadata = route(router, ["--actor=user", "--department=skill-maintenance"], ordinary);
  assert.deepEqual(humanMetadata.recommended_documents, human.recommended_documents);
  const inline = route(router, ["--actor=user"], ordinary + " Read docs/completion-backlog.md.");
  assert(inline.task_references.resolved.some(row => row.path === "docs/completion-backlog.md"));
  for (const file of specialists) assert(inline.recommended_documents.some(row => row.path === file));
  const guarded = ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution", "--capability-query=Draft a support SOP"];
  const direct = route(router, guarded, ordinary);
  const receipt = route(router, [...guarded, "--receipt", "--scope=agent", "--mission=MIS-SKILL-READING",
    "--wave=W1", "--agent=writer"], ordinary);
  for (const file of specialists) {
    assert(!direct.recommended_documents.some(row => row.path === file));
    assert(receipt.recommended_documents.some(row => row.path === file), "Guarded reading was narrowed: " + file);
  }
  for (const file of direct.recommended_documents) assert(receipt.recommended_documents.some(row => row.path === file.path));
  for (const key of ["matched_routes", "validation_commands", "capability_routing"]) assert.deepEqual(receipt[key], direct[key]);
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "controls-skill-input-")));
  try {
    fs.writeFileSync(path.join(project, "skill-instructions.md"), "PRIVATE-SKILL-INPUT\n");
    const init = spawnSync("git", ["init", "-q", project], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const result = route(router, ["--actor=user", `--input-repository=${project}`, "--input-source=skill-instructions.md"], ordinary);
    assert.deepEqual(result.task_inputs.sources, [{ path: "skill-instructions.md", exists: true }]);
    assert.equal(result.task_inputs.content_loaded, false); assert.equal(result.task_inputs.authorization_verified, false);
    for (const file of specialists) assert(result.recommended_documents.some(row => row.path === file));
    assert(!JSON.stringify(result).includes("PRIVATE-SKILL-INPUT"));
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
  testSourceBoundDraftReview(router);
  testDocumentReviewWorkflow(router);
  testPlatformExclusionLists(router);
  validateSkill(path.posix.dirname(path.posix.dirname(router)));
  testDocumentReadinessScope(router);
  testDirectTaskIdentity(router);
  testS6Reading(router);
  testReadOnlyOperationsDocuments(router);
  testReadOnlyLogisticsDocuments(router);
  testDocumentSessionAuthority(router);
  testOrderDocumentFormats(router);
  testTaskReadingScope(router);
  testSourceReadingScope(router);
  testSkillOperationsReading(router);
  testOrdinaryAuthoring(router);
  testReadingProvenance(router);
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
  for (const query of ["Maintain the project glossary", "Capture user vocabulary", "Review terminology definitions",
    "Preserve project-scoped user definitions from SRC-TERMS and leave unconfirmed meanings unresolved.",
    "Preserve SRC-TERMS user-defined terms within project scope and leave undefined expressions unconfirmed",
    "Keep project-specific USER definitions scoped to this assignment", "Review user defined terms without confirming inferred meanings",
    "Preserve a user-defined term within its original scope",
    "Record two project terms with original language and scope, distinguishing confirmed definition from undefined expression.",
    "Organize two project terms from SRC-TERMS distinguishing confirmed definitions from expressions needing meaning confirmation, preserving original language and scope",
    "Clarify this project term before drawing a conclusion"]) {
    for (const args of [["--actor=user"], ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only"]]) {
      const result = route(router, args, query);
      assertRoutes(result, ["project-terminology"]);
      assert(result.recommended_documents.some(item => item.path === "docs/project-terminology-workflow.md"));
      assert(result.recommended_documents.some(item => item.path === "docs/glossary.md"));
      assert(result.validation_commands.includes("node run-project-terminology-fixtures.js"));
      assert.equal(result.capability_routing.status, "covered");
      assert.equal(result.capability_routing.provisional_organization.authority_expansion_authorized, false);
      assert(!result.matched_routes.some(item => ["local-operator-console", "enforced-dispatch"].includes(item.id)));
      if (args.includes("--actor=ai")) assert.equal(result.operating_mode.authority, "read-only");
    }
  }
  for (const query of ["Check authentication user definitions", "Inspect a user-defined function", "Review the general project definition",
    "Inspect user-defined terminal settings", "Inspect user defined termination hooks", "Check project-scoped user definitional metadata",
    "Inspect project terminal settings", "Inspect project termination hooks", "Review payment terms", "Review subproject terms"]) {
    const result = route(router, ["--actor=user"], query);
    assert(!result.matched_routes.some(item => item.id === "project-terminology"), query);
  }
  const termObjective = "Preserve project-scoped user definitions from SRC-TERMS and leave unconfirmed meanings unresolved.";
  const domainObjective = "Analyze museum attendance by city";
  const compoundTerms = route(router, ["--actor=ai", "--role=S6", "--department=knowledge", "--authority=read-only",
    `--capability-query=${domainObjective}`, `--capability-query=${termObjective}`], `${domainObjective}; ${termObjective}`);
  assert.deepEqual(compoundTerms.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
  assert.equal(compoundTerms.capability_routing.status, "gap_detected");
  assert.equal(compoundTerms.operating_mode.authority, "read-only");
  assert.equal(compoundTerms.capability_routing.provisional_organization.authority_expansion_authorized, false);
  const projectTerms = "Organize two project terms from SRC-TERMS distinguishing confirmed definitions from expressions needing meaning confirmation, preserving original language and scope";
  const mixedTerms = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=read-only",
    `--capability-query=${domainObjective}`, `--capability-query=${projectTerms}`], `${domainObjective}; ${projectTerms}. Do not publish or create a standing organization.`);
  assert.deepEqual(mixedTerms.capability_queries, [domainObjective, projectTerms]);
  assert.deepEqual(mixedTerms.capability_assessments.map(row => row.status), ["gap_detected", "covered"]);
  assert.equal(mixedTerms.capability_routing.status, "gap_detected");
  assert.equal(mixedTerms.operating_mode.authority, "read-only");
  assert.equal(mixedTerms.capability_routing.provisional_organization.authority_expansion_authorized, false);
  assert.equal(mixedTerms.capability_routing.provisional_organization.standing_department_activation_authorized, false);
  assert(mixedTerms.query.endsWith("Do not publish or create a standing organization."));
  for (const args of [["--actor=user"], ["--actor=ai", "--role=S3", "--department=operations", "--authority=read-only"]]) {
    const result = route(router, args, "Prepare a project document packet from the named inputs.");
    assertRoutes(result, ["project-document-delivery"]);
    assert(result.recommended_documents.some(item => item.path === "docs/role-document-access-policy.md"));
    assert(result.validation_commands.includes("node run-project-document-packet-fixtures.js"));
    assert.strictEqual(result.capability_routing.status, "covered");
    for (const query of ["Maintain project-document-quote.js.", "Use exact quote lookup for a disputed source citation."]) {
      const quoted = route(router, args, query);
      assertRoutes(quoted, ["project-document-delivery"]);
      assert(quoted.recommended_documents.some(item => item.path === "docs/role-document-access-policy.md"));
      assert(quoted.validation_commands.includes("node run-project-document-quote-fixtures.js"));
      assert.strictEqual(quoted.capability_routing.status, "covered");
      assert.strictEqual(quoted.capability_routing.provisional_organization.authority_expansion_authorized, false);
    }
    const ordinary = route(router, args, "Review document access for an existing policy.");
    assertRoutes(ordinary, ["document-access-context"]);
    assert(!ordinary.validation_commands.includes("node run-project-document-packet-fixtures.js"),
      "project content preparation checks must not become mandatory for unrelated document access");
    assert(!ordinary.validation_commands.includes("node run-project-document-quote-fixtures.js"));
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
  for (const query of ["minimum readiness", "readiness authority intersection", "readiness-authority-intersection", "approval cannot replace readiness"]) {
    const result = route(router, ["--actor=user"], query); assertRoutes(result, ["readiness-intersection"]);
    assert.equal(result.capability_routing.status, "covered"); assert(result.validation_commands.includes("node run-authority-integration-fixtures.js"));
    assert(result.recommended_documents.some(item => item.path === "docs/readiness-authority-intersection.md"));
  }
  for (const query of ["@cli-default", "CLI default model", "default model binding", "CodexModelSelection", "codex-model-selection"]) {
    const result = route(router, ["--actor=user"], query); assertRoutes(result, ["cli-model-selection"]);
    assert.equal(result.capability_routing.status, "covered"); assert(result.validation_commands.includes("node run-codex-model-selection-fixtures.js"));
    assert(result.recommended_documents.some(item => item.path === "docs/codex-default-model-binding.md"));
  }
  for (const query of ["ip-address", "ip-zone", "zone parser", "GHSA-rxp7-6hxx-x8q5", "verifier dependency", "dependency migration", "historical producer", "parser denial of service"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["advisory-dependency"]); assert.equal(result.capability_routing.status, "covered");
    assert.equal(result.matched_routes[0].id, "advisory-dependency");
    assert.equal(result.recommended_documents[2].path, "docs/github-release-independent-verification.md");
    assert(result.validation_commands.includes("node run-github-release-independent-verification-fixtures.js"));
    if (query === "ip-address") assert(result.validation_commands.includes("node run-github-release-publisher-fixtures.js"));
  }
  for (const query of ["ForceRegistryEntity", "ForceRegistryRequest", "ForceRegistryProposal", "ForceRegistryAuthorization", "ForceRegistryEvent",
    "force-registry", "operate_controls_force_registry", "schema-files/force-registry-entity.schema.json"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["force-registry"]); assert.equal(result.capability_routing.status, "covered");
    assert.equal(result.capability_routing.provisional_organization.required, false);
    assert(result.recommended_documents.some(item => item.path === "docs/force-registry-enrollment.md"));
    assert(result.validation_commands.includes("node run-force-registry-fixtures.js"));
  }
  for (const query of ["WorkloadControlInput", "WorkloadPolicyAssessment", "WorkloadControlReceipt", "workload-control", "subject-bound report input", "schema-files/workload-policy-assessment.schema.json"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["workload-controls"]); assert.equal(result.capability_routing.status, "covered");
    assert.equal(result.capability_routing.provisional_organization.required, false);
    assert(result.recommended_documents.some(item => item.path === "docs/subject-bound-workload-controls.md"));
    assert(result.validation_commands.includes("node run-workload-control-fixtures.js"));
  }
  for (const query of ["readiness drop", "cross-mission capability registry training progression readiness actual grant reconciliation",
    "READINESS_REQUALIFICATION_REQUIRED", "reconcile_controls_readiness", "schema-files/readiness-drop-reconciliation.schema.json"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["force-readiness"]); assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/readiness-drop-reconciliation.md"));
    assert(result.validation_commands.includes("node run-readiness-drop-revocation-fixtures.js"));
  }
  for (const query of ["analysis reconciliation", "analysis hold", "failed request analysis", "order analysis failed transfer reconciliation",
    "schema-files/operator-analysis-reconciliation-authorization.schema.json", "Review ANALYSIS-RECONCILIATION before acknowledging publication", "operator-analysis-publication.js", "operator-reconciliation-contract-core.js"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["analysis-reconciliation"]); assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/order-analysis-reconciliation.md"));
    assert(result.validation_commands.includes("node run-operator-analysis-reconciliation-fixtures.js"));
    assert(result.validation_commands.includes("node run-operator-analysis-reconciliation-contract-fixtures.js"));
  }
  for (const query of ["order analysis", "order-analysis-generation", "native planning", "prepare_controls_analysis", "codex-bounded-collector.js",
    "model invocation integrity", "model-invocation-integrity", "derived order output bounds", "draft too large", "ORDER_INTAKE_DRAFT_TOO_LARGE"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["order-analysis-generation"]);
    assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/native-order-analysis.md"));
    assert(result.validation_commands.includes("node run-native-order-analysis-fixtures.js"));
    assert(result.validation_commands.includes("node run-model-invocation-integrity-fixtures.js"));
    assert(result.validation_commands.includes("node run-request-order-compiler-fixtures.js"));
  }
  for (const query of ["requirement inventory", "semantic coverage review", "semantic-review-assignment", "semantic review assignment",
    "schema-files/semantic-review-assignment.schema.json", "Review SEMANTIC-REVIEW-ASSIGNMENT before adoption", "review_controls_requirements"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["semantic-admission"]);
    assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/requirement-inventory-admission.md"));
    assert(result.validation_commands.includes("node run-requirement-inventory-fixtures.js"));
    assert.equal(result.capability_routing.provisional_organization.required, false);
  }
  for (const query of ["bounded planning", "bounded-planning", "automatic plan", "structural synthesis", "plan_controls_mission"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["bounded-planning"]);
    assert.equal(result.capability_routing.status, "covered");
    assert.equal(result.capability_routing.provisional_organization.required, false);
    assert(result.recommended_documents.some(item => item.path === "docs/bounded-plan-synthesis.md"));
    assert(result.validation_commands.includes("node run-bounded-planning-fixtures.js"));
    assert(result.validation_commands.includes("node run-bounded-planning-metadata-fixtures.js"));
  }
  for (const query of ["model hold", "operator-model-reconciliation", "model-transfer-reconciliation"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["semantic-omission"]);
    assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/model-transfer-reconciliation.md"));
    assert(result.validation_commands.includes("node run-operator-model-reconciliation-fixtures.js"));
  }
  for (const query of ["operational COP", "operations screen", "critical alert scope"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["operational-cop"]);
    assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/operational-cop.md"));
    assert(result.validation_commands.includes("node run-operational-cop-fixtures.js"));
  }
  for (const query of ["issuance recovery", "recover-issuance", "cancel-issuance"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["dispatch-issuance-recovery"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/dispatch-issuance-recovery.md"));
    assert(result.validation_commands.includes("node run-dispatch-issuance-contract-fixtures.js"));
  }
  for (const query of ["method channel continuation", "Review and validate bounded same-wave method channel continuation preserving budgets, reports, and interruption lineage"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["method-control-channel"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert.strictEqual(result.capability_routing.provisional_organization.required, false);
    assert(result.recommended_documents.some(item => item.path === "docs/method-control-channel.md"));
    assert(result.validation_commands.includes("node run-method-control-contract-fixtures.js"));
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
  for (const file of ["docs", "schema-files", "codex-skills", ".claude/skills", "install-ai-cli-skills.sh",
    "sample-payloads/README.md", "validator-cli-prototype/README.md"]) {
    fs.cpSync(path.join(ROOT, file), path.join(sourceRoot, file), { recursive: true });
  }
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
    const invoke = (args, status) => {
      const result = spawnSync(process.execPath, [path.join(ROOT, router), `--doctrine-root=${sourceRoot}`, ...args],
        { cwd: sourceRoot, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      assert.equal(result.status, status, result.stderr || result.stdout);
      referenceIntegrityChecks++;
      return result;
    };
    const coverage = status => JSON.parse(invoke(["--coverage"], status).stdout);
    const good = coverage(1);
    assert.deepEqual(good.unrouted_artifacts.map(item => item.path).sort(), ["docs/a/shared.md", "docs/b/shared.md"]);
    assert.equal(good.unavailable_declared_document_count, 0, JSON.stringify(good.unavailable_declared_documents));
    assert(good.declared_document_count > 90);
    assert.deepEqual(good.unavailable_declared_documents, []);
    const task = "Draft a support SOP. Do not publish.";
    const checkUnavailable = file => {
      const report = coverage(1);
      assert.equal(report.valid, false);
      assert(report.unavailable_declared_documents.includes(file));
      assert.equal(report.unavailable_declared_document_count, report.unavailable_declared_documents.length);
      for (const extra of [["--actor=user"], ["--receipt", "--scope=agent", "--mission=MIS-REFERENCE",
        "--wave=W1", "--agent=writer", "--actor=ai", "--role=S3", "--department=operations",
        "--authority=scoped-execution", `--capability-query=${task}`, "--write-artifact", "--overwrite-artifact",
        `--target-repository=${sourceRoot}`]]) {
        const denied = invoke([...extra, "--", task], 2);
        assert.equal(denied.stdout, "");
        assert(denied.stderr.includes("ROUTING_DOCUMENT_UNAVAILABLE") && denied.stderr.includes(file));
      }
      assert.deepEqual(fs.readdirSync(path.join(sourceRoot, ".cannae")), ["retained.md"]);
    };
    const file = "docs/document-authoring-workflow.md", absolute = path.join(sourceRoot, file), original = fs.readFileSync(absolute);
    try {
      fs.unlinkSync(absolute);
      checkUnavailable(file);
      const unrelated = JSON.parse(invoke(["--actor=user", "--", "Explain the doctrine corpus."], 0).stdout);
      assert(!unrelated.recommended_documents.some(d => d.path === file));
      fs.mkdirSync(absolute);
      checkUnavailable(file);
      fs.rmdirSync(absolute);
      fs.symlinkSync(path.join(ROOT, file), absolute);
      checkUnavailable(file);
      fs.unlinkSync(absolute);
      fs.writeFileSync(absolute, original);
      fs.appendFileSync(path.join(sourceRoot, ".gitignore"), file + "\n");
      checkUnavailable(file);
    } finally {
      fs.rmSync(absolute, { force: true, recursive: true });
      fs.writeFileSync(absolute, original);
      write(".gitignore", "ignored-source.md\n.cannae/\n.cxt/\n");
    }
    // The same denial must apply to role, department, authority and fallback selection.
    for (const [selected, flags, query] of [
      ["docs/role-document-access-policy.md", ["--actor=ai", "--role=S2", "--department=intelligence", "--authority=read-only"], task],
      ["docs/agent-battle-rhythm.md", ["--actor=ai", "--role=COS", "--department=coordination", "--authority=read-only"], task],
      ["docs/reference-architecture.md", ["--actor=ai", "--role=S2", "--department=systems", "--authority=read-only"], task],
      ["docs/risk-acceptance-authority.md", ["--actor=ai", "--role=S2", "--department=intelligence", "--authority=risk"], task],
      ["docs/force-structure-change-policy.md", ["--actor=user"], "Analyze museum attendance."]
    ]) {
      const target = path.join(sourceRoot, selected), bytes = fs.readFileSync(target);
      try {
        fs.unlinkSync(target);
        const denied = invoke([...flags, "--", query], 2);
        assert.equal(denied.stdout, "");
        assert(denied.stderr.includes("ROUTING_DOCUMENT_UNAVAILABLE") && denied.stderr.includes(selected));
        assert(coverage(1).unavailable_declared_documents.includes(selected));
      } finally { fs.writeFileSync(target, bytes); }
    }
    assert.deepEqual(coverage(1).unavailable_declared_documents, []);
  }
} finally {
  fs.rmSync(sourceRoot, { recursive: true, force: true });
}
console.log(`Declared-reference integrity checks passed: ${referenceIntegrityChecks}.`);

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
