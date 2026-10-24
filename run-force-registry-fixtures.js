#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const artifacts = require("./repository-artifact-store"), originalWrite = artifacts.writeRepositoryArtifact;
let injectWrite = null;
artifacts.writeRepositoryArtifact = options => injectWrite ? injectWrite(options, originalWrite) : originalWrite(options);
const s = require("./force-registry-fixtures/support"), { executeForceRegistryChange } = require("./operator-force-registry-executor");
const { validatePayload } = require("./validator-cli-prototype/validate");
const results = [];
async function check(name, run) {
  let env;
  try { env = await s.environment(); await run(env); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}\n${error.stack}`); }
  finally { injectWrite = null; if (env) { await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); } }
}
async function main() {
  await check("fresh authenticated owner enrollment reaches actual persistent history without qualification or execution", async env => {
    assert.equal((await env.owner.get("/api/force-registry")).status, "empty");
    const { applied, preview } = await s.enroll(env), state = await env.owner.get("/api/force-registry");
    assert.equal(state.entities.length, 1); assert.equal(state.entities[0].id, "ORG-FIXTURE"); assert.equal(state.sequence, 1);
    assert.equal(state.qualification_granted, false); assert.equal(state.execution_authorized, false); assert.equal(state.standing_activation_authorized, false);
    const authorization = s.read(env, applied.authorization_ref), publicKey = (await env.owner.get("/api/operator-key")).public_key_pem;
    s.c.verifyAuthorization(authorization, publicKey); assert.equal(validatePayload(authorization, "force-registry-authorization").can_execute, false);
    assert.equal(s.count(env, s.c.KINDS.events), 1); assert(!JSON.stringify(authorization).includes(s.password)); assert(!JSON.stringify(authorization).includes(preview.nonce));
    await env.owner.post("/api/force-registry/commit", s.commitInput(preview), 409); assert.equal(s.count(env, s.c.KINDS.events), 1);
  });
  await check("wrong password, nonce, missing acknowledgment and another session cannot consume enrollment", async env => {
    const p = await s.preview(env), input = s.commitInput(p);
    await env.owner.post("/api/force-registry/commit", { ...input, password: "wrong-password-only" }, 403);
    await env.owner.post("/api/force-registry/commit", { ...input, nonce: "x".repeat(43) }, 409);
    const missing = { ...input }; delete missing.acknowledge_definition_only; await env.owner.post("/api/force-registry/commit", missing, 400);
    const other = s.client(env.service); await other.session(); await other.post("/api/login", { username: "owner", password: s.password }); await other.session();
    await other.post("/api/force-registry/commit", input, 409); assert.equal(s.count(env, s.c.KINDS.authorizations), 0);
  });
  await check("viewer cannot inspect definitions or obtain or consume owner enrollment", async env => {
    const p = await s.preview(env), invitation = await env.owner.post("/api/invites", { password: s.password, missions: ["MIS-FORCE-FIXTURE"] });
    const viewer = s.client(env.service); await viewer.session(); await viewer.post("/api/register", { username: "viewer", password: s.password, token: invitation.token }); await viewer.session();
    await viewer.get("/api/force-registry", 403); await viewer.post("/api/force-registry/commit", s.commitInput(p), 403);
    assert.equal(s.count(env, s.c.KINDS.events), 0);
  });
  await check("intervening target changes invalidate consent without a force event", async env => {
    const p = await s.preview(env); fs.appendFileSync(path.join(env.options.repository, "README.md"), "changed\n");
    await env.owner.post("/api/force-registry/commit", s.commitInput(p), 409);
    assert.equal(s.count(env, s.c.KINDS.events), 0); assert.equal((await env.owner.get(`/api/force-registry/actions/${p.challenge_id}`)).state, "blocked");
  });
  await check("intervening manifest publication invalidates exact enrollment consent", async env => {
    const p = await s.preview(env); s.standard(env);
    await env.owner.post("/api/force-registry/commit", s.commitInput(p), 409);
    assert.equal(s.count(env, s.c.KINDS.authorizations), 0); assert.equal(s.count(env, s.c.KINDS.events), 0);
  });
  await check("partial authorization publication holds later enrollment and survives restart without replay", async env => {
    const p = await s.preview(env); await env.service.consent.forceRegistry.reserve(env.owner.storedSession(), s.commitInput(p));
    injectWrite = (options, write) => { if (options.kind === s.c.KINDS.events) throw new Error("CONSOLE_FORCE_INJECTED_FAILURE"); return write(options); };
    const configuration = { ...env.service.configuration, forceRegistryPublicKey: env.service.consent.publicKey() };
    assert.throws(() => executeForceRegistryChange(configuration, p.challenge_id), /CONSOLE_FORCE_CHANGE_BLOCKED/); injectWrite = null;
    assert.equal(s.count(env, s.c.KINDS.authorizations), 1); assert.equal(s.count(env, s.c.KINDS.events), 0);
    assert.equal((await env.owner.get("/api/force-registry")).mutation_held, true);
    const newProposal = s.propose(env, s.organization("ORG-NEXT"));
    const entries = await env.owner.get("/api/evidence?kind=force-registry-proposals"), entry = entries.entries.find(item => item.artifact_id === newProposal.proposal.id);
    await env.owner.post("/api/force-registry/preview", { entry_id: entry.id, manifest: entries.manifest_sha256 }, 409);
    await env.service.app.close(); env.service = await require("./operator-console-server").createConsole({ ...env.options, stateDir: env.stateDir, port: 4317 }); await env.service.app.ready();
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_force_actions WHERE id=?").get(p.challenge_id).state, "reconciliation_required");
    assert.equal(s.count(env, s.c.KINDS.events), 0);
  });
  await check("separate pinned key and complete signed review reject substituted issuer and body", async env => {
    const { applied } = await s.enroll(env), authorization = s.read(env, applied.authorization_ref), publicKey = env.service.consent.publicKey();
    const changed = structuredClone(authorization); changed.review.proposal.request.entity.label = "Substituted";
    assert.throws(() => s.c.verifyAuthorization(changed, publicKey), /SIGNATURE_INVALID/);
    assert.throws(() => s.c.verifyAuthorization(authorization, crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" })), /SIGNATURE_INVALID/);
    assert.throws(() => s.core.inspection(env.options), /OPERATOR_KEY_REQUIRED/);
  });
  await check("versioned revision and retirement preserve identity and never restore an old definition", async env => {
    await s.enroll(env); const revision = s.organization("ORG-FIXTURE", 2); revision.label = "Revised label";
    await s.enroll(env, revision, "revise"); await s.enroll(env, s.organization("ORG-FIXTURE", 3, "none", "retired"), "retire");
    const state = await env.owner.get("/api/force-registry"); assert.equal(state.sequence, 3); assert.equal(state.entities[0].enrollment_state, "retired");
    const proposed = s.propose(env, s.organization("ORG-FIXTURE", 4), "revise", state.head_ref), entries = await env.owner.get("/api/evidence?kind=force-registry-proposals");
    await env.owner.post("/api/force-registry/preview", { entry_id: entries.entries.find(item => item.artifact_id === proposed.proposal.id).id, manifest: entries.manifest_sha256 }, 409);
  });
  await check("displayed subject digest is mandatory and must match the exact reserved full review", async env => {
    const p = await s.preview(env), input = s.commitInput(p), missing = { ...input }; delete missing.displayed_review_sha256;
    await env.owner.post("/api/force-registry/commit", missing, 400);
    const altered = structuredClone(p.review); altered.proposal.request.entity.label = "Different displayed label";
    const result = await env.owner.post("/api/force-registry/commit", { ...input, displayed_review_sha256: s.c.digest(altered) }, 409);
    assert.equal(result.error, "CONSOLE_FORCE_DISPLAY_SUBJECT_CHANGED"); assert.equal(s.count(env, s.c.KINDS.authorizations), 0);
    assert.equal((await env.owner.get(`/api/force-registry/actions/${p.challenge_id}`)).state, "pending");
  });
  await check("capability identity spans explicit reviewed aliases and missions without copying supporting text or granting readiness", async env => {
    await s.enroll(env); const marker = "SYNTHETIC-OWNER-ONLY-MATERIAL-7349", reference = s.standard(env, "STD-PRIVATE", marker, "MIS-PRIVATE-STANDARD");
    const aliases = [{ operational_role: "S3", task: "First reviewed wording." }, { operational_role: "S3", task: "Second reviewed wording." }];
    const head = (await env.owner.get("/api/force-registry")).head_ref;
    const proposed = s.propose(env, s.capability(reference, "CAP-FIXTURE", aliases), "enroll", head, "MIS-SECOND-MISSION");
    const p = await s.preview(env, proposed), applied = await env.owner.post("/api/force-registry/commit", s.commitInput(p));
    const authorization = s.read(env, applied.authorization_ref), publicKey = env.service.consent.publicKey();
    assert(p.review.materials.some(item => item.text.includes(marker))); assert(!JSON.stringify(authorization).includes(marker));
    assert.equal(authorization.displayed_review_sha256, s.c.digest(p.review)); assert.equal(authorization.review.materials[0].text_sha256, reference.sha256);
    for (const alias of aliases) {
      const found = s.core.lookupCapability(env.options, publicKey, alias.operational_role, alias.task);
      assert.equal(found.capability.id, "CAP-FIXTURE"); assert.equal(found.execution_authorized, false); assert.equal(found.qualification_granted, false);
    }
    assert.equal(s.core.lookupCapability(env.options, publicKey, "S3", "Unreviewed paraphrase.").capability, null);
  });
  await check("registry records and standards stay owner-only through generic mission evidence queries", async env => {
    const { applied } = await s.enroll(env); s.standard(env);
    const invitation = await env.owner.post("/api/invites", { password: s.password, missions: ["MIS-FORCE-FIXTURE"] });
    const viewer = s.client(env.service); await viewer.session(); await viewer.post("/api/register", { username: "viewer", password: s.password, token: invitation.token }); await viewer.session();
    for (const kind of [s.c.KINDS.proposals, s.c.KINDS.authorizations, s.c.KINDS.events, "capability-standards"]) assert.equal((await viewer.get(`/api/evidence?kind=${kind}`)).entries.length, 0);
    const record = s.core.record(s.core.load(env.options), applied.authorization_ref), metadataId = require("./operator-console-evidence").entryId(record.entry);
    const manifest = s.core.manifestState(s.core.load(env.options)).sha256;
    await viewer.get(`/api/evidence/${metadataId}?manifest=${manifest}`, 404);
  });
  await check("removed aliases stay reserved to their stable capability identity", async env => {
    await s.enroll(env); const reference = s.standard(env), alias = { operational_role: "S3", task: "Original reviewed task." };
    await s.enroll(env, s.capability(reference, "CAP-FIXTURE", [alias]));
    await s.enroll(env, s.capability(reference, "CAP-FIXTURE", [{ operational_role: "S3", task: "New reviewed task." }], 2), "revise");
    const current = await env.owner.get("/api/force-registry");
    assert.equal(s.core.lookupCapability(env.options, env.service.consent.publicKey(), alias.operational_role, alias.task).capability.id, "CAP-FIXTURE");
    await s.rejectPreview(env, s.propose(env, s.capability(reference, "CAP-OTHER", [alias]), "enroll", current.head_ref), "FORCE_REGISTRY_ALIAS_HISTORY_CONFLICT");
  });
  await check("declared performer configuration changes create a new unassessed revision, never a qualified grant", async env => {
    await s.enroll(env); await s.enroll(env, s.performer()); const changed = s.performer("PERF-FIXTURE", 2); changed.data.tool_policy_sha256 = "e".repeat(64);
    await s.enroll(env, changed, "revise"); const state = await env.owner.get("/api/force-registry"), subject = state.entities.find(item => item.id === changed.id);
    assert.equal(subject.version, 2); assert.equal(subject.data.tool_policy_sha256, "e".repeat(64)); assert.equal(subject.qualification_state, "unassessed");
    const floating = s.performer("PERF-FLOATING"); floating.data.model_revision = "latest";
    assert.throws(() => s.propose(env, floating, "enroll", state.head_ref), /CONTRACT_INVALID/);
  });
  await check("organization cycles and retiring a parent with enrolled children are denied by actual preview", async env => {
    await s.enroll(env); await s.enroll(env, s.organization("ORG-CHILD", 1, "ORG-FIXTURE"));
    const head = (await env.owner.get("/api/force-registry")).head_ref;
    await s.rejectPreview(env, s.propose(env, s.organization("ORG-FIXTURE", 2, "ORG-CHILD"), "revise", head), "FORCE_REGISTRY_ORGANIZATION_PARENT_INVALID");
    await s.rejectPreview(env, s.propose(env, s.organization("ORG-FIXTURE", 2, "none", "retired"), "retire", head), "FORCE_REGISTRY_ORGANIZATION_PARENT_INVALID");
  });
  await check("definition ownership must be moved before an organization can retire", async env => {
    await s.enroll(env); await s.enroll(env, s.organization("ORG-OTHER")); const reference = s.standard(env);
    await s.enroll(env, s.capability(reference)); let head = (await env.owner.get("/api/force-registry")).head_ref;
    await s.rejectPreview(env, s.propose(env, s.organization("ORG-FIXTURE", 2, "none", "retired"), "retire", head), "FORCE_REGISTRY_OWNER_UNAVAILABLE");
    await s.enroll(env, s.capability(reference, "CAP-FIXTURE", undefined, 2, "ORG-OTHER"), "revise");
    await s.enroll(env, s.organization("ORG-FIXTURE", 2, "none", "retired"), "retire");
    const state = await env.owner.get("/api/force-registry"); assert.equal(state.entities.find(item => item.id === "CAP-FIXTURE").data.owner_id, "ORG-OTHER");
  });
  await check("forked sequence never becomes an accepted registry", async env => {
    const { applied } = await s.enroll(env), event = s.read(env, applied.event_ref), key = env.service.consent.publicKey();
    const { id, ...body } = event, forged = s.c.identified("FRE", { ...body, entity: { ...body.entity, label: "Forked definition" } });
    originalWrite({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: "MIS-FORCE-FIXTURE", waveId: "ENROLL",
      kind: s.c.KINDS.events, artifactId: forged.id, payload: forged });
    assert.throws(() => s.core.inspection(env.options, key), /HISTORY_FORK_OR_GAP/);
  });
  await check("a consumed authorization cannot approve a second sequential event", async env => {
    const { applied } = await s.enroll(env), event = s.read(env, applied.event_ref);
    const { id, ...body } = event, forged = s.c.identified("FRE", { ...body, sequence: 2, previous_ref: applied.event_ref });
    originalWrite({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot, missionId: "MIS-FORCE-FIXTURE", waveId: "ENROLL",
      kind: s.c.KINDS.events, artifactId: forged.id, payload: forged });
    assert.throws(() => s.core.inspection(env.options, env.service.consent.publicKey()), /AUTHORIZATION_REPLAY/);
  });
  await check("missing standards and oversized supporting materials fail before owner preview", async env => {
    const missing = { artifact_id: "STD-MISSING", relative_path: "missing.json", sha256: "a".repeat(64) };
    assert.throws(() => s.propose(env, s.capability(missing)), /STANDARD_REQUIRED/);
    const reference = s.standard(env, "STD-OVERSIZED", "x".repeat(65536));
    assert.throws(() => s.propose(env, s.capability(reference)), /MATERIAL_TOO_LARGE/);
    assert.equal(s.count(env, s.c.KINDS.proposals), 0);
  });
  await check("supporting material decoding cannot silently strip retained UTF-8 bytes", async env => {
    const sourcePath = path.join(env.root, "standard.txt"); fs.writeFileSync(sourcePath, Buffer.from("\ufeffSynthetic standard with a BOM.\n"));
    const written = s.artifacts.writeRepositoryFileArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
      missionId: "MIS-FORCE-FIXTURE", waveId: "STANDARD", kind: "capability-standards", artifactId: "STD-BOM", sourcePath });
    const reference = { artifact_id: "STD-BOM", relative_path: written.relative_path, sha256: written.sha256 };
    assert.throws(() => s.propose(env, s.capability(reference)), /MATERIAL_ENCODING_CHANGED/);
    assert.equal(s.count(env, s.c.KINDS.proposals), 0);
  });
  await check("expired and restarted pending ceremonies never consume old enrollment consent", async env => {
    const expired = await s.preview(env);
    env.service.auth.db.prepare("UPDATE operator_force_actions SET expires=? WHERE id=?").run(Date.now() - 1, expired.challenge_id);
    await env.owner.post("/api/force-registry/commit", s.commitInput(expired), 409);
    const pending = await s.preview(env, s.propose(env, s.organization("ORG-RESTART")));
    await env.service.app.close(); env.service = await require("./operator-console-server").createConsole({ ...env.options, stateDir: env.stateDir, port: 4317 }); await env.service.app.ready();
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_force_actions WHERE id=?").get(pending.challenge_id).state, "invalidated");
    env.owner = s.client(env.service); await env.owner.session(); await env.owner.post("/api/login", { username: "owner", password: s.password }); await env.owner.session();
    await env.owner.post("/api/force-registry/commit", s.commitInput(pending), 409); assert.equal(s.count(env, s.c.KINDS.events), 0);
  });
  await check("an intervening enrolled definition cannot be silently rebased into an old proposal", async env => {
    const stale = s.propose(env, s.organization("ORG-STALE")); await s.enroll(env);
    await s.rejectPreview(env, stale, "FORCE_REGISTRY_HEAD_STALE");
  });
  await check("logout after authorization publication denies the event and retains the partial hold", async env => {
    const p = await s.preview(env); await env.service.consent.forceRegistry.reserve(env.owner.storedSession(), s.commitInput(p));
    injectWrite = (options, write) => { const result = write(options); if (options.kind === s.c.KINDS.authorizations) env.service.auth.db.prepare("DELETE FROM sessions").run(); return result; };
    assert.throws(() => executeForceRegistryChange({ ...env.service.configuration, forceRegistryPublicKey: env.service.consent.publicKey() }, p.challenge_id), /CONSOLE_FORCE_CHANGE_BLOCKED/);
    injectWrite = null; assert.equal(s.count(env, s.c.KINDS.authorizations), 1); assert.equal(s.count(env, s.c.KINDS.events), 0);
    assert.equal(env.service.auth.db.prepare("SELECT state FROM operator_force_actions WHERE id=?").get(p.challenge_id).state, "reconciliation_required");
  });
  console.log(JSON.stringify({ total: results.length, passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length,
    results, scope: "Synthetic owner accounts and local enrollment only; no real owner, model invocation, qualification or operational grant." }, null, 2));
  if (results.some(item => !item.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
