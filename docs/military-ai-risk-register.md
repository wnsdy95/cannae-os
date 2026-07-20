# Military AI Risk Register

## 0. Purpose

This document defines the list of risks that must be managed on a recurring basis in military-style LLM operations, along with their controls.

Military-style risk management is not a procedure for eliminating risk, but a procedure for identifying risk and clarifying who is able to accept it. The LLM agent is a risk reporter, not a risk acceptor.

## 1. Risk Register Fields

```yaml
risk:
  id:
  category:
  description:
  trigger:
  likelihood:
  impact:
  level:
  controls:
  owner:
  ccir:
  residual_risk:
  review_cycle:
```

## 2. Risk Levels

| Level | Meaning | Handling |
| --- | --- | --- |
| Low | Reversible and low impact | Agent autonomy |
| Medium | Limited impact, verification required | Backbrief and record |
| High | External state/data/cost impact | User approval |
| Critical | Sensitive information, destruction, falsification, legal risk | Halt or prohibit |

## 3. Core Risk Register

| ID | Category | Risk | Trigger | Level | Controls |
| --- | --- | --- | --- | --- | --- |
| R-001 | Intent | Distortion of user intent | No separation between mission and intent | High | OPORD, backbrief |
| R-002 | Hallucination | Claims without a source | No evidence in the research task | High | evidence-first, source map |
| R-003 | Authority | High-risk action taken without approval | Red tool action | Critical | tool gateway, approval UI |
| R-004 | Security | Output of sensitive information | EEFI detected | Critical | masking, no-output rule |
| R-005 | Data | Damage to user files | overwrite/delete | High | backup, diff, approval |
| R-006 | External | Change to external API state | API write | High | approval, dry-run |
| R-007 | Cost | Unexpected cost | paid API, bulk call | Medium/High | budget check |
| R-008 | Coordination | Conflict among multi-agent outputs | Absence of CoS | Medium | task order, integrator |
| R-009 | Evidence | Mixing of source and interpretation | No distinction between claim and interpretation | Medium | evidence schema |
| R-010 | Overcontrol | Requiring approval for every action | Excessive ROE | Medium | risk-based delegation |
| R-011 | Undercontrol | Direct tool execution | Gateway bypass | Critical | no direct tool access |
| R-012 | Context | Loss of context in long-running tasks | No state persistence | Medium | SITREP, runtime state |
| R-013 | Evaluation | Treating output alone as success | MOP only | Medium | MOE requirement |
| R-014 | Red Team | Weakening of independent review | Red Team member also serves as the author | Medium | role separation |
| R-015 | Korean Context | Avoidance of questions rooted in Korean organizational culture | No backbrief | Medium | Korean backbrief template |
| R-016 | Legal/Policy | Assertive statements in high-risk domains | Legal/medical/financial/security judgment | High | escalation, disclaimer |
| R-017 | Deployment | Production outage | deploy action | High | preview, rollback |
| R-018 | Dependency | Package/environment breakage | package install/update | Medium | lockfile review |
| R-019 | Audit | Missing execution record | Missing tool log | High | audit store |
| R-020 | Learning | Repetition of the same failure | AAR not incorporated | Medium | readiness ledger update |

## 4. CCIR Linkage

Risks that must be reported immediately:

- R-003: High-risk action taken without approval.
- R-004: Output of sensitive information.
- R-011: Gateway bypass.
- R-016: Assertive statements in high-risk domains.
- R-017: Production outage.

Reporting format:

```text
Risk CCIR

Risk ID:
What happened:
Affected mission/task:
Immediate control:
Decision required:
Recommended action:
```

## 5. Risk Control Types

| Control | Description | Example |
| --- | --- | --- |
| Prevent | Block before occurrence | validator, ROE |
| Detect | Detect occurrence | source check, audit log |
| Contain | Limit spread | pause task, revoke tool |
| Recover | Restore state | rollback, restore |
| Learn | Prevent recurrence | AAR, SOP update |

## 6. Risk Ownership

| Risk type | Identifier | Router | Acceptor |
| --- | --- | --- | --- |
| Low execution | Agent | CoS | AI Commander |
| Medium quality | S2/S3/Red Team | CoS | AI Commander |
| High external impact | Any agent | AI Commander | Human User |
| Critical prohibited | Tool Gateway | AI Commander | Not acceptable |

## 7. Review Cycle

| Cycle | Target |
| --- | --- |
| Every task | tool-use, authority, evidence |
| Every mission | risk register deltas |
| Every AAR | recurring risk |
| Every release | high/critical controls |
| Monthly | risk taxonomy update |

## 8. Related Documents

- `decision-risk-assessment.md`
- `tool-use-roe.md`
- `approval-ui-patterns.md`
- `agent-runtime-playbook.md`
- `agent-readiness-ledger.md`
