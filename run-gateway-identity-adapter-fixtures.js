#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const tls = require("tls");
const { once } = require("events");
const { spawnSync } = require("child_process");
const {
  activeLease,
  authorizeDispatchPolicy,
  inputDigest,
  issueLease
} = require("./dispatch-runtime-controller");
const {
  createGatewayPrincipalEvidence,
  issueGatewayIdentityChallenge,
  observeMutualTlsSocket,
  persistGatewayIdentityPolicy,
  verifyGatewayPrincipalEvidence
} = require("./gateway-identity-adapter");
const {
  gatewayEvidenceDigest,
  verifyGatewayIdentityBundle
} = require("./gateway-identity-evidence");
const {
  admitGatewayRequest,
  beginGatewayExecution,
  bindingDigests,
  commitGatewayExecution
} = require("./protected-tool-gateway");
const { certificateSha256 } = require("./verifier-identity-evidence");
const {
  keyPair,
  makeCa,
  makeLeaf
} = require("./verifier-identity-fixture-support");
const { openWave } = require("./skill-mission-controller");

const ROOT = __dirname;
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-gateway-identity-"));
const artifactRoot = path.join(temporaryRoot, "artifacts");
const certificateRoot = path.join(temporaryRoot, "certificates");
const toolInput = { command: "git status --short" };
fs.mkdirSync(certificateRoot, { recursive: true });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function iso(milliseconds) {
  return new Date(milliseconds).toISOString();
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function runGit(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "git failed").trim());
  }
  return result.stdout.trim();
}

function initRepository() {
  const repository = path.join(temporaryRoot, "repository");
  fs.mkdirSync(repository, { recursive: true });
  runGit(repository, ["init", "-q"]);
  runGit(repository, ["config", "user.email", "fixtures@example.com"]);
  runGit(repository, ["config", "user.name", "Gateway Identity Fixture"]);
  fs.writeFileSync(path.join(repository, "README.md"), "gateway identity fixture\n");
  runGit(repository, ["add", "README.md"]);
  runGit(repository, ["commit", "-qm", "initial"]);
  return repository;
}

function expectThrow(fn, pattern) {
  let caught;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert(caught, "expected operation to throw");
  if (pattern) assert(pattern.test(caught.message), caught.message);
}

function policyDraft(plan, baseTime) {
  return {
    schema_version: "0.1",
    type: "DispatchToolPolicy",
    id: "DTP-GATEWAY-IDENTITY-W1",
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    agent_id: "plans-agent",
    provider: "codex",
    default_decision: "deny",
    tool_rules: [{
      rule_id: "DTR-GATEWAY-IDENTITY-EXACT",
      mission_action: "Run deterministic validation.",
      tool_name: "Bash",
      operation_class: "process_execute",
      input_match: {
        mode: "exact_sha256",
        allowed_sha256: [inputDigest(toolInput)]
      },
      max_uses: 4
    }],
    max_total_admissions: 4,
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
    approved_at: iso(baseTime - 60000),
    valid_until: iso(baseTime + 3600000)
  };
}

function setupDispatch(repository, baseTime) {
  const plan = readJson("sample-payloads/valid-mission-wave-plan.json");
  plan.id = "MWP-GATEWAY-IDENTITY-W1";
  plan.mission_id = "MIS-GATEWAY-IDENTITY";
  plan.agents = plan.agents.filter(agent => agent.agent_id === "plans-agent");
  const draft = policyDraft(plan, baseTime);
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
    now: iso(baseTime)
  });
  authorizeDispatchPolicy({
    repository,
    artifactRoot,
    now: iso(baseTime)
  }, draft);
  const issued = issueLease({
    repository,
    artifactRoot,
    now: iso(baseTime + 1000)
  }, draft.id, {
    sessionId: "session-gateway-identity",
    providerAgentId: "main"
  });
  const identity = {
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    agentId: "plans-agent",
    provider: "codex",
    sessionId: issued.lease.session_binding.session_id,
    providerAgentId: issued.lease.session_binding.provider_agent_id
  };
  return { draft, identity, issued, plan };
}

