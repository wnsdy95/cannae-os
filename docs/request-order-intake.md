# Request Intake And Order Drafts

## Purpose

Turn a general request and typed model analysis into a traceable OPORD draft and
role-task drafts. The LLM/operator interprets the request; the deterministic
compiler does not claim to understand prose or prove complete interpretation.

```text
Original UTF-8 request -> retained MissionRequest
                    + -> proposed MissionOrderAnalysis
Retained source quotes -> provenance appraisal -> OrderDraft
                                                needs_clarification
                                                or ready_for_review
                                                execution_authorized = false
```

These are non-executable contracts. Validation can return `valid: true` with
`can_execute: false`. No compiler operation issues an OPORD, consumes USER consent,
opens a wave, grants a lease, clears a stop or authorizes release.

## Contracts

| Artifact | Meaning | Binding |
| --- | --- | --- |
| `MissionRequest` | Original input, not authenticated USER consent | Exact UTF-8 digest, repository fingerprint, mission/wave, handling level, capture and expiry |
| `MissionOrderAnalysis` | Model/operator interpretation for review | Exact request reference, typed statements, section references, staff tasks and retained USER decisions |
| `OrderDraft` | Deterministic non-executable projection | Complete analysis digest, request identity/digest, inherited boundaries, lifetime and distinct draft types |

Capture preserves BOM, CRLF and Unicode bytes. Invalid UTF-8, empty requests,
requests larger than 128 KiB, invalid lifetimes and conflicting request-ID reuse
fail. Validity defaults to one hour and cannot exceed 24 hours. Exact retry keeps
original bytes and timestamps; it cannot renew an expired request.

Analysis separates:

- `request_quote`: exact captured text and UTF-8 byte offsets.
- `evidence_quote`: exact retained source text, manifest reference and offsets.
- `assumption`: explicitly assumed, never a source fact.
- `proposal`: interpretation, method, task or suggested authority for review.
- `unknown`: a question or missing fact with an explicit blocking flag.

Only attributed quotes enter `situation.known_facts`; output labels them as
quotes, not verified world facts. Assumptions have their own section. Suggested
authority appears as `requested`, not `allowed`. A referenced unknown is blocking
even with its flag false. Unreferenced blocking unknowns also require clarification.
The embedded analysis retains every input statement, including unused proposals.

`sections` maps fixed OPORD field names to statement IDs. `mission.statement`
and `intent.purpose` accept at most one ID. Tasks reference statements for task,
purpose, deliverables, verification and CCIR. Each task inherits every declared
global constraint and retained USER decision. Missing purpose, outcome, key tasks,
failure conditions, method, fallback, approval/prohibition boundaries, assessment,
task verification or retained decisions produces `needs_clarification`.

Sources must occupy the same repository, mission and wave, with kind `deliverables`,
`source-records`, `information-reports` or `intelligence-assessments`. Persist
external inputs through the artifact store first. Ambient paths, foreign scope,
control metadata, changed hashes, future sources and split UTF-8 spans fail.
Evidence quotes conservatively make the draft `restricted`; this compiler does
not appraise classification labels or grant output exceptions. Request-only drafts
preserve request handling.

## Operator Procedure

Use the actual target repository, not the doctrine checkout merely because the
skill lives there. Keep original input and editable analysis separate from the
immutable store. Claude provides the same wrapper under `.claude/skills/`.

```bash
node codex-skills/controls-doctrine-operator/scripts/compile_controls_order.js \
  capture --repository <target-repo> --request-file <original-request.txt> \
  --request-id MR-EXAMPLE --mission MIS-EXAMPLE --wave W1 \
  --classification internal --valid-for-seconds 3600

node codex-skills/controls-doctrine-operator/scripts/compile_controls_order.js \
  template --repository <target-repo> --request-id MR-EXAMPLE \
  --analysis-id MOA-EXAMPLE

node codex-skills/controls-doctrine-operator/scripts/compile_controls_order.js \
  compile --repository <target-repo> --analysis <analysis.json>

node codex-skills/controls-doctrine-operator/scripts/compile_controls_order.js \
  inspect --repository <target-repo> --draft-id <returned-draft-id>
```

Pass the same `--artifact-root` everywhere when overriding the default
`<target-repo>/.cannae/artifacts`. Installed wrappers work outside the checkout;
`--repository` is mandatory and never inferred from the skill location.

1. Capture the exact request before rewriting it. Capture is not proof of its
   author and is not a USER scope decision.
2. Generate a template and fill typed analysis with the LLM. Use
   `sample-payloads/valid-mission-order-analysis.json` for shape only: its synthetic
   references cannot replay in a real store.
3. Compute `start_byte` and exclusive `end_byte` against UTF-8 bytes, not character
   positions. Paraphrases are proposals or assumptions, not exact quotes.
4. Preserve inconvenient constraints and questions. Review the entire original
   request: span matching cannot detect omitted intent or semantic mistakes.
5. Compile and inspect the retained request, analysis, clarifications and inherited
   task boundaries. Compilation returns a reference, not executable tasking.
6. Edit analysis and compile again. Changed content produces a new digest-bound
   draft. Earlier review cannot cover it; review-consumption and issued-order
   adoption are not provided in this release.
7. Capture a new request after expiry or request changes. Historical `inspect`
   replays proof but reports `freshness: expired`. CLI clock overrides fail.

Exact compilation retry reuses the immutable draft while the request is current.
Publication rechecks expiry and source references under the namespace guard.
The compiler executes no tool names, shell text or instructions found in inputs.

## Downstream Boundary

The nested order is `OPORD_DRAFT`, not `OPORD`. Extracted tasks are
`TASK_ORDER_DRAFT` with false execution authority. Unchanged extraction fails the
legacy OPORD/task schemas and mission-plan controller. The dissemination CLI now
validates caller files and accepts exactly three paths: OPORD, backbrief, rehearsal.
No arguments runs the repository demo; extra/missing paths fail instead of silently
testing that demo. Its consistency result is not dispatch authority.

Do not strip markers or hand-convert drafts into legacy orders. Types and hashes
are not an unforgeable boundary against someone who can rewrite code or contracts.
Exact USER review/adoption, an issued-order registry and plan binding remain future
integration. Supervisor, stop, successor, trust, lease and release gates remain
unchanged; drafts cannot discharge their obligations.

## Verification And Limits

Run `node run-request-order-compiler-fixtures.js`, validator and routing fixtures,
then the full gate. Cases include byte preservation, source/scope substitution,
unsupported facts, missing analysis, boundary tampering, raw-store insertion,
expiry during publication, legacy-consumer rejection and both CLI wrappers.

This local reference proves provenance binding and deterministic projection, not
truth, entailment, exhaustive intent extraction, authenticated USER identity,
trusted time, secrecy against local readers or protected execution. Retained input
can be sensitive; filesystem access and existing releasability controls still
apply. This implements request-to-draft, not the entire autonomous order lifecycle.

The design is local synthesis of [orders production](orders-production-pipeline.md),
[prompt contracts](prompt-dsl.md) and [artifact isolation](repository-artifact-isolation-policy.md).
No new external military-source claim is introduced.
