#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict"), { execFileSync } = require("node:child_process");
const { locateQuote } = require("./project-document-quote");
const { createDocumentSession } = require("./project-document-session");
const packets = require("./project-document-packet"), reviews = require("./project-document-review");
const { Client } = require("@modelcontextprotocol/client"), { StdioClientTransport } = require("@modelcontextprotocol/client/stdio");
const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-document-quote-")));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const json = value => JSON.stringify(value, null, 2) + "\n";
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
const guide = "docs/skill-first-product-scope.md";
const routeInput = { query: "Review the supplied document using exact source citations. Do not execute or publish.", objectives: ["Review a source-grounded handoff document."] };
let cases = 0;
const test = (name, run) => { run(); cases++; console.log(`PASS ${name}`); };
const success = value => {
  assert(!value.error, value.error);
  for (const flag of ["authorization_verified", "execution_authorized", "release_authorized", "receiver_acceptance_verified"]) assert.equal(value[flag], false);
  return value;
};
const document = (content, delivery_mode = "raw") => ({ id: "SRC", content, delivery_mode,
  source_sha256: packets.sha256(content), delivered_sha256: packets.sha256(content) });
const selection = (doc, quote, extra = {}) => ({ delivered_sha256: doc.delivered_sha256, quote, ...extra });

