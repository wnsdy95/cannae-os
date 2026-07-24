#!/usr/bin/env node

const crypto = require("crypto");
const {
  canonicalBytes,
  inputDigest,
  sameRepositoryState
} = require("./dispatch-runtime-controller");
const {
  canonicalJsonBytes
} = require("./verifier-identity-evidence");
const {
  publicKeyId,
  strictBase64
} = require("./verification-attestation");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function objectDigest(value) {
  return sha256(canonicalBytes(value));
}

function sameRef(left, right) {
  return Boolean(left && right &&
    left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path &&
    left.sha256 === right.sha256);
}

function sameObject(left, right) {
  return Boolean(left && right &&
    canonicalJsonBytes(left).equals(canonicalJsonBytes(right)));
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function base64Bytes(value) {
  if (value === "") return Buffer.alloc(0);
  return strictBase64(value);
}

function unsignedArtifactBytes(payload, digestField) {
  const copy = clone(payload);
  delete copy.signature;
  delete copy[digestField];
  return canonicalJsonBytes(copy);
}

function signedArtifactDigest(payload, digestField) {
  const copy = clone(payload);
  delete copy[digestField];
  return sha256(canonicalJsonBytes(copy));
}

function controlProfileDigest(profile, digestField) {
  const copy = clone(profile);
  delete copy[digestField];
  return objectDigest(copy);
}

function protectedExecutionEnvelopeDigest(envelope) {
  return signedArtifactDigest(envelope, "envelope_sha256");
}

function protectedExecutionObservationDigest(observation) {
  return signedArtifactDigest(observation, "observation_sha256");
}

function signArtifact(payload, privateKeyPem, digestField) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Protected execution artifacts require an Ed25519 signing key.");
  }
  const signed = clone(payload);
  delete signed.signature;
  delete signed[digestField];
  signed.signature = {
    key_id: publicKeyId(crypto.createPublicKey(privateKey)),
    algorithm: "ed25519",
    signature_base64: crypto.sign(
      null,
      unsignedArtifactBytes(signed, digestField),
      privateKey
    ).toString("base64")
  };
  signed[digestField] = signedArtifactDigest(signed, digestField);
  return signed;
}

function signProtectedExecutionEnvelope(envelope, privateKeyPem) {
  return signArtifact(envelope, privateKeyPem, "envelope_sha256");
}

function signProtectedExecutionObservation(observation, privateKeyPem) {
  return signArtifact(observation, privateKeyPem, "observation_sha256");
}

function verifySignedArtifact(payload, publicKeyPem, digestField, codes, prefix) {
  if (signedArtifactDigest(payload, digestField) !== payload[digestField]) {
    addCode(codes, `${prefix}_DIGEST_MISMATCH`);
  }
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const signature = strictBase64(payload.signature && payload.signature.signature_base64);
    if (publicKey.asymmetricKeyType !== "ed25519" ||
        publicKeyId(publicKey) !== (payload.signature && payload.signature.key_id) ||
        (payload.signature && payload.signature.algorithm) !== "ed25519" ||
        !signature ||
        !crypto.verify(
          null,
          unsignedArtifactBytes(payload, digestField),
          publicKey,
          signature
        )) {
      addCode(codes, `${prefix}_SIGNATURE_INVALID`);
    }
  } catch (error) {
    addCode(codes, `${prefix}_SIGNATURE_INVALID`);
  }
}

function safeCwdRelative(value) {
  if (typeof value !== "string" || value.length === 0 ||
      value.includes("\\") || value.includes("\0")) return false;
  if (value === ".") return true;
  if (value.startsWith("/") || value.endsWith("/")) return false;
  const parts = value.split("/");
  return parts.every(part => part && part !== "." && part !== "..");
}

