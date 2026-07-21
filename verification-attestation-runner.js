#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createVerificationAttestation } = require("./verification-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");

function parseArgs(argv) {
  const positional = [];
  const options = { executionOrigin: "remote", writeArtifact: false, overwrite: false };
  const valueOptions = new Set([
    "verifier", "private-key", "receipt-relative-path", "receipt-sha256", "origin", "invocation-id",
    "nonce", "issued-at", "expires-at", "repository", "artifact-root"
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

function assertPrivateKeyPermissions(privateKeyPath) {
  const stat = fs.lstatSync(privateKeyPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Verifier private key must be a regular file.");
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new Error("Verifier private key must not be readable or writable by group or other users.");
  }
}

function validationFailures(payload, type) {
  return validatePayload(payload, type).issues
    .filter(item => item.severity === "error" || item.severity === "critical");
}

function main() {
  try {
    const { positional, options } = parseArgs(process.argv.slice(2));
    if (positional.length !== 2 || !options.verifier || !options.privateKey || !options.receiptRelativePath ||
        !options.receiptSha256 || !options.invocationId) {
      throw new Error("Usage: node verification-attestation-runner.js <trust-policy.json> <receipt.json> --verifier <id> --private-key <pem> --receipt-relative-path <path> --receipt-sha256 <sha256> --invocation-id <id> [--origin local|remote] [--issued-at <time>] [--expires-at <time>] [--write-artifact --repository <repo>]");
    }
    const trustPolicy = JSON.parse(fs.readFileSync(path.resolve(positional[0]), "utf8"));
    const receipt = JSON.parse(fs.readFileSync(path.resolve(positional[1]), "utf8"));
    const policyFailures = validationFailures(trustPolicy, "verifier-trust-policy");
    const receiptFailures = validationFailures(receipt, "verification-receipt");
    if (policyFailures.length > 0 || receiptFailures.length > 0) {
      throw new Error(`Attestation input validation failed: ${[...new Set([...policyFailures, ...receiptFailures].map(item => item.code))].join(", ")}`);
    }
    const verifier = trustPolicy.verifiers.find(item => item.id === options.verifier);
    if (!verifier) throw new Error("Verifier is not present in the trust policy.");
    const privateKeyPath = path.resolve(options.privateKey);
    assertPrivateKeyPermissions(privateKeyPath);
    const issuedAt = options.issuedAt || new Date().toISOString();
    const policyMaxAgeMs = trustPolicy.quorum.max_attestation_age_seconds * 1000;
    const expiresAt = options.expiresAt || new Date(Math.min(
      Date.parse(issuedAt) + policyMaxAgeMs,
      Date.parse(verifier.valid_until),
      Date.parse(trustPolicy.expires_at)
    )).toISOString();
    const attestation = createVerificationAttestation({
      receipt,
      receiptReference: {
        artifact_id: receipt.id,
        relative_path: options.receiptRelativePath,
        sha256: options.receiptSha256
      },
      verifier,
      privateKeyPem: fs.readFileSync(privateKeyPath),
      executionOrigin: options.executionOrigin,
      invocationId: options.invocationId,
      nonce: options.nonce,
      issuedAt,
      expiresAt
    });
    const attestationFailures = validationFailures(attestation, "verification-attestation");
    if (attestationFailures.length > 0) {
      throw new Error(`Generated attestation failed validation: ${[...new Set(attestationFailures.map(item => item.code))].join(", ")}`);
    }
    if (options.writeArtifact) {
      if (!options.repository) throw new Error("--write-artifact requires --repository <repo>.");
      const repository = resolveRepository(options.repository);
      if (repository.key !== receipt.repository_binding.repository_key ||
          repository.identity_fingerprint !== receipt.repository_binding.identity_fingerprint) {
        throw new Error("Attestation target repository does not match the receipt binding.");
      }
      const result = writeRepositoryArtifact({
        repositoryPath: options.repository,
        artifactRoot: options.artifactRoot,
        missionId: receipt.mission_id,
        waveId: `C${receipt.cycle_number}`,
        kind: "verification-attestations",
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

module.exports = { assertPrivateKeyPermissions, parseArgs };
