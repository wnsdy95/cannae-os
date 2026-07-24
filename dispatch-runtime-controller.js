#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  resolveRepository,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const {
  acquireRepositoryLease,
  releaseRepositoryLease,
  renewRepositoryLease
} = require("./repository-lease");
const { computeRepositoryState } = require("./verification-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");

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
  const verification = verifyRepositoryArtifacts({
    repositoryPath: repository.root,
    artifactRoot
  });
  if (!verification.valid) {
    throw new Error(`Repository artifact store is invalid: ${verification.issues.map(item => item.code).join(", ")}`);
  }
  const namespacePath = path.join(artifactRoot, "repositories", repository.key);
  const manifestPath = path.join(namespacePath, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return {
    artifactRoot,
    manifest,
    namespacePath,
    repository,
    verification
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
    createdAt: descriptor.createdAt
  });
  return artifactRef(result, descriptor.artifactId);
}

function contextBundle(options, policy, settings = {}) {
  const view = storeView(options);
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
    createdAt: policy.approved_at
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

function persistCheckpoint(options, checkpoint) {
  assertValid(checkpoint, "agent-execution-checkpoint", "Agent execution checkpoint");
  return writeJsonArtifact(options, {
    missionId: checkpoint.mission_id,
    waveId: checkpoint.wave_id,
    kind: "agent-execution-checkpoints",
    artifactId: checkpoint.id,
    payload: checkpoint,
    createdAt: checkpoint.recorded_at
  });
}

function createLeaseFromRecord(
  options,
  policyRecord,
  bindings,
  previousLeaseRef = NONE_REF,
  issuanceReason = "initial",
  coordinationLock
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
  const nonterminal = repositoryHistory.map(item => ({
    item,
    checkpoint: latestCheckpoint(bundle.view, item)
  })).filter(entry => !TERMINAL_LEASE_STATUSES.has(entry.checkpoint.payload.lease_status));
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
  renewRepositoryLease(coordinationLock);
  const leaseRef = writeJsonArtifact(options, {
    missionId: lease.mission_id,
    waveId: lease.wave_id,
    kind: "agent-dispatch-leases",
    artifactId: lease.id,
    payload: lease,
    createdAt: lease.issued_at
  });
  const checkpoint = initialCheckpoint(lease, leaseRef, repositoryState, now);
  renewRepositoryLease(coordinationLock);
  const checkpointRef = persistCheckpoint(options, checkpoint);
  const verification = verifyRepositoryArtifacts({
    repositoryPath: options.repository,
    artifactRoot: options.artifactRoot || path.join(resolveRepository(options.repository).root, ".cannae", "artifacts")
  });
  if (!verification.valid) throw new Error("Artifact store failed verification after dispatch lease issuance.");
  return {
    status: "active",
    execution_authorized: true,
    release_authorized: false,
    lease,
    lease_ref: leaseRef,
    checkpoint,
    checkpoint_ref: checkpointRef,
    artifact_store: verification
  };
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
  const firstPolicy = loadArtifactRef(firstView, policyRef, "dispatch-tool-policy");
  const lock = dispatchIssuanceLock(firstView);
  try {
    const view = storeView(options);
    const policyRecord = loadArtifactRef(view, policyRef, "dispatch-tool-policy");
    return createLeaseFromRecord(
      options,
      policyRecord,
      bindings,
      previousLeaseRef,
      issuanceReason,
      lock
    );
  } finally {
    releaseRepositoryLease(lock);
  }
}

function issueLease(options, policyIdValue, bindings) {
  const loaded = loadPolicyById(options, policyIdValue);
  return issueLeaseFromPolicyRef(options, loaded.policyRecord.ref, bindings);
}

function leaseRecords(view, missionId, waveId) {
  return listArtifacts(view, {
    missionId,
    waveId,
    kind: "agent-dispatch-leases"
  }).map(item => {
    assertValid(item.payload, "agent-dispatch-lease", `Dispatch lease ${item.payload.id || "unknown"}`);
    return item;
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

function pendingAdmissions(view, leaseRecord) {
  const checkpoints = checkpointRecords(
    view,
    leaseRecord.ref,
    leaseRecord.payload.mission_id,
    leaseRecord.payload.wave_id
  );
  const completed = completedAdmissionIds(checkpoints);
  return admissionRecords(
    view,
    leaseRecord.ref,
    leaseRecord.payload.mission_id,
    leaseRecord.payload.wave_id
  ).filter(item => item.payload.decision === "allow" && !completed.has(item.payload.id));
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
    const admissions = admissionRecords(
      view,
      leaseRecord.ref,
      leaseRecord.payload.mission_id,
      leaseRecord.payload.wave_id
    ).filter(item =>
      item.payload.tool_use_id === toolUseId &&
      item.payload.decision === "allow");
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
  const view = storeView(options);
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

function persistAdmission(options, event) {
  assertValid(event, "tool-admission-event", "Tool admission event");
  return writeJsonArtifact(options, {
    missionId: event.mission_id,
    waveId: event.wave_id,
    kind: "tool-admission-events",
    artifactId: event.id,
    payload: event,
    createdAt: event.decided_at
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
  try {
    const refreshed = activeLease(options, identity, nowIso(options));
    if (refreshed.code !== "LEASE_ACTIVE") return inMemoryDenial(refreshed.code);
    const { checkpointRecord, leaseRecord, view } = refreshed;
    const policyRecord = policyForLease(view, leaseRecord);
    contextForLease(view, leaseRecord);
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
    const allowedCount = admissions.filter(item => item.payload.decision === "allow").length;
    if (allowedCount >= leaseRecord.payload.request_budget ||
        allowedCount >= policyRecord.payload.max_total_admissions) {
      return inMemoryDenial("LEASE_REQUEST_BUDGET_EXHAUSTED");
    }
    const selection = selectRule(
      policyRecord.payload,
      hookInput.tool_name,
      hookInput.tool_input,
      view.repository.root,
      admissions
    );
    const decision = selection.rule ? "allow" : "deny";
    const event = admissionEvent(leaseRecord, checkpointRecord, policyRecord, identity, hookInput, {
      decision,
      reasonCodes: [selection.rule ? "DISPATCH_TOOL_ADMITTED" : selection.code],
      ruleId: selection.rule && selection.rule.rule_id,
      operationClass: selection.rule && selection.rule.operation_class,
      sequence: Math.max(0, ...admissions.map(item => item.payload.sequence)) + 1,
      stateBefore: state,
      decidedAt: now
    });
    renewRepositoryLease(lock);
    const ref = persistAdmission(options, event);
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
    const providerResultSha256 = sha256(canonicalBytes({
      hook_event_name: hookInput.hook_event_name,
      tool_use_id: hookInput.tool_use_id,
      tool_name: hookInput.tool_name,
      tool_input_sha256: completionInputSha256,
      provider_result: hookInput.tool_response ??
        hookInput.tool_output ??
        hookInput.tool_result ??
        null
    }));
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
    const checkpointRef = persistCheckpoint(options, checkpoint);
    return {
      status,
      execution_authorized: status === "active",
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
    const checkpointRef = persistCheckpoint(options, checkpoint);
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
  return { view, leaseRecord: matches[0] };
}

function transitionLease(options, leaseIdValue, descriptor) {
  const loaded = loadLeaseById(options, leaseIdValue);
  const lock = dispatchLock(loaded.view, leaseIdValue);
  try {
    const refreshed = loadLeaseById(options, leaseIdValue);
    const previous = latestCheckpoint(refreshed.view, refreshed.leaseRecord);
    if (descriptor.expectedStatuses && !descriptor.expectedStatuses.includes(previous.payload.lease_status)) {
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
    const checkpoint = transitionCheckpoint(refreshed.leaseRecord, previous, state, {
      kind: descriptor.kind,
      status,
      reasonCodes: reasons,
      recordedAt: nowIso(options)
    });
    renewRepositoryLease(lock);
    const ref = persistCheckpoint(options, checkpoint);
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
  const lock = dispatchLock(loaded.view, leaseIdValue);
  let oldLease;
  let policy;
  let oldLeaseRef;
  try {
    const refreshed = loadLeaseById(options, leaseIdValue);
    oldLease = refreshed.leaseRecord;
    const previous = latestCheckpoint(refreshed.view, oldLease);
    if (previous.payload.lease_status !== "interrupted") {
      throw new Error("Only an interrupted lease can be resumed.");
    }
    if (pendingAdmissions(refreshed.view, oldLease).length > 0) {
      throw new Error("Interrupted lease has an unresolved admitted tool request.");
    }
    const state = runtimeRepositoryState(refreshed.view.repository.root);
    if (!sameRepositoryState(state, previous.payload.repository_state)) {
      throw new Error("Repository state changed after the interruption checkpoint.");
    }
    policy = policyForLease(refreshed.view, oldLease).payload;
    const context = contextForLease(refreshed.view, oldLease).payload;
    policyValidity(policy, context, nowIso(options));
    const superseded = transitionCheckpoint(oldLease, previous, state, {
      kind: "supersession",
      status: "superseded",
      reasonCodes: ["LEASE_SUPERSEDED_BY_RESUME"],
      recordedAt: nowIso(options)
    });
    renewRepositoryLease(lock);
    persistCheckpoint(options, superseded);
    oldLeaseRef = oldLease.ref;
  } finally {
    releaseRepositoryLease(lock);
  }
  return issueLeaseFromPolicyRef(
    options,
    oldLease.payload.tool_policy_ref,
    bindings,
    oldLeaseRef,
    "resume"
  );
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
  const records = leaseRecords(view, filters.missionId, filters.waveId)
    .filter(item => !filters.agentId || item.payload.agent_id === filters.agentId)
    .map(leaseRecord => {
      const checkpoint = latestCheckpoint(view, leaseRecord);
      return {
        lease_id: leaseRecord.payload.id,
        mission_id: leaseRecord.payload.mission_id,
        wave_id: leaseRecord.payload.wave_id,
        agent_id: leaseRecord.payload.agent_id,
        provider: leaseRecord.payload.provider,
        session_binding: clone(leaseRecord.payload.session_binding),
        status: checkpoint.payload.lease_status,
        checkpoint_sequence: checkpoint.payload.sequence,
        pending_tool_requests: pendingAdmissions(view, leaseRecord).length,
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
    "session", "provider-agent", "lease", "reason", "at"
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith("--") && valueFlags.has(arg.slice(2))) {
      index += 1;
      if (index >= rest.length) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = rest[index];
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
    } else if (parsed.command === "hash-input") {
      const inputPath = required(parsed.positional[0], "JSON input path");
      result = { sha256: inputDigest(JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"))) };
    } else {
      throw new Error(
        "Usage: node dispatch-runtime-controller.js <authorize-policy|issue|interrupt|revoke|complete|resume|status|hash-input> " +
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

if (require.main === module) main();

module.exports = {
  NONE_REF,
  activeLease,
  admitToolRequest,
  authorizeDispatchPolicy,
  cancelToolRequest,
  canonicalBytes,
  completeLease,
  completeToolRequest,
  dispatchStatus,
  inputDigest,
  interruptLease,
  issueLease,
  resumeLease,
  revokeLease,
  runtimeRepositoryState,
  sameRepositoryState,
  sessionStart
};
