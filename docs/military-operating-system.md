# Military Operating System

## 0. Purpose

This document treats the way a military operates as a single operating system and translates its components into an LLM operating system.

Core perspective:

```text
A military is not simply an organization that gathers many people together;
it is an operating system that repeatedly synchronizes intent, information, authority, resources, execution, and learning under uncertain conditions.
```

## 1. Layers of the Military Operating System

| Layer | Military Concept | Role | LLM Application |
|---|---|---|---|
| 1 | Doctrine | Common way of thinking | Framework principles |
| 2 | SOP | Standardization of repetitive tasks | Base prompts/workflows |
| 3 | Commander's Intent | Purpose and end state | User intent and hard limits |
| 4 | Planning Process | Problem analysis and course-of-action development | Plan-verify-execute loop |
| 5 | Orders | Execution directives | OPORD/WARNO/FRAGO prompts |
| 6 | Task Organization | Reorganizing structure by mission | Configuring agent teams by mission |
| 7 | Battle Rhythm | Cycle of meetings/reports/decisions | Status update and approval cycle |
| 8 | Decision Support | Decision points and information requirements | CCIR/DSM/DST |
| 9 | Risk Management | Risk identification and control | Approval tiers, stop conditions |
| 10 | Liaison | Connection between organizations | Interfaces between agents |
| 11 | Knowledge Management | Managing information flow | Evidence maps, document repositories |
| 12 | Assessment | Measuring performance | MOP/MOE, tests, validation |
| 13 | AAR | Post-action learning | Prompt/SOP improvement |

## 2. Doctrine: Common Way of Thinking

Doctrine is not a detailed manual; it is the common language and set of principles through which an organization views problems.

LLM Application:

- All agents use the same terminology and judgment criteria.
- Standardize the meaning of "accuracy," "evidence," "approval," "reporting," and "autonomy."
- Framework documents serve as the top-level principles of the system prompt.

Deliverables:

- A glossary.
- A principles document.
- A responsibility matrix by role.
- Hard limits and approval criteria.

## 3. SOP: Standardizing Repetitive Tasks

An SOP prevents repetitive tasks from requiring a fresh judgment call every time. The military uses SOPs to automate routine execution, freeing the commander to focus on exceptions and change.

LLM Application:

- Do not create a new prompt from scratch for every repetitive task.
- Handle research, summarization, code changes, verification, reporting, and AAR with standard templates.
- An SOP does not eliminate freedom; it is a default that lets attention concentrate on the judgment calls that matter.

Minimum structure of an AI SOP:

```text
1. Purpose
2. Scope of application
3. Roles and responsibilities
4. Inputs
5. Procedure
6. Outputs
7. Approval conditions
8. Reporting conditions
9. Fallback procedure on failure
10. Records and AAR
```

## 4. Commander's Intent: A Mechanism for Preserving Purpose

Commander's intent is the mechanism that keeps subordinate units judging in the same direction even as the situation changes.

LLM Application:

- Do not give an agent only "what to build."
- Give it why it's being built, what the end state of success looks like, and the criteria that must never be violated.
- Ensure that even if a subordinate agent changes its method, it cannot change the intent.

A good AI intent statement:

```text
Purpose:
End state of success:
Key constraints:
Priorities:
Conditions considered failure:
Areas of autonomous judgment:
Areas requiring approval:
```

## 5. Planning Process: Structuring Thought Before Execution

The military does not execute large problems immediately. It analyzes problems and develops courses of action through processes such as MDMP, JPP, MCPP, and TLP.

LLM Application:

- Simple tasks: process quickly, as with TLP.
- Complex tasks: break into stages, as with MDMP.
- Uncertain tasks: frame the problem itself first, as with design methodology.

AI planning loop:

```text
1. Receive the mission
2. Confirm intent and constraints
3. Identify information gaps
4. Generate courses of action
5. Assess risk for each course of action
6. Select or request approval
7. Generate the execution order
8. Assess during execution
```

## 6. Orders: Documents for Execution

Order documents turn the results of thinking into an executable form.

| Order | Purpose | AI Application |
|---|---|---|
| WARNO | Begin preparation | Data collection, environment check |
| OPORD | Main execution | Task execution prompt |
| FRAGO | Reflect changes | Mid-course modification prompt |

Core principles:

- An OPORD may be long, but the mission and intent must be short.
- Separate detailed evidence and data into an annex.
- Manage changes cumulatively via FRAGO.

## 7. Task Organization: Reshaping the Organization to Fit the Mission

The military does not fight with a fixed organization alone. It reconfigures units and support relationships according to the mission.

LLM Application:

- Do not use the same agent configuration for every task.
- For research tasks, reinforce S2 and Red Team.
- For implementation tasks, reinforce Executor and S4.
- For strategic tasks, reinforce Chief of Staff, S3, and Red Team.

Example:

| Task Type | Recommended Agent Configuration |
|---|---|
| Research | Commander, S2, Red Team, Recorder |
| Code implementation | Commander, Chief of Staff, S3, S4, Executor, Red Team |
| Documentation | Chief of Staff, S2, S3, Recorder |
| High-risk decisions | Commander, S2, Red Team, external experts |

## 8. Battle Rhythm: The Organization's Heartbeat

