# SOP Library

## 0. Purpose

This document is a library that translates military-style standard operating procedures (SOPs) into LLM operating procedures.

The purpose of an SOP is not to mechanically bind agents together. It standardizes the parts of repeatable work that do not need fresh judgment every time, and it is a mechanism for escalating only the parts that require judgment to the commander or a higher-level agent.

In LLM operations, SOPs reduce the following problems:

- Loss of user intent.
- Arbitrary interpretation by subordinate agents.
- Unsourced claims.
- Unverified deliverables.
- Unauthorized propagation of changes.
- Failure to learn from repeated failures.

Core principle:

```text
An SOP is not a document that removes an agent's freedom,
but a document that makes clear the boundary within which autonomous judgment is possible.
```

## 1. SOP Standard Format

Every SOP has the following items.

| Item | Description | LLM Application |
| --- | --- | --- |
| Purpose | What this procedure is meant to prevent or achieve | The success condition of the task |
| Scope | When to use this procedure | Trigger condition |
| Roles | Who is responsible for what | Commander, S2, S3, S4, Red Team, etc. |
| Inputs | Information needed before starting | User request, files, sources, constraints |
| Procedure | Order of execution | Prompt chain or agent workflow |
| Deliverables | Results that must be left behind | Documents, code, verification logs, risk list |
| Approval criteria | When higher-level approval is needed | Human approval or higher-level agent approval |
| Reporting criteria | When to report | CCIR, PIR, FFIR, EEFI |
| Verification criteria | How completion is judged | Tests, evidence checks, review |
| Records | Post-action materials | AAR, decision log, source map |

## 2. SOP Writing Rules

A good SOP must be short and executable.

Bad SOP:

```text
Research the material sufficiently and write a high-quality answer.
```

Good SOP:

```text
1. Decompose the user's request into mission, intent, and constraints.
2. Verify sources for facts that are uncertain or require currency.
3. Record the claim, limitation, and LLM application point for each source.
4. Leave source links and applied interpretation in the deliverable.
5. Add unresolved questions to the PIR list.
```

An SOP avoids the following expressions:

- Sufficiently.
- Appropriately.
- Well.
- If necessary.
- Depending on the situation.

Instead, write like this:

- Verify at least 3 primary sources.
- Verify every changed file with `rg --files` and `wc -l`.
- Mark unsourced claims as a "hypothesis."
- If risk is high or above, convert to an approval request.

## 3. SOP-01 Research / Intelligence Collection

### Purpose

Have the research agent collect evidence-based material without hallucination, and translate that material into the LLM operating framework.

### Scope

- When researching military doctrine, organizational operations, document systems, or AI operating methods.
- When the user requests "deep research," "papers," "documents," or "all materials."
- When currency or source accuracy is important.

### Roles

| Role | Responsibility |
| --- | --- |
| Commander | Decides research purpose, scope, and priority |
| S2 Intelligence | Collects sources, assesses reliability, flags uncertainty |
| S3 Operations | Converts material into an executable framework |
| S5 Plans | Connects long-term frameworks and concepts |
| Red Team | Reviews exaggeration, leaps of logic, and source errors |

### Inputs

- User objective.
- Current document set.
- Search keywords.
- List of sources already secured.
- PIR that must be answered.

### Procedure

1. Rewrite the user request as a research mission.
2. Divide the questions into PIR, FFIR, and EEFI.
3. Search primary sources first.
4. Assign reliability in the order of official government/military doctrine, academic papers, handbooks, and field reports.
5. For each source, record the key concept, original context, and LLM application point separately.
6. Do not merge conflicting content into one; preserve the differences.
7. Mark claims that have not yet been confirmed as assumptions.
8. Reflect the deliverable in `research-compendium.md` or `source-map.md`.

### Approval criteria

Commander approval or user confirmation is required in the following cases:

- When attempting to use non-public material.
- When moving into actual applied advice for law, security, or military operations.
- When there is a conflict between sources and one must be adopted as the standard.
- When changing core framework terminology.

### Deliverables

- Source list.
- Key content per source.
- LLM application interpretation.
- Remaining research questions.
- Source map update.

## 4. SOP-02 Document Production

### Purpose

Accumulate research and judgment into a reusable document system rather than letting them dissipate into a one-off answer.

### Scope

- Writing framework documents.
- Writing templates.
- Writing policies, SOPs, and authority matrices.
- Updating existing documents.

### Roles

