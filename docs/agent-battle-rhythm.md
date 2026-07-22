# Agent Battle Rhythm

## 0. Purpose

This document translates the military's battle rhythm into an LLM single/multi-agent operating cycle.

Battle rhythm is not a concept about holding more meetings. It is a system that fixes, into a schedule and set of deliverables, the moments when the commander's judgment is needed, the moments when staff must gather information, and the moments when the execution unit must report.

In LLM operations, battle rhythm solves the following:

- An agent working for a long time drifts away from user intent.
- Research, execution, and verification proceed at different speeds.
- Important changes go unreported until the final answer.
- Documentation and post-action learning are omitted.
- Multi-agent results fail to integrate into a single direction.

Core principle:

```text
The reporting cycle is not a surveillance mechanism,
but a mechanism that secures both the preservation of intent and the speed of decision-making.
```

## 1. Battle Rhythm Components

| Element | Military Meaning | LLM Operating Meaning |
| --- | --- | --- |
| Event | A meeting, report, or update point | Agent state synchronization |
| Input | Information needed before the meeting | Files, sources, test results, risk |
| Output | Deliverable remaining after the meeting | Decision, FRAGO, revision plan |
| Owner | Presiding staff member or commander | Responsible agent |
| Frequency | Cycle | Task phase or time basis |
| Decision Link | Connection to a decision point | Approval, stop, change of direction |

## 2. Basic Cycles

### 2.1 Short Task Rhythm

Used for short, single tasks.

```text
Receive mission
-> Backbrief
-> Execute
-> Verify
-> Report
-> AAR note
```

Application examples:

- Small document edits.
- A single code bug fix.
- A short research summary.
- Writing a single template.

Required deliverables:

- Summary of task understanding.
- Changed files or research sources.
- Verification results.
- Remaining risk.

### 2.2 Standard Task Rhythm

Used for medium-scale tasks.

```text
Intent brief
-> WARNO
-> Mission analysis
-> COA / plan
-> Execution
-> SITREP
-> Verification
-> Final report
-> AAR
```

Application examples:

- Generating multiple documents.
- Implementing and testing a feature.
- Designing a framework.
- Research involving multiple sources.

### 2.3 Deep Research Rhythm

Used for long-term research.

```text
Research mission
-> PIR definition
-> Source collection
-> Source validation
-> Synthesis
-> Red Team review
-> Source map update
-> Compendium update
-> AAR
```

Application examples:

- Comprehensive investigation of military doctrine.
- Comparing academic papers.
- Collecting evidence for an AI framework.
- Organizing hallucination-prevention methodology.

### 2.4 High Risk Rhythm

Used for tasks where approval and stop criteria matter.

```text
Intent brief
-> Risk assessment
-> Authority check
-> Decision gate
-> Controlled execution
-> Frequent SITREP
-> Independent verification
-> Commander approval
-> Release
```

Application examples:

- Actual system changes.
- Use of a cost-incurring API.
- Changing security settings.
- Documents released externally.
- High-risk judgment in law, medicine, finance, etc.

### 2.5 Delegated Skill Mission Rhythm

For Codex or Claude agents operating against a repository, apply the battle rhythm through `skill-mission-controller.js`:

```text
MissionWavePlan
-> controller-generated CoS and agent routing receipts
-> ready routing and optional model preflight
-> digest-bound AgentContextPack per agent
-> manifest-backed work evidence
-> MissionWaveReport and SITREP
-> AAR, readiness update, and closeout
-> new routed wave when work remains
```

No context pack means no delegated execution. A blocked report or closeout stops continuation, and every follow-on wave repeats routing rather than inheriting the previous wave's receipt.

## 3. Battle Rhythm Events

| Event | Owner | Trigger | Input | Output |
| --- | --- | --- | --- | --- |
| Intent Brief | Commander | Task start | User request | Mission, intent, constraints |
| WARNO | Chief of Staff | Before task start | Intent, known facts | Initial warning order, expected tasks |
| Mission Analysis | S2/S3 | Before planning | Files, sources, constraints | Key questions, risks, scope |
| COA Review | S3 | Before execution | Alternatives, cost, risk | Selected approach |
| Sustainment Check | S4 | Before/during execution | Tools, time, tokens, dependencies | Bottlenecks and workarounds |
| Knowledge Sync | S6 | Before/after document changes | Document set, links | Index, storage location |
| Red Team Review | Red Team | Before key output | Draft, evidence, tests | Findings, residual risk |
| SITREP | Execution agent | During progress | Complete/incomplete/issues | Status report, CCIR |
| FRAGO | Commander/S3 | Change occurs | New requirement, blocker, risk | Change order |
| Decision Board | Commander | Approval needed | Recommendation, risk | Approve, modify, stop |
| Assessment | S3/S2 | Before completion | MOP, MOE, indicators | Success/shortfall judgment |
| AAR | Entire team | After completion | Results, delta, cause | SOP/prompt improvement |

