#!/usr/bin/env node

const assert = require("node:assert/strict");
const { environment, profile, textParts, claudeDiscovery, verifyClaudeSkillBody } = require("./skill-client-discovery-probe");

const name = "controls-doctrine-operator";
const description = "Fixture-only skill description.";
let fixtures = 0;
function fixture(label, check) { check(); fixtures++; console.log(`PASS ${label}`); }

fixture("probe environment is allowlisted and does not inherit credentials", () => {
  const env = environment("/temporary/home");
  assert.deepEqual(Object.keys(env).sort(), ["HOME", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "TMPDIR", "PATH", "LANG",
    "TERM", "DISABLE_AUTOUPDATER", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"].sort());
  assert.equal(env.HOME, "/temporary/home");
  assert.equal(env.CODEX_HOME, "/temporary/home/.codex");
  assert.equal(env.CLAUDE_CONFIG_DIR, "/temporary/home/.claude");
});
fixture("OS policy denies network and writes outside its escaped temporary root", () => {
  const policy = profile('/temporary/quoted " directory');
  assert(policy.includes("(deny network*)"));
  assert(policy.includes("(deny file-write*)"));
  assert(policy.includes('(subpath "/temporary/quoted \\" directory")'));
  assert(policy.includes("(deny mach-lookup"));
});
fixture("Codex prompt extraction handles structured lists without joining unrelated strings", () => {
  assert.deepEqual(textParts([{ content: [{ text: "one" }, { text: "two" }] }, null, 7]), ["one", "two"]);
});
fixture("absent Claude command is not discovery", () => {
  assert.equal(claudeDiscovery({ commands: [{ name: "another-skill", description }] }, description), false);
});
fixture("Claude descriptions accept only exact text or the observed user annotation", () => {
  for (const value of [description, `${description} (user)`]) {
    assert.equal(claudeDiscovery({ commands: [{ name, description: value }] }, description), true);
  }
  for (const value of ["", "Different", `${description} (project)`, `${description} EXTRA (user)`]) {
    assert.throws(() => claudeDiscovery({ commands: [{ name, description: value }] }, description), /description/);
  }
});
fixture("duplicate commands cannot satisfy native discovery", () => {
  assert.throws(() => claudeDiscovery({ commands: [{ name, description }, { name, description }] }, description), /duplicate/);
});
fixture("missing native command metadata fails instead of guessing from text", () => {
  for (const value of [null, {}, { commands: name }, { result: description }]) {
    assert.throws(() => claudeDiscovery(value, description), /command list/);
  }
});
const directory = "/synthetic/skills/controls-doctrine-operator", body = "# Synthetic Instructions\n\nPreserve USER authority.\n";
const loadedEvent = args => ({ type: "user", isSynthetic: true, message: { role: "user", content: [{ type: "text",
  text: `Base directory for this skill: ${directory}\n\n${body}${args ? `\n\nARGUMENTS: ${args}` : ""}` }] } });
fixture("native body delivery accepts absent or empty documented arguments", () => {
  for (const args of [undefined, ""]) {
    const result = verifyClaudeSkillBody(loadedEvent(args), { directory, body, args });
    assert.equal(result.body_verified, true); assert.equal(result.semantic_execution_verified, false);
  }
});
fixture("native body delivery binds multiline task arguments separately from instructions", () => {
  const args = "Review the SOP.\nNo publication.\n\nARGUMENTS: literal task text";
  const withArgs = verifyClaudeSkillBody(loadedEvent(args), { directory, body, args });
  const withoutArgs = verifyClaudeSkillBody(loadedEvent(), { directory, body });
  assert.equal(withArgs.body_sha256, withoutArgs.body_sha256);
  assert.match(withArgs.arguments_sha256, /^[a-f0-9]{64}$/); assert.equal(withoutArgs.arguments_sha256, null);
});
fixture("metadata and a Skill launch acknowledgement do not prove body delivery", () => {
  for (const event of [{ type: "system", subtype: "init", skills: [name] },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", content: `Launching skill: ${name}` }] } }]) {
    assert.throws(() => verifyClaudeSkillBody(event, { directory, body }), /native loaded-skill/);
  }
});
fixture("wrong location or changed instructions cannot pass a native load check", () => {
  assert.throws(() => verifyClaudeSkillBody(loadedEvent(), { directory: directory + "-other", body }), /directory mismatch/);
  assert.throws(() => verifyClaudeSkillBody(loadedEvent(), { directory, body: body + "Extra permission." }), /body mismatch/);
});
fixture("unexpected missing or substituted arguments remain mismatches", () => {
  assert.throws(() => verifyClaudeSkillBody(loadedEvent("review"), { directory, body }), /body mismatch/);
  assert.throws(() => verifyClaudeSkillBody(loadedEvent(), { directory, body, args: "review" }), /arguments mismatch/);
  assert.throws(() => verifyClaudeSkillBody(loadedEvent("publish"), { directory, body, args: "review" }), /arguments mismatch/);
});
fixture("malformed native load content and invalid expectations fail closed", () => {
  const extra = loadedEvent(); extra.message.content.push({ type: "text", text: "extra" });
  assert.throws(() => verifyClaudeSkillBody(extra, { directory, body }), /content/);
  for (const options of [{ directory: "relative", body }, { directory, body: "" }, { directory, body, args: {} }]) {
    assert.throws(() => verifyClaudeSkillBody(loadedEvent(), options));
  }
});
console.log(JSON.stringify({ valid: true, fixtures, native_client_execution: false }));
