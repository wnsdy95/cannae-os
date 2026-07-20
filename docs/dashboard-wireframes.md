# Dashboard Wireframes

## 0. Purpose

This document is a wireframe document for designing the command post dashboard as an actual screen.

The purpose of the dashboard is not to show all information, but to show first the information the commander needs to make the next decision.

## 1. Layout Principles

| Principle | Description |
| --- | --- |
| Intent pinned | The mission and commander's intent are always pinned at the top |
| Decision first | Approvals needed, CCIR, and blocked tasks take priority |
| Logs second | Detailed logs are available via drill-down |
| Evidence nearby | The basis for a claim can be checked immediately |
| Risk visible | High/critical risks are never hidden |
| AAR connected | Shows the status of learning reflected after completion |

## 2. Main Command Post

```text
+--------------------------------------------------------------------------------+
| Mission: M-20260618-001                                                        |
| Intent: Preserve user intent through OPORD, ROE, evidence, assessment.          |
| Status: IN PROGRESS       Risk: MEDIUM       Next Decision: 2 pending approvals |
+----------------------------+----------------------------+----------------------+
| CCIR Alerts                | Approval Queue             | Active Risks         |
| - Red tool approval needed | - DB dry-run request       | - R-003 Authority    |
| - Evidence conflict        | - Preview deploy           | - R-012 Context loss |
+----------------------------+----------------------------+----------------------+
| Active Tasks                                                                    |
| [S2] Source review        complete                                              |
| [S3] Runtime doc update   in progress                                           |
| [S6] README/source map    pending                                               |
+--------------------------------------------------------------------------------+
| Latest SITREP                                                                   |
| Completed: schemas, fixtures, validator prototype                               |
| In Progress: dashboard/data model/demo docs                                     |
| Risk: executable validator is prototype only                                    |
+--------------------------------------------------------------------------------+
```

## 3. Approval Queue

```text
+--------------------------------------------------------------+
| Approval Required                                             |
| ROE: RED                                                      |
| Actor: S3 Operations Agent                                    |
| Tool: database                                                |
| Action: update_production                                     |
| Target: prod.customers                                        |
| Why: Apply cleanup script                                     |
| Risk: data corruption, irreversible update                    |
| Rollback: backup restore required                             |
| Alternatives: staging run, dry-run SELECT                     |
+--------------------------------------------------------------+
| [Dry-run only] [Approve once] [Revise request] [Reject]       |
+--------------------------------------------------------------+
```

Display rules:

- Black actions do not display an approve button.
- Red actions place dry-run as the default leftmost option.
- Approval scope and expiration time must always be displayed.

## 4. Evidence Viewer

```text
+------------------------------------------------------------------------------+
| Claim                                                                        |
| Mission command requires commander's intent and disciplined initiative.       |
+------------------------------------------------------------------------------+
| Source                                                                       |
| ADP 6-0 Mission Command                                                       |
| Reliability: A       Checked: 2026-06-18                                      |
+------------------------------------------------------------------------------+
| Interpretation                                                                |
| LLM agents need explicit intent and authority boundaries before autonomy.     |
+------------------------------------------------------------------------------+
| Linked Docs                                                                   |
| agent-roles-and-authority.md, prompt-dsl.md                                   |
+------------------------------------------------------------------------------+
| [Open Source] [Flag unsupported] [Request Red Team Review]                    |
+------------------------------------------------------------------------------+
```

## 5. Risk Board

```text
+----------------------+----------+----------------------+----------------------+
| Risk                 | Level    | Control              | Status               |
+----------------------+----------+----------------------+----------------------+
| R-003 Unauthorized   | Critical | Tool gateway approval| Active               |
| R-004 Secret output  | Critical | EEFI suppression     | No current event     |
| R-012 Context loss   | Medium   | SITREP checkpoint    | Watch                |
+----------------------+----------+----------------------+----------------------+
```

## 6. Readiness Board

```text
+----------+--------------------------+--------+-----------------------------+
| Agent    | Task                     | Rating | Next Training               |
+----------+--------------------------+--------+-----------------------------+
| S2       | Public source research   | T      | Korean defense papers       |
| S3       | Markdown implementation  | T      | Prompt compiler prototype   |
| Red Team | Independent review       | U      | Blind hallucination review  |
+----------+--------------------------+--------+-----------------------------+
```

## 7. Mission Timeline

```text
09:00 Mission intake
09:04 OPORD generated
09:07 Validator warning: MOP_ONLY
09:10 FRAGO: add runtime schemas
09:22 Tool request Green: create schema files
09:35 SITREP: schema files complete
09:40 AAR pending
```

## 8. Mobile / Narrow View

Priority order:

1. Mission and intent.
2. Decision required.
3. CCIR alerts.
4. Active task status.
5. Evidence/risk drill-down.

On narrow screens, hide the log table and switch to an alert-card-centered layout.

## 9. Related Documents

- `command-post-dashboard.md`
- `approval-ui-patterns.md`
- `policy-engine-rules.md`
- `sample-runtime-state.md`
- `data-model.sql.md`
