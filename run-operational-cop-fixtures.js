#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const artifacts = require("./repository-artifact-store"), originalWrite = artifacts.writeRepositoryArtifact;
let interruptBaseline = false;
artifacts.writeRepositoryArtifact = options => {
  if (interruptBaseline && options.payload.checkpoint_kind === "baseline") {
    interruptBaseline = false; throw new Error("Synthetic COP issuance interruption");
  }
  return originalWrite(options);
};
const evidence = require("./operator-console-evidence"), originalRead = evidence.readEntry;
let afterRead;
evidence.readEntry = (store, entry) => { const text = originalRead(store, entry); if (afterRead) afterRead(store, entry); return text; };
const { queryOperationalCop } = require("./operational-cop"), { validatePayload } = require("./validator-cli-prototype/validate");
const s = require("./disciplined-initiative-fixtures/support"), { terminateWave } = require("./skill-mission-controller");
const { createConsole } = require("./operator-console-server"), { serialize } = require("@fastify/cookie");
const roots = [], results = [], owner = { role: "owner", missions: [] };
const clone = value => JSON.parse(JSON.stringify(value));
function configuration(env) {
  const repo = artifacts.resolveRepository(env.options.repository);
  return { repository: repo.root, repositoryKey: repo.key, identity: repo.identity_fingerprint, artifactRoot: env.options.artifactRoot };
}
function query(env, seconds = 200, request = {}, user = owner) { return queryOperationalCop(configuration(env), user, request, { now: s.optionsAt(env, seconds).now }); }
function has(data, code) { return data.alerts.some(item => item.code === code); }
function check(name, run) { run(); results.push(name); console.log(`PASS ${name}`); }
async function main() {
  let service;
  try {
    check("new validator dependencies are bound by issuance and channel source measurements", () => {
      for (const contract of [require("./dispatch-issuance-contract"), require("./method-control-contract")]) {
        const original = fs.readFileSync, before = contract.runtimeDigest();
        for (const file of ["operational-cop-contract.js", "schema-files/operational-cop.schema.json"]) {
          assert(contract.CODE.includes(file));
          fs.readFileSync = function (filename, ...args) {
            const bytes = original.call(this, filename, ...args);
            return typeof filename === "string" && path.resolve(filename) === path.join(__dirname, file) ? Buffer.concat([Buffer.from(bytes), Buffer.from("\n")]) : bytes;
          };
          try { assert.notEqual(contract.runtimeDigest(), before); } finally { fs.readFileSync = original; }
        }
      }
    });
    const env = s.environment(Date.now() - 120000); roots.push(env.root);
    check("no invented waves from intake or arbitrary deliverables", () => {
      assert.equal(query(env).visible_wave_count, 0);
      s.persist(env, "agent-outputs", { id: "OUT-UNRELATED", text: "Not an actual mission plan" }, 90);
      assert.equal(query(env).waves.length, 0);
    });
    s.start(env);
    let baseline;
    check("actual adoption, preflight, intent and lease history are replayed without grants", () => {
      baseline = query(env); assert.equal(baseline.waves[0].state, "context_recorded");
      assert.equal(baseline.waves[0].agents[0].recorded_lease_status, "active");
      assert.equal(baseline.waves[0].freshness, "fresh"); assert.equal(baseline.critical_count, 0);
      assert.equal(validatePayload(baseline, "operational-cop").valid, true);
      assert.equal(validatePayload(baseline, "operational-cop").can_execute, false);
      for (const key of ["approval_authorized", "tool_execution_authorized", "release_authorized", "worker_liveness_verified"]) assert.equal(baseline[key], false);
    });
    check("no namespace produces an explicit empty snapshot, not mocked activity", () => {
      const absent = { ...configuration(env), artifactRoot: path.join(env.root, "absent") };
      const value = queryOperationalCop(absent, owner); assert.equal(value.manifest_sha256, "none"); assert.deepEqual(value.waves, []);
    });
    check("caller clock, repository, authority and unknown staff-role injection are rejected", () => {
      for (const request of [{ now: "2099-01-01T00:00:00Z" }, { repository: "/etc" }, { role: "owner" }, { approval_authorized: true }]) {
        assert.throws(() => query(env, 200, request), /CONSOLE_COP_QUERY_INVALID/);
      }
      assert.throws(() => query(env, 200, {}, { role: "S3", missions: [] }), /CONSOLE_COP_PRINCIPAL_INVALID/);
      assert.throws(() => queryOperationalCop({ ...configuration(env), identity: "wrong" }, owner), /CONSOLE_REPOSITORY_IDENTITY_CHANGED/);
    });
    check("arbitrary future output cannot refresh old control activity", () => {
      const old = query(env, 500); s.persist(env, "agent-outputs", { id: "OUT-NOISE", text: "Recent output is not control evidence" }, 9000);
      const value = query(env, 500); assert.equal(value.waves[0].recorded_at, old.waves[0].recorded_at);
      assert.equal(value.waves[0].freshness, "stale"); assert(has(value, "ACTIVITY_STALE"));
    });
    check("pending actual call is shown without repeating the tool or writing control records", () => {
      assert.equal(s.admit(env, s.inputs.planned, "cop-actual-read", 100).decision, "allow");
      const value = query(env); assert.equal(value.waves[0].state, "result_pending"); assert(has(value, "TOOL_RESULT_PENDING"));
      const before = artifacts.manifestDigest(require("./campaign-supervisor").loadVerifiedStore(env.options.repository, env.options.artifactRoot).manifest);
      query(env); assert.equal(artifacts.manifestDigest(require("./campaign-supervisor").loadVerifiedStore(env.options.repository, env.options.artifactRoot).manifest), before);
      assert.equal(env.readCount, 0); s.complete(env, s.inputs.planned, "cop-actual-read", 101); assert.equal(env.readCount, 1);
    });
    check("actual expiry is a hold, never an implied renewal", () => {
      const value = query(env, 800); assert.equal(value.waves[0].state, "execution_held"); assert(has(value, "LEASE_EXPIRED"));
      assert.equal(value.critical_count, 1);
      assert.equal(value.waves[0].agents[0].lease_valid_until, baseline.waves[0].agents[0].lease_valid_until);
    });
    check("role and mission filters cannot hide a critical alert in authorized scope", () => {
      const value = query(env, 800, { role: "S6", mission: "MIS-ABSENT" });
      assert.equal(value.waves.length, 0); assert.equal(value.visible_wave_count, 1); assert(has(value, "LEASE_EXPIRED"));
      const s3 = query(env, 800, { role: "S3" }); assert.equal(s3.waves[0].agents.length, 1); assert.equal(s3.waves[0].agents[0].role, "S3"); assert(has(s3, "LEASE_EXPIRED"));
    });
    check("viewer queries never reveal other mission IDs, counts or alerts", () => {
      const data = query(env, 800, { mission: env.plan.mission_id, role: "COMMANDER" }, { role: "viewer", missions: ["MIS-OTHER"] });
      assert.equal(data.visible_wave_count, 0); assert.deepEqual(data.alerts, []); assert.deepEqual(data.roles, []);
      assert(!JSON.stringify(data.waves).includes(env.plan.mission_id));
      assert.equal(data.audience.account_role, "viewer");
    });
    check("current repository drift remains a visible owner-side execution hold", () => {
      const filename = path.join(env.options.repository, "README.md"), original = fs.readFileSync(filename);
      try { fs.appendFileSync(filename, "Synthetic source drift\n"); assert(has(query(env), "CURRENT_REPOSITORY_DRIFT")); }
      finally { fs.writeFileSync(filename, original); }
    });
    check("manifest changes during the read discard the entire snapshot", () => {
      afterRead = () => { afterRead = null; s.persist(env, "agent-outputs", { id: "OUT-READ-RACE", text: "Synthetic concurrent append" }, 105); };
      assert.throws(() => query(env), /CONSOLE_COP_SNAPSHOT_CHANGED/); afterRead = null;
    });
    s.dispatch.interruptLease(s.optionsAt(env, 110), env.leaseId);
    interruptBaseline = true;
    assert.throws(() => s.dispatch.resumeLease(s.optionsAt(env, 120), env.leaseId, { sessionId: "cop-continuation", providerAgentId: "main" }), /Synthetic COP issuance interruption/);
    check("partial issuance is a critical hold and a read cannot recover it", () => {
      const data = query(env); assert(has(data, "DISPATCH_ISSUANCE_PENDING"));
      assert.equal(s.dispatch.dispatchStatus(env.options).unresolved_issuances.length, 1);
    });
    const pending = s.dispatch.dispatchStatus(env.options).unresolved_issuances[0];
    s.dispatch.cancelDispatchIssuance(s.optionsAt(env, 122), pending.issuance_ref.artifact_id, "Synthetic explicit operator cancellation, not a COP side effect.");
    const planRef = baseline.waves[0].plan;
    const store = require("./campaign-supervisor").loadVerifiedStore(env.options.repository, env.options.artifactRoot);
    const planEntry = store.manifest.artifacts.find(item => item.artifact_id === planRef.artifact_id && item.kind === planRef.kind);
    const none = { artifact_id: "none", relative_path: "none", sha256: "none" };
    check("verified expiry termination preserves failure rather than claiming completed work", () => {
      terminateWave({ schema_version: "0.1", type: "MissionWaveTerminationRequest", mission_id: env.plan.mission_id, wave_id: env.plan.wave_id,
        status: "expired", reason: "Synthetic expired wave; no completed task claim.",
        plan_ref: { artifact_id: planEntry.artifact_id, relative_path: planEntry.relative_path, sha256: planEntry.sha256 },
        successor_plan_ref: none, decision_ref: none }, s.optionsAt(env, 10000));
      const data = query(env, 10001); assert.equal(data.waves[0].state, "terminated_expired"); assert(data.waves[0].ending);
    });
    check("schema-valid forged closeout cannot promote retained history to complete", () => {
      const forged = s.sample("mission-wave-closeout"); forged.mission_id = env.plan.mission_id; forged.wave_id = env.plan.wave_id;
      assert.equal(validatePayload(forged, "mission-wave-closeout").valid, true);
      s.persist(env, "mission-wave-closeouts", forged, 10002);
      const data = query(env, 10003); assert.equal(data.waves[0].state, "history_unverified"); assert(has(data, "WAVE_HISTORY_UNVERIFIED"));
    });
    check("snapshot contract rejects nested authority, invented counts and indefinite validity", () => {
      for (const [change, code] of [
        [v => { v.audience.execute = true; }, "ADDITIONAL_PROPERTY"],
        [v => { v.waves[0].plan.release_authorized = true; }, "ADDITIONAL_PROPERTY"],
        [v => { v.critical_count++; }, "COP_SNAPSHOT_COUNTS_INVALID"],
        [v => { v.snapshot_valid_until = v.as_of; }, "COP_SNAPSHOT_VALIDITY_INVALID"],
        [v => { v.audience.role_filter = "S6"; }, "COP_ROLE_VIEW_INVALID"],
        [v => { v.next_boundary_at = {}; }, "ANY_OF_MISMATCH"]
      ]) { const value = clone(baseline); change(value); const result = validatePayload(value, "operational-cop"); assert.equal(result.valid, false); assert(result.issues.some(item => item.code === code), JSON.stringify(result.issues)); }
    });
    check("mixed UTC offsets are ordered by actual instant, not their written representation", () => {
      const value = clone(env.plan), offset = new Date(env.epoch + 91000 + 9 * 3600000).toISOString().slice(0, -1) + "+09:00";
      Object.assign(value, { id: "MWP-OFFSET", wave_id: "W-OFFSET" });
      s.persist(env, "mission-wave-plans", value, 91, { waveId: value.wave_id, createdAt: offset });
      const data = query(env, 10003), actual = data.waves.find(item => item.wave_id === env.plan.wave_id), other = data.waves.find(item => item.wave_id === value.wave_id);
      assert(Date.parse(actual.recorded_at) > Date.parse(other.recorded_at)); assert(actual.recorded_at.localeCompare(other.recorded_at) < 0);
      assert.equal(data.waves[0].wave_id, env.plan.wave_id);
    });
    check("future-dated history and orphaned runtime events remain explicit critical attention", () => {
      const value = clone(env.plan); Object.assign(value, { id: "MWP-FUTURE", wave_id: "W-FUTURE", created_at: s.optionsAt(env, 10005).now, valid_until: s.optionsAt(env, 15000).now });
      s.persist(env, "mission-wave-plans", value, 10005, { waveId: value.wave_id });
      s.persist(env, "mission-wave-reports", { id: "MWR-ORPHAN", mission_id: env.plan.mission_id, wave_id: "W-ORPHAN" }, 10004, { waveId: "W-ORPHAN" });
      const data = query(env, 10003), future = data.waves.find(item => item.wave_id === value.wave_id);
      assert.equal(future.freshness, "future"); assert.equal(future.state, "history_unverified"); assert(has(data, "ORPHANED_RUNTIME_HISTORY"));
    });
    service = await createConsole({ ...env.options, stateDir: path.join(fs.realpathSync(env.root), "private"), port: 4317 }); await service.app.ready();
    function client() {
      const jar = new Map(); let csrf;
      return { async request(method, url, payload) {
        const response = await service.app.inject({ method, url, payload, headers: { host: "127.0.0.1:4317", cookie: [...jar].map(([name, value]) => serialize(name, value)).join("; "),
          ...(method === "POST" ? { origin: "http://127.0.0.1:4317", "x-csrf-token": csrf } : {}) } });
        for (const cookie of response.cookies) jar.set(cookie.name, cookie.value);
        if (url === "/api/session" && response.statusCode === 200) csrf = response.json().csrf_token;
        return response;
      } };
    }
    const admin = client(), viewer = client(), anonymous = client(), password = "synthetic-cop-only-password-2026";
    assert.equal((await anonymous.request("GET", "/api/operations")).statusCode, 401);
    await admin.request("GET", "/api/session");
    assert.equal((await admin.request("POST", "/api/setup", { username: "copowner", password, token: service.auth.createBootstrap() })).statusCode, 200);
    await admin.request("GET", "/api/session");
    for (const querystring of ["now=2099-01-01", "repository=/etc", "role=owner", "role=S2&role=S3", "approval_authorized=true"]) {
      assert.equal((await admin.request("GET", `/api/operations?${querystring}`)).statusCode, 400);
    }
    const reply = await admin.request("GET", "/api/operations?role=S6"); assert.equal(reply.statusCode, 200, reply.body);
    assert.equal(reply.headers["cache-control"], "no-store"); assert.equal(reply.json().matching_wave_count, 0); assert(reply.json().critical_count > 0);
    results.push("actual HTTP worker enforces authentication, strict queries, role display and no-store");
    const invited = await admin.request("POST", "/api/invites", { password, missions: ["MIS-OTHER"] });
    await viewer.request("GET", "/api/session");
    const registered = await viewer.request("POST", "/api/register", { username: "copviewer", password, token: invited.json().token }); assert.equal(registered.statusCode, 200);
    await viewer.request("GET", "/api/session");
    const scoped = await viewer.request("GET", "/api/operations?role=COMMANDER"); assert.equal(scoped.statusCode, 200, scoped.body); assert.equal(scoped.json().visible_wave_count, 0); assert.deepEqual(scoped.json().alerts, []);
    const authenticate = service.auth.authenticate; let reads = 0;
    service.auth.authenticate = session => {
      if (++reads === 2) service.auth.db.prepare("UPDATE users SET epoch=epoch+1 WHERE id=?").run(registered.json().user.id);
      return authenticate(session);
    };
    try { assert.equal((await viewer.request("GET", "/api/operations")).statusCode, 401); assert.equal(reads, 2); }
    finally { service.auth.authenticate = authenticate; }
    results.push("actual session revocation after worker reading is rechecked before response");
    await viewer.request("GET", "/api/session");
    assert.equal((await viewer.request("POST", "/api/login", { username: "copviewer", password })).statusCode, 200);
    await viewer.request("GET", "/api/session");
    assert.equal((await admin.request("POST", "/api/users/deactivate", { userId: registered.json().user.id, password })).statusCode, 200);
    assert.equal((await viewer.request("GET", "/api/operations")).statusCode, 401);
    results.push("real viewer session remains mission-bounded and deactivation invalidates operations access");
    check("ambiguous plan history fails the whole snapshot instead of selecting a convenient plan", () => {
      const value = clone(env.plan); value.id = "MWP-AMBIGUOUS"; s.persist(env, "mission-wave-plans", value, 10006);
      assert.throws(() => query(env, 10007), /CONSOLE_COP_PLAN_AMBIGUOUS/);
    });
    console.log(JSON.stringify({ passed: results.length, failed: 0, results, all_eight_goals_completed: false }, null, 2));
  } finally {
    afterRead = null; interruptBaseline = false;
    if (service) await service.app.close();
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
