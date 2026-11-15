const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, ".."), store = require("../repository-artifact-store"), write = store.writeRepositoryArtifact;
const scenario = process.argv[2];
assert(["pending-source", "resolution-unchanged", "resolution-source", "admitted-result", "allow-publication"].includes(scenario));
const sourceFile = path.join(root, "dispatch-runtime-controller.js"), originalSource = fs.readFileSync(sourceFile);
let fault;
function changeSource() {
  fs.appendFileSync(sourceFile, "\n// Synthetic covered source change in this disposable copy.\n");
}
store.writeRepositoryArtifact = options => {
  if (fault === "before-lease" && options.kind === "agent-dispatch-leases") {
    fault = null; throw new Error("Synthetic issuance interruption");
  }
  if (fault === "resolution" && options.kind === "dispatch-lease-issuance-resolutions" && options.payload.outcome === "committed") {
    fault = null; options.faultInjectionStage = "artifact_written";
  }
  if (fault === "allow" && options.kind === "tool-admission-events" && options.payload.decision === "allow") {
    fault = null; changeSource();
  }
  return write(options);
};
const s = require("../disciplined-initiative-fixtures/support"), env = s.environment();
const options = { repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot };
function assertRevokedAfterSourceRestore(leaseId, actor, seconds) {
  fs.writeFileSync(sourceFile, originalSource);
  assert.equal(s.dispatch.activeLease(s.optionsAt(env, seconds), actor).code, "LEASE_NOT_ACTIVE");
  const operation = s.dispatch.dispatchStatus(env.options).issuances.find(item => item.planned_lease_id === leaseId);
  assert.equal(operation.runtime_source_current, true);
  assert.equal(s.dispatch.recoverDispatchIssuance(s.optionsAt(env, seconds + 1), operation.issuance_ref.artifact_id).execution_authorized, false);
}
const denied = (actor, seconds = 123) => {
  const result = s.dispatch.admitToolRequest(s.optionsAt(env, seconds), actor,
    { ...s.hook(env, s.inputs.safeguard, "source-denied"), session_id: actor.sessionId });
  assert.equal(result.decision, "deny"); assert(result.reason_codes.includes("DISPATCH_ISSUANCE_RUNTIME_CHANGED"));
};
try {
  s.start(env); assert.equal(s.admit(env, s.inputs.planned, "actual-read", 100).decision, "allow");
  if (scenario === "admitted-result") changeSource();
  s.complete(env, s.inputs.planned, "actual-read", 101); assert.equal(env.readCount, 1);
  if (scenario === "admitted-result") {
    denied(env.actor, 102);
    assert.equal(s.dispatch.revokeLease(s.optionsAt(env, 103), env.leaseId).status, "revoked");
    assertRevokedAfterSourceRestore(env.leaseId, env.actor, 104);
  } else if (scenario === "allow-publication") {
    fault = "allow";
    assert.throws(() => s.admit(env, s.inputs.safeguard, "publication-race", 130), /DISPATCH_ISSUANCE_RUNTIME_CHANGED/);
    const view = require("../method-deviation-gate").load(env.options);
    assert.equal(view.manifest.artifacts.filter(entry => entry.kind === "tool-admission-events").length, 1);
    denied(env.actor, 131);
    assert.equal(s.dispatch.revokeLease(s.optionsAt(env, 132), env.leaseId).status, "revoked");
    assertRevokedAfterSourceRestore(env.leaseId, env.actor, 133);
  } else {
    s.dispatch.interruptLease(s.optionsAt(env, 110), env.leaseId);
    fault = scenario === "pending-source" ? "before-lease" : "resolution";
    assert.throws(() => s.dispatch.resumeLease(s.optionsAt(env, 120), env.leaseId,
      { sessionId: "observed-next-session", providerAgentId: "main" }), /Synthetic issuance interruption|Injected artifact transaction failure/);
    if (scenario !== "resolution-unchanged") changeSource();
    if (scenario !== "pending-source") {
      const pending = store.verifyRepositoryArtifacts(options); assert.equal(pending.valid, false);
      assert(pending.issues.some(item => item.code === "PENDING_TRANSACTION"));
      const repaired = store.verifyRepositoryArtifacts({ ...options, recover: true }); assert.equal(repaired.valid, true);
      assert.equal(repaired.recovered_transactions.length, 1);
    }
    const projection = s.dispatch.dispatchStatus(env.options);
    const operation = projection.issuances.find(item => item.previous_lease_ref.artifact_id === env.leaseId);
    const id = operation.issuance_ref.artifact_id;
    if (scenario === "pending-source") {
      assert.equal(operation.runtime_source_current, false);
      assert.throws(() => s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 122), id), /DISPATCH_ISSUANCE_RUNTIME_CHANGED/);
      assert.equal(s.dispatch.cancelDispatchIssuance(s.optionsAt(env, 123), id, "Preserve drift and cancel unused authority.").execution_authorized, false);
      assert.equal(s.dispatch.dispatchStatus(env.options).leases[0].status, "superseded");
    } else {
      assert.equal(operation.status, "committed");
      const actor = { ...env.actor, sessionId: "observed-next-session" };
      if (scenario === "resolution-source") {
        assert.equal(operation.runtime_source_current, false);
        assert.equal(s.dispatch.activeLease(s.optionsAt(env, 122), actor).code, "DISPATCH_ISSUANCE_RUNTIME_CHANGED");
        denied(actor);
        const result = s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 124), id);
        assert.equal(result.status, "committed"); assert.equal(result.execution_authorized, false);
        assert.throws(() => s.dispatch.cancelDispatchIssuance(s.optionsAt(env, 125), id, "Not an unused pending request."), /ALREADY_COMMITTED/);
        assert.equal(s.dispatch.revokeLease(s.optionsAt(env, 126), operation.planned_lease_id).status, "revoked");
        assertRevokedAfterSourceRestore(operation.planned_lease_id, actor, 127);
      } else {
        assert.equal(operation.runtime_source_current, true);
        const result = s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 122), id), request = s.read(env, operation.issuance_ref);
        assert.equal(result.execution_authorized, true); assert.equal(result.lease.nonce, request.planned_lease.nonce);
        assert.equal(result.lease.expires_at, request.expires_at);
        env.actor = actor; env.leaseId = result.lease.id;
        assert.equal(s.admit(env, s.inputs.safeguard, "remaining-read", 130).decision, "allow");
        s.complete(env, s.inputs.safeguard, "remaining-read", 131);
        assert.equal(s.dispatch.completeLease(s.optionsAt(env, 132), env.leaseId).status, "completed");
        assert.equal(s.dispatch.recoverDispatchIssuance(s.optionsAt(env, 133), id).execution_authorized, false);
      }
    }
  }
  const integrity = store.verifyRepositoryArtifacts(options); assert.equal(integrity.valid, true);
  assert.equal(env.readCount, scenario === "resolution-unchanged" ? 2 : 1);
  console.log(JSON.stringify({ scenario, passed: true, actual_task_reads: env.readCount, artifact_store_valid: true,
    actual_native_execution_or_production_proof: false }));
} finally { fs.rmSync(env.root, { recursive: true, force: true }); }
