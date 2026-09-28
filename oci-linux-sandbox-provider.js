#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const {
  resolveRepository,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const {
  acquireRepositoryLease,
  releaseRepositoryLease,
  renewRepositoryLease
} = require("./repository-lease");
const {
  inputDigest,
  runtimeRepositoryState,
  sameRepositoryState
} = require("./dispatch-runtime-controller");
const {
  beginGatewayExecution,
  commitGatewayExecution,
  gatewayTransactionContext,
  recoverGatewayTransaction
} = require("./protected-tool-gateway");
const {
  dockerCreateArgv,
  expectedLaunch,
  objectDigest,
  runtimeConfigDigest,
  signOciSandboxExecutionEnvelope,
  signOciSandboxExecutionObservation,
  verifyOciLinuxSandboxPolicy
} = require("./oci-linux-sandbox-evidence");
const { publicKeyId } = require("./verification-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");

const ADAPTER_ID = "cannae-oci-linux-sandbox-provider";
const ADAPTER_VERSION = "0.1.0";
const KINDS = Object.freeze({
  policy: "oci-linux-sandbox-policies",
  envelope: "oci-sandbox-execution-envelopes",
  probe: "oci-sandbox-probe-observations",
  observation: "oci-sandbox-execution-observations"
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function nowIso() {
  return new Date().toISOString();
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return parsed;
}

function authority() {
  return {
    human_final_decision_authority: "USER",
    self_approval_prohibited: true,
    production_execution_authorized: false,
    release_authorized: false
  };
}

function assertValid(payload, type, label) {
  const validation = validatePayload(payload, type);
  const failures = validation.issues.filter(item =>
    item.severity === "error" || item.severity === "critical");
  if (failures.length > 0) {
    throw new Error(
      `${label} failed validation: ${unique(failures.map(item => item.code)).join(", ")}`
    );
  }
}

function artifactRef(result, artifactId) {
  return {
    artifact_id: artifactId,
    relative_path: result.relative_path,
    sha256: result.sha256
  };
}

function storeView(options) {
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(
    options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")
  );
  const verification = verifyRepositoryArtifacts({
    repositoryPath: repository.root,
    artifactRoot
  });
  if (!verification.valid) {
    throw new Error(
      `Repository artifact store is invalid: ${verification.issues.map(item => item.code).join(", ")}`
    );
  }
  const namespacePath = path.join(
    artifactRoot,
    "repositories",
    repository.key
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(namespacePath, "manifest.json"), "utf8")
  );
  return {
    artifactRoot,
    manifest,
    namespacePath,
    repository,
    verification
  };
}

function safeArtifactPath(view, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]+/).includes("..")) {
    throw new Error("Artifact reference path is unsafe.");
  }
  const candidate = path.resolve(view.artifactRoot, relativePath);
  if (candidate !== view.artifactRoot &&
      !candidate.startsWith(`${view.artifactRoot}${path.sep}`)) {
    throw new Error("Artifact reference resolves outside the artifact root.");
  }
  return candidate;
}

function loadEntry(view, entry) {
  const bytes = fs.readFileSync(safeArtifactPath(view, entry.relative_path));
  if (sha256(bytes) !== entry.sha256) {
    throw new Error(`Artifact bytes changed: ${entry.relative_path}`);
  }
  return JSON.parse(bytes.toString("utf8"));
}

function listArtifacts(view, kind) {
  return (view.manifest.artifacts || [])
    .filter(entry => !kind || entry.kind === kind)
    .map(entry => ({
      entry,
      payload: loadEntry(view, entry),
      ref: {
        artifact_id: entry.artifact_id,
        relative_path: entry.relative_path,
        sha256: entry.sha256
      }
    }));
}

function loadArtifactRef(view, ref, type) {
  const matches = (view.manifest.artifacts || []).filter(entry =>
    ref &&
    entry.artifact_id === ref.artifact_id &&
    entry.relative_path === ref.relative_path &&
    entry.sha256 === ref.sha256);
  if (matches.length !== 1) {
    throw new Error(
      `Artifact reference is not uniquely retained: ${ref && ref.artifact_id || "missing"}`
    );
  }
  const payload = loadEntry(view, matches[0]);
  assertValid(payload, type, type);
  return {
    entry: matches[0],
    payload,
    ref: clone(ref)
  };
}

function writeJsonArtifact(options, providerLease, descriptor) {
  renewRepositoryLease(providerLease);
  const repository = resolveRepository(options.repository);
  const artifactRoot = path.resolve(
    options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")
  );
  const result = writeRepositoryArtifact({
    repositoryPath: repository.root,
    artifactRoot,
    missionId: descriptor.missionId,
    waveId: descriptor.waveId,
    kind: descriptor.kind,
    artifactId: descriptor.artifactId,
    payload: descriptor.payload,
    createdAt: descriptor.createdAt
  });
  return {
    result,
    ref: artifactRef(result, descriptor.artifactId)
  };
}

function assertRepositoryBinding(repository, binding) {
  if (!binding ||
      binding.repository_key !== repository.key ||
      binding.identity_fingerprint !== repository.identity_fingerprint) {
    throw new Error("OCI sandbox policy does not match the target repository.");
  }
}

function findExecutable(name) {
  if (name.includes(path.sep)) {
    const candidate = fs.realpathSync(path.resolve(name));
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  }
  for (const directory of String(process.env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      if (fs.statSync(candidate).isFile()) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return fs.realpathSync(candidate);
      }
    } catch (error) {
      // Continue searching PATH.
    }
  }
  throw new Error(`Executable not found on PATH: ${name}`);
}

function dockerPath(options = {}) {
  return findExecutable(options.dockerPath || "docker");
}

function probePath(options = {}) {
  const candidate = fs.realpathSync(
    path.resolve(options.probePath || "")
  );
  if (!fs.statSync(candidate).isFile()) {
    throw new Error("OCI sandbox probe must be a regular file.");
  }
  return candidate;
}

