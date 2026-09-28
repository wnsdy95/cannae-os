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
  executeOciLinuxSandbox,
  ociSandboxRuntimeMeasurements,
  persistOciLinuxSandboxPolicy
} = require("./oci-linux-sandbox-provider");
const {
  networkPolicyDigest,
  objectDigest,
  sandboxProfileDigest
} = require("./oci-linux-sandbox-evidence");
const { resolveRepository } = require("./repository-artifact-store");
const { openWave } = require("./skill-mission-controller");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { publicKeyId } = require("./verification-attestation");

const ROOT = __dirname;
const PROFILE_RELATIVE_PATH =
  "runtime-profiles/moby-seccomp-v0.2.1.json";
const PROFILE_SOURCE_PATH = path.join(ROOT, PROFILE_RELATIVE_PATH);
const SOURCE_COMMIT = "5ad5f40ecde90d78e4a7c861c003fe92747d5518";
const PROFILE_FILE_SHA256 =
  "0a72fe3121b8d406a40342c0f5620f229420b2feebe8eab6690a9d4046308f8d";
const PROFILE_OBJECT_SHA256 =
  "ea7ba4298390d31a9d52354cf4319e4fe6cbd717ff6b47f23a496ca169727c76";
const temporaryRoot = fs.mkdtempSync(
  path.join(fs.realpathSync("/tmp"), "cannae-oci-sandbox-")
);
const artifactRoot = path.join(temporaryRoot, "artifacts");
let liveRuntime = null;

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

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: options.env || process.env
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || `${executable} failed`).trim()
    );
  }
  return result;
}

function runGit(repository, args) {
  run("git", ["-C", repository, ...args]);
}

function normalizedArchitecture(value) {
  return {
    aarch64: "arm64",
    arm64: "arm64",
    x86_64: "amd64",
    amd64: "amd64"
  }[value] || value;
}

function liveRuntimeAvailable() {
  let dockerInfo;
  try {
    dockerInfo = run("docker", ["info"], { allowFailure: true });
  } catch (error) {
    return { available: false, reason: "Docker CLI unavailable" };
  }
  if (dockerInfo.status !== 0) {
    return { available: false, reason: "Docker daemon unavailable" };
  }
  let goVersion;
  try {
    goVersion = run("go", ["version"], { allowFailure: true });
  } catch (error) {
    return { available: false, reason: "Go compiler unavailable" };
  }
  if (goVersion.status !== 0) {
    return { available: false, reason: "Go compiler unavailable" };
  }
  const rawArchitecture = run(
    "docker",
    ["info", "--format", "{{.Architecture}}"]
  ).stdout.trim();
  const architecture = normalizedArchitecture(rawArchitecture);
  if (!["amd64", "arm64"].includes(architecture)) {
    return {
      available: false,
      reason: `unsupported Docker architecture ${rawArchitecture}`
    };
  }
  return { available: true, architecture };
}

function buildProbeImage(architecture) {
  const probe = path.join(temporaryRoot, "cannae-probe");
  run("go", [
    "build",
    "-trimpath",
    "-ldflags=-buildid=",
    "-o",
    probe,
    path.join(ROOT, "oci-linux-sandbox-probe.go")
  ], {
    env: {
      ...process.env,
      CGO_ENABLED: "0",
      GOOS: "linux",
      GOARCH: architecture
    }
  });
  const context = path.join(temporaryRoot, "image-context");
  fs.mkdirSync(context, { recursive: true });
  fs.copyFileSync(probe, path.join(context, "cannae-probe"));
  fs.writeFileSync(
    path.join(context, "Dockerfile"),
    [
      "FROM scratch",
      "COPY cannae-probe /cannae-probe",
      "ENV PATH=",
      "ENTRYPOINT [\"/cannae-probe\"]",
      ""
    ].join("\n")
  );
  const tag = `cannae-phase17b2b-fixture:${process.pid}`;
  run("docker", [
    "build",
    "--network",
    "none",
    "--pull=false",
    "--provenance=false",
    "--sbom=false",
    "--tag",
    tag,
    context
  ]);
  const inspected = JSON.parse(
    run("docker", ["image", "inspect", tag]).stdout
  );
  assert.strictEqual(inspected.length, 1);
  assert.strictEqual(inspected[0].Os, "linux");
  assert.strictEqual(inspected[0].Architecture, architecture);
  const tamperedContext = path.join(temporaryRoot, "tampered-image-context");
  fs.mkdirSync(tamperedContext, { recursive: true });
  const tamperedProbe = path.join(tamperedContext, "cannae-probe");
  fs.writeFileSync(tamperedProbe, "not-the-measured-probe\n");
  fs.chmodSync(tamperedProbe, 0o755);
  fs.copyFileSync(
    path.join(context, "Dockerfile"),
    path.join(tamperedContext, "Dockerfile")
  );
  const tamperedTag = `cannae-phase17b2b-tampered:${process.pid}`;
  run("docker", [
    "build",
    "--network",
    "none",
    "--pull=false",
    "--provenance=false",
    "--sbom=false",
    "--tag",
    tamperedTag,
    tamperedContext
  ]);
  const tamperedInspected = JSON.parse(
    run("docker", ["image", "inspect", tamperedTag]).stdout
  );
  assert.strictEqual(tamperedInspected.length, 1);
  return {
    architecture,
    imageId: inspected[0].Id,
    probePath: probe,
    probeSha256: fileDigest(probe),
    tag,
    tamperedImageId: tamperedInspected[0].Id,
    tamperedTag
  };
}

