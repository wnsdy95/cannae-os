#!/usr/bin/env node
const assert = require("node:assert/strict");
const { EventEmitter, once } = require("node:events");
const { Worker } = require("node:worker_threads");
const { createWorkerQueue } = require("./operator-console-jobs");

const results = [];
const tick = () => new Promise(resolve => setImmediate(resolve));
const observe = promise => {
  const state = { settled: false };
  state.done = promise.then(value => { Object.assign(state, { settled: true, value }); },
    error => { Object.assign(state, { settled: true, error }); });
  return state;
};
class ControlledWorker extends EventEmitter {
  constructor() { super(); this.stopCount = 0; this.termination = "pending"; }
  terminate() {
    this.stopCount++; this.emit("stop-requested");
    if (this.termination === "throw") throw new Error("synthetic termination failure");
    if (this.termination === "reject") return Promise.reject(new Error("synthetic termination failure"));
    if (this.termination === "resolve") return Promise.resolve(1);
    return new Promise(resolve => { this.resolveTermination = resolve; });
  }
  exit(code = 1) { this.emit("exit", code); this.resolveTermination?.(code); }
}
function controlled(options = {}) {
  const workers = [];
  const queue = createWorkerQueue("unused-fixture-worker", { ...options, createWorker: () => {
    const worker = new ControlledWorker(); workers.push(worker); return worker;
  } });
  return { queue, workers };
}
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); }
}
async function main() {
  await check("a success message cannot release a caller or start the next worker before observed exit", async () => {
    const { queue, workers } = controlled();
    const first = observe(queue.submit({ request: 1 })), second = observe(queue.submit({ request: 2 }));
    await tick(); workers[0].emit("message", { result: { decision_recorded: true } }); await tick();
    assert.equal(first.settled, false); assert.equal(workers.length, 1);
    assert.deepEqual(queue.status(), { closing: false, outstanding: 2, worker_active: true, exit_pending: true, termination_failed: false });
    workers[0].exit(); await first.done; await tick(); assert.equal(workers.length, 2);
    workers[1].emit("message", { result: "second" }); workers[1].exit(); await second.done;
    assert.deepEqual(first.value, { decision_recorded: true }); assert.equal(second.value, "second"); await queue.close();
  });
  for (const event of ["error", "messageerror"]) {
    await check(`${event} keeps the scheduler fence until actual exit`, async () => {
      const { queue, workers } = controlled(); const request = observe(queue.submit({})); await tick();
      workers[0].emit(event, new Error("synthetic worker failure")); await tick();
      assert.equal(request.settled, false); assert.equal(queue.status().outstanding, 1);
      workers[0].exit(); await request.done; assert.equal(request.error.message, "CONSOLE_QUERY_FAILED"); await queue.close();
    });
  }
  await check("timeout requests termination but does not assert stopped or release capacity", async () => {
    const { queue, workers } = controlled({ timeout: 20, limit: 1 }); const request = observe(queue.submit({})); await tick();
    await once(workers[0], "stop-requested");
    assert.equal(request.settled, false); assert.equal(queue.status().exit_pending, true);
    assert.throws(() => queue.submit({}), /CONSOLE_QUERY_BUSY/);
    workers[0].emit("message", { result: "late result cannot replace timeout" }); workers[0].exit(); await request.done;
    assert.equal(request.error.message, "CONSOLE_QUERY_TIMEOUT"); assert.equal(request.error.statusCode, 503); await queue.close();
  });
  for (const termination of ["throw", "reject", "resolve"]) {
    await check(`terminate ${termination} without an exit event never discharges the active worker`, async () => {
      const { queue, workers } = controlled({ limit: 1 }); const request = observe(queue.submit({})); await tick();
      workers[0].termination = termination; workers[0].emit("message", { result: "received" }); await tick();
      assert.equal(request.settled, false); assert.equal(queue.status().worker_active, true);
      assert.equal(queue.status().termination_failed, termination !== "resolve");
      assert.throws(() => queue.submit({}), /CONSOLE_QUERY_BUSY/);
      const close = observe(queue.close()); await tick(); assert.equal(close.settled, false); assert.equal(workers[0].stopCount, 1);
      workers[0].exit(); await close.done; await request.done; assert.equal(request.value, "received");
      assert.equal(queue.status().worker_active, false); assert.equal(queue.status().outstanding, 0);
    });
  }
  await check("shutdown drains only after exit and cancels queued work without spawning it", async () => {
    const { queue, workers } = controlled(); const first = observe(queue.submit({})), second = observe(queue.submit({})); await tick();
    const close = observe(queue.close()); assert.throws(() => queue.submit({}), /CONSOLE_QUERY_CLOSED/); await tick();
    assert.equal(close.settled, false); assert.equal(first.settled, false); assert.equal(second.settled, false);
    workers[0].exit(); await close.done; await first.done; await second.done;
    assert.equal(first.error.message, "CONSOLE_QUERY_CLOSED"); assert.equal(second.error.message, "CONSOLE_QUERY_CLOSED");
    assert.equal(workers.length, 1); assert.equal(queue.status().outstanding, 0); await queue.close();
  });
  await check("the default eight-job cap includes queued work and shutdown before start spawns nothing", async () => {
    const { queue, workers } = controlled(); const requests = Array.from({ length: 8 }, () => observe(queue.submit({})));
    assert.throws(() => queue.submit({}), /CONSOLE_QUERY_BUSY/); assert.equal(queue.status().outstanding, 8);
    await queue.close(); for (const request of requests) { await request.done; assert.equal(request.error.message, "CONSOLE_QUERY_CLOSED"); }
    assert.equal(workers.length, 0); assert.equal(queue.status().outstanding, 0);
  });
  await check("unexpected exit without a result denies rather than inferring success", async () => {
    const { queue, workers } = controlled(); const request = observe(queue.submit({})); await tick(); workers[0].exit(0);
    await request.done; assert.equal(request.error.message, "CONSOLE_QUERY_FAILED"); await queue.close();
  });
  await check("a worker error after its message invalidates the provisional success", async () => {
    const { queue, workers } = controlled(); const request = observe(queue.submit({})); await tick();
    workers[0].emit("message", { result: "not yet accepted" }); workers[0].emit("error", new Error("late worker failure"));
    assert.equal(request.settled, false); workers[0].exit(); await request.done;
    assert.equal(request.error.message, "CONSOLE_QUERY_FAILED"); await queue.close();
  });
  await check("one outcome and one termination request survive duplicate or late messages", async () => {
    const { queue, workers } = controlled(); const request = observe(queue.submit({})); await tick();
    workers[0].emit("message", { error: "CONSOLE_SCOPE_CHANGED", statusCode: 409, reason_codes: ["ORDER_CHANGED", "private-error-detail", null] });
    workers[0].emit("message", { result: "late success" }); workers[0].emit("error", new Error("later error"));
    assert.equal(workers[0].stopCount, 1); workers[0].exit(); await request.done;
    assert.equal(request.error.message, "CONSOLE_SCOPE_CHANGED"); assert.equal(request.error.statusCode, 409);
    assert.deepEqual(request.error.reason_codes, ["ORDER_CHANGED"]); await queue.close();
  });
  for (const message of [null, "not a result", {}, { result: "ambiguous", error: "CONSOLE_ERROR" },
    { error: "" }, { error: "private-internal-detail", statusCode: 200 }]) {
    await check(`malformed or unsafe worker response is denied (${JSON.stringify(message)})`, async () => {
      const { queue, workers } = controlled(); const request = observe(queue.submit({})); await tick();
      workers[0].emit("message", message); assert.equal(request.settled, false); workers[0].exit(); await request.done;
      assert.equal(request.error.message, "CONSOLE_QUERY_FAILED"); assert.equal(request.error.statusCode, 503); await queue.close();
    });
  }
  await check("constructor failure releases no running worker and permits the next bounded request", async () => {
    let attempts = 0, worker;
    const queue = createWorkerQueue("unused", { createWorker: () => {
      if (attempts++ === 0) throw new Error("synthetic construction failure");
      worker = new ControlledWorker(); return worker;
    } });
    const first = observe(queue.submit({})), second = observe(queue.submit({})); await first.done; await tick();
    assert(first.error); worker.emit("message", { result: "next" }); worker.exit(); await second.done;
    assert.equal(second.value, "next"); assert.equal(queue.status().outstanding, 0); await queue.close();
  });
  await check("real message-producing worker is terminal before the caller receives its result", async () => {
    let worker;
    const queue = createWorkerQueue("unused", { createWorker: () => {
      worker = new Worker(`const { parentPort } = require("node:worker_threads");
        parentPort.postMessage({ result: "real result" });
        setInterval(() => {}, 1000);`, { eval: true }); return worker;
    } });
    const value = await queue.submit({}); assert.equal(value, "real result"); assert.equal(worker.threadId, -1);
    assert.equal(queue.status().outstanding, 0); await queue.close();
  });
  await check("real unresponsive worker is terminal before timeout is returned", async () => {
    let worker;
    const queue = createWorkerQueue("unused", { timeout: 100, createWorker: () => {
      worker = new Worker("while (true) {}", { eval: true }); return worker;
    } });
    await assert.rejects(queue.submit({}), /CONSOLE_QUERY_TIMEOUT/); assert.equal(worker.threadId, -1); await queue.close();
  });
  await check("actual console shutdown keeps its private service ownership until worker exit", async () => {
    const fs = require("node:fs"), path = require("node:path"), cookie = require("@fastify/cookie");
    const module = require("./operator-console-jobs"), original = module.createWorkerQueue;
    const workers = []; let notifyStarted;
    const started = new Promise(resolve => { notifyStarted = resolve; });
    module.createWorkerQueue = filename => original(filename, { createWorker: () => {
      const worker = new ControlledWorker(); workers.push(worker); notifyStarted(worker); return worker;
    } });
    const { createConsole } = require("./operator-console-server"); module.createWorkerQueue = original;
    const env = require("./order-adoption-fixtures/support").environment(Date.now());
    let service, worker;
    try {
      const configuration = { repository: env.options.repository, artifactRoot: env.options.artifactRoot,
        stateDir: path.join(fs.realpathSync(env.root), "private"), port: 4317 };
      service = await createConsole(configuration); await service.app.ready();
      const jar = new Map(); let csrf;
      async function request(method, url, payload) {
        const response = await service.app.inject({ method, url, payload, headers: { host: "127.0.0.1:4317",
          cookie: [...jar].map(([key, value]) => cookie.serialize(key, value)).join("; "),
          ...(method === "POST" ? { origin: "http://127.0.0.1:4317", "x-csrf-token": csrf } : {}) } });
        for (const item of response.cookies) jar.set(item.name, item.value);
        return response;
      }
      csrf = (await request("GET", "/api/session")).json().csrf_token;
      assert.equal((await request("POST", "/api/setup", { username: "fixtureowner", password: "synthetic-worker-shutdown-password-2026",
        token: service.auth.createBootstrap() })).statusCode, 200);
      const first = observe(request("GET", "/api/evidence")); worker = await started;
      const second = observe(request("GET", "/api/evidence")); await tick();
      const stopped = once(worker, "stop-requested"), close = observe(service.app.close()); await stopped; await tick();
      assert.equal(first.settled, false); assert.equal(close.settled, false);
      assert.equal(Number(service.auth.db.prepare("SELECT value FROM meta WHERE key='operator-service-pid'").get().value), process.pid);
      assert.equal(workers.length, 1);
      worker.exit(); await close.done; await first.done; await second.done;
      assert.equal(first.value.statusCode, 503); assert.equal(second.value.statusCode, 503);
      assert.equal(first.value.json().error, "CONSOLE_QUERY_CLOSED"); assert.equal(workers.length, 1);
      assert.throws(() => service.auth.db.prepare("SELECT 1"), /not open|closed/i);
      service = await createConsole(configuration); await service.app.ready();
      assert.equal(service.auth.hasOwner(), true);
    } finally {
      module.createWorkerQueue = original;
      if (worker && service) worker.exit();
      if (service) await service.app.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  });
  console.log(JSON.stringify({ total: results.length, passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length, results }, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 1;
}
if (require.main === module) {
  const watchdog = setTimeout(() => {
    console.error("CONSOLE_WORKER_FIXTURE_DID_NOT_FINISH"); process.exit(1);
  }, 60000);
  main().then(() => { clearTimeout(watchdog); }, error => {
    clearTimeout(watchdog); console.error(error.stack); process.exitCode = 1;
  });
}
