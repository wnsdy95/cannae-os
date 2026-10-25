"use strict";
function createTrainingSessionUi({ $, api, busy, beginRead, readCurrent, currentView, viewCurrent, clearDecision, cell, empty, displayTime, session }) {
  let selected = null, preview = null, generation = 0, timer;
  const invalid = () => { throw new Error("CONSOLE_TRAINING_REVIEW_DISPLAY_INVALID"); };
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ?
    Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  async function digest(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(canonical(value))); if (bytes.length > 196608) invalid();
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  function reset() {
    generation++; selected = preview = null; clearTimeout(timer);
    $("#training-preview").hidden = true; $("#training-preview").disabled = false; $("#training-confirmation").hidden = true;
    $("#training-subject").textContent = $("#training-expiry").textContent = ""; $("#training-commit-form").reset(); $("#detail-content").hidden = false;
    for (const element of $("#training-commit-form").elements) element.disabled = false;
  }
  function clear() { reset(); $("#training-actions").replaceChildren(); $("#training-state").textContent = ""; }
  function select(item, manifest) {
    reset(); if (session()?.user?.role !== "owner" || item.kind !== "task-training-session-proposals") return;
    selected = { item, manifest }; $("#training-preview").hidden = false;
  }
  async function load() {
    reset(); const scope = beginRead("training-sessions"), value = await api("/api/training-sessions"); if (!readCurrent(scope)) return;
    $("#training-state").textContent = value.mutation_held ? "Session registration held" : "Session decisions";
    const rows = $("#training-actions"); rows.replaceChildren(); if (!value.actions.length) empty(rows, 4, "No training session decisions");
    for (const action of value.actions) {
      const row = rows.insertRow(), button = document.createElement("button"); button.className = "artifact-button"; button.textContent = action.id;
      button.title = "Inspect training session decision"; cell(row, "").append(button);
      button.onclick = async () => {
        if (!readCurrent(scope)) return; clearDecision(); const view = currentView();
        try { const result = await api(`/api/training-sessions/actions/${action.id}`); if (!viewCurrent(view)) return;
          $("#detail-title").textContent = action.id; $("#detail-meta").replaceChildren(); $("#detail-content").textContent = JSON.stringify(result, null, 2); $("#detail").showModal(); }
        catch (error) { if (viewCurrent(view)) $("#workspace-error").textContent = error.message; }
      };
      cell(row, action.performer_id); cell(row, action.state); cell(row, displayTime(action.created_at));
    }
  }
  $("#training-preview").onclick = async () => {
    const choice = selected, scope = currentView(), revision = ++generation; if (!choice) return;
    preview = null; clearTimeout(timer); $("#training-commit-form").reset(); $("#training-confirmation").hidden = true; $("#training-preview").disabled = true; $("#detail-error").textContent = "";
    try {
      const value = await api("/api/training-sessions/preview", { entry_id: choice.item.id, manifest: choice.manifest });
      const review = value?.review, keys = ["proposal_ref", "proposal", "registry_head_ref", "repository_binding", "observed_manifest", "source_state_sha256", "repository_state_sha256",
        "capability", "performer", "standard_ref", "standard", "lease", "context_ref", "context", "policy_ref", "policy"].sort();
      if (!review || JSON.stringify(Object.keys(review).sort()) !== JSON.stringify(keys) || review.proposal?.type !== "TaskTrainingSessionProposal" ||
        review.proposal.purpose !== "task_training_session_enrollment" || review.proposal_ref?.artifact_id !== choice.item.artifact_id ||
        review.observed_manifest?.sha256 !== choice.manifest || review.repository_binding?.repository_key !== session()?.repository?.key ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.challenge_id || "") || !/^[A-Za-z0-9_-]{43}$/.test(value.nonce || "") ||
        value.execution_authorized !== false || value.release_authorized !== false || value.qualification_granted !== false || value.grant_restoration_authorized !== false ||
        !(Date.parse(value.expires_at) > Date.now()) || value.displayed_review_sha256 !== await digest(review)) invalid();
      if (!viewCurrent(scope) || revision !== generation || choice !== selected) return;
      preview = value; $("#training-subject").textContent = JSON.stringify(review, null, 2); $("#training-expiry").textContent = `Consent expires ${displayTime(value.expires_at)}`;
      $("#training-confirmation").hidden = false; $("#detail-content").hidden = true; $("#training-confirmation").scrollIntoView({ block: "start" });
      timer = setTimeout(() => { if (preview === value) { preview = null; $("#training-confirmation").hidden = true; $("#training-commit-form").reset();
        $("#detail-content").hidden = false; $("#detail-error").textContent = "Training session consent expired"; } }, Math.max(0, Date.parse(value.expires_at) - Date.now()));
    } catch (error) { if (viewCurrent(scope) && revision === generation) $("#detail-error").textContent = error.message; }
    finally { if (viewCurrent(scope) && revision === generation) $("#training-preview").disabled = false; }
  };
  $("#training-commit-form").addEventListener("submit", event => {
    event.preventDefault(); const form = event.currentTarget;
    void busy(form, async () => {
      try {
        const choice = preview, scope = currentView(), revision = generation; if (!choice) throw new Error("Fresh training session review required");
        const rendered = $("#training-subject").textContent, commitment = await digest(JSON.parse(rendered));
        if (!viewCurrent(scope) || revision !== generation || preview !== choice) return;
        if (rendered !== $("#training-subject").textContent || rendered !== JSON.stringify(choice.review, null, 2) || commitment !== choice.displayed_review_sha256) invalid();
        const input = { challenge_id: choice.challenge_id, nonce: choice.nonce, password: form.elements.password.value, rationale: form.elements.rationale.value,
          acknowledge_session_only: form.elements.acknowledge.checked, displayed_review_sha256: commitment };
        preview = null; clearTimeout(timer); $("#training-confirmation").hidden = true; $("#detail-content").hidden = false; $("#detail-content").textContent = "Recording training session...";
        try { const result = await api("/api/training-sessions/commit", input); if (!viewCurrent(scope) || revision !== generation) return;
          clearDecision(); $("#detail-content").textContent = JSON.stringify(result, null, 2); }
        catch (error) { if (!viewCurrent(scope) || revision !== generation) return; $("#detail-error").textContent = error.message;
          const result = await api(`/api/training-sessions/actions/${choice.challenge_id}`); if (viewCurrent(scope) && revision === generation) $("#detail-content").textContent = JSON.stringify(result, null, 2); }
      } finally { form.elements.password.value = ""; }
    }, "#detail-error");
  });
  return { reset, clear, select, load };
}
