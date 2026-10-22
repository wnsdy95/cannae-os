#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const cookie = require("@fastify/cookie");
const artifacts = require("./repository-artifact-store");
const originalWrite = artifacts.writeRepositoryArtifact;
let injectWrite = null;
artifacts.writeRepositoryArtifact = options => {
  if (injectWrite) return injectWrite(options, originalWrite);
  return originalWrite(options);
};
const { createConsole } = require("./operator-console-server");
const { prepareOrderDecision, executeOrderDecision } = require("./operator-consent-executor");
const { digest, verifyConsent } = require("./operator-consent-contract");
const { validatePayload } = require("./validator-cli-prototype/validate");
const support = require("./order-adoption-fixtures/support");
const { orderForPlan } = require("./order-adoption-controller");
const { openWave, recordWave, CONTROL_EVIDENCE_KINDS } = require("./skill-mission-controller");
const password = "synthetic-owner-consent-password-2026";
const results = [];

function client(service) {
  const jar = new Map(); let csrf;
  return {
    jar,
    async request(method, url, payload) {
      const response = await service.app.inject({ method, url, payload,
        headers: { host: "127.0.0.1:4317", cookie: [...jar].map(([key, value]) => cookie.serialize(key, value)).join("; "),
          ...(method === "POST" ? { origin: "http://127.0.0.1:4317", ...(csrf ? { "x-csrf-token": csrf } : {}) } : {}) } });
      for (const item of response.cookies) jar.set(item.name, item.value);
      return response;
    },
    async get(url, expected = 200) { const r = await this.request("GET", url); assert.equal(r.statusCode, expected, r.body); return r.json(); },
    async post(url, body, expected = 200) { const r = await this.request("POST", url, body); assert.equal(r.statusCode, expected, r.body); return r.json(); },
    async session() { const data = await this.get("/api/session"); csrf = data.csrf_token; return data; },
    storedSession() {
      const unsigned = cookie.unsign(jar.get("cannae_operator"), service.auth.secret);
      assert(unsigned.valid); const sid = unsigned.value;
      const row = service.auth.db.prepare("SELECT value FROM sessions WHERE digest=?").get(crypto.createHash("sha256").update(sid).digest("hex"));
      return { ...JSON.parse(row.value), sessionId: sid };
    }
  };
}
async function environment(withRehearsal = true) {
  const env = support.environment(Date.now() - 120000);
  support.propose(env);
  if (withRehearsal) { support.retainBriefs(env); support.rehearse(env); }
  env.stateDir = path.join(fs.realpathSync(env.root), "private");
  env.service = await createConsole({ repository: env.options.repository, artifactRoot: env.options.artifactRoot, stateDir: env.stateDir, port: 4317 });
  await env.service.app.ready();
  env.owner = client(env.service); await env.owner.session();
  await env.owner.post("/api/setup", { username: "owner", password, token: env.service.auth.createBootstrap() }); await env.owner.session();
  env.list = await env.owner.get("/api/evidence?kind=order-adoption-proposals");
  env.entry = env.list.entries[0];
  env.review = await env.owner.get(`/api/evidence/${env.entry.id}?manifest=${env.list.manifest_sha256}&review=true`);
  env.previewInput = { entry_id: env.entry.id, manifest: env.list.manifest_sha256,
    rehearsal_id: env.review.rehearsals[0]?.id || "none", disposition: "approve" };
  return env;
}
const preview = (env, changes = {}) => env.owner.post("/api/order-decisions/preview", { ...env.previewInput, ...changes });
const commitInput = p => ({ challenge_id: p.challenge_id, nonce: p.nonce, password, rationale: "Synthetic fixture decision; no real USER approval." });
function store(env) { return require("./campaign-supervisor").loadVerifiedStore(env.options.repository, env.options.artifactRoot); }
function count(env, kind) { return store(env).manifest.artifacts.filter(item => item.kind === kind).length; }
async function check(name, fn, rehearsal = true) {
  let env;
  try { env = await environment(rehearsal); await fn(env); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); }
  finally { injectWrite = null; if (env) { await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); } }
}
async function main() {
  const sample = require("./sample-payloads/valid-operator-consent-record.json"), publicKey = require("./operator-consent-fixtures/public-key.json").public_key_pem;
  assert.equal(validatePayload(sample, "operator-consent-record").can_execute, false);
  verifyConsent(sample, publicKey, require("./operator-consent-fixtures/decision.json"));
  const wrong = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
  assert.throws(() => verifyConsent(sample, wrong), /SIGNATURE_INVALID/);
  const alternate = structuredClone(sample), alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  alternate.signature.value = sample.signature.value.slice(0, 85) + alphabet[(alphabet.indexOf(sample.signature.value[85]) + 1) % 64] + "==";
  assert.deepEqual(Buffer.from(alternate.signature.value, "base64"), Buffer.from(sample.signature.value, "base64"));
  assert.throws(() => verifyConsent(alternate, publicKey), /SIGNATURE_INVALID/);
  for (const mutate of [r => { r.principal_id = crypto.randomUUID(); }, r => { r.plan_sha256 = "0".repeat(64); }, r => { r.request.disposition = "reject"; }]) {
    const changed = structuredClone(sample); mutate(changed); assert.throws(() => verifyConsent(changed, publicKey), /SIGNATURE_INVALID/);
  }
  assert.throws(() => verifyConsent(sample, publicKey, { ...require("./operator-consent-fixtures/decision.json"), rationale: "substituted" }), /DECISION_SUBSTITUTED/);
  results.push({ name: "separately pinned Ed25519 verification rejects issuer, scope and decision substitution without granting execution", ok: true });
  await check("owner exact one-use consent reaches real adoption and lifecycle consumers", async env => {
    const p = await preview(env), input = commitInput(p);
    const result = await env.owner.post("/api/order-decisions/commit", input);
    assert.equal(result.adoption_status, "adopted"); assert.equal(result.execution_authorized, false); assert.equal(result.release_authorized, false);
    assert.equal(orderForPlan(env.plan, env.options).payload.id, result.adoption_ref.artifact_id);
    const opened = openWave(env.plan, env.options);
    assert.equal(opened.status, "ready"); assert.equal(opened.tool_execution_authorized, false);
    assert(opened.context_packs.length > 0);
    const record = JSON.parse(fs.readFileSync(path.join(env.options.artifactRoot, result.consent_ref.relative_path)));
    const decision = JSON.parse(fs.readFileSync(path.join(env.options.artifactRoot, result.decision_ref.relative_path)));
    verifyConsent(record, (await env.owner.get("/api/operator-key")).public_key_pem, decision);
    assert.equal(record.plan_sha256, digest(env.plan)); assert(CONTROL_EVIDENCE_KINDS.has("operator-consent-records"));
    for (const [artifactId, payload] of [["OUT-CONSENT-COPY", record], ["OUT-CONSENT-REFORMATTED", Object.fromEntries(Object.entries(record).reverse())]]) {
      const stored = originalWrite({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
        missionId: env.plan.mission_id, waveId: env.plan.wave_id, kind: "agent-outputs", artifactId, payload });
      const evidenceRef = { artifact_id: artifactId, relative_path: stored.relative_path, sha256: stored.sha256 };
      const report = { ...support.sample("mission-wave-report"), id: "MWR-CONSENT", mission_id: env.plan.mission_id, wave_id: env.plan.wave_id,
        plan_ref: opened.plan_ref, routing_preflight_ref: opened.routing_preflight_ref, recorded_at: new Date().toISOString(),
        agent_results: opened.context_packs.map(item => ({ ...support.sample("mission-wave-report").agent_results[0],
          agent_id: item.agent_id, context_pack_ref: item.context_pack_ref, evidence_refs: [evidenceRef] })) };
      assert.throws(() => recordWave(report, env.options), /control metadata as execution evidence/);
    }
    const text = JSON.stringify(record); assert(!text.includes(password)); assert(!text.includes(p.nonce));
    await env.owner.post("/api/order-decisions/commit", input, 409);
    assert.equal(count(env, "order-adoption-records"), 1); assert.equal(count(env, "operator-consent-records"), 1);
    assert.equal((await env.owner.get(`/api/order-decisions/${p.challenge_id}`)).state, "applied");
  });
  for (const [disposition, expected] of [["reject", "rejected"], ["revise", "revision_required"]]) {
    await check(`real ${disposition} disposition cannot open execution`, async env => {
      const p = await preview(env, { disposition, rehearsal_id: "none" });
      const result = await env.owner.post("/api/order-decisions/commit", commitInput(p)); assert.equal(result.adoption_status, expected);
      assert.throws(() => orderForPlan(env.plan, env.options), /ORDER_ADOPTION_REQUIRED/);
      await env.owner.post("/api/order-decisions/preview", { ...env.previewInput, manifest: store(env).verification.manifest_sha256 }, 409);
    });
  }
  await check("adoption cannot omit rehearsal or backbriefs", async env => {
    await env.owner.post("/api/order-decisions/preview", env.previewInput, 409); assert.equal(count(env, "decision-logs"), 0);
  }, false);
  await check("HTTP caller cannot inject actor, decision, expiry or authority fields", async env => {
    for (const [key, value] of [["actor", "USER"], ["expires_at", "2099-01-01T00:00:00Z"], ["execution_authorized", true], ["decision_ref", {}]]) {
      await env.owner.post("/api/order-decisions/preview", { ...env.previewInput, [key]: value }, 400);
    }
    const p = await preview(env);
    await env.owner.post("/api/order-decisions/commit", { ...commitInput(p), principal_id: crypto.randomUUID() }, 400);
    assert.equal(count(env, "operator-consent-records"), 0);
  });
  await check("wrong password and wrong nonce publish no consent or decision", async env => {
    const p = await preview(env), input = commitInput(p);
    await env.owner.post("/api/order-decisions/commit", { ...input, password: "incorrect-password" }, 403);
    await env.owner.post("/api/order-decisions/commit", { ...input, nonce: "x".repeat(43) }, 409);
    assert.equal(count(env, "decision-logs"), 0); assert.equal(count(env, "operator-consent-records"), 0);
  });
  await check("rationale cannot retain the password, raw nonce or session ID", async env => {
    const p = await preview(env), input = commitInput(p);
    for (const secret of [password, p.nonce, env.owner.storedSession().sessionId]) {
      await env.owner.post("/api/order-decisions/commit", { ...input, rationale: `Do not retain ${secret}` }, 400);
    }
    assert.equal(count(env, "operator-consent-records"), 0); assert.equal(count(env, "decision-logs"), 0);
    assert.equal((await env.owner.get(`/api/order-decisions/${p.challenge_id}`)).state, "pending");
  });
  await check("same owner in another browser session cannot consume the challenge", async env => {
    const p = await preview(env), other = client(env.service); await other.session();
    await other.post("/api/login", { username: "owner", password }); await other.session();
    await other.post("/api/order-decisions/commit", commitInput(p), 409); assert.equal(count(env, "decision-logs"), 0);
  });
  await check("viewer cannot obtain owner decisions or consume a leaked nonce", async env => {
    const invitation = await env.owner.post("/api/invites", { password, missions: [env.plan.mission_id] });
    const viewer = client(env.service); await viewer.session();
    await viewer.post("/api/register", { username: "viewer", password, token: invitation.token }); await viewer.session();
    const p = await preview(env);
    await viewer.post("/api/order-decisions/preview", env.previewInput, 403);
    await viewer.post("/api/order-decisions/commit", commitInput(p), 403);
    await viewer.get("/api/order-decisions", 403); await viewer.get("/api/operator-key", 403);
  });
  await check("expired nonce is denied with no mutation", async env => {
    const p = await preview(env); env.service.auth.db.prepare("UPDATE operator_actions SET expires=0 WHERE id=?").run(p.challenge_id);
    await env.owner.post("/api/order-decisions/commit", commitInput(p), 409); assert.equal(count(env, "decision-logs"), 0);
  });
  await check("intervening manifest publication invalidates the approved snapshot", async env => {
    const p = await preview(env);
    originalWrite({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: env.plan.mission_id,
      waveId: env.plan.wave_id, kind: "agent-outputs", artifactId: "OUT-INTERVENING", payload: { changed: true } });
    await env.owner.post("/api/order-decisions/commit", commitInput(p), 409);
    assert.equal((await env.owner.get(`/api/order-decisions/${p.challenge_id}`)).state, "blocked"); assert.equal(count(env, "decision-logs"), 0);
  });
  await check("repository and running-source drift cannot be silently refreshed", async env => {
    const p = await preview(env); fs.appendFileSync(path.join(env.options.repository, "README.md"), "changed\n");
    await env.owner.post("/api/order-decisions/commit", commitInput(p), 409); assert.equal(count(env, "decision-logs"), 0);
    env.service.configuration.sourceSha256 = "0".repeat(64);
    await env.owner.post("/api/order-decisions/preview", env.previewInput, 409);
  });
  await check("simultaneous duplicate commit has at most one actual adoption", async env => {
    const p = await preview(env), input = commitInput(p);
    const responses = await Promise.all([env.owner.request("POST", "/api/order-decisions/commit", input), env.owner.request("POST", "/api/order-decisions/commit", input)]);
    assert.equal(responses.filter(r => r.statusCode === 200).length, 1, responses.map(r => r.body).join("\n"));
    assert(responses.every(r => [200, 409, 429].includes(r.statusCode)));
    assert.equal(count(env, "order-adoption-records"), 1); assert.equal(count(env, "operator-consent-records"), 1);
  });
  await check("partial consent publication creates a durable hold, never automatic adoption", async env => {
    const p = await preview(env), session = env.owner.storedSession();
    await env.service.consent.reserve(session, commitInput(p));
    injectWrite = (options, write) => { if (options.kind === "decision-logs") throw new Error("CONSOLE_INJECTED_PUBLICATION_FAILURE"); return write(options); };
    assert.throws(() => executeOrderDecision(env.service.configuration, p.challenge_id), /INJECTED_PUBLICATION_FAILURE/);
    injectWrite = null;
    assert.equal(count(env, "operator-consent-records"), 1); assert.equal(count(env, "order-adoption-records"), 0);
    assert.equal((await env.owner.get(`/api/order-decisions/${p.challenge_id}`)).state, "reconciliation_required");
    const list = await env.owner.get("/api/evidence?kind=order-adoption-proposals");
    await env.owner.post("/api/order-decisions/preview", { ...env.previewInput, manifest: list.manifest_sha256 }, 409);
    await env.service.app.close();
    env.service = await createConsole({ repository: env.options.repository, artifactRoot: env.options.artifactRoot, stateDir: env.stateDir, port: 4317 });
    await env.service.app.ready(); assert.equal(count(env, "order-adoption-records"), 0);
    const row = env.service.auth.db.prepare("SELECT state FROM operator_actions WHERE id=?").get(p.challenge_id);
    assert.equal(row.state, "reconciliation_required");
  });
  await check("logout during publication denies the next write and preserves the partial hold", async env => {
    const p = await preview(env); await env.service.consent.reserve(env.owner.storedSession(), commitInput(p));
    injectWrite = (options, write) => {
      const result = write(options);
      if (options.kind === "operator-consent-records") env.service.auth.db.prepare("DELETE FROM sessions").run();
      return result;
    };
    assert.throws(() => executeOrderDecision(env.service.configuration, p.challenge_id), /AUTHORIZATION_EXPIRED/); injectWrite = null;
    assert.equal(count(env, "decision-logs"), 0); assert.equal(count(env, "order-adoption-records"), 0);
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_actions WHERE id=?").get(p.challenge_id).state, "reconciliation_required");
  });
  await check("restart invalidates pending previews and never resumes reserved decisions", async env => {
    const p = await preview(env); await env.service.consent.reserve(env.owner.storedSession(), commitInput(p));
    await env.service.app.close(); env.service = await createConsole({ repository: env.options.repository,
      artifactRoot: env.options.artifactRoot, stateDir: env.stateDir, port: 4317 }); await env.service.app.ready();
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_actions WHERE id=?").get(p.challenge_id).state, "reconciliation_required");
    assert.equal(count(env, "decision-logs"), 0);
  });
  await check("unconsumed previews are invalidated on restart, not silently renewed", async env => {
    const p = await preview(env); await env.service.app.close();
    env.service = await createConsole({ repository: env.options.repository, artifactRoot: env.options.artifactRoot, stateDir: env.stateDir, port: 4317 });
    await env.service.app.ready(); assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_actions WHERE id=?").get(p.challenge_id).state, "invalidated");
    assert.equal(count(env, "decision-logs"), 0);
  });
  await check("a second live service cannot replace the active decision owner", async env => {
    await assert.rejects(createConsole({ repository: env.options.repository, artifactRoot: env.options.artifactRoot,
      stateDir: env.stateDir, port: 4317 }), /DECISION_SERVICE_ALREADY_LIVE/);
    assert.equal((await preview(env)).review.proposal.id, env.proposed.proposal.id);
  });
  console.log(JSON.stringify({ total: results.length, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
