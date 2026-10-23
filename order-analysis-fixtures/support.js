const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), { execFileSync } = require("node:child_process");
const { captureRequest } = require("../request-order-compiler");
const { completeAnalysis, REQUEST_TEXT } = require("../request-order-compiler-fixtures/support");
function response() {
  const analysis = completeAnalysis({ artifact_id: "none", relative_path: "none", sha256: "none" });
  return Object.fromEntries(["statements", "sections", "tasks", "retained_user_decisions", "execution_authorized", "release_authorized"].map(key => [key, analysis[key]]));
}
function environment({ text = REQUEST_TEXT, classification = "internal", validForSeconds = 3600 } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cannae-order-analysis-"))), repository = path.join(root, "repo"); fs.mkdirSync(repository);
  const git = args => execFileSync("git", args, { cwd: repository, stdio: "pipe" });
  git(["init", "-q"]); git(["config", "user.name", "Synthetic analysis owner"]); git(["config", "user.email", "synthetic@example.com"]);
  fs.writeFileSync(path.join(repository, "README.md"), "Synthetic order analysis fixture\n"); git(["add", "."]); git(["commit", "-qm", "fixture"]);
  const options = { repository, artifactRoot: path.join(root, "artifacts"), mission: "MIS-INTAKE", wave: "W1", requestId: "MR-ANALYSIS", text, classification, validForSeconds };
  const request = captureRequest(options), stateDir = path.join(root, "private");
  return { root, options, request, stateDir, configuration: { repository, artifactRoot: options.artifactRoot, stateDir, port: 4317,
    analysis: { executable: path.join(__dirname, "fake-codex.js"), model: "analysis-valid", timeoutMs: 10000 } } };
}
module.exports = { environment, response, REQUEST_TEXT };
