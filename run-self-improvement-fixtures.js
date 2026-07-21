#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyzeImprovement } = require("./autonomous-improvement-controller");
const { resolveRepository } = require("./repository-artifact-store");

const ROOT = __dirname;
const CAMPAIGN_PATH = path.join(ROOT, "sample-payloads", "valid-self-improvement-campaign.json");
const CHECKPOINT_PATH = path.join(ROOT, "sample-payloads", "valid-self-improvement-checkpoint.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

function validateDecision(decision, temporaryRoot, name) {
  const outputPath = path.join(temporaryRoot, `${name}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(decision, null, 2)}\n`);
  const result = spawnSync("node", [
    "validator-cli-prototype/validate.js",
    outputPath,
    "self-improvement-decision"
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stdout || result.stderr);
}

const baseCampaign = readJson(CAMPAIGN_PATH);
const baseCheckpoint = readJson(CHECKPOINT_PATH);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-self-improvement-"));
const cases = [];

function runCase(name, mutate, expected) {
  const campaign = clone(baseCampaign);
  const checkpoint = clone(baseCheckpoint);
  mutate(campaign, checkpoint);
  const decision = analyzeImprovement(campaign, checkpoint);
  assert.strictEqual(decision.decision, expected.decision, `${name}: ${JSON.stringify(decision, null, 2)}`);
  assert.strictEqual(decision.execution_authorized, expected.executionAuthorized, name);
  for (const code of expected.blockingCodes || []) {
    assert(decision.blocking_codes.includes(code), `${name}: missing ${code}`);
  }
  assert.strictEqual(decision.release_authorized, false, name);
  validateDecision(decision, temporaryRoot, name.replace(/[^a-z0-9]+/gi, "-"));
  cases.push(name);
}

try {
  runCase("measurably better in-progress work is accepted", () => {}, {
    decision: "accept_working_state",
    executionAuthorized: true
  });

  runCase("small non-repair delta is revised", (_campaign, checkpoint) => {
    checkpoint.metric_results[0].before = 0.9;
    checkpoint.metric_results[0].after = 0.91;
    checkpoint.metric_results[1].before = 0.85;
    checkpoint.metric_results[1].after = 0.86;
  }, {
    decision: "revise_and_retry",
    executionAuthorized: true,
    blockingCodes: []
  });

  runCase("validation failure rolls back only candidate work", (_campaign, checkpoint) => {
    checkpoint.validation_results[0].status = "failed";
    checkpoint.validation_results[0].exit_code = 1;
  }, {
    decision: "rollback",
    executionAuthorized: true,
    blockingCodes: ["VALIDATION_NOT_PASSED"]
  });

  runCase("policy change without USER approval escalates", (_campaign, checkpoint) => {
    checkpoint.target.target_type = "policy";
    checkpoint.target.state = "candidate";
    checkpoint.target.artifact_paths = ["docs/policy.md"];
    checkpoint.candidate.changed_files = ["docs/policy.md"];
    checkpoint.externalities.policy_changed = true;
    checkpoint.independent_evaluation = {
      required: true,
      evaluator: "EVALUATOR",
      status: "passed",
      evidence: ["Independent policy diff review IER-001."]
    };
  }, {
    decision: "escalate",
    executionAuthorized: false,
    blockingCodes: ["HUMAN_APPROVAL_REQUIRED"]
  });

  runCase("destructive self-improvement terminates", (_campaign, checkpoint) => {
    checkpoint.candidate.change_class = "destructive";
    checkpoint.externalities.destructive_action = true;
  }, {
    decision: "terminate",
    executionAuthorized: false,
    blockingCodes: ["PROHIBITED_EXTERNALITY"]
  });

  runCase("mandatory completion checkpoint completes working state only", (_campaign, checkpoint) => {
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
  }, {
    decision: "complete",
    executionAuthorized: false
  });

  runCase("repository binding drift escalates", (_campaign, checkpoint) => {
    checkpoint.repository_binding.identity_fingerprint = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  }, {
    decision: "escalate",
    executionAuthorized: false,
    blockingCodes: ["REPOSITORY_BINDING_MISMATCH"]
  });

  runCase("first cycle cannot replace the campaign baseline", (_campaign, checkpoint) => {
    checkpoint.target.baseline_revision = "unaccepted-working-state";
  }, {
    decision: "escalate",
    executionAuthorized: false,
    blockingCodes: ["CAMPAIGN_BASELINE_REVISION_MISMATCH"]
  });

  runCase("follow-on cycle requires an accepted parent decision", (_campaign, checkpoint) => {
    checkpoint.cycle_number = 2;
    checkpoint.parent_decision_id = "none";
  }, {
    decision: "escalate",
    executionAuthorized: false,
    blockingCodes: ["PARENT_DECISION_MISSING"]
  });

  runCase("no-progress budget suspends autonomy", (_campaign, checkpoint) => {
    checkpoint.progress.consecutive_no_progress_cycles = 2;
  }, {
    decision: "escalate",
    executionAuthorized: false,
    blockingCodes: ["NO_PROGRESS_LIMIT_REACHED"]
  });

  runCase("control-plane candidate without independent evaluation escalates", (_campaign, checkpoint) => {
    checkpoint.target.target_type = "runtime_control";
    checkpoint.target.state = "candidate";
    checkpoint.target.artifact_paths = ["runtime/controller.js"];
    checkpoint.candidate.changed_files = ["runtime/controller.js"];
  }, {
    decision: "escalate",
    executionAuthorized: false,
    blockingCodes: ["INDEPENDENT_CONTROL_PLANE_EVALUATION_MISSING"]
  });

  runCase("undelegated permission escalates", (_campaign, checkpoint) => {
    checkpoint.candidate.required_permissions.push("push");
  }, {
    decision: "escalate",
    executionAuthorized: false,
    blockingCodes: ["PERMISSION_OUTSIDE_AUTHORITY_ENVELOPE"]
  });

  const unsafeCampaignPath = path.join(temporaryRoot, "unsafe-campaign.json");
  const unsafeCheckpointPath = path.join(temporaryRoot, "unsafe-checkpoint.json");
  const unsafeCheckpoint = clone(baseCheckpoint);
  unsafeCheckpoint.candidate.change_class = "destructive";
  unsafeCheckpoint.externalities.destructive_action = true;
  fs.writeFileSync(unsafeCampaignPath, `${JSON.stringify(baseCampaign, null, 2)}\n`);
  fs.writeFileSync(unsafeCheckpointPath, `${JSON.stringify(unsafeCheckpoint, null, 2)}\n`);
  const unsafeCli = spawnSync("node", [
    "autonomous-improvement-controller.js",
    unsafeCampaignPath,
    unsafeCheckpointPath
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(unsafeCli.status, 1, unsafeCli.stdout || unsafeCli.stderr);
  const unsafeDecision = JSON.parse(unsafeCli.stdout);
  assert.strictEqual(unsafeDecision.decision, "terminate");
  assert(unsafeDecision.blocking_codes.includes("PROHIBITED_EXTERNALITY"));
  cases.push("CLI converts semantic safety violations into terminate decisions");

  const repositoryPath = path.join(temporaryRoot, "target-repository");
  const artifactRoot = path.join(temporaryRoot, "artifacts");
  fs.mkdirSync(repositoryPath, { recursive: true });
  git(repositoryPath, ["init", "--quiet"]);
  git(repositoryPath, ["remote", "add", "origin", "git@github.com:example/self-improvement-target.git"]);
  const repository = resolveRepository(repositoryPath);
  const bootstrapResult = spawnSync("node", [
    "self-improvement-campaign-init.js",
    "--repository", repositoryPath,
    "--artifact-root", artifactRoot,
    "--mission", "MIS-Bootstrap-001",
    "--campaign", "SIC-Bootstrap-001",
    "--objective", "Improve an active implementation through bounded evidence-backed cycles.",
    "--end-state", "The accepted working state passes every declared criterion.",
    "--criterion", "All deterministic tests pass.",
    "--criterion", "The mandatory completion checkpoint is recorded.",
    "--created-at", "2026-07-21T18:00:00+09:00",
    "--write-artifact"
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(bootstrapResult.status, 0, bootstrapResult.stdout || bootstrapResult.stderr);
  assert(/Artifact written:/.test(bootstrapResult.stderr));
  const bootstrappedCampaign = JSON.parse(bootstrapResult.stdout);
  assert.strictEqual(bootstrappedCampaign.repository_binding.repository_key, repository.key);
  assert.strictEqual(bootstrappedCampaign.final_decision_authority, "USER");
  assert.strictEqual(bootstrappedCampaign.checkpoint_policy.before_completion_required, true);
  const bootstrapValidation = spawnSync("node", [
    "validator-cli-prototype/validate.js",
    path.join(artifactRoot, "repositories", repository.key, "missions", "MIS-Bootstrap-001", "C0", "self-improvement-campaigns", "SIC-Bootstrap-001.json"),
    "self-improvement-campaign"
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(bootstrapValidation.status, 0, bootstrapValidation.stdout || bootstrapValidation.stderr);
  cases.push("campaign bootstrap binds safe defaults to the target repository");

  const persistedCampaign = clone(baseCampaign);
  const persistedCheckpoint = clone(baseCheckpoint);
  persistedCampaign.repository_binding = {
    repository_key: repository.key,
    identity_fingerprint: repository.identity_fingerprint,
    baseline_revision: repository.head_commit
  };
  persistedCheckpoint.repository_binding = {
    repository_key: repository.key,
    identity_fingerprint: repository.identity_fingerprint
  };
  persistedCheckpoint.target.baseline_revision = repository.head_commit;
  const campaignPath = path.join(temporaryRoot, "campaign.json");
  const checkpointPath = path.join(temporaryRoot, "checkpoint.json");
  fs.writeFileSync(campaignPath, `${JSON.stringify(persistedCampaign, null, 2)}\n`);
  fs.writeFileSync(checkpointPath, `${JSON.stringify(persistedCheckpoint, null, 2)}\n`);
  const cliResult = spawnSync("node", [
    "autonomous-improvement-controller.js",
    campaignPath,
    checkpointPath,
    "--write-artifact",
    "--repository", repositoryPath,
    "--artifact-root", artifactRoot
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(cliResult.status, 0, cliResult.stdout || cliResult.stderr);
  assert(/Artifact written:/.test(cliResult.stderr));
  const persistedDecision = JSON.parse(cliResult.stdout);
  assert.strictEqual(persistedDecision.decision, "accept_working_state");
  const manifestPath = path.join(artifactRoot, "repositories", repository.key, "manifest.json");
  const manifest = readJson(manifestPath);
  assert(manifest.artifacts.some(item => item.kind === "self-improvement-checkpoints" && item.artifact_id === persistedCheckpoint.id));
  assert(manifest.artifacts.some(item => item.kind === "self-improvement-decisions" && item.artifact_id === persistedDecision.id));
  cases.push("checkpoint and decision persist in the bound repository namespace");

  for (const name of cases) console.log(`PASS ${name}`);
  console.log(`Self-improvement fixtures: ${cases.length}/${cases.length} passed`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
