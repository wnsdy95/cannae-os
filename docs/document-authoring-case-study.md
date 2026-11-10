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

Residual G2 work: lexical matching still treats `do not publish` as a possible
release topic and can recommend unnecessary release material. Explicit source
paths are not automatically resolved into primary recommendations. This case
read the named sources directly under the authoring procedure; it did not
silently remove required controls from an issued runtime receipt. Both issues
remain visible for relevance/minimal-context work rather than being called fixed.

The case is grounded in local project policy, not new external military research.
