#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const packets = require("./project-document-packet");
const { sha256 } = packets;
const OUTPUT = ".cannae/document-reviews";
const MAX = 1024 * 1024;
const SOURCES = ["project-document-packet.js", "project-document-review.js", "document-access-runner.js",
  "context-document-integrity.js", "opsec-linter.js", "eefi-detector.js", "validator-cli-prototype/validate.js",
  "schema-files/project-document-packet-request.schema.json", "schema-files/project-document-packet.schema.json",
  "schema-files/project-document-review-proposal.schema.json", "schema-files/project-document-review-decision.schema.json"];
const fail = code => { throw new Error(code); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const digestPattern = /^[a-f0-9]{64}$/;
function parse(bytes) {
  try { return JSON.parse(bytes); } catch { fail("PROJECT_REVIEW_INPUT_INVALID"); }
}
const screeningSources = () => Object.fromEntries(SOURCES.map(file => [file, sha256(fs.readFileSync(path.join(__dirname, file)))]));
const validate = (value, type) => {
  if (!require("./validator-cli-prototype/validate").validatePayload(value, type).valid) fail("PROJECT_REVIEW_CONTRACT_INVALID");
};

function reviewIssues(value, type) {
  const issues = [], add = code => issues.push({ severity: "error", code, path: "$", message: "Exact document review binding failed." });
  if (type === "project-document-review-decision") {
    const start = Date.parse(value.created_at), end = Date.parse(value.expires_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86400000) add("PROJECT_REVIEW_VALIDITY_INVALID");
    if (!value.decision_reference.trim()) add("PROJECT_REVIEW_DECISION_REFERENCE_EMPTY");
  }
  if (type === "project-document-review-proposal") {
    issues.push(...packets.packetIssues(value));
    if (!equal(Object.keys(value.screening_sources).sort(), [...SOURCES].sort())) add("PROJECT_REVIEW_SCREENING_BINDING_INVALID");
    if (value.checks.length !== value.documents.length + 2 || value.checks[0]?.scope !== "task_and_recipient" ||
        value.checks[1]?.scope !== "outbound_metadata" || value.checks.slice(0, 2).some(row => row.status !== "no_findings") ||
        value.documents.some((doc, index) => {
          const row = value.checks[index + 2];
          return row?.scope !== "document" || row.document_index !== index || row.delivery_mode !== doc.delivery_mode ||
            (doc.delivery_mode === "reference_only" ? row.status !== "reference_only_not_read"
              : row.source_sha256 !== doc.source_sha256 || row.delivered_sha256 !== doc.delivered_sha256);
        })) add("PROJECT_REVIEW_CHECK_BINDING_INVALID");
  }
  return issues;
}

function buildProposal(request, repository, id) {
  const sources = screeningSources(), checks = [];
  const candidate = packets.compileReviewCandidate(request, repository, row => checks.push(row));
  if (!equal(sources, screeningSources())) fail("PROJECT_REVIEW_SCREENING_CHANGED");
  const proposal = { schema_version: "0.1", type: "ProjectDocumentReviewProposal", id,
    request: candidate.request, source_repository: candidate.source_repository, documents: candidate.documents,
    checks, screening_sources: sources, authorization_verified: false, release_authorized: false };
  validate(proposal, "project-document-review-proposal");
  return proposal;
}

function proposeReview(request, repository) {
  const root = packets.repositoryIdentity(repository).root, id = randomUUID();
  packets.outputParent(root, false, OUTPUT);
  const proposal = buildProposal(request, root, id), bytes = JSON.stringify(proposal, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > MAX) fail("PROJECT_REVIEW_TOO_LARGE");
  if (!equal(proposal, buildProposal(request, root, id))) fail("PROJECT_REVIEW_SOURCE_CHANGED");
  const directory = path.join(packets.outputParent(root, true, OUTPUT), id);
  fs.mkdirSync(directory, { mode: 0o700 });
  const file = path.join(directory, "review.json");
  fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  fs.writeFileSync(path.join(directory, "review.md"), ["# Private Document Review Proposal", "",
    "For the authorized source reviewer and USER only. Do not send this proposal or treat it as a cleared packet.",
    "Review the exact task, recipient, original sources, proposed representations and findings below.",
    "Approval is limited to preparing these exact bytes. It never authorizes publication, tool execution or a recipient transfer.",
    "Representations replace selected locations with source IDs, the target root with the declared project handle and the bound doctrine root with CORPUS-CONTROLS. All other bytes remain unchanged.",
    "Confirm that no actual secret values are present and that requirements, prohibitions and source relationships remain intact.",
    "Record an actual USER decision in decision.json beside review.json; do not fabricate one from this template or verification consent.",
    `Proposal SHA-256: ${sha256(bytes)}`, "", "```json", bytes.trimEnd(), "```", ""].join("\n"), { flag: "wx", mode: 0o600 });
  return { status: "requires_exact_user_review", proposal_path: file, proposal_sha256: sha256(bytes),
    review_path: path.join(directory, "review.md"), decision_path: path.join(directory, "decision.json"),
    document_count: proposal.documents.length, finding_scope_count: proposal.checks.filter(row => row.status === "content_review_required").length,
    representation_count: proposal.documents.filter(row => row.delivery_mode === "representation").length,
    authorization_verified: false, execution_authorized: false, release_authorized: false, packet_written: false };
}

function readReview(repository, binding, now = Date.now()) {
  const root = packets.repositoryIdentity(repository).root;
  if (!binding || !equal(Object.keys(binding).sort(), ["decision_sha256", "proposal_path", "proposal_sha256"]) ||
      !digestPattern.test(binding.proposal_sha256) || !digestPattern.test(binding.decision_sha256) ||
      typeof binding.proposal_path !== "string" || !/^\.cannae\/document-reviews\/[a-f0-9-]{36}\/review\.json$/.test(binding.proposal_path)) fail("PROJECT_REVIEW_BINDING_INVALID");
  packets.outputParent(root, false, OUTPUT);
  const file = path.join(root, binding.proposal_path), directory = path.dirname(file);
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("PROJECT_REVIEW_LOCATION_INVALID");
  const bytes = packets.readOutput(file, MAX), decisionBytes = packets.readOutput(path.join(directory, "decision.json"), 16384);
  if (sha256(bytes) !== binding.proposal_sha256 || sha256(decisionBytes) !== binding.decision_sha256) fail("PROJECT_REVIEW_DIGEST_MISMATCH");
  const proposal = parse(bytes), decision = parse(decisionBytes);
  validate(proposal, "project-document-review-proposal"); validate(decision, "project-document-review-decision");
  if (proposal.id !== path.basename(directory) || decision.proposal_sha256 !== binding.proposal_sha256) fail("PROJECT_REVIEW_PROPOSAL_MISMATCH");
  if (decision.decision !== "approve_preparation") fail("PROJECT_REVIEW_REVOKED");
  if (!Number.isFinite(now) || Date.parse(decision.created_at) > now || Date.parse(decision.expires_at) <= now) fail("PROJECT_REVIEW_NOT_CURRENT");
  if (!equal(proposal.screening_sources, screeningSources())) fail("PROJECT_REVIEW_SCREENING_CHANGED");
  if (!equal(proposal.source_repository, packets.repositoryIdentity(root))) fail("PROJECT_REVIEW_ORIGIN_CHANGED");
  return proposal;
}

function compileReviewed(repository, binding, now = Date.now()) {
  const proposal = readReview(repository, binding, now);
  const fresh = buildProposal(proposal.request, repository, proposal.id);
  if (!equal(proposal, fresh)) fail("PROJECT_REVIEW_SOURCE_CHANGED");
  const packet = { schema_version: "0.2", type: "ProjectDocumentPacket", request: fresh.request,
    source_repository: fresh.source_repository, documents: fresh.documents, status: "pending_review",
    authorization_verified: false, execution_authorized: false, release_authorized: false, receiver_acceptance_verified: false,
    content_review: structuredClone(binding) };
  validate(packet, "project-document-packet");
  return packet;
}

function assertReviewedPacket(packet) {
  const fresh = compileReviewed(packet.source_repository.root, packet.content_review);
  if (!equal(packet, fresh)) fail("PROJECT_REVIEW_PACKET_MISMATCH");
}

function prepareReviewed(repository, binding) {
  return packets.writePacket(compileReviewed(repository, binding), repository, () => compileReviewed(repository, binding));
}

function main(argv = process.argv.slice(2)) {
  try {
    const [command, ...args] = argv, values = {};
    const required = command === "propose-review" ? ["repository", "request"]
      : command === "prepare-reviewed" ? ["repository", "proposal", "proposal-sha256", "decision-sha256"] : [];
    if (!required.length || args.length !== required.length * 2) fail("PROJECT_REVIEW_USAGE");
    for (let i = 0; i < args.length; i += 2) {
      const name = args[i].slice(2);
      if (!args[i].startsWith("--") || !required.includes(name) || Object.hasOwn(values, name) || !args[i + 1] || args[i + 1].startsWith("--")) fail("PROJECT_REVIEW_USAGE");
      values[name] = args[i + 1];
    }
    let result;
    if (command === "propose-review") result = proposeReview(JSON.parse(packets.readOutput(path.resolve(values.request), 128 * 1024)), values.repository);
    else {
      const root = packets.repositoryIdentity(values.repository).root;
      result = prepareReviewed(root, { proposal_path: path.relative(root, path.resolve(values.proposal)).split(path.sep).join("/"),
        proposal_sha256: values["proposal-sha256"], decision_sha256: values["decision-sha256"] });
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(/^PROJECT_(?:PACKET|REVIEW)_[A-Z_]+$/.test(error.message) ? error.message : "PROJECT_REVIEW_INPUT_UNAVAILABLE");
    process.exitCode = 1;
  }
}

module.exports = { reviewIssues, buildProposal, proposeReview, compileReviewed, assertReviewedPacket, prepareReviewed, main };
if (require.main === module) main();
