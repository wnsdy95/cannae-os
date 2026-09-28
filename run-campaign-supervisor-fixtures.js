#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const artifactStore = require("./repository-artifact-store");
const originalWrite = artifactStore.writeRepositoryArtifact;
let beforePublication = null;
artifactStore.writeRepositoryArtifact = options => {
  if (beforePublication) beforePublication(options);
  return originalWrite(options);
};
const { superviseCampaign } = require("./campaign-supervisor");
const { resolveRepository, verifyRepositoryArtifacts, writeRepositoryArtifact } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { publicKeyId } = require("./verification-attestation");
const { openWave, recordWave, closeWave } = require("./skill-mission-controller");
const {
  admitToolRequest, authorizeDispatchPolicy, completeToolRequest,
  inputDigest, issueLease, revokeLease, resumeLease, sessionStart
} = require("./dispatch-runtime-controller");

const ROOT = __dirname;
const CAMPAIGN_SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-self-improvement-campaign.json"), "utf8"));
const CHECKPOINT_SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-self-improvement-checkpoint.json"), "utf8"));
const DECISION_SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-self-improvement-decision.json"), "utf8"));
const completed = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function verifier(repositoryKey, id, group, purposes) {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return {
    id,
    key_id: publicKeyId(publicKey),
    public_key_pem: publicKeyPem,
    independence_group: group,
    status: "active",
    allowed_repository_keys: [repositoryKey],
    allowed_execution_origins: ["remote"],
    allowed_attestation_types: purposes,
    valid_from: "2026-07-21T08:00:00Z",
    valid_until: "2027-07-21T08:00:00Z"
  };
}

