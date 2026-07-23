#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const {
  admitToolRequest,
  authorizeDispatchPolicy,
  completeLease,
  completeToolRequest,
  dispatchStatus,
  inputDigest,
  issueLease,
  resumeLease,
  revokeLease,
  sessionStart
} = require("./dispatch-runtime-controller");
const {
  denyPayload,
  postFailurePayload,
  sessionPayload
} = require("./dispatch-hook-adapter");
const { configureProvider } = require("./install-dispatch-hooks");
const { openWave } = require("./skill-mission-controller");

const ROOT = __dirname;
const ISSUED_AT = "2026-07-23T04:20:00+09:00";
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-dispatch-runtime-"));
const artifactRoot = path.join(temporaryRoot, "artifacts");

function runGit(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "git failed").trim());
  return result.stdout.trim();
}

function initRepository(name) {
  const repository = path.join(temporaryRoot, name);
  fs.mkdirSync(repository, { recursive: true });
  runGit(repository, ["init", "-q"]);
  runGit(repository, ["config", "user.email", "fixtures@example.com"]);
  runGit(repository, ["config", "user.name", "Dispatch Fixture"]);
  fs.writeFileSync(path.join(repository, "README.md"), "dispatch fixture\n");
  runGit(repository, ["add", "README.md"]);
  runGit(repository, ["commit", "-qm", "initial"]);
  return repository;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function expectThrow(fn, pattern) {
  let error;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert(error, "expected operation to throw");
  if (pattern) assert(pattern.test(error.message), error.message);
}

function identity(sessionId, overrides = {}) {
  return {
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    agentId: "plans-agent",
    provider: "codex",
    sessionId,
    providerAgentId: "main",
    ...overrides
  };
}

function hookInput(event, toolUseId, toolInput, toolName = "Bash", cwd = repositoryA) {
  return {
    session_id: "provider-session",
    cwd,
    hook_event_name: event,
    tool_name: toolName,
    tool_use_id: toolUseId,
    tool_input: toolInput
  };
}

function policy(id, toolInput, overrides = {}) {
  return {
    schema_version: "0.1",
    type: "DispatchToolPolicy",
    id,
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    agent_id: "plans-agent",
    provider: "codex",
    default_decision: "deny",
    tool_rules: [{
      rule_id: "DTR-EXACT-COMMAND",
      mission_action: "Run deterministic validation.",
      tool_name: "Bash",
      operation_class: "process_execute",
      input_match: {
        mode: "exact_sha256",
        allowed_sha256: [inputDigest(toolInput)]
      },
      max_uses: 8
    }],
    max_total_admissions: 8,
    lease_ttl_seconds: 600,
    repository_state: {
      require_head_match: true,
      require_serial_state_chain: true,
      require_clean_start: true
    },
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    },
    approved_at: "2026-07-23T04:10:00+09:00",
    valid_until: "2027-07-23T04:10:00+09:00",
    ...overrides
  };
}

const repositoryA = initRepository("alpha");
const repositoryB = initRepository("bravo");
const repositoryC = initRepository("charlie");
const repositoryD = initRepository("delta");
const repositoryE = initRepository("echo");
const repositoryF = initRepository("foxtrot");
const repositoryG = initRepository("golf");
const repositoryH = initRepository("hotel");
const repositoryI = initRepository("india");
const plan = readJson("sample-payloads/valid-mission-wave-plan.json");
const statusInput = { command: "git status --short" };
const retainedInput = { command: "git commit -am release" };
const mutateInput = { command: "node mutate.js" };
const policyDrafts = {
  primary: policy("DTP-DISPATCH-A", statusInput),
  short: policy("DTP-DISPATCH-SHORT", statusInput, { lease_ttl_seconds: 60 }),
  retained: policy("DTP-DISPATCH-RETAINED", retainedInput),
  dirtyResume: policy("DTP-DISPATCH-DIRTY-RESUME", mutateInput),
  inFlight: policy("DTP-DISPATCH-IN-FLIGHT", statusInput),
  concurrent: policy("DTP-DISPATCH-CONCURRENT", statusInput),
  verification: policy("DTP-DISPATCH-VERIFICATION", statusInput, {
    agent_id: "verification-agent",
    tool_rules: [{
      rule_id: "DTR-VERIFY",
      mission_action: "Run the assigned verification commands.",
      tool_name: "Bash",
      operation_class: "process_execute",
      input_match: {
        mode: "exact_sha256",
        allowed_sha256: [inputDigest(statusInput)]
      },
      max_uses: 1
    }],
    max_total_admissions: 1
  })
};

