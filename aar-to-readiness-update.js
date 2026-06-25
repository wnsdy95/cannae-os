#!/usr/bin/env node

const fs = require("fs");

const ROLE_RULES = [
  {
    agent_id: "RED_TEAM",
    task: "hallucination and unsupported-claim detection",
    pattern: /hallucination|unsupported|unverified|source-less|출처\s*없|환각/i
  },
  {
    agent_id: "S4",
    task: "sustainment and maintenance readiness",
    pattern: /maintenance|readiness|fallback|quota|token|resource|unavailable|degraded|sustainment/i
  },
  {
    agent_id: "S6",
    task: "knowledge management and validation coverage",
    pattern: /schema|validator|fixture|source map|compendium|README|dashboard|event|coverage|artifact|문서|색인/i
  },
  {
    agent_id: "S3",
    task: "orders execution and rehearsal control",
    pattern: /opord|frago|task order|rehearsal|execution|sequence|scope|approval boundary|명령|실행/i
  },
  {
    agent_id: "S2",
    task: "public source research",
    pattern: /research|source|evidence|논문|자료|리서치/i
  }
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function flattenAar(aar) {
  return [
    ...(aar.expected || []),
    ...(aar.actual || []),
    ...(aar.delta || []),
    ...(aar.causes || []),
    ...(aar.sustain || []),
    ...(aar.improve || []),
    ...(aar.sop_updates || [])
  ].join(" ");
}

function classifyRole(aar) {
  const priorityText = [
    ...(aar.improve || []),
    ...(aar.sop_updates || []),
    ...(aar.delta || []),
    ...(aar.causes || [])
  ].join(" ");
  const fullText = `${priorityText} ${flattenAar(aar)}`;
  const scored = ROLE_RULES
    .map(rule => {
      const priorityScore = rule.pattern.test(priorityText) ? 2 : 0;
      const fullScore = rule.pattern.test(fullText) ? 1 : 0;
      return { ...rule, score: priorityScore + fullScore };
    })
    .filter(rule => rule.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0] || {
    agent_id: "COS",
    task: "cross-functional task integration"
  };
}

function hasCriticalSignal(text) {
  return /critical|blocked|failed|without approval|unsupported|hallucination|secret|restricted|unavailable|missing fallback|누락|차단|실패|환각/i.test(text);
}

function hasTrainingSignal(aar) {
  return (aar.delta || []).length > 0 || (aar.improve || []).length > 0 || (aar.causes || []).length > 0;
}

function recommendationFor(aar, text) {
  if (hasCriticalSignal(text)) {
    return {
      readiness_action: "downgrade_or_hold",
      recommended_rating: "U",
      rationale: "AAR contains critical or blocking failure signals."
    };
  }

  if (hasTrainingSignal(aar)) {
    return {
      readiness_action: "hold_and_train",
      recommended_rating: "P",
      rationale: "AAR contains improvement or delta items that need training before autonomous execution."
    };
  }

  return {
    readiness_action: "sustain_or_raise",
    recommended_rating: "T",
    rationale: "AAR contains sustain items without unresolved delta or improvement items."
  };
}

function maintenanceActions(aar) {
  const items = [...(aar.improve || []), ...(aar.sop_updates || []), ...(aar.delta || [])];
  const actions = [];

  for (const item of items) {
    const lower = item.toLowerCase();
    if (/schema|validator|fixture|test/.test(lower)) {
      actions.push({
        owner: "S6",
        action_type: "verification_update",
        description: item,
        readiness_effect: "Adds regression coverage before future autonomous execution."
      });
    } else if (/source map|compendium|readme|artifact|문서|색인/.test(lower)) {
      actions.push({
        owner: "S6",
        action_type: "knowledge_management_update",
        description: item,
        readiness_effect: "Keeps source of truth synchronized for follow-on agents."
      });
    } else if (/fallback|maintenance|readiness|resource|quota|token/.test(lower)) {
      actions.push({
        owner: "S4",
        action_type: "sustainment_update",
        description: item,
        readiness_effect: "Improves degraded-mode and repair planning."
      });
    } else {
      actions.push({
        owner: "COS",
        action_type: "sop_update",
        description: item,
        readiness_effect: "Converts AAR learning into an assigned follow-up."
      });
    }
  }

  return actions;
}

function buildUpdate(aar) {
  const text = flattenAar(aar);
  const role = classifyRole(aar);
  const recommendation = recommendationFor(aar, text);
  const evidence = [
    ...(aar.delta || []).map(item => `delta: ${item}`),
    ...(aar.causes || []).map(item => `cause: ${item}`),
    ...(aar.sustain || []).map(item => `sustain: ${item}`),
    ...(aar.improve || []).map(item => `improve: ${item}`),
    ...(aar.sop_updates || []).map(item => `sop_update: ${item}`)
  ];

  return {
    schema_version: "0.1",
    type: "AARReadinessUpdate",
    id: `ARU-${aar.id}`,
    mission_id: aar.mission_id,
    aar_id: aar.id,
    generated_at: "2026-06-18T13:20:00+09:00",
    readiness_recommendations: [
      {
        agent_id: role.agent_id,
        task: role.task,
        readiness_action: recommendation.readiness_action,
        recommended_rating: recommendation.recommended_rating,
        rationale: recommendation.rationale,
        evidence
      }
    ],
    maintenance_actions: maintenanceActions(aar),
    sop_updates: aar.sop_updates || [],
    commander_decision_required: hasCriticalSignal(text),
    ccir_triggers: hasCriticalSignal(text)
      ? ["AAR contains critical failure signals; review before restoring autonomous authority."]
      : []
  };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node aar-to-readiness-update.js <aar.json>");
    process.exit(2);
  }

  process.stdout.write(`${JSON.stringify(buildUpdate(readJson(filePath)), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { buildUpdate };
