#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { canonicalize } = require("@tufjs/canonical-json");
const { Metadata, MetadataKind } = require("@tufjs/models");
const {
  artifactFileDigest,
  buildTransparencyState,
  canonicalJsonBytes,
  checkpointBytes,
  checkpointCore,
  consistencyProofFromHashes,
  hashLeaf,
  incidentDigest,
  merkleRootFromHashes,
  NONE_ARTIFACT_REF,
  observationBytes,
  observationDigest,
  rotationDigest,
  stateDigest,
  verifyConsistencyProof,
  verifyTransparencyObservation,
  verifyTransparencyState,
  verifyTrustRootRotation
} = require("./transparency-operations");
const { createSigstoreTrustedRoot } = require("./sigstore-trusted-root");
const { publicKeyId } = require("./verification-attestation");
const { validatePayload } = require("./validator-cli-prototype/validate");
const { evaluateVerifierTrustReadiness } = require("./verifier-trust-readiness");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pair() {
  const value = crypto.generateKeyPairSync("ed25519");
  return {
    privateKey: value.privateKey,
    publicKeyPem: value.publicKey.export({ type: "spki", format: "pem" }),
    keyId: publicKeyId(value.publicKey)
  };
}

function sign(key, bytes, encoding = "base64") {
  return crypto.sign(null, bytes, key).toString(encoding);
}

function ref(payload, kind) {
  return {
    artifact_id: payload.id,
    relative_path: `repositories/${repositoryBinding.repository_key}/missions/MIS-Supervised-Challenge/C1/${kind}/${payload.id}.json`,
    sha256: artifactFileDigest(payload)
  };
}

const logKey = pair();
const witnessKeys = [pair(), pair()];
const monitorKeys = [pair(), pair()];
const tufOldKey = pair();
const tufNewKey = pair();
const repositoryBinding = {
  repository_key: "supervised-repository-5d5bf4b75f14",
  identity_fingerprint: "5d5bf4b75f143366e0fa15d0faf01e78a5adea0bab4ab7e7e99a92597f78fe44"
};

const originalRoot = require("./sample-payloads/valid-sigstore-trusted-root.json");
const trustedRoot1 = {
  ...clone(originalRoot),
  id: "STR-Transparency-Root-1"
};
const nextRootMaterial = clone(originalRoot.trusted_root);
nextRootMaterial.tlogs[0].baseUrl = "https://rekor-tiles.example.test/shard-2";
const trustedRoot2 = createSigstoreTrustedRoot({
  id: "STR-Transparency-Root-2",
  trustedRoot: nextRootMaterial,
  sourceKind: "custom_tuf",
  sourceUri: "https://tuf.example.test",
  retrievedAt: "2026-07-22T10:01:00Z"
});
const trustedRoot1Ref = ref(trustedRoot1, "sigstore-trusted-roots");
const trustedRoot2Ref = ref(trustedRoot2, "sigstore-trusted-roots");

const policy = {
  schema_version: "0.1",
  type: "TransparencyPolicy",
  id: "TP-Phase-13",
  repository_binding: repositoryBinding,
  trust_policy_id: "VTP-Supervised-Challenge",
  state_stream_id: "TSS-Phase-13",
  max_state_age_seconds: 600,
  trusted_roots: [{
    id: "ROOT-Sigstore-PGI",
    trusted_root_ref: trustedRoot1Ref,
    trusted_root_sha256: trustedRoot1.trusted_root_sha256,
    tuf_root_version: 1,
    tuf_root_expires_at: "2027-07-22T00:00:00Z"
  }],
  logs: [{
    id: "LOG-Rekor-PGI",
    origin: "rekor.example.test/shard-1",
    key_id: logKey.keyId,
    public_key_pem: logKey.publicKeyPem,
    max_checkpoint_age_seconds: 300,
    witness_ids: ["WITNESS-A", "WITNESS-B"],
    monitor_ids: ["MONITOR-A", "MONITOR-B"],
    minimum_witnesses: 2,
    minimum_witness_operators: 2,
    minimum_monitors: 2,
    minimum_monitor_operators: 2
  }],
  witnesses: witnessKeys.map((key, index) => ({
    id: `WITNESS-${index === 0 ? "A" : "B"}`,
    operator_id: `cannae:operator:witness-${index + 1}`,
    key_id: key.keyId,
    public_key_pem: key.publicKeyPem,
    status: "active",
    valid_from: "2026-07-22T00:00:00Z",
    valid_until: "2026-07-23T00:00:00Z"
  })),
  monitors: monitorKeys.map((key, index) => ({
    id: `MONITOR-${index === 0 ? "A" : "B"}`,
    operator_id: `cannae:operator:monitor-${index + 1}`,
    key_id: key.keyId,
    public_key_pem: key.publicKeyPem,
    status: "active",
    valid_from: "2026-07-22T00:00:00Z",
    valid_until: "2026-07-23T00:00:00Z"
  })),
  incident_response: {
    authority: "USER",
    equivocation_action: "block_all_dispatch",
    consistency_failure_action: "block_all_dispatch",
    root_failure_action: "block_all_dispatch",
    preserve_evidence: true
  },
  created_at: "2026-07-22T00:00:00Z",
  expires_at: "2026-07-23T00:00:00Z"
};

function makeCheckpoint(hashes, issuedAt, overrides = {}) {
  const checkpoint = {
    log_id: policy.logs[0].id,
    origin: policy.logs[0].origin,
    tree_size: hashes.length,
    root_hash: merkleRootFromHashes(hashes),
    issued_at: issuedAt,
    key_id: logKey.keyId,
    ...overrides
  };
  checkpoint.signature_base64 = sign(logKey.privateKey, checkpointBytes(checkpoint));
  return checkpoint;
}

