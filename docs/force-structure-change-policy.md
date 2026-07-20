# Force Structure Change Policy

## 0. Purpose

This document converts the military's force management, force development, and force documentation principles into a policy for creating/retiring, and expanding/reducing, branches and units within an LLM/agent organization.

Organizational change is not the act of adding a good idea to an org chart. From a military perspective, organizational change is a decision that moves capability gap, mission, doctrine/procedure, personnel, training, materiel/tools, sustainment, facilities/environment, policy, budget, readiness, and documentation together.

The same applies in an LLM runtime. Before creating a new agent role, department, TF, runner, dashboard panel, or approval board, the following questions must be answered first.

```text
Is this capability impossible to perform with the existing organization?
If a new organization is created, who commands it and who supports it?
Can the personnel/tool/context/verification/documentation maintenance cost be sustained?
When will it be eliminated or reduced?
Where do the function and its records go after retirement?
```

Multinational-application caution:

- DOTMLPF-P and force-management terminology are US-derived vocabulary.
- This framework retains the `dotmlpf_p` field for existing schema compatibility, but multinational/civilian application documents should also note it as a `capability lifecycle review`.
- When applying this to another military's organization/branch/unit changes, separately verify the local doctrine, laws, approval authority, and readiness system.

## 1. Official Source Anchors

- AR 71-32, Force Development and Documentation: https://history.army.mil/Portals/143/Images/Covid/PDF/r71_32.pdf
- DA PAM 71-32, Force Development and Documentation Consolidated Procedures: https://www.afms.edu/digitallibrary.html
- How the Army Runs, U.S. Army War College / Army Force Management School: https://warroom.armywarcollege.edu/reference-materials/
- Force Management Functional Area, DA PAM 600-3 excerpt: https://api.army.mil/e2/c/downloads/2024/04/03/1074fa08/force-management-fa-50-da-pam-600-3.pdf
- Army Force Management School digital library: https://www.afms.edu/digitallibrary.html

## 2. Principles to Draw from Military-Style Force Management

| Military-Style Principle | Meaning | AI Organization Application |
| --- | --- | --- |
| Capability requirement | An organization exists because of a capability requirement | A new agent/department must have a clear mission gap |
| DOTMLPF-P review | Before an organizational change, alternatives in doctrine, organization, training, materiel, leadership, personnel, facilities, and policy are examined | First check whether it can be solved by adjusting prompts/SOPs/schemas/training/tool authority |
| Force development | Converts a capability requirement into organizational design and documentation | Turn role, authority, outputs, readiness gate, and source of truth into a contract |
| Force documentation | Approved organizational requirements and authorizations are recorded in documents | Schemas, sample payloads, runners, and README/source-map are the official record of the organizational change |
| Life cycle | An organization has a cycle of creation, operation, assessment, transition, and retirement | A standing role/TF must have activation, sustain, resize, deactivate, transfer, and AAR |
| Affordability/supportability | Even a good organization fails without sustainment | Evaluate token, context, tool, maintainer, dashboard, and test cost |
| Readiness | An organization is assessed not by its existence but by its readiness state | Link T/P/U/X readiness to authority |

## 3. Targets of AI Organizational Change

Change targets are divided into four types.

| Target | Example | Change Judgment Criterion |
| --- | --- | --- |
| Role / Position | S2 source reviewer, release authority, recorder | Is the recurring mission and authority boundary clear? |
| Department / Branch-like function | Research, Operations, Sustainment, Protection | Is the functional output an execution condition for another function? |
| Unit / Team-like group | Standing release cell, dashboard cell, AAR WG | Is there a continuing mission and need for a battle rhythm? |
| TF / Temporary organization | SOF TF, incident response TF | Can it be disbanded after a specific high-risk/high-uncertainty mission? |

## 4. Criteria for Creating an Organization

A new role/department/unit/TF must satisfy all of the following conditions.

1. There is a clear capability gap.
2. It cannot be solved, or would be inefficient to solve, by adjusting the existing organization/SOP/schema/training/tools.
3. The mission-essential task and deliverable are defined.
4. The authority boundary and commander-retained decisions are defined.
5. The supported/supporting relationship and liaison are defined.
6. There is a source of truth and a documentation owner.
7. There is a readiness gate and validation fixtures.
8. There is a sustainment cost and a fallback.
9. There is an activation/deactivation or review trigger.
10. There are criteria, after an AAR, for whether to sustain, reduce, or retire it.

Do not create when:

- A one-off task is being made into a permanent department.
- An existing role is being added again under a different name.
- Approval authority/reporting line/source of truth is unclear.
- It would have to be operated from human memory alone, with no runner/test/fixture.
- There is no maintainer and no retirement condition.

## 5. Criteria for Retiring an Organization

Retiring an organization is not deleting a file. It is transferring function and records.

Retirement conditions:

