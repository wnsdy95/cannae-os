const path = require("node:path");
const artifacts = require("./repository-artifact-store");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { entryId, readEntry } = require("./operator-console-evidence");
const { repositoryStateDigest } = require("./skill-mission-controller");
const c = require("./force-registry-contract");
const ref = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
const manifestState = store => store.manifest ? { revision: store.manifest.manifest_revision, sha256: artifacts.manifestDigest(store.manifest) } : { revision: 0, sha256: "none" };
const binding = store => ({ repository_key: store.verification.repository.key, identity_fingerprint: store.verification.repository.identity_fingerprint });
function checked(value, type) {
  require("./workload-control-contract").assertJsonLimits(value);
  c.need(Buffer.byteLength(JSON.stringify(value, null, 2) + "\n") <= 262144, "FORCE_REGISTRY_RECORD_TOO_LARGE");
  c.need(require("./validator-cli-prototype/validate").validatePayload(value, type).valid, "FORCE_REGISTRY_CONTRACT_INVALID"); return value;
}
function load(options) {
  const verification = artifacts.verifyRepositoryArtifacts({ repositoryPath: options.repository, artifactRoot: options.artifactRoot });
  const absent = verification.issues.length === 1 && ["ARTIFACT_ROOT_MISSING", "REPOSITORY_NAMESPACE_MISSING"].includes(verification.issues[0].code);
  if (!verification.valid && absent) return { verification, manifest: null, artifactRoot: path.resolve(options.artifactRoot) };
  c.need(verification.valid, "FORCE_REGISTRY_ARTIFACT_INTEGRITY_INVALID");
  return loadVerifiedStore(options.repository, options.artifactRoot);
}
function record(store, reference, kind) {
  const matches = (store.manifest?.artifacts || []).filter(entry => c.same(ref(entry), reference) && (!kind || entry.kind === kind));
  c.need(matches.length === 1, "FORCE_REGISTRY_REFERENCE_INVALID");
  const payload = JSON.parse(readEntry(store, matches[0])); c.need(payload.id === matches[0].artifact_id, "FORCE_REGISTRY_MANIFEST_ID_INVALID");
  return { entry: matches[0], payload, ref: reference };
}
function materials(store, request) {
  const refs = new Map(request.evidence_refs.map(reference => [c.digest(reference), reference]));
  if (request.entity.kind === "capability") {
    const reference = request.entity.data.standard_ref, match = (store.manifest?.artifacts || []).find(entry => c.same(ref(entry), reference));
    c.need(match?.kind === "capability-standards", "FORCE_REGISTRY_STANDARD_REQUIRED"); refs.set(c.digest(reference), reference);
  }
  let bytes = 0;
  return [...refs].sort(([left], [right]) => left.localeCompare(right)).map(([, reference]) => {
    const matches = (store.manifest?.artifacts || []).filter(entry => c.same(ref(entry), reference)); c.need(matches.length === 1, "FORCE_REGISTRY_REFERENCE_INVALID");
    const text = readEntry(store, matches[0]); bytes += Buffer.byteLength(text);
    c.need(require("./order-intake-contract").sha256(Buffer.from(text)) === reference.sha256, "FORCE_REGISTRY_MATERIAL_ENCODING_CHANGED");
    c.need(Buffer.byteLength(text) <= 65536 && bytes <= 131072, "FORCE_REGISTRY_MATERIAL_TOO_LARGE");
    return { reference, text };
  });
}
function replay(store, trustedPublicKey) {
  const eventEntries = (store.manifest?.artifacts || []).filter(entry => entry.kind === c.KINDS.events);
  const authorizations = (store.manifest?.artifacts || []).filter(entry => entry.kind === c.KINDS.authorizations);
  c.need(eventEntries.length <= 256 && authorizations.length <= 256, "FORCE_REGISTRY_HISTORY_LIMIT");
  const events = eventEntries.map(entry => ({ entry, ref: ref(entry), payload: checked(JSON.parse(readEntry(store, entry)), "force-registry-event") }));
  c.need(new Set(events.map(item => item.payload.sequence)).size === events.length, "FORCE_REGISTRY_HISTORY_FORK_OR_GAP");
  c.need(!events.length && !authorizations.length || trustedPublicKey, "FORCE_REGISTRY_OPERATOR_KEY_REQUIRED");
  events.sort((left, right) => left.payload.sequence - right.payload.sequence);
  const entities = new Map(), aliases = new Map(), consumed = new Set(), challenges = new Set(), nonces = new Set(); let head = { ...c.NONE }, sequence = 0, lastAt = -Infinity;
  for (const item of events) {
    const event = item.payload;
    c.need(event.id === item.entry.artifact_id && event.sequence === sequence + 1 && c.same(event.previous_ref, head), "FORCE_REGISTRY_HISTORY_FORK_OR_GAP");
    c.need(c.same(event.repository_binding, binding(store)), "FORCE_REGISTRY_REPOSITORY_SUBSTITUTED");
    const authorization = record(store, event.authorization_ref, c.KINDS.authorizations), value = checked(authorization.payload, "force-registry-authorization");
    c.verifyAuthorization(value, trustedPublicKey);
    c.need(store.manifestHistory.get(value.review.observed_manifest.revision) === value.review.observed_manifest.sha256,
      "FORCE_REGISTRY_REVIEW_SNAPSHOT_INVALID");
    c.need(!consumed.has(c.digest(authorization.ref)) && !challenges.has(value.challenge_id) && !nonces.has(value.nonce_sha256), "FORCE_REGISTRY_AUTHORIZATION_REPLAY");
    c.need(c.same(c.eventForAuthorization(value, authorization.ref), event), "FORCE_REGISTRY_EVENT_SUBSTITUTED");
    const proposal = record(store, event.proposal_ref, c.KINDS.proposals);
    c.need(c.same(checked(proposal.payload, "force-registry-proposal"), value.review.proposal), "FORCE_REGISTRY_PROPOSAL_SUBSTITUTED");
    const request = proposal.payload.request;
    for (const linked of [item.entry, authorization.entry, proposal.entry]) c.need(linked.mission_id === request.mission_id && linked.wave_id === request.wave_id, "FORCE_REGISTRY_MANIFEST_SCOPE_INVALID");
    const display = { ...value.review, materials: materials(store, request) };
    c.need(c.same(value.review, c.publicReview(display)) && value.displayed_review_sha256 === c.digest(display), "FORCE_REGISTRY_MATERIAL_OR_DISPLAY_SUBSTITUTED");
    const change = c.transition(entities, aliases, request);
    c.need(c.same(change.previous, value.review.previous_entity), "FORCE_REGISTRY_PREVIOUS_ENTITY_SUBSTITUTED");
    c.need(Date.parse(event.recorded_at) >= lastAt && Date.parse(event.recorded_at) <= Date.now(), "FORCE_REGISTRY_HISTORY_TIME_INVALID"); lastAt = Date.parse(event.recorded_at);
    entities.set(event.entity.id, event.entity);
    if (event.entity.kind === "capability") for (const alias of event.entity.data.aliases) aliases.set(c.digest(alias), event.entity.id);
    consumed.add(c.digest(authorization.ref)); challenges.add(value.challenge_id); nonces.add(value.nonce_sha256); sequence = event.sequence; head = item.ref;
  }
  const unresolved = [];
  for (const entry of authorizations) {
    if (consumed.has(c.digest(ref(entry)))) continue;
    const value = c.verifyAuthorization(checked(JSON.parse(readEntry(store, entry)), "force-registry-authorization"), trustedPublicKey);
    c.need(value.id === entry.artifact_id && c.same(value.review.repository_binding, binding(store)) &&
      entry.mission_id === value.review.proposal.request.mission_id && entry.wave_id === value.review.proposal.request.wave_id &&
      !challenges.has(value.challenge_id) && !nonces.has(value.nonce_sha256) &&
      store.manifestHistory.get(value.review.observed_manifest.revision) === value.review.observed_manifest.sha256, "FORCE_REGISTRY_UNRESOLVED_SCOPE_INVALID");
    const display = { ...value.review, materials: materials(store, value.review.proposal.request) };
    c.need(c.same(value.review, c.publicReview(display)) && value.displayed_review_sha256 === c.digest(display), "FORCE_REGISTRY_MATERIAL_OR_DISPLAY_SUBSTITUTED");
    unresolved.push(ref(entry));
  }
  return { entities, aliases, head, sequence, unresolved };
}
function inspection(options, trustedPublicKey) {
  const store = load(options), state = replay(store, trustedPublicKey);
  return { schema_version: "0.1", type: "ForceRegistryInspection", repository_binding: binding(store), observed_manifest: manifestState(store),
    status: state.unresolved.length ? "held" : state.sequence ? "enrolled_definitions" : "empty", head_ref: state.head, sequence: state.sequence,
    entities: [...state.entities.values()].sort((left, right) => left.id.localeCompare(right.id)), unresolved_authorization_refs: state.unresolved,
    qualification_state: "unassessed", ...c.FLAGS };
}
function propose(request, options) {
  checked(request, "force-registry-request"); const store = load(options); materials(store, request);
  const previous = manifestState(store), proposal = checked(c.createProposal(request), "force-registry-proposal");
  const written = artifacts.writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: options.artifactRoot, missionId: request.mission_id,
    waveId: request.wave_id, kind: c.KINDS.proposals, artifactId: proposal.id, payload: proposal, createdAt: proposal.created_at,
    publicationGuard: snapshot => { c.need((snapshot.manifest ? artifacts.manifestDigest(snapshot.manifest) : "none") === previous.sha256, "FORCE_REGISTRY_MANIFEST_STALE"); return true; } });
  return { proposal, proposal_ref: { artifact_id: proposal.id, relative_path: written.relative_path, sha256: written.sha256 }, ...c.FLAGS };
}
function prepareReview(configuration, input, ownAuthorizationRef = null) {
  const options = { repository: configuration.repository, artifactRoot: configuration.artifactRoot }, store = load(options);
  c.need(binding(store).identity_fingerprint === configuration.identity && manifestState(store).sha256 === input.manifest, "FORCE_REGISTRY_MANIFEST_STALE");
  const entries = (store.manifest?.artifacts || []).filter(entry => entry.kind === c.KINDS.proposals && entryId(entry) === input.entry_id);
  c.need(entries.length === 1, "FORCE_REGISTRY_PROPOSAL_NOT_FOUND");
  const proposal = checked(JSON.parse(readEntry(store, entries[0])), "force-registry-proposal"), state = replay(store, configuration.forceRegistryPublicKey);
  c.need(state.unresolved.every(reference => ownAuthorizationRef && c.same(reference, ownAuthorizationRef)), "FORCE_REGISTRY_RECONCILIATION_REQUIRED");
  c.need(entries[0].artifact_id === proposal.id, "FORCE_REGISTRY_MANIFEST_ID_INVALID");
  c.need(Date.parse(proposal.created_at) <= Date.now() && Date.parse(proposal.expires_at) > Date.now(), "FORCE_REGISTRY_PROPOSAL_EXPIRED");
  c.need(c.same(proposal.request.expected_head_ref, state.head), "FORCE_REGISTRY_HEAD_STALE");
  c.need(entries[0].mission_id === proposal.request.mission_id && entries[0].wave_id === proposal.request.wave_id, "FORCE_REGISTRY_MANIFEST_SCOPE_INVALID");
  const change = c.transition(state.entities, state.aliases, proposal.request);
  const review = { proposal_ref: ref(entries[0]), proposal, materials: materials(store, proposal.request), registry_head_ref: state.head,
    previous_entity: change.previous, next_sequence: state.sequence + 1, repository_binding: binding(store), observed_manifest: manifestState(store),
    source_state_sha256: repositoryStateDigest(__dirname), repository_state_sha256: repositoryStateDigest(options.repository) };
  c.need(review.source_state_sha256 === configuration.sourceSha256 && manifestState(load(options)).sha256 === input.manifest, "FORCE_REGISTRY_SOURCE_OR_MANIFEST_CHANGED");
  c.need(Buffer.byteLength(JSON.stringify(review, null, 2) + "\n") <= 196608, "FORCE_REGISTRY_REVIEW_TOO_LARGE"); return review;
}
function lookupCapability(options, trustedPublicKey, role, task) {
  const store = load(options), state = replay(store, trustedPublicKey), id = state.aliases.get(c.digest({ operational_role: role, task }));
  return { capability: id ? state.entities.get(id) : null, head_ref: state.head, held: !!state.unresolved.length,
    match_basis: "explicit_reviewed_alias_history_only", qualification_state: "unassessed", ...c.FLAGS };
}
module.exports = { checked, load, ref, record, binding, manifestState, materials, replay, inspection, propose, prepareReview, lookupCapability };
