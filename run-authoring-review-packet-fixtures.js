#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { INPUTS, section, replaceOnce, buildPacket, writePacket, classifyReviewEvent, classifyClaudeReviewEvent,
  collectPublicReviewMessages } = require("./authoring-review-packet");

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
    const guide = section(fs.readFileSync(path.join(root, "docs/handoff-packet-template.md"), "utf8"),
      "### Ordinary Document Work", "### Existing Runtime Missions");
    assert(packet.prompt.includes(guide), "Reviewer context must preserve the whole current handoff guide.");
  });
  fixture("a handoff guide revision reaches the reviewer without changing historical cases", () => {
    const file = path.join(root, "docs/handoff-packet-template.md"), original = fs.readFileSync(file, "utf8");
    const guide = section(original, "### Ordinary Document Work", "### Existing Runtime Missions");
    const revised = `${guide}\n\nFixture revision: status claims must name their evidence scope.`;
    try {
      fs.writeFileSync(file, replaceOnce(original, guide, revised));
      const changed = buildPacket(root);
      assert.equal(changed.prompt, replaceOnce(packet.prompt, guide, revised));
      assert.deepEqual(changed.reference, packet.reference);
      assert.notEqual(changed.manifest.prompt_sha256, packet.manifest.prompt_sha256);
      assert.notEqual(changed.manifest.source_sha256["docs/handoff-packet-template.md"],
        packet.manifest.source_sha256["docs/handoff-packet-template.md"]);
    } finally { fs.writeFileSync(file, original); }
  });
  fixture("activity categories and exact source bindings reach both skills and reviewer context", () => {
    for (const phrase of ["successful reads, successful-source", "rereads, failed delivery and operational execution",
      "source-ID/version/full-digest tuple", "never combine fragments from different revisions",
      "not an automatic semantic or integrity check of generated prose"]) {
      assert(packet.prompt.includes(phrase), `Missing reviewer instruction: ${phrase}`);
    }
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const skill = fs.readFileSync(path.join(__dirname, provider, "controls-doctrine-operator/SKILL.md"), "utf8");
      for (const phrase of ["successful-source rereads, failed delivery", "no-retry boundary does not prohibit rereading other authorized sources",
        "source-ID/version/full-digest tuple verbatim", "Never combine digest fragments"]) {
        assert(skill.includes(phrase), `${provider} missing ${phrase}`);
      }
    }
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
  fixture("work-level holds stay distinct from next-action stops in both skills and reviewer context", () => {
    const guide = section(fs.readFileSync(path.join(root, "docs/handoff-packet-template.md"), "utf8"),
      "### Ordinary Document Work", "### Existing Runtime Missions");
    assert(packet.prompt.includes(guide));
    for (const phrase of ["List still-active work holds separately", "existing resolution path and decision owner",
      "Resolving one hold does not resolve a separate hold"]) assert(guide.includes(phrase));
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const skill = fs.readFileSync(path.join(__dirname, provider, "controls-doctrine-operator/SKILL.md"), "utf8");
      assert(skill.includes("Carry still-active work holds separately from the selected next action."));
      assert(skill.includes("each hold to its existing resolution path and decision owner."));
    }
  });
  fixture("same-owner decisions retain distinct scopes and backbrief is an intake action", () => {
    for (const phrase of ["Keep document adoption separate from publication, transmission and operational",
      "Source restoration also does not establish policy review, adoption or release.",
      "Treat the requested brief as a step after routing", "Final reporting must retain any missed notice."]) {
      assert(packet.prompt.includes(phrase));
    }
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const skill = fs.readFileSync(path.join(__dirname, provider, "controls-doctrine-operator/SKILL.md"), "utf8");
      const brief = skill.indexOf("3. When an advance backbrief is requested, send it now");
      assert(brief > 0 && brief < skill.indexOf("4. Resolve `recommended_documents[].path`"));
      assert(skill.includes("policy explicitly; do not invent it to fill the brief"));
      assert(skill.includes("The same decision owner does not make approval scopes interchangeable."));
      assert(skill.includes("holds. Combine them only when the actual decision explicitly covers each scope."));
    }
  });
  fixture("identical source bytes produce an identical packet and case order", () => {
    assert.deepEqual(buildPacket(root), packet);
  });
  fixture("required candidate counts remain in the full handoff reading inventory", () => {
    assert(packet.prompt.includes("Count by source ID, including the candidate when it is a required row."));
    assert(packet.prompt.includes("the full required total; rereads are separate from unique sources."));
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const skill = fs.readFileSync(path.join(__dirname, provider, "controls-doctrine-operator/SKILL.md"), "utf8");
      assert(skill.includes("Reconcile totals by source ID, including a candidate marked required."));
      assert(skill.includes("a denied read does not prevent a path leak in the listing."));
    }
  });
  fixture("receiving guidance distinguishes source identities from usable locations", () => {
    for (const phrase of ["Source IDs and digests identify material", "authorized bodies or resolvable source locations",
      "route token is not portable read access", "mark the handoff incomplete for receiving"]) assert(packet.prompt.includes(phrase));
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const directory = path.join(__dirname, provider, "controls-doctrine-operator");
      const skill = fs.readFileSync(path.join(directory, "SKILL.md"), "utf8");
      assert(skill.includes("per-objective assessments as well as the combined gap/cell decision"));
      assert(skill.includes("otherwise mark assembly incomplete, not ready for a cold start"));
      const routing = fs.readFileSync(path.join(directory, "references/document-routing.md"), "utf8");
      assert(routing.includes("A request-level gap does not mean every objective is uncovered."));
    }
  });
  fixture("required-read completion and advance reporting reach both clients and reviewer input", () => {
    for (const phrase of ["Reconcile assigned required rows with actual current-phase reads",
      "mark dependent review incomplete", "independent partial findings", "retrospective"]) {
      assert(packet.prompt.includes(phrase), `Missing current reviewer guidance: ${phrase}`);
    }
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const skill = fs.readFileSync(path.join(__dirname, provider, "controls-doctrine-operator/SKILL.md"), "utf8");
      assert(skill.includes("do not relabel unread requirements as"));
      assert(skill.includes("An over-broad list needs reviewed reassignment"));
      assert(skill.includes("not only as a retrospective final section"));
    }
  });
  fixture("method timing and quantitative comparison guidance remain explicit in both clients", () => {
    assert(packet.prompt.includes("method section after an already calculated headline is retrospective"));
    assert(packet.prompt.includes("does not reveal unobserved internal computation"));
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const skill = fs.readFileSync(path.join(__dirname, provider, "controls-doctrine-operator/SKILL.md"), "utf8");
      assert(skill.includes("Announce a required method change before dependent results"));
      assert(skill.includes("examples do not prove a ranking for all weights"));
      assert(skill.includes("docs/source-reliability-rubric.md"));
    }
    const rubric = fs.readFileSync(path.join(__dirname, "docs/source-reliability-rubric.md"), "utf8");
    assert(rubric.includes("Separate observed group differences, arithmetic scenarios and identified"));
    assert(rubric.includes("formula and crossover before making a universal claim"));
    assert(rubric.includes("Correct arithmetic cannot repair an unsupported interpretation"));
  });
  fixture("reviewed V1/V2 and V3 candidates retain their exact historical bytes", () => {
    const text = fs.readFileSync(path.join(root, "docs/document-authoring-case-study.md"), "utf8");
    assert.equal(hash(section(text, "## SOP Draft V1", "## Requirement Comparison")),
      "ad8a5ab4232eb8b647ef8c3edeb7b54d1cddd80cd62e8f2070d5ad0a7ab3c9da");
    assert.equal(hash(section(text, "## Corrective SOP Draft V3", "### V3 Comparison And Current Handoff")),
      "a94781eb9391573969b4759be9cf9e752ab28ad5f15c19b4a8d0e87076d3f980");
  });
  fixture("current navigation selects the proposed candidate without rewriting historical cases", () => {
    const text = fs.readFileSync(path.join(root, "docs/document-authoring-case-study.md"), "utf8");
    const notice = section(text, "## Evidence Boundary", "## Task And Backbrief");
    assert(notice.includes("[V5](#corrective-sop-draft-v5)"));
    assert(notice.includes("not fresh native")); assert(notice.includes("Other exercises below have separate candidate identities"));
    const readme = fs.readFileSync(path.join(__dirname, "README.md"), "utf8");
    assert(readme.includes("current [proposed V5](docs/document-authoring-case-study.md#corrective-sop-draft-v5)"));
    const backlog = fs.readFileSync(path.join(__dirname, "docs/completion-backlog.md"), "utf8");
    const current = section(backlog, "## Active Core Work", "## Evidence History");
    assert(current.includes("Current support-SOP candidate: [V5]"));
    assert(current.includes("not those historical instructions"));
    assert(!current.includes("Next: Claude implicit selection"));
    assert(backlog.includes("Next: Claude implicit selection"), "Retain the original checkpoint rather than rewriting it.");
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const guide = fs.readFileSync(path.join(__dirname, provider, "controls-doctrine-operator/references/self-improvement-loop.md"), "utf8");
      assert(guide.includes("passing link check cannot detect a stale but"));
      assert(guide.includes("Do not select a version just because its number is highest"));
      assert(guide.includes("do not trim evidence or replace an expected digest merely to pass"));
    }
    assert(!packet.prompt.includes("## Requirement-Level Audit"));
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
  fixture("V5 preserves reviewed V4 bytes and changes only hold scope and existing recovery links", () => {
    const text = fs.readFileSync(path.join(root, "docs/document-authoring-case-study.md"), "utf8");
    const body = value => value.slice(value.indexOf("**Purpose and result:**"));
    const v4 = body(section(text, "## Corrective SOP Draft V4", "### V4 Change Check And Handoff"));
    const v5 = section(text, "## Corrective SOP Draft V5", "### V5 Source Check And Handoff");
    assert.equal(hash(v4), "f10443b4d10d80b2db623cd33f526e6c9ae81f0551144e07fb0dc57d4a50b4b2");
    const changes = [
      ["`Corrective SOP Draft V4`; predecessor: Corrective SOP Draft V3 in the same file.",
        "`Corrective SOP Draft V5`; predecessor: Corrective SOP Draft V4 in the same file."],
      ["stop adoption; uncertain disclosure holds transmission. A draft is not a sent",
        "stop adoption. Clarify the conflict against the authoritative sources and use\n   step 4's decision/escalation path; keep adoption on hold until the applicable\n   decision owner resolves the conflict. Uncertain disclosure holds transmission;\n   use step 2's safe-intake recovery without bypassing that hold. A draft is not a sent"],
      ["intake; unresolved decisions and their real authority; next bounded action\n   and its applicable stop condition;",
        "intake; unresolved decisions and their real authority; the transferred work's\n   still-active stop conditions, their affected scope and resolution path;\n   next bounded action and any stop applicable to that action;"]
    ];
    assert.equal(body(v5), changes.reduce((value, [before, after]) => replaceOnce(value, before, after), v4));
    assert(v5.includes("not a fresh model review or operational receiver acceptance"));
    assert(!packet.prompt.includes("## Corrective SOP Draft V5"));
    assert(!packet.prompt.includes("## Support SOP V4 Source Review"));
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
  const progress = { type: "system", subtype: "thinking_tokens", estimated_tokens: 50,
    estimated_tokens_delta: 50, session_id: "synthetic-session", uuid: "synthetic-frame" };
  const status = { type: "system", subtype: "status", status: "requesting",
    session_id: "synthetic-session", uuid: "synthetic-status" };
  fixture("known Claude status messages are diagnostics, not reports or completion", () => {
    for (const value of [null, "requesting", "compacting"]) {
      assert.equal(classifyClaudeReviewEvent({ ...status, status: value }), "diagnostic");
      assert.equal(classifyClaudeReviewEvent({ ...status, status: value, permissionMode: "dontAsk" }), "diagnostic");
    }
  });
  fixture("malformed and tool-bearing status messages cannot hide as diagnostics", () => {
    for (const changed of [{ status: undefined }, { status: "future_status" }, { status: {} },
      { session_id: null }, { session_id: "" }, { uuid: "" }, { uuid: 1 }, { permissionMode: null },
      { content: [{ type: "tool_use" }] }, { tools: ["Bash"] }, { subtype: "future_notice" }]) {
      assert.throws(() => classifyClaudeReviewEvent({ ...status, ...changed }), /Claude review/);
    }
  });
  fixture("Claude status cannot change the review permission mode", () => {
    for (const permissionMode of ["default", "acceptEdits", "bypassPermissions", "plan", "auto", "future_mode", ""]) {
      assert.equal(classifyClaudeReviewEvent({ ...status, permissionMode }), "prohibited_item");
    }
  });
  fixture("status and partial text do not become duplicate or invented public messages", () => {
    const events = [status, { type: "stream_event", event: { type: "content_block_delta",
      delta: { type: "text_delta", text: "Final only." } } },
    { type: "assistant", uuid: "final", message: { content: [{ type: "text", text: "Final only." }] } }];
    assert.deepEqual(collectPublicReviewMessages("claude_code", [status]).messages, []);
    const result = collectPublicReviewMessages("claude_code", events);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].event_index, 2);
    assert.equal(result.timing_obligations_verified, false);
    assert.throws(() => classifyClaudeReviewEvent(events[1]), /Unknown Claude review event/);
  });
  fixture("both maintenance guides require channel diagnosis without weakening review guards", () => {
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const body = fs.readFileSync(path.join(__dirname, provider,
        "controls-doctrine-operator/references/self-improvement-loop.md"), "utf8");
      assert.match(body, /compare partial text with completed public\s+messages/);
      assert(body.includes("A status diagnostic is not a user report"));
      assert(body.includes("Retain unknown-event and permission-change stops"));
    }
  });
  fixture("Claude thinking progress is diagnostic, not a tool or completed review", () => {
    assert.equal(classifyClaudeReviewEvent(progress), "diagnostic");
    assert.equal(classifyClaudeReviewEvent({ ...progress, user_message_uuid: "synthetic-input" }), "diagnostic");
  });
  fixture("malformed or tool-bearing progress cannot hide behind the diagnostic subtype", () => {
    for (const changed of [{ estimated_tokens: -1 }, { estimated_tokens_delta: "50" }, { estimated_tokens: Infinity },
      { session_id: null }, { uuid: "" }, { content: [{ type: "tool_use" }] }, { subtype: "future_notice" }]) {
      assert.throws(() => classifyClaudeReviewEvent({ ...progress, ...changed }), /Claude review/);
    }
  });
  fixture("Claude startup requires no offered tools or MCP servers", () => {
    const init = { type: "system", subtype: "init", tools: [], mcp_servers: [], permissionMode: "dontAsk" };
    assert.equal(classifyClaudeReviewEvent(init), "lifecycle");
    for (const changed of [{ tools: ["Bash"] }, { mcp_servers: [{ name: "remote" }] }, { permissionMode: "default" }]) {
      assert.equal(classifyClaudeReviewEvent({ ...init, ...changed }), "prohibited_item");
    }
  });
  fixture("Claude tool calls stay prohibited even inside a mixed assistant response", () => {
    for (const type of ["tool_use", "server_tool_use", "future_tool"]) {
      assert.equal(classifyClaudeReviewEvent({ type: "assistant", message: { content: [
        { type: "text", text: "A review" }, { type, name: "Bash", input: {} }] } }), "prohibited_item");
    }
    assert.equal(classifyClaudeReviewEvent({ type: "assistant", message: { content: [
      { type: "text", text: "Do not call tool_use." }, { type: "redacted_thinking", data: "synthetic" }] } }), "message");
  });
  fixture("Claude API errors and error-bearing success subtypes are not model reviews", () => {
    assert.equal(classifyClaudeReviewEvent({ type: "assistant", error: "authentication_failed",
      message: { content: [{ type: "text", text: "Not logged in" }] } }), "failure");
    assert.equal(classifyClaudeReviewEvent({ type: "result", subtype: "success", is_error: true, result: "Not logged in" }), "failure");
  });
  fixture("Claude result classification still requires separate process and content appraisal", () => {
    const result = { type: "result", subtype: "success", is_error: false, permission_denials: [], result: "Draft only" };
    assert.equal(classifyClaudeReviewEvent(result), "result");
    assert.equal(classifyClaudeReviewEvent({ ...result, permission_denials: [{ tool_name: "Bash" }] }), "prohibited_item");
    for (const changed of [{ is_error: undefined }, { permission_denials: null }, { result: "" }]) {
      assert.throws(() => classifyClaudeReviewEvent({ ...result, ...changed }), /Claude review/);
    }
  });
  fixture("Claude unknown envelopes and malformed messages remain rejected", () => {
    for (const event of [null, {}, { type: "future_event" }, { type: "assistant", message: { content: [] } },
      { type: "assistant", message: { content: [{ type: "text" }] } }, { type: "rate_limit_event", rate_limit_info: { status: "unknown" } }]) {
      assert.throws(() => classifyClaudeReviewEvent(event), /Claude review/);
    }
    assert.equal(classifyClaudeReviewEvent({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning" } }), "diagnostic");
  });
  fixture("Codex public-message evidence excludes reasoning, tool arguments and quoted source results", () => {
    const events = [
      { type: "item.completed", item: { type: "reasoning", text: "I will announce the method." } },
      { type: "item.started", item: { type: "agent_message", id: "brief", text: "Partial text" } },
      { type: "item.completed", item: { type: "agent_message", id: "brief", text: "Purpose and limits.\n" } },
      { type: "item.completed", item: { type: "mcp_tool_call", arguments: { query: "I already announced it." },
        result: { content: [{ type: "text", text: "Historical author: I announce the method." }] } } },
      { type: "item.completed", item: { type: "agent_message", id: "report", text: "Result, with a retrospective notice." } }
    ];
    const result = collectPublicReviewMessages("codex", events);
    assert.deepEqual(result.messages, [
      { event_index: 2, content_index: null, native_id: "brief", text: "Purpose and limits.\n", text_sha256: hash("Purpose and limits.\n") },
      { event_index: 4, content_index: null, native_id: "report", text: "Result, with a retrospective notice.", text_sha256: hash("Result, with a retrospective notice.") }
    ]);
    assert.equal(result.event_count, 5);
    assert.equal(result.parsed_events_sha256, hash(JSON.stringify(events)));
    assert.equal(classifyReviewEvent(events[3]), "prohibited_item");
    const changed = structuredClone(events);
    changed[3].item.arguments.query = "A different claim.";
    assert.notEqual(collectPublicReviewMessages("codex", changed).parsed_events_sha256, result.parsed_events_sha256);
  });
  fixture("both skills and reviewer context require actual public reporting rather than route self-claims", () => {
    for (const file of ["codex-skills/controls-doctrine-operator/SKILL.md", ".claude/skills/controls-doctrine-operator/SKILL.md"]) {
      const body = fs.readFileSync(path.join(__dirname, file), "utf8");
      assert(body.includes("Use a current public assistant message for the notice."));
      assert(body.includes("arguments, source quotations and later claims of prior reporting do not replace"));
    }
    assert(packet.prompt.includes("A current public assistant message carries the notice."));
    assert(packet.prompt.includes("a route\nquery claiming prior notice"));
  });
  fixture("the authoring sequence places requested backbrief delivery before drafting", () => {
    const workflow = fs.readFileSync(path.join(root, "docs/document-authoring-workflow.md"), "utf8");
    const brief = workflow.indexOf("Deliver a requested advance backbrief before dependent reading or drafting");
    const draft = workflow.indexOf("4. Draft facts with source references.");
    assert(brief >= 0 && draft > brief);
    assert(workflow.includes("Read task sources only after any required advance report has been delivered."));
    assert(workflow.includes("Do not defer a required pre-work backbrief until this retrospective check."));
  });
  fixture("both skills preserve ownership and authority across a parent-delivered reporting phase", () => {
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const body = fs.readFileSync(path.join(__dirname, provider, "controls-doctrine-operator/SKILL.md"), "utf8");
      assert(body.includes("Check the actual client channel, not only its help or a requested flag."));
      assert.match(body, /finish a report-only phase with\s+dependent reading\/work unavailable/);
      assert.match(body, /original task, source assignment, ownership and holds/);
      assert.match(body, /parent delivery is not\s+worker self-report, USER approval or a human read receipt/);
    }
  });
  fixture("reviewer guidance distinguishes a delivered brief from preparation and authorization", () => {
    for (const required of ["withhold dependent tools", "a prompt alone is not an execution barrier",
      "Prepared text and a planned message do not satisfy this step.",
      "Delivery\n   is not USER approval", "If no authorized parent/channel is available, hold the dependent work",
      "not automatic native\nprogress delivery"]) assert(packet.prompt.includes(required));
  });
  fixture("Claude projection retains only public top-level text with original block and event positions", () => {
    const events = [
      { type: "user", message: { content: [{ type: "text", text: "Quoted old backbrief." }] } },
      { type: "assistant", uuid: "current", message: { content: [
        { type: "thinking", thinking: "I should report first." },
        { type: "text", text: "Current report." },
        { type: "tool_use", name: "route_current_task", input: { query: "After advance notice." } },
        { type: "text", text: "Current report." }
      ] } },
      { type: "assistant", isSynthetic: true, message: { content: [{ type: "text", text: "Injected text." }] } },
      { type: "assistant", parent_tool_use_id: "child", message: { content: [{ type: "text", text: "Another actor." }] } },
      { type: "result", subtype: "success", is_error: false, result: "Current report." },
      { type: "user", message: { content: [{ type: "tool_result", content: "Historical author: I announced it." }] } }
    ];
    const result = collectPublicReviewMessages("claude_code", events);
    assert.deepEqual(result.messages, [1, 3].map(content_index => ({ event_index: 1, content_index,
      native_id: "current", text: "Current report.", text_sha256: hash("Current report.") })));
    assert.equal(result.parsed_events_sha256, hash(JSON.stringify(events)));
    assert.equal(classifyClaudeReviewEvent(events[1]), "prohibited_item");
  });
  fixture("a final result alone or an error message cannot establish an advance report", () => {
    assert.deepEqual(collectPublicReviewMessages("claude_code", [
      { type: "result", subtype: "success", is_error: false, result: "I reported before work." },
      { type: "assistant", error: "authentication_failed", message: { content: [{ type: "text", text: "Failed." }] } },
      { type: "assistant", is_api_error_message: true, message: { content: [{ type: "text", text: "Failed." }] } }
    ]).messages, []);
    const message = { type: "item.completed", item: { type: "agent_message", text: "Not a current actor report." } };
    for (const fields of [{ error: "failed" }, { isSynthetic: true }, { parent_tool_use_id: "child" }]) {
      assert.deepEqual(collectPublicReviewMessages("codex", [{ ...message, ...fields }]).messages, []);
    }
  });
  fixture("message extraction never establishes completion, timing, semantics or authority", () => {
    for (const provider of ["codex", "claude_code"]) {
      const result = collectPublicReviewMessages(provider, [{ type: "future_event" }, { type: "turn.failed" }]);
      assert.deepEqual(result.messages, []);
      for (const field of ["process_completion_verified", "timing_obligations_verified",
        "semantic_acceptance_established", "execution_authorized", "release_authorized"]) assert.equal(result[field], false);
    }
    assert.throws(() => classifyReviewEvent({ type: "future_event" }), /native review/);
    assert.throws(() => classifyClaudeReviewEvent({ type: "future_event" }), /Claude review/);
  });
  fixture("public-message extraction rejects malformed targeted envelopes without inventing text", () => {
    assert.throws(() => collectPublicReviewMessages("unknown", []), /provider/);
    assert.throws(() => collectPublicReviewMessages("codex", {}), /array/);
    for (const provider of ["codex", "claude_code"]) {
      for (const event of [null, [], {}, { type: 1 }]) {
        assert.throws(() => collectPublicReviewMessages(provider, [event]), /envelope/);
      }
    }
    assert.throws(() => collectPublicReviewMessages("codex", [{ type: "item.completed", item: { type: "agent_message" } }]), /text/);
    for (const content of [undefined, {}, [null], [{ type: "text" }], [{ type: 1 }]]) {
      assert.throws(() => collectPublicReviewMessages("claude_code", [{ type: "assistant", message: { content } }]), /public review/);
    }
  });
  console.log(JSON.stringify({ valid: true, fixtures, semantic_evaluation_executed: false, native_client_execution: false }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
