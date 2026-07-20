# Approval UI Patterns

## 0. Purpose

This document defines the UI patterns for obtaining user approval before an LLM agent performs an Amber/Red-rated tool action.

The purpose of the approval UI is not to annoy the user, but to ensure that the risk acceptor actually understands what they are approving.

## 1. Basic Principles

| Principle | Description |
| --- | --- |
| Specific | Clearly display the action, tool, and target subject to approval |
| Risk-visible | Do not hide risks and failure consequences |
| Reversible-first | Present dry-run and rollback whenever possible |
| Least privilege | Approve only the minimum scope necessary |
| Time-bound | Approval is limited to a specific action and time |
| Auditable | Record the approver, time, scope, and result |

## 2. Approval Card

```text
Approval required

Action:
Tool:
Target:
Why this is needed:
Risk:
Data affected:
Cost:
Rollback:
Alternatives:

[Approve once] [Dry-run only] [Reject]
```

## 3. Decision Levels

| Level | UI Behavior | Example |
| --- | --- | --- |
| Amber | Simple approval card | Package installation, API write draft |
| Red | Detailed decision memo | DB migration, deployment |
| Black | No approval button | Secret key output, false source |

## 4. A Good Approval Request

```text
Action: Modify the docs/source-map.md file.
Why: Necessary to link a new Korean open-source source to the source map.
Risk: Low. Only a local markdown file is changed.
Rollback: The previous content can be reapplied.
Alternatives: Can be summarized only in the final answer without any change.
```

## 5. A Bad Approval Request

```text
Please approve to continue the task.
```

Problems:

- It is unclear what is being executed.
- There is no target.
- There is no risk.
- There is no alternative.

## 6. Approval Scope

Approval should not be obtained broadly.

Bad approval:

```text
Approval for all file modifications going forward.
```

Good approval:

```text
For this mission, approve only the creation and modification of docs/*.md documentation files.
Deletion, external deployment, and API write require separate approval.
```

## 7. Dry-run UI

For Red-rated actions, the default button should be "Dry-run" rather than "Approve."

Example:

```text
[Run dry-run] [Show affected rows] [Reject]
```

After the dry-run result:

```text
Dry-run result:
- Affected rows: 42
- Estimated cost: $0
- Rollback available: yes

[Approve execution] [Revise] [Reject]
```

## 8. Approval Log

```yaml
approval_log:
  id: AP-001
  mission_id: M-001
  requested_by: S3
  approved_by: user
  action: "deploy.preview"
  scope: "preview environment only"
  expires_at: "2026-06-18T12:00:00+09:00"
  result: "success"
```

## 9. UX Anti-Patterns

| Anti-pattern | Problem | Correction |
| --- | --- | --- |
| Approval fatigue | Too many trivial approvals | Adjust Green/Amber criteria |
| Blanket approval | Risk scope widens | action-level approval |
| Hidden risk | The user does not know the actual risk | risk and rollback fields |
| No rejection alternative | The user can only choose approve/reject | dry-run, revise, skip |
| No log after approval | Cannot be audited | approval log |

## 10. Related Documents

- `tool-use-roe.md`
- `reference-architecture.md`
- `sample-runtime-state.md`
- `implementation-guide.md`
