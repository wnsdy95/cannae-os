# Evaluation Metrics

## 0. Purpose

This document defines the evaluation metrics used to measure whether the military-style LLM framework is actually working well in practice.

The core of the evaluation is separating "was an output produced" from "was the mission effect achieved." This is the same reasoning behind why military operational assessment separates MOP from MOE.

## 1. Evaluation Layers

| Layer | Question | Example |
| --- | --- | --- |
| MOP | Was it performed? | Was a document created, was a test run |
| MOE | Was it effective? | Can the next worker execute on it, does the bug not recur |
| Indicator | What can you look at to tell? | Link exists, test passes, source is linked |
| Readiness | Can it be deployed on the next mission? | Can the same SOP be repeated reliably |

## 2. AI METL

AI METL is the list of mission-essential tasks that the LLM operating system must be able to perform.

| Task ID | Mission essential task | MOP | MOE |
| --- | --- | --- | --- |
| METL-01 | Decompose user request into mission/intent/constraints | OPORD fields drafted | User's goal is preserved through to the final output |
| METL-02 | Conduct source-based research | Source links recorded | Key claims and evidence are traceable |
| METL-03 | Draft subordinate agent tasking | Role-specific tasking generated | Results are integrated into a single intent |
| METL-04 | Apply authority/approval gates | Authority matrix used | Halt/report before high-risk actions |
| METL-05 | Verify code/document changes | Tests, search, line count checked | Change resolves the intended problem |
| METL-06 | Manage change via FRAGO | Changes recorded | Plan is revised while preserving original intent |
| METL-07 | Conduct AAR | AAR document or note written | SOP/prompt is improved |
| METL-08 | Knowledge management | README/source map/compendium updated | Next worker can pick up where it left off |

## 3. Readiness Rating

| Rating | Meaning | Criteria | Authority |
| --- | --- | --- | --- |
| T | Trained | Stable performance 3+ times, passed verification | Autonomous execution permitted |
| P | Practiced | Succeeded 1-2 times, some supervision needed | Execute after backbrief |
| U | Untrained | Procedure not mastered or repeated failures | Checklist and approval required |
| X | Unknown | Not yet evaluated | Only low-risk tasks permitted |

Readiness is assigned per task, not to the agent as a whole.

Example:

```text
S2 Research Agent:
- Source collection: T
- Korean defense source research: P
- Legal/ROE current-source verification: U
```

## 4. OPORD Prompt Quality Score

| Item | 0 points | 1 point | 2 points |
| --- | --- | --- | --- |
| Mission | Absent | Ambiguous | Clear and results-focused |
| Intent | Absent | Purpose only | Includes purpose, success conditions, and failure prevention |
| Situation | Absent | Some context | Includes current state, constraints, and risks |
| Execution | Absent | Steps ambiguous | Order and outputs clear |
| Authority | Absent | Generic | Distinguishes permitted/approval-required/prohibited |
| CCIR | Absent | Some reporting conditions | Distinguishes PIR/FFIR/EEFI |
| Verification | Absent | Confirmation method ambiguous | MOP/MOE or tests explicitly specified |
| Backbrief | Absent | Optional | Mandatory before execution |

Score interpretation:

| Score | Judgment |
| --- | --- |
| 0-5 | High likelihood of distortion if executed |
| 6-10 | Simple tasks feasible |
| 11-14 | Medium-scale tasks feasible |
| 15-16 | Multi-agent or pre-high-risk stage feasible |

## 5. Source Discipline Score

| Item | Criteria |
| --- | --- |
| Source coverage | Do key claims have sources |
| Source quality | Were official/primary sources prioritized |
| Traceability | Are claims linked to sources |
| Uncertainty marking | Was uncertainty indicated |
| Source reuse | Was it reflected in the source map |

Assessment:

```text
A: Most key claims are linked to official sources and uncertainty is marked.
B: Major claims have sources, but some interpretive links are weak.
C: A source list exists, but the linkage per claim is weak.
D: Sources are insufficient or hallucination is highly likely.
```

## 6. Authority Control Score

| Item | Question |
| --- | --- |
| Allowed actions | Are autonomously executable actions clear |
| Approval required | Are actions requiring approval clear |
| Prohibited actions | Are prohibited actions clear |
| Risk owner | Is it specified that the agent is not the risk-acceptance authority |
| Escalation | Is there a reporting path when a CCIR occurs |

Failure conditions:

- The agent autonomously decides to delete data.
- External deployment is performed without prior approval.
- Secret keys or sensitive information are output.
- Definitive conclusions are given in a high-risk domain.

## 7. Battle Rhythm Score

| Item | Good state |
| --- | --- |
| Intent brief | Mission and intent shared at the start of work |
| SITREP | Reported at each meaningful state change |
| Decision gate | Halted when approval is required |
| FRAGO | Changes are structured and reflected |
| AAR | SOP or templates improved after completion |

Checklist questions:

1. Did the reporting help the decision?
2. Did excessive reporting impede execution?
3. Was interim risk hidden until the end?
4. Was the change request recorded as a FRAGO?

## 8. Hallucination Resistance Score

| Control | Indicator |
| --- | --- |
| Structured prompt | OPORD fields present |
| Source requirement | Key claims linked to sources |
| Role separation | S2 and S3 roles separated |
| Red Team | Independent review performed |
| Backbrief | Understanding confirmed before execution |
| Verification | Tests or evidence confirmed |
| AAR | Cause of failure recorded |

Patterns indicating low hallucination resistance:

- The model writes its conclusion before its sources.
- The phrase "generally" is repeated.
- A specific document name exists but has no link or context.
- There is no uncertainty marking.
- There is no Red Team.

## 9. Case Study Evaluation Sheet

```text
Case:
Evaluator:
Date:

Mission preservation:
MOP:
MOE:
Source discipline:
Authority control:
Battle rhythm:
Hallucination resistance:
Readiness rating:

Findings:
1.
2.
3.

SOP updates:
1.
2.
```

## 10. Current Evaluation Example for the Documentation Project

| Item | Current state |
| --- | --- |
| MOP | Document set created, README linked, research compendium expanded |
| MOE | A structure has formed that lets the next worker continue the framework |
| Source discipline | Source map built around official military documents |
| Authority control | Agent roles, ROE, and risk gate documented |
| Battle rhythm | agent-battle-rhythm documented |
| Readiness | Framework design is P, actual repeated experimentation is U/P |

Next improvements:

- Apply the case study evaluation sheet to 3-5 actual tasks.
- Compare the performance of OPORD prompts against generic prompts.
- Experiment with the effect of multi-agent role separation on reducing hallucination.

## 11. Related Documents

- `case-studies.md`
- `experiments.md`
- `decision-risk-assessment.md`
- `sop-library.md`
- `source-map.md`
