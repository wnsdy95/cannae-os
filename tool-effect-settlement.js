#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { manifestDigest, writeRepositoryArtifact } = require("./repository-artifact-store");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { computeRepositoryState } = require("./verification-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { appraiseEffectSettlementProof, historicalSettlementStore: historicalStore,
  loadSettlementArtifact: load, settlementContext: context } = require("./effect-settlement-proof");

function hash(value) { return require("./dispatch-runtime-controller").inputDigest(value); }
function sameRef(a, b) { return require("./tool-effect-review").sameEffectRef(a, b); }
function requireTrue(value, code) { if (!value) throw new Error(code); }
function assertValid(payload, type) {
  const failures = validatePayload(payload, type).issues.filter(item => ["error", "critical"].includes(item.severity));
  requireTrue(failures.length === 0, `${type}: ${failures.map(item => item.code).join(", ")}`);
}
function ref(entry) { return { artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 }; }
function records(store) {
  require("./effect-settlement-proof").assertEffectSettlementConsumptionUnique(store);
  return store.manifest.artifacts.filter(entry => entry.kind === "tool-effect-settlements").map(entry => {
    const payload = load(store, ref(entry), entry.kind, "tool-effect-settlement");
    requireTrue(payload.request.mission_id === entry.mission_id && payload.request.wave_id === entry.wave_id,
      "TOOL_EFFECT_SETTLEMENT_NAMESPACE_MISMATCH");
    return { entry, payload };
  });
}
function decisionOption(request) {
  const subject = { ...request };
  delete subject.decision_ref;
  return `settle-effects:${hash(subject)}`;
}

function appraise(store, request, at, repositoryState) {
  assertValid(request, "tool-effect-settlement-request");
  const review = load(store, request.review_ref, "tool-effect-reviews", "tool-effect-review", request);
  const references = { scope_ref: review.scope_ref, verification_plan_ref: review.verification_plan_ref,
    verification_receipt_ref: review.verification_receipt_ref };
  const scope = load(store, review.scope_ref, "tool-effect-scopes", "tool-effect-scope", request);
  const original = require("./tool-effect-review").inspectToolEffects({ now: review.reviewed_at }, references, context(store, repositoryState));
  requireTrue(hash(original) === hash(review), "TOOL_EFFECT_REVIEW_PROJECTION_MISMATCH");
  const fresh = require("./tool-effect-review").inspectToolEffects({ now: at }, references, context(store, repositoryState));
  requireTrue(review.status === "evidence_bound" && fresh.status === "evidence_bound" &&
    review.scope_sha256 === fresh.scope_sha256 && Date.parse(review.reviewed_at) <= Date.parse(at),
  `TOOL_EFFECT_REVIEW_NOT_BOUND:${fresh.reason_codes.join(",")}`);
  requireTrue(scope.mission_id === request.mission_id && scope.wave_id === request.wave_id,
    "TOOL_EFFECT_SETTLEMENT_SUBJECT_MISMATCH");
  // A gateway receipt requires its own cleanup and transaction settlement contract.
  for (const entry of store.manifest.artifacts.filter(item => item.kind === "tool-gateway-decisions")) {
    const gateway = load(store, ref(entry), entry.kind, "tool-gateway-decision");
    requireTrue(!sameRef(gateway.admission_ref, scope.admission_ref), "TOOL_EFFECT_GATEWAY_SETTLEMENT_REQUIRED");
  }
  const failedAdmission = load(store, scope.admission_ref, "tool-admission-events", "tool-admission-event", request);
  for (const entry of store.manifest.artifacts.filter(item => item.kind === "tool-gateway-requests")) {
    const gateway = load(store, ref(entry), entry.kind, "tool-gateway-request");
    requireTrue(!(sameRef(gateway.lease_ref, scope.lease_ref) &&
      gateway.tool_call.tool_use_id === failedAdmission.tool_use_id), "TOOL_EFFECT_GATEWAY_SETTLEMENT_REQUIRED");
  }
  for (const existing of records(store)) {
    requireTrue(!sameRef(existing.payload.checkpoint_ref, scope.checkpoint_ref) &&
      !sameRef(existing.payload.request.decision_ref, request.decision_ref) &&
      !sameRef(existing.payload.request.cycle_order_ref, request.cycle_order_ref), "TOOL_EFFECT_SETTLEMENT_ALREADY_CONSUMED");
  }
  require("./effect-settlement-proof").assertEffectSettlementInputsAvailable(store, request);
  return appraiseEffectSettlementProof({ store, request, at, scope, review,
    scopeSha256: fresh.scope_sha256, expectedDecisionOption: decisionOption(request) });
}

