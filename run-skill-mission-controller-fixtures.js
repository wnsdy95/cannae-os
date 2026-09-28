#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyzeRoutingPreflight } = require("./agent-routing-preflight-runner");
const {
  closeWave,
  executeValidationControl,
  missionStatus,
  openWave,
  recordWave,
  reportInputDigest,
  sameRef,
  terminateWave,
  terminationDecisionOption
} = require("./skill-mission-controller");
const {
  resolveRepository,
  verifyRepositoryArtifacts,
  writeRepositoryArtifact,
  writeRepositoryFileArtifact
} = require("./repository-artifact-store");
const { validatePayload } = require("./validator-cli-prototype/validate");
const {
  authorizeDispatchPolicy,
  admitToolRequest,
  cancelToolRequest,
  interruptLease,
  revokeLease,
  resumeLease,
  completeLease,
  inputDigest,
  issueLease,
  withDispatchIssuanceLock
} = require("./dispatch-runtime-controller");

const ROOT = __dirname;
const FIXED_OPEN_TIME = "2026-07-23T04:30:00+09:00";
const FIXED_REPORT_TIME = "2026-07-23T05:10:00+09:00";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function runGit(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "git failed").trim());
  return result.stdout.trim();
}

function initRepository(parent, group) {
  const repository = path.join(parent, group, "target");
  fs.mkdirSync(repository, { recursive: true });
  runGit(repository, ["init", "-q"]);
  runGit(repository, ["config", "user.email", "fixtures@example.com"]);
  runGit(repository, ["config", "user.name", "Fixture Runner"]);
  fs.writeFileSync(path.join(repository, "README.md"), `${group}\n`);
  runGit(repository, ["add", "README.md"]);
  runGit(repository, ["commit", "-qm", "initial fixture state"]);
  return repository;
}

function expectThrow(fn, pattern, label) {
  let error = null;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert(error, `${label}: expected an error`);
  if (pattern) assert(pattern.test(error.message), `${label}: unexpected error: ${error.message}`);
}

function loadArtifact(artifactRoot, ref) {
  return JSON.parse(fs.readFileSync(path.join(artifactRoot, ref.relative_path), "utf8"));
}

function evidence(
  repository,
  artifactRoot,
  plan,
  artifactId,
  payload,
  createdAt = "2026-07-23T04:50:00+09:00"
) {
  const result = writeRepositoryArtifact({
    repositoryPath: repository,
    artifactRoot,
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    kind: "deliverables",
    artifactId,
    payload,
    createdAt
  });
  return { artifact_id: artifactId, relative_path: result.relative_path, sha256: result.sha256 };
}

function completeReport(plan, opened, evidenceRefs, overrides = {}) {
  const context = new Map(opened.context_packs.map(item => [item.agent_id, item.context_pack_ref]));
  const results = plan.agents.map((agent, index) => ({
    agent_id: agent.agent_id,
    context_pack_ref: context.get(agent.agent_id),
    status: "complete",
    summary: `${agent.agent_id} completed the assigned task.`,
    completed_actions: ["Completed the scoped task."],
    blockers: [],
    evidence_refs: [evidenceRefs[index]],
    improvement_candidates: index === 0 ? ["Reduce repeated mission setup."] : [],
    next_actions: ["Conduct the wave AAR."]
  }));
  return {
    schema_version: "0.1",
    type: "MissionWaveReport",
    id: `MWR-${plan.mission_id.replace(/^MIS-/, "")}-${plan.wave_id}`,
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    plan_ref: opened.plan_ref,
    routing_preflight_ref: opened.routing_preflight_ref,
    agent_results: results,
    wave_status: "complete",
    human_decisions_required: [],
    release_requested: false,
    recorded_at: "2026-07-23T05:00:00+09:00",
    ...overrides
  };
}

function wavePlan(base, waveId) {
  const plan = clone(base);
  plan.wave_id = waveId;
  plan.id = `MWP-SKILL-DEMO-${waveId}`;
  return plan;
}

