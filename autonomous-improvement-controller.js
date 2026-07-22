#!/usr/bin/env node

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const {
  parseArtifactWriteFlags,
  manifestDigest,
  resolveRepository,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { evaluateConsumption } = require("./approval-consumption-runner");
const { receiptDigest } = require("./verification-runner");
const { evaluateAttestationQuorum } = require("./verification-attestation");
const { evaluateComparativeAttestationQuorum } = require("./comparative-evaluation-attestation");
const { evaluateComparison, reportDigest } = require("./comparative-evaluation-runner");

const CHANGE_RANK = {
  local_reversible: 0,
  bounded_structural: 1,
  authority_affecting: 2,
  external_release: 3,
  destructive: 4
};

const CONTROL_PLANE_TARGETS = new Set(["runtime_control", "skill", "policy"]);
const COMPARATIVE_TARGETS = new Set(["runtime_control", "skill"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasItems(value) {
  return Array.isArray(value) && value.some(item => String(item).trim().length > 0 && !/^none$/i.test(String(item).trim()));
}

function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) return false;
  return !value.split(/[\\/]+/).includes("..");
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function normalizedMetric(value, direction) {
  const normalized = clamp(value);
  return direction === "minimize" ? 1 - normalized : normalized;
}

function scoreMetrics(campaign, checkpoint, blocks, verifiedReceiptIds = new Set()) {
  const dimensions = (campaign.quality_model && campaign.quality_model.dimensions) || [];
  const results = checkpoint.metric_results || [];
  const resultById = new Map(results.map(result => [result.dimension_id, result]));
  const dimensionIds = dimensions.map(dimension => dimension.id);
  const duplicateResultIds = results.map(result => result.dimension_id)
    .filter((id, index, all) => all.indexOf(id) !== index);

  if (new Set(dimensionIds).size !== dimensionIds.length) blocks.push("QUALITY_DIMENSION_DUPLICATE");
  if (duplicateResultIds.length > 0) blocks.push("METRIC_RESULT_DUPLICATE");
  for (const result of results) {
    if (!dimensionIds.includes(result.dimension_id)) blocks.push("METRIC_RESULT_UNKNOWN_DIMENSION");
  }

  const weightSum = dimensions.reduce((sum, dimension) => sum + Number(dimension.weight || 0), 0);
  if (Math.abs(weightSum - 1) > 0.000001) blocks.push("QUALITY_WEIGHTS_NOT_NORMALIZED");

  let weightedBefore = 0;
  let weightedAfter = 0;
  let allHardGatesPassed = true;

  for (const dimension of dimensions) {
    const result = resultById.get(dimension.id);
    if (!result) {
      blocks.push("METRIC_RESULT_MISSING");
      allHardGatesPassed = false;
      continue;
    }
    if (result.before < 0 || result.before > 1 || result.after < 0 || result.after > 1) {
      blocks.push("METRIC_NOT_NORMALIZED");
    }
    if (!hasItems(result.evidence_receipt_ids) ||
        result.evidence_receipt_ids.some(id => !verifiedReceiptIds.has(id))) {
      blocks.push("METRIC_WITHOUT_VERIFIED_RECEIPT");
    }
    const targetPassed = dimension.direction === "minimize"
      ? result.after <= dimension.target
      : result.after >= dimension.target;
    if (dimension.hard_gate && (result.hard_gate_passed !== true || !targetPassed)) {
      allHardGatesPassed = false;
      blocks.push("HARD_QUALITY_GATE_FAILED");
    }
    weightedBefore += normalizedMetric(result.before, dimension.direction) * dimension.weight;
    weightedAfter += normalizedMetric(result.after, dimension.direction) * dimension.weight;
  }

  return {
    weighted_before: Number(weightedBefore.toFixed(6)),
    weighted_after: Number(weightedAfter.toFixed(6)),
    weighted_delta: Number((weightedAfter - weightedBefore).toFixed(6)),
    minimum_delta: campaign.budgets ? campaign.budgets.min_weighted_improvement : 0,
    all_hard_gates_passed: allHardGatesPassed
  };
}

function requiresHumanDecision(campaign, checkpoint) {
  const externalities = checkpoint.externalities || {};
  const candidate = checkpoint.candidate || {};
  const targetType = checkpoint.target && checkpoint.target.target_type;
  const boundedStructuralBeyondEnvelope = CHANGE_RANK[candidate.change_class] > CHANGE_RANK[(campaign.authority_envelope || {}).max_change_class];

  return {
    required: Boolean(
      boundedStructuralBeyondEnvelope ||
      externalities.scope_changed ||
      externalities.authority_changed ||
      externalities.policy_changed ||
      externalities.release_requested ||
      candidate.change_class === "authority_affecting" ||
      candidate.change_class === "external_release" ||
      targetType === "policy"
    ),
    fatal: Boolean(externalities.destructive_action || externalities.cross_repository_write || candidate.change_class === "destructive")
  };
}

function approvalCoversCheckpoint(campaign, checkpoint, proofContext) {
  const binding = checkpoint.approval_binding || {};
  const candidate = checkpoint.candidate || {};
  const approval = proofContext.approvalScope;
  const event = proofContext.consumptionEvent;
  const expectedAction = "promote_self_improvement_candidate";
  const expectedTool = "autonomous-improvement-controller";
  if (binding.required !== true || !approval || !event) return { valid: false, codes: ["APPROVAL_PROOF_MISSING"] };
  const approvalValidation = validatePayload(approval, "approval-scope");
  const eventValidation = validatePayload(event, "approval-consumption-event");
  const schemaFailures = [...approvalValidation.issues, ...eventValidation.issues]
    .filter(item => item.severity === "error" || item.severity === "critical");
  const consumption = evaluateConsumption(approval, event);
  const codes = consumption.issues.map(item => item.code);
  if (schemaFailures.length > 0) codes.push("APPROVAL_LEDGER_SCHEMA_INVALID");
  if (binding.action !== expectedAction || binding.tool !== expectedTool || binding.target !== candidate.id) codes.push("APPROVAL_BINDING_SCOPE_INVALID");
  if (approval.granted_by !== "USER" || approval.granted_to !== campaign.command_team.improvement_controller) codes.push("APPROVAL_AUTHORITY_INVALID");
  if (event.action !== binding.action || event.tool !== binding.tool || event.target !== binding.target) codes.push("APPROVAL_CONSUMPTION_BINDING_MISMATCH");
  if (event.result !== "executed" || event.approval_status_after !== "consumed") codes.push("APPROVAL_NOT_CONSUMED_BY_EXECUTION");
  if (event.execution_id !== checkpoint.id || event.execution_count_after > approval.scope.max_executions) codes.push("APPROVAL_CONSUMPTION_NOT_UNIQUE_TO_CHECKPOINT");
  if (Date.parse(event.consumed_at) > Date.parse(checkpoint.generated_at)) codes.push("APPROVAL_CONSUMED_AFTER_CHECKPOINT");
  if (binding.approval_scope_ref.artifact_id !== approval.id || binding.consumption_event_ref.artifact_id !== event.id) codes.push("APPROVAL_REFERENCE_ID_MISMATCH");
  return { valid: codes.length === 0, codes: [...new Set(codes)] };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isNoneReference(ref) {
  return ref && ref.artifact_id === "none" && ref.relative_path === "none" && ref.sha256 === "none";
}

function readManifestArtifact(artifactRoot, manifest, ref, expectedKind) {
  if (!ref || !safeRelativePath(ref.relative_path) || ref.sha256 === "none") {
    throw new Error(`Invalid ${expectedKind} artifact reference.`);
  }
  const entry = (manifest.artifacts || []).find(item => item.relative_path === ref.relative_path);
  if (!entry || entry.kind !== expectedKind || entry.artifact_id !== ref.artifact_id || entry.sha256 !== ref.sha256) {
    throw new Error(`${expectedKind} artifact reference does not match the repository manifest.`);
  }
  const root = path.resolve(artifactRoot);
  const filePath = path.resolve(root, ref.relative_path);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) throw new Error(`${expectedKind} artifact reference escapes the artifact root.`);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${expectedKind} artifact reference is not a regular file.`);
  const bytes = fs.readFileSync(filePath);
  if (sha256(bytes) !== ref.sha256) throw new Error(`${expectedKind} artifact bytes do not match the manifest hash.`);
  return JSON.parse(bytes.toString("utf8"));
}

function loadProofContext(campaign, checkpoint, repositoryPath, artifactRootOption) {
  const verification = verifyRepositoryArtifacts({ repositoryPath, artifactRoot: artifactRootOption });
  if (!verification.valid) {
    throw new Error(`Repository proof store failed integrity verification: ${verification.issues.map(item => item.code).join(", ")}`);
  }
  const artifactRoot = path.resolve(artifactRootOption || path.join(process.cwd(), ".cannae", "artifacts"));
  const manifestPath = path.join(artifactRoot, "repositories", verification.repository.key, "manifest.json");
  const manifest = readJson(manifestPath);
  if (manifestDigest(manifest) !== verification.manifest_sha256) {
    throw new Error("Repository proof manifest changed after integrity verification.");
  }
  const receipts = new Map();
  for (const ref of checkpoint.verification_receipts || []) {
    receipts.set(ref.receipt_id, readManifestArtifact(artifactRoot, manifest, {
      artifact_id: ref.receipt_id,
      relative_path: ref.relative_path,
      sha256: ref.sha256
    }, "verification-receipts"));
  }
  let parentDecision = null;
  if (checkpoint.cycle_number > 1) {
    parentDecision = readManifestArtifact(artifactRoot, manifest, {
      artifact_id: checkpoint.parent_decision_ref.decision_id,
      relative_path: checkpoint.parent_decision_ref.relative_path,
      sha256: checkpoint.parent_decision_ref.sha256
    }, "self-improvement-decisions");
  }
  let approvalScope = null;
  let consumptionEvent = null;
  if (checkpoint.approval_binding && checkpoint.approval_binding.required) {
    approvalScope = readManifestArtifact(artifactRoot, manifest, checkpoint.approval_binding.approval_scope_ref, "approval-scopes");
    consumptionEvent = readManifestArtifact(artifactRoot, manifest, checkpoint.approval_binding.consumption_event_ref, "approval-consumption-events");
  }
  let trustPolicy = null;
  let runtimePolicy = null;
  const attestations = new Map();
  const executionEvidence = new Map();
  const nativeProviderEvidence = new Map();
  const nativeTrustBundles = new Map();
  function loadNativeEvidence(execution) {
    if (!execution || !execution.native_provider_evidence_ref) return;
    const providerContracts = {
      github_actions: {
        evidenceKind: "github-actions-oidc-evidence",
        evidenceType: "github-actions-oidc-evidence",
        trustBundleKind: "github-actions-oidc-trust-bundles",
        trustBundleType: "github-actions-oidc-trust-bundle",
        label: "GitHub Actions"
      },
      gitlab_ci: {
        evidenceKind: "gitlab-ci-oidc-evidence",
        evidenceType: "gitlab-ci-oidc-evidence",
        trustBundleKind: "gitlab-ci-oidc-trust-bundles",
        trustBundleType: "gitlab-ci-oidc-trust-bundle",
        label: "GitLab CI"
      }
    };
    const contract = providerContracts[execution.provider];
    if (!contract) throw new Error(`Unsupported native provider evidence: ${execution.provider || "missing"}`);
    const native = readManifestArtifact(
      artifactRoot,
      manifest,
      execution.native_provider_evidence_ref,
      contract.evidenceKind
    );
    const nativeValidation = validatePayload(native, contract.evidenceType);
    if (nativeValidation.issues.some(item => item.severity === "error" || item.severity === "critical")) {
      throw new Error(`${contract.label} OIDC evidence failed schema or semantic validation.`);
    }
    nativeProviderEvidence.set(native.id, native);
    if (native.trust_bundle_ref && !nativeTrustBundles.has(native.trust_bundle_ref.artifact_id)) {
      const bundle = readManifestArtifact(
        artifactRoot,
        manifest,
        native.trust_bundle_ref,
        contract.trustBundleKind
      );
      const bundleValidation = validatePayload(bundle, contract.trustBundleType);
      if (bundleValidation.issues.some(item => item.severity === "error" || item.severity === "critical")) {
        throw new Error(`${contract.label} OIDC trust bundle failed schema or semantic validation.`);
      }
      nativeTrustBundles.set(native.trust_bundle_ref.artifact_id, bundle);
    }
  }
  if (["0.3", "0.4"].includes(campaign.schema_version) || (campaign.attestation_policy && campaign.attestation_policy.required)) {
    trustPolicy = readManifestArtifact(artifactRoot, manifest, campaign.attestation_policy.trust_policy_ref, "verifier-trust-policies");
    if (["0.4", "0.5", "0.6", "0.7"].includes(trustPolicy.schema_version)) {
      runtimePolicy = readManifestArtifact(
        artifactRoot,
        manifest,
        trustPolicy.execution_assurance.runtime_policy_ref,
        "verifier-runtime-policies"
      );
    }
    for (const ref of checkpoint.verification_attestations || []) {
      const attestation = readManifestArtifact(artifactRoot, manifest, {
        artifact_id: ref.attestation_id,
        relative_path: ref.relative_path,
        sha256: ref.sha256
      }, "verification-attestations");
      attestations.set(ref.attestation_id, attestation);
      if (["0.4", "0.5", "0.6", "0.7"].includes(trustPolicy.schema_version) && attestation.execution_evidence_ref) {
        const execution = readManifestArtifact(
          artifactRoot,
          manifest,
          attestation.execution_evidence_ref,
          "verifier-execution-evidence"
        );
        executionEvidence.set(attestation.execution_evidence_ref.artifact_id, execution);
        loadNativeEvidence(execution);
      }
    }
  }
  let comparativeReport = null;
  let comparativePlan = null;
  let comparativeEvaluationSet = null;
  const comparativeAttestations = new Map();
  if (checkpoint.comparative_evaluation_ref && checkpoint.comparative_evaluation_ref.required) {
    const ref = checkpoint.comparative_evaluation_ref;
    comparativeReport = readManifestArtifact(artifactRoot, manifest, {
      artifact_id: ref.report_id,
      relative_path: ref.relative_path,
      sha256: ref.sha256
    }, "comparative-evaluation-reports");
    comparativePlan = readManifestArtifact(artifactRoot, manifest, comparativeReport.plan_ref, "comparative-evaluation-plans");
    comparativeEvaluationSet = readManifestArtifact(artifactRoot, manifest, comparativeReport.evaluation_set_ref, "comparative-evaluation-sets");
    if (campaign.schema_version === "0.4") {
      for (const attestationRef of checkpoint.comparative_evaluation_attestations || []) {
        const attestation = readManifestArtifact(artifactRoot, manifest, {
          artifact_id: attestationRef.attestation_id,
          relative_path: attestationRef.relative_path,
          sha256: attestationRef.sha256
        }, "comparative-evaluation-attestations");
        comparativeAttestations.set(attestationRef.attestation_id, attestation);
        if (trustPolicy && ["0.4", "0.5", "0.6", "0.7"].includes(trustPolicy.schema_version) && attestation.execution_evidence_ref &&
            !executionEvidence.has(attestation.execution_evidence_ref.artifact_id)) {
          const execution = readManifestArtifact(
            artifactRoot,
            manifest,
            attestation.execution_evidence_ref,
            "verifier-execution-evidence"
          );
          executionEvidence.set(attestation.execution_evidence_ref.artifact_id, execution);
          loadNativeEvidence(execution);
        }
      }
    }
  }
  return {
    receipts,
    attestations,
    trustPolicy,
    runtimePolicy,
    executionEvidence,
    nativeProviderEvidence,
    nativeTrustBundles,
    parentDecision,
    approvalScope,
    consumptionEvent,
    comparativeReport,
    comparativePlan,
    comparativeEvaluationSet,
    comparativeAttestations,
    manifestRevision: verification.manifest_revision,
    manifestSha256: verification.manifest_sha256
  };
}

function verifyComparativeEvaluation(campaign, checkpoint, proofContext, blocks) {
  const target = checkpoint.target || {};
  if (!COMPARATIVE_TARGETS.has(target.target_type)) return { valid: true, rollbackRequired: false, reportId: "none" };
  const initialBlockCount = blocks.length;
  const policy = campaign.comparative_evaluation_policy;
  const ref = checkpoint.comparative_evaluation_ref || {};
  const report = proofContext.comparativeReport;
  const plan = proofContext.comparativePlan;
  const evaluationSet = proofContext.comparativeEvaluationSet;
  const expectedPurpose = checkpoint.trigger === "before_completion" ? "completion_revalidation" : "candidate_promotion";
  if (!policy) {
    blocks.push("COMPARATIVE_EVALUATION_POLICY_MISSING");
    return { valid: false, rollbackRequired: false, reportId: report && report.id ? report.id : "none" };
  }
  if (ref.required !== true || ref.report_id === "none" || !report || !plan || !evaluationSet) {
    blocks.push("COMPARATIVE_CANARY_EVIDENCE_MISSING");
    return { valid: false, rollbackRequired: false, reportId: "none" };
  }
  const schemaIssues = [
    ...validatePayload(report, "comparative-evaluation-report").issues,
    ...validatePayload(plan, "comparative-evaluation-plan").issues,
    ...validatePayload(evaluationSet, "comparative-evaluation-set").issues
  ].filter(item => item.severity === "error" || item.severity === "critical");
  if (schemaIssues.length > 0 || report.report_sha256 !== reportDigest(report)) {
    blocks.push("COMPARATIVE_CANARY_INTEGRITY_INVALID");
    return { valid: false, rollbackRequired: false, reportId: report.id || "none" };
  }
  if (report.id !== ref.report_id || report.campaign_id !== campaign.id || report.mission_id !== campaign.mission_id ||
      report.cycle_number !== checkpoint.cycle_number || report.target_type !== target.target_type ||
      report.repository_binding.repository_key !== checkpoint.repository_binding.repository_key ||
      report.repository_binding.identity_fingerprint !== checkpoint.repository_binding.identity_fingerprint ||
      plan.id !== report.plan_ref.artifact_id || plan.campaign_id !== campaign.id || plan.mission_id !== campaign.mission_id ||
      plan.cycle_number !== checkpoint.cycle_number || plan.target_type !== target.target_type || plan.evaluation_purpose !== expectedPurpose ||
      !sameJson(plan.evaluation_set_ref, report.evaluation_set_ref) ||
      evaluationSet.id !== report.evaluation_set_ref.artifact_id ||
      evaluationSet.campaign_id !== campaign.id || evaluationSet.mission_id !== campaign.mission_id ||
      plan.subjects.baseline.revision !== target.baseline_revision ||
      plan.subjects.candidate.candidate_id !== checkpoint.candidate.id ||
      plan.subjects.candidate.revision !== target.candidate_revision) {
    blocks.push("COMPARATIVE_CANARY_BINDING_INVALID");
  }
  if (Date.parse(evaluationSet.created_at) > Date.parse(plan.created_at) ||
      Date.parse(plan.created_at) > Date.parse(report.started_at)) {
    blocks.push("COMPARATIVE_CANARY_TIME_SEQUENCE_INVALID");
  }
  if (report.evaluator.role !== campaign.command_team.independent_evaluator ||
      report.evaluator.role === campaign.command_team.improvement_controller ||
      !sameJson(report.evaluator, plan.independent_evaluator)) {
    blocks.push("COMPARATIVE_CANARY_EVALUATOR_INVALID");
  }
  const ageSeconds = (Date.parse(checkpoint.generated_at) - Date.parse(report.finished_at)) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > policy.max_report_age_seconds) {
    blocks.push("COMPARATIVE_CANARY_REPORT_STALE");
  }
  const recomputed = evaluateComparison(campaign, plan, evaluationSet, report.evaluation_set_ref.sha256, report.executions);
  if (recomputed.outcome !== report.outcome || !sameJson(recomputed.comparisons, report.comparisons) ||
      !sameJson(recomputed.blocking_codes, report.blocking_codes)) {
    blocks.push("COMPARATIVE_CANARY_RECOMPUTATION_MISMATCH");
  }
  const metrics = new Map((checkpoint.metric_results || []).map(item => [item.dimension_id, item]));
  for (const comparison of report.comparisons || []) {
    const metric = metrics.get(comparison.dimension_id);
    if (!metric || metric.before !== comparison.baseline_value || metric.after !== comparison.candidate_value ||
        metric.hard_gate_passed !== comparison.passed) {
      blocks.push("COMPARATIVE_CANARY_METRIC_MISMATCH");
      break;
    }
  }
  if ((report.comparisons || []).length !== metrics.size) blocks.push("COMPARATIVE_CANARY_METRIC_MISMATCH");
  if (report.execution_authorized !== false || report.release_authorized !== false) blocks.push("COMPARATIVE_CANARY_AUTHORITY_INVALID");
  if (report.outcome === "inconclusive") blocks.push("COMPARATIVE_CANARY_INCONCLUSIVE");
  if (report.outcome === "rollback") blocks.push("COMPARATIVE_CANARY_ROLLBACK_REQUIRED");
  if (report.outcome === "promotable" && report.working_state_promotion_recommended !== true) blocks.push("COMPARATIVE_CANARY_PROMOTION_INVALID");
  const comparisonBlocks = blocks.slice(initialBlockCount);
  const comparisonInvalid = comparisonBlocks.some(code => code !== "COMPARATIVE_CANARY_ROLLBACK_REQUIRED");
  return {
    valid: report.outcome === "promotable" && comparisonBlocks.length === 0,
    rollbackRequired: report.outcome === "rollback" && !comparisonInvalid,
    reportId: report.id
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function verifyReceiptProof(campaign, checkpoint, proofContext, blocks) {
  const verified = new Set();
  let executedFailure = false;
  for (const ref of checkpoint.verification_receipts || []) {
    const receipt = proofContext.receipts && proofContext.receipts.get
      ? proofContext.receipts.get(ref.receipt_id)
      : (proofContext.receipts || []).find(item => item.id === ref.receipt_id);
    if (!receipt) {
      blocks.push("VERIFICATION_RECEIPT_MISSING");
      continue;
    }
    const validation = validatePayload(receipt, "verification-receipt");
    if (validation.issues.some(item => item.severity === "error" || item.severity === "critical") || receipt.receipt_sha256 !== receiptDigest(receipt)) {
      blocks.push("VERIFICATION_RECEIPT_INTEGRITY_INVALID");
      continue;
    }
    if (receipt.id !== ref.receipt_id || receipt.plan_id !== ref.plan_id ||
        receipt.campaign_id !== campaign.id || receipt.mission_id !== campaign.mission_id ||
        receipt.cycle_number !== checkpoint.cycle_number || receipt.candidate_id !== checkpoint.candidate.id ||
        receipt.candidate_revision !== checkpoint.target.candidate_revision ||
        receipt.repository_binding.repository_key !== checkpoint.repository_binding.repository_key ||
        receipt.repository_binding.identity_fingerprint !== checkpoint.repository_binding.identity_fingerprint) {
      blocks.push("VERIFICATION_RECEIPT_BINDING_INVALID");
      continue;
    }
    const checks = new Map((receipt.checks || []).map(item => [item.id, item]));
    if ((ref.required_check_ids || []).some(id => !checks.has(id))) {
      blocks.push("VERIFICATION_REQUIRED_CHECK_MISSING");
      continue;
    }
    const requiredFailed = ref.required_check_ids.some(id => checks.get(id).status !== "passed");
    if (receipt.overall_status !== "passed" || receipt.repository_state_unchanged !== true || requiredFailed) {
      blocks.push("VERIFICATION_EXECUTION_FAILED");
      executedFailure = true;
      continue;
    }
    if (Date.parse(receipt.finished_at) > Date.parse(checkpoint.generated_at)) {
      blocks.push("VERIFICATION_RECEIPT_AFTER_CHECKPOINT");
      continue;
    }
    verified.add(receipt.id);
  }
  if (verified.size === 0 && !executedFailure) blocks.push("VERIFICATION_PROOF_MISSING");
  return { verified, executedFailure };
}

function verifyAttestationProof(campaign, checkpoint, proofContext, verifiedReceiptIds, blocks) {
  if (!["0.3", "0.4"].includes(campaign.schema_version)) {
    return { valid: true, valid_attestation_ids: [], verifier_ids: [], key_ids: [], independence_groups: [] };
  }
  const policy = campaign.attestation_policy || {};
  const trustPolicy = proofContext.trustPolicy;
  const refs = checkpoint.verification_attestations || [];
  const attestations = [];
  if (checkpoint.schema_version !== campaign.schema_version) blocks.push("ATTESTATION_CHECKPOINT_VERSION_MISMATCH");
  if (!trustPolicy) {
    blocks.push("ATTESTATION_TRUST_POLICY_MISSING");
    return { valid: false, valid_attestation_ids: [], verifier_ids: [], key_ids: [], independence_groups: [] };
  }
  const trustValidation = validatePayload(trustPolicy, "verifier-trust-policy");
  if (trustValidation.issues.some(item => item.severity === "error" || item.severity === "critical")) {
    blocks.push("ATTESTATION_TRUST_POLICY_INVALID");
  }
  if (trustPolicy.id !== policy.trust_policy_ref.artifact_id ||
      trustPolicy.repository_binding.repository_key !== checkpoint.repository_binding.repository_key ||
      trustPolicy.repository_binding.identity_fingerprint !== checkpoint.repository_binding.identity_fingerprint ||
      Date.parse(checkpoint.generated_at) < Date.parse(trustPolicy.created_at) ||
      Date.parse(checkpoint.generated_at) >= Date.parse(trustPolicy.expires_at)) {
    blocks.push("ATTESTATION_TRUST_POLICY_BINDING_INVALID");
  }
  const receiptReferences = Object.fromEntries((checkpoint.verification_receipts || []).map(ref => {
    const receipt = proofContext.receipts && proofContext.receipts.get
      ? proofContext.receipts.get(ref.receipt_id)
      : (proofContext.receipts || []).find(item => item.id === ref.receipt_id);
    return [ref.receipt_id, {
      relative_path: ref.relative_path,
      sha256: ref.sha256,
      receipt_sha256: receipt && receipt.receipt_sha256,
      repository_state: receipt && receipt.repository_state_before,
      verification_target: receipt && receipt.repository_state_before ? {
        name: receipt.candidate_id,
        digest: { sha256: receipt.repository_state_before.worktree_fingerprint }
      } : undefined
    }];
  }));
  for (const ref of refs) {
    const attestation = proofContext.attestations && proofContext.attestations.get
      ? proofContext.attestations.get(ref.attestation_id)
      : (proofContext.attestations || []).find(item => item.id === ref.attestation_id);
    if (!attestation) {
      blocks.push("ATTESTATION_ARTIFACT_MISSING");
      continue;
    }
    const validation = validatePayload(attestation, "verification-attestation");
    if (validation.issues.some(item => item.severity === "error" || item.severity === "critical")) {
      blocks.push("ATTESTATION_ARTIFACT_INVALID");
    }
    if (attestation.id !== ref.attestation_id || attestation.receipt_id !== ref.receipt_id ||
        attestation.verifier_id !== ref.verifier_id || !verifiedReceiptIds.has(ref.receipt_id)) {
      blocks.push("ATTESTATION_REFERENCE_BINDING_INVALID");
    }
    attestations.push(attestation);
  }
  const result = evaluateAttestationQuorum(attestations, trustPolicy, {
    receiptReferences,
    campaignId: campaign.id,
    missionId: campaign.mission_id,
    cycleNumber: checkpoint.cycle_number,
    candidateId: checkpoint.candidate.id,
    candidateRevision: checkpoint.target.candidate_revision,
    repositoryKey: checkpoint.repository_binding.repository_key,
    maxAttestationAgeSeconds: policy.max_attestation_age_seconds,
    runtimePolicy: proofContext.runtimePolicy,
    runtimePolicyReference: trustPolicy.execution_assurance && trustPolicy.execution_assurance.runtime_policy_ref,
    executionEvidence: proofContext.executionEvidence,
    nativeProviderEvidence: proofContext.nativeProviderEvidence,
    nativeTrustBundles: proofContext.nativeTrustBundles
  }, policy, checkpoint.generated_at);
  blocks.push(...result.codes);
  return result;
}

function verifyComparativeAttestationProof(campaign, checkpoint, proofContext, blocks) {
  const target = checkpoint.target || {};
  if (campaign.schema_version !== "0.4" || !COMPARATIVE_TARGETS.has(target.target_type)) {
    return { valid: true, valid_attestation_ids: [], verifier_ids: [], key_ids: [], independence_groups: [] };
  }
  const policy = campaign.attestation_policy || {};
  const trustPolicy = proofContext.trustPolicy;
  const report = proofContext.comparativeReport;
  const plan = proofContext.comparativePlan;
  const reportRef = checkpoint.comparative_evaluation_ref || {};
  const refs = checkpoint.comparative_evaluation_attestations || [];
  const attestations = [];
  if (checkpoint.schema_version !== "0.4") blocks.push("COMPARATIVE_ATTESTATION_CHECKPOINT_VERSION_MISMATCH");
  if (!trustPolicy) {
    blocks.push("COMPARATIVE_ATTESTATION_TRUST_POLICY_MISSING");
    return { valid: false, valid_attestation_ids: [], verifier_ids: [], key_ids: [], independence_groups: [] };
  }
  if (!report || !plan) {
    blocks.push("COMPARATIVE_ATTESTATION_REPORT_MISSING");
    return { valid: false, valid_attestation_ids: [], verifier_ids: [], key_ids: [], independence_groups: [] };
  }
  for (const ref of refs) {
    const attestation = proofContext.comparativeAttestations && proofContext.comparativeAttestations.get
      ? proofContext.comparativeAttestations.get(ref.attestation_id)
      : (proofContext.comparativeAttestations || []).find(item => item.id === ref.attestation_id);
    if (!attestation) {
      blocks.push("COMPARATIVE_ATTESTATION_ARTIFACT_MISSING");
      continue;
    }
    const validation = validatePayload(attestation, "comparative-evaluation-attestation");
    if (validation.issues.some(item => item.severity === "error" || item.severity === "critical")) {
      blocks.push("COMPARATIVE_ATTESTATION_ARTIFACT_INVALID");
    }
    if (attestation.id !== ref.attestation_id || attestation.report_id !== ref.report_id ||
        attestation.verifier_id !== ref.verifier_id || ref.report_id !== report.id) {
      blocks.push("COMPARATIVE_ATTESTATION_REFERENCE_BINDING_INVALID");
    }
    attestations.push(attestation);
  }
  const result = evaluateComparativeAttestationQuorum(attestations, trustPolicy, {
    reportId: report.id,
    reportRelativePath: reportRef.relative_path,
    reportSha256: reportRef.sha256,
    reportContentSha256: report.report_sha256,
    planId: plan.id,
    evaluationSetId: report.evaluation_set_ref.artifact_id,
    campaignId: campaign.id,
    missionId: campaign.mission_id,
    cycleNumber: checkpoint.cycle_number,
    targetType: target.target_type,
    baselineCandidateId: plan.subjects.baseline.candidate_id,
    baselineRevision: target.baseline_revision,
    candidateId: checkpoint.candidate.id,
    candidateRevision: target.candidate_revision,
    evaluatorId: report.evaluator.evaluator_id,
    evaluatorInvocationId: report.evaluator.invocation_id,
    repositoryKey: checkpoint.repository_binding.repository_key,
    repositoryFingerprint: checkpoint.repository_binding.identity_fingerprint,
    maxAttestationAgeSeconds: policy.max_attestation_age_seconds,
    runtimePolicy: proofContext.runtimePolicy,
    runtimePolicyReference: trustPolicy.execution_assurance && trustPolicy.execution_assurance.runtime_policy_ref,
    executionEvidence: proofContext.executionEvidence,
    nativeProviderEvidence: proofContext.nativeProviderEvidence,
    nativeTrustBundles: proofContext.nativeTrustBundles,
    repositoryState: report.executions && report.executions.candidate
      ? report.executions.candidate.repository_state_before
      : undefined,
    verificationTarget: {
      name: report.id,
      digest: { sha256: reportRef.sha256 }
    }
  }, policy, checkpoint.generated_at);
  blocks.push(...result.codes);
  return result;
}

function verifyParentDecision(campaign, checkpoint, proofContext, blocks) {
  if (checkpoint.cycle_number === 1) {
    if (checkpoint.parent_decision_id !== "none" || checkpoint.parent_decision_ref.decision_id !== "none" ||
        checkpoint.parent_decision_ref.relative_path !== "none" || checkpoint.parent_decision_ref.sha256 !== "none") {
      blocks.push("FIRST_CYCLE_PARENT_INVALID");
    }
    return;
  }
  const parent = proofContext.parentDecision;
  if (!parent) {
    blocks.push("PARENT_DECISION_PROOF_MISSING");
    return;
  }
  const validation = validatePayload(parent, "self-improvement-decision");
  if (validation.issues.some(item => item.severity === "error" || item.severity === "critical")) blocks.push("PARENT_DECISION_SCHEMA_INVALID");
  if (parent.id !== checkpoint.parent_decision_id || parent.id !== checkpoint.parent_decision_ref.decision_id ||
      parent.campaign_id !== campaign.id || parent.mission_id !== campaign.mission_id ||
      parent.cycle_number !== checkpoint.cycle_number - 1) blocks.push("PARENT_DECISION_BINDING_INVALID");
  if (parent.decision !== "accept_working_state" || parent.promotion_scope === "none") blocks.push("PARENT_DECISION_NOT_ACCEPTED");
  if (parent.accepted_revision !== checkpoint.target.baseline_revision) blocks.push("PARENT_BASELINE_REVISION_MISMATCH");
}

function baseTaskOrder(campaign, checkpoint, task, nextTrigger = "wave_end") {
  return {
    owner: (campaign.command_team && campaign.command_team.improvement_controller) || "COS",
    task,
    purpose: (campaign.objective && campaign.objective.intent) || "Advance the bounded campaign objective.",
    constraints: [
      "Stay inside the campaign authority envelope.",
      "Preserve every protected invariant.",
      "Do not release, merge, push, or expand authority without human approval."
    ],
    required_evidence: [
      "Repository-scoped checkpoint artifact.",
      "Runtime-issued verification receipts.",
      "Receipt-bound metric evidence compared with the declared baseline.",
      "For skill or runtime-control promotion, a manifest-backed baseline-versus-candidate report."
    ],
    next_checkpoint_trigger: nextTrigger
  };
}

function makeDecision(campaign, checkpoint, values) {
  return {
    schema_version: ["0.3", "0.4"].includes(campaign.schema_version) ? campaign.schema_version : "0.2",
    type: "SelfImprovementDecision",
    id: `SID-${String(checkpoint.id || "checkpoint").replace(/^[A-Z]+-/, "")}`,
    campaign_id: campaign.id,
    checkpoint_id: checkpoint.id,
    mission_id: campaign.mission_id,
    cycle_number: checkpoint.cycle_number,
    decision: values.decision,
    execution_authorized: values.executionAuthorized,
    promotion_scope: values.promotionScope,
    release_authorized: false,
    selected_candidate_id: checkpoint.candidate.id,
    accepted_revision: ["accept_working_state", "complete"].includes(values.decision)
      ? checkpoint.target.candidate_revision
      : "none",
    proof: values.proof,
    score: values.score,
    reasons: values.reasons,
    blocking_codes: [...new Set(values.blocks)].sort(),
    next_task_order: values.nextTaskOrder,
    human_decision_required: values.humanDecisionRequired,
    required_human_decision: values.requiredHumanDecision,
    decided_at: checkpoint.generated_at
  };
}

function analyzeImprovement(campaign, checkpoint, proofContext = {}) {
  campaign = campaign && typeof campaign === "object" && !Array.isArray(campaign) ? campaign : {};
  checkpoint = checkpoint && typeof checkpoint === "object" && !Array.isArray(checkpoint) ? checkpoint : {};
  const blocks = [];
  const reasons = [];
  const authority = campaign.authority_envelope || {};
  const budgets = campaign.budgets || {};
  const target = checkpoint.target || {};
  const candidate = checkpoint.candidate || {};
  const progress = checkpoint.progress || {};
  const independent = checkpoint.independent_evaluation || {};
  const externalities = checkpoint.externalities || {};
  proofContext = {
    receipts: new Map(),
    attestations: new Map(),
    comparativeAttestations: new Map(),
    executionEvidence: new Map(),
    nativeProviderEvidence: new Map(),
    nativeTrustBundles: new Map(),
    trustPolicy: null,
    runtimePolicy: null,
    parentDecision: null,
    approvalScope: null,
    consumptionEvent: null,
    manifestRevision: 0,
    manifestSha256: "none",
    ...proofContext
  };
  const proof = {
    verification_receipt_ids: [],
    comparative_evaluation_report_id: "none",
    parent_decision_id: checkpoint.parent_decision_id || "none",
    approval_consumption_event_id: proofContext.consumptionEvent ? proofContext.consumptionEvent.id : "none",
    repository_manifest_revision: proofContext.manifestRevision || 0,
    repository_manifest_sha256: proofContext.manifestSha256 || "none"
  };
  if (["0.3", "0.4"].includes(campaign.schema_version)) {
    proof.verification_attestation_ids = [];
    proof.verifier_key_ids = [];
    proof.verifier_independence_groups = [];
    proof.attestation_quorum_satisfied = false;
  }
  if (campaign.schema_version === "0.4") {
    proof.comparative_evaluation_attestation_ids = [];
    proof.comparative_verifier_key_ids = [];
    proof.comparative_verifier_independence_groups = [];
    proof.comparative_attestation_quorum_satisfied = false;
  }

  if (campaign.status !== "active") blocks.push("CAMPAIGN_NOT_ACTIVE");
  if (checkpoint.campaign_id !== campaign.id) blocks.push("CAMPAIGN_ID_MISMATCH");
  if (checkpoint.mission_id !== campaign.mission_id) blocks.push("MISSION_ID_MISMATCH");
  if (!campaign.repository_binding || !checkpoint.repository_binding ||
      checkpoint.repository_binding.repository_key !== campaign.repository_binding.repository_key ||
      checkpoint.repository_binding.identity_fingerprint !== campaign.repository_binding.identity_fingerprint) {
    blocks.push("REPOSITORY_BINDING_MISMATCH");
  }
  if (checkpoint.cycle_number > budgets.max_cycles) blocks.push("CYCLE_BUDGET_EXCEEDED");
  if (!(campaign.checkpoint_policy && (campaign.checkpoint_policy.required_triggers || []).includes(checkpoint.trigger))) {
    blocks.push("CHECKPOINT_TRIGGER_OUTSIDE_CAMPAIGN");
  }
  if (checkpoint.cycle_number === 1 && target.baseline_revision !== (campaign.repository_binding || {}).baseline_revision) {
    blocks.push("CAMPAIGN_BASELINE_REVISION_MISMATCH");
  }
  if (checkpoint.cycle_number > 1 && (!checkpoint.parent_decision_id || /^none$/i.test(checkpoint.parent_decision_id))) {
    blocks.push("PARENT_DECISION_MISSING");
  }
  verifyParentDecision(campaign, checkpoint, proofContext, blocks);
  if (progress.failed_experiments > budgets.max_failed_experiments) blocks.push("FAILED_EXPERIMENT_BUDGET_EXCEEDED");
  if (progress.consecutive_no_progress_cycles >= budgets.max_no_progress_cycles) blocks.push("NO_PROGRESS_LIMIT_REACHED");
  if (progress.elapsed_minutes > budgets.max_elapsed_minutes) blocks.push("ELAPSED_TIME_BUDGET_EXCEEDED");
  if (!(authority.autonomous_target_types || []).includes(target.target_type)) blocks.push("TARGET_OUTSIDE_AUTHORITY_ENVELOPE");
  if (target.state === "in_progress" && authority.may_modify_in_progress_work !== true) blocks.push("IN_PROGRESS_MODIFICATION_NOT_AUTHORIZED");
  if ((candidate.changed_files || []).length > budgets.max_changed_files_per_cycle) blocks.push("CHANGED_FILE_BUDGET_EXCEEDED");
  if ((candidate.changed_files || []).some(file => !safeRelativePath(file))) blocks.push("UNSAFE_CHANGED_FILE_PATH");
  if ((target.artifact_paths || []).some(file => !safeRelativePath(file))) blocks.push("UNSAFE_TARGET_ARTIFACT_PATH");
  if (new Set(candidate.changed_files || []).size !== (candidate.changed_files || []).length) blocks.push("DUPLICATE_CHANGED_FILE");
  if ((candidate.required_permissions || []).some(permission => !(authority.autonomous_actions || []).includes(permission))) {
    blocks.push("PERMISSION_OUTSIDE_AUTHORITY_ENVELOPE");
  }
  if (CHANGE_RANK[candidate.change_class] === undefined || CHANGE_RANK[authority.max_change_class] === undefined ||
      CHANGE_RANK[candidate.change_class] > CHANGE_RANK[authority.max_change_class]) {
    blocks.push("CHANGE_CLASS_OUTSIDE_AUTHORITY_ENVELOPE");
  }
  if (hasItems(candidate.protected_invariants_affected)) blocks.push("PROTECTED_INVARIANT_AFFECTED");
  if (!hasItems(candidate.rollback_steps) && candidate.disposition !== "no_change") blocks.push("ROLLBACK_PLAN_MISSING");

  const receiptProof = verifyReceiptProof(campaign, checkpoint, proofContext, blocks);
  proof.verification_receipt_ids = [...receiptProof.verified].sort();
  const failedValidation = receiptProof.executedFailure;
  const comparativeProof = verifyComparativeEvaluation(campaign, checkpoint, proofContext, blocks);
  proof.comparative_evaluation_report_id = comparativeProof.reportId;
  const attestationProof = verifyAttestationProof(campaign, checkpoint, proofContext, receiptProof.verified, blocks);
  if (["0.3", "0.4"].includes(campaign.schema_version)) {
    proof.verification_attestation_ids = attestationProof.valid_attestation_ids || [];
    proof.verifier_key_ids = attestationProof.key_ids || [];
    proof.verifier_independence_groups = attestationProof.independence_groups || [];
    proof.attestation_quorum_satisfied = attestationProof.valid === true;
  }
  const comparativeAttestationProof = verifyComparativeAttestationProof(campaign, checkpoint, proofContext, blocks);
  if (campaign.schema_version === "0.4") {
    proof.comparative_evaluation_attestation_ids = comparativeAttestationProof.valid_attestation_ids || [];
    proof.comparative_verifier_key_ids = comparativeAttestationProof.key_ids || [];
    proof.comparative_verifier_independence_groups = comparativeAttestationProof.independence_groups || [];
    proof.comparative_attestation_quorum_satisfied = COMPARATIVE_TARGETS.has(target.target_type) && comparativeAttestationProof.valid === true;
  }

  if (CONTROL_PLANE_TARGETS.has(target.target_type)) {
    if (independent.required !== true || independent.status !== "passed" || independent.evaluator === campaign.command_team.improvement_controller ||
        !hasItems(independent.evidence_receipt_ids) || independent.evidence_receipt_ids.some(id => !receiptProof.verified.has(id))) {
      blocks.push("INDEPENDENT_CONTROL_PLANE_EVALUATION_MISSING");
    }
  } else if (independent.required === true && (independent.status !== "passed" || !hasItems(independent.evidence_receipt_ids) ||
      independent.evidence_receipt_ids.some(id => !receiptProof.verified.has(id)))) {
    blocks.push("REQUIRED_INDEPENDENT_EVALUATION_NOT_PASSED");
  }

  const score = scoreMetrics(campaign, checkpoint, blocks, receiptProof.verified);
  const human = requiresHumanDecision(campaign, checkpoint);
  const approvalResult = human.required ? approvalCoversCheckpoint(campaign, checkpoint, proofContext) : { valid: true, codes: [] };
  const approvalCovered = approvalResult.valid;
  if (human.fatal) blocks.push("PROHIBITED_EXTERNALITY");
  if (human.required && !approvalCovered) blocks.push("HUMAN_APPROVAL_REQUIRED");
  blocks.push(...approvalResult.codes);
  if (!human.required && checkpoint.approval_binding && checkpoint.approval_binding.required) blocks.push("UNNECESSARY_APPROVAL_BINDING");
  if (!human.required && checkpoint.approval_binding && (!isNoneReference(checkpoint.approval_binding.approval_scope_ref) || !isNoneReference(checkpoint.approval_binding.consumption_event_ref))) {
    blocks.push("UNSCOPED_APPROVAL_REFERENCE");
  }
  if (externalities.release_requested) blocks.push("RELEASE_REQUIRES_SEPARATE_GATE");

  const allCriteriaComplete = Array.isArray(progress.open_acceptance_criteria) && progress.open_acceptance_criteria.length === 0;
  const meetsScore = score.weighted_after >= campaign.quality_model.minimum_weighted_score;
  const meaningfulImprovement = score.weighted_delta >= budgets.min_weighted_improvement;
  const canAutoRollback = target.state !== "working_state" &&
    (authority.autonomous_actions || []).includes("revert_own_uncommitted_change") &&
    !human.fatal;

  if (human.fatal) {
    reasons.push("The candidate attempts a destructive or cross-repository action prohibited by the campaign.");
    return makeDecision(campaign, checkpoint, {
      decision: "terminate",
      executionAuthorized: false,
      promotionScope: "none",
      score,
      reasons,
      blocks,
      nextTaskOrder: baseTaskOrder(campaign, checkpoint, "Stop execution, preserve evidence, and prepare a Commander/user incident decision packet.", "manual"),
      humanDecisionRequired: true,
      requiredHumanDecision: "Decide whether to terminate or replace the campaign after reviewing the prohibited action.",
      proof
    });
  }

  if (failedValidation || comparativeProof.rollbackRequired || candidate.disposition === "rollback" || blocks.includes("HARD_QUALITY_GATE_FAILED")) {
    reasons.push("The candidate failed validation, a hard quality gate, or explicitly requested rollback.");
    return makeDecision(campaign, checkpoint, {
      decision: canAutoRollback ? "rollback" : "escalate",
      executionAuthorized: canAutoRollback,
      promotionScope: "none",
      score,
      reasons,
      blocks,
      nextTaskOrder: baseTaskOrder(campaign, checkpoint, canAutoRollback
        ? "Revert only this campaign's uncommitted candidate changes, preserve failure evidence, and prepare a smaller repair candidate."
        : "Preserve the failed candidate and request human rollback authority.", "validation_failure"),
      humanDecisionRequired: !canAutoRollback,
      requiredHumanDecision: canAutoRollback ? "none" : "Approve or reject rollback of the current working state.",
      proof
    });
  }

  if (blocks.length > 0) {
    const budgetStopped = blocks.some(code => [
      "CYCLE_BUDGET_EXCEEDED",
      "FAILED_EXPERIMENT_BUDGET_EXCEEDED",
      "NO_PROGRESS_LIMIT_REACHED",
      "ELAPSED_TIME_BUDGET_EXCEEDED"
    ].includes(code));
    reasons.push(budgetStopped
      ? "A campaign stop budget was reached; autonomous continuation is suspended."
      : "The checkpoint is outside the bounded execution envelope or lacks required evidence.");
    return makeDecision(campaign, checkpoint, {
      decision: "escalate",
      executionAuthorized: false,
      promotionScope: "none",
      score,
      reasons,
      blocks,
      nextTaskOrder: baseTaskOrder(campaign, checkpoint, "Preserve the candidate and produce a decision packet resolving every blocking code.", "manual"),
      humanDecisionRequired: true,
      requiredHumanDecision: "Approve a bounded exception, issue a scope change, or stop the campaign.",
      proof
    });
  }

  if (candidate.disposition === "no_change") {
    if (checkpoint.trigger === "before_completion" && allCriteriaComplete && meetsScore && score.all_hard_gates_passed) {
      reasons.push("All acceptance criteria and quality gates pass at the mandatory completion checkpoint.");
      return makeDecision(campaign, checkpoint, {
        decision: "complete",
        executionAuthorized: false,
        promotionScope: "working_state",
        score,
        reasons,
        blocks,
        nextTaskOrder: baseTaskOrder(campaign, checkpoint, "Freeze the working state and prepare the human release or merge decision packet.", "manual"),
        humanDecisionRequired: true,
        requiredHumanDecision: "Approve or reject merge, push, or external release through the separate release gate.",
        proof
      });
    }
    reasons.push("No bounded change is proposed; continue observation or close remaining acceptance gaps.");
    return makeDecision(campaign, checkpoint, {
      decision: "continue",
      executionAuthorized: authority.may_start_follow_on_cycles === true,
      promotionScope: "none",
      score,
      reasons,
      blocks,
      nextTaskOrder: baseTaskOrder(campaign, checkpoint, "Inspect the next open acceptance criterion and propose one evidence-backed, bounded candidate."),
      humanDecisionRequired: false,
      requiredHumanDecision: "none",
      proof
    });
  }

  if (!meetsScore || (!meaningfulImprovement && candidate.disposition !== "repair")) {
    reasons.push("The candidate does not meet the campaign quality floor or minimum improvement delta.");
    return makeDecision(campaign, checkpoint, {
      decision: "revise_and_retry",
      executionAuthorized: authority.may_start_follow_on_cycles === true,
      promotionScope: "none",
      score,
      reasons,
      blocks,
      nextTaskOrder: baseTaskOrder(campaign, checkpoint, "Revise the candidate against the weakest measured dimension without broadening scope."),
      humanDecisionRequired: false,
      requiredHumanDecision: "none",
      proof
    });
  }

  reasons.push("The candidate stays inside authority, passes validation and hard gates, and improves the declared quality model.");
  return makeDecision(campaign, checkpoint, {
    decision: "accept_working_state",
    executionAuthorized: true,
    promotionScope: target.state === "in_progress" ? "in_progress_work" : "working_state",
    score,
    reasons,
    blocks,
    nextTaskOrder: baseTaskOrder(campaign, checkpoint, allCriteriaComplete
      ? "Run the mandatory before-completion checkpoint; do not release or merge."
      : "Advance the next open acceptance criterion from the accepted working state.", allCriteriaComplete ? "before_completion" : "wave_end"),
    humanDecisionRequired: false,
    requiredHumanDecision: "none",
    proof
  });
}

function parseArgs(argv) {
  const positional = [];
  const artifactArgs = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      artifactArgs.push(argv[index]);
      if (["--repository", "--artifact-root"].includes(argv[index])) {
        index += 1;
        if (index >= argv.length) throw new Error(`${artifactArgs.at(-1)} requires a value.`);
        artifactArgs.push(argv[index]);
      }
    } else {
      positional.push(argv[index]);
    }
  }
  return { positional, artifactOptions: parseArtifactWriteFlags(artifactArgs) };
}

function main() {
  try {
    const { positional, artifactOptions } = parseArgs(process.argv.slice(2));
    if (positional.length !== 2) {
      throw new Error("Usage: node autonomous-improvement-controller.js <campaign.json> <checkpoint.json> --repository <repo> [--artifact-root <dir>] [--write-artifact [--overwrite-artifact]]");
    }
    const campaign = readJson(path.resolve(positional[0]));
    const checkpoint = readJson(path.resolve(positional[1]));
    const campaignValidation = validatePayload(campaign, "self-improvement-campaign");
    const checkpointValidation = validatePayload(checkpoint, "self-improvement-checkpoint");
    const campaignInputFailures = campaignValidation.issues
      .filter(item => item.severity === "error" || item.severity === "critical");
    const checkpointInputFailures = checkpointValidation.issues
      .filter(item => item.layer === "schema" && (item.severity === "error" || item.severity === "critical"));
    if (campaignInputFailures.length > 0 || checkpointInputFailures.length > 0) {
      const codes = [...campaignInputFailures, ...checkpointInputFailures]
        .map(item => item.code);
      throw new Error(`Self-improvement input validation failed: ${[...new Set(codes)].join(", ")}`);
    }
    if (!artifactOptions.repositoryPath) throw new Error("Proof-carrying self-improvement requires --repository <repo>.");
    const proofContext = loadProofContext(campaign, checkpoint, artifactOptions.repositoryPath, artifactOptions.artifactRoot);
    let decision = analyzeImprovement(campaign, checkpoint, proofContext);

    if (artifactOptions.writeArtifact) {
      const repository = resolveRepository(artifactOptions.repositoryPath);
      if (campaign.repository_binding.repository_key !== repository.key ||
          campaign.repository_binding.identity_fingerprint !== repository.identity_fingerprint) {
        decision = {
          ...decision,
          decision: "escalate",
          execution_authorized: false,
          promotion_scope: "none",
          human_decision_required: true,
          required_human_decision: "Correct the campaign repository binding before continuing.",
          reasons: [...decision.reasons, "The runtime target repository does not match the campaign binding."],
          blocking_codes: [...new Set([...decision.blocking_codes, "RUNTIME_REPOSITORY_BINDING_MISMATCH"])].sort()
        };
      } else {
        const checkpointWriteResult = writeRepositoryArtifact({
          repositoryPath: artifactOptions.repositoryPath,
          artifactRoot: artifactOptions.artifactRoot,
          missionId: campaign.mission_id,
          waveId: `C${checkpoint.cycle_number}`,
          kind: "self-improvement-checkpoints",
          artifactId: checkpoint.id,
          payload: checkpoint,
          createdAt: checkpoint.generated_at,
          overwrite: artifactOptions.overwriteArtifact
        });
        console.error(`Artifact written: ${checkpointWriteResult.relative_path}`);
        const decisionWriteResult = writeRepositoryArtifact({
          repositoryPath: artifactOptions.repositoryPath,
          artifactRoot: artifactOptions.artifactRoot,
          missionId: campaign.mission_id,
          waveId: `C${checkpoint.cycle_number}`,
          kind: "self-improvement-decisions",
          artifactId: decision.id,
          payload: decision,
          createdAt: checkpoint.generated_at,
          overwrite: artifactOptions.overwriteArtifact
        });
        console.error(`Artifact written: ${decisionWriteResult.relative_path}`);
      }
    }

    process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
    process.exit(["escalate", "terminate"].includes(decision.decision) ? 1 : 0);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = {
  analyzeImprovement,
  loadProofContext,
  normalizedMetric,
  safeRelativePath,
  scoreMetrics
};
