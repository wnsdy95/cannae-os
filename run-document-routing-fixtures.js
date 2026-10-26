#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { validateSkill } = require("./validate-controls-skill");

const ROOT = __dirname;
const ROUTERS = [
  "codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js",
  ".claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js"
];
let routedQueries = 0;

function route(router, args, query) {
  const result = spawnSync(process.execPath, [path.join(ROOT, router), ...args, query, ROOT], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  routedQueries++;
  return JSON.parse(result.stdout);
}

function assertRoutes(result, expectedRoutes) {
  const routeIds = new Set(result.matched_routes.map(item => item.id));
  for (const expected of expectedRoutes) {
    assert(routeIds.has(expected), `Expected route ${expected}; received ${[...routeIds].join(", ")}.`);
  }
  assert.strictEqual(result.route_inventory.unrouted_artifact_count, 0);
}

for (const router of ROUTERS) {
  validateSkill(path.posix.dirname(path.posix.dirname(router)));
  for (const query of ["native training recovery", "native failure appraisal", "NativeTrainingFailureAppraisal", "OperatorNativeTrainingReconciliationAuthorization",
    "OperatorNativeTrainingReconciliationRecord", "operator-native-training-failure.js", "native-training-failure-appraisal.schema.json", "native training reconciliation fresh owner ceremony durable one-use receipt history UI publication adversaries",
    "run-native-training-reconciliation-fixtures.js", "run-native-training-reconciliation-crash-fixtures.js", "native-training-reconciliation-fixtures/browser-check.js"])
    for (const actor of [["--actor=user"], ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"]]) {
      const result = route(router, actor, query); assertRoutes(result, ["native-training-reconciliation"]); assert.equal(result.capability_routing.status, "covered");
      assert(result.recommended_documents.some(value => value.path === "docs/native-training-failure-reconciliation.md"));
      for (const command of ["node run-native-training-reconciliation-contract-fixtures.js", "node run-native-training-failure-fixtures.js", "node run-native-training-reconciliation-fixtures.js", "node run-native-training-reconciliation-crash-fixtures.js"]) assert(result.validation_commands.includes(command));
    }
  for (const query of ["native producer history", "NativeTrainingProducerInspection", "NativeTrainingHistoricalProducerSnapshot", "inspect_controls_training_producer",
    "deduplicated producer snapshots", "run-native-training-snapshot-fixtures.js"])
    for (const actor of [["--actor=user"], ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"]]) {
      const result = route(router, actor, query); assertRoutes(result, ["native-producer-history"]); assert.equal(result.capability_routing.status, "covered");
      assert(result.recommended_documents.some(value => value.path === "docs/native-training-producer-history.md"));
      for (const command of ["node run-native-training-producer-contract-fixtures.js", "node run-native-training-snapshot-fixtures.js", "node run-native-training-producer-fixtures.js"]) assert(result.validation_commands.includes(command));
    }
  for (const query of ["native training owner consent", "training transfer review", "NativeTrainingTransferReviewRequest", "NativeTrainingTransferAuthorization", "OperatorNativeTrainingProduct", "operator-native-training.js", "propose-review native training"])
    for (const actor of [["--actor=user"], ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"]]) {
      const result = route(router, actor, query); assertRoutes(result, ["task-training"]); assert.equal(result.capability_routing.status, "covered");
      assert(result.recommended_documents.some(value => value.path === "docs/native-training-owner-consent.md"));
      for (const command of ["node run-native-training-transfer-contract-fixtures.js", "node run-native-training-transfer-fixtures.js", "node run-native-training-transfer-adversarial-fixtures.js"]) assert(result.validation_commands.includes(command));
    }
  for (const query of ["native training product", "training product", "native-training-product-controller", "prepare_controls_training_product",
    ...require("./native-training-product-contract").NON_WORK_TYPES]) for (const actor of [["--actor=user"], ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"]]) {
    const result = route(router, actor, query); assertRoutes(result, ["task-training"]);
    assert.equal(result.capability_routing.status, "covered"); assert.equal(result.capability_routing.provisional_organization.required, false);
    assert(result.recommended_documents.some(value => value.path === "docs/native-training-products.md"));
    assert(result.validation_commands.includes("node run-native-training-product-contract-fixtures.js"));
    assert(result.validation_commands.includes("node run-native-training-product-fixtures.js"));
  }
  for (const query of ["training session consent", "training session enrollment", "prepare_controls_training_session", "training-session-contract",
    "training session contract", "TaskTrainingSessionProposal", "TaskTrainingSessionAuthorization", "schema-files/training-session-authorization.schema.json",
    "operator-training-session-executor.js"]) for (const actor of [["--actor=user"], ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"]]) {
    const result = route(router, actor, query); assertRoutes(result, ["task-training"]);
    assert.equal(result.capability_routing.status, "covered");
    assert.equal(result.capability_routing.provisional_organization.required, false);
    assert(result.validation_commands.includes("node run-training-session-contract-fixtures.js"));
    assert(result.validation_commands.includes("node run-training-session-fixtures.js"));
    assert(result.recommended_documents.some(item => item.path === "docs/training-session-consent.md"));
  }
  for (const query of ["task training", "training evidence", "training qualification", "TaskTrainingSessionBinding", "TaskTrainingTrialAppraisal"]) {
    const result = route(router, ["--actor=user"], query); assertRoutes(result, ["task-training"]);
    assert.equal(result.capability_routing.status, "covered"); assert(result.validation_commands.includes("node run-task-training-contract-fixtures.js"));
    assert(result.recommended_documents.some(item => item.path === "docs/task-training-evidence.md"));
  }
  for (const query of ["minimum readiness", "readiness authority intersection", "readiness-authority-intersection", "approval cannot replace readiness"]) {
    const result = route(router, ["--actor=user"], query); assertRoutes(result, ["readiness-intersection"]);
    assert.equal(result.capability_routing.status, "covered"); assert(result.validation_commands.includes("node run-authority-integration-fixtures.js"));
    assert(result.recommended_documents.some(item => item.path === "docs/readiness-authority-intersection.md"));
  }
  for (const query of ["@cli-default", "CLI default model", "default model binding", "CodexModelSelection", "codex-model-selection"]) {
    const result = route(router, ["--actor=user"], query); assertRoutes(result, ["cli-model-selection"]);
    assert.equal(result.capability_routing.status, "covered"); assert(result.validation_commands.includes("node run-codex-model-selection-fixtures.js"));
    assert(result.recommended_documents.some(item => item.path === "docs/codex-default-model-binding.md"));
  }
  for (const query of ["ip-address", "ip-zone", "zone parser", "GHSA-rxp7-6hxx-x8q5", "verifier dependency", "dependency migration", "historical producer", "parser denial of service"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["advisory-dependency"]); assert.equal(result.capability_routing.status, "covered");
    assert.equal(result.matched_routes[0].id, "advisory-dependency");
    assert.equal(result.recommended_documents[2].path, "docs/github-release-independent-verification.md");
    assert(result.validation_commands.includes("node run-github-release-independent-verification-fixtures.js"));
    if (query === "ip-address") assert(result.validation_commands.includes("node run-github-release-publisher-fixtures.js"));
  }
  for (const query of ["ForceRegistryEntity", "ForceRegistryRequest", "ForceRegistryProposal", "ForceRegistryAuthorization", "ForceRegistryEvent",
    "force-registry", "operate_controls_force_registry", "schema-files/force-registry-entity.schema.json"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["force-registry"]); assert.equal(result.capability_routing.status, "covered");
    assert.equal(result.capability_routing.provisional_organization.required, false);
    assert(result.recommended_documents.some(item => item.path === "docs/force-registry-enrollment.md"));
    assert(result.validation_commands.includes("node run-force-registry-fixtures.js"));
  }
  for (const query of ["WorkloadControlInput", "WorkloadPolicyAssessment", "WorkloadControlReceipt", "workload-control", "subject-bound report input", "schema-files/workload-policy-assessment.schema.json"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["workload-controls"]); assert.equal(result.capability_routing.status, "covered");
    assert.equal(result.capability_routing.provisional_organization.required, false);
    assert(result.recommended_documents.some(item => item.path === "docs/subject-bound-workload-controls.md"));
    assert(result.validation_commands.includes("node run-workload-control-fixtures.js"));
  }
  for (const query of ["readiness drop", "cross-mission capability registry training progression readiness actual grant reconciliation",
    "READINESS_REQUALIFICATION_REQUIRED", "reconcile_controls_readiness", "schema-files/readiness-drop-reconciliation.schema.json"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["force-readiness"]); assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/readiness-drop-reconciliation.md"));
    assert(result.validation_commands.includes("node run-readiness-drop-revocation-fixtures.js"));
  }
  for (const query of ["analysis reconciliation", "analysis hold", "failed request analysis", "order analysis failed transfer reconciliation",
    "schema-files/operator-analysis-reconciliation-authorization.schema.json", "Review ANALYSIS-RECONCILIATION before acknowledging publication", "operator-analysis-publication.js", "operator-reconciliation-contract-core.js"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["analysis-reconciliation"]); assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/order-analysis-reconciliation.md"));
    assert(result.validation_commands.includes("node run-operator-analysis-reconciliation-fixtures.js"));
    assert(result.validation_commands.includes("node run-operator-analysis-reconciliation-contract-fixtures.js"));
  }
  for (const query of ["order analysis", "order-analysis-generation", "native planning", "prepare_controls_analysis", "codex-bounded-collector.js",
    "model invocation integrity", "model-invocation-integrity", "derived order output bounds", "draft too large", "ORDER_INTAKE_DRAFT_TOO_LARGE"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["order-analysis-generation"]);
    assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/native-order-analysis.md"));
    assert(result.validation_commands.includes("node run-native-order-analysis-fixtures.js"));
    assert(result.validation_commands.includes("node run-model-invocation-integrity-fixtures.js"));
    assert(result.validation_commands.includes("node run-request-order-compiler-fixtures.js"));
  }
  for (const query of ["requirement inventory", "semantic coverage review", "semantic-review-assignment", "semantic review assignment",
    "schema-files/semantic-review-assignment.schema.json", "Review SEMANTIC-REVIEW-ASSIGNMENT before adoption", "review_controls_requirements"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["semantic-admission"]);
    assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/requirement-inventory-admission.md"));
    assert(result.validation_commands.includes("node run-requirement-inventory-fixtures.js"));
    assert.equal(result.capability_routing.provisional_organization.required, false);
  }
  for (const query of ["bounded planning", "bounded-planning", "automatic plan", "structural synthesis", "plan_controls_mission"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["bounded-planning"]);
    assert.equal(result.capability_routing.status, "covered");
    assert.equal(result.capability_routing.provisional_organization.required, false);
    assert(result.recommended_documents.some(item => item.path === "docs/bounded-plan-synthesis.md"));
    assert(result.validation_commands.includes("node run-bounded-planning-fixtures.js"));
    assert(result.validation_commands.includes("node run-bounded-planning-metadata-fixtures.js"));
  }
  for (const query of ["model hold", "operator-model-reconciliation", "model-transfer-reconciliation"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["semantic-omission"]);
    assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/model-transfer-reconciliation.md"));
    assert(result.validation_commands.includes("node run-operator-model-reconciliation-fixtures.js"));
  }
  for (const query of ["operational COP", "operations screen", "critical alert scope"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["operational-cop"]);
    assert.equal(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/operational-cop.md"));
    assert(result.validation_commands.includes("node run-operational-cop-fixtures.js"));
  }
  for (const query of ["issuance recovery", "recover-issuance", "cancel-issuance"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["dispatch-issuance-recovery"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/dispatch-issuance-recovery.md"));
    assert(result.validation_commands.includes("node run-dispatch-issuance-contract-fixtures.js"));
  }
  for (const query of ["method channel continuation", "Review and validate bounded same-wave method channel continuation preserving budgets, reports, and interruption lineage"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["method-control-channel"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert.strictEqual(result.capability_routing.provisional_organization.required, false);
    assert(result.recommended_documents.some(item => item.path === "docs/method-control-channel.md"));
    assert(result.validation_commands.includes("node run-method-control-contract-fixtures.js"));
  }
  for (const query of ["operator console", "local-operator-console", "evidence api", "viewer invitation", "serve_controls_operator"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["local-operator-console"]);
    assert(result.recommended_documents.some(item => item.path === "docs/local-operator-console.md"));
    assert(result.validation_commands.includes("node run-operator-console-fixtures.js"));
    assert.equal(result.capability_routing.status, "covered");
  }
  for (const query of ["operator consent", "operator-consent", "authenticated order review"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["local-operator-console"]);
    assert(result.recommended_documents.some(item => item.path === "docs/operator-consent-and-adoption.md"));
    assert(result.validation_commands.includes("node run-operator-consent-fixtures.js"));
  }
  for (const query of ["order revision", "order-revision-controller.js", "revise_controls_order.js", "order replay", "FRAGO"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["orders"]);
    assert(result.recommended_documents.some(item => item.path === "docs/order-revision-and-supersession.md"));
    assert(result.validation_commands.includes("node run-order-revision-fixtures.js"));
  }
  for (const query of ["order adoption", "order-adoption-controller.js", "adopt_controls_order.js", "order-backbrief", "order-rehearsal"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["orders"]);
    assert(result.recommended_documents.some(item => item.path === "docs/order-adoption-and-plan-binding.md"));
    assert(result.validation_commands.includes("node run-order-adoption-fixtures.js"));
  }
  for (const query of ["request intake", "mission analysis", "request-order-compiler.js", "compile_controls_order.js", "order-intake-contract.js", "mission-order-analysis", "order-draft"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["orders"]);
    assert(result.recommended_documents.some(item => item.path === "docs/request-order-intake.md"));
    assert(result.validation_commands.includes("node run-request-order-compiler-fixtures.js"));
    assert(!result.validation_commands.some(command => command.includes("sample-payloads/valid-backbrief.json")));
  }
  for (const query of ["dependency migration retained verifier evidence ip-address security update",
    "verifier dependency", "producer compatibility", "lockfile update", "ip-address"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["authority-risk-release"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/github-release-independent-verification.md"));
    assert(result.validation_commands.includes("node run-github-release-independent-verification-fixtures.js"));
  }
  for (const query of ["reconciled failure", "reconciled_failed_effects", "post-settlement revocation"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["tool-effect-review"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert.strictEqual(result.operating_mode.decision_authority, "bounded_ai_delegate");
    assert(result.recommended_documents.some(item => item.path === "docs/tool-effect-settlement.md"));
    assert(result.validation_commands.includes("node run-tool-effect-settlement-fixtures.js"));
  }
  for (const query of ["gateway effect review", "gateway settlement", "orphan admission"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["gateway-effect-review"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/gateway-effect-review.md"));
    assert(result.validation_commands.includes("node run-gateway-effect-review-fixtures.js"));
  }
  for (const query of ["gateway ownership", "gateway obligations", "late gateway callback"]) {
    const result = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"], query);
    assertRoutes(result, ["enforced-dispatch"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    assert(result.recommended_documents.some(item => item.path === "docs/protected-tool-gateway-contract.md"));
    assert(result.recommended_documents.some(item => item.path === "docs/enforced-dispatch-and-resume.md"));
    assert(result.validation_commands.includes("node run-protected-tool-gateway-fixtures.js"));
  }
  for (const query of ["Audit implementation candidates and the completion backlog",
    "Audit implementation-candidate-registry.js and completion-backlog.md"]) {
    const registry = route(router, ["--actor=user"], query);
    assertRoutes(registry, ["skill-operations"]);
    assert.strictEqual(registry.capability_routing.status, "covered");
    assert(registry.recommended_documents.some(item => item.path === "docs/implementation-candidate-registry.md"));
    assert(registry.validation_commands.includes("node implementation-candidate-registry.js audit"));
  }
  const termination = route(router, ["--actor=user"], "Reconcile expired wave termination and supersession");
  for (const query of ["commander intent autonomy boundaries drift FRAGO", "intent continuity and task conservation",
    "mission command and disciplined initiative", "check_controls_intent context upgrade"]) {
    const result = route(router, ["--actor=user"], query);
    assertRoutes(result, ["intent-initiative"]);
    assert.strictEqual(result.capability_routing.status, "covered");
    for (const document of ["docs/mission-command-runtime-policy.md", "docs/disciplined-initiative-rules.md", "docs/intent-continuity-runtime.md"]) {
      assert(result.recommended_documents.some(item => item.path === document), `${query}: ${document} must be a primary recommendation`);
    }
    assert(result.validation_commands.includes("node run-intent-continuity-fixtures.js"));
  }
  assertRoutes(termination, ["skill-operations"]);
  assert(termination.recommended_documents.some(item => item.path === "docs/skill-operational-mission-lifecycle.md"));
  const capabilityGapQuery = "Research ICP and sales targeting using the canonical track view";
  const capabilityGap = route(router, ["--actor=ai", "--role=COS", "--department=coordination", "--authority=tasking"],
    capabilityGapQuery);
  assertRoutes(capabilityGap, ["force-structure", "sources-research"]);
  assert.strictEqual(capabilityGap.capability_query, capabilityGapQuery);
  assert.strictEqual(capabilityGap.capability_routing.status, "gap_detected");
  assert.strictEqual(capabilityGap.capability_routing.reason_code, "NO_CAPABILITY_ROUTE");
  assert.strictEqual(capabilityGap.capability_routing.capability_scope, capabilityGapQuery);
  assert.strictEqual(capabilityGap.capability_routing.provisional_organization.required, true);
  assert.strictEqual(capabilityGap.capability_routing.provisional_organization.task_organization_status, "task_organized");
  assert.strictEqual(capabilityGap.capability_routing.provisional_organization.authority_expansion_authorized, false);
  assert.strictEqual(capabilityGap.capability_routing.provisional_organization.standing_department_activation_authorized, false);
  assert.strictEqual(capabilityGap.capability_routing.force_structure_review.required, true);
  assert.strictEqual(capabilityGap.capability_routing.force_structure_review.status, "analysis_required");
  assert.strictEqual(capabilityGap.capability_routing.force_structure_review.final_decision_authority, "USER");
  assert(capabilityGap.recommended_documents.some(item =>
    item.path === "docs/force-structure-change-policy.md"));
  assert(capabilityGap.validation_commands.includes("node run-force-structure-change-fixtures.js"));

  const orientation = route(router, ["--actor=user"],
    "Give me an overview of this framework");
  assertRoutes(orientation, ["orientation"]);
  assert.strictEqual(orientation.capability_routing.status, "covered");
  assert.strictEqual(orientation.capability_routing.reason_code, "CORPUS_ORIENTATION_REQUEST");

  const corpusAsTool = route(router, ["--actor=user"],
    "Use this repository to analyze ICP and rank sales targets");
  assertRoutes(corpusAsTool, ["force-structure"]);
  assert.strictEqual(corpusAsTool.capability_routing.status, "gap_detected");
  assert.strictEqual(corpusAsTool.capability_routing.reason_code, "NO_CAPABILITY_ROUTE");

  const comparison = route(router, ["--actor=user"],
    "Compare a runtime-control candidate against an accepted baseline before promotion");
  assert.strictEqual(comparison.operating_mode.mode, "human_final_decision_authority");
  assertRoutes(comparison, ["bounded-self-improvement", "runtime-validation"]);

  const delegated = route(router, ["--actor=ai", "--role=S3", "--department=operations", "--authority=scoped-execution"],
    "Run a canary promotion gate for this skill candidate");
  assert.strictEqual(delegated.operating_mode.mode, "delegated_ai_role_department_authority");
  assert.strictEqual(delegated.operating_mode.decision_authority, "bounded_ai_delegate");
  assert(delegated.operating_mode.escalation_required_when.some(item => item.includes("exceeds delegated")));
  assertRoutes(delegated, ["bounded-self-improvement", "skill-operations"]);

  const adaptation = route(router, ["--actor=user"],
    "Require a mandatory skill improvement after every framework improvement");
  assertRoutes(adaptation, ["skill-operations"]);
  assert(adaptation.recommended_documents.some(item =>
    item.path === "codex-skills/controls-doctrine-operator/references/self-improvement-loop.md"));
  assert(adaptation.recommended_documents.some(item =>
    item.path === ".claude/skills/controls-doctrine-operator/references/self-improvement-loop.md"));
  assert(adaptation.validation_commands.some(command =>
    command === "node validate-controls-skill.js codex-skills/controls-doctrine-operator"));
  assert(adaptation.validation_commands.some(command =>
    command === "node validate-controls-skill.js .claude/skills/controls-doctrine-operator"));
  assert(adaptation.validation_commands.every(command => !command.includes("/Users/work")));

  const ignoredStateDir = path.join(ROOT, ".cxt");
  const ignoredStatePath = path.join(
    ignoredStateDir,
    `routing-fixture-${path.basename(path.dirname(path.dirname(router)))}.json`
  );
  const beforeIgnoredState = route(
    router,
    ["--actor=user"],
    "Check ignored local state routing coverage"
  );
  const ignoredStateDirExisted = fs.existsSync(ignoredStateDir);
  fs.mkdirSync(ignoredStateDir, { recursive: true });
  try {
    fs.writeFileSync(
      ignoredStatePath,
      `${JSON.stringify({ local_runtime_state: true })}\n`
    );
    const afterIgnoredState = route(
      router,
      ["--actor=user"],
      "Check ignored local state routing coverage"
    );
    assert.strictEqual(
      afterIgnoredState.route_inventory.routable_artifact_count,
      beforeIgnoredState.route_inventory.routable_artifact_count
    );
    assert.strictEqual(
      afterIgnoredState.route_inventory.unrouted_artifact_count,
      0
    );
  } finally {
    fs.rmSync(ignoredStatePath, { force: true });
    if (
      !ignoredStateDirExisted &&
      fs.existsSync(ignoredStateDir) &&
      fs.readdirSync(ignoredStateDir).length === 0
    ) {
      fs.rmdirSync(ignoredStateDir);
    }
  }
}

console.log(`Document routing fixtures passed: ${routedQueries} routed queries across ${ROUTERS.length} providers.`);
