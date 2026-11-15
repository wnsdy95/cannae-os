#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { openWave, recordWave } = require("./skill-mission-controller");
const dispatch = require("./dispatch-runtime-controller");
const { assertContextDocuments, documentBinding } = require("./context-document-integrity");

const ROOT = __dirname;
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-context-documents-")));
const doctrine = path.join(temporary, "doctrine");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "CANNAE_OS_HOME"));
let passed = 0;
function git(root, args) { return execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8" }).trim(); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function initialize(root) {
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Context Fixture"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture inputs", "--allow-empty"]);
}
function fixture(name, check) { check(); passed++; console.log(`PASS ${name}`); }

try {
  const files = git(ROOT, ["ls-files", "-z"]).split("\0").filter(Boolean);
  for (const file of files.filter(file => /\.(js|json|md|sh)$/.test(file))) {
    const target = path.join(doctrine, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), target);
  }
  // The copied validator still needs the repository's installed dependencies.
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(doctrine, "node_modules"));
  initialize(doctrine);
  const source = path.join(doctrine, "SUPPORT.md"), original = fs.readFileSync(source);
  for (const provider of ["codex", "claude_code"]) {
    const repository = path.join(temporary, provider);
    write(path.join(repository, "README.md"), "fixture target\n");
    initialize(repository);
    const options = { repository, doctrineRoot: doctrine, artifactRoot: path.join(temporary, provider + "-artifacts"), now: "2026-07-23T04:20:00+09:00" };
    const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads/valid-mission-wave-plan.json")));
    plan.objective = "Draft a support SOP from SUPPORT.md.";
    plan.agents = [plan.agents[0]];
    plan.agents[0].task = "Draft the support SOP from SUPPORT.md.";
    plan.adaptive_work.enabled = false;
    const draft = { schema_version: "0.1", type: "DispatchToolPolicy", id: "DTP-DOCUMENTS",
      mission_id: plan.mission_id, wave_id: plan.wave_id, agent_id: plan.agents[0].agent_id,
      provider, default_decision: "deny", tool_rules: [{ rule_id: "DTR-READ", mission_action: "Inspect scoped repository files.",
        tool_name: "Read", operation_class: "repository_read", input_match: { mode: "path_prefix", path_fields: ["/file_path"], allowed_path_prefixes: ["README.md"] }, max_uses: 4 }],
      max_total_admissions: 4, lease_ttl_seconds: 600,
      repository_state: { require_head_match: true, require_serial_state_chain: true, require_clean_start: true },
      authority: { human_final_decision_authority: "USER", self_approval_prohibited: true, release_authorized: false },
      approved_at: "2026-07-23T04:10:00+09:00", valid_until: plan.valid_until };
    plan.dispatch_control = { required: true, enforcement_level: "guardrail", gateway_exclusive: false,
      policy_authorizations: [{ agent_id: draft.agent_id, provider, policy_id: draft.id, draft_sha256: dispatch.inputDigest(draft) }] };
    const opened = openWave(plan, options);
    assert.equal(opened.status, "ready");
    const context = JSON.parse(fs.readFileSync(path.join(options.artifactRoot, opened.context_packs[0].context_pack_ref.relative_path)));
    const receipt = JSON.parse(fs.readFileSync(path.join(options.artifactRoot, context.routing_receipt_ref.relative_path)));
    fixture(`${provider}: exact current routed documents validate without granting content access`, () => {
      assert.equal(assertContextDocuments(context, receipt, plan, doctrine), true);
      assert.deepEqual(Object.keys(documentBinding(doctrine, "SUPPORT.md")).sort(), ["path", "sha256"]);
    });
    fixture(`${provider}: missing additional duplicate and wrong-recipient document bindings fail`, () => {
      for (const change of [value => value.documents.pop(), value => value.documents.push(documentBinding(doctrine, "GOVERNANCE.md")),
        value => value.documents.push(value.documents[0]), value => value.agent_id = "another-agent"]) {
        const altered = structuredClone(context); change(altered);
        assert.throws(() => assertContextDocuments(altered, receipt, plan, doctrine), /CONTEXT_DOCUMENT_(SET|AGENT)_MISMATCH/);
      }
      for (const key of ["agent_id", "mission_id", "wave_id", "capability_query", "wave_scope"]) {
        assert.throws(() => assertContextDocuments(context, { ...receipt, [key]: "another" }, plan, doctrine), /CONTEXT_DOCUMENT_RECEIPT_MISMATCH/);
      }
    });
    dispatch.authorizeDispatchPolicy(options, draft);
    const binding = { sessionId: provider + "-fixture", providerAgentId: "main" };
    fixture(`${provider}: changed sources stop lease issuance and policy reauthorization`, () => {
      try {
        fs.appendFileSync(source, "\nChanged policy before lease issuance.\n");
        assert.throws(() => dispatch.issueLease(options, draft.id, binding), /CONTEXT_DOCUMENT_DIGEST_MISMATCH/);
        assert.throws(() => dispatch.authorizeDispatchPolicy(options, draft), /CONTEXT_DOCUMENT_DIGEST_MISMATCH/);
      } finally { fs.writeFileSync(source, original); }
    });
    const lease = dispatch.issueLease(options, draft.id, binding);
    const identity = { missionId: plan.mission_id, waveId: plan.wave_id, agentId: draft.agent_id, provider, ...binding };
    const hook = { hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "read-with-drift", tool_input: { file_path: "README.md" } };
    fixture(`${provider}: source changes block new tool authority`, () => {
      try {
        fs.appendFileSync(source, "\nChanged policy after context issuance.\n");
        const result = dispatch.admitToolRequest(options, identity, hook);
        assert.equal(result.decision, "deny", "A changed source must not reuse the old context digest.");
        assert(result.reason_codes.some(code => code.startsWith("CONTEXT_DOCUMENT_")));
      } finally { fs.writeFileSync(source, original); }
    });
    fixture(`${provider}: a declared source cannot disappear or become an in-root symlink`, () => {
      const backup = source + ".fixture-backup";
      fs.renameSync(source, backup);
      try {
        assert.throws(() => assertContextDocuments(context, receipt, plan, doctrine), /CONTEXT_DOCUMENT_UNAVAILABLE/);
        fs.symlinkSync(backup, source);
        assert.throws(() => assertContextDocuments(context, receipt, plan, doctrine), /CONTEXT_DOCUMENT_PATH_INVALID/);
      } finally {
        if (fs.existsSync(source)) fs.unlinkSync(source);
        fs.renameSync(backup, source);
      }
    });
    fixture(`${provider}: old admitted results settle while changed instructions deny continuation and completion reports`, () => {
      const inFlight = { ...hook, tool_use_id: "read-before-drift" };
      assert.equal(dispatch.admitToolRequest(options, identity, inFlight).decision, "allow");
      const contents = fs.readFileSync(path.join(repository, "README.md"), "utf8");
      try {
        fs.appendFileSync(source, "\nChanged policy with a call in flight.\n");
        const completed = dispatch.completeToolRequest(options, identity, { ...inFlight, hook_event_name: "PostToolUse", tool_response: { content: contents } });
        assert.equal(completed.checkpoint.execution_result.status, "succeeded");
        assert.equal(completed.execution_authorized, false);
        assert.equal(completed.release_authorized, false);
        const report = { schema_version: "0.1", type: "MissionWaveReport", id: "MWR-DOCUMENT-DRIFT",
          mission_id: plan.mission_id, wave_id: plan.wave_id, plan_ref: opened.plan_ref, routing_preflight_ref: opened.routing_preflight_ref,
          agent_results: [{ agent_id: draft.agent_id, context_pack_ref: opened.context_packs[0].context_pack_ref,
            status: "complete", summary: "Fixture result only.", completed_actions: ["Read the target fixture."], blockers: [],
            evidence_refs: [{ artifact_id: "OUT-FIXTURE", relative_path: "not-published.json", sha256: "a".repeat(64) }],
            improvement_candidates: [], next_actions: [] }], wave_status: "complete", human_decisions_required: [],
          release_requested: false, recorded_at: options.now };
        assert.throws(() => recordWave(report, options), /CONTEXT_DOCUMENT_DIGEST_MISMATCH/);
        assert.equal(dispatch.revokeLease(options, lease.lease.id, "SOURCE_CHANGED").execution_authorized, false);
      } finally { fs.writeFileSync(source, original); }
    });
  }
  fixture("canonical paths reject traversal private-state locations and ambiguous aliases", () => {
    for (const relative of ["../SUPPORT.md", "./SUPPORT.md", "/etc/hosts", ".git/config", ".cannae/state.json", ".cxt/notes.md",
      "docs//source-map.md", "docs\\source-map.md", "https://example.test/doc.md", "~/.config", "SUPPORT.md\n"]) {
      assert.throws(() => documentBinding(doctrine, relative), /CONTEXT_DOCUMENT_PATH_INVALID/);
    }
    assert.throws(() => documentBinding(doctrine, "docs"), /CONTEXT_DOCUMENT_PATH_INVALID/);
    const alias = path.join(doctrine, "alias-docs");
    fs.symlinkSync(path.join(doctrine, "docs"), alias);
    assert.throws(() => documentBinding(doctrine, "alias-docs/source-map.md"), /CONTEXT_DOCUMENT_PATH_INVALID/);
  });
  fixture("a mutation during the same file read cannot produce a usable binding", () => {
    const read = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
      const result = read.call(fs, file, ...args);
      if (typeof file === "number") fs.appendFileSync(source, "\nConcurrent change.\n");
      return result;
    };
    try { assert.throws(() => documentBinding(doctrine, "SUPPORT.md"), /CONTEXT_DOCUMENT_CHANGED_DURING_READ/); }
    finally { fs.readFileSync = read; fs.writeFileSync(source, original); }
  });
  console.log(JSON.stringify({ valid: true, fixtures: passed, native_client_execution: false, cross_repository_delivery_tested: false }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
