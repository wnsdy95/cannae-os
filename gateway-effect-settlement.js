#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { manifestDigest, writeRepositoryArtifact } = require("./repository-artifact-store");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { computeRepositoryState } = require("./verification-runner");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { appraiseEffectSettlementProof, assertEffectSettlementInputsAvailable,
  historicalSettlementStore: historicalStore, loadSettlementArtifact: load,
  settlementContext: context } = require("./effect-settlement-proof");

const KIND = "gateway-effect-settlements";
function hash(value) { return require("./dispatch-runtime-controller").inputDigest(value); }
function sameRef(a, b) { return require("./tool-effect-review").sameEffectRef(a, b); }
function none() { return require("./dispatch-runtime-controller").NONE_REF; }
function requireTrue(value, code) { if (!value) throw new Error(code); }
function ref(entry) { return { artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 }; }
function assertValid(payload, type) {
  const failures = validatePayload(payload, type).issues.filter(item => ["error", "critical"].includes(item.severity));
  requireTrue(!failures.length, `${type}: ${failures.map(item => item.code).join(", ")}`);
}
function records(store) {
  require("./effect-settlement-proof").assertEffectSettlementConsumptionUnique(store);
  return store.manifest.artifacts.filter(entry => entry.kind === KIND).map(entry => {
    const payload = load(store, ref(entry), KIND, "gateway-effect-settlement");
    requireTrue(payload.request.mission_id === entry.mission_id && payload.request.wave_id === entry.wave_id,
      "GATEWAY_SETTLEMENT_NAMESPACE_MISMATCH");
    return { entry, payload };
  });
}
function decisionOption(request) {
  const subject = { ...request };
  delete subject.decision_ref;
  return `settle-gateway-effects:${hash(subject)}`;
}

function boundaryProof(store, request, scope, at) {
  const subject = scope.subject;
  const refs = subject.references;
  const gatewayRequest = load(store, refs.request_ref, "tool-gateway-requests", "tool-gateway-request", request);
  requireTrue(gatewayRequest.gateway.assurance_level !== "managed_exclusive" &&
    sameRef(refs.production_sandbox_admission_ref, none()), "GATEWAY_SETTLEMENT_COORDINATION_PROOF_REQUIRED");
  if (subject.subject_class === "orphan_admission") {
    requireTrue(sameRef(refs.execution_event_ref, none()) && sameRef(refs.receipt_ref, none()) &&
      sameRef(request.containment_observation_ref, none()), "GATEWAY_SETTLEMENT_ORPHAN_BOUNDARY_INVALID");
    return { containmentRequired: false, validUntil: scope.expires_at, effectCheckpointRef: none() };
  }
  requireTrue(subject.execution_mode === "oci_linux_sandbox_reference", "GATEWAY_SETTLEMENT_CONTAINMENT_ADAPTER_REQUIRED");
  requireTrue(subject.containment_history && sameRef(subject.containment_history.latest_ref, request.containment_observation_ref),
    "GATEWAY_SETTLEMENT_CONTAINMENT_REFERENCE_MISMATCH");
  const observation = load(store, request.containment_observation_ref, "oci-sandbox-containment-observations",
    "oci-sandbox-containment-observation", request);
  const policy = load(store, observation.sandbox_policy_ref, "oci-linux-sandbox-policies", "oci-linux-sandbox-policy", request);
  const envelope = load(store, observation.execution_envelope_ref, "oci-sandbox-execution-envelopes",
    "oci-sandbox-execution-envelope", request);
  requireTrue([observation.sandbox_policy_ref, observation.execution_envelope_ref].every(reference =>
    subject.retained_execution_refs.some(item => sameRef(item, reference))), "GATEWAY_SETTLEMENT_CONTAINMENT_REFERENCE_MISMATCH");
  const receipt = load(store, refs.receipt_ref, "tool-execution-receipts", "tool-execution-receipt", request);
  const result = require("./oci-linux-sandbox-evidence").verifyOciSandboxContainmentObservation({
    policy, policyRef: observation.sandbox_policy_ref, envelope, envelopeRef: observation.execution_envelope_ref,
    request: gatewayRequest, requestRef: refs.request_ref,
    decision: load(store, refs.decision_ref, "tool-gateway-decisions", "tool-gateway-decision", request), decisionRef: refs.decision_ref,
    executionEvent: load(store, refs.execution_event_ref, "tool-gateway-transaction-events", "tool-gateway-transaction-event", request),
    executionEventRef: refs.execution_event_ref,
    terminalEvent: load(store, refs.latest_event_ref, "tool-gateway-transaction-events", "tool-gateway-transaction-event", request),
    terminalEventRef: refs.latest_event_ref, receipt, receiptRef: refs.receipt_ref, observation,
    repositoryRoot: store.verification.repository.root, evaluatedAt: at
  });
  requireTrue(result.valid, `GATEWAY_SETTLEMENT_CONTAINMENT_INVALID:${result.codes.join(",")}`);
  const checkpoint = load(store, receipt.checkpoint_ref, "agent-execution-checkpoints", "agent-execution-checkpoint", request);
  requireTrue(sameRef(checkpoint.lease_ref, refs.lease_ref), "GATEWAY_SETTLEMENT_CHECKPOINT_MISMATCH");
  return { containmentRequired: true, validUntil: result.valid_until,
    effectCheckpointRef: checkpoint.execution_result.external_effects === "unknown" ? receipt.checkpoint_ref : none() };
}

