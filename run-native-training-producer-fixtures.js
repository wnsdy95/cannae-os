#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), { z } = require("zod");
const f = require("./native-training-producer-fixtures/support"), c = require("./native-training-product-contract"), core = require("./native-training-product-controller"), collector = require("./codex-training-product-collector");
const native = require("./operator-native-training"), { digest } = require("./operator-consent-contract");
let passed = 0;
async function replayProducer(name) {
  const frozen = f.restoreProducer(name), s = frozen.support;
  console.log(`PASS exact ${name} archived producer commit, complete tree, method files and original source digest restored`); passed++;
  try {
    for (const mode of ["wrongcase", "success"]) {
      const env = await s.environment();
      try {
        const preview = await s.preview(env, mode); await env.owner.post("/api/training-products/commit", s.commitInput(preview), 202);
        const observed = await s.terminal(env, preview.challenge_id), row = env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(preview.challenge_id);
        const invocation = JSON.parse(row.preview), consent = JSON.parse(row.consent), original = JSON.stringify(row), result = JSON.parse(row.result), key = env.service.consent.publicKey();
        assert.equal(invocation.preview.method_sha256, frozen.snapshot.method_sha256); assert.notEqual(c.methodBinding(), frozen.snapshot.method_sha256);
        assert.equal(observed.state, mode === "success" ? "collected" : "held"); assert.equal(observed.result_verified, true);
        assert(core.verifyHistoricalSubject(invocation.preview, key) === undefined);
        c.verifyHistoricalProfile(invocation.profile, invocation.preview);
        assert.throws(() => c.verifyProfile(invocation.profile, invocation.preview), /SEMANTIC_TRAINING_PERFORMER_PROFILE_CHANGED/);
        assert.throws(() => core.revalidatePreview(invocation.preview, invocation.preview.prepared_at), /SEMANTIC_TRAINING_METHOD_CHANGED/);
        assert.throws(() => core.verifyPublicationScope(invocation.preview, key, s.force.manifestState(s.force.load(env.options)).sha256), /SEMANTIC_TRAINING_PUBLICATION_SCOPE_CHANGED/);
        assert.equal(native.verifyResult(result, row, invocation, consent, key, env.service.auth.db, env.service.configuration, path.join(env.stateDir, "model-evaluations")), true);
        if (mode === "success") {
          const output = collector.readProduct(invocation, consent, { trustedPublicKey: key, stateRoot: path.join(env.stateDir, "model-evaluations") }); assert.equal(output.bytes.toString(), observed.product_output);
          const file = path.join(env.stateDir, "model-evaluations", row.id, "native-events.jsonl"), bytes = fs.readFileSync(file);
          try { fs.appendFileSync(file, "\n"); assert.throws(() => collector.readProduct(invocation, consent, { trustedPublicKey: key, stateRoot: path.join(env.stateDir, "model-evaluations") }), /SEMANTIC_TRAINING_NATIVE_EVENTS_CHANGED/); }
          finally { fs.writeFileSync(file, bytes); }
        }
        await env.service.app.close(); env.service = await require("./operator-console-server").createConsole(env.configuration); await env.service.app.ready();
        env.owner = s.boundedClient(require("./force-registry-fixtures/support").client(env.service)); await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password: s.password }); await env.owner.session();
        const replay = await env.owner.get(`/api/model-evaluations/${row.id}`); assert.equal(replay.state, observed.state); assert.equal(replay.result_verified, true);
        if (mode === "wrongcase") { assert.equal(replay.hold_preserved, true); const denied = await env.owner.post(`/api/model-evaluations/${row.id}/reconciliation/preview`, {}, 409); assert.equal(denied.error, "CONSOLE_MODEL_RECONCILIATION_PURPOSE_UNSUPPORTED"); }
        else assert.equal(replay.product_output, observed.product_output);
        assert.equal(JSON.stringify(env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(row.id)), original);
        assert.equal(digest(replay.result), digest(result));
        if (mode === "wrongcase") {
          const recovery = require("./native-training-reconciliation-fixtures/support"), p = await recovery.review(env, row.id);
          assert.equal(p.subject.native_appraisal.producer_method_sha256, frozen.snapshot.method_sha256);
          const receipt = await env.owner.post("/api/native-training-reconciliations/commit", recovery.ackInput(p));
          assert.equal(receipt.record.type, "OperatorNativeTrainingReconciliationRecord"); assert.equal(receipt.record.execution_authorized, false);
          const acknowledged = await env.owner.get(`/api/model-evaluations/${row.id}`); assert.equal(acknowledged.state, "held"); assert.equal(acknowledged.hold_preserved, false);
          assert.equal(JSON.stringify(env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(row.id)), original);
          assert.equal(digest(acknowledged.result), digest(result));
        }
        console.log(`PASS actual ${name} old ${mode === "success" ? "collected product" : "signed failed attempt"} replays through current owner API without rewriting or clearing authority`); passed++;
      } finally { await s.close(env); }
    }
    assert.equal(require(path.join(frozen.root, "skill-mission-controller")).repositoryStateDigest(frozen.root), frozen.snapshot.source_state_sha256);
  } finally { fs.rmSync(frozen.temporary, { recursive: true, force: true }); }
}
async function main() {
  for (const name of require("./native-training-producer").snapshotNames()) await replayProducer(name);
  console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, historical_source_executed_in_fixture_only: true,
    production_appraiser_runs_old_code: false, historical_appraisable_failure_acknowledgment_exercised: true, qualification_supported: false, all_eight_goals_complete: false }));
}
main().catch(error => { console.error(error.stack); console.error(JSON.stringify({ passed, failed: 1, unexecuted_suffix_not_passed: true })); process.exitCode = 1; });
