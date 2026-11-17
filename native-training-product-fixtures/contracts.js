const c = require("../native-training-product-contract"), t = require("../task-training-contract");
const MODES = ["success", "missingthread", "duplicatethread", "turnbeforethread", "wrongcase", "tool", "timeout", "workspace", "quarantine", "control", "malformed", "invalidutf8", "twoturns", "itembeforeturn", "slow"];
function standard(now = Date.now()) {
  return { schema_version: "0.2", type: "TaskTrainingStandard", id: "STD-NATIVE-FIXTURE", capability_id: "CAP-NATIVE", metl_id: "METL-FIXTURE",
    metl_task_id: "TASK-NATIVE", performer_organization_id: "ORG-FIXTURE", version: 1, created_at: new Date(now - 60000).toISOString(),
    expires_at: new Date(now + 86400000).toISOString(), sustainment_seconds: 3600, minimum_distinct_trials: 3,
    steps: [{ step_id: "STEP-product", standard: "Return the actual requested product, not a self-assessment.", critical: true,
      evidence_class: "task_product", not_applicable_permitted: false }],
    cases: ["crawl", "walk"].flatMap(stage => MODES.map(mode => ({ case_id: `CASE-${stage}-${mode}`, stage, execution_method: "native_model_text",
      instruction: "Complete the synthetic task only. This fixture never proves actual model proficiency.", input_text: `fixture:${mode}:${stage}`,
      minimum_output_bytes: 5, conditions: ["Synthetic measured fake process only; no actual model or real owner."] }))), ...t.FLAGS };
}
function request(now = Date.now()) {
  const reference = { artifact_id: "SYN-reference", relative_path: "synthetic/reference.json", sha256: "a".repeat(64) };
  return c.request({ collection_id: "00000000-0000-4000-8000-000000000001", mission_id: "MIS-NATIVE", wave_id: "W1", capability_id: "CAP-NATIVE", performer_id: "PERF-NATIVE",
    registry_head_ref: reference, context_ref: reference, case_id: "CASE-crawl-success", classification: "internal",
    created_at: new Date(now).toISOString(), expires_at: new Date(now + 600000).toISOString() });
}
function samples(now = Date.now()) {
  const req = request(now), response = { schema_version: "0.1", type: "NativeTrainingProductResponse", collection_id: req.collection_id,
    case_id: req.case_id, output: "Synthetic task bytes, never model proficiency." };
  const body = { schema_version: "0.1", type: "NativeTrainingProductAppraisal", collection_id: req.collection_id, request_ref: req.context_ref,
    invocation_sha256: "b".repeat(64), consent_sha256: "c".repeat(64), journal_sha256: "d".repeat(64), native_thread_id: req.collection_id,
    observed_output_sha256: "e".repeat(64), observed_output_bytes: 45, status: "native_task_bytes_bound", native_account_identity_attested: false,
    pre_inference_native_identity_attested: false, model_snapshot_attested: false, actual_model_execution_attested: false, conditions_observed: false, task_standard_evaluated: false, evaluator_authenticated: false, ...t.FLAGS };
  return { "native-training-product-request": req, "native-training-product-response": response,
    "native-training-product-appraisal": t.identified("NTPA", body) };
}
module.exports = { MODES, standard, request, samples };
