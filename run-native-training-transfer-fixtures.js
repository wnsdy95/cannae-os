#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), s = require("./native-training-transfer-fixtures/support");
const native = require("./operator-native-training"), c = require("./native-training-transfer-contract"), artifacts = require("./repository-artifact-store");
let passed = 0;
async function test(name, run) { const env = await s.environment(); try { await run(env); passed++; console.log(`PASS ${name}`); } finally { await s.close(env); } }
async function main() {
  await test("actual authenticated owner approval publishes original native bytes and signed bindings without a training grade", async env => {
    assert.equal(env.syntheticKey, undefined); const p = await s.preview(env);
    assert.equal(p.purpose, "native_training"); assert.equal(p.invocation.preview.schema_version, "0.2");
    assert.deepEqual(fs.readdirSync(path.join(env.stateDir, "model-evaluations")), []);
    const wrongPurpose = await env.owner.post("/api/model-evaluations/commit", { ...s.commitInput(p), acknowledge_mission_handling: undefined }, 409);
    assert.equal(wrongPurpose.error, "CONSOLE_MODEL_PURPOSE_INVALID");
    await env.owner.post("/api/training-products/commit", s.commitInput(p), 202);
    const current = await s.terminal(env, p.challenge_id); assert.equal(current.state, "collected", JSON.stringify(current)); assert.equal(current.result_verified, true);
    assert(current.product_output.includes("Synthetic actual returned bytes")); assert.equal(current.result.qualification_granted, false);
    assert.equal(current.result.task_standard_evaluated, false); assert.equal(current.publication_observation.entries.length, 3);
    const key = (await env.owner.get("/api/operator-key")).public_key_pem;
    c.verifySigned(current.result, "operator-native-training-product", key);
    const row = env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(p.challenge_id);
    const authorization = native.authorization(env.service.auth.db, row, JSON.parse(row.preview), key);
    assert.equal(authorization.principal_id, (await env.owner.session()).user.id); assert.equal(authorization.invocation_sha256, p.invocation.invocation_sha256);
    assert.equal(current.result.output_ref.sha256, require("./order-intake-contract").sha256(Buffer.from(current.product_output)));
    const saved = JSON.stringify({ row, authorization }); for (const value of [s.password, p.nonce, env.owner.storedSession().sessionId]) assert(!saved.includes(value));
    await env.owner.post("/api/training-products/commit", s.commitInput(p), 409);
    assert.equal((await env.owner.get("/api/training-products")).entries.length, 1);
  });
  await test("wrong prompt, release target, adverse label, expiry and mission handling fail at their exact pre-transfer boundaries", async env => {
    for (const [mutate, code] of [
      [value => { value.prompt_sha256 = "0".repeat(64); }, "SEMANTIC_TRAINING_TRANSFER_REVIEW_SUBSTITUTED"],
      [value => { value.release_review.target = "internal_handoff"; }, "SEMANTIC_TRAINING_TRANSFER_RELEASE_DENIED"],
      [value => { value.labels[0].classification = "restricted"; }, "SEMANTIC_TRAINING_TRANSFER_LABEL_DENIED"],
      [value => { value.labels[0].review_by = new Date(Date.now() - 1000).toISOString(); }, "SEMANTIC_TRAINING_TRANSFER_LABEL_DENIED"],
      [value => { value.labels[0].need_to_know_roles = ["USER"]; }, "SEMANTIC_TRAINING_TRANSFER_ROLE_DENIED"],
      [value => { value.mission_eefi_items = [{ id: "EEFI-MISSION", term: "NATIVE_TRAINING_INPUT", class: "tool_transfer_forbidden" }]; }, "SEMANTIC_TRAINING_MISSION_TRANSFER_DENIED"]
    ]) { const denied = await s.preview(env, "success", mutate, 409); assert(denied.reason_codes?.includes(code), JSON.stringify(denied)); }
    assert.deepEqual(fs.readdirSync(path.join(env.stateDir, "model-evaluations")), []);
  });
  await test("an existing stronger source label cannot be omitted by an inline owner-review proposal", async env => {
    const p = await s.preview(env), label = { ...p.invocation.preview.input.transfer_review.request.labels[1], id: "CL-STRONGER", classification: "sensitive" };
    artifacts.writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: env.plan.mission_id, waveId: env.plan.wave_id,
      kind: "classification-labels", artifactId: label.id, payload: label });
    const denied = await env.owner.post("/api/training-products/preview", { ...env.previewInput, manifest: s.force.manifestState(s.force.load(env.options)).sha256 }, 409);
    assert(denied.reason_codes.includes("SEMANTIC_TRAINING_TRANSFER_LABEL_DENIED"));
    assert.deepEqual(fs.readdirSync(path.join(env.stateDir, "model-evaluations")), []);
  });
  await test("nonce, displayed packet, password and missing handling acknowledgment cannot produce a reservation", async env => {
    const p = await s.preview(env), input = s.commitInput(p);
    for (const [change, status, code] of [[{ nonce: "x".repeat(43) }, 409, "CONSOLE_MODEL_CHALLENGE_DENIED"],
      [{ displayed_invocation_sha256: "0".repeat(64) }, 409, "CONSOLE_MODEL_DISPLAY_MISMATCH"], [{ password: "wrong-password" }, 403, "CONSOLE_REAUTH_DENIED"],
      [{ acknowledge_mission_handling: false }, 400, "CONSOLE_INPUT_INVALID"]]) {
      const denied = await env.owner.post("/api/training-products/commit", { ...input, ...change }, status); assert.equal(denied.error, code);
    }
    assert.deepEqual(fs.readdirSync(path.join(env.stateDir, "model-evaluations")), []);
  });
  await test("mission viewers cannot preview, inspect, commit or stop a native transfer", async env => {
    const invitation = await env.owner.post("/api/invites", { password: s.password, missions: [env.plan.mission_id] });
    const viewer = s.boundedClient(require("./force-registry-fixtures/support").client(env.service)); await viewer.session();
    await viewer.post("/api/register", { username: "viewer", password: s.password, token: invitation.token }); await viewer.session();
    const p = await s.preview(env);
    await viewer.get("/api/training-products", 403); await viewer.get(`/api/model-evaluations/${p.challenge_id}`, 403);
    await viewer.post("/api/training-products/preview", env.previewInput, 403);
    await viewer.post("/api/training-products/commit", s.commitInput(p), 403); await viewer.post(`/api/model-evaluations/${p.challenge_id}/cancel`, {}, 403);
    assert.deepEqual(fs.readdirSync(path.join(env.stateDir, "model-evaluations")), []);
  });
  await test("a different owner session and an expired original challenge cannot consume a native approval", async env => {
    const p = await s.preview(env), other = s.boundedClient(require("./force-registry-fixtures/support").client(env.service));
    await other.session(); await other.post("/api/login", { username: "owner", password: s.password }); await other.session();
    const denied = await other.post("/api/training-products/commit", s.commitInput(p), 409); assert.equal(denied.error, "CONSOLE_MODEL_CHALLENGE_DENIED");
    env.service.auth.db.prepare("UPDATE operator_model_actions SET expires=0 WHERE id=?").run(p.challenge_id);
    const expired = await env.owner.post("/api/training-products/commit", s.commitInput(p), 409); assert.equal(expired.error, "CONSOLE_MODEL_CHALLENGE_DENIED");
    assert.deepEqual(fs.readdirSync(path.join(env.stateDir, "model-evaluations")), []);
  });
  await test("both actual skill wrappers propose the exact review without signing or executing it", async env => {
    const cp = require("node:child_process");
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const p = s.draft(env), { id, ...recipe } = require("./native-training-transfer-fixtures/contracts").reviewFor(p.preview), file = path.join(env.root, "review-recipe.json");
      fs.writeFileSync(file, JSON.stringify(recipe), { mode: 0o600 });
      const script = path.join(__dirname, provider, "controls-doctrine-operator/scripts/prepare_controls_training_product.js"),
        options = { cwd: env.options.repository, encoding: "utf8", timeout: 30000, env: { PATH: process.env.PATH, HOME: env.root, CANNAE_OS_HOME: __dirname } },
        args = [file, "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot];
      const value = cp.spawnSync(process.execPath, [script, "propose-review", ...args], options); assert.equal(value.status, 0, value.stderr);
      assert.equal(JSON.parse(value.stdout).request.type, "NativeTrainingTransferReviewRequest"); assert.equal(JSON.parse(value.stdout).execution_authorized, false);
      assert.equal(cp.spawnSync(process.execPath, [script, "run", ...args], options).status, 1);
    }
    assert.deepEqual(fs.readdirSync(path.join(env.stateDir, "model-evaluations")), []);
    assert.equal(env.service.auth.db.prepare("SELECT count(*) AS n FROM operator_native_training_authorizations").get().n, 0);
  });
  for (const mode of ["quarantine", "wrongcase"]) await test(`a ${mode} collection remains held, visible and unreconciled`, async env => {
    const p = await s.preview(env, mode); await env.owner.post("/api/training-products/commit", s.commitInput(p), 202);
    const current = await s.terminal(env, p.challenge_id); assert.equal(current.state, "held", JSON.stringify(current)); assert.equal(current.result_verified, true);
    assert.equal(current.product_output, undefined); assert.equal(current.result.output_ref, null); assert.equal(current.result.collection.process_group_absent, true);
    assert.equal((await env.owner.get("/api/training-products")).entries.length, 1);
    const denied = await env.owner.post(`/api/model-evaluations/${p.challenge_id}/reconciliation/preview`, {}, 409); assert.equal(denied.error, "CONSOLE_MODEL_RECONCILIATION_PURPOSE_UNSUPPORTED");
    await env.owner.post("/api/training-products/preview", env.previewInput, 409);
  });
  await test("partial canonical publication is retained as uncertainty, not reexecuted after restart", async env => {
    const p = await s.preview(env), original = artifacts.writeRepositoryFileArtifact; let attempted = false;
    artifacts.writeRepositoryFileArtifact = function(options) { if (options.kind === c.KINDS.outputs) { attempted = true; throw new Error("CONSOLE_TRAINING_TEST_INTERRUPTION"); } return original(options); };
    try { await env.owner.post("/api/training-products/commit", s.commitInput(p), 202); const current = await s.terminal(env, p.challenge_id);
      assert(attempted); assert.equal(current.state, "held"); assert.equal(current.publication_observation.entries.length, 1); assert.equal(current.result.retained_artifact_refs.length, 1);
    } finally { artifacts.writeRepositoryFileArtifact = original; }
    await env.service.app.close(); env.service = await require("./operator-console-server").createConsole(env.configuration); await env.service.app.ready();
    env.owner = s.boundedClient(require("./force-registry-fixtures/support").client(env.service)); await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password: s.password }); await env.owner.session();
    const current = await env.owner.get(`/api/model-evaluations/${p.challenge_id}`); assert.equal(current.state, "held"); assert.equal(current.publication_observation.entries.length, 1);
    await env.owner.post("/api/training-products/preview", env.previewInput, 409);
  });
  await test("actual logout stops the child and retains original failed bytes privately", async env => {
    const p = await s.preview(env, "slow"); await env.owner.post("/api/training-products/commit", s.commitInput(p), 202);
    const marker = path.join(env.stateDir, "model-evaluations", p.challenge_id, "synthetic-provider-started");
    for (let count = 0; count < 200 && !fs.existsSync(marker); count++) await new Promise(resolve => setTimeout(resolve, 20)); assert(fs.existsSync(marker));
    await env.owner.post("/api/logout", {}); env.owner = s.boundedClient(require("./force-registry-fixtures/support").client(env.service));
    await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password: s.password }); await env.owner.session();
    const current = await s.terminal(env, p.challenge_id); assert.equal(current.state, "held"); assert.equal(current.result.collection.process_group_absent, true);
    assert(current.result.collection.failure_reasons.includes("CONSOLE_MODEL_SESSION_ENDED")); assert.equal(current.product_output, undefined);
  });
  await test("orphan reservations are enumerated and block all new model transfers", async env => {
    const p = await s.preview(env), root = path.join(env.stateDir, "model-evaluations"), directory = path.join(root, `collection-${require("node:crypto").randomUUID()}`);
    fs.mkdirSync(directory, { mode: 0o700 }); fs.writeFileSync(path.join(directory, "reservation.json"), "{}", { mode: 0o600 });
    const inventory = await env.owner.get("/api/training-products"); assert.equal(inventory.native_inventory.clear, false); assert.equal(inventory.native_inventory.orphaned.length, 1);
    const denied = await env.owner.post("/api/training-products/commit", s.commitInput(p), 409); assert.equal(denied.error, "CONSOLE_TRAINING_ORPHAN_INVENTORY_HELD");
  });
  console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, qualification_supported: false, operational_grants_supported: false, all_eight_goals_complete: false }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