function verifyProtectedExecutorPolicy(policy, evaluatedAt = new Date().toISOString()) {
  const codes = [];
  const evaluatedTime = timestamp(evaluatedAt);
  const start = timestamp(policy && policy.valid_from);
  const end = timestamp(policy && policy.expires_at);
  if (evaluatedTime === null || start === null || end === null ||
      start >= end || evaluatedTime < start || evaluatedTime >= end) {
    addCode(codes, "PROTECTED_EXECUTOR_POLICY_NOT_ACTIVE");
  }

  const adapter = policy && policy.adapter_profile || {};
  try {
    const publicKey = crypto.createPublicKey(adapter.signing_public_key_pem);
    if (publicKey.asymmetricKeyType !== "ed25519" ||
        publicKeyId(publicKey) !== adapter.signing_key_id ||
        adapter.signing_algorithm !== "ed25519") {
      addCode(codes, "PROTECTED_EXECUTOR_POLICY_SIGNING_KEY_INVALID");
    }
  } catch (error) {
    addCode(codes, "PROTECTED_EXECUTOR_POLICY_SIGNING_KEY_INVALID");
  }

  const processControls = policy && policy.process_controls || {};
  if (controlProfileDigest(processControls, "sandbox_profile_sha256") !==
      processControls.sandbox_profile_sha256) {
    addCode(codes, "PROTECTED_EXECUTOR_SANDBOX_PROFILE_DIGEST_MISMATCH");
  }
  const networkControls = policy && policy.network_controls || {};
  if (controlProfileDigest(networkControls, "network_policy_sha256") !==
      networkControls.network_policy_sha256) {
    addCode(codes, "PROTECTED_EXECUTOR_NETWORK_POLICY_DIGEST_MISMATCH");
  }

  const ruleIds = new Set();
  for (const rule of policy && policy.rules || []) {
    if (ruleIds.has(rule.rule_id)) {
      addCode(codes, "PROTECTED_EXECUTOR_POLICY_DUPLICATE_RULE");
    }
    ruleIds.add(rule.rule_id);
    if (!safeCwdRelative(rule.cwd_relative)) {
      addCode(codes, "PROTECTED_EXECUTOR_POLICY_CWD_UNSAFE");
    }
    if (typeof rule.executable_path !== "string" ||
        !rule.executable_path.startsWith("/")) {
      addCode(codes, "PROTECTED_EXECUTOR_POLICY_EXECUTABLE_UNSAFE");
    }
    if (rule.executable_format !== "native_binary") {
      addCode(codes, "PROTECTED_EXECUTOR_POLICY_EXECUTABLE_FORMAT_UNSUPPORTED");
    }
  }

  const authority = policy && policy.authority || {};
  if (authority.human_final_decision_authority !== "USER" ||
      authority.self_approval_prohibited !== true ||
      authority.production_execution_authorized !== false ||
      authority.release_authorized !== false) {
    addCode(codes, "PROTECTED_EXECUTOR_POLICY_AUTHORITY_OVERCLAIM");
  }
  if (policy && policy.platform !== "posix_reference") {
    addCode(codes, "PROTECTED_EXECUTOR_POLICY_PLATFORM_UNSUPPORTED");
  }

  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    valid_until: policy && policy.expires_at || "none"
  };
}

