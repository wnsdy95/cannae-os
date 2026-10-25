const fs = require("node:fs"), path = require("node:path"), { z } = require("zod");
const t = require("./task-training-contract"), c = require("./native-training-product-contract"), force = require("./force-registry-controller");
const artifacts = require("./repository-artifact-store"), { repositoryStateDigest } = require("./skill-mission-controller");
const { keyDigest } = require("./operator-consent-contract"), { historicalSettlementStore } = require("./effect-settlement-proof");
const read = require("./task-training-controller").record, same = (left, right) => t.digest(left) === t.digest(right);
function subject(store, reference, key, at, reviewed = false) {
  const proposed = read(store, reference, c.KIND), request = c.checked(proposed.payload, "native-training-product-request"), now = Date.parse(at);
  c.need(proposed.entry.mission_id === request.mission_id && proposed.entry.wave_id === request.wave_id &&
    Date.parse(request.created_at) <= now && now < Date.parse(request.expires_at), "SEMANTIC_TRAINING_REQUEST_SCOPE_INVALID");
  const registry = force.replay(store, key);
  c.need(!registry.unresolved.length && same(registry.head, request.registry_head_ref), "SEMANTIC_TRAINING_REGISTRY_CHANGED");
  const capability = registry.entities.get(request.capability_id), performer = registry.entities.get(request.performer_id);
  c.need(capability?.kind === "capability" && performer?.kind === "performer" &&
    [capability, performer].every(value => value.enrollment_state === "enrolled"), "SEMANTIC_TRAINING_SUBJECT_UNAVAILABLE");
  const standardRecord = read(store, capability.data.standard_ref, "capability-standards"), standard = t.checked(standardRecord.payload, "task-training-standard");
  c.need(standard.schema_version === "0.2", "SEMANTIC_TRAINING_NATIVE_STANDARD_REQUIRED");
  c.need(standard.capability_id === capability.id && standard.metl_id === capability.data.metl_id &&
    standard.performer_organization_id === performer.data.owner_id && performer.data.provider === "codex", "SEMANTIC_TRAINING_DEFINITION_SCOPE_INVALID");
  const trainingCase = standard.cases.find(value => value.case_id === request.case_id);
  c.need(trainingCase && Date.parse(standard.created_at) <= now && now < Date.parse(standard.expires_at), "SEMANTIC_TRAINING_CASE_NOT_CURRENT");
  const context = read(store, request.context_ref, "agent-context-packs", "agent-context-pack");
  const plan = read(store, context.payload.plan_ref, "mission-wave-plans", "mission-wave-plan");
  c.need([context, plan].every(value => value.entry.mission_id === request.mission_id && value.entry.wave_id === request.wave_id &&
    value.payload.mission_id === request.mission_id && value.payload.wave_id === request.wave_id) && now < Date.parse(plan.payload.valid_until) &&
    capability.data.aliases.some(alias => alias.operational_role === context.payload.operational_role && alias.task === context.payload.task), "SEMANTIC_TRAINING_CONTEXT_SCOPE_INVALID");
  c.need(!store.manifest.artifacts.some(value => value.kind === "mission-wave-terminations" && value.mission_id === request.mission_id && value.wave_id === request.wave_id),
    "SEMANTIC_TRAINING_WAVE_TERMINATED");
  require("./campaign-stop-controller").assertMissionNotStopped(store, request.mission_id);
  const transfer = { request, training_case: trainingCase, standard, capability, performer, context: context.payload, plan: plan.payload };
  c.assertTransferPermitted(transfer);
  if (reviewed) {
    transfer.source_standard = { ref: capability.data.standard_ref, mission_id: standardRecord.entry.mission_id, wave_id: standardRecord.entry.wave_id };
    const contract = require("./native-training-transfer-contract"), candidates = store.manifest.artifacts.filter(entry => entry.kind === contract.KINDS.reviews)
      .map(entry => ({ entry, value: read(store, force.ref(entry), contract.KINDS.reviews).payload })).filter(item => same(item.value.request_ref, reference));
    c.need(candidates.length === 1, "SEMANTIC_TRAINING_TRANSFER_REVIEW_REQUIRED");
    const selected = candidates[0], sources = store.manifest.artifacts.filter(entry => entry.kind === "classification-labels")
      .map(entry => read(store, force.ref(entry), "classification-labels", "classification-label")).filter(record =>
        record.payload.subject_id === request.id && record.payload.mission_id === request.mission_id ||
        record.payload.subject_id === standard.id && [request.mission_id, standardRecord.entry.mission_id].includes(record.payload.mission_id));
    for (const record of sources) c.need(record.entry.mission_id === record.payload.mission_id && record.entry.artifact_id === record.payload.id, "SEMANTIC_TRAINING_SOURCE_LABEL_SCOPE_INVALID");
    const labels = sources.map(record => record.payload);
    contract.validateReview(selected.value, transfer, reference, at, labels);
    transfer.transfer_review = { ref: force.ref(selected.entry), request: selected.value, retained_labels: labels, retained_label_refs: sources.map(record => force.ref(record.entry)) };
  }
  return transfer;
}
function propose(input, options) {
  const value = c.request(input), store = force.load(options), before = force.manifestState(store);
  const write = artifacts.writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: options.artifactRoot, missionId: value.mission_id,
    waveId: value.wave_id, kind: c.KIND, artifactId: value.id, payload: value, publicationGuard: snapshot => {
      c.need((snapshot.manifest ? artifacts.manifestDigest(snapshot.manifest) : "none") === before.sha256, "SEMANTIC_TRAINING_MANIFEST_CHANGED"); return true;
    } });
  return { request: value, request_ref: { artifact_id: value.id, relative_path: write.relative_path, sha256: write.sha256 }, ...t.FLAGS };
}
function prepareProduct(options, trustedPublicKey) {
  const repository = fs.realpathSync(options.repository), artifactRoot = fs.realpathSync(options.artifactRoot), store = force.load({ repository, artifactRoot });
  const at = options.now || new Date().toISOString(), entries = store.manifest.artifacts.filter(value => value.kind === c.KIND && value.artifact_id === options.requestId);
  c.need(entries.length === 1 && Number.isFinite(Date.parse(at)) && trustedPublicKey, "SEMANTIC_TRAINING_REQUEST_REQUIRED");
  const requestRef = force.ref(entries[0]), input = subject(store, requestRef, trustedPublicKey, at, options.reviewed === true);
  const reviewExpiry = options.reviewed === true ? require("./native-training-transfer-contract").validateReview(input.transfer_review.request, input, requestRef, at, input.transfer_review.retained_labels) : Infinity;
  const body = { schema_version: options.reviewed === true ? "0.2" : "0.1", type: "NativeTrainingProductPreview", repository, artifact_root: artifactRoot,
    ...force.binding(store), request_ref: requestRef, mission_id: input.request.mission_id, wave_id: input.request.wave_id,
    identity_fingerprint: force.binding(store).identity_fingerprint, repository_state_sha256: repositoryStateDigest(repository), doctrine_state_sha256: repositoryStateDigest(__dirname),
    observed_manifest: force.manifestState(store), trusted_registry_key_sha256: keyDigest(trustedPublicKey), prepared_at: at,
    expires_at: new Date(Math.min(Date.parse(at) + 300000, Date.parse(input.request.expires_at), Date.parse(input.standard.expires_at), Date.parse(input.plan.valid_until), reviewExpiry)).toISOString(),
    input, method_sha256: c.methodBinding(), response_schema: z.toJSONSchema(c.RESPONSE), prompt: c.promptFor(input), ...t.FLAGS };
  c.need(same(force.manifestState(force.load({ repository, artifactRoot })), body.observed_manifest), "SEMANTIC_TRAINING_MANIFEST_CHANGED");
  return { ...body, preview_sha256: t.digest(body) };
}
function revalidatePreview(preview, at = new Date().toISOString()) {
  c.need(Buffer.byteLength(JSON.stringify(preview)) <= 1048576, "SEMANTIC_TRAINING_PREVIEW_TOO_LARGE");
  const { preview_sha256, ...body } = preview;
  c.need(preview.type === "NativeTrainingProductPreview" && preview_sha256 === t.digest(body), "SEMANTIC_TRAINING_PREVIEW_SUBSTITUTED");
  c.need(Date.parse(preview.prepared_at) <= Date.parse(at) && Date.parse(at) < Date.parse(preview.expires_at), "SEMANTIC_TRAINING_PREVIEW_EXPIRED");
  c.need(preview.method_sha256 === c.methodBinding() && preview.prompt === c.promptFor(preview.input) && same(preview.response_schema, z.toJSONSchema(c.RESPONSE)),
    "SEMANTIC_TRAINING_METHOD_CHANGED");
  c.need(repositoryStateDigest(__dirname) === preview.doctrine_state_sha256 && repositoryStateDigest(preview.repository) === preview.repository_state_sha256 &&
    same(force.manifestState(force.load({ repository: preview.repository, artifactRoot: preview.artifact_root })), preview.observed_manifest), "SEMANTIC_TRAINING_SCOPE_CHANGED");
  return true;
}
function verifyScope(preview, configuration) {
  revalidatePreview(preview);
  const key = configuration.forceRegistryPublicKey || configuration.trustedPublicKey;
  c.need(key && keyDigest(key) === preview.trusted_registry_key_sha256 && prepareProduct({ repository: preview.repository, artifactRoot: preview.artifact_root,
    requestId: preview.request_ref.artifact_id, now: preview.prepared_at, reviewed: preview.schema_version === "0.2" }, key).preview_sha256 === preview.preview_sha256, "SEMANTIC_TRAINING_ORIGINAL_SUBJECT_CHANGED");
}
function verifyHistoricalSubject(preview, key) {
  const { preview_sha256, ...body } = preview;
  c.need(keyDigest(key) === preview.trusted_registry_key_sha256 && preview.type === "NativeTrainingProductPreview" && preview_sha256 === t.digest(body) &&
    preview.prompt === c.promptFor(preview.input) && same(preview.response_schema, z.toJSONSchema(c.RESPONSE)), "SEMANTIC_TRAINING_HISTORICAL_METHOD_CHANGED");
  c.historicalProducer(preview);
  const store = force.load({ repository: preview.repository, artifactRoot: preview.artifact_root });
  const prefix = same(force.manifestState(store), preview.observed_manifest) ? store :
    historicalSettlementStore(store, preview.observed_manifest.revision, preview.observed_manifest.sha256);
  c.need(same(subject(prefix, preview.request_ref, key, preview.prepared_at, preview.schema_version === "0.2"), preview.input), "SEMANTIC_TRAINING_HISTORICAL_SUBJECT_CHANGED");
}
function verifyPublicationScope(preview, key, expected) {
  c.need(Date.parse(preview.prepared_at) <= Date.now() && Date.now() < Date.parse(preview.expires_at), "SEMANTIC_TRAINING_PREVIEW_EXPIRED");
  const current = prepareProduct({ repository: preview.repository, artifactRoot: preview.artifact_root, requestId: preview.request_ref.artifact_id,
    now: preview.prepared_at, reviewed: true }, key), body = value => { const { observed_manifest, preview_sha256, ...rest } = value; return rest; };
  c.need(current.observed_manifest.sha256 === expected && same(body(current), body(preview)), "SEMANTIC_TRAINING_PUBLICATION_SCOPE_CHANGED");
}
module.exports = { propose, prepareProduct, revalidatePreview, verifyScope, verifyHistoricalSubject, verifyPublicationScope };
