const { digest, sha256 } = require("../order-intake-contract");
const { identified, reportInputDigest, subjectDigest, AUTHORITY } = require("../workload-control-contract");
const clone = value => JSON.parse(JSON.stringify(value));
function samples() {
  const report = clone(require("../sample-payloads/valid-mission-wave-report.json"));
  delete report.control_receipt_refs;
  const text = JSON.stringify({ result: "Synthetic scoped work completed." }) + "\n";
  const ref = { artifact_id: "EVD-WORKLOAD-SYNTHETIC", relative_path: "synthetic/work.json", sha256: sha256(Buffer.from(text)) };
  for (const result of report.agent_results) result.evidence_refs = [ref];
  const body = { schema_version: "0.1", type: "WorkloadControlInput", purpose: "report_and_evidence_opsec",
    mission_id: report.mission_id, wave_id: report.wave_id, invocation_id: "a".repeat(32), report_id_sha256: digest(report.id),
    report_input_sha256: reportInputDigest(report), repository_identity_fingerprint: "b".repeat(64), repository_state_sha256: "c".repeat(64),
    manifest_sha256: "d".repeat(64), policy_source_sha256: "e".repeat(64),
    agent_bindings: report.agent_results.map(result => ({ agent_id_sha256: digest(result.agent_id), context_ref_sha256: digest(result.context_pack_ref) }))
      .sort((left, right) => left.agent_id_sha256.localeCompare(right.agent_id_sha256)),
    report, evidence: [{ reference: ref, content_sha256: ref.sha256, byte_size: Buffer.byteLength(text), text }], observed_at: report.recorded_at, ...AUTHORITY };
  body.subject_set_sha256 = subjectDigest(body);
  const input = identified("WCI", body);
  const assessment = identified("WPA", { schema_version: "0.1", type: "WorkloadPolicyAssessment", purpose: input.purpose,
    mission_id: input.mission_id, wave_id: input.wave_id, input_id: input.id, input_sha256: digest(input), subject_set_sha256: input.subject_set_sha256,
    invocation_id: input.invocation_id, report_id_sha256: input.report_id_sha256, report_input_sha256: input.report_input_sha256,
    policy_source_sha256: input.policy_source_sha256, finding_count: 0, findings: [], findings_truncated: false, status: "passed",
    evaluated_at: input.observed_at, finished_at: input.observed_at,
    scope: { core_credential_patterns: true, restricted_markings: true, custom_mission_eefi: false, semantic_truth_verified: false, releasability_review_completed: false }, ...AUTHORITY });
  const receipt = identified("WCR", { schema_version: "0.1", type: "WorkloadControlReceipt", purpose: input.purpose,
    mission_id: input.mission_id, wave_id: input.wave_id,
    input_binding: Object.fromEntries(["input_id", "input_sha256", "subject_set_sha256", "invocation_id", "report_id_sha256", "report_input_sha256", "policy_source_sha256"].map(key => [key, assessment[key]])),
    assessment, process: { worker: "workload-control-worker.js", shell: false, stdin_sha256: digest(input), timeout_ms: 10000,
      duration_ms: 0, exit_code: 0, signal: "", stdout_sha256: "f".repeat(64), stdout_bytes: 0, stderr_sha256: sha256(""), stderr_bytes: 0, sandbox_enforced: false },
    repository_state_before_sha256: input.repository_state_sha256, repository_state_after_sha256: input.repository_state_sha256,
    policy_source_before_sha256: input.policy_source_sha256, policy_source_after_sha256: input.policy_source_sha256,
    repository_unchanged: true, policy_source_unchanged: true, status: "passed", ...AUTHORITY });
  return { "workload-control-input": input, "workload-policy-assessment": assessment, "workload-control-receipt": receipt };
}
module.exports = { samples, clone };
