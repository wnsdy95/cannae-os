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
  persistGatewayIdentityPolicy
} = require("./gateway-identity-adapter");
const {
  admitGatewayRequest,
  bindingDigests,
  recoverGatewayTransaction
} = require("./protected-tool-gateway");
const {
  issueProductionSandboxAdmission,
  persistProductionSandboxEvidence,
  persistProductionSandboxPolicy
} = require("./production-sandbox-admission-adapter");
const {
  createProductionSandboxFixtureBuilders
} = require("./production-sandbox-fixture-support");
const { objectDigest } = require("./production-sandbox-admission");
const {
  resolveRepository,
  writeRepositoryArtifact
} = require("./repository-artifact-store");
const { certificateSha256 } = require("./verifier-identity-evidence");
const {
  keyPair,
  makeCa,
  makeLeaf
} = require("./verifier-identity-fixture-support");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { openWave } = require("./skill-mission-controller");

const ROOT = __dirname;
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "cannae-production-gateway-")
);
const artifactRoot = path.join(temporaryRoot, "artifacts");
const certificateRoot = path.join(temporaryRoot, "certificates");
const missionId = "MIS-PRODUCTION-GATEWAY";
const waveId = "W1";
let baseTime = Date.now();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function at(offsetMs) {
  return new Date(baseTime + offsetMs).toISOString();
}

function runGit(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "git failed").trim()
    );
  }
  return result.stdout.trim();
}

function initRepository() {
  const repository = path.join(temporaryRoot, "repository");
  fs.mkdirSync(repository, { recursive: true });
  runGit(repository, ["init", "-q"]);
  runGit(repository, ["config", "user.email", "fixtures@example.com"]);
  runGit(repository, ["config", "user.name", "Production Gateway Fixture"]);
  fs.writeFileSync(
    path.join(repository, "README.md"),
    "production gateway fixture\n"
  );
  runGit(repository, ["add", "README.md"]);
  runGit(repository, ["commit", "-qm", "initial"]);
  return repository;
}

function refFromWrite(write, artifactId) {
  return {
    artifact_id: artifactId,
    relative_path: write.relative_path,
    sha256: write.sha256
  };
}

function writeOciPolicy(repository, repositoryBinding, gateway) {
  const policy = JSON.parse(fs.readFileSync(
    path.join(
      ROOT,
      "sample-payloads/valid-oci-linux-sandbox-policy.json"
    ),
    "utf8"
  ));
  policy.id = "OLSP-PRODUCTION-GATEWAY";
  policy.repository_binding = clone(repositoryBinding);
  policy.gateway_binding_sha256 = objectDigest(gateway);
  policy.valid_from = at(-60000);
  policy.expires_at = at(3600000);
  const validation = validatePayload(policy, "oci-linux-sandbox-policy");
  assert.strictEqual(
    validation.valid,
    true,
    JSON.stringify(validation, null, 2)
  );
  const write = writeRepositoryArtifact({
    repositoryPath: repository,
    artifactRoot,
    missionId,
    waveId,
    kind: "oci-linux-sandbox-policies",
    artifactId: policy.id,
    payload: policy,
    createdAt: policy.valid_from
  });
  return {
    payload: policy,
    ref: refFromWrite(write, policy.id)
  };
}

function policyDraft(plan, toolInput) {
  return {
    schema_version: "0.1",
    type: "DispatchToolPolicy",
    id: "DTP-PRODUCTION-GATEWAY-W1",
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    agent_id: "plans-agent",
    provider: "codex",
    default_decision: "deny",
    tool_rules: [{
      rule_id: "DTR-PRODUCTION-GATEWAY-EXACT",
      mission_action: "Run deterministic validation.",
      tool_name: "Bash",
      operation_class: "process_execute",
      input_match: {
        mode: "exact_sha256",
        allowed_sha256: [inputDigest(toolInput)]
      },
      max_uses: 3
    }],
    max_total_admissions: 3,
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
    approved_at: at(-30000),
    valid_until: at(3600000)
  };
}

function setupDispatch(repository, toolInput) {
  const plan = JSON.parse(fs.readFileSync(
    path.join(ROOT, "sample-payloads/valid-mission-wave-plan.json"),
    "utf8"
  ));
  plan.id = "MWP-PRODUCTION-GATEWAY-W1";
  plan.mission_id = missionId;
  plan.wave_id = waveId;
  plan.created_at = at(-60000);
  plan.valid_until = at(3600000);
  plan.agents = plan.agents.filter(agent => agent.agent_id === "plans-agent");
  const draft = policyDraft(plan, toolInput);
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
    now: at(0)
  });
  authorizeDispatchPolicy({
    repository,
    artifactRoot,
    now: at(0)
  }, draft);
  const issued = issueLease({
    repository,
    artifactRoot,
    now: at(1000)
  }, draft.id, {
    sessionId: "session-production-gateway",
    providerAgentId: "main"
  });
  return {
    plan,
    identity: {
      missionId,
      waveId,
      agentId: "plans-agent",
      provider: "codex",
      sessionId: issued.lease.session_binding.session_id,
      providerAgentId: issued.lease.session_binding.provider_agent_id
    }
  };
}

