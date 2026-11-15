const TYPES = new Set(["operational-cop"]), NON_WORK_TYPES = new Set(["OperationalCopSnapshot"]);
const ROLES = Object.freeze(["USER", "COMMANDER", "COS", "S2", "S3", "S4", "S6", "RED_TEAM", "EVALUATOR", "EXECUTOR", "RECORDER"]);
const LIMITS = Object.freeze({ waves: 100, agents: 1000, source_bytes: 8 * 1024 * 1024, alerts: 2000, stale_seconds: 300, snapshot_seconds: 60 });
const READ_ONLY = Object.freeze({ approval_authorized: false, tool_execution_authorized: false, release_authorized: false,
  worker_liveness_verified: false, alerts_cover_visible_scope: true });
function issues(value, type) {
  if (!TYPES.has(type)) return [];
  const result = [], fail = (code, message) => result.push({ severity: "critical", code, path: "$", message });
  const duration = Date.parse(value.snapshot_valid_until) - Date.parse(value.as_of);
  if (!Number.isFinite(duration) || duration <= 0 || duration > LIMITS.snapshot_seconds * 1000) fail("COP_SNAPSHOT_VALIDITY_INVALID", "A snapshot has finite display validity, not execution authority.");
  if (value.matching_wave_count !== value.waves.length || value.visible_wave_count < value.matching_wave_count ||
      value.critical_count !== value.alerts.filter(item => item.severity === "critical").length ||
      new Set(value.waves.map(item => `${item.mission_id}\0${item.wave_id}`)).size !== value.waves.length ||
      new Set(value.alerts.map(item => item.id)).size !== value.alerts.length) fail("COP_SNAPSHOT_COUNTS_INVALID", "Wave and attention counts must describe the actual complete response.");
  if (value.manifest_sha256 === "none" && (value.manifest_revision !== 0 || value.waves.length || value.alerts.length || value.visible_wave_count)) fail("COP_EMPTY_STORE_INVALID", "No manifest cannot supply invented operational data.");
  if (value.waves.some(wave => (value.audience.mission_filter && wave.mission_id !== value.audience.mission_filter) ||
      (value.audience.role_filter && (!wave.agents.length || wave.agents.some(agent => agent.role !== value.audience.role_filter))))) {
    fail("COP_ROLE_VIEW_INVALID", "Display filters can narrow visible rows, never alter the authenticated principal or critical alert scope.");
  }
  return result;
}
module.exports = { TYPES, NON_WORK_TYPES, ROLES, LIMITS, READ_ONLY, issues };