function gatewayIdentityPolicy(setup, selected, materials, adapterKey, baseTime) {
  return {
    schema_version: "0.1",
    type: "GatewayIdentityPolicy",
    id: "GIP-GATEWAY-IDENTITY-W1",
    gateway: {
      gateway_id: "cannae-reference-gateway",
      instance_id: "gateway-identity-fixture-01",
      audience: "cannae-protected-tools",
      deployment_sha256: digest("gateway-identity-deployment"),
      configuration_sha256: digest("gateway-identity-configuration"),
      assurance_level: "authenticated_reference",
      exclusive_path_verified: false
    },
    repository_binding: clone(selected.leaseRecord.payload.repository_binding),
    adapter_profile: {
      adapter_id: "cannae-gateway-identity-adapter",
      adapter_version: "0.1.0",
      adapter_sha256: digest("gateway-identity-adapter"),
      runtime_sha256: digest(process.version),
      configuration_sha256: digest("gateway-identity-adapter-configuration"),
      signing_key_id: adapterKey.keyId,
      signing_algorithm: "ed25519",
      signing_public_key_pem: adapterKey.publicKey
    },
    transport_profile: {
      transport: "mtls_spiffe_x509",
      minimum_tls_version: "TLSv1.3",
      maximum_tls_version: "TLSv1.3",
      require_client_certificate: true,
      allow_early_data: false,
      tls_exporter_label: "EXPORTER-Channel-Binding",
      tls_exporter_length: 32,
      server_certificate_sha256: certificateSha256(materials.server.certificate)
    },
    trusted_x509_roots: [{
      id: "ROOT-GATEWAY-IDENTITY",
      trust_domain: "agents.controls.test",
      certificate_pem: materials.ca.certificate,
      certificate_sha256: certificateSha256(materials.ca.certificate),
      valid_until: iso(
        Math.min(
          new crypto.X509Certificate(materials.ca.certificate).validToDate.getTime(),
          baseTime + 3600000
        )
      )
    }],
    principals: [{
      id: "PRINCIPAL-plans-agent",
      agent_id: "plans-agent",
      provider: "codex",
      spiffe_id: "spiffe://agents.controls.test/mission/plans-agent",
      trust_root_id: "ROOT-GATEWAY-IDENTITY"
    }],
    revocations: {
      principal_ids: [],
      certificate_sha256: []
    },
    challenge_ttl_seconds: 300,
    evidence_ttl_seconds: 300,
    valid_from: iso(baseTime - 60000),
    expires_at: iso(baseTime + 3600000),
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      production_execution_authorized: false,
      release_authorized: false
    }
  };
}

