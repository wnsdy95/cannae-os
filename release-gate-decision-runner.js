#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { integrate } = require("./policy-engine-release-integration");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function loadRelative(baseDir, relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(baseDir, relativePath), "utf8"));
}

function loadAuthorityBundle(integrationBundle, integrationBaseDir) {
  if (integrationBundle.authority_bundle_path) {
    return loadRelative(integrationBaseDir, integrationBundle.authority_bundle_path);
  }
  return integrationBundle.authority_bundle || integrationBundle;
}

function issue(code, pathName, message) {
  return { code, path: pathName, message };
}

function hasSubstantiveItems(value) {
  return Array.isArray(value) && value.some(item => !/^none$/i.test(String(item).trim()));
}

function includesAll(actual, expected) {
  return expected.every(item => actual.includes(item));
}

function evaluateReleaseGateDecision(bundle, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const integrationBundle = bundle.integration_bundle_path
    ? loadRelative(baseDir, bundle.integration_bundle_path)
    : bundle.integration_bundle;
  const event = bundle.decision_event;
  const issues = [];

  if (!integrationBundle) {
    issues.push(issue("RELEASE_GATE_MISSING_INTEGRATION_BUNDLE", "$.integration_bundle", "Fixture must include or reference the integration bundle."));
  }
  if (!event) {
    issues.push(issue("RELEASE_GATE_MISSING_DECISION_EVENT", "$.decision_event", "Fixture must include the release gate decision event."));
    return { valid: false, issue_count: issues.length, issues };
  }

  const integrationBaseDir = path.resolve(baseDir, path.dirname(bundle.integration_bundle_path || "."));
  const authorityBundle = loadAuthorityBundle(integrationBundle, integrationBaseDir);
  const expected = integrate(integrationBundle, { baseDir: integrationBaseDir });

  const toolRequest = authorityBundle.tool_request || {};
  const authority = event.authority || {};
  const release = event.release_review || {};
  const expectedRelease = expected.release_review || {};
  const expectedAuthority = expected.authority || {};

  if (event.mission_id !== toolRequest.mission_id) {
    issues.push(issue("RELEASE_GATE_MISSION_MISMATCH", "$.decision_event.mission_id", "Decision event mission must match tool request mission."));
  }
  if (event.tool_request_id !== toolRequest.id) {
    issues.push(issue("RELEASE_GATE_TOOL_REQUEST_MISMATCH", "$.decision_event.tool_request_id", "Decision event must reference the gated tool request."));
  }
  if (event.actor !== toolRequest.actor) {
    issues.push(issue("RELEASE_GATE_ACTOR_MISMATCH", "$.decision_event.actor", "Decision event actor must match the gated tool request actor."));
  }
  if (event.final_decision !== expected.final_decision) {
    issues.push(issue("RELEASE_GATE_FINAL_DECISION_MISMATCH", "$.decision_event.final_decision", "Decision event final decision must match release integration output."));
  }
  if (event.blocked !== expected.blocked) {
    issues.push(issue("RELEASE_GATE_BLOCKED_MISMATCH", "$.decision_event.blocked", "Decision event blocked flag must match release integration output."));
  }
  if (authority.allowed !== expectedAuthority.allowed || authority.blocked !== expectedAuthority.blocked || authority.final_decision !== expectedAuthority.final_decision) {
    issues.push(issue("RELEASE_GATE_AUTHORITY_SNAPSHOT_MISMATCH", "$.decision_event.authority", "Authority snapshot must match authority integration output."));
  }
  if (authority.approval_required !== expectedAuthority.approval?.required || authority.approval_valid !== expectedAuthority.approval?.valid) {
    issues.push(issue("RELEASE_GATE_APPROVAL_SNAPSHOT_MISMATCH", "$.decision_event.authority", "Approval snapshot must match authority integration output."));
  }
  if (authority.risk_acceptance_required !== expectedAuthority.risk_acceptance?.required || authority.risk_acceptance_valid !== expectedAuthority.risk_acceptance?.valid) {
    issues.push(issue("RELEASE_GATE_RISK_SNAPSHOT_MISMATCH", "$.decision_event.authority", "Risk acceptance snapshot must match authority integration output."));
  }
  if (release.required !== expectedRelease.required || release.valid !== expectedRelease.valid || release.target !== expectedRelease.target || release.review_id !== expectedRelease.review_id) {
    issues.push(issue("RELEASE_GATE_RELEASE_SNAPSHOT_MISMATCH", "$.decision_event.release_review", "Release review snapshot must match release integration output."));
  }
  if (!includesAll(event.reasons || [], expected.reasons || [])) {
    issues.push(issue("RELEASE_GATE_REASON_MISMATCH", "$.decision_event.reasons", "Decision event must retain integration reasons."));
  }
  if (!hasSubstantiveItems(event.evidence)) {
    issues.push(issue("RELEASE_GATE_WITHOUT_EVIDENCE", "$.decision_event.evidence", "Decision event must include evidence."));
  }

  return {
    valid: issues.length === 0,
    issue_count: issues.length,
    issues
  };
}

function main() {
  const [, , bundleArg] = process.argv;
  if (!bundleArg) {
    console.error("Usage: node release-gate-decision-runner.js <bundle.json>");
    process.exit(2);
  }

  const bundlePath = path.resolve(process.cwd(), bundleArg);
  const result = evaluateReleaseGateDecision(readJson(bundlePath), { baseDir: path.dirname(bundlePath) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { evaluateReleaseGateDecision };
