#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const DETECTOR = path.join(__dirname, "eefi-detector.js");

const SECRET_VALUE = "db password is hunter2-swordfish-9";
const SECRET_SUBSTRING = "hunter2-swordfish-9";
const CUSTOM_TERM_OUTPUT = "Operation Longwatch";
const CUSTOM_TERM_TOOL = "10.20.30.40";

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function writeFixture(dir, name, value) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function buildFixtures(dir) {
  return {
    cleanPayload: writeFixture(dir, "clean-payload.json", {
      mission_id: "M-DEMO-001",
      summary: "TR-DEMO-002 is blocked pending commander approval.",
      steps: [{ owner: "S3", note: "Plan the execution window." }]
    }),
    builtinPayload: writeFixture(dir, "builtin-credential-payload.json", {
      mission_id: "M-DEMO-001",
      steps: [
        { owner: "S3", note: "Plan the execution window." },
        { owner: "S6", tool_output: SECRET_VALUE }
      ]
    }),
    opaqueCredentialFieldPayload: writeFixture(dir, "opaque-credential-field-payload.json", {
      mission_id: "M-DEMO-001",
      password: "hunter2",
      token_budget: 12000
    }),
    benignTokenBudgetPayload: writeFixture(dir, "benign-token-budget-payload.json", {
      mission_id: "M-DEMO-001",
      resource_class: "token_budget",
      token_budget: 12000,
      summary: "Token budget remains inside the approved resource envelope."
    }),
    customPayload: writeFixture(dir, "custom-eefi-payload.json", {
      mission_id: "M-DEMO-001",
      briefing: `Codename ${CUSTOM_TERM_OUTPUT} moves to phase two.`,
      tool_target: `https://${CUSTOM_TERM_TOOL}/deploy`
    }),
    customList: writeFixture(dir, "custom-eefi-list.json", [
      { id: "EEFI-CUSTOM-OPNAME", term: CUSTOM_TERM_OUTPUT, class: "output_forbidden" },
      { id: "EEFI-CUSTOM-ENDPOINT", term: CUSTOM_TERM_TOOL, class: "tool_transfer_forbidden" }
    ])
  };
}

function runDetector(args) {
  const result = spawnSync(process.execPath, [DETECTOR, ...args], { encoding: "utf8" });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }
  return { status: result.status, stdout: result.stdout, parsed };
}

