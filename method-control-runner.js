#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), broker = require("./method-control-broker");
function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const allowed = { fingerprint: [], prepare: ["repository", "artifact-root", "policy-id", "private-file", "mcp-source"],
    "prepare-continuation": ["previous-file", "checkpoint-ref", "private-file", "source"],
    enroll: ["repository", "artifact-root", "lease", "private-file"],
    describe: ["private-file"], "execute-pending": ["private-file", "request-ref"], "reconcile-delivery": ["private-file", "request-ref"] }[command];
  if (!allowed) throw new Error("Use fingerprint, prepare, prepare-continuation, enroll, describe, execute-pending or reconcile-delivery; this CLI is for the trusted operator, not the acting agent.");
  const flags = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]?.slice(2), value = rest[index + 1];
    if (!rest[index]?.startsWith("--") || !allowed.includes(key) || Object.hasOwn(flags, key) || !value || value.startsWith("--")) throw new Error("Unsupported, duplicate or incomplete channel argument.");
    flags[key] = value;
  }
  if (command === "fingerprint") {
    const contract = require("./method-control-contract");
    return { runtime_sha256: contract.runtimeDigest(), measured_files: contract.CODE, ...contract.AUTHORITY };
  }
  if (!flags["private-file"] || !path.isAbsolute(flags["private-file"])) throw new Error("--private-file must be an absolute private path outside the repository.");
  if (command === "prepare-continuation") {
    if (!flags["previous-file"] || !path.isAbsolute(flags["previous-file"]) || !flags["checkpoint-ref"] || !flags.source) {
      throw new Error("prepare-continuation requires an absolute --previous-file, exact --checkpoint-ref JSON file and --source.");
    }
    return broker.prepareContinuation(flags["previous-file"], JSON.parse(fs.readFileSync(flags["checkpoint-ref"], "utf8")), flags["private-file"], flags.source);
  }
  if (command === "prepare" || command === "enroll") {
    if (!flags.repository || !(command === "prepare" ? flags["policy-id"] : flags.lease)) throw new Error(`${command} requires --repository and ${command === "prepare" ? "--policy-id" : "--lease"}.`);
    const repository = fs.realpathSync(flags.repository), artifactRoot = path.resolve(flags["artifact-root"] || path.join(repository, ".cannae", "artifacts"));
    return command === "prepare" ? broker.prepare({ repository, artifactRoot }, flags["policy-id"], flags["private-file"], flags["mcp-source"] || "project") :
      broker.enroll({ repository, artifactRoot }, flags.lease, flags["private-file"]);
  }
  if (command === "describe") {
    const bundle = broker.inspectLaunch(flags["private-file"]);
    const gate = require("./method-deviation-gate"), same = require("./order-intake-contract").same;
    const observations = bundle.store.manifest.artifacts.filter(item => item.kind === "method-control-session-observations")
      .map(item => gate.read(bundle.store, gate.reference(item), "method-control-session-observations", "method-control-session-observation"))
      .filter(item => same(item.payload.launch_slot_ref, bundle.slot.ref));
    if (observations.length > 1) throw new Error("METHOD_CONTROL_SESSION_ALREADY_OBSERVED");
    return { server_name: bundle.slot.payload.server_name, launch_descriptor: bundle.secret.launch_descriptor,
      launch_slot_ref: bundle.slot.ref, enrollment_status: bundle.secret.enrollment_id === "pending" ? "awaiting_trusted_operator" : "bound_requires_appraisal",
      session_observation: observations.length ? { artifact_ref: observations[0].ref, provider: observations[0].payload.provider,
        session_binding: observations[0].payload.session_binding, source: observations[0].payload.source } : null,
      provider_startup_verified: false, ...require("./method-control-contract").AUTHORITY };
  }
  if (!flags["request-ref"]) throw new Error("An exact retained --request-ref JSON file is required.");
  const reference = JSON.parse(fs.readFileSync(flags["request-ref"], "utf8"));
  if (command === "reconcile-delivery") return broker.reconcile(flags["private-file"], reference);
  const bundle = broker.load(flags["private-file"]);
  const request = require("./method-deviation-gate").read(bundle.store, reference, "method-control-requests", "method-control-request");
  return broker.execute(flags["private-file"], request.payload.operation, request.payload.arguments);
}
module.exports = { main };
if (require.main === module) {
  try { console.log(JSON.stringify(main(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