function runSync(executable, args, label, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
    env: options.env || process.env
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      `${label} failed: ${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`
    );
  }
  return result;
}

function dockerJson(executable, args, label) {
  const result = runSync(executable, args, label);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

function ociSandboxRuntimeMeasurements(options = {}) {
  const executable = dockerPath(options);
  const probe = probePath(options);
  return {
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    adapter_sha256: fileSha256(__filename),
    runtime_sha256: fileSha256(executable),
    probe_sha256: fileSha256(probe),
    execution_mode: "oci_linux_sandbox_reference"
  };
}

function dockerRuntimeInfo(executable) {
  const version = dockerJson(
    executable,
    ["version", "--format", "{{json .}}"],
    "Docker version appraisal"
  );
  const info = dockerJson(
    executable,
    ["info", "--format", "{{json .}}"],
    "Docker daemon appraisal"
  );
  const server = version.Server || {};
  const client = version.Client || {};
  const components = Array.isArray(server.Components)
    ? server.Components
    : [];
  const runtime = components.find(item => item.Name === "runc") ||
    components.find(item => item.Name === "containerd") || {};
  const securityOptions = unique(
    (info.SecurityOptions || []).map(String)
  ).sort();
  const rawArchitecture = info.Architecture || server.Arch ||
    server.Architecture;
  const architecture = {
    aarch64: "arm64",
    arm64: "arm64",
    x86_64: "amd64",
    amd64: "amd64"
  }[rawArchitecture] || rawArchitecture;
  const operatingSystem = String(
    info.OSType || server.Os || server.OSType || ""
  ).toLowerCase();
  const cgroupVersion = String(info.CgroupVersion || "");
  if (operatingSystem !== "linux" ||
      !["amd64", "arm64"].includes(architecture) ||
      cgroupVersion !== "2" ||
      !securityOptions.some(item => item.includes("seccomp"))) {
    throw new Error(
      "OCI sandbox reference provider requires a Linux amd64/arm64 Docker daemon with cgroup v2 and seccomp."
    );
  }
  return {
    docker_cli_sha256: fileSha256(executable),
    client_version: String(client.Version || "unknown"),
    server_version: String(server.Version || info.ServerVersion || "unknown"),
    api_version: String(server.ApiVersion || client.ApiVersion || "unknown"),
    runtime_name: String(runtime.Name || info.DefaultRuntime || "unknown"),
    runtime_version: String(runtime.Version || "unknown"),
    operating_system: operatingSystem,
    architecture,
    kernel_version: String(info.KernelVersion || server.KernelVersion || "unknown"),
    cgroup_version: cgroupVersion,
    security_options: securityOptions,
    rootless: securityOptions.some(item => item.includes("rootless")),
    userns_remap: securityOptions.some(item => item.includes("userns"))
  };
}

function assertAdapterPrivateKey(policy, privateKeyPem) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const keyId = publicKeyId(crypto.createPublicKey(privateKey));
  if (privateKey.asymmetricKeyType !== "ed25519" ||
      keyId !== policy.adapter_profile.signing_key_id) {
    throw new Error("OCI sandbox private key does not match the policy.");
  }
}

function deterministicId(prefix, ...parts) {
  return `${prefix}-${sha256(Buffer.from(parts.join(":"))).slice(0, 24)}`;
}

function persistOciLinuxSandboxPolicy(options, policy) {
  assertValid(policy, "oci-linux-sandbox-policy", "OCI Linux sandbox policy");
  const policyVerification = verifyOciLinuxSandboxPolicy(policy);
  if (!policyVerification.valid) {
    throw new Error(
      `OCI Linux sandbox policy failed appraisal: ${policyVerification.codes.join(", ")}`
    );
  }
  const repository = resolveRepository(options.repository);
  assertRepositoryBinding(repository, policy.repository_binding);
  const result = writeRepositoryArtifact({
    repositoryPath: repository.root,
    artifactRoot: path.resolve(
      options.artifactRoot || path.join(repository.root, ".cannae", "artifacts")
    ),
    missionId: options.missionId,
    waveId: options.waveId,
    kind: KINDS.policy,
    artifactId: policy.id,
    payload: policy,
    createdAt: policy.valid_from
  });
  return {
    policy: clone(policy),
    policy_ref: artifactRef(result, policy.id),
    production_execution_authorized: false,
    release_authorized: false
  };
}

function activePolicy(view, ref, evaluatedAt) {
  const record = loadArtifactRef(
    view,
    ref,
    "oci-linux-sandbox-policy"
  );
  assertRepositoryBinding(view.repository, record.payload.repository_binding);
  const verification = verifyOciLinuxSandboxPolicy(
    record.payload,
    evaluatedAt
  );
  if (!verification.valid) {
    throw new Error(
      `OCI Linux sandbox policy is unavailable: ${verification.codes.join(", ")}`
    );
  }
  return record;
}

function selectedRule(policy, toolInput, request) {
  const matches = policy.rules.filter(
    item => item.rule_id === toolInput.rule_id
  );
  if (matches.length !== 1) {
    throw new Error(
      "OCI sandbox tool input does not select exactly one policy rule."
    );
  }
  const rule = matches[0];
  if (!policy.providers.includes(request.provider) ||
      rule.tool_name !== request.tool_call.tool_name ||
      rule.operation_class !== request.tool_call.operation_class ||
      rule.operation_class !== "process_execute") {
    throw new Error("OCI sandbox rule does not match the gateway request.");
  }
  if (inputDigest(toolInput) !== request.tool_call.tool_input_sha256) {
    throw new Error(
      "OCI sandbox tool input does not match the gateway request digest."
    );
  }
  if (policy.gateway_binding_sha256 !== objectDigest(request.gateway)) {
    throw new Error(
      "OCI sandbox policy does not bind the trusted gateway projection."
    );
  }
  return rule;
}

