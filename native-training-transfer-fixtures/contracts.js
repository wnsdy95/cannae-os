const crypto = require("node:crypto"), t = require("../task-training-contract"), c = require("../native-training-transfer-contract");
function reviewFor(prepared, now = Date.now()) {
  const { request_ref: requestRef, input } = prepared, { request, standard } = input;
  const start = new Date(now).toISOString(), end = new Date(now + 600000).toISOString();
  const labels = [request.id, standard.id].map((subject, index) => ({ schema_version: "0.1", type: "ClassificationLabel", id: `CL-NATIVE-${index}`,
    mission_id: request.mission_id, subject_id: subject, classification: request.classification, eefi_class: "none", releasability: "partner",
    need_to_know_roles: ["USER", input.context?.operational_role || "S3"], labeling_authority: "USER", review_by: end }));
  return c.review({ request_ref: requestRef, mission_id: request.mission_id, wave_id: request.wave_id,
    prompt_sha256: require("../order-intake-contract").sha256(Buffer.from(prepared.prompt)), labels, mission_eefi_items: [],
    releasability_review: { schema_version: "0.1", type: "ReleasabilityReview", id: "RLR-NATIVE", mission_id: request.mission_id, artifact: requestRef,
      labels: labels.map(label => ({ label_id: label.id, classification: label.classification, eefi_class: label.eefi_class })), requested_audience: "partner",
      findings: [], decision: "release", reviewer: "USER", release_review_id: "RR-NATIVE", reviewed_at: start, expires_at: end },
    release_review: { schema_version: "0.1", type: "ReleaseReview", id: "RR-NATIVE", mission_id: request.mission_id, reviewer: "USER", classification: request.classification,
      target: "external_tool", decision: "approve", items: [{ item_id: request.id, classification: request.classification, eefi: false, delivery_mode: "raw", rationale: "Synthetic exact task case only." }],
      output_constraints: ["One reviewed native transfer only; no operational authority."], created_at: start }, created_at: start, expires_at: end });
}
const seed = crypto.createHash("sha256").update("native-training-transfer-synthetic-contract-key").digest();
const key = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), type: "pkcs8", format: "der" });
const publicKey = crypto.createPublicKey(key).export({ type: "spki", format: "pem" });
function samples() {
  const now = Date.parse("2026-10-25T00:00:00Z"), old = require("../native-training-product-fixtures/contracts"), request = old.request(now), input = { request, standard: old.standard(now), training_case: old.standard(now).cases[0] };
  const ref = { artifact_id: request.id, relative_path: "synthetic/request.json", sha256: "a".repeat(64) };
  const review = reviewFor({ request_ref: ref, input, prompt: require("../native-training-product-contract").promptFor(input) }, now);
  const action = "00000000-0000-4000-8000-000000000001", sign = value => require("../operator-consent-contract").signOperatorRecord(value, key.export({ type: "pkcs8", format: "pem" }));
  const authorization = sign({ schema_version: "0.1", type: "NativeTrainingTransferAuthorization", id: `NTFA-${action}`, purpose: "authorize_one_reviewed_native_training_transfer",
    action_id: action, request_ref: ref, transfer_review_ref: { artifact_id: review.id, relative_path: "synthetic/review.json", sha256: "b".repeat(64) },
    invocation_sha256: "c".repeat(64), preview_sha256: "d".repeat(64), displayed_invocation_sha256: "c".repeat(64), principal_id: action, principal_epoch: 1,
    authentication_method: "local_owner_password_reauthentication", session_sha256: "e".repeat(64), nonce_sha256: "f".repeat(64), rationale_sha256: "1".repeat(64),
    mission_handling_acknowledged: true, handling_completeness_independently_attested: false, created_at: new Date(now).toISOString(), expires_at: new Date(now + 60000).toISOString(), ...t.FLAGS });
  const result = sign({ schema_version: "0.1", type: "OperatorNativeTrainingProduct", id: `NTOR-${action}`, action_id: action, status: "held",
    invocation_sha256: "c".repeat(64), consent_sha256: "2".repeat(64), authorization_sha256: t.digest(authorization), rationale_sha256: "1".repeat(64),
    ended_at: new Date(now + 1000).toISOString(), collection: null, appraisal: null, output_ref: null, authorization_ref: null, retained_artifact_refs: [],
    error: "CONSOLE_TRAINING_COLLECTION_HELD", task_standard_evaluated: false, evaluator_authenticated: false, publication_finality_independently_attested: false, ...t.FLAGS });
  return { "native-training-transfer-review-request": review, "native-training-transfer-authorization": authorization, "operator-native-training-product": result };
}
module.exports = { reviewFor, samples, publicKey };
