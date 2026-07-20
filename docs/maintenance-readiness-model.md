# Maintenance Readiness Model

## 0. Purpose

In the military, sustainment and maintenance are not rear-echelon administration. They are core functions that determine operational duration, maneuverability, combat power retention, and risk acceptance.

The LLM runtime needs the same structure.

- If a tool is not ready, it cannot be executed.
- If token, quota, wall-clock, context window, file access, or network access is constrained, mission capability degrades.
- Even when a failure occurs, the mission can continue if degraded mode, fallback, and repair paths exist.
- Readiness must cover not only agent capability but also tool/resource status.

This document converts the military sustainment/maintenance principles into an LLM tool/resource readiness model.

## 1. Military concept mapping

| Military concept | Meaning | LLM runtime application |
| --- | --- | --- |
| Sustainment | The support function that enables operations to continue | Management of token, time, tool, model, storage, network, and human approval |
| Maintenance | Keeping equipment in a usable state | Confirming the operability of validators, policy engines, dashboards, event replay, APIs, and scripts |
| Operational reach | The range over which operational influence can be sustained | The extent of context window, tool availability, API quota, and source access |
| Endurance | How long the mission can be sustained | Long-running task checkpoints, handoff, cache, retry |
| Readiness | The state of being able to perform the mission | Agent readiness + tool readiness + resource readiness |
| Repair | Recovery from failure | Test failure triage, fallback script, schema patch, rollback |

## 2. Readiness dimensions

| Dimension | Question | Rating |
| --- | --- | --- |
| Agent | Is proficiency in performing the role sufficient? | T/P/U/X |
| Tool | Can the required tool be executed? | Fully/Poorly/Unavailable |
| Resource | Are token, time, quota, and file access sufficient? | Green/Amber/Red |
| Context | Does a source of truth and handoff exist? | Current/Stale/Missing |
| Verification | Does a test/validator/check exist? | Verified/Partial/Untested |
| Fallback | Is there an alternative in case of failure? | Ready/Manual/None |

Authority determination follows the minimum value. Even if the agent is T, execution is not possible if the tool is unavailable.

## 3. Maintenance readiness object

```json
{
  "asset_id": "TOOL-VALIDATOR-001",
  "asset_type": "tool",
  "owner": "S6",
  "mission_id": "M-DEMO-001",
  "readiness": "Fully",
  "last_checked_at": "2026-06-18T12:40:00+09:00",
  "check_command": "node validator-cli-prototype/run-fixtures.js",
  "last_result": "pass",
  "dependencies": ["node", "schema-files", "sample-payloads"],
  "fallback": "Manual schema review and targeted validator patch.",
  "ccir_trigger": "Validator runner fails or cannot execute."
}
```

## 4. Tool readiness classes

| Class | Condition | Execution authority |
| --- | --- | --- |
| Fully | Recent check passed, fallback exists | Normal |
| Poorly | Some checks missing, degraded mode required | Restricted after Amber report |
| Unavailable | Cannot execute, no dependency | Blocked |
| Unknown | No recent check | Report_required |

## 5. Resource readiness classes

| Class | Condition | Action |
| --- | --- | --- |
| Green | Token/time/quota sufficient | Continue |
| Amber | Approaching limit, prioritization needed | Report to CoS/S4 |
| Red | Mission failure possible | Commander decision or FRAGO |

## 6. Maintenance battle rhythm

| Point in time | Check | Output |
| --- | --- | --- |
| Mission start | Essential tool/resource availability | Readiness note |
| Before Red/Amber action | Confirm target/tool/fallback | Approval packet input |
| Phase close | Validator/policy/event/dashboard runner | Verification status |
| Failure | Fault isolation and repair | Incident SITREP |
| AAR | Analysis of repeated failures | SOP/readiness update |

## 7. Failure taxonomy

