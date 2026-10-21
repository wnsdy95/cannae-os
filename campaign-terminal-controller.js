#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { manifestDigest, writeRepositoryArtifact } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { missionStopRecords } = require("./campaign-stop-controller");
const { canonicalBytes, inputDigest, historicalDispatchStatus } = require("./dispatch-runtime-controller");
const { historicalSettlementStore, loadSettlementArtifact } = require("./effect-settlement-proof");
const { buildUpdate } = require("./aar-to-readiness-update");

const KIND = "campaign-terminal-records";
const NONE = { artifact_id: "none", relative_path: "none", sha256: "none" };
const WAVE_KINDS = new Set([
  "mission-wave-plans", "mission-wave-reports", "mission-wave-closeouts", "mission-wave-terminations",
  "routing-receipts", "routing-preflight-bundles", "routing-preflights", "agent-context-packs",
  "control-execution-receipts", "integrated-mission-preflights", "dispatch-tool-policies", "agent-dispatch-leases", "agent-execution-checkpoints",
  "tool-admission-events", "tool-gateway-requests", "tool-gateway-decisions", "tool-execution-receipts",
  "tool-gateway-transaction-events", "tool-effect-settlements", "gateway-effect-settlements"
]);
const AUTHORITY_KINDS = new Set([
  "mission-wave-plans", "mission-wave-reports", "routing-receipts", "routing-preflight-bundles", "routing-preflights",
  "agent-context-packs", "dispatch-tool-policies", "agent-dispatch-leases", "tool-gateway-requests"
]);

function requireTrue(value, code) { if (!value) throw new Error(code); }
function ref(entry) { return { artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 }; }
function same(a, b) { return inputDigest(a) === inputDigest(b); }
function at(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  requireTrue(Number.isFinite(parsed), "CAMPAIGN_TERMINAL_TIME_INVALID");
  return parsed;
}
function valid(value, type) {
  const result = validatePayload(value, type);
  requireTrue(result.valid, `CAMPAIGN_TERMINAL_INVALID:${type}:${result.issues.map(item => item.code).join(",")}`);
}
function load(options) {
  return loadVerifiedStore(options.repository, options.artifactRoot || path.join(options.repository, ".cannae", "artifacts"));
}
function snapshot(store) { return { revision: store.manifest.manifest_revision, sha256: manifestDigest(store.manifest) }; }
function reference(store, value, kind, type, scope = {}) {
  const payload = loadSettlementArtifact(store, value, kind, type);
  const entry = store.manifest.artifacts.find(item => same(ref(item), value));
  requireTrue(entry && (!scope.mission_id || entry.mission_id === scope.mission_id) &&
    (!scope.wave_id || entry.wave_id === scope.wave_id), "CAMPAIGN_TERMINAL_REFERENCE_SCOPE_MISMATCH");
  requireTrue((payload.mission_id === undefined || payload.mission_id === entry.mission_id) &&
    (payload.wave_id === undefined || payload.wave_id === entry.wave_id), "CAMPAIGN_TERMINAL_ARTIFACT_IDENTITY_MISMATCH");
  return { payload, entry, ref: ref(entry) };
}
function one(store, scope, kind, type) {
  const matches = store.manifest.artifacts.filter(item => item.kind === kind && item.mission_id === scope.mission_id && item.wave_id === scope.wave_id);
  requireTrue(matches.length === 1, `CAMPAIGN_TERMINAL_WAVE_RECORD_REQUIRED:${scope.wave_id}:${kind}`);
  return reference(store, ref(matches[0]), kind, type, scope);
}
function dispatch(store, scope) {
  return historicalDispatchStatus({ repository: store.verification.repository.root, artifactRoot: store.artifactRoot }, snapshot(store),
    { missionId: scope.mission_id, waveId: scope.wave_id });
}
function dispatchSettled(projection) {
  return projection.unresolved_gateway_obligations.length === 0 && projection.leases.every(lease =>
    ["completed", "revoked", "superseded"].includes(lease.status) && lease.pending_tool_requests === 0 &&
    lease.unresolved_tool_effects === 0 && lease.unresolved_gateway_transactions === 0 && !lease.failed_effect_revocation_required);
}
function prefixBeforeEntry(store, entry) {
  let low = store.manifest.integrity.history_start_revision;
  let high = store.manifest.manifest_revision;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const prefix = historicalSettlementStore(store, mid, store.manifestHistory.get(mid));
    if (prefix.manifest.artifacts.some(item => same(ref(item), ref(entry)))) high = mid;
    else low = mid + 1;
  }
  requireTrue(low > store.manifest.integrity.history_start_revision, "CAMPAIGN_TERMINAL_PUBLICATION_HISTORY_MISSING");
  return historicalSettlementStore(store, low - 1, store.manifestHistory.get(low - 1));
}
function assertPrecedes(record, time) {
  requireTrue(at(record.entry.created_at) <= at(time), "CAMPAIGN_TERMINAL_PREDECESSOR_TIME_INVALID");
}

