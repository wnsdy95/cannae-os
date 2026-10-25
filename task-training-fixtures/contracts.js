const crypto = require("node:crypto"), c = require("../task-training-contract");
const { signOperatorRecord } = require("../operator-consent-contract");
const { inputDigest } = require("../dispatch-runtime-controller");
const inputs = [{ file_path: "README.md" }, { file_path: "README.md", offset: 1 }, { file_path: "README.md", limit: 1 }];
const reference = name => ({ artifact_id: `${name}-SYNTHETIC`, relative_path: `synthetic/${name}.json`, sha256: "a".repeat(64) });
function standard(now = Date.parse("2026-10-25T00:00:00Z"), task = "METLT-TRAINING") {
  const created = now - 60000;
  return c.checked({ schema_version: "0.1", type: "TaskTrainingStandard", id: "STD-TRAINING", capability_id: "CAP-TRAINING",
    metl_id: "METL-FIXTURE", metl_task_id: task, performer_organization_id: "ORG-FIXTURE", version: 1,
    created_at: new Date(created).toISOString(), expires_at: new Date(created + 86400000).toISOString(), sustainment_seconds: 3600,
    minimum_distinct_trials: 3, steps: [{ step_id: "STEP-PRODUCT", standard: "Review the actual retained task product, not a control receipt.", critical: true,
      evidence_class: "task_product", not_applicable_permitted: false }],
    cases: ["crawl", "walk"].flatMap(stage => inputs.map((input, index) => ({ case_id: `CASE-${stage}-${index}`, stage, tool_name: "Read",
      tool_input_sha256: inputDigest(input), output_pointer: "/content", minimum_output_bytes: 1,
      conditions: [stage === "crawl" ? "Template review required." : "Prior supervision and backbrief required."] }))), ...c.FLAGS }, "task-training-standard");
}
function samples() {
  const completion = c.completionInput({ hook_event_name: "PostToolUse", tool_use_id: "synthetic-call", tool_name: "Read", tool_input: inputs[0],
    tool_response: { content: "Synthetic observed output, not execution or qualification proof." } });
  const request = c.trial({ mission_id: "MIS-TRAINING", wave_id: "W1", capability_id: "CAP-TRAINING", performer_id: "PERF-TRAINING",
    registry_head_ref: reference("FRE"), case_id: "CASE-crawl-0", session_binding_ref: reference("TSB"), lease_ref: reference("ADL"),
    completion_ref: reference("AEC"), completion_input_ref: reference("TCI"), observed_output_ref: reference("OUT") });
  const seed = crypto.createHash("sha256").update("synthetic-task-training-examples-not-an-operator-key").digest();
  const key = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), type: "pkcs8", format: "der" });
  const binding = c.checked(signOperatorRecord({ schema_version: "0.1", type: "TaskTrainingSessionBinding", id: "TSB-SYNTHETIC",
    purpose: "task_training_session_binding", capability_id: "CAP-TRAINING", capability_version: 1, performer_id: "PERF-TRAINING", performer_version: 1,
    configuration_sha256: "b".repeat(64), stage: "crawl", case_ids: ["CASE-crawl-0", "CASE-crawl-1", "CASE-crawl-2"], lease_ref: reference("ADL"),
    provider: "codex", session_binding: { session_id: "synthetic-session", provider_agent_id: "main" },
    principal_id: "00000000-0000-4000-8000-000000000001", principal_epoch: 1, authentication_method: "local_owner_password_reauthentication",
    created_at: "2026-10-25T00:00:00Z", expires_at: "2026-10-25T00:10:00Z", model_identity_attested: false, ...c.FLAGS },
  key.export({ type: "pkcs8", format: "pem" })), "task-training-session-binding");
  const appraisal = c.checked(c.identified("TTA", { schema_version: "0.1", type: "TaskTrainingTrialAppraisal", request, request_sha256: c.digest(request),
    source_state_sha256: "c".repeat(64), repository_binding: { repository_key: "synthetic-training", identity_fingerprint: "d".repeat(64) },
    observed_manifest: { revision: 1, sha256: "e".repeat(64) }, registry_head_ref: request.registry_head_ref, capability_sha256: "f".repeat(64),
    performer_sha256: "b".repeat(64), standard_ref: reference("STD"), case_id: request.case_id, stage: "crawl", admission_ref: reference("TAE"),
    completion_ref: request.completion_ref, execution_succeeded: true, observed_output_sha256: request.observed_output_ref.sha256,
    status: "observed_result_bound", valid_for_training_review_until: "2026-10-25T01:00:00Z", actual_model_execution_attested: false,
    configuration_attested: false, conditions_observed: false, task_standard_evaluated: false, evaluator_authenticated: false, ...c.FLAGS }), "task-training-trial-appraisal");
  return { "task-training-standard": standard(), "task-training-completion-input": completion, "task-training-trial-request": request,
    "task-training-session-binding": binding, "task-training-trial-appraisal": appraisal };
}
module.exports = { standard, samples };
