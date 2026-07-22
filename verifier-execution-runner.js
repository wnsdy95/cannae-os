#!/usr/bin/env node

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const {
  resolveRepository,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const {
  createVerifierExecutionEvidence,
  verifyVerifierExecutionEvidence
} = require("./verifier-execution-evidence");
const { validatePayload } = require("./validator-cli-prototype/validate");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function readReferencedJson(filePath, reference, label) {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file.`);
  const bytes = fs.readFileSync(resolved);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (!reference || digest !== reference.sha256) {
    throw new Error(`${label} bytes do not match the exact artifact reference.`);
  }
  return JSON.parse(bytes.toString("utf8"));
}

function readPrivateKey(filePath) {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Private keys must be regular files.");
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new Error(`Private key permissions must be 0600 or stricter: ${resolved}`);
  }
  return fs.readFileSync(resolved, "utf8");
}

function parseArgs(argv) {
  const options = { command: argv[0], writeArtifact: false };
  if (!new Set(["create", "verify"]).has(options.command)) {
    throw new Error("Usage: node verifier-execution-runner.js <create|verify> [options]");
  }
  const values = new Set([
    "policy", "runtime-policy", "runtime-policy-ref", "evidence", "expectations", "evaluated-at",
    "verifier", "purpose", "subject-ref", "identity-evidence-ref", "repository-binding",
    "repository-state", "verification-target", "provider-identity", "invocation", "builder-private-key",
    "verifier-private-key", "issued-at", "expires-at", "evidence-id", "repository", "artifact-root",
    "mission", "wave"
  ]);
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-artifact") {
      options.writeArtifact = true;
      continue;
    }
    if (arg.startsWith("--") && values.has(arg.slice(2))) {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      options[key] = argv[index];
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function required(options, keys) {
  const missing = keys.filter(key => !options[key]);
  if (missing.length > 0) throw new Error(`Missing required options: ${missing.join(", ")}`);
}

function repositoryExpectation(repositoryPath) {
  if (!repositoryPath) return null;
  const repository = resolveRepository(repositoryPath);
  return {
    repositoryKey: repository.key,
    repositoryFingerprint: repository.identity_fingerprint
  };
}

function assertValid(payload, type) {
  const failures = validatePayload(payload, type).issues
    .filter(item => item.severity === "error" || item.severity === "critical");
  if (failures.length > 0) {
    throw new Error(`${type} validation failed: ${[...new Set(failures.map(item => item.code))].join(", ")}`);
  }
}

function create(options) {
  required(options, [
    "policy", "runtimePolicy", "runtimePolicyRef", "verifier", "purpose", "subjectRef",
    "identityEvidenceRef", "repositoryBinding", "repositoryState", "verificationTarget",
    "providerIdentity", "invocation", "builderPrivateKey", "verifierPrivateKey", "issuedAt", "expiresAt"
  ]);
  const trustPolicy = readJson(options.policy);
  const runtimePolicyReference = readJson(options.runtimePolicyRef);
  const runtimePolicy = readReferencedJson(options.runtimePolicy, runtimePolicyReference, "Runtime policy");
  assertValid(trustPolicy, "verifier-trust-policy");
  assertValid(runtimePolicy, "verifier-runtime-policy");
  const evidence = createVerifierExecutionEvidence({
    trustPolicy,
    runtimePolicy,
    runtimePolicyReference,
    verifierId: options.verifier,
    purpose: options.purpose,
    subjectReference: readJson(options.subjectRef),
    workloadIdentityEvidenceReference: readJson(options.identityEvidenceRef),
    repositoryBinding: readJson(options.repositoryBinding),
    repositoryState: readJson(options.repositoryState),
    verificationTarget: readJson(options.verificationTarget),
    providerIdentity: readJson(options.providerIdentity),
    invocation: readJson(options.invocation),
    builderPrivateKeyPem: readPrivateKey(options.builderPrivateKey),
    verifierPrivateKeyPem: readPrivateKey(options.verifierPrivateKey),
    issuedAt: options.issuedAt,
    expiresAt: options.expiresAt,
    evidenceId: options.evidenceId
  });
  const result = verifyVerifierExecutionEvidence({
    evidence,
    trustPolicy,
    runtimePolicy,
    runtimePolicyReference,
    evaluatedAt: options.issuedAt,
    expectations: repositoryExpectation(options.repository) || {}
  });
  assertValid(evidence, "verifier-execution-evidence");
  if (!result.valid) throw new Error(`Created execution evidence failed verification: ${result.codes.join(", ")}`);
  if (options.writeArtifact) {
    required(options, ["repository", "mission", "wave"]);
    const persisted = writeRepositoryArtifact({
      repositoryPath: options.repository,
      artifactRoot: options.artifactRoot,
      missionId: options.mission,
      waveId: options.wave,
      kind: "verifier-execution-evidence",
      artifactId: evidence.id,
      payload: evidence
    });
    return { evidence, verification: result, persisted };
  }
  return { evidence, verification: result };
}

function verify(options) {
  required(options, ["policy", "runtimePolicy", "runtimePolicyRef", "evidence"]);
  const evidence = readJson(options.evidence);
  const trustPolicy = readJson(options.policy);
  const runtimePolicyReference = readJson(options.runtimePolicyRef);
  const runtimePolicy = readReferencedJson(options.runtimePolicy, runtimePolicyReference, "Runtime policy");
  assertValid(evidence, "verifier-execution-evidence");
  assertValid(trustPolicy, "verifier-trust-policy");
  assertValid(runtimePolicy, "verifier-runtime-policy");
  const result = verifyVerifierExecutionEvidence({
    evidence,
    trustPolicy,
    runtimePolicy,
    runtimePolicyReference,
    evaluatedAt: options.evaluatedAt,
    expectations: {
      ...(options.expectations ? readJson(options.expectations) : {}),
      ...(repositoryExpectation(options.repository) || {})
    }
  });
  if (!result.valid) process.exitCode = 1;
  return result;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = options.command === "create" ? create(options) : verify(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { create, parseArgs, verify };
