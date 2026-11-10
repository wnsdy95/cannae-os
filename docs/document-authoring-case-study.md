# Source-Grounded Authoring Case

## Evidence Boundary

Case date: 2026-11-10. Goals: G1, G2 and G4. This is a local authoring exercise
against the repository's actual support, governance and security policies, not
a live customer incident or a newly adopted support policy. The task and revision
below are evaluation scenarios selected for the active goal, not quotations of
a new USER approval. The assistant authored and self-reviewed the drafts in the
maintenance conversation. No independent reviewer, new model call, application
login, public issue, release or change to the source policies is claimed.

Source checkout before the exercise: `0f429bf89ba4c0ef3321756dad7e3a3e36c3e4c8`.

| Source | SHA-256 of source bytes read |
| --- | --- |
| [Support](../SUPPORT.md) | `f3d302b9b3fd9d4339e9ef97400a2daa4f28e3b52d22efef2f3663d9c4414295` |
| [Governance](../GOVERNANCE.md) | `578f5d251e8a6b0dec57dcc44e3d9055e0f2587810a322320f7dd8bf302f00ac` |
| [Security](../SECURITY.md) | `6c853d7423956aa3adbdf12fbd26d437caa139e99b0ee510acdc894ac9a45983` |

Hashes identify what was read; they do not prove that the interpretation is
correct. Re-read changed sources before reusing the draft.

## Task And Backbrief

Initial task:

> Draft a support escalation SOP from SUPPORT.md, GOVERNANCE.md and SECURITY.md.
> Preserve best-effort support and private vulnerability reporting. Do not publish it.

Backbrief: produce a review-only procedure that distinguishes ordinary support
from sensitive vulnerability reports, retains the existing intake fields and
decision owners, and invents no response deadline or granted authority. The
draft is the output; actually opening reports or changing policy is excluded.

Revision task:

> Revise the support escalation SOP to add a handoff section without changing policy.

Plan: read the three policy sources, map requirements, draft v1, add only the
requested continuity procedure in v2, compare both versions against the original
requirements, and hand off unresolved review decisions. A source or authority
conflict stops adoption; it does not justify selecting the more permissive rule.

## Research Note

