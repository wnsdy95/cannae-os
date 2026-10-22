#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { environment, client, password, preview, commitInput, terminal, started } = require("./operator-semantic-fixtures/support");
const { validOperatorSignature } = require("./operator-consent-contract");
const { writeRepositoryArtifact } = require("./repository-artifact-store");
const results = [];
async function check(name, fn, options) {
  let env;
  try { env = await environment(options); await fn(env); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
  finally { if (env) { await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); } }
}
async function main() {
  await check("preview sends nothing and real owner consent reaches the measured collector", async env => {
    const p = await preview(env);
    assert.equal(p.invocation.profile.requested_model, "fixture-valid"); assert(p.invocation.preview.prompt.includes("Do not publish"));
    assert.deepEqual(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")), []);
    const committed = await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202);
    assert.equal(committed.execution_authorized, false); const current = await terminal(env, p.challenge_id);
    assert.equal(current.state, "evaluated", JSON.stringify(current)); assert.equal(current.verdict, "incomplete");
    assert.equal(current.result_verified, true); assert.equal(current.result.collection.process_exit_confirmed, true);
    assert.equal(current.result.collection.process_group_absent, true);
    const key = (await env.owner.get("/api/operator-key")).public_key_pem;
    assert(validOperatorSignature(current.consent, key)); assert(validOperatorSignature(current.result, key));
    assert.equal(current.consent.principal_id, (await env.owner.session()).user.id);
    assert.equal(current.consent.purpose, "one_semantic_evaluation_transfer"); assert(current.result.response.requirements.length);
    const row = env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(p.challenge_id);
    const text = JSON.stringify(row); assert(!text.includes(password)); assert(!text.includes(p.nonce)); assert(!text.includes(env.owner.storedSession().sessionId));
    assert.equal(current.rationale, commitInput(p).rationale);
    await env.owner.post("/api/model-evaluations/commit", commitInput(p), 409);
    assert.equal(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")).length, 1);
  });
  await check("host configuration is mandatory and no caller can choose executable, model or authority", async env => {
    assert.equal((await env.owner.session()).semantic_review_available, false);
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
    assert.deepEqual((await env.owner.get("/api/model-evaluations")).entries, []);
  }, { configured: false });
  await check("untrusted HTTP fields cannot widen packet, profile or actor", async env => {
    for (const [key, value] of [["model", "other"], ["executable", "/bin/sh"], ["actor", "USER"], ["release_authorized", true], ["prompt", "substituted"]]) {
      await env.owner.post("/api/model-evaluations/preview", { ...env.previewInput, [key]: value }, 400);
    }
    const p = await preview(env);
    await env.owner.post("/api/model-evaluations/commit", { ...commitInput(p), invocation_sha256: "0".repeat(64) }, 400);
    assert.deepEqual(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")), []);
  });
  await check("wrong password, nonce, secret rationale and expired challenge never launch", async env => {
    const p = await preview(env), input = commitInput(p);
    await env.owner.post("/api/model-evaluations/commit", { ...input, password: "wrong-password" }, 403);
    await env.owner.post("/api/model-evaluations/commit", { ...input, nonce: "x".repeat(43) }, 409);
    await env.owner.post("/api/model-evaluations/commit", { ...input, rationale: password }, 400);
    await env.owner.post("/api/model-evaluations/commit", { ...input, rationale: p.nonce }, 400);
    env.service.auth.db.prepare("UPDATE operator_model_actions SET expires=0 WHERE id=?").run(p.challenge_id);
    await env.owner.post("/api/model-evaluations/commit", input, 409);
    assert.deepEqual(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")), []);
  });
  await check("a different owner browser cannot consume a leaked challenge", async env => {
    const p = await preview(env), other = client(env.service); await other.session();
    await other.post("/api/login", { username: "owner", password }); await other.session();
    await other.post("/api/model-evaluations/commit", commitInput(p), 409);
    assert.deepEqual(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")), []);
  });
  await check("mission viewers cannot preview, inspect, commit or stop owner model actions", async env => {
    const invitation = await env.owner.post("/api/invites", { password, missions: [env.options.mission] });
    const viewer = client(env.service); await viewer.session();
    await viewer.post("/api/register", { username: "viewer", password, token: invitation.token }); await viewer.session();
    const p = await preview(env);
    await viewer.get("/api/model-evaluations", 403); await viewer.get(`/api/model-evaluations/${p.challenge_id}`, 403);
    await viewer.post("/api/model-evaluations/preview", env.previewInput, 403);
    await viewer.post("/api/model-evaluations/commit", commitInput(p), 403);
    await viewer.post(`/api/model-evaluations/${p.challenge_id}/cancel`, {}, 403);
    assert.deepEqual(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")), []);
  });
  await check("manifest changes after preview cannot silently refresh the authorized subject", async env => {
    const p = await preview(env);
    writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: env.options.mission,
      waveId: env.options.wave, kind: "agent-outputs", artifactId: "OUT-CHANGED", payload: { changed: true } });
    await env.owner.post("/api/model-evaluations/commit", commitInput(p), 409);
    assert.deepEqual(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")), []);
  });
  await check("repository changes after preview cannot reuse consent", async env => {
    const p = await preview(env); fs.appendFileSync(path.join(env.options.repository, "README.md"), "changed\n");
    await env.owner.post("/api/model-evaluations/commit", commitInput(p), 409);
    assert.deepEqual(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")), []);
  });
  await check("duplicate concurrent commits launch at most one actual process", async env => {
    const p = await preview(env), input = commitInput(p);
    const responses = await Promise.all([env.owner.request("POST", "/api/model-evaluations/commit", input), env.owner.request("POST", "/api/model-evaluations/commit", input)]);
    assert.equal(responses.filter(row => row.statusCode === 202).length, 1, responses.map(row => row.body).join("\n"));
    assert(responses.every(row => [202, 409, 429].includes(row.statusCode))); await terminal(env, p.challenge_id);
    assert.equal(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")).length, 1);
  });
  await check("a running evaluation does not block authenticated reads and owner stop observes exit", async env => {
    const p = await preview(env); await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202); await started(env, p.challenge_id);
    assert.equal((await env.owner.get(`/api/model-evaluations/${p.challenge_id}`)).state, "running");
    await env.owner.get("/api/evidence"); await env.owner.get("/api/activity");
    await env.owner.post(`/api/model-evaluations/${p.challenge_id}/cancel`, {});
    const result = await terminal(env, p.challenge_id); assert.equal(result.state, "held");
    assert.equal(result.result.collection.process_exit_confirmed, true); assert.equal(result.result.collection.process_group_absent, true);
    assert(result.result.collection.failure_reasons.includes("CONSOLE_MODEL_OWNER_STOP"));
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
  }, { model: "fixture-timeout" });
  await check("logout revokes the actual stored session and stops its active collector", async env => {
    const p = await preview(env); await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202); await started(env, p.challenge_id);
    await env.owner.post("/api/logout", {});
    for (let count = 0; count < 200; count++) {
      if (env.service.auth.db.prepare("SELECT state FROM operator_model_actions WHERE id=?").get(p.challenge_id).state !== "running") break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    env.owner = client(env.service); await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password }); await env.owner.session();
    const result = await env.owner.get(`/api/model-evaluations/${p.challenge_id}`);
    assert.equal(result.state, "held"); assert.equal(result.result.collection.process_group_absent, true);
    assert(result.result.collection.failure_reasons.includes("CONSOLE_MODEL_SESSION_ENDED"));
  }, { model: "fixture-timeout" });
  await check("graceful shutdown waits for actual child exit and restart preserves the model hold", async env => {
    const p = await preview(env); await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202); await started(env, p.challenge_id);
    await env.service.app.close();
    const { createConsole } = require("./operator-console-server"); env.service = await createConsole(env.configuration); await env.service.app.ready();
    env.owner = client(env.service); await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password }); await env.owner.session();
    const result = await env.owner.get(`/api/model-evaluations/${p.challenge_id}`); assert.equal(result.state, "held");
    assert.equal(result.result.collection.process_group_absent, true); assert.equal(result.result.collection.process_exit_confirmed, true);
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
    assert.equal(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")).length, 1);
  }, { model: "fixture-timeout" });
  await check("a failed provider response is held and never becomes an approval or retry", async env => {
    const p = await preview(env); await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202);
    const result = await terminal(env, p.challenge_id); assert.equal(result.state, "held"); assert.equal(result.result_verified, true);
    assert.equal(result.result.response, null); assert.equal(result.execution_authorized, false); assert.equal(result.release_authorized, false);
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
  }, { model: "fixture-invalid" });
  await check("edited private result fails pinned signature verification and fences another transfer", async env => {
    const p = await preview(env); await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202); await terminal(env, p.challenge_id);
    const row = env.service.auth.db.prepare("SELECT result FROM operator_model_actions WHERE id=?").get(p.challenge_id), changed = JSON.parse(row.result);
    changed.assessment.verdict = "complete";
    env.service.auth.db.prepare("UPDATE operator_model_actions SET result=? WHERE id=?").run(JSON.stringify(changed), p.challenge_id);
    const current = await env.owner.get(`/api/model-evaluations/${p.challenge_id}`);
    assert.equal(current.state, "unverifiable"); assert.equal(current.result, null); assert.equal(current.hold_preserved, true);
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
  });
  await check("missing signed result is unverifiable, never a clear evaluated row", async env => {
    const p = await preview(env); await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202); await terminal(env, p.challenge_id);
    env.service.auth.db.prepare("UPDATE operator_model_actions SET result=NULL WHERE id=?").run(p.challenge_id);
    const current = await env.owner.get(`/api/model-evaluations/${p.challenge_id}`);
    assert.equal(current.state, "unverifiable"); assert.equal(current.hold_preserved, true);
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
  });
  await check("response substitution between collector validation and service signing is rejected", async env => {
    const p = await preview(env), open = fs.openSync;
    const file = path.join(env.configuration.stateDir, "model-evaluations", p.challenge_id, "response.json"); let reads = 0;
    fs.openSync = function(filename, ...args) {
      if (filename === file && ++reads === 2) fs.writeFileSync(file, JSON.stringify({ substituted: true }));
      return open.call(this, filename, ...args);
    };
    try {
      await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202);
      const current = await terminal(env, p.challenge_id);
      assert.equal(reads, 2); assert.equal(current.state, "held"); assert.equal(current.result.response, null);
      assert.equal(current.result.error, "CONSOLE_MODEL_RESPONSE_CHANGED"); assert.equal(current.result.collection.process_group_absent, true);
    } finally { fs.openSync = open; }
  });
  await check("changed active action cancels its real process rather than publishing under a replacement", async env => {
    const p = await preview(env); await env.owner.post("/api/model-evaluations/commit", commitInput(p), 202); await started(env, p.challenge_id);
    env.service.auth.db.prepare("UPDATE operator_model_actions SET rationale='changed' WHERE id=?").run(p.challenge_id);
    const result = await terminal(env, p.challenge_id);
    assert.equal(result.hold_preserved, true); assert.equal(result.result_verified, false);
    const original = JSON.parse(fs.readFileSync(path.join(env.configuration.stateDir, "model-evaluations", p.challenge_id, "result.json")));
    assert.equal(original.process_exit_confirmed, true); assert.equal(original.process_group_absent, true);
    await env.owner.post("/api/model-evaluations/preview", env.previewInput, 409);
  }, { model: "fixture-timeout" });
  await check("model approval and stop endpoints retain CSRF and origin defenses", async env => {
    const p = await preview(env), cookie = [...env.owner.jar].map(([key, value]) => require("@fastify/cookie").serialize(key, value)).join("; ");
    for (const origin of ["http://evil.invalid", "http://127.0.0.1:4317"]) {
      const result = await env.service.app.inject({ method: "POST", url: "/api/model-evaluations/commit", payload: commitInput(p),
        headers: { host: "127.0.0.1:4317", origin, cookie } });
      assert.equal(result.statusCode, 403); assert.equal(result.json().release_authorized, false);
    }
    assert.deepEqual(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")), []);
  });
  const failed = results.filter(row => !row.passed);
  console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length,
    failures: failed, actual_model_invocations: 0, provider: "measured_fake_process", semantic_admission_complete: false }, null, 2));
  if (failed.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
