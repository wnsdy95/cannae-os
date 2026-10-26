const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const cookie = require("@fastify/cookie");
const password = "synthetic-owner-consent-password-2026";
function assertHttpStatus(response, expected, method, url, message = response.body) {
  try { assert.equal(response.statusCode, expected, message); }
  catch (error) {
    let body; try { body = response.json(); } catch { body = null; }
    let pathname = "other"; try { pathname = new URL(url, "http://fixture.invalid").pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, "<id>"); } catch { /* Preserve the original status assertion. */ }
    const code = value => typeof value === "string" && /^(?:CONSOLE|FORCE_REGISTRY|TRAINING_PRODUCT|NATIVE_TRAINING)_[A-Z0-9_]{1,96}$/.test(value);
    error.fixture_http = { method: ["GET", "POST"].includes(method) ? method : "other", status: response.statusCode, expected_status: expected,
      route: /^\/api\/(?:session|setup|login|logout|force-registry|training-products|model-evaluations)(?:\/(?:<id>|preview|commit|reconciliation|reconciliations)){0,3}$/.test(pathname) ? pathname : "other",
      error_code: code(body?.error) ? body.error : null, reason_codes: Array.isArray(body?.reason_codes) ? body.reason_codes.filter(code).slice(0, 20) : [] };
    throw error;
  }
}
function client(service) {
  const jar = new Map(); let csrf;
  return {
    jar,
    async request(method, url, payload) {
      const response = await service.app.inject({ method, url, payload,
        headers: { host: "127.0.0.1:4317", cookie: [...jar].map(([key, value]) => cookie.serialize(key, value)).join("; "),
          ...(method === "POST" ? { origin: "http://127.0.0.1:4317", ...(csrf ? { "x-csrf-token": csrf } : {}) } : {}) } });
      for (const item of response.cookies) jar.set(item.name, item.value);
      return response;
    },
    async get(url, expected = 200) { const r = await this.request("GET", url); assertHttpStatus(r, expected, "GET", url); return r.json(); },
    async post(url, body, expected = 200) { const r = await this.request("POST", url, body); assertHttpStatus(r, expected, "POST", url); return r.json(); },
    async session() { const data = await this.get("/api/session"); csrf = data.csrf_token; return data; },
    storedSession() {
      const unsigned = cookie.unsign(jar.get("cannae_operator"), service.auth.secret);
      assert(unsigned.valid); const sid = unsigned.value;
      const row = service.auth.db.prepare("SELECT value FROM sessions WHERE digest=?").get(crypto.createHash("sha256").update(sid).digest("hex"));
      return { ...JSON.parse(row.value), sessionId: sid };
    }
  };
}
async function environment(withRehearsal = true) {
  const support = require("../order-adoption-fixtures/support"), { createConsole } = require("../operator-console-server");
  const env = support.environment(Date.now() - 120000);
  support.propose(env);
  if (withRehearsal) { support.retainBriefs(env); support.rehearse(env); }
  env.stateDir = path.join(fs.realpathSync(env.root), "private");
  env.service = await createConsole({ repository: env.options.repository, artifactRoot: env.options.artifactRoot, stateDir: env.stateDir, port: 4317 });
  await env.service.app.ready();
  env.owner = client(env.service); await env.owner.session();
  await env.owner.post("/api/setup", { username: "owner", password, token: env.service.auth.createBootstrap() }); await env.owner.session();
  env.list = await env.owner.get("/api/evidence?kind=order-adoption-proposals");
  env.entry = env.list.entries[0];
  env.review = await env.owner.get(`/api/evidence/${env.entry.id}?manifest=${env.list.manifest_sha256}&review=true`);
  env.previewInput = { entry_id: env.entry.id, manifest: env.list.manifest_sha256,
    rehearsal_id: env.review.rehearsals[0]?.id || "none", disposition: "approve" };
  return env;
}
const preview = (env, changes = {}) => env.owner.post("/api/order-decisions/preview", { ...env.previewInput, ...changes });
const commitInput = p => ({ challenge_id: p.challenge_id, nonce: p.nonce, password, rationale: "Synthetic fixture decision; no real USER approval." });
function store(env) { return require("../campaign-supervisor").loadVerifiedStore(env.options.repository, env.options.artifactRoot); }
function count(env, kind) { return store(env).manifest.artifacts.filter(item => item.kind === kind).length; }
module.exports = { client, environment, preview, commitInput, store, count, password, assertHttpStatus };
