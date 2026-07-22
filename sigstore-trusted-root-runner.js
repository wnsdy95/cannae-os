#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { getTrustedRoot } = require("@sigstore/tuf");
const { TrustedRoot } = require("@sigstore/protobuf-specs");
const { writeRepositoryArtifact } = require("./repository-artifact-store");
const { createSigstoreTrustedRoot, verifySigstoreTrustedRoot } = require("./sigstore-trusted-root");
const { validatePayload } = require("./validator-cli-prototype/validate");

function parseArgs(argv) {
  const options = { writeArtifact: false };
  const values = new Set([
    "id", "input", "source-uri", "retrieved-at", "tuf-mirror", "tuf-root", "tuf-cache",
    "repository", "artifact-root", "mission", "wave"
  ]);
  for (let index = 0; index < argv.length; index += 1) {
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
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.id) throw new Error("--id is required.");
  if (options.writeArtifact && (!options.repository || !options.mission || !options.wave)) {
    throw new Error("--write-artifact requires --repository, --mission, and --wave.");
  }
  return options;
}

async function loadTrustedRoot(options) {
  if (options.input) return JSON.parse(fs.readFileSync(path.resolve(options.input), "utf8"));
  const root = await getTrustedRoot({
    mirrorURL: options.tufMirror,
    rootPath: options.tufRoot,
    cachePath: options.tufCache,
    forceCache: true
  });
  return TrustedRoot.toJSON(root);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const artifact = createSigstoreTrustedRoot({
      id: options.id,
      trustedRoot: await loadTrustedRoot(options),
      sourceKind: options.input ? "pinned_file" : options.tufMirror || options.tufRoot ? "custom_tuf" : "sigstore_tuf",
      sourceUri: options.sourceUri || options.tufMirror || options.input || "https://tuf-repo-cdn.sigstore.dev",
      retrievedAt: options.retrievedAt
    });
    const semantic = verifySigstoreTrustedRoot(artifact);
    const validation = validatePayload(artifact, "sigstore-trusted-root");
    if (!semantic.valid || !validation.valid) {
      throw new Error(`Generated Sigstore TrustedRoot failed validation: ${[...semantic.codes, ...validation.issues.map(item => item.code)].join(", ")}`);
    }
    if (options.writeArtifact) {
      const written = writeRepositoryArtifact({
        repositoryPath: options.repository,
        artifactRoot: options.artifactRoot,
        missionId: options.mission,
        waveId: options.wave,
        kind: "sigstore-trusted-roots",
        artifactId: artifact.id,
        payload: artifact,
        createdAt: artifact.source.retrieved_at
      });
      console.error(`Artifact written: ${written.relative_path}`);
    }
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { loadTrustedRoot, parseArgs };
