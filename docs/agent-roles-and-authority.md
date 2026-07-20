# Agent Roles and Authority

## 0. Purpose

This document defines, for each position in a military-style command-and-control model applied to LLM agent operations, the scope of approval authority, reporting scope, area of autonomous judgment, and post-action management responsibility.

Core principle:

```text
Authority is determined not by rank, but by mission, risk, reversibility, certainty of information, and alignment with higher intent.
```

Multinational application notes:

- `COMMANDER`, `COS`, `S2`, `S3`, `S4`, `S6` are internal functional IDs of this framework.
- They are not assumed to map 1:1 onto the actual ranks, staff titles, or unit organization of any real military.
- When applying this framework to a non-U.S.-military organization, first build the role alias map in `docs/multinational-doctrine-consistency-review.md`.
- Aliases change names only; they must not lower commander-retained authority such as release, risk, scope, or legal authority.

## 1. Authority Determination Criteria

Whether an agent may take a given action is judged against the following criteria.

| Criterion | Question | Meaning |
|---|---|---|
| Mission Fit | Does it align with higher intent? | Halt if misaligned with intent |
| Scope | Is it within the original mission scope? | Approval required if scope expands |
| Reversibility | Can it be undone? | Approval required for irreversible actions |
| Risk | Is there cost, security, or legal risk? | Report if risk increases |
| Evidence | Is the evidence sufficient? | Do not finalize if evidence is insufficient |
| Timing | Must the decision be made immediately? | Report as CCIR if delay risk is high |
| Blast Radius | Is the scope of failure impact small? | Escalate for approval if impact is large |

## 2. Approval Tiers

| Tier | Name | Description | Default Approver |
|---|---|---|---|
| L0 | Observation | Reading, summarizing, analysis, drafting | Agent autonomous |
| L1 | Reversible Action | Local changes, temporary artifacts, tests | Agent autonomous |
| L2 | Restricted Execution | In-scope file edits, document authoring, code patches | Chief of Staff or orchestrator |
| L3 | External Impact | Network calls, cost incurrence, external system changes | Commander |
| L4 | Irreversible Action | Deletion, deployment, payment, public publication | Explicit Commander approval |
| L5 | High-Risk Decision | Major decisions involving legal, medical, financial, security, or personnel matters | Commander and subject-matter experts |

## 3. Roles by Position

### 3.1 Commander

Military counterpart: commanding officer.

LLM counterpart: the user or final decision-maker.

Responsibilities:

- Set the final objective.
- Define success conditions.
- Set red lines (prohibited actions).
- Set the risk tolerance threshold.
- Grant final approval.

Approval scope:

- All L3-and-above actions.
- Changes to objectives.
- Public publication.
- Cost incurrence.
- Irreversible changes.
- Major legal or security-related decisions.

Must be reported:

- All CCIR.
- Impossibility of achieving the objective.
- Collapse of a key assumption.
- Major conflicts in information.
- Cases where an agent must act outside its authority.

Actions to take after autonomous judgment:

- Not applicable. The Commander holds final intent and approval authority.

Post-action management:

- Approve the AAR.
- Approve SOP changes.
- Revise the purpose and criteria for the next operation.

### 3.2 Chief of Staff

Military counterpart: chief of staff.

LLM counterpart: orchestrator, project manager, main agent.

Responsibilities:

- Decompose Commander intent into executable tasks.
- Assign agents.
- Resolve conflicts between tasks.
- Manage reporting flow.
- Integrate final deliverables.

Approval scope:

- Approval of L0-L2 actions.
- Changes to subordinate agent assignments.
- Changes to document structure.
- Adjustments to execution order within scope.

Reporting scope:

- Overall progress status.
- Conflicts between agents.
- Schedule delays.
- Whether a CCIR has occurred.
- List of actions requiring approval.

Actions permitted after autonomous judgment:

- Change task order.
- Reassign subordinate roles.
- Change the format of intermediate deliverables.
- Request additional verification.

Approval required:

- Changes to objectives.
- Reduction or expansion of user requirements.
- External system changes.
- Cost incurrence.
- Deletion or deployment.

Post-action management:

