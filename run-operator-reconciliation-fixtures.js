#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const shared = require("./operator-reconciliation-fixtures/support");
let fault;
const originalWrite = shared.installFaults(() => fault);
const { prepareReconciliation, executeReconciliation } = require("./operator-reconciliation-executor");
const { verifyAuthorization, verifyReconciliationRecord } = require("./operator-reconciliation-contract");
const { signOperatorRecord } = require("./operator-consent-contract");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { createConsole } = require("./operator-console-server");
const { DatabaseSync } = require("node:sqlite");
const { openWave, recordWave } = require("./skill-mission-controller");
const { decideOrder } = require("./order-adoption-controller");
const { environment, preview, commitInput, store, count, password, client } = require("./operator-consent-fixtures/support");
const results = [];
const { action, terminalPreview, terminalInput } = shared;
const holdOriginal = (env, stage = "after-decision") => shared.holdOriginal(env, stage, value => { fault = value; });
async function check(name, fn, options = {}) {
  let env; const NativeDate = global.Date;
  if (options.pastMilliseconds) global.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [NativeDate.now() - options.pastMilliseconds])); }
    static now() { return NativeDate.now() - options.pastMilliseconds; }
  };
  try { env = options.noEnvironment ? null : await environment(); if (env) env.restoreClock = () => { global.Date = NativeDate; };
    await fn(env); results.push({ name, ok: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.log(`FAIL ${name}: ${error.message}`); }
  finally { global.Date = NativeDate; fault = null; if (env) { await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); } }
}
async function main() {
  await check("pinned signatures, canonical encoding and non-authorizing nested contracts are enforced", () => {
    const a = require("./sample-payloads/valid-operator-reconciliation-authorization.json");
    const r = require("./sample-payloads/valid-operator-reconciliation-record.json"), key = require("./operator-reconciliation-fixtures/public-key.json").public_key_pem;
    verifyAuthorization(a, key); verifyReconciliationRecord(r, key);
    assert.equal(validatePayload(a, "operator-reconciliation-authorization").can_execute, false);
    assert.equal(validatePayload(r, "operator-reconciliation-record").can_execute, false);
    const pair = crypto.generateKeyPairSync("ed25519"), stranger = pair.publicKey.export({ format: "pem", type: "spki" });
    assert.throws(() => verifyAuthorization(a, stranger), /SIGNATURE_INVALID/);
    const forged = signOperatorRecord(r, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    assert.throws(() => verifyReconciliationRecord(forged, key), /RECORD_INVALID/);
    forged.signature.key_sha256 = r.signature.key_sha256;
    assert.equal(validatePayload(forged, "operator-reconciliation-record").valid, true);
    assert.throws(() => verifyReconciliationRecord(forged, key), /SIGNATURE_INVALID/);
    const alternate = structuredClone(a), alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    alternate.signature.value = a.signature.value.slice(0, 85) + alphabet[(alphabet.indexOf(a.signature.value[85]) + 1) % 64] + "==";
    assert.deepEqual(Buffer.from(alternate.signature.value, "base64"), Buffer.from(a.signature.value, "base64"));
    assert.throws(() => verifyAuthorization(alternate, key), /SIGNATURE_INVALID/);
    const changed = structuredClone(r); changed.authorization.release_authorized = true;
    assert.equal(validatePayload(changed, "operator-reconciliation-record").valid, false);
    const missing = structuredClone(r); missing.authorization.cancellation_decision = null;
    assert(validatePayload(missing, "operator-reconciliation-record").issues.some(issue => issue.code === "OPERATOR_RECONCILIATION_CANCELLATION_INVALID"));
  }, { noEnvironment: true });
  for (const stage of ["before-consent", "after-consent", "after-decision", "after-adoption"]) {
    await check(`fresh terminal consent handles ${stage} without rerunning original adoption`, async env => {
      const p = await holdOriginal(env, stage), original = action(env, p.challenge_id), t = await terminalPreview(env, p.challenge_id);
      assert.equal(t.review.resolution, stage === "after-adoption" ? "acknowledge_recorded" : "cancel_unconsumed");
      const input = terminalInput(t), result = await env.owner.post("/api/reconciliations/commit", input);
      assert.equal(result.terminal_state, stage === "after-adoption" ? "applied" : "cancelled");
      assert.equal(result.execution_authorized, false); assert.equal(result.continuation_authorized, false); assert.equal(result.release_authorized, false);
      assert.equal(action(env, p.challenge_id).state, result.terminal_state);
      const audit = env.service.auth.db.prepare("SELECT * FROM operator_reconciliations WHERE id=?").get(t.reconciliation_id);
      assert.equal(audit.original_row, JSON.stringify(original)); assert.equal(audit.state, "applied");
      assert.equal(count(env, "order-adoption-records"), stage === "after-adoption" ? 1 : 0);
      assert.equal(count(env, "operator-reconciliation-records"), 1);
      const record = JSON.parse(fs.readFileSync(path.join(env.options.artifactRoot, result.reconciliation_ref.relative_path)));
      verifyReconciliationRecord(record, (await env.owner.get("/api/operator-key")).public_key_pem);
      const inspected = await env.owner.post(`/api/order-decisions/${p.challenge_id}/inspect`, {});
      assert.equal(inspected.outcome, result.terminal_state, JSON.stringify(inspected));
      assert.deepEqual(inspected.reconciliation_ref, result.reconciliation_ref); assert.equal(inspected.hold_preserved, false);
      assert(!JSON.stringify(record).includes(password)); assert(!JSON.stringify(record).includes(t.nonce));
      await env.owner.post("/api/reconciliations/commit", input, 409);
      if (stage === "after-decision") {
        const entry = store(env).manifest.artifacts.find(item => item.artifact_id === `DL-OPERATOR-${p.challenge_id}`);
        const reference = { artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 };
        assert.throws(() => decideOrder({ ...JSON.parse(original.preview).request, decision_ref: reference }, env.options), /CONFLICTING_USER_DECISION/);
        const list = await env.owner.get("/api/evidence?kind=order-adoption-proposals");
        const fresh = await preview(env, { manifest: list.manifest_sha256 });
        assert.equal((await env.owner.post("/api/order-decisions/commit", commitInput(fresh))).adoption_status, "adopted");
        assert.equal((await env.owner.post(`/api/order-decisions/${p.challenge_id}/inspect`, {})).outcome, "cancelled");
      }
    });
  }
  for (const stage of ["before-cancel", "after-cancel", "before-receipt", "after-receipt"]) {
    await check(`interrupted ${stage} needs fresh consent and never repeats an existing cancellation`, async env => {
      const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id), input = terminalInput(t);
      await env.service.consent.reconciliation.reserve(env.owner.storedSession(), input);
      fault = (options, write) => {
        if ((stage === "before-cancel" && options.kind === "decision-logs") ||
            (stage === "before-receipt" && options.kind === "operator-reconciliation-records")) throw new Error("CONSOLE_FIXTURE_TERMINAL_INTERRUPTED");
        const result = write(options);
        if ((stage === "after-cancel" && options.kind === "decision-logs") ||
            (stage === "after-receipt" && options.kind === "operator-reconciliation-records")) throw new Error("CONSOLE_FIXTURE_TERMINAL_INTERRUPTED");
        return result;
      };
      try { assert.throws(() => executeReconciliation(env.service.configuration, t.reconciliation_id), /TERMINAL_INTERRUPTED/); }
      finally { fault = null; }
      assert.equal(action(env, p.challenge_id).state, "reconciliation_required");
      assert.throws(() => executeReconciliation(env.service.configuration, t.reconciliation_id), /NOT_RESERVED/);
      const fresh = await terminalPreview(env, p.challenge_id);
      assert.equal(fresh.review.resolution, stage === "before-cancel" ? "cancel_unconsumed" : "acknowledge_prior_cancellation");
      const result = await env.owner.post("/api/reconciliations/commit", terminalInput(fresh));
      assert.equal(result.terminal_state, "cancelled");
      assert.equal(store(env).manifest.artifacts.filter(item => item.artifact_id.startsWith("DL-OPERATOR-CANCEL-")).length, 1);
      assert.equal(count(env, "operator-reconciliation-records"), stage === "after-receipt" ? 2 : 1);
      assert.equal(count(env, "order-adoption-records"), 0);
      await env.owner.post("/api/reconciliations/commit", input, 409);
      assert.equal((await env.owner.post(`/api/order-decisions/${p.challenge_id}/inspect`, {})).outcome, "cancelled");
    });
  }
  await check("wrong password, nonce and secret rationale cannot publish a terminal record", async env => {
    const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id), input = terminalInput(t);
    await env.owner.post("/api/reconciliations/commit", { ...input, password: "incorrect-password" }, 403);
    await env.owner.post("/api/reconciliations/commit", { ...input, nonce: "x".repeat(43) }, 409);
    for (const secret of [password, t.nonce, env.owner.storedSession().sessionId]) {
      await env.owner.post("/api/reconciliations/commit", { ...input, rationale: `Do not retain ${secret}` }, 400);
    }
    assert.equal(count(env, "operator-reconciliation-records"), 0); assert.equal(action(env, p.challenge_id).state, "reconciliation_required");
  });
  await check("a changed manifest invalidates terminal consent before cancellation publication", async env => {
    const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id);
    originalWrite({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: env.plan.mission_id,
      waveId: env.plan.wave_id, kind: "agent-outputs", artifactId: "OUT-TERMINAL-DRIFT", payload: { changed: true } });
    await env.owner.post("/api/reconciliations/commit", terminalInput(t), 409);
    assert.equal(count(env, "operator-reconciliation-records"), 0);
    assert.equal(store(env).manifest.artifacts.filter(item => item.artifact_id.startsWith("DL-OPERATOR-CANCEL-")).length, 0);
    assert.equal(action(env, p.challenge_id).state, "reconciliation_required");
  });
  await check("expired terminal preview is not renewed by correct credentials", async env => {
    const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id);
    env.service.auth.db.prepare("UPDATE operator_reconciliations SET expires=0 WHERE id=?").run(t.reconciliation_id);
    await env.owner.post("/api/reconciliations/commit", terminalInput(t), 409);
    assert.equal(count(env, "operator-reconciliation-records"), 0); assert.equal(action(env, p.challenge_id).state, "reconciliation_required");
  });
  await check("two simultaneous consumes of one terminal nonce have one durable result", async env => {
    const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id), input = terminalInput(t);
    const responses = await Promise.all([env.owner.request("POST", "/api/reconciliations/commit", input),
      env.owner.request("POST", "/api/reconciliations/commit", input)]);
    assert.equal(responses.filter(r => r.statusCode === 200).length, 1, responses.map(r => r.body).join("\n"));
    assert(responses.every(r => [200, 409, 429, 503].includes(r.statusCode)));
    assert.equal(count(env, "operator-reconciliation-records"), 1);
    assert.equal(store(env).manifest.artifacts.filter(item => item.artifact_id.startsWith("DL-OPERATOR-CANCEL-")).length, 1);
  });
  await check("viewer access and caller authority overrides cannot obtain terminal authority", async env => {
    const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id), input = terminalInput(t);
    const invite = await env.owner.post("/api/invites", { password, missions: [env.plan.mission_id] }), viewer = client(env.service);
    await viewer.session(); await viewer.post("/api/register", { username: "viewer", password, token: invite.token }); await viewer.session();
    await viewer.post(`/api/order-decisions/${p.challenge_id}/reconciliation/preview`, { manifest: t.review.subject.observed_manifest.sha256 }, 403);
    await viewer.post("/api/reconciliations/commit", input, 403); await viewer.get(`/api/order-decisions/${p.challenge_id}/reconciliations`, 403);
    for (const [name, value] of [["actor", "USER"], ["resolution", "acknowledge_recorded"], ["authorization", {}]]) {
      await env.owner.post(`/api/order-decisions/${p.challenge_id}/reconciliation/preview`, { manifest: t.review.subject.observed_manifest.sha256, [name]: value }, 400);
    }
    await env.owner.post("/api/reconciliations/commit", { ...input, execution_authorized: true }, 400);
    assert.equal(count(env, "operator-reconciliation-records"), 0); assert.equal(action(env, p.challenge_id).state, "reconciliation_required");
  });
  await check("another owner browser session cannot consume a copied terminal nonce", async env => {
    const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id), other = client(env.service);
    await other.session(); await other.post("/api/login", { username: "owner", password }); await other.session();
    await other.post("/api/reconciliations/commit", terminalInput(t), 409);
    assert.equal(count(env, "operator-reconciliation-records"), 0);
  });
  await check("changed running source cannot prepare terminal authority", async env => {
    const p = await holdOriginal(env), configuration = { ...env.service.configuration, sourceSha256: "0".repeat(64) };
    assert.throws(() => prepareReconciliation(configuration, p.challenge_id, "0".repeat(64)), /SOURCE_CHANGED/);
    assert.equal(action(env, p.challenge_id).state, "reconciliation_required");
    assert.equal(count(env, "operator-reconciliation-records"), 0);
  });
  for (const mutation of ["repository", "key"]) {
    await check(`reserved terminal consent cannot survive ${mutation} drift`, async env => {
      const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id);
      await env.service.consent.reconciliation.reserve(env.owner.storedSession(), terminalInput(t));
      if (mutation === "repository") fs.appendFileSync(path.join(env.options.repository, "README.md"), "unreviewed change\n");
      else env.service.auth.db.prepare("UPDATE meta SET value=? WHERE key='operator-signing-key'")
        .run(crypto.generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }));
      assert.throws(() => executeReconciliation(env.service.configuration, t.reconciliation_id),
        mutation === "repository" ? /SUBJECT_CHANGED/ : /SIGNATURE_INVALID/);
      assert.equal(action(env, p.challenge_id).state, "reconciliation_required");
      assert.equal(count(env, "operator-reconciliation-records"), 0);
      assert.equal(store(env).manifest.artifacts.filter(item => item.artifact_id.startsWith("DL-OPERATOR-CANCEL-")).length, 0);
    });
  }
  await check("owner epoch revocation after cancellation prevents receipt and projection", async env => {
    const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id);
    await env.service.consent.reconciliation.reserve(env.owner.storedSession(), terminalInput(t));
    fault = (options, write) => { const result = write(options);
      if (options.kind === "decision-logs") env.service.auth.db.prepare("UPDATE users SET epoch=epoch+1 WHERE role='owner'").run();
      return result;
    };
    try { assert.throws(() => executeReconciliation(env.service.configuration, t.reconciliation_id), /AUTHORIZATION_EXPIRED/); }
    finally { fault = null; }
    assert.equal(action(env, p.challenge_id).state, "reconciliation_required"); assert.equal(count(env, "operator-reconciliation-records"), 0);
    assert.equal(store(env).manifest.artifacts.filter(item => item.artifact_id.startsWith("DL-OPERATOR-CANCEL-")).length, 1);
  });
  await check("tampered terminal projection or archived failure cannot display a cleared hold", async env => {
    const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id);
    await env.owner.post("/api/reconciliations/commit", terminalInput(t));
    const original = action(env, p.challenge_id), changed = JSON.parse(original.result);
    changed.cancellation_ref.sha256 = "0".repeat(64);
    env.service.auth.db.prepare("UPDATE operator_actions SET result=? WHERE id=?").run(JSON.stringify(changed), p.challenge_id);
    const inspect = async () => {
      const result = await env.owner.post(`/api/order-decisions/${p.challenge_id}/inspect`, {});
      assert.equal(result.outcome, "unverifiable"); assert.equal(result.hold_preserved, true);
      assert(result.reasons.includes("CONSOLE_RECONCILIATION_PROJECTION_INVALID"));
    };
    await inspect();
    env.service.auth.db.prepare("UPDATE operator_actions SET result=? WHERE id=?").run(original.result, p.challenge_id);
    const audit = env.service.auth.db.prepare("SELECT original_row FROM operator_reconciliations WHERE id=?").get(t.reconciliation_id);
    const archived = JSON.parse(audit.original_row); archived.result = JSON.stringify({ error: "CONSOLE_REPLACED_FAILURE" });
    env.service.auth.db.prepare("UPDATE operator_reconciliations SET original_row=? WHERE id=?").run(JSON.stringify(archived), t.reconciliation_id);
    await inspect(); assert.equal(count(env, "operator-reconciliation-records"), 1);
  });
  await check("a new competing USER scope decision blocks terminal cancellation", async env => {
    const p = await holdOriginal(env), request = JSON.parse(action(env, p.challenge_id).preview).request;
    const value = { ...require("./sample-payloads/valid-decision-log.json"), id: "DL-COMPETING-TERMINAL", mission_id: env.plan.mission_id,
      decided_at: new Date().toISOString(), decision_maker: "USER", decision_type: "scope", status: "complete",
      authority_basis: { basis_type: "retained_authority", reference: request.proposal_ref.artifact_id, summary: "Synthetic competing USER scope." },
      chosen_option: "defer-order-for-new-review", options_considered: ["defer-order-for-new-review"], affected_artifacts: [request.proposal_ref.relative_path] };
    originalWrite({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: env.plan.mission_id,
      waveId: env.plan.wave_id, kind: "decision-logs", artifactId: value.id, payload: value });
    const inspected = await env.owner.post(`/api/order-decisions/${p.challenge_id}/inspect`, {});
    const denial = await env.owner.post(`/api/order-decisions/${p.challenge_id}/reconciliation/preview`, { manifest: inspected.observed_manifest.sha256 }, 409);
    assert(denial.reason_codes.includes("CONSOLE_RECONCILIATION_NEW_SCOPE_DECISION")); assert.equal(count(env, "operator-reconciliation-records"), 0);
  });
  await check("logout after cancellation preserves the hold until a new authenticated session", async env => {
    const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id);
    await env.service.consent.reconciliation.reserve(env.owner.storedSession(), terminalInput(t));
    fault = (options, write) => { const result = write(options); if (options.kind === "decision-logs") env.service.auth.db.prepare("DELETE FROM sessions").run(); return result; };
    try { assert.throws(() => executeReconciliation(env.service.configuration, t.reconciliation_id), /AUTHORIZATION_EXPIRED/); } finally { fault = null; }
    assert.equal(action(env, p.challenge_id).state, "reconciliation_required"); assert.equal(count(env, "operator-reconciliation-records"), 0);
    await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password }); await env.owner.session();
    const fresh = await terminalPreview(env, p.challenge_id); assert.equal(fresh.review.resolution, "acknowledge_prior_cancellation");
    assert.equal((await env.owner.post("/api/reconciliations/commit", terminalInput(fresh))).terminal_state, "cancelled");
  });
  await check("receipt durability does not bypass rollback of a failed private projection", async env => {
    const p = await holdOriginal(env), t = await terminalPreview(env, p.challenge_id);
    await env.service.consent.reconciliation.reserve(env.owner.storedSession(), terminalInput(t));
    const native = DatabaseSync.prototype.exec; let armed = false;
    DatabaseSync.prototype.exec = function(sql) { if (armed && sql === "COMMIT") { armed = false; throw new Error("CONSOLE_FIXTURE_PRIVATE_COMMIT_FAILED"); }
      return native.call(this, sql); };
    fault = (options, write) => { const result = write(options); if (options.kind === "operator-reconciliation-records") armed = true; return result; };
    try { assert.throws(() => executeReconciliation(env.service.configuration, t.reconciliation_id), /PRIVATE_COMMIT_FAILED/); }
    finally { DatabaseSync.prototype.exec = native; fault = null; }
    assert.equal(action(env, p.challenge_id).state, "reconciliation_required"); assert.equal(count(env, "operator-reconciliation-records"), 1);
    const fresh = await terminalPreview(env, p.challenge_id); assert.equal(fresh.review.resolution, "acknowledge_prior_cancellation");
    await env.owner.post("/api/reconciliations/commit", terminalInput(fresh)); assert.equal(count(env, "operator-reconciliation-records"), 2);
  });
  await check("restart does not resume a reserved terminal ceremony or retain an unconsumed preview", async env => {
    const p = await holdOriginal(env), reserved = await terminalPreview(env, p.challenge_id), pending = await terminalPreview(env, p.challenge_id);
    await env.service.consent.reconciliation.reserve(env.owner.storedSession(), terminalInput(reserved));
    await env.service.app.close(); env.service = await createConsole({ repository: env.options.repository, artifactRoot: env.options.artifactRoot, stateDir: env.stateDir, port: 4317 });
    await env.service.app.ready(); env.owner = client(env.service); await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password }); await env.owner.session();
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_reconciliations WHERE id=?").get(reserved.reconciliation_id).state, "reconciliation_required");
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_reconciliations WHERE id=?").get(pending.reconciliation_id).state, "invalidated");
    assert.equal(count(env, "operator-reconciliation-records"), 0); assert.equal(action(env, p.challenge_id).state, "reconciliation_required");
    const fresh = await terminalPreview(env, p.challenge_id); await env.owner.post("/api/reconciliations/commit", terminalInput(fresh));
    assert.equal(action(env, p.challenge_id).state, "cancelled");
  });
  for (const stage of ["after-decision", "after-adoption"]) {
    await check(`expired original consent remains expired after ${stage} terminal review`, async env => {
      const p = await holdOriginal(env, stage), original = action(env, p.challenge_id); env.restoreClock();
      assert(original.expires < Date.now());
      assert.equal((await env.owner.post(`/api/order-decisions/${p.challenge_id}/inspect`, {})).original_consent_freshness, "expired");
      const fresh = await terminalPreview(env, p.challenge_id), result = await env.owner.post("/api/reconciliations/commit", terminalInput(fresh));
      assert.equal(result.terminal_state, stage === "after-adoption" ? "applied" : "cancelled");
      assert.equal(result.original_consent_expires_at, new Date(original.expires).toISOString());
      assert.equal(action(env, p.challenge_id).expires, original.expires); assert.equal(result.execution_authorized, false);
    }, { pastMilliseconds: 180000 });
  }
  await check("terminal audit metadata remains forbidden as aliased or reformatted agent work", async env => {
    const p = await holdOriginal(env, "after-adoption"), t = await terminalPreview(env, p.challenge_id);
    const result = await env.owner.post("/api/reconciliations/commit", terminalInput(t));
    const record = JSON.parse(fs.readFileSync(path.join(env.options.artifactRoot, result.reconciliation_ref.relative_path))), opened = openWave(env.plan, env.options);
    const sample = require("./order-adoption-fixtures/support").sample("mission-wave-report");
    for (const [index, payload] of [record, record.authorization, Object.fromEntries(Object.entries(record).reverse())].entries()) {
      const id = `OUT-TERMINAL-METADATA-${index}`, stored = originalWrite({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
        missionId: env.plan.mission_id, waveId: env.plan.wave_id, kind: "agent-outputs", artifactId: id, payload });
      const report = { ...sample, id: `MWR-TERMINAL-METADATA-${index}`, mission_id: env.plan.mission_id, wave_id: env.plan.wave_id,
        plan_ref: opened.plan_ref, routing_preflight_ref: opened.routing_preflight_ref, recorded_at: new Date().toISOString(),
        agent_results: opened.context_packs.map(item => ({ ...sample.agent_results[0], agent_id: item.agent_id,
          context_pack_ref: item.context_pack_ref, evidence_refs: [{ artifact_id: id, relative_path: stored.relative_path, sha256: stored.sha256 }] })) };
      assert.throws(() => recordWave(report, env.options), /control metadata as execution evidence/);
    }
  });
  console.log(JSON.stringify({ total: results.length, passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length, results }, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 1;
}
if (require.main === module) {
  const watchdog = setTimeout(() => { console.error("CONSOLE_RECONCILIATION_FIXTURE_DID_NOT_FINISH"); process.exit(1); }, 600000);
  main().then(() => clearTimeout(watchdog), error => { clearTimeout(watchdog); console.error(error.stack); process.exitCode = 1; });
}
