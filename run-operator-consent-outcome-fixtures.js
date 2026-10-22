#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), crypto = require("node:crypto");
const artifacts = require("./repository-artifact-store"), originalWrite = artifacts.writeRepositoryArtifact;
let fault;
artifacts.writeRepositoryArtifact = options => fault ? fault(options, originalWrite) : originalWrite(options);
const evidence = require("./operator-console-evidence"), originalRead = evidence.readEntry;
let duringRead;
evidence.readEntry = (store, entry) => { const value = originalRead(store, entry); if (duringRead) duringRead(store, entry); return value; };
const { inspectDecisionOutcome } = require("./operator-consent-outcome");
const { executeOrderDecision } = require("./operator-consent-executor");
const { environment, preview, commitInput, store, count, client, password } = require("./operator-consent-fixtures/support");
const results = [];
function row(env, id) { return env.service.auth.db.prepare("SELECT * FROM operator_actions WHERE id=?").get(id); }
async function inspect(env, id) {
  const before = JSON.stringify(row(env, id)), manifest = store(env).verification.manifest_sha256;
  const result = await env.owner.post(`/api/order-decisions/${id}/inspect`, {});
  assert.equal(result.inspection_only, true); assert.equal(result.mutation_authorized, false);
  assert.equal(result.execution_authorized, false); assert.equal(result.release_authorized, false);
  assert(!JSON.stringify(result).includes(password)); assert(!JSON.stringify(result).includes(env.owner.storedSession().sessionId));
  assert.equal(JSON.stringify(row(env, id)), before); assert.equal(store(env).verification.manifest_sha256, manifest);
  return result;
}
async function check(name, fn) {
  let env;
  try { env = await environment(); await fn(env); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); }
  finally { fault = null; duringRead = null; if (env) { await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); } }
}
async function main() {
  await check("unconsumed preview is not mistaken for consent or execution", async env => {
    const p = await preview(env), outcome = await inspect(env, p.challenge_id);
    assert.equal(outcome.outcome, "not_submitted"); assert.equal(outcome.adoption_ref.artifact_id, "none");
    assert(!JSON.stringify(outcome).includes(p.nonce));
    assert.equal(count(env, "decision-logs"), 0);
  });
  for (const disposition of ["approve", "reject", "revise"]) {
    await check(`the actual ${disposition} controller outcome is independently replayed`, async env => {
      const p = await preview(env, { disposition, ...(disposition === "approve" ? {} : { rehearsal_id: "none" }) });
      const applied = await env.owner.post("/api/order-decisions/commit", commitInput(p));
      const outcome = await inspect(env, p.challenge_id);
      assert.equal(outcome.outcome, "applied"); assert.equal(outcome.adoption_status, applied.adoption_status);
      assert.deepEqual(outcome.adoption_ref, applied.adoption_ref); assert.equal(outcome.hold_preserved, false);
    });
  }
  await check("a reserved action with no confirmed execution remains unconfirmed", async env => {
    const p = await preview(env); await env.service.consent.reserve(env.owner.storedSession(), commitInput(p));
    const outcome = await inspect(env, p.challenge_id); assert.equal(outcome.outcome, "execution_unconfirmed"); assert.equal(outcome.hold_preserved, true);
  });
  for (const [stage, expected] of [["operator-consent-records", "no_adoption_recorded"], ["decision-logs", "partial_consent"],
    ["order-adoption-records", "unconsumed_decision"], ["after-adoption", "applied"]]) {
    await check(`interruption at ${stage} is inspected without replay or hold discharge`, async env => {
      const p = await preview(env); await env.service.consent.reserve(env.owner.storedSession(), commitInput(p));
      fault = (options, write) => {
        if (options.kind === stage) throw new Error("CONSOLE_FIXTURE_INTERRUPTED");
        const result = write(options);
        if (stage === "after-adoption" && options.kind === "order-adoption-records") throw new Error("CONSOLE_FIXTURE_INTERRUPTED");
        return result;
      };
      assert.throws(() => executeOrderDecision(env.service.configuration, p.challenge_id), /FIXTURE_INTERRUPTED/); fault = null;
      const outcome = await inspect(env, p.challenge_id); assert.equal(outcome.outcome, expected, JSON.stringify(outcome));
      assert.equal(outcome.hold_preserved, true); assert.equal(row(env, p.challenge_id).state, "reconciliation_required");
      if (stage === "after-adoption") assert.equal(outcome.adoption_status, "adopted");
    });
  }
  await check("a replaced pinned local signing key makes retained consent unverifiable", async env => {
    const p = await preview(env); await env.owner.post("/api/order-decisions/commit", commitInput(p));
    const key = crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
    env.service.auth.db.prepare("UPDATE meta SET value=? WHERE key='operator-signing-key'").run(key);
    const outcome = await inspect(env, p.challenge_id); assert.equal(outcome.outcome, "unverifiable");
    assert(outcome.reasons.includes("OPERATOR_CONSENT_SIGNATURE_INVALID"));
  });
  await check("changing the original private preview cannot reinterpret retained consent", async env => {
    const p = await preview(env); await env.owner.post("/api/order-decisions/commit", commitInput(p));
    const value = JSON.parse(row(env, p.challenge_id).preview); value.request.disposition = "reject";
    env.service.auth.db.prepare("UPDATE operator_actions SET preview=? WHERE id=?").run(JSON.stringify(value), p.challenge_id);
    assert.equal((await inspect(env, p.challenge_id)).outcome, "unverifiable");
  });
  await check("a claimed private applied status without a controller record is not trusted", async env => {
    const p = await preview(env); env.service.auth.db.prepare("UPDATE operator_actions SET state='applied' WHERE id=?").run(p.challenge_id);
    const outcome = await inspect(env, p.challenge_id); assert.equal(outcome.outcome, "unverifiable");
    assert(outcome.reasons.includes("CONSOLE_OUTCOME_PROJECTION_WITHOUT_RECORD"));
  });
  await check("expired original consent stays expired during historical replay", async env => {
    const p = await preview(env); await env.owner.post("/api/order-decisions/commit", commitInput(p));
    const original = Date.now; let outcome;
    try { Date.now = () => original() + 180000; outcome = inspectDecisionOutcome(env.service.configuration, p.challenge_id); }
    finally { Date.now = original; }
    assert.equal(outcome.outcome, "applied"); assert.equal(outcome.original_consent_freshness, "expired");
    assert.equal(outcome.mutation_authorized, false); assert.equal(outcome.execution_authorized, false);
  });
  for (const mutation of ["manifest", "key", "repository"]) {
    await check(`concurrent ${mutation} drift denies a previously valid inspection`, async env => {
      const p = await preview(env); await env.owner.post("/api/order-decisions/commit", commitInput(p));
      duringRead = () => {
        duringRead = null;
        if (mutation === "manifest") originalWrite({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
          missionId: env.plan.mission_id, waveId: env.plan.wave_id, kind: "agent-outputs", artifactId: "OUT-CONCURRENT-INSPECTION", payload: { changed: true } });
        else if (mutation === "key") env.service.auth.db.prepare("UPDATE meta SET value=? WHERE key='operator-signing-key'")
          .run(crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }));
        else fs.appendFileSync(require("node:path").join(env.options.repository, "README.md"), "concurrent change\n");
      };
      assert.throws(() => inspectDecisionOutcome(env.service.configuration, p.challenge_id), /OUTCOME_SNAPSHOT_CHANGED/);
      assert.equal(row(env, p.challenge_id).state, "applied");
    });
  }
  await check("a viewer cannot inspect another principal's decision effects", async env => {
    const p = await preview(env), invite = await env.owner.post("/api/invites", { password, missions: [env.plan.mission_id] });
    const viewer = client(env.service); await viewer.session();
    await viewer.post("/api/register", { username: "viewer", password, token: invite.token }); await viewer.session();
    await viewer.post(`/api/order-decisions/${p.challenge_id}/inspect`, {}, 403);
    await client(env.service).post(`/api/order-decisions/${p.challenge_id}/inspect`, {}, 403);
    await env.owner.post(`/api/order-decisions/${p.challenge_id}/inspect`, { recover: true }, 400);
    await env.owner.post(`/api/order-decisions/${crypto.randomUUID()}/inspect`, {}, 404);
  });
  await check("running-source drift denies inspection instead of returning cached authority", async env => {
    const p = await preview(env); env.service.configuration.sourceSha256 = "0".repeat(64);
    assert.throws(() => inspectDecisionOutcome(env.service.configuration, p.challenge_id), /SOURCE_CHANGED/);
  });
  console.log(JSON.stringify({ total: results.length, passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length, results }, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 1;
}
if (require.main === module) {
  const watchdog = setTimeout(() => { console.error("CONSOLE_OUTCOME_FIXTURE_DID_NOT_FINISH"); process.exit(1); }, 300000);
  main().then(() => clearTimeout(watchdog), error => { clearTimeout(watchdog); console.error(error.stack); process.exitCode = 1; });
}
