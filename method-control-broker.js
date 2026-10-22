const crypto = require("node:crypto"), fs = require("node:fs"), path = require("node:path");
const contract = require("./method-control-contract"), gate = require("./method-deviation-gate");
const { digest, same } = require("./order-intake-contract");
const privateState = require("./method-control-private-state");
const { writeRepositoryArtifact, resolveRepository } = require("./repository-artifact-store");
const { prefixBeforeEntry } = require("./campaign-terminal-controller");
const ref = gate.reference, need = (value, code) => { if (!value) throw new Error(code); };
const now = options => options.now || new Date().toISOString();
const at = value => { const parsed = Date.parse(value); need(Number.isFinite(parsed), "METHOD_CONTROL_TIME_INVALID"); return parsed; };
const sameRef = (left, right) => Boolean(left && right && same(left, right));
const scope = value => ({ mission_id: value.mission_id, wave_id: value.wave_id, agent_id: value.agent_id });
const typeFor = kind => Object.keys(contract.RECORDS).find(type => contract.RECORDS[type] === kind).replace(/[A-Z]/g, (letter, index) => (index ? "-" : "") + letter.toLowerCase());
function records(store, kind, subject) {
  return store.manifest.artifacts.filter(entry => entry.kind === kind && entry.mission_id === subject.mission_id &&
    entry.wave_id === subject.wave_id).map(entry => gate.read(store, ref(entry), kind, typeFor(kind), subject))
    .filter(item => item.payload.agent_id === subject.agent_id);
}
function precedes(store, first, second) {
  return at(first.entry.created_at) <= at(second.entry.created_at) &&
    prefixBeforeEntry(store, second.entry).manifest.artifacts.some(entry => sameRef(ref(entry), first.ref));
}
function publish(options, payload, guard) {
  const validation = require("./validator-cli-prototype/validate").validatePayload(payload, typeFor(contract.RECORDS[payload.type]));
  need(validation.valid, "METHOD_CONTROL_RECORD_INVALID");
  const output = writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: options.artifactRoot,
    missionId: payload.mission_id, waveId: payload.wave_id, kind: contract.RECORDS[payload.type], artifactId: payload.id,
    payload, createdAt: payload.recorded_at, reuseExisting: true, publicationGuard: () => { guard(); return true; } });
  return { artifact_id: payload.id, relative_path: output.relative_path, sha256: output.sha256 };
}
function identity(value) {
  return { missionId: value.mission_id, waveId: value.wave_id, agentId: value.agent_id, provider: value.provider,
    sessionId: value.session_binding.session_id, providerAgentId: value.session_binding.provider_agent_id };
}
function descriptor(privateFile, provider, serverName, source) {
  return { provider, server_name: serverName, command: process.execPath,
    args: [path.join(__dirname, "method-control-server.js"), "--enrollment", privateFile],
    cwd: __dirname, expected_mcp_source: provider === "claude_code" ? source : "not_exposed_by_codex_reference",
    provider_startup_verified: false };
}
function inspectLaunch(privateFile, optionsOverride = {}, allowExpired = false) {
  let secret;
  try { secret = privateState.read(privateFile); }
  catch (error) {
    if (/^METHOD_CONTROL_[A-Z_]+$/.test(error.message)) throw error;
    throw new Error("METHOD_CONTROL_PRIVATE_UNAVAILABLE");
  }
  const options = { repository: secret.repository, artifactRoot: secret.artifact_root, ...optionsOverride };
  need(fs.realpathSync(options.repository) === fs.realpathSync(secret.repository) &&
    path.resolve(options.artifactRoot) === path.resolve(secret.artifact_root), "METHOD_CONTROL_REPOSITORY_MISMATCH");
  const store = gate.load(options), matches = store.manifest.artifacts.filter(entry => entry.kind === "method-control-launch-slots" && entry.artifact_id === secret.launch_slot_id);
  need(matches.length === 1, "METHOD_CONTROL_LAUNCH_SLOT_REQUIRED");
  const slot = gate.read(store, ref(matches[0]), "method-control-launch-slots", "method-control-launch-slot"), value = slot.payload;
  const policy = gate.read(store, value.policy_ref, "dispatch-tool-policies", "dispatch-tool-policy", value);
  const context = gate.read(store, value.context_ref, "agent-context-packs", "agent-context-pack", value);
  const plan = gate.read(store, value.plan_ref, "mission-wave-plans", "mission-wave-plan", value);
  require("./intent-continuity-contract").assertIntentContext(context.payload, plan.payload);
  require("./method-deviation-contract").assertMethodPolicy(plan.payload, policy.payload);
  const pocket = context.payload.method_assignment?.broker, repository = store.verification.repository;
  need(pocket && value.repository_key === repository.key && value.repository_identity_fingerprint === repository.identity_fingerprint &&
    value.provider === policy.payload.provider && sameRef(policy.payload.authorization.context_pack_ref, context.ref) &&
    sameRef(policy.payload.authorization.plan_ref, plan.ref) && sameRef(context.payload.plan_ref, plan.ref) &&
    value.server_name === pocket.server_name && value.runtime_sha256 === pocket.runtime_sha256 && value.runtime_sha256 === contract.runtimeDigest() &&
    value.credential_sha256 === digest(secret.credential) && value.launch_descriptor_sha256 === digest(secret.launch_descriptor) &&
    same(secret.launch_descriptor, descriptor(privateFile, value.provider, value.server_name, secret.launch_descriptor.expected_mcp_source)) &&
    at(value.expires_at) <= at(value.recorded_at) + pocket.max_validity_seconds * 1000 && at(value.expires_at) <= at(plan.payload.valid_until),
  "METHOD_CONTROL_LAUNCH_BINDING_INVALID");
  need(at(value.recorded_at) <= at(now(options)) && (allowExpired || at(now(options)) < at(value.expires_at)), "METHOD_CONTROL_ENROLLMENT_EXPIRED");
  return { secret, options, store, slot, bundle: { plan, context, policy }, pocket };
}
function load(privateFile, optionsOverride = {}, allowExpired = false) {
  const launch = inspectLaunch(privateFile, optionsOverride, allowExpired), { secret, options, store } = launch;
  const matches = store.manifest.artifacts.filter(entry => entry.kind === "method-control-enrollments" && entry.artifact_id === secret.enrollment_id);
  need(matches.length === 1, "METHOD_CONTROL_ENROLLMENT_REQUIRED");
  const enrollment = gate.read(store, ref(matches[0]), "method-control-enrollments", "method-control-enrollment"), value = enrollment.payload;
  const publicScope = appraiseEnrollment(store, enrollment, options, allowExpired);
  need(sameRef(value.launch_slot_ref, launch.slot.ref) && value.credential_sha256 === digest(secret.credential) &&
    value.launch_descriptor_sha256 === digest(secret.launch_descriptor), "METHOD_CONTROL_ENROLLMENT_BINDING_INVALID");
  return { secret, options, store, enrollment, ...publicScope };
}
function appraiseEnrollment(store, enrollment, options, allowExpired = false) {
  const value = enrollment.payload;
  const bundle = gate.scopeForLease(store, value.lease_ref), pocket = bundle.context.payload.method_assignment?.broker;
  const repository = store.verification.repository;
  need(pocket && value.repository_key === repository.key && value.repository_identity_fingerprint === repository.identity_fingerprint &&
    sameRef(value.plan_ref, bundle.plan.ref) && sameRef(value.context_ref, bundle.context.ref) && sameRef(value.policy_ref, bundle.policy.ref) &&
    same(scope(value), scope(bundle.lease.payload)) && value.provider === bundle.lease.payload.provider &&
    same(value.session_binding, bundle.lease.payload.session_binding) && value.server_name === pocket.server_name &&
    value.runtime_sha256 === pocket.runtime_sha256 && value.runtime_sha256 === contract.runtimeDigest() &&
    at(value.expires_at) <= at(value.recorded_at) + pocket.max_validity_seconds * 1000 && at(value.expires_at) <= at(bundle.plan.payload.valid_until),
  "METHOD_CONTROL_ENROLLMENT_BINDING_INVALID");
  const slot = gate.read(store, value.launch_slot_ref, "method-control-launch-slots", "method-control-launch-slot", value);
  const observation = gate.read(store, value.session_observation_ref, "method-control-session-observations", "method-control-session-observation", value);
  need(sameRef(slot.payload.plan_ref, bundle.plan.ref) && sameRef(slot.payload.context_ref, bundle.context.ref) &&
    sameRef(slot.payload.policy_ref, bundle.policy.ref) && slot.payload.provider === value.provider &&
    slot.payload.repository_key === value.repository_key && slot.payload.repository_identity_fingerprint === value.repository_identity_fingerprint &&
    slot.payload.server_name === pocket.server_name && slot.payload.runtime_sha256 === pocket.runtime_sha256 &&
    at(slot.payload.recorded_at) === at(slot.entry.created_at) && at(value.recorded_at) === at(enrollment.entry.created_at) &&
    at(observation.payload.recorded_at) === at(observation.entry.created_at) &&
    at(slot.payload.expires_at) <= at(slot.payload.recorded_at) + pocket.max_validity_seconds * 1000 &&
    at(slot.payload.expires_at) <= at(bundle.plan.payload.valid_until) &&
    sameRef(observation.payload.launch_slot_ref, slot.ref) &&
    observation.payload.provider === value.provider && same(observation.payload.session_binding, value.session_binding) &&
    value.credential_sha256 === slot.payload.credential_sha256 && value.launch_descriptor_sha256 === slot.payload.launch_descriptor_sha256 &&
    at(value.expires_at) <= at(slot.payload.expires_at) && precedes(store, bundle.context, slot) && precedes(store, bundle.policy, slot) &&
    precedes(store, slot, observation) &&
    precedes(store, observation, bundle.lease) && precedes(store, bundle.lease, enrollment), "METHOD_CONTROL_SESSION_BINDING_INVALID");
  need(at(value.recorded_at) <= at(now(options)) && (allowExpired || at(now(options)) < at(value.expires_at)), "METHOD_CONTROL_ENROLLMENT_EXPIRED");
  return { bundle, pocket, slot, observation };
}
function prepare(options, policyId, privateFile, expectedMcpSource = "project") {
  options = { ...options, repository: fs.realpathSync(options.repository), artifactRoot: path.resolve(options.artifactRoot || path.join(options.repository, ".cannae", "artifacts")) };
  need(path.isAbsolute(privateFile) && privateFile === path.resolve(privateFile), "METHOD_CONTROL_PRIVATE_PATH_INVALID");
  need(["project", "user", "local", "sdk"].includes(expectedMcpSource), "METHOD_CONTROL_PROVENANCE_INVALID");
  const compiled = require("./dispatch-runtime-controller").compiledPolicyContext(options, policyId), pocket = compiled.context.payload.method_assignment?.broker;
  need(pocket && pocket.runtime_sha256 === contract.runtimeDigest(), "METHOD_CONTROL_REVIEW_REQUIRED");
  const policy = compiled.policyRecord.payload, store = gate.load(options), repository = resolveRepository(options.repository);
  need(!records(store, "method-control-launch-slots", policy).some(item => sameRef(item.payload.context_ref, compiled.context.ref)), "METHOD_CONTROL_ALREADY_PREPARED");
  const credential = crypto.randomBytes(32).toString("hex"), launch = descriptor(privateFile, policy.provider, pocket.server_name, expectedMcpSource);
  const recordedAt = now(options), value = contract.identified("MethodControlLaunchSlot", { ...scope(policy), provider: policy.provider,
    plan_ref: compiled.plan.ref, context_ref: compiled.context.ref, policy_ref: compiled.policyRecord.ref,
    repository_key: repository.key, repository_identity_fingerprint: repository.identity_fingerprint, server_name: pocket.server_name,
    runtime_sha256: pocket.runtime_sha256, launch_descriptor_sha256: digest(launch), credential_sha256: digest(credential),
    identity_assurance: "local_operator_enrollment_reference", provider_startup_verified: false, recorded_at: recordedAt,
    expires_at: new Date(Math.min(at(recordedAt) + pocket.max_validity_seconds * 1000, at(compiled.plan.payload.valid_until))).toISOString() });
  privateState.create(privateFile, { schema_version: "0.1", launch_slot_id: value.id, enrollment_id: "pending", credential,
    repository: repository.root, artifact_root: options.artifactRoot, launch_descriptor: launch }, repository.root);
  const slotRef = publish(options, value, () => {
    const current = require("./dispatch-runtime-controller").compiledPolicyContext(options, policyId);
    need(sameRef(current.context.ref, compiled.context.ref) && contract.runtimeDigest() === pocket.runtime_sha256 && at(now(options)) < at(value.expires_at) &&
      !records(gate.load(options), "method-control-launch-slots", policy).some(item => sameRef(item.payload.context_ref, compiled.context.ref)), "METHOD_CONTROL_PREPARATION_CHANGED");
  });
  return { launch_slot_ref: slotRef, server_name: pocket.server_name, private_enrollment_file: privateFile, launch_descriptor: launch,
    provider_startup_verified: false, ...contract.AUTHORITY };
}
function observeSession(privateFile, options, actor, input) {
  const launch = inspectLaunch(privateFile, options);
  if (launch.secret.enrollment_id !== "pending" || input.source !== "startup") return null;
  const value = launch.slot.payload;
  need(actor.missionId === value.mission_id && actor.waveId === value.wave_id && actor.agentId === value.agent_id && actor.provider === value.provider,
    "METHOD_CONTROL_ACTOR_MISMATCH");
  const previous = records(launch.store, "method-control-session-observations", value).filter(item => sameRef(item.payload.launch_slot_ref, launch.slot.ref));
  const session = { session_id: actor.sessionId, provider_agent_id: actor.providerAgentId };
  if (previous.length) {
    need(previous.length === 1 && same(previous[0].payload.session_binding, session), "METHOD_CONTROL_SESSION_ALREADY_OBSERVED");
    return { session_observation_ref: previous[0].ref, ...contract.AUTHORITY };
  }
  const observation = contract.identified("MethodControlSessionObservation", { ...scope(value), launch_slot_ref: launch.slot.ref,
    provider: actor.provider, session_binding: session, source: "startup", provider_startup_verified: false, recorded_at: now(launch.options) });
  const observationRef = publish(launch.options, observation, () => {
    const current = inspectLaunch(privateFile, options);
    need(current.secret.enrollment_id === "pending" && !records(current.store, "method-control-session-observations", value)
      .some(item => sameRef(item.payload.launch_slot_ref, launch.slot.ref)), "METHOD_CONTROL_SESSION_ALREADY_OBSERVED");
  });
  return { session_observation_ref: observationRef, ...contract.AUTHORITY };
}
function enroll(options, leaseId, privateFile) {
  options = { ...options, repository: fs.realpathSync(options.repository), artifactRoot: path.resolve(options.artifactRoot || path.join(options.repository, ".cannae", "artifacts")) };
  need(path.isAbsolute(privateFile), "METHOD_CONTROL_PRIVATE_PATH_INVALID");
  const prepared = inspectLaunch(privateFile, options);
  if (prepared.secret.enrollment_id !== "pending") {
    const previous = load(privateFile, options);
    need(previous.bundle.lease.payload.id === leaseId, "METHOD_CONTROL_ALREADY_ENROLLED");
    return { enrollment_ref: previous.enrollment.ref, server_name: previous.pocket.server_name,
      private_enrollment_file: privateFile, launch_descriptor: previous.secret.launch_descriptor, ...contract.AUTHORITY, provider_startup_verified: false };
  }
  return require("./dispatch-runtime-controller").withDispatchControlLock(options, leaseId, (current, renew) => {
    const store = gate.load(options), bundle = gate.scopeForLease(store, current.leaseRecord.ref);
    const pocket = bundle.context.payload.method_assignment?.broker, lease = bundle.lease.payload;
    need(pocket && pocket.runtime_sha256 === contract.runtimeDigest(), "METHOD_CONTROL_REVIEW_REQUIRED");
    const active = require("./dispatch-runtime-controller").activeLease(options, identity(lease), now(options));
    need(active.code === "LEASE_ACTIVE", "METHOD_CONTROL_ACTIVE_LEASE_REQUIRED");
    need(records(store, "method-control-enrollments", lease).every(item => !sameRef(item.payload.lease_ref, bundle.lease.ref)), "METHOD_CONTROL_ALREADY_ENROLLED");
    const slot = prepared.slot, observations = records(store, "method-control-session-observations", lease)
      .filter(item => sameRef(item.payload.launch_slot_ref, slot.ref));
    need(sameRef(slot.payload.plan_ref, bundle.plan.ref) && sameRef(slot.payload.context_ref, bundle.context.ref) &&
      sameRef(slot.payload.policy_ref, bundle.policy.ref) && slot.payload.provider === lease.provider && observations.length === 1 &&
      observations[0].payload.provider === lease.provider && same(observations[0].payload.session_binding, lease.session_binding) &&
      precedes(store, slot, observations[0]) && precedes(store, observations[0], bundle.lease), "METHOD_CONTROL_OBSERVED_SESSION_REQUIRED");
    const repository = resolveRepository(options.repository), credential = prepared.secret.credential;
    const launch = prepared.secret.launch_descriptor, started = now(options);
    const value = contract.identified("MethodControlEnrollment", { ...scope(lease), provider: lease.provider, session_binding: lease.session_binding,
      launch_slot_ref: slot.ref, session_observation_ref: observations[0].ref,
      plan_ref: bundle.plan.ref, context_ref: bundle.context.ref, policy_ref: bundle.policy.ref, lease_ref: bundle.lease.ref,
      repository_key: repository.key, repository_identity_fingerprint: repository.identity_fingerprint, server_name: pocket.server_name,
      runtime_sha256: pocket.runtime_sha256, launch_descriptor_sha256: digest(launch), credential_sha256: digest(credential),
      identity_assurance: "local_operator_enrollment_reference", provider_startup_verified: false, recorded_at: started,
      expires_at: slot.payload.expires_at });
    privateState.bind(privateFile, value.id);
    const enrollmentRef = publish(options, value, () => {
      renew(); need(contract.runtimeDigest() === pocket.runtime_sha256, "METHOD_CONTROL_RUNTIME_CHANGED");
      need(inspectLaunch(privateFile, options).secret.enrollment_id === value.id, "METHOD_CONTROL_PRIVATE_CHANGED");
      need(require("./dispatch-runtime-controller").activeLease(options, identity(lease), now(options)).code === "LEASE_ACTIVE", "METHOD_CONTROL_ACTIVE_LEASE_REQUIRED");
    });
    return { enrollment_ref: enrollmentRef, server_name: pocket.server_name, private_enrollment_file: privateFile,
      launch_descriptor: launch, ...contract.AUTHORITY, provider_startup_verified: false };
  });
}
function expectedTool(bundle, operation) { return `mcp__${bundle.enrollment.payload.server_name}__${operation}`; }
function operationFor(bundle, name) { return contract.OPERATIONS.find(operation => name === expectedTool(bundle, operation)); }
function assertActor(bundle, actor, input) {
  need(same(actor, identity(bundle.enrollment.payload)), "METHOD_CONTROL_ACTOR_MISMATCH");
  if (actor.provider === "claude_code") need(input.mcp_server && input.mcp_server.name === bundle.enrollment.payload.server_name &&
    input.mcp_server.source === bundle.secret.launch_descriptor.expected_mcp_source, "METHOD_CONTROL_PROVENANCE_MISMATCH");
}
function receiptFor(store, request) {
  const values = records(store, "method-control-receipts", request.payload).filter(item => sameRef(item.payload.request_ref, request.ref));
  need(values.length <= 1, "METHOD_CONTROL_RECEIPT_AMBIGUOUS");
  const receipt = values[0];
  if (receipt) {
    need(sameRef(receipt.payload.enrollment_ref, request.payload.enrollment_ref) && precedes(store, request, receipt) &&
      at(receipt.payload.recorded_at) === at(receipt.entry.created_at) && at(receipt.payload.recorded_at) < at(request.payload.expires_at), "METHOD_CONTROL_RECEIPT_BINDING_INVALID");
    appraiseResult(store, request, receipt);
  }
  return receipt;
}
function appraiseResult(store, request, receipt) {
  const before = prefixBeforeEntry(store, receipt.entry);
  const enrollment = gate.read(before, request.payload.enrollment_ref, "method-control-enrollments", "method-control-enrollment", request.payload);
  const bundle = gate.scopeForLease(before, enrollment.payload.lease_ref), result = receipt.payload.result;
  need(same(scope(enrollment.payload), scope(request.payload)) && precedes(store, enrollment, request), "METHOD_CONTROL_REQUEST_BINDING_INVALID");
  if (request.payload.operation === "method_status") {
    const state = gate.methodState(before, bundle.plan, enrollment.payload.agent_id);
    need(same(result, { kind: "status", assignment: bundle.context.payload.method_assignment, completed_steps: state.completed_steps,
      pending_report_refs: state.pending_reports.map(item => item.deviation_ref), next_step: state.next_step || null,
      drift_detected: gate.driftDenials(before, enrollment.payload.mission_id).length > 0 }), "METHOD_CONTROL_STATUS_SUBSTITUTED");
  } else if (request.payload.operation === "method_propose") {
    need(result.kind === "proposal", "METHOD_CONTROL_RESULT_SUBSTITUTED");
    const deviation = gate.read(before, result.deviation_ref, gate.DEVIATIONS, "method-deviation-event", request.payload);
    gate.deviationProof(before, deviation.ref, bundle, request.payload.checkpoint_ref, deviation.payload.recorded_at);
    need(precedes(store, request, deviation) && precedes(store, deviation, receipt) &&
      deviation.payload.step_id === request.payload.arguments.step_id && deviation.payload.method_id === request.payload.arguments.method_id &&
      deviation.payload.rationale === request.payload.arguments.rationale, "METHOD_CONTROL_PROPOSAL_SUBSTITUTED");
  } else {
    need(result.kind === "after_report", "METHOD_CONTROL_RESULT_SUBSTITUTED");
    const report = gate.read(before, result.report_ref, gate.REPORTS, "initiative-deviation-report", request.payload);
    const deviation = gate.read(before, request.payload.arguments.deviation_ref, gate.DEVIATIONS, "method-deviation-event", request.payload);
    need(sameRef(deviation.payload.lease_ref, bundle.lease.ref) && sameRef(report.payload.deviation_ref, deviation.ref) &&
      report.payload.phase === "after" && sameRef(report.payload.sitrep_ref, result.sitrep_ref) && precedes(store, report, receipt), "METHOD_CONTROL_REPORT_SUBSTITUTED");
    const admission = gate.read(before, report.payload.admission_ref, "tool-admission-events", "tool-admission-event", request.payload);
    const checkpoint = gate.read(before, report.payload.result_checkpoint_ref, "agent-execution-checkpoints", "agent-execution-checkpoint", request.payload);
    gate.reportProof(before, report, deviation, admission, checkpoint);
    gate.methodState(before, bundle.plan, request.payload.agent_id);
  }
}
function deliveriesFor(store, request) {
  return records(store, "method-control-deliveries", request.payload).filter(item => sameRef(item.payload.request_ref, request.ref));
}
function statusResult(bundle, store) {
  const state = gate.methodState(store, bundle.bundle.plan, bundle.enrollment.payload.agent_id);
  return { kind: "status", assignment: bundle.bundle.context.payload.method_assignment, completed_steps: state.completed_steps,
    pending_report_refs: state.pending_reports.map(item => item.deviation_ref), next_step: state.next_step || null,
    drift_detected: gate.driftDenials(store, bundle.enrollment.payload.mission_id).length > 0 };
}
function assertSettled(options, lease, view) {
  const entries = view?.manifest.artifacts || [];
  if (view && !entries.some(entry => entry.kind === "method-control-requests" && entry.mission_id === lease.mission_id && entry.wave_id === lease.wave_id)) return;
  const store = gate.load(options);
  for (const request of records(store, "method-control-requests", lease)) {
    const receipt = receiptFor(store, request), deliveries = deliveriesFor(store, request);
    const expected = receipt && { schema_version: "0.1", type: "MethodControlResponse", enrollment_ref: request.payload.enrollment_ref,
      request_ref: request.ref, receipt_ref: receipt.ref, result: receipt.payload.result, ...contract.AUTHORITY };
    need(receipt && deliveries.length > 0 && deliveries.every(delivery => sameRef(delivery.payload.receipt_ref, receipt.ref) &&
      sameRef(delivery.payload.enrollment_ref, request.payload.enrollment_ref) && delivery.payload.tool_use_id === request.payload.tool_use_id &&
      delivery.payload.provider_response_sha256 === digest(expected) && precedes(store, receipt, delivery)), "METHOD_CONTROL_DELIVERY_UNRESOLVED");
  }
}
function assertWorkReady(options, leaseRef, view) {
  const bundle = gate.scopeForLease(view, leaseRef);
  if (bundle.context?.payload.method_assignment?.broker) {
    const store = gate.load(options), values = records(store, "method-control-enrollments", bundle.lease.payload)
      .filter(item => sameRef(item.payload.lease_ref, leaseRef));
    need(values.length === 1, "METHOD_CONTROL_ENROLLMENT_REQUIRED");
    appraiseEnrollment(store, values[0], options);
  }
  assertSettled(options, bundle.lease.payload, view);
}
const candidate = input => typeof input?.tool_name === "string" && input.tool_name.startsWith("mcp__cannae_method_");
function preflight(privateFile, options, actor, input) {
  if (!candidate(input)) return false;
  const initial = load(privateFile, options), operation = operationFor(initial, input.tool_name);
  if (!operation) return false;
  assertActor(initial, actor, input); contract.assertArguments(operation, input.tool_input);
  need(typeof input.tool_use_id === "string" && input.tool_use_id.length > 0 && input.tool_use_id.length <= 512, "METHOD_CONTROL_TOOL_ID_REQUIRED");
  return require("./dispatch-runtime-controller").withDispatchControlLock(initial.options, initial.enrollment.payload.lease_ref.artifact_id, (current, renew) => {
    const bundle = load(privateFile, options), subject = bundle.enrollment.payload;
    assertSettled(bundle.options, bundle.bundle.lease.payload, current.view);
    const requests = records(bundle.store, "method-control-requests", subject).filter(item => sameRef(item.payload.enrollment_ref, bundle.enrollment.ref));
    need(requests.length < bundle.pocket.max_requests, "METHOD_CONTROL_BUDGET_EXHAUSTED");
    need(!requests.some(item => item.payload.tool_use_id === input.tool_use_id || item.payload.arguments.request_id === input.tool_input.request_id), "METHOD_CONTROL_REQUEST_REPLAY");
    if (operation !== "method_report_after") need(require("./dispatch-runtime-controller").activeLease(bundle.options, identity(subject), now(bundle.options)).code === "LEASE_ACTIVE", "METHOD_CONTROL_ACTIVE_LEASE_REQUIRED");
    const recordedAt = now(bundle.options);
    const value = contract.identified("MethodControlRequest", { ...scope(subject), enrollment_ref: bundle.enrollment.ref,
      checkpoint_ref: current.checkpointRecord.ref, operation, arguments: input.tool_input, input_sha256: digest(input.tool_input), tool_use_id: input.tool_use_id,
      recorded_at: recordedAt, expires_at: new Date(Math.min(at(recordedAt) + bundle.pocket.request_validity_seconds * 1000, at(subject.expires_at))).toISOString() });
    publish(bundle.options, value, () => { renew(); assertActor(load(privateFile, options), actor, input); });
    return true;
  });
}
function response(bundle, request, receipt) {
  return { schema_version: "0.1", type: "MethodControlResponse", enrollment_ref: bundle.enrollment.ref, request_ref: request.ref,
    receipt_ref: receipt.ref, result: receipt.payload.result, ...contract.AUTHORITY };
}
function execute(privateFile, operation, input, options = {}) {
  contract.assertArguments(operation, input);
  const initial = load(privateFile, options);
  return require("./dispatch-runtime-controller").withDispatchControlLock(initial.options, initial.enrollment.payload.lease_ref.artifact_id, (current, renew) => {
    const bundle = load(privateFile, options), requests = records(bundle.store, "method-control-requests", bundle.enrollment.payload)
      .filter(item => sameRef(item.payload.enrollment_ref, bundle.enrollment.ref) && item.payload.arguments.request_id === input.request_id);
    need(requests.length === 1, "METHOD_CONTROL_NATIVE_REQUEST_REQUIRED");
    const request = requests[0]; need(request.payload.operation === operation && request.payload.input_sha256 === digest(input), "METHOD_CONTROL_REQUEST_SUBSTITUTED");
    const previous = receiptFor(bundle.store, request); if (previous) return response(bundle, request, previous);
    const guard = () => {
      renew(); const fresh = load(privateFile, options);
      need(at(request.payload.recorded_at) <= at(now(fresh.options)) && at(now(fresh.options)) < at(request.payload.expires_at), "METHOD_CONTROL_REQUEST_EXPIRED");
    };
    guard();
    const runtimeOptions = { ...bundle.options, controlPublicationGuard: guard };
    let result;
    if (operation === "method_status") {
      result = statusResult(bundle, bundle.store);
    }
    if (operation === "method_propose") {
      need(sameRef(current.checkpointRecord.ref, request.payload.checkpoint_ref), "METHOD_CONTROL_CHECKPOINT_CHANGED");
      const prior = bundle.store.manifest.artifacts.filter(entry => entry.kind === gate.DEVIATIONS && entry.mission_id === request.payload.mission_id && entry.wave_id === request.payload.wave_id)
        .map(entry => gate.read(bundle.store, ref(entry), gate.DEVIATIONS, "method-deviation-event"))
        .filter(item => item.payload.agent_id === request.payload.agent_id && sameRef(item.payload.lease_ref, bundle.bundle.lease.ref) &&
          sameRef(item.payload.checkpoint_ref, request.payload.checkpoint_ref) && item.payload.step_id === input.step_id && item.payload.method_id === input.method_id &&
          item.payload.rationale === input.rationale && precedes(bundle.store, request, item));
      need(prior.length <= 1, "METHOD_CONTROL_PROPOSAL_AMBIGUOUS");
      const actual = prior[0]?.ref || gate.proposeMethod(runtimeOptions, { leaseId: bundle.bundle.lease.payload.id, stepId: input.step_id, methodId: input.method_id, rationale: input.rationale }).artifact_ref;
      result = { kind: "proposal", deviation_ref: actual };
    }
    if (operation === "method_report_after") {
      const deviation = gate.read(bundle.store, input.deviation_ref, gate.DEVIATIONS, "method-deviation-event");
      need(same(scope(deviation.payload), scope(bundle.enrollment.payload)) && sameRef(deviation.payload.lease_ref, bundle.bundle.lease.ref), "METHOD_CONTROL_DEVIATION_SCOPE_MISMATCH");
      const prior = bundle.store.manifest.artifacts.filter(entry => entry.kind === gate.REPORTS && entry.mission_id === request.payload.mission_id && entry.wave_id === request.payload.wave_id)
        .map(entry => gate.read(bundle.store, ref(entry), gate.REPORTS, "initiative-deviation-report"))
        .filter(item => sameRef(item.payload.deviation_ref, deviation.ref) && item.payload.phase === "after");
      need(prior.length <= 1, "METHOD_CONTROL_REPORT_AMBIGUOUS");
      gate.methodState(bundle.store, bundle.bundle.plan, bundle.enrollment.payload.agent_id);
      const actual = prior.length ? { artifact_ref: prior[0].ref, sitrep_ref: prior[0].payload.sitrep_ref } :
        gate.reportMethod(runtimeOptions, { deviationRef: deviation.ref, phase: "after" });
      result = { kind: "after_report", report_ref: actual.artifact_ref, sitrep_ref: actual.sitrep_ref };
    }
    need(Buffer.byteLength(JSON.stringify(result)) <= bundle.pocket.output_max_bytes, "METHOD_CONTROL_OUTPUT_TOO_LARGE");
    const value = contract.identified("MethodControlReceipt", { ...scope(bundle.enrollment.payload), enrollment_ref: bundle.enrollment.ref,
      request_ref: request.ref, result, recorded_at: now(bundle.options) });
    const receiptRef = publish(bundle.options, value, () => {
      guard(); const fresh = load(privateFile, options);
      if (operation === "method_status") need(same(result, statusResult(fresh, fresh.store)), "METHOD_CONTROL_PUBLICATION_CHANGED");
      if (operation === "method_report_after") gate.methodState(fresh.store, fresh.bundle.plan, fresh.enrollment.payload.agent_id);
    }), store = gate.load(bundle.options);
    return response(bundle, request, gate.read(store, receiptRef, "method-control-receipts", "method-control-receipt"));
  });
}
function acknowledge(privateFile, options, request, receipt, via, renew) {
  const bundle = load(privateFile, options, true), actual = response(bundle, request, receipt);
  const value = contract.identified("MethodControlDelivery", { ...scope(bundle.enrollment.payload), enrollment_ref: bundle.enrollment.ref,
    request_ref: request.ref, receipt_ref: receipt.ref, tool_use_id: request.payload.tool_use_id, provider_response_sha256: digest(actual), via,
    recorded_at: now(bundle.options) });
  return publish(bundle.options, value, renew);
}
function postflight(privateFile, options, actor, input) {
  if (!candidate(input)) return false;
  const initial = load(privateFile, options, true), operation = operationFor(initial, input.tool_name); if (!operation) return false;
  assertActor(initial, actor, input); contract.assertArguments(operation, input.tool_input);
  return require("./dispatch-runtime-controller").withDispatchControlLock(initial.options, initial.enrollment.payload.lease_ref.artifact_id, (_current, renew) => {
    const bundle = load(privateFile, options, true), requests = records(bundle.store, "method-control-requests", bundle.enrollment.payload)
      .filter(item => item.payload.tool_use_id === input.tool_use_id && sameRef(item.payload.enrollment_ref, bundle.enrollment.ref));
    need(requests.length === 1, "METHOD_CONTROL_NATIVE_REQUEST_REQUIRED");
    const request = requests[0], receipt = receiptFor(bundle.store, request);
    need(receipt && request.payload.operation === operation && request.payload.input_sha256 === digest(input.tool_input), "METHOD_CONTROL_RESULT_REQUIRED");
    const raw = input.tool_response;
    need(raw && Buffer.byteLength(JSON.stringify(raw)) <= bundle.pocket.output_max_bytes * 2 + 32768 && raw.isError !== true, "METHOD_CONTROL_RESULT_MISMATCH");
    let output = raw.type === "MethodControlResponse" ? raw : raw.structuredContent;
    if (Array.isArray(raw.content)) {
      need(raw.content.length === 1 && raw.content[0].type === "text", "METHOD_CONTROL_RESULT_MISMATCH");
      let text;
      try { text = JSON.parse(raw.content[0].text); } catch { throw new Error("METHOD_CONTROL_RESULT_MISMATCH"); }
      need(!output || same(output, text), "METHOD_CONTROL_RESULT_MISMATCH"); output = text;
    }
    need(input.hook_event_name === "PostToolUse" && same(output, response(bundle, request, receipt)), "METHOD_CONTROL_RESULT_MISMATCH");
    if (!deliveriesFor(bundle.store, request).length) acknowledge(privateFile, options, request, receipt, "native_callback", renew);
    return true;
  });
}
function reconcile(privateFile, requestRef, options = {}) {
  const initial = load(privateFile, options, true);
  return require("./dispatch-runtime-controller").withDispatchControlLock(initial.options, initial.enrollment.payload.lease_ref.artifact_id, (_current, renew) => {
    const bundle = load(privateFile, options, true), request = gate.read(bundle.store, requestRef, "method-control-requests", "method-control-request"), receipt = receiptFor(bundle.store, request);
    need(sameRef(request.payload.enrollment_ref, bundle.enrollment.ref) && receipt, "METHOD_CONTROL_RESULT_REQUIRED");
    const previous = deliveriesFor(bundle.store, request);
    return { delivery_ref: previous[0]?.ref || acknowledge(privateFile, options, request, receipt, "operator_reconcile", renew), ...contract.AUTHORITY };
  });
}
module.exports = { prepare, observeSession, inspectLaunch, enroll, load, appraiseEnrollment, preflight, postflight, execute, reconcile, assertSettled, assertWorkReady, operationFor };
