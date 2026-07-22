#!/usr/bin/env node

const crypto = require("crypto");
const { Metadata, MetadataKind } = require("@tufjs/models");
const { publicKeyId, strictBase64 } = require("./verification-attestation");
const { verifySigstoreTrustedRoot } = require("./sigstore-trusted-root");

const NONE_ARTIFACT_REF = Object.freeze({ artifact_id: "none", relative_path: "none", sha256: "none" });
const CHECKPOINT_CONTEXT = "Cannae-Transparency-Checkpoint-v1";
const OBSERVATION_CONTEXT = "Cannae-Transparency-Observation-v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJsonBytes(value) {
  return Buffer.from(JSON.stringify(canonicalValue(value)));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function artifactFileDigest(value) {
  return sha256(Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

function digestWithout(value, field) {
  const copy = clone(value);
  delete copy[field];
  return sha256(canonicalJsonBytes(copy));
}

function addCode(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameValue(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function validRef(ref) {
  return Boolean(ref && typeof ref.artifact_id === "string" && ref.artifact_id !== "none" &&
    typeof ref.relative_path === "string" && ref.relative_path !== "none" &&
    !ref.relative_path.startsWith("/") && !ref.relative_path.split(/[\\/]+/).includes("..") &&
    typeof ref.sha256 === "string" && /^[a-f0-9]{64}$/.test(ref.sha256));
}

function isNoneRef(ref) {
  return Boolean(ref && ref.artifact_id === "none" && ref.relative_path === "none" && ref.sha256 === "none");
}

function artifactRefKey(ref) {
  return ref ? `${ref.artifact_id}\u0000${ref.relative_path}\u0000${ref.sha256}` : "none";
}

function checkpointCore(checkpoint) {
  if (!checkpoint || typeof checkpoint !== "object") return null;
  return {
    log_id: checkpoint.log_id,
    origin: checkpoint.origin,
    tree_size: checkpoint.tree_size,
    root_hash: checkpoint.root_hash,
    issued_at: checkpoint.issued_at,
    key_id: checkpoint.key_id
  };
}

function checkpointBytes(checkpoint) {
  const core = checkpointCore(checkpoint);
  return Buffer.from([
    CHECKPOINT_CONTEXT,
    core.origin,
    core.log_id,
    String(core.tree_size),
    core.root_hash,
    core.issued_at,
    core.key_id,
    ""
  ].join("\n"));
}

function observationBytes(observation) {
  return Buffer.from(`${OBSERVATION_CONTEXT}\n${JSON.stringify(canonicalValue({
    policy_id: observation.policy_id,
    log_id: observation.log_id,
    previous_checkpoint: observation.previous_checkpoint,
    checkpoint: checkpointCore(observation.checkpoint),
    consistency_proof: observation.consistency_proof,
    observed_at: observation.observed_at,
    expires_at: observation.expires_at
  }))}\n`);
}

function observationDigest(observation) {
  return digestWithout(observation, "observation_sha256");
}

function rotationDigest(rotation) {
  return digestWithout(rotation, "rotation_sha256");
}

function incidentDigest(incident) {
  return digestWithout(incident, "incident_sha256");
}

function stateDigest(state) {
  return digestWithout(state, "state_sha256");
}

function hashNode(left, right) {
  return crypto.createHash("sha256").update(Buffer.concat([
    Buffer.from([1]),
    Buffer.from(left, "hex"),
    Buffer.from(right, "hex")
  ])).digest("hex");
}

function hashLeaf(value) {
  return crypto.createHash("sha256").update(Buffer.concat([Buffer.from([0]), Buffer.from(value)])).digest("hex");
}

function largestPowerOfTwoLessThan(value) {
  let power = 1;
  while (power * 2 < value) power *= 2;
  return power;
}

function merkleRootFromHashes(hashes) {
  if (!Array.isArray(hashes) || hashes.length === 0) return sha256(Buffer.alloc(0));
  if (hashes.length === 1) return hashes[0];
  const split = largestPowerOfTwoLessThan(hashes.length);
  return hashNode(merkleRootFromHashes(hashes.slice(0, split)), merkleRootFromHashes(hashes.slice(split)));
}

function consistencyProofFromHashes(hashes, oldSize) {
  if (!Number.isInteger(oldSize) || oldSize < 1 || oldSize > hashes.length) {
    throw new Error("oldSize must identify a non-empty prefix of the Merkle tree.");
  }
  const subproof = (prefixSize, nodes, complete) => {
    if (prefixSize === nodes.length) return complete ? [] : [merkleRootFromHashes(nodes)];
    const split = largestPowerOfTwoLessThan(nodes.length);
    if (prefixSize <= split) {
      return [...subproof(prefixSize, nodes.slice(0, split), complete), merkleRootFromHashes(nodes.slice(split))];
    }
    return [...subproof(prefixSize - split, nodes.slice(split), false), merkleRootFromHashes(nodes.slice(0, split))];
  };
  return oldSize === hashes.length ? [] : subproof(oldSize, hashes, true);
}

function verifyConsistencyProof(oldSize, newSize, oldRoot, newRoot, proof) {
  if (!Number.isSafeInteger(oldSize) || !Number.isSafeInteger(newSize) || oldSize < 0 || newSize < oldSize ||
      !/^[a-f0-9]{64}$/.test(oldRoot || "") || !/^[a-f0-9]{64}$/.test(newRoot || "") ||
      !Array.isArray(proof) || proof.some(item => !/^[a-f0-9]{64}$/.test(item))) return false;
  if (oldSize === 0) return proof.length === 0;
  if (oldSize === newSize) return proof.length === 0 && oldRoot === newRoot;

  let first = oldSize - 1;
  let second = newSize - 1;
  while (first % 2 === 1) {
    first = Math.floor(first / 2);
    second = Math.floor(second / 2);
  }
  let index = 0;
  let firstHash;
  let secondHash;
  if (first === 0) {
    firstHash = oldRoot;
    secondHash = oldRoot;
  } else {
    if (proof.length === 0) return false;
    firstHash = proof[index];
    secondHash = proof[index];
    index += 1;
  }
  for (; index < proof.length; index += 1) {
    if (second === 0) return false;
    const value = proof[index];
    if (first % 2 === 1 || first === second) {
      firstHash = hashNode(value, firstHash);
      secondHash = hashNode(value, secondHash);
      while (first !== 0 && first % 2 === 0) {
        first = Math.floor(first / 2);
        second = Math.floor(second / 2);
      }
    } else {
      secondHash = hashNode(secondHash, value);
    }
    first = Math.floor(first / 2);
    second = Math.floor(second / 2);
  }
  return second === 0 && firstHash === oldRoot && secondHash === newRoot;
}

function verifyEd25519(publicKeyPem, expectedKeyId, bytes, signatureBase64) {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    const signature = strictBase64(signatureBase64);
    return key.asymmetricKeyType === "ed25519" && publicKeyId(key) === expectedKeyId && signature &&
      crypto.verify(null, bytes, key, signature);
  } catch (error) {
    return false;
  }
}

function activeRegistryItem(item, at) {
  const start = timestamp(item && item.valid_from);
  const end = timestamp(item && item.valid_until);
  return Boolean(item && item.status === "active" && start !== null && end !== null && start <= at && at < end);
}

function verifyTransparencyObservation(options) {
  const observation = options.observation;
  const policy = options.policy;
  const expectedPrevious = options.expectedPrevious || null;
  const codes = [];
  const incidentCodes = [];
  if (!observation || observation.type !== "TransparencyObservation" || observation.schema_version !== "0.1") {
    addCode(codes, "TRANSPARENCY_OBSERVATION_STRUCTURE_INVALID");
  }
  if (!observation || observation.observation_sha256 !== observationDigest(observation)) {
    addCode(codes, "TRANSPARENCY_OBSERVATION_DIGEST_INVALID");
  }
  if (!policy || policy.type !== "TransparencyPolicy" || observation.policy_id !== policy.id) {
    addCode(codes, "TRANSPARENCY_OBSERVATION_POLICY_MISMATCH");
  }
  const log = policy && (policy.logs || []).find(item => item.id === (observation && observation.log_id));
  if (!log) addCode(codes, "TRANSPARENCY_LOG_NOT_AUTHORIZED");
  const observedAt = timestamp(observation && observation.observed_at);
  const expiresAt = timestamp(observation && observation.expires_at);
  const checkpoint = observation && observation.checkpoint;
  const checkpointTime = timestamp(checkpoint && checkpoint.issued_at);
  if (observedAt === null || expiresAt === null || checkpointTime === null || expiresAt <= observedAt || checkpointTime > observedAt) {
    addCode(codes, "TRANSPARENCY_OBSERVATION_TIME_INVALID");
  }
  if (log && observedAt !== null && checkpointTime !== null &&
      observedAt - checkpointTime > log.max_checkpoint_age_seconds * 1000) {
    addCode(codes, "TRANSPARENCY_CHECKPOINT_STALE");
  }
  if (policy && observedAt !== null && expiresAt !== null &&
      expiresAt - observedAt > policy.max_state_age_seconds * 1000) {
    addCode(codes, "TRANSPARENCY_OBSERVATION_WINDOW_TOO_LONG");
  }
  if (!checkpoint || !log || checkpoint.log_id !== log.id || checkpoint.origin !== log.origin ||
      checkpoint.key_id !== log.key_id || !Number.isSafeInteger(checkpoint.tree_size) || checkpoint.tree_size < 1 ||
      !/^[a-f0-9]{64}$/.test(checkpoint.root_hash || "") ||
      !verifyEd25519(log.public_key_pem, log.key_id, checkpointBytes(checkpoint), checkpoint.signature_base64)) {
    addCode(codes, "TRANSPARENCY_CHECKPOINT_SIGNATURE_INVALID");
  }

  const previous = observation && observation.previous_checkpoint;
  if (expectedPrevious) {
    if (!sameValue(previous, checkpointCore(expectedPrevious))) {
      addCode(codes, "TRANSPARENCY_PREVIOUS_CHECKPOINT_MISMATCH");
    } else if (checkpoint && checkpoint.tree_size < previous.tree_size) {
      addCode(codes, "TRANSPARENCY_CHECKPOINT_ROLLBACK");
      addCode(incidentCodes, "checkpoint_rollback");
    } else if (checkpoint && checkpoint.tree_size === previous.tree_size && checkpoint.root_hash !== previous.root_hash) {
      addCode(codes, "TRANSPARENCY_EQUIVOCATION_DETECTED");
      addCode(incidentCodes, "equivocation");
    } else if (checkpoint && checkpoint.tree_size === previous.tree_size) {
      if ((observation.consistency_proof && observation.consistency_proof.hashes || []).length !== 0) {
        addCode(codes, "TRANSPARENCY_CONSISTENCY_PROOF_INVALID");
      }
    } else if (checkpoint && !verifyConsistencyProof(
      previous.tree_size,
      checkpoint.tree_size,
      previous.root_hash,
      checkpoint.root_hash,
      observation.consistency_proof && observation.consistency_proof.hashes
    )) {
      addCode(codes, "TRANSPARENCY_CONSISTENCY_PROOF_INVALID");
      addCode(incidentCodes, "consistency_failure");
    }
  } else if (!isNoneRef(previous) && previous !== "none") {
    addCode(codes, "TRANSPARENCY_GENESIS_PREVIOUS_INVALID");
  }
  const proof = observation && observation.consistency_proof;
  if (!proof || proof.algorithm !== "rfc6962_sha256" ||
      proof.sha256 !== sha256(canonicalJsonBytes(proof.hashes || []))) {
    addCode(codes, "TRANSPARENCY_CONSISTENCY_PROOF_DIGEST_INVALID");
  }

  const witnessRegistry = new Map((policy && policy.witnesses || []).map(item => [item.id, item]));
  const monitorRegistry = new Map((policy && policy.monitors || []).map(item => [item.id, item]));
  const witnessIds = new Set();
  const witnessOperators = new Set();
  for (const signature of observation && observation.witness_signatures || []) {
    const witness = witnessRegistry.get(signature.witness_id);
    if (!witness || !log || !(log.witness_ids || []).includes(witness.id) || witnessIds.has(witness.id) ||
        checkpointTime === null || observedAt === null || signature.observed_at !== observation.observed_at ||
        !activeRegistryItem(witness, checkpointTime) || !activeRegistryItem(witness, observedAt) ||
        signature.key_id !== witness.key_id ||
        !verifyEd25519(witness.public_key_pem, witness.key_id, checkpointBytes(checkpoint), signature.signature_base64)) {
      addCode(codes, "TRANSPARENCY_WITNESS_SIGNATURE_INVALID");
      continue;
    }
    witnessIds.add(witness.id);
    witnessOperators.add(witness.operator_id);
  }
  const monitorIds = new Set();
  const monitorOperators = new Set();
  for (const signature of observation && observation.monitor_signatures || []) {
    const monitor = monitorRegistry.get(signature.monitor_id);
    if (!monitor || !log || !(log.monitor_ids || []).includes(monitor.id) || monitorIds.has(monitor.id) ||
        observedAt === null || signature.observed_at !== observation.observed_at ||
        !activeRegistryItem(monitor, observedAt) || signature.key_id !== monitor.key_id ||
        !verifyEd25519(monitor.public_key_pem, monitor.key_id, observationBytes(observation), signature.signature_base64)) {
      addCode(codes, "TRANSPARENCY_MONITOR_SIGNATURE_INVALID");
      continue;
    }
    monitorIds.add(monitor.id);
    monitorOperators.add(monitor.operator_id);
  }
  if (log && (witnessIds.size < log.minimum_witnesses || witnessOperators.size < log.minimum_witness_operators)) {
    addCode(codes, "TRANSPARENCY_WITNESS_QUORUM_UNAVAILABLE");
  }
  if (log && (monitorIds.size < log.minimum_monitors || monitorOperators.size < log.minimum_monitor_operators)) {
    addCode(codes, "TRANSPARENCY_MONITOR_QUORUM_UNAVAILABLE");
  }
  return {
    valid: codes.length === 0,
    codes: codes.sort(),
    incident_codes: incidentCodes.sort(),
    checkpoint: checkpointCore(checkpoint),
    witness_ids: [...witnessIds].sort(),
    witness_operator_ids: [...witnessOperators].sort(),
    monitor_ids: [...monitorIds].sort(),
    monitor_operator_ids: [...monitorOperators].sort(),
    valid_until: codes.length === 0 && expiresAt !== null ? new Date(expiresAt).toISOString() : "none"
  };
}

function parseTufRoot(value) {
  return Metadata.fromJSON(MetadataKind.Root, clone(value));
}

function verifyTrustRootRotation(options) {
  const rotation = options.rotation;
  const previousRootArtifact = options.previousRootArtifact;
  const nextRootArtifact = options.nextRootArtifact;
  const codes = [];
  if (!rotation || rotation.type !== "TrustRootRotation" || rotation.schema_version !== "0.1") {
    addCode(codes, "TRUST_ROOT_ROTATION_STRUCTURE_INVALID");
  }
  if (!rotation || rotation.rotation_sha256 !== rotationDigest(rotation)) {
    addCode(codes, "TRUST_ROOT_ROTATION_DIGEST_INVALID");
  }
  if (!rotation || rotation.approved_by !== "USER") addCode(codes, "TRUST_ROOT_ROTATION_AUTHORITY_INVALID");
  const approvedAt = timestamp(rotation && rotation.approved_at);
  const effectiveAt = timestamp(rotation && rotation.effective_at);
  if (approvedAt === null || effectiveAt === null || effectiveAt < approvedAt) {
    addCode(codes, "TRUST_ROOT_ROTATION_TIME_INVALID");
  }
  let previousMetadata = null;
  let nextMetadata = null;
  let nextRootExpiry = null;
  try {
    previousMetadata = parseTufRoot(rotation.previous_tuf_root);
    nextMetadata = parseTufRoot(rotation.next_tuf_root);
    previousMetadata.verifyDelegate(MetadataKind.Root, previousMetadata);
    previousMetadata.verifyDelegate(MetadataKind.Root, nextMetadata);
    nextMetadata.verifyDelegate(MetadataKind.Root, nextMetadata);
    if (nextMetadata.signed.version !== previousMetadata.signed.version + 1) {
      addCode(codes, "TRUST_ROOT_ROTATION_VERSION_INVALID");
    }
    if (nextMetadata.signed.isExpired(new Date(rotation.effective_at))) {
      addCode(codes, "TRUST_ROOT_ROTATION_EXPIRED");
    }
    nextRootExpiry = timestamp(nextMetadata.signed.expires);
    if (nextRootExpiry === null) addCode(codes, "TRUST_ROOT_ROTATION_EXPIRED");
    for (const keyId of rotation.revoked_tuf_root_key_ids || []) {
      if (nextMetadata.signed.keys[keyId] || (nextMetadata.signed.roles.root.keyIDs || []).includes(keyId)) {
        addCode(codes, "TRUST_ROOT_ROTATION_REVOKED_KEY_RETAINED");
      }
    }
  } catch (error) {
    addCode(codes, "TRUST_ROOT_ROTATION_TUF_CHAIN_INVALID");
  }
  if (rotation && rotation.previous_tuf_root_sha256 !== sha256(canonicalJsonBytes(rotation.previous_tuf_root)) ||
      rotation.next_tuf_root_sha256 !== sha256(canonicalJsonBytes(rotation.next_tuf_root))) {
    addCode(codes, "TRUST_ROOT_ROTATION_TUF_DIGEST_INVALID");
  }
  const previousResult = verifySigstoreTrustedRoot(previousRootArtifact);
  const nextResult = verifySigstoreTrustedRoot(nextRootArtifact);
  const previousRetrievedAt = timestamp(previousRootArtifact && previousRootArtifact.source && previousRootArtifact.source.retrieved_at);
  const nextRetrievedAt = timestamp(nextRootArtifact && nextRootArtifact.source && nextRootArtifact.source.retrieved_at);
  if (approvedAt === null || effectiveAt === null || previousRetrievedAt === null || nextRetrievedAt === null ||
      previousRetrievedAt > approvedAt || nextRetrievedAt > effectiveAt) {
    addCode(codes, "TRUST_ROOT_ROTATION_TIME_INVALID");
  }
  if (!previousResult.valid || !nextResult.valid || !validRef(rotation && rotation.previous_trusted_root_ref) ||
      !validRef(rotation && rotation.next_trusted_root_ref) ||
      rotation.previous_trusted_root_ref.artifact_id !== (previousRootArtifact && previousRootArtifact.id) ||
      rotation.next_trusted_root_ref.artifact_id !== (nextRootArtifact && nextRootArtifact.id) ||
      rotation.previous_trusted_root_ref.sha256 !== artifactFileDigest(previousRootArtifact) ||
      rotation.next_trusted_root_ref.sha256 !== artifactFileDigest(nextRootArtifact) ||
      rotation.previous_trusted_root_sha256 !== (previousRootArtifact && previousRootArtifact.trusted_root_sha256) ||
      rotation.next_trusted_root_sha256 !== (nextRootArtifact && nextRootArtifact.trusted_root_sha256) ||
      rotation.previous_trusted_root_ref.artifact_id === rotation.next_trusted_root_ref.artifact_id) {
    addCode(codes, "TRUST_ROOT_ROTATION_TARGET_BINDING_INVALID");
  }
  if (rotation && rotation.reason === "compromise" && (rotation.revoked_tuf_root_key_ids || []).length === 0) {
    addCode(codes, "TRUST_ROOT_ROTATION_COMPROMISE_REVOCATION_REQUIRED");
  }
  return {
    valid: codes.length === 0,
    codes: codes.sort(),
    previous_tuf_root_version: previousMetadata ? previousMetadata.signed.version : 0,
    next_tuf_root_version: nextMetadata ? nextMetadata.signed.version : 0,
    next_tuf_root_expires_at: nextRootExpiry !== null
      ? new Date(nextRootExpiry).toISOString()
      : "none"
  };
}

function verifyTransparencyIncident(incident) {
  const codes = [];
  if (!incident || incident.type !== "TransparencyIncident" || incident.schema_version !== "0.1") {
    addCode(codes, "TRANSPARENCY_INCIDENT_STRUCTURE_INVALID");
  }
  if (!incident || incident.incident_sha256 !== incidentDigest(incident)) {
    addCode(codes, "TRANSPARENCY_INCIDENT_DIGEST_INVALID");
  }
  if (!incident || incident.authority !== "USER" || timestamp(incident.detected_at) === null) {
    addCode(codes, "TRANSPARENCY_INCIDENT_AUTHORITY_INVALID");
  }
  if (incident && incident.status === "resolved") {
    if (!validRef(incident.supersedes_incident_ref) || !incident.resolution || incident.resolution.authority !== "USER" ||
        timestamp(incident.resolution.resolved_at) === null ||
        timestamp(incident.resolution.resolved_at) < timestamp(incident.detected_at) ||
        !Array.isArray(incident.resolution.evidence_refs) || incident.resolution.evidence_refs.length === 0 ||
        incident.resolution.evidence_refs.some(ref => !validRef(ref))) {
      addCode(codes, "TRANSPARENCY_INCIDENT_RESOLUTION_INVALID");
    }
  } else if (incident && (incident.resolution !== undefined || incident.supersedes_incident_ref !== undefined)) {
    addCode(codes, "TRANSPARENCY_INCIDENT_PREMATURE_RESOLUTION");
  }
  return { valid: codes.length === 0, codes: codes.sort() };
}

function artifactWrapperValid(wrapper, field) {
  return Boolean(wrapper && validRef(wrapper.artifact_ref) && wrapper[field] &&
    wrapper.artifact_ref.artifact_id === wrapper[field].id &&
    wrapper.artifact_ref.sha256 === artifactFileDigest(wrapper[field]));
}

function buildTransparencyState(options) {
  const policy = options.policy;
  const previousWrapper = options.previousState || null;
  const previousState = previousWrapper && previousWrapper.state;
  const generatedAt = options.generatedAt || new Date().toISOString();
  const generatedTime = timestamp(generatedAt);
  const codes = [];
  if (!policy || policy.type !== "TransparencyPolicy" || policy.schema_version !== "0.1") {
    throw new Error("TransparencyPolicy v0.1 is required.");
  }
  if (generatedTime === null) throw new Error("generatedAt must be a valid timestamp.");
  const validUntilCandidates = [];
  const policyStart = timestamp(policy.created_at);
  const policyEnd = timestamp(policy.expires_at);
  if (policyStart === null || policyEnd === null || generatedTime < policyStart || generatedTime >= policyEnd) {
    addCode(codes, "TRANSPARENCY_POLICY_INACTIVE");
  }
  if (options.trustPolicyId !== policy.trust_policy_id) {
    addCode(codes, "TRANSPARENCY_TRUST_POLICY_MISMATCH");
  }
  if (!sameValue(options.repositoryBinding, policy.repository_binding)) {
    addCode(codes, "TRANSPARENCY_REPOSITORY_BINDING_MISMATCH");
  }
  if (policyEnd !== null) validUntilCandidates.push(policyEnd);
  const sequenceNumber = previousState ? previousState.sequence_number + 1 : 1;
  const previousStateRef = previousState ? clone(previousWrapper.artifact_ref) : clone(NONE_ARTIFACT_REF);
  const previousGeneratedTime = timestamp(previousState && previousState.generated_at);
  if (previousState && (!artifactWrapperValid(previousWrapper, "state") || previousState.stream_id !== policy.state_stream_id ||
      previousState.policy_id !== policy.id)) {
    addCode(codes, "TRANSPARENCY_PREVIOUS_STATE_INVALID");
  }
  if (previousState && (previousGeneratedTime === null || generatedTime <= previousGeneratedTime)) {
    addCode(codes, "TRANSPARENCY_STATE_TIME_ROLLBACK");
  }

  const trustedRootWrappers = (options.trustedRoots || []).map(clone);
  const rootById = new Map();
  if (previousState) {
    for (const root of previousState.trusted_roots || []) rootById.set(root.id, clone(root));
  } else {
    for (const configured of policy.trusted_roots || []) {
      const wrapper = trustedRootWrappers.find(item => item.artifact_ref.artifact_id === configured.trusted_root_ref.artifact_id);
      if (!wrapper || !artifactWrapperValid(wrapper, "trusted_root") ||
          !verifySigstoreTrustedRoot(wrapper.trusted_root).valid ||
          timestamp(wrapper.trusted_root.source && wrapper.trusted_root.source.retrieved_at) > generatedTime ||
          !sameValue(wrapper.artifact_ref, configured.trusted_root_ref) ||
          wrapper.trusted_root.trusted_root_sha256 !== configured.trusted_root_sha256) {
        addCode(codes, "TRANSPARENCY_INITIAL_ROOT_INVALID");
        continue;
      }
      rootById.set(configured.id, {
        id: configured.id,
        trusted_root_ref: clone(configured.trusted_root_ref),
        trusted_root_sha256: configured.trusted_root_sha256,
        tuf_root_version: configured.tuf_root_version,
        tuf_root_expires_at: configured.tuf_root_expires_at
      });
    }
  }

  const rootRotationWrappers = (options.rootRotations || []).map(clone);
  for (const wrapper of rootRotationWrappers) {
    if (!artifactWrapperValid(wrapper, "rotation") || !wrapper.previous_trusted_root || !wrapper.next_trusted_root) {
      addCode(codes, "TRUST_ROOT_ROTATION_REFERENCE_INVALID");
      continue;
    }
    const result = verifyTrustRootRotation({
      rotation: wrapper.rotation,
      previousRootArtifact: wrapper.previous_trusted_root,
      nextRootArtifact: wrapper.next_trusted_root
    });
    for (const code of result.codes) addCode(codes, code);
    if (wrapper.rotation.policy_id !== policy.id) addCode(codes, "TRUST_ROOT_ROTATION_POLICY_MISMATCH");
    const effectiveTime = timestamp(wrapper.rotation.effective_at);
    if (effectiveTime === null || effectiveTime > generatedTime) {
      addCode(codes, "TRUST_ROOT_ROTATION_NOT_EFFECTIVE");
      continue;
    }
    const current = [...rootById.values()].find(root =>
      root.trusted_root_ref.artifact_id === wrapper.rotation.previous_trusted_root_ref.artifact_id);
    if (!current || current.tuf_root_version !== result.previous_tuf_root_version) {
      addCode(codes, "TRUST_ROOT_ROTATION_LINEAGE_INVALID");
      continue;
    }
    rootById.delete(current.id);
    rootById.set(current.id, {
      id: current.id,
      trusted_root_ref: clone(wrapper.rotation.next_trusted_root_ref),
      trusted_root_sha256: wrapper.rotation.next_trusted_root_sha256,
      tuf_root_version: result.next_tuf_root_version,
      tuf_root_expires_at: result.next_tuf_root_expires_at
    });
  }

  for (const root of rootById.values()) {
    const rootExpiry = timestamp(root.tuf_root_expires_at);
    if (rootExpiry === null || rootExpiry <= generatedTime) {
      addCode(codes, "TRANSPARENCY_TUF_ROOT_EXPIRED");
    } else {
      validUntilCandidates.push(rootExpiry);
    }
  }

  const observationWrappers = (options.observations || []).map(clone);
  const logStates = [];
  for (const log of policy.logs || []) {
    const wrapper = observationWrappers.find(item => item.observation && item.observation.log_id === log.id);
    const previousLog = previousState && (previousState.logs || []).find(item => item.log_id === log.id);
    if (!wrapper || !artifactWrapperValid(wrapper, "observation")) {
      addCode(codes, "TRANSPARENCY_LOG_OBSERVATION_MISSING");
      continue;
    }
    const result = verifyTransparencyObservation({
      observation: wrapper.observation,
      policy,
      expectedPrevious: previousLog && previousLog.checkpoint
    });
    for (const code of result.codes) addCode(codes, code);
    for (const incidentCode of result.incident_codes) addCode(codes, `TRANSPARENCY_INCIDENT_REQUIRED_${incidentCode.toUpperCase()}`);
    const observationTime = timestamp(wrapper.observation.observed_at);
    const observationExpiry = timestamp(wrapper.observation.expires_at);
    if (observationTime === null || observationExpiry === null || observationTime > generatedTime ||
        generatedTime >= observationExpiry ||
        (previousGeneratedTime !== null && observationTime < previousGeneratedTime)) {
      addCode(codes, "TRANSPARENCY_OBSERVATION_STATE_TIME_INVALID");
    }
    const boundary = timestamp(result.valid_until);
    if (boundary !== null) validUntilCandidates.push(boundary);
    logStates.push({
      log_id: log.id,
      observation_ref: clone(wrapper.artifact_ref),
      checkpoint: result.checkpoint,
      witness_ids: result.witness_ids,
      witness_operator_ids: result.witness_operator_ids,
      monitor_ids: result.monitor_ids,
      monitor_operator_ids: result.monitor_operator_ids,
      status: result.valid ? "consistent" : "blocked",
      blocking_codes: result.codes
    });
  }
  if (observationWrappers.length !== (policy.logs || []).length) addCode(codes, "TRANSPARENCY_OBSERVATION_SET_INVALID");

  const incidentWrappers = (options.incidents || []).map(clone);
  const incidentStates = [];
  const revoked = new Set();
  const incidentByRef = new Map();
  const supersededIncidentRefs = new Set();
  const incidentIds = incidentWrappers.map(wrapper => wrapper.incident && wrapper.incident.id).filter(Boolean);
  const incidentRefs = incidentWrappers.map(wrapper => artifactRefKey(wrapper.artifact_ref));
  if (new Set(incidentIds).size !== incidentIds.length || new Set(incidentRefs).size !== incidentRefs.length) {
    addCode(codes, "TRANSPARENCY_INCIDENT_SET_INVALID");
  }
  for (const wrapper of incidentWrappers) {
    if (artifactWrapperValid(wrapper, "incident")) {
      incidentByRef.set(artifactRefKey(wrapper.artifact_ref), wrapper);
    }
  }
  for (const previousIncident of previousState ? previousState.incidents || [] : []) {
    if (!incidentWrappers.some(wrapper => sameValue(wrapper.artifact_ref, previousIncident.incident_ref))) {
      addCode(codes, "TRANSPARENCY_INCIDENT_HISTORY_DROPPED");
    }
  }
  for (const wrapper of incidentWrappers) {
    const incident = wrapper.incident;
    if (!incident || incident.status !== "resolved") continue;
    const resolvedTime = timestamp(incident.resolution && incident.resolution.resolved_at);
    if (resolvedTime === null || resolvedTime > generatedTime) continue;
    const targetRefKey = artifactRefKey(incident.supersedes_incident_ref);
    const target = incidentByRef.get(targetRefKey);
    const targetDetectedTime = timestamp(target && target.incident.detected_at);
    const resolutionDetectedTime = timestamp(incident.detected_at);
    if (!target || !["open", "contained"].includes(target.incident.status) ||
        target.incident.policy_id !== incident.policy_id || target.incident.kind !== incident.kind ||
        targetDetectedTime === null || resolutionDetectedTime === null ||
        resolutionDetectedTime < targetDetectedTime || resolvedTime < targetDetectedTime ||
        supersededIncidentRefs.has(targetRefKey)) {
      addCode(codes, "TRANSPARENCY_INCIDENT_SUPERSESSION_INVALID");
    } else {
      supersededIncidentRefs.add(targetRefKey);
    }
  }
  for (const wrapper of incidentWrappers) {
    if (!artifactWrapperValid(wrapper, "incident")) {
      addCode(codes, "TRANSPARENCY_INCIDENT_REFERENCE_INVALID");
      continue;
    }
    const result = verifyTransparencyIncident(wrapper.incident);
    for (const code of result.codes) addCode(codes, code);
    if (wrapper.incident.policy_id !== policy.id) addCode(codes, "TRANSPARENCY_INCIDENT_POLICY_MISMATCH");
    const detectedTime = timestamp(wrapper.incident.detected_at);
    const resolvedTime = timestamp(wrapper.incident.resolution && wrapper.incident.resolution.resolved_at);
    if (detectedTime === null || detectedTime > generatedTime ||
        (wrapper.incident.status === "resolved" && (resolvedTime === null || resolvedTime > generatedTime))) {
      addCode(codes, "TRANSPARENCY_INCIDENT_TIME_INVALID");
    }
    if (["open", "contained"].includes(wrapper.incident.status) &&
        !supersededIncidentRefs.has(artifactRefKey(wrapper.artifact_ref))) addCode(codes, "TRANSPARENCY_INCIDENT_ACTIVE");
    for (const revocation of wrapper.incident.revocations || []) {
      if (timestamp(revocation.effective_at) !== null && timestamp(revocation.effective_at) <= generatedTime) {
        revoked.add(`${revocation.subject_type}:${revocation.subject_id}`);
      }
    }
    incidentStates.push({
      incident_id: wrapper.incident.id,
      incident_ref: clone(wrapper.artifact_ref),
      kind: wrapper.incident.kind,
      status: wrapper.incident.status,
      revocations: clone(wrapper.incident.revocations || [])
    });
  }
  for (const log of policy.logs || []) {
    if (revoked.has(`log:${log.id}`) || revoked.has(`key:${log.key_id}`)) addCode(codes, "TRANSPARENCY_ACTIVE_LOG_REVOKED");
  }
  for (const witness of policy.witnesses || []) {
    if (revoked.has(`witness:${witness.id}`) || revoked.has(`key:${witness.key_id}`)) addCode(codes, "TRANSPARENCY_ACTIVE_WITNESS_REVOKED");
  }
  for (const monitor of policy.monitors || []) {
    if (revoked.has(`monitor:${monitor.id}`) || revoked.has(`key:${monitor.key_id}`)) addCode(codes, "TRANSPARENCY_ACTIVE_MONITOR_REVOKED");
  }
  for (const root of rootById.values()) {
    if (revoked.has(`trusted_root:${root.id}`)) addCode(codes, "TRANSPARENCY_ACTIVE_ROOT_REVOKED");
  }

  const state = {
    schema_version: "0.1",
    type: "TransparencyState",
    id: options.stateId,
    stream_id: policy.state_stream_id,
    sequence_number: sequenceNumber,
    policy_id: policy.id,
    trust_policy_id: options.trustPolicyId,
    repository_binding: clone(options.repositoryBinding),
    previous_state_ref: previousStateRef,
    trusted_roots: [...rootById.values()].sort((left, right) => left.id.localeCompare(right.id)),
    logs: logStates.sort((left, right) => left.log_id.localeCompare(right.log_id)),
    incidents: incidentStates.sort((left, right) => left.incident_id.localeCompare(right.incident_id)),
    evidence: {
      trusted_roots: trustedRootWrappers,
      observations: observationWrappers,
      root_rotations: rootRotationWrappers,
      incidents: incidentWrappers
    },
    status: codes.length === 0 ? "ready" : "blocked",
    blocking_codes: codes.sort(),
    generated_at: generatedAt,
    valid_until: codes.length === 0 ? new Date(Math.min(...validUntilCandidates)).toISOString() : "none"
  };
  state.state_sha256 = stateDigest(state);
  return state;
}

function verifyTransparencyState(options) {
  const state = options.state;
  const codes = [];
  if (!state || state.type !== "TransparencyState" || state.schema_version !== "0.1") {
    addCode(codes, "TRANSPARENCY_STATE_STRUCTURE_INVALID");
  }
  if (!state || state.state_sha256 !== stateDigest(state)) addCode(codes, "TRANSPARENCY_STATE_DIGEST_INVALID");
  let expected = null;
  try {
    expected = buildTransparencyState({
      policy: options.policy,
      previousState: options.previousState ? {
        artifact_ref: state.previous_state_ref,
        state: options.previousState
      } : null,
      trustedRoots: state.evidence.trusted_roots,
      observations: state.evidence.observations,
      rootRotations: state.evidence.root_rotations,
      incidents: state.evidence.incidents,
      trustPolicyId: state.trust_policy_id,
      repositoryBinding: state.repository_binding,
      generatedAt: state.generated_at,
      stateId: state.id
    });
  } catch (error) {
    addCode(codes, "TRANSPARENCY_STATE_RECONSTRUCTION_FAILED");
  }
  if (expected && !sameValue(expected, state)) addCode(codes, "TRANSPARENCY_STATE_PROJECTION_MISMATCH");
  const evaluatedAt = timestamp(options.evaluatedAt || new Date().toISOString());
  const validUntil = timestamp(state && state.valid_until);
  if (options.requireReady !== false &&
      (evaluatedAt === null || validUntil === null || evaluatedAt >= validUntil || state.status !== "ready")) {
    addCode(codes, "TRANSPARENCY_STATE_NOT_READY");
  }
  return {
    valid: codes.length === 0,
    codes: codes.sort(),
    state_id: state && state.id,
    stream_id: state && state.stream_id,
    sequence_number: state && state.sequence_number,
    valid_until: codes.length === 0 ? state.valid_until : "none",
    log_count: state && Array.isArray(state.logs) ? state.logs.length : 0,
    witness_count: state && Array.isArray(state.logs)
      ? new Set(state.logs.flatMap(item => item.witness_ids || [])).size : 0,
    monitor_count: state && Array.isArray(state.logs)
      ? new Set(state.logs.flatMap(item => item.monitor_ids || [])).size : 0,
    incident_count: state && Array.isArray(state.incidents) ? state.incidents.length : 0
  };
}

module.exports = {
  CHECKPOINT_CONTEXT,
  NONE_ARTIFACT_REF,
  artifactFileDigest,
  buildTransparencyState,
  canonicalJsonBytes,
  checkpointBytes,
  checkpointCore,
  consistencyProofFromHashes,
  hashLeaf,
  merkleRootFromHashes,
  observationBytes,
  observationDigest,
  rotationDigest,
  incidentDigest,
  stateDigest,
  verifyConsistencyProof,
  verifyTransparencyIncident,
  verifyTransparencyObservation,
  verifyTransparencyState,
  verifyTrustRootRotation
};
