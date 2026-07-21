#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  comparativeAttestationDigest,
  createComparativeEvaluationAttestation,
  evaluateComparativeAttestationQuorum,
  verifyComparativeEvaluationAttestation
} = require("./comparative-evaluation-attestation");
const { publicKeyId } = require("./verification-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function keyFixture(id, group, repositoryKey) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    verifier: {
      id,
      key_id: publicKeyId(publicKeyPem),
      public_key_pem: publicKeyPem,
      independence_group: group,
      status: "active",
      allowed_repository_keys: [repositoryKey],
      allowed_execution_origins: ["remote"],
      allowed_attestation_types: ["verification_receipt", "comparative_evaluation_report"],
      valid_from: "2026-07-22T08:00:00+09:00",
      valid_until: "2026-07-22T18:00:00+09:00"
    }
  };
}

const reportPath = path.join(__dirname, "sample-payloads", "valid-comparative-evaluation-report.json");
const reportBytes = fs.readFileSync(reportPath);
const report = JSON.parse(reportBytes);
const repositoryKey = report.repository_binding.repository_key;
const verifierA = keyFixture("VERIFIER-Comparative-A", "provider-a", repositoryKey);
const verifierB = keyFixture("VERIFIER-Comparative-B", "provider-b", repositoryKey);
const trustPolicy = {
  schema_version: "0.1",
  type: "VerifierTrustPolicy",
  id: "VTP-Comparative-001",
  repository_binding: report.repository_binding,
  policy_version: 1,
  quorum: {
    minimum_valid_attestations: 2,
    minimum_independence_groups: 2,
    require_distinct_key_ids: true,
    max_attestation_age_seconds: 900
  },
  verifiers: [verifierA.verifier, verifierB.verifier],
  created_at: "2026-07-22T08:00:00+09:00",
  expires_at: "2026-07-22T18:00:00+09:00"
};
const reportReference = {
  artifact_id: report.id,
  relative_path: `repositories/${repositoryKey}/missions/${report.mission_id}/C1/comparative-evaluation-reports/${report.id}.json`,
  sha256: sha256(reportBytes)
};

function sign(key, invocationId) {
  return createComparativeEvaluationAttestation({
    report,
    reportReference,
    verifier: key.verifier,
    privateKeyPem: key.privateKeyPem,
    executionOrigin: "remote",
    invocationId,
    nonce: `${invocationId}-nonce`,
    issuedAt: "2026-07-22T09:20:00+09:00",
    expiresAt: "2026-07-22T09:30:00+09:00"
  });
}

const attestationA = sign(verifierA, "INV-Comparative-A");
const attestationB = sign(verifierB, "INV-Comparative-B");
const baseline = report.executions.baseline.observation.subject;
const candidate = report.executions.candidate.observation.subject;
const expectations = {
  reportId: report.id,
  reportRelativePath: reportReference.relative_path,
  reportSha256: reportReference.sha256,
  reportContentSha256: report.report_sha256,
  planId: report.plan_ref.artifact_id,
  evaluationSetId: report.evaluation_set_ref.artifact_id,
  campaignId: report.campaign_id,
  missionId: report.mission_id,
  cycleNumber: report.cycle_number,
  targetType: report.target_type,
  baselineCandidateId: baseline.candidate_id,
  baselineRevision: baseline.revision,
  candidateId: candidate.candidate_id,
  candidateRevision: candidate.revision,
  evaluatorId: report.evaluator.evaluator_id,
  evaluatorInvocationId: report.evaluator.invocation_id,
  repositoryKey,
  repositoryFingerprint: report.repository_binding.identity_fingerprint,
  maxAttestationAgeSeconds: 900
};
const now = "2026-07-22T09:21:00+09:00";

assert.strictEqual(validatePayload(trustPolicy, "verifier-trust-policy").valid, true);
assert.strictEqual(validatePayload(attestationA, "comparative-evaluation-attestation").valid, true);
assert.strictEqual(verifyComparativeEvaluationAttestation(attestationA, trustPolicy, expectations, now).valid, true);
console.log("PASS signed comparative report binds a trusted verifier to the exact persisted artifact");

const quorum = evaluateComparativeAttestationQuorum([attestationA, attestationB], trustPolicy, expectations, trustPolicy.quorum, now);
assert.strictEqual(quorum.valid, true, JSON.stringify(quorum, null, 2));
assert.strictEqual(quorum.key_ids.length, 2);
assert.strictEqual(quorum.independence_groups.length, 2);
console.log("PASS two trusted keys from independent groups satisfy comparative quorum");

const duplicate = evaluateComparativeAttestationQuorum([attestationA, attestationA], trustPolicy, expectations, trustPolicy.quorum, now);
assert.strictEqual(duplicate.valid, false);
assert(duplicate.codes.includes("COMPARATIVE_ATTESTATION_DUPLICATE_ID"));
assert(duplicate.codes.includes("COMPARATIVE_ATTESTATION_VERIFIER_DIVERSITY_NOT_MET"));
console.log("PASS duplicate comparative evidence cannot satisfy signer diversity");

