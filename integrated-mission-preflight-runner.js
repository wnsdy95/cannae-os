#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { analyzeRoutingPreflight } = require("./agent-routing-preflight-runner");
const { compileModelAssignment } = require("./model-assignment-compiler");
const { analyzeModelForceAssignment } = require("./model-force-assignment-runner");
const { parseArtifactWriteFlags, writeRepositoryArtifact } = require("./repository-artifact-store");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadRepoJson(repoRoot, relativePath, label, blocks) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes("..")) {
    blocks.push(`${label} must be a repository-relative path without traversal.`);
    return null;
  }
  const resolved = path.resolve(repoRoot, relativePath);
  if (!resolved.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) {
    blocks.push(`${label} resolves outside the repository.`);
    return null;
  }
  if (!fs.existsSync(resolved)) {
    blocks.push(`${label} does not exist: ${relativePath}.`);
    return null;
  }
  const real = fs.realpathSync(resolved);
  if (!real.startsWith(`${fs.realpathSync(repoRoot)}${path.sep}`)) {
    blocks.push(`${label} resolves through a symlink outside the repository.`);
    return null;
  }
  try {
    return readJson(real);
  } catch (error) {
    blocks.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function analyzeIntegratedMissionPreflight(bundle, repoRoot = __dirname) {
  bundle = bundle && typeof bundle === "object" && !Array.isArray(bundle) ? bundle : {};
  const blocks = [];
  const warnings = [];
  const registry = loadRepoJson(repoRoot, bundle.model_registry_path, "model_registry_path", blocks);
  const request = loadRepoJson(repoRoot, bundle.model_assignment_request_path, "model_assignment_request_path", blocks);
  const routingBundle = loadRepoJson(repoRoot, bundle.routing_bundle_path, "routing_bundle_path", blocks);

  if (!bundle.dispatch_controls) {
    blocks.push("Integrated preflight requires dispatch controls.");
  } else if (bundle.dispatch_controls.human_final_decision_authority !== true) {
    blocks.push("Integrated preflight requires human final decision authority.");
  }
  if (bundle.dispatch_controls && (bundle.dispatch_controls.require_ready_routing !== true || bundle.dispatch_controls.require_ready_model_assignment !== true)) {
    blocks.push("Integrated preflight cannot bypass routing or model-assignment readiness.");
  }

  const routingProjection = routingBundle ? analyzeRoutingPreflight(routingBundle) : null;
  if (routingProjection && routingProjection.status !== "ready") {
    blocks.push(...routingProjection.preflight_blocks.map(item => `routing: ${item}`));
  }

  let compilation = null;
  if (registry && request) {
    try {
      compilation = compileModelAssignment(registry, request);
    } catch (error) {
      blocks.push(`model assignment: compiler rejected malformed input: ${error.message}`);
    }
  }
  if (compilation && compilation.status !== "compiled") {
    blocks.push(...compilation.preflight_blocks.map(item => `model assignment: ${item}`));
  }
  const assignmentProjection = compilation && compilation.plan ? analyzeModelForceAssignment(compilation.plan) : null;
  if (assignmentProjection && assignmentProjection.assignment_status !== "ready") {
    blocks.push(...assignmentProjection.preflight_blocks.map(item => `model assignment: ${item}`));
  }

  if (request) {
    if (request.mission_id !== bundle.mission_id) blocks.push("Model assignment request mission_id does not match integrated preflight.");
    if (request.wave_id !== bundle.wave_id) blocks.push("Model assignment request wave_id does not match integrated preflight.");
    if (request.classification !== bundle.classification) blocks.push("Model assignment request classification does not match integrated preflight.");
  }
  if (routingBundle) {
    if (routingBundle.mission_id !== bundle.mission_id) blocks.push("Routing bundle mission_id does not match integrated preflight.");
    if (routingBundle.wave_id !== bundle.wave_id) blocks.push("Routing bundle wave_id does not match integrated preflight.");
  }
  if (compilation && compilation.plan && compilation.plan.mission_id !== bundle.mission_id) {
    blocks.push("Compiled model assignment mission_id does not match integrated preflight.");
  }

  const bindings = Array.isArray(bundle.agent_bindings) ? bundle.agent_bindings : [];
  const duplicateAgents = bindings.map(item => item.agent_id).filter((item, index, all) => all.indexOf(item) !== index);
  const duplicateBillets = bindings.map(item => item.billet_id).filter((item, index, all) => all.indexOf(item) !== index);
  if (duplicateAgents.length > 0) blocks.push(`Duplicate agent bindings: ${[...new Set(duplicateAgents)].join(", ")}.`);
  if (duplicateBillets.length > 0) blocks.push(`Duplicate billet bindings: ${[...new Set(duplicateBillets)].join(", ")}.`);

  const expectedAgents = routingBundle && Array.isArray(routingBundle.expected_agents) ? routingBundle.expected_agents : [];
  for (const agentId of expectedAgents) {
    if (!bindings.some(item => item.agent_id === agentId)) blocks.push(`Missing model billet binding for expected agent ${agentId}.`);
  }
  for (const binding of bindings) {
    if (!expectedAgents.includes(binding.agent_id)) blocks.push(`${binding.agent_id}: binding is not an expected routed agent.`);
  }

  const plan = compilation && compilation.plan;
  const billetById = new Map(((plan && plan.billets) || []).map(item => [item.id, item]));
  const profileById = new Map(((plan && plan.model_profiles) || []).map(item => [item.id, item]));
  const registryProfileById = new Map(((registry && registry.profiles) || []).map(item => [item.id, item]));
  const receiptById = new Map(((routingBundle && routingBundle.receipts) || []).map(item => [item.id, item]));
  const acceptedReceiptIds = new Set(((routingProjection && routingProjection.accepted_receipts) || []).map(item => item.id));
  const requirementById = new Map(((request && request.billet_requirements) || []).map(item => [item.id, item]));

  for (const requirement of requirementById.values()) {
    if (requirement.dispatch_required && !bindings.some(item => item.billet_id === requirement.id)) {
      blocks.push(`Missing agent binding for dispatch-required billet ${requirement.id}.`);
    }
  }

  const dispatchManifest = [];
  const usageEventTemplates = [];
  for (const binding of bindings) {
    const billet = billetById.get(binding.billet_id);
    const requirement = requirementById.get(binding.billet_id);
    const receipt = receiptById.get(binding.routing_receipt_id);
    if (!billet || !requirement) {
      blocks.push(`${binding.agent_id}: binding references unknown compiled billet ${binding.billet_id}.`);
      continue;
    }
    if (!receipt || receipt.agent_id !== binding.agent_id || receipt.wave_scope !== "agent") {
      blocks.push(`${binding.agent_id}: routing receipt does not belong to the bound agent.`);
      continue;
    }
    if (!acceptedReceiptIds.has(receipt.id)) {
      blocks.push(`${binding.agent_id}: routing receipt was not accepted by routing preflight.`);
      continue;
    }
    const profile = profileById.get(billet.model_profile_id);
    const registryProfile = profile && registryProfileById.get(profile.id);
    if (!profile || !registryProfile) {
      blocks.push(`${binding.agent_id}: compiled model profile is missing from the registry snapshot.`);
      continue;
    }
    if (registryProfile.model_version !== profile.model_version || registryProfile.harness_version !== profile.harness_version) {
      blocks.push(`${binding.agent_id}: compiled model identity drifted from the registry.`);
      continue;
    }

    dispatchManifest.push({
      agent_id: binding.agent_id,
      routing_receipt_id: receipt.id,
      operational_role: billet.role,
      billet_id: billet.id,
      force_class: billet.force_class,
      task: billet.task,
      model_profile_id: profile.id,
      model_family: profile.model_family,
      model_version: profile.model_version,
      harness_version: profile.harness_version,
      system_prompt_version: registryProfile.system_prompt_version,
      tool_schema_version: registryProfile.tool_schema_version,
      registry_id: registry.id,
      registry_version: registry.registry_version,
      assignment_request_id: request.id,
      compiled_plan_id: plan.id,
      endpoint_ref: registryProfile.endpoint_ref,
      authority_scope: billet.authority_scope,
      tool_scope: billet.tool_scope,
      context_scope: billet.context_scope,
      fallback_profile_ids: billet.fallback_profile_ids,
      recommended_documents: receipt.recommended_documents || []
    });
    usageEventTemplates.push({
      schema_version: "0.2",
      type: "ModelUsageEvent",
      id: `MUE-${binding.agent_id.replace(/[^A-Za-z0-9_-]/g, "_")}`,
      mission_id: bundle.mission_id,
      wave_id: bundle.wave_id,
      registry_id: registry.id,
      registry_version: registry.registry_version,
      assignment_request_id: request.id,
      compiled_plan_id: plan.id,
      agent_id: binding.agent_id,
      billet_id: billet.id,
      task: billet.task,
      model_profile_id: profile.id,
      model_family: profile.model_family,
      model_version: profile.model_version,
      harness_version: profile.harness_version,
      system_prompt_version: registryProfile.system_prompt_version,
      tool_schema_version: registryProfile.tool_schema_version,
      event_type: "dispatched",
      authority_scope_snapshot: billet.authority_scope,
      release_target: plan.mission_profile.release_target,
      metrics: { input_tokens: 0, output_tokens: 0, latency_ms: 0, estimated_cost_units: 0, attempt: 1 },
      evidence: [bundle.id, receipt.id],
      failure_codes: [],
      classification: bundle.classification,
      observed_at: bundle.created_at
    });
  }

  const status = blocks.length === 0 ? "ready" : "blocked";
  return {
    schema_version: "0.2",
    type: "IntegratedMissionPreflightProjection",
    bundle_id: bundle.id,
    mission_id: bundle.mission_id,
    wave_id: bundle.wave_id,
    status,
    routing_status: routingProjection ? routingProjection.status : "blocked",
    model_assignment_status: assignmentProjection ? assignmentProjection.assignment_status : "blocked",
    registry_version: registry ? registry.registry_version : null,
    compiled_plan_id: plan ? plan.id : null,
    dispatch_manifest: status === "ready" ? dispatchManifest : [],
    usage_event_templates: status === "ready" && bundle.dispatch_controls.emit_usage_events ? usageEventTemplates : [],
    preflight_blocks: blocks,
    warnings,
    commander_queue: plan ? [
      ...(plan.authority.commander_retained_decisions || []).map(item => ({ type: "commander_retained_decision", item })),
      ...(plan.assurance.human_review_triggers || []).map(item => ({ type: "human_review_trigger", item }))
    ] : []
  };
}

function main() {
  const bundlePath = process.argv[2];
  if (!bundlePath) {
    console.error("Usage: node integrated-mission-preflight-runner.js <integrated-mission-preflight.json> [--write-artifact --repository <repo> [--artifact-root <dir>] [--overwrite-artifact]]");
    process.exit(2);
  }
  let artifactOptions;
  let bundle;
  let result;
  try {
    artifactOptions = parseArtifactWriteFlags(process.argv.slice(3));
    bundle = readJson(path.resolve(bundlePath));
    result = analyzeIntegratedMissionPreflight(bundle, __dirname);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (artifactOptions.writeArtifact) {
    try {
      const artifact = writeRepositoryArtifact({
        repositoryPath: artifactOptions.repositoryPath,
        artifactRoot: artifactOptions.artifactRoot,
        missionId: bundle.mission_id,
        waveId: bundle.wave_id,
        kind: "integrated-mission-preflights",
        artifactId: bundle.id,
        payload: result,
        overwrite: artifactOptions.overwriteArtifact
      });
      console.error(`Artifact written: ${artifact.artifact_path}`);
    } catch (error) {
      result.status = "blocked";
      result.dispatch_manifest = [];
      result.usage_event_templates = [];
      result.preflight_blocks = [...result.preflight_blocks, `Artifact persistence failed: ${error.message}`];
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === "ready" ? 0 : 1);
}

if (require.main === module) main();

module.exports = { analyzeIntegratedMissionPreflight, loadRepoJson };
