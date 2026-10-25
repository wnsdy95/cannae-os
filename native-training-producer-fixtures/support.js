const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), cp = require("node:child_process"), assert = require("node:assert/strict");
const producer = require("../native-training-producer"), { sha256 } = require("../order-intake-contract");
function restoreProducer() {
  const snapshot = producer.legacySnapshot(), archive = path.join(__dirname, snapshot.archive_file);
  assert.equal(sha256(fs.readFileSync(archive)), snapshot.archive_sha256);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-native-producer-"));
  try {
    cp.execFileSync("tar", ["-xzf", archive, "-C", temporary]);
    const root = path.join(temporary, "baseline"), git = (args, options = {}) => cp.execFileSync("git", args, { cwd: root, encoding: "utf8", ...options }).trim();
    git(["init", "-q"]); git(["config", "core.autocrlf", "false"]); git(["add", "--all"]);
    assert.equal(git(["write-tree"]), snapshot.source_tree);
    const commit = Buffer.from(snapshot.commit_object_base64, "base64");
    assert.equal(git(["hash-object", "-t", "commit", "-w", "--stdin"], { input: commit }), snapshot.source_revision);
    git(["update-ref", "refs/heads/frozen-producer", snapshot.source_revision]); git(["symbolic-ref", "HEAD", "refs/heads/frozen-producer"]);
    const lock = fs.readFileSync(path.join(__dirname, "../package-lock.json")); assert.equal(sha256(lock), snapshot.dependency_lock_sha256);
    const dependencies = path.join(root, "node_modules"), installed = path.join(__dirname, "../node_modules");
    // Preserve the ignored directory shape; a top-level symlink is an untracked source change.
    fs.mkdirSync(dependencies);
    for (const name of fs.readdirSync(installed)) fs.symlinkSync(path.join(installed, name), path.join(dependencies, name), "dir");
    assert.equal(require(path.join(root, "skill-mission-controller")).repositoryStateDigest(root), snapshot.source_state_sha256);
    assert.equal(require(path.join(root, "native-training-product-contract")).methodBinding(), snapshot.method_sha256);
    for (const file of snapshot.method_files) assert.equal(sha256(fs.readFileSync(path.join(root, file.file))), file.sha256);
    return { temporary, root, snapshot, support: require(path.join(root, "native-training-transfer-fixtures/support")) };
  } catch (error) { fs.rmSync(temporary, { recursive: true, force: true }); throw error; }
}
module.exports = { restoreProducer };
