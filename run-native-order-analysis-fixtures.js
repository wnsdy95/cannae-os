#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const support = require("./order-analysis-fixtures/support"), { createConsole } = require("./operator-console-server");
const { client, password } = require("./operator-consent-fixtures/support"), { terminal, commitInput, started } = require("./operator-semantic-fixtures/support");
const { inspectDraft } = require("./request-order-compiler");
let passed = 0;
async function check(name, fn, settings = {}) {
  const env = support.environment(), configuration = { ...env.configuration, ...settings }; let service;
  try {
    service = env.service = await createConsole(configuration); env.configuration = configuration; await service.app.ready();
    env.owner = client(service); await env.owner.session(); await env.owner.post("/api/setup", { username: "owner", password, token: service.auth.createBootstrap() }); await env.owner.session();
    env.refresh = async () => { const list = await env.owner.get("/api/evidence?kind=mission-requests"); return { entry_id: list.entries[0].id, manifest: list.manifest_sha256 }; };
    env.previewInput = await env.refresh(); await fn(env); passed++; console.log(`PASS ${name}`);
  } finally { if (service) await service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); }
}
const preview = env => env.owner.post("/api/order-analyses/preview", env.previewInput);
async function main() {
  await check("actual owner request analysis consumes the collector response in the real compiler and binds its exact signed draft/journal", async env => {
    assert.equal((await env.owner.session()).order_analysis_available, true);
    assert.equal((await env.owner.get("/api/evidence?kind=order-drafts")).total, 0);
    const prepared = await preview(env); assert.equal(prepared.purpose, "order_analysis"); assert.equal(prepared.invocation.preview.input.request.text, support.REQUEST_TEXT);
    await env.owner.post("/api/order-analyses/commit", commitInput(prepared), 202); const current = await terminal(env, prepared.challenge_id);
    assert.equal(current.state, "evaluated"); assert.equal(current.result_verified, true); assert.equal(current.result.type, "OperatorOrderAnalysis");
    assert.equal(current.result.consent_sha256, require("./order-intake-contract").digest(current.consent));
    const draft = inspectDraft({ ...env.options, draftId: current.result.draft_ref.artifact_id });
    assert.equal(draft.draft.analysis_sha256, current.result.assessment.analysis_sha256); assert.equal(draft.status, current.result.draft_status);
    assert.equal(draft.artifact_ref.sha256, current.result.draft_ref.sha256); assert.equal(current.execution_authorized, false); assert.equal(current.release_authorized, false);
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(env.stateDir, "model-evaluations", prepared.challenge_id, "result.json"))).digest("hex"), current.result.collection.journal_sha256);
    const pair = crypto.generateKeyPairSync("ed25519"), privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }), publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
    const signatures = require("./operator-consent-contract"), resultContract = require("./operator-order-analysis-contract");
    assert(resultContract.verifyEvaluation(signatures.signOperatorRecord(current.result, privateKey), publicKey, prepared.invocation));
    for (const mutate of [value => { value.requested_model = "other"; }, value => { value.method_sha256 = "0".repeat(64); },
      value => { value.cli_executable_sha256 = "0".repeat(64); }, value => { value.draft_ref.artifact_id = "OD-OTHER"; }]) {
      const value = JSON.parse(JSON.stringify(current.result)); mutate(value); const signed = signatures.signOperatorRecord(value, privateKey);
      assert.equal(signatures.validOperatorSignature(signed, publicKey), true);
      assert.throws(() => resultContract.verifyEvaluation(signed, publicKey, prepared.invocation), /CONSOLE_ANALYSIS_RESULT_INVALID/);
    }
    await env.owner.post("/api/order-analyses/commit", commitInput(prepared), 409);
    assert.equal((await env.owner.get("/api/evidence?kind=order-drafts")).total, 1);
  });
  await check("omission and analysis commit endpoints cannot swap each other's challenges before reservation", async env => {
    const prepared = await preview(env);
    const error = await env.owner.post("/api/model-evaluations/commit", commitInput(prepared), 409); assert.equal(error.error, "CONSOLE_MODEL_PURPOSE_INVALID");
    assert.equal(fs.readdirSync(path.join(env.stateDir, "model-evaluations")).length, 0);
    await env.owner.post("/api/order-analyses/commit", commitInput(prepared), 202); assert.equal((await terminal(env, prepared.challenge_id)).state, "evaluated");
    env.previewInput = await env.refresh();
    const draft = (await env.owner.get("/api/evidence?kind=order-drafts")).entries[0], manifest = (await env.owner.get("/api/evidence")).manifest_sha256;
    const omission = await env.owner.post("/api/model-evaluations/preview", { entry_id: draft.id, manifest });
    assert.equal((await env.owner.post("/api/order-analyses/commit", commitInput(omission), 409)).error, "CONSOLE_MODEL_PURPOSE_INVALID");
  }, { semantic: { executable: path.join(__dirname, "semantic-evaluation-fixtures/fake-codex.js"), model: "fixture-valid", timeoutMs: 10000 } });
  await check("blocking unknowns stay needs_clarification even after actual successful transfer and compilation", async env => {
    const prepared = await preview(env); await env.owner.post("/api/order-analyses/commit", commitInput(prepared), 202);
    const current = await terminal(env, prepared.challenge_id); assert.equal(current.state, "evaluated"); assert.equal(current.result.draft_status, "needs_clarification");
    assert.equal(inspectDraft({ ...env.options, draftId: current.result.draft_ref.artifact_id }).status, "needs_clarification");
  }, { analysis: { executable: path.join(__dirname, "order-analysis-fixtures/fake-codex.js"), model: "analysis-uncertain", timeoutMs: 10000 } });
  await check("a trusted proposed-role envelope change invalidates the already prepared invocation before reservation", async env => {
    const prepared = await preview(env); env.configuration.analysis.allowedRoles = ["S2"];
    assert.equal((await env.owner.post("/api/order-analyses/commit", commitInput(prepared), 409)).error, "CONSOLE_MODEL_PREVIEW_CHANGED");
    assert.equal(fs.readdirSync(path.join(env.stateDir, "model-evaluations")).length, 0);
  });
  await check("a failure after actual compiler publication preserves the draft and failed one-use action without model replay", async env => {
    const generator = require("./order-analysis-generator"), original = generator.compileAnalysis;
    generator.compileAnalysis = (...args) => { original(...args); throw new Error("SEMANTIC_ANALYSIS_PUBLICATION_UNKNOWN"); };
    try {
      const prepared = await preview(env); await env.owner.post("/api/order-analyses/commit", commitInput(prepared), 202);
      const current = await terminal(env, prepared.challenge_id);
      assert.equal(current.state, "held"); assert.equal(current.result_verified, true); assert.equal(current.hold_preserved, true);
      assert.equal(current.result.error, "SEMANTIC_ANALYSIS_PUBLICATION_UNKNOWN"); assert.equal(current.result.draft_ref, null);
      const drafts = await env.owner.get("/api/evidence?kind=order-drafts"); assert.equal(drafts.total, 1);
      assert.equal(inspectDraft({ ...env.options, draftId: drafts.entries[0].artifact_id }).draft.execution_authorized, false);
      assert.equal(fs.readdirSync(path.join(env.stateDir, "model-evaluations")).length, 1);
      env.previewInput = await env.refresh();
      assert.equal((await env.owner.post("/api/order-analyses/preview", env.previewInput, 409)).error, "CONSOLE_MODEL_RECONCILIATION_REQUIRED");
      await env.owner.post("/api/order-analyses/commit", commitInput(prepared), 409);
      assert.equal(fs.readdirSync(path.join(env.stateDir, "model-evaluations")).length, 1);
    } finally { generator.compileAnalysis = original; }
  });
  for (const model of ["analysis-forged", "analysis-authority", "fixture-null", "fixture-invalid-utf8", "fixture-tool"]) {
    await check(`actual ${model} collection cannot create an order and holds both model purposes`, async env => {
      const prepared = await preview(env); await env.owner.post("/api/order-analyses/commit", commitInput(prepared), 202);
      const current = await terminal(env, prepared.challenge_id); assert.equal(current.state, "held"); assert.equal(current.hold_preserved, true);
      assert.equal((await env.owner.get("/api/evidence?kind=order-drafts")).total, 0);
      assert.equal((await env.owner.post("/api/order-analyses/preview", env.previewInput, 409)).error, "CONSOLE_MODEL_RECONCILIATION_REQUIRED");
      assert.equal((await env.owner.post(`/api/model-evaluations/${current.id}/reconciliation/preview`, {}, 409)).error, "CONSOLE_MODEL_RECONCILIATION_PURPOSE_UNSUPPORTED");
      const { completeAnalysis } = require("./request-order-compiler-fixtures/support");
      require("./request-order-compiler").compileOrder(completeAnalysis(env.request.artifact_ref), env.options);
      const drafts = await env.owner.get("/api/evidence?kind=order-drafts");
      assert.equal((await env.owner.post("/api/model-evaluations/preview", { entry_id: drafts.entries[0].id, manifest: drafts.manifest_sha256 }, 409)).error, "CONSOLE_MODEL_RECONCILIATION_REQUIRED");
    }, { analysis: { executable: path.join(__dirname, "order-analysis-fixtures/fake-codex.js"), model, timeoutMs: 10000 },
      semantic: { executable: path.join(__dirname, "semantic-evaluation-fixtures/fake-codex.js"), model: "fixture-valid", timeoutMs: 10000 } });
  }
  await check("viewer role and untrusted browser model/purpose fields cannot prepare or commit analysis", async env => {
    const invitation = await env.owner.post("/api/invites", { password, missions: [env.options.mission] }), viewer = client(env.service);
    await viewer.session(); await viewer.post("/api/register", { username: "viewer", password, token: invitation.token }); await viewer.session();
    await viewer.post("/api/order-analyses/preview", env.previewInput, 403);
    const prepared = await preview(env); await viewer.post("/api/order-analyses/commit", commitInput(prepared), 403);
    await env.owner.post("/api/order-analyses/preview", { ...env.previewInput, model: "not-allowed" }, 400);
    await env.owner.post("/api/order-analyses/commit", { ...commitInput(prepared), purpose: "different" }, 400);
  });
  await check("logout cancels the actual analysis child and cannot publish a generated draft from a revoked session", async env => {
    const prepared = await preview(env); await env.owner.post("/api/order-analyses/commit", commitInput(prepared), 202); await started(env, prepared.challenge_id);
    await env.owner.post("/api/logout", {}); await new Promise(resolve => setTimeout(resolve, 600));
    const owner = env.owner = client(env.service); await owner.session(); await owner.post("/api/login", { username: "owner", password }); await owner.session();
    const current = await terminal(env, prepared.challenge_id); assert.equal(current.state, "held"); assert.equal(current.result.collection.process_group_absent, true);
    assert.equal((await owner.get("/api/evidence?kind=order-drafts")).total, 0);
  }, { analysis: { executable: path.join(__dirname, "order-analysis-fixtures/fake-codex.js"), model: "fixture-timeout", timeoutMs: 10000 } });
  console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, release_authorized: false }, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
