#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
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
const {
  NONE_REF,
  activeLease,
  admitToolRequest,
  cancelToolRequest,
  canonicalBytes,
  completeToolRequest,
  inputDigest,
  interruptLease,
  runtimeRepositoryState,
  sameRepositoryState
} = require("./dispatch-runtime-controller");
const { validatePayload } = require("./validator-cli-prototype/validate");
const {
  verifyGatewayPrincipalEvidence
} = require("./gateway-identity-adapter");
const {
  verifyProtectedExecutionBundle
} = require("./protected-execution-evidence");

const TERMINAL_STATES = new Set(["denied", "committed", "aborted", "recovery_required"]);
const KINDS = Object.freeze({
  request: "tool-gateway-requests",
  decision: "tool-gateway-decisions",
  receipt: "tool-execution-receipts",
  event: "tool-gateway-transaction-events"
});
const TRANSITIONS = Object.freeze({
  received: new Set(["authorized", "denied"]),
  authorized: new Set(["executing", "aborted", "recovery_required"]),
  executing: new Set(["committed", "recovery_required"])
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function objectDigest(value) {
  return sha256(canonicalBytes(value));
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function nowIso(options = {}) {
  return options.now || new Date().toISOString();
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`);
  return parsed;
}

function assertIdentifier(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(String(value || ""))) {
    throw new Error(`${label} must be a path-safe identifier.`);
  }
  return String(value);
}

function assertSha256(value, label) {
  if (!/^[a-f0-9]{64}$/.test(String(value || ""))) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return String(value);
}

function assertValid(payload, type, label) {
  const validation = validatePayload(payload, type);
  const failures = validation.issues.filter(item =>
    item.severity === "error" || item.severity === "critical");
  if (failures.length > 0) {
    throw new Error(`${label} failed validation: ${unique(failures.map(item => item.code)).join(", ")}`);
  }
  return validation;
}

function artifactRef(result, artifactId) {
  return {
    artifact_id: artifactId,
    relative_path: result.relative_path,
    sha256: result.sha256
  };
}

function storeView(options) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(
    options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")
  );
  const verification = verifyRepositoryArtifacts({
    repositoryPath: repository.root,
    artifactRoot
  });
  if (!verification.valid) {
    throw new Error(
      `Repository artifact store is invalid: ${verification.issues.map(item => item.code).join(", ")}`
    );
  }
  const namespacePath = path.join(artifactRoot, "repositories", repository.key);
  const manifestPath = path.join(namespacePath, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return { artifactRoot, manifest, namespacePath, repository, verification };
}

function safeArtifactPath(view, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]+/).includes("..")) {
    throw new Error("Artifact reference path is unsafe.");
  }
  const candidate = path.resolve(view.artifactRoot, relativePath);
  if (candidate !== view.artifactRoot &&
      !candidate.startsWith(`${view.artifactRoot}${path.sep}`)) {
    throw new Error("Artifact reference resolves outside the artifact root.");
  }
  return candidate;
}

function loadEntry(view, entry) {
  const artifactPath = safeArtifactPath(view, entry.relative_path);
  const bytes = fs.readFileSync(artifactPath);
  if (sha256(bytes) !== entry.sha256) {
    throw new Error(`Artifact bytes changed: ${entry.relative_path}`);
  }
  return JSON.parse(bytes.toString("utf8"));
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

function loadArtifactRef(view, ref, expectedType) {
  if (!ref || isNoneRef(ref)) throw new Error("A concrete artifact reference is required.");
  const matches = (view.manifest.artifacts || []).filter(entry =>
    entry.artifact_id === ref.artifact_id &&
    entry.relative_path === ref.relative_path &&
    entry.sha256 === ref.sha256);
  if (matches.length !== 1) {
    throw new Error(`Artifact reference is not uniquely retained: ${ref.artifact_id}`);
  }
  const payload = loadEntry(view, matches[0]);
  if (expectedType) assertValid(payload, expectedType, expectedType);
  return { entry: matches[0], payload, ref: clone(ref) };
}

function writeJsonArtifact(options, gatewayLease, descriptor) {
  renewRepositoryLease(gatewayLease);
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(
    options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")
  );
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
  return { ref: artifactRef(result, descriptor.artifactId), result };
}

function gatewayLock(options, idempotencyKey) {
  const view = storeView(options);
  assertSha256(idempotencyKey, "idempotency_key");
  const lockRoot = path.join(
    view.namespacePath,
    ".protected-tool-gateway",
    "transaction-store"
  );
  return acquireRepositoryLease(lockRoot, {
    leaseTimeoutMs: options.lockTimeoutMs || 5000,
    leaseTtlMs: options.lockTtlMs || 30000
  });
}

function authority() {
  return {
    human_final_decision_authority: "USER",
    self_approval_prohibited: true,
    release_authorized: false
  };
}

function coordination(view) {
  const fencingToken = view.manifest.coordination &&
    Number.isSafeInteger(view.manifest.coordination.fencing_token)
    ? view.manifest.coordination.fencing_token
    : 1;
  return {
    backend: "shared_filesystem_reference",
    manifest_revision: Math.max(1, view.manifest.manifest_revision || 1),
    fencing_token: Math.max(1, fencingToken)
  };
}

function deterministicId(prefix, transactionId, suffix = "") {
  const digest = sha256(Buffer.from(`${transactionId}:${suffix}`)).slice(0, 24);
  return `${prefix}-${digest}`;
}

function identityFromRequest(request) {
  return {
    missionId: request.mission_id,
    waveId: request.wave_id,
    agentId: request.agent_id,
    provider: request.provider,
    sessionId: request.authenticated_principal.session_id,
    providerAgentId: request.authenticated_principal.provider_agent_id
  };
}

function recordsForTransaction(view, transactionId) {
  const requestRecords = listArtifacts(view, { kind: KINDS.request })
    .filter(item => item.payload.transaction_id === transactionId);
  const decisionRecords = listArtifacts(view, { kind: KINDS.decision })
    .filter(item => item.payload.transaction_id === transactionId);
  const receiptRecords = listArtifacts(view, { kind: KINDS.receipt })
    .filter(item => item.payload.transaction_id === transactionId);
  const events = listArtifacts(view, { kind: KINDS.event })
    .filter(item => item.payload.transaction_id === transactionId)
    .sort((left, right) => left.payload.sequence - right.payload.sequence);

  if (requestRecords.length > 1 || decisionRecords.length > 1 || receiptRecords.length > 1) {
    throw new Error(`Gateway transaction ${transactionId} has duplicate singleton artifacts.`);
  }
  for (const item of requestRecords) {
    assertValid(item.payload, "tool-gateway-request", `Gateway request ${item.payload.id}`);
  }
  for (const item of decisionRecords) {
    assertValid(item.payload, "tool-gateway-decision", `Gateway decision ${item.payload.id}`);
  }
  for (const item of receiptRecords) {
    assertValid(item.payload, "tool-execution-receipt", `Execution receipt ${item.payload.id}`);
  }
  for (const item of events) {
    assertValid(item.payload, "tool-gateway-transaction-event", `Gateway event ${item.payload.id}`);
  }

  const request = requestRecords[0] || null;
  const decision = decisionRecords[0] || null;
  const receipt = receiptRecords[0] || null;
  if (request) {
    for (let index = 0; index < events.length; index += 1) {
      const current = events[index];
      if (current.payload.sequence !== index + 1 ||
          !sameRef(current.payload.request_ref, request.ref)) {
        throw new Error(`Gateway transaction ${transactionId} has a broken event sequence.`);
      }
      if (index === 0) {
        if (!isNoneRef(current.payload.previous_event_ref) ||
            current.payload.state !== "received") {
          throw new Error(`Gateway transaction ${transactionId} has an invalid first event.`);
        }
      } else {
        const previous = events[index - 1];
        if (!sameRef(current.payload.previous_event_ref, previous.ref) ||
            !(TRANSITIONS[previous.payload.state] || new Set()).has(current.payload.state)) {
          throw new Error(`Gateway transaction ${transactionId} has an invalid state transition.`);
        }
        if (timestamp(current.payload.recorded_at, "event recorded_at") <
            timestamp(previous.payload.recorded_at, "previous event recorded_at")) {
          throw new Error(`Gateway transaction ${transactionId} has non-monotonic event time.`);
        }
      }
      if (current.payload.mission_id !== request.payload.mission_id ||
          current.payload.wave_id !== request.payload.wave_id ||
          current.payload.agent_id !== request.payload.agent_id ||
          !sameRef(current.payload.identity_policy_ref, request.payload.identity_policy_ref) ||
          !sameRef(current.payload.identity_challenge_ref, request.payload.identity_challenge_ref) ||
          !sameRef(current.payload.principal_evidence_ref, request.payload.principal_evidence_ref) ||
          current.payload.idempotency_key !== request.payload.idempotency_key ||
          current.payload.tool_input_sha256 !== request.payload.tool_call.tool_input_sha256 ||
          current.payload.repository_binding.repository_key !== request.payload.repository_binding.repository_key ||
          current.payload.repository_binding.identity_fingerprint !==
            request.payload.repository_binding.identity_fingerprint) {
        throw new Error(`Gateway transaction ${transactionId} changed immutable request bindings.`);
      }
    }
  } else if (events.length > 0 || decision || receipt) {
    throw new Error(`Gateway transaction ${transactionId} has artifacts without a request.`);
  }

  if (decision && (!request || !sameRef(decision.payload.request_ref, request.ref))) {
    throw new Error(`Gateway transaction ${transactionId} decision is not request-bound.`);
  }
  if (decision && (
      !sameRef(decision.payload.identity_policy_ref, request.payload.identity_policy_ref) ||
      !sameRef(decision.payload.identity_challenge_ref, request.payload.identity_challenge_ref) ||
      !sameRef(decision.payload.principal_evidence_ref, request.payload.principal_evidence_ref))) {
    throw new Error(`Gateway transaction ${transactionId} decision changed identity evidence.`);
  }
  if (receipt && (!request || !decision ||
      !sameRef(receipt.payload.request_ref, request.ref) ||
      !sameRef(receipt.payload.decision_ref, decision.ref))) {
    throw new Error(`Gateway transaction ${transactionId} receipt is not request-and-decision-bound.`);
  }
  if (receipt && (
      !sameRef(receipt.payload.identity_policy_ref, request.payload.identity_policy_ref) ||
      !sameRef(receipt.payload.identity_challenge_ref, request.payload.identity_challenge_ref) ||
      !sameRef(receipt.payload.principal_evidence_ref, request.payload.principal_evidence_ref))) {
    throw new Error(`Gateway transaction ${transactionId} receipt changed identity evidence.`);
  }
  for (const event of events) {
    if (!isNoneRef(event.payload.decision_ref) &&
        (!decision || !sameRef(event.payload.decision_ref, decision.ref))) {
      throw new Error(`Gateway transaction ${transactionId} event has a foreign decision.`);
    }
    if (!isNoneRef(event.payload.receipt_ref) &&
        (!receipt || !sameRef(event.payload.receipt_ref, receipt.ref))) {
      throw new Error(`Gateway transaction ${transactionId} event has a foreign receipt.`);
    }
  }

  return {
    request,
    decision,
    receipt,
    events,
    latest: events.at(-1) || null
  };
}

function snapshotStatus(view, records) {
  if (!records.request) return null;
  const state = records.latest ? records.latest.payload.state : "request_persisted";
  return {
    schema_version: "0.2",
    type: "ProtectedToolGatewayStatus",
    transaction_id: records.request.payload.transaction_id,
    mission_id: records.request.payload.mission_id,
    wave_id: records.request.payload.wave_id,
    agent_id: records.request.payload.agent_id,
    state,
    terminal: TERMINAL_STATES.has(state),
    execution_permitted: ["authorized", "executing"].includes(state),
    production_execution_authorized: false,
    request_ref: clone(records.request.ref),
    decision_ref: records.decision ? clone(records.decision.ref) : clone(NONE_REF),
    receipt_ref: records.receipt ? clone(records.receipt.ref) : clone(NONE_REF),
    latest_event_ref: records.latest ? clone(records.latest.ref) : clone(NONE_REF),
    reason_codes: records.latest ? clone(records.latest.payload.reason_codes) : ["REQUEST_PERSISTED"],
    artifact_store: {
      valid: view.verification.valid,
      manifest_revision: view.verification.manifest_revision,
      manifest_sha256: view.verification.manifest_sha256
    },
    release_authorized: false
  };
}

function eventPayload(request, requestRef, descriptor) {
  const previous = descriptor.previous || null;
  const sequence = previous ? previous.payload.sequence + 1 : 1;
  if (previous &&
      timestamp(descriptor.recordedAt, "event recorded_at") <
        timestamp(previous.payload.recorded_at, "previous event recorded_at")) {
    throw new Error("Gateway event time cannot precede its predecessor.");
  }
  return {
    schema_version: "0.2",
    type: "ToolGatewayTransactionEvent",
    id: deterministicId("GTE", request.transaction_id, String(sequence)),
    transaction_id: request.transaction_id,
    mission_id: request.mission_id,
    wave_id: request.wave_id,
    agent_id: request.agent_id,
    sequence,
    previous_event_ref: previous ? clone(previous.ref) : clone(NONE_REF),
    state: descriptor.state,
    request_ref: clone(requestRef),
    decision_ref: clone(descriptor.decisionRef || NONE_REF),
    receipt_ref: clone(descriptor.receiptRef || NONE_REF),
    admission_ref: clone(descriptor.admissionRef || NONE_REF),
    checkpoint_ref: clone(descriptor.checkpointRef || request.checkpoint_ref),
    identity_policy_ref: clone(request.identity_policy_ref),
    identity_challenge_ref: clone(request.identity_challenge_ref),
    principal_evidence_ref: clone(request.principal_evidence_ref),
    repository_binding: clone(request.repository_binding),
    idempotency_key: request.idempotency_key,
    tool_input_sha256: request.tool_call.tool_input_sha256,
    reason_codes: unique(descriptor.reasonCodes),
    recorded_at: descriptor.recordedAt,
    authority: authority()
  };
}

function persistEvent(options, gatewayLease, requestRecord, descriptor) {
  const payload = eventPayload(requestRecord.payload, requestRecord.ref, descriptor);
  assertValid(payload, "tool-gateway-transaction-event", "Tool gateway transaction event");
  return writeJsonArtifact(options, gatewayLease, {
    missionId: payload.mission_id,
    waveId: payload.wave_id,
    kind: KINDS.event,
    artifactId: payload.id,
    payload,
    createdAt: payload.recorded_at
  });
}

function ensureReceivedEvent(options, gatewayLease, records) {
  if (records.events.length > 0) return records;
  persistEvent(options, gatewayLease, records.request, {
    state: "received",
    reasonCodes: ["GATEWAY_REQUEST_RECEIVED"],
    recordedAt: nowIso(options)
  });
  return recordsForTransaction(storeView(options), records.request.payload.transaction_id);
}

function bindingDigests(request) {
  return {
    gateway: objectDigest(request.gateway),
    principal: objectDigest(request.authenticated_principal)
  };
}

function trustedBindingReasons(options, request) {
  const expected = bindingDigests(request);
  const reasons = [];
  if (options.gatewayBindingSha256 !== expected.gateway) {
    reasons.push("GATEWAY_TRUSTED_BINDING_MISMATCH");
  }
  let identityVerification = null;
  if (request.gateway.assurance_level === "authenticated_reference") {
    identityVerification = verifyGatewayPrincipalEvidence({
      repository: options.repository,
      artifactRoot: options.artifactRoot,
      request,
      evaluatedAt: nowIso(options)
    });
    if (!identityVerification.valid) {
      reasons.push(...identityVerification.codes);
    }
    if (identityVerification.verified_principal_sha256 !== expected.principal) {
      reasons.push("GATEWAY_PRINCIPAL_BINDING_MISMATCH");
    }
  } else if (options.verifiedPrincipalSha256 !== expected.principal) {
    reasons.push("GATEWAY_PRINCIPAL_BINDING_MISMATCH");
  }
  return { expected, identityVerification, reasons: unique(reasons) };
}

function admissionRecordForRequest(view, request) {
  const candidates = listArtifacts(view, {
    missionId: request.mission_id,
    waveId: request.wave_id,
    kind: "tool-admission-events"
  }).filter(item =>
    sameRef(item.payload.lease_ref, request.lease_ref) &&
    item.payload.agent_id === request.agent_id &&
    item.payload.provider === request.provider &&
    item.payload.session_binding.session_id === request.authenticated_principal.session_id &&
    item.payload.session_binding.provider_agent_id ===
      request.authenticated_principal.provider_agent_id &&
    item.payload.tool_use_id === request.tool_call.tool_use_id &&
    item.payload.tool_name === request.tool_call.tool_name &&
    item.payload.tool_input_sha256 === request.tool_call.tool_input_sha256);
  if (candidates.length > 1) {
    throw new Error(`Gateway request ${request.id} has ambiguous dispatch admissions.`);
  }
  return candidates[0] || null;
}

function checkpointForAdmission(view, admissionRef) {
  if (!admissionRef || isNoneRef(admissionRef)) return null;
  const candidates = listArtifacts(view, { kind: "agent-execution-checkpoints" })
    .filter(item => sameRef(item.payload.tool_admission_ref, admissionRef));
  if (candidates.length > 1) {
    throw new Error(`Dispatch admission ${admissionRef.artifact_id} has multiple completion checkpoints.`);
  }
  return candidates[0] || null;
}

function runtimeBindingReasons(options, request, toolInput) {
  const reasons = [];
  const now = timestamp(nowIso(options), "Gateway admission time");
  if (now < timestamp(request.requested_at, "request requested_at") ||
      now >= timestamp(request.valid_until, "request valid_until") ||
      now >= timestamp(request.authenticated_principal.expires_at, "principal expires_at")) {
    reasons.push("GATEWAY_REQUEST_OUTSIDE_VALIDITY");
  }
  if (!["contract_reference", "authenticated_reference"]
    .includes(request.gateway.assurance_level) ||
      request.gateway.exclusive_path_verified !== false) {
    reasons.push("GATEWAY_MANAGED_ASSURANCE_UNVERIFIED");
  }
  if (inputDigest(toolInput) !== request.tool_call.tool_input_sha256) {
    reasons.push("GATEWAY_TOOL_INPUT_DIGEST_MISMATCH");
  }

  const selected = activeLease(options, identityFromRequest(request), nowIso(options));
  if (selected.code !== "LEASE_ACTIVE") {
    reasons.push(selected.code);
    return { reasons, selected };
  }
  if (!sameRef(selected.leaseRecord.ref, request.lease_ref)) {
    reasons.push("GATEWAY_LEASE_REF_MISMATCH");
  }
  if (!sameRef(selected.leaseRecord.payload.tool_policy_ref, request.tool_policy_ref)) {
    reasons.push("GATEWAY_POLICY_REF_MISMATCH");
  }
  if (!sameRef(selected.checkpointRecord.ref, request.checkpoint_ref)) {
    reasons.push("GATEWAY_CHECKPOINT_REF_MISMATCH");
  }
  if (selected.view.repository.key !== request.repository_binding.repository_key ||
      selected.view.repository.identity_fingerprint !== request.repository_binding.identity_fingerprint ||
      selected.leaseRecord.payload.repository_binding.repository_key !==
        request.repository_binding.repository_key ||
      selected.leaseRecord.payload.repository_binding.identity_fingerprint !==
        request.repository_binding.identity_fingerprint) {
    reasons.push("GATEWAY_REPOSITORY_BINDING_MISMATCH");
  }
  const currentState = runtimeRepositoryState(selected.view.repository.root);
  if (!sameRepositoryState(currentState, request.expected_repository_state) ||
      !sameRepositoryState(currentState, selected.checkpointRecord.payload.repository_state)) {
    reasons.push("GATEWAY_REPOSITORY_STATE_MISMATCH");
  }
  return { reasons, selected, currentState };
}

function decisionPayload(options, requestRecord, descriptor) {
  const request = requestRecord.payload;
  const view = storeView(options);
  const digests = bindingDigests(request);
  const decidedAt = nowIso(options);
  const allowExpiry = Math.min(
    timestamp(request.valid_until, "request valid_until"),
    descriptor.leaseExpiresAt
      ? timestamp(descriptor.leaseExpiresAt, "lease expires_at")
      : Number.POSITIVE_INFINITY,
    timestamp(request.authenticated_principal.expires_at, "principal expires_at")
  );
  const validUntil = descriptor.decision === "allow"
    ? new Date(allowExpiry).toISOString()
    : new Date(timestamp(decidedAt, "decision time") + 1000).toISOString();
  const payload = {
    schema_version: "0.2",
    type: "ToolGatewayDecision",
    id: deterministicId("TGD", request.transaction_id),
    transaction_id: request.transaction_id,
    mission_id: request.mission_id,
    wave_id: request.wave_id,
    agent_id: request.agent_id,
    provider: request.provider,
    request_ref: clone(requestRecord.ref),
    lease_ref: clone(request.lease_ref),
    tool_policy_ref: clone(request.tool_policy_ref),
    checkpoint_ref: clone(descriptor.checkpointRef || request.checkpoint_ref),
    admission_ref: clone(descriptor.admissionRef || NONE_REF),
    identity_policy_ref: clone(request.identity_policy_ref),
    identity_challenge_ref: clone(request.identity_challenge_ref),
    principal_evidence_ref: clone(request.principal_evidence_ref),
    gateway_binding_sha256: digests.gateway,
    principal_binding_sha256: digests.principal,
    tool_call: clone(request.tool_call),
    repository_state_before: clone(
      descriptor.repositoryState || request.expected_repository_state
    ),
    coordination: coordination(view),
    decision: descriptor.decision,
    execution_permitted: descriptor.decision === "allow",
    production_execution_authorized: false,
    matched_rule_id: descriptor.decision === "allow" ? descriptor.matchedRuleId : "none",
    reason_codes: unique(descriptor.reasonCodes),
    idempotency_key: request.idempotency_key,
    decided_at: decidedAt,
    valid_until: validUntil,
    authority: authority()
  };
  assertValid(payload, "tool-gateway-decision", "Tool gateway decision");
  return payload;
}

function persistDecision(options, gatewayLease, requestRecord, descriptor) {
  const existing = recordsForTransaction(
    storeView(options),
    requestRecord.payload.transaction_id
  ).decision;
  if (existing) return existing;
  const payload = decisionPayload(options, requestRecord, descriptor);
  const written = writeJsonArtifact(options, gatewayLease, {
    missionId: payload.mission_id,
    waveId: payload.wave_id,
    kind: KINDS.decision,
    artifactId: payload.id,
    payload,
    createdAt: payload.decided_at
  });
  return { payload, ref: written.ref, entry: null };
}

function appendDecisionEvent(options, gatewayLease, records) {
  if (!records.decision || records.latest.payload.state !== "received") return records;
  const decision = records.decision.payload;
  const state = decision.decision === "allow" ? "authorized" : "denied";
  persistEvent(options, gatewayLease, records.request, {
    previous: records.latest,
    state,
    decisionRef: records.decision.ref,
    admissionRef: decision.admission_ref,
    checkpointRef: decision.checkpoint_ref,
    reasonCodes: decision.reason_codes,
    recordedAt: decision.decided_at
  });
  return recordsForTransaction(storeView(options), records.request.payload.transaction_id);
}

function settleDecision(options, gatewayLease, records, descriptor) {
  persistDecision(options, gatewayLease, records.request, descriptor);
  const refreshed = recordsForTransaction(
    storeView(options),
    records.request.payload.transaction_id
  );
  return appendDecisionEvent(options, gatewayLease, refreshed);
}

function requestByIdempotency(view, idempotencyKey) {
  const matches = listArtifacts(view, { kind: KINDS.request })
    .filter(item => item.payload.idempotency_key === idempotencyKey);
  if (matches.length > 1) {
    throw new Error(`Idempotency key ${idempotencyKey} maps to multiple gateway requests.`);
  }
  return matches[0] || null;
}

function admitGatewayRequest(options, request, toolInput) {
  assertValid(request, "tool-gateway-request", "Tool gateway request");
  const gatewayLease = gatewayLock(options, request.idempotency_key);
  try {
    let view = storeView(options);
    let requestRecord = requestByIdempotency(view, request.idempotency_key);
    const transactionRecord = recordsForTransaction(view, request.transaction_id).request;
    if (transactionRecord &&
        (!requestRecord || !sameRef(transactionRecord.ref, requestRecord.ref))) {
      throw new Error(
        "GATEWAY_TRANSACTION_CONFLICT: the transaction already binds a different request."
      );
    }
    if (requestRecord) {
      if (!canonicalBytes(requestRecord.payload).equals(canonicalBytes(request))) {
        throw new Error("GATEWAY_IDEMPOTENCY_CONFLICT: the key already binds a different request.");
      }
    } else {
      const written = writeJsonArtifact(options, gatewayLease, {
        missionId: request.mission_id,
        waveId: request.wave_id,
        kind: KINDS.request,
        artifactId: request.id,
        payload: request,
        createdAt: request.requested_at
      });
      requestRecord = { payload: clone(request), ref: written.ref, entry: null };
    }

    let records = recordsForTransaction(storeView(options), request.transaction_id);
    records = ensureReceivedEvent(options, gatewayLease, records);
    if (records.decision) {
      records = appendDecisionEvent(options, gatewayLease, records);
      return snapshotStatus(storeView(options), records);
    }
    if (records.latest.payload.state !== "received") {
      return snapshotStatus(storeView(options), records);
    }
    if (timestamp(nowIso(options), "gateway admission time") <
        timestamp(records.latest.payload.recorded_at, "received event time")) {
      throw new Error("Gateway admission cannot precede the received event.");
    }

    const trusted = trustedBindingReasons(options, request);
    const runtime = runtimeBindingReasons(options, request, toolInput);
    const preAdmissionReasons = unique([...trusted.reasons, ...runtime.reasons]);
    if (preAdmissionReasons.length > 0) {
      records = settleDecision(options, gatewayLease, records, {
        decision: "deny",
        reasonCodes: preAdmissionReasons,
        repositoryState: runtime.currentState || request.expected_repository_state,
        checkpointRef: runtime.selected && runtime.selected.checkpointRecord
          ? runtime.selected.checkpointRecord.ref
          : request.checkpoint_ref
      });
      return snapshotStatus(storeView(options), records);
    }

    view = storeView(options);
    let admission = admissionRecordForRequest(view, request);
    let admissionResult;
    if (!admission) {
      admissionResult = admitToolRequest(options, identityFromRequest(request), {
        hook_event_name: "PreToolUse",
        tool_use_id: request.tool_call.tool_use_id,
        tool_name: request.tool_call.tool_name,
        tool_input: toolInput
      });
      if (admissionResult.admission_ref) {
        admission = {
          payload: admissionResult.admission_event,
          ref: admissionResult.admission_ref,
          entry: null
        };
      }
    } else {
      admissionResult = {
        decision: admission.payload.decision,
        reason_codes: admission.payload.reason_codes,
        admission_ref: admission.ref,
        admission_event: admission.payload
      };
    }

    if (!admission || admissionResult.decision !== "allow") {
      records = settleDecision(options, gatewayLease, records, {
        decision: "deny",
        admissionRef: admission ? admission.ref : NONE_REF,
        checkpointRef: request.checkpoint_ref,
        repositoryState: runtime.currentState,
        reasonCodes: admissionResult.reason_codes || ["GATEWAY_DISPATCH_ADMISSION_DENIED"]
      });
      return snapshotStatus(storeView(options), records);
    }

    const existingCheckpoint = checkpointForAdmission(storeView(options), admission.ref);
    if (existingCheckpoint) {
      records = settleDecision(options, gatewayLease, records, {
        decision: "deny",
        admissionRef: admission.ref,
        checkpointRef: existingCheckpoint.ref,
        repositoryState: existingCheckpoint.payload.repository_state,
        reasonCodes: ["GATEWAY_ADMISSION_ALREADY_SETTLED"]
      });
      return snapshotStatus(storeView(options), records);
    }

    if (admission.payload.operation_class !== request.tool_call.operation_class) {
      const cancelled = cancelToolRequest(options, identityFromRequest(request), {
        toolUseId: request.tool_call.tool_use_id,
        toolName: request.tool_call.tool_name,
        toolInput,
        reasonCode: "GATEWAY_OPERATION_CLASS_MISMATCH"
      });
      let checkpointRef = request.checkpoint_ref;
      let repositoryState = runtime.currentState;
      const reasons = ["GATEWAY_OPERATION_CLASS_MISMATCH"];
      if (cancelled.checkpoint_ref) {
        checkpointRef = cancelled.checkpoint_ref;
        repositoryState = cancelled.checkpoint.repository_state;
      } else {
        const interrupted = interruptLease(
          options,
          request.lease_ref.artifact_id,
          "GATEWAY_CANCELLATION_FAILED"
        );
        checkpointRef = interrupted.checkpoint_ref;
        repositoryState = interrupted.checkpoint.repository_state;
        reasons.push("GATEWAY_CANCELLATION_FAILED");
      }
      records = settleDecision(options, gatewayLease, records, {
        decision: "deny",
        admissionRef: admission.ref,
        checkpointRef,
        repositoryState,
        reasonCodes: reasons
      });
      return snapshotStatus(storeView(options), records);
    }

    records = settleDecision(options, gatewayLease, records, {
      decision: "allow",
      admissionRef: admission.ref,
      checkpointRef: request.checkpoint_ref,
      repositoryState: runtime.currentState,
      matchedRuleId: admission.payload.rule_id,
      leaseExpiresAt: runtime.selected.leaseRecord.payload.expires_at,
      reasonCodes: ["GATEWAY_TOOL_AUTHORIZED", ...admission.payload.reason_codes]
    });
    return snapshotStatus(storeView(options), records);
  } finally {
    releaseRepositoryLease(gatewayLease);
  }
}

function requireTrustedBindings(options, request) {
  const trusted = trustedBindingReasons(options, request);
  if (trusted.reasons.length > 0) {
    throw new Error(`Trusted gateway binding failed: ${trusted.reasons.join(", ")}`);
  }
}

function loadTransaction(options, transactionId) {
  const view = storeView(options);
  const records = recordsForTransaction(view, transactionId);
  if (!records.request) throw new Error(`Gateway transaction not found: ${transactionId}`);
  return { view, records };
}

function gatewayTransactionContext(options, transactionId) {
  assertIdentifier(transactionId, "transaction_id");
  const { view, records } = loadTransaction(options, transactionId);
  return {
    status: snapshotStatus(view, records),
    request: clone(records.request.payload),
    request_ref: clone(records.request.ref),
    decision: records.decision ? clone(records.decision.payload) : null,
    decision_ref: records.decision ? clone(records.decision.ref) : clone(NONE_REF),
    latest_event: records.latest ? clone(records.latest.payload) : null,
    latest_event_ref: records.latest ? clone(records.latest.ref) : clone(NONE_REF)
  };
}

function beginGatewayExecution(options, transactionId) {
  assertIdentifier(transactionId, "transaction_id");
  const initial = loadTransaction(options, transactionId);
  const gatewayLease = gatewayLock(options, initial.records.request.payload.idempotency_key);
  try {
    let { view, records } = loadTransaction(options, transactionId);
    requireTrustedBindings(options, records.request.payload);
    if (records.latest.payload.state === "executing" || TERMINAL_STATES.has(records.latest.payload.state)) {
      const status = snapshotStatus(view, records);
      if (records.latest.payload.state === "executing") {
        status.execution_event_ref = clone(records.latest.ref);
      }
      return status;
    }
    if (records.latest.payload.state !== "authorized" || !records.decision ||
        records.decision.payload.decision !== "allow") {
      throw new Error(`Gateway transaction ${transactionId} is not authorized.`);
    }
    const now = nowIso(options);
    if (timestamp(now, "execution start") <
        timestamp(records.latest.payload.recorded_at, "authorization event time")) {
      throw new Error("Gateway execution cannot begin before authorization.");
    }
    if (timestamp(now, "execution start") >=
        timestamp(records.decision.payload.valid_until, "decision valid_until")) {
      throw new Error("Gateway authorization expired before execution began.");
    }
    const selected = activeLease(
      options,
      identityFromRequest(records.request.payload),
      now
    );
    if (selected.code !== "LEASE_ACTIVE" ||
        !sameRef(selected.leaseRecord.ref, records.request.payload.lease_ref) ||
        !sameRef(selected.checkpointRecord.ref, records.decision.payload.checkpoint_ref)) {
      throw new Error(`Gateway authorization no longer matches active dispatch state: ${selected.code}`);
    }
    const state = runtimeRepositoryState(view.repository.root);
    if (!sameRepositoryState(state, records.decision.payload.repository_state_before) ||
        !sameRepositoryState(state, selected.checkpointRecord.payload.repository_state)) {
      throw new Error("Repository state changed after gateway authorization.");
    }
    const written = persistEvent(options, gatewayLease, records.request, {
      previous: records.latest,
      state: "executing",
      decisionRef: records.decision.ref,
      admissionRef: records.decision.payload.admission_ref,
      checkpointRef: records.decision.payload.checkpoint_ref,
      reasonCodes: ["GATEWAY_EXECUTION_BEGAN"],
      recordedAt: now
    });
    ({ view, records } = loadTransaction(options, transactionId));
    return {
      ...snapshotStatus(view, records),
      execution_event_ref: clone(written.ref)
    };
  } finally {
    releaseRepositoryLease(gatewayLease);
  }
}

function noneExecutor() {
  const noneDigest = sha256(Buffer.from("none"));
  return {
    adapter_id: "none",
    adapter_version: "none",
    adapter_sha256: noneDigest,
    runtime_sha256: noneDigest,
    sandbox_profile_sha256: noneDigest,
    network_policy_sha256: noneDigest,
    execution_mode: "none",
    executor_policy_ref: clone(NONE_REF),
    execution_envelope_ref: clone(NONE_REF),
    execution_observation_ref: clone(NONE_REF)
  };
}

function receiptPayload(options, records, descriptor) {
  const request = records.request.payload;
  const decision = records.decision.payload;
  const digests = bindingDigests(request);
  const view = storeView(options);
  const payload = {
    schema_version: "0.3",
    type: "ToolExecutionReceipt",
    id: deterministicId("TER", request.transaction_id),
    transaction_id: request.transaction_id,
    mission_id: request.mission_id,
    wave_id: request.wave_id,
    agent_id: request.agent_id,
    provider: request.provider,
    request_ref: clone(records.request.ref),
    decision_ref: clone(records.decision.ref),
    admission_ref: clone(decision.admission_ref),
    checkpoint_ref: clone(descriptor.checkpointRef),
    identity_policy_ref: clone(request.identity_policy_ref),
    identity_challenge_ref: clone(request.identity_challenge_ref),
    principal_evidence_ref: clone(request.principal_evidence_ref),
    gateway_binding_sha256: digests.gateway,
    principal_binding_sha256: digests.principal,
    tool_call: clone(request.tool_call),
    executor: clone(descriptor.executor),
    execution: {
      transaction_state: descriptor.transactionState,
      status: descriptor.status,
      started_at: descriptor.startedAt,
      finished_at: descriptor.finishedAt,
      result_sha256: descriptor.resultSha256,
      exit_code: descriptor.exitCode,
      external_effects: descriptor.externalEffects
    },
    repository_state_before: clone(decision.repository_state_before),
    repository_state_after: clone(descriptor.repositoryStateAfter),
    coordination: coordination(view),
    idempotency_key: request.idempotency_key,
    production_deployment_verified: false,
    reason_codes: unique(descriptor.reasonCodes),
    recorded_at: nowIso(options),
    authority: authority()
  };
  assertValid(payload, "tool-execution-receipt", "Tool execution receipt");
  return payload;
}

function persistReceipt(options, gatewayLease, records, descriptor) {
  const current = recordsForTransaction(
    storeView(options),
    records.request.payload.transaction_id
  );
  if (current.receipt) return current.receipt;
  const payload = receiptPayload(options, records, descriptor);
  const written = writeJsonArtifact(options, gatewayLease, {
    missionId: payload.mission_id,
    waveId: payload.wave_id,
    kind: KINDS.receipt,
    artifactId: payload.id,
    payload,
    createdAt: payload.recorded_at
  });
  return { payload, ref: written.ref, entry: null };
}

function terminalStateForReceipt(receipt) {
  return receipt.execution.transaction_state;
}

function appendReceiptEvent(options, gatewayLease, records) {
  if (!records.receipt || TERMINAL_STATES.has(records.latest.payload.state)) return records;
  const receipt = records.receipt.payload;
  const state = terminalStateForReceipt(receipt);
  persistEvent(options, gatewayLease, records.request, {
    previous: records.latest,
    state,
    decisionRef: records.decision.ref,
    receiptRef: records.receipt.ref,
    admissionRef: receipt.admission_ref,
    checkpointRef: receipt.checkpoint_ref,
    reasonCodes: receipt.reason_codes,
    recordedAt: receipt.recorded_at
  });
  return recordsForTransaction(storeView(options), records.request.payload.transaction_id);
}

function committedReceiptDescriptor(records, checkpointRecord, descriptor) {
  const checkpoint = checkpointRecord.payload;
  return {
    checkpointRef: checkpointRecord.ref,
    executor: descriptor.executor,
    transactionState: "committed",
    status: checkpoint.execution_result.status,
    startedAt: descriptor.startedAt,
    finishedAt: descriptor.finishedAt,
    resultSha256: checkpoint.execution_result.provider_result_sha256,
    exitCode: String(descriptor.exitCode),
    externalEffects: checkpoint.execution_result.external_effects,
    repositoryStateAfter: checkpoint.repository_state,
    reasonCodes: ["TOOL_EXECUTION_COMMITTED", ...checkpoint.reason_codes]
  };
}

function recoveryReceiptDescriptor(records, checkpointRecord, reasonCodes, startedAt = "none") {
  return {
    checkpointRef: checkpointRecord.ref,
    executor: noneExecutor(),
    transactionState: "recovery_required",
    status: "unknown",
    startedAt,
    finishedAt: "none",
    resultSha256: "none",
    exitCode: "none",
    externalEffects: "unknown",
    repositoryStateAfter: checkpointRecord.payload.repository_state,
    reasonCodes: ["GATEWAY_RECOVERY_REQUIRED", ...reasonCodes]
  };
}

function validateExecutor(executor) {
  if (!executor || executor.execution_mode === "none") {
    throw new Error("Committed execution requires a concrete fixture or external executor.");
  }
  for (const field of [
    "adapter_sha256",
    "runtime_sha256",
    "sandbox_profile_sha256",
    "network_policy_sha256"
  ]) {
    assertSha256(executor[field], `executor.${field}`);
  }
  const refs = [
    executor.executor_policy_ref,
    executor.execution_envelope_ref,
    executor.execution_observation_ref
  ];
  const bounded = executor.execution_mode === "bounded_process_reference";
  if (bounded && refs.some(ref => !ref || isNoneRef(ref))) {
    throw new Error("Bounded process execution requires three concrete evidence references.");
  }
  if (!bounded && refs.some(ref => !isNoneRef(ref))) {
    throw new Error("Non-bounded executors must use exact none evidence references.");
  }
}

function verifyBoundedExecution(options, view, records, descriptor) {
  const protectedInput = descriptor.toolInput &&
    descriptor.toolInput.type === "ProtectedProcessToolInput";
  const bounded = descriptor.executor.execution_mode ===
    "bounded_process_reference";
  if (protectedInput !== bounded) {
    throw new Error(
      "Protected process input and bounded executor evidence must be used together."
    );
  }
  if (!bounded) return;

  assertValid(
    descriptor.toolInput,
    "protected-process-tool-input",
    "Protected process tool input"
  );
  const policyRecord = loadArtifactRef(
    view,
    descriptor.executor.executor_policy_ref,
    "protected-executor-policy"
  );
  const envelopeRecord = loadArtifactRef(
    view,
    descriptor.executor.execution_envelope_ref,
    "protected-execution-envelope"
  );
  const observationRecord = loadArtifactRef(
    view,
    descriptor.executor.execution_observation_ref,
    "protected-execution-observation"
  );
  const repositoryStateAfter = runtimeRepositoryState(view.repository.root);
  const verification = verifyProtectedExecutionBundle({
    policy: policyRecord.payload,
    toolInput: descriptor.toolInput,
    request: records.request.payload,
    requestRef: records.request.ref,
    decision: records.decision.payload,
    decisionRef: records.decision.ref,
    executionEvent: records.latest.payload,
    executionEventRef: records.latest.ref,
    envelope: envelopeRecord.payload,
    envelopeRef: envelopeRecord.ref,
    observation: observationRecord.payload,
    observationRef: observationRecord.ref,
    executor: descriptor.executor,
    result: descriptor.result,
    status: descriptor.status,
    exitCode: descriptor.exitCode,
    evaluatedAt: nowIso(options),
    repositoryStateAfter
  });
  if (!verification.valid) {
    throw new Error(
      `Protected execution evidence failed verification: ${verification.codes.join(", ")}`
    );
  }
}

function commitGatewayExecution(options, transactionId, descriptor) {
  assertIdentifier(transactionId, "transaction_id");
  const initial = loadTransaction(options, transactionId);
  const gatewayLease = gatewayLock(options, initial.records.request.payload.idempotency_key);
  try {
    let { view, records } = loadTransaction(options, transactionId);
    requireTrustedBindings(options, records.request.payload);
    if (records.receipt) {
      records = appendReceiptEvent(options, gatewayLease, records);
      return snapshotStatus(storeView(options), records);
    }
    if (TERMINAL_STATES.has(records.latest.payload.state)) {
      return snapshotStatus(view, records);
    }
    if (records.latest.payload.state !== "executing") {
      throw new Error(`Gateway transaction ${transactionId} has not begun execution.`);
    }
    if (!descriptor || !sameRef(descriptor.executionEventRef, records.latest.ref)) {
      throw new Error("Execution completion requires the exact current execution-event reference.");
    }
    if (inputDigest(descriptor.toolInput) !== records.request.payload.tool_call.tool_input_sha256) {
      throw new Error("Execution completion input does not match the authorized digest.");
    }
    if (!["succeeded", "failed"].includes(descriptor.status)) {
      throw new Error("Execution completion status must be succeeded or failed.");
    }
    validateExecutor(descriptor.executor);
    const startedAt = timestamp(descriptor.startedAt, "execution started_at");
    const finishedAt = timestamp(descriptor.finishedAt, "execution finished_at");
    const recordedAt = timestamp(nowIso(options), "execution receipt time");
    const authorizedAt = timestamp(
      records.latest.payload.recorded_at,
      "execution event recorded_at"
    );
    if (startedAt < authorizedAt) {
      throw new Error("Execution started_at precedes the current execution event.");
    }
    if (startedAt > finishedAt) throw new Error("Execution finished_at precedes started_at.");
    if (finishedAt > recordedAt) throw new Error("Execution finished_at exceeds receipt time.");
    if (!/^-?[0-9]+$/.test(String(descriptor.exitCode))) {
      throw new Error("Execution exit_code must be an integer.");
    }
    verifyBoundedExecution(options, view, records, descriptor);

    const admissionRef = records.decision.payload.admission_ref;
    let completionCheckpoint = checkpointForAdmission(storeView(options), admissionRef);
    if (!completionCheckpoint) {
      const completed = completeToolRequest(
        options,
        identityFromRequest(records.request.payload),
        {
          hook_event_name: descriptor.status === "succeeded"
            ? "PostToolUse"
            : "PostToolUseFailure",
          tool_use_id: records.request.payload.tool_call.tool_use_id,
          tool_name: records.request.payload.tool_call.tool_name,
          tool_input: descriptor.toolInput,
          tool_response: descriptor.result
        }
      );
      if (completed.checkpoint_ref) {
        completionCheckpoint = {
          payload: completed.checkpoint,
          ref: completed.checkpoint_ref,
          entry: null
        };
      } else {
        const interrupted = interruptLease(
          options,
          records.request.payload.lease_ref.artifact_id,
          "GATEWAY_COMPLETION_BINDING_FAILED"
        );
        const blockedCheckpoint = {
          payload: interrupted.checkpoint,
          ref: interrupted.checkpoint_ref,
          entry: null
        };
        persistReceipt(options, gatewayLease, records,
          recoveryReceiptDescriptor(
            records,
            blockedCheckpoint,
            completed.reason_codes || ["GATEWAY_COMPLETION_BINDING_FAILED"],
            descriptor.startedAt
          ));
        records = appendReceiptEvent(
          options,
          gatewayLease,
          loadTransaction(options, transactionId).records
        );
        return snapshotStatus(storeView(options), records);
      }
    }

    if (completionCheckpoint.payload.execution_result.status === "cancelled") {
      throw new Error("A cancelled dispatch admission cannot be committed as executed.");
    }
    persistReceipt(
      options,
      gatewayLease,
      records,
      committedReceiptDescriptor(records, completionCheckpoint, descriptor)
    );
    records = appendReceiptEvent(
      options,
      gatewayLease,
      loadTransaction(options, transactionId).records
    );
    return snapshotStatus(storeView(options), records);
  } finally {
    releaseRepositoryLease(gatewayLease);
  }
}

function abortDescriptor(checkpointRecord, reasonCodes) {
  return {
    checkpointRef: checkpointRecord.ref,
    executor: noneExecutor(),
    transactionState: "aborted",
    status: "not_executed",
    startedAt: "none",
    finishedAt: "none",
    resultSha256: "none",
    exitCode: "none",
    externalEffects: "none",
    repositoryStateAfter: checkpointRecord.payload.repository_state,
    reasonCodes: ["GATEWAY_EXECUTION_ABORTED", ...reasonCodes]
  };
}

function settleOrphanAdmission(options, gatewayLease, records, admission, toolInput) {
  const request = records.request.payload;
  const reasonCodes = ["GATEWAY_ORPHAN_ADMISSION_REVOKED"];
  let checkpointRef = request.checkpoint_ref;
  let repositoryState = runtimeRepositoryState(storeView(options).repository.root);

  if (admission.payload.decision !== "allow") {
    return settleDecision(options, gatewayLease, records, {
      decision: "deny",
      admissionRef: admission.ref,
      checkpointRef,
      repositoryState,
      reasonCodes: ["GATEWAY_RECOVERED_DENIED_ADMISSION", ...admission.payload.reason_codes]
    });
  }

  if (inputDigest(toolInput) === request.tool_call.tool_input_sha256) {
    const cancelled = cancelToolRequest(options, identityFromRequest(request), {
      toolUseId: request.tool_call.tool_use_id,
      toolName: request.tool_call.tool_name,
      toolInput,
      reasonCode: "GATEWAY_ORPHAN_ADMISSION_RECOVERY"
    });
    if (cancelled.checkpoint_ref) {
      checkpointRef = cancelled.checkpoint_ref;
      repositoryState = cancelled.checkpoint.repository_state;
      reasonCodes.push("GATEWAY_ORPHAN_ADMISSION_CANCELLED");
      return settleDecision(options, gatewayLease, records, {
        decision: "deny",
        admissionRef: admission.ref,
        checkpointRef,
        repositoryState,
        reasonCodes
      });
    }
    reasonCodes.push(...(cancelled.reason_codes || ["GATEWAY_ORPHAN_CANCELLATION_FAILED"]));
  } else {
    reasonCodes.push("GATEWAY_ORPHAN_RAW_INPUT_UNAVAILABLE");
  }

  const selected = activeLease(options, identityFromRequest(request), nowIso(options));
  if (selected.leaseRecord && sameRef(selected.leaseRecord.ref, request.lease_ref) &&
      selected.checkpointRecord) {
    checkpointRef = selected.checkpointRecord.ref;
    repositoryState = selected.checkpointRecord.payload.repository_state;
  }
  if (selected.code === "LEASE_ACTIVE" &&
      selected.leaseRecord && sameRef(selected.leaseRecord.ref, request.lease_ref)) {
    const interrupted = interruptLease(
      options,
      request.lease_ref.artifact_id,
      "GATEWAY_ORPHAN_ADMISSION_REVOKED"
    );
    checkpointRef = interrupted.checkpoint_ref;
    repositoryState = interrupted.checkpoint.repository_state;
    reasonCodes.push(
      `GATEWAY_ORPHAN_LEASE_${interrupted.checkpoint.lease_status.toUpperCase()}`
    );
  } else {
    reasonCodes.push(selected.code);
  }
  return settleDecision(options, gatewayLease, records, {
    decision: "deny",
    admissionRef: admission.ref,
    checkpointRef,
    repositoryState,
    reasonCodes
  });
}

function recoverGatewayTransaction(options, transactionId, descriptor = {}) {
  assertIdentifier(transactionId, "transaction_id");
  const initial = loadTransaction(options, transactionId);
  const gatewayLease = gatewayLock(options, initial.records.request.payload.idempotency_key);
  try {
    let { view, records } = loadTransaction(options, transactionId);
    requireTrustedBindings(options, records.request.payload);
    records = ensureReceivedEvent(options, gatewayLease, records);
    if (records.receipt) {
      records = appendReceiptEvent(options, gatewayLease, records);
      return snapshotStatus(storeView(options), records);
    }
    if (TERMINAL_STATES.has(records.latest.payload.state)) {
      return snapshotStatus(view, records);
    }
    if (records.latest.payload.state === "received") {
      if (records.decision) {
        records = appendDecisionEvent(options, gatewayLease, records);
      } else {
        const orphanAdmission = admissionRecordForRequest(
          storeView(options),
          records.request.payload
        );
        records = orphanAdmission
          ? settleOrphanAdmission(
            options,
            gatewayLease,
            records,
            orphanAdmission,
            descriptor.toolInput
          )
          : settleDecision(options, gatewayLease, records, {
            decision: "deny",
            admissionRef: NONE_REF,
            checkpointRef: records.request.payload.checkpoint_ref,
            repositoryState: runtimeRepositoryState(view.repository.root),
            reasonCodes: ["GATEWAY_RECOVERED_BEFORE_DECISION"]
          });
      }
    }
    if (TERMINAL_STATES.has(records.latest.payload.state)) {
      return snapshotStatus(storeView(options), records);
    }

    if (records.latest.payload.state === "authorized") {
      if (inputDigest(descriptor.toolInput) !== records.request.payload.tool_call.tool_input_sha256) {
        throw new Error("Authorized recovery requires the exact raw tool input.");
      }
      const cancelled = cancelToolRequest(
        options,
        identityFromRequest(records.request.payload),
        {
          toolUseId: records.request.payload.tool_call.tool_use_id,
          toolName: records.request.payload.tool_call.tool_name,
          toolInput: descriptor.toolInput,
          reasonCode: "GATEWAY_OPERATOR_RECOVERY"
        }
      );
      if (cancelled.checkpoint_ref) {
        persistReceipt(options, gatewayLease, records, abortDescriptor({
          payload: cancelled.checkpoint,
          ref: cancelled.checkpoint_ref
        }, cancelled.checkpoint.reason_codes));
      } else {
        const interrupted = interruptLease(
          options,
          records.request.payload.lease_ref.artifact_id,
          "GATEWAY_AUTHORIZED_RECOVERY_FAILED"
        );
        persistReceipt(options, gatewayLease, records, recoveryReceiptDescriptor(
          records,
          { payload: interrupted.checkpoint, ref: interrupted.checkpoint_ref },
          cancelled.reason_codes || ["GATEWAY_AUTHORIZED_RECOVERY_FAILED"]
        ));
      }
      records = appendReceiptEvent(
        options,
        gatewayLease,
        loadTransaction(options, transactionId).records
      );
      return snapshotStatus(storeView(options), records);
    }

    if (records.latest.payload.state === "executing") {
      const interrupted = interruptLease(
        options,
        records.request.payload.lease_ref.artifact_id,
        "GATEWAY_EXECUTION_OUTCOME_UNKNOWN"
      );
      persistReceipt(options, gatewayLease, records, recoveryReceiptDescriptor(
        records,
        { payload: interrupted.checkpoint, ref: interrupted.checkpoint_ref },
        interrupted.checkpoint.reason_codes,
        records.latest.payload.recorded_at
      ));
      records = appendReceiptEvent(
        options,
        gatewayLease,
        loadTransaction(options, transactionId).records
      );
      return snapshotStatus(storeView(options), records);
    }

    throw new Error(`Gateway transaction ${transactionId} cannot be recovered from ${records.latest.payload.state}.`);
  } finally {
    releaseRepositoryLease(gatewayLease);
  }
}

function gatewayStatus(options, filters = {}) {
  const view = storeView(options);
  const requests = listArtifacts(view, { kind: KINDS.request })
    .filter(item => !filters.missionId || item.payload.mission_id === filters.missionId)
    .filter(item => !filters.waveId || item.payload.wave_id === filters.waveId)
    .filter(item => !filters.agentId || item.payload.agent_id === filters.agentId)
    .filter(item => !filters.transactionId ||
      item.payload.transaction_id === filters.transactionId);
  const seenKeys = new Set();
  const transactions = requests.map(request => {
    if (seenKeys.has(request.payload.idempotency_key)) {
      throw new Error(`Duplicate gateway idempotency key: ${request.payload.idempotency_key}`);
    }
    seenKeys.add(request.payload.idempotency_key);
    return snapshotStatus(
      view,
      recordsForTransaction(view, request.payload.transaction_id)
    );
  });
  return {
    schema_version: "0.2",
    type: "ProtectedToolGatewayProjection",
    repository: {
      key: view.repository.key,
      identity_fingerprint: view.repository.identity_fingerprint,
      head_commit: view.repository.head_commit
    },
    transactions,
    artifact_store: view.verification,
    production_execution_authorized: false,
    release_authorized: false
  };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positional = [];
  const valueFlags = new Set([
    "repository",
    "artifact-root",
    "request",
    "tool-input",
    "verified-principal-sha256",
    "gateway-binding-sha256",
    "transaction",
    "execution-ref",
    "result",
    "executor",
    "status",
    "started-at",
    "finished-at",
    "exit-code",
    "mission",
    "wave",
    "agent",
    "at"
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith("--") && valueFlags.has(arg.slice(2))) {
      index += 1;
      if (index >= rest.length) throw new Error(`${arg} requires a value.`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
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

function readJsonFile(filePath, label) {
  return JSON.parse(fs.readFileSync(path.resolve(required(filePath, label)), "utf8"));
}

function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.command === "hash-input") {
      const input = readJsonFile(parsed.positional[0], "JSON input path");
      process.stdout.write(`${JSON.stringify({ sha256: inputDigest(input) }, null, 2)}\n`);
      return;
    }
    const options = {
      repository: path.resolve(required(parsed.options.repository, "--repository")),
      artifactRoot: parsed.options.artifactRoot
        ? path.resolve(parsed.options.artifactRoot)
        : undefined,
      verifiedPrincipalSha256: parsed.options.verifiedPrincipalSha256,
      gatewayBindingSha256: parsed.options.gatewayBindingSha256,
      now: parsed.options.at
    };
    let result;
    if (parsed.command === "admit") {
      result = admitGatewayRequest(
        options,
        readJsonFile(parsed.options.request, "--request"),
        readJsonFile(parsed.options.toolInput, "--tool-input")
      );
    } else if (parsed.command === "begin") {
      result = beginGatewayExecution(
        options,
        required(parsed.options.transaction, "--transaction")
      );
    } else if (parsed.command === "commit") {
      result = commitGatewayExecution(
        options,
        required(parsed.options.transaction, "--transaction"),
        {
          executionEventRef: readJsonFile(parsed.options.executionRef, "--execution-ref"),
          toolInput: readJsonFile(parsed.options.toolInput, "--tool-input"),
          result: readJsonFile(parsed.options.result, "--result"),
          executor: readJsonFile(parsed.options.executor, "--executor"),
          status: required(parsed.options.status, "--status"),
          startedAt: required(parsed.options.startedAt, "--started-at"),
          finishedAt: required(parsed.options.finishedAt, "--finished-at"),
          exitCode: required(parsed.options.exitCode, "--exit-code")
        }
      );
    } else if (parsed.command === "recover") {
      result = recoverGatewayTransaction(
        options,
        required(parsed.options.transaction, "--transaction"),
        {
          toolInput: parsed.options.toolInput
            ? readJsonFile(parsed.options.toolInput, "--tool-input")
            : undefined
        }
      );
    } else if (parsed.command === "status") {
      result = gatewayStatus(options, {
        missionId: parsed.options.mission,
        waveId: parsed.options.wave,
        agentId: parsed.options.agent,
        transactionId: parsed.options.transaction
      });
    } else {
      throw new Error(
        "Usage: node protected-tool-gateway.js " +
        "<admit|begin|commit|recover|status|hash-input> --repository <repo> ..."
      );
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (["denied", "recovery_required"].includes(result.state)) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  admitGatewayRequest,
  beginGatewayExecution,
  bindingDigests,
  commitGatewayExecution,
  gatewayTransactionContext,
  gatewayStatus,
  recoverGatewayTransaction
};
