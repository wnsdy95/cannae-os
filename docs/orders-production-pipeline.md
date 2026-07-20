# Orders Production Pipeline

## 0. Purpose

This document converts the military's order-production procedure into a prompt/order pipeline for LLM single-agent and multi-agent runtimes.

The core perspective is simple.

- A user request is not immediately an execution prompt.
- The request becomes an order after passing through mission analysis.
- The order continues through the task order, backbrief, rehearsal, execution, SITREP, FRAGO, and AAR.
- Each stage has a control point that reduces distortion.

## 1. Military Concept

The military does not handle a large mission with a single-sentence directive. It cycles through planning, preparation, execution, and assessment, and produces orders in a standard format. OPORD/WARNO/FRAGO is a document system that reinforces and revises the order over time.

The strength of this system does not lie in "copying exactly what was said from above." It lies in preserving the higher-level intent and constraints while allowing the subordinate unit to rewrite it into an executable order suited to its own situation.

## 2. LLM Conversion Principles

| Military Order-Production Principle | LLM Application |
| --- | --- |
| Mission analysis before order | First analyze the user request into mission, constraints, risks, and CCIR |
| WARNO before full order | For long tasks, disseminate preparable information in advance |
| OPORD as execution contract | The execution prompt is fixed as an OPORD-style contract |
| Annex for specialist detail | Sources, tools, security, verification, and rollback are separated into annexes |
| Confirmation/backbrief | The agent restates the understood mission before execution |
| Rehearsal | A dry run before tool execution checks for conflicts and omissions |
| FRAGO | Changes are recorded as a fragmentary order rather than a new conversation |
| AAR | After execution, the SOP/readiness/authority are updated |

## 3. End-to-End Pipeline

```text
User Request
-> Mission Intake
-> Mission Analysis
-> WARNO when preparation can start early
-> COA / Option Development
-> Commander Decision or Auto-Green Decision
-> OPORD
-> Annex Pack
-> Task Orders
-> Backbrief
-> Rehearsal / Dry Run
-> Tool / Agent Execution
-> SITREP / CCIR Alert
-> FRAGO if scope, priority, authority, or plan changes
-> Evidence / Verification
-> AAR
-> SOP, readiness, source-map, and policy update
```

## 4. Deliverables per Stage

| Stage | Deliverable | Purpose | Pre-Execution Gate |
| --- | --- | --- | --- |
| Mission Intake | mission object | Fix the user's purpose and end conditions | Intent must not be missing |
| Mission Analysis | assumptions, constraints, CCIR | Remove ambiguity | Separate questions from assumptions |
| WARNO | preparation order | Start preparation on a long task | Preparation only allowed; execution boundary stated |
| OPORD | execution order | Execution contract | Authority, assessment, and reports required |
| Annex | specialist plans | Separate detailed risk/tools/verification | Each annex has an assigned owner |
| Task Order | role-level task | Turns work into a subordinate-agent task | assigned_to, purpose, verification required |
| Backbrief | restated understanding | Detect distortion from dissemination | Stop condition and approval boundary required |
| Rehearsal | dry-run sequence | Detect conflicts before execution | Execution prohibited if unresolved changes remain |
| SITREP | current state report | Report changes needed for decisions | Blocked items linked to CCIR |
| FRAGO | changed order | Control scope of change | Parent order and unchanged intent required |
| AAR | learning record | Post-action management | Judgment on SOP/readiness update |

## 5. Distortion-Prevention Mechanisms

| Distortion Type | Military-Style Prevention | LLM Control |
| --- | --- | --- |
| Misunderstanding purpose | Commander intent | `intent.purpose`, `key_tasks`, `failure_to_avoid` |
| Scope creep | Distinguishing OPORD/FRAGO | Scope change allowed only via a FRAGO event |
| Missing subordinate task | Task order | Decompose OPORD tasks into role-based payloads |
| Implicit approval | Command and signal | Explicitly state allowed/approval/prohibited |
| Pre-execution error | Confirmation brief/backbrief | Validate against the `BACKBRIEF` schema |
| Execution sequence conflict | Rehearsal | Validate the `REHEARSAL` sequence |
| Excessive reporting | CCIR | Alert only on decision-changing information |
| Memory loss | Event log/handoff | Maintain source-of-truth files and projections |

