#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  NONE_REF,
  activeLease,
  authorizeDispatchPolicy,
  inputDigest,
  issueLease
} = require("./dispatch-runtime-controller");
const {
  admitGatewayRequest,
  beginGatewayExecution,
  bindingDigests,
  commitGatewayExecution,
  gatewayStatus,
  recoverGatewayTransaction
} = require("./protected-tool-gateway");
const {
  executeProtectedProcess,
  persistProtectedExecutorPolicy,
  protectedProcessRuntimeMeasurements
} = require("./protected-process-executor");
const {
  controlProfileDigest,
  objectDigest
} = require("./protected-execution-evidence");
const { resolveRepository } = require("./repository-artifact-store");
const { openWave } = require("./skill-mission-controller");
const { publicKeyId } = require("./verification-attestation");

const ROOT = __dirname;
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "cannae-protected-executor-")
);
const artifactRoot = path.join(temporaryRoot, "artifacts");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileDigest(filePath) {
  return digest(fs.readFileSync(filePath));
}

function at(anchor, offsetMs) {
  return new Date(anchor + offsetMs).toISOString();
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function runGit(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "git failed").trim());
  }
}

function initRepository(name) {
  const repository = path.join(temporaryRoot, name.toLowerCase());
  fs.mkdirSync(repository, { recursive: true });
  runGit(repository, ["init", "-q"]);
  runGit(repository, ["config", "user.email", "fixtures@example.com"]);
  runGit(repository, ["config", "user.name", "Protected Executor Fixture"]);
  fs.writeFileSync(path.join(repository, "README.md"), "protected executor\n");
  runGit(repository, ["add", "README.md"]);
  runGit(repository, ["commit", "-qm", "initial"]);
  return fs.realpathSync(repository);
}

function keyMaterial() {
  const pair = crypto.generateKeyPairSync("ed25519");
  return {
    privateKeyPem: pair.privateKey.export({
      type: "pkcs8",
      format: "pem"
    }),
    publicKeyPem: pair.publicKey.export({
      type: "spki",
      format: "pem"
    }),
    keyId: publicKeyId(pair.publicKey)
  };
}

function gatewayProjection(name) {
  return {
    gateway_id: "cannae-reference-gateway",
    instance_id: `protected-executor-${name.toLowerCase()}`,
    audience: "cannae-protected-tools",
    deployment_sha256: digest(`deployment:${name}`),
    configuration_sha256: digest(`configuration:${name}`),
    assurance_level: "contract_reference",
    exclusive_path_verified: false
  };
}

function processControlProfile() {
  const controls = {
    shell: false,
    detached: false,
    environment_mode: "empty",
    stdin_mode: "none",
    require_non_root: true,
    filesystem_isolation: false,
    syscall_filter: false,
    privilege_drop: false,
    process_tree_containment: false
  };
  return {
    ...controls,
    sandbox_profile_sha256: controlProfileDigest(
      controls,
      "sandbox_profile_sha256"
    )
  };
}

function networkControlProfile() {
  const controls = {
    enforcement: "not_enforced",
    outbound: "unknown"
  };
  return {
    ...controls,
    network_policy_sha256: controlProfileDigest(
      controls,
      "network_policy_sha256"
    )
  };
}

function planFor(name) {
  const plan = readJson("sample-payloads/valid-mission-wave-plan.json");
  plan.id = `MWP-PROTECTED-EXECUTOR-${name}`;
  plan.mission_id = `MIS-PROTECTED-EXECUTOR-${name}`;
  plan.agents = plan.agents.filter(agent => agent.agent_id === "plans-agent");
  return plan;
}

function dispatchPolicy(plan, name, toolInput, anchor) {
  return {
    schema_version: "0.1",
    type: "DispatchToolPolicy",
    id: `DTP-PROTECTED-EXECUTOR-${name}`,
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    agent_id: "plans-agent",
    provider: "codex",
    default_decision: "deny",
    tool_rules: [{
      rule_id: `DTR-PROTECTED-EXECUTOR-${name}`,
      mission_action: "Run deterministic validation.",
      tool_name: "Bash",
      operation_class: "process_execute",
      input_match: {
        mode: "exact_sha256",
        allowed_sha256: [inputDigest(toolInput)]
      },
      max_uses: 2
    }],
    max_total_admissions: 2,
    lease_ttl_seconds: 1800,
    repository_state: {
      require_head_match: true,
      require_serial_state_chain: true,
      require_clean_start: true
    },
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    },
    approved_at: at(anchor, -10000),
    valid_until: at(anchor, 1200000)
  };
}

