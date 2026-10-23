"use strict";

// This is display consistency, not signature verification or approval authority.
function coverageProjection(review) {
  const need = condition => { if (!condition) throw new Error("CONSOLE_COVERAGE_DISPLAY_INVALID"); };
  const semantic = review.semantic_review;
  if (!semantic) { need(review.request.schema_version === "0.1"); return null; }
  const { inventory, coverage } = semantic, plan = review.proposal.request.plan, order = review.draft.opord;
  need(inventory?.type === "RequirementInventory" && coverage?.type === "SemanticCoverageProposal");
  need(inventory.schema_version === "0.1" && coverage.schema_version === "0.1");
  need(coverage.review_class === "human_inventory_and_coverage" && coverage.model_calibrated_for_admission === false &&
    coverage.semantic_completeness_proven === false && inventory.semantic_completeness_proven === false);
  need(Array.isArray(inventory.fragments) && inventory.fragments.length > 0 && Array.isArray(inventory.requirements) &&
    inventory.requirements.length > 0 && Array.isArray(coverage.coverage));
  need(Array.isArray(order.execution.tasks) && Array.isArray(plan.agents) && Array.isArray(plan.order_binding.task_assignments));
  const fragments = new Map(inventory.fragments.map(item => [item.id, item]));
  const requirements = new Map(inventory.requirements.map(item => [item.id, item]));
  need(fragments.size === inventory.fragments.length && requirements.size === inventory.requirements.length);
  const text = value => typeof value === "string" && value.length > 0;
  let offset = 0;
  for (const item of inventory.fragments) {
    need(text(item.id) && text(item.quote) && text(item.rationale) && Array.isArray(item.requirement_ids));
    need(["operative", "context", "unknown"].includes(item.classification));
    need(item.start_byte === offset && item.end_byte === offset + new TextEncoder().encode(item.quote).length);
    need(item.requirement_ids.every(id => requirements.get(id)?.source_fragment_ids.includes(item.id)));
    need(item.classification === "operative" ? item.requirement_ids.length > 0 : item.requirement_ids.length === 0);
    offset = item.end_byte;
  }
  const targets = new Map([["order", { content: order, label: "Compiled order" }]]);
  for (const task of order.execution.tasks) {
    const bindings = plan.order_binding.task_assignments.filter(item => item.task_order_id === task.id);
    need(bindings.length === 1 && !targets.has(task.id));
    const agents = plan.agents.filter(item => item.agent_id === bindings[0].agent_id);
    need(agents.length === 1 && text(agents[0].operational_role));
    targets.set(task.id, { content: { task_order: task, agent: agents[0] }, label: `${task.id} / ${agents[0].agent_id} / ${agents[0].operational_role}` });
  }
  for (const item of inventory.requirements) {
    need(text(item.id) && text(item.instruction) && ["obligation", "prohibition", "approval", "resource", "deadline", "condition"].includes(item.kind));
    need(Array.isArray(item.source_fragment_ids) && item.source_fragment_ids.length > 0 && Array.isArray(item.task_ids));
    need(item.source_fragment_ids.every(id => fragments.get(id)?.classification === "operative" && fragments.get(id).requirement_ids.includes(item.id)));
    need(item.scope === "global" ? item.task_ids.length === 0 : item.scope === "task" && item.task_ids.length > 0);
    need(item.task_ids.every(id => id !== "order" && targets.has(id)));
  }
  need(coverage.coverage.length === requirements.size * targets.size);
  const seen = new Set();
  for (const item of coverage.coverage) {
    const requirement = requirements.get(item.requirement_id), target = targets.get(item.target_id), key = JSON.stringify([item.requirement_id, item.target_id]);
    need(requirement && target && !seen.has(key)); seen.add(key);
    need(["preserved", "omitted", "contradicted", "uncertain", "not_applicable"].includes(item.disposition));
    need(text(item.rationale) && typeof item.pointer === "string" && typeof item.quote === "string");
    const applicable = item.target_id === "order" || requirement.scope === "global" || requirement.task_ids.includes(item.target_id);
    need(applicable ? item.disposition !== "not_applicable" : item.disposition === "not_applicable");
    if (["preserved", "contradicted"].includes(item.disposition)) {
      need(item.pointer.startsWith("/") && !/~(?:[^01]|$)/.test(item.pointer));
      let value = target.content;
      for (const part of item.pointer.slice(1).split("/")) {
        const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
        need(value !== null && typeof value === "object" && Object.hasOwn(value, key)); value = value[key];
      }
      need(typeof value === "string" && text(item.quote) && value.includes(item.quote));
    } else need(item.pointer === "" && item.quote === "");
  }
  return { inventory, coverage, plan, order, fragments, requirements, targets };
}