function verifiedPreflight(store, plan) {
  const scope = { mission_id: plan.payload.mission_id, wave_id: plan.payload.wave_id };
  const bundle = one(store, scope, "routing-preflight-bundles", null);
  const preflight = one(store, scope, "routing-preflights", null);
  requireTrue(same(bundle.payload.expected_agents, plan.payload.agents.map(agent => agent.agent_id)) &&
    Array.isArray(bundle.payload.receipts) && same(preflight.payload, require("./agent-routing-preflight-runner").analyzeRoutingPreflight(bundle.payload)) &&
    preflight.payload.status === "ready", "CAMPAIGN_TERMINAL_PREFLIGHT_MISMATCH");
  for (const receipt of bundle.payload.receipts) {
    valid(receipt, "routing-receipt");
    const entries = store.manifest.artifacts.filter(item => item.kind === "routing-receipts" && item.mission_id === scope.mission_id &&
      item.wave_id === scope.wave_id && item.artifact_id === receipt.id);
    requireTrue(entries.length === 1 && same(reference(store, ref(entries[0]), "routing-receipts", "routing-receipt", scope).payload, receipt),
      "CAMPAIGN_TERMINAL_ROUTING_RECEIPT_MISMATCH");
  }
  return preflight;
}

function verifyTermination(store, plan, ending) {
  const value = ending.payload;
  const before = prefixBeforeEntry(store, ending.entry);
  const scope = { mission_id: value.mission_id, wave_id: value.wave_id };
  const retained = before.manifest.artifacts.filter(item => item.mission_id === scope.mission_id && item.wave_id === scope.wave_id);
  requireTrue(same(value.plan_ref, plan.ref) && value.plan_valid_until === plan.payload.valid_until &&
    same(value.retained_artifact_refs, retained.map(ref)) && at(value.terminated_at) === at(ending.entry.created_at) &&
    retained.every(item => at(item.created_at) <= at(value.terminated_at)), "CAMPAIGN_TERMINAL_TERMINATION_BINDING_INVALID");
  const request = { schema_version: "0.1", type: "MissionWaveTerminationRequest", ...scope, status: value.status,
    reason: value.reason, plan_ref: value.plan_ref, successor_plan_ref: value.successor_plan_ref, decision_ref: value.decision_ref };
  const bytes = canonicalBytes(request);
  requireTrue(value.request_sha256 === crypto.createHash("sha256").update(bytes.subarray(0, bytes.length - 1)).digest("hex"),
    "CAMPAIGN_TERMINAL_TERMINATION_REQUEST_MISMATCH");
  if (value.status !== "expired") {
    const decision = reference(before, value.decision_ref, "decision-logs", "decision-log", scope);
    const grant = decision.payload;
    const time = at(value.terminated_at);
    requireTrue(grant.decision_maker === "USER" && grant.decision_type === "scope" && grant.status === "complete" &&
      grant.authority_basis.basis_type === "retained_authority" && grant.authority_basis.reference === plan.payload.id &&
      grant.chosen_option === `terminate:${value.status}:${plan.ref.sha256}:${value.successor_plan_ref.sha256}` &&
      grant.options_considered.includes(grant.chosen_option) && grant.affected_artifacts.includes(plan.ref.relative_path) &&
      at(grant.decided_at) >= at(plan.payload.created_at) && at(grant.decided_at) <= time && time - at(grant.decided_at) <= 3600000,
    "CAMPAIGN_TERMINAL_TERMINATION_USER_DECISION_REQUIRED");
    assertPrecedes(decision, value.terminated_at);
    if (value.status === "superseded") {
      const successor = reference(before, value.successor_plan_ref, "mission-wave-plans", "mission-wave-plan");
      const nextScope = { mission_id: successor.entry.mission_id, wave_id: successor.entry.wave_id };
      requireTrue(!same(successor.ref, plan.ref) && grant.affected_artifacts.includes(successor.ref.relative_path) &&
        at(successor.payload.created_at) <= time && at(successor.payload.valid_until) > time &&
        !before.manifest.artifacts.some(item => item.mission_id === nextScope.mission_id && item.wave_id === nextScope.wave_id &&
          ["mission-wave-terminations", "mission-wave-closeouts"].includes(item.kind)), "CAMPAIGN_TERMINAL_SUCCESSOR_INVALID");
      const preflight = verifiedPreflight(before, successor);
      requireTrue(preflight.payload.status === "ready", "CAMPAIGN_TERMINAL_SUCCESSOR_NOT_READY");
      const contexts = before.manifest.artifacts.filter(item => item.kind === "agent-context-packs" &&
        item.mission_id === nextScope.mission_id && item.wave_id === nextScope.wave_id)
        .map(item => reference(before, ref(item), item.kind, "agent-context-pack", nextScope));
      requireTrue(contexts.length === successor.payload.agents.length && successor.payload.agents.every(agent => {
        const packs = contexts.filter(item => item.payload.agent_id === agent.agent_id);
        return packs.length === 1 && packs[0].payload.status === "ready" && same(packs[0].payload.plan_ref, successor.ref) &&
          same(packs[0].payload.routing_preflight_ref, preflight.ref);
      }), "CAMPAIGN_TERMINAL_SUCCESSOR_CONTEXT_MISMATCH");
      for (const context of contexts) verifyOrderContextHistory(before, successor, context);
    }
  }
  requireTrue(dispatchSettled(dispatch(before, scope)), "CAMPAIGN_TERMINAL_PREMATURE_WAVE_TERMINATION");
}