function dispatchPlan(agentDraft) {
  const repositoryPlan = JSON.parse(JSON.stringify(plan));
  repositoryPlan.dispatch_control = {
    required: true,
    enforcement_level: "guardrail",
    gateway_exclusive: false,
    policy_authorizations: [agentDraft, policyDrafts.verification].map(draft => ({
    agent_id: draft.agent_id,
    provider: draft.provider,
    policy_id: draft.id,
    draft_sha256: inputDigest(draft)
    }))
  };
  return repositoryPlan;
}

for (const [repository, draft] of [
  [repositoryA, policyDrafts.primary],
  [repositoryC, policyDrafts.dirtyResume],
  [repositoryD, policyDrafts.short],
  [repositoryE, policyDrafts.retained],
  [repositoryF, policyDrafts.inFlight],
  [repositoryG, policyDrafts.primary],
  [repositoryH, policyDrafts.concurrent],
  [repositoryI, policyDrafts.primary]
]) {
  openWave(dispatchPlan(draft), {
    repository,
    artifactRoot,
    doctrineRoot: ROOT,
    now: "2026-07-23T04:15:00+09:00"
  });
}

const options = {
  repository: repositoryA,
  artifactRoot,
  now: ISSUED_AT
};

function authorizeAndIssue(runtimeOptions, draft, bindings) {
  authorizeDispatchPolicy(runtimeOptions, draft);
  return issueLease(runtimeOptions, draft.id, bindings);
}

function spawnController(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [
      path.join(ROOT, "dispatch-runtime-controller.js"),
      ...args
    ], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", chunk => { stderr += chunk.toString("utf8"); });
    child.on("close", status => resolve({ status, stdout, stderr }));
  });
}

const fixtures = [];

function fixture(name, fn) {
  fixtures.push({ name, fn });
}

let issued;
let resumed;

fixture("controller issues a short-lived manifest-backed lease and baseline checkpoint", () => {
  issued = authorizeAndIssue(options, policy("DTP-DISPATCH-A", statusInput), {
    sessionId: "session-a",
    providerAgentId: "main"
  });
  assert.strictEqual(issued.status, "active");
  assert.strictEqual(issued.execution_authorized, true);
  assert.strictEqual(issued.release_authorized, false);
  assert.strictEqual(issued.lease.context_pack_ref.artifact_id, "ACP-W1-plans-agent");
  assert.strictEqual(issued.checkpoint.sequence, 0);
});

fixture("a second session cannot mint parallel authority for the same mission agent", () => {
  expectThrow(() => issueLease(options, "DTP-DISPATCH-A", {
    sessionId: "session-b",
    providerAgentId: "main"
  }), /lineage already exists/);
});

fixture("new tool authority waits for the prior mission-agent handoff", () => {
  authorizeDispatchPolicy(options, policyDrafts.verification);
  expectThrow(() => issueLease(options, policyDrafts.verification.id, {
    sessionId: "session-verification",
    providerAgentId: "main"
  }), /Another nonterminal dispatch lease/);
});

