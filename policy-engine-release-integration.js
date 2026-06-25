#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { integrate: integrateAuthority } = require("./policy-engine-authority-integration");
const { run: runReleaseReview, evaluateRelease, normalizeReleaseTarget, contextFilterTarget } = require("./release-review-runner");
const { filterContext } = require("./context-filter-prototype/context-filter");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function loadRelative(baseDir, filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(baseDir, filePath), "utf8"));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function loadAuthorityBundle(bundle, baseDir) {
  if (bundle.authority_bundle_path) {
    return loadRelative(baseDir, bundle.authority_bundle_path);
  }
  if (bundle.authority_bundle) {
    return bundle.authority_bundle;
  }
  const { release, ...authorityBundle } = bundle;
  return authorityBundle;
}

function loadReview(release, baseDir) {
  if (release.review) return release.review;
  if (release.review_path) return loadRelative(baseDir, release.review_path);
  return null;
}

function evaluateReleaseGate(release, authorityBundle, baseDir) {
  const required = release.required === true || authorityBundle.approval_scope?.release_review_required === true;
  const target = release.target || "FINAL_OUTPUT";

  if (!required) {
    return {
      required: false,
      valid: true,
      target,
      decision: "not_required",
      reasons: [],
      findings: []
    };
  }

  const review = loadReview(release, baseDir);
  if (!review) {
    return {
      required,
      valid: false,
      target,
      decision: "missing",
      reasons: ["MISSING_RELEASE_REVIEW"],
      findings: []
    };
  }

  let releaseResult;
  if (release.review_path && release.context_items_path) {
    releaseResult = runReleaseReview(
      path.resolve(baseDir, release.review_path),
      path.resolve(baseDir, release.context_items_path),
      target
    );
  } else {
    const contextItems = release.context_items || loadRelative(baseDir, release.context_items_path);
    const filtered = filterContext(contextItems, contextFilterTarget(target));
    const findings = evaluateRelease(review, filtered, target);
    releaseResult = {
      valid: !findings.some(item => item.severity === "error" || item.severity === "critical"),
      finding_count: findings.length,
      target,
      findings
    };
  }

  const reasons = [];
  const missionId = authorityBundle.tool_request?.mission_id || authorityBundle.approval_scope?.mission_id;
  const approvingDecision = review.decision === "approve" || review.decision === "approve_redacted";
  const requestedTarget = normalizeReleaseTarget(target);
  const reviewedTarget = normalizeReleaseTarget(review.target);

  if (!approvingDecision) reasons.push("RELEASE_REVIEW_NOT_APPROVING");
  if (missionId && review.mission_id !== missionId) reasons.push("RELEASE_REVIEW_MISSION_MISMATCH");
  if (!requestedTarget || !reviewedTarget || requestedTarget !== reviewedTarget) reasons.push("RELEASE_REVIEW_TARGET_MISMATCH");
  if (!releaseResult.valid) reasons.push("RELEASE_REVIEW_FAILED");

  return {
    required,
    valid: releaseResult.valid && reasons.length === 0,
    target,
    review_id: review.id,
    decision: review.decision,
    finding_count: releaseResult.finding_count,
    findings: releaseResult.findings,
    reasons
  };
}

function integrate(bundle, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const authorityBundle = loadAuthorityBundle(bundle, baseDir);
  const authorityDecision = integrateAuthority(authorityBundle);
  const release = evaluateReleaseGate(bundle.release || {}, authorityBundle, baseDir);
  const releaseBlocked = authorityDecision.allowed === true && release.required && !release.valid;
  const blocked = authorityDecision.blocked || releaseBlocked;
  const finalDecision = authorityDecision.blocked
    ? authorityDecision.final_decision
    : releaseBlocked
      ? "blocked_pending_release_review"
      : release.required
        ? "allow_scoped_execution_and_release"
        : authorityDecision.final_decision;

  return {
    allowed: !blocked,
    blocked,
    final_decision: finalDecision,
    authority: authorityDecision,
    release_review: release,
    reasons: unique([
      ...(authorityDecision.reasons || []),
      ...(release.reasons || [])
    ])
  };
}

function main() {
  const [, , bundleArg] = process.argv;
  if (!bundleArg) {
    console.error("Usage: node policy-engine-release-integration.js <bundle.json>");
    process.exit(2);
  }

  const bundlePath = path.resolve(process.cwd(), bundleArg);
  const bundle = readJson(bundlePath);
  const decision = integrate(bundle, { baseDir: path.dirname(bundlePath) });
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  process.exit(decision.blocked ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { integrate, evaluateReleaseGate };
