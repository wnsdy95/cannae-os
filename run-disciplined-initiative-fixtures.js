#!/usr/bin/env node

const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const store = require("./repository-artifact-store");
const write = store.writeRepositoryArtifact;
let beforeWrite;
store.writeRepositoryArtifact = options => { if (beforeWrite) beforeWrite(options); return write(options); };
const { validatePayload } = require("./validator-cli-prototype/validate");
const gate = require("./method-deviation-gate");
const { identified, METHOD_DOCUMENT, METHOD_CHECK } = require("./method-deviation-contract");
const { assertIntentContext } = require("./intent-continuity-contract");
const { digest } = require("./order-intake-contract");
const { spawnSync } = require("node:child_process");
const { recordWave, openWave } = require("./skill-mission-controller");
const { clone, sample, optionsAt, persist, environment, start, inputs, admit, complete, acknowledge, dispatch,
  propose, brief, read, adopt } = require("./disciplined-initiative-fixtures/support");
const roots = []; let passed = 0;
const setup = (ready = true) => { const env = environment(); roots.push(env.root); return ready ? start(env) : env; };
const check = (name, callback) => { callback(); passed++; console.log(`PASS ${name}`); };
const proposeAfter = env => gate.proposeMethod(optionsAt(env, 90), { leaseId: env.leaseId, stepId: "inspect", methodId: "short_read", rationale: "Read a bounded first line within the reviewed method." });
const state = env => {
  const loaded = gate.load(env.options), entry = loaded.manifest.artifacts.find(item => item.kind === "mission-wave-plans");
  return gate.methodState(loaded, gate.read(loaded, gate.reference(entry), "mission-wave-plans", "mission-wave-plan"), env.actor.agentId);
};
const finish = (env, at = 110) => {
  assert.equal(admit(env, inputs.safeguard, "safeguard", at).decision, "allow");
  complete(env, inputs.safeguard, "safeguard", at + 1);
  assert.equal(dispatch.completeLease(optionsAt(env, at + 2), env.leaseId).status, "completed");
};