function makeObservation(id, checkpoint, previousCheckpoint, proofHashes, observedAt, expiresAt) {
  const observation = {
    schema_version: "0.1",
    type: "TransparencyObservation",
    id,
    policy_id: policy.id,
    log_id: checkpoint.log_id,
    previous_checkpoint: previousCheckpoint ? checkpointCore(previousCheckpoint) : {
      artifact_id: "none",
      relative_path: "none",
      sha256: "none"
    },
    checkpoint,
    consistency_proof: {
      algorithm: "rfc6962_sha256",
      hashes: proofHashes,
      sha256: crypto.createHash("sha256").update(canonicalJsonBytes(proofHashes)).digest("hex")
    },
    witness_signatures: witnessKeys.map((key, index) => ({
      witness_id: `WITNESS-${index === 0 ? "A" : "B"}`,
      key_id: key.keyId,
      observed_at: observedAt,
      signature_base64: sign(key.privateKey, checkpointBytes(checkpoint))
    })),
    monitor_signatures: [],
    observed_at: observedAt,
    expires_at: expiresAt
  };
  observation.monitor_signatures = monitorKeys.map((key, index) => ({
    monitor_id: `MONITOR-${index === 0 ? "A" : "B"}`,
    key_id: key.keyId,
    observed_at: observedAt,
    signature_base64: sign(key.privateKey, observationBytes(observation))
  }));
  observation.observation_sha256 = observationDigest(observation);
  return observation;
}

function tufKey(key) {
  return {
    keytype: "ed25519",
    scheme: "ed25519",
    keyval: { public: key.publicKeyPem }
  };
}

function makeTufRoot(version, rootKey, signatures) {
  const rawSigned = {
    _type: "root",
    spec_version: "1.0.31",
    version,
    expires: "2027-07-22T00:00:00Z",
    keys: { [rootKey.keyId]: tufKey(rootKey) },
    roles: {
      root: { keyids: [rootKey.keyId], threshold: 1 },
      snapshot: { keyids: [rootKey.keyId], threshold: 1 },
      targets: { keyids: [rootKey.keyId], threshold: 1 },
      timestamp: { keyids: [rootKey.keyId], threshold: 1 }
    },
    consistent_snapshot: true
  };
  const signed = Metadata.fromJSON(MetadataKind.Root, { signatures: [], signed: rawSigned }).signed.toJSON();
  const signedBytes = Buffer.from(canonicalize(signed));
  return {
    signatures: signatures.map(key => ({ keyid: key.keyId, sig: sign(key.privateKey, signedBytes, "hex") })),
    signed
  };
}

const tufRoot1 = makeTufRoot(1, tufOldKey, [tufOldKey]);
const tufRoot2 = makeTufRoot(2, tufNewKey, [tufOldKey, tufNewKey]);
const rotation = {
  schema_version: "0.1",
  type: "TrustRootRotation",
  id: "TRR-Phase-13-2",
  policy_id: policy.id,
  previous_trusted_root_ref: trustedRoot1Ref,
  next_trusted_root_ref: trustedRoot2Ref,
  previous_trusted_root_sha256: trustedRoot1.trusted_root_sha256,
  next_trusted_root_sha256: trustedRoot2.trusted_root_sha256,
  previous_tuf_root: tufRoot1,
  next_tuf_root: tufRoot2,
  previous_tuf_root_sha256: crypto.createHash("sha256").update(canonicalJsonBytes(tufRoot1)).digest("hex"),
  next_tuf_root_sha256: crypto.createHash("sha256").update(canonicalJsonBytes(tufRoot2)).digest("hex"),
  reason: "scheduled",
  revoked_tuf_root_key_ids: [],
  approved_by: "USER",
  approved_at: "2026-07-22T10:00:00Z",
  effective_at: "2026-07-22T10:01:00Z"
};
rotation.rotation_sha256 = rotationDigest(rotation);

const leaves4 = Array.from({ length: 4 }, (_unused, index) => hashLeaf(`entry-${index}`));
const leaves8 = Array.from({ length: 8 }, (_unused, index) => hashLeaf(`entry-${index}`));
const checkpoint1 = makeCheckpoint(leaves4, "2026-07-22T09:59:00Z");
const observation1 = makeObservation(
  "TO-Phase-13-1",
  checkpoint1,
  null,
  [],
  "2026-07-22T10:00:00Z",
  "2026-07-22T10:10:00Z"
);
const observation1Wrapper = { artifact_ref: ref(observation1, "transparency-observations"), observation: observation1 };
const root1Wrapper = { artifact_ref: trustedRoot1Ref, trusted_root: trustedRoot1 };
const state1 = buildTransparencyState({
  policy,
  trustedRoots: [root1Wrapper],
  observations: [observation1Wrapper],
  rootRotations: [],
  incidents: [],
  trustPolicyId: policy.trust_policy_id,
  repositoryBinding,
  generatedAt: "2026-07-22T10:00:00Z",
  stateId: "TS-Phase-13-1"
});
const state1Wrapper = { artifact_ref: ref(state1, "transparency-states"), state: state1 };

