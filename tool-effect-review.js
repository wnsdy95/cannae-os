#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { resolveRepository, verifyRepositoryArtifacts, writeRepositoryArtifact } = require("./repository-artifact-store");
const { dispatchStatus, inputDigest } = require("./dispatch-runtime-controller");
const { computeRepositoryState, receiptDigest } = require("./verification-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertValid(payload, type) {
  const result = validatePayload(payload, type);
  const failures = result.issues.filter(item => ["error", "critical"].includes(item.severity));
  if (failures.length) throw new Error(`${type}: ${failures.map(item => item.code).join(", ")}`);
}

function sameRef(left, right) {
  return Boolean(left && right && left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path && left.sha256 === right.sha256);
}

function sameState(left, right) {
  return Boolean(left && right && left.head_commit === right.head_commit &&
    left.worktree_fingerprint === right.worktree_fingerprint);
}

function sameBinding(left, right) {
  return Boolean(left && right && left.repository_key === right.repository_key &&
    left.identity_fingerprint === right.identity_fingerprint);
}

function view(options) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(options.artifactRoot || path.join(repository.root, ".cannae", "artifacts"));
  const verification = verifyRepositoryArtifacts({ repositoryPath: repository.root, artifactRoot });
  if (!verification.valid) throw new Error("TOOL_EFFECT_ARTIFACT_STORE_INVALID");
  const manifestPath = path.join(artifactRoot, "repositories", repository.key, "manifest.json");
  return { repository, artifactRoot, manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")) };
}

function load(current, ref, kind, type, scope) {
  const entries = current.manifest.artifacts.filter(entry => sameRef(entry, ref));
  if (entries.length !== 1) throw new Error("TOOL_EFFECT_REFERENCE_NOT_RETAINED");
  const entry = entries[0];
  if (entry.kind !== kind || (scope && (entry.mission_id !== scope.mission_id || entry.wave_id !== scope.wave_id))) {
    throw new Error("TOOL_EFFECT_REFERENCE_SCOPE_MISMATCH");
  }
  const absolutePath = path.resolve(current.artifactRoot, entry.relative_path);
  const realRoot = fs.realpathSync(current.artifactRoot);
  const realPath = fs.realpathSync(absolutePath);
  if (!realPath.startsWith(`${realRoot}${path.sep}`)) throw new Error("TOOL_EFFECT_REFERENCE_PATH_INVALID");
  const bytes = fs.readFileSync(realPath);
  if (digest(bytes) !== ref.sha256) throw new Error("TOOL_EFFECT_REFERENCE_DIGEST_MISMATCH");
  const payload = JSON.parse(bytes.toString("utf8"));
  if (type) {
    assertValid(payload, type);
    if (payload.id !== ref.artifact_id) throw new Error("TOOL_EFFECT_REFERENCE_ID_MISMATCH");
  }
  return { payload, entry };
}

