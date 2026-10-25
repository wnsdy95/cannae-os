#!/usr/bin/env node
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const support = require("./task-training-fixtures/support"), { c, core } = support;
const { signOperatorRecord } = require("./operator-consent-contract");
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
async function main() {
  const env = await support.environment();
  try {
    support.observe(env);
    check("actual admitted file read binds its retained output without claiming qualification", () => {
      const value = core.appraiseTrial(env.options, env.request, env.publicKey);
      assert.equal(value.execution_succeeded, true); assert.equal(value.status, "observed_result_bound");
      for (const field of ["qualification_granted", "grant_restoration_authorized", "execution_authorized", "release_authorized", "actual_model_execution_attested", "conditions_observed", "evaluator_authenticated"]) assert.equal(value[field], false);
      assert.equal(c.checked(value, "task-training-trial-appraisal"), value);
      assert.equal(value.valid_for_training_review_until, new Date(Math.min(Date.parse(env.standard.expires_at),
        Date.parse(env.completion.checkpoint.recorded_at) + env.standard.sustainment_seconds * 1000)).toISOString());
    });
    check("a different trust key cannot authenticate registry or training session evidence", () => {
      const key = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
      assert.throws(() => core.appraiseTrial(env.options, env.request, key), /FORCE_REGISTRY_OPERATOR_SIGNATURE_INVALID/);
    });
    for (const [field, value, error] of [
      ["mission_id", "MIS-OTHER", "TRAINING_EXECUTION_SCOPE_MISMATCH"],
      ["case_id", "CASE-crawl-1", "TRAINING_ADMISSION_OR_CASE_MISMATCH"],
      ["case_id", "CASE-walk-0", "TRAINING_CASE_OUTSIDE_SESSION_SCOPE"],
      ["performer_id", "PERF-OTHER", "TRAINING_ENTITY_UNAVAILABLE"]
    ]) check(`cannot substitute ${field}`, () => {
      const { id, ...body } = env.request, request = c.trial({ ...body, [field]: value });
      assert.throws(() => core.appraiseTrial(env.options, request, env.publicKey), new RegExp(error));
    });
    check("retaining arbitrary output bytes cannot replace actual observed output", () => {
      const reference = support.output(env, "This never came from the admitted read.", "OUT-SUBSTITUTED");
      const { id, ...body } = env.request, request = c.trial({ ...body, observed_output_ref: reference });
      assert.throws(() => core.appraiseTrial(env.options, request, env.publicKey), /TRAINING_OBSERVED_OUTPUT_SUBSTITUTED/);
    });
    check("self-authored provider data cannot borrow a real completion checkpoint", () => {
      const value = c.completionInput({ hook_event_name: "PostToolUse", tool_use_id: "training-call", tool_name: "Read", tool_input: support.base.inputs.planned,
        tool_response: { content: "Invented execution result." } });
      const reference = support.persist(env, "task-training-completion-inputs", value), { id, ...body } = env.request;
      assert.throws(() => core.appraiseTrial(env.options, c.trial({ ...body, completion_input_ref: reference }), env.publicKey), /TRAINING_PROVIDER_RESULT_SUBSTITUTED/);
    });
    check("a valid signature with an earlier claimed timestamp cannot post-hoc enroll a session", () => {
      const { signature, ...body } = env.binding;
      const late = signOperatorRecord({ ...body, id: "TSB-LATE" }, env.syntheticPrivateKey);
      const reference = support.persist(env, "task-training-session-bindings", late), { id, ...request } = env.request;
      assert.throws(() => core.appraiseTrial(env.options, c.trial({ ...request, session_binding_ref: reference }), env.publicKey), /TRAINING_SESSION_NOT_BOUND_BEFORE_CALL/);
    });
    check("session configuration is the exact reviewed performer declaration", () => {
      const { signature, ...body } = env.binding;
      const changed = signOperatorRecord({ ...body, id: "TSB-CHANGED", configuration_sha256: "0".repeat(64) }, env.syntheticPrivateKey);
      const reference = support.persist(env, "task-training-session-bindings", changed), { id, ...request } = env.request;
      assert.throws(() => core.appraiseTrial(env.options, c.trial({ ...request, session_binding_ref: reference }), env.publicKey), /TRAINING_PERFORMER_SESSION_MISMATCH/);
    });
    check("an incoming session signature cannot choose its own trust root", () => {
      const { signature, ...body } = env.binding, key = crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
      const changed = signOperatorRecord({ ...body, id: "TSB-FOREIGN" }, key), reference = support.persist(env, "task-training-session-bindings", changed), { id, ...request } = env.request;
      assert.throws(() => core.appraiseTrial(env.options, c.trial({ ...request, session_binding_ref: reference }), env.publicKey), /TRAINING_SESSION_SIGNATURE_INVALID/);
    });
    const invitation = await env.owner.post("/api/invites", { password: support.f.password, missions: [env.plan.mission_id] });
    const viewer = support.f.client(env.service); await viewer.session();
    await viewer.post("/api/register", { username: "training-viewer", password: support.f.password, token: invitation.token }); await viewer.session();
    for (const kind of ["task-training-session-bindings", "task-training-completion-inputs", "task-training-observed-outputs"]) {
      const ownerEntries = await env.owner.get(`/api/evidence?kind=${kind}`); assert(ownerEntries.entries.length);
      assert.equal((await viewer.get(`/api/evidence?kind=${kind}`)).entries.length, 0);
      await viewer.get(`/api/evidence/${ownerEntries.entries[0].id}?manifest=${ownerEntries.manifest_sha256}`, 404);
    }
    passed++; console.log("PASS mission-scoped viewers cannot list or read owner-only training evidence through the real API");
    console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0,
      owner_training_session_ceremony_implemented: false, qualification_supported: false, operational_grant_consumer_implemented: false,
      all_eight_goals_complete: false }, null, 2));
  } finally { await support.close(env); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
