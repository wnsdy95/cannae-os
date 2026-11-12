# Knowledge Management SOP

## 0. Purpose

For ordinary writing and revision, start with
[Document Authoring Workflow](document-authoring-workflow.md). Under the current
[skill-first scope](skill-first-product-scope.md), document work does not require
a dashboard, login or server. Runtime-specific proof and campaign rules below
apply when using those workflows; they are not prerequisites for a prose edit.
Existing guarded operations and retained holds cannot be bypassed by relabeling
them as document work.

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
- verification plans and receipts
- verifier trust policies and signed verification attestations
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
| Current delegated task context | `MissionWavePlan` plus current `AgentContextPack` | routing receipt and preflight projection |
| Authority and approval | authority matrix, approval request | tool-use ROE |
| Execution results | validator/test output, AAR | SITREP |
| Adaptive validation proof | verification receipt + signed verifier quorum + manifest history | checkpoint metric projection |
| Privileged adaptive approval | approval scope + consumption event | checkpoint approval binding |
| Multi-repository deliverables | repository artifact manifest | repository-scoped artifact files |
| Next task queue | skill-first product scope, active completion backlog | implementation registry, deferred runtime roadmap, research queue, compendium |

Conversation history is not a source of truth. Conversation is task instruction and transient context.

Durable AI outputs for different Git repositories must not share a flat directory. Apply `repository-artifact-isolation-policy.md` so each receipt, projection, report, and deliverable remains under its target repository identity.

### Current Document Navigation

For a versioned document advertised as current in several corpus entry points,
maintain one reviewed identity and disposition in
[`source-map-navigation.json`](source-map-navigation.json). The registered
`current-document` blocks are projections of that record, not separate decisions.
The initial registered family is the support SOP across README, its case opening,
the active backlog, source map, compendium and research queue. Other artifacts
and private project records are not automatically covered.

1. Read the actual candidate and its appraisal. Distinguish a predecessor's
   review from acceptance of its successor. Preserve separate exercise identities;
   a larger version number does not select the current document.
2. For a real successor, retain old bodies and verdicts, then update the record's
   exact candidate, reviewed disposition and evidence locators. Hash the UTF-8
   span including its start heading and excluding its end heading, with original
   whitespace and newlines. Do not hash a trimmed or rendered representation.
3. Update every registered visible block together. `renderNavigation` in
   `source-map-navigation.js` derives its relative link and separate proposal,
   review and adoption labels. Keep blocks inside their declared current sections,
   not in a code fence or evidence history. This helper does not write files.
4. Run `node source-map-linter.js` and `node run-source-map-linter-fixtures.js`.
   A missing registry, changed candidate/appraisal, inconsistent state or target,
   missing/duplicate block, or dropped index registration is an error. Diagnose
   a changed source before updating its binding; never refresh a hash or remove
   a reference solely to clear the failure.
5. Keep earlier next-action statements explicitly historical. Select new work
   from the active backlog, not a prior review's next step or a completed platform
   checkpoint. Check narrative claims as well as registered blocks.

This is a read-only consistency check of declared state, not a semantic evaluator,
signature, permission gate or proof of human adoption. A coherent forged record
and rewritten sources cannot establish authority. Recording adoption still needs
the actual authorized decision; editing these labels grants no permission.
The checker uses the corpus's exact whole-line heading/marker convention, not a
general Markdown renderer. New candidate start headings use plain ASCII letters,
numbers, spaces and hyphens so the generated fragment is unambiguous. Evidence
must remain within regular, non-symlinked repository files.

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

User/project terminology follows [Project Terminology Workflow](project-terminology-workflow.md).
Its private target-repository ledger is the canonical language record; source
excerpts distinguish actual user statements from AI inference. Do not store
project vocabulary in the shared source-map or compendium under step 5 above.
Retain corrections and task-bound snapshots, distribute only authorized relevant
definitions, and keep meaning confirmation separate from operational approval.

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
| Improvement checkpoint | S3/Evaluator/S6 | baseline, candidate, metrics, validation evidence, decision |
| Proof-store verification | S6/Recorder | zero pending journals, valid lease/fencing history, valid manifest chain, valid artifact hashes |
| Handoff review | CoS/S6 | handoff packet |
| Release review | Commander/S6 | final output safe summary |

## 8. Document storage rules

Rules:

- Place new concept documents in `docs/`.
- Place executable schemas in `schema-files/`.
- Place example payloads in `sample-payloads/` or a domain-specific payload directory.
- Place prototypes in a separate `*-prototype/` directory.
- Store long-running improvement campaign, checkpoint, and decision artifacts in the target repository namespace.
- Store verification plans, receipts, verifier trust policies, signed attestations, parent decisions, approval scopes, and consumption events through the same repository artifact store; cite their manifest paths and hashes rather than copying status text.
- Treat trust policies as human-controlled roots. Keep private keys outside the repository and artifact store, and retain the exact policy artifact used for each signed quorum.
- Run `repository-artifact-verify.js` before a checkpoint consumes proof and before every wave completes.
- A new doctrine output is not complete until its exact `docs/...` path appears in `README.md`, `docs/source-map.md`, and `docs/research-compendium.md` in the same change.
- In the compendium, record why the doctrine was created, its LLM application, and its current limit.
- Keep the machine-audited doctrine output list between the `doctrine-index` markers in `docs/military-operating-deep-research-queue.md`; `node source-map-linter.js` must pass before the changelog may claim closure.

