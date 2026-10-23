const NON_WORK_TYPES = new Set(["SemanticEvaluationPreview", "CodexSemanticInvocation", "SemanticEvaluationTransferConsent",
  "CodexSemanticCollection", "OperatorSemanticEvaluation", "OperatorModelReconciliationAuthorization", "OperatorModelReconciliationRecord",
  "RequirementInventory", "SemanticCoverageProposal", "SemanticReviewAssignment", "BoundedPlanningRequest", "BoundedPlanningProposal"]);
module.exports = { NON_WORK_TYPES };
