# LLM Agent Org Chart

## 0. Purpose

This document defines the agent org chart, command relationships, reporting lines, and approval lines for military-style LLM operations.

The problem with multi-agent systems is not a shortage of agents. The problem is that it is unclear who preserves the purpose, who makes decisions, who produces evidence, who reviews, and who performs the final integration.

Core principle:

```text
The agent org chart is not an imitation of a human organization,
but a structure for clarifying authority, responsibility, reporting, and integration.
```

## 1. Basic Org Chart

```text
User / Human Commander
        |
        v
AI Commander / Orchestrator
        |
        v
Chief of Staff / Integrator
        |
        +-- S2 Intelligence Agent
        +-- S3 Operations Agent
        +-- S4 Sustainment Agent
        +-- S6 Knowledge / Signal Agent
        +-- Red Team Agent
        +-- Evaluator / Assessment Agent
```

## 2. Command Relationships

| Relationship | Meaning | LLM Application |
| --- | --- | --- |
| Command | Final intent and approval authority | User or AI Commander |
| Control | Adjusting execution scope and priorities | Chief of Staff |
| Support | Supporting the mission through a specific function | S2, S4, S6, Red Team |
| Coordinating | Coordination between peer functions | S2-S3, S3-S6 |
| Review | Independent review | Red Team, Evaluator |

## 3. Responsibilities by Role

### User / Human Commander

Responsibilities:

- Present the final purpose.
- Approve high-risk actions.
- Accept risk.
- Approve the final output.

Does not do:

- Directly direct every detail of execution.
- Directly perform source verification.
- Perform all coordination among subordinate agents.

### AI Commander / Orchestrator

Responsibilities:

- Translate the user's request into mission and intent.
- Apply authority and ROE.
- Issue task orders.
- Request user approval at decision gates.

Authority:

- Direct low-risk tasks.
- Task subordinate agents.
- Integrate SITREPs.

Limitations:

- No risk-acceptance authority.
- Cannot approve external release, cost-incurring actions, or data deletion.

### Chief of Staff / Integrator

Responsibilities:

- Synchronize subordinate agents' work.
- Operate the battle rhythm.
- Eliminate duplicate work.
- Integrate the final output.

Key deliverables:

- Task board.
- SITREP summary.
- Integration memo.
- Final synthesis.

### S2 Intelligence Agent

Responsibilities:

- Research.
- Assess source reliability.
- Flag uncertainty.
- Manage PIR.
- Update the source map.

Prohibited:

- Asserting conclusions without evidence.
- Writing policy/legal/military practice judgments as if they were final decisions.

### S3 Operations Agent

Responsibilities:

- Draft the execution plan.
- Sequence tasks.
- Execute prompts/documents/code.
- Incorporate FRAGOs.

Key deliverables:

- Execution plan.
- Maneuver plan.
- Task order.
- Implementation output.

### S4 Sustainment Agent

Responsibilities:

- Check tokens, time, tools, dependencies, APIs, and test environments.
- Design checkpoints for long-running tasks.
- Identify bottlenecks and alternative paths.

Key deliverables:

- Sustainment estimate.
- Dependency report.
- Fallback plan.

### S6 Knowledge / Signal Agent

Responsibilities:

- Manage document locations and links.
- Maintain the decision log, AAR, and source map.
- Produce context packets.
- Standardize the information format across agents.

Key deliverables:

- README update.
- Knowledge base.
- Context brief.
- Glossary update.

### Red Team Agent

Responsibilities:

- Detect hallucination, exaggeration, insufficient sourcing, security risk, and authority violations.
- Produce independent findings.

Prohibited:

- Directly integrating the final output.
- Redefining the commander's intent.
- Finalizing its own proposed corrections as the answer without review.

### Evaluator / Assessment Agent

Responsibilities:

- Assess MOP/MOE.
- Produce readiness ratings.
- Record experiment results.
- Provide input to the AAR.

Key deliverables:

- Evaluation sheet.
- Metrics report.
- Readiness update.

## 4. RACI Matrix

| Activity | User | Commander | CoS | S2 | S3 | S4 | S6 | Red Team | Evaluator |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Define mission | A | R | C | I | I | I | I | I | I |
| Draft OPORD | C | A/R | C | C | C | C | C | I | I |
| Investigate sources | I | C | C | A/R | I | I | C | C | I |
| Execution plan | I | A | C | C | R | C | C | C | I |
| Tool use | I | A | C | I | R | C | C | I | I |
| Determine approval need | A | R | C | C | C | C | C | C | I |
| Document integration | I | A | R | C | C | C | C | C | I |
| Red Team review | I | C | C | C | C | I | C | R | C |
| Evaluation | I | A | C | C | C | C | C | C | R |
| AAR | A | R | R | C | C | C | C | C | C |

Legend:

- R: Responsible.
- A: Accountable.
- C: Consulted.
- I: Informed.

## 5. Reporting Lines

```text
S2/S3/S4/S6/Red Team/Evaluator
-> Chief of Staff
-> AI Commander
-> User / Human Commander
```

When a CCIR occurs:

```text
Any Agent
-> AI Commander
-> User if approval/risk decision required
```

Red Team critical finding:

```text
Red Team
-> AI Commander and Chief of Staff simultaneously
-> User if high risk
```

## 6. Commander's Critical Information Requirements

Information every agent must report immediately:

- Mismatch between mission and intent.
- Failure to confirm an official source.
- A critical conflict between sources.
- Test failure.
- Insufficient tool authority.
- Discovery of sensitive information.
- Possibility of incurring cost.
- Possibility of data deletion/modification.
- Conflict with an existing user change.
- Need for an additional decision from the user.

## 7. Variants by Organization Size

### 7.1 Single-Agent Mode

A single agent performs all roles in sequence.

```text
Commander view
-> S2 view
-> S3 view
-> S4 view
-> S6 view
-> Red Team view
-> Evaluator view
```

Application:

- Short document work.
- Editing a single file.
- Small-scale research.

### 7.2 Small Staff Mode

```text
Commander
-> Research/Intelligence
-> Operations/Writer
-> Reviewer
```

Application:

- Medium-scale documentation.
- Simple code implementation.
- Source-based answers.

### 7.3 Full Staff Mode

Uses the entire basic org chart.

Application:

- Long-term research.
- Multi-agent implementation.
- High-risk automation.
- Externally published output.

## 8. Org Chart Design Anti-Patterns

| Anti-pattern | Problem | Correction |
| --- | --- | --- |
| Every agent is a Commander | Conflicting intent | A single integrating authority |
| Red Team is the final author | Independence is compromised | Produce findings only |
| S2 decides conclusions | Confusion between intelligence and command | S2 owns evidence and uncertainty |
| S3 ignores sources | Execution proceeds but hallucination increases | Evidence gate |
| No S6 | Loss of documentation and memory | Designate a knowledge owner |
| Every judgment is referred to the User | Approval bottleneck | Risk-based delegation |

## 9. Criteria for Standing Up/Standing Down Agents

Create a new agent when:

- The same type of task has recurred 3 or more times.
- A specific specialized function is a persistent bottleneck.
- Independent review is needed.
- Separation is needed for authority/security reasons.

Disband or merge an agent when:

- The role's deliverables are duplicated.
- The coordination cost exceeds the quality of the output.
- Task volume is low.
- Responsibility and authority are unclear.

## 10. Related Documents

- `agent-roles-and-authority.md`
- `agent-battle-rhythm.md`
- `implementation-guide.md`
- `tool-use-roe.md`
- `evaluation-metrics.md`
