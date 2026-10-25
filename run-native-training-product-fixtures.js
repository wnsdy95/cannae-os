#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const s = require("./native-training-product-fixtures/support"), { signOperatorRecord } = require("./operator-consent-contract");
let passed = 0;
async function main() {
  const env = await s.environment();
  async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
  try {
    await test("actual child protocol and original task bytes bind a preauthorized collection without a qualification", async () => {
      const p = s.prepare(env), result = await s.collector.collectEvaluation(p.invocation, p.consent, s.configuration(env));
      assert.equal(result.status, "evaluated", JSON.stringify(result.failure_reasons));
      assert.equal(result.collection_identity.collection_id, p.proposed.request.collection_id); assert(result.native_thread_id);
      assert.deepEqual(s.force.manifestState(s.force.load(env.options)), p.preview.observed_manifest);
      const product = s.collector.readProduct(p.invocation, p.consent, s.configuration(env));
      assert.equal(product.bytes.toString(), JSON.parse(fs.readFileSync(path.join(result.directory, "response.json"))).output);
      for (const flag of ["qualification_granted", "grant_restoration_authorized", "execution_authorized", "release_authorized"]) assert.equal(product.appraisal[flag], false);
      assert.equal(product.appraisal.native_account_identity_attested, false); assert.equal(product.appraisal.pre_inference_native_identity_attested, false);
      const replay = signOperatorRecord({ ...p.consent, id: crypto.randomUUID() }, env.syntheticKey);
      await assert.rejects(s.collector.collectEvaluation(p.invocation, replay, s.configuration(env)), /SEMANTIC_COLLECTION_IDENTITY_ALREADY_RESERVED/);
      const responseFile = path.join(result.directory, "response.json"), original = fs.readFileSync(responseFile);
      fs.writeFileSync(responseFile, JSON.stringify({ ...JSON.parse(original), output: "Substituted task text" }));
      assert.throws(() => s.collector.readProduct(p.invocation, p.consent, s.configuration(env)), /SEMANTIC_TRAINING_RESPONSE_CHANGED/);
      fs.writeFileSync(responseFile, original);
      const eventsFile = path.join(result.directory, "native-events.jsonl"), originalEvents = fs.readFileSync(eventsFile);
      fs.appendFileSync(eventsFile, "\n");
      assert.throws(() => s.collector.readProduct(p.invocation, p.consent, s.configuration(env)), /SEMANTIC_TRAINING_NATIVE_EVENTS_CHANGED/);
      fs.writeFileSync(eventsFile, originalEvents);
      env.completed = p;
    });
    await test("new request history does not invalidate historical original-prefix evidence", async () => {
      s.prepare(env); assert.notDeepEqual(s.force.manifestState(s.force.load(env.options)), env.completed.preview.observed_manifest);
      assert(s.collector.readProduct(env.completed.invocation, env.completed.consent, s.configuration(env)).bytes.length > 0);
      assert.throws(() => s.core.verifyHistoricalSubject({ ...env.completed.preview, observed_manifest: { ...env.completed.preview.observed_manifest, sha256: "0".repeat(64) } }, env.publicKey),
        /TOOL_EFFECT_SETTLEMENT_HISTORY_MISMATCH/);
    });
    await test("other purposes and substituted performer profiles cannot authorize native task collection", async () => {
      const p = s.prepare(env), bad = signOperatorRecord({ ...p.consent, purpose: "one_semantic_evaluation_transfer" }, env.syntheticKey);
      await assert.rejects(s.collector.collectEvaluation(p.invocation, bad, s.configuration(env)), /SEMANTIC_TRANSFER_CONSENT_INVALID/);
      assert.throws(() => s.collector.prepareInvocation(p.preview, { ...env.profile, model: "another-model" }), /SEMANTIC_TRAINING_PERFORMER_PROFILE_CHANGED/);
      assert.throws(() => s.collector.prepareInvocation(p.preview, { ...env.profile, maxOutputBytes: 65536 }), /SEMANTIC_TRAINING_PERFORMER_PROFILE_CHANGED/);
    });
    await test("legacy tool appraisal and session enrollment cannot reinterpret an enrolled native standard", async () => {
      const scope = { mission_id: env.plan.mission_id, wave_id: env.plan.wave_id, capability_id: env.capability.id, performer_id: env.performer.id };
      const request = s.t.trial({ ...scope, registry_head_ref: env.registry.head_ref, case_id: "CASE-crawl-success", session_binding_ref: env.contextRef,
        lease_ref: env.contextRef, completion_ref: env.contextRef, completion_input_ref: env.contextRef, observed_output_ref: env.contextRef });
      assert.throws(() => require("./task-training-controller").appraiseTrial(env.options, request, env.publicKey), /TRAINING_NATIVE_PRODUCT_PATH_REQUIRED/);
      const old = require("./training-session-controller"), proposed = old.propose({ ...scope, expected_registry_head_ref: env.registry.head_ref,
        lease_ref: env.contextRef, stage: "crawl", case_ids: ["CASE-crawl-success"], expires_at: new Date(Date.now() + 600000).toISOString() }, env.options);
      const store = s.force.load(env.options), entry = store.manifest.artifacts.find(value => value.artifact_id === proposed.proposal.id);
      assert.throws(() => old.prepareReview({ ...env.service.configuration, forceRegistryPublicKey: env.publicKey }, {
        entry_id: require("./operator-console-evidence").entryId(entry), manifest: s.force.manifestState(store).sha256 }), /TRAINING_NATIVE_PRODUCT_PATH_REQUIRED/);
    });
    await test("both actual skill wrappers only propose and reject an execution command", async () => {
      const cp = require("node:child_process"), p = s.prepare(env), { id, ...input } = p.proposed.request;
      for (const provider of ["codex-skills", ".claude/skills"]) {
        const file = path.join(env.root, `request-${provider.startsWith(".") ? "claude" : "codex"}.json`);
        fs.writeFileSync(file, JSON.stringify({ ...input, collection_id: crypto.randomUUID() }));
        const script = path.join(__dirname, provider, "controls-doctrine-operator/scripts/prepare_controls_training_product.js");
        const options = { cwd: env.options.repository, encoding: "utf8", timeout: 30000,
          env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: env.root, CANNAE_OS_HOME: __dirname } };
        const args = [file, "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot];
        const result = cp.spawnSync(process.execPath, [script, "propose", ...args], options);
        assert.equal(result.status, 0, result.stderr); const operation = JSON.parse(result.stdout);
        assert.equal(operation.request.type, "NativeTrainingProductRequest"); assert.equal(operation.execution_authorized, false);
        assert.equal(cp.spawnSync(process.execPath, [script, "run", ...args], options).status, 1);
        fs.writeFileSync(file, "PRIVATEVALUE-CANARY-invalid-json");
        const invalid = cp.spawnSync(process.execPath, [script, "propose", ...args], options);
        assert.equal(invalid.status, 1); assert.equal(invalid.stdout, ""); assert.equal(invalid.stderr.trim(), "SEMANTIC_TRAINING_PROPOSAL_FAILED"); assert(!invalid.stderr.includes("PRIVATEVALUE"));
      }
    });
    for (const [mode, expected] of [["missingthread", "SEMANTIC_NATIVE_THREAD_MISSING_BEFORE_TURN"], ["duplicatethread", "SEMANTIC_NATIVE_THREAD_INVALID"],
      ["turnbeforethread", "SEMANTIC_NATIVE_THREAD_MISSING_BEFORE_TURN"], ["itembeforeturn", "SEMANTIC_NATIVE_EVENT_ORDER_INVALID"],
      ["wrongcase", "SEMANTIC_TRAINING_RESPONSE_SUBSTITUTED"], ["tool", "SEMANTIC_UNEXPECTED_TOOL_OR_DIAGNOSTIC"],
      ["workspace", "SEMANTIC_WORKSPACE_CHANGED"], ["quarantine", "SEMANTIC_TRAINING_OUTPUT_QUARANTINED"], ["control", "SEMANTIC_TRAINING_CONTROL_METADATA_NOT_PRODUCT"],
      ["malformed", "SEMANTIC_EVENT_JSON_INVALID"], ["invalidutf8", "SEMANTIC_EVENT_UTF8_INVALID"], ["twoturns", "SEMANTIC_MULTIPLE_TURNS"], ["timeout", "SEMANTIC_TIMEOUT"]]) {
      await test(`retains ${mode} as a failed collection with its exact boundary`, async () => {
        const p = s.prepare(env, mode), result = await s.collector.collectEvaluation(p.invocation, p.consent, s.configuration(env));
        assert.equal(result.status, "not_evaluated"); assert(result.failure_reasons.includes(expected), JSON.stringify(result.failure_reasons));
        assert(result.process_exit_confirmed && result.process_group_absent && result.result_persisted);
        const saved = JSON.parse(fs.readFileSync(path.join(result.directory, "result.json"))); assert.equal(saved.status, "not_evaluated");
        assert.throws(() => s.collector.readProduct(p.invocation, p.consent, s.configuration(env)), /SEMANTIC_TRAINING_COLLECTION_NOT_BOUND/);
        if (mode === "missingthread") assert.equal(result.actual_model_invocation_started, true);
      });
    }
    await test("live subject drift stops the actual child and preserves an unknown-quality failure", async () => {
      const p = s.prepare(env, "slow");
      let driftError;
      const timer = setTimeout(() => { try {
        const { id, ...input } = p.proposed.request; s.core.propose({ ...input, collection_id: crypto.randomUUID() }, env.options);
      } catch (error) { driftError = error; } }, 1500);
      let result; try { result = await s.collector.collectEvaluation(p.invocation, p.consent, s.configuration(env)); } finally { clearTimeout(timer); }
      assert.ifError(driftError);
      assert.equal(result.status, "not_evaluated"); assert(result.failure_reasons.includes("SEMANTIC_TRAINING_SCOPE_CHANGED"), JSON.stringify(result.failure_reasons));
      assert(result.process_exit_confirmed && result.process_group_absent);
    });
    console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, owner_consent_producer_implemented: false,
      qualification_supported: false, operational_grant_consumer_implemented: false, all_eight_goals_complete: false }));
  } finally { await s.close(env); }
}
main().catch(error => { console.error(error.stack); console.error(JSON.stringify({ passed, failed: 1, unexecuted_suffix_not_passed: true })); process.exitCode = 1; });
