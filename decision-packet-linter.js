#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function lintDecisionPacket(packet) {
  const findings = [];
  const optionIds = new Set((packet.options || []).map(option => option.option_id));

  if (!packet.options || packet.options.length < 2) {
    findings.push(finding("error", "TOO_FEW_OPTIONS", "Decision packet should present at least two options unless rejecting a Black action."));
  }
  if (!optionIds.has(packet.recommended_option)) {
    findings.push(finding("error", "BAD_RECOMMENDATION", "Recommended option must match an option_id."));
  }
  if (packet.decision_type === "approval" && !String(packet.commander_question || "").includes("?")) {
    findings.push(finding("warning", "QUESTION_NOT_EXPLICIT", "Approval packet commander_question should be phrased as a question."));
  }
  for (const option of packet.options || []) {
    if (!option.benefit || option.benefit.length === 0) {
      findings.push(finding("error", "OPTION_WITHOUT_BENEFIT", `${option.option_id} lacks benefit.`));
    }
    if (!option.risk || option.risk.length === 0) {
      findings.push(finding("error", "OPTION_WITHOUT_RISK", `${option.option_id} lacks risk.`));
    }
    if (!option.tradeoff || option.tradeoff.length === 0) {
      findings.push(finding("error", "OPTION_WITHOUT_TRADEOFF", `${option.option_id} lacks tradeoff.`));
    }
  }
  if (!packet.evidence || packet.evidence.length < 1) {
    findings.push(finding("error", "NO_EVIDENCE", "Decision packet must cite evidence or source-of-truth files."));
  }
  if (!packet.deadline) {
    findings.push(finding("warning", "NO_DEADLINE", "Decision packet should have a deadline."));
  }
  if (!packet.if_no_decision) {
    findings.push(finding("error", "NO_DEFAULT_ACTION", "Decision packet must state what happens if no decision is made."));
  }

  return findings;
}

function finding(severity, code, message) {
  return { severity, code, message };
}

function runSchemaValidator(filePath) {
  const validator = path.join(__dirname, "validator-cli-prototype", "validate.js");
  const result = spawnSync("node", [validator, filePath, "decision-packet"], {
    cwd: __dirname,
    encoding: "utf8"
  });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    parsed = {
      valid: false,
      issues: [finding("critical", "VALIDATOR_OUTPUT_ERROR", error.message)]
    };
  }
  return { status: result.status, parsed };
}

function main() {
  const [, , packetArg] = process.argv;
  if (!packetArg) {
    console.error("Usage: node decision-packet-linter.js <decision-packet.json>");
    process.exit(2);
  }

  const packetPath = path.resolve(process.cwd(), packetArg);
  const packet = JSON.parse(fs.readFileSync(packetPath, "utf8"));
  const schemaResult = runSchemaValidator(packetPath);
  const findings = [
    ...(schemaResult.parsed.issues || []).map(issue => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message
    })),
    ...lintDecisionPacket(packet)
  ];
  const failed = findings.some(item => item.severity === "error" || item.severity === "critical");
  const output = {
    valid: !failed,
    finding_count: findings.length,
    findings
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { lintDecisionPacket };