const checkpoint2 = makeCheckpoint(leaves8, "2026-07-22T10:01:00Z");
const observation2 = makeObservation(
  "TO-Phase-13-2",
  checkpoint2,
  checkpoint1,
  consistencyProofFromHashes(leaves8, leaves4.length),
  "2026-07-22T10:02:00Z",
  "2026-07-22T10:12:00Z"
);
const observation2Wrapper = { artifact_ref: ref(observation2, "transparency-observations"), observation: observation2 };
const rotationWrapper = {
  artifact_ref: ref(rotation, "trust-root-rotations"),
  rotation,
  previous_trusted_root: trustedRoot1,
  next_trusted_root: trustedRoot2
};
const state2 = buildTransparencyState({
  policy,
  previousState: state1Wrapper,
  observations: [observation2Wrapper],
  rootRotations: [rotationWrapper],
  incidents: [],
  trustPolicyId: policy.trust_policy_id,
  repositoryBinding,
  generatedAt: "2026-07-22T10:02:00Z",
  stateId: "TS-Phase-13-2"
});

const transparencyPolicyRef = ref(policy, "transparency-policies");
const state2Ref = ref(state2, "transparency-states");
const trustPolicyV07 = clone(require("./sample-payloads/valid-verifier-trust-policy-v0.6.json"));
trustPolicyV07.schema_version = "0.7";
trustPolicyV07.id = policy.trust_policy_id;
trustPolicyV07.repository_binding = clone(repositoryBinding);
trustPolicyV07.policy_version = 7;
trustPolicyV07.identity_assurance.sigstore_trusted_root_refs = [trustedRoot1Ref, trustedRoot2Ref];
for (const verifier of trustPolicyV07.verifiers) {
  verifier.allowed_repository_keys = [repositoryBinding.repository_key];
  verifier.workload_identity.trust_root_id = trustedRoot1.id;
}
trustPolicyV07.transparency_assurance = {
  required: true,
  transparency_policy_ref: transparencyPolicyRef,
  state_stream_id: policy.state_stream_id,
  max_state_age_seconds: 600
};

function shiftTimestamps(value, deltaMs) {
  if (Array.isArray(value)) return value.map(item => shiftTimestamps(item, deltaMs));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shiftTimestamps(item, deltaMs)]));
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) {
    return new Date(Date.parse(value) + deltaMs).toISOString();
  }
  return value;
}

const cycleOrderV07Source = require("./sample-payloads/valid-self-improvement-cycle-order-v0.6.json");
const cycleOrderV07 = shiftTimestamps(
  clone(cycleOrderV07Source),
  Date.parse("2026-07-22T10:03:00Z") - Date.parse(cycleOrderV07Source.generated_at)
);
const trustPolicyV07Ref = ref(trustPolicyV07, "verifier-trust-policies");
cycleOrderV07.schema_version = "0.7";
cycleOrderV07.id = "SCO-Supervised-Challenge-Phase-13";
cycleOrderV07.proof_requirements.trust_policy_ref = clone(trustPolicyV07Ref);
cycleOrderV07.trust_policy_admission.trust_policy_ref = clone(trustPolicyV07Ref);
cycleOrderV07.trust_policy_admission.assurance_scope =
  "continuously_transparent_failure_domain_verified_fresh_challenged_workload_and_policy_eligibility";
cycleOrderV07.trust_policy_admission.transparency_assurance = {
  required: true,
  satisfied: true,
  policy_ref: transparencyPolicyRef,
  state_ref: state2Ref,
  stream_id: policy.state_stream_id,
  sequence_number: state2.sequence_number,
  generated_at: state2.generated_at,
  max_state_age_seconds: 600,
  log_count: state2.logs.length,
  witness_count: new Set(state2.logs.flatMap(item => item.witness_ids)).size,
  monitor_count: new Set(state2.logs.flatMap(item => item.monitor_ids)).size,
  incident_count: state2.incidents.length,
  valid_until: state2.valid_until,
  blocking_codes: []
};
const sampleIncident = {
  schema_version: "0.1",
  type: "TransparencyIncident",
  id: "TI-Phase-13-Sample",
  policy_id: policy.id,
  kind: "checkpoint_stale",
  status: "open",
  severity: "critical",
  detected_at: "2026-07-22T10:02:30Z",
  affected_log_ids: [policy.logs[0].id],
  evidence_refs: [observation2Wrapper.artifact_ref],
  revocations: [],
  containment_actions: ["block_dispatch", "preserve_evidence", "notify_operator"],
  authority: "USER"
};
sampleIncident.incident_sha256 = incidentDigest(sampleIncident);

const fixtures = [];
function fixture(name, action) {
  action();
  fixtures.push(name);
}

function referenceHashNode(left, right) {
  return crypto.createHash("sha256").update(Buffer.concat([
    Buffer.from([1]),
    Buffer.from(left, "hex"),
    Buffer.from(right, "hex")
  ])).digest("hex");
}

function largeTreeConsistencyVector(oldSize, newSize) {
  let first = BigInt(oldSize - 1);
  let second = BigInt(newSize - 1);
  while (first % 2n === 1n) {
    first /= 2n;
    second /= 2n;
  }
  const proof = [hashLeaf("large-tree-proof-0")];
  let firstHash = proof[0];
  let secondHash = proof[0];
  while (second !== 0n) {
    const value = hashLeaf(`large-tree-proof-${proof.length}`);
    proof.push(value);
    if (first % 2n === 1n || first === second) {
      firstHash = referenceHashNode(value, firstHash);
      secondHash = referenceHashNode(value, secondHash);
      while (first !== 0n && first % 2n === 0n) {
        first /= 2n;
        second /= 2n;
      }
    } else {
      secondHash = referenceHashNode(secondHash, value);
    }
    first /= 2n;
    second /= 2n;
  }
  return { oldRoot: firstHash, newRoot: secondHash, proof };
}

