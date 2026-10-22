#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const store = require("./repository-artifact-store"), dispatch = require("./dispatch-runtime-controller");
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
  check("a changed covered runtime entry blocks exact recovery without replaying work", () => {
    const runtime = path.join(root, "runtime-copy"); fs.mkdirSync(runtime);
    const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: __dirname, encoding: "utf8" }).split("\0").filter(Boolean);
    for (const file of new Set(files)) {
      const target = path.join(runtime, file); fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(__dirname, file), target);
    }
    fs.appendFileSync(path.join(runtime, ".gitignore"), "\nnode_modules\n");
    execFileSync("git", ["-C", runtime, "init", "-q"]);
    execFileSync("git", ["-C", runtime, "add", "--all"]);
    execFileSync("git", ["-C", runtime, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "synthetic runtime copy"]);
    fs.symlinkSync(path.join(__dirname, "node_modules"), path.join(runtime, "node_modules"), "dir");
    // Change only the disposable copy; the tested worktree stays frozen.
    const code = `const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
      const root = process.argv[1], store = require(path.join(root, "repository-artifact-store")), write = store.writeRepositoryArtifact;
      let interrupt = false;
      store.writeRepositoryArtifact = options => {
        if (interrupt && options.kind === "agent-dispatch-leases") { interrupt = false; throw new Error("Synthetic issuance interruption"); }
        return write(options);
      };
      const s = require(path.join(root, "disciplined-initiative-fixtures/support")), env = s.environment();
      try {
        s.start(env); assert.equal(s.admit(env, s.inputs.planned, "actual-read", 100).decision, "allow");
        s.complete(env, s.inputs.planned, "actual-read", 101); s.dispatch.interruptLease(s.optionsAt(env, 110), env.leaseId);
        interrupt = true;
        assert.throws(() => s.dispatch.resumeLease(s.optionsAt(env, 120), env.leaseId,
          { sessionId: "observed-next-session", providerAgentId: "main" }), /Synthetic issuance interruption/);
        const pending = s.dispatch.dispatchStatus(env.options).unresolved_issuances;
        assert.equal(pending.length, 1); const id = pending[0].issuance_ref.artifact_id;
        const contract = require(path.join(root, "dispatch-issuance-contract")), before = contract.runtimeDigest();
        fs.appendFileSync(path.join(root, "dispatch-runtime-controller.js"), "\\n// Synthetic covered source change.\\n");
        assert.notEqual(contract.runtimeDigest(), before);
        assert.throws(() => s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 122), id), /DISPATCH_ISSUANCE_RUNTIME_CHANGED/);
        const after = s.dispatch.dispatchStatus(env.options); assert.equal(after.unresolved_issuances.length, 1);
        assert.equal(after.unresolved_issuances[0].lease_published, false);
        assert.equal(s.dispatch.cancelDispatchIssuance(s.optionsAt(env, 123), id, "Preserve source drift; cancel unused authority.").execution_authorized, false);
        assert.equal(s.dispatch.dispatchStatus(env.options).leases[0].status, "superseded"); assert.equal(env.readCount, 1);
        console.log(JSON.stringify({ source_change_observed: true, recovery_denied: true, actual_task_reads: env.readCount }));
      } finally { fs.rmSync(env.root, { recursive: true, force: true }); }`;
    const child = spawnSync(process.execPath, ["-e", code, runtime], { cwd: root, encoding: "utf8", shell: false,
      maxBuffer: 8 * 1024 * 1024 });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.deepEqual(JSON.parse(child.stdout), { source_change_observed: true, recovery_denied: true, actual_task_reads: 1 });
  });
  console.log(JSON.stringify({ total: passed, passed, failed: 0,
    scope: "Actual local store and copied-runtime regressions; synthetic authority only, no native client or protected deployment proof." }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
