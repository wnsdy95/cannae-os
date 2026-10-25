#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const artifacts = require("./repository-artifact-store"), originalWrite = artifacts.writeRepositoryArtifact;
let inject = null; artifacts.writeRepositoryArtifact = options => inject ? inject(options, originalWrite) : originalWrite(options);
const s = require("./training-session-fixtures/support"), { executeTrainingSession } = require("./operator-training-session-executor");
let passed = 0;
async function test(name, run) {
  let env; const started = process.hrtime.bigint();
  try { env = await s.environment(); await run(env); passed++; console.log(`PASS ${name}`); }
  catch (error) {
    console.error(JSON.stringify({ synthetic_fixture_failure: name, elapsed_monotonic_seconds: Number(process.hrtime.bigint() - started) / 1e9,
      challenge: env ? s.challengeObservation(env) : { available: false }, credentials_or_auth_rows_exported: false })); throw error;
  }
  finally { inject = null; if (env) await s.close(env); }
}
async function main() {
  await test("real authenticated ceremony precedes an actual admitted read and appraises its original signed review", async env => {
    const p = await s.preview(env), input = s.input(p);
    assert.equal(p.review.standard.id, env.standard.id); assert.equal(p.review.performer.id, env.performer.id);
    const terminal = await env.owner.post("/api/training-sessions/commit", input);
    for (const field of ["execution_authorized", "release_authorized", "qualification_granted", "grant_restoration_authorized"]) assert.equal(terminal[field], false);
    env.bindingRef = terminal.session_binding_ref;
    const store = s.force.load(env.options), binding = require("./task-training-controller").record(store, env.bindingRef, s.c.KINDS.bindings);
    const authorization = s.core.verifyBinding(store, binding, env.publicKey);
    assert.equal(binding.payload.schema_version, "0.2"); assert.equal(authorization.principal_id, env.owner.storedSession().userId);
    assert.equal(authorization.displayed_review_sha256, s.c.checked(authorization, "training-session-authorization").review_sha256);
    assert(!JSON.stringify(authorization).includes(s.f.password)); assert(!JSON.stringify(authorization).includes(p.nonce));
    await env.owner.post("/api/training-sessions/commit", input, 409);
    assert.equal(s.count(env, s.c.KINDS.bindings), 1);
    s.observe(env);
    const appraisal = require("./task-training-controller").appraiseTrial(env.options, env.request, env.publicKey);
    assert.equal(appraisal.owner_session_ceremony_verified, true); assert.equal(appraisal.execution_succeeded, true);
    assert.equal(appraisal.qualification_granted, false); assert.equal(appraisal.actual_model_execution_attested, false);
    assert.equal((await env.owner.get(`/api/training-sessions/actions/${p.challenge_id}`)).state, "applied");
  });
  await test("wrong nonce, display, acknowledgment, password, session and viewer cannot register; earlier calls cannot be labeled post-hoc", async env => {
    let p = await s.preview(env), input = s.input(p);
    assert.equal((await env.owner.post("/api/training-sessions/commit", { ...input, nonce: "x".repeat(43) }, 409)).error, "CONSOLE_TRAINING_CHALLENGE_DENIED");
    p = await s.preview(env); input = s.input(p);
    assert.equal((await env.owner.post("/api/training-sessions/commit", { ...input, displayed_review_sha256: "0".repeat(64) }, 409)).error, "CONSOLE_TRAINING_DISPLAY_SUBJECT_CHANGED");
    p = await s.preview(env); input = s.input(p);
    const missing = { ...input }; delete missing.acknowledge_session_only;
    assert.equal((await env.owner.post("/api/training-sessions/commit", missing, 400)).error, "CONSOLE_INPUT_INVALID");
    p = await s.preview(env); input = s.input(p);
    assert.equal((await env.owner.post("/api/training-sessions/commit", { ...input, password: "incorrect-synthetic-password" }, 403)).error, "CONSOLE_REAUTH_DENIED");
    const other = s.f.client(env.service); await other.session(); await other.post("/api/login", { username: "owner", password: s.f.password }); await other.session();
    p = await s.preview(env); input = s.input(p);
    assert.equal((await other.post("/api/training-sessions/commit", input, 409)).error, "CONSOLE_TRAINING_CHALLENGE_DENIED");
    const invite = await env.owner.post("/api/invites", { password: s.f.password, missions: [env.plan.mission_id] });
    const viewer = s.f.client(env.service); await viewer.session(); await viewer.post("/api/register", { username: "viewer", password: s.f.password, token: invite.token }); await viewer.session();
    await viewer.get("/api/training-sessions", 403);
    assert.equal((await viewer.post("/api/training-sessions/commit", input, 403)).error, "CONSOLE_OWNER_REQUIRED");
    assert.equal(s.count(env, s.c.KINDS.authorizations), 0); assert.equal(s.count(env, s.c.KINDS.bindings), 0);
    const list = await env.owner.get(`/api/evidence?kind=${s.c.KINDS.proposals}`); assert.equal((await viewer.get(`/api/evidence?kind=${s.c.KINDS.proposals}`)).entries.length, 0);
    await viewer.get(`/api/evidence/${list.entries[0].id}?manifest=${list.manifest_sha256}`, 404);
    const options = () => ({ ...env.options, now: new Date().toISOString() });
    assert.equal(s.base.dispatch.admitToolRequest(options(), env.actor, s.base.hook(env, s.base.inputs.planned, "prior-training-call")).decision, "allow");
    const content = fs.readFileSync(path.join(env.options.repository, "README.md"), "utf8");
    s.base.dispatch.completeToolRequest(options(), env.actor, { hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "prior-training-call", tool_input: s.base.inputs.planned, tool_response: { content } });
    const denied = await s.preview(env, 409); assert(denied.reason_codes.includes("TRAINING_SESSION_ADMISSION_ALREADY_EXISTS"), JSON.stringify(denied));
    assert.equal(s.count(env, s.c.KINDS.authorizations), 0);
  });
  await test("partial authorization publication stays held across restart and cannot be resubmitted through a new review", async env => {
    const p = await s.preview(env); await env.service.consent.trainingSessions.reserve(env.owner.storedSession(), s.input(p));
    inject = (options, write) => { if (options.kind === s.c.KINDS.bindings) throw new Error("CONSOLE_TRAINING_SYNTHETIC_WRITE_FAILURE"); return write(options); };
    assert.throws(() => executeTrainingSession(s.configuration(env), p.challenge_id), /CONSOLE_TRAINING_SESSION_BLOCKED/); inject = null;
    assert.equal(s.count(env, s.c.KINDS.authorizations), 1); assert.equal(s.count(env, s.c.KINDS.bindings), 0);
    assert.equal((await env.owner.get("/api/training-sessions")).mutation_held, true);
    const list = await env.owner.get(`/api/evidence?kind=${s.c.KINDS.proposals}`);
    assert.throws(() => s.core.prepareReview(s.configuration(env), { entry_id: list.entries[0].id, manifest: list.manifest_sha256 }), /TRAINING_SESSION_ENROLLMENT_EXISTS_OR_UNCERTAIN/);
    await env.service.app.close(); env.service = await require("./operator-console-server").createConsole({ ...env.options, stateDir: env.stateDir, port: 4317 }); await env.service.app.ready();
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_training_sessions WHERE id=?").get(p.challenge_id).state, "reconciliation_required");
    assert.equal(s.count(env, s.c.KINDS.bindings), 0);
  });
  await test("expired preview and actual interruption never produce a session binding", async env => {
    const expired = await s.preview(env); env.service.auth.db.prepare("UPDATE operator_training_sessions SET expires=? WHERE id=?").run(Date.now() - 1, expired.challenge_id);
    await env.owner.post("/api/training-sessions/commit", s.input(expired), 409);
    const p = await s.preview(env); s.base.dispatch.interruptLease({ ...env.options, now: new Date().toISOString() }, env.leaseId, "Synthetic interruption before owner commit.");
    await env.owner.post("/api/training-sessions/commit", s.input(p), 409);
    assert.equal(s.count(env, s.c.KINDS.authorizations), 0); assert.equal(s.count(env, s.c.KINDS.bindings), 0);
    assert.equal((await env.owner.get(`/api/training-sessions/actions/${p.challenge_id}`)).state, "blocked");
  });
  await test("logout after authorization publication denies the binding and retains the exact uncertainty hold", async env => {
    const p = await s.preview(env), session = env.owner.storedSession();
    await env.service.consent.trainingSessions.reserve(session, s.input(p));
    const { Worker } = require("node:worker_threads"), { once } = require("node:events"), buffer = new SharedArrayBuffer(4), gate = new Int32Array(buffer);
    const worker = new Worker(path.join(__dirname, "training-session-fixtures/logout-worker.js"), { workerData: { configuration: s.configuration(env), id: p.challenge_id, gate: buffer } });
    const exited = once(worker, "exit");
    try {
      const [paused] = await once(worker, "message"); assert.equal(paused.phase, "authorization_written");
      const terminal = once(worker, "message");
      await env.owner.post("/api/logout", {});
      const stored = await new Promise((resolve, reject) => env.service.auth.sessionStore.get(session.sessionId, (error, value) => error ? reject(error) : resolve(value)));
      assert.equal(stored, null);
      Atomics.store(gate, 0, 1); Atomics.notify(gate, 0);
      const [result] = await terminal; assert.equal(result.phase, "terminal"); assert.equal(result.returned, false);
      assert.equal(result.error, "CONSOLE_TRAINING_SESSION_BLOCKED"); assert(result.reason_codes.includes("CONSOLE_TRAINING_AUTHORIZATION_EXPIRED"));
      await exited;
    } finally { Atomics.store(gate, 0, 1); Atomics.notify(gate, 0); await worker.terminate(); }
    assert.equal(s.count(env, s.c.KINDS.authorizations), 1); assert.equal(s.count(env, s.c.KINDS.bindings), 0);
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_training_sessions WHERE id=?").get(p.challenge_id).state, "reconciliation_required");
  });
  console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, owner_session_producer_implemented: true,
    qualification_supported: false, operational_grant_consumer_implemented: false, all_eight_goals_complete: false }, null, 2));
}
main().catch(error => { console.error(error.stack); console.error(JSON.stringify({ passed, failed: 1, unexecuted_suffix_not_passed: true })); process.exitCode = 1; });