function inspectToolEffects(options, references) {
  if (!references || Object.keys(references).sort().join(",") !== "scope_ref,verification_plan_ref,verification_receipt_ref") {
    throw new Error("TOOL_EFFECT_REVIEW_REFERENCES_INVALID");
  }
  const current = view(options);
  const scope = load(current, references.scope_ref, "tool-effect-scopes", "tool-effect-scope").payload;
  // Require the scope itself to occupy the mission/wave it claims.
  load(current, references.scope_ref, "tool-effect-scopes", "tool-effect-scope", scope);
  const checkpoint = load(current, scope.checkpoint_ref, "agent-execution-checkpoints", "agent-execution-checkpoint", scope).payload;
  const lease = load(current, scope.lease_ref, "agent-dispatch-leases", "agent-dispatch-lease", scope).payload;
  const admission = load(current, scope.admission_ref, "tool-admission-events", "tool-admission-event", scope).payload;
  const admittedCheckpoint = load(current, admission.checkpoint_ref, "agent-execution-checkpoints", "agent-execution-checkpoint", scope).payload;
  const plan = load(current, references.verification_plan_ref, "verification-plans", "verification-plan", scope).payload;
  const receipt = load(current, references.verification_receipt_ref, "verification-receipts", "verification-receipt", scope).payload;
  const at = options.now || new Date().toISOString();
  if (!Number.isFinite(Date.parse(at))) throw new Error("TOOL_EFFECT_REVIEW_TIME_INVALID");
  const codes = new Set();
  const requireCondition = (condition, code) => { if (!condition) codes.add(code); };
  const scopeSha256 = inputDigest(scope);
  const binding = { repository_key: current.repository.key, identity_fingerprint: current.repository.identity_fingerprint };

  requireCondition([scope, lease, plan, receipt].every(item => sameBinding(item.repository_binding, binding)), "TOOL_EFFECT_REPOSITORY_MISMATCH");
  requireCondition([lease, checkpoint, admission].every(item => item.mission_id === scope.mission_id &&
    item.wave_id === scope.wave_id && item.agent_id === scope.agent_id), "TOOL_EFFECT_SUBJECT_MISMATCH");
  requireCondition(sameRef(checkpoint.lease_ref, scope.lease_ref) && sameRef(admission.lease_ref, scope.lease_ref) &&
    sameRef(checkpoint.tool_admission_ref, scope.admission_ref) && admission.decision === "allow" &&
    sameRef(admittedCheckpoint.lease_ref, scope.lease_ref) && admittedCheckpoint.sequence < checkpoint.sequence &&
    sameRef(lease.tool_policy_ref, admission.tool_policy_ref) &&
    [checkpoint, admission].every(item => item.provider === lease.provider && inputDigest(item.session_binding) === inputDigest(lease.session_binding)) &&
    checkpoint.checkpoint_kind === "post_tool" && checkpoint.execution_result.external_effects === "unknown",
  "TOOL_EFFECT_INVOCATION_MISMATCH");
  const status = dispatchStatus(options, { missionId: scope.mission_id, waveId: scope.wave_id, agentId: scope.agent_id });
  requireCondition(status.leases.some(item => item.lease_id === lease.id &&
    item.unresolved_effect_checkpoint_refs.some(ref => sameRef(ref, scope.checkpoint_ref))), "TOOL_EFFECT_UNKNOWN_CHECKPOINT_NOT_CURRENT");

  requireCondition(plan.mission_id === scope.mission_id && receipt.mission_id === scope.mission_id &&
    plan.candidate_id === scope.id && receipt.candidate_id === scope.id &&
    plan.candidate_revision === scopeSha256 && receipt.candidate_revision === scopeSha256,
  "TOOL_EFFECT_VERIFICATION_SCOPE_MISMATCH");
  requireCondition(receipt.plan_id === plan.id && receipt.plan_sha256 === digest(`${JSON.stringify(plan, null, 2)}\n`) &&
    receipt.campaign_id === plan.campaign_id && receipt.cycle_number === plan.cycle_number &&
    receipt.receipt_sha256 === receiptDigest(receipt), "TOOL_EFFECT_RECEIPT_BINDING_MISMATCH");
  requireCondition(sameState(scope.expected_repository_state, plan.expected_repository_state) &&
    sameState(plan.expected_repository_state, receipt.repository_state_before) &&
    sameState(receipt.repository_state_before, receipt.repository_state_after) &&
    sameState(receipt.repository_state_after, computeRepositoryState(current.repository.root)) && receipt.repository_state_unchanged,
  "TOOL_EFFECT_REPOSITORY_STATE_MISMATCH");
  requireCondition(receipt.overall_status === "passed" && receipt.runner.shell_used === false &&
    receipt.checks.every(check => check.status === "passed"), "TOOL_EFFECT_VERIFICATION_FAILED");
  const times = [admittedCheckpoint.recorded_at, admission.decided_at, checkpoint.recorded_at, scope.created_at, plan.created_at, receipt.started_at, receipt.finished_at, at].map(Date.parse);
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
      // Binding arguments make the exact scope available to the selected checker;
      // they do not prove that its code inspected every external resource.
      const hasPair = (flag, value) => check && check.args.filter(arg => arg === flag).length === 1 &&
        check.args[check.args.indexOf(flag) + 1] === value;
      requireCondition(Boolean(check && hasPair("--effect-scope", references.scope_ref.relative_path) &&
        hasPair("--effect-scope-sha256", scopeSha256)), "TOOL_EFFECT_CHECK_SCOPE_NOT_BOUND");
    }
    for (const ref of resource.evidence_refs) {
      const evidence = load(current, ref, "tool-effect-observations", null, scope);
      requireCondition(Date.parse(evidence.entry.created_at) >= Date.parse(checkpoint.recorded_at) &&
        Date.parse(evidence.entry.created_at) <= Date.parse(scope.created_at), "TOOL_EFFECT_OBSERVATION_TIME_INVALID");
    }
  }
  requireCondition(usedChecks.size === checks.size && [...usedChecks].every(id => checks.has(id)), "TOOL_EFFECT_CHECK_SET_MISMATCH");

  const report = {
    schema_version: "0.1", type: "ToolEffectReview",
    id: `TER-${inputDigest({ references, at }).slice(0, 32)}`,
    mission_id: scope.mission_id, wave_id: scope.wave_id, agent_id: scope.agent_id,
    repository_binding: binding, ...references, scope_sha256: scopeSha256,
    status: codes.size ? "blocked" : "evidence_bound", reason_codes: [...codes].sort(), reviewed_at: at,
    effects_settled: false, scope_completeness_verified: false, verifier_identity_verified: false,
    user_decision_verified: false, tool_execution_authorized: false, release_authorized: false
  };
  assertValid(report, "tool-effect-review");
  return report;
}

function reviewToolEffects(options, references) {
  const frozenRefs = JSON.parse(JSON.stringify(references));
  const report = inspectToolEffects(options, frozenRefs);
  if (!options.writeArtifact) return report;
  const result = writeRepositoryArtifact({
    repositoryPath: options.repository, artifactRoot: options.artifactRoot,
    missionId: report.mission_id, waveId: report.wave_id, kind: "tool-effect-reviews",
    artifactId: report.id, payload: report, createdAt: report.reviewed_at,
    publicationGuard: () => {
      const refreshed = inspectToolEffects(options, frozenRefs);
      if (inputDigest({ ...refreshed, id: report.id, reviewed_at: report.reviewed_at }) !== inputDigest(report)) {
        throw new Error("TOOL_EFFECT_REVIEW_CHANGED_BEFORE_PUBLICATION");
      }
      return true;
    }
  });
  return { ...report, artifact: result };
}

function main() {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let index = 0; index < args.length; index += 1) {
      const flag = args[index];
      if (flag === "--write-artifact") { options.writeArtifact = true; continue; }
      const key = { "--repository": "repository", "--artifact-root": "artifactRoot", "--references": "references" }[flag];
      if (!key || !args[index + 1] || options[key]) throw new Error(`Invalid or repeated argument: ${flag}`);
      options[key] = args[++index];
    }
    if (!options.repository || !options.references) throw new Error("Usage: node tool-effect-review.js --repository <repo> --references <refs.json> [--artifact-root <root>] [--write-artifact]");
    const result = reviewToolEffects(options, JSON.parse(fs.readFileSync(options.references, "utf8")));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === "blocked") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (require.main === module) main();
module.exports = { reviewToolEffects };
