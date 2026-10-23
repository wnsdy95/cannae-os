const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), { z } = require("zod");
const { digest, keyDigest, signOperatorRecord } = require("../operator-consent-contract");
const { AUTHORIZATION, RECORD, recordFor, verifyRecord } = require("../operator-model-reconciliation-contract");
const root = path.resolve(__dirname, ".."), pair = crypto.generateKeyPairSync("ed25519");
const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }), publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + "\n");
const hash = name => crypto.createHash("sha256").update(`Synthetic model reconciliation ${name}`).digest("hex");
const id = "32a18873-1a60-4a28-a399-6f07e9b6821e", action = "075b474d-820d-49ec-8153-231e6c888afd";
const subject = { action_id: action, repository_binding: { repository_key: "synthetic-model-repository", identity_fingerprint: hash("identity") },
  ...Object.fromEntries(["original_action", "invocation", "consent", "result", "journal", "manifest", "repository_state", "runtime_source"].map(name => [name + "_sha256", hash(name)])),
  prior_attempts_sha256: digest([]), trusted_key_sha256: keyDigest(publicKey), process_id: 2147483000, observed_at: "2026-10-23T00:00:00Z",
  child_exit_recorded: true, child_absence_observed: true, process_group_absence_observed: true, failure_reasons: ["SEMANTIC_PROVIDER_FAILED"],
  transfer_effects: "possibly_transmitted", provider_billing_verified: false, provider_cancellation_verified: false };
const authorization = signOperatorRecord({ schema_version: "0.1", type: "OperatorModelReconciliationAuthorization", id: `OMRA-${id}`,
  reconciliation_id: id, action_id: action, sequence: 1, purpose: "acknowledge_one_failed_model_transfer", resolution: "acknowledge_failed_transfer",
  principal_id: "2a2f67c9-6bce-4070-87e2-8a4b178a0ca4", principal_epoch: 1, authentication_method: "local_owner_password_reauthentication",
  session_sha256: hash("session"), nonce_sha256: hash("nonce"), rationale: "Synthetic fixture acknowledges only a failed local transfer, not provider billing or execution.",
  created_at: "2026-10-23T00:00:01Z", expires_at: "2026-10-23T00:02:00Z", subject, provider_uncertainty_acknowledged: true,
  execution_authorized: false, release_authorized: false, human_final_decision_authority: "USER" }, privateKey);
const record = recordFor(authorization, "2026-10-23T00:00:02Z", privateKey); verifyRecord(record, publicKey);
for (const [name, schema, payload] of [["authorization", AUTHORIZATION, authorization], ["record", RECORD, record]]) {
  const type = `operator-model-reconciliation-${name}`, jsonSchema = z.toJSONSchema(schema);
  jsonSchema.$id = `${type}.schema.json`; jsonSchema.title = `Non-authorizing ${payload.type}`;
  write(`schema-files/${type}.schema.json`, jsonSchema); write(`sample-payloads/valid-${type}.json`, payload);
  const invalid = JSON.parse(JSON.stringify(payload)); if (name === "authorization") invalid.release_authorized = true; else invalid.authorization_sha256 = "0".repeat(64);
  write(`sample-payloads/invalid-${type}.json`, invalid);
}
write("operator-semantic-fixtures/model-reconciliation-public-key.json", { public_key_pem: publicKey });
console.log("Wrote two model reconciliation schemas, four synthetic samples and one public fixture key; no private key retained.");
