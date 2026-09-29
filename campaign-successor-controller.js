#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { manifestDigest, writeRepositoryArtifact } = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { computeRepositoryState } = require("./verification-runner");
const { inputDigest } = require("./dispatch-runtime-controller");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { historicalSettlementStore, loadSettlementArtifact } = require("./effect-settlement-proof");
const { appraiseTerminalInventory, terminalRecordProof, prefixBeforeEntry } = require("./campaign-terminal-controller");
const { missionStopRecords } = require("./campaign-stop-controller");

const NONE = { artifact_id: "none", relative_path: "none", sha256: "none" };
const PROPOSALS = "campaign-successor-proposals";
const ADMISSIONS = "campaign-successor-admissions";
const CAMPAIGNS = "self-improvement-campaigns";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => inputDigest(a) === inputDigest(b);
const ref = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
function requireTrue(value, code) { if (!value) throw new Error(code); }
function at(value) {
  const result = typeof value === "string" ? Date.parse(value) : NaN;
  requireTrue(Number.isFinite(result), "CAMPAIGN_SUCCESSOR_TIME_INVALID");
  return result;
}
function valid(payload, type) {
  const result = validatePayload(payload, type);
  requireTrue(result.valid, `CAMPAIGN_SUCCESSOR_INVALID:${type}:${result.issues.map(item => item.code).join(",")}`);
}
function load(options) {
  return loadVerifiedStore(options.repository, options.artifactRoot || path.join(options.repository, ".cannae", "artifacts"));
}
function snapshot(store) { return { revision: store.manifest.manifest_revision, sha256: manifestDigest(store.manifest) }; }
function read(store, value, kind, type, missionId) {
  const payload = loadSettlementArtifact(store, value, kind, type);
  const entry = store.manifest.artifacts.find(item => same(ref(item), value));
  requireTrue(entry && entry.artifact_id === payload.id && entry.mission_id === payload.mission_id &&
    (!missionId || entry.mission_id === missionId), "CAMPAIGN_SUCCESSOR_IDENTITY_MISMATCH");
  return { entry, payload, ref: ref(entry) };
}
function entries(store, missionId) { return store.manifest.artifacts.filter(item => item.mission_id === missionId); }
function prefixAt(store, revision) {
  return revision === store.manifest.manifest_revision ? store
    : historicalSettlementStore(store, revision, store.manifestHistory.get(revision));
}
function expiry(request, time) {
  const campaign = request.successor_campaign;
  return new Date(Math.min(at(time) + 3600000, at(campaign.created_at) + campaign.budgets.max_elapsed_minutes * 60000)).toISOString();
}
function retainedTerminal(store, request) {
  const terminal = terminalRecordProof(store, request.terminal_ref);
  requireTrue(terminal.record.mission_id === request.mission_id, "CAMPAIGN_SUCCESSOR_TERMINAL_SCOPE_MISMATCH");
  return { ...terminal, baseline: prefixAt(store, terminal.record.observed_manifest.revision + 1) };
}
function exactCeremony(store, terminal, allowed) {
  const prior = entries(terminal.baseline, terminal.record.mission_id).map(ref);
  const extra = entries(store, terminal.record.mission_id).filter(item => !prior.some(value => same(value, ref(item))));
  requireTrue(extra.length === allowed.length && extra.every(item => allowed.some(value => same(value, ref(item)))),
    "CAMPAIGN_SUCCESSOR_UNEXPECTED_HISTORY");
}
function candidateShape(store, request, time, terminal) {
  valid(request, "campaign-successor-proposal-request");
  const campaign = request.successor_campaign;
  valid(campaign, "self-improvement-campaign");
  const repository = store.verification.repository;
  requireTrue(campaign.status === "active" && campaign.mission_id === request.mission_id &&
    campaign.repository_binding.repository_key === repository.key &&
    campaign.repository_binding.identity_fingerprint === repository.identity_fingerprint &&
    campaign.repository_binding.baseline_revision === request.repository_state.head_commit &&
    campaign.id !== terminal.record.campaign_id && at(campaign.created_at) >= at(terminal.record.recorded_at) &&
    at(campaign.created_at) <= at(time) && at(time) < at(campaign.created_at) + campaign.budgets.max_elapsed_minutes * 60000,
  "CAMPAIGN_SUCCESSOR_CANDIDATE_INVALID");
  requireTrue(entries(store, request.mission_id).every(item => at(item.created_at) <= at(time)), "CAMPAIGN_SUCCESSOR_TIME_PRECEDES_HISTORY");
}
function liveRepository(request, options) {
  requireTrue(same(computeRepositoryState(options.repository), request.repository_state), "CAMPAIGN_SUCCESSOR_REPOSITORY_CHANGED");
}
function priorAdmissions(store, missionId) {
  return entries(store, missionId).filter(item => item.kind === ADMISSIONS)
    .map(item => read(store, ref(item), ADMISSIONS, "campaign-successor-admission", missionId));
}
function proposalPayload(store, request, time) {
  return { schema_version: "0.1", type: "CampaignSuccessorProposal", id: `CSP-${inputDigest(request).slice(0, 32)}`,
    mission_id: request.mission_id, request, request_sha256: inputDigest(request), observed_manifest: snapshot(store),
    recorded_at: time, expires_at: expiry(request, time), execution_authorized: false, continuation_authorized: false, release_authorized: false };
}
function appraiseProposal(store, request, time) {
  const terminal = retainedTerminal(store, request);
  candidateShape(store, request, time, terminal);
  exactCeremony(store, terminal, []);
  requireTrue(!store.manifest.artifacts.some(item => item.kind === CAMPAIGNS && item.artifact_id === request.successor_campaign.id),
    "CAMPAIGN_SUCCESSOR_ID_ALREADY_RETAINED");
  const inventory = appraiseTerminalInventory(store, terminal.record.request, time);
  requireTrue(same(inventory, terminal.record.inventory), "CAMPAIGN_SUCCESSOR_TERMINAL_NOT_CURRENT");
  const previous = priorAdmissions(store, request.mission_id);
  requireTrue(!previous.some(item => same(item.payload.covered_stop_refs, inventory.stop_refs)),
    "CAMPAIGN_SUCCESSOR_STOP_SET_ALREADY_CONSUMED");
  if (previous.length) {
    const latest = previous.sort((a, b) => b.payload.observed_manifest.revision - a.payload.observed_manifest.revision)[0];
    const admitted = admissionProof(store, latest);
    requireTrue(same(terminal.record.request.campaign_ref, admitted.payload.successor_campaign_ref),
      "CAMPAIGN_SUCCESSOR_LATEST_PREDECESSOR_REQUIRED");
  }
  return terminal;
}
function proposalProof(store, proposalRef, missionId) {
  const item = read(store, proposalRef, PROPOSALS, "campaign-successor-proposal", missionId);
  const proposal = item.payload;
  const before = historicalSettlementStore(store, proposal.observed_manifest.revision, proposal.observed_manifest.sha256);
  requireTrue(manifestDigest(prefixBeforeEntry(store, item.entry).manifest) === proposal.observed_manifest.sha256 &&
    at(item.entry.created_at) === at(proposal.recorded_at), "CAMPAIGN_SUCCESSOR_PROPOSAL_HISTORY_INVALID");
  appraiseProposal(before, proposal.request, proposal.recorded_at);
  requireTrue(same(proposal, proposalPayload(before, proposal.request, proposal.recorded_at)), "CAMPAIGN_SUCCESSOR_PROPOSAL_REPLAY_MISMATCH");
  return item;
}
function successorDecisionOption(request) {
  valid(request, "campaign-successor-activation-request");
  return `activate-successor:${inputDigest({ ...request, decision_ref: NONE })}`;
}
function candidateEntry(store, proposal) {
  const matches = store.manifest.artifacts.filter(item => item.kind === CAMPAIGNS && item.artifact_id === proposal.request.successor_campaign.id);
  requireTrue(matches.length <= 1, "CAMPAIGN_SUCCESSOR_CANDIDATE_CONFLICT");
  if (!matches.length) return null;
  const item = read(store, ref(matches[0]), CAMPAIGNS, "self-improvement-campaign", proposal.mission_id);
  requireTrue(same(item.payload, proposal.request.successor_campaign), "CAMPAIGN_SUCCESSOR_CANDIDATE_CONFLICT");
  return item;
}
function appraiseActivation(store, request, time) {
  valid(request, "campaign-successor-activation-request");
  const proposal = proposalProof(store, request.proposal_ref, request.mission_id);
  const terminal = retainedTerminal(store, proposal.payload.request);
  candidateShape(store, proposal.payload.request, time, terminal);
  requireTrue(at(time) >= at(proposal.payload.recorded_at) && at(time) < at(proposal.payload.expires_at), "CAMPAIGN_SUCCESSOR_PROPOSAL_EXPIRED");
  const decision = read(store, request.decision_ref, "decision-logs", "decision-log", request.mission_id);
  const value = decision.payload;
  const affected = [proposal.ref.relative_path, terminal.ref.relative_path].sort();
  requireTrue(value.decision_maker === "USER" && value.decision_type === "scope" && value.status === "complete" &&
    value.authority_basis.basis_type === "retained_authority" && value.authority_basis.reference === terminal.record.campaign_id &&
    value.chosen_option === successorDecisionOption(request) && value.options_considered.includes(value.chosen_option) &&
    same([...value.affected_artifacts].sort(), affected) && at(value.decided_at) >= at(proposal.payload.recorded_at) &&
    at(value.decided_at) <= at(time) && at(time) - at(value.decided_at) < 3600000 &&
    at(decision.entry.created_at) >= at(proposal.entry.created_at) && at(decision.entry.created_at) <= at(time),
  "CAMPAIGN_SUCCESSOR_USER_DECISION_REQUIRED");
  // A matching timestamp is not insertion-order proof.
  read(prefixBeforeEntry(store, decision.entry), proposal.ref, PROPOSALS, "campaign-successor-proposal", request.mission_id);
  const candidate = candidateEntry(store, proposal.payload);
  exactCeremony(store, terminal, [proposal.ref, decision.ref, ...(candidate ? [candidate.ref] : [])]);
  if (candidate) {
    requireTrue(at(candidate.entry.created_at) >= at(value.decided_at) && at(candidate.entry.created_at) < at(proposal.payload.expires_at),
      "CAMPAIGN_SUCCESSOR_CANDIDATE_PUBLICATION_INVALID");
    const before = prefixBeforeEntry(store, candidate.entry);
    exactCeremony(before, terminal, [proposal.ref, decision.ref]);
    read(before, decision.ref, "decision-logs", "decision-log", request.mission_id);
  }
  const inventory = appraiseTerminalInventory(store, terminal.record.request, time);
  requireTrue(same(inventory.stop_refs, terminal.record.inventory.stop_refs), "CAMPAIGN_SUCCESSOR_STOP_SET_CHANGED");
  requireTrue(!priorAdmissions(store, request.mission_id).some(item =>
    same(item.payload.request.decision_ref, request.decision_ref) || same(item.payload.covered_stop_refs, inventory.stop_refs)),
  "CAMPAIGN_SUCCESSOR_CONSENT_ALREADY_CONSUMED");
  return { proposal, terminal, decision, candidate, coveredStops: inventory.stop_refs };
}
function admissionPayload(store, request, appraisal, time) {
  requireTrue(appraisal.candidate, "CAMPAIGN_SUCCESSOR_CANDIDATE_REQUIRED");
  return { schema_version: "0.1", type: "CampaignSuccessorAdmission", id: `CSA-${inputDigest(request).slice(0, 32)}`,
    mission_id: request.mission_id, request, request_sha256: inputDigest(request), observed_manifest: snapshot(store),
    successor_campaign_ref: appraisal.candidate.ref, covered_stop_refs: appraisal.coveredStops,
    admitted_at: time, successor_admitted: true, execution_authorized: false, continuation_authorized: false, release_authorized: false };
}
function admissionProof(store, item) {
  const admission = item.payload;
  const before = historicalSettlementStore(store, admission.observed_manifest.revision, admission.observed_manifest.sha256);
  requireTrue(manifestDigest(prefixBeforeEntry(store, item.entry).manifest) === admission.observed_manifest.sha256 &&
    at(item.entry.created_at) === at(admission.admitted_at), "CAMPAIGN_SUCCESSOR_ADMISSION_HISTORY_INVALID");
  const appraisal = appraiseActivation(before, admission.request, admission.admitted_at);
  requireTrue(same(admission, admissionPayload(before, admission.request, appraisal, admission.admitted_at)),
    "CAMPAIGN_SUCCESSOR_ADMISSION_REPLAY_MISMATCH");
  return { ...item, appraisal };
}

