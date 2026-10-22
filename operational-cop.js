const crypto = require("node:crypto"), fs = require("node:fs"), path = require("node:path");
const { resolveRepository, manifestDigest } = require("./repository-artifact-store");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { readEntry, entryId } = require("./operator-console-evidence");
const { requireThat } = require("./operator-console-auth");
const { validatePayload } = require("./validator-cli-prototype/validate");
const terminal = require("./campaign-terminal-controller");
const dispatch = require("./dispatch-runtime-controller");
const { ROLES, LIMITS, READ_ONLY } = require("./operational-cop-contract");
const ACTIVITY = new Set(["mission-wave-plans", "routing-preflights", "agent-context-packs", "mission-wave-reports", "mission-wave-closeouts",
  "mission-wave-terminations", "dispatch-lease-issuance-requests", "dispatch-lease-issuance-resolutions", "agent-dispatch-leases",
  "tool-admission-events", "agent-execution-checkpoints", "tool-gateway-transaction-events", "tool-execution-receipts",
  "tool-effect-settlements", "gateway-effect-settlements", "method-deviation-events", "initiative-deviation-reports", "method-control-deliveries"]);
const same = dispatch.inputDigest;
const scopeKey = value => `${value.mission_id}\0${value.wave_id}`;
const reference = entry => ({ artifact_id: entry.artifact_id, relative_path: entry.relative_path, sha256: entry.sha256 });
const evidence = entry => ({ id: entryId(entry), artifact_id: entry.artifact_id, kind: entry.kind, sha256: entry.sha256 });
const excerpt = value => {
  let result = "";
  for (const character of value || "") { if (result.length + character.length > 400) break; result += character; }
  return result;
};
const time = value => { const result = Date.parse(value); requireThat(Number.isFinite(result), "CONSOLE_COP_TIME_INVALID", 409); return result; };
const readable = (user, entry) => user.role === "owner" || user.missions.includes(entry.mission_id);
function validated(value) {
  const result = validatePayload(value, "operational-cop");
  requireThat(result.valid, "CONSOLE_COP_RESPONSE_INVALID", 409);
  return value;
}

