const { z } = require("zod");
const { createReconciliationContract } = require("./operator-reconciliation-contract-core");
const { CODE } = require("./operator-semantic-evaluation-contract");
const TYPES = new Set(["operator-model-reconciliation-authorization", "operator-model-reconciliation-record"]);
const hex = z.string().regex(/^[a-f0-9]{64}$/), time = z.iso.datetime({ offset: true });
const flags = { execution_authorized: z.literal(false), release_authorized: z.literal(false), human_final_decision_authority: z.literal("USER") };
const signature = z.strictObject({ algorithm: z.literal("Ed25519"), key_sha256: hex, value: z.string().regex(/^[A-Za-z0-9+/]{86}==$/) });
const SUBJECT = z.strictObject({
  action_id: z.uuid(), repository_binding: z.strictObject({ repository_key: z.string().min(1).max(256), identity_fingerprint: hex }),
  original_action_sha256: hex, invocation_sha256: hex, consent_sha256: hex, result_sha256: hex, journal_sha256: hex,
  prior_attempts_sha256: hex, manifest_sha256: hex, repository_state_sha256: hex, runtime_source_sha256: hex, trusted_key_sha256: hex,
  process_id: z.number().int().min(2), observed_at: time,
  child_exit_recorded: z.literal(true), child_absence_observed: z.literal(true), process_group_absence_observed: z.literal(true),
  failure_reasons: z.array(CODE).min(1).max(100),
  transfer_effects: z.literal("possibly_transmitted"), provider_billing_verified: z.literal(false), provider_cancellation_verified: z.literal(false)
});
const AUTHORIZATION = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("OperatorModelReconciliationAuthorization"),
  id: z.string().regex(/^OMRA-[a-f0-9-]{36}$/), reconciliation_id: z.uuid(), action_id: z.uuid(), sequence: z.number().int().positive(),
  purpose: z.literal("acknowledge_one_failed_model_transfer"), resolution: z.literal("acknowledge_failed_transfer"),
  principal_id: z.uuid(), principal_epoch: z.number().int().positive(), authentication_method: z.literal("local_owner_password_reauthentication"),
  session_sha256: hex, nonce_sha256: hex, rationale: z.string().min(1).max(2000),
  created_at: time, expires_at: time, subject: SUBJECT, provider_uncertainty_acknowledged: z.literal(true), ...flags, signature });
const RECORD = z.strictObject({ schema_version: z.literal("0.1"), type: z.literal("OperatorModelReconciliationRecord"),
  id: z.string().regex(/^OMRR-[a-f0-9-]{36}$/), reconciliation_id: z.uuid(), action_id: z.uuid(),
  authorization: AUTHORIZATION, authorization_sha256: hex, subject_sha256: hex, recorded_at: time, rechecked_at: time,
  resolution: z.literal("acknowledge_failed_transfer"), original_failure_preserved: z.literal(true),
  provider_billing_verified: z.literal(false), provider_cancellation_verified: z.literal(false), ...flags, signature });
const { contractIssues, verifyAuthorization, verifyRecord, recordFor } = createReconciliationContract({ types: TYPES,
  authorizationType: "operator-model-reconciliation-authorization", recordType: "operator-model-reconciliation-record",
  authorizationSchema: AUTHORIZATION, recordSchema: RECORD, authorizationPrefix: "OMRA", recordPrefix: "OMRR", recordTag: "OperatorModelReconciliationRecord" });
module.exports = { TYPES, SUBJECT, AUTHORIZATION, RECORD, contractIssues, verifyAuthorization, verifyRecord, recordFor };
