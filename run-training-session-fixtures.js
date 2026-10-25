#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const artifacts = require("./repository-artifact-store"), originalWrite = artifacts.writeRepositoryArtifact;
let inject = null; artifacts.writeRepositoryArtifact = options => inject ? inject(options, originalWrite) : originalWrite(options);
const s = require("./training-session-fixtures/support"), { executeTrainingSession } = require("./operator-training-session-executor");
let passed = 0;
async function test(name, run) {
  let env;
  try { env = await s.environment(); await run(env); passed++; console.log(`PASS ${name}`); }
  finally { inject = null; if (env) await s.close(env); }
}
async function main() {
  await test("real authenticated ceremony precedes an actual admitted read and appraises its original signed review", async env => {
    const p = await s.preview(env), input = s.input(p);
    assert.equal(p.review.standard.id, env.standard.id); assert.equal(p.review.performer.id, env.performer.id);
    await env.owner.post("/api/training-sessions/commit", { ...input, nonce: "x".repeat(43) }, 409);
    await env.owner.post("/api/training-sessions/commit", { ...input, displayed_review_sha256: "0".repeat(64) }, 409);
    const missing = { ...input }; delete missing.acknowledge_session_only; await env.owner.post("/api/training-sessions/commit", missing, 400);
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
  await test("wrong password, another session and a viewer cannot register a session; a completed earlier call cannot be labeled post-hoc", async env => {
    const p = await s.preview(env), input = s.input(p);
    await env.owner.post("/api/training-sessions/commit", { ...input, password: "incorrect-synthetic-password" }, 403);
    const other = s.f.client(env.service); await other.session(); await other.post("/api/login", { username: "owner", password: s.f.password }); await other.session();
    await other.post("/api/training-sessions/commit", input, 409);
    const invite = await env.owner.post("/api/invites", { password: s.f.password, missions: [env.plan.mission_id] });
    const viewer = s.f.client(env.service); await viewer.session(); await viewer.post("/api/register", { username: "viewer", password: s.f.password, token: invite.token }); await viewer.session();
    await viewer.get("/api/training-sessions", 403); await viewer.post("/api/training-sessions/commit", input, 403);
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
    const p = await s.preview(env), principal = env.owner.storedSession().userId;
    await env.service.consent.trainingSessions.reserve(env.owner.storedSession(), s.input(p));
    inject = (options, write) => { const value = write(options); if (options.kind === s.c.KINDS.authorizations) env.service.auth.logout(principal); return value; };
    assert.throws(() => executeTrainingSession(s.configuration(env), p.challenge_id), /CONSOLE_TRAINING_SESSION_BLOCKED/); inject = null;
    assert.equal(s.count(env, s.c.KINDS.authorizations), 1); assert.equal(s.count(env, s.c.KINDS.bindings), 0);
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_training_sessions WHERE id=?").get(p.challenge_id).state, "reconciliation_required");
  });
  console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, owner_session_producer_implemented: true,
    qualification_supported: false, operational_grant_consumer_implemented: false, all_eight_goals_complete: false }, null, 2));
}
main().catch(error => { console.error(error.stack); console.error(JSON.stringify({ passed, failed: 1, unexecuted_suffix_not_passed: true })); process.exitCode = 1; });
