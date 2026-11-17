#!/usr/bin/env node
function main(argv = process.argv.slice(2)) {
  if (argv[0] !== "inspect" || argv.length > 2 || argv[1] !== undefined && !/^[a-f0-9]{64}$/.test(argv[1])) throw new Error("SEMANTIC_TRAINING_PRODUCER_CLI_INVALID");
  console.log(JSON.stringify(require("./native-training-producer").inspect(argv[1]), null, 2));
}
module.exports = { main };
if (require.main === module) try { main(); } catch (error) {
  console.error(/^(?:SEMANTIC|NATIVE)_TRAINING_PRODUCER_[A-Z_]+$/.test(error.message) ? error.message : "SEMANTIC_TRAINING_PRODUCER_INSPECTION_FAILED"); process.exitCode = 1;
}
