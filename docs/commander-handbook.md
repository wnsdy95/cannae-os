# Commander Handbook

## 0. Purpose

This document is a practical handbook for use when a human is commanding an AI LLM system.

The core principles are simple.

- The human owns purpose, priority, risk acceptance, and approval authority.
- The AI agent owns analysis, drafting, execution, verification, and reporting.
- The scope within which an AI agent may act autonomously is limited strictly to the authority documented for it.
- Dangerous action is a matter of approval authority, not capability.

In multinational application, `Commander` should not be read as a rank specific to any one nation's military. Here it refers to the person or authority responsible for the ultimate purpose, approval, risk acceptance, and disclosure decisions. Where this conflicts with the actual approval structure of a local military/organization, the jurisdiction gate in `docs/multinational-doctrine-consistency-review.md` takes precedence.

## 1. The Commander's 5 Core Responsibilities

| Responsibility | Military meaning | AI operations meaning |
| --- | --- | --- |
| Intent owner | Sets the operational purpose and desired end state | Fixes the purpose that must be maintained even if the model gets confused |
| Priority owner | Sets the main effort and economy of force | Decides which tasks to do first and what to give up |
| Risk owner | Decides which risks to accept | Approves or denies Red/Amber actions |
| Boundary owner | Sets prohibition lines and approval lines | Controls tools, data, deployment, payment, external transmission |
| Assessment owner | Judges whether success has been achieved | Confirms effect achievement, not merely the existence of an output |

The commander does not personally direct every detailed procedure. Instead, they clarify intent, boundaries, information requirements, and approval criteria.

## 2. Inputs the Commander Must Provide First

When starting a task, the commander provides the following 9 items.

| Field | Question | Example |
| --- | --- | --- |
| Mission | What must be accomplished? | Document a military-style LLM operations framework and build a prototype |
| Purpose | Why is it being done? | To reduce hallucination, unauthorized execution, and missed reporting |
| End state | What is the evidence that it is finished? | Documents, schema, runner, and dashboard are verified |
| Main effort | What is the most important axis? | Documentation and the authority model |
| Constraints | What conditions must be absolutely observed? | Modify local files only, no external deployment |
| Authority | What can be executed autonomously? | Document generation, local test run |
| Approval required | What must wait for approval? | prod deploy, credential use, payment |
| CCIR | What must be reported immediately if it occurs? | Verification failure, scope change, need for a Red action |
| Assessment | How will it be evaluated? | Validator/test passes, source map updated, reflected in the AAR |

## 3. Commander Prompt Skeleton

```text
MISSION:
- Objective to achieve:
- Final effect the user wants:

INTENT:
- Purpose:
- Key tasks:
- End state:
- Failure to avoid:

AUTHORITY:
- Allowed without further approval:
- Approval required:
- Prohibited:

CCIR:
- PIR: Information I need in order to decide
- FFIR: Execution capability/resource/tool issues
- EEFI: Information that must not be exposed

REPORTING:
- When to send a SITREP:
- In what format to report:

ASSESSMENT:
- MOP: Performance indicators
- MOE: Effect achievement indicators
- Verification commands or checks:
```

## 4. How to Enforce a Backbrief

After issuing an order, do not have it executed immediately — first have the agent restate it back.

```text
Backbrief before executing.
1. The mission as you understand it
2. The commander's intent
3. Actions you can execute autonomously
4. Actions that must stop pending approval
5. Expected deliverables
6. Failure possibilities and stop conditions
7. The first execution step
```

Approval criteria:

- Mission and purpose must not be confused with each other.
- Output and effect must be distinguished.
- Red/Amber actions must be self-identified.
- The agent must not pretend to know what it does not know.

## 5. Authority Levels

| Level | Meaning | Example | Commander action |
| --- | --- | --- | --- |
| Green | Safe, reversible, and within scope | Local document drafting, read-only search, local test | Autonomous execution allowed |
| Amber | Has impact but is reversible to a limited degree | Structural change to the same file, citing external material, large refactor | Requires prior reporting or an implicit approval scope |
| Red | External impact, cost, deployment, data change, security risk | prod deploy, credential use, DB mutation, sending email | Explicit approval required |
| Black | Prohibited | Secret exposure, legal violation, violation of user intent | Refuse and propose an alternative |

