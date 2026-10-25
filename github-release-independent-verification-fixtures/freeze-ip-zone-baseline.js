const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { execFileSync } = require("node:child_process");
const { sha256 } = require("../github-release-trusted-root");
const root = path.resolve(__dirname, ".."), commit = "22c61c3345a79f6d993369c12035492d04bf5861";
const input = "sample-payloads/valid-github-release-independent-verification-v0.2.json";
const output = path.join(root, "sample-payloads/valid-github-release-independent-verification-pre-zone-v0.2.json");
const bytes = execFileSync("git", ["show", `${commit}:${input}`], { cwd: root });
assert.equal(sha256(bytes), "874ab43758c1a312e9cb45a2dbe675bb3738d9a09ac48b562b494b154ebdc484");
const evidence = JSON.parse(bytes);
assert.equal(evidence.verifier.module_sha256, "012795a0c4cb6d63e0b4ad18edc9495db4732a54994cea534f38a279184a69c3");
assert.equal(evidence.verifier.dependency_lock_sha256, "ef9fcf979ddc996bf9b2808d7f565264bedd8d45319bc6baae2f19510a9589f3");
assert.equal(require("../github-release-bundle-verifier").validateIndependentVerificationEvidence(evidence,
  JSON.parse(fs.readFileSync(path.join(__dirname, "cli-v2.93.0-release-verification.json"))),
  JSON.parse(fs.readFileSync(path.join(__dirname, "github-trusted-root.json"))),
  { repository: "cli/cli", tagName: "v2.93.0", commitSha: "f96972ce1c11fdb8eaa556257fde962a363dffde" }).length, 0);
if (fs.existsSync(output)) assert(fs.readFileSync(output).equals(bytes), "Never rewrite an existing frozen producer sample.");
else fs.writeFileSync(output, bytes, { flag: "wx" });
console.log(JSON.stringify({ commit, path: path.relative(root, output), sha256: sha256(bytes), bytes_unchanged: true, operational_consent: false }));
