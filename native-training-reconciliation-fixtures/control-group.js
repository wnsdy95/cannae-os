#!/usr/bin/env node
const assert = require("node:assert/strict"), { cases, run } = require("../run-native-training-reconciliation-fixtures");
const groups = Object.freeze({ prefixes: cases.slice(0, 5), authority: cases.slice(5, 11), receipts: cases.slice(11, 19), publication: cases.slice(19) });
const registryGroups = Object.freeze({ prefixes: groups.prefixes, authority: groups.authority, "receipts-durability": groups.receipts.slice(0, 4), "receipts-integrity": groups.receipts.slice(4), publication: groups.publication });
function assertPartition() {
  const all = Object.values(groups).flat();
  assert.equal(cases.length, 25, "Update the complete control partition when adding a native recovery case.");
  assert.equal(all.length, cases.length); assert.equal(new Set(all).size, cases.length);
  assert(cases.every(item => all.includes(item))); assert(Object.values(groups).every(group => group.length > 0 && group.length <= 8));
  const registry = Object.values(registryGroups).flat();
  assert.equal(registry.length, cases.length); assert.equal(new Set(registry).size, cases.length); assert(cases.every(item => registry.includes(item)));
  assert.deepEqual(Object.values(registryGroups).map(group => group.length), [5, 6, 4, 4, 6]);
  return true;
}
module.exports = { groups, registryGroups, assertPartition };
if (require.main === module) {
  const args = process.argv.slice(2);
  try { assertPartition(); assert.equal(args.length, 1); assert(Object.hasOwn(groups, args[0])); }
  catch { console.error("NATIVE_RECOVERY_CONTROL_GROUP_INVALID"); process.exit(2); }
  run(groups[args[0]]).then(result => { console.log(JSON.stringify({ control_group: args[0], expected_group_cases: groups[args[0]].length,
    full_matrix_cases: cases.length, all_required_groups: Object.keys(groups), full_matrix_executed_by_this_group: false, passed: result.passed, failed: result.failed, release_authorized: false }));
    process.exitCode = result.failed ? 1 : 0; });
}
