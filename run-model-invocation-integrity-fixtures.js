#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { environment } = require("./order-analysis-fixtures/support"), { createConsole } = require("./operator-console-server");
const { client, password } = require("./operator-consent-fixtures/support"), { commitInput, terminal } = require("./operator-semantic-fixtures/support");
const { digest } = require("./order-intake-contract"), { signOperatorRecord, validOperatorSignature } = require("./operator-consent-contract");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex"); let passed = 0;
async function check(purpose) {
  const env = environment(); let service;
  try {
    const configuration = { ...env.configuration, semantic: { executable: path.join(__dirname, "semantic-evaluation-fixtures/fake-codex.js"), model: "fixture-valid", timeoutMs: 10000 } };
    if (purpose === "semantic") require("./request-order-compiler").compileOrder(require("./request-order-compiler-fixtures/support").completeAnalysis(env.request.artifact_ref), env.options);
    service = env.service = await createConsole(configuration); env.configuration = configuration; await service.app.ready();
    env.owner = client(service); await env.owner.session(); await env.owner.post("/api/setup", { username: "testowner", password, token: service.auth.createBootstrap() }); await env.owner.session();
    const sourceKind = purpose === "analysis" ? "mission-requests" : "order-drafts", endpoint = purpose === "analysis" ? "/api/order-analyses" : "/api/model-evaluations";
    const list = await env.owner.get(`/api/evidence?kind=${sourceKind}`), prepared = await env.owner.post(`${endpoint}/preview`, { entry_id: list.entries[0].id, manifest: list.manifest_sha256 });
    await env.owner.post(`${endpoint}/commit`, commitInput(prepared), 202); const current = await terminal(env, prepared.challenge_id);
    assert.equal(current.state, "evaluated"); assert.equal(current.result_verified, true);
    const invocation = JSON.parse(service.auth.db.prepare("SELECT preview FROM operator_model_actions WHERE id=?").get(current.id).preview);
    const collector = require(purpose === "analysis" ? "./codex-order-analysis-collector" : "./codex-semantic-collector");
    collector.verifyTransferConsent(current.consent, invocation, service.consent.publicKey(), Date.parse(current.consent.created_at));
    const reordered = Object.fromEntries(Object.entries(invocation).reverse());
    reordered.preview = Object.fromEntries(Object.entries(invocation.preview).reverse());
    collector.verifyTransferConsent(current.consent, reordered, service.consent.publicKey(), Date.parse(current.consent.created_at));
    for (const mutate of [value => { value.preview.mission_id = "MIS-SUBSTITUTED"; }, value => { value.preview.wave_id = "WRONG"; },
      value => { value.profile.requested_model = "wrong-model"; }, value => { value.preview.expires_at = "2099-01-01T00:00:00Z"; }]) {
      const changed = structuredClone(invocation); mutate(changed);
      assert.throws(() => collector.verifyTransferConsent(current.consent, changed, service.consent.publicKey(), Date.parse(current.consent.created_at)), /SEMANTIC_INVOCATION_SUBSTITUTED/);
    }
    const rehashed = structuredClone(invocation); rehashed.preview.mission_id = "MIS-SUBSTITUTED";
    const { preview_sha256: previousPreview, ...previewBody } = rehashed.preview; rehashed.preview.preview_sha256 = digest(previewBody);
    const { invocation_sha256: previousInvocation, ...rehashedBody } = rehashed; rehashed.invocation_sha256 = digest(rehashedBody);
    assert.throws(() => collector.verifyTransferConsent(current.consent, rehashed, service.consent.publicKey(), Date.parse(current.consent.created_at)), /SEMANTIC_TRANSFER_CONSENT_SUBSTITUTED/);
    const broken = structuredClone(invocation); broken.preview.preview_sha256 = "0".repeat(64);
    const { invocation_sha256, ...body } = broken; broken.invocation_sha256 = digest(body);
    const pair = crypto.generateKeyPairSync("ed25519"), privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }), publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
    const consent = signOperatorRecord({ ...current.consent, invocation_sha256: broken.invocation_sha256 }, privateKey);
    assert.equal(validOperatorSignature(consent, publicKey), true);
    assert.throws(() => collector.verifyTransferConsent(consent, broken, publicKey, Date.parse(consent.created_at)), /SEMANTIC_INVOCATION_PREVIEW_SUBSTITUTED/);
    const file = path.join(env.stateDir, "model-evaluations", current.id, "result.json"), originalJournal = fs.readFileSync(file);
    const changed = structuredClone(invocation); changed.preview.mission_id = "MIS-SUBSTITUTED";
    service.auth.db.prepare("UPDATE operator_model_actions SET preview=? WHERE id=?").run(JSON.stringify(changed), current.id);
    const inspected = await env.owner.get(`/api/model-evaluations/${current.id}`);
    assert.equal(inspected.result_verified, false); assert.equal(inspected.state, "unverifiable"); assert.equal(inspected.hold_preserved, true); assert.equal(inspected.result, null);
    assert.equal(validOperatorSignature(current.result, service.consent.publicKey()), true); assert.equal(validOperatorSignature(current.consent, service.consent.publicKey()), true);
    assert.equal(hash(fs.readFileSync(file)), hash(originalJournal));
    for (const [next, kind] of [["/api/order-analyses", "mission-requests"], ["/api/model-evaluations", "order-drafts"]]) {
      const latest = await env.owner.get(`/api/evidence?kind=${kind}`);
      assert.equal((await env.owner.post(`${next}/preview`, { entry_id: latest.entries[0].id, manifest: latest.manifest_sha256 }, 409)).error, "CONSOLE_MODEL_RECONCILIATION_REQUIRED");
    }
    assert.equal(fs.readdirSync(path.join(env.stateDir, "model-evaluations")).length, 1); assert.equal(inspected.execution_authorized, false); assert.equal(inspected.release_authorized, false);
    passed++; console.log(`PASS ${purpose}: original signatures cannot verify substituted invocation scope or a malformed nested preview; historical inspection holds without rewriting original proof`);
  } finally { if (service) await service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); }
}
async function main() { await check("analysis"); await check("semantic"); console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, release_authorized: false }, null, 2)); }
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