- **Claim:** support is community best-effort, not a response-time commitment
  ([Support](../SUPPORT.md)). Security response also uses best-effort language
  ([Response Expectations](../SECURITY.md#response-expectations)).
- **Claim:** ordinary bugs and concrete proposals use Issues; Discussions are
  conditional on availability. Sensitive vulnerabilities must not use public
  Issues. Private vulnerability reporting is preferred if enabled, otherwise
  contact the repository owner through GitHub
  ([Where To Ask](../SUPPORT.md#where-to-ask),
  [Reporting A Vulnerability](../SECURITY.md#reporting-a-vulnerability)).
- **Interpretation:** classify sensitivity before choosing a channel. This is
  a synthesis of those policies, not evidence that a specific report was triaged.
- **Unknown:** current Discussions/private-reporting availability and a named
  case assignee were not checked. No live incident exists in this exercise.
  Those values must remain conditional or unassigned, not guessed.
- **Proposed application:** use the draft below for maintainer review. The
  proposal does not appoint maintainers or approve any external transmission.

## SOP Draft V1

Status: draft for review, not adopted. Intended reader: a maintainer or an AI
assistant preparing a maintainer's triage material. The assistant can draft and
flag decisions; it does not inherit maintainer or repository-owner permissions.

1. **Classify the report.** Use GitHub Issues for ordinary bugs, documentation
   defects and concrete proposals. Use Discussions for broad questions or
   design exploration only if enabled. Sensitive vulnerabilities or secret
   exposure must not be put in a public issue.
2. **Choose the sensitive path conditionally.** Use GitHub private vulnerability
   reporting if enabled; otherwise contact the repository owner through GitHub.
   Do not invent a private email address or assume either feature is enabled.
3. **Prepare minimal intake.** For ordinary issues, retain the affected artifact,
   expected behavior, observed behavior, validation commands actually run,
   relevant error output, and whether authority, release, risk, security or
   source traceability is affected. For security reports, retain a minimal
   reproduction, affected files, expected impact and any suggested fix. Never
   include real secrets, private data, production credentials or third-party
   confidential material. If safe disclosure is uncertain, hold transmission
   and ask for a safe minimal reproduction.
4. **Route decisions to existing authority.** Maintainers may triage, request
   validation and review changes. Unresolved disputes and security-sensitive
   policy changes go to the repository owner's final decision. Release actions
   remain separately authorized. AI-generated role labels confer no authority.
5. **Preserve approval classes.** Ordinary changes need one maintainer review.
   Control-surface changes need maintainer review, CODEOWNERS review when
   configured, passing CI and an explicit statement of the affected risk and
   authority boundary. Directional changes need the repository owner's final
   decision. Preparing this draft does not satisfy any of those approvals.
6. **Preserve service limits.** Support and security response remain best-effort;
   promise no deadline, guaranteed fix, production deployment assurance or
   confidential review through public issues. Do not offer legal, medical,
   financial, military or safety-critical advice. Custom implementation support
   requires a concrete repository issue. Preserve the security policy's AI
   safety boundary rather than treating this SOP as an exception.
7. **Record the disposition.** Distinguish draft, awaiting a decision, sent,
   acknowledged and resolved using actual evidence. A prepared report is not
   a sent report; no response or resolution is assumed for this exercise.

## Revision V2

Status: current review draft, not adopted. Predecessor: SOP Draft V1 above.
Revision scope: keep V1 steps 1-7 unchanged and append the handoff section below.
The canonical V2 draft is the seven numbered steps plus this section, all in
this file. V1 is retained so the exact change can be inspected without chat
history. Neither version supersedes the repository's source policies.

### Handoff Section Added By V2

Before transferring an unfinished case, record:

- the report or draft identifier, purpose, sensitivity and current channel;
- the canonical draft and policy paths, source versions and any changed source;
- observed actions/results separately from proposed actions and unrun checks;
- missing intake details, unresolved decisions and the authorized decision owner;
- the next action and stop condition, plus what must not be sent or changed.

Name a receiver only when one is actually assigned. The receiver compares the
packet with the current source policies and confirms understanding of the next
action and authority boundary before taking over. A written handoff is not
proof that a receiver accepted it. Recheck any changed task/phase routing before
delegated work; do not copy a prior wave's context or approval into a new wave.
This continuity section is a proposed procedure derived from the
[handoff template](handoff-packet-template.md), not a new support commitment.

## Requirement Comparison

Review method: author self-review against the three source files and both task
statements, including exclusions. This is not an independent semantic grade.

| ID | Requirement and origin | Draft location and review result |
| --- | --- | --- |
| R1 | Draft only; no publication (task) | V1 status and step 7; V2 status. Preserved. No external operation performed. |
| R2 | Best-effort support, no invented deadline (Support; Security response expectations) | V1 step 6 remains unchanged in V2. Preserved; no numeric response SLA introduced. |
| R3 | Ordinary Issues and conditional Discussions (Support, Where To Ask) | V1 step 1, retained in V2. Preserved, including the availability condition. |
| R4 | Sensitive reports not public; conditional private path and owner fallback (Security, Reporting A Vulnerability) | V1 steps 1-2, retained in V2. Preserved without inventing an email or enabled feature. |
| R5 | All six ordinary issue intake categories (Support, Before Opening An Issue) | V1 step 3, retained in V2. Affected artifact, expectation, observation, commands, errors and control-boundary impact are all present. |
| R6 | Minimal security reproduction and no real secrets/private data (Security, Reporting A Vulnerability and Secret Handling) | V1 step 3, retained in V2. Preserved; an unknown safe disclosure is held, not uploaded. |
| R7 | Maintainer versus owner authority, release only when authorized (Governance) | V1 steps 4-5, retained in V2. Preserved; draft authorship does not grant a role. |
| R8 | Ordinary/control/directional review classes (Governance, Decision Classes) | V1 step 5, retained in V2. Preserved, including conditional CODEOWNERS and CI for control changes. |
| R9 | Support exclusions and prototype limits (Support, Out Of Scope; Security, Supported Status) | V1 step 6, retained in V2. No new support entitlement, production guarantee or compliance claim. |
| R10 | Keep unknown availability and assignment explicit (sources do not establish live state) | Research Note and V1 step 2; V2 receiver rule. Preserved as unresolved, not treated as verified absence. |
| R11 | Add a receiver-ready handoff without policy changes (revision task) | V2 added section; V1 steps 1-7 unchanged. The additions are explicitly proposed, with no claim of receiver acceptance. |
| R12 | Preserve canonical context and version lineage (authoring workflow) | Source hashes, V1, V2 and the handoff below identify the inputs, change and next action. No source policy was overwritten. |

Result: the author found no remaining contradiction in these mapped requirements.
Independent completeness review, real receiver acceptance and live support use
are still unverified. Unknowns can be handed off; they are not approval to adopt
the SOP or contact an external recipient.

## Handoff Of This Exercise

- **Objective:** evaluate document fidelity and revision, not operate support.
- **Current artifact:** this file, Revision V2 together with unchanged V1 steps.
- **Completed:** read the three actual source policies; authored the research
  note, V1 and V2; compared R1-R12. This is an author self-review.
- **Source-of-truth files:** this file, `SUPPORT.md`, `GOVERNANCE.md`, `SECURITY.md`
  and `docs/document-authoring-workflow.md`.
- **Open decisions:** whether a maintainer accepts the proposed SOP; a real
  case's assignee and channel availability if operational use is later requested.
- **Next action:** review the source policies and R1-R12 from this file alone;
  record any missed requirement or contradiction before considering adoption.
- **Verification:** routing regressions are in `run-document-routing-fixtures.js`;
  the 2026-11-10 run passed 146 queries across both providers and 3 link-inventory
  checks. Routing preflight passed 8/8 and mandatory-control enforcement 6/6.
  These results prove selected reference/control behavior, not this prose's
  semantic completeness. Source policy hashes were rechecked unchanged.
- **Do not do:** publish, change support commitments, appoint an owner, expose
  sensitive material, infer a live incident, or assert independent acceptance.
- **Receiver acceptance:** not obtained. No new reviewer/model session was run.

## Observed Routing Failure And Adaptation

Before the fix, the exact initial task selected authority/release and document
access routes but omitted the authoring workflow and SOP templates. The revision
selected continuity only; the standalone handoff request omitted the handoff
template. These were observed router outputs, not inferred from file existence.

Both providers now recognize the bounded format terms `SOP`, `standard operating
procedure` and `research note`; continuity also carries the actual handoff
template. Regression requests retain modifiers, prohibitions and the original
source names, and exercise human and read-only AI modes. An unrelated `soap`
sales request checks that whole-word SOP matching does not claim domain coverage.
An SOP subtask with an explicit uncovered sales mission objective must retain
its provisional capability cell and read-only authority; format routing does
not establish domain expertise or activate a standing department.
The reusable skill change is to test realistic format names and verify exact
task references, then compare the draft against source-derived requirements.

At the first case checkpoint, explicit source paths were not automatically
resolved into primary recommendations. This case read the named sources directly
under the authoring procedure; it did not remove required controls from a receipt.

The following G2 improvement adds existing named inputs to primary recommendations
in both providers. The original request now selects `SUPPORT.md`, `GOVERNANCE.md`
and `SECURITY.md`. Repeatable `--source` options reject unresolved required inputs
before receipt publication; ordinary unresolved mentions remain visible for
input/output clarification. Tests cover exact and unique names, Markdown and
space-containing paths, ambiguity, traversal, ignored/tracked local state,
symlink files/directories, and URLs without fetching them.

The reusable operator change is to distinguish source inputs from new output
paths, explicitly require critical corpus inputs, and resolve remaining ambiguous
mentions before analysis. Recommendation remains separate from read permission
and factual source review. Receipt/context tests must prove that selected sources
reach the receiver; a successful lookup alone is insufficient.

The follow-up local run passed 156 routing queries, 32 required-input rejection
cases and 3 link-inventory checks across both providers. Preflight passed 9/9,
mandatory controls 6/6 and mission-controller fixtures 31/31. The context-pack
regression checks the exact SHA-256 of all three source policies at the receiver,
with tool execution and release still unauthorized. These fixtures are not a
new independent authoring review or evidence of a live support operation.

At that source-resolution checkpoint, lexical matching still treated
`do not publish` as a release topic and recommended unnecessary specialist
material. The follow-up work order below addresses reading scope while keeping
all selected release controls. Arbitrary semantic source inference, other
repositories' inputs, and a plan-level mandatory-input contract remain unproven;
neither source lookup nor a passed fixture supplies independent case acceptance.

The case is grounded in local project policy, not new external military research.

## Actual Maintenance Work Order

Record: `WO-ROUTING-READING-20261110`, revision 1, written before the reading-scope
implementation. Baseline: commit `574ff66`. This is a plain-language local work
order derived from active goal G2 and the observed case above, not an adopted
runtime OPORD, a delegated wave or a new USER policy approval. The assistant
owns execution and reporting; USER retains final scope and policy decisions.

### Situation And Intent

The original support-SOP query currently recommends 23 documents totaling
419345 filesystem bytes, including four GitHub release-operation documents.
These are recommendation measurements, not measured model token usage.
The source lookup fix is already present; the remaining observed gap is
specialist reading attached to a generic publication prohibition.

Purpose: reduce irrelevant reading without losing sources, required general
authority policy or executable controls. End state: ordinary support writing
does not require GitHub release manuals, while actual release maintenance keeps
them. This does not authorize execution of a release.

### Tasks And Acceptance

| ID | Required work and unchanged constraint | Evidence needed |
| --- | --- | --- |
| M1 | Keep the three named source policies and authoring references. | Same original task in human and delegated modes. |
| M2 | Keep general approval, risk, tool and disclosure policy; omit only unrelated GitHub specialist reading. | Exact expected primary-document set for a generic publication boundary. |
| M3 | Retain specialist documents for explicit GitHub release work, inherited mission context, named source references and verifier dependency migration. | Positive routing regressions, including negated and mixed clauses. |
| M4 | Do not change route scores, capability decisions, role/authority fields, selected commands or required-control admission. | Direct/receipt comparison and existing enforcement/context regressions. |
| M5 | Carry the new reading selection into receiver context, not only CLI output. | Digest-bound context documents plus retained required controls. |
| M6 | Mirror a reusable procedure in both skills; keep source/index/history coherence. | Skill checks, routing coverage, links, source audit and this order/report record. |
| M7 | No service, model invocation, credential change, external publication or scope expansion. Preserve the user's existing ignore edit. | Actual action report and source/ignore comparison; not an inferred approval. |

### Backbrief And Method

Author backbrief: the deliverable is a smaller task-relevant reading selection,
not fewer safety checks. Do not remove a keyword merely because it appears
after "do not". Use positive release-context selection for specialist reading;
ambiguous publication remains subject to the existing general controls.
This is a self-check, not a second agent's acknowledgement.

Planned sequence: route and inspect the task, implement the smallest mirrored
selection change, run direct/receipt/context tests, record actual results,
and leave the next bounded action. Any method change must preserve M1-M7.
Stop and report if satisfying a check requires dropping controls or expanding
authority; fix ordinary reversible implementation/test failures in scope.
Freeze source while state-sensitive lifecycle checks run.

### Initial SITREP

At work-order creation, the baseline probe and source inspection are complete.
The reading-scope implementation, regressions and final handoff are not yet
complete. No independent review or receiver acceptance has occurred.
Append the actual disposition below; do not rewrite this planning snapshot
as though later results were known in advance.

### Result Report And Revision 2

Revision 2 appends observed results and the current handoff on 2026-11-10.
The revision-1 intent, tasks M1-M7, authority and stop conditions above remain
unchanged. No FRAGO or new runtime approval was needed for this bounded
implementation choice. Review below is by the author, not independent acceptance.

Both routers now condition the four GitHub release manuals on positive task,
mission or source context. The original support task changed from 23 primary
documents to 19. The four omitted manuals totaled 64255 filesystem bytes at
the implementation probe; this is not a model-token or cost measurement.
The same nine validation commands and all three source policies remained.
Explicit release work, including negated and mixed release clauses, retains
the specialist reading. This does not solve general natural-language negation.

| Requirement | Observed disposition and evidence | Limit |
| --- | --- | --- |
| M1 | The exact original task retains its three source files and authoring references in `run-document-routing-fixtures.js`. | Reference selection is not a semantic grade of the SOP. |
| M2 | Generic publication/approval tasks omit the four specialist manuals while all six general authority/policy documents remain. | Other routes can still over-recommend; no globally minimal bundle is claimed. |
| M3 | Explicit, inherited and source-selected GitHub contexts and existing dependency-migration requests retain specialist documents. | Context selection is lexical and intentionally conservative about explicit prohibitions. |
| M4 | Source-selected reading changes leave routes, capability, mode and commands equal; the original task retains its exact nine commands. Enforcement regressions remain passing. | No previously issued context or approval was rewritten. |
| M5 | A real fixture wave gives generic and release-review tasks different digest-bound reading, with the same six release/authority controls and no execution or release grant. | This is controller execution in a test repository, not live agent dispatch. |
| M6 | Both skill entrypoints/references teach that smaller reading is not waived control; current corpus checks accompany the change. | No independent review or complete G4 acceptance follows automatically. |
| M7 | Only local code, fixtures and documents changed. Source-policy and user-ignore digests remained unchanged. No operator service, credential, actual model call or external publication was changed or started. | Local fixture execution is not production or multi-client acceptance. |

Executed local checks:

- `node run-document-routing-fixtures.js`: 200 queries across both providers,
  32 required-source rejections and 3 link-inventory checks passed.
- `node run-agent-routing-preflight-fixtures.js`: 10/10 passed, including direct
  output, receipt schema/selection and inherited mission context.
- `node run-skill-control-enforcement-fixtures.js`: 6/6 passed.
- `node run-skill-mission-controller-fixtures.js`: 32/32 passed, including the
  new per-task reading test, rerouting, isolation, stop and termination checks.
- `validate-controls-skill.js` passed for both provider trees (178 lines each);
  both routers' `--coverage` checks returned valid with zero unrouted artifacts.
- `source-map-linter.js` and `implementation-candidate-registry.js audit`
  returned valid with no findings. The `.github/scripts/` checks passed for
  Markdown links (182 files), English-only content (1194 tracked files) and
  JSON parsing (664 files); `git diff --check` was clean.

These are the checks executed for this change, not a full aggregate, hosted CI,
native multi-client/model run or independent review.

A diagnostic launcher initially had a JavaScript syntax error and exited before
starting the router. The launcher was corrected and the read-only query rerun;
the failure is not counted as a pass. This is a known pre-execution local error,
not evidence of recovery from unknown remote effects. No failed control was
removed or relabeled. Source edits were frozen during lifecycle verification.

### Maintenance AAR

- **Expected versus observed:** a support-writing task needed general disclosure
  policy, but a single authority route also attached four GitHub operation manuals.
- **Cause and change:** a coarse reading bundle mixed general boundaries with
  specialist procedures. Positive context selection separates the reading,
  while retaining the full command selection and authority boundaries.
- **Reusable adaptation:** both provider skills now tell the next operator to
  distinguish omitted reading from waived checks, reroute on task/phase changes,
  and inspect direct output, receipt and receiver context separately.
- **Evidence and limits:** the report above records the executed regressions;
  broader semantic routing and an independent cold start remain unproven.
  Do not generalize this result into permission to delete issued controls.

### Current Maintenance Handoff

- **Canonical record:** this work order, revision 2; code remains in the two
  `controls-doctrine-operator/scripts/route_controls_docs.js` provider trees.
- **Completed local work:** conditional specialist reading, mirrored operator
  guidance and the direct/receipt/context regression checks above.
- **Read first:** `docs/skill-first-product-scope.md`, this work order and
  `docs/completion-backlog.md` under Active Core Work. The actual test entrypoints
  are listed in the result report; no chat history is required to locate them.
- **Open work:** broader semantic omission/replanning and receiver acceptance;
  required inputs across target repositories; full install/copy discovery tests.
  Conditional reading does not reduce conservative validation-command selection.
- **Next bounded action:** inspect `install-ai-cli-skills.sh` and existing skill
  installation fixtures for G5. Verify both clients using isolated temporary
  homes/targets first, preserving current installed links and all user settings.
  Separate what those tests prove from actual native-client/model execution.
- **Retained decisions and stops:** USER owns product scope, authority, actual
  model-call approval and external publication. Do not restore deferred platform
  work, weaken checks, alter credentials or treat a test pass as release approval.
- **Receiver acceptance:** not obtained. This is an available handoff, not proof
  that a new agent independently resumed the work or approved the prose.
