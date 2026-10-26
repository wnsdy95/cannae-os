const fs = require("node:fs"), path = require("node:path"), { z } = require("zod");
const t = require("./task-training-contract"), { sha256 } = require("./order-intake-contract");
const catalogs = [
  { name: "cab6d09", path: "native-training-producer-fixtures/legacy-cab6d09.json", sha256: "8d501424f8cc051240b0b533d936c5766d12f93d09eacba7d9ccb5bba93ac8bb" },
  { name: "bcb79dd", path: "native-training-producer-fixtures/legacy-bcb79dd.json", sha256: "1405d992b38ab1e62f1ee415881efea741f5dc417f00d2fa36568073cbf0aab3" }
].map(entry => {
  const bytes = fs.readFileSync(path.join(__dirname, entry.path));
  if (sha256(bytes) !== entry.sha256) throw new Error("SEMANTIC_TRAINING_PRODUCER_CATALOG_CHANGED");
  return { ...entry, value: JSON.parse(bytes) };
});
const METHOD_FILES = Object.freeze([...catalogs[0].value.method_files.map(item => item.file), "native-training-producer.js", ...catalogs.map(entry => entry.path),
  "operator-native-training-failure.js", "operator-native-training-reconciliation-contract.js", "operator-reconciliation-contract-core.js",
  "schema-files/native-training-failure-appraisal.schema.json", "schema-files/operator-native-training-reconciliation-authorization.schema.json", "schema-files/operator-native-training-reconciliation-record.schema.json"]);
const hex = z.string().regex(/^[a-f0-9]{64}$/), gitId = z.string().regex(/^[a-f0-9]{40}$/);
const flags = Object.fromEntries(Object.entries(t.FLAGS).map(([key, value]) => [key, z.literal(value)]));
const INSPECTION = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("NativeTrainingProducerInspection"),
  id: z.string().regex(/^NTPI-[a-f0-9]{40}$/), profile: z.enum(["current", "historical_cab6d09", "historical_bcb79dd"]),
  method_sha256: hex, dependency_lock_sha256: hex, source_revision: gitId.nullable(), source_tree: gitId.nullable(),
  method_files: z.array(z.strictObject({ file: z.string().min(1).max(256), sha256: hex })).min(21).max(32),
  inspection_only: z.literal(true), producer_execution_attested: z.literal(false), producer_trust_admitted: z.literal(false),
  historical_execution_authorized: z.literal(false), hold_discharge_authorized: z.literal(false), ...flags });
const SCHEMAS = { "native-training-producer-inspection": INSPECTION };
function assertCatalogs() {
  for (const entry of catalogs) if (sha256(fs.readFileSync(path.join(__dirname, entry.path))) !== entry.sha256) throw new Error("SEMANTIC_TRAINING_PRODUCER_CATALOG_CHANGED");
}
function currentFiles() { assertCatalogs(); return METHOD_FILES.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(__dirname, file))) })); }
function currentMethodBinding() { return t.digest(currentFiles()); }
function descriptor(method) {
  assertCatalogs();
  let files, profile, revision, tree;
  const captured = catalogs.find(entry => entry.value.method_sha256 === method);
  if (captured) {
    files = captured.value.method_files; profile = `historical_${captured.name}`; revision = captured.value.source_revision; tree = captured.value.source_tree;
  } else {
    files = currentFiles();
    if (method !== t.digest(files)) throw new Error("SEMANTIC_TRAINING_PRODUCER_UNKNOWN");
    profile = "current"; revision = null; tree = null;
  }
  return { schema_version: "0.1", type: "NativeTrainingProducerInspection", profile, method_sha256: method,
    dependency_lock_sha256: files.find(item => item.file === "package-lock.json").sha256,
    source_revision: revision, source_tree: tree, method_files: files.map(item => ({ ...item })),
    inspection_only: true, producer_execution_attested: false, producer_trust_admitted: false,
    historical_execution_authorized: false, hold_discharge_authorized: false, ...t.FLAGS };
}
function issues(value, type) {
  if (!SCHEMAS[type]) return [];
  const issue = code => [{ severity: "critical", code, path: "$", message: "Exact producer inspection never grants execution or discharges uncertainty." }];
  if (!INSPECTION.safeParse(value).success) return issue("NATIVE_TRAINING_PRODUCER_SCHEMA_INVALID");
  let expected; try { expected = t.identified("NTPI", descriptor(value.method_sha256)); } catch { return issue("NATIVE_TRAINING_PRODUCER_UNKNOWN"); }
  return t.digest(expected) === t.digest(value) ? [] : issue("NATIVE_TRAINING_PRODUCER_SUBSTITUTED");
}
function checked(value) {
  require("./workload-control-contract").assertJsonLimits(value);
  if (!INSPECTION.safeParse(value).success) throw new Error("NATIVE_TRAINING_PRODUCER_SCHEMA_INVALID");
  const errors = issues(value, "native-training-producer-inspection"); if (errors.length) throw new Error(errors[0].code); return value;
}
function inspect(method = currentMethodBinding()) { return checked(t.identified("NTPI", descriptor(method))); }
function legacySnapshot(name = "cab6d09") {
  assertCatalogs();
  const entry = catalogs.find(entry => entry.name === name); if (!entry) throw new Error("SEMANTIC_TRAINING_PRODUCER_UNKNOWN");
  return JSON.parse(JSON.stringify(entry.value));
}
const snapshotNames = () => catalogs.map(entry => entry.name);
module.exports = { METHOD_FILES, INSPECTION, SCHEMAS, currentMethodBinding, inspect, issues, checked, legacySnapshot, snapshotNames };
