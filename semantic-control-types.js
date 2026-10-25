const NON_WORK_TYPES = new Set(["NativeTrainingProducerInspection", "NativeTrainingHistoricalProducerSnapshot", "CodexModelSelection", "SemanticEvaluationPreview", "CodexSemanticInvocation", "SemanticEvaluationTransferConsent",
  "CodexSemanticCollection", "OperatorSemanticEvaluation", "OperatorModelReconciliationAuthorization", "OperatorModelReconciliationRecord",
  "RequirementInventory", "SemanticCoverageProposal", "SemanticReviewAssignment", "BoundedPlanningRequest", "BoundedPlanningProposal", "BoundedPlanningOperation",
  "OrderAnalysisPreview", "CodexOrderAnalysisInvocation", "CodexOrderAnalysisCollection", "OrderAnalysisTransferConsent", "OperatorOrderAnalysis",
  "OrderAnalysisOperation", "OrderDraftReference", "MissionOrderAnalysis", "MissionRequest", "OrderDraft",
  "OperatorAnalysisReconciliationAuthorization", "OperatorAnalysisReconciliationRecord", "READINESS_EVENT",
  "ReadinessDropInspection", "ReadinessDropReconciliation", "WorkloadControlInput", "WorkloadPolicyAssessment", "WorkloadControlReceipt", "WorkloadControlFailure",
  "ForceRegistryEntity", "ForceRegistryRequest", "ForceRegistryProposal", "ForceRegistryAuthorization", "ForceRegistryEvent", "ForceRegistryInspection"]);
for (const type of require("./task-training-contract").NON_WORK_TYPES) NON_WORK_TYPES.add(type);
for (const type of require("./training-session-contract").NON_WORK_TYPES) NON_WORK_TYPES.add(type);
for (const type of require("./native-training-product-contract").NON_WORK_TYPES) NON_WORK_TYPES.add(type);
for (const type of ["NativeTrainingTransferReviewRequest", "NativeTrainingTransferAuthorization", "OperatorNativeTrainingProduct"]) NON_WORK_TYPES.add(type);
function isNonWorkPayload(value) {
  const pending = [value], seen = new WeakSet();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (NON_WORK_TYPES.has(current.type) || current.type === "MissionWavePlan" && current.order_binding?.planning_ref) return true;
    for (const child of Object.values(current)) if (child && typeof child === "object") pending.push(child);
  }
  return false;
}
module.exports = { NON_WORK_TYPES, isNonWorkPayload };