- Write the overall AAR.
- Organize the decision log.
- Classify failure causes.
- Draft SOP updates.

### 3.3 S2 Intelligence Agent

Military counterpart: intelligence staff officer.

LLM counterpart: research, source-verification, and fact-checking agent.

Responsibilities:

- Gather materials.
- Assess source reliability.
- Identify information gaps.
- Reconcile conflicting information.
- Warn of potential hallucination.

Approval scope:

- L0 research and summarization.
- In-scope searches of public materials.
- Building an evidence map.

Reporting scope:

- Source conflicts.
- Insufficient evidence.
- Recency/currency issues.
- High uncertainty.
- Changes to key assumptions.

Actions permitted after autonomous judgment:

- Change search queries.
- Explore additional sources.
- Grade information reliability.
- Separate fact from inference.

Approval required:

- Access to paid materials.
- Handling sensitive information.
- Treating information of unknown provenance as established fact.
- Finalizing high-risk knowledge such as legal, medical, or financial matters.

Post-action management:

- Produce the Evidence Map.
- Record reliability per source.
- Write a correction log if incorrect information is found.

### 3.4 S3 Operations Agent

Military counterpart: operations staff officer.

LLM counterpart: agent for designing execution plans, procedures, schedules, and priorities.

Responsibilities:

- Draft the execution plan.
- Design task steps.
- Define decision points.
- Structure rehearsal procedures.
- Incorporate FRAGO updates.

Approval scope:

- L0-L2 planning and local execution.
- In-scope priority changes.
- Reordering of task units.

Reporting scope:

- Divergence between the plan and actual execution.
- Bottlenecks.
- Steps with a high probability of failure.
- Decision points requiring approval.

Actions permitted after autonomous judgment:

- Change execution order.
- Add test or verification steps.
- Insert risk-mitigation procedures.
- Make small-scope plan revisions.

Approval required:

- Changes to mission scope.
- Fundamental changes to the format of the final deliverable.
- Changes to a schedule already promised to the user.
- External deployment.

Post-action management:

- Write the execution log.
- Compare planned versus actual results.
- Propose improvements for the next task.

### 3.5 S4 Sustainment Agent

Military counterpart: logistics/sustainment staff officer.

LLM counterpart: agent managing resources, cost, tools, and feasibility.

Responsibilities:

- Confirm available tools.
- Manage tokens, time, and cost.
- Verify APIs, files, and dependencies.
- Propose alternative paths.

Approval scope:

- Local resource checks.
- Execution of cost-free tools.
- Proposing alternative execution options.

Reporting scope:

- Resource shortages.
- Tool failures.
- Potential cost incurrence.
- Missing dependencies.
- Unsustainable plans.

Actions permitted after autonomous judgment:

- Use cost-free alternative tools.
- Add local verification procedures.
- Split a task into smaller units.

Approval required:

- Use of paid APIs.
- Subscription to or authentication with external services.
- Long-running execution.
- Large file generation or bulk processing.

Post-action management:

- Record resource usage.
- Log failed tools and their alternatives.
- Update resource baselines for the next task.

### 3.6 S6 Signal Agent

Military counterpart: signal/communications staff officer.

LLM counterpart: agent managing reporting channels, status sharing, logs, and document links.

Responsibilities:

- Manage reporting formats.
- Maintain the status board.
- Preserve the decision log.
- Manage document versions and links.
- Propagate change orders.

Approval scope:

- Organizing document links.
- Updating status-report templates.
- Improving log structure.

Reporting scope:

- Missing reports.
- Document version conflicts.
- Unreflected changes.
- Communication channel failures.

Actions permitted after autonomous judgment:

- Improve the status-report format.
- Organize the change history.
- Clean up reference links.

Approval required:

- Posting to public channels.
- Creating external sharing links.
- Sharing documents containing sensitive information.

Post-action management:

- Preserve the change log.
- Analyze missing reports.
- Improve the reporting cadence for the next operation.

### 3.7 Red Team Agent

Military counterpart: red team, independent review body.

LLM counterpart: agent reviewing counterexamples, errors, hallucinations, and security vulnerabilities.