function appraise(store, request, at, repositoryState) {
  assertValid(request, "gateway-effect-settlement-request");
  const review = load(store, request.review_ref, "gateway-effect-reviews", "gateway-effect-review", request);
  const scope = load(store, review.scope_ref, "gateway-effect-scopes", "gateway-effect-scope", request);
  const references = { scope_ref: review.scope_ref, verification_plan_ref: review.verification_plan_ref,
    verification_receipt_ref: review.verification_receipt_ref };
  const inspect = require("./gateway-effect-review").inspectGatewayEffects;
  const original = inspect({ now: review.reviewed_at }, references, context(store, repositoryState));
  requireTrue(hash(original) === hash(review), "GATEWAY_SETTLEMENT_REVIEW_PROJECTION_MISMATCH");
  const fresh = inspect({ now: at }, references, context(store, repositoryState));
  requireTrue(review.status === "evidence_bound" && fresh.status === "evidence_bound" &&
    Date.parse(review.reviewed_at) <= Date.parse(at), `GATEWAY_SETTLEMENT_REVIEW_NOT_BOUND:${fresh.reason_codes.join(",")}`);
  const subject = scope.subject;
  requireTrue(subject.next_action === "review" && !sameRef(subject.references.admission_ref, none()),
    "GATEWAY_SETTLEMENT_SUBJECT_NOT_ELIGIBLE");
  for (const record of records(store)) {
    requireTrue(!sameRef(record.payload.gateway_request_ref, subject.references.request_ref) &&
      !sameRef(record.payload.admission_ref, subject.references.admission_ref), "GATEWAY_SETTLEMENT_ALREADY_CONSUMED");
  }
  assertEffectSettlementInputsAvailable(store, request);
  const boundary = boundaryProof(store, request, scope, at);
  const proof = appraiseEffectSettlementProof({ store, request, at, scope, review, scopeSha256: fresh.scope_sha256,
    expectedDecisionOption: decisionOption(request),
    additionalDecisionReferences: boundary.containmentRequired ? [request.containment_observation_ref] : [] });
  return { ...proof, ...boundary, admissionValidUntil: new Date(Math.min(Date.parse(proof.admissionValidUntil),
    Date.parse(boundary.validUntil))).toISOString() };
}

function payloadFor(store, request, result, at, repositoryState) {
  const refs = result.scope.subject.references;
  return { schema_version: "0.1", type: "GatewayEffectSettlement", id: `GESL-${hash(request).slice(0, 32)}`,
    request, request_sha256: hash(request), transaction_id: result.scope.subject.transaction_id,
    gateway_request_ref: refs.request_ref, scope_ref: result.review.scope_ref, lease_ref: refs.lease_ref,
    checkpoint_ref: refs.checkpoint_ref, admission_ref: refs.admission_ref, effect_checkpoint_ref: result.effectCheckpointRef,
    repository_state: repositoryState,
    observed_manifest: { revision: store.verification.manifest_revision, sha256: store.verification.manifest_sha256 },
    proof: result.proof, containment_required: result.containmentRequired, containment_verified: result.containmentRequired,
    settled_at: at, admission_valid_until: result.admissionValidUntil, effects_settled: true,
    scope_completeness_basis: "exact_user_judgement", user_identity_authenticated: false,
    tool_execution_authorized: false, release_authorized: false };
}

function verifyRecord(store, record) {
  const value = record.payload;
  const before = historicalStore(store, value.observed_manifest.revision, value.observed_manifest.sha256);
  const revision = value.observed_manifest.revision + 1;
  const next = JSON.parse(fs.readFileSync(path.join(store.artifactRoot, "repositories", store.verification.repository.key,
    ".manifest-history", `manifest-r${String(revision).padStart(8, "0")}.json`), "utf8"));
  requireTrue(manifestDigest(next) === store.manifestHistory.get(revision), "GATEWAY_SETTLEMENT_PUBLICATION_MISMATCH");
  requireTrue(!before.manifest.artifacts.some(entry => sameRef(entry, record.entry)) &&
    next.artifacts.some(entry => sameRef(entry, record.entry)), "GATEWAY_SETTLEMENT_PUBLICATION_MISMATCH");
  const result = appraise(before, value.request, value.settled_at, value.repository_state);
  requireTrue(hash(payloadFor(before, value.request, result, value.settled_at, value.repository_state)) === hash(value) &&
    Date.parse(record.entry.created_at) === Date.parse(value.settled_at), "GATEWAY_SETTLEMENT_PROOF_MISMATCH");
  return value;
}

