#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { resolveRepository, writeRepositoryArtifact, writeRepositoryFileArtifact } = require("./repository-artifact-store");

const ROOT = __dirname;

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

function makeRepository(parent, name, remoteName) {
  const repositoryPath = path.join(parent, name, "repo");
  fs.mkdirSync(repositoryPath, { recursive: true });
  git(repositoryPath, ["init", "--quiet"]);
  git(repositoryPath, ["remote", "add", "origin", `git@github.com:example/${remoteName}.git`]);
  return repositoryPath;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-artifact-isolation-"));

try {
  const repositoryA = makeRepository(temporaryRoot, "a", "shared-name");
  const repositoryB = makeRepository(temporaryRoot, "b", "shared-name");
  const artifactRoot = path.join(temporaryRoot, "artifacts");
  const common = {
    artifactRoot,
    missionId: "MIS-Shared",
    waveId: "W1",
    kind: "agent-outputs",
    artifactId: "OUT-Shared",
    createdAt: "2026-07-21T15:30:00+09:00"
  };

  const artifactA = writeRepositoryArtifact({ ...common, repositoryPath: repositoryA, payload: { repository: "A" } });
  const artifactB = writeRepositoryArtifact({ ...common, repositoryPath: repositoryB, payload: { repository: "B" } });

  assert.notStrictEqual(artifactA.repository.key, artifactB.repository.key);
  assert.notStrictEqual(artifactA.artifact_path, artifactB.artifact_path);
  assert(artifactA.artifact_path.includes(`${path.sep}repositories${path.sep}${artifactA.repository.key}${path.sep}`));
  assert(artifactB.artifact_path.includes(`${path.sep}repositories${path.sep}${artifactB.repository.key}${path.sep}`));
  assert.deepStrictEqual(readJson(artifactA.artifact_path), { repository: "A" });
  assert.deepStrictEqual(readJson(artifactB.artifact_path), { repository: "B" });

  const manifestA = readJson(artifactA.manifest_path);
  const manifestB = readJson(artifactB.manifest_path);
  assert.strictEqual(manifestA.artifact_count, 1);
  assert.strictEqual(manifestB.artifact_count, 1);
  assert(!JSON.stringify(manifestA).includes(repositoryA));
  assert(!JSON.stringify(manifestB).includes(repositoryB));

  const markdownSource = path.join(temporaryRoot, "mission-report.md");
  fs.writeFileSync(markdownSource, "# Repository B Report\n\nIsolated output.\n");
  const fileArtifact = writeRepositoryFileArtifact({
    ...common,
    repositoryPath: repositoryB,
    kind: "reports",
    artifactId: "REPORT-Shared",
    sourcePath: markdownSource
  });
  assert(fileArtifact.artifact_path.endsWith("REPORT-Shared.md"));
  assert.strictEqual(fs.readFileSync(fileArtifact.artifact_path, "utf8"), "# Repository B Report\n\nIsolated output.\n");
  assert.strictEqual(readJson(fileArtifact.manifest_path).artifact_count, 2);

  const fileCliResult = spawnSync("node", [
    "repository-artifact-store.js",
    "--repository", repositoryB,
    "--artifact-root", artifactRoot,
    "--mission", "MIS-Shared",
    "--wave", "W1",
    "--kind", "reports",
    "--artifact-id", "REPORT-CLI",
    "--source", markdownSource
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(fileCliResult.status, 0, fileCliResult.stdout || fileCliResult.stderr);
  assert(JSON.parse(fileCliResult.stdout).artifact_path.endsWith("REPORT-CLI.md"));
  assert.strictEqual(readJson(fileArtifact.manifest_path).artifact_count, 3);

  assert.throws(() => writeRepositoryArtifact({
    ...common,
    repositoryPath: repositoryA,
    payload: { repository: "changed" }
  }), /already exists with different content/);
  assert.throws(() => writeRepositoryArtifact({
    ...common,
    repositoryPath: repositoryA,
    missionId: "../escape",
    payload: { repository: "escape" }
  }), /path-safe identifier/);

  const repositoryC = makeRepository(temporaryRoot, "c", "shared-name");
  const repositoryCIdentity = resolveRepository(repositoryC);
  const escapedDirectory = path.join(temporaryRoot, "escaped-artifacts");
  fs.mkdirSync(path.join(artifactRoot, "repositories"), { recursive: true });
  fs.mkdirSync(escapedDirectory, { recursive: true });
  fs.symlinkSync(escapedDirectory, path.join(artifactRoot, "repositories", repositoryCIdentity.key));
  assert.throws(() => writeRepositoryArtifact({
    ...common,
    repositoryPath: repositoryC,
    payload: { repository: "C" }
  }), /escapes the artifact root through a symlink/);

  const compilerResult = spawnSync("node", [
    "model-assignment-compiler.js",
    "sample-payloads/valid-model-registry.json",
    "sample-payloads/valid-model-assignment-request.json",
    "--write-artifact",
    "--repository", repositoryA,
    "--artifact-root", artifactRoot
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(compilerResult.status, 0, compilerResult.stdout || compilerResult.stderr);
  assert(/Artifact written:/.test(compilerResult.stderr));

  const preflightResult = spawnSync("node", [
    "integrated-mission-preflight-runner.js",
    "sample-payloads/valid-integrated-mission-preflight.json",
    "--write-artifact",
    "--repository", repositoryA,
    "--artifact-root", artifactRoot
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(preflightResult.status, 0, preflightResult.stdout || preflightResult.stderr);
  assert(/Artifact written:/.test(preflightResult.stderr));

  const routingResult = spawnSync("node", [
    "codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js",
    "--receipt",
    "--scope=agent",
    "--mission=MIS-Shared",
    "--wave=W1",
    "--agent=artifact-agent",
    "--actor=ai",
    "--role=S3",
    "--department=operations",
    "--authority=scoped-execution",
    "--write-artifact",
    "--target-repository", repositoryA,
    "--artifact-root", artifactRoot,
    "repository artifact output",
    "."
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(routingResult.status, 0, routingResult.stdout || routingResult.stderr);
  assert(/Artifact written:/.test(routingResult.stderr));
  const routingReceipt = JSON.parse(routingResult.stdout);
  assert(routingReceipt.router_command.includes("<local-path>"));
  assert(!routingReceipt.router_command.includes(repositoryA));

  const integratedManifest = readJson(artifactA.manifest_path);
  assert.strictEqual(integratedManifest.artifact_count, 4);
  assert(integratedManifest.artifacts.some(item => item.kind === "model-assignment-compilations"));
  assert(integratedManifest.artifacts.some(item => item.kind === "integrated-mission-preflights"));
  assert(integratedManifest.artifacts.some(item => item.kind === "routing-receipts"));

  const validation = spawnSync("node", [
    "validator-cli-prototype/validate.js",
    artifactA.manifest_path,
    "repository-artifact-manifest"
  ], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(validation.status, 0, validation.stdout || validation.stderr);

  console.log("PASS same mission artifacts are isolated by repository identity");
  console.log("PASS manifests contain no absolute repository paths");
  console.log("PASS JSON and file deliverables share the repository namespace");
  console.log("PASS conflicting overwrite, traversal, and symlink escape are blocked");
  console.log("PASS router, compiler, and integrated preflight persist into the repository namespace");
  console.log("Repository artifact isolation fixtures: 5/5 passed");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