// This answers only the mission stop fence, never budget/trust/tool readiness.
function successorStopFenceSatisfied(store, missionId, campaignRef) {
  const matches = priorAdmissions(store, missionId).filter(item => same(item.payload.successor_campaign_ref, campaignRef));
  if (!matches.length) return false;
  requireTrue(matches.length === 1, "CAMPAIGN_SUCCESSOR_ADMISSION_CONFLICT");
  const admitted = admissionProof(store, matches[0]);
  return same(admitted.payload.covered_stop_refs, missionStopRecords(store, missionId).map(item => item.ref));
}
function publish(options, store, payload, kind, guard, createdAt) {
  const written = writeRepositoryArtifact({ repositoryPath: options.repository, artifactRoot: store.artifactRoot,
    missionId: payload.mission_id, waveId: "C0", kind, artifactId: payload.id, payload, createdAt,
    reuseExisting: true, publicationGuard: ({ manifest }) => {
      const current = load(options);
      requireTrue(manifestDigest(manifest) === current.verification.manifest_sha256, "CAMPAIGN_SUCCESSOR_SNAPSHOT_CHANGED");
      guard(current, options.now || new Date().toISOString());
      return true;
    } });
  return { ref: { artifact_id: payload.id, relative_path: written.relative_path, sha256: written.sha256 }, existing: !written.created };
}
function proposeCampaignSuccessor(input, options = {}) {
  const request = clone(input);
  valid(request, "campaign-successor-proposal-request");
  const store = load(options);
  const id = `CSP-${inputDigest(request).slice(0, 32)}`;
  const existing = entries(store, request.mission_id).find(item => item.kind === PROPOSALS && item.artifact_id === id);
  if (existing) {
    const previous = proposalProof(store, ref(existing), request.mission_id);
    requireTrue(same(previous.payload.request, request), "CAMPAIGN_SUCCESSOR_PROPOSAL_CONFLICT");
    return { proposal: previous.payload, proposal_ref: previous.ref, existing: true,
      consent_granted: false, execution_authorized: false, continuation_authorized: false, release_authorized: false };
  }
  const time = options.now || new Date().toISOString();
  appraiseProposal(store, request, time);
  liveRepository(request, options);
  const proposal = proposalPayload(store, request, time);
  valid(proposal, "campaign-successor-proposal");
  const written = publish(options, store, proposal, PROPOSALS, (current, now) => {
    requireTrue(at(now) >= at(time), "CAMPAIGN_SUCCESSOR_CLOCK_ROLLBACK");
    requireTrue(at(now) < at(proposal.expires_at), "CAMPAIGN_SUCCESSOR_PROPOSAL_EXPIRED");
    requireTrue(current.verification.manifest_sha256 === proposal.observed_manifest.sha256, "CAMPAIGN_SUCCESSOR_SNAPSHOT_CHANGED");
    appraiseProposal(current, request, now);
    liveRepository(request, options);
  }, time);
  return { proposal, proposal_ref: written.ref, existing: written.existing,
    consent_granted: false, execution_authorized: false, continuation_authorized: false, release_authorized: false };
}
function activateCampaignSuccessor(input, options = {}) {
  const request = clone(input);
  valid(request, "campaign-successor-activation-request");
  let store = load(options);
  const id = `CSA-${inputDigest(request).slice(0, 32)}`;
  const existing = priorAdmissions(store, request.mission_id).find(item => item.payload.id === id);
  if (existing) {
    const prior = admissionProof(store, existing);
    requireTrue(same(prior.payload.request, request), "CAMPAIGN_SUCCESSOR_ADMISSION_CONFLICT");
    const satisfied = successorStopFenceSatisfied(store, request.mission_id, prior.payload.successor_campaign_ref);
    requireTrue(load(options).verification.manifest_sha256 === store.verification.manifest_sha256, "CAMPAIGN_SUCCESSOR_STATUS_CHANGED");
    return { admission: prior.payload, admission_ref: prior.ref, existing: true, stop_fence_satisfied: satisfied,
      execution_authorized: false, continuation_authorized: false, release_authorized: false };
  }
  const time = options.now || new Date().toISOString();
  let appraisal = appraiseActivation(store, request, time);
  liveRepository(appraisal.proposal.payload.request, options);
  const candidate = appraisal.proposal.payload.request.successor_campaign;
  if (!appraisal.candidate) {
    publish(options, store, candidate, CAMPAIGNS, (current, now) => {
      requireTrue(at(now) >= at(time), "CAMPAIGN_SUCCESSOR_CLOCK_ROLLBACK");
      requireTrue(current.verification.manifest_sha256 === store.verification.manifest_sha256, "CAMPAIGN_SUCCESSOR_SNAPSHOT_CHANGED");
      appraiseActivation(current, request, now);
      liveRepository(appraisal.proposal.payload.request, options);
    }, time);
  }
  store = load(options);
  const admittedAt = options.now || new Date().toISOString();
  requireTrue(at(admittedAt) >= at(time), "CAMPAIGN_SUCCESSOR_CLOCK_ROLLBACK");
  appraisal = appraiseActivation(store, request, admittedAt);
  liveRepository(appraisal.proposal.payload.request, options);
  const admission = admissionPayload(store, request, appraisal, admittedAt);
  valid(admission, "campaign-successor-admission");
  const written = publish(options, store, admission, ADMISSIONS, (current, now) => {
    requireTrue(at(now) >= at(admittedAt), "CAMPAIGN_SUCCESSOR_CLOCK_ROLLBACK");
    requireTrue(current.verification.manifest_sha256 === admission.observed_manifest.sha256, "CAMPAIGN_SUCCESSOR_SNAPSHOT_CHANGED");
    appraiseActivation(current, request, now);
    liveRepository(appraisal.proposal.payload.request, options);
  }, admittedAt);
  return { admission, admission_ref: written.ref, existing: written.existing, stop_fence_satisfied: true,
    execution_authorized: false, continuation_authorized: false, release_authorized: false };
}
function campaignSuccessorStatus(options, missionId, campaignId) {
  requireTrue(missionId && campaignId, "CAMPAIGN_SUCCESSOR_STATUS_SCOPE_REQUIRED");
  const store = load(options);
  const selected = entries(store, missionId).filter(item => item.kind === CAMPAIGNS && item.artifact_id === campaignId);
  requireTrue(selected.length <= 1, "CAMPAIGN_SUCCESSOR_CANDIDATE_CONFLICT");
  const candidateRef = selected.length ? ref(selected[0]) : NONE;
  const matches = priorAdmissions(store, missionId).filter(item => same(item.payload.successor_campaign_ref, candidateRef));
  const satisfied = selected.length ? successorStopFenceSatisfied(store, missionId, candidateRef) : false;
  requireTrue(load(options).verification.manifest_sha256 === store.verification.manifest_sha256, "CAMPAIGN_SUCCESSOR_STATUS_CHANGED");
  return { type: "CampaignSuccessorStatus", mission_id: missionId, campaign_id: campaignId,
    status: satisfied ? "admitted_to_normal_gates" : matches.length ? "stopped_again" : selected.length ? "candidate_held" : "not_published",
    observed_manifest: snapshot(store), candidate_ref: candidateRef, admission_ref: matches[0]?.ref || NONE,
    successor_admitted: matches.length === 1, stop_fence_satisfied: satisfied,
    execution_authorized: false, continuation_authorized: false, release_authorized: false };
}
function main(argv = process.argv.slice(2)) {
  try {
    const [action, ...args] = argv;
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      const key = { "--repository": "repository", "--artifact-root": "artifactRoot", "--request": "requestPath", "--mission": "missionId", "--campaign": "campaignId" }[args[index]];
      requireTrue(key && args[index + 1] && !args[index + 1].startsWith("--") && !options[key], `Invalid argument: ${args[index]}`);
      options[key] = args[index + 1];
    }
    requireTrue(["repository-state", "propose", "decision-option", "activate", "status"].includes(action), "Expected repository-state, propose, decision-option, activate or status.");
    requireTrue(action === "decision-option" || options.repository, "--repository is required.");
    requireTrue(["repository-state", "status"].includes(action) || options.requestPath, "--request is required.");
    const request = options.requestPath && JSON.parse(fs.readFileSync(options.requestPath, "utf8"));
    const result = action === "repository-state" ? { type: "CampaignSuccessorRepositoryState", repository_state: computeRepositoryState(options.repository),
      consent_granted: false, execution_authorized: false, continuation_authorized: false, release_authorized: false }
      : action === "propose" ? proposeCampaignSuccessor(request, options)
      : action === "activate" ? activateCampaignSuccessor(request, options)
        : action === "status" ? campaignSuccessorStatus(options, options.missionId, options.campaignId)
          : { chosen_option: successorDecisionOption(request), consent_granted: false, execution_authorized: false, continuation_authorized: false, release_authorized: false };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) { console.error(error.message); return 2; }
}
if (require.main === module) process.exitCode = main();
module.exports = { proposeCampaignSuccessor, activateCampaignSuccessor, campaignSuccessorStatus, successorDecisionOption, successorStopFenceSatisfied, main };
