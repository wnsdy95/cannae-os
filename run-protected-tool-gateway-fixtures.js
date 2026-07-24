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
  admitToolRequest,
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
const { writeRepositoryArtifact } = require("./repository-artifact-store");
const { openWave } = require("./skill-mission-controller");

const ROOT = __dirname;
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-protected-gateway-"));
const artifactRoot = path.join(temporaryRoot, "artifacts");
const toolInput = { command: "git status --short" };
const otherInput = { command: "git rev-parse HEAD" };

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function runGit(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "git failed").trim());
  return result.stdout.trim();
}

function initRepository(name) {
  const repository = path.join(temporaryRoot, name);
  fs.mkdirSync(repository, { recursive: true });
  runGit(repository, ["init", "-q"]);
  runGit(repository, ["config", "user.email", "fixtures@example.com"]);
  runGit(repository, ["config", "user.name", "Gateway Fixture"]);
  fs.writeFileSync(path.join(repository, "README.md"), "protected gateway fixture\n");
  runGit(repository, ["add", "README.md"]);
  runGit(repository, ["commit", "-qm", "initial"]);
  return repository;
}

function expectThrow(fn, pattern) {
  let error;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert(error, "expected operation to throw");
  if (pattern) assert(pattern.test(error.message), error.message);
}

function policyDraft(plan, scenario, operationClass = "process_execute") {
  return {
    schema_version: "0.1",
    type: "DispatchToolPolicy",
    id: `DTP-GATEWAY-${scenario}`,
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    agent_id: "plans-agent",
    provider: "codex",
    default_decision: "deny",
    tool_rules: [{
      rule_id: `DTR-GATEWAY-${scenario}`,
      mission_action: "Run deterministic validation.",
      tool_name: "Bash",
      operation_class: operationClass,
      input_match: {
        mode: "exact_sha256",
        allowed_sha256: [inputDigest(toolInput)]
      },
      max_uses: 8
    }],
    max_total_admissions: 8,
    lease_ttl_seconds: 3600,
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
    approved_at: "2026-07-24T01:00:00Z",
    valid_until: "2027-07-23T01:00:00Z"
  };
}

function scenarioPlan(scenario) {
  const plan = readJson("sample-payloads/valid-mission-wave-plan.json");
  plan.id = `MWP-GATEWAY-${scenario}`;
  plan.mission_id = `MIS-GATEWAY-${scenario}`;
  plan.agents = plan.agents.filter(agent => agent.agent_id === "plans-agent");
  return plan;
}

function setupScenario(scenario, operationClass = "process_execute") {
  const repository = initRepository(scenario.toLowerCase());
  const plan = scenarioPlan(scenario);
  const draft = policyDraft(plan, scenario, operationClass);
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
    now: "2026-07-24T01:00:00Z"
  });
  const runtimeOptions = {
    repository,
    artifactRoot,
    now: "2026-07-24T01:00:00Z"
  };
  authorizeDispatchPolicy(runtimeOptions, draft);
  const issued = issueLease(runtimeOptions, draft.id, {
    sessionId: `session-${scenario.toLowerCase()}`,
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
  return { repository, plan, draft, issued, identity };
}

function gatewayRequest(setup, sequence, overrides = {}) {
  const selected = activeLease({
    repository: setup.repository,
    artifactRoot,
    now: "2026-07-24T01:00:10Z"
  }, setup.identity);
  assert.strictEqual(selected.code, "LEASE_ACTIVE");
  const transactionId = `GTX-${setup.plan.mission_id.replace(/^MIS-/, "")}-${sequence}`;
  const request = {
    schema_version: "0.2",
    type: "ToolGatewayRequest",
    id: `TGR-${setup.plan.mission_id.replace(/^MIS-/, "")}-${sequence}`,
    transaction_id: transactionId,
    mission_id: setup.plan.mission_id,
    wave_id: setup.plan.wave_id,
    agent_id: "plans-agent",
    provider: "codex",
    gateway: {
      gateway_id: "cannae-reference-gateway",
      instance_id: `instance-${setup.plan.mission_id.toLowerCase()}`,
      audience: "cannae-protected-tools",
      deployment_sha256: digest(`deployment:${setup.plan.mission_id}`),
      configuration_sha256: digest(`configuration:${setup.plan.mission_id}`),
      assurance_level: "contract_reference",
      exclusive_path_verified: false
    },
    authenticated_principal: {
      authentication_method: "fixture",
      issuer: "fixture://protected-tool-gateway",
      subject: "agent:plans-agent",
      audience: "cannae-protected-tools",
      credential_sha256: digest(`credential:${setup.plan.mission_id}`),
      proof_sha256: digest(`proof:${setup.plan.mission_id}:${sequence}`),
      proof_verified: true,
      session_id: setup.identity.sessionId,
      provider_agent_id: setup.identity.providerAgentId,
      authenticated_at: "2026-07-24T00:59:00Z",
      expires_at: "2026-07-24T02:00:00Z"
    },
    identity_policy_ref: clone(NONE_REF),
    identity_challenge_ref: clone(NONE_REF),
    principal_evidence_ref: clone(NONE_REF),
    lease_ref: clone(selected.leaseRecord.ref),
    tool_policy_ref: clone(selected.leaseRecord.payload.tool_policy_ref),
    checkpoint_ref: clone(selected.checkpointRecord.ref),
    repository_binding: clone(selected.leaseRecord.payload.repository_binding),
    expected_repository_state: clone(selected.checkpointRecord.payload.repository_state),
    tool_call: {
      tool_use_id: `gateway-tool-${sequence}`,
      tool_name: "Bash",
      operation_class: "process_execute",
      tool_input_sha256: inputDigest(toolInput)
    },
    idempotency_key: digest(`idempotency:${setup.plan.mission_id}:${sequence}`),
    raw_input_retained: false,
    requested_at: "2026-07-24T01:00:10Z",
    valid_until: "2026-07-24T01:30:00Z",
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    }
  };
  return Object.assign(request, overrides);
}

