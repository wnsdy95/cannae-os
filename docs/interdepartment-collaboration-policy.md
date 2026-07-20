# Interdepartment Collaboration Policy

## 0. Purpose

This document converts the way different military branches and functions cooperate into an interdepartment collaboration policy for LLM/agent organizations.

Military branch cooperation is not merely "helping each other." Command and control, intelligence, maneuver/execution, fires/effects, sustainment, protection, and information operations each hold distinct expertise but are integrated into a single commander's intent and operational effect. In an LLM runtime as well, if research, execution, tools/sustainment, protection/release, Red Team, and Recorder/KM each produce only their own deliverable, the mission breaks down.

Core conversion:

```text
Military branch cooperation = task-organized combined arms under mission command
AI department cooperation = mission-organized cross-functional cells under bounded authority
```

## 1. Official Source Anchors

- ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715
- FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282
- JP 3-0, Joint Campaigns and Operations: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- Joint Headquarters Organization, Staff Integration, and Battle Rhythm Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_hq_org_fp.pdf
- Joint Task Force and Command and Control Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf

## 2. Principles to Draw from Military Branch Cooperation

| Military-Style Principle | Meaning | AI Department Cooperation Application |
| --- | --- | --- |
| Combined arms | Combining different functions produces an effect no single function could produce alone | S2/S3/S4/S6/Protection/Recorder align their deliverables to a single desired effect |
| Warfighting functions | Combat power comes from integrating command, intelligence, movement, fires, sustainment, protection, and information | Connect research, execution, tooling, release, risk, and documentation to the same mission state |
| Supported/supporting relationship | Not every department is a co-commander. A main effort is designated for a given phase, and the rest support it | For each phase, designate the supported department and fix the supporting departments' output, deadline, and handoff interface |
| Liaison | Maintains meaning-conversion and information flow between functions/organizations | Assign a liaison role and update cadence for every interdepartment dependency |
| Battle rhythm | Information, analysis, decision, and execution cycle on a fixed schedule | Establish sync events, decision boards, SITREP, and AAR cadence |
| Common operating picture | Every function works from the same situational display | Treat the source map, event log, dashboard projection, and current order as the source of truth |
| Deconfliction | Coordinate in advance so actions do not conflict | Escalate conflicts over file ownership, release target, tool action, and authority boundary to the CoS/Commander queue |

## 3. Department Model

An LLM organization's departments are divided by functional responsibility, not by headcount of people/agents.

| Department | Military Function Equivalent | Default Responsibility | Default Deliverable |
| --- | --- | --- | --- |
| Command / CoS | Command and control | Intent, priority, conflict coordination, decision packets | OPORD, FRAGO, decision packet |
| Research / S2 | Intelligence | Sources, uncertainty, source conflict, PIR | Source map, evidence packet |
| Operations / S3 | Movement and maneuver | Execution order, tasking, rehearsal, dependencies | Task order, execution plan |
| Effects / Executor | Fires/effects | Changing target state, code/doc/tool actions | Target-effect log, implementation diff |
| Sustainment / S4/S6 | Sustainment and signal | Tools, resources, context, fallback, KM | Maintenance report, PACE, handoff |
| Protection / Release | Protection and OPSEC | EEFI, release review, rollback, risk guard | Release review, context filter |
| Red Team / Evaluator | Assessment and risk | Failure mode, contradiction, abuse case | Risk finding, AAR finding |
| Recorder / KM | Information and records | Source of truth, event log, decision memory | Event log, handoff packet, AAR |

## 4. Collaboration Policy

### 4.1 Mission-First Task Organization

Departments are task-organized to fit the mission phase, not fixed into a static organization chart.

```text
For each phase, always determine:
- supported department: the main effort of that phase
- supporting departments: the functions that enable the main effort
- required support outputs
- handoff interface
- escalation trigger
```

Example:

| Phase | Supported Department | Supporting Departments |
| --- | --- | --- |
| Research verification | Research/S2 | Recorder, Red Team, Protection |
| Execution planning | Operations/S3 | Research, Sustainment, Protection |
| High-risk execution | Effects/Executor | Operations, Sustainment, Protection, Recorder |
| External release | Protection/Release | Research, Recorder, Commander |

