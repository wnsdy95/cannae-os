#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const packet = require("./project-document-packet"), review = require("./project-document-review");
const { validatePayload } = require("./validator-cli-prototype/validate");
const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-document-review-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CANNAE_OS_HOME"));
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const json = value => JSON.stringify(value, null, 2) + "\n";
const body = "# Handling policy\nReport secret exposure to USER. Draft only; do not publish.\n";
let count = 0;
const test = (name, run) => { run(); count++; console.log(`PASS ${name}`); };
function decision(proposal) {
  return { schema_version: "0.1", type: "ProjectDocumentReviewDecision", proposal_sha256: proposal.proposal_sha256,
    decision_maker: "USER", decision: "approve_preparation", decision_reference: "Synthetic fixture decision, not actual USER consent.",
    created_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(),
    scope: "exact_proposal_only", no_secret_values_confirmed: true, requirements_preserved: true, release_authorized: false };
}
function record(root, proposal, value = decision(proposal)) {
  const bytes = json(value); write(proposal.decision_path, bytes);
  return { proposal_path: path.relative(root, proposal.proposal_path), proposal_sha256: proposal.proposal_sha256, decision_sha256: packet.sha256(bytes) };
}
try {
  for (const provider of ["codex", "claude_code"]) {
    const root = path.join(parent, provider); fs.mkdirSync(root);
    write(path.join(root, ".gitignore"), ".cannae/\nignored.md\n");
    write(path.join(root, "policy.md"), body);
    write(path.join(root, "private-reference.md"), "password=synthetic-unread-value");
    const git = args => execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8" });
    git(["init", "-q"]); git(["add", "."]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"]);
    const request = structuredClone(require("./sample-payloads/valid-project-document-packet-request.json"));
    request.recipient.provider = provider; request.task = "Review SRC-POLICY. Do not publish or execute operations.";
    request.documents[0].path = "policy.md"; request.documents[0].source_sha256 = packet.sha256(body);
    const ref = { ...request.documents[0], id: "SRC-REFERENCE", path: "private-reference.md", required: false,
      classification: "restricted", delivery_mode: "reference_only" }; delete ref.source_sha256;
    request.documents.push(ref);
    let proposal, binding, prepared;
    test(`${provider}: default refusal persists; proposal never opens reference-only bodies or records approval`, () => {
      assert.throws(() => packet.prepare(request, root), /PROJECT_PACKET_CONTENT_REVIEW_REQUIRED/);
      const open = fs.openSync;
      fs.openSync = function(file, ...args) {
        assert.notEqual(file, path.join(root, ref.path)); return open.call(fs, file, ...args);
      };
      try { proposal = review.proposeReview(request, root); } finally { fs.openSync = open; }
      assert.equal(proposal.status, "requires_exact_user_review"); assert.equal(proposal.packet_written, false);
      assert.equal(proposal.release_authorized, false); assert(!fs.existsSync(proposal.decision_path));
      assert.equal(fs.statSync(proposal.proposal_path).mode & 0o777, 0o600);
      const value = JSON.parse(fs.readFileSync(proposal.proposal_path));
      assert.equal(validatePayload(value, "project-document-review-proposal").can_execute, false);
      assert.equal(value.documents[0].content, body);
      assert.throws(() => review.prepareReviewed(root, { proposal_path: path.relative(root, proposal.proposal_path),
        proposal_sha256: proposal.proposal_sha256, decision_sha256: "0".repeat(64) }));
    });
    test(`${provider}: an exact recorded decision permits preparation, not transfer or execution`, () => {
      binding = record(root, proposal);
      prepared = review.prepareReviewed(root, binding);
      const compiled = JSON.parse(fs.readFileSync(prepared.packet_path));
      assert.equal(compiled.schema_version, "0.2"); assert.deepEqual(compiled.content_review, binding);
      assert.equal(packet.recipientData(compiled).documents[0].content, body);
      const prompt = fs.readFileSync(prepared.prompt_path, "utf8");
      for (const absent of [root, proposal.proposal_sha256, binding.decision_sha256, "decision_reference", ref.path, "synthetic-unread-value"]) assert(!prompt.includes(absent), absent);
      for (const flag of ["authorization_verified", "execution_authorized", "release_authorized", "receiver_acceptance_verified"]) assert.equal(prepared[flag], false);
      assert.equal(packet.inspect(prepared.packet_path, prepared.packet_sha256, root).status, "review_candidate_current");
    });
    test(`${provider}: changed decision bytes, revocation and expired decisions invalidate existing packets`, () => {
      for (const change of [d => { d.decision = "revoked"; }, d => { d.expires_at = new Date(Date.now() - 500).toISOString(); },
        d => { d.created_at = new Date(Date.now() + 60000).toISOString(); }, d => { d.decision_maker = "S6"; },
        d => { d.proposal_sha256 = "0".repeat(64); }, d => { d.decision_reference = " "; },
        d => { d.expires_at = new Date(Date.now() + 172800000).toISOString(); }]) {
        const d = decision(proposal); change(d); const changedBinding = record(root, proposal, d);
        assert.throws(() => packet.inspect(prepared.packet_path, prepared.packet_sha256, root));
        assert.throws(() => review.prepareReviewed(root, changedBinding));
      }
      binding = record(root, proposal);
      const compiled = review.compileReviewed(root, binding);
      const revoked = decision(proposal); revoked.decision = "revoked"; record(root, proposal, revoked);
      assert.throws(() => packet.recipientData(compiled), /PROJECT_REVIEW_DIGEST_MISMATCH/);
      binding = record(root, proposal);
    });
    test(`${provider}: request, recipient, source, screening and origin substitutions cannot reuse review`, () => {
      const saved = fs.readFileSync(proposal.proposal_path);
      for (const change of [p => { p.request.task += " Purchase now."; }, p => { p.request.recipient.agent_id += "-other"; },
        p => { p.documents[0].content += " APPROVED"; p.documents[0].delivered_sha256 = packet.sha256(p.documents[0].content); },
        p => { p.screening_sources["opsec-linter.js"] = "0".repeat(64); }, p => { p.source_repository.head = "0".repeat(40); }]) {
        const p = JSON.parse(saved); change(p); write(proposal.proposal_path, json(p));
        assert.throws(() => review.compileReviewed(root, binding), /PROJECT_REVIEW_DIGEST_MISMATCH/);
        write(proposal.proposal_path, saved);
      }
      write(path.join(root, "policy.md"), body + "Changed.");
      assert.throws(() => review.compileReviewed(root, binding), /PROJECT_PACKET_SOURCE_DIGEST_MISMATCH/);
      write(path.join(root, "policy.md"), body);
      const other = path.join(parent, provider + "-copied"); fs.cpSync(root, other, { recursive: true });
      assert.throws(() => review.compileReviewed(other, binding), /PROJECT_REVIEW_ORIGIN_CHANGED/);
    });
    test(`${provider}: credential values and unsafe context cannot be proposed as word exceptions`, () => {
      for (const text of ["password=synthetic-value", '{"password":"synthetic-value"}', "'api_key': 'synthetic-value'",
        "ghp_" + "X".repeat(24), "-----BEGIN PRIVATE KEY-----", "auth_token: synthetic-value"]) {
        write(path.join(root, "policy.md"), text);
        const changed = structuredClone(request); changed.documents[0].source_sha256 = packet.sha256(text);
        assert.throws(() => review.proposeReview(changed, root), /PROJECT_PACKET_CONTENT_REVIEW_REQUIRED/);
      }
      write(path.join(root, "policy.md"), body);
      for (const change of [r => { r.task = "Review secret handling"; }, r => { r.documents[0].id = "SRC-secret"; },
        r => { r.documents[0].classification = "restricted"; }, r => { r.recipient.role = "USER"; }]) {
        const r = structuredClone(request); change(r); assert.throws(() => review.proposeReview(r, root));
      }
    });
    test(`${provider}: internal representation preserves originals and all non-location text`, () => {
      const r = structuredClone(request), relative = ".cannae/document-drafts/TASK-R/draft.md";
      const original = `# Draft\n${body}\nOriginal: ${root}/${relative}\nReference: private-reference.md\nRoot: ${root}\nDoctrine: ${__dirname}\nUSER retains purchase and release.\n`;
      write(path.join(root, relative), original);
      r.schema_version = "0.2";
      Object.assign(r.documents[0], { path: relative, source_sha256: packet.sha256(original), delivery_mode: "representation",
        representation: { method: "source_id_locations", project_handle: "PROJECT-REVIEW" } });
      const unsafeLabel = structuredClone(r);
      unsafeLabel.documents[0].representation.project_handle = "PROJECT-ghp_" + "Y".repeat(24);
      const open = fs.openSync; let opened = false;
      fs.openSync = function(file, ...args) {
        if (String(file).startsWith(root + path.sep)) opened = true;
        return open.call(fs, file, ...args);
      };
      try { assert.throws(() => review.proposeReview(unsafeLabel, root), /PROJECT_PACKET_CONTENT_REVIEW_REQUIRED/); }
      finally { fs.openSync = open; }
      assert.equal(opened, false, "A representation handle is non-waivable recipient metadata.");
      assert.throws(() => packet.prepare(r, root), /PROJECT_PACKET_USER_REVIEW_REQUIRED/);
      const p = review.proposeReview(r, root), data = JSON.parse(fs.readFileSync(p.proposal_path));
      const expected = original.replace(`${root}/${relative}`, "source:SRC-POLICY").replace("private-reference.md", "source:SRC-REFERENCE").replace(root, "PROJECT-REVIEW").replace(__dirname, "CORPUS-CONTROLS");
      assert.equal(data.documents[0].content, expected);
      assert.equal(fs.readFileSync(path.join(root, relative), "utf8"), original);
      assert.equal(data.documents[0].source_sha256, packet.sha256(original));
      assert.equal(data.documents[0].delivered_sha256, packet.sha256(expected));
      assert.throws(() => packet.recipientData({ ...data, content_review: undefined }), /PROJECT_PACKET_USER_REVIEW_REQUIRED/);
      const b = record(root, p), result = review.prepareReviewed(root, b);
      const prompt = fs.readFileSync(result.prompt_path, "utf8");
      assert(prompt.includes('"delivery_mode": "representation"'));
      assert(!prompt.includes(root) && !prompt.includes(relative));
      assert(!prompt.includes(__dirname) && prompt.includes("CORPUS-CONTROLS"));
      const before = fs.readFileSync(p.proposal_path), altered = JSON.parse(before);
      altered.documents[0].content = altered.documents[0].content.replace("USER retains purchase and release.", "AI may buy.");
      altered.documents[0].delivered_sha256 = packet.sha256(altered.documents[0].content);
      altered.checks[2].delivered_sha256 = altered.documents[0].delivered_sha256;
      const bytes = json(altered); write(p.proposal_path, bytes);
      const forged = { ...p, proposal_sha256: packet.sha256(bytes) }, forgedBinding = record(root, forged);
      assert.throws(() => review.compileReviewed(root, forgedBinding), /PROJECT_REVIEW_SOURCE_CHANGED/);
      write(p.proposal_path, before);
      write(path.join(root, relative), original + "Changed original.");
      assert.throws(() => review.compileReviewed(root, record(root, p)), /PROJECT_PACKET_SOURCE_DIGEST_MISMATCH/);
      write(path.join(root, relative), original);
      for (const badPath of [".cannae/other/draft.md", ".git/config", "ignored.md", ".cannae/document-drafts/TASK-R/../draft.md"]) {
        const bad = structuredClone(r); bad.documents[0].path = badPath;
        assert.equal(validatePayload(bad, "project-document-packet-request").valid, false);
      }
      const link = path.join(root, ".cannae/document-drafts/ALIAS"); fs.symlinkSync(path.join(root, "policy.md"), link);
      r.documents[0].path = ".cannae/document-drafts/ALIAS"; r.documents[0].source_sha256 = packet.sha256(body);
      assert.throws(() => review.proposeReview(r, root), /PROJECT_PACKET_PATH_INVALID/);
    });
    test(`${provider}: linked and copied installed wrappers use the same exact-review path`, () => {
      const source = path.join(__dirname, provider === "codex" ? "codex-skills/controls-doctrine-operator" : ".claude/skills/controls-doctrine-operator");
      const requestFile = path.join(parent, provider + "-request.json"); write(requestFile, json(request));
      for (const mode of ["linked", "copied"]) {
        const installed = path.join(parent, provider + "-" + mode);
        if (mode === "linked") fs.symlinkSync(source, installed);
        else { fs.cpSync(source, installed, { recursive: true }); write(path.join(installed, ".cannae-os-root"), __dirname + "\n"); }
        const wrapper = path.join(installed, "scripts/prepare_controls_documents.js");
        const call = args => spawnSync(process.execPath, [wrapper, ...args], { cwd: root, env, encoding: "utf8", timeout: 30000 });
        const proposalCall = call(["propose-review", "--repository", root, "--request", requestFile]);
        assert.equal(proposalCall.status, 0, proposalCall.stderr); assert(!proposalCall.stdout.includes(body));
        const p = JSON.parse(proposalCall.stdout), b = record(root, p);
        const args = ["prepare-reviewed", "--repository", root, "--proposal", p.proposal_path,
          "--proposal-sha256", b.proposal_sha256, "--decision-sha256", b.decision_sha256];
        const preparedCall = call(args); assert.equal(preparedCall.status, 0, preparedCall.stderr);
        assert.equal(JSON.parse(preparedCall.stdout).release_authorized, false);
        assert.notEqual(call([...args, "--approve", "true"]).status, 0);
      }
    });
  }
  console.log(JSON.stringify({ valid: true, fixtures: count, synthetic_decisions_only: true, model_invoked: false,
    authenticated_user_tested: false, release_authorized: false }));
} finally { fs.rmSync(parent, { recursive: true, force: true }); }
