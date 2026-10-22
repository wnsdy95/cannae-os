#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const artifacts = require("./repository-artifact-store"), write = artifacts.writeRepositoryArtifact;
let beforeWrite, afterWrite;
artifacts.writeRepositoryArtifact = options => {
  if (beforeWrite) beforeWrite(options);
  const result = write(options);
  if (afterWrite) afterWrite(options);
  return result;
};
const s = require("./disciplined-initiative-fixtures/support"), { openWave, terminateWave } = require("./skill-mission-controller");
const { spawnSync } = require("node:child_process");
const contract = require("./dispatch-issuance-contract"), { validatePayload } = require("./validator-cli-prototype/validate");
const roots = [], selected = process.argv.find(value => value.startsWith("--case="))?.slice(7);
let passed = 0;
function check(name, callback) {
  if (selected && selected !== name) return;
  beforeWrite = afterWrite = null;
  try { callback(); passed++; console.log(`PASS ${name}`); }
  finally { beforeWrite = afterWrite = null; }
}
function environment(ready = true, epoch) {
  const env = s.environment(epoch); roots.push(env.root);
  if (ready) s.start(env);
  return env;
}
function readFirst(env) {
  assert.equal(s.admit(env, s.inputs.planned, "first-actual-read", 100).decision, "allow");
  s.complete(env, s.inputs.planned, "first-actual-read", 101);
  s.dispatch.interruptLease(s.optionsAt(env, 110), env.leaseId);
}
function inject(phase) {
  const matches = options => phase === "after-request" ? options.kind === contract.REQUESTS :
    phase === "before-supersession" ? options.payload.checkpoint_kind === "supersession" :
      phase === "before-lease" ? options.kind === "agent-dispatch-leases" :
        phase === "before-baseline" ? options.payload.checkpoint_kind === "baseline" :
          options.kind === contract.RESOLUTIONS && options.payload.outcome === "committed";
  const interrupt = options => {
    if (!matches(options)) return;
    beforeWrite = afterWrite = null;
    throw new Error("Synthetic issuance interruption");
  };
  if (phase === "after-request") afterWrite = interrupt;
  else beforeWrite = interrupt;
}
function pending(env) {
  const status = s.dispatch.dispatchStatus(env.options);
  assert.equal(status.unresolved_issuances.length, 1);
  const row = status.unresolved_issuances[0];
  return { row, request: s.read(env, row.issuance_ref), status };
}
function publish(env, kind, value) {
  return artifacts.writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
    missionId: value.mission_id, waveId: value.wave_id, kind, artifactId: value.id, payload: value,
    createdAt: value.recorded_at || value.issued_at });
}
function interruptedResume(env, phase) {
  readFirst(env); inject(phase);
  assert.throws(() => s.dispatch.resumeLease(s.optionsAt(env, 120), env.leaseId, { sessionId: "observed-next-session", providerAgentId: "main" }), /Synthetic issuance interruption/);
  return pending(env);
}
function completeResumed(env, issued) {
  env.actor = { ...env.actor, sessionId: "observed-next-session" }; env.leaseId = issued.lease.id;
  assert.equal(s.admit(env, s.inputs.safeguard, "second-actual-read", 130).decision, "allow");
  s.complete(env, s.inputs.safeguard, "second-actual-read", 131);
  assert.equal(s.dispatch.completeLease(s.optionsAt(env, 132), env.leaseId).status, "completed");
}
try {
  check("normal", () => {
    const env = environment(), issued = env.issued;
    assert.equal(issued.lease.schema_version, "0.2"); assert.equal(issued.execution_authorized, true);
    const status = s.dispatch.dispatchStatus(env.options); assert.equal(status.issuances.length, 1);
    assert.equal(status.issuances[0].status, "committed"); assert.equal(status.unresolved_issuances.length, 0);
    assert.equal(validatePayload(s.read(env, issued.issuance_ref), "dispatch-lease-issuance-request").can_execute, false);
    assert.equal(validatePayload(s.read(env, issued.resolution_ref), "dispatch-lease-issuance-resolution").can_execute, false);
    const retried = s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 90), issued.issuance_ref.artifact_id);
    assert.deepEqual(retried.lease_ref, issued.lease_ref); assert.equal(retried.lease.nonce, issued.lease.nonce);
    assert.throws(() => s.dispatch.cancelDispatchIssuance(s.optionsAt(env, 91), issued.issuance_ref.artifact_id, "Cannot cancel a committed grant."), /ALREADY_COMMITTED/);
    s.dispatch.revokeLease(s.optionsAt(env, 92), env.leaseId);
    assert.equal(s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 93), issued.issuance_ref.artifact_id).execution_authorized, false);
  });
  for (const phase of ["after-request", "before-supersession", "before-lease", "before-baseline", "before-resolution"]) {
    check(phase, () => {
      const env = environment(), state = interruptedResume(env, phase), { request, row } = state;
      assert.equal(s.dispatch.admitToolRequest(s.optionsAt(env, 121), env.actor,
        s.hook(env, s.inputs.safeguard, "must-not-execute")).decision, "deny");
      const nextActor = { ...env.actor, sessionId: request.planned_lease.session_binding.session_id };
      const nextDenied = s.dispatch.admitToolRequest(s.optionsAt(env, 121), nextActor,
        { ...s.hook(env, s.inputs.safeguard, "uncommitted-next-session"), session_id: nextActor.sessionId });
      assert.equal(nextDenied.decision, "deny"); assert(nextDenied.reason_codes.includes("DISPATCH_ISSUANCE_PENDING"));
      assert.throws(() => s.dispatch.completeLease(s.optionsAt(env, 121), env.leaseId), /DISPATCH_ISSUANCE_PENDING/);
      if (row.lease_published) {
        assert.throws(() => s.dispatch.completeLease(s.optionsAt(env, 121), row.planned_lease_id), /DISPATCH_ISSUANCE_PENDING/);
        assert.throws(() => s.dispatch.revokeLease(s.optionsAt(env, 121), row.planned_lease_id), /DISPATCH_ISSUANCE_PENDING/);
      }
      assert.throws(() => openWave(env.plan, s.optionsAt(env, 121)), /DISPATCH_ISSUANCE_PENDING/);
      assert.throws(() => s.dispatch.resumeLease(s.optionsAt(env, 121), env.leaseId,
        { sessionId: "replacement-binding", providerAgentId: "main" }), /DISPATCH_ISSUANCE_PENDING/);
      assert.equal(env.readCount, 1);
      const recovered = s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 122), row.issuance_ref.artifact_id);
      assert.equal(recovered.lease.id, request.planned_lease.id); assert.equal(recovered.lease.nonce, request.planned_lease.nonce);
      assert.equal(recovered.lease.issued_at, request.planned_lease.issued_at); assert.equal(recovered.lease.expires_at, request.planned_lease.expires_at);
      assert.equal(s.dispatch.dispatchStatus(env.options).leases.length, 2);
      assert.equal(s.dispatch.dispatchStatus(env.options).unresolved_issuances.length, 0);
      completeResumed(env, recovered); assert.equal(env.readCount, 2);
      const manifest = artifacts.verifyRepositoryArtifacts({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot });
      const retried = s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 133), row.issuance_ref.artifact_id);
      assert.equal(retried.execution_authorized, false); assert.deepEqual(retried.resolution_ref, recovered.resolution_ref);
      assert.equal(artifacts.verifyRepositoryArtifacts({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot }).manifest_sha256, manifest.manifest_sha256);
    });
  }
  check("initial-baseline-interruption", () => {
    const env = environment(false); inject("before-baseline");
    assert.throws(() => s.start(env), /Synthetic issuance interruption/);
    const { row, request } = pending(env);
    assert.equal(row.lease_published, true); assert.equal(row.baseline_published, false);
    const recovered = s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 90), row.issuance_ref.artifact_id);
    assert.equal(recovered.lease.id, request.planned_lease.id); assert.equal(recovered.lease.nonce, request.planned_lease.nonce);
    assert.equal(s.dispatch.dispatchStatus(env.options).leases.length, 1);
    s.dispatch.revokeLease(s.optionsAt(env, 91), recovered.lease.id);
  });
  for (const phase of ["before-lease", "before-resolution"]) {
    check(`cancel-${phase}`, () => {
      const env = environment(), { row } = interruptedResume(env, phase), old = env.leaseId;
      const cancelled = s.dispatch.cancelDispatchIssuance(s.optionsAt(env, 122), row.issuance_ref.artifact_id, "Cancel this unused frozen successor.");
      assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.execution_authorized, false);
      const status = s.dispatch.dispatchStatus(env.options);
      assert.equal(status.unresolved_issuances.length, 0); assert.equal(status.leases.length, 1);
      assert.equal(status.leases[0].lease_id, old); assert.equal(status.leases[0].status, "superseded");
      assert.equal(s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 123), row.issuance_ref.artifact_id).status, "cancelled");
      assert.throws(() => s.dispatch.cancelDispatchIssuance(s.optionsAt(env, 124), row.issuance_ref.artifact_id, "Different request."), /CANCELLATION_CONFLICT/);
      assert.throws(() => s.dispatch.resumeLease(s.optionsAt(env, 125), old, { sessionId: "fresh-nonce-attempt", providerAgentId: "main" }), /Only an interrupted lease/);
      assert.equal(env.readCount, 1);
    });
  }
  check("repository-drift", () => {
    const env = environment(), { row } = interruptedResume(env, "before-baseline");
    fs.appendFileSync(path.join(env.options.repository, "README.md"), "Synthetic external drift.\n");
    assert.throws(() => s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 122), row.issuance_ref.artifact_id), /REPOSITORY_DRIFT/);
    assert.equal(pending(env).row.baseline_published, false);
    assert.equal(s.dispatch.cancelDispatchIssuance(s.optionsAt(env, 123), row.issuance_ref.artifact_id, "Preserve drift and cancel unused authority.").execution_authorized, false);
    assert.equal(env.readCount, 1);
  });
  check("expired-recovery", () => {
    const env = environment(), { row, request } = interruptedResume(env, "before-baseline"), options = { ...env.options, now: request.expires_at };
    assert.throws(() => s.dispatch.recoverDispatchIssuance(options, row.issuance_ref.artifact_id), /ISSUANCE_EXPIRED/);
    assert.equal(pending(env).row.baseline_published, false);
    assert.equal(s.dispatch.cancelDispatchIssuance(options, row.issuance_ref.artifact_id, "Cancel an expired unused issuance.").execution_authorized, false);
    assert.equal(env.readCount, 1);
  });
  check("predecessor-revocation", () => {
    const env = environment(), { row } = interruptedResume(env, "after-request");
    assert.equal(s.dispatch.revokeLease(s.optionsAt(env, 121), env.leaseId).status, "revoked");
    assert.throws(() => s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 122), row.issuance_ref.artifact_id), /PREDECESSOR_CHANGED/);
    assert.equal(s.dispatch.cancelDispatchIssuance(s.optionsAt(env, 123), row.issuance_ref.artifact_id, "Keep the predecessor revoked.").execution_authorized, false);
    assert.equal(s.dispatch.dispatchStatus(env.options).leases[0].status, "revoked");
  });
  check("legacy-downgrade", () => {
    const env = environment(), payload = structuredClone(env.issued.lease);
    payload.schema_version = "0.1"; delete payload.issuance_ref; payload.id = "ADL-SYNTHETIC-LEGACY-DOWNGRADE";
    payload.session_binding.session_id = "unadmitted-legacy-session";
    assert.equal(validatePayload(payload, "agent-dispatch-lease").valid, true);
    const put = (kind, value, time) => {
      const result = artifacts.writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
        missionId: value.mission_id, waveId: value.wave_id, kind, artifactId: value.id, payload: value, createdAt: time });
      return { artifact_id: value.id, relative_path: result.relative_path, sha256: result.sha256 };
    };
    const reference = put("agent-dispatch-leases", payload, payload.issued_at), checkpoint = structuredClone(env.issued.checkpoint);
    checkpoint.id = `AEC-${crypto.createHash("sha256").update(`${payload.id}\0${0}\0baseline`).digest("hex").slice(0, 24)}`;
    checkpoint.lease_ref = reference; checkpoint.session_binding = payload.session_binding;
    put("agent-execution-checkpoints", checkpoint, checkpoint.recorded_at);
    const actor = { ...env.actor, sessionId: payload.session_binding.session_id };
    assert.equal(s.dispatch.activeLease(s.optionsAt(env, 100), actor).code, "LEGACY_LEASE_RESULT_ONLY");
    const denied = s.dispatch.admitToolRequest(s.optionsAt(env, 100), actor,
      { ...s.hook(env, s.inputs.planned, "legacy-downgrade"), session_id: actor.sessionId });
    assert.equal(denied.decision, "deny"); assert(denied.reason_codes.includes("LEGACY_LEASE_RESULT_ONLY")); assert.equal(env.readCount, 0);
  });
  check("pending-termination", () => {
    const env = environment(), { row } = interruptedResume(env, "before-baseline");
    const retained = require("./method-deviation-gate").load(env.options);
    const options = { ...env.options, now: new Date(Math.max(Date.parse(env.plan.valid_until),
      ...retained.manifest.artifacts.map(entry => Date.parse(entry.created_at))) + 1000).toISOString() };
    const request = { schema_version: "0.1", type: "MissionWaveTerminationRequest", mission_id: env.plan.mission_id, wave_id: env.plan.wave_id,
      status: "expired", reason: "Do not hide unused partial issuance.", plan_ref: env.opened.plan_ref,
      successor_plan_ref: s.dispatch.NONE_REF, decision_ref: s.dispatch.NONE_REF };
    assert.throws(() => terminateWave(request, options), /DISPATCH_ISSUANCE_PENDING/);
    s.dispatch.cancelDispatchIssuance(options, row.issuance_ref.artifact_id, "Cancel unused authority before terminal review.");
    const result = terminateWave(request, options);
    assert.equal(result.status, "expired"); assert.equal(s.read(env, result.termination_ref).execution_completion_claimed, false);
    assert.equal(result.continuation_authorized, false); assert.equal(env.readCount, 1);
  });
  check("operator-cli-retained", () => {
    const base = require("./order-adoption-fixtures/support"), env = base.environment(); roots.push(env.root);
    const commands = ["node dispatch-runtime-controller.js recover-issuance --repository . --issuance DLI-OTHER",
      "node 'codex-skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js' cancel-issuance --repository . --issuance DLI-OTHER --reason cancel",
      "node .claude/skills/controls-doctrine-operator/scripts/operate_dispatch_runtime.js issue --repository . --policy-id DTP-OTHER --session replacement"];
    env.policies[0].tool_rules[0].input_match.allowed_sha256 = commands.map(command => s.dispatch.inputDigest({ command }));
    env.plan.dispatch_control.policy_authorizations = env.policies.map(policy => ({ agent_id: policy.agent_id, provider: policy.provider,
      policy_id: policy.id, draft_sha256: s.dispatch.inputDigest(policy) }));
    base.adopt(env); openWave(env.plan, base.optionsAt(env, 70));
    const policy = env.policies[0]; s.dispatch.authorizeDispatchPolicy(base.optionsAt(env, 80), policy);
    s.dispatch.issueLease(base.optionsAt(env, 80), policy.id, { sessionId: "executor-session", providerAgentId: "main" });
    const actor = { missionId: env.plan.mission_id, waveId: env.plan.wave_id, agentId: policy.agent_id, provider: policy.provider,
      sessionId: "executor-session", providerAgentId: "main" };
    for (const [index, command] of commands.entries()) {
      const denied = s.dispatch.admitToolRequest(base.optionsAt(env, 100), actor, { hook_event_name: "PreToolUse", session_id: actor.sessionId,
        tool_name: "Bash", tool_use_id: `operator-cli-${index}`, tool_input: { command } });
      assert.equal(denied.decision, "deny"); assert(denied.reason_codes.includes("RETAINED_ACTION_BLOCKED"));
    }
  });
  check("both-cli-wrappers", () => {
    const env = environment(), before = s.dispatch.dispatchStatus(env.options).artifact_store.manifest_sha256;
    for (const directory of ["codex-skills", ".claude/skills"]) {
      const wrapper = path.join(__dirname, directory, "controls-doctrine-operator/scripts/operate_dispatch_runtime.js");
      const args = [wrapper, "recover-issuance", "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot,
        "--issuance", env.issued.issuance_ref.artifact_id];
      const options = { cwd: env.root, encoding: "utf8", env: { ...process.env, CANNAE_OS_HOME: __dirname } };
      const result = spawnSync(process.execPath, args, options);
      assert.equal(result.status, 0, result.stderr); const value = JSON.parse(result.stdout);
      assert.equal(value.status, "committed"); assert.equal(value.execution_authorized, false);
      assert.deepEqual(value.lease_ref, env.issued.lease_ref);
      for (const extra of [["--session", "replacement"], ["--at", new Date().toISOString()], ["--role", "USER"],
        ["--issuance", env.issued.issuance_ref.artifact_id]]) assert.notEqual(spawnSync(process.execPath, [...args, ...extra], options).status, 0);
    }
    assert.equal(s.dispatch.dispatchStatus(env.options).artifact_store.manifest_sha256, before);
  });
  check("stop-at-commit-publication", () => {
    const env = environment(true, Date.now()); readFirst(env);
    const identity = artifacts.resolveRepository(env.options.repository), campaign = s.sample("self-improvement-campaign");
    Object.assign(campaign, { id: "SIC-ISSUANCE-STOP", mission_id: env.plan.mission_id, created_at: s.optionsAt(env, 111).now,
      repository_binding: { repository_key: identity.key, identity_fingerprint: identity.identity_fingerprint, baseline_revision: identity.head_commit } });
    const campaignRef = s.persist(env, "self-improvement-campaigns", campaign, 111);
    const stop = require("./campaign-stop-controller"), request = { schema_version: "0.1", type: "CampaignStopRequest",
      mission_id: env.plan.mission_id, campaign_ref: campaignRef, decision_ref: s.dispatch.NONE_REF,
      reason: "Synthetic USER stop during issuance; do not revive authority." };
    const decision = { ...s.sample("decision-log"), id: "DL-ISSUANCE-STOP", mission_id: env.plan.mission_id,
      decision_maker: "USER", decision_type: "scope", status: "complete", decided_at: s.optionsAt(env, 113).now,
      authority_basis: { basis_type: "retained_authority", reference: campaign.id, summary: "Synthetic exact stop fixture, not an authenticated human ceremony." },
      chosen_option: stop.stopDecisionOption(request), options_considered: [stop.stopDecisionOption(request)], affected_artifacts: [campaignRef.relative_path] };
    request.decision_ref = s.persist(env, "decision-logs", decision, 113);
    beforeWrite = options => {
      if (options.kind !== contract.RESOLUTIONS || options.payload.outcome !== "committed") return;
      beforeWrite = null; stop.stopCampaign(request, s.optionsAt(env, 121));
    };
    assert.throws(() => s.dispatch.resumeLease(s.optionsAt(env, 120), env.leaseId,
      { sessionId: "observed-next-session", providerAgentId: "main" }), /DISPATCH_ISSUANCE_STATE_CHANGED/);
    const state = pending(env); assert.equal(state.row.baseline_published, true);
    assert.throws(() => s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 122), state.row.issuance_ref.artifact_id), /CAMPAIGN_CONTINUATION_BLOCKED/);
    assert.equal(s.dispatch.cancelDispatchIssuance(s.optionsAt(env, 123), state.row.issuance_ref.artifact_id, "Preserve the real stop and cancel unused issuance.").execution_authorized, false);
    assert.equal(stop.campaignStopStatus(env.options, env.plan.mission_id).status, "stop_requested"); assert.equal(env.readCount, 1);
  });
  check("schema-valid-lease-substitution", () => {
    const env = environment(), { row, request } = interruptedResume(env, "before-lease");
    const changed = contract.leaseForRequest({ payload: request, ref: row.issuance_ref });
    changed.nonce = "0".repeat(64);
    assert.equal(validatePayload(changed, "agent-dispatch-lease").valid, true);
    publish(env, "agent-dispatch-leases", changed);
    assert.throws(() => s.dispatch.dispatchStatus(env.options), /DISPATCH_ISSUANCE_LEASE_SUBSTITUTED/);
    assert.throws(() => s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 122), request.id), /DISPATCH_ISSUANCE_LEASE_SUBSTITUTED/);
    assert.equal(env.readCount, 1);
  });
  check("schema-valid-incomplete-commit", () => {
    const env = environment(), { row, request } = interruptedResume(env, "before-baseline");
    const changed = contract.identified("DispatchLeaseIssuanceResolution", { mission_id: request.mission_id, wave_id: request.wave_id,
      agent_id: request.agent_id, request_ref: row.issuance_ref, outcome: "committed", lease_ref: row.lease_ref,
      baseline_ref: row.issuance_ref, supersession_ref: row.supersession_ref,
      reason: "Synthetic schema-valid substituted baseline, not authority.", recorded_at: s.optionsAt(env, 121).now });
    assert.equal(validatePayload(changed, "dispatch-lease-issuance-resolution").valid, true);
    publish(env, contract.RESOLUTIONS, changed);
    assert.throws(() => s.dispatch.dispatchStatus(env.options), /DISPATCH_ISSUANCE_RESOLUTION_SUBSTITUTED/);
    assert.throws(() => s.dispatch.completeLease(s.optionsAt(env, 122), row.planned_lease_id), /DISPATCH_ISSUANCE_RESOLUTION_SUBSTITUTED/);
    assert.equal(env.readCount, 1);
  });
  check("schema-valid-introduction-substitution", () => {
    const env = environment(), { request } = interruptedResume(env, "after-request");
    const { id: _oldId, ...body } = request;
    body.observed_manifest = { ...body.observed_manifest, sha256: "0".repeat(64) };
    const changed = contract.identified("DispatchLeaseIssuanceRequest", body);
    assert.equal(validatePayload(changed, "dispatch-lease-issuance-request").valid, true);
    publish(env, contract.REQUESTS, changed);
    assert.throws(() => s.dispatch.dispatchStatus(env.options), /DISPATCH_ISSUANCE_INTRODUCTION_INVALID/);
    assert.equal(env.readCount, 1);
  });
  for (const stage of ["prepared", "artifact_written", "history_created", "manifest_committed"]) {
    check(`store-journal-${stage}`, () => {
      const env = environment(); readFirst(env);
      beforeWrite = options => {
        if (options.kind !== "agent-dispatch-leases") return;
        beforeWrite = null; options.faultInjectionStage = stage;
      };
      assert.throws(() => s.dispatch.resumeLease(s.optionsAt(env, 120), env.leaseId,
        { sessionId: "observed-next-session", providerAgentId: "main" }), /Injected artifact transaction failure/);
      const options = { repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot };
      const interrupted = artifacts.verifyRepositoryArtifacts(options); assert.equal(interrupted.valid, false);
      assert(interrupted.issues.some(item => item.code === "PENDING_TRANSACTION"));
      assert.throws(() => s.dispatch.dispatchStatus(env.options), /PENDING_TRANSACTION/);
      const repaired = artifacts.verifyRepositoryArtifacts({ ...options, recover: true });
      assert.equal(repaired.valid, true, JSON.stringify(repaired)); assert.equal(repaired.recovered_transactions.length, 1);
      const { row, request } = pending(env);
      const recovered = s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 122), row.issuance_ref.artifact_id);
      assert.equal(recovered.lease.id, request.planned_lease.id); assert.equal(recovered.lease.nonce, request.planned_lease.nonce);
      assert.equal(recovered.lease.expires_at, request.expires_at); completeResumed(env, recovered); assert.equal(env.readCount, 2);
    });
  }
  check("concurrent-initial-issuance", () => {
    const base = require("./order-adoption-fixtures/support"), env = base.environment(Date.now() - 90000); roots.push(env.root);
    base.adopt(env); openWave(env.plan, base.optionsAt(env, 70));
    const policy = env.policies[0]; s.dispatch.authorizeDispatchPolicy(base.optionsAt(env, 80), policy);
    const input = { root: __dirname, repository: env.options.repository, artifactRoot: env.options.artifactRoot, policyId: policy.id };
    const code = `(async () => {
      const { spawn } = require("node:child_process"), path = require("node:path"), input = JSON.parse(process.argv[1]);
      const children = [], completions = [];
      try {
        for (const session of ["race-left", "race-right"]) {
          const child = spawn(process.execPath, [path.join(input.root, "dispatch-runtime-controller.js"), "issue", "--repository", input.repository,
            "--artifact-root", input.artifactRoot, "--policy-id", input.policyId, "--session", session], { cwd: input.root, shell: false });
          children.push(child);
          completions.push(new Promise((resolve, reject) => {
            let stdout = "", stderr = ""; const timer = setTimeout(() => child.kill("SIGTERM"), 60000);
            child.stdout.on("data", data => { stdout += data; }); child.stderr.on("data", data => { stderr += data; });
            child.on("error", reject); child.on("close", (exit_code, signal) => { clearTimeout(timer); resolve({ exit_code, signal, stdout, stderr, exit_confirmed: true }); });
          }));
        }
        console.log(JSON.stringify(await Promise.all(completions)));
      } finally {
        for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
        await Promise.allSettled(completions);
      }
    })().catch(error => { console.error(error.stack); process.exitCode = 1; });`;
    const result = spawnSync(process.execPath, ["-e", code, JSON.stringify(input)], { cwd: env.root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr); const rows = JSON.parse(result.stdout);
    assert(rows.every(row => row.exit_confirmed)); assert.equal(rows.filter(row => row.exit_code === 0).length, 1);
    assert.equal(rows.filter(row => row.exit_code !== 0).length, 1);
    const status = s.dispatch.dispatchStatus(env.options);
    assert.equal(status.leases.length, 1); assert.equal(status.issuances.length, 1); assert.equal(status.issuances[0].status, "committed");
    assert.equal(status.unresolved_issuances.length, 0);
  });
  assert(passed > 0, "The selected fixture must exist.");
  console.log(JSON.stringify({ total: passed, passed, failed: 0, scope: "Actual local issuance and task consumers over synthetic repositories; no native agent, protected deployment or overall completion claim." }, null, 2));
} finally {
  beforeWrite = afterWrite = null;
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}