function createCoverageUi({ $ }) {
  let projection = null, view = "coverage", page = 0;
  const pageSize = 25, root = $("#coverage-review");
  function node(tag, value, className) {
    const element = document.createElement(tag); element.textContent = value;
    if (className) element.className = className; return element;
  }
  function quote(parent, value) { parent.append(node("blockquote", value, "coverage-quote")); }
  function clear() {
    projection = null; view = "coverage"; page = 0; root.hidden = true;
    for (const selector of ["#coverage-summary", "#coverage-binding", "#coverage-count", "#coverage-page", "#coverage-order", "#coverage-plan"]) $(selector).textContent = "";
    $("#coverage-rows").replaceChildren(); $("#coverage-source-rows").replaceChildren();
    $("#coverage-target").replaceChildren(new Option("All receivers", "")); $("#coverage-disposition").value = "";
    $("#consent-raw").open = false;
  }
  function render() {
    if (!projection) return;
    const { coverage, requirements, fragments, targets } = projection;
    for (const button of root.querySelectorAll("[data-coverage-view]")) {
      const selected = button.dataset.coverageView === view;
      button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
    }
    for (const panel of root.querySelectorAll("[data-coverage-panel]")) panel.hidden = panel.dataset.coveragePanel !== view;
    $("#coverage-filters").hidden = view !== "coverage"; $("#coverage-pagination").hidden = view === "plan";
    $("#coverage-rows").replaceChildren(); $("#coverage-source-rows").replaceChildren();
    if (view === "plan") { $("#coverage-count").textContent = "Complete order and plan / No display filters"; return; }
    const rows = view === "source" ? projection.inventory.fragments : coverage.coverage.filter(item =>
      (!$("#coverage-target").value || item.target_id === $("#coverage-target").value) &&
      (!$("#coverage-disposition").value || item.disposition === $("#coverage-disposition").value));
    const total = view === "source" ? rows.length : coverage.coverage.length;
    page = Math.max(0, Math.min(page, Math.ceil(rows.length / pageSize) - 1));
    const start = page * pageSize, visible = rows.slice(start, start + pageSize);
    $("#coverage-count").textContent = `${rows.length} of ${total} ${view === "source" ? "source fragments" : "coverage entries"} / ${visible.length ? start + 1 : 0}-${start + visible.length} shown`;
    $("#coverage-page").textContent = `Page ${page + 1} of ${Math.max(1, Math.ceil(rows.length / pageSize))}`;
    $("#coverage-previous").disabled = page === 0; $("#coverage-next").disabled = start + pageSize >= rows.length;
    for (const item of visible) {
      const row = document.createElement("tr");
      if (view === "source") {
        const identity = node("td", ""); identity.append(node("strong", item.id), node("span", `UTF-8 bytes ${item.start_byte}-${item.end_byte}`, "muted"));
        const source = node("td", ""); quote(source, item.quote);
        const classification = node("td", ""); classification.append(node("strong", item.classification), node("p", item.requirement_ids.join(", ") || "No requirements"), node("p", item.rationale));
        row.append(identity, source, classification); $("#coverage-source-rows").append(row);
      } else {
        const requirement = requirements.get(item.requirement_id), source = node("td", "");
        source.append(node("strong", requirement.id), node("span", `${requirement.kind} / ${requirement.scope === "global" ? "Global / All receivers" : `Tasks: ${requirement.task_ids.join(", ")}`}`, "muted"), node("p", requirement.instruction));
        for (const id of requirement.source_fragment_ids) { source.append(node("span", id, "muted")); quote(source, fragments.get(id).quote); }
        const receiver = node("td", ""); receiver.append(node("strong", targets.get(item.target_id).label));
        if (item.pointer) receiver.append(node("code", item.pointer));
        if (item.quote) quote(receiver, item.quote);
        const disposition = node("td", ""); disposition.dataset.disposition = item.disposition;
        disposition.append(node("strong", item.disposition.replace(/_/g, " ")), node("p", item.rationale));
        row.append(source, receiver, disposition); $("#coverage-rows").append(row);
      }
    }
    if (!visible.length) { const row = $("#coverage-rows").insertRow(), empty = row.insertCell(); empty.colSpan = 3; empty.className = "empty"; empty.textContent = "No matching coverage entries"; }
  }
  const tabs = [...root.querySelectorAll("[data-coverage-view]")];
  for (const [index, button] of tabs.entries()) {
    button.onclick = () => { view = button.dataset.coverageView; page = 0; render(); };
    button.onkeydown = event => {
      const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return; event.preventDefault(); tabs[next].focus(); tabs[next].click();
    };
  }
  for (const selector of ["#coverage-target", "#coverage-disposition"]) $(selector).onchange = () => { page = 0; render(); };
  $("#coverage-previous").onclick = () => { page--; render(); }; $("#coverage-next").onclick = () => { page++; render(); };
  return { clear, show(review) {
    clear(); const value = coverageProjection(review);
    if (!value) { $("#consent-raw").open = true; return; }
    projection = value; const { inventory, coverage, targets } = value;
    $("#coverage-summary").textContent = `${inventory.requirements.length} requirements / ${targets.size} receivers / ${inventory.fragments.length} source fragments / ${coverage.status.replace(/_/g, " ")}`;
    $("#coverage-binding").textContent = `Plan SHA-256 ${coverage.plan_sha256}`;
    for (const [id, target] of targets) $("#coverage-target").append(new Option(target.label, id));
    $("#coverage-order").textContent = JSON.stringify(value.order, null, 2); $("#coverage-plan").textContent = JSON.stringify(value.plan, null, 2);
    root.hidden = false; render();
  } };
}

if (typeof module !== "undefined") module.exports = { coverageProjection };