function buildCases(fixtures) {
  return [
    {
      name: "clean payload passes with built-in EEFI defaults",
      args: [fixtures.cleanPayload],
      exitCode: 0,
      assert(run) {
        if (!run.parsed || run.parsed.valid !== true) return "expected valid report";
        if (run.parsed.finding_count !== 0) return "expected zero findings";
        return null;
      }
    },
    {
      name: "built-in credential pattern caught with digest-only finding",
      args: [fixtures.builtinPayload],
      exitCode: 1,
      assert(run) {
        if (!run.parsed || run.parsed.valid !== false) return "expected invalid report";
        const finding = (run.parsed.findings || []).find(item => item.eefi_id === "EEFI-DEFAULT-PASSWORD");
        if (!finding) return "expected EEFI-DEFAULT-PASSWORD finding";
        if (finding.code !== "EEFI_OUTPUT_FORBIDDEN") return "expected EEFI_OUTPUT_FORBIDDEN code";
        if (finding.class !== "output_forbidden") return "expected output_forbidden class";
        if (finding.json_path !== "$.steps[1].tool_output") return `unexpected json_path ${finding.json_path}`;
        if (finding.value_sha256 !== sha256(SECRET_VALUE)) return "expected sha256 digest of matched value";
        return null;
      }
    },
    {
      name: "credential-shaped field catches an opaque value without matching benign metadata",
      args: [fixtures.opaqueCredentialFieldPayload],
      exitCode: 1,
      assert(run) {
        const findings = (run.parsed && run.parsed.findings) || [];
        const finding = findings.find(item => item.eefi_id === "EEFI-DEFAULT-PASSWORD");
        if (!finding || finding.json_path !== "$.password") return "expected password field finding";
        if (findings.some(item => item.json_path === "$.token_budget")) return "token_budget must not be treated as EEFI";
        if (run.stdout.includes("hunter2")) return "detector output leaked the credential value";
        return null;
      }
    },
    {
      name: "token budget metadata does not trigger built-in token detection",
      args: [fixtures.benignTokenBudgetPayload],
      exitCode: 0,
      assert(run) {
        if (!run.parsed || run.parsed.finding_count !== 0) return "expected no findings for token budget metadata";
        return null;
      }
    },
    {
      name: "custom EEFI term caught with correct class and item id",
      args: [fixtures.customPayload, fixtures.customList],
      exitCode: 1,
      assert(run) {
        const finding = (run.parsed && run.parsed.findings || []).find(item => item.eefi_id === "EEFI-CUSTOM-OPNAME");
        if (!finding) return "expected EEFI-CUSTOM-OPNAME finding";
        if (finding.class !== "output_forbidden") return "expected output_forbidden class";
        if (finding.code !== "EEFI_OUTPUT_FORBIDDEN") return "expected EEFI_OUTPUT_FORBIDDEN code";
        if (finding.json_path !== "$.briefing") return `unexpected json_path ${finding.json_path}`;
        return null;
      }
    },
    {
      name: "tool_transfer_forbidden distinguished from output_forbidden",
      args: [fixtures.customPayload, fixtures.customList],
      exitCode: 1,
      assert(run) {
        const findings = (run.parsed && run.parsed.findings) || [];
        const toolFinding = findings.find(item => item.eefi_id === "EEFI-CUSTOM-ENDPOINT");
        if (!toolFinding) return "expected EEFI-CUSTOM-ENDPOINT finding";
        if (toolFinding.class !== "tool_transfer_forbidden") return "expected tool_transfer_forbidden class";
        if (toolFinding.code !== "EEFI_TOOL_TRANSFER_FORBIDDEN") return "expected EEFI_TOOL_TRANSFER_FORBIDDEN code";
        const codes = new Set(findings.map(item => item.code));
        if (!codes.has("EEFI_OUTPUT_FORBIDDEN") || !codes.has("EEFI_TOOL_TRANSFER_FORBIDDEN")) {
          return "expected both EEFI classes reported in one run";
        }
        return null;
      }
    },
    {
      name: "findings JSON never contains the matched secret value",
      args: [fixtures.builtinPayload],
      exitCode: 1,
      assert(run) {
        if (run.stdout.includes(SECRET_SUBSTRING) || run.stdout.includes(SECRET_VALUE)) {
          return "detector output leaked the matched secret value";
        }
        return null;
      }
    },
    {
      name: "custom EEFI terms never appear in detector output",
      args: [fixtures.customPayload, fixtures.customList],
      exitCode: 1,
      assert(run) {
        if (run.stdout.includes(CUSTOM_TERM_OUTPUT) || run.stdout.includes(CUSTOM_TERM_TOOL)) {
          return "detector output leaked a matched EEFI term";
        }
        return null;
      }
    }
  ];
}

function main() {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "eefi-detector-fixtures-"));
  let results;
  try {
    const fixtures = buildFixtures(fixtureDir);
    results = buildCases(fixtures).map(testCase => {
      const run = runDetector(testCase.args);
      let failure = run.status === testCase.exitCode ? null : `expected exit ${testCase.exitCode}, got ${run.status}`;
      if (!failure) failure = testCase.assert(run);
      return { name: testCase.name, ok: !failure, failure, stdout: run.stdout };
    });
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}`);
    if (!result.ok) {
      console.log(`  ${result.failure}`);
      console.log(result.stdout);
    }
  }

  const failed = results.filter(result => !result.ok);
  console.log(JSON.stringify({
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length
  }, null, 2));

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