function dispatchDraft(plan, agent, policyId) {
  const toolInput = { command: "true" };
  return {
    schema_version: "0.1",
    type: "DispatchToolPolicy",
    id: policyId,
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    agent_id: agent.agent_id,
    provider: "codex",
    default_decision: "deny",
    tool_rules: [{
      rule_id: `DTR-${agent.agent_id}`,
      mission_action: agent.allowed_actions[0],
      tool_name: "Bash",
      operation_class: "process_execute",
      input_match: {
        mode: "exact_sha256",
        allowed_sha256: [inputDigest(toolInput)]
      },
      max_uses: 1
    }],
    max_total_admissions: 1,
    lease_ttl_seconds: 3600,
    repository_state: {
      require_head_match: true,
      require_serial_state_chain: true,
      require_clean_start: true
    },
    authority: {
      human_final_decision_authority: "USER",
      self_approval_prohibited: true,
      release_authorized: false
    },
    approved_at: plan.created_at,
    valid_until: plan.valid_until
  };
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-skill-mission-fixtures-"));
const artifactRoot = path.join(temporaryRoot, "artifacts");
const repositoryA = initRepository(temporaryRoot, "alpha");
const repositoryB = initRepository(temporaryRoot, "bravo");
const repositoryC = initRepository(temporaryRoot, "charlie");
const repositoryGap = initRepository(temporaryRoot, "capability-gap");
const basePlan = readJson("sample-payloads/valid-mission-wave-plan.json");
const fixtures = [];

function fixture(name, fn) {
  fixtures.push({ name, fn });
}

let opened;
let report;

fixture("valid mission wave plan passes schema and semantic validation", () => {
  assert(validatePayload(basePlan, "mission-wave-plan").valid, "valid plan should pass");
});

fixture("dispatch control permits exactly one policy authorization per mission agent", () => {
  const plan = clone(basePlan);
  const first = dispatchDraft(plan, plan.agents[0], "DTP-DUPLICATE-A");
  const second = dispatchDraft(plan, plan.agents[0], "DTP-DUPLICATE-B");
  const verification = dispatchDraft(plan, plan.agents[1], "DTP-VERIFICATION");
  plan.dispatch_control = {
    required: true,
    enforcement_level: "guardrail",
    gateway_exclusive: false,
    policy_authorizations: [first, second, verification].map(draft => ({
      agent_id: draft.agent_id,
      provider: draft.provider,
      policy_id: draft.id,
      draft_sha256: inputDigest(draft)
    }))
  };
  const result = validatePayload(plan, "mission-wave-plan");
  assert(!result.valid, "multiple policies for one mission agent should fail");
  assert(result.issues.some(item => item.code === "MISSION_WAVE_MULTIPLE_DISPATCH_POLICIES"),
    "multiple-policy failure code is missing");
});

fixture("AI final decision authority is rejected before artifact creation", () => {
  const invalid = readJson("sample-payloads/invalid-mission-wave-plan-ai-final-authority.json");
  assert(!validatePayload(invalid, "mission-wave-plan").valid, "unsafe plan should fail validation");
  expectThrow(() => openWave(invalid, {
    repository: repositoryA,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  }), /failed validation/, "AI authority rejection");
});

fixture("open creates one CoS receipt and one S3 receipt per expected agent", () => {
  opened = openWave(basePlan, {
    repository: repositoryA,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  });
  assert(opened.status === "ready" && opened.context_dispatch_authorized === true, "wave context should be ready");
  assert(opened.dispatch_authorized === false && opened.tool_execution_authorized === false,
    "mission open must not authorize tool execution");
  assert(opened.release_authorized === false, "open must not authorize release");
  const bundle = loadArtifact(artifactRoot, opened.routing_bundle_ref);
  assert(bundle.receipts.filter(item => item.wave_scope === "wave").length === 1, "expected one wave receipt");
  assert(bundle.receipts.filter(item => item.wave_scope === "agent").length === basePlan.agents.length, "expected every agent receipt");
  assert(bundle.receipts.filter(item => item.wave_scope === "agent").every(item => item.agent_role === "S3" && item.department === "operations"), "agent receipts must use the mandatory control-plane route");
});

fixture("removing one generated receipt blocks routing preflight", () => {
  const bundle = loadArtifact(artifactRoot, opened.routing_bundle_ref);
  bundle.receipts = bundle.receipts.filter(item => item.agent_id !== basePlan.agents[0].agent_id);
  const projection = analyzeRoutingPreflight(bundle);
  assert(projection.status === "blocked", "missing receipt must block");
  assert(projection.preflight_blocks.some(item => item.includes(basePlan.agents[0].agent_id)), "block should name missing agent");
});

fixture("context packs bind exact doctrine bytes, role, authority, and no release", () => {
  assert(opened.context_packs.length === basePlan.agents.length, "expected one context pack per agent");
  for (const item of opened.context_packs) {
    const pack = loadArtifact(artifactRoot, item.context_pack_ref);
    assert(validatePayload(pack, "agent-context-pack").valid, "generated context pack should validate");
    assert(pack.documents.some(document => document.path === "README.md"), "context pack should include README");
    assert(pack.documents.some(document => document.path === "docs/source-map.md"), "context pack should include source map");
    assert(pack.documents.every(document => /^[a-f0-9]{64}$/.test(document.sha256)), "documents must be digest-bound");
    assert(pack.authority.release_authorized === false && pack.authority.human_final_decision_authority === "USER", "context authority drifted");
  }
});

fixture("unmatched mission capability creates one bounded cell across every agent context", () => {
  const plan = wavePlan(basePlan, "WGAP");
  plan.id = "MWP-CAPABILITY-GAP-WGAP";
  plan.mission_id = "MIS-CAPABILITY-GAP";
  plan.title = "Analyze an uncovered commercial capability";
  plan.objective = "Analyze ICP and rank sales targets from the canonical track view.";
  plan.adaptive_work.campaign_id = "SIC-CAPABILITY-GAP";
  const result = openWave(plan, {
    repository: repositoryGap,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  });
  assert(result.status === "ready", "capability-gap wave should remain operable through a provisional cell");
  const bundle = loadArtifact(artifactRoot, result.routing_bundle_ref);
  const organizationIds = new Set(bundle.receipts.map(receipt =>
    receipt.capability_routing.provisional_organization.organization_id));
  const departmentIds = new Set(bundle.receipts.map(receipt =>
    receipt.capability_routing.force_structure_review.candidate_department_id));
  assert(bundle.receipts.every(receipt => receipt.capability_query === plan.objective),
    "every receipt must bind the exact mission capability query");
  assert(bundle.receipts.every(receipt => receipt.capability_routing.status === "gap_detected"),
    "every receipt must retain the mission-level capability gap");
  assert(organizationIds.size === 1 && !organizationIds.has("none"),
    "wave and agents must share one provisional capability cell");
  assert(departmentIds.size === 1 && !departmentIds.has("none"),
    "wave and agents must share one standing-department candidate");
  assert(bundle.receipts.every(receipt =>
    receipt.matched_routes.some(route => route.id === "force-structure") &&
    receipt.validation_commands.includes("node run-force-structure-change-fixtures.js")),
  "every capability-gap receipt must carry the force-structure route and control");

  for (const item of result.context_packs) {
    const context = loadArtifact(artifactRoot, item.context_pack_ref);
    assert(validatePayload(context, "agent-context-pack").valid,
      "capability-gap context pack should validate");
    assert(context.schema_version === "0.2" && context.capability_query === plan.objective,
      "context pack must retain the v0.2 mission capability contract");
    assert(context.capability_routing.provisional_organization.organization_id === [...organizationIds][0],
      "context pack changed the provisional organization");
    assert(context.documents.some(document => document.path === "docs/force-structure-change-policy.md"),
      "context pack must carry force-structure doctrine");
    assert(context.required_controls.some(control =>
      control.command === "node run-force-structure-change-fixtures.js"),
    "context pack must compile force-structure validation as a mandatory control");
    assert(context.capability_routing.provisional_organization.authority_expansion_authorized === false &&
      context.capability_routing.provisional_organization.standing_department_activation_authorized === false,
    "provisional organization must not expand authority or self-activate a standing department");
  }
});

fixture("adaptive campaign is limited to the plan target type", () => {
  const campaign = loadArtifact(artifactRoot, opened.campaign_ref);
  assert(campaign.authority_envelope.autonomous_target_types.length === 1, "campaign should not authorize unrelated target types");
  assert(campaign.authority_envelope.autonomous_target_types[0] === "skill", "campaign target should be skill");
  assert(campaign.authority_envelope.commit_requires_human === true, "campaign must retain commit approval");
});

fixture("opening the same wave is idempotent", () => {
  const before = opened.artifact_store.manifest_revision;
  const repeated = openWave(basePlan, {
    repository: repositoryA,
    artifactRoot,
    doctrineRoot: ROOT,
    now: "2026-07-23T04:31:00+09:00"
  });
  assert(repeated.artifact_store.manifest_revision === before, "idempotent open changed manifest revision");
  assert(repeated.context_packs.every((item, index) => sameRef(item.context_pack_ref, opened.context_packs[index].context_pack_ref)), "idempotent open changed context refs");
});

fixture("duplicate agents and expired plans fail closed", () => {
  const duplicate = clone(basePlan);
  duplicate.agents.push(clone(duplicate.agents[0]));
  expectThrow(() => openWave(duplicate, {
    repository: repositoryA,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  }), /MISSION_WAVE_DUPLICATE_AGENT/, "duplicate agent rejection");
  expectThrow(() => openWave(basePlan, {
    repository: repositoryA,
    artifactRoot,
    doctrineRoot: ROOT,
    now: "2028-07-23T04:30:00+09:00"
  }), /expired/, "expired plan rejection");
  const overclassified = wavePlan(basePlan, "WCLASS");
  overclassified.mission_profile.classification = "public";
  expectThrow(() => openWave(overclassified, {
    repository: repositoryA,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  }), /MISSION_WAVE_CONTEXT_EXCEEDS_MISSION/, "overclassified context rejection");
});

fixture("required model assignment cannot use a missing preflight", () => {
  const invalid = wavePlan(basePlan, "WMODEL");
  invalid.model_assignment.required = true;
  invalid.agents.forEach(agent => { agent.model_billet_id = `BILLET-${agent.agent_id}`; });
  expectThrow(() => openWave(invalid, {
    repository: repositoryA,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  }), /MISSION_WAVE_MODEL_PREFLIGHT_REQUIRED/, "model preflight rejection");
});

fixture("ready integrated model preflight binds each context pack to its billet", () => {
  const plan = wavePlan(basePlan, "WMODELREADY");
  plan.model_assignment.required = true;
  plan.agents.forEach(agent => { agent.model_billet_id = `BILLET-${agent.agent_id}`; });
  const preflightId = "IMP-SKILL-WMODELREADY";
  const projection = {
    schema_version: "0.2",
    type: "IntegratedMissionPreflightProjection",
    bundle_id: preflightId,
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    status: "ready",
    routing_status: "ready",
    model_assignment_status: "ready",
    registry_version: "registry-fixture-1",
    compiled_plan_id: "MFA-SKILL-WMODELREADY",
    dispatch_manifest: plan.agents.map((agent, index) => ({
      agent_id: agent.agent_id,
      billet_id: agent.model_billet_id,
      model_profile_id: `MP-${index + 1}`,
      model_family: index === 0 ? "family-a" : "family-b",
      model_version: `model-${index + 1}@fixture`,
      harness_version: "harness@fixture"
    })),
    usage_event_templates: [],
    preflight_blocks: [],
    warnings: [],
    commander_queue: []
  };
  const persisted = writeRepositoryArtifact({
    repositoryPath: repositoryA,
    artifactRoot,
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    kind: "integrated-mission-preflights",
    artifactId: preflightId,
    payload: projection
  });
  plan.model_assignment.integrated_preflight_ref = {
    artifact_id: preflightId,
    relative_path: persisted.relative_path,
    sha256: persisted.sha256
  };
  const result = openWave(plan, {
    repository: repositoryA,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  });
  assert(result.status === "ready", "model-bound wave should open");
  for (const contextRef of result.context_packs) {
    const context = loadArtifact(artifactRoot, contextRef.context_pack_ref);
    assert(context.model_assignment.required === true, "model binding should be required");
    assert(context.model_assignment.billet_id === plan.agents.find(agent => agent.agent_id === context.agent_id).model_billet_id, "wrong model billet binding");
    assert(context.model_assignment.model_version !== "not_required", "model identity should be projected");
  }
});

fixture("an unadmitted preinserted control receipt cannot satisfy report admission", () => {
  const plan = wavePlan(basePlan, "WFORGED");
  plan.id = "MWP-SKILL-FORGED-RECEIPT";
  const forgedOpen = openWave(plan, {
    repository: repositoryB,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  });
  const evidenceRefs = plan.agents.map((agent, index) => evidence(
    repositoryB,
    artifactRoot,
    plan,
    `OUT-FORGED-RECEIPT-${index + 1}`,
    { agent_id: agent.agent_id, result: "verified" }
  ));
  const candidate = completeReport(plan, forgedOpen, evidenceRefs);
  const contextByAgent = new Map(forgedOpen.context_packs.map(item => [
    item.agent_id,
    { ref: item.context_pack_ref, payload: loadArtifact(artifactRoot, item.context_pack_ref) }
  ]));
  const controls = new Map();
  for (const result of candidate.agent_results) {
    const context = contextByAgent.get(result.agent_id);
    for (const control of context.payload.required_controls) {
      if (!controls.has(control.command_sha256)) controls.set(control.command_sha256, { control, agentBindings: [] });
      controls.get(control.command_sha256).agentBindings.push({
        agent_id: result.agent_id,
        context_pack_ref: context.ref
      });
    }
  }
  const first = [...controls.values()].sort((left, right) =>
    left.control.command_sha256.localeCompare(right.control.command_sha256))[0];
  first.agentBindings.sort((left, right) => left.agent_id.localeCompare(right.agent_id));
  const reportDigest = reportInputDigest(candidate);
  const receiptId = `CER-${candidate.id}-${reportDigest.slice(0, 12)}-${first.control.command_sha256.slice(0, 16)}`;
  const receipt = executeValidationControl(first.control, first.agentBindings, {
    doctrineRoot: ROOT,
    repository: repositoryB,
    now: FIXED_REPORT_TIME,
    receiptId,
    missionId: candidate.mission_id,
    waveId: candidate.wave_id,
    reportId: candidate.id,
    reportInputSha256: reportDigest
  });
  assert(receipt.status === "passed", "preinsert fixture control did not produce a passing receipt");
  writeRepositoryArtifact({
    repositoryPath: repositoryB,
    artifactRoot,
    missionId: candidate.mission_id,
    waveId: candidate.wave_id,
    kind: "control-execution-receipts",
    artifactId: receipt.id,
    payload: receipt,
    createdAt: receipt.finished_at
  });
  expectThrow(
    () => recordWave(candidate, { repository: repositoryB, artifactRoot, doctrineRoot: ROOT, now: FIXED_REPORT_TIME }),
    /not referenced by an admitted report/,
    "unadmitted receipt preinsertion"
  );
});

fixture("manifest-backed agent evidence produces a complete wave report", () => {
  const evidenceRefs = basePlan.agents.map((agent, index) => evidence(
    repositoryA,
    artifactRoot,
    basePlan,
    `OUT-SKILL-${index + 1}`,
    { agent_id: agent.agent_id, result: "verified" }
  ));
  const markdownPath = path.join(temporaryRoot, "plans-agent-result.md");
  fs.writeFileSync(markdownPath, "# Verified result\n\nThe scoped skill change passed its assigned checks.\n");
  const markdownEvidence = writeRepositoryFileArtifact({
    repositoryPath: repositoryA,
    artifactRoot,
    missionId: basePlan.mission_id,
    waveId: basePlan.wave_id,
    kind: "deliverables",
    artifactId: "OUT-SKILL-MARKDOWN",
    sourcePath: markdownPath,
    contentType: "text/markdown",
    createdAt: "2026-07-23T04:50:00+09:00"
  });
  evidenceRefs[0] = {
    artifact_id: "OUT-SKILL-MARKDOWN",
    relative_path: markdownEvidence.relative_path,
    sha256: markdownEvidence.sha256
  };
  report = completeReport(basePlan, opened, evidenceRefs);
  const result = recordWave(report, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME });
  assert(result.status === "complete" && result.continuation_authorized === true, "complete report should permit closeout");
  assert(result.release_authorized === false, "report must not authorize release");
  const expectedReportDigest = reportInputDigest(report);
  assert(result.control_receipt_refs.length > 0, "complete report did not persist mandatory control receipts");
  for (const receiptRef of result.control_receipt_refs) {
    const receipt = loadArtifact(artifactRoot, receiptRef);
    assert(receipt.schema_version === "0.2", "mission lifecycle persisted a legacy control receipt");
    assert(receipt.report_input_sha256 === expectedReportDigest, "control receipt did not bind the exact report input");
    assert(receipt.id === `CER-${report.id}-${expectedReportDigest.slice(0, 12)}-${receipt.control.command_sha256.slice(0, 16)}`,
      "control receipt ID did not derive from report and command digests");
  }
  const repeated = recordWave(report, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME });
  assert(repeated.artifact_store.manifest_revision === result.artifact_store.manifest_revision,
    "byte-equivalent report retry changed the artifact manifest");
  assert(JSON.stringify(repeated.control_receipt_refs) === JSON.stringify(result.control_receipt_refs),
    "byte-equivalent report retry replaced control receipts");
});

