const fs = require("node:fs"), path = require("node:path"), { z } = require("zod"), crypto = require("node:crypto");
const { RESPONSE, assessResponse, materialize } = require("../order-analysis-generation-contract"), { EVALUATION } = require("../operator-order-analysis-contract");
const { AUTHORITY, buildDraft, sha256 } = require("../order-intake-contract");
const { digest, signOperatorRecord } = require("../operator-consent-contract"), { response } = require("./support");
const write = (name, value) => fs.writeFileSync(path.join(__dirname, "..", name), JSON.stringify(value, null, 2) + "\n");
for (const [name, contract] of [["order-analysis-response", RESPONSE], ["operator-order-analysis", EVALUATION]]) {
  write(`schema-files/${name}.schema.json`, { ...z.toJSONSchema(contract), $id: `${name}.schema.json`, title: name });
}
const body = response(), invalid = structuredClone(body); invalid.release_authorized = true;
write("sample-payloads/valid-order-analysis-response.json", body); write("sample-payloads/invalid-order-analysis-response.json", invalid);
const pair = crypto.generateKeyPairSync("ed25519"), key = pair.privateKey.export({ type: "pkcs8", format: "pem" });
const value = signOperatorRecord({ schema_version: "0.1", type: "OperatorOrderAnalysis", id: crypto.randomUUID(), status: "held",
  invocation_sha256: digest("synthetic invocation"), consent_sha256: digest("synthetic consent"), rationale_sha256: digest("synthetic rationale"),
  ended_at: "2026-10-23T15:00:00Z", error: "SEMANTIC_PROVIDER_FAILED", assessment: null, response: null, response_payload_sha256: null,
  draft_ref: null, draft_status: null, collection: null, execution_authorized: false, release_authorized: false, human_final_decision_authority: "USER" }, key);
write("sample-payloads/valid-operator-order-analysis.json", value);
write("sample-payloads/invalid-operator-order-analysis.json", { ...value, status: "evaluated" });
const request = { schema_version: "0.1", type: "MissionRequest", id: "MR-SYNTHETIC-ANALYSIS", mission_id: "MIS-INTAKE", wave_id: "W1",
  repository_binding: { repository_key: "synthetic-analysis-repository", identity_fingerprint: digest("synthetic identity") },
  classification: "internal", recorded_at: "2026-10-23T15:00:00Z", expires_at: "2026-10-23T16:00:00Z",
  text: require("./support").REQUEST_TEXT, text_sha256: sha256(Buffer.from(require("./support").REQUEST_TEXT)), ...AUTHORITY };
const preview = { input: { request, allowed_roles: ["S2", "S3"] }, request_ref: { artifact_id: request.id,
  relative_path: "synthetic/mission-requests/MR-SYNTHETIC-ANALYSIS.json", sha256: digest(request) }, prepared_at: "2026-10-23T15:00:01Z" };
const draft = buildDraft(request, preview.request_ref, materialize(body, preview), preview.prepared_at);
const evaluated = signOperatorRecord({ schema_version: "0.1", type: "OperatorOrderAnalysis", id: crypto.randomUUID(), status: "evaluated",
  invocation_sha256: digest("synthetic invocation"), consent_sha256: digest("synthetic consent"), rationale_sha256: digest("synthetic rationale"),
  started_at: "2026-10-23T15:00:01Z", ended_at: "2026-10-23T15:00:02Z", requested_model: "synthetic-not-invoked",
  method_sha256: digest("synthetic method"), cli_executable_sha256: digest("synthetic executable"), assessment: assessResponse(body, preview),
  response: body, response_payload_sha256: digest(body), draft_status: draft.status,
  draft_ref: { artifact_id: draft.id, relative_path: `synthetic/order-drafts/${draft.id}.json`, sha256: sha256(Buffer.from(JSON.stringify(draft, null, 2) + "\n")) },
  collection: { status: "evaluated", journal_sha256: digest("synthetic journal"), process_exit_confirmed: true, process_group_absent: true,
    stdout_sha256: digest("synthetic stdout"), stderr_sha256: digest("synthetic stderr"), response_sha256: digest(body), failure_reasons: [] }, ...AUTHORITY }, key);
write("sample-payloads/valid-operator-order-analysis-evaluated.json", evaluated);
console.log("Wrote response/result contracts and synthetic valid/invalid examples; no private key retained.");