function trustedOptions(setup, request, now) {
  const bindings = bindingDigests(request);
  return {
    repository: setup.repository,
    artifactRoot,
    now,
    gatewayBindingSha256: bindings.gateway,
    verifiedPrincipalSha256: bindings.principal
  };
}

function loadArtifact(ref) {
  return JSON.parse(fs.readFileSync(path.join(artifactRoot, ref.relative_path), "utf8"));
}

function persistReceivedRequest(setup, request) {
  const requestWrite = writeRepositoryArtifact({
    repositoryPath: setup.repository,
    artifactRoot,
    missionId: request.mission_id,
    waveId: request.wave_id,
    kind: "tool-gateway-requests",
    artifactId: request.id,
    payload: request,
    createdAt: request.requested_at
  });
  const requestRef = {
    artifact_id: request.id,
    relative_path: requestWrite.relative_path,
    sha256: requestWrite.sha256
  };
  const event = {
    schema_version: "0.2",
    type: "ToolGatewayTransactionEvent",
    id: `GTE-${request.id.replace(/^TGR-/, "")}-received`,
    transaction_id: request.transaction_id,
    mission_id: request.mission_id,
    wave_id: request.wave_id,
    agent_id: request.agent_id,
    sequence: 1,
    previous_event_ref: clone(NONE_REF),
    state: "received",
    request_ref: requestRef,
    decision_ref: clone(NONE_REF),
    receipt_ref: clone(NONE_REF),
    admission_ref: clone(NONE_REF),
    checkpoint_ref: clone(request.checkpoint_ref),
    identity_policy_ref: clone(request.identity_policy_ref),
    identity_challenge_ref: clone(request.identity_challenge_ref),
    principal_evidence_ref: clone(request.principal_evidence_ref),
    repository_binding: clone(request.repository_binding),
    idempotency_key: request.idempotency_key,
    tool_input_sha256: request.tool_call.tool_input_sha256,
    reason_codes: ["GATEWAY_REQUEST_RECEIVED"],
    recorded_at: request.requested_at,
    authority: clone(request.authority)
  };
  writeRepositoryArtifact({
    repositoryPath: setup.repository,
    artifactRoot,
    missionId: request.mission_id,
    waveId: request.wave_id,
    kind: "tool-gateway-transaction-events",
    artifactId: event.id,
    payload: event,
    createdAt: event.recorded_at
  });
}

function fixtureExecutor() {
  return {
    adapter_id: "fixture-executor",
    adapter_version: "0.1.0",
    adapter_sha256: digest("fixture-adapter"),
    runtime_sha256: digest("fixture-runtime"),
    sandbox_profile_sha256: digest("fixture-sandbox"),
    network_policy_sha256: digest("fixture-network-policy"),
    execution_mode: "fixture",
    executor_policy_ref: clone(NONE_REF),
    execution_envelope_ref: clone(NONE_REF),
    execution_observation_ref: clone(NONE_REF)
  };
}

