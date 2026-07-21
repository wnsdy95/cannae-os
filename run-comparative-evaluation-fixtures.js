#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { runComparativeEvaluation, reportDigest } = require("./comparative-evaluation-runner");
const { computeRepositoryState } = require("./verification-runner");
const { resolveRepository, verifyRepositoryArtifacts, writeRepositoryArtifact } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relativePath), "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-comparative-evaluation-"));
const candidatePath = path.join(temporaryRoot, "candidate");
const baselinePath = path.join(temporaryRoot, "baseline");
const artifactRoot = path.join(temporaryRoot, "artifacts");
const campaignPath = path.join(temporaryRoot, "campaign.json");

const harnessSource = `const fs = require("fs");
const evaluationSet = JSON.parse(fs.readFileSync(process.env.CANNAE_EVALUATION_SET_PATH, "utf8"));
const scores = JSON.parse(fs.readFileSync("scores.json", "utf8"));
const observation = {
  schema_version: "0.1",
  type: "ComparativeEvaluationObservation",
  plan_id: process.env.CANNAE_EVALUATION_PLAN_ID,
  evaluation_set: {
    id: evaluationSet.id,
    version: evaluationSet.version,
    sha256: process.env.CANNAE_EVALUATION_SET_SHA256
  },
  subject: {
    kind: process.env.CANNAE_EVALUATION_SUBJECT,
    candidate_id: process.env.CANNAE_EVALUATION_CANDIDATE_ID,
    revision: process.env.CANNAE_EVALUATION_REVISION
  },
  evaluator: {
    role: process.env.CANNAE_EVALUATOR_ROLE,
    evaluator_id: process.env.CANNAE_EVALUATOR_ID,
    invocation_id: process.env.CANNAE_EVALUATOR_INVOCATION_ID
  },
  fixture_results: evaluationSet.fixtures.map(fixture => ({fixture_id: fixture.id, status: "passed"})),
  metric_results: Object.entries(scores).map(([dimension_id, value]) => ({dimension_id, value, sample_count: evaluationSet.fixtures.length}))
};
process.stdout.write(JSON.stringify(observation, null, 2) + "\\n");
`;

function writeScores(repositoryPath, accuracy, completeness) {
  fs.writeFileSync(path.join(repositoryPath, "scores.json"), `${JSON.stringify({ accuracy, completeness }, null, 2)}\n`);
}

function makePlan(id, candidateId, campaign, baselineRepository, candidateRepository, baselineState, candidateState, setWrite, harnessHash) {
  return {
    schema_version: "0.1",
    type: "ComparativeEvaluationPlan",
    id,
    campaign_id: campaign.id,
    mission_id: campaign.mission_id,
    cycle_number: 1,
    target_type: "runtime_control",
    repository_binding: {
      repository_key: candidateRepository.key,
      identity_fingerprint: candidateRepository.identity_fingerprint
    },
    subjects: {
      baseline: {
        candidate_id: "BASE-Fixture-001",
        revision: baselineState.head_commit,
        repository_binding: {
          repository_key: baselineRepository.key,
          identity_fingerprint: baselineRepository.identity_fingerprint
        },
        expected_repository_state: baselineState
      },
      candidate: {
        candidate_id: candidateId,
        revision: `WT-${candidateState.worktree_fingerprint}`,
        repository_binding: {
          repository_key: candidateRepository.key,
          identity_fingerprint: candidateRepository.identity_fingerprint
        },
        expected_repository_state: candidateState
      }
    },
    evaluation_set_ref: {
      artifact_id: "CES-Comparative-Fixture",
      relative_path: setWrite.relative_path,
      sha256: setWrite.sha256
    },
    harness: {
      check: {
        id: `CEH-${id.replace(/^[A-Z]+-/, "")}`,
        purpose: "Run the same held-out fixture contract against both worktrees.",
        executable: "node",
        args: ["comparative-harness.js"],
        working_directory: ".",
        timeout_ms: 30000,
        expected_exit_codes: [0]
      },
      script_sha256: harnessHash,
      identical_harness_required: true
    },
    independent_evaluator: {
      role: "EVALUATOR",
      evaluator_id: "EVAL-Fixture-001",
      invocation_id: `INV-${id.replace(/^[A-Z]+-/, "")}`
    },
    created_at: "2026-07-22T09:10:00+09:00"
  };
}

