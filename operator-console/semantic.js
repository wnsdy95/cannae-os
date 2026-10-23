"use strict";
function createSemanticUi({ $, api, busy, beginRead, readCurrent, currentView, viewCurrent, clearDecision, cell, empty, displayTime, session }) {
  let draft, preview, holdPreview, action, generation = 0, timer, polling = false;
  function reset() {
    generation++; clearInterval(timer); polling = false; draft = preview = holdPreview = action = null;
    $("#semantic-preview").hidden = true; $("#semantic-preview").disabled = false;
    $("#semantic-stop").hidden = true; $("#semantic-stop").disabled = false;
    $("#semantic-confirmation").hidden = true; $("#semantic-commit-form").reset();
    $("#semantic-prompt").textContent = ""; $("#semantic-expiry").textContent = ""; $("#semantic-profile").replaceChildren();
    $("#model-hold-preview").hidden = true; $("#model-hold-preview").disabled = false;
    $("#model-hold-confirmation").hidden = true; $("#model-hold-form").reset();
    $("#model-hold-expiry").textContent = ""; $("#model-hold-subject").textContent = ""; $("#model-hold-meta").replaceChildren();
  }
  function clear() { reset(); $("#semantic-entries").replaceChildren(); $("#semantic-attention").textContent = ""; }
  function selectDraft(item, manifest) {
    reset(); if (!session()?.semantic_review_available || item.kind !== "order-drafts") return;
    draft = { item, manifest }; $("#semantic-preview").hidden = false;
  }
  function fields(selector, rows) {
    $(selector).replaceChildren();
    for (const [label, value] of rows) {
      const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; $(selector).append(dt, dd);
    }
  }
  function render(current) {
    $("#detail-title").textContent = `Model Evaluation / ${current.state}`;
    fields("#detail-meta", [["Mission / Wave", `${current.mission_id} / ${current.wave_id}`], ["Draft", current.draft_id],
      ["Model", current.model], ["Hold", current.hold_preserved ? "Active" : "None"], ["Verified result", current.result_verified ? "Yes" : "Not established"],
      ["Reconciliation", current.reconciliation_state]]);
    $("#detail-content").textContent = JSON.stringify(current, null, 2);
    $("#semantic-stop").hidden = current.state !== "running";
    $("#model-hold-preview").hidden = current.state !== "held" || !current.result_verified || current.reconciliation_verified;
    if (current.state !== "running") clearInterval(timer);
  }
  async function poll(id, revision, scope) {
    if (polling) return; polling = true; const read = beginRead("semantic-detail");
    try {
      const current = await api(`/api/model-evaluations/${id}`);
      if (generation !== revision || action !== id || !viewCurrent(scope) || !readCurrent(read)) return;
      render(current);
    } catch (failure) {
      if (generation !== revision || action !== id || !viewCurrent(scope) || !readCurrent(read)) return;
      clearInterval(timer); $("#detail-error").textContent = failure.message;
    } finally { if (generation === revision && viewCurrent(scope)) polling = false; }
  }
  function watch(id) {
    clearInterval(timer); const revision = generation, scope = currentView();
    timer = setInterval(() => { void poll(id, revision, scope); }, 1000);
  }
  async function inspect(id, listScope) {
    if (!readCurrent(listScope)) return;
    clearDecision(); const revision = generation, scope = currentView();
    const current = await api(`/api/model-evaluations/${id}`);
    if (generation !== revision || !viewCurrent(scope)) return;
    action = id; render(current); $("#detail-error").textContent = ""; $("#detail").showModal();
    if (current.state === "running") watch(id);
  }
  async function load() {
    const scope = beginRead("semantic-list"); let data;
    try { data = await api("/api/model-evaluations"); }
    catch (failure) { if (readCurrent(scope)) $("#workspace-error").textContent = failure.message; return; }
    if (!readCurrent(scope)) return;
    $("#semantic-attention").textContent = `${data.held_count} held evaluations / ${data.entries.length} retained actions`;
    const body = $("#semantic-entries"); body.replaceChildren();
    if (!data.entries.length) empty(body, 5, "No model evaluations");
    for (const entry of data.entries) {
      const row = body.insertRow(), name = cell(row, ""), button = document.createElement("button");
      button.className = "artifact-button"; button.textContent = entry.id;
      button.onclick = () => { void inspect(entry.id, scope).catch(failure => { if (readCurrent(scope)) $("#workspace-error").textContent = failure.message; }); };
      name.append(button); cell(row, `${entry.draft_id} / ${entry.mission_id}`); cell(row, entry.model);
      cell(row, `${entry.state}${entry.verdict ? " / " + entry.verdict : ""}`); cell(row, displayTime(entry.created_at));
    }
  }
  $("#semantic-preview").onclick = () => {
    const button = $("#semantic-preview"), selected = draft, revision = generation, scope = currentView();
    if (!selected || button.disabled) return;
    button.disabled = true;
    void api("/api/model-evaluations/preview", { entry_id: selected.item.id, manifest: selected.manifest }).then(prepared => {
      if (revision !== generation || selected !== draft || !viewCurrent(scope)) return;
      preview = prepared; const { profile, preview: packet } = prepared.invocation;
      fields("#semantic-profile", [["Destination", "OpenAI / Existing Codex CLI account"], ["Model alias", profile.requested_model],
        ["CLI version", profile.cli_version], ["Executable SHA-256", profile.executable_sha256], ["Invocation SHA-256", prepared.invocation.invocation_sha256],
        ["Handling", packet.classification], ["Maximum duration", `${profile.timeout_ms / 1000} seconds`], ["Maximum invocations", "1"],
        ["Provider billing cap", "Not enforced"], ["Native context / Model snapshot", "Not attested"], ["Task execution / Release", "Not authorized"]]);
      $("#semantic-expiry").textContent = `Expires ${displayTime(prepared.expires_at)}`;
      $("#semantic-prompt").textContent = packet.prompt;
      $("#semantic-commit-form").reset(); $("#semantic-confirmation").hidden = false;
      $("#detail").scrollTop = $("#semantic-confirmation").offsetTop - $("#detail header").offsetHeight - 20;
    }).catch(failure => { if (revision === generation && selected === draft && viewCurrent(scope)) $("#detail-error").textContent = failure.message; })
      .finally(() => { if (revision === generation && selected === draft && viewCurrent(scope)) button.disabled = false; });
  };
  $("#semantic-commit-form").onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    void busy(form, async () => {
      const prepared = preview, revision = generation, scope = currentView();
      if (!prepared || !form.elements.acknowledge.checked) throw new Error("CONSOLE_MODEL_PREVIEW_REQUIRED");
      preview = null; action = prepared.challenge_id;
      try {
        const current = await api("/api/model-evaluations/commit", { challenge_id: prepared.challenge_id, nonce: prepared.nonce,
          password: form.elements.password.value, rationale: form.elements.rationale.value });
        if (revision !== generation || !viewCurrent(scope)) return;
        $("#semantic-confirmation").hidden = true; $("#semantic-prompt").textContent = ""; $("#semantic-preview").hidden = true;
        render(current); if (current.state === "running") watch(current.id);
      } catch (failure) {
        if (revision !== generation || !viewCurrent(scope)) return;
        const current = await api(`/api/model-evaluations/${prepared.challenge_id}`);
        if (revision !== generation || !viewCurrent(scope)) return;
        $("#semantic-confirmation").hidden = true; $("#semantic-prompt").textContent = "";
        render(current); if (current.state === "running") watch(current.id);
        throw failure;
      } finally { if (revision === generation && viewCurrent(scope)) form.reset(); }
    }, "#detail-error");
  };
  $("#semantic-stop").onclick = () => {
    const id = action, revision = generation, scope = currentView(), button = $("#semantic-stop");
    if (!id || button.disabled) return;
    const read = beginRead("semantic-detail");
    button.disabled = true;
    void api(`/api/model-evaluations/${id}/cancel`, {}).then(current => {
      if (revision === generation && id === action && viewCurrent(scope) && readCurrent(read)) render(current);
    }).catch(failure => { if (revision === generation && id === action && viewCurrent(scope) && readCurrent(read)) $("#detail-error").textContent = failure.message; })
      .finally(() => { if (revision === generation && id === action && viewCurrent(scope)) button.disabled = false; });
  };
  $("#model-hold-preview").onclick = () => {
    const id = action, revision = generation, scope = currentView(), button = $("#model-hold-preview");
    if (!id || button.disabled) return; button.disabled = true;
    void api(`/api/model-evaluations/${id}/reconciliation/preview`, {}).then(prepared => {
      if (revision !== generation || action !== id || !viewCurrent(scope)) return;
      holdPreview = prepared; const subject = prepared.subject;
      fields("#model-hold-meta", [["Resolution", "Acknowledge failed transfer; preserve original failure"],
        ["Local child / Process group", "Both observed absent"], ["Prior transmission", "Possibly transmitted"],
        ["Provider billing / Cancellation", "Not verified"], ["New model call / Task execution / Release", "Not authorized"]]);
      $("#model-hold-subject").textContent = JSON.stringify(subject, null, 2);
      $("#model-hold-expiry").textContent = `Expires ${displayTime(prepared.expires_at)}`;
      $("#model-hold-form").reset(); $("#model-hold-confirmation").hidden = false;
      $("#detail").scrollTop = $("#model-hold-confirmation").offsetTop - $("#detail header").offsetHeight - 20;
    }).catch(failure => { if (revision === generation && action === id && viewCurrent(scope)) $("#detail-error").textContent = failure.message; })
      .finally(() => { if (revision === generation && action === id && viewCurrent(scope)) button.disabled = false; });
  };
  $("#model-hold-form").onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    void busy(form, async () => {
      const prepared = holdPreview, id = action, revision = generation, scope = currentView();
      if (!prepared || !id || !form.elements.acknowledge.checked) throw new Error("CONSOLE_MODEL_RECONCILIATION_PREVIEW_REQUIRED");
      holdPreview = null;
      try {
        await api("/api/model-reconciliations/commit", { reconciliation_id: prepared.reconciliation_id, nonce: prepared.nonce,
          password: form.elements.password.value, rationale: form.elements.rationale.value, acknowledge_provider_uncertainty: true });
      } finally {
        if (revision === generation && action === id && viewCurrent(scope)) {
          form.reset(); $("#model-hold-confirmation").hidden = true; $("#model-hold-subject").textContent = "";
          const current = await api(`/api/model-evaluations/${id}`);
          if (revision === generation && action === id && viewCurrent(scope)) render(current);
        }
      }
    }, "#detail-error");
  };
  return { reset, clear, load, selectDraft };
}
