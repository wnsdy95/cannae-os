#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  resolveRepository,
  manifestDigest,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const {
  acquireRepositoryLease,
  assertRepositoryLease,
  releaseRepositoryLease,
  renewRepositoryLease
} = require("./repository-lease");
const { computeRepositoryState } = require("./verification-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { withinOrderReplay } = require("./order-replay-context");
const issuance = require("./dispatch-issuance-contract");

const NONE_REF = Object.freeze({
  artifact_id: "none",
  relative_path: "none",
  sha256: "none"
});

const PROVIDERS = new Set(["codex", "claude_code"]);
const RESUME_SOURCES = new Set(["resume", "clear", "fork"]);
const TERMINAL_LEASE_STATUSES = new Set(["revoked", "superseded", "completed"]);
const LOCALLY_ADMISSIBLE_OPERATION_CLASSES = new Set([
  "observe",
  "repository_read",
  "repository_write",
  "process_execute"
]);
const PROTECTED_PATHS = [
  ".git",
  ".cannae",
  ".codex",
  ".mcp.json",
  ".claude/settings.json",
  ".claude/settings.local.json"
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(stableValue(value))}\n`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function inputDigest(toolInput) {
  return sha256(canonicalBytes(toolInput === undefined ? null : toolInput));
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`);
  return parsed;
}

function nowIso(options = {}) {
  return options.now || new Date().toISOString();
}

function unique(values) {
  return [...new Set(values)];
}

function sameRef(left, right) {
  return Boolean(left && right &&
    left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path &&
    left.sha256 === right.sha256);
}

function isNoneRef(ref) {
  return sameRef(ref, NONE_REF);
}

function artifactRef(result, artifactId) {
  return {
    artifact_id: artifactId,
    relative_path: result.relative_path,
    sha256: result.sha256
  };
}

function assertProvider(provider) {
  if (!PROVIDERS.has(provider)) throw new Error(`Unsupported dispatch provider: ${provider}`);
}

function assertIdentifier(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(value || ""))) {
    throw new Error(`${label} must be a path-safe identifier.`);
  }
  return String(value);
}

function assertValid(payload, type, label) {
  const validation = validatePayload(payload, type);
  const failures = validation.issues.filter(item => item.severity === "error" || item.severity === "critical");
  if (failures.length > 0) {
    throw new Error(`${label} failed validation: ${unique(failures.map(item => item.code)).join(", ")}`);
  }
  return validation;
}

function gitStatusDirty(repositoryRoot) {
  const result = spawnSync("git", ["-C", repositoryRoot, "status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    encoding: null,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(Buffer.from(result.stderr || result.stdout || "Git status failed.").toString("utf8").trim());
  }
  return Buffer.from(result.stdout || Buffer.alloc(0)).length > 0;
}

function runtimeRepositoryState(repositoryPath) {
  const repository = resolveRepository(repositoryPath);
  return {
    ...computeRepositoryState(repository.root),
    dirty: gitStatusDirty(repository.root)
  };
}

function sameRepositoryState(left, right) {
  return Boolean(left && right &&
    left.head_commit === right.head_commit &&
    left.worktree_fingerprint === right.worktree_fingerprint &&
    left.dirty === right.dirty);
}

function storeView(options) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(options.artifactRoot || path.join(repository.root, ".cannae", "artifacts"));
  const store = require("./campaign-supervisor").loadVerifiedStore(repository.root, artifactRoot);
  const namespacePath = path.join(artifactRoot, "repositories", repository.key);
  return {
    ...store,
    namespacePath,
    repository
  };
}

function safeArtifactPath(view, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]+/).includes("..")) {
    throw new Error("Artifact reference path is unsafe.");
  }
  const candidate = path.resolve(view.artifactRoot, relativePath);
  if (candidate !== view.artifactRoot && !candidate.startsWith(`${view.artifactRoot}${path.sep}`)) {
    throw new Error("Artifact reference resolves outside the artifact root.");
  }
  return candidate;
}

function loadEntry(view, entry) {
  const artifactPath = safeArtifactPath(view, entry.relative_path);
  const bytes = fs.readFileSync(artifactPath);
  if (sha256(bytes) !== entry.sha256) throw new Error(`Artifact bytes changed: ${entry.relative_path}`);
  return JSON.parse(bytes.toString("utf8"));
}

function loadArtifactRef(view, ref, expectedType) {
  if (!ref || isNoneRef(ref)) throw new Error("A concrete artifact reference is required.");
  const entry = (view.manifest.artifacts || []).find(item =>
    item.artifact_id === ref.artifact_id &&
    item.relative_path === ref.relative_path &&
    item.sha256 === ref.sha256);
  if (!entry) throw new Error(`Artifact reference is not retained by the verified manifest: ${ref.artifact_id}`);
  const payload = loadEntry(view, entry);
  if (expectedType) assertValid(payload, expectedType, expectedType);
  return { entry, payload, ref: clone(ref) };
}

function listArtifacts(view, filters = {}) {
  return (view.manifest.artifacts || [])
    .filter(entry => !filters.missionId || entry.mission_id === filters.missionId)
    .filter(entry => !filters.waveId || entry.wave_id === filters.waveId)
    .filter(entry => !filters.kind || entry.kind === filters.kind)
    .map(entry => ({
      entry,
      payload: loadEntry(view, entry),
      ref: {
        artifact_id: entry.artifact_id,
        relative_path: entry.relative_path,
        sha256: entry.sha256
      }
    }));
}

function writeJsonArtifact(options, descriptor) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(options.artifactRoot || path.join(repository.root, ".cannae", "artifacts"));
  const result = writeRepositoryArtifact({
    repositoryPath: repository.root,
    artifactRoot,
    missionId: descriptor.missionId,
    waveId: descriptor.waveId,
    kind: descriptor.kind,
    artifactId: descriptor.artifactId,
    payload: descriptor.payload,
    createdAt: descriptor.createdAt,
    publicationGuard: descriptor.publicationGuard
  });
  return artifactRef(result, descriptor.artifactId);
}

function contextBundle(options, policy, settings = {}) {
  return withinOrderReplay(() => contextBundleInReplay(options, policy, settings));
}
function contextBundleInReplay(options, policy, settings) {
  const view = storeView(options);
  assertReconciledFailuresRevoked(view);
  require("./skill-mission-controller").assertWaveNotTerminated({ ...options, artifactRoot: view.artifactRoot }, policy.mission_id, policy.wave_id);
  const contexts = listArtifacts(view, {
    missionId: policy.mission_id,
    waveId: policy.wave_id,
    kind: "agent-context-packs"
  }).filter(item => item.payload.agent_id === policy.agent_id);
  if (contexts.length !== 1) {
    throw new Error(`Expected exactly one context pack for ${policy.agent_id}; found ${contexts.length}.`);
  }
  const context = contexts[0];
  assertValid(context.payload, "agent-context-pack", "Agent context pack");
  if (context.payload.status !== "ready") throw new Error("Agent context pack is not ready.");
  if (context.payload.mission_id !== policy.mission_id ||
      context.payload.wave_id !== policy.wave_id ||
      context.payload.agent_id !== policy.agent_id) {
    throw new Error("Dispatch policy does not match the context-pack identity.");
  }
  const plan = loadArtifactRef(view, context.payload.plan_ref, "mission-wave-plan");
  require("./skill-mission-controller").assertAdaptiveCampaignMayContinue(plan.payload, { ...options, artifactRoot: view.artifactRoot });
  require("./order-adoption-controller").assertContextAssignment(context.payload, plan.payload, { ...options, artifactRoot: view.artifactRoot });
  const intent = require("./intent-continuity-contract").assertIntentContext(context.payload, plan.payload);
  require("./intent-continuity-contract").assertIntentPolicy(policy, intent);
  require("./method-deviation-contract").assertMethodPolicy(plan.payload, policy);
  require("./method-deviation-gate").assertNoMethodDrift(options, policy.mission_id, view);
  require("./order-revision-controller").assertRevisionDispatch(plan.payload, { ...options, artifactRoot: view.artifactRoot }, view);
  const preflight = loadArtifactRef(view, context.payload.routing_preflight_ref);
  if (preflight.payload.type !== "AgentRoutingPreflightProjection" || preflight.payload.status !== "ready") {
    throw new Error("Routing preflight is not ready.");
  }
  const agent = (plan.payload.agents || []).find(item => item.agent_id === policy.agent_id);
  if (!agent) throw new Error("Mission wave plan does not contain the dispatch-policy agent.");
  if (context.payload.authority.human_final_decision_authority !== "USER" ||
      context.payload.authority.release_authorized !== false ||
      context.payload.authority.self_approval_prohibited !== true) {
    throw new Error("Context-pack authority does not preserve retained USER control.");
  }
  const bundle = { context, plan, preflight, view, agent };
  if (settings.requireAuthorization !== false) {
    assertPolicyAuthorization(policy, bundle);
  }
  return bundle;
}

function assertPolicyAuthorization(policy, bundle) {
  const authorization = policy.authorization || {};
  const planAuthorization = bundle.plan.payload.dispatch_control &&
    (bundle.plan.payload.dispatch_control.policy_authorizations || []).filter(item =>
      item.agent_id === policy.agent_id &&
      item.provider === policy.provider &&
      item.policy_id === policy.id &&
      item.draft_sha256 === authorization.draft_sha256);
  if (authorization.source !== "mission_plan_policy_digest" ||
      authorization.authorized_by !== "USER" ||
      authorization.compiled_by !== "controls_dispatch_controller" ||
      authorization.enforcement_level !== "guardrail" ||
      authorization.gateway_exclusive !== false ||
      !Array.isArray(planAuthorization) ||
      planAuthorization.length !== 1 ||
      !sameRef(authorization.plan_ref, bundle.context.payload.plan_ref) ||
      !sameRef(authorization.context_pack_ref, bundle.context.ref)) {
    throw new Error("Dispatch policy authorization does not match the exact mission plan and context pack.");
  }
  const allowed = new Set(bundle.agent.allowed_actions || []);
  const approvalRequired = new Set(bundle.agent.approval_required || []);
  const prohibited = new Set(bundle.agent.prohibited_actions || []);
  for (const rule of policy.tool_rules || []) {
    if (!allowed.has(rule.mission_action) ||
        approvalRequired.has(rule.mission_action) ||
        prohibited.has(rule.mission_action)) {
      throw new Error(`Dispatch rule ${rule.rule_id || "unknown"} is not derived from an allowed mission action.`);
    }
    if (!LOCALLY_ADMISSIBLE_OPERATION_CLASSES.has(rule.operation_class)) {
      throw new Error(`Dispatch rule ${rule.rule_id || "unknown"} requires an external authority gateway.`);
    }
  }
}

function policyValidity(policy, context, now) {
  const current = timestamp(now, "Current time");
  const policyApproved = timestamp(policy.approved_at, "Policy approved_at");
  const policyExpiry = timestamp(policy.valid_until, "Policy valid_until");
  const contextExpiry = timestamp(context.valid_until, "Context valid_until");
  if (current < policyApproved) throw new Error("Dispatch policy is not active yet.");
  if (current >= policyExpiry) throw new Error("Dispatch policy has expired.");
  if (current >= contextExpiry) throw new Error("Agent context pack has expired.");
  return Math.min(policyExpiry, contextExpiry);
}

function leaseId() {
  return `ADL-${crypto.randomUUID()}`;
}

function checkpointId(lease, sequence, kind) {
  return `AEC-${sha256(`${lease.id}\0${sequence}\0${kind}`).slice(0, 24)}`;
}

function admissionId(requestDigest, decision, reasonCodes) {
  return `TAE-${sha256(`${requestDigest}\0${decision}\0${reasonCodes.join(",")}`).slice(0, 24)}`;
}

function persistPolicy(options, policy) {
  assertValid(policy, "dispatch-tool-policy", "Dispatch tool policy");
  const ref = writeJsonArtifact(options, {
    missionId: policy.mission_id,
    waveId: policy.wave_id,
    kind: "dispatch-tool-policies",
    artifactId: policy.id,
    payload: policy,
    createdAt: policy.approved_at,
    publicationGuard: () => {
      const bundle = contextBundle(options, policy);
      policyValidity(policy, bundle.context.payload, nowIso(options));
      return true;
    }
  });
  return ref;
}

function policyRecords(view, missionId, waveId) {
  return listArtifacts(view, {
    missionId,
    waveId,
    kind: "dispatch-tool-policies"
  }).map(item => {
    assertValid(item.payload, "dispatch-tool-policy", `Dispatch policy ${item.payload.id || "unknown"}`);
    return item;
  });
}

function compiledPolicyContext(options, policyId) {
  const view = storeView(options);
  const policies = listArtifacts(view, { kind: "dispatch-tool-policies" }).filter(item => item.payload.id === policyId);
  if (policies.length !== 1) throw new Error("Expected one exact compiled dispatch policy.");
  const policyRecord = policies[0]; assertValid(policyRecord.payload, "dispatch-tool-policy", "Compiled dispatch policy");
  return { policyRecord, ...contextBundle(options, policyRecord.payload) };
}

function authorizeDispatchPolicy(options, draft) {
  assertProvider(draft.provider);
  assertIdentifier(draft.mission_id, "mission_id");
  assertIdentifier(draft.wave_id, "wave_id");
  assertIdentifier(draft.agent_id, "agent_id");
  assertIdentifier(draft.id, "policy_id");
  const firstBundle = contextBundle(options, draft, { requireAuthorization: false });
  const lock = dispatchAgentLock(
    firstBundle.view,
    draft.mission_id,
    draft.wave_id,
    draft.agent_id
  );
  try {
    const bundle = contextBundle(options, draft, { requireAuthorization: false });
    const draftSha256 = inputDigest(draft);
    const planAuthorizations = bundle.plan.payload.dispatch_control &&
      (bundle.plan.payload.dispatch_control.policy_authorizations || []).filter(item =>
        item.agent_id === draft.agent_id &&
        item.provider === draft.provider &&
        item.policy_id === draft.id &&
        item.draft_sha256 === draftSha256);
    if (!Array.isArray(planAuthorizations) || planAuthorizations.length !== 1) {
      throw new Error("Dispatch policy draft is not authorized by the exact mission-plan digest.");
    }
    const existing = policyRecords(bundle.view, draft.mission_id, draft.wave_id)
      .filter(item => item.payload.agent_id === draft.agent_id);
    const sameId = existing.find(item => item.payload.id === draft.id);
    if (sameId) {
      if (sameId.payload.authorization.draft_sha256 !== draftSha256) {
        throw new Error("Existing dispatch policy was compiled from a different draft digest.");
      }
      assertPolicyAuthorization(sameId.payload, bundle);
      return {
        status: "existing",
        execution_authorized: false,
        release_authorized: false,
        policy: sameId.payload,
        policy_ref: sameId.ref
      };
    }
    if (existing.length > 0) {
      throw new Error("A dispatch policy is already authorized for this mission agent and wave.");
    }
    const now = nowIso(options);
    const policy = {
      ...clone(draft),
      schema_version: "0.2",
      type: "DispatchToolPolicy",
      authorization: {
        source: "mission_plan_policy_digest",
        authorized_by: "USER",
        compiled_by: "controls_dispatch_controller",
        plan_ref: clone(bundle.context.payload.plan_ref),
        context_pack_ref: clone(bundle.context.ref),
        draft_sha256: draftSha256,
        enforcement_level: "guardrail",
        gateway_exclusive: false
      },
      authority: {
        human_final_decision_authority: "USER",
        self_approval_prohibited: true,
        release_authorized: false
      },
      approved_at: now
    };
    assertValid(policy, "dispatch-tool-policy", "Dispatch tool policy");
    assertPolicyAuthorization(policy, bundle);
    policyValidity(policy, bundle.context.payload, now);
    renewRepositoryLease(lock);
    const policyRef = persistPolicy(options, policy);
    return {
      status: "authorized",
      execution_authorized: false,
      release_authorized: false,
      policy,
      policy_ref: policyRef
    };
  } finally {
    releaseRepositoryLease(lock);
  }
}

