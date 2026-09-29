#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const artifacts = require("./repository-artifact-store");
const originalWrite = artifacts.writeRepositoryArtifact;
let beforePublication = null;
artifacts.writeRepositoryArtifact = options => {
  if (beforePublication) beforePublication(options);
  return originalWrite(options);
};
const { stopCampaign, stopDecisionOption } = require("./campaign-stop-controller");
const { reconcileCampaignTerminal } = require("./campaign-terminal-controller");
const { proposeCampaignSuccessor, activateCampaignSuccessor, campaignSuccessorStatus, successorDecisionOption } = require("./campaign-successor-controller");
const { superviseCampaign } = require("./campaign-supervisor");
const { openWave } = require("./skill-mission-controller");
const { computeRepositoryState } = require("./verification-runner");
const runtime = require("./dispatch-runtime-controller");
const NONE = { artifact_id: "none", relative_path: "none", sha256: "none" };
const roots = [];
let passed = 0;
const sample = name => JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", `valid-${name}.json`), "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function git(repository, ...args) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
}
function persist(env, payload, kind, wave = "C0", time = env.options.now) {
  const result = artifacts.writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
    missionId: env.campaign.mission_id, waveId: wave, kind, artifactId: payload.id, payload, createdAt: time });
  return { artifact_id: payload.id, relative_path: result.relative_path, sha256: result.sha256 };
}
function stop(env, campaign = env.campaign, campaignRef = env.campaignRef) {
  const request = { schema_version: "0.1", type: "CampaignStopRequest", mission_id: campaign.mission_id,
    campaign_ref: campaignRef, decision_ref: NONE, reason: "Synthetic USER stop for successor tests." };
  const decision = sample("decision-log");
  Object.assign(decision, { id: `DL-Stop-${campaign.id}`, mission_id: campaign.mission_id, decided_at: env.options.now,
    decision_maker: "USER", decision_type: "scope", status: "complete", chosen_option: stopDecisionOption(request),
    authority_basis: { basis_type: "retained_authority", reference: campaign.id, summary: "Synthetic fixture consent only." },
    affected_artifacts: [campaignRef.relative_path] });
  decision.options_considered = [decision.chosen_option];
  request.decision_ref = persist(env, decision, "decision-logs");
  return stopCampaign(request, env.options).record_ref;
}
function environment(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-successor-")); roots.push(root);
  const repository = path.join(root, "repo"); fs.mkdirSync(repository);
  git(repository, "init", "-q"); git(repository, "config", "user.name", "Fixture"); git(repository, "config", "user.email", "fixture@example.com");
  fs.writeFileSync(path.join(repository, "README.md"), "Successor fixture\n");
  git(repository, "add", "README.md"); git(repository, "commit", "-qm", "fixture");
  const identity = artifacts.resolveRepository(repository);
  const now = new Date().toISOString();
  const options = { repository, artifactRoot: path.join(root, "artifacts"), doctrineRoot: __dirname, now };
  const campaign = sample("self-improvement-campaign");
  Object.assign(campaign, { id: `SIC-${name}`, mission_id: `MIS-${name}`, created_at: new Date(Date.parse(now) - 60000).toISOString(),
    repository_binding: { repository_key: identity.key, identity_fingerprint: identity.identity_fingerprint, baseline_revision: identity.head_commit } });
  const env = { root, options, campaign };
  env.campaignRef = persist(env, campaign, "self-improvement-campaigns", "C0", campaign.created_at);
  const stopRef = stop(env);
  env.terminalRequest = { schema_version: "0.1", type: "CampaignTerminalRequest", mission_id: campaign.mission_id,
    campaign_ref: env.campaignRef, stop_ref: stopRef };
  env.terminal = reconcileCampaignTerminal(env.terminalRequest, options);
  env.successor = { ...clone(campaign), id: `${campaign.id}-Next`, created_at: now };
  env.proposalRequest = { schema_version: "0.1", type: "CampaignSuccessorProposalRequest", mission_id: campaign.mission_id,
    terminal_ref: env.terminal.record_ref, successor_campaign: env.successor, repository_state: computeRepositoryState(repository) };
  return env;
}
function propose(env) {
  env.proposed = proposeCampaignSuccessor(env.proposalRequest, env.options);
  env.request = { schema_version: "0.1", type: "CampaignSuccessorActivationRequest", mission_id: env.campaign.mission_id,
    proposal_ref: env.proposed.proposal_ref, decision_ref: NONE };
}
function consent(env, mutate = () => {}) {
  const decision = sample("decision-log");
  Object.assign(decision, { id: `DL-Activate-${env.successor.id}`, mission_id: env.campaign.mission_id, decided_at: env.options.now,
    decision_maker: "USER", decision_type: "scope", status: "complete", chosen_option: successorDecisionOption(env.request),
    authority_basis: { basis_type: "retained_authority", reference: env.campaign.id, summary: "Synthetic exact activation consent." },
    affected_artifacts: [env.proposed.proposal_ref.relative_path, env.terminal.record_ref.relative_path] });
  decision.options_considered = [decision.chosen_option]; mutate(decision);
  env.request.decision_ref = persist(env, decision, "decision-logs");
}
function manifest(env) { return JSON.parse(fs.readFileSync(path.join(env.options.artifactRoot, "repositories", artifacts.resolveRepository(env.options.repository).key, "manifest.json"), "utf8")); }
function supervisor(env, campaign = env.successor) {
  return superviseCampaign({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
    campaignId: campaign.id, evaluatedAt: env.options.now }).order;
}
function wave(env, adaptive = true, campaign = env.successor) {
  const plan = sample("mission-wave-plan");
  Object.assign(plan, { id: "MWP-Successor", mission_id: env.campaign.mission_id, wave_id: "W1",
    created_at: env.options.now, valid_until: new Date(Date.parse(env.options.now) + 3600000).toISOString() });
  Object.assign(plan.adaptive_work, { enabled: adaptive, campaign_id: campaign.id });
  return plan;
}
try {
  for (const tree of ["codex-skills", ".claude/skills"]) check(`${tree} routes successor commands and natural-language requests`, () => {
    const script = path.join(__dirname, tree, "controls-doctrine-operator/scripts/route_controls_docs.js");
    for (const query of ["campaign successor admission", "successor proposal", "activate_controls_successor", "campaign-successor-controller.js"]) {
      const result = spawnSync(process.execPath, [script, "--actor=user", query, __dirname], { cwd: os.tmpdir(), encoding: "utf8" });
      assert.strictEqual(result.status, 0, result.stderr);
      const routed = JSON.parse(result.stdout);
      assert.strictEqual(routed.capability_routing.status, "covered");
      assert(routed.recommended_documents.some(item => item.path === "docs/campaign-successor-admission.md"));
      assert(routed.validation_commands.includes("node run-campaign-successor-fixtures.js"));
    }
  });
  check("exact consent admits only the selected successor to ordinary supervisor and routing gates", () => {
    const env = environment("Ready"); propose(env); consent(env);
    const result = activateCampaignSuccessor(env.request, env.options);
    assert.strictEqual(result.admission.successor_admitted, true);
    assert.strictEqual(result.execution_authorized, false);
    assert.strictEqual(result.release_authorized, false);
    assert.strictEqual(supervisor(env).status, "ready");
    assert.strictEqual(supervisor(env, env.campaign).execution_authorized, false);
    assert.strictEqual(campaignSuccessorStatus(env.options, env.campaign.mission_id, env.successor.id).stop_fence_satisfied, true);
    assert.strictEqual(activateCampaignSuccessor(env.request, env.options).existing, true);
    assert.throws(() => openWave(wave(env, false), env.options), /CAMPAIGN_CONTINUATION_BLOCKED/);
    assert.strictEqual(openWave(wave(env), env.options).status, "ready");
    assert.strictEqual(activateCampaignSuccessor(env.request, env.options).existing, true);
  });
  check("a decision option is not consent and a terminal record is not admission", () => {
    const env = environment("No-Consent"); propose(env);
    assert(successorDecisionOption(env.request).startsWith("activate-successor:"));
    assert.throws(() => activateCampaignSuccessor(env.request, env.options), /REFERENCE/);
    assert.strictEqual(campaignSuccessorStatus(env.options, env.campaign.mission_id, env.successor.id).successor_admitted, false);
  });
  check("terminal, mission and proposal references cannot be substituted", () => {
    const env = environment("References");
    assert.throws(() => proposeCampaignSuccessor({ ...env.proposalRequest,
      terminal_ref: { ...env.terminal.record_ref, sha256: "f".repeat(64) } }, env.options), /REFERENCE/);
    assert.throws(() => proposeCampaignSuccessor({ ...env.proposalRequest, mission_id: "MIS-Other",
      successor_campaign: { ...env.successor, mission_id: "MIS-Other" } }, env.options), /TERMINAL_SCOPE_MISMATCH/);
    propose(env); consent(env);
    assert.throws(() => activateCampaignSuccessor({ ...env.request, mission_id: "MIS-Other" }, env.options), /IDENTITY_MISMATCH/);
  });
  for (const mutation of ["actor", "scope", "option", "affected", "future", "stale"]) check(`reject ${mutation} USER decision`, () => {
    const env = environment(`Decision-${mutation}`); propose(env);
    consent(env, value => {
      if (mutation === "actor") value.decision_maker = "S3";
      if (mutation === "scope") value.authority_basis.reference = "SIC-Other";
      if (mutation === "option") { value.chosen_option = "activate-generic"; value.options_considered = [value.chosen_option]; }
      if (mutation === "affected") value.affected_artifacts = [env.proposed.proposal_ref.relative_path];
      if (mutation === "future") value.decided_at = new Date(Date.parse(env.options.now) + 1000).toISOString();
      if (mutation === "stale") value.decided_at = new Date(Date.parse(env.options.now) - 3600000).toISOString();
    });
    assert.throws(() => activateCampaignSuccessor(env.request, env.options), /USER_DECISION_REQUIRED/);
  });
  check("proposal expiry never silently renews candidate time or consent", () => {
    const env = environment("Expired"); propose(env); consent(env);
    env.options.now = env.proposed.proposal.expires_at;
    assert.throws(() => activateCampaignSuccessor(env.request, env.options), /PROPOSAL_EXPIRED/);
    const same = proposeCampaignSuccessor(env.proposalRequest, env.options);
    assert.strictEqual(same.existing, true);
    assert.strictEqual(same.proposal.expires_at, env.proposed.proposal.expires_at);
  });
  for (const phase of ["proposal", "activation"]) check(`repository drift blocks ${phase}`, () => {
    const env = environment(`Drift-${phase}`);
    if (phase === "activation") { propose(env); consent(env); }
    fs.appendFileSync(path.join(env.options.repository, "README.md"), "Unexpected change\n");
    assert.throws(() => phase === "proposal" ? propose(env) : activateCampaignSuccessor(env.request, env.options), /REPOSITORY_CHANGED/);
  });
  check("unexpected retained history needs a new terminal/proposal/decision", () => {
    const env = environment("History"); propose(env); consent(env);
    persist(env, { id: "NOTE-Extra", note: "Not part of the activation ceremony." }, "notes");
    assert.throws(() => activateCampaignSuccessor(env.request, env.options), /UNEXPECTED_HISTORY/);
  });
  check("a superseding USER decision cancels a pending ceremony before candidate publication", () => {
    const env = environment("Cancelled-Proposal"); propose(env); consent(env);
    const decision = sample("decision-log");
    Object.assign(decision, { id: "DL-Cancel-Proposal", mission_id: env.campaign.mission_id, decided_at: env.options.now,
      decision_maker: "USER", decision_type: "scope", status: "complete", chosen_option: "reject-successor",
      options_considered: ["reject-successor"], affected_artifacts: [env.proposed.proposal_ref.relative_path],
      authority_basis: { basis_type: "retained_authority", reference: env.campaign.id, summary: "Synthetic USER cancellation." } });
    persist(env, decision, "decision-logs");
    assert.throws(() => activateCampaignSuccessor(env.request, env.options), /UNEXPECTED_HISTORY/);
    assert.strictEqual(campaignSuccessorStatus(env.options, env.campaign.mission_id, env.successor.id).status, "not_published");
  });
  check("candidate substitution cannot use a valid approval", () => {
    const env = environment("Substitution"); propose(env); consent(env);
    persist(env, { ...clone(env.successor), objective: { ...env.successor.objective, intent: "Changed scope" } }, "self-improvement-campaigns");
    assert.throws(() => activateCampaignSuccessor(env.request, env.options), /CANDIDATE_CONFLICT/);
  });
  check("a later exact USER stop fences the admitted successor but not its historical proof", () => {
    const env = environment("Stopped-Again"); propose(env); consent(env);
    const admitted = activateCampaignSuccessor(env.request, env.options);
    stop(env, env.successor, admitted.admission.successor_campaign_ref);
    assert.strictEqual(supervisor(env).execution_authorized, false);
    assert.strictEqual(campaignSuccessorStatus(env.options, env.campaign.mission_id, env.successor.id).status, "stopped_again");
    assert.strictEqual(activateCampaignSuccessor(env.request, env.options).stop_fence_satisfied, false);
    assert.throws(() => openWave(wave(env), env.options), /CAMPAIGN_CONTINUATION_BLOCKED/);
  });
  check("one stop set cannot authorize two successor campaigns", () => {
    const env = environment("One-Owner"); propose(env); consent(env);
    activateCampaignSuccessor(env.request, env.options);
    const nextTerminal = reconcileCampaignTerminal(env.terminalRequest, env.options);
    const request = { ...env.proposalRequest, terminal_ref: nextTerminal.record_ref,
      successor_campaign: { ...clone(env.successor), id: "SIC-Second-Owner" } };
    assert.throws(() => proposeCampaignSuccessor(request, env.options), /STOP_SET_ALREADY_CONSUMED/);
  });
  check("successive stops preserve exact predecessor lineage and replay after later repository work", () => {
    const env = environment("Lineage"); propose(env); consent(env);
    const first = activateCampaignSuccessor(env.request, env.options);
    const stopRef = stop(env, env.successor, first.admission.successor_campaign_ref);
    const oldTerminal = reconcileCampaignTerminal(env.terminalRequest, env.options);
    assert.throws(() => proposeCampaignSuccessor({ ...env.proposalRequest, terminal_ref: oldTerminal.record_ref,
      successor_campaign: { ...clone(env.successor), id: "SIC-Wrong-Predecessor" } }, env.options), /LATEST_PREDECESSOR_REQUIRED/);
    env.campaign = env.successor; env.campaignRef = first.admission.successor_campaign_ref;
    env.terminalRequest = { ...env.terminalRequest, campaign_ref: env.campaignRef, stop_ref: stopRef };
    env.terminal = reconcileCampaignTerminal(env.terminalRequest, env.options);
    env.successor = { ...clone(env.campaign), id: `${env.campaign.id}-Next` };
    env.proposalRequest = { ...env.proposalRequest, terminal_ref: env.terminal.record_ref, successor_campaign: env.successor };
    propose(env); consent(env);
    const second = activateCampaignSuccessor(env.request, env.options);
    assert.strictEqual(second.admission.covered_stop_refs.length, 2);
    assert.strictEqual(supervisor(env).status, "ready");
    assert.strictEqual(supervisor(env, env.campaign).execution_authorized, false);
    fs.appendFileSync(path.join(env.options.repository, "README.md"), "Legitimate later work\n");
    git(env.options.repository, "add", "README.md"); git(env.options.repository, "commit", "-qm", "Later work");
    assert.strictEqual(campaignSuccessorStatus(env.options, env.campaign.mission_id, env.successor.id).stop_fence_satisfied, true);
    assert.strictEqual(activateCampaignSuccessor(env.request, env.options).existing, true);
  });
  check("status rejects a concurrent manifest change instead of caching a positive admission", () => {
    const env = environment("Status-Race"); propose(env); consent(env); activateCampaignSuccessor(env.request, env.options);
    let reads = 0;
    const options = { ...env.options, get repository() {
      reads++;
      if (reads === 2) persist(env, { id: "NOTE-Status-Race", note: "Concurrent publication." }, "notes");
      return env.options.repository;
    } };
    assert.throws(() => campaignSuccessorStatus(options, env.campaign.mission_id, env.successor.id), /STATUS_CHANGED/);
  });
  check("schema-valid admission forgery cannot replace exact publication history", () => {
    const env = environment("Forgery"); propose(env); consent(env);
    beforePublication = descriptor => {
      if (descriptor.kind !== "campaign-successor-admissions") return;
      beforePublication = null; throw new Error("Synthetic hold before admission");
    };
    assert.throws(() => activateCampaignSuccessor(env.request, env.options), /Synthetic hold/);
    const current = manifest(env);
    const candidate = current.artifacts.find(item => item.kind === "self-improvement-campaigns" && item.artifact_id === env.successor.id);
    const forged = { schema_version: "0.1", type: "CampaignSuccessorAdmission", id: `CSA-${runtime.inputDigest(env.request).slice(0, 32)}`,
      mission_id: env.campaign.mission_id, request: env.request, request_sha256: runtime.inputDigest(env.request),
      observed_manifest: { revision: current.manifest_revision, sha256: "f".repeat(64) },
      successor_campaign_ref: { artifact_id: candidate.artifact_id, relative_path: candidate.relative_path, sha256: candidate.sha256 },
      covered_stop_refs: env.terminal.record.inventory.stop_refs, admitted_at: env.options.now,
      successor_admitted: true, execution_authorized: false, continuation_authorized: false, release_authorized: false };
    assert.strictEqual(require("./validator-cli-prototype/validate").validatePayload(forged, "campaign-successor-admission").valid, true);
    persist(env, forged, "campaign-successor-admissions");
    assert.throws(() => supervisor(env), /HISTORY_MISMATCH/);
    assert.throws(() => campaignSuccessorStatus(env.options, env.campaign.mission_id, env.successor.id), /HISTORY_MISMATCH/);
  });
  check("admitted successor dispatch obeys a later stop while settling already admitted results", () => {
    const env = environment("Dispatch"); propose(env); consent(env);
    const activation = activateCampaignSuccessor(env.request, env.options);
    const plan = wave(env); plan.agents = [plan.agents[0]];
    const input = { command: "git status --short" };
    const draft = sample("dispatch-tool-policy"); delete draft.authorization; draft.schema_version = "0.1";
    Object.assign(draft, { mission_id: plan.mission_id, wave_id: plan.wave_id, agent_id: plan.agents[0].agent_id,
      approved_at: plan.created_at, valid_until: plan.valid_until });
    draft.tool_rules = [{ rule_id: "DTR-STATUS", mission_action: "Run deterministic validation.", tool_name: "Bash",
      operation_class: "process_execute", input_match: { mode: "exact_sha256", allowed_sha256: [runtime.inputDigest(input)] }, max_uses: 2 }];
    plan.dispatch_control = { required: true, enforcement_level: "guardrail", gateway_exclusive: false,
      policy_authorizations: [{ agent_id: draft.agent_id, provider: draft.provider, policy_id: draft.id, draft_sha256: runtime.inputDigest(draft) }] };
    openWave(plan, env.options);
    runtime.authorizeDispatchPolicy(env.options, draft);
    const lease = runtime.issueLease(env.options, draft.id, { sessionId: "successor", providerAgentId: "main" });
    const identity = { missionId: plan.mission_id, waveId: plan.wave_id, agentId: draft.agent_id,
      provider: draft.provider, sessionId: "successor", providerAgentId: "main" };
    const hook = { hook_event_name: "PreToolUse", tool_use_id: "before-stop", tool_name: "Bash", tool_input: input };
    assert.strictEqual(runtime.admitToolRequest(env.options, identity, hook).decision, "allow");
    env.options.now = new Date().toISOString();
    stop(env, env.successor, activation.admission.successor_campaign_ref);
    assert.throws(() => runtime.authorizeDispatchPolicy(env.options, draft), /CAMPAIGN_CONTINUATION_BLOCKED/);
    assert.throws(() => runtime.issueLease(env.options, draft.id, { sessionId: "renamed", providerAgentId: "main" }), /CAMPAIGN_CONTINUATION_BLOCKED/);
    assert.strictEqual(runtime.admitToolRequest(env.options, identity, { ...hook, tool_use_id: "after-stop" }).decision, "deny");
    assert.strictEqual(runtime.completeToolRequest(env.options, identity, { ...hook, hook_event_name: "PostToolUse", tool_response: { exit_code: 0 } }).status, "active");
    assert.strictEqual(runtime.sessionStart(env.options, identity, { source: "resume" }).status, "interrupted");
    assert.throws(() => runtime.resumeLease(env.options, lease.lease.id, { sessionId: "resumed", providerAgentId: "main" }), /CAMPAIGN_CONTINUATION_BLOCKED/);
    assert.strictEqual(runtime.revokeLease(env.options, lease.lease.id, "USER_STOP").status, "revoked");
  });
  for (const kind of ["self-improvement-campaigns", "campaign-successor-admissions"]) {
    for (const stage of ["prepared", "artifact_written", "history_created", "manifest_committed"]) {
      check(`${kind} ${stage} recovery never makes a partial candidate runnable`, () => {
        const env = environment(`Crash-${kind}-${stage}`); propose(env); consent(env);
        let fired = false;
        beforePublication = descriptor => {
          if (descriptor.kind !== kind) return;
          beforePublication = null; fired = true; descriptor.faultInjectionStage = stage;
        };
        assert.throws(() => activateCampaignSuccessor(env.request, env.options), /Injected artifact transaction failure/);
        assert(fired);
        assert.strictEqual(artifacts.verifyRepositoryArtifacts({ repositoryPath: env.options.repository,
          artifactRoot: env.options.artifactRoot, recover: true }).valid, true);
        const state = campaignSuccessorStatus(env.options, env.campaign.mission_id, env.successor.id);
        if (state.status === "candidate_held") {
          assert.strictEqual(supervisor(env).execution_authorized, false);
          assert.throws(() => openWave(wave(env), env.options), /CAMPAIGN_CONTINUATION_BLOCKED/);
          const initialized = spawnSync(process.execPath, [path.join(__dirname, "self-improvement-campaign-init.js"),
            "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot,
            "--mission", env.campaign.mission_id, "--campaign", "SIC-Bypass", "--objective", "Held work",
            "--end-state", "Done", "--criterion", "Verified", "--write-artifact"], { encoding: "utf8" });
          assert.notStrictEqual(initialized.status, 0);
          assert.match(initialized.stderr, /CAMPAIGN_STOP_REQUESTED/);
        }
        const result = activateCampaignSuccessor(env.request, env.options);
        assert.strictEqual(result.stop_fence_satisfied, true);
        assert.strictEqual(manifest(env).artifacts.filter(item => item.kind === "campaign-successor-admissions").length, 1);
      });
    }
  }
  for (const stage of ["prepared", "artifact_written", "history_created", "manifest_committed"]) {
    check(`proposal ${stage} recovery preserves the original finite offer`, () => {
      const env = environment(`Proposal-Crash-${stage}`);
      beforePublication = descriptor => {
        if (descriptor.kind !== "campaign-successor-proposals") return;
        beforePublication = null; descriptor.faultInjectionStage = stage;
      };
      assert.throws(() => propose(env), /Injected artifact transaction failure/);
      assert.strictEqual(artifacts.verifyRepositoryArtifacts({ repositoryPath: env.options.repository,
        artifactRoot: env.options.artifactRoot, recover: true }).valid, true);
      propose(env); consent(env);
      assert.strictEqual(activateCampaignSuccessor(env.request, env.options).stop_fence_satisfied, true);
      assert.strictEqual(manifest(env).artifacts.filter(item => item.kind === "campaign-successor-proposals").length, 1);
    });
  }
  for (const race of ["history", "repository", "expiry", "clock"]) check(`proposal publication fences ${race} races`, () => {
    const env = environment(`Proposal-Race-${race}`);
    beforePublication = descriptor => {
      if (descriptor.kind !== "campaign-successor-proposals") return;
      beforePublication = null;
      if (race === "history") persist(env, { id: "NOTE-Race", note: "Concurrent writer." }, "notes");
      if (race === "repository") fs.appendFileSync(path.join(env.options.repository, "README.md"), "drift\n");
      if (race === "expiry") env.options.now = new Date(Date.parse(env.options.now) + 3600000).toISOString();
      if (race === "clock") env.options.now = new Date(Date.parse(env.options.now) - 1).toISOString();
    };
    assert.throws(() => propose(env), /SNAPSHOT_CHANGED|REPOSITORY_CHANGED|PROPOSAL_EXPIRED|CLOCK_ROLLBACK/);
    assert(!manifest(env).artifacts.some(item => item.kind === "campaign-successor-proposals"));
  });
  for (const race of ["history", "repository", "expiry", "clock", "stop"]) check(`activation publication fences ${race} races`, () => {
    const env = environment(`Race-${race}`); propose(env); consent(env);
    beforePublication = descriptor => {
      if (descriptor.kind !== "campaign-successor-admissions") return;
      beforePublication = null;
      if (race === "history") persist(env, { id: "NOTE-Race", note: "Concurrent writer." }, "notes");
      if (race === "repository") fs.appendFileSync(path.join(env.options.repository, "README.md"), "drift\n");
      if (race === "expiry") env.options.now = env.proposed.proposal.expires_at;
      if (race === "clock") env.options.now = new Date(Date.parse(env.options.now) - 1).toISOString();
      if (race === "stop") {
        const entry = manifest(env).artifacts.find(item => item.kind === "self-improvement-campaigns" && item.artifact_id === env.successor.id);
        stop(env, env.successor, { artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
      }
    };
    assert.throws(() => activateCampaignSuccessor(env.request, env.options), /SNAPSHOT_CHANGED|REPOSITORY_CHANGED|PROPOSAL_EXPIRED|CLOCK_ROLLBACK/);
    assert(!manifest(env).artifacts.some(item => item.kind === "campaign-successor-admissions"));
    assert.strictEqual(supervisor(env).execution_authorized, false);
  });
  for (const tree of ["codex-skills", ".claude/skills"]) check(`${tree} successor CLI completes the exact synthetic ceremony outside the checkout`, () => {
    const env = environment(tree === "codex-skills" ? "Codex-CLI" : "Claude-CLI");
    delete env.options.now;
    const script = path.join(__dirname, tree, "controls-doctrine-operator/scripts/activate_controls_successor.js");
    const invoke = (action, request) => {
      const args = [script, action, "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot];
      if (request) { const file = path.join(env.root, `${action}.json`); fs.writeFileSync(file, JSON.stringify(request)); args.push("--request", file); }
      else if (action === "status") args.push("--mission", env.campaign.mission_id, "--campaign", env.successor.id);
      const result = spawnSync(process.execPath, args, { cwd: os.tmpdir(), encoding: "utf8" });
      assert.strictEqual(result.status, 0, result.stderr);
      const value = JSON.parse(result.stdout);
      assert.strictEqual(value.execution_authorized, false); assert.strictEqual(value.continuation_authorized, false); assert.strictEqual(value.release_authorized, false);
      return value;
    };
    assert.deepStrictEqual(invoke("repository-state").repository_state, env.proposalRequest.repository_state);
    env.proposed = invoke("propose", env.proposalRequest);
    env.request = { schema_version: "0.1", type: "CampaignSuccessorActivationRequest", mission_id: env.campaign.mission_id,
      proposal_ref: env.proposed.proposal_ref, decision_ref: NONE };
    assert.strictEqual(invoke("decision-option", env.request).consent_granted, false);
    env.options.now = new Date().toISOString(); consent(env); delete env.options.now;
    assert.strictEqual(invoke("activate", env.request).admission.successor_admitted, true);
    assert.strictEqual(invoke("status").status, "admitted_to_normal_gates");
  });
  check("two independent activation processes retain only one admission", () => {
    const env = environment("Concurrent"); propose(env); consent(env);
    const worker = `const api=require(process.argv[1]);try{console.log(JSON.stringify(api.activateCampaignSuccessor(JSON.parse(process.argv[2]),JSON.parse(process.argv[3]))));}catch(error){console.error(error.message);process.exitCode=2;}`;
    const harness = `
const {spawn}=require("child_process");
const args=JSON.parse(process.argv[1]);
function run(){return new Promise(resolve=>{const child=spawn(process.execPath,args);let out="",err="";child.stdout.on("data",x=>out+=x);child.stderr.on("data",x=>err+=x);child.on("close",code=>resolve({code,out,err}));child.on("error",error=>resolve({code:-1,err:error.message}));});}
Promise.all([run(),run()]).then(results=>console.log(JSON.stringify(results)));
`;
    const args = ["-e", worker, path.join(__dirname, "campaign-successor-controller.js"), JSON.stringify(env.request), JSON.stringify(env.options)];
    const run = spawnSync(process.execPath, ["-e", harness, JSON.stringify(args)], { encoding: "utf8", timeout: 120000 });
    assert.strictEqual(run.status, 0, run.stderr || String(run.error));
    const results = JSON.parse(run.stdout);
    assert(results.some(item => item.code === 0), JSON.stringify(results));
    for (const item of results.filter(item => item.code !== 0)) assert.match(item.err, /SNAPSHOT_CHANGED|UNEXPECTED_HISTORY|CONSENT_ALREADY_CONSUMED/);
    assert.strictEqual(manifest(env).artifacts.filter(item => item.kind === "campaign-successor-admissions").length, 1);
    assert.strictEqual(activateCampaignSuccessor(env.request, env.options).existing, true);
    assert.strictEqual(supervisor(env).status, "ready");
  });
  console.log(JSON.stringify({ passed, failed: 0 }, null, 2));
} finally {
  beforePublication = null;
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}
