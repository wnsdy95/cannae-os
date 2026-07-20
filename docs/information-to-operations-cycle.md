# Information to Operations Cycle

## 0. Purpose

This document converts, into an LLM runtime procedure, how the military handles, assesses, and connects incoming information to operation planning, change orders, and upward reporting.

The key is not to jump straight to a conclusion or execution the instant information arrives.

```text
raw information
-> handling/classification
-> source reliability and confidence assessment
-> CCIR classification
-> running estimate update
-> decision support
-> OPORD/annex/FRAGO/SITREP/action
-> AAR/readiness/source update
```

## 1. Official Source Anchors

- JP 2-0, Joint Intelligence: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/2-0-Intelligence-Series/
- ADP 2-0, Intelligence: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1007507
- ATP 2-01.3, Intelligence Preparation of the Battlefield/Battlespace: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1023498
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507

## 2. Information Handling Principles

| Principle | Military Meaning | LLM Runtime Application |
| --- | --- | --- |
| Separate information from judgment | A raw report differs from an assessment | Keep facts, interpretation, and recommendations in separate fields |
| Record source and reliability | Source reliability and confidence are marked | Source reliability, confidence, and evidence link are required |
| CCIR priority | Not all information is reportable | Classify as PIR/FFIR/EEFI/Decision Point |
| Update the running estimate | Staff maintain continuously evolving assessment material | S2/S3/S4/S6 estimate update queue |
| Formalize order changes | Scope/authority/priority changes go through a FRAGO | Separate annex updates from FRAGOs |
| Do not repeatedly expose protected information | EEFI is reported but the raw text is not propagated | Do not copy raw secrets/credentials into alerts |

## 3. Processing by Stage

### 3.1 Receive

When information arrives, record it first.

Required questions:

- Who collected it?
- When was it observed/received?
- What is the original source and transmission path?
- What is the classification and EEFI possibility?
- Which mission/order does it relate to?

Deliverables:

- `InformationReport`
- Source/evidence link
- Handling instruction

### 3.2 Handle

Determine the handling classification before sharing the information.

| Condition | Action |
| --- | --- |
| Public/internal, no EEFI | Normal evidence/assessment flow |
| Sensitive/restricted | Need-to-know packet |
| Credential/secret/private data | EEFI Black alert, raw suppression |
| Source unreliable | PIR/watch, additional verification |
| Source contradicts an OPORD assumption | PIR/Decision Point, running estimate update |

### 3.3 Assess

S2 or the responsible staff member assesses the information.

Assessment fields:

- Key facts
- Assessment
- Confidence
- Source reliability
- Operational implication
- Information gaps
- Recommended outputs

Caution:

- Do not issue a FRAGO directly from low-confidence information.
- Escalate source conflicts as a PIR or decision packet, not as a conclusion.
- Recommend judgments only within the commander's intent and authority boundary.

### 3.4 Classify by CCIR

| Information Type | Classification | Example | Deliverable |
| --- | --- | --- | --- |
| External situation/source/policy change | PIR | Official material conflicts with an existing assumption | Evidence review, decision packet |
| Internal capability/tool/resource change | FFIR | Validator failure, insufficient quota | SITREP, maintenance action |
| Information requiring protection | EEFI | Credential-like content discovered | Suppression, release review |
| Condition requiring a decision | DECISION_POINT | Scope/authority/priority change needed | Decision packet, FRAGO |

### 3.5 Convert to Operational Output

| Assessment Result | Output |
| --- | --- |
| Reference only needed | Running estimate update |
| Current status must be shared | SITREP |
| Commander decision needed | Decision packet |
| Mission scope/authority/priority change | FRAGO scope change |
| Specialist plan detail change | Annex update |
| Contains sensitive information | EEFI alert + release review |
| Recurring failure/lesson | AAR readiness update |

## 4. How New Information Feeds Operational Planning

New information feeds into operational planning in four ways.

1. **Assumption update**
   - Check whether the existing assumption still holds.
   - If uncertain, leave it as a PIR.

2. **Running estimate update**
   - S2/S3/S4/S6 update their own functional assessment.
   - This stage is not by itself an order change.

3. **Decision support update**
   - Create a decision point, trigger, options, risk, and deadline.
   - Present it in a form the commander can choose from.

4. **Order update**
   - If it is a detailed plan, it becomes an annex.
   - If it is a scope/authority/priority/mission change, it becomes a FRAGO.

## 5. Upward Reporting System

```text
Collector / Agent
-> S2/S3/S4/S6 functional owner
-> CoS integration
-> Commander decision, if CCIR/Red/Black/scope change
-> Recorder/KM event log
```

Reporting criteria:

| Situation | Report To | Method |
| --- | --- | --- |
| Low confidence but low impact | S2 | Running estimate |
| Source conflict affects the conclusion | CoS/S2 | PIR alert |
| Tool/resource failure affects the mission | CoS/S4/S6 | FFIR SITREP |
| Sensitive information discovered | S6/Commander | EEFI alert |
| Scope/authority change needed | Commander | Decision packet + FRAGO draft |
| No decision impact | Recorder | Event log only |

## 6. LLM Prompt Guard

```text
When new information is received, do not jump straight to a conclusion; instead do the following.
1. Record raw information, source, confidence, and classification separately.
2. Classify it as one of PIR/FFIR/EEFI/DECISION_POINT.
3. Judge whether it affects the commander's decision.
4. If it does, route it to whichever of a decision packet, FRAGO, or SITREP is appropriate.
5. Do not repeatedly print the raw text of EEFI or credential-like information.
6. Do not convert low-confidence information directly into a FRAGO; keep it as a PIR/assessment.
```

## 7. Implementation Deliverables

- `schema-files/information-report.schema.json`
- `schema-files/intelligence-assessment.schema.json`
- `information-to-operations-router.js`
- `run-information-to-operations-fixtures.js`

## 8. Conclusion

The core of military-style information handling is not increasing the volume of information, but classifying which decision a piece of information can change, and escalating it in the correct format to the person who holds that decision.

In an LLM runtime, new information is not raw material for an answer but a command-system input. Therefore, information must pass through source, confidence, classification, CCIR, operational implication, and output routing.