function makeEnvironment(name, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cannae-supervisor-${name}-`));
  const repositoryPath = path.join(root, "repo");
  const artifactRoot = path.join(root, "artifacts");
  fs.mkdirSync(repositoryPath, { recursive: true });
  git(repositoryPath, ["init", "-q"]);
  git(repositoryPath, ["config", "user.email", "fixtures@controls.local"]);
  git(repositoryPath, ["config", "user.name", "Controls Fixtures"]);
  fs.writeFileSync(path.join(repositoryPath, "README.md"), `${name}\n`);
  git(repositoryPath, ["add", "README.md"]);
  git(repositoryPath, ["commit", "-qm", "fixture baseline"]);
  const repository = resolveRepository(repositoryPath);
  const suffix = name.replace(/[^A-Za-z0-9]+/g, "-");
  const campaign = clone(CAMPAIGN_SAMPLE);
  campaign.id = `SIC-${suffix}`;
  campaign.mission_id = `MIS-${suffix}`;
  campaign.repository_binding = {
    repository_key: repository.key,
    identity_fingerprint: repository.identity_fingerprint,
    baseline_revision: repository.head_commit
  };
  campaign.created_at = overrides.createdAt || "2026-07-21T09:00:00Z";
  Object.assign(campaign.budgets, overrides.budgets || {});
  if (overrides.status) campaign.status = overrides.status;
  let trustPolicy = null;
  let trustPolicyWrite = null;
  if (overrides.schemaVersion === "0.4") {
    campaign.schema_version = "0.4";
    const defaultPurposes = ["verification_receipt", "comparative_evaluation_report"];
    trustPolicy = {
      schema_version: "0.1",
      type: "VerifierTrustPolicy",
      id: "VTP-Supervisor-Fixture",
      repository_binding: {
        repository_key: repository.key,
        identity_fingerprint: repository.identity_fingerprint
      },
      policy_version: 1,
      quorum: {
        minimum_valid_attestations: 2,
        minimum_independence_groups: 2,
        require_distinct_key_ids: true,
        max_attestation_age_seconds: 900
      },
      verifiers: [
        verifier(repository.key, "VERIFIER-Supervisor-A", "provider-a", overrides.firstVerifierPurposes || defaultPurposes),
        verifier(repository.key, "VERIFIER-Supervisor-B", "provider-b", overrides.secondVerifierPurposes || defaultPurposes)
      ],
      created_at: "2026-07-21T08:00:00Z",
      expires_at: overrides.policyExpiresAt || "2027-07-21T08:00:00Z"
    };
    trustPolicyWrite = writeRepositoryArtifact({
      repositoryPath,
      artifactRoot,
      missionId: campaign.mission_id,
      waveId: "C0",
      kind: "verifier-trust-policies",
      artifactId: trustPolicy.id,
      payload: trustPolicy,
      createdAt: trustPolicy.created_at
    });
    campaign.attestation_policy = {
      required: true,
      trust_policy_ref: {
        artifact_id: trustPolicy.id,
        relative_path: trustPolicyWrite.relative_path,
        sha256: overrides.trustReferenceSha || trustPolicyWrite.sha256
      },
      minimum_valid_attestations: 2,
      minimum_independence_groups: 2,
      require_distinct_key_ids: true,
      max_attestation_age_seconds: 900
    };
  }
  const campaignWrite = writeRepositoryArtifact({
    repositoryPath,
    artifactRoot,
    missionId: campaign.mission_id,
    waveId: "C0",
    kind: "self-improvement-campaigns",
    artifactId: campaign.id,
    payload: campaign,
    createdAt: campaign.created_at
  });
  return { root, repositoryPath, artifactRoot, repository, campaign, campaignWrite, trustPolicy, trustPolicyWrite, decisions: [] };
}

function checkpointFor(environment, cycle, attempt, options = {}) {
  const checkpoint = clone(CHECKPOINT_SAMPLE);
  const suffix = environment.campaign.id.replace(/^SIC-/, "");
  checkpoint.id = `SCP-${suffix}-C${cycle}-A${attempt}`;
  checkpoint.campaign_id = environment.campaign.id;
  checkpoint.mission_id = environment.campaign.mission_id;
  checkpoint.repository_binding = {
    repository_key: environment.repository.key,
    identity_fingerprint: environment.repository.identity_fingerprint
  };
  checkpoint.cycle_number = cycle;
  checkpoint.trigger = options.trigger || "wave_end";
  const parent = cycle === 1 ? null : options.parent;
  checkpoint.parent_decision_id = parent ? parent.decision.id : "none";
  checkpoint.parent_decision_ref = parent ? {
    decision_id: parent.decision.id,
    relative_path: parent.write.relative_path,
    sha256: parent.write.sha256
  } : { decision_id: "none", relative_path: "none", sha256: "none" };
  checkpoint.target.baseline_revision = options.baselineRevision || (parent
    ? parent.decision.accepted_revision
    : environment.campaign.repository_binding.baseline_revision);
  checkpoint.target.candidate_revision = options.candidateRevision || `WT-${String(cycle).repeat(32)}${String(attempt).repeat(32)}`.slice(0, 67);
  checkpoint.candidate.id = `CAN-${suffix}-C${cycle}-A${attempt}`;
  checkpoint.verification_receipts[0].receipt_id = `VR-${suffix}-C${cycle}-A${attempt}`;
  checkpoint.verification_receipts[0].plan_id = `VP-${suffix}-C${cycle}-A${attempt}`;
  checkpoint.verification_receipts[0].relative_path = `repositories/${environment.repository.key}/missions/${environment.campaign.mission_id}/C${cycle}/verification-receipts/VR-${suffix}-C${cycle}-A${attempt}.json`;
  checkpoint.metric_results.forEach(result => { result.evidence_receipt_ids = [checkpoint.verification_receipts[0].receipt_id]; });
  checkpoint.progress.failed_experiments = options.failedExperiments || 0;
  checkpoint.progress.consecutive_no_progress_cycles = options.noProgress || 0;
  checkpoint.progress.elapsed_minutes = options.elapsedMinutes ?? cycle * 10 + attempt;
  checkpoint.progress.open_acceptance_criteria = options.openCriteria === undefined
    ? ["A completion checkpoint is recorded."]
    : options.openCriteria;
  checkpoint.generated_at = new Date(Date.parse(environment.campaign.created_at) + (cycle * 10 + attempt) * 60000).toISOString();
  return checkpoint;
}

function decisionFor(environment, checkpoint, decisionName, options = {}) {
  const decision = clone(DECISION_SAMPLE);
  decision.id = `SID-${checkpoint.id.replace(/^SCP-/, "")}`;
  decision.campaign_id = environment.campaign.id;
  decision.checkpoint_id = checkpoint.id;
  decision.mission_id = environment.campaign.mission_id;
  decision.cycle_number = checkpoint.cycle_number;
  decision.decision = decisionName;
  decision.execution_authorized = ["accept_working_state", "revise_and_retry", "rollback", "continue"].includes(decisionName);
  decision.promotion_scope = decisionName === "accept_working_state" ? "in_progress_work" : decisionName === "complete" ? "working_state" : "none";
  decision.accepted_revision = ["accept_working_state", "complete"].includes(decisionName)
    ? checkpoint.target.candidate_revision
    : "none";
  decision.selected_candidate_id = checkpoint.candidate.id;
  decision.proof.parent_decision_id = checkpoint.parent_decision_id;
  decision.proof.verification_receipt_ids = [checkpoint.verification_receipts[0].receipt_id];
  const verification = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
  decision.proof.repository_manifest_revision = verification.manifest_revision;
  decision.proof.repository_manifest_sha256 = verification.manifest_sha256;
  decision.decision === "rollback"
    ? decision.blocking_codes = ["VERIFICATION_EXECUTION_FAILED"]
    : decision.blocking_codes = options.blockingCodes || [];
  decision.next_task_order = {
    owner: "S3",
    task: options.task || (decisionName === "accept_working_state" ? "Advance the next bounded criterion." : "Revise the candidate without widening scope."),
    purpose: environment.campaign.objective.intent,
    constraints: ["Preserve every protected invariant."],
    required_evidence: ["Repository-scoped verification receipt."],
    next_checkpoint_trigger: options.nextTrigger || "wave_end"
  };
  decision.human_decision_required = ["escalate", "terminate"].includes(decisionName);
  decision.required_human_decision = decision.human_decision_required ? "Review the blocked campaign state." : "none";
  decision.decided_at = checkpoint.generated_at;
  return decision;
}

function persistCheckpoint(environment, checkpoint) {
  return writeRepositoryArtifact({
    repositoryPath: environment.repositoryPath,
    artifactRoot: environment.artifactRoot,
    missionId: environment.campaign.mission_id,
    waveId: `C${checkpoint.cycle_number}`,
    kind: "self-improvement-checkpoints",
    artifactId: checkpoint.id,
    payload: checkpoint,
    createdAt: checkpoint.generated_at
  });
}

function persistPair(environment, checkpoint, decisionName, options = {}) {
  const checkpointWrite = persistCheckpoint(environment, checkpoint);
  const decision = decisionFor(environment, checkpoint, decisionName, options);
  const decisionWrite = writeRepositoryArtifact({
    repositoryPath: environment.repositoryPath,
    artifactRoot: environment.artifactRoot,
    missionId: environment.campaign.mission_id,
    waveId: `C${checkpoint.cycle_number}`,
    kind: "self-improvement-decisions",
    artifactId: decision.id,
    payload: decision,
    createdAt: decision.decided_at
  });
  const record = { checkpoint, checkpointWrite, decision, write: decisionWrite };
  environment.decisions.push(record);
  return record;
}

function supervise(environment, evaluatedAt = new Date(Math.max(Date.parse(environment.campaign.created_at),
  ...environment.decisions.map(item => Date.parse(item.decision.decided_at)))).toISOString()) {
  const result = superviseCampaign({
    repositoryPath: environment.repositoryPath,
    artifactRoot: environment.artifactRoot,
    campaignId: environment.campaign.id,
    evaluatedAt
  });
  const validation = validatePayload(result.order, "self-improvement-cycle-order");
  assert.strictEqual(validation.valid, true, JSON.stringify(validation, null, 2));
  return result.order;
}

function persistSupervisor(environment) {
  const result = spawnSync(process.execPath, [
    "campaign-supervisor.js",
    "--repository", environment.repositoryPath,
    "--artifact-root", environment.artifactRoot,
    "--campaign", environment.campaign.id,
    "--write-artifact"
  ], { cwd: ROOT, encoding: "utf8" });
  assert([0, 1].includes(result.status), result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function run(name, test) {
  test();
  completed.push(name);
}

function waveFor(environment) {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-mission-wave-plan.json"), "utf8"));
  plan.mission_id = environment.campaign.mission_id;
  plan.adaptive_work.campaign_id = environment.campaign.id;
  return plan;
}

function waveOptions(environment) {
  return {
    repository: environment.repositoryPath, artifactRoot: environment.artifactRoot,
    doctrineRoot: ROOT, now: "2026-07-23T04:15:00+09:00"
  };
}

function stopBeforePublication(environment, kind) {
  let fired = false;
  beforePublication = options => {
    if (options.kind !== kind) return;
    beforePublication = null;
    fired = true;
    persistPair(environment, checkpointFor(environment, 1, 1), "escalate");
  };
  return () => {
    beforePublication = null;
    assert(fired, `The ${kind} publication boundary was not reached.`);
    const verification = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
    assert.strictEqual(verification.valid, true);
    const manifest = JSON.parse(fs.readFileSync(path.join(environment.artifactRoot, "repositories", environment.repository.key, "manifest.json"), "utf8"));
    assert(!manifest.artifacts.some(entry => entry.kind === kind), `Stopped publication retained ${kind}.`);
  };
}

try {
  run("supervisor CLI cannot publish a ready order after a concurrent retained stop", () => {
    const environment = makeEnvironment("supervisor-cli-stop", { createdAt: new Date(Date.now() - 3600000).toISOString() });
    try {
      const checkpoint = checkpointFor(environment, 1, 1);
      const decision = decisionFor(environment, checkpoint, "escalate");
      const preload = path.join(environment.root, "stop-before-order.js");
      const stop = { repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot,
        missionId: environment.campaign.mission_id, waveId: "C1" };
      fs.writeFileSync(preload, `const store = require(${JSON.stringify(path.join(ROOT, "repository-artifact-store.js"))});
const original = store.writeRepositoryArtifact;
let fired = false;
store.writeRepositoryArtifact = descriptor => {
  if (!fired && descriptor.kind === "self-improvement-cycle-orders") {
    fired = true;
    const common = ${JSON.stringify(stop)};
    const checkpoint = ${JSON.stringify(checkpoint)};
    const decision = ${JSON.stringify(decision)};
    original({ ...common, kind: "self-improvement-checkpoints", artifactId: checkpoint.id, payload: checkpoint, createdAt: checkpoint.generated_at });
    original({ ...common, kind: "self-improvement-decisions", artifactId: decision.id, payload: decision, createdAt: decision.decided_at });
  }
  return original(descriptor);
};\n`);
      const result = spawnSync(process.execPath, ["--require", preload, path.join(ROOT, "campaign-supervisor.js"),
        "--repository", environment.repositoryPath, "--artifact-root", environment.artifactRoot,
        "--campaign", environment.campaign.id, "--write-artifact"], { encoding: "utf8" });
      assert.strictEqual(result.status, 2, result.stdout || result.stderr);
      assert.match(result.stderr, /SUPERVISOR_ORDER_PUBLICATION_CHANGED:awaiting_human/);
      const manifest = JSON.parse(fs.readFileSync(path.join(environment.artifactRoot, "repositories", environment.repository.key, "manifest.json")));
      assert(!manifest.artifacts.some(entry => entry.kind === "self-improvement-cycle-orders"));
      assert.strictEqual(verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot }).valid, true);
    } finally { fs.rmSync(environment.root, { recursive: true, force: true }); }
  });

  for (const reuse of [false, true]) {
    run(`supervisor ${reuse ? "reused" : "new"} order rejects a stop at publication`, () => {
      const environment = makeEnvironment(`supervisor-stop-${reuse}`);
      const options = { repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot,
        campaignId: environment.campaign.id, evaluatedAt: "2026-07-21T09:15:00Z", writeArtifact: true };
      try {
        const prior = reuse ? superviseCampaign(options) : null;
        let fired = false;
        beforePublication = descriptor => {
          if (descriptor.kind !== "self-improvement-cycle-orders") return;
          beforePublication = null; fired = true;
          persistPair(environment, checkpointFor(environment, 1, 1), "escalate");
        };
        assert.throws(() => superviseCampaign(options), /SUPERVISOR_ORDER_PUBLICATION_CHANGED:awaiting_human/);
        assert(fired);
        const held = superviseCampaign(options);
        assert.strictEqual(held.order.execution_authorized, false);
        assert.strictEqual(held.order.status, "awaiting_human");
        if (prior) assert.notStrictEqual(held.order.id, prior.order.id);
        const verified = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
        assert.strictEqual(verified.valid, true);
        const manifest = JSON.parse(fs.readFileSync(path.join(environment.artifactRoot, "repositories", environment.repository.key, "manifest.json")));
        assert.strictEqual(manifest.artifacts.filter(entry => entry.kind === "self-improvement-cycle-orders").length, reuse ? 2 : 1);
      } finally { beforePublication = null; fs.rmSync(environment.root, { recursive: true, force: true }); }
    });

    for (const race of ["expiry", "clock-rollback"]) run(`supervisor ${reuse ? "reused" : "new"} order rejects ${race} at publication`, () => {
      const environment = makeEnvironment(`supervisor-${race}-${reuse}`, { budgets: { max_elapsed_minutes: 5 } });
      const options = { repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot,
        campaignId: environment.campaign.id, evaluatedAt: "2026-07-21T09:04:59.999Z", writeArtifact: true };
      try {
        if (reuse) superviseCampaign(options);
        const before = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
        let fired = false;
        beforePublication = descriptor => {
          if (descriptor.kind !== "self-improvement-cycle-orders") return;
          beforePublication = null; fired = true;
          options.evaluatedAt = race === "expiry" ? "2026-07-21T18:05:00+09:00" : "2026-07-21T09:04:59.998Z";
        };
        assert.throws(() => superviseCampaign(options), race === "expiry"
          ? /SUPERVISOR_ORDER_PUBLICATION_CHANGED:blocked:CAMPAIGN_ELAPSED_TIME_BUDGET_EXHAUSTED/
          : /SUPERVISOR_PUBLICATION_TIME_INVALID/);
        assert(fired);
        const after = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
        assert.strictEqual(after.valid, true);
        assert.strictEqual(after.manifest_revision, before.manifest_revision);
      } finally { beforePublication = null; fs.rmSync(environment.root, { recursive: true, force: true }); }
    });
  }

  run("supervisor permits unrelated manifest growth and reappraises exact reuse", () => {
    const environment = makeEnvironment("supervisor-benign-growth");
    const options = { repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot,
      campaignId: environment.campaign.id, evaluatedAt: "2026-07-21T09:01:00Z", writeArtifact: true };
    try {
      beforePublication = descriptor => {
        if (descriptor.kind !== "self-improvement-cycle-orders") return;
        beforePublication = null;
        writeRepositoryArtifact({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot,
          missionId: environment.campaign.mission_id, waveId: "C0", kind: "maintenance-observations",
          artifactId: "MO-BENIGN", payload: { note: "No authority change." } });
      };
      const first = superviseCampaign(options);
      assert.strictEqual(first.order.status, "ready");
      assert.strictEqual(first.writtenOrder.created, true);
      options.evaluatedAt = "2026-07-21T09:02:00Z";
      const second = superviseCampaign(options);
      assert.strictEqual(second.existing, true);
      assert.strictEqual(second.writtenOrder.transaction_id, "none");
      assert.deepStrictEqual(second.order, first.order);
    } finally { beforePublication = null; fs.rmSync(environment.root, { recursive: true, force: true }); }
  });

  for (const stage of ["prepared", "artifact_written", "history_created", "manifest_committed"]) {
    run(`supervisor ${stage} crash cannot publish a stale order after a later stop`, () => {
      const environment = makeEnvironment(`supervisor-crash-${stage}`);
      const options = { repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot,
        campaignId: environment.campaign.id, evaluatedAt: "2026-07-21T09:10:00Z", writeArtifact: true };
      try {
        beforePublication = descriptor => {
          if (descriptor.kind !== "self-improvement-cycle-orders") return;
          beforePublication = null; descriptor.faultInjectionStage = stage;
        };
        assert.throws(() => superviseCampaign(options), /Injected artifact transaction failure/);
        assert.strictEqual(verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot }).valid, false);
        const stopped = persistPair(environment, checkpointFor(environment, 1, 1), "escalate");
        options.evaluatedAt = stopped.decision.decided_at;
        const held = superviseCampaign(options);
        assert.strictEqual(held.order.status, "awaiting_human");
        assert.strictEqual(held.order.execution_authorized, false);
        const records = held.history.existingOrders;
        assert.strictEqual(records.filter(item => item.payload.status === "ready").length, stage === "prepared" ? 0 : 1);
        assert.strictEqual(verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot }).valid, true);
        if (stage !== "prepared") assert(records[0].entry.created_at < stopped.checkpoint.generated_at);
      } finally { beforePublication = null; fs.rmSync(environment.root, { recursive: true, force: true }); }
    });
  }

  for (const kind of ["mission-wave-plans", "agent-context-packs", "mission-wave-reports", "mission-wave-closeouts"]) {
    run(`retained escalation at the ${kind} publication boundary denies the stale writer`, () => {
      const environment = makeEnvironment(`publication-${kind}`, { createdAt: "2026-07-23T04:00:00+09:00" });
      try {
        const plan = waveFor(environment);
        const options = waveOptions(environment);
        if (["mission-wave-plans", "agent-context-packs"].includes(kind)) {
          const verify = stopBeforePublication(environment, kind);
          assert.throws(() => openWave(plan, options), /CAMPAIGN_CONTINUATION_BLOCKED/);
          verify();
        } else {
          const opened = openWave(plan, options);
          const report = {
            schema_version: "0.1", type: "MissionWaveReport", id: "MWR-Publication", mission_id: plan.mission_id,
            wave_id: plan.wave_id, plan_ref: opened.plan_ref, routing_preflight_ref: opened.routing_preflight_ref,
            agent_results: opened.context_packs.map(item => ({
              agent_id: item.agent_id, context_pack_ref: item.context_pack_ref, status: "blocked",
              summary: "Awaiting a scope decision.", completed_actions: [], blockers: ["Scope is unresolved."],
              evidence_refs: [], improvement_candidates: [], next_actions: ["Request a USER decision."]
            })), wave_status: "blocked", human_decisions_required: ["Review scope."], release_requested: false,
            recorded_at: options.now
          };
          if (kind === "mission-wave-reports") {
            const verify = stopBeforePublication(environment, kind);
            assert.throws(() => recordWave(report, options), /CAMPAIGN_CONTINUATION_BLOCKED/);
            verify();
          } else {
            recordWave(report, options);
            const aar = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-aar.json"), "utf8"));
            aar.mission_id = plan.mission_id;
            const verify = stopBeforePublication(environment, kind);
            assert.throws(() => closeWave(aar, { ...options, missionId: plan.mission_id, waveId: plan.wave_id }), /CAMPAIGN_CONTINUATION_BLOCKED/);
            verify();
          }
        }
      } finally {
        beforePublication = null;
        fs.rmSync(environment.root, { recursive: true, force: true });
      }
    });
  }

  for (const kind of ["dispatch-tool-policies", "agent-dispatch-leases", "tool-admission-events"]) {
    run(`retained escalation at the ${kind} publication boundary denies new authority`, () => {
      const environment = makeEnvironment(`publication-${kind}`, { createdAt: "2026-07-23T04:00:00+09:00" });
      try {
        const plan = waveFor(environment);
        plan.agents = [plan.agents[0]];
        const options = waveOptions(environment);
        const input = { command: "git status --short" };
        const draft = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-dispatch-tool-policy.json"), "utf8"));
        delete draft.authorization;
        Object.assign(draft, { schema_version: "0.1", mission_id: plan.mission_id, agent_id: plan.agents[0].agent_id,
          approved_at: plan.created_at, valid_until: plan.valid_until });
        draft.tool_rules = [{ rule_id: "DTR-STATUS", mission_action: "Run deterministic validation.", tool_name: "Bash",
          operation_class: "process_execute", input_match: { mode: "exact_sha256", allowed_sha256: [inputDigest(input)] }, max_uses: 1 }];
        plan.dispatch_control = { required: true, enforcement_level: "guardrail", gateway_exclusive: false,
          policy_authorizations: [{ agent_id: draft.agent_id, provider: draft.provider, policy_id: draft.id, draft_sha256: inputDigest(draft) }] };
        openWave(plan, options);
        if (kind !== "dispatch-tool-policies") authorizeDispatchPolicy(options, draft);
        const binding = { sessionId: "publication", providerAgentId: "main" };
        if (kind === "tool-admission-events") issueLease(options, draft.id, binding);
        const verify = stopBeforePublication(environment, kind);
        const action = kind === "dispatch-tool-policies" ? () => authorizeDispatchPolicy(options, draft)
          : kind === "agent-dispatch-leases" ? () => issueLease(options, draft.id, binding)
            : () => admitToolRequest(options, { ...binding, missionId: plan.mission_id, waveId: plan.wave_id,
              agentId: draft.agent_id, provider: draft.provider }, {
              hook_event_name: "PreToolUse", tool_use_id: "publication-request", tool_name: "Bash", tool_input: input
            });
        assert.throws(action, /CAMPAIGN_CONTINUATION_BLOCKED/);
        verify();
      } finally {
        beforePublication = null;
        fs.rmSync(environment.root, { recursive: true, force: true });
      }
    });
  }

  run("campaign expires without a checkpoint at the exact wall-clock boundary", () => {
    const environment = makeEnvironment("wall-clock-empty", { budgets: { max_elapsed_minutes: 5 } });
    try {
      const before = supervise(environment, "2026-07-21T18:04:59.999+09:00");
      assert.strictEqual(before.status, "ready");
      const expired = supervise(environment, "2026-07-21T09:05:00Z");
      assert.strictEqual(expired.status, "blocked");
      assert(expired.blocking_codes.includes("CAMPAIGN_ELAPSED_TIME_BUDGET_EXHAUSTED"));
      assert.strictEqual(expired.budget_snapshot.elapsed_minutes, 0, "reported progress must not be rewritten");
      assert.strictEqual(expired.execution_authorized, false);
} finally {
      fs.rmSync(environment.root, { recursive: true, force: true });
    }
  });

  run("a low reported counter and retained ready order cannot extend a deadline", () => {
    const environment = makeEnvironment("wall-clock-retained", { budgets: { max_elapsed_minutes: 15 } });
    try {
      persistPair(environment, checkpointFor(environment, 1, 1, { elapsedMinutes: 0 }), "revise_and_retry");
      const ready = supervise(environment, "2026-07-21T09:12:00Z");
      assert.strictEqual(ready.status, "ready");
      const writeOrder = order => writeRepositoryArtifact({
        repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot,
        missionId: order.mission_id, waveId: "C1", kind: "self-improvement-cycle-orders",
        artifactId: order.id, payload: order, createdAt: order.generated_at
      });
      writeOrder(ready);
      assert.deepStrictEqual(supervise(environment, "2026-07-21T09:13:00Z"), ready);
      const expired = supervise(environment, "2026-07-21T09:15:00Z");
      assert.strictEqual(expired.status, "blocked");
      assert(expired.blocking_codes.includes("CAMPAIGN_ELAPSED_TIME_BUDGET_EXHAUSTED"));
      assert.notStrictEqual(expired.id, ready.id);
      writeOrder(expired);
      assert.deepStrictEqual(supervise(environment, "2026-07-21T09:16:00Z"), expired);
      assert.throws(() => supervise(environment, "2026-07-21T09:14:00Z"), /conflicts with the reconstructed campaign state/);
    } finally {
      fs.rmSync(environment.root, { recursive: true, force: true });
    }
  });

  run("reported elapsed budget remains a conservative admission floor", () => {
    const environment = makeEnvironment("reported-time", { budgets: { max_elapsed_minutes: 15 } });
    try {
      persistPair(environment, checkpointFor(environment, 1, 1, { elapsedMinutes: 15 }), "revise_and_retry");
      assert(supervise(environment).blocking_codes.includes("CAMPAIGN_ELAPSED_TIME_BUDGET_EXHAUSTED"));
    } finally {
      fs.rmSync(environment.root, { recursive: true, force: true });
    }
  });

  run("invalid, pre-creation, and pre-history evaluation clocks fail closed", () => {
    const environment = makeEnvironment("invalid-clock");
    try {
      assert.throws(() => supervise(environment, "invalid"), /CAMPAIGN_EVALUATION_TIME_INVALID/);
      assert.throws(() => supervise(environment, null), /CAMPAIGN_EVALUATION_TIME_INVALID/);
      assert(supervise(environment, "2026-07-21T08:59:59Z").blocking_codes.includes("CAMPAIGN_EVALUATION_PRECEDES_CREATION"));
      persistPair(environment, checkpointFor(environment, 1, 1), "revise_and_retry");
      assert(supervise(environment, "2026-07-21T09:10:59Z").blocking_codes.includes("CAMPAIGN_EVALUATION_PRECEDES_HISTORY"));
    } finally {
      fs.rmSync(environment.root, { recursive: true, force: true });
    }
  });

  run("the supervisor CLI uses the live clock for an idle expired campaign", () => {
    const environment = makeEnvironment("live-clock-expired", {
      createdAt: new Date(Date.now() - 300000).toISOString(), budgets: { max_elapsed_minutes: 1 }
    });
    try {
      const result = spawnSync(process.execPath, ["campaign-supervisor.js", "--repository", environment.repositoryPath,
        "--artifact-root", environment.artifactRoot, "--campaign", environment.campaign.id], { cwd: ROOT, encoding: "utf8" });
      assert.strictEqual(result.status, 1, result.stderr || result.stdout);
      const order = JSON.parse(result.stdout);
      assert(order.blocking_codes.includes("CAMPAIGN_ELAPSED_TIME_BUDGET_EXHAUSTED"));
      assert.strictEqual(order.execution_authorized, false);
    } finally {
      fs.rmSync(environment.root, { recursive: true, force: true });
    }
  });

  for (const decisionName of ["escalate", "terminate", "complete"]) run(`${decisionName} cannot reopen, report, or close an adaptive wave`, () => {
    const environment = makeEnvironment(`wave-after-${decisionName}`, { createdAt: "2026-07-23T04:00:00+09:00" });
    try {
      const plan = waveFor(environment);
      const options = waveOptions(environment);
      openWave(plan, options);
      const checkpoint = checkpointFor(environment, 1, 1,
        decisionName === "complete" ? { trigger: "before_completion", openCriteria: [] } : {});
      if (decisionName === "complete") checkpoint.candidate.disposition = "no_change";
      persistPair(environment, checkpoint, decisionName);
      const before = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
      assert.throws(() => openWave(plan, options), /CAMPAIGN_CONTINUATION_BLOCKED/);
      const next = clone(plan);
      next.id += "-NEXT";
      next.wave_id = "W2";
      assert.throws(() => openWave(next, options), /CAMPAIGN_CONTINUATION_BLOCKED/);
      const report = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-mission-wave-report.json"), "utf8"));
      report.mission_id = plan.mission_id;
      assert.throws(() => recordWave(report, options), /CAMPAIGN_CONTINUATION_BLOCKED/);
      const aar = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-aar.json"), "utf8"));
      aar.mission_id = plan.mission_id;
      assert.throws(() => closeWave(aar, { ...options, missionId: plan.mission_id, waveId: plan.wave_id }), /CAMPAIGN_CONTINUATION_BLOCKED/);
      const after = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
      assert.strictEqual(after.manifest_revision, before.manifest_revision, "denial must not persist a new wave or report");
    } finally {
      fs.rmSync(environment.root, { recursive: true, force: true });
    }
  });

  for (const reason of ["escalation", "expiry"]) run(`campaign ${reason} blocks stale lease calls and resume but permits result settlement and revocation`, () => {
    const environment = makeEnvironment(`live-dispatch-${reason}`, {
      createdAt: "2026-07-23T04:00:00+09:00", budgets: { max_elapsed_minutes: 16 }
    });
    try {
      const plan = waveFor(environment);
      plan.agents = [plan.agents[0]];
      const options = waveOptions(environment);
      const input = { command: "git status --short" };
      const draft = JSON.parse(fs.readFileSync(path.join(ROOT, "sample-payloads", "valid-dispatch-tool-policy.json"), "utf8"));
      delete draft.authorization;
      draft.schema_version = "0.1";
      draft.mission_id = plan.mission_id;
      draft.agent_id = plan.agents[0].agent_id;
      draft.approved_at = plan.created_at;
      draft.valid_until = plan.valid_until;
      draft.tool_rules = [{
        rule_id: "DTR-STATUS", mission_action: "Run deterministic validation.", tool_name: "Bash",
        operation_class: "process_execute", input_match: { mode: "exact_sha256", allowed_sha256: [inputDigest(input)] }, max_uses: 2
      }];
      plan.dispatch_control = {
        required: true, enforcement_level: "guardrail", gateway_exclusive: false,
        policy_authorizations: [{ agent_id: draft.agent_id, provider: draft.provider, policy_id: draft.id, draft_sha256: inputDigest(draft) }]
      };
      openWave(plan, options);
      authorizeDispatchPolicy(options, draft);
      const lease = issueLease(options, draft.id, { sessionId: "campaign-stop", providerAgentId: "main" });
      const identity = {
        missionId: plan.mission_id, waveId: plan.wave_id, agentId: draft.agent_id,
        provider: draft.provider, sessionId: "campaign-stop", providerAgentId: "main"
      };
      const hook = { hook_event_name: "PreToolUse", tool_use_id: "before-stop", tool_name: "Bash", tool_input: input };
      const admitted = admitToolRequest(options, identity, hook);
      assert.strictEqual(admitted.decision, "allow");
      if (reason === "escalation") persistPair(environment, checkpointFor(environment, 1, 1), "escalate");
      else options.now = "2026-07-23T04:16:00+09:00";
      assert.throws(() => openWave(plan, options), /CAMPAIGN_CONTINUATION_BLOCKED/);
      const denied = admitToolRequest(options, identity, { ...hook, tool_use_id: "after-stop" });
      assert.strictEqual(denied.decision, "deny");
      assert(denied.reason_codes.includes("CAMPAIGN_CONTINUATION_BLOCKED"));
      assert.throws(() => issueLease(options, draft.id, { sessionId: "new-session", providerAgentId: "main" }), /CAMPAIGN_CONTINUATION_BLOCKED/);
      const settled = completeToolRequest(options, identity, { ...hook, hook_event_name: "PostToolUse", tool_response: { exit_code: 0 } });
      assert.strictEqual(settled.status, "active");
      assert(admitToolRequest(options, identity, { ...hook, tool_use_id: "after-settlement" })
        .reason_codes.includes("CAMPAIGN_CONTINUATION_BLOCKED"));
      assert.strictEqual(sessionStart(options, identity, { source: "resume" }).status, "interrupted");
      const beforeResume = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
      assert.throws(() => resumeLease(options, lease.lease.id, {
        sessionId: "resume-stop", providerAgentId: "main"
      }), /CAMPAIGN_CONTINUATION_BLOCKED/);
      assert.strictEqual(verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot }).manifest_revision,
        beforeResume.manifest_revision, "denied resume must preserve the interrupted lineage");
      assert.strictEqual(revokeLease(options, lease.lease.id, "CAMPAIGN_STOP").status, "revoked");
    } finally {
      fs.rmSync(environment.root, { recursive: true, force: true });
    }
  });

  for (const condition of ["paused", "unpaired", "cross-mission"]) run(`${condition} campaign cannot open an adaptive wave`, () => {
    const environment = makeEnvironment(`guard-${condition}`, {
      createdAt: "2026-07-23T04:00:00+09:00", ...(condition === "paused" ? { status: "paused" } : {})
    });
    try {
      if (condition === "unpaired") persistCheckpoint(environment, checkpointFor(environment, 1, 1));
      const plan = waveFor(environment);
      if (condition === "cross-mission") plan.mission_id = "MIS-OTHER";
      const before = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
      assert.throws(() => openWave(plan, waveOptions(environment)), /CAMPAIGN_CONTINUATION_BLOCKED/);
      assert.strictEqual(verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot }).manifest_revision, before.manifest_revision);
    } finally {
      fs.rmSync(environment.root, { recursive: true, force: true });
    }
  });

  run("v0.4 start order carries receipt and comparative signature requirements", () => {
    const environment = makeEnvironment("v04-start", { schemaVersion: "0.4" });
    const order = supervise(environment);
    assert.strictEqual(order.status, "ready");
    assert.strictEqual(order.proof_requirements.signed_attestation_required, true);
    assert.strictEqual(order.proof_requirements.signed_comparative_attestation_required, true);
    assert.strictEqual(order.proof_requirements.minimum_valid_attestations, 2);
    assert.strictEqual(order.proof_requirements.minimum_independence_groups, 2);
    assert.strictEqual(order.trust_policy_admission.satisfied, true);
    assert.strictEqual(order.trust_policy_admission.receipt_quorum.eligible_verifier_count, 2);
    assert.strictEqual(order.trust_policy_admission.comparative_quorum.eligible_verifier_count, 2);
  });

  run("v0.4 campaign without enough comparative-purpose verifiers is blocked", () => {
    const environment = makeEnvironment("v04-report-purpose", {
      schemaVersion: "0.4",
      secondVerifierPurposes: ["verification_receipt"]
    });
    const order = supervise(environment);
    assert.strictEqual(order.status, "blocked");
    assert(order.blocking_codes.includes("TRUST_ADMISSION_COMPARATIVE_QUORUM_UNAVAILABLE"));
    assert.strictEqual(order.trust_policy_admission.receipt_quorum.satisfied, true);
    assert.strictEqual(order.trust_policy_admission.comparative_quorum.satisfied, false);
  });

  run("v0.4 campaign with an expired trust policy is blocked", () => {
    const environment = makeEnvironment("v04-expired-policy", {
      schemaVersion: "0.4",
      policyExpiresAt: "2026-07-21T08:30:00Z"
    });
    const order = supervise(environment);
    assert.strictEqual(order.status, "blocked");
    assert(order.blocking_codes.includes("TRUST_ADMISSION_POLICY_NOT_ACTIVE"));
    assert.strictEqual(order.trust_policy_admission.valid_until, "none");
  });

  run("v0.4 campaign cannot substitute a same-ID policy with a different digest", () => {
    const environment = makeEnvironment("v04-policy-reference", {
      schemaVersion: "0.4",
      trustReferenceSha: "f".repeat(64)
    });
    const order = supervise(environment);
    assert.strictEqual(order.status, "blocked");
    assert(order.blocking_codes.includes("TRUST_ADMISSION_POLICY_REFERENCE_INVALID"));
    assert.strictEqual(order.trust_policy_admission.satisfied, false);
  });

  run("new campaign opens cycle one", () => {
    const environment = makeEnvironment("start");
    const order = supervise(environment);
    assert.strictEqual(order.status, "ready");
    assert.strictEqual(order.transition, "start");
    assert.strictEqual(order.cycle_number, 1);
    assert.strictEqual(order.attempt_number, 1);
    assert.strictEqual(order.execution_authorized, true);
    assert.strictEqual(order.parent_decision_ref.decision_id, "none");
  });

  run("accepted state opens exact before-completion child", () => {
    const environment = makeEnvironment("advance");
    const checkpoint = checkpointFor(environment, 1, 1, { openCriteria: [] });
    const accepted = persistPair(environment, checkpoint, "accept_working_state", {
      task: "Run the mandatory completion checkpoint.",
      nextTrigger: "before_completion"
    });
    const order = supervise(environment);
    assert.strictEqual(order.status, "ready");
    assert.strictEqual(order.transition, "before_completion");
    assert.strictEqual(order.cycle_number, 2);
    assert.strictEqual(order.baseline_revision, accepted.decision.accepted_revision);
    assert.strictEqual(order.parent_decision_ref.relative_path, accepted.write.relative_path);
    assert.strictEqual(order.parent_decision_ref.sha256, accepted.write.sha256);
  });

  run("revision decision retries inside the same cycle", () => {
    const environment = makeEnvironment("retry");
    persistPair(environment, checkpointFor(environment, 1, 1), "revise_and_retry");
    const order = supervise(environment);
    assert.strictEqual(order.status, "ready");
    assert.strictEqual(order.transition, "retry");
    assert.strictEqual(order.cycle_number, 1);
    assert.strictEqual(order.attempt_number, 2);
    assert.strictEqual(order.budget_snapshot.retries_used_current_cycle, 1);
  });

  run("retry exhaustion blocks a fourth attempt", () => {
    const environment = makeEnvironment("retry-budget", { budgets: { max_retries_per_cycle: 2 } });
    persistPair(environment, checkpointFor(environment, 1, 1), "revise_and_retry");
    persistPair(environment, checkpointFor(environment, 1, 2), "revise_and_retry");
    persistPair(environment, checkpointFor(environment, 1, 3), "revise_and_retry");
    const order = supervise(environment);
    assert.strictEqual(order.status, "blocked");
    assert(order.blocking_codes.includes("CAMPAIGN_RETRY_BUDGET_EXHAUSTED"));
    assert.strictEqual(order.execution_authorized, false);
  });

  run("cycle exhaustion blocks follow-on work", () => {
    const environment = makeEnvironment("cycle-budget", { budgets: { max_cycles: 1 } });
    persistPair(environment, checkpointFor(environment, 1, 1), "accept_working_state");
    const order = supervise(environment);
    assert.strictEqual(order.status, "blocked");
    assert(order.blocking_codes.includes("CAMPAIGN_CYCLE_BUDGET_EXHAUSTED"));
  });

  run("complete decision freezes autonomous execution", () => {
    const environment = makeEnvironment("complete");
    const checkpoint = checkpointFor(environment, 1, 1, { trigger: "before_completion", openCriteria: [] });
    checkpoint.candidate.disposition = "no_change";
    persistPair(environment, checkpoint, "complete");
    const order = supervise(environment);
    assert.strictEqual(order.status, "completed");
    assert.strictEqual(order.transition, "hold");
    assert.strictEqual(order.execution_authorized, false);
    assert.strictEqual(order.release_authorized, false);
    assert.strictEqual(order.human_decision_required, true);
  });

  run("escalation holds for human decision", () => {
    const environment = makeEnvironment("escalate");
    persistPair(environment, checkpointFor(environment, 1, 1), "escalate", { blockingCodes: ["HUMAN_APPROVAL_REQUIRED"] });
    const order = supervise(environment);
    assert.strictEqual(order.status, "awaiting_human");
    assert.strictEqual(order.execution_authorized, false);
  });

  run("checkpoint without decision fails closed", () => {
    const environment = makeEnvironment("orphan");
    persistCheckpoint(environment, checkpointFor(environment, 1, 1));
    const order = supervise(environment);
    assert.strictEqual(order.status, "blocked");
    assert(order.blocking_codes.includes("CAMPAIGN_CHECKPOINT_WITHOUT_DECISION"));
  });

  run("forged cycle-two parent fails closed", () => {
    const environment = makeEnvironment("forged-parent");
    const accepted = persistPair(environment, checkpointFor(environment, 1, 1), "accept_working_state");
    const forged = checkpointFor(environment, 2, 1, { parent: accepted });
    forged.parent_decision_ref.sha256 = "f".repeat(64);
    persistPair(environment, forged, "revise_and_retry");
    const order = supervise(environment);
    assert.strictEqual(order.status, "blocked");
    assert(order.blocking_codes.includes("CAMPAIGN_PARENT_LINEAGE_INVALID"));
  });

  run("forged completion decision fails closed", () => {
    const environment = makeEnvironment("forged-completion");
    persistPair(environment, checkpointFor(environment, 1, 1, { trigger: "wave_end", openCriteria: [] }), "complete");
    const order = supervise(environment);
    assert.strictEqual(order.status, "blocked");
    assert(order.blocking_codes.includes("CAMPAIGN_COMPLETION_DECISION_INVALID"));
  });

  run("rolled-back cumulative failure counter fails closed", () => {
    const environment = makeEnvironment("counter-rollback");
    persistPair(environment, checkpointFor(environment, 1, 1, { failedExperiments: 2 }), "revise_and_retry");
    persistPair(environment, checkpointFor(environment, 1, 2, { failedExperiments: 1 }), "revise_and_retry");
    const order = supervise(environment);
    assert.strictEqual(order.status, "blocked");
    assert(order.blocking_codes.includes("CAMPAIGN_FAILURE_COUNTER_ROLLBACK"));
  });

  run("decision with forged manifest proof fails closed", () => {
    const environment = makeEnvironment("forged-proof");
    const checkpoint = checkpointFor(environment, 1, 1);
    const checkpointWrite = persistCheckpoint(environment, checkpoint);
    const decision = decisionFor(environment, checkpoint, "revise_and_retry");
    decision.proof.repository_manifest_sha256 = "f".repeat(64);
    const write = writeRepositoryArtifact({
      repositoryPath: environment.repositoryPath,
      artifactRoot: environment.artifactRoot,
      missionId: environment.campaign.mission_id,
      waveId: "C1",
      kind: "self-improvement-decisions",
      artifactId: decision.id,
      payload: decision,
      createdAt: decision.decided_at
    });
    environment.decisions.push({ checkpoint, checkpointWrite, decision, write });
    const order = supervise(environment);
    assert.strictEqual(order.status, "blocked");
    assert(order.blocking_codes.includes("CAMPAIGN_DECISION_MANIFEST_PROOF_INVALID"));
  });

  run("paused campaign always emits a hold", () => {
    const environment = makeEnvironment("paused", { status: "paused" });
    const order = supervise(environment);
    assert.strictEqual(order.status, "awaiting_human");
    assert.strictEqual(order.transition, "hold");
    assert.strictEqual(order.execution_authorized, false);
  });

  run("persisted orders survive the complete campaign lifecycle", () => {
    const environment = makeEnvironment("full-lifecycle", { createdAt: new Date(Date.now() - 3600000).toISOString() });
    const start = persistSupervisor(environment);
    assert.strictEqual(start.transition, "start");
    const cycleOne = checkpointFor(environment, 1, 1, { openCriteria: [] });
    const accepted = persistPair(environment, cycleOne, "accept_working_state", {
      task: "Run the mandatory completion checkpoint.",
      nextTrigger: "before_completion"
    });
    const completionOrder = persistSupervisor(environment);
    assert.strictEqual(completionOrder.transition, "before_completion");
    const cycleTwo = checkpointFor(environment, 2, 1, {
      parent: accepted,
      trigger: "before_completion",
      openCriteria: [],
      baselineRevision: accepted.decision.accepted_revision,
      candidateRevision: accepted.decision.accepted_revision
    });
    cycleTwo.candidate.disposition = "no_change";
    persistPair(environment, cycleTwo, "complete");
    const completedOrder = persistSupervisor(environment);
    assert.strictEqual(completedOrder.status, "completed");
    assert.strictEqual(completedOrder.transition, "hold");
    assert.notStrictEqual(completedOrder.id, completionOrder.id);
    assert.notStrictEqual(completionOrder.id, start.id);
  });

  run("persisted order is idempotent across manifest growth", () => {
    const environment = makeEnvironment("idempotent", { createdAt: new Date().toISOString() });
    const args = [
      "campaign-supervisor.js",
      "--repository", environment.repositoryPath,
      "--artifact-root", environment.artifactRoot,
      "--campaign", environment.campaign.id,
      "--write-artifact"
    ];
    const first = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
    assert.strictEqual(first.status, 0, first.stderr || first.stdout);
    const afterFirst = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
    const second = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
    assert.strictEqual(second.status, 0, second.stderr || second.stdout);
    const afterSecond = verifyRepositoryArtifacts({ repositoryPath: environment.repositoryPath, artifactRoot: environment.artifactRoot });
    assert.strictEqual(afterSecond.manifest_revision, afterFirst.manifest_revision);
    assert.strictEqual(JSON.parse(second.stdout).id, JSON.parse(first.stdout).id);
    assert(second.stderr.includes("Artifact already current"));
  });

  process.stdout.write(`${JSON.stringify({ valid: true, fixture_count: completed.length, fixtures: completed }, null, 2)}\n`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
