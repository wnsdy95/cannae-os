"use strict";
const $ = selector => document.querySelector(selector);
let session, csrf, authMode = "login", tab = "evidence", snapshot, cursor, selectedUser;
let selectedProposal, decisionPreview, selectedAction;
let previewGeneration = 0;
const fragment = new URLSearchParams(location.hash.slice(1));
const suppliedToken = fragment.get("setup") || fragment.get("invite");
history.replaceState(null, "", "/");
if (fragment.has("invite")) authMode = "register";
if (fragment.has("setup")) authMode = "setup";

async function api(url, body) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", headers: body === undefined ? {} :
    { "Content-Type": "application/json", "X-CSRF-Token": csrf }, method: body === undefined ? "GET" : "POST",
  body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !["/api/login", "/api/session"].includes(url)) await loadSession();
    throw new Error(data.error || "Request failed");
  }
  return data;
}
function error(selector, value) { $(selector).textContent = value?.message || ""; }
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
  $("#auth-title").textContent = authMode === "setup" ? "Create Owner Account" : authMode === "register" ? "Accept Invitation" : "Operator Sign In";
  $("#auth-action").textContent = authMode === "login" ? "Sign In" : "Create Account";
  $("#token-label").hidden = authMode === "login";
  $("#auth-form").elements.password.autocomplete = authMode === "login" ? "current-password" : "new-password";
  $("#register-mode").textContent = authMode === "register" ? "Back to Sign In" : "Use Invitation";
  $("#register-mode").hidden = authMode === "setup";
}
async function loadSession() {
  session = await api("/api/session"); csrf = session.csrf_token;
  if (!session.initialized) authMode = "setup";
  renderAuth();
  if (!session.user) { clearDecision(); $("#detail").close(); $("#deactivate").close(); return; }
  $("#identity").textContent = `${session.user.username} / ${session.user.role}`;
  $("#operator-mode").textContent = session.user.role === "owner" ? "Order review" : "Read-only";
  $("#review-mode").textContent = session.user.role === "owner" ? "Order review: owner" : "Order review: disabled";
  $("#repository").textContent = session.repository.label;
  document.querySelectorAll("[data-owner]").forEach(element => { element.hidden = session.user.role !== "owner"; });
  if (session.user.role !== "owner" && ["access", "activity", "decisions"].includes(tab)) tab = "evidence";
  await showTab(tab);
}
async function showTab(next) {
  tab = next; error("#workspace-error");
  document.querySelectorAll("[data-tab]").forEach(button => { button.setAttribute("aria-current", button.dataset.tab === tab ? "page" : "false"); });
  $("#view-title").textContent = { evidence: "Evidence", proposals: "Order Proposals", access: "Access", activity: "Activity", decisions: "Decisions" }[tab];
  $("#evidence-view").hidden = !["evidence", "proposals"].includes(tab);
  $("#access-view").hidden = tab !== "access"; $("#activity-view").hidden = tab !== "activity";
  $("#decisions-view").hidden = tab !== "decisions";
  $("#kind-filter").disabled = tab === "proposals";
  $("#kind-filter").value = tab === "proposals" ? "order-adoption-proposals" : "";
  $("#invitation").hidden = true; $("#invitation-link").value = "";
  if (tab === "access") await loadUsers();
  else if (tab === "decisions") await loadDecisions();
  else if (tab === "activity") await loadActivity();
  else await loadEvidence(false);
}
async function loadEvidence(append) {
  const params = new URLSearchParams();
  if ($("#mission-filter").value.trim()) params.set("mission", $("#mission-filter").value.trim());
  if ($("#kind-filter").value.trim()) params.set("kind", $("#kind-filter").value.trim());
  if (append && cursor) params.set("cursor", cursor);
  $("#more").disabled = true;
  try {
    const data = await api(`/api/evidence?${params}`);
    snapshot = data.manifest_sha256; cursor = data.next_cursor;
    $("#artifact-count").textContent = `${data.total} retained artifacts`;
    $("#revision").textContent = `Manifest revision ${data.manifest_revision}`;
    const body = $("#artifacts");
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
  } finally { $("#more").disabled = false; }
}
async function inspect(item, manifest) {
  clearDecision(); selectedProposal = { item, manifest };
  $("#detail-title").textContent = item.artifact_id; $("#detail-content").textContent = "Loading...";
  $("#detail-meta").replaceChildren(); error("#detail-error"); $("#detail").showModal();
  try {
    const review = tab === "proposals" && session.user.role === "owner";
    const data = await api(`/api/evidence/${item.id}?manifest=${manifest}${review ? "&review=true" : ""}`);
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
    else { try { $("#detail-content").textContent = JSON.stringify(JSON.parse(data.content), null, 2); } catch { $("#detail-content").textContent = data.content; } }
  } catch (failure) { $("#detail-content").textContent = ""; error("#detail-error", failure); }
}
function clearDecision() {
  previewGeneration++;
  decisionPreview = null; selectedProposal = null;
  selectedAction = null; $("#inspect-outcome").hidden = true;
  $("#decision-preview-form").hidden = true; $("#decision-preview-form").reset();
  $("#rehearsal-select").replaceChildren(new Option("None", "none"));
  $("#decision-confirmation").hidden = true; $("#decision-commit-form").reset();
  $("#consent-content").textContent = ""; $("#decision-status").textContent = "";
}
async function loadDecisions() {
  const data = await api("/api/order-decisions"), body = $("#decisions"); body.replaceChildren();
  if (!data.entries.length) empty(body, 5, "No decisions");
  for (const entry of data.entries) {
    const row = body.insertRow(), name = cell(row, ""), button = document.createElement("button");
    button.className = "artifact-button"; button.textContent = entry.id; button.onclick = async () => {
      clearDecision(); const generation = previewGeneration;
      try {
        const current = await api(`/api/order-decisions/${entry.id}`);
        if (previewGeneration !== generation || tab !== "decisions" || session?.user?.role !== "owner") return;
        error("#detail-error");
        selectedAction = entry.id; $("#inspect-outcome").hidden = false;
        $("#detail-title").textContent = current.state; $("#detail-meta").replaceChildren();
        $("#detail-content").textContent = JSON.stringify(current, null, 2); $("#detail").showModal();
      } catch (failure) { error("#workspace-error", failure); }
    }; name.append(button);
    cell(row, entry.proposal_id); cell(row, entry.disposition); cell(row, entry.state); cell(row, displayTime(entry.created_at));
  }
}
$("#inspect-outcome").onclick = async () => {
  const action = selectedAction, generation = previewGeneration, button = $("#inspect-outcome");
  if (!action) return;
  button.disabled = true; error("#detail-error");
  try {
    const outcome = await api(`/api/order-decisions/${action}/inspect`, {});
    if (selectedAction !== action || previewGeneration !== generation) return;
    $("#detail-title").textContent = { applied: "Recorded Outcome", not_submitted: "Not Submitted", execution_unconfirmed: "Execution Unconfirmed",
      unconsumed_decision: "Decision Not Consumed", partial_consent: "Partial Consent", no_adoption_recorded: "No Adoption Recorded",
      conflicting: "Conflicting Records", unverifiable: "Outcome Unverifiable" }[outcome.outcome] || "Outcome Unverifiable";
    $("#detail-content").textContent = JSON.stringify(outcome, null, 2);
  } catch (failure) {
    if (selectedAction === action && previewGeneration === generation) error("#detail-error", failure);
  } finally { button.disabled = false; }
};
async function loadUsers() {
  const data = await api("/api/users"), body = $("#users"); body.replaceChildren();
  for (const account of data.users) {
    const row = body.insertRow(); cell(row, account.username); cell(row, account.role);
    cell(row, account.role === "owner" ? "All configured repository missions" : account.missions.join(", "));
    cell(row, account.active ? "Active" : "Inactive"); const action = cell(row, "");
    if (account.role === "viewer" && account.active) {
      const button = document.createElement("button"); button.textContent = "Deactivate";
      button.onclick = () => { selectedUser = account.id; $("#deactivate-name").textContent = account.username;
        $("#deactivate-form").reset(); error("#deactivate-error"); $("#deactivate").showModal(); }; action.append(button);
    }
  }
}
async function loadActivity() {
  const data = await api("/api/activity"), body = $("#activity"); body.replaceChildren();
  if (!data.entries.length) empty(body, 4, "No activity");
  for (const entry of data.entries) { const row = body.insertRow(); cell(row, displayTime(entry.at)); cell(row, entry.action); cell(row, entry.actor); cell(row, entry.subject); }
}
async function busy(form, callback, target) {
  const controls = [...form.elements].map(element => [element, element.disabled]);
  controls.forEach(([element]) => { element.disabled = true; });
  try { error(target); await callback(); } catch (failure) { error(target, failure); }
  finally { controls.forEach(([element, disabled]) => { element.disabled = disabled; }); }
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
  try { await api("/api/logout", {}); $("#detail").close(); $("#deactivate").close();
    $("#detail-content").textContent = ""; $("#artifacts").replaceChildren(); $("#invitation-link").value = ""; authMode = "login"; await loadSession();
  } catch (failure) { error("#workspace-error", failure); }
};
document.querySelectorAll("[data-tab]").forEach(button => { button.onclick = () => { void showTab(button.dataset.tab).catch(failure => error("#workspace-error", failure)); }; });
$("#refresh").onclick = () => { void showTab(tab).catch(failure => error("#workspace-error", failure)); };
$("#filters").onsubmit = event => { event.preventDefault(); void loadEvidence(false).catch(failure => error("#workspace-error", failure)); };
$("#more").onclick = () => { void loadEvidence(true).catch(failure => error("#workspace-error", failure)); };
$("#close-detail").onclick = () => { $("#detail").close(); $("#detail-content").textContent = ""; clearDecision(); };
$("#detail").addEventListener("cancel", clearDecision);
$("#decision-preview-form").onsubmit = event => {
  event.preventDefault(); const form = event.currentTarget;
  void busy(form, async () => {
    const generation = ++previewGeneration, selected = selectedProposal;
    const prepared = await api("/api/order-decisions/preview", { entry_id: selected.item.id, manifest: selected.manifest,
      rehearsal_id: form.elements.rehearsal.value, disposition: form.elements.disposition.value });
    if (generation !== previewGeneration || selected !== selectedProposal) throw new Error("CONSOLE_PREVIEW_SCOPE_CHANGED");
    decisionPreview = prepared;
    $("#consent-content").textContent = JSON.stringify(decisionPreview.review, null, 2);
    $("#decision-expiry").textContent = `Expires ${displayTime(decisionPreview.expires_at)}`;
    $("#commit-decision").textContent = { approve: "Adopt Plan", reject: "Reject Plan", revise: "Request Revision" }[prepared.review.request.disposition];
    $("#decision-commit-form").reset(); $("#decision-confirmation").hidden = false;
    $("#detail").scrollTop = $("#decision-confirmation").offsetTop - $("#detail header").offsetHeight - 20;
  }, "#detail-error");
};
$("#decision-preview-form").addEventListener("change", () => { previewGeneration++; decisionPreview = null; $("#decision-confirmation").hidden = true; $("#decision-commit-form").reset(); });
$("#decision-commit-form").onsubmit = event => {
  event.preventDefault(); const form = event.currentTarget;
  void busy(form, async () => {
    if (!decisionPreview) throw new Error("CONSOLE_DECISION_PREVIEW_REQUIRED");
    const preview = decisionPreview; decisionPreview = null;
    try {
      const result = await api("/api/order-decisions/commit", { challenge_id: preview.challenge_id, nonce: preview.nonce,
        password: form.elements.password.value, rationale: form.elements.rationale.value });
      $("#detail-content").textContent = JSON.stringify(result, null, 2); clearDecision();
      $("#decision-status").textContent = { adopted: "Plan adopted", rejected: "Plan rejected", revision_required: "Revision required" }[result.adoption_status];
      $("#detail-title").textContent = $("#decision-status").textContent;
      for (const label of $("#detail-meta").querySelectorAll("dt")) {
        if (label.textContent === "Review status") label.nextElementSibling.textContent = result.adoption_status;
      }
      $("#detail").scrollTop = 0;
    } catch (failure) {
      const current = await api(`/api/order-decisions/${preview.challenge_id}`);
      $("#decision-status").textContent = current.state; $("#decision-confirmation").hidden = true;
      $("#consent-content").textContent = ""; throw failure;
    } finally { form.elements.password.value = ""; }
  }, "#detail-error");
};
$("#cancel-deactivate").onclick = () => $("#deactivate").close();
$("#invite-form").onsubmit = event => {
  event.preventDefault(); const form = event.currentTarget;
  void busy(form, async () => {
    const data = await api("/api/invites", { password: form.elements.password.value,
      missions: form.elements.missions.value.split(",").map(value => value.trim()).filter(Boolean) });
    form.reset(); $("#invitation-link").value = `${location.origin}/#invite=${data.token}`; $("#invitation").hidden = false;
  }, "#workspace-error");
};
$("#copy-invitation").onclick = () => { void navigator.clipboard.writeText($("#invitation-link").value).catch(failure => error("#workspace-error", failure)); };
$("#deactivate-form").onsubmit = event => {
  event.preventDefault(); const form = event.currentTarget;
  void busy(form, async () => {
    await api("/api/users/deactivate", { userId: selectedUser, password: form.elements.password.value });
    form.reset(); $("#deactivate").close(); await loadUsers();
  }, "#deactivate-error");
};
if (suppliedToken) $("#auth-form").elements.token.value = suppliedToken;
void loadSession().catch(failure => { $("#auth").hidden = false; error("#auth-error", failure); });
