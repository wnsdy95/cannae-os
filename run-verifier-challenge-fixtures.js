#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { superviseCampaign } = require("./campaign-supervisor");
const { resolveRepository, writeRepositoryArtifact } = require("./repository-artifact-store");
const { createVerifierIdentityEvidence, certificateSha256 } = require("./verifier-identity-evidence");
const { evaluateVerifierTrustReadiness } = require("./verifier-trust-readiness");
const {
  createVerifierChallengeSet,
  verifyVerifierChallengeSet
} = require("./verifier-challenge-set");
const { keyPair, makeCa, makeLeaf } = require("./verifier-identity-fixture-support");
const { validatePayload } = require("./validator-cli-prototype/validate");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function flipBase64(value) {
  return `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
}

function record(payload, kind, repositoryKey, missionId, waveId) {
  const relativePath = `repositories/${repositoryKey}/missions/${missionId}/${waveId}/${kind}/${payload.id}.json`;
  return {
    entry: { artifact_id: payload.id, relative_path: relativePath, sha256: sha256(`${JSON.stringify(payload, null, 2)}\n`) },
    payload
  };
}

function git(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "controls-challenge-"));
  const completed = [];
  let supervisedReadyOrder = null;
  const run = (name, test) => { test(); completed.push(name); };
  try {
    const root = makeCa(directory, "challenge-root");
    const spiffeId = "spiffe://verification.example.test/challenge/verifier-a";
    const leaf = makeLeaf(directory, root, "challenge-workload", [spiffeId]);
    const spiffeIdB = "spiffe://verification.example.test/challenge/verifier-b";
    const leafB = makeLeaf(directory, root, "challenge-workload-b", [spiffeIdB]);
    const verifierKey = keyPair();
    const verifierKeyB = keyPair();
    const supervisorKey = keyPair();
    const logKey = keyPair();
    const now = Date.now();
    const challengeIssuedAt = new Date(now + 2000).toISOString();
    const responseIssuedAt = new Date(now + 3000).toISOString();
    const evaluatedAt = new Date(now + 4000).toISOString();
    const repository = { key: "controls-challenge-fixture", identity_fingerprint: "a".repeat(64) };
    const verifier = {
      id: "VERIFIER-Challenge-A",
      key_id: verifierKey.keyId,
      public_key_pem: verifierKey.publicKey,
      independence_group: "provider-a",
      status: "active",
      allowed_repository_keys: [repository.key],
      allowed_execution_origins: ["remote"],
      allowed_attestation_types: ["verification_receipt", "comparative_evaluation_report"],
      workload_identity: {
        type: "spiffe_x509",
        spiffe_id: spiffeId,
        trust_root_id: "ROOT-Challenge",
        transparency_log_id: "LOG-Challenge"
      },
      valid_from: new Date(now - 60000).toISOString(),
      valid_until: new Date(now + 86400000).toISOString()
    };
    const trustPolicy = {
      schema_version: "0.5",
      type: "VerifierTrustPolicy",
      id: "VTP-Challenge-Fixture",
      repository_binding: { repository_key: repository.key, identity_fingerprint: repository.identity_fingerprint },
      policy_version: 5,
      quorum: {
        minimum_valid_attestations: 1,
        minimum_independence_groups: 1,
        require_distinct_key_ids: true,
        max_attestation_age_seconds: 300
      },
      identity_assurance: {
        required: true,
        max_evidence_age_seconds: 120,
        max_trusted_root_age_seconds: 3600,
        trusted_x509_roots: [{
          id: "ROOT-Challenge",
          trust_domain: "verification.example.test",
          certificate_pem: root.certificate,
          certificate_sha256: certificateSha256(root.certificate)
        }],
        trusted_transparency_logs: [{
          id: "LOG-Challenge",
          origin: "controls.example.test/challenge-log",
          key_id: logKey.keyId,
          public_key_pem: logKey.publicKey
        }],
        sigstore_trusted_root_refs: [{
          artifact_id: "STR-Challenge-Fixture",
          relative_path: "repositories/controls/missions/MIS-Challenge/C0/sigstore-trusted-roots/STR-Challenge-Fixture.json",
          sha256: "b".repeat(64)
        }]
      },
      execution_assurance: {
        required: true,
        runtime_policy_ref: {
          artifact_id: "VRP-Challenge-Fixture",
          relative_path: "repositories/controls/missions/MIS-Challenge/C0/verifier-runtime-policies/VRP-Challenge-Fixture.json",
          sha256: "c".repeat(64)
        }
      },
      challenge_assurance: {
        required: true,
        nonce_bytes: 32,
        response_timeout_seconds: 60,
        single_use: true,
        issuer_key_id: supervisorKey.keyId,
        issuer_public_key_pem: supervisorKey.publicKey
      },
      verifiers: [verifier],
      created_at: new Date(now - 60000).toISOString(),
      expires_at: new Date(now + 86400000).toISOString()
    };
    const campaign = {
      schema_version: "0.4",
      id: "SIC-Challenge-Fixture",
      mission_id: "MIS-Challenge-Fixture",
      command_team: { campaign_supervisor: "COS" },
      attestation_policy: {
        required: true,
        trust_policy_ref: {
          artifact_id: trustPolicy.id,
          relative_path: `repositories/${repository.key}/missions/MIS-Challenge-Fixture/C0/verifier-trust-policies/${trustPolicy.id}.json`,
          sha256: "d".repeat(64)
        },
        minimum_valid_attestations: 1,
        minimum_independence_groups: 1,
        require_distinct_key_ids: true,
        max_attestation_age_seconds: 300
      }
    };
    const runtimePolicy = {
      id: "VRP-Challenge-Fixture",
      trust_policy_id: trustPolicy.id,
      repository_binding: trustPolicy.repository_binding,
      profiles: [{ id: "PROFILE-Challenge" }],
      assignments: [{
        verifier_id: verifier.id,
        profile_id: "PROFILE-Challenge",
        allowed_purposes: ["verification_receipt", "comparative_evaluation_report"]
      }],
      created_at: new Date(now - 60000).toISOString(),
      expires_at: new Date(now + 86400000).toISOString()
    };
    const order = {
      campaign_id: campaign.id,
      mission_id: campaign.mission_id,
      repository_binding: { repository_key: repository.key, identity_fingerprint: repository.identity_fingerprint },
      cycle_number: 1,
      attempt_number: 1,
      transition: "start",
      baseline_revision: "HEAD-fixture",
      parent_decision_ref: { decision_id: "none", relative_path: "none", sha256: "none" },
      source_checkpoint_ref: { artifact_id: "none", relative_path: "none", sha256: "none" },
      source_decision_ref: { artifact_id: "none", relative_path: "none", sha256: "none" },
      checkpoint_trigger: "wave_end",
      task_order: {
        owner: "S3",
        task: "Run one bounded candidate.",
        purpose: "Verify challenge admission.",
        constraints: ["Do not release."],
        required_evidence: ["Fresh verification receipt."],
        next_checkpoint_trigger: "wave_end"
      },
      proof_requirements: {
        verification_receipt_required: true,
        comparative_evaluation_required_for: ["runtime_control", "skill"],
        signed_attestation_required: true,
        signed_comparative_attestation_required: true,
        minimum_valid_attestations: 1,
        minimum_independence_groups: 1,
        require_distinct_key_ids: true,
        trust_policy_ref: clone(campaign.attestation_policy.trust_policy_ref)
      }
    };
    const challengeSet = createVerifierChallengeSet({
      campaign,
      trustPolicy,
      order,
      repository,
      observedManifest: { revision: 1, sha256: "e".repeat(64) },
      issuedAt: challengeIssuedAt,
      issuerPrivateKeyPem: supervisorKey.privateKey
    });
    const challengeRecord = record(challengeSet, "verifier-challenge-sets", repository.key, campaign.mission_id, "C1");
    const nonce = challengeSet.challenges[0].nonce;
    const evidenceOptions = {
      verifier,
      trustPolicy,
      repositoryBinding: trustPolicy.repository_binding,
      workloadPrivateKeyPem: leaf.key,
      verifierPrivateKeyPem: verifierKey.privateKey,
      logPrivateKeyPem: logKey.privateKey,
      leafCertificatePem: leaf.certificate,
      purposes: verifier.allowed_attestation_types,
      issuedAt: responseIssuedAt,
      checkpointIssuedAt: responseIssuedAt,
      expiresAt: new Date(now + 90000).toISOString()
    };
    const evidence = createVerifierIdentityEvidence({
      ...evidenceOptions,
      evidenceId: "VIE-Challenge-Response",
      nonce
    });
    const evidenceRecord = record(evidence, "verifier-identity-evidence", repository.key, campaign.mission_id, "C1");
    const evaluate = overrides => evaluateVerifierTrustReadiness({
      campaign,
      repository,
      trustPolicy,
      runtimePolicy,
      challengeSets: [challengeRecord],
      identityEvidence: [evidenceRecord],
      sigstoreIdentityEvidence: [],
      sigstoreTrustedRoots: [],
      existingOrders: [],
      dispatchOrder: order,
      evaluatedAt,
      ...overrides
    });

    run("v0.5 trust policy and challenge set pass schema validation", () => {
      assert.strictEqual(validatePayload(trustPolicy, "verifier-trust-policy").valid, true);
      assert.strictEqual(validatePayload(challengeSet, "verifier-challenge-set").valid, true);
    });
    run("supervisor challenge is bound to the exact dispatch projection", () => {
      const result = verifyVerifierChallengeSet({ challengeSet, campaign, trustPolicy, order, repository, evaluatedAt });
      assert.deepStrictEqual(result.codes, []);
      const changed = clone(order);
      changed.attempt_number = 2;
      assert(verifyVerifierChallengeSet({ challengeSet, campaign, trustPolicy, order: changed, repository, evaluatedAt })
        .codes.includes("CHALLENGE_SET_DISPATCH_BINDING_INVALID"));
    });
    run("challenge issuer signature, ID, timeout, and manifest history fail closed", () => {
      const signedTamper = clone(challengeSet);
      signedTamper.issuer_signature.signature_base64 = flipBase64(signedTamper.issuer_signature.signature_base64);
      assert(verifyVerifierChallengeSet({ challengeSet: signedTamper, campaign, trustPolicy, order, repository, evaluatedAt })
        .codes.includes("CHALLENGE_SET_ISSUER_SIGNATURE_INVALID"));
      const idTamper = clone(challengeSet);
      idTamper.id = "VCS-Tampered-ID";
      assert(verifyVerifierChallengeSet({ challengeSet: idTamper, campaign, trustPolicy, order, repository, evaluatedAt })
        .codes.includes("CHALLENGE_SET_ID_INVALID"));
      const longWindow = clone(challengeSet);
      longWindow.expires_at = new Date(Date.parse(longWindow.issued_at) + 61000).toISOString();
      assert(verifyVerifierChallengeSet({ challengeSet: longWindow, campaign, trustPolicy, order, repository, evaluatedAt })
        .codes.includes("CHALLENGE_SET_WINDOW_POLICY_INVALID"));
      const wrongHistory = verifyVerifierChallengeSet({
        challengeSet,
        campaign,
        trustPolicy,
        order,
        repository,
        evaluatedAt,
        manifestHistory: new Map([[1, "0".repeat(64)]]),
        currentManifestRevision: 2
      });
      assert(wrongHistory.codes.includes("CHALLENGE_SET_MANIFEST_BINDING_INVALID"));
    });
    run("challenge issuer key must be distinct from verifier keys", () => {
      const correlated = clone(trustPolicy);
      correlated.challenge_assurance.issuer_key_id = verifier.key_id;
      correlated.challenge_assurance.issuer_public_key_pem = verifier.public_key_pem;
      const validation = validatePayload(correlated, "verifier-trust-policy");
      assert(validation.issues.some(item => item.code === "VERIFIER_POLICY_CHALLENGE_ISSUER_KEY_CORRELATED"));
    });
    run("fresh dual-signed nonce response admits the verifier", () => {
      const result = evaluate({});
      assert.strictEqual(result.satisfied, true, result.blocking_codes.join(", "));
      assert.strictEqual(result.challenge_assurance.satisfied, true);
      assert.strictEqual(result.challenge_assurance.responder_count, 1);
      assert.strictEqual(result.valid_until, challengeSet.expires_at);
    });
    run("missing response keeps the dispatch blocked", () => {
      const result = evaluate({ identityEvidence: [] });
      assert.strictEqual(result.satisfied, false);
      assert(result.blocking_codes.includes("TRUST_ADMISSION_CHALLENGE_RESPONSE_UNAVAILABLE"));
    });
    run("a correctly signed response with the wrong nonce is rejected", () => {
      const wrong = createVerifierIdentityEvidence({
        ...evidenceOptions,
        evidenceId: "VIE-Challenge-Wrong-Nonce",
        nonce: "f".repeat(64)
      });
      const result = evaluate({ identityEvidence: [record(wrong, "verifier-identity-evidence", repository.key, campaign.mission_id, "C1")] });
      assert.strictEqual(result.satisfied, false);
      assert.strictEqual(result.challenge_assurance.responder_count, 0);
    });
    run("an expired challenge is unavailable for quorum and can be renewed", () => {
      const renewalTime = new Date(Date.parse(challengeSet.expires_at) + 1).toISOString();
      const result = evaluate({ evaluatedAt: renewalTime });
      assert.strictEqual(result.satisfied, false);
      assert(result.blocking_codes.includes("TRUST_ADMISSION_CHALLENGE_SET_UNAVAILABLE"));
      const renewed = createVerifierChallengeSet({
        campaign,
        trustPolicy,
        order,
        repository,
        observedManifest: { revision: 2, sha256: "2".repeat(64) },
        issuedAt: renewalTime,
        issuerPrivateKeyPem: supervisorKey.privateKey
      });
      const renewedResult = evaluate({
        challengeSets: [challengeRecord, record(renewed, "verifier-challenge-sets", repository.key, campaign.mission_id, "C1")],
        identityEvidence: [],
        evaluatedAt: new Date(Date.parse(renewalTime) + 1).toISOString()
      });
      assert(!renewedResult.blocking_codes.includes("TRUST_ADMISSION_CHALLENGE_SET_AMBIGUOUS"));
      assert(renewedResult.blocking_codes.includes("TRUST_ADMISSION_CHALLENGE_RESPONSE_UNAVAILABLE"));
    });
    run("multiple challenge sets for one dispatch fail closed", () => {
      const duplicate = clone(challengeSet);
      duplicate.id = "VCS-Challenge-Ambiguous";
      duplicate.challenges[0].nonce = "1".repeat(64);
      const result = evaluate({
        challengeSets: [challengeRecord, record(duplicate, "verifier-challenge-sets", repository.key, campaign.mission_id, "C1")]
      });
      assert(result.blocking_codes.includes("TRUST_ADMISSION_CHALLENGE_SET_AMBIGUOUS"));
    });
    run("a challenge consumed by another dispatch cannot re-enter quorum", () => {
      const consumed = clone(order);
      consumed.status = "ready";
      consumed.baseline_revision = "different-baseline";
      consumed.trust_policy_admission = { challenge_assurance: { challenge_ref: clone(challengeRecord.entry) } };
      const result = evaluate({ existingOrders: [{ payload: consumed }] });
      assert(result.blocking_codes.includes("TRUST_ADMISSION_CHALLENGE_REPLAYED"));
    });
    run("duplicate challenge nonces are rejected", () => {
      const secondVerifier = clone(challengeSet.challenges[0]);
      secondVerifier.verifier_id = "VERIFIER-Challenge-B";
      const tampered = clone(challengeSet);
      tampered.challenges.push(secondVerifier);
      const validation = validatePayload(tampered, "verifier-challenge-set");
      assert(validation.issues.some(item => item.code === "CHALLENGE_SET_DUPLICATE_NONCE"));
    });
    run("campaign supervisor issues the challenge then admits only its fresh response", () => {
      const repositoryPath = path.join(directory, "supervised-repository");
      const artifactRoot = path.join(directory, "supervised-artifacts");
      fs.mkdirSync(repositoryPath, { recursive: true });
      git(repositoryPath, ["init", "-q"]);
      git(repositoryPath, ["config", "user.email", "fixtures@controls.local"]);
      git(repositoryPath, ["config", "user.name", "Controls Fixtures"]);
      fs.writeFileSync(path.join(repositoryPath, "README.md"), "challenge supervisor fixture\n");
      git(repositoryPath, ["add", "README.md"]);
      git(repositoryPath, ["commit", "-qm", "fixture baseline"]);
      const supervisedRepository = resolveRepository(repositoryPath);
      const supervisedPolicy = clone(trustPolicy);
      supervisedPolicy.id = "VTP-Supervised-Challenge";
      supervisedPolicy.repository_binding = {
        repository_key: supervisedRepository.key,
        identity_fingerprint: supervisedRepository.identity_fingerprint
      };
      supervisedPolicy.verifiers[0].allowed_repository_keys = [supervisedRepository.key];
      supervisedPolicy.quorum.minimum_valid_attestations = 2;
      supervisedPolicy.quorum.minimum_independence_groups = 2;
      supervisedPolicy.verifiers.push({
        ...clone(supervisedPolicy.verifiers[0]),
        id: "VERIFIER-Challenge-B",
        key_id: verifierKeyB.keyId,
        public_key_pem: verifierKeyB.publicKey,
        independence_group: "provider-b",
        workload_identity: {
          ...clone(supervisedPolicy.verifiers[0].workload_identity),
          spiffe_id: spiffeIdB
        }
      });
      const trustedRoot = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", "valid-sigstore-trusted-root.json"), "utf8"));
      const rootWrite = writeRepositoryArtifact({
        repositoryPath,
        artifactRoot,
        missionId: "MIS-Supervised-Challenge",
        waveId: "C0",
        kind: "sigstore-trusted-roots",
        artifactId: trustedRoot.id,
        payload: trustedRoot,
        createdAt: trustedRoot.source.retrieved_at
      });
      supervisedPolicy.identity_assurance.sigstore_trusted_root_refs = [{
        artifact_id: trustedRoot.id,
        relative_path: rootWrite.relative_path,
        sha256: rootWrite.sha256
      }];
      const supervisedRuntime = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", "valid-verifier-runtime-policy.json"), "utf8"));
      supervisedRuntime.id = "VRP-Supervised-Challenge";
      supervisedRuntime.trust_policy_id = supervisedPolicy.id;
      supervisedRuntime.repository_binding = clone(supervisedPolicy.repository_binding);
      supervisedRuntime.assignments[0].verifier_id = supervisedPolicy.verifiers[0].id;
      supervisedRuntime.assignments.push({
        verifier_id: supervisedPolicy.verifiers[1].id,
        profile_id: supervisedRuntime.assignments[0].profile_id,
        allowed_purposes: ["verification_receipt", "comparative_evaluation_report"]
      });
      supervisedRuntime.created_at = new Date(now - 60000).toISOString();
      supervisedRuntime.expires_at = new Date(now + 86400000).toISOString();
      const runtimeWrite = writeRepositoryArtifact({
        repositoryPath,
        artifactRoot,
        missionId: "MIS-Supervised-Challenge",
        waveId: "C0",
        kind: "verifier-runtime-policies",
        artifactId: supervisedRuntime.id,
        payload: supervisedRuntime,
        createdAt: supervisedRuntime.created_at
      });
      supervisedPolicy.execution_assurance.runtime_policy_ref = {
        artifact_id: supervisedRuntime.id,
        relative_path: runtimeWrite.relative_path,
        sha256: runtimeWrite.sha256
      };
      const policyWrite = writeRepositoryArtifact({
        repositoryPath,
        artifactRoot,
        missionId: "MIS-Supervised-Challenge",
        waveId: "C0",
        kind: "verifier-trust-policies",
        artifactId: supervisedPolicy.id,
        payload: supervisedPolicy,
        createdAt: supervisedPolicy.created_at
      });
      const supervisedCampaign = JSON.parse(fs.readFileSync(path.join(__dirname, "sample-payloads", "valid-self-improvement-campaign.json"), "utf8"));
      supervisedCampaign.schema_version = "0.4";
      supervisedCampaign.id = "SIC-Supervised-Challenge";
      supervisedCampaign.mission_id = "MIS-Supervised-Challenge";
      supervisedCampaign.repository_binding = {
        repository_key: supervisedRepository.key,
        identity_fingerprint: supervisedRepository.identity_fingerprint,
        baseline_revision: supervisedRepository.head_commit
      };
      supervisedCampaign.attestation_policy = {
        required: true,
        trust_policy_ref: {
          artifact_id: supervisedPolicy.id,
          relative_path: policyWrite.relative_path,
          sha256: policyWrite.sha256
        },
        minimum_valid_attestations: 2,
        minimum_independence_groups: 2,
        require_distinct_key_ids: true,
        max_attestation_age_seconds: 300
      };
      supervisedCampaign.created_at = new Date(now - 30000).toISOString();
      writeRepositoryArtifact({
        repositoryPath,
        artifactRoot,
        missionId: supervisedCampaign.mission_id,
        waveId: "C0",
        kind: "self-improvement-campaigns",
        artifactId: supervisedCampaign.id,
        payload: supervisedCampaign,
        createdAt: supervisedCampaign.created_at
      });

      const first = superviseCampaign({
        repositoryPath,
        artifactRoot,
        campaignId: supervisedCampaign.id,
        evaluatedAt: challengeIssuedAt,
        writeArtifact: true,
        challengeIssuerPrivateKeyPem: supervisorKey.privateKey
      });
      assert(first.issuedChallenge);
      assert.strictEqual(first.order.status, "blocked");
      assert(first.order.blocking_codes.includes("TRUST_ADMISSION_CHALLENGE_RESPONSE_UNAVAILABLE"));
      const issuedChallenge = first.history.challengeSets[0].payload;
      const supervisedEvidence = createVerifierIdentityEvidence({
        ...evidenceOptions,
        evidenceId: "VIE-Supervised-Challenge-Response",
        verifier: supervisedPolicy.verifiers[0],
        trustPolicy: supervisedPolicy,
        repositoryBinding: supervisedPolicy.repository_binding,
        nonce: issuedChallenge.challenges[0].nonce
      });
      writeRepositoryArtifact({
        repositoryPath,
        artifactRoot,
        missionId: supervisedCampaign.mission_id,
        waveId: "C1",
        kind: "verifier-identity-evidence",
        artifactId: supervisedEvidence.id,
        payload: supervisedEvidence,
        createdAt: supervisedEvidence.issued_at
      });
      const supervisedEvidenceB = createVerifierIdentityEvidence({
        ...evidenceOptions,
        evidenceId: "VIE-Supervised-Challenge-Response-B",
        verifier: supervisedPolicy.verifiers[1],
        trustPolicy: supervisedPolicy,
        repositoryBinding: supervisedPolicy.repository_binding,
        workloadPrivateKeyPem: leafB.key,
        verifierPrivateKeyPem: verifierKeyB.privateKey,
        leafCertificatePem: leafB.certificate,
        nonce: issuedChallenge.challenges.find(item => item.verifier_id === supervisedPolicy.verifiers[1].id).nonce
      });
      writeRepositoryArtifact({
        repositoryPath,
        artifactRoot,
        missionId: supervisedCampaign.mission_id,
        waveId: "C1",
        kind: "verifier-identity-evidence",
        artifactId: supervisedEvidenceB.id,
        payload: supervisedEvidenceB,
        createdAt: supervisedEvidenceB.issued_at
      });
      const second = superviseCampaign({
        repositoryPath,
        artifactRoot,
        campaignId: supervisedCampaign.id,
        evaluatedAt,
        writeArtifact: false
      });
      assert.strictEqual(second.order.status, "ready", second.order.blocking_codes.join(", "));
      assert.strictEqual(second.order.schema_version, "0.5");
      assert.strictEqual(second.order.trust_policy_admission.challenge_assurance.satisfied, true);
      assert.strictEqual(validatePayload(second.order, "self-improvement-cycle-order").valid, true);
      supervisedReadyOrder = second.order;
    });

    if (process.argv.includes("--write-samples")) {
      fs.writeFileSync(path.join(__dirname, "sample-payloads", "valid-verifier-challenge-set.json"), `${JSON.stringify(challengeSet, null, 2)}\n`);
      const invalid = clone(challengeSet);
      invalid.release_authorized = true;
      fs.writeFileSync(path.join(__dirname, "sample-payloads", "invalid-verifier-challenge-set-authority.json"), `${JSON.stringify(invalid, null, 2)}\n`);
      fs.writeFileSync(path.join(__dirname, "sample-payloads", "valid-self-improvement-cycle-order-v0.5.json"), `${JSON.stringify(supervisedReadyOrder, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify({ valid: true, fixture_count: completed.length, fixtures: completed }, null, 2)}\n`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main();
