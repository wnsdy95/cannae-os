#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parseArtifactWriteFlags, writeRepositoryArtifact } = require("./repository-artifact-store");

const READINESS_RANK = { X: 0, U: 1, P: 2, T: 3 };
const COST_SCORE = { low: 100, medium: 70, high: 40, scarce: 10 };
const CAPABILITY_RANK = { C0: 0, C1: 1, C2: 2, C3: 3 };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function unique(values) {
  return [...new Set(values)];
}

function isImmutableVersion(value) {
  return typeof value === "string" && value.length > 0 && !/^(latest|current|default)$/i.test(value.trim());
}

function containsSecretReference(value) {
  return /api[_-]?key|token|password|private[_-]?key|plaintext[_-]?secret/i.test(String(value || ""));
}

function taskReadiness(profile, task) {
  return (profile.task_readiness || []).find(item => item.task === task);
}

function scoreCandidate(profile, readiness, weights) {
  const weighted = (
    readiness.quality_score * weights.quality
    + readiness.policy_compliance_score * weights.policy
    + (COST_SCORE[profile.cost_class] || 0) * weights.cost
    + readiness.latency_score * weights.latency
  ) / 100;
  return Math.round(weighted * 100) / 100;
}

function compareCandidates(left, right) {
  if (right.score !== left.score) return right.score - left.score;
  if ((COST_SCORE[right.profile.cost_class] || 0) !== (COST_SCORE[left.profile.cost_class] || 0)) {
    return (COST_SCORE[right.profile.cost_class] || 0) - (COST_SCORE[left.profile.cost_class] || 0);
  }
  if ((CAPABILITY_RANK[left.profile.capability_band] || 0) !== (CAPABILITY_RANK[right.profile.capability_band] || 0)) {
    return (CAPABILITY_RANK[left.profile.capability_band] || 0) - (CAPABILITY_RANK[right.profile.capability_band] || 0);
  }
  return left.profile.id.localeCompare(right.profile.id);
}

function evaluateCandidate(profile, requirement, request, minimumReadiness) {
  const reasons = [];
  const readiness = taskReadiness(profile, requirement.task);
  const asOf = Date.parse(request.created_at);

  if ((request.constraints.excluded_profile_ids || []).includes(profile.id)) reasons.push("profile is excluded");
  if (profile.availability !== "ready") reasons.push(`availability is ${profile.availability}`);
  for (const field of ["model_version", "harness_version", "system_prompt_version", "tool_schema_version"]) {
    if (!isImmutableVersion(profile[field])) reasons.push(`${field} is not immutable`);
  }
  if (containsSecretReference(profile.endpoint_ref)) reasons.push("endpoint reference contains secret material");
  if (!(profile.force_classes || []).includes(requirement.force_class)) reasons.push("force class is not qualified");
  if (!(request.constraints.allowed_deployment_boundaries || []).includes(profile.deployment_boundary)) reasons.push("deployment boundary is not allowed");
  if (!(profile.allowed_context_classes || []).includes(requirement.context_scope)) reasons.push("context class is not allowed");
  if (!readiness) {
    reasons.push("task has no readiness record");
  } else {
    if ((READINESS_RANK[readiness.readiness_rating] ?? -1) < (READINESS_RANK[minimumReadiness] ?? 99)) reasons.push("readiness is below requirement");
    if (!(readiness.allowed_tool_impacts || []).includes(requirement.tool_impact)) reasons.push("tool impact is not evaluated");
    if (!hasItems(readiness.evidence)) reasons.push("readiness evidence is missing");
    if (Number.isNaN(Date.parse(readiness.expires_at)) || Date.parse(readiness.expires_at) <= asOf) reasons.push("readiness evaluation is expired");
  }

  return { eligible: reasons.length === 0, reasons, readiness };
}

function rankCandidates(registry, requirement, request, minimumReadiness = requirement.required_readiness) {
  return (registry.profiles || []).map(profile => {
    const evaluation = evaluateCandidate(profile, requirement, request, minimumReadiness);
    return {
      profile,
      readiness: evaluation.readiness,
      eligible: evaluation.eligible,
      reasons: evaluation.reasons,
      score: evaluation.eligible ? scoreCandidate(profile, evaluation.readiness, request.selection_policy.weights) : null
    };
  }).sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    if (!left.eligible) return left.profile.id.localeCompare(right.profile.id);
    return compareCandidates(left, right);
  });
}

function minimumReadiness(ratings) {
  return ratings.reduce((minimum, rating) => {
    if (!minimum) return rating;
    return READINESS_RANK[rating] < READINESS_RANK[minimum] ? rating : minimum;
  }, null) || "X";
}

