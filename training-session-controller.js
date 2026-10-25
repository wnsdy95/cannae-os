const t = require("./task-training-contract"), c = require("./training-session-contract"), force = require("./force-registry-controller");
const artifacts = require("./repository-artifact-store"), dispatch = require("./dispatch-runtime-controller");
const { entryId } = require("./operator-console-evidence"), { prefixBeforeEntry } = require("./campaign-terminal-controller");
const { repositoryStateDigest } = require("./skill-mission-controller"), { validOperatorSignature } = require("./operator-consent-contract");
const same = (a, b) => t.digest(a) === t.digest(b), ref = force.ref;
const read = (...args) => require("./task-training-controller").record(...args);
function candidate(store, reference, key, at, provenance, ownAuthorization = null) {
  const proposed = read(store, reference, c.KINDS.proposals), proposal = c.checked(proposed.payload, "training-session-proposal"), request = proposal.request;
  const now = Date.parse(at), state = force.replay(store, key);
  t.need(!state.unresolved.length && same(state.head, request.expected_registry_head_ref), "TRAINING_SESSION_REGISTRY_HELD_OR_CHANGED");
  t.need(Date.parse(proposal.created_at) <= now && now < Date.parse(proposal.expires_at), "TRAINING_SESSION_PROPOSAL_EXPIRED");
  t.need(proposed.entry.mission_id === request.mission_id && proposed.entry.wave_id === request.wave_id, "TRAINING_SESSION_MANIFEST_SCOPE_INVALID");
  const capability = state.entities.get(request.capability_id), performer = state.entities.get(request.performer_id);
  t.need(capability?.kind === "capability" && performer?.kind === "performer" &&
    [capability, performer].every(item => item.enrollment_state === "enrolled"), "TRAINING_SESSION_ENTITY_UNAVAILABLE");
  const standardRecord = read(store, capability.data.standard_ref, "capability-standards"), standard = t.checked(standardRecord.payload, "task-training-standard");
  t.need(standard.capability_id === capability.id && standard.metl_id === capability.data.metl_id &&
    standard.performer_organization_id === performer.data.owner_id, "TRAINING_SESSION_STANDARD_SCOPE_INVALID");
  t.need(request.case_ids.every(id => standard.cases.some(item => item.case_id === id && item.stage === request.stage)), "TRAINING_SESSION_CASE_SCOPE_INVALID");
  const lease = read(store, request.lease_ref, "agent-dispatch-leases", "agent-dispatch-lease");
  const context = read(store, lease.payload.context_pack_ref, "agent-context-packs", "agent-context-pack");
  const policy = read(store, lease.payload.tool_policy_ref, "dispatch-tool-policies", "dispatch-tool-policy");
  t.need(lease.payload.schema_version === "0.2" && [lease, context, policy].every(item =>
    item.payload.mission_id === request.mission_id && item.payload.wave_id === request.wave_id &&
    item.entry.mission_id === request.mission_id && item.entry.wave_id === request.wave_id), "TRAINING_SESSION_EXECUTION_SCOPE_INVALID");
  t.need(performer.data.provider === ({ codex: "codex", claude_code: "claude" }[lease.payload.provider]) && capability.data.aliases.some(item =>
    item.operational_role === context.payload.operational_role && item.task === context.payload.task), "TRAINING_SESSION_ALIAS_OR_PROVIDER_INVALID");
  const history = dispatch.inspectDispatchHistory(store, request.lease_ref);
  t.need(history.latest.payload.lease_status === "active" && !history.pending_tool_requests && !history.unresolved_tool_effects &&
    !history.unresolved_gateway_transactions, "TRAINING_SESSION_LEASE_OR_EFFECTS_HELD");
  const end = Date.parse(request.expires_at);
  t.need(now >= Date.parse(lease.payload.not_before) && now >= Date.parse(standard.created_at) &&
    end > now && end <= Math.min(Date.parse(lease.payload.expires_at), Date.parse(standard.expires_at)) && end - now <= 86400000,
  "TRAINING_SESSION_WINDOW_INVALID");
  const entries = store.manifest.artifacts;
  for (const entry of entries.filter(item => item.kind === "tool-admission-events")) {
    if (same(read(store, ref(entry), entry.kind, "tool-admission-event").payload.lease_ref, request.lease_ref)) throw new Error("TRAINING_SESSION_ADMISSION_ALREADY_EXISTS");
  }
  for (const entry of entries.filter(item => [c.KINDS.bindings, c.KINDS.authorizations].includes(item.kind))) {
    if (ownAuthorization && same(ref(entry), ownAuthorization)) continue;
    const value = read(store, ref(entry), entry.kind).payload, selected = value.type === "TaskTrainingSessionAuthorization" ? value.review?.proposal?.request?.lease_ref : value.lease_ref;
    t.need(!selected || !same(selected, request.lease_ref), "TRAINING_SESSION_ENROLLMENT_EXISTS_OR_UNCERTAIN");
  }
  t.need(!entries.some(entry => entry.kind === "mission-wave-terminations" && entry.mission_id === request.mission_id && entry.wave_id === request.wave_id), "TRAINING_SESSION_WAVE_TERMINATED");
  const plan = read(store, context.payload.plan_ref, "mission-wave-plans", "mission-wave-plan").payload;
  const campaign = plan.adaptive_work.enabled && entries.find(entry => entry.kind === "self-improvement-campaigns" && entry.artifact_id === plan.adaptive_work.campaign_id);
  require("./campaign-stop-controller").assertMissionNotStopped(store, request.mission_id, campaign ? ref(campaign) : undefined);
  require("./readiness-drop-revocation-runner").assertMayExecute(require("./effect-settlement-proof").historicalRuntimeView(store), context.payload, at);
  return { proposal_ref: proposed.ref, proposal, registry_head_ref: state.head, repository_binding: force.binding(store), observed_manifest: force.manifestState(store),
    source_state_sha256: provenance.source_state_sha256, repository_state_sha256: provenance.repository_state_sha256,
    capability, performer, standard_ref: standardRecord.ref, standard, lease: lease.payload, context_ref: context.ref, context: context.payload,
    policy_ref: policy.ref, policy: policy.payload };
}
function propose(request, options) {
  const proposal = c.proposal(request), store = force.load(options), before = force.manifestState(store);
  const write = artifacts.writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: options.artifactRoot,
    missionId: request.mission_id, waveId: request.wave_id, kind: c.KINDS.proposals, artifactId: proposal.id, payload: proposal,
    publicationGuard: snapshot => { t.need((snapshot.manifest ? artifacts.manifestDigest(snapshot.manifest) : "none") === before.sha256, "TRAINING_SESSION_MANIFEST_STALE"); return true; } });
  return { proposal, proposal_ref: { artifact_id: proposal.id, relative_path: write.relative_path, sha256: write.sha256 }, ...t.FLAGS };
}
function prepareReview(configuration, input, ownAuthorization = null) {
  const store = force.load(configuration); t.need(force.binding(store).identity_fingerprint === configuration.identity &&
    force.manifestState(store).sha256 === input.manifest, "TRAINING_SESSION_MANIFEST_STALE");
  const entries = store.manifest.artifacts.filter(entry => entry.kind === c.KINDS.proposals && entryId(entry) === input.entry_id);
  t.need(entries.length === 1, "TRAINING_SESSION_PROPOSAL_NOT_FOUND");
  const review = candidate(store, ref(entries[0]), configuration.forceRegistryPublicKey, new Date().toISOString(), {
    source_state_sha256: repositoryStateDigest(__dirname), repository_state_sha256: repositoryStateDigest(configuration.repository) }, ownAuthorization);
  t.need(review.source_state_sha256 === configuration.sourceSha256, "TRAINING_SESSION_SOURCE_CHANGED");
  const lease = review.lease, actor = { missionId: lease.mission_id, waveId: lease.wave_id, agentId: lease.agent_id,
    provider: lease.provider, sessionId: lease.session_binding.session_id, providerAgentId: lease.session_binding.provider_agent_id };
  const live = dispatch.activeLease(configuration, actor);
  t.need(live.code === "LEASE_ACTIVE" && same(live.leaseRecord.ref, review.proposal.request.lease_ref), "TRAINING_SESSION_LEASE_NOT_CURRENT");
  t.need(dispatch.sameRepositoryState(dispatch.runtimeRepositoryState(configuration.repository), lease.initial_repository_state), "TRAINING_SESSION_REPOSITORY_CHANGED");
  t.need(force.manifestState(force.load(configuration)).sha256 === input.manifest, "TRAINING_SESSION_MANIFEST_STALE");
  t.need(c.REVIEW.safeParse(review).success && Buffer.byteLength(JSON.stringify(review, null, 2) + "\n") <= 196608, "TRAINING_SESSION_REVIEW_TOO_LARGE"); return review;
}
function verifyBinding(store, bindingRecord, key) {
  const binding = t.checked(bindingRecord.payload, "task-training-session-binding");
  t.need(binding.schema_version === "0.2" && key && validOperatorSignature(binding, key), "TRAINING_SESSION_BINDING_SIGNATURE_INVALID");
  const authorization = read(store, binding.authorization_ref, c.KINDS.authorizations), value = c.verifyAuthorization(authorization.payload, key);
  t.need(same(c.bindingBody(value, authorization.ref), (({ signature, ...body }) => body)(binding)), "TRAINING_SESSION_BINDING_SUBSTITUTED");
  const before = prefixBeforeEntry(store, authorization.entry), review = candidate(before, value.review.proposal_ref, key, value.created_at, value.review);
  t.need(same(review, value.review), "TRAINING_SESSION_ORIGINAL_REVIEW_SUBSTITUTED");
  const beforeBinding = prefixBeforeEntry(store, bindingRecord.entry);
  t.need(force.manifestState(beforeBinding).revision === force.manifestState(before).revision + 1 &&
    beforeBinding.manifest.artifacts.some(entry => same(ref(entry), authorization.ref)), "TRAINING_SESSION_PUBLICATION_INTERRUPTED");
  for (const entry of [authorization.entry, bindingRecord.entry]) t.need(entry.mission_id === value.review.proposal.request.mission_id &&
    entry.wave_id === value.review.proposal.request.wave_id, "TRAINING_SESSION_MANIFEST_SCOPE_INVALID");
  return value;
}
module.exports = { propose, prepareReview, verifyBinding };
