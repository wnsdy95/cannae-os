#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  parseArtifactWriteFlags,
  resolveRepository,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");

const CHANGE_RANK = {
  local_reversible: 0,
  bounded_structural: 1,
  authority_affecting: 2,
  external_release: 3,
  destructive: 4
};

const CONTROL_PLANE_TARGETS = new Set(["runtime_control", "skill", "policy"]);
const SELF_REPORTED_EVIDENCE = /(?:model|agent)[ -]?(?:confidence|self[- ]?(?:assessment|approval|report|score))/i;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasItems(value) {
  return Array.isArray(value) && value.some(item => String(item).trim().length > 0 && !/^none$/i.test(String(item).trim()));
}

function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) return false;
  return !value.split(/[\\/]+/).includes("..");
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function normalizedMetric(value, direction) {
  const normalized = clamp(value);
  return direction === "minimize" ? 1 - normalized : normalized;
}

function scoreMetrics(campaign, checkpoint, blocks) {
  const dimensions = (campaign.quality_model && campaign.quality_model.dimensions) || [];
  const results = checkpoint.metric_results || [];
  const resultById = new Map(results.map(result => [result.dimension_id, result]));
  const dimensionIds = dimensions.map(dimension => dimension.id);
  const duplicateResultIds = results.map(result => result.dimension_id)
    .filter((id, index, all) => all.indexOf(id) !== index);

  if (new Set(dimensionIds).size !== dimensionIds.length) blocks.push("QUALITY_DIMENSION_DUPLICATE");
  if (duplicateResultIds.length > 0) blocks.push("METRIC_RESULT_DUPLICATE");
  for (const result of results) {
    if (!dimensionIds.includes(result.dimension_id)) blocks.push("METRIC_RESULT_UNKNOWN_DIMENSION");
  }

  const weightSum = dimensions.reduce((sum, dimension) => sum + Number(dimension.weight || 0), 0);
  if (Math.abs(weightSum - 1) > 0.000001) blocks.push("QUALITY_WEIGHTS_NOT_NORMALIZED");

  let weightedBefore = 0;
  let weightedAfter = 0;
  let allHardGatesPassed = true;

  for (const dimension of dimensions) {
    const result = resultById.get(dimension.id);
    if (!result) {
      blocks.push("METRIC_RESULT_MISSING");
      allHardGatesPassed = false;
      continue;
    }
    if (result.before < 0 || result.before > 1 || result.after < 0 || result.after > 1) {
      blocks.push("METRIC_NOT_NORMALIZED");
    }
    if (!hasItems(result.evidence) || result.evidence.every(item => SELF_REPORTED_EVIDENCE.test(String(item)))) {
      blocks.push("METRIC_WITHOUT_EXTERNAL_EVIDENCE");
    }
    const targetPassed = dimension.direction === "minimize"
      ? result.after <= dimension.target
      : result.after >= dimension.target;
    if (dimension.hard_gate && (result.hard_gate_passed !== true || !targetPassed)) {
      allHardGatesPassed = false;
      blocks.push("HARD_QUALITY_GATE_FAILED");
    }
    weightedBefore += normalizedMetric(result.before, dimension.direction) * dimension.weight;
    weightedAfter += normalizedMetric(result.after, dimension.direction) * dimension.weight;
  }

  return {
    weighted_before: Number(weightedBefore.toFixed(6)),
    weighted_after: Number(weightedAfter.toFixed(6)),
    weighted_delta: Number((weightedAfter - weightedBefore).toFixed(6)),
    minimum_delta: campaign.budgets ? campaign.budgets.min_weighted_improvement : 0,
    all_hard_gates_passed: allHardGatesPassed
  };
}

function requiresHumanDecision(campaign, checkpoint) {
  const externalities = checkpoint.externalities || {};
  const candidate = checkpoint.candidate || {};
  const targetType = checkpoint.target && checkpoint.target.target_type;
  const boundedStructuralBeyondEnvelope = CHANGE_RANK[candidate.change_class] > CHANGE_RANK[(campaign.authority_envelope || {}).max_change_class];

  return {
    required: Boolean(
      boundedStructuralBeyondEnvelope ||
      externalities.scope_changed ||
      externalities.authority_changed ||
      externalities.policy_changed ||
      externalities.release_requested ||
      candidate.change_class === "authority_affecting" ||
      candidate.change_class === "external_release" ||
      targetType === "policy"
    ),
    fatal: Boolean(externalities.destructive_action || externalities.cross_repository_write || candidate.change_class === "destructive")
  };
}

