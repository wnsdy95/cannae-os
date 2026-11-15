#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveRepository, manifestDigest, writeRepositoryArtifact } = require("./repository-artifact-store");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { prefixBeforeEntry } = require("./campaign-terminal-controller");
const { loadSettlementArtifact } = require("./effect-settlement-proof");
const { replayDraft, readRequest } = require("./request-order-compiler");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { digest, same } = require("./order-intake-contract");
const { ADOPTION_AUTHORITY, planDraftIssues } = require("./order-adoption-contract");
const { revisionPayload, revisionPlan, planChanges } = require("./order-revision-contract");
const { withinOrderReplay, retainedOrderReplay } = require("./order-replay-context");

const KIND = "order-revision-proposals";
const ref = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
const snapshot = store => ({ revision: store.manifest.manifest_revision, sha256: manifestDigest(store.manifest) });
function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(immutable); Object.freeze(value);
  }
  return value;
}
function replayOnce(store, kind, subject, compute, retained = false) {
  const key = `${retained ? "retained" : store.verification.manifest_sha256}:${kind}:${digest(subject)}`;
  return retainedOrderReplay(store, key, () => immutable(compute()));
}
function requireTrue(value, code) { if (!value) throw new Error(code); }
function valid(payload, type) {
  const result = validatePayload(payload, type);
  requireTrue(result.valid, `ORDER_REVISION_INVALID:${result.issues.map(item => item.code).join(",")}`);
}
function at(value) {
  requireTrue(typeof value === "string" && Number.isFinite(Date.parse(value)), "ORDER_REVISION_TIME_INVALID");
  return Date.parse(value);
}
function now(options) { const value = options.now || new Date().toISOString(); at(value); return value; }
function load(options, known) {
  if (known?.manifestHistory) return known;
  const root = resolveRepository(options.repository).root;
  return loadVerifiedStore(root, options.artifactRoot || path.join(root, ".cannae", "artifacts"));
}
function entries(store, scope, kind) {
  return store.manifest.artifacts.filter(entry => (!kind || entry.kind === kind) &&
    (!scope || entry.mission_id === scope.mission_id && entry.wave_id === scope.wave_id));
}
function read(store, reference, kind, type) {
  const entry = store.manifest.artifacts.find(value => same(ref(value), reference));
  requireTrue(entry && entry.kind === kind, "ORDER_REVISION_REFERENCE_SCOPE_INVALID");
  const key = `${kind}:${type}:${digest(reference)}`;
  const bytes = fs.readFileSync(path.join(store.artifactRoot, entry.relative_path));
  requireTrue(crypto.createHash("sha256").update(bytes).digest("hex") === entry.sha256, "ORDER_REVISION_ARTIFACT_CHANGED");
  return retainedOrderReplay(store, `artifact:${key}`, () => {
    const payload = loadSettlementArtifact(store, reference, kind, type);
    requireTrue(payload.id === entry.artifact_id && payload.mission_id === entry.mission_id &&
      (type === "decision-log" || payload.wave_id === entry.wave_id), "ORDER_REVISION_REFERENCE_SCOPE_INVALID");
    return immutable({ payload, entry, ref: ref(entry) });
  });
}
function fresh(proposal, time) {
  requireTrue(at(proposal.recorded_at) <= at(time) && at(time) < at(proposal.expires_at), "ORDER_REVISION_EXPIRED_OR_FUTURE");
}
function parentProof(store, request) {
  const parent = read(store, request.parent_plan_ref, "mission-wave-plans", "mission-wave-plan");
  read(store, request.parent_adoption_ref, "order-adoption-records", "order-adoption-record");
  const contexts = entries(store, parent.payload, "agent-context-packs").map(ref);
  return replayOnce(store, "parent", [request.parent_plan_ref, request.parent_adoption_ref, request.mission_id, request.wave_id, contexts],
    () => computeParentProof(store, request), true);
}
function computeParentProof(store, request) {
  const parent = read(store, request.parent_plan_ref, "mission-wave-plans", "mission-wave-plan");
  const adopted = require("./order-adoption-controller").recordProof(store, request.parent_adoption_ref);
  requireTrue(parent.payload.schema_version === "0.2" && adopted.payload.status === "adopted" &&
    same(adopted.proposal.payload.request.plan, parent.payload) && parent.payload.mission_id === request.mission_id &&
    parent.payload.wave_id !== request.wave_id, "ORDER_REVISION_PARENT_SCOPE_INVALID");
  const contexts = entries(store, parent.payload, "agent-context-packs");
  requireTrue(contexts.length === parent.payload.agents.length && parent.payload.agents.every(agent =>
    contexts.filter(entry => read(store, ref(entry), "agent-context-packs", "agent-context-pack").payload.agent_id === agent.agent_id).length === 1),
  "ORDER_REVISION_PARENT_NOT_PREPARED");
  for (const entry of contexts) {
    const context = read(store, ref(entry), "agent-context-packs", "agent-context-pack").payload;
    requireTrue(same(context.plan_ref, parent.ref), "ORDER_REVISION_PARENT_CONTEXT_INVALID");
    if (context.schema_version === "0.4") require("./intent-continuity-contract").assertIntentContext(context, parent.payload);
    require("./order-adoption-controller").assertContextAssignment(context, parent.payload,
      { repository: store.verification.repository.root, artifactRoot: store.artifactRoot, now: entry.created_at }, prefixBeforeEntry(store, entry));
  }
  return parent;
}
function assertParentOpen(store, parent) {
  requireTrue(entries(store, parent.payload, "mission-wave-terminations").length === 0 &&
    entries(store, parent.payload, "mission-wave-closeouts").length === 0, "ORDER_REVISION_PARENT_TERMINAL");
}
function appraiseRequest(store, request, time, options) {
  valid(request, "order-revision-request");
  const parent = parentProof(store, request);
  assertParentOpen(store, parent);
  requireTrue(entries(store, request, "mission-wave-plans").length === 0 &&
    entries(store, request, "mission-wave-terminations").length === 0 &&
    entries(store, request, "order-adoption-records").length === 0, "ORDER_REVISION_SUCCESSOR_ALREADY_OPENED");
  if (parent.payload.order_binding.revision_ref) {
    const predecessor = revisionProof(store, parent.payload.order_binding.revision_ref, options);
    requireTrue(same(parent.payload, revisionPlan(predecessor.payload, predecessor.ref)), "ORDER_REVISION_PARENT_SCOPE_INVALID");
    assertSupersession(store, predecessor, parent.payload, options);
  }
  const draftEntry = entries(store, request, "order-drafts").find(entry => same(ref(entry), request.successor_plan.order_binding.draft_ref));
  requireTrue(draftEntry, "ORDER_REVISION_DRAFT_NOT_RETAINED");
  const draft = replayDraft(store, draftEntry);
  requireTrue(parent.payload.mission_profile.classification === draft.classification, "ORDER_REVISION_CLASSIFICATION_CHANGE_UNSUPPORTED");
  const captured = readRequest(store, request.change_request_ref, draft);
  requireTrue(same(request.change_request_ref, draft.request_ref) && captured.wave_id === request.wave_id &&
    at(draft.compiled_at) <= at(time) && at(time) < at(draft.expires_at) && at(request.successor_plan.created_at) <= at(time),
  "ORDER_REVISION_CHANGE_REQUEST_INVALID");
  requireTrue(planDraftIssues(request.successor_plan, draft).length === 0, "ORDER_REVISION_DRAFT_PLAN_MISMATCH");
  return { parent, draft };
}
function revisionProof(store, reference, options) {
  read(store, reference, KIND, "order-revision-proposal");
  return replayOnce(store, "revision", reference, () => computeRevisionProof(store, reference, options), true);
}
function computeRevisionProof(store, reference, options) {
  const item = read(store, reference, KIND, "order-revision-proposal");
  const before = prefixBeforeEntry(store, item.entry);
  requireTrue(same(snapshot(before), item.payload.observed_manifest) && at(item.entry.created_at) === at(item.payload.recorded_at),
    "ORDER_REVISION_HISTORY_INVALID");
  const proof = appraiseRequest(before, item.payload.request, item.payload.recorded_at, { ...options, now: item.payload.recorded_at });
  requireTrue(same(item.payload, revisionPayload(item.payload.request, proof.parent.payload, proof.draft,
    snapshot(before), item.payload.recorded_at)), "ORDER_REVISION_REPLAY_MISMATCH");
  return { ...item, ...proof };
}