fixture("an admitted report is immutable and corrections require a new wave", () => {
  const corrected = clone(report);
  corrected.agent_results[0].summary = "Corrected result after admission.";
  expectThrow(
    () => recordWave(corrected, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME }),
    /immutable after admission/,
    "same-ID report correction"
  );

  const replacement = clone(report);
  replacement.id = "MWR-SKILL-DEMO-W1-REPLACEMENT";
  expectThrow(
    () => recordWave(replacement, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME }),
    /immutable after admission/,
    "replacement report admission"
  );
});

fixture("missing agents, unknown evidence, and control metadata evidence are rejected", () => {
  const missing = clone(report);
  missing.id = "MWR-MISSING-AGENT";
  missing.agent_results.pop();
  expectThrow(() => recordWave(missing, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME }), /agent set/, "missing report agent");

  const unknown = clone(report);
  unknown.id = "MWR-UNKNOWN-EVIDENCE";
  unknown.agent_results[0].evidence_refs[0].sha256 = "0".repeat(64);
  expectThrow(() => recordWave(unknown, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME }), /exact artifact reference/, "unknown evidence");

  const control = clone(report);
  control.id = "MWR-CONTROL-EVIDENCE";
  control.agent_results[0].evidence_refs = [opened.routing_bundle_ref];
  expectThrow(() => recordWave(control, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME }), /control metadata/, "control evidence");

  const future = clone(report);
  future.id = "MWR-FUTURE-EVIDENCE";
  future.recorded_at = "2026-07-23T05:20:01+09:00";
  expectThrow(() => recordWave(future, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME }), /in the future/, "future report");

  const staleEvidence = evidence(
    repositoryA,
    artifactRoot,
    basePlan,
    "OUT-SKILL-STALE",
    { result: "stale" },
    "2025-07-23T05:00:00+09:00"
  );
  const stale = clone(report);
  stale.id = "MWR-STALE-EVIDENCE";
  stale.agent_results[0].evidence_refs = [staleEvidence];
  expectThrow(() => recordWave(stale, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME }), /evidence window/, "stale evidence");
});

