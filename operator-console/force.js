"use strict";
function createForceRegistryUi({ $, api, busy, beginRead, readCurrent, currentView, viewCurrent, clearDecision, cell, empty, displayTime, session }) {
  let selected = null, preview = null, generation = 0, timer;
  const invalidDisplay = () => { throw new Error("CONSOLE_FORCE_REVIEW_DISPLAY_INVALID"); };
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ?
    Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  async function displayedDigest(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(canonical(value))); if (bytes.length > 196608) invalidDisplay();
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  async function validatePreview(value, choice) {
    const review = value?.review, keys = ["proposal_ref", "proposal", "materials", "registry_head_ref", "previous_entity", "next_sequence", "repository_binding", "observed_manifest", "source_state_sha256", "repository_state_sha256"].sort();
    if (!review || JSON.stringify(Object.keys(review).sort()) !== JSON.stringify(keys) || !Array.isArray(review.materials) ||
        review.proposal?.type !== "ForceRegistryProposal" || review.proposal.purpose !== "force_registry_enrollment" ||
        review.proposal_ref?.artifact_id !== choice.item.artifact_id || review.observed_manifest?.sha256 !== choice.manifest ||
        review.repository_binding?.repository_key !== session()?.repository?.key ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.challenge_id || "") ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.nonce || "") || !/^[a-f0-9]{64}$/.test(value.displayed_review_sha256 || "") ||
        value.execution_authorized !== false || value.release_authorized !== false || value.qualification_granted !== false ||
        value.standing_activation_authorized !== false || !(Date.parse(value.expires_at) > Date.now()) ||
        value.displayed_review_sha256 !== await displayedDigest(review)) invalidDisplay();
  }
  function reset() {
    generation++; selected = preview = null; clearTimeout(timer);
    $("#detail-content").hidden = false;
    $("#force-preview").hidden = true; $("#force-preview").disabled = false;
    $("#force-confirmation").hidden = true; $("#force-subject").textContent = ""; $("#force-expiry").textContent = "";
    $("#force-commit-form").reset();
    for (const element of $("#force-commit-form").elements) element.disabled = false;
  }
  function clear() { reset(); $("#force-entities").replaceChildren(); $("#force-actions").replaceChildren(); $("#force-state").textContent = ""; $("#force-head").textContent = ""; }
  function select(item, manifest) {
    reset(); if (session()?.user?.role !== "owner" || item.kind !== "force-registry-proposals") return;
    selected = { item, manifest }; $("#force-preview").hidden = false;
  }
  function button(row, text, action) {
    const target = cell(row, ""), element = document.createElement("button"); element.className = "artifact-button"; element.textContent = text;
    element.title = `Inspect ${text}`; element.onclick = action; target.append(element);
  }
  async function load() {
    reset(); const scope = beginRead("force-registry"), value = await api("/api/force-registry"); if (!readCurrent(scope)) return;
    $("#force-state").textContent = value.mutation_held ? "Enrollment held" : value.sequence ? "Definition history verified" : "Empty registry";
    $("#force-head").textContent = `Sequence ${value.sequence} / ${value.observed_manifest.sha256.slice(0, 12)}`;
    const rows = $("#force-entities"); rows.replaceChildren();
    if (!value.entities.length) empty(rows, 4, "No enrolled definitions");
    for (const entity of value.entities) {
      const row = rows.insertRow();
      button(row, entity.id, () => { if (!readCurrent(scope)) return; clearDecision(); $("#detail-title").textContent = entity.id;
        $("#detail-meta").replaceChildren(); $("#detail-content").textContent = JSON.stringify(entity, null, 2); $("#detail").showModal(); });
      cell(row, `${entity.version} / ${entity.enrollment_state}`);
      cell(row, entity.kind === "performer" ? `${entity.data.owner_id} / ${entity.data.model_id} / ${entity.data.model_revision}` : entity.data.owner_id || entity.data.parent_id);
      cell(row, entity.qualification_state);
    }
    const actions = $("#force-actions"); actions.replaceChildren();
    if (!value.actions.length) empty(actions, 4, "No enrollment decisions");
    for (const action of value.actions) {
      const row = actions.insertRow();
      button(row, action.id, async () => {
        if (!readCurrent(scope)) return; clearDecision(); const view = currentView();
        try { const detail = await api(`/api/force-registry/actions/${action.id}`); if (!viewCurrent(view)) return;
          $("#detail-title").textContent = action.id; $("#detail-meta").replaceChildren(); $("#detail-content").textContent = JSON.stringify(detail, null, 2); $("#detail").showModal(); }
        catch (error) { if (viewCurrent(view)) $("#workspace-error").textContent = error.message; }
      });
      cell(row, action.entity_id); cell(row, action.state); cell(row, displayTime(action.created_at));
    }
  }
  $("#force-preview").onclick = async () => {
    const choice = selected, scope = currentView(), version = ++generation; if (!choice) return;
    preview = null; clearTimeout(timer); $("#force-confirmation").hidden = true;
    $("#detail-content").hidden = false; $("#detail-error").textContent = "";
    $("#force-preview").disabled = true;
    try {
      const value = await api("/api/force-registry/preview", { entry_id: choice.item.id, manifest: choice.manifest });
      await validatePreview(value, choice);
      if (!viewCurrent(scope) || version !== generation || selected !== choice) return;
      preview = value; $("#force-subject").textContent = JSON.stringify(value.review, null, 2);
      $("#force-expiry").textContent = `Consent expires ${displayTime(value.expires_at)}`; $("#force-confirmation").hidden = false;
      $("#detail-content").hidden = true; $("#force-confirmation").scrollIntoView({ block: "start" });
      timer = setTimeout(() => { if (preview === value) { preview = null; $("#force-confirmation").hidden = true; $("#force-commit-form").reset();
        $("#detail-content").hidden = false; $("#detail-error").textContent = "Enrollment consent expired"; } }, Math.max(0, Date.parse(value.expires_at) - Date.now()));
    } catch (error) { if (viewCurrent(scope) && version === generation) $("#detail-error").textContent = error.message; }
    finally { if (viewCurrent(scope) && version === generation) $("#force-preview").disabled = false; }
  };
  $("#force-commit-form").addEventListener("submit", event => {
    event.preventDefault(); const form = event.currentTarget;
    void busy(form, async () => {
      try {
        const choice = preview, scope = currentView(), version = generation; if (!choice) throw new Error("Fresh definition review required");
        const displayed = $("#force-subject").textContent, digest = await displayedDigest(JSON.parse(displayed));
        if (!viewCurrent(scope) || generation !== version || preview !== choice) return;
        if (digest !== choice.displayed_review_sha256 || displayed !== $("#force-subject").textContent || displayed !== JSON.stringify(choice.review, null, 2)) invalidDisplay();
        const input = { challenge_id: choice.challenge_id, nonce: choice.nonce, password: form.elements.password.value,
          rationale: form.elements.rationale.value, acknowledge_definition_only: form.elements.acknowledge.checked, displayed_review_sha256: digest };
        preview = null; clearTimeout(timer); $("#force-confirmation").hidden = true;
        $("#detail-content").hidden = false; $("#detail-content").textContent = "Recording enrollment...";
        try {
          const result = await api("/api/force-registry/commit", input); if (!viewCurrent(scope) || generation !== version) return;
          clearDecision(); $("#detail-content").textContent = JSON.stringify(result, null, 2);
        } catch (error) {
          if (!viewCurrent(scope) || generation !== version) return;
          $("#detail-error").textContent = error.message;
          const outcome = await api(`/api/force-registry/actions/${choice.challenge_id}`);
          if (viewCurrent(scope) && generation === version) $("#detail-content").textContent = JSON.stringify(outcome, null, 2);
        }
      } finally { form.elements.password.value = ""; }
    }, "#detail-error");
  });
  return { reset, clear, select, load };
}
