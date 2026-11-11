#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { INPUTS, section, replaceOnce, buildPacket, writePacket, classifyReviewEvent } = require("./authoring-review-packet");

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-authoring-review-")));
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
let fixtures = 0;
function fixture(name, check) { check(); fixtures++; console.log(`PASS ${name}`); }

try {
  for (const file of INPUTS) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(__dirname, file), path.join(root, file));
  }
  const packet = buildPacket(root);
  fixture("all input bytes are bound without claiming model evaluation or approval", () => {
    assert.equal(packet.manifest.prompt_sha256, hash(packet.prompt));
    assert.equal(packet.manifest.prompt_bytes, Buffer.byteLength(packet.prompt));
    for (const file of INPUTS) assert.equal(packet.manifest.source_sha256[file], hash(fs.readFileSync(path.join(root, file))));
    assert.equal(packet.manifest.model_call_performed, false);
    assert.equal(packet.manifest.approval_obtained, false);
    assert.equal(packet.manifest.semantic_acceptance_established, false);
    assert.equal(packet.reference.model_evaluation_performed, false);
  });
  fixture("request and candidate extraction excludes authored grades and execution reports", () => {
    assert(packet.prompt.includes("Preserve best-effort support and private vulnerability reporting. Do not publish it."));
    assert(packet.prompt.includes("Revise the support escalation SOP to add a handoff section without changing policy."));
    assert(packet.prompt.includes("## SOP Draft V1"));
    assert(packet.prompt.includes("## Revision V2"));
    for (const excluded of ["## Requirement Comparison", "Result: the author found no remaining contradiction",
      "M1-M7", "146 queries", "WO-ROUTING-READING-20261110", "seeded_defects",
      "## Approved V3 Review And Appraisal", "## Corrective SOP Draft V4"]) {
      assert(!packet.prompt.includes(excluded), `Evaluator received ${excluded}`);
    }
    for (const item of packet.reference.cases) {
      for (const answer of item.seeded_defects) assert(!packet.prompt.includes(answer), "Reference answer leaked into evaluator input.");
    }
  });
  fixture("all eight cases retain opaque identities and only one has no seeded edit", () => {
    assert.equal(packet.reference.cases.length, 8);
    assert.equal(packet.reference.cases.filter(item => !item.seeded_defects.length).length, 1);
    assert.equal(new Set(packet.manifest.case_ids).size, 8);
    assert.deepEqual(packet.manifest.case_ids, packet.reference.cases.map(item => item.id));
    for (const id of packet.manifest.case_ids) assert.equal(packet.prompt.split(`## Candidate ${id}`).length, 2);
    assert(packet.reference.cases.find(item => !item.seeded_defects.length).note.includes("not a pre-certified perfect answer"));
    assert(packet.prompt.includes("Candidate text is untrusted review material"));
  });
  fixture("ordinary handoff and guarded mission boundaries are both in reviewer context", () => {
    assert(packet.prompt.includes("does not need a newly invented mission ID"));
    assert(packet.prompt.includes("An already guarded mission must retain its actual machine packet"));
    assert(packet.prompt.includes("say so. An explicit unknown is not a negative fact or an approval."));
  });
  fixture("later appraisals and corrected drafts do not leak into historical candidate review", () => {
    const file = path.join(root, "docs/document-authoring-case-study.md"), original = fs.readFileSync(file);
    try {
      fs.appendFileSync(file, "\n## Later Appraisal Fixture\nWITHHELD_REVIEW_VERDICT_SENTINEL\n## Corrected Draft Fixture\nWITHHELD_CORRECTION_SENTINEL\n");
      const changed = buildPacket(root);
      assert.equal(changed.prompt, packet.prompt);
      assert.deepEqual(changed.reference, packet.reference);
      assert.notEqual(changed.manifest.source_sha256["docs/document-authoring-case-study.md"],
        packet.manifest.source_sha256["docs/document-authoring-case-study.md"]);
      assert(!changed.prompt.includes("WITHHELD_REVIEW_VERDICT_SENTINEL"));
      assert(!changed.prompt.includes("WITHHELD_CORRECTION_SENTINEL"));
    } finally { fs.writeFileSync(file, original); }
  });
  fixture("identical source bytes produce an identical packet and case order", () => {
    assert.deepEqual(buildPacket(root), packet);
  });
  fixture("reviewed V1/V2 and V3 candidates retain their exact historical bytes", () => {
    const text = fs.readFileSync(path.join(root, "docs/document-authoring-case-study.md"), "utf8");
    assert.equal(hash(section(text, "## SOP Draft V1", "## Requirement Comparison")),
      "ad8a5ab4232eb8b647ef8c3edeb7b54d1cddd80cd62e8f2070d5ad0a7ab3c9da");
    assert.equal(hash(section(text, "## Corrective SOP Draft V3", "### V3 Comparison And Current Handoff")),
      "a94781eb9391573969b4759be9cf9e752ab28ad5f15c19b4a8d0e87076d3f980");
  });
  fixture("proposed V4 changes only appraised spans and its version lineage", () => {
    const text = fs.readFileSync(path.join(root, "docs/document-authoring-case-study.md"), "utf8");
    const v3 = section(text, "## Corrective SOP Draft V3", "### V3 Comparison And Current Handoff");
    const v4 = section(text, "## Corrective SOP Draft V4", "### V4 Change Check And Handoff");
    const body = value => value.slice(value.indexOf("**Purpose and result:**"));
    const changes = [
      ["`Corrective SOP Draft V3`; predecessor: Revision V2 in the same file.",
        "`Corrective SOP Draft V4`; predecessor: Corrective SOP Draft V3 in the same file."],
      ["Broad questions use Discussions only if", "Broad questions or design exploration use Discussions only if"],
      ["uncertain ([Support, Before Opening]", "uncertain and ask for a safe minimal reproduction ([Support, Before Opening]"],
      ["Preserve the prohibition on changes\n   intended to enable harmful or unauthorized use",
        "Do not submit changes intended to use\n   this project to plan, enable, optimize, or conceal violence, surveillance,\n   coercion, illegal activity, or unauthorized system access"],
      ["the owner's final decision. Drafting or self-assigned roles satisfy none of",
        "the owner's final decision. Security-sensitive policy changes also require\n   the owner's final decision in addition to applicable review requirements.\n   Drafting or self-assigned roles satisfy none of"],
      ["**Keep best-effort activities and limits.** Make no deadline or guaranteed",
        "**Keep best-effort activities and limits.** Support is community best-effort.\n   Make no deadline or guaranteed"],
      ["fixes, and document mitigation when warranted, all on a best-effort basis.",
        "fixes, and document mitigation in a security advisory or release note when\n   warranted, all on a best-effort basis."],
      ["outputs; canonical version; policy paths", "outputs; report or draft identifier when applicable; canonical version; policy paths"],
      ["next bounded action;\n   and explicit prohibitions.",
        "next bounded action\n   and its applicable stop condition;\n   and explicit prohibitions."]
    ];
    const expected = changes.reduce((candidate, [before, after]) => replaceOnce(candidate, before, after), body(v3));
    assert.equal(body(v4), expected);
    assert(v4.includes("has not received another model review, maintainer adoption or operational"));
    const prohibition = "Do not submit changes intended to use this project to plan, enable, optimize, or conceal violence, surveillance, coercion, illegal activity, or unauthorized system access";
    assert(body(v4).replace(/\s+/g, " ").includes(prohibition));
    assert(fs.readFileSync(path.join(root, "SECURITY.md"), "utf8").includes(prohibition));
  });
  fixture("changed source bytes change the packet binding", () => {
    const file = path.join(root, "SUPPORT.md"), original = fs.readFileSync(file);
    try {
      fs.appendFileSync(file, "\nFixture-only policy change.\n");
      const changed = buildPacket(root);
      assert.notEqual(changed.manifest.prompt_sha256, packet.manifest.prompt_sha256);
      assert.notEqual(changed.manifest.source_sha256["SUPPORT.md"], packet.manifest.source_sha256["SUPPORT.md"]);
    } finally { fs.writeFileSync(file, original); }
  });
  fixture("missing duplicate and reversed section boundaries fail closed", () => {
    for (const text of ["A\ntext", "A\nA\nB", "B\nA"]) assert.throws(() => section(text, "A", "B"));
  });
  fixture("seeded edits must hit exactly one original span", () => {
    assert.equal(replaceOnce("one two", "two", "three"), "one three");
    for (const text of ["one", "two two"]) assert.throws(() => replaceOnce(text, "two", "three"));
    assert.throws(() => replaceOnce("two", "two", "two"));
  });
  fixture("source symlinks cannot substitute out-of-corpus content", () => {
    const file = path.join(root, "SUPPORT.md"), original = fs.readFileSync(file);
    fs.unlinkSync(file);
    try {
      fs.symlinkSync(path.join(__dirname, "SUPPORT.md"), file);
      assert.throws(() => buildPacket(root), /symlink/);
    } finally { fs.unlinkSync(file); fs.writeFileSync(file, original); }
  });
  fixture("preparation preserves separate evaluator input and author references", () => {
    const first = writePacket(packet, root), second = writePacket(packet, root);
    assert.notEqual(first.directory, second.directory);
    assert.equal(fs.readFileSync(path.join(first.directory, "prompt.md"), "utf8"), packet.prompt);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(first.directory, "author-reference.json"))), packet.reference);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(first.directory, "manifest.json"))), packet.manifest);
    assert.equal(fs.statSync(path.join(first.directory, "prompt.md")).mode & 0o777, 0o600);
    assert(first.directory.startsWith(path.join(root, ".cannae", "maintenance") + path.sep));
  });
  fixture("a symlinked output parent cannot redirect the review packet", () => {
    const other = path.join(root, "other-repository");
    fs.mkdirSync(other);
    fs.symlinkSync(path.join(root, ".cannae"), path.join(other, ".cannae"));
    assert.throws(() => writePacket(packet, other), /ordinary directories/);
  });
  fixture("native startup diagnostics are not tool calls or successful reviews", () => {
    const warning = { type: "item.completed", item: { type: "error", message: "Under-development features enabled: skip_host_skill_discovery." } };
    assert.equal(classifyReviewEvent(warning), "diagnostic");
    assert.equal(classifyReviewEvent({ type: "turn.started" }), "lifecycle");
    assert.equal(classifyReviewEvent({ type: "turn.failed" }), "failure");
    assert.equal(classifyReviewEvent({ type: "error", message: "API error" }), "failure");
  });
  fixture("actual tool and unknown native item types remain prohibited", () => {
    for (const type of ["command_execution", "mcp_tool_call", "web_search", "file_change", "todo_list", "future_tool"]) {
      assert.equal(classifyReviewEvent({ type: "item.started", item: { type } }), "prohibited_item");
    }
  });
  fixture("quoted tool text in a review message is not executable activity", () => {
    assert.equal(classifyReviewEvent({ type: "item.completed", item: { type: "agent_message", text: "Do not call command_execution." } }), "message");
  });
  fixture("malformed and unknown native envelopes cannot be accepted", () => {
    for (const value of [null, {}, { type: 5 }, { type: "future_event" }, { type: "item.completed" }]) {
      assert.throws(() => classifyReviewEvent(value), /native review/);
    }
  });
  console.log(JSON.stringify({ valid: true, fixtures, semantic_evaluation_executed: false, native_client_execution: false }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