For a document retaining multiple revisions, maintain a current-candidate
pointer separately from the append-only evidence history. Update its opening
notice, README entry and current queue together after checking the candidate's
identity, predecessor and actual disposition. A newer number does not establish
acceptance or supersede policy. Label earlier next-action statements as history
so a new operator does not restart consumed work. Preserve the original draft,
review, failed attempt and source bindings rather than rewriting old claims to
match the present. Check pointer semantics as well as link existence.

Leave a source anchor at the end of a document whenever possible.

## 9. Quality gate

After a document change:

- README link check.
- JSON parse check if schema/payload changed.
- validator fixture if validation logic changed.
- source-map entry if new military concept added.
- compendium note if research interpretation added.
- `node source-map-linter.js` after any doctrine, queue, README, source-map, or compendium change.
- `node implementation-candidate-registry.js audit` after candidate-section or implementation-mapping changes; run its `verify` command before claiming executable completion. Keep wider roadmap and operational gaps in `completion-backlog.md`.

Knowledge management failure conditions:

- The next operator does not know where to start.
- Source and interpretation are mixed together.
- A decision exists only in chat.
- The scope of approval was not recorded.
- AAR was not fed back into SOP/readiness.
- An agent continued from a failed or unmeasured candidate instead of the last accepted working state.
- Completion was claimed without a `before_completion` self-improvement checkpoint.
- A candidate was promoted without a runtime-issued verification receipt for its exact repository state.
- A v0.3 candidate was promoted without fresh signatures from the configured number of distinct trusted keys and independence groups over that exact receipt.
- A trust-policy change, key activation, quorum reduction, or validity extension was accepted without scoped USER approval.
- A follow-on baseline names a parent ID but does not retain the parent decision artifact and hash.
- A pending transaction journal or integrity failure was ignored.
- A lease expiry, stale-writer fencing failure, fencing-token rollback, or shared-filesystem consistency warning was ignored.
- A doctrine output was declared complete or recorded in the changelog without exact-path entries in the README, source map, and research compendium.

## 10. Prompt guard

```text
When work is finished, perform a KM check.
1. Which files are the source of truth?
2. Have new decisions or the scope of approval been recorded?
3. Are source-backed claims separated from interpretation?
4. Does every new doctrine output appear by exact path in the README, source map, and compendium?
5. Can the next operator continue without chat history?
6. Does the next operator know the accepted baseline, rejected candidates, open quality gap, and next checkpoint?
```

## 11. Implementation candidates

The [implementation registry](implementation-candidate-registry.md) tracks these requirements, equivalent paths, checks, and remaining work. A proposed filename is not proof of completion.

Implemented schemas:

- `decision-log.schema.json`: one decision log entry with a required authority basis and review trigger.
- `handoff-packet.schema.json`
- `source-record.schema.json`: one knowledge source record with tier, claims, and linked documents.

Implemented prototypes:

- `handoff-generator.js`: reads explicitly selected order/event files and produces an unreviewed local draft with source digests. It does not read the README queue or certify current state; follow `docs/handoff-packet-template.md` for reconciliation and acceptance.
- `source-map-linter.js`: fails when an official source host is absent from the source map or a doctrine output in the queue's audited index is missing from the README, source map, compendium, or filesystem (verified by `run-source-map-linter-fixtures.js`).
- `km-review-runner.js`: validates decision-log, source-record, optional handoff, and authority artifacts against their schemas; resolves authority and document references; and reviews stale unresolved decisions. Supply authority evidence with `--authority-artifacts` and constrain local document references with `--repository-root` (verified by `run-km-review-fixtures.js`).

## 12. Source anchors

- Executing Knowledge Management in Support of Mission Command: https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507
- CJCSI 5780.01 Knowledge Management: https://www.jcs.mil/Portals/36/Documents/Library/Instructions/CJCSI%205780.01.pdf
- USFKI 5780.01 Knowledge Management Program: https://www.usfk.mil/Portals/105/Documents/Publications/Instructions/USFKI_5780-01_Knowledge-Management-Program.pdf

## 13. Conclusion at the current stage

The core of LLM knowledge management is not "storing a lot." Decisions, evidence, current state, approval authority, and learning must be interconnected so that they can control the next execution.

Therefore, every long-running task must leave behind the following lifecycle records.

1. source map
2. event/decision log
3. current projection
4. AAR/SOP update
5. self-improvement campaign/checkpoint/decision chain for adaptive work
6. current-wave plan, context packs, report, and closeout for delegated skill operations
