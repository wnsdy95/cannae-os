const fs = require("node:fs"), path = require("node:path"), { z } = require("zod");
const t = require("./task-training-contract"), c = require("./native-training-product-contract"), transfer = require("./native-training-transfer-contract"), native = require("./operator-native-training");
const collector = require("./codex-training-product-collector"), contract = require("./operator-native-training-reconciliation-contract"), force = require("./force-registry-controller");
const { sha256 } = require("./order-intake-contract"), { keyDigest } = require("./operator-consent-contract"), source = require("./task-training-controller");
const need = (value, code) => { if (!value) throw new Error(code); }, same = (left, right) => t.digest(left) === t.digest(right);
function privateDirectory(directory) {
  const stat = fs.lstatSync(directory); need(fs.realpathSync(directory) === directory && stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() &&
    (stat.mode & 0o077) === 0, "CONSOLE_NATIVE_RECONCILIATION_JOURNAL_UNSAFE"); return directory;
}
function read(directory, name, json = true) {
  privateDirectory(directory); const fd = fs.openSync(path.join(directory, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { const stat = fs.fstatSync(fd); need(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid() && (stat.mode & 0o077) === 0 && stat.size > 0 && stat.size <= 1048576,
    "CONSOLE_NATIVE_RECONCILIATION_JOURNAL_UNSAFE"); const bytes = fs.readFileSync(fd);
    need(bytes.length === stat.size && Buffer.from(bytes.toString("utf8")).equals(bytes), "CONSOLE_NATIVE_RECONCILIATION_JOURNAL_CHANGED");
    return { bytes, sha256: sha256(bytes), value: json ? JSON.parse(bytes.toString("utf8")) : null };
  } finally { fs.closeSync(fd); }
}
function absent(pid) { try { process.kill(pid, 0); return false; } catch (error) { return error.code === "ESRCH"; } }
function nativeResponse(stream, journal) {
  const counts = {}; let thread = null, started = false, ended = false, final = null;
  for (const line of stream.bytes.toString("utf8").split("\n").filter(value => value.trim())) {
    const event = JSON.parse(line); need(event && typeof event === "object" && !Array.isArray(event), "CONSOLE_NATIVE_RECONCILIATION_EVENTS_INVALID");
    counts[event.type] = (counts[event.type] || 0) + 1;
    if (event.type === "thread.started") {
      need(!thread && !started && !ended && z.uuid().safeParse(event.thread_id).success, "CONSOLE_NATIVE_RECONCILIATION_EVENTS_INVALID"); thread = event.thread_id;
    } else if (event.type === "turn.started") { need(thread && !started && !ended, "CONSOLE_NATIVE_RECONCILIATION_EVENTS_INVALID"); started = true;
    } else if (event.type === "turn.completed") { need(started && !ended, "CONSOLE_NATIVE_RECONCILIATION_EVENTS_INVALID"); ended = true;
    } else {
      need(["item.started", "item.updated", "item.completed"].includes(event.type) && started && !ended && (["agent_message", "reasoning"].includes(event.item?.type) ||
        event.item?.type === "error" && event.item.message === "Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`."),
      "CONSOLE_NATIVE_RECONCILIATION_EVENTS_INVALID");
      if (event.type === "item.completed" && event.item.type === "agent_message") { need(typeof event.item.text === "string", "CONSOLE_NATIVE_RECONCILIATION_EVENTS_INVALID"); final = event.item.text; }
    }
  }
  need(thread === journal.native_thread_id && ended && journal.completed_turns === 1 && same(counts, journal.event_counts) && typeof final === "string",
    "CONSOLE_NATIVE_RECONCILIATION_EVENTS_INVALID"); return JSON.parse(final);
}
function publicationFor(action, invocation, authorization, original, configuration, key, collection, endedAt) {
  const store = force.load(configuration), preview = invocation.preview, selected = [
    [transfer.KINDS.authorizations, `NTFA-${action.id}`], [transfer.KINDS.outputs, `NTO-${preview.input.request.collection_id}`], [transfer.KINDS.results, `NTOR-${action.id}`]
  ];
  const entries = selected.map(([kind, id]) => {
    const values = store.manifest.artifacts.filter(entry => entry.kind === kind && entry.artifact_id === id);
    need(values.length <= 1, "CONSOLE_NATIVE_RECONCILIATION_PUBLICATION_AMBIGUOUS"); const entry = values[0];
    need(!entry || entry.mission_id === preview.mission_id && entry.wave_id === preview.wave_id, "CONSOLE_NATIVE_RECONCILIATION_PUBLICATION_SCOPE_CHANGED"); return entry || null;
  });
  need(!entries.some((entry, index) => entry && entries.slice(0, index).some(prior => !prior)) && (original || entries.every(entry => !entry)),
    "CONSOLE_NATIVE_RECONCILIATION_PUBLICATION_PREFIX_INVALID");
  const refs = entries.map(entry => entry && force.ref(entry));
  if (entries[0]) need(same(source.record(store, refs[0], selected[0][0]).payload, authorization), "CONSOLE_NATIVE_RECONCILIATION_AUTHORIZATION_CHANGED");
  if (entries[1]) need(refs[1].sha256 === sha256(original.bytes) && source.source(store, refs[1], selected[1][0]).text === original.bytes.toString("utf8"), "CONSOLE_NATIVE_RECONCILIATION_OUTPUT_CHANGED");
  if (entries[2]) {
    const value = transfer.verifySigned(source.record(store, refs[2], selected[2][0]).payload, "operator-native-training-product", key);
    need(value.status === "collected" && value.action_id === action.id && value.invocation_sha256 === invocation.invocation_sha256 && value.consent_sha256 === t.digest(JSON.parse(action.consent)) &&
      value.authorization_sha256 === t.digest(authorization) && value.rationale_sha256 === sha256(action.rationale || "") && same(value.appraisal, original.appraisal) &&
      same(value.collection, collection) && Date.parse(value.ended_at) <= Date.parse(authorization.expires_at) &&
      Date.parse(value.ended_at) >= Date.parse(endedAt) && Date.parse(value.ended_at) <= Date.now() &&
      same(value.output_ref, refs[1]) && same(value.authorization_ref, refs[0]) && same(value.retained_artifact_refs, refs.slice(0, 2)), "CONSOLE_NATIVE_RECONCILIATION_RESULT_CHANGED");
  }
  const retained = JSON.parse(action.result).retained_artifact_refs;
  need(retained.every(ref => refs.some(value => value && same(value, ref))), "CONSOLE_NATIVE_RECONCILIATION_RETAINED_PUBLICATION_CHANGED");
  return { manifest: force.manifestState(store), publication: { state: ["none", "authorization_only", "authorization_and_output", "complete"][entries.filter(Boolean).length],
    authorization_ref: refs[0], output_ref: refs[1], result_ref: refs[2], artifact_settlement_authorized: false, task_output_admitted: false } };
}
function appraise({ action, db, configuration, stateRoot, key }) {
  need(action?.state === "held" && z.uuid().safeParse(action.id).success, "CONSOLE_NATIVE_RECONCILIATION_VERIFIED_FAILURE_REQUIRED");
  const invocation = JSON.parse(action.preview), consent = JSON.parse(action.consent), result = JSON.parse(action.result);
  need(invocation.type === "CodexTrainingProductInvocation" && consent.id === action.id, "CONSOLE_NATIVE_RECONCILIATION_PURPOSE_INVALID");
  native.verifyResult(result, action, invocation, consent, key, db, configuration, stateRoot); c.verifyHistoricalProfile(invocation.profile, invocation.preview);
  const authorization = native.authorization(db, action, invocation, key), root = privateDirectory(fs.realpathSync(stateRoot));
  need(root === path.resolve(stateRoot), "CONSOLE_NATIVE_RECONCILIATION_JOURNAL_UNSAFE");
  const directory = privateDirectory(path.join(root, action.id)), journal = read(directory, "result.json"), j = journal.value, summary = result.collection;
  const originalInvocation = read(directory, "invocation.json"), originalConsent = read(directory, "consent.json");
  need(same(originalInvocation.value, invocation) && same(originalConsent.value, consent) && summary?.journal_sha256 === journal.sha256,
    "CONSOLE_NATIVE_RECONCILIATION_JOURNAL_CHANGED");
  collector.verifyTransferConsent(consent, invocation, key, Date.parse(j.started_at));
  const start = Date.parse(j.started_at), end = Date.parse(j.ended_at), expectedIdentity = { collection_id: invocation.preview.input.request.collection_id, request_ref: invocation.preview.request_ref };
  need(j.type === "CodexTrainingProductCollection" && j.invocation_sha256 === invocation.invocation_sha256 && j.consent_id === action.id &&
    ["evaluated", "not_evaluated"].includes(j.status) && j.status === summary.status && j.result_persisted === true && j.actual_model_invocation_started === true &&
    j.process_exit_confirmed === true && j.process_group_absent === true && summary.process_exit_confirmed === true && summary.process_group_absent === true &&
    Number.isSafeInteger(j.pid) && j.pid > 1 && j.exit_code === 0 && !j.signal && same(j.collection_identity, expectedIdentity) &&
    Number.isFinite(start) && start >= action.created && start <= end && end <= Date.now() && Date.parse(authorization.created_at) <= start && end <= Date.parse(authorization.expires_at) &&
    end <= Date.parse(invocation.preview.expires_at) && j.stdout_sha256 === summary.stdout_sha256 && j.stderr_sha256 === summary.stderr_sha256 &&
    Array.isArray(j.failure_reasons) && j.failure_reasons.every(code => summary.failure_reasons.includes(code)) && (j.response_sha256 || null) === summary.response_sha256,
    "CONSOLE_NATIVE_RECONCILIATION_TERMINATION_UNVERIFIED");
  need(absent(j.pid) && absent(-j.pid), "CONSOLE_NATIVE_RECONCILIATION_PROCESS_PRESENT");
  const reservation = read(privateDirectory(path.join(root, `collection-${expectedIdentity.collection_id}`)), "reservation.json"), r = reservation.value;
  need(same(r.request_ref, expectedIdentity.request_ref) && r.collection_id === expectedIdentity.collection_id && r.consent_id === action.id &&
    r.invocation_sha256 === invocation.invocation_sha256 && r.consent_sha256 === t.digest(consent) && Date.parse(authorization.created_at) <= Date.parse(r.reserved_at) &&
    Date.parse(r.reserved_at) <= start, "CONSOLE_NATIVE_RECONCILIATION_RESERVATION_CHANGED");
  const stream = read(directory, "native-events.jsonl", false), response = read(directory, "response.json");
  need(stream.sha256 === j.native_events_sha256 && stream.sha256 === j.stdout_sha256, "CONSOLE_NATIVE_RECONCILIATION_EVENTS_CHANGED");
  need(same(nativeResponse(stream, j), response.value), "CONSOLE_NATIVE_RECONCILIATION_RESPONSE_CHANGED");
  if (j.response_sha256 !== undefined) need(j.response_sha256 === response.sha256, "CONSOLE_NATIVE_RECONCILIATION_RESPONSE_CHANGED");
  let original = null, assessment;
  if (j.status === "evaluated") {
    original = collector.readProduct(invocation, consent, { trustedPublicKey: key, stateRoot: root });
    assessment = { kind: "accepted_native_product", appraisal_sha256: t.digest(original.appraisal), output_sha256: sha256(original.bytes), output_bytes: original.bytes.length };
  } else {
    let rejection; try { c.assessResponse(response.value, invocation.preview); } catch (error) { rejection = error.message; }
    need(contract.REJECTIONS.includes(rejection) && j.failure_reasons.length === 1 && j.failure_reasons[0] === rejection,
      "CONSOLE_NATIVE_RECONCILIATION_REJECTION_NOT_REPRODUCED"); assessment = { kind: "rejected_response", rejection_code: rejection };
  }
  const observed = publicationFor(action, invocation, authorization, original, configuration, key, { status: j.status, journal_sha256: journal.sha256,
    process_exit_confirmed: j.process_exit_confirmed, process_group_absent: j.process_group_absent, stdout_sha256: j.stdout_sha256, stderr_sha256: j.stderr_sha256,
    response_sha256: j.response_sha256 || null, failure_reasons: j.failure_reasons }, j.ended_at);
  // Re-read the actual original files after appraisal; no missing output is regenerated.
  for (const [name, observed, json] of [["result.json", journal, true], ["invocation.json", originalInvocation, true], ["consent.json", originalConsent, true], ["native-events.jsonl", stream, false], ["response.json", response, true]])
    need(read(directory, name, json).sha256 === observed.sha256, "CONSOLE_NATIVE_RECONCILIATION_JOURNAL_CHANGED");
  need(read(path.join(root, `collection-${expectedIdentity.collection_id}`), "reservation.json").sha256 === reservation.sha256,
    "CONSOLE_NATIVE_RECONCILIATION_RESERVATION_CHANGED");
  need(same(observed.manifest, force.manifestState(force.load(configuration))) && same(action, db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(action.id)) &&
    same(authorization, native.authorization(db, action, invocation, key)), "CONSOLE_NATIVE_RECONCILIATION_SCOPE_CHANGED");
  need(absent(j.pid) && absent(-j.pid), "CONSOLE_NATIVE_RECONCILIATION_PROCESS_PRESENT");
  return contract.checkedAppraisal({ schema_version: "0.1", type: "NativeTrainingFailureAppraisal", action_id: action.id, collection_id: expectedIdentity.collection_id, request_ref: invocation.preview.request_ref,
    original_action_sha256: t.digest(action), invocation_sha256: invocation.invocation_sha256, consent_sha256: t.digest(consent), result_sha256: t.digest(result), journal_sha256: journal.sha256,
    reservation_sha256: reservation.sha256, transfer_authorization_sha256: t.digest(authorization), producer_method_sha256: invocation.preview.method_sha256, trusted_key_sha256: keyDigest(key),
    native_events_sha256: stream.sha256, native_thread_id: j.native_thread_id, process_id: j.pid, child_exit_recorded: true, child_absence_observed: true, process_group_absence_observed: true,
    response: { original_file_sha256: j.response_sha256 || null, observed_file_sha256: response.sha256, canonical_payload_sha256: t.digest(response.value), original_file_bytes_bound: !!j.response_sha256 },
    assessment, publication: observed.publication, inspection_only: true, private_history_required_for_consumption: true, process_identity_independently_attested: false, actual_model_execution_attested: false,
    task_standard_evaluated: false, evaluator_authenticated: false, hold_discharge_authorized: false, ...t.FLAGS });
}
function appraiseFailure(options) {
  try { return appraise(options); } catch (error) {
    const code = error.code === "ENOENT" ? "CONSOLE_NATIVE_RECONCILIATION_ORIGINAL_EVIDENCE_MISSING" :
      /^(?:CONSOLE|SEMANTIC|NATIVE_RECONCILIATION)_[A-Z0-9_]+$/.test(error.message) ? error.message : "CONSOLE_NATIVE_RECONCILIATION_APPRAISAL_FAILED";
    throw Object.assign(new Error(code), { statusCode: 409 });
  }
}
module.exports = { appraiseFailure };
