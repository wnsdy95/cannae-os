const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), { z } = require("zod");
const c = require("../operator-native-training-reconciliation-contract"), t = require("../task-training-contract"), { keyDigest, signOperatorRecord } = require("../operator-consent-contract");
const root = path.resolve(__dirname, ".."), pair = crypto.generateKeyPairSync("ed25519"), privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }), publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const hash = name => crypto.createHash("sha256").update("Synthetic native failure " + name).digest("hex"), write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + "\n");
const action = "075b474d-820d-49ec-8153-231e6c888afd", reconciliation = "32a18873-1a60-4a28-a399-6f07e9b6821e", collection = "676bbd09-e714-4986-804e-e52d9297b3b6";
// Schemas must exist before a current method inspection reads its measured files.
for (const [type, schema] of Object.entries(c.SCHEMAS)) write(`schema-files/${type}.schema.json`, { ...z.toJSONSchema(schema), $id: `${type}.schema.json` });
const appraisal = c.checkedAppraisal({ schema_version: "0.1", type: "NativeTrainingFailureAppraisal", action_id: action, collection_id: collection,
  request_ref: { artifact_id: "NTPR-SYNTHETIC", relative_path: "synthetic/native-request.json", sha256: hash("request") },
  ...Object.fromEntries(["original_action", "invocation", "consent", "result", "journal", "reservation", "transfer_authorization", "native_events"].map(name => [name + "_sha256", hash(name)])),
  producer_method_sha256: require("../native-training-producer").legacySnapshot("bcb79dd").method_sha256, trusted_key_sha256: keyDigest(publicKey),
  native_thread_id: "292d06b7-e33d-4cd7-bbdc-b4eb9bb9e7bc", process_id: 2147483000, child_exit_recorded: true, child_absence_observed: true, process_group_absence_observed: true,
  response: { original_file_sha256: null, observed_file_sha256: hash("current-response-file"), canonical_payload_sha256: hash("response-payload"), original_file_bytes_bound: false },
  assessment: { kind: "rejected_response", rejection_code: "SEMANTIC_TRAINING_RESPONSE_SUBSTITUTED" }, publication: { state: "none", authorization_ref: null, output_ref: null, result_ref: null, artifact_settlement_authorized: false, task_output_admitted: false },
  inspection_only: true, private_history_required_for_consumption: true, process_identity_independently_attested: false, actual_model_execution_attested: false,
  task_standard_evaluated: false, evaluator_authenticated: false, hold_discharge_authorized: false, ...t.FLAGS });
const subject = { action_id: action, repository_binding: { repository_key: "synthetic-native-repository", identity_fingerprint: hash("identity") },
  ...Object.fromEntries(["original_action_sha256", "invocation_sha256", "consent_sha256", "result_sha256", "journal_sha256", "trusted_key_sha256", "process_id", "child_exit_recorded", "child_absence_observed", "process_group_absence_observed"].map(name => [name, appraisal[name]])),
  ...Object.fromEntries(["manifest", "repository_state", "runtime_source"].map(name => [name + "_sha256", hash(name)])), prior_attempts_sha256: t.digest([]), observed_at: "2026-10-26T00:00:00Z",
  failure_reasons: ["SEMANTIC_TRAINING_RESPONSE_SUBSTITUTED"], transfer_effects: "possibly_transmitted", provider_billing_verified: false, provider_cancellation_verified: false,
  model_purpose: "native_training", native_appraisal: appraisal };
const authorization = signOperatorRecord({ schema_version: "0.1", type: "OperatorNativeTrainingReconciliationAuthorization", id: `ONTRA-${reconciliation}`, reconciliation_id: reconciliation,
  action_id: action, sequence: 1, purpose: "acknowledge_one_failed_native_training_transfer", resolution: "acknowledge_failed_transfer", principal_id: "2a2f67c9-6bce-4070-87e2-8a4b178a0ca4", principal_epoch: 1,
  authentication_method: "local_owner_password_reauthentication", session_sha256: hash("session"), nonce_sha256: hash("nonce"), rationale: "Synthetic native acknowledgment; no grade, grant, output admission or replay.",
  created_at: "2026-10-26T00:00:01Z", expires_at: "2026-10-26T00:02:00Z", subject, displayed_subject_sha256: t.digest(subject), provider_uncertainty_acknowledged: true,
  native_publication_acknowledged: true, unbound_response_observation_acknowledged: true, ...t.FLAGS }, privateKey);
const record = c.recordFor(authorization, "2026-10-26T00:00:02Z", privateKey); c.verifyRecord(record, publicKey);
for (const [type, value] of [["native-training-failure-appraisal", appraisal], ["operator-native-training-reconciliation-authorization", authorization], ["operator-native-training-reconciliation-record", record]]) {
  write(`sample-payloads/valid-${type}.json`, value); const invalid = structuredClone(value);
  if (type === "native-training-failure-appraisal") invalid.response.original_file_bytes_bound = true;
  else if (type.endsWith("authorization")) invalid.displayed_subject_sha256 = "0".repeat(64);
  else invalid.qualification_granted = true;
  write(`sample-payloads/invalid-${type}.json`, invalid);
}
write("native-training-reconciliation-fixtures/public-key.json", { public_key_pem: publicKey });
console.log("Wrote three native recovery contracts, six synthetic samples and a public key; no private key retained.");