function approvalCoversCheckpoint(checkpoint) {
  const approval = checkpoint.approval || {};
  const candidate = checkpoint.candidate || {};
  return approval.required === true &&
    approval.status === "approved" &&
    approval.approved_by === "USER" &&
    approval.approval_id !== "none" &&
    (approval.scope || []).includes(candidate.id);
}

function baseTaskOrder(campaign, checkpoint, task, nextTrigger = "wave_end") {
  return {
    owner: (campaign.command_team && campaign.command_team.improvement_controller) || "COS",
    task,
    purpose: (campaign.objective && campaign.objective.intent) || "Advance the bounded campaign objective.",
    constraints: [
      "Stay inside the campaign authority envelope.",
      "Preserve every protected invariant.",
      "Do not release, merge, push, or expand authority without human approval."
    ],
    required_evidence: [
      "Repository-scoped checkpoint artifact.",
      "Deterministic validation results.",
      "Metric evidence compared with the declared baseline."
    ],
    next_checkpoint_trigger: nextTrigger
  };
}

function makeDecision(campaign, checkpoint, values) {
  return {
    schema_version: "0.1",
    type: "SelfImprovementDecision",
    id: `SID-${String(checkpoint.id || "checkpoint").replace(/^[A-Z]+-/, "")}`,
    campaign_id: campaign.id,
    checkpoint_id: checkpoint.id,
    mission_id: campaign.mission_id,
    cycle_number: checkpoint.cycle_number,
    decision: values.decision,
    execution_authorized: values.executionAuthorized,
    promotion_scope: values.promotionScope,
    release_authorized: false,
    selected_candidate_id: checkpoint.candidate.id,
    score: values.score,
    reasons: values.reasons,
    blocking_codes: [...new Set(values.blocks)].sort(),
    next_task_order: values.nextTaskOrder,
    human_decision_required: values.humanDecisionRequired,
    required_human_decision: values.requiredHumanDecision,
    decided_at: checkpoint.generated_at
  };
}

