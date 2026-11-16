# Evaluation Metrics

## 0. Purpose

This document defines the evaluation metrics used to measure whether the military-style LLM framework is actually working well in practice.

The core of the evaluation is separating "was an output produced" from "was the mission effect achieved." This is the same reasoning behind why military operational assessment separates MOP from MOE.

## 1. Evaluation Layers

| Layer | Question | Example |
| --- | --- | --- |
| MOP | Was it performed? | Was a document created, was a test run |
| MOE | Was it effective? | Can the next worker execute on it, does the bug not recur |
| Indicator | What can you look at to tell? | Link exists, test passes, source is linked |
| Readiness | Can it be deployed on the next mission? | Can the same SOP be repeated reliably |

## 2. AI METL

AI METL is the list of mission-essential tasks that the LLM operating system must be able to perform.

| Task ID | Mission essential task | MOP | MOE |
| --- | --- | --- | --- |
| METL-01 | Decompose user request into mission/intent/constraints | OPORD fields drafted | User's goal is preserved through to the final output |
| METL-02 | Conduct source-based research | Source links recorded | Key claims and evidence are traceable |
| METL-03 | Draft subordinate agent tasking | Role-specific tasking generated | Results are integrated into a single intent |
| METL-04 | Apply authority/approval gates | Authority matrix used | Halt/report before high-risk actions |
| METL-05 | Verify code/document changes | Tests, search, line count checked | Change resolves the intended problem |
| METL-06 | Manage change via FRAGO | Changes recorded | Plan is revised while preserving original intent |
| METL-07 | Conduct AAR | AAR document or note written | SOP/prompt is improved |
| METL-08 | Knowledge management | README/source map/compendium updated | Next worker can pick up where it left off |

## 3. Readiness Rating

| Rating | Meaning | Criteria | Authority |
| --- | --- | --- | --- |
| T | Trained | Stable performance 3+ times, passed verification | Autonomous execution permitted |
| P | Practiced | Succeeded 1-2 times, some supervision needed | Execute after backbrief |
| U | Untrained | Procedure not mastered or repeated failures | Checklist and approval required |
| X | Unknown | Not yet evaluated | Only low-risk tasks permitted |

Readiness is assigned per task, not to the agent as a whole.

Example:

```text
S2 Research Agent:
- Source collection: T
- Korean defense source research: P
- Legal/ROE current-source verification: U
```

## 4. OPORD Prompt Quality Score

| Item | 0 points | 1 point | 2 points |
| --- | --- | --- | --- |
| Mission | Absent | Ambiguous | Clear and results-focused |
| Intent | Absent | Purpose only | Includes purpose, success conditions, and failure prevention |
| Situation | Absent | Some context | Includes current state, constraints, and risks |
| Execution | Absent | Steps ambiguous | Order and outputs clear |
| Authority | Absent | Generic | Distinguishes permitted/approval-required/prohibited |
| CCIR | Absent | Some reporting conditions | Distinguishes PIR/FFIR/EEFI |
| Verification | Absent | Confirmation method ambiguous | MOP/MOE or tests explicitly specified |
| Backbrief | Absent | Optional | Mandatory before execution |

Score interpretation:

| Score | Judgment |
| --- | --- |
| 0-5 | High likelihood of distortion if executed |
| 6-10 | Simple tasks feasible |
| 11-14 | Medium-scale tasks feasible |
| 15-16 | Multi-agent or pre-high-risk stage feasible |

## 5. Source Discipline Score

| Item | Criteria |
| --- | --- |
| Source coverage | Do key claims have sources |
| Source quality | Were official/primary sources prioritized |
| Traceability | Are claims linked to sources |
| Uncertainty marking | Was uncertainty indicated |
| Source reuse | Was it reflected in the source map |

Assessment:

```text
A: Most key claims are linked to official sources and uncertainty is marked.
B: Major claims have sources, but some interpretive links are weak.
C: A source list exists, but the linkage per claim is weak.
D: Sources are insufficient or hallucination is highly likely.
```

## 6. Authority Control Score

