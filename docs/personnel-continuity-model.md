# Personnel Continuity Model

## 0. Purpose

A military organization must continue to function even when soldiers and commanders die, are wounded, are transferred, or are rotated out. This document applies that organizational operating principle to the LLM runtime.

The core principle is not to "preserve the person" but to "preserve the role/position, authority, records, training, succession line, and handoff."

```text
person disappears
-> role remains
-> succession rule activates
-> authority boundary transfers or pauses
-> handoff packet and vital records restore context
-> readiness gate limits autonomous action
-> AAR updates training and SOP
```

## 1. Official Source Anchors

- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- Federal Continuity Directive planning framework: https://www.fema.gov/sites/default/files/documents/fema_federal-continuity-directive-planning-framework.pdf
- Executing Knowledge Management in Support of Mission Command: https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf
- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716

## 2. Principles

| Principle | Military Meaning | LLM Runtime Application |
| --- | --- | --- |
| Role continuity | The person may disappear, but the role/position remains | Treat the role id, not the agent instance, as the source of truth |
| Succession depth | Successors are designated in multiple tiers, not just one | Commander, CoS, S6, and release owner have succession at least 2 levels deep |
| Delegated but bounded authority | The successor does not automatically acquire full authority | Green/Amber authority continues, while Red/Black/risk acceptance/external release remain restricted as retained authority |
| Vital records | Reconstruction is only possible if essential records exist | OPORD, authority matrix, event log, handoff packet, source map |
| Battle handover | A handover is not a simple notification but overlap, backbrief, and rehearsal | Overlap, backbrief, and verification gate before rotation |
| Training pipeline | A person is not replaced on the spot | Successor readiness and METL evidence constrain authority |
| Degraded mode | When personnel are reduced, some functions stop | Block release/deploy/scope change upon loss of a critical role |

## 3. Mechanisms by Which the Organization Withstands Personnel Loss

### 3.1 The Role Precedes the Person

In the LLM runtime, `S2`, `S3`, `S6`, `CoS`, and `Commander` are roles/positions, not specific model sessions.

A role/position has the following:

- mission-essential functions
- authority boundary
- source-of-truth files
- readiness requirement
- successor chain
- handoff duties
- do-not-do boundary

Therefore, when an agent changes, the new agent does not "understand from scratch" — it takes over the role's packet.

### 3.2 The Succession Line Is Written Pre-Event

Defining the succession line after the commander or a key staff member has disappeared is too late.

The succession line determines the following in advance:

- Who is the 1st, 2nd, and 3rd successor?
- Under what trigger does succession activate?
- Which authorities transfer automatically, and which are held in abeyance?
- If the successor's readiness is insufficient, which functions are suspended?
- Who is notified?

In the LLM runtime, `schema-files/continuity-plan.schema.json` represents this plan.

### 3.3 Authority Does Not Transfer in Full

It is dangerous for a successor to gain all decision-making authority simply because a person is absent.

| Authority | Normal Succession | Restriction |
| --- | --- | --- |
| routine status update | Transferable | Requires source of truth |
| Green/Amber tool action | Possible if readiness is met | Policy gate maintained |
| Red action approval | Held in abeyance absent predelegation | Commander retained |
| Black action | Not transferable | Remains prohibited |
| risk acceptance | Commander retained | Requires explicit decision |
| final/external release | Requires release review owner | Requires target-specific review |
| OPORD scope change | Requires FRAGO | Affected role backbrief/rehearsal |

### 3.4 The Handoff Is Not a Context Dump

The handoff packet is not a "conversation summary" but an operational document that allows the next executor to enter the chain of command immediately.

Required elements:

- current order
- commander intent
- pending decision
- active risk
- last verification
- source-of-truth files
- authority boundary
- successor duty
- do-not-do list

The existing `schema-files/handoff-packet.schema.json` addresses context transition. The new `continuity-plan.schema.json` defines the circumstances under which a handoff is mandatory.

### 3.5 Rotation Includes Overlap

A normal rotation must be safer than a loss situation. Therefore, an overlap period between the outgoing role and the incoming role is required.

Rotation checklist:

1. The outgoing role locks down the current state into a packet.
2. The incoming role delivers a backbrief.
3. The CoS or S6 verifies the source-of-truth files.
4. High-risk functions are rehearsed.
5. Temporary acting authority is recorded in the authority matrix.
6. Handoff quality is recorded in the AAR/readiness ledger.

## 4. LLM Operating Model

### 4.1 The Agent Instance Is Expendable

Assume that the model session, sub-agent, and tool worker can disappear at any time.

Therefore, the following are prohibited:

- Storing important decisions only in chat memory.
- Acting on "as I recall" without a source.
- A single-agent critical path with no successor.
- Continuing a long-running task without a handoff.
- Delegating Red/Black boundary authority to a successor with low readiness.

### 4.2 The Source of Truth Retains Command Authority

Priority order for resuming work:

1. event log / projection
2. current OPORD / FRAGO
3. authority matrix / approval scope
4. handoff packet
5. decision packet / CCIR alert
6. README / source-map / compendium
7. chat history

Chat history is the last-resort supplementary reference.

### 4.3 Degraded Mode

When a key role disappears, the runtime degrades on a per-function basis.

| Loss | Can Continue Immediately | Held in Abeyance |
| --- | --- | --- |
| Commander | routine execution within prior OPORD | new Red approval, risk acceptance, scope change |
| CoS | role-local work | cross-role priority change |
| S2 | existing sourced facts | new source reliability override |
| S3 | current approved tasks | new execution sequence |
| S4/S6 | local docs | release, deploy, tool maintenance decision |
| Recorder/KM | already logged work | handoff, source map, AAR closure |

## 5. Continuity drill

Continuity is verified through drills, not documents.

Drill questions:

- Who becomes the acting integrator if the Commander is absent?
- Can the event log, handoff, and source map be located even without S6?
- Can the incoming role explain the current order without chat history?
- Does the gate block if the release review target changes?
- Does the AAR lead to a readiness/SOP update?

Implementation artifacts:

- `schema-files/continuity-plan.schema.json`
- `sample-payloads/valid-continuity-plan.json`
- `sample-payloads/invalid-continuity-plan-single-point-failure.json`
- `continuity-drill-runner.js`
- `run-continuity-drill-fixtures.js`

## 6. Prompt guard

```text
When a long-running task or role change occurs:
1. Confirm which role the current task belongs to.
2. Check the successor chain in the continuity plan.
3. Read the handoff packet and source-of-truth files first.
4. Do not automatically inherit Red/Black, release, risk acceptance, or scope change authority.
5. The incoming role executes only after delivering a backbrief.
6. Record an AAR/readiness update after succession or rotation.
```

## 7. Conclusion

The reason a military organization withstands personnel loss and rotation is not that it trusts individuals. It is because the role/position, succession, authority restrictions, vital records, training, handoff, and after-action learning outlast the person.

The LLM runtime must operate the same way. Agents may disappear, but the mission, intent, authority, event log, source map, handoff packet, and readiness ledger must remain.
