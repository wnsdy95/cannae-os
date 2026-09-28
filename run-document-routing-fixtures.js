#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const ROUTERS = [
  "codex-skills/controls-doctrine-operator/scripts/route_controls_docs.js",
  ".claude/skills/controls-doctrine-operator/scripts/route_controls_docs.js"
];

function route(router, args, query) {
  const result = spawnSync(process.execPath, [path.join(ROOT, router), ...args, query, ROOT], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
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

console.log("Document routing fixtures: 8/8 passed");