function executorPolicy(repository, plan, name, gateway, keys, rule, anchor) {
  const binding = resolveRepository(repository);
  return {
    schema_version: "0.1",
    type: "ProtectedExecutorPolicy",
    id: `PEP-${name}`,
    repository_binding: {
      repository_key: binding.key,
      identity_fingerprint: binding.identity_fingerprint
    },
    gateway_binding_sha256: objectDigest(gateway),
    platform: "posix_reference",
    providers: ["codex"],
    adapter_profile: {
      ...protectedProcessRuntimeMeasurements(),
      signing_key_id: keys.keyId,
      signing_algorithm: "ed25519",
      signing_public_key_pem: keys.publicKeyPem
    },
    process_controls: processControlProfile(),
    network_controls: networkControlProfile(),
    rules: [rule],
    valid_from: at(anchor, -60000),
    expires_at: at(anchor, 1200000),
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      production_execution_authorized: false,
      release_authorized: false
    }
  };
}

function requestFor(setup, selected, anchor) {
  const suffix = setup.name;
  return {
    schema_version: "0.2",
    type: "ToolGatewayRequest",
    id: `TGR-PROTECTED-EXECUTOR-${suffix}`,
    transaction_id: `GTX-PROTECTED-EXECUTOR-${suffix}`,
    mission_id: setup.plan.mission_id,
    wave_id: setup.plan.wave_id,
    agent_id: "plans-agent",
    provider: "codex",
    gateway: clone(setup.gateway),
    authenticated_principal: {
      authentication_method: "fixture",
      issuer: "fixture://protected-process-executor",
      subject: "agent:plans-agent",
      audience: "cannae-protected-tools",
      credential_sha256: digest(`credential:${suffix}`),
      proof_sha256: digest(`proof:${suffix}`),
      proof_verified: true,
      session_id: setup.identity.sessionId,
      provider_agent_id: setup.identity.providerAgentId,
      authenticated_at: at(anchor, -60000),
      expires_at: at(anchor, 1200000)
    },
    identity_policy_ref: clone(NONE_REF),
    identity_challenge_ref: clone(NONE_REF),
    principal_evidence_ref: clone(NONE_REF),
    lease_ref: clone(selected.leaseRecord.ref),
    tool_policy_ref: clone(selected.leaseRecord.payload.tool_policy_ref),
    checkpoint_ref: clone(selected.checkpointRecord.ref),
    repository_binding: clone(selected.leaseRecord.payload.repository_binding),
    expected_repository_state: clone(
      selected.checkpointRecord.payload.repository_state
    ),
    tool_call: {
      tool_use_id: `protected-executor-tool-${suffix}`,
      tool_name: "Bash",
      operation_class: "process_execute",
      tool_input_sha256: inputDigest(setup.toolInput)
    },
    idempotency_key: digest(`idempotency:${suffix}`),
    raw_input_retained: false,
    requested_at: at(anchor, -2000),
    valid_until: at(anchor, 1200000),
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    }
  };
}

function defaultRule(name, argv, overrides = {}) {
  const {
    executablePath: requestedExecutablePath,
    ...ruleOverrides
  } = overrides;
  const executablePath = fs.realpathSync(
    requestedExecutablePath || process.execPath
  );
  return {
    rule_id: `PER-${name}`,
    tool_name: "Bash",
    operation_class: "process_execute",
    executable_path: executablePath,
    executable_format: "native_binary",
    executable_sha256: fileDigest(executablePath),
    argv,
    cwd_relative: ".",
    timeout_ms: 2000,
    max_stdout_bytes: 4096,
    max_stderr_bytes: 4096,
    success_exit_codes: [0],
    expected_repository_effect: "none",
    ...ruleOverrides
  };
}

