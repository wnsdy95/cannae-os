#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { executeVerification, computeRepositoryState, receiptDigest } = require("./verification-runner");
const { resolveRepository } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-verification-runner-"));
const repositoryPath = path.join(root, "repository");

try {
  fs.mkdirSync(repositoryPath, { recursive: true });
  git(repositoryPath, ["init", "--quiet"]);
  git(repositoryPath, ["config", "user.email", "fixtures@example.com"]);
  git(repositoryPath, ["config", "user.name", "Fixtures"]);
  git(repositoryPath, ["remote", "add", "origin", "git@github.com:example/verification-runner.git"]);
  fs.writeFileSync(path.join(repositoryPath, "candidate.txt"), "baseline\n");
  fs.writeFileSync(path.join(repositoryPath, "pass.js"), "process.stdout.write('PASS deterministic check\\n');\n");
  fs.writeFileSync(path.join(repositoryPath, "mutate.js"), "require('fs').writeFileSync('candidate.txt', 'changed\\n');\n");
  git(repositoryPath, ["add", "."]);
  git(repositoryPath, ["commit", "--quiet", "-m", "fixture baseline"]);

  const repository = resolveRepository(repositoryPath);
  const campaign = clone(JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", "valid-self-improvement-campaign.json"), "utf8")));
  campaign.repository_binding = {repository_key: repository.key, identity_fingerprint: repository.identity_fingerprint, baseline_revision: repository.head_commit};
  const state = computeRepositoryState(repositoryPath);
  const basePlan = {
    schema_version: "0.1",
    type: "VerificationPlan",
    id: "VP-Runner-001",
    campaign_id: campaign.id,
    mission_id: campaign.mission_id,
    cycle_number: 1,
    candidate_id: "CAN-Runner-001",
    candidate_revision: `WT-${state.worktree_fingerprint}`,
    repository_binding: {repository_key: repository.key, identity_fingerprint: repository.identity_fingerprint},
    expected_repository_state: state,
    checks: [{id: "VCK-Runner-001", purpose: "Run deterministic check.", executable: "node", args: ["pass.js"], working_directory: ".", timeout_ms: 30000, expected_exit_codes: [0]}],
    created_at: "2026-07-21T18:00:00+09:00"
  };

  const passing = executeVerification(campaign, basePlan, repositoryPath);
  assert.strictEqual(passing.overall_status, "passed");
  assert.strictEqual(passing.runner.shell_used, false);
  assert.strictEqual(passing.checks[0].argv.join(" "), "node pass.js");
  assert.strictEqual(passing.receipt_sha256, receiptDigest(passing));
  assert.strictEqual(validatePayload(passing, "verification-receipt").valid, true);
  console.log("PASS exact argv executes without a shell and emits a valid receipt");

  const shellPlan = clone(basePlan);
  shellPlan.id = "VP-Runner-Shell";
  shellPlan.checks[0] = {id: "VCK-Runner-Shell", purpose: "Attempt shell execution.", executable: "sh", args: ["-c", "node pass.js"], working_directory: ".", timeout_ms: 30000, expected_exit_codes: [0]};
  assert.throws(() => executeVerification(campaign, shellPlan, repositoryPath), /VERIFICATION_PLAN_SHELL_PROHIBITED/);
  console.log("PASS shell and privilege-wrapper commands are blocked");

  const inlinePlan = clone(basePlan);
  inlinePlan.id = "VP-Runner-Inline";
  inlinePlan.checks[0] = {id: "VCK-Runner-Inline", purpose: "Attempt inline evaluation.", executable: "node", args: ["-e", "process.exit(0)"], working_directory: ".", timeout_ms: 30000, expected_exit_codes: [0]};
  assert.throws(() => executeVerification(campaign, inlinePlan, repositoryPath), /VERIFICATION_PLAN_NODE_SCRIPT_INVALID/);
  console.log("PASS inline Node evaluation and loader flags are blocked");

  const stalePlan = clone(basePlan);
  stalePlan.id = "VP-Runner-Stale";
  stalePlan.expected_repository_state.worktree_fingerprint = "f".repeat(64);
  assert.throws(() => executeVerification(campaign, stalePlan, repositoryPath), /stale|does not match/i);
  console.log("PASS stale repository-state plans are rejected before execution");

  const mutationPlan = clone(basePlan);
  mutationPlan.id = "VP-Runner-Mutation";
  mutationPlan.checks[0] = {id: "VCK-Runner-Mutation", purpose: "Attempt repository mutation.", executable: "node", args: ["mutate.js"], working_directory: ".", timeout_ms: 30000, expected_exit_codes: [0]};
  const mutationReceipt = executeVerification(campaign, mutationPlan, repositoryPath);
  assert.strictEqual(mutationReceipt.overall_status, "failed");
  assert.strictEqual(mutationReceipt.repository_state_unchanged, false);
  assert.strictEqual(mutationReceipt.checks[0].status, "failed");
  console.log("PASS repository mutation during verification fails the receipt");

  console.log("Verification runner fixtures: 5/5 passed");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
