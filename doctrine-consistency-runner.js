#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const CONTROL_LABELS = {
  us_not_default: "US doctrine is not the default for multinational adaptations.",
  role_alias_map_required: "Role and staff terminology requires a local alias map.",
  local_jurisdiction_review_required: "Legal, release, personal data, and real-world action analogies require local jurisdiction review.",
  source_map_update_required: "Official source families must be indexed in the source map.",
  compendium_update_required: "Research conclusions must be recorded in the compendium.",
  schema_fixture_required: "Consistency review must have schema and fixtures.",
  commander_retained_conflict_decisions: "Doctrine conflicts affecting scope, release, risk, or law remain commander-retained decisions."
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasSubstantiveItems(items) {
  return Array.isArray(items) && items.some(item => !/^none$/i.test(String(item).trim()));
}

function summarizeFindings(findings) {
  const byCategory = {};
  const byDisposition = {};
  const byRisk = {};
  for (const finding of findings || []) {
    byCategory[finding.category] = (byCategory[finding.category] || 0) + 1;
    byDisposition[finding.disposition] = (byDisposition[finding.disposition] || 0) + 1;
    byRisk[finding.consistency_risk] = (byRisk[finding.consistency_risk] || 0) + 1;
  }
  return { by_category: byCategory, by_disposition: byDisposition, by_risk: byRisk };
}

function analyzeDoctrineConsistency(review) {
  const sourceFamilies = review.source_families || [];
  const nonUsFamilies = sourceFamilies.filter(source => String(source.family_id).toUpperCase() !== "US");
  const findings = review.policy_findings || [];
  const controls = review.resolution_controls || {};
  const documentation = review.documentation_updates || {};

  const preflightBlocks = [];
  if (sourceFamilies.length < 4) {
    preflightBlocks.push("Review must compare at least four official source families.");
  }
  if (nonUsFamilies.length < 3) {
    preflightBlocks.push("Review must include at least three non-US source families.");
  }

  for (const [field, label] of Object.entries(CONTROL_LABELS)) {
    if (controls[field] !== true) {
      preflightBlocks.push(label);
    }
  }

  const unresolvedConflicts = [];
  const policyUpdateQueue = [];
  for (const finding of findings) {
    if (finding.disposition === "adopt_us_only") {
      unresolvedConflicts.push({
        finding_id: finding.finding_id,
        reason: "US-only adoption is not an allowed multinational disposition."
      });
    }
    if (finding.verification && finding.verification.status !== "verified") {
      unresolvedConflicts.push({
        finding_id: finding.finding_id,
        reason: `Verification status is ${finding.verification.status}.`
      });
    }
    if (!hasSubstantiveItems(finding.policy_update_targets)) {
      unresolvedConflicts.push({
        finding_id: finding.finding_id,
        reason: "Finding has no substantive policy update target."
      });
    }
    for (const target of finding.policy_update_targets || []) {
      if (!/^none$/i.test(String(target).trim())) {
        policyUpdateQueue.push({
          finding_id: finding.finding_id,
          target,
          risk: finding.consistency_risk,
          disposition: finding.disposition
        });
      }
    }
  }

  for (const [field, items] of Object.entries(documentation)) {
    if (!hasSubstantiveItems(items)) {
      preflightBlocks.push(`Documentation update ${field} is missing.`);
    }
  }

  if (unresolvedConflicts.length > 0) {
    preflightBlocks.push("Review has unresolved doctrine consistency conflicts.");
  }

  return {
    schema_version: "0.1",
    type: "DoctrineConsistencyProjection",
    review_id: review.id,
    status: preflightBlocks.length === 0 ? "ready" : "blocked",
    source_family_coverage: {
      total: sourceFamilies.length,
      non_us_total: nonUsFamilies.length,
      families: sourceFamilies.map(source => ({
        family_id: source.family_id,
        jurisdiction: source.jurisdiction,
        official_source_count: (source.official_source_urls || []).length,
        doctrine_scope: source.doctrine_scope || []
      }))
    },
    finding_summary: summarizeFindings(findings),
    policy_update_queue: policyUpdateQueue,
    unresolved_conflicts: unresolvedConflicts,
    required_controls: Object.entries(CONTROL_LABELS).map(([field, label]) => ({
      field,
      satisfied: controls[field] === true,
      label
    })),
    preflight_blocks: preflightBlocks
  };
}

function main() {
  const [, , reviewPath] = process.argv;
  if (!reviewPath) {
    console.error("Usage: node doctrine-consistency-runner.js <review.json>");
    process.exit(2);
  }
  const review = readJson(path.resolve(reviewPath));
  process.stdout.write(`${JSON.stringify(analyzeDoctrineConsistency(review), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { analyzeDoctrineConsistency };
