#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const s = require("./native-training-transfer-fixtures/support"), native = require("./operator-native-training"), artifacts = require("./repository-artifact-store"), transfer = require("./native-training-transfer-contract");
const { appraiseFailure } = require("./operator-native-training-failure"), { digest } = require("./operator-consent-contract");
const cases = ["rejected_response", "before_authorization", "before_output", "before_result", "after_result"];
const argv = process.argv.slice(2), selected = argv.length === 0 ? cases : argv.length === 2 && argv[0] === "--case" && cases.includes(argv[1]) ? [argv[1]] : null;
if (!selected) throw new Error("NATIVE_FAILURE_FIXTURE_SELECTION_INVALID");
const observations = [];
async function run(mode) {
  const env = await s.environment(); let actionId;
  try {
    const p = await s.preview(env, mode === "rejected_response" ? "wrongcase" : "success"); actionId = p.challenge_id;
    const write = artifacts.writeRepositoryArtifact, fileWrite = artifacts.writeRepositoryFileArtifact, publish = native.publish;
    artifacts.writeRepositoryArtifact = function(options) {
      if (mode === "before_authorization" && options.kind === transfer.KINDS.authorizations || mode === "before_result" && options.kind === transfer.KINDS.results)
        throw new Error("CONSOLE_MODEL_COLLECTION_FAILED"); return write.call(this, options);
    };
    artifacts.writeRepositoryFileArtifact = function(options) { if (mode === "before_output" && options.kind === transfer.KINDS.outputs) throw new Error("CONSOLE_MODEL_COLLECTION_FAILED"); return fileWrite.call(this, options); };
    native.publish = function(...args) { const result = publish.apply(this, args); if (mode === "after_result") throw new Error("CONSOLE_MODEL_COLLECTION_FAILED"); return result; };
    let result;
    try { await env.owner.post("/api/training-products/commit", s.commitInput(p), 202); result = await s.terminal(env, actionId); }
    finally { artifacts.writeRepositoryArtifact = write; artifacts.writeRepositoryFileArtifact = fileWrite; native.publish = publish; }
    assert.equal(result.state, "held"); assert.equal(result.result_verified, true); assert.equal(result.hold_preserved, true);
    const row = () => env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(actionId), original = row(), rowHash = digest(original);
    const root = path.join(env.stateDir, "model-evaluations"), directory = path.join(root, actionId), manifest = s.force.manifestState(s.force.load(env.options));
    const fileCount = fs.readdirSync(root).length, journalBytes = fs.readFileSync(path.join(directory, "result.json")), journal = JSON.parse(journalBytes);
    const appraise = () => appraiseFailure({ action: row(), db: env.service.auth.db, configuration: env.service.configuration, stateRoot: root, key: env.publicKey });
    const value = appraise(), expectedState = ({ rejected_response: "none", before_authorization: "none", before_output: "authorization_only", before_result: "authorization_and_output", after_result: "complete" })[mode];
    assert.equal(value.publication.state, expectedState); assert.equal(value.assessment.kind, mode === "rejected_response" ? "rejected_response" : "accepted_native_product");
    assert.equal(value.response.original_file_bytes_bound, mode !== "rejected_response"); assert.equal(value.hold_discharge_authorized, false);
    assert.equal(value.qualification_granted, false); assert.equal(value.task_standard_evaluated, false); assert.equal(value.publication.task_output_admitted, false);
    assert.equal(digest(row()), rowHash); assert.deepEqual(s.force.manifestState(s.force.load(env.options)), manifest); assert(journalBytes.equals(fs.readFileSync(path.join(directory, "result.json"))));
    assert.equal(fs.readdirSync(root).length, fileCount);
    const preview = await env.owner.post(`/api/model-evaluations/${actionId}/reconciliation/preview`, {}, 409); assert.equal(preview.error, "CONSOLE_MODEL_RECONCILIATION_PURPOSE_UNSUPPORTED");
    if (mode === "rejected_response") {
      const responseFile = path.join(directory, "response.json"), responseBytes = fs.readFileSync(responseFile), eventFile = path.join(directory, "native-events.jsonl"), eventBytes = fs.readFileSync(eventFile);
      try { fs.appendFileSync(responseFile, "\n"); const current = appraise(); assert.notEqual(current.response.observed_file_sha256, value.response.observed_file_sha256); assert.equal(current.response.original_file_sha256, null);
        assert.equal(current.response.canonical_payload_sha256, value.response.canonical_payload_sha256); assert.notEqual(current.id, value.id);
      } finally { fs.writeFileSync(responseFile, responseBytes); }
      try { const changed = JSON.parse(responseBytes); changed.output += "Changed"; fs.writeFileSync(responseFile, JSON.stringify(changed)); assert.throws(appraise, /CONSOLE_NATIVE_RECONCILIATION_RESPONSE_CHANGED/); }
      finally { fs.writeFileSync(responseFile, responseBytes); }
      try { fs.appendFileSync(eventFile, "\n"); assert.throws(appraise, /CONSOLE_NATIVE_RECONCILIATION_EVENTS_CHANGED/); }
      finally { fs.writeFileSync(eventFile, eventBytes); }
      try { fs.appendFileSync(path.join(directory, "result.json"), "\n"); assert.throws(appraise, /CONSOLE_NATIVE_RECONCILIATION_JOURNAL_CHANGED/); }
      finally { fs.writeFileSync(path.join(directory, "result.json"), journalBytes); }
      const backup = eventFile + ".fixture-backup";
      try { fs.renameSync(eventFile, backup); assert.throws(appraise, /CONSOLE_NATIVE_RECONCILIATION_ORIGINAL_EVIDENCE_MISSING/); }
      finally { fs.renameSync(backup, eventFile); }
      const kill = process.kill;
      for (const state of ["present", "unobservable"]) {
        process.kill = function(pid, signal) { if (Math.abs(pid) === journal.pid && signal === 0) { if (state === "present") return true; throw Object.assign(new Error("Synthetic denial"), { code: "EPERM" }); } return kill.call(process, pid, signal); };
        try { assert.throws(appraise, /CONSOLE_NATIVE_RECONCILIATION_PROCESS_PRESENT/); } finally { process.kill = kill; }
      }
      const stored = original.result, changed = JSON.parse(stored);
      changed.signature.value = (changed.signature.value[0] === "A" ? "B" : "A") + changed.signature.value.slice(1);
      try { env.service.auth.db.prepare("UPDATE operator_model_actions SET result=? WHERE id=?").run(JSON.stringify(changed), actionId); assert.throws(appraise, /CONSOLE_TRAINING_TRANSFER_SIGNATURE_INVALID/); }
      finally { env.service.auth.db.prepare("UPDATE operator_model_actions SET result=? WHERE id=?").run(stored, actionId); }
      assert.deepEqual(appraise(), value);
    } else {
      const responseFile = path.join(directory, "response.json"), responseBytes = fs.readFileSync(responseFile);
      try { fs.appendFileSync(responseFile, "\n"); assert.throws(appraise, /CONSOLE_NATIVE_RECONCILIATION_RESPONSE_CHANGED/); }
      finally { fs.writeFileSync(responseFile, responseBytes); }
    }
    assert.equal((await env.owner.get(`/api/model-evaluations/${actionId}`)).hold_preserved, true); assert.equal(digest(row()), rowHash);
    assert.deepEqual(s.force.manifestState(s.force.load(env.options)), manifest); assert.equal(fs.readdirSync(root).length, fileCount);
    observations.push({ name: mode, passed: true, publication_state: expectedState, original_hold_preserved: true }); console.log(`PASS ${mode}: original native evidence and exact publication prefix appraised without rewriting, rerunning or clearing`);
  } finally { await s.close(env); }
}
async function main() {
  for (const mode of selected) await run(mode);
  console.log(JSON.stringify({ passed: observations.length, failed: 0, selected_cases: selected, total_matrix_cases: cases.length, full_matrix_executed: selected.length === cases.length, observations,
    actual_model_invocations: 0, real_owner_actions: 0, native_owner_ceremony_implemented: false, hold_discharge_implemented: false, all_eight_goals_complete: false }));
}
main().catch(error => { console.error(/^(?:CONSOLE|SEMANTIC|NATIVE)_[A-Z0-9_]+$/.test(error.message) ? error.message : "NATIVE_FAILURE_FIXTURE_ASSERTION_FAILED");
  const location = String(error.stack).match(/run-native-training-failure-fixtures\.js:(\d+):\d+/);
  console.error(JSON.stringify({ fixture_line: location ? Number(location[1]) : null,
    actual_code: /^(?:CONSOLE|SEMANTIC|NATIVE)_[A-Z0-9_]+$/.test(error.actual?.message) ? error.actual.message : null }));
  console.error(JSON.stringify({ passed: observations.length, failed: 1, unexecuted: selected.slice(observations.length), suffix_not_counted_as_pass: true })); process.exitCode = 1; });
