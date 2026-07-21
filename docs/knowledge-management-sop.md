# Knowledge Management SOP

## 0. Purpose

Military-style mission command does not work on the basis of "a good commander gives clear verbal instructions" alone. Shared understanding, records, terminology, knowledge repositories, battle rhythm, liaison, and AAR must all operate together.

In an LLM runtime, conversational memory is the most fragile repository. Therefore, the source of truth for long-running work must reside in the following.

- doctrine docs
- source map
- research compendium
- evidence records
- decision log
- event log
- runtime payloads
- repository-scoped artifact manifests
- AAR/readiness ledger

This SOP defines how the S6 Knowledge role and the CoS operate knowledge management.

## 1. Knowledge management principles

| Principle | Description | LLM application |
| --- | --- | --- |
| Findable | Required materials must be locatable | README, source-map, links |
| Traceable | Conclusions must be linked to their sources | evidence record, source reliability |
| Current | The latest state must be maintained | event replay projection, SITREP |
| Bounded | Information is not shared indiscriminately | classification, releasability |
| Actionable | The next operator must be able to act on it | handoff packet, SOP, schema |
| Learnable | AAR feeds back into procedures and training | readiness ledger, SOP updates |

## 2. Source of truth hierarchy

| Information | source of truth | supporting material |
| --- | --- | --- |
| Overall framework structure | `README.md`, `military-llm-framework-v0.1.md` | research compendium |
| Sources and evidence | `source-map.md`, evidence records | source reliability rubric |
| Current mission state | event log projection | dashboard state |
| Authority and approval | authority matrix, approval request | tool-use ROE |
| Execution results | validator/test output, AAR | SITREP |
| Multi-repository deliverables | repository artifact manifest | repository-scoped artifact files |
| Next task queue | framework doc, research queue | compendium |

Conversation history is not a source of truth. Conversation is task instruction and transient context.

Durable AI outputs for different Git repositories must not share a flat directory. Apply `repository-artifact-isolation-policy.md` so each receipt, projection, report, and deliverable remains under its target repository identity.

## 3. S6 Knowledge responsibilities

S6 is not merely a document author. S6 is the operator of knowledge flow.

Responsibilities:

- Maintain the README and reading order.
- Update the source-map and research-compendium.
- Separate evidence from interpretation.
- Preserve the decision log and event log.
- Generate handoff packets.
- Manage classification/releasability metadata.
- Reflect SOP changes arising from AAR.

What S6 does not approve:

- Policy decisions.
- Execution of Red actions.
- Assertion of facts without a source.
- Disclosure of sensitive information.

## 4. Knowledge capture SOP

When new information arrives:

1. Classify the information type: source, decision, event, evidence, risk, SOP, AAR.
2. Attach a classification label.
3. Separate the original claim from the LLM interpretation.
4. Link it to the relevant mission/task/order id.
5. Store it in the source-map or compendium.
6. If it affects execution, raise it as a CCIR alert.
7. If the knowledge will be reused, reflect it in an SOP or schema.

## 5. Decision log SOP

Every significant decision is recorded in the decision log.

```json
{
  "decision_id": "DEC-DEMO-001",
  "mission_id": "M-DEMO-001",
  "decision_type": "approval",
  "decider": "COMMANDER",
  "question": "Allow production deployment?",
  "decision": "reject",
  "rationale": "Demo is local-only and no production approval exists.",
  "scope": "TR-DEMO-002",
  "timestamp": "2026-06-18T11:13:00+09:00",
  "expires_at": "2026-06-18T23:59:59+09:00"
}
```

Decisions that must be recorded:

- Red action approval/rejection.
- scope change.
- priority change.
- risk acceptance.
- source reliability override.
- authority matrix change.

## 6. Handoff packet

Before a context transition, a long-running pause, or an agent handoff, create the packet below.

```text
HANDOFF PACKET:
- mission_id:
- current_order:
- commander_intent:
- completed:
- in_progress:
- blocked:
- pending_decisions:
- active_risks:
- source_of_truth_files:
- verification_status:
- next_actions:
- do_not_do:
```

Rules:

- Resumption must be possible without chat history.
- Pending approvals must always be indicated.
- Rewrite the Red/Black boundary.
- Record the last verification command and its result.

## 7. Knowledge review rhythm

| Event | Owner | Output |
| --- | --- | --- |
| Daily or phase close KM review | S6 | changed docs, stale links, missing source map entries |
| Source review | S2/S6 | reliability rating and interpretation risk |
| AAR update | Evaluator/S6 | SOP updates and readiness changes |
| Handoff review | CoS/S6 | handoff packet |
| Release review | Commander/S6 | final output safe summary |

## 8. Document storage rules

Rules:

- Place new concept documents in `docs/`.
- Place executable schemas in `schema-files/`.
- Place example payloads in `sample-payloads/` or a domain-specific payload directory.
- Place prototypes in a separate `*-prototype/` directory.
- Update the README and source-map together.
- In the compendium, record "why it was created" and "LLM application."

Leave a source anchor at the end of a document whenever possible.

## 9. Quality gate

After a document change:

- README link check.
- JSON parse check if schema/payload changed.
- validator fixture if validation logic changed.
- source-map entry if new military concept added.
- compendium note if research interpretation added.

Knowledge management failure conditions:

- The next operator does not know where to start.
- Source and interpretation are mixed together.
- A decision exists only in chat.
- The scope of approval was not recorded.
- AAR was not fed back into SOP/readiness.

## 10. Prompt guard

```text
When work is finished, perform a KM check.
1. Which files are the source of truth?
2. Have new decisions or the scope of approval been recorded?
3. Are source-backed claims separated from interpretation?
4. Do the README/source-map/compendium need updating?
5. Can the next operator continue without chat history?
```

## 11. Implementation candidates

schema:

- `decision-log.schema.json`
- `handoff-packet.schema.json`
- `source-record.schema.json`

prototype:

- `handoff-generator.js`: combines event projection with the README queue to generate a packet.
- `source-map-linter.js`: warns when docs contain a new URL that is not present in the source-map.
- `km-review-runner.js`: integrates links, JSON, source-map, and compendium checks.

## 12. Source anchors

- Executing Knowledge Management in Support of Mission Command: https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507
- CJCSI 5780.01 Knowledge Management: https://www.jcs.mil/Portals/36/Documents/Library/Instructions/CJCSI%205780.01.pdf
- USFKI 5780.01 Knowledge Management Program: https://www.usfk.mil/Portals/105/Documents/Publications/Instructions/USFKI_5780-01_Knowledge-Management-Program.pdf

## 13. Conclusion at the current stage

The core of LLM knowledge management is not "storing a lot." Decisions, evidence, current state, approval authority, and learning must be interconnected so that they can control the next execution.

Therefore, every long-running task must leave behind the following four items.

1. source map
2. event/decision log
3. current projection
4. AAR/SOP update