| Role | Responsibility |
| --- | --- |
| Commander | Decides the document's purpose and audience |
| S3 Operations | Structural design and proceduralizing execution |
| S2 Intelligence | Connects evidence |
| S6 Knowledge | Manages document location, links, and indexing |
| Red Team | Checks for empty claims, duplication, and terminology confusion |

### Procedure

1. Decide whether a new document is needed or whether to add to an existing one.
2. Write the document's purpose within the first 10 lines.
3. Arrange sections in an order the reader can execute immediately.
4. Separate conceptual explanation from actual templates.
5. Leave related documents and next tasks at the end of the document.
6. Add a link to the README or a higher-level document.
7. Verify with `rg` that the new document is picked up by the index.

### Deliverable criteria

A document must satisfy the following conditions:

- Its purpose can be understood from the filename alone.
- Its purpose can be understood from the first section.
- It has at least one of: a table, a checklist, or a procedure.
- It can be navigated to related documents.
- The next worker can continue without additional context.

## 5. SOP-03 OPORD Prompt Generation

### Purpose

Convert a user request into an OPORD-style military-order prompt so that subordinate agents can execute it without distortion.

### Scope

- Complex LLM tasks.
- Tasks involving multiple agents.
- Tasks where output quality and verification matter.
- Tasks where user intent is long or ambiguous.

### Procedure

1. Extract the mission from the user request in one sentence.
2. Divide the commander's intent into purpose, key success conditions, and failure-to-avoid conditions.
3. Write the current state, files, constraints, and known risks in the situation.
4. Write step-by-step tasks in the execution.
5. Write prohibitions, reporting criteria, and verification criteria in the coordinating instructions.
6. Write available tools, time, tokens, and sources in the sustainment.
7. Write reporting format, approval authority, and stop conditions in the command and signal.
8. Require a backbrief.

### Minimum Prompt Skeleton

```text
Mission:
Intent:
Situation:
Execution:
Constraints:
Authority:
CCIR:
Verification:
Deliverable:
Backbrief:
```

### Approval criteria

In the following cases, do not execute the OPORD immediately; obtain a backbrief first.

- The mission purpose can be interpreted in two or more ways.
- The deliverable format is not clear.
- There is a possibility of external system changes, incurred cost, or data deletion.
- It includes judgment involving law, finance, medicine, security, or real-world operational impact.

## 6. SOP-04 Multi-Agent Tasking

### Purpose

Maintain unity of command and unity of effort when multiple LLM agents work simultaneously.

### Scope

- When parallelizing research, implementation, verification, and documentation.
- Tasks that require different specialized roles.
- When one agent's judgment must be reviewed by another agent.

### Role Structure

| Agent | Military Equivalent | Responsibility |
| --- | --- | --- |
| Commander | Commander | Purpose, priority, approval |
| Chief of Staff | Chief of Staff | Integrates workflow |
| S2 | Intelligence | Research, sources, uncertainty |
| S3 | Operations | Execution plan, task decomposition |
| S4 | Sustainment | Tools, tokens, time, dependencies |
| S6 | Signal/Knowledge | Documents, storage, context management |
| Red Team | Independent Review | Errors, risk, counterexamples |

### Procedure

1. The Commander issues the mission and intent.
2. The Chief of Staff decomposes the work by role.
3. Each agent backbriefs its own assignment.
4. S2 provides evidence and uncertainty first.
5. S3 writes the execution plan and sequencing.
6. S4 reports resource constraints and bottlenecks.
7. If a CCIR occurs during execution, escalate it immediately to higher-level judgment.
8. Red Team performs an independent review before final output.
9. The Chief of Staff integrates the results into a single deliverable.

### Prohibitions

- Subordinate agents do not redefine the mission.
- The research agent does not make execution decisions on its own.
- Red Team does not become a direct editor.
- Agents do not each create their own terminology system.
- Source uncertainty is not written as if it were an agreed fact.

## 7. SOP-05 Code / Artifact Implementation

### Purpose

Control the scope and verification of changes when an LLM modifies code, documents, designs, or data files.

### Scope

- Local file editing.
- Code implementation.
- Document generation.
- Test execution.
- Build or deployment preparation.

### Procedure

1. Check the current file structure.
2. Read related files and identify existing patterns.
3. Briefly report intent and scope before making changes.
4. Modify only the necessary files.
5. After modification, perform the needed verification among search, formatting, tests, and rendering.
6. Do not hide failed verifications; record the cause and remaining risk.
7. Report only a result summary and next steps to the user.

### Approval criteria

The following changes require approval before execution.