function analyzeImprovement(campaign, checkpoint) {
  campaign = campaign && typeof campaign === "object" && !Array.isArray(campaign) ? campaign : {};
  checkpoint = checkpoint && typeof checkpoint === "object" && !Array.isArray(checkpoint) ? checkpoint : {};
  const blocks = [];
  const reasons = [];
  const authority = campaign.authority_envelope || {};
  const budgets = campaign.budgets || {};
  const target = checkpoint.target || {};
  const candidate = checkpoint.candidate || {};
  const progress = checkpoint.progress || {};
  const independent = checkpoint.independent_evaluation || {};
  const externalities = checkpoint.externalities || {};

  if (campaign.status !== "active") blocks.push("CAMPAIGN_NOT_ACTIVE");
  if (checkpoint.campaign_id !== campaign.id) blocks.push("CAMPAIGN_ID_MISMATCH");
  if (checkpoint.mission_id !== campaign.mission_id) blocks.push("MISSION_ID_MISMATCH");
  if (!campaign.repository_binding || !checkpoint.repository_binding ||
      checkpoint.repository_binding.repository_key !== campaign.repository_binding.repository_key ||
      checkpoint.repository_binding.identity_fingerprint !== campaign.repository_binding.identity_fingerprint) {
    blocks.push("REPOSITORY_BINDING_MISMATCH");
  }
  if (checkpoint.cycle_number > budgets.max_cycles) blocks.push("CYCLE_BUDGET_EXCEEDED");
  if (!(campaign.checkpoint_policy && (campaign.checkpoint_policy.required_triggers || []).includes(checkpoint.trigger))) {
    blocks.push("CHECKPOINT_TRIGGER_OUTSIDE_CAMPAIGN");
  }
  if (checkpoint.cycle_number === 1 && target.baseline_revision !== (campaign.repository_binding || {}).baseline_revision) {
    blocks.push("CAMPAIGN_BASELINE_REVISION_MISMATCH");
  }
  if (checkpoint.cycle_number === 1 && checkpoint.parent_decision_id !== "none") blocks.push("FIRST_CYCLE_PARENT_INVALID");
  if (checkpoint.cycle_number > 1 && (!checkpoint.parent_decision_id || /^none$/i.test(checkpoint.parent_decision_id))) {
    blocks.push("PARENT_DECISION_MISSING");
  }
  if (progress.failed_experiments > budgets.max_failed_experiments) blocks.push("FAILED_EXPERIMENT_BUDGET_EXCEEDED");
  if (progress.consecutive_no_progress_cycles >= budgets.max_no_progress_cycles) blocks.push("NO_PROGRESS_LIMIT_REACHED");
  if (progress.elapsed_minutes > budgets.max_elapsed_minutes) blocks.push("ELAPSED_TIME_BUDGET_EXCEEDED");
  if (!(authority.autonomous_target_types || []).includes(target.target_type)) blocks.push("TARGET_OUTSIDE_AUTHORITY_ENVELOPE");
  if (target.state === "in_progress" && authority.may_modify_in_progress_work !== true) blocks.push("IN_PROGRESS_MODIFICATION_NOT_AUTHORIZED");
  if ((candidate.changed_files || []).length > budgets.max_changed_files_per_cycle) blocks.push("CHANGED_FILE_BUDGET_EXCEEDED");
  if ((candidate.changed_files || []).some(file => !safeRelativePath(file))) blocks.push("UNSAFE_CHANGED_FILE_PATH");
  if ((target.artifact_paths || []).some(file => !safeRelativePath(file))) blocks.push("UNSAFE_TARGET_ARTIFACT_PATH");
  if (new Set(candidate.changed_files || []).size !== (candidate.changed_files || []).length) blocks.push("DUPLICATE_CHANGED_FILE");
  if ((candidate.required_permissions || []).some(permission => !(authority.autonomous_actions || []).includes(permission))) {
    blocks.push("PERMISSION_OUTSIDE_AUTHORITY_ENVELOPE");
  }
  if (CHANGE_RANK[candidate.change_class] === undefined || CHANGE_RANK[authority.max_change_class] === undefined ||
      CHANGE_RANK[candidate.change_class] > CHANGE_RANK[authority.max_change_class]) {
    blocks.push("CHANGE_CLASS_OUTSIDE_AUTHORITY_ENVELOPE");
  }
  if (hasItems(candidate.protected_invariants_affected)) blocks.push("PROTECTED_INVARIANT_AFFECTED");
  if (!hasItems(candidate.rollback_steps) && candidate.disposition !== "no_change") blocks.push("ROLLBACK_PLAN_MISSING");

  const failedValidation = (checkpoint.validation_results || []).some(result => result.status !== "passed" || result.exit_code !== 0);
  if (failedValidation) blocks.push("VALIDATION_NOT_PASSED");
  if (!hasItems((checkpoint.validation_results || []).flatMap(result => result.evidence || []))) blocks.push("VALIDATION_EVIDENCE_MISSING");

  if (CONTROL_PLANE_TARGETS.has(target.target_type)) {
    if (independent.required !== true || independent.status !== "passed" || independent.evaluator === campaign.command_team.improvement_controller || !hasItems(independent.evidence)) {
      blocks.push("INDEPENDENT_CONTROL_PLANE_EVALUATION_MISSING");
    }
  } else if (independent.required === true && (independent.status !== "passed" || !hasItems(independent.evidence))) {
    blocks.push("REQUIRED_INDEPENDENT_EVALUATION_NOT_PASSED");
  }

  const score = scoreMetrics(campaign, checkpoint, blocks);
  const human = requiresHumanDecision(campaign, checkpoint);
  const approvalCovered = approvalCoversCheckpoint(checkpoint);
  if (human.fatal) blocks.push("PROHIBITED_EXTERNALITY");
  if (human.required && !approvalCovered) blocks.push("HUMAN_APPROVAL_REQUIRED");
  if (checkpoint.approval && checkpoint.approval.status === "approved" && !approvalCovered) blocks.push("APPROVAL_SCOPE_INVALID");
  if (externalities.release_requested) blocks.push("RELEASE_REQUIRES_SEPARATE_GATE");

  const allCriteriaComplete = Array.isArray(progress.open_acceptance_criteria) && progress.open_acceptance_criteria.length === 0;
  const meetsScore = score.weighted_after >= campaign.quality_model.minimum_weighted_score;
  const meaningfulImprovement = score.weighted_delta >= budgets.min_weighted_improvement;
  const canAutoRollback = target.state !== "working_state" &&
    (authority.autonomous_actions || []).includes("revert_own_uncommitted_change") &&
    !human.fatal;

  if (human.fatal) {
    reasons.push("The candidate attempts a destructive or cross-repository action prohibited by the campaign.");
    return makeDecision(campaign, checkpoint, {
      decision: "terminate",
      executionAuthorized: false,
      promotionScope: "none",
      score,
      reasons,
      blocks,
      nextTaskOrder: baseTaskOrder(campaign, checkpoint, "Stop execution, preserve evidence, and prepare a Commander/user incident decision packet.", "manual"),
      humanDecisionRequired: true,
      requiredHumanDecision: "Decide whether to terminate or replace the campaign after reviewing the prohibited action."
    });
  }

  if (failedValidation || candidate.disposition === "rollback" || blocks.includes("HARD_QUALITY_GATE_FAILED")) {
    reasons.push("The candidate failed validation, a hard quality gate, or explicitly requested rollback.");
    return makeDecision(campaign, checkpoint, {
      decision: canAutoRollback ? "rollback" : "escalate",
      executionAuthorized: canAutoRollback,
      promotionScope: "none",
      score,
      reasons,
      blocks,
      nextTaskOrder: baseTaskOrder(campaign, checkpoint, canAutoRollback
        ? "Revert only this campaign's uncommitted candidate changes, preserve failure evidence, and prepare a smaller repair candidate."
        : "Preserve the failed candidate and request human rollback authority.", "validation_failure"),
      humanDecisionRequired: !canAutoRollback,
      requiredHumanDecision: canAutoRollback ? "none" : "Approve or reject rollback of the current working state."
    });
  }

  if (blocks.length > 0) {
    const budgetStopped = blocks.some(code => [
      "CYCLE_BUDGET_EXCEEDED",
      "FAILED_EXPERIMENT_BUDGET_EXCEEDED",
      "NO_PROGRESS_LIMIT_REACHED",
      "ELAPSED_TIME_BUDGET_EXCEEDED"
    ].includes(code));
    reasons.push(budgetStopped
      ? "A campaign stop budget was reached; autonomous continuation is suspended."
      : "The checkpoint is outside the bounded execution envelope or lacks required evidence.");
    return makeDecision(campaign, checkpoint, {
      decision: "escalate",
      executionAuthorized: false,
      promotionScope: "none",
      score,
      reasons,
      blocks,
      nextTaskOrder: baseTaskOrder(campaign, checkpoint, "Preserve the candidate and produce a decision packet resolving every blocking code.", "manual"),
      humanDecisionRequired: true,
      requiredHumanDecision: "Approve a bounded exception, issue a scope change, or stop the campaign."
    });
  }

  if (candidate.disposition === "no_change") {
    if (checkpoint.trigger === "before_completion" && allCriteriaComplete && meetsScore && score.all_hard_gates_passed) {
      reasons.push("All acceptance criteria and quality gates pass at the mandatory completion checkpoint.");
      return makeDecision(campaign, checkpoint, {
        decision: "complete",
        executionAuthorized: false,
        promotionScope: "working_state",
        score,
        reasons,
        blocks,
        nextTaskOrder: baseTaskOrder(campaign, checkpoint, "Freeze the working state and prepare the human release or merge decision packet.", "manual"),
        humanDecisionRequired: true,
        requiredHumanDecision: "Approve or reject merge, push, or external release through the separate release gate."
      });
    }
    reasons.push("No bounded change is proposed; continue observation or close remaining acceptance gaps.");
    return makeDecision(campaign, checkpoint, {
      decision: "continue",
      executionAuthorized: authority.may_start_follow_on_cycles === true,
      promotionScope: "none",
      score,
      reasons,
      blocks,
      nextTaskOrder: baseTaskOrder(campaign, checkpoint, "Inspect the next open acceptance criterion and propose one evidence-backed, bounded candidate."),
      humanDecisionRequired: false,
      requiredHumanDecision: "none"
    });
  }

  if (!meetsScore || (!meaningfulImprovement && candidate.disposition !== "repair")) {
    reasons.push("The candidate does not meet the campaign quality floor or minimum improvement delta.");
    return makeDecision(campaign, checkpoint, {
      decision: "revise_and_retry",
      executionAuthorized: authority.may_start_follow_on_cycles === true,
      promotionScope: "none",
      score,
      reasons,
      blocks,
      nextTaskOrder: baseTaskOrder(campaign, checkpoint, "Revise the candidate against the weakest measured dimension without broadening scope."),
      humanDecisionRequired: false,
      requiredHumanDecision: "none"
    });
  }

  reasons.push("The candidate stays inside authority, passes validation and hard gates, and improves the declared quality model.");
  return makeDecision(campaign, checkpoint, {
    decision: "accept_working_state",
    executionAuthorized: true,
    promotionScope: target.state === "in_progress" ? "in_progress_work" : "working_state",
    score,
    reasons,
    blocks,
    nextTaskOrder: baseTaskOrder(campaign, checkpoint, allCriteriaComplete
      ? "Run the mandatory before-completion checkpoint; do not release or merge."
      : "Advance the next open acceptance criterion from the accepted working state.", allCriteriaComplete ? "before_completion" : "wave_end"),
    humanDecisionRequired: false,
    requiredHumanDecision: "none"
  });
}