function setupScenario(name, rule) {
  const anchor = Date.now();
  const repository = initRepository(name);
  const plan = planFor(name);
  const gateway = gatewayProjection(name);
  const keys = keyMaterial();
  const policy = executorPolicy(
    repository,
    plan,
    name,
    gateway,
    keys,
    rule,
    anchor
  );
  const persisted = persistProtectedExecutorPolicy({
    repository,
    artifactRoot,
    missionId: plan.mission_id,
    waveId: plan.wave_id
  }, policy);
  const toolInput = {
    schema_version: "0.1",
    type: "ProtectedProcessToolInput",
    executor_policy_ref: clone(persisted.policy_ref),
    rule_id: rule.rule_id
  };
  const draft = dispatchPolicy(plan, name, toolInput, anchor);
  plan.dispatch_control = {
    required: true,
    enforcement_level: "guardrail",
    gateway_exclusive: false,
    policy_authorizations: [{
      agent_id: draft.agent_id,
      provider: draft.provider,
      policy_id: draft.id,
      draft_sha256: inputDigest(draft)
    }]
  };
  openWave(plan, {
    repository,
    artifactRoot,
    doctrineRoot: ROOT,
    now: at(anchor, -8000)
  });
  const runtimeOptions = {
    repository,
    artifactRoot,
    now: at(anchor, -7000)
  };
  authorizeDispatchPolicy(runtimeOptions, draft);
  const issued = issueLease(runtimeOptions, draft.id, {
    sessionId: `session-${name.toLowerCase()}`,
    providerAgentId: "main"
  });
  const identity = {
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    agentId: "plans-agent",
    provider: "codex",
    sessionId: issued.lease.session_binding.session_id,
    providerAgentId: "main"
  };
  const setup = {
    anchor,
    artifactRoot,
    draft,
    gateway,
    identity,
    keys,
    name,
    plan,
    policy,
    policyRef: persisted.policy_ref,
    repository,
    rule,
    toolInput
  };
  const selected = activeLease({
    repository,
    artifactRoot,
    now: at(anchor, -3000)
  }, identity);
  assert.strictEqual(selected.code, "LEASE_ACTIVE");
  const request = requestFor(setup, selected, anchor);
  const bindings = bindingDigests(request);
  const gatewayOptions = {
    repository,
    artifactRoot,
    gatewayBindingSha256: bindings.gateway,
    verifiedPrincipalSha256: bindings.principal
  };
  const admitted = admitGatewayRequest({
    ...gatewayOptions,
    now: at(anchor, -1000)
  }, request, toolInput);
  assert.strictEqual(admitted.state, "authorized");
  return {
    ...setup,
    admitted,
    gatewayOptions,
    request,
    transactionId: request.transaction_id
  };
}

function loadArtifact(ref) {
  return JSON.parse(
    fs.readFileSync(path.join(artifactRoot, ref.relative_path), "utf8")
  );
}

function transactionStatus(setup) {
  return gatewayStatus(setup.gatewayOptions, {
    transactionId: setup.transactionId
  }).transactions[0];
}

async function expectReject(promise, pattern) {
  let error;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  assert(error, "expected operation to reject");
  if (pattern) assert(pattern.test(error.message), error.message);
}

function fixtureExecutor() {
  return {
    adapter_id: "fixture-executor",
    adapter_version: "0.1.0",
    adapter_sha256: digest("fixture-adapter"),
    runtime_sha256: digest("fixture-runtime"),
    sandbox_profile_sha256: digest("fixture-sandbox"),
    network_policy_sha256: digest("fixture-network"),
    execution_mode: "fixture",
    executor_policy_ref: clone(NONE_REF),
    execution_envelope_ref: clone(NONE_REF),
    execution_observation_ref: clone(NONE_REF)
  };
}

async function execute(setup, overrides = {}) {
  return executeProtectedProcess({
    ...setup.gatewayOptions,
    adapterPrivateKeyPem: setup.keys.privateKeyPem,
    ...overrides
  }, {
    transactionId: setup.transactionId,
    toolInput: clone(setup.toolInput)
  });
}

const fixtures = [];

function fixture(name, fn) {
  fixtures.push({ name, fn });
}

