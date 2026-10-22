#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { serialize } = require("@fastify/cookie");
const { createConsole } = require("./operator-console-server");
const { openAuthStore } = require("./operator-console-auth");
const { writeRepositoryArtifact } = require("./repository-artifact-store");

async function main() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-console-fixtures-")));
  const repository = path.join(root, "repo"), stateDir = path.join(root, "private"), artifactRoot = path.join(repository, ".cannae", "artifacts");
  fs.mkdirSync(repository);
  assert.equal(spawnSync("git", ["init", "--quiet", repository]).status, 0);
  const password = "synthetic-fixture-password-2026";
  const results = [];
  let consoleApp;
  async function check(name, callback) {
    try { await callback(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error.message }); }
  }
  function client() {
    const jar = new Map(); let csrf;
    return {
      jar,
      async request(method, url, payload, extra = {}) {
        const response = await consoleApp.app.inject({ method, url, payload, remoteAddress: extra.remoteAddress || "127.0.0.1",
          headers: { host: "127.0.0.1:4317", ...(method !== "GET" ? { origin: "http://127.0.0.1:4317", ...(csrf ? { "x-csrf-token": csrf } : {}) } : {}),
            cookie: [...jar].map(([key, value]) => serialize(key, value)).join("; "), ...extra.headers } });
        for (const item of response.cookies) jar.set(item.name, item.value);
        return response;
      },
      async session() { const response = await this.request("GET", "/api/session"); assert.equal(response.statusCode, 200, response.body); csrf = response.json().csrf_token; return response.json(); },
      async post(url, data, status = 200, extra) { const result = await this.request("POST", url, data, extra); assert.equal(result.statusCode, status, result.body); return result; },
      async get(url, status = 200, extra) { const result = await this.request("GET", url, undefined, extra); assert.equal(result.statusCode, status, result.body); return result; }
    };
  }
  try {
    consoleApp = await createConsole({ repository, artifactRoot, stateDir, port: 4317 });
    await consoleApp.app.ready();
    const anonymous = client(), owner = client(), viewer = client();
    await check("anonymous evidence and account enumeration are denied", async () => {
      await anonymous.get("/api/evidence", 401); await anonymous.get("/api/users", 401); await anonymous.get("/api/activity", 401);
    });
    await check("DNS rebinding, cross-site reads and proxy headers are denied", async () => {
      await anonymous.get("/api/session", 403, { headers: { host: "attacker.example:4317" } });
      await anonymous.get("/api/session", 403, { headers: { "sec-fetch-site": "cross-site" } });
      await anonymous.get("/api/session", 403, { headers: { "x-forwarded-for": "127.0.0.1" } });
    });
    await check("CSRF and exact Origin are required even before authentication", async () => {
      await anonymous.post("/api/login", { username: "owner", password }, 403);
      await anonymous.session();
      await anonymous.post("/api/login", { username: "owner", password }, 403, { headers: { origin: "http://127.0.0.1:9999" } });
      await anonymous.post("/api/login", { username: "owner", password }, 403, { headers: { "x-csrf-token": "forged" } });
    });
    await check("expired bootstrap token cannot initialize an owner", async () => {
      const expired = consoleApp.auth.createBootstrap();
      consoleApp.auth.db.prepare("UPDATE meta SET value='0' WHERE key='bootstrap-expires'").run();
      await anonymous.post("/api/setup", { username: "expiredowner", password, token: expired }, 403);
      assert.equal(consoleApp.auth.hasOwner(), false);
    });
    const bootstrap = consoleApp.auth.createBootstrap();
    await check("bootstrap tokens are hashed, expiring and single-use", async () => {
      assert(!fs.readFileSync(path.join(stateDir, "operator.sqlite")).includes(Buffer.from(bootstrap)));
      await owner.session();
      await owner.post("/api/setup", { username: "owner", password, token: "not-a-token" }, 403);
      const before = owner.jar.get("cannae_operator");
      const response = await owner.post("/api/setup", { username: "owner", password, token: bootstrap });
      assert.equal(response.json().user.role, "owner"); assert.notEqual(owner.jar.get("cannae_operator"), before);
      const cookies = Array.isArray(response.headers["set-cookie"]) ? response.headers["set-cookie"].join("\n") : response.headers["set-cookie"];
      assert.match(cookies, /HttpOnly/i); assert.match(cookies, /SameSite=Strict/i);
      await owner.session();
      await owner.post("/api/setup", { username: "otherowner", password, token: bootstrap }, 403);
    });
    await check("strict bodies reject authority injection instead of dropping extra fields", async () => {
      await owner.post("/api/login", { username: "owner", password, role: "owner" }, 400);
      await owner.get("/api/evidence?repository=/etc", 400);
    });
    await check("owner evidence has no fabricated data and never grants execution", async () => {
      const data = (await owner.get("/api/evidence")).json();
      assert.equal(data.total, 0); assert.equal(data.manifest_revision, 0);
      assert.equal(data.approval_authorized, false); assert.equal(data.release_authorized, false);
    });
    let stored;
    const base = { repositoryPath: repository, artifactRoot, missionId: "MIS-ALPHA", waveId: "W1", kind: "agent-outputs" };
    await check("real manifest entries, not static dashboard fixtures, are queryable", async () => {
      stored = writeRepositoryArtifact({ ...base, artifactId: "OUT-ALPHA", payload: { classification: "public", text: "<script>window.compromised=true</script>" } });
      writeRepositoryArtifact({ ...base, missionId: "MIS-BRAVO", artifactId: "OUT-BRAVO", payload: { internal: "bravo-only" } });
      const data = (await owner.get("/api/evidence")).json(); assert.equal(data.total, 2);
      const entry = data.entries.find(item => item.artifact_id === "OUT-ALPHA"); assert.equal(entry.classification, "restricted");
      const content = (await owner.get(`/api/evidence/${entry.id}?manifest=${data.manifest_sha256}`)).json();
      assert.equal(JSON.parse(content.content).text, "<script>window.compromised=true</script>");
      assert.equal(content.approval_authorized, false); assert.equal(content.release_authorized, false);
    });
    let invitation, viewerId;
    await check("only reauthenticated owner can issue a bounded viewer invitation", async () => {
      await owner.post("/api/invites", { password: "incorrect-password", missions: ["MIS-ALPHA"] }, 403);
      await owner.post("/api/invites", { password, missions: ["*"] }, 400);
      await owner.post("/api/invites", { password, missions: ["MIS-ALPHA"], role: "owner" }, 400);
      invitation = (await owner.post("/api/invites", { password, missions: ["MIS-ALPHA"] })).json().token;
      await viewer.session();
      viewerId = (await viewer.post("/api/register", { username: "viewer", password, token: invitation })).json().user.id;
      await viewer.session();
      assert.equal((await viewer.get("/api/session")).json().user.role, "viewer");
    });
    await check("invitation cannot be replayed or used for account self-promotion", async () => {
      await anonymous.post("/api/register", { username: "intruder", password, token: invitation }, 403);
      await viewer.post("/api/invites", { password, missions: ["MIS-BRAVO"] }, 403);
      await viewer.get("/api/users", 403); await viewer.get("/api/activity", 403);
    });
    await check("expired invitation cannot create a viewer", async () => {
      const expired = (await owner.post("/api/invites", { password, missions: ["MIS-ALPHA"] })).json().token;
      consoleApp.auth.db.prepare("UPDATE invites SET expires=0").run();
      await anonymous.post("/api/register", { username: "expiredviewer", password, token: expired }, 403);
    });
    await check("absolute session expiry denies old cookies and permits fresh login", async () => {
      for (const row of consoleApp.auth.db.prepare("SELECT * FROM sessions").all()) {
        const value = JSON.parse(row.value);
        if (value.userId === viewerId) {
          value.startedAt = Date.now() - 9 * 60 * 60 * 1000;
          consoleApp.auth.db.prepare("UPDATE sessions SET value=? WHERE digest=?").run(JSON.stringify(value), row.digest);
        }
      }
      await viewer.get("/api/evidence", 401); await viewer.session();
      await viewer.post("/api/login", { username: "viewer", password }); await viewer.session();
    });
    await check("mission-filter and guessed artifact IDs cannot escape viewer scope", async () => {
      const all = (await owner.get("/api/evidence")).json(), scoped = (await viewer.get("/api/evidence")).json();
      assert.equal(scoped.total, 1); assert.equal(scoped.entries[0].mission_id, "MIS-ALPHA");
      assert.equal((await viewer.get("/api/evidence?mission=MIS-BRAVO")).json().total, 0);
      const bravo = all.entries.find(item => item.mission_id === "MIS-BRAVO");
      await viewer.get(`/api/evidence/${bravo.id}?manifest=${all.manifest_sha256}`, 404);
      await viewer.get(`/api/evidence/${scoped.entries[0].id}?manifest=${scoped.manifest_sha256}&review=true`, 403);
    });
    await check("foreign repository namespaces are never listed", async () => {
      const other = path.join(root, "other"); fs.mkdirSync(other);
      assert.equal(spawnSync("git", ["init", "--quiet", other]).status, 0);
      writeRepositoryArtifact({ ...base, repositoryPath: other, artifactId: "FOREIGN", payload: { secret: "other-repository" } });
      assert.equal((await owner.get("/api/evidence")).json().total, 2);
    });
    await check("snapshot and pagination cursors fail closed after manifest change", async () => {
      const old = (await viewer.get("/api/evidence")).json();
      writeRepositoryArtifact({ ...base, artifactId: "OUT-SECOND", payload: { second: true } });
      await viewer.get(`/api/evidence/${old.entries[0].id}?manifest=${old.manifest_sha256}`, 409);
      await viewer.get(`/api/evidence?cursor=${old.manifest_sha256}.1`, 409);
      await viewer.get("/api/evidence?cursor=not-valid", 409);
    });
    await check("unknown approval endpoints cannot bypass exact owner review", async () => {
      const result = await owner.post("/api/approve", { actor: "USER", decision: "approve" }, 404);
      assert.equal(result.json().approval_authorized, false);
      const session = await owner.session(); assert.equal(session.tool_execution_authorized, false);
    });
    await check("real retained order proposal inspection replays controller history without adopting", async () => {
      const support = require("./order-adoption-fixtures/support");
      const env = support.environment(), original = consoleApp;
      try {
        support.propose(env);
        consoleApp = await createConsole({ repository: env.options.repository, artifactRoot: env.options.artifactRoot,
          stateDir: path.join(root, "review-private"), port: 4317 });
        await consoleApp.app.ready();
        const reviewer = client(); await reviewer.session();
        await reviewer.post("/api/setup", { username: "reviewowner", password, token: consoleApp.auth.createBootstrap() });
        await reviewer.session();
        const listing = (await reviewer.get("/api/evidence?kind=order-adoption-proposals")).json();
        assert.equal(listing.total, 1);
        const inspected = (await reviewer.get(`/api/evidence/${listing.entries[0].id}?manifest=${listing.manifest_sha256}&review=true`)).json();
        assert.equal(inspected.review.status, "awaiting_review"); assert.equal(inspected.review.freshness, "expired");
        assert.equal(inspected.review.record, null); assert.equal(inspected.approval_authorized, false);
        assert.deepEqual(inspected.review.proposal.request.plan, env.plan);
      } finally {
        if (consoleApp !== original) await consoleApp.app.close();
        consoleApp = original; fs.rmSync(env.root, { force: true, recursive: true });
      }
    });
    await check("digest substitution and symlink content are denied", async () => {
      const current = (await owner.get("/api/evidence")).json(), entry = current.entries.find(item => item.artifact_id === "OUT-ALPHA");
      const bytes = fs.readFileSync(stored.artifact_path);
      try {
        fs.writeFileSync(stored.artifact_path, "tampered");
        await owner.get(`/api/evidence/${entry.id}?manifest=${current.manifest_sha256}`, 409);
        fs.unlinkSync(stored.artifact_path);
        const outside = path.join(root, "outside.json"); fs.writeFileSync(outside, bytes);
        fs.symlinkSync(outside, stored.artifact_path);
        await owner.get(`/api/evidence/${entry.id}?manifest=${current.manifest_sha256}`, 409);
      } finally {
        if (fs.existsSync(stored.artifact_path) || fs.lstatSync(path.dirname(stored.artifact_path)).isDirectory()) {
          try { fs.unlinkSync(stored.artifact_path); } catch (error) { if (error.code !== "ENOENT") throw error; }
        }
        fs.writeFileSync(stored.artifact_path, bytes);
      }
    });
    await check("reauthenticated deactivation revokes existing sessions immediately", async () => {
      await owner.post("/api/users/deactivate", { userId: viewerId, password });
      await viewer.get("/api/evidence", 401);
      assert.equal((await viewer.session()).user, null);
      await viewer.post("/api/login", { username: "viewer", password }, 401);
      const ownerId = (await owner.session()).user.id;
      await owner.post("/api/users/deactivate", { userId: ownerId, password }, 403);
    });
    await check("authentication audit is queryable without passwords or invitation tokens", async () => {
      const response = await owner.get("/api/activity"), text = response.body;
      assert(!text.includes(password)); assert(!text.includes(invitation)); assert(!text.includes(bootstrap));
      assert(response.json().entries.some(entry => entry.action === "viewer_deactivated"));
    });
    await check("untrusted artifacts are returned as JSON text with restrictive browser headers", async () => {
      const page = await owner.get("/"); assert.match(page.headers["content-security-policy"], /default-src 'none'/);
      assert.match(page.headers["content-security-policy"], /frame-ancestors 'none'/);
      assert.equal(page.headers["x-content-type-options"], "nosniff"); assert.equal(page.headers["cache-control"], "no-store");
      assert(page.body.includes("/app.js")); assert(!page.body.includes("onclick="));
      await owner.get("/icons/shield-check.svg"); await owner.get("/../../operator.sqlite", 404);
      assert.match((await owner.get("/licenses/lucide.txt")).body, /Copyright \(c\) 2013-present Cole Bemis/);
    });
    await check("secrets live outside repositories in private non-link files", async () => {
      assert.equal(fs.statSync(stateDir).mode & 0o077, 0); assert.equal(fs.statSync(path.join(stateDir, "operator.sqlite")).mode & 0o077, 0);
      const unsafe = path.join(root, "unsafe"); fs.mkdirSync(unsafe, { mode: 0o755 });
      await assert.rejects(openAuthStore(unsafe, "a".repeat(64)), /CONSOLE_STATE_PERMISSIONS/);
      const link = path.join(root, "state-link"); fs.symlinkSync(stateDir, link);
      await assert.rejects(openAuthStore(link, "a".repeat(64)), /CONSOLE_STATE_SYMLINK/);
      await assert.rejects(createConsole({ repository, stateDir: path.join(repository, "secrets"), port: 4317 }), /CONSOLE_STATE_LOCATION_UNSAFE/);
      await assert.rejects(createConsole({ repository, stateDir: path.join(root, "other", "secrets"), port: 4317 }), /CONSOLE_STATE_LOCATION_UNSAFE/);
    });
    await check("persistent account store is pinned to its exact repository and artifact root", async () => {
      await assert.rejects(openAuthStore(stateDir, "f".repeat(64)), /CONSOLE_STORE_BINDING_OR_SCHEMA_MISMATCH/);
    });
    await check("pre-existing hardlinked authentication databases are denied", async () => {
      const linkedState = path.join(root, "hardlinked-state"); fs.mkdirSync(linkedState, { mode: 0o700 });
      const linked = path.join(linkedState, "operator.sqlite"); fs.linkSync(path.join(stateDir, "operator.sqlite"), linked);
      try { await assert.rejects(openAuthStore(linkedState, "a".repeat(64)), /CONSOLE_PRIVATE_FILE_UNSAFE/); }
      finally { fs.unlinkSync(linked); }
    });
    await check("logout destroys the old session instead of leaving reusable authority", async () => {
      const stolen = new Map(owner.jar); await owner.post("/api/logout", {}); await owner.get("/api/evidence", 401);
      const replay = client(); for (const [key, value] of stolen) replay.jar.set(key, value);
      await replay.get("/api/evidence", 401);
    });
    await check("login endpoint has a finite request limit", async () => {
      const limited = client(); await limited.session();
      let rateLimited = false;
      for (let index = 0; index < 10; index++) {
        const result = await limited.request("POST", "/api/login", { username: "missing", password }, { remoteAddress: "127.0.0.2" });
        if (result.statusCode === 429) { rateLimited = true; break; }
        assert.equal(result.statusCode, 401, result.body);
      }
      assert(rateLimited);
    });
    await consoleApp.app.close(); consoleApp = null;
    await check("accounts and scope survive restart without reusing browser sessions as approval", async () => {
      consoleApp = await createConsole({ repository, artifactRoot, stateDir, port: 4317 }); await consoleApp.app.ready();
      const restarted = client(); assert.equal((await restarted.session()).initialized, true);
      assert.equal((await restarted.post("/api/login", { username: "owner", password })).json().user.role, "owner");
      await restarted.session(); assert.equal((await restarted.get("/api/evidence")).json().total, 3);
    });
    for (const provider of ["codex-skills", ".claude/skills"]) {
      await check(`${provider} wrapper starts outside the doctrine checkout and never logs setup secrets`, async () => {
        const privateRoot = path.join(root, provider === "codex-skills" ? "codex-private" : "claude-private");
        const child = spawn(process.execPath, [path.join(__dirname, provider, "controls-doctrine-operator/scripts/serve_controls_operator.js"),
          "--repository", repository, "--state-dir", privateRoot, "--port", "0"],
        { cwd: root, env: { ...process.env, CANNAE_OS_HOME: __dirname }, stdio: ["ignore", "pipe", "pipe"], shell: false });
        let log = "", timer;
        const closed = new Promise(resolve => child.once("close", resolve));
        try {
          const url = await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error("CONSOLE_FIXTURE_START_TIMEOUT")), 30000);
            child.on("error", reject);
            child.on("close", () => reject(new Error("CONSOLE_FIXTURE_EARLY_EXIT")));
            child.stdout.on("data", bytes => { log += bytes.toString(); const found = /Controls Operator: (http:\/\/127\.0\.0\.1:[0-9]+\/)/.exec(log); if (found) resolve(found[1]); });
            child.stderr.on("data", bytes => { log += bytes.toString(); });
          });
          clearTimeout(timer);
          const response = await fetch(new URL("/api/session", url));
          assert.equal(response.status, 200); assert.equal((await response.json()).initialized, false);
          const setup = new URL(fs.readFileSync(path.join(privateRoot, "setup-link.txt"), "utf8").trim());
          assert(!log.includes(setup.hash.slice("#setup=".length)));
          assert.equal(fs.statSync(path.join(privateRoot, "setup-link.txt")).mode & 0o077, 0);
          assert.equal((await fetch(new URL("/api/evidence", url))).status, 401);
        } finally {
          clearTimeout(timer); child.kill("SIGTERM");
          const killTimer = setTimeout(() => child.kill("SIGKILL"), 10000);
          const code = await closed; clearTimeout(killTimer); assert.equal(code, 0);
        }
      });
    }
  } finally {
    if (consoleApp) await consoleApp.app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ total: results.length, passed: results.filter(item => item.ok).length,
    failed: results.filter(item => !item.ok).length, results }, null, 2));
  if (results.some(item => !item.ok)) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { main };