### 4.2 The Supported Department Is Not the Decision-Maker

A supported department holds integration responsibility for that phase but does not take on commander-retained authority.

Not automatically transferable:

- Red tool approval.
- External release approval.
- Acceptance of high/critical residual risk.
- A FRAGO changing mission scope.
- Changes to the authority matrix.

These items always escalate to the Commander or the explicitly designated approval authority.

### 4.3 Supporting Department Responsibility Is Written as an Output Contract

"S2 will help" is not a policy. Support is written as a deliverable contract like this:

```text
Supporting department:
Required output:
Quality gate:
Due before:
Handoff interface:
Escalation trigger:
Source of truth:
```

Without this contract, cooperation becomes a favor, and favors get dropped.

### 4.4 Liaison Rule

Whenever there is a dependency between two departments, a liaison rule must exist.

A liaison is not a decision-maker. A liaison ensures:

- That terminology and intent are interpreted with the same meaning.
- That it is clear which information is raw, summary, redacted, or denied.
- That changes are reflected in the task order, source map, release review, and handoff.
- That conflicts are escalated to the CoS/Commander decision queue rather than left as an interdepartment dispute.

### 4.5 Conflict Resolution

Departments do not resolve conflicts by arbitrary mutual compromise.

| Conflict Type | Default Route |
| --- | --- |
| Source conflict | S2 source review -> CoS decision packet |
| Execution vs. safety | S3/Protection -> Commander decision |
| Tool availability | S4/S6 maintenance report -> CoS priority |
| Release target mismatch | Protection/Release -> Commander release decision |
| Scope change | S3 FRAGO draft -> Commander |
| Documentation/state mismatch | Recorder -> CoS handoff sync |

If a conflict touches mission intent, authority, release, or risk, a decision packet is required.

## 5. Execution Procedure

```text
1. Mission intake
   - Confirm objective, end state, constraints

2. Function mapping
   - Identify the functional departments needed
   - Record each department's owner, output, and authority boundary

3. Build the supported/supporting matrix
   - Designate the supported department and supporting departments per phase

4. Set up liaison and interface
   - Assign liaison, cadence, and handoff interface per dependency

5. Synchronization
   - Set up battle rhythm events, SITREP, decision points, and CCIR

6. Execute and deconflict
   - The CoS integrates department outputs
   - Escalate conflicts to a decision packet

7. Handoff and AAR
   - The Recorder stores the event log, source of truth, unresolved risk, and next action
```

## 6. Required Collaboration Charter Fields

This repository's execution contract is `schema-files/department-collaboration-charter.schema.json`.

Required elements:

- `departments`: department, function, lead role, responsibilities, deliverables, authority boundary, source of truth.
- `relationships`: supported/supporting relationship, support type, required outputs, handoff interface, escalation trigger.
- `liaison_rules`: liaison role per dependency, information exchanged, cadence, conflict route.
- `synchronization`: battle rhythm, decision points, dependency matrix.
- `conflict_resolution`: conflict decision-maker, whether a decision packet is required, commander escalation condition.
- `collaboration_controls`: source-map, glossary, no silent scope change, AAR, handoff discipline.
- `information_policy`: need-to-know, context sharing, EEFI controls.
- `exit_criteria`: success, abort, handoff.

## 7. Anti-Patterns

- Every department reports to the user simultaneously.
- Research, execution, release review, and recorder are merged into the same role.
- A dependency exists between departments but there is no liaison.
- The supported department takes on commander-retained authority.
- Only the word "collaboration" exists, with no required output, due point, or handoff interface.
- Conflicts are handled through long debate instead of a decision packet.
- There is no shared source of truth, so each department sees a different reality.
- The same collaboration structure is reused for the next mission without an AAR.

## 8. Conclusion

The core of an interdepartment collaboration policy is not friendly communication. It is enforcing the supported/supporting relationship per mission phase, liaison, output contracts, a shared source of truth, a conflict decision route, and AAR.

In an LLM runtime, this model is summarized in one sentence:

> Multiple departments cooperating does not mean each does its own job well; it means contracting so that each department's output becomes the execution condition for the next department.
