const crypto = require("crypto");
const { inputDigest } = require("./dispatch-runtime-controller");
const { receiptDigest } = require("./verification-runner");

function sameState(left, right) {
  return Boolean(left && right && left.head_commit === right.head_commit &&
    left.worktree_fingerprint === right.worktree_fingerprint);
}

// This binds inspection records, not verifier authenticity, scope completeness, or consent.
function appraiseEffectInspection({ scope, scopeRef, plan, receipt, at, repositoryState,
  predecessorTimes, observationSince, loadObservation, requireCondition }) {
  const scopeSha256 = inputDigest(scope);
  const planSha256 = crypto.createHash("sha256").update(`${JSON.stringify(plan, null, 2)}\n`).digest("hex");
  requireCondition(plan.mission_id === scope.mission_id && receipt.mission_id === scope.mission_id &&
    plan.candidate_id === scope.id && receipt.candidate_id === scope.id &&
    plan.candidate_revision === scopeSha256 && receipt.candidate_revision === scopeSha256,
  "TOOL_EFFECT_VERIFICATION_SCOPE_MISMATCH");
  requireCondition(receipt.plan_id === plan.id && receipt.plan_sha256 === planSha256 &&
    receipt.campaign_id === plan.campaign_id && receipt.cycle_number === plan.cycle_number &&
    receipt.receipt_sha256 === receiptDigest(receipt), "TOOL_EFFECT_RECEIPT_BINDING_MISMATCH");
  requireCondition(sameState(scope.expected_repository_state, plan.expected_repository_state) &&
    sameState(plan.expected_repository_state, receipt.repository_state_before) &&
    sameState(receipt.repository_state_before, receipt.repository_state_after) &&
    sameState(receipt.repository_state_after, repositoryState) && receipt.repository_state_unchanged,
  "TOOL_EFFECT_REPOSITORY_STATE_MISMATCH");
  requireCondition(receipt.overall_status === "passed" && receipt.runner.shell_used === false &&
    receipt.checks.every(check => check.status === "passed"), "TOOL_EFFECT_VERIFICATION_FAILED");
  const times = [...predecessorTimes, scope.created_at, plan.created_at, receipt.started_at, receipt.finished_at, at].map(Date.parse);
  requireCondition(times.every((time, index) => Number.isFinite(time) && (!index || time >= times[index - 1])) &&
    Date.parse(at) < Date.parse(scope.expires_at), "TOOL_EFFECT_EVIDENCE_TIME_INVALID");

  const checks = new Map(plan.checks.map(check => [check.id, check]));
  requireCondition(checks.size === plan.checks.length && new Set(receipt.checks.map(check => check.id)).size === receipt.checks.length &&
    receipt.checks.length === plan.checks.length, "TOOL_EFFECT_CHECK_SET_MISMATCH");
  for (const observed of receipt.checks) {
    const expected = checks.get(observed.id);
    requireCondition(Boolean(expected && inputDigest(observed.argv) === inputDigest([expected.executable, ...expected.args]) &&
      observed.working_directory === expected.working_directory && inputDigest(observed.expected_exit_codes) === inputDigest(expected.expected_exit_codes) &&
      expected.expected_exit_codes.includes(observed.exit_code) && !observed.signal), "TOOL_EFFECT_CHECK_RESULT_MISMATCH");
  }
  const usedChecks = new Set();
  for (const resource of scope.resources) {
    requireCondition(resource.disposition !== "unresolved", "TOOL_EFFECT_RESOURCE_UNRESOLVED");
    for (const id of resource.check_ids) {
      usedChecks.add(id);
      const check = checks.get(id);
      const hasPair = (flag, value) => check && check.args.filter(arg => arg === flag).length === 1 &&
        check.args[check.args.indexOf(flag) + 1] === value;
      requireCondition(Boolean(check && hasPair("--effect-scope", scopeRef.relative_path) &&
        hasPair("--effect-scope-sha256", scopeSha256)), "TOOL_EFFECT_CHECK_SCOPE_NOT_BOUND");
    }
    for (const ref of resource.evidence_refs) {
      const evidence = loadObservation(ref);
      requireCondition(Date.parse(evidence.entry.created_at) >= Date.parse(observationSince) &&
        Date.parse(evidence.entry.created_at) <= Date.parse(scope.created_at), "TOOL_EFFECT_OBSERVATION_TIME_INVALID");
    }
  }
  requireCondition(usedChecks.size === checks.size && [...usedChecks].every(id => checks.has(id)), "TOOL_EFFECT_CHECK_SET_MISMATCH");
}

module.exports = { appraiseEffectInspection };