const fixtures = [];

function fixture(name, fn) {
  fixtures.push({ name, fn });
}

fixture("exact request authorizes, begins, commits, and replays idempotently", () => {
  const setup = setupScenario("COMMIT");
  const request = gatewayRequest(setup, "001");
  const admitOptions = trustedOptions(setup, request, "2026-07-24T01:00:10Z");
  const authorized = admitGatewayRequest(admitOptions, request, toolInput);
  assert.strictEqual(authorized.state, "authorized");
  assert.strictEqual(authorized.production_execution_authorized, false);

  const requestBytes = fs.readFileSync(path.join(artifactRoot, authorized.request_ref.relative_path), "utf8");
  assert(!requestBytes.includes(toolInput.command), "gateway request persisted raw tool input");

  const beforeReplay = gatewayStatus(admitOptions, {
    transactionId: request.transaction_id
  }).artifact_store.manifest_revision;
  const replay = admitGatewayRequest(admitOptions, request, toolInput);
  const afterReplay = gatewayStatus(admitOptions, {
    transactionId: request.transaction_id
  }).artifact_store.manifest_revision;
  assert.strictEqual(replay.latest_event_ref.artifact_id, authorized.latest_event_ref.artifact_id);
  assert.strictEqual(afterReplay, beforeReplay);

  const conflicting = clone(request);
  conflicting.tool_call.tool_use_id = "gateway-tool-conflict";
  expectThrow(
    () => admitGatewayRequest(admitOptions, conflicting, toolInput),
    /GATEWAY_IDEMPOTENCY_CONFLICT/
  );
  const transactionConflict = clone(request);
  transactionConflict.id = "TGR-GATEWAY-COMMIT-transaction-conflict";
  transactionConflict.idempotency_key = digest("idempotency:transaction-conflict");
  expectThrow(
    () => admitGatewayRequest(
      trustedOptions(setup, transactionConflict, "2026-07-24T01:00:15Z"),
      transactionConflict,
      toolInput
    ),
    /GATEWAY_TRANSACTION_CONFLICT/
  );

  expectThrow(
    () => beginGatewayExecution(
      trustedOptions(setup, request, "2026-07-24T01:00:09Z"),
      request.transaction_id
    ),
    /before authorization/
  );
  const begun = beginGatewayExecution(
    trustedOptions(setup, request, "2026-07-24T01:00:20Z"),
    request.transaction_id
  );
  assert.strictEqual(begun.state, "executing");
  expectThrow(
    () => commitGatewayExecution(
      trustedOptions(setup, request, "2026-07-24T01:00:22Z"),
      request.transaction_id,
      {
        executionEventRef: begun.execution_event_ref,
        toolInput,
        result: { stdout: "", stderr: "" },
        executor: fixtureExecutor(),
        status: "succeeded",
        startedAt: "2026-07-24T01:00:19Z",
        finishedAt: "2026-07-24T01:00:21Z",
        exitCode: 0
      }
    ),
    /precedes the current execution event/
  );
  const committed = commitGatewayExecution(
    trustedOptions(setup, request, "2026-07-24T01:00:22Z"),
    request.transaction_id,
    {
      executionEventRef: begun.execution_event_ref,
      toolInput,
      result: { stdout: "", stderr: "" },
      executor: fixtureExecutor(),
      status: "succeeded",
      startedAt: "2026-07-24T01:00:20Z",
      finishedAt: "2026-07-24T01:00:21Z",
      exitCode: 0
    }
  );
  assert.strictEqual(committed.state, "committed");
  const receipt = loadArtifact(committed.receipt_ref);
  assert.strictEqual(receipt.execution.transaction_state, "committed");
  assert.strictEqual(receipt.execution.status, "succeeded");
  assert.strictEqual(receipt.production_deployment_verified, false);
  assert.strictEqual(receipt.executor.execution_mode, "fixture");

  const projection = gatewayStatus(admitOptions, {
    transactionId: request.transaction_id
  });
  assert.strictEqual(projection.transactions.length, 1);
  assert.strictEqual(projection.transactions[0].state, "committed");
});

