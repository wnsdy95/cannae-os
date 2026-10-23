"use strict";
function createSemanticUi({ $, api, busy, beginRead, readCurrent, currentView, viewCurrent, clearDecision, cell, empty, displayTime, session }) {
  let draft, preview, holdPreview, action, generation = 0, timer, polling = false;
  function reset() {
    generation++; clearInterval(timer); polling = false; draft = preview = holdPreview = action = null;
    $("#semantic-preview").hidden = true; $("#semantic-preview").disabled = false;
    $("#semantic-preview-label").textContent = "Evaluate Omissions";
    $("#semantic-commit-label").textContent = "Approve One Evaluation";
    $("#semantic-stop").hidden = true; $("#semantic-stop").disabled = false;
    $("#semantic-confirmation").hidden = true; $("#semantic-commit-form").reset();
    $("#semantic-prompt").textContent = ""; $("#semantic-expiry").textContent = ""; $("#semantic-profile").replaceChildren();
    $("#model-hold-preview").hidden = true; $("#model-hold-preview").disabled = false;
    $("#model-hold-confirmation").hidden = true; $("#model-hold-form").reset();
    $("#model-hold-expiry").textContent = ""; $("#model-hold-subject").textContent = ""; $("#model-hold-meta").replaceChildren();
  }
  function clear() { reset(); $("#semantic-entries").replaceChildren(); $("#semantic-attention").textContent = ""; }
  function selectDraft(item, manifest) {
    reset();
    const analysis = item.kind === "mission-requests";
    if (analysis ? !session()?.order_analysis_available : !session()?.semantic_review_available || item.kind !== "order-drafts") return;
    draft = { item, manifest, purpose: analysis ? "order_analysis" : "semantic_omission" };
    $("#semantic-preview-label").textContent = analysis ? "Propose Order Analysis" : "Evaluate Omissions";
    $("#semantic-preview").hidden = false;
  }
  function fields(selector, rows) {
    $(selector).replaceChildren();
    for (const [label, value] of rows) {
      const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; $(selector).append(dt, dd);
    }
  }
  function render(current) {
    const analysis = current.purpose === "order_analysis";
    $("#detail-title").textContent = `${analysis ? "Order Analysis" : "Model Evaluation"} / ${current.state}`;
    fields("#detail-meta", [["Mission / Wave", `${current.mission_id} / ${current.wave_id}`], ["Draft", current.draft_id],
      ["Model", current.model], ["Hold", current.hold_preserved ? "Active" : "None"], ["Verified result", current.result_verified ? "Yes" : "Not established"],
      ["Original journal binding", current.result?.collection?.journal_sha256 ? "Signed" : "Not established"], ["Reconciliation", current.reconciliation_state]]);
    $("#detail-content").textContent = JSON.stringify(current, null, 2);
    $("#semantic-stop").hidden = current.state !== "running";
    $("#model-hold-preview").hidden = analysis || current.state !== "held" || !current.result_verified || current.reconciliation_verified ||
      current.result?.schema_version !== "0.2" || !current.result?.collection?.journal_sha256;
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
    $("#semantic-attention").textContent = `${data.held_count} held model actions / ${data.entries.length} retained actions`;
    const body = $("#semantic-entries"); body.replaceChildren();
    if (!data.entries.length) empty(body, 5, "No model actions");
    for (const entry of data.entries) {
      const row = body.insertRow(), name = cell(row, ""), button = document.createElement("button");
      button.className = "artifact-button"; button.textContent = entry.id;
      button.onclick = () => { void inspect(entry.id, scope).catch(failure => { if (readCurrent(scope)) $("#workspace-error").textContent = failure.message; }); };
      name.append(button); cell(row, `${entry.purpose === "order_analysis" ? "Analysis" : "Omission"} / ${entry.draft_id} / ${entry.mission_id}`); cell(row, entry.model);
      cell(row, `${entry.state}${entry.verdict ? " / " + entry.verdict : ""}`); cell(row, displayTime(entry.created_at));
    }
  }
  $("#semantic-preview").onclick = () => {
    const button = $("#semantic-preview"), selected = draft, revision = generation, scope = currentView();
    if (!selected || button.disabled) return;
    button.disabled = true;
    const endpoint = selected.purpose === "order_analysis" ? "/api/order-analyses" : "/api/model-evaluations";
    void api(`${endpoint}/preview`, { entry_id: selected.item.id, manifest: selected.manifest }).then(prepared => {
      if (revision !== generation || selected !== draft || !viewCurrent(scope)) return;
      const analysis = selected.purpose === "order_analysis", invocation = prepared?.invocation, packet = invocation?.preview, profile = invocation?.profile;
      const reference = analysis ? packet?.request_ref : packet?.draft_ref;
      if (prepared?.purpose !== selected.purpose || invocation?.type !== (analysis ? "CodexOrderAnalysisInvocation" : "CodexSemanticInvocation") ||
        packet?.type !== (analysis ? "OrderAnalysisPreview" : "SemanticEvaluationPreview") || reference?.artifact_id !== selected.item.artifact_id ||
        reference?.sha256 !== selected.item.sha256 || typeof packet?.prompt !== "string" || profile?.maximum_invocations !== 1 ||
        invocation.execution_authorized !== false || invocation.release_authorized !== false || !/^[A-Za-z0-9_-]{43}$/.test(prepared.nonce || "") ||
        !Number.isFinite(Date.parse(prepared.expires_at)) || Date.now() >= Date.parse(prepared.expires_at) ||
        analysis && (!Array.isArray(packet.input?.allowed_roles) || !packet.input.allowed_roles.length)) throw new Error("CONSOLE_MODEL_PREVIEW_INVALID");
      preview = prepared;
      $("#semantic-commit-label").textContent = analysis ? "Approve One Analysis" : "Approve One Evaluation";
      fields("#semantic-profile", [["Purpose", prepared.purpose === "order_analysis" ? "One request analysis and proposed draft" : "One semantic omission evaluation"],
        ["Destination", "OpenAI / Existing Codex CLI account"], ["Model alias", profile.requested_model],
        ["CLI version", profile.cli_version], ["Executable SHA-256", profile.executable_sha256], ["Invocation SHA-256", prepared.invocation.invocation_sha256],
        ["Handling", packet.classification], ["Maximum duration", `${profile.timeout_ms / 1000} seconds`], ["Maximum invocations", "1"],
        ["Provider billing cap", "Not enforced"], ["Native context / Model snapshot", "Not attested"], ["Task execution / Release", "Not authorized"],
        ...(prepared.purpose === "order_analysis" ? [["Permitted proposed roles", packet.input.allowed_roles.join(", ")], ["Adoption / Calibrated semantics", "Not authorized / Not established"]] : [])]);
      $("#semantic-expiry").textContent = `Expires ${displayTime(prepared.expires_at)}`;
      $("#semantic-prompt").textContent = packet.prompt;
      $("#semantic-commit-form").reset(); $("#semantic-confirmation").hidden = false;
      $("#detail").scrollTop = $("#semantic-confirmation").offsetTop - $("#detail header").offsetHeight - 20;
    }).catch(failure => { if (revision === generation && selected === draft && viewCurrent(scope)) {
      preview = null; $("#semantic-confirmation").hidden = true; $("#semantic-prompt").textContent = "";
      $("#semantic-profile").replaceChildren(); $("#semantic-commit-form").reset(); $("#detail-error").textContent = failure.message;
    } })
      .finally(() => { if (revision === generation && selected === draft && viewCurrent(scope)) button.disabled = false; });
  };
  $("#semantic-commit-form").onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    void busy(form, async () => {
      const prepared = preview, revision = generation, scope = currentView();
      if (!prepared || !form.elements.acknowledge.checked) throw new Error("CONSOLE_MODEL_PREVIEW_REQUIRED");
      preview = null; action = prepared.challenge_id;
      try {
        const endpoint = prepared.purpose === "order_analysis" ? "/api/order-analyses" : "/api/model-evaluations";
        const current = await api(`${endpoint}/commit`, { challenge_id: prepared.challenge_id, nonce: prepared.nonce,
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
