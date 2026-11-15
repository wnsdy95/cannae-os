const { z } = require("zod");
const legacy = require("./operator-model-reconciliation-contract");
const { createReconciliationContract } = require("./operator-reconciliation-contract-core");
const TYPES = new Set(["operator-analysis-reconciliation-authorization", "operator-analysis-reconciliation-record"]);
const hex = z.string().regex(/^[a-f0-9]{64}$/), reference = z.strictObject({ artifact_id: z.string().min(1).max(256), relative_path: z.string().min(1).max(4096), sha256: hex });
const publicationFlags = { request_ref: reference, draft_adoption_authorized: z.literal(false), artifact_settlement_authorized: z.literal(false) };
const PUBLICATION = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("no_accepted_response"), ...publicationFlags }),
  z.strictObject({ kind: z.literal("accepted_response"), response_sha256: hex, analysis_sha256: hex,
    expected_draft_id: z.string().regex(/^OD-[a-f0-9]{32}$/), publication_state: z.enum(["not_in_verified_manifest", "published"]),
    draft_ref: reference.nullable(), draft_status: z.enum(["ready_for_review", "needs_clarification"]).nullable(), ...publicationFlags })
]);
const SUBJECT = legacy.SUBJECT.extend({ model_purpose: z.literal("order_analysis"), publication: PUBLICATION });
const AUTHORIZATION = legacy.AUTHORIZATION.extend({ type: z.literal("OperatorAnalysisReconciliationAuthorization"),
  id: z.string().regex(/^OARA-[a-f0-9-]{36}$/), purpose: z.literal("acknowledge_one_failed_order_analysis_transfer"), subject: SUBJECT });
const RECORD = legacy.RECORD.extend({ type: z.literal("OperatorAnalysisReconciliationRecord"), id: z.string().regex(/^OARR-[a-f0-9-]{36}$/), authorization: AUTHORIZATION });
const contract = createReconciliationContract({ types: TYPES, authorizationType: "operator-analysis-reconciliation-authorization",
  recordType: "operator-analysis-reconciliation-record", authorizationSchema: AUTHORIZATION, recordSchema: RECORD,
  authorizationPrefix: "OARA", recordPrefix: "OARR", recordTag: "OperatorAnalysisReconciliationRecord",
  subjectIssues(subject) {
    const p = subject.publication;
    if (p.kind === "accepted_response" && (p.publication_state === "published"
      ? !p.draft_ref || p.draft_ref.artifact_id !== p.expected_draft_id || !p.draft_status
      : p.draft_ref !== null || p.draft_status !== null)) return [{ severity: "critical", code: "ANALYSIS_RECONCILIATION_PUBLICATION_INVALID", path: "$.subject.publication", message: "Bind the exact observed compiler draft or explicit verified-manifest absence without adoption authority." }];
    return [];
  } });
module.exports = { TYPES, PUBLICATION, SUBJECT, AUTHORIZATION, RECORD, ...contract };