fixture("report-level self-release is rejected", () => {
  const unsafe = clone(report);
  unsafe.id = "MWR-SELF-RELEASE";
  unsafe.release_requested = true;
  expectThrow(() => recordWave(unsafe, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME }), /CONST_MISMATCH/, "report self-release");
});

fixture("AAR closes the completed wave and queues bounded improvement", () => {
  const aar = {
    id: "AAR-SKILL-DEMO-W1",
    mission_id: basePlan.mission_id,
    expected: ["Every agent routes and completes with evidence."],
    actual: ["Every agent completed with manifest-backed evidence."],
    delta: [],
    causes: [],
    sustain: ["Mandatory routing preflight."],
    improve: ["Reduce repeated mission setup."],
    sop_updates: ["Use the mission lifecycle controller as the skill entry point."]
  };
  const result = closeWave(aar, {
    repository: repositoryA,
    artifactRoot,
    missionId: basePlan.mission_id,
    waveId: basePlan.wave_id,
    now: "2026-07-23T05:30:00+09:00"
  });
  assert(result.status === "complete", "completed report should close");
  assert(result.next_wave.required === true && result.next_wave.trigger === "improvement_candidate", "AAR improvement should create next-wave work");
  assert(result.improvement_actions.some(action => action.disposition === "queued_in_bounded_campaign"), "improvement should bind to campaign");
  assert(result.release_authorized === false, "closeout must not authorize release");
  const repeated = closeWave(aar, {
    repository: repositoryA,
    artifactRoot,
    missionId: basePlan.mission_id,
    waveId: basePlan.wave_id
  });
  assert(sameRef(repeated.closeout_ref, result.closeout_ref), "idempotent close changed the closeout reference");
});

