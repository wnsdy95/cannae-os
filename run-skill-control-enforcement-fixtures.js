#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  buildRequiredControls,
  compileValidationCommand,
  controlReceiptMatchesExecution,
  executeValidationControl,
  reportInputDigest,
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
    name: "intermediate symlinks cannot escape the doctrine root",
    run() {
      const doctrine = path.join(temporaryRoot, "doctrine");
      const outside = path.join(temporaryRoot, "outside");
      fs.mkdirSync(doctrine);
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "escaped.js"), "process.exit(0);\n");
      fs.symlinkSync(outside, path.join(doctrine, "linked"));
      expectThrow(() => compileValidationCommand("node linked/escaped.js", doctrine), /resolves outside/);
    }
  },
  {
    name: "report digest changes with report content but ignores generated receipt refs",
    run() {
      const report = {
        id: "MWR-FIXTURE-001",
        mission_id: "MIS-FIXTURE-001",
        agent_results: [{ agent_id: "fixture-agent", summary: "original" }]
      };
      const original = reportInputDigest(report);
      const withGeneratedRefs = reportInputDigest({
        ...report,
        control_receipt_refs: [{ artifact_id: "CER-ONE", relative_path: "receipt.json", sha256: "a".repeat(64) }]
      });
      const changed = reportInputDigest({
        ...report,
        agent_results: [{ agent_id: "fixture-agent", summary: "substituted" }]
      });
      assert(original === withGeneratedRefs, "generated control receipt refs changed the report input digest");
      assert(original !== changed, "changed report content reused the same report input digest");
    }
  },
  {
    name: "successful control binds unchanged doctrine and repository state",
    run() {
      const control = compileValidationCommand("node source-map-linter.js", ROOT);
      const before = repositoryStateDigest(repository);
      const reportDigest = "1".repeat(64);
      const receipt = executeValidationControl(control, binding(), {
        doctrineRoot: ROOT,
        repository,
        now: "2026-08-11T00:00:00Z",
        receiptId: `CER-MWR-FIXTURE-001-${reportDigest.slice(0, 12)}-${control.command_sha256.slice(0, 16)}`,
        missionId: "MIS-FIXTURE-001",
        waveId: "W1",
        reportId: "MWR-FIXTURE-001",
        reportInputSha256: reportDigest
      });
      assert(receipt.status === "passed" && receipt.exit_code === 0, "successful control did not pass");
      assert(receipt.repository_state_before_sha256 === before && receipt.repository_state_after_sha256 === before,
        "receipt did not bind the exact unchanged target state");
      assert(receipt.doctrine_unchanged === true && receipt.release_authorized === false,
        "receipt authority or doctrine state drifted");
      assert(receipt.report_input_sha256 === "1".repeat(64), "receipt did not bind the report input digest");
      assert(validatePayload(receipt, "control-execution-receipt").valid, "generated pass receipt failed validation");
      const expected = {
        missionId: receipt.mission_id,
        waveId: receipt.wave_id,
        reportId: receipt.report_id,
        reportInputSha256: receipt.report_input_sha256,
        control: receipt.control,
        agentBindings: receipt.agent_bindings,
        repositoryIdentityFingerprint: receipt.repository_identity_fingerprint,
        repositoryStateSha256: receipt.repository_state_after_sha256,
        doctrineRevision: receipt.doctrine_revision,
        doctrineStateSha256: receipt.doctrine_state_after_sha256
      };
      assert(controlReceiptMatchesExecution(receipt, expected), "exact receipt could not be reused");
      for (const [field, value] of [
        ["mission_id", "MIS-SUBSTITUTED"],
        ["wave_id", "W-SUBSTITUTED"],
        ["repository_identity_fingerprint", "f".repeat(64)],
        ["doctrine_revision", "substituted"]
      ]) {
        assert(!controlReceiptMatchesExecution({ ...receipt, [field]: value }, expected),
          `receipt reuse accepted substituted ${field}`);
      }
    }
  },
  {
    name: "nonzero validation command creates a failed receipt",
    run() {
      const control = compileValidationCommand(
        "node validator-cli-prototype/validate.js sample-payloads/invalid-mission-missing-intent.json mission",
        ROOT
      );
      const reportDigest = "2".repeat(64);
      const receipt = executeValidationControl(control, binding(), {
        doctrineRoot: ROOT,
        repository,
        now: "2026-08-11T00:00:00Z",
        receiptId: `CER-MWR-FIXTURE-001-${reportDigest.slice(0, 12)}-${control.command_sha256.slice(0, 16)}`,
        missionId: "MIS-FIXTURE-001",
        waveId: "W1",
        reportId: "MWR-FIXTURE-001",
        reportInputSha256: reportDigest
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
