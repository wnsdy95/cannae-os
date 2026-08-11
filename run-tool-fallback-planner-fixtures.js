#!/usr/bin/env node

const { planFallback } = require("./tool-fallback-planner");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function failureReport(overrides) {
  return {
    mission_id: "M-DEMO-001",
    mission_phase: "execute",
    owner: "S4",
    tool_id: "TOOL-VALIDATOR-001",
    failure_class: "tool_degraded",
    criticality: "medium",
    summary: "Validator runner returns partial output on large payloads.",
    ...overrides
  };
}

const capabilities = {
  tools: [
    {
      tool_id: "TOOL-VALIDATOR-001",
      degraded_alternatives: [
        {
          alternative_id: "ALT-VALIDATOR-SINGLE",
          description: "Validate one payload at a time with the single-file validator path.",
          constraints: ["Batch validation disabled; validate payloads one by one."],
          data_loss_risk: "low",
          authority_conditions: {
            named_in_readiness_report: true,
            output_within_acceptance_criteria: true,
            deadline_unchanged: true,
            cost_cap_unchanged: true,
            risk_decision_unchanged: true,
            next_sitrep_report_required: true
          }
        }
      ],
      manual_procedure: {
        reference: "docs/maintenance-readiness-model.md",
        description: "Manual schema review and targeted validator patch.",
        constraints: ["Two-person review of every manually accepted payload."],
        data_loss_risk: "medium"
      }
    },
    {
      tool_id: "TOOL-DEPLOY-001",
      degraded_alternatives: [],
      manual_procedure: {
        reference: "docs/maintenance-readiness-model.md",
        description: "Manual deployment checklist executed by S6 with commander oversight.",
        constraints: ["No automated rollback; snapshot state before each step."],
        data_loss_risk: "high"
      }
    }
  ]
};

const fixtures = [
  {
    name: "degraded alternative chosen with degraded-mode constraints",
    report: failureReport({}),
    verify(plan) {
      assert(plan.outcome === "degraded", "expected degraded outcome");
      assert(plan.fallback_chain[0].mode === "degraded", "expected degraded step first");
      assert(plan.fallback_chain[0].reference === "ALT-VALIDATOR-SINGLE", "expected the degraded alternative chosen");
      assert(plan.fallback_chain.some(step => step.mode === "manual"), "expected manual procedure as last resort");
      assert(plan.execution_authority === "Restricted after Amber report", "expected restricted execution authority");
      assert(plan.degraded_mode_constraints.some(text => /Amber report/.test(text)), "expected Amber report constraint");
      assert(plan.degraded_mode_constraints.some(text => /one by one/.test(text)), "expected alternative constraint carried over");
      assert(plan.commander_decision_required === false, "medium criticality must not force commander decision");
      assert(plan.escalation === null, "did not expect escalation");
    }
  },
  {
    name: "high data-loss fallback requires commander decision regardless of mission criticality",
    report: failureReport({
      tool_id: "TOOL-DEPLOY-001",
      failure_class: "tool_unavailable",
      criticality: "medium"
    }),
    verify(plan) {
      assert(plan.data_loss_risk === "high", "expected high data loss risk");
      assert(plan.commander_decision_required === true, "high-loss fallback must require commander decision");
      assert(plan.execution_authority === "Blocked pending COMMANDER decision", "fallback must remain blocked");
      assert(plan.next_actions.some(text => /do not execute until approved/.test(text)), "expected approval hold action");
    }
  },
  {
    name: "quality or schedule effects require commander decision",
    report: failureReport({ criticality: "low" }),
    capabilities: {
      tools: [{
        tool_id: "TOOL-VALIDATOR-001",
        degraded_alternatives: [{
          alternative_id: "ALT-UNBOUNDED",
          description: "Return a partial validation result.",
          data_loss_risk: "low",
          authority_conditions: {
            named_in_readiness_report: true,
            output_within_acceptance_criteria: false,
            deadline_unchanged: true,
            cost_cap_unchanged: true,
            risk_decision_unchanged: true,
            next_sitrep_report_required: true
          }
        }]
      }]
    },
    verify(plan) {
      assert(plan.commander_decision_required === true, "changed acceptance criteria must require commander decision");
      assert(plan.execution_authority === "Blocked pending COMMANDER decision", "changed mission effects must block execution");
    }
  },
  {
    name: "high criticality with data loss risk requires commander decision",
    report: failureReport({
      tool_id: "TOOL-DEPLOY-001",
      failure_class: "tool_unavailable",
      criticality: "high",
      summary: "Deployment pipeline is down before the release phase."
    }),
    verify(plan) {
      assert(plan.outcome === "manual", "expected manual outcome");
      assert(plan.data_loss_risk === "high", "expected high data loss risk");
      assert(plan.commander_decision_required === true, "expected commander decision");
      assert(plan.decision_packet_candidate !== null, "expected decision packet candidate");
      assert(plan.decision_packet_candidate.decision_type === "risk_acceptance", "expected risk acceptance packet");
      assert(plan.decision_packet_candidate.authority_required.includes("COMMANDER"), "expected commander authority");
      assert(plan.next_actions.some(text => /do not execute until approved/.test(text)), "expected hold-until-approved action");
    }
  },
  {
    name: "no fallback produces blocked outcome and escalation",
    report: failureReport({
      tool_id: "TOOL-UNKNOWN-001",
      failure_class: "tool_unavailable",
      criticality: "high",
      summary: "Tool has no registered fallback capability."
    }),
    verify(plan) {
      assert(plan.outcome === "blocked", "expected blocked outcome");
      assert(plan.fallback_chain.length === 0, "expected empty fallback chain");
      assert(plan.tool_readiness === "Unavailable", "expected Unavailable tool readiness");
      assert(plan.execution_authority === "Blocked", "expected Blocked execution authority");
      assert(plan.escalation !== null && plan.escalation.required === true, "expected escalation");
      assert(plan.escalation.ccir_type === "FFIR" && plan.escalation.blocks_execution === true, "expected blocking FFIR escalation");
      assert(plan.commander_decision_required === true, "expected commander decision");
      assert(plan.next_actions.some(text => /blocked FFIR/.test(text)), "expected blocked FFIR next action");
    }
  }
];

let passed = 0;

for (const fixture of fixtures) {
  try {
    const plan = planFallback(fixture.report, fixture.capabilities || capabilities);
    fixture.verify(plan);
    passed += 1;
    console.log(`PASS ${fixture.name}`);
  } catch (error) {
    console.error(`FAIL ${fixture.name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

try {
  planFallback(failureReport({}), {
    tools: [{
      tool_id: "TOOL-VALIDATOR-001",
      degraded_alternatives: [{
        alternative_id: "ALT-UNKNOWN-RISK",
        description: "Unclassified fallback.",
        data_loss_risk: "catastrophic"
      }]
    }]
  });
  console.error("FAIL unknown data-loss risk is rejected");
  process.exitCode = 1;
} catch (error) {
  if (!/UNKNOWN_DATA_LOSS_RISK/.test(error.message)) {
    console.error("FAIL unknown data-loss risk is rejected");
    console.error(error.message);
    process.exitCode = 1;
  } else {
    passed += 1;
    fixtures.push({ name: "unknown data-loss risk is rejected" });
    console.log("PASS unknown data-loss risk is rejected");
  }
}

console.log(JSON.stringify({ total: fixtures.length, passed, failed: fixtures.length - passed }, null, 2));