fixture("trusted principal mismatch denies before dispatch admission", () => {
  const setup = setupScenario("PRINCIPAL");
  const request = gatewayRequest(setup, "001");
  const options = trustedOptions(setup, request, "2026-07-24T01:00:10Z");
  options.verifiedPrincipalSha256 = digest("foreign-principal");
  const denied = admitGatewayRequest(options, request, toolInput);
  assert.strictEqual(denied.state, "denied");
  assert(denied.reason_codes.includes("GATEWAY_PRINCIPAL_BINDING_MISMATCH"));
});

fixture("reference controller refuses a managed-exclusive deployment claim", () => {
  const setup = setupScenario("MANAGED");
  const request = gatewayRequest(setup, "001");
  request.gateway.assurance_level = "managed_exclusive";
  request.gateway.exclusive_path_verified = true;
  request.authenticated_principal.authentication_method = "mtls";
  request.identity_policy_ref = {
    artifact_id: "GIP-MANAGED-CLAIM",
    relative_path: "managed/policy.json",
    sha256: digest("managed-policy")
  };
  request.identity_challenge_ref = {
    artifact_id: "GIC-MANAGED-CLAIM",
    relative_path: "managed/challenge.json",
    sha256: digest("managed-challenge")
  };
  request.principal_evidence_ref = {
    artifact_id: "GPE-MANAGED-CLAIM",
    relative_path: "managed/evidence.json",
    sha256: digest("managed-evidence")
  };
  const denied = admitGatewayRequest(
    trustedOptions(setup, request, "2026-07-24T01:00:10Z"),
    request,
    toolInput
  );
  assert.strictEqual(denied.state, "denied");
  assert(denied.reason_codes.includes("GATEWAY_MANAGED_ASSURANCE_UNVERIFIED"));
});

fixture("raw input digest mismatch denies without consuming tool authority", () => {
  const setup = setupScenario("DIGEST");
  const request = gatewayRequest(setup, "001");
  const denied = admitGatewayRequest(
    trustedOptions(setup, request, "2026-07-24T01:00:10Z"),
    request,
    otherInput
  );
  assert.strictEqual(denied.state, "denied");
  assert(denied.reason_codes.includes("GATEWAY_TOOL_INPUT_DIGEST_MISMATCH"));
  const selected = activeLease({
    repository: setup.repository,
    artifactRoot,
    now: "2026-07-24T01:00:20Z"
  }, setup.identity);
  assert.strictEqual(selected.code, "LEASE_ACTIVE");
  assert.strictEqual(selected.checkpointRecord.payload.sequence, 0);
});

fixture("operation-class substitution cancels the dispatch admission", () => {
  const setup = setupScenario("CLASS");
  const request = gatewayRequest(setup, "001");
  request.tool_call.operation_class = "repository_read";
  const denied = admitGatewayRequest(
    trustedOptions(setup, request, "2026-07-24T01:00:10Z"),
    request,
    toolInput
  );
  assert.strictEqual(denied.state, "denied");
  assert(denied.reason_codes.includes("GATEWAY_OPERATION_CLASS_MISMATCH"));
  const selected = activeLease({
    repository: setup.repository,
    artifactRoot,
    now: "2026-07-24T01:00:20Z"
  }, setup.identity);
  assert.strictEqual(selected.code, "LEASE_ACTIVE");
  assert.strictEqual(selected.checkpointRecord.payload.execution_result.status, "cancelled");
});

fixture("authorized but unstarted transaction recovers by exact cancellation", () => {
  const setup = setupScenario("ABORT");
  const request = gatewayRequest(setup, "001");
  const options = trustedOptions(setup, request, "2026-07-24T01:00:10Z");
  assert.strictEqual(admitGatewayRequest(options, request, toolInput).state, "authorized");
  expectThrow(
    () => recoverGatewayTransaction(
      trustedOptions(setup, request, "2026-07-24T01:00:20Z"),
      request.transaction_id,
      { toolInput: otherInput }
    ),
    /exact raw tool input/
  );
  const aborted = recoverGatewayTransaction(
    trustedOptions(setup, request, "2026-07-24T01:00:21Z"),
    request.transaction_id,
    { toolInput }
  );
  assert.strictEqual(aborted.state, "aborted");
  const receipt = loadArtifact(aborted.receipt_ref);
  assert.strictEqual(receipt.execution.status, "not_executed");
  assert.strictEqual(receipt.execution.external_effects, "none");
  assert.strictEqual(receipt.executor.execution_mode, "none");
  const selected = activeLease({
    repository: setup.repository,
    artifactRoot,
    now: "2026-07-24T01:00:30Z"
  }, setup.identity);
  assert.strictEqual(selected.code, "LEASE_ACTIVE");
  assert.strictEqual(selected.checkpointRecord.payload.execution_result.status, "cancelled");
});

