#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  createSigstoreIdentityBindingStatement,
  createSigstoreVerifierIdentityEvidence,
  verifySigstoreVerifierIdentityEvidence
} = require("./sigstore-verifier-identity-evidence");
const { canonicalJsonBytes } = require("./sigstore-trusted-root");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");

function parseArgs(argv) {
  const options = { purposes: [], statementOnly: false, writeArtifact: false };
  const values = new Set([
    "policy", "trusted-root", "verifier", "private-key", "bundle", "evidence-id", "purpose",
    "nonce", "issued-at", "expires-at", "repository", "artifact-root", "mission", "wave"
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-artifact") {
      options.writeArtifact = true;
      continue;
    }
    if (arg === "--statement-only") {
      options.statementOnly = true;
      continue;
    }
    if (arg.startsWith("--") && values.has(arg.slice(2))) {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      if (arg === "--purpose") options.purposes.push(argv[index]);
      else {
        const key = arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
        options[key] = argv[index];
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  for (const field of ["policy", "trustedRoot", "verifier", "evidenceId", "repository"]) {
    if (!options[field]) throw new Error(`--${field.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)} is required.`);
  }
  if (!options.statementOnly && !options.privateKey) throw new Error("--private-key is required unless --statement-only is used.");
  if (options.statementOnly && (!options.issuedAt || !options.expiresAt || !options.nonce)) {
    throw new Error("--statement-only requires explicit --issued-at, --expires-at, and --nonce so assembly can reproduce the exact bytes.");
  }
  if (options.purposes.length === 0) throw new Error("At least one --purpose is required.");
  if (options.writeArtifact && (!options.mission || !options.wave)) {
    throw new Error("--write-artifact requires --mission and --wave.");
  }
  return options;
}

function assertPrivateKeyPermissions(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error("Verifier private key must be a regular non-symlink file with no group or other permissions.");
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const policy = JSON.parse(fs.readFileSync(path.resolve(options.policy), "utf8"));
    const trustedRoot = JSON.parse(fs.readFileSync(path.resolve(options.trustedRoot), "utf8"));
    const policyValidation = validatePayload(policy, "verifier-trust-policy");
    const rootValidation = validatePayload(trustedRoot, "sigstore-trusted-root");
    if (!policyValidation.valid || !rootValidation.valid) {
      const codes = [...policyValidation.issues, ...rootValidation.issues].map(item => item.code);
      throw new Error(`Policy or Sigstore TrustedRoot failed validation: ${codes.join(", ")}`);
    }
    const verifier = (policy.verifiers || []).find(item => item.id === options.verifier);
    if (!verifier) throw new Error(`Verifier ${options.verifier} is not present in the trust policy.`);
    const repository = resolveRepository(options.repository);
    const issuedAt = options.issuedAt || new Date().toISOString();
    const expiresAt = options.expiresAt || new Date(Date.parse(issuedAt) + 240000).toISOString();
    if (options.statementOnly) {
      const statement = createSigstoreIdentityBindingStatement({
        evidenceId: options.evidenceId,
        verifier,
        trustedRootArtifact: trustedRoot,
        repositoryBinding: {
          repository_key: repository.key,
          identity_fingerprint: repository.identity_fingerprint
        },
        purposes: options.purposes,
        nonce: options.nonce,
        issuedAt,
        expiresAt
      });
      process.stdout.write(canonicalJsonBytes(statement));
      return;
    }
    const privateKeyPath = path.resolve(options.privateKey);
    assertPrivateKeyPermissions(privateKeyPath);
    const bundle = options.bundle ? JSON.parse(fs.readFileSync(path.resolve(options.bundle), "utf8")) : undefined;
    const evidence = await createSigstoreVerifierIdentityEvidence({
      evidenceId: options.evidenceId,
      verifier,
      trustPolicy: policy,
      trustedRootArtifact: trustedRoot,
      repositoryBinding: {
        repository_key: repository.key,
        identity_fingerprint: repository.identity_fingerprint
      },
      purposes: options.purposes,
      nonce: options.nonce,
      issuedAt,
      expiresAt,
      verifierPrivateKeyPem: fs.readFileSync(privateKeyPath),
      bundle
    });
    const result = verifySigstoreVerifierIdentityEvidence({
      evidence,
      trustPolicy: policy,
      verifier,
      trustedRootArtifact: trustedRoot,
      repository,
      evaluatedAt: new Date().toISOString()
    });
    const validation = validatePayload(evidence, "sigstore-verifier-identity-evidence");
    if (!result.valid || !validation.valid) {
      throw new Error(`Generated Sigstore identity evidence failed validation: ${[...result.codes, ...validation.issues.map(item => item.code)].join(", ")}`);
    }
    if (options.writeArtifact) {
      const written = writeRepositoryArtifact({
        repositoryPath: options.repository,
        artifactRoot: options.artifactRoot,
        missionId: options.mission,
        waveId: options.wave,
        kind: "sigstore-verifier-identity-evidence",
        artifactId: evidence.id,
        payload: evidence,
        createdAt: evidence.issued_at
      });
      console.error(`Artifact written: ${written.relative_path}`);
    }
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { assertPrivateKeyPermissions, parseArgs };
