#!/usr/bin/env node

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { writeRepositoryArtifact } = require("./repository-artifact-store");
const {
  GITLAB_CI_DISCOVERY_URI,
  GITLAB_CI_JWKS_URI,
  createGitLabCIOIDCEvidence,
  createGitLabCIOIDCTrustBundle,
  verifyGitLabCIOIDCEvidence,
  verifyGitLabCIOIDCTrustBundle
} = require("./gitlab-ci-oidc");
const { validatePayload } = require("./validator-cli-prototype/validate");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function readReferencedJson(filePath, reference, label) {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file.`);
  const bytes = fs.readFileSync(resolved);
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== reference.sha256) {
    throw new Error(`${label} bytes do not match the exact artifact reference.`);
  }
  return JSON.parse(bytes.toString("utf8"));
}

function parseArgs(argv) {
  const command = argv[0];
  if (!new Set(["trust-bundle", "create", "verify"]).has(command)) {
    throw new Error("Usage: node gitlab-ci-oidc-runner.js <trust-bundle|create|verify> [options]");
  }
  const options = { command, writeArtifact: false, fetch: false };
  const values = new Set([
    "id", "discovery", "jwks", "retrieved-at", "expires-at", "profile", "trust-bundle",
    "trust-bundle-ref", "token-file", "token-env", "evidence", "evaluated-at", "repository",
    "artifact-root", "mission", "wave"
  ]);
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-artifact") options.writeArtifact = true;
    else if (arg === "--fetch") options.fetch = true;
    else if (arg.startsWith("--") && values.has(arg.slice(2))) {
      if (++index >= argv.length) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = argv[index];
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function required(options, fields) {
  const missing = fields.filter(field => !options[field]);
  if (missing.length > 0) throw new Error(`Missing required options: ${missing.join(", ")}`);
}

function assertValid(payload, type) {
  const issues = validatePayload(payload, type).issues.filter(item => ["error", "critical"].includes(item.severity));
  if (issues.length > 0) throw new Error(`${type} validation failed: ${[...new Set(issues.map(item => item.code))].join(", ")}`);
}

async function fetchJson(uri) {
  const response = await fetch(uri, { redirect: "error", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTPS retrieval failed for ${uri}: ${response.status}`);
  return response.json();
}

function persist(options, kind, artifact, createdAt) {
  required(options, ["repository", "mission", "wave"]);
  return writeRepositoryArtifact({
    repositoryPath: options.repository,
    artifactRoot: options.artifactRoot,
    missionId: options.mission,
    waveId: options.wave,
    kind,
    artifactId: artifact.id,
    payload: artifact,
    createdAt
  });
}

async function trustBundle(options) {
  required(options, ["id", "retrievedAt", "expiresAt"]);
  if (!options.fetch) required(options, ["discovery", "jwks"]);
  const artifact = createGitLabCIOIDCTrustBundle({
    id: options.id,
    discovery: options.fetch ? await fetchJson(GITLAB_CI_DISCOVERY_URI) : readJson(options.discovery),
    jwks: options.fetch ? await fetchJson(GITLAB_CI_JWKS_URI) : readJson(options.jwks),
    sourceKind: options.fetch ? "https_discovery" : "pinned_file",
    retrievedAt: options.retrievedAt,
    expiresAt: options.expiresAt
  });
  const result = verifyGitLabCIOIDCTrustBundle(artifact, options.retrievedAt);
  assertValid(artifact, "gitlab-ci-oidc-trust-bundle");
  if (!result.valid) throw new Error(`Generated trust bundle failed verification: ${result.codes.join(", ")}`);
  const persisted = options.writeArtifact
    ? persist(options, "gitlab-ci-oidc-trust-bundles", artifact, options.retrievedAt)
    : null;
  return { type: artifact.type, id: artifact.id, bundle_sha256: artifact.bundle_sha256, key_count: artifact.keys.length, persisted };
}

function tokenFromOptions(options) {
  if (options.tokenFile && options.tokenEnv) throw new Error("Use only one of --token-file or --token-env.");
  if (options.tokenFile) {
    const resolved = path.resolve(options.tokenFile);
    const stat = fs.lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink() || process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
      throw new Error("OIDC token files must be regular files with mode 0600 or stricter.");
    }
    return fs.readFileSync(resolved, "utf8").trim();
  }
  const name = options.tokenEnv || "CANNAE_GITLAB_ID_TOKEN";
  if (!process.env[name]) throw new Error(`OIDC token environment variable is missing: ${name}`);
  return process.env[name].trim();
}

function nativeInputs(options) {
  required(options, ["profile", "trustBundle", "trustBundleRef", "evaluatedAt"]);
  const profile = readJson(options.profile);
  const trustBundleReference = readJson(options.trustBundleRef);
  const trustBundle = readReferencedJson(options.trustBundle, trustBundleReference, "GitLab CI OIDC trust bundle");
  return { profile, trustBundleReference, trustBundle };
}

function create(options) {
  required(options, ["id"]);
  const inputs = nativeInputs(options);
  const artifact = createGitLabCIOIDCEvidence({
    id: options.id,
    token: tokenFromOptions(options),
    ...inputs,
    evaluatedAt: options.evaluatedAt
  });
  assertValid(artifact, "gitlab-ci-oidc-evidence");
  const result = verifyGitLabCIOIDCEvidence({ evidence: artifact, ...inputs, evaluatedAt: options.evaluatedAt });
  if (!result.valid) throw new Error(`Generated GitLab CI OIDC evidence failed verification: ${result.codes.join(", ")}`);
  const persisted = options.writeArtifact
    ? persist(options, "gitlab-ci-oidc-evidence", artifact, artifact.issued_at)
    : null;
  return { type: artifact.type, id: artifact.id, token_sha256: artifact.token_sha256, valid_until: result.valid_until, persisted };
}

function verify(options) {
  required(options, ["evidence"]);
  const inputs = nativeInputs(options);
  const evidence = readJson(options.evidence);
  assertValid(evidence, "gitlab-ci-oidc-evidence");
  return verifyGitLabCIOIDCEvidence({ evidence, ...inputs, evaluatedAt: options.evaluatedAt });
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = options.command === "trust-bundle" ? await trustBundle(options) :
      options.command === "create" ? create(options) : verify(options);
    if (result.valid === false) process.exitCode = 1;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { create, fetchJson, parseArgs, trustBundle, verify };