fixture("RFC 6962 consistency proofs validate every prefix through size 64", () => {
  for (let size = 2; size <= 64; size += 1) {
    const hashes = Array.from({ length: size }, (_unused, index) => hashLeaf(`proof-${index}`));
    const root = merkleRootFromHashes(hashes);
    for (let prefix = 1; prefix <= size; prefix += 1) {
      assert.equal(verifyConsistencyProof(
        prefix,
        size,
        merkleRootFromHashes(hashes.slice(0, prefix)),
        root,
        consistencyProofFromHashes(hashes, prefix)
      ), true);
    }
  }
});

fixture("consistency verification preserves tree sizes above 32 bits", () => {
  const oldSize = (2 ** 32) + 1;
  const newSize = oldSize + 12345;
  const vector = largeTreeConsistencyVector(oldSize, newSize);
  assert.equal(verifyConsistencyProof(
    oldSize,
    newSize,
    vector.oldRoot,
    vector.newRoot,
    vector.proof
  ), true);
});

fixture("independently signed genesis checkpoint becomes ready state", () => {
  assert.equal(state1.status, "ready", state1.blocking_codes.join(", "));
  assert.equal(verifyTransparencyState({ state: state1, policy, evaluatedAt: "2026-07-22T10:00:01Z" }).valid, true);
});

fixture("append-only checkpoint and sequential TUF root rotation become ready", () => {
  assert.equal(state2.status, "ready", state2.blocking_codes.join(", "));
  assert.equal(state2.trusted_roots[0].tuf_root_version, 2);
  assert.equal(verifyTransparencyState({
    state: state2,
    policy,
    previousState: state1,
    evaluatedAt: "2026-07-22T10:02:01Z"
  }).valid, true);
});

fixture("future evidence cannot be projected into an earlier state", () => {
  const backdated = buildTransparencyState({
    policy,
    previousState: state1Wrapper,
    observations: [observation2Wrapper],
    rootRotations: [rotationWrapper],
    incidents: [],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:00:30Z",
    stateId: "TS-Phase-13-Backdated"
  });
  assert.equal(backdated.status, "blocked");
  assert(backdated.blocking_codes.includes("TRANSPARENCY_OBSERVATION_STATE_TIME_INVALID"));
  assert(backdated.blocking_codes.includes("TRUST_ROOT_ROTATION_NOT_EFFECTIVE"));

  const timeRollback = buildTransparencyState({
    policy,
    previousState: state1Wrapper,
    observations: [observation2Wrapper],
    incidents: [],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T09:59:30Z",
    stateId: "TS-Phase-13-Time-Rollback"
  });
  assert(timeRollback.blocking_codes.includes("TRANSPARENCY_STATE_TIME_ROLLBACK"));
});

fixture("state projection cannot change repository or trust-policy binding", () => {
  const wrongRepository = clone(repositoryBinding);
  wrongRepository.repository_key = "different-repository";
  const mismatched = buildTransparencyState({
    policy,
    trustedRoots: [root1Wrapper],
    observations: [observation1Wrapper],
    incidents: [],
    trustPolicyId: "VTP-Different",
    repositoryBinding: wrongRepository,
    generatedAt: "2026-07-22T10:00:00Z",
    stateId: "TS-Phase-13-Binding-Mismatch"
  });
  assert(mismatched.blocking_codes.includes("TRANSPARENCY_TRUST_POLICY_MISMATCH"));
  assert(mismatched.blocking_codes.includes("TRANSPARENCY_REPOSITORY_BINDING_MISMATCH"));
});

fixture("current state cannot outlive its TUF root metadata", () => {
  const shortRootPolicy = clone(policy);
  shortRootPolicy.trusted_roots[0].tuf_root_expires_at = "2026-07-22T10:05:00Z";
  const shortRootState = buildTransparencyState({
    policy: shortRootPolicy,
    trustedRoots: [root1Wrapper],
    observations: [observation1Wrapper],
    incidents: [],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:00:00Z",
    stateId: "TS-Phase-13-Short-Root"
  });
  assert.equal(shortRootState.valid_until, "2026-07-22T10:05:00.000Z");

  const expiredRootPolicy = clone(shortRootPolicy);
  expiredRootPolicy.trusted_roots[0].tuf_root_expires_at = "2026-07-22T09:59:59Z";
  const expiredRootState = buildTransparencyState({
    policy: expiredRootPolicy,
    trustedRoots: [root1Wrapper],
    observations: [observation1Wrapper],
    incidents: [],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:00:00Z",
    stateId: "TS-Phase-13-Expired-Root"
  });
  assert(expiredRootState.blocking_codes.includes("TRANSPARENCY_TUF_ROOT_EXPIRED"));

  const futureRoot = clone(trustedRoot1);
  futureRoot.source.retrieved_at = "2026-07-22T10:01:00Z";
  const futureRootRef = ref(futureRoot, "sigstore-trusted-roots");
  const futureRootPolicy = clone(policy);
  futureRootPolicy.trusted_roots[0].trusted_root_ref = futureRootRef;
  const futureRootState = buildTransparencyState({
    policy: futureRootPolicy,
    trustedRoots: [{ artifact_ref: futureRootRef, trusted_root: futureRoot }],
    observations: [observation1Wrapper],
    incidents: [],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:00:00Z",
    stateId: "TS-Phase-13-Future-Root"
  });
  assert(futureRootState.blocking_codes.includes("TRANSPARENCY_INITIAL_ROOT_INVALID"));
});

fixture("same-size conflicting signed checkpoint is equivocation", () => {
  const conflictingHashes = [...leaves4];
  conflictingHashes[3] = hashLeaf("conflicting-entry");
  const conflicting = makeCheckpoint(conflictingHashes, "2026-07-22T10:01:00Z");
  const observation = makeObservation("TO-Equivocation", conflicting, checkpoint1, [], "2026-07-22T10:02:00Z", "2026-07-22T10:12:00Z");
  const result = verifyTransparencyObservation({ observation, policy, expectedPrevious: checkpoint1 });
  assert(result.codes.includes("TRANSPARENCY_EQUIVOCATION_DETECTED"));
  assert(result.incident_codes.includes("equivocation"));
});

