const fs = require("node:fs"), path = require("node:path");
const t = require("./task-training-contract"), c = require("./native-training-transfer-contract"), core = require("./native-training-product-controller");
const force = require("./force-registry-controller"), collector = require("./codex-training-product-collector"), artifacts = require("./repository-artifact-store");
const { sha256 } = require("./order-intake-contract"), { digest, signOperatorRecord } = require("./operator-consent-contract");
function canonicalScopePath(file) {
  const target = path.resolve(file); let parent = target;
  while (!fs.existsSync(parent)) { c.need(path.dirname(parent) !== parent, "CONSOLE_TRAINING_ARTIFACT_ROOT_INVALID"); parent = path.dirname(parent); }
  return path.resolve(fs.realpathSync(parent), path.relative(parent, target));
}
function assertRoot(configuration) {
  c.need(configuration.trainingArtifactRoot && fs.realpathSync(configuration.artifactRoot) === configuration.trainingArtifactRoot,
    "CONSOLE_TRAINING_ARTIFACT_ROOT_CHANGED");
}
function proposeReview(input, options) {
  const value = c.review(input), store = force.load(options), before = force.manifestState(store);
  const write = artifacts.writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: options.artifactRoot, missionId: value.mission_id,
    waveId: value.wave_id, kind: c.KINDS.reviews, artifactId: value.id, payload: value,
    publicationGuard: snapshot => { c.need(snapshot.manifest && artifacts.manifestDigest(snapshot.manifest) === before.sha256, "SEMANTIC_TRAINING_MANIFEST_CHANGED"); return true; } });
  return { request: value, request_ref: { artifact_id: value.id, relative_path: write.relative_path, sha256: write.sha256 }, ...t.FLAGS };
}
function prepare(configuration, request) {
  c.need(configuration.training && configuration.forceRegistryPublicKey, "CONSOLE_MODEL_NOT_CONFIGURED");
  assertRoot(configuration);
  const store = force.load({ repository: configuration.repository, artifactRoot: configuration.artifactRoot });
  c.need(force.manifestState(store).sha256 === request.manifest, "CONSOLE_EVIDENCE_SNAPSHOT_STALE");
  const entries = store.manifest.artifacts.filter(entry => require("./operator-console-evidence").entryId(entry) === request.entry_id && entry.kind === require("./native-training-product-contract").KIND);
  c.need(entries.length === 1, "CONSOLE_TRAINING_PRODUCT_REQUEST_REQUIRED");
  return collector.prepareInvocation(core.prepareProduct({ repository: configuration.repository, artifactRoot: configuration.artifactRoot,
    requestId: entries[0].artifact_id, reviewed: true }, configuration.forceRegistryPublicKey), configuration.training);
}
function init(db) { db.exec("CREATE TABLE IF NOT EXISTS operator_native_training_authorizations (action_id TEXT PRIMARY KEY, authorization TEXT NOT NULL)"); }
function authorize(db, row, invocation, key) {
  c.need(invocation.preview.schema_version === "0.2" && invocation.preview.input.transfer_review, "CONSOLE_TRAINING_REVIEW_REQUIRED");
  const value = signOperatorRecord({ schema_version: "0.1", type: "NativeTrainingTransferAuthorization", id: `NTFA-${row.id}`,
    purpose: "authorize_one_reviewed_native_training_transfer", action_id: row.id, request_ref: invocation.preview.request_ref,
    transfer_review_ref: invocation.preview.input.transfer_review.ref, invocation_sha256: invocation.invocation_sha256, preview_sha256: invocation.preview.preview_sha256,
    displayed_invocation_sha256: invocation.invocation_sha256, principal_id: row.principal_id, principal_epoch: row.epoch,
    authentication_method: "local_owner_password_reauthentication", session_sha256: row.session_hash, nonce_sha256: row.nonce_hash, rationale_sha256: sha256(row.rationale),
    mission_handling_acknowledged: true, handling_completeness_independently_attested: false,
    created_at: new Date().toISOString(), expires_at: new Date(row.expires).toISOString(), ...t.FLAGS }, key);
  c.checked(value, "native-training-transfer-authorization");
  db.prepare("INSERT INTO operator_native_training_authorizations VALUES (?,?)").run(row.id, JSON.stringify(value)); return value;
}
function authorization(db, row, invocation, key) {
  const stored = db.prepare("SELECT authorization FROM operator_native_training_authorizations WHERE action_id=?").get(row.id);
  c.need(stored, "CONSOLE_TRAINING_AUTHORIZATION_MISSING");
  const value = c.verifySigned(JSON.parse(stored.authorization), "native-training-transfer-authorization", key);
  c.need(value.action_id === row.id && value.principal_id === row.principal_id && value.principal_epoch === row.epoch && value.session_sha256 === row.session_hash &&
    value.nonce_sha256 === row.nonce_hash && value.rationale_sha256 === sha256(row.rationale || "") && value.invocation_sha256 === invocation.invocation_sha256 &&
    value.preview_sha256 === invocation.preview.preview_sha256 && digest(value.request_ref) === digest(invocation.preview.request_ref) &&
    digest(value.transfer_review_ref) === digest(invocation.preview.input.transfer_review.ref) && Date.parse(value.expires_at) === row.expires,
  "CONSOLE_TRAINING_AUTHORIZATION_CHANGED"); return value;
}
function inventory(db, root, key) {
  const known = new Map(db.prepare("SELECT * FROM operator_model_actions").all().filter(row => {
    try { return JSON.parse(row.preview).type === "CodexTrainingProductInvocation"; } catch { return false; }
  }).map(row => [row.id, { row, invocation: JSON.parse(row.preview) }])), orphans = [];
  function binding(actionId) {
    const entry = known.get(actionId); c.need(entry?.row.consent && !["pending", "invalidated", "expired"].includes(entry.row.state), "CONSOLE_TRAINING_RESERVATION_NOT_AUTHORIZED");
    const consent = JSON.parse(entry.row.consent), a = authorization(db, entry.row, entry.invocation, key);
    collector.verifyTransferConsent(consent, entry.invocation, key, Date.parse(consent.created_at)); return { ...entry, consent, authorization: a };
  }
  for (const row of db.prepare("SELECT action_id FROM operator_native_training_authorizations").all()) {
    try { binding(row.action_id); } catch { orphans.push({ code: "CONSOLE_TRAINING_ORPHAN_AUTHORIZATION", action_id: row.action_id }); }
  }
  const names = fs.readdirSync(root);
  if (names.length > 2000) return { retained_attempt_count: known.size, orphaned: [{ code: "CONSOLE_TRAINING_INVENTORY_LIMIT" }], clear: false };
  for (const name of names) {
    if (!name.startsWith("collection-")) continue;
    try {
      const stat = fs.lstatSync(path.join(root, name)); c.need(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0 &&
        fs.lstatSync(path.join(root, name, "reservation.json")).size <= 16384, "CONSOLE_TRAINING_RESERVATION_UNSAFE");
      const reservation = require("./operator-model-reconciliation-service").readJournal(path.join(root, name), "reservation.json").value;
      const { invocation, consent, authorization: a } = binding(reservation.consent_id);
      c.need(name === `collection-${reservation.collection_id}` && reservation.collection_id === invocation.preview.input.request.collection_id &&
        reservation.invocation_sha256 === invocation.invocation_sha256 && reservation.consent_sha256 === digest(consent) &&
        digest(reservation.request_ref) === digest(invocation.preview.request_ref) && Date.parse(a.created_at) <= Date.parse(reservation.reserved_at) &&
        Date.parse(reservation.reserved_at) < Date.parse(a.expires_at),
        "CONSOLE_TRAINING_ORPHAN_RESERVATION");
    } catch { orphans.push({ code: "CONSOLE_TRAINING_ORPHAN_RESERVATION", directory_sha256: sha256(name) }); }
  }
  return { retained_attempt_count: known.size, orphaned: orphans, clear: orphans.length === 0 };
}
function verifyResult(result, row, invocation, consent, key, db, configuration, stateRoot) {
  assertRoot(configuration);
  c.verifySigned(result, "operator-native-training-product", key); const a = authorization(db, row, invocation, key);
  c.need(result.action_id === row.id && result.invocation_sha256 === invocation.invocation_sha256 && result.consent_sha256 === digest(consent) &&
    result.authorization_sha256 === digest(a) && result.rationale_sha256 === sha256(row.rationale || "") && result.status === (row.state === "evaluated" ? "collected" : row.state),
  "CONSOLE_TRAINING_RESULT_CHANGED");
  core.verifyHistoricalSubject(invocation.preview, key);
  if (result.status === "collected") {
    const original = collector.readProduct(invocation, consent, { trustedPublicKey: key, stateRoot });
    const journal = require("./operator-model-reconciliation-service").readJournal(path.join(stateRoot, row.id), "result.json").value;
    c.need(Date.parse(a.created_at) <= Date.parse(journal.started_at) && Date.parse(journal.ended_at) <= Date.parse(a.expires_at), "CONSOLE_TRAINING_AUTHORIZATION_NOT_PREEXECUTION");
    c.need(digest(original.appraisal) === digest(result.appraisal) && result.output_ref.sha256 === sha256(original.bytes), "CONSOLE_TRAINING_PRODUCT_CHANGED");
    const store = force.load(configuration), read = require("./task-training-controller").record;
    c.need(digest(read(store, result.authorization_ref, c.KINDS.authorizations).payload) === digest(a), "CONSOLE_TRAINING_AUTHORIZATION_CHANGED");
    const entry = store.manifest.artifacts.find(value => value.kind === c.KINDS.results && value.artifact_id === result.id);
    c.need(entry && digest(read(store, force.ref(entry), c.KINDS.results).payload) === digest(result) &&
      store.manifest.artifacts.some(value => value.kind === c.KINDS.outputs && digest(force.ref(value)) === digest(result.output_ref)), "CONSOLE_TRAINING_PUBLICATION_CHANGED");
  }
  return true;
}
function publish({ invocation, consent, collection, db, row, configuration, stateRoot, key, signingKey, guard, artifactsWritten }) {
  assertRoot(configuration);
  const a = authorization(db, row, invocation, key), original = collector.readProduct(invocation, consent, { trustedPublicKey: key, stateRoot });
  const journal = require("./operator-model-reconciliation-service").readJournal(path.join(stateRoot, row.id), "result.json").value;
  c.need(Date.parse(a.created_at) <= Date.parse(journal.started_at) && Date.parse(journal.ended_at) <= Date.parse(a.expires_at), "CONSOLE_TRAINING_AUTHORIZATION_NOT_PREEXECUTION");
  c.need(collection.journal_sha256 === original.appraisal.journal_sha256, "CONSOLE_TRAINING_COLLECTION_CHANGED");
  const review = invocation.preview.input.transfer_review.request, detector = require("./eefi-detector");
  if (review.mission_eefi_items.length) c.need(!detector.detectEefi({ output: original.bytes.toString("utf8") }, detector.compileEefiItems(review.mission_eefi_items)).length,
    "SEMANTIC_TRAINING_MISSION_OUTPUT_QUARANTINED");
  let expected = invocation.preview.observed_manifest.sha256;
  const publicationGuard = snapshot => { guard(); assertRoot(configuration); c.need(snapshot.manifest && artifacts.manifestDigest(snapshot.manifest) === expected, "CONSOLE_TRAINING_PUBLICATION_CHANGED");
    core.verifyPublicationScope(invocation.preview, key, expected); return true; };
  const base = { repositoryPath: configuration.repository, artifactRoot: invocation.preview.artifact_root, missionId: invocation.preview.mission_id,
    waveId: invocation.preview.wave_id, publicationGuard, reuseExisting: false };
  const accept = (write, artifactId) => { const ref = { artifact_id: artifactId, relative_path: write.relative_path, sha256: write.sha256 };
    expected = write.manifest_sha256; artifactsWritten.push(ref); return ref; };
  const authorizationRef = accept(artifacts.writeRepositoryArtifact({ ...base, kind: c.KINDS.authorizations, artifactId: a.id, payload: a }), a.id);
  const file = path.join(stateRoot, row.id, "task-product.txt"), fd = fs.openSync(file, "wx", 0o600);
  try { fs.writeFileSync(fd, original.bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const outputId = `NTO-${invocation.preview.input.request.collection_id}`, write = artifacts.writeRepositoryFileArtifact({ ...base, kind: c.KINDS.outputs,
    artifactId: outputId, sourcePath: file, expectedSha256: sha256(original.bytes) });
  accept(write, outputId); const outputRef = { artifact_id: outputId, relative_path: write.relative_path, sha256: write.sha256 };
  const result = signOperatorRecord({ schema_version: "0.1", type: "OperatorNativeTrainingProduct", id: `NTOR-${row.id}`, action_id: row.id, status: "collected",
    invocation_sha256: invocation.invocation_sha256, consent_sha256: digest(consent), authorization_sha256: digest(a), rationale_sha256: sha256(row.rationale || ""),
    ended_at: new Date().toISOString(), collection, appraisal: original.appraisal, output_ref: outputRef, authorization_ref: authorizationRef,
    retained_artifact_refs: [...artifactsWritten], error: null, task_standard_evaluated: false, evaluator_authenticated: false,
    publication_finality_independently_attested: false, ...t.FLAGS }, signingKey);
  c.checked(result, "operator-native-training-product");
  accept(artifacts.writeRepositoryArtifact({ ...base, kind: c.KINDS.results, artifactId: result.id, payload: result }), result.id); guard(); return result;
}
function publicationInventory(invocation, actionId, configuration) {
  assertRoot(configuration);
  const store = force.load(configuration), selected = { [c.KINDS.authorizations]: `NTFA-${actionId}`,
    [c.KINDS.outputs]: `NTO-${invocation.preview.input.request.collection_id}`, [c.KINDS.results]: `NTOR-${actionId}` };
  return { observed_manifest: force.manifestState(store), entries: store.manifest.artifacts.filter(entry => selected[entry.kind] === entry.artifact_id).map(entry => ({ kind: entry.kind, ...force.ref(entry) })),
    operation_settlement_authorized: false, ...t.FLAGS };
}
module.exports = { canonicalScopePath, assertRoot, proposeReview, prepare, init, authorize, authorization, inventory, verifyResult, publish, publicationInventory };
