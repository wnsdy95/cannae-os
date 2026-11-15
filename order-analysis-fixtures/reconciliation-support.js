const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { environment: base } = require("./support"), { createConsole } = require("../operator-console-server");
const { client, password } = require("../operator-consent-fixtures/support");
const { terminal, commitInput } = require("../operator-semantic-fixtures/support");
const row = (env, id) => env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(id);
const review = (env, id, expected = 200) => env.owner.post(`/api/order-analyses/${id}/reconciliation/preview`, {}, expected);
const ackInput = p => ({ reconciliation_id: p.reconciliation_id, nonce: p.nonce, password,
  rationale: "Acknowledge the failed analysis and observed draft publication without replay, adoption or provider-effect claims.",
  acknowledge_provider_uncertainty: true, acknowledge_analysis_publication: true });
async function environment({ model = "fixture-invalid", initialize = true, port = 4317 } = {}) {
  const env = base(); env.configuration.port = port; env.configuration.analysis.model = model;
  env.configuration.semantic = { executable: path.join(__dirname, "../semantic-evaluation-fixtures/fake-codex.js"), model: "fixture-valid", timeoutMs: 10000 };
  try {
    env.service = await createConsole(env.configuration); await env.service.app.ready();
    env.refresh = async () => { const list = await env.owner.get("/api/evidence?kind=mission-requests"); return { entry_id: list.entries[0].id, manifest: list.manifest_sha256 }; };
    if (initialize) {
      env.owner = client(env.service); await env.owner.session(); await env.owner.post("/api/setup", { username: "owner", password, token: env.service.auth.createBootstrap() }); await env.owner.session();
    }
    return env;
  } catch (error) { if (env.service) await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); throw error; }
}
async function failed(env, stage) {
  const generator = require("../order-analysis-generator"), original = generator.compileAnalysis;
  if (stage) generator.compileAnalysis = (...args) => { if (stage === "after_publication") original(...args); throw new Error("SEMANTIC_ANALYSIS_PUBLICATION_UNKNOWN"); };
  try {
    const p = await env.owner.post("/api/order-analyses/preview", await env.refresh());
    await env.owner.post("/api/order-analyses/commit", commitInput(p), 202);
    const current = await terminal(env, p.challenge_id); assert.equal(current.state, "held"); assert.equal(current.result_verified, true); return current.id;
  } finally { generator.compileAnalysis = original; }
}
async function restart(env, disableModel = false) {
  await env.service.app.close(); if (disableModel) { env.configuration.analysis = null; env.configuration.semantic = null; }
  env.service = await createConsole(env.configuration); await env.service.app.ready(); env.owner = client(env.service);
  await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password }); await env.owner.session();
}
module.exports = { environment, failed, restart, review, ackInput, row, client, password };