async function establishMutualTls(materials, clientMaterial = materials.client) {
  const server = tls.createServer({
    key: materials.server.key,
    cert: materials.server.certificate,
    ca: materials.ca.certificate,
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3"
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const serverSocketPromise = once(server, "secureConnection").then(([socket]) => socket);
  const address = server.address();
  const client = tls.connect({
    host: "127.0.0.1",
    port: address.port,
    key: clientMaterial.key,
    cert: clientMaterial.certificate,
    ca: materials.ca.certificate,
    servername: "localhost",
    checkServerIdentity: () => undefined,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3"
  });
  await once(client, "secureConnect");
  const serverSocket = await serverSocketPromise;
  return { client, server, serverSocket };
}

function challengeDescriptor(setup, policyRef, transactionId) {
  return {
    identityPolicyRef: clone(policyRef),
    transactionId,
    missionId: setup.plan.mission_id,
    waveId: setup.plan.wave_id,
    agentId: setup.identity.agentId,
    provider: setup.identity.provider,
    sessionId: setup.identity.sessionId,
    providerAgentId: setup.identity.providerAgentId
  };
}

function evidenceDescriptor(setup, policyRef, challengeRef, transactionId, tlsSocket) {
  return {
    ...challengeDescriptor(setup, policyRef, transactionId),
    identityChallengeRef: clone(challengeRef),
    tlsSocket
  };
}

function gatewayRequest(setup, selected, identityResult, transactionId, baseTime) {
  return {
    schema_version: "0.2",
    type: "ToolGatewayRequest",
    id: "TGR-GATEWAY-IDENTITY-001",
    transaction_id: transactionId,
    mission_id: setup.plan.mission_id,
    wave_id: setup.plan.wave_id,
    agent_id: setup.identity.agentId,
    provider: setup.identity.provider,
    gateway: clone(identityResult.gateway),
    authenticated_principal: clone(identityResult.authenticated_principal),
    identity_policy_ref: clone(identityResult.identity_policy_ref),
    identity_challenge_ref: clone(identityResult.identity_challenge_ref),
    principal_evidence_ref: clone(identityResult.evidence_ref),
    lease_ref: clone(selected.leaseRecord.ref),
    tool_policy_ref: clone(selected.leaseRecord.payload.tool_policy_ref),
    checkpoint_ref: clone(selected.checkpointRecord.ref),
    repository_binding: clone(selected.leaseRecord.payload.repository_binding),
    expected_repository_state: clone(selected.checkpointRecord.payload.repository_state),
    tool_call: {
      tool_use_id: "gateway-identity-tool-001",
      tool_name: "Bash",
      operation_class: "process_execute",
      tool_input_sha256: inputDigest(toolInput)
    },
    idempotency_key: digest("gateway-identity-idempotency-001"),
    raw_input_retained: false,
    requested_at: iso(baseTime + 4000),
    valid_until: identityResult.authenticated_principal.expires_at,
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    }
  };
}

function loadArtifact(ref) {
  return JSON.parse(fs.readFileSync(path.join(artifactRoot, ref.relative_path), "utf8"));
}

function fixtureExecutor() {
  const noneRef = {
    artifact_id: "none",
    relative_path: "none",
    sha256: "none"
  };
  return {
    adapter_id: "gateway-identity-fixture-executor",
    adapter_version: "0.1.0",
    adapter_sha256: digest("gateway-identity-fixture-executor"),
    runtime_sha256: digest(process.version),
    sandbox_profile_sha256: digest("fixture-sandbox"),
    network_policy_sha256: digest("fixture-network-policy"),
    execution_mode: "fixture",
    executor_policy_ref: clone(noneRef),
    execution_envelope_ref: clone(noneRef),
    execution_observation_ref: clone(noneRef)
  };
}

async function main() {
  let baseTime = Date.now();
  for (const wrapper of [
    "codex-skills/controls-doctrine-operator/scripts/operate_gateway_identity.js",
    ".claude/skills/controls-doctrine-operator/scripts/operate_gateway_identity.js"
  ]) {
    assert.strictEqual(require(path.join(ROOT, wrapper)).findRuntimeRoot(), ROOT);
  }
  const repository = initRepository();
  const setup = setupDispatch(repository, baseTime);
  const selected = activeLease({
    repository,
    artifactRoot,
    now: iso(baseTime + 1500)
  }, setup.identity);
  assert.strictEqual(selected.code, "LEASE_ACTIVE");

  const materials = {
    ca: makeCa(certificateRoot, "gateway-identity-ca"),
    server: null,
    client: null,
    foreign: null
  };
  materials.server = makeLeaf(
    certificateRoot,
    materials.ca,
    "gateway-server",
    ["spiffe://gateway.controls.test/instance/reference"]
  );
  materials.client = makeLeaf(
    certificateRoot,
    materials.ca,
    "plans-agent",
    ["spiffe://agents.controls.test/mission/plans-agent"]
  );
  materials.foreign = makeLeaf(
    certificateRoot,
    materials.ca,
    "foreign-agent",
    ["spiffe://agents.controls.test/mission/foreign-agent"]
  );
  baseTime = Math.max(
    baseTime,
    ...[materials.ca, materials.server, materials.client, materials.foreign]
      .map(item =>
        new crypto.X509Certificate(item.certificate).validFromDate.getTime() +
        1000)
  );
  const adapterKey = keyPair();
  const policy = gatewayIdentityPolicy(setup, selected, materials, adapterKey, baseTime);
  const persistedPolicy = persistGatewayIdentityPolicy({
    repository,
    artifactRoot,
    missionId: setup.plan.mission_id,
    waveId: setup.plan.wave_id
  }, policy);

  const transactionId = "GTX-GATEWAY-IDENTITY-001";
  const challenge = issueGatewayIdentityChallenge({
    repository,
    artifactRoot,
    adapterPrivateKeyPem: adapterKey.privateKey,
    now: iso(baseTime + 2000)
  }, challengeDescriptor(setup, persistedPolicy.policy_ref, transactionId));

  const connection = await establishMutualTls(materials);
  try {
    const serverExporter = connection.serverSocket.exportKeyingMaterial(
      32,
      "EXPORTER-Channel-Binding",
      Buffer.alloc(0)
    );
    const clientExporter = connection.client.exportKeyingMaterial(
      32,
      "EXPORTER-Channel-Binding",
      Buffer.alloc(0)
    );
    assert(serverExporter.equals(clientExporter), "TLS exporter differs across the authenticated channel");
    const observation = observeMutualTlsSocket(connection.serverSocket, policy);
    assert.strictEqual(observation.tls_version, "TLSv1.3");
    assert.strictEqual(observation.spiffe_id, policy.principals[0].spiffe_id);
    assert.strictEqual(observation.tls_exporter_sha256, digest(serverExporter));

    const identityResult = createGatewayPrincipalEvidence({
      repository,
      artifactRoot,
      adapterPrivateKeyPem: adapterKey.privateKey,
      now: iso(baseTime + 3000)
    }, evidenceDescriptor(
      setup,
      persistedPolicy.policy_ref,
      challenge.challenge_ref,
      transactionId,
      connection.serverSocket
    ));
    assert.strictEqual(identityResult.verification.valid, true);

    expectThrow(
      () => createGatewayPrincipalEvidence({
        repository,
        artifactRoot,
        adapterPrivateKeyPem: adapterKey.privateKey,
        now: iso(baseTime + 3500)
      }, evidenceDescriptor(
        setup,
        persistedPolicy.policy_ref,
        challenge.challenge_ref,
        transactionId,
        connection.serverSocket
      )),
      /already been consumed/
    );

    const request = gatewayRequest(
      setup,
      selected,
      identityResult,
      transactionId,
      baseTime
    );
    const directVerification = verifyGatewayPrincipalEvidence({
      repository,
      artifactRoot,
      request,
      evaluatedAt: iso(baseTime + 4000)
    });
    assert.strictEqual(directVerification.valid, true, directVerification.codes.join(", "));

    const trusted = {
      repository,
      artifactRoot,
      gatewayBindingSha256: bindingDigests(request).gateway
    };
    const authorized = admitGatewayRequest({
      ...trusted,
      now: iso(baseTime + 4000)
    }, request, toolInput);
    assert.strictEqual(
      authorized.state,
      "authorized",
      `gateway denial: ${authorized.reason_codes.join(", ")}`
    );
    assert.strictEqual(authorized.production_execution_authorized, false);

    const begun = beginGatewayExecution({
      ...trusted,
      now: iso(baseTime + 5000)
    }, transactionId);
    assert.strictEqual(begun.state, "executing");
    const committed = commitGatewayExecution({
      ...trusted,
      now: iso(baseTime + 7000)
    }, transactionId, {
      executionEventRef: begun.execution_event_ref,
      toolInput,
      result: { stdout: "", stderr: "" },
      executor: fixtureExecutor(),
      status: "succeeded",
      startedAt: iso(baseTime + 5000),
      finishedAt: iso(baseTime + 6000),
      exitCode: 0
    });
    assert.strictEqual(committed.state, "committed");
    const decision = loadArtifact(committed.decision_ref);
    const receipt = loadArtifact(committed.receipt_ref);
    for (const field of [
      "identity_policy_ref",
      "identity_challenge_ref",
      "principal_evidence_ref"
    ]) {
      assert.deepStrictEqual(decision[field], request[field]);
      assert.deepStrictEqual(receipt[field], request[field]);
    }

    const stale = verifyGatewayPrincipalEvidence({
      repository,
      artifactRoot,
      request,
      evaluatedAt: identityResult.evidence.expires_at
    });
    assert.strictEqual(stale.valid, false);
    assert(stale.codes.includes("GATEWAY_IDENTITY_CHALLENGE_NOT_ACTIVE"));
    assert(stale.codes.includes("GATEWAY_IDENTITY_EVIDENCE_NOT_ACTIVE"));

    const replay = clone(request);
    replay.transaction_id = "GTX-GATEWAY-IDENTITY-REPLAY";
    const replayResult = verifyGatewayPrincipalEvidence({
      repository,
      artifactRoot,
      request: replay,
      evaluatedAt: iso(baseTime + 8000)
    });
    assert.strictEqual(replayResult.valid, false);
    assert(replayResult.codes.includes("GATEWAY_IDENTITY_REQUEST_REPLAY_DETECTED"));

    const tamperedEvidence = clone(identityResult.evidence);
    tamperedEvidence.transport.tls_exporter_sha256 = digest("substituted-exporter");
    tamperedEvidence.evidence_sha256 = gatewayEvidenceDigest(tamperedEvidence);
    const tamperedResult = verifyGatewayIdentityBundle({
      policy,
      challenge: challenge.challenge,
      evidence: tamperedEvidence,
      request,
      evaluatedAt: iso(baseTime + 8000)
    });
    assert.strictEqual(tamperedResult.valid, false);
    assert(tamperedResult.codes.includes("GATEWAY_IDENTITY_EVIDENCE_SIGNATURE_INVALID"));
    assert(tamperedResult.codes.includes("GATEWAY_IDENTITY_PRINCIPAL_PROJECTION_MISMATCH"));

    const revokedPolicy = clone(policy);
    revokedPolicy.revocations.principal_ids.push("PRINCIPAL-plans-agent");
    const revokedResult = verifyGatewayIdentityBundle({
      policy: revokedPolicy,
      challenge: challenge.challenge,
      evidence: identityResult.evidence,
      request,
      evaluatedAt: iso(baseTime + 8000)
    });
    assert.strictEqual(revokedResult.valid, false);
    assert(revokedResult.codes.includes("GATEWAY_IDENTITY_PRINCIPAL_REVOKED"));

    const foreignTransaction = "GTX-GATEWAY-IDENTITY-FOREIGN";
    const foreignChallenge = issueGatewayIdentityChallenge({
      repository,
      artifactRoot,
      adapterPrivateKeyPem: adapterKey.privateKey,
      now: iso(baseTime + 9000)
    }, challengeDescriptor(setup, persistedPolicy.policy_ref, foreignTransaction));
    const foreignConnection = await establishMutualTls(materials, materials.foreign);
    try {
      expectThrow(
        () => createGatewayPrincipalEvidence({
          repository,
          artifactRoot,
          adapterPrivateKeyPem: adapterKey.privateKey,
          now: iso(baseTime + 10000)
        }, evidenceDescriptor(
          setup,
          persistedPolicy.policy_ref,
          foreignChallenge.challenge_ref,
          foreignTransaction,
          foreignConnection.serverSocket
        )),
        /Observed SPIFFE principal is not authorized/
      );
      expectThrow(
        () => createGatewayPrincipalEvidence({
          repository,
          artifactRoot,
          adapterPrivateKeyPem: adapterKey.privateKey,
          now: iso(baseTime + 10000)
        }, {
          ...challengeDescriptor(setup, persistedPolicy.policy_ref, foreignTransaction),
          identityChallengeRef: clone(foreignChallenge.challenge_ref),
          transportObservation: clone(observation)
        }),
        /live server-side TLSSocket/
      );
    } finally {
      foreignConnection.client.destroy();
      foreignConnection.serverSocket.destroy();
      await new Promise(resolve => foreignConnection.server.close(resolve));
    }
  } finally {
    connection.client.destroy();
    connection.serverSocket.destroy();
    await new Promise(resolve => connection.server.close(resolve));
  }

  console.log("PASS actual TLS 1.3 mTLS identity evidence authorizes one gateway transaction");
  console.log("PASS stale, replayed, revoked, tampered, and SPIFFE-substituted evidence is rejected");
  console.log("PASS Codex and Claude identity wrappers resolve the same runtime");
  console.log("Gateway identity adapter fixtures: 3/3 passed");
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
