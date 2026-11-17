"use strict";
const $ = selector => document.querySelector(selector);
let session, csrf, semanticUi, coverageUi, forceUi, trainingUi, authMode = "login", tab = "operations", snapshot, cursor, selectedUser;
let selectedProposal, decisionPreview, selectedAction, inspectedOutcome, terminalPreview;
let previewGeneration = 0;
let operationsData, operationsTimer, operationsPending = false, operationsGeneration = 0, operationsFailed = false, operationsReadAt = 0;
let sessionEpoch = 0, viewEpoch = 0, operationsRequest = 0;
const readSequences = new Map(), formRequests = new WeakMap();
const fragment = new URLSearchParams(location.hash.slice(1));
const suppliedToken = fragment.get("setup") || fragment.get("invite");
history.replaceState(null, "", "/");
if (fragment.has("invite")) authMode = "register";
if (fragment.has("setup")) authMode = "setup";

async function api(url, body) {
  const epoch = sessionEpoch;
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", headers: body === undefined ? {} :
    { "Content-Type": "application/json", "X-CSRF-Token": csrf }, method: body === undefined ? "GET" : "POST",
  body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) {
    if (epoch === sessionEpoch && response.status === 401 && !["/api/login", "/api/session"].includes(url)) await loadSession();
    throw new Error(data.error || "Request failed");
  }
  return data;
}
function error(selector, value) { $(selector).textContent = value?.message || ""; }
function currentView() { return { sessionEpoch, viewEpoch, principal: session?.user?.id }; }
function viewCurrent(value) { return value.sessionEpoch === sessionEpoch && value.viewEpoch === viewEpoch && value.principal === session?.user?.id; }
function beginRead(key) {
  const sequence = (readSequences.get(key) || 0) + 1; readSequences.set(key, sequence);
  return { ...currentView(), key, sequence };
}
function readCurrent(value) { return viewCurrent(value) && readSequences.get(value.key) === value.sequence; }
async function readResponse(url, scope) {
  try { return await api(url); } catch (failure) { if (readCurrent(scope)) throw failure; }
}
function clearWorkspace() {
  viewEpoch++; clearOperations(); clearDecision(); snapshot = cursor = selectedUser = null;
  semanticUi?.clear();
  forceUi?.clear();
  trainingUi?.clear();
  for (const selector of ["#artifacts", "#users", "#activity", "#decisions", "#detail-meta"]) $(selector).replaceChildren();
  for (const selector of ["#identity", "#repository", "#artifact-count", "#revision", "#detail-title", "#detail-content", "#deactivate-name", "#workspace-error", "#detail-error", "#deactivate-error"]) $(selector).textContent = "";
  for (const form of document.querySelectorAll("#workspace form, #detail form, #deactivate form")) form.reset();
  $("#detail").close(); $("#deactivate").close(); $("#invitation").hidden = true; $("#invitation-link").value = "";
  $("#more").hidden = true;
}
function cell(row, value, className) {
  const td = document.createElement("td"); td.textContent = value; if (className) td.className = className;
  row.append(td); return td;
}
function empty(table, columns, message) {
  table.replaceChildren(); const row = table.insertRow(); const td = cell(row, message, "empty"); td.colSpan = columns;
}
function displayTime(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString() : value; }
function renderAuth() {
  $("#auth").hidden = !!session?.user; $("#workspace").hidden = !session?.user;
  $("#auth-form button[type=submit]").disabled = !csrf;
  $("#auth-title").textContent = authMode === "setup" ? "Create Owner Account" : authMode === "register" ? "Accept Invitation" : "Operator Sign In";
  $("#auth-action").textContent = authMode === "login" ? "Sign In" : "Create Account";
  $("#token-label").hidden = authMode === "login";
  $("#auth-form").elements.password.autocomplete = authMode === "login" ? "current-password" : "new-password";
  $("#register-mode").textContent = authMode === "register" ? "Back to Sign In" : "Use Invitation";
  $("#register-mode").hidden = authMode === "setup";
}
async function loadSession() {
  const epoch = ++sessionEpoch; clearWorkspace(); session = null; csrf = null; renderAuth();
  let data;
  try { data = await api("/api/session"); } catch (failure) { if (epoch === sessionEpoch) throw failure; return; }
  if (epoch !== sessionEpoch) return;
  session = data; csrf = session.csrf_token;
  if (!session.initialized) authMode = "setup";
  renderAuth();
  if (!session.user) { clearDecision(); $("#detail").close(); $("#deactivate").close(); return; }
  $("#identity").textContent = `${session.user.username} / ${session.user.role}`;
  $("#operator-mode").textContent = session.user.role === "owner" ? "Order review" : "Read-only";
  $("#review-mode").textContent = session.user.role === "owner" ? "Order review: owner" : "Order review: disabled";
  $("#repository").textContent = session.repository.label;
  document.querySelectorAll("[data-owner]").forEach(element => { element.hidden = session.user.role !== "owner"; });
  if (session.user.role !== "owner" && ["access", "activity", "decisions", "semantic", "force", "training"].includes(tab)) tab = "operations";
  await showTab(tab);
}
async function showTab(next) {
  viewEpoch++; clearDecision(); $("#detail").close(); $("#detail-content").textContent = ""; $("#detail-meta").replaceChildren();
  operationsGeneration++; operationsRequest++; operationsPending = false; clearInterval(operationsTimer);
  tab = next; error("#workspace-error");
  document.querySelectorAll("[data-tab]").forEach(button => { button.setAttribute("aria-current", button.dataset.tab === tab ? "page" : "false"); });
  $("#view-title").textContent = { operations: "Operations", evidence: "Evidence", proposals: "Order Proposals", access: "Access", activity: "Activity", decisions: "Decisions", semantic: "Model Actions", force: "Force Registry", training: "Training Sessions" }[tab];
  $("#operations-view").hidden = tab !== "operations";
  $("#evidence-view").hidden = !["evidence", "proposals"].includes(tab);
  $("#access-view").hidden = tab !== "access"; $("#activity-view").hidden = tab !== "activity";
  $("#decisions-view").hidden = tab !== "decisions";
  $("#semantic-view").hidden = tab !== "semantic";
  $("#force-view").hidden = tab !== "force";
  $("#training-view").hidden = tab !== "training";
  $("#kind-filter").disabled = tab === "proposals";
  $("#kind-filter").value = tab === "proposals" ? "order-adoption-proposals" : "";
  $("#invitation").hidden = true; $("#invitation-link").value = "";
  if (tab === "operations") {
    operationsTimer = setInterval(() => {
      operationsFreshness();
      if (Date.now() - operationsReadAt >= 15000) void loadOperations();
    }, 1000);
    await loadOperations();
  }
  else if (tab === "access") await loadUsers();
  else if (tab === "decisions") await loadDecisions();
  else if (tab === "semantic") await semanticUi.load();
  else if (tab === "force") await forceUi.load();
  else if (tab === "training") await trainingUi.load();
  else if (tab === "activity") await loadActivity();
  else await loadEvidence(false);
}
function clearOperations() {
  operationsRequest++; operationsPending = false;
  operationsGeneration++; clearInterval(operationsTimer); operationsData = null; operationsFailed = false; operationsReadAt = 0;
  for (const selector of ["#operations-alerts", "#operations-waves"]) $(selector).replaceChildren();
  for (const selector of ["#operations-asof", "#operations-manifest", "#operations-alert-count", "#operations-count"]) $(selector).textContent = "";
  $("#operations-state").textContent = "Loading snapshot";
  $("#operations-filters").reset();
  $("#operations-filters").elements.role.replaceChildren(new Option("All staff roles", ""));
}
function operationsFreshness() {
  if (!operationsData) { $("#operations-state").textContent = operationsFailed ? "Snapshot unavailable" : "Loading snapshot"; return; }
  const boundary = Math.min(Date.parse(operationsData.snapshot_valid_until), operationsData.next_boundary_at ? Date.parse(operationsData.next_boundary_at) : Infinity);
  const expired = Date.now() >= boundary;
  $(".cop-status").dataset.stale = String(operationsFailed || expired);
  $("#operations-state").textContent = operationsFailed ? "Refresh failed / Last retained snapshot" : expired ? "Snapshot expired / Refresh required" : "Snapshot current";
}
function copEvidence(container, item, scope, manifest) {
  const button = document.createElement("button"); button.className = "artifact-button"; button.textContent = item.artifact_id;
  button.title = `Inspect ${item.artifact_id}`;
  button.onclick = () => inspect({ ...item, mission_id: scope.mission_id, wave_id: scope.wave_id }, manifest);
  container.append(button);
}
async function loadOperations() {
  if (operationsPending || !session?.user || tab !== "operations") return;
  operationsPending = true; const generation = operationsGeneration, scope = currentView(), request = ++operationsRequest;
  const params = new URLSearchParams(), form = $("#operations-filters");
  if (form.elements.mission.value.trim()) params.set("mission", form.elements.mission.value.trim());
  if (form.elements.role.value) params.set("role", form.elements.role.value);
  try {
    const data = await api(`/api/operations?${params}`);
    if (request !== operationsRequest || generation !== operationsGeneration || !viewCurrent(scope) || tab !== "operations") return;
    operationsData = data; operationsFailed = false; error("#workspace-error");
    $("#operations-asof").textContent = `As of ${displayTime(data.as_of)}`;
    $("#operations-manifest").textContent = `Manifest revision ${data.manifest_revision} / ${data.manifest_sha256.slice(0, 12)}`;
    $("#operations-count").textContent = `${data.matching_wave_count} matching / ${data.visible_wave_count} permitted waves`;
    $("#operations-alert-count").textContent = `${data.critical_count} critical / ${data.alerts.length} retained alerts`;
    const selectedRole = form.elements.role.value;
    form.elements.role.replaceChildren(new Option("All staff roles", ""), ...[...new Set([...data.roles, ...(selectedRole ? [selectedRole] : [])])].sort().map(value => new Option(value, value)));
    form.elements.role.value = selectedRole;
    const alerts = $("#operations-alerts"); alerts.replaceChildren();
    for (const item of data.alerts) {
      const row = document.createElement("li"), label = document.createElement("strong"); row.dataset.severity = item.severity;
      label.textContent = `${item.severity.toUpperCase()} / ${item.mission_id} / ${item.wave_id} / ${item.code.replaceAll("_", " ")}`;
      row.append(label);
      if (item.agent_ids.length) { const agents = document.createElement("span"); agents.className = "muted"; agents.textContent = item.agent_ids.join(", "); row.append(agents); }
      const sources = document.createElement("div");
      for (const source of item.evidence) copEvidence(sources, source, item, data.manifest_sha256);
      if (item.evidence_truncated) sources.append(document.createTextNode("Additional sources retained"));
      row.append(sources); alerts.append(row);
    }
    const body = $("#operations-waves"); body.replaceChildren();
    if (!data.waves.length) empty(body, 5, data.visible_wave_count ? "No matching waves" : "No retained wave plans");
    for (const wave of data.waves) {
      const row = body.insertRow(), scope = cell(row, `${wave.mission_id} / ${wave.wave_id}`);
      const title = document.createElement("span"); title.className = "muted"; title.textContent = wave.title + (wave.title_truncated ? " [excerpt]" : ""); scope.append(title);
      cell(row, wave.state.replaceAll("_", " "));
      const assignments = cell(row, "");
      for (const agent of wave.agents) {
        const block = document.createElement("div"), name = document.createElement("strong"), task = document.createElement("span"), lease = document.createElement("span");
        block.className = "cop-assignment"; name.textContent = `${agent.role} / ${agent.agent_id}`;
        task.className = lease.className = "muted"; task.textContent = agent.task_excerpt + (agent.task_truncated ? " [excerpt]" : "");
        lease.textContent = `Lease recorded: ${agent.recorded_lease_status}${agent.result_pending ? " / Result pending" : ""}`;
        block.append(name, task, lease); assignments.append(block);
      }
      const activity = cell(row, wave.freshness), recorded = document.createElement("span"); recorded.className = "muted"; recorded.textContent = displayTime(wave.recorded_at); activity.append(recorded);
      const sources = cell(row, ""); copEvidence(sources, wave.plan, wave, data.manifest_sha256);
      if (wave.ending) copEvidence(sources, wave.ending, wave, data.manifest_sha256);
    }
  } catch (failure) {
    if (request === operationsRequest && generation === operationsGeneration && viewCurrent(scope) && tab === "operations") {
      operationsFailed = true; error("#workspace-error", failure);
    }
  } finally { if (request === operationsRequest) { operationsPending = false; operationsReadAt = Date.now(); operationsFreshness(); } }
}
async function loadEvidence(append) {
  const scope = beginRead("evidence");
  const body = $("#artifacts");
  const params = new URLSearchParams();
  if ($("#mission-filter").value.trim()) params.set("mission", $("#mission-filter").value.trim());
  if ($("#kind-filter").value.trim()) params.set("kind", $("#kind-filter").value.trim());
  if (append && cursor) params.set("cursor", cursor);
  if (!append) {
    snapshot = cursor = null; empty(body, 5, "Loading...");
    $("#artifact-count").textContent = ""; $("#revision").textContent = ""; $("#more").hidden = true;
  }
  $("#more").disabled = true;
  try {
    const data = await readResponse(`/api/evidence?${params}`, scope);
    if (!readCurrent(scope)) return;
    snapshot = data.manifest_sha256; cursor = data.next_cursor;
    $("#artifact-count").textContent = `${data.total} retained artifacts`;
    $("#revision").textContent = `Manifest revision ${data.manifest_revision}`;
    if (!append) body.replaceChildren();
    if (!data.total) empty(body, 5, "No retained artifacts");
    for (const item of data.entries) {
      const row = body.insertRow(), td = cell(row, "");
      const button = document.createElement("button"); button.className = "artifact-button";
      button.textContent = item.artifact_id; button.onclick = () => inspect(item, data.manifest_sha256); td.append(button);
      const scope = cell(row, item.mission_id), wave = document.createElement("span"); wave.className = "muted"; wave.textContent = item.wave_id; scope.append(wave);
      cell(row, item.kind); cell(row, displayTime(item.created_at));
      const handling = cell(row, ""), label = document.createElement("span"); label.className = "tag"; label.textContent = "Restricted"; handling.append(label);
    }
    $("#more").hidden = !cursor;
  } catch (failure) {
    if (readCurrent(scope) && !append) empty(body, 5, "Evidence unavailable");
    throw failure;
  } finally { if (readCurrent(scope)) $("#more").disabled = false; }
}
async function inspect(item, manifest) {
  clearDecision(); const selected = selectedProposal = { item, manifest }, scope = beginRead("detail"), generation = previewGeneration;
  $("#detail-title").textContent = item.artifact_id; $("#detail-content").textContent = "Loading...";
  $("#detail-meta").replaceChildren(); error("#detail-error"); $("#detail").showModal();
  try {
    const review = tab === "proposals" && session.user.role === "owner";
    const data = await api(`/api/evidence/${item.id}?manifest=${manifest}${review ? "&review=true" : ""}`);
    if (!readCurrent(scope) || selectedProposal !== selected || generation !== previewGeneration) return;
    for (const [label, value] of [["Mission", item.mission_id], ["Wave", item.wave_id], ["Kind", item.kind], ["SHA-256", item.sha256],
      ["Handling", "Restricted"], ...(review ? [["Review status", data.review.status], ["Freshness", data.review.freshness]] : [])]) {
      const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; $("#detail-meta").append(dt, dd);
    }
    if (review) {
      $("#detail-content").textContent = JSON.stringify(data.review, null, 2);
      $("#decision-preview-form").hidden = data.review.status !== "awaiting_review" || data.review.freshness !== "current";
      for (const rehearsal of data.rehearsals) {
        const option = document.createElement("option"); option.value = rehearsal.id; option.textContent = rehearsal.artifact_id; $("#rehearsal-select").append(option);
      }
    }
    else { try { $("#detail-content").textContent = JSON.stringify(JSON.parse(data.content), null, 2); } catch { $("#detail-content").textContent = data.content; }
      semanticUi.selectDraft(item, manifest); forceUi.select(item, manifest); trainingUi.select(item, manifest); }
  } catch (failure) { if (readCurrent(scope) && selectedProposal === selected && generation === previewGeneration) { $("#detail-content").textContent = ""; error("#detail-error", failure); } }
}
function clearDecision() {
  semanticUi?.reset();
  forceUi?.reset();
  trainingUi?.reset();
  previewGeneration++;
  $("#inspect-outcome").disabled = false; $("#review-terminal").disabled = false;
  decisionPreview = null; selectedProposal = null;
  selectedAction = null; $("#inspect-outcome").hidden = true;
  inspectedOutcome = null; $("#review-terminal").hidden = true; resetTerminal();
  $("#decision-preview-form").hidden = true; $("#decision-preview-form").reset();
  $("#rehearsal-select").replaceChildren(new Option("None", "none"));
  resetDecisionPreview(); $("#decision-status").textContent = "";
}
function resetDecisionPreview() {
  decisionPreview = null; coverageUi?.clear();
  $("#decision-confirmation").hidden = true; $("#decision-commit-form").reset();
  $("#consent-content").textContent = ""; $("#decision-expiry").textContent = "";
}
function resetTerminal() {
  terminalPreview = null; $("#terminal-confirmation").hidden = true; $("#terminal-commit-form").reset(); $("#terminal-content").textContent = "";
}
function outcomeMetadata(outcome) {
  $("#detail-meta").replaceChildren();
  for (const [label, value] of [["Action state", outcome.action_state], ["Hold", outcome.hold_preserved ? "Active" : "None"],
    ["Original consent", outcome.original_consent_freshness], ["Consent expiry", displayTime(outcome.original_consent_expires_at)],
    ["Manifest", String(outcome.observed_manifest.revision)]]) {
    const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; $("#detail-meta").append(dt, dd);
  }
}
async function loadDecisions() {
  const scope = beginRead("decisions"), data = await readResponse("/api/order-decisions", scope);
  if (!readCurrent(scope)) return;
  const body = $("#decisions"); body.replaceChildren();
  if (!data.entries.length) empty(body, 5, "No decisions");
  for (const entry of data.entries) {
    const row = body.insertRow(), name = cell(row, ""), button = document.createElement("button");
    button.className = "artifact-button"; button.textContent = entry.id; button.onclick = async () => {
      if (!readCurrent(scope)) return;
      clearDecision(); const generation = previewGeneration;
      try {
        const current = await api(`/api/order-decisions/${entry.id}`);
        if (!readCurrent(scope) || previewGeneration !== generation) return;
        const reviews = await api(`/api/order-decisions/${entry.id}/reconciliations`);
        if (!readCurrent(scope) || previewGeneration !== generation || tab !== "decisions" || session?.user?.role !== "owner") return;
        error("#detail-error");
        selectedAction = entry.id; $("#inspect-outcome").hidden = false;
        $("#detail-title").textContent = current.state; $("#detail-meta").replaceChildren();
        $("#detail-content").textContent = JSON.stringify({ ...current, terminal_reviews: reviews.entries }, null, 2); $("#detail").showModal();
      } catch (failure) { if (readCurrent(scope) && previewGeneration === generation) error("#workspace-error", failure); }
    }; name.append(button);
    cell(row, entry.proposal_id); cell(row, entry.disposition); cell(row, entry.state); cell(row, displayTime(entry.created_at));
  }
}
$("#inspect-outcome").onclick = async () => {
  const action = selectedAction, generation = ++previewGeneration, button = $("#inspect-outcome");
  if (!action) return;
  resetTerminal(); inspectedOutcome = null; $("#review-terminal").hidden = true;
  $("#decision-status").textContent = ""; $("#detail-title").textContent = "Inspecting Outcome";
  $("#detail-content").textContent = ""; $("#detail-meta").replaceChildren();
  button.disabled = true; error("#detail-error");
  try {
    const outcome = await api(`/api/order-decisions/${action}/inspect`, {});
    if (selectedAction !== action || previewGeneration !== generation) return;
    $("#detail-title").textContent = { applied: "Recorded Outcome", not_submitted: "Not Submitted", execution_unconfirmed: "Execution Unconfirmed",
      unconsumed_decision: "Decision Not Consumed", partial_consent: "Partial Consent", no_adoption_recorded: "No Adoption Recorded",
      conflicting: "Conflicting Records", unverifiable: "Outcome Unverifiable", cancelled: "Original Decision Cancelled" }[outcome.outcome] || "Outcome Unverifiable";
    $("#detail-content").textContent = JSON.stringify(outcome, null, 2);
    outcomeMetadata(outcome); inspectedOutcome = outcome;
    $("#review-terminal").hidden = !outcome.hold_preserved || !["applied", "unconsumed_decision", "partial_consent", "no_adoption_recorded"].includes(outcome.outcome);
  } catch (failure) {
    if (selectedAction === action && previewGeneration === generation) { $("#detail-title").textContent = "Outcome Unavailable"; error("#detail-error", failure); }
  } finally { if (selectedAction === action && previewGeneration === generation) button.disabled = false; }
};
$("#review-terminal").onclick = async () => {
  const action = selectedAction, outcome = inspectedOutcome, generation = ++previewGeneration, button = $("#review-terminal");
  if (!action || !outcome) return;
  resetTerminal(); button.disabled = true; error("#detail-error");
  try {
    const prepared = await api(`/api/order-decisions/${action}/reconciliation/preview`, { manifest: outcome.observed_manifest.sha256 });
    if (selectedAction !== action || previewGeneration !== generation) return;
    terminalPreview = prepared;
    const title = { acknowledge_recorded: "Acknowledge Recorded Result", cancel_unconsumed: "Cancel Unconsumed Order",
      acknowledge_prior_cancellation: "Acknowledge Prior Cancellation" }[prepared.review.resolution];
    $("#terminal-title").textContent = title; $("#commit-terminal").textContent = title;
    $("#terminal-content").textContent = JSON.stringify(prepared.review, null, 2);
    $("#terminal-expiry").textContent = `Review expires ${displayTime(prepared.expires_at)}`;
    $("#terminal-confirmation").hidden = false;
    $("#detail").scrollTop = $("#terminal-confirmation").offsetTop - $("#detail header").offsetHeight - 20;
  } catch (failure) { if (selectedAction === action && previewGeneration === generation) error("#detail-error", failure); }
  finally { if (selectedAction === action && previewGeneration === generation) button.disabled = false; }
};
$("#terminal-commit-form").onsubmit = event => {
  event.preventDefault(); const form = event.currentTarget;
  void busy(form, async () => {
    const action = selectedAction, generation = previewGeneration, prepared = terminalPreview;
    if (!prepared || !action) throw new Error("CONSOLE_RECONCILIATION_PREVIEW_REQUIRED");
    terminalPreview = null;
    $("#inspect-outcome").disabled = true; $("#review-terminal").disabled = true;
    try {
      const result = await api("/api/reconciliations/commit", { reconciliation_id: prepared.reconciliation_id, nonce: prepared.nonce,
        password: form.elements.password.value, rationale: form.elements.rationale.value });
      if (selectedAction !== action || previewGeneration !== generation) return;
      clearDecision(); selectedAction = action; $("#inspect-outcome").hidden = false;
      $("#detail-title").textContent = result.terminal_state === "cancelled" ? "Original Decision Cancelled" : "Recorded Outcome Acknowledged";
      $("#decision-status").textContent = result.terminal_state;
      $("#detail-content").textContent = JSON.stringify(result, null, 2); $("#detail-meta").replaceChildren(); $("#detail").scrollTop = 0;
      if (tab === "decisions") await loadDecisions();
    } catch (failure) {
      if (selectedAction === action && previewGeneration === generation) {
        resetTerminal(); const current = await api(`/api/order-decisions/${action}`);
        if (selectedAction === action && previewGeneration === generation) $("#decision-status").textContent = current.state;
        throw failure;
      }
    } finally {
      if (selectedAction === action && previewGeneration === generation) {
        form.elements.password.value = ""; form.elements.rationale.value = "";
        $("#inspect-outcome").disabled = false; $("#review-terminal").disabled = false;
      }
    }
  }, "#detail-error");
};
async function loadUsers() {
  const scope = beginRead("users"), data = await readResponse("/api/users", scope);
  if (!readCurrent(scope)) return;
  const body = $("#users"); body.replaceChildren();
  for (const account of data.users) {
    const row = body.insertRow(); cell(row, account.username); cell(row, account.role);
    cell(row, account.role === "owner" ? "All configured repository missions" : account.missions.join(", "));
    cell(row, account.active ? "Active" : "Inactive"); const action = cell(row, "");
    if (account.role === "viewer" && account.active) {
      const button = document.createElement("button"); button.textContent = "Deactivate";
      button.onclick = () => { if (!readCurrent(scope)) return; selectedUser = account.id; $("#deactivate-name").textContent = account.username;
        $("#deactivate-form").reset(); error("#deactivate-error"); $("#deactivate").showModal(); }; action.append(button);
    }
  }
}
async function loadActivity() {
  const scope = beginRead("activity"), data = await readResponse("/api/activity", scope);
  if (!readCurrent(scope)) return;
  const body = $("#activity"); body.replaceChildren();
  if (!data.entries.length) empty(body, 4, "No activity");
  for (const entry of data.entries) { const row = body.insertRow(); cell(row, displayTime(entry.at)); cell(row, entry.action); cell(row, entry.actor); cell(row, entry.subject); }
}
async function busy(form, callback, target) {
  const request = {}, scope = currentView(); formRequests.set(form, request);
  const controls = [...form.elements].map(element => [element, element.disabled]);
  controls.forEach(([element]) => { element.disabled = true; });
  try { error(target); await callback(); } catch (failure) { if (viewCurrent(scope)) error(target, failure); }
  finally { if (formRequests.get(form) === request) { controls.forEach(([element, disabled]) => { element.disabled = disabled; }); if (form.id === "auth-form") renderAuth(); } }
}
$("#auth-form").addEventListener("submit", event => {
  event.preventDefault(); const form = event.currentTarget;
  void busy(form, async () => {
    const data = { username: form.elements.username.value, password: form.elements.password.value };
    if (authMode !== "login") data.token = form.elements.token.value;
    await api(`/api/${authMode}`, data); authMode = "login"; form.reset(); await loadSession();
  }, "#auth-error");
});
$("#register-mode").onclick = () => { authMode = authMode === "register" ? "login" : "register"; error("#auth-error"); renderAuth(); };
$("#logout").onclick = async () => {
  const pending = api("/api/logout", {}); sessionEpoch++; clearWorkspace(); session = null; csrf = null; authMode = "login"; $("#auth-form").reset(); renderAuth();
  try { await pending; await loadSession(); } catch (failure) { error("#auth-error", failure); }
};
document.querySelectorAll("[data-tab]").forEach(button => { button.onclick = () => { void showTab(button.dataset.tab).catch(failure => error("#workspace-error", failure)); }; });
$("#refresh").onclick = () => { void showTab(tab).catch(failure => error("#workspace-error", failure)); };
$("#filters").onsubmit = event => { event.preventDefault(); void loadEvidence(false).catch(failure => error("#workspace-error", failure)); };
$("#operations-filters").onsubmit = event => { event.preventDefault(); operationsGeneration++; operationsRequest++; operationsPending = false; operationsReadAt = 0; void loadOperations(); };
$("#more").onclick = () => { void loadEvidence(true).catch(failure => error("#workspace-error", failure)); };
$("#close-detail").onclick = () => { $("#detail").close(); $("#detail-content").textContent = ""; clearDecision(); };
$("#detail").addEventListener("cancel", clearDecision);
$("#decision-preview-form").onsubmit = event => {
  event.preventDefault(); const form = event.currentTarget;
  void busy(form, async () => {
    const generation = ++previewGeneration, selected = selectedProposal, scope = currentView();
    resetDecisionPreview();
    const prepared = await api("/api/order-decisions/preview", { entry_id: selected.item.id, manifest: selected.manifest,
      rehearsal_id: form.elements.rehearsal.value, disposition: form.elements.disposition.value });
    if (!viewCurrent(scope) || generation !== previewGeneration || selected !== selectedProposal) return;
    coverageUi.show(prepared.review); decisionPreview = prepared;
    $("#consent-content").textContent = JSON.stringify(decisionPreview.review, null, 2);
    $("#decision-expiry").textContent = `Expires ${displayTime(decisionPreview.expires_at)}`;
    $("#commit-decision").textContent = { approve: "Adopt Plan", reject: "Reject Plan", revise: "Request Revision" }[prepared.review.request.disposition];
    $("#decision-commit-form").reset(); $("#decision-confirmation").hidden = false;
    $("#detail").scrollTop = $("#decision-confirmation").offsetTop - $("#detail header").offsetHeight - 20;
  }, "#detail-error");
};
$("#decision-preview-form").addEventListener("change", () => { previewGeneration++; resetDecisionPreview(); });
$("#decision-commit-form").onsubmit = event => {
  event.preventDefault(); const form = event.currentTarget;
  void busy(form, async () => {
    if (!decisionPreview) throw new Error("CONSOLE_DECISION_PREVIEW_REQUIRED");
    const preview = decisionPreview, scope = currentView(), generation = previewGeneration, selected = selectedProposal; decisionPreview = null;
    try {
      const result = await api("/api/order-decisions/commit", { challenge_id: preview.challenge_id, nonce: preview.nonce,
        password: form.elements.password.value, rationale: form.elements.rationale.value });
      if (!viewCurrent(scope) || generation !== previewGeneration || selected !== selectedProposal) return;
      $("#detail-content").textContent = JSON.stringify(result, null, 2); clearDecision();
      $("#decision-status").textContent = { adopted: "Plan adopted", rejected: "Plan rejected", revision_required: "Revision required" }[result.adoption_status];
      $("#detail-title").textContent = $("#decision-status").textContent;
      for (const label of $("#detail-meta").querySelectorAll("dt")) {
        if (label.textContent === "Review status") label.nextElementSibling.textContent = result.adoption_status;
      }
      $("#detail").scrollTop = 0;
    } catch (failure) {
      if (!viewCurrent(scope) || generation !== previewGeneration || selected !== selectedProposal) return;
      const current = await api(`/api/order-decisions/${preview.challenge_id}`);
      if (!viewCurrent(scope) || generation !== previewGeneration || selected !== selectedProposal) return;
      $("#decision-status").textContent = current.state; resetDecisionPreview(); throw failure;
    } finally { if (viewCurrent(scope) && generation === previewGeneration && selected === selectedProposal) form.elements.password.value = ""; }
  }, "#detail-error");
};
$("#cancel-deactivate").onclick = () => $("#deactivate").close();
$("#invite-form").onsubmit = event => {
  event.preventDefault(); const form = event.currentTarget;
  void busy(form, async () => {
    const scope = currentView();
    const data = await api("/api/invites", { password: form.elements.password.value,
      missions: form.elements.missions.value.split(",").map(value => value.trim()).filter(Boolean) });
    if (!viewCurrent(scope)) return;
    form.reset(); $("#invitation-link").value = `${location.origin}/#invite=${data.token}`; $("#invitation").hidden = false;
  }, "#workspace-error");
};
$("#copy-invitation").onclick = () => { void navigator.clipboard.writeText($("#invitation-link").value).catch(failure => error("#workspace-error", failure)); };
$("#deactivate-form").onsubmit = event => {
  event.preventDefault(); const form = event.currentTarget;
  void busy(form, async () => {
    const scope = currentView();
    await api("/api/users/deactivate", { userId: selectedUser, password: form.elements.password.value });
    if (!viewCurrent(scope)) return;
    form.reset(); $("#deactivate").close(); await loadUsers();
  }, "#deactivate-error");
};
coverageUi = createCoverageUi({ $ });
semanticUi = createSemanticUi({ $, api, busy, beginRead, readCurrent, currentView, viewCurrent, clearDecision, cell, empty, displayTime, session: () => session });
forceUi = createForceRegistryUi({ $, api, busy, beginRead, readCurrent, currentView, viewCurrent, clearDecision, cell, empty, displayTime, session: () => session });
trainingUi = createTrainingSessionUi({ $, api, busy, beginRead, readCurrent, currentView, viewCurrent, clearDecision, cell, empty, displayTime, session: () => session });
if (suppliedToken) $("#auth-form").elements.token.value = suppliedToken;
void loadSession().catch(failure => { $("#auth").hidden = false; error("#auth-error", failure); });
