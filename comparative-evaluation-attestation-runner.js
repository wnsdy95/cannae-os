#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createComparativeEvaluationAttestation } = require("./comparative-evaluation-attestation");
const { assertPrivateKeyPermissions } = require("./verification-attestation-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");

function parseArgs(argv) {
  const positional = [];
  const options = { executionOrigin: "remote", writeArtifact: false, overwrite: false };
  const valueOptions = new Set([
    "verifier", "private-key", "report-relative-path", "report-sha256", "origin", "invocation-id",
    "execution-evidence-ref", "nonce", "issued-at", "expires-at", "repository", "artifact-root"
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-artifact") { options.writeArtifact = true; continue; }
    if (arg === "--overwrite-artifact") { options.overwrite = true; continue; }
    if (arg.startsWith("--") && valueOptions.has(arg.slice(2))) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      options[key === "origin" ? "executionOrigin" : key] = argv[index];
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    positional.push(arg);
  }
  return { positional, options };
}

function validationFailures(payload, type) {
  return validatePayload(payload, type).issues
    .filter(item => item.severity === "error" || item.severity === "critical");
}

function main() {
  try {
    const { positional, options } = parseArgs(process.argv.slice(2));
    if (positional.length !== 2 || !options.verifier || !options.privateKey || !options.reportRelativePath ||
        !options.reportSha256 || !options.invocationId) {
      throw new Error("Usage: node comparative-evaluation-attestation-runner.js <trust-policy.json> <report.json> --verifier <id> --private-key <pem> --report-relative-path <path> --report-sha256 <sha256> --invocation-id <id> [--origin local|remote] [--issued-at <time>] [--expires-at <time>] [--write-artifact --repository <repo>]");
    }
    const trustPolicy = JSON.parse(fs.readFileSync(path.resolve(positional[0]), "utf8"));
    const report = JSON.parse(fs.readFileSync(path.resolve(positional[1]), "utf8"));
    const failures = [
      ...validationFailures(trustPolicy, "verifier-trust-policy"),
      ...validationFailures(report, "comparative-evaluation-report")
    ];
    if (failures.length > 0) throw new Error(`Attestation input validation failed: ${[...new Set(failures.map(item => item.code))].join(", ")}`);
    const verifier = trustPolicy.verifiers.find(item => item.id === options.verifier);
    if (!verifier) throw new Error("Verifier is not present in the trust policy.");
    if (["0.4", "0.5"].includes(trustPolicy.schema_version) && !options.executionEvidenceRef) {
      throw new Error("Execution-assured trust-policy v0.4+ requires --execution-evidence-ref <json>.");
    }
    const privateKeyPath = path.resolve(options.privateKey);
    assertPrivateKeyPermissions(privateKeyPath);
    const issuedAt = options.issuedAt || new Date().toISOString();
    const expiresAt = options.expiresAt || new Date(Math.min(
      Date.parse(issuedAt) + trustPolicy.quorum.max_attestation_age_seconds * 1000,
      Date.parse(verifier.valid_until),
      Date.parse(trustPolicy.expires_at)
    )).toISOString();
    const attestation = createComparativeEvaluationAttestation({
      report,
      reportReference: { artifact_id: report.id, relative_path: options.reportRelativePath, sha256: options.reportSha256 },
      verifier,
      privateKeyPem: fs.readFileSync(privateKeyPath),
      executionOrigin: options.executionOrigin,
      invocationId: options.invocationId,
      executionEvidenceReference: options.executionEvidenceRef ? JSON.parse(fs.readFileSync(path.resolve(options.executionEvidenceRef), "utf8")) : undefined,
      nonce: options.nonce,
      issuedAt,
      expiresAt
    });
    const attestationFailures = validationFailures(attestation, "comparative-evaluation-attestation");
    if (attestationFailures.length > 0) {
      throw new Error(`Generated attestation failed validation: ${[...new Set(attestationFailures.map(item => item.code))].join(", ")}`);
    }
    if (options.writeArtifact) {
      if (!options.repository) throw new Error("--write-artifact requires --repository <repo>.");
      const repository = resolveRepository(options.repository);
      if (repository.key !== report.repository_binding.repository_key ||
          repository.identity_fingerprint !== report.repository_binding.identity_fingerprint) {
        throw new Error("Attestation target repository does not match the report binding.");
      }
      const result = writeRepositoryArtifact({
        repositoryPath: options.repository,
        artifactRoot: options.artifactRoot,
        missionId: report.mission_id,
        waveId: `C${report.cycle_number}`,
        kind: "comparative-evaluation-attestations",
        artifactId: attestation.id,
        payload: attestation,
        createdAt: attestation.issued_at,
        overwrite: options.overwrite
      });
      console.error(`Artifact written: ${result.relative_path}`);
    }
    process.stdout.write(`${JSON.stringify(attestation, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { parseArgs };