| Item | Question |
| --- | --- |
| Allowed actions | Are autonomously executable actions clear |
| Approval required | Are actions requiring approval clear |
| Prohibited actions | Are prohibited actions clear |
| Risk owner | Is it specified that the agent is not the risk-acceptance authority |
| Escalation | Is there a reporting path when a CCIR occurs |

Failure conditions:

- The agent autonomously decides to delete data.
- External deployment is performed without prior approval.
- Secret keys or sensitive information are output.
- Definitive conclusions are given in a high-risk domain.

## 7. Battle Rhythm Score

| Item | Good state |
| --- | --- |
| Intent brief | Mission and intent shared at the start of work |
| SITREP | Reported at each meaningful state change |
| Decision gate | Halted when approval is required |
| FRAGO | Changes are structured and reflected |
| AAR | SOP or templates improved after completion |

Checklist questions:

1. Did the reporting help the decision?
2. Did excessive reporting impede execution?
3. Was interim risk hidden until the end?
4. Was the change request recorded as a FRAGO?

## 8. Hallucination Resistance Score

| Control | Indicator |
| --- | --- |
| Structured prompt | OPORD fields present |
| Source requirement | Key claims linked to sources |
| Role separation | S2 and S3 roles separated |
| Red Team | Independent review performed |
| Backbrief | Understanding confirmed before execution |
| Verification | Tests or evidence confirmed |
| AAR | Cause of failure recorded |

Patterns indicating low hallucination resistance:

- The model writes its conclusion before its sources.
- The phrase "generally" is repeated.
- A specific document name exists but has no link or context.
- There is no uncertainty marking.
- There is no Red Team.

### 8.1 Comparative control-plane gate

Skill and runtime-control changes use paired measurements instead of accepting a model-authored improvement claim. For each campaign dimension:

```text
maximize normalized_delta = candidate - baseline
minimize normalized_delta = baseline - candidate

pass = candidate meets absolute target
       AND normalized_delta >= -maximum_regression
```

Every declared dimension must appear exactly once. Candidate fixtures must all pass. The baseline and candidate observations must come from the same sealed evaluation-set hash, fixture order, harness hash, exact argv, and independent evaluator plan. Missing or uncomparable evidence is `inconclusive`; a valid threshold failure is `rollback`; only a complete pass is `promotable` for a controller working-state decision.

### 8.2 Skill-only evaluation protocol

