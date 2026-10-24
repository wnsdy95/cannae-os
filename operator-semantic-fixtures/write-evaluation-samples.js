const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), { z } = require("zod");
const { EVALUATION, verifyEvaluation } = require("../operator-semantic-evaluation-contract");
const { digest, signOperatorRecord } = require("../operator-consent-contract");
const root = path.resolve(__dirname, ".."), pair = crypto.generateKeyPairSync("ed25519");
const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }), publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const hash = value => crypto.createHash("sha256").update("Synthetic model evaluation " + value).digest("hex");
const flags = { execution_authorized: false, release_authorized: false, human_final_decision_authority: "USER" };
const response = { requirements: [{ source_quote: "Do not publish.", start_byte: 0, end_byte: 15, kind: "prohibition",
  coverage: [{ target_id: "order", disposition: "preserved", pointer: "/constraint", quote: "No external publication.", explanation: "Synthetic paraphrase only; not an operational task." }] }],
  conflicts: [], execution_authorized: false, release_authorized: false };
const body = { schema_version: "0.2", type: "OperatorSemanticEvaluation", id: "bc0a199c-309f-438c-a768-5695b8b804c3", status: "evaluated",
  invocation_sha256: hash("invocation"), consent_sha256: hash("consent"), rationale_sha256: hash("rationale"),
  started_at: "2026-10-23T00:00:00Z", ended_at: "2026-10-23T00:00:01Z", requested_model: "synthetic-model",
  method_sha256: hash("method"), cli_executable_sha256: hash("executable"),
  assessment: { verdict: "complete", semantic_completeness_proven: false, calibrated_for_admission: false, ...flags }, response,
  response_payload_sha256: digest(response), collection: { status: "evaluated", journal_sha256: hash("journal"),
    process_exit_confirmed: true, process_group_absent: true, stdout_sha256: hash("stdout"), stderr_sha256: hash("stderr"),
    response_sha256: crypto.createHash("sha256").update(JSON.stringify(response)).digest("hex"), failure_reasons: [] }, ...flags };
const value = signOperatorRecord(body, privateKey); verifyEvaluation(value, publicKey);
const legacyBody = JSON.parse(JSON.stringify(body)); legacyBody.schema_version = "0.1"; delete legacyBody.collection.journal_sha256;
const legacy = signOperatorRecord(legacyBody, privateKey); verifyEvaluation(legacy, publicKey);
const invalid = JSON.parse(JSON.stringify(value)); invalid.assessment.verdict = "incomplete";
const write = (file, payload) => fs.writeFileSync(path.join(root, file), JSON.stringify(payload, null, 2) + "\n");
write("schema-files/operator-semantic-evaluation.schema.json", { ...z.toJSONSchema(EVALUATION), $id: "operator-semantic-evaluation.schema.json",
  title: "Non-authorizing signed model evaluation; v0.1 historical and v0.2 original journal binding" });
write("sample-payloads/valid-operator-semantic-evaluation.json", value);
write("sample-payloads/valid-operator-semantic-evaluation-legacy.json", legacy);
write("sample-payloads/invalid-operator-semantic-evaluation.json", invalid);
write("operator-semantic-fixtures/evaluation-public-key.json", { public_key_pem: publicKey });
console.log("Wrote a strict evaluation schema, current/legacy/invalid synthetic samples and a public fixture key; no private key retained.");
