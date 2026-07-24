#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { resolveRepository } = require("./repository-artifact-store");
const { acquireRepositoryLease, assertRepositoryLease, releaseRepositoryLease } = require("./repository-lease");

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
      "--lease-timeout-ms", "30000",
      "--lease-ttl-ms", "30000",
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
    assert.strictEqual(manifest.schema_version, "0.4");
    assert.strictEqual(manifest.artifact_count, writerCount);
    assert.strictEqual(manifest.manifest_revision, writerCount);
    assert.strictEqual(manifest.integrity.history_length, writerCount);
    assert.strictEqual(manifest.isolation.write_ahead_journal, true);
    assert.strictEqual(manifest.isolation.cross_process_manifest_lease, true);
    assert.strictEqual(manifest.isolation.fencing_tokens, true);
    assert.strictEqual(new Set(manifest.artifacts.map(item => item.relative_path)).size, writerCount);
    assert.strictEqual(fs.existsSync(path.join(namespacePath, ".manifest.lease")), false);
    const historyTokens = Array.from({ length: writerCount }, (_value, index) =>
      readJson(path.join(namespacePath, ".manifest-history", `manifest-r${String(index + 1).padStart(8, "0")}.json`)).coordination.fencing_token);
    assert(historyTokens.every((token, index) => index === 0 || token > historyTokens[index - 1]));

    const leasePath = path.join(namespacePath, ".manifest.lease");
    fs.mkdirSync(leasePath);
    fs.writeFileSync(path.join(leasePath, "owner.json"), `${JSON.stringify({
      schema_version: "0.1",
      type: "RepositoryArtifactLease",
      lease_id: "expired-foreign-lease",
      owner_id: "another-host.example:99999999:expired",
      pid: 99999999,
      hostname: "another-host.example",
      fencing_token: manifest.coordination.fencing_token,
      acquired_at: "2000-01-01T00:00:00.000Z",
      renewed_at: "2000-01-01T00:00:00.000Z",
      expires_at: "2000-01-01T00:00:01.000Z"
    })}\n`);
    const recovered = await writeWithCli(repositoryPath, artifactRoot, "OUT-Recovered", ["--lease-ttl-ms", "1000"]);
    assert.strictEqual(recovered.status, 0, recovered.stdout || recovered.stderr);
    manifest = readJson(manifestPath);
    assert.strictEqual(manifest.artifact_count, writerCount + 1);
    assert.strictEqual(manifest.manifest_revision, writerCount + 1);

    fs.mkdirSync(leasePath);
    fs.writeFileSync(path.join(leasePath, "owner.json"), `${JSON.stringify({
      schema_version: "0.1",
      type: "RepositoryArtifactLease",
      lease_id: "active-foreign-lease",
      owner_id: "another-host.example:99999999:active",
      pid: process.pid,
      hostname: "another-host.example",
      fencing_token: manifest.coordination.fencing_token,
      acquired_at: new Date().toISOString(),
      renewed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString()
    })}\n`);
    const activeBlocked = await writeWithCli(repositoryPath, artifactRoot, "OUT-Active-Blocked", ["--lease-timeout-ms", "50", "--lease-ttl-ms", "1000"]);
    assert.strictEqual(activeBlocked.status, 1);
    assert(/Timed out waiting/.test(activeBlocked.stderr));
    fs.rmSync(leasePath, { recursive: true, force: true });

    const expiredWriter = acquireRepositoryLease(namespacePath, { leaseTimeoutMs: 100, leaseTtlMs: 10 });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
    const replacementWriter = acquireRepositoryLease(namespacePath, { leaseTimeoutMs: 100, leaseTtlMs: 1000 });
    assert(replacementWriter.fencing_token > expiredWriter.fencing_token);
    assert.throws(() => assertRepositoryLease(expiredWriter), /fenced|expired/);
    releaseRepositoryLease(replacementWriter);

    const validation = spawnSync("node", [
      "validator-cli-prototype/validate.js",
      manifestPath,
      "repository-artifact-manifest"
    ], { cwd: ROOT, encoding: "utf8" });
    assert.strictEqual(validation.status, 0, validation.stdout || validation.stderr);

    console.log(`PASS ${writerCount} concurrent writers preserve every manifest entry`);
    console.log("PASS manifest revisions and fencing tokens increase monotonically under contention");
    console.log("PASS expired foreign-host lease is recovered with a higher fencing token");
    console.log("PASS unexpired foreign-host lease is not stolen");
    console.log("PASS expired writer is fenced after a replacement lease is granted");
    console.log("PASS v0.4 lease and fencing manifest validates");
    console.log("Repository artifact concurrency fixtures: 6/6 passed");
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
