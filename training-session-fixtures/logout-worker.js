const { parentPort, workerData } = require("node:worker_threads"), artifacts = require("../repository-artifact-store");
const original = artifacts.writeRepositoryArtifact, gate = new Int32Array(workerData.gate);
artifacts.writeRepositoryArtifact = options => {
  const result = original(options);
  if (options.kind === "task-training-session-authorizations") {
    parentPort.postMessage({ phase: "authorization_written" });
    const waited = Atomics.wait(gate, 0, 0, 60000);
    if (waited === "timed-out" || Atomics.load(gate, 0) !== 1) throw new Error("CONSOLE_TRAINING_FIXTURE_LOGOUT_NOT_OBSERVED");
  }
  return result;
};
try {
  const result = require("../operator-training-session-executor").executeTrainingSession(workerData.configuration, workerData.id);
  parentPort.postMessage({ phase: "terminal", returned: true, result });
} catch (error) { parentPort.postMessage({ phase: "terminal", returned: false, error: error.message, reason_codes: error.reason_codes }); }
