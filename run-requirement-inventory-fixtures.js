#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const s = require("./order-adoption-fixtures/support");
const contract = require("./requirement-inventory-contract");
const { retainInventory, retainCoverage, reviewProof } = require("./requirement-inventory-controller");
const adoption = require("./order-adoption-controller");
const { loadVerifiedStore } = require("./campaign-supervisor");
const { digest, sha256 } = require("./order-intake-contract");
const { manifestDigest } = require("./repository-artifact-store");
const { validatePayload, validateSchemaPayload } = require("./validator-cli-prototype/validate");
const roots = [], results = [];
function setup() { const env = s.environment(); roots.push(env.root); s.prepareSemanticReview(env); return env; }
function check(name, fn) { fn(); results.push(name); console.log(`PASS ${name}`); }
function store(env) { return loadVerifiedStore(env.options.repository, env.options.artifactRoot); }
function expectIssue(value, type, code) { assert(validatePayload(value, type).issues.some(item => item.code === code), code); }
function reidentify(value, prefix) { return contract.identified(s.clone(value), prefix); }
try {
  const env = setup(), inventory = s.read(env, env.inventory.artifact_ref), review = s.read(env, env.semanticReview.artifact_ref);
  check("retained exact source partitions and the full actual receiver coverage remain non-authorizing", () => {
    const proof = reviewProof(store(env), env.semanticReview.artifact_ref, env.plan, env.draft, s.optionsAt(env, 20).now);
    assert.equal(proof.inventory.payload.fragments.map(item => item.quote).join(""), s.read(env, env.captured.artifact_ref).text);
    const assignment = contract.assignmentFor(proof, env.plan.agents[0].agent_id, env.plan);
    assert.equal(assignment.requirements.some(item => item.scope === "task"), false);
    assert.equal(Object.hasOwn(assignment, "fragments"), false);
    for (const [value, type] of [[inventory, "requirement-inventory"], [review, "semantic-coverage-proposal"], [assignment, "semantic-review-assignment"]]) {
      for (const validate of [validatePayload, validateSchemaPayload]) {
        const result = validate(value, type); assert.equal(result.valid, true, JSON.stringify(result.issues)); assert.equal(result.can_execute, false);
      }
    }
  });
  check("partition templates account for UTF-8 bytes, combining characters and whitespace without claiming extraction", () => {
    const source = "\uD55C\uAE00 \uC694\uCCAD. Cafe\u0301 \ud83d\ude42.\nDo not publish.\n";
    const request = { ...s.read(env, env.captured.artifact_ref), text: source, text_sha256: sha256(Buffer.from(source)) };
    const input = contract.templateFor(request), value = contract.buildInventory(request, env.captured.artifact_ref, input, s.optionsAt(env, 16).now);
    assert.equal(value.status, "needs_clarification"); assert.deepEqual(contract.issues(value, "requirement-inventory"), []);
    assert.equal(value.fragments.at(-1).end_byte, Buffer.byteLength(source)); assert.equal(value.fragments.map(item => item.quote).join(""), source);
  });
  for (const [name, mutate, code] of [
    ["gap", value => { value.fragments[1].start_byte++; }, "REQUIREMENT_INVENTORY_PARTITION_INVALID"],
    ["overlap", value => { value.fragments[1].start_byte--; }, "REQUIREMENT_INVENTORY_PARTITION_INVALID"],
    ["quote substitution", value => { value.fragments[0].quote = "Different source."; }, "REQUIREMENT_INVENTORY_PARTITION_INVALID"],
    ["unknown requirement", value => { value.fragments[0].requirement_ids = ["REQ-ABSENT"]; }, "REQUIREMENT_INVENTORY_SOURCE_BINDING_INVALID"],
    ["unmapped operative source", value => { value.fragments[0].requirement_ids = []; }, "REQUIREMENT_INVENTORY_PARTITION_INVALID"],
    ["duplicate source", value => { value.fragments[1].id = value.fragments[0].id; }, "REQUIREMENT_INVENTORY_DUPLICATE_ID"],
    ["invalid applicability", value => { value.requirements[0].task_ids = []; }, "REQUIREMENT_INVENTORY_APPLICABILITY_INVALID"]
  ]) check(`inventory rejects ${name}`, () => { const value = s.clone(inventory); mutate(value); expectIssue(reidentify(value, "RI"), "requirement-inventory", code); });
  check("unknown source classification cannot enter coverage or be promoted by a status field", () => {
    const input = { request_ref: env.captured.artifact_ref, ...contract.templateFor(s.read(env, env.captured.artifact_ref)) };
    const retained = retainInventory(input, s.optionsAt(env, 19)); assert.equal(retained.status, "needs_clarification");
    assert.throws(() => retainCoverage({ ...env.coverageInput, inventory_ref: retained.artifact_ref }, env.plan, s.optionsAt(env, 20)), /SEMANTIC_COVERAGE_BINDING_INVALID/);
    const value = s.read(env, retained.artifact_ref); value.status = "ready_for_review";
    expectIssue(reidentify(value, "RI"), "requirement-inventory", "REQUIREMENT_INVENTORY_REQUEST_BINDING_INVALID");
  });
  for (const disposition of ["omitted", "uncertain", "contradicted"]) check(`actual proposal admission denies retained ${disposition} coverage`, () => {
    const input = s.clone(env.coverageInput), entry = input.coverage.find(item => item.requirement_id === "REQ-3" && item.target_id === "order");
    entry.disposition = disposition;
    if (disposition !== "contradicted") { entry.pointer = ""; entry.quote = ""; }
    const retained = retainCoverage(input, env.plan, s.optionsAt(env, 20)); assert.equal(retained.status, "needs_revision");
    assert.throws(() => adoption.proposeOrder({ ...env.request, semantic_review_ref: retained.artifact_ref }, s.optionsAt(env, 21)), /SEMANTIC_REVIEW_INCOMPLETE/);
  });
  for (const [name, mutate] of [
    ["missing receiver row", value => { value.coverage.pop(); }],
    ["duplicate row", value => { value.coverage[1] = value.coverage[0]; }],
    ["global not applicable", value => { Object.assign(value.coverage.find(item => item.requirement_id === "REQ-3"), { disposition: "not_applicable", pointer: "", quote: "" }); }],
    ["unknown target", value => { value.coverage[0].target_id = "TASK-ABSENT"; }],
    ["nonexistent pointer", value => { value.coverage[0].pointer = "/unassigned/source"; }],
    ["false source quote", value => { value.coverage[0].quote = "Not present in the actual target."; }]
  ]) check(`coverage producer denies ${name}`, () => {
    const input = s.clone(env.coverageInput); mutate(input);
    assert.throws(() => retainCoverage(input, env.plan, s.optionsAt(env, 20)), /SEMANTIC_COVERAGE_BINDING_INVALID/);
  });
  check("a review cannot be reused for a changed complete plan, another scope or after expiry", () => {
    const current = store(env);
    require("./order-replay-context").withinOrderReplay(() => {
      const first = reviewProof(current, env.semanticReview.artifact_ref, env.plan, env.draft, s.optionsAt(env, 20).now);
      first.coverage.payload.coverage.pop();
      assert.equal(reviewProof(current, env.semanticReview.artifact_ref, env.plan, env.draft, s.optionsAt(env, 20).now).coverage.payload.coverage.length, review.coverage.length);
      const changed = { ...env.plan, title: "Substituted inside the same operation" };
      assert.throws(() => reviewProof(current, env.semanticReview.artifact_ref, changed, env.draft, s.optionsAt(env, 20).now), /SEMANTIC_REVIEW_INCOMPLETE/);
      assert.throws(() => reviewProof(current, env.semanticReview.artifact_ref, env.plan, env.draft, env.plan.valid_until), /SEMANTIC_REVIEW_SCOPE_MISMATCH/);
    });
    for (const mutate of [value => { value.title = "Different reviewed title"; }, value => { value.wave_id = "W2"; }]) {
      const plan = s.clone(env.plan); mutate(plan);
      assert.throws(() => reviewProof(store(env), env.semanticReview.artifact_ref, plan, env.draft, s.optionsAt(env, 20).now), /SEMANTIC_REVIEW_SCOPE_MISMATCH|SEMANTIC_REVIEW_INCOMPLETE/);
    }
    assert.throws(() => reviewProof(store(env), env.semanticReview.artifact_ref, env.plan, env.draft, env.plan.valid_until), /SEMANTIC_REVIEW_SCOPE_MISMATCH/);
  });
  check("new adoption cannot omit a review, downgrade its request or use the advisory model assessment as review", () => {
    const missing = s.clone(env.request); delete missing.semantic_review_ref;
    assert.throws(() => adoption.proposeOrder(missing, s.optionsAt(env, 20)), /ORDER_ADOPTION_INVALID/);
    const legacy = { ...missing, schema_version: "0.1" };
    assert.throws(() => adoption.proposeOrder(legacy, s.optionsAt(env, 20)), /ORDER_SEMANTIC_REVIEW_REQUIRED/);
    assert.throws(() => adoption.proposeOrder({ ...env.request, semantic_review_ref: env.captured.artifact_ref }, s.optionsAt(env, 20)), /REFERENCE_SCOPE_MISMATCH/);
  });
  check("a complete advisory assessment cannot discharge an omitted global prohibition", () => {
    const { assessResponse, targetsFor } = require("./semantic-omission-contract"), targets = targetsFor(env.draft);
    const quote = inventory.fragments[0].quote.trimEnd();
    const response = { requirements: [{ source_quote: quote, start_byte: 0, end_byte: Buffer.byteLength(quote), kind: "obligation",
      coverage: targets.map(target => { const pointer = target.id === "order" ? "/mission/statement" : "/purpose";
        return { target_id: target.id, disposition: "preserved", pointer,
          quote: require("./semantic-omission-contract").pointerValue(target.content, pointer), explanation: "Synthetic advisory omission counterexample." }; }) }],
      conflicts: [], execution_authorized: false, release_authorized: false };
    const advisory = assessResponse(response, s.read(env, env.captured.artifact_ref).text, targets);
    assert.equal(advisory.verdict, "complete"); assert.equal(advisory.calibrated_for_admission, false);
    const input = s.clone(env.coverageInput);
    for (const entry of input.coverage.filter(item => item.requirement_id === "REQ-3")) Object.assign(entry, { disposition: "omitted", pointer: "", quote: "" });
    const retained = retainCoverage(input, env.plan, s.optionsAt(env, 20));
    const request = { ...env.request, semantic_review_ref: retained.artifact_ref };
    assert.throws(() => adoption.proposeOrder(request, s.optionsAt(env, 21)), /SEMANTIC_REVIEW_INCOMPLETE/);
    assert.equal(store(env).manifest.artifacts.some(item => item.kind === "order-adoption-proposals"), false);
  });
  check("authority and semantic proof flags cannot be promoted or concealed by a fresh ID", () => {
    for (const [original, type, prefix] of [[inventory, "requirement-inventory", "RI"], [review, "semantic-coverage-proposal", "SCV"]]) {
      for (const key of ["execution_authorized", "release_authorized", "semantic_completeness_proven"]) {
        expectIssue(reidentify({ ...original, [key]: true }, prefix), type, "CONST_MISMATCH");
      }
    }
    expectIssue({ ...inventory, bypass: true }, "requirement-inventory", "ADDITIONAL_PROPERTY");
  });
  check("legacy retained adoption is readable but cannot open a new context wave", () => {
    const value = s.environment(); roots.push(value.root);
    value.request.schema_version = "0.1"; delete value.request.semantic_review_ref;
    const snapshot = () => { const current = store(value); return { revision: current.manifest.manifest_revision, sha256: manifestDigest(current.manifest) }; };
    const { proposalPayload, recordPayload } = require("./order-adoption-contract");
    const proposal = proposalPayload(value.request, value.draft, snapshot(), s.optionsAt(value, 20).now);
    value.proposed = { proposal, proposal_ref: s.persist(value, "order-adoption-proposals", proposal, 20) };
    s.retainBriefs(value); s.rehearse(value);
    const request = s.decisionRequest(value); request.decision_ref = s.persist(value, "decision-logs", s.decision(value, request));
    const record = recordPayload(request, proposal, snapshot(), s.optionsAt(value, 60).now);
    s.persist(value, "order-adoption-records", record, 60);
    assert.equal(adoption.inspectOrder({ ...s.optionsAt(value, 70), proposalId: proposal.id }).status, "adopted");
    assert.equal(adoption.inspectAdoptedOrderForPlan(value.plan, s.optionsAt(value, 70)).payload.schema_version, "0.1");
    assert.throws(() => require("./skill-mission-controller").openWave(value.plan, s.optionsAt(value, 70)), /ORDER_SEMANTIC_REVIEW_REQUIRED/);
  });
  check("adopted receiver assignments require the exact reviewed applicable requirements", () => {
    const value = setup(); s.adopt(value);
    const opened = require("./skill-mission-controller").openWave(value.plan, s.optionsAt(value, 70));
    const context = s.read(value, opened.context_packs[0].context_pack_ref);
    assert.equal(context.order_assignment.semantic_review.plan_sha256, digest(value.plan));
    for (const mutate of [item => { delete item.order_assignment.semantic_review; },
      item => { item.order_assignment.semantic_review.requirements.pop(); },
      item => { item.order_assignment.semantic_review.model_calibrated_for_admission = true; }]) {
      const changed = s.clone(context); mutate(changed);
      assert.throws(() => adoption.assertContextAssignment(changed, value.plan, s.optionsAt(value, 70)), /ORDER_CONTEXT_ASSIGNMENT_MISMATCH/);
    }
  });
  check("both skill wrappers are target-explicit, prepare-only and reject clock or model execution overrides", () => {
    for (const provider of ["codex-skills", ".claude/skills"]) {
      const wrapper = path.join(__dirname, provider, "controls-doctrine-operator/scripts/review_controls_requirements.js");
      const call = args => spawnSync(process.execPath, [wrapper, ...args], { cwd: env.root, encoding: "utf8" });
      const args = ["template", "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot, "--request-id", env.captured.artifact_ref.artifact_id];
      const result = call(args); assert.equal(result.status, 0, result.stderr);
      const template = JSON.parse(result.stdout); assert.equal(template.requirements.length, 0); assert(template.fragments.every(item => item.classification === "unknown"));
      assert.notEqual(call(["template", "--request-id", env.captured.artifact_ref.artifact_id]).status, 0);
      assert.notEqual(call([...args, "--now", s.optionsAt(env, 20).now]).status, 0);
      assert.notEqual(call(["run-model", ...args.slice(1)]).status, 0);
    }
  });
} finally { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ total: results.length, passed: results.length, failed: 0, actual_model_calls: 0, semantic_completeness_proven: false }, null, 2));