// Selection is derived from actual adoption history, never a caller's ready flag.
function selections(store, parentReference, time, options, includeExpired = false) {
  const selected = [];
  for (const entry of entries(store, null, "order-adoption-records")) {
    const record = read(store, ref(entry), "order-adoption-records", "order-adoption-record");
    if (record.payload.status !== "adopted" || !includeExpired && at(record.payload.expires_at) <= at(time)) continue;
    const proposal = read(store, record.payload.request.proposal_ref, "order-adoption-proposals", "order-adoption-proposal");
    const revisionRef = proposal.payload.request.plan.order_binding.revision_ref;
    if (!revisionRef) continue;
    const revision = read(store, revisionRef, KIND, "order-revision-proposal");
    if (!same(revision.payload.request.parent_plan_ref, parentReference)) continue;
    if (!includeExpired && at(revision.payload.expires_at) <= at(time)) continue;
    requireTrue(at(record.payload.recorded_at) <= at(time), "ORDER_REVISION_SELECTION_FROM_FUTURE");
    require("./order-adoption-controller").recordProof(store, record.ref);
    revisionProof(store, revisionRef, options);
    selected.push({ record, plan: proposal.payload.request.plan, revisionRef });
  }
  return selected;
}
function assertRevisionPreparation(plan, options, knownStore) {
  if (knownStore && !plan.order_binding?.revision_ref && !entries(knownStore, plan, KIND).length) return null;
  const store = load(options, knownStore), scoped = entries(store, plan, KIND), reference = plan.order_binding?.revision_ref;
  if (!reference && scoped.length === 0) return null;
  requireTrue(reference && scoped.length === 1 && same(ref(scoped[0]), reference), "ORDER_REVISION_BINDING_REQUIRED");
  const item = revisionProof(store, reference, options);
  fresh(item.payload, now(options));
  requireTrue(same(plan, revisionPlan(item.payload, reference)), "ORDER_REVISION_PLAN_SUBSTITUTED");
  const selected = selections(store, item.parent.ref, now(options), options);
  requireTrue(selected.length <= 1 && selected.every(value => same(value.plan, plan)), "ORDER_REVISION_COMPETING_SUCCESSOR");
  const terminals = entries(store, item.parent.payload, "mission-wave-terminations");
  if (terminals.length) assertSupersession(store, item, plan, options);
  else requireTrue(entries(store, item.parent.payload, "mission-wave-closeouts").length === 0, "ORDER_REVISION_PARENT_TERMINAL");
  return item;
}
function assertSupersession(store, revision, plan, options) {
  const terminalEntries = entries(store, revision.parent.payload, "mission-wave-terminations");
  requireTrue(terminalEntries.length === 1, "ORDER_REVISION_PREDECESSOR_NOT_SETTLED");
  const terminal = read(store, ref(terminalEntries[0]), "mission-wave-terminations", "mission-wave-termination");
  const before = prefixBeforeEntry(store, terminal.entry);
  const successorEntries = entries(before, plan, "mission-wave-plans");
  requireTrue(successorEntries.length === 1 && same(terminal.payload.plan_ref, revision.parent.ref) &&
    terminal.payload.status === "superseded" && same(terminal.payload.successor_plan_ref, ref(successorEntries[0])) &&
    same(read(before, ref(successorEntries[0]), "mission-wave-plans", "mission-wave-plan").payload, plan) &&
    at(terminal.payload.terminated_at) === at(terminal.entry.created_at) && at(terminal.payload.terminated_at) <= at(now(options)),
  "ORDER_REVISION_SUPERSESSION_MISMATCH");
  require("./campaign-terminal-controller").verifyTermination(store, revision.parent, terminal);
  const value = terminal.payload;
  const decision = read(before, value.decision_ref, "decision-logs", "decision-log");
  const beforeDecision = prefixBeforeEntry(before, decision.entry);
  requireTrue(at(decision.payload.decided_at) >= at(plan.created_at) &&
    beforeDecision.manifest.artifacts.some(entry => same(ref(entry), value.successor_plan_ref)),
    "ORDER_REVISION_TERMINATION_DECISION_PRECEDES_SUBJECT");
  const executionKinds = ["dispatch-tool-policies", "agent-dispatch-leases", "tool-admission-events", "tool-gateway-requests"];
  requireTrue(!entries(before, plan).some(entry => executionKinds.includes(entry.kind)), "ORDER_REVISION_SUCCESSOR_EXECUTED_EARLY");
  const status = require("./dispatch-runtime-controller").dispatchStatus(options, { missionId: value.mission_id, waveId: value.wave_id });
  requireTrue(status.unresolved_issuances.length === 0 && status.unresolved_gateway_obligations.length === 0 && status.leases.every(lease =>
    ["completed", "revoked", "superseded"].includes(lease.status) && lease.pending_tool_requests === 0 &&
    lease.unresolved_tool_effects === 0 && lease.unresolved_gateway_transactions === 0 && !lease.failed_effect_revocation_required),
  "ORDER_REVISION_PREDECESSOR_NOT_SETTLED");
  return terminal;
}
function assertRevisionDispatch(plan, options, knownStore) {
  if (knownStore && !plan.order_binding?.revision_ref && !entries(knownStore, null, KIND).length) return;
  const store = load(options, knownStore);
  const plans = entries(store, plan, "mission-wave-plans");
  if (plans.length === 1 && selections(store, ref(plans[0]), now(options), options, true).length) {
    throw new Error("ORDER_REVISION_PARENT_REPLACED");
  }
  const incoming = assertRevisionPreparation(plan, options, store);
  if (incoming) assertSupersession(store, incoming, plan, options);
}
function assertRevisionSupersession(request, options, knownStore) {
  if (request.status !== "superseded") return;
  if (knownStore && !entries(knownStore, null, KIND).length) return;
  const store = load(options, knownStore);
  const selected = selections(store, request.plan_ref, now(options), options);
  const successor = read(store, request.successor_plan_ref, "mission-wave-plans", "mission-wave-plan");
  if (selected.length || successor.payload.order_binding?.revision_ref || entries(store, successor.payload, KIND).length) {
    requireTrue(selected.length === 1 && same(selected[0].plan, successor.payload), "ORDER_REVISION_SUCCESSOR_MISMATCH");
    const incoming = assertRevisionPreparation(successor.payload, options, store);
    requireTrue(incoming && same(incoming.parent.ref, request.plan_ref), "ORDER_REVISION_PARENT_SCOPE_INVALID");
    require("./order-adoption-controller").orderForPlan(successor.payload, options, store);
  }
}
function proposeRevision(input, options) {
  const request = JSON.parse(JSON.stringify(input)), store = load(options), time = now(options);
  valid(request, "order-revision-request");
  const id = `ORP-${digest(request).slice(0, 32)}`;
  const scoped = entries(store, request, KIND);
  if (scoped.length) {
    requireTrue(scoped.length === 1 && scoped[0].artifact_id === id, "ORDER_REVISION_WAVE_ALREADY_PROPOSED");
    const retained = revisionProof(store, ref(scoped[0]), options);
    fresh(retained.payload, time);
    const plan = revisionPlan(retained.payload, retained.ref);
    return { proposal: retained.payload, proposal_ref: retained.ref, successor_plan: plan, effective_changes: planChanges(retained.parent.payload, plan),
      existing: true, ...ADOPTION_AUTHORITY };
  }
  const proof = appraiseRequest(store, request, time, options);
  requireTrue(selections(store, proof.parent.ref, time, options).length === 0, "ORDER_REVISION_COMPETING_SUCCESSOR");
  const proposal = revisionPayload(request, proof.parent.payload, proof.draft, snapshot(store), time);
  valid(proposal, "order-revision-proposal");
  const written = writeRepositoryArtifact({ repositoryPath: store.verification.repository.root, artifactRoot: store.artifactRoot,
    missionId: request.mission_id, waveId: request.wave_id, kind: KIND, artifactId: id, payload: proposal, createdAt: time,
    reuseExisting: true, publicationGuard: ({ manifest }) => withinOrderReplay(() => {
      const current = load(options), clock = now(options);
      requireTrue(at(clock) >= at(time) && manifestDigest(manifest) === store.verification.manifest_sha256 &&
        current.verification.manifest_sha256 === store.verification.manifest_sha256, "ORDER_REVISION_PUBLICATION_CHANGED");
      fresh(proposal, clock); appraiseRequest(current, request, clock, options);
      requireTrue(selections(current, proof.parent.ref, clock, options).length === 0, "ORDER_REVISION_COMPETING_SUCCESSOR");
      return true;
    }, true) });
  const reference = { artifact_id: id, relative_path: written.relative_path, sha256: written.sha256 };
  const plan = revisionPlan(proposal, reference);
  return { proposal, proposal_ref: reference, successor_plan: plan, effective_changes: planChanges(proof.parent.payload, plan),
    existing: false, ...ADOPTION_AUTHORITY };
}
function inspectRevision(options) {
  const store = load(options), found = entries(store, null, KIND).filter(entry => entry.artifact_id === options.proposalId);
  requireTrue(found.length === 1, "ORDER_REVISION_PROPOSAL_NOT_FOUND");
  const item = revisionProof(store, ref(found[0]), options), time = now(options);
  requireTrue(at(time) >= at(item.payload.recorded_at), "ORDER_REVISION_EXPIRED_OR_FUTURE");
  const plan = revisionPlan(item.payload, item.ref);
  let eligible = false, blockingCode = "ORDER_REVISION_ADOPTION_REQUIRED";
  try {
    require("./order-adoption-controller").orderForPlan(plan, options, store);
    assertRevisionDispatch(plan, options, store); eligible = true; blockingCode = "none";
  } catch (error) { blockingCode = error.message; }
  return { proposal: item.payload, proposal_ref: item.ref, successor_plan: plan, effective_changes: planChanges(item.parent.payload, plan),
    freshness: at(time) < at(item.payload.expires_at) ? "current" : "expired", revision_prerequisites_satisfied: eligible,
    blocking_code: blockingCode, ...ADOPTION_AUTHORITY };
}
function main(argv = process.argv.slice(2)) {
  const [action, ...rest] = argv, options = {};
  requireTrue(["propose", "inspect"].includes(action), "Usage: order-revision-controller.js <propose|inspect> --repository <repo> [options]");
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index], value = rest[index + 1];
    requireTrue(["--repository", "--artifact-root", "--input", "--proposal-id"].includes(flag) && value && !value.startsWith("--"),
      "ORDER_REVISION_CLI_OPTION_INVALID");
    const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    requireTrue(options[key] === undefined, "ORDER_REVISION_CLI_DUPLICATE_OPTION"); options[key] = value;
  }
  requireTrue(options.repository && (action === "propose" ? options.input && !options.proposalId : options.proposalId && !options.input),
    "ORDER_REVISION_CLI_INPUT_REQUIRED");
  const result = action === "propose" ? proposeRevision(JSON.parse(fs.readFileSync(options.input, "utf8")), options) : inspectRevision(options);
  console.log(JSON.stringify(result, null, 2));
}
const scoped = fn => (...args) => withinOrderReplay(() => fn(...args));
module.exports = { proposeRevision: scoped(proposeRevision), inspectRevision: scoped(inspectRevision),
  revisionProof: scoped(revisionProof), assertRevisionPreparation: scoped(assertRevisionPreparation),
  assertRevisionDispatch: scoped(assertRevisionDispatch), assertRevisionSupersession: scoped(assertRevisionSupersession) };
if (require.main === module) { try { withinOrderReplay(() => main()); } catch (error) { console.error(error.message); process.exitCode = 1; } }
