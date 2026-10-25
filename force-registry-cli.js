#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), core = require("./force-registry-controller");
function regular(file, maximum) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) throw new Error("FORCE_REGISTRY_INPUT_FILE_INVALID");
  const bytes = fs.readFileSync(file), text = bytes.toString("utf8");
  if (!Buffer.from(text).equals(bytes)) throw new Error("FORCE_REGISTRY_INPUT_ENCODING_INVALID");
  return text;
}
function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv, args = [], flags = {};
  for (let index = 0; index < rest.length; index++) {
    const value = rest[index];
    if (value.startsWith("--")) {
      if (!["--repository", "--artifact-root", "--operator-public-key"].includes(value) || flags[value] || !rest[index + 1] || rest[index + 1].startsWith("--")) throw new Error("FORCE_REGISTRY_ARGUMENT_INVALID");
      flags[value] = rest[++index];
    } else args.push(value);
  }
  if (!flags["--repository"]) throw new Error("FORCE_REGISTRY_REPOSITORY_REQUIRED");
  const options = { repository: path.resolve(flags["--repository"]), artifactRoot: path.resolve(flags["--artifact-root"] || path.join(flags["--repository"], ".cannae/artifacts")) };
  let result;
  if (command === "propose" && args.length === 1 && !flags["--operator-public-key"]) {
    result = core.propose(JSON.parse(regular(path.resolve(args[0]), 262144)), options);
  } else if (command === "inspect" && args.length === 0) {
    result = core.inspection(options, flags["--operator-public-key"] ? regular(path.resolve(flags["--operator-public-key"]), 16384) : null);
  } else throw new Error("FORCE_REGISTRY_ARGUMENT_INVALID");
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) { try { main(); } catch (error) { console.error(/^FORCE_[A-Z_]+$/.test(error.message) ? error.message : "FORCE_REGISTRY_OPERATION_FAILED"); process.exitCode = 2; } }
module.exports = { main };
