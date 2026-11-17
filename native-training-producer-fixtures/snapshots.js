const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), cp = require("node:child_process"), { z } = require("zod");
const producer = require("../native-training-producer"), t = require("../task-training-contract"), { sha256 } = require("../order-intake-contract");
const need = (value, code) => { if (!value) throw new Error(code); };
const hex = z.string().regex(/^[a-f0-9]{64}$/), gitId = z.string().regex(/^[a-f0-9]{40}$/);
const relative = z.string().min(1).max(256).refine(value => !value.includes("\\") && !path.posix.isAbsolute(value) &&
  value.split("/").every(part => part && ![".", "..", ".git"].includes(part)));
const blobPath = z.string().regex(/^native-training-producer-fixtures\/legacy-[a-z0-9-]+-source\.tar\.gz$/);
const SNAPSHOT = z.strictObject({ schema_version: z.enum(["0.1", "0.2"]), type: z.literal("NativeTrainingHistoricalProducerSnapshot"),
  source_revision: gitId, source_tree: gitId, source_state_sha256: hex,
  method_files: z.array(z.strictObject({ file: relative, sha256: hex })).min(21).max(32), method_sha256: hex, dependency_lock_sha256: hex,
  archive_file: z.string().regex(/^legacy-[a-z0-9-]+-source\.tar\.gz$/), archive_sha256: hex,
  external_blobs: z.array(z.strictObject({ path: blobPath, sha256: hex, bytes: z.number().int().positive().max(268435456) })).min(1).max(16).optional(),
  commit_object_base64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(65536), fixture_only: z.literal(true),
  original_code_executed_by_production_appraiser: z.literal(false), execution_authorized: z.literal(false), release_authorized: z.literal(false) });
function checkedSnapshot(value) {
  need(SNAPSHOT.safeParse(value).success, "NATIVE_SNAPSHOT_SCHEMA_INVALID");
  need((value.schema_version === "0.2") === Boolean(value.external_blobs) &&
    new Set(value.method_files.map(item => item.file)).size === value.method_files.length &&
    new Set((value.external_blobs || []).map(item => item.path)).size === (value.external_blobs || []).length &&
    (value.external_blobs || []).reduce((sum, item) => sum + item.bytes, 0) <= 268435456 &&
    t.digest(value.method_files) === value.method_sha256 && value.method_files.find(item => item.file === "package-lock.json")?.sha256 === value.dependency_lock_sha256,
  "NATIVE_SNAPSHOT_BINDING_INVALID");
  return value;
}
function readPinned(file, expected, maximum, size) {
  need(fs.realpathSync(file) === file && fs.lstatSync(file).isFile(), "NATIVE_SNAPSHOT_FILE_UNSAFE");
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { const stat = fs.fstatSync(fd); need(stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= maximum && (size === undefined || stat.size === size), "NATIVE_SNAPSHOT_FILE_UNSAFE");
    const bytes = fs.readFileSync(fd); need(bytes.length === stat.size && sha256(bytes) === expected, "NATIVE_SNAPSHOT_BYTES_CHANGED"); return bytes;
  } finally { fs.closeSync(fd); }
}
function restoreSnapshot(name = "cab6d09", options = {}) {
  const snapshot = checkedSnapshot(producer.legacySnapshot(name)), source = fs.realpathSync(path.resolve(__dirname, ".."));
  const bytes = readPinned(path.join(source, "native-training-producer-fixtures", snapshot.archive_file), snapshot.archive_sha256, 268435456);
  const blobs = (snapshot.external_blobs || []).map(blob => ({ ...blob, content: readPinned(path.join(source, blob.path), blob.sha256, 268435456, blob.bytes) }));
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-native-producer-")));
  try {
    cp.execFileSync("tar", ["-xzf", "-", "-C", temporary], { input: bytes }); const root = path.join(temporary, "baseline");
    need(fs.realpathSync(root) === root && fs.lstatSync(root).isDirectory(), "NATIVE_SNAPSHOT_ROOT_UNSAFE");
    for (const blob of blobs) {
      const target = path.join(root, blob.path), parent = fs.realpathSync(path.dirname(target));
      need(parent.startsWith(root + path.sep) && parent === path.dirname(target), "NATIVE_SNAPSHOT_BLOB_TARGET_UNSAFE");
      fs.writeFileSync(target, blob.content, { flag: "wx", mode: 0o644 });
    }
    const git = (args, extra = {}) => cp.execFileSync("git", args, { cwd: root, encoding: "utf8", ...extra }).trim();
    git(["init", "-q"]); git(["config", "core.autocrlf", "false"]); git(["add", "--all"]);
    need(git(["write-tree"]) === snapshot.source_tree, "NATIVE_SNAPSHOT_TREE_CHANGED");
    need(git(["hash-object", "-t", "commit", "-w", "--stdin"], { input: Buffer.from(snapshot.commit_object_base64, "base64") }) === snapshot.source_revision, "NATIVE_SNAPSHOT_COMMIT_CHANGED");
    git(["update-ref", "refs/heads/frozen-producer", snapshot.source_revision]); git(["symbolic-ref", "HEAD", "refs/heads/frozen-producer"]);
    need(sha256(fs.readFileSync(path.join(source, "package-lock.json"))) === snapshot.dependency_lock_sha256, "NATIVE_SNAPSHOT_DEPENDENCY_LOCK_CHANGED");
    const dependencies = path.join(root, "node_modules"), installed = path.join(source, "node_modules"); fs.mkdirSync(dependencies);
    for (const file of fs.readdirSync(installed)) fs.symlinkSync(path.join(installed, file), path.join(dependencies, file), "dir");
    need(require(path.join(root, "skill-mission-controller")).repositoryStateDigest(root) === snapshot.source_state_sha256, "NATIVE_SNAPSHOT_SOURCE_CHANGED");
    need(require(path.join(root, "native-training-product-contract")).methodBinding() === snapshot.method_sha256, "NATIVE_SNAPSHOT_METHOD_CHANGED");
    for (const file of snapshot.method_files) need(sha256(fs.readFileSync(path.join(root, file.file))) === file.sha256, "NATIVE_SNAPSHOT_METHOD_CHANGED");
    return { temporary, root, snapshot, ...(options.loadSupport === false ? {} : { support: require(path.join(root, "native-training-transfer-fixtures/support")) }) };
  } catch (error) { fs.rmSync(temporary, { recursive: true, force: true }); throw error; }
}
module.exports = { checkedSnapshot, restoreSnapshot };