function initialCheckpoint(lease, leaseRef, repositoryState, recordedAt) {
  return {
    schema_version: "0.2",
    type: "AgentExecutionCheckpoint",
    id: checkpointId(lease, 0, "baseline"),
    mission_id: lease.mission_id,
    wave_id: lease.wave_id,
    agent_id: lease.agent_id,
    provider: lease.provider,
    session_binding: clone(lease.session_binding),
    lease_ref: leaseRef,
    sequence: 0,
    checkpoint_kind: "baseline",
    lease_status: "active",
    previous_checkpoint_ref: clone(NONE_REF),
    tool_admission_ref: clone(NONE_REF),
    repository_state: clone(repositoryState),
    execution_result: {
      status: "not_applicable",
      provider_result_sha256: "none",
      external_effects: "none"
    },
    reason_codes: ["LEASE_BASELINE_ESTABLISHED"],
    resume_authorized: false,
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    },
    recorded_at: recordedAt
  };
}

function persistCheckpoint(options, checkpoint, publicationGuard) {
  assertValid(checkpoint, "agent-execution-checkpoint", "Agent execution checkpoint");
  return writeJsonArtifact(options, {
    missionId: checkpoint.mission_id,
    waveId: checkpoint.wave_id,
    kind: "agent-execution-checkpoints",
    artifactId: checkpoint.id,
    payload: checkpoint,
    createdAt: checkpoint.recorded_at,
    publicationGuard
  });
}

function prepareLeaseDraft(
  options,
  policyRecord,
  bindings,
  previousLeaseRef = NONE_REF,
  issuanceReason = "initial"
) {
  const policy = policyRecord.payload;
  assertProvider(policy.provider);
  const now = nowIso(options);
  const bundle = contextBundle(options, policy);
  const currentPolicy = loadArtifactRef(bundle.view, policyRecord.ref, "dispatch-tool-policy");
  if (currentPolicy.payload.id !== policy.id) {
    throw new Error("Dispatch policy reference does not match the requested policy.");
  }
  const maximumExpiry = policyValidity(policy, bundle.context.payload, now);
  const repositoryState = runtimeRepositoryState(bundle.view.repository.root);
  if (issuanceReason === "initial" &&
      policy.repository_state.require_clean_start === true &&
      repositoryState.dirty) {
    throw new Error("Dispatch policy requires a clean repository at lease issuance.");
  }
  const requestedBinding = {
    agentId: policy.agent_id,
    provider: policy.provider,
    sessionId: assertIdentifier(bindings.sessionId, "session_id"),
    providerAgentId: assertIdentifier(bindings.providerAgentId || "main", "provider_agent_id")
  };
  const history = leaseRecords(bundle.view, policy.mission_id, policy.wave_id)
    .filter(item => item.payload.agent_id === policy.agent_id);
  if (issuanceReason === "initial" && history.length > 0) {
    throw new Error("A dispatch lease lineage already exists for this mission agent and wave.");
  }
  const repositoryHistory = leaseRecords(bundle.view);
  if (gatewayObligations(bundle.view).length) {
    throw new Error("UNRESOLVED_GATEWAY_TRANSACTIONS: settle gateway obligations before issuing new repository tool authority.");
  }
  if (repositoryHistory.some(item => unresolvedToolEffectRecords(bundle.view, item).length > 0)) {
    throw new Error("UNRESOLVED_TOOL_EFFECTS: reconcile retained unknown effects before issuing new repository tool authority.");
  }
  const nonterminal = repositoryHistory.map(item => ({
    item,
    checkpoint: latestCheckpoint(bundle.view, item)
  })).filter(entry => !TERMINAL_LEASE_STATUSES.has(entry.checkpoint.payload.lease_status) &&
    !(issuanceReason === "resume" && sameRef(entry.item.ref, previousLeaseRef) && entry.checkpoint.payload.lease_status === "interrupted"));
  if (nonterminal.length > 0) {
    throw new Error("Another nonterminal dispatch lease blocks this repository; settle it before issuing new tool authority.");
  }
  const policyRef = clone(currentPolicy.ref);
  const expiresAt = new Date(Math.min(
    timestamp(now, "Lease issued_at") + (policy.lease_ttl_seconds * 1000),
    maximumExpiry
  )).toISOString();
  const lease = {
    schema_version: "0.1",
    type: "AgentDispatchLease",
    id: leaseId(),
    mission_id: policy.mission_id,
    wave_id: policy.wave_id,
    agent_id: policy.agent_id,
    provider: policy.provider,
    session_binding: {
      session_id: requestedBinding.sessionId,
      provider_agent_id: requestedBinding.providerAgentId
    },
    plan_ref: clone(bundle.context.payload.plan_ref),
    routing_preflight_ref: clone(bundle.context.payload.routing_preflight_ref),
    context_pack_ref: clone(bundle.context.ref),
    tool_policy_ref: policyRef,
    repository_binding: {
      repository_key: bundle.view.repository.key,
      identity_fingerprint: bundle.view.repository.identity_fingerprint
    },
    initial_repository_state: repositoryState,
    previous_lease_ref: clone(previousLeaseRef),
    issuance_reason: issuanceReason,
    nonce: options.nonce || crypto.randomBytes(32).toString("hex"),
    request_budget: policy.max_total_admissions,
    issued_at: now,
    not_before: now,
    expires_at: expiresAt,
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    }
  };
  assertValid(lease, "agent-dispatch-lease", "Agent dispatch lease");
  return { lease, bundle, policy };
}

function loadPolicyById(options, policyIdValue) {
  const view = storeView(options);
  const matches = listArtifacts(view, { kind: "dispatch-tool-policies" })
    .filter(item => item.payload.id === policyIdValue);
  if (matches.length !== 1) {
    throw new Error(`Expected one authorized dispatch policy ${policyIdValue}; found ${matches.length}.`);
  }
  assertValid(matches[0].payload, "dispatch-tool-policy", "Dispatch tool policy");
  return { view, policyRecord: matches[0] };
}

function issueLeaseFromPolicyRef(
  options,
  policyRef,
  bindings,
  previousLeaseRef = NONE_REF,
  issuanceReason = "initial"
) {
  const firstView = storeView(options);
  loadArtifactRef(firstView, policyRef, "dispatch-tool-policy");
  const lock = dispatchIssuanceLock(firstView);
  try {
    const run = oldLock => beginDispatchIssuance(options, policyRef, bindings, previousLeaseRef, issuanceReason, [lock, oldLock].filter(Boolean));
    if (issuanceReason === "resume") {
      const oldLock = dispatchLock(storeView(options), previousLeaseRef.artifact_id);
      try { return run(oldLock); } finally { releaseRepositoryLease(oldLock); }
    }
    return run(null);
  } finally {
    releaseRepositoryLease(lock);
  }
}

function issueLease(options, policyIdValue, bindings) {
  const loaded = loadPolicyById(options, policyIdValue);
  return issueLeaseFromPolicyRef(options, loaded.policyRecord.ref, bindings);
}

function rawLeaseRecords(view, missionId, waveId) {
  return listArtifacts(view, {
    missionId,
    waveId,
    kind: "agent-dispatch-leases"
  }).map(item => {
    assertValid(item.payload, "agent-dispatch-lease", `Dispatch lease ${item.payload.id || "unknown"}`);
    return item;
  });
}

const issuanceSnapshots = new WeakMap();
const issuancePrefixes = new WeakMap();
function issuanceNeed(value, code) {
  if (!value) throw new Error(code);
}

function issuanceBefore(view, entry) {
  let prefixes = issuancePrefixes.get(view);
  if (!prefixes) { prefixes = new Map(); issuancePrefixes.set(view, prefixes); }
  const key = `${entry.relative_path}\0${entry.sha256}`;
  if (!prefixes.has(key)) prefixes.set(key, require("./campaign-terminal-controller").prefixBeforeEntry(view, entry));
  return prefixes.get(key);
}

function issuancePrecedes(view, first, second) {
  const before = issuanceBefore(view, second.entry);
  return timestamp(first.entry.created_at, "Issuance introduction") <= timestamp(second.entry.created_at, "Issuance introduction") &&
    before.manifest.artifacts.some(entry => sameRef(artifactRef(entry, entry.artifact_id), first.ref));
}

function issuanceRecord(view, kind, id, scope) {
  const matches = listArtifacts(view, { kind, missionId: scope.mission_id, waveId: scope.wave_id }).filter(item => item.payload.id === id);
  issuanceNeed(matches.length <= 1, "DISPATCH_ISSUANCE_RECORD_AMBIGUOUS");
  return matches[0] || null;
}

function observedChannelBinding(view, lease, interruptionRef) {
  const context = loadArtifactRef(view, lease.context_pack_ref, "agent-context-pack");
  const pocket = context.payload.method_assignment?.broker;
  if (!pocket) return null;
  const matches = listArtifacts(view, { kind: "method-control-session-observations", missionId: lease.mission_id, waveId: lease.wave_id })
    .filter(item => item.payload.agent_id === lease.agent_id && item.payload.provider === lease.provider &&
      inputDigest(item.payload.session_binding) === inputDigest(lease.session_binding))
    .map(observation => ({ observation, slot: loadArtifactRef(view, observation.payload.launch_slot_ref, "method-control-launch-slot") }))
    .filter(({ observation, slot }) => slot.payload.agent_id === lease.agent_id && slot.payload.provider === lease.provider &&
      slot.payload.server_name === pocket.server_name && slot.payload.runtime_sha256 === pocket.runtime_sha256 &&
      ["plan_ref", "policy_ref", "context_ref"].every((key, index) =>
      sameRef(slot.payload[key], [lease.plan_ref, lease.tool_policy_ref, lease.context_pack_ref][index])) &&
      (lease.issuance_reason === "initial" ? slot.payload.schema_version === "0.1" && observation.payload.source === "startup" :
        slot.payload.schema_version === "0.2" && observation.payload.source === slot.payload.expected_source &&
        sameRef(slot.payload.interruption_checkpoint_ref, interruptionRef) &&
        sameRef(loadArtifactRef(view, slot.payload.predecessor_enrollment_ref, "method-control-enrollment").payload.lease_ref, lease.previous_lease_ref)));
  issuanceNeed(matches.length === 1, "DISPATCH_ISSUANCE_CHANNEL_OBSERVATION_REQUIRED");
  const result = matches[0];
  assertValid(result.observation.payload, "method-control-session-observation", "Issuance channel observation");
  issuanceNeed(timestamp(result.observation.payload.recorded_at, "Channel observation") <= timestamp(lease.issued_at, "Frozen issuance") &&
    issuancePrecedes(view, result.slot, result.observation), "DISPATCH_ISSUANCE_CHANNEL_OBSERVATION_INVALID");
  return result;
}

