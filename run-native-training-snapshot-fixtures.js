#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process"), assert = require("node:assert/strict");
const c = require("./native-training-producer"), s = require("./native-training-producer-fixtures/snapshots"), { sha256 } = require("./order-intake-contract");
let passed = 0; const test = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
for (const name of c.snapshotNames()) test(`${name} restores the exact complete tree, commit, source and method without nested archive copies`, () => {
  const restored = s.restoreSnapshot(name, { loadSupport: false });
  try {
    assert.equal(cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: restored.root, encoding: "utf8" }).trim(), restored.snapshot.source_revision);
    for (const blob of restored.snapshot.external_blobs || []) assert.equal(sha256(fs.readFileSync(path.join(restored.root, blob.path))), blob.sha256);
    assert.equal(restored.snapshot.execution_authorized, false); assert.equal(restored.snapshot.release_authorized, false);
  } finally { fs.rmSync(restored.temporary, { recursive: true, force: true }); }
});
test("both snapshot formats reject traversal, duplicate blobs, hybrid methods and extra authority", () => {
  const value = c.legacySnapshot("bcb79dd");
  for (const file of ["../outside.tar.gz", "/outside.tar.gz", "native-training-producer-fixtures/../outside.tar.gz", "native-training-producer-fixtures\\legacy-x-source.tar.gz"]) {
    const changed = structuredClone(value); changed.external_blobs[0].path = file; assert.throws(() => s.checkedSnapshot(changed), /NATIVE_SNAPSHOT_SCHEMA_INVALID/);
  }
  assert.throws(() => s.checkedSnapshot({ ...value, external_blobs: [...value.external_blobs, ...value.external_blobs] }), /NATIVE_SNAPSHOT_BINDING_INVALID/);
  assert.throws(() => s.checkedSnapshot({ ...value, method_sha256: "0".repeat(64) }), /NATIVE_SNAPSHOT_BINDING_INVALID/);
  assert.throws(() => s.checkedSnapshot({ ...value, execution_authorized: true }), /NATIVE_SNAPSHOT_SCHEMA_INVALID/);
  assert.throws(() => s.checkedSnapshot({ ...value, schema_version: "0.1" }), /NATIVE_SNAPSHOT_BINDING_INVALID/);
  assert.throws(() => c.legacySnapshot("caller-selected-producer"), /SEMANTIC_TRAINING_PRODUCER_UNKNOWN/);
});
test("substituted archive buffers are rejected before any extraction or historical execution", () => {
  const archive = path.join(__dirname, "native-training-producer-fixtures", c.legacySnapshot("bcb79dd").archive_file);
  const open = fs.openSync, read = fs.readFileSync, exec = cp.execFileSync; let selected, extracted = false;
  fs.openSync = function(file, ...rest) { const fd = open.call(this, file, ...rest); if (file === archive) selected = fd; return fd; };
  fs.readFileSync = function(file, ...rest) { const bytes = read.call(this, file, ...rest); return file === selected ? Buffer.concat([Buffer.from(bytes), Buffer.from("substitution")]) : bytes; };
  cp.execFileSync = function(command, ...rest) { if (command === "tar") extracted = true; return exec.call(this, command, ...rest); };
  try { assert.throws(() => s.restoreSnapshot("bcb79dd", { loadSupport: false }), /NATIVE_SNAPSHOT_BYTES_CHANGED/); assert.equal(extracted, false); }
  finally { fs.openSync = open; fs.readFileSync = read; cp.execFileSync = exec; }
});
test("historical snapshot and inspection copies cannot mutate the next pinned observation", () => {
  const snapshot = c.legacySnapshot("bcb79dd"); snapshot.external_blobs[0].sha256 = "0".repeat(64);
  assert.notEqual(c.legacySnapshot("bcb79dd").external_blobs[0].sha256, snapshot.external_blobs[0].sha256);
  const old = c.inspect(c.legacySnapshot("bcb79dd").method_sha256); assert.equal(old.profile, "historical_bcb79dd"); assert.equal(old.hold_discharge_authorized, false);
  assert.notEqual(c.inspect().method_sha256, old.method_sha256);
});
test("external source blob substitution fails before extraction and never weakens complete-tree checks", () => {
  const value = c.legacySnapshot("bcb79dd"), target = path.join(__dirname, value.external_blobs[0].path), open = fs.openSync, read = fs.readFileSync, exec = cp.execFileSync;
  let selected, extracted = false;
  fs.openSync = function(file, ...rest) { const fd = open.call(this, file, ...rest); if (file === target) selected = fd; return fd; };
  fs.readFileSync = function(file, ...rest) { const bytes = read.call(this, file, ...rest); return file === selected ? Buffer.concat([Buffer.from(bytes), Buffer.from("changed")]) : bytes; };
  cp.execFileSync = function(command, ...rest) { if (command === "tar") extracted = true; return exec.call(this, command, ...rest); };
  try { assert.throws(() => s.restoreSnapshot("bcb79dd", { loadSupport: false }), /NATIVE_SNAPSHOT_BYTES_CHANGED/); assert.equal(extracted, false); }
  finally { fs.openSync = open; fs.readFileSync = read; cp.execFileSync = exec; }
});
test("a cached catalog cannot excuse changed pinned bytes after module loading", () => {
  const snapshot = c.legacySnapshot("bcb79dd"), target = path.join(__dirname, "native-training-producer-fixtures/legacy-bcb79dd.json"), read = fs.readFileSync;
  fs.readFileSync = function(file, ...rest) { const bytes = read.call(this, file, ...rest); return file === target ? Buffer.concat([Buffer.from(bytes), Buffer.from(" ")]) : bytes; };
  try {
    assert.throws(() => c.inspect(snapshot.method_sha256), /SEMANTIC_TRAINING_PRODUCER_CATALOG_CHANGED/);
    assert.throws(() => c.legacySnapshot("bcb79dd"), /SEMANTIC_TRAINING_PRODUCER_CATALOG_CHANGED/);
  } finally { fs.readFileSync = read; }
});
console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, producer_execution_attested: false, hold_discharge_implemented: false }));
