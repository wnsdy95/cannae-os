#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  buildRequiredControls,
  compileValidationCommand,
  executeValidationControl,
  repositoryStateDigest
} = require("./skill-mission-controller");
const { validatePayload } = require("./validator-cli-prototype/validate");

const ROOT = __dirname;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runGit(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "git failed").trim());
}

function expectThrow(fn, pattern) {
  let error = null;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert(error && pattern.test(error.message), `Expected error ${pattern}, received ${error && error.message}`);
}

function binding() {
  return [{
    agent_id: "fixture-agent",
    context_pack_ref: {
      artifact_id: "ACP-FIXTURE-001",
      relative_path: "fixture/context.json",
      sha256: "a".repeat(64)
    }
  }];
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cannae-control-enforcement-"));
const repository = path.join(temporaryRoot, "repository");
fs.mkdirSync(repository, { recursive: true });
runGit(repository, ["init", "-q"]);
runGit(repository, ["config", "user.email", "fixtures@example.com"]);
runGit(repository, ["config", "user.name", "Fixture Runner"]);
fs.writeFileSync(path.join(repository, "README.md"), "control enforcement fixture\n");
runGit(repository, ["add", "README.md"]);
runGit(repository, ["commit", "-qm", "initial fixture state"]);

const fixtures = [
  {
    name: "routed commands compile to unique shell-free controls",
    run() {
      const controls = buildRequiredControls([
        "node source-map-linter.js",
        "node source-map-linter.js",
        "node validator-cli-prototype/validate.js sample-payloads/valid-mission.json mission"
      ], ROOT);
      assert(controls.length === 2, "duplicate control command was not removed");
      assert(controls.every(control => control.shell === false), "compiled control enabled a shell");
      assert(controls.every(control => /^[a-f0-9]{64}$/.test(control.command_sha256)), "control digest missing");
    }
  },
  {
    name: "shell operators and unallowlisted runners are rejected",
    run() {
      expectThrow(() => compileValidationCommand("node source-map-linter.js; rm -rf .", ROOT), /forbidden shell operator/);
      expectThrow(() => compileValidationCommand("bash source-map-linter.js", ROOT), /not allowlisted/);
    }
  },
  {
    name: "successful control binds unchanged doctrine and repository state",
    run() {
      const control = compileValidationCommand("node source-map-linter.js", ROOT);
      const before = repositoryStateDigest(repository);
      const receipt = executeValidationControl(control, binding(), {
        doctrineRoot: ROOT,
        repository,
        now: "2026-08-11T00:00:00Z",
        receiptId: "CER-FIXTURE-PASS",
        missionId: "MIS-FIXTURE-001",
        waveId: "W1",
        reportId: "MWR-FIXTURE-001"
      });
      assert(receipt.status === "passed" && receipt.exit_code === 0, "successful control did not pass");
      assert(receipt.repository_state_before_sha256 === before && receipt.repository_state_after_sha256 === before,
        "receipt did not bind the exact unchanged target state");
      assert(receipt.doctrine_unchanged === true && receipt.release_authorized === false,
        "receipt authority or doctrine state drifted");
      assert(validatePayload(receipt, "control-execution-receipt").valid, "generated pass receipt failed validation");
    }
  },
  {
    name: "nonzero validation command creates a failed receipt",
    run() {
      const control = compileValidationCommand(
        "node validator-cli-prototype/validate.js sample-payloads/invalid-mission-missing-intent.json mission",
        ROOT
      );
      const receipt = executeValidationControl(control, binding(), {
        doctrineRoot: ROOT,
        repository,
        now: "2026-08-11T00:00:00Z",
        receiptId: "CER-FIXTURE-FAIL",
        missionId: "MIS-FIXTURE-001",
        waveId: "W1",
        reportId: "MWR-FIXTURE-001"
      });
      assert(receipt.status === "failed" && receipt.failure_code === "PROCESS_FAILED",
        "nonzero command did not produce a failed receipt");
      assert(validatePayload(receipt, "control-execution-receipt").valid, "generated failure receipt is not a valid record");
    }
  }
];

let passed = 0;
try {
  for (const fixture of fixtures) {
    try {
      fixture.run();
      passed += 1;
      console.log(`PASS ${fixture.name}`);
    } catch (error) {
      console.error(`FAIL ${fixture.name}`);
      console.error(error.message);
      process.exitCode = 1;
    }
  }
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({ total: fixtures.length, passed, failed: fixtures.length - passed }, null, 2));
