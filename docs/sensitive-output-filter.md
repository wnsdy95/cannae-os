# Sensitive Output Filter

## 0. Purpose

This document is the specification for the final-output filter: the protection mechanism that inspects content at the two points where information leaves the runtime's controlled context — final output to the user or a partner, and transfer into an external tool — and redacts, blocks, or escalates before the boundary is crossed.

Position among sibling documents:

- `opsec-classification-model.md` defines the classification levels, the EEFI model, and tool-use OPSEC risk classes. This document does not restate them; it specifies the filter that enforces them at the exit boundaries.
- `context-releasability-policy.md` and `context-filter-prototype/` govern what each role receives inside the runtime. This filter is downstream of them: it assumes internal context filtering already happened and still inspects what is about to leave.
- `schema-files/release-review.schema.json` and `release-review-runner.js` define release review. The filter feeds release review; it never substitutes for it (section 7).

## 1. Doctrinal basis

- `Claim`: Protection is a warfighting function whose purpose is to preserve the force and its freedom of action so operations can continue, not a compliance activity appended after planning (ADP 3-0, Operations; FM 3-0, Operations).
- `Claim`: EEFI are the essential elements of friendly information: the specific facts about friendly intentions, capabilities, and activities that must be protected from disclosure, managed alongside the CCIR (JCS CCIR Focus Paper).
- `Claim`: OPSEC methodology identifies critical information, analyzes how an adversary could observe indicators of it, and applies countermeasures at the points where disclosure would occur (Joint OPSEC Support Element, Operations Security — cited by title; not yet in the source map).
- `Claim`: Audit records must capture event type, time, source, outcome, and actor, and must themselves be protected from unauthorized modification (NIST SP 800-53 Rev. 5.1, AU-3 and AU-9).
- `Interpretation`: In the LLM runtime, the disclosure points are exactly two: the final output channel and the tool dispatch channel. A protection function that inspects only the answer text misses queries, file names, log lines, and tool arguments, which are all output in the OPSEC sense.
- `Application`: The filter is implemented as two stages bound to those two channels, each keyed to its own EEFI class, each emitting audit events that satisfy the AU-3 content expectations.

## 2. Two EEFI classes, two filter stages

`opsec-classification-model.md` divides EEFI handling between output exposure and tool transfer. This filter makes the division structural: two EEFI classes, enforced by two distinct stages that do not share a verdict.

| | Class 1: forbidden-from-output | Class 2: forbidden-from-tool-transfer |
| --- | --- | --- |
| Question | May this appear in what the user or a partner sees? | May this leave through a tool call? |
| Filter stage | Stage OUT, on the final output channel | Stage TOOL, on the tool dispatch channel |
| Inspects | Answer text, summaries, rendered artifacts, error messages shown to the user | Tool arguments, queries, request bodies, upload payloads, file paths, log-forwarded content |
| Typical members | Secret raw values, private user data, unapproved internal detail, exploit detail | Secrets in any position, private data bound for external APIs, sensitive content in search queries and file names |
| Miss consequence | Disclosure to the reader | Disclosure to the tool operator, provider logs, or the network path |

Rules:

- An item may sit in one class, both, or neither. A production credential is in both. An unreleased internal architecture summary may be output-forbidden yet permitted to an approved internal tool. A customer identifier may be output-tolerable in summary form yet forbidden from any external API call.
- The two stages never share a verdict: passing Stage OUT says nothing about Stage TOOL, and vice versa. Content that crosses both boundaries is inspected twice.
- Stage TOOL treats every field of a tool call as content: the target, the query string, the file name, and headers, not only the payload, matching the tool-use OPSEC table in `opsec-classification-model.md` section 4.

## 3. Position in the pipeline

```text
agent output draft
      |
      v
[Stage OUT: sensitive output filter]  --clean/redacted-->  release review  -->  final output
      |                                                       (release-review-runner.js)
      +--blocked--> EEFI event + escalation

agent tool request
      |
      v
[policy engine / authority gate]
      |
      v
[Stage TOOL: sensitive output filter]  --clean/redacted-->  tool dispatch
      |
      +--blocked--> EEFI event + escalation
```

Rules:

- Stage OUT runs before release review, so the reviewer (human or agent) judges an already-filtered candidate and is never handed raw EEFI just to reject it.
- Stage TOOL runs after the authority gate and before dispatch: an approved action can still be blocked for carrying forbidden content, because action approval is not information release approval (`opsec-classification-model.md` section 4).
- The filter has no bypass path. Content that skips the filter stage does not reach release review or dispatch at all; a missing filter verdict is itself a blocking condition.

## 4. Detection classes

| Detection class | Examples | Default stage verdict |
| --- | --- | --- |
| Secrets and credentials | API keys, tokens, passwords, private keys, session cookies, signed URLs | Block in both stages |
| Internal paths and infrastructure | Home-directory paths with usernames, internal hostnames, production endpoints, environment dumps | Redact in OUT; block toward external tools |
| Personal data | Names with contact detail, identifiers, health or financial fragments in user data | Redact in OUT; block toward external tools unless the user explicitly directed the transfer |
| EEFI-listed items | Entries on the mission's EEFI list from `opsec-classification-model.md` section 2, matched by pattern or reference id | Per the list's class-1/class-2 marking; default block |
| Classification violations | `sensitive`/`restricted` items lacking `release_to_final`, restricted raw values in any outbound field | Block; route to release review or downgrade review |