function persistPlan(plan) {
  return writeRepositoryArtifact({
    repositoryPath: candidatePath,
    artifactRoot,
    missionId: plan.mission_id,
    waveId: "C1",
    kind: "comparative-evaluation-plans",
    artifactId: plan.id,
    payload: plan,
    createdAt: plan.created_at
  });
}

try {
  fs.mkdirSync(candidatePath, { recursive: true });
  git(candidatePath, ["init", "--quiet"]);
  git(candidatePath, ["config", "user.email", "fixtures@example.com"]);
  git(candidatePath, ["config", "user.name", "Comparative Fixtures"]);
  git(candidatePath, ["remote", "add", "origin", "git@github.com:example/comparative-target.git"]);
  fs.writeFileSync(path.join(candidatePath, "comparative-harness.js"), harnessSource);
  writeScores(candidatePath, 0.8, 0.7);
  git(candidatePath, ["add", "comparative-harness.js", "scores.json"]);
  git(candidatePath, ["commit", "--quiet", "-m", "baseline"]);
  const baselineCommit = git(candidatePath, ["rev-parse", "HEAD"]);
  git(candidatePath, ["worktree", "add", "--quiet", "--detach", baselinePath, baselineCommit]);

  writeScores(candidatePath, 0.95, 0.9);
  git(candidatePath, ["add", "scores.json"]);
  git(candidatePath, ["commit", "--quiet", "-m", "candidate"]);

  const candidateRepository = resolveRepository(candidatePath);
  const baselineRepository = resolveRepository(baselinePath);
  const baselineState = computeRepositoryState(baselinePath);
  let candidateState = computeRepositoryState(candidatePath);
  const campaign = clone(readJson("sample-payloads/valid-self-improvement-campaign.json"));
  campaign.id = "SIC-Comparative-Fixture";
  campaign.mission_id = "MIS-Comparative-Fixture";
  campaign.repository_binding = {
    repository_key: candidateRepository.key,
    identity_fingerprint: candidateRepository.identity_fingerprint,
    baseline_revision: baselineCommit
  };
  fs.writeFileSync(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);

  const evaluationSet = clone(readJson("sample-payloads/valid-comparative-evaluation-set.json"));
  evaluationSet.id = "CES-Comparative-Fixture";
  evaluationSet.campaign_id = campaign.id;
  evaluationSet.mission_id = campaign.mission_id;
  evaluationSet.created_at = "2026-07-22T09:00:00+09:00";
  const setWrite = writeRepositoryArtifact({
    repositoryPath: candidatePath,
    artifactRoot,
    missionId: campaign.mission_id,
    waveId: "C0",
    kind: "comparative-evaluation-sets",
    artifactId: evaluationSet.id,
    payload: evaluationSet,
    createdAt: evaluationSet.created_at
  });
  const harnessHash = sha256(fs.readFileSync(path.join(candidatePath, "comparative-harness.js")));

  const passingPlan = makePlan("CEP-Comparative-Pass", "CAN-Comparative-Pass", campaign, baselineRepository, candidateRepository, baselineState, candidateState, setWrite, harnessHash);
  persistPlan(passingPlan);
  const passingReport = runComparativeEvaluation(campaign, passingPlan, {
    candidateRepositoryPath: candidatePath,
    baselineRepositoryPath: baselinePath,
    artifactRoot
  });
  assert.strictEqual(passingReport.outcome, "promotable", JSON.stringify(passingReport, null, 2));
  assert.strictEqual(passingReport.working_state_promotion_recommended, true);
  assert.strictEqual(passingReport.release_authorized, false);
  assert.strictEqual(passingReport.report_sha256, reportDigest(passingReport));
  assert.strictEqual(validatePayload(passingReport, "comparative-evaluation-report").valid, true);
  const reportWrite = writeRepositoryArtifact({
    repositoryPath: candidatePath,
    artifactRoot,
    missionId: campaign.mission_id,
    waveId: "C1",
    kind: "comparative-evaluation-reports",
    artifactId: passingReport.id,
    payload: passingReport,
    createdAt: passingReport.finished_at
  });
  assert(reportWrite.sha256);
  console.log("PASS identical held-out evaluation promotes a non-regressing candidate");

  const forgedPlan = clone(passingPlan);
  forgedPlan.harness.check.purpose = "Changed after plan persistence.";
  assert.throws(() => runComparativeEvaluation(campaign, forgedPlan, {
    candidateRepositoryPath: candidatePath,
    baselineRepositoryPath: baselinePath,
    artifactRoot
  }), /does not match its pre-persisted artifact/);
  console.log("PASS a plan changed after persistence is rejected");

  const crossMissionSet = clone(evaluationSet);
  crossMissionSet.id = "CES-Comparative-Cross-Mission";
  crossMissionSet.campaign_id = "SIC-Comparative-Other";
  crossMissionSet.mission_id = "MIS-Comparative-Other";
  const crossMissionSetWrite = writeRepositoryArtifact({
    repositoryPath: candidatePath,
    artifactRoot,
    missionId: crossMissionSet.mission_id,
    waveId: "C0",
    kind: "comparative-evaluation-sets",
    artifactId: crossMissionSet.id,
    payload: crossMissionSet,
    createdAt: crossMissionSet.created_at
  });
  const crossMissionPlan = makePlan("CEP-Comparative-Cross-Mission", "CAN-Comparative-Cross-Mission", campaign, baselineRepository, candidateRepository, baselineState, candidateState, crossMissionSetWrite, harnessHash);
  crossMissionPlan.evaluation_set_ref.artifact_id = crossMissionSet.id;
  persistPlan(crossMissionPlan);
  assert.throws(() => runComparativeEvaluation(campaign, crossMissionPlan, {
    candidateRepositoryPath: candidatePath,
    baselineRepositoryPath: baselinePath,
    artifactRoot
  }), /does not belong to the campaign mission/);
  console.log("PASS a cross-mission evaluation set is rejected before execution");

  writeScores(candidatePath, 0.85, 0.9);
  candidateState = computeRepositoryState(candidatePath);
  const regressionPlan = makePlan("CEP-Comparative-Regression", "CAN-Comparative-Regression", campaign, baselineRepository, candidateRepository, baselineState, candidateState, setWrite, harnessHash);
  persistPlan(regressionPlan);
  const regressionReport = runComparativeEvaluation(campaign, regressionPlan, {
    candidateRepositoryPath: candidatePath,
    baselineRepositoryPath: baselinePath,
    artifactRoot
  });
  assert.strictEqual(regressionReport.outcome, "rollback", JSON.stringify(regressionReport, null, 2));
  assert(regressionReport.blocking_codes.includes("COMPARISON_ABSOLUTE_THRESHOLD_FAILED"));
  assert.strictEqual(regressionReport.release_authorized, false);
  console.log("PASS an absolute-threshold failure requires rollback");

  fs.appendFileSync(path.join(candidatePath, "comparative-harness.js"), "// candidate-only harness mutation\n");
  candidateState = computeRepositoryState(candidatePath);
  const mismatchPlan = makePlan("CEP-Comparative-Harness-Mismatch", "CAN-Comparative-Harness-Mismatch", campaign, baselineRepository, candidateRepository, baselineState, candidateState, setWrite, harnessHash);
  persistPlan(mismatchPlan);
  const mismatchReport = runComparativeEvaluation(campaign, mismatchPlan, {
    candidateRepositoryPath: candidatePath,
    baselineRepositoryPath: baselinePath,
    artifactRoot
  });
  assert.strictEqual(mismatchReport.outcome, "inconclusive", JSON.stringify(mismatchReport, null, 2));
  assert(mismatchReport.blocking_codes.includes("COMPARISON_EXECUTION_INVALID"));
  assert.strictEqual(mismatchReport.working_state_promotion_recommended, false);
  console.log("PASS a candidate-only harness change makes the comparison inconclusive");

  const tamperedReport = clone(passingReport);
  tamperedReport.comparisons[0].candidate_value = 1;
  const tamperedValidation = validatePayload(tamperedReport, "comparative-evaluation-report");
  assert.strictEqual(tamperedValidation.valid, false);
  assert(tamperedValidation.issues.some(item => item.code === "COMPARATIVE_REPORT_DIGEST_INVALID"));
  console.log("PASS report tampering invalidates the report digest");

  const verification = verifyRepositoryArtifacts({ repositoryPath: candidatePath, artifactRoot });
  assert.strictEqual(verification.valid, true, JSON.stringify(verification.issues));
  console.log("PASS comparison plan, set, and report remain repository-manifest verified");

  console.log("Comparative evaluation fixtures: 7/7 passed");
} finally {
  try { git(candidatePath, ["worktree", "remove", "--force", baselinePath]); } catch (error) { /* best effort */ }
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