fixture("concurrent issuance serializes to one lease lineage", async () => {
  const concurrentOptions = {
    repository: repositoryH,
    artifactRoot,
    now: ISSUED_AT
  };
  const draft = policy("DTP-DISPATCH-CONCURRENT", statusInput);
  authorizeDispatchPolicy(concurrentOptions, draft);
  const command = session => [
    "issue",
    "--repository", repositoryH,
    "--artifact-root", artifactRoot,
    "--policy-id", draft.id,
    "--session", session,
    "--provider-agent", "main",
    "--at", ISSUED_AT
  ];
  const results = await Promise.all([
    spawnController(command("session-concurrent-a")),
    spawnController(command("session-concurrent-b"))
  ]);
  assert.deepStrictEqual(results.map(item => item.status).sort(), [0, 2]);
  const status = dispatchStatus(concurrentOptions, {
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    agentId: "plans-agent"
  });
  assert.strictEqual(status.leases.length, 1);
});

fixture("concurrent cross-agent issuance permits one repository authority handoff", async () => {
  const concurrentOptions = {
    repository: repositoryI,
    artifactRoot,
    now: ISSUED_AT
  };
  authorizeDispatchPolicy(concurrentOptions, policyDrafts.primary);
  authorizeDispatchPolicy(concurrentOptions, policyDrafts.verification);
  const command = (policyId, session) => [
    "issue",
    "--repository", repositoryI,
    "--artifact-root", artifactRoot,
    "--policy-id", policyId,
    "--session", session,
    "--provider-agent", "main",
    "--at", ISSUED_AT
  ];
  const results = await Promise.all([
    spawnController(command(policyDrafts.primary.id, "session-cross-agent-a")),
    spawnController(command(policyDrafts.verification.id, "session-cross-agent-b"))
  ]);
  assert.deepStrictEqual(results.map(item => item.status).sort(), [0, 2]);
  const status = dispatchStatus(concurrentOptions, {
    missionId: plan.mission_id,
    waveId: plan.wave_id
  });
  assert.strictEqual(status.leases.length, 1);
  completeLease({
    ...concurrentOptions,
    now: "2026-07-23T04:20:30+09:00"
  }, status.leases[0].lease_id, "CROSS_AGENT_CONCURRENCY_FIXTURE_COMPLETE");
});

fixture("exact policy and repository state admit one covered tool request", () => {
  const result = admitToolRequest(options, identity("session-a"),
    hookInput("PreToolUse", "tool-1", statusInput));
  assert.strictEqual(result.decision, "allow");
  assert(result.admission_ref.relative_path.includes("/tool-admission-events/"));
  assert.strictEqual(result.release_authorized, false);
});

fixture("serialized state chain rejects another request while a tool is in flight", () => {
  const result = admitToolRequest(options, identity("session-a"),
    hookInput("PreToolUse", "tool-2", statusInput));
  assert.strictEqual(result.decision, "deny");
  assert(result.reason_codes.includes("LEASE_TOOL_IN_FLIGHT"));
});

fixture("post-tool completion must repeat the admitted tool name and input digest", () => {
  const result = completeToolRequest({
    ...options,
    now: "2026-07-23T04:20:30+09:00"
  }, identity("session-a"), hookInput(
    "PostToolUse",
    "tool-1",
    { command: "uname -a" }
  ));
  assert.strictEqual(result.decision, "deny");
  assert(result.reason_codes.includes("TOOL_COMPLETION_BINDING_MISMATCH"));
});

fixture("post-tool completion advances the checkpoint chain", () => {
  const result = completeToolRequest({
    ...options,
    now: "2026-07-23T04:21:00+09:00"
  }, identity("session-a"), hookInput("PostToolUse", "tool-1", statusInput));
  assert.strictEqual(result.status, "active");
  assert.strictEqual(result.checkpoint.sequence, 1);
  assert.strictEqual(result.checkpoint.tool_admission_ref.artifact_id, result.admission_ref.artifact_id);
});

fixture("replayed tool-use ID is denied", () => {
  const result = admitToolRequest({
    ...options,
    now: "2026-07-23T04:22:00+09:00"
  }, identity("session-a"), hookInput("PreToolUse", "tool-1", statusInput));
  assert.strictEqual(result.decision, "deny");
  assert(result.reason_codes.includes("TOOL_REQUEST_REPLAY"));
});

