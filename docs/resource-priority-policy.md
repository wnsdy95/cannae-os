# Resource Priority Policy

## 0. Purpose

This document defines how contested runtime resources are allocated when there is not enough for everyone: which mission or department receives priority of support, who is preempted first when a resource class runs short, which allocation decisions the commander retains, how starvation of low-priority work is prevented, and how a priority change is ordered.

Position among sibling documents:

- `sustainment-agent-sop.md` defines how the S4 detects that a resource class is contested and reports it. This policy defines what happens next: who gets the resource.
- `maintenance-readiness-model.md` defines the Green/Amber/Red resource classes this policy is triggered by.
- `interdepartment-collaboration-policy.md` defines the supported/supporting relationship this policy reuses as its priority backbone.

Scope: tokens, wall-clock time, API quota, tool capacity, and context-window budget, as classed in `sustainment-agent-sop.md` section 2. This policy governs allocation between competing tasks, departments, and missions; it does not govern whether an action is authorized at all, which remains the authority matrix's question.

## 1. Doctrinal basis

- `Claim`: Sustainment doctrine allocates limited resources through an explicit priority of support tied to the concept of operations, so that the main effort is resourced first and shortfalls are taken deliberately, not by whoever asks last (ADP 4-0, Sustainment).
- `Claim`: Joint logistics doctrine treats prioritization and allocation of common resources across competing demands as a command function informed by the logistics staff, not a staff function alone (JP 4-0, Joint Logistics).
- `Claim`: Joint operations doctrine designates supported and supporting relationships so that, for a given phase or effect, one commander's requirements have precedence and the others resource them (JP 3-0, Joint Campaigns and Operations).
- `Interpretation`: In the LLM runtime, priority of support means that when tokens, quota, time, tool capacity, or context budget are contested, allocation follows the phase's designated main effort, not request order, not agent seniority, and not loudness of retry loops.
- `Application`: Every mission phase carries a priority of support annotation derived from the department collaboration charter. The S4 allocates within it; conflicts it cannot resolve inside the annotation escalate to the commander queue.

## 2. Priority of support by phase and main effort

The supported department of the current phase (per `interdepartment-collaboration-policy.md` section 4.1) is the main effort and holds first claim on every contested resource class.

Allocation order within a phase:

1. The supported department's tasks on the phase's critical path.
2. Supporting departments' output contracts due to the supported department this phase.
3. Standing overhead that protects the source of truth: event log, evidence store, checkpoint writes.
4. Other departments' in-phase work.
5. Deferred and opportunistic work.

Rules:

- Priority of support is written into the mission order or its sustainment annex at planning time. If a phase has no written priority, the S4 must request one rather than invent one.
- Priority follows the phase, not the department. A department that was the main effort in the last phase holds no residual claim in this one.
- Overhead class 3 is never allocated to zero. A runtime that saves tokens by dropping event logging and checkpoints has traded endurance and auditability for throughput, which is a commander decision, never an allocation outcome.

## 3. Preemption rules

When a resource class goes Amber or Red, someone loses quota. Preemption runs in reverse allocation order.

| Preemption step | Who loses first | Mechanism |
| --- | --- | --- |
| 1 | Deferred and opportunistic work | Suspended outright; checkpoint written |
| 2 | Other departments' in-phase work | Reduced to minimum sustaining allocation (section 5) |
| 3 | Supporting departments' non-contracted activity | Cut back to contracted outputs only |
| 4 | Supporting departments' contracted outputs | Only by commander decision, because it breaks an output contract |
| 5 | Supported department's critical path | Only by commander decision, because it changes the phase outcome |

Rules:

- Preemption at steps 1 through 3 is S4 discretion, reported in the next SITREP.
- Preemption at steps 4 and 5 is a commander decision presented as a decision packet: what is cut, what output is lost, what deadline or quality changes.
- A preempted task is always checkpointed before suspension, per `sustainment-agent-sop.md` section 4. Preemption without a checkpoint is a resource loss, not a resource transfer.
- Retry storms have no claim: a task in a retry loop is capped at its bounded retry budget regardless of its priority tier.

