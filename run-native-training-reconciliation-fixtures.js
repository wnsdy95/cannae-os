#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const s = require("./native-training-reconciliation-fixtures/support"), { digest, validOperatorSignature } = require("./operator-consent-contract"), artifacts = require("./repository-artifact-store"), transfer = require("./native-training-transfer-contract");
const endpoint = "/api/native-training-reconciliations/commit", cases = [];
const add = (name, run, mode = "rejected_response") => cases.push({ name, run, mode });
const attempt = (env, p) => env.service.auth.db.prepare("SELECT * FROM operator_model_reconciliations WHERE id=?").get(p.reconciliation_id);
const write = (env, kind, artifactId, payload, mission = env.plan.mission_id) => artifacts.writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
  missionId: mission, waveId: env.plan.wave_id, kind, artifactId, payload });
for (const [mode, publication] of [["rejected_response", "none"], ["before_authorization", "none"], ["before_output", "authorization_only"], ["before_result", "authorization_and_output"], ["after_result", "complete"]]) {
  add(`${mode}: fresh authenticated consumption preserves original failure and publication`, async (env, id) => {
    const original = digest(s.row(env, id)), journal = fs.readFileSync(path.join(s.directory(env, id), "result.json")), manifest = s.force.manifestState(s.force.load(env.options));
    const p = await s.review(env, id); assert.equal(p.purpose, "native_training"); assert.equal(p.displayed_subject_sha256, digest(p.subject));
    assert.equal(p.subject.native_appraisal.publication.state, publication);
    const result = await env.owner.post(endpoint, s.ackInput(p)); assert.equal(result.record.type, "OperatorNativeTrainingReconciliationRecord");
    assert(validOperatorSignature(result.record, env.publicKey)); assert(validOperatorSignature(result.record.authorization, env.publicKey));
    for (const field of ["execution_authorized", "release_authorized", "qualification_granted", "artifact_settlement_authorized", "task_output_admitted"]) assert.equal(result.record[field], false);
    assert.equal(result.new_model_invocation_started, false); assert.equal(digest(s.row(env, id)), original);
    assert(journal.equals(fs.readFileSync(path.join(s.directory(env, id), "result.json")))); assert.deepEqual(s.force.manifestState(s.force.load(env.options)), manifest);
    const current = await s.inspect(env, id); assert.equal(current.state, "held"); assert.equal(current.hold_preserved, false); assert.equal(current.reconciliation_verified, true);
    const history = await env.owner.get(`/api/training-products/${id}/reconciliations`); assert.equal(history.entries.filter(row => row.state === "committed").length, 1);
    await env.owner.post(endpoint, s.ackInput(p), 409);
    if (mode === "rejected_response") {
      await s.preview(env); assert.equal((await s.inspect(env, id)).hold_preserved, false);
      assert.equal(fs.readdirSync(path.join(env.stateDir, "model-evaluations")).filter(name => !name.startsWith("collection-")).length, 1);
    }
  }, mode);
}
add("purpose, display digest and three acknowledgments cannot substitute native consent", async (env, id) => {
  const p = await s.review(env, id), input = s.ackInput(p);
  for (const prefix of ["model-evaluations", "order-analyses"]) await env.owner.post(`/api/${prefix}/${id}/reconciliation/preview`, {}, 409);
  await env.owner.post("/api/model-reconciliations/commit", { reconciliation_id: p.reconciliation_id, nonce: p.nonce, password: s.password, rationale: input.rationale, acknowledge_provider_uncertainty: true }, 409);
  await env.owner.post(endpoint, { ...input, displayed_subject_sha256: "0".repeat(64) }, 409);
  for (const field of ["acknowledge_provider_uncertainty", "acknowledge_native_publication", "acknowledge_response_observation"]) {
    const changed = { ...input }; delete changed[field]; await env.owner.post(endpoint, changed, 400);
  }
  assert.equal(attempt(env, p).authorization, null); assert.equal((await s.inspect(env, id)).hold_preserved, true);
});
add("wrong password, nonce, caller subject and authority fail before reservation", async (env, id) => {
  const p = await s.review(env, id), input = s.ackInput(p);
  await env.owner.post(endpoint, { ...input, password: "incorrect-synthetic-password" }, 403);
  await env.owner.post(endpoint, { ...input, nonce: "x".repeat(43) }, 409);
  for (const [key, value] of [["subject", p.subject], ["actor", "USER"], ["release_authorized", true]]) await env.owner.post(endpoint, { ...input, [key]: value }, 400);
  assert.equal(attempt(env, p).authorization, null); assert.equal((await s.inspect(env, id)).hold_preserved, true);
});
add("another session and a viewer cannot consume an owner challenge", async (env, id) => {
  const p = await s.review(env, id), other = s.boundedClient(s.f.client(env.service)); await other.session(); await other.post("/api/login", { username: "owner", password: s.password }); await other.session();
  await other.post(endpoint, s.ackInput(p), 409);
  const invitation = await env.owner.post("/api/invites", { password: s.password, missions: [env.plan.mission_id] }), viewer = s.boundedClient(s.f.client(env.service));
  await viewer.session(); await viewer.post("/api/register", { username: "viewer", password: s.password, token: invitation.token }); await viewer.session();
  await viewer.post(`/api/training-products/${id}/reconciliation/preview`, {}, 403); await viewer.get(`/api/training-products/${id}/reconciliations`, 403);
  await viewer.post(endpoint, s.ackInput(p), 403); assert.equal(attempt(env, p).authorization, null);
});
for (const change of ["response", "manifest", "expiry"]) add(`${change} drift cannot consume the reviewed snapshot`, async (env, id) => {
  const p = await s.review(env, id);
  if (change === "response") fs.appendFileSync(path.join(s.directory(env, id), "response.json"), "\n");
  if (change === "manifest") write(env, "agent-outputs", "UNRELATED-NATIVE-REVIEW-DRIFT", { synthetic: true });
  if (change === "expiry") env.service.auth.db.prepare("UPDATE operator_model_reconciliations SET expires=0 WHERE id=?").run(p.reconciliation_id);
  const denied = await env.owner.request("POST", endpoint, s.ackInput(p)); assert(denied.statusCode >= 400);
  assert.equal(attempt(env, p).authorization, null); assert.equal((await s.inspect(env, id)).hold_preserved, true);
});
add("receipt persistence loss and ignored writes require a new one-use approval", async (env, id) => {
  const original = digest(s.row(env, id));
  for (const instruction of ["ABORT,'synthetic native receipt failure'", "IGNORE"]) {
    const p = await s.review(env, id);
    env.service.auth.db.exec(`CREATE TRIGGER synthetic_native_receipt BEFORE UPDATE ON operator_model_reconciliations WHEN NEW.state='committed' BEGIN SELECT RAISE(${instruction}); END;`);
    assert((await env.owner.request("POST", endpoint, s.ackInput(p))).statusCode >= 400); assert.equal(attempt(env, p).state, "failed"); assert.equal(attempt(env, p).record, null);
    env.service.auth.db.exec("DROP TRIGGER synthetic_native_receipt"); await env.owner.post(endpoint, s.ackInput(p), 409);
  }
  const next = await s.review(env, id); await env.owner.post(endpoint, s.ackInput(next)); assert.equal((await s.inspect(env, id)).hold_preserved, false); assert.equal(digest(s.row(env, id)), original);
});
add("pending review expires at restart while committed native acknowledgment survives disabled execution", async (env, id) => {
  const p = await s.review(env, id), original = digest(s.row(env, id)); await s.restart(env, false);
  await env.owner.post(endpoint, s.ackInput(p), 409); const next = await s.review(env, id); await env.owner.post(endpoint, s.ackInput(next));
  await s.restart(env, false); assert.equal((await s.inspect(env, id)).hold_preserved, false); assert.equal(digest(s.row(env, id)), original);
  assert.equal((await env.owner.session()).native_training_available, false);
  const listed = await env.owner.get(`/api/training-products/${id}/reconciliations`); assert.equal(listed.entries.filter(row => row.state === "committed").length, 1);
});
add("concurrent native consumption retains exactly one signed receipt", async (env, id) => {
  const p = await s.review(env, id), responses = await Promise.all([env.owner.request("POST", endpoint, s.ackInput(p)), env.owner.request("POST", endpoint, s.ackInput(p))]);
  assert.equal(responses.filter(row => row.statusCode === 200).length, 1); assert(responses.every(row => [200, 409, 429].includes(row.statusCode)));
  assert.equal(env.service.auth.db.prepare("SELECT count(*) AS n FROM operator_model_reconciliations WHERE state='committed'").get().n, 1);
});
add("logout and principal epoch changes invalidate pending native approval", async (env, id) => {
  const first = await s.review(env, id); await env.owner.post("/api/logout", {}); await env.owner.session();
  await env.owner.post("/api/login", { username: "owner", password: s.password }); await env.owner.session(); await env.owner.post(endpoint, s.ackInput(first), 409);
  const next = await s.review(env, id), principal = s.row(env, id).principal_id;
  env.service.auth.db.prepare("UPDATE users SET epoch=epoch+1 WHERE id=?").run(principal);
  await env.owner.post(endpoint, s.ackInput(next), 401); assert.equal(attempt(env, next).authorization, null);
});
add("live or unobservable original processes cannot consume a native review", async (env, id) => {
  const p = await s.review(env, id), kill = process.kill, pid = p.subject.process_id;
  for (const state of ["present", "unobservable"]) {
    process.kill = function(target, signal) { if (Math.abs(target) === pid && signal === 0) { if (state === "present") return true; throw Object.assign(new Error("Synthetic process denial"), { code: "EPERM" }); } return kill.call(process, target, signal); };
    try { assert.equal((await env.owner.post(endpoint, s.ackInput(p), 409)).error, "CONSOLE_NATIVE_RECONCILIATION_PROCESS_PRESENT"); } finally { process.kill = kill; }
  }
  assert.equal(attempt(env, p).authorization, null);
});
add("missing original bytes and changed runtime source cannot consume a native review", async (env, id) => {
  const p = await s.review(env, id), file = path.join(s.directory(env, id), "native-events.jsonl"), backup = file + ".fixture-backup";
  try { fs.renameSync(file, backup); assert.equal((await env.owner.post(endpoint, s.ackInput(p), 409)).error, "CONSOLE_NATIVE_RECONCILIATION_ORIGINAL_EVIDENCE_MISSING"); }
  finally { fs.renameSync(backup, file); }
  const source = env.service.configuration.sourceSha256;
  try { env.service.configuration.sourceSha256 = "0".repeat(64); assert.equal((await env.owner.post(endpoint, s.ackInput(p), 409)).error, "CONSOLE_MODEL_SOURCE_CHANGED"); }
  finally { env.service.configuration.sourceSha256 = source; }
  assert.equal(attempt(env, p).authorization, null); assert.equal((await s.inspect(env, id)).hold_preserved, true);
});
add("a response race after reservation fails receipt persistence and keeps the original hold", async (env, id) => {
  const p = await s.review(env, id), prototype = Object.getPrototypeOf(env.service.auth.db), prepare = prototype.prepare;
  prototype.prepare = function(sql, ...args) {
    if (sql.startsWith("UPDATE operator_model_reconciliations SET state='committed'")) { prototype.prepare = prepare; fs.appendFileSync(path.join(s.directory(env, id), "response.json"), "\n"); }
    return prepare.call(this, sql, ...args);
  };
  try { await env.owner.post(endpoint, s.ackInput(p), 409); } finally { prototype.prepare = prepare; }
  assert.equal(attempt(env, p).state, "failed"); assert.equal(attempt(env, p).record, null); assert.equal((await s.inspect(env, id)).hold_preserved, true);
});
add("post-acknowledgment response and receipt drift restore the hold", async (env, id) => {
  const p = await s.review(env, id); await env.owner.post(endpoint, s.ackInput(p)); assert.equal((await s.inspect(env, id)).hold_preserved, false);
  const file = path.join(s.directory(env, id), "response.json"), original = fs.readFileSync(file);
  try { fs.appendFileSync(file, "\n"); assert.equal((await s.inspect(env, id)).hold_preserved, true); } finally { fs.writeFileSync(file, original); }
  assert.equal((await s.inspect(env, id)).hold_preserved, false); env.service.auth.db.prepare("UPDATE operator_model_reconciliations SET record=NULL WHERE id=?").run(p.reconciliation_id);
  assert.equal((await s.inspect(env, id)).hold_preserved, true);
});
for (const attack of ["authorization", "foreign_scope", "prefix", "ambiguous"]) add(`actual ${attack} publication cannot enter the native recovery ceremony`, async (env, id) => {
  const action = s.row(env, id), invocation = JSON.parse(action.preview), authorization = JSON.parse(env.service.auth.db.prepare("SELECT authorization FROM operator_native_training_authorizations WHERE action_id=?").get(id).authorization);
  if (attack === "authorization") write(env, transfer.KINDS.authorizations, `NTFA-${id}`, { ...authorization, rationale_sha256: "0".repeat(64) });
  if (attack === "foreign_scope") write(env, transfer.KINDS.authorizations, `NTFA-${id}`, authorization, "MIS-FOREIGN-NATIVE");
  if (attack === "prefix") write(env, transfer.KINDS.outputs, `NTO-${invocation.preview.input.request.collection_id}`, { synthetic: true });
  if (attack === "ambiguous") { write(env, transfer.KINDS.authorizations, `NTFA-${id}`, authorization); write(env, transfer.KINDS.authorizations, `NTFA-${id}`, authorization, "MIS-FOREIGN-NATIVE"); }
  const expected = { authorization: "AUTHORIZATION_CHANGED", foreign_scope: "PUBLICATION_SCOPE_CHANGED", prefix: "PUBLICATION_PREFIX_INVALID", ambiguous: "PUBLICATION_AMBIGUOUS" }[attack];
  const denied = await s.review(env, id, 409); assert.equal(denied.error, `CONSOLE_NATIVE_RECONCILIATION_${expected}`);
  assert.equal((await s.inspect(env, id)).hold_preserved, true); assert.equal(env.service.auth.db.prepare("SELECT count(*) AS n FROM operator_model_reconciliations").get().n, 0);
}, "before_authorization");
add("substituted actual output bytes fail before a recovery challenge is issued", async (env, id) => {
  const invocation = JSON.parse(s.row(env, id).preview), file = path.join(env.root, "substituted-output.txt"); fs.writeFileSync(file, "Synthetic substituted task bytes.\n");
  artifacts.writeRepositoryFileArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: env.plan.mission_id,
    waveId: env.plan.wave_id, kind: transfer.KINDS.outputs, artifactId: `NTO-${invocation.preview.input.request.collection_id}`, sourcePath: file });
  assert.equal((await s.review(env, id, 409)).error, "CONSOLE_NATIVE_RECONCILIATION_OUTPUT_CHANGED"); assert.equal((await s.inspect(env, id)).hold_preserved, true);
}, "before_output");
add("publication introduced after acknowledgment invalidates its observed absence without settling artifacts", async (env, id) => {
  const p = await s.review(env, id); await env.owner.post(endpoint, s.ackInput(p)); assert.equal((await s.inspect(env, id)).hold_preserved, false);
  const a = JSON.parse(env.service.auth.db.prepare("SELECT authorization FROM operator_native_training_authorizations WHERE action_id=?").get(id).authorization);
  write(env, transfer.KINDS.authorizations, `NTFA-${id}`, a); const current = await s.inspect(env, id); assert.equal(current.hold_preserved, true); assert.equal(current.reconciliation_verified, false);
}, "before_authorization");
async function run(selected = cases) {
  const results = [];
  for (const item of selected) {
    let env;
    try { env = await s.environment(); const id = await s.failed(env, item.mode); await item.run(env, id); results.push({ name: item.name, passed: true }); console.log(`PASS ${item.name}`); }
    catch (error) { const location = String(error.stack).match(/run-native-training-reconciliation-fixtures\.js:(\d+):\d+/);
      results.push({ name: item.name, passed: false, code: /^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "NATIVE_RECOVERY_FIXTURE_FAILED", line: location ? Number(location[1]) : null }); console.error(JSON.stringify(results.at(-1))); }
    finally { if (env) await s.close(env); }
  }
  const result = { total: results.length, planned_cases: cases.length, passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, focused_subset: selected !== cases,
    results, actual_model_invocations: 0, real_owner_actions: 0, all_eight_goals_complete: false, release_authorized: false }; console.log(JSON.stringify(result, null, 2)); return result;
}
module.exports = { cases, run };
if (require.main === module) run().then(result => { process.exitCode = result.failed ? 1 : 0; });