fixture("uncovered command is denied by default", () => {
  const result = admitToolRequest({
    ...options,
    now: "2026-07-23T04:22:10+09:00"
  }, identity("session-a"), hookInput("PreToolUse", "tool-uncovered", { command: "uname -a" }));
  assert.strictEqual(result.decision, "deny");
  assert(result.reason_codes.includes("TOOL_POLICY_NO_MATCH"));
});

fixture("external worktree drift is denied before execution", () => {
  fs.writeFileSync(path.join(repositoryA, "README.md"), "uncheckpointed drift\n");
  const result = admitToolRequest({
    ...options,
    now: "2026-07-23T04:22:20+09:00"
  }, identity("session-a"), hookInput("PreToolUse", "tool-drift", statusInput));
  assert.strictEqual(result.decision, "deny");
  assert(result.reason_codes.includes("REPOSITORY_STATE_DRIFT"));
  fs.writeFileSync(path.join(repositoryA, "README.md"), "dispatch fixture\n");
});

fixture("SessionStart resume invalidates stale authority without renewing it", () => {
  const result = sessionStart({
    ...options,
    now: "2026-07-23T04:23:00+09:00"
  }, identity("session-a"), {
    hook_event_name: "SessionStart",
    source: "resume",
    session_id: "session-a"
  });
  assert.strictEqual(result.execution_authorized, false);
  assert(result.reason_codes.includes("FRESH_LEASE_REQUIRED_AFTER_SESSION_RESTART"));
  const denied = admitToolRequest({
    ...options,
    now: "2026-07-23T04:23:10+09:00"
  }, identity("session-a"), hookInput("PreToolUse", "tool-after-resume", statusInput));
  assert.strictEqual(denied.decision, "deny");
  assert(denied.reason_codes.includes("LEASE_INTERRUPTED"));
});

fixture("resume refuses post-checkpoint drift", () => {
  fs.writeFileSync(path.join(repositoryA, "README.md"), "changed after interruption\n");
  expectThrow(() => resumeLease({
    ...options,
    now: "2026-07-23T04:24:00+09:00"
  }, issued.lease.id, {
    sessionId: "session-a",
    providerAgentId: "main"
  }), /changed after the interruption/);
  fs.writeFileSync(path.join(repositoryA, "README.md"), "dispatch fixture\n");
});

fixture("explicit resume supersedes the old lease and issues a fresh nonce", () => {
  resumed = resumeLease({
    ...options,
    now: "2026-07-23T04:25:00+09:00"
  }, issued.lease.id, {
    sessionId: "session-a",
    providerAgentId: "main"
  });
  assert.strictEqual(resumed.status, "active");
  assert.notStrictEqual(resumed.lease.id, issued.lease.id);
  assert.notStrictEqual(resumed.lease.nonce, issued.lease.nonce);
  assert.strictEqual(resumed.lease.issuance_reason, "resume");
  assert.strictEqual(resumed.lease.previous_lease_ref.artifact_id, issued.lease.id);
});

fixture("post-tool completion resolves the resumed lease within one session lineage", () => {
  const actor = identity("session-a");
  const request = hookInput("PreToolUse", "tool-after-explicit-resume", statusInput);
  const admitted = admitToolRequest({
    ...options,
    now: "2026-07-23T04:25:05+09:00"
  }, actor, request);
  assert.strictEqual(admitted.decision, "allow");
  assert.strictEqual(admitted.lease_ref.artifact_id, resumed.lease.id);

  const completed = completeToolRequest({
    ...options,
    now: "2026-07-23T04:25:06+09:00"
  }, actor, {
    ...request,
    hook_event_name: "PostToolUse"
  });
  assert.strictEqual(completed.status, "active");
  assert.strictEqual(completed.admission_ref.artifact_id, admitted.admission_ref.artifact_id);
});

