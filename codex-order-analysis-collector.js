const { createCollector } = require("./codex-bounded-collector");
module.exports = createCollector({
  invocationType: "CodexOrderAnalysisInvocation", collectionType: "CodexOrderAnalysisCollection",
  consentType: "OrderAnalysisTransferConsent", purpose: "one_order_analysis_transfer_and_draft",
  revalidatePreview: require("./order-analysis-generator").revalidatePreview,
  assessResponse: require("./order-analysis-generation-contract").assessResponse
});