fixture("invalid consistency path is rejected", () => {
  const observation = clone(observation2);
  observation.consistency_proof.hashes[0] = "f".repeat(64);
  observation.consistency_proof.sha256 = crypto.createHash("sha256").update(canonicalJsonBytes(observation.consistency_proof.hashes)).digest("hex");
  observation.monitor_signatures = monitorKeys.map((key, index) => ({
    monitor_id: `MONITOR-${index === 0 ? "A" : "B"}`,
    key_id: key.keyId,
    observed_at: observation.observed_at,
    signature_base64: sign(key.privateKey, observationBytes(observation))
  }));
  observation.observation_sha256 = observationDigest(observation);
  const result = verifyTransparencyObservation({ observation, policy, expectedPrevious: checkpoint1 });
  assert(result.codes.includes("TRANSPARENCY_CONSISTENCY_PROOF_INVALID"));
});

fixture("checkpoint rollback is rejected", () => {
  const rollbackCheckpoint = makeCheckpoint(leaves4.slice(0, 2), "2026-07-22T10:01:00Z");
  const observation = makeObservation("TO-Rollback", rollbackCheckpoint, checkpoint1, [], "2026-07-22T10:02:00Z", "2026-07-22T10:12:00Z");
  const result = verifyTransparencyObservation({ observation, policy, expectedPrevious: checkpoint1 });
  assert(result.codes.includes("TRANSPARENCY_CHECKPOINT_ROLLBACK"));
});

fixture("one witness cannot satisfy a two-operator quorum", () => {
  const observation = clone(observation2);
  observation.witness_signatures.pop();
  observation.observation_sha256 = observationDigest(observation);
  const result = verifyTransparencyObservation({ observation, policy, expectedPrevious: checkpoint1 });
  assert(result.codes.includes("TRANSPARENCY_WITNESS_QUORUM_UNAVAILABLE"));
});

fixture("mutated monitor signature is rejected", () => {
  const observation = clone(observation2);
  observation.monitor_signatures[0].signature_base64 = Buffer.alloc(64).toString("base64");
  observation.observation_sha256 = observationDigest(observation);
  const result = verifyTransparencyObservation({ observation, policy, expectedPrevious: checkpoint1 });
  assert(result.codes.includes("TRANSPARENCY_MONITOR_SIGNATURE_INVALID"));
});

fixture("unsigned observer timestamps cannot alter registry eligibility", () => {
  const witnessMutation = clone(observation2);
  witnessMutation.witness_signatures[0].observed_at = "2026-07-22T10:01:59Z";
  witnessMutation.observation_sha256 = observationDigest(witnessMutation);
  const witnessResult = verifyTransparencyObservation({
    observation: witnessMutation,
    policy,
    expectedPrevious: checkpoint1
  });
  assert(witnessResult.codes.includes("TRANSPARENCY_WITNESS_SIGNATURE_INVALID"));
  assert(validatePayload(witnessMutation, "transparency-observation").issues
    .some(item => item.code === "TRANSPARENCY_OBSERVER_TIME_UNBOUND"));

  const monitorMutation = clone(observation2);
  monitorMutation.monitor_signatures[0].observed_at = "2026-07-22T10:01:59Z";
  monitorMutation.observation_sha256 = observationDigest(monitorMutation);
  const monitorResult = verifyTransparencyObservation({
    observation: monitorMutation,
    policy,
    expectedPrevious: checkpoint1
  });
  assert(monitorResult.codes.includes("TRANSPARENCY_MONITOR_SIGNATURE_INVALID"));

  const expiredWitnessPolicy = clone(policy);
  expiredWitnessPolicy.witnesses[0].valid_until = "2026-07-22T10:01:30Z";
  const expiredWitnessResult = verifyTransparencyObservation({
    observation: observation2,
    policy: expiredWitnessPolicy,
    expectedPrevious: checkpoint1
  });
  assert(expiredWitnessResult.codes.includes("TRANSPARENCY_WITNESS_SIGNATURE_INVALID"));
});

fixture("stale checkpoint cannot refresh monitor state", () => {
  const staleCheckpoint = makeCheckpoint(leaves8, "2026-07-22T09:00:00Z");
  const observation = makeObservation("TO-Stale", staleCheckpoint, checkpoint1,
    consistencyProofFromHashes(leaves8, leaves4.length), "2026-07-22T10:02:00Z", "2026-07-22T10:12:00Z");
  const result = verifyTransparencyObservation({ observation, policy, expectedPrevious: checkpoint1 });
  assert(result.codes.includes("TRANSPARENCY_CHECKPOINT_STALE"));
});

fixture("embedded evidence mutation cannot be hidden by recomputing state digest", () => {
  const mutated = clone(state2);
  mutated.evidence.observations[0].observation.checkpoint.root_hash = "0".repeat(64);
  mutated.state_sha256 = stateDigest(mutated);
  const result = verifyTransparencyState({ state: mutated, policy, previousState: state1, evaluatedAt: "2026-07-22T10:02:01Z" });
  assert.equal(result.valid, false);
  assert(result.codes.includes("TRANSPARENCY_STATE_PROJECTION_MISMATCH"));
});

