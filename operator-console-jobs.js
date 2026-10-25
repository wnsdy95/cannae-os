const { Worker } = require("node:worker_threads");
const { requireThat } = require("./operator-console-auth");

const failure = (code, statusCode = 503) => Object.assign(new Error(code), { statusCode });

function createWorkerQueue(filename, options = {}) {
  const limit = options.limit ?? 8, timeout = options.timeout ?? 120000;
  requireThat(Number.isInteger(limit) && limit > 0 && limit <= 128 &&
    Number.isInteger(timeout) && timeout > 0 && timeout <= 2147483647, "CONSOLE_WORKER_LIMIT_INVALID");
  const createWorker = options.createWorker || (workerData => new Worker(filename, { workerData }));
  let outstanding = 0, active = null, closing = false, tail = Promise.resolve();

  function run(workerData) {
    return new Promise((resolve, reject) => {
      const worker = createWorker(workerData);
      const job = { worker, outcome: null, stopping: false, terminationFailed: false };
      active = job;
      // A message, timeout or terminate() result is not an observed worker exit.
      // Keep the queue and its shutdown fence held until the actual exit event.
      function stop(outcome) {
        if (!job.outcome || (outcome.error && !job.outcome.error)) job.outcome = outcome;
        if (job.stopping) return;
        job.stopping = true;
        clearTimeout(timer);
        try {
          Promise.resolve(worker.terminate()).catch(() => { job.terminationFailed = true; });
        } catch { job.terminationFailed = true; }
      }
      job.stop = stop;
      const timer = setTimeout(() => stop({ error: failure("CONSOLE_QUERY_TIMEOUT") }), timeout);
      worker.once("message", message => {
        if (!message || typeof message !== "object" ||
          Object.hasOwn(message, "result") === Object.hasOwn(message, "error") ||
          (Object.hasOwn(message, "error") && (typeof message.error !== "string" || !message.error))) {
          stop({ error: failure("CONSOLE_QUERY_FAILED") }); return;
        }
        const code = typeof message.error === "string" && /^CONSOLE_[A-Z_]+$/.test(message.error) ? message.error : "CONSOLE_QUERY_FAILED";
        stop(message.error ? { error: Object.assign(failure(code,
          Number.isInteger(message.statusCode) && message.statusCode >= 400 && message.statusCode <= 599 ? message.statusCode : 503),
        { reason_codes: Array.isArray(message.reason_codes) ? message.reason_codes.filter(value =>
          typeof value === "string" && /^(?:CONSOLE|ORDER|OPERATOR|FORCE_REGISTRY|FORCE_ENTITY)_[A-Z_]+$/.test(value)).slice(0, 8) : [] }) } : { value: message.result });
      });
      worker.once("error", () => stop({ error: failure("CONSOLE_QUERY_FAILED") }));
      worker.once("messageerror", () => stop({ error: failure("CONSOLE_QUERY_FAILED") }));
      worker.once("exit", () => {
        clearTimeout(timer);
        active = null;
        const outcome = job.outcome || { error: failure("CONSOLE_QUERY_FAILED") };
        if (outcome.error) reject(outcome.error); else resolve(outcome.value);
      });
    });
  }

  function submit(workerData) {
    requireThat(!closing, "CONSOLE_QUERY_CLOSED", 503);
    requireThat(outstanding < limit, "CONSOLE_QUERY_BUSY", 429);
    outstanding++;
    const result = tail.then(() => {
      requireThat(!closing, "CONSOLE_QUERY_CLOSED", 503);
      return run(workerData);
    }).finally(() => { outstanding--; });
    tail = result.catch(() => {});
    return result;
  }

  return {
    submit,
    close() {
      closing = true;
      if (active && !active.stopping) active.stop({ error: failure("CONSOLE_QUERY_CLOSED") });
      return tail;
    },
    status() {
      return { closing, outstanding, worker_active: !!active,
        exit_pending: !!active?.stopping, termination_failed: !!active?.terminationFailed };
    }
  };
}

module.exports = { createWorkerQueue };
