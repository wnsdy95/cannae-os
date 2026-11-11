# Handoff Packet Template

## 0. Purpose

### Ordinary Document Work

Choose the handoff form from the work being transferred, not from the template's
military vocabulary. Under [Skill-First Product Scope](skill-first-product-scope.md),
an ordinary document draft or local corpus edit can use a plain Markdown handoff.
It does not need a newly invented mission ID, OPORD, event log, role assignment,
approval receipt or server. Its canonical documents and observed results are
the durable record; chat memory is not a substitute.

Include the original purpose and required outputs, current canonical version,
source paths and freshness limits, completed versus unverified work, unresolved
decisions and their real decision owner, the next bounded action and what must
not be done. If no receiver is assigned or acceptance has not been observed,
say so. An explicit unknown is not a negative fact or an approval.

For a plain-document cold start, the receiver must be able to locate the cited
files, explain the original purpose and boundaries, distinguish observed results
from plans, and identify a next action allowed without a new decision. Record
actual receiver acknowledgement separately; writing this packet is not acceptance.
No-schema-needed is not no-review-needed: apply these quality checks and the
request/source comparison in [Document Authoring Workflow](document-authoring-workflow.md).

### Existing Runtime Missions

The machine-packet fields and runtime procedures in sections 1-9 apply to an
actual runtime mission, delegated wave or guarded operation. Keep its real
order, current context, pending approvals and unresolved effects; do not switch
it to a plain-document handoff to bypass any control. This scope clarification
does not change the machine schema, admission rules or existing holds.

Conversation history is not the source of truth. The event log, evidence store, decision log, and doctrine docs are. Every long-running task must leave behind a handoff packet and a current projection so that the next operator can resume without any chat history.

The machine contract is `schema-files/handoff-packet.schema.json`. The local
`handoff-generator.js` produces an explicitly unreviewed draft from selected
OPORD and same-mission event files, retaining their digests and quoted contents.
It does not infer completed work or current approval state from event counts.
Handoff validation always returns `can_execute: false`, including for legacy
v0.1 packets. A valid shape is neither execution permission nor an accepted handoff.

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
| `handoff-generator.js` | Local draft producer. Requires an explicit `HandoffGenerationRequest`, reads selected order/events and preserves their claims without certifying current state |
| `schema-files/handoff-generation-request.schema.json` | Non-authorizing source selection; valid/invalid samples and `run-handoff-generation-fixtures.js` cover the consumer |
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

The field order below mirrors `schema-files/handoff-packet.schema.json`. Every
field is required. Distinguish confirmed absence from an unknown: "not observed
in these supplied records; completeness unverified" is not "none." Name the
record scope and freshness supporting a negative assertion. Empty `completed`
is appropriate when no completion has been verified; explain that limitation in
`verification_status`. Do not manufacture decisions, IDs or evidence to fill fields.

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

The following is a synthetic illustration of the v0.1 shape: one open task, one
blocker and one pending decision. Its dated claims are not observed verification,
current approval or an actual passing section 6 review. Do not reuse its IDs.

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
4. Pending-approval check: reconcile the current decision ledger, including expiry, consumption, revocation and delegation. Do not turn recorded grants or an incomplete projection into current permission; retain unresolved discrepancies and unknowns.
5. Boundary check: `do_not_do` restates the Red/Black boundary in mission-specific terms.
6. Evidence check: every `completed` entry points at checked evidence. Separate actual check/results from planned or unrun verification; a recorded success, evidence count or AAR is not independent completion proof.
7. Truth-location check: every `source_of_truth_files` entry exists in the repository and none is a conversation artifact.
8. Classification check: `classification` is at least as high as the most sensitive referenced item, and the packet body leaks nothing above its own label.

Failure of any item returns the packet to the author. Repeated handoff failure is a demotion trigger in the readiness ledger.

## 7. Authoring and Review Procedure

1. Detect a section 3 trigger and freeze new task starts for the affected scope.
2. An authorized source reader selects the actual order and event files using the local procedure below. Ordinary prose work still uses section 0, not invented runtime files.
3. The author checks the draft against section 4 and the current authoritative records. Keep the original draft and source digests; record revisions separately. Reconcile actual resumption points, effects and decisions without silently replacing unknowns with negative claims.
4. Validate the edited packet against the schema.
5. A second role (CoS or S6, per the handoff review row of the knowledge review rhythm) applies the section 6 checklist.
6. Record the accepted packet and reference it from the continuity or wave closeout record; the packet becomes part of the source of truth, not a chat message.

### Local Draft Generation

Run from the source repository with a JSON request containing `schema_version:
"0.1"`, `type: "HandoffGenerationRequest"`, `order_file`, `events_file`,
`created_by` and `classification`. Paths are repository-relative ordinary files;
symlink components, parent traversal and `.git` paths are rejected. Each source
is limited to 8 MiB. The caller must already be allowed to read every source.
Role strings and this request do not establish that authority.

```bash
# Synthetic example only; select actual files for an existing runtime mission.
node handoff-generator.js sample-payloads/valid-handoff-generation-request.json
node run-handoff-generation-fixtures.js
```

The former event-array-only CLI/API is intentionally rejected. The API is
`generateHandoff(request, { root })`, defaulting `root` to the current directory.
Request validation checks shape, not file availability; the consumer also
validates the OPORD, task mission IDs, event envelopes, unique event IDs,
timezone-bearing nonfuture timestamps, and matching mission/order creation
records. Mixed missions, a different recorded OPORD or any FRAGO event stop
generation for manual order reconciliation. Amendment merging is not implemented.

Output remains a v0.1 packet. Quoted JSON preserves substantive order sections
and every supplied event, including unfamiliar event types, without interpreting
embedded instructions as authority. `current_order` identifies the supplied
order, not proof that it is still in effect. Timestamps are sorted by instant;
file digests identify the exact bytes read, not their authenticity or later
freshness. Classification cannot be below a known source label; an unlabelled
event requires `restricted`. Labels are declarations, not secret detection.

The draft keeps `completed` empty, flags state/decisions as unverified and labels
assessment commands as unrun. It never executes them. Review must establish
what is complete and the next permitted action. No receiver is assigned or
acknowledged automatically. The output contains raw source content on stdout:
retain it privately in the target repository, do not place it in shared logs or
transfer it without recipient access and the applicable release review. This
local helper is not redaction, a protected filesystem or an operating gateway.

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