## 6. Order State Machine

```text
draft
-> analyzed
-> warned
-> ordered
-> acknowledged
-> rehearsed
-> executing
-> changed
-> complete
-> reviewed
```

Recommended state transitions:

| From | To | Condition |
| --- | --- | --- |
| draft | analyzed | Mission intent, constraints, and CCIR are filled in |
| analyzed | warned | Some preparation is worth starting early |
| analyzed/warned | ordered | The OPORD passes the validator |
| ordered | acknowledged | Each task owner has submitted a backbrief |
| acknowledged | rehearsed | The rehearsal disposition is `execute` |
| rehearsed | executing | The policy/readiness gate passes |
| executing | changed | A scope/priority/authority change occurs |
| changed | executing | The FRAGO is linked to the parent order |
| executing | complete | MOP/MOE/evidence are satisfied |
| complete | reviewed | The AAR and readiness update are reviewed |

## 7. Automation Rules

Before execution, the runtime confirms at least the following:

1. Does the OPORD have a mission_id and commander intent?
2. Is the OPORD task linked to a task order?
3. Has each task owner submitted a backbrief?
4. Does the backbrief restate the stop condition and approval boundary?
5. Does the rehearsal include an execution sequence and decision points?
6. Is execution not being attempted while rehearsal required_changes remain?
7. Does the tool request pass the authority/readiness/release policy?
8. Is a blocked item escalated to a SITREP or CCIR alert?

Implementation links in this repository:

- `schema-files/opord.schema.json`
- `schema-files/task-order.schema.json`
- `schema-files/backbrief.schema.json`
- `schema-files/rehearsal.schema.json`
- `runtime-demo-payloads/backbrief.json`
- `runtime-demo-payloads/rehearsal.json`
- `orders-dissemination-runner.js`

## 8. Application in a Single Agent

A single agent internally mimics multiple staff functions but shows the user only a commander-facing packet.

```text
S2: organize sources and uncertainty
S3: write execution steps and task order
S4/S6: check tools, tokens, context, fallback
Red Team: detect failure modes and authority overreach
CoS: integrate the OPORD and decision packet
Commander: approve, revise, reject, FRAGO
```

Even a single agent must produce a short backbrief before execution. This is not exposing internal reasoning, but an external contract that verifies the understood mission and stop condition.

## 9. Application in Multi-Agent

Multi-agent systems must be stricter.

- The Orchestrator is the OPORD owner.
- Each role agent is a task order owner.
- Each role agent submits a backbrief for its own task.
- The CoS/Orchestrator finds conflicts between backbriefs during rehearsal.
- Red Team does not hold execute authority; it only produces risk findings and mitigation options.
- The Recorder/S6 stores the OPORD, FRAGO, SITREP, AAR, evidence, and event log as the source of truth.

## 10. Anti-Patterns

Patterns to avoid:

- Putting a user request directly into the system prompt and running it long-term.
- Calling multiple agents simultaneously without an OPORD.
- A task owner executing without restating its own assignment.
- Applying blanket approval — "approval received" — to all tool actions.
- Quietly folding a change request into the existing OPORD.
- Moving on to the next task after a failure without an AAR.

## 11. Source Anchors

- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- STANAG 2014, Formats for Orders: https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf
- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf

## 12. Related Documents

- `opord-annex-model.md`
- `backbrief-and-rehearsal-sop.md`
- `prompt-templates.md`
- `prompt-dsl.md`
- `agent-runtime-playbook.md`
- `event-sourcing-model.md`
