#!/usr/bin/env node
const fs = require("node:fs");
const USAGE = "Usage: native-training-product-cli.js propose <request.json> --repository <repo> --artifact-root <artifacts>";
function main(argv = process.argv.slice(2)) {
  const [action, file, ...args] = argv, options = {};
  if (action !== "propose" || !file || args.length % 2) throw new Error(USAGE);
  for (let i = 0; i < args.length; i += 2) {
    const key = { "--repository": "repository", "--artifact-root": "artifactRoot" }[args[i]];
    if (!key || options[key] || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("SEMANTIC_TRAINING_CLI_OPTION_INVALID"); options[key] = args[i + 1];
  }
  if (!options.repository || !options.artifactRoot) throw new Error("SEMANTIC_TRAINING_CLI_SCOPE_REQUIRED");
  const input = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(JSON.stringify(require("./native-training-product-controller").propose(input, options), null, 2));
}
module.exports = { main };
if (require.main === module) { try { main(); } catch (error) {
  const code = error?.message; console.error(code === USAGE || /^(?:SEMANTIC|NATIVE|WORKLOAD)_[A-Z_]+$/.test(code) ? code : "SEMANTIC_TRAINING_PROPOSAL_FAILED"); process.exitCode = 1;
} }