fixture("TUF root update requires old and new threshold signatures", () => {
  const invalid = clone(rotation);
  invalid.next_tuf_root.signatures = invalid.next_tuf_root.signatures.filter(item => item.keyid === tufOldKey.keyId);
  invalid.next_tuf_root_sha256 = crypto.createHash("sha256").update(canonicalJsonBytes(invalid.next_tuf_root)).digest("hex");
  invalid.rotation_sha256 = rotationDigest(invalid);
  const result = verifyTrustRootRotation({ rotation: invalid, previousRootArtifact: trustedRoot1, nextRootArtifact: trustedRoot2 });
  assert(result.codes.includes("TRUST_ROOT_ROTATION_TUF_CHAIN_INVALID"));
});

fixture("TUF root update cannot skip an intermediate version", () => {
  const invalid = clone(rotation);
  invalid.next_tuf_root = makeTufRoot(3, tufNewKey, [tufOldKey, tufNewKey]);
  invalid.next_tuf_root_sha256 = crypto.createHash("sha256").update(canonicalJsonBytes(invalid.next_tuf_root)).digest("hex");
  invalid.rotation_sha256 = rotationDigest(invalid);
  const result = verifyTrustRootRotation({ rotation: invalid, previousRootArtifact: trustedRoot1, nextRootArtifact: trustedRoot2 });
  assert(result.codes.includes("TRUST_ROOT_ROTATION_VERSION_INVALID"));
});

fixture("TUF root material must exist before rotation becomes effective", () => {
  const futureRoot = clone(trustedRoot2);
  futureRoot.source.retrieved_at = "2026-07-22T10:02:00Z";
  const futureRootRef = ref(futureRoot, "sigstore-trusted-roots");
  const invalid = clone(rotation);
  invalid.next_trusted_root_ref = futureRootRef;
  invalid.rotation_sha256 = rotationDigest(invalid);
  const result = verifyTrustRootRotation({
    rotation: invalid,
    previousRootArtifact: trustedRoot1,
    nextRootArtifact: futureRoot
  });
  assert(result.codes.includes("TRUST_ROOT_ROTATION_TIME_INVALID"));
});

fixture("open incident and effective revocation block state", () => {
  const incident = {
    schema_version: "0.1",
    type: "TransparencyIncident",
    id: "TI-Phase-13-Open",
    policy_id: policy.id,
    kind: "monitor_compromise",
    status: "open",
    severity: "critical",
    detected_at: "2026-07-22T10:01:30Z",
    affected_log_ids: [policy.logs[0].id],
    evidence_refs: [observation2Wrapper.artifact_ref],
    revocations: [{
      subject_type: "monitor",
      subject_id: policy.monitors[0].id,
      effective_at: "2026-07-22T10:01:30Z",
      reason: "Compromised monitor key"
    }],
    containment_actions: ["block_dispatch", "preserve_evidence", "revoke_key"],
    authority: "USER"
  };
  incident.incident_sha256 = incidentDigest(incident);
  const blocked = buildTransparencyState({
    policy,
    previousState: state1Wrapper,
    observations: [observation2Wrapper],
    rootRotations: [],
    incidents: [{ artifact_ref: ref(incident, "transparency-incidents"), incident }],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:02:00Z",
    stateId: "TS-Phase-13-Incident"
  });
  assert.equal(blocked.status, "blocked");
  assert(blocked.blocking_codes.includes("TRANSPARENCY_INCIDENT_ACTIVE"));
  assert(blocked.blocking_codes.includes("TRANSPARENCY_ACTIVE_MONITOR_REVOKED"));
});

