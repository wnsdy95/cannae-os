const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");
const { resolveRepository, manifestDigest } = require("./repository-artifact-store");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { requireThat } = require("./operator-console-auth");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const within = (root, file) => file.startsWith(root + path.sep);
function entryId(entry) {
  return sha256(JSON.stringify([entry.mission_id, entry.wave_id, entry.kind, entry.artifact_id, entry.relative_path, entry.sha256]));
}
function canRead(user, entry) {
  if (entry.kind.startsWith("force-registry-") || entry.kind === "capability-standards") return user.role === "owner";
  return user.role === "owner" || user.missions.includes(entry.mission_id);
}
function entryMetadata(entry) {
  return { id: entryId(entry), artifact_id: entry.artifact_id, mission_id: entry.mission_id,
    wave_id: entry.wave_id, kind: entry.kind, sha256: entry.sha256,
    created_at: entry.created_at, classification: "restricted", approval_authorized: false };
}
function readEntry(store, entry) {
  const root = fs.realpathSync(store.artifactRoot), file = path.resolve(root, entry.relative_path);
  const namespace = path.join(root, "repositories", store.verification.repository.key);
  requireThat(within(namespace, file), "CONSOLE_EVIDENCE_PATH_DENIED", 403);
  let current = root;
  for (const part of path.relative(root, file).split(path.sep)) {
    current = path.join(current, part);
    requireThat(!fs.lstatSync(current).isSymbolicLink(), "CONSOLE_EVIDENCE_SYMLINK", 409);
  }
  requireThat(fs.realpathSync(file) === file, "CONSOLE_EVIDENCE_PATH_CHANGED", 409);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    requireThat(stat.isFile() && stat.nlink === 1 && stat.size <= 1024 * 1024, "CONSOLE_EVIDENCE_SIZE_OR_TYPE", 413);
    const buffer = Buffer.alloc(stat.size + 1), length = fs.readSync(fd, buffer, 0, buffer.length, 0);
    requireThat(length === stat.size, "CONSOLE_EVIDENCE_SIZE_CHANGED", 409);
    const bytes = buffer.subarray(0, length);
    requireThat(sha256(bytes) === entry.sha256, "CONSOLE_EVIDENCE_DIGEST_CHANGED", 409);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { fs.closeSync(fd); }
}
function queryEvidence(configuration, user, request) {
  requireThat(resolveRepository(configuration.repository).identity_fingerprint === configuration.identity,
    "CONSOLE_REPOSITORY_IDENTITY_CHANGED", 409);
  const options = { repositoryPath: configuration.repository, artifactRoot: configuration.artifactRoot };
  const namespace = path.join(configuration.artifactRoot, "repositories", configuration.repositoryKey);
  if (!fs.existsSync(namespace)) {
    requireThat(request.action === "list" && !request.cursor, "CONSOLE_EVIDENCE_NOT_FOUND", 404);
    return { manifest_sha256: "none", manifest_revision: 0, entries: [], next_cursor: null, total: 0,
      approval_authorized: false, release_authorized: false };
  }
  const store = loadVerifiedStore(options.repositoryPath, options.artifactRoot);
  const digest = manifestDigest(store.manifest);
  const visible = store.manifest.artifacts.filter(entry => canRead(user, entry));
  if (request.action === "list") {
    const filtered = visible.filter(entry => (!request.mission || entry.mission_id === request.mission) &&
      (!request.kind || entry.kind === request.kind));
    let offset = 0;
    if (request.cursor) {
      const match = /^([a-f0-9]{64})\.([0-9]{1,8})$/.exec(request.cursor);
      requireThat(match && match[1] === digest, "CONSOLE_CURSOR_STALE", 409);
      offset = Number(match[2]);
      requireThat(offset <= filtered.length, "CONSOLE_CURSOR_INVALID");
    }
    const entries = filtered.slice(offset, offset + 50).map(entryMetadata);
    return { manifest_sha256: digest, manifest_revision: store.manifest.manifest_revision, entries,
      next_cursor: offset + entries.length < filtered.length ? `${digest}.${offset + entries.length}` : null,
      total: filtered.length, approval_authorized: false, release_authorized: false };
  }
  requireThat(request.manifest === digest, "CONSOLE_EVIDENCE_SNAPSHOT_STALE", 409);
  const matches = visible.filter(entry => entryId(entry) === request.id);
  requireThat(matches.length === 1, "CONSOLE_EVIDENCE_NOT_FOUND", 404);
  const entry = matches[0], content = readEntry(store, entry);
  if (request.action === "review") {
    requireThat(entry.kind === "order-adoption-proposals", "CONSOLE_REVIEW_KIND_INVALID");
    const { inspectOrder } = require("./order-adoption-controller");
    const review = inspectOrder({ repository: configuration.repository, artifactRoot: configuration.artifactRoot, proposalId: entry.artifact_id });
    requireThat(manifestDigest(loadVerifiedStore(options.repositoryPath, options.artifactRoot).manifest) === digest,
      "CONSOLE_EVIDENCE_SNAPSHOT_STALE", 409);
    return { ...entryMetadata(entry), manifest_sha256: digest, review,
      rehearsals: store.manifest.artifacts.filter(item => item.kind === "order-rehearsals" && item.mission_id === entry.mission_id && item.wave_id === entry.wave_id)
        .filter(item => JSON.parse(readEntry(store, item)).proposal_ref?.sha256 === entry.sha256).map(entryMetadata),
      approval_authorized: false, release_authorized: false };
  }
  requireThat(request.action === "read", "CONSOLE_EVIDENCE_ACTION_INVALID");
  return { ...entryMetadata(entry), manifest_sha256: digest, content, approval_authorized: false, release_authorized: false };
}

module.exports = { queryEvidence, entryId, readEntry };