fixture("a blocked report produces a blocked closeout and mandatory next wave", () => {
  const plan = wavePlan(basePlan, "W2");
  const openedW2 = openWave(plan, {
    repository: repositoryA,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  });
  const completeEvidence = evidence(repositoryA, artifactRoot, plan, "OUT-W2-VERIFY", { result: "partial" });
  const context = new Map(openedW2.context_packs.map(item => [item.agent_id, item.context_pack_ref]));
  const blockedReport = {
    schema_version: "0.1",
    type: "MissionWaveReport",
    id: "MWR-SKILL-DEMO-W2",
    mission_id: plan.mission_id,
    wave_id: plan.wave_id,
    plan_ref: openedW2.plan_ref,
    routing_preflight_ref: openedW2.routing_preflight_ref,
    agent_results: [
      {
        agent_id: plan.agents[0].agent_id,
        context_pack_ref: context.get(plan.agents[0].agent_id),
        status: "blocked",
        summary: "Awaiting a human scope decision.",
        completed_actions: [],
        blockers: ["Requested change exceeds the approved scope."],
        evidence_refs: [],
        improvement_candidates: [],
        next_actions: ["Obtain a human scope decision."]
      },
      {
        agent_id: plan.agents[1].agent_id,
        context_pack_ref: context.get(plan.agents[1].agent_id),
        status: "complete",
        summary: "Verified the observed partial state.",
        completed_actions: ["Recorded the blocking condition."],
        blockers: [],
        evidence_refs: [completeEvidence],
        improvement_candidates: [],
        next_actions: ["Wait for the human decision."]
      }
    ],
    wave_status: "blocked",
    human_decisions_required: ["Approve or reject the requested scope expansion."],
    release_requested: false,
    recorded_at: "2026-07-23T05:00:00+09:00"
  };
  const recorded = recordWave(blockedReport, { repository: repositoryA, artifactRoot, now: FIXED_REPORT_TIME });
  assert(recorded.status === "blocked" && recorded.continuation_authorized === false, "blocked report should stop continuation");
  const aar = {
    id: "AAR-SKILL-DEMO-W2",
    mission_id: plan.mission_id,
    expected: ["Complete work inside the approved scope."],
    actual: ["The requested change exceeded scope."],
    delta: ["Scope decision remains unresolved."],
    causes: ["The task boundary was narrower than the discovered change."],
    sustain: ["The controller stopped execution."],
    improve: ["Clarify the scope before the next wave."],
    sop_updates: []
  };
  const closed = closeWave(aar, {
    repository: repositoryA,
    artifactRoot,
    missionId: plan.mission_id,
    waveId: plan.wave_id,
    now: "2026-07-23T05:30:00+09:00"
  });
  assert(closed.status === "blocked_pending_execution", "blocked execution should not close complete");
  assert(closed.next_wave.required === true && closed.next_wave.trigger === "blocked_work", "blocked work requires another wave");
});

fixture("every new wave receives fresh wave and agent routing evidence", () => {
  const status = missionStatus({ repository: repositoryA, artifactRoot, missionId: basePlan.mission_id });
  const waveOneReceipts = status.waves.find(wave => wave.wave_id === "W1").artifacts.filter(item => item.kind === "routing-receipts");
  const waveTwoReceipts = status.waves.find(wave => wave.wave_id === "W2").artifacts.filter(item => item.kind === "routing-receipts");
  assert(waveOneReceipts.length === basePlan.agents.length + 1, "W1 routing evidence incomplete");
  assert(waveTwoReceipts.length === basePlan.agents.length + 1, "W2 routing evidence incomplete");
  assert(waveOneReceipts.every(left => waveTwoReceipts.every(right => left.ref.relative_path !== right.ref.relative_path)), "wave routing evidence was reused");
});