fixture("incident recovery preserves immutable history and requires an exact supersession", () => {
  const openIncident = {
    schema_version: "0.1",
    type: "TransparencyIncident",
    id: "TI-Phase-13-Recoverable",
    policy_id: policy.id,
    kind: "checkpoint_stale",
    status: "open",
    severity: "critical",
    detected_at: "2026-07-22T10:01:30Z",
    affected_log_ids: [policy.logs[0].id],
    evidence_refs: [observation2Wrapper.artifact_ref],
    revocations: [],
    containment_actions: ["block_dispatch", "preserve_evidence", "notify_operator"],
    authority: "USER"
  };
  openIncident.incident_sha256 = incidentDigest(openIncident);
  const openWrapper = { artifact_ref: ref(openIncident, "transparency-incidents"), incident: openIncident };
  const blockedState = buildTransparencyState({
    policy,
    previousState: state1Wrapper,
    observations: [observation2Wrapper],
    incidents: [openWrapper],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:02:00Z",
    stateId: "TS-Phase-13-Recovery-Blocked"
  });
  assert.equal(blockedState.status, "blocked");

  const leaves16 = Array.from({ length: 16 }, (_unused, index) => hashLeaf(`entry-${index}`));
  const checkpoint3 = makeCheckpoint(leaves16, "2026-07-22T10:03:00Z");
  const observation3 = makeObservation(
    "TO-Phase-13-3",
    checkpoint3,
    checkpoint2,
    consistencyProofFromHashes(leaves16, leaves8.length),
    "2026-07-22T10:04:00Z",
    "2026-07-22T10:14:00Z"
  );
  const observation3Wrapper = { artifact_ref: ref(observation3, "transparency-observations"), observation: observation3 };
  const resolutionIncident = {
    schema_version: "0.1",
    type: "TransparencyIncident",
    id: "TI-Phase-13-Recoverable-Resolution",
    policy_id: policy.id,
    kind: openIncident.kind,
    status: "resolved",
    severity: "critical",
    detected_at: "2026-07-22T10:03:30Z",
    affected_log_ids: [policy.logs[0].id],
    evidence_refs: [observation3Wrapper.artifact_ref],
    revocations: [],
    containment_actions: ["block_dispatch", "preserve_evidence", "notify_operator"],
    authority: "USER",
    supersedes_incident_ref: openWrapper.artifact_ref,
    resolution: {
      authority: "USER",
      resolved_at: "2026-07-22T10:04:30Z",
      evidence_refs: [observation3Wrapper.artifact_ref],
      rationale: "A fresh witnessed checkpoint restored an append-only chain."
    }
  };
  resolutionIncident.incident_sha256 = incidentDigest(resolutionIncident);
  const resolutionWrapper = {
    artifact_ref: ref(resolutionIncident, "transparency-incidents"),
    incident: resolutionIncident
  };
  const blockedWrapper = { artifact_ref: ref(blockedState, "transparency-states"), state: blockedState };
  const prematureRecovery = buildTransparencyState({
    policy,
    previousState: blockedWrapper,
    observations: [observation3Wrapper],
    incidents: [openWrapper, resolutionWrapper],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:04:00Z",
    stateId: "TS-Phase-13-Premature-Recovery"
  });
  assert.equal(prematureRecovery.status, "blocked");
  assert(prematureRecovery.blocking_codes.includes("TRANSPARENCY_INCIDENT_TIME_INVALID"));
  assert(prematureRecovery.blocking_codes.includes("TRANSPARENCY_INCIDENT_ACTIVE"));

  const recovered = buildTransparencyState({
    policy,
    previousState: blockedWrapper,
    observations: [observation3Wrapper],
    incidents: [openWrapper, resolutionWrapper],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:05:00Z",
    stateId: "TS-Phase-13-Recovered"
  });
  assert.equal(recovered.status, "ready", recovered.blocking_codes.join(", "));
  assert.equal(verifyTransparencyState({
    state: recovered,
    policy,
    previousState: blockedState,
    evaluatedAt: "2026-07-22T10:05:01Z"
  }).valid, true);

  const collidingIncident = clone(openIncident);
  collidingIncident.detected_at = "2026-07-22T10:01:45Z";
  collidingIncident.containment_actions = ["block_dispatch", "preserve_evidence"];
  collidingIncident.incident_sha256 = incidentDigest(collidingIncident);
  const collidingWrapper = {
    artifact_ref: ref(collidingIncident, "transparency-incidents-collision"),
    incident: collidingIncident
  };
  const collisionAttempt = buildTransparencyState({
    policy,
    previousState: state1Wrapper,
    observations: [observation2Wrapper],
    incidents: [openWrapper, collidingWrapper, resolutionWrapper],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:05:00Z",
    stateId: "TS-Phase-13-Incident-ID-Collision"
  });
  assert(collisionAttempt.blocking_codes.includes("TRANSPARENCY_INCIDENT_SET_INVALID"));
  assert(collisionAttempt.blocking_codes.includes("TRANSPARENCY_INCIDENT_ACTIVE"));

  const backdatedResolution = clone(resolutionIncident);
  backdatedResolution.id = "TI-Phase-13-Backdated-Resolution";
  backdatedResolution.detected_at = "2026-07-22T10:00:00Z";
  backdatedResolution.incident_sha256 = incidentDigest(backdatedResolution);
  const backdatedResolutionWrapper = {
    artifact_ref: ref(backdatedResolution, "transparency-incidents"),
    incident: backdatedResolution
  };
  const backdatedResolutionAttempt = buildTransparencyState({
    policy,
    previousState: state1Wrapper,
    observations: [observation2Wrapper],
    incidents: [openWrapper, backdatedResolutionWrapper],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:05:00Z",
    stateId: "TS-Phase-13-Backdated-Resolution"
  });
  assert(backdatedResolutionAttempt.blocking_codes.includes("TRANSPARENCY_INCIDENT_SUPERSESSION_INVALID"));
  assert(backdatedResolutionAttempt.blocking_codes.includes("TRANSPARENCY_INCIDENT_ACTIVE"));

  const historyDropped = buildTransparencyState({
    policy,
    previousState: blockedWrapper,
    observations: [observation3Wrapper],
    incidents: [resolutionWrapper],
    trustPolicyId: policy.trust_policy_id,
    repositoryBinding,
    generatedAt: "2026-07-22T10:05:00Z",
    stateId: "TS-Phase-13-History-Dropped"
  });
  assert(historyDropped.blocking_codes.includes("TRANSPARENCY_INCIDENT_HISTORY_DROPPED"));
  assert(historyDropped.blocking_codes.includes("TRANSPARENCY_INCIDENT_SUPERSESSION_INVALID"));
  assert.equal(validatePayload(resolutionIncident, "transparency-incident").valid, true);
});

