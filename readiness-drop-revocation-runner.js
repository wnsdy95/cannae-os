#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const { digest, sha256, AUTHORITY } = require("./order-intake-contract");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");
const need = (value, code) => { if (!value) throw new Error(code); };
const rank = { X: 0, U: 1, P: 2, T: 3 }, terminal = new Set(["revoked", "superseded", "completed"]);
const reference = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
function reconciliationIssues(payload) {
  const { id, ...body } = payload, issues = [];
  const issue = code => ({ severity: "critical", code, path: "$", message: "Bind the complete non-authorizing report and include each lease once." });
  if (id !== `RDR-${digest(body).slice(0, 40)}`) issues.push(issue("READINESS_RECONCILIATION_ID_INVALID"));
  const leases = payload.results.map(item => item.lease_ref.artifact_id);
  if (new Set(leases).size !== leases.length) issues.push(issue("READINESS_RECONCILIATION_LEASE_DUPLICATE"));
  return issues;
}
function clock(options) {
  const value = options.now || new Date().toISOString(); need(Number.isFinite(Date.parse(value)), "READINESS_CLOCK_INVALID"); return value;
}
function load(options) {
  const repository = resolveRepository(options.repository);
  const view = require("./campaign-supervisor").loadVerifiedStore(repository.root, options.artifactRoot || path.join(repository.root, ".cannae/artifacts"));
  return { ...view, repository };
}
function read(view, entry) {
  const namespace = fs.realpathSync(path.join(view.artifactRoot, "repositories", view.verification.repository.key));
  const file = fs.realpathSync(path.resolve(view.artifactRoot, entry.relative_path)), stat = fs.statSync(file);
  need(file.startsWith(namespace + path.sep) && stat.isFile() && stat.size <= 8388608, "READINESS_HISTORY_PATH_INVALID");
  const bytes = fs.readFileSync(file); need(sha256(bytes) === entry.sha256, "READINESS_HISTORY_DIGEST_INVALID");
  need(Buffer.from(bytes.toString("utf8")).equals(bytes), "READINESS_HISTORY_UTF8_INVALID");
  return JSON.parse(bytes.toString("utf8"));
}
function dropHistory(view, actor, now) {
  need(typeof actor.operational_role === "string" && typeof actor.task === "string", "READINESS_ASSIGNMENT_INVALID");
  const rows = [], identities = new Set();
  for (const entry of view.manifest.artifacts.filter(item => item.kind === "readiness-events")) {
    const event = read(view, entry);
    need(require("./validator-cli-prototype/validate").validatePayload(event, "readiness-event").valid &&
      event.id === entry.artifact_id && event.mission_id === entry.mission_id, "READINESS_HISTORY_SCOPE_INVALID");
    need(!identities.has(event.id), "READINESS_HISTORY_ID_AMBIGUOUS"); identities.add(event.id);
    const effective = Date.parse(event.effective_at), introduced = Date.parse(entry.created_at);
    need(Number.isFinite(introduced) && effective <= introduced && introduced <= Date.parse(now), "READINESS_HISTORY_TIME_INVALID");
    if (event.agent_id !== actor.operational_role || event.task !== actor.task) continue;
    rows.push({ event, ref: reference(entry), effective, introduced });
  }
  const streams = new Map();
  if (rows.length > 1) {
    for (const row of rows) {
      const entry = view.manifest.artifacts.find(item => digest(reference(item)) === digest(row.ref));
      try { row.revision = require("./campaign-terminal-controller").prefixBeforeEntry(view, entry).manifest.manifest_revision + 1; }
      catch { throw new Error("READINESS_PUBLICATION_HISTORY_UNAVAILABLE"); }
    }
    rows.sort((left, right) => left.revision - right.revision);
  }
  for (const row of rows) {
    const key = `${row.event.metl_id}\0${row.event.metl_task_id}`, previous = streams.get(key);
    need(!previous || (row.effective >= previous.effective && row.introduced >= previous.introduced &&
      row.event.previous_rating === previous.event.new_rating), "READINESS_HISTORY_TRANSITION_CONFLICT");
    streams.set(key, row);
  }
  need(streams.size <= 1, "READINESS_TASK_IDENTITY_AMBIGUOUS");
  // A later promotion is not fresh scope consent and cannot resurrect old grants.
  return rows.filter(row => rank[row.event.new_rating] < rank[row.event.previous_rating] || rank[row.event.new_rating] < rank.P);
}
function assessment(view, actor, now) {
  const drops = dropHistory(view, actor, now);
  return { code: drops.length ? "READINESS_REQUALIFICATION_REQUIRED" : "READINESS_NO_RETAINED_DROP",
    role: actor.operational_role, task_sha256: digest(actor.task), event_refs: drops.map(item => item.ref),
    qualified_readiness_proven: false, grant_restoration_authorized: false, ...AUTHORITY };
}
function assertMayExecute(view, actor, now) {
  const result = assessment(view, actor, now);
  need(result.event_refs.length === 0, result.code); return result;
}
function leaseAssignment(view, lease) {
  const entries = view.manifest.artifacts.filter(entry => digest(reference(entry)) === digest(lease.context_pack_ref));
  need(entries.length === 1 && entries[0].kind === "agent-context-packs", "READINESS_CONTEXT_REFERENCE_INVALID");
  const context = read(view, entries[0]);
  need(require("./validator-cli-prototype/validate").validatePayload(context, "agent-context-pack").valid &&
    context.agent_id === lease.agent_id && context.mission_id === lease.mission_id && context.wave_id === lease.wave_id,
  "READINESS_CONTEXT_SCOPE_INVALID");
  return context;
}
function inspect(options) {
  const view = load(options), now = clock(options), dispatch = require("./dispatch-runtime-controller");
  const status = dispatch.dispatchStatus(options), leases = [];
  for (const lease of status.leases.filter(item => !terminal.has(item.status))) {
    const entries = view.manifest.artifacts.filter(entry => digest(reference(entry)) === digest(lease.lease_ref));
    need(entries.length === 1 && entries[0].kind === "agent-dispatch-leases", "READINESS_LEASE_REFERENCE_INVALID");
    const payload = read(view, entries[0]), result = assessment(view, leaseAssignment(view, payload), now);
    if (result.event_refs.length) leases.push({ lease_ref: lease.lease_ref, mission_id: lease.mission_id, wave_id: lease.wave_id,
      agent_id: lease.agent_id, status: lease.status, pending_tool_requests: lease.pending_tool_requests,
      unresolved_tool_effects: lease.unresolved_tool_effects, unresolved_gateway_transactions: lease.unresolved_gateway_transactions,
      event_refs: result.event_refs, next_call_allowed: false });
  }
  return { type: "ReadinessDropInspection", repository_key: view.verification.repository.key,
    manifest_sha256: view.verification.manifest_sha256, observed_at: now, affected_leases: leases,
    registry_complete: false, requalification_supported: false, ...AUTHORITY };
}
function reconcile(options) {
  const initial = inspect(options), results = [];
  for (const item of initial.affected_leases) {
    const view = load(options), entries = view.manifest.artifacts.filter(entry => digest(reference(entry)) === digest(item.lease_ref));
    need(entries.length === 1, "READINESS_LEASE_REFERENCE_INVALID"); const lease = read(view, entries[0]);
    const current = assessment(view, leaseAssignment(view, lease), clock(options));
    need(current.event_refs.length > 0, "READINESS_DROP_NOT_RETAINED");
    const result = require("./dispatch-runtime-controller").revokeLease(options, lease.id, "READINESS_REQUALIFICATION_REQUIRED");
    results.push({ lease_ref: item.lease_ref, event_refs: current.event_refs, status: result.status, checkpoint_ref: result.checkpoint_ref });
  }
  const body = { schema_version: "0.1", type: "ReadinessDropReconciliation", observed_at: clock(options),
    repository_key: initial.repository_key, initial_manifest_sha256: initial.manifest_sha256, results,
    registry_complete: false, requalification_supported: false, ...AUTHORITY };
  const report = { ...body, id: `RDR-${digest(body).slice(0, 40)}` };
  need(require("./validator-cli-prototype/validate").validatePayload(report, "readiness-drop-reconciliation").valid, "READINESS_REPORT_INVALID");
  const written = writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: options.artifactRoot,
    missionId: "MIS-READINESS-RECONCILIATION", waveId: "W1", kind: "readiness-drop-reconciliations", artifactId: report.id,
    payload: report, createdAt: report.observed_at, reuseExisting: true, publicationGuard: () => {
      const current = load(options);
      for (const result of results) {
        const entry = current.manifest.artifacts.find(item => digest(reference(item)) === digest(result.checkpoint_ref));
        need(entry && entry.kind === "agent-execution-checkpoints", "READINESS_REPORT_CHECKPOINT_INVALID");
        const checkpoint = read(current, entry);
        need(digest(checkpoint.lease_ref) === digest(result.lease_ref) && checkpoint.lease_status === result.status &&
          checkpoint.reason_codes.includes("READINESS_REQUALIFICATION_REQUIRED") && result.event_refs.every(ref =>
            current.manifest.artifacts.some(item => item.kind === "readiness-events" && digest(reference(item)) === digest(ref))),
        "READINESS_REPORT_BINDING_INVALID");
      }
      return true;
    } });
  return { ...report, artifact_ref: { artifact_id: report.id, relative_path: written.relative_path, sha256: written.sha256 } };
}
function main(argv = process.argv.slice(2)) {
  const [action, ...rest] = argv, options = {};
  need(["inspect", "reconcile"].includes(action) && rest.length % 2 === 0, "READINESS_CLI_USAGE_INVALID");
  for (let index = 0; index < rest.length; index += 2) {
    const key = { "--repository": "repository", "--artifact-root": "artifactRoot" }[rest[index]];
    need(key && !Object.hasOwn(options, key) && rest[index + 1] && !rest[index + 1].startsWith("--"), "READINESS_CLI_OPTION_INVALID");
    options[key] = rest[index + 1];
  }
  need(options.repository, "READINESS_CLI_REPOSITORY_REQUIRED");
  console.log(JSON.stringify(action === "inspect" ? inspect(options) : reconcile(options), null, 2));
}
module.exports = { assessment, assertMayExecute, inspect, reconcile, reconciliationIssues, main };
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
