#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const { resolveDefaultModel } = require("./codex-model-selection"), { assertSelection, SELECTOR } = require("./codex-model-selection-contract");
const { digest } = require("./order-intake-contract"), { validatePayload, validateSchemaPayload } = require("./validator-cli-prototype/validate");
const { environment, preview, commitInput, terminal } = require("./operator-semantic-fixtures/support");
const roots = [], clone = value => structuredClone(value); let passed = 0;
const { entry, fixture: makeFixture } = require("./codex-model-selection-fixtures/support");
function fixture(changes) { const value = makeFixture(changes); roots.push(value.root); return value; }
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function main() {
  try {
    await check("schema and both validator APIs keep exact selection metadata non-executable", () => {
      const good = require("./sample-payloads/valid-codex-model-selection.json"), bad = require("./sample-payloads/invalid-codex-model-selection.json");
      assertSelection(good);
      for (const api of [validatePayload, validateSchemaPayload]) { const r = api(good, "codex-model-selection"); assert.equal(r.valid, true); assert.equal(r.can_execute, false); }
      assert.equal(validatePayload(bad, "codex-model-selection").valid, false);
      for (const mutate of [v => { v.process_group_absent = false; }, v => { v.model_access_attested = true; }, v => { v.execution_authorized = true; }, v => { v.extra = "unknown"; }]) {
        const value = clone(good); mutate(value); assert.throws(() => assertSelection(value));
      }
    });
    await check("native-shaped handshake resolves only metadata and never sends a thread, turn or secret", async () => {
      const f = fixture(), selection = await resolveDefaultModel(f.options); assertSelection(selection);
      assert.equal(selection.requested_model, "fixture-valid"); assert.equal(selection.source, "catalog_default");
      assert(!JSON.stringify(selection).includes("synthetic-do-not-retain")); assert.equal(selection.model_access_attested, false);
      const requests = f.read("requests.jsonl");
      assert.deepEqual(requests.map(row => row.method), ["initialize", "initialized", "config/read", "model/list", "config/read"]);
      assert.equal(requests[2].params.cwd, f.root); assert.equal(f.read("exec.jsonl").length, 0);
      assert.throws(() => process.kill(Number(fs.readFileSync(path.join(f.root, "pid.txt"))), 0), error => error.code === "ESRCH");
    });
    await check("configured model wins over the recommended default without silent upgrade", async () => {
      const f = fixture({ model: "configured-model", models: [entry(), entry("configured-model", { isDefault: false, hidden: true })] });
      const result = await resolveDefaultModel(f.options); assert.equal(result.requested_model, "configured-model"); assert.equal(result.source, "configured_model");
    });
    await check("only schema-shaped inactive remote status is harmless metadata", async () => {
      const f = fixture({ mode: "remote-disabled" }); assert.equal((await resolveDefaultModel(f.options)).requested_model, "fixture-valid");
    });
    for (const [name, changes, code] of [
      ["missing default", { models: [entry("fixture-valid", { isDefault: false })] }, "DEFAULT_AMBIGUOUS"],
      ["two defaults", { models: [entry(), entry("second-model")] }, "DEFAULT_AMBIGUOUS"],
      ["unknown configured model", { model: "not-listed" }, "DEFAULT_AMBIGUOUS"],
      ["duplicate model", { models: [entry(), entry()] }, "CATALOG_AMBIGUOUS"],
      ["unsupported provider", { provider: "other-provider" }, "PROVIDER_UNSUPPORTED"],
      ["unsupported effort", { models: [entry("fixture-valid", { supportedReasoningEfforts: [{ reasoningEffort: "high" }] })] }, "REASONING_UNSUPPORTED"],
      ["configuration drift", { mode: "drift" }, "CONFIG_CHANGED"],
      ["cursor cycle", { mode: "cursor-loop", models: [] }, "CATALOG_INCOMPLETE"],
      ["unexpected activity", { mode: "activity" }, "UNEXPECTED_ACTIVITY"],
      ["connecting remote control", { mode: "remote-connecting" }, "UNEXPECTED_ACTIVITY"],
      ["connected remote control", { mode: "remote-connected" }, "UNEXPECTED_ACTIVITY"],
      ["server tool request", { mode: "unknown-request" }, "PROTOCOL_INVALID"],
      ["invalid UTF-8", { mode: "invalid-utf8" }, "PROTOCOL_INVALID"],
      ["wrong version", { version: "codex-cli 0.0.0" }, "VERSION_UNSUPPORTED"]
    ]) await check(`${name} fails without fallback or inference`, async () => {
      const f = fixture(changes); await assert.rejects(resolveDefaultModel(f.options), new RegExp(code)); assert.equal(f.read("exec.jsonl").length, 0);
    });
    await check("deadline and cancellation observe child exit before returning failure", async () => {
      const f = fixture({ mode: "timeout" }); await assert.rejects(resolveDefaultModel({ ...f.options, timeoutMs: 500 }), /TIMEOUT/);
      assert.throws(() => process.kill(Number(fs.readFileSync(path.join(f.root, "pid.txt"))), 0), error => error.code === "ESRCH");
      const controller = new AbortController(), second = fixture({ mode: "timeout" });
      const pending = resolveDefaultModel({ ...second.options, signal: controller.signal });
      const rejected = assert.rejects(pending, /CANCELLED/);
      for (let count = 0; count < 100 && !fs.existsSync(path.join(second.root, "pid.txt")); count++) await new Promise(resolve => setTimeout(resolve, 20));
      assert(fs.existsSync(path.join(second.root, "pid.txt")), "Observe the actual child before testing in-flight cancellation.");
      controller.abort(); await rejected;
      assert.throws(() => process.kill(Number(fs.readFileSync(path.join(second.root, "pid.txt"))), 0), error => error.code === "ESRCH");
    });
    await check("actual authenticated omission preview freezes the model and runs nothing until synthetic owner consent", async () => {
      const f = fixture(), env = await environment({ model: SELECTOR, executable: f.executable });
      try {
        f.write({ ...f.initial, model: "later-default", models: [entry("later-default")] });
        const prepared = await preview(env), profile = prepared.invocation.profile;
        assert.equal(profile.requested_model, "fixture-valid"); assert.equal(profile.model_selection.source, "catalog_default");
        assert.equal(f.read("exec.jsonl").length, 0); assert.equal(profile.model_selection.selection_sha256, assertSelection(profile.model_selection).selection_sha256);
        const altered = clone(prepared); altered.invocation.profile.requested_model = "displayed-but-different";
        assert.equal((await env.owner.post("/api/model-evaluations/commit", commitInput(altered), 409)).error, "CONSOLE_MODEL_DISPLAY_MISMATCH");
        const missing = commitInput(prepared); delete missing.displayed_invocation_sha256;
        await env.owner.post("/api/model-evaluations/commit", missing, 400); assert.equal(f.read("exec.jsonl").length, 0);
        await env.owner.post("/api/model-evaluations/preview", { ...env.previewInput, model: "injected" }, 400);
        await env.owner.post("/api/model-evaluations/commit", commitInput(prepared), 202);
        const current = await terminal(env, prepared.challenge_id); assert.equal(current.state, "evaluated"); assert.equal(current.result_verified, true);
        const calls = f.read("exec.jsonl"); assert.equal(calls.length, 1); assert.equal(calls[0].model, "fixture-valid"); assert(calls[0].args.includes("--ignore-user-config"));
        const saved = env.service.auth.db.prepare("SELECT preview FROM operator_model_actions WHERE id=?").get(prepared.challenge_id);
        const value = JSON.parse(saved.preview); value.profile.model_selection.requested_model = "later-default";
        env.service.auth.db.prepare("UPDATE operator_model_actions SET preview=? WHERE id=?").run(JSON.stringify(value), prepared.challenge_id);
        assert.equal((await env.owner.get(`/api/model-evaluations/${prepared.challenge_id}`)).result_verified, false);
        assert.equal(f.read("exec.jsonl").length, 1);
      } finally { await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); }
    });
    await check("actual analysis uses the same frozen binding with separate purpose consent and real draft compilation", async () => {
      const support = require("./order-analysis-fixtures/support"), { createConsole } = require("./operator-console-server");
      const { client, password } = require("./operator-consent-fixtures/support"), f = fixture({ model: "analysis-valid", models: [entry("analysis-valid")], providerScript: path.join(__dirname, "order-analysis-fixtures/fake-codex.js") });
      const env = support.environment(); let service;
      try {
        service = await createConsole({ ...env.configuration, analysis: { executable: f.executable, model: SELECTOR, timeoutMs: 10000 } }); await service.app.ready();
        const owner = client(service); await owner.session(); await owner.post("/api/setup", { username: "owner", password, token: service.auth.createBootstrap() }); await owner.session();
        const listing = await owner.get("/api/evidence?kind=mission-requests"), prepared = await owner.post("/api/order-analyses/preview", { entry_id: listing.entries[0].id, manifest: listing.manifest_sha256 });
        assert.equal(prepared.invocation.profile.requested_model, "analysis-valid"); assert.equal(f.read("exec.jsonl").length, 0);
        await owner.post("/api/model-evaluations/commit", commitInput(prepared), 409);
        await owner.post("/api/order-analyses/commit", commitInput(prepared), 202);
        const result = await terminal({ owner }, prepared.challenge_id); assert.equal(result.state, "evaluated"); assert(result.result.draft_ref); assert.equal(result.execution_authorized, false);
        assert.equal(f.read("exec.jsonl").length, 1); assert.equal(f.read("exec.jsonl")[0].model, "analysis-valid");
      } finally { if (service) await service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); }
    });
    await check("selection copies and nested wrappers are control metadata, not work evidence", () => {
      const item = require("./sample-payloads/valid-codex-model-selection.json");
      assert(require("./semantic-control-types").isNonWorkPayload(item)); assert(require("./semantic-control-types").isNonWorkPayload({ output: { copied: item } }));
      const changed = clone(item); changed.requested_model = "other"; const { selection_sha256, ...body } = changed; changed.selection_sha256 = digest(body);
      assertSelection(changed); assert.notEqual(changed.selection_sha256, item.selection_sha256);
    });
    await check("both installed-skill wrappers preserve discovery denial and create no owner state", () => {
      const f = fixture({ provider: "unsupported" }), support = require("./order-analysis-fixtures/support"), env = support.environment();
      try {
        for (const provider of ["codex-skills", ".claude/skills"]) {
          const directory = path.join(f.root, provider.replaceAll("/", "-"));
          const child = spawnSync(process.execPath, [path.join(__dirname, provider, "controls-doctrine-operator/scripts/serve_controls_operator.js"),
            "--repository", env.options.repository, "--state-dir", directory, "--port", "0", "--semantic-executable", f.executable, "--semantic-model", SELECTOR],
          { encoding: "utf8", timeout: 10000, cwd: __dirname, env: { ...process.env, CANNAE_OS_HOME: __dirname } });
          assert.equal(child.status, 1, child.stderr); assert(child.stderr.includes("SEMANTIC_MODEL_PROVIDER_UNSUPPORTED"), child.stderr); assert(!fs.existsSync(directory));
          assert.equal(f.read("exec.jsonl").length, 0);
        }
      } finally { fs.rmSync(env.root, { recursive: true, force: true }); }
    });
    console.log(JSON.stringify({ total: passed, passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0 }));
  } finally { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
