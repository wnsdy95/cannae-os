#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function runGit(repositoryPath, args, required = true) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    if (!required) return null;
    throw new Error((result.stderr || result.stdout || "Git command failed.").trim());
  }
  return result.stdout.trim();
}

function normalizeRemote(remote) {
  const value = String(remote || "").trim();
  if (!value) return null;

  const scpMatch = value.match(/^[^@]+@([^:]+):(.+)$/);
  if (scpMatch) return `${scpMatch[1].toLowerCase()}/${scpMatch[2].replace(/\.git$/i, "")}`;

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "ssh:") {
      return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\.git$/i, "")}`;
    }
  } catch (error) {
    // Local paths and non-URL Git transports fall back to the normalized value.
  }

  return value.replace(/\\/g, "/").replace(/\.git$/i, "");
}

function slug(value) {
  return String(value || "repository")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "repository";
}

function repositoryLabel(normalizedRemote, repositoryRoot) {
  if (!normalizedRemote) return path.basename(repositoryRoot);
  const parts = normalizedRemote.split("/").filter(Boolean);
  return parts.slice(-2).join("-") || path.basename(repositoryRoot);
}

function resolveRepository(repositoryPath) {
  const candidate = path.resolve(repositoryPath || process.cwd());
  if (!fs.existsSync(candidate)) throw new Error(`Repository path does not exist: ${candidate}`);
  const start = fs.statSync(candidate).isDirectory() ? candidate : path.dirname(candidate);
  const repositoryRoot = fs.realpathSync(runGit(start, ["rev-parse", "--show-toplevel"]));
  const remote = runGit(repositoryRoot, ["config", "--get", "remote.origin.url"], false);
  const normalizedRemote = normalizeRemote(remote);
  const identitySource = normalizedRemote ? `${normalizedRemote}\n${repositoryRoot}` : repositoryRoot;
  const identityFingerprint = sha256(identitySource);
  const label = repositoryLabel(normalizedRemote, repositoryRoot);
  const headCommit = runGit(repositoryRoot, ["rev-parse", "HEAD"], false) || "unborn";

  return {
    root: repositoryRoot,
    key: `${slug(label)}-${identityFingerprint.slice(0, 12)}`,
    label,
    identity_fingerprint: identityFingerprint,
    head_commit: headCommit
  };
}

function safeSegment(value, label) {
  const segment = String(value || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) || segment === "." || segment === "..") {
    throw new Error(`${label} must be a single path-safe identifier.`);
  }
  return segment;
}

function ensureInside(root, candidate, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} resolves outside the artifact root.`);
  }
  return resolvedCandidate;
}

