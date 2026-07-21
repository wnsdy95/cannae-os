#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  resolveRepository,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact
} = require("./repository-artifact-store");

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-artifact-recovery-"));
const repositoryPath = path.join(temporaryRoot, "repository");
const artifactRoot = path.join(temporaryRoot, "artifacts");

try {
  fs.mkdirSync(repositoryPath, { recursive: true });
  git(repositoryPath, ["init", "--quiet"]);
  git(repositoryPath, ["config", "user.email", "fixtures@example.com"]);
  git(repositoryPath, ["config", "user.name", "Fixtures"]);
  git(repositoryPath, ["remote", "add", "origin", "git@github.com:example/recovery-fixture.git"]);
  fs.writeFileSync(path.join(repositoryPath, "README.md"), "# Recovery fixture\n");
  git(repositoryPath, ["add", "README.md"]);
  git(repositoryPath, ["commit", "--quiet", "-m", "fixture baseline"]);
  const repository = resolveRepository(repositoryPath);

  const first = writeRepositoryArtifact({
    repositoryPath,
    artifactRoot,
    missionId: "MIS-Recovery",
    waveId: "W1",
    kind: "reports",
    artifactId: "OUT-Baseline",
    payload: { state: "baseline" },
    createdAt: "2026-07-21T18:00:00+09:00"
  });
  assert.strictEqual(first.manifest_revision, 1);
  assert.strictEqual(verifyRepositoryArtifacts({ repositoryPath, artifactRoot }).valid, true);
  console.log("PASS baseline transaction commits with an integrity history entry");

  assert.throws(() => writeRepositoryArtifact({
    repositoryPath,
    artifactRoot,
    missionId: "MIS-Recovery",
    waveId: "W2",
    kind: "reports",
    artifactId: "OUT-Interrupted",
    payload: { state: "artifact-written" },
    createdAt: "2026-07-21T18:01:00+09:00",
    faultInjectionStage: "artifact_written"
  }), /Injected artifact transaction failure/);
  const interrupted = verifyRepositoryArtifacts({ repositoryPath, artifactRoot });
  assert.strictEqual(interrupted.valid, false);
  assert(interrupted.issues.some(item => item.code === "PENDING_TRANSACTION"));
  const recoveredArtifact = verifyRepositoryArtifacts({ repositoryPath, artifactRoot, recover: true });
  assert.strictEqual(recoveredArtifact.valid, true, JSON.stringify(recoveredArtifact, null, 2));
  assert.strictEqual(recoveredArtifact.recovered_transactions.length, 1);
  assert.strictEqual(recoveredArtifact.manifest_revision, 2);
  console.log("PASS artifact-written crash is reconciled into the manifest under lock");

  assert.throws(() => writeRepositoryArtifact({
    repositoryPath,
    artifactRoot,
    missionId: "MIS-Recovery",
    waveId: "W3",
    kind: "reports",
    artifactId: "OUT-ManifestCommitted",
    payload: { state: "manifest-committed" },
    createdAt: "2026-07-21T18:02:00+09:00",
    faultInjectionStage: "manifest_committed"
  }), /Injected artifact transaction failure/);
  const recoveredJournal = verifyRepositoryArtifacts({ repositoryPath, artifactRoot, recover: true });
  assert.strictEqual(recoveredJournal.valid, true, JSON.stringify(recoveredJournal, null, 2));
  assert.strictEqual(recoveredJournal.recovered_transactions.length, 1);
  assert.strictEqual(recoveredJournal.manifest_revision, 3);
  console.log("PASS committed manifest with a pending journal is finalized idempotently");

  const namespacePath = path.join(artifactRoot, "repositories", repository.key);
  const manifest = JSON.parse(fs.readFileSync(path.join(namespacePath, "manifest.json"), "utf8"));
  const tamperTarget = path.join(artifactRoot, manifest.artifacts[0].relative_path);
  fs.appendFileSync(tamperTarget, "tampered\n");
  const artifactTamper = verifyRepositoryArtifacts({ repositoryPath, artifactRoot });
  assert.strictEqual(artifactTamper.valid, false);
  assert(artifactTamper.issues.some(item => item.code === "ARTIFACT_HASH_MISMATCH"));
  console.log("PASS artifact byte tampering is detected");

  const untouchedArtifact = manifest.artifacts[1];
  fs.writeFileSync(tamperTarget, fs.readFileSync(path.join(artifactRoot, untouchedArtifact.relative_path)));
  const stillInvalid = verifyRepositoryArtifacts({ repositoryPath, artifactRoot });
  assert.strictEqual(stillInvalid.valid, false);
  assert(stillInvalid.issues.some(item => item.code === "ARTIFACT_HASH_MISMATCH"));

  const currentManifestPath = path.join(namespacePath, "manifest.json");
  const changedManifest = JSON.parse(fs.readFileSync(currentManifestPath, "utf8"));
  changedManifest.updated_at = "2026-07-21T20:00:00+09:00";
  fs.writeFileSync(currentManifestPath, `${JSON.stringify(changedManifest, null, 2)}\n`);
  const manifestTamper = verifyRepositoryArtifacts({ repositoryPath, artifactRoot });
  assert.strictEqual(manifestTamper.valid, false);
  assert(manifestTamper.issues.some(item => item.code === "MANIFEST_INTEGRITY_INVALID"));
  console.log("PASS manifest tampering is detected before artifact reuse");

  console.log("Repository artifact recovery fixtures: 5/5 passed");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