async function main() {
try {
  test("exact UTF-8 offsets, CRLF and inclusive line context preserve delivered bytes", () => {
    const doc = document("# Title\r\n\uD55C\uAE00 \uD83D\uDE80\r\n| Source | Report |\r\n| policy | A4/A5 |\r\nTail\r\n");
    const result = locateQuote(doc, selection(doc, "| policy | A4/A5 |\r\n", { context_lines: 1 }));
    assert.deepEqual(result.quote_range, { start_byte: Buffer.byteLength("# Title\r\n\uD55C\uAE00 \uD83D\uDE80\r\n| Source | Report |\r\n"),
      end_byte_exclusive: Buffer.byteLength(doc.content.slice(0, doc.content.indexOf("Tail"))), start_line: 4, end_line_inclusive: 4 });
    assert.deepEqual(result.context, { start_line: 3, end_line_inclusive: 5, text: "| Source | Report |\r\n| policy | A4/A5 |\r\nTail\r\n" });
    assert.equal(Buffer.from(doc.content).subarray(result.quote_range.start_byte, result.quote_range.end_byte_exclusive).toString(), result.quote);
    assert.equal(result.location_verified, true); assert.equal(result.semantic_support_assessed, false);
    assert.equal(result.quote_sha256, packets.sha256(result.quote));
  });
  test("multi-line, blank-line and unterminated-line locations remain exact", () => {
    const doc = document("First\n\nThird\nLast");
    assert.deepEqual(locateQuote(doc, selection(doc, "First\n\nThird", { context_lines: 0 })).context,
      { start_line: 1, end_line_inclusive: 3, text: "First\n\nThird\n" });
    assert.deepEqual(locateQuote(doc, selection(doc, "Last", { context_lines: 5 })).context,
      { start_line: 1, end_line_inclusive: 4, text: doc.content });
    assert.equal(locateQuote(document("x"), selection(document("x"), "x")).quote_range.end_byte_exclusive, 1);
  });
  test("ambiguous, overlapping and normalized-looking quotes are never guessed", () => {
    for (const [body, quote, error] of [["aba aba", "aba", "AMBIGUOUS"], ["aaaa", "aaa", "AMBIGUOUS"],
      ["e\u0301", "\u00e9", "NOT_FOUND"], ["A\r\nB", "A\nB", "NOT_FOUND"], ["Alpha", "alpha", "NOT_FOUND"]]) {
      const doc = document(body); assert.throws(() => locateQuote(doc, selection(doc, quote)), new RegExp("PROJECT_QUOTE_" + error));
    }
  });
  test("strict selectors reject empty, oversized, malformed and authority-bearing inputs", () => {
    const doc = document("Body");
    for (const value of [null, [], {}, selection(doc, ""), selection(doc, " \n"), selection(doc, "x".repeat(4097)),
      selection(doc, "\ud800"), selection(doc, "Body", { path: "/private" }), selection(doc, "Body", { role: "USER" }),
      selection(doc, "Body", { context_lines: -1 }), selection(doc, "Body", { context_lines: 6 }),
      selection(doc, "Body", { context_lines: 1.5 }), selection(doc, "Body", { context_lines: null }),
      { ...selection(doc, "Body"), delivered_sha256: "bad" }]) {
      assert.throws(() => locateQuote(doc, value), /PROJECT_QUOTE_ARGUMENTS_INVALID/);
    }
    const long = document("x".repeat(4096)); assert.equal(locateQuote(long, selection(long, long.content)).quote.length, 4096);
  });
  test("delivery digest mismatch, hidden modes and malformed source bytes fail closed", () => {
    const doc = document("Body");
    for (const other of [null, { ...doc, id: "" }, { ...doc, delivery_mode: "reference_only" },
      { ...doc, content: "Other" }, { ...doc, content: "\ud800" }, { ...doc, source_sha256: "bad" }]) {
      assert.throws(() => locateQuote(other, selection(doc, "Body")), /PROJECT_QUOTE_SOURCE_MISMATCH/);
    }
    assert.throws(() => locateQuote(doc, { ...selection(doc, "Body"), delivered_sha256: "0".repeat(64) }), /PROJECT_QUOTE_SOURCE_MISMATCH/);
  });
  test("summary and representation locations bind delivered text, not original locations", () => {
    for (const mode of ["summary", "representation"]) {
      const doc = { ...document("Reviewed source:SRC.\n", mode), source_sha256: packets.sha256("Undelivered original") };
      const found = locateQuote(doc, selection(doc, "source:SRC"));
      assert.equal(found.delivery_mode, mode); assert.equal(found.source_sha256, doc.source_sha256);
      assert.notEqual(found.source_sha256, found.delivered_sha256); assert.equal(found.quote_range.start_byte, 9);
    }
  });
  for (const provider of ["codex", "claude_code"]) {
    const root = path.join(parent, provider), corpus = path.join(parent, provider + "-corpus");
    const skill = path.join(parent, provider + "-skill");
    fs.cpSync(path.join(__dirname, provider === "codex" ? "codex-skills/controls-doctrine-operator" : ".claude/skills/controls-doctrine-operator"), skill, { recursive: true });
    // Corpus availability is separate from the receiver's one-guide access profile.
    fs.cpSync(path.join(__dirname, "docs"), path.join(corpus, "docs"), { recursive: true });
    fs.cpSync(path.join(__dirname, "schema-files"), path.join(corpus, "schema-files"), { recursive: true });
    for (const file of ["README.md", "codex-skills/controls-doctrine-operator/references/document-routing.md",
      ".claude/skills/controls-doctrine-operator/references/document-routing.md"]) {
      write(path.join(corpus, file), fs.readFileSync(path.join(__dirname, file)));
    }
    write(path.join(root, ".gitignore"), ".cannae/\n");
    write(path.join(root, "reference-only.md"), "password=synthetic-unread-value");
    const git = args => execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8" });
    git(["init", "-q"]); git(["add", "."]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"]);
    const request = structuredClone(require("./sample-payloads/valid-project-document-packet-representation-request.json"));
    request.recipient.provider = provider;
    request.task = "Review the supplied draft and assigned scope guide. Do not execute or publish. USER retains decisions.";
    const source = request.documents[0], body = `# Draft\nUSER retains decisions.\nOriginal: ${root}/${source.path}\nRepeated. Repeated.\n`;
    source.source_sha256 = packets.sha256(body); write(path.join(root, source.path), body);
    const ref = { ...source, id: "SRC-REFERENCE", path: "reference-only.md", classification: "restricted", required: false, delivery_mode: "reference_only" };
    delete ref.representation; delete ref.source_sha256; request.documents.push(ref);
    const proposal = reviews.proposeReview(request, root);
    const decision = { schema_version: "0.1", type: "ProjectDocumentReviewDecision", proposal_sha256: proposal.proposal_sha256,
      decision_maker: "USER", decision: "approve_preparation", decision_reference: "Synthetic local fixture only, not real USER consent.",
      created_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(),
      scope: "exact_proposal_only", no_secret_values_confirmed: true, requirements_preserved: true, release_authorized: false };
    const decisionBytes = json(decision); write(proposal.decision_path, decisionBytes);
    const prepared = reviews.prepareReviewed(root, { proposal_path: path.relative(root, proposal.proposal_path), proposal_sha256: proposal.proposal_sha256,
      decision_sha256: packets.sha256(decisionBytes) });
    const access = { schema_version: "0.1", type: "DocumentAccessManifest", id: "DAM-QUOTE", mission_id: "SYNTHETIC-QUOTE", default_decision: "deny",
      role_profiles: [{ role: "S6", duty: "document_review", authority_level: "L1", required_documents: [guide], optional_documents: [], denied_documents: [], escalation_role: "COS" }],
      documents: [{ path: guide, title: "Scope", classification: "internal", owner_role: "S6", allowed_roles: ["S6"], duties: ["document_review"],
        minimum_authority_level: "L1", delivery_mode: "raw", rationale: "Assigned scope guide for local quote checks." }],
      controls: { need_to_know: true, no_bulk_read: true, audit_required: true, exception_requires_approval: true, source_of_truth: "docs/role-document-access-policy.md" },
      classification: "internal", status: "pending", created_at: new Date().toISOString() };
    const config = { reader: { repository: root, packet_path: prepared.packet_path, packet_sha256: prepared.packet_sha256, recipient: request.recipient },
      skill_directory: skill, doctrine_root: corpus, task_id: "QUOTE-TEST", phase: "review", access_manifest: access,
      corpus_sha256: { [guide]: packets.sha256(fs.readFileSync(path.join(corpus, guide))) },
      held_source_ids: [], max_calls: 64, max_route_calls: 8, deadline_ms: 600000, allow_quote_lookup: true };
    const fresh = options => { const session = createDocumentSession({ ...config, ...options });
      return { session, route: success(session.execute("route_current_task", routeInput)) }; };
    const read = ({ session, route }, id = source.id) => success(session.execute("read_document", { route_id: route.route_id, source_id: id }));
    const args = (state, extra = {}) => ({ route_id: state.route.route_id, source_id: source.id,
      delivered_sha256: state.route.documents.find(row => row.id === source.id).delivered_sha256, quote: "USER retains decisions.", ...extra });
    test(`${provider}: default-off configuration is immutable and extra configuration fails`, () => {
      for (const enabled of [undefined, false, true]) {
        const mutable = structuredClone(config); if (enabled === undefined) delete mutable.allow_quote_lookup; else mutable.allow_quote_lookup = enabled;
        const session = createDocumentSession(mutable); mutable.allow_quote_lookup = enabled !== true;
        assert.equal(session.execute("locate_quote", {}).error, enabled === true ? "PROJECT_SESSION_ARGUMENTS_INVALID" : "PROJECT_SESSION_QUOTE_LOOKUP_DISABLED");
      }
      for (const invalid of [{ allow_quote_lookup: "true" }, { arbitrary_option: true }]) assert.throws(() => createDocumentSession({ ...config, ...invalid }), /PROJECT_SESSION_CONFIG_INVALID/);
    });
    test(`${provider}: available recommendations do not expand access and missing references invalidate the route`, () => {
      const state = fresh(), extra = "docs/knowledge-management-sop.md";
      assert(state.route.recommended_documents.some(row => row.path === extra));
      assert.equal(state.route.required_source_count, 2);
      assert(!state.route.documents.some(row => row.id === "corpus:" + extra));
      assert.equal(state.session.execute("read_document", { route_id: state.route.route_id, source_id: "corpus:" + extra }).error,
        "PROJECT_SESSION_SOURCE_NOT_READABLE");
      const file = path.join(corpus, extra), original = fs.readFileSync(file);
      fs.unlinkSync(file);
      try {
        assert.equal(state.session.execute("route_current_task", routeInput).error, "PROJECT_SESSION_ROUTING_FAILED");
        assert.equal(state.session.execute("read_document", { route_id: state.route.route_id, source_id: source.id }).error,
          "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
      } finally { write(file, original); }
      read(fresh());
    });
    test(`${provider}: lookup requires current full read and does not clear remaining required reads`, () => {
      const state = fresh();
      assert.equal(state.session.execute("locate_quote", args(state)).error, "PROJECT_SESSION_FULL_READ_REQUIRED");
      const before = read(state); assert.deepEqual(before.pending_required_source_ids, ["corpus:" + guide]);
      const found = success(state.session.execute("locate_quote", args(state)));
      assert.equal(found.delivery_mode, "representation"); assert.equal(found.semantic_support_assessed, false);
      assert.equal(found.source_sha256, source.source_sha256); assert.notEqual(found.source_sha256, found.delivered_sha256);
      for (const privateValue of [root, corpus, skill, source.path, "reference-only.md"]) assert(!JSON.stringify(found).includes(privateValue));
      assert.deepEqual(read(state).pending_required_source_ids, before.pending_required_source_ids);
      read(state, "corpus:" + guide);
      const g = state.route.documents.find(row => row.id === "corpus:" + guide);
      success(state.session.execute("locate_quote", args(state, { source_id: g.id, delivered_sha256: g.delivered_sha256, quote: "# Skill-First Product Scope" })));
      for (const [quote, error] of [["Absent", "PROJECT_QUOTE_NOT_FOUND"], ["Repeated.", "PROJECT_QUOTE_AMBIGUOUS"]]) {
        assert.equal(state.session.execute("locate_quote", args(state, { quote })).error, error);
        success(state.session.execute("locate_quote", args(state)));
      }
      assert.equal(state.session.execute("locate_quote", args(state, { delivered_sha256: "0".repeat(64) })).error, "PROJECT_QUOTE_SOURCE_MISMATCH");
      success(state.session.execute("locate_quote", args(state)));
      for (const invalid of [{ path: "/private" }, { role: "USER" }, { clear_hold: true }]) assert.equal(state.session.execute("locate_quote", args(state, invalid)).error, "PROJECT_SESSION_ARGUMENTS_INVALID");
      for (const id of [ref.id, "unlisted", "../policy.md"]) assert.equal(state.session.execute("locate_quote", args(state, { source_id: id })).error, "PROJECT_SESSION_SOURCE_NOT_READABLE");
      const old = args(state); state.route = success(state.session.execute("route_current_task", routeInput));
      assert.equal(state.session.execute("locate_quote", old).error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
      assert.equal(state.session.execute("locate_quote", args(state)).error, "PROJECT_SESSION_FULL_READ_REQUIRED");
    });
    test(`${provider}: phase holds, fixed profile, call budget and elapsed deadline constrain lookup`, () => {
      for (const options of [{ phase: "brief" }, { held_source_ids: [source.id] }]) {
        const state = fresh(options); assert.equal(state.session.execute("locate_quote", args(state)).error, "PROJECT_SESSION_SOURCE_HELD");
      }
      const state = fresh({ max_calls: 2 }); read(state);
      assert.equal(state.session.execute("locate_quote", args(state)).error, "PROJECT_SESSION_LIMIT");
      const timed = fresh(); read(timed); const now = Date.now;
      Date.now = () => now() + config.deadline_ms + 1;
      try { assert.equal(timed.session.execute("locate_quote", args(timed)).error, "PROJECT_SESSION_LIMIT"); } finally { Date.now = now; }
      const wrong = structuredClone(config); wrong.access_manifest.role_profiles[0].role = "S3";
      assert.throws(() => createDocumentSession(wrong), /PROJECT_SESSION_ACCESS_INVALID/);
    });
    test(`${provider}: source, decision, corpus, router and packet drift retire lookup contexts`, () => {
      for (const [file, code] of [[path.join(root, source.path), "PROJECT_PACKET_SOURCE_DIGEST_MISMATCH"],
        [proposal.decision_path, "PROJECT_REVIEW_DIGEST_MISMATCH"], [path.join(corpus, guide), "PROJECT_SESSION_CORPUS_CHANGED"],
        [path.join(skill, "scripts/route_controls_docs.js"), "PROJECT_SESSION_ROUTER_CHANGED"], [prepared.packet_path, "PROJECT_PACKET_DIGEST_MISMATCH"]]) {
        const state = fresh(); read(state); const original = fs.readFileSync(file);
        try { write(file, Buffer.concat([original, Buffer.from("\n")])); assert.equal(state.session.execute("locate_quote", args(state)).error, code); }
        finally { write(file, original); }
        assert.equal(state.session.execute("locate_quote", args(state)).error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
      }
    });
    for (const options of [{ phase: "review", allow_quote_lookup: false }, { phase: "brief", allow_quote_lookup: true }, { phase: "review", allow_quote_lookup: true }]) {
      const file = path.join(parent, `${provider}-${options.phase}-${options.allow_quote_lookup}.json`), bytes = json({ ...config, ...options }); write(file, bytes);
      const client = new Client({ name: "local-quote-fixture", version: "0.1.0" });
      const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, "project-document-session-mcp.js"), file, packets.sha256(bytes)], cwd: root, stderr: "pipe" });
      let pid;
      try {
        await client.connect(transport); pid = transport.pid;
        const listed = await client.listTools(), enabled = options.phase === "review" && options.allow_quote_lookup;
        assert.deepEqual(listed.tools.map(row => row.name).sort(), options.phase === "brief" ? ["route_current_task"] : enabled ? ["locate_quote", "read_document", "route_current_task"] : ["read_document", "route_current_task"]);
        if (enabled) {
          assert.equal(listed.tools.find(row => row.name === "locate_quote").inputSchema.additionalProperties, false);
          const routed = await client.callTool({ name: "route_current_task", arguments: routeInput }); assert(!routed.isError);
          const state = { route: routed.structuredContent };
          const call = extra => client.callTool({ name: "locate_quote", arguments: args(state, extra) });
          assert.equal((await call()).structuredContent.error, "PROJECT_SESSION_FULL_READ_REQUIRED");
          assert(!(await client.callTool({ name: "read_document", arguments: { route_id: state.route.route_id, source_id: source.id } })).isError);
          const found = await call(); assert(!found.isError); success(found.structuredContent);
          assert.equal(found.structuredContent.location_verified, true); assert.equal(found.structuredContent.semantic_support_assessed, false);
          assert.equal((await call({ quote: "Absent" })).structuredContent.error, "PROJECT_QUOTE_NOT_FOUND");
          assert.equal((await call({ quote: "Repeated." })).structuredContent.error, "PROJECT_QUOTE_AMBIGUOUS");
          for (const invalid of [{ role: "USER" }, { context_lines: 6 }, { delivered_sha256: "bad" }]) assert.equal((await call(invalid)).isError, true);
          const rejected = await client.callTool({ name: "route_current_task", arguments: { query: routeInput.query } }); assert.equal(rejected.isError, true);
          assert.equal((await call()).structuredContent.error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
        }
      } finally {
        await client.close(); await transport.close();
        if (pid) assert.throws(() => process.kill(pid, 0), error => error.code === "ESRCH");
      }
      cases++; console.log(`PASS ${provider}: actual stdio ${options.phase} quote opt-in ${options.allow_quote_lookup}`);
    }
    test(`${provider}: decision expiry before the session deadline retires the quote context`, () => {
      const expires = Date.now() + 60000, shortDecision = json({ ...decision, expires_at: new Date(expires).toISOString() });
      write(proposal.decision_path, shortDecision);
      const shortPacket = reviews.prepareReviewed(root, { proposal_path: path.relative(root, proposal.proposal_path),
        proposal_sha256: proposal.proposal_sha256, decision_sha256: packets.sha256(shortDecision) });
      const state = fresh({ reader: { ...config.reader, packet_path: shortPacket.packet_path, packet_sha256: shortPacket.packet_sha256 } });
      read(state); const now = Date.now; Date.now = () => expires + 1;
      try { assert.equal(state.session.execute("locate_quote", args(state)).error, "PROJECT_REVIEW_NOT_CURRENT"); } finally { Date.now = now; }
      assert.equal(state.session.execute("locate_quote", args(state)).error, "PROJECT_SESSION_CURRENT_ROUTE_REQUIRED");
    });
  }
  console.log(JSON.stringify({ valid: true, fixtures: cases, actual_router_invoked: true, actual_stdio_transport_tested: true,
    native_model_invoked: false, synthetic_decisions_only: true, semantic_support_assessed: false, receiver_acceptance_verified: false }));
} finally { fs.rmSync(parent, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
