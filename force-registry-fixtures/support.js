const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict"), { spawnSync } = require("node:child_process");
const { createConsole } = require("../operator-console-server"), core = require("../force-registry-controller"), c = require("../force-registry-contract");
const { client, password } = require("../operator-consent-fixtures/support");
const artifacts = require("../repository-artifact-store");
const { entity, organization, capability, performer } = require("./contracts");
async function environment() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-force-enrollment-"))), repository = path.join(root, "target"); fs.mkdirSync(repository);
  function git(...args) { const value = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" }); assert.equal(value.status, 0, value.stderr); }
  git("init", "-q"); git("config", "user.email", "fixtures@example.com"); git("config", "user.name", "Synthetic Force Fixtures");
  fs.writeFileSync(path.join(repository, "README.md"), "Synthetic force registry target\n"); git("add", "."); git("commit", "-qm", "initial");
  const options = { repository, artifactRoot: path.join(root, "artifacts") }, stateDir = path.join(root, "private");
  let service;
  try {
    service = await createConsole({ ...options, stateDir, port: 4317 }); await service.app.ready();
    const owner = client(service); await owner.session(); await owner.post("/api/setup", { username: "owner", password, token: service.auth.createBootstrap() }); await owner.session();
    return { root, options, stateDir, service, owner };
  } catch (error) { if (service) await service.app.close(); fs.rmSync(root, { recursive: true, force: true }); throw error; }
}
function propose(env, value = organization(), operation = "enroll", head = { ...c.NONE }, mission = "MIS-FORCE-FIXTURE") {
  return core.propose(c.createRequest({ mission_id: mission, wave_id: "ENROLL", operation, expected_head_ref: head,
    entity: value, rationale: "Synthetic enrollment proposal only.", evidence_refs: [] }), env.options);
}
async function preview(env, proposed = propose(env)) {
  const entries = await env.owner.get("/api/evidence?kind=force-registry-proposals"), entry = entries.entries.find(item => item.artifact_id === proposed.proposal.id);
  assert(entry); return env.owner.post("/api/force-registry/preview", { entry_id: entry.id, manifest: entries.manifest_sha256 });
}
const commitInput = p => ({ challenge_id: p.challenge_id, nonce: p.nonce, password, rationale: "Synthetic owner consent, not real USER authority.",
  acknowledge_definition_only: true, displayed_review_sha256: p.displayed_review_sha256 });
async function enroll(env, value = organization(), operation = "enroll", head) {
  if (!head) head = (await env.owner.get("/api/force-registry")).head_ref;
  const proposed = propose(env, value, operation, head), p = await preview(env, proposed), applied = await env.owner.post("/api/force-registry/commit", commitInput(p));
  return { proposed, preview: p, applied };
}
function count(env, kind) { return (core.load(env.options).manifest?.artifacts || []).filter(item => item.kind === kind).length; }
function read(env, reference) { return core.record(core.load(env.options), reference).payload; }
function standard(env, id = "STD-FIXTURE", text = "Synthetic objective task standard.", mission = "MIS-FORCE-FIXTURE") {
  const written = artifacts.writeRepositoryArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
    missionId: mission, waveId: "STANDARD", kind: "capability-standards", artifactId: id, payload: { objective: text } });
  return { artifact_id: id, relative_path: written.relative_path, sha256: written.sha256 };
}
async function rejectPreview(env, proposed, reason) {
  const entries = await env.owner.get("/api/evidence?kind=force-registry-proposals"), entry = entries.entries.find(item => item.artifact_id === proposed.proposal.id);
  const result = await env.owner.post("/api/force-registry/preview", { entry_id: entry.id, manifest: entries.manifest_sha256 }, 409);
  if (reason) assert(result.reason_codes?.includes(reason), JSON.stringify(result)); return result;
}
module.exports = { environment, entity, organization, capability, performer, standard, rejectPreview, propose, preview, commitInput, enroll, count, read, client, password, artifacts, core, c };
