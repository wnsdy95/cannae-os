const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), c = require("../training-session-contract"), t = require("../task-training-contract");
const { signOperatorRecord } = require("../operator-consent-contract");
const seed = crypto.createHash("sha256").update("synthetic-training-session-contract-example-not-an-owner-key").digest();
const key = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), type: "pkcs8", format: "der" });
const publicKey = crypto.createPublicKey(key).export({ type: "spki", format: "pem" });
const reference = artifact_id => ({ artifact_id, relative_path: `synthetic/${artifact_id}.json`, sha256: "a".repeat(64) });
function samples() {
  const lease = require("../dispatch-issuance-fixtures/contracts").samples()["agent-dispatch-lease-issuance"];
  const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, "../sample-payloads", `valid-${name}.json`)));
  const context = read("agent-context-pack"), policy = read("dispatch-tool-policy");
  lease.context_pack_ref = reference(context.id); lease.tool_policy_ref = reference(policy.id);
  const now = Date.parse(lease.issued_at), standard = require("../task-training-fixtures/contracts").standard(now);
  const f = require("../force-registry-fixtures/contracts"), capability = f.capability(reference(standard.id), "CAP-TRAINING"), performer = f.performer("PERF-TRAINING");
  const request = { mission_id: lease.mission_id, wave_id: lease.wave_id, capability_id: capability.id, performer_id: performer.id,
    expected_registry_head_ref: reference("FRE-HEAD"), lease_ref: reference(lease.id), stage: "crawl", case_ids: ["CASE-crawl-0"], expires_at: lease.expires_at };
  const proposal = c.proposal(request, lease.issued_at), review = { proposal_ref: reference(proposal.id), proposal, registry_head_ref: request.expected_registry_head_ref,
    repository_binding: { repository_key: "synthetic-training", identity_fingerprint: "b".repeat(64) }, observed_manifest: { revision: 1, sha256: "c".repeat(64) },
    source_state_sha256: "d".repeat(64), repository_state_sha256: "e".repeat(64), capability, performer, standard_ref: capability.data.standard_ref,
    standard, lease, context_ref: lease.context_pack_ref, context, policy_ref: lease.tool_policy_ref, policy };
  const challenge = "00000000-0000-4000-8000-000000000001";
  const authorization = c.checked(signOperatorRecord({ schema_version: "0.1", type: "TaskTrainingSessionAuthorization", id: `TSA-${challenge}`,
    purpose: c.PURPOSE, acknowledgment: c.ACK, challenge_id: challenge, principal_id: challenge, principal_epoch: 1,
    authentication_method: "local_owner_password_reauthentication", session_sha256: "1".repeat(64), nonce_sha256: "2".repeat(64),
    created_at: new Date(now + 1000).toISOString(), expires_at: new Date(now + 30000).toISOString(), rationale: "Synthetic contract example only.",
    review, review_sha256: t.digest(review), displayed_review_sha256: t.digest(review), ...t.FLAGS }, key.export({ type: "pkcs8", format: "pem" })), "training-session-authorization");
  const binding = t.checked(signOperatorRecord(c.bindingBody(authorization, reference(authorization.id)), key.export({ type: "pkcs8", format: "pem" })), "task-training-session-binding");
  return { "training-session-proposal": proposal, "training-session-authorization": authorization, "task-training-session-binding-current": binding };
}
module.exports = { samples, publicKey };
