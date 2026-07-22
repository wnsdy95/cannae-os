#!/usr/bin/env node

const crypto = require("crypto");
const {
  DSSE_PAYLOAD_TYPE,
  STATEMENT_TYPE,
  canonicalBytes,
  isValidTimestamp,
  preAuthEncoding,
  publicKeyId,
  strictBase64
} = require("./verification-attestation");

const COMPARATIVE_PREDICATE_TYPE = "https://cannae.dev/attestations/comparative-evaluation-report/v0.4";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function comparativeAttestationDigest(attestation) {
  return sha256(canonicalBytes(attestation, "attestation_sha256"));
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

function createComparativeEvaluationAttestation(options) {
  const { report, reportReference, verifier, privateKeyPem } = options;
  if (!report || report.type !== "ComparativeEvaluationReport") throw new Error("A comparative evaluation report is required.");
  if (!reportReference || reportReference.artifact_id !== report.id ||
      !/^[a-f0-9]{64}$/.test(reportReference.sha256 || "") || !reportReference.relative_path) {
    throw new Error("The report reference must bind the persisted report ID, path, and SHA-256 digest.");
  }
  if (!verifier || verifier.status !== "active") throw new Error("The selected verifier is not active.");
  if (!(verifier.allowed_attestation_types || []).includes("comparative_evaluation_report")) {
    throw new Error("The selected verifier is not authorized to attest comparative evaluation reports.");
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
  const baseline = report.executions && report.executions.baseline && report.executions.baseline.observation
    ? report.executions.baseline.observation.subject
    : {};
  const candidate = report.executions && report.executions.candidate && report.executions.candidate.observation
    ? report.executions.candidate.observation.subject
    : {};

  const statement = {
    _type: STATEMENT_TYPE,
    subject: [{ name: report.id, digest: { sha256: reportReference.sha256 } }],
    predicateType: COMPARATIVE_PREDICATE_TYPE,
    predicate: {
      schema_version: schemaVersion,
      report: {
        id: report.id,
        relative_path: reportReference.relative_path,
        report_sha256: report.report_sha256,
        plan_id: report.plan_ref && report.plan_ref.artifact_id,
        evaluation_set_id: report.evaluation_set_ref && report.evaluation_set_ref.artifact_id,
        outcome: report.outcome,
        campaign_id: report.campaign_id,
        mission_id: report.mission_id,
        cycle_number: report.cycle_number,
        target_type: report.target_type
      },
      subjects: {
        baseline: { candidate_id: baseline.candidate_id, revision: baseline.revision },
        candidate: { candidate_id: candidate.candidate_id, revision: candidate.revision }
      },
      repository_binding: report.repository_binding,
      evaluator: {
        id: report.evaluator && report.evaluator.evaluator_id,
        invocation_id: report.evaluator && report.evaluator.invocation_id
      },
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
    type: "ComparativeEvaluationAttestation",
    id: `CEA-${sha256(`${report.id}\n${verifier.id}\n${invocationId}\n${nonce}`).slice(0, 24)}`,
    report_id: report.id,
    report_relative_path: reportReference.relative_path,
    report_sha256: reportReference.sha256,
    report_content_sha256: report.report_sha256,
    plan_id: report.plan_ref.artifact_id,
    evaluation_set_id: report.evaluation_set_ref.artifact_id,
    campaign_id: report.campaign_id,
    mission_id: report.mission_id,
    cycle_number: report.cycle_number,
    target_type: report.target_type,
    baseline_candidate_id: baseline.candidate_id,
    baseline_revision: baseline.revision,
    candidate_id: candidate.candidate_id,
    candidate_revision: candidate.revision,
    repository_binding: report.repository_binding,
    evaluator_id: report.evaluator.evaluator_id,
    evaluator_invocation_id: report.evaluator.invocation_id,
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
  attestation.attestation_sha256 = comparativeAttestationDigest(attestation);
  return attestation;
}

function verifierForAttestation(attestation, trustPolicy) {
  return (trustPolicy.verifiers || []).find(item => item.id === attestation.verifier_id);
}

function verifyComparativeEvaluationAttestation(attestation, trustPolicy, expectations = {}, now = new Date()) {
  const codes = [];
  const verifier = verifierForAttestation(attestation || {}, trustPolicy || {});
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!attestation || attestation.type !== "ComparativeEvaluationAttestation") codes.push("COMPARATIVE_ATTESTATION_TYPE_INVALID");
  if (attestation && !["0.1", "0.2"].includes(attestation.schema_version)) codes.push("COMPARATIVE_ATTESTATION_SCHEMA_VERSION_INVALID");
  if (attestation && attestation.attestation_sha256 !== comparativeAttestationDigest(attestation)) codes.push("COMPARATIVE_ATTESTATION_DIGEST_INVALID");
  if (!verifier || verifier.status !== "active") codes.push("COMPARATIVE_ATTESTATION_VERIFIER_UNTRUSTED");
  if (verifier) {
    let calculatedKeyId = "invalid";
    try { calculatedKeyId = publicKeyId(verifier.public_key_pem); } catch (error) { codes.push("COMPARATIVE_ATTESTATION_PUBLIC_KEY_INVALID"); }
    if (verifier.key_id !== calculatedKeyId || attestation.key_id !== verifier.key_id) codes.push("COMPARATIVE_ATTESTATION_KEY_ID_MISMATCH");
    if (attestation.independence_group !== verifier.independence_group) codes.push("COMPARATIVE_ATTESTATION_GROUP_MISMATCH");
    if (!(verifier.allowed_execution_origins || []).includes(attestation.execution_origin)) codes.push("COMPARATIVE_ATTESTATION_ORIGIN_UNTRUSTED");
    if (!(verifier.allowed_attestation_types || []).includes("comparative_evaluation_report")) {
      codes.push("COMPARATIVE_ATTESTATION_PURPOSE_UNAUTHORIZED");
    }
    if (!(verifier.allowed_repository_keys || []).includes(attestation.repository_binding && attestation.repository_binding.repository_key)) {
      codes.push("COMPARATIVE_ATTESTATION_REPOSITORY_UNTRUSTED");
    }
    if (!isValidTimestamp(verifier.valid_from) || !isValidTimestamp(verifier.valid_until) ||
        Date.parse(attestation.issued_at) < Date.parse(verifier.valid_from) || Date.parse(attestation.issued_at) >= Date.parse(verifier.valid_until)) {
      codes.push("COMPARATIVE_ATTESTATION_KEY_OUTSIDE_VALIDITY");
    }
  }
  if (!isValidTimestamp(attestation && attestation.issued_at) || !isValidTimestamp(attestation && attestation.expires_at) ||
      Date.parse(attestation.expires_at) <= Date.parse(attestation.issued_at)) {
    codes.push("COMPARATIVE_ATTESTATION_TIME_INVALID");
  } else {
    if (!Number.isFinite(nowMs) || nowMs < Date.parse(attestation.issued_at) || nowMs >= Date.parse(attestation.expires_at)) {
      codes.push("COMPARATIVE_ATTESTATION_EXPIRED_OR_NOT_YET_VALID");
    }
    if (Number.isFinite(expectations.maxAttestationAgeSeconds) &&
        nowMs - Date.parse(attestation.issued_at) > expectations.maxAttestationAgeSeconds * 1000) {
      codes.push("COMPARATIVE_ATTESTATION_TOO_OLD");
    }
  }

  const envelope = attestation && attestation.envelope;
  const payload = envelope && strictBase64(envelope.payload);
  const signatureEntry = envelope && Array.isArray(envelope.signatures) && envelope.signatures.length === 1
    ? envelope.signatures[0]
    : null;
  const signature = signatureEntry && strictBase64(signatureEntry.sig);
  if (!envelope || envelope.payloadType !== DSSE_PAYLOAD_TYPE || !payload || !signatureEntry || !signature) {
    codes.push("COMPARATIVE_ATTESTATION_DSSE_ENVELOPE_INVALID");
  }
  if (signatureEntry && signatureEntry.keyid !== attestation.key_id) codes.push("COMPARATIVE_ATTESTATION_SIGNATURE_KEY_MISMATCH");
  if (verifier && payload && signature) {
    try {
      if (!crypto.verify(null, preAuthEncoding(envelope.payloadType, payload), verifier.public_key_pem, signature)) {
        codes.push("COMPARATIVE_ATTESTATION_SIGNATURE_INVALID");
      }
    } catch (error) {
      codes.push("COMPARATIVE_ATTESTATION_SIGNATURE_INVALID");
    }
  }

  let statement = null;
  if (payload) {
    try { statement = JSON.parse(payload.toString("utf8")); } catch (error) { codes.push("COMPARATIVE_ATTESTATION_STATEMENT_INVALID"); }
  }
  if (statement) {
    const subject = Array.isArray(statement.subject) && statement.subject.length === 1 ? statement.subject[0] : {};
    const predicate = statement.predicate || {};
    const report = predicate.report || {};
    const subjects = predicate.subjects || {};
    const baseline = subjects.baseline || {};
    const candidate = subjects.candidate || {};
    const evaluator = predicate.evaluator || {};
    const signer = predicate.verifier || {};
    if (statement._type !== STATEMENT_TYPE || statement.predicateType !== COMPARATIVE_PREDICATE_TYPE) codes.push("COMPARATIVE_ATTESTATION_STATEMENT_TYPE_INVALID");
    if (subject.name !== attestation.report_id || !subject.digest || subject.digest.sha256 !== attestation.report_sha256) {
      codes.push("COMPARATIVE_ATTESTATION_SUBJECT_MISMATCH");
    }
    const bindings = [
      [report.id, attestation.report_id], [report.relative_path, attestation.report_relative_path],
      [report.report_sha256, attestation.report_content_sha256], [report.plan_id, attestation.plan_id],
      [report.evaluation_set_id, attestation.evaluation_set_id], [report.campaign_id, attestation.campaign_id],
      [report.mission_id, attestation.mission_id], [report.cycle_number, attestation.cycle_number],
      [report.target_type, attestation.target_type], [baseline.candidate_id, attestation.baseline_candidate_id],
      [baseline.revision, attestation.baseline_revision], [candidate.candidate_id, attestation.candidate_id],
      [candidate.revision, attestation.candidate_revision], [evaluator.id, attestation.evaluator_id],
      [evaluator.invocation_id, attestation.evaluator_invocation_id], [signer.id, attestation.verifier_id],
      [signer.key_id, attestation.key_id], [signer.independence_group, attestation.independence_group],
      [signer.execution_origin, attestation.execution_origin], [signer.invocation_id, attestation.invocation_id],
      [predicate.issued_at, attestation.issued_at], [predicate.expires_at, attestation.expires_at]
    ];
    if (attestation.schema_version === "0.2" && !sameArtifactRef(predicate.execution_evidence_ref, attestation.execution_evidence_ref)) {
      codes.push("COMPARATIVE_ATTESTATION_EXECUTION_EVIDENCE_BINDING_INVALID");
    }
    if (bindings.some(([left, right]) => left !== right) ||
        JSON.stringify(predicate.repository_binding) !== JSON.stringify(attestation.repository_binding)) {
      codes.push("COMPARATIVE_ATTESTATION_PREDICATE_BINDING_MISMATCH");
    }
  }

  const expectedPairs = [
    ["reportId", "report_id"], ["reportRelativePath", "report_relative_path"], ["reportSha256", "report_sha256"],
    ["reportContentSha256", "report_content_sha256"], ["planId", "plan_id"], ["evaluationSetId", "evaluation_set_id"],
    ["campaignId", "campaign_id"], ["missionId", "mission_id"], ["cycleNumber", "cycle_number"],
    ["targetType", "target_type"], ["baselineCandidateId", "baseline_candidate_id"], ["baselineRevision", "baseline_revision"],
    ["candidateId", "candidate_id"], ["candidateRevision", "candidate_revision"], ["evaluatorId", "evaluator_id"],
    ["evaluatorInvocationId", "evaluator_invocation_id"], ["repositoryKey", "repository_binding.repository_key"],
    ["repositoryFingerprint", "repository_binding.identity_fingerprint"]
  ];
  for (const [expectationKey, attestationPath] of expectedPairs) {
    if (expectations[expectationKey] === undefined) continue;
    const actual = attestationPath.split(".").reduce((value, key) => value && value[key], attestation);
    if (actual !== expectations[expectationKey]) codes.push("COMPARATIVE_ATTESTATION_EXPECTATION_MISMATCH");
  }
  let executionEvidenceId = "none";
  let independenceDomainId = attestation && attestation.independence_group;
  let independenceClaims = null;
  if (trustPolicy && ["0.4", "0.5", "0.6", "0.7"].includes(trustPolicy.schema_version)) {
    if (attestation.schema_version !== "0.2" || !validArtifactRef(attestation.execution_evidence_ref)) {
      codes.push("COMPARATIVE_ATTESTATION_EXECUTION_EVIDENCE_REQUIRED");
    } else {
      const item = executionEvidenceItem(attestation.execution_evidence_ref, expectations.executionEvidence);
      const evidence = item && item.payload ? item.payload : item;
      const entry = item && item.entry;
      if (!evidence || (entry && !sameArtifactRef(attestation.execution_evidence_ref, entry))) {
        codes.push("COMPARATIVE_ATTESTATION_EXECUTION_EVIDENCE_MISSING");
      } else {
        const { verifyVerifierExecutionEvidence } = require("./verifier-execution-evidence");
        const result = verifyVerifierExecutionEvidence({
          evidence,
          trustPolicy,
          runtimePolicy: expectations.runtimePolicy,
          runtimePolicyReference: expectations.runtimePolicyReference,
          evaluatedAt: now instanceof Date ? now.toISOString() : now,
          expectations: {
            purpose: "comparative_evaluation_report",
            verifierId: attestation.verifier_id,
            subjectReference: {
              artifact_id: attestation.report_id,
              relative_path: attestation.report_relative_path,
              sha256: attestation.report_sha256
            },
            repositoryState: expectations.repositoryState,
            verificationTarget: expectations.verificationTarget,
            repositoryKey: attestation.repository_binding && attestation.repository_binding.repository_key,
            repositoryFingerprint: attestation.repository_binding && attestation.repository_binding.identity_fingerprint
          }
        });
        executionEvidenceId = evidence.id;
        if (["0.6", "0.7"].includes(trustPolicy.schema_version)) {
          independenceDomainId = result.independence_domain_id;
          independenceClaims = result.independence_claims;
          if (!independenceDomainId || independenceDomainId === "none") {
            codes.push("COMPARATIVE_ATTESTATION_INDEPENDENCE_DOMAIN_INVALID");
          }
        }
        codes.push(...result.codes);
      }
    }
  }
  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    attestation_id: attestation && attestation.id,
    verifier_id: attestation && attestation.verifier_id,
    key_id: attestation && attestation.key_id,
    independence_group: independenceDomainId,
    declared_independence_group: attestation && attestation.independence_group,
    independence_claims: independenceClaims,
    report_id: attestation && attestation.report_id,
    execution_evidence_id: executionEvidenceId
  };
}

function evaluateComparativeAttestationQuorum(attestations, trustPolicy, expectations, requirements, now = new Date()) {
  const results = (attestations || []).map(item => verifyComparativeEvaluationAttestation(item, trustPolicy, expectations, now));
  const codes = results.flatMap(item => item.codes);
  const valid = results.filter(item => item.valid);
  const distinctIds = new Set((attestations || []).map(item => item.id));
  if (distinctIds.size !== (attestations || []).length) codes.push("COMPARATIVE_ATTESTATION_DUPLICATE_ID");
  const distinctVerifiers = new Set(valid.map(item => item.verifier_id));
  const distinctKeys = new Set(valid.map(item => item.key_id));
  const distinctGroups = new Set(valid.map(item => item.independence_group));
  const trustRequirements = (trustPolicy && trustPolicy.quorum) || {};
  const minimumAttestations = Math.max(requirements.minimum_valid_attestations || 1, trustRequirements.minimum_valid_attestations || 1);
  const minimumGroups = Math.max(requirements.minimum_independence_groups || 1, trustRequirements.minimum_independence_groups || 1);
  if (valid.length < minimumAttestations) codes.push("COMPARATIVE_ATTESTATION_QUORUM_NOT_MET");
  if (distinctVerifiers.size < minimumAttestations) codes.push("COMPARATIVE_ATTESTATION_VERIFIER_DIVERSITY_NOT_MET");
  if (requirements.require_distinct_key_ids !== false && distinctKeys.size < minimumAttestations) codes.push("COMPARATIVE_ATTESTATION_KEY_DIVERSITY_NOT_MET");
  if (distinctGroups.size < minimumGroups) codes.push("COMPARATIVE_ATTESTATION_GROUP_DIVERSITY_NOT_MET");
  return {
    valid: codes.length === 0,
    codes: [...new Set(codes)].sort(),
    valid_attestation_ids: valid.map(item => item.attestation_id).sort(),
    verifier_ids: [...distinctVerifiers].sort(),
    key_ids: [...distinctKeys].sort(),
    independence_groups: [...distinctGroups].sort(),
    minimum_valid_attestations: minimumAttestations,
    minimum_independence_groups: minimumGroups,
    results
  };
}

module.exports = {
  COMPARATIVE_PREDICATE_TYPE,
  comparativeAttestationDigest,
  createComparativeEvaluationAttestation,
  evaluateComparativeAttestationQuorum,
  verifyComparativeEvaluationAttestation
};