Rules:

- Detection combines pattern matching (secret formats, path shapes, identifier shapes) with metadata matching (classification labels, `eefi` flags, `release_to_final` on context items per `schema-files/context-item.schema.json`). Metadata verdicts dominate: a labeled item is filtered even when no pattern fires.
- The mission EEFI list is data, not code: adding an entry must not require a filter release.
- `Research Gap`: Detection of paraphrased or partially reconstructed EEFI, where the model restates a secret's meaning without its literal form, is unsolved here as in the industry; the filter's pattern layer will not catch it, only the metadata layer can.

## 5. Actions and events

| Action | When | Effect | Event emitted |
| --- | --- | --- | --- |
| Redact | The surrounding content is releasable and the sensitive span is separable | Span replaced with a typed placeholder; delivery continues | `OutputRedacted` |
| Block | The content is inseparable from the sensitive item, or the item is block-class | Delivery or dispatch halted; requester notified with reason class, never the matched value | `OutputBlocked` / `ToolTransferBlocked` |
| Escalate | Detection is a decision, not a rule: novel EEFI candidate, repeated blocks on one mission, EEFI found in an approved release, suspected exfiltration pattern | CCIR entry to the commander queue; affected channel holds | `EefiAlertRaised` |

Event rules:

- Every event carries stage, detection class, mission id, requesting role, verdict, timestamp, and a reference id for the matched item — never the matched raw value (AU-3 content, applied under the constraint that the audit record must not itself become the leak).
- Events are append-only in the event log and drive the dashboard OPSEC panel counts defined in `opsec-classification-model.md` section 8.
- Three blocks for the same item on one mission auto-escalate: repetition means either an attack pattern or a wrong rule, and both need a human.

## 6. False-positive handling

A filter that is only ever tightened ends up bypassed; false positives are handled through a decision path, not by weakening detection inline.

1. The requester appeals a verdict by reference id, with the mission purpose the block frustrates. The appeal never includes the blocked raw value.
2. A releasability decision by the appropriate authority (commander for restricted/EEFI items, protection role otherwise) may grant a scoped exception: this item, this mission, this channel, with expiry, recorded as an event.
3. An exception never edits the detection rule inline. Rule changes are a separate, reviewed change with fixture updates in the same commit.
4. Recurring false positives on the same rule become an AAR finding feeding a rule revision, mirroring the AAR-to-readiness loop.

- `Interpretation`: This is the downgrade-review discipline of `opsec-classification-model.md` section 6 applied to the filter: release is a decision by an authority, never a side effect of a pattern failing to match.

## 7. What this filter does not guarantee

Explicit non-guarantees, so no other control is relaxed on the filter's account:

- It is not a DLP system. It has no visibility into channels it is not wired to: the terminal, host logs, screenshots, out-of-band copies, or tools invoked outside the gateway.
- It cannot catch semantic leakage: paraphrase, inference from combinations of individually releasable facts, or timing and existence signals (a block itself reveals that something sensitive exists).
- It complements release review and never replaces it. Release review judges whether the whole packet should leave, in mission context; the filter only removes or blocks recognizable sensitive spans. Filter-pass plus review-skip equals a release-integration violation and must fail closed in `policy-engine-release-integration.js` terms.
- It does not sanitize what earlier stages already leaked into an external provider's logs, and it does not retroactively protect evidence stored without the labels `opsec-classification-model.md` requires.
- A clean filter verdict is evidence of absence of matches, not absence of EEFI.

## 8. Prompt guard

```text
Sensitive output check before release or dispatch.
1. Which boundary is this: final output (Stage OUT) or tool transfer (Stage TOOL)? Apply that stage's EEFI class.
2. Do all context items in this content carry labels, and does any lack release_to_final?
3. Do any detection classes fire: secrets, credentials, internal paths, personal data, EEFI-listed items?
4. Is the verdict redact, block, or escalate — and has the event been emitted without the raw value?
5. Has release review still been performed? A filter pass is not a release approval.
```

## 9. Source anchors

- ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715
- FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282
- JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- NIST SP 800-53 Rev. 5.1, AU-3 and AU-9: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
- Joint OPSEC Support Element, Operations Security (cited by title; add URL to `source-map.md` before use as a linked anchor)

## 10. Implementation Candidates

The [implementation registry](implementation-candidate-registry.md) tracks these requirements, equivalent paths, checks, and remaining work. A proposed filename is not proof of completion.

schema:

- `eefi-list.schema.json`
- `output-filter-event.schema.json`
- `filter-exception-grant.schema.json`

prototype:

- `sensitive-output-filter.js`
- `eefi-detector.js`
- `filter-exception-runner.js`
- `run-output-filter-fixtures.js`