try {
  check("reviewed methods bind every exact task and cannot expand the mission boundary", () => {
    const env = setup(false);
    assert.equal(validatePayload(env.plan, "mission-wave-plan").valid, true);
    for (const [mutate, code] of [
      [value => { value.method_control.agents[0].task_sha256 = "0".repeat(64); }, "METHOD_TASK_COMMITMENT_MISMATCH"],
      [value => { value.method_control.agents.pop(); }, "METHOD_AGENT_COVERAGE"],
      [value => { value.method_control.agents[0].steps[0].mission_action = "Release externally"; }, "METHOD_ACTION_NOT_AUTONOMOUS"],
      [value => { value.method_control.agents[0].steps[0].alternatives[0].method_id = "planned"; }, "METHOD_AMBIGUOUS_ALTERNATIVE"],
      [value => { value.method_control.agents[0].steps[0].planned.instructions = " "; }, "METHOD_INSTRUCTIONS_EMPTY"],
      [value => { value.schema_version = "0.1"; delete value.order_binding; }, "METHOD_REVIEWED_DISPATCH_REQUIRED"]
    ]) { const changed = clone(env.plan); mutate(changed); assert(validatePayload(changed, "mission-wave-plan").issues.some(item => item.code === code)); }
  });
  check("individual backbriefs must acknowledge their complete method baseline", () => {
    const env = setup(false); propose(env);
    const value = brief(env, 0); delete value.method_acknowledgement;
    assert.throws(() => require("./order-adoption-controller").retainOrderEvidence(value, optionsAt(env, 30), "order-backbriefs"), /ORDER_BACKBRIEF_METHOD_MISMATCH/);
  });
  check("every receiver gets only its own usable method pocket without changing the capability query", () => {
    const env = setup();
    for (const row of env.opened.context_packs) {
      const context = read(env, row.context_pack_ref), pocket = context.method_assignment;
      assert.equal(validatePayload(context, "agent-context-pack").valid, true);
      assertIntentContext(context, env.plan);
      assert.equal(pocket.control_channel, "trusted_operator_control_plane");
      assert.deepEqual(pocket.baseline, env.plan.method_control.agents.find(item => item.agent_id === row.agent_id));
      assert.equal(pocket.baseline_sha256, digest(pocket.baseline)); assert.equal(pocket.plan_sha256, digest(env.plan));
      assert(!Object.hasOwn(pocket, "agents"));
      assert(!JSON.stringify(pocket).includes(env.plan.method_control.agents.find(item => item.agent_id !== row.agent_id).task_sha256));
      assert(pocket.baseline.steps.every(step => step.planned.instructions.includes(JSON.stringify(step.step_id === "inspect" ? inputs.planned : inputs.safeguard))));
      assert(context.documents.some(item => item.path === METHOD_DOCUMENT));
      assert(context.validation_commands.includes(METHOD_CHECK)); assert(context.required_controls.some(item => item.command === METHOD_CHECK));
      assert.equal(context.capability_query, env.plan.objective);
      const receipt = read(env, context.routing_receipt_ref);
      assert.deepEqual(context.capability_routing, receipt.capability_routing);
      for (const [name, mutate] of [
        ["missing", value => { delete value.method_assignment; }],
        ["sibling", value => { value.method_assignment.baseline = clone(env.plan.method_control.agents.find(item => item.agent_id !== row.agent_id)); }],
        ["instructions", value => { value.method_assignment.baseline.steps[0].planned.instructions = "Use a different input"; }],
        ["document", value => { value.documents = value.documents.filter(item => item.path !== METHOD_DOCUMENT); }],
        ["command", value => { value.validation_commands = value.validation_commands.filter(item => item !== METHOD_CHECK); }],
        ["control", value => { value.required_controls = value.required_controls.filter(item => item.command !== METHOD_CHECK); }],
        ["channel", value => { value.method_assignment.control_channel = "agent_shell"; }]
      ]) {
        const bad = clone(context); mutate(bad);
        assert.throws(() => assertIntentContext(bad, env.plan), /METHOD_CONTEXT_/, name);
      }
    }
  });
  check("a producer-stripped method pocket cannot reach actual policy authorization", () => {
    const env = setup(false); adopt(env);
    beforeWrite = descriptor => { if (descriptor.kind === "agent-context-packs") delete descriptor.payload.method_assignment; };
    try { env.opened = openWave(env.plan, optionsAt(env, 70)); } finally { beforeWrite = null; }
    assert.throws(() => dispatch.authorizeDispatchPolicy(optionsAt(env, 80), env.policies[0]), /METHOD_CONTEXT_ASSIGNMENT_MISMATCH/);
    assert.equal(dispatch.dispatchStatus(env.options).leases.length, 0);
  });
  check("executing the exact plan needs no deviation and preserves every safeguard", () => {
    const env = setup();
    const admitted = admit(env, inputs.planned, "planned"); assert.equal(admitted.decision, "allow");
    const result = complete(env, inputs.planned, "planned");
    const inventory = gate.load(env.options).manifest.artifacts;
    assert(inventory.findIndex(item => item.artifact_id === admitted.admission_ref.artifact_id) >
      inventory.findIndex(item => item.artifact_id === result.checkpoint_ref.artifact_id), "Inventory order is not execution order.");
    assert.throws(() => dispatch.completeLease(optionsAt(env, 105), env.leaseId), /METHOD_REQUIRED_STEP_INCOMPLETE/);
    finish(env); assert.deepEqual(state(env).completed_steps, ["inspect", "verify"]);
    assert.equal(gate.load(env.options).manifest.artifacts.filter(item => item.kind === gate.DEVIATIONS).length, 0);
  });
  check("a Green alternative requires a retained deviation but no authority expansion", () => {
    const env = setup();
    const held = admit(env, inputs.after, "missing-deviation", 85);
    assert.equal(held.decision, "deny"); assert(held.reason_codes.includes("METHOD_DEVIATION_REQUIRED"));
    const deviation = proposeAfter(env);
    assert.equal(validatePayload(deviation.event, "method-deviation-event").can_execute, false);
    assert.equal(admit(env, inputs.after, "alternative").decision, "allow"); complete(env, inputs.after, "alternative");
    assert.throws(() => dispatch.completeLease(optionsAt(env, 105), env.leaseId), /METHOD_AFTER_REPORT_REQUIRED/);
    const report = gate.reportMethod(optionsAt(env, 106), { deviationRef: deviation.artifact_ref, phase: "after" });
    assert.equal(report.report.execution_authorized, false); assert.equal(report.report.decision_ref, null);
    assert.equal(state(env).pending_reports.length, 0); finish(env);
  });
  check("concealed execution blocks the next real call and records an actual revocation", () => {
    const env = setup(), deviation = proposeAfter(env);
    admit(env, inputs.after, "concealed"); complete(env, inputs.after, "concealed");
    const denied = admit(env, inputs.safeguard, "next-call", 105);
    assert.equal(denied.decision, "deny"); assert(denied.reason_codes.includes("METHOD_DRIFT_REPORTING"));
    assert.equal(env.readCount, 1);
    const projection = dispatch.dispatchStatus(env.options); assert.equal(projection.leases[0].status, "revoked");
    assert.equal(gate.load(env.options).manifest.artifacts.filter(item => item.kind === gate.INCIDENTS).length, 1);
    assert.throws(() => dispatch.authorizeDispatchPolicy(optionsAt(env, 106), env.policies[1]), /METHOD_DRIFT_REVIEW_REQUIRED/);
    gate.reportMethod(optionsAt(env, 107), { deviationRef: deviation.artifact_ref, phase: "after" });
    assert.equal(admit(env, inputs.planned, "after-report", 108).decision, "deny");
  });
  check("skipped safeguards and policy-allowed but unplanned targets never execute", () => {
    for (const input of [inputs.safeguard, inputs.unplanned]) {
      const env = setup(), result = admit(env, input, "drift");
      assert.equal(result.decision, "deny"); assert(result.reason_codes.includes("METHOD_DRIFT_SEQUENCE_OR_SCOPE"));
      assert.equal(env.readCount, 0); assert.equal(dispatch.dispatchStatus(env.options).leases[0].status, "revoked");
    }
  });
  check("before-and-after methods hold until exact USER acknowledgment and actual result reporting", () => {
    const env = setup(), deviation = gate.proposeMethod(optionsAt(env, 90), { leaseId: env.leaseId, stepId: "inspect",
      methodId: "coordinated_read", rationale: "Coordinate the already authorized bounded read before execution." });
    const held = admit(env, inputs.before, "before-ack", 91);
    assert.equal(held.decision, "deny"); assert(held.reason_codes.includes("METHOD_BEFORE_REPORT_REQUIRED"));
    const invalid = acknowledge(env, deviation, 94, value => { value.decision_maker = "S3"; });
    assert.throws(() => gate.reportMethod(optionsAt(env, 95), { deviationRef: deviation.artifact_ref, phase: "before", decisionRef: invalid }), /METHOD_USER_ACKNOWLEDGMENT_REQUIRED/);
    const decisionRef = acknowledge(env, deviation, 96);
    gate.reportMethod(optionsAt(env, 97), { deviationRef: deviation.artifact_ref, phase: "before", decisionRef });
    assert.equal(admit(env, inputs.before, "before-admitted", 100).decision, "allow");
    complete(env, inputs.before, "before-admitted", 101);
    assert.throws(() => dispatch.completeLease(optionsAt(env, 102), env.leaseId), /METHOD_AFTER_REPORT_REQUIRED/);
    gate.reportMethod(optionsAt(env, 103), { deviationRef: deviation.artifact_ref, phase: "after" }); finish(env);
  });
  check("expired deviations cannot authorize another method but results remain reportable after expiry", () => {
    const env = setup(), deviation = proposeAfter(env);
    assert.throws(() => admit(env, inputs.after, "expired-deviation", 391), /METHOD_DEVIATION_STALE/);
    assert.equal(admit(env, inputs.after, "timely", 100).decision, "allow");
    complete(env, inputs.after, "timely", 700);
    const report = gate.reportMethod(optionsAt(env, 701), { deviationRef: deviation.artifact_ref, phase: "after" });
    assert.equal(report.report.execution_authorized, false);
    assert.equal(admit(env, inputs.safeguard, "expired-lease", 702).decision, "deny");
  });
  check("schema-valid event expiry cannot exceed the reviewed baseline even inside the lease", () => {
    const env = setup(); let captured;
    beforeWrite = descriptor => {
      if (descriptor.kind !== gate.DEVIATIONS) return;
      beforeWrite = null; captured = clone(descriptor.payload); throw new Error("Synthetic pre-publication capture");
    };
    try { assert.throws(() => proposeAfter(env), /Synthetic pre-publication capture/); }
    finally { beforeWrite = null; }
    const { id, ...body } = captured;
    const extended = identified("MethodDeviationEvent", { ...body, expires_at: optionsAt(env, 650).now });
    assert.equal(validatePayload(extended, "method-deviation-event").valid, true);
    persist(env, gate.DEVIATIONS, extended, 90);
    assert.throws(() => admit(env, inputs.after, "extended-expiry", 500), /METHOD_DEVIATION_BINDING_INVALID/);
    assert.equal(env.readCount, 0);
  });
  check("report-before cannot be substituted with after-the-fact or replayed acknowledgment", () => {
    const env = setup(), deviation = gate.proposeMethod(optionsAt(env, 90), { leaseId: env.leaseId, stepId: "inspect",
      methodId: "coordinated_read", rationale: "Explicit pre-execution coordination." });
    const decisionRef = acknowledge(env, deviation);
    gate.reportMethod(optionsAt(env, 96), { deviationRef: deviation.artifact_ref, phase: "before", decisionRef });
    assert.throws(() => gate.reportMethod(optionsAt(env, 97), { deviationRef: deviation.artifact_ref, phase: "before", decisionRef }), /METHOD_USER_ACKNOWLEDGMENT_CONSUMED/);
    admit(env, inputs.before, "started", 100); complete(env, inputs.before, "started", 101);
    assert.throws(() => gate.reportMethod(optionsAt(env, 102), { deviationRef: deviation.artifact_ref, phase: "before", decisionRef }), /METHOD_BEFORE_CHECKPOINT_CHANGED/);
  });
  check("publication-time expiry cannot retain a usable deviation", () => {
    const env = setup(), options = optionsAt(env, 90);
    beforeWrite = descriptor => { if (descriptor.kind === gate.DEVIATIONS) { beforeWrite = null; options.now = optionsAt(env, 800).now; } };
    try { assert.throws(() => gate.proposeMethod(options, { leaseId: env.leaseId, stepId: "inspect", methodId: "short_read", rationale: "Synthetic expiry race." }), /METHOD_LEASE_NOT_ACTIVE|METHOD_DEVIATION_STALE/); }
    finally { beforeWrite = null; }
    assert.equal(gate.load(env.options).manifest.artifacts.filter(item => item.kind === gate.DEVIATIONS).length, 0);
  });
  check("request fields cannot substitute caller-selected results or authority", () => {
    assert.throws(() => gate.proposeMethod({}, { leaseId: "L", stepId: "S", methodId: "M", rationale: "x", release_authorized: true }), /METHOD_REQUEST_FIELD_FORBIDDEN/);
    assert.throws(() => gate.reportMethod({}, { deviationRef: {}, phase: "after", result_sha256: "0".repeat(64) }), /METHOD_REQUEST_FIELD_FORBIDDEN/);
  });
  check("an unreported second admission cannot be repaired retroactively with a late report", () => {
    const env = setup(), deviation = proposeAfter(env);
    const admitted = admit(env, inputs.after, "first"); const completion = complete(env, inputs.after, "first");
    const forged = { ...clone(admitted.admission_event), id: "TAE-SYNTHETIC-LATE-REPORT", tool_use_id: "forged-next", sequence: 2,
      tool_input_sha256: dispatch.inputDigest(inputs.safeguard), checkpoint_ref: completion.checkpoint_ref,
      state_before: completion.checkpoint.repository_state, decided_at: optionsAt(env, 104).now,
      method_binding: { baseline_sha256: digest(env.plan.method_control.agents[0]), step_id: "verify", method_id: "planned", deviation_ref: null } };
    assert.equal(validatePayload(forged, "tool-admission-event").valid, true);
    persist(env, "tool-admission-events", forged, 104);
    assert.throws(() => gate.reportMethod(optionsAt(env, 105), { deviationRef: deviation.artifact_ref, phase: "after" }), /METHOD_ADMISSION_REPORTING_DRIFT/);
  });
  check("schema-valid reporting metadata cannot replace the actual result checkpoint", () => {
    const env = setup(), deviation = proposeAfter(env);
    const admission = admit(env, inputs.after, "actual"), result = complete(env, inputs.after, "actual");
    const forged = identified("InitiativeDeviationReport", { mission_id: env.plan.mission_id, wave_id: env.plan.wave_id,
      agent_id: env.actor.agentId, deviation_ref: deviation.artifact_ref, phase: "after", decision_ref: null,
      admission_ref: admission.admission_ref, result_checkpoint_ref: result.checkpoint_ref, result_sha256: "0".repeat(64),
      sitrep_ref: env.adopted.record_ref, recorded_at: optionsAt(env, 104).now });
    assert.equal(validatePayload(forged, "initiative-deviation-report").valid, true);
    persist(env, gate.REPORTS, forged, 104);
    assert.throws(() => state(env), /METHOD_REPORT_RESULT_MISMATCH/);
    assert.throws(() => dispatch.completeLease(optionsAt(env, 105), env.leaseId), /METHOD_REPORT_RESULT_MISMATCH/);
  });
  check("failed execution reporting never clears unknown effects or grants success", () => {
    const env = setup(), deviation = proposeAfter(env);
    admit(env, inputs.after, "failed"); complete(env, inputs.after, "failed", 101, true);
    const reported = gate.reportMethod(optionsAt(env, 105), { deviationRef: deviation.artifact_ref, phase: "after" });
    assert.equal(reported.report.execution_authorized, false);
    const projection = dispatch.dispatchStatus(env.options);
    assert.equal(projection.leases[0].status, "blocked"); assert.equal(projection.leases[0].unresolved_tool_effects, 1);
    assert.equal(admit(env, inputs.safeguard, "after-failure", 106).decision, "deny");
  });
  check("method control records cannot become work evidence through kind, copy or MIME changes", () => {
    const env = setup(), deviation = proposeAfter(env);
    admit(env, inputs.after, "metadata-result"); complete(env, inputs.after, "metadata-result");
    const reported = gate.reportMethod(optionsAt(env, 105), { deviationRef: deviation.artifact_ref, phase: "after" });
    const evidenceRefs = [deviation.artifact_ref, reported.artifact_ref, reported.sitrep_ref];
    for (const [index, payload] of [deviation.event, reported.report, read(env, reported.sitrep_ref)].entries()) {
      for (const extension of ["txt", "bin"]) {
        const file = path.join(env.root, `reformatted-${index}.${extension}`);
        fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(payload).reverse())));
        const artifactId = `DATA-METHOD-COPY-${index}-${extension}`;
        const copied = store.writeRepositoryFileArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
          missionId: env.plan.mission_id, waveId: env.plan.wave_id, kind: "deliverables", artifactId, sourcePath: file,
          createdAt: optionsAt(env, 106).now });
        evidenceRefs.push({ artifact_id: artifactId, relative_path: copied.relative_path, sha256: copied.sha256 });
      }
    }
    const reportFor = evidenceRef => {
      const report = { ...sample("mission-wave-report"), id: "MWR-METHOD-METADATA", mission_id: env.plan.mission_id, wave_id: env.plan.wave_id,
        plan_ref: env.opened.plan_ref, routing_preflight_ref: env.opened.routing_preflight_ref, recorded_at: optionsAt(env, 130).now,
        agent_results: env.opened.context_packs.map(item => ({ ...sample("mission-wave-report").agent_results[0],
          agent_id: item.agent_id, context_pack_ref: item.context_pack_ref, evidence_refs: [evidenceRef] })) };
      return report;
    };
    for (const evidenceRef of evidenceRefs) assert.throws(() => recordWave(reportFor(evidenceRef), optionsAt(env, 130)), /control metadata as execution evidence/);
    const workFile = path.join(env.root, "ordinary-work.txt"); fs.writeFileSync(workFile, "Synthetic task output, not a control record.\n");
    const work = store.writeRepositoryFileArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
      missionId: env.plan.mission_id, waveId: env.plan.wave_id, kind: "deliverables", artifactId: "DATA-REAL-WORK", sourcePath: workFile,
      createdAt: optionsAt(env, 106).now });
    assert.throws(() => recordWave(reportFor({ artifact_id: "DATA-REAL-WORK", relative_path: work.relative_path, sha256: work.sha256 }), optionsAt(env, 130)),
      /METHOD_WAVE_NOT_COMPLETE/, "Ordinary work must reach the independent completion gate.");
  });
  check("drift-denial publication reappraises a concurrently completed report", () => {
    const env = setup(), deviation = proposeAfter(env); admit(env, inputs.after, "race"); complete(env, inputs.after, "race");
    beforeWrite = descriptor => {
      if (descriptor.kind !== "tool-admission-events") return;
      beforeWrite = null;
      gate.reportMethod(optionsAt(env, 104), { deviationRef: deviation.artifact_ref, phase: "after" });
    };
    try { assert.throws(() => admit(env, inputs.safeguard, "report-race", 105), /METHOD_PUBLICATION_CHANGED/); }
    finally { beforeWrite = null; }
    assert.equal(gate.driftDenials(gate.load(env.options), env.plan.mission_id).length, 0);
    finish(env, 110);
  });
  check("completion publication cannot cross a newly retained mission drift fence", () => {
    const env = setup(), first = admit(env, inputs.planned, "first"); complete(env, inputs.planned, "first");
    admit(env, inputs.safeguard, "second", 110); complete(env, inputs.safeguard, "second", 111);
    beforeWrite = descriptor => {
      if (descriptor.kind !== "agent-execution-checkpoints" || descriptor.payload.checkpoint_kind !== "completion") return;
      beforeWrite = null;
      persist(env, "tool-admission-events", { ...clone(first.admission_event), id: "TAE-SYNTHETIC-COMPLETION-RACE",
        decision: "deny", reason_codes: ["METHOD_DRIFT_SEQUENCE_OR_SCOPE"], decided_at: optionsAt(env, 112).now }, 112);
    };
    try { assert.throws(() => dispatch.completeLease(optionsAt(env, 113), env.leaseId), /METHOD_DRIFT_REVIEW_REQUIRED/); }
    finally { beforeWrite = null; }
    assert.notEqual(dispatch.dispatchStatus(env.options).leases[0].status, "completed");
  });
  check("interrupted after-report publication reuses its exact SITREP without rerunning the tool", () => {
    const env = setup(), deviation = proposeAfter(env);
    admit(env, inputs.after, "observed"); complete(env, inputs.after, "observed");
    beforeWrite = descriptor => { if (descriptor.kind === gate.REPORTS) { beforeWrite = null; throw new Error("Synthetic report publication interruption"); } };
    try { assert.throws(() => gate.reportMethod(optionsAt(env, 105), { deviationRef: deviation.artifact_ref, phase: "after" }), /Synthetic report publication interruption/); }
    finally { beforeWrite = null; }
    const prior = gate.load(env.options).manifest.artifacts.filter(item => item.kind === "sitreps"); assert.equal(prior.length, 1);
    const report = gate.reportMethod(optionsAt(env, 106), { deviationRef: deviation.artifact_ref, phase: "after" });
    assert.equal(report.sitrep_ref.sha256, prior[0].sha256); assert.equal(env.readCount, 1); finish(env);
  });
  check("interrupted response publication reuses actual revocation rather than issuing another one", () => {
    const env = setup();
    beforeWrite = descriptor => { if (descriptor.kind === gate.INCIDENTS) { beforeWrite = null; throw new Error("Synthetic response publication interruption"); } };
    try { assert.throws(() => admit(env, inputs.unplanned, "response-crash"), /Synthetic response publication interruption/); }
    finally { beforeWrite = null; }
    let current = gate.load(env.options); const denial = gate.driftDenials(current, env.plan.mission_id)[0];
    const checkpoints = current.manifest.artifacts.filter(item => item.kind === "agent-execution-checkpoints");
    const result = gate.respondToDrift(optionsAt(env, 106), denial.ref);
    assert.equal(result.payload.response_status, "revoked"); assert.equal(env.readCount, 0);
    current = gate.load(env.options); assert.equal(current.manifest.artifacts.filter(item => item.kind === "agent-execution-checkpoints").length, checkpoints.length);
    assert.equal(gate.respondToDrift(optionsAt(env, 107), denial.ref).ref.sha256, result.ref.sha256);
  });
  check("operation clock rollback cannot publish a future-dated deviation", () => {
    const env = setup(), options = optionsAt(env, 90);
    beforeWrite = descriptor => { if (descriptor.kind === gate.DEVIATIONS) { beforeWrite = null; options.now = optionsAt(env, 89).now; } };
    try { assert.throws(() => gate.proposeMethod(options, { leaseId: env.leaseId, stepId: "inspect", methodId: "short_read", rationale: "Synthetic rollback race." }), /METHOD_CLOCK_ROLLBACK/); }
    finally { beforeWrite = null; }
  });
  check("both provider wrappers query retained state outside the checkout without clock overrides", () => {
    const env = setup();
    for (const directory of ["codex-skills", ".claude/skills"]) {
      const wrapper = path.join(__dirname, directory, "controls-doctrine-operator/scripts/operate_controls_methods.js");
      const args = [wrapper, "status", "--repository", env.options.repository, "--artifact-root", env.options.artifactRoot,
        "--mission", env.plan.mission_id, "--wave", env.plan.wave_id];
      const result = spawnSync(process.execPath, args, { cwd: env.root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr); const value = JSON.parse(result.stdout);
      assert.equal(value.configured, true); assert.equal(value.execution_authorized, false); assert.equal(value.release_authorized, false);
      assert.notEqual(spawnSync(process.execPath, [...args, "--at", optionsAt(env, 90).now], { cwd: env.root }).status, 0);
    }
  });
  console.log(JSON.stringify({ total: passed, passed, failed: 0 }, null, 2));
} finally {
  beforeWrite = null;
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}
