# Command Post Dashboard

## 0. Purpose

This document defines the screen design of the command post dashboard for the military-style LLM runtime.

The Dashboard is not a fancy monitoring screen — it is a screen built to let the commander make decisions. What information to show and what information to hide must be clearly distinguished.

## 1. Core Screens

| Screen | Purpose |
| --- | --- |
| Mission Board | Check current mission status and intent |
| Approval Queue | Process tool actions requiring approval |
| CCIR Alerts | Information requiring immediate reporting |
| Evidence Viewer | Track claims and sources |
| Tool Use Log | Audit tool execution |
| Risk Board | Active risks and controls |
| Readiness Board | Readiness by agent |
| AAR Library | Learning and SOP updates |

## 2. Mission Board

Fields:

- mission id.
- mission statement.
- commander's intent.
- status.
- active tasks.
- next decision point.
- current risk level.
- latest SITREP.

Display principles:

- Mission and intent are always pinned at the top.
- Blocked/decision required is shown with priority over task count.
- Risk and decision points are emphasized over completion rate.

## 3. Approval Queue

Card fields:

```text
Action:
Actor:
Tool:
Target:
ROE:
Why needed:
Risk:
Rollback:
Alternatives:
Approval scope:
```

Buttons:

- Approve once.
- Dry-run only.
- Revise request.
- Reject.

Prohibited:

- An "Approve all" default button.
- Approval without a risk.
- Approval without a target.

## 4. CCIR Alerts

Priority:

1. EEFI / secret exposure.
2. Red/Black tool issue.
3. mission/intent conflict.
4. evidence conflict.
5. blocked task requiring decision.

Alert example:

```text
EEFI detected
Mission: M-001
Agent: S2
Issue: Possible API token found in file.
Action: Output suppressed. Awaiting user decision.
```

## 5. Evidence Viewer

Functions:

- Link claims to sources.
- Display reliability rating.
- Separate out interpretation.
- Display linked documents.
- Display checked_at.

Purpose:

- Let the commander immediately confirm "where did this claim come from."
- Let the Red Team quickly find unsupported claims.

## 6. Tool Use Log

Fields:

- timestamp.
- actor.
- tool.
- action.
- target.
- ROE class.
- approval id.
- result.
- rollback.

Filters:

- Red/Black.
- failed.
- approval required.
- external effect.
- sensitive data.

## 7. Risk Board

Displays:

- active high/critical risks.
- owner.
- controls.
- next review.
- linked CCIR.
- residual risk.

A good risk card:

```text
R-003 Unauthorized high-risk action
Level: Critical
Control: Tool gateway blocks Red without approval
Status: Active
Last event: none
```

## 8. Readiness Board

Displays:

- agent.
- task.
- rating.
- evidence.
- limitations.
- next training.

Usage:

- Check readiness before task assignment.
- P/U/X agents require backbrief or supervision.

## 9. AAR Library

Displays:

- mission.
- expected vs actual.
- delta.
- causes.
- SOP updates.
- readiness changes.

Purpose:

- Prevent the same failure from recurring.
- Improve SOPs and policy engine rules.

## 10. Dashboard Anti-Patterns

| Anti-pattern | Problem | Correction |
| --- | --- | --- |
| Completion-rate focus | Hides risk and decision points | Prioritize decision required |
| Excessive log exposure | Impedes command judgment | High signal filter |
| approval fatigue | Approving every action | Queue by ROE class |
| source hidden | Difficult to verify claims | evidence viewer |
| AAR buried | Learning is lost | AAR update panel |

## 11. Related Documents

- `approval-ui-patterns.md`
- `reference-architecture.md`
- `sample-runtime-state.md`
- `policy-engine-rules.md`
- `agent-readiness-ledger.md`