function verifyOrderContextHistory(store, plan, context) {
  const before = prefixBeforeEntry(store, context.entry);
  require("./order-adoption-controller").assertContextAssignment(context.payload, plan.payload, {
    repository: store.verification.repository.root, artifactRoot: store.artifactRoot, now: context.entry.created_at
  }, before);
}

function verifyReport(store, plan, report) {
  const value = report.payload;
  const scope = { mission_id: value.mission_id, wave_id: value.wave_id };
  reference(store, plan.ref, "mission-wave-plans", "mission-wave-plan", scope);
  const preflight = verifiedPreflight(store, plan);
  requireTrue(same(value.plan_ref, plan.ref) && same(value.routing_preflight_ref, preflight.ref) && preflight.payload.status === "ready" &&
    value.agent_results.length === plan.payload.agents.length && plan.payload.agents.every(agent =>
      value.agent_results.filter(result => result.agent_id === agent.agent_id).length === 1) &&
    at(value.recorded_at) >= at(plan.payload.created_at) && at(value.recorded_at) <= at(plan.payload.valid_until),
  "CAMPAIGN_TERMINAL_REPORT_BINDING_INVALID");
  const controls = new Map();
  for (const agent of value.agent_results) {
    const context = reference(store, agent.context_pack_ref, "agent-context-packs", "agent-context-pack", scope);
    requireTrue(context.payload.agent_id === agent.agent_id && context.payload.status === "ready" &&
      same(context.payload.plan_ref, plan.ref) && same(context.payload.routing_preflight_ref, preflight.ref), "CAMPAIGN_TERMINAL_CONTEXT_MISMATCH");
    verifyOrderContextHistory(store, plan, context);
    for (const evidenceRef of agent.evidence_refs) {
      const entry = store.manifest.artifacts.find(item => same(ref(item), evidenceRef));
      requireTrue(entry && entry.mission_id === scope.mission_id && entry.wave_id === scope.wave_id &&
        !WAVE_KINDS.has(entry.kind) && !require("./skill-mission-controller").CONTROL_EVIDENCE_KINDS.has(entry.kind) &&
        at(entry.created_at) >= at(plan.payload.created_at) && at(entry.created_at) <= at(value.recorded_at) + 300000,
      "CAMPAIGN_TERMINAL_WORK_EVIDENCE_INVALID");
    }
    if (agent.status !== "complete") continue;
    requireTrue(context.payload.required_controls?.length > 0, "CAMPAIGN_TERMINAL_CONTROL_RECEIPTS_REQUIRED");
    for (const control of context.payload.required_controls) {
      const expected = controls.get(control.command_sha256) || { control, bindings: [] };
      requireTrue(same(expected.control, control), "CAMPAIGN_TERMINAL_CONTROL_DESCRIPTOR_CONFLICT");
      expected.bindings.push({ agent_id: agent.agent_id, context_pack_ref: context.ref });
      controls.set(control.command_sha256, expected);
    }
  }
  const receipts = (value.control_receipt_refs || []).map(item => reference(store, item, "control-execution-receipts", "control-execution-receipt", scope));
  requireTrue(receipts.length === controls.size, "CAMPAIGN_TERMINAL_CONTROL_RECEIPTS_REQUIRED");
  for (const { control, bindings } of controls.values()) {
    bindings.sort((left, right) => left.agent_id.localeCompare(right.agent_id));
    const matches = receipts.filter(item => same(item.payload.control, control));
    requireTrue(matches.length === 1 && matches[0].payload.status === "passed" && matches[0].payload.report_id === value.id &&
      matches[0].payload.report_input_sha256 === require("./skill-mission-controller").reportInputDigest(value) &&
      same(matches[0].payload.agent_bindings, bindings) &&
      matches[0].payload.repository_identity_fingerprint === store.verification.repository.identity_fingerprint,
    "CAMPAIGN_TERMINAL_CONTROL_RECEIPT_BINDING_INVALID");
  }
}

