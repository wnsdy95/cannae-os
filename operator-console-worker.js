const { parentPort, workerData } = require("node:worker_threads");
try {
  const { configuration, user, request } = workerData;
  let result;
  if (request.action === "operations") {
    result = require("./operational-cop").queryOperationalCop(configuration, user, request);
  } else if (request.action === "prepare-decision") {
    if (user.role !== "owner") throw Object.assign(new Error("CONSOLE_OWNER_REQUIRED"), { statusCode: 403 });
    result = require("./operator-consent-executor").prepareOrderDecision(configuration, request);
  } else if (request.action === "execute-decision") {
    result = require("./operator-consent-executor").executeOrderDecision(configuration, request.challenge_id);
  } else if (request.action === "inspect-decision") {
    if (user.role !== "owner") throw Object.assign(new Error("CONSOLE_OWNER_REQUIRED"), { statusCode: 403 });
    result = require("./operator-consent-outcome").inspectDecisionOutcome(configuration, request.challenge_id);
  } else if (request.action === "prepare-reconciliation") {
    if (user.role !== "owner") throw Object.assign(new Error("CONSOLE_OWNER_REQUIRED"), { statusCode: 403 });
    result = require("./operator-reconciliation-executor").prepareReconciliation(configuration, request.action_id, request.manifest);
  } else if (request.action === "execute-reconciliation") {
    if (user.role !== "owner") throw Object.assign(new Error("CONSOLE_OWNER_REQUIRED"), { statusCode: 403 });
    result = require("./operator-reconciliation-executor").executeReconciliation(configuration, request.reconciliation_id);
  } else result = require("./operator-console-evidence").queryEvidence(configuration, user, request);
  parentPort.postMessage({ result });
} catch (error) {
  parentPort.postMessage({ error: /^CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "CONSOLE_EVIDENCE_UNAVAILABLE",
    reason_codes: [...new Set(error.message.match(/\b(?:CONSOLE|ORDER|OPERATOR)_[A-Z_]+\b/g) || [])].slice(0, 8), statusCode: error.statusCode || 409 });
}
