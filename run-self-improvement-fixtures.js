#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyzeImprovement } = require("./autonomous-improvement-controller");
const { reportDigest } = require("./comparative-evaluation-runner");
const { computeRepositoryState, receiptDigest } = require("./verification-runner");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");

const ROOT = __dirname;
const CAMPAIGN_PATH = path.join(ROOT, "sample-payloads", "valid-self-improvement-campaign.json");
const CHECKPOINT_PATH = path.join(ROOT, "sample-payloads", "valid-self-improvement-checkpoint.json");
const RECEIPT_PATH = path.join(ROOT, "sample-payloads", "valid-verification-receipt.json");
const COMPARISON_PLAN_PATH = path.join(ROOT, "sample-payloads", "valid-comparative-evaluation-plan.json");
const COMPARISON_SET_PATH = path.join(ROOT, "sample-payloads", "valid-comparative-evaluation-set.json");
const COMPARISON_REPORT_PATH = path.join(ROOT, "sample-payloads", "valid-comparative-evaluation-report.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function validateDecision(decision, temporaryRoot, name) {
  const outputPath = path.join(temporaryRoot, `${name}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(decision, null, 2)}\n`);
  const result = spawnSync("node", ["validator-cli-prototype/validate.js", outputPath, "self-improvement-decision"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.strictEqual(result.status, 0, result.stdout || result.stderr);
}

function proofFor(campaign, checkpoint) {
  const receipt = clone(readJson(RECEIPT_PATH));
  const ref = checkpoint.verification_receipts[0];
  receipt.id = ref.receipt_id;
  receipt.plan_id = ref.plan_id;
  receipt.campaign_id = campaign.id;
  receipt.mission_id = campaign.mission_id;
  receipt.cycle_number = checkpoint.cycle_number;
  receipt.candidate_id = checkpoint.candidate.id;
  receipt.candidate_revision = checkpoint.target.candidate_revision;
  receipt.repository_binding = clone(checkpoint.repository_binding);
  receipt.checks[0].id = ref.required_check_ids[0];
  receipt.finished_at = new Date(Date.parse(checkpoint.generated_at) - 1000).toISOString();
  receipt.started_at = new Date(Date.parse(checkpoint.generated_at) - 2000).toISOString();
  receipt.receipt_sha256 = receiptDigest(receipt);
  return {
    receipts: new Map([[receipt.id, receipt]]),
    parentDecision: null,
    approvalScope: null,
    consumptionEvent: null,
    manifestRevision: 3,
    manifestSha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  };
}

function attachComparison(checkpoint, proof) {
  const report = clone(readJson(COMPARISON_REPORT_PATH));
  checkpoint.comparative_evaluation_ref = {
    required: true,
    report_id: report.id,
    relative_path: `repositories/cannae-os-aaaaaaaaaaaa/missions/${checkpoint.mission_id}/C1/comparative-evaluation-reports/${report.id}.json`,
    sha256: "b".repeat(64)
  };
  proof.comparativeReport = report;
  proof.comparativePlan = clone(readJson(COMPARISON_PLAN_PATH));
  proof.comparativeEvaluationSet = clone(readJson(COMPARISON_SET_PATH));
  return report;
}

function syncObservationOutput(execution) {
  const bytes = Buffer.from(`${JSON.stringify(execution.observation, null, 2)}\n`);
  execution.stdout.byte_size = bytes.length;
  execution.stdout.sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  execution.stdout.truncated = false;
}

function consumedApproval(checkpoint) {
  const binding = checkpoint.approval_binding;
  const approval = {
    schema_version: "0.1",
    type: "APPROVAL_SCOPE",
    id: binding.approval_scope_ref.artifact_id,
    mission_id: checkpoint.mission_id,
    approval_request_id: "APR-Cannae-Policy",
    tool_request_id: "TR-Cannae-Policy",
    granted_by: "USER",
    granted_to: "S3",
    classification: "internal",
    decision: "approve_once",
    scope: {
      action: binding.action,
      tool: binding.tool,
      target: binding.target,
      max_executions: 1,
      valid_from: "2026-07-21T17:00:00+09:00",
      expires_at: "2026-07-21T19:00:00+09:00"
    },
    conditions: ["Promote only the named candidate."],
    rollback: ["Revert the candidate if proof fails."],
    evidence_required: ["Verification receipt."],
    release_review_required: true,
    status: "active",
    created_at: "2026-07-21T17:00:00+09:00"
  };
  const event = {
    schema_version: "0.1",
    type: "APPROVAL_CONSUMPTION_EVENT",
    id: binding.consumption_event_ref.artifact_id,
    mission_id: checkpoint.mission_id,
    approval_scope_id: approval.id,
    approval_request_id: approval.approval_request_id,
    tool_request_id: approval.tool_request_id,
    execution_id: checkpoint.id,
    actor: "S3",
    classification: "internal",
    action: binding.action,
    tool: binding.tool,
    target: binding.target,
    consumed_at: "2026-07-21T18:23:00+09:00",
    execution_count_after: 1,
    result: "executed",
    approval_status_after: "consumed",
    scope_snapshot: {
      decision: approval.decision,
      status_before: approval.status,
      granted_to: approval.granted_to,
      action: approval.scope.action,
      tool: approval.scope.tool,
      target: approval.scope.target,
      max_executions: approval.scope.max_executions,
      valid_from: approval.scope.valid_from,
      expires_at: approval.scope.expires_at
    },
    evidence: ["Execution is bound to this checkpoint and candidate."]
  };
  return { approval, event };
}

const baseCampaign = readJson(CAMPAIGN_PATH);
const baseCheckpoint = readJson(CHECKPOINT_PATH);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-self-improvement-"));
const cases = [];

function runCase(name, mutate, expected, mutateProof) {
  const campaign = clone(baseCampaign);
  const checkpoint = clone(baseCheckpoint);
  mutate(campaign, checkpoint);
  const proof = proofFor(campaign, checkpoint);
  if (mutateProof) mutateProof(proof, campaign, checkpoint);
  const decision = analyzeImprovement(campaign, checkpoint, proof);
  assert.strictEqual(decision.decision, expected.decision, `${name}: ${JSON.stringify(decision, null, 2)}`);
  assert.strictEqual(decision.execution_authorized, expected.executionAuthorized, name);
  for (const code of expected.blockingCodes || []) assert(decision.blocking_codes.includes(code), `${name}: missing ${code}`);
  assert.strictEqual(decision.release_authorized, false, name);
  validateDecision(decision, temporaryRoot, name.replace(/[^a-z0-9]+/gi, "-"));
  cases.push(name);
}

try {
  runCase("proof-backed in-progress work is accepted", () => {}, {
    decision: "accept_working_state",
    executionAuthorized: true
  });

  runCase("small non-repair delta is revised", (_campaign, checkpoint) => {
    checkpoint.metric_results[0].before = 0.9;
    checkpoint.metric_results[0].after = 0.91;
    checkpoint.metric_results[1].before = 0.85;
    checkpoint.metric_results[1].after = 0.86;
  }, { decision: "revise_and_retry", executionAuthorized: true });

  runCase("executed verification failure rolls back candidate work", () => {}, {
    decision: "rollback",
    executionAuthorized: true,
    blockingCodes: ["VERIFICATION_EXECUTION_FAILED"]
  }, proof => {
    const receipt = proof.receipts.values().next().value;
    receipt.checks[0].status = "failed";
    receipt.checks[0].exit_code = 1;
    receipt.overall_status = "failed";
    receipt.receipt_sha256 = receiptDigest(receipt);
  });

  runCase("missing verification receipt escalates", () => {}, {
    decision: "escalate",
    executionAuthorized: false,
    blockingCodes: ["VERIFICATION_RECEIPT_MISSING", "VERIFICATION_PROOF_MISSING"]
  }, proof => proof.receipts.clear());

  runCase("tampered verification receipt escalates", () => {}, {
    decision: "escalate",
    executionAuthorized: false,
    blockingCodes: ["VERIFICATION_RECEIPT_INTEGRITY_INVALID"]
  }, proof => {
    proof.receipts.values().next().value.checks[0].stdout.excerpt = "tampered";
  });

  runCase("policy change without consumed approval escalates", (_campaign, checkpoint) => {
    checkpoint.target.target_type = "policy";
    checkpoint.target.state = "candidate";
    checkpoint.target.artifact_paths = ["docs/policy.md"];
    checkpoint.candidate.changed_files = ["docs/policy.md"];
    checkpoint.externalities.policy_changed = true;
    checkpoint.independent_evaluation = {required: true, evaluator: "EVALUATOR", status: "passed", evidence_receipt_ids: ["VR-Cannae-001"]};
  }, { decision: "escalate", executionAuthorized: false, blockingCodes: ["HUMAN_APPROVAL_REQUIRED", "APPROVAL_PROOF_MISSING"] });

  runCase("policy candidate with exact consumed approval is accepted", (_campaign, checkpoint) => {
    checkpoint.target.target_type = "policy";
    checkpoint.target.state = "candidate";
    checkpoint.target.artifact_paths = ["docs/policy.md"];
    checkpoint.candidate.changed_files = ["docs/policy.md"];
    checkpoint.externalities.policy_changed = true;
    checkpoint.independent_evaluation = {required: true, evaluator: "EVALUATOR", status: "passed", evidence_receipt_ids: ["VR-Cannae-001"]};
    checkpoint.approval_binding = {
      required: true,
      action: "promote_self_improvement_candidate",
      tool: "autonomous-improvement-controller",
      target: checkpoint.candidate.id,
      approval_scope_ref: {artifact_id: "APS-Cannae-Policy", relative_path: "repositories/example/approval.json", sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
      consumption_event_ref: {artifact_id: "ACE-Cannae-Policy", relative_path: "repositories/example/consumption.json", sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
    };
  }, { decision: "accept_working_state", executionAuthorized: true }, (proof, _campaign, checkpoint) => {
    const values = consumedApproval(checkpoint);
    proof.approvalScope = values.approval;
    proof.consumptionEvent = values.event;
  });

  runCase("reused approval event for another checkpoint escalates", (_campaign, checkpoint) => {
    checkpoint.target.target_type = "policy";
    checkpoint.target.state = "candidate";
    checkpoint.target.artifact_paths = ["docs/policy.md"];
    checkpoint.candidate.changed_files = ["docs/policy.md"];
    checkpoint.externalities.policy_changed = true;
    checkpoint.independent_evaluation = {required: true, evaluator: "EVALUATOR", status: "passed", evidence_receipt_ids: ["VR-Cannae-001"]};
    checkpoint.approval_binding = {
      required: true,
      action: "promote_self_improvement_candidate",
      tool: "autonomous-improvement-controller",
      target: checkpoint.candidate.id,
      approval_scope_ref: {artifact_id: "APS-Cannae-Policy", relative_path: "repositories/example/approval.json", sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
      consumption_event_ref: {artifact_id: "ACE-Cannae-Policy", relative_path: "repositories/example/consumption.json", sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
    };
  }, { decision: "escalate", executionAuthorized: false, blockingCodes: ["APPROVAL_CONSUMPTION_NOT_UNIQUE_TO_CHECKPOINT"] }, (proof, _campaign, checkpoint) => {
    const values = consumedApproval(checkpoint);
    values.event.execution_id = "SCP-Another-Checkpoint";
    proof.approvalScope = values.approval;
    proof.consumptionEvent = values.event;
  });

  runCase("destructive self-improvement terminates", (_campaign, checkpoint) => {
    checkpoint.candidate.change_class = "destructive";
    checkpoint.externalities.destructive_action = true;
  }, { decision: "terminate", executionAuthorized: false, blockingCodes: ["PROHIBITED_EXTERNALITY"] });

  runCase("completion checkpoint completes working state only", (_campaign, checkpoint) => {
    checkpoint.trigger = "before_completion";
    checkpoint.target.state = "working_state";
    checkpoint.candidate.disposition = "no_change";
    checkpoint.candidate.summary = "No further bounded change is required.";
    checkpoint.candidate.proposed_actions = [];
    checkpoint.candidate.changed_files = [];
    checkpoint.candidate.required_permissions = ["checkpoint", "persist_artifact"];
    checkpoint.candidate.rollback_steps = [];
    checkpoint.candidate.expected_metric_delta = 0;
    checkpoint.progress.completed_acceptance_criteria.push(...checkpoint.progress.open_acceptance_criteria);
    checkpoint.progress.open_acceptance_criteria = [];
  }, { decision: "complete", executionAuthorized: false });

  runCase("follow-on cycle without parent proof escalates", (_campaign, checkpoint) => {
    checkpoint.cycle_number = 2;
    checkpoint.parent_decision_id = "SID-Cannae-Parent";
    checkpoint.parent_decision_ref = {decision_id: "SID-Cannae-Parent", relative_path: "repositories/example/parent.json", sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"};
  }, { decision: "escalate", executionAuthorized: false, blockingCodes: ["PARENT_DECISION_PROOF_MISSING"] });

  runCase("forged parent baseline escalates", (_campaign, checkpoint) => {
    checkpoint.cycle_number = 2;
    checkpoint.parent_decision_id = "SID-Cannae-Parent";
    checkpoint.parent_decision_ref = {decision_id: "SID-Cannae-Parent", relative_path: "repositories/example/parent.json", sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"};
  }, { decision: "escalate", executionAuthorized: false, blockingCodes: ["PARENT_BASELINE_REVISION_MISMATCH"] }, (proof, campaign, checkpoint) => {
    const parentCheckpoint = clone(baseCheckpoint);
    const parentProof = proofFor(campaign, parentCheckpoint);
    const parent = analyzeImprovement(campaign, parentCheckpoint, parentProof);
    parent.id = checkpoint.parent_decision_id;
    parent.accepted_revision = "WT-not-the-declared-baseline";
    proof.parentDecision = parent;
  });

  runCase("control-plane candidate without independent proof escalates", (_campaign, checkpoint) => {
    checkpoint.target.target_type = "runtime_control";
    checkpoint.target.state = "candidate";
    checkpoint.target.artifact_paths = ["runtime/controller.js"];
    checkpoint.candidate.changed_files = ["runtime/controller.js"];
  }, { decision: "escalate", executionAuthorized: false, blockingCodes: ["INDEPENDENT_CONTROL_PLANE_EVALUATION_MISSING"] });

  runCase("runtime-control candidate with paired canary evidence is accepted", (_campaign, checkpoint) => {
    checkpoint.target.target_type = "runtime_control";
    checkpoint.target.state = "candidate";
    checkpoint.target.artifact_paths = ["runtime/controller.js"];
    checkpoint.candidate.changed_files = ["runtime/controller.js"];
    checkpoint.independent_evaluation = {required: true, evaluator: "EVALUATOR", status: "passed", evidence_receipt_ids: ["VR-Cannae-001"]};
  }, { decision: "accept_working_state", executionAuthorized: true }, (proof, _campaign, checkpoint) => {
    attachComparison(checkpoint, proof);
  });

  runCase("runtime-control regression rolls back candidate", (_campaign, checkpoint) => {
    checkpoint.target.target_type = "runtime_control";
    checkpoint.target.state = "candidate";
    checkpoint.target.artifact_paths = ["runtime/controller.js"];
    checkpoint.candidate.changed_files = ["runtime/controller.js"];
    checkpoint.metric_results[0].after = 0.89;
    checkpoint.metric_results[0].hard_gate_passed = false;
    checkpoint.independent_evaluation = {required: true, evaluator: "EVALUATOR", status: "passed", evidence_receipt_ids: ["VR-Cannae-001"]};
  }, { decision: "rollback", executionAuthorized: true, blockingCodes: ["COMPARATIVE_CANARY_ROLLBACK_REQUIRED"] }, (proof, _campaign, checkpoint) => {
    const report = attachComparison(checkpoint, proof);
    report.executions.candidate.observation.metric_results[0].value = 0.89;
    syncObservationOutput(report.executions.candidate);
    report.comparisons[0] = {
      ...report.comparisons[0],
      candidate_value: 0.89,
      normalized_delta: 0.09,
      absolute_threshold_passed: false,
      passed: false
    };
    report.outcome = "rollback";
    report.working_state_promotion_recommended = false;
    report.blocking_codes = ["COMPARISON_ABSOLUTE_THRESHOLD_FAILED", "COMPARISON_HARD_GATE_FAILED"];
    report.report_sha256 = reportDigest(report);
  });

  runCase("recomputed canary mismatch escalates", (_campaign, checkpoint) => {
    checkpoint.target.target_type = "skill";
    checkpoint.target.state = "candidate";
    checkpoint.target.artifact_paths = ["codex-skills/controls-doctrine-operator/SKILL.md"];
    checkpoint.candidate.changed_files = ["codex-skills/controls-doctrine-operator/SKILL.md"];
    checkpoint.independent_evaluation = {required: true, evaluator: "EVALUATOR", status: "passed", evidence_receipt_ids: ["VR-Cannae-001"]};
  }, { decision: "escalate", executionAuthorized: false, blockingCodes: ["COMPARATIVE_CANARY_RECOMPUTATION_MISMATCH"] }, (proof, _campaign, checkpoint) => {
    const report = attachComparison(checkpoint, proof);
    report.target_type = "skill";
    proof.comparativePlan.target_type = "skill";
    report.comparisons[0].candidate_value = 0.94;
    report.report_sha256 = reportDigest(report);
  });

  const repositoryPath = path.join(temporaryRoot, "target-repository");
  const artifactRoot = path.join(temporaryRoot, "artifacts");
  fs.mkdirSync(repositoryPath, { recursive: true });
  git(repositoryPath, ["init", "--quiet"]);
  git(repositoryPath, ["config", "user.email", "fixtures@example.com"]);
  git(repositoryPath, ["config", "user.name", "Fixtures"]);
  git(repositoryPath, ["remote", "add", "origin", "git@github.com:example/self-improvement-target.git"]);
  fs.writeFileSync(path.join(repositoryPath, "verify.js"), "process.stdout.write('proof check passed\\n');\n");
  git(repositoryPath, ["add", "verify.js"]);
  git(repositoryPath, ["commit", "--quiet", "-m", "fixture baseline"]);
  const repository = resolveRepository(repositoryPath);

  const bootstrapResult = spawnSync("node", [
    "self-improvement-campaign-init.js",
    "--repository", repositoryPath,
    "--artifact-root", artifactRoot,
    "--mission", "MIS-Bootstrap-001",
    "--campaign", "SIC-Bootstrap-001",
    "--objective", "Improve an active implementation through proof-backed cycles.",
    "--end-state", "The accepted state passes every criterion.",
    "--criterion", "All deterministic tests pass.",
    "--criterion", "The completion checkpoint is recorded.",
    "--created-at", "2026-07-21T18:00:00+09:00",
    "--write-artifact"
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(bootstrapResult.status, 0, bootstrapResult.stdout || bootstrapResult.stderr);
  const campaign = JSON.parse(bootstrapResult.stdout);
  assert.strictEqual(campaign.schema_version, "0.2");
  assert.strictEqual(campaign.verification_policy.proof_required, true);
  cases.push("campaign bootstrap binds proof policy to the repository");

  const state = computeRepositoryState(repositoryPath);
  const candidateRevision = `WT-${state.worktree_fingerprint}`;
  const plan = {
    schema_version: "0.1",
    type: "VerificationPlan",
    id: "VP-Bootstrap-001",
    campaign_id: campaign.id,
    mission_id: campaign.mission_id,
    cycle_number: 1,
    candidate_id: "CAN-Bootstrap-001",
    candidate_revision: candidateRevision,
    repository_binding: {repository_key: repository.key, identity_fingerprint: repository.identity_fingerprint},
    expected_repository_state: state,
    checks: [{id: "VCK-Bootstrap-001", purpose: "Run deterministic proof fixture.", executable: "node", args: ["verify.js"], working_directory: ".", timeout_ms: 30000, expected_exit_codes: [0]}],
    created_at: "2026-07-21T18:10:00+09:00"
  };
  const campaignFile = path.join(temporaryRoot, "campaign.json");
  const planFile = path.join(temporaryRoot, "plan.json");
  fs.writeFileSync(campaignFile, `${JSON.stringify(campaign, null, 2)}\n`);
  fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  const verificationRun = spawnSync("node", [
    "verification-runner.js", campaignFile, planFile,
    "--repository", repositoryPath,
    "--artifact-root", artifactRoot,
    "--write-artifact"
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(verificationRun.status, 0, verificationRun.stdout || verificationRun.stderr);
  const receipt = JSON.parse(verificationRun.stdout);
  assert.strictEqual(receipt.overall_status, "passed");
  assert.strictEqual(receipt.runner.shell_used, false);
  const manifestPath = path.join(artifactRoot, "repositories", repository.key, "manifest.json");
  let manifest = readJson(manifestPath);
  const receiptEntry = manifest.artifacts.find(item => item.kind === "verification-receipts" && item.artifact_id === receipt.id);
  assert(receiptEntry);

  const checkpoint = clone(baseCheckpoint);
  checkpoint.id = "SCP-Bootstrap-001";
  checkpoint.campaign_id = campaign.id;
  checkpoint.mission_id = campaign.mission_id;
  checkpoint.repository_binding = {repository_key: repository.key, identity_fingerprint: repository.identity_fingerprint};
  checkpoint.target.baseline_revision = repository.head_commit;
  checkpoint.target.candidate_revision = candidateRevision;
  checkpoint.candidate.id = plan.candidate_id;
  checkpoint.metric_results = [
    {dimension_id: "correctness", before: 0.5, after: 0.95, hard_gate_passed: true, evidence_receipt_ids: [receipt.id]},
    {dimension_id: "completeness", before: 0.5, after: 0.9, hard_gate_passed: true, evidence_receipt_ids: [receipt.id]},
    {dimension_id: "verification", before: 0.5, after: 1, hard_gate_passed: true, evidence_receipt_ids: [receipt.id]}
  ];
  checkpoint.verification_receipts = [{
    receipt_id: receipt.id,
    plan_id: plan.id,
    relative_path: receiptEntry.relative_path,
    sha256: receiptEntry.sha256,
    required_check_ids: ["VCK-Bootstrap-001"]
  }];
  checkpoint.generated_at = new Date(Date.parse(receipt.finished_at) + 1000).toISOString();
  const checkpointFile = path.join(temporaryRoot, "checkpoint.json");
  fs.writeFileSync(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
  const controllerRun = spawnSync("node", [
    "autonomous-improvement-controller.js", campaignFile, checkpointFile,
    "--repository", repositoryPath,
    "--artifact-root", artifactRoot,
    "--write-artifact"
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(controllerRun.status, 0, controllerRun.stdout || controllerRun.stderr);
  const decision = JSON.parse(controllerRun.stdout);
  assert.strictEqual(decision.decision, "accept_working_state");
  assert.deepStrictEqual(decision.proof.verification_receipt_ids, [receipt.id]);
  manifest = readJson(manifestPath);
  const parentDecisionEntry = manifest.artifacts.find(item => item.kind === "self-improvement-decisions" && item.artifact_id === decision.id);
  assert(parentDecisionEntry);
  cases.push("runtime executes proof and controller reloads it from the repository manifest");

  const plan2 = clone(plan);
  plan2.id = "VP-Bootstrap-002";
  plan2.cycle_number = 2;
  plan2.candidate_id = "CAN-Bootstrap-002";
  plan2.checks[0].id = "VCK-Bootstrap-002";
  plan2.created_at = new Date(Date.parse(receipt.finished_at) + 1000).toISOString();
  const plan2File = path.join(temporaryRoot, "plan2.json");
  fs.writeFileSync(plan2File, `${JSON.stringify(plan2, null, 2)}\n`);
  const verificationRun2 = spawnSync("node", [
    "verification-runner.js", campaignFile, plan2File,
    "--repository", repositoryPath,
    "--artifact-root", artifactRoot,
    "--write-artifact"
  ], {cwd: ROOT, encoding: "utf8"});
  assert.strictEqual(verificationRun2.status, 0, verificationRun2.stdout || verificationRun2.stderr);
  const receipt2 = JSON.parse(verificationRun2.stdout);
  manifest = readJson(manifestPath);
  const receipt2Entry = manifest.artifacts.find(item => item.kind === "verification-receipts" && item.artifact_id === receipt2.id);
  const checkpoint2 = clone(checkpoint);
  checkpoint2.id = "SCP-Bootstrap-002";
  checkpoint2.parent_decision_id = decision.id;
  checkpoint2.parent_decision_ref = {decision_id: decision.id, relative_path: parentDecisionEntry.relative_path, sha256: parentDecisionEntry.sha256};
  checkpoint2.cycle_number = 2;
  checkpoint2.trigger = "before_completion";
  checkpoint2.target.state = "working_state";
  checkpoint2.target.baseline_revision = decision.accepted_revision;
  checkpoint2.target.candidate_revision = receipt2.candidate_revision;
  checkpoint2.candidate.id = plan2.candidate_id;
  checkpoint2.candidate.disposition = "no_change";
  checkpoint2.candidate.summary = "No further bounded change is required.";
  checkpoint2.candidate.proposed_actions = [];
  checkpoint2.candidate.changed_files = [];
  checkpoint2.candidate.required_permissions = ["checkpoint", "persist_artifact"];
  checkpoint2.candidate.rollback_steps = [];
  checkpoint2.candidate.expected_metric_delta = 0;
  checkpoint2.metric_results.forEach(metric => { metric.evidence_receipt_ids = [receipt2.id]; });
  checkpoint2.verification_receipts = [{receipt_id: receipt2.id, plan_id: plan2.id, relative_path: receipt2Entry.relative_path, sha256: receipt2Entry.sha256, required_check_ids: ["VCK-Bootstrap-002"]}];
  checkpoint2.progress.completed_acceptance_criteria = clone(campaign.objective.acceptance_criteria);
  checkpoint2.progress.open_acceptance_criteria = [];
  checkpoint2.generated_at = new Date(Date.parse(receipt2.finished_at) + 1000).toISOString();
  const checkpoint2File = path.join(temporaryRoot, "checkpoint2.json");
  fs.writeFileSync(checkpoint2File, `${JSON.stringify(checkpoint2, null, 2)}\n`);
  const completionRun = spawnSync("node", [
    "autonomous-improvement-controller.js", campaignFile, checkpoint2File,
    "--repository", repositoryPath,
    "--artifact-root", artifactRoot,
    "--write-artifact"
  ], {cwd: ROOT, encoding: "utf8"});
  assert.strictEqual(completionRun.status, 0, completionRun.stdout || completionRun.stderr);
  const completionDecision = JSON.parse(completionRun.stdout);
  assert.strictEqual(completionDecision.decision, "complete");
  assert.strictEqual(completionDecision.proof.parent_decision_id, decision.id);
  cases.push("follow-on completion reloads and verifies the accepted parent decision");

  const policyCheckpoint = clone(checkpoint);
  policyCheckpoint.id = "SCP-Bootstrap-Policy";
  policyCheckpoint.target.target_type = "policy";
  policyCheckpoint.target.state = "candidate";
  policyCheckpoint.target.artifact_paths = ["docs/policy.md"];
  policyCheckpoint.candidate.changed_files = ["docs/policy.md"];
  policyCheckpoint.externalities.policy_changed = true;
  policyCheckpoint.independent_evaluation = {required: true, evaluator: "EVALUATOR", status: "passed", evidence_receipt_ids: [receipt.id]};
  policyCheckpoint.approval_binding = {
    required: true,
    action: "promote_self_improvement_candidate",
    tool: "autonomous-improvement-controller",
    target: policyCheckpoint.candidate.id,
    approval_scope_ref: {artifact_id: "APS-Bootstrap-Policy", relative_path: "pending", sha256: "none"},
    consumption_event_ref: {artifact_id: "ACE-Bootstrap-Policy", relative_path: "pending", sha256: "none"}
  };
  policyCheckpoint.generated_at = new Date(Date.parse(receipt.finished_at) + 2000).toISOString();
  const approvalPair = consumedApproval(policyCheckpoint);
  approvalPair.approval.id = "APS-Bootstrap-Policy";
  approvalPair.approval.mission_id = campaign.mission_id;
  approvalPair.approval.approval_request_id = "APR-Bootstrap-Policy";
  approvalPair.approval.tool_request_id = "TR-Bootstrap-Policy";
  approvalPair.approval.scope.valid_from = "2026-01-01T00:00:00Z";
  approvalPair.approval.scope.expires_at = "2027-01-01T00:00:00Z";
  approvalPair.approval.created_at = "2026-01-01T00:00:00Z";
  approvalPair.event.id = "ACE-Bootstrap-Policy";
  approvalPair.event.mission_id = campaign.mission_id;
  approvalPair.event.approval_scope_id = approvalPair.approval.id;
  approvalPair.event.approval_request_id = approvalPair.approval.approval_request_id;
  approvalPair.event.tool_request_id = approvalPair.approval.tool_request_id;
  approvalPair.event.execution_id = policyCheckpoint.id;
  approvalPair.event.consumed_at = new Date(Date.parse(receipt.finished_at) + 1000).toISOString();
  approvalPair.event.scope_snapshot.valid_from = approvalPair.approval.scope.valid_from;
  approvalPair.event.scope_snapshot.expires_at = approvalPair.approval.scope.expires_at;
  const approvalWrite = writeRepositoryArtifact({repositoryPath, artifactRoot, missionId: campaign.mission_id, waveId: "C1", kind: "approval-scopes", artifactId: approvalPair.approval.id, payload: approvalPair.approval});
  const eventWrite = writeRepositoryArtifact({repositoryPath, artifactRoot, missionId: campaign.mission_id, waveId: "C1", kind: "approval-consumption-events", artifactId: approvalPair.event.id, payload: approvalPair.event});
  policyCheckpoint.approval_binding.approval_scope_ref = {artifact_id: approvalPair.approval.id, relative_path: approvalWrite.relative_path, sha256: approvalWrite.sha256};
  policyCheckpoint.approval_binding.consumption_event_ref = {artifact_id: approvalPair.event.id, relative_path: eventWrite.relative_path, sha256: eventWrite.sha256};
  const policyCheckpointFile = path.join(temporaryRoot, "policy-checkpoint.json");
  fs.writeFileSync(policyCheckpointFile, `${JSON.stringify(policyCheckpoint, null, 2)}\n`);
  const policyRun = spawnSync("node", [
    "autonomous-improvement-controller.js", campaignFile, policyCheckpointFile,
    "--repository", repositoryPath,
    "--artifact-root", artifactRoot
  ], {cwd: ROOT, encoding: "utf8"});
  assert.strictEqual(policyRun.status, 0, policyRun.stdout || policyRun.stderr);
  const policyDecision = JSON.parse(policyRun.stdout);
  assert.strictEqual(policyDecision.decision, "accept_working_state");
  assert.strictEqual(policyDecision.proof.approval_consumption_event_id, approvalPair.event.id);
  cases.push("controller reloads and consumes an exact approval ledger binding");

  const verifyStore = spawnSync("node", ["repository-artifact-verify.js", "--repository", repositoryPath, "--artifact-root", artifactRoot], {cwd: ROOT, encoding: "utf8"});
  assert.strictEqual(verifyStore.status, 0, verifyStore.stdout || verifyStore.stderr);
  assert.strictEqual(JSON.parse(verifyStore.stdout).valid, true);
  cases.push("proof store verifies manifest history and artifact hashes");

  for (const name of cases) console.log(`PASS ${name}`);
  console.log(`Self-improvement fixtures: ${cases.length}/${cases.length} passed`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