const tampered = clone(attestationA);
tampered.envelope.payload = `${tampered.envelope.payload.slice(0, -4)}AAAA`;
tampered.attestation_sha256 = comparativeAttestationDigest(tampered);
const tamperedResult = verifyComparativeEvaluationAttestation(tampered, trustPolicy, expectations, now);
assert.strictEqual(tamperedResult.valid, false);
assert(tamperedResult.codes.includes("COMPARATIVE_ATTESTATION_SIGNATURE_INVALID"));
console.log("PASS signed comparative statement tampering is rejected");

const expired = evaluateComparativeAttestationQuorum([attestationA, attestationB], trustPolicy, expectations, trustPolicy.quorum, "2026-07-22T09:31:00+09:00");
assert.strictEqual(expired.valid, false);
assert(expired.codes.includes("COMPARATIVE_ATTESTATION_EXPIRED_OR_NOT_YET_VALID"));
console.log("PASS expired comparative attestations cannot be replayed");

for (const [name, expectedKey] of [
  ["persisted report hash", "reportSha256"],
  ["report self-digest", "reportContentSha256"],
  ["comparison plan", "planId"],
  ["evaluation set", "evaluationSetId"],
  ["campaign", "campaignId"],
  ["baseline revision", "baselineRevision"],
  ["candidate revision", "candidateRevision"],
  ["evaluator invocation", "evaluatorInvocationId"],
  ["repository fingerprint", "repositoryFingerprint"]
]) {
  const wrong = { ...expectations, [expectedKey]: expectedKey.toLowerCase().includes("sha256") || expectedKey === "repositoryFingerprint" ? "0".repeat(64) : `WRONG-${expectedKey}` };
  const result = verifyComparativeEvaluationAttestation(attestationA, trustPolicy, wrong, now);
  assert.strictEqual(result.valid, false, name);
  assert(result.codes.includes("COMPARATIVE_ATTESTATION_EXPECTATION_MISMATCH"), name);
}
console.log("PASS report, plan, set, lineage, evaluator, campaign, and repository rebinding are rejected");

const wrongOriginPolicy = clone(trustPolicy);
wrongOriginPolicy.verifiers[0].allowed_execution_origins = ["local"];
const wrongOrigin = verifyComparativeEvaluationAttestation(attestationA, wrongOriginPolicy, expectations, now);
assert.strictEqual(wrongOrigin.valid, false);
assert(wrongOrigin.codes.includes("COMPARATIVE_ATTESTATION_ORIGIN_UNTRUSTED"));
console.log("PASS an origin claim outside verifier policy is rejected");

const wrongPurposePolicy = clone(trustPolicy);
wrongPurposePolicy.verifiers[0].allowed_attestation_types = ["verification_receipt"];
const wrongPurpose = verifyComparativeEvaluationAttestation(attestationA, wrongPurposePolicy, expectations, now);
assert.strictEqual(wrongPurpose.valid, false);
assert(wrongPurpose.codes.includes("COMPARATIVE_ATTESTATION_PURPOSE_UNAUTHORIZED"));
console.log("PASS a key trusted only for receipt evidence cannot sign comparative evidence");

const cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-comparative-attestation-cli-"));
try {
  const policyPath = path.join(cliRoot, "policy.json");
  const copiedReportPath = path.join(cliRoot, "report.json");
  const privateKeyPath = path.join(cliRoot, "verifier-key.pem");
  fs.writeFileSync(policyPath, `${JSON.stringify(trustPolicy, null, 2)}\n`);
  fs.writeFileSync(copiedReportPath, reportBytes);
  fs.writeFileSync(privateKeyPath, verifierA.privateKeyPem, { mode: 0o600 });
  const args = [
    "comparative-evaluation-attestation-runner.js", policyPath, copiedReportPath,
    "--verifier", verifierA.verifier.id,
    "--private-key", privateKeyPath,
    "--report-relative-path", reportReference.relative_path,
    "--report-sha256", reportReference.sha256,
    "--invocation-id", "INV-Comparative-CLI",
    "--origin", "remote",
    "--issued-at", "2026-07-22T09:20:00+09:00",
    "--expires-at", "2026-07-22T09:30:00+09:00"
  ];
  const remoteRun = spawnSync("node", args, { cwd: __dirname, encoding: "utf8" });
  assert.strictEqual(remoteRun.status, 0, remoteRun.stderr || remoteRun.stdout);
  const cliAttestation = JSON.parse(remoteRun.stdout);
  assert.strictEqual(verifyComparativeEvaluationAttestation(cliAttestation, trustPolicy, expectations, now).valid, true);
  console.log("PASS comparative attestation CLI emits portable signed evidence");

  if (process.platform !== "win32") {
    fs.chmodSync(privateKeyPath, 0o644);
    const insecureKeyRun = spawnSync("node", args, { cwd: __dirname, encoding: "utf8" });
    assert.strictEqual(insecureKeyRun.status, 2);
    assert(/must not be readable/.test(insecureKeyRun.stderr));
  }
  console.log("PASS comparative attestation CLI rejects an exposed private-key file");
} finally {
  fs.rmSync(cliRoot, { recursive: true, force: true });
}

console.log("Comparative evaluation attestation fixtures: 12/12 passed");