function parseArgs(argv) {
  const positional = [];
  const artifactArgs = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      artifactArgs.push(argv[index]);
      if (["--repository", "--artifact-root"].includes(argv[index])) {
        index += 1;
        if (index >= argv.length) throw new Error(`${artifactArgs.at(-1)} requires a value.`);
        artifactArgs.push(argv[index]);
      }
    } else {
      positional.push(argv[index]);
    }
  }
  return { positional, artifactOptions: parseArtifactWriteFlags(artifactArgs) };
}

function main() {
  try {
    const { positional, artifactOptions } = parseArgs(process.argv.slice(2));
    if (positional.length !== 2) {
      throw new Error("Usage: node autonomous-improvement-controller.js <campaign.json> <checkpoint.json> [--write-artifact --repository <repo> [--artifact-root <dir>] [--overwrite-artifact]]");
    }
    const campaign = readJson(path.resolve(positional[0]));
    const checkpoint = readJson(path.resolve(positional[1]));
    const campaignValidation = validatePayload(campaign, "self-improvement-campaign");
    const checkpointValidation = validatePayload(checkpoint, "self-improvement-checkpoint");
    const campaignInputFailures = campaignValidation.issues
      .filter(item => item.severity === "error" || item.severity === "critical");
    const checkpointInputFailures = checkpointValidation.issues
      .filter(item => item.layer === "schema" && (item.severity === "error" || item.severity === "critical"));
    if (campaignInputFailures.length > 0 || checkpointInputFailures.length > 0) {
      const codes = [...campaignInputFailures, ...checkpointInputFailures]
        .map(item => item.code);
      throw new Error(`Self-improvement input validation failed: ${[...new Set(codes)].join(", ")}`);
    }
    let decision = analyzeImprovement(campaign, checkpoint);

    if (artifactOptions.writeArtifact) {
      const repository = resolveRepository(artifactOptions.repositoryPath);
      if (campaign.repository_binding.repository_key !== repository.key ||
          campaign.repository_binding.identity_fingerprint !== repository.identity_fingerprint) {
        decision = {
          ...decision,
          decision: "escalate",
          execution_authorized: false,
          promotion_scope: "none",
          human_decision_required: true,
          required_human_decision: "Correct the campaign repository binding before continuing.",
          reasons: [...decision.reasons, "The runtime target repository does not match the campaign binding."],
          blocking_codes: [...new Set([...decision.blocking_codes, "RUNTIME_REPOSITORY_BINDING_MISMATCH"])].sort()
        };
      } else {
        const checkpointWriteResult = writeRepositoryArtifact({
          repositoryPath: artifactOptions.repositoryPath,
          artifactRoot: artifactOptions.artifactRoot,
          missionId: campaign.mission_id,
          waveId: `C${checkpoint.cycle_number}`,
          kind: "self-improvement-checkpoints",
          artifactId: checkpoint.id,
          payload: checkpoint,
          createdAt: checkpoint.generated_at,
          overwrite: artifactOptions.overwriteArtifact
        });
        console.error(`Artifact written: ${checkpointWriteResult.relative_path}`);
        const decisionWriteResult = writeRepositoryArtifact({
          repositoryPath: artifactOptions.repositoryPath,
          artifactRoot: artifactOptions.artifactRoot,
          missionId: campaign.mission_id,
          waveId: `C${checkpoint.cycle_number}`,
          kind: "self-improvement-decisions",
          artifactId: decision.id,
          payload: decision,
          createdAt: checkpoint.generated_at,
          overwrite: artifactOptions.overwriteArtifact
        });
        console.error(`Artifact written: ${decisionWriteResult.relative_path}`);
      }
    }

    process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
    process.exit(["escalate", "terminate"].includes(decision.decision) ? 1 : 0);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = {
  analyzeImprovement,
  normalizedMetric,
  safeRelativePath,
  scoreMetrics
};
