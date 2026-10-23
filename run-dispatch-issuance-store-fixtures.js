#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const store = require("./repository-artifact-store"), dispatch = require("./dispatch-runtime-controller");
const { runCopiedRuntime } = require("./dispatch-issuance-fixtures/source-runtime");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-issuance-store-")), repository = path.join(root, "repo");
fs.mkdirSync(repository);
let passed = 0;
const check = (name, callback) => { callback(); passed++; console.log(`PASS ${name}`); };
const git = args => execFileSync("git", args, { cwd: repository, encoding: "utf8" });
const options = { repository, artifactRoot: path.join(root, "proof") };
const verificationOptions = { repositoryPath: repository, artifactRoot: options.artifactRoot };
const publish = (id, extra = {}) => store.writeRepositoryArtifact({ ...verificationOptions,
  missionId: "MIS-ISSUANCE-STORE", waveId: "W1", kind: "synthetic-metadata", artifactId: id,
  payload: { type: "SyntheticMetadata", id, execution_authorized: false }, ...extra });
try {
  git(["init", "-q"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.com"]);
  fs.writeFileSync(path.join(repository, "README.md"), "Synthetic empty-store regression.\n");
  git(["add", "README.md"]); git(["commit", "-qm", "fixture"]);
  check("a missing artifact root does not prevent an ordinary first wave", () => {
    assert.equal(store.verifyRepositoryArtifacts(verificationOptions).issues[0].code, "ARTIFACT_ROOT_MISSING");
    dispatch.assertNoPendingIssuance(options); assert.equal(fs.existsSync(options.artifactRoot), false);
  });
  check("an existing root without this repository namespace remains empty without writes", () => {
    fs.mkdirSync(options.artifactRoot);
    assert.equal(store.verifyRepositoryArtifacts(verificationOptions).issues[0].code, "REPOSITORY_NAMESPACE_MISSING");
    dispatch.assertNoPendingIssuance(options); assert.deepEqual(fs.readdirSync(options.artifactRoot), []);
  });
  const written = publish("SYNTHETIC-BASE");
  check("a valid initialized store without an issuance is unchanged", () => {
    const before = store.verifyRepositoryArtifacts(verificationOptions); assert.equal(before.valid, true);
    dispatch.assertNoPendingIssuance(options);
    assert.equal(store.verifyRepositoryArtifacts(verificationOptions).manifest_sha256, before.manifest_sha256);
  });
  check("a pending store journal is not empty and is never silently recovered", () => {
    assert.throws(() => publish("SYNTHETIC-PENDING", { faultInjectionStage: "prepared" }), /Injected artifact transaction failure/);
    const before = store.verifyRepositoryArtifacts(verificationOptions);
    assert.equal(before.valid, false); assert(before.issues.some(item => item.code === "PENDING_TRANSACTION"));
    assert.throws(() => dispatch.assertNoPendingIssuance(options), /PENDING_TRANSACTION/);
    const after = store.verifyRepositoryArtifacts(verificationOptions);
    assert.equal(after.valid, false); assert(after.issues.some(item => item.code === "PENDING_TRANSACTION"));
    assert.equal(after.manifest_sha256, before.manifest_sha256);
    assert.equal(store.verifyRepositoryArtifacts({ ...verificationOptions, recover: true }).valid, true);
  });
  check("corrupt retained content cannot use the empty-store exception", () => {
    fs.appendFileSync(path.join(options.artifactRoot, written.relative_path), "Synthetic corruption.\n");
    const invalid = store.verifyRepositoryArtifacts(verificationOptions); assert.equal(invalid.valid, false);
    assert(invalid.issues.length > 0); assert(invalid.issues.every(item => !["ARTIFACT_ROOT_MISSING", "REPOSITORY_NAMESPACE_MISSING"].includes(item.code)));
    assert.throws(() => dispatch.assertNoPendingIssuance(options), /Repository artifact verification failed/);
    assert.equal(store.verifyRepositoryArtifacts(verificationOptions).valid, false);
  });
  for (const [scenario, name] of [
    ["pending-source", "covered source drift denies exact pending recovery without replay"],
    ["resolution-unchanged", "final-resolution journal recovery preserves an unchanged grant and only the remaining task"],
    ["resolution-source", "recovered commit history cannot admit changed-source work or reactivate a revoked lease"],
    ["admitted-result", "source drift preserves already-admitted result settlement but denies the next task"],
    ["allow-publication", "a source change immediately before allow publication cannot persist new authority"]
  ]) check(name, () => {
    const result = runCopiedRuntime(__dirname, scenario);
    assert.equal(result.actual_task_reads, scenario === "resolution-unchanged" ? 2 : 1);
  });
  console.log(JSON.stringify({ total: passed, passed, failed: 0,
    scope: "Actual local store and copied-runtime regressions; synthetic authority only, no native client or protected deployment proof." }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