fixture("dispatch-controlled waves reject completion reports until every agent lease is settled", () => {
  const plan = wavePlan(basePlan, "WDISPATCH");
  plan.id = "MWP-DISPATCH-LIFECYCLE";
  plan.mission_id = "MIS-DISPATCH-LIFECYCLE";
  const drafts = plan.agents.map((agent, index) =>
    dispatchDraft(plan, agent, `DTP-DISPATCH-LIFECYCLE-${index + 1}`));
  plan.dispatch_control = {
    required: true,
    enforcement_level: "guardrail",
    gateway_exclusive: false,
    policy_authorizations: drafts.map(draft => ({
      agent_id: draft.agent_id,
      provider: draft.provider,
      policy_id: draft.id,
      draft_sha256: inputDigest(draft)
    }))
  };
  const openedDispatch = openWave(plan, {
    repository: repositoryC,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  });
  assert(openedDispatch.dispatch_authorized === false,
    "routing-ready open must not claim tool execution authority");
  const runtimeOptions = {
    repository: repositoryC,
    artifactRoot,
    now: "2026-07-23T04:40:00+09:00"
  };
  drafts.forEach(draft => authorizeDispatchPolicy(runtimeOptions, draft));
  const leases = [issueLease(runtimeOptions, drafts[0].id, {
    sessionId: "session-lifecycle-1",
    providerAgentId: "main"
  })];
  const evidenceRefs = plan.agents.map((agent, index) => evidence(
    repositoryC,
    artifactRoot,
    plan,
    `OUT-DISPATCH-${index + 1}`,
    { agent_id: agent.agent_id, result: "fixture" },
    "2026-07-23T04:55:00+09:00"
  ));
  const candidateReport = completeReport(plan, openedDispatch, evidenceRefs);
  expectThrow(
    () => recordWave(candidateReport, {
      repository: repositoryC,
      artifactRoot,
      now: FIXED_REPORT_TIME
    }),
    /has no lease lineage|must close its dispatch lease as completed/,
    "active dispatch lease report rejection"
  );
  completeLease({
    repository: repositoryC,
    artifactRoot,
    now: "2026-07-23T04:50:00+09:00"
  }, leases[0].lease.id);
  leases.push(issueLease({
    repository: repositoryC,
    artifactRoot,
    now: "2026-07-23T04:51:00+09:00"
  }, drafts[1].id, {
    sessionId: "session-lifecycle-2",
    providerAgentId: "main"
  }));
  expectThrow(
    () => recordWave(candidateReport, {
      repository: repositoryC,
      artifactRoot,
      now: FIXED_REPORT_TIME
    }),
    /must close its dispatch lease as completed/,
    "active handoff lease report rejection"
  );
  completeLease({
    repository: repositoryC,
    artifactRoot,
    now: "2026-07-23T04:52:00+09:00"
  }, leases[1].lease.id);
  const recordedDispatch = recordWave(candidateReport, {
    repository: repositoryC,
    artifactRoot,
    now: FIXED_REPORT_TIME
  });
  assert(recordedDispatch.dispatch_control.status === "settled",
    "completed dispatch lineages should settle the report gate");
  const status = missionStatus({
    repository: repositoryC,
    artifactRoot,
    missionId: plan.mission_id
  });
  assert(status.dispatch.leases.length === plan.agents.length,
    "mission status should expose every dispatch lease");
  assert(status.dispatch.leases.every(item => item.status === "completed"),
    "mission status should show settled dispatch leases");
});

fixture("identical mission IDs remain isolated across target repositories", () => {
  const openedB = openWave(basePlan, {
    repository: repositoryB,
    artifactRoot,
    doctrineRoot: ROOT,
    now: FIXED_OPEN_TIME
  });
  assert(openedB.status === "ready", "second repository should open independently");
  assert(openedB.repository.key !== opened.repository.key, "repository namespaces must differ");
  assert(!openedB.plan_ref.relative_path.startsWith(`repositories/${opened.repository.key}/`), "second repository leaked into first namespace");
  const verificationA = verifyRepositoryArtifacts({ repositoryPath: repositoryA, artifactRoot });
  const verificationB = verifyRepositoryArtifacts({ repositoryPath: repositoryB, artifactRoot });
  assert(verificationA.valid && verificationB.valid, "both repository stores should verify");
  assert(resolveRepository(repositoryA).identity_fingerprint !== resolveRepository(repositoryB).identity_fingerprint, "repository fingerprints should differ");
});

fixture("Codex and Claude wrappers resolve the same lifecycle runtime", () => {
  for (const wrapper of [
    "codex-skills/controls-doctrine-operator/scripts/operate_controls_mission.js",
    ".claude/skills/controls-doctrine-operator/scripts/operate_controls_mission.js"
  ]) {
    const result = spawnSync(process.execPath, [path.join(ROOT, wrapper), "--help"], { encoding: "utf8" });
    assert(result.status === 0, `${wrapper} failed: ${result.stderr}`);
    assert(result.stdout.includes("skill-mission-controller.js open"), `${wrapper} did not resolve lifecycle runtime`);
    assert(result.stdout.includes("skill-mission-controller.js terminate"), `${wrapper} omitted termination`);
  }
});

const noneRef = { artifact_id: "none", relative_path: "none", sha256: "none" };
const terminationOptions = { repository: repositoryB, artifactRoot, doctrineRoot: ROOT, get now() { return new Date().toISOString(); } };
const expiredTime = "2028-07-23T04:00:00+09:00";
function terminationRequest(plan, openedWave, status = "expired", successor = noneRef) {
  return {
    schema_version: "0.1", type: "MissionWaveTerminationRequest", mission_id: plan.mission_id,
    wave_id: plan.wave_id, status, reason: "Stop this wave without claiming execution completion.",
    plan_ref: openedWave.plan_ref, successor_plan_ref: successor, decision_ref: clone(noneRef)
  };
}
function terminationDecision(request, plan, overrides = {}) {
  const option = terminationDecisionOption(request);
  const decision = {
    schema_version: "0.1", type: "DecisionLogEntry", id: `DL-${plan.wave_id}-${overrides.decision_maker || "USER"}`,
    mission_id: plan.mission_id, decided_at: new Date().toISOString(), decision_maker: "USER",
    decision_type: "scope", question: "Terminate this exact wave?", options_considered: [option, "continue"],
    chosen_option: option, rationale: "User-directed lifecycle reconciliation.",
    authority_basis: { basis_type: "retained_authority", reference: plan.id, summary: "Fixture USER scope decision." },
    affected_artifacts: [request.plan_ref.relative_path, request.successor_plan_ref.relative_path],
    review_trigger: "A changed plan or successor needs a fresh decision.", status: "complete", ...overrides
  };
  const saved = writeRepositoryArtifact({ repositoryPath: repositoryB, artifactRoot,
    missionId: plan.mission_id, waveId: plan.wave_id, kind: "decision-logs", artifactId: decision.id,
    payload: decision, createdAt: decision.decided_at });
  return { ...request, decision_ref: { artifact_id: decision.id, relative_path: saved.relative_path, sha256: saved.sha256 } };
}

