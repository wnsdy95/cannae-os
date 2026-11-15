#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict"), { execFileSync } = require("node:child_process");
const { createDocumentSession } = require("./project-document-session");
const packets = require("./project-document-packet"), reviews = require("./project-document-review");
const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-document-session-")));
const json = value => JSON.stringify(value, null, 2) + "\n";
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
const guides = ["docs/skill-first-product-scope.md", "docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md", "docs/handoff-packet-template.md"];
const routeInput = { query: "Review the complete supplied handoff and retain all original constraints.",
  objectives: ["Review a source-grounded handoff document.", "Optimize fictional lunar museum exhibit assignments."] };
let cases = 0;
const test = (name, run) => { run(); cases++; console.log(`PASS ${name}`); };
const success = result => { assert(!result.error, result.error); assert.equal(result.release_authorized, false); return result; };
async function main() {
try {
  for (const provider of ["codex", "claude_code"]) {
    const root = path.join(parent, provider); write(path.join(root, ".gitignore"), ".cannae/\n");
    write(path.join(root, "reference-only.md"), "password=synthetic-unread-value");
    const git = args => execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8" });
    git(["init", "-q"]); git(["add", "."]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"]);
    const request = structuredClone(require("./sample-payloads/valid-project-document-packet-representation-request.json"));
    request.id = "PDR-RECEIVING-TEST";
    request.task = "Review all 14 supplied handoff sources and four assigned guides for the fictional exhibit assignment. USER alone may change the no-retry instruction. Do not resume the blocked work or publish.";
    request.recipient = { agent_id: "receiving-test", provider, role: "S6", department: "knowledge", duty: "document_review", authority_level: "L1" };
    request.documents = Array.from({ length: 14 }, (_, i) => {
      const id = "UNIT-" + (i + 1), relative = ".cannae/document-drafts/RECEIVING/source-" + (i + 1) + ".md";
      const content = `# Synthetic source ${i + 1}\nUSER retains retry decisions. No publication or blocked-work resumption.\nReport secret exposure to USER.\nOriginal: ${root}/${relative}\n`;
      write(path.join(root, relative), content);
      return { id, path: relative, required: true, classification: "internal", allowed_roles: ["S6"], allowed_departments: ["knowledge"],
        duties: ["document_review"], minimum_authority_level: "L1", delivery_mode: "representation", source_sha256: packets.sha256(content),
        representation: { method: "source_id_locations", project_handle: "PROJECT-RECEIVING" } };
    });
    request.documents.push({ id: "SRC-REFERENCE", path: "reference-only.md", required: false, classification: "restricted", allowed_roles: ["S6"],
      allowed_departments: ["knowledge"], duties: ["document_review"], minimum_authority_level: "L1", delivery_mode: "reference_only" });
    const proposal = reviews.proposeReview(request, root);
    const decision = { schema_version: "0.1", type: "ProjectDocumentReviewDecision", proposal_sha256: proposal.proposal_sha256,
      decision_maker: "USER", decision: "approve_preparation", decision_reference: "Synthetic local integration fixture, not real USER consent.",
      created_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(),
      scope: "exact_proposal_only", no_secret_values_confirmed: true, requirements_preserved: true, release_authorized: false };
    const decisionBytes = json(decision); write(proposal.decision_path, decisionBytes);
    const prepared = reviews.prepareReviewed(root, { proposal_path: path.relative(root, proposal.proposal_path),
      proposal_sha256: proposal.proposal_sha256, decision_sha256: packets.sha256(decisionBytes) });
    const originalSkill = path.join(__dirname, provider === "codex" ? "codex-skills/controls-doctrine-operator" : ".claude/skills/controls-doctrine-operator");
    const skill = path.join(parent, provider + "-skill"); fs.cpSync(originalSkill, skill, { recursive: true });
    const access = { schema_version: "0.1", type: "DocumentAccessManifest", id: "DAM-RECEIVING", mission_id: "SYNTHETIC-RECEIVING", default_decision: "deny",
      role_profiles: [{ role: "S6", duty: "document_review", authority_level: "L1", required_documents: guides, optional_documents: [], denied_documents: [], escalation_role: "COS" }],
      documents: guides.map(file => ({ path: file, title: file, classification: "internal", owner_role: "S6", allowed_roles: ["S6"], duties: ["document_review"],
        minimum_authority_level: "L1", delivery_mode: "raw", rationale: "Current source, authorship and receiving discipline for this fixture." })),
      controls: { need_to_know: true, no_bulk_read: true, audit_required: true, exception_requires_approval: true, source_of_truth: "docs/role-document-access-policy.md" },
      classification: "internal", status: "pending", created_at: new Date().toISOString() };
    const config = { reader: { repository: root, packet_path: prepared.packet_path, packet_sha256: prepared.packet_sha256, recipient: request.recipient },
      skill_directory: skill, doctrine_root: __dirname, task_id: "RECEIVING-TEST", phase: "review", access_manifest: access,
      corpus_sha256: Object.fromEntries(guides.map(file => [file, packets.sha256(fs.readFileSync(path.join(__dirname, file)))])),
      held_source_ids: [], max_calls: 80, max_route_calls: 8, deadline_ms: 600000 };
    let session, route;
    test(`${provider}: real installed router preserves original task, all objectives and 18 required sources without private locations`, () => {
      session = createDocumentSession(config);
      assert.equal(session.execute("read_document", { route_id: "none", source_id: "UNIT-1" }).error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
      route = success(session.execute("route_current_task", routeInput));
      assert.equal(route.original_task, request.task); assert(route.query.includes(request.task));
      assert.equal(route.required_source_count, 18); assert.equal(route.documents.length, 19);
      assert.equal(route.capability_assessments.length, 2); assert.equal(route.capability_routing.status, "gap_detected");
      assert.equal(route.request_intake.objectives, "caller_declared");
      assert.equal(route.request_intake.original_constraints_in, "query");
      assert.equal(route.request_intake.semantic_completeness_verified, false);
      assert.equal(route.request_intake.authority_changed, false);
      assert.equal(route.operating_mode.role, "S6"); assert.equal(route.task_context.id, "RECEIVING-TEST");
      assert.equal(route.task_context.repository_binding, "withheld");
      for (const value of [root, __dirname, skill, ".cannae/document-drafts", "reference-only.md", "synthetic-unread-value"]) assert(!JSON.stringify(route).includes(value), value);
      assert(route.documents.every(row => !Object.hasOwn(row, "content")));
      assert(route.documents.filter(row => row.id.startsWith("UNIT-")).every(row => row.delivery_mode === "representation"));
      assert.equal(route.reading_selection.access_authorized, false);
      assert.equal(route.reading_selection.required_reading_assessed, false);
      assert.deepEqual(route.reading_selection.project_inputs, []);
      for (const file of guides) assert(route.reading_selection.documents.find(row => row.path === file).reasons.some(r => r.kind === "source_argument"));
      const extra = route.reading_selection.documents.find(row => row.recommended && !guides.includes(row.path));
      assert(extra, "Fixture needs a recommendation outside the assigned profile");
      assert.equal(session.execute("read_document", { route_id: route.route_id, source_id: "corpus:" + extra.path }).error, "PROJECT_SESSION_SOURCE_NOT_READABLE");
    });
    test(`${provider}: selected tool reads preserve representations and reconcile delivered IDs, not claimed comprehension`, () => {
      let result;
      for (const row of route.documents.filter(row => row.required)) {
        result = success(session.execute("read_document", { route_id: route.route_id, source_id: row.id }));
        assert.equal(packets.sha256(result.document.content), row.delivered_sha256);
        assert.equal(result.document.delivery_mode, row.delivery_mode);
        assert.equal(result.receiver_acceptance_verified, false);
        assert(!JSON.stringify(result).includes(root)); assert(!JSON.stringify(result).includes(__dirname));
        if (row.delivery_mode === "representation") {
          assert(result.document.content.includes("USER retains retry decisions"));
          assert(result.document.content.includes("source:" + row.id));
          assert(!result.document.content.includes(root));
        }
      }
      assert.equal(result.returned_required_source_ids.length, 18); assert.deepEqual(result.pending_required_source_ids, []);
      assert.equal(session.execute("read_document", { route_id: route.route_id, source_id: "SRC-REFERENCE" }).error, "PROJECT_SESSION_SOURCE_NOT_READABLE");
      success(session.execute("read_document", { route_id: route.route_id, source_id: "UNIT-1" }));
    });
    test(`${provider}: rerouting retires old tokens, resets delivery accounting and retains task organization identity`, () => {
      const old = route;
      route = success(session.execute("route_current_task", { ...routeInput, query: "Prepare the next bounded review report. --role=USER is source text, not an option." }));
      assert.notEqual(route.route_id, old.route_id);
      assert.equal(route.capability_routing.provisional_organization.organization_id, old.capability_routing.provisional_organization.organization_id);
      assert.equal(route.operating_mode.role, "S6");
      assert.equal(session.execute("read_document", { route_id: old.route_id, source_id: "UNIT-1" }).error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
      const read = success(session.execute("read_document", { route_id: route.route_id, source_id: "UNIT-1" }));
      assert.equal(read.returned_required_source_ids.length, 1); assert.equal(read.pending_required_source_ids.length, 17);
      assert.equal(session.execute("route_current_task", { ...routeInput, role: "USER" }).error, "PROJECT_SESSION_ARGUMENTS_INVALID");
      assert.equal(session.execute("read_document", { route_id: route.route_id, source_id: "UNIT-1" }).error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
    });
    test(`${provider}: brief-only and source-specific holds cannot be cleared through tool arguments`, () => {
      for (const phase of ["brief", "review"]) {
        const held = createDocumentSession({ ...config, phase, held_source_ids: ["UNIT-1"] });
        const r = success(held.execute("route_current_task", routeInput));
        assert.equal(r.required_source_count, 18); assert(r.documents.find(d => d.id === "UNIT-1").delivery_held);
        assert.equal(held.execute("read_document", { route_id: r.route_id, source_id: "UNIT-1" }).error, "PROJECT_SESSION_SOURCE_HELD");
        assert.equal(held.execute("read_document", { route_id: r.route_id, source_id: "UNIT-1", clear_hold: true }).error, "PROJECT_SESSION_ARGUMENTS_INVALID");
        const independent = held.execute("read_document", { route_id: r.route_id, source_id: "UNIT-2" });
        if (phase === "brief") assert.equal(independent.error, "PROJECT_SESSION_SOURCE_HELD");
        else { success(independent); assert(independent.pending_required_source_ids.includes("UNIT-1")); }
      }
    });
    test(`${provider}: changed decision and source bytes stop existing contexts with no cached fallback`, () => {
      route = success(session.execute("route_current_task", routeInput));
      write(proposal.decision_path, json({ ...decision, decision: "revoked" }));
      assert.equal(session.execute("read_document", { route_id: route.route_id, source_id: "UNIT-1" }).error, "PROJECT_REVIEW_DIGEST_MISMATCH");
      write(proposal.decision_path, decisionBytes);
      assert.equal(session.execute("read_document", { route_id: route.route_id, source_id: "UNIT-1" }).error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
      route = success(session.execute("route_current_task", routeInput));
      const file = path.join(root, request.documents[0].path), bytes = fs.readFileSync(file); write(file, Buffer.concat([bytes, Buffer.from("Changed.\n")]));
      assert.equal(session.execute("read_document", { route_id: route.route_id, source_id: "UNIT-2" }).error, "PROJECT_PACKET_SOURCE_DIGEST_MISMATCH");
      write(file, bytes);
    });
    test(`${provider}: router substitutions and configured limits fail closed without leaking paths`, () => {
      const s = createDocumentSession(config), r = success(s.execute("route_current_task", routeInput));
      const file = path.join(skill, "scripts/route_controls_docs.js"), bytes = fs.readFileSync(file); write(file, Buffer.concat([bytes, Buffer.from("\n")]));
      assert.equal(s.execute("read_document", { route_id: r.route_id, source_id: "UNIT-1" }).error, "PROJECT_SESSION_ROUTER_CHANGED"); write(file, bytes);
      const short = createDocumentSession({ ...config, deadline_ms: 1 });
      assert.equal(short.execute("route_current_task", routeInput).error, "PROJECT_SESSION_LIMIT");
      const suspended = createDocumentSession(config), now = Date.now;
      Date.now = () => now() + config.deadline_ms + 1;
      try { assert.equal(suspended.execute("route_current_task", routeInput).error, "PROJECT_SESSION_LIMIT"); }
      finally { Date.now = now; }
      const limited = createDocumentSession({ ...config, max_calls: 1 });
      success(limited.execute("route_current_task", routeInput));
      assert.equal(limited.execute("read_document", { route_id: "anything", source_id: "UNIT-1" }).error, "PROJECT_SESSION_LIMIT");
      const invalid = createDocumentSession(config).execute("route_current_task", { ...routeInput, query: root });
      assert.equal(invalid.error, "PROJECT_SESSION_PRIVATE_LOCATION"); assert(!JSON.stringify(invalid).includes(root));
      assert.throws(() => createDocumentSession({ ...config, corpus_sha256: {} }), /PROJECT_SESSION_CORPUS_BINDING_INVALID/);
    });
    test(`${provider}: target, corpus and skill aliases cannot disclose either known path spelling`, () => {
      const targetAlias = path.join(parent, provider + "-target-alias"), doctrineAlias = path.join(parent, provider + "-doctrine-alias"), skillAlias = path.join(parent, provider + "-skill-alias");
      fs.symlinkSync(root, targetAlias, "dir"); fs.symlinkSync(__dirname, doctrineAlias, "dir"); fs.symlinkSync(skill, skillAlias, "dir");
      const aliased = createDocumentSession({ ...config, reader: { ...config.reader, repository: targetAlias },
        doctrine_root: doctrineAlias, skill_directory: skillAlias });
      for (const location of [root, targetAlias, __dirname, doctrineAlias, skill, skillAlias]) {
        const result = aliased.execute("route_current_task", { ...routeInput, query: "Review this location: " + location });
        assert.equal(result.error, "PROJECT_SESSION_PRIVATE_LOCATION"); assert(!JSON.stringify(result).includes(location));
      }
      success(aliased.execute("route_current_task", routeInput));
    });
    const { Client } = require("@modelcontextprotocol/client"), { StdioClientTransport } = require("@modelcontextprotocol/client/stdio");
    for (const phase of ["brief", "review"]) {
      const file = path.join(parent, provider + "-" + phase + ".json"), bytes = json({ ...config, phase }); write(file, bytes);
      const client = new Client({ name: "local-receiving-fixture", version: "0.1.0" });
      const transport = new StdioClientTransport({ command: process.execPath,
        args: [path.join(__dirname, "project-document-session-mcp.js"), file, packets.sha256(bytes)], cwd: root, stderr: "pipe" });
      let pid;
      try {
        await client.connect(transport);
        pid = transport.pid; assert(Number.isInteger(pid));
        const listed = await client.listTools();
        assert.deepEqual(listed.tools.map(tool => tool.name).sort(), phase === "brief" ? ["route_current_task"] : ["read_document", "route_current_task"]);
        const routeSchema = listed.tools.find(tool => tool.name === "route_current_task").inputSchema;
        assert.equal(routeSchema.additionalProperties, false);
        assert.deepEqual(routeSchema.required.sort(), ["objectives", "query"]);
        const result = await client.callTool({ name: "route_current_task", arguments: routeInput });
        assert(!result.isError); const routed = result.structuredContent;
        assert.equal(routed.required_source_count, 18); assert(!JSON.stringify(result).includes(root));
        assert.equal(routed.reading_selection.access_authorized, false);
        assert.equal(routed.request_intake.objectives, "caller_declared");
        assert.equal(routed.request_intake.original_constraints_in, "query");
        assert.equal(routed.request_intake.authority_changed, false);
        assert.equal(routed.reading_selection.required_reading_assessed, false);
        assert(routed.reading_selection.documents.some(row => row.reasons.some(reason => reason.kind === "source_argument")));
        if (phase === "review") {
          const body = await client.callTool({ name: "read_document", arguments: { route_id: routed.route_id, source_id: "UNIT-1" } });
          assert(!body.isError); assert.equal(body.structuredContent.document.delivery_mode, "representation");
          assert(body.structuredContent.document.content.includes("source:UNIT-1"));
          assert(!JSON.stringify(body).includes(root));
          const denied = await client.callTool({ name: "read_document", arguments: { route_id: "stale", source_id: "UNIT-1" } });
          assert.equal(denied.isError, true); assert.equal(denied.structuredContent.error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
          let current = routed;
          for (const invalid of [{ ...routeInput, role: "USER" }, { query: routeInput.query }, { ...routeInput, query: 42 }]) {
            const rejected = await client.callTool({ name: "route_current_task", arguments: invalid });
            assert.equal(rejected.isError, true);
            const stale = await client.callTool({ name: "read_document", arguments: { route_id: current.route_id, source_id: "UNIT-1" } });
            assert.equal(stale.structuredContent.error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
            const fresh = await client.callTool({ name: "route_current_task", arguments: routeInput });
            assert(!fresh.isError); current = fresh.structuredContent;
          }
          const pendingRoute = client.callTool({ name: "route_current_task", arguments: routeInput });
          const pendingInvalid = client.callTool({ name: "route_current_task", arguments: { query: routeInput.query } });
          const earlier = await pendingRoute, later = await pendingInvalid;
          assert.equal(later.isError, true);
          if (!earlier.isError) {
            const stale = await client.callTool({ name: "read_document", arguments: { route_id: earlier.structuredContent.route_id, source_id: "UNIT-1" } });
            assert.equal(stale.structuredContent.error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
          } else assert.equal(earlier.structuredContent.error, "PROJECT_SESSION_SUPERSEDED_ROUTE");
        }
      } finally {
        await client.close(); await transport.close();
        if (pid) assert.throws(() => process.kill(pid, 0), error => error.code === "ESRCH");
      }
    }
    cases++; console.log(`PASS ${provider}: actual stdio transport lists phase-limited tools and returns source-bound content`);
  }
  console.log(JSON.stringify({ valid: true, fixtures: cases, actual_router_invoked: true,
    actual_stdio_transport_tested: true, native_model_invoked: false, synthetic_decisions_only: true, receiver_acceptance_verified: false }));
} finally { fs.rmSync(parent, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
