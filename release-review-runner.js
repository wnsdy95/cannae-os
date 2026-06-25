#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { filterContext } = require("./context-filter-prototype/context-filter");

const MODE_RANK = {
  denied: 0,
  reference_only: 1,
  redacted: 2,
  summary: 3,
  raw: 4
};

const RELEASE_TARGETS = new Set(["final_output", "external_tool", "partner_release", "internal_handoff"]);

function normalizeReleaseTarget(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return RELEASE_TARGETS.has(normalized) ? normalized : null;
}

function contextFilterTarget(value) {
  const normalized = normalizeReleaseTarget(value);
  if (normalized === "final_output") return "FINAL_OUTPUT";
  return String(value || "").trim();
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function runValidator(reviewPath) {
  const result = spawnSync("node", ["validator-cli-prototype/validate.js", reviewPath, "release-review"], {
    cwd: __dirname,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return [{ severity: "error", code: "RELEASE_REVIEW_SCHEMA_FAIL", message: result.stdout || result.stderr }];
  }
  return [];
}

function evaluateRelease(review, filteredPacket, requestedTarget = filteredPacket.target) {
  const findings = [];
  const reviewItems = new Map((review.items || []).map(item => [item.item_id, item]));
  const reviewTarget = normalizeReleaseTarget(review.target);
  const packetTarget = normalizeReleaseTarget(requestedTarget || filteredPacket.target);

  if (!reviewTarget || !packetTarget || reviewTarget !== packetTarget) {
    findings.push({
      severity: "error",
      code: "RELEASE_REVIEW_TARGET_MISMATCH",
      message: `Release review target ${review.target || "unknown"} does not match requested release target ${requestedTarget || filteredPacket.target || "unknown"}.`
    });
  }

  for (const packetItem of filteredPacket.items || []) {
    const reviewed = reviewItems.get(packetItem.item_id);
    if (!reviewed) {
      findings.push({
        severity: "error",
        code: "UNREVIEWED_CONTEXT_ITEM",
        message: `${packetItem.item_id} is present in filtered packet but missing from release review.`
      });
      continue;
    }

    if (MODE_RANK[reviewed.delivery_mode] > MODE_RANK[packetItem.delivery_mode]) {
      findings.push({
        severity: "error",
        code: "REVIEW_MORE_PERMISSIVE_THAN_FILTER",
        message: `${packetItem.item_id} review mode ${reviewed.delivery_mode} exceeds filter mode ${packetItem.delivery_mode}.`
      });
    }

    if ((packetItem.eefi || packetItem.classification === "restricted") && reviewed.delivery_mode !== "denied") {
      findings.push({
        severity: "critical",
        code: "RESTRICTED_ITEM_NOT_DENIED",
        message: `${packetItem.item_id} is restricted/EEFI and must be denied for final release.`
      });
    }
  }

  if (reviewTarget === "final_output" && (!review.output_constraints || review.output_constraints.length === 0)) {
    findings.push({
      severity: "error",
      code: "FINAL_RELEASE_WITHOUT_CONSTRAINTS",
      message: "Final output release review must state output constraints."
    });
  }

  return findings;
}

function run(reviewPath, contextItemsPath, target = "FINAL_OUTPUT") {
  const review = loadJson(reviewPath);
  const items = loadJson(contextItemsPath);
  const filtered = filterContext(items, contextFilterTarget(target));
  const findings = [
    ...runValidator(reviewPath),
    ...evaluateRelease(review, filtered, target)
  ];
  return {
    valid: !findings.some(item => item.severity === "error" || item.severity === "critical"),
    finding_count: findings.length,
    target,
    findings
  };
}

function main() {
  const [, , reviewArg = "sample-payloads/valid-release-review.json", contextArg = "context-filter-prototype/context-items.demo.json", targetArg = "FINAL_OUTPUT"] = process.argv;
  const result = run(reviewArg, contextArg, targetArg);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { run, evaluateRelease, normalizeReleaseTarget, contextFilterTarget };
