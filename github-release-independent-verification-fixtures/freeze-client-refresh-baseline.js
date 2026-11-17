const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { execFileSync } = require("node:child_process");
const { sha256 } = require("../github-release-trusted-root");
const root = path.resolve(__dirname, ".."), commit = "21a90d820fd17fe710d38dd6e5014f7f14f60ac2";
const input = "sample-payloads/valid-github-release-independent-verification-v0.2.json";
const output = path.join(root, "sample-payloads/valid-github-release-independent-verification-pre-client-refresh-v0.2.json");
const bytes = execFileSync("git", ["show", `${commit}:${input}`], { cwd: root });
assert.equal(sha256(bytes), "2d2bfb0f71660daa4d969cb9dfcd971958dd3367fa93e4e270cbe45f1a94bcf9");
const evidence = JSON.parse(bytes);
assert.equal(evidence.verifier.module_sha256, "30995886290193e7cb7048fa539840a52bfbac41dc04a047716e1eaa56e6f838");
assert.equal(evidence.verifier.dependency_lock_sha256, "747a43982157407b772d521935fb5a963f6388675f31d7119e9ae3124ddafb41");
assert.equal(require("../github-release-bundle-verifier").validateIndependentVerificationEvidence(evidence,
  JSON.parse(fs.readFileSync(path.join(__dirname, "cli-v2.93.0-release-verification.json"))),
  JSON.parse(fs.readFileSync(path.join(__dirname, "github-trusted-root.json"))),
  { repository: "cli/cli", tagName: "v2.93.0", commitSha: "f96972ce1c11fdb8eaa556257fde962a363dffde" }).length, 0);
if (fs.existsSync(output)) assert(fs.readFileSync(output).equals(bytes), "Never rewrite an existing frozen producer sample.");
else fs.writeFileSync(output, bytes, { flag: "wx" });
console.log(JSON.stringify({ commit, path: path.relative(root, output), sha256: sha256(bytes), bytes_unchanged: true, operational_consent: false }));