Battle rhythm is the cycle in which meetings, reporting, analysis, decisions, and order production interlock. It is not a mere meeting schedule but an information flow that supports the commander's decision-making.

LLM Application:

- Long-running tasks should have a status-reporting cycle.
- Reports should center on "what decision is needed" rather than "what was done."
- Sequence things so that subordinate agents' outputs become inputs to higher-level judgment.

Example AI battle rhythm:

```text
T0: Commander finalizes intent
T1: S2 collects data and reports information gaps
T2: S3 drafts the execution plan
T3: Red Team review
T4: Chief of Staff integration
T5: Commander approval or FRAGO
T6: Executor executes
T7: Assessment
T8: AAR
```

Battle rhythm design criteria:

- The output of each event must be the input to the next event.
- The reporting cycle must not be slower than the pace of the work.
- Eliminate any meeting or report that fails to produce a decision.
- When the situation changes, the battle rhythm changes too.

## 9. Decision Support: Defining Decision Points in Advance

Decision support is a system that predetermines who must make what decision, when specific information arrives.

LLM Application:

- Define decision points before the task begins.
- Link each decision point to the CCIR it requires.
- When information arrives, automatically branch into reporting or execution.

AI decision support matrix:

| Decision Point | Trigger | Needed Info | Options | Approver | Action |
|---|---|---|---|---|---|
| Whether to continue | Lack of key evidence | Source reliability | Proceed/hold/further investigation | Commander | FRAGO |
| Whether to search externally | Need for up-to-date information | Currency of existing knowledge | Search/hold | Chief of Staff | S2 task |
| Whether to deploy | Deliverable complete | Test results | Deploy/revise | Commander | Release |

## 10. Risk Management: Risk Changes Who Holds Approval Authority

Risk management in the military is not a procedure for eliminating risk; it is a procedure for identifying risk and accepting it at the appropriate level.

LLM Application:

- If risk is low and reversible, the agent acts autonomously.
- If risk is high or irreversible, Commander approval is required.
- If no risk-control measure exists, do not execute.

AI risk steps:

```text
1. Identify the risk
2. Assess the risk
3. Establish control measures
4. Determine the approval authority
5. Apply the control measures
6. Monitor during execution
7. Post-execution assessment
```

## 11. Liaison: Lateral Connection

Liaison is the role that maintains communication between organizations and reduces misunderstanding.

LLM Application:

- Make the interfaces between agents explicit.
- Track whether evidence found by S2 is reflected in S3's plan.
- Confirm whether Red Team findings lead to Executor revisions.

AI liaison artifact:

```text
Sending agent:
Receiving agent:
Content transmitted:
Action required:
Deadline:
Confirmed:
```

## 12. Knowledge Management: Designing the Flow of Information

The purpose of knowledge management is to ensure that the right person receives information in the right format at the right time.

LLM Application:

- Do not cram all material into a single long prompt.
- Store evidence, decisions, changes, and deliverables separately.
- Maintain a searchable source map and decision log.

Structure of the AI knowledge base:

| Repository | Contents |
|---|---|
| Source Map | Materials, links, reliability, summary |
| Decision Log | Decision, rationale, approver |
| Change Log | FRAGO, before/after of the change |
| Evidence Map | Linking claims to evidence |
| SOP Library | Repeatable procedures |
| AAR Library | Lessons learned and improvement proposals |

## 13. Assessment: Measuring Whether the Job Was Done Well

Assessment in the military is the ongoing process of watching whether execution is actually leading to the accomplishment of objectives.

LLM Application:

- The existence of a deliverable is not the same as mission success.
- Distinguish "whether the task was performed" from "whether the effect was achieved."

| Category | Military Concept | AI Application |
|---|---|---|
| MOP | Measure of performance | Was the task done, were tests run |
| MOE | Measure of effectiveness | Was the user's objective achieved |
| Indicator | A sign | An observable signal indicating success or failure |

Example:

| Objective | MOP | MOE |
|---|---|---|
| Documentation | Document created, links added | Can the user act on it immediately |
| Research | Sources collected, summarized | Was it reflected in the framework design |
| Code implementation | Tests pass | Did the actual usage flow improve |

## 14. AAR: Institutionalizing Learning

AAR is not a results report; it is an organizational learning mechanism.

LLM Application:

- After each task, record which of prompt, SOP, or authority rule needs improvement.
- Do not record only failures; also record procedures worth keeping.
- Promote recurring errors into an SOP.

## 15. The Overall Loop

```text
Doctrine
-> SOP
-> Intent
-> Planning
-> WARNO
-> OPORD
-> Backbrief
-> Rehearsal
-> Execute
-> SITREP / CCIR / FRAGO
-> Assessment
-> AAR
-> SOP Update
```

## 16. References

- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- ATP 3-90.90, Army Tactical Standard Operating Procedures: https://www.scribd.com/document/78673750/ATP-3-90-90
- Executing Knowledge Management in Support of Mission Command: https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf
- Improving the Battle Rhythm to Operate at the Speed of Relevance: https://ndupress.ndu.edu/Media/News/News-Article-View/Article/2679728/improving-the-battle-rhythm-to-operate-at-the-speed-of-relevance/
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf
- Operation Assessment MTTP: https://www.alssa.mil/mttps/assessment/
- JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
