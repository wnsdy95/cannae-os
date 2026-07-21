#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  manifestDigest,
  normalizeRemote,
  resolveRepository,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const {
  computeRepositoryState,
  enforceCommandPolicy,
  resolveExecutable,
  safeWorkingDirectory,
  summarizeOutput
} = require("./verification-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function reportDigest(report) {
  const value = JSON.parse(JSON.stringify(report));
  delete value.report_sha256;
  return sha256(jsonBytes(value));
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 && !path.isAbsolute(value) &&
    !/^[A-Za-z]:[\\/]/.test(value) && !value.split(/[\\/]+/).includes("..");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadProofStore(repositoryPath, artifactRootOption) {
  const verification = verifyRepositoryArtifacts({ repositoryPath, artifactRoot: artifactRootOption });
  if (!verification.valid) {
    throw new Error(`Repository proof store failed integrity verification: ${verification.issues.map(item => item.code).join(", ")}`);
  }
  const artifactRoot = path.resolve(artifactRootOption || path.join(process.cwd(), ".cannae", "artifacts"));
  const manifestPath = path.join(artifactRoot, "repositories", verification.repository.key, "manifest.json");
  const manifest = readJson(manifestPath);
  if (manifestDigest(manifest) !== verification.manifest_sha256) {
    throw new Error("Repository proof manifest changed after integrity verification.");
  }
  return { verification, artifactRoot, manifest };
}

function readManifestEntry(store, entry, expectedKind) {
  if (!entry || entry.kind !== expectedKind || !safeRelativePath(entry.relative_path)) {
    throw new Error(`Invalid ${expectedKind} manifest entry.`);
  }
  const root = path.resolve(store.artifactRoot);
  const filePath = path.resolve(root, entry.relative_path);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${expectedKind} entry escapes the artifact root.`);
  }
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${expectedKind} entry is not a regular file.`);
  const bytes = fs.readFileSync(filePath);
  if (bytes.length !== entry.byte_size || sha256(bytes) !== entry.sha256) {
    throw new Error(`${expectedKind} entry bytes do not match the manifest.`);
  }
  return { bytes, payload: JSON.parse(bytes.toString("utf8")) };
}