function initRepository(name) {
  const repository = path.join(temporaryRoot, name.toLowerCase());
  fs.mkdirSync(repository, { recursive: true });
  fs.mkdirSync(path.join(repository, "runtime-profiles"), {
    recursive: true
  });
  fs.copyFileSync(
    PROFILE_SOURCE_PATH,
    path.join(repository, PROFILE_RELATIVE_PATH)
  );
  runGit(repository, ["init", "-q"]);
  runGit(repository, ["config", "user.email", "fixtures@example.com"]);
  runGit(repository, ["config", "user.name", "OCI Sandbox Fixture"]);
  fs.writeFileSync(path.join(repository, "README.md"), "oci sandbox\n");
  runGit(repository, ["add", "README.md", PROFILE_RELATIVE_PATH]);
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
    instance_id: `oci-sandbox-${name.toLowerCase()}`,
    audience: "cannae-protected-tools",
    deployment_sha256: digest(`deployment:${name}`),
    configuration_sha256: digest(`configuration:${name}`),
    assurance_level: "contract_reference",
    exclusive_path_verified: false
  };
}

function planFor(name) {
  const plan = readJson("sample-payloads/valid-mission-wave-plan.json");
  plan.id = `MWP-OCI-SANDBOX-${name}`;
  plan.mission_id = `MIS-OCI-SANDBOX-${name}`;
  plan.agents = plan.agents.filter(agent => agent.agent_id === "plans-agent");
  return plan;
}

function sandboxRule(name, argv, overrides = {}) {
  return {
    rule_id: `OSR-${name}`,
    tool_name: "Bash",
    operation_class: "process_execute",
    executable_path: "/cannae-probe",
    executable_format: "static_linux_binary",
    executable_sha256: liveRuntime.probeSha256,
    argv,
    cwd: "/workspace",
    timeout_ms: 2000,
    max_stdout_bytes: 4096,
    max_stderr_bytes: 4096,
    success_exit_codes: [0],
    expected_repository_effect: "none",
    ...overrides
  };
}

function processControls() {
  return {
    shell: false,
    detached: false,
    environment_mode: "empty",
    stdin_mode: "none",
    uid: 65532,
    gid: 65532,
    cap_drop: ["ALL"],
    no_new_privileges: true,
    init: true,
    pid_namespace: "private",
    ipc_namespace: "private",
    uts_namespace: "private",
    cgroup_namespace: "private"
  };
}

function filesystemControls() {
  return {
    read_only_rootfs: true,
    repository_destination: "/workspace",
    repository_read_only: true,
    recursive_read_only_required: true,
    tmpfs_destination: "/tmp",
    tmpfs_size_bytes: 16777216,
    tmpfs_options: ["rw", "noexec", "nosuid", "nodev"]
  };
}

function resourceControls() {
  return {
    memory_bytes: 134217728,
    memory_swap_bytes: 134217728,
    pids_limit: 64,
    cpu_period_us: 100000,
    cpu_quota_us: 50000
  };
}

function networkControls() {
  const controls = {
    mode: "none",
    outbound: "prohibited",
    allowed_interfaces: ["lo"],
    dns: "none",
    proxy_environment: "prohibited"
  };
  return {
    ...controls,
    network_policy_sha256: networkPolicyDigest(controls)
  };
}

