const fs = require("node:fs"), path = require("node:path"), { digest } = require("../order-intake-contract");
const ref = id => ({ artifact_id: id, relative_path: `repositories/fixture/missions/MIS-SYNTHETIC/W1/controls/${id}.json`, sha256: "1".repeat(64) });
const body = { schema_version: "0.1", type: "ReadinessDropReconciliation", observed_at: "2026-10-24T00:00:00Z",
  repository_key: "fixture", initial_manifest_sha256: "2".repeat(64),
  results: [{ lease_ref: ref("ADL-SYNTHETIC"), event_refs: [ref("RE-SYNTHETIC")], status: "revoked", checkpoint_ref: ref("AEC-SYNTHETIC") }],
  registry_complete: false, requalification_supported: false, execution_authorized: false, release_authorized: false, human_final_decision_authority: "USER" };
for (const [prefix, value] of [["valid", body], ["invalid", { ...body, release_authorized: true }]]) {
  const payload = { ...value, id: `RDR-${digest(value).slice(0, 40)}` };
  fs.writeFileSync(path.join(__dirname, `../sample-payloads/${prefix}-readiness-drop-reconciliation.json`), JSON.stringify(payload, null, 2) + "\n");
}
console.log("Wrote two synthetic structural examples, not retained revocation or readiness proof.");