function issuanceProgress(view, request, resolutions) {
  const value = request.payload, planned = issuance.leaseForRequest(request);
  const before = issuanceBefore(view, request.entry);
  issuanceNeed(value.id === request.entry.artifact_id && value.mission_id === request.entry.mission_id && value.wave_id === request.entry.wave_id &&
    value.observed_manifest.revision === before.manifest.manifest_revision &&
    value.observed_manifest.sha256 === manifestDigest(before.manifest) && value.recorded_at === request.entry.created_at,
  "DISPATCH_ISSUANCE_INTRODUCTION_INVALID");
  const policy = loadArtifactRef(before, planned.tool_policy_ref, "dispatch-tool-policy");
  const context = loadArtifactRef(before, planned.context_pack_ref, "agent-context-pack");
  const plan = loadArtifactRef(before, planned.plan_ref, "mission-wave-plan");
  const agent = (plan.payload.agents || []).find(item => item.agent_id === planned.agent_id);
  issuanceNeed(agent && ["mission_id", "wave_id", "agent_id", "provider"].every(key => planned[key] === policy.payload[key]) &&
    ["mission_id", "wave_id", "agent_id"].every(key => context.payload[key] === planned[key]) &&
    plan.payload.mission_id === planned.mission_id && plan.payload.wave_id === planned.wave_id &&
    sameRef(context.payload.plan_ref, plan.ref) && sameRef(context.payload.routing_preflight_ref, planned.routing_preflight_ref) &&
    planned.repository_binding.repository_key === view.repository.key && planned.repository_binding.identity_fingerprint === view.repository.identity_fingerprint &&
    planned.request_budget === policy.payload.max_total_admissions && timestamp(planned.expires_at, "Frozen lease expiry") <=
      Math.min(policyValidity(policy.payload, context.payload, planned.issued_at), timestamp(planned.issued_at, "Frozen issuance") + policy.payload.lease_ttl_seconds * 1000),
  "DISPATCH_ISSUANCE_SCOPE_INVALID");
  assertPolicyAuthorization(policy.payload, { context, plan, agent });
  // Historical legacy contexts remain result-settleable; live consumers require v0.4.
  if (context.payload.schema_version === "0.4") require("./intent-continuity-contract").assertIntentContext(context.payload, plan.payload);
  require("./method-deviation-contract").assertMethodPolicy(plan.payload, policy.payload);
  const observed = observedChannelBinding(before, planned, value.interruption_checkpoint_ref);
  issuanceNeed(sameRef(value.channel_observation_ref, observed?.observation.ref || NONE_REF) &&
    (!observed || timestamp(planned.expires_at, "Frozen lease expiry") <= timestamp(observed.slot.payload.expires_at, "Root channel expiry")),
  "DISPATCH_ISSUANCE_CHANNEL_OBSERVATION_INVALID");
  const earlier = rawLeaseRecords(before).filter(item => item.payload.schema_version === "0.1" || resolutions.some(resolution =>
    resolution.payload.outcome === "committed" && sameRef(resolution.payload.lease_ref, item.ref) &&
    before.manifest.artifacts.some(entry => sameRef(artifactRef(entry, entry.artifact_id), resolution.ref))));
  issuanceNeed(!earlier.some(item => !TERMINAL_LEASE_STATUSES.has(latestCheckpoint(before, item).payload.lease_status) &&
    !sameRef(item.ref, planned.previous_lease_ref)), "DISPATCH_ISSUANCE_NONTERMINAL_PREDECESSOR");
  if (planned.issuance_reason === "initial") issuanceNeed(!earlier.some(item => item.payload.mission_id === planned.mission_id &&
    item.payload.wave_id === planned.wave_id && item.payload.agent_id === planned.agent_id), "DISPATCH_ISSUANCE_INITIAL_LINEAGE_EXISTS");
  if (value.planned_supersession) {
    const predecessor = loadArtifactRef(before, planned.previous_lease_ref, "agent-dispatch-lease"), interrupted = latestCheckpoint(before, predecessor);
    issuanceNeed(["mission_id", "wave_id", "agent_id", "provider"].every(key => predecessor.payload[key] === planned[key]) &&
      sameRef(predecessor.payload.plan_ref, planned.plan_ref) && sameRef(predecessor.payload.context_pack_ref, planned.context_pack_ref) &&
      sameRef(predecessor.payload.tool_policy_ref, planned.tool_policy_ref) && pendingAdmissions(before, predecessor).length === 0 &&
      sameRepositoryState(interrupted.payload.repository_state, planned.initial_repository_state) &&
      interrupted.payload.lease_status === "interrupted" && sameRef(interrupted.ref, value.interruption_checkpoint_ref) &&
      inputDigest(transitionCheckpoint(predecessor, interrupted, planned.initial_repository_state, { kind: "supersession", status: "superseded",
        reasonCodes: ["LEASE_SUPERSEDED_BY_RESUME"], recordedAt: value.recorded_at })) === inputDigest(value.planned_supersession),
    "DISPATCH_ISSUANCE_PREDECESSOR_INVALID");
    if (predecessor.payload.schema_version === "0.2") issuanceNeed(resolutions.some(item =>
      item.payload.outcome === "committed" && sameRef(item.payload.request_ref, predecessor.payload.issuance_ref) &&
      sameRef(item.payload.lease_ref, predecessor.ref) && before.manifest.artifacts.some(entry => sameRef(artifactRef(entry, entry.artifact_id), item.ref))),
    "DISPATCH_ISSUANCE_PREDECESSOR_UNCOMMITTED");
  }
  const lease = issuanceRecord(view, "agent-dispatch-leases", planned.id, value);
  if (lease) {
    assertValid(lease.payload, "agent-dispatch-lease", "Issued lease");
    issuanceNeed(inputDigest(lease.payload) === inputDigest(planned) && lease.entry.created_at === planned.issued_at &&
      issuancePrecedes(view, request, lease), "DISPATCH_ISSUANCE_LEASE_SUBSTITUTED");
  }
  const checkpoints = lease ? checkpointRecords(view, lease.ref, value.mission_id, value.wave_id) : [];
  const baselines = checkpoints.filter(item => item.payload.sequence === 0);
  issuanceNeed(baselines.length <= 1, "DISPATCH_ISSUANCE_BASELINE_AMBIGUOUS");
  const baseline = baselines[0] || null;
  if (baseline) issuanceNeed(inputDigest(baseline.payload) === inputDigest(initialCheckpoint(planned, lease.ref, planned.initial_repository_state, planned.issued_at)) &&
    baseline.entry.created_at === planned.issued_at && issuancePrecedes(view, lease, baseline), "DISPATCH_ISSUANCE_BASELINE_SUBSTITUTED");
  const supersession = value.planned_supersession && issuanceRecord(view, "agent-execution-checkpoints", value.planned_supersession.id, value);
  if (supersession) issuanceNeed(inputDigest(supersession.payload) === inputDigest(value.planned_supersession) &&
    supersession.entry.created_at === value.recorded_at && issuancePrecedes(view, request, supersession) &&
    (!lease || issuancePrecedes(view, supersession, lease)), "DISPATCH_ISSUANCE_SUPERSESSION_SUBSTITUTED");
  const selected = resolutions.filter(item => sameRef(item.payload.request_ref, request.ref));
  issuanceNeed(selected.length <= 1, "DISPATCH_ISSUANCE_RESOLUTION_AMBIGUOUS");
  const resolution = selected[0] || null;
  if (resolution) {
    const terminal = resolution.payload;
    issuanceNeed(["mission_id", "wave_id", "agent_id"].every(key => terminal[key] === value[key]) &&
      sameRef(terminal.lease_ref, lease?.ref || NONE_REF) && sameRef(terminal.baseline_ref, baseline?.ref || NONE_REF) &&
      sameRef(terminal.supersession_ref, supersession?.ref || NONE_REF) && terminal.recorded_at === resolution.entry.created_at &&
      issuancePrecedes(view, request, resolution) && (!lease || issuancePrecedes(view, lease, resolution)) &&
      (!baseline || issuancePrecedes(view, baseline, resolution)) && (!supersession || issuancePrecedes(view, supersession, resolution)),
    "DISPATCH_ISSUANCE_RESOLUTION_SUBSTITUTED");
    if (terminal.outcome === "committed") issuanceNeed(lease && baseline && (!value.planned_supersession || supersession) &&
      timestamp(terminal.recorded_at, "Issuance commit") < timestamp(value.expires_at, "Issuance expiry"), "DISPATCH_ISSUANCE_COMMIT_INCOMPLETE");
  }
  const committed = resolution?.payload.outcome === "committed";
  if (!committed && lease) issuanceNeed(checkpoints.length === baselines.length &&
    admissionRecords(view, lease.ref, value.mission_id, value.wave_id).length === 0, "DISPATCH_ISSUANCE_UNCOMMITTED_EXECUTION");
  return { request, planned, lease, baseline, supersession, resolution,
    status: resolution?.payload.outcome || "pending" };
}

function issuanceProgresses(view) {
  if (issuanceSnapshots.has(view)) return issuanceSnapshots.get(view);
  const requests = listArtifacts(view, { kind: issuance.REQUESTS }), resolutions = listArtifacts(view, { kind: issuance.RESOLUTIONS });
  for (const item of requests) assertValid(item.payload, "dispatch-lease-issuance-request", "Issuance request");
  for (const item of resolutions) {
    assertValid(item.payload, "dispatch-lease-issuance-resolution", "Issuance resolution");
    issuanceNeed(item.payload.id === item.entry.artifact_id && item.payload.mission_id === item.entry.mission_id && item.payload.wave_id === item.entry.wave_id &&
      requests.some(request => sameRef(request.ref, item.payload.request_ref)), "DISPATCH_ISSUANCE_REQUEST_REQUIRED");
  }
  const result = requests.map(request => issuanceProgress(view, request, resolutions));
  issuanceSnapshots.set(view, result);
  return result;
}

function leaseRecords(view, missionId, waveId) {
  const progress = issuanceProgresses(view);
  return rawLeaseRecords(view, missionId, waveId).filter(item => {
    if (item.payload.schema_version === "0.1") return true;
    const operation = progress.find(value => sameRef(value.request.ref, item.payload.issuance_ref));
    issuanceNeed(operation && sameRef(operation.lease?.ref, item.ref), "DISPATCH_ISSUANCE_REQUEST_REQUIRED");
    return operation.status === "committed";
  });
}

function assertNoPendingIssuance(options, view) {
  if (!view) {
    const repository = resolveRepository(options.repository);
    const verification = verifyRepositoryArtifacts({ repositoryPath: repository.root,
      artifactRoot: options.artifactRoot || path.join(repository.root, ".cannae", "artifacts") });
    if (!verification.valid && verification.issues.length === 1 &&
        ["ARTIFACT_ROOT_MISSING", "REPOSITORY_NAMESPACE_MISSING"].includes(verification.issues[0].code)) return;
    view = storeView(options);
  }
  issuanceNeed(!issuanceProgresses(view).some(item => item.status === "pending"), "DISPATCH_ISSUANCE_PENDING");
}

function issuancePublicationGuard(options, request, view, locks, cancellation = false) {
  const expected = manifestDigest(view.manifest), value = request.payload || request;
  return snapshot => {
    locks.forEach(assertRepositoryLease);
    if (!cancellation) {
      const live = storeView(options), previousRef = value.planned_lease.previous_lease_ref;
      if (!isNoneRef(previousRef)) {
        const previous = leaseRecords(live).find(item => sameRef(item.ref, previousRef));
        issuanceNeed(previous, "DISPATCH_ISSUANCE_PREDECESSOR_INVALID");
        issuanceNeed(!reconciledFailureState(live, previous).checkpoint_refs.length, "RECONCILED_FAILED_AGENT");
      }
      contextBundle(options, loadArtifactRef(live, value.planned_lease.tool_policy_ref, "dispatch-tool-policy").payload);
    }
    issuanceNeed(snapshot.manifest && manifestDigest(snapshot.manifest) === expected, "DISPATCH_ISSUANCE_STATE_CHANGED");
    const current = timestamp(nowIso(options), "Issuance publication time");
    issuanceNeed(current >= timestamp(value.recorded_at, "Issuance request time"), "DISPATCH_ISSUANCE_CLOCK_ROLLBACK");
    if (!cancellation) {
      issuanceNeed(current < timestamp(value.expires_at, "Frozen issuance expiry"), "DISPATCH_ISSUANCE_EXPIRED");
      issuanceNeed(issuance.runtimeDigest() === value.runtime_sha256, "DISPATCH_ISSUANCE_RUNTIME_CHANGED");
      issuanceNeed(sameRepositoryState(runtimeRepositoryState(options.repository), value.planned_lease.initial_repository_state), "DISPATCH_ISSUANCE_REPOSITORY_DRIFT");
    }
    return true;
  };
}

function interruptedForIssuance(options, view, previousRef) {
  const previous = leaseRecords(view).find(item => sameRef(item.ref, previousRef));
  issuanceNeed(previous, "DISPATCH_ISSUANCE_PREDECESSOR_INVALID");
  const checkpoint = latestCheckpoint(view, previous);
  issuanceNeed(!reconciledFailureState(view, previous).checkpoint_refs.length, "RECONCILED_FAILED_AGENT");
  const operationOptions = { ...options, artifactRoot: view.artifactRoot }, policy = policyForLease(view, previous).payload;
  require("./skill-mission-controller").assertWaveNotTerminated(operationOptions, previous.payload.mission_id, previous.payload.wave_id);
  const plan = loadArtifactRef(view, previous.payload.plan_ref, "mission-wave-plan");
  require("./skill-mission-controller").assertAdaptiveCampaignMayContinue(plan.payload, operationOptions);
  require("./order-revision-controller").assertRevisionDispatch(plan.payload, operationOptions, view);
  const intent = require("./intent-continuity-contract").assertIntentContext(contextForLease(view, previous).payload, plan.payload);
  require("./intent-continuity-contract").assertIntentPolicy(policy, intent);
  require("./method-deviation-gate").assertNoMethodDrift(options, previous.payload.mission_id, view);
  require("./method-control-broker").assertSettled(options, previous.payload, view);
  issuanceNeed(!gatewayObligations(view).length, "UNRESOLVED_GATEWAY_TRANSACTIONS");
  issuanceNeed(!unresolvedToolEffectRecords(view, previous).length, "UNRESOLVED_TOOL_EFFECTS");
  if (checkpoint.payload.lease_status !== "interrupted") throw new Error("Only an interrupted lease can be resumed.");
  issuanceNeed(pendingAdmissions(view, previous).length === 0, "DISPATCH_ISSUANCE_PENDING_TOOL_REQUEST");
  const bundle = require("./method-deviation-gate").scopeForLease(view, previous.ref);
  if (bundle.agent) issuanceNeed(require("./method-deviation-gate").methodState(view, bundle.plan, previous.payload.agent_id).pending_reports.length === 0,
    "DISPATCH_ISSUANCE_METHOD_REPORT_PENDING");
  return { previous, checkpoint };
}

function beginDispatchIssuance(options, policyRef, bindings, previousRef, reason, locks) {
  locks.forEach(renewRepositoryLease);
  const view = storeView(options);
  issuanceNeed(!issuanceProgresses(view).some(item => item.status === "pending"), "DISPATCH_ISSUANCE_PENDING");
  const prior = reason === "resume" ? interruptedForIssuance(options, view, previousRef) : null;
  if (prior) issuanceNeed(sameRef(prior.previous.payload.tool_policy_ref, policyRef), "DISPATCH_ISSUANCE_PREDECESSOR_INVALID");
  const prepared = prepareLeaseDraft(options, loadArtifactRef(view, policyRef, "dispatch-tool-policy"), bindings, previousRef, reason);
  if (prior) issuanceNeed(sameRepositoryState(prepared.lease.initial_repository_state, prior.checkpoint.payload.repository_state), "DISPATCH_ISSUANCE_REPOSITORY_DRIFT");
  const channel = observedChannelBinding(prepared.bundle.view, prepared.lease, prior?.checkpoint.ref || NONE_REF);
  if (channel) issuanceNeed(prepared.bundle.context.payload.method_assignment.broker.runtime_sha256 === require("./method-control-contract").runtimeDigest(),
    "DISPATCH_ISSUANCE_CHANNEL_REVIEW_REQUIRED");
  if (channel) prepared.lease.expires_at = new Date(Math.min(timestamp(prepared.lease.expires_at, "Lease expiry"),
    timestamp(channel.slot.payload.expires_at, "Channel expiry"))).toISOString();
  const lease = prepared.lease;
  const value = issuance.identified("DispatchLeaseIssuanceRequest", { mission_id: lease.mission_id, wave_id: lease.wave_id, agent_id: lease.agent_id,
    planned_lease: lease, interruption_checkpoint_ref: prior?.checkpoint.ref || clone(NONE_REF),
    planned_supersession: prior ? transitionCheckpoint(prior.previous, prior.checkpoint, lease.initial_repository_state,
      { kind: "supersession", status: "superseded", reasonCodes: ["LEASE_SUPERSEDED_BY_RESUME"], recordedAt: lease.issued_at }) : null,
    channel_observation_ref: channel?.observation.ref || clone(NONE_REF),
    observed_manifest: { revision: prepared.bundle.view.manifest.manifest_revision, sha256: manifestDigest(prepared.bundle.view.manifest) },
    runtime_sha256: issuance.runtimeDigest(), recorded_at: lease.issued_at, expires_at: lease.expires_at });
  assertValid(value, "dispatch-lease-issuance-request", "Issuance request");
  locks.forEach(renewRepositoryLease);
  const reference = writeJsonArtifact(options, { missionId: value.mission_id, waveId: value.wave_id, kind: issuance.REQUESTS,
    artifactId: value.id, payload: value, createdAt: value.recorded_at,
    publicationGuard: issuancePublicationGuard(options, value, prepared.bundle.view, locks) });
  return continueDispatchIssuance(options, reference, locks);
}