fixture("v0.7 readiness admits only a current complete transparency chain", () => {
  const runtimePolicy = {
    id: trustPolicyV07.execution_assurance.runtime_policy_ref.artifact_id,
    trust_policy_id: trustPolicyV07.id,
    repository_binding: clone(repositoryBinding),
    profiles: trustPolicyV07.verifiers.map((verifier, index) => ({
      id: `PROFILE-Phase-13-${index + 1}`,
      independence: Object.fromEntries([
        "provider_id", "operator_id", "control_plane_id", "account_id", "project_id",
        "runner_pool_id", "infrastructure_id", "region_id", "zone_id"
      ].map(dimension => [dimension, `urn:${dimension}:phase-13-${index + 1}`]))
    })),
    assignments: trustPolicyV07.verifiers.map((verifier, index) => ({
      verifier_id: verifier.id,
      profile_id: `PROFILE-Phase-13-${index + 1}`,
      allowed_purposes: ["verification_receipt", "comparative_evaluation_report"]
    })),
    created_at: "2026-07-22T00:00:00Z",
    expires_at: "2026-07-23T00:00:00Z"
  };
  const campaign = {
    schema_version: "0.4",
    attestation_policy: {
      trust_policy_ref: trustPolicyV07Ref,
      minimum_valid_attestations: 2,
      minimum_independence_groups: 2,
      require_distinct_key_ids: true
    }
  };
  const evaluate = (states, evaluatedAt) => evaluateVerifierTrustReadiness({
    campaign,
    repository: { key: repositoryBinding.repository_key, identity_fingerprint: repositoryBinding.identity_fingerprint },
    trustPolicy: trustPolicyV07,
    runtimePolicy,
    transparencyPolicy: { entry: transparencyPolicyRef, payload: policy },
    transparencyStates: states,
    evaluatedAt
  });
  const complete = evaluate([
    { entry: state1Wrapper.artifact_ref, payload: state1 },
    { entry: state2Ref, payload: state2 }
  ], "2026-07-22T10:03:00Z");
  assert.equal(complete.transparency_assurance.satisfied, true, complete.transparency_assurance.blocking_codes.join(", "));
  assert.equal(complete.transparency_assurance.sequence_number, 2);

  const shortAgeTrustPolicy = clone(trustPolicyV07);
  shortAgeTrustPolicy.transparency_assurance.max_state_age_seconds = 120;
  const shortAge = evaluateVerifierTrustReadiness({
    campaign,
    repository: { key: repositoryBinding.repository_key, identity_fingerprint: repositoryBinding.identity_fingerprint },
    trustPolicy: shortAgeTrustPolicy,
    runtimePolicy,
    transparencyPolicy: { entry: transparencyPolicyRef, payload: policy },
    transparencyStates: [
      { entry: state1Wrapper.artifact_ref, payload: state1 },
      { entry: state2Ref, payload: state2 }
    ],
    evaluatedAt: "2026-07-22T10:03:00Z"
  });
  assert.equal(shortAge.transparency_assurance.valid_until, "2026-07-22T10:04:00.000Z");

  const missingGenesis = evaluate([{ entry: state2Ref, payload: state2 }], "2026-07-22T10:03:00Z");
  assert(missingGenesis.transparency_assurance.blocking_codes.includes("TRUST_ADMISSION_TRANSPARENCY_LINEAGE_INVALID"));
  const stale = evaluate([
    { entry: state1Wrapper.artifact_ref, payload: state1 },
    { entry: state2Ref, payload: state2 }
  ], "2026-07-22T10:20:00Z");
  assert(stale.transparency_assurance.blocking_codes.includes("TRUST_ADMISSION_TRANSPARENCY_STATE_STALE"));
});

fixture("new contracts validate and unsafe root version is rejected", () => {
  for (const [payload, type] of [
    [policy, "transparency-policy"],
    [observation2, "transparency-observation"],
    [rotation, "trust-root-rotation"],
    [state2, "transparency-state"],
    [trustPolicyV07, "verifier-trust-policy"],
    [cycleOrderV07, "self-improvement-cycle-order"]
  ]) assert.equal(validatePayload(payload, type).valid, true, `${type} should validate`);
  const invalid = clone(rotation);
  invalid.next_tuf_root.signed.version = 4;
  invalid.rotation_sha256 = rotationDigest(invalid);
  const validation = validatePayload(invalid, "trust-root-rotation");
  assert.equal(validation.valid, false);
  assert(validation.issues.some(item => item.code === "TRUST_ROOT_ROTATION_VERSION_INVALID"));
});

function writeSamples() {
  const sampleDirectory = path.join(__dirname, "sample-payloads");
  const invalidRotation = clone(rotation);
  invalidRotation.next_tuf_root = makeTufRoot(3, tufNewKey, [tufOldKey, tufNewKey]);
  invalidRotation.next_tuf_root_sha256 = crypto.createHash("sha256").update(canonicalJsonBytes(invalidRotation.next_tuf_root)).digest("hex");
  invalidRotation.rotation_sha256 = rotationDigest(invalidRotation);
  const invalidState = clone(state2);
  invalidState.status = "ready";
  invalidState.blocking_codes = ["TRANSPARENCY_EQUIVOCATION_DETECTED"];
  invalidState.state_sha256 = stateDigest(invalidState);
  const invalidTrustPolicy = clone(trustPolicyV07);
  delete invalidTrustPolicy.transparency_assurance;
  const invalidCycleOrder = clone(cycleOrderV07);
  invalidCycleOrder.trust_policy_admission.transparency_assurance.state_ref = clone(NONE_ARTIFACT_REF);
  const samples = {
    "valid-transparency-policy.json": policy,
    "valid-transparency-observation.json": observation2,
    "valid-trust-root-rotation.json": rotation,
    "valid-transparency-state.json": state2,
    "valid-transparency-incident.json": sampleIncident,
    "valid-verifier-trust-policy-v0.7.json": trustPolicyV07,
    "valid-self-improvement-cycle-order-v0.7.json": cycleOrderV07,
    "invalid-trust-root-rotation-version-skip.json": invalidRotation,
    "invalid-transparency-state-false-ready.json": invalidState,
    "invalid-verifier-trust-policy-v0.7-missing-transparency.json": invalidTrustPolicy,
    "invalid-self-improvement-cycle-order-v0.7-false-transparency.json": invalidCycleOrder
  };
  for (const [name, payload] of Object.entries(samples)) {
    fs.writeFileSync(path.join(sampleDirectory, name), `${JSON.stringify(payload, null, 2)}\n`);
  }
}

if (process.argv.includes("--write-samples")) writeSamples();

process.stdout.write(`${JSON.stringify({ valid: true, fixture_count: fixtures.length, fixtures }, null, 2)}\n`);