- Data deletion.
- Incurring cost via an external service.
- Changing security settings.
- Public deployment.
- Large-scale refactoring.
- Reverting the user's own changes.

## 8. SOP-06 Red Team Review

### Purpose

Review whether the deliverable achieves its purpose, whether the evidence is sufficient, and whether any risk is hidden.

### Scope

- Core framework documents.
- Policy-type documents.
- Documents shared externally.
- High-risk automation.
- Evidence-based answers.

### Review Questions

1. Is the mission and intent preserved in the deliverable?
2. Are sources directly linked to the claims?
3. Is there exaggerated generalization?
4. Are verifiable claims distinguished from interpretation?
5. Is there anything that should not be executed without approval?
6. Is there terminology that a subordinate agent could misunderstand?
7. Is the stop condition on failure clear?
8. Is there a record that can be traced back via AAR?

### Deliverables

- Findings.
- Severity.
- File/section reference.
- Recommended action.
- Residual risk.

## 9. SOP-07 Source and Evidence Management

### Purpose

Prevent sources from becoming scattered, and make document claims verifiable later.

### Procedure

1. Record every source at least once in `research-compendium.md`.
2. Connect key sources to military concepts and LLM application points in `source-map.md`.
3. Minimize direct quotation of original text; summarize instead.
4. Mark uncertain URLs as "needs verification."
5. If the same source is used across multiple documents, treat the source map as the reference point.
6. For documents where currency matters, leave a verification date.

### Source Reliability Grades

| Grade | Type | Usage |
| --- | --- | --- |
| A | Official doctrine, government/military documents, standards | Core evidence |
| B | Academic papers, official research institute reports | Supplementary evidence |
| C | Field articles, training materials, handbooks | Practical application examples |
| D | Blogs, unofficial summaries, secondary citations | Hypothesis or reference |

## 10. SOP-08 FRAGO Change Management

### Purpose

When an order change occurs mid-task, update only the necessary parts without collapsing the entire plan.

### Scope

- The user changes requirements mid-task.
- A new risk is discovered.
- A source conflicts with an existing conclusion.
- Scope of work is added or reduced.
- Time or resource constraints change.

### Procedure

1. Identify which parts of the existing mission and intent are preserved.
2. Divide the changed items into situation, mission, execution, and coordinating instructions.
3. Identify affected documents, code, and agents.
4. Re-prioritize after the change.
5. Record the change in FRAGO format.
6. Obtain a new backbrief if necessary.

### FRAGO Minimum Format

```text
Change:
Reason:
Affected tasks:
Unaffected intent:
New constraints:
Required confirmation:
```

## 11. SOP-09 AAR and Learning Loop

### Purpose

After a task ends, record the causes of success/failure and reflect them in SOPs, prompts, and the authority matrix.

### Scope

- After task completion.
- After a failure or rework occurs.
- After receiving user feedback.
- When a newly repeatable procedure is discovered.

### AAR Questions

1. What was the intended outcome?
2. What was the actual outcome?
3. Why did the difference occur?
4. Which procedures should be kept?
5. Which procedures should be changed?
6. What rules should be reflected in the next SOP or prompt?

### Deliverables

- AAR note.
- SOP update.
- Prompt template update.
- Risk register update.
- Source map update.

## 12. SOP-10 Release / Publication Gate

### Purpose

Inspect documents and frameworks before external sharing or long-term use.

### Checklist

- Is there a link in the README?
- Is the document's purpose stated in the first section?
- Does each core claim have evidence?
- Can the template be copied and used immediately?
- Are approval authority and reporting lines unambiguous?
- Are hallucination-prevention procedures specified?
- Is there a place where AAR feedback is reflected?
- Is remaining risk recorded?

## 13. Training Stages

Applying the military's training management to LLMs, mastery of an SOP is divided into three stages.

| Stage | Military Expression | LLM Operation |
| --- | --- | --- |
| Crawl | Stage of following the procedure | Agent performs based on a checklist |
| Walk | Performance under supervision | Some autonomous judgment allowed, backbrief required |
| Run | Mission-type performance | Given only intent and CCIR, executes autonomously |

The important point is not to grant autonomy from the start. As a record accumulates showing that the agent performs the SOP reliably, authority is broadened.

## 14. Related Documents

- `military-llm-framework-v0.1.md`
- `military-operating-system.md`
- `agent-roles-and-authority.md`
- `agent-battle-rhythm.md`
- `decision-risk-assessment.md`
- `prompt-templates.md`
- `source-map.md`
- `research-compendium.md`
