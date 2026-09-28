#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { manifestDigest, writeRepositoryArtifact } = require("./repository-artifact-store");
const { loadVerifiedStore, loadCampaignHistory, deriveOrder } = require("./campaign-supervisor");
const { computeRepositoryState } = require("./verification-runner");
const { evaluateAttestationQuorum } = require("./verification-attestation");
const { verifyVerifierExecutionEvidence } = require("./verifier-execution-evidence");
const { validatePayload } = require("./validator-cli-prototype/validate");

function hash(value) { return require("./dispatch-runtime-controller").inputDigest(value); }
function sameRef(a, b) { return require("./tool-effect-review").sameEffectRef(a, b); }
function requireTrue(value, code) { if (!value) throw new Error(code); }
function assertValid(payload, type) {
  const failures = validatePayload(payload, type).issues.filter(item => ["error", "critical"].includes(item.severity));
  requireTrue(failures.length === 0, `${type}: ${failures.map(item => item.code).join(", ")}`);
}
function ref(entry) { return { artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 }; }
function context(store, repositoryState) {
  return { repository: store.verification.repository, artifactRoot: store.artifactRoot, manifest: store.manifest, repositoryState };
}
function load(store, reference, kind, type, scope) {
  const value = require("./tool-effect-review").loadEffectArtifact(context(store), reference, kind, type, scope);
  return value.payload;
}
function records(store) {
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
  const receipt = load(store, review.verification_receipt_ref, "verification-receipts", "verification-receipt", request);
  const campaign = load(store, request.campaign_ref, "self-improvement-campaigns", "self-improvement-campaign");
  requireTrue(["0.3", "0.4"].includes(campaign.schema_version) && campaign.id === receipt.campaign_id &&
    campaign.mission_id === request.mission_id, "TOOL_EFFECT_VERIFICATION_CAMPAIGN_MISMATCH");
  const history = loadCampaignHistory(store, campaign.id);
  requireTrue(sameRef(ref(history.campaignEntry), request.campaign_ref) && history.trustPolicy &&
    ["0.4", "0.5", "0.6", "0.7"].includes(history.trustPolicy.schema_version), "TOOL_EFFECT_EXECUTION_ASSURANCE_REQUIRED");
  const order = load(store, request.cycle_order_ref, "self-improvement-cycle-orders", "self-improvement-cycle-order");
  const dispatchStore = historicalStore(store, order.observed_manifest.revision, order.observed_manifest.sha256);
  const dispatched = deriveOrder(dispatchStore, loadCampaignHistory(dispatchStore, campaign.id), order.generated_at);
  requireTrue(hash(dispatched) === hash(order), "TOOL_EFFECT_DISPATCH_PROOF_MISMATCH");
  const current = deriveOrder(store, history, at);
  requireTrue(current.status === "ready" && current.trust_policy_admission.required && current.trust_policy_admission.satisfied,
    `TOOL_EFFECT_VERIFIER_READINESS_BLOCKED:${current.blocking_codes.join(",")}`);
  requireTrue(order.status === "ready" && sameRef(order.campaign_ref, request.campaign_ref) &&
    order.campaign_id === receipt.campaign_id && order.mission_id === request.mission_id &&
    order.cycle_number === receipt.cycle_number && current.cycle_number === order.cycle_number &&
    current.attempt_number === order.attempt_number && current.transition === order.transition &&
    hash(current.task_order) === hash(order.task_order) && hash(current.proof_requirements) === hash(order.proof_requirements) &&
    sameRef(current.source_checkpoint_ref, order.source_checkpoint_ref) && sameRef(current.source_decision_ref, order.source_decision_ref) &&
    Date.parse(order.generated_at) <= Date.parse(receipt.started_at), "TOOL_EFFECT_CYCLE_ORDER_MISMATCH");
  const admission = current.trust_policy_admission;
  requireTrue(admission.identity_assurance.required && admission.identity_assurance.satisfied, "TOOL_EFFECT_WORKLOAD_IDENTITY_REQUIRED");
  const executionEvidence = new Map();
  const nativeProviderEvidence = new Map();
  const nativeTrustBundles = new Map();
  const attestations = [];
  const deadlines = [scope.expires_at, admission.valid_until,
    new Date(Date.parse(campaign.created_at) + campaign.budgets.max_elapsed_minutes * 60000).toISOString()];
  for (const reference of request.attestation_refs) {
    const attestation = load(store, reference, "verification-attestations", "verification-attestation");
    requireTrue(attestation.receipt_id === receipt.id && admission.receipt_quorum.verifier_ids.includes(attestation.verifier_id),
      "TOOL_EFFECT_ATTESTER_NOT_ADMITTED");
    const execution = load(store, attestation.execution_evidence_ref, "verifier-execution-evidence", "verifier-execution-evidence");
    const identity = admission.identity_assurance.evidence.find(item => item.verifier_id === attestation.verifier_id);
    requireTrue(identity && sameRef(execution.workload_identity_evidence_ref, identity.evidence_ref), "TOOL_EFFECT_WORKLOAD_EVIDENCE_MISMATCH");
    let native = null;
    let nativeTrust = null;
    if (execution.native_provider_evidence_ref) {
      const prefix = { github_actions: "github-actions-oidc", gitlab_ci: "gitlab-ci-oidc" }[execution.provider];
      requireTrue(prefix, "TOOL_EFFECT_NATIVE_PROVIDER_UNSUPPORTED");
      native = load(store, execution.native_provider_evidence_ref, `${prefix}-evidence`, `${prefix}-evidence`);
      nativeTrust = load(store, native.trust_bundle_ref, `${prefix}-trust-bundles`, `${prefix}-trust-bundle`);
      nativeProviderEvidence.set(native.id, native);
      nativeTrustBundles.set(nativeTrust.id, nativeTrust);
    }
    const executionResult = verifyVerifierExecutionEvidence({ evidence: execution, trustPolicy: history.trustPolicy,
      runtimePolicy: history.runtimePolicy, runtimePolicyReference: history.trustPolicy.execution_assurance.runtime_policy_ref,
      nativeProviderEvidence: native, nativeTrustBundle: nativeTrust, nativeTrustBundleReference: native && native.trust_bundle_ref,
      evaluatedAt: at, expectations: { purpose: "verification_receipt", verifierId: attestation.verifier_id,
        subjectReference: review.verification_receipt_ref, workloadIdentityEvidenceReference: identity.evidence_ref,
        repositoryKey: scope.repository_binding.repository_key, repositoryFingerprint: scope.repository_binding.identity_fingerprint,
        repositoryState: receipt.repository_state_before, verificationTarget: { name: scope.id, digest: { sha256: fresh.scope_sha256 } } } });
    requireTrue(executionResult.valid, `TOOL_EFFECT_EXECUTION_EVIDENCE_INVALID:${executionResult.codes.join(",")}`);
    requireTrue(Date.parse(execution.invocation.started_at) <= Date.parse(receipt.started_at) &&
      Date.parse(execution.invocation.finished_at) >= Date.parse(receipt.finished_at) &&
      Date.parse(execution.issued_at) <= Date.parse(attestation.issued_at), "TOOL_EFFECT_EXECUTION_WINDOW_MISMATCH");
    executionEvidence.set(execution.id, execution);
    attestations.push(attestation);
    deadlines.push(attestation.expires_at, executionResult.valid_until);
    deadlines.push(new Date(Date.parse(attestation.issued_at) + Math.min(
      campaign.attestation_policy.max_attestation_age_seconds,
      history.trustPolicy.quorum.max_attestation_age_seconds) * 1000).toISOString());
  }
  const quorum = evaluateAttestationQuorum(attestations, history.trustPolicy, {
    receiptReferences: { [receipt.id]: { relative_path: review.verification_receipt_ref.relative_path,
      sha256: review.verification_receipt_ref.sha256, receipt_sha256: receipt.receipt_sha256,
      repository_state: receipt.repository_state_before, verification_target: { name: scope.id, digest: { sha256: fresh.scope_sha256 } } } },
    campaignId: receipt.campaign_id, missionId: receipt.mission_id, cycleNumber: receipt.cycle_number,
    candidateId: scope.id, candidateRevision: fresh.scope_sha256, repositoryKey: scope.repository_binding.repository_key,
    maxAttestationAgeSeconds: campaign.attestation_policy.max_attestation_age_seconds,
    runtimePolicy: history.runtimePolicy, runtimePolicyReference: history.trustPolicy.execution_assurance.runtime_policy_ref,
    executionEvidence, nativeProviderEvidence, nativeTrustBundles
  }, campaign.attestation_policy, at);
  requireTrue(quorum.valid, `TOOL_EFFECT_ATTESTATION_INVALID:${quorum.codes.join(",")}`);
  const decision = load(store, request.decision_ref, "decision-logs", "decision-log", request);
  const expectedPaths = [request.review_ref, request.campaign_ref, request.cycle_order_ref, review.scope_ref,
    review.verification_plan_ref, review.verification_receipt_ref, ...request.attestation_refs].map(item => item.relative_path).sort();
  requireTrue(decision.decision_maker === "USER" && decision.decision_type === "scope" && decision.status === "complete" &&
    decision.mission_id === scope.mission_id && decision.authority_basis.basis_type === "retained_authority" &&
    decision.authority_basis.reference === scope.id && decision.chosen_option === decisionOption(request) &&
    decision.options_considered.includes(decision.chosen_option) && hash([...decision.affected_artifacts].sort()) === hash(expectedPaths),
  "TOOL_EFFECT_USER_DECISION_MISMATCH");
  const decisionTime = Date.parse(decision.decided_at);
  requireTrue(decisionTime >= Date.parse(review.reviewed_at) && attestations.every(item => decisionTime >= Date.parse(item.issued_at)) &&
    decisionTime <= Date.parse(at) && Date.parse(at) - decisionTime < 3600000, "TOOL_EFFECT_USER_DECISION_STALE");
  for (const entry of store.manifest.artifacts.filter(item => item.kind === "decision-logs" &&
      item.mission_id === request.mission_id && item.wave_id === request.wave_id && !sameRef(item, request.decision_ref))) {
    const other = load(store, ref(entry), entry.kind, "decision-log", request);
    requireTrue(!(other.decision_maker === "USER" && other.decision_type === "scope" && other.status === "complete" &&
      other.authority_basis.reference === scope.id && Date.parse(other.decided_at) >= decisionTime),
    "TOOL_EFFECT_USER_DECISION_CONFLICT");
  }
  deadlines.push(new Date(decisionTime + 3600000).toISOString());
  return { scope, review, admissionValidUntil: new Date(Math.min(...deadlines.map(Date.parse))).toISOString(),
    proof: { trust_policy_ref: campaign.attestation_policy.trust_policy_ref, assurance_scope: admission.assurance_scope,
      verifier_ids: quorum.verifier_ids, key_ids: quorum.key_ids, independence_groups: quorum.independence_groups } };
}