function uniqueManifestEntry(store, criteria, expectedKind) {
  const matches = (store.manifest.artifacts || []).filter(item =>
    item.kind === expectedKind && item.artifact_id === criteria.artifactId &&
    item.mission_id === criteria.missionId && item.wave_id === criteria.waveId);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${expectedKind} artifact for ${criteria.artifactId}; found ${matches.length}.`);
  }
  return matches[0];
}

function readReferencedArtifact(store, ref, expectedKind) {
  if (!ref || !safeRelativePath(ref.relative_path)) throw new Error(`Invalid ${expectedKind} reference.`);
  const entry = (store.manifest.artifacts || []).find(item => item.relative_path === ref.relative_path);
  if (!entry || entry.kind !== expectedKind || entry.artifact_id !== ref.artifact_id || entry.sha256 !== ref.sha256) {
    throw new Error(`${expectedKind} reference does not match the repository manifest.`);
  }
  return { entry, ...readManifestEntry(store, entry, expectedKind) };
}

function normalizedOrigin(repositoryRoot) {
  const result = spawnSync("git", ["-C", repositoryRoot, "config", "--get", "remote.origin.url"], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return normalizeRemote(result.stdout.trim());
}

function sameObject(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validatePolicy(campaign, plan) {
  const policy = campaign.comparative_evaluation_policy;
  if (!policy) throw new Error("Campaign comparative evaluation policy is missing.");
  if (!(policy.required_target_types || []).includes(plan.target_type)) {
    throw new Error("Plan target is outside the campaign comparative evaluation policy.");
  }
  const dimensions = (campaign.quality_model && campaign.quality_model.dimensions) || [];
  const thresholds = policy.dimension_thresholds || [];
  const dimensionIds = dimensions.map(item => item.id);
  const thresholdIds = thresholds.map(item => item.dimension_id);
  if (new Set(dimensionIds).size !== dimensionIds.length || new Set(thresholdIds).size !== thresholdIds.length ||
      dimensionIds.length !== thresholdIds.length || dimensionIds.some(id => !thresholdIds.includes(id))) {
    throw new Error("Comparative thresholds must cover every campaign quality dimension exactly once.");
  }
  if (policy.same_evaluation_set_required !== true || policy.identical_harness_required !== true ||
      policy.independent_evaluator_required !== true) {
    throw new Error("Comparative evaluation policy weakens a mandatory comparison control.");
  }
  if (plan.independent_evaluator.role !== campaign.command_team.independent_evaluator ||
      plan.independent_evaluator.role === campaign.command_team.improvement_controller) {
    throw new Error("Comparative evaluator is not independent from the campaign controller.");
  }
  return policy;
}

function verifyPlanBindings(campaign, plan, baselineRepository, candidateRepository, baselineState, candidateState) {
  const codes = [];
  const expectedCandidateBinding = {
    repository_key: candidateRepository.key,
    identity_fingerprint: candidateRepository.identity_fingerprint
  };
  const expectedBaselineBinding = {
    repository_key: baselineRepository.key,
    identity_fingerprint: baselineRepository.identity_fingerprint
  };
  if (plan.campaign_id !== campaign.id || plan.mission_id !== campaign.mission_id) codes.push("COMPARISON_CAMPAIGN_BINDING_INVALID");
  if (!sameObject(plan.repository_binding, expectedCandidateBinding) ||
      !sameObject(plan.repository_binding, campaign.repository_binding && {
        repository_key: campaign.repository_binding.repository_key,
        identity_fingerprint: campaign.repository_binding.identity_fingerprint
      })) codes.push("COMPARISON_TARGET_REPOSITORY_INVALID");
  if (!sameObject(plan.subjects.baseline.repository_binding, expectedBaselineBinding) ||
      !sameObject(plan.subjects.candidate.repository_binding, expectedCandidateBinding)) codes.push("COMPARISON_SUBJECT_REPOSITORY_INVALID");
  if (!sameObject(plan.subjects.baseline.expected_repository_state, baselineState) ||
      !sameObject(plan.subjects.candidate.expected_repository_state, candidateState)) codes.push("COMPARISON_REPOSITORY_STATE_STALE");
  if (plan.subjects.baseline.candidate_id === plan.subjects.candidate.candidate_id) {
    codes.push("COMPARISON_SUBJECTS_NOT_DISTINCT");
  }
  if (plan.evaluation_purpose === "candidate_promotion" && plan.subjects.baseline.revision === plan.subjects.candidate.revision) {
    codes.push("COMPARISON_PROMOTION_REVISIONS_NOT_DISTINCT");
  }
  if (plan.evaluation_purpose === "completion_revalidation" && plan.subjects.baseline.revision !== plan.subjects.candidate.revision) {
    codes.push("COMPARISON_COMPLETION_REVISIONS_MISMATCH");
  }
  for (const subject of Object.values(plan.subjects)) {
    const state = subject.expected_repository_state;
    if (subject.revision !== state.head_commit && subject.revision !== `WT-${state.worktree_fingerprint}`) {
      codes.push("COMPARISON_SUBJECT_REVISION_STATE_MISMATCH");
    }
  }
  const baselineOrigin = normalizedOrigin(baselineRepository.root);
  const candidateOrigin = normalizedOrigin(candidateRepository.root);
  if (!baselineOrigin || baselineOrigin !== candidateOrigin) codes.push("COMPARISON_SOURCE_REPOSITORY_MISMATCH");
  return codes;
}

function parseObservation(stdout) {
  try {
    const value = JSON.parse(Buffer.from(stdout || Buffer.alloc(0)).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch (error) {
    return null;
  }
}

function executeSubject({ campaign, plan, evaluationSet, evaluationSetHash, repositoryPath, subjectKind, fixturePath, preflightBlocked = false }) {
  const repository = resolveRepository(repositoryPath);
  const subject = plan.subjects[subjectKind];
  const check = plan.harness.check;
  const workingDirectory = safeWorkingDirectory(repository.root, check.working_directory);
  const resolvedExecutable = resolveExecutable(check.executable);
  const executableHash = sha256(fs.readFileSync(resolvedExecutable));
  enforceCommandPolicy(check, campaign, repository.root);
  const harnessPath = path.resolve(workingDirectory, check.args[0]);
  const harnessHash = sha256(fs.readFileSync(harnessPath));
  const stateBefore = computeRepositoryState(repository.root);
  const fixtureHashBefore = sha256(fs.readFileSync(fixturePath));
  const started = process.hrtime.bigint();
  let result = { status: -1, signal: "", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: null };
  let status = "blocked";

  if (!preflightBlocked && harnessHash === plan.harness.script_sha256 && sameObject(stateBefore, subject.expected_repository_state)) {
    result = spawnSync(resolvedExecutable, check.args, {
      cwd: workingDirectory,
      encoding: null,
      shell: false,
      timeout: check.timeout_ms,
      maxBuffer: campaign.verification_policy.max_output_bytes_per_stream,
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        NODE_PATH: "",
        CANNAE_EVALUATION_SET_PATH: fixturePath,
        CANNAE_EVALUATION_SET_SHA256: evaluationSetHash,
        CANNAE_EVALUATION_PLAN_ID: plan.id,
        CANNAE_EVALUATION_SUBJECT: subjectKind,
        CANNAE_EVALUATION_CANDIDATE_ID: subject.candidate_id,
        CANNAE_EVALUATION_REVISION: subject.revision,
        CANNAE_EVALUATOR_ROLE: plan.independent_evaluator.role,
        CANNAE_EVALUATOR_ID: plan.independent_evaluator.evaluator_id,
        CANNAE_EVALUATOR_INVOCATION_ID: `${plan.independent_evaluator.invocation_id}-${subjectKind}`
      }
    });
    const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
    const outputExceeded = Boolean(result.error && result.error.code === "ENOBUFS");
    const exitCode = Number.isInteger(result.status) ? result.status : -1;
    status = timedOut ? "timed_out" : outputExceeded ? "blocked" :
      check.expected_exit_codes.includes(exitCode) ? "passed" : "failed";
  }

  const durationMs = Number((process.hrtime.bigint() - started) / 1000000n);
  const stateAfter = computeRepositoryState(repository.root);
  const stateUnchanged = sameObject(stateBefore, stateAfter);
  let fixtureUnchanged = false;
  try {
    fixtureUnchanged = fixtureHashBefore === sha256(fs.readFileSync(fixturePath));
  } catch (error) {
    fixtureUnchanged = false;
  }
  let observation = status === "passed" ? parseObservation(result.stdout) : null;
  if (!stateUnchanged || !fixtureUnchanged || harnessHash !== plan.harness.script_sha256 || !observation) status = "blocked";

  return {
    subject: subjectKind,
    repository_binding: {
      repository_key: repository.key,
      identity_fingerprint: repository.identity_fingerprint
    },
    repository_state_before: stateBefore,
    repository_state_after: stateAfter,
    repository_state_unchanged: stateUnchanged,
    argv: [check.executable, ...check.args],
    resolved_executable: resolvedExecutable,
    executable_sha256: executableHash,
    harness_sha256: harnessHash,
    exit_code: Number.isInteger(result.status) ? result.status : -1,
    signal: result.signal || "",
    status,
    duration_ms: durationMs,
    stdout: summarizeOutput(result.stdout),
    stderr: summarizeOutput(result.stderr || (result.error ? Buffer.from(result.error.message) : Buffer.alloc(0))),
    ...(observation ? { observation } : {})
  };
}

function observationCodes(plan, evaluationSet, evaluationSetHash, execution, subjectKind) {
  const observation = execution.observation;
  const subject = plan.subjects[subjectKind];
  const codes = [];
  if (execution.status !== "passed" || !observation) return ["COMPARISON_EXECUTION_INVALID"];
  const observationBytes = jsonBytes(observation);
  if (execution.stdout.truncated !== false || execution.stdout.byte_size !== observationBytes.length ||
      execution.stdout.sha256 !== sha256(observationBytes)) codes.push("COMPARISON_OBSERVATION_OUTPUT_MISMATCH");
  if (observation.schema_version !== "0.1" || observation.type !== "ComparativeEvaluationObservation" ||
      observation.plan_id !== plan.id) codes.push("COMPARISON_OBSERVATION_CONTRACT_INVALID");
  if (!Array.isArray(observation.fixture_results) || !Array.isArray(observation.metric_results) ||
      observation.fixture_results.some(item => !item || !["passed", "failed", "error"].includes(item.status)) ||
      observation.metric_results.some(item => !item || typeof item.dimension_id !== "string" ||
        !Number.isFinite(item.value) || item.value < 0 || item.value > 1 || !Number.isInteger(item.sample_count) || item.sample_count < 1)) {
    codes.push("COMPARISON_OBSERVATION_CONTRACT_INVALID");
  }
  if (!observation.evaluation_set || observation.evaluation_set.id !== evaluationSet.id ||
      observation.evaluation_set.version !== evaluationSet.version || observation.evaluation_set.sha256 !== evaluationSetHash) {
    codes.push("COMPARISON_EVALUATION_SET_MISMATCH");
  }
  if (!observation.subject || observation.subject.kind !== subjectKind ||
      observation.subject.candidate_id !== subject.candidate_id || observation.subject.revision !== subject.revision) {
    codes.push("COMPARISON_SUBJECT_BINDING_INVALID");
  }
  const expectedEvaluator = {
    role: plan.independent_evaluator.role,
    evaluator_id: plan.independent_evaluator.evaluator_id,
    invocation_id: `${plan.independent_evaluator.invocation_id}-${subjectKind}`
  };
  if (!sameObject(observation.evaluator, expectedEvaluator)) codes.push("COMPARISON_EVALUATOR_BINDING_INVALID");
  const expectedFixtures = evaluationSet.fixtures.map(item => item.id);
  const fixtureResults = Array.isArray(observation.fixture_results) ? observation.fixture_results : [];
  const metricResults = Array.isArray(observation.metric_results) ? observation.metric_results : [];
  const observedFixtures = fixtureResults.map(item => item.fixture_id);
  if (!sameObject(expectedFixtures, observedFixtures) || new Set(observedFixtures).size !== observedFixtures.length) {
    codes.push("COMPARISON_FIXTURE_ORDER_MISMATCH");
  }
  if (metricResults.some(item => item.sample_count !== expectedFixtures.length)) {
    codes.push("COMPARISON_SAMPLE_COUNT_MISMATCH");
  }
  return codes;
}

function evaluateComparison(campaign, plan, evaluationSet, evaluationSetHash, executions, initialCodes = []) {
  const blocks = [...initialCodes];
  blocks.push(...observationCodes(plan, evaluationSet, evaluationSetHash, executions.baseline, "baseline"));
  blocks.push(...observationCodes(plan, evaluationSet, evaluationSetHash, executions.candidate, "candidate"));
  for (const subjectKind of ["baseline", "candidate"]) {
    const execution = executions[subjectKind];
    const subject = plan.subjects[subjectKind];
    if (execution.subject !== subjectKind || !sameObject(execution.repository_binding, subject.repository_binding) ||
        !sameObject(execution.repository_state_before, subject.expected_repository_state) ||
        !sameObject(execution.repository_state_after, subject.expected_repository_state) ||
        execution.repository_state_unchanged !== true) blocks.push("COMPARISON_EXECUTION_BINDING_INVALID");
  }
  if (executions.baseline.harness_sha256 !== executions.candidate.harness_sha256 ||
      executions.baseline.harness_sha256 !== plan.harness.script_sha256 ||
      !sameObject(executions.baseline.argv, executions.candidate.argv) ||
      !sameObject(executions.baseline.argv, [plan.harness.check.executable, ...plan.harness.check.args])) blocks.push("COMPARISON_HARNESS_MISMATCH");
  if (executions.baseline.executable_sha256 !== executions.candidate.executable_sha256) blocks.push("COMPARISON_EXECUTABLE_MISMATCH");
  if (blocks.length > 0) {
    return { comparisons: [], outcome: "inconclusive", blocking_codes: [...new Set(blocks)].sort() };
  }

  const baselineObservation = executions.baseline.observation;
  const candidateObservation = executions.candidate.observation;
  const dimensions = campaign.quality_model.dimensions;
  const thresholdMap = new Map(campaign.comparative_evaluation_policy.dimension_thresholds
    .map(item => [item.dimension_id, item.maximum_regression]));
  const baselineMetrics = new Map((baselineObservation.metric_results || []).map(item => [item.dimension_id, item]));
  const candidateMetrics = new Map((candidateObservation.metric_results || []).map(item => [item.dimension_id, item]));
  if (baselineMetrics.size !== baselineObservation.metric_results.length || candidateMetrics.size !== candidateObservation.metric_results.length ||
      dimensions.some(item => !baselineMetrics.has(item.id) || !candidateMetrics.has(item.id)) ||
      baselineMetrics.size !== dimensions.length || candidateMetrics.size !== dimensions.length) {
    return { comparisons: [], outcome: "inconclusive", blocking_codes: ["COMPARISON_METRIC_CONTRACT_INVALID"] };
  }

  const comparisons = dimensions.map(dimension => {
    const baselineValue = Number(baselineMetrics.get(dimension.id).value);
    const candidateValue = Number(candidateMetrics.get(dimension.id).value);
    const normalizedDelta = dimension.direction === "minimize"
      ? baselineValue - candidateValue
      : candidateValue - baselineValue;
    const maximumRegression = thresholdMap.get(dimension.id);
    const absolutePassed = dimension.direction === "minimize"
      ? candidateValue <= dimension.target
      : candidateValue >= dimension.target;
    const nonRegressionPassed = normalizedDelta >= -maximumRegression - 0.0000001;
    return {
      dimension_id: dimension.id,
      direction: dimension.direction,
      hard_gate: dimension.hard_gate,
      baseline_value: baselineValue,
      candidate_value: candidateValue,
      normalized_delta: Number(normalizedDelta.toFixed(6)),
      absolute_threshold: dimension.target,
      maximum_regression: maximumRegression,
      absolute_threshold_passed: absolutePassed,
      non_regression_passed: nonRegressionPassed,
      passed: absolutePassed && nonRegressionPassed
    };
  });
  const candidateFixturesPassed = candidateObservation.fixture_results.every(item => item.status === "passed");
  const failures = [];
  if (!candidateFixturesPassed) failures.push("COMPARISON_CANDIDATE_FIXTURE_FAILED");
  if (comparisons.some(item => !item.absolute_threshold_passed)) failures.push("COMPARISON_ABSOLUTE_THRESHOLD_FAILED");
  if (comparisons.some(item => !item.non_regression_passed)) failures.push("COMPARISON_REGRESSION_THRESHOLD_FAILED");
  if (comparisons.some(item => item.hard_gate && !item.passed)) failures.push("COMPARISON_HARD_GATE_FAILED");
  return {
    comparisons,
    outcome: failures.length === 0 ? "promotable" : "rollback",
    blocking_codes: [...new Set(failures)].sort()
  };
}

function runComparativeEvaluation(campaign, plan, options) {
  const validation = [
    ...validatePayload(campaign, "self-improvement-campaign").issues,
    ...validatePayload(plan, "comparative-evaluation-plan").issues
  ].filter(item => item.severity === "error" || item.severity === "critical");
  if (validation.length > 0) {
    throw new Error(`Comparative evaluation input validation failed: ${validation.map(item => `${item.code}@${item.path}`).join(", ")}`);
  }
  validatePolicy(campaign, plan);
  const store = loadProofStore(options.candidateRepositoryPath, options.artifactRoot);
  const planEntry = uniqueManifestEntry(store, {
    artifactId: plan.id,
    missionId: plan.mission_id,
    waveId: `C${plan.cycle_number}`
  }, "comparative-evaluation-plans");
  const persistedPlan = readManifestEntry(store, planEntry, "comparative-evaluation-plans");
  if (sha256(jsonBytes(plan)) !== planEntry.sha256 || !sameObject(persistedPlan.payload, plan)) {
    throw new Error("Comparative evaluation plan does not match its pre-persisted artifact.");
  }
  const evaluationSetArtifact = readReferencedArtifact(store, plan.evaluation_set_ref, "comparative-evaluation-sets");
  const evaluationSet = evaluationSetArtifact.payload;
  const setValidation = validatePayload(evaluationSet, "comparative-evaluation-set").issues
    .filter(item => item.severity === "error" || item.severity === "critical");
  if (setValidation.length > 0) throw new Error(`Comparative evaluation set is invalid: ${[...new Set(setValidation.map(item => item.code))].join(", ")}`);
  if (evaluationSet.campaign_id !== campaign.id || evaluationSet.mission_id !== campaign.mission_id ||
      evaluationSetArtifact.entry.mission_id !== campaign.mission_id) {
    throw new Error("Comparative evaluation set does not belong to the campaign mission.");
  }
  if (Date.parse(evaluationSet.created_at) > Date.parse(plan.created_at)) throw new Error("Evaluation set was sealed after the comparison plan was created.");

  const baselineRepository = resolveRepository(options.baselineRepositoryPath);
  const candidateRepository = resolveRepository(options.candidateRepositoryPath);
  const baselineState = computeRepositoryState(baselineRepository.root);
  const candidateState = computeRepositoryState(candidateRepository.root);
  const initialCodes = verifyPlanBindings(campaign, plan, baselineRepository, candidateRepository, baselineState, candidateState);
  const startedAt = new Date().toISOString();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-comparison-"));
  try {
    const fixtureBytes = evaluationSetArtifact.bytes;
    const baselineFixture = path.join(temporaryRoot, "baseline-evaluation-set.json");
    const candidateFixture = path.join(temporaryRoot, "candidate-evaluation-set.json");
    fs.writeFileSync(baselineFixture, fixtureBytes, { mode: 0o400 });
    fs.writeFileSync(candidateFixture, fixtureBytes, { mode: 0o400 });
    const executions = {
      baseline: executeSubject({ campaign, plan, evaluationSet, evaluationSetHash: evaluationSetArtifact.entry.sha256, repositoryPath: baselineRepository.root, subjectKind: "baseline", fixturePath: baselineFixture, preflightBlocked: initialCodes.length > 0 }),
      candidate: executeSubject({ campaign, plan, evaluationSet, evaluationSetHash: evaluationSetArtifact.entry.sha256, repositoryPath: candidateRepository.root, subjectKind: "candidate", fixturePath: candidateFixture, preflightBlocked: initialCodes.length > 0 })
    };
    const evaluation = evaluateComparison(campaign, plan, evaluationSet, evaluationSetArtifact.entry.sha256, executions, initialCodes);
    const report = {
      schema_version: "0.1",
      type: "ComparativeEvaluationReport",
      id: `CER-${String(plan.id).replace(/^[A-Z]+-/, "")}`,
      plan_ref: {
        artifact_id: plan.id,
        relative_path: planEntry.relative_path,
        sha256: planEntry.sha256
      },
      campaign_id: campaign.id,
      mission_id: campaign.mission_id,
      cycle_number: plan.cycle_number,
      target_type: plan.target_type,
      repository_binding: plan.repository_binding,
      evaluation_set_ref: plan.evaluation_set_ref,
      evaluator: plan.independent_evaluator,
      executions,
      comparisons: evaluation.comparisons,
      outcome: evaluation.outcome,
      working_state_promotion_recommended: evaluation.outcome === "promotable",
      execution_authorized: false,
      release_authorized: false,
      blocking_codes: evaluation.blocking_codes,
      started_at: startedAt,
      finished_at: new Date().toISOString()
    };
    report.report_sha256 = reportDigest(report);
    return report;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = { writeArtifact: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-artifact") {
      options.writeArtifact = true;
    } else if (["--repository", "--candidate-repository", "--baseline-repository", "--artifact-root"].includes(arg)) {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      if (arg === "--repository" || arg === "--candidate-repository") options.candidateRepositoryPath = argv[index];
      if (arg === "--baseline-repository") options.baselineRepositoryPath = argv[index];
      if (arg === "--artifact-root") options.artifactRoot = argv[index];
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

function main() {
  try {
    const { positional, options } = parseArgs(process.argv.slice(2));
    if (positional.length !== 2 || !options.candidateRepositoryPath || !options.baselineRepositoryPath) {
      throw new Error("Usage: node comparative-evaluation-runner.js <campaign.json> <plan.json> --repository <candidate-repo> --baseline-repository <baseline-worktree> [--artifact-root <dir>] [--write-artifact]");
    }
    const campaign = readJson(path.resolve(positional[0]));
    const plan = readJson(path.resolve(positional[1]));
    const report = runComparativeEvaluation(campaign, plan, options);
    const failures = validatePayload(report, "comparative-evaluation-report").issues
      .filter(item => item.severity === "error" || item.severity === "critical");
    if (failures.length > 0 || report.report_sha256 !== reportDigest(report)) {
      throw new Error(`Generated comparative report failed validation: ${[...new Set(failures.map(item => item.code))].join(", ") || "REPORT_DIGEST_INVALID"}`);
    }
    if (options.writeArtifact) {
      const result = writeRepositoryArtifact({
        repositoryPath: options.candidateRepositoryPath,
        artifactRoot: options.artifactRoot,
        missionId: campaign.mission_id,
        waveId: `C${plan.cycle_number}`,
        kind: "comparative-evaluation-reports",
        artifactId: report.id,
        payload: report,
        createdAt: report.finished_at
      });
      console.error(`Artifact written: ${result.relative_path}`);
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.outcome === "promotable" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = {
  evaluateComparison,
  loadProofStore,
  reportDigest,
  runComparativeEvaluation
};