function verifyCloseout(store, plan, ending) {
  const value = ending.payload;
  const before = historicalSettlementStore(store, value.artifact_store.manifest_revision, value.artifact_store.manifest_sha256);
  const published = prefixBeforeEntry(store, ending.entry);
  requireTrue(before.manifest.manifest_revision <= published.manifest.manifest_revision &&
    same(value.plan_ref, plan.ref) && at(value.closed_at) === at(ending.entry.created_at), "CAMPAIGN_TERMINAL_CLOSEOUT_BINDING_INVALID");
  const scope = { mission_id: value.mission_id, wave_id: value.wave_id };
  const report = reference(before, value.report_ref, "mission-wave-reports", "mission-wave-report", scope);
  const reportPrefix = prefixBeforeEntry(before, report.entry);
  verifyReport(reportPrefix, plan, report);
  const aar = reference(before, value.aar_ref, "aars", "aar", scope);
  const readiness = reference(before, value.readiness_update_ref, "aar-readiness-updates", "aar-readiness-update", scope);
  requireTrue(same(readiness.payload, buildUpdate(aar.payload, { generatedAt: value.closed_at })) &&
    at(value.closed_at) >= at(report.payload.recorded_at) && at(value.closed_at) <= at(plan.payload.valid_until),
  "CAMPAIGN_TERMINAL_CLOSEOUT_DERIVATION_MISMATCH");
  [plan, report, aar, readiness].forEach(item => assertPrecedes(item, value.closed_at));
  if (plan.payload.adaptive_work.enabled) {
    const campaign = reference(before, value.campaign_ref, "self-improvement-campaigns", "self-improvement-campaign", { mission_id: scope.mission_id });
    requireTrue(campaign.payload.id === plan.payload.adaptive_work.campaign_id, "CAMPAIGN_TERMINAL_CLOSEOUT_CAMPAIGN_MISMATCH");
  } else requireTrue(same(value.campaign_ref, NONE), "CAMPAIGN_TERMINAL_CLOSEOUT_CAMPAIGN_MISMATCH");
  const derived = require("./skill-mission-controller").waveCloseoutDisposition(aar.payload, report.payload, readiness.payload, value.campaign_ref);
  requireTrue(same(value.improvement_actions, derived.actions) && value.status === derived.status &&
    value.next_wave.required === derived.nextWaveRequired && value.next_wave.trigger === derived.trigger,
  "CAMPAIGN_TERMINAL_CLOSEOUT_DERIVATION_MISMATCH");
  // Terminal settlement does not turn blocked work into successful work.
  const completedDispatch = dispatch(published, scope);
  if (plan.payload.dispatch_control?.required) for (const agent of report.payload.agent_results) {
    const leases = completedDispatch.leases.filter(item => item.agent_id === agent.agent_id);
    requireTrue(leases.length > 0 && (agent.status !== "complete" ||
      leases.every(item => item.reconciled_failed_effects === 0 && item.unresolved_tool_effects === 0) &&
      leases.filter(item => item.status !== "superseded").length === 1 && leases.some(item => item.status === "completed")),
    "CAMPAIGN_TERMINAL_CLOSEOUT_DISPATCH_MISMATCH");
  }
}