function safeRepositoryFile(repository, relativePath, expectedSha256, label) {
  if (typeof relativePath !== "string" ||
      relativePath.startsWith("/") ||
      relativePath.includes("\\") ||
      relativePath.split("/").some(part =>
        !part || part === "." || part === "..")) {
    throw new Error(`${label} path is unsafe.`);
  }
  const candidate = fs.realpathSync(path.resolve(repository.root, relativePath));
  if (candidate !== repository.root &&
      !candidate.startsWith(`${repository.root}${path.sep}`)) {
    throw new Error(`${label} escapes the repository.`);
  }
  if (!fs.statSync(candidate).isFile() ||
      fileSha256(candidate) !== expectedSha256) {
    throw new Error(`${label} digest changed.`);
  }
  return candidate;
}

function seccompProfile(repository, policy) {
  const filePath = safeRepositoryFile(
    repository,
    policy.seccomp.profile_relative_path,
    policy.seccomp.profile_sha256,
    "Seccomp profile"
  );
  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error("Seccomp profile is not valid JSON.");
  }
  if (profile.defaultAction !== policy.seccomp.default_action) {
    throw new Error("Seccomp profile default action does not match policy.");
  }
  return { filePath, profile };
}

function imageAppraisal(executable, policy) {
  const images = dockerJson(
    executable,
    ["image", "inspect", policy.image.image_id],
    "OCI image appraisal"
  );
  if (!Array.isArray(images) || images.length !== 1) {
    throw new Error("OCI image reference is not uniquely available.");
  }
  const image = images[0];
  const config = image.Config || {};
  if (image.Id !== policy.image.image_id ||
      String(image.Os || "").toLowerCase() !== policy.image.operating_system ||
      image.Architecture !== policy.image.architecture ||
      !Array.isArray(config.Entrypoint) ||
      config.Entrypoint.length !== 1 ||
      config.Entrypoint[0] !== "/cannae-probe" ||
      objectDigest(config.Env || []) !== objectDigest(["PATH="])) {
    throw new Error("OCI image does not match the pinned probe image policy.");
  }
  const appraisalRoot = fs.mkdtempSync(
    path.join(fs.realpathSync("/tmp"), "cannae-image-probe-")
  );
  const extractedProbe = path.join(appraisalRoot, "cannae-probe");
  const containerName = `cannae-appraise-${sha256(Buffer.from([
    policy.id,
    policy.repository_binding.identity_fingerprint,
    policy.image.image_id,
    policy.adapter_profile.probe_sha256
  ].join(":"))).slice(0, 24)}`;
  let containerId = containerName;
  let appraisalError = null;
  try {
    const staleCleanupFailure = bestEffortRemove(executable, containerName);
    if (staleCleanupFailure) {
      throw new Error(staleCleanupFailure);
    }
    const created = runSync(executable, [
      "container",
      "create",
      "--name",
      containerName,
      "--pull",
      "never",
      "--read-only",
      "--network",
      "none",
      "--entrypoint",
      "/cannae-probe",
      policy.image.image_id,
      "workload",
      "success"
    ], "OCI image probe appraisal");
    const createdId = created.stdout.trim();
    if (!/^[a-f0-9]{64}$/.test(createdId)) {
      throw new Error(
        "OCI image probe appraisal returned an invalid container identifier."
      );
    }
    containerId = createdId;
    runSync(
      executable,
      ["container", "cp", `${containerId}:/cannae-probe`, extractedProbe],
      "OCI image probe extraction"
    );
    const stat = fs.lstatSync(extractedProbe);
    if (!stat.isFile() ||
        fileSha256(extractedProbe) !== policy.adapter_profile.probe_sha256) {
      throw new Error(
        "OCI image probe digest does not match the measured host probe."
      );
    }
  } catch (error) {
    appraisalError = error;
  } finally {
    try {
      removeContainer(executable, containerId);
    } catch (cleanupError) {
      appraisalError = new Error(
        `${appraisalError ? `${appraisalError.message} ` : ""}` +
        `Image appraisal cleanup failed: ${cleanupError.message}`
      );
    }
    fs.rmSync(appraisalRoot, { recursive: true, force: true });
  }
  if (appraisalError) throw appraisalError;
  return image;
}

function assertRuntimePolicy(
  policy,
  rule,
  request,
  decision,
  options,
  evaluatedAt
) {
  const measurements = ociSandboxRuntimeMeasurements(options);
  for (const field of [
    "adapter_id",
    "adapter_version",
    "adapter_sha256",
    "runtime_sha256",
    "probe_sha256",
    "execution_mode"
  ]) {
    if (policy.adapter_profile[field] !== measurements[field]) {
      throw new Error(
        `OCI sandbox runtime measurement mismatch: ${field}.`
      );
    }
  }
  const executable = dockerPath(options);
  const runtime = dockerRuntimeInfo(executable);
  if (runtime.architecture !== policy.image.architecture) {
    throw new Error("OCI image architecture does not match Docker daemon.");
  }
  const evaluatedTime = timestamp(evaluatedAt, "Provider evaluation time");
  const deadline = Math.min(
    timestamp(policy.expires_at, "Sandbox policy expires_at"),
    timestamp(decision.valid_until, "Gateway decision valid_until")
  );
  if (evaluatedTime + rule.timeout_ms + 15000 >= deadline) {
    throw new Error(
      "OCI sandbox validity window cannot cover container execution."
    );
  }
  if (request.tool_call.operation_class !== "process_execute") {
    throw new Error(
      "OCI sandbox provider accepts process_execute requests only."
    );
  }
  return { executable, measurements, runtime };
}

function providerLock(options, timeoutMs) {
  const view = storeView(options);
  const lockRoot = path.join(
    view.namespacePath,
    ".oci-linux-sandbox-provider",
    "transaction-store"
  );
  return acquireRepositoryLease(lockRoot, {
    leaseTimeoutMs: options.lockTimeoutMs || 5000,
    leaseTtlMs: Math.max(
      options.lockTtlMs || 0,
      Number(timeoutMs || 0) + 60000,
      60000
    )
  });
}

