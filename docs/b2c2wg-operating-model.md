# B2C2WG Operating Model

## 0. Purpose

B2C2WG is an abbreviation for boards, bureaus, centers, cells, and working groups. Military organizations do not escalate every problem directly to a single commander. Problems of differing character are divided among deliberative bodies and functional organizations, and information, analysis, decisions, and execution cycle within the battle rhythm.

The same problem arises in LLM multi-agent operations.

- If every agent reports to the user simultaneously, information overload results.
- If research, execution, risk, approval, and knowledge management get mixed into a single conversation, lines of responsibility blur.
- Without regular decision packets, long-running work becomes dependent on conversational memory.

This document converts B2C2WG into a scheduling, decision-packet, and authority-routing model for an AI LLM operating system.

## 1. Converting Military-Style Functions into an LLM Runtime

| Military-Style Element | Function | LLM Application |
| --- | --- | --- |
| Board | Deliberates matters requiring commander decisions | Approval, priority, and risk-acceptance decision boards |
| Bureau | Continuously handles a specific administrative/coordination function | Operating a source registry, knowledge base, readiness ledger |
| Center | Maintains constant monitoring and an integrated common picture | Command post dashboard, event replay projection |
| Cell | A working unit that performs a specific function | S2 research cell, S3 execution cell, S6 knowledge cell |
| Working Group | Analyzes a specific problem and produces a packet for a board | Source review WG, policy WG, AAR WG, architecture WG |

Core principles:

- A working group does not decide. It produces a packet on which a decision can be made.
- A board does not hold long discussions. It chooses among prepared options or issues a FRAGO.
- A center maintains the current state. It does not fabricate judgment.
- A cell executes within its function. Actions outside its authority are escalated to the CoS.
- A bureau stabilizes recurring management functions.

## 2. AI Command Post Structure

Basic structure:

| Node | Responsibility | Deliverable | Reports To |
| --- | --- | --- | --- |
| Commander Board | Priority, risk, Red approval, scope change | Decision, approval, FRAGO | User |
| CoS Integration Cell | Tasking, deconfliction, battle rhythm | Integrated SITREP, decision agenda | Commander |
| S2 Research Cell | Sources, uncertainty, PIR | Evidence packet, source reliability note | CoS |
| S3 Current Ops Center | Execution state, blockers, tool actions | Task status, blocked action list | CoS |
| S4 Sustainment Cell | Tokens, time, quota, tool availability | Resource estimate, degradation plan | CoS |
| S6 KM Bureau | Documents, state, event log, source map | Updated doctrine, handoff packet | CoS |
| Red Team WG | Contradiction, failure mode, exploit path | Risk finding, mitigation option | Commander/CoS |
| Evaluator/AAR WG | MOP/MOE, readiness, SOP update | AAR, readiness change | Commander |

## 3. Battle Rhythm

Instead of meetings, the LLM runtime has events.

| Event | Frequency | Input | Output |
| --- | --- | --- | --- |
| Mission Intake | On new request | User request | Mission draft, CCIR, initial authority |
| Mission Analysis WG | Before starting large tasks | Mission draft, constraints | OPORD draft, risk list |
| Commander Decision Board | When Red/priority/scope decision needed | Decision packet | Approve, reject, revise, FRAGO |
| Current Ops Sync | Every 30 minutes or at phase end during long tasks | Event log, task state | SITREP |
| Source Review WG | Before using external evidence | Evidence records | Source reliability decision |
| Tool Approval Board | Before a Red/critical Amber action | Tool request, policy decision | Scoped approval object |
| AAR WG | After phase end | Outputs, tests, decisions | AAR, SOP update, readiness update |
| Handoff Sync | Before a context transition | Current projection | Handoff packet |

## 4. Decision Packet Standard

Every item brought to a board has the following format.

```text
DECISION PACKET:
- packet_id:
- mission_id:
- decision_type: priority | approval | scope | risk_acceptance | doctrine_update
- commander_question:
- background:
- options:
- recommended_option:
- risk:
- authority_required:
- evidence:
- deadline:
- if_no_decision:
- proposed_output: approval | rejection | FRAGO | SITREP | SOP update
```

Rules:

- There must be at least 2 options. However, a Black action is not an option but a reject recommendation.
- The recommended option must include a reason and tradeoff.
- Source-backed claims are separated from inference.
- If there is a Red Team finding, it is not hidden.

## 5. Working Group Charter

When creating a new working group, leave a charter.

```text
WG CHARTER:
- name:
- mission_id:
- problem:
- chair:
- participants:
- inputs:
- deliverable:
- decision board:
- meeting/event trigger:
- disband condition:
```

In an LLM runtime, a WG may be a separate agent or a stage of internal reasoning within a single agent. What matters is that the charter, output, and disband condition are all explicit.

## 6. Agent-Meeting Anti-Patterns

Patterns to avoid:

- A structure where every agent independently produces a long answer to the same question with no integrator.
- A structure with no distinction between a board and a working group.
- A structure where Red Team holds execution authority.
- A structure that presents only a long background explanation to the user without a decision packet.
- A structure where a body remains alive indefinitely with no disband condition.
- A structure where the SITREP becomes a status dump that does not help the commander decide.

## 7. Connecting B2C2WG and Event Sourcing

Every body's activity must be left in the event log.

| Event | Meaning |
| --- | --- |
| `WorkingGroupOpened` | Charter created |
| `DecisionPacketPrepared` | A packet is created to bring to the board |
| `BoardDecisionMade` | Commander decision recorded |
| `FRAGOIssued` | Scope/priority/authority change |
| `WorkingGroupClosed` | Deliverable complete or disbanded |
| `SITREPIssued` | Current ops state reported |
| `AARIssued` | Phase learning recorded |

Projections:

- The dashboard shows active WGs, pending decision packets, the Red approval queue, and the latest SITREP.
- The CoS generates an agenda by reading the event log.
- The Evaluator connects board decisions to whether they led to actual effect, in the AAR.

## 8. Application in a Single Agent

Even a single agent uses the B2C2WG order of reasoning.

```text
1. S2 Research WG: check needed evidence and uncertainty
2. S3 Execution Cell: decompose into executable steps
3. S6 KM Bureau: define documents and state to be stored
4. Red Team WG: check failure modes
5. CoS Integration: remove conflicts and write the decision packet
6. Commander Board: the user or commander rule decides
```

The output is compressed into the packet the commander needs, not the entire internal reasoning.

## 9. Implementation Candidates

Schema candidates:

- `working-group.schema.json`
- `decision-packet.schema.json`
- `board-decision.schema.json`
- `battle-rhythm-event.schema.json`

Prototype candidates:

- `battle-rhythm-scheduler.js`: reads the event log and proposes the next board/WG event.
- `decision-packet-linter.js`: validates for missing options, risk, authority, and evidence.
- Dashboard panel: active WGs, pending packets, next decision deadline.

## 10. Source Anchors

- Joint Headquarters Organization, Staff Integration, and Battle Rhythm Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_hq_org_fp.pdf
- Chief of Staff Roles and Functions Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/cos_fp.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507

## 11. Conclusion at This Stage

The core of B2C2WG is not holding many meetings. It is separating the place of analysis from the place of decision by problem type, and letting information flow through the battle rhythm.

In the LLM framework, this is implemented through the following rules.

1. A working group produces a decision packet.
2. A board decides only approval, priority, risk acceptance, and FRAGO.
3. The CoS integrates every agent's output into a commander-readable packet.
4. The dashboard shows decision relevance, not raw logs.
5. Every packet and decision is left in the event log.
