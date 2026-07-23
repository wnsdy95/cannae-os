#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyzeRoutingPreflight } = require("./agent-routing-preflight-runner");
const { buildUpdate } = require("./aar-to-readiness-update");
const {
  resolveRepository,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const { buildCampaign } = require("./self-improvement-campaign-init");
const { validatePayload } = require("./validator-cli-prototype/validate");

const NONE_REF = Object.freeze({ artifact_id: "none", relative_path: "none", sha256: "none" });
const CONTROL_EVIDENCE_KINDS = new Set([
  "aar-readiness-updates",
  "aars",
  "agent-context-packs",
  "integrated-mission-preflights",
  "mission-wave-closeouts",
  "mission-wave-plans",
  "mission-wave-reports",
  "routing-preflight-bundles",
  "routing-preflights",
  "routing-receipts",
  "self-improvement-campaigns",
  "sitreps"
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unique(values) {
  return [...new Set(values)];
}

function safeIdPart(value) {
  const normalized = String(value || "unknown").replace(/[^A-Za-z0-9_-]+/g, "_");
  return normalized || "unknown";
}

function artifactRef(result, artifactId) {
  return {
    artifact_id: artifactId,
    relative_path: result.relative_path,
    sha256: result.sha256
  };
}

function entryRef(entry) {
  return {
    artifact_id: entry.artifact_id,
    relative_path: entry.relative_path,
    sha256: entry.sha256
  };
}

function sameRef(left, right) {
  return Boolean(left && right &&
    left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path &&
    left.sha256 === right.sha256);
}

function assertValid(payload, type, label = type) {
  const validation = validatePayload(payload, type);
  if (!validation.valid) {
    const failures = validation.issues
      .filter(item => item.severity === "error" || item.severity === "critical")
      .map(item => `${item.code}@${item.path}`);
    throw new Error(`${label} failed validation: ${unique(failures).join(", ")}`);
  }
  return validation;
}

function publicRepository(repository) {
  return {
    key: repository.key,
    label: repository.label,
    identity_fingerprint: repository.identity_fingerprint,
    head_commit: repository.head_commit
  };
}

function artifactRootPath(options) {
  return path.resolve(options.artifactRoot || path.join(process.cwd(), ".cannae", "artifacts"));
}

function loadStore(options, allowMissing = false) {
  const repository = resolveRepository(options.repository);
  const verification = verifyRepositoryArtifacts({
    repositoryPath: repository.root,
    artifactRoot: artifactRootPath(options)
  });
  if (!verification.valid) {
    const missingOnly = verification.issues.length === 1 &&
      ["ARTIFACT_ROOT_MISSING", "REPOSITORY_NAMESPACE_MISSING"].includes(verification.issues[0].code);
    if (allowMissing && missingOnly) return { repository, verification, manifest: null, artifactRoot: artifactRootPath(options) };
    throw new Error(`Repository artifact verification failed: ${verification.issues.map(item => item.code).join(", ")}`);
  }
  const artifactRoot = fs.realpathSync(artifactRootPath(options));
  const manifestPath = path.join(artifactRoot, "repositories", repository.key, "manifest.json");
  const manifest = readJson(manifestPath);
  return { repository, verification, manifest, artifactRoot };
}

function artifactEntries(options, filters = {}, allowMissingStore = false) {
  const store = loadStore(options, allowMissingStore);
  const entries = store.manifest ? store.manifest.artifacts || [] : [];
  return {
    ...store,
    entries: entries.filter(entry =>
      (!filters.missionId || entry.mission_id === filters.missionId) &&
      (!filters.waveId || entry.wave_id === filters.waveId) &&
      (!filters.kind || entry.kind === filters.kind) &&
      (!filters.artifactId || entry.artifact_id === filters.artifactId))
  };
}

function readEntryPayload(store, entry) {
  const candidate = path.resolve(store.artifactRoot, entry.relative_path);
  if (!candidate.startsWith(`${store.artifactRoot}${path.sep}`)) {
    throw new Error(`Artifact path escapes the artifact root: ${entry.relative_path}`);
  }
  const stat = fs.lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Artifact is not a regular file: ${entry.relative_path}`);
  const bytes = fs.readFileSync(candidate);
  if (sha256(bytes) !== entry.sha256) throw new Error(`Artifact digest mismatch: ${entry.relative_path}`);
  return JSON.parse(bytes.toString("utf8"));
}

function optionalArtifact(options, filters) {
  const store = artifactEntries(options, filters, true);
  if (store.entries.length > 1) throw new Error(`Artifact lookup is ambiguous for ${filters.kind || filters.artifactId}.`);
  if (store.entries.length === 0) return null;
  const entry = store.entries[0];
  return { store, entry, ref: entryRef(entry), payload: readEntryPayload(store, entry) };
}

function requiredWaveArtifact(options, missionId, waveId, kind) {
  const result = artifactEntries(options, { missionId, waveId, kind });
  if (result.entries.length !== 1) {
    throw new Error(`Expected exactly one ${kind} artifact for ${missionId}/${waveId}, found ${result.entries.length}.`);
  }
  const entry = result.entries[0];
  return { store: result, entry, ref: entryRef(entry), payload: readEntryPayload(result, entry) };
}

function requiredArtifactRef(options, ref, expected = {}) {
  const result = artifactEntries(options, {
    missionId: expected.missionId,
    waveId: expected.waveId,
    kind: expected.kind,
    artifactId: ref && ref.artifact_id
  });
  const matches = result.entries.filter(entry => sameRef(entryRef(entry), ref));
  if (matches.length !== 1) {
    throw new Error(`Manifest does not contain exact artifact reference ${ref && ref.artifact_id ? ref.artifact_id : "unknown"}.`);
  }
  const entry = matches[0];
  return {
    store: result,
    entry,
    ref: entryRef(entry),
    payload: expected.loadPayload === false ? null : readEntryPayload(result, entry)
  };
}

function persistJson(options, descriptor) {
  const existing = optionalArtifact(options, {
    missionId: descriptor.missionId,
    waveId: descriptor.waveId,
    kind: descriptor.kind,
    artifactId: descriptor.artifactId
  });
  if (existing) {
    if (existing.entry.sha256 !== sha256(jsonBytes(descriptor.payload))) {
      throw new Error(`Artifact ${descriptor.artifactId} already exists with different content.`);
    }
    return existing.ref;
  }
  const result = writeRepositoryArtifact({
    repositoryPath: options.repository,
    artifactRoot: artifactRootPath(options),
    missionId: descriptor.missionId,
    waveId: descriptor.waveId,
    kind: descriptor.kind,
    artifactId: descriptor.artifactId,
    payload: descriptor.payload,
    createdAt: descriptor.createdAt
  });
  return artifactRef(result, descriptor.artifactId);
}

function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "Git command failed.").trim());
  return result.stdout.trim();
}

function resolveDoctrineRoot(candidate = __dirname) {
  let current = fs.realpathSync(path.resolve(candidate));
  while (true) {
    if (fs.existsSync(path.join(current, "docs", "source-map.md")) &&
        fs.existsSync(path.join(current, "agent-routing-preflight-runner.js")) &&
        fs.existsSync(path.join(current, "codex-skills", "controls-doctrine-operator", "scripts", "route_controls_docs.js"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Could not locate the Cannae OS doctrine runtime.");
    current = parent;
  }
}

function routerPath(doctrineRoot) {
  return path.join(doctrineRoot, "codex-skills", "controls-doctrine-operator", "scripts", "route_controls_docs.js");
}

function invokeRouter(doctrineRoot, routeOptions) {
  const script = routerPath(doctrineRoot);
  const args = [
    script,
    "--receipt",
    `--scope=${routeOptions.scope}`,
    `--mission=${routeOptions.missionId}`,
    `--wave=${routeOptions.waveId}`,
    `--agent=${routeOptions.agentId}`,
    "--actor=ai",
    `--role=${routeOptions.role}`,
    `--department=${routeOptions.department}`,
    `--authority=${routeOptions.authority}`,
    routeOptions.query,
    doctrineRoot
  ];
  const result = spawnSync(process.execPath, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "Document router failed.").trim());
  const receipt = JSON.parse(result.stdout);
  assertValid(receipt, "routing-receipt", `Routing receipt ${routeOptions.agentId}`);
  return receipt;
}

function persistedOrGeneratedReceipt(plan, agent, options, doctrineRoot) {
  const agentId = agent ? agent.agent_id : "chief-of-staff";
  const artifactId = `RR-${safeIdPart(plan.wave_id)}-${safeIdPart(agentId)}`;
  const existing = optionalArtifact(options, {
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    kind: "routing-receipts",
    artifactId
  });
  if (existing) {
    assertValid(existing.payload, "routing-receipt", `Routing receipt ${agentId}`);
    return { receipt: existing.payload, ref: existing.ref };
  }
  const receipt = invokeRouter(doctrineRoot, agent ? {
    scope: "agent",
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    agentId,
    role: "S3",
    department: "operations",
    authority: "scoped-execution",
    query: `${plan.objective}. Agent task: ${agent.task}. Operational role: ${agent.operational_role}. Department: ${agent.department}. Delegated authority: ${agent.delegated_authority}.`
  } : {
    scope: "wave",
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    agentId,
    role: "COS",
    department: "coordination",
    authority: "tasking",
    query: `${plan.objective}. Open wave ${plan.wave_id}; route every expected agent and preserve USER final authority.`
  });
  const ref = persistJson(options, {
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    kind: "routing-receipts",
    artifactId: receipt.id,
    payload: receipt,
    createdAt: receipt.created_at
  });
  return { receipt, ref };
}

function safeDoctrineDocument(doctrineRoot, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes("..")) {
    throw new Error(`Unsafe routed document path: ${relativePath}`);
  }
  const target = path.resolve(doctrineRoot, relativePath);
  const realRoot = fs.realpathSync(doctrineRoot);
  const realTarget = fs.realpathSync(target);
  if (!realTarget.startsWith(`${realRoot}${path.sep}`) || !fs.lstatSync(realTarget).isFile()) {
    throw new Error(`Routed document is outside the doctrine repository: ${relativePath}`);
  }
  return { path: relativePath, sha256: sha256(fs.readFileSync(realTarget)) };
}

function noneModelAssignment() {
  return {
    required: false,
    integrated_preflight_ref: { ...NONE_REF },
    billet_id: "not_required",
    model_profile_id: "not_required",
    model_family: "not_required",
    model_version: "not_required",
    harness_version: "not_required"
  };
}

function modelAssignments(plan, options) {
  if (!plan.model_assignment.required) {
    return new Map(plan.agents.map(agent => [agent.agent_id, noneModelAssignment()]));
  }
  const preflight = requiredArtifactRef(options, plan.model_assignment.integrated_preflight_ref, {
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    kind: "integrated-mission-preflights"
  });
  if (preflight.payload.type !== "IntegratedMissionPreflightProjection" || preflight.payload.status !== "ready" ||
      preflight.payload.mission_id !== plan.mission_id || preflight.payload.wave_id !== plan.wave_id) {
    throw new Error("Model assignment requires a ready integrated mission preflight for the exact mission and wave.");
  }
  const assignments = new Map();
  for (const agent of plan.agents) {
    const matches = (preflight.payload.dispatch_manifest || []).filter(entry =>
      entry.agent_id === agent.agent_id && entry.billet_id === agent.model_billet_id);
    if (matches.length !== 1) {
      throw new Error(`Integrated model preflight does not contain one exact dispatch binding for ${agent.agent_id}.`);
    }
    const entry = matches[0];
    assignments.set(agent.agent_id, {
      required: true,
      integrated_preflight_ref: preflight.ref,
      billet_id: entry.billet_id,
      model_profile_id: entry.model_profile_id,
      model_family: entry.model_family,
      model_version: entry.model_version,
      harness_version: entry.harness_version
    });
  }
  return assignments;
}

function campaignReference(plan, options) {
  if (!plan.adaptive_work.enabled) return { ...NONE_REF };
  const existing = optionalArtifact(options, {
    missionId: plan.mission_id,
    kind: "self-improvement-campaigns",
    artifactId: plan.adaptive_work.campaign_id
  });
  if (existing) {
    assertValid(existing.payload, "self-improvement-campaign", "Bounded improvement campaign");
    if (existing.payload.status !== "active") {
      throw new Error("Existing improvement campaign is not active.");
    }
    if (!(existing.payload.authority_envelope.autonomous_target_types || []).includes(plan.adaptive_work.target_type)) {
      throw new Error("Existing improvement campaign does not authorize the plan target type.");
    }
    return existing.ref;
  }
  const campaign = buildCampaign({
    repository: options.repository,
    mission: plan.mission_id,
    campaign: plan.adaptive_work.campaign_id,
    objective: plan.objective,
    endState: plan.success_conditions.join(" "),
    criteria: unique([...plan.success_conditions, ...plan.adaptive_work.acceptance_criteria]),
    nonGoals: plan.adaptive_work.non_goals,
    maxCycles: plan.adaptive_work.max_cycles,
    maxChangedFiles: plan.adaptive_work.max_changed_files,
    maxElapsedMinutes: plan.adaptive_work.max_elapsed_minutes,
    minImprovement: 0.03,
    minimumAttestations: 2,
    minimumIndependenceGroups: 2,
    maxAttestationAgeSeconds: 900,
    allowedVerifiers: ["node", "git"],
    targetTypes: [plan.adaptive_work.target_type],
    allowCommit: false,
    createdAt: plan.created_at
  });
  return persistJson(options, {
    missionId: plan.mission_id,
    waveId: "C0",
    kind: "self-improvement-campaigns",
    artifactId: campaign.id,
    payload: campaign,
    createdAt: campaign.created_at
  });
}

function summarizeVerification(verification) {
  return {
    valid: verification.valid,
    manifest_revision: verification.manifest_revision,
    manifest_sha256: verification.manifest_sha256,
    artifact_count: verification.artifact_count,
    issue_codes: (verification.issues || []).map(item => item.code)
  };
}

function openWave(plan, options = {}) {
  assertValid(plan, "mission-wave-plan", "Mission wave plan");
  const now = Date.parse(options.now || new Date().toISOString());
  if (Number.isNaN(now) || Date.parse(plan.valid_until) <= now) throw new Error("Mission wave plan is expired.");
  if (Date.parse(plan.created_at) > now + 300000) throw new Error("Mission wave plan creation time is in the future.");
  const doctrineRoot = resolveDoctrineRoot(options.doctrineRoot || __dirname);
  const repository = resolveRepository(options.repository);
  const operationOptions = { ...options, repository: repository.root };
  const planRef = persistJson(operationOptions, {
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    kind: "mission-wave-plans",
    artifactId: plan.id,
    payload: plan,
    createdAt: plan.created_at
  });

  const waveReceipt = persistedOrGeneratedReceipt(plan, null, operationOptions, doctrineRoot);
  const agentReceipts = plan.agents.map(agent => persistedOrGeneratedReceipt(plan, agent, operationOptions, doctrineRoot));
  const routingBundle = {
    schema_version: "0.1",
    type: "AgentRoutingPreflightBundle",
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    expected_agents: plan.agents.map(agent => agent.agent_id),
    receipts: [waveReceipt.receipt, ...agentReceipts.map(item => item.receipt)]
  };
  const routingBundleId = `ARB-${safeIdPart(plan.wave_id)}`;
  const routingBundleRef = persistJson(operationOptions, {
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    kind: "routing-preflight-bundles",
    artifactId: routingBundleId,
    payload: routingBundle,
    createdAt: plan.created_at
  });
  const preflight = analyzeRoutingPreflight(routingBundle);
  const preflightId = `ARP-${safeIdPart(plan.wave_id)}`;
  const preflightRef = persistJson(operationOptions, {
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    kind: "routing-preflights",
    artifactId: preflightId,
    payload: preflight,
    createdAt: plan.created_at
  });
  if (preflight.status !== "ready") {
    const verification = verifyRepositoryArtifacts({ repositoryPath: repository.root, artifactRoot: artifactRootPath(operationOptions) });
    return {
      schema_version: "0.1",
      type: "MissionWaveOpenResult",
      mission_id: plan.mission_id,
      wave_id: plan.wave_id,
      status: "blocked",
      context_dispatch_authorized: false,
      tool_execution_authorized: false,
      dispatch_authorized: false,
      release_authorized: false,
      plan_ref: planRef,
      routing_bundle_ref: routingBundleRef,
      routing_preflight_ref: preflightRef,
      campaign_ref: { ...NONE_REF },
      context_packs: [],
      preflight_blocks: preflight.preflight_blocks,
      repository: publicRepository(repository),
      artifact_store: summarizeVerification(verification)
    };
  }

  const assignments = modelAssignments(plan, operationOptions);
  const campaignRef = campaignReference(plan, operationOptions);
  const doctrineState = {
    revision: runGit(doctrineRoot, ["rev-parse", "HEAD"]),
    router_sha256: sha256(fs.readFileSync(routerPath(doctrineRoot))),
    controller_sha256: sha256(fs.readFileSync(__filename))
  };
  const contextPacks = [];
  for (const [index, agent] of plan.agents.entries()) {
    const routed = agentReceipts[index];
    const contextPack = {
      schema_version: "0.1",
      type: "AgentContextPack",
      id: `ACP-${safeIdPart(plan.wave_id)}-${safeIdPart(agent.agent_id)}`,
      mission_id: plan.mission_id,
      wave_id: plan.wave_id,
      agent_id: agent.agent_id,
      operational_role: agent.operational_role,
      department: agent.department,
      task: agent.task,
      classification: agent.context_scope,
      plan_ref: planRef,
      routing_receipt_ref: routed.ref,
      routing_preflight_ref: preflightRef,
      doctrine_state: doctrineState,
      documents: unique(routed.receipt.recommended_documents.map(document => document.path))
        .map(relativePath => safeDoctrineDocument(doctrineRoot, relativePath)),
      validation_commands: unique(routed.receipt.validation_commands || []),
      model_assignment: assignments.get(agent.agent_id),
      authority: {
        delegated_authority: agent.delegated_authority,
        allowed_actions: agent.allowed_actions,
        approval_required: agent.approval_required,
        prohibited_actions: agent.prohibited_actions,
        human_final_decision_authority: "USER",
        release_authorized: false,
        self_approval_prohibited: true
      },
      escalation_conditions: unique([
        ...(routed.receipt.escalation_required_when || []),
        ...agent.approval_required.map(action => `Approval required before: ${action}`)
      ]),
      status: "ready",
      created_at: plan.created_at,
      valid_until: plan.valid_until
    };
    assertValid(contextPack, "agent-context-pack", `Context pack ${agent.agent_id}`);
    const ref = persistJson(operationOptions, {
      missionId: plan.mission_id,
      waveId: plan.wave_id,
      kind: "agent-context-packs",
      artifactId: contextPack.id,
      payload: contextPack,
      createdAt: contextPack.created_at
    });
    contextPacks.push({ agent_id: agent.agent_id, context_pack_ref: ref });
  }

  const verification = verifyRepositoryArtifacts({ repositoryPath: repository.root, artifactRoot: artifactRootPath(operationOptions) });
  if (!verification.valid) throw new Error(`Post-open artifact verification failed: ${verification.issues.map(item => item.code).join(", ")}`);
  return {
    schema_version: "0.1",
    type: "MissionWaveOpenResult",
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    status: "ready",
    context_dispatch_authorized: true,
    tool_execution_authorized: false,
    dispatch_authorized: false,
    release_authorized: false,
    dispatch_control: plan.dispatch_control
      ? {
          required: true,
          status: "policy_authorization_required",
          enforcement_level: plan.dispatch_control.enforcement_level,
          gateway_exclusive: plan.dispatch_control.gateway_exclusive
        }
      : {
          required: false,
          status: "not_configured",
          enforcement_level: "advisory",
          gateway_exclusive: false
        },
    plan_ref: planRef,
    routing_bundle_ref: routingBundleRef,
    routing_preflight_ref: preflightRef,
    campaign_ref: campaignRef,
    context_packs: contextPacks,
    preflight_blocks: [],
    repository: publicRepository(repository),
    artifact_store: summarizeVerification(verification)
  };
}

function validateReportBindings(report, planArtifact, preflightArtifact, contextArtifacts, options) {
  if (!sameRef(report.plan_ref, planArtifact.ref)) throw new Error("Wave report does not cite the exact mission wave plan.");
  if (!sameRef(report.routing_preflight_ref, preflightArtifact.ref)) throw new Error("Wave report does not cite the exact routing preflight.");
  if (preflightArtifact.payload.status !== "ready") throw new Error("Wave report cannot be accepted for a blocked routing preflight.");
  const expectedAgents = planArtifact.payload.agents.map(agent => agent.agent_id);
  const reportedAgents = report.agent_results.map(result => result.agent_id);
  if (expectedAgents.length !== reportedAgents.length || expectedAgents.some(agentId => !reportedAgents.includes(agentId))) {
    throw new Error("Wave report agent set does not exactly match the opened wave.");
  }
  const contextByAgent = new Map(contextArtifacts.map(item => [item.payload.agent_id, item]));
  for (const result of report.agent_results) {
    const context = contextByAgent.get(result.agent_id);
    if (!context || !sameRef(result.context_pack_ref, context.ref)) {
      throw new Error(`Wave report does not cite the exact context pack for ${result.agent_id}.`);
    }
    for (const evidenceRef of result.evidence_refs) {
      const evidence = requiredArtifactRef(options, evidenceRef, {
        missionId: report.mission_id,
        waveId: report.wave_id,
        loadPayload: false
      });
      if (CONTROL_EVIDENCE_KINDS.has(evidence.entry.kind)) {
        throw new Error(`${result.agent_id} cites control metadata as execution evidence: ${evidence.entry.kind}.`);
      }
      const evidenceTime = Date.parse(evidence.entry.created_at);
      if (Number.isNaN(evidenceTime) || evidenceTime < Date.parse(planArtifact.payload.created_at) ||
          evidenceTime > Date.parse(report.recorded_at) + 300000) {
        throw new Error(`${result.agent_id} cites evidence outside the mission wave evidence window.`);
      }
    }
  }
}

function validateDispatchCompletion(report, plan, options) {
  if (!plan.dispatch_control || plan.dispatch_control.required !== true) {
    return {
      required: false,
      status: "not_configured",
      release_authorized: false
    };
  }
  const { dispatchStatus } = require("./dispatch-runtime-controller");
  const projection = dispatchStatus(options, {
    missionId: report.mission_id,
    waveId: report.wave_id
  });
  for (const result of report.agent_results) {
    const leases = projection.leases.filter(item => item.agent_id === result.agent_id);
    if (leases.length === 0) {
      throw new Error(`Dispatch-controlled agent ${result.agent_id} has no lease lineage.`);
    }
    if (leases.some(item => item.pending_tool_requests > 0)) {
      throw new Error(`Dispatch-controlled agent ${result.agent_id} has an unresolved tool request.`);
    }
    const lineageHeads = leases.filter(item => item.status !== "superseded");
    if (lineageHeads.length !== 1) {
      throw new Error(`Dispatch-controlled agent ${result.agent_id} does not have one unambiguous lease head.`);
    }
    const head = lineageHeads[0];
    if (result.status === "complete" && head.status !== "completed") {
      throw new Error(`Completed agent ${result.agent_id} must close its dispatch lease as completed.`);
    }
    if (result.status !== "complete" && head.status === "active") {
      throw new Error(`Blocked or failed agent ${result.agent_id} must interrupt, revoke, or block its active lease before reporting.`);
    }
  }
  return {
    required: true,
    status: "settled",
    enforcement_level: plan.dispatch_control.enforcement_level,
    gateway_exclusive: plan.dispatch_control.gateway_exclusive,
    leases: projection.leases,
    release_authorized: false
  };
}

function recordWave(report, options = {}) {
  assertValid(report, "mission-wave-report", "Mission wave report");
  const repository = resolveRepository(options.repository);
  const operationOptions = { ...options, repository: repository.root };
  const planArtifact = requiredWaveArtifact(operationOptions, report.mission_id, report.wave_id, "mission-wave-plans");
  const preflightArtifact = requiredWaveArtifact(operationOptions, report.mission_id, report.wave_id, "routing-preflights");
  const contexts = artifactEntries(operationOptions, {
    missionId: report.mission_id,
    waveId: report.wave_id,
    kind: "agent-context-packs"
  });
  const contextArtifacts = contexts.entries.map(entry => ({ entry, ref: entryRef(entry), payload: readEntryPayload(contexts, entry) }));
  validateReportBindings(report, planArtifact, preflightArtifact, contextArtifacts, operationOptions);
  const dispatchControl = validateDispatchCompletion(report, planArtifact.payload, operationOptions);
  const recordedAt = Date.parse(report.recorded_at);
  const now = Date.parse(options.now || new Date().toISOString());
  if (Number.isNaN(now)) throw new Error("Wave report evaluation timestamp is invalid.");
  if (now >= Date.parse(planArtifact.payload.valid_until)) throw new Error("Mission wave plan is expired for reporting.");
  if (recordedAt < Date.parse(planArtifact.payload.created_at) || recordedAt > Date.parse(planArtifact.payload.valid_until)) {
    throw new Error("Wave report timestamp is outside the plan validity window.");
  }
  if (recordedAt > now + 300000) throw new Error("Wave report timestamp is in the future.");
  const reportRef = persistJson(operationOptions, {
    missionId: report.mission_id,
    waveId: report.wave_id,
    kind: "mission-wave-reports",
    artifactId: report.id,
    payload: report,
    createdAt: report.recorded_at
  });
  const completed = report.agent_results.filter(result => result.status === "complete").map(result => `${result.agent_id}: ${result.summary}`);
  const blocked = report.agent_results.filter(result => result.status !== "complete")
    .flatMap(result => result.blockers.map(blocker => `${result.agent_id}: ${blocker}`));
  const nextActions = unique(report.agent_results.flatMap(result => result.next_actions));
  const sitrep = {
    id: `SITREP-${safeIdPart(report.wave_id)}`,
    mission_id: report.mission_id,
    timestamp: report.recorded_at,
    status: report.wave_status,
    completed,
    in_progress: report.wave_status === "complete" ? [] : nextActions,
    blocked,
    ccir: blocked.map(item => ({ type: "FFIR", item, action: "Route the blocker or decision requirement to the human final authority." })),
    risk: blocked,
    next_action: nextActions.length > 0 ? nextActions : ["Conduct the AAR and close the wave."]
  };
  assertValid(sitrep, "sitrep", "Generated wave SITREP");
  const sitrepRef = persistJson(operationOptions, {
    missionId: report.mission_id,
    waveId: report.wave_id,
    kind: "sitreps",
    artifactId: sitrep.id,
    payload: sitrep,
    createdAt: report.recorded_at
  });
  const verification = verifyRepositoryArtifacts({ repositoryPath: repository.root, artifactRoot: artifactRootPath(operationOptions) });
  if (!verification.valid) throw new Error(`Post-report artifact verification failed: ${verification.issues.map(item => item.code).join(", ")}`);
  return {
    schema_version: "0.1",
    type: "MissionWaveRecordResult",
    mission_id: report.mission_id,
    wave_id: report.wave_id,
    status: report.wave_status,
    continuation_authorized: report.wave_status === "complete",
    release_authorized: false,
    dispatch_control: dispatchControl,
    report_ref: reportRef,
    sitrep_ref: sitrepRef,
    repository: publicRepository(repository),
    artifact_store: summarizeVerification(verification)
  };
}

function improvementActions(aar, report, readiness, campaignRef) {
  const actions = [
    ...(readiness.maintenance_actions || []),
    ...report.agent_results.flatMap(result => (result.improvement_candidates || []).map(description => ({
      owner: "COS",
      action_type: "work_product_improvement",
      description
    })))
  ];
  const deduplicated = new Map();
  for (const action of actions) deduplicated.set(`${action.owner}|${action.action_type}|${action.description}`, action);
  return [...deduplicated.values()].map(action => {
    const retained = readiness.commander_decision_required || /\b(?:approval|release|policy|authority|risk acceptance|merge|push)\b/i.test(action.description);
    return {
      owner: action.owner,
      action_type: action.action_type,
      description: action.description,
      disposition: retained
        ? "requires_human_decision"
        : campaignRef.artifact_id !== "none"
          ? "queued_in_bounded_campaign"
          : "record_only"
    };
  });
}

function existingCloseResult(aar, planArtifact, reportArtifact, closeoutArtifact, options, repository) {
  const closeout = closeoutArtifact.payload;
  assertValid(closeout, "mission-wave-closeout", "Existing mission wave closeout");
  if (closeout.mission_id !== options.missionId || closeout.wave_id !== options.waveId ||
      !sameRef(closeout.plan_ref, planArtifact.ref) || !sameRef(closeout.report_ref, reportArtifact.ref)) {
    throw new Error("Existing closeout is not bound to the requested mission wave state.");
  }
  const aarArtifact = requiredArtifactRef(options, closeout.aar_ref, {
    missionId: options.missionId,
    waveId: options.waveId,
    kind: "aars"
  });
  if (aarArtifact.entry.sha256 !== sha256(jsonBytes(aar))) {
    throw new Error("Mission wave is already closed with a different AAR.");
  }
  requiredArtifactRef(options, closeout.readiness_update_ref, {
    missionId: options.missionId,
    waveId: options.waveId,
    kind: "aar-readiness-updates"
  });
  if (closeout.campaign_ref.artifact_id !== "none") {
    requiredArtifactRef(options, closeout.campaign_ref, {
      missionId: options.missionId,
      kind: "self-improvement-campaigns"
    });
  }
  const verification = verifyRepositoryArtifacts({
    repositoryPath: repository.root,
    artifactRoot: artifactRootPath(options)
  });
  if (!verification.valid) throw new Error(`Existing closeout verification failed: ${verification.issues.map(item => item.code).join(", ")}`);
  return {
    schema_version: "0.1",
    type: "MissionWaveCloseResult",
    mission_id: options.missionId,
    wave_id: options.waveId,
    status: closeout.status,
    continuation_authorized: closeout.status === "complete" && !closeout.next_wave.required,
    release_authorized: false,
    closeout_ref: closeoutArtifact.ref,
    next_wave: closeout.next_wave,
    improvement_actions: closeout.improvement_actions,
    repository: publicRepository(repository),
    artifact_store: summarizeVerification(verification)
  };
}

function closeWave(aar, options = {}) {
  assertValid(aar, "aar", "Wave AAR");
  if (!options.missionId || !options.waveId) throw new Error("close requires missionId and waveId.");
  if (aar.mission_id !== options.missionId) throw new Error("AAR mission_id does not match the requested closeout mission.");
  const repository = resolveRepository(options.repository);
  const operationOptions = { ...options, repository: repository.root };
  const planArtifact = requiredWaveArtifact(operationOptions, options.missionId, options.waveId, "mission-wave-plans");
  const reportArtifact = requiredWaveArtifact(operationOptions, options.missionId, options.waveId, "mission-wave-reports");
  const closeoutId = `MWC-${safeIdPart(options.waveId)}`;
  const priorCloseout = optionalArtifact(operationOptions, {
    missionId: options.missionId,
    waveId: options.waveId,
    kind: "mission-wave-closeouts",
    artifactId: closeoutId
  });
  if (priorCloseout) {
    return existingCloseResult(aar, planArtifact, reportArtifact, priorCloseout, operationOptions, repository);
  }
  const closedAt = options.now || new Date().toISOString();
  const closedAtMillis = Date.parse(closedAt);
  if (Number.isNaN(closedAtMillis)) throw new Error("Closeout timestamp is invalid.");
  if (closedAtMillis < Date.parse(reportArtifact.payload.recorded_at) ||
      closedAtMillis > Date.parse(planArtifact.payload.valid_until)) {
    throw new Error("Closeout timestamp must follow the report and remain inside the plan validity window.");
  }
  const aarRef = persistJson(operationOptions, {
    missionId: options.missionId,
    waveId: options.waveId,
    kind: "aars",
    artifactId: aar.id,
    payload: aar,
    createdAt: closedAt
  });
  const readiness = buildUpdate(aar, { generatedAt: closedAt });
  assertValid(readiness, "aar-readiness-update", "Generated AAR readiness update");
  const readinessRef = persistJson(operationOptions, {
    missionId: options.missionId,
    waveId: options.waveId,
    kind: "aar-readiness-updates",
    artifactId: readiness.id,
    payload: readiness,
    createdAt: closedAt
  });
  const campaign = planArtifact.payload.adaptive_work.enabled
    ? optionalArtifact(operationOptions, {
      missionId: options.missionId,
      kind: "self-improvement-campaigns",
      artifactId: planArtifact.payload.adaptive_work.campaign_id
    })
    : null;
  if (planArtifact.payload.adaptive_work.enabled && !campaign) {
    throw new Error("Adaptive wave closeout cannot find its bounded improvement campaign.");
  }
  if (campaign && campaign.payload.status !== "active") {
    throw new Error("Adaptive wave closeout requires an active bounded improvement campaign.");
  }
  const campaignRef = campaign ? campaign.ref : { ...NONE_REF };
  const actions = improvementActions(aar, reportArtifact.payload, readiness, campaignRef);
  const humanDecision = readiness.commander_decision_required || reportArtifact.payload.human_decisions_required.length > 0 ||
    actions.some(action => action.disposition === "requires_human_decision");
  const status = reportArtifact.payload.wave_status !== "complete"
    ? "blocked_pending_execution"
    : humanDecision
      ? "blocked_pending_human_decision"
      : "complete";
  const nextWaveRequired = status !== "complete" || actions.some(action => action.disposition !== "record_only");
  const trigger = status === "blocked_pending_human_decision"
    ? "human_decision"
    : status === "blocked_pending_execution"
      ? "blocked_work"
      : nextWaveRequired
        ? "improvement_candidate"
        : "none";
  const preCloseVerification = verifyRepositoryArtifacts({ repositoryPath: repository.root, artifactRoot: artifactRootPath(operationOptions) });
  if (!preCloseVerification.valid) {
    throw new Error(`Pre-close artifact verification failed: ${preCloseVerification.issues.map(item => item.code).join(", ")}`);
  }
  const closeout = {
    schema_version: "0.1",
    type: "MissionWaveCloseout",
    id: closeoutId,
    mission_id: options.missionId,
    wave_id: options.waveId,
    status,
    plan_ref: planArtifact.ref,
    report_ref: reportArtifact.ref,
    aar_ref: aarRef,
    readiness_update_ref: readinessRef,
    campaign_ref: campaignRef,
    improvement_actions: actions,
    next_wave: {
      required: nextWaveRequired,
      reason: nextWaveRequired
        ? status === "complete"
          ? "AAR or agent findings produced bounded improvement work."
          : "The current wave cannot close without resolving its blocking condition."
        : "No unresolved execution, decision, or improvement work remains.",
      trigger
    },
    authority: {
      human_final_decision_authority: "USER",
      release_authorized: false,
      self_approval_prohibited: true
    },
    artifact_store: {
      verified: true,
      manifest_revision: preCloseVerification.manifest_revision,
      manifest_sha256: preCloseVerification.manifest_sha256
    },
    closed_at: closedAt
  };
  assertValid(closeout, "mission-wave-closeout", "Mission wave closeout");
  const closeoutRef = persistJson(operationOptions, {
    missionId: options.missionId,
    waveId: options.waveId,
    kind: "mission-wave-closeouts",
    artifactId: closeout.id,
    payload: closeout,
    createdAt: closedAt
  });
  const verification = verifyRepositoryArtifacts({ repositoryPath: repository.root, artifactRoot: artifactRootPath(operationOptions) });
  if (!verification.valid) throw new Error(`Post-close artifact verification failed: ${verification.issues.map(item => item.code).join(", ")}`);
  return {
    schema_version: "0.1",
    type: "MissionWaveCloseResult",
    mission_id: options.missionId,
    wave_id: options.waveId,
    status,
    continuation_authorized: status === "complete" && !nextWaveRequired,
    release_authorized: false,
    closeout_ref: closeoutRef,
    next_wave: closeout.next_wave,
    improvement_actions: actions,
    repository: publicRepository(repository),
    artifact_store: summarizeVerification(verification)
  };
}

function missionStatus(options = {}) {
  if (!options.missionId) throw new Error("status requires missionId.");
  const store = artifactEntries(options, { missionId: options.missionId });
  const byWave = new Map();
  for (const entry of store.entries) {
    if (!byWave.has(entry.wave_id)) byWave.set(entry.wave_id, []);
    byWave.get(entry.wave_id).push({ kind: entry.kind, ref: entryRef(entry), created_at: entry.created_at });
  }
  const { dispatchStatus } = require("./dispatch-runtime-controller");
  const dispatch = dispatchStatus(options, { missionId: options.missionId });
  return {
    schema_version: "0.1",
    type: "MissionOperationStatus",
    mission_id: options.missionId,
    repository: publicRepository(store.repository),
    release_authorized: false,
    dispatch,
    artifact_store: summarizeVerification(store.verification),
    waves: [...byWave.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([wave_id, artifacts]) => ({
      wave_id,
      artifacts: artifacts.sort((left, right) => left.kind.localeCompare(right.kind))
    }))
  };
}

function parseArgs(argv) {
  const options = {};
  const positional = [];
  const values = new Set(["repository", "artifact-root", "doctrine-root", "mission", "wave", "at"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg.startsWith("--") && values.has(arg.slice(2))) {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      options[key] = argv[index];
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    positional.push(arg);
  }
  return { options, positional };
}

function usage() {
  return [
    "Usage:",
    "  node skill-mission-controller.js open <mission-wave-plan.json> --repository <repo> [--artifact-root <dir>] [--doctrine-root <dir>] [--at <timestamp>]",
    "  node skill-mission-controller.js report <mission-wave-report.json> --repository <repo> [--artifact-root <dir>] [--at <timestamp>]",
    "  node skill-mission-controller.js close <aar.json> --repository <repo> --mission <id> --wave <id> [--artifact-root <dir>] [--at <timestamp>]",
    "  node skill-mission-controller.js status --repository <repo> --mission <id> [--artifact-root <dir>]",
    "  node skill-mission-controller.js verify --repository <repo> [--artifact-root <dir>]"
  ].join("\n");
}

function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help || parsed.positional.length === 0) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const [command, inputPath] = parsed.positional;
    const options = {
      repository: parsed.options.repository,
      artifactRoot: parsed.options.artifactRoot,
      doctrineRoot: parsed.options.doctrineRoot,
      missionId: parsed.options.mission,
      waveId: parsed.options.wave,
      now: parsed.options.at
    };
    if (!options.repository) throw new Error("--repository <repo> is required.");
    let output;
    if (command === "open") {
      if (!inputPath) throw new Error("open requires a mission wave plan JSON file.");
      output = openWave(readJson(path.resolve(inputPath)), options);
    } else if (command === "report") {
      if (!inputPath) throw new Error("report requires a mission wave report JSON file.");
      output = recordWave(readJson(path.resolve(inputPath)), options);
    } else if (command === "close") {
      if (!inputPath) throw new Error("close requires an AAR JSON file.");
      output = closeWave(readJson(path.resolve(inputPath)), options);
    } else if (command === "status") {
      output = missionStatus(options);
    } else if (command === "verify") {
      output = summarizeVerification(verifyRepositoryArtifacts({
        repositoryPath: options.repository,
        artifactRoot: artifactRootPath(options)
      }));
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (["blocked", "failed", "blocked_pending_execution", "blocked_pending_human_decision"].includes(output.status)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  NONE_REF,
  artifactRootPath,
  closeWave,
  missionStatus,
  openWave,
  recordWave,
  resolveDoctrineRoot,
  sameRef
};