function buildEnvelope(
  context,
  policyRecord,
  toolInput,
  rule,
  repositoryRoot,
  runtime,
  privateKeyPem
) {
  const issuedAt = nowIso();
  const expiresAt = new Date(Math.min(
    timestamp(policyRecord.payload.expires_at, "Sandbox policy expires_at"),
    timestamp(context.decision.valid_until, "Gateway decision valid_until"),
    timestamp(issuedAt, "Envelope issued_at") + rule.timeout_ms + 15000
  )).toISOString();
  const containerName = `cannae-${sha256(Buffer.from(
    `${context.request.transaction_id}:${context.latest_event_ref.sha256}`
  )).slice(0, 24)}`;
  return signOciSandboxExecutionEnvelope({
    schema_version: "0.1",
    type: "OciSandboxExecutionEnvelope",
    id: deterministicId(
      "OSE",
      context.request.transaction_id,
      context.latest_event_ref.sha256,
      policyRecord.ref.sha256
    ),
    transaction_id: context.request.transaction_id,
    mission_id: context.request.mission_id,
    wave_id: context.request.wave_id,
    agent_id: context.request.agent_id,
    provider: context.request.provider,
    request_ref: clone(context.request_ref),
    decision_ref: clone(context.decision_ref),
    execution_event_ref: clone(context.latest_event_ref),
    sandbox_policy_ref: clone(policyRecord.ref),
    tool_input_sha256: inputDigest(toolInput),
    rule_id: rule.rule_id,
    image: {
      image_id: policyRecord.payload.image.image_id,
      operating_system: policyRecord.payload.image.operating_system,
      architecture: policyRecord.payload.image.architecture
    },
    launch: expectedLaunch(
      policyRecord.payload,
      rule,
      repositoryRoot,
      containerName
    ),
    runtime: clone(runtime),
    sandbox_profile_sha256:
      policyRecord.payload.sandbox_profile_sha256,
    network_policy_sha256:
      policyRecord.payload.network_controls.network_policy_sha256,
    repository_binding: clone(context.request.repository_binding),
    repository_state_before: clone(context.decision.repository_state_before),
    issued_at: issuedAt,
    expires_at: expiresAt,
    authority: authority()
  }, privateKeyPem);
}

function securityOptionsAppraisal(rawOptions, seccompPath, profile) {
  const options = Array.isArray(rawOptions) ? rawOptions.map(String) : [];
  if (!options.includes("no-new-privileges=true")) {
    throw new Error("Docker did not retain no-new-privileges.");
  }
  const seccompOption = options.find(item => item.startsWith("seccomp="));
  if (!seccompOption || seccompOption === "seccomp=unconfined") {
    throw new Error("Docker did not retain a confined seccomp profile.");
  }
  const value = seccompOption.slice("seccomp=".length);
  let matches = value === seccompPath;
  if (!matches && value.startsWith("{")) {
    try {
      matches = objectDigest(JSON.parse(value)) === objectDigest(profile);
    } catch (error) {
      matches = false;
    }
  }
  if (!matches) {
    throw new Error("Docker seccomp configuration differs from the pinned profile.");
  }
  return true;
}

function tmpfsConfigProjection(hostConfig, filesystemControls) {
  const rawTmpfs = hostConfig.Tmpfs || {};
  const destination = filesystemControls.tmpfs_destination;
  const rawSpec = rawTmpfs[destination];
  if (typeof rawSpec !== "string") {
    throw new Error("Docker did not retain the required tmpfs mount.");
  }
  const options = [];
  let sizeBytes = null;
  for (const item of rawSpec.split(",")) {
    if (item.startsWith("size=")) {
      const value = Number(item.slice("size=".length));
      if (!Number.isSafeInteger(value) || value < 1 || sizeBytes !== null) {
        throw new Error("Docker retained an invalid tmpfs size.");
      }
      sizeBytes = value;
    } else {
      options.push(item);
    }
  }
  options.sort();
  const expectedOptions = [...filesystemControls.tmpfs_options].sort();
  if (sizeBytes !== filesystemControls.tmpfs_size_bytes ||
      objectDigest(options) !== objectDigest(expectedOptions)) {
    throw new Error("Docker tmpfs configuration differs from policy.");
  }
  return {
    destination,
    size_bytes: sizeBytes,
    options
  };
}

function runtimeConfigProjection(
  inspect,
  repositoryRoot,
  policy,
  envelope,
  profileRecord
) {
  const config = inspect.Config || {};
  const host = inspect.HostConfig || {};
  const mount = (inspect.Mounts || []).find(
    item => item.Destination === "/workspace"
  );
  securityOptionsAppraisal(
    host.SecurityOpt,
    profileRecord.filePath,
    profileRecord.profile
  );
  const projection = {
    user: String(config.User || ""),
    entrypoint: clone(config.Entrypoint || []),
    command: clone(config.Cmd || []),
    environment: clone(config.Env || []),
    read_only_rootfs: host.ReadonlyRootfs === true,
    network_mode: String(host.NetworkMode || ""),
    tmpfs: tmpfsConfigProjection(host, policy.filesystem_controls),
    cap_drop: clone(host.CapDrop || []),
    security_options: [
      "no-new-privileges=true",
      `seccomp-sha256=${policy.seccomp.profile_sha256}`
    ],
    cgroupns_mode: String(host.CgroupnsMode || ""),
    pid_mode: String(host.PidMode || "private"),
    ipc_mode: String(host.IpcMode || ""),
    uts_mode: String(host.UTSMode || "private"),
    init: host.Init === true,
    pids_limit: Number(host.PidsLimit),
    memory_bytes: Number(host.Memory),
    memory_swap_bytes: Number(host.MemorySwap),
    cpu_period_us: Number(host.CpuPeriod),
    cpu_quota_us: Number(host.CpuQuota),
    repository_mount: {
      destination: mount && mount.Destination || "",
      source_sha256: sha256(Buffer.from(
        mount && fs.realpathSync(mount.Source) || ""
      )),
      read_only: mount && mount.RW === false,
      propagation: mount && String(mount.Propagation || "unknown")
    }
  };
  const expected = {
    user: `${policy.process_controls.uid}:${policy.process_controls.gid}`,
    entrypoint: ["/cannae-probe"],
    command: envelope.launch.command,
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
    pids_limit: policy.resource_controls.pids_limit,
    memory_bytes: policy.resource_controls.memory_bytes,
    memory_swap_bytes: policy.resource_controls.memory_swap_bytes,
    cpu_period_us: policy.resource_controls.cpu_period_us,
    cpu_quota_us: policy.resource_controls.cpu_quota_us
  };
  for (const [field, value] of Object.entries(expected)) {
    if (objectDigest(projection[field]) !== objectDigest(value)) {
      throw new Error(`Docker runtime config mismatch: ${field}.`);
    }
  }
  if (!mount || fs.realpathSync(mount.Source) !== repositoryRoot ||
      mount.Destination !== "/workspace" || mount.RW !== false ||
      mount.Propagation !== "rprivate") {
    throw new Error("Docker repository mount is not the exact read-only repository.");
  }
  return {
    ...projection,
    config_sha256: runtimeConfigDigest(projection)
  };
}