Authority is not determined by role alone.

```text
Authority = role + mission + task + target + tool + risk + readiness + time limit
```

Accordingly, an S3 agent running a local validator may be Green, but the same S3 requesting a production deployment is Red.

## 6. Approval Request Format

Red actions, or significant Amber actions, must be submitted in the following format.

```text
APPROVAL REQUEST:
- Requested action:
- Tool:
- Target:
- Mission/task link:
- Why needed:
- Risk:
- Mitigation:
- Rollback:
- Scope:
- Expiry:
- Evidence required after execution:
- Recommended decision: approve / approve with constraints / revise / reject
```

The commander responds with only one of the following:

- `Approve once`: Allowed only once, within the specified scope.
- `Approve with constraints`: Conditional approval.
- `Revise`: Revise the plan and resubmit.
- `Reject`: Execution prohibited.
- `Issue FRAGO`: Change to the scope or priority of the mission itself.

## 7. Reporting Scope

More reporting is not necessarily better. Priority is given to reporting only information that changes the commander's decision.

Report immediately:

- A Red action is needed.
- A validator/test/replay has failed.
- A source is uncertain but affects the conclusion.
- A requirement arises that conflicts with existing intent.
- A change larger than expected in file/scope/risk.
- The user's latest instruction conflicts with the existing plan.

Report periodically:

- Progress on tasks running longer than 30 minutes.
- A summary of deliverables/verification after completing a major stage.
- Need for changes to the AAR and readiness.

Not required to report:

- Detailed progress on already-approved Green work.
- Simple file reads.
- Minor wording adjustments within an existing pattern.

## 8. How to Operate a Single Agent

A single agent easily becomes a structure where one entity concurrently plays commander, staff, and executor. For this reason, the roles must always be separated in temporal sequence.

Procedure:

1. Mission intake: Convert the user's request into a mission statement.
2. Mission analysis: Identify unknowns, risk, constraints, and CCIR.
3. Draft OPORD: Write the execution plan and authority boundaries.
4. Backbrief: Restate what was understood and the stop conditions.
5. Execute Green: Execute within the approved scope.
6. Escalate Amber/Red: Stop when approval is needed.
7. SITREP: Report progress and obstacles.
8. AAR: Results, differences, lessons, and next SOP revisions.

Single-agent prompt:

```text
You are a single agent, but internally you must separate your thinking into Commander / S2 / S3 / S6 / Evaluator roles.
Do not verbosely output the full reasoning for each role — report only the summary needed for the decision.
Backbrief before executing, and perform only Green actions.
Halt Amber/Red actions with an approval request.
```

## 9. How to Operate a Multi-Agent System

With multiple agents, coordination cost becomes a problem before performance does. The commander must first decide "who reports to whom."

Basic structure:

| Role | Function | Autonomous execution | Reports to |
| --- | --- | --- | --- |
| Commander | intent, priority, risk acceptance | Decisions only | User |
| CoS | integration, battle rhythm, tasking | Green coordination | Commander |
| S2 | research, evidence, uncertainty | Read/summarize | CoS |
| S3 | execution plan, current ops | local Green execution | CoS |
| S4 | resource, token, tool availability | resource estimate | CoS |
| S6 | knowledge, docs, state, automation | docs/state updates | CoS |
| Red Team | contradiction, risk, adversarial review | review only | Commander/CoS |
| Evaluator | MOP/MOE/AAR/readiness | assessment draft | Commander |

Multi-agent principles:

- No agent reports directly and at length to the user.
- The CoS resolves duplication, conflict, and omission.
- The Red Team holds no execution authority.
- The Evaluator separates deliverable completion from effect achievement.
- S6 maintains documents and the event log as the source of truth.

## 10. Distortion-Free Tasking Checklist

Before issuing the order:

- Are mission and purpose kept separate?
- Is the end state observable?
- Are forbidden actions explicitly stated?
- Is the CCIR distilled to 3 or fewer critical decision points?
- Is the subordinate agent left room to choose its own method?

Immediately after tasking:

- Was a backbrief received?
- Did the agent identify the actions requiring approval?
- Are deliverables and the verification method linked?
- Is the reporting timing set?

