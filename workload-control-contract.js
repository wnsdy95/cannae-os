const { AUTHORITY, digest, sha256, draftArtifactFits } = require("./order-intake-contract");

const LIMITS = Object.freeze({ report_bytes: 1048576, file_bytes: 2097152, evidence_bytes: 4194304, input_bytes: 8388608, evidence_count: 64, nodes: 100000, depth: 64, findings: 128 });
const TYPES = new Set(["WorkloadControlInput", "WorkloadPolicyAssessment", "WorkloadControlReceipt", "WorkloadControlFailure"]);
const need = (condition, code) => { if (!condition) throw new Error(code); };
const problem = code => ({ severity: "critical", code, path: "$", message: "Bind the complete bounded subject and retain only non-authorizing, digest-only policy findings." });

function reportProjection(report) {
  const { control_receipt_refs: _framework, ...input } = report;
  delete input.workload_control_receipt_refs;
  return input;
}
const reportInputDigest = report => digest(reportProjection(report));

function assertJsonLimits(value) {
  const stack = [{ value, depth: 0 }], ancestors = new Set(); let count = 0;
  while (stack.length) {
    const item = stack.pop(), node = item.value;
    if (item.exit) { ancestors.delete(node); continue; }
    need(++count <= LIMITS.nodes && item.depth <= LIMITS.depth, "WORKLOAD_JSON_COMPLEXITY_EXCEEDED");
    if (typeof node === "string") {
      need(Buffer.from(node, "utf8").toString("utf8") === node, "WORKLOAD_JSON_UNICODE_INVALID");
      continue;
    }
    if (node === null || typeof node === "boolean" || (typeof node === "number" && Number.isFinite(node))) continue;
    need(typeof node === "object" && !ancestors.has(node), "WORKLOAD_JSON_VALUE_INVALID");
    ancestors.add(node); stack.push({ value: node, exit: true });
    for (const [key, child] of Object.entries(node)) {
      need(Buffer.from(key, "utf8").toString("utf8") === key, "WORKLOAD_JSON_UNICODE_INVALID");
      stack.push({ value: child, depth: item.depth + 1 });
    }
  }
}

function policySourceDigest() {
  const state = require("./verification-runner").computeRepositoryState(__dirname);
  return digest({ policy: "report-and-evidence-opsec", version: "0.1", state });
}

function reportEvidence(report) {
  const entries = new Map();
  for (const result of report.agent_results) for (const ref of result.evidence_refs) entries.set(digest(ref), ref);
  return [...entries].sort(([left], [right]) => left.localeCompare(right)).map(([, ref]) => ref);
}

function subjectDigest(input) {
  return digest({ mission_id: input.mission_id, wave_id: input.wave_id, report_id_sha256: input.report_id_sha256,
    report_input_sha256: input.report_input_sha256, repository_identity_fingerprint: input.repository_identity_fingerprint,
    repository_state_sha256: input.repository_state_sha256, policy_source_sha256: input.policy_source_sha256,
    agent_bindings: input.agent_bindings, evidence: input.evidence.map(item => ({ reference: item.reference, content_sha256: item.content_sha256, byte_size: item.byte_size })) });
}

function identified(prefix, body) { return { ...body, id: `${prefix}-${digest(body).slice(0, 40)}` }; }

function inputIssues(input) {
  if (!input?.report || !Array.isArray(input.evidence) || !Array.isArray(input.agent_bindings) || input.evidence.some(item => !item?.reference || typeof item.text !== "string")) return [];
  const issues = [];
  try {
    assertJsonLimits(input);
    need(input.evidence.length <= LIMITS.evidence_count && draftArtifactFits(input), "WORKLOAD_INPUT_BYTES_EXCEEDED");
    const { id, ...body } = input;
    need(id === identified("WCI", body).id, "WORKLOAD_INPUT_ID_INVALID");
    need(input.mission_id === input.report.mission_id && input.wave_id === input.report.wave_id &&
      input.report_id_sha256 === digest(input.report.id) && input.report_input_sha256 === reportInputDigest(input.report), "WORKLOAD_REPORT_BINDING_INVALID");
    need(input.subject_set_sha256 === subjectDigest(input), "WORKLOAD_SUBJECT_BINDING_INVALID");
    const references = input.evidence.map(item => digest(item.reference));
    need(new Set(references).size === references.length && digest(references) === digest(reportEvidence(input.report).map(digest)), "WORKLOAD_EVIDENCE_SET_INVALID");
    need(input.agent_bindings.every(item => item && typeof item.agent_id_sha256 === "string" && typeof item.context_ref_sha256 === "string"), "WORKLOAD_AGENT_BINDING_INVALID");
    const agents = input.report.agent_results.map(item => ({ agent_id_sha256: digest(item.agent_id), context_ref_sha256: digest(item.context_pack_ref) }));
    agents.sort((left, right) => left.agent_id_sha256.localeCompare(right.agent_id_sha256));
    need(digest(agents) === digest(input.agent_bindings), "WORKLOAD_AGENT_BINDING_INVALID");
    need(Buffer.byteLength(JSON.stringify(reportProjection(input.report))) <= LIMITS.report_bytes, "WORKLOAD_REPORT_BYTES_EXCEEDED");
    let bytes = 0;
    for (const item of input.evidence) {
      const data = Buffer.from(item.text, "utf8"); bytes += data.length;
      need(data.toString("utf8") === item.text && !item.text.includes("\0"), "WORKLOAD_EVIDENCE_ENCODING_INVALID");
      need(data.length === item.byte_size && data.length <= LIMITS.file_bytes && bytes <= LIMITS.evidence_bytes, "WORKLOAD_EVIDENCE_BYTES_EXCEEDED");
      need(sha256(data) === item.content_sha256 && item.content_sha256 === item.reference.sha256, "WORKLOAD_EVIDENCE_DIGEST_INVALID");
    }
  } catch (error) { issues.push(problem(/^WORKLOAD_[A-Z_]+$/.test(error.message) ? error.message : "WORKLOAD_INPUT_INVALID")); }
  return issues;
}

