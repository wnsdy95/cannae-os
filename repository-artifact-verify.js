#!/usr/bin/env node

const { verifyRepositoryArtifacts } = require("./repository-artifact-store");

function parseArgs(argv) {
  const options = { recover: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--recover") {
      options.recover = true;
      continue;
    }
    if (["--repository", "--artifact-root", "--lock-timeout-ms", "--lock-stale-ms"].includes(arg)) {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      options[key === "repository" ? "repositoryPath" : key] = argv[index];
      if (arg.endsWith("-ms")) {
        options[key] = Number(options[key]);
        if (!Number.isInteger(options[key]) || options[key] < 1) throw new Error(`${arg} requires a positive integer.`);
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.repositoryPath) throw new Error("--repository <repo> is required.");
  return options;
}

function main() {
  try {
    const result = verifyRepositoryArtifacts(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { parseArgs };