function inspectContainer(executable, containerId) {
  const items = dockerJson(
    executable,
    ["container", "inspect", containerId],
    "Docker container inspection"
  );
  if (!Array.isArray(items) || items.length !== 1) {
    throw new Error("Docker container inspection was not unique.");
  }
  return items[0];
}

function runWait(executable, containerId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["container", "wait", containerId], {
      env: process.env,
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    child.stdout.on("data", chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
    child.once("error", error => finish(error));
    child.once("close", code => {
      const output = Buffer.concat(stdout).toString("utf8").trim();
      if (code !== 0 || !/^[0-9]+$/.test(output)) {
        finish(new Error(
          `Docker wait failed: ${Buffer.concat(stderr).toString("utf8").trim() || output}`
        ));
        return;
      }
      finish(null, Number(output));
    });
    const timer = setTimeout(() => {
      runSync(
        executable,
        ["container", "kill", containerId],
        "Docker timeout containment",
        { allowFailure: true }
      );
      finish(new Error("Docker container wait exceeded the provider deadline."));
    }, timeoutMs);
  });
}

function retainedProbe(raw, transactionId, policy, envelope) {
  return {
    schema_version: "0.1",
    type: "OciSandboxProbeObservation",
    id: deterministicId(
      "OSPO",
      transactionId,
      envelope.envelope_sha256
    ),
    transaction_id: transactionId,
    probe_sha256: policy.adapter_profile.probe_sha256,
    platform: raw.platform,
    status: clone(raw.status),
    namespaces: clone(raw.namespaces),
    mounts: clone(raw.mounts),
    cgroup: clone(raw.cgroup),
    network: clone(raw.network),
    write_tests: clone(raw.write_tests),
    child: clone(raw.child),
    collected_at: raw.collected_at
  };
}

function processResult(probe, successExitCodes) {
  const child = probe.child;
  const status = child.termination_reason === "exited" &&
    successExitCodes.includes(child.exit_code)
    ? "succeeded"
    : "failed";
  return {
    schema_version: "0.1",
    type: "OciSandboxProcessResult",
    status,
    exit_code: child.exit_code,
    signal: child.signal,
    termination_reason: child.termination_reason,
    stdout_base64: child.stdout.base64,
    stderr_base64: child.stderr.base64,
    stdout_truncated: child.stdout.truncated,
    stderr_truncated: child.stderr.truncated
  };
}

function assertContainerAbsent(executable, container) {
  const byId = /^[a-f0-9]{64}$/.test(container);
  if (!byId && !/^cannae-(?:appraise-)?[a-f0-9]{24}$/.test(container)) {
    throw new Error("Docker cleanup target is not an exact provider container identifier.");
  }
  // A failed inspect cannot distinguish absence from an unavailable daemon.
  const check = runSync(
    executable,
    ["container", "ls", "--all", "--no-trunc", "--filter",
      `${byId ? "id" : "name"}=${container}`, "--format", "{{json .}}"],
    "Docker cleanup absence verification"
  );
  if (check.stderr.trim()) {
    throw new Error("Docker cleanup absence verification returned diagnostics.");
  }
  const seenIds = new Set();
  for (const line of check.stdout.split(/\r?\n/).filter(value => value.trim())) {
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error("Docker cleanup absence verification returned invalid JSON.");
    }
    if (!row || Array.isArray(row) || typeof row.ID !== "string" || !/^[a-f0-9]{64}$/.test(row.ID) ||
        typeof row.Names !== "string" || !row.Names.trim() || seenIds.has(row.ID)) {
      throw new Error("Docker cleanup absence verification returned an invalid container row.");
    }
    seenIds.add(row.ID);
    const names = row.Names.split(",").map(name => name.trim());
    if (names.some(name => !/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)*$/.test(name)) ||
        (byId && row.ID !== container) ||
        (!byId && !names.some(name => name.includes(container)))) {
      throw new Error("Docker cleanup absence verification returned an ambiguous target.");
    }
    // Docker's name filter also returns substring matches, not only this name.
    if (byId || names.includes(container)) {
      throw new Error("Docker container still exists after cleanup.");
    }
  }
}

function removeContainer(executable, containerId) {
  runSync(
    executable,
    ["container", "rm", "--force", containerId],
    "Docker container cleanup"
  );
  assertContainerAbsent(executable, containerId);
}