function executorPolicy(
  repository,
  name,
  gateway,
  keys,
  rule,
  anchor,
  overrides = {}
) {
  const binding = resolveRepository(repository);
  const imageId = overrides.imageId || liveRuntime.imageId;
  const policy = {
    schema_version: "0.1",
    type: "OciLinuxSandboxPolicy",
    id: `OSP-${name}`,
    repository_binding: {
      repository_key: binding.key,
      identity_fingerprint: binding.identity_fingerprint
    },
    gateway_binding_sha256: objectDigest(gateway),
    platform: "linux_oci_docker_reference",
    providers: ["codex"],
    adapter_profile: {
      ...ociSandboxRuntimeMeasurements({
        probePath: liveRuntime.probePath,
        dockerPath: overrides.dockerPath
      }),
      signing_key_id: keys.keyId,
      signing_algorithm: "ed25519",
      signing_public_key_pem: keys.publicKeyPem
    },
    image: {
      image_id: imageId,
      operating_system: "linux",
      architecture: liveRuntime.architecture,
      pull_policy: "never",
      content_trust_verified: false
    },
    process_controls: processControls(),
    filesystem_controls: filesystemControls(),
    seccomp: {
      profile_name: "moby-default-seccomp-v0.2.1",
      source_uri:
        `https://raw.githubusercontent.com/moby/profiles/${SOURCE_COMMIT}/seccomp/default.json`,
      source_commit: SOURCE_COMMIT,
      profile_relative_path: PROFILE_RELATIVE_PATH,
      profile_sha256: fileDigest(
        path.join(repository, PROFILE_RELATIVE_PATH)
      ),
      default_action: "SCMP_ACT_ERRNO"
    },
    resource_controls: resourceControls(),
    network_controls: networkControls(),
    rules: [rule],
    valid_from: at(anchor, -60000),
    expires_at: at(anchor, 1800000),
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      production_execution_authorized: false,
      release_authorized: false
    }
  };
  policy.sandbox_profile_sha256 = sandboxProfileDigest(policy);
  return policy;
}

