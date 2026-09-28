# Handoff Packet Template

## 0. Purpose

Conversation history is not the source of truth. The event log, evidence store, decision log, and doctrine docs are. Every long-running task must leave behind a handoff packet and a current projection so that the next operator can resume without any chat history.

The machine contract for a handoff packet already exists in `schema-files/handoff-packet.schema.json`, and `handoff-generator.js` already produces a draft packet from event projections and alert routing. What has been missing is the authoring standard: what each section must and must not contain, when a packet is mandatory, and the quality gate a packet must pass before it counts as a valid context transition.

This document is that authoring template and quality gate. It extends `knowledge-management-sop.md` section 6 (which states the rule that a packet must exist) and does not restate its knowledge management principles. It documents the human- and agent-facing procedure over the existing schema; it does not redefine the contract.

## 1. Doctrinal Basis

- `Claim`: Military knowledge management doctrine holds that knowledge has value only when it is findable, transferable, and usable by the receiving staff — transfer of duties depends on organized records, not on the departing officer's memory.
- `Claim`: Knowledge management governance (CJCSI 5780.01 Knowledge Management; USFK Knowledge Management Program) assigns an owner, a procedure, and a repository, rather than trusting informal continuity.
- `Interpretation`: In an LLM runtime, the departing "officer" is a context window. A context transition without a structured packet is the equivalent of a duty rotation with no continuity file: the next operator inherits an empty desk.
- `Application`: The handoff packet is the mandatory continuity file for every context transition, and this template is the standard against which each packet is reviewed.
- `Research Gap`: Public doctrine describes battle handover and staff transition procedures qualitatively; there is no published quantitative standard for "how much continuity content is enough." The quality checklist in section 6 is therefore a framework-internal standard, to be recalibrated through AAR findings.

## 2. Relationship to Existing Artifacts

| Artifact | Role in the handoff pipeline |
| --- | --- |
| `schema-files/handoff-packet.schema.json` | Machine contract. Defines the required fields and their types. Structural validity only |
| `handoff-generator.js` | Draft producer. Projects the event log and alert queue into a first-cut packet |
| `knowledge-management-sop.md` section 6 | Doctrine. States when the packet concept applies and the resumption rules |
| This document | Authoring template and review standard. Defines content quality per section and the acceptance gate |

Operating rule: the generator output is the draft; this template is the review standard. A schema-valid packet that fails the section 4 must/must-not rules or the section 6 checklist is not an acceptable handoff. The reviewer (S6 or CoS per the knowledge review rhythm) edits the draft until it passes, then records the packet as the handoff of record.

## 3. When a Handoff Packet Is Mandatory

| Trigger | Description | Packet owner | Deadline |
| --- | --- | --- | --- |
| Role rotation | An agent instance or duty position is replaced, per `personnel-continuity-model.md` | Outgoing role holder, reviewed by S6 | Before the successor is activated |
| Context limit | The active context approaches its budget and will be compacted or restarted | The active agent | Before compaction, while full context is still available |
| Wave end | A mission wave or phase closes, per the wave closeout procedure | S6, from the wave report | At wave closeout, before the next wave plan is issued |
| Escalation | Work stops pending a commander decision on a Red action or scope change | The escalating agent | Attached to the escalation itself |
| Long-running pause | The mission is suspended with no scheduled resumption | S6 | Before the pause takes effect |

If a trigger fires and no packet exists, that is a knowledge management failure condition in the sense of `knowledge-management-sop.md` section 9, and it is a demotion-relevant finding for the responsible role under `training-progression-model.md`.

## 4. Section-by-Section Template

The field order below mirrors `schema-files/handoff-packet.schema.json`. Every field is required by the schema; "empty" is expressed by an explicit negative statement (for example "No pending commander decisions."), never by omission.

| Field | Must contain | Must not contain |
| --- | --- | --- |
| `schema_version` | The literal `"0.1"` | Any other value |
| `type` | The literal `"HandoffPacket"` | Any other value |
| `id` | A unique packet id (`HP-` prefix by convention) | A reused id from a previous packet |
| `mission_id` | The id of the mission being handed off | A conversation or session identifier |
| `created_by` | The role that authored the packet | A model name or human name in place of a role id |
| `classification` | The highest classification of any content referenced by the packet | A label lower than the most sensitive referenced item |
| `current_order` | The id of the order in effect at handoff time | A summary of the order in place of its id |
| `commander_intent` | The intent of the current order: purpose, end state, and authority boundary, carried over faithfully | Reworded intent that widens or narrows scope; the successor inherits the order, not a paraphrase |
| `completed` | Verifiable results with evidence pointers (files, receipts, passing runners) | Activity narration ("worked on X") without a checkable result |
| `in_progress` | Current state of each open task and the exact resumption point | Intentions or plans (those belong in `next_actions`) |
| `blocked` | Each blocker, what unblocks it, and the authority able to unblock it | Blockers with no named unblocking condition |
| `pending_decisions` | Every pending approval or commander disposition, with the deciding authority and any expiry | Silence about a pending Red decision; this omission alone fails the packet |
| `active_risks` | Open risks with severity and CCIR linkage where one exists | Generic caution ("be careful with prod") without a concrete hazard |
| `source_of_truth_files` | Repository-relative paths to the files the successor must read first | Chat excerpts, URLs to conversations, or absolute local paths |
| `verification_status` | The last verification commands and their results, stated so they can be re-run | "Tests pass" without naming which runner and when |
| `next_actions` | An ordered list whose first action is executable with zero chat context | Actions that presuppose knowledge held only in the departing context |
| `do_not_do` | The Red/Black boundary restated for this mission, plus any mission-specific prohibitions | An empty restatement; the boundary is rewritten in every packet |
| `created_at` | The packet creation timestamp | A backdated or reused timestamp |

