#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { superviseCampaign } = require("./campaign-supervisor");
const { resolveRepository, verifyRepositoryArtifacts, writeRepositoryArtifact } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { publicKeyId } = require("./verification-attestation");

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
  campaign.created_at = "2026-07-21T09:00:00Z";
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
        sha256: trustPolicyWrite.sha256
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
  checkpoint.progress.elapsed_minutes = options.elapsedMinutes || cycle * 10 + attempt;
  checkpoint.progress.open_acceptance_criteria = options.openCriteria === undefined
    ? ["A completion checkpoint is recorded."]
    : options.openCriteria;
  checkpoint.generated_at = new Date(Date.parse(environment.campaign.created_at) + (cycle * 60 + attempt) * 60000).toISOString();
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

function supervise(environment) {
  const result = superviseCampaign({
    repositoryPath: environment.repositoryPath,
    artifactRoot: environment.artifactRoot,
    campaignId: environment.campaign.id,
    evaluatedAt: "2026-07-21T09:00:00Z"
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

try {
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
    const environment = makeEnvironment("full-lifecycle");
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
    const environment = makeEnvironment("idempotent");
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