function verifiedRecords(store) {
  const seen = new Set();
  return records(store).map(record => {
    const payload = verifyRecord(store, record);
    for (const value of [payload.gateway_request_ref, payload.admission_ref, payload.request.decision_ref, payload.request.cycle_order_ref]) {
      requireTrue(!seen.has(hash(value)), "GATEWAY_SETTLEMENT_CONFLICT"); seen.add(hash(value));
    }
    return { entry: record.entry, payload };
  });
}

// Replay uses only raw gateway/lease history, never this settlement-aware projection.
function settledGatewayEffects(view) {
  if (!view.manifest.artifacts.some(entry => entry.kind === KIND)) return [];
  const store = loadVerifiedStore(view.repository.root, view.artifactRoot);
  requireTrue(manifestDigest(view.manifest) === store.verification.manifest_sha256, "GATEWAY_SETTLEMENT_STORE_CHANGED");
  return verifiedRecords(store).map(record => ({ ...record.payload, settlement_ref: ref(record.entry) }));
}

function settledGatewayEffectState(view, leaseRef, latestCheckpointRef) {
  const result = { checkpoint_refs: [], effect_checkpoint_refs: [], admission_refs: [], checkpoint_follows_settlement: true,
    latest_settled_at: null };
  for (const value of settledGatewayEffects(view).filter(item => sameRef(item.lease_ref, leaseRef))) {
    result.checkpoint_refs.push(value.checkpoint_ref);
    result.admission_refs.push(value.admission_ref);
    if (!sameRef(value.effect_checkpoint_ref, none())) result.effect_checkpoint_refs.push(value.effect_checkpoint_ref);
    if (!result.latest_settled_at || Date.parse(value.settled_at) > Date.parse(result.latest_settled_at)) result.latest_settled_at = value.settled_at;
    const manifest = JSON.parse(fs.readFileSync(path.join(view.artifactRoot, "repositories", view.repository.key,
      ".manifest-history", `manifest-r${String(value.observed_manifest.revision).padStart(8, "0")}.json`), "utf8"));
    if (!latestCheckpointRef || manifest.artifacts.some(entry => sameRef(entry, latestCheckpointRef))) result.checkpoint_follows_settlement = false;
  }
  return result;
}

function settleGatewayEffects(options, input) {
  const request = JSON.parse(JSON.stringify(input));
  assertValid(request, "gateway-effect-settlement-request");
  const store = loadVerifiedStore(options.repository, options.artifactRoot || path.join(options.repository, ".cannae", "artifacts"));
  const existing = verifiedRecords(store).find(record => record.payload.request_sha256 === hash(request));
  if (existing) return { settlement: existing.payload, settlement_ref: ref(existing.entry), reused: true };
  const at = options.now || new Date().toISOString();
  const repositoryState = computeRepositoryState(store.verification.repository.root);
  const result = appraise(store, request, at, repositoryState);
  const settlement = payloadFor(store, request, result, at, repositoryState);
  assertValid(settlement, "gateway-effect-settlement");
  const written = writeRepositoryArtifact({ repositoryPath: store.verification.repository.root, artifactRoot: store.artifactRoot,
    missionId: request.mission_id, waveId: request.wave_id, kind: KIND, artifactId: settlement.id,
    payload: settlement, createdAt: at, publicationGuard: snapshot => {
      requireTrue(manifestDigest(snapshot.manifest) === settlement.observed_manifest.sha256, "GATEWAY_SETTLEMENT_MANIFEST_CHANGED");
      const now = options.now || new Date().toISOString();
      requireTrue(Date.parse(now) >= Date.parse(at) && Date.parse(now) < Date.parse(settlement.admission_valid_until), "GATEWAY_SETTLEMENT_EXPIRED");
      appraise(store, request, now, computeRepositoryState(store.verification.repository.root));
      return true;
    } });
  return { settlement, settlement_ref: { artifact_id: settlement.id, relative_path: written.relative_path, sha256: written.sha256 }, reused: false };
}

function main() {
  try {
    const args = process.argv.slice(2);
    const command = args.shift();
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      const key = { "--repository": "repository", "--artifact-root": "artifactRoot", "--request": "request" }[args[index]];
      requireTrue(key && args[index + 1] && !options[key], "Invalid or repeated gateway settlement argument.");
      options[key] = args[index + 1];
    }
    requireTrue(options.request, "--request is required.");
    const request = JSON.parse(fs.readFileSync(options.request, "utf8"));
    const result = command === "decision-option" ? { chosen_option: decisionOption(request), execution_authorized: false, release_authorized: false }
      : command === "settle" && options.repository ? settleGatewayEffects(options, request) : null;
    requireTrue(result, "Usage: node gateway-effect-settlement.js <decision-option|settle> --request <file> [--repository <repo> --artifact-root <root>]");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
if (require.main === module) main();
module.exports = { decisionOption, settleGatewayEffects, settledGatewayEffects, settledGatewayEffectState };