During execution:

- Is the SITREP centered on the CCIR?
- Does execution stop when risk increases?
- Are source and interpretation kept separate?
- Is it recorded in the event log or documentation?

After completion:

- Were both MOP and MOE evaluated?
- Did the AAR lead to SOP/readiness revisions rather than ending as mere lessons learned?
- Can the next operator pick this up without the chat history?

## 11. Commander Decision Matrix

| Situation | Decision | Rationale |
| --- | --- | --- |
| Goal is clear but there are multiple methods | Delegate, providing only intent and constraints | Secures disciplined initiative |
| Information is insufficient but risk is low | Allow Green reconnaissance | Gather information before deciding |
| Information is insufficient and risk is high | Issue a PIR, hold execution | Prevent premature incorrect execution |
| Deliverable is complete but the effect is uncertain | Direct the Evaluator to assess MOE | Separate output from effect |
| Agent fails to recognize the approval line | Halt immediately, retrain on authority | Risk of unauthorized action |
| Scope changes | Issue a FRAGO | Prevent distortion of the existing OPORD |
| The same problem recurs | Revise the SOP and schema | AAR feedback loop |

## 12. Hallucination Control

The commander should order "separate the source from the judgment" rather than "tell me the right answer."

Prompt:

```text
Separate every claim into three kinds.
1. Source-backed claim: a fact with a source
2. Inference: an interpretation I derived from the source
3. Open question: a part not yet verified

Do not assert policy/law/current facts without a source-backed claim.
If uncertain, escalate it as a CCIR or PIR.
```

Hallucination-prevention mechanisms:

- source map.
- evidence record.
- quote limit and citation rule.
- Red Team review.
- validator/schema.
- AAR correction.

## 13. What the Commander Must Not Do

- Do not simply instruct "use your judgment."
- Do not set only the output format while omitting authority.
- Do not approve a Red action once for convenience and then keep allowing it thereafter.
- Do not assign the same task to every agent simultaneously.
- Do not let uncertain, current information be asserted as fact without browsing.
- Do not end with an AAR written but the SOP or readiness left unupdated.

## 14. Quick Order Templates

Documentation mission:

```text
MISSION: Organize the given topic into a document on the military-style LLM operations framework.
INTENT: Leave authority, reporting, SOP, and verification at a level the next operator can execute from.
AUTHORITY: Creating/editing local documents is Green. External deployment, credentials, and incurring cost are Red.
CCIR: Source uncertainty, conflicting user instructions, schema/test failure, scope expansion.
ASSESSMENT: README/source-map/compendium updated, link check, AAR note.
```

Code implementation mission:

```text
MISSION: Implement and verify the specified feature in line with existing codebase patterns.
INTENT: Produce a small-scope, working change and leave behind regression verification.
AUTHORITY: File reads, scoped edits, and local tests are Green. Destructive commands, prod deploy, and secret use are Red.
CCIR: Test failure, design mismatch, conflict with a user change, need for action outside authority.
ASSESSMENT: Relevant tests pass, summary of changed files, report of remaining risk.
```

Research mission:

```text
MISSION: Investigate official/academic sources on the specified military concept and translate them into principles applicable to LLMs.
INTENT: Separate claim from interpretation and link it to the source map.
AUTHORITY: Public web search and local document writing are Green. Access to paid/non-public material is Red.
CCIR: Absence of an official source, uncertain currency, conflicting materials, need to assert law/policy.
ASSESSMENT: Source rating, core principles, application rules, research gap.
```

## 15. Source Anchors

This handbook transposes the following military operating principles into LLM operations.

- Mission command: clear intent, mission orders, disciplined initiative, prudent risk.
- Operations process: plan, prepare, execute, assess loop.
- OPORD/WARNO/FRAGO/SITREP/AAR: standard documents that structure tasking and feedback.
- CCIR: prioritized reporting of only the information the commander needs to decide.
- Authorities: authority is explicitly delegated and bounded.
- Rehearsal/backbrief: verify understanding and the plan before execution.
- Knowledge management: keep the source of truth in a shared repository rather than in conversational memory.
- AAR/readiness: reflect post-execution lessons into training and authority adjustments.

Key references:

- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- Joint Staff CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- Joint Staff Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507
