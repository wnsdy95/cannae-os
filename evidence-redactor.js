#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validatePayload } = require("./validator-cli-prototype/validate");

const AUDIENCE_RANK = { internal: 0, partner: 1, public: 2 };
const CONTENT_DELIVERY_MODES = new Set(["raw", "summary", "redacted"]);
const INTERNAL_REVIEWERS = new Set(["USER", "COMMANDER", "COS", "S2", "S6"]);
const EXTERNAL_REVIEWERS = new Set(["USER", "COMMANDER"]);

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalValue(value[key])])
    );
  }
  return value;
}

function evidenceDigest(evidence) {
  return sha256(`${JSON.stringify(canonicalValue(evidence))}\n`);
}

function assertSchema(payload, type, label) {
  const result = validatePayload(payload, type);
  if (!result.valid) {
    const codes = result.issues.map(item => item.code).join(", ");
    throw new Error(`${label} failed ${type} validation: ${codes || "unknown validation failure"}.`);
  }
}

function requireTimestamp(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} requires a valid evaluation timestamp.`);
  return timestamp;
}

function releaseTarget(audience) {
  if (audience === "public") return "final_output";
  if (audience === "partner") return "partner_release";
  return "internal_handoff";
}

function authorizedReviewer(role, audience) {
  return (audience === "internal" ? INTERNAL_REVIEWERS : EXTERNAL_REVIEWERS).has(role);
}

function deliveryPolicy(label, audience) {
  if (label.eefi_class === "output_forbidden") {
    return { mode: "denied", rationale: "Output-forbidden EEFI must not be re-exposed through final output; only a reference packet is emitted." };
  }
  if (!(audience in AUDIENCE_RANK) || !(label.releasability in AUDIENCE_RANK)) {
    return { mode: "denied", rationale: "Unknown audience or releasability fails closed." };
  }
  if (AUDIENCE_RANK[audience] > AUDIENCE_RANK[label.releasability]) {
    return { mode: "denied", rationale: `Requested ${audience} audience exceeds ${label.releasability} releasability.` };
  }
  if (label.classification === "restricted") {
    if (audience === "internal") {
      return { mode: "redacted", rationale: "Restricted evidence stays inside the project; content is replaced by digests." };
    }
    return { mode: "reference_only", rationale: "Restricted evidence for an external audience is delivered by reference only." };
  }
  if (label.classification === "sensitive" || label.eefi_class === "tool_transfer_forbidden") {
    return { mode: "redacted", rationale: "Sensitive or transfer-forbidden evidence requires redaction for final output." };
  }
  if (label.classification === "internal") {
    return { mode: "summary", rationale: "Internal evidence may deliver its citable claim; internal judgment stays behind a digest." };
  }
  if (label.classification === "public") {
    if (label.releasability === "public") {
      return { mode: "raw", rationale: "Public evidence with public releasability is approved for final output." };
    }
    return { mode: "summary", rationale: "Public-classified evidence without public releasability delivers the citable claim only." };
  }
  return { mode: "denied", rationale: "No delivery rule matched; deny by default." };
}

function verifyReleasabilityReview(evidence, label, review, options, mode) {
  assertSchema(review, "releasability-review", "Releasability review");
  const evaluatedAt = requireTimestamp(options.evaluatedAt, "Evidence redaction");
  const reviewedAt = requireTimestamp(review.reviewed_at, "Releasability review");
  const expiresAt = requireTimestamp(review.expires_at, "Releasability review");
  if (reviewedAt > evaluatedAt || expiresAt <= evaluatedAt || reviewedAt >= expiresAt) {
    throw new Error("Releasability review is future-dated, expired, or has an invalid validity interval.");
  }
  if (review.mission_id !== evidence.mission_id || review.mission_id !== label.mission_id) {
    throw new Error("Releasability review mission does not match evidence and label mission.");
  }
  if (review.artifact.artifact_id !== evidence.id) {
    throw new Error("Releasability review artifact does not identify the evidence record.");
  }
  const expectedDigest = options.evidenceSha256 || evidenceDigest(evidence);
  if (review.artifact.sha256 !== expectedDigest) {
    throw new Error("Releasability review artifact digest does not match the evidence record.");
  }
  const reviewedLabel = (review.labels || []).find(item => item.label_id === label.id);
  if (!reviewedLabel || reviewedLabel.classification !== label.classification || reviewedLabel.eefi_class !== label.eefi_class) {
    throw new Error("Releasability review does not bind the exact classification label state.");
  }
  if (review.requested_audience !== options.audience) {
    throw new Error("Releasability review audience does not match the requested release audience.");
  }
  if (!authorizedReviewer(review.reviewer, options.audience)) {
    throw new Error(`Reviewer ${review.reviewer} lacks authority for ${options.audience} release.`);
  }
  if ((review.findings || []).some(item => item.severity === "error" || item.severity === "critical")) {
    throw new Error("Releasability review with error or critical findings cannot release content.");
  }
  const requiredDecision = mode === "redacted" ? "redact" : "release";
  if (review.decision !== requiredDecision) {
    throw new Error(`Releasability review decision must be ${requiredDecision} for ${mode} delivery.`);
  }
  if (!review.release_review_id) {
    throw new Error("Releasability review must name the downstream ReleaseReview.");
  }
}

function verifyFinalReview(evidence, label, review, releasabilityReview, options, mode) {
  assertSchema(review, "release-review", "Final release review");
  const evaluatedAt = requireTimestamp(options.evaluatedAt, "Evidence redaction");
  const createdAt = requireTimestamp(review.created_at, "Final release review");
  if (createdAt > evaluatedAt) throw new Error("Final release review is future-dated.");
  if (review.id !== releasabilityReview.release_review_id) {
    throw new Error("Final release review id does not match the per-artifact review binding.");
  }
  if (review.mission_id !== evidence.mission_id || review.mission_id !== label.mission_id) {
    throw new Error("Final release review mission does not match evidence and label mission.");
  }
  if (review.target !== releaseTarget(options.audience)) {
    throw new Error("Final release review target does not match the requested audience.");
  }
  if (!authorizedReviewer(review.reviewer, options.audience)) {
    throw new Error(`Final reviewer ${review.reviewer} lacks authority for ${options.audience} release.`);
  }
  const expectedDecision = mode === "redacted" ? "approve_redacted" : "approve";
  if (review.decision !== expectedDecision) {
    throw new Error(`Final release review decision must be ${expectedDecision} for ${mode} delivery.`);
  }
  const reviewedItem = (review.items || []).find(item => item.item_id === evidence.id);
  if (!reviewedItem || reviewedItem.classification !== label.classification ||
      reviewedItem.eefi !== (label.eefi_class !== "none") || reviewedItem.delivery_mode !== mode) {
    throw new Error("Final release review does not bind the exact evidence classification and delivery mode.");
  }
}

function redactEvidence(evidence, label, options = {}) {
  assertSchema(evidence, "evidence", "Evidence");
  assertSchema(label, "classification-label", "Classification label");
  if (label.subject_id !== evidence.id || label.mission_id !== evidence.mission_id) {
    throw new Error("Classification label subject and mission must match the evidence record exactly.");
  }

  const audience = options.audience || "internal";
  const evaluatedAt = requireTimestamp(options.evaluatedAt, "Evidence redaction");
  if (Date.parse(label.review_by) <= evaluatedAt) {
    throw new Error("Classification label is expired and must be reviewed before release.");
  }

  const { mode, rationale } = deliveryPolicy(label, audience);
  if (CONTENT_DELIVERY_MODES.has(mode)) {
    if (!options.releasabilityReview || !options.releaseReview) {
      throw new Error("Content-bearing delivery requires exact ReleasabilityReview and ReleaseReview records.");
    }
    verifyReleasabilityReview(evidence, label, options.releasabilityReview, {
      ...options,
      audience,
      evaluatedAt: options.evaluatedAt
    }, mode);
    verifyFinalReview(evidence, label, options.releaseReview, options.releasabilityReview, {
      ...options,
      audience,
      evaluatedAt: options.evaluatedAt
    }, mode);
  }

  const packet = {
    schema_version: "0.1",
    type: "EvidenceReleasePacket",
    evidence_id: evidence.id,
    mission_id: evidence.mission_id,
    label_id: label.id,
    classification: label.classification,
    eefi_class: label.eefi_class,
    releasability: label.releasability,
    requested_audience: audience,
    delivery_mode: mode,
    rationale,
    evaluated_at: new Date(evaluatedAt).toISOString(),
    releasability_review_id: options.releasabilityReview ? options.releasabilityReview.id : null,
    release_review_id: options.releaseReview ? options.releaseReview.id : null,
    release_authorized: false,
    content_digests: {
      claim_sha256: sha256(evidence.claim),
      interpretation_sha256: sha256(evidence.interpretation)
    }
  };

  if (mode === "raw") {
    packet.source_title = evidence.source_title;
    packet.source_type = evidence.source_type;
    packet.reliability = evidence.reliability;
    packet.url = evidence.url;
    packet.checked_at = evidence.checked_at;
    packet.claim = evidence.claim;
    packet.interpretation = evidence.interpretation;
    packet.linked_docs = evidence.linked_docs || [];
  } else if (mode === "summary") {
    packet.source_title = evidence.source_title;
    packet.source_type = evidence.source_type;
    packet.reliability = evidence.reliability;
    packet.url = evidence.url;
    packet.checked_at = evidence.checked_at;
    packet.claim = evidence.claim;
    packet.linked_docs = evidence.linked_docs || [];
  }

  return packet;
}

function main() {
  const args = process.argv.slice(2);
  const positional = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--audience" || token === "--evaluated-at") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
      if (token === "--audience") options.audience = value;
      if (token === "--evaluated-at") options.evaluatedAt = value;
      index += 1;
    } else {
      positional.push(token);
    }
  }
  const [evidenceArg, labelArg, releasabilityReviewArg, releaseReviewArg] = positional;
  if (!evidenceArg || !labelArg) {
    console.error("Usage: node evidence-redactor.js <evidence.json> <classification-label.json> [releasability-review.json] [release-review.json] --audience <internal|partner|public> --evaluated-at <timestamp>");
    process.exit(2);
  }

  const evidencePath = path.resolve(process.cwd(), evidenceArg);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const label = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), labelArg), "utf8"));
  const releasabilityReview = releasabilityReviewArg
    ? JSON.parse(fs.readFileSync(path.resolve(process.cwd(), releasabilityReviewArg), "utf8"))
    : null;
  const releaseReview = releaseReviewArg
    ? JSON.parse(fs.readFileSync(path.resolve(process.cwd(), releaseReviewArg), "utf8"))
    : null;
  const evidenceSha256 = crypto.createHash("sha256").update(fs.readFileSync(evidencePath)).digest("hex");
  process.stdout.write(`${JSON.stringify(redactEvidence(evidence, label, {
    ...options,
    evidenceSha256,
    releasabilityReview,
    releaseReview
  }), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  deliveryPolicy,
  evidenceDigest,
  redactEvidence,
  releaseTarget,
  verifyFinalReview,
  verifyReleasabilityReview
};