function verifyRecord(store, record) {
  const value = record.payload;
  const before = historicalStore(store, value.observed_manifest.revision, value.observed_manifest.sha256);
  const nextPath = path.join(store.artifactRoot, "repositories", store.verification.repository.key,
    ".manifest-history", `manifest-r${String(value.observed_manifest.revision + 1).padStart(8, "0")}.json`);
  const next = JSON.parse(fs.readFileSync(nextPath, "utf8"));
  requireTrue(!before.manifest.artifacts.some(entry => sameRef(entry, record.entry)) &&
    next.artifacts.some(entry => sameRef(entry, record.entry)), "TOOL_EFFECT_SETTLEMENT_PUBLICATION_MISMATCH");
  const result = appraise(before, value.request, value.settled_at, value.repository_state);
  requireTrue(value.request_sha256 === hash(value.request) && value.id === `TESL-${hash(value.request).slice(0, 32)}` &&
    Date.parse(record.entry.created_at) === Date.parse(value.settled_at) &&
    sameRef(value.scope_ref, result.review.scope_ref) && sameRef(value.lease_ref, result.scope.lease_ref) &&
    sameRef(value.checkpoint_ref, result.scope.checkpoint_ref) && sameRef(value.admission_ref, result.scope.admission_ref) &&
    hash(value.proof) === hash(result.proof) && value.admission_valid_until === result.admissionValidUntil,
  "TOOL_EFFECT_SETTLEMENT_PROOF_MISMATCH");
  return value;
}

function settledToolEffectState(runtimeView, leaseRef, latestCheckpointRef) {
  const result = { checkpoint_refs: [], checkpoint_follows_settlement: true, latest_settled_at: null };
  if (!runtimeView.manifest.artifacts.some(entry => entry.kind === "tool-effect-settlements")) return result;
  const store = loadVerifiedStore(runtimeView.repository.root, runtimeView.artifactRoot);
  requireTrue(manifestDigest(runtimeView.manifest) === store.verification.manifest_sha256, "TOOL_EFFECT_SETTLEMENT_STORE_CHANGED");
  const found = records(store);
  const seen = new Set();
  const consumed = new Set();
  for (const record of found) {
    const value = verifyRecord(store, record);
    const checkpoint = hash(value.checkpoint_ref);
    const decision = hash(value.request.decision_ref);
    const order = hash(value.request.cycle_order_ref);
    requireTrue(!seen.has(checkpoint) && !consumed.has(decision) && !consumed.has(order), "TOOL_EFFECT_SETTLEMENT_CONFLICT");
    seen.add(checkpoint); consumed.add(decision); consumed.add(order);
    if (sameRef(value.lease_ref, leaseRef)) {
      result.checkpoint_refs.push(value.checkpoint_ref);
      if (!result.latest_settled_at || Date.parse(value.settled_at) > Date.parse(result.latest_settled_at)) {
        result.latest_settled_at = value.settled_at;
      }
      const before = historicalStore(store, value.observed_manifest.revision, value.observed_manifest.sha256);
      // A legacy revocation retained before reconciliation is not its explicit follow-up.
      if (!latestCheckpointRef || before.manifest.artifacts.some(entry => sameRef(entry, latestCheckpointRef))) {
        result.checkpoint_follows_settlement = false;
      }
    }
  }
  return result;
}