fixture("cross-session and cross-agent bindings fail closed", () => {
  const sessionMismatch = admitToolRequest({
    ...options,
    now: "2026-07-23T04:25:10+09:00"
  }, identity("different-session"), hookInput("PreToolUse", "tool-cross-session", statusInput));
  assert.strictEqual(sessionMismatch.decision, "deny");
  assert(sessionMismatch.reason_codes.includes("LEASE_BINDING_MISMATCH"));

  const agentMismatch = admitToolRequest({
    ...options,
    now: "2026-07-23T04:25:10+09:00"
  }, identity("session-a", { agentId: "verification-agent" }),
  hookInput("PreToolUse", "tool-cross-agent", statusInput));
  assert.strictEqual(agentMismatch.decision, "deny");
  assert(agentMismatch.reason_codes.includes("LEASE_NOT_FOUND"));
});

fixture("revocation blocks all later requests", () => {
  const revoked = revokeLease({
    ...options,
    now: "2026-07-23T04:26:00+09:00"
  }, resumed.lease.id, "OPERATOR_REVOKED");
  assert.strictEqual(revoked.status, "revoked");
  const denied = admitToolRequest({
    ...options,
    now: "2026-07-23T04:26:10+09:00"
  }, identity("session-a"), hookInput("PreToolUse", "tool-revoked", statusInput));
  assert.strictEqual(denied.decision, "deny");
  assert(denied.reason_codes.includes("LEASE_NOT_ACTIVE"));

  const handoff = issueLease({
    ...options,
    now: "2026-07-23T04:26:20+09:00"
  }, policyDrafts.verification.id, {
    sessionId: "session-verification",
    providerAgentId: "main"
  });
  assert.strictEqual(handoff.status, "active");
  const completed = completeLease({
    ...options,
    now: "2026-07-23T04:26:30+09:00"
  }, handoff.lease.id, "VERIFICATION_HANDOFF_COMPLETE");
  assert.strictEqual(completed.status, "completed");
});

fixture("expired lease is excluded from admission", () => {
  const shortOptions = {
    repository: repositoryD,
    artifactRoot,
    now: "2026-07-23T04:30:00+09:00"
  };
  const shortPolicy = policy("DTP-DISPATCH-SHORT", statusInput, { lease_ttl_seconds: 60 });
  authorizeAndIssue(shortOptions, shortPolicy, {
    sessionId: "session-short",
    providerAgentId: "main"
  });
  const denied = admitToolRequest({
    ...shortOptions,
    now: "2026-07-23T04:31:01+09:00"
  }, identity("session-short"), hookInput(
    "PreToolUse",
    "tool-expired",
    statusInput,
    "Bash",
    repositoryD
  ));
  assert.strictEqual(denied.decision, "deny");
  assert(denied.reason_codes.includes("LEASE_EXPIRED"));
});

fixture("obvious retained command stays blocked even when its digest is listed", () => {
  const retainedOptions = {
    repository: repositoryE,
    artifactRoot,
    now: "2026-07-23T04:32:00+09:00"
  };
  const retainedInput = { command: "git commit -am release" };
  authorizeAndIssue(retainedOptions,
    policy("DTP-DISPATCH-RETAINED", retainedInput), {
      sessionId: "session-retained",
      providerAgentId: "main"
    });
  const denied = admitToolRequest({
    ...retainedOptions,
    now: "2026-07-23T04:32:10+09:00"
  }, identity("session-retained"), hookInput(
    "PreToolUse",
    "tool-retained",
    retainedInput,
    "Bash",
    repositoryE
  ));
  assert.strictEqual(denied.decision, "deny");
  assert(denied.reason_codes.includes("RETAINED_ACTION_BLOCKED"));
});

fixture("a caller cannot self-mint a policy absent from the USER-authored mission plan", () => {
  const unsafeOptions = {
    repository: repositoryG,
    artifactRoot,
    now: "2026-07-23T04:32:20+09:00"
  };
  const unsafeDraft = policy(
    "DTP-DISPATCH-SELF-MINT",
    { command: "rm -f README.md" }
  );
  expectThrow(
    () => authorizeDispatchPolicy(unsafeOptions, unsafeDraft),
    /not authorized by the exact mission-plan digest/
  );
  expectThrow(
    () => issueLease(unsafeOptions, unsafeDraft.id, {
      sessionId: "session-self-mint",
      providerAgentId: "main"
    }),
    /found 0/
  );
});

