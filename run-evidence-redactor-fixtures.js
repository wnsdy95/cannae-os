#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { evidenceDigest, redactEvidence, releaseTarget } = require("./evidence-redactor");

const ROOT = __dirname;
const EVALUATED_AT = "2026-08-11T00:00:00Z";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function releaseOptions(evidence, label, audience, mode) {
  const releasabilityReviewId = `RREV-${evidence.id}`;
  const releaseReviewId = `RR-${evidence.id}`;
  return {
    audience,
    evaluatedAt: EVALUATED_AT,
    releasabilityReview: {
      schema_version: "0.1",
      type: "ReleasabilityReview",
      id: releasabilityReviewId,
      mission_id: evidence.mission_id,
      artifact: {
        artifact_id: evidence.id,
        relative_path: `evidence/${evidence.id}.json`,
        sha256: evidenceDigest(evidence)
      },
      labels: [{
        label_id: label.id,
        classification: label.classification,
        eefi_class: label.eefi_class
      }],
      requested_audience: audience,
      findings: [],
      decision: mode === "redacted" ? "redact" : "release",
      release_review_id: releaseReviewId,
      reviewer: "COMMANDER",
      reviewed_at: "2026-08-10T00:00:00Z",
      expires_at: "2026-08-12T00:00:00Z"
    },
    releaseReview: {
      schema_version: "0.1",
      type: "ReleaseReview",
      id: releaseReviewId,
      mission_id: evidence.mission_id,
      reviewer: "COMMANDER",
      classification: label.classification,
      target: releaseTarget(audience),
      decision: mode === "redacted" ? "approve_redacted" : "approve",
      items: [{
        item_id: evidence.id,
        classification: label.classification,
        eefi: label.eefi_class !== "none",
        delivery_mode: mode,
        ...(mode === "redacted" ? { redactions: ["claim", "interpretation", "source metadata", "linked documents"] } : {}),
        rationale: `Exact ${mode} delivery reviewed for ${audience}.`
      }],
      output_constraints: ["Release only the exact reviewed packet."],
      created_at: "2026-08-10T00:05:00Z"
    }
  };
}

const fixtures = [
  {
    name: "releasable internal evidence is summarized with citable claim only",
    evidence: readJson(path.join("runtime-demo-payloads", "evidence.json")),
    label: readJson(path.join("evidence-redactor-fixtures", "internal-label.json")),
    audience: "internal",
    mode: "summary",
    verify(packet, evidence) {
      assert(packet.delivery_mode === "summary", "expected summary delivery mode");
      assert(packet.claim === evidence.claim, "expected citable claim to be preserved");
      assert(!("interpretation" in packet), "expected internal judgment to be withheld");
      assert(packet.content_digests.interpretation_sha256 === sha256(evidence.interpretation), "expected interpretation digest");
      assert(!JSON.stringify(packet).includes(evidence.interpretation), "packet must not contain interpretation text");
      assert(packet.release_authorized === false, "redactor must never grant release authority");
    }
  },
  {
    name: "restricted evidence is redacted to digest-only content",
    evidence: readJson(path.join("evidence-redactor-fixtures", "restricted-evidence.json")),
    label: readJson(path.join("evidence-redactor-fixtures", "restricted-label.json")),
    audience: "internal",
    mode: "redacted",
    verify(packet, evidence) {
      assert(packet.delivery_mode === "redacted", "expected redacted delivery mode");
      assert(!("claim" in packet) && !("interpretation" in packet), "expected content fields to be removed");
      assert(packet.content_digests.claim_sha256 === sha256(evidence.claim), "expected claim digest");
      assert(!JSON.stringify(packet).includes("srv/gateway/demo-credential-path"), "packet must not contain the credential path");
      assert(!("source_title" in packet) && !("linked_docs" in packet), "redacted packet must withhold source metadata and linked documents");
    }
  },
  {
    name: "denied label produces reference-only packet without content leak",
    evidence: readJson(path.join("evidence-redactor-fixtures", "secret-evidence.json")),
    label: readJson(path.join("evidence-redactor-fixtures", "denied-label.json")),
    audience: "internal",
    mode: "denied",
    verify(packet, evidence) {
      const serialized = JSON.stringify(packet);
      assert(packet.delivery_mode === "denied", "expected denied delivery mode");
      assert(packet.evidence_id === evidence.id, "expected evidence reference to be preserved");
      assert(!("claim" in packet) && !("interpretation" in packet), "expected content fields to be removed");
      assert(!("source_title" in packet) && !("url" in packet), "expected source metadata to be withheld");
      assert(/^[a-f0-9]{64}$/.test(packet.content_digests.claim_sha256), "expected claim digest");
      assert(!serialized.includes("example-9d2c-demo-value"), "packet must not contain the captured secret");
      assert(!serialized.includes("password="), "packet must not contain credential assignments");
    }
  }
];

