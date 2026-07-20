#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const READINESS_RANK = { X: 0, U: 1, P: 2, T: 3 };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function analyzeModelForceAssignment(plan) {
  const blocks = [];
  const warnings = [];
  const mission = plan.mission_profile || {};
  const profiles = plan.model_profiles || [];
  const billets = plan.billets || [];
  const routing = plan.routing_policy || {};
  const assurance = plan.assurance || {};
  const pace = plan.pace || {};
  const authority = plan.authority || {};
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));

  for (const profile of profiles) {
    if (/^(latest|current|default)$/i.test(String(profile.model_version || "").trim())) {
      blocks.push(`Pin immutable model version for ${profile.id}.`);
    }
    if (!hasItems(profile.evidence)) {
      blocks.push(`Attach readiness evidence for ${profile.id}.`);
    }
  }

  for (const billet of billets) {
    const profile = profileById.get(billet.model_profile_id);
    if (!profile) {
      blocks.push(`Assign a known model profile to billet ${billet.id}.`);
      continue;
    }
    if (profile.availability === "unavailable") {
      blocks.push(`Replace unavailable profile ${profile.id} in billet ${billet.id}.`);
    }
    if (!(profile.evaluated_tasks || []).includes(billet.task)) {
      blocks.push(`Evaluate ${profile.id} for task ${billet.task} before assignment.`);
    }
    if (!(profile.force_classes || []).includes(billet.force_class)) {
      blocks.push(`Qualify ${profile.id} for force class ${billet.force_class} or reassign billet ${billet.id}.`);
    }
    if ((READINESS_RANK[profile.readiness_rating] ?? -1) < (READINESS_RANK[billet.required_readiness] ?? 99)) {
      blocks.push(`Raise ${profile.id} readiness to ${billet.required_readiness} for billet ${billet.id}.`);
    }
    if (!(profile.allowed_context_classes || []).includes(billet.context_scope)) {
      blocks.push(`Keep ${billet.context_scope} context out of ineligible profile ${profile.id}.`);
    }
    for (const fallbackId of billet.fallback_profile_ids || []) {
      const fallback = profileById.get(fallbackId);
      if (!fallback) {
        blocks.push(`Assign a known fallback profile to billet ${billet.id}.`);
        continue;
      }
      if (fallbackId === billet.model_profile_id) {
        blocks.push(`Replace self-fallback ${fallbackId} in billet ${billet.id}.`);
      }
      if (fallback.availability === "unavailable") {
        blocks.push(`Replace unavailable fallback ${fallbackId} in billet ${billet.id}.`);
      }
      if (!(fallback.evaluated_tasks || []).includes(billet.task) || !(fallback.force_classes || []).includes(billet.force_class)) {
        blocks.push(`Qualify fallback ${fallbackId} for ${billet.force_class}/${billet.task} or replace it.`);
      }
      if ((READINESS_RANK[fallback.readiness_rating] ?? -1) < READINESS_RANK.P) {
        blocks.push(`Raise fallback ${fallbackId} to at least P readiness.`);
      }
      if (!(fallback.allowed_context_classes || []).includes(billet.context_scope)) {
        blocks.push(`Keep ${billet.context_scope} context out of fallback ${fallbackId}.`);
      }
    }
    if (["command", "sof", "assurance"].includes(billet.force_class) && (billet.fallback_profile_ids || []).length < 2) {
      blocks.push(`Assign alternate and contingency profiles to critical billet ${billet.id}.`);
    }
    if (billet.force_class === "line" && profile.capability_band === "C3") {
      warnings.push(`C3 profile ${profile.id} fills line billet ${billet.id}; verify scarce capacity is justified.`);
    }
  }

  const routerProfile = profileById.get(routing.router_profile_id);
  if (!routerProfile || !["T", "P"].includes(routing.router_readiness) || !["T", "P"].includes(routerProfile.readiness_rating)) {
    blocks.push("Assign a T/P-ready router before dispatching agents.");
  }
  if (!hasItems(routing.held_out_evaluation)) {
    blocks.push("Attach held-out router evaluation evidence.");
  }
  const acceptanceEvidence = (routing.acceptance_evidence || []).map(item => String(item).trim());
  if (!hasItems(acceptanceEvidence) || acceptanceEvidence.every(item => /confidence|self[- ]?report/i.test(item))) {
    blocks.push("Replace verbal confidence with independent or deterministic acceptance evidence.");
  }

  const assuranceRequired = ["high", "critical"].includes(mission.risk_level)
    || mission.roe_class === "Red"
    || ["final_output", "external_release"].includes(mission.release_target)
    || mission.tool_impact === "irreversible_mutation";
  const assuranceProfile = profileById.get(assurance.independent_profile_id);
  const primaryProfile = profileById.get(pace.primary_profile_id);
  if (assuranceRequired && assurance.required !== true) {
    blocks.push("Attach independent assurance for this mission profile.");
  }
  if (assurance.required === true) {
    if (!assuranceProfile || !(assuranceProfile.force_classes || []).includes("assurance")) {
      blocks.push("Assign an assurance-qualified independent profile.");
    }
    if (!billets.some(billet => billet.force_class === "assurance" && billet.model_profile_id === assurance.independent_profile_id)) {
      blocks.push("Place the independent assurance profile in the assurance billet.");
    }
    if (assurance.different_model_family_required === true && assuranceProfile && primaryProfile && assuranceProfile.model_family === primaryProfile.model_family) {
      blocks.push("Separate primary execution and assurance model families.");
    }
    if (!hasItems(assurance.deterministic_checks)) {
      blocks.push("Add deterministic assurance checks.");
    }
  }

  const paceIds = [pace.primary_profile_id, pace.alternate_profile_id, pace.contingency_profile_id];
  if (paceIds.some(profileId => !profileById.has(profileId))) {
    blocks.push("Assign known profiles to every PACE level.");
  }
  if (new Set(paceIds).size !== paceIds.length) {
    blocks.push("Use distinct primary, alternate, and contingency profiles.");
  }
  const paceProfiles = paceIds.map(profileId => profileById.get(profileId)).filter(Boolean);
  const pacePrimaryTasks = new Set((paceProfiles[0] && paceProfiles[0].evaluated_tasks) || []);
  if (paceProfiles.some(profile => (READINESS_RANK[profile.readiness_rating] ?? -1) < READINESS_RANK.P
    || !(profile.allowed_context_classes || []).includes(mission.classification))
    || paceProfiles.slice(1).some(profile => !(profile.evaluated_tasks || []).some(task => pacePrimaryTasks.has(task)))) {
    blocks.push("Make every PACE profile P/T ready, context eligible, and evaluated for shared mission coverage.");
  }
  if (pace.preserve_data_boundary !== true) {
    blocks.push("Preserve the mission data boundary through every fallback.");
  }

  if (authority.inherited_from_model !== false) {
    blocks.push("Remove authority inherited from model capability.");
  }
  if (authority.human_final_decision_authority !== true || !hasItems(authority.commander_retained_decisions)) {
    blocks.push("Restore human final decision authority and retained decisions.");
  }
  if (mission.roe_class === "Black") {
    blocks.push("Black actions cannot receive an executable model assignment.");
  }
  if (routing.default_strategy === "sof_composition" && new Set(billets.map(billet => billet.model_profile_id)).size < 3) {
    blocks.push("Replace model monoculture with distinct command, execution, and assurance capacity.");
  }

  const assignmentStatus = blocks.length === 0 ? "ready" : "blocked";
  return {
    schema_version: "0.1",
    type: "ModelForceAssignmentProjection",
    plan_id: plan.id,
    mission_id: plan.mission_id,
    assignment_status: assignmentStatus,
    active_billets: billets.map(billet => {
      const profile = profileById.get(billet.model_profile_id);
      return {
        billet_id: billet.id,
        force_class: billet.force_class,
        role: billet.role,
        task: billet.task,
        model_profile_id: billet.model_profile_id,
        capability_band: profile ? profile.capability_band : null,
        readiness_rating: profile ? profile.readiness_rating : null,
        authority_scope: billet.authority_scope || [],
        tool_scope: billet.tool_scope || []
      };
    }),
    escalation_routes: [
      ...(routing.escalation_triggers || []).map(trigger => ({ type: "routing_trigger", trigger })),
      ...billets.flatMap(billet => (billet.fallback_profile_ids || []).map(profileId => ({
        type: "billet_fallback",
        billet_id: billet.id,
        profile_id: profileId
      })))
    ],
    assurance_status: {
      required: assuranceRequired,
      assigned: assurance.required === true && Boolean(assuranceProfile),
      profile_id: assurance.independent_profile_id,
      different_model_family: Boolean(assuranceProfile && primaryProfile && assuranceProfile.model_family !== primaryProfile.model_family),
      deterministic_checks: assurance.deterministic_checks || []
    },
    pace_status: {
      primary_profile_id: pace.primary_profile_id,
      alternate_profile_id: pace.alternate_profile_id,
      contingency_profile_id: pace.contingency_profile_id,
      profiles_distinct: new Set(paceIds).size === paceIds.length,
      preserve_data_boundary: pace.preserve_data_boundary === true,
      emergency_action: pace.emergency_action
    },
    resource_summary: {
      profile_count: profiles.length,
      billet_count: billets.length,
      capability_bands: profiles.reduce((counts, profile) => {
        counts[profile.capability_band] = (counts[profile.capability_band] || 0) + 1;
        return counts;
      }, {}),
      token_budget: plan.budget && plan.budget.token_budget,
      cost_budget: plan.budget && plan.budget.cost_budget
    },
    preflight_blocks: blocks,
    warnings,
    commander_queue: [
      ...(authority.commander_retained_decisions || []).map(item => ({ type: "commander_retained_decision", item })),
      ...((assurance.human_review_triggers) || []).map(item => ({ type: "human_review_trigger", item })),
      ...((plan.assessment && plan.assessment.aar_triggers) || []).map(item => ({ type: "aar_trigger", item }))
    ]
  };
}

function main() {
  const planPath = process.argv[2];
  if (!planPath) {
    console.error("Usage: node model-force-assignment-runner.js <model-force-assignment-plan.json>");
    process.exit(2);
  }
  const plan = readJson(path.resolve(planPath));
  process.stdout.write(`${JSON.stringify(analyzeModelForceAssignment(plan), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { analyzeModelForceAssignment };
