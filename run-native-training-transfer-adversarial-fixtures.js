#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), s = require("./native-training-transfer-fixtures/support");
const observations = [];
async function test(name, run, options) {
  let env;
  try { env = await s.environment(options); await run(env); observations.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { observations.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
  finally { if (env) await s.close(env); }
}
async function main() {
  await test("a shared standard retains the stronger classification from its original mission", async env => {
    const p = await s.preview(env), label = { ...p.invocation.preview.input.transfer_review.request.labels[1], id: "CL-SHARED-ORIGIN", mission_id: "MIS-SHARED", classification: "sensitive" };
    require("./repository-artifact-store").writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: "MIS-SHARED", waveId: env.plan.wave_id,
      kind: "classification-labels", artifactId: label.id, payload: label });
    const value = await env.owner.post("/api/training-products/preview", { ...env.previewInput, manifest: s.force.manifestState(s.force.load(env.options)).sha256 }, 409);
    assert(value.reason_codes.includes("SEMANTIC_TRAINING_TRANSFER_LABEL_DENIED"));
    assert.deepEqual(fs.readdirSync(path.join(env.stateDir, "model-evaluations")), []);
  }, { standardMission: "MIS-SHARED" });
  await test("a reservation attached to an unsigned pending preview is uncertainty, not a known authorized attempt", async env => {
    const p = await s.preview(env), directory = path.join(env.stateDir, "model-evaluations", `collection-${p.invocation.preview.input.request.collection_id}`);
    fs.mkdirSync(directory, { mode: 0o700 }); fs.writeFileSync(path.join(directory, "reservation.json"), JSON.stringify({
      collection_id: p.invocation.preview.input.request.collection_id, request_ref: p.invocation.preview.request_ref, consent_id: p.challenge_id,
      invocation_sha256: p.invocation.invocation_sha256, consent_sha256: "0".repeat(64), reserved_at: new Date().toISOString() }), { mode: 0o600 });
    const value = await env.owner.get("/api/training-products"); assert.equal(value.native_inventory.clear, false);
    const denied = await env.owner.post("/api/training-products/commit", s.commitInput(p), 409); assert.equal(denied.error, "CONSOLE_TRAINING_ORPHAN_INVENTORY_HELD");
  });
  await test("staged task bytes cannot be substituted before the canonical file writer reads them", async env => {
    const p = await s.preview(env), artifacts = require("./repository-artifact-store"), kinds = require("./native-training-transfer-contract").KINDS,
      original = artifacts.writeRepositoryFileArtifact; let changed = false;
    artifacts.writeRepositoryFileArtifact = function(options) {
      if (options.kind === kinds.outputs) { changed = true; fs.writeFileSync(options.sourcePath, 'password="synthetic-staged-output-value"'); }
      return original(options);
    };
    try {
      await env.owner.post("/api/training-products/commit", s.commitInput(p), 202); const value = await s.terminal(env, p.challenge_id);
      assert(changed); assert.equal(value.state, "held"); assert.equal(value.product_output, undefined);
      assert.equal(s.force.load(env.options).manifest.artifacts.filter(entry => entry.kind === kinds.outputs).length, 0, "Staged-byte mismatch must fail before canonical output publication.");
    } finally { artifacts.writeRepositoryFileArtifact = original; }
  });
  const failed = observations.filter(value => !value.passed).length;
  console.log(JSON.stringify({ passed: observations.length - failed, failed, observations, actual_model_invocations: 0, real_owner_actions: 0, all_eight_goals_complete: false }, null, 2));
  process.exitCode = failed ? 1 : 0;
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