function appraise(store, request, evaluatedAt) {
  valid(request, "campaign-terminal-request");
  const campaign = reference(store, request.campaign_ref, "self-improvement-campaigns", "self-improvement-campaign", request);
  const stops = missionStopRecords(store, request.mission_id);
  requireTrue(stops.some(item => same(item.ref, request.stop_ref) && same(item.record.request.campaign_ref, campaign.ref)), "CAMPAIGN_TERMINAL_EXACT_STOP_REQUIRED");
  const entries = store.manifest.artifacts.filter(item => item.mission_id === request.mission_id && item.kind !== KIND);
  requireTrue(entries.every(item => at(item.created_at) <= at(evaluatedAt)), "CAMPAIGN_TERMINAL_TIME_PRECEDES_HISTORY");
  const waveIds = [...new Set(entries.filter(item => WAVE_KINDS.has(item.kind)).map(item => item.wave_id))].sort();
  const waves = waveIds.map(wave_id => {
    const scope = { mission_id: request.mission_id, wave_id };
    const plan = one(store, scope, "mission-wave-plans", "mission-wave-plan");
    const endings = entries.filter(item => item.wave_id === wave_id && ["mission-wave-closeouts", "mission-wave-terminations"].includes(item.kind));
    requireTrue(endings.length === 1, `CAMPAIGN_TERMINAL_WAVE_NOT_DISPOSED:${wave_id}`);
    const entry = endings[0];
    const ending = reference(store, ref(entry), entry.kind, entry.kind === "mission-wave-terminations" ? "mission-wave-termination" : "mission-wave-closeout", scope);
    if (entry.kind === "mission-wave-terminations") verifyTermination(store, plan, ending);
    else verifyCloseout(store, plan, ending);
    return { wave_id, plan_ref: plan.ref, disposition_ref: ending.ref, status: ending.payload.status };
  });
  // Do not drop orphan admissions/checkpoints or gateway obligations just because
  // a lease-filtered status table has no row for them.
  for (const entry of entries.filter(item => ["tool-admission-events", "agent-execution-checkpoints", "tool-gateway-requests"].includes(item.kind))) {
    const type = { "tool-admission-events": "tool-admission-event", "agent-execution-checkpoints": "agent-execution-checkpoint", "tool-gateway-requests": "tool-gateway-request" }[entry.kind];
    const item = reference(store, ref(entry), entry.kind, type).payload;
    const lease = reference(store, item.lease_ref, "agent-dispatch-leases", "agent-dispatch-lease", item).payload;
    const session = item.session_binding || { session_id: item.authenticated_principal?.session_id,
      provider_agent_id: item.authenticated_principal?.provider_agent_id };
    requireTrue(item.agent_id === lease.agent_id && item.provider === lease.provider && same(session, lease.session_binding),
      "CAMPAIGN_TERMINAL_DISPATCH_IDENTITY_MISMATCH");
  }
  const histories = entries.filter(item => item.kind === "agent-dispatch-leases").map(entry =>
    require("./dispatch-runtime-controller").dispatchLeaseHistory({ ...store, repository: store.verification.repository }, ref(entry)));
  for (const history of histories) {
    const lease = history.lease.payload;
    if (!same(lease.previous_lease_ref, NONE)) {
      const parent = reference(store, lease.previous_lease_ref, "agent-dispatch-leases", "agent-dispatch-lease", lease);
      requireTrue(parent.payload.agent_id === lease.agent_id && parent.payload.provider === lease.provider &&
        !same(parent.ref, history.lease.ref) && at(parent.payload.issued_at) <= at(lease.issued_at), "CAMPAIGN_TERMINAL_DISPATCH_LINEAGE_MISMATCH");
    }
    const children = histories.filter(item => same(item.lease.payload.previous_lease_ref, history.lease.ref));
    requireTrue(children.length === (history.latest.payload.lease_status === "superseded" ? 1 : 0), "CAMPAIGN_TERMINAL_DISPATCH_LINEAGE_MISMATCH");
    const consumed = new Set();
    for (const checkpoint of history.checkpoints.filter(item => !same(item.payload.tool_admission_ref, NONE))) {
      const admission = reference(store, checkpoint.payload.tool_admission_ref, "tool-admission-events", "tool-admission-event", lease);
      const previous = reference(store, admission.payload.checkpoint_ref, "agent-execution-checkpoints", "agent-execution-checkpoint", lease);
      requireTrue(same(admission.payload.lease_ref, history.lease.ref) && same(previous.payload.lease_ref, history.lease.ref) &&
        admission.payload.decision === "allow" && previous.payload.sequence < checkpoint.payload.sequence &&
        at(admission.payload.decided_at) <= at(checkpoint.payload.recorded_at) && !consumed.has(admission.entry.relative_path),
      "CAMPAIGN_TERMINAL_COMPLETION_BINDING_MISMATCH");
      consumed.add(admission.entry.relative_path);
    }
  }
  const status = dispatch(store, request);
  requireTrue(dispatchSettled(status), "CAMPAIGN_TERMINAL_DISPATCH_NOT_SETTLED");
  for (const wave of waves) {
    const entry = entries.find(item => same(ref(item), wave.disposition_ref));
    const before = prefixBeforeEntry(store, entry);
    for (const item of entries.filter(item => item.wave_id === wave.wave_id &&
      (AUTHORITY_KINDS.has(item.kind) || item.kind === "tool-admission-events"))) {
      if (item.kind === "tool-admission-events" && reference(store, ref(item), item.kind, "tool-admission-event").payload.decision === "deny") continue;
      requireTrue(before.manifest.artifacts.some(prior => same(ref(prior), ref(item))), "CAMPAIGN_TERMINAL_POST_DISPOSITION_AUTHORITY");
    }
  }
  return { stop_refs: stops.map(item => item.ref), waves, retained_artifact_refs: entries.map(ref) };
}

