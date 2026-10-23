const { createCollector } = require("./codex-bounded-collector");
module.exports = createCollector({
  invocationType: "CodexSemanticInvocation", collectionType: "CodexSemanticCollection",
  consentType: "SemanticEvaluationTransferConsent", purpose: "one_semantic_evaluation_transfer",
  revalidatePreview: require("./semantic-omission-evaluator").revalidatePreview,
  assessResponse: (response, preview) => require("./semantic-omission-contract").assessResponse(response, preview.input.request, preview.input.targets)
});
