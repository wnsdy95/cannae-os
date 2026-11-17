const fs = require("node:fs"), path = require("node:path"), { z } = require("zod");
const t = require("./task-training-contract"), c = require("./native-training-product-contract"), scope = require("./native-training-product-controller");
const { sha256 } = require("./order-intake-contract"), { createCollector } = require("./codex-bounded-collector");
const collector = createCollector({ invocationType: "CodexTrainingProductInvocation", collectionType: "CodexTrainingProductCollection",
  consentType: "TrainingProductTransferConsent", purpose: c.PURPOSE, revalidatePreview: scope.revalidatePreview,
  verifyProfile: c.verifyProfile, verifyScope: scope.verifyScope, assessResponse: c.assessResponse,
  collectionIdentity: preview => ({ collection_id: preview.input.request.collection_id, request_ref: preview.request_ref }) });
function readPrivate(root, name, maximum = 1048576, json = true) {
  const parent = fs.lstatSync(root); c.need(parent.isDirectory() && !parent.isSymbolicLink() && parent.uid === process.getuid() && (parent.mode & 0o077) === 0,
    "SEMANTIC_TRAINING_JOURNAL_UNSAFE");
  const file = path.join(root, name), fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { const stat = fs.fstatSync(fd); c.need(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid() && stat.size <= maximum && (stat.mode & 0o077) === 0,
    "SEMANTIC_TRAINING_JOURNAL_UNSAFE"); const bytes = fs.readFileSync(fd); c.need(bytes.length === stat.size && Buffer.from(bytes.toString("utf8")).equals(bytes),
    "SEMANTIC_TRAINING_JOURNAL_CHANGED"); return { value: json ? JSON.parse(bytes.toString("utf8")) : null, bytes, sha256: sha256(bytes) };
  } finally { fs.closeSync(fd); }
}
function readProduct(invocation, consent, configuration) {
  c.need(z.uuid().safeParse(consent?.id).success && path.isAbsolute(configuration.stateRoot), "SEMANTIC_TRAINING_JOURNAL_SCOPE_INVALID");
  const stateRoot = fs.realpathSync(configuration.stateRoot), directory = path.join(stateRoot, consent.id), stat = fs.lstatSync(directory);
  c.need(!stat.isSymbolicLink() && stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0,
    "SEMANTIC_TRAINING_JOURNAL_UNSAFE");
  const originalInvocation = readPrivate(directory, "invocation.json").value, originalConsent = readPrivate(directory, "consent.json").value;
  c.need(t.digest(originalInvocation) === t.digest(invocation) && t.digest(originalConsent) === t.digest(consent), "SEMANTIC_TRAINING_JOURNAL_SUBSTITUTED");
  const journal = readPrivate(directory, "result.json"), result = journal.value;
  collector.verifyTransferConsent(consent, invocation, configuration.trustedPublicKey, Date.parse(result.started_at));
  scope.verifyHistoricalSubject(invocation.preview, configuration.forceRegistryPublicKey || configuration.trustedPublicKey); c.verifyHistoricalProfile(invocation.profile, invocation.preview);
  const reservation = readPrivate(path.join(stateRoot, `collection-${invocation.preview.input.request.collection_id}`), "reservation.json").value;
  c.need(result.type === "CodexTrainingProductCollection" && result.invocation_sha256 === invocation.invocation_sha256 && result.consent_id === consent.id &&
    result.status === "evaluated" && result.result_persisted && result.actual_model_invocation_started && result.completed_turns === 1 && result.event_counts["thread.started"] === 1 &&
    result.event_counts["turn.started"] === 1 && z.uuid().safeParse(result.native_thread_id).success && result.process_exit_confirmed && result.process_group_absent &&
    result.exit_code === 0 && !result.signal && result.failure_reasons.length === 0 &&
    t.digest(result.collection_identity) === t.digest({ collection_id: invocation.preview.input.request.collection_id, request_ref: invocation.preview.request_ref }) &&
    reservation.collection_id === result.collection_identity.collection_id && t.digest(reservation.request_ref) === t.digest(invocation.preview.request_ref) &&
    reservation.invocation_sha256 === invocation.invocation_sha256 && reservation.consent_id === consent.id && reservation.consent_sha256 === t.digest(consent) &&
    Date.parse(reservation.reserved_at) <= Date.parse(result.started_at) && Date.parse(result.started_at) <= Date.parse(result.ended_at) &&
    Date.parse(result.ended_at) <= Date.parse(invocation.preview.expires_at) && Date.parse(result.ended_at) <= Date.now(), "SEMANTIC_TRAINING_COLLECTION_NOT_BOUND");
  const response = readPrivate(directory, "response.json");
  c.need(response.sha256 === result.response_sha256 && t.digest(c.assessResponse(response.value, invocation.preview)) === t.digest(result.assessment),
    "SEMANTIC_TRAINING_RESPONSE_CHANGED");
  const stream = readPrivate(directory, "native-events.jsonl", 1048576, false);
  c.need(stream.sha256 === result.native_events_sha256 && stream.sha256 === result.stdout_sha256, "SEMANTIC_TRAINING_NATIVE_EVENTS_CHANGED");
  const counts = {}; let thread = null, begun = false, ended = false, final = null;
  for (const line of stream.bytes.toString("utf8").split("\n").filter(value => value.trim())) {
    const event = JSON.parse(line); counts[event.type] = (counts[event.type] || 0) + 1;
    if (event.type === "thread.started") {
      c.need(!thread && !begun && z.uuid().safeParse(event.thread_id).success, "SEMANTIC_TRAINING_NATIVE_EVENTS_INVALID"); thread = event.thread_id;
    } else if (event.type === "turn.started") {
      c.need(thread && !begun && !ended, "SEMANTIC_TRAINING_NATIVE_EVENTS_INVALID"); begun = true;
    } else if (event.type === "turn.completed") {
      c.need(begun && !ended, "SEMANTIC_TRAINING_NATIVE_EVENTS_INVALID"); ended = true;
    } else {
      c.need(event.type?.startsWith("item.") && begun && !ended && (["agent_message", "reasoning"].includes(event.item?.type) ||
        event.item?.type === "error" && event.item.message === "Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`."),
      "SEMANTIC_TRAINING_NATIVE_EVENTS_INVALID");
      if (event.type === "item.completed" && event.item.type === "agent_message") final = event.item.text;
    }
  }
  c.need(thread === result.native_thread_id && ended && t.digest(counts) === t.digest(result.event_counts) && typeof final === "string" &&
    t.digest(JSON.parse(final)) === t.digest(response.value), "SEMANTIC_TRAINING_NATIVE_EVENTS_INVALID");
  const bytes = Buffer.from(response.value.output), body = { schema_version: "0.1", type: "NativeTrainingProductAppraisal",
    collection_id: result.collection_identity.collection_id, request_ref: invocation.preview.request_ref, invocation_sha256: invocation.invocation_sha256,
    consent_sha256: t.digest(consent), journal_sha256: journal.sha256, native_thread_id: result.native_thread_id,
    observed_output_sha256: sha256(bytes), observed_output_bytes: bytes.length, status: "native_task_bytes_bound", native_account_identity_attested: false,
    pre_inference_native_identity_attested: false, model_snapshot_attested: false, actual_model_execution_attested: false, conditions_observed: false, task_standard_evaluated: false,
    evaluator_authenticated: false, ...t.FLAGS };
  return { appraisal: c.checked(t.identified("NTPA", body), "native-training-product-appraisal"), bytes };
}
module.exports = { ...collector, preparePerformerCommitments: options => c.commitments(collector.prepareProfile(options)), readProduct };
