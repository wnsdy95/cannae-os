#!/usr/bin/env node

const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");

function parseArgs(argv) {
  const options = {
    criteria: [],
    nonGoals: [],
    maxCycles: 8,
    maxChangedFiles: 12,
    maxElapsedMinutes: 240,
    minImprovement: 0.03,
    minimumAttestations: 2,
    minimumIndependenceGroups: 2,
    maxAttestationAgeSeconds: 900,
    allowedVerifiers: [],
    allowCommit: false,
    writeArtifact: false
  };
  const singleValue = new Set([
    "repository", "artifact-root", "mission", "campaign", "objective", "end-state",
    "max-cycles", "max-changed-files", "max-elapsed-minutes", "min-improvement", "created-at",
    "trust-policy-id", "trust-policy-path", "trust-policy-sha256", "minimum-attestations",
    "minimum-independence-groups", "max-attestation-age-seconds"
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-commit") {
      options.allowCommit = true;
      continue;
    }
    if (arg === "--write-artifact") {
      options.writeArtifact = true;
      continue;
    }
    if (arg === "--criterion" || arg === "--non-goal" || arg === "--allow-verifier") {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      if (arg === "--criterion") options.criteria.push(argv[index]);
      if (arg === "--non-goal") options.nonGoals.push(argv[index]);
      if (arg === "--allow-verifier") options.allowedVerifiers.push(argv[index]);
      continue;
    }
    if (arg.startsWith("--") && singleValue.has(arg.slice(2))) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      options[key] = argv[index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  for (const field of ["maxCycles", "maxChangedFiles", "maxElapsedMinutes", "minimumAttestations", "minimumIndependenceGroups", "maxAttestationAgeSeconds"]) {
    options[field] = Number(options[field]);
    if (!Number.isInteger(options[field]) || options[field] < 1) throw new Error(`${field} must be a positive integer.`);
  }
  options.minImprovement = Number(options.minImprovement);
  if (!Number.isFinite(options.minImprovement) || options.minImprovement < 0 || options.minImprovement > 1) {
    throw new Error("minImprovement must be between 0 and 1.");
  }
  const trustFields = [options.trustPolicyId, options.trustPolicyPath, options.trustPolicySha256];
  if (trustFields.some(Boolean) && !trustFields.every(Boolean)) {
    throw new Error("Signed quorum requires --trust-policy-id, --trust-policy-path, and --trust-policy-sha256 together.");
  }
  if (options.trustPolicyId && (options.minimumAttestations < 2 || options.minimumIndependenceGroups < 2 ||
      options.minimumIndependenceGroups > options.minimumAttestations || !/^[a-f0-9]{64}$/.test(options.trustPolicySha256))) {
    throw new Error("Signed quorum requires at least two attestations, two independence groups, and a valid trust-policy SHA-256 digest.");
  }
  return options;
}

function buildCampaign(options) {
  const required = ["repository", "mission", "campaign", "objective", "endState"];
  for (const field of required) {
    if (!options[field]) throw new Error(`--${field.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)} is required.`);
  }
  if (options.criteria.length === 0) throw new Error("At least one --criterion is required.");
  const repository = resolveRepository(options.repository);
  const createdAt = options.createdAt || new Date().toISOString();
  const campaign = {
    schema_version: options.trustPolicyId ? "0.3" : "0.2",
    type: "SelfImprovementCampaign",
    id: options.campaign,
    mission_id: options.mission,
    repository_binding: {
      repository_key: repository.key,
      identity_fingerprint: repository.identity_fingerprint,
      baseline_revision: repository.head_commit
    },
    objective: {
      intent: options.objective,
      end_state: options.endState,
      acceptance_criteria: options.criteria,
      non_goals: options.nonGoals.length > 0 ? options.nonGoals : [
        "Autonomous expansion of scope, policy, or authority.",
        "Autonomous merge, push, or external release."
      ]
    },
    final_decision_authority: "USER",
    command_team: {
      campaign_owner: "COS",
      improvement_controller: "S3",
      independent_evaluator: "EVALUATOR",
      recorder: "RECORDER"
    },
    authority_envelope: {
      autonomous_target_types: ["work_product", "test_fixture", "documentation", "procedure", "runtime_control", "skill", "policy"],
      autonomous_actions: ["inspect", "route", "analyze", "draft", "edit", "test", "checkpoint", "propose", "revert_own_uncommitted_change", "persist_artifact"],
      max_change_class: "bounded_structural",
      may_modify_in_progress_work: true,
      may_start_follow_on_cycles: true,
      may_promote_to_working_state: true,
      commit_requires_human: !options.allowCommit,
      push_requires_human: true,
      merge_requires_human: true,
      release_requires_human: true,
      authority_change_requires_human: true,
      policy_change_requires_human: true,
      destructive_action_prohibited: true,
      self_approval_prohibited: true,
      standing_approval_ids: []
    },
    protected_invariants: [
      "The human user remains final decision authority.",
      "Model capability never creates authority.",
      "Artifacts remain bound to one repository identity.",
      "Failed candidates are never promoted.",
      "Merge, push, and release remain separate human-gated actions."
    ],
    quality_model: {
      dimensions: [
        {
          id: "correctness",
          weight: 0.5,
          direction: "maximize",
          target: 0.9,
          hard_gate: true,
          evidence_required: ["Deterministic tests or independent factual verification."]
        },
        {
          id: "completeness",
          weight: 0.3,
          direction: "maximize",
          target: 0.85,
          hard_gate: true,
          evidence_required: ["Acceptance-criteria coverage evidence."]
        },
        {
          id: "verification",
          weight: 0.2,
          direction: "maximize",
          target: 1,
          hard_gate: true,
          evidence_required: ["Required validation suite results with exit status."]
        }
      ],
      minimum_weighted_score: 0.87,
      hard_gates_must_pass: true
    },
    verification_policy: {
      proof_required: true,
      allowed_executables: options.allowedVerifiers.length > 0
        ? [...new Set(options.allowedVerifiers)]
        : ["node", "git"],
      max_checks_per_plan: 20,
      max_timeout_ms_per_check: 300000,
      max_output_bytes_per_stream: 4194304,
      repository_state_must_remain_unchanged: true,
      receipt_persistence_required: true
    },
    comparative_evaluation_policy: {
      required_target_types: ["runtime_control", "skill"],
      same_evaluation_set_required: true,
      identical_harness_required: true,
      independent_evaluator_required: true,
      max_report_age_seconds: 3600,
      dimension_thresholds: [
        { dimension_id: "correctness", maximum_regression: 0 },
        { dimension_id: "completeness", maximum_regression: 0.02 },
        { dimension_id: "verification", maximum_regression: 0 }
      ]
    },
    ...(options.trustPolicyId ? {
      attestation_policy: {
        required: true,
        trust_policy_ref: {
          artifact_id: options.trustPolicyId,
          relative_path: options.trustPolicyPath,
          sha256: options.trustPolicySha256
        },
        minimum_valid_attestations: options.minimumAttestations,
        minimum_independence_groups: options.minimumIndependenceGroups,
        require_distinct_key_ids: true,
        max_attestation_age_seconds: options.maxAttestationAgeSeconds
      }
    } : {}),
    budgets: {
      max_cycles: options.maxCycles,
      max_retries_per_cycle: 2,
      max_changed_files_per_cycle: options.maxChangedFiles,
      max_failed_experiments: 3,
      max_no_progress_cycles: 2,
      min_weighted_improvement: options.minImprovement,
      max_elapsed_minutes: options.maxElapsedMinutes
    },
    checkpoint_policy: {
      required_triggers: ["wave_start", "wave_end", "validation_failure", "quality_regression", "scope_change", "before_completion"],
      before_completion_required: true,
      on_scope_change_required: true,
      on_validation_failure_required: true
    },
    experiment_policy: {
      baseline_required: true,
      isolated_candidate_required: true,
      independent_evaluation_for_control_plane: true,
      rollback_plan_required: true,
      failed_candidate_must_not_be_promoted: true
    },
    stop_conditions: [
      "A protected invariant would change.",
      "A cycle, file, failure, no-progress, or elapsed-time budget is reached.",
      "A destructive or cross-repository action is proposed.",
      "Required evidence or independent evaluation cannot be obtained.",
      "The human user pauses or terminates the campaign."
    ],
    status: "active",
    created_at: createdAt
  };
  const validation = validatePayload(campaign, "self-improvement-campaign");
  if (!validation.valid) {
    const codes = validation.issues
      .filter(item => item.severity === "error" || item.severity === "critical")
      .map(item => item.code);
    throw new Error(`Generated campaign failed validation: ${[...new Set(codes)].join(", ")}`);
  }
  return campaign;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const campaign = buildCampaign(options);
    if (options.writeArtifact) {
      const result = writeRepositoryArtifact({
        repositoryPath: options.repository,
        artifactRoot: options.artifactRoot,
        missionId: campaign.mission_id,
        waveId: "C0",
        kind: "self-improvement-campaigns",
        artifactId: campaign.id,
        payload: campaign,
        createdAt: campaign.created_at
      });
      console.error(`Artifact written: ${result.relative_path}`);
    }
    process.stdout.write(`${JSON.stringify(campaign, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { buildCampaign, parseArgs };
