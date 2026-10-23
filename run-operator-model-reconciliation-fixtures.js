#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { environment, client, password, preview, commitInput, terminal } = require("./operator-semantic-fixtures/support");
const { createConsole } = require("./operator-console-server");
const { digest, validOperatorSignature, signOperatorRecord } = require("./operator-consent-contract");
const { writeRepositoryArtifact, verifyRepositoryArtifacts } = require("./repository-artifact-store");
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const results = [];
const row = (env, id) => env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(id);
const reconcileInput = p => ({ reconciliation_id: p.reconciliation_id, nonce: p.nonce, password,
  rationale: "Acknowledge this failed local transfer; provider transmission and billing remain uncertain.", acknowledge_provider_uncertainty: true });
const review = (env, id, expected = 200) => env.owner.post(`/api/model-evaluations/${id}/reconciliation/preview`, {}, expected);
async function failed(env) {
  const p = await preview(env); await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202);
  const result = await terminal(env, p.challenge_id); assert.equal(result.state, "held"); return p.challenge_id;
}
async function check(name, fn, options = {}) {
  let env;
  try { env = await environment({ model: "fixture-invalid", ...options }); const id = await failed(env); await fn(env, id);
    results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
  finally { if (env) { await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); } }
}
async function main() {
  await check("fresh owner ceremony preserves original failure and enables only a separately reviewed transfer", async (env, id) => {
    const original = digest(row(env, id)), count = fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")).length;
    const before = verifyRepositoryArtifacts({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot }).manifest_sha256;
    const p = await review(env, id); assert.equal(p.subject.provider_billing_verified, false); assert.equal(p.subject.process_group_absence_observed, true);
    assert.equal(p.subject.original_action_sha256, original);
    const result = await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p));
    assert.equal(result.new_model_invocation_started, false); assert.equal(result.execution_authorized, false); assert.equal(result.release_authorized, false);
    const key = (await env.owner.get("/api/operator-key")).public_key_pem;
    assert(validOperatorSignature(result.record, key)); assert(validOperatorSignature(result.record.authorization, key));
    assert.equal(digest(row(env, id)), original);
    const inspected = await env.owner.get(`/api/model-evaluations/${id}`);
    assert.equal(inspected.state, "held"); assert.equal(inspected.hold_preserved, false); assert.equal(inspected.reconciliation_verified, true);
    assert.equal(inspected.result.status, "held"); assert.equal(inspected.result.response, null);
    const history = await env.owner.get(`/api/model-evaluations/${id}/reconciliations`);
    assert.equal(history.entries.length, 1); assert.equal(history.entries[0].state, "committed");
    assert.equal(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")).length, count);
    assert.equal(verifyRepositoryArtifacts({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot }).manifest_sha256, before);
    const next = await preview(env); assert.notEqual(next.challenge_id, id);
    assert.equal(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")).length, count);
    await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p), 409);
    await review(env, id, 409);
  });
  await check("wrong password, nonce, missing acknowledgment and raw secrets cannot reconcile", async (env, id) => {
    const p = await review(env, id), input = reconcileInput(p);
    await env.owner.post("/api/model-reconciliations/commit", { ...input, password: "incorrect-password" }, 403);
    await env.owner.post("/api/model-reconciliations/commit", { ...input, nonce: "x".repeat(43) }, 409);
    await env.owner.post("/api/model-reconciliations/commit", { ...input, acknowledge_provider_uncertainty: false }, 400);
    await env.owner.post("/api/model-reconciliations/commit", { ...input, rationale: p.nonce }, 400);
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true);
    assert.equal(env.service.auth.db.prepare("SELECT authorization FROM operator_model_reconciliations WHERE id=?").get(p.reconciliation_id).authorization, null);
  });
  await check("another actual owner browser cannot consume a leaked reconciliation nonce", async (env, id) => {
    const p = await review(env, id), other = client(env.service); await other.session();
    await other.post("/api/login", { username: "owner", password }); await other.session();
    await other.post("/api/model-reconciliations/commit", reconcileInput(p), 409);
    await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p));
  });
  await check("viewers cannot inspect, preview or commit model reconciliation", async (env, id) => {
    const p = await review(env, id), invitation = await env.owner.post("/api/invites", { password, missions: [env.options.mission] });
    const viewer = client(env.service); await viewer.session(); await viewer.post("/api/register", { username: "viewer", password, token: invitation.token }); await viewer.session();
    await viewer.post(`/api/model-evaluations/${id}/reconciliation/preview`, {}, 403);
    await viewer.get(`/api/model-evaluations/${id}/reconciliations`, 403);
    await viewer.post("/api/model-reconciliations/commit", reconcileInput(p), 403);
  });
  await check("expired preview never consumes authority or refreshes itself", async (env, id) => {
    const p = await review(env, id);
    env.service.auth.db.prepare("UPDATE operator_model_reconciliations SET expires=0 WHERE id=?").run(p.reconciliation_id);
    await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p), 409);
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true);
  });
  for (const type of ["repository", "manifest", "journal"]) await check(`${type} changes after preview require a new exact review`, async (env, id) => {
    const p = await review(env, id);
    if (type === "repository") fs.appendFileSync(path.join(env.options.repository, "README.md"), "Synthetic changed state\n");
    if (type === "manifest") writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
      missionId: env.options.mission, waveId: env.options.wave, kind: "agent-outputs", artifactId: "CHANGED-MODEL-REVIEW", payload: { synthetic: true } });
    if (type === "journal") fs.appendFileSync(path.join(env.configuration.stateDir, "model-evaluations", id, "result.json"), "\n");
    await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p), 409);
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true);
  });
  for (const type of ["result", "termination", "journal-symlink"]) await check(`${type} corruption cannot be acknowledged as a verified failure`, async (env, id) => {
    if (type === "result") env.service.auth.db.prepare("UPDATE operator_model_actions SET result=NULL WHERE id=?").run(id);
    const file = path.join(env.configuration.stateDir, "model-evaluations", id, "result.json");
    if (type === "termination") { const value = JSON.parse(fs.readFileSync(file)); value.process_exit_confirmed = false; fs.writeFileSync(file, JSON.stringify(value)); }
    if (type === "journal-symlink") { fs.renameSync(file, file + ".saved"); fs.symlinkSync(file + ".saved", file); }
    const response = await env.owner.request("POST", `/api/model-evaluations/${id}/reconciliation/preview`, {});
    assert(response.statusCode >= 400); assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true);
    assert.equal(env.service.auth.db.prepare("SELECT count(*) AS n FROM operator_model_reconciliations").get().n, 0);
  });
  for (const kind of ["present", "unobservable"]) await check(`a ${kind} process is never treated as absent`, async (env, id) => {
    const file = path.join(env.configuration.stateDir, "model-evaluations", id, "result.json"), pid = JSON.parse(fs.readFileSync(file)).pid, kill = process.kill;
    process.kill = function(target, signal) {
      if (Math.abs(target) === pid && signal === 0) { if (kind === "present") return true; throw Object.assign(new Error("Synthetic denial"), { code: "EPERM" }); }
      return kill.call(process, target, signal);
    };
    try { await review(env, id, 409); } finally { process.kill = kill; }
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true);
  });
  await check("a PID changed before preview cannot replace the originally signed collector journal", async (env, id) => {
    const file = path.join(env.configuration.stateDir, "model-evaluations", id, "result.json"), value = JSON.parse(fs.readFileSync(file));
    value.pid = 2147483000; fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
    const denial = await review(env, id, 409); assert.equal(denial.error, "CONSOLE_MODEL_RECONCILIATION_JOURNAL_CHANGED");
    const current = await env.owner.get(`/api/model-evaluations/${id}`); assert.equal(current.result_verified, true); assert.equal(current.hold_preserved, true);
    assert.equal(env.service.auth.db.prepare("SELECT count(*) AS n FROM operator_model_reconciliations").get().n, 0);
  });
  await check("authentic legacy results remain readable but cannot acquire a journal binding retrospectively", async (env, id) => {
    const original = row(env, id), value = JSON.parse(original.result); value.schema_version = "0.1"; delete value.collection.journal_sha256;
    const legacy = signOperatorRecord(value, env.service.auth.db.prepare("SELECT value FROM meta WHERE key='operator-signing-key'").get().value);
    env.service.auth.db.prepare("UPDATE operator_model_actions SET result=? WHERE id=?").run(JSON.stringify(legacy), id);
    const current = await env.owner.get(`/api/model-evaluations/${id}`); assert.equal(current.result_verified, true); assert.equal(current.result.schema_version, "0.1");
    assert.equal(current.hold_preserved, true); const denial = await review(env, id, 409);
    assert.equal(denial.error, "CONSOLE_MODEL_RECONCILIATION_JOURNAL_BINDING_REQUIRED");
    assert.equal(env.service.auth.db.prepare("SELECT count(*) AS n FROM operator_model_reconciliations").get().n, 0);
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
  });
  await check("a known UTF8 transport failure remains authentic and can be acknowledged only after proven termination", async (env, id) => {
    const before = await env.owner.get(`/api/model-evaluations/${id}`);
    assert.equal(before.state, "held"); assert.equal(before.result_verified, true);
    assert(before.result.collection.failure_reasons.includes("SEMANTIC_EVENT_UTF8_INVALID"));
    const p = await review(env, id); assert(p.subject.failure_reasons.includes("SEMANTIC_EVENT_UTF8_INVALID"));
    const result = await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p));
    assert(result.record.authorization.subject.failure_reasons.includes("SEMANTIC_EVENT_UTF8_INVALID"));
    const current = await env.owner.get(`/api/model-evaluations/${id}`); assert.equal(current.hold_preserved, false);
    assert.equal(current.result.status, "held"); assert.equal(current.result.response, null);
  }, { model: "fixture-invalid-utf8" });
  await check("record publication failure preserves the reservation and requires fresh explicit consent", async (env, id) => {
    const p = await review(env, id), original = digest(row(env, id));
    env.service.auth.db.exec("CREATE TRIGGER synthetic_model_record_failure BEFORE UPDATE ON operator_model_reconciliations WHEN NEW.state='committed' BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;");
    const response = await env.owner.request("POST", "/api/model-reconciliations/commit", reconcileInput(p)); assert(response.statusCode >= 400);
    const failedRow = env.service.auth.db.prepare("SELECT * FROM operator_model_reconciliations WHERE id=?").get(p.reconciliation_id);
    assert.equal(failedRow.state, "failed"); assert(failedRow.authorization); assert.equal(failedRow.record, null);
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true); assert.equal(digest(row(env, id)), original);
    env.service.auth.db.exec("DROP TRIGGER synthetic_model_record_failure");
    await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p), 409);
    const next = await review(env, id); await env.owner.post("/api/model-reconciliations/commit", reconcileInput(next));
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, false);
    env.service.auth.db.prepare("UPDATE operator_model_reconciliations SET failure='CHANGED' WHERE id=?").run(p.reconciliation_id);
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true);
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
  });
  for (const type of ["receipt", "original-row", "journal-after-receipt"]) await check(`changed ${type} reinstates the hold instead of trusting a terminal label`, async (env, id) => {
    const p = await review(env, id); await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p));
    if (type === "receipt") env.service.auth.db.prepare("UPDATE operator_model_reconciliations SET record=NULL WHERE id=?").run(p.reconciliation_id);
    else if (type === "original-row") env.service.auth.db.prepare("UPDATE operator_model_actions SET rationale='changed' WHERE id=?").run(id);
    else fs.appendFileSync(path.join(env.configuration.stateDir, "model-evaluations", id, "result.json"), "\n");
    const current = await env.owner.get(`/api/model-evaluations/${id}`); assert.equal(current.hold_preserved, true);
    assert.equal(current.reconciliation_verified, false); assert.equal(current.reconciliation, null);
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
  });
  await check("restart invalidates pending consent while retaining completed receipt and original failure", async (env, id) => {
    const p = await review(env, id), original = digest(row(env, id));
    await env.service.app.close(); env.service = await createConsole(env.configuration); await env.service.app.ready();
    env.owner = client(env.service); await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password }); await env.owner.session();
    await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p), 409);
    const next = await review(env, id); await env.owner.post("/api/model-reconciliations/commit", reconcileInput(next));
    await env.service.app.close(); env.service = await createConsole(env.configuration); await env.service.app.ready();
    env.owner = client(env.service); await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password }); await env.owner.session();
    const current = await env.owner.get(`/api/model-evaluations/${id}`); assert.equal(current.hold_preserved, false); assert.equal(current.state, "held");
    assert.equal(current.reconciliation_verified, true); assert.equal(digest(row(env, id)), original); await preview(env);
  });
  await check("concurrent nonce consumption produces exactly one reconciliation record", async (env, id) => {
    const p = await review(env, id), input = reconcileInput(p);
    const responses = await Promise.all([env.owner.request("POST", "/api/model-reconciliations/commit", input), env.owner.request("POST", "/api/model-reconciliations/commit", input)]);
    assert.equal(responses.filter(result => result.statusCode === 200).length, 1);
    assert(responses.every(result => [200, 409, 429].includes(result.statusCode)));
    assert.equal(env.service.auth.db.prepare("SELECT count(*) AS n FROM operator_model_reconciliations WHERE state='committed'").get().n, 1);
  });
  await check("caller-supplied resolution, actor, scope and authority are rejected", async (env, id) => {
    await env.owner.post(`/api/model-evaluations/${id}/reconciliation/preview`, { resolution: "release" }, 400);
    const p = await review(env, id);
    for (const [field, value] of [["actor", "USER"], ["subject", p.subject], ["release_authorized", true]]) {
      await env.owner.post("/api/model-reconciliations/commit", { ...reconcileInput(p), [field]: value }, 400);
    }
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true);
  });
  await check("a changed private terminal label cannot hide original signed model history", async (env, id) => {
    env.service.auth.db.prepare("UPDATE operator_model_actions SET state='invalidated' WHERE id=?").run(id);
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true);
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
  });
  await check("an ignored receipt update cannot be returned as a committed acknowledgment", async (env, id) => {
    const p = await review(env, id);
    env.service.auth.db.exec("CREATE TRIGGER synthetic_ignored_model_record BEFORE UPDATE ON operator_model_reconciliations WHEN NEW.state='committed' BEGIN SELECT RAISE(IGNORE); END;");
    const response = await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p), 409);
    assert.equal(response.error, "CONSOLE_MODEL_RECONCILIATION_RECORD_NOT_PERSISTED");
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true);
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_model_reconciliations WHERE id=?").get(p.reconciliation_id).state, "failed");
  });
  await check("recovery acknowledgment works with model execution disabled but never enables it", async (env, id) => {
    await env.service.app.close(); env.configuration.semantic = null; env.service = await createConsole(env.configuration); await env.service.app.ready();
    env.owner = client(env.service); await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password }); await env.owner.session();
    const p = await review(env, id); await env.owner.post("/api/model-reconciliations/commit", reconcileInput(p));
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, false);
    assert.equal((await env.owner.session()).semantic_review_available, false); await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
  });
  await check("revoked actual stored sessions cannot finish a preview using a cached owner object", async (env, id) => {
    const p = await review(env, id), session = env.owner.storedSession();
    await env.owner.post("/api/logout", {});
    await assert.rejects(() => env.service.semantic.reconciliation.commit(session, reconcileInput(p)), /CONSOLE_SESSION_REVOKED/);
    assert.equal(env.service.auth.db.prepare("SELECT authorization FROM operator_model_reconciliations WHERE id=?").get(p.reconciliation_id).authorization, null);
  });
  await check("model reconciliation retains origin and CSRF defenses", async (env, id) => {
    const p = await review(env, id), cookie = [...env.owner.jar].map(([key, value]) => require("@fastify/cookie").serialize(key, value)).join("; ");
    for (const origin of ["http://evil.invalid", "http://127.0.0.1:4317"]) {
      const response = await env.service.app.inject({ method: "POST", url: "/api/model-reconciliations/commit", payload: reconcileInput(p),
        headers: { host: "127.0.0.1:4317", origin, cookie } }); assert.equal(response.statusCode, 403);
    }
    assert.equal((await env.owner.get(`/api/model-evaluations/${id}`)).hold_preserved, true);
  });
  await check("actual process death after reservation never replays a transfer or acknowledgment on restart", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-model-reconciliation-crash-")), file = path.join(directory, "context.json");
    let context, service;
    try {
      const child = spawnSync(process.execPath, [path.join(__dirname, "operator-semantic-fixtures/reconciliation-crash-worker.js"), file],
        { encoding: "utf8", timeout: 60000, maxBuffer: 1048576, detached: true });
      assert.equal(child.error, undefined, child.error?.message); assert.equal(child.signal, "SIGKILL");
      context = JSON.parse(fs.readFileSync(file)); assert.equal(context.actual_receipt_boundary_reached, true); assert.equal(context.process_id, child.pid);
      assert.throws(() => process.kill(child.pid, 0), error => error.code === "ESRCH");
      assert.throws(() => process.kill(-child.pid, 0), error => error.code === "ESRCH");
      service = await createConsole(context.configuration); await service.app.ready();
      const owner = client(service); await owner.session(); await owner.post("/api/login", { username: "owner", password }); await owner.session();
      const before = service.auth.db.prepare("SELECT * FROM operator_model_reconciliations WHERE id=?").get(context.reconciliation_id);
      assert.equal(before.state, "failed"); assert(before.authorization); assert.equal(before.record, null);
      assert.equal(before.failure, "CONSOLE_MODEL_RECONCILIATION_INTERRUPTED");
      assert.equal((await owner.get(`/api/model-evaluations/${context.action_id}`)).hold_preserved, true);
      const p = await owner.post(`/api/model-evaluations/${context.action_id}/reconciliation/preview`, {});
      await owner.post("/api/model-reconciliations/commit", reconcileInput(p));
      assert.equal(digest(service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(context.action_id)), context.original_sha256);
      assert.equal(fs.readdirSync(path.join(context.configuration.stateDir, "model-evaluations")).length, 1);
      assert.equal((await owner.get(`/api/model-evaluations/${context.action_id}`)).hold_preserved, false);
    } finally { if (service) await service.app.close(); if (context) fs.rmSync(context.root, { recursive: true, force: true }); fs.rmSync(directory, { recursive: true, force: true }); }
  });
  const failures = results.filter(result => !result.passed);
  console.log(JSON.stringify({ total: results.length, passed: results.length - failures.length, failed: failures.length, failures,
    actual_model_invocations: 0, provider: "measured_fake_process", semantic_admission_complete: false }, null, 2));
  if (failures.length) process.exitCode = 1;
}
module.exports = { reconcileInput };
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
