# Agent Readiness Ledger

## 0. Purpose

This document defines how mission readiness is recorded and updated for each agent.

In the military, readiness is not "seems likely to do well" but an evidence-based determination that a specific mission-essential task can be performed. LLM agents must likewise record, by role, what they can reliably perform.

## 1. Readiness Ratings

| Rating | Meaning | Operating Authority |
| --- | --- | --- |
| T | Trained | Autonomous execution permitted |
| P | Practiced | Execute after backbrief |
| U | Untrained | Checklist and supervision required |
| X | Unknown | Only low-risk tasks permitted |

## 2. Ledger Entry

```yaml
readiness:
  id: RL-001
  agent_id: S2
  task: "public source research"
  rating: T
  evidence:
    - "Completed research based on official sources 3 or more times"
    - "No missing entries in the source map"
  limitations:
    - "Limited access to public materials on detailed ROK military doctrine"
  updated_at: "2026-06-18T00:00:00+09:00"
  next_training: "KIDA material search and classification"
```

## 3. AI METL Linkage

| METL | Owner | Readiness evidence |
| --- | --- | --- |
| Convert user request to OPORD | Commander/S3 | valid OPORD, no missing intent |
| Source-based research | S2 | evidence records, source map |
| Task sequencing | S3 | task order, verification |
| Tool authority control | S3/Tool Gateway | tool request log |
| Document knowledge management | S6 | README, compendium update |
| Independent review | Red Team | findings with severity |
| Evaluation | Evaluator | MOP/MOE sheet |
| Post-action learning | CoS/S6 | AAR and SOP update |

## 4. Readiness Update Rules

Rating increase:

- Same task succeeded 3 times.
- No verification failures.
- Classified as "sustain" in the AAR.
- No Red Team critical findings.

Rating decrease:

- Same error repeated twice.
- Unsourced claims.
- Attempted tool action without approval.
- Concealment of a test failure.
- Redefinition of user intent.

Rating held pending:

- Task scope has changed.
- New tool usage.
- New domain.
- Increased impact on external systems.

## 5. Initial Ledger by Agent

| Agent | Task | Initial rating | Rationale |
| --- | --- | --- | --- |
| Commander | mission/intent decomposition | P | Documentation framework exists but real repeated trials are needed |
| CoS | task integration | P | Documented cases exist; runtime trials needed |
| S2 | public source research | P | Performs documentation based on official sources |
| S2 | Korean source research | P/U | Material limitations stated; deeper domestic literature review needed |
| S3 | markdown implementation | T | Authored numerous documents and connected indexing |
| S4 | sustainment estimate | P | Conceptual documentation exists; no automated measurement |
| S6 | knowledge management | T | Maintains README, compendium, source map |
| Red Team | independent review | U | Lacks a track record of separate, independent execution |
| Evaluator | MOP/MOE evaluation | P | Evaluation metrics exist; experimental data is lacking |

## 6. Readiness Gate

Check the following before assigning a task.

```text
if readiness == T:
  allow autonomous execution within ROE
if readiness == P:
  require backbrief
if readiness == U:
  require checklist and supervision
if readiness == X:
  assign only low-risk support task
```

## 7. Training Plan

| Agent | Training task | Method | Success |
| --- | --- | --- | --- |
| S2 | deep research on domestic defense materials | source map exercise | classify 10 grade A/B sources |
| S3 | prompt DSL compiler | implementation prototype | generate a valid OPORD |
| S4 | token/tool sustainment | long-running simulation | complete without context loss |
| Red Team | hallucination detection | blind review | detect unsupported claims |
| Evaluator | experiment scoring | case study scoring | achieve scorer consistency |

## 8. AAR Linkage

Update the readiness ledger once the AAR is complete.

```text
What task was performed?
Was verification passed?
Were there critical findings?
Did the agent stay within ROE?
Was user intent preserved?
Should readiness rise, stay, or fall?
```

Implementation deliverables:

- `aar-to-readiness-update.js`: converts an AAR payload into a readiness recommendation, maintenance action, SOP update, and CCIR trigger.
- `schema-files/aar-readiness-update.schema.json`: AAR readiness update contract.
- `run-aar-readiness-update-fixtures.js`: verifies the normal improvement, critical source failure, and sustain-only AAR branches.

## 9. Related Documents

- `evaluation-metrics.md`
- `experiments.md`
- `agent-runtime-playbook.md`
- `military-ai-risk-register.md`
- `schema-files/readiness-ledger.schema.json`
