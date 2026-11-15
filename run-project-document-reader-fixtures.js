#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict"), { execFileSync } = require("node:child_process");
const packets = require("./project-document-packet"), reviews = require("./project-document-review");
const { createDocumentReader } = require("./project-document-reader");
const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-document-reader-")));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const json = value => JSON.stringify(value, null, 2) + "\n";
let count = 0;
function test(name, run) { run(); console.log(`PASS ${name}`); count++; }
function approvalsAbsent(value) {
  for (const flag of ["authorization_verified", "execution_authorized", "release_authorized", "receiver_acceptance_verified"]) assert.equal(value[flag], false);
}
try {
  for (const provider of ["codex", "claude_code"]) {
    const root = path.join(parent, provider), raw = "# Policy\nUSER owns decisions. Draft only.\n";
    const summary = "# Reviewed excerpt\nDraft an advisory note only.\n";
    write(path.join(root, ".gitignore"), ".cannae/\n");
    write(path.join(root, "policy.md"), raw);
    write(path.join(root, "private-source.md"), "# Source\nPrivate background retained by its authorized preparer.\n");
    write(path.join(root, "excerpt.md"), summary);
    write(path.join(root, "reference-only.md"), "password=synthetic-unread-value");
    const git = args => execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8" });
    git(["init", "-q"]); git(["add", "."]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"]);
    const request = structuredClone(require("./sample-payloads/valid-project-document-packet-request.json"));
    request.recipient.provider = provider;
    request.task = "Review the supplied documents. Do not publish, execute operations or open reference-only sources.";
    const source = request.documents[0]; source.path = "policy.md"; source.source_sha256 = packets.sha256(raw);
    request.documents.push({ ...source, id: "SRC-SUMMARY", path: "private-source.md", classification: "sensitive",
      delivery_mode: "summary", source_sha256: packets.sha256(fs.readFileSync(path.join(root, "private-source.md"))),
      summary_path: "excerpt.md", summary_sha256: packets.sha256(summary), summary_review_reference: "Synthetic fixture excerpt review." });
    const ref = { ...source, id: "SRC-REFERENCE", path: "reference-only.md", classification: "restricted", required: false, delivery_mode: "reference_only" };
    delete ref.source_sha256; request.documents.push(ref);
    const prepared = packets.prepare(request, root);
    const options = { repository: root, packet_path: prepared.packet_path, packet_sha256: prepared.packet_sha256,
      recipient: structuredClone(request.recipient) };
    let reader;
    test(`${provider}: catalog and exact ID reads preserve raw and summary delivery without private locators`, () => {
      reader = createDocumentReader(options);
      const catalog = reader.catalog(); approvalsAbsent(catalog);
      assert.equal(catalog.task, request.task); assert.deepEqual(catalog.recipient, request.recipient);
      assert.equal(catalog.required_source_count, 2); assert.equal(catalog.documents.length, 3);
      const encoded = JSON.stringify(catalog);
      for (const value of [root, "policy.md", "private-source.md", "excerpt.md", "reference-only.md", "source_metadata", "synthetic-unread-value"]) assert(!encoded.includes(value), value);
      assert(catalog.documents.every(doc => !Object.hasOwn(doc, "content")));
      for (const [id, content, mode] of [[source.id, raw, "raw"], ["SRC-SUMMARY", summary, "summary"]]) {
        const result = reader.read(id); approvalsAbsent(result);
        assert.equal(result.document.content, content); assert.equal(result.document.delivery_mode, mode);
        assert.equal(result.document.delivered_sha256, packets.sha256(content));
      }
      const open = fs.openSync;
      fs.openSync = function(file, ...args) { assert.notEqual(file, path.join(root, ref.path)); return open.call(fs, file, ...args); };
      try {
        assert.throws(() => reader.read(ref.id), /PROJECT_READER_SOURCE_NOT_READABLE/);
        for (const id of ["unlisted", "../policy.md", "private-source.md"]) assert.throws(() => reader.read(id), /PROJECT_READER_SOURCE_NOT_READABLE/);
      } finally { fs.openSync = open; }
    });
    test(`${provider}: caller mutation cannot retarget a reader or turn a summary into original access`, () => {
      const mutable = structuredClone(options), bound = createDocumentReader(mutable);
      mutable.recipient.role = "USER"; mutable.packet_path = path.join(root, "private-source.md");
      const first = bound.catalog(); first.recipient.role = "USER"; first.documents[1].delivery_mode = "raw";
      const read = bound.read("SRC-SUMMARY"); read.document.content = "Modified local copy";
      assert.deepEqual(bound.catalog().recipient, request.recipient);
      assert.equal(bound.read("SRC-SUMMARY").document.delivery_mode, "summary");
      assert.equal(bound.read("SRC-SUMMARY").document.content, summary);
      for (const field of Object.keys(request.recipient)) {
        const wrong = structuredClone(options); wrong.recipient[field] += "-other";
        assert.throws(() => createDocumentReader(wrong), /PROJECT_READER_RECIPIENT_MISMATCH/);
      }
      assert.throws(() => createDocumentReader({ ...options, approve: true }), /PROJECT_READER_BINDING_INVALID/);
      assert.throws(() => reader.read({ source_id: source.id }), /PROJECT_READER_SOURCE_INVALID/);
    });
    test(`${provider}: source, prompt and packet drift hold both catalog and read rather than serving cached text`, () => {
      for (const file of [path.join(root, "policy.md"), path.join(root, "private-source.md"), path.join(root, "excerpt.md"), prepared.prompt_path, prepared.packet_path]) {
        const before = fs.readFileSync(file); write(file, Buffer.concat([before, Buffer.from("Changed.\n")]));
        assert.throws(() => reader.catalog()); assert.throws(() => reader.read(source.id));
        write(file, before);
      }
      const old = path.join(parent, provider + "-moved"); fs.renameSync(root, old);
      try {
        assert.throws(() => reader.read(source.id), error => error.message === "PROJECT_READER_INPUT_UNAVAILABLE" && !error.message.includes(root));
      } finally { fs.renameSync(old, root); }
      assert.equal(reader.read(source.id).document.content, raw);
    });
    const represented = structuredClone(request), relative = ".cannae/document-drafts/TASK-R/handoff.md";
    const original = `# Handoff\nReport secret exposure to USER.\nOriginal: ${root}/${relative}\nUSER retains retry decisions. No retry or publication.\n`;
    write(path.join(root, relative), original);
    represented.schema_version = "0.2";
    Object.assign(represented.documents[0], { path: relative, source_sha256: packets.sha256(original), delivery_mode: "representation",
      representation: { method: "source_id_locations", project_handle: "PROJECT-READER" } });
    const proposal = reviews.proposeReview(represented, root);
    const decision = { schema_version: "0.1", type: "ProjectDocumentReviewDecision", proposal_sha256: proposal.proposal_sha256,
      decision_maker: "USER", decision: "approve_preparation", decision_reference: "Synthetic fixture decision only, not real USER consent.",
      created_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(),
      scope: "exact_proposal_only", no_secret_values_confirmed: true, requirements_preserved: true, release_authorized: false };
    const decisionBytes = json(decision); write(proposal.decision_path, decisionBytes);
    const binding = { proposal_path: path.relative(root, proposal.proposal_path), proposal_sha256: proposal.proposal_sha256,
      decision_sha256: packets.sha256(decisionBytes) };
    const reviewed = reviews.prepareReviewed(root, binding);
    const reviewedOptions = { ...options, packet_path: reviewed.packet_path, packet_sha256: reviewed.packet_sha256 };
    const reviewedReader = createDocumentReader(reviewedOptions);
    test(`${provider}: reviewed representation remains distinct and source-bound without opening private originals to the recipient`, () => {
      const data = reviewedReader.catalog(), result = reviewedReader.read(source.id);
      approvalsAbsent(data); approvalsAbsent(result);
      assert.equal(data.required_source_count, 2);
      assert.equal(data.documents[0].delivery_mode, "representation");
      assert.deepEqual(data.documents[0].representation, represented.documents[0].representation);
      const expected = original.replace(`${root}/${relative}`, `source:${source.id}`);
      assert.equal(result.document.content, expected);
      assert.equal(result.document.source_sha256, packets.sha256(original));
      assert.equal(result.document.delivered_sha256, packets.sha256(expected));
      assert.equal(fs.readFileSync(path.join(root, relative), "utf8"), original);
      for (const privateValue of [root, relative, "content_review", "decision_reference", proposal.proposal_sha256, binding.decision_sha256]) {
        assert(!JSON.stringify(data).includes(privateValue)); assert(!JSON.stringify(result).includes(privateValue));
      }
      assert.throws(() => reviewedReader.read(ref.id), /PROJECT_READER_SOURCE_NOT_READABLE/);
    });
    test(`${provider}: revocation, missing decisions and changed originals invalidate an existing reader`, () => {
      write(proposal.decision_path, json({ ...decision, decision: "revoked" }));
      assert.throws(() => reviewedReader.catalog(), /PROJECT_REVIEW_DIGEST_MISMATCH/);
      assert.throws(() => reviewedReader.read(source.id), /PROJECT_REVIEW_DIGEST_MISMATCH/);
      fs.unlinkSync(proposal.decision_path);
      assert.throws(() => reviewedReader.catalog(), /PROJECT_READER_INPUT_UNAVAILABLE/);
      write(proposal.decision_path, decisionBytes);
      write(path.join(root, relative), original + "Changed original.\n");
      assert.throws(() => reviewedReader.read(source.id), /PROJECT_PACKET_SOURCE_DIGEST_MISMATCH/);
      write(path.join(root, relative), original);
      const now = Date.now; Date.now = () => Date.parse(decision.expires_at) + 1;
      try {
        assert.throws(() => reviewedReader.catalog(), /PROJECT_REVIEW_NOT_CURRENT/);
        assert.throws(() => reviewedReader.read(source.id), /PROJECT_REVIEW_NOT_CURRENT/);
      } finally { Date.now = now; }
    });
  }
  console.log(JSON.stringify({ valid: true, fixtures: count, model_invoked: false,
    real_decisions_recorded: false, synthetic_decisions_only: true, release_authorized: false }));
} finally { fs.rmSync(parent, { recursive: true, force: true }); }
