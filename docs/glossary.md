# Glossary

## 0. Purpose

This document standardizes the core terminology used in the military-style LLM framework.

When terminology drifts, order dissemination drifts with it. This is exactly why the military places such weight on standardized terms. This framework does not treat military terminology as sacred in itself; instead, it translates each term into the concept that performs the equivalent function in LLM operations.

In multinational application, this glossary is not used as a literal rank/position table. Names such as `COMMANDER`, `S2`, `S3`, `S4`, and `S6` are internal functional IDs; when applying the framework to an actual organization, use the role alias map in `docs/multinational-doctrine-consistency-review.md` to connect them to local terminology.

## 1. Term Table

| Term | Military Meaning | LLM Framework Meaning |
| --- | --- | --- |
| Mission | A clearly defined task the unit must carry out | The outcome the agent must achieve |
| Commander's Intent | The purpose of the mission, its key effects, and the desired end state | What the user actually wants, plus the conditions that must be avoided to prevent failure |
| OPORD | Operations order | A structured prompt for complex LLM tasks |
| WARNO | Warning order | An instruction to begin preparatory work before the detailed plan is ready |
| FRAGO | Fragmentary order / change order | A change to requirements or a revision to the plan mid-task |
| SITREP | Situation report | A report on progress, blockers, and risk |
| AAR | After-action review | Analyzing the gap between outcome and intent and feeding it back into the SOP |
| Backbrief | A subordinate explaining their understanding of the mission back to a superior | The agent restating its understanding before execution |
| Confirmation Brief | A briefing confirming receipt of an order | The agent confirming instructions and constraints |
| Rehearsal | A dry run before execution | Pre-checking the plan, tools, and verification path |
| Mission Command | Mission-type command | Providing only intent and authority boundaries while delegating the method |
| Command and Control | Command and control | The system of user intent, authority, reporting, and approval |
| Unity of Command | Unified command | The final decision-maker and integrator are one and the same, clearly |
| Unity of Effort | Unified effort | Multiple agents moving toward the same objective |
| Staff | Staff officer | A function-specific specialist agent |
| S2 | Intelligence staff officer | Responsible for research, sourcing, and uncertainty |
| S3 | Operations staff officer | Responsible for execution planning, sequencing, and task integration |
| S4 | Logistics/sustainment staff officer | Responsible for tokens, tools, time, APIs, and dependencies |
| S6 | Signal/knowledge-management staff officer | Responsible for documents, context, storage, and information flow |
| Red Team | Independent review body | An agent that reviews for errors, hallucination, risk, and counterexamples |
| CCIR | Commander's Critical Information Requirement | The criteria for information that must be reported immediately |
| PIR | Priority Intelligence Requirement | External/situational information needed for a decision |
| FFIR | Friendly Force Information Requirement | Information on internal state, resources, blockers, and test results |
| EEFI | Essential Elements of Friendly Information | Sensitive information that must not be exposed |
| MDMP | Military Decision-Making Process | Mission analysis and COA selection for complex tasks |
| COA | Course of Action | A possible approach or execution alternative |
| Running Estimate | A continuously updated staff assessment | A live note on risk, sourcing, status, and dependencies |
| Battle Rhythm | The meeting/report/decision cycle | The cadence of agent synchronization and decision gates |
| SOP | Standard Operating Procedure | A standard prompt/procedure for repeated tasks |
| METL | Mission-Essential Task List | The core tasks an agent must be able to perform |
| Readiness | Fitness to carry out the mission | The level at which an agent/SOP is deployable to actual work |
| Crawl-Walk-Run | Phased training | Checklist -> supervised autonomy -> mission-type autonomy |
| Sustainment | Sustainment | Support for tokens, time, tools, context, files, and APIs |
| Protection | Protection | Security, sensitive information, approval, rollback, guardrails |
| Targeting | Targeting | The process of deciding which effect to produce against which target |
| D3A | Decide, Detect, Deliver, Assess | The decide-confirm-execute-assess loop |
| ROE | Rules of Engagement | The boundary between permitted, approval-required, and prohibited actions |
| Risk Acceptance | Risk acceptance | The authority to approve action despite a known risk |
| MOP | Measure of Performance | Measures whether the task was performed |
| MOE | Measure of Effectiveness | Measures whether the intended effect was achieved |
| Indicator | Indicator | An observable signal used to judge MOP/MOE |
| Decision Point | Decision point | The moment approval, halt, or change is required |
| Decision Support Matrix | Decision support matrix | A table linking conditions to decisions and actions |
| Liaison | Liaison/coordination function | The interface and information link between agents |
| Annex | Annex | A detailed, domain-specific document attached to an OPORD |
| Overlay | Operational graphic | A supporting visualization of task structure, relationships, and flow |

## 2. Pairs Not to Confuse

### Mission vs Intent

Mission is what must be done. Intent is why it must be done and what state counts as success.

If an LLM prompt provides only the mission, the model will carry out the activity, but without intent it may diverge from what the user actually wants.

### MOP vs MOE

MOP is whether it was performed. MOE is whether it was effective.

Example:

- MOP: The `source-map.md` file was created.
- MOE: The next agent can trace evidence for each claim.

### Authority vs Responsibility

Responsibility is the work assigned to you. Authority is the power to decide or execute.

An agent may be responsible for a task without holding the authority to accept the risk that task carries.

### Autonomy vs Independence

Autonomy is the freedom to act within a defined intent and ROE. It is not the same as independence, which would mean acting without regard for higher-level intent.

In a multi-agent system, a subordinate agent may have autonomy, but it does not have the independence to redefine the mission.

### Red Team vs Editor

Red Team is not the one who fixes things — it is the one who exposes problems. If Red Team also takes on the fix itself, its independence is weakened.

## 3. Terms to Fix in LLM Prompts

Use the following terms consistently in prompts.

```text
Mission:
Intent:
Situation:
Execution:
Constraints:
Authority:
CCIR:
Sustainment:
Verification:
Deliverable:
Backbrief:
```

Avoid substituting different wording. When terminology is fixed, the agent learns a stable output structure.

## 4. Recommended Korean-Language Terms (Romanized)

For deployments that operate in Korean, the table below gives the recommended Korean-language rendering of each term. Because this corpus must contain no Hangul, the Korean-language column is given in Revised Romanization rather than in Hangul script.

| English | Korean (romanized) |
| --- | --- |
| Mission | immu |
| Commander's Intent | jihwigwan uido |
| Operations Process | jakjeon suhaeng gwajeong |
| Mission Command | immuhyeong jihwi |
| Command and Control | jihwi tongje |
| Staff | chammo |
| Sustainment | jisok jiwon |
| Protection | bangho |
| Targeting | pyojeokhwa |
| Rules of Engagement | gyojeon gyuchik |
| Battle Rhythm | jakjeon/bogo jugi |
| Running Estimate | jisok pandan jaryo |
| After Action Review | sahu geomto |
| Measure of Performance | suhaeng jipyo |
| Measure of Effectiveness | hyogwa jipyo |

## 5. Related Documents

- `military-llm-framework-v0.1.md`
- `prompt-templates.md`
- `agent-roles-and-authority.md`
- `source-map.md`
- `research-compendium.md`