function verifyProtectedExecutionBundle(options) {
  const {
    policy,
    toolInput,
    request,
    requestRef,
    decision,
    decisionRef,
    executionEvent,
    executionEventRef,
    envelope,
    envelopeRef,
    observation,
    observationRef,
    executor,
    result,
    status,
    exitCode,
    evaluatedAt = new Date().toISOString(),
    repositoryStateAfter
  } = options || {};
  const codes = [];
  if (!policy || !toolInput || !request || !requestRef || !decision ||
      !decisionRef || !executionEvent || !executionEventRef || !envelope ||
      !envelopeRef || !observation || !observationRef || !executor || !result) {
    return {
      valid: false,
      codes: ["PROTECTED_EXECUTION_VERIFICATION_INPUT_INVALID"]
    };
  }

  const policyResult = verifyProtectedExecutorPolicy(policy, evaluatedAt);
  for (const code of policyResult.codes) addCode(codes, code);
  const adapter = policy.adapter_profile || {};
  verifySignedArtifact(
    envelope,
    adapter.signing_public_key_pem,
    "envelope_sha256",
    codes,
    "PROTECTED_EXECUTION_ENVELOPE"
  );
  verifySignedArtifact(
    observation,
    adapter.signing_public_key_pem,
    "observation_sha256",
    codes,
    "PROTECTED_EXECUTION_OBSERVATION"
  );

  const rules = (policy.rules || []).filter(item => item.rule_id === toolInput.rule_id);
  if (rules.length !== 1) addCode(codes, "PROTECTED_EXECUTION_RULE_NOT_UNIQUE");
  const rule = rules[0] || {};
  if (!sameRef(toolInput.executor_policy_ref, envelope.executor_policy_ref) ||
      !sameRef(toolInput.executor_policy_ref, observation.executor_policy_ref) ||
      !sameRef(toolInput.executor_policy_ref, executor.executor_policy_ref)) {
    addCode(codes, "PROTECTED_EXECUTION_POLICY_REF_MISMATCH");
  }
  if (!(policy.providers || []).includes(request.provider) ||
      rule.tool_name !== request.tool_call.tool_name ||
      rule.operation_class !== request.tool_call.operation_class ||
      rule.operation_class !== "process_execute" ||
      toolInput.rule_id !== envelope.rule_id ||
      toolInput.rule_id !== observation.rule_id) {
    addCode(codes, "PROTECTED_EXECUTION_RULE_BINDING_MISMATCH");
  }
  if (inputDigest(toolInput) !== request.tool_call.tool_input_sha256 ||
      envelope.tool_input_sha256 !== request.tool_call.tool_input_sha256 ||
      observation.tool_input_sha256 !== request.tool_call.tool_input_sha256) {
    addCode(codes, "PROTECTED_EXECUTION_TOOL_INPUT_MISMATCH");
  }
  if (policy.gateway_binding_sha256 !== objectDigest(request.gateway)) {
    addCode(codes, "PROTECTED_EXECUTION_GATEWAY_BINDING_MISMATCH");
  }
  if (!sameObject(policy.repository_binding, request.repository_binding) ||
      !sameObject(envelope.repository_binding, request.repository_binding) ||
      !sameObject(observation.repository_binding, request.repository_binding)) {
    addCode(codes, "PROTECTED_EXECUTION_REPOSITORY_BINDING_MISMATCH");
  }

  const scalarFields = [
    "transaction_id",
    "mission_id",
    "wave_id",
    "agent_id",
    "provider"
  ];
  for (const field of scalarFields) {
    if (envelope[field] !== request[field] || observation[field] !== request[field]) {
      addCode(codes, "PROTECTED_EXECUTION_TRANSACTION_BINDING_MISMATCH");
      break;
    }
  }
  const refBindings = [
    [envelope.request_ref, requestRef],
    [observation.request_ref, requestRef],
    [envelope.decision_ref, decisionRef],
    [observation.decision_ref, decisionRef],
    [envelope.execution_event_ref, executionEventRef],
    [observation.execution_event_ref, executionEventRef],
    [observation.execution_envelope_ref, envelopeRef],
    [executor.execution_envelope_ref, envelopeRef],
    [executor.execution_observation_ref, observationRef]
  ];
  if (refBindings.some(([left, right]) => !sameRef(left, right))) {
    addCode(codes, "PROTECTED_EXECUTION_ARTIFACT_REF_MISMATCH");
  }
  if (executionEvent.state !== "executing" ||
      !sameRef(executionEvent.request_ref, requestRef) ||
      !sameRef(executionEvent.decision_ref, decisionRef)) {
    addCode(codes, "PROTECTED_EXECUTION_EVENT_MISMATCH");
  }

  const expectedCommand = {
    executable_path: rule.executable_path,
    executable_format: rule.executable_format,
    executable_sha256: rule.executable_sha256,
    argv: clone(rule.argv || []),
    cwd_relative: rule.cwd_relative,
    environment_mode: policy.process_controls.environment_mode,
    stdin_mode: policy.process_controls.stdin_mode,
    shell: policy.process_controls.shell,
    detached: policy.process_controls.detached
  };
  const expectedLimits = {
    timeout_ms: rule.timeout_ms,
    max_stdout_bytes: rule.max_stdout_bytes,
    max_stderr_bytes: rule.max_stderr_bytes,
    success_exit_codes: clone(rule.success_exit_codes || [])
  };
  if (!sameObject(envelope.command, expectedCommand) ||
      !sameObject(observation.command, expectedCommand) ||
      !sameObject(envelope.limits, expectedLimits)) {
    addCode(codes, "PROTECTED_EXECUTION_COMMAND_MISMATCH");
  }
  if (envelope.sandbox_profile_sha256 !==
        policy.process_controls.sandbox_profile_sha256 ||
      observation.sandbox_profile_sha256 !==
        policy.process_controls.sandbox_profile_sha256 ||
      executor.sandbox_profile_sha256 !==
        policy.process_controls.sandbox_profile_sha256 ||
      envelope.network_policy_sha256 !==
        policy.network_controls.network_policy_sha256 ||
      observation.network_policy_sha256 !==
        policy.network_controls.network_policy_sha256 ||
      executor.network_policy_sha256 !==
        policy.network_controls.network_policy_sha256) {
    addCode(codes, "PROTECTED_EXECUTION_CONTROL_PROFILE_MISMATCH");
  }
  for (const field of [
    "adapter_id",
    "adapter_version",
    "adapter_sha256",
    "runtime_sha256",
    "execution_mode"
  ]) {
    if (executor[field] !== adapter[field]) {
      addCode(codes, "PROTECTED_EXECUTION_ADAPTER_MISMATCH");
      break;
    }
  }

  const envelopeStart = timestamp(envelope.issued_at);
  const envelopeEnd = timestamp(envelope.expires_at);
  const observationStart = timestamp(observation.started_at);
  const observationEnd = timestamp(observation.finished_at);
  const eventTime = timestamp(executionEvent.recorded_at);
  const evaluatedTime = timestamp(evaluatedAt);
  const decisionEnd = timestamp(decision.valid_until);
  const policyEnd = timestamp(policy.expires_at);
  if ([envelopeStart, envelopeEnd, observationStart, observationEnd, eventTime,
    evaluatedTime, decisionEnd, policyEnd].includes(null) ||
      envelopeStart < eventTime || envelopeStart >= envelopeEnd ||
      observationStart < envelopeStart || observationStart >= envelopeEnd ||
      observationEnd < observationStart || observationEnd > envelopeEnd ||
      evaluatedTime < observationEnd || envelopeEnd > decisionEnd ||
      envelopeEnd > policyEnd) {
    addCode(codes, "PROTECTED_EXECUTION_TIME_BINDING_INVALID");
  }

  if (!sameRepositoryState(envelope.repository_state_before,
    decision.repository_state_before) ||
      !sameRepositoryState(observation.repository_state_before,
        envelope.repository_state_before) ||
      !sameRepositoryState(observation.repository_state_after,
        repositoryStateAfter)) {
    addCode(codes, "PROTECTED_EXECUTION_REPOSITORY_STATE_MISMATCH");
  }

  const stdout = observation.stdout || {};
  const stderr = observation.stderr || {};
  if (stdout.retained_bytes > stdout.observed_bytes ||
      stderr.retained_bytes > stderr.observed_bytes ||
      stdout.retained_bytes > rule.max_stdout_bytes ||
      stderr.retained_bytes > rule.max_stderr_bytes ||
      stdout.truncated !== (stdout.observed_bytes > stdout.retained_bytes) ||
      stderr.truncated !== (stderr.observed_bytes > stderr.retained_bytes)) {
    addCode(codes, "PROTECTED_EXECUTION_OUTPUT_ACCOUNTING_INVALID");
  }
  let resultStdout = null;
  let resultStderr = null;
  try {
    resultStdout = base64Bytes(result.stdout_base64);
    resultStderr = base64Bytes(result.stderr_base64);
  } catch (error) {
    addCode(codes, "PROTECTED_EXECUTION_RESULT_ENCODING_INVALID");
  }
  if (!resultStdout || !resultStderr ||
      sha256(resultStdout || Buffer.alloc(0)) !== stdout.sha256 ||
      sha256(resultStderr || Buffer.alloc(0)) !== stderr.sha256 ||
      (resultStdout && resultStdout.length) !== stdout.retained_bytes ||
      (resultStderr && resultStderr.length) !== stderr.retained_bytes ||
      result.stdout_truncated !== stdout.truncated ||
      result.stderr_truncated !== stderr.truncated ||
      observation.result_sha256 !== objectDigest(result)) {
    addCode(codes, "PROTECTED_EXECUTION_RESULT_MISMATCH");
  }
  if (rule.expected_repository_effect === "none" &&
      !sameRepositoryState(
        observation.repository_state_before,
        observation.repository_state_after
      )) {
    addCode(codes, "PROTECTED_EXECUTION_REPOSITORY_EFFECT_FORBIDDEN");
  }

  const processResult = observation.process || {};
  const expectedStatus = processResult.termination_reason === "exited" &&
    (rule.success_exit_codes || []).includes(processResult.exit_code)
    ? "succeeded"
    : "failed";
  if (status !== expectedStatus ||
      result.status !== expectedStatus ||
      Number(exitCode) !== processResult.exit_code ||
      result.exit_code !== processResult.exit_code ||
      result.signal !== processResult.signal ||
      result.termination_reason !== processResult.termination_reason ||
      processResult.timed_out !==
        (processResult.termination_reason === "timeout") ||
      processResult.output_limit_exceeded !==
        ["stdout_limit", "stderr_limit"].includes(processResult.termination_reason)) {
    addCode(codes, "PROTECTED_EXECUTION_PROCESS_RESULT_MISMATCH");
  }
  if ((processResult.termination_reason === "spawn_error" &&
        processResult.spawned !== false) ||
      (processResult.termination_reason !== "spawn_error" &&
        processResult.spawned !== true)) {
    addCode(codes, "PROTECTED_EXECUTION_SPAWN_STATE_MISMATCH");
  }

  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    policy_id: policy.id,
    rule_id: rule.rule_id || "unknown",
    envelope_id: envelope.id,
    observation_id: observation.id,
    result_sha256: observation.result_sha256,
    valid_until: envelope.expires_at
  };
}

module.exports = {
  controlProfileDigest,
  objectDigest,
  protectedExecutionEnvelopeDigest,
  protectedExecutionObservationDigest,
  safeCwdRelative,
  signProtectedExecutionEnvelope,
  signProtectedExecutionObservation,
  verifyProtectedExecutionBundle,
  verifyProtectedExecutorPolicy
};
