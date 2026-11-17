#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { Worker, isMainThread, workerData, parentPort } = require("node:worker_threads");
const { openAuthStore } = require("./operator-console-auth");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const value = generation => ({ __fastifySessionMetadata: { generation }, startedAt: Date.now(), marker: generation });
const call = (store, method, ...args) => new Promise((resolve, reject) => store[method](...args, (error, result) => error ? reject(error) : resolve(result)));
async function worker() {
  const auth = await openAuthStore(workerData.root, workerData.binding);
  parentPort.once("message", async () => {
    try { await call(auth.sessionStore, "compareAndSet", "stable", "race-start", value(workerData.next)); parentPort.postMessage({ result: "updated" }); }
    catch (error) { parentPort.postMessage({ result: error.code || error.message }); }
    finally { auth.close(); parentPort.close(); }
  });
  parentPort.postMessage({ ready: true });
}
async function main() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-session-cas-"))), binding = "a".repeat(64);
  const auth = await openAuthStore(root, binding), store = auth.sessionStore; let passed = 0;
  const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
  try {
    await test("atomic generation replacement removes the old approval lookup", async () => {
      await call(store, "set", "stable", value("first"));
      await call(store, "compareAndSet", "stable", "first", value("second"));
      assert.equal((await call(store, "get", "stable")).marker, "second");
      assert.equal(auth.db.prepare("SELECT digest FROM sessions WHERE digest=?").get(hash("first")), undefined);
      assert(auth.db.prepare("SELECT digest FROM sessions WHERE digest=?").get(hash("second")));
      await assert.rejects(call(store, "compareAndSet", "stable", "first", value("stale")), { code: "ENOENT" });
      assert.equal((await call(store, "get", "stable")).marker, "second");
    });
    await test("destroyed and expired sessions cannot be revived by in-flight saves", async () => {
      await call(store, "destroy", "stable");
      await assert.rejects(call(store, "compareAndSet", "stable", "second", value("stale")), { code: "ENOENT" });
      assert.equal(await call(store, "get", "stable"), null);
      assert.equal(auth.db.prepare("SELECT COUNT(*) AS n FROM session_store_keys").get().n, 0);
      await call(store, "set", "stable", value("expired"));
      auth.db.prepare("UPDATE sessions SET expires=0").run();
      await assert.rejects(call(store, "compareAndSet", "stable", "expired", value("renewed")), { code: "ENOENT" });
      assert.equal(await call(store, "get", "stable"), null);
    });
    await test("legacy rows without metadata retain read compatibility and rotate once", async () => {
      auth.db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(hash("legacy"), JSON.stringify({ marker: "legacy" }), Date.now() + 60000);
      assert.equal((await call(store, "get", "legacy")).marker, "legacy");
      await call(store, "compareAndSet", "legacy", "legacy", value("modern"));
      assert.equal((await call(store, "get", "legacy")).marker, "modern");
      assert.equal(auth.db.prepare("SELECT digest FROM sessions WHERE digest=?").get(hash("legacy")), undefined);
      await assert.rejects(call(store, "compareAndSet", "legacy", "legacy", value("stale")), { code: "ENOENT" });
    });
    await test("a colliding generation rolls back instead of overwriting another session", async () => {
      await call(store, "set", "other", value("occupied"));
      await assert.rejects(call(store, "compareAndSet", "legacy", "modern", value("occupied")));
      assert.equal((await call(store, "get", "legacy")).marker, "modern");
      assert.equal((await call(store, "get", "other")).marker, "occupied");
    });
    await test("two SQLite writers cannot both replace one expected generation", async () => {
      await call(store, "set", "stable", value("race-start"));
      const workers = ["race-one", "race-two"].map(next => new Worker(__filename, { workerData: { root, binding, next } }));
      const ready = [], results = [], exited = [];
      for (const w of workers) {
        ready.push(new Promise((resolve, reject) => { w.once("error", reject); w.once("message", message => { assert.equal(message.ready, true); resolve(); }); }));
        results.push(new Promise((resolve, reject) => { w.once("error", reject); w.on("message", message => { if (message.result) resolve(message.result); }); }));
        exited.push(new Promise((resolve, reject) => w.once("exit", code => code === 0 ? resolve() : reject(new Error(`worker exit ${code}`)))));
      }
      const timer = setTimeout(() => { for (const w of workers) w.terminate(); }, 30000);
      try {
        await Promise.all(ready); workers.forEach(w => w.postMessage("race"));
        assert.deepEqual((await Promise.all(results)).sort(), ["ENOENT", "updated"]);
        await Promise.all(exited);
        assert(["race-one", "race-two"].includes((await call(store, "get", "stable")).marker));
      } finally { clearTimeout(timer); await Promise.all(workers.map(w => w.terminate())); }
    });
    await test("the actual session plugin rotates public cookies while keeping store identity", async () => {
      const app = require("fastify")();
      try {
        await app.register(require("@fastify/cookie"));
        await app.register(require("@fastify/session"), { secret: auth.secret, store, saveUninitialized: false, cookie: { secure: false } });
        app.get("/start", async request => { request.session.marker = "initial"; await request.session.save(); return { generation: request.session.sessionId, store: request.session.sessionStoreId }; });
        app.get("/rotate", async request => { await request.session.regenerate(); request.session.marker = "rotated"; await request.session.save(); return { generation: request.session.sessionId, store: request.session.sessionStoreId }; });
        app.get("/read", request => ({ marker: request.session.marker || null }));
        app.get("/logout", async request => { await request.session.destroy(); return {}; });
        const start = await app.inject("/start"); assert.equal(start.statusCode, 200);
        const oldCookie = `sessionId=${encodeURIComponent(start.cookies[0].value)}`;
        const rotated = await app.inject({ url: "/rotate", headers: { cookie: oldCookie } }); assert.equal(rotated.statusCode, 200);
        assert.equal(start.json().store, rotated.json().store); assert.notEqual(start.json().generation, rotated.json().generation);
        assert.equal(auth.db.prepare("SELECT digest FROM sessions WHERE digest=?").get(hash(start.json().generation)), undefined);
        const currentCookie = `sessionId=${encodeURIComponent(rotated.cookies[0].value)}`;
        assert.equal((await app.inject({ url: "/read", headers: { cookie: oldCookie } })).json().marker, null);
        assert.equal((await app.inject({ url: "/read", headers: { cookie: currentCookie } })).json().marker, "rotated");
        assert.equal((await app.inject({ url: "/logout", headers: { cookie: currentCookie } })).statusCode, 200);
        assert.equal((await app.inject({ url: "/read", headers: { cookie: currentCookie } })).json().marker, null);
      } finally { await app.close(); }
    });
    console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0 }));
  } finally { auth.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
(isMainThread ? main() : worker()).catch(error => { console.error(error); process.exitCode = 1; });
