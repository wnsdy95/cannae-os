#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict"), { execFileSync } = require("node:child_process");
const packets = require("./project-document-packet");
const { createDocumentSession } = require("./project-document-session");
const { Client } = require("@modelcontextprotocol/client"), { StdioClientTransport } = require("@modelcontextprotocol/client/stdio");
const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-session-reading-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
const guides = ["docs/document-authoring-workflow.md", "docs/knowledge-management-sop.md", "docs/handoff-packet-template.md"];
const execution = ["docs/enforced-dispatch-and-resume.md", "docs/protected-tool-gateway-contract.md",
  "docs/protected-process-execution.md", "docs/oci-linux-sandbox-provider.md", "docs/production-sandbox-admission.md"];
const json = value => JSON.stringify(value, null, 2) + "\n";
let cases = 0;
function success(result) {
  assert(!result.error, result.error);
  for (const key of ["authorization_verified", "execution_authorized", "release_authorized", "receiver_acceptance_verified"]) assert.equal(result[key], false);
  return result;
}
async function main() {
  try {
    for (const provider of ["codex", "claude_code"]) for (const role of ["S3", "S4"]) {
      const specialist = role === "S3" ? execution : ["docs/data-model.sql.md"];
      const assigned = specialist[role === "S3" ? 2 : 0];
      const technical = role === "S3" ? "Review the protected process contract and prepare a handoff." : "Review database storage policy and prepare a handoff.";
      for (const variant of ["plain", "required", "optional", "parent", "current", "domain", "ambiguous", "department"]) {
        const id = provider + "-" + role + "-" + variant, root = path.join(parent, id);
        fs.mkdirSync(root); fs.writeFileSync(path.join(root, ".gitignore"), ".cannae/\n");
        const content = "# Supplied policy\nDraft a review only. USER retains publication decisions.\n";
        fs.writeFileSync(path.join(root, "policy.md"), content);
        const git = args => execFileSync("git", ["-C", root, ...args], { env });
        git(["init", "-q"]); git(["add", "."]);
        git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"]);
        const request = structuredClone(require("./sample-payloads/valid-project-document-packet-request.json"));
        request.id = "PDR-" + id;
        request.task = variant === "parent" ? technical : variant === "ambiguous" ? "Inspect the supplied material." : "Review the supplied handoff against its original requirements. Do not publish.";
        request.recipient = { agent_id: "reader", provider, role, department: variant === "department" ? "systems" : role === "S3" ? "operations" : "logistics", duty: "document_review", authority_level: "L1" };
        Object.assign(request.documents[0], { path: "policy.md", allowed_roles: [role], allowed_departments: [request.recipient.department], duties: ["document_review"], source_sha256: packets.sha256(content) });
        const prepared = packets.prepare(request, root);
        const required = [...guides, ...(variant === "required" ? [assigned] : [])];
        const optional = variant === "optional" ? [assigned] : [], all = [...required, ...optional];
        const access = { schema_version: "0.1", type: "DocumentAccessManifest", id: "DAM-" + id, mission_id: "SYNTHETIC-" + id, default_decision: "deny",
          role_profiles: [{ role, duty: "document_review", authority_level: "L1", required_documents: required, optional_documents: optional, denied_documents: [], escalation_role: "COS" }],
          documents: all.map(file => ({ path: file, title: file, classification: "internal", owner_role: role, allowed_roles: [role], duties: ["document_review"], minimum_authority_level: "L1", delivery_mode: "raw", rationale: "Synthetic receiving profile for relevance and access separation." })),
          controls: { need_to_know: true, no_bulk_read: true, audit_required: true, exception_requires_approval: true, source_of_truth: "docs/role-document-access-policy.md" }, classification: "internal", status: "pending", created_at: new Date().toISOString() };
        const config = { reader: { repository: root, packet_path: prepared.packet_path, packet_sha256: prepared.packet_sha256, recipient: request.recipient },
          skill_directory: path.join(__dirname, provider === "codex" ? "codex-skills/controls-doctrine-operator" : ".claude/skills/controls-doctrine-operator"),
          doctrine_root: __dirname, task_id: "READING-" + id, phase: "review", access_manifest: access,
          corpus_sha256: Object.fromEntries(all.map(file => [file, packets.sha256(fs.readFileSync(path.join(__dirname, file)))])), held_source_ids: [], max_calls: 24, max_route_calls: 4, deadline_ms: 600000 };
        const input = { query: variant === "current" ? technical : "Review the proposed report against the original sources.",
          objectives: [variant === "domain" ? "Analyze museum attendance." : "Review a source-grounded handoff document."] };
        const session = createDocumentSession(config), route = success(session.execute("route_current_task", input));
        assert.equal(route.original_task, request.task);
        assert.equal(route.query, request.task + "\n\nCurrent routing description (not a replacement assignment):\n" + input.query);
        assert.equal(route.operating_mode.authority, "document-only-verification");
        assert.deepEqual(route.recipient, request.recipient);
        assert.deepEqual(route.documents.filter(row => row.required).map(row => row.id), [...required.map(file => "corpus:" + file), "SRC-POLICY"]);
        assert.equal(route.required_source_count, required.length + 1);
        const omit = ["plain", "optional"].includes(variant);
        for (const file of specialist) assert.equal(route.recommended_documents.some(row => row.path === file), !omit, id + ":" + file);
        for (const file of required) {
          assert(route.recommended_documents.some(row => row.path === file), id + ":" + file);
          assert(route.reading_selection.documents.find(row => row.path === file).reasons.some(reason => reason.kind === "source_argument"));
        }
        const extra = "corpus:docs/agent-roles-and-authority.md";
        assert(route.recommended_documents.some(row => "corpus:" + row.path === extra));
        assert.equal(session.execute("read_document", { route_id: route.route_id, source_id: extra }).error, "PROJECT_SESSION_SOURCE_NOT_READABLE");
        if (variant === "optional") {
          assert.equal(route.documents.find(row => row.id === "corpus:" + assigned).required, false);
          const read = success(session.execute("read_document", { route_id: route.route_id, source_id: "corpus:" + assigned }));
          assert.deepEqual(read.returned_required_source_ids, []);
          assert.equal(read.pending_required_source_ids.length, route.required_source_count);
        }
        if (variant === "domain") {
          assert.equal(route.capability_routing.status, "gap_detected");
          assert.equal(route.capability_routing.provisional_organization.authority_expansion_authorized, false);
        }
        if (variant === "plain") {
          let read;
          for (const row of route.documents.filter(row => row.required)) {
            read = success(session.execute("read_document", { route_id: route.route_id, source_id: row.id }));
            assert.equal(packets.sha256(read.document.content), row.delivered_sha256);
          }
          assert.deepEqual(read.pending_required_source_ids, []);
          const fresh = success(session.execute("route_current_task", input));
          assert.notEqual(fresh.route_id, route.route_id);
          assert.equal(session.execute("read_document", { route_id: route.route_id, source_id: "SRC-POLICY" }).error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
          assert.equal(session.execute("route_current_task", { ...input, authority: "scoped-execution" }).error, "PROJECT_SESSION_ARGUMENTS_INVALID");
          assert.equal(session.execute("read_document", { route_id: fresh.route_id, source_id: "SRC-POLICY" }).error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
          for (const phase of ["brief", "review"]) {
            const held = createDocumentSession({ ...config, phase, held_source_ids: ["SRC-POLICY"] });
            const holdRoute = success(held.execute("route_current_task", input));
            assert.equal(holdRoute.required_source_count, route.required_source_count);
            assert.equal(held.execute("read_document", { route_id: holdRoute.route_id, source_id: "SRC-POLICY" }).error, "PROJECT_SESSION_SOURCE_HELD");
            const guide = held.execute("read_document", { route_id: holdRoute.route_id, source_id: "corpus:" + guides[0] });
            if (phase === "brief") assert.equal(guide.error, "PROJECT_SESSION_SOURCE_HELD");
            else success(guide);
          }
          const file = path.join(parent, id + ".json"), bytes = json(config); fs.writeFileSync(file, bytes);
          const client = new Client({ name: "session-reading-fixture", version: "0.1.0" });
          const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, "project-document-session-mcp.js"), file, packets.sha256(bytes)], cwd: root, stderr: "pipe" });
          let pid;
          try {
            await client.connect(transport); pid = transport.pid;
            const result = await client.callTool({ name: "route_current_task", arguments: input });
            assert(!result.isError); const routed = success(result.structuredContent);
            const { route_id: ignored, ...direct } = route, { route_id: ignoredAgain, ...mediated } = routed;
            assert.deepEqual(mediated, direct);
            const resultRead = await client.callTool({ name: "read_document", arguments: { route_id: routed.route_id, source_id: "SRC-POLICY" } });
            assert(!resultRead.isError); assert.equal(success(resultRead.structuredContent).document.content, content);
          } finally {
            await client.close(); await transport.close();
            if (pid) assert.throws(() => process.kill(pid, 0), error => error.code === "ESRCH");
          }
        }
        cases++; console.log(`PASS ${id}: task relevance preserves fixed authority, assigned reads and holds`);
      }
    }
    console.log(JSON.stringify({ valid: true, fixtures: cases, actual_router_invoked: true, actual_stdio_transport_tested: true,
      native_model_invoked: false, receiver_acceptance_verified: false }));
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