function assessInput(input) {
  need(inputIssues(input).length === 0, "WORKLOAD_INPUT_INVALID");
  need(input.policy_source_sha256 === policySourceDigest(), "WORKLOAD_POLICY_SOURCE_CHANGED");
  const started = Date.now(), { lintPayload } = require("./opsec-linter"), findings = []; let total = 0;
  const scan = (value, kind, index) => {
    for (const item of lintPayload(value)) {
      total++;
      if (findings.length < LIMITS.findings) findings.push({ severity: item.severity, code: item.code, subject_kind: kind,
        subject_index: index, location_sha256: digest(item.path) });
    }
  };
  scan(input.report, "report", 0);
  for (const [index, item] of input.evidence.entries()) {
    let value = item.text;
    try { value = JSON.parse(item.text); assertJsonLimits(value); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    scan(value, "evidence", index);
  }
  need(input.policy_source_sha256 === policySourceDigest(), "WORKLOAD_POLICY_SOURCE_CHANGED");
  const body = { schema_version: "0.1", type: "WorkloadPolicyAssessment", purpose: "report_and_evidence_opsec",
    mission_id: input.mission_id, wave_id: input.wave_id, input_id: input.id, input_sha256: digest(input),
    subject_set_sha256: input.subject_set_sha256, invocation_id: input.invocation_id,
    report_id_sha256: input.report_id_sha256, report_input_sha256: input.report_input_sha256,
    policy_source_sha256: input.policy_source_sha256, finding_count: total, findings,
    findings_truncated: findings.length < total, status: total ? "blocked" : "passed",
    evaluated_at: input.observed_at, finished_at: new Date(Date.parse(input.observed_at) + Date.now() - started).toISOString(),
    scope: { core_credential_patterns: true, restricted_markings: true, custom_mission_eefi: false,
      semantic_truth_verified: false, releasability_review_completed: false }, ...AUTHORITY };
  return identified("WPA", body);
}

function assessmentIssues(value) {
  if (!value || !Array.isArray(value.findings)) return [];
  const { id, ...body } = value, issues = [];
  if (id !== identified("WPA", body).id) issues.push(problem("WORKLOAD_ASSESSMENT_ID_INVALID"));
  if ((value.finding_count > 0) !== (value.status === "blocked") || value.finding_count < value.findings.length ||
      value.findings_truncated !== (value.finding_count > value.findings.length)) issues.push(problem("WORKLOAD_ASSESSMENT_VERDICT_INVALID"));
  if (!(Date.parse(value.finished_at) >= Date.parse(value.evaluated_at))) issues.push(problem("WORKLOAD_ASSESSMENT_TIME_INVALID"));
  return issues;
}

function receiptIssues(value) {
  if (!value?.input_binding || !value.process || !Object.hasOwn(value, "assessment")) return [];
  const { id, ...body } = value, issues = [];
  if (id !== identified("WCR", body).id) issues.push(problem("WORKLOAD_RECEIPT_ID_INVALID"));
  if (value.assessment) {
    for (const key of Object.keys(value.input_binding)) if (value.assessment[key] !== value.input_binding[key]) issues.push(problem("WORKLOAD_RECEIPT_INPUT_MISMATCH"));
    if (value.mission_id !== value.assessment.mission_id || value.wave_id !== value.assessment.wave_id) issues.push(problem("WORKLOAD_RECEIPT_SCOPE_MISMATCH"));
    issues.push(...assessmentIssues(value.assessment));
  }
  if (value.process.stdin_sha256 !== value.input_binding.input_sha256 ||
      value.input_binding.policy_source_sha256 !== value.policy_source_before_sha256 ||
      value.repository_unchanged !== (value.repository_state_before_sha256 === value.repository_state_after_sha256) ||
      value.policy_source_unchanged !== (value.policy_source_before_sha256 === value.policy_source_after_sha256)) issues.push(problem("WORKLOAD_RECEIPT_STATE_MISMATCH"));
  if (value.status === "passed" && (!value.assessment || value.assessment.status !== "passed" || value.process.exit_code !== 0 ||
      value.process.signal || !value.repository_unchanged || !value.policy_source_unchanged || value.failure_code)) issues.push(problem("WORKLOAD_RECEIPT_VERDICT_INVALID"));
  if (value.status === "blocked" && (!value.assessment || value.assessment.status !== "blocked" || value.process.exit_code !== 1 ||
      value.process.signal || !value.repository_unchanged || !value.policy_source_unchanged || value.failure_code !== "POLICY_FINDINGS")) issues.push(problem("WORKLOAD_RECEIPT_VERDICT_INVALID"));
  if (value.status === "failed" && value.assessment?.status === "passed" && value.process.exit_code === 0 &&
      !value.process.signal && value.repository_unchanged && value.policy_source_unchanged) issues.push(problem("WORKLOAD_RECEIPT_VERDICT_INVALID"));
  if (value.status !== "passed" && !value.failure_code) issues.push(problem("WORKLOAD_RECEIPT_FAILURE_MISSING"));
  return issues;
}

module.exports = { AUTHORITY, LIMITS, TYPES, need, identified, reportProjection, reportInputDigest, reportEvidence,
  assertJsonLimits, policySourceDigest, subjectDigest, inputIssues, assessInput, assessmentIssues, receiptIssues };