function gatewayIdentityPolicy(
  repositoryBinding,
  gateway,
  materials,
  adapterKey
) {
  return {
    schema_version: "0.2",
    type: "GatewayIdentityPolicy",
    id: "GIP-PRODUCTION-GATEWAY-W1",
    gateway: clone(gateway),
    repository_binding: clone(repositoryBinding),
    adapter_profile: {
      adapter_id: "cannae-gateway-identity-adapter",
      adapter_version: "0.1.0",
      adapter_sha256: digest("gateway-identity-adapter"),
      runtime_sha256: digest(process.version),
      configuration_sha256:
        digest("production-gateway-identity-configuration"),
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
      server_certificate_sha256:
        certificateSha256(materials.server.certificate)
    },
    trusted_x509_roots: [{
      id: "ROOT-PRODUCTION-GATEWAY",
      trust_domain: "agents.controls.test",
      certificate_pem: materials.ca.certificate,
      certificate_sha256: certificateSha256(materials.ca.certificate),
      valid_until: at(3600000)
    }],
    principals: [{
      id: "PRINCIPAL-plans-agent",
      agent_id: "plans-agent",
      provider: "codex",
      spiffe_id: "spiffe://agents.controls.test/mission/plans-agent",
      trust_root_id: "ROOT-PRODUCTION-GATEWAY"
    }],
    revocations: {
      principal_ids: [],
      certificate_sha256: []
    },
    challenge_ttl_seconds: 300,
    evidence_ttl_seconds: 300,
    valid_from: at(-60000),
    expires_at: at(3600000),
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      production_execution_authorized: false,
      release_authorized: false
    }
  };
}

async function establishMutualTls(materials) {
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
  const serverSocketPromise = once(server, "secureConnection")
    .then(([socket]) => socket);
  const address = server.address();
  const client = tls.connect({
    host: "127.0.0.1",
    port: address.port,
    key: materials.client.key,
    cert: materials.client.certificate,
    ca: materials.ca.certificate,
    servername: "localhost",
    checkServerIdentity: () => undefined,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3"
  });
  await once(client, "secureConnect");
  return {
    client,
    server,
    serverSocket: await serverSocketPromise
  };
}

function identityResult(
  repository,
  setup,
  policyRef,
  adapterKey,
  tlsSocket,
  transactionId,
  offsetMs
) {
  const descriptor = {
    identityPolicyRef: clone(policyRef),
    transactionId,
    missionId,
    waveId,
    agentId: setup.identity.agentId,
    provider: setup.identity.provider,
    sessionId: setup.identity.sessionId,
    providerAgentId: setup.identity.providerAgentId
  };
  const challenge = issueGatewayIdentityChallenge({
    repository,
    artifactRoot,
    adapterPrivateKeyPem: adapterKey.privateKey,
    now: at(offsetMs)
  }, descriptor);
  return createGatewayPrincipalEvidence({
    repository,
    artifactRoot,
    adapterPrivateKeyPem: adapterKey.privateKey,
    now: at(offsetMs + 1000)
  }, {
    ...descriptor,
    identityChallengeRef: clone(challenge.challenge_ref),
    tlsSocket
  });
}

function gatewayRequest(
  setup,
  selected,
  identity,
  productionAdmissionRef,
  toolInput,
  transactionId,
  suffix,
  offsetMs
) {
  return {
    schema_version: "0.3",
    type: "ToolGatewayRequest",
    id: `TGR-PRODUCTION-GATEWAY-${suffix}`,
    transaction_id: transactionId,
    mission_id: missionId,
    wave_id: waveId,
    agent_id: setup.identity.agentId,
    provider: setup.identity.provider,
    gateway: clone(identity.gateway),
    authenticated_principal: clone(identity.authenticated_principal),
    identity_policy_ref: clone(identity.identity_policy_ref),
    identity_challenge_ref: clone(identity.identity_challenge_ref),
    principal_evidence_ref: clone(identity.evidence_ref),
    production_sandbox_admission_ref: clone(productionAdmissionRef),
    lease_ref: clone(selected.leaseRecord.ref),
    tool_policy_ref: clone(selected.leaseRecord.payload.tool_policy_ref),
    checkpoint_ref: clone(selected.checkpointRecord.ref),
    repository_binding: clone(selected.leaseRecord.payload.repository_binding),
    expected_repository_state:
      clone(selected.checkpointRecord.payload.repository_state),
    tool_call: {
      tool_use_id: `production-gateway-tool-${suffix}`,
      tool_name: "Bash",
      operation_class: "process_execute",
      execution_mode: "oci_linux_sandbox_reference",
      tool_input_sha256: inputDigest(toolInput)
    },
    idempotency_key: digest(`production-gateway-idempotency-${suffix}`),
    raw_input_retained: false,
    requested_at: at(offsetMs),
    valid_until: identity.authenticated_principal.expires_at,
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    }
  };
}

