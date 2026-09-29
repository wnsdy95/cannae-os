#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { resolveRepository, manifestDigest, writeRepositoryArtifact } = require("./repository-artifact-store");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { loadSettlementArtifact } = require("./effect-settlement-proof");
const { prefixBeforeEntry } = require("./campaign-terminal-controller");
const { replayDraft, readRequest } = require("./request-order-compiler");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { digest, same } = require("./order-intake-contract");
const { NONE, ADOPTION_AUTHORITY, decisionOption, proposalPayload, recordPayload, assignedTask,
  planDraftIssues, backbriefIssues } = require("./order-adoption-contract");

const PROPOSALS = "order-adoption-proposals", RECORDS = "order-adoption-records";
const BRIEFS = "order-backbriefs", REHEARSALS = "order-rehearsals";
const clone = value => JSON.parse(JSON.stringify(value));
const ref = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
function requireTrue(value, code) { if (!value) throw new Error(code); }
function valid(payload, type) {
  const result = validatePayload(payload, type);
  requireTrue(result.valid, `ORDER_ADOPTION_INVALID:${type}:${result.issues.map(item => item.code).join(",")}`);
}
function at(value) {
  requireTrue(typeof value === "string" && Number.isFinite(Date.parse(value)), "ORDER_ADOPTION_TIME_INVALID");
  return Date.parse(value);
}
function clock(options) { const now = options.now || new Date().toISOString(); at(now); return now; }
function load(options) {
  const repository = resolveRepository(options.repository);
  return loadVerifiedStore(repository.root, options.artifactRoot || path.join(repository.root, ".cannae", "artifacts"));
}
function snapshot(store) { return { revision: store.manifest.manifest_revision, sha256: manifestDigest(store.manifest) }; }
function entries(store, scope, kind) {
  return store.manifest.artifacts.filter(item => (!kind || item.kind === kind) && item.mission_id === scope.mission_id && item.wave_id === scope.wave_id);
}
function find(store, kind, id) {
  const matches = store.manifest.artifacts.filter(item => item.kind === kind && item.artifact_id === id);
  requireTrue(matches.length <= 1, "ORDER_ADOPTION_ID_AMBIGUOUS");
  return matches[0];
}
function read(store, reference, kind, type, scope) {
  const payload = loadSettlementArtifact(store, reference, kind, type, scope);
  const entry = store.manifest.artifacts.find(item => same(ref(item), reference));
  requireTrue(entry && payload.id === entry.artifact_id && payload.mission_id === entry.mission_id &&
    (type === "decision-log" || payload.wave_id === entry.wave_id) &&
    (!scope || (scope.mission_id === entry.mission_id && scope.wave_id === entry.wave_id)), "ORDER_ADOPTION_REFERENCE_SCOPE_MISMATCH");
  return { payload, entry, ref: ref(entry) };
}
function draftProof(store, reference) {
  const entry = store.manifest.artifacts.find(item => item.kind === "order-drafts" && same(ref(item), reference));
  requireTrue(entry, "ORDER_ADOPTION_DRAFT_NOT_RETAINED");
  return replayDraft(store, entry);
}
function noOpenedWave(store, scope) {
  requireTrue(entries(store, scope, "mission-wave-plans").length === 0 && entries(store, scope, "mission-wave-terminations").length === 0,
    "ORDER_ADOPTION_WAVE_ALREADY_OPENED");
}
function fresh(proposal, now) {
  requireTrue(at(proposal.recorded_at) <= at(now) && at(now) < at(proposal.expires_at), "ORDER_ADOPTION_EXPIRED_OR_FUTURE");
}
function appraiseProposal(store, request, now) {
  valid(request, "order-adoption-proposal-request");
  const draft = draftProof(store, request.plan.order_binding.draft_ref);
  requireTrue(at(draft.compiled_at) <= at(now) && at(now) < at(draft.expires_at) && at(request.plan.created_at) <= at(now),
    "ORDER_ADOPTION_DRAFT_EXPIRED_OR_FUTURE");
  const issues = planDraftIssues(request.plan, draft);
  requireTrue(issues.length === 0, issues.map(item => item.code).join(","));
  noOpenedWave(store, request);
  requireTrue(!entries(store, request, RECORDS).some(entry => read(store, ref(entry), RECORDS, "order-adoption-record", request).payload.status === "adopted"),
    "ORDER_ADOPTION_WAVE_ALREADY_ADOPTED");
  return draft;
}
function proposalProof(store, reference, scope) {
  const item = read(store, reference, PROPOSALS, "order-adoption-proposal", scope);
  const before = prefixBeforeEntry(store, item.entry);
  requireTrue(same(snapshot(before), item.payload.observed_manifest) && at(item.entry.created_at) === at(item.payload.recorded_at),
    "ORDER_ADOPTION_PROPOSAL_HISTORY_INVALID");
  const draft = appraiseProposal(before, item.payload.request, item.payload.recorded_at);
  requireTrue(same(item.payload, proposalPayload(item.payload.request, draft, snapshot(before), item.payload.recorded_at)),
    "ORDER_ADOPTION_PROPOSAL_REPLAY_MISMATCH");
  return { ...item, draft };
}
function appraiseBrief(store, brief, now) {
  valid(brief, "order-backbrief");
  const proposal = proposalProof(store, brief.proposal_ref, brief);
  fresh(proposal.payload, now);
  const issues = backbriefIssues(brief, proposal.payload, proposal.draft);
  requireTrue(issues.length === 0, issues.map(item => item.code).join(","));
  requireTrue(at(brief.backbrief.created_at) >= at(proposal.payload.recorded_at) && at(brief.backbrief.created_at) <= at(now),
    "ORDER_BACKBRIEF_TIME_INVALID");
  return proposal;
}
function briefProof(store, reference, proposal) {
  const item = read(store, reference, BRIEFS, "order-backbrief", proposal.payload);
  requireTrue(same(item.payload.proposal_ref, proposal.ref), "ORDER_BACKBRIEF_PROPOSAL_MISMATCH");
  appraiseBrief(prefixBeforeEntry(store, item.entry), item.payload, item.entry.created_at);
  return item;
}
function appraiseRehearsal(store, value, now) {
  valid(value, "order-rehearsal");
  const proposal = proposalProof(store, value.proposal_ref, value);
  fresh(proposal.payload, now);
  const plan = proposal.payload.request.plan;
  const briefs = value.backbrief_refs.map(reference => briefProof(store, reference, proposal));
  const ids = briefs.map(item => item.payload.agent_id);
  const expected = plan.agents.map(agent => agent.agent_id);
  requireTrue(ids.length === expected.length && new Set(ids).size === expected.length && expected.every(id => ids.includes(id)) &&
    value.agent_sequence.length === expected.length && new Set(value.agent_sequence).size === expected.length &&
    expected.every(id => value.agent_sequence.includes(id)), "ORDER_REHEARSAL_AGENT_SET_MISMATCH");
  const rehearsal = value.rehearsal;
  const briefIds = briefs.map(item => item.payload.backbrief.id).sort();
  requireTrue(new Set(briefIds).size === briefIds.length && same([...rehearsal.backbriefs].sort(), briefIds) &&
    rehearsal.parent_order === proposal.payload.id && rehearsal.mission_id === value.mission_id &&
    rehearsal.classification === proposal.payload.classification && rehearsal.disposition === "execute" && rehearsal.required_changes.length === 0 &&
    rehearsal.sequence.length === expected.length && rehearsal.facilitator === "COS", "ORDER_REHEARSAL_SCOPE_MISMATCH");
  requireTrue(rehearsal.friction_points.every(item => !["high", "critical"].includes(item.severity) && item.mitigation.trim()),
    "ORDER_REHEARSAL_RETAINED_RISK_UNRESOLVED");
  for (const [index, agentId] of value.agent_sequence.entries()) {
    const agent = plan.agents.find(item => item.agent_id === agentId);
    const task = assignedTask(plan, proposal.draft, agentId);
    const step = rehearsal.sequence[index];
    requireTrue(step.step === index + 1 && step.actor === agent.operational_role && step.action === task.task &&
      step.expected_result === task.deliverables.join("\n") &&
      task.verification.every(item => step.evidence_required.includes(item)), "ORDER_REHEARSAL_TASK_MISMATCH");
  }
  requireTrue(at(rehearsal.created_at) >= at(proposal.payload.recorded_at) && at(rehearsal.created_at) <= at(now) &&
    briefs.every(item => at(item.entry.created_at) <= at(rehearsal.created_at)), "ORDER_REHEARSAL_TIME_INVALID");
  return { proposal, briefs };
}
function rehearsalProof(store, reference, proposal) {
  const item = read(store, reference, REHEARSALS, "order-rehearsal", proposal.payload);
  requireTrue(same(item.payload.proposal_ref, proposal.ref), "ORDER_REHEARSAL_PROPOSAL_MISMATCH");
  appraiseRehearsal(prefixBeforeEntry(store, item.entry), item.payload, item.entry.created_at);
  return item;
}
function assertDecisionCurrent(store, proposal, decision) {
  const before = prefixBeforeEntry(store, decision.entry);
  for (const entry of entries(store, proposal.payload, "decision-logs")) {
    if (same(ref(entry), decision.ref)) continue;
    const other = read(store, ref(entry), "decision-logs", "decision-log").payload;
    if (other.decision_maker === "USER" && other.decision_type === "scope" && other.status === "complete" &&
        (other.authority_basis.reference === proposal.payload.id || other.affected_artifacts.includes(proposal.ref.relative_path)) &&
        (!before.manifest.artifacts.some(prior => same(ref(prior), ref(entry))) || at(other.decided_at) >= at(decision.payload.decided_at))) {
      throw new Error("ORDER_ADOPTION_CONFLICTING_USER_DECISION");
    }
  }
}
function appraiseDecision(store, request, now) {
  valid(request, "order-adoption-decision-request");
  const proposal = proposalProof(store, request.proposal_ref, request);
  fresh(proposal.payload, now);
  noOpenedWave(store, request);
  const briefs = request.backbrief_refs.map(reference => briefProof(store, reference, proposal));
  const rehearsal = same(request.rehearsal_ref, NONE) ? null : rehearsalProof(store, request.rehearsal_ref, proposal);
  if (request.disposition === "approve") {
    requireTrue(rehearsal && same(rehearsal.payload.backbrief_refs, request.backbrief_refs), "ORDER_ADOPTION_REHEARSAL_REQUIRED");
    appraiseRehearsal(store, rehearsal.payload, now);
  }
  const decision = read(store, request.decision_ref, "decision-logs", "decision-log");
  const value = decision.payload;
  const affected = [proposal.ref, ...request.backbrief_refs, ...(rehearsal ? [rehearsal.ref] : [])];
  requireTrue(value.mission_id === request.mission_id && decision.entry.wave_id === request.wave_id && value.decision_maker === "USER" &&
    value.decision_type === "scope" && value.status === "complete" && value.authority_basis.basis_type === "retained_authority" &&
    value.authority_basis.reference === proposal.payload.id && value.chosen_option === decisionOption(request) &&
    value.options_considered.includes(value.chosen_option) && same([...value.affected_artifacts].sort(), affected.map(item => item.relative_path).sort()) &&
    at(value.decided_at) >= at(proposal.payload.recorded_at) && at(value.decided_at) <= at(now) && at(now) - at(value.decided_at) < 3600000 &&
    at(decision.entry.created_at) >= at(value.decided_at) && at(decision.entry.created_at) <= at(now), "ORDER_ADOPTION_USER_DECISION_REQUIRED");
  const beforeDecision = prefixBeforeEntry(store, decision.entry);
  requireTrue(affected.every(reference => beforeDecision.manifest.artifacts.some(entry => same(ref(entry), reference) &&
    at(entry.created_at) <= at(value.decided_at))), "ORDER_ADOPTION_DECISION_PRECEDES_SUBJECT");
  assertDecisionCurrent(store, proposal, decision);
  for (const entry of store.manifest.artifacts.filter(item => item.kind === RECORDS)) {
    const previous = read(store, ref(entry), RECORDS, "order-adoption-record").payload;
    requireTrue(!same(previous.request.decision_ref, request.decision_ref) && !same(previous.request.proposal_ref, request.proposal_ref) &&
      !(previous.status === "adopted" && previous.mission_id === request.mission_id && previous.wave_id === request.wave_id),
      "ORDER_ADOPTION_DECISION_ALREADY_CONSUMED");
  }
  return { proposal, briefs, rehearsal, decision };
}
function recordProof(store, reference) {
  const item = read(store, reference, RECORDS, "order-adoption-record");
  const before = prefixBeforeEntry(store, item.entry);
  requireTrue(same(snapshot(before), item.payload.observed_manifest) && at(item.entry.created_at) === at(item.payload.recorded_at),
    "ORDER_ADOPTION_RECORD_HISTORY_INVALID");
  const appraisal = appraiseDecision(before, item.payload.request, item.payload.recorded_at);
  requireTrue(same(item.payload, recordPayload(item.payload.request, appraisal.proposal.payload, snapshot(before), item.payload.recorded_at)),
    "ORDER_ADOPTION_RECORD_REPLAY_MISMATCH");
  return { ...item, ...appraisal };
}
function publish(options, store, payload, kind, now, appraise) {
  const result = writeRepositoryArtifact({ repositoryPath: store.verification.repository.root, artifactRoot: store.artifactRoot,
    missionId: payload.mission_id, waveId: payload.wave_id, kind, artifactId: payload.id, payload, createdAt: now, reuseExisting: true,
    publicationGuard: ({ manifest }) => {
      const current = load(options), time = clock(options);
      requireTrue(at(time) >= at(now), "ORDER_ADOPTION_CLOCK_ROLLBACK");
      requireTrue(manifestDigest(manifest) === store.verification.manifest_sha256 &&
        current.verification.manifest_sha256 === store.verification.manifest_sha256, "ORDER_ADOPTION_SNAPSHOT_CHANGED");
      appraise(current, time);
      return true;
    } });
  return { artifact_id: payload.id, relative_path: result.relative_path, sha256: result.sha256 };
}
function proposeOrder(input, options) {
  const request = clone(input), store = load(options), now = clock(options);
  valid(request, "order-adoption-proposal-request");
  const existing = find(store, PROPOSALS, `OAP-${digest(request).slice(0, 32)}`);
  if (existing) {
    const retained = proposalProof(store, ref(existing), request);
    fresh(retained.payload, now);
    return { proposal: retained.payload, proposal_ref: retained.ref, existing: true, ...ADOPTION_AUTHORITY };
  }
  const draft = appraiseProposal(store, request, now);
  const proposal = proposalPayload(request, draft, snapshot(store), now);
  valid(proposal, "order-adoption-proposal");
  const reference = publish(options, store, proposal, PROPOSALS, now, (current, time) => {
    fresh(proposal, time); appraiseProposal(current, request, time);
  });
  return { proposal, proposal_ref: reference, existing: false, ...ADOPTION_AUTHORITY };
}
function retainOrderEvidence(input, options, kind) {
  requireTrue([BRIEFS, REHEARSALS].includes(kind), "ORDER_ADOPTION_EVIDENCE_KIND_INVALID");
  const payload = clone(input), store = load(options), now = clock(options);
  const appraise = kind === BRIEFS ? appraiseBrief : appraiseRehearsal;
  appraise(store, payload, now);
  const existing = find(store, kind, payload.id);
  if (existing) {
    const proposal = proposalProof(store, payload.proposal_ref, payload);
    const retained = kind === BRIEFS ? briefProof(store, ref(existing), proposal) : rehearsalProof(store, ref(existing), proposal);
    requireTrue(same(retained.payload, payload) && at(existing.created_at) <= at(now), "ORDER_ADOPTION_EVIDENCE_ID_CONFLICT");
    return { artifact_ref: retained.ref, existing: true, ...ADOPTION_AUTHORITY };
  }
  const reference = publish(options, store, payload, kind, now, (current, time) => appraise(current, payload, time));
  return { artifact_ref: reference, existing: false, ...ADOPTION_AUTHORITY };
}
function decideOrder(input, options) {
  const request = clone(input), store = load(options), now = clock(options);
  valid(request, "order-adoption-decision-request");
  const existing = find(store, RECORDS, `OAR-${digest(request).slice(0, 32)}`);
  if (existing) {
    const retained = recordProof(store, ref(existing));
    requireTrue(at(retained.payload.recorded_at) <= at(now), "ORDER_ADOPTION_RECORD_FROM_FUTURE");
    return { record: retained.payload, record_ref: retained.ref, existing: true,
      freshness: at(now) < at(retained.payload.expires_at) ? "current" : "expired", ...ADOPTION_AUTHORITY };
  }
  const appraisal = appraiseDecision(store, request, now);
  const record = recordPayload(request, appraisal.proposal.payload, snapshot(store), now);
  valid(record, "order-adoption-record");
  const reference = publish(options, store, record, RECORDS, now, (current, time) => appraiseDecision(current, request, time));
  return { record, record_ref: reference, existing: false, freshness: "current", ...ADOPTION_AUTHORITY };
}
function orderForPlan(plan, options, knownStore) {
  const manifest = knownStore && knownStore.manifest;
  const scoped = (manifest && manifest.artifacts || []).filter(item => item.mission_id === plan.mission_id && item.wave_id === plan.wave_id);
  if (knownStore && plan.schema_version === "0.1" && !scoped.some(item => ["mission-requests", PROPOSALS, RECORDS].includes(item.kind))) return null;
  const store = knownStore?.manifestHistory ? knownStore : load(options);
  const intake = entries(store, plan).some(item => ["mission-requests", PROPOSALS, RECORDS].includes(item.kind));
  if (!intake && plan.schema_version === "0.1") return null;
  requireTrue(plan.schema_version === "0.2", "ORDER_ADOPTION_DOWNGRADE_PROHIBITED");
  const records = entries(store, plan, RECORDS).map(entry => recordProof(store, ref(entry))).filter(item => item.payload.status === "adopted");
  requireTrue(records.length === 1, "ORDER_ADOPTION_REQUIRED");
  const record = records[0], now = clock(options);
  fresh(record.payload, now);
  assertDecisionCurrent(store, record.proposal, record.decision);
  requireTrue(same(record.proposal.payload.request.plan, plan) && record.payload.plan_sha256 === digest(plan), "ORDER_ADOPTION_PLAN_SUBSTITUTED");
  return record;
}
function contextAssignment(adopted, agentId) {
  const plan = adopted.proposal.payload.request.plan;
  const draft = adopted.proposal.draft;
  const brief = adopted.briefs.find(item => item.payload.agent_id === agentId);
  requireTrue(brief, "ORDER_ADOPTION_AGENT_MISSING");
  return { adoption_ref: adopted.ref, proposal_ref: adopted.proposal.ref, draft_ref: plan.order_binding.draft_ref,
    backbrief_ref: brief.ref, rehearsal_ref: adopted.rehearsal.ref, plan_sha256: adopted.payload.plan_sha256,
    task_order: assignedTask(plan, draft, agentId), commander_intent: draft.opord.intent,
    mission_end_state: plan.success_conditions, constraints: plan.constraints, assessment: draft.opord.assessment };
}
function assertContextAssignment(context, plan, options, knownStore) {
  const adopted = orderForPlan(plan, options, knownStore);
  if (!adopted) {
    requireTrue(context.schema_version === "0.2" && !context.order_assignment, "ORDER_CONTEXT_LEGACY_MISMATCH");
    return;
  }
  requireTrue(context.schema_version === "0.3" && same(context.order_assignment, contextAssignment(adopted, context.agent_id)),
    "ORDER_CONTEXT_ASSIGNMENT_MISMATCH");
  requireTrue(at(context.created_at) >= at(adopted.payload.recorded_at) && at(context.created_at) <= at(clock(options)) &&
    at(context.created_at) < at(context.valid_until) && at(context.valid_until) === at(adopted.payload.expires_at),
    "ORDER_CONTEXT_VALIDITY_MISMATCH");
}
function inspectOrder(options) {
  const store = load(options), now = clock(options), entry = find(store, PROPOSALS, options.proposalId);
  requireTrue(entry, "ORDER_ADOPTION_PROPOSAL_NOT_FOUND");
  const proposal = proposalProof(store, ref(entry));
  requireTrue(at(proposal.payload.recorded_at) <= at(now), "ORDER_ADOPTION_PROPOSAL_FROM_FUTURE");
  const records = entries(store, proposal.payload, RECORDS).map(item => recordProof(store, ref(item)))
    .filter(item => same(item.payload.request.proposal_ref, proposal.ref));
  requireTrue(records.length <= 1, "ORDER_ADOPTION_RECORD_CONFLICT");
  requireTrue(records.every(item => at(item.payload.recorded_at) <= at(now)), "ORDER_ADOPTION_RECORD_FROM_FUTURE");
  return { proposal: proposal.payload, proposal_ref: proposal.ref, draft: proposal.draft,
    request: readRequest(store, proposal.draft.request_ref, proposal.draft), record: records[0]?.payload || null,
    status: records[0]?.payload.status || "awaiting_review", freshness: at(now) < at(proposal.payload.expires_at) ? "current" : "expired",
    ...ADOPTION_AUTHORITY };
}
function main(argv = process.argv.slice(2)) {
  const [action, ...rest] = argv, allowed = ["propose", "backbrief", "rehearse", "decision-option", "decide", "inspect"];
  requireTrue(allowed.includes(action), "Usage: order-adoption-controller.js <propose|backbrief|rehearse|decision-option|decide|inspect> [options]");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index], value = rest[index + 1];
    requireTrue(["--repository", "--artifact-root", "--input", "--proposal-id"].includes(key) && value && !value.startsWith("--"), "ORDER_ADOPTION_CLI_OPTION_INVALID");
    const property = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    requireTrue(options[property] === undefined, "ORDER_ADOPTION_CLI_DUPLICATE_OPTION");
    options[property] = value;
  }
  requireTrue((action === "decision-option" || options.repository) && (action === "inspect" ? options.proposalId && !options.input : options.input && !options.proposalId),
    "ORDER_ADOPTION_CLI_INPUT_REQUIRED");
  const input = options.input && JSON.parse(fs.readFileSync(options.input, "utf8"));
  let result;
  if (action === "decision-option") { valid(input, "order-adoption-decision-request"); result = { option: decisionOption(input), ...ADOPTION_AUTHORITY }; }
  else if (action === "propose") result = proposeOrder(input, options);
  else if (action === "backbrief") result = retainOrderEvidence(input, options, BRIEFS);
  else if (action === "rehearse") result = retainOrderEvidence(input, options, REHEARSALS);
  else if (action === "decide") result = decideOrder(input, options);
  else result = inspectOrder(options);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { proposeOrder, retainOrderEvidence, decideOrder, inspectOrder, orderForPlan, contextAssignment,
  assertContextAssignment, proposalProof, recordProof, main };
