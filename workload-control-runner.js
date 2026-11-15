const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { canonicalJsonBytes } = require("./verifier-identity-evidence");
const { digest, sha256 } = require("./order-intake-contract");
const contract = require("./workload-control-contract");

function checked(payload, type) {
  const result = require("./validator-cli-prototype/validate").validatePayload(payload, type);
  contract.need(result.valid, "WORKLOAD_CONTRACT_INVALID");
  return payload;
}

function boundedEvidence(store, ref, report) {
  const matches = store.manifest.artifacts.filter(entry => entry.mission_id === report.mission_id &&
    entry.wave_id === report.wave_id && entry.artifact_id === ref.artifact_id &&
    entry.relative_path === ref.relative_path && entry.sha256 === ref.sha256);
  contract.need(matches.length === 1, "WORKLOAD_EVIDENCE_REFERENCE_INVALID");
  contract.need(!path.isAbsolute(ref.relative_path) && !ref.relative_path.split(/[\\/]/).includes(".."), "WORKLOAD_EVIDENCE_PATH_INVALID");
  const root = fs.realpathSync(store.artifactRoot), candidate = path.resolve(root, ref.relative_path);
  contract.need(candidate.startsWith(root + path.sep), "WORKLOAD_EVIDENCE_PATH_INVALID");
  // Reject every symlink component, including an intermediate directory inside the namespace.
  let current = root;
  for (const part of path.relative(root, candidate).split(path.sep)) {
    current = path.join(current, part);
    contract.need(!fs.lstatSync(current).isSymbolicLink(), "WORKLOAD_EVIDENCE_PATH_INVALID");
  }
  const fd = fs.openSync(candidate, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let data;
  try {
    const before = fs.fstatSync(fd);
    contract.need(before.isFile() && before.size <= contract.LIMITS.file_bytes, "WORKLOAD_EVIDENCE_BYTES_EXCEEDED");
    const buffer = Buffer.alloc(contract.LIMITS.file_bytes + 1); let size = 0, read;
    while (size < buffer.length && (read = fs.readSync(fd, buffer, size, buffer.length - size, null)) > 0) size += read;
    contract.need(size <= contract.LIMITS.file_bytes, "WORKLOAD_EVIDENCE_BYTES_EXCEEDED");
    data = buffer.subarray(0, size);
    const after = fs.fstatSync(fd);
    contract.need(before.dev === after.dev && before.ino === after.ino && before.size === after.size &&
      before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, "WORKLOAD_EVIDENCE_CHANGED");
    contract.need(fs.realpathSync(candidate) === candidate, "WORKLOAD_EVIDENCE_PATH_INVALID");
  } finally { fs.closeSync(fd); }
  contract.need(sha256(data) === ref.sha256, "WORKLOAD_EVIDENCE_DIGEST_INVALID");
  const text = data.toString("utf8");
  contract.need(Buffer.from(text).equals(data) && !text.includes("\0"), "WORKLOAD_EVIDENCE_ENCODING_INVALID");
  return { reference: ref, content_sha256: ref.sha256, byte_size: data.length, text };
}

function buildInput(report, store, repositoryStateSha256, observedAt) {
  contract.assertJsonLimits(report);
  contract.need(Buffer.byteLength(JSON.stringify(contract.reportProjection(report))) <= contract.LIMITS.report_bytes, "WORKLOAD_REPORT_BYTES_EXCEEDED");
  const refs = contract.reportEvidence(report);
  contract.need(refs.length <= contract.LIMITS.evidence_count, "WORKLOAD_EVIDENCE_COUNT_EXCEEDED");
  let total = 0;
  const evidence = refs.map(ref => {
    const item = boundedEvidence(store, ref, report); total += item.byte_size;
    contract.need(total <= contract.LIMITS.evidence_bytes, "WORKLOAD_EVIDENCE_BYTES_EXCEEDED");
    return item;
  });
  const body = { schema_version: "0.1", type: "WorkloadControlInput", purpose: "report_and_evidence_opsec",
    mission_id: report.mission_id, wave_id: report.wave_id, invocation_id: crypto.randomBytes(16).toString("hex"),
    report_id_sha256: digest(report.id), report_input_sha256: contract.reportInputDigest(report),
    repository_identity_fingerprint: store.repository.identity_fingerprint, repository_state_sha256: repositoryStateSha256,
    manifest_sha256: store.verification.manifest_sha256, policy_source_sha256: contract.policySourceDigest(),
    agent_bindings: report.agent_results.map(item => ({ agent_id_sha256: digest(item.agent_id), context_ref_sha256: digest(item.context_pack_ref) }))
      .sort((left, right) => left.agent_id_sha256.localeCompare(right.agent_id_sha256)),
    report: contract.reportProjection(report), evidence, observed_at: observedAt, ...contract.AUTHORITY };
  body.subject_set_sha256 = contract.subjectDigest(body);
  return checked(contract.identified("WCI", body), "workload-control-input");
}

function assessmentMatches(input, value) {
  const expected = { input_id: input.id, input_sha256: digest(input), subject_set_sha256: input.subject_set_sha256,
    invocation_id: input.invocation_id, report_id_sha256: input.report_id_sha256, report_input_sha256: input.report_input_sha256,
    policy_source_sha256: input.policy_source_sha256, mission_id: input.mission_id, wave_id: input.wave_id,
    evaluated_at: input.observed_at, purpose: input.purpose };
  return Object.entries(expected).every(([key, item]) => value[key] === item) &&
    value.findings.every(item => item.subject_kind === "report" ? item.subject_index === 0 : item.subject_index < input.evidence.length);
}

function executeInput(input, repositoryState) {
  checked(input, "workload-control-input");
  const stdin = canonicalJsonBytes(input), before = repositoryState(), policyBefore = contract.policySourceDigest();
  contract.need(before === input.repository_state_sha256 && policyBefore === input.policy_source_sha256, "WORKLOAD_INPUT_STALE");
  const started = Date.now();
  // No inherited provider credentials, NODE_OPTIONS, shell, agent flags or user-selected executable.
  const result = spawnSync(process.execPath, ["--max-old-space-size=256", path.join(__dirname, "workload-control-worker.js")], {
    cwd: __dirname, env: { PATH: process.env.PATH || "", LANG: "C.UTF-8" }, input: stdin,
    timeout: 10000, maxBuffer: 262144, shell: false, encoding: null
  });
  const duration = Date.now() - started, after = repositoryState(), policyAfter = contract.policySourceDigest();
  const stdout = Buffer.from(result.stdout || ""), stderr = Buffer.from(result.stderr || "");
  let assessment = null, failure;
  try {
    contract.need(Buffer.from(stdout.toString("utf8")).equals(stdout), "WORKLOAD_OUTPUT_ENCODING_INVALID");
    assessment = checked(JSON.parse(stdout.toString("utf8")), "workload-policy-assessment");
    if (!assessmentMatches(input, assessment)) { failure = "WORKER_BINDING_INVALID"; assessment = null; }
  } catch { failure = "WORKER_OUTPUT_INVALID"; assessment = null; }
  if (result.error?.code === "ETIMEDOUT") failure = "WORKER_TIMEOUT";
  else if (result.error || result.signal || ![0, 1].includes(result.status)) failure = "WORKER_FAILED";
  else if (assessment && result.status !== (assessment.status === "passed" ? 0 : 1)) failure = "WORKER_OUTPUT_INVALID";
  if (before !== after) failure = "REPOSITORY_DRIFT";
  if (policyBefore !== policyAfter) failure = "POLICY_SOURCE_DRIFT";
  const status = failure ? "failed" : assessment.status;
  const body = { schema_version: "0.1", type: "WorkloadControlReceipt", purpose: input.purpose,
    mission_id: input.mission_id, wave_id: input.wave_id,
    input_binding: { input_id: input.id, input_sha256: digest(input), subject_set_sha256: input.subject_set_sha256,
      invocation_id: input.invocation_id, report_id_sha256: input.report_id_sha256, report_input_sha256: input.report_input_sha256,
      policy_source_sha256: input.policy_source_sha256 }, assessment,
    process: { worker: "workload-control-worker.js", shell: false, stdin_sha256: sha256(stdin), timeout_ms: 10000,
      duration_ms: duration, exit_code: Number.isInteger(result.status) ? result.status : -1, signal: result.signal || "",
      stdout_sha256: sha256(stdout), stdout_bytes: stdout.length, stderr_sha256: sha256(stderr), stderr_bytes: stderr.length, sandbox_enforced: false },
    repository_state_before_sha256: before, repository_state_after_sha256: after,
    policy_source_before_sha256: policyBefore, policy_source_after_sha256: policyAfter,
    repository_unchanged: before === after, policy_source_unchanged: policyBefore === policyAfter,
    status, ...(failure || status === "blocked" ? { failure_code: failure || "POLICY_FINDINGS" } : {}), ...contract.AUTHORITY };
  return checked(contract.identified("WCR", body), "workload-control-receipt");
}

function assertCurrent(receipt, report, store, state, now) {
  checked(receipt, "workload-control-receipt");
  const current = buildInput(report, store, state, now);
  contract.need(receipt.status === "passed" && receipt.input_binding.subject_set_sha256 === current.subject_set_sha256,
    "WORKLOAD_ASSESSMENT_STALE_OR_BLOCKED");
}

module.exports = { boundedEvidence, buildInput, executeInput, assessmentMatches, assertCurrent };
