const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), cp = require("node:child_process");
const assert = require("node:assert/strict");
function runCopiedRuntime(source, scenario) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-issuance-source-")), runtime = path.join(temporary, "runtime");
  fs.mkdirSync(runtime);
  try {
    const files = cp.execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: source, encoding: "utf8" }).split("\0").filter(Boolean);
    for (const file of new Set(files)) {
      const target = path.join(runtime, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(source, file), target);
    }
    fs.appendFileSync(path.join(runtime, ".gitignore"), "\nnode_modules\n");
    cp.execFileSync("git", ["-C", runtime, "init", "-q"]); cp.execFileSync("git", ["-C", runtime, "add", "--all"]);
    cp.execFileSync("git", ["-C", runtime, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "synthetic runtime copy"]);
    fs.symlinkSync(path.join(source, "node_modules"), path.join(runtime, "node_modules"), "dir");
    const child = cp.spawnSync(process.execPath, [path.join(runtime, "dispatch-issuance-fixtures/source-runtime-worker.js"), scenario],
      { cwd: temporary, encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    const result = JSON.parse(child.stdout); assert.equal(result.scenario, scenario); assert.equal(result.passed, true);
    return result;
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
module.exports = { runCopiedRuntime };