function compileModelAssignment(registry, request) {
  const blocks = [];
  const warnings = [];
  const decisionLog = [];
  const candidateRankings = [];
  const requirements = request.billet_requirements || [];
  const highImpact = ["high", "critical"].includes(request.mission_profile && request.mission_profile.risk_level)
    || request.mission_profile && request.mission_profile.roe_class === "Red"
    || request.mission_profile && ["final_output", "external_release"].includes(request.mission_profile.release_target)
    || request.mission_profile && request.mission_profile.tool_impact === "irreversible_mutation";

  if (!registry.governance || registry.governance.human_final_decision_authority !== true) {
    blocks.push("Model registry must preserve human final decision authority.");
  }
  if (!registry.governance || registry.governance.floating_versions_prohibited !== true) {
    blocks.push("Model registry must prohibit floating identity versions.");
  }
  if (!registry.governance || !["S4", "COS", "COMMANDER"].includes(registry.governance.owner_role)) {
    blocks.push("Model registry requires sustainment or command ownership.");
  }
  if (!isImmutableVersion(registry.registry_version)) {
    blocks.push("Model registry version must be immutable.");
  }
  if (request.registry_id !== registry.id || request.registry_version !== registry.registry_version) {
    blocks.push("Assignment request must target the exact model registry ID and version being compiled.");
  }
  const registryProfileIds = new Set();
  for (const profile of registry.profiles || []) {
    if (registryProfileIds.has(profile.id)) blocks.push(`Model registry contains duplicate profile ID ${profile.id}.`);
    registryProfileIds.add(profile.id);
    const taskIds = new Set();
    for (const readiness of profile.task_readiness || []) {
      if (taskIds.has(readiness.task)) blocks.push(`${profile.id}: duplicate readiness record for task ${readiness.task}.`);
      taskIds.add(readiness.task);
    }
  }

  if (request.mission_profile && request.mission_profile.roe_class === "Black") {
    blocks.push("Black missions cannot be compiled into executable model assignments.");
  }
  if (request.classification !== (request.mission_profile && request.mission_profile.classification)) {
    blocks.push("Request classification must match mission profile classification.");
  }
  const weights = request.selection_policy && request.selection_policy.weights;
  if (!weights || Object.values(weights).reduce((sum, value) => sum + value, 0) !== 100) {
    blocks.push("Selection weights must total 100.");
  }
  if (highImpact && !requirements.some(item => item.force_class === "command" || item.force_class === "sof")) {
    blocks.push("High-impact request requires command or SOF integration.");
  }
  if (highImpact && request.assurance && request.assurance.required !== true) {
    blocks.push("High-impact request requires independent assurance.");
  }
  if (request.assurance && request.assurance.required === true && !requirements.some(item => item.force_class === "assurance")) {
    blocks.push("Assurance is required but no assurance billet was requested.");
  }
  if (!request.authority || request.authority.inherited_from_model !== false || request.authority.human_final_decision_authority !== true) {
    blocks.push("Human final decision authority must remain explicit and separate from model capability.");
  }

  const ids = requirements.map(item => item.id);
  if (new Set(ids).size !== ids.length) blocks.push("Billet requirement IDs must be unique.");
  for (const requirement of requirements) {
    if (["command", "sof", "assurance"].includes(requirement.force_class) && requirement.fallback_depth < 2) {
      blocks.push(`${requirement.id}: critical billet requires alternate and contingency depth.`);
    }
  }
  if (blocks.length > 0) {
    return { schema_version: "0.2", type: "ModelAssignmentCompilation", request_id: request.id, mission_id: request.mission_id, status: "blocked", plan: null, candidate_rankings: [], decision_log: [], preflight_blocks: blocks, warnings };
  }

  const assuranceRequirements = requirements.filter(item => item.force_class === "assurance");
  const primaryOrder = [...requirements.filter(item => item.force_class !== "assurance"), ...assuranceRequirements];
  const assignments = new Map();
  const primaryLoads = new Map();
  const protectedFamilies = new Set();

  for (const requirement of primaryOrder) {
    const ranked = rankCandidates(registry, requirement, request);
    candidateRankings.push({
      billet_id: requirement.id,
      task: requirement.task,
      candidates: ranked.slice(0, request.selection_policy.max_candidates_per_billet).map(item => ({
        profile_id: item.profile.id,
        eligible: item.eligible,
        score: item.score,
        reasons: item.reasons
      }))
    });

    const enforceDiversity = request.constraints.require_family_diversity && ["command", "sof", "assurance"].includes(requirement.force_class);
    const primary = ranked.find(item => item.eligible
      && (primaryLoads.get(item.profile.id) || 0) < request.constraints.max_primary_billets_per_profile
      && (!enforceDiversity || !protectedFamilies.has(item.profile.model_family)));
    if (!primary) {
      blocks.push(`${requirement.id}: no eligible primary profile remains after hard filters, load limits, and family separation.`);
      continue;
    }

    primaryLoads.set(primary.profile.id, (primaryLoads.get(primary.profile.id) || 0) + 1);
    if (enforceDiversity) protectedFamilies.add(primary.profile.model_family);

    const fallbackRanked = rankCandidates(registry, requirement, request, "P")
      .filter(item => item.eligible && item.profile.id !== primary.profile.id);
    const fallbacks = [];
    const fallbackFamilies = new Set([primary.profile.model_family]);
    for (const candidate of fallbackRanked) {
      if (fallbacks.length >= requirement.fallback_depth) break;
      if (request.constraints.require_family_diversity && fallbackFamilies.has(candidate.profile.model_family)) continue;
      fallbacks.push(candidate);
      fallbackFamilies.add(candidate.profile.model_family);
    }
    if (fallbacks.length < requirement.fallback_depth) {
      blocks.push(`${requirement.id}: requires ${requirement.fallback_depth} qualified fallback profiles but found ${fallbacks.length}.`);
      continue;
    }

    assignments.set(requirement.id, { requirement, primary, fallbacks });
    decisionLog.push({
      billet_id: requirement.id,
      selected_profile_id: primary.profile.id,
      score: primary.score,
      fallback_profile_ids: fallbacks.map(item => item.profile.id),
      reason: "Selected only after deployment, context, task, tool-impact, readiness, evidence, expiry, availability, load, and diversity gates passed."
    });
  }

  const routerRequirement = requirements.find(item => item.task === request.constraints.router_task);
  if (!routerRequirement || !assignments.has(routerRequirement.id)) blocks.push("No compiled router billet matches constraints.router_task.");
  const assuranceRequirement = requirements.find(item => item.force_class === "assurance");
  if (request.assurance.required && (!assuranceRequirement || !assignments.has(assuranceRequirement.id))) blocks.push("Required assurance billet was not compiled.");
  const paceRequirement = requirements.find(item => item.force_class === "command")
    || requirements.find(item => item.dispatch_required)
    || requirements[0];
  const paceAssignment = paceRequirement && assignments.get(paceRequirement.id);
  if (!paceAssignment || paceAssignment.fallbacks.length < 2) blocks.push("PACE requires a compiled primary with alternate and contingency profiles.");

  if (blocks.length > 0) {
    return { schema_version: "0.2", type: "ModelAssignmentCompilation", request_id: request.id, mission_id: request.mission_id, status: "blocked", plan: null, candidate_rankings: candidateRankings, decision_log: decisionLog, preflight_blocks: blocks, warnings };
  }

  const selectedIds = new Set();
  for (const assignment of assignments.values()) {
    selectedIds.add(assignment.primary.profile.id);
    for (const fallback of assignment.fallbacks) selectedIds.add(fallback.profile.id);
  }
  const profileUsage = new Map([...selectedIds].map(id => [id, []]));
  for (const assignment of assignments.values()) {
    profileUsage.get(assignment.primary.profile.id).push(assignment.requirement.task);
    for (const fallback of assignment.fallbacks) profileUsage.get(fallback.profile.id).push(assignment.requirement.task);
  }

  const materializedProfiles = (registry.profiles || []).filter(profile => selectedIds.has(profile.id)).map(profile => {
    const tasks = unique(profileUsage.get(profile.id));
    const readinessEntries = tasks.map(task => taskReadiness(profile, task)).filter(Boolean);
    return {
      id: profile.id,
      model_family: profile.model_family,
      model_version: profile.model_version,
      harness_version: profile.harness_version,
      capability_band: profile.capability_band,
      force_classes: profile.force_classes,
      deployment_boundary: profile.deployment_boundary,
      allowed_context_classes: profile.allowed_context_classes,
      evaluated_tasks: tasks,
      readiness_rating: minimumReadiness(readinessEntries.map(item => item.readiness_rating)),
      evidence: unique(readinessEntries.flatMap(item => item.evidence || [])),
      limitations: profile.limitations,
      cost_class: profile.cost_class,
      availability: profile.availability
    };
  });

  const billets = requirements.map(requirement => {
    const assignment = assignments.get(requirement.id);
    return {
      id: requirement.id,
      force_class: requirement.force_class,
      role: requirement.role,
      task: requirement.task,
      model_profile_id: assignment.primary.profile.id,
      required_readiness: requirement.required_readiness,
      authority_scope: requirement.authority_scope,
      tool_scope: requirement.tool_scope,
      context_scope: requirement.context_scope,
      fallback_profile_ids: assignment.fallbacks.map(item => item.profile.id),
      allocation_justification: `Compiler score ${assignment.primary.score}; all hard eligibility gates passed.`
    };
  });

  const routerAssignment = assignments.get(routerRequirement.id);
  const assuranceAssignment = assuranceRequirement && assignments.get(assuranceRequirement.id);
  const plan = {
    schema_version: "0.1",
    type: "ModelForceAssignmentPlan",
    id: `MFAP-${request.id.replace(/^[A-Z]+-/, "")}`,
    mission_id: request.mission_id,
    mission_profile: request.mission_profile,
    model_profiles: materializedProfiles,
    billets,
    routing_policy: {
      router_profile_id: routerAssignment.primary.profile.id,
      router_readiness: routerAssignment.primary.readiness.readiness_rating,
      default_strategy: highImpact ? "sof_composition" : request.selection_policy.strategy === "economy_of_force" ? "line_first" : "specialist_first",
      held_out_evaluation: routerAssignment.primary.readiness.evidence,
      escalation_triggers: ["Local validation failure", "Task outside evaluated METL", "Authority, context, release, or risk boundary change", "Evaluation expiry or model availability change"],
      acceptance_evidence: unique(["Compiler hard eligibility report", ...(request.assurance.deterministic_checks || [])]),
      verbal_confidence_only_prohibited: true,
      max_retries: 2
    },
    assurance: {
      required: request.assurance.required,
      independent_profile_id: assuranceAssignment ? assuranceAssignment.primary.profile.id : routerAssignment.primary.profile.id,
      different_model_family_required: request.assurance.different_model_family_required,
      deterministic_checks: request.assurance.deterministic_checks,
      human_review_triggers: request.assurance.human_review_triggers
    },
    pace: {
      primary_profile_id: paceAssignment.primary.profile.id,
      alternate_profile_id: paceAssignment.fallbacks[0].profile.id,
      contingency_profile_id: paceAssignment.fallbacks[1].profile.id,
      emergency_action: "Stop execution, preserve mission state, and hand off to the human Commander.",
      preserve_data_boundary: true
    },
    authority: request.authority,
    budget: request.budget,
    assessment: {
      metrics: request.assessment.metrics,
      review_at: request.assessment.review_at,
      model_change_requires_reevaluation: true,
      aar_triggers: request.assessment.aar_triggers
    },
    classification: request.classification,
    status: "pending",
    created_at: request.created_at
  };

  return {
    schema_version: "0.2",
    type: "ModelAssignmentCompilation",
    request_id: request.id,
    mission_id: request.mission_id,
    registry_id: registry.id,
    registry_version: registry.registry_version,
    status: "compiled",
    plan,
    candidate_rankings: candidateRankings,
    decision_log: decisionLog,
    preflight_blocks: [],
    warnings
  };
}

