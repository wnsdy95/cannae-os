#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const RANK = { Green: 0, Amber: 1, Red: 2, Black: 3 };

function maxClass(classes) {
  return classes.reduce((max, item) => RANK[item] > RANK[max] ? item : max, "Green");
}

function includesAny(text, patterns) {
  const lower = String(text || "").toLowerCase();
  return patterns.some(pattern => lower.includes(pattern));
}

function decide(input) {
  const classes = ["Green"];
  const reasons = [];
  const requiredControls = [];
  const text = `${input.tool || ""} ${input.action || ""} ${input.target || ""}`;

  if (includesAny(text, ["secret", "token", "private_key", "password"])) {
    classes.push("Black");
    reasons.push("Possible secret or credential exposure.");
  }

  if (includesAny(text, ["fabricate_source", "fake citation", "bypass gateway"])) {
    classes.push("Black");
    reasons.push("Prohibited integrity or gateway bypass action.");
  }

  if (includesAny(text, ["production", "prod", "deploy", "migration", "delete", "update_production"])) {
    classes.push("Red");
    reasons.push("Production, deployment, destructive, or database mutation target.");
    requiredControls.push("explicit_user_approval", "rollback_plan", "audit_log");
  }

  if (input.roe_class === "Red") {
    classes.push("Red");
    reasons.push("Request declares Red ROE class.");
    requiredControls.push("explicit_user_approval");
  }

  if (input.roe_class === "Black") {
    classes.push("Black");
    reasons.push("Request declares Black ROE class.");
  }

  if (includesAny(text, ["package", "install", "authenticated", "preview", "api_write"])) {
    classes.push("Amber");
    reasons.push("Action changes dependency, authenticated state, preview environment, or API state.");
    requiredControls.push("approval_or_scope_check");
  }

  const roeClass = maxClass(classes);
  const allowed = roeClass === "Green" || (input.approval_status === "approved" && roeClass !== "Black");
  const approvalRequired = roeClass === "Amber" || roeClass === "Red";

  return {
    roe_class: roeClass,
    allowed,
    approval_required: approvalRequired,
    blocked: roeClass === "Black" || (!allowed && approvalRequired),
    reason: reasons.length ? reasons : ["Local low-risk action."],
    required_controls: [...new Set(requiredControls)],
    alternatives: roeClass === "Black"
      ? ["Refuse action.", "Offer safe summary or redacted alternative."]
      : approvalRequired
        ? ["Run dry-run.", "Limit target scope.", "Request action-level approval."]
        : []
  };
}

function main() {
  const [, , fileArg] = process.argv;
  if (!fileArg) {
    console.error("Usage: node policy-engine-prototype/policy-engine.js <tool-request.json>");
    process.exit(2);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  const input = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const decision = decide(input);
  console.log(JSON.stringify(decision, null, 2));
  process.exit(decision.blocked ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { decide };