function historicalStore(store, revision, sha256) {
  requireTrue(Number.isSafeInteger(revision) && revision >= store.manifest.integrity.history_start_revision &&
    revision < store.manifest.manifest_revision && store.manifestHistory.get(revision) === sha256,
  "TOOL_EFFECT_SETTLEMENT_HISTORY_MISMATCH");
  const historyPath = path.join(store.artifactRoot, "repositories", store.verification.repository.key,
    ".manifest-history", `manifest-r${String(revision).padStart(8, "0")}.json`);
  const manifest = JSON.parse(fs.readFileSync(historyPath, "utf8"));
  requireTrue(manifestDigest(manifest) === sha256, "TOOL_EFFECT_SETTLEMENT_HISTORY_MISMATCH");
  return { ...store, manifest, verification: { ...store.verification, manifest_revision: revision, manifest_sha256: sha256 } };
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

function settledToolEffectRefs(runtimeView, leaseRef) {
  if (!runtimeView.manifest.artifacts.some(entry => entry.kind === "tool-effect-settlements")) return [];
  const store = loadVerifiedStore(runtimeView.repository.root, runtimeView.artifactRoot);
  requireTrue(manifestDigest(runtimeView.manifest) === store.verification.manifest_sha256, "TOOL_EFFECT_SETTLEMENT_STORE_CHANGED");
  const found = records(store);
  const seen = new Set();
  const consumed = new Set();
  const checkpoints = [];
  for (const record of found) {
    const value = verifyRecord(store, record);
    const checkpoint = hash(value.checkpoint_ref);
    const decision = hash(value.request.decision_ref);
    const order = hash(value.request.cycle_order_ref);
    requireTrue(!seen.has(checkpoint) && !consumed.has(decision) && !consumed.has(order), "TOOL_EFFECT_SETTLEMENT_CONFLICT");
    seen.add(checkpoint); consumed.add(decision); consumed.add(order);
    if (sameRef(value.lease_ref, leaseRef)) checkpoints.push(value.checkpoint_ref);
  }
  return checkpoints;
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
module.exports = { decisionOption, settleToolEffects, settledToolEffectRefs };