const adversarialFixtures = [
  {
    name: "schema-valid label for another evidence and mission cannot release content",
    run() {
      const evidence = readJson(path.join("evidence-redactor-fixtures", "secret-evidence.json"));
      const label = {
        schema_version: "0.1",
        type: "ClassificationLabel",
        id: "CL-OTHER-001",
        mission_id: "M-OTHER-001",
        subject_id: "E-OTHER-001",
        classification: "public",
        eefi_class: "none",
        releasability: "public",
        need_to_know_roles: [],
        labeling_authority: "S2",
        review_by: "2026-08-12T00:00:00Z"
      };
      redactEvidence(evidence, label, { audience: "public", evaluatedAt: EVALUATED_AT });
    },
    error: /subject and mission/
  },
  {
    name: "content-bearing delivery without both reviews fails closed",
    run() {
      const evidence = readJson(path.join("runtime-demo-payloads", "evidence.json"));
      const label = readJson(path.join("evidence-redactor-fixtures", "internal-label.json"));
      redactEvidence(evidence, label, { audience: "internal", evaluatedAt: EVALUATED_AT });
    },
    error: /requires exact ReleasabilityReview and ReleaseReview/
  },
  {
    name: "expired classification label cannot release content",
    run() {
      const evidence = readJson(path.join("runtime-demo-payloads", "evidence.json"));
      const label = {
        ...readJson(path.join("evidence-redactor-fixtures", "internal-label.json")),
        review_by: "2026-08-10T00:00:00Z"
      };
      redactEvidence(evidence, label, { audience: "internal", evaluatedAt: EVALUATED_AT });
    },
    error: /expired/
  },
  {
    name: "review bound to a different artifact digest fails closed",
    run() {
      const evidence = readJson(path.join("runtime-demo-payloads", "evidence.json"));
      const label = readJson(path.join("evidence-redactor-fixtures", "internal-label.json"));
      const options = releaseOptions(evidence, label, "internal", "summary");
      options.releasabilityReview.artifact.sha256 = "0".repeat(64);
      redactEvidence(evidence, label, options);
    },
    error: /artifact digest/
  }
];

let passed = 0;

for (const fixture of fixtures) {
  try {
    const options = fixture.mode === "denied"
      ? { audience: fixture.audience, evaluatedAt: EVALUATED_AT }
      : releaseOptions(fixture.evidence, fixture.label, fixture.audience, fixture.mode);
    const packet = redactEvidence(fixture.evidence, fixture.label, options);
    fixture.verify(packet, fixture.evidence);
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

for (const fixture of adversarialFixtures) {
  try {
    fixture.run();
    console.error(`FAIL ${fixture.name}`);
    console.error("expected fail-closed error");
    process.exitCode = 1;
  } catch (error) {
    if (!fixture.error.test(error.message)) {
      console.error(`FAIL ${fixture.name}`);
      console.error(error.message);
      process.exitCode = 1;
      continue;
    }
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  }
}

const total = fixtures.length + adversarialFixtures.length;
console.log(JSON.stringify({ total, passed, failed: total - passed }, null, 2));
