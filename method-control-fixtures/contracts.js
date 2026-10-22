const { identified, runtimeDigest } = require("../method-control-contract");
const { digest } = require("../order-intake-contract");
const clone = value => JSON.parse(JSON.stringify(value));
const reference = id => ({ artifact_id: id, relative_path: `repositories/fixture/missions/MIS-FIXTURE/W1/controls/${id}.json`, sha256: "1".repeat(64) });
const at = seconds => new Date(Date.parse("2026-10-22T00:00:00Z") + seconds * 1000).toISOString();
function policy() {
  return { schema_version: "0.1", type: "MethodControlChannelPolicy", transport: "mcp_stdio_reference",
    identity_assurance: "local_operator_enrollment_reference", runtime_sha256: runtimeDigest(), max_requests: 32,
    max_validity_seconds: 600, request_validity_seconds: 30, output_max_bytes: 65536 };
}
function samples() {
  const scope = { mission_id: "MIS-FIXTURE", wave_id: "W1", agent_id: "fixture-agent" };
  const slot = identified("MethodControlLaunchSlot", { ...scope, provider: "codex", plan_ref: reference("MWP-FIXTURE"), context_ref: reference("ACP-FIXTURE"),
    policy_ref: reference("DTP-FIXTURE"), repository_key: "fixture", repository_identity_fingerprint: "2".repeat(64), server_name: "cannae_method_fixture", runtime_sha256: runtimeDigest(),
    launch_descriptor_sha256: "3".repeat(64), credential_sha256: "4".repeat(64), identity_assurance: "local_operator_enrollment_reference", provider_startup_verified: false,
    recorded_at: at(0), expires_at: at(600) });
  const observation = identified("MethodControlSessionObservation", { ...scope, launch_slot_ref: reference(slot.id), provider: "codex",
    session_binding: { session_id: "fixture-session", provider_agent_id: "main" }, source: "startup", provider_startup_verified: false, recorded_at: at(0) });
  const enrollment = identified("MethodControlEnrollment", { ...scope, provider: "codex", session_binding: { session_id: "fixture-session", provider_agent_id: "main" },
    launch_slot_ref: reference(slot.id), session_observation_ref: reference(observation.id),
    plan_ref: reference("MWP-FIXTURE"), context_ref: reference("ACP-FIXTURE"), policy_ref: reference("DTP-FIXTURE"), lease_ref: reference("ADL-FIXTURE"),
    repository_key: "fixture", repository_identity_fingerprint: "2".repeat(64), server_name: "cannae_method_fixture", runtime_sha256: runtimeDigest(),
    launch_descriptor_sha256: "3".repeat(64), credential_sha256: "4".repeat(64), identity_assurance: "local_operator_enrollment_reference",
    provider_startup_verified: false, recorded_at: at(0), expires_at: at(600) });
  const input = { request_id: "fixture-request", step_id: "inspect", method_id: "short_read", rationale: "Synthetic schema fixture; no real agent or USER decision." };
  const request = identified("MethodControlRequest", { ...scope, enrollment_ref: reference(enrollment.id), checkpoint_ref: reference("AEC-FIXTURE"),
    operation: "method_propose", arguments: input, input_sha256: digest(input), tool_use_id: "fixture-tool", recorded_at: at(1), expires_at: at(31) });
  const receipt = identified("MethodControlReceipt", { ...scope, enrollment_ref: reference(enrollment.id), request_ref: reference(request.id),
    result: { kind: "proposal", deviation_ref: reference("MDEV-FIXTURE") }, recorded_at: at(2) });
  const delivery = identified("MethodControlDelivery", { ...scope, enrollment_ref: reference(enrollment.id), request_ref: reference(request.id), receipt_ref: reference(receipt.id),
    tool_use_id: "fixture-tool", provider_response_sha256: "5".repeat(64), via: "native_callback", recorded_at: at(3) });
  return { "method-control-channel-policy": policy(), "method-control-launch-slot": slot, "method-control-session-observation": observation,
    "method-control-enrollment": enrollment, "method-control-request": request,
    "method-control-receipt": receipt, "method-control-delivery": delivery,
    "method-control-response": { schema_version: "0.1", type: "MethodControlResponse", enrollment_ref: reference(enrollment.id),
      request_ref: reference(request.id), receipt_ref: reference(receipt.id), result: receipt.result, ...require("../method-control-contract").AUTHORITY } };
}
function rekey(value) { const { id, ...body } = value; return { ...value, id: `MCTL-${digest(body).slice(0, 40)}` }; }
module.exports = { clone, reference, policy, samples, rekey, at };
