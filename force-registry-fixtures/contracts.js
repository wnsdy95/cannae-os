const crypto = require("node:crypto"), c = require("../force-registry-contract"), { sha256 } = require("../order-intake-contract");
const { signOperatorRecord } = require("../operator-consent-contract");
// A deterministic public test key, never an installed operator identity.
const seed = crypto.createHash("sha256").update("synthetic-force-registry-contract-key-not-for-production").digest();
const privateKey = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
const publicKey = crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" });
const clone = value => JSON.parse(JSON.stringify(value));
function entity(kind = "organization", id = "ORG-FIXTURE", data = { kind: "organization", parent_id: "none", maintainer_roles: ["USER", "COS"] }, version = 1) {
  return { schema_version: "0.1", type: "ForceRegistryEntity", id, kind, version, enrollment_state: "enrolled", label: `Synthetic ${kind}`,
    description: "Synthetic structural definition, not a qualified performer.", data, qualification_state: "unassessed", execution_authorized: false, release_authorized: false };
}
const organization = (id = "ORG-FIXTURE", version = 1, parent = "none", enrollment = "enrolled") => ({ ...entity("organization", id,
  { kind: "organization", parent_id: parent, maintainer_roles: ["USER", "COS"] }, version), enrollment_state: enrollment });
const capability = (reference, id = "CAP-FIXTURE", aliases = [{ operational_role: "S3", task: "Synthetic scoped task." }], version = 1, owner = "ORG-FIXTURE") => entity("capability", id,
  { kind: "capability", owner_id: owner, metl_id: "METL-FIXTURE", standard_ref: reference, aliases }, version);
const performer = (id = "PERF-FIXTURE", version = 1, owner = "ORG-FIXTURE") => entity("performer", id, { kind: "performer", owner_id: owner,
  provider: "codex", principal_sha256: "1".repeat(64), model_id: "synthetic-test-model", model_revision: "synthetic-revision-001", harness_sha256: "2".repeat(64),
  prompt_sha256: "3".repeat(64), tool_schema_sha256: "4".repeat(64), tool_policy_sha256: "5".repeat(64), execution_profile_sha256: "6".repeat(64) }, version);
function samples() {
  const value = organization(), request = c.createRequest({ mission_id: "MIS-FORCE-FIXTURE", wave_id: "ENROLL", operation: "enroll", expected_head_ref: { ...c.NONE },
    entity: value, rationale: "Synthetic definition enrollment only.", evidence_refs: [] }), proposal = c.createProposal(request, "2026-10-24T00:00:00Z");
  const proposalRef = { artifact_id: proposal.id, relative_path: "synthetic/proposal.json", sha256: sha256(Buffer.from(JSON.stringify(proposal, null, 2) + "\n")) };
  const review = { proposal_ref: proposalRef, proposal, materials: [], registry_head_ref: { ...c.NONE }, previous_entity: null, next_sequence: 1,
    repository_binding: { repository_key: "synthetic-fixture", identity_fingerprint: "a".repeat(64) }, observed_manifest: { revision: 1, sha256: "b".repeat(64) },
    source_state_sha256: "c".repeat(64), repository_state_sha256: "d".repeat(64) };
  const challenge = "00000000-0000-4000-8000-000000000001";
  const authorization = signOperatorRecord({ schema_version: "0.1", type: "ForceRegistryAuthorization", id: `FRA-${challenge}`, purpose: "force_registry_enrollment",
    acknowledgment: "definition_only_no_qualification_or_execution", challenge_id: challenge, principal_id: "synthetic-owner", principal_epoch: 1,
    authentication_method: "local_owner_password_reauthentication", session_sha256: "e".repeat(64), nonce_sha256: "f".repeat(64), created_at: "2026-10-24T00:00:01Z",
    expires_at: "2026-10-24T00:01:00Z", rationale: "Synthetic signed example only.", review: c.publicReview(review), review_sha256: c.digest(c.publicReview(review)),
    displayed_review_sha256: c.digest(review), ...c.FLAGS }, privateKey.export({ type: "pkcs8", format: "pem" }));
  const authorizationRef = { artifact_id: authorization.id, relative_path: "synthetic/authorization.json", sha256: sha256(Buffer.from(JSON.stringify(authorization, null, 2) + "\n")) };
  return { "force-registry-entity": value, "force-registry-request": request, "force-registry-proposal": proposal,
    "force-registry-authorization": authorization, "force-registry-event": c.eventForAuthorization(authorization, authorizationRef) };
}
module.exports = { samples, entity, organization, capability, performer, publicKey, clone };
