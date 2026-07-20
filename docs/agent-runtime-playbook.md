# Agent Runtime Playbook

## 0. Purpose

This document defines the procedures to follow when actually operating a military-style LLM runtime.

Audience:

- Orchestrator operators.
- Agent runtime developers.
- Internal AI tool administrators.
- Operators of documentation/coding/research automation systems.

Core principle:

```text
The runtime is not a model invoker — it is a command-and-control system.
```

## 1. Daily Startup

Confirm the following at the start of operations.

```text
1. Check active missions.
2. Check blocked tasks.
3. Check pending approvals.
4. Check failed tool requests.
5. Check evidence store sync.
6. Check changes in agent readiness.
7. Check for unresolved AAR updates.
```

Output:

```yaml
startup_brief:
  active_missions:
  pending_decisions:
  high_risk_items:
  degraded_agents:
  required_actions:
```

## 2. Mission Intake Procedure

1. Store the user request verbatim, exactly as given.
2. Write the mission statement in a single sentence.
3. Break the intent down into purpose, success, and failure.
4. Separate constraints from assumptions.
5. Assign an initial risk level.
6. Produce an OPORD draft.
7. Run the validator.
8. If there are critical issues or errors, switch to a backbrief or additional clarifying questions.

## 3. OPORD Approval Procedure

An OPORD must satisfy the following conditions before it can be tasked out.

- A mission statement exists.
- The intent's purpose exists.
- Authority allowed/approval/prohibited exists.
- CCIR exists.
- MOP/MOE exist.
- No conflict with the tool-use ROE.

Cases that may proceed without approval:

- Low risk.
- Green tool actions only.
- Public/internal data only.
- Reversible outputs.

Cases that require approval:

- Red tool action.
- External state change.
- Cost risk.
- Sensitive data.
- Irreversible action.

## 4. Tasking Procedure

1. Generate the task order from the OPORD.
2. Give each task an assigned_to, task, purpose, and deliverables.
3. S2 tasks include an evidence requirement.
4. S3 tasks include a verification requirement.
5. S4 tasks include a sustainment estimate.
6. S6 tasks include a documentation/update target.
7. Red Team tasks include an independence boundary.

## 5. Execution Loop

```text
Task received
-> Backbrief
-> Tool request
-> ROE check
-> Execute or request approval
-> Record output
-> Verify
-> SITREP
```

Conditions for halting execution:

- A CCIR occurs.
- A validator critical issue.
- A tool gateway Red/Black decision.
- An evidence conflict.
- The user changes the mission.
- A test failure with unknown blast radius.

## 6. SITREP Procedure

SITREPs are issued centered on state changes rather than on a fixed schedule.

Issuance triggers:

- Task start.
- Task completion.
- A blocked state occurs.
- A CCIR occurs.
- Approval is needed.
- Risk level rises.
- Before final verification.

Required fields:

- completed.
- in_progress.
- blocked.
- ccir.
- risk.
- next_action.

## 7. FRAGO Procedure

A FRAGO is issued when there is a change in user requirements, a source conflict, a tool failure, or a scope change.

A FRAGO must distinguish the following:

- Unchanged intent.
- Modified tasks.
- New constraints.
- Affected artifacts.
- Required confirmation.

Prohibited:

- Quietly changing the higher intent within a FRAGO.
- Overwriting the entire existing OPORD and losing the change history.

## 8. Approval Handling

When an Amber/Red tool request occurs:

1. Place the tool request in a suspended state.
2. Create an approval request.
3. Display the action, tool, target, risk, rollback, and alternatives.
4. Record the scope of user approval.
5. If approved, execute only that action.
6. If rejected, present an alternative path.

Approval expiration:

- Mission changes.
- Target changes.
- Risk level rises.
- A set time period expires.

## 9. Evidence Handling

Research tasks proceed evidence-first.

Procedure:

1. Store source metadata.
2. Extract claims.
3. Separate out interpretation.
4. Apply a reliability rating.
5. Designate the linked document.
6. Reflect it in the source map.

Prohibited:

- Writing the conclusion first and fitting sources in afterward.
- Mixing sources with interpretation.
- Deleting uncertainty.

## 10. Verification Procedure

Verification differs by task type.

| Task | Verification |
| --- | --- |
| Document writing | Links, headers, index, line count |
| Research | Source map, reliability, uncertainty |
| Code | Tests, lint, diff scope |
| Tool execution | Tool-use log, approval, rollback |
| Deployment | Preview, health check, rollback plan |

## 11. Incident Procedure

Examples of incidents:

- Output of sensitive information.
- A Red action taken without approval.
- Discovery of a false source.
- Data corruption.
- A mistaken external deployment.

Procedure:

1. Halt the affected task.
2. Write an incident SITREP.
3. Report to the Commander and the user.
4. Containment action.
5. Preserve evidence/logs.
6. Recovery or rollback.
7. AAR.
8. Update the SOP/ROE.

## 12. AAR Procedure

After mission completion:

1. Compare expected against actual.
2. Record the delta.
3. Analyze the cause.
4. Separate sustain from improve.
5. Decide whether an SOP update is needed.
6. Update the readiness ledger.
7. Update the risk register.

## 13. Shutdown Procedure

Before ending work:

- Save the state of active tasks.
- Save pending approvals.
- Save unresolved CCIRs.
- Update the source map and compendium.
- Verify README links.
- Update the next action queue.

## 14. Related Documents

- `reference-architecture.md`
- `sample-runtime-state.md`
- `tool-use-roe.md`
- `approval-ui-patterns.md`
- `military-ai-risk-register.md`
- `agent-readiness-ledger.md`
