#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const { compileModelAssignment } = require("./model-assignment-compiler");
const { analyzeModelForceAssignment } = require("./model-force-assignment-runner");
const { analyzeIntegratedMissionPreflight } = require("./integrated-mission-preflight-runner");

const ROOT = __dirname;

function readJson(relativePath) {
  return require(path.join(ROOT, relativePath));
}

function validate(file, type, expectedCode, requiredCodes = []) {
  const result = spawnSync("node", ["validator-cli-prototype/validate.js", file, type], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(result.status, expectedCode, result.stdout || result.stderr);
  const parsed = JSON.parse(result.stdout);
  const codes = new Set((parsed.issues || []).map(item => item.code));
  for (const code of requiredCodes) assert(codes.has(code), `expected validator issue ${code}`);
}

const validRegistry = readJson("sample-payloads/valid-model-registry.json");
const validRequest = readJson("sample-payloads/valid-model-assignment-request.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const fixtures = [
  {
    name: "registry and assignment request compile a mixed force",
    run() {
      validate("sample-payloads/valid-model-registry.json", "model-registry", 0);
      validate("sample-payloads/valid-model-assignment-request.json", "model-assignment-request", 0);
      const compilation = compileModelAssignment(validRegistry, validRequest);
      assert.strictEqual(compilation.status, "compiled");
      assert.strictEqual(compilation.preflight_blocks.length, 0);
      assert.strictEqual(compilation.plan.billets.find(item => item.force_class === "command").model_profile_id, "MP-COMMAND-01");
      assert.strictEqual(compilation.plan.billets.find(item => item.force_class === "line").model_profile_id, "MP-LINE-01");
      assert.strictEqual(compilation.plan.billets.find(item => item.force_class === "sof").model_profile_id, "MP-SPECIALIST-01");
      assert.strictEqual(compilation.plan.billets.find(item => item.force_class === "assurance").model_profile_id, "MP-ASSURANCE-01");
      assert.strictEqual(new Set(compilation.plan.pace ? [compilation.plan.pace.primary_profile_id, compilation.plan.pace.alternate_profile_id, compilation.plan.pace.contingency_profile_id] : []).size, 3);
      assert.strictEqual(analyzeModelForceAssignment(compilation.plan).assignment_status, "ready");
    }
  },
  {
    name: "unsafe registry cannot self-certify readiness",
    run() {
      validate("sample-payloads/invalid-model-registry-unready.json", "model-registry", 1, [
        "MODEL_REGISTRY_FLOATING_IDENTITY",
        "MODEL_REGISTRY_FLOATING_VERSION",
        "MODEL_REGISTRY_SECRET_IN_ENDPOINT_REF",
        "MODEL_REGISTRY_READY_WITHOUT_EVIDENCE",
        "MODEL_REGISTRY_EXPIRED_READINESS",
        "MODEL_REGISTRY_DUPLICATE_TASK_READINESS",
        "MODEL_REGISTRY_INVALID_OWNER",
        "MODEL_REGISTRY_HUMAN_AUTHORITY_MISSING"
      ]);
      const compilation = compileModelAssignment(readJson("sample-payloads/invalid-model-registry-unready.json"), validRequest);
      assert.strictEqual(compilation.status, "blocked");
      assert(compilation.preflight_blocks.some(item => /registry must preserve human final decision authority/i.test(item)));
      assert(compilation.preflight_blocks.some(item => /duplicate readiness record/i.test(item)));
    }
  },
  {
    name: "Black authority-inheriting request is blocked",
    run() {
      validate("sample-payloads/invalid-model-assignment-request-unsafe.json", "model-assignment-request", 1, [
        "MODEL_REQUEST_WEIGHTS_NOT_100",
        "MODEL_REQUEST_REGISTRY_VERSION_FLOATING",
        "MODEL_REQUEST_CLASSIFICATION_MISMATCH",
        "MODEL_REQUEST_BLACK_PROHIBITED",
        "MODEL_REQUEST_UNREADY_TARGET",
        "MODEL_REQUEST_WITHOUT_DEPLOYMENT_BOUNDARY",
        "MODEL_REQUEST_WITHOUT_READY_ROUTER",
        "MODEL_REQUEST_MISSING_COMMAND",
        "MODEL_REQUEST_REQUIRES_ASSURANCE",
        "MODEL_REQUEST_AUTHORITY_FROM_MODEL",
        "MODEL_REQUEST_HUMAN_AUTHORITY_MISSING"
      ]);
      const compilation = compileModelAssignment(validRegistry, readJson("sample-payloads/invalid-model-assignment-request-unsafe.json"));
      assert.strictEqual(compilation.status, "blocked");
      assert(compilation.preflight_blocks.some(item => /Black missions/.test(item)));
      assert(compilation.preflight_blocks.some(item => /Human final decision authority/.test(item)));
    }
  },
  {
    name: "assignment request cannot be replayed against another registry snapshot",
    run() {
      const request = clone(validRequest);
      request.registry_version = "2026-07-20.2";
      const compilation = compileModelAssignment(validRegistry, request);
      assert.strictEqual(compilation.status, "blocked");
      assert(compilation.preflight_blocks.some(item => /exact model registry ID and version/.test(item)));
    }
  },
  {
    name: "secret-bearing endpoint is ineligible even without validator preflight",
    run() {
      const registry = clone(validRegistry);
      registry.profiles.find(item => item.id === "MP-COMMAND-01").endpoint_ref = "https://endpoint.invalid?api_key=plaintext-secret";
      const compilation = compileModelAssignment(registry, validRequest);
      assert.strictEqual(compilation.status, "blocked");
      const commandRanking = compilation.candidate_rankings.find(item => item.billet_id === "BILLET-COMMAND-V2");
      const commandProfile = commandRanking.candidates.find(item => item.profile_id === "MP-COMMAND-01");
      assert(commandProfile.reasons.includes("endpoint reference contains secret material"));
    }
  },
  {
    name: "integrated preflight emits dispatch and telemetry manifests",
    run() {
      validate("sample-payloads/valid-integrated-mission-preflight.json", "integrated-mission-preflight", 0);
      validate("sample-payloads/valid-model-usage-event.json", "model-usage-event", 0);
      const projection = analyzeIntegratedMissionPreflight(readJson("sample-payloads/valid-integrated-mission-preflight.json"), ROOT);
      assert.strictEqual(projection.status, "ready");
      assert.strictEqual(projection.routing_status, "ready");
      assert.strictEqual(projection.model_assignment_status, "ready");
      assert.strictEqual(projection.dispatch_manifest.length, 3);
      assert.strictEqual(projection.usage_event_templates.length, 3);
      assert.strictEqual(new Set(projection.dispatch_manifest.map(item => item.model_family)).size, 3);
      assert(projection.dispatch_manifest.every(item => item.endpoint_ref.startsWith("model-endpoints/")));
      assert(projection.dispatch_manifest.every(item => item.system_prompt_version && item.tool_schema_version));
      assert(projection.usage_event_templates.every(item => item.registry_id && item.assignment_request_id && item.compiled_plan_id));
      assert(projection.usage_event_templates.every(item => item.system_prompt_version && item.tool_schema_version));
      assert(projection.commander_queue.some(item => /external release/i.test(item.item)));
    }
  },
  {
    name: "unbound integrated preflight cannot dispatch",
    run() {
      validate("sample-payloads/invalid-integrated-mission-preflight-unbound.json", "integrated-mission-preflight", 1, [
        "INTEGRATED_PREFLIGHT_PATH_TRAVERSAL",
        "INTEGRATED_PREFLIGHT_HUMAN_AUTHORITY_MISSING"
      ]);
      const projection = analyzeIntegratedMissionPreflight(readJson("sample-payloads/invalid-integrated-mission-preflight-unbound.json"), ROOT);
      assert.strictEqual(projection.status, "blocked");
      assert.strictEqual(projection.dispatch_manifest.length, 0);
      assert(projection.preflight_blocks.some(item => /routing: Missing agent routing receipt/.test(item)));
      assert(projection.preflight_blocks.some(item => /unknown compiled billet/.test(item)));
    }
  },
  {
    name: "self-authorized telemetry is rejected",
    run() {
      validate("sample-payloads/invalid-model-usage-event-self-authorized.json", "model-usage-event", 1, [
        "MODEL_USAGE_FLOATING_VERSION",
        "MODEL_USAGE_WITHOUT_AUTHORITY_SNAPSHOT",
        "MODEL_USAGE_WITHOUT_EXTERNAL_EVIDENCE"
      ]);
    }
  }
];

let passed = 0;
for (const fixture of fixtures) {
  try {
    fixture.run();
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

console.log(`Model force v0.2 fixtures: ${passed}/${fixtures.length} passed`);