fixture("expired wave terminates without fabricated execution and retries immutably", () => {
  const plan = wavePlan(basePlan, "TERM-EXPIRED");
  const started = openWave(plan, terminationOptions);
  const request = terminationRequest(plan, started);
  expectThrow(() => terminateWave(request, terminationOptions), /before its plan expires/, "premature expiry");
  const wrong = clone(request);
  wrong.plan_ref.sha256 = "0".repeat(64);
  expectThrow(() => terminateWave(wrong, { ...terminationOptions, now: expiredTime }), /plan reference/, "wrong plan");
  const before = verifyRepositoryArtifacts({ repositoryPath: repositoryB, artifactRoot });
  const result = terminateWave(request, { ...terminationOptions, now: expiredTime });
  const record = loadArtifact(artifactRoot, result.termination_ref);
  assert(result.status === "expired" && record.execution_completion_claimed === false, "expiry claimed completion");
  assert(!record.retained_artifact_refs.some(ref => ref.relative_path.includes("/mission-wave-reports/")), "report fabricated");
  assert(result.artifact_store.artifact_count === before.artifact_count + 1, "termination must add exactly one artifact");
  const retry = terminateWave(request, { ...terminationOptions, now: "2029-01-01T00:00:00Z" });
  assert(retry.artifact_store.manifest_revision === result.artifact_store.manifest_revision, "retry rewrote history");
  expectThrow(() => terminateWave({ ...request, reason: "replacement reason" }, { ...terminationOptions, now: expiredTime }), /immutable/, "different retry");
  const status = missionStatus({ ...terminationOptions, missionId: plan.mission_id, now: expiredTime });
  assert(status.waves.find(item => item.wave_id === plan.wave_id).lifecycle_status === "expired", "status omitted termination");
  expectThrow(() => openWave(plan, terminationOptions), /MISSION_WAVE_TERMINATED/, "backdated reopen");
  const candidate = completeReport(plan, started, plan.agents.map(() => started.plan_ref));
  expectThrow(() => recordWave(candidate, terminationOptions), /MISSION_WAVE_TERMINATED/, "post-terminal report");
  expectThrow(() => closeWave({}, { ...terminationOptions, missionId: plan.mission_id, waveId: plan.wave_id }), /MISSION_WAVE_TERMINATED/, "post-terminal close");
  const admission = admitToolRequest(terminationOptions, {
    missionId: plan.mission_id, waveId: plan.wave_id, agentId: plan.agents[0].agent_id, provider: "codex", sessionId: "terminal"
  }, { hook_event_name: "PreToolUse", tool_use_id: "terminal", tool_name: "Bash" });
  assert(admission.decision === "deny" && admission.reason_codes.includes("MISSION_WAVE_TERMINATED"), "terminal admission not denied");
});

fixture("termination preserves legacy routing evidence without reinterpreting its schema", () => {
  const plan = wavePlan(basePlan, "TERM-LEGACY");
  const saved = writeRepositoryArtifact({ repositoryPath: repositoryB, artifactRoot,
    missionId: plan.mission_id, waveId: plan.wave_id, kind: "mission-wave-plans", artifactId: plan.id,
    payload: plan, createdAt: plan.created_at });
  const legacy = readJson("sample-payloads/valid-agent-context-pack.json");
  legacy.schema_version = "0.1";
  delete legacy.capability_query;
  delete legacy.capability_routing;
  const retained = writeRepositoryArtifact({ repositoryPath: repositoryB, artifactRoot,
    missionId: plan.mission_id, waveId: plan.wave_id, kind: "agent-context-packs", artifactId: "ACP-LEGACY",
    payload: legacy, createdAt: plan.created_at });
  const request = terminationRequest(plan, { plan_ref: { artifact_id: plan.id, relative_path: saved.relative_path, sha256: saved.sha256 } });
  const result = terminateWave(request, { ...terminationOptions, now: expiredTime });
  const record = loadArtifact(artifactRoot, result.termination_ref);
  assert(record.retained_artifact_refs.some(ref => ref.sha256 === retained.sha256), "legacy evidence lost");
});

fixture("termination cannot overwrite normal closeout or accept permissive schema fields", () => {
  const request = terminationRequest(basePlan, opened);
  expectThrow(() => terminateWave(request, { ...terminationOptions, repository: repositoryA, now: expiredTime }), /already has a closeout/, "normal closeout preservation");
  const sample = readJson("sample-payloads/valid-mission-wave-termination.json");
  for (const changes of [
    { status: "complete" }, { release_authorized: true }, { continuation_authorized: true },
    { execution_completion_claimed: true }, { dispatch_settled: false },
    { successor_plan_ref: { ...noneRef, sha256: "a".repeat(64) } }
  ]) {
    assert(!validatePayload({ ...sample, ...changes }, "mission-wave-termination").valid, "unsafe termination schema accepted");
  }
});

fixture("abort requires a fresh USER decision bound to the exact operation", () => {
  const plan = wavePlan(basePlan, "TERM-ABORT");
  const started = openWave(plan, terminationOptions);
  const request = terminationRequest(plan, started, "aborted");
  expectThrow(() => terminateWave(request, terminationOptions), /MISSION_TERMINATION_DECISION_REQUIRED/, "no decision");
  const ai = terminationDecision(request, plan, { decision_maker: "S3" });
  expectThrow(() => terminateWave(ai, terminationOptions), /fresh, exact USER/, "AI self approval");
  const authorized = terminationDecision(request, plan);
  expectThrow(() => terminateWave(authorized, { ...terminationOptions, now: new Date(Date.now() + 7200000).toISOString() }), /fresh, exact USER/, "stale decision");
  const substituted = { ...authorized, status: "superseded", successor_plan_ref: opened.plan_ref };
  expectThrow(() => terminateWave(substituted, terminationOptions), /Manifest does not contain exact/, "cross repository successor");
  assert(terminateWave(authorized, terminationOptions).status === "aborted", "valid abort rejected");
});