function queryOperationalCop(configuration, user, request = {}, options = {}) {
  requireThat(Object.keys(request).every(key => ["action", "mission", "role"].includes(key)) &&
    (!request.action || request.action === "operations") && (!request.role || ROLES.includes(request.role)) &&
    (!request.mission || /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(request.mission)), "CONSOLE_COP_QUERY_INVALID");
  requireThat(user && ["owner", "viewer"].includes(user.role) && Array.isArray(user.missions), "CONSOLE_COP_PRINCIPAL_INVALID", 403);
  const repository = resolveRepository(configuration.repository);
  requireThat(repository.identity_fingerprint === configuration.identity && repository.key === configuration.repositoryKey,
    "CONSOLE_REPOSITORY_IDENTITY_CHANGED", 409);
  const asOf = options.now || new Date().toISOString(), now = time(asOf);
  const base = { schema_version: "0.1", type: "OperationalCopSnapshot", as_of: asOf,
    snapshot_valid_until: new Date(now + LIMITS.snapshot_seconds * 1000).toISOString(),
    audience: { account_role: user.role, mission_filter: request.mission || null, role_filter: request.role || null,
      role_filter_is_authority: false }, classification: "restricted", ...READ_ONLY };
  const namespace = path.join(configuration.artifactRoot, "repositories", configuration.repositoryKey);
  const namespaceStat = fs.lstatSync(namespace, { throwIfNoEntry: false });
  requireThat(!namespaceStat || (namespaceStat.isDirectory() && !namespaceStat.isSymbolicLink()), "CONSOLE_COP_NAMESPACE_INVALID", 409);
  if (!namespaceStat) return validated({ ...base, manifest_sha256: "none", manifest_revision: 0,
    waves: [], alerts: [], roles: [], visible_wave_count: 0, matching_wave_count: 0, critical_count: 0, next_boundary_at: null });
  const store = loadVerifiedStore(configuration.repository, configuration.artifactRoot), digest = manifestDigest(store.manifest);
  const visible = store.manifest.artifacts.filter(entry => readable(user, entry));
  const plans = visible.filter(entry => entry.kind === "mission-wave-plans");
  requireThat(plans.length <= LIMITS.waves, "CONSOLE_COP_CAPACITY", 503);
  requireThat(new Set(plans.map(scopeKey)).size === plans.length, "CONSOLE_COP_PLAN_AMBIGUOUS", 409);
  let bytesRead = 0, agentCount = 0, currentRepositoryState;
  const cache = new Map(), alerts = [], alertMap = new Map(), boundaries = [];
  function read(entry, type) {
    if (!cache.has(entry.relative_path)) {
      const text = readEntry(store, entry); bytesRead += Buffer.byteLength(text);
      requireThat(bytesRead <= LIMITS.source_bytes, "CONSOLE_COP_CAPACITY", 503);
      cache.set(entry.relative_path, JSON.parse(text));
    }
    const payload = cache.get(entry.relative_path);
    requireThat((payload.id === undefined || payload.id === entry.artifact_id) && payload.mission_id === entry.mission_id &&
      (payload.wave_id === undefined || payload.wave_id === entry.wave_id) && (!type || validatePayload(payload, type).valid),
    "CONSOLE_COP_RECORD_INVALID", 409);
    return { payload, entry, ref: reference(entry) };
  }
  function alert(scope, code, severity, entries, agents = []) {
    const selected = [...new Map(entries.filter(Boolean).map(entry => [entry.relative_path, entry])).values()];
    const id = crypto.createHash("sha256").update(`${scopeKey(scope)}\0${code}`).digest("hex"), existing = alertMap.get(id);
    if (existing) {
      existing.agent_ids = [...new Set([...existing.agent_ids, ...agents])].sort();
      const sources = [...new Map([...existing.evidence, ...selected.map(evidence)].map(item => [item.id, item])).values()];
      existing.evidence = sources.slice(0, 8); existing.evidence_truncated ||= sources.length > 8;
      return;
    }
    requireThat(alerts.length < LIMITS.alerts, "CONSOLE_COP_CAPACITY", 503);
    const value = { id,
      mission_id: scope.mission_id, wave_id: scope.wave_id, code, severity,
      agent_ids: [...new Set(agents)].sort(), evidence: selected.slice(0, 8).map(evidence), evidence_truncated: selected.length > 8 };
    alerts.push(value); alertMap.set(id, value);
  }
  const plannedScopes = new Set(plans.map(scopeKey));
  for (const item of visible.filter(entry => ACTIVITY.has(entry.kind) && !plannedScopes.has(scopeKey(entry)))) {
    if (["routing-preflights", "agent-context-packs"].includes(item.kind)) continue;
    alert(item, "ORPHANED_RUNTIME_HISTORY", "critical", [item]);
  }
  const entryFor = ref => store.manifest.artifacts.find(entry => same(reference(entry)) === same(ref));
  const projection = plans.length ? dispatch.historicalDispatchStatus({ repository: configuration.repository, artifactRoot: configuration.artifactRoot },
    { revision: store.manifest.manifest_revision, sha256: digest }) : { leases: [], issuances: [], unresolved_gateway_obligations: [] };
  const stops = new Map();
  for (const mission of new Set(plans.map(entry => entry.mission_id))) {
    stops.set(mission, require("./campaign-stop-controller").missionStopRecords(store, mission));
  }
  const allWaves = plans.map(entry => {
    const scoped = visible.filter(item => scopeKey(item) === scopeKey(entry));
    const statuses = [], waveAlerts = [];
    const add = (code, severity, source = [entry], agents = []) => { alert(entry, code, severity, source, agents); if (!waveAlerts.includes(code)) waveAlerts.push(code); };
    const latest = scoped.filter(item => ACTIVITY.has(item.kind)).reduce((last, item) => time(item.created_at) > time(last.created_at) ? item : last, entry);
    const age = Math.max(0, Math.floor((now - time(latest.created_at)) / 1000));
    const freshness = time(latest.created_at) > now ? "future" : age > LIMITS.stale_seconds ? "stale" : "fresh";
    const result = { mission_id: entry.mission_id, wave_id: entry.wave_id, title: "Unverified plan", objective_excerpt: "",
      title_truncated: false, objective_truncated: false, state: "history_unverified", recorded_at: latest.created_at, freshness, age_seconds: age,
      plan: evidence(entry), ending: null, valid_until: null, agents: [], attention_codes: waveAlerts };
    let plan;
    try { plan = read(entry, "mission-wave-plan"); requireThat(time(plan.payload.created_at) <= now, "CONSOLE_COP_PLAN_FUTURE", 409); }
    catch (error) { if (error.message === "CONSOLE_COP_CAPACITY") throw error; add("WAVE_HISTORY_UNVERIFIED", "critical"); return result; }
    const value = plan.payload;
    agentCount += value.agents.length; requireThat(agentCount <= LIMITS.agents, "CONSOLE_COP_CAPACITY", 503);
    result.title = excerpt(value.title); result.objective_excerpt = excerpt(value.objective);
    result.title_truncated = value.title.length > result.title.length;
    result.objective_truncated = value.objective.length > result.objective_excerpt.length; result.valid_until = value.valid_until;
    result.agents = value.agents.map(agent => ({ agent_id: agent.agent_id, role: agent.operational_role, department: agent.department,
      task_excerpt: excerpt(agent.task), task_truncated: agent.task.length > excerpt(agent.task).length,
      recorded_lease_status: "none", result_pending: false, lease_valid_until: null }));
    let historyValid = true;
    const exactlyOne = (kind, type) => {
      const matches = scoped.filter(item => item.kind === kind);
      requireThat(matches.length === 1, "CONSOLE_COP_RECORD_REQUIRED", 409);
      return read(matches[0], type);
    };
    try {
      const preflight = terminal.verifyWavePreflightHistory(store, plan);
      requireThat(!scoped.some(item => ACTIVITY.has(item.kind) && time(item.created_at) > now), "CONSOLE_COP_ACTIVITY_FUTURE", 409);
      const contexts = scoped.filter(item => item.kind === "agent-context-packs");
      requireThat(contexts.length === value.agents.length, "CONSOLE_COP_CONTEXT_REQUIRED", 409);
      for (const agent of value.agents) {
        const matches = contexts.map(item => read(item, "agent-context-pack")).filter(item => item.payload.agent_id === agent.agent_id);
        requireThat(matches.length === 1 && matches[0].payload.schema_version === "0.4" && matches[0].payload.status === "ready" &&
          same(matches[0].payload.plan_ref) === same(plan.ref) && same(matches[0].payload.routing_preflight_ref) === same(preflight.ref),
        "CONSOLE_COP_CONTEXT_REQUIRED", 409);
        terminal.verifyWaveContextHistory(store, plan, matches[0]);
      }
      result.state = "context_recorded";
      const endings = scoped.filter(item => ["mission-wave-closeouts", "mission-wave-terminations"].includes(item.kind));
      requireThat(endings.length <= 1, "CONSOLE_COP_ENDING_AMBIGUOUS", 409);
      if (endings.length) {
        const termination = endings[0].kind === "mission-wave-terminations";
        const ending = exactlyOne(endings[0].kind, termination ? "mission-wave-termination" : "mission-wave-closeout");
        requireThat(time(ending.entry.created_at) <= now, "CONSOLE_COP_ENDING_FUTURE", 409);
        if (termination) terminal.verifyTermination(store, plan, ending); else terminal.verifyWaveCloseoutHistory(store, plan, ending);
        result.state = termination ? `terminated_${ending.payload.status}` : `closed_${ending.payload.status}`;
        result.ending = evidence(endings[0]);
      }
    } catch (error) {
      if (error.message === "CONSOLE_COP_CAPACITY") throw error;
      historyValid = false; result.state = "history_unverified"; add("WAVE_HISTORY_UNVERIFIED", "critical");
    }
    const ended = historyValid && !!result.ending;
    const leases = projection.leases.filter(item => scopeKey(item) === scopeKey(entry));
    const issuances = projection.issuances.filter(item => scopeKey(item) === scopeKey(entry));
    for (const agent of result.agents) {
      const heads = leases.filter(item => item.agent_id === agent.agent_id && item.status !== "superseded");
      if (heads.length > 1) { add("LEASE_HISTORY_AMBIGUOUS", "critical", heads.map(item => entryFor(item.lease_ref)), [agent.agent_id]); continue; }
      const lease = heads[0]; if (!lease) continue;
      agent.recorded_lease_status = lease.status; agent.result_pending = lease.pending_tool_requests > 0; agent.lease_valid_until = lease.expires_at;
      const terminalLease = ["completed", "revoked", "superseded"].includes(lease.status);
      const sources = [entryFor(lease.lease_ref), ...lease.unresolved_effect_checkpoint_refs.map(entryFor)];
      if (lease.unresolved_tool_effects || lease.unresolved_gateway_transactions || lease.failed_effect_revocation_required) {
        add("UNRESOLVED_EXECUTION_OBLIGATION", "critical", sources, [agent.agent_id]); statuses.push("execution_held");
      }
      if (agent.result_pending) { add("TOOL_RESULT_PENDING", terminalLease ? "critical" : "warning", sources, [agent.agent_id]); statuses.push("result_pending"); }
      if (!terminalLease) {
        if (time(lease.expires_at) <= now) { add("LEASE_EXPIRED", "critical", sources, [agent.agent_id]); statuses.push("execution_held"); }
        else boundaries.push(lease.expires_at);
        if (lease.legacy_result_only) { add("LEGACY_RESULT_ONLY", "critical", sources, [agent.agent_id]); statuses.push("execution_held"); }
        if (issuances.some(item => item.planned_lease_id === lease.lease_id && !item.runtime_source_current)) {
          add("RUNTIME_SOURCE_CHANGED", "critical", sources, [agent.agent_id]); statuses.push("execution_held");
        }
        if (user.role === "owner") {
          const selected = dispatch.activeLease({ repository: configuration.repository, artifactRoot: configuration.artifactRoot, now: asOf },
            { missionId: entry.mission_id, waveId: entry.wave_id, agentId: agent.agent_id, provider: lease.provider,
              sessionId: lease.session_binding.session_id, providerAgentId: lease.session_binding.provider_agent_id });
          if (selected.code !== "LEASE_ACTIVE") {
            if (!(selected.code === "LEASE_EXPIRED" && waveAlerts.includes("LEASE_EXPIRED"))) add("CURRENT_LEASE_GATE_HELD", "critical", sources, [agent.agent_id]);
            statuses.push("execution_held");
          }
          else {
            if (!agent.result_pending) {
              currentRepositoryState ||= dispatch.runtimeRepositoryState(configuration.repository);
              if (!dispatch.sameRepositoryState(currentRepositoryState, selected.checkpointRecord.payload.repository_state)) {
                add("CURRENT_REPOSITORY_DRIFT", "critical", sources, [agent.agent_id]); statuses.push("execution_held");
              }
            }
            try { require("./method-control-broker").assertWorkReady({ repository: configuration.repository, artifactRoot: configuration.artifactRoot, now: asOf }, lease.lease_ref, store); }
            catch { add("METHOD_CHANNEL_HELD", "critical", sources, [agent.agent_id]); statuses.push("execution_held"); }
          }
        }
      }
    }
    const unfinished = issuances.filter(item => item.status === "pending");
    if (unfinished.length) { add("DISPATCH_ISSUANCE_PENDING", "critical", unfinished.map(item => entryFor(item.issuance_ref))); statuses.push("execution_held"); }
    const gateway = projection.unresolved_gateway_obligations.filter(item => {
      const source = entryFor(item.request_ref); return source && scopeKey(source) === scopeKey(entry);
    });
    if (gateway.length) { add("GATEWAY_OBLIGATION_PENDING", "critical", gateway.map(item => entryFor(item.request_ref))); statuses.push("execution_held"); }
    if (!ended) {
      try { require("./skill-mission-controller").assertAdaptiveCampaignMayContinue(value,
        { repository: configuration.repository, artifactRoot: configuration.artifactRoot, now: asOf }); }
      catch {
        add(stops.get(entry.mission_id).length ? "MISSION_CONTINUATION_HELD" : "ORDER_OR_CAMPAIGN_HELD", "critical",
          stops.get(entry.mission_id).length ? stops.get(entry.mission_id).map(item => item.entry) : [entry]);
        statuses.push("stop_recorded");
      }
    }
    if (!ended && time(value.valid_until) <= now) { add("WAVE_EXPIRED", "critical"); statuses.push("expired_pending_termination"); }
    else if (!ended) boundaries.push(value.valid_until);
    if (!ended && freshness !== "fresh") add(freshness === "future" ? "FUTURE_RECORDED_ACTIVITY" : "ACTIVITY_STALE", "warning", [latest]);
    if (historyValid && statuses.length) result.state = statuses.includes("execution_held") ? "execution_held"
      : statuses.includes("stop_recorded") ? "stop_recorded" : statuses.includes("expired_pending_termination") ? "expired_pending_termination" : "result_pending";
    if (ended && statuses.length) result.state = "terminal_with_obligations";
    return result;
  });
  const roles = [...new Set(allWaves.flatMap(wave => wave.agents.map(agent => agent.role)))].sort();
  const waves = allWaves.filter(wave => (!request.mission || wave.mission_id === request.mission) &&
    (!request.role || wave.agents.some(agent => agent.role === request.role)))
    .map(wave => ({ ...wave, agents: wave.agents.filter(agent => !request.role || agent.role === request.role) }))
    .sort((a, b) => time(b.recorded_at) - time(a.recorded_at) || scopeKey(a).localeCompare(scopeKey(b)));
  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1) || a.mission_id.localeCompare(b.mission_id) || a.wave_id.localeCompare(b.wave_id) || a.code.localeCompare(b.code));
  requireThat(manifestDigest(loadVerifiedStore(configuration.repository, configuration.artifactRoot).manifest) === digest,
    "CONSOLE_COP_SNAPSHOT_CHANGED", 409);
  requireThat(options.now || Date.now() < now + LIMITS.snapshot_seconds * 1000, "CONSOLE_COP_SNAPSHOT_EXPIRED", 409);
  return validated({ ...base, manifest_sha256: digest, manifest_revision: store.manifest.manifest_revision,
    visible_wave_count: allWaves.length, matching_wave_count: waves.length, waves, alerts, roles,
    critical_count: alerts.filter(item => item.severity === "critical").length,
    next_boundary_at: boundaries.length ? boundaries.sort((a, b) => time(a) - time(b))[0] : null });
}

module.exports = { queryOperationalCop, ROLES, LIMITS, READ_ONLY };
