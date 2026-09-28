const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { NONE_REF, activeLease, authorizeDispatchPolicy, inputDigest, issueLease } = require("./dispatch-runtime-controller");
const { bindingDigests } = require("./protected-tool-gateway");
const { openWave } = require("./skill-mission-controller");

function createGatewayFixtureSupport(initialize) {
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
    if (initialize) initialize(repository);
    runGit(repository, ["add", "."]);
    runGit(repository, ["commit", "-qm", "initial"]);
    return fs.realpathSync(repository);
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
    plan.created_at = "2026-07-24T01:00:00Z";
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

  return { ROOT, temporaryRoot, artifactRoot, toolInput, otherInput, digest, clone, readJson, runGit,
    initRepository, expectThrow, policyDraft, scenarioPlan, setupScenario, gatewayRequest, trustedOptions, loadArtifact };
}

module.exports = { createGatewayFixtureSupport };