function productionCoordinator(commonDeployment, handleOverrides = {}) {
  let manifestRevision = 1000;
  let fencingToken = 2000;
  let active = null;
  return {
    adapterSha256: commonDeployment.coordination.adapter_sha256,
    configurationSha256:
      commonDeployment.coordination.configuration_sha256,
    acquire(input) {
      if (active) throw new Error("coordinator already has an active holder");
      active = {
        backend: "external_linearizable",
        adapter_sha256: this.adapterSha256,
        configuration_sha256: this.configurationSha256,
        repository_key: input.repository_key,
        repository_identity_fingerprint:
          input.repository_identity_fingerprint,
        transaction_id: input.transaction_id,
        idempotency_key: input.idempotency_key,
        production_sandbox_admission_sha256:
          input.production_sandbox_admission_ref.sha256,
        manifest_revision: ++manifestRevision,
        fencing_token: ++fencingToken,
        expires_at: at(180000),
        ...handleOverrides
      };
      return clone(active);
    },
    renew(handle) {
      assert(active, "coordinator lease is not active");
      assert.strictEqual(handle.fencing_token, active.fencing_token);
      active.manifest_revision = ++manifestRevision;
      active.expires_at = at(180000);
      return clone(active);
    },
    release(handle) {
      assert(active, "coordinator lease is not active");
      assert.strictEqual(handle.fencing_token, active.fencing_token);
      active = null;
    }
  };
}

function loadArtifact(ref) {
  return JSON.parse(fs.readFileSync(
    path.join(artifactRoot, ref.relative_path),
    "utf8"
  ));
}