function appraiseLiveIssuance(options, operation, view) {
  const { request, planned } = operation, value = request.payload, current = timestamp(nowIso(options), "Issuance recovery time");
  issuanceNeed(current >= timestamp(value.recorded_at, "Issuance request time"), "DISPATCH_ISSUANCE_CLOCK_ROLLBACK");
  issuanceNeed(current < timestamp(value.expires_at, "Issuance expiry"), "DISPATCH_ISSUANCE_EXPIRED");
  issuanceNeed(issuance.runtimeDigest() === value.runtime_sha256, "DISPATCH_ISSUANCE_RUNTIME_CHANGED");
  issuanceNeed(!issuanceProgresses(view).some(item => item.status === "pending" && !sameRef(item.request.ref, request.ref)), "DISPATCH_ISSUANCE_AMBIGUOUS");
  const policy = loadArtifactRef(view, planned.tool_policy_ref, "dispatch-tool-policy"), bundle = contextBundle(options, policy.payload);
  if (bundle.context.payload.method_assignment?.broker) issuanceNeed(bundle.context.payload.method_assignment.broker.runtime_sha256 ===
    require("./method-control-contract").runtimeDigest(), "DISPATCH_ISSUANCE_CHANNEL_REVIEW_REQUIRED");
  issuanceNeed(sameRef(bundle.context.ref, planned.context_pack_ref) && sameRef(bundle.plan.ref, planned.plan_ref), "DISPATCH_ISSUANCE_SCOPE_CHANGED");
  policyValidity(policy.payload, bundle.context.payload, nowIso(options));
  issuanceNeed(sameRepositoryState(runtimeRepositoryState(options.repository), planned.initial_repository_state), "DISPATCH_ISSUANCE_REPOSITORY_DRIFT");
  issuanceNeed(!gatewayObligations(view).length, "UNRESOLVED_GATEWAY_TRANSACTIONS");
  const history = leaseRecords(view);
  issuanceNeed(!history.some(item => unresolvedToolEffectRecords(view, item).length), "UNRESOLVED_TOOL_EFFECTS");
  if (value.planned_supersession) {
    const previous = history.find(item => sameRef(item.ref, planned.previous_lease_ref));
    issuanceNeed(previous, "DISPATCH_ISSUANCE_PREDECESSOR_INVALID");
    const checkpoint = latestCheckpoint(view, previous);
    issuanceNeed(sameRef(checkpoint.ref, operation.supersession?.ref || value.interruption_checkpoint_ref) &&
      !pendingAdmissions(view, previous).length && !reconciledFailureState(view, previous).checkpoint_refs.length,
    "DISPATCH_ISSUANCE_PREDECESSOR_CHANGED");
    require("./method-control-broker").assertSettled(options, previous.payload, view);
  }
  issuanceNeed(!history.some(item => {
    const checkpoint = latestCheckpoint(view, item);
    return !TERMINAL_LEASE_STATUSES.has(checkpoint.payload.lease_status) &&
      !(sameRef(item.ref, planned.previous_lease_ref) && checkpoint.payload.lease_status === "interrupted");
  }), "DISPATCH_ISSUANCE_NONTERMINAL_LEASE");
}

function dispatchIssuanceResult(options, operation) {
  if (operation.status !== "committed") return { status: operation.status, issuance_ref: operation.request.ref,
    resolution_ref: operation.resolution?.ref || clone(NONE_REF), ...issuance.AUTHORITY };
  const lease = operation.lease, checkpoint = latestCheckpoint(storeView(options), lease);
  const selected = activeLease(options, { missionId: lease.payload.mission_id, waveId: lease.payload.wave_id, agentId: lease.payload.agent_id,
    provider: lease.payload.provider, sessionId: lease.payload.session_binding.session_id, providerAgentId: lease.payload.session_binding.provider_agent_id });
  return { status: selected.code === "LEASE_ACTIVE" ? "active" : "committed", execution_authorized: selected.code === "LEASE_ACTIVE",
    release_authorized: false, issuance_ref: operation.request.ref, resolution_ref: operation.resolution.ref,
    lease: lease.payload, lease_ref: lease.ref, checkpoint: operation.baseline.payload, checkpoint_ref: operation.baseline.ref,
    current_checkpoint_ref: checkpoint.ref, current_lease_status: checkpoint.payload.lease_status, artifact_store: selected.view.verification };
}

function continueDispatchIssuance(options, reference, locks) {
  for (let step = 0; step < 5; step++) {
    locks.forEach(renewRepositoryLease);
    const view = storeView(options), operation = issuanceProgresses(view).find(item => sameRef(item.request.ref, reference));
    issuanceNeed(operation, "DISPATCH_ISSUANCE_REQUEST_REQUIRED");
    if (operation.status !== "pending") return dispatchIssuanceResult(options, operation);
    appraiseLiveIssuance(options, operation, view);
    let payload, kind, type;
    if (operation.request.payload.planned_supersession && !operation.supersession) {
      payload = operation.request.payload.planned_supersession; kind = "agent-execution-checkpoints"; type = "agent-execution-checkpoint";
    } else if (!operation.lease) {
      payload = operation.planned; kind = "agent-dispatch-leases"; type = "agent-dispatch-lease";
    } else if (!operation.baseline) {
      payload = initialCheckpoint(operation.planned, operation.lease.ref, operation.planned.initial_repository_state, operation.planned.issued_at);
      kind = "agent-execution-checkpoints"; type = "agent-execution-checkpoint";
    } else {
      payload = issuance.identified("DispatchLeaseIssuanceResolution", { mission_id: operation.planned.mission_id, wave_id: operation.planned.wave_id,
        agent_id: operation.planned.agent_id, request_ref: reference, outcome: "committed", lease_ref: operation.lease.ref,
        baseline_ref: operation.baseline.ref, supersession_ref: operation.supersession?.ref || clone(NONE_REF), reason: "Exact frozen issuance committed.", recorded_at: nowIso(options) });
      kind = issuance.RESOLUTIONS; type = "dispatch-lease-issuance-resolution";
    }
    assertValid(payload, type, "Issuance publication"); locks.forEach(renewRepositoryLease);
    writeJsonArtifact(options, { missionId: payload.mission_id, waveId: payload.wave_id, kind, artifactId: payload.id,
      payload, createdAt: payload.recorded_at || payload.issued_at, publicationGuard: issuancePublicationGuard(options, operation.request, view, locks) });
  }
  throw new Error("DISPATCH_ISSUANCE_STAGE_LIMIT");
}

function withIssuanceOperation(options, id, callback) {
  const lock = dispatchIssuanceLock(storeView(options));
  try {
    const matches = issuanceProgresses(storeView(options)).filter(item => item.request.payload.id === id);
    issuanceNeed(matches.length === 1, "DISPATCH_ISSUANCE_REQUEST_REQUIRED");
    const operation = matches[0], previous = operation.planned.previous_lease_ref;
    if (isNoneRef(previous)) return callback(operation, [lock]);
    const oldLock = dispatchLock(storeView(options), previous.artifact_id);
    try { return callback(operation, [lock, oldLock]); } finally { releaseRepositoryLease(oldLock); }
  } finally { releaseRepositoryLease(lock); }
}

function recoverDispatchIssuance(options, id) {
  return withIssuanceOperation(options, id, (operation, locks) => continueDispatchIssuance(options, operation.request.ref, locks));
}

function cancelDispatchIssuance(options, id, reason) {
  issuanceNeed(typeof reason === "string" && reason.trim().length > 0 && reason.length <= 1024, "DISPATCH_ISSUANCE_CANCELLATION_REASON_REQUIRED");
  return withIssuanceOperation(options, id, (_previous, locks) => {
    const view = storeView(options), operation = issuanceProgresses(view).find(item => item.request.payload.id === id);
    if (operation.status === "cancelled") {
      issuanceNeed(operation.resolution.payload.reason === reason.trim(), "DISPATCH_ISSUANCE_CANCELLATION_CONFLICT");
      return dispatchIssuanceResult(options, operation);
    }
    issuanceNeed(operation.status === "pending", "DISPATCH_ISSUANCE_ALREADY_COMMITTED");
    const payload = issuance.identified("DispatchLeaseIssuanceResolution", { mission_id: operation.planned.mission_id, wave_id: operation.planned.wave_id,
      agent_id: operation.planned.agent_id, request_ref: operation.request.ref, outcome: "cancelled", lease_ref: operation.lease?.ref || clone(NONE_REF),
      baseline_ref: operation.baseline?.ref || clone(NONE_REF), supersession_ref: operation.supersession?.ref || clone(NONE_REF), reason: reason.trim(), recorded_at: nowIso(options) });
    assertValid(payload, "dispatch-lease-issuance-resolution", "Issuance cancellation"); locks.forEach(renewRepositoryLease);
    writeJsonArtifact(options, { missionId: payload.mission_id, waveId: payload.wave_id, kind: issuance.RESOLUTIONS, artifactId: payload.id, payload,
      createdAt: payload.recorded_at, publicationGuard: issuancePublicationGuard(options, operation.request, view, locks, true) });
    return dispatchIssuanceResult(options, issuanceProgresses(storeView(options)).find(item => item.request.payload.id === id));
  });
}

function checkpointRecords(view, leaseRef, missionId, waveId) {
  return listArtifacts(view, {
    missionId,
    waveId,
    kind: "agent-execution-checkpoints"
  }).filter(item => sameRef(item.payload.lease_ref, leaseRef))
    .map(item => {
      assertValid(item.payload, "agent-execution-checkpoint", `Execution checkpoint ${item.payload.id || "unknown"}`);
      return item;
    })
    .sort((left, right) => left.payload.sequence - right.payload.sequence);
}

function admissionRecords(view, leaseRef, missionId, waveId) {
  return listArtifacts(view, {
    missionId,
    waveId,
    kind: "tool-admission-events"
  }).filter(item => sameRef(item.payload.lease_ref, leaseRef))
    .map(item => {
      assertValid(item.payload, "tool-admission-event", `Tool admission ${item.payload.id || "unknown"}`);
      return item;
    })
    .sort((left, right) => left.payload.sequence - right.payload.sequence);
}

function admissionBudgetHistory(view, lease, context, policy) {
  if (context.payload.method_assignment?.broker?.schema_version !== "0.2") {
    return admissionRecords(view, lease.ref, lease.payload.mission_id, lease.payload.wave_id);
  }
  return leaseRecords(view, lease.payload.mission_id, lease.payload.wave_id)
    .filter(item => item.payload.agent_id === lease.payload.agent_id && item.payload.provider === lease.payload.provider &&
      sameRef(item.payload.plan_ref, lease.payload.plan_ref) && sameRef(item.payload.context_pack_ref, context.ref) &&
      sameRef(item.payload.tool_policy_ref, policy.ref))
    .flatMap(item => admissionRecords(view, item.ref, item.payload.mission_id, item.payload.wave_id));
}

function latestCheckpoint(view, leaseRecord) {
  const checkpoints = checkpointRecords(
    view,
    leaseRecord.ref,
    leaseRecord.payload.mission_id,
    leaseRecord.payload.wave_id
  );
  if (checkpoints.length === 0 || checkpoints[0].payload.sequence !== 0) {
    throw new Error(`Dispatch lease ${leaseRecord.payload.id} has no baseline checkpoint.`);
  }
  for (let index = 1; index < checkpoints.length; index += 1) {
    if (checkpoints[index].payload.sequence !== checkpoints[index - 1].payload.sequence + 1 ||
        !sameRef(checkpoints[index].payload.previous_checkpoint_ref, checkpoints[index - 1].ref)) {
      throw new Error(`Dispatch lease ${leaseRecord.payload.id} has a broken checkpoint chain.`);
    }
  }
  return checkpoints.at(-1);
}

function completedAdmissionIds(checkpoints) {
  return new Set(checkpoints
    .filter(item => !isNoneRef(item.payload.tool_admission_ref))
    .map(item => item.payload.tool_admission_ref.artifact_id));
}

function dispatchLeaseHistory(view, leaseRef) {
  const lease = loadArtifactRef(view, leaseRef, "agent-dispatch-lease");
  const latest = latestCheckpoint(view, lease);
  const checkpoints = checkpointRecords(view, leaseRef, lease.payload.mission_id, lease.payload.wave_id);
  for (let index = 0; index < checkpoints.length; index += 1) {
    const checkpoint = checkpoints[index].payload;
    if (["mission_id", "wave_id", "agent_id", "provider"].some(key => checkpoint[key] !== lease.payload[key]) ||
        inputDigest(checkpoint.session_binding) !== inputDigest(lease.payload.session_binding) ||
        (index && Date.parse(checkpoint.recorded_at) < Date.parse(checkpoints[index - 1].payload.recorded_at))) {
      throw new Error("DISPATCH_HISTORY_BINDING_MISMATCH");
    }
  }
  return { lease, latest, checkpoints };
}

function inspectDispatchHistory(store, leaseRef) {
  const view = require("./effect-settlement-proof").historicalRuntimeView(store), history = dispatchLeaseHistory(view, leaseRef);
  return { ...history, pending_tool_requests: pendingAdmissions(view, history.lease).length,
    unresolved_tool_effects: leaseRecords(view).reduce((total, lease) => total + unresolvedToolEffectRecords(view, lease).length, 0),
    unresolved_gateway_transactions: gatewayObligations(view).length };
}

function unknownToolEffectRecords(view, leaseRecord) {
  // A later revocation or baseline cannot settle an earlier unknown outcome.
  latestCheckpoint(view, leaseRecord);
  return checkpointRecords(view, leaseRecord.ref, leaseRecord.payload.mission_id, leaseRecord.payload.wave_id)
    .filter(item => item.payload.execution_result.external_effects === "unknown");
}

