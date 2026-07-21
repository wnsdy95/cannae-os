#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  manifestDigest,
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
    artifactId: "OUT-HistoryReserved",
    payload: { state: "history-reserved" },
    createdAt: "2026-07-21T18:02:00+09:00",
    faultInjectionStage: "history_created"
  }), /Injected artifact transaction failure/);
  const recoveredReservation = verifyRepositoryArtifacts({ repositoryPath, artifactRoot, recover: true });
  assert.strictEqual(recoveredReservation.valid, true, JSON.stringify(recoveredReservation, null, 2));
  assert.strictEqual(recoveredReservation.recovered_transactions.length, 1);
  assert.strictEqual(recoveredReservation.manifest_revision, 3);
  console.log("PASS history-reserved revision is finalized exactly under a replacement lease");

  assert.throws(() => writeRepositoryArtifact({
    repositoryPath,
    artifactRoot,
    missionId: "MIS-Recovery",
    waveId: "W4",
    kind: "reports",
    artifactId: "OUT-ManifestCommitted",
    payload: { state: "manifest-committed" },
    createdAt: "2026-07-21T18:03:00+09:00",
    faultInjectionStage: "manifest_committed"
  }), /Injected artifact transaction failure/);
  const recoveredJournal = verifyRepositoryArtifacts({ repositoryPath, artifactRoot, recover: true });
  assert.strictEqual(recoveredJournal.valid, true, JSON.stringify(recoveredJournal, null, 2));
  assert.strictEqual(recoveredJournal.recovered_transactions.length, 1);
  assert.strictEqual(recoveredJournal.manifest_revision, 4);
  console.log("PASS committed manifest with a pending journal is finalized idempotently");

  const migrationArtifactRoot = path.join(temporaryRoot, "migration-artifacts");
  const migrationNamespaceRoot = path.join("repositories", repository.key);
  const migrationNamespacePath = path.join(migrationArtifactRoot, migrationNamespaceRoot);
  const legacyRelativePath = path.join(migrationNamespaceRoot, "missions", "MIS-Migration", "C0", "reports", "OUT-Legacy.json").split(path.sep).join("/");
  const legacyBytes = Buffer.from(`${JSON.stringify({ state: "legacy-v0.3" }, null, 2)}\n`);
  const legacyArtifactPath = path.join(migrationArtifactRoot, legacyRelativePath);
  fs.mkdirSync(path.dirname(legacyArtifactPath), { recursive: true });
  fs.writeFileSync(legacyArtifactPath, legacyBytes);
  const legacyManifest = {
    schema_version: "0.3",
    type: "RepositoryArtifactManifest",
    id: `RAM-${repository.identity_fingerprint.slice(0, 16)}`,
    repository: {
      key: repository.key,
      label: repository.label,
      identity_fingerprint: repository.identity_fingerprint,
      head_commit: repository.head_commit
    },
    namespace_root: migrationNamespaceRoot.split(path.sep).join("/"),
    manifest_revision: 1,
    previous_manifest_sha256: "none",
    artifacts: [{
      id: "RA-LegacyMigration",
      artifact_id: "OUT-Legacy",
      mission_id: "MIS-Migration",
      wave_id: "C0",
      kind: "reports",
      file_name: "OUT-Legacy.json",
      content_type: "application/json",
      byte_size: legacyBytes.length,
      relative_path: legacyRelativePath,
      sha256: require("crypto").createHash("sha256").update(legacyBytes).digest("hex"),
      created_at: "2026-07-21T17:59:00+09:00"
    }],
    artifact_count: 1,
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
      history_start_revision: 1,
      history_length: 1,
      pending_transaction_count: 0,
      sidecar_required: true
    },
    created_at: "2026-07-21T17:59:00+09:00",
    updated_at: "2026-07-21T17:59:00+09:00"
  };
  legacyManifest.integrity.canonical_manifest_sha256 = manifestDigest(legacyManifest);
  fs.mkdirSync(path.join(migrationNamespacePath, ".manifest-history"), { recursive: true });
  fs.writeFileSync(path.join(migrationNamespacePath, ".manifest-history", "manifest-r00000001.json"), `${JSON.stringify(legacyManifest, null, 2)}\n`);
  fs.writeFileSync(path.join(migrationNamespacePath, "manifest.json"), `${JSON.stringify(legacyManifest, null, 2)}\n`);
  fs.writeFileSync(path.join(migrationNamespacePath, "manifest.sha256"), `${legacyManifest.integrity.canonical_manifest_sha256}\n`);
  writeRepositoryArtifact({
    repositoryPath,
    artifactRoot: migrationArtifactRoot,
    missionId: "MIS-Migration",
    waveId: "C1",
    kind: "reports",
    artifactId: "OUT-After-Migration",
    payload: { state: "v0.4" },
    createdAt: "2026-07-21T18:00:00+09:00"
  });
  const migratedVerification = verifyRepositoryArtifacts({ repositoryPath, artifactRoot: migrationArtifactRoot });
  assert.strictEqual(migratedVerification.valid, true, JSON.stringify(migratedVerification, null, 2));
  const migratedHistoryTwo = JSON.parse(fs.readFileSync(path.join(migrationNamespacePath, ".manifest-history", "manifest-r00000002.json"), "utf8"));
  const migratedHistoryThree = JSON.parse(fs.readFileSync(path.join(migrationNamespacePath, ".manifest-history", "manifest-r00000003.json"), "utf8"));
  assert.strictEqual(migratedHistoryTwo.coordination.lease_id, migratedHistoryThree.coordination.lease_id);
  assert.strictEqual(migratedHistoryTwo.coordination.fencing_token, migratedHistoryThree.coordination.fencing_token);
  console.log("PASS one lease may migrate and commit multiple revisions without weakening fencing");

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

  console.log("Repository artifact recovery fixtures: 7/7 passed");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