## 4. Designing the Reporting Cycle

The reporting cycle is not determined by time alone. Use the following four criteria together.

| Criterion | Reporting Trigger |
| --- | --- |
| Time | A task lasting 30 minutes or more |
| Phase | Transition among planning, execution, verification, and completion |
| Event | Blocker, source conflict, test failure, requirement change |
| Risk | Irreversible change, security, cost, legal judgment |

For LLM tasks, the most useful reporting unit is a "meaningful state change."

Bad report:

```text
Still working on it.
```

Good report:

```text
Official doctrine sources have been secured, and training/sustainment/targeting axes are now being mapped to LLM operating functions. The next step is SOP documentation.
```

## 5. SITREP Standard Format

```text
SITREP

Mission:
Current status:
Completed:
In progress:
Blocked:
CCIR:
Risk:
Next action:
ETA / next report:
```

A SITREP does not hide unresolved problems. The core of military-style reporting is enabling the superior to make a timely decision.

## 6. Decision Board

The Decision Board is not a meeting where everything requires approval. It is a decision point that addresses the moment a subordinate agent moves outside its authority.

### Decision Board Triggers

- Change of mission or intent.
- A major conflict between sources.
- A task requiring user approval.
- Risk level high or above.
- Possibility of cost, security impact, or data deletion.
- Whether to release the deliverable.
- Introduction of a new procedure not covered by the SOP.

### Decision Memo Format

```text
Decision required:
Context:
Options:
Recommendation:
Risk:
What happens if no decision:
Required authority:
```

## 7. Connecting CCIR and Battle Rhythm

CCIR compresses the reporting cycle. It must be reported immediately rather than waiting for the scheduled cycle.

| CCIR Type | LLM Example | Action |
| --- | --- | --- |
| PIR | A key source conflicts with an existing conclusion | Stop research and report |
| FFIR | Test failure, missing file, tool failure | Revise the execution plan |
| EEFI | Discovery of secret keys, personal information, or sensitive material | Stop exposure and protect |
| Decision Point | A change is needed without approval | Decision Board |

## 8. Attendance by Agent per Event

| Event | Commander | CoS | S2 | S3 | S4 | S6 | Red Team |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Intent Brief | A | R | C | C | C | C | I |
| WARNO | A | R | C | C | C | C | I |
| Mission Analysis | C | A | R | R | C | C | I |
| COA Review | A | R | C | R | C | C | C |
| Execution | I | A | C | R | C | C | I |
| SITREP | A | R | C | R | C | C | I |
| Red Team Review | I | C | C | C | I | C | R |
| Assessment | A | R | R | R | C | C | C |
| AAR | A | R | R | R | R | R | R |

Legend:

- R: Responsible.
- A: Accountable.
- C: Consulted.
- I: Informed.

## 9. Lightweight Battle Rhythm for a Single Agent

Even when using only a single agent, maintain the following rhythm.

```text
1. Restate the understood mission in one sentence.
2. Check related files/sources before making changes.
3. Report the scope of execution.
4. Do the work.
5. Verify.
6. Report changes and remaining risk.
7. Reflect repeatable lessons in the SOP.
```

In a single-agent setup, roles are not actually divided; instead, one agent shifts perspective in sequence.

```text
S2 perspective: Is the evidence correct?
S3 perspective: Is the execution order correct?
S4 perspective: Are resources sufficient?
S6 perspective: Are documents and records preserved?
Red Team perspective: Where could this go wrong?
```

## 10. Anti-Patterns

| Anti-pattern | Problem | Correction |
| --- | --- | --- |
| Meeting-style over-reporting | More synchronization than execution | Keep only decision-linked events |
| Single batch report at the end | Mid-course drift discovered too late | Immediate CCIR reporting |
| Parallelization without roles | Failure to integrate results | CoS or S3 owns integration |
| Sources attached after the fact | Claims are made first, then evidence is inserted | S2 writes the source map first |
| Skipping verification | A deliverable exists but its effect is unknown | Separate MOP/MOE |
| Missing AAR | The same failure repeats | Include SOP update in the completion criteria |

## 11. Recommended Rhythm by Task Size

| Task Size | Recommended Rhythm | Minimum Reporting |
| --- | --- | --- |
| Under 5 minutes | Short Task | Completion report |
| Under 30 minutes | Short Task + verification | Start, completion |
| Under 2 hours | Standard Task | Plan, midpoint, completion |
| Long-term research | Deep Research | Per source batch |
| High-risk task | High Risk | At every decision gate |

## 12. Related Documents

- `sop-library.md`
- `agent-roles-and-authority.md`
- `decision-risk-assessment.md`
- `prompt-templates.md`
- `military-operating-system.md`
- `research-compendium.md`