function unresolvedToolEffectRecords(view, leaseRecord) {
  const unknown = unknownToolEffectRecords(view, leaseRecord);
  if (!unknown.length) return unknown;
  const settled = [...require("./tool-effect-settlement").settledToolEffectRefs(view, leaseRecord.ref),
    ...require("./gateway-effect-settlement").settledGatewayEffectState(view, leaseRecord.ref).effect_checkpoint_refs];
  return unknown.filter(item => !settled.some(ref => sameRef(ref, item.ref)));
}

function reconciledFailureState(view, leaseRecord) {
  if (!view.manifest.artifacts.some(entry => ["tool-effect-settlements", "gateway-effect-settlements"].includes(entry.kind))) {
    return { checkpoint_refs: [], latest_settled_at: null, revocation_required: false };
  }
  const checkpoint = latestCheckpoint(view, leaseRecord);
  const related = leaseRecords(view, leaseRecord.payload.mission_id, leaseRecord.payload.wave_id)
    .filter(record => record.payload.agent_id === leaseRecord.payload.agent_id);
  const settlements = related.flatMap(record => [
    require("./tool-effect-settlement").settledToolEffectState(view, record.ref, checkpoint.ref),
    require("./gateway-effect-settlement").settledGatewayEffectState(view, record.ref, checkpoint.ref)]);
  const refs = settlements.flatMap(settled => settled.checkpoint_refs);
  return {
    checkpoint_refs: refs,
    latest_settled_at: refs.length ? new Date(Math.max(...settlements.filter(item => item.latest_settled_at)
      .map(item => Date.parse(item.latest_settled_at)))).toISOString() : null,
    revocation_required: refs.length > 0 &&
      !(checkpoint.payload.checkpoint_kind === "revocation" && checkpoint.payload.lease_status === "revoked" &&
        settlements.every(settled => !settled.checkpoint_refs.length || (settled.checkpoint_follows_settlement &&
          Date.parse(checkpoint.payload.recorded_at) >= Date.parse(settled.latest_settled_at))))
  };
}

function hasReconciledFailureAwaitingRevocation(view) {
  return view.manifest.artifacts.some(entry => ["tool-effect-settlements", "gateway-effect-settlements"].includes(entry.kind)) &&
    leaseRecords(view).some(record => reconciledFailureState(view, record).revocation_required);
}

function assertReconciledFailuresRevoked(view) {
  if (hasReconciledFailureAwaitingRevocation(view)) {
    throw new Error("RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED: explicitly revoke the reconciled failed lease before new authority or wave publication.");
  }
}

function assertReconciledFailureRevocations(options) {
  const repository = resolveRepository(options.repository);
  const root = path.resolve(options.artifactRoot || path.join(repository.root, ".cannae", "artifacts"));
  if (!fs.existsSync(path.join(root, "repositories", repository.key))) return;
  assertReconciledFailuresRevoked(storeView(options));
}

function gatewayObligations(view, options, allowCurrentOperation = false) {
  return require("./protected-tool-gateway").gatewayDispatchObligations(view, options, allowCurrentOperation);
}

function gatewayDispatchCode(options, view, leaseRef, toolUseId, action) {
  return require("./protected-tool-gateway").gatewayDispatchAccess(options, view, leaseRef, toolUseId, action);
}

function dispatchCompletionGuard(options, leaseRecord, previous, toolUseId, action) {
  return () => {
    const view = storeView(options);
    const code = gatewayDispatchCode(options, view, leaseRecord.ref, toolUseId, action);
    if (code) throw new Error(code);
    if (!sameRef(latestCheckpoint(view, leaseRecord).ref, previous.ref)) {
      throw new Error("DISPATCH_COMPLETION_CHECKPOINT_CHANGED");
    }
    return true;
  };
}

function unknownToolEffectCheckpointRefs(view, leaseRef) {
  const leaseRecord = loadArtifactRef(view, leaseRef, "agent-dispatch-lease");
  return unknownToolEffectRecords(view, leaseRecord).map(item => clone(item.ref));
}

function pendingAdmissions(view, leaseRecord) {
  const checkpoints = checkpointRecords(
    view,
    leaseRecord.ref,
    leaseRecord.payload.mission_id,
    leaseRecord.payload.wave_id
  );
  const completed = completedAdmissionIds(checkpoints);
  const reconciled = require("./gateway-effect-settlement").settledGatewayEffectState(view, leaseRecord.ref).admission_refs;
  return admissionRecords(
    view,
    leaseRecord.ref,
    leaseRecord.payload.mission_id,
    leaseRecord.payload.wave_id
  ).filter(item => item.payload.decision === "allow" && !completed.has(item.payload.id) &&
    !reconciled.some(reference => sameRef(reference, item.ref)));
}

function completionCandidates(view, leaseRecordsValue, toolUseId) {
  const unresolved = [];
  const completed = [];
  for (const leaseRecord of leaseRecordsValue) {
    const checkpoints = checkpointRecords(
      view,
      leaseRecord.ref,
      leaseRecord.payload.mission_id,
      leaseRecord.payload.wave_id
    );
    const completedIds = completedAdmissionIds(checkpoints);
    const reconciled = require("./gateway-effect-settlement").settledGatewayEffectState(view, leaseRecord.ref).admission_refs;
    const admissions = admissionRecords(
      view,
      leaseRecord.ref,
      leaseRecord.payload.mission_id,
      leaseRecord.payload.wave_id
    ).filter(item =>
      item.payload.tool_use_id === toolUseId &&
      item.payload.decision === "allow" && !reconciled.some(reference => sameRef(reference, item.ref)));
    for (const admission of admissions) {
      (completedIds.has(admission.payload.id) ? completed : unresolved)
        .push({ leaseRecord, admission });
    }
  }
  return { unresolved, completed };
}

function policyForLease(view, leaseRecord) {
  const policy = loadArtifactRef(view, leaseRecord.payload.tool_policy_ref, "dispatch-tool-policy");
  if (policy.payload.id !== leaseRecord.payload.tool_policy_ref.artifact_id ||
      policy.payload.mission_id !== leaseRecord.payload.mission_id ||
      policy.payload.wave_id !== leaseRecord.payload.wave_id ||
      policy.payload.agent_id !== leaseRecord.payload.agent_id ||
      policy.payload.provider !== leaseRecord.payload.provider) {
    throw new Error("Dispatch tool policy does not match its lease.");
  }
  return policy;
}

function contextForLease(view, leaseRecord) {
  const context = loadArtifactRef(view, leaseRecord.payload.context_pack_ref, "agent-context-pack");
  if (context.payload.mission_id !== leaseRecord.payload.mission_id ||
      context.payload.wave_id !== leaseRecord.payload.wave_id ||
      context.payload.agent_id !== leaseRecord.payload.agent_id ||
      !sameRef(context.payload.plan_ref, leaseRecord.payload.plan_ref) ||
      !sameRef(context.payload.routing_preflight_ref, leaseRecord.payload.routing_preflight_ref)) {
    throw new Error("Agent context pack no longer matches the dispatch lease.");
  }
  const preflight = loadArtifactRef(view, leaseRecord.payload.routing_preflight_ref);
  if (context.payload.status !== "ready" ||
      preflight.payload.type !== "AgentRoutingPreflightProjection" ||
      preflight.payload.status !== "ready") {
    throw new Error("Lease context or routing preflight is not ready.");
  }
  return context;
}

function bindingMatches(lease, identity) {
  return lease.agent_id === identity.agentId &&
    lease.provider === identity.provider &&
    lease.session_binding.session_id === identity.sessionId &&
    lease.session_binding.provider_agent_id === identity.providerAgentId;
}

function activeLease(options, identity, at = nowIso(options)) {
  return withinOrderReplay(() => activeLeaseInReplay(options, identity, at));
}
function activeLeaseInReplay(options, identity, at) {
  const view = storeView(options);
  if (issuanceProgresses(view).some(item => item.status === "pending")) {
    return { code: "DISPATCH_ISSUANCE_PENDING", view, leaseRecord: null, checkpointRecord: null };
  }
  if (listArtifacts(view, { missionId: identity.missionId, waveId: identity.waveId, kind: "mission-wave-terminations" }).length) {
    return { code: "MISSION_WAVE_TERMINATED", view, leaseRecord: null, checkpointRecord: null };
  }
  const records = leaseRecords(view, identity.missionId, identity.waveId)
    .filter(item => item.payload.agent_id === identity.agentId && item.payload.provider === identity.provider);
  const exact = records.filter(item => bindingMatches(item.payload, identity));
  if (exact.length === 0) {
    const code = records.length > 0 ? "LEASE_BINDING_MISMATCH" : "LEASE_NOT_FOUND";
    return { code, view, leaseRecord: null, checkpointRecord: null };
  }
  const candidates = exact.map(leaseRecord => ({
    leaseRecord,
    checkpointRecord: latestCheckpoint(view, leaseRecord)
  })).filter(item => !TERMINAL_LEASE_STATUSES.has(item.checkpointRecord.payload.lease_status));
  if (candidates.length !== 1) {
    return {
      code: candidates.length === 0 ? "LEASE_NOT_ACTIVE" : "LEASE_AMBIGUOUS",
      view,
      leaseRecord: candidates[0] && candidates[0].leaseRecord,
      checkpointRecord: candidates[0] && candidates[0].checkpointRecord
    };
  }
  const selected = candidates[0];
  if (selected.leaseRecord.payload.schema_version === "0.1") {
    return { code: "LEGACY_LEASE_RESULT_ONLY", view, ...selected };
  }
  const issued = loadArtifactRef(view, selected.leaseRecord.payload.issuance_ref, "dispatch-lease-issuance-request");
  if (issued.payload.runtime_sha256 !== issuance.runtimeDigest()) {
    return { code: "DISPATCH_ISSUANCE_RUNTIME_CHANGED", view, ...selected };
  }
  if (reconciledFailureState(view, selected.leaseRecord).checkpoint_refs.length) {
    return { code: "RECONCILED_FAILED_AGENT", view, ...selected };
  }
  if (hasReconciledFailureAwaitingRevocation(view)) {
    return { code: "RECONCILED_FAILED_AGENT_REVOCATION_REQUIRED", view, ...selected };
  }
  if (gatewayObligations(view, options, true).length) {
    return { code: "UNRESOLVED_GATEWAY_TRANSACTIONS", view, ...selected };
  }
  if (leaseRecords(view).some(record => unresolvedToolEffectRecords(view, record).length > 0)) {
    return { code: "UNRESOLVED_TOOL_EFFECTS", view, ...selected };
  }
  const plan = loadArtifactRef(view, selected.leaseRecord.payload.plan_ref, "mission-wave-plan");
  try {
    const context = loadArtifactRef(view, selected.leaseRecord.payload.context_pack_ref, "agent-context-pack");
    const intent = require("./intent-continuity-contract").assertIntentContext(context.payload, plan.payload);
    require("./intent-continuity-contract").assertIntentPolicy(policyForLease(view, selected.leaseRecord).payload, intent);
    require("./method-deviation-gate").assertNoMethodDrift(options, identity.missionId, view);
  } catch (error) {
    if (!error.message.startsWith("INTENT_") && !error.message.startsWith("METHOD_")) throw error;
    return { code: error.message, view, ...selected };
  }
  try {
    require("./skill-mission-controller").assertAdaptiveCampaignMayContinue(plan.payload, { ...options, artifactRoot: view.artifactRoot });
    require("./order-revision-controller").assertRevisionDispatch(plan.payload, { ...options, artifactRoot: view.artifactRoot }, view);
  } catch (error) {
    if (error.message.startsWith("ORDER_REVISION_")) return { code: error.message, view, ...selected };
    if (error.code !== "CAMPAIGN_CONTINUATION_BLOCKED") throw error;
    return { code: error.code, view, ...selected };
  }
  const current = timestamp(at, "Admission time");
  if (current < timestamp(selected.leaseRecord.payload.not_before, "Lease not_before")) {
    return { code: "LEASE_NOT_YET_ACTIVE", view, ...selected };
  }
  if (current >= timestamp(selected.leaseRecord.payload.expires_at, "Lease expires_at")) {
    return { code: "LEASE_EXPIRED", view, ...selected };
  }
  if (selected.checkpointRecord.payload.lease_status !== "active") {
    return { code: `LEASE_${selected.checkpointRecord.payload.lease_status.toUpperCase()}`, view, ...selected };
  }
  return { code: "LEASE_ACTIVE", view, ...selected };
}

function dispatchLock(view, leaseIdValue) {
  const lockRoot = path.join(view.namespacePath, ".dispatch-runtime", assertIdentifier(leaseIdValue, "lease_id"));
  return acquireRepositoryLease(lockRoot, { leaseTimeoutMs: 5000, leaseTtlMs: 30000 });
}

function withDispatchControlLock(options, leaseIdValue, callback) {
  const loaded = loadLeaseById(options, leaseIdValue), lock = dispatchLock(loaded.view, leaseIdValue);
  try {
    const current = loadLeaseById(options, leaseIdValue);
    return callback({ ...current, checkpointRecord: latestCheckpoint(current.view, current.leaseRecord) }, () => renewRepositoryLease(lock));
  } finally { releaseRepositoryLease(lock); }
}

function dispatchAgentLock(view, missionId, waveId, agentId) {
  const lockRoot = path.join(
    view.namespacePath,
    ".dispatch-runtime",
    "agents",
    assertIdentifier(missionId, "mission_id"),
    assertIdentifier(waveId, "wave_id"),
    assertIdentifier(agentId, "agent_id")
  );
  return acquireRepositoryLease(lockRoot, { leaseTimeoutMs: 5000, leaseTtlMs: 30000 });
}

function dispatchIssuanceLock(view) {
  const lockRoot = path.join(view.namespacePath, ".dispatch-runtime", "issuance");
  return acquireRepositoryLease(lockRoot, { leaseTimeoutMs: 5000, leaseTtlMs: 30000 });
}

function withDispatchIssuanceLock(options, operation) {
  const lock = dispatchIssuanceLock(storeView(options));
  try {
    const result = operation(lock);
    renewRepositoryLease(lock);
    return result;
  } finally {
    releaseRepositoryLease(lock);
  }
}

function normalizeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") ||
      path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) ||
      value.split(/[\\/]+/).includes("..")) {
    return null;
  }
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  return normalized || ".";
}

function protectedPath(relativePath) {
  return PROTECTED_PATHS.some(prefix =>
    relativePath === prefix || relativePath.startsWith(`${prefix}/`));
}

