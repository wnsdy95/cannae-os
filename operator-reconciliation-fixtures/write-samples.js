const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { signOperatorRecord, digest, keyDigest } = require("../operator-consent-contract");
const { cancellationForAuthorization, verifyAuthorization, verifyReconciliationRecord } = require("../operator-reconciliation-contract");
const { ADOPTION_AUTHORITY, NONE } = require("../order-adoption-contract");
const root = path.resolve(__dirname, ".."), id = "cf270d3a-654e-4f01-9e79-bd491085a07f", action = "db9eb844-f984-4579-8a64-53c818302db9";
const request = { ...require("../sample-payloads/valid-order-adoption-decision-request.json"), id: `OADR-${action}`, decision_ref: { ...NONE }, ...ADOPTION_AUTHORITY };
const pair = crypto.generateKeyPairSync("ed25519"), privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" });
const publicKey = pair.publicKey.export({ format: "pem", type: "spki" });
const prefix = `repositories/synthetic-fixture-repo/missions/${request.mission_id}/${request.wave_id}`;
const ref = (artifactId, kind, sha256) => ({ artifact_id: artifactId, relative_path: `${prefix}/${kind}/${artifactId}.json`, sha256 });
const draft = { schema_version: "0.1", type: "OperatorReconciliationAuthorization", id: `ORA-${id}`, reconciliation_id: id,
  action_id: action, mission_id: request.mission_id, wave_id: request.wave_id, created_at: "2026-10-22T01:00:00.000Z", expires_at: "2026-10-22T01:02:00.000Z",
  repository_binding: { repository_key: "synthetic-fixture-repo", identity_fingerprint: "a".repeat(64) },
  principal_id: "57c15826-c87b-4eb9-a600-935c9b82cdd2", principal_epoch: 1, authentication_method: "local_owner_password_reauthentication",
  session_sha256: "b".repeat(64), nonce_sha256: "c".repeat(64),
  subject: { original_action_sha256: "d".repeat(64), request, observed_manifest: { revision: 7, sha256: "e".repeat(64) },
    recorded_outcome: "unconsumed_decision", consent_ref: ref(`OCR-${action}`, "operator-consent-records", "f".repeat(64)),
    decision_ref: ref(`DL-OPERATOR-${action}`, "decision-logs", "a".repeat(64)), adoption_ref: { ...NONE }, adoption_status: "none",
    original_consent_expires_at: "2026-10-22T00:02:00.000Z", source_state_sha256: "b".repeat(64), repository_state_sha256: "c".repeat(64),
    trusted_key_sha256: keyDigest(publicKey), attempts_sha256: digest([]), prior_cancellation_ref: { ...NONE } },
  resolution: "cancel_unconsumed", rationale: "Synthetic terminal cancellation fixture; not actual USER consent.", previous_result_sha256: digest(null),
  cancellation_decision: null, human_final_decision_authority: "USER", execution_authorized: false, continuation_authorized: false, release_authorized: false };
draft.cancellation_decision = cancellationForAuthorization(draft);
const authorization = signOperatorRecord(draft, privateKey); verifyAuthorization(authorization, publicKey);
const bytes = JSON.stringify(draft.cancellation_decision, null, 2) + "\n";
const record = signOperatorRecord({ schema_version: "0.1", type: "OperatorDecisionReconciliationRecord", id: `ORR-${id}`,
  mission_id: request.mission_id, wave_id: request.wave_id, recorded_at: "2026-10-22T01:00:02.000Z", authorization, prior_authorization: null,
  cancellation_ref: ref(draft.cancellation_decision.id, "decision-logs", crypto.createHash("sha256").update(bytes).digest("hex")),
  observed_manifest: { revision: 8, sha256: "d".repeat(64) }, terminal_state: "cancelled", human_final_decision_authority: "USER",
  execution_authorized: false, continuation_authorized: false, release_authorized: false }, privateKey);
verifyReconciliationRecord(record, publicKey);
const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + "\n");
write("sample-payloads/valid-operator-reconciliation-authorization.json", authorization);
write("sample-payloads/invalid-operator-reconciliation-authorization.json", { ...authorization, execution_authorized: true });
write("sample-payloads/valid-operator-reconciliation-record.json", record);
write("sample-payloads/invalid-operator-reconciliation-record.json", { ...record, terminal_state: "applied" });
write("operator-reconciliation-fixtures/public-key.json", { public_key_pem: publicKey });
write("operator-reconciliation-fixtures/cancellation.json", draft.cancellation_decision);