function payloadFor(store, request, inventory, evaluatedAt) {
  const observed = snapshot(store);
  return { schema_version: "0.1", type: "CampaignTerminalRecord",
    id: `CTR-${inputDigest({ request, observed_manifest: observed }).slice(0, 32)}`,
    mission_id: request.mission_id, campaign_id: request.campaign_ref.artifact_id,
    request, request_sha256: inputDigest(request), observed_manifest: observed, inventory,
    inventory_sha256: inputDigest(inventory), recorded_at: evaluatedAt, status: "known_obligations_settled",
    settlement_complete: true, execution_completion_claimed: false, execution_authorized: false,
    continuation_authorized: false, release_authorized: false };
}
function terminalRecordProof(store, terminalRef) {
  const item = reference(store, terminalRef, KIND, "campaign-terminal-record");
  const { entry, payload: record } = item;
  const before = historicalSettlementStore(store, record.observed_manifest.revision, record.observed_manifest.sha256);
  const published = prefixBeforeEntry(store, entry);
  requireTrue(manifestDigest(published.manifest) === record.observed_manifest.sha256 &&
    at(entry.created_at) === at(record.recorded_at) &&
    same(record, payloadFor(before, record.request, appraise(before, record.request, record.recorded_at), record.recorded_at)),
  "CAMPAIGN_TERMINAL_RECORD_REPLAY_MISMATCH");
  return { record, ref: ref(entry), entry };
}
function records(store, request) {
  return store.manifest.artifacts.filter(item => item.kind === KIND && item.mission_id === request.mission_id)
    .map(entry => terminalRecordProof(store, ref(entry)));
}

