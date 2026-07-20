# Policy Engine Rules

## 0. Purpose

This document defines how to translate the tool-use ROE into concrete policy engine rules.

The policy engine takes an agent's tool request and classifies it as one of Green, Amber, Red, or Black. The core objective is not fast execution but consistent pre-execution judgment of authority and risk.

## 1. Input

```yaml
policy_input:
  actor: S3
  mission_id: M-001
  tool: database
  action: update
  target: prod.customers
  data_sensitivity: sensitive
  reversibility: partial
  external_effect: true
  cost_risk: low
  user_requested: true
  existing_approval: null
```

## 2. Output

```yaml
policy_decision:
  roe_class: Red
  allowed: false
  approval_required: true
  reason:
    - "Production database write."
    - "Sensitive data target."
  required_controls:
    - "dry_run"
    - "backup"
    - "rollback_plan"
    - "explicit_user_approval"
  alternatives:
    - "Run SELECT preview."
    - "Execute against staging."
```

## 3. Priority Order

When policies conflict, the higher risk class wins.

```text
Black > Red > Amber > Green
```

Examples:

- The action is Green because it is document creation, but if the target includes secret key output, it becomes Black.
- Even if the user requested it, a production DB write is Red.
- If agent readiness is low, even a Green task can be escalated to Amber.

## 4. Rule Groups

| Group | Description |
| --- | --- |
| Actor rules | Based on role and readiness |
| Tool rules | Based on tool type |
| Action rules | Based on read/write/delete/deploy/send |
| Target rules | Based on local/prod/external/sensitive |
| Data rules | Based on public/internal/sensitive/secret |
| Mission rules | Based on mission constraints |
| Approval rules | Based on existing approval scope |
| Incident rules | Based on past AAR/risk register |

## 5. Core Rules

### 5.1 Black Rules

| Rule | Condition |
| --- | --- |
| NO_SECRET_OUTPUT | Output of secret keys, tokens, or private keys |
| NO_FABRICATED_SOURCE | Generation of a fabricated source |
| NO_UNAUTHORIZED_BYPASS | Bypassing the tool gateway |
| NO_PRIVATE_ACCESS_BYPASS | Bypass access to private materials |
| NO_USER_CHANGE_DISCARD | Discarding user changes without approval |

### 5.2 Red Rules

| Rule | Condition |
| --- | --- |
| PRODUCTION_WRITE | Write to a production system |
| DATABASE_MUTATION | DB insert/update/delete/migration |
| EXTERNAL_PUBLISH | External publication/sending |
| DEPLOY_PRODUCTION | Production deployment |
| BULK_PAID_API | Large-volume calls that incur cost |
| SECURITY_CONFIG_CHANGE | Change to authority/security configuration |

### 5.3 Amber Rules

| Rule | Condition |
| --- | --- |
| PACKAGE_INSTALL | Dependency install/change |
| AUTHENTICATED_READ | Reading a page that requires login |
| API_WRITE_NON_PROD | non-prod API write |
| PREVIEW_DEPLOY | Preview deployment |
| LARGE_FILE_REWRITE | Large-scale file rewrite |
| LOW_READINESS_AGENT | readiness U/X agent action |

### 5.4 Green Rules

| Rule | Condition |
| --- | --- |
| LOCAL_READ | Reading a local file |
| PUBLIC_WEB_READ | Public web search |
| MARKDOWN_CREATE | Document creation within the requested scope |
| LOCAL_TEST | Running a local test |
| SOURCE_SUMMARY | Summarizing a public source |

## 6. Escalation Rules

Escalation (upward):

| Condition | Escalation |
| --- | --- |
| sensitive data involved | +1 level |
| irreversible action | +1 level |
| production target | Red minimum |
| no rollback available | Red minimum |
| agent readiness U/X | Amber minimum |
| prior incident same category | +1 level |

De-escalation (downward) is allowed only in limited cases.

| Condition | Downward allowed |
| --- | --- |
| dry-run only | Red -> Amber |
| staging target | Red -> Amber |
| read-only with masked output | Amber -> Green |

Black is never de-escalated.

## 7. Approval Matching

Even if an existing approval exists, all of the following must match.

- mission_id.
- actor or role scope.
- tool.
- action.
- target.
- time window.
- risk class.

If there is a mismatch, a new approval request must be created.

## 8. Policy Pseudocode

```text
decide(input):
  decisions = []

  decisions += runBlackRules(input)
  if decisions contains Black:
    return block(Black)

  decisions += runRedRules(input)
  decisions += runAmberRules(input)
  decisions += runGreenRules(input)

  decision = maxRisk(decisions)
  decision = applyEscalation(decision, input)

  if decision.class == Green:
    return allow()

  approval = findMatchingApproval(input)
  if approval valid:
    return allowWithAudit(decision)

  return requireApproval(decision)
```

## 9. Policy Test Cases

| Case | Expected |
| --- | --- |
| local markdown create | Green allow |
| public web search | Green allow |
| package install | Amber approval |
| preview deploy | Amber approval |
| production deploy | Red approval |
| DB delete production | Red approval + backup + rollback |
| output API key | Black block |
| fabricate citation | Black block |

## 10. Related Documents

- `tool-use-roe.md`
- `approval-ui-patterns.md`
- `military-ai-risk-register.md`
- `schema-files/tool-request.schema.json`
- `sample-payloads/`
- `policy-engine-authority-integration.js`
- `policy-engine-release-integration.js`