fixture("received transaction revokes an orphan dispatch admission during recovery", () => {
  const setup = setupScenario("ORPHAN");
  const request = gatewayRequest(setup, "001");
  persistReceivedRequest(setup, request);
  const admission = admitToolRequest({
    repository: setup.repository,
    artifactRoot,
    now: "2026-07-24T01:00:11Z"
  }, setup.identity, {
    hook_event_name: "PreToolUse",
    tool_use_id: request.tool_call.tool_use_id,
    tool_name: request.tool_call.tool_name,
    tool_input: toolInput
  });
  assert.strictEqual(admission.decision, "allow");

  const recovered = recoverGatewayTransaction(
    trustedOptions(setup, request, "2026-07-24T01:00:20Z"),
    request.transaction_id
  );
  assert.strictEqual(recovered.state, "denied");
  assert(recovered.reason_codes.includes("GATEWAY_ORPHAN_ADMISSION_REVOKED"));
  assert(recovered.reason_codes.includes("GATEWAY_ORPHAN_LEASE_BLOCKED"));
  const selected = activeLease({
    repository: setup.repository,
    artifactRoot,
    now: "2026-07-24T01:00:30Z"
  }, setup.identity);
  assert.strictEqual(selected.code, "LEASE_BLOCKED");
});

fixture("received transaction exactly cancels an orphan admission when input is available", () => {
  const setup = setupScenario("ORPHAN-CANCEL");
  const request = gatewayRequest(setup, "001");
  persistReceivedRequest(setup, request);
  const admission = admitToolRequest({
    repository: setup.repository,
    artifactRoot,
    now: "2026-07-24T01:00:11Z"
  }, setup.identity, {
    hook_event_name: "PreToolUse",
    tool_use_id: request.tool_call.tool_use_id,
    tool_name: request.tool_call.tool_name,
    tool_input: toolInput
  });
  assert.strictEqual(admission.decision, "allow");

  const recovered = recoverGatewayTransaction(
    trustedOptions(setup, request, "2026-07-24T01:00:20Z"),
    request.transaction_id,
    { toolInput }
  );
  assert.strictEqual(recovered.state, "denied");
  assert(recovered.reason_codes.includes("GATEWAY_ORPHAN_ADMISSION_CANCELLED"));
  const selected = activeLease({
    repository: setup.repository,
    artifactRoot,
    now: "2026-07-24T01:00:30Z"
  }, setup.identity);
  assert.strictEqual(selected.code, "LEASE_ACTIVE");
  assert.strictEqual(selected.checkpointRecord.payload.execution_result.status, "cancelled");
});

fixture("executing transaction with unknown outcome blocks the lease and requires recovery", () => {
  const setup = setupScenario("RECOVERY");
  const request = gatewayRequest(setup, "001");
  const options = trustedOptions(setup, request, "2026-07-24T01:00:10Z");
  assert.strictEqual(admitGatewayRequest(options, request, toolInput).state, "authorized");
  assert.strictEqual(beginGatewayExecution(
    trustedOptions(setup, request, "2026-07-24T01:00:20Z"),
    request.transaction_id
  ).state, "executing");
  const recovered = recoverGatewayTransaction(
    trustedOptions(setup, request, "2026-07-24T01:00:30Z"),
    request.transaction_id
  );
  assert.strictEqual(recovered.state, "recovery_required");
  const receipt = loadArtifact(recovered.receipt_ref);
  assert.strictEqual(receipt.execution.status, "unknown");
  assert.strictEqual(receipt.execution.external_effects, "unknown");
  assert.strictEqual(receipt.executor.execution_mode, "none");
  const selected = activeLease({
    repository: setup.repository,
    artifactRoot,
    now: "2026-07-24T01:00:40Z"
  }, setup.identity);
  assert.strictEqual(selected.code, "LEASE_BLOCKED");
});

async function main() {
  let passed = 0;
  for (const item of fixtures) {
    try {
      await item.fn();
      passed += 1;
      console.log(`PASS ${item.name}`);
    } catch (error) {
      console.error(`FAIL ${item.name}: ${error.stack || error.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) {
    console.log(`Protected tool gateway fixtures: ${passed}/${fixtures.length} passed`);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
