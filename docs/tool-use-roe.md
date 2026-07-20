# Tool Use ROE

## 0. Purpose

This document defines the Rules of Engagement (ROE) to be applied when an LLM agent uses files, shells, browsers, APIs, databases, deployment tools, and similar means.

The core issue is not whether the agent can use a tool, but under what conditions and with what authority it may use it.

```text
Tool use is not a matter of execution capability, but a matter of authority.
```

Multinational application caution:

- The ROE here is not a replica of actual rules of engagement; it is a tool-use control analogy.
- For decisions involving law, personal data, external disclosure, incurred cost, or real organizational/service impact, authority structures differ by country and organization.
- When applying this to systems other than the U.S. military, apply the jurisdiction gate in `docs/multinational-doctrine-consistency-review.md` and escalate to local authorities or user approval.

## 1. ROE Grades

| Grade | Meaning | Default Behavior |
| --- | --- | --- |
| Green | Autonomous execution permitted | Execute, then log |
| Amber | Approval required | Decision memo before execution |
| Red | High risk; explicit approval and safeguards required | Dry-run, backup, and rollback required |
| Black | Prohibited | Refuse and propose a safe alternative |

## 2. Common Determination Criteria

Answer the following questions before using a tool.

1. Is this action reversible?
2. Does it affect user files, data, or external systems?
3. Does it incur cost?
4. Does it read or output sensitive information?
5. Does it send data over the network or to third-party services?
6. Could it revert existing user changes?
7. Is it recoverable if it fails?
8. Did the user explicitly request this action?

## 3. Filesystem ROE

| Action | Grade | Condition |
| --- | --- | --- |
| List files | Green | Within task scope |
| Read files | Green | Report as EEFI if sensitive information is found |
| Create new document | Green | Within requested scope |
| Modify existing document | Green | Within requested scope; report intent of change |
| Modify code file | Green/Amber | Green for small scope, Amber for large scope |
| Delete file | Amber/Red | Explicit request and recovery path required |
| Revert user changes | Red | Explicit approval required |
| Output secret keys | Black | Output prohibited |
| Modify system files | Red/Black | Prohibited unless directly related to the task |

## 4. Shell Command ROE

| Action | Grade | Condition |
| --- | --- | --- |
| Read commands such as `rg`, `ls`, `pwd`, `wc`, `sed` | Green | Within task scope |
| Run tests | Green | Cost/time is appropriate |
| Run formatter | Green/Amber | Scope of change must be checked |
| Install packages | Amber | Dependency change requires approval |
| Build commands | Green/Amber | Green for local builds; Amber/Red if deployment is included |
| Data migration | Red | Backup, dry-run, and approval required |
| Destructive commands | Red/Black | Prohibited without explicit approval |
| Privilege escalation commands | Red | Necessity, scope, and approval required |

Examples of destructive commands:

```text
rm -rf
git reset --hard
git checkout -- .
DROP TABLE
kubectl delete
terraform destroy
```

## 5. Web/Browser ROE

| Action | Grade | Condition |
| --- | --- | --- |
| Public web search | Green | For recency/source verification purposes |
| Query official documentation | Green | Record the source link |
| View pages requiring login | Amber | Requires explicit user request |
| Submit forms | Amber/Red | Verify whether external state changes |
| Purchase/reservation/payment | Red | Explicit approval required |
| Upload user data | Red | Verify sensitivity and purpose |
| Bypass access to private material | Black | Prohibited |

## 6. API ROE

| Action | Grade | Condition |
| --- | --- | --- |
| Read-only API call | Green/Amber | Verify cost and sensitivity |
| Write API call | Amber | Explicit request and target verification |
| API call that incurs cost | Amber/Red | Budget and approval required |
| Bulk calls | Red | Review rate limits, cost, and impact |
| Change permission/security settings | Red | Approval and rollback required |
| Display secret keys | Black | Output strictly prohibited |

Decision memo before an API call:

```text
API:
Action:
Data sent:
Cost risk:
State change:
Rollback:
Approval required:
```

