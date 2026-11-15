#!/usr/bin/env node
const assert = require("node:assert/strict");
const { coverageProjection } = require("./operator-console/coverage");
const clone = value => JSON.parse(JSON.stringify(value));
const original = { request: { schema_version: "0.2" }, proposal: require("./sample-payloads/valid-order-adoption-proposal.json"),
  draft: require("./sample-payloads/valid-order-draft.json"), semantic_review: {
    inventory: require("./sample-payloads/valid-requirement-inventory.json"), coverage: require("./sample-payloads/valid-semantic-coverage-proposal.json") } };
const results = [];
function check(name, callback) { callback(); results.push(name); console.log(`PASS ${name}`); }
function denied(name, change) {
  check(name, () => { const value = clone(original); change(value); assert.throws(() => coverageProjection(value)); });
}
check("complete source and every real receiving target are projected without input mutation", () => {
  const value = clone(original), before = JSON.stringify(value), projection = coverageProjection(value);
  assert.equal(JSON.stringify(value), before); assert.equal(projection.targets.size, 3);
  assert.equal(projection.coverage.coverage.length, projection.requirements.size * projection.targets.size);
  assert.match(projection.targets.get("TASK-S3").label, /agent-S3 \/ S3/);
  assert(projection.coverage.coverage.some(item => item.disposition === "not_applicable"));
});
check("historical v0.1 without semantic review uses explicit raw-subject fallback", () => {
  assert.equal(coverageProjection({ request: { schema_version: "0.1" } }), null);
});
denied("new review cannot silently fall back when semantic data is missing", value => { delete value.semantic_review; });
denied("unsupported review class cannot look like human coverage", value => { value.semantic_review.coverage.review_class = "model_complete"; });
denied("display cannot claim calibrated model assurance", value => { value.semantic_review.coverage.model_calibrated_for_admission = true; });
denied("display cannot claim proven completeness", value => { value.semantic_review.inventory.semantic_completeness_proven = true; });
denied("missing matrix row cannot silently shrink the denominator", value => { value.semantic_review.coverage.coverage.pop(); });
denied("duplicate matrix row cannot replace a missing receiver", value => { value.semantic_review.coverage.coverage[1] = clone(value.semantic_review.coverage.coverage[0]); });
denied("unknown requirement is rejected", value => { value.semantic_review.coverage.coverage[0].requirement_id = "REQ-UNKNOWN"; });
denied("unknown receiver is rejected", value => { value.semantic_review.coverage.coverage[0].target_id = "TASK-UNKNOWN"; });
denied("missing receiver agent is rejected", value => { value.proposal.request.plan.agents.pop(); });
denied("ambiguous receiver assignment is rejected", value => { value.proposal.request.plan.order_binding.task_assignments.push(clone(value.proposal.request.plan.order_binding.task_assignments[0])); });
denied("global prohibition cannot disappear behind not-applicable", value => {
  const row = value.semantic_review.coverage.coverage.find(item => item.requirement_id === "REQ-2" && item.target_id !== "order");
  row.disposition = "not_applicable"; row.pointer = row.quote = "";
});
denied("invented receiver quote is rejected", value => { value.semantic_review.coverage.coverage[0].quote = "Not present in the receiving order."; });
denied("inherited prototype pointer cannot be a reviewed location", value => { value.semantic_review.coverage.coverage[0].pointer = "/__proto__/polluted"; });
denied("invalid pointer escape is rejected", value => { value.semantic_review.coverage.coverage[0].pointer = "/mission/~2statement"; });
denied("missing source fragment cannot silently drop a prohibition", value => { value.semantic_review.inventory.fragments.pop(); });
denied("broken UTF-8 source partition is rejected", value => { value.semantic_review.inventory.fragments[0].end_byte++; });
check("context and unknown source fragments remain visible even with no requirement rows", () => {
  const value = clone(original), fragments = value.semantic_review.inventory.fragments;
  for (const classification of ["context", "unknown"]) {
    const start = fragments.at(-1).end_byte, quote = `Additional ${classification} source.\n`;
    fragments.push({ id: `FR-${classification}`, start_byte: start, end_byte: start + Buffer.byteLength(quote), quote,
      classification, requirement_ids: [], rationale: "Synthetic display-only classification." });
  }
  assert.equal(coverageProjection(value).fragments.size, original.semantic_review.inventory.fragments.length + 2);
});
check("omitted, contradicted and uncertain proposals remain explicitly inspectable", () => {
  for (const disposition of ["omitted", "contradicted", "uncertain"]) {
    const value = clone(original), row = value.semantic_review.coverage.coverage[0]; row.disposition = disposition;
    if (disposition !== "contradicted") row.pointer = row.quote = "";
    value.semantic_review.coverage.status = "needs_revision";
    assert.equal(coverageProjection(value).coverage.coverage[0].disposition, disposition);
  }
});
console.log(JSON.stringify({ passed: results.length, failed: 0, scope: "Presentation projection over authored synthetic payloads; no authenticated decisions or model invocations.", execution_authorized: false, release_authorized: false }, null, 2));
