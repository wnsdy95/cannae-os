#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), os = require("node:os"), { spawnSync } = require("node:child_process");
const { environment, failed, restart, review, ackInput, row, client, password } = require("./order-analysis-fixtures/reconciliation-support");
const { digest, validOperatorSignature } = require("./operator-consent-contract");
const { verifyRepositoryArtifacts, writeRepositoryArtifact } = require("./repository-artifact-store");
const { inspectDraft } = require("./request-order-compiler"), { commitInput, terminal } = require("./operator-semantic-fixtures/support");
const cases = [];
const add = (name, run, settings = {}, stage) => cases.push({ name, run, settings, stage });
const count = env => fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")).length;
const held = (env, id) => env.owner.get(`/api/model-evaluations/${id}`);
add("failed analysis acknowledgment preserves its original row/journal and grants no replay or task authority", async (env, id) => {
  const before = digest(row(env, id)), directory = path.join(env.configuration.stateDir, "model-evaluations", id), original = fs.readFileSync(path.join(directory, "result.json"));
  const manifest = verifyRepositoryArtifacts({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot }).manifest_sha256;
  const p = await review(env, id); assert.equal(p.purpose, "order_analysis"); assert.equal(p.subject.publication.kind, "no_accepted_response");
  const result = await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p));
  const key = (await env.owner.get("/api/operator-key")).public_key_pem;
  assert.equal(result.record.type, "OperatorAnalysisReconciliationRecord"); assert(validOperatorSignature(result.record, key));
  assert(validOperatorSignature(result.record.authorization, key)); assert.equal(result.new_model_invocation_started, false); assert.equal(result.execution_authorized, false); assert.equal(result.release_authorized, false);
  assert.equal(digest(row(env, id)), before); assert(original.equals(fs.readFileSync(path.join(directory, "result.json"))));
  const current = await held(env, id); assert.equal(current.state, "held"); assert.equal(current.result.status, "held"); assert.equal(current.hold_preserved, false); assert.equal(current.reconciliation_verified, true);
  assert.equal(count(env), 1); assert.equal(verifyRepositoryArtifacts({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot }).manifest_sha256, manifest);
  const history = await env.owner.get(`/api/order-analyses/${id}/reconciliations`); assert.equal(history.entries.length, 1); assert.equal(history.entries[0].state, "committed");
  await env.owner.post("/api/order-analyses/preview", await env.refresh()); assert.equal(count(env), 1);
  await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p), 409); await review(env, id, 409);
});
for (const stage of ["before_publication", "after_publication"]) add(`${stage}: accepted response is appraised without invoking the compiler again`, async (env, id) => {
  const before = digest(row(env, id)), p = await review(env, id), publication = p.subject.publication;
  assert.equal(publication.kind, "accepted_response"); assert.equal(publication.publication_state, stage === "after_publication" ? "published" : "not_in_verified_manifest");
  const drafts = await env.owner.get("/api/evidence?kind=order-drafts"); assert.equal(drafts.total, stage === "after_publication" ? 1 : 0);
  if (drafts.total) assert.equal(inspectDraft({ ...env.options, draftId: publication.expected_draft_id }).artifact_ref.sha256, publication.draft_ref.sha256);
  const generator = require("./order-analysis-generator"), compile = generator.compileAnalysis; generator.compileAnalysis = () => { throw new Error("Unexpected compiler replay"); };
  try { await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p)); } finally { generator.compileAnalysis = compile; }
  assert.equal((await held(env, id)).hold_preserved, false); assert.equal(digest(row(env, id)), before); assert.equal(count(env), 1);
  assert.equal((await env.owner.get("/api/evidence?kind=order-drafts")).total, drafts.total);
}, { model: "analysis-valid" }, stage);
add("later separately approved publication can retain a prior exact observation of absence", async (env, id) => {
  const p = await review(env, id); assert.equal(p.subject.publication.publication_state, "not_in_verified_manifest");
  await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p));
  const next = await env.owner.post("/api/order-analyses/preview", await env.refresh()); await env.owner.post("/api/order-analyses/commit", commitInput(next), 202);
  const result = await terminal(env, next.challenge_id); assert.equal(result.state, "evaluated"); assert.equal(result.result.draft_ref.artifact_id, p.subject.publication.expected_draft_id);
  const old = await held(env, id); assert.equal(old.hold_preserved, false); assert.equal(old.reconciliation.authorization.subject.publication.publication_state, "not_in_verified_manifest"); assert.equal(count(env), 2);
}, { model: "analysis-valid" }, "before_publication");
add("omission routes cannot preview, inspect or consume analysis consent before reservation", async (env, id) => {
  assert.equal((await env.owner.post(`/api/model-evaluations/${id}/reconciliation/preview`, {}, 409)).error, "CONSOLE_MODEL_RECONCILIATION_PURPOSE_UNSUPPORTED");
  await env.owner.get(`/api/model-evaluations/${id}/reconciliations`, 409);
  const p = await review(env, id), input = ackInput(p); delete input.acknowledge_analysis_publication;
  assert.equal((await env.owner.post("/api/model-reconciliations/commit", input, 409)).error, "CONSOLE_MODEL_RECONCILIATION_PURPOSE_UNSUPPORTED");
  assert.equal(env.service.auth.db.prepare("SELECT authorization FROM operator_model_reconciliations WHERE id=?").get(p.reconciliation_id).authorization, null);
  await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p));
});
add("analysis routes cannot consume a real omission failure or its owner challenge", async (env, id) => {
  const p = await review(env, id); await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p));
  require("./request-order-compiler").compileOrder(require("./request-order-compiler-fixtures/support").completeAnalysis(env.request.artifact_ref), env.options);
  env.configuration.semantic.model = "fixture-invalid";
  const drafts = await env.owner.get("/api/evidence?kind=order-drafts"), next = await env.owner.post("/api/model-evaluations/preview", { entry_id: drafts.entries[0].id, manifest: drafts.manifest_sha256 });
  await env.owner.post("/api/model-evaluations/commit", commitInput(next), 202); const result = await terminal(env, next.challenge_id); assert.equal(result.state, "held");
  assert.equal((await review(env, result.id, 409)).error, "CONSOLE_MODEL_RECONCILIATION_PURPOSE_UNSUPPORTED");
  const old = await env.owner.post(`/api/model-evaluations/${result.id}/reconciliation/preview`, {});
  await env.owner.post("/api/analysis-reconciliations/commit", ackInput(old), 409);
  const input = ackInput(old); delete input.acknowledge_analysis_publication; await env.owner.post("/api/model-reconciliations/commit", input);
});
add("password, nonce, publication/provider acknowledgments and caller overrides cannot widen consent", async (env, id) => {
  const p = await review(env, id), input = ackInput(p);
  await env.owner.post("/api/analysis-reconciliations/commit", { ...input, password: "incorrect-password" }, 403);
  await env.owner.post("/api/analysis-reconciliations/commit", { ...input, nonce: "x".repeat(43) }, 409);
  for (const field of ["acknowledge_provider_uncertainty", "acknowledge_analysis_publication"]) {
    const changed = { ...input }; delete changed[field]; await env.owner.post("/api/analysis-reconciliations/commit", changed, 400);
  }
  for (const [name, value] of [["subject", p.subject], ["actor", "USER"], ["release_authorized", true], ["resolution", "adopt_draft"]]) await env.owner.post("/api/analysis-reconciliations/commit", { ...input, [name]: value }, 400);
  await env.owner.post("/api/analysis-reconciliations/commit", { ...input, rationale: p.nonce }, 400);
  assert.equal((await held(env, id)).hold_preserved, true);
});
add("viewer roles and another stored owner session cannot consume a leaked analysis nonce", async (env, id) => {
  const p = await review(env, id), other = client(env.service); await other.session(); await other.post("/api/login", { username: "owner", password }); await other.session();
  await other.post("/api/analysis-reconciliations/commit", ackInput(p), 409);
  const invitation = await env.owner.post("/api/invites", { password, missions: [env.options.mission] }), viewer = client(env.service);
  await viewer.session(); await viewer.post("/api/register", { username: "viewer", password, token: invitation.token }); await viewer.session();
  await viewer.post(`/api/order-analyses/${id}/reconciliation/preview`, {}, 403); await viewer.get(`/api/order-analyses/${id}/reconciliations`, 403);
  await viewer.post("/api/analysis-reconciliations/commit", ackInput(p), 403); await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p));
});
for (const change of ["manifest", "response", "journal", "invocation", "expiry"]) add(`${change} changes cannot consume a stale analysis recovery preview`, async (env, id) => {
  const p = await review(env, id), directory = path.join(env.configuration.stateDir, "model-evaluations", id);
  if (change === "manifest") writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: env.options.mission, waveId: env.options.wave,
    kind: "agent-outputs", artifactId: "CHANGED-ANALYSIS-REVIEW", payload: { synthetic: true } });
  if (change === "response" || change === "journal") fs.appendFileSync(path.join(directory, change === "response" ? "response.json" : "result.json"), "\n");
  if (change === "invocation") { const value = JSON.parse(row(env, id).preview); value.preview.mission_id = "MIS-CHANGED"; env.service.auth.db.prepare("UPDATE operator_model_actions SET preview=? WHERE id=?").run(JSON.stringify(value), id); }
  if (change === "expiry") env.service.auth.db.prepare("UPDATE operator_model_reconciliations SET expires=0 WHERE id=?").run(p.reconciliation_id);
  const denial = await env.owner.request("POST", "/api/analysis-reconciliations/commit", ackInput(p)); assert(denial.statusCode >= 400);
  assert.equal((await held(env, id)).hold_preserved, true);
}, { model: "analysis-valid" }, "after_publication");
add("a missing signed result, changed PID journal or unobservable process preserves the analysis hold", async (env, id) => {
  const file = path.join(env.configuration.stateDir, "model-evaluations", id, "result.json"), original = fs.readFileSync(file), journal = JSON.parse(original), kill = process.kill;
  for (const mode of ["present", "unobservable"]) {
    process.kill = function(target, signal) { if (Math.abs(target) === journal.pid && signal === 0) { if (mode === "present") return true; throw Object.assign(new Error("Synthetic denial"), { code: "EPERM" }); } return kill.call(process, target, signal); };
    try { await review(env, id, 409); } finally { process.kill = kill; }
  }
  fs.writeFileSync(file, JSON.stringify({ ...journal, pid: 2147483000 })); await review(env, id, 409); fs.writeFileSync(file, original);
  env.service.auth.db.prepare("UPDATE operator_model_actions SET result=NULL WHERE id=?").run(id); await review(env, id, 409);
  assert.equal((await held(env, id)).hold_preserved, true); assert.equal(count(env), 1);
});
add("failed receipt persistence needs fresh consent and mutation of a consumed attempt reinstates the hold", async (env, id) => {
  const p = await review(env, id), original = digest(row(env, id));
  env.service.auth.db.exec("CREATE TRIGGER synthetic_analysis_record_failure BEFORE UPDATE ON operator_model_reconciliations WHEN NEW.state='committed' BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;");
  assert((await env.owner.request("POST", "/api/analysis-reconciliations/commit", ackInput(p))).statusCode >= 400);
  const failedRow = env.service.auth.db.prepare("SELECT * FROM operator_model_reconciliations WHERE id=?").get(p.reconciliation_id); assert.equal(failedRow.state, "failed"); assert(failedRow.authorization); assert.equal(failedRow.record, null);
  env.service.auth.db.exec("DROP TRIGGER synthetic_analysis_record_failure"); await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p), 409);
  const next = await review(env, id); await env.owner.post("/api/analysis-reconciliations/commit", ackInput(next)); assert.equal((await held(env, id)).hold_preserved, false); assert.equal(digest(row(env, id)), original);
  env.service.auth.db.prepare("UPDATE operator_model_reconciliations SET failure='CHANGED' WHERE id=?").run(p.reconciliation_id); assert.equal((await held(env, id)).hold_preserved, true);
});
for (const changed of ["receipt", "response_after_receipt"]) add(`changed ${changed} reinstates the analysis hold after an apparent terminal acknowledgment`, async (env, id) => {
  const p = await review(env, id); await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p)); assert.equal((await held(env, id)).hold_preserved, false);
  if (changed === "receipt") env.service.auth.db.prepare("UPDATE operator_model_reconciliations SET record=NULL WHERE id=?").run(p.reconciliation_id);
  else fs.appendFileSync(path.join(env.configuration.stateDir, "model-evaluations", id, "response.json"), "\n");
  assert.equal((await held(env, id)).hold_preserved, true); await env.owner.post("/api/order-analyses/preview", await env.refresh(), 409);
}, { model: "analysis-valid" }, "after_publication");
add("an ignored analysis receipt update cannot be returned as a successful acknowledgment", async (env, id) => {
  const p = await review(env, id);
  env.service.auth.db.exec("CREATE TRIGGER synthetic_ignored_analysis_record BEFORE UPDATE ON operator_model_reconciliations WHEN NEW.state='committed' BEGIN SELECT RAISE(IGNORE); END;");
  assert.equal((await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p), 409)).error, "CONSOLE_MODEL_RECONCILIATION_RECORD_NOT_PERSISTED");
  assert.equal((await held(env, id)).hold_preserved, true); assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_model_reconciliations WHERE id=?").get(p.reconciliation_id).state, "failed");
});
add("restart invalidates pending approval and verifies saved analysis acknowledgment with execution disabled", async (env, id) => {
  const p = await review(env, id), original = digest(row(env, id)); await restart(env, true);
  await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p), 409);
  const next = await review(env, id); await env.owner.post("/api/analysis-reconciliations/commit", ackInput(next)); await restart(env);
  assert.equal((await held(env, id)).hold_preserved, false); assert.equal(digest(row(env, id)), original); assert.equal((await env.owner.session()).order_analysis_available, false); assert.equal(count(env), 1);
  await env.owner.post("/api/order-analyses/preview", await env.refresh(), 409);
}, { model: "analysis-valid" }, "after_publication");
add("concurrent purpose-specific consumption retains exactly one signed receipt", async (env, id) => {
  const p = await review(env, id), requests = [env.owner.request("POST", "/api/analysis-reconciliations/commit", ackInput(p)), env.owner.request("POST", "/api/analysis-reconciliations/commit", ackInput(p))];
  const responses = await Promise.all(requests); assert.equal(responses.filter(r => r.statusCode === 200).length, 1); assert(responses.every(r => [200, 409, 429].includes(r.statusCode)));
  assert.equal(env.service.auth.db.prepare("SELECT count(*) AS n FROM operator_model_reconciliations WHERE state='committed'").get().n, 1);
});
for (const phase of ["reserved", "committed"]) cases.push({ name: `actual process death at ${phase} receipt boundary preserves the failed analysis without replay`, standalone: true, async run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-analysis-recovery-crash-")), file = path.join(directory, "context.json"); let context, service;
  try {
    const child = spawnSync(process.execPath, [path.join(__dirname, "order-analysis-fixtures/reconciliation-crash-worker.js"), file, phase], { encoding: "utf8", timeout: 120000 });
    if (fs.existsSync(file)) context = JSON.parse(fs.readFileSync(file));
    assert.equal(child.signal, "SIGKILL", child.stderr); assert.equal(context.receipt_boundary_reached, true); assert.equal(context.commit_returned, phase === "committed");
    context.configuration.analysis = null; context.configuration.semantic = null;
    service = await require("./operator-console-server").createConsole(context.configuration); await service.app.ready();
    const env = { ...context, service, owner: client(service) }; await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password }); await env.owner.session();
    const attempt = service.auth.db.prepare("SELECT * FROM operator_model_reconciliations WHERE id=?").get(context.reconciliation_id);
    assert.equal(attempt.state, phase === "reserved" ? "failed" : "committed"); assert(attempt.authorization);
    const current = await held(env, context.action_id); assert.equal(current.state, "held"); assert.equal(current.hold_preserved, phase === "reserved");
    assert.equal(digest(row(env, context.action_id)), context.original_sha256);
    if (phase === "reserved") { const p = await review(env, context.action_id); await env.owner.post("/api/analysis-reconciliations/commit", ackInput(p)); }
    assert.equal((await held(env, context.action_id)).hold_preserved, false); assert.equal(count(env), 1);
    assert.equal((await env.owner.get("/api/evidence?kind=order-drafts")).total, 1); assert.equal((await env.owner.session()).order_analysis_available, false);
  } finally { if (service) await service.app.close(); if (context) fs.rmSync(context.root, { recursive: true, force: true }); fs.rmSync(directory, { recursive: true, force: true }); }
} });
async function run(selected = cases) {
  const results = [];
  for (const item of selected) {
    let env;
    try { if (item.standalone) await item.run(); else { env = await environment(item.settings); const id = await failed(env, item.stage); await item.run(env, id); }
      results.push({ name: item.name, passed: true }); console.log(`PASS ${item.name}`); }
    catch (error) { results.push({ name: item.name, passed: false, error: error.stack }); console.error(`FAIL ${item.name}: ${error.stack}`); }
    finally { if (env) { await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); } }
  }
  const result = { total: results.length, planned_cases: cases.length, passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length,
    focused_subset: selected !== cases, results, actual_model_invocations: 0, real_owner_actions: 0, release_authorized: false };
  console.log(JSON.stringify(result, null, 2)); return result;
}
module.exports = { run, cases };
if (require.main === module) run().then(result => { process.exitCode = result.failed ? 1 : 0; }).catch(error => { console.error(error.stack); process.exitCode = 1; });