function pathAllowed(relativePath, allowedPrefixes) {
  if (!relativePath || protectedPath(relativePath)) return false;
  return allowedPrefixes.some(prefix => {
    const normalized = normalizeRelativePath(prefix);
    if (!normalized) return false;
    return normalized === "." || relativePath === normalized || relativePath.startsWith(`${normalized}/`);
  });
}

function assertPathInsideRepository(repositoryRoot, relativePath) {
  const resolved = path.resolve(repositoryRoot, relativePath);
  if (resolved !== repositoryRoot && !resolved.startsWith(`${repositoryRoot}${path.sep}`)) return false;
  let existing = resolved;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  try {
    const realRoot = fs.realpathSync(repositoryRoot);
    const realExisting = fs.realpathSync(existing);
    return realExisting === realRoot || realExisting.startsWith(`${realRoot}${path.sep}`);
  } catch (error) {
    return false;
  }
}

function jsonPointer(input, pointer) {
  if (pointer === "") return input;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) return undefined;
  let current = input;
  for (const segment of pointer.slice(1).split("/").map(value => value.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (!current || typeof current !== "object" || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

function valuesAtPointers(input, pointers) {
  const values = [];
  for (const pointer of pointers || []) {
    const value = jsonPointer(input, pointer);
    if (Array.isArray(value)) values.push(...value);
    else values.push(value);
  }
  return values;
}

function patchPaths(toolInput) {
  const command = toolInput && typeof toolInput.command === "string" ? toolInput.command : "";
  const paths = [];
  for (const line of command.split(/\r?\n/)) {
    const match = line.match(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/);
    if (match) paths.push(match[1]);
  }
  return unique(paths);
}

function obviousRetainedCommand(toolName, toolInput) {
  if (toolName !== "Bash" || !toolInput || typeof toolInput.command !== "string") return false;
  const command = toolInput.command;
  const patterns = [
    /\b(?:dispatch-runtime-controller|operate_dispatch_runtime)\.js["']?\s+(?:authorize-policy|issue|resume|recover-issuance|cancel-issuance|interrupt|revoke|complete)\b/i,
    /(^|[\n;&|])\s*git(?:\s+-C\s+\S+)?\s+(commit|push|merge|rebase|reset|tag|clean|checkout|switch)\b/i,
    /(^|[\n;&|])\s*gh\s+(pr\s+merge|release\s+(create|delete|upload)|repo\s+delete)\b/i,
    /(^|[\n;&|])\s*(npm|pnpm|yarn|cargo|gem|twine)\s+publish\b/i,
    /(^|[\n;&|])\s*docker\s+push\b/i,
    /(^|[\n;&|])\s*(kubectl\s+(apply|delete)|terraform\s+apply)\b/i
  ];
  return patterns.some(pattern => pattern.test(command));
}

function ruleInputMatches(rule, toolInput, repositoryRoot) {
  const match = rule.input_match || {};
  if (match.mode === "exact_sha256") {
    return (match.allowed_sha256 || []).includes(inputDigest(toolInput));
  }
  let paths;
  if (match.mode === "path_prefix") {
    paths = valuesAtPointers(toolInput, match.path_fields);
  } else if (match.mode === "patch_paths") {
    paths = patchPaths(toolInput);
  } else {
    return false;
  }
  if (paths.length === 0 || paths.some(value => typeof value !== "string")) return false;
  return paths.every(value => {
    const relative = normalizeRelativePath(value);
    return relative &&
      pathAllowed(relative, match.allowed_path_prefixes || []) &&
      assertPathInsideRepository(repositoryRoot, relative);
  });
}

function selectRule(policy, toolName, toolInput, repositoryRoot, admissions) {
  if (obviousRetainedCommand(toolName, toolInput)) {
    return { rule: null, code: "RETAINED_ACTION_BLOCKED" };
  }
  const matching = (policy.tool_rules || []).filter(rule =>
    rule.tool_name === toolName && ruleInputMatches(rule, toolInput, repositoryRoot));
  if (matching.length === 0) return { rule: null, code: "TOOL_POLICY_NO_MATCH" };
  if (matching.length > 1) return { rule: null, code: "TOOL_POLICY_AMBIGUOUS" };
  const rule = matching[0];
  const used = admissions.filter(item =>
    item.payload.decision === "allow" && item.payload.rule_id === rule.rule_id).length;
  if (used >= rule.max_uses) return { rule: null, code: "TOOL_RULE_BUDGET_EXHAUSTED" };
  return { rule, code: "TOOL_POLICY_MATCH" };
}

function admissionRequestDigest(lease, identity, hookInput, toolInputSha256) {
  return sha256(canonicalBytes({
    lease_id: lease.id,
    mission_id: identity.missionId,
    wave_id: identity.waveId,
    agent_id: identity.agentId,
    provider: identity.provider,
    session_id: identity.sessionId,
    provider_agent_id: identity.providerAgentId,
    tool_use_id: hookInput.tool_use_id,
    tool_name: hookInput.tool_name,
    tool_input_sha256: toolInputSha256
  }));
}

function admissionEvent(leaseRecord, checkpointRecord, policyRecord, identity, hookInput, descriptor) {
  const toolInputSha256 = inputDigest(hookInput.tool_input);
  const requestDigest = admissionRequestDigest(
    leaseRecord.payload,
    identity,
    hookInput,
    toolInputSha256
  );
  return {
    schema_version: "0.1",
    type: "ToolAdmissionEvent",
    id: admissionId(requestDigest, descriptor.decision, descriptor.reasonCodes),
    mission_id: identity.missionId,
    wave_id: identity.waveId,
    agent_id: identity.agentId,
    provider: identity.provider,
    session_binding: {
      session_id: identity.sessionId,
      provider_agent_id: identity.providerAgentId
    },
    lease_ref: clone(leaseRecord.ref),
    tool_policy_ref: clone(policyRecord.ref),
    checkpoint_ref: clone(checkpointRecord.ref),
    tool_use_id: String(hookInput.tool_use_id || "missing"),
    tool_name: String(hookInput.tool_name || "unknown"),
    operation_class: descriptor.operationClass || "observe",
    rule_id: descriptor.ruleId || "none",
    tool_input_sha256: toolInputSha256,
    ...(descriptor.methodBinding ? { method_binding: clone(descriptor.methodBinding) } : {}),
    request_sha256: requestDigest,
    sequence: descriptor.sequence,
    state_before: clone(descriptor.stateBefore),
    decision: descriptor.decision,
    reason_codes: unique(descriptor.reasonCodes),
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    },
    decided_at: descriptor.decidedAt
  };
}

function persistAdmission(options, event, publicationGuard) {
  assertValid(event, "tool-admission-event", "Tool admission event");
  return writeJsonArtifact(options, {
    missionId: event.mission_id,
    waveId: event.wave_id,
    kind: "tool-admission-events",
    artifactId: event.id,
    payload: event,
    createdAt: event.decided_at,
    publicationGuard
  });
}

function inMemoryDenial(code, details = {}) {
  return {
    status: "denied",
    decision: "deny",
    execution_authorized: false,
    release_authorized: false,
    reason_codes: [code],
    ...details
  };
}

function admitToolRequest(options, identity, hookInput) {
  assertProvider(identity.provider);
  if (!hookInput || hookInput.hook_event_name !== "PreToolUse") {
    return inMemoryDenial("HOOK_EVENT_INVALID");
  }
  if (!hookInput.tool_use_id || !hookInput.tool_name) {
    return inMemoryDenial("TOOL_REQUEST_IDENTITY_MISSING");
  }
  const selected = activeLease(options, identity, nowIso(options));
  if (selected.code !== "LEASE_ACTIVE") return inMemoryDenial(selected.code);
  const lock = dispatchLock(selected.view, selected.leaseRecord.payload.id);
  let methodDriftDenial = null;
  try {
    const refreshed = activeLease(options, identity, nowIso(options));
    if (refreshed.code !== "LEASE_ACTIVE") return inMemoryDenial(refreshed.code);
    const { checkpointRecord, leaseRecord, view } = refreshed;
    require("./method-control-broker").assertWorkReady(options, leaseRecord.ref, view);
    const ownershipCode = gatewayDispatchCode(options, view, leaseRecord.ref, hookInput.tool_use_id, "admit");
    if (ownershipCode) return inMemoryDenial(ownershipCode);
    const policyRecord = policyForLease(view, leaseRecord);
    const contextRecord = contextForLease(view, leaseRecord);
    const now = nowIso(options);
    policyValidity(policyRecord.payload, loadArtifactRef(view, leaseRecord.payload.context_pack_ref).payload, now);
    if (leaseRecord.payload.repository_binding.repository_key !== view.repository.key ||
        leaseRecord.payload.repository_binding.identity_fingerprint !== view.repository.identity_fingerprint) {
      return inMemoryDenial("LEASE_REPOSITORY_BINDING_MISMATCH");
    }

    const admissions = admissionRecords(view, leaseRecord.ref, identity.missionId, identity.waveId);
    const repeated = admissions.find(item => item.payload.tool_use_id === hookInput.tool_use_id);
    if (repeated) {
      const existingReplay = admissions.find(item =>
        item.payload.tool_use_id === hookInput.tool_use_id &&
        item.payload.decision === "deny" &&
        item.payload.reason_codes.includes("TOOL_REQUEST_REPLAY"));
      if (existingReplay) {
        return inMemoryDenial("TOOL_REQUEST_REPLAY", { admission_event: existingReplay.payload, admission_ref: existingReplay.ref });
      }
      const state = runtimeRepositoryState(view.repository.root);
      const replay = admissionEvent(leaseRecord, checkpointRecord, policyRecord, identity, hookInput, {
        decision: "deny",
        reasonCodes: ["TOOL_REQUEST_REPLAY"],
        operationClass: repeated.payload.operation_class,
        sequence: Math.max(0, ...admissions.map(item => item.payload.sequence)) + 1,
        stateBefore: state,
        decidedAt: now
      });
      renewRepositoryLease(lock);
      const replayRef = persistAdmission(options, replay);
      return inMemoryDenial("TOOL_REQUEST_REPLAY", { admission_event: replay, admission_ref: replayRef });
    }

    if (pendingAdmissions(view, leaseRecord).length > 0) {
      return inMemoryDenial("LEASE_TOOL_IN_FLIGHT");
    }
    const state = runtimeRepositoryState(view.repository.root);
    if (!sameRepositoryState(state, checkpointRecord.payload.repository_state)) {
      const event = admissionEvent(leaseRecord, checkpointRecord, policyRecord, identity, hookInput, {
        decision: "deny",
        reasonCodes: ["REPOSITORY_STATE_DRIFT"],
        sequence: Math.max(0, ...admissions.map(item => item.payload.sequence)) + 1,
        stateBefore: state,
        decidedAt: now
      });
      renewRepositoryLease(lock);
      const ref = persistAdmission(options, event);
      return inMemoryDenial("REPOSITORY_STATE_DRIFT", { admission_event: event, admission_ref: ref });
    }
    if (policyRecord.payload.repository_state.require_head_match === true &&
        state.head_commit !== leaseRecord.payload.initial_repository_state.head_commit) {
      return inMemoryDenial("REPOSITORY_HEAD_DRIFT");
    }
    const budgetHistory = admissionBudgetHistory(view, leaseRecord, contextRecord, policyRecord);
    const allowedCount = budgetHistory.filter(item => item.payload.decision === "allow").length;
    if (allowedCount >= leaseRecord.payload.request_budget ||
        allowedCount >= policyRecord.payload.max_total_admissions) {
      return inMemoryDenial("LEASE_REQUEST_BUDGET_EXHAUSTED");
    }
    const selection = selectRule(
      policyRecord.payload,
      hookInput.tool_name,
      hookInput.tool_input,
      view.repository.root,
      budgetHistory
    );
    if (contextRecord.payload.method_assignment?.broker?.schema_version === "0.2" && selection.code === "TOOL_RULE_BUDGET_EXHAUSTED") {
      return inMemoryDenial(selection.code);
    }
    const method = require("./method-deviation-gate").assessMethodRequest(options, leaseRecord, checkpointRecord, selection.rule, hookInput, view);
    const decision = selection.rule && !method.code ? "allow" : "deny";
    const event = admissionEvent(leaseRecord, checkpointRecord, policyRecord, identity, hookInput, {
      decision,
      reasonCodes: [method.code || (selection.rule ? "DISPATCH_TOOL_ADMITTED" : selection.code)],
      methodBinding: decision === "allow" ? method.binding : undefined,
      ruleId: selection.rule && selection.rule.rule_id,
      operationClass: selection.rule && selection.rule.operation_class,
      sequence: Math.max(0, ...admissions.map(item => item.payload.sequence)) + 1,
      stateBefore: state,
      decidedAt: now
    });
    renewRepositoryLease(lock);
    const ref = persistAdmission(options, event, decision === "allow" || method.drift ? () => {
      const current = activeLease(options, identity, nowIso(options));
      if (current.code !== "LEASE_ACTIVE" || !sameRef(current.leaseRecord.ref, leaseRecord.ref) ||
          !sameRef(current.checkpointRecord.ref, checkpointRecord.ref)) {
        throw new Error(`Dispatch publication no longer matches active authority: ${current.code}`);
      }
      const code = gatewayDispatchCode(options, current.view, leaseRecord.ref, hookInput.tool_use_id, "admit");
      if (code) throw new Error(code);
      const methodNow = require("./method-deviation-gate").assessMethodRequest(options, current.leaseRecord, current.checkpointRecord, selection.rule, hookInput, current.view);
      if (decision === "allow" ? (methodNow.code || inputDigest(methodNow.binding || null) !== inputDigest(method.binding || null)) :
        (!methodNow.drift || methodNow.code !== method.code)) throw new Error("METHOD_PUBLICATION_CHANGED");
      if (method.configured && !sameRepositoryState(runtimeRepositoryState(current.view.repository.root), state)) throw new Error("METHOD_REPOSITORY_STATE_CHANGED");
      policyValidity(policyRecord.payload, loadArtifactRef(current.view, leaseRecord.payload.context_pack_ref).payload, nowIso(options));
      return true;
    } : undefined);
    if (method.drift) methodDriftDenial = ref;
    return {
      status: decision === "allow" ? "admitted" : "denied",
      decision,
      execution_authorized: decision === "allow",
      release_authorized: false,
      reason_codes: clone(event.reason_codes),
      admission_event: event,
      admission_ref: ref,
      lease_ref: leaseRecord.ref
    };
  } finally {
    releaseRepositoryLease(lock);
    if (methodDriftDenial) require("./method-deviation-gate").respondToDrift(options, methodDriftDenial);
  }
}

function postToolCheckpoint(leaseRecord, previousCheckpoint, admissionRecord, repositoryState, descriptor) {
  const sequence = previousCheckpoint.payload.sequence + 1;
  const checkpoint = {
    schema_version: "0.2",
    type: "AgentExecutionCheckpoint",
    id: checkpointId(leaseRecord.payload, sequence, "post_tool"),
    mission_id: leaseRecord.payload.mission_id,
    wave_id: leaseRecord.payload.wave_id,
    agent_id: leaseRecord.payload.agent_id,
    provider: leaseRecord.payload.provider,
    session_binding: clone(leaseRecord.payload.session_binding),
    lease_ref: clone(leaseRecord.ref),
    sequence,
    checkpoint_kind: "post_tool",
    lease_status: descriptor.status,
    previous_checkpoint_ref: clone(previousCheckpoint.ref),
    tool_admission_ref: clone(admissionRecord.ref),
    repository_state: clone(repositoryState),
    execution_result: clone(descriptor.executionResult),
    reason_codes: unique(descriptor.reasonCodes),
    resume_authorized: false,
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    },
    recorded_at: descriptor.recordedAt
  };
  return checkpoint;
}

function toolCompletionResultDigest(hookInput) {
  return sha256(canonicalBytes({
    hook_event_name: hookInput.hook_event_name,
    tool_use_id: hookInput.tool_use_id,
    tool_name: hookInput.tool_name,
    tool_input_sha256: inputDigest(hookInput.tool_input),
    provider_result: hookInput.tool_response ?? hookInput.tool_output ?? hookInput.tool_result ?? null
  }));
}

function completeToolRequest(options, identity, hookInput) {
  assertProvider(identity.provider);
  if (!hookInput || !["PostToolUse", "PostToolUseFailure"].includes(hookInput.hook_event_name)) {
    return inMemoryDenial("HOOK_EVENT_INVALID");
  }
  const view = storeView(options);
  const matching = leaseRecords(view, identity.missionId, identity.waveId)
    .filter(item => bindingMatches(item.payload, identity));
  if (matching.length === 0) return inMemoryDenial("LEASE_NOT_FOUND");
  const initialCandidates = completionCandidates(view, matching, hookInput.tool_use_id);
  if (initialCandidates.unresolved.length === 0) {
    return inMemoryDenial(initialCandidates.completed.length > 0
      ? "TOOL_COMPLETION_REPLAY"
      : "TOOL_ADMISSION_NOT_FOUND");
  }
  if (initialCandidates.unresolved.length !== 1) {
    return inMemoryDenial("TOOL_COMPLETION_AMBIGUOUS");
  }
  const leaseRecord = initialCandidates.unresolved[0].leaseRecord;
  const lock = dispatchLock(view, leaseRecord.payload.id);
  try {
    const refreshed = storeView(options);
    const currentLease = leaseRecords(refreshed, identity.missionId, identity.waveId)
      .find(item => item.payload.id === leaseRecord.payload.id);
    if (!currentLease || !bindingMatches(currentLease.payload, identity)) {
      return inMemoryDenial("LEASE_BINDING_MISMATCH");
    }
    const refreshedCandidates = completionCandidates(
      refreshed,
      [currentLease],
      hookInput.tool_use_id
    );
    if (refreshedCandidates.unresolved.length === 0) {
      return inMemoryDenial(refreshedCandidates.completed.length > 0
        ? "TOOL_COMPLETION_REPLAY"
        : "TOOL_ADMISSION_NOT_FOUND");
    }
    if (refreshedCandidates.unresolved.length !== 1) {
      return inMemoryDenial("TOOL_COMPLETION_AMBIGUOUS");
    }
    const admission = refreshedCandidates.unresolved[0].admission;
    const ownershipCode = gatewayDispatchCode(options, refreshed, currentLease.ref, hookInput.tool_use_id, "complete");
    if (ownershipCode) return inMemoryDenial(ownershipCode);
    const completionToolName = String(hookInput.tool_name || "");
    const completionInputSha256 = inputDigest(hookInput.tool_input);
    if (completionToolName !== admission.payload.tool_name ||
        completionInputSha256 !== admission.payload.tool_input_sha256) {
      return inMemoryDenial("TOOL_COMPLETION_BINDING_MISMATCH");
    }
    const checkpoints = checkpointRecords(refreshed, currentLease.ref, identity.missionId, identity.waveId);
    const previous = checkpoints.at(-1);
    const state = runtimeRepositoryState(refreshed.repository.root);
    const policy = policyForLease(refreshed, currentLease).payload;
    const changed = !sameRepositoryState(state, admission.payload.state_before);
    const reasons = ["TOOL_EXECUTION_RECORDED"];
    let status = previous.payload.lease_status;
    if (status === "active") {
      if (policy.repository_state.require_head_match === true &&
          state.head_commit !== currentLease.payload.initial_repository_state.head_commit) {
        status = "blocked";
        reasons.push("REPOSITORY_HEAD_DRIFT");
      } else if (["observe", "repository_read"].includes(admission.payload.operation_class) && changed) {
        status = "blocked";
        reasons.push("READ_ONLY_TOOL_CHANGED_REPOSITORY");
      }
    } else {
      reasons.push("TOOL_COMPLETED_AFTER_LEASE_STATE_CHANGE");
    }
    const failed = hookInput.hook_event_name === "PostToolUseFailure";
    if (failed) {
      status = "blocked";
      reasons.push("PROVIDER_TOOL_FAILURE_REQUIRES_RECONCILIATION");
    }
    const providerResultSha256 = toolCompletionResultDigest(hookInput);
    const checkpoint = postToolCheckpoint(currentLease, previous, admission, state, {
      status,
      reasonCodes: reasons,
      executionResult: {
        status: failed ? "failed" : "succeeded",
        provider_result_sha256: providerResultSha256,
        external_effects: failed
          ? "unknown"
          : ["observe", "repository_read"].includes(admission.payload.operation_class)
            ? "none"
            : "repository_state_recorded"
      },
      recordedAt: nowIso(options)
    });
    renewRepositoryLease(lock);
    const checkpointRef = persistCheckpoint(options, checkpoint,
      dispatchCompletionGuard(options, currentLease, previous, hookInput.tool_use_id, "complete"));
    let executionAuthorized = status === "active";
    if (executionAuthorized) {
      try { executionAuthorized = activeLease(options, identity, nowIso(options)).code === "LEASE_ACTIVE"; }
      catch { executionAuthorized = false; }
    }
    return {
      status,
      execution_authorized: executionAuthorized,
      release_authorized: false,
      checkpoint,
      checkpoint_ref: checkpointRef,
      admission_ref: admission.ref
    };
  } finally {
    releaseRepositoryLease(lock);
  }
}

function cancelToolRequest(options, identity, descriptor) {
  assertProvider(identity.provider);
  if (!descriptor || !descriptor.toolUseId || !descriptor.toolName) {
    return inMemoryDenial("TOOL_CANCELLATION_IDENTITY_MISSING");
  }
  const view = storeView(options);
  const matching = leaseRecords(view, identity.missionId, identity.waveId)
    .filter(item => bindingMatches(item.payload, identity));
  if (matching.length === 0) return inMemoryDenial("LEASE_NOT_FOUND");
  const initialCandidates = completionCandidates(view, matching, descriptor.toolUseId);
  if (initialCandidates.unresolved.length === 0) {
    return inMemoryDenial(initialCandidates.completed.length > 0
      ? "TOOL_CANCELLATION_REPLAY"
      : "TOOL_ADMISSION_NOT_FOUND");
  }
  if (initialCandidates.unresolved.length !== 1) {
    return inMemoryDenial("TOOL_CANCELLATION_AMBIGUOUS");
  }
  const leaseRecord = initialCandidates.unresolved[0].leaseRecord;
  const lock = dispatchLock(view, leaseRecord.payload.id);
  try {
    const refreshed = storeView(options);
    const currentLease = leaseRecords(refreshed, identity.missionId, identity.waveId)
      .find(item => item.payload.id === leaseRecord.payload.id);
    if (!currentLease || !bindingMatches(currentLease.payload, identity)) {
      return inMemoryDenial("LEASE_BINDING_MISMATCH");
    }
    const candidates = completionCandidates(refreshed, [currentLease], descriptor.toolUseId);
    if (candidates.unresolved.length === 0) {
      return inMemoryDenial(candidates.completed.length > 0
        ? "TOOL_CANCELLATION_REPLAY"
        : "TOOL_ADMISSION_NOT_FOUND");
    }
    if (candidates.unresolved.length !== 1) {
      return inMemoryDenial("TOOL_CANCELLATION_AMBIGUOUS");
    }
    const admission = candidates.unresolved[0].admission;
    const ownershipCode = gatewayDispatchCode(options, refreshed, currentLease.ref, descriptor.toolUseId, "cancel");
    if (ownershipCode) return inMemoryDenial(ownershipCode);
    const toolInputSha256 = inputDigest(descriptor.toolInput);
    if (descriptor.toolName !== admission.payload.tool_name ||
        toolInputSha256 !== admission.payload.tool_input_sha256) {
      return inMemoryDenial("TOOL_CANCELLATION_BINDING_MISMATCH");
    }
    const previous = latestCheckpoint(refreshed, currentLease);
    if (previous.payload.lease_status !== "active") {
      return inMemoryDenial(`LEASE_${previous.payload.lease_status.toUpperCase()}`);
    }
    const state = runtimeRepositoryState(refreshed.repository.root);
    if (!sameRepositoryState(state, admission.payload.state_before) ||
        !sameRepositoryState(state, previous.payload.repository_state)) {
      return inMemoryDenial("TOOL_CANCELLATION_STATE_DRIFT");
    }
    const policy = policyForLease(refreshed, currentLease).payload;
    if (policy.repository_state.require_head_match === true &&
        state.head_commit !== currentLease.payload.initial_repository_state.head_commit) {
      return inMemoryDenial("REPOSITORY_HEAD_DRIFT");
    }
    const reasonCode = String(descriptor.reasonCode || "TOOL_EXECUTION_CANCELLED");
    const checkpoint = postToolCheckpoint(currentLease, previous, admission, state, {
      status: "active",
      reasonCodes: ["TOOL_EXECUTION_CANCELLED", reasonCode],
      executionResult: {
        status: "cancelled",
        provider_result_sha256: sha256(canonicalBytes({
          event: "ToolExecutionCancelled",
          tool_use_id: descriptor.toolUseId,
          tool_name: descriptor.toolName,
          tool_input_sha256: toolInputSha256,
          reason_code: reasonCode
        })),
        external_effects: "none"
      },
      recordedAt: nowIso(options)
    });
    renewRepositoryLease(lock);
    const checkpointRef = persistCheckpoint(options, checkpoint,
      dispatchCompletionGuard(options, currentLease, previous, descriptor.toolUseId, "cancel"));
    return {
      status: "cancelled",
      execution_authorized: false,
      release_authorized: false,
      checkpoint,
      checkpoint_ref: checkpointRef,
      admission_ref: admission.ref
    };
  } finally {
    releaseRepositoryLease(lock);
  }
}

function transitionCheckpoint(leaseRecord, previous, state, descriptor) {
  const sequence = previous.payload.sequence + 1;
  return {
    schema_version: "0.2",
    type: "AgentExecutionCheckpoint",
    id: checkpointId(leaseRecord.payload, sequence, descriptor.kind),
    mission_id: leaseRecord.payload.mission_id,
    wave_id: leaseRecord.payload.wave_id,
    agent_id: leaseRecord.payload.agent_id,
    provider: leaseRecord.payload.provider,
    session_binding: clone(leaseRecord.payload.session_binding),
    lease_ref: clone(leaseRecord.ref),
    sequence,
    checkpoint_kind: descriptor.kind,
    lease_status: descriptor.status,
    previous_checkpoint_ref: clone(previous.ref),
    tool_admission_ref: clone(NONE_REF),
    repository_state: clone(state),
    execution_result: {
      status: "not_applicable",
      provider_result_sha256: "none",
      external_effects: "none"
    },
    reason_codes: unique(descriptor.reasonCodes),
    resume_authorized: false,
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    },
    recorded_at: descriptor.recordedAt
  };
}

function loadLeaseById(options, leaseIdValue) {
  const view = storeView(options);
  const matches = listArtifacts(view, { kind: "agent-dispatch-leases" })
    .filter(item => item.payload.id === leaseIdValue);
  if (matches.length !== 1) throw new Error(`Expected one dispatch lease ${leaseIdValue}; found ${matches.length}.`);
  assertValid(matches[0].payload, "agent-dispatch-lease", "Agent dispatch lease");
  if (matches[0].payload.schema_version === "0.2") {
    const operation = issuanceProgresses(view).find(item => sameRef(item.request.ref, matches[0].payload.issuance_ref));
    issuanceNeed(operation && sameRef(operation.lease?.ref, matches[0].ref), "DISPATCH_ISSUANCE_REQUEST_REQUIRED");
    issuanceNeed(operation.status === "committed", operation.status === "cancelled" ? "DISPATCH_ISSUANCE_CANCELLED" : "DISPATCH_ISSUANCE_PENDING");
  }
  return { view, leaseRecord: matches[0] };
}

function transitionLease(options, leaseIdValue, descriptor) {
  const loaded = loadLeaseById(options, leaseIdValue);
  const lock = dispatchLock(loaded.view, leaseIdValue);
  try {
    const refreshed = loadLeaseById(options, leaseIdValue);
    if (descriptor.kind === "completion") {
      assertNoPendingIssuance(options, refreshed.view);
      require("./method-control-broker").assertSettled(options, refreshed.leaseRecord.payload, refreshed.view);
      require("./method-deviation-gate").assertMethodComplete(options, refreshed.leaseRecord.ref, refreshed.view);
    }
    const previous = latestCheckpoint(refreshed.view, refreshed.leaseRecord);
    const reconciled = reconciledFailureState(refreshed.view, refreshed.leaseRecord);
    if (reconciled.checkpoint_refs.length && descriptor.kind !== "revocation") {
      throw new Error("RECONCILED_FAILED_AGENT: reconciliation requires revocation, never completion or interruption for later resume.");
    }
    if (reconciled.checkpoint_refs.length && Date.parse(nowIso(options)) < Date.parse(reconciled.latest_settled_at)) {
      throw new Error("RECONCILED_FAILED_AGENT_REVOCATION_TIME_INVALID");
    }
    const historicalTerminalRevocation = descriptor.kind === "revocation" && reconciled.revocation_required &&
      ["completed", "superseded", "revoked"].includes(previous.payload.lease_status);
    if (descriptor.expectedStatuses && !descriptor.expectedStatuses.includes(previous.payload.lease_status) && !historicalTerminalRevocation) {
      throw new Error(`Lease ${leaseIdValue} is ${previous.payload.lease_status}, not ${descriptor.expectedStatuses.join(" or ")}.`);
    }
    const state = runtimeRepositoryState(refreshed.view.repository.root);
    const pending = pendingAdmissions(refreshed.view, refreshed.leaseRecord);
    const reasons = [...descriptor.reasonCodes];
    let status = descriptor.status;
    if (descriptor.requireStableState && !sameRepositoryState(state, previous.payload.repository_state)) {
      status = "blocked";
      reasons.push("REPOSITORY_STATE_DRIFT");
    }
    if (pending.length > 0) {
      status = "blocked";
      reasons.push("TOOL_IN_FLIGHT_AT_TRANSITION");
    }
    if (gatewayObligations(refreshed.view).some(item => sameRef(item.lease_ref, refreshed.leaseRecord.ref))) {
      status = "blocked";
      reasons.push("UNRESOLVED_GATEWAY_TRANSACTIONS");
    }
    if (unresolvedToolEffectRecords(refreshed.view, refreshed.leaseRecord).length > 0) {
      status = "blocked";
      reasons.push("UNRESOLVED_TOOL_EFFECTS");
    }
    const checkpoint = transitionCheckpoint(refreshed.leaseRecord, previous, state, {
      kind: descriptor.kind,
      status,
      reasonCodes: reasons,
      recordedAt: nowIso(options)
    });
    renewRepositoryLease(lock);
    const ref = persistCheckpoint(options, checkpoint, TERMINAL_LEASE_STATUSES.has(status) ? () => {
      const view = storeView(options);
      if (descriptor.kind === "completion") {
        assertNoPendingIssuance(options, view);
        require("./method-deviation-gate").assertMethodComplete(options, refreshed.leaseRecord.ref, view);
      }
      const currentFailure = reconciledFailureState(view, refreshed.leaseRecord);
      if (descriptor.kind !== "revocation" && currentFailure.checkpoint_refs.length) throw new Error("RECONCILED_FAILED_AGENT");
      if (currentFailure.checkpoint_refs.length && Date.parse(checkpoint.recorded_at) < Date.parse(currentFailure.latest_settled_at)) {
        throw new Error("RECONCILED_FAILED_AGENT_REVOCATION_TIME_INVALID");
      }
      if (!sameRef(latestCheckpoint(view, refreshed.leaseRecord).ref, previous.ref)) {
        throw new Error("DISPATCH_TRANSITION_CHECKPOINT_CHANGED");
      }
      if (gatewayObligations(view).some(item => sameRef(item.lease_ref, refreshed.leaseRecord.ref))) {
        throw new Error("UNRESOLVED_GATEWAY_TRANSACTIONS: gateway obligations block terminal lease publication.");
      }
      return true;
    } : undefined);
    return {
      status,
      execution_authorized: false,
      release_authorized: false,
      lease_ref: refreshed.leaseRecord.ref,
      checkpoint,
      checkpoint_ref: ref
    };
  } finally {
    releaseRepositoryLease(lock);
  }
}

function interruptLease(options, leaseIdValue, reasonCode = "EXECUTION_INTERRUPTED") {
  return transitionLease(options, leaseIdValue, {
    kind: "interruption",
    status: "interrupted",
    expectedStatuses: ["active"],
    requireStableState: true,
    reasonCodes: [reasonCode]
  });
}

function revokeLease(options, leaseIdValue, reasonCode = "LEASE_REVOKED") {
  return transitionLease(options, leaseIdValue, {
    kind: "revocation",
    status: "revoked",
    expectedStatuses: ["active", "interrupted", "blocked"],
    requireStableState: false,
    reasonCodes: [reasonCode]
  });
}

function completeLease(options, leaseIdValue, reasonCode = "EXECUTION_COMPLETED") {
  const loaded = loadLeaseById(options, leaseIdValue);
  assertNoPendingIssuance(options, loaded.view);
  require("./method-control-broker").assertSettled(options, loaded.leaseRecord.payload, loaded.view);
  require("./method-deviation-gate").assertMethodComplete(options, loaded.leaseRecord.ref, loaded.view);
  return transitionLease(options, leaseIdValue, {
    kind: "completion",
    status: "completed",
    expectedStatuses: ["active"],
    requireStableState: true,
    reasonCodes: [reasonCode]
  });
}

function resumeLease(options, leaseIdValue, bindings) {
  const loaded = loadLeaseById(options, leaseIdValue);
  return issueLeaseFromPolicyRef(options, loaded.leaseRecord.payload.tool_policy_ref, bindings, loaded.leaseRecord.ref, "resume");
}

function sessionStart(options, identity, hookInput) {
  const source = String(hookInput.source || "startup");
  const selected = activeLease(options, identity, nowIso(options));
  if (RESUME_SOURCES.has(source) && selected.leaseRecord &&
      selected.checkpointRecord && selected.checkpointRecord.payload.lease_status === "active") {
    const interrupted = interruptLease(options, selected.leaseRecord.payload.id, `SESSION_${source.toUpperCase()}`);
    return {
      status: interrupted.status,
      execution_authorized: false,
      release_authorized: false,
      reason_codes: [
        "FRESH_LEASE_REQUIRED_AFTER_SESSION_RESTART",
        ...interrupted.checkpoint.reason_codes
      ],
      prior_lease_ref: interrupted.lease_ref
    };
  }
  return {
    status: selected.code === "LEASE_ACTIVE" ? "active" : "blocked",
    execution_authorized: selected.code === "LEASE_ACTIVE",
    release_authorized: false,
    reason_codes: [selected.code],
    lease_ref: selected.leaseRecord ? selected.leaseRecord.ref : clone(NONE_REF)
  };
}

function dispatchStatus(options, filters = {}) {
  const view = storeView(options);
  return projectDispatchStatus(view, filters);
}

// Read-only replay. No admission/issuance path accepts an earlier manifest.
function historicalDispatchStatus(options, snapshot, filters = {}) {
  const { loadVerifiedStore } = require("./campaign-supervisor");
  const { historicalSettlementStore, historicalRuntimeView } = require("./effect-settlement-proof");
  const store = loadVerifiedStore(options.repository, options.artifactRoot || path.join(options.repository, ".cannae", "artifacts"));
  const current = snapshot.revision === store.manifest.manifest_revision && snapshot.sha256 === store.verification.manifest_sha256;
  const selected = current ? store : historicalSettlementStore(store, snapshot.revision, snapshot.sha256);
  return projectDispatchStatus(historicalRuntimeView(selected), filters);
}

function projectDispatchStatus(view, filters) {
  const runtime = issuance.runtimeDigest();
  const operations = issuanceProgresses(view).filter(item => (!filters.missionId || item.planned.mission_id === filters.missionId) &&
    (!filters.waveId || item.planned.wave_id === filters.waveId) && (!filters.agentId || item.planned.agent_id === filters.agentId))
    .map(item => ({ issuance_ref: item.request.ref, resolution_ref: item.resolution?.ref || clone(NONE_REF), status: item.status,
      lease_ref: item.lease?.ref || clone(NONE_REF), baseline_ref: item.baseline?.ref || clone(NONE_REF),
      supersession_ref: item.supersession?.ref || clone(NONE_REF),
      runtime_source_current: item.request.payload.runtime_sha256 === runtime,
      planned_lease_id: item.planned.id, previous_lease_ref: item.planned.previous_lease_ref,
      mission_id: item.planned.mission_id, wave_id: item.planned.wave_id, agent_id: item.planned.agent_id,
      provider: item.planned.provider, session_binding: item.planned.session_binding, expires_at: item.planned.expires_at,
      lease_published: Boolean(item.lease), baseline_published: Boolean(item.baseline), supersession_published: Boolean(item.supersession),
      ...issuance.AUTHORITY }));
  const obligations = gatewayObligations(view);
  const scopedObligations = obligations.filter(item => {
    const request = loadArtifactRef(view, item.request_ref, "tool-gateway-request").payload;
    return (!filters.missionId || request.mission_id === filters.missionId) &&
      (!filters.waveId || request.wave_id === filters.waveId) && (!filters.agentId || request.agent_id === filters.agentId);
  });
  const records = leaseRecords(view, filters.missionId, filters.waveId)
    .filter(item => !filters.agentId || item.payload.agent_id === filters.agentId)
    .map(leaseRecord => {
      const checkpoint = latestCheckpoint(view, leaseRecord);
      const unknownEffects = unresolvedToolEffectRecords(view, leaseRecord);
      const reconciled = reconciledFailureState(view, leaseRecord);
      const gatewayTransactions = obligations.filter(item => sameRef(item.lease_ref, leaseRecord.ref));
      return {
        lease_id: leaseRecord.payload.id,
        lease_ref: leaseRecord.ref,
        previous_lease_ref: leaseRecord.payload.previous_lease_ref,
        mission_id: leaseRecord.payload.mission_id,
        wave_id: leaseRecord.payload.wave_id,
        agent_id: leaseRecord.payload.agent_id,
        provider: leaseRecord.payload.provider,
        session_binding: clone(leaseRecord.payload.session_binding),
        status: checkpoint.payload.lease_status,
        legacy_result_only: leaseRecord.payload.schema_version === "0.1",
        checkpoint_sequence: checkpoint.payload.sequence,
        pending_tool_requests: pendingAdmissions(view, leaseRecord).length,
        unresolved_tool_effects: unknownEffects.length,
        unresolved_effect_checkpoint_refs: unknownEffects.map(item => clone(item.ref)),
        reconciled_failed_effects: reconciled.checkpoint_refs.length,
        reconciled_effect_checkpoint_refs: reconciled.checkpoint_refs.map(item => clone(item)),
        failed_effect_revocation_required: reconciled.revocation_required,
        unresolved_gateway_transactions: gatewayTransactions.length,
        gateway_obligations: gatewayTransactions,
        expires_at: leaseRecord.payload.expires_at,
        release_authorized: false
      };
    });
  return {
    schema_version: "0.1",
    type: "DispatchRuntimeStatus",
    repository: {
      key: view.repository.key,
      identity_fingerprint: view.repository.identity_fingerprint,
      head_commit: view.repository.head_commit
    },
    leases: records,
    issuances: operations,
    unresolved_issuances: operations.filter(item => item.status === "pending"),
    unresolved_gateway_obligations: scopedObligations,
    artifact_store: view.verification,
    release_authorized: false
  };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positional = [];
  const valueFlags = new Set([
    "repository", "artifact-root", "policy", "policy-id", "mission", "wave", "agent", "provider",
    "session", "provider-agent", "lease", "reason", "at", "issuance"
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith("--") && valueFlags.has(arg.slice(2))) {
      index += 1;
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (index >= rest.length || rest[index].startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (Object.hasOwn(options, key)) throw new Error(`${arg} must not be repeated.`);
      options[key] = rest[index];
    } else {
      positional.push(arg);
    }
  }
  return { command, options, positional };
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (["recover-issuance", "cancel-issuance"].includes(parsed.command) &&
        (parsed.positional.length || Object.keys(parsed.options).some(key => !["repository", "artifactRoot", "issuance", ...(parsed.command === "cancel-issuance" ? ["reason"] : [])].includes(key)))) {
      throw new Error("Issuance recovery and cancellation accept only exact repository, artifact root, issuance ID and cancellation reason; no clock or binding overrides.");
    }
    const options = {
      repository: path.resolve(required(parsed.options.repository, "--repository")),
      artifactRoot: parsed.options.artifactRoot ? path.resolve(parsed.options.artifactRoot) : undefined,
      now: parsed.options.at
    };
    let result;
    if (parsed.command === "authorize-policy") {
      const draft = JSON.parse(fs.readFileSync(path.resolve(required(parsed.options.policy, "--policy")), "utf8"));
      if (parsed.options.provider && draft.provider !== parsed.options.provider) {
        throw new Error("--provider does not match the dispatch policy draft.");
      }
      result = authorizeDispatchPolicy(options, draft);
    } else if (parsed.command === "issue") {
      result = issueLease(options, required(parsed.options.policyId, "--policy-id"), {
        sessionId: required(parsed.options.session, "--session"),
        providerAgentId: parsed.options.providerAgent || "main"
      });
    } else if (parsed.command === "interrupt") {
      result = interruptLease(options, required(parsed.options.lease, "--lease"), parsed.options.reason);
    } else if (parsed.command === "revoke") {
      result = revokeLease(options, required(parsed.options.lease, "--lease"), parsed.options.reason);
    } else if (parsed.command === "complete") {
      result = completeLease(options, required(parsed.options.lease, "--lease"), parsed.options.reason);
    } else if (parsed.command === "resume") {
      result = resumeLease(options, required(parsed.options.lease, "--lease"), {
        sessionId: required(parsed.options.session, "--session"),
        providerAgentId: parsed.options.providerAgent || "main"
      });
    } else if (parsed.command === "status") {
      result = dispatchStatus(options, {
        missionId: parsed.options.mission,
        waveId: parsed.options.wave,
        agentId: parsed.options.agent
      });
    } else if (parsed.command === "recover-issuance") {
      result = recoverDispatchIssuance(options, required(parsed.options.issuance, "--issuance"));
    } else if (parsed.command === "cancel-issuance") {
      result = cancelDispatchIssuance(options, required(parsed.options.issuance, "--issuance"), required(parsed.options.reason, "--reason"));
    } else if (parsed.command === "hash-input") {
      const inputPath = required(parsed.positional[0], "JSON input path");
      result = { sha256: inputDigest(JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"))) };
    } else {
      throw new Error(
        "Usage: node dispatch-runtime-controller.js <authorize-policy|issue|interrupt|revoke|complete|resume|recover-issuance|cancel-issuance|status|hash-input> " +
        "--repository <repo> [--artifact-root <root>] ..."
      );
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (["blocked", "denied"].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

module.exports = {
  inspectDispatchHistory,
  assertNoPendingIssuance,
  compiledPolicyContext,
  withDispatchControlLock,
  historicalDispatchStatus,
  assertReconciledFailureRevocations,
  unknownToolEffectCheckpointRefs,
  withDispatchIssuanceLock,
  NONE_REF,
  activeLease,
  admitToolRequest,
  authorizeDispatchPolicy,
  cancelToolRequest,
  cancelDispatchIssuance,
  canonicalBytes,
  completeLease,
  completeToolRequest,
  dispatchStatus,
  dispatchLeaseHistory,
  inputDigest,
  interruptLease,
  issueLease,
  recoverDispatchIssuance,
  resumeLease,
  revokeLease,
  runtimeRepositoryState,
  sameRepositoryState,
  sessionStart,
  toolCompletionResultDigest
};

if (require.main === module) main();