- The mission gap has disappeared.
- The function has been absorbed into another department.
- It is no longer used repeatedly.
- The maintenance cost exceeds the effect.
- Readiness has been repeatedly U/X with no recovery plan.
- The authority boundary is risky or duplicated, raising incident likelihood.

Required work before retirement:

```text
1. Confirm whether the capability is still required
2. Designate the successor role/department
3. Transfer or withdraw authority and approval scope
4. Preserve the source-of-truth files
5. Remove or replace dashboard/runner/schema/sample references
6. Write a handoff packet
7. Record an AAR/readiness update
```

## 6. Criteria for Expansion

Expansion means increasing capability, coverage, readiness, and throughput — not increasing agent headcount.

Expansion conditions:

- A backlog or alert queue persistently exceeds a threshold.
- A mission-critical output is a bottleneck.
- A single position is a continuity risk.
- The scope of the same function has split, requiring an independent cell.
- Higher readiness or 2-deep succession is needed.

Do not expand when:

- The root cause is SOP ambiguity, and only headcount is being increased.
- Only executors are increased without a quality gate.
- Execution is expanded without a control function such as Red Team/release/Recorder.
- The source of truth is split, breaking the common operating picture.

## 7. Criteria for Reduction

Reduction is not only about cost savings; it is about reducing complexity and coordination cost.

Reduction conditions:

- Workload has decreased.
- Redundant functions have been discovered.
- Automation or a schema/runner has replaced repetitive work.
- Mission priority has dropped.
- Interdepartment handoffs are so numerous that coordination cost exceeds the value of the output.

To confirm before reducing:

- Can the remaining organization handle the essential function?
- Is the continuity plan still 2-deep?
- Is release/risk/authority-retained decision-making not weakened?
- Do the source-map, README, and validator fixtures avoid creating orphans?

## 8. Organizational Change Procedure

```text
1. Identify
   - Identify capability gap, overload, redundancy, risk, or mission change

2. Analyze alternatives
   - Examine DOTMLPF-P alternatives: SOP, schema, training, tool, authority, policy adjustment

3. Design
   - Design the role/department/unit/TF structure, authority, outputs, and support relationship

4. Validate
   - Confirm readiness, sustainment, source of truth, fixture, runner, and release/risk guard

5. Approve
   - Approve via a CoS or Commander decision packet

6. Document
   - Update schema/sample/README/source-map/compendium

7. Transition
   - Execute activation, resizing, deactivation, transfer, handoff

8. Assess
   - Judge sustain/expand/reduce/retire via AAR and readiness update
```

## 9. Force Structure Change Order

This repository's execution contract is `schema-files/force-structure-change-order.schema.json`.

Required elements:

- `change_type`: create, activate, expand, reduce, merge, split, deactivate, disband.
- `target`: the kind, id, and current/proposed state of the change target.
- `capability_gap`: which capability gap, redundancy, risk, or overload it resolves.
- `alternatives_considered`: whether alternatives other than organizational change were reviewed.
- `dotmlpf_p`: impact on doctrine, organization, training, materiel/tooling, leadership, personnel/agent, facilities/context, and policy.
- `authority`: approver, commander-retained decision, restrictions.
- `resources`: maintainer, tool, context, token/time, dashboard/test cost.
- `readiness`: readiness evidence, METL, successor/backup, validation fixture.
- `transition_plan`: activation/deactivation, handoff, data migration, rollback.
- `documentation_updates`: schema, sample, runner, source-map, README, compendium.
- `assessment`: MOP/MOE, AAR trigger, review date, sunset/disband condition.

## 10. AI Application Examples

| Situation | Wrong Response | Force-Structure Approach |
| --- | --- | --- |
| Release review is frequently blocked | Add a release agent | Analyze the gap, review whether to create a release cell, strengthen the source-map/release runner |
| Research is slow | Deploy 5 S2 agents | Review whether to separate source intake from source reliability |
| Documentation is repeatedly missed | Manually invoke the Recorder every time | Create a standing KM bureau or dashboard cue |
| A TF is used once and then left unattended | Keep maintaining it | Sunset condition, AAR, disband order |
| Multiple runners are slow | Skip verification | Expand the maintenance/sustainment cell or group the runners |

## 11. Anti-Patterns

- Creating a new department or agent the moment a problem is seen.
- Creating a role in name only, with no authority or responsibility.
- Creating a standing TF with no retirement condition.
- Deleting files during a reduction with no function transfer.
- Increasing only executors during an expansion, without increasing protection/recorder/release gates.
- Ending an organizational change with just a README link addition.
- Not leaving an AAR/readiness update after an organizational change.

## 12. Conclusion

The force structure of an AI organization is not "how many agents exist," but "which capability requirement is handled by which organizational structure and document contract."

An organization should be created when needed, grown with evidence, reduced when ineffective, and eliminated when its mission ends. That entire process must be recorded through approval, documentation, transfer, verification, and AAR.
