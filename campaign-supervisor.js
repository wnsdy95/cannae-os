#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  manifestDigest,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { evaluateVerifierTrustReadiness } = require("./verifier-trust-readiness");
const { createVerifierChallengeSet } = require("./verifier-challenge-set");

const NONE_ARTIFACT_REF = Object.freeze({ artifact_id: "none", relative_path: "none", sha256: "none" });
const NONE_DECISION_REF = Object.freeze({ decision_id: "none", relative_path: "none", sha256: "none" });
const RETRY_DECISIONS = new Set(["revise_and_retry", "rollback", "continue"]);
const TERMINAL_DECISIONS = new Set(["complete", "terminate", "escalate"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function artifactRef(entry) {
  return {
    artifact_id: entry.artifact_id,
    relative_path: entry.relative_path,
    sha256: entry.sha256
  };
}

function decisionRef(entry) {
  return {
    decision_id: entry.artifact_id,
    relative_path: entry.relative_path,
    sha256: entry.sha256
  };
}

function sameReference(left, right, idField = "artifact_id") {
  return Boolean(left && right && left[idField] === right[idField] &&
    left.relative_path === right.relative_path && left.sha256 === right.sha256);
}

function isNoneReference(ref, idField = "artifact_id") {
  return Boolean(ref && ref[idField] === "none" && ref.relative_path === "none" && ref.sha256 === "none");
}

function validationFailures(payload, type) {
  return validatePayload(payload, type).issues
    .filter(item => item.severity === "error" || item.severity === "critical");
}

function readManifestPayload(artifactRoot, entry) {
  if (!entry || typeof entry.relative_path !== "string" || path.isAbsolute(entry.relative_path) ||
      entry.relative_path.split(/[\\/]+/).includes("..")) {
    throw new Error("Manifest artifact path is unsafe.");
  }
  const root = fs.realpathSync(artifactRoot);
  const filePath = path.resolve(root, entry.relative_path);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Manifest artifact path escapes the artifact root.");
  }
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Manifest artifact is not a regular file.");
  const bytes = fs.readFileSync(filePath);
  if (sha256(bytes) !== entry.sha256) throw new Error("Manifest artifact bytes do not match their recorded digest.");
  return JSON.parse(bytes.toString("utf8"));
}

function loadVerifiedStore(repositoryPath, artifactRootOption) {
  const verification = verifyRepositoryArtifacts({ repositoryPath, artifactRoot: artifactRootOption });
  if (!verification.valid) {
    throw new Error(`Repository artifact verification failed: ${verification.issues.map(item => item.code).join(", ")}`);
  }
  const artifactRoot = path.resolve(artifactRootOption || path.join(process.cwd(), ".cannae", "artifacts"));
  const manifestPath = path.join(artifactRoot, "repositories", verification.repository.key, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifestDigest(manifest) !== verification.manifest_sha256) {
    throw new Error("Repository artifact manifest changed after integrity verification.");
  }
  const manifestHistory = new Map();
  for (let revision = manifest.integrity.history_start_revision; revision <= manifest.manifest_revision; revision += 1) {
    const historyPath = path.join(
      artifactRoot,
      "repositories",
      verification.repository.key,
      ".manifest-history",
      `manifest-r${String(revision).padStart(8, "0")}.json`
    );
    const historic = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    manifestHistory.set(revision, manifestDigest(historic));
  }
  return { verification, artifactRoot, manifest, manifestHistory };
}

function loadCampaignHistory(store, campaignId) {
  const campaignEntries = store.manifest.artifacts.filter(entry =>
    entry.kind === "self-improvement-campaigns" && entry.artifact_id === campaignId);
  if (campaignEntries.length !== 1) {
    throw new Error(`Expected exactly one self-improvement campaign artifact for ${campaignId}; found ${campaignEntries.length}.`);
  }
  const campaignEntry = campaignEntries[0];
  const campaign = readManifestPayload(store.artifactRoot, campaignEntry);
  const campaignFailures = validationFailures(campaign, "self-improvement-campaign");
  if (campaignFailures.length > 0) {
    throw new Error(`Campaign validation failed: ${[...new Set(campaignFailures.map(item => item.code))].join(", ")}`);
  }
  if (campaign.id !== campaignId || campaign.mission_id !== campaignEntry.mission_id) {
    throw new Error("Campaign identity does not match its manifest entry.");
  }

  const loadKind = (kind, type) => store.manifest.artifacts
    .filter(entry => entry.kind === kind && entry.mission_id === campaign.mission_id)
    .map(entry => ({ entry, payload: readManifestPayload(store.artifactRoot, entry) }))
    .filter(item => item.payload.campaign_id === campaign.id)
    .map(item => {
      const failures = validationFailures(item.payload, type);
      if (failures.length > 0) {
        throw new Error(`${type} ${item.entry.artifact_id} validation failed: ${[...new Set(failures.map(issue => issue.code))].join(", ")}`);
      }
      if (item.payload.id !== item.entry.artifact_id) throw new Error(`${type} identity does not match its manifest entry.`);
      return item;
    });

  const trustPolicyLoad = { payload: null, entry: null, blockingCodes: [] };
  if (["0.3", "0.4"].includes(campaign.schema_version)) {
    const ref = campaign.attestation_policy && campaign.attestation_policy.trust_policy_ref;
    const matching = ref ? store.manifest.artifacts.filter(entry =>
      entry.kind === "verifier-trust-policies" &&
      entry.artifact_id === ref.artifact_id &&
      entry.relative_path === ref.relative_path &&
      entry.sha256 === ref.sha256 &&
      entry.mission_id === campaign.mission_id) : [];
    if (matching.length !== 1) {
      trustPolicyLoad.blockingCodes.push("TRUST_ADMISSION_POLICY_REFERENCE_INVALID");
    } else {
      const payload = readManifestPayload(store.artifactRoot, matching[0]);
      const failures = validationFailures(payload, "verifier-trust-policy");
      if (failures.length > 0) {
        trustPolicyLoad.blockingCodes.push("TRUST_ADMISSION_POLICY_SCHEMA_INVALID");
      } else {
        trustPolicyLoad.payload = payload;
        trustPolicyLoad.entry = matching[0];
      }
    }
  }

  const identityEvidence = [];
  const sigstoreIdentityEvidence = [];
  const sigstoreTrustedRoots = [];
  let runtimePolicy = null;
  if (trustPolicyLoad.payload) {
    for (const entry of store.manifest.artifacts.filter(item =>
      item.kind === "verifier-identity-evidence" && item.mission_id === campaign.mission_id)) {
      const payload = readManifestPayload(store.artifactRoot, entry);
      if (payload.trust_policy_id !== trustPolicyLoad.payload.id) continue;
      const failures = validationFailures(payload, "verifier-identity-evidence");
      if (failures.length > 0 || payload.id !== entry.artifact_id) continue;
      identityEvidence.push({ entry, payload });
    }
    if (["0.3", "0.4", "0.5", "0.6"].includes(trustPolicyLoad.payload.schema_version)) {
      const refs = trustPolicyLoad.payload.identity_assurance.sigstore_trusted_root_refs || [];
      for (const ref of refs) {
        const matching = store.manifest.artifacts.filter(entry =>
          entry.kind === "sigstore-trusted-roots" &&
          entry.artifact_id === ref.artifact_id &&
          entry.relative_path === ref.relative_path &&
          entry.sha256 === ref.sha256 &&
          entry.mission_id === campaign.mission_id);
        if (matching.length !== 1) {
          trustPolicyLoad.blockingCodes.push("TRUST_ADMISSION_SIGSTORE_ROOT_REFERENCE_INVALID");
          continue;
        }
        const payload = readManifestPayload(store.artifactRoot, matching[0]);
        const failures = validationFailures(payload, "sigstore-trusted-root");
        if (failures.length > 0 || payload.id !== matching[0].artifact_id) {
          trustPolicyLoad.blockingCodes.push("TRUST_ADMISSION_SIGSTORE_ROOT_SCHEMA_INVALID");
          continue;
        }
        sigstoreTrustedRoots.push({ entry: matching[0], payload });
      }
      for (const entry of store.manifest.artifacts.filter(item =>
        item.kind === "sigstore-verifier-identity-evidence" && item.mission_id === campaign.mission_id)) {
        const payload = readManifestPayload(store.artifactRoot, entry);
        if (payload.trust_policy_id !== trustPolicyLoad.payload.id) continue;
        const failures = validationFailures(payload, "sigstore-verifier-identity-evidence");
        if (failures.length > 0 || payload.id !== entry.artifact_id) continue;
        sigstoreIdentityEvidence.push({ entry, payload });
      }
    }
    if (["0.4", "0.5", "0.6"].includes(trustPolicyLoad.payload.schema_version)) {
      const ref = trustPolicyLoad.payload.execution_assurance &&
        trustPolicyLoad.payload.execution_assurance.runtime_policy_ref;
      const matching = ref ? store.manifest.artifacts.filter(entry =>
        entry.kind === "verifier-runtime-policies" &&
        entry.artifact_id === ref.artifact_id &&
        entry.relative_path === ref.relative_path &&
        entry.sha256 === ref.sha256 &&
        entry.mission_id === campaign.mission_id) : [];
      if (matching.length !== 1) {
        trustPolicyLoad.blockingCodes.push("TRUST_ADMISSION_RUNTIME_POLICY_REFERENCE_INVALID");
      } else {
        const payload = readManifestPayload(store.artifactRoot, matching[0]);
        const failures = validationFailures(payload, "verifier-runtime-policy");
        if (failures.length > 0 || payload.id !== matching[0].artifact_id) {
          trustPolicyLoad.blockingCodes.push("TRUST_ADMISSION_RUNTIME_POLICY_SCHEMA_INVALID");
        } else {
          runtimePolicy = payload;
        }
      }
    }
  }

  return {
    campaign,
    campaignEntry,
    checkpoints: loadKind("self-improvement-checkpoints", "self-improvement-checkpoint"),
    decisions: loadKind("self-improvement-decisions", "self-improvement-decision"),
    existingOrders: loadKind("self-improvement-cycle-orders", "self-improvement-cycle-order"),
    challengeSets: loadKind("verifier-challenge-sets", "verifier-challenge-set"),
    trustPolicy: trustPolicyLoad.payload,
    trustPolicyEntry: trustPolicyLoad.entry,
    trustPolicyBlockingCodes: trustPolicyLoad.blockingCodes,
    identityEvidence,
    sigstoreIdentityEvidence,
    sigstoreTrustedRoots,
    runtimePolicy
  };
}

function addBlock(blocks, code) {
  if (!blocks.includes(code)) blocks.push(code);
}

function buildPairs(campaign, checkpoints, decisions, repository, manifestHistory, blocks) {
  const checkpointIds = new Set();
  const decisionIds = new Set();
  const checkpointById = new Map();
  const decisionsByCheckpoint = new Map();

  for (const item of checkpoints) {
    const checkpoint = item.payload;
    if (checkpointIds.has(checkpoint.id)) addBlock(blocks, "CAMPAIGN_CHECKPOINT_ID_DUPLICATE");
    checkpointIds.add(checkpoint.id);
    checkpointById.set(checkpoint.id, item);
    if (checkpoint.mission_id !== campaign.mission_id || checkpoint.campaign_id !== campaign.id) addBlock(blocks, "CAMPAIGN_CHECKPOINT_BINDING_INVALID");
    if (checkpoint.repository_binding.repository_key !== repository.key ||
        checkpoint.repository_binding.identity_fingerprint !== repository.identity_fingerprint) {
      addBlock(blocks, "CAMPAIGN_CHECKPOINT_REPOSITORY_MISMATCH");
    }
    if (["0.3", "0.4"].includes(campaign.schema_version) && checkpoint.schema_version !== campaign.schema_version) {
      addBlock(blocks, "CAMPAIGN_CHECKPOINT_VERSION_MISMATCH");
    }
  }

  for (const item of decisions) {
    const decision = item.payload;
    if (decisionIds.has(decision.id)) addBlock(blocks, "CAMPAIGN_DECISION_ID_DUPLICATE");
    decisionIds.add(decision.id);
    if (decision.mission_id !== campaign.mission_id || decision.campaign_id !== campaign.id) addBlock(blocks, "CAMPAIGN_DECISION_BINDING_INVALID");
    if (["0.3", "0.4"].includes(campaign.schema_version) && decision.schema_version !== campaign.schema_version) {
      addBlock(blocks, "CAMPAIGN_DECISION_VERSION_MISMATCH");
    }
    const list = decisionsByCheckpoint.get(decision.checkpoint_id) || [];
    list.push(item);
    decisionsByCheckpoint.set(decision.checkpoint_id, list);
  }

  const pairs = [];
  for (const checkpointItem of checkpoints) {
    const matching = decisionsByCheckpoint.get(checkpointItem.payload.id) || [];
    if (matching.length !== 1) {
      addBlock(blocks, matching.length === 0 ? "CAMPAIGN_CHECKPOINT_WITHOUT_DECISION" : "CAMPAIGN_CHECKPOINT_DECISION_DUPLICATE");
      continue;
    }
    const decisionItem = matching[0];
    if (decisionItem.payload.cycle_number !== checkpointItem.payload.cycle_number) addBlock(blocks, "CAMPAIGN_PAIR_CYCLE_MISMATCH");
    const checkpointTime = Date.parse(checkpointItem.payload.generated_at);
    const decisionTime = Date.parse(decisionItem.payload.decided_at);
    if (!Number.isFinite(checkpointTime) || !Number.isFinite(decisionTime) || decisionTime < checkpointTime) {
      addBlock(blocks, "CAMPAIGN_PAIR_TIME_INVALID");
    }
    if (decisionTime !== checkpointTime) addBlock(blocks, "CAMPAIGN_PAIR_TIME_MISMATCH");
    if (decisionItem.payload.selected_candidate_id !== checkpointItem.payload.candidate.id) addBlock(blocks, "CAMPAIGN_DECISION_CANDIDATE_MISMATCH");
    const accepted = ["accept_working_state", "complete"].includes(decisionItem.payload.decision);
    if ((accepted && decisionItem.payload.accepted_revision !== checkpointItem.payload.target.candidate_revision) ||
        (!accepted && decisionItem.payload.accepted_revision !== "none")) {
      addBlock(blocks, "CAMPAIGN_DECISION_REVISION_MISMATCH");
    }
    const checkpointReceiptIds = new Set(checkpointItem.payload.verification_receipts.map(item => item.receipt_id));
    const decisionReceiptIds = decisionItem.payload.proof.verification_receipt_ids || [];
    if (decisionReceiptIds.some(id => !checkpointReceiptIds.has(id)) || (accepted && decisionReceiptIds.length === 0)) {
      addBlock(blocks, "CAMPAIGN_DECISION_RECEIPT_BINDING_INVALID");
    }
    const checkpointAttestationIds = new Set((checkpointItem.payload.verification_attestations || []).map(item => item.attestation_id));
    if ((decisionItem.payload.proof.verification_attestation_ids || []).some(id => !checkpointAttestationIds.has(id))) {
      addBlock(blocks, "CAMPAIGN_DECISION_ATTESTATION_BINDING_INVALID");
    }
    const checkpointComparativeAttestationIds = new Set((checkpointItem.payload.comparative_evaluation_attestations || [])
      .map(item => item.attestation_id));
    const decisionComparativeAttestationIds = decisionItem.payload.proof.comparative_evaluation_attestation_ids || [];
    if (decisionComparativeAttestationIds.some(id => !checkpointComparativeAttestationIds.has(id))) {
      addBlock(blocks, "CAMPAIGN_DECISION_COMPARATIVE_ATTESTATION_BINDING_INVALID");
    }
    const comparisonRef = checkpointItem.payload.comparative_evaluation_ref || {};
    const comparisonRequired = ["runtime_control", "skill"].includes(checkpointItem.payload.target.target_type);
    const decisionComparisonId = decisionItem.payload.proof.comparative_evaluation_report_id || "none";
    if ((comparisonRequired && (comparisonRef.required !== true || comparisonRef.report_id === "none" || decisionComparisonId !== comparisonRef.report_id)) ||
        (!comparisonRequired && decisionComparisonId !== "none")) {
      addBlock(blocks, "CAMPAIGN_DECISION_COMPARATIVE_EVALUATION_BINDING_INVALID");
    }
    if (campaign.schema_version === "0.4" && comparisonRequired &&
        ["accept_working_state", "complete"].includes(decisionItem.payload.decision) &&
        (decisionComparativeAttestationIds.length === 0 || decisionItem.payload.proof.comparative_attestation_quorum_satisfied !== true)) {
      addBlock(blocks, "CAMPAIGN_DECISION_COMPARATIVE_ATTESTATION_QUORUM_INVALID");
    }
    if (decisionItem.payload.decision === "complete" &&
        (checkpointItem.payload.trigger !== "before_completion" || checkpointItem.payload.candidate.disposition !== "no_change" ||
         checkpointItem.payload.progress.open_acceptance_criteria.length !== 0)) {
      addBlock(blocks, "CAMPAIGN_COMPLETION_DECISION_INVALID");
    }
    const proofRevision = decisionItem.payload.proof.repository_manifest_revision;
    if (!manifestHistory.has(proofRevision) || manifestHistory.get(proofRevision) !== decisionItem.payload.proof.repository_manifest_sha256) {
      addBlock(blocks, "CAMPAIGN_DECISION_MANIFEST_PROOF_INVALID");
    }
    pairs.push({ checkpoint: checkpointItem, decision: decisionItem, decidedAt: decisionTime });
  }
  for (const decision of decisions) {
    if (!checkpointById.has(decision.payload.checkpoint_id)) addBlock(blocks, "CAMPAIGN_DECISION_WITHOUT_CHECKPOINT");
  }

  return pairs.sort((left, right) =>
    left.checkpoint.payload.cycle_number - right.checkpoint.payload.cycle_number ||
    left.decidedAt - right.decidedAt ||
    left.decision.payload.id.localeCompare(right.decision.payload.id));
}

function validateLineage(campaign, pairs, blocks) {
  if (pairs.length === 0) return;
  const cycleNumbers = [...new Set(pairs.map(pair => pair.checkpoint.payload.cycle_number))].sort((a, b) => a - b);
  if (cycleNumbers[0] !== 1) addBlock(blocks, "CAMPAIGN_CYCLE_SEQUENCE_INVALID");
  for (let index = 1; index < cycleNumbers.length; index += 1) {
    if (cycleNumbers[index] !== cycleNumbers[index - 1] + 1) addBlock(blocks, "CAMPAIGN_CYCLE_SEQUENCE_INVALID");
  }

  const acceptedByCycle = new Map();
  const pairsByCycle = new Map();
  for (const pair of pairs) {
    const cycle = pair.checkpoint.payload.cycle_number;
    const list = pairsByCycle.get(cycle) || [];
    list.push(pair);
    pairsByCycle.set(cycle, list);
    if (pair.decision.payload.decision === "accept_working_state") {
      if (acceptedByCycle.has(cycle)) addBlock(blocks, "CAMPAIGN_MULTIPLE_ACCEPTED_STATES");
      acceptedByCycle.set(cycle, pair);
    }
  }

  for (const [cycle, cyclePairs] of pairsByCycle) {
    const expectedBaseline = cycle === 1
      ? campaign.repository_binding.baseline_revision
      : acceptedByCycle.get(cycle - 1) && acceptedByCycle.get(cycle - 1).decision.payload.accepted_revision;
    if (cycle > 1 && !expectedBaseline) addBlock(blocks, "CAMPAIGN_CYCLE_WITHOUT_ACCEPTED_PARENT");
    const expectedParent = cycle === 1 ? null : acceptedByCycle.get(cycle - 1);
    let acceptedSeen = false;
    for (const pair of cyclePairs) {
      const checkpoint = pair.checkpoint.payload;
      const decision = pair.decision.payload;
      if (acceptedSeen) addBlock(blocks, "CAMPAIGN_RECORD_AFTER_ACCEPTED_STATE");
      if (checkpoint.target.baseline_revision !== expectedBaseline) addBlock(blocks, "CAMPAIGN_BASELINE_LINEAGE_INVALID");
      if (cycle === 1) {
        if (checkpoint.parent_decision_id !== "none" || !isNoneReference(checkpoint.parent_decision_ref, "decision_id")) {
          addBlock(blocks, "CAMPAIGN_FIRST_CYCLE_PARENT_INVALID");
        }
      } else if (!expectedParent || checkpoint.parent_decision_id !== expectedParent.decision.payload.id ||
          !sameReference(checkpoint.parent_decision_ref, decisionRef(expectedParent.decision.entry), "decision_id")) {
        addBlock(blocks, "CAMPAIGN_PARENT_LINEAGE_INVALID");
      }
      if (decision.proof.parent_decision_id !== checkpoint.parent_decision_id) addBlock(blocks, "CAMPAIGN_DECISION_PARENT_MISMATCH");
      if (decision.decision === "accept_working_state") acceptedSeen = true;
    }
  }

  let terminalSeen = false;
  let previousTime = -Infinity;
  let previousElapsed = 0;
  let previousFailedExperiments = 0;
  for (const pair of pairs) {
    if (terminalSeen) addBlock(blocks, "CAMPAIGN_RECORD_AFTER_TERMINAL_DECISION");
    if (TERMINAL_DECISIONS.has(pair.decision.payload.decision)) terminalSeen = true;
    if (pair.decidedAt < previousTime) addBlock(blocks, "CAMPAIGN_TIME_SEQUENCE_INVALID");
    if (pair.checkpoint.payload.progress.elapsed_minutes < previousElapsed) addBlock(blocks, "CAMPAIGN_ELAPSED_COUNTER_ROLLBACK");
    if (pair.checkpoint.payload.progress.failed_experiments < previousFailedExperiments) addBlock(blocks, "CAMPAIGN_FAILURE_COUNTER_ROLLBACK");
    previousTime = pair.decidedAt;
    previousElapsed = pair.checkpoint.payload.progress.elapsed_minutes;
    previousFailedExperiments = pair.checkpoint.payload.progress.failed_experiments;
  }
}

function proofRequirements(campaign) {
  const policy = campaign.attestation_policy;
  return {
    verification_receipt_required: true,
    comparative_evaluation_required_for: campaign.comparative_evaluation_policy
      ? [...campaign.comparative_evaluation_policy.required_target_types]
      : [],
    signed_attestation_required: ["0.3", "0.4"].includes(campaign.schema_version),
    signed_comparative_attestation_required: campaign.schema_version === "0.4",
    minimum_valid_attestations: policy ? policy.minimum_valid_attestations : 0,
    minimum_independence_groups: policy ? policy.minimum_independence_groups : 0,
    require_distinct_key_ids: policy ? policy.require_distinct_key_ids : false,
    trust_policy_ref: policy ? clone(policy.trust_policy_ref) : clone(NONE_ARTIFACT_REF)
  };
}

function initialTaskOrder(campaign) {
  const criterion = campaign.objective.acceptance_criteria[0];
  const evidence = [
    "Repository-scoped checkpoint artifact.",
    "Runtime-issued verification receipt bound to the candidate revision."
  ];
  if (["0.3", "0.4"].includes(campaign.schema_version)) evidence.push("Fresh signed receipt attestations satisfying the campaign quorum.");
  if (campaign.schema_version === "0.4") evidence.push("For comparative targets, fresh signed report attestations satisfying the same trust policy and quorum.");
  if (campaign.comparative_evaluation_policy) {
    evidence.push("A baseline-versus-candidate comparative report for skill or runtime-control promotion.");
  }
  return {
    owner: campaign.command_team.improvement_controller,
    task: `Produce one bounded candidate that advances this acceptance criterion: ${criterion}`,
    purpose: campaign.objective.intent,
    constraints: [
      "Stay inside the campaign authority envelope.",
      "Preserve every protected invariant.",
      "Do not release, merge, push, or expand authority without human approval."
    ],
    required_evidence: evidence,
    next_checkpoint_trigger: "wave_end"
  };
}

function holdTaskOrder(campaign, reason) {
  return {
    owner: campaign.command_team.improvement_controller,
    task: "Hold autonomous campaign execution.",
    purpose: reason,
    constraints: ["Do not execute a follow-on candidate from this order."],
    required_evidence: ["A new manifest-backed human decision or corrected campaign chain is required before resumption."],
    next_checkpoint_trigger: "manual"
  };
}

function budgetSnapshot(campaign, pairs, retryCount) {
  const latest = pairs.at(-1);
  const progress = latest ? latest.checkpoint.payload.progress : {};
  return {
    max_cycles: campaign.budgets.max_cycles,
    cycles_observed: pairs.length === 0 ? 0 : Math.max(...pairs.map(pair => pair.checkpoint.payload.cycle_number)),
    max_retries_per_cycle: campaign.budgets.max_retries_per_cycle,
    retries_used_current_cycle: retryCount,
    max_failed_experiments: campaign.budgets.max_failed_experiments,
    failed_experiments: progress.failed_experiments || 0,
    max_no_progress_cycles: campaign.budgets.max_no_progress_cycles,
    consecutive_no_progress_cycles: progress.consecutive_no_progress_cycles || 0,
    max_elapsed_minutes: campaign.budgets.max_elapsed_minutes,
    elapsed_minutes: progress.elapsed_minutes || 0
  };
}

function orderId(campaignId, cycleNumber, attemptNumber, transition, status, admission) {
  const transitionToken = transition.replace(/_/g, "-").toUpperCase();
  const admissionIdentity = clone(admission);
  delete admissionIdentity.evaluated_at;
  const admissionToken = sha256(JSON.stringify(admissionIdentity)).slice(0, 12).toUpperCase();
  return `SCO-${campaignId.replace(/^[A-Z]+-/, "")}-C${cycleNumber}-A${attemptNumber}-${transitionToken}-${status.toUpperCase()}-AD${admissionToken}`;
}

function deriveOrder(store, history, evaluatedAt = new Date().toISOString()) {
  const {
    campaign,
    campaignEntry,
    checkpoints,
    decisions,
    trustPolicy,
    trustPolicyBlockingCodes,
    identityEvidence,
    sigstoreIdentityEvidence,
    sigstoreTrustedRoots,
    runtimePolicy,
    challengeSets,
    existingOrders
  } = history;
  const repository = store.verification.repository;
  const blocks = [];
  if (campaign.repository_binding.repository_key !== repository.key ||
      campaign.repository_binding.identity_fingerprint !== repository.identity_fingerprint) {
    addBlock(blocks, "CAMPAIGN_REPOSITORY_BINDING_MISMATCH");
  }
  const pairs = buildPairs(campaign, checkpoints, decisions, repository, store.manifestHistory, blocks);
  validateLineage(campaign, pairs, blocks);

  const latest = pairs.at(-1);
  let status = "ready";
  let transition = "start";
  let cycleNumber = 1;
  let attemptNumber = 1;
  let baselineRevision = campaign.repository_binding.baseline_revision;
  let parentRef = clone(NONE_DECISION_REF);
  let sourceCheckpointRef = clone(NONE_ARTIFACT_REF);
  let sourceDecisionRef = clone(NONE_ARTIFACT_REF);
  let checkpointTrigger = "wave_end";
  let taskOrder = initialTaskOrder(campaign);
  let humanDecisionRequired = false;
  let requiredHumanDecision = "none";
  let retryCount = 0;

  if (latest) {
    const checkpoint = latest.checkpoint.payload;
    const decision = latest.decision.payload;
    sourceCheckpointRef = artifactRef(latest.checkpoint.entry);
    sourceDecisionRef = artifactRef(latest.decision.entry);
    cycleNumber = checkpoint.cycle_number;
    baselineRevision = checkpoint.target.baseline_revision;
    parentRef = clone(checkpoint.parent_decision_ref);
    checkpointTrigger = decision.next_task_order.next_checkpoint_trigger;
    taskOrder = clone(decision.next_task_order);

    if (decision.decision === "accept_working_state") {
      cycleNumber += 1;
      attemptNumber = 1;
      baselineRevision = decision.accepted_revision;
      parentRef = decisionRef(latest.decision.entry);
      transition = checkpointTrigger === "before_completion" ? "before_completion" : "advance";
    } else if (RETRY_DECISIONS.has(decision.decision)) {
      const currentCyclePairs = pairs.filter(pair => pair.checkpoint.payload.cycle_number === cycleNumber);
      retryCount = currentCyclePairs.length;
      attemptNumber = currentCyclePairs.length + 1;
      transition = "retry";
    } else {
      status = decision.decision === "complete" ? "completed" : decision.decision === "terminate" ? "terminated" : "awaiting_human";
      transition = "hold";
      taskOrder = holdTaskOrder(campaign, decision.required_human_decision === "none" ? decision.reasons.join(" ") : decision.required_human_decision);
      checkpointTrigger = "manual";
      humanDecisionRequired = true;
      requiredHumanDecision = decision.decision === "complete"
        ? "Approve or reject merge, push, or release through the separate human-controlled gate."
        : decision.required_human_decision;
    }
  }

  const budget = budgetSnapshot(campaign, pairs, retryCount);
  if (status === "ready" && transition !== "retry" && cycleNumber > budget.max_cycles) addBlock(blocks, "CAMPAIGN_CYCLE_BUDGET_EXHAUSTED");
  if (status === "ready" && transition === "retry" && retryCount > budget.max_retries_per_cycle) addBlock(blocks, "CAMPAIGN_RETRY_BUDGET_EXHAUSTED");
  if (status === "ready" && budget.failed_experiments > 0 && budget.failed_experiments >= budget.max_failed_experiments) {
    addBlock(blocks, "CAMPAIGN_FAILED_EXPERIMENT_BUDGET_EXHAUSTED");
  }
  if (status === "ready" && budget.consecutive_no_progress_cycles >= budget.max_no_progress_cycles) addBlock(blocks, "CAMPAIGN_NO_PROGRESS_LIMIT_REACHED");
  if (status === "ready" && budget.elapsed_minutes >= budget.max_elapsed_minutes) addBlock(blocks, "CAMPAIGN_ELAPSED_TIME_BUDGET_EXHAUSTED");

  if (campaign.status !== "active") {
    if (campaign.status === "paused") {
      status = "awaiting_human";
      humanDecisionRequired = true;
      requiredHumanDecision = "Resume, revise, or terminate the paused campaign.";
    } else if (campaign.status === "terminated") {
      status = "terminated";
      humanDecisionRequired = true;
      requiredHumanDecision = "Open a new bounded campaign before further autonomous work.";
    } else if (campaign.status === "complete" && latest && latest.decision.payload.decision === "complete") {
      status = "completed";
      humanDecisionRequired = true;
      requiredHumanDecision = "Approve or reject merge, push, or release through the separate human-controlled gate.";
    } else {
      addBlock(blocks, "CAMPAIGN_NOT_ACTIVE");
    }
    if (status !== "blocked") {
      transition = "hold";
      checkpointTrigger = "manual";
      taskOrder = holdTaskOrder(campaign, requiredHumanDecision);
    }
  }

  const projectedProofRequirements = proofRequirements(campaign);
  const dispatchProjection = {
    campaign_id: campaign.id,
    mission_id: campaign.mission_id,
    repository_binding: {
      repository_key: repository.key,
      identity_fingerprint: repository.identity_fingerprint
    },
    cycle_number: cycleNumber,
    attempt_number: attemptNumber,
    baseline_revision: baselineRevision,
    parent_decision_ref: clone(parentRef),
    source_checkpoint_ref: clone(sourceCheckpointRef),
    source_decision_ref: clone(sourceDecisionRef),
    transition,
    checkpoint_trigger: checkpointTrigger,
    task_order: clone(taskOrder),
    proof_requirements: projectedProofRequirements
  };
  const trustPolicyAdmission = evaluateVerifierTrustReadiness({
    campaign,
    repository,
    trustPolicy,
    identityEvidence,
    sigstoreIdentityEvidence,
    sigstoreTrustedRoots,
    runtimePolicy,
    challengeSets,
    existingOrders,
    dispatchOrder: dispatchProjection,
    manifestHistory: store.manifestHistory,
    currentManifestRevision: store.verification.manifest_revision,
    evaluatedAt,
    blockingCodes: trustPolicyBlockingCodes
  });
  if (status === "ready") {
    for (const code of trustPolicyAdmission.blocking_codes) addBlock(blocks, code);
  }

  if (blocks.length > 0) {
    status = "blocked";
    transition = "hold";
    checkpointTrigger = "manual";
    humanDecisionRequired = true;
    requiredHumanDecision = "Correct the manifest-backed campaign chain or revise the campaign budget before resumption.";
    taskOrder = holdTaskOrder(campaign, requiredHumanDecision);
  }

  const generatedAt = evaluatedAt;
  const order = {
    schema_version: trustPolicy && ["0.5", "0.6"].includes(trustPolicy.schema_version)
      ? trustPolicy.schema_version
      : trustPolicy && ["0.3", "0.4"].includes(trustPolicy.schema_version) ? "0.4" : "0.3",
    type: "SelfImprovementCycleOrder",
    id: orderId(campaign.id, cycleNumber, attemptNumber, transition, status, trustPolicyAdmission),
    campaign_id: campaign.id,
    mission_id: campaign.mission_id,
    repository_binding: {
      repository_key: repository.key,
      identity_fingerprint: repository.identity_fingerprint
    },
    campaign_ref: artifactRef(campaignEntry),
    observed_manifest: {
      revision: store.verification.manifest_revision,
      sha256: store.verification.manifest_sha256
    },
    status,
    transition,
    cycle_number: cycleNumber,
    attempt_number: attemptNumber,
    baseline_revision: baselineRevision,
    parent_decision_ref: parentRef,
    source_checkpoint_ref: sourceCheckpointRef,
    source_decision_ref: sourceDecisionRef,
    checkpoint_trigger: checkpointTrigger,
    task_order: taskOrder,
    proof_requirements: projectedProofRequirements,
    trust_policy_admission: trustPolicyAdmission,
    budget_snapshot: budget,
    execution_authorized: status === "ready",
    release_authorized: false,
    human_decision_required: humanDecisionRequired,
    required_human_decision: requiredHumanDecision,
    blocking_codes: blocks.sort(),
    generated_at: generatedAt
  };
  Object.defineProperty(order, "_dispatchProjection", { value: dispatchProjection, enumerable: false });
  return order;
}

function comparableOrder(order) {
  const copy = clone(order);
  if (copy.proof_requirements && copy.proof_requirements.comparative_evaluation_required_for === undefined) {
    copy.proof_requirements.comparative_evaluation_required_for = [];
  }
  delete copy.observed_manifest;
  delete copy.generated_at;
  if (copy.trust_policy_admission) delete copy.trust_policy_admission.evaluated_at;
  return copy;
}

function selectIdempotentOrder(proposed, existingOrders) {
  const matching = existingOrders.filter(item => item.payload.id === proposed.id);
  if (matching.length === 0) return null;
  if (matching.length > 1) throw new Error(`Duplicate persisted cycle order ID: ${proposed.id}.`);
  if (JSON.stringify(comparableOrder(matching[0].payload)) !== JSON.stringify(comparableOrder(proposed))) {
    throw new Error(`Persisted cycle order ${proposed.id} conflicts with the reconstructed campaign state.`);
  }
  return matching[0].payload;
}

function superviseCampaign(options) {
  if (!options || !options.repositoryPath || !options.campaignId) {
    throw new Error("repositoryPath and campaignId are required.");
  }
  let store = loadVerifiedStore(options.repositoryPath, options.artifactRoot);
  let history = loadCampaignHistory(store, options.campaignId);
  let proposed = deriveOrder(store, history, options.evaluatedAt);
  let issuedChallenge = null;
  const challengeBootstrapCodes = new Set([
    "TRUST_ADMISSION_CHALLENGE_SET_UNAVAILABLE",
    "TRUST_ADMISSION_CHALLENGE_RESPONSE_UNAVAILABLE",
    "TRUST_ADMISSION_RECEIPT_QUORUM_UNAVAILABLE",
    "TRUST_ADMISSION_COMPARATIVE_QUORUM_UNAVAILABLE",
    "TRUST_ADMISSION_WORKLOAD_IDENTITY_UNAVAILABLE"
  ]);
  const mayIssueChallenge = options.writeArtifact && history.trustPolicy &&
    ["0.5", "0.6"].includes(history.trustPolicy.schema_version) && proposed._dispatchProjection.transition !== "hold" &&
    proposed.blocking_codes.length > 0 && proposed.blocking_codes.every(code => challengeBootstrapCodes.has(code)) &&
    proposed.blocking_codes.includes("TRUST_ADMISSION_CHALLENGE_SET_UNAVAILABLE");
  if (mayIssueChallenge) {
    if (!options.challengeIssuerPrivateKeyPem) {
      throw new Error("Trust-policy v0.5+ challenge issuance requires --challenge-private-key with the policy-pinned supervisor Ed25519 private key.");
    }
    const challenge = createVerifierChallengeSet({
      campaign: history.campaign,
      trustPolicy: history.trustPolicy,
      order: proposed._dispatchProjection,
      repository: store.verification.repository,
      observedManifest: {
        revision: store.verification.manifest_revision,
        sha256: store.verification.manifest_sha256
      },
      issuedAt: options.evaluatedAt,
      issuerPrivateKeyPem: options.challengeIssuerPrivateKeyPem
    });
    issuedChallenge = writeRepositoryArtifact({
      repositoryPath: options.repositoryPath,
      artifactRoot: options.artifactRoot,
      missionId: challenge.mission_id,
      waveId: `C${challenge.dispatch_binding.cycle_number}`,
      kind: "verifier-challenge-sets",
      artifactId: challenge.id,
      payload: challenge,
      createdAt: challenge.issued_at
    });
    store = loadVerifiedStore(options.repositoryPath, options.artifactRoot);
    history = loadCampaignHistory(store, options.campaignId);
    proposed = deriveOrder(store, history, options.evaluatedAt);
  }
  const existing = selectIdempotentOrder(proposed, history.existingOrders);
  return { order: existing || proposed, existing: Boolean(existing), issuedChallenge, store, history };
}

function parseArgs(argv) {
  const options = { writeArtifact: false };
  const values = new Set(["repository", "artifact-root", "campaign", "challenge-private-key"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-artifact") {
      options.writeArtifact = true;
      continue;
    }
    if (arg.startsWith("--") && values.has(arg.slice(2))) {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      if (arg === "--repository") options.repositoryPath = argv[index];
      if (arg === "--artifact-root") options.artifactRoot = argv[index];
      if (arg === "--campaign") options.campaignId = argv[index];
      if (arg === "--challenge-private-key") options.challengePrivateKeyPath = argv[index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.repositoryPath || !options.campaignId) {
    throw new Error("Usage: node campaign-supervisor.js --repository <repo> --campaign <id> [--artifact-root <dir>] [--challenge-private-key <pem>] [--write-artifact]");
  }
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.challengePrivateKeyPath) {
      const keyPath = path.resolve(options.challengePrivateKeyPath);
      const stat = fs.lstatSync(keyPath);
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
        throw new Error("Challenge issuer private key must be a regular non-symlink file with no group or other permissions.");
      }
      options.challengeIssuerPrivateKeyPem = fs.readFileSync(keyPath);
    }
    const result = superviseCampaign(options);
    let order = result.order;
    if (options.writeArtifact && !result.existing) {
      const writeResult = writeRepositoryArtifact({
        repositoryPath: options.repositoryPath,
        artifactRoot: options.artifactRoot,
        missionId: order.mission_id,
        waveId: `C${order.cycle_number}`,
        kind: "self-improvement-cycle-orders",
        artifactId: order.id,
        payload: order,
        createdAt: order.generated_at
      });
      console.error(`Artifact written: ${writeResult.relative_path}`);
    } else if (options.writeArtifact) {
      console.error(`Artifact already current: ${order.id}`);
    }
    if (result.issuedChallenge) console.error(`Challenge issued: ${result.issuedChallenge.relative_path}`);
    process.stdout.write(`${JSON.stringify(order, null, 2)}\n`);
    process.exit(["ready", "completed"].includes(order.status) ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = {
  deriveOrder,
  loadCampaignHistory,
  loadVerifiedStore,
  parseArgs,
  selectIdempotentOrder,
  superviseCampaign
};