function campaignTerminalStatus(request, options = {}) {
  const store = load(options);
  const retained = records(store, request);
  const inventory = appraise(store, request, options.now || new Date().toISOString());
  const current = retained.find(item => same(item.record.request, request) && same(item.record.inventory, inventory));
  requireTrue(load(options).verification.manifest_sha256 === store.verification.manifest_sha256, "CAMPAIGN_TERMINAL_STATUS_CHANGED");
  return { type: "CampaignTerminalStatus", mission_id: request.mission_id,
    status: current ? "known_obligations_settled" : "ready_for_reconciliation", terminal_ref: current?.ref || NONE,
    observed_manifest: snapshot(store), inventory, settlement_complete: Boolean(current), execution_completion_claimed: false,
    execution_authorized: false, continuation_authorized: false, release_authorized: false };
}

function reconcileCampaignTerminal(input, options = {}) {
  const request = JSON.parse(JSON.stringify(input));
  valid(request, "campaign-terminal-request");
  const store = load(options);
  const retained = records(store, request);
  const now = options.now || new Date().toISOString();
  const inventory = appraise(store, request, now);
  const previous = retained.find(item => same(item.record.request, request) && same(item.record.inventory, inventory));
  const record = previous?.record || payloadFor(store, request, inventory, now);
  valid(record, "campaign-terminal-record");
  const written = writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: store.artifactRoot,
    missionId: request.mission_id, waveId: "C0", kind: KIND, artifactId: record.id, payload: record,
    createdAt: record.recorded_at, reuseExisting: true,
    publicationGuard: ({ manifest }) => {
      const current = load(options);
      requireTrue(manifestDigest(manifest) === current.verification.manifest_sha256, "CAMPAIGN_TERMINAL_SNAPSHOT_CHANGED");
      const time = options.now || new Date().toISOString();
      requireTrue(at(time) >= at(now) && at(time) >= at(record.recorded_at), "CAMPAIGN_TERMINAL_CLOCK_ROLLBACK");
      records(current, request);
      requireTrue(same(appraise(current, request, time), inventory), "CAMPAIGN_TERMINAL_INVENTORY_CHANGED");
      if (!previous) requireTrue(current.verification.manifest_sha256 === record.observed_manifest.sha256, "CAMPAIGN_TERMINAL_SNAPSHOT_CHANGED");
      return true;
    } });
  return { record, record_ref: { artifact_id: record.id, relative_path: written.relative_path, sha256: written.sha256 },
    existing: !written.created, execution_authorized: false, continuation_authorized: false, release_authorized: false };
}

function main(argv = process.argv.slice(2)) {
  try {
    const [action, ...args] = argv;
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      const key = { "--repository": "repository", "--artifact-root": "artifactRoot", "--request": "requestPath" }[args[index]];
      if (!key || !args[index + 1] || args[index + 1].startsWith("--") || options[key]) throw new Error(`Invalid argument: ${args[index]}`);
      options[key] = args[index + 1];
    }
    if (!["reconcile", "status"].includes(action) || !options.requestPath || !options.repository) throw new Error("Expected reconcile or status, --request, and --repository.");
    const request = JSON.parse(fs.readFileSync(options.requestPath, "utf8"));
    const result = action === "reconcile" ? reconcileCampaignTerminal(request, options) : campaignTerminalStatus(request, options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) { console.error(error.message); return 2; }
}
if (require.main === module) process.exitCode = main();
module.exports = { campaignTerminalStatus, reconcileCampaignTerminal, terminalRecordProof,
  appraiseTerminalInventory: appraise, prefixBeforeEntry, main };
