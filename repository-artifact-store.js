#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
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
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const descriptor = fs.openSync(temporaryPath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, value);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporaryPath, filePath);
  const directoryDescriptor = fs.openSync(path.dirname(filePath), "r");
  try {
    fs.fsyncSync(directoryDescriptor);
  } finally {
    fs.closeSync(directoryDescriptor);
  }
}

function atomicWriteJson(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

function readLockOwner(lockPath) {
  try {
    return readJson(path.join(lockPath, "owner.json"));
  } catch (error) {
    return null;
  }
}

function lockAgeMilliseconds(lockPath, owner) {
  const acquiredAt = owner && Date.parse(owner.acquired_at);
  if (Number.isFinite(acquiredAt)) return Date.now() - acquiredAt;
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs;
  } catch (error) {
    return 0;
  }
}

function reclaimStaleLocalLock(lockPath, staleMs) {
  const recoveryPath = `${lockPath}.recovery`;
  try {
    fs.mkdirSync(recoveryPath, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }

  try {
    const owner = readLockOwner(lockPath);
    if (!owner || !owner.token || !owner.hostname || !Number.isInteger(owner.pid)) return false;
    if (lockAgeMilliseconds(lockPath, owner) <= staleMs) return false;
    if (owner.hostname !== os.hostname()) return false;
    if (processIsAlive(owner.pid)) return false;
    const confirmedOwner = readLockOwner(lockPath);
    if (!confirmedOwner || confirmedOwner.token !== owner.token) return false;
    try {
      fs.rmSync(lockPath, { recursive: true, force: false });
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return true;
      return false;
    }
  } finally {
    try {
      fs.rmSync(recoveryPath, { recursive: true, force: false });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function acquireNamespaceLock(artifactRoot, namespacePath, options = {}) {
  const timeoutMs = Number.isInteger(options.lockTimeoutMs) ? options.lockTimeoutMs : 5000;
  const staleMs = Number.isInteger(options.lockStaleMs) ? options.lockStaleMs : 30000;
  if (timeoutMs < 1 || staleMs < 1) throw new Error("Artifact lock timeout and stale threshold must be positive integers.");
  fs.mkdirSync(namespacePath, { recursive: true });
  ensureExistingPathInside(artifactRoot, namespacePath, "Repository namespace lock");
  const lockPath = path.join(namespacePath, ".manifest.lock");
  const token = crypto.randomUUID();
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      atomicWriteJson(path.join(lockPath, "owner.json"), {
        pid: process.pid,
        hostname: os.hostname(),
        token,
        acquired_at: new Date().toISOString()
      });
      return { lockPath, token };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (reclaimStaleLocalLock(lockPath, staleMs)) continue;
      if (Date.now() >= deadline) {
        const owner = readLockOwner(lockPath);
        const ownerLabel = owner ? `${owner.hostname || "unknown-host"}:${owner.pid || "unknown-pid"}` : "unknown owner";
        throw new Error(`Timed out waiting for repository artifact manifest lock (${ownerLabel}).`);
      }
      sleepSync(Math.min(25, Math.max(1, deadline - Date.now())));
    }
  }
}

function releaseNamespaceLock(lock) {
  if (!lock) return;
  const owner = readLockOwner(lock.lockPath);
  if (!owner || owner.token !== lock.token) {
    throw new Error("Repository artifact manifest lock ownership changed before release.");
  }
  fs.rmSync(lock.lockPath, { recursive: true, force: false });
}

function manifestDigest(manifest) {
  const value = JSON.parse(JSON.stringify(manifest));
  if (value.integrity) delete value.integrity.canonical_manifest_sha256;
  return sha256(`${JSON.stringify(value, null, 2)}\n`);
}

function finalizeManifest(manifest) {
  manifest.integrity.canonical_manifest_sha256 = manifestDigest(manifest);
  return manifest;
}

function manifestHistoryFile(namespacePath, revision) {
  return path.join(namespacePath, ".manifest-history", `manifest-r${String(revision).padStart(8, "0")}.json`);
}

function manifestPaths(namespacePath) {
  return {
    manifest: path.join(namespacePath, "manifest.json"),
    sidecar: path.join(namespacePath, "manifest.sha256"),
    pending: path.join(namespacePath, ".transactions", "pending"),
    committed: path.join(namespacePath, ".transactions", "committed")
  };
}

function assertManifestDigest(manifest) {
  if (!manifest || manifest.schema_version !== "0.3" || !manifest.integrity) {
    throw new Error("Repository artifact manifest is not v0.3 integrity-aware.");
  }
  const actual = manifestDigest(manifest);
  if (manifest.integrity.canonical_manifest_sha256 !== actual) {
    throw new Error("Repository artifact manifest digest does not match its canonical content.");
  }
  return actual;
}

function commitManifest(namespacePath, manifest) {
  const paths = manifestPaths(namespacePath);
  const digest = assertManifestDigest(manifest);
  const historyPath = manifestHistoryFile(namespacePath, manifest.manifest_revision);
  if (fs.existsSync(historyPath)) {
    const existing = readJson(historyPath);
    if (assertManifestDigest(existing) !== digest) {
      throw new Error(`Manifest history conflict at revision ${manifest.manifest_revision}.`);
    }
  } else {
    atomicWriteJson(historyPath, manifest);
  }
  atomicWriteJson(paths.manifest, manifest);
  atomicWrite(paths.sidecar, `${digest}\n`);
  return digest;
}

function migrateLegacyManifest(repository, namespaceRoot, namespacePath, manifest, now) {
  if (!manifest || manifest.schema_version === "0.3") return manifest;
  if (manifest.schema_version !== "0.2") throw new Error(`Unsupported repository artifact manifest version: ${manifest.schema_version}`);
  if (!manifest.repository || manifest.repository.identity_fingerprint !== repository.identity_fingerprint) {
    throw new Error("Legacy artifact namespace belongs to a different repository identity.");
  }
  const revision = Math.max(1, Number(manifest.manifest_revision) || 1);
  const migrated = finalizeManifest({
    ...manifest,
    schema_version: "0.3",
    namespace_root: namespaceRoot.split(path.sep).join("/"),
    manifest_revision: revision,
    previous_manifest_sha256: "none",
    isolation: {
      ...manifest.isolation,
      write_ahead_journal: true
    },
    integrity: {
      algorithm: "sha256",
      canonical_manifest_sha256: "",
      history_start_revision: revision,
      history_length: 1,
      pending_transaction_count: 0,
      sidecar_required: true
    },
    updated_at: now
  });
  commitManifest(namespacePath, migrated);
  return migrated;
}

function buildManifest(repository, namespaceRoot, existingManifest, artifactEntry, now) {
  const existingArtifacts = existingManifest && Array.isArray(existingManifest.artifacts)
    ? existingManifest.artifacts.filter(item => item.relative_path !== artifactEntry.relative_path)
    : [];
  const artifacts = [...existingArtifacts, artifactEntry]
    .sort((left, right) => left.relative_path.localeCompare(right.relative_path));

  const previousDigest = existingManifest ? assertManifestDigest(existingManifest) : "none";
  const revision = Math.max(
    existingManifest && Number.isInteger(existingManifest.manifest_revision)
      ? existingManifest.manifest_revision + 1
      : 1,
    artifacts.length
  );
  return finalizeManifest({
    schema_version: "0.3",
    type: "RepositoryArtifactManifest",
    id: `RAM-${repository.identity_fingerprint.slice(0, 16)}`,
    repository: {
      key: repository.key,
      label: repository.label,
      identity_fingerprint: repository.identity_fingerprint,
      head_commit: repository.head_commit
    },
    namespace_root: namespaceRoot.split(path.sep).join("/"),
    manifest_revision: revision,
    previous_manifest_sha256: previousDigest,
    artifacts,
    artifact_count: artifacts.length,
    isolation: {
      repository_scoped: true,
      cross_repository_writes_prohibited: true,
      absolute_paths_recorded: false,
      cross_process_manifest_lock: true,
      stale_lock_recovery_fail_closed: true,
      write_ahead_journal: true
    },
    integrity: {
      algorithm: "sha256",
      canonical_manifest_sha256: "",
      history_start_revision: existingManifest && existingManifest.integrity
        ? existingManifest.integrity.history_start_revision
        : 1,
      history_length: existingManifest && existingManifest.integrity
        ? existingManifest.integrity.history_length + 1
        : 1,
      pending_transaction_count: 0,
      sidecar_required: true
    },
    created_at: existingManifest && existingManifest.created_at ? existingManifest.created_at : now,
    updated_at: now
  });
}

function listPendingJournals(namespacePath) {
  const pendingPath = manifestPaths(namespacePath).pending;
  if (!fs.existsSync(pendingPath)) return [];
  return fs.readdirSync(pendingPath)
    .filter(file => file.endsWith(".json"))
    .sort()
    .map(file => path.join(pendingPath, file));
}

function archiveJournal(namespacePath, journalPath, journal, state, note) {
  const paths = manifestPaths(namespacePath);
  fs.mkdirSync(paths.committed, { recursive: true });
  const completed = {
    ...journal,
    state,
    recovery_note: note || journal.recovery_note || "none",
    updated_at: new Date().toISOString()
  };
  atomicWriteJson(journalPath, completed);
  const destination = path.join(paths.committed, path.basename(journalPath));
  if (fs.existsSync(destination)) throw new Error(`Committed transaction journal already exists: ${destination}`);
  fs.renameSync(journalPath, destination);
}

function currentManifestForRecovery(namespacePath) {
  const manifestPath = manifestPaths(namespacePath).manifest;
  if (!fs.existsSync(manifestPath)) return { manifest: null, digest: "none" };
  const manifest = readJson(manifestPath);
  return { manifest, digest: assertManifestDigest(manifest) };
}

function recoverPendingTransactionsLocked(artifactRoot, namespacePath) {
  const recovered = [];
  for (const journalPath of listPendingJournals(namespacePath)) {
    const journal = readJson(journalPath);
    if (journal.type !== "RepositoryArtifactTransaction" || journal.schema_version !== "0.1" || !journal.candidate_manifest) {
      throw new Error(`Malformed repository artifact transaction journal: ${journalPath}`);
    }
    const candidateDigest = assertManifestDigest(journal.candidate_manifest);
    if (candidateDigest !== journal.candidate_manifest_sha256) {
      throw new Error(`Transaction candidate manifest digest mismatch: ${journal.id}`);
    }
    const artifactPath = ensureInside(artifactRoot, path.join(artifactRoot, journal.artifact_relative_path), "Journal artifact path");
    const artifactHash = fs.existsSync(artifactPath) ? sha256(fs.readFileSync(artifactPath)) : "missing";
    const current = currentManifestForRecovery(namespacePath);

    if (artifactHash === journal.artifact_sha256) {
      if (current.digest !== journal.manifest_before_sha256 && current.digest !== candidateDigest) {
        throw new Error(`Transaction manifest conflict requires manual recovery: ${journal.id}`);
      }
      commitManifest(namespacePath, journal.candidate_manifest);
      archiveJournal(namespacePath, journalPath, journal, "manifest_committed", current.digest === candidateDigest
        ? "Recovered journal after manifest commit."
        : "Reconciled artifact-written transaction into the manifest.");
      recovered.push(journal.id);
      continue;
    }

    if (journal.state === "prepared" && current.digest === journal.manifest_before_sha256 &&
        ((!journal.artifact_preexisted && artifactHash === "missing") ||
         (journal.artifact_preexisted && artifactHash === journal.previous_artifact_sha256))) {
      archiveJournal(namespacePath, journalPath, journal, "recovered_rolled_back", "No candidate artifact bytes were committed; removed prepared journal.");
      recovered.push(journal.id);
      continue;
    }

    throw new Error(`Transaction artifact conflict requires manual recovery: ${journal.id}`);
  }
  return recovered;
}

function collectIntegrityIssues(repository, artifactRoot, namespacePath) {
  const issues = [];
  const paths = manifestPaths(namespacePath);
  const pending = listPendingJournals(namespacePath);
  if (pending.length > 0) issues.push({ code: "PENDING_TRANSACTION", message: `${pending.length} transaction(s) require recovery.` });
  if (!fs.existsSync(paths.manifest)) return [...issues, { code: "MANIFEST_MISSING", message: "Repository artifact manifest does not exist." }];

  let manifest;
  let digest;
  try {
    manifest = readJson(paths.manifest);
    digest = assertManifestDigest(manifest);
  } catch (error) {
    return [...issues, { code: "MANIFEST_INTEGRITY_INVALID", message: error.message }];
  }
  if (manifest.repository.identity_fingerprint !== repository.identity_fingerprint || manifest.repository.key !== repository.key) {
    issues.push({ code: "REPOSITORY_BINDING_MISMATCH", message: "Manifest repository identity does not match the requested repository." });
  }
  const sidecar = fs.existsSync(paths.sidecar) ? fs.readFileSync(paths.sidecar, "utf8").trim() : "missing";
  if (sidecar !== digest) issues.push({ code: "MANIFEST_SIDECAR_MISMATCH", message: "Manifest sidecar does not match canonical manifest content." });

  const start = manifest.integrity.history_start_revision;
  let previous = "none";
  let historyCount = 0;
  for (let revision = start; revision <= manifest.manifest_revision; revision += 1) {
    const historyPath = manifestHistoryFile(namespacePath, revision);
    if (!fs.existsSync(historyPath)) {
      issues.push({ code: "MANIFEST_HISTORY_GAP", message: `Missing manifest history revision ${revision}.` });
      continue;
    }
    try {
      const historic = readJson(historyPath);
      const historicDigest = assertManifestDigest(historic);
      if (historic.manifest_revision !== revision) issues.push({ code: "MANIFEST_HISTORY_REVISION_MISMATCH", message: `History file ${revision} contains another revision.` });
      if (historic.previous_manifest_sha256 !== previous) issues.push({ code: "MANIFEST_HISTORY_CHAIN_BROKEN", message: `History chain is broken at revision ${revision}.` });
      previous = historicDigest;
      historyCount += 1;
    } catch (error) {
      issues.push({ code: "MANIFEST_HISTORY_INVALID", message: error.message });
    }
  }
  if (historyCount !== manifest.integrity.history_length) issues.push({ code: "MANIFEST_HISTORY_LENGTH_MISMATCH", message: "Manifest history length does not match retained history." });
  if (previous !== digest) issues.push({ code: "MANIFEST_HISTORY_HEAD_MISMATCH", message: "Current manifest does not match the history head." });

  const retainedPaths = new Set();
  for (const entry of manifest.artifacts || []) {
    if (!entry.relative_path.startsWith(`${manifest.namespace_root}/missions/`) || entry.relative_path.split("/").includes("..")) {
      issues.push({ code: "ARTIFACT_PATH_INVALID", message: `Manifest artifact path is outside the repository namespace: ${entry.relative_path}` });
      continue;
    }
    retainedPaths.add(entry.relative_path);
    const artifactPath = ensureInside(artifactRoot, path.join(artifactRoot, entry.relative_path), "Manifest artifact path");
    if (!fs.existsSync(artifactPath)) {
      issues.push({ code: "ARTIFACT_MISSING", message: `Artifact is missing: ${entry.relative_path}` });
      continue;
    }
    const stat = fs.lstatSync(artifactPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      issues.push({ code: "ARTIFACT_TYPE_INVALID", message: `Artifact is not a regular file: ${entry.relative_path}` });
      continue;
    }
    const bytes = fs.readFileSync(artifactPath);
    if (bytes.length !== entry.byte_size) issues.push({ code: "ARTIFACT_SIZE_MISMATCH", message: `Artifact byte size changed: ${entry.relative_path}` });
    if (sha256(bytes) !== entry.sha256) issues.push({ code: "ARTIFACT_HASH_MISMATCH", message: `Artifact hash changed: ${entry.relative_path}` });
  }

  const missionsPath = path.join(namespacePath, "missions");
  function walk(folder) {
    if (!fs.existsSync(folder)) return;
    for (const name of fs.readdirSync(folder)) {
      const target = path.join(folder, name);
      const stat = fs.lstatSync(target);
      if (stat.isDirectory()) walk(target);
      else {
        const relative = path.relative(artifactRoot, target).split(path.sep).join("/");
        if (!retainedPaths.has(relative)) issues.push({ code: "ORPHAN_ARTIFACT", message: `Artifact file is not retained by the manifest: ${relative}` });
      }
    }
  }
  walk(missionsPath);
  return issues;
}

function verifyRepositoryArtifacts(options = {}) {
  const repository = resolveRepository(options.repositoryPath);
  const requestedArtifactRoot = path.resolve(options.artifactRoot || path.join(process.cwd(), ".cannae", "artifacts"));
  if (!fs.existsSync(requestedArtifactRoot)) {
    return { valid: false, repository, manifest_revision: 0, artifact_count: 0, recovered_transactions: [], issues: [{ code: "ARTIFACT_ROOT_MISSING", message: "Artifact root does not exist." }] };
  }
  const artifactRoot = fs.realpathSync(requestedArtifactRoot);
  const namespacePath = ensureInside(artifactRoot, path.join(artifactRoot, "repositories", repository.key), "Repository namespace");
  if (!fs.existsSync(namespacePath)) {
    return { valid: false, repository, manifest_revision: 0, artifact_count: 0, recovered_transactions: [], issues: [{ code: "REPOSITORY_NAMESPACE_MISSING", message: "Repository artifact namespace does not exist." }] };
  }
  let recovered = [];
  if (options.recover === true) {
    const lock = acquireNamespaceLock(artifactRoot, namespacePath, options);
    try {
      const paths = manifestPaths(namespacePath);
      if (fs.existsSync(paths.manifest)) {
        const existing = readJson(paths.manifest);
        migrateLegacyManifest(repository, path.join("repositories", repository.key), namespacePath, existing, new Date().toISOString());
      }
      recovered = recoverPendingTransactionsLocked(artifactRoot, namespacePath);
    } finally {
      releaseNamespaceLock(lock);
    }
  }
  const issues = collectIntegrityIssues(repository, artifactRoot, namespacePath);
  let manifest = null;
  try { manifest = readJson(manifestPaths(namespacePath).manifest); } catch (error) { /* reported above */ }
  return {
    valid: issues.length === 0,
    repository,
    manifest_revision: manifest && Number.isInteger(manifest.manifest_revision) ? manifest.manifest_revision : 0,
    manifest_sha256: manifest && manifest.integrity ? manifest.integrity.canonical_manifest_sha256 : "none",
    artifact_count: manifest && Number.isInteger(manifest.artifact_count) ? manifest.artifact_count : 0,
    recovered_transactions: recovered,
    issues
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
  const namespacePath = ensureInside(artifactRoot, path.join(artifactRoot, namespaceRoot), "Repository namespace");
  const lock = acquireNamespaceLock(artifactRoot, namespacePath, options);
  try {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const payloadHash = sha256(bytes);
    let existingManifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
    existingManifest = migrateLegacyManifest(repository, namespaceRoot, namespacePath, existingManifest, new Date().toISOString());
    recoverPendingTransactionsLocked(artifactRoot, namespacePath);
    existingManifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
    if (existingManifest && existingManifest.repository.identity_fingerprint !== repository.identity_fingerprint) {
      throw new Error("Artifact namespace belongs to a different repository identity.");
    }
    if (existingManifest) {
      const integrityIssues = collectIntegrityIssues(repository, artifactRoot, namespacePath);
      if (integrityIssues.length > 0) throw new Error(`Repository artifact integrity check failed: ${integrityIssues.map(item => item.code).join(", ")}`);
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
    const paths = manifestPaths(namespacePath);
    fs.mkdirSync(paths.pending, { recursive: true });
    const transactionId = `RAT-${crypto.randomUUID()}`;
    const journalPath = path.join(paths.pending, `${transactionId}.json`);
    let journal = {
      schema_version: "0.1",
      type: "RepositoryArtifactTransaction",
      id: transactionId,
      repository_key: repository.key,
      state: "prepared",
      artifact_relative_path: artifactEntry.relative_path,
      artifact_sha256: payloadHash,
      artifact_preexisted: fs.existsSync(artifactPath),
      previous_artifact_sha256: fs.existsSync(artifactPath) ? sha256(fs.readFileSync(artifactPath)) : "none",
      manifest_before_revision: existingManifest ? existingManifest.manifest_revision : 0,
      manifest_before_sha256: existingManifest ? assertManifestDigest(existingManifest) : "none",
      candidate_manifest_sha256: assertManifestDigest(manifest),
      candidate_manifest: manifest,
      recovery_note: "none",
      created_at: now,
      updated_at: now
    };
    atomicWriteJson(journalPath, journal);
    if (options.faultInjectionStage === "prepared") throw new Error("Injected artifact transaction failure after prepare.");

    if (created || options.overwrite === true) atomicWrite(artifactPath, bytes);
    journal = { ...journal, state: "artifact_written", updated_at: new Date().toISOString() };
    atomicWriteJson(journalPath, journal);
    if (options.faultInjectionStage === "artifact_written") throw new Error("Injected artifact transaction failure after artifact write.");

    commitManifest(namespacePath, manifest);
    journal = { ...journal, state: "manifest_committed", updated_at: new Date().toISOString() };
    atomicWriteJson(journalPath, journal);
    if (options.faultInjectionStage === "manifest_committed") throw new Error("Injected artifact transaction failure after manifest commit.");
    archiveJournal(namespacePath, journalPath, journal, "manifest_committed", "Transaction committed without recovery.");

    return {
      repository,
      artifact_root: artifactRoot,
      namespace_root: namespacePath,
      artifact_path: artifactPath,
      manifest_path: manifestPath,
      relative_path: artifactEntry.relative_path,
      sha256: payloadHash,
      manifest_revision: manifest.manifest_revision,
      manifest_sha256: manifest.integrity.canonical_manifest_sha256,
      transaction_id: transactionId,
      created
    };
  } finally {
    releaseNamespaceLock(lock);
  }
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
  const valueOptions = new Set(["repository", "artifact-root", "mission", "wave", "kind", "artifact-id", "input", "source", "content-type", "lock-timeout-ms", "lock-stale-ms"]);
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
      if (arg === "--lock-timeout-ms" || arg === "--lock-stale-ms") {
        options[key] = Number(options[key]);
        if (!Number.isInteger(options[key]) || options[key] < 1) throw new Error(`${arg} requires a positive integer.`);
      }
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
      throw new Error("Usage: node repository-artifact-store.js --repository <repo> --mission <id> --wave <id> --kind <kind> --artifact-id <id> [--input <json> | --source <file>] [--content-type <type>] [--artifact-root <dir>] [--overwrite] [--lock-timeout-ms <ms>] [--lock-stale-ms <ms>]");
    }
    if (options.source && options.input) throw new Error("Use either --source or --input, not both.");
    const common = {
      repositoryPath: options.repository,
      artifactRoot: options.artifactRoot,
      missionId: options.mission,
      waveId: options.wave,
      kind: options.kind,
      artifactId: options.artifactId,
      overwrite: options.overwrite,
      lockTimeoutMs: options.lockTimeoutMs,
      lockStaleMs: options.lockStaleMs
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
  acquireNamespaceLock,
  normalizeRemote,
  manifestDigest,
  parseArtifactWriteFlags,
  resolveRepository,
  recoverPendingTransactionsLocked,
  releaseNamespaceLock,
  safeSegment,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact,
  writeRepositoryFileArtifact
};
