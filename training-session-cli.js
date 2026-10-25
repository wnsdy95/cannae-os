#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), core = require("./training-session-controller");
function main(argv = process.argv.slice(2)) {
  const [action, input, ...rest] = argv, flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!["--repository", "--artifact-root"].includes(rest[i]) || flags[rest[i]] || !rest[i + 1]) throw new Error("TRAINING_SESSION_ARGUMENT_INVALID");
    flags[rest[i]] = rest[i + 1];
  }
  if (action !== "propose" || !input || !flags["--repository"]) throw new Error("TRAINING_SESSION_ARGUMENT_INVALID");
  const file = path.resolve(input), stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error("TRAINING_SESSION_INPUT_FILE_INVALID");
  const bytes = fs.readFileSync(file), text = bytes.toString("utf8");
  if (!Buffer.from(text).equals(bytes)) throw new Error("TRAINING_SESSION_INPUT_ENCODING_INVALID");
  const repository = path.resolve(flags["--repository"]), artifactRoot = path.resolve(flags["--artifact-root"] || path.join(repository, ".cannae/artifacts"));
  console.log(JSON.stringify(core.propose(JSON.parse(text), { repository, artifactRoot }), null, 2));
}
if (require.main === module) { try { main(); } catch (error) { console.error(/^TRAINING_[A-Z_]+$/.test(error.message) ? error.message : "TRAINING_SESSION_PROPOSAL_FAILED"); process.exitCode = 2; } }
module.exports = { main };
