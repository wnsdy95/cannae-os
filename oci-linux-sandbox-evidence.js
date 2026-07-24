#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
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

function sameObject(left, right) {
  return left !== undefined && right !== undefined &&
    canonicalJsonBytes(left).equals(canonicalJsonBytes(right));
}

function sameRef(left, right) {
  return Boolean(left && right &&
    left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path &&
    left.sha256 === right.sha256);
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 ||
      value.includes("\\") || value.includes("\0") ||
      value.startsWith("/") || value.endsWith("/")) return false;
  return value.split("/").every(part => part && part !== "." && part !== "..");
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

function signArtifact(payload, privateKeyPem, digestField) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("OCI sandbox evidence requires an Ed25519 signing key.");
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

function verifySignedArtifact(payload, publicKeyPem, digestField, codes, prefix) {
  if (signedArtifactDigest(payload, digestField) !== payload[digestField]) {
    addCode(codes, `${prefix}_DIGEST_MISMATCH`);
  }
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const signature = strictBase64(
      payload.signature && payload.signature.signature_base64
    );
    if (publicKey.asymmetricKeyType !== "ed25519" ||
        publicKeyId(publicKey) !==
          (payload.signature && payload.signature.key_id) ||
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

function sandboxProfileProjection(policy) {
  return {
    image: clone(policy.image),
    process_controls: clone(policy.process_controls),
    filesystem_controls: clone(policy.filesystem_controls),
    seccomp: clone(policy.seccomp),
    resource_controls: clone(policy.resource_controls)
  };
}

function sandboxProfileDigest(policy) {
  return objectDigest(sandboxProfileProjection(policy));
}

function networkPolicyDigest(networkControls) {
  const copy = clone(networkControls);
  delete copy.network_policy_sha256;
  return objectDigest(copy);
}

function probeCommand(rule) {
  return [
    "supervise",
    "--target",
    rule.executable_path,
    "--cwd",
    rule.cwd,
    "--timeout-ms",
    String(rule.timeout_ms),
    "--max-stdout-bytes",
    String(rule.max_stdout_bytes),
    "--max-stderr-bytes",
    String(rule.max_stderr_bytes),
    "--",
    ...rule.argv
  ];
}

function dockerCreateArgv(policy, rule, repositoryRoot, containerName) {
  const filesystem = policy.filesystem_controls;
  const processControls = policy.process_controls;
  const resources = policy.resource_controls;
  const seccompPath = path.resolve(
    repositoryRoot,
    policy.seccomp.profile_relative_path
  );
  const mount = [
    "type=bind",
    `src=${repositoryRoot}`,
    `dst=${filesystem.repository_destination}`,
    "readonly",
    "bind-propagation=rprivate",
    "bind-recursive=readonly"
  ].join(",");
  const tmpfs = [
    ...filesystem.tmpfs_options,
    `size=${filesystem.tmpfs_size_bytes}`
  ].join(",");
  return [
    "container",
    "create",
    "--name",
    containerName,
    "--pull",
    policy.image.pull_policy,
    "--read-only",
    "--mount",
    mount,
    "--tmpfs",
    `${filesystem.tmpfs_destination}:${tmpfs}`,
    "--network",
    policy.network_controls.mode,
    "--user",
    `${processControls.uid}:${processControls.gid}`,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges=true",
    "--security-opt",
    `seccomp=${seccompPath}`,
    "--pids-limit",
    String(resources.pids_limit),
    "--memory",
    String(resources.memory_bytes),
    "--memory-swap",
    String(resources.memory_swap_bytes),
    "--cpu-period",
    String(resources.cpu_period_us),
    "--cpu-quota",
    String(resources.cpu_quota_us),
    "--cgroupns",
    processControls.cgroup_namespace,
    "--ipc",
    processControls.ipc_namespace,
    "--init",
    "--entrypoint",
    "/cannae-probe",
    policy.image.image_id,
    ...probeCommand(rule)
  ];
}

function expectedLaunch(policy, rule, repositoryRoot, containerName) {
  const createArgv = dockerCreateArgv(
    policy,
    rule,
    repositoryRoot,
    containerName
  );
  return {
    container_name: containerName,
    probe_path: "/cannae-probe",
    entrypoint: ["/cannae-probe"],
    command: probeCommand(rule),
    target_executable_path: rule.executable_path,
    target_executable_sha256: rule.executable_sha256,
    target_argv: clone(rule.argv),
    cwd: rule.cwd,
    timeout_ms: rule.timeout_ms,
    max_stdout_bytes: rule.max_stdout_bytes,
    max_stderr_bytes: rule.max_stderr_bytes,
    docker_create_argv_sha256: objectDigest(createArgv)
  };
}

function runtimeConfigDigest(runtimeConfig) {
  const copy = clone(runtimeConfig);
  delete copy.config_sha256;
  return objectDigest(copy);
}

function verifyOciLinuxSandboxPolicy(
  policy,
  evaluatedAt = new Date().toISOString()
) {
  const codes = [];
  const evaluatedTime = timestamp(evaluatedAt);
  const start = timestamp(policy && policy.valid_from);
  const end = timestamp(policy && policy.expires_at);
  if (evaluatedTime === null || start === null || end === null ||
      start >= end || evaluatedTime < start || evaluatedTime >= end) {
    addCode(codes, "OCI_SANDBOX_POLICY_NOT_ACTIVE");
  }

  const adapter = policy && policy.adapter_profile || {};
  try {
    const publicKey = crypto.createPublicKey(adapter.signing_public_key_pem);
    if (publicKey.asymmetricKeyType !== "ed25519" ||
        publicKeyId(publicKey) !== adapter.signing_key_id ||
        adapter.signing_algorithm !== "ed25519") {
      addCode(codes, "OCI_SANDBOX_POLICY_SIGNING_KEY_INVALID");
    }
  } catch (error) {
    addCode(codes, "OCI_SANDBOX_POLICY_SIGNING_KEY_INVALID");
  }

  if (policy && sandboxProfileDigest(policy) !==
      policy.sandbox_profile_sha256) {
    addCode(codes, "OCI_SANDBOX_PROFILE_DIGEST_MISMATCH");
  }
  if (policy && networkPolicyDigest(policy.network_controls || {}) !==
      (policy.network_controls || {}).network_policy_sha256) {
    addCode(codes, "OCI_SANDBOX_NETWORK_POLICY_DIGEST_MISMATCH");
  }

  const processControls = policy && policy.process_controls || {};
  const filesystem = policy && policy.filesystem_controls || {};
  const seccomp = policy && policy.seccomp || {};
  const resources = policy && policy.resource_controls || {};
  const network = policy && policy.network_controls || {};
  if (processControls.uid === 0 || processControls.gid === 0 ||
      !sameObject(processControls.cap_drop, ["ALL"]) ||
      processControls.no_new_privileges !== true ||
      processControls.init !== true ||
      ["pid_namespace", "ipc_namespace", "uts_namespace",
        "cgroup_namespace"].some(name => processControls[name] !== "private")) {
    addCode(codes, "OCI_SANDBOX_PRIVILEGE_CONTROLS_INVALID");
  }
  if (filesystem.read_only_rootfs !== true ||
      filesystem.repository_destination !== "/workspace" ||
      filesystem.repository_read_only !== true ||
      filesystem.recursive_read_only_required !== true ||
      filesystem.tmpfs_destination !== "/tmp" ||
      !["rw", "noexec", "nosuid", "nodev"].every(option =>
        (filesystem.tmpfs_options || []).includes(option))) {
    addCode(codes, "OCI_SANDBOX_FILESYSTEM_CONTROLS_INVALID");
  }
  if (!safeRelativePath(seccomp.profile_relative_path) ||
      seccomp.default_action !== "SCMP_ACT_ERRNO") {
    addCode(codes, "OCI_SANDBOX_SECCOMP_PROFILE_INVALID");
  }
  if (resources.memory_swap_bytes !== resources.memory_bytes ||
      resources.cpu_quota_us > resources.cpu_period_us) {
    addCode(codes, "OCI_SANDBOX_RESOURCE_CONTROLS_INVALID");
  }
  if (network.mode !== "none" || network.outbound !== "prohibited" ||
      !sameObject(network.allowed_interfaces, ["lo"]) ||
      network.dns !== "none" ||
      network.proxy_environment !== "prohibited") {
    addCode(codes, "OCI_SANDBOX_NETWORK_CONTROLS_INVALID");
  }

  const ruleIds = new Set();
  for (const rule of policy && policy.rules || []) {
    if (ruleIds.has(rule.rule_id)) {
      addCode(codes, "OCI_SANDBOX_POLICY_DUPLICATE_RULE");
    }
    ruleIds.add(rule.rule_id);
    if (rule.executable_path !== "/cannae-probe" ||
        rule.executable_format !== "static_linux_binary" ||
        rule.executable_sha256 !== adapter.probe_sha256 ||
        rule.cwd !== "/workspace" ||
        rule.operation_class !== "process_execute" ||
        rule.expected_repository_effect !== "none") {
      addCode(codes, "OCI_SANDBOX_RULE_UNSUPPORTED");
    }
  }

  const authority = policy && policy.authority || {};
  if (authority.human_final_decision_authority !== "USER" ||
      authority.self_approval_prohibited !== true ||
      authority.production_execution_authorized !== false ||
      authority.release_authorized !== false ||
      (policy && policy.platform) !== "linux_oci_docker_reference" ||
      (policy && policy.image &&
        policy.image.content_trust_verified) !== false) {
    addCode(codes, "OCI_SANDBOX_POLICY_AUTHORITY_OVERCLAIM");
  }

  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    valid_until: policy && policy.expires_at || "none"
  };
}

function verifyProbe(policy, rule, probe, result, codes) {
  const processControls = policy.process_controls;
  const filesystem = policy.filesystem_controls;
  const resources = policy.resource_controls;
  const zeroCapability = "0000000000000000";
  const status = probe.status || {};
  const uidValues = Object.values(status.uid || {});
  const gidValues = Object.values(status.gid || {});
  const capabilityValues = Object.values(status.capabilities || {});
  if (probe.probe_sha256 !== policy.adapter_profile.probe_sha256 ||
      probe.platform !== "linux" ||
      uidValues.length !== 4 ||
      uidValues.some(value => value !== processControls.uid) ||
      gidValues.length !== 4 ||
      gidValues.some(value => value !== processControls.gid) ||
      capabilityValues.length !== 5 ||
      capabilityValues.some(value => value !== zeroCapability) ||
      status.no_new_privs !== 1 ||
      status.seccomp_mode !== 2 ||
      status.seccomp_filters < 1) {
    addCode(codes, "OCI_SANDBOX_PROBE_PRIVILEGE_MISMATCH");
  }
  if (["cgroup", "ipc", "mnt", "net", "pid", "uts"].some(name =>
    typeof (probe.namespaces || {})[name] !== "string")) {
    addCode(codes, "OCI_SANDBOX_PROBE_NAMESPACE_MISMATCH");
  }
  const rootMount = probe.mounts && probe.mounts.root || {};
  const workspaceMount = probe.mounts && probe.mounts.workspace || {};
  const tmpMount = probe.mounts && probe.mounts.tmp || {};
  if (rootMount.destination !== "/" || rootMount.read_only !== true ||
      workspaceMount.destination !== filesystem.repository_destination ||
      workspaceMount.read_only !== true ||
      tmpMount.destination !== filesystem.tmpfs_destination ||
      tmpMount.read_only !== false ||
      (probe.mounts || {}).workspace_recursive_read_only !== true ||
      !["rw", "noexec", "nosuid", "nodev"].every(option =>
        (tmpMount.options || []).includes(option)) ||
      !(probe.write_tests || {}).root_denied ||
      !(probe.write_tests || {}).workspace_denied ||
      !(probe.write_tests || {}).tmp_writable) {
    addCode(codes, "OCI_SANDBOX_PROBE_FILESYSTEM_MISMATCH");
  }
  const cgroup = probe.cgroup || {};
  if (cgroup.version !== "2" ||
      cgroup.memory_max !== String(resources.memory_bytes) ||
      cgroup.pids_max !== String(resources.pids_limit) ||
      cgroup.cpu_max !==
        `${resources.cpu_quota_us} ${resources.cpu_period_us}`) {
    addCode(codes, "OCI_SANDBOX_PROBE_CGROUP_MISMATCH");
  }
  const network = probe.network || {};
  if (!sameObject(
    network.addressed_interfaces,
    policy.network_controls.allowed_interfaces
  ) ||
      !sameObject(network.non_loopback_addresses, []) ||
      network.default_route_count !== 0 ||
      network.outbound_connect_denied !== true) {
    addCode(codes, "OCI_SANDBOX_PROBE_NETWORK_MISMATCH");
  }

  const child = probe.child || {};
  for (const name of ["stdout", "stderr"]) {
    const output = child[name] || {};
    let bytes = null;
    try {
      bytes = output.base64 === ""
        ? Buffer.alloc(0)
        : strictBase64(output.base64);
    } catch (error) {
      bytes = null;
    }
    if (!bytes ||
        output.retained_bytes > output.observed_bytes ||
        output.retained_bytes !== bytes.length ||
        output.sha256 !== sha256(bytes) ||
        output.truncated !==
          (output.observed_bytes > output.retained_bytes)) {
      addCode(codes, "OCI_SANDBOX_PROBE_OUTPUT_ACCOUNTING_INVALID");
    }
  }
  const expectedStatus = child.termination_reason === "exited" &&
    rule.success_exit_codes.includes(child.exit_code)
    ? "succeeded"
    : "failed";
  if (result.status !== expectedStatus ||
      result.exit_code !== child.exit_code ||
      result.signal !== child.signal ||
      result.termination_reason !== child.termination_reason ||
      result.stdout_base64 !== (child.stdout || {}).base64 ||
      result.stderr_base64 !== (child.stderr || {}).base64 ||
      result.stdout_truncated !== (child.stdout || {}).truncated ||
      result.stderr_truncated !== (child.stderr || {}).truncated ||
      child.timed_out !== (child.termination_reason === "timeout") ||
      child.output_limit_exceeded !==
        ["stdout_limit", "stderr_limit"].includes(child.termination_reason) ||
      (child.termination_reason === "spawn_error") === child.spawned) {
    addCode(codes, "OCI_SANDBOX_PROBE_PROCESS_RESULT_MISMATCH");
  }
}

function verifyRuntimeConfig(
  policy,
  envelope,
  observation,
  repositoryRoot,
  codes
) {
  const config = observation.runtime_config || {};
  const processControls = policy.process_controls;
  const resources = policy.resource_controls;
  if (runtimeConfigDigest(config) !== config.config_sha256) {
    addCode(codes, "OCI_SANDBOX_RUNTIME_CONFIG_DIGEST_MISMATCH");
  }
  const expected = {
    user: `${processControls.uid}:${processControls.gid}`,
    entrypoint: ["/cannae-probe"],
    command: clone(envelope.launch.command),
    environment: ["PATH="],
    read_only_rootfs: true,
    network_mode: "none",
    tmpfs: {
      destination: policy.filesystem_controls.tmpfs_destination,
      size_bytes: policy.filesystem_controls.tmpfs_size_bytes,
      options: [...policy.filesystem_controls.tmpfs_options].sort()
    },
    cap_drop: ["ALL"],
    cgroupns_mode: "private",
    pid_mode: "private",
    ipc_mode: "private",
    uts_mode: "private",
    init: true,
    pids_limit: resources.pids_limit,
    memory_bytes: resources.memory_bytes,
    memory_swap_bytes: resources.memory_swap_bytes,
    cpu_period_us: resources.cpu_period_us,
    cpu_quota_us: resources.cpu_quota_us
  };
  for (const [field, value] of Object.entries(expected)) {
    if (!sameObject(config[field], value)) {
      addCode(codes, "OCI_SANDBOX_RUNTIME_CONFIG_MISMATCH");
      break;
    }
  }
  const options = config.security_options || [];
  if (!options.includes("no-new-privileges=true") ||
      !options.includes(`seccomp-sha256=${policy.seccomp.profile_sha256}`)) {
    addCode(codes, "OCI_SANDBOX_RUNTIME_SECURITY_OPTION_MISMATCH");
  }
  const mount = config.repository_mount || {};
  if (mount.destination !== "/workspace" ||
      mount.source_sha256 !== sha256(Buffer.from(repositoryRoot)) ||
      mount.read_only !== true ||
      mount.propagation !== "rprivate") {
    addCode(codes, "OCI_SANDBOX_RUNTIME_MOUNT_MISMATCH");
  }
}

function expectedSupervisorExitCode(child) {
  if (child.termination_reason === "timeout") return 124;
  if (["stdout_limit", "stderr_limit"].includes(child.termination_reason)) {
    return 125;
  }
  if (child.termination_reason === "spawn_error") return 126;
  if (Number.isInteger(child.exit_code) &&
      child.exit_code >= 0 && child.exit_code <= 125) {
    return child.exit_code;
  }
  return 127;
}

function verifyOciSandboxExecutionBundle(options) {
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
    probe,
    probeRef,
    observation,
    observationRef,
    executor,
    result,
    status,
    exitCode,
    repositoryRoot,
    repositoryStateAfter,
    evaluatedAt = new Date().toISOString()
  } = options || {};
  const codes = [];
  if (!policy || !toolInput || !request || !requestRef || !decision ||
      !decisionRef || !executionEvent || !executionEventRef || !envelope ||
      !envelopeRef || !probe || !probeRef || !observation || !observationRef ||
      !executor || !result || !repositoryRoot) {
    return {
      valid: false,
      codes: ["OCI_SANDBOX_VERIFICATION_INPUT_INVALID"]
    };
  }

  const policyResult = verifyOciLinuxSandboxPolicy(policy, evaluatedAt);
  for (const code of policyResult.codes) addCode(codes, code);
  const adapter = policy.adapter_profile || {};
  verifySignedArtifact(
    envelope,
    adapter.signing_public_key_pem,
    "envelope_sha256",
    codes,
    "OCI_SANDBOX_ENVELOPE"
  );
  verifySignedArtifact(
    observation,
    adapter.signing_public_key_pem,
    "observation_sha256",
    codes,
    "OCI_SANDBOX_OBSERVATION"
  );

  const rules = (policy.rules || []).filter(
    item => item.rule_id === toolInput.rule_id
  );
  if (rules.length !== 1) addCode(codes, "OCI_SANDBOX_RULE_NOT_UNIQUE");
  const rule = rules[0] || {};
  if (!sameRef(toolInput.sandbox_policy_ref, envelope.sandbox_policy_ref) ||
      !sameRef(toolInput.sandbox_policy_ref, observation.sandbox_policy_ref) ||
      !sameRef(toolInput.sandbox_policy_ref, executor.executor_policy_ref)) {
    addCode(codes, "OCI_SANDBOX_POLICY_REF_MISMATCH");
  }
  if (!(policy.providers || []).includes(request.provider) ||
      rule.tool_name !== request.tool_call.tool_name ||
      rule.operation_class !== request.tool_call.operation_class ||
      rule.operation_class !== "process_execute" ||
      toolInput.rule_id !== envelope.rule_id ||
      toolInput.rule_id !== observation.rule_id) {
    addCode(codes, "OCI_SANDBOX_RULE_BINDING_MISMATCH");
  }
  if (inputDigest(toolInput) !== request.tool_call.tool_input_sha256 ||
      envelope.tool_input_sha256 !== request.tool_call.tool_input_sha256 ||
      observation.tool_input_sha256 !== request.tool_call.tool_input_sha256) {
    addCode(codes, "OCI_SANDBOX_TOOL_INPUT_MISMATCH");
  }
  if (policy.gateway_binding_sha256 !== objectDigest(request.gateway)) {
    addCode(codes, "OCI_SANDBOX_GATEWAY_BINDING_MISMATCH");
  }
  if (!sameObject(policy.repository_binding, request.repository_binding) ||
      !sameObject(envelope.repository_binding, request.repository_binding) ||
      !sameObject(observation.repository_binding, request.repository_binding)) {
    addCode(codes, "OCI_SANDBOX_REPOSITORY_BINDING_MISMATCH");
  }

  const scalarFields = [
    "transaction_id",
    "mission_id",
    "wave_id",
    "agent_id",
    "provider"
  ];
  for (const field of scalarFields) {
    if (envelope[field] !== request[field] ||
        observation[field] !== request[field]) {
      addCode(codes, "OCI_SANDBOX_TRANSACTION_BINDING_MISMATCH");
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
    [observation.probe_observation_ref, probeRef],
    [executor.execution_envelope_ref, envelopeRef],
    [executor.execution_observation_ref, observationRef]
  ];
  if (refBindings.some(([left, right]) => !sameRef(left, right))) {
    addCode(codes, "OCI_SANDBOX_ARTIFACT_REF_MISMATCH");
  }
  if (executionEvent.state !== "executing" ||
      !sameRef(executionEvent.request_ref, requestRef) ||
      !sameRef(executionEvent.decision_ref, decisionRef)) {
    addCode(codes, "OCI_SANDBOX_EXECUTION_EVENT_MISMATCH");
  }
  if (probe.transaction_id !== request.transaction_id) {
    addCode(codes, "OCI_SANDBOX_PROBE_TRANSACTION_MISMATCH");
  }

  const expectedImage = {
    image_id: policy.image.image_id,
    operating_system: policy.image.operating_system,
    architecture: policy.image.architecture
  };
  const launch = expectedLaunch(
    policy,
    rule,
    repositoryRoot,
    envelope.launch.container_name
  );
  if (!sameObject(envelope.image, expectedImage) ||
      !sameObject(envelope.launch, launch)) {
    addCode(codes, "OCI_SANDBOX_LAUNCH_MISMATCH");
  }
  if (envelope.runtime.docker_cli_sha256 !== adapter.runtime_sha256 ||
      envelope.runtime.architecture !== policy.image.architecture ||
      envelope.runtime.operating_system !== "linux" ||
      envelope.runtime.cgroup_version !== "2") {
    addCode(codes, "OCI_SANDBOX_RUNTIME_MEASUREMENT_MISMATCH");
  }
  for (const field of [
    "adapter_id",
    "adapter_version",
    "adapter_sha256",
    "runtime_sha256",
    "probe_sha256",
    "execution_mode"
  ]) {
    if (executor[field] !== adapter[field]) {
      addCode(codes, "OCI_SANDBOX_ADAPTER_MISMATCH");
      break;
    }
  }
  if (envelope.sandbox_profile_sha256 !== policy.sandbox_profile_sha256 ||
      observation.sandbox_profile_sha256 !== policy.sandbox_profile_sha256 ||
      executor.sandbox_profile_sha256 !== policy.sandbox_profile_sha256 ||
      envelope.network_policy_sha256 !==
        policy.network_controls.network_policy_sha256 ||
      observation.network_policy_sha256 !==
        policy.network_controls.network_policy_sha256 ||
      executor.network_policy_sha256 !==
        policy.network_controls.network_policy_sha256) {
    addCode(codes, "OCI_SANDBOX_CONTROL_PROFILE_MISMATCH");
  }

  const envelopeStart = timestamp(envelope.issued_at);
  const envelopeEnd = timestamp(envelope.expires_at);
  const observationStart = timestamp(observation.started_at);
  const observationEnd = timestamp(observation.finished_at);
  const probeTime = timestamp(probe.collected_at);
  const eventTime = timestamp(executionEvent.recorded_at);
  const evaluatedTime = timestamp(evaluatedAt);
  const decisionEnd = timestamp(decision.valid_until);
  const policyEnd = timestamp(policy.expires_at);
  if ([envelopeStart, envelopeEnd, observationStart, observationEnd, probeTime,
    eventTime, evaluatedTime, decisionEnd, policyEnd].includes(null) ||
      envelopeStart < eventTime || envelopeStart >= envelopeEnd ||
      observationStart < envelopeStart || observationStart >= envelopeEnd ||
      probeTime < observationStart || probeTime > observationEnd ||
      observationEnd > envelopeEnd || evaluatedTime < observationEnd ||
      envelopeEnd > decisionEnd || envelopeEnd > policyEnd) {
    addCode(codes, "OCI_SANDBOX_TIME_BINDING_INVALID");
  }

  if (!sameRepositoryState(
    envelope.repository_state_before,
    decision.repository_state_before
  ) ||
      !sameRepositoryState(
        observation.repository_state_before,
        envelope.repository_state_before
      ) ||
      !sameRepositoryState(
        observation.repository_state_after,
        repositoryStateAfter
      ) ||
      !sameRepositoryState(
        observation.repository_state_before,
        observation.repository_state_after
      )) {
    addCode(codes, "OCI_SANDBOX_REPOSITORY_STATE_MISMATCH");
  }

  verifyRuntimeConfig(policy, envelope, observation, repositoryRoot, codes);
  verifyProbe(policy, rule, probe, result, codes);
  const processResult = observation.process || {};
  const expectedStatus = processResult.termination_reason === "exited" &&
    (rule.success_exit_codes || []).includes(processResult.exit_code)
    ? "succeeded"
    : "failed";
  if (status !== expectedStatus ||
      result.status !== expectedStatus ||
      Number(exitCode) !== processResult.exit_code ||
      result.exit_code !== processResult.exit_code ||
      processResult.exit_code !== (probe.child || {}).exit_code ||
      observation.result_sha256 !== objectDigest(result) ||
      observation.container.image_id !== policy.image.image_id ||
      observation.container.container_name !==
        envelope.launch.container_name ||
      observation.container.state !== "exited" ||
      observation.container.exit_code !==
        expectedSupervisorExitCode(probe.child || {}) ||
      observation.container.oom_killed !== false ||
      observation.container.error !== "" ||
      observation.cleanup.container_removed !== true) {
    addCode(codes, "OCI_SANDBOX_EXECUTION_RESULT_MISMATCH");
  }

  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    policy_id: policy.id,
    rule_id: rule.rule_id || "unknown",
    envelope_id: envelope.id,
    probe_id: probe.id,
    observation_id: observation.id,
    result_sha256: observation.result_sha256,
    valid_until: envelope.expires_at
  };
}

module.exports = {
  dockerCreateArgv,
  expectedLaunch,
  networkPolicyDigest,
  objectDigest,
  runtimeConfigDigest,
  sandboxProfileDigest,
  signOciSandboxExecutionEnvelope: (payload, privateKeyPem) =>
    signArtifact(payload, privateKeyPem, "envelope_sha256"),
  signOciSandboxExecutionObservation: (payload, privateKeyPem) =>
    signArtifact(payload, privateKeyPem, "observation_sha256"),
  verifyOciLinuxSandboxPolicy,
  verifyOciSandboxExecutionBundle
};