function ensureExistingPathInside(root, candidate, label) {
  const realRoot = fs.realpathSync(root);
  let existing = path.resolve(candidate);
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const realExisting = fs.realpathSync(existing);
  if (realExisting !== realRoot && !realExisting.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the artifact root through a symlink.`);
  }
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(temporaryPath, value, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function atomicWriteJson(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildManifest(repository, namespaceRoot, existingManifest, artifactEntry, now) {
  const existingArtifacts = existingManifest && Array.isArray(existingManifest.artifacts)
    ? existingManifest.artifacts.filter(item => item.relative_path !== artifactEntry.relative_path)
    : [];
  const artifacts = [...existingArtifacts, artifactEntry]
    .sort((left, right) => left.relative_path.localeCompare(right.relative_path));

  return {
    schema_version: "0.1",
    type: "RepositoryArtifactManifest",
    id: `RAM-${repository.identity_fingerprint.slice(0, 16)}`,
    repository: {
      key: repository.key,
      label: repository.label,
      identity_fingerprint: repository.identity_fingerprint,
      head_commit: repository.head_commit
    },
    namespace_root: namespaceRoot.split(path.sep).join("/"),
    artifacts,
    artifact_count: artifacts.length,
    isolation: {
      repository_scoped: true,
      cross_repository_writes_prohibited: true,
      absolute_paths_recorded: false
    },
    created_at: existingManifest && existingManifest.created_at ? existingManifest.created_at : now,
    updated_at: now
  };
}

function persistRepositoryArtifact(options, content, fileName, contentType) {
  const repository = resolveRepository(options.repositoryPath);
  const requestedArtifactRoot = path.resolve(options.artifactRoot || path.join(process.cwd(), ".cannae", "artifacts"));
  fs.mkdirSync(requestedArtifactRoot, { recursive: true });
  const artifactRoot = fs.realpathSync(requestedArtifactRoot);
  const missionId = safeSegment(options.missionId, "mission_id");
  const waveId = safeSegment(options.waveId, "wave_id");
  const kind = safeSegment(options.kind, "kind");
  const artifactId = safeSegment(options.artifactId, "artifact_id");
  safeSegment(fileName, "file_name");

  const namespaceRoot = path.join("repositories", repository.key);
  const relativePath = path.join(namespaceRoot, "missions", missionId, waveId, kind, fileName);
  const artifactPath = ensureInside(artifactRoot, path.join(artifactRoot, relativePath), "Artifact path");
  const manifestPath = ensureInside(artifactRoot, path.join(artifactRoot, namespaceRoot, "manifest.json"), "Manifest path");
  ensureExistingPathInside(artifactRoot, artifactPath, "Artifact path");
  ensureExistingPathInside(artifactRoot, manifestPath, "Manifest path");
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const payloadHash = sha256(bytes);
  const existingManifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  if (existingManifest && existingManifest.repository.identity_fingerprint !== repository.identity_fingerprint) {
    throw new Error("Artifact namespace belongs to a different repository identity.");
  }
  let created = true;

  if (fs.existsSync(artifactPath)) {
    const existingHash = sha256(fs.readFileSync(artifactPath));
    if (existingHash === payloadHash) {
      created = false;
    } else if (options.overwrite !== true) {
      throw new Error(`Artifact already exists with different content: ${artifactPath}`);
    }
  }

  if (created || options.overwrite === true) atomicWrite(artifactPath, bytes);

  const now = options.createdAt || new Date().toISOString();
  const existingArtifact = existingManifest && (existingManifest.artifacts || [])
    .find(item => item.relative_path === relativePath.split(path.sep).join("/"));
  const artifactEntry = {
    id: `RA-${sha256(relativePath).slice(0, 16)}`,
    artifact_id: artifactId,
    mission_id: missionId,
    wave_id: waveId,
    kind,
    file_name: fileName,
    content_type: contentType,
    byte_size: bytes.length,
    relative_path: relativePath.split(path.sep).join("/"),
    sha256: payloadHash,
    created_at: existingArtifact && !created ? existingArtifact.created_at : now
  };
  const manifest = buildManifest(repository, namespaceRoot, existingManifest, artifactEntry, now);
  atomicWriteJson(manifestPath, manifest);

  return {
    repository,
    artifact_root: artifactRoot,
    namespace_root: path.join(artifactRoot, namespaceRoot),
    artifact_path: artifactPath,
    manifest_path: manifestPath,
    relative_path: artifactEntry.relative_path,
    sha256: payloadHash,
    created
  };
}

function writeRepositoryArtifact(options) {
  if (!options.payload || typeof options.payload !== "object" || Array.isArray(options.payload)) {
    throw new Error("Artifact payload must be a JSON object.");
  }
  const artifactId = safeSegment(options.artifactId, "artifact_id");
  return persistRepositoryArtifact(
    options,
    `${JSON.stringify(options.payload, null, 2)}\n`,
    `${artifactId}.json`,
    "application/json"
  );
}

function contentTypeForExtension(extension) {
  const types = {
    ".csv": "text/csv",
    ".html": "text/html",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".json": "application/json",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".yaml": "application/yaml",
    ".yml": "application/yaml"
  };
  return types[extension.toLowerCase()] || "application/octet-stream";
}

function writeRepositoryFileArtifact(options) {
  const sourcePath = path.resolve(options.sourcePath || "");
  if (!fs.existsSync(sourcePath) || !fs.lstatSync(sourcePath).isFile()) {
    throw new Error("Artifact source must be an existing regular file, not a directory or symlink.");
  }
  const artifactId = safeSegment(options.artifactId, "artifact_id");
  const sourceName = path.basename(sourcePath);
  const firstDot = sourceName.indexOf(".");
  const suffix = firstDot > 0 ? sourceName.slice(firstDot) : ".bin";
  if (!/^(?:\.[A-Za-z0-9]+){1,3}$/.test(suffix)) {
    throw new Error("Artifact source extension is not path-safe.");
  }
  return persistRepositoryArtifact(
    options,
    fs.readFileSync(sourcePath),
    `${artifactId}${suffix}`,
    options.contentType || contentTypeForExtension(path.extname(sourceName))
  );
}

function parseArgs(argv) {
  const options = { overwrite: false };
  const valueOptions = new Set(["repository", "artifact-root", "mission", "wave", "kind", "artifact-id", "input", "source", "content-type"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }
    if (arg.startsWith("--") && valueOptions.has(arg.slice(2))) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      options[key] = argv[index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function parseArtifactWriteFlags(argv) {
  const options = { writeArtifact: false, overwriteArtifact: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-artifact") {
      options.writeArtifact = true;
      continue;
    }
    if (arg === "--overwrite-artifact") {
      options.overwriteArtifact = true;
      continue;
    }
    if (["--repository", "--artifact-root"].includes(arg)) {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      if (arg === "--repository") options.repositoryPath = argv[index];
      if (arg === "--artifact-root") options.artifactRoot = argv[index];
      continue;
    }
    throw new Error(`Unknown artifact output option: ${arg}`);
  }
  if (options.writeArtifact && !options.repositoryPath) {
    throw new Error("--write-artifact requires --repository <path>.");
  }
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.repository || !options.mission || !options.wave || !options.kind || !options.artifactId) {
      throw new Error("Usage: node repository-artifact-store.js --repository <repo> --mission <id> --wave <id> --kind <kind> --artifact-id <id> [--input <json> | --source <file>] [--content-type <type>] [--artifact-root <dir>] [--overwrite]");
    }
    if (options.source && options.input) throw new Error("Use either --source or --input, not both.");
    const common = {
      repositoryPath: options.repository,
      artifactRoot: options.artifactRoot,
      missionId: options.mission,
      waveId: options.wave,
      kind: options.kind,
      artifactId: options.artifactId,
      overwrite: options.overwrite
    };
    const result = options.source
      ? writeRepositoryFileArtifact({ ...common, sourcePath: options.source, contentType: options.contentType })
      : writeRepositoryArtifact({
        ...common,
        payload: JSON.parse(options.input ? fs.readFileSync(path.resolve(options.input), "utf8") : fs.readFileSync(0, "utf8"))
      });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  buildManifest,
  normalizeRemote,
  parseArtifactWriteFlags,
  resolveRepository,
  safeSegment,
  writeRepositoryArtifact,
  writeRepositoryFileArtifact
};