## 5. Worked Minimal Example

The following packet is consistent with `schema-files/handoff-packet.schema.json` and passes the section 6 checklist. It is deliberately minimal: one open task, one blocker, one pending decision.

```json
{
  "schema_version": "0.1",
  "type": "HandoffPacket",
  "id": "HP-EX-001",
  "mission_id": "M-EX-001",
  "created_by": "S6",
  "classification": "internal",
  "current_order": "OPORD-EX-001",
  "commander_intent": "Document the readiness-to-authority linkage so the policy engine can enforce it. End state: policy doc merged and fixtures pass. Do not touch production configuration.",
  "completed": [
    "Drafted docs/readiness-to-authority-policy.md; evidence: file present and linked from README."
  ],
  "in_progress": [
    "Fixture design for the progression gate; resumption point: entry criteria table in docs/training-progression-model.md section 3."
  ],
  "blocked": [
    "TR-EX-004: fixture runner execution is blocked pending CoS confirmation of the fixture directory layout; unblocked by a CoS routing decision."
  ],
  "pending_decisions": [
    "AP-EX-002: commander disposition on accepting medium residual risk for bulk README relinking; expires 2026-08-04T18:00:00+09:00."
  ],
  "active_risks": [
    "medium FFIR: readiness ledger and METL table may drift apart until the progression fixtures exist."
  ],
  "source_of_truth_files": [
    "docs/readiness-to-authority-policy.md",
    "docs/training-progression-model.md",
    "schema-files/readiness-ledger.schema.json",
    "docs/source-map.md"
  ],
  "verification_status": [
    "Ran node readiness-gate-prototype/run-readiness-fixtures.js on 2026-08-03; all fixtures passed."
  ],
  "next_actions": [
    "Read docs/training-progression-model.md section 3 and complete the entry criteria table.",
    "Draft progression gate fixtures and submit them for CoS routing.",
    "Re-run node readiness-gate-prototype/run-readiness-fixtures.js and record the result."
  ],
  "do_not_do": [
    "Do not execute any production or external-mutation action; all such actions remain Red and commander-retained.",
    "Do not consume AP-EX-002 before the commander records a disposition."
  ],
  "created_at": "2026-08-03T10:00:00+09:00"
}
```

## 6. Quality Checklist

A packet is accepted only when every item below holds. The reviewer records the check result with the packet.

1. Schema check: the packet validates against `schema-files/handoff-packet.schema.json`.
2. Cold-start check: the first entry in `next_actions` is executable by an operator who has read only this packet and the `source_of_truth_files`.
3. Intent fidelity check: `commander_intent` matches the order identified by `current_order`, including the authority boundary.
4. Pending-approval check: every approval known to the event projection appears in `pending_decisions`; none is silently dropped.
5. Boundary check: `do_not_do` restates the Red/Black boundary in mission-specific terms.
6. Evidence check: every `completed` entry points at something checkable; every `verification_status` entry names a re-runnable command and its last result.
7. Truth-location check: every `source_of_truth_files` entry exists in the repository and none is a conversation artifact.
8. Classification check: `classification` is at least as high as the most sensitive referenced item, and the packet body leaks nothing above its own label.

Failure of any item returns the packet to the author. Repeated handoff failure is a demotion trigger in the readiness ledger.

## 7. Authoring and Review Procedure

1. Detect a section 3 trigger and freeze new task starts for the affected scope.
2. Run `handoff-generator.js` against the current event log to produce the draft.
3. The author corrects the draft against the section 4 must/must-not rules — the generator knows the projection, but only the author knows the exact resumption points and mission-specific prohibitions.
4. Validate the edited packet against the schema.
5. A second role (CoS or S6, per the handoff review row of the knowledge review rhythm) applies the section 6 checklist.
6. Record the accepted packet and reference it from the continuity or wave closeout record; the packet becomes part of the source of truth, not a chat message.

## 8. Source Anchors

- Knowledge Management Primer, Executing Knowledge Management in Support of Mission Command: https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf
- USFKI 5780.01 Knowledge Management Program: https://www.usfk.mil/Portals/105/Documents/Publications/Instructions/USFKI_5780-01_Knowledge-Management-Program.pdf
- Joint Staff Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf
- CJCSI 5780.01 Knowledge Management: https://www.jcs.mil/Portals/36/Documents/Library/Instructions/CJCSI%205780.01.pdf

## 9. Implementation Candidates

The [implementation registry](implementation-candidate-registry.md) tracks these requirements, equivalent paths, checks, and remaining work. A proposed filename is not proof of completion.

schema:

- `handoff-review-record.schema.json`

prototype:

- `handoff-packet-linter.js`
- `run-handoff-packet-fixtures.js`
- `handoff-trigger-watcher.js`