fixture("supersession binds an opened successor and never transfers execution authority", () => {
  const plan = wavePlan(basePlan, "TERM-OLD");
  const nextPlan = wavePlan(basePlan, "TERM-NEXT");
  const started = openWave(plan, terminationOptions);
  const next = openWave(nextPlan, terminationOptions);
  const self = terminationDecision(terminationRequest(plan, started, "superseded", started.plan_ref), plan, { id: "DL-SELF" });
  expectThrow(() => terminateWave(self, terminationOptions), /cannot supersede itself/, "self successor");
  const request = terminationDecision(terminationRequest(plan, started, "superseded", next.plan_ref), plan);
  const result = terminateWave(request, terminationOptions);
  assert(result.status === "superseded" && result.continuation_authorized === false && result.release_authorized === false, "supersession expanded authority");
  const cycle = terminationDecision(terminationRequest(nextPlan, next, "superseded", started.plan_ref), nextPlan);
  expectThrow(() => terminateWave(cycle, terminationOptions), /MISSION_WAVE_TERMINATED/, "supersession cycle");
});

fixture("expiration cannot hide active, interrupted, or unresolved dispatch execution", () => {
  const plan = wavePlan(basePlan, "TERM-DISPATCH");
  const drafts = plan.agents.map(agent => dispatchDraft(plan, agent, `DTP-TERM-${agent.agent_id}`));
  plan.dispatch_control = { required: true, enforcement_level: "guardrail", gateway_exclusive: false,
    policy_authorizations: drafts.map(draft => ({ agent_id: draft.agent_id, provider: draft.provider, policy_id: draft.id, draft_sha256: inputDigest(draft) })) };
  const started = openWave(plan, terminationOptions);
  const request = terminationRequest(plan, started);
  authorizeDispatchPolicy(terminationOptions, drafts[0]);
  const lease = issueLease(terminationOptions, drafts[0].id, { sessionId: "termination-session", providerAgentId: "main" });
  expectThrow(() => terminateWave(request, { ...terminationOptions, now: expiredTime }), /settled dispatch/, "active lease");
  const identity = { provider: "codex", missionId: plan.mission_id, waveId: plan.wave_id,
    agentId: plan.agents[0].agent_id, sessionId: "termination-session", providerAgentId: "main" };
  const admitted = admitToolRequest(terminationOptions, identity, {
    hook_event_name: "PreToolUse", tool_use_id: "term-pending", tool_name: "Bash", tool_input: { command: "true" }
  });
  assert(admitted.decision === "allow", "fixture request was not admitted");
  expectThrow(() => terminateWave(request, { ...terminationOptions, now: expiredTime }), /settled dispatch/, "unresolved tool request");
  const cancelled = cancelToolRequest(terminationOptions, identity, {
    toolUseId: "term-pending", toolName: "Bash", toolInput: { command: "true" }
  });
  assert(cancelled.status === "cancelled", "unstarted fixture request was not settled");
  interruptLease(terminationOptions, lease.lease.id);
  expectThrow(() => terminateWave(request, { ...terminationOptions, now: expiredTime }), /settled dispatch/, "interrupted lease");
  revokeLease(terminationOptions, lease.lease.id);
  terminateWave(request, { ...terminationOptions, now: expiredTime });
  expectThrow(() => issueLease(terminationOptions, drafts[0].id, { sessionId: "new" }), /MISSION_WAVE_TERMINATED/, "post-terminal issue");
  expectThrow(() => authorizeDispatchPolicy(terminationOptions, drafts[1]), /MISSION_WAVE_TERMINATED/, "post-terminal policy");
  expectThrow(() => resumeLease(terminationOptions, lease.lease.id, { sessionId: "new" }), /MISSION_WAVE_TERMINATED/, "post-terminal resume");
});

fixture("termination CLI rejects clock overrides and serializes with wave and issuance locks", () => {
  const { acquireRepositoryLease, releaseRepositoryLease } = require("./repository-lease");
  const plan = wavePlan(basePlan, "TERM-LOCK");
  const started = openWave(plan, terminationOptions);
  const request = terminationRequest(plan, started);
  const input = path.join(temporaryRoot, "termination-request.json");
  fs.writeFileSync(input, JSON.stringify(request));
  const argv = [path.join(ROOT, "skill-mission-controller.js"), "terminate", input,
    "--repository", repositoryB, "--artifact-root", artifactRoot];
  const clock = spawnSync(process.execPath, [...argv, "--at", expiredTime], { encoding: "utf8" });
  assert(clock.status === 2 && clock.stderr.includes("live controller clock"), "CLI allowed synthetic expiry time");
  const contend = () => {
    const result = spawnSync(process.execPath, argv, { encoding: "utf8", timeout: 15000 });
    assert(result.status === 2 && result.stderr.includes("Timed out waiting"), "termination bypassed coordination lock");
  };
  withDispatchIssuanceLock(terminationOptions, contend);
  const key = resolveRepository(repositoryB).key;
  const waveKey = require("crypto").createHash("sha256").update(`${plan.mission_id}\0${plan.wave_id}`).digest("hex");
  const lock = acquireRepositoryLease(path.join(artifactRoot, ".mission-lifecycle", key, waveKey));
  try { contend(); } finally { releaseRepositoryLease(lock); }
  const status = missionStatus({ ...terminationOptions, missionId: plan.mission_id });
  assert(status.waves.find(item => item.wave_id === plan.wave_id).termination_ref.artifact_id === "none", "blocked call persisted termination");
});

let passed = 0;
try {
  for (const item of fixtures) {
    try {
      item.fn();
      passed += 1;
      console.log(`PASS ${item.name}`);
    } catch (error) {
      console.error(`FAIL ${item.name}`);
      console.error(error.stack || error.message);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({
  valid: passed === fixtures.length,
  fixture_count: fixtures.length,
  passed,
  failed: fixtures.length - passed,
  fixtures: fixtures.map(item => item.name)
}, null, 2));