fixture("revocation with an unresolved admitted call blocks reconciliation and reissue", () => {
  const unresolvedOptions = {
    repository: repositoryF,
    artifactRoot,
    now: "2026-07-23T04:32:30+09:00"
  };
  const draft = policy("DTP-DISPATCH-IN-FLIGHT", statusInput);
  const lease = authorizeAndIssue(unresolvedOptions, draft, {
    sessionId: "session-in-flight",
    providerAgentId: "main"
  });
  const actor = identity("session-in-flight");
  const request = hookInput(
    "PreToolUse",
    "tool-in-flight",
    statusInput,
    "Bash",
    repositoryF
  );
  assert.strictEqual(admitToolRequest(unresolvedOptions, actor, request).decision, "allow");
  const revoked = revokeLease({
    ...unresolvedOptions,
    now: "2026-07-23T04:32:40+09:00"
  }, lease.lease.id, "OPERATOR_REVOKED_DURING_TOOL");
  assert.strictEqual(revoked.status, "blocked");
  assert(revoked.checkpoint.reason_codes.includes("TOOL_IN_FLIGHT_AT_TRANSITION"));
  expectThrow(
    () => issueLease(unresolvedOptions, draft.id, {
      sessionId: "session-reissued",
      providerAgentId: "main"
    }),
    /lineage already exists/
  );
  const reconciled = completeToolRequest({
    ...unresolvedOptions,
    now: "2026-07-23T04:32:50+09:00"
  }, actor, {
    ...request,
    hook_event_name: "PostToolUse"
  });
  assert.strictEqual(reconciled.status, "blocked");
  expectThrow(
    () => completeLease(unresolvedOptions, lease.lease.id),
    /is blocked/
  );
});

fixture("explicit resume accepts an exact dirty post-tool checkpoint without weakening clean initial issuance", () => {
  const repositoryOptions = {
    repository: repositoryC,
    artifactRoot,
    now: "2026-07-23T04:33:00+09:00"
  };
  const mutateInput = { command: "node mutate.js" };
  const initial = authorizeAndIssue(repositoryOptions,
    policy("DTP-DISPATCH-DIRTY-RESUME", mutateInput), {
      sessionId: "session-dirty",
      providerAgentId: "main"
    });
  const actor = identity("session-dirty");
  const preTool = hookInput(
    "PreToolUse",
    "tool-dirty",
    mutateInput,
    "Bash",
    repositoryC
  );
  const admitted = admitToolRequest(repositoryOptions, actor, preTool);
  assert.strictEqual(admitted.decision, "allow");
  fs.writeFileSync(path.join(repositoryC, "README.md"), "checkpointed tool mutation\n");
  const postTool = completeToolRequest({
    ...repositoryOptions,
    now: "2026-07-23T04:33:10+09:00"
  }, actor, {
    ...preTool,
    hook_event_name: "PostToolUse"
  });
  assert.strictEqual(postTool.status, "active");
  assert.strictEqual(postTool.checkpoint.repository_state.dirty, true);
  sessionStart({
    ...repositoryOptions,
    now: "2026-07-23T04:33:20+09:00"
  }, actor, {
    hook_event_name: "SessionStart",
    source: "resume",
    session_id: "session-dirty"
  });
  const next = resumeLease({
    ...repositoryOptions,
    now: "2026-07-23T04:33:30+09:00"
  }, initial.lease.id, {
    sessionId: "session-dirty",
    providerAgentId: "main"
  });
  assert.strictEqual(next.status, "active");
  assert.strictEqual(next.lease.initial_repository_state.dirty, true);
  revokeLease({
    ...repositoryOptions,
    now: "2026-07-23T04:33:40+09:00"
  }, next.lease.id, "FIXTURE_COMPLETE");
});