fixture("Codex and Claude executor wrappers resolve the same runtime", async () => {
  for (const wrapper of [
    "codex-skills/controls-doctrine-operator/scripts/operate_protected_executor.js",
    ".claude/skills/controls-doctrine-operator/scripts/operate_protected_executor.js"
  ]) {
    assert.strictEqual(require(path.join(ROOT, wrapper)).findRuntimeRoot(), ROOT);
  }
});

fixture("exact executable and argv commit once with signed evidence", async () => {
  const script = [
    "const fs=require('fs')",
    "const p='execution-count.txt'",
    "const n=fs.existsSync(p)?Number(fs.readFileSync(p,'utf8')):0",
    "fs.writeFileSync(p,String(n+1))",
    "process.stdout.write('executed')"
  ].join(";");
  const setup = setupScenario(
    "SUCCESS",
    defaultRule("SUCCESS", ["-e", script], {
      expected_repository_effect: "recorded"
    })
  );
  const completed = await execute(setup);
  assert.strictEqual(completed.state, "committed");
  assert.strictEqual(completed.process_status, "succeeded");
  assert.strictEqual(
    fs.readFileSync(path.join(setup.repository, "execution-count.txt"), "utf8"),
    "1"
  );
  const receipt = loadArtifact(completed.receipt_ref);
  assert.strictEqual(receipt.schema_version, "0.3");
  assert.strictEqual(
    receipt.executor.execution_mode,
    "bounded_process_reference"
  );
  assert.deepStrictEqual(
    receipt.executor.executor_policy_ref,
    completed.executor_policy_ref
  );
  assert.deepStrictEqual(
    receipt.executor.execution_envelope_ref,
    completed.execution_envelope_ref
  );
  assert.deepStrictEqual(
    receipt.executor.execution_observation_ref,
    completed.execution_observation_ref
  );

  const replay = await executeProtectedProcess(setup.gatewayOptions, {
    transactionId: setup.transactionId,
    toolInput: clone(setup.toolInput)
  });
  assert.strictEqual(replay.state, "committed");
  assert.strictEqual(replay.replayed, true);
  assert.strictEqual(
    fs.readFileSync(path.join(setup.repository, "execution-count.txt"), "utf8"),
    "1"
  );
});

fixture("protected input rejects a caller-declared external result", async () => {
  const setup = setupScenario(
    "BYPASS",
    defaultRule("BYPASS", ["-e", "process.stdout.write('unused')"])
  );
  const begun = beginGatewayExecution({
    ...setup.gatewayOptions,
    now: new Date().toISOString()
  }, setup.transactionId);
  assert.strictEqual(begun.state, "executing");
  const startedAt = new Date().toISOString();
  assert.throws(() => commitGatewayExecution({
    ...setup.gatewayOptions,
    now: new Date().toISOString()
  }, setup.transactionId, {
    executionEventRef: begun.execution_event_ref,
    toolInput: clone(setup.toolInput),
    result: { status: "succeeded" },
    executor: fixtureExecutor(),
    status: "succeeded",
    startedAt,
    finishedAt: startedAt,
    exitCode: 0
  }), /must be used together/);
  const recovered = recoverGatewayTransaction(
    setup.gatewayOptions,
    setup.transactionId
  );
  assert.strictEqual(recovered.state, "recovery_required");
});

fixture("tool-input rule substitution is denied before execution", async () => {
  const setup = setupScenario(
    "SUBSTITUTION",
    defaultRule("SUBSTITUTION", ["-e", "process.stdout.write('unused')"])
  );
  const substituted = clone(setup.toolInput);
  substituted.rule_id = "PER-NOT-AUTHORIZED";
  await expectReject(executeProtectedProcess({
    ...setup.gatewayOptions,
    adapterPrivateKeyPem: setup.keys.privateKeyPem
  }, {
    transactionId: setup.transactionId,
    toolInput: substituted
  }), /does not match the gateway request digest/);
  assert.strictEqual(transactionStatus(setup).state, "authorized");
});

fixture("shebang executable is denied before gateway begin", async () => {
  const scriptPath = path.join(
    fs.realpathSync(temporaryRoot),
    "unmeasured-interpreter-script"
  );
  fs.writeFileSync(
    scriptPath,
    "#!/usr/bin/env node\nprocess.stdout.write('must-not-run');\n"
  );
  fs.chmodSync(scriptPath, 0o755);
  const setup = setupScenario(
    "SHEBANG",
    defaultRule("SHEBANG", [], {
      executablePath: scriptPath
    })
  );
  await expectReject(
    execute(setup),
    /ELF or Mach-O native executable/
  );
  assert.strictEqual(transactionStatus(setup).state, "authorized");
});

