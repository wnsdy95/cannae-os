const fs = require("node:fs"), path = require("node:path");
const contract = require("../dispatch-issuance-contract"), { digest } = require("../order-intake-contract");
const clone = value => structuredClone(value);
const none = () => ({ artifact_id: "none", relative_path: "none", sha256: "none" });
const ref = id => ({ artifact_id: id, relative_path: `repositories/fixture/missions/MIS-FIXTURE/W1/controls/${id}.json`, sha256: "1".repeat(64) });
const rekey = value => { const { id, ...body } = value; return { ...value, id: `DLI-${digest(body).slice(0, 40)}` }; };
function samples() {
  const draft = JSON.parse(fs.readFileSync(path.join(__dirname, "../sample-payloads/valid-agent-dispatch-lease.json"), "utf8"));
  draft.schema_version = "0.1"; delete draft.issuance_ref; draft.previous_lease_ref = none(); draft.issuance_reason = "initial";
  draft.not_before = draft.issued_at;
  const scope = { mission_id: draft.mission_id, wave_id: draft.wave_id, agent_id: draft.agent_id };
  const request = contract.identified("DispatchLeaseIssuanceRequest", { ...scope, planned_lease: draft, interruption_checkpoint_ref: none(),
    planned_supersession: null, channel_observation_ref: none(), observed_manifest: { revision: 1, sha256: "2".repeat(64) },
    runtime_sha256: contract.runtimeDigest(), recorded_at: draft.issued_at, expires_at: draft.expires_at });
  const resolution = contract.identified("DispatchLeaseIssuanceResolution", { ...scope, request_ref: ref(request.id), outcome: "committed",
    lease_ref: ref(draft.id), baseline_ref: ref("AEC-FIXTURE"), supersession_ref: none(), reason: "Synthetic contract example; not actual authority.", recorded_at: draft.issued_at });
  return { "dispatch-lease-issuance-request": request, "dispatch-lease-issuance-resolution": resolution,
    "agent-dispatch-lease-issuance": contract.leaseForRequest({ payload: request, ref: ref(request.id) }) };
}
module.exports = { samples, rekey, clone, none, ref };
