#!/usr/bin/env node
if (process.argv.length !== 2) { console.error("NATIVE_RECOVERY_REGISTRY_ARGUMENTS_INVALID"); process.exitCode = 2; }
else {
  const { registryGroups, assertPartition } = require("./native-training-reconciliation-fixtures/control-group");
  assertPartition();
  require("./run-native-training-reconciliation-fixtures").run(registryGroups.authority).then(result => { process.exitCode = result.failed ? 1 : 0; });
}