## 7. Database ROE

| Action | Grade | Condition |
| --- | --- | --- |
| Query schema | Green/Amber | Verify access permission |
| SELECT | Green/Amber | Amber if personal information is included |
| INSERT/UPDATE/DELETE | Red | Transaction, backup, approval |
| Create migration | Amber | Review required |
| Run migration | Red | Backup, rollback, approval |
| Access production DB | Red | Explicit approval and audit log |
| Dump personal information | Black | Prohibited, or strict approval/masking |

## 8. Git ROE

| Action | Grade | Condition |
| --- | --- | --- |
| `git status`, `git diff`, `git log` | Green | When in a repository |
| Create new branch | Green/Amber | Depending on workflow |
| Create commit | Amber | Requires user request |
| Push | Amber/Red | Approval required to reflect to remote |
| Rebase/force push | Red | Explicit approval required |
| Reset hard | Red/Black | Prohibited without explicit request |
| Discard user changes | Black | Prohibited without explicit approval |

## 9. Deployment ROE

| Action | Grade | Condition |
| --- | --- | --- |
| Local build | Green | Minimal environmental impact |
| Preview deployment | Amber | Verify whether it is exposed externally |
| Production deployment | Red | Approval, rollback, monitoring |
| Infrastructure change | Red | Plan, review, approval |
| DNS/certificate change | Red | Large scope of impact |
| Secret rotation/change | Red | Rotation plan required |

## 10. Communication ROE

| Action | Grade | Condition |
| --- | --- | --- |
| Draft writing | Green | No sending |
| Internal document comment | Amber | Verify organizational impact |
| Send email/message | Red | Explicit approval required |
| External public posting | Red | Approval required |
| Send legal/official statement on someone's behalf | Black | Prohibited, or requires explicit authority |

## 11. Sensitive Information EEFI

If the following information is found, treat it immediately as EEFI.

- API key.
- password.
- private key.
- access token.
- Personally identifiable information.
- Customer data.
- Non-public contract/financial information.
- Security vulnerability details.
- Military/government sensitive information.

Handling principles:

1. Do not output it.
2. If necessary, report only its existence.
3. Do not leave it in the repository.
4. Do not expose it even if the user requests it.
5. Present alternative measures and recommend rotation/deletion.

## 12. Approval Request Form

```text
Approval required

Mission:
Requested action:
Tool:
Target:
Why needed:
Risk:
Rollback:
Alternatives:
Recommended option:
```

## 13. Dry-Run First Principle

For Red-grade tasks, perform a dry-run first whenever possible.

Examples:

- Print the list of deletion targets before deleting.
- Confirm targets with SELECT before a DB update.
- Preview build before deployment.
- Display the request body before an API write.
- Write a rollback plan before a migration.

## 14. Tool Use Log

All Amber-or-higher tasks are recorded in a log.

```yaml
tool_use_log:
  id: TUL-0001
  mission_id: M-0001
  actor: S3
  tool: "database"
  action: "migration"
  roe: "Red"
  approval: "approved_by_user"
  timestamp: "2026-06-18T00:00:00+09:00"
  result: "dry-run passed"
  rollback: "rollback migration available"
```

## 15. Default Tool Permissions by Agent

| Role | Default Green | Default Amber | Default Red |
| --- | --- | --- | --- |
| S2 | Web search, file reading | Reviewing login-required material | Accessing private material |
| S3 | Local file modification, testing | Package changes, API write | Deployment, DB migration |
| S4 | Environment check, dependency check | Installation, configuration change | Infrastructure change |
| S6 | Document/log management | Repository structure change | Handling sensitive logs |
| Red Team | Reading, review | Running proof-of-concept | Actual attack/destruction |
| Commander | Approve/reject | Accept risk | Cannot approve Black actions |

## 16. Related Documents

- `implementation-guide.md`
- `prompt-dsl.md`
- `agent-roles-and-authority.md`
- `decision-risk-assessment.md`
- `korean-military-sources.md`
