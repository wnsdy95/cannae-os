const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { signConsent, digest } = require("../operator-consent-contract");
const { ADOPTION_AUTHORITY, NONE, decisionOption } = require("../order-adoption-contract");
const root = path.resolve(__dirname, "..");
const id = "613054dc-eae7-4c70-b190-dbd3beb44c39";
const proposal = require("../sample-payloads/valid-order-adoption-decision-request.json");
const request = { ...proposal, id: `OADR-${id}`, decision_ref: { ...NONE }, ...ADOPTION_AUTHORITY };
const decision = { ...require("../sample-payloads/valid-decision-log.json"), id: `DL-OPERATOR-${id}`, mission_id: request.mission_id,
  decision_maker: "USER", decision_type: "scope", status: "complete", chosen_option: decisionOption(request),
  options_considered: [decisionOption(request)], rationale: "Synthetic fixture only; not real human consent." };
const pair = crypto.generateKeyPairSync("ed25519");
const record = signConsent({ schema_version: "0.1", type: "OperatorConsentRecord", id: `OCR-${id}`, challenge_id: id,
  mission_id: request.mission_id, wave_id: request.wave_id, created_at: "2026-10-22T00:00:00.000Z", expires_at: "2026-10-22T00:02:00.000Z",
  repository_binding: { repository_key: "synthetic-fixture-repo", identity_fingerprint: "a".repeat(64) },
  principal_id: "3bd086b5-b99a-45eb-9830-ac0a49e99e6e", principal_epoch: 1, authentication_method: "local_owner_password_reauthentication",
  session_sha256: "b".repeat(64), nonce_sha256: "c".repeat(64), source_state_sha256: "d".repeat(64), repository_state_sha256: "e".repeat(64),
  observed_manifest: { sha256: "f".repeat(64), revision: 7 }, plan_sha256: "a".repeat(64), request,
  decision_log_id: decision.id, decision_payload_sha256: digest(decision), human_final_decision_authority: "USER",
  execution_authorized: false, release_authorized: false
}, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
const write = (file, payload) => fs.writeFileSync(path.join(root, file), JSON.stringify(payload, null, 2) + "\n");
write("sample-payloads/valid-operator-consent-record.json", record);
write("sample-payloads/invalid-operator-consent-record.json", { ...record, execution_authorized: true });
write("operator-consent-fixtures/public-key.json", { public_key_pem: pair.publicKey.export({ format: "pem", type: "spki" }) });
write("operator-consent-fixtures/decision.json", decision);