function dispatchPolicy(plan, name, toolInput, anchor) {
  return {
    schema_version: "0.1",
    type: "DispatchToolPolicy",
    id: `DTP-OCI-SANDBOX-${name}`,
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    agent_id: "plans-agent",
    provider: "codex",
    default_decision: "deny",
    tool_rules: [{
      rule_id: `DTR-OCI-SANDBOX-${name}`,
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
    valid_until: at(anchor, 1800000)
  };
}

function requestFor(setup, selected, anchor) {
  return {
    schema_version: "0.2",
    type: "ToolGatewayRequest",
    id: `TGR-OCI-SANDBOX-${setup.name}`,
    transaction_id: `GTX-OCI-SANDBOX-${setup.name}`,
    mission_id: setup.plan.mission_id,
    wave_id: setup.plan.wave_id,
    agent_id: "plans-agent",
    provider: "codex",
    gateway: clone(setup.gateway),
    authenticated_principal: {
      authentication_method: "fixture",
      issuer: "fixture://oci-linux-sandbox",
      subject: "agent:plans-agent",
      audience: "cannae-protected-tools",
      credential_sha256: digest(`credential:${setup.name}`),
      proof_sha256: digest(`proof:${setup.name}`),
      proof_verified: true,
      session_id: setup.identity.sessionId,
      provider_agent_id: setup.identity.providerAgentId,
      authenticated_at: at(anchor, -60000),
      expires_at: at(anchor, 1800000)
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
      tool_use_id: `oci-sandbox-tool-${setup.name}`,
      tool_name: "Bash",
      operation_class: "process_execute",
      tool_input_sha256: inputDigest(setup.toolInput)
    },
    idempotency_key: digest(`idempotency:${setup.name}`),
    raw_input_retained: false,
    requested_at: at(anchor, -2000),
    valid_until: at(anchor, 1800000),
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    }
  };
}

function setupScenario(name, rule, overrides = {}) {
  const anchor = Date.now();
  const repository = initRepository(name);
  const plan = planFor(name);
  plan.created_at = at(anchor, -60000);
  plan.valid_until = at(anchor, 3600000);
  const gateway = gatewayProjection(name);
  const keys = keyMaterial();
  const policy = executorPolicy(
    repository,
    name,
    gateway,
    keys,
    rule,
    anchor,
    overrides
  );
  const persisted = persistOciLinuxSandboxPolicy({
    repository,
    artifactRoot,
    missionId: plan.mission_id,
    waveId: plan.wave_id
  }, policy);
  const toolInput = {
    schema_version: "0.1",
    type: "OciSandboxToolInput",
    sandbox_policy_ref: clone(persisted.policy_ref),
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

function emitSample(fileName, payload) {
  if (process.env.CANNAE_EMIT_OCI_SAMPLES !== "1") return;
  fs.writeFileSync(
    path.join(ROOT, "sample-payloads", fileName),
    `${JSON.stringify(payload, null, 2)}\n`
  );
}

function transactionStatus(setup) {
  return gatewayStatus(setup.gatewayOptions, {
    transactionId: setup.transactionId
  }).transactions[0];
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
  return executeOciLinuxSandbox({
    ...setup.gatewayOptions,
    adapterPrivateKeyPem: setup.keys.privateKeyPem,
    probePath: liveRuntime.probePath,
    ...overrides
  }, {
    transactionId: setup.transactionId,
    toolInput: clone(setup.toolInput)
  });
}

function dockerFailureProxy(name, config) {
  const executable = path.join(temporaryRoot, `docker-${name}.js`);
  const trace = `${executable}.trace`;
  const marker = `${executable}.removed`;
  fs.writeFileSync(executable, `#!${process.execPath}
const fs = require("fs");
const { spawnSync } = require("child_process");
const config = ${JSON.stringify(config)};
const trace = ${JSON.stringify(trace)};
const marker = ${JSON.stringify(marker)};
const args = process.argv.slice(2);
fs.appendFileSync(trace, JSON.stringify(args) + "\\n");
function docker(argv) {
  const result = spawnSync("docker", argv, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}
function emit(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status === null ? 2 : result.status);
}
const removing = args[0] === "container" && args[1] === "rm";
const inspecting = args[0] === "container" && args[1] === "inspect";
const listing = args[0] === "container" && args[1] === "ls";
if (config.afterWorkloadRemoval && removing) {
  const before = docker(["container", "inspect", args[args.length - 1]]);
  const result = docker(args);
  if (before.status === 0 && result.status === 0) {
    const row = JSON.parse(before.stdout)[0];
    if (/^\\/cannae-[a-f0-9]{24}$/.test(row.Name)) {
      fs.writeFileSync(marker, JSON.stringify({ id: row.Id, name: row.Name.slice(1) }));
    }
  }
  emit(result);
}
const removed = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, "utf8")) : null;
const inject = !config.afterWorkloadRemoval || (removed && args.some(arg =>
  [removed.id, removed.name, "id=" + removed.id, "name=" + removed.name].includes(arg)));
if (!config.afterWorkloadRemoval && removing) emit({ status: 0 });
if (inject && inspecting) emit({ status: 1, stderr: "synthetic lookup failure\\n" });
if (inject && listing) {
  if (config.signal) process.kill(process.pid, "SIGTERM");
  else emit(config.response);
} else emit(docker(args));
`);
  fs.chmodSync(executable, 0o755);
  return { executable, trace };
}

const fixtures = [];

function fixture(name, fn, requiresLive = true) {
  fixtures.push({ name, fn, requiresLive });
}

fixture(
  "vendored seccomp profile matches pinned byte and semantic digests",
  async () => {
    const profile = readJson(PROFILE_RELATIVE_PATH);
    assert.strictEqual(fileDigest(PROFILE_SOURCE_PATH), PROFILE_FILE_SHA256);
    assert.strictEqual(objectDigest(profile), PROFILE_OBJECT_SHA256);
    assert.strictEqual(profile.defaultAction, "SCMP_ACT_ERRNO");
  },
  false
);

fixture(
  "Codex and Claude OCI wrappers resolve runtime and route cleanup failures",
  async () => {
    for (const wrapper of [
      "codex-skills/controls-doctrine-operator/scripts/operate_oci_sandbox.js",
      ".claude/skills/controls-doctrine-operator/scripts/operate_oci_sandbox.js"
    ]) {
      assert.strictEqual(
        require(path.join(ROOT, wrapper)).findRuntimeRoot(),
        ROOT
      );
      for (const query of ["cleanup failure", "daemon unavailable", "container absence"]) {
        const routed = spawnSync(process.execPath, [
          path.join(ROOT, path.dirname(wrapper), "route_controls_docs.js"),
          "--actor=user", query, ROOT
        ], { cwd: os.tmpdir(), encoding: "utf8" });
        assert.strictEqual(routed.status, 0, routed.stderr);
        const route = JSON.parse(routed.stdout);
        assert(route.recommended_documents.some(doc =>
          doc.path === "docs/oci-linux-sandbox-provider.md"));
        assert(route.validation_commands.includes(
          "node run-oci-linux-sandbox-provider-fixtures.js"));
      }
    }
  },
  false
);

fixture("pinned OCI execution commits measured kernel evidence once", async () => {
  const setup = setupScenario(
    "SUCCESS",
    sandboxRule("SUCCESS", ["workload", "success"])
  );
  const completed = await execute(setup);
  assert.strictEqual(
    completed.state,
    "committed",
    completed.provider_failure || "unexpected gateway state"
  );
  assert.strictEqual(completed.process_status, "succeeded");
  const receipt = loadArtifact(completed.receipt_ref);
  assert.strictEqual(receipt.schema_version, "0.4");
  assert.strictEqual(
    receipt.executor.execution_mode,
    "oci_linux_sandbox_reference"
  );
  const probe = loadArtifact(completed.probe_observation_ref);
  assert.strictEqual(probe.status.no_new_privs, 1);
  assert.strictEqual(probe.status.seccomp_mode, 2);
  assert.deepStrictEqual(
    Object.values(probe.status.capabilities),
    Array(5).fill("0000000000000000")
  );
  assert.strictEqual(probe.mounts.root.read_only, true);
  assert.strictEqual(probe.mounts.workspace.read_only, true);
  assert.strictEqual(probe.mounts.workspace_recursive_read_only, true);
  assert.deepStrictEqual(probe.network.addressed_interfaces, ["lo"]);
  assert.deepStrictEqual(probe.network.non_loopback_addresses, []);
  assert.strictEqual(probe.network.default_route_count, 0);
  assert.strictEqual(probe.network.outbound_connect_denied, true);
  const policy = loadArtifact(completed.sandbox_policy_ref);
  const envelope = loadArtifact(completed.execution_envelope_ref);
  const observation = loadArtifact(completed.execution_observation_ref);
  emitSample("valid-oci-linux-sandbox-policy.json", policy);
  emitSample("valid-oci-sandbox-tool-input.json", setup.toolInput);
  emitSample("valid-oci-sandbox-execution-envelope.json", envelope);
  emitSample("valid-oci-sandbox-probe-observation.json", probe);
  emitSample("valid-oci-sandbox-execution-observation.json", observation);
  const invalidPolicy = clone(policy);
  invalidPolicy.authority.production_execution_authorized = true;
  emitSample("invalid-oci-linux-sandbox-policy-overclaim.json", invalidPolicy);
  const invalidInput = clone(setup.toolInput);
  invalidInput.sandbox_policy_ref = clone(NONE_REF);
  emitSample("invalid-oci-sandbox-tool-input-unbound.json", invalidInput);
  const invalidEnvelope = clone(envelope);
  invalidEnvelope.execution_event_ref = clone(NONE_REF);
  emitSample(
    "invalid-oci-sandbox-execution-envelope-unbound.json",
    invalidEnvelope
  );
  const invalidProbe = clone(probe);
  invalidProbe.status.no_new_privs = 0;
  emitSample(
    "invalid-oci-sandbox-probe-observation-privileged.json",
    invalidProbe
  );
  const invalidObservation = clone(observation);
  invalidObservation.cleanup.container_removed = false;
  emitSample(
    "invalid-oci-sandbox-execution-observation-unclean.json",
    invalidObservation
  );
  const replay = await execute(setup);
  assert.strictEqual(replay.state, "committed");
  assert.strictEqual(replay.replayed, true);
  assert.deepStrictEqual(
    replay.execution_envelope_ref,
    completed.execution_envelope_ref
  );
});

fixture("OCI sandbox input rejects a caller-declared fixture result", async () => {
  const setup = setupScenario(
    "BYPASS",
    sandboxRule("BYPASS", ["workload", "success"])
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

fixture("seccomp profile byte drift is denied before gateway begin", async () => {
  const setup = setupScenario(
    "SECCOMP-DRIFT",
    sandboxRule("SECCOMP-DRIFT", ["workload", "success"])
  );
  fs.appendFileSync(
    path.join(setup.repository, PROFILE_RELATIVE_PATH),
    "\n"
  );
  const denied = await (async () => {
    try {
      await execute(setup);
      return null;
    } catch (error) {
      return error;
    }
  })();
  assert(denied);
  assert.match(denied.message, /Seccomp profile digest changed/);
  assert.strictEqual(transactionStatus(setup).state, "authorized");
});

fixture("unavailable image digest is denied before gateway begin", async () => {
  const setup = setupScenario(
    "IMAGE-MISSING",
    sandboxRule("IMAGE-MISSING", ["workload", "success"]),
    { imageId: `sha256:${"0".repeat(64)}` }
  );
  const denied = await (async () => {
    try {
      await execute(setup);
      return null;
    } catch (error) {
      return error;
    }
  })();
  assert(denied);
  assert.match(denied.message, /OCI image appraisal failed/);
  assert.strictEqual(transactionStatus(setup).state, "authorized");
});

fixture("image with a substituted probe is denied before gateway begin", async () => {
  const setup = setupScenario(
    "IMAGE-PROBE-MISMATCH",
    sandboxRule("IMAGE-PROBE-MISMATCH", ["workload", "success"]),
    { imageId: liveRuntime.tamperedImageId }
  );
  const denied = await (async () => {
    try {
      await execute(setup);
      return null;
    } catch (error) {
      return error;
    }
  })();
  assert(denied);
  assert.match(denied.message, /image probe digest/);
  assert.strictEqual(transactionStatus(setup).state, "authorized");
});

fixture("tampered probe privilege evidence fails semantic validation", async () => {
  const setup = setupScenario(
    "PROBE-TAMPER",
    sandboxRule("PROBE-TAMPER", ["workload", "success"])
  );
  const completed = await execute(setup);
  const probe = loadArtifact(completed.probe_observation_ref);
  probe.status.no_new_privs = 0;
  const validation = validatePayload(
    probe,
    "oci-sandbox-probe-observation"
  );
  assert.strictEqual(validation.valid, false);
  assert(validation.issues.some(
    item => item.code === "OCI_SANDBOX_PROBE_PRIVILEGE_INVALID"
  ));
});

fixture("container timeout is measured and committed as failed", async () => {
  const setup = setupScenario(
    "TIMEOUT",
    sandboxRule("TIMEOUT", ["workload", "sleep"], {
      timeout_ms: 120
    })
  );
  const completed = await execute(setup);
  assert.strictEqual(completed.state, "committed");
  assert.strictEqual(completed.process_status, "failed");
  assert.strictEqual(completed.process_result.termination_reason, "timeout");
  const probe = loadArtifact(completed.probe_observation_ref);
  assert.strictEqual(probe.child.timed_out, true);
});

fixture("post-create interruption removes the container and never reruns", async () => {
  const setup = setupScenario(
    "CREATE-INTERRUPTED",
    sandboxRule("CREATE-INTERRUPTED", ["workload", "success"])
  );
  const interrupted = await execute(setup, {
    faultInjectionStage: "after_create"
  });
  assert.strictEqual(interrupted.state, "recovery_required");
  const replay = await execute(setup);
  assert.strictEqual(replay.state, "recovery_required");
  assert.strictEqual(replay.replayed, true);
  const envelope = loadArtifact(interrupted.execution_envelope_ref);
  const inspect = run(
    "docker",
    ["container", "inspect", envelope.launch.container_name],
    { allowFailure: true }
  );
  assert.notStrictEqual(inspect.status, 0);
});

fixture("recovery replay reports cleanup failure and retries containment", async () => {
  const setup = setupScenario(
    "RECOVERY-CLEANUP",
    sandboxRule("RECOVERY-CLEANUP", ["workload", "success"])
  );
  const interrupted = await execute(setup, {
    faultInjectionStage: "after_create"
  });
  assert.strictEqual(interrupted.state, "recovery_required");
  const envelope = loadArtifact(interrupted.execution_envelope_ref);
  const containerName = envelope.launch.container_name;
  run("docker", [
    "container",
    "create",
    "--name",
    containerName,
    "--pull",
    "never",
    liveRuntime.imageId,
    "workload",
    "sleep"
  ]);
  try {
    const unavailable = await execute(setup, {
      dockerPath: path.join(temporaryRoot, "missing-docker")
    });
    assert.strictEqual(unavailable.state, "recovery_required");
    assert.strictEqual(unavailable.replayed, true);
    assert.match(
      unavailable.provider_failure,
      /OCI_SANDBOX_CONTAINER_CLEANUP_ERROR/
    );
    assert.strictEqual(run(
      "docker",
      ["container", "inspect", containerName],
      { allowFailure: true }
    ).status, 0);

    const replay = await execute(setup);
    assert.strictEqual(replay.state, "recovery_required");
    assert.strictEqual(replay.replayed, true);
    assert.strictEqual(replay.provider_failure, undefined);
    assert.notStrictEqual(run(
      "docker",
      ["container", "inspect", containerName],
      { allowFailure: true }
    ).status, 0);
  } finally {
    run(
      "docker",
      ["container", "rm", "--force", containerName],
      { allowFailure: true }
    );
  }
});

fixture("an unavailable daemon cannot turn recovery cleanup into verified absence", async () => {
  const setup = setupScenario(
    "CLEANUP-DAEMON-UNAVAILABLE",
    sandboxRule("CLEANUP-DAEMON-UNAVAILABLE", ["workload", "success"])
  );
  const interrupted = await execute(setup, { faultInjectionStage: "after_create" });
  assert.strictEqual(interrupted.state, "recovery_required");
  const envelope = loadArtifact(interrupted.execution_envelope_ref);
  const containerName = envelope.launch.container_name;
  run("docker", ["container", "create", "--name", containerName,
    "--pull", "never", liveRuntime.imageId, "workload", "sleep"]);
  const previous = Object.fromEntries(["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]
    .map(key => [key, process.env[key]]));
  try {
    let unavailable;
    try {
      delete process.env.DOCKER_CONTEXT;
      delete process.env.DOCKER_TLS_VERIFY;
      delete process.env.DOCKER_CERT_PATH;
      process.env.DOCKER_HOST = `unix://${path.join(temporaryRoot, "missing-docker.sock")}`;
      unavailable = await execute(setup);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    assert.strictEqual(run("docker", ["container", "inspect", containerName], { allowFailure: true }).status, 0,
      "the original daemon must still contain the unremoved fixture container");
    assert.strictEqual(unavailable.state, "recovery_required");
    assert.strictEqual(unavailable.replayed, true);
    assert.match(unavailable.provider_failure || "", /OCI_SANDBOX_CONTAINER_CLEANUP_/,
      "daemon connection failure must remain an explicit cleanup failure");
    const retry = await execute(setup);
    assert.strictEqual(retry.state, "recovery_required");
    assert.strictEqual(retry.replayed, true);
    assert.strictEqual(retry.provider_failure, undefined);
    assert.deepStrictEqual(retry.execution_envelope_ref, interrupted.execution_envelope_ref);
    assert.strictEqual(retry.execution_observation_ref, null, "cleanup must not manufacture execution evidence");
  } finally {
    run("docker", ["container", "rm", "--force", containerName], { allowFailure: true });
  }
});

fixture("recovery rejects failed, signaled, malformed and still-present cleanup observations", async () => {
  const setup = setupScenario("CLEANUP-OBSERVATIONS", sandboxRule("CLEANUP-OBSERVATIONS", ["workload", "success"]));
  const interrupted = await execute(setup, { faultInjectionStage: "after_create" });
  assert.strictEqual(interrupted.state, "recovery_required");
  const container = loadArtifact(interrupted.execution_envelope_ref).launch.container_name;
  const id = run("docker", ["container", "create", "--name", container,
    "--pull", "never", liveRuntime.imageId, "workload", "sleep"]).stdout.trim();
  const row = { ID: id, Names: container };
  const cases = [
    ["permission", { status: 1, stderr: "permission denied\n" }],
    ["diagnostic", { status: 0, stderr: "incomplete listing\n" }],
    ["invalid-json", { status: 0, stdout: "not JSON\n" }],
    ["array", { status: 0, stdout: "[]\n" }],
    ["missing-fields", { status: 0, stdout: "{}\n" }],
    ["invalid-id-type", { status: 0, stdout: JSON.stringify({ ...row, ID: [id], Names: `${container}-other` }) }],
    ["truncated-id", { status: 0, stdout: JSON.stringify({ ...row, ID: id.slice(0, 12) }) }],
    ["invalid-names", { status: 0, stdout: JSON.stringify({ ...row, Names: `/${container}` }) }],
    ["unbound-row", { status: 0, stdout: JSON.stringify({ ...row, Names: "another-container" }) }],
    ["duplicate-row", { status: 0, stdout: Array(2).fill(JSON.stringify({ ...row, Names: `${container}-other` })).join("\n") }],
    ["present", { status: 0, stdout: JSON.stringify(row) }],
    ["signaled", { status: 0 }]
  ];
  try {
    for (const [name, response] of cases) {
      const proxy = dockerFailureProxy(name, { response, signal: name === "signaled" });
      const result = await execute(setup, { dockerPath: proxy.executable });
      assert.strictEqual(result.state, "recovery_required", name);
      assert.strictEqual(result.replayed, true, name);
      assert.match(result.provider_failure || "", /OCI_SANDBOX_CONTAINER_CLEANUP_ERROR/, name);
      assert.deepStrictEqual(result.execution_envelope_ref, interrupted.execution_envelope_ref, name);
      assert.strictEqual(result.execution_observation_ref, null, name);
      const calls = fs.readFileSync(proxy.trace, "utf8").trim().split("\n").map(line => JSON.parse(line));
      assert(calls.every(args => args[0] === "container" && ["rm", "ls"].includes(args[1])),
        `${name}: recovery invoked a non-cleanup operation`);
      assert.deepStrictEqual(calls.find(args => args[1] === "ls"),
        ["container", "ls", "--all", "--no-trunc", "--filter", `name=${container}`, "--format", "{{json .}}"]);
    }
    assert.strictEqual(run("docker", ["container", "inspect", id]).status, 0);
    const retry = await execute(setup);
    assert.strictEqual(retry.state, "recovery_required");
    assert.strictEqual(retry.provider_failure, undefined);
    const privateKey = path.join(temporaryRoot, "cleanup-wrapper-key.pem");
    fs.writeFileSync(privateKey, setup.keys.privateKeyPem, { mode: 0o600 });
    const input = path.join(temporaryRoot, "cleanup-wrapper-input.json");
    fs.writeFileSync(input, JSON.stringify(setup.toolInput));
    for (const root of ["codex-skills/controls-doctrine-operator", ".claude/skills/controls-doctrine-operator"]) {
      const result = run(process.execPath, [path.join(ROOT, root, "scripts/operate_oci_sandbox.js"), "execute",
        "--repository", setup.repository, "--artifact-root", artifactRoot, "--transaction", setup.transactionId,
        "--tool-input", input, "--private-key", privateKey, "--probe", liveRuntime.probePath,
        "--gateway-binding-sha256", setup.gatewayOptions.gatewayBindingSha256,
        "--verified-principal-sha256", setup.gatewayOptions.verifiedPrincipalSha256], { allowFailure: true });
      assert.strictEqual(result.status, 1, "verified cleanup must not turn recovery into CLI success");
      const output = JSON.parse(result.stdout);
      assert.strictEqual(output.state, "recovery_required");
      assert.strictEqual(output.provider_failure, undefined);
      assert.strictEqual(output.release_authorized, false);
    }
  } finally {
    run("docker", ["container", "rm", "--force", id], { allowFailure: true });
  }
});

fixture("cleanup failure after real target execution cannot produce a committed observation", async () => {
  const proxy = dockerFailureProxy("post-removal", {
    afterWorkloadRemoval: true,
    response: { status: 1, stderr: "synthetic daemon failure after removal\n" }
  });
  const setup = setupScenario("CLEANUP-AFTER-EXECUTION", sandboxRule("CLEANUP-AFTER-EXECUTION", ["workload", "success"]),
    { dockerPath: proxy.executable });
  const result = await execute(setup, { dockerPath: proxy.executable });
  assert.strictEqual(result.state, "recovery_required", "unverified cleanup committed a real execution result");
  assert.match(result.provider_failure, /Docker cleanup absence verification failed/);
  assert.strictEqual(result.execution_observation_ref, undefined);
  const status = transactionStatus(setup);
  assert.strictEqual(status.state, "recovery_required");
  const retry = await execute(setup);
  assert.strictEqual(retry.state, "recovery_required");
  assert.strictEqual(retry.provider_failure, undefined);
  assert.strictEqual(retry.execution_observation_ref, null);
  const calls = fs.readFileSync(proxy.trace, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.strictEqual(calls.filter(args => args[0] === "container" && args[1] === "start").length, 1);
});

fixture("cleanup uses exact names and preserves a similarly named stopped container", async () => {
  const setup = setupScenario("CLEANUP-NAME-MATCH", sandboxRule("CLEANUP-NAME-MATCH", ["workload", "success"]));
  const interrupted = await execute(setup, { faultInjectionStage: "after_create" });
  const name = loadArtifact(interrupted.execution_envelope_ref).launch.container_name;
  const similarName = `${name}-other`;
  const id = run("docker", ["container", "create", "--name", similarName,
    "--pull", "never", liveRuntime.imageId, "workload", "sleep"]).stdout.trim();
  try {
    const retry = await execute(setup);
    assert.strictEqual(retry.state, "recovery_required");
    assert.strictEqual(retry.provider_failure, undefined, "substring matches must not stand in for the exact target");
    assert.strictEqual(run("docker", ["container", "inspect", id]).status, 0,
      "cleanup touched a different container");
  } finally {
    run("docker", ["container", "rm", "--force", id], { allowFailure: true });
  }
});

fixture("post-container interruption cleans up and never reruns", async () => {
  const setup = setupScenario(
    "INTERRUPTED",
    sandboxRule("INTERRUPTED", ["workload", "success"])
  );
  const interrupted = await execute(setup, {
    faultInjectionStage: "after_container"
  });
  assert.strictEqual(interrupted.state, "recovery_required");
  const replay = await execute(setup);
  assert.strictEqual(replay.state, "recovery_required");
  assert.strictEqual(replay.replayed, true);
  const envelope = loadArtifact(interrupted.execution_envelope_ref);
  const inspect = run(
    "docker",
    ["container", "inspect", envelope.launch.container_name],
    { allowFailure: true }
  );
  assert.notStrictEqual(inspect.status, 0);
});

async function main() {
  let failed = 0;
  let skipped = 0;
  const availability = liveRuntimeAvailable();
  if (!availability.available &&
      process.env.CANNAE_REQUIRE_LIVE_OCI === "1") {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    console.error(
      `FAIL live OCI sandbox runtime is required: ${availability.reason}`
    );
    console.log(JSON.stringify({
      total: fixtures.length,
      passed: 0,
      skipped: 0,
      failed: fixtures.length
    }, null, 2));
    process.exitCode = 1;
    return;
  }
  try {
    if (availability.available) {
      liveRuntime = buildProbeImage(availability.architecture);
    }
    for (const item of fixtures) {
      if (item.requiresLive && !availability.available) {
        skipped += 1;
        console.log(`SKIP ${item.name}: ${availability.reason}`);
        continue;
      }
      try {
        await item.fn();
        console.log(`PASS ${item.name}`);
      } catch (error) {
        failed += 1;
        console.error(`FAIL ${item.name}: ${error.stack || error.message}`);
      }
    }
  } finally {
    if (liveRuntime) {
      for (const tag of [liveRuntime.tag, liveRuntime.tamperedTag]) {
        run(
          "docker",
          ["image", "rm", "--force", tag],
          { allowFailure: true }
        );
      }
    }
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
  console.log(JSON.stringify({
    total: fixtures.length,
    passed: fixtures.length - failed - skipped,
    skipped,
    failed
  }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main();