function buildObservation(
  context,
  policyRecord,
  envelopeRecord,
  probeRecord,
  runtimeConfig,
  container,
  result,
  repositoryStateAfter,
  privateKeyPem
) {
  return signOciSandboxExecutionObservation({
    schema_version: "0.1",
    type: "OciSandboxExecutionObservation",
    id: deterministicId(
      "OSO",
      context.request.transaction_id,
      envelopeRecord.ref.sha256
    ),
    transaction_id: context.request.transaction_id,
    mission_id: context.request.mission_id,
    wave_id: context.request.wave_id,
    agent_id: context.request.agent_id,
    provider: context.request.provider,
    request_ref: clone(context.request_ref),
    decision_ref: clone(context.decision_ref),
    execution_event_ref: clone(context.latest_event_ref),
    sandbox_policy_ref: clone(policyRecord.ref),
    execution_envelope_ref: clone(envelopeRecord.ref),
    probe_observation_ref: clone(probeRecord.ref),
    tool_input_sha256: context.request.tool_call.tool_input_sha256,
    rule_id: probeRecord.payload.transaction_id ===
      context.request.transaction_id
      ? envelopeRecord.payload.rule_id
      : "invalid",
    container: clone(container),
    runtime_config: clone(runtimeConfig),
    process: {
      spawned: probeRecord.payload.child.spawned,
      exit_code: probeRecord.payload.child.exit_code,
      signal: probeRecord.payload.child.signal,
      termination_reason: probeRecord.payload.child.termination_reason,
      timed_out: probeRecord.payload.child.timed_out,
      output_limit_exceeded:
        probeRecord.payload.child.output_limit_exceeded
    },
    result_sha256: objectDigest(result),
    sandbox_profile_sha256:
      policyRecord.payload.sandbox_profile_sha256,
    network_policy_sha256:
      policyRecord.payload.network_controls.network_policy_sha256,
    repository_binding: clone(context.request.repository_binding),
    repository_state_before: clone(context.decision.repository_state_before),
    repository_state_after: clone(repositoryStateAfter),
    cleanup: {
      container_removed: true,
      verified_at: nowIso()
    },
    started_at: probeRecord.payload.child.started_at,
    finished_at: nowIso(),
    authority: authority()
  }, privateKeyPem);
}

function existingExecution(view, transactionId) {
  const kinds = [
    ["envelope", KINDS.envelope, "oci-sandbox-execution-envelope"],
    ["probe", KINDS.probe, "oci-sandbox-probe-observation"],
    ["observation", KINDS.observation, "oci-sandbox-execution-observation"]
  ];
  const result = {};
  for (const [name, kind, type] of kinds) {
    const matches = listArtifacts(view, kind).filter(
      item => item.payload.transaction_id === transactionId
    );
    if (matches.length > 1) {
      throw new Error(
        `OCI sandbox transaction has duplicate ${name} artifacts.`
      );
    }
    if (matches[0]) assertValid(matches[0].payload, type, type);
    result[name] = matches[0] || null;
  }
  return result;
}

function gatewayOptions(options, now) {
  return {
    repository: options.repository,
    artifactRoot: options.artifactRoot,
    gatewayBindingSha256: options.gatewayBindingSha256,
    verifiedPrincipalSha256: options.verifiedPrincipalSha256,
    now,
    lockTimeoutMs: options.gatewayLockTimeoutMs,
    lockTtlMs: options.gatewayLockTtlMs
  };
}

function bestEffortRemove(executable, container) {
  if (!executable || !container) return null;
  try {
    runSync(
      executable,
      ["container", "rm", "--force", container],
      "Docker recovery cleanup",
      { allowFailure: true }
    );
    assertContainerAbsent(executable, container);
    return null;
  } catch (error) {
    return `OCI_SANDBOX_CONTAINER_CLEANUP_ERROR: ${error.message}`;
  }
}

function retryEnvelopeCleanup(options, envelope) {
  try {
    return bestEffortRemove(
      dockerPath(options),
      envelope.launch.container_name
    );
  } catch (error) {
    return `OCI_SANDBOX_CONTAINER_CLEANUP_ERROR: ${error.message}`;
  }
}