Responsibilities:

- Attack the plan's assumptions.
- Detect logical errors.
- Detect unsubstantiated claims.
- Present failure scenarios.
- Warn against overconfidence.

Approval scope:

- Recommending execution halts.
- Requesting additional verification.
- Proposing risk ratings.

Reporting scope:

- Critical errors.
- Key claims lacking sources.
- Misalignment between objective and execution.
- Risks that must not proceed without approval.

Actions permitted after autonomous judgment:

- Draft counterexamples.
- Generate verification questions.
- Compile a risk list.
- Propose alternatives.

Approval required:

- Changing final decisions.
- Discarding deliverables.
- Changing user requirements.

Post-action management:

- Record discovered errors.
- Write a recurrence-prevention checklist.
- Improve verification prompts.

### 3.8 Executor Agent

Military counterpart: executing unit.

LLM counterpart: agent performing code writing, document authoring, and analysis.

Responsibilities:

- Perform assigned tasks.
- Produce intermediate deliverables.
- Perform tests or verification.
- Report obstacles.

Approval scope:

- Assigned tasks within L0-L2.
- Local file creation or modification.
- Running tests.

Reporting scope:

- Completion.
- Failure.
- Results that diverge from expectations.
- Need to act outside authority.

Actions permitted after autonomous judgment:

- Choose implementation details.
- Fix minor errors.
- Add tests.
- Improve document wording.

Approval required:

- Large-scale structural changes.
- Deletion.
- External application of changes.
- Changes to user intent.

Post-action management:

- Explain the change history.
- Record test results.
- Report remaining risks.

### 3.9 Recorder Agent

Military counterpart: recorder, lessons-learned officer.

LLM counterpart: agent managing logs, decision history, and the AAR.

Responsibilities:

- Preserve the original text of orders.
- Record FRAGOs.
- Record the approval history.
- Record the rationale behind decisions.
- Write the AAR.

Approval scope:

- Writing logs.
- Organizing documents.
- Drafting the retrospective.

Reporting scope:

- Discovery of unapproved changes.
- Missing decision rationale.
- Missing sources.
- Tasks that cannot be traced after the fact.

Actions permitted after autonomous judgment:

- Improve the record format.
- Ask about missing items.
- Organize AAR entries.

Approval required:

- Deleting records.
- Sharing sensitive records externally.
- Changing official SOPs.

Post-action management:

- Archive the AAR.
- Link improvement proposals to the SOP.
- Track recurring error patterns.

## 4. Reporting Triggers

### 4.1 Immediate Reporting

The following must be reported immediately to the Commander or Chief of Staff.

- Objective is unachievable.
- Conflict in core evidence.
- Occurrence of security, legal, or cost risk.
- An irreversible action is required.
- An external system change is required.
- Misalignment between user intent and the execution plan.
- A decision outside authority is required.

### 4.2 Periodic Reporting

Periodic reporting is only needed when a task unit runs long.

```text
SITREP

1. Current status:
2. Work completed:
3. Work in progress:
4. Obstacles:
5. Next actions:
6. Approval required (yes/no):
```

### 4.3 Completion Reporting

```text
COMPLETION REPORT

1. Completed deliverables:
2. Files or results changed:
3. Verification method:
4. Verification results:
5. Remaining risks:
6. Follow-up actions:
```

## 5. Handling Authority Violations

If an agent has acted, or must act, outside its authority, follow this procedure:

1. Halt immediately.
2. Preserve the current state.
3. Identify which authority criterion was exceeded.
4. Report to the Commander or Chief of Staff.
5. Receive one of: approval, correction, or cancellation.
6. Record recurrence-prevention measures in the AAR.

## 6. Minimum Operating Rules

The minimum rule set to put directly into a real system is as follows.

```text
1. Confirm the purpose and success conditions first.
2. Separate out items that must not be altered.
3. Assign an authority tier to each agent.
4. Define CCIR first.
5. Use `DocumentAccessManifest` to ensure agents read only the documents appropriate to their role, duty, and authority.
6. Perform a Backbrief before execution.
7. Do not execute risky actions before approval.
8. Leave an AAR after completion.
```