| Failure | Example | Military-style interpretation | LLM action |
| --- | --- | --- | --- |
| Tool unavailable | Node missing, API down | Equipment non-operational | Blocked, fallback |
| Tool degraded | Partial output, flaky test | Restricted operation | Amber, supervision |
| Resource exhausted | Token/quota/time shortage | Supply shortage | Priority decision |
| Context stale | README/source-map mismatch | COP mismatch | S6 KM update |
| Verification absent | No test for action | Check not performed | Rehearsal/test first |
| Approval unavailable | Red action pending | Command decision gap | Hold action |

## 8. Readiness-to-authority integration

Execution decision:

```text
can_execute =
  agent_readiness sufficient
  AND tool_readiness != Unavailable
  AND resource_readiness != Red
  AND context_status != Missing
  AND authority_matrix allows or approval exists
```

If any condition fails:

- Tool unavailable -> blocked FFIR.
- Resource Red -> commander decision point.
- Context missing -> S6 handoff/KM task.
- Verification absent -> rehearsal/test task.
- Authority missing -> approval request.

## 9. Maintenance reports

S4/S6 report format:

```text
MAINTENANCE READINESS REPORT:
- Mission:
- Critical tools:
- Unavailable/degraded assets:
- Resource constraints:
- Context freshness:
- Verification status:
- Fallback:
- Commander decision needed:
```

## 10. LLM runtime assets to track

| Asset | Owner | Check |
| --- | --- | --- |
| Validator CLI | S6 | `node validator-cli-prototype/run-fixtures.js` |
| Policy engine | S3/S6 | `node policy-engine-prototype/run-policy-fixtures.js` |
| Event replay | S6 | `node event-replay-prototype/run-event-fixtures.js` |
| Alert router | CoS/S6 | `node alert-router-prototype/run-alert-fixtures.js` |
| Readiness gate | S3/S6 | `node readiness-gate-prototype/run-readiness-fixtures.js` |
| Dashboard projection | S6 | generated state matches saved state |
| Source map | S2/S6 | link and source coverage check |

## 11. Prompt guard

```text
Confirm maintenance readiness before execution.
1. Has the required tool been verified recently?
2. Does a resource limit threaten the mission end state?
3. Is the context/source-of-truth current?
4. Is there a fallback in case of failure?
5. Classify whether the readiness issue is a commander decision or an S4/S6 repair task.
```

## 12. Implementation status and candidates

schema:

- `maintenance-readiness.schema.json`
- `resource-status.schema.json`

implemented prototype:

- `maintenance-readiness-runner.js`: executes the critical runners and generates a readiness report.
- `maintenance-dashboard-runner.js`: converts a readiness report into a ready/degraded/down dashboard projection.
- `run-maintenance-dashboard-fixtures.js`: regression-verifies the ready, degraded, and unavailable sustainment projections.
- `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`: sustainment readiness projection state that can be fed into the dashboard.

prototype candidates:

- `resource-budget-checker.js`: converts token/time/quota thresholds into a SITREP/CCIR.
- `tool-fallback-planner.js`: proposes a manual/degraded fallback for a failed tool.

## 13. Source anchors

- ADP 4-0, Sustainment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796
- FM 4-0, Sustainment Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN41683-FM_4-0-000-WEB-2.pdf
- JP 4-0, Joint Logistics: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/
- Army Publishing Directorate ATP page for maintenance publications: https://armypubs.army.mil/ProductMaps/PubForm/ATP.aspx
- Army article noting ATP 4-33 Maintenance Operations 2024: https://home.army.mil/wood/contact/publications/engr_mag/Maintenance-Moving-Forward

## 14. Current-stage conclusion

In LLM operations, "executable" does not mean that the model can produce an answer. Tools, resources, context, verification, fallback, and approval authority must all be ready together.

Applying military-style sustainment means the AI runtime always asks the following questions.

> Can this mission be started now, can it continue to be sustained, and if it breaks down, can it be recovered?