fixture("repository namespace substitution cannot reuse another repository lease", () => {
  expectThrow(() => dispatchStatus({
    repository: repositoryB,
    artifactRoot
  }), /namespace|Artifact|artifact/i);
});

fixture("Codex and Claude adapters emit native fail-closed outputs", () => {
  const codex = denyPayload("codex", ["LEASE_NOT_FOUND"]);
  assert.strictEqual(codex.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.strictEqual(codex.hookSpecificOutput.permissionDecision, "deny");
  const claude = denyPayload("claude_code", ["LEASE_EXPIRED"]);
  assert.strictEqual(claude.hookSpecificOutput.permissionDecision, "deny");
  assert.strictEqual(postFailurePayload("codex", ["CHECKPOINT_FAILED"]).continue, false);
  assert.strictEqual(postFailurePayload("claude_code", ["CHECKPOINT_FAILED"]).decision, "block");
  assert.strictEqual(sessionPayload("codex", {
    status: "blocked",
    execution_authorized: false,
    reason_codes: ["FRESH_LEASE_REQUIRED"]
  }).hookSpecificOutput.hookEventName, "SessionStart");
});

fixture("malformed and unsupported hook input fails before tool admission", () => {
  const malformed = spawnSync(process.execPath, [
    path.join(ROOT, "dispatch-hook-adapter.js"),
    "--provider",
    "codex"
  ], {
    cwd: ROOT,
    encoding: "utf8",
    input: "{"
  });
  assert.strictEqual(malformed.status, 2);
  assert.match(malformed.stderr, /before event classification/);

  const unsupported = spawnSync(process.execPath, [
    path.join(ROOT, "dispatch-hook-adapter.js"),
    "--provider",
    "codex"
  ], {
    cwd: ROOT,
    encoding: "utf8",
    input: JSON.stringify({
      session_id: "unsupported-session",
      cwd: repositoryA,
      hook_event_name: "UnknownEvent"
    }),
    env: {
      ...process.env,
      CANNAE_REPOSITORY: repositoryA,
      CANNAE_ARTIFACT_ROOT: artifactRoot,
      CANNAE_MISSION_ID: plan.mission_id,
      CANNAE_WAVE_ID: plan.wave_id,
      CANNAE_AGENT_ID: "plans-agent",
      CANNAE_PROVIDER_AGENT_ID: "main"
    }
  });
  assert.strictEqual(unsupported.status, 2);
  assert.match(unsupported.stderr, /Unsupported hook event/);
});

fixture("hook installer preserves project configuration and registers lifecycle events", () => {
  const hookRepo = path.join(temporaryRoot, "hook-config");
  fs.mkdirSync(path.join(hookRepo, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(hookRepo, ".claude", "settings.json"), `${JSON.stringify({ model: "existing" })}\n`);
  const claude = configureProvider(hookRepo, "claude_code", { dryRun: true });
  assert.strictEqual(claude.config.model, "existing");
  assert(claude.config.hooks.PreToolUse.length === 1);
  assert(claude.config.hooks.PostToolUseFailure.length === 1);
  const codex = configureProvider(hookRepo, "codex", { dryRun: true });
  assert(codex.config.hooks.SessionStart.length === 1);
  assert(codex.config.hooks.PostToolUse.length === 1);
  assert.strictEqual(codex.config.hooks.PreToolUse[0].matcher, "*");
  assert.strictEqual(claude.config.hooks.PreToolUse[0].matcher, "*");
});

async function main() {
  let passed = 0;
  for (const item of fixtures) {
    try {
      await item.fn();
      passed += 1;
      console.log(`PASS ${item.name}`);
    } catch (error) {
      console.error(`FAIL ${item.name}: ${error.stack || error.message}`);
      process.exitCode = 1;
      break;
    }
  }

  if (!process.exitCode) {
    console.log(`Dispatch runtime fixtures: ${passed}/${fixtures.length} passed`);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