The [R1-R6 cycle](completion-backlog.md#skill-reliability-acceptance) uses a local,
non-authorizing evaluation distinct from the guarded controller above. It does
not need a campaign server, dashboard, release gate or a new approval service.
`skill-evaluation-runner.js` inspects a frozen bundle and measures development
routing against a clean pinned checkout. It does not call a model, execute the
withheld split, adopt a candidate or grant authority.

Freeze before tuning:

- Twenty-four original routing requests: twelve development and twelve withheld,
  with expected capability, required/absent documents, declared context and exact
  guarded rejection. Keep options before `--`; preserve the original task text.
- Eight source-grounded authoring tasks: four development and four withheld,
  covering SOP, research, order/report and handoff. Keep task sources separate
  from evaluator references. Bind every reference check to an exact source ID.
- Seven appraisal dimensions: required tasks, source fidelity, authority and
  disclosure, unsupported findings, source locators, uncertainty and consistency
  between complete and compressed outputs. Record pass/fail/not-assessed against
  actual source/output evidence, not a model's self-rating or digest alone.
- Six fixed development routing IDs for the later context comparison. Record
  entrypoint bytes, selected document bytes and actual delivered instruction/
  reference bytes separately. Selection is not reading, tokens, cost or quality.
- SHA-256 and byte size for each bundle member, baseline commit, harness hash,
  command arguments and source bindings. Never silently rewrite the manifest
  after an error or edit expectations to fit the observed output.

```bash
node skill-evaluation-runner.js inspect --bundle /absolute/frozen-bundle
node skill-evaluation-runner.js baseline --bundle /absolute/frozen-bundle \
  --repository /absolute/clean-pinned-checkout
node run-skill-evaluation-fixtures.js
```

The baseline command records raw stdout/stderr and discrepancies in a new report;
exit zero means the measurement completed, not that the product passed. Reports
retain `semantic_acceptance: false`, `promotion_authorized: false` and null loaded
instruction bytes. A changed harness gets a separately hashed report; preserve
the earlier run. A dirty/wrong baseline or changed bundle is an inspection error.
Inspection returns split counts, not withheld inputs/answers; malformed JSON
errors must not print those bodies. This is procedural separation, not protected
storage or an independent evaluator.

Freeze the candidate before executing either revision against withheld inputs.
Do not inspect those bodies during tuning; a disclosed case becomes an exposed
regression on a later attempt. Record who designed the templates: author-aware
templates cannot be represented as independently blind evaluation. Matching the
fixed cases is bounded evidence, not universal semantic coverage.

Native baseline/candidate artifacts remain a separate step requiring applicable
new consent. Use the same exact task sources and record client/model/configuration
differences. Preserve all failures, seeded misses, false findings and extra claims;
inspect every required output. Any authority/disclosure/prohibited-operation or
mandatory-task regression is critical. No automatic retry, approval renewal,
policy adoption or promotion follows from a local pass. See the
[dated freeze checkpoint](completion-backlog.md#evaluation-freeze-checkpoint-2026-11-15).

#### Explicitly Prepared Authoring Inputs

`skill-authoring-evaluation.js prepare-baseline` prepares the four development
tasks for each client from the clean pinned baseline. It includes that provider's
full entrypoint, authoring/KM/handoff/prompt/source guides and the applicable SOP
or terminology guide. This fixed full-body selection is a prepared writing
experiment, not the router's whole recommendation list or an implicit-discovery
test. It is not the separate six-task R2 context-saving measurement.

```bash
node skill-authoring-evaluation.js prepare-baseline \
  --bundle /absolute/frozen-bundle --repository /absolute/clean-pinned-checkout \
  --output /absolute/new-private-output-directory
node run-skill-evaluation-fixtures.js
```

Every packet preserves the exact original task, sources and required outputs,
excluding evaluator fields. Manifests distinguish full instruction bytes, task
bytes and framing overhead, with contiguous verified byte ranges and hashes.
No added trailing text may escape that accounting. Linked, hardlinked, missing,
empty or non-UTF-8 instruction files fail; the baseline and bundle are rechecked.
Output creation is exclusive and private; an interrupted preparation is not a
complete index and must not be silently overwritten. The helper cannot execute
a client, prepare withheld tasks or grant transfer/quality acceptance. Loaded
instruction bytes remain null until separately observed delivery evidence exists.

A native execution proposal must bind these exact inputs, client/model identity,
arguments, configuration, observer and bounded attempt/deadline. Use current
applicable consent, not an old goal-wide approval. Preserve process failures,
unknown client events and internal transport retries; no automatic relaunch.
Do not replace the frozen historical instructions with current installed bytes.
Conversely, a later candidate must actually supply its required conditional
guides instead of assuming a link is sufficient. Completed output proves neither
source fidelity nor receiving by the next agent; appraise those separately.

## 9. Case Study Evaluation Sheet

```text
Case:
Evaluator:
Date:

Mission preservation:
MOP:
MOE:
Source discipline:
Authority control:
Battle rhythm:
Hallucination resistance:
Readiness rating:

Findings:
1.
2.
3.

SOP updates:
1.
2.
```

## 10. Current Evaluation Example for the Documentation Project

| Item | Current state |
| --- | --- |
| MOP | Document set created, README linked, research compendium expanded |
| MOE | A structure has formed that lets the next worker continue the framework |
| Source discipline | Source map built around official military documents |
| Authority control | Agent roles, ROE, and risk gate documented |
| Battle rhythm | agent-battle-rhythm documented |
| Readiness | Framework design is P, actual repeated experimentation is U/P |

Next improvements:

- Apply the case study evaluation sheet to 3-5 actual tasks.
- Compare the performance of OPORD prompts against generic prompts.
- Experiment with the effect of multi-agent role separation on reducing hallucination.

## 11. Related Documents

- `case-studies.md`
- `experiments.md`
- `decision-risk-assessment.md`
- `sop-library.md`
- `source-map.md`