function settledToolEffectRefs(runtimeView, leaseRef) {
  return settledToolEffectState(runtimeView, leaseRef).checkpoint_refs;
}

function settleToolEffects(options, input) {
  const request = JSON.parse(JSON.stringify(input));
  assertValid(request, "tool-effect-settlement-request");
  const store = loadVerifiedStore(options.repository, options.artifactRoot || path.join(options.repository, ".cannae", "artifacts"));
  let retained = null;
  const consumed = new Set();
  for (const record of records(store)) {
    const previous = verifyRecord(store, record);
    for (const reference of [previous.checkpoint_ref, previous.request.decision_ref, previous.request.cycle_order_ref]) {
      requireTrue(!consumed.has(hash(reference)), "TOOL_EFFECT_SETTLEMENT_CONFLICT");
      consumed.add(hash(reference));
    }
    if (previous.request_sha256 === hash(request)) retained = { settlement: previous, settlement_ref: ref(record.entry), reused: true };
  }
  if (retained) return retained;
  const at = options.now || new Date().toISOString();
  const repositoryState = computeRepositoryState(store.verification.repository.root);
  const result = appraise(store, request, at, repositoryState);
  const settlement = { schema_version: "0.1", type: "ToolEffectSettlement", id: `TESL-${hash(request).slice(0, 32)}`,
    request, request_sha256: hash(request), scope_ref: result.review.scope_ref, lease_ref: result.scope.lease_ref,
    checkpoint_ref: result.scope.checkpoint_ref, admission_ref: result.scope.admission_ref, repository_state: repositoryState,
    observed_manifest: { revision: store.verification.manifest_revision, sha256: store.verification.manifest_sha256 },
    proof: result.proof, settled_at: at, admission_valid_until: result.admissionValidUntil, effects_settled: true,
    scope_completeness_basis: "exact_user_judgement", user_identity_authenticated: false,
    tool_execution_authorized: false, release_authorized: false };
  assertValid(settlement, "tool-effect-settlement");
  const written = writeRepositoryArtifact({ repositoryPath: store.verification.repository.root, artifactRoot: store.artifactRoot,
    missionId: request.mission_id, waveId: request.wave_id, kind: "tool-effect-settlements", artifactId: settlement.id,
    payload: settlement, createdAt: at, publicationGuard: snapshot => {
      requireTrue(manifestDigest(snapshot.manifest) === settlement.observed_manifest.sha256, "TOOL_EFFECT_SETTLEMENT_MANIFEST_CHANGED");
      const now = options.now || new Date().toISOString();
      requireTrue(Date.parse(now) >= Date.parse(at) && Date.parse(now) < Date.parse(settlement.admission_valid_until), "TOOL_EFFECT_SETTLEMENT_EXPIRED");
      appraise(store, request, now, computeRepositoryState(store.verification.repository.root));
      return true;
    } });
  return { settlement, settlement_ref: { artifact_id: settlement.id, relative_path: written.relative_path, sha256: written.sha256 }, reused: false };
}

function main() {
  try {
    const args = process.argv.slice(2);
    const options = {};
    const command = args.shift();
    for (let index = 0; index < args.length; index += 2) {
      const key = { "--repository": "repository", "--artifact-root": "artifactRoot", "--request": "request" }[args[index]];
      requireTrue(key && args[index + 1] && !options[key], "Invalid or repeated settlement argument.");
      options[key] = args[index + 1];
    }
    requireTrue(options.request, "--request is required.");
    const request = JSON.parse(fs.readFileSync(options.request, "utf8"));
    const result = command === "decision-option" ? { chosen_option: decisionOption(request), execution_authorized: false, release_authorized: false }
      : command === "settle" && options.repository ? settleToolEffects(options, request) : null;
    requireTrue(result, "Usage: node tool-effect-settlement.js <decision-option|settle> --request <request.json> [--repository <repo> --artifact-root <root>]");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
if (require.main === module) main();
module.exports = { decisionOption, settleToolEffects, settledToolEffectRefs, settledToolEffectState };
