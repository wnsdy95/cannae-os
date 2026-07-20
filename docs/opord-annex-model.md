# OPORD Annex Model

## 0. Purpose

This document converts the OPORD body and its annexes into an LLM operating document system.

The OPORD body is a commander-facing contract. Annexes are detailed plans for each specialist area. Separating the two keeps the order short and verifiable, and allows subordinate agents to receive only the detail needed for their own role.

## 1. Core Principles

| Principle | Description |
| --- | --- |
| Body is command | The OPORD body fixes intent, mission, execution concept, and authority |
| Annex is detail | Specialist-area details are separated into annexes |
| Annex owner exists | Each annex has a responsible role |
| Annex must link to OPORD | An annex must have a parent_order and mission_id |
| Annex cannot change intent | Changing intent is a FRAGO matter, not an annex matter |
| Annex is releasable by need-to-know | Not every agent needs to see every annex |

## 2. What Stays in the OPORD Body

The OPORD body is the minimum common understanding that all subordinate agents must share.

| OPORD Paragraph | LLM Field | Content |
| --- | --- | --- |
| Situation | `situation` | Background, facts, assumptions, constraints |
| Mission | `mission` | Task statement, target end state |
| Execution | `execution` | Overall concept, task order, coordinating instructions |
| Sustainment | `sustainment` | Tools, context budget, fallback |
| Command and Signal | `command_and_signal` | Authority, CCIR, report triggers |
| Assessment | `assessment` | MOP, MOE, verification |

The body fixes "what must be done and why." "Which file to change by how many lines," "which source to evaluate at what reliability level," and "which API fallback to use" are pushed down into annexes.

## 3. LLM Annex Set

| Annex | Owner | Purpose | Contents |
| --- | --- | --- | --- |
| Annex A Source Plan | S2 | Control sources and uncertainty | Source list, reliability, claim/interpretation split |
| Annex B Execution Plan | S3 | Control execution order | Task sequence, dependencies, verification commands |
| Annex C Tool/ROE Plan | S3/S6 | Control tool authority | Allowed/approval/prohibited, rollback, dry run |
| Annex D Sustainment Plan | S4/S6 | Resource continuity | Token/time/tool availability, fallback, maintenance readiness |
| Annex E OPSEC/Releasability | S6/Recorder | Control context sharing | Classification, EEFI, allowed roles, release review |
| Annex F Risk and Red Team | Red Team | Control failure modes | Risks, mitigations, residual risk, decision packets |
| Annex G Assessment Plan | Evaluator | Effect assessment | MOP, MOE, indicators, evidence requirements |
| Annex H Handoff/Audit | Recorder | Long-term memory control | Event log, source-of-truth files, handoff packet |

## 4. Criteria for Creating an Annex

Create an annex when:

- Including it in the body would lengthen the OPORD and blur intent.
- Only a specific role needs to know the detail.
- It needs a dedicated owner, as with risk, sources, tools, security, or verification.
- On change, it should be updated independently without rewriting the entire body.

Do not create an annex when:

- It is a single Green action with the same executor and verifier.
- The additional information does not affect the commander's decision.
- The information is already sufficiently clear in the OPORD body.

## 5. Annex Contract

Minimum annex fields:

```json
{
  "schema_version": "0.1",
  "type": "ANNEX",
  "annex_code": "A",
  "mission_id": "M-DEMO-001",
  "parent_order": "OPORD-DEMO-001",
  "owner": "S2",
  "classification": "internal",
  "purpose": "Control source reliability and uncertainty.",
  "inputs": [],
  "outputs": [],
  "constraints": [],
  "ccir_links": [],
  "verification": [],
  "updated_at": "2026-06-18T16:30:00+09:00"
}
```

This repository currently has `schema-files/annex.schema.json` and `schema-files/frago-scope-change.schema.json`. The annex schema links specialist detail plans to the OPORD while prohibiting changes to intent/authority, and the FRAGO scope-change schema explicitly separates out changes to mission scope or authority boundaries.

## 6. Relationship Between OPORD and Annex

```text
OPORD
  -> Annex A Source Plan
  -> Annex B Execution Plan
  -> Annex C Tool/ROE Plan
  -> Annex D Sustainment Plan
  -> Annex E OPSEC/Releasability
  -> Annex F Risk/Red Team
  -> Annex G Assessment
  -> Annex H Handoff/Audit
      -> Task Orders
          -> Backbriefs
              -> Rehearsal
                  -> Execution
```

## 7. Need-to-Know Routing

Annexes follow the context releasability policy.

| Role | Default Access |
| --- | --- |
| Commander | All annex summaries; Red/Black detail when a decision is needed |
| CoS | All annexes, raw or summary |
| S2 | Source annex raw, OPSEC annex summary |
| S3 | Execution/tool/risk annex raw |
| S4 | Sustainment annex raw |
| S6 | Tool/OPSEC/handoff annex raw |
| Red Team | Risk annex raw, source/tool summary |
| Evaluator | Assessment annex raw, execution evidence summary |
| Final Output | Public/released summary only |

## 8. FRAGO and Annex Changes

Not every annex change is a FRAGO.

| Change Type | Handling |
| --- | --- |
| Adding one source | Annex A update |
| Adding a verification command | Annex B/G update |
| Changing a fallback tool | Annex D update |
| Changing EEFI classification | Annex E update, release review required |
| Changing mission purpose | FRAGO |
| Changing authority boundary | FRAGO or approval scope update |
| Risk acceptance required | Decision packet |

Principle: if it changes the OPORD's intent, mission, authority, or priority, it is a FRAGO. If it changes only the detailed execution of a specialist plan, it is an annex update.

## 9. Annex Anti-Patterns

Patterns to avoid:

- An annex quietly changing OPORD intent.
- Delivering every annex raw to every agent.
- Detailed plans left unattended with no annex owner.
- A Red Team annex being used as an execution order.
- A source annex mixing claims and interpretation.
- An assessment annex measuring only output count and not effect.

## 10. Implementation Status and Future Schema Candidates

Implemented schemas:

- `annex.schema.json`
- `frago-scope-change.schema.json`

Additional candidates:

- `source-plan.schema.json`
- `verification-plan.schema.json`

Validation rules:

- If an annex changes OPORD intent: `ANNEX_CHANGES_INTENT`.
- If an annex changes an authority boundary: `ANNEX_CHANGES_AUTHORITY`.
- Block a FRAGO scope change issued without change details, affected role, backbrief, or rehearsal.
- A FRAGO changing an authority boundary requires a Commander issue or approval.

## 11. Source Anchors

- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- STANAG 2014, Formats for Orders: https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507

## 12. Related Documents

- `orders-production-pipeline.md`
- `context-releasability-policy.md`
- `opsec-classification-model.md`
- `decision-risk-assessment.md`
- `maintenance-readiness-model.md`
