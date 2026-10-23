const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { execFileSync } = require("node:child_process");
const { captureRequest, compileOrder } = require("../request-order-compiler");
const { completeAnalysis, REQUEST_TEXT } = require("../request-order-compiler-fixtures/support");
const { createConsole } = require("../operator-console-server");
const { client, password } = require("../operator-consent-fixtures/support");
async function environment({ model = "fixture-valid", executable = path.join(__dirname, "../semantic-evaluation-fixtures/fake-codex.js"), initialize = true, configured = true, port = 4317 } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-model-consent-"))), repository = path.join(root, "repo");
  fs.mkdirSync(repository);
  const git = args => execFileSync("git", args, { cwd: repository, stdio: "pipe" });
  git(["init", "-q"]); git(["config", "user.name", "Synthetic model owner"]); git(["config", "user.email", "synthetic@example.com"]);
  fs.writeFileSync(path.join(repository, "README.md"), "Synthetic semantic owner test\n"); git(["add", "."]); git(["commit", "-qm", "fixture"]);
  const options = { repository, artifactRoot: path.join(root, "artifacts"), mission: "MIS-INTAKE", wave: "W1", requestId: "MR-MODEL", text: REQUEST_TEXT };
  const request = captureRequest(options), draft = compileOrder(completeAnalysis(request.artifact_ref), options);
  const configuration = { repository, artifactRoot: options.artifactRoot, stateDir: path.join(root, "private"), port,
    semantic: configured ? { executable, model, timeoutMs: model.startsWith("fixture-") ? 10000 : 240000 } : null };
  const service = await createConsole(configuration); await service.app.ready();
  const env = { root, options, draft, service, configuration };
  if (initialize) {
    env.owner = client(service); await env.owner.session();
    await env.owner.post("/api/setup", { username: "owner", password, token: service.auth.createBootstrap() }); await env.owner.session();
    const list = await env.owner.get("/api/evidence?kind=order-drafts");
    env.previewInput = { entry_id: list.entries[0].id, manifest: list.manifest_sha256 };
  }
  return env;
}
const preview = env => env.owner.post("/api/model-evaluations/preview", env.previewInput);
const commitInput = value => ({ challenge_id: value.challenge_id, nonce: value.nonce, password, rationale: "Synthetic owner approves one exact model packet, not task execution." });
async function terminal(env, id) {
  for (let count = 0; count < 100; count++) {
    const current = await env.owner.get(`/api/model-evaluations/${id}`);
    if (current.state !== "running") return current;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error("Synthetic model action did not terminate");
}
async function started(env, id) {
  const file = path.join(env.configuration.stateDir, "model-evaluations", id, "provider-started");
  for (let count = 0; count < 200; count++) { if (fs.existsSync(file)) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("Synthetic provider startup was not observed");
}
module.exports = { environment, client, password, preview, commitInput, terminal, started };
