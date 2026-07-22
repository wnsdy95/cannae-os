#!/usr/bin/env node

const crypto = require("crypto");

const DSSE_PAYLOAD_TYPE = "application/vnd.in-toto+json";
const STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
const PREDICATE_TYPE = "https://cannae.dev/attestations/verification-receipt/v0.3";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalBytes(value, omittedKey) {
  const copy = JSON.parse(JSON.stringify(value));
  if (omittedKey) delete copy[omittedKey];
  return Buffer.from(`${JSON.stringify(copy, null, 2)}\n`);
}

function attestationDigest(attestation) {
  return sha256(canonicalBytes(attestation, "attestation_sha256"));
}

function publicKeyId(publicKey) {
  const key = publicKey && publicKey.type === "public" ? publicKey : crypto.createPublicKey(publicKey);
  return sha256(key.export({ type: "spki", format: "der" }));
}

function preAuthEncoding(payloadType, payload) {
  const typeBytes = Buffer.from(payloadType);
  const payloadBytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${typeBytes.length} `),
    typeBytes,
    Buffer.from(` ${payloadBytes.length} `),
    payloadBytes
  ]);
}

function strictBase64(value) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  return bytes.toString("base64") === value ? bytes : null;
}

function isValidTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function verifierAllowsReceiptAttestation(verifier) {
  return verifier.allowed_attestation_types === undefined ||
    (Array.isArray(verifier.allowed_attestation_types) && verifier.allowed_attestation_types.includes("verification_receipt"));
}

function validArtifactRef(ref) {
  return Boolean(ref && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref.artifact_id || "") &&
    typeof ref.relative_path === "string" && ref.relative_path.length > 0 &&
    !ref.relative_path.startsWith("/") && !ref.relative_path.split(/[\\/]+/).includes("..") &&
    /^[a-f0-9]{64}$/.test(ref.sha256 || ""));
}

function sameArtifactRef(left, right) {
  return Boolean(left && right && left.artifact_id === right.artifact_id &&
    left.relative_path === right.relative_path && left.sha256 === right.sha256);
}

function executionEvidenceItem(ref, collection) {
  const values = collection instanceof Map ? [...collection.values()] : (collection || []);
  return values.find(item => {
    const payload = item && item.payload ? item.payload : item;
    const entry = item && item.entry;
    return payload && payload.id === (ref && ref.artifact_id) && (!entry ||
      (entry.artifact_id === ref.artifact_id && entry.relative_path === ref.relative_path && entry.sha256 === ref.sha256));
  }) || null;
}

function createVerificationAttestation(options) {
  const { receipt, receiptReference, verifier, privateKeyPem } = options;
  if (!receipt || receipt.type !== "VerificationReceipt") throw new Error("A verification receipt is required.");
  if (!receiptReference || receiptReference.artifact_id !== receipt.id || !/^[a-f0-9]{64}$/.test(receiptReference.sha256 || "")) {
    throw new Error("The receipt reference must bind the persisted receipt ID and SHA-256 digest.");
  }
  if (!verifier || verifier.status !== "active") throw new Error("The selected verifier is not active.");
  if (!verifierAllowsReceiptAttestation(verifier)) {
    throw new Error("The selected verifier is not authorized to attest verification receipts.");
  }
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Verifier private key must be Ed25519.");
  const derivedPublicKey = crypto.createPublicKey(privateKey);
  const derivedKeyId = publicKeyId(derivedPublicKey);
  if (derivedKeyId !== verifier.key_id || derivedKeyId !== publicKeyId(verifier.public_key_pem)) {
    throw new Error("Verifier private key does not match the trusted public-key identity.");
  }

  const issuedAt = options.issuedAt || new Date().toISOString();
  const expiresAt = options.expiresAt;
  if (!isValidTimestamp(issuedAt) || !isValidTimestamp(expiresAt) || Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new Error("Attestation expiry must be later than its issue time.");
  }
  const executionOrigin = options.executionOrigin || "remote";
  if (!(verifier.allowed_execution_origins || []).includes(executionOrigin)) {
    throw new Error("Execution origin is not authorized for this verifier.");
  }
  const invocationId = String(options.invocationId || "");
  if (!invocationId) throw new Error("A verifier invocation ID is required.");
  const nonce = String(options.nonce || crypto.randomUUID());
  const executionEvidenceRef = options.executionEvidenceReference;
  if (executionEvidenceRef && !validArtifactRef(executionEvidenceRef)) {
    throw new Error("Execution evidence requires an exact artifact reference.");
  }
  const schemaVersion = executionEvidenceRef ? "0.2" : "0.1";

  const statement = {
    _type: STATEMENT_TYPE,
    subject: [{ name: receipt.id, digest: { sha256: receiptReference.sha256 } }],
    predicateType: PREDICATE_TYPE,
    predicate: {
      schema_version: schemaVersion,
      receipt: {
        id: receipt.id,
        relative_path: receiptReference.relative_path,
        plan_id: receipt.plan_id,
        receipt_sha256: receipt.receipt_sha256,
        candidate_id: receipt.candidate_id,
        candidate_revision: receipt.candidate_revision,
        campaign_id: receipt.campaign_id,
        mission_id: receipt.mission_id,
        cycle_number: receipt.cycle_number
      },
      repository_binding: receipt.repository_binding,
      verifier: {
        id: verifier.id,
        key_id: verifier.key_id,
        independence_group: verifier.independence_group,
        execution_origin: executionOrigin,
        invocation_id: invocationId
      },
      ...(executionEvidenceRef ? { execution_evidence_ref: JSON.parse(JSON.stringify(executionEvidenceRef)) } : {}),
      issued_at: issuedAt,
      expires_at: expiresAt,
      nonce
    }
  };
  const payload = canonicalBytes(statement);
  const signature = crypto.sign(null, preAuthEncoding(DSSE_PAYLOAD_TYPE, payload), privateKey);
  const envelope = {
    payloadType: DSSE_PAYLOAD_TYPE,
    payload: payload.toString("base64"),
    signatures: [{ keyid: verifier.key_id, sig: signature.toString("base64") }]
  };
  const attestation = {
    schema_version: schemaVersion,
    type: "VerificationAttestation",
    id: `VAT-${sha256(`${receipt.id}\n${verifier.id}\n${invocationId}\n${nonce}`).slice(0, 24)}`,
    receipt_id: receipt.id,
    receipt_relative_path: receiptReference.relative_path,
    receipt_sha256: receiptReference.sha256,
    campaign_id: receipt.campaign_id,
    mission_id: receipt.mission_id,
    cycle_number: receipt.cycle_number,
    candidate_id: receipt.candidate_id,
    candidate_revision: receipt.candidate_revision,
    repository_binding: receipt.repository_binding,
    verifier_id: verifier.id,
    key_id: verifier.key_id,
    independence_group: verifier.independence_group,
    execution_origin: executionOrigin,
    invocation_id: invocationId,
    ...(executionEvidenceRef ? { execution_evidence_ref: JSON.parse(JSON.stringify(executionEvidenceRef)) } : {}),
    envelope,
    issued_at: issuedAt,
    expires_at: expiresAt,
    attestation_sha256: ""
  };
  attestation.attestation_sha256 = attestationDigest(attestation);
  return attestation;
}

function verifierForAttestation(attestation, trustPolicy) {
  return (trustPolicy.verifiers || []).find(item => item.id === attestation.verifier_id);
}

function verifyVerificationAttestation(attestation, trustPolicy, expectations = {}, now = new Date()) {
  const codes = [];
  const verifier = verifierForAttestation(attestation || {}, trustPolicy || {});
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!attestation || attestation.type !== "VerificationAttestation") codes.push("ATTESTATION_TYPE_INVALID");
  if (attestation && !["0.1", "0.2"].includes(attestation.schema_version)) codes.push("ATTESTATION_SCHEMA_VERSION_INVALID");
  if (attestation && attestation.attestation_sha256 !== attestationDigest(attestation)) codes.push("ATTESTATION_DIGEST_INVALID");
  if (!verifier || verifier.status !== "active") codes.push("ATTESTATION_VERIFIER_UNTRUSTED");
  if (verifier) {
    let calculatedKeyId = "invalid";
    try { calculatedKeyId = publicKeyId(verifier.public_key_pem); } catch (error) { codes.push("ATTESTATION_PUBLIC_KEY_INVALID"); }
    if (verifier.key_id !== calculatedKeyId || attestation.key_id !== verifier.key_id) codes.push("ATTESTATION_KEY_ID_MISMATCH");
    if (attestation.independence_group !== verifier.independence_group) codes.push("ATTESTATION_GROUP_MISMATCH");
    if (!(verifier.allowed_execution_origins || []).includes(attestation.execution_origin)) codes.push("ATTESTATION_ORIGIN_UNTRUSTED");
    if (!verifierAllowsReceiptAttestation(verifier)) codes.push("ATTESTATION_PURPOSE_UNAUTHORIZED");
    if (!(verifier.allowed_repository_keys || []).includes(attestation.repository_binding && attestation.repository_binding.repository_key)) {
      codes.push("ATTESTATION_REPOSITORY_UNTRUSTED");
    }
    if (!isValidTimestamp(verifier.valid_from) || !isValidTimestamp(verifier.valid_until) ||
        Date.parse(attestation.issued_at) < Date.parse(verifier.valid_from) || Date.parse(attestation.issued_at) >= Date.parse(verifier.valid_until)) {
      codes.push("ATTESTATION_KEY_OUTSIDE_VALIDITY");
    }
  }
  if (!isValidTimestamp(attestation && attestation.issued_at) || !isValidTimestamp(attestation && attestation.expires_at) ||
      Date.parse(attestation.expires_at) <= Date.parse(attestation.issued_at)) {
    codes.push("ATTESTATION_TIME_INVALID");
  } else {
    if (!Number.isFinite(nowMs) || nowMs < Date.parse(attestation.issued_at) || nowMs >= Date.parse(attestation.expires_at)) {
      codes.push("ATTESTATION_EXPIRED_OR_NOT_YET_VALID");
    }
    if (Number.isFinite(expectations.maxAttestationAgeSeconds) &&
        nowMs - Date.parse(attestation.issued_at) > expectations.maxAttestationAgeSeconds * 1000) {
      codes.push("ATTESTATION_TOO_OLD");
    }
  }

  const envelope = attestation && attestation.envelope;
  const payload = envelope && strictBase64(envelope.payload);
  const signatureEntry = envelope && Array.isArray(envelope.signatures) && envelope.signatures.length === 1
    ? envelope.signatures[0]
    : null;
  const signature = signatureEntry && strictBase64(signatureEntry.sig);
  if (!envelope || envelope.payloadType !== DSSE_PAYLOAD_TYPE || !payload || !signatureEntry || !signature) {
    codes.push("ATTESTATION_DSSE_ENVELOPE_INVALID");
  }
  if (signatureEntry && signatureEntry.keyid !== attestation.key_id) codes.push("ATTESTATION_SIGNATURE_KEY_MISMATCH");
  if (verifier && payload && signature) {
    try {
      if (!crypto.verify(null, preAuthEncoding(envelope.payloadType, payload), verifier.public_key_pem, signature)) {
        codes.push("ATTESTATION_SIGNATURE_INVALID");
      }
    } catch (error) {
      codes.push("ATTESTATION_SIGNATURE_INVALID");
    }
  }

  let statement = null;
  if (payload) {
    try { statement = JSON.parse(payload.toString("utf8")); } catch (error) { codes.push("ATTESTATION_STATEMENT_INVALID"); }
  }
  if (statement) {
    const subject = Array.isArray(statement.subject) && statement.subject.length === 1 ? statement.subject[0] : {};
    const predicate = statement.predicate || {};
    const receipt = predicate.receipt || {};
    const signer = predicate.verifier || {};
    if (statement._type !== STATEMENT_TYPE || statement.predicateType !== PREDICATE_TYPE) codes.push("ATTESTATION_STATEMENT_TYPE_INVALID");
    if (subject.name !== attestation.receipt_id || !subject.digest || subject.digest.sha256 !== attestation.receipt_sha256) codes.push("ATTESTATION_SUBJECT_MISMATCH");
    const bindings = [
      [receipt.id, attestation.receipt_id], [receipt.relative_path, attestation.receipt_relative_path],
      [receipt.campaign_id, attestation.campaign_id],
      [receipt.mission_id, attestation.mission_id], [receipt.cycle_number, attestation.cycle_number],
      [receipt.candidate_id, attestation.candidate_id], [receipt.candidate_revision, attestation.candidate_revision],
      [signer.id, attestation.verifier_id], [signer.key_id, attestation.key_id],
      [signer.independence_group, attestation.independence_group], [signer.execution_origin, attestation.execution_origin],
      [signer.invocation_id, attestation.invocation_id], [predicate.issued_at, attestation.issued_at],
      [predicate.expires_at, attestation.expires_at]
    ];
    if (attestation.schema_version === "0.2" && !sameArtifactRef(predicate.execution_evidence_ref, attestation.execution_evidence_ref)) {
      codes.push("ATTESTATION_EXECUTION_EVIDENCE_BINDING_INVALID");
    }
    if (bindings.some(([left, right]) => left !== right) || JSON.stringify(predicate.repository_binding) !== JSON.stringify(attestation.repository_binding)) {
      codes.push("ATTESTATION_PREDICATE_BINDING_MISMATCH");
    }
    if (expectations.receiptSelfSha256 !== undefined && receipt.receipt_sha256 !== expectations.receiptSelfSha256) {
      codes.push("ATTESTATION_RECEIPT_CONTENT_MISMATCH");
    }
  }

  const expectedPairs = [
    ["receiptId", "receipt_id"], ["receiptRelativePath", "receipt_relative_path"],
    ["receiptSha256", "receipt_sha256"], ["campaignId", "campaign_id"],
    ["missionId", "mission_id"], ["cycleNumber", "cycle_number"], ["candidateId", "candidate_id"],
    ["candidateRevision", "candidate_revision"], ["repositoryKey", "repository_binding.repository_key"]
  ];
  for (const [expectationKey, attestationPath] of expectedPairs) {
    if (expectations[expectationKey] === undefined) continue;
    const actual = attestationPath.split(".").reduce((value, key) => value && value[key], attestation);
    if (actual !== expectations[expectationKey]) codes.push("ATTESTATION_EXPECTATION_MISMATCH");
  }
  let executionEvidenceId = "none";
  let independenceDomainId = attestation && attestation.independence_group;
  let independenceClaims = null;
  if (trustPolicy && ["0.4", "0.5", "0.6"].includes(trustPolicy.schema_version)) {
    if (attestation.schema_version !== "0.2" || !validArtifactRef(attestation.execution_evidence_ref)) {
      codes.push("ATTESTATION_EXECUTION_EVIDENCE_REQUIRED");
    } else {
      const item = executionEvidenceItem(attestation.execution_evidence_ref, expectations.executionEvidence);
      const evidence = item && item.payload ? item.payload : item;
      const entry = item && item.entry;
      if (!evidence || (entry && !sameArtifactRef(attestation.execution_evidence_ref, entry))) {
        codes.push("ATTESTATION_EXECUTION_EVIDENCE_MISSING");
      } else {
        const receiptExpectation = expectations.receiptReferences && expectations.receiptReferences[attestation.receipt_id] || {};
        const { verifyVerifierExecutionEvidence } = require("./verifier-execution-evidence");
        const result = verifyVerifierExecutionEvidence({
          evidence,
          trustPolicy,
          runtimePolicy: expectations.runtimePolicy,
          runtimePolicyReference: expectations.runtimePolicyReference,
          evaluatedAt: now instanceof Date ? now.toISOString() : now,
          expectations: {
            purpose: "verification_receipt",
            verifierId: attestation.verifier_id,
            subjectReference: {
              artifact_id: attestation.receipt_id,
              relative_path: attestation.receipt_relative_path,
              sha256: attestation.receipt_sha256
            },
            repositoryState: receiptExpectation.repository_state,
            verificationTarget: receiptExpectation.verification_target,
            repositoryKey: attestation.repository_binding && attestation.repository_binding.repository_key,
            repositoryFingerprint: attestation.repository_binding && attestation.repository_binding.identity_fingerprint
          }
        });
        executionEvidenceId = evidence.id;
        if (trustPolicy.schema_version === "0.6") {
          independenceDomainId = result.independence_domain_id;
          independenceClaims = result.independence_claims;
          if (!independenceDomainId || independenceDomainId === "none") {
            codes.push("ATTESTATION_INDEPENDENCE_DOMAIN_INVALID");
          }
        }
        codes.push(...result.codes);
      }
    }
  }
  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    verifier_id: attestation && attestation.verifier_id,
    key_id: attestation && attestation.key_id,
    independence_group: independenceDomainId,
    declared_independence_group: attestation && attestation.independence_group,
    independence_claims: independenceClaims,
    receipt_id: attestation && attestation.receipt_id,
    execution_evidence_id: executionEvidenceId
  };
}

function evaluateAttestationQuorum(attestations, trustPolicy, expectations, requirements, now = new Date()) {
  const results = (attestations || []).map(item => {
    const receiptReference = expectations.receiptReferences && expectations.receiptReferences[item.receipt_id];
    return verifyVerificationAttestation(item, trustPolicy, {
      ...expectations,
      ...(receiptReference ? {
        receiptId: item.receipt_id,
        receiptRelativePath: receiptReference.relative_path,
        receiptSha256: receiptReference.sha256,
        receiptSelfSha256: receiptReference.receipt_sha256
      } : {})
    }, now);
  });
  const codes = results.flatMap(item => item.codes);
  const valid = results.filter(item => item.valid);
  const distinctIds = new Set((attestations || []).map(item => item.id));
  if (distinctIds.size !== (attestations || []).length) codes.push("ATTESTATION_DUPLICATE_ID");
  const distinctVerifiers = new Set(valid.map(item => item.verifier_id));
  const distinctKeys = new Set(valid.map(item => item.key_id));
  const distinctGroups = new Set(valid.map(item => item.independence_group));
  const trustRequirements = (trustPolicy && trustPolicy.quorum) || {};
  const minimumAttestations = Math.max(requirements.minimum_valid_attestations || 1, trustRequirements.minimum_valid_attestations || 1);
  const minimumGroups = Math.max(requirements.minimum_independence_groups || 1, trustRequirements.minimum_independence_groups || 1);
  if (valid.length < minimumAttestations) codes.push("ATTESTATION_QUORUM_NOT_MET");
  if (distinctVerifiers.size < minimumAttestations) codes.push("ATTESTATION_VERIFIER_DIVERSITY_NOT_MET");
  if (requirements.require_distinct_key_ids !== false && distinctKeys.size < minimumAttestations) codes.push("ATTESTATION_KEY_DIVERSITY_NOT_MET");
  if (distinctGroups.size < minimumGroups) codes.push("ATTESTATION_GROUP_DIVERSITY_NOT_MET");
  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    valid_attestation_ids: (attestations || []).filter((_item, index) => results[index].valid).map(item => item.id).sort(),
    verifier_ids: [...distinctVerifiers].sort(),
    key_ids: [...distinctKeys].sort(),
    independence_groups: [...distinctGroups].sort(),
    minimum_valid_attestations: minimumAttestations,
    minimum_independence_groups: minimumGroups,
    results
  };
}

module.exports = {
  DSSE_PAYLOAD_TYPE,
  PREDICATE_TYPE,
  STATEMENT_TYPE,
  attestationDigest,
  canonicalBytes,
  createVerificationAttestation,
  evaluateAttestationQuorum,
  isValidTimestamp,
  preAuthEncoding,
  publicKeyId,
  strictBase64,
  verifyVerificationAttestation
};