fixture("executable digest drift is denied before gateway begin", async () => {
  const executableCopy = path.join(
    fs.realpathSync(temporaryRoot),
    "executable-drift.bin"
  );
  fs.copyFileSync(fs.realpathSync("/bin/echo"), executableCopy);
  fs.chmodSync(executableCopy, 0o755);
  const setup = setupScenario(
    "EXECUTABLE-DRIFT",
    defaultRule("EXECUTABLE-DRIFT", [
      "-e",
      "process.stdout.write('unused')"
    ], {
      executablePath: executableCopy
    })
  );
  fs.appendFileSync(executableCopy, "tamper");
  await expectReject(
    execute(setup),
    /executable digest changed/
  );
  assert.strictEqual(transactionStatus(setup).state, "authorized");
});

fixture("timeout is observed and committed as a failed process", async () => {
  const setup = setupScenario(
    "TIMEOUT",
    defaultRule("TIMEOUT", ["-e", "setTimeout(()=>{},5000)"], {
      timeout_ms: 120
    })
  );
  const completed = await execute(setup);
  assert.strictEqual(completed.state, "committed");
  assert.strictEqual(completed.process_status, "failed");
  assert.strictEqual(completed.process_result.termination_reason, "timeout");
  const observation = loadArtifact(completed.execution_observation_ref);
  assert.strictEqual(observation.process.timed_out, true);
});

fixture("post-process interruption never reruns the claimed work", async () => {
  const script = [
    "const fs=require('fs')",
    "const p='interrupted-count.txt'",
    "const n=fs.existsSync(p)?Number(fs.readFileSync(p,'utf8')):0",
    "fs.writeFileSync(p,String(n+1))"
  ].join(";");
  const setup = setupScenario(
    "INTERRUPTED",
    defaultRule("INTERRUPTED", ["-e", script], {
      expected_repository_effect: "recorded"
    })
  );
  const interrupted = await execute(setup, {
    faultInjectionStage: "after_process"
  });
  assert.strictEqual(interrupted.state, "recovery_required");
  assert.strictEqual(
    fs.readFileSync(path.join(setup.repository, "interrupted-count.txt"), "utf8"),
    "1"
  );
  const replay = await execute(setup);
  assert.strictEqual(replay.state, "recovery_required");
  assert.strictEqual(replay.replayed, true);
  assert.strictEqual(
    fs.readFileSync(path.join(setup.repository, "interrupted-count.txt"), "utf8"),
    "1"
  );
});

fixture("forbidden repository effect fails closed after observation", async () => {
  const script = [
    "const fs=require('fs')",
    "const p='forbidden-effect.txt'",
    "const n=fs.existsSync(p)?Number(fs.readFileSync(p,'utf8')):0",
    "fs.writeFileSync(p,String(n+1))"
  ].join(";");
  const setup = setupScenario(
    "FORBIDDEN-EFFECT",
    defaultRule("FORBIDDEN-EFFECT", ["-e", script], {
      expected_repository_effect: "none"
    })
  );
  const denied = await execute(setup);
  assert.strictEqual(denied.state, "recovery_required");
  assert.match(
    denied.executor_failure,
    /PROTECTED_EXECUTION_REPOSITORY_EFFECT_FORBIDDEN/
  );
  const replay = await execute(setup);
  assert.strictEqual(replay.replayed, true);
  assert.strictEqual(
    fs.readFileSync(path.join(setup.repository, "forbidden-effect.txt"), "utf8"),
    "1"
  );
});

async function main() {
  let failed = 0;
  try {
    for (const item of fixtures) {
      try {
        await item.fn();
        console.log(`PASS ${item.name}`);
      } catch (error) {
        failed += 1;
        console.error(`FAIL ${item.name}: ${error.stack || error.message}`);
      }
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
  console.log(JSON.stringify({
    total: fixtures.length,
    passed: fixtures.length - failed,
    failed
  }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main();