async function main() {
  for (const wrapper of [
    "codex-skills/controls-doctrine-operator/scripts/operate_production_sandbox.js",
    ".claude/skills/controls-doctrine-operator/scripts/operate_production_sandbox.js"
  ]) {
    assert.strictEqual(require(path.join(ROOT, wrapper)).findRuntimeRoot(), ROOT);
  }

  fs.mkdirSync(certificateRoot, { recursive: true });
  const repository = initRepository();
  const materials = {
    ca: makeCa(certificateRoot, "production-gateway-ca"),
    server: null,
    client: null
  };
  materials.server = makeLeaf(
    certificateRoot,
    materials.ca,
    "production-gateway-server",
    ["spiffe://gateway.controls.test/instance/production"]
  );
  materials.client = makeLeaf(
    certificateRoot,
    materials.ca,
    "plans-agent",
    ["spiffe://agents.controls.test/mission/plans-agent"]
  );
  baseTime = Math.max(
    baseTime,
    ...[materials.ca, materials.server, materials.client].map(item =>
      new crypto.X509Certificate(item.certificate)
        .validFromDate.getTime() + 1000)
  );

  const repositoryRecord = resolveRepository(repository);
  const repositoryBinding = {
    repository_key: repositoryRecord.key,
    identity_fingerprint: repositoryRecord.identity_fingerprint
  };
  const gateway = {
    gateway_id: "cannae-managed-gateway",
    instance_id: "production-gateway-fixture-001",
    audience: "cannae-protected-tools",
    deployment_sha256: digest("production-gateway-deployment"),
    configuration_sha256: digest("production-gateway-configuration"),
    assurance_level: "managed_exclusive",
    exclusive_path_verified: true
  };
  const ociPolicy = writeOciPolicy(
    repository,
    repositoryBinding,
    gateway
  );
  const toolInput = {
    schema_version: "0.1",
    type: "OciSandboxToolInput",
    sandbox_policy_ref: clone(ociPolicy.ref),
    rule_id: ociPolicy.payload.rules[0].rule_id
  };
  const setup = setupDispatch(repository, toolInput);
  const selected = activeLease({
    repository,
    artifactRoot,
    now: at(1500)
  }, setup.identity);
  assert.strictEqual(selected.code, "LEASE_ACTIVE");

  const identityAdapterKey = keyPair();
  const identityPolicy = gatewayIdentityPolicy(
    repositoryBinding,
    gateway,
    materials,
    identityAdapterKey
  );
  const persistedIdentityPolicy = persistGatewayIdentityPolicy({
    repository,
    artifactRoot,
    missionId,
    waveId
  }, identityPolicy);

  const builders = createProductionSandboxFixtureBuilders(at);
  const admissionKey = builders.keyPair();
  const appraiserKeyA = builders.keyPair();
  const appraiserKeyB = builders.keyPair();
  const appraiserA = builders.appraiser(
    "APPRAISER-PRODUCTION-GATEWAY-A",
    appraiserKeyA,
    "production-gateway-a"
  );
  const appraiserB = builders.appraiser(
    "APPRAISER-PRODUCTION-GATEWAY-B",
    appraiserKeyB,
    "production-gateway-b"
  );
  const productionPolicy = builders.productionPolicy(
    repositoryBinding,
    gateway,
    ociPolicy.ref,
    admissionKey,
    [appraiserA, appraiserB]
  );
  productionPolicy.id = "PSP-PRODUCTION-GATEWAY";
  const persistedProductionPolicy = persistProductionSandboxPolicy({
    repository,
    artifactRoot,
    missionId,
    waveId
  }, productionPolicy);
  const commonDeployment = builders.deployment(gateway);
  const evidenceA = builders.evidence(
    productionPolicy,
    persistedProductionPolicy.policy_ref,
    appraiserA,
    appraiserKeyA,
    commonDeployment,
    "GATEWAY-A"
  );
  const evidenceB = builders.evidence(
    productionPolicy,
    persistedProductionPolicy.policy_ref,
    appraiserB,
    appraiserKeyB,
    commonDeployment,
    "GATEWAY-B"
  );
  const persistedEvidenceA = persistProductionSandboxEvidence({
    repository,
    artifactRoot,
    missionId,
    waveId,
    now: at(3000)
  }, evidenceA);
  const persistedEvidenceB = persistProductionSandboxEvidence({
    repository,
    artifactRoot,
    missionId,
    waveId,
    now: at(3000)
  }, evidenceB);
  const issuedAdmission = issueProductionSandboxAdmission({
    repository,
    artifactRoot,
    missionId,
    waveId,
    now: at(4000),
    admissionPrivateKeyPem: admissionKey.privateKey
  }, {
    policyRef: persistedProductionPolicy.policy_ref,
    evidenceRefs: [
      persistedEvidenceA.evidence_ref,
      persistedEvidenceB.evidence_ref
    ],
    admissionId: "PSA-PRODUCTION-GATEWAY"
  });

  const connection = await establishMutualTls(materials);
  try {
    const deniedIdentity = identityResult(
      repository,
      setup,
      persistedIdentityPolicy.policy_ref,
      identityAdapterKey,
      connection.serverSocket,
      "GTX-PRODUCTION-GATEWAY-DENY",
      5000
    );
    const deniedRequest = gatewayRequest(
      setup,
      selected,
      deniedIdentity,
      issuedAdmission.admission_ref,
      toolInput,
      "GTX-PRODUCTION-GATEWAY-DENY",
      "DENY",
      7000
    );
    const denied = admitGatewayRequest({
      repository,
      artifactRoot,
      gatewayBindingSha256: bindingDigests(deniedRequest).gateway,
      now: at(7000)
    }, deniedRequest, toolInput);
    assert.strictEqual(denied.state, "denied");
    assert.strictEqual(denied.production_execution_authorized, false);
    assert(
      denied.reason_codes.includes(
        "PRODUCTION_SANDBOX_COORDINATOR_UNAVAILABLE"
      )
    );

    const mismatchedIdentity = identityResult(
      repository,
      setup,
      persistedIdentityPolicy.policy_ref,
      identityAdapterKey,
      connection.serverSocket,
      "GTX-PRODUCTION-GATEWAY-COORDINATOR-MISMATCH",
      7500
    );
    const afterDenied = activeLease({
      repository,
      artifactRoot,
      now: at(9000)
    }, setup.identity);
    assert.strictEqual(afterDenied.code, "LEASE_ACTIVE");
    const mismatchedRequest = gatewayRequest(
      setup,
      afterDenied,
      mismatchedIdentity,
      issuedAdmission.admission_ref,
      toolInput,
      "GTX-PRODUCTION-GATEWAY-COORDINATOR-MISMATCH",
      "COORDINATOR-MISMATCH",
      9000
    );
    const mismatchedCoordinator = productionCoordinator(commonDeployment, {
      repository_key: "foreign-repository"
    });
    const mismatched = admitGatewayRequest({
      repository,
      artifactRoot,
      gatewayBindingSha256: bindingDigests(mismatchedRequest).gateway,
      productionCoordinator: mismatchedCoordinator,
      now: at(9000)
    }, mismatchedRequest, toolInput);
    assert.strictEqual(mismatched.state, "denied");
    assert.strictEqual(mismatched.production_execution_authorized, false);
    assert(
      mismatched.reason_codes.includes(
        "PRODUCTION_SANDBOX_COORDINATOR_BINDING_INVALID"
      )
    );

    const authorizedIdentity = identityResult(
      repository,
      setup,
      persistedIdentityPolicy.policy_ref,
      identityAdapterKey,
      connection.serverSocket,
      "GTX-PRODUCTION-GATEWAY-ALLOW",
      10000
    );
    const current = activeLease({
      repository,
      artifactRoot,
      now: at(12000)
    }, setup.identity);
    assert.strictEqual(current.code, "LEASE_ACTIVE");
    const authorizedRequest = gatewayRequest(
      setup,
      current,
      authorizedIdentity,
      issuedAdmission.admission_ref,
      toolInput,
      "GTX-PRODUCTION-GATEWAY-ALLOW",
      "ALLOW",
      12000
    );
    const coordinator = productionCoordinator(commonDeployment);
    const trusted = {
      repository,
      artifactRoot,
      gatewayBindingSha256: bindingDigests(authorizedRequest).gateway,
      productionCoordinator: coordinator
    };
    const authorized = admitGatewayRequest({
      ...trusted,
      now: at(12000)
    }, authorizedRequest, toolInput);
    assert.strictEqual(
      authorized.state,
      "authorized",
      authorized.reason_codes.join(", ")
    );
    assert.strictEqual(authorized.production_execution_authorized, true);
    assert.strictEqual(authorized.production_deployment_verified, false);
    assert.strictEqual(authorized.release_authorized, false);

    const subject = require("./gateway-effect-review").gatewayEffectSubject(trusted, authorizedRequest.transaction_id);
    assert.strictEqual(subject.next_action, "recover");
    assert(subject.required_targets.some(item => item.boundary === "coordination" &&
      item.target === `production-admission:${issuedAdmission.admission_ref.sha256}`));
    assert.deepStrictEqual(subject.references.production_sandbox_admission_ref, issuedAdmission.admission_ref);
    assert.strictEqual(subject.tool_execution_authorized, false);

    const recovered = recoverGatewayTransaction({
      ...trusted,
      now: at(13000)
    }, authorizedRequest.transaction_id, { toolInput });
    assert.strictEqual(recovered.state, "aborted");
    assert.strictEqual(recovered.production_execution_authorized, true);
    assert.strictEqual(recovered.production_deployment_verified, true);
    assert.strictEqual(recovered.release_authorized, false);

    const decision = loadArtifact(recovered.decision_ref);
    const receipt = loadArtifact(recovered.receipt_ref);
    assert.strictEqual(decision.schema_version, "0.3");
    assert.strictEqual(receipt.schema_version, "0.5");
    assert.deepStrictEqual(
      decision.production_sandbox_admission_ref,
      issuedAdmission.admission_ref
    );
    assert.deepStrictEqual(
      receipt.production_sandbox_admission_ref,
      issuedAdmission.admission_ref
    );
    assert.strictEqual(
      decision.coordination.backend,
      "external_linearizable"
    );
    assert.strictEqual(
      receipt.coordination.backend,
      "external_linearizable"
    );
    assert.strictEqual(receipt.production_deployment_verified, true);
    assert.strictEqual(receipt.authority.release_authorized, false);
  } finally {
    connection.client.destroy();
    connection.serverSocket.destroy();
    await new Promise(resolve => connection.server.close(resolve));
  }

  process.stdout.write(
    "PASS managed production requires exact identity, admission, and external coordination\n"
  );
  process.stdout.write(
    "PASS missing production coordinator denies before dispatch authority is consumed\n"
  );
  process.stdout.write(
    "PASS foreign coordinator repository binding cannot authorize production\n"
  );
  process.stdout.write(
    "PASS aborted production receipt preserves deployment proof and keeps release false\n"
  );
  process.stdout.write(
    "PASS Codex and Claude production wrappers resolve the same runtime\n"
  );
  process.stdout.write("Production sandbox gateway fixtures: 5/5 passed\n");
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
