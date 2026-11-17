"use strict";
function createSemanticUi({ $, api, busy, beginRead, readCurrent, currentView, viewCurrent, clearDecision, cell, empty, displayTime, session }) {
  const endpointFor = purpose => purpose === "native_training" ? "/api/training-products" : purpose === "order_analysis" ? "/api/order-analyses" : "/api/model-evaluations";
  let draft, preview, displaySnapshot, holdPreview, action, actionPurpose, actionSource, actionInvocation, generation = 0, timer, polling = false;
  const invalidDisplay = () => { throw new Error("CONSOLE_MODEL_DISPLAY_MISMATCH"); };
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ?
    Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  async function subjectDigest(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
    if (bytes.length > 1048576) invalidDisplay();
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  async function displayedDigest(invocation) {
    if (!invocation || typeof invocation !== "object" || Array.isArray(invocation)) invalidDisplay();
    const { invocation_sha256, ...body } = invocation, bytes = new TextEncoder().encode(JSON.stringify(canonical(body)));
    if (bytes.length > 1048576) invalidDisplay();
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  function clearHoldReview() {
    holdPreview = null; $("#model-hold-confirmation").hidden = true; $("#model-hold-form").reset();
    $("#model-hold-title").textContent = "Failed Model Transfer Review";
    $("#analysis-publication-check").hidden = true; $("#model-hold-form").elements.acknowledge_publication.required = false;
    for (const name of ["native_publication", "response_observation"]) {
      $(`#${name.replaceAll("_", "-")}-check`).hidden = true; $("#model-hold-form").elements[`acknowledge_${name}`].required = false;
    }
    $("#model-hold-expiry").textContent = ""; $("#model-hold-subject").textContent = ""; $("#model-hold-meta").replaceChildren();
  }
  function reset() {
    generation++; clearInterval(timer); polling = false; draft = preview = displaySnapshot = holdPreview = action = actionPurpose = actionSource = actionInvocation = null;
    $("#semantic-preview").hidden = true; $("#semantic-preview").disabled = false;
    $("#semantic-preview-label").textContent = "Evaluate Omissions";
    $("#semantic-commit-label").textContent = "Approve One Evaluation";
    $("#semantic-stop").hidden = true; $("#semantic-stop").disabled = false;
    $("#semantic-stop-label").textContent = "Stop Evaluation";
    $("#semantic-confirmation").hidden = true; $("#semantic-commit-form").reset();
    $("#semantic-prompt").textContent = ""; $("#semantic-expiry").textContent = ""; $("#semantic-profile").replaceChildren();
    $("#semantic-invocation").textContent = "";
    $("#native-handling").hidden = $("#native-handling-check").hidden = true; $("#native-handling-subject").textContent = "";
    $("#semantic-commit-form").elements.acknowledge_handling.required = false;
    $("#model-hold-preview").hidden = true; $("#model-hold-preview").disabled = false;
    clearHoldReview();
  }
  function clear() { reset(); $("#semantic-entries").replaceChildren(); $("#semantic-attention").textContent = ""; }
  function selectDraft(item, manifest) {
    reset();
    const analysis = item.kind === "mission-requests";
    const training = item.kind === "task-training-product-requests";
    if (training ? !session()?.native_training_available : analysis ? !session()?.order_analysis_available : !session()?.semantic_review_available || item.kind !== "order-drafts") return;
    draft = { item, manifest, purpose: training ? "native_training" : analysis ? "order_analysis" : "semantic_omission" };
    $("#semantic-preview-label").textContent = training ? "Review Training Transfer" : analysis ? "Propose Order Analysis" : "Evaluate Omissions";
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
    const training = current.purpose === "native_training";
    actionPurpose = current.purpose;
    actionSource = current.draft_id; actionInvocation = current.invocation_sha256;
    $("#detail-title").textContent = `${training ? "Training Product" : analysis ? "Order Analysis" : "Model Evaluation"} / ${current.state}`;
    fields("#detail-meta", [["Mission / Wave", `${current.mission_id} / ${current.wave_id}`], ["Draft", current.draft_id],
      ["Model", current.model], ["Hold", current.hold_preserved ? "Active" : "None"], ["Verified result", current.result_verified ? "Yes" : "Not established"],
      ["Original journal binding", current.result?.collection?.journal_sha256 ? "Signed" : "Not established"], ["Reconciliation", current.reconciliation_state]]);
    $("#detail-content").textContent = JSON.stringify(current, null, 2);
    $("#semantic-stop").hidden = current.state !== "running";
    $("#semantic-stop-label").textContent = training ? "Stop Transfer" : analysis ? "Stop Analysis" : "Stop Evaluation";
    $("#model-hold-preview").hidden = current.state !== "held" || !current.result_verified || current.reconciliation_verified ||
      current.result?.schema_version !== (analysis || training ? "0.1" : "0.2") || !current.result?.collection?.journal_sha256;
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
    const orphans = data.native_inventory?.orphaned || [];
    $("#semantic-attention").textContent = `${data.held_count} held model actions / ${data.entries.length} retained actions / ${orphans.length} orphaned training records`;
    const body = $("#semantic-entries"); body.replaceChildren();
    if (!data.entries.length && !orphans.length) empty(body, 5, "No model actions");
    for (const entry of data.entries) {
      const row = body.insertRow(), name = cell(row, ""), button = document.createElement("button");
      button.className = "artifact-button"; button.textContent = entry.id;
      button.onclick = () => { void inspect(entry.id, scope).catch(failure => { if (readCurrent(scope)) $("#workspace-error").textContent = failure.message; }); };
      name.append(button); cell(row, `${entry.purpose === "native_training" ? "Training" : entry.purpose === "order_analysis" ? "Analysis" : "Omission"} / ${entry.draft_id} / ${entry.mission_id}`); cell(row, entry.model);
      cell(row, `${entry.state}${entry.verdict ? " / " + entry.verdict : ""}`); cell(row, displayTime(entry.created_at));
    }
    for (const orphan of orphans) { const row = body.insertRow(); cell(row, orphan.code); cell(row, orphan.action_id || orphan.directory_sha256); cell(row, "Not established"); cell(row, "Uncertain / Held"); cell(row, "Not established"); }
  }
  $("#semantic-preview").onclick = () => {
    const button = $("#semantic-preview"), selected = draft, revision = generation, scope = currentView();
    if (!selected || button.disabled) return;
    button.disabled = true;
    preview = displaySnapshot = null; $("#detail-error").textContent = "";
    $("#semantic-confirmation").hidden = true; $("#semantic-commit-form").reset();
    const endpoint = endpointFor(selected.purpose);
    void api(`${endpoint}/preview`, { entry_id: selected.item.id, manifest: selected.manifest }).then(async prepared => {
      if (revision !== generation || selected !== draft || !viewCurrent(scope)) return;
      const analysis = selected.purpose === "order_analysis", invocation = prepared?.invocation, packet = invocation?.preview, profile = invocation?.profile;
      const training = selected.purpose === "native_training", reference = analysis || training ? packet?.request_ref : packet?.draft_ref;
      if (prepared?.purpose !== selected.purpose || invocation?.type !== (training ? "CodexTrainingProductInvocation" : analysis ? "CodexOrderAnalysisInvocation" : "CodexSemanticInvocation") ||
        packet?.type !== (training ? "NativeTrainingProductPreview" : analysis ? "OrderAnalysisPreview" : "SemanticEvaluationPreview") || training && (packet.schema_version !== "0.2" || !packet.input?.transfer_review) || reference?.artifact_id !== selected.item.artifact_id ||
        reference?.sha256 !== selected.item.sha256 || typeof packet?.prompt !== "string" || profile?.maximum_invocations !== 1 ||
        invocation.execution_authorized !== false || invocation.release_authorized !== false || !/^[A-Za-z0-9_-]{43}$/.test(prepared.nonce || "") ||
        !Number.isFinite(Date.parse(prepared.expires_at)) || Date.now() >= Date.parse(prepared.expires_at) ||
        analysis && (!Array.isArray(packet.input?.allowed_roles) || !packet.input.allowed_roles.length)) throw new Error("CONSOLE_MODEL_PREVIEW_INVALID");
      if (await displayedDigest(invocation) !== invocation.invocation_sha256) invalidDisplay();
      if (revision !== generation || selected !== draft || !viewCurrent(scope)) return;
      preview = prepared;
      $("#semantic-commit-label").textContent = training ? "Approve One Training Transfer" : analysis ? "Approve One Analysis" : "Approve One Evaluation";
      fields("#semantic-profile", [["Purpose", training ? "One native task product / No grade or grant" : prepared.purpose === "order_analysis" ? "One request analysis and proposed draft" : "One semantic omission evaluation"],
        ["Destination", "OpenAI / Existing Codex CLI account"], ["Model alias", profile.requested_model],
        ...(profile.model_selection ? [["Model selection", "CLI default frozen during host preparation"],
          ["Default resolved", displayTime(profile.model_selection.resolved_at)], ["Selection SHA-256", profile.model_selection.selection_sha256]] : []),
        ["CLI version", profile.cli_version], ["Executable SHA-256", profile.executable_sha256], ["Invocation SHA-256", prepared.invocation.invocation_sha256],
        ["Handling", training ? packet.input.request.classification : packet.classification], ["Maximum duration", `${profile.timeout_ms / 1000} seconds`], ["Maximum invocations", "1"],
        ["Provider billing cap", "Not enforced"], ["Native context / Model snapshot", "Not attested"], [training ? "Operational execution / Release" : "Task execution / Release", "Not authorized"],
        ...(training ? [["Case", packet.input.request.case_id], ["Receiving role", packet.input.context.operational_role],
          ["Standard source mission", packet.input.source_standard.mission_id], ["Collection", packet.input.request.collection_id],
          ["Handling review", packet.input.transfer_review.request.id]] : []),
        ...(prepared.purpose === "order_analysis" ? [["Permitted proposed roles", packet.input.allowed_roles.join(", ")], ["Adoption / Calibrated semantics", "Not authorized / Not established"]] : [])]);
      $("#semantic-expiry").textContent = `Expires ${displayTime(prepared.expires_at)}`;
      $("#semantic-prompt").textContent = packet.prompt;
      $("#semantic-invocation").textContent = JSON.stringify(invocation, null, 2);
      $("#native-handling").hidden = $("#native-handling-check").hidden = !training;
      $("#native-handling-subject").textContent = training ? JSON.stringify(packet.input.transfer_review, null, 2) : "";
      $("#semantic-commit-form").elements.acknowledge_handling.required = training;
      displaySnapshot = { record: $("#semantic-invocation").textContent, profile: $("#semantic-profile").textContent, prompt: packet.prompt, handling: $("#native-handling-subject").textContent };
      $("#semantic-commit-form").reset(); $("#semantic-confirmation").hidden = false;
      $("#detail").scrollTop = $("#semantic-confirmation").offsetTop - $("#detail header").offsetHeight - 20;
    }).catch(failure => { if (revision === generation && selected === draft && viewCurrent(scope)) {
      preview = displaySnapshot = null; $("#semantic-confirmation").hidden = true; $("#semantic-prompt").textContent = ""; $("#semantic-invocation").textContent = "";
      $("#semantic-profile").replaceChildren(); $("#semantic-commit-form").reset(); $("#detail-error").textContent = failure.message;
    } })
      .finally(() => { if (revision === generation && selected === draft && viewCurrent(scope)) button.disabled = false; });
  };
  $("#semantic-commit-form").onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    void busy(form, async () => {
      const prepared = preview, revision = generation, scope = currentView();
      const snapshot = displaySnapshot, raw = $("#semantic-invocation").textContent;
      let submitted = false;
      try {
        if (!prepared || !snapshot || !form.elements.acknowledge.checked) throw new Error("CONSOLE_MODEL_PREVIEW_REQUIRED");
        if (raw.length > 2097152 || raw !== snapshot.record || $("#semantic-profile").textContent !== snapshot.profile || $("#semantic-prompt").textContent !== snapshot.prompt || $("#native-handling-subject").textContent !== snapshot.handling) invalidDisplay();
        const displayed = JSON.parse(raw), displayedHash = await displayedDigest(displayed);
        if (revision !== generation || !viewCurrent(scope) || preview !== prepared) return;
        if (displayedHash !== prepared.invocation.invocation_sha256 || raw !== $("#semantic-invocation").textContent ||
            $("#semantic-profile").textContent !== snapshot.profile || $("#semantic-prompt").textContent !== snapshot.prompt || $("#native-handling-subject").textContent !== snapshot.handling) invalidDisplay();
        preview = null; action = prepared.challenge_id;
        submitted = true;
        const endpoint = endpointFor(prepared.purpose);
        const current = await api(`${endpoint}/commit`, { challenge_id: prepared.challenge_id, nonce: prepared.nonce,
          password: form.elements.password.value, rationale: form.elements.rationale.value, displayed_invocation_sha256: displayedHash,
          ...(prepared.purpose === "native_training" ? { acknowledge_mission_handling: form.elements.acknowledge_handling.checked } : {}) });
        if (revision !== generation || !viewCurrent(scope)) return;
        displaySnapshot = null; $("#semantic-confirmation").hidden = true; $("#semantic-prompt").textContent = ""; $("#semantic-invocation").textContent = ""; $("#semantic-preview").hidden = true;
        render(current); if (current.state === "running") watch(current.id);
      } catch (failure) {
        if (!submitted) throw failure;
        if (revision !== generation || !viewCurrent(scope)) return;
        const current = await api(`/api/model-evaluations/${prepared.challenge_id}`);
        if (revision !== generation || !viewCurrent(scope)) return;
        displaySnapshot = null; $("#semantic-confirmation").hidden = true; $("#semantic-prompt").textContent = ""; $("#semantic-invocation").textContent = "";
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
    const id = action, purpose = actionPurpose, sourceId = actionSource, invocation = actionInvocation, analysis = purpose === "order_analysis", training = purpose === "native_training", revision = generation, scope = currentView(), button = $("#model-hold-preview");
    if (!id || button.disabled) return; button.disabled = true;
    $("#detail-error").textContent = "";
    const endpoint = endpointFor(purpose);
    void api(`${endpoint}/${id}/reconciliation/preview`, {}).then(async prepared => {
      if (revision !== generation || action !== id || !viewCurrent(scope)) return;
      const subject = prepared?.subject, publication = subject?.publication;
      const reference = value => value && typeof value.artifact_id === "string" && typeof value.relative_path === "string" && /^[a-f0-9]{64}$/.test(value.sha256 || "");
      const publicationValid = publication && reference(publication.request_ref) && publication.request_ref.artifact_id === sourceId && (publication.kind === "no_accepted_response" ||
        publication.kind === "accepted_response" && /^[a-f0-9]{64}$/.test(publication.response_sha256 || "") && /^[a-f0-9]{64}$/.test(publication.analysis_sha256 || "") &&
        /^OD-[a-f0-9]{32}$/.test(publication.expected_draft_id || "") && (publication.publication_state === "published"
          ? reference(publication.draft_ref) && publication.draft_ref.artifact_id === publication.expected_draft_id && ["ready_for_review", "needs_clarification"].includes(publication.draft_status)
          : publication.publication_state === "not_in_verified_manifest" && publication.draft_ref === null && publication.draft_status === null));
      const native = subject?.native_appraisal, nativePublication = native?.publication, response = native?.response;
      const nativeRefs = nativePublication && [nativePublication.authorization_ref, nativePublication.output_ref, nativePublication.result_ref];
      const nativeValid = native?.type === "NativeTrainingFailureAppraisal" && native.action_id === id && native.request_ref?.artifact_id === sourceId &&
        native.invocation_sha256 === invocation && native.hold_discharge_authorized === false && native.execution_authorized === false && native.release_authorized === false &&
        ["rejected_response", "accepted_native_product"].includes(native.assessment?.kind) && response && /^[a-f0-9]{64}$/.test(response.observed_file_sha256 || "") &&
        response.original_file_bytes_bound === (response.original_file_sha256 !== null) &&
        (!response.original_file_bytes_bound || response.original_file_sha256 === response.observed_file_sha256) &&
        nativeRefs && nativeRefs.every((ref, index) => ref === null || reference(ref) && nativeRefs.slice(0, index).every(Boolean)) &&
        ["none", "authorization_only", "authorization_and_output", "complete"][nativeRefs.filter(Boolean).length] === nativePublication.state &&
        nativePublication.artifact_settlement_authorized === false && nativePublication.task_output_admitted === false &&
        (native.assessment.kind !== "rejected_response" || nativePublication.state === "none");
      if (subject?.action_id !== id || subject.invocation_sha256 !== invocation || prepared.execution_authorized !== false || prepared.release_authorized !== false ||
        !/^[A-Za-z0-9_-]{43}$/.test(prepared.nonce || "") || !Number.isFinite(Date.parse(prepared.expires_at)) || Date.now() >= Date.parse(prepared.expires_at) ||
        (analysis && (prepared.purpose !== purpose || subject.model_purpose !== purpose || !publicationValid ||
          publication.draft_adoption_authorized !== false || publication.artifact_settlement_authorized !== false ||
          !["no_accepted_response", "accepted_response"].includes(publication.kind))) ||
        (training && (prepared.purpose !== purpose || subject.model_purpose !== purpose || !nativeValid || await subjectDigest(subject) !== prepared.displayed_subject_sha256)) ||
        (!analysis && !training && (prepared.purpose !== undefined || subject.model_purpose !== undefined))) throw new Error("CONSOLE_MODEL_RECONCILIATION_PREVIEW_INVALID");
      if (revision !== generation || action !== id || !viewCurrent(scope)) return;
      holdPreview = structuredClone(prepared);
      $("#model-hold-title").textContent = training ? "Failed Training Transfer Review" : analysis ? "Failed Request Analysis Review" : "Failed Model Transfer Review";
      fields("#model-hold-meta", [["Purpose", training ? "Native training transfer" : analysis ? "Request analysis transfer" : "Semantic omission evaluation"],
        ["Resolution", "Acknowledge failed transfer; preserve original failure"],
        ["Local child / Process group", "Both observed absent"], ["Prior transmission", "Possibly transmitted"],
        ["Provider billing / Cancellation", "Not verified"], ["New model call / Task execution / Release", "Not authorized"],
        ...(analysis ? [["Draft publication", publication.kind === "no_accepted_response" ? "No accepted response" : publication.publication_state === "published"
          ? `Published: ${publication.draft_ref.artifact_id} / ${publication.draft_status}` : "Not observed in the verified manifest"],
        ["Draft adoption / Artifact settlement", "Not authorized"]] : []),
        ...(training ? [["Response evidence", response.original_file_bytes_bound ? "Original bytes bound" : "Current canonical observation only"],
          ["Native publication", nativePublication.state], ["Task admission / Settlement / Qualification", "Not authorized"]] : [])]);
      $("#model-hold-subject").textContent = JSON.stringify(subject, null, 2);
      $("#model-hold-expiry").textContent = `Expires ${displayTime(prepared.expires_at)}`;
      $("#model-hold-form").reset(); $("#model-hold-confirmation").hidden = false;
      $("#analysis-publication-check").hidden = !analysis; $("#model-hold-form").elements.acknowledge_publication.required = analysis;
      for (const name of ["native_publication", "response_observation"]) {
        $(`#${name.replaceAll("_", "-")}-check`).hidden = !training; $("#model-hold-form").elements[`acknowledge_${name}`].required = training;
      }
      $("#detail").scrollTop = $("#model-hold-confirmation").offsetTop - $("#detail header").offsetHeight - 20;
    }).catch(failure => { if (revision === generation && action === id && viewCurrent(scope)) { clearHoldReview(); $("#detail-error").textContent = failure.message; } })
      .finally(() => { if (revision === generation && action === id && viewCurrent(scope)) button.disabled = false; });
  };
  $("#model-hold-form").onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    void busy(form, async () => {
      const prepared = holdPreview, id = action, revision = generation, scope = currentView();
      if (!prepared || !id || !form.elements.acknowledge.checked) throw new Error("CONSOLE_MODEL_RECONCILIATION_PREVIEW_REQUIRED");
      const analysis = prepared.purpose === "order_analysis";
      const training = prepared.purpose === "native_training";
      holdPreview = null;
      try {
        if (analysis && !form.elements.acknowledge_publication.checked) throw new Error("CONSOLE_ANALYSIS_PUBLICATION_ACKNOWLEDGMENT_REQUIRED");
        if (training) {
          if (!form.elements.acknowledge_native_publication.checked || !form.elements.acknowledge_response_observation.checked) throw new Error("CONSOLE_NATIVE_RECONCILIATION_ACKNOWLEDGMENT_REQUIRED");
          let subject; try { subject = JSON.parse($("#model-hold-subject").textContent); } catch { invalidDisplay(); }
          if (await subjectDigest(subject) !== prepared.displayed_subject_sha256) invalidDisplay();
          if (revision !== generation || action !== id || !viewCurrent(scope)) return;
        }
        await api(training ? "/api/native-training-reconciliations/commit" : analysis ? "/api/analysis-reconciliations/commit" : "/api/model-reconciliations/commit", { reconciliation_id: prepared.reconciliation_id, nonce: prepared.nonce,
          password: form.elements.password.value, rationale: form.elements.rationale.value, acknowledge_provider_uncertainty: true,
          ...(analysis ? { acknowledge_analysis_publication: true } : {}),
          ...(training ? { displayed_subject_sha256: prepared.displayed_subject_sha256, acknowledge_native_publication: true, acknowledge_response_observation: true } : {}) });
      } finally {
        if (revision === generation && action === id && viewCurrent(scope)) {
          clearHoldReview();
          const current = await api(`/api/model-evaluations/${id}`);
          if (revision === generation && action === id && viewCurrent(scope)) render(current);
        }
      }
    }, "#detail-error");
  };
  return { reset, clear, load, selectDraft };
}