async function executeOciLinuxSandbox(options, descriptor) {
  assertValid(
    descriptor.toolInput,
    "oci-sandbox-tool-input",
    "OCI sandbox tool input"
  );
  let view = storeView(options);
  let context = gatewayTransactionContext(
    gatewayOptions(options, nowIso()),
    descriptor.transactionId
  );
  if (inputDigest(descriptor.toolInput) !==
      context.request.tool_call.tool_input_sha256) {
    throw new Error(
      "OCI sandbox tool input does not match the gateway request digest."
    );
  }
  const retained = existingExecution(view, descriptor.transactionId);
  if (context.status.terminal && retained.envelope) {
    const cleanupFailure = context.status.state === "recovery_required"
      ? retryEnvelopeCleanup(options, retained.envelope.payload)
      : null;
    return {
      ...context.status,
      replayed: true,
      execution_envelope_ref: clone(retained.envelope.ref),
      execution_observation_ref: retained.observation
        ? clone(retained.observation.ref)
        : null,
      ...(cleanupFailure ? { provider_failure: cleanupFailure } : {}),
      production_execution_authorized: false,
      release_authorized: false
    };
  }
  let policyRecord = activePolicy(
    view,
    descriptor.toolInput.sandbox_policy_ref,
    nowIso()
  );
  if (!context.decision) {
    throw new Error("OCI sandbox transaction has no gateway decision.");
  }
  let rule = selectedRule(
    policyRecord.payload,
    descriptor.toolInput,
    context.request
  );
  assertRuntimePolicy(
    policyRecord.payload,
    rule,
    context.request,
    context.decision,
    options,
    nowIso()
  );
  assertAdapterPrivateKey(
    policyRecord.payload,
    options.adapterPrivateKeyPem
  );
  const lock = providerLock(options, rule.timeout_ms);
  let envelopeRecord = null;
  let activeContainer = null;
  let executable = null;
  try {
    view = storeView(options);
    policyRecord = activePolicy(
      view,
      descriptor.toolInput.sandbox_policy_ref,
      nowIso()
    );
    context = gatewayTransactionContext(
      gatewayOptions(options, nowIso()),
      descriptor.transactionId
    );
    if (!context.decision) {
      throw new Error("OCI sandbox transaction has no gateway decision.");
    }
    rule = selectedRule(
      policyRecord.payload,
      descriptor.toolInput,
      context.request
    );
    const existing = existingExecution(view, descriptor.transactionId);
    if (existing.envelope) {
      envelopeRecord = existing.envelope;
      const cleanupFailure = context.status.state === "committed"
        ? null
        : retryEnvelopeCleanup(options, existing.envelope.payload);
      if (context.status.terminal) {
        return {
          ...context.status,
          replayed: true,
          execution_envelope_ref: clone(existing.envelope.ref),
          execution_observation_ref: existing.observation
            ? clone(existing.observation.ref)
            : null,
          ...(cleanupFailure ? { provider_failure: cleanupFailure } : {}),
          production_execution_authorized: false,
          release_authorized: false
        };
      }
      const recovered = recoverGatewayTransaction(
        gatewayOptions(options, nowIso()),
        descriptor.transactionId
      );
      return {
        ...recovered,
        replayed: true,
        provider_failure: cleanupFailure
          ? `OCI_SANDBOX_EXECUTION_ALREADY_CLAIMED ${cleanupFailure}`
          : "OCI_SANDBOX_EXECUTION_ALREADY_CLAIMED",
        execution_envelope_ref: clone(existing.envelope.ref),
        execution_observation_ref: existing.observation
          ? clone(existing.observation.ref)
          : null,
        production_execution_authorized: false,
        release_authorized: false
      };
    }
    if (context.status.state !== "authorized") {
      throw new Error(
        `OCI sandbox transaction is not authorized: ${context.status.state}.`
      );
    }

    const runtimePolicy = assertRuntimePolicy(
      policyRecord.payload,
      rule,
      context.request,
      context.decision,
      options,
      nowIso()
    );
    executable = runtimePolicy.executable;
    const profileRecord = seccompProfile(
      view.repository,
      policyRecord.payload
    );
    imageAppraisal(executable, policyRecord.payload);
    const begun = beginGatewayExecution(
      gatewayOptions(options, nowIso()),
      descriptor.transactionId
    );
    if (begun.state !== "executing" || !begun.execution_event_ref) {
      throw new Error(
        "OCI sandbox provider could not claim gateway execution."
      );
    }
    context = gatewayTransactionContext(
      gatewayOptions(options, nowIso()),
      descriptor.transactionId
    );
    const envelope = buildEnvelope(
      context,
      policyRecord,
      descriptor.toolInput,
      rule,
      view.repository.root,
      runtimePolicy.runtime,
      options.adapterPrivateKeyPem
    );
    assertValid(
      envelope,
      "oci-sandbox-execution-envelope",
      "OCI sandbox execution envelope"
    );
    const envelopeWrite = writeJsonArtifact(options, lock, {
      missionId: envelope.mission_id,
      waveId: envelope.wave_id,
      kind: KINDS.envelope,
      artifactId: envelope.id,
      payload: envelope,
      createdAt: envelope.issued_at
    });
    envelopeRecord = {
      payload: envelope,
      ref: envelopeWrite.ref
    };
    if (options.faultInjectionStage === "after_envelope") {
      throw new Error(
        "Injected OCI sandbox failure after envelope persistence."
      );
    }

    const currentState = runtimeRepositoryState(view.repository.root);
    if (!sameRepositoryState(
      currentState,
      context.decision.repository_state_before
    )) {
      throw new Error(
        "Repository changed between gateway begin and container create."
      );
    }
    seccompProfile(view.repository, policyRecord.payload);
    imageAppraisal(executable, policyRecord.payload);
    const createArgv = dockerCreateArgv(
      policyRecord.payload,
      rule,
      view.repository.root,
      envelope.launch.container_name
    );
    if (objectDigest(createArgv) !==
        envelope.launch.docker_create_argv_sha256) {
      throw new Error("Docker create argv changed after envelope persistence.");
    }
    activeContainer = envelope.launch.container_name;
    const created = runSync(
      executable,
      createArgv,
      "Docker container create"
    );
    const createdId = created.stdout.trim();
    if (!/^[a-f0-9]{64}$/.test(createdId)) {
      throw new Error("Docker create returned an invalid container identifier.");
    }
    activeContainer = createdId;
    if (options.faultInjectionStage === "after_create") {
      throw new Error(
        "Injected OCI sandbox failure after container creation."
      );
    }
    let inspect = inspectContainer(executable, activeContainer);
    const runtimeConfig = runtimeConfigProjection(
      inspect,
      view.repository.root,
      policyRecord.payload,
      envelope,
      profileRecord
    );
    runSync(
      executable,
      ["container", "start", activeContainer],
      "Docker container start"
    );
    const containerExitCode = await runWait(
      executable,
      activeContainer,
      rule.timeout_ms + 10000
    );
    const logs = runSync(
      executable,
      ["container", "logs", activeContainer],
      "Docker probe log collection"
    );
    let rawProbe;
    try {
      rawProbe = JSON.parse(logs.stdout.trim());
    } catch (error) {
      throw new Error(
        `OCI sandbox probe returned invalid JSON: ${logs.stderr.trim()}`
      );
    }
    const probe = retainedProbe(
      rawProbe,
      context.request.transaction_id,
      policyRecord.payload,
      envelope
    );
    assertValid(
      probe,
      "oci-sandbox-probe-observation",
      "OCI sandbox probe observation"
    );
    const probeWrite = writeJsonArtifact(options, lock, {
      missionId: envelope.mission_id,
      waveId: envelope.wave_id,
      kind: KINDS.probe,
      artifactId: probe.id,
      payload: probe,
      createdAt: probe.collected_at
    });
    const probeRecord = {
      payload: probe,
      ref: probeWrite.ref
    };
    if (options.faultInjectionStage === "after_container") {
      throw new Error(
        "Injected OCI sandbox failure after container execution."
      );
    }

    inspect = inspectContainer(executable, activeContainer);
    const state = inspect.State || {};
    if (state.Status !== "exited" ||
        state.Running !== false ||
        Number(state.ExitCode) !== containerExitCode) {
      throw new Error("Docker terminal state does not match docker wait.");
    }
    const result = processResult(probe, rule.success_exit_codes);
    removeContainer(executable, activeContainer);
    activeContainer = null;
    const repositoryStateAfter = runtimeRepositoryState(view.repository.root);
    const observation = buildObservation(
      context,
      policyRecord,
      envelopeRecord,
      probeRecord,
      runtimeConfig,
      {
        container_id: inspect.Id,
        container_name: envelope.launch.container_name,
        image_id: inspect.Image,
        state: state.Status,
        exit_code: Number(state.ExitCode),
        oom_killed: state.OOMKilled === true,
        error: String(state.Error || "")
      },
      result,
      repositoryStateAfter,
      options.adapterPrivateKeyPem
    );
    assertValid(
      observation,
      "oci-sandbox-execution-observation",
      "OCI sandbox execution observation"
    );
    const observationWrite = writeJsonArtifact(options, lock, {
      missionId: observation.mission_id,
      waveId: observation.wave_id,
      kind: KINDS.observation,
      artifactId: observation.id,
      payload: observation,
      createdAt: observation.finished_at
    });
    const observationRecord = {
      payload: observation,
      ref: observationWrite.ref
    };
    if (options.faultInjectionStage === "after_observation") {
      throw new Error(
        "Injected OCI sandbox failure after observation persistence."
      );
    }

    const committed = commitGatewayExecution(
      gatewayOptions(options, nowIso()),
      descriptor.transactionId,
      {
        executionEventRef: clone(context.latest_event_ref),
        toolInput: clone(descriptor.toolInput),
        result: clone(result),
        executor: {
          ...runtimePolicy.measurements,
          sandbox_profile_sha256:
            policyRecord.payload.sandbox_profile_sha256,
          network_policy_sha256:
            policyRecord.payload.network_controls.network_policy_sha256,
          executor_policy_ref: clone(policyRecord.ref),
          execution_envelope_ref: clone(envelopeRecord.ref),
          execution_observation_ref: clone(observationRecord.ref)
        },
        status: result.status,
        startedAt: probe.child.started_at,
        finishedAt: observation.finished_at,
        exitCode: probe.child.exit_code
      }
    );
    return {
      ...committed,
      process_status: result.status,
      process_result: result,
      sandbox_policy_ref: clone(policyRecord.ref),
      execution_envelope_ref: clone(envelopeRecord.ref),
      probe_observation_ref: clone(probeRecord.ref),
      execution_observation_ref: clone(observationRecord.ref),
      production_execution_authorized: false,
      release_authorized: false
    };
  } catch (error) {
    const cleanupFailure = bestEffortRemove(executable, activeContainer);
    if (!envelopeRecord) throw error;
    try {
      const recovered = recoverGatewayTransaction(
        gatewayOptions(options, nowIso()),
        descriptor.transactionId
      );
      return {
        ...recovered,
        provider_failure: cleanupFailure
          ? `${error.message} ${cleanupFailure}`
          : error.message,
        execution_envelope_ref: clone(envelopeRecord.ref),
        production_execution_authorized: false,
        release_authorized: false
      };
    } catch (recoveryError) {
      throw new Error(
        `${error.message} Recovery also failed: ${recoveryError.message}`
      );
    }
  } finally {
    releaseRepositoryLease(lock);
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const valueFlags = new Set([
    "repository",
    "artifact-root",
    "mission",
    "wave",
    "policy",
    "private-key",
    "transaction",
    "tool-input",
    "gateway-binding-sha256",
    "verified-principal-sha256",
    "docker",
    "probe"
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--") || !valueFlags.has(arg.slice(2))) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    index += 1;
    if (index >= rest.length) throw new Error(`${arg} requires a value.`);
    const key = arg.slice(2).replace(/-([a-z])/g,
      (_, letter) => letter.toUpperCase());
    options[key] = rest[index];
  }
  return { command, options };
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function readJson(filePath, label) {
  return JSON.parse(
    fs.readFileSync(path.resolve(required(filePath, label)), "utf8")
  );
}

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    let result;
    if (parsed.command === "measurements") {
      result = ociSandboxRuntimeMeasurements({
        dockerPath: parsed.options.docker,
        probePath: required(parsed.options.probe, "--probe")
      });
    } else {
      const common = {
        repository: path.resolve(
          required(parsed.options.repository, "--repository")
        ),
        artifactRoot: parsed.options.artifactRoot
          ? path.resolve(parsed.options.artifactRoot)
          : undefined
      };
      if (parsed.command === "persist-policy") {
        result = persistOciLinuxSandboxPolicy({
          ...common,
          missionId: required(parsed.options.mission, "--mission"),
          waveId: required(parsed.options.wave, "--wave")
        }, readJson(parsed.options.policy, "--policy"));
      } else if (parsed.command === "execute") {
        result = await executeOciLinuxSandbox({
          ...common,
          adapterPrivateKeyPem: fs.readFileSync(
            path.resolve(required(parsed.options.privateKey, "--private-key")),
            "utf8"
          ),
          gatewayBindingSha256: required(
            parsed.options.gatewayBindingSha256,
            "--gateway-binding-sha256"
          ),
          verifiedPrincipalSha256:
            parsed.options.verifiedPrincipalSha256,
          dockerPath: parsed.options.docker,
          probePath: path.resolve(
            required(parsed.options.probe, "--probe")
          )
        }, {
          transactionId: required(
            parsed.options.transaction,
            "--transaction"
          ),
          toolInput: readJson(parsed.options.toolInput, "--tool-input")
        });
      } else {
        throw new Error(
          "Usage: node oci-linux-sandbox-provider.js " +
          "<measurements|persist-policy|execute> --repository <repo> ..."
        );
      }
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.state === "recovery_required" ||
        result.process_status === "failed") {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  executeOciLinuxSandbox,
  ociSandboxRuntimeMeasurements,
  persistOciLinuxSandboxPolicy
};
