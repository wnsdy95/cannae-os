#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { resolveRepository } = require("./repository-artifact-store");

const ROOT = __dirname;

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeWithCli(repositoryPath, artifactRoot, artifactId, extraArgs = []) {
  return new Promise(resolve => {
    const child = spawn("node", [
      "repository-artifact-store.js",
      "--repository", repositoryPath,
      "--artifact-root", artifactRoot,
      "--mission", "MIS-Concurrent",
      "--wave", "W1",
      "--kind", "agent-outputs",
      "--artifact-id", artifactId,
      ...extraArgs
    ], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("close", status => resolve({ status, stdout, stderr }));
    child.stdin.end(`${JSON.stringify({ artifact_id: artifactId })}\n`);
  });
}

async function main() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-artifact-concurrency-"));
  try {
    const repositoryPath = path.join(temporaryRoot, "repository");
    const artifactRoot = path.join(temporaryRoot, "artifacts");
    fs.mkdirSync(repositoryPath, { recursive: true });
    git(repositoryPath, ["init", "--quiet"]);
    git(repositoryPath, ["remote", "add", "origin", "git@github.com:example/concurrent-artifacts.git"]);
    const repository = resolveRepository(repositoryPath);
    const namespacePath = path.join(artifactRoot, "repositories", repository.key);
    const manifestPath = path.join(namespacePath, "manifest.json");

    const writerCount = 24;
    const results = await Promise.all(Array.from({ length: writerCount }, (_value, index) =>
      writeWithCli(repositoryPath, artifactRoot, `OUT-${String(index + 1).padStart(2, "0")}`)));
    for (const result of results) assert.strictEqual(result.status, 0, result.stdout || result.stderr);

    let manifest = readJson(manifestPath);
    assert.strictEqual(manifest.schema_version, "0.3");
    assert.strictEqual(manifest.artifact_count, writerCount);
    assert.strictEqual(manifest.manifest_revision, writerCount);
    assert.strictEqual(manifest.integrity.history_length, writerCount);
    assert.strictEqual(manifest.isolation.write_ahead_journal, true);
    assert.strictEqual(new Set(manifest.artifacts.map(item => item.relative_path)).size, writerCount);
    assert.strictEqual(fs.existsSync(path.join(namespacePath, ".manifest.lock")), false);

    const staleLockPath = path.join(namespacePath, ".manifest.lock");
    fs.mkdirSync(staleLockPath);
    fs.writeFileSync(path.join(staleLockPath, "owner.json"), `${JSON.stringify({
      pid: 99999999,
      hostname: os.hostname(),
      token: "stale-local-lock",
      acquired_at: "2000-01-01T00:00:00.000Z"
    })}\n`);
    const recovered = await writeWithCli(repositoryPath, artifactRoot, "OUT-Recovered", ["--lock-stale-ms", "1"]);
    assert.strictEqual(recovered.status, 0, recovered.stdout || recovered.stderr);
    manifest = readJson(manifestPath);
    assert.strictEqual(manifest.artifact_count, writerCount + 1);
    assert.strictEqual(manifest.manifest_revision, writerCount + 1);

    fs.mkdirSync(staleLockPath);
    fs.writeFileSync(path.join(staleLockPath, "owner.json"), `${JSON.stringify({
      pid: process.pid,
      hostname: os.hostname(),
      token: "active-local-lock",
      acquired_at: "2000-01-01T00:00:00.000Z"
    })}\n`);
    const activeBlocked = await writeWithCli(repositoryPath, artifactRoot, "OUT-Active-Blocked", ["--lock-timeout-ms", "50", "--lock-stale-ms", "1"]);
    assert.strictEqual(activeBlocked.status, 1);
    assert(/Timed out waiting/.test(activeBlocked.stderr));
    fs.rmSync(staleLockPath, { recursive: true, force: true });

    fs.mkdirSync(staleLockPath);
    fs.writeFileSync(path.join(staleLockPath, "owner.json"), `${JSON.stringify({
      pid: 99999999,
      hostname: "another-host.example",
      token: "foreign-host-lock",
      acquired_at: "2000-01-01T00:00:00.000Z"
    })}\n`);
    const foreignBlocked = await writeWithCli(repositoryPath, artifactRoot, "OUT-Foreign-Blocked", ["--lock-timeout-ms", "50", "--lock-stale-ms", "1"]);
    assert.strictEqual(foreignBlocked.status, 1);
    assert(/Timed out waiting/.test(foreignBlocked.stderr));
    fs.rmSync(staleLockPath, { recursive: true, force: true });

    const validation = spawnSync("node", [
      "validator-cli-prototype/validate.js",
      manifestPath,
      "repository-artifact-manifest"
    ], { cwd: ROOT, encoding: "utf8" });
    assert.strictEqual(validation.status, 0, validation.stdout || validation.stderr);

    console.log(`PASS ${writerCount} concurrent writers preserve every manifest entry`);
    console.log("PASS manifest revisions increase monotonically under contention");
    console.log("PASS dead same-host stale lock is recovered");
    console.log("PASS active same-host lock is not stolen");
    console.log("PASS foreign-host stale lock fails closed");
    console.log("Repository artifact concurrency fixtures: 5/5 passed");
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
