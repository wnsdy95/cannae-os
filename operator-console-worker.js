const { parentPort, workerData } = require("node:worker_threads");
try {
  const { configuration, user, request } = workerData;
  let result;
  if (["force-registry", "prepare-force-registry", "execute-force-registry"].includes(request.action)) {
    if (user.role !== "owner") throw Object.assign(new Error("CONSOLE_OWNER_REQUIRED"), { statusCode: 403 });
    const core = require("./force-registry-controller");
    if (request.action === "force-registry") result = core.inspection(configuration, configuration.forceRegistryPublicKey);
    else if (request.action === "prepare-force-registry") result = core.prepareReview(configuration, request);
    else result = require("./operator-force-registry-executor").executeForceRegistryChange(configuration, request.challenge_id);
  } else if (request.action === "operations") {
    result = require("./operational-cop").queryOperationalCop(configuration, user, request);
  } else if (request.action === "prepare-semantic") {
    if (user.role !== "owner") throw Object.assign(new Error("CONSOLE_OWNER_REQUIRED"), { statusCode: 403 });
    result = require("./operator-semantic-service").prepareSemanticEvaluation(configuration, request);
  } else if (request.action === "prepare-order-analysis") {
    if (user.role !== "owner") throw Object.assign(new Error("CONSOLE_OWNER_REQUIRED"), { statusCode: 403 });
    result = require("./operator-semantic-service").prepareOrderAnalysis(configuration, request);
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
    reason_codes: [...new Set([...(error.reason_codes || []), ...(error.message.match(/\b(?:CONSOLE|ORDER|OPERATOR|SEMANTIC|FORCE_REGISTRY|FORCE_ENTITY)_[A-Z_]+\b/g) || [])])].slice(0, 8), statusCode: error.statusCode || 409 });
}
