#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const s = require("./bounded-planning-fixtures/support"), { generatePlan } = require("./bounded-planning-controller");
const { openWave, recordWave } = require("./skill-mission-controller"), store = require("./repository-artifact-store");
const { isNonWorkPayload, NON_WORK_TYPES } = require("./semantic-control-types");
const env = s.environment(Date.now() - 120000); let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
try {
  const operation = generatePlan(s.requestFor(env), s.optionsAt(env, 12)), plan = s.sample("mission-wave-plan");
  Object.assign(plan, { id: "MWP-PLANNING-METADATA", mission_id: "MIS-PLANNING-METADATA", objective: "Inspect the local note.", title: "Synthetic metadata boundary",
    created_at: s.optionsAt(env, 0).now, valid_until: s.optionsAt(env, 3600).now, success_conditions: ["The note has a retained summary."],
    failure_conditions: ["The note is modified."], constraints: ["Read only the local note; do not publish."] }); plan.adaptive_work.enabled = false;
  plan.agents = [{ ...plan.agents[0], task: "Summarize the local note.", allowed_actions: ["Inspect the local note."],
    approval_required: ["Any mutation or scope change."], prohibited_actions: ["Self-approval.", "External release."] }];
  const opened = openWave(plan, s.optionsAt(env, 70));
  function file(id, payload, extension) {
    const sourcePath = path.join(env.root, `${id}.${extension}`); fs.writeFileSync(sourcePath, JSON.stringify(payload));
    const saved = store.writeRepositoryFileArtifact({ repositoryPath: env.options.repository, artifactRoot: env.options.artifactRoot,
      missionId: plan.mission_id, waveId: plan.wave_id, kind: "deliverables", artifactId: id, sourcePath, createdAt: s.optionsAt(env, 80).now });
    return { artifact_id: id, relative_path: saved.relative_path, sha256: saved.sha256 };
  }
  function report(id, evidence) {
    return { ...s.sample("mission-wave-report"), id, mission_id: plan.mission_id, wave_id: plan.wave_id, plan_ref: opened.plan_ref,
      routing_preflight_ref: opened.routing_preflight_ref, recorded_at: s.optionsAt(env, 90).now,
      agent_results: [{ ...s.sample("mission-wave-report").agent_results[0], agent_id: plan.agents[0].agent_id,
        context_pack_ref: opened.context_packs[0].context_pack_ref, evidence_refs: [evidence] }] };
  }
  const { type, action, ...legacy } = operation;
  const packets = { current: operation, legacy, array: [legacy], nested: { observation: "Not independent work.", response: legacy },
    plan: { response: operation.plan }, semantic: { responses: [s.sample("operator-semantic-evaluation")] } };
  for (const [name, payload] of Object.entries(packets)) check(`${name} planning/semantic packet is rejected by the real report consumer across MIME/key-order aliases`, () => {
    for (const extension of ["txt", "bin", "json"]) {
      const value = Array.isArray(payload) ? payload : Object.fromEntries(Object.entries(payload).reverse());
      const reference = file(`DATA-${name}-${extension}`, value, extension);
      assert.throws(() => recordWave(report(`MWR-${name}-${extension}`, reference), s.optionsAt(env, 90)), /control metadata as execution evidence/);
    }
  });
  check("nested semantic control types remain non-work even without a retained counterpart", () => {
    for (const type of NON_WORK_TYPES) assert.equal(isNonWorkPayload({ data: [{ payload: { type } }] }), true, type);
    const cycle = {}; cycle.self = cycle; assert.equal(isNonWorkPayload(cycle), false);
  });
  check("ordinary independently authored facts may cite planning references without becoming a control packet", () => {
    const payload = { source_line: fs.readFileSync(path.join(env.options.repository, "README.md"), "utf8"),
      summary: "The supplied local note is explicitly synthetic.", references: [operation.proposal_ref] };
    assert.equal(isNonWorkPayload(payload), false);
    const result = recordWave(report("MWR-ACTUAL-NOTE", file("DATA-ACTUAL-NOTE", payload, "json")), s.optionsAt(env, 90));
    assert.equal(result.status, "complete"); assert.equal(result.release_authorized, false);
  });
  console.log(JSON.stringify({ passed, failed: 0, actual_model_invocations: 0, real_owner_actions: 0, execution_authorized: false, release_authorized: false }, null, 2));
} finally { fs.rmSync(env.root, { recursive: true, force: true }); }
