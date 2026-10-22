const { parentPort, workerData } = require("node:worker_threads");
try {
  const { queryEvidence } = require("./operator-console-evidence");
  parentPort.postMessage({ result: queryEvidence(workerData.configuration, workerData.user, workerData.request) });
} catch (error) {
  parentPort.postMessage({ error: /^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "CONSOLE_EVIDENCE_UNAVAILABLE",
    statusCode: error.statusCode || 409 });
}