## 4. Commander-retained decisions vs S4 discretion

| Decision | Holder |
| --- | --- |
| Reallocating within a written priority of support | S4 discretion, reported in SITREP |
| Preemption steps 1-3 | S4 discretion, reported in SITREP |
| Preemption steps 4-5 (breaking a contract or the critical path) | Commander |
| Changing the priority of support itself | Commander, via FRAGO |
| Raising a mission's total budget (tokens, cost, deadline) | Commander |
| Trading output quality or scope for resource savings | Commander |
| Zeroing the source-of-truth overhead class | Never delegable |
| Cross-mission reallocation between concurrent missions | Commander, via FRAGO to both missions |

- `Interpretation`: This split mirrors risk-acceptance authority in `risk-acceptance-authority.md`: the staff optimizes inside the boundary the commander drew; only the commander moves the boundary.
- `Application`: A commander-retained resource decision is recorded as an event with the decision, the alternatives presented, and the accepted loss, so the AAR can evaluate whether the priority scheme itself was wrong.

## 5. Starvation prevention

A strict priority scheme starves the lowest tier. Doctrine avoids this by making shortfalls deliberate and visible; the runtime does the same with three controls.

| Control | Rule |
| --- | --- |
| Minimum sustaining allocation | Any active task retains enough budget to checkpoint, report status, and hand off. Below this floor a task must be formally suspended, not silently starved |
| Aging report | Any task preempted or held below its planned allocation across two consecutive battle-rhythm sync events appears in the SITREP as an aging entry with time-in-starvation |
| Starvation trigger | A task aging across a phase boundary, or any starving task whose output is an EEFI/protection or audit function, becomes a CCIR entry: the commander either resources it, re-schedules it by FRAGO, or explicitly cancels it |

- `Interpretation`: The goal is not fairness; it is honesty. A task the organization will never resource should be cancelled by decision, not left to rot in the queue while its owner believes it is pending.
- `Research Gap`: Whether protection and audit functions should hold a hard reserved budget slice, rather than starvation-trigger protection only, needs adversarial testing against resource-exhaustion scenarios.

## 6. Ordering a priority change

Priority changes are ordered, not improvised.

- The standing priority of support lives in the mission order or its sustainment annex.
- Any change to it, including phase re-designation of the main effort, cross-mission reallocation, and budget raises, is issued as a FRAGO event (`schema-files/frago-scope-change.schema.json`), stating the new priority, the effective phase, and which allocations are reversed.
- An urgent verbal-equivalent decision in the commander queue is valid immediately but must be regularized as a FRAGO event before the next sync event, or it lapses.
- The S4 may not honor an ad hoc priority claim ("this is urgent, take S2's quota") from any agent, including the supported department. The claim routes to the commander queue as a conflict, per `interdepartment-collaboration-policy.md` deconfliction.
- Every allocation, preemption, and priority change is an event, so the dashboard projection can always answer: who holds priority now, who was preempted, and under which order.

## 7. Prompt guard

```text
Resource priority check before reallocating anything.
1. What is the written priority of support for the current phase?
2. Is the requested allocation inside it, or does it break a contract or the critical path?
3. If preempting: which step of the preemption order is this, and is it S4 discretion or a commander decision?
4. Has the preempted task been checkpointed and its aging recorded?
5. Is this change ad hoc? If it changes the priority itself, where is the FRAGO?
```

## 8. Source anchors

- ADP 4-0, Sustainment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796
- JP 4-0, Joint Logistics: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/
- JP 3-0, Joint Campaigns and Operations: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf

## 9. Implementation Candidates

schema:

- `priority-of-support.schema.json`
- `resource-allocation-event.schema.json`
- `preemption-decision-packet.schema.json`

prototype:

- `resource-priority-runner.js`
- `preemption-router.js`
- `starvation-aging-projector.js`
- `run-resource-priority-fixtures.js`
