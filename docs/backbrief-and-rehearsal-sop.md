# Backbrief and Rehearsal SOP

## 0. Purpose

This document defines, as an LLM runtime SOP, the procedure for catching distortion after an order has been issued but before execution.

Military-style dissemination does not reduce distortion "because the superior spoke in detail." Distortion is reduced because the subordinate restates the mission as understood, verifies the execution sequence through rehearsal, and, if there is a problem, revises the order or obtains a commander decision.

## 1. Terminology

| Term | Meaning | LLM Application |
| --- | --- | --- |
| Confirmation brief | Confirming understanding immediately upon receiving an order | The agent briefly restates the assigned mission and constraints |
| Backbrief | A subordinate reporting the execution plan to the superior | The agent submits planned actions, risks, and stop conditions |
| Rehearsal | Rehearsing the sequence and transition points before execution | Tool call / dry run / sequence simulation |
| Decision point | A point requiring the commander's decision | One of approve, revise, reject, FRAGO |
| Stop condition | A condition requiring an immediate stop and report | Validator failure, Red action, source conflict, etc. |

## 2. SOP Summary

```text
Receive OPORD / Task Order
-> Confirmation Brief
-> Backbrief
-> CoS Integration Check
-> Rehearsal / Dry Run
-> Commander or Policy Disposition
-> Execute / Revise / Request Approval / Abort
```

## 3. Required Backbrief Fields

A backbrief must include the following:

| Field | Question |
| --- | --- |
| commander_intent | How did I understand the higher-level intent? |
| assigned_task | What task have I been assigned? |
| purpose | Why is this task needed for the overall mission? |
| end_state | What is the completion state? |
| constraints | What must not be done? |
| planned_actions | In what order will I execute? |
| risk_controls | What risk controls will I apply? |
| stop_conditions | Under what conditions will I stop immediately? |
| approval_required_actions | Which actions cannot be taken without approval? |
| prohibited_actions | Which actions will never be taken? |
| assumptions | What assumptions am I making? |
| requested_clarifications | What should I ask about? |
| confidence | Is my understanding low/medium/high? |

Repository implementation:

- `schema-files/backbrief.schema.json`
- `sample-payloads/valid-backbrief.json`
- `runtime-demo-payloads/backbrief.json`

## 4. Backbrief Judgment Rules

| State | Judgment |
| --- | --- |
| No planned_actions | Execution prohibited |
| No stop_conditions | Execution prohibited |
| Low confidence but no clarifying questions | Requires supplementation |
| Commander decision needed but no clarifying question | Requires supplementation |
| No approval boundary | Warning; requires supplementation if high-risk task |
| No restatement of a prohibited action | Warning; requires supplementation if it involves OPSEC/Red action |

## 5. Required Rehearsal Fields

Rehearsal verifies the execution sequence.

| Field | Question |
| --- | --- |
| backbriefs | Which backbrief is this based on? |
| facilitator | Who performs the integration check? |
| rehearsal_type | Is it confirmation/backbrief/dry_run/full_dress? |
| sequence | What is the execution order and expected result? |
| friction_points | Where might it fail? |
| decision_points | At which points is a decision needed? |
| required_changes | What must be fixed before execution? |
| disposition | Is it execute/revise_order/request_approval/abort? |

Repository implementation:

- `schema-files/rehearsal.schema.json`
- `sample-payloads/valid-rehearsal.json`
- `runtime-demo-payloads/rehearsal.json`
- `rehearsal-to-ccir-router.js`
- `run-rehearsal-to-ccir-fixtures.js`

## 6. Rehearsal Judgment Rules

| State | Judgment |
| --- | --- |
| No referenced backbrief | Execution prohibited |
| No sequence | Execution prohibited |
| required_changes remain but disposition is execute | Execution prohibited |
| High/critical friction but no decision point | Execution prohibited |
| Approval disposition but no decision point | Requires supplementation |

## 7. Commander Disposition

After the rehearsal, the commander or policy engine chooses one of four options.

| Disposition | Meaning | Next Action |
| --- | --- | --- |
| Execute | Executable | Execute after passing the tool/readiness gate |
| Revise Order | Order needs revision | Revise the OPORD or task order |
| Request Approval | Approval needed | Create an approval request or decision packet |
| Abort | Stop execution | Record the reason in the SITREP/AAR |

Important: `execute` does not mean "everything is perfect"; it means "the remaining risk is controllable within the authority scope."

## 8. Short Backbrief Prompt for a Single Agent

```text
BACKBRIEF:
- I understand the commander's intent as:
- My assigned task is:
- Purpose:
- End state:
- Constraints:
- Planned actions:
- Risk controls:
- Stop conditions:
- Approval-required actions:
- Prohibited actions:
- Assumptions:
- Clarifications needed:
- Confidence:
```

## 9. Rehearsal Prompt for Multi-Agent

```text
REHEARSAL:
- Parent OPORD:
- Referenced backbriefs:
- Facilitator:
- Sequence:
  1. Actor / action / expected result / evidence
  2. Actor / action / expected result / evidence
- Friction points:
- Decision points:
- Required changes:
- Disposition: execute | revise_order | request_approval | abort
```

## 10. Runtime Gate

The following commands must pass before execution.

```bash
node validator-cli-prototype/validate.js runtime-demo-payloads/backbrief.json backbrief
node validator-cli-prototype/validate.js runtime-demo-payloads/rehearsal.json rehearsal
node orders-dissemination-runner.js
node rehearsal-to-ccir-router.js runtime-demo-payloads/rehearsal.json
```

This gate confirms the following links:

- Does the backbrief reference the current OPORD?
- Is the backbrief within the same mission?
- Does the backbrief task actually exist in the OPORD?
- Does the actor match the task assignee?
- Does it restate the commander's intent and the assigned task?
- Is the stop condition and approval boundary preserved?
- Does the rehearsal reference the backbrief?
- Are there no unresolved changes remaining under an execute disposition?
- Are friction points and decision points routed to a CCIR alert or a decision packet?

## 11. Anti-Patterns

Patterns to avoid:

- Saying only "understood" without producing planned actions.
- Making a tool call immediately without a stop condition.
- Ending the rehearsal as a summary statement instead of the actual execution sequence.
- Writing down high-risk friction but not creating a decision point.
- Judging something "executable" while required_changes remain.
- Handling an approval-needed item by "I'll tell the user later."

## 12. Source Anchors

- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf

## 13. Related Documents

- `orders-production-pipeline.md`
- `opord-annex-model.md`
- `prompt-templates.md`
- `agent-runtime-playbook.md`
- `approval-scope-policy.md`
- `risk-acceptance-authority.md`