function main() {
  const registryPath = process.argv[2];
  const requestPath = process.argv[3];
  if (!registryPath || !requestPath) {
    console.error("Usage: node model-assignment-compiler.js <model-registry.json> <model-assignment-request.json> [--write-artifact --repository <repo> [--artifact-root <dir>] [--overwrite-artifact]]");
    process.exit(2);
  }
  let artifactOptions;
  let request;
  let result;
  try {
    artifactOptions = parseArtifactWriteFlags(process.argv.slice(4));
    request = readJson(path.resolve(requestPath));
    result = compileModelAssignment(readJson(path.resolve(registryPath)), request);
  } catch (error) {
    result = {
      schema_version: "0.2",
      type: "ModelAssignmentCompilation",
      status: "blocked",
      plan: null,
      candidate_rankings: [],
      decision_log: [],
      preflight_blocks: [`Compiler rejected malformed input: ${error.message}`],
      warnings: []
    };
  }
  if (artifactOptions && artifactOptions.writeArtifact) {
    try {
      const artifact = writeRepositoryArtifact({
        repositoryPath: artifactOptions.repositoryPath,
        artifactRoot: artifactOptions.artifactRoot,
        missionId: result.mission_id || (request && request.mission_id) || "MIS-unknown",
        waveId: (request && request.wave_id) || "W-unknown",
        kind: "model-assignment-compilations",
        artifactId: result.request_id || (request && request.id) || "MAR-unknown",
        payload: result,
        overwrite: artifactOptions.overwriteArtifact
      });
      console.error(`Artifact written: ${artifact.artifact_path}`);
    } catch (error) {
      result.status = "blocked";
      result.preflight_blocks = [...(result.preflight_blocks || []), `Artifact persistence failed: ${error.message}`];
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === "compiled" ? 0 : 1);
}

if (require.main === module) main();

module.exports = { compileModelAssignment, evaluateCandidate, rankCandidates };
