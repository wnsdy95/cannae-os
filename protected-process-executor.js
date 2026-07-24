#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
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
  objectDigest,
  safeCwdRelative,
  signProtectedExecutionEnvelope,
  signProtectedExecutionObservation,
  verifyProtectedExecutorPolicy
} = require("./protected-execution-evidence");
const { publicKeyId } = require("./verification-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");

const ADAPTER_ID = "cannae-protected-process-executor";
const ADAPTER_VERSION = "0.1.0";
const KINDS = Object.freeze({
  policy: "protected-executor-policies",
  envelope: "protected-execution-envelopes",
  observation: "protected-execution-observations"
});
const NATIVE_EXECUTABLE_MAGICS = new Set([
  "7f454c46",
  "feedface",
  "feedfacf",
  "cefaedfe",
  "cffaedfe",
  "cafebabe",
  "bebafeca",
  "cafebabf",
  "bfbafeca"
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function isNativeExecutable(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(4);
    if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length) {
      return false;
    }
    return NATIVE_EXECUTABLE_MAGICS.has(header.toString("hex"));
  } finally {
    fs.closeSync(descriptor);
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`);
  return parsed;
}

function nowIso() {
  return new Date().toISOString();
}

function assertValid(payload, type, label) {
  const validation = validatePayload(payload, type);
  const failures = validation.issues.filter(item =>
    item.severity === "error" || item.severity === "critical");
  if (failures.length > 0) {
    throw new Error(`${label} failed validation: ${unique(failures.map(item => item.code)).join(", ")}`);
  }
}

function authority() {
  return {
    human_final_decision_authority: "USER",
    self_approval_prohibited: true,
    production_execution_authorized: false,
    release_authorized: false
  };
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
  const namespacePath = path.join(artifactRoot, "repositories", repository.key);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(namespacePath, "manifest.json"), "utf8")
  );
  return { artifactRoot, manifest, namespacePath, repository, verification };
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
    throw new Error(`Artifact reference is not uniquely retained: ${ref && ref.artifact_id || "missing"}`);
  }
  const payload = loadEntry(view, matches[0]);
  assertValid(payload, type, type);
  return {
    entry: matches[0],
    payload,
    ref: clone(ref)
  };
}

function writeJsonArtifact(options, executorLease, descriptor) {
  renewRepositoryLease(executorLease);
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
    throw new Error("Protected executor policy does not match the target repository.");
  }
}

function protectedProcessRuntimeMeasurements() {
  return {
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    adapter_sha256: fileSha256(__filename),
    runtime_sha256: fileSha256(process.execPath),
    execution_mode: "bounded_process_reference"
  };
}

function assertAdapterPrivateKey(policy, privateKeyPem) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const keyId = publicKeyId(crypto.createPublicKey(privateKey));
  if (privateKey.asymmetricKeyType !== "ed25519" ||
      keyId !== policy.adapter_profile.signing_key_id) {
    throw new Error("Protected executor private key does not match the policy.");
  }
}

function deterministicId(prefix, ...parts) {
  return `${prefix}-${sha256(Buffer.from(parts.join(":"))).slice(0, 24)}`;
}

function persistProtectedExecutorPolicy(options, policy) {
  assertValid(policy, "protected-executor-policy", "Protected executor policy");
  const policyVerification = verifyProtectedExecutorPolicy(policy);
  if (!policyVerification.valid) {
    throw new Error(
      `Protected executor policy failed appraisal: ${policyVerification.codes.join(", ")}`
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
  const record = loadArtifactRef(view, ref, "protected-executor-policy");
  assertRepositoryBinding(view.repository, record.payload.repository_binding);
  const verification = verifyProtectedExecutorPolicy(record.payload, evaluatedAt);
  if (!verification.valid) {
    throw new Error(`Protected executor policy is unavailable: ${verification.codes.join(", ")}`);
  }
  return record;
}

function selectedRule(policy, toolInput, request) {
  const matches = policy.rules.filter(item => item.rule_id === toolInput.rule_id);
  if (matches.length !== 1) {
    throw new Error("Protected process tool input does not select exactly one policy rule.");
  }
  const rule = matches[0];
  if (!policy.providers.includes(request.provider) ||
      rule.tool_name !== request.tool_call.tool_name ||
      rule.operation_class !== request.tool_call.operation_class ||
      rule.operation_class !== "process_execute") {
    throw new Error("Protected executor rule does not match the gateway request.");
  }
  if (inputDigest(toolInput) !== request.tool_call.tool_input_sha256) {
    throw new Error("Protected process tool input does not match the gateway request digest.");
  }
  if (policy.gateway_binding_sha256 !== objectDigest(request.gateway)) {
    throw new Error("Protected executor policy does not bind the trusted gateway projection.");
  }
  return rule;
}

function executableAndCwd(repository, rule) {
  if (process.platform === "win32") {
    throw new Error("Phase 17B2A protected process execution supports POSIX hosts only.");
  }
  if (!safeCwdRelative(rule.cwd_relative)) {
    throw new Error("Protected executor working directory is unsafe.");
  }
  const executablePath = fs.realpathSync(rule.executable_path);
  if (executablePath !== rule.executable_path ||
      !fs.statSync(executablePath).isFile()) {
    throw new Error("Protected executor requires one canonical regular executable file.");
  }
  fs.accessSync(executablePath, fs.constants.X_OK);
  if (rule.executable_format !== "native_binary" ||
      !isNativeExecutable(executablePath)) {
    throw new Error(
      "Protected executor requires one ELF or Mach-O native executable."
    );
  }
  if (fileSha256(executablePath) !== rule.executable_sha256) {
    throw new Error("Protected executor executable digest changed.");
  }

  const candidate = path.resolve(repository.root, rule.cwd_relative);
  const cwd = fs.realpathSync(candidate);
  if (cwd !== repository.root &&
      !cwd.startsWith(`${repository.root}${path.sep}`)) {
    throw new Error("Protected executor working directory escapes the repository.");
  }
  if (path.relative(repository.root, cwd).split(path.sep).includes("..")) {
    throw new Error("Protected executor working directory escapes the repository.");
  }
  return { cwd, executablePath };
}

function assertRuntimePolicy(policy, rule, request, decision, evaluatedAt) {
  const measurements = protectedProcessRuntimeMeasurements();
  for (const field of [
    "adapter_id",
    "adapter_version",
    "adapter_sha256",
    "runtime_sha256",
    "execution_mode"
  ]) {
    if (policy.adapter_profile[field] !== measurements[field]) {
      throw new Error(`Protected executor runtime measurement mismatch: ${field}.`);
    }
  }
  if (typeof process.getuid !== "function" || process.getuid() === 0) {
    throw new Error("Protected executor policy requires a non-root POSIX process.");
  }
  const evaluatedTime = timestamp(evaluatedAt, "Executor evaluation time");
  const deadline = Math.min(
    timestamp(policy.expires_at, "Executor policy expires_at"),
    timestamp(decision.valid_until, "Gateway decision valid_until")
  );
  if (evaluatedTime + rule.timeout_ms + 1000 >= deadline) {
    throw new Error("Protected executor validity window cannot cover the bounded process.");
  }
  if (request.tool_call.operation_class !== "process_execute") {
    throw new Error("Protected process executor accepts process_execute requests only.");
  }
  return measurements;
}

function executorLock(options, timeoutMs) {
  const view = storeView(options);
  const lockRoot = path.join(
    view.namespacePath,
    ".protected-process-executor",
    "transaction-store"
  );
  return acquireRepositoryLease(lockRoot, {
    leaseTimeoutMs: options.lockTimeoutMs || 5000,
    leaseTtlMs: Math.max(
      options.lockTtlMs || 0,
      Number(timeoutMs || 0) + 30000,
      30000
    )
  });
}

function commandProjection(policy, rule) {
  return {
    executable_path: rule.executable_path,
    executable_format: rule.executable_format,
    executable_sha256: rule.executable_sha256,
    argv: clone(rule.argv),
    cwd_relative: rule.cwd_relative,
    environment_mode: policy.process_controls.environment_mode,
    stdin_mode: policy.process_controls.stdin_mode,
    shell: policy.process_controls.shell,
    detached: policy.process_controls.detached
  };
}

function limitsProjection(rule) {
  return {
    timeout_ms: rule.timeout_ms,
    max_stdout_bytes: rule.max_stdout_bytes,
    max_stderr_bytes: rule.max_stderr_bytes,
    success_exit_codes: clone(rule.success_exit_codes)
  };
}

function buildEnvelope(context, policyRecord, toolInput, rule, privateKeyPem) {
  const issuedAt = nowIso();
  const expiresAt = new Date(Math.min(
    timestamp(policyRecord.payload.expires_at, "Executor policy expires_at"),
    timestamp(context.decision.valid_until, "Gateway decision valid_until"),
    timestamp(issuedAt, "Envelope issued_at") + rule.timeout_ms + 1000
  )).toISOString();
  return signProtectedExecutionEnvelope({
    schema_version: "0.1",
    type: "ProtectedExecutionEnvelope",
    id: deterministicId(
      "PEE",
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
    executor_policy_ref: clone(policyRecord.ref),
    tool_input_sha256: inputDigest(toolInput),
    rule_id: rule.rule_id,
    command: commandProjection(policyRecord.payload, rule),
    limits: limitsProjection(rule),
    sandbox_profile_sha256:
      policyRecord.payload.process_controls.sandbox_profile_sha256,
    network_policy_sha256:
      policyRecord.payload.network_controls.network_policy_sha256,
    repository_binding: clone(context.request.repository_binding),
    repository_state_before: clone(context.decision.repository_state_before),
    issued_at: issuedAt,
    expires_at: expiresAt,
    authority: authority()
  }, privateKeyPem);
}

function retainChunk(state, chunk, limit, onLimit) {
  const bytes = Buffer.from(chunk);
  state.observedBytes += bytes.length;
  const remaining = Math.max(0, limit - state.retainedBytes);
  if (remaining > 0) {
    const retained = bytes.subarray(0, remaining);
    state.chunks.push(retained);
    state.retainedBytes += retained.length;
  }
  if (state.observedBytes > limit) onLimit();
}

async function runProcess(executablePath, cwd, rule) {
  const startedAt = nowIso();
  const stdout = { chunks: [], observedBytes: 0, retainedBytes: 0 };
  const stderr = { chunks: [], observedBytes: 0, retainedBytes: 0 };
  let child;
  let spawned = false;
  let spawnError = null;
  let terminationReason = null;

  const result = await new Promise(resolve => {
    const terminate = reason => {
      if (terminationReason) return;
      terminationReason = reason;
      if (child && child.pid) child.kill("SIGKILL");
    };
    try {
      child = spawn(executablePath, rule.argv, {
        cwd,
        env: {},
        shell: false,
        detached: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      spawnError = error;
      resolve({ code: -1, signal: "none" });
      return;
    }
    const timer = setTimeout(() => terminate("timeout"), rule.timeout_ms);
    child.once("spawn", () => {
      spawned = true;
    });
    child.once("error", error => {
      spawnError = error;
    });
    child.stdout.on("data", chunk => {
      retainChunk(stdout, chunk, rule.max_stdout_bytes,
        () => terminate("stdout_limit"));
    });
    child.stderr.on("data", chunk => {
      retainChunk(stderr, chunk, rule.max_stderr_bytes,
        () => terminate("stderr_limit"));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        code: Number.isInteger(code) ? code : -1,
        signal: signal || "none"
      });
    });
  });

  const reason = terminationReason || (spawnError ? "spawn_error" : "exited");
  const stdoutBytes = Buffer.concat(stdout.chunks);
  const stderrBytes = Buffer.concat(stderr.chunks);
  const status = reason === "exited" && rule.success_exit_codes.includes(result.code)
    ? "succeeded"
    : "failed";
  const processResult = {
    schema_version: "0.1",
    type: "ProtectedProcessResult",
    status,
    exit_code: result.code,
    signal: result.signal,
    termination_reason: reason,
    stdout_base64: stdoutBytes.toString("base64"),
    stderr_base64: stderrBytes.toString("base64"),
    stdout_truncated: stdout.observedBytes > stdout.retainedBytes,
    stderr_truncated: stderr.observedBytes > stderr.retainedBytes
  };
  return {
    finishedAt: nowIso(),
    process: {
      spawned,
      exit_code: result.code,
      signal: result.signal,
      termination_reason: reason,
      timed_out: reason === "timeout",
      output_limit_exceeded: ["stdout_limit", "stderr_limit"].includes(reason)
    },
    result: processResult,
    startedAt,
    status,
    stderr: {
      sha256: sha256(stderrBytes),
      observed_bytes: stderr.observedBytes,
      retained_bytes: stderr.retainedBytes,
      truncated: stderr.observedBytes > stderr.retainedBytes
    },
    stdout: {
      sha256: sha256(stdoutBytes),
      observed_bytes: stdout.observedBytes,
      retained_bytes: stdout.retainedBytes,
      truncated: stdout.observedBytes > stdout.retainedBytes
    }
  };
}

function buildObservation(context, policyRecord, envelopeRecord, rule, processRun,
  repositoryStateAfter, privateKeyPem) {
  return signProtectedExecutionObservation({
    schema_version: "0.1",
    type: "ProtectedExecutionObservation",
    id: deterministicId(
      "PEO",
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
    executor_policy_ref: clone(policyRecord.ref),
    execution_envelope_ref: clone(envelopeRecord.ref),
    tool_input_sha256: context.request.tool_call.tool_input_sha256,
    rule_id: rule.rule_id,
    command: commandProjection(policyRecord.payload, rule),
    process: clone(processRun.process),
    stdout: clone(processRun.stdout),
    stderr: clone(processRun.stderr),
    result_sha256: objectDigest(processRun.result),
    sandbox_profile_sha256:
      policyRecord.payload.process_controls.sandbox_profile_sha256,
    network_policy_sha256:
      policyRecord.payload.network_controls.network_policy_sha256,
    repository_binding: clone(context.request.repository_binding),
    repository_state_before: clone(context.decision.repository_state_before),
    repository_state_after: clone(repositoryStateAfter),
    started_at: processRun.startedAt,
    finished_at: processRun.finishedAt,
    authority: authority()
  }, privateKeyPem);
}

function existingExecution(view, transactionId) {
  const envelopes = listArtifacts(view, KINDS.envelope)
    .filter(item => item.payload.transaction_id === transactionId);
  const observations = listArtifacts(view, KINDS.observation)
    .filter(item => item.payload.transaction_id === transactionId);
  if (envelopes.length > 1 || observations.length > 1) {
    throw new Error("Protected process transaction has duplicate execution artifacts.");
  }
  for (const item of envelopes) {
    assertValid(item.payload, "protected-execution-envelope", "Protected execution envelope");
  }
  for (const item of observations) {
    assertValid(item.payload, "protected-execution-observation", "Protected execution observation");
  }
  return {
    envelope: envelopes[0] || null,
    observation: observations[0] || null
  };
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

async function executeProtectedProcess(options, descriptor) {
  assertValid(descriptor.toolInput, "protected-process-tool-input",
    "Protected process tool input");
  let view = storeView(options);
  let context = gatewayTransactionContext(
    gatewayOptions(options, nowIso()),
    descriptor.transactionId
  );
  if (inputDigest(descriptor.toolInput) !==
      context.request.tool_call.tool_input_sha256) {
    throw new Error(
      "Protected process tool input does not match the gateway request digest."
    );
  }
  const retained = existingExecution(view, descriptor.transactionId);
  if (context.status.terminal && retained.envelope) {
    return {
      ...context.status,
      replayed: true,
      execution_envelope_ref: clone(retained.envelope.ref),
      execution_observation_ref: retained.observation
        ? clone(retained.observation.ref)
        : null,
      production_execution_authorized: false,
      release_authorized: false
    };
  }
  let policyRecord = activePolicy(
    view,
    descriptor.toolInput.executor_policy_ref,
    nowIso()
  );
  if (!context.decision) {
    throw new Error("Protected process transaction has no gateway decision.");
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
    nowIso()
  );
  assertAdapterPrivateKey(policyRecord.payload, options.adapterPrivateKeyPem);
  const lock = executorLock(options, rule.timeout_ms);
  let envelopeRecord = null;
  try {
    view = storeView(options);
    policyRecord = activePolicy(
      view,
      descriptor.toolInput.executor_policy_ref,
      nowIso()
    );
    context = gatewayTransactionContext(
      gatewayOptions(options, nowIso()),
      descriptor.transactionId
    );
    if (!context.decision) {
      throw new Error("Protected process transaction has no gateway decision.");
    }
    rule = selectedRule(
      policyRecord.payload,
      descriptor.toolInput,
      context.request
    );
    const existing = existingExecution(view, descriptor.transactionId);
    if (existing.envelope) {
      if (context.status.terminal) {
        return {
          ...context.status,
          replayed: true,
          execution_envelope_ref: clone(existing.envelope.ref),
          execution_observation_ref: existing.observation
            ? clone(existing.observation.ref)
            : null
        };
      }
      const recovered = recoverGatewayTransaction(
        gatewayOptions(options, nowIso()),
        descriptor.transactionId
      );
      return {
        ...recovered,
        replayed: true,
        executor_failure: "PROTECTED_EXECUTION_ALREADY_CLAIMED",
        execution_envelope_ref: clone(existing.envelope.ref),
        execution_observation_ref: existing.observation
          ? clone(existing.observation.ref)
          : null
      };
    }
    if (context.status.state !== "authorized") {
      throw new Error(
        `Protected process transaction is not authorized: ${context.status.state}.`
      );
    }
    const measurements = assertRuntimePolicy(
      policyRecord.payload,
      rule,
      context.request,
      context.decision,
      nowIso()
    );
    const runtime = executableAndCwd(view.repository, rule);
    const begun = beginGatewayExecution(
      gatewayOptions(options, nowIso()),
      descriptor.transactionId
    );
    if (begun.state !== "executing" || !begun.execution_event_ref) {
      throw new Error("Protected process executor could not claim gateway execution.");
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
      options.adapterPrivateKeyPem
    );
    assertValid(envelope, "protected-execution-envelope",
      "Protected execution envelope");
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
      throw new Error("Injected protected executor failure after envelope persistence.");
    }

    const currentState = runtimeRepositoryState(view.repository.root);
    if (!sameRepositoryState(
      currentState,
      context.decision.repository_state_before
    )) {
      throw new Error("Repository changed between gateway begin and process spawn.");
    }
    const spawnRuntime = executableAndCwd(view.repository, rule);
    if (spawnRuntime.executablePath !== runtime.executablePath ||
        spawnRuntime.cwd !== runtime.cwd) {
      throw new Error("Protected executor path changed before process spawn.");
    }
    const processRun = await runProcess(
      spawnRuntime.executablePath,
      spawnRuntime.cwd,
      rule
    );
    if (options.faultInjectionStage === "after_process") {
      throw new Error("Injected protected executor failure after process completion.");
    }
    const completedRuntime = executableAndCwd(view.repository, rule);
    if (completedRuntime.executablePath !== spawnRuntime.executablePath ||
        completedRuntime.cwd !== spawnRuntime.cwd) {
      throw new Error("Protected executor path changed during process execution.");
    }
    const repositoryStateAfter = runtimeRepositoryState(view.repository.root);
    const observation = buildObservation(
      context,
      policyRecord,
      envelopeRecord,
      rule,
      processRun,
      repositoryStateAfter,
      options.adapterPrivateKeyPem
    );
    assertValid(observation, "protected-execution-observation",
      "Protected execution observation");
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
      throw new Error("Injected protected executor failure after observation persistence.");
    }

    const committed = commitGatewayExecution(
      gatewayOptions(options, nowIso()),
      descriptor.transactionId,
      {
        executionEventRef: clone(context.latest_event_ref),
        toolInput: clone(descriptor.toolInput),
        result: clone(processRun.result),
        executor: {
          ...measurements,
          sandbox_profile_sha256:
            policyRecord.payload.process_controls.sandbox_profile_sha256,
          network_policy_sha256:
            policyRecord.payload.network_controls.network_policy_sha256,
          executor_policy_ref: clone(policyRecord.ref),
          execution_envelope_ref: clone(envelopeRecord.ref),
          execution_observation_ref: clone(observationRecord.ref)
        },
        status: processRun.status,
        startedAt: processRun.startedAt,
        finishedAt: processRun.finishedAt,
        exitCode: processRun.process.exit_code
      }
    );
    return {
      ...committed,
      process_status: processRun.status,
      process_result: processRun.result,
      executor_policy_ref: clone(policyRecord.ref),
      execution_envelope_ref: clone(envelopeRecord.ref),
      execution_observation_ref: clone(observationRecord.ref),
      production_execution_authorized: false,
      release_authorized: false
    };
  } catch (error) {
    if (!envelopeRecord) throw error;
    try {
      const recovered = recoverGatewayTransaction(
        gatewayOptions(options, nowIso()),
        descriptor.transactionId
      );
      return {
        ...recovered,
        executor_failure: error.message,
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
    "verified-principal-sha256"
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
      result = protectedProcessRuntimeMeasurements();
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
        result = persistProtectedExecutorPolicy({
          ...common,
          missionId: required(parsed.options.mission, "--mission"),
          waveId: required(parsed.options.wave, "--wave")
        }, readJson(parsed.options.policy, "--policy"));
      } else if (parsed.command === "execute") {
        result = await executeProtectedProcess({
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
            parsed.options.verifiedPrincipalSha256
        }, {
          transactionId: required(
            parsed.options.transaction,
            "--transaction"
          ),
          toolInput: readJson(parsed.options.toolInput, "--tool-input")
        });
      } else {
        throw new Error(
          "Usage: node protected-process-executor.js " +
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
  executeProtectedProcess,
  persistProtectedExecutorPolicy,
  protectedProcessRuntimeMeasurements
};
