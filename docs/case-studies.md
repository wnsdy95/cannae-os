# Case Studies

## 0. Purpose

This document is a casebook applying the military-style LLM operating framework to actual work.

Conceptual documents explain "what should be done." Case documents show "how it actually runs." Each case is organized in the order OPORD, WARNO, execution, SITREP, FRAGO, assessment, AAR.

## 1. Case-Writing Standard

Every case follows the structure below.

```text
Case:
Mission:
Commander's intent:
Situation:
Execution:
Authority:
CCIR:
Sustainment:
Assessment:
AAR:
SOP update:
```

The key is not to record only the outcome. It also captures why a given decision was made, what risk was reported, and what was fed back into the next SOP.

## 2. Case 01: Documenting a Military-Style LLM Framework

### Mission

Research the military's command and control, order dissemination, approval scope, reporting system, and post-action management methods, and document them as an AI LLM operating framework.

### Commander's intent

The user wants not a simple idea memo but a conceptual framework that is scalable in the long term. It is necessary to understand why the military-style system is disseminated and executed without distortion, and to convert this into a single/multi-agent LLM operating method.

Success conditions:

- Research material and interpretation accumulate in one place.
- Approval, reporting, and autonomy scope by rank/role are documented.
- OPORD, WARNO, FRAGO, SITREP, and AAR templates are produced.
- SOP, battle rhythm, and source map are produced.
- The next worker can continue and extend the work.

Failure-to-avoid conditions:

- Do not borrow military-style expressions alone while missing the actual operating principles.
- Do not use unsourced generalities as core evidence.
- Do not reduce everything to a single prompt trick.

### Situation

Initial state:

- No documents exist in the local project.
- The user presents the conceptual direction in Korean.
- Research targets are military document systems, authority, reporting, operations, execution, and post-action management.
- Currency and official-source verification are required.

Constraints:

- Focus on publicly available material.
- Translate into an AI LLM operating framework rather than giving actual military-operations advice.
- Documentation takes priority.

### Execution

1. Write the overall framework document.
2. Write the document on the military-style operating system.
3. Write the agent-roles-and-authority document.
4. Write the decision, risk, and assessment document.
5. Write the prompt-templates document.
6. Accumulate all research and interpretation in the research compendium.
7. Add the SOP library, battle rhythm, source map, and functional domains.
8. Connect the index to the README and higher-level documents.

### Authority

Agent may act autonomously:

- Public-material search.
- Document generation.
- Local markdown file edits.
- Source summarization.
- Framework interpretation.

Approval required:

- Converting into actual military/legal advice.
- External distribution.
- Reverting the user's existing changes.

Prohibited:

- Asserting unverified sources as official sources.
- Using classified or non-public material.

### CCIR

PIR:

- Why does the military document dissemination system reduce distortion during transmission?
- How are authority delegation and reporting criteria designed?
- How can training and readiness be applied to LLMs?

FFIR:

- Is the document set linked from the README?
- Have file counts and line counts been verified?
- Is the local workspace a git repository?

EEFI:

- Whether sensitive military information or non-public documents are used.
- User information that must not be disclosed externally.

### Sustainment

Resources used:

- Web research.
- Local markdown documents.
- Verification based on `rg`, `wc`, `sed`.
- Official sources from ArmyPubs, JCS, DoD, and similar bodies.

Bottlenecks:

- For some official PDFs, a detail page is more stable than a direct link.
- Confirming the latest official release of the original ROE text is tricky.
- Publicly available Korean military material requires additional searching.

### Assessment

MOP:

- Document set created.
- README links updated.
- Source map added.
- Research compendium expanded.
- SOP and battle rhythm written.

MOE:

- Can the next worker continue the framework by looking only at the document set?
- Are military concepts connected to LLM application points?
- Can the approval/reporting/autonomy criteria actually be used in prompt operations?

### AAR

What went well:

- The framework was separated into concepts, roles, procedures, and evidence.
- Traceability of material was secured via the research compendium and source map.
- SOP and battle rhythm were added, creating an execution system.

What to improve:

- Actual work experiments are still lacking.
- More research into the Korean military's document system is needed.
- More evaluation metrics are needed to measure framework performance.

SOP update:

- When a new research axis is created, update `research-compendium.md` and `source-map.md` together.
- When a new operating document is created, link it in the README and `military-llm-framework-v0.1.md`.

## 3. Case 02: Operating a Hallucination-Prevention Research Agent

### Mission

Have an LLM agent conduct source-based research on a given topic without hallucination.

### Commander's intent

The key is not producing an answer quickly, but making it traceable which claim came from which source. Uncertain content is left as a PIR rather than as a conclusion.

### Situation

Example topic:

- "Why does the military's document dissemination system reduce distortion?"

Risks:

- The model plausibly fabricates military terminology.
- Secondary material is mistaken for official doctrine.
- Source summary and interpretation become mixed together.

### OPORD-style prompt

```text
Mission:
Investigate, based mainly on public official material, why the military's document dissemination system reduces distortion.

Intent:
The goal is to secure the evidence needed to convert the military document system into an LLM prompt/agent system.
Unsourced claims are not written as conclusions.

Execution:
1. Find official doctrine documents and standard formats first.
2. Separate the key concept, original context, and LLM application point from each source.
3. Record conflicting or uncertain content as an unresolved PIR.
4. Organize the result in source-map format.

CCIR:
- Unable to find an official source.
- Conflict between sources.
- Currency verification needed.

Deliverable:
Summary per source, LLM application, remaining questions.

Backbrief:
Before execution, report in 5 lines the mission and verification criteria as you understand them.
```

### Assessment

MOP:

- At least 3 official sources confirmed.
- Each claim linked to a source.
- Uncertainty marked.

MOE:

- Another agent can re-verify the same sources.
- The research can be converted into a prompt template or SOP.

### AAR

Lessons:

- A research agent should be operated as an "evidence producer," not an "answer writer."
- For unsourced claims, isolating them as a "hypothesis" is more useful for later research than deleting them.

## 4. Case 03: Multi-Agent Code Fix

### Mission

Fix a bug in an existing codebase and prevent regression with tests.

### Commander's intent

Resolve the user's problem with minimal changes. Do not revert the user's existing changes. Leave a test or reproduction procedure.

### Role Assignment

| Role | Assignment |
| --- | --- |
| Commander | Confirms user request and success conditions |
| S2 | Investigates the bug's cause and related files |
| S3 | Plans the fix and its sequencing |
| S4 | Checks test tools, dependencies, and execution environment |
| Red Team | Reviews side effects of the change |
| S6 | Documents the change and verification results |

### Execution

1. Check the file structure.
2. Search related code.
3. Identify the reproduction conditions.
4. Draft a minimal fix.
5. Add tests or run existing tests.
6. If it fails, issue a SITREP and FRAGO.
7. If it succeeds, issue the final report and AAR.

### Authority

Autonomous:

- Reading files.
- Modifying related code.
- Running tests.
- Running the formatter.

Approval required:

- Large-scale refactoring.
- Data deletion.
- Calling external services.
- Large-scale dependency changes.

### SITREP Example

```text
SITREP

Mission: Fix login error.
Completed: Checked the related auth module and tests.
In progress: Fixing the token expiration handling path.
Blocked: None.
CCIR: An existing test is failing but appears unrelated to this change.
Risk: Regression test needs to be added.
Next action: Run auth tests after the minimal fix.
```

### AAR

Lessons:

- In code work too, separating S2 investigation from S3 execution reduces unnecessary changes.
- Test failures must be reported as FFIR and not hidden in the final report.

## 5. Case 04: High-Risk Automation Task

### Mission

Design automation that can affect an external system.

### Commander's intent

An agent can assist in designing automation, but actual execution authority is restricted. Cost, data changes, and security impact are not executed until human approval.

### Situation

Examples:

- A customer database cleanup script.
- Automated calls to a payment API.
- Changes to a deployment pipeline.
- Updates to a public website.

### ROE Card

```text
Allowed:
- Drafting code.
- Designing a dry run.
- Verification based on test data.
- Producing a risk list.

Requires approval:
- Actual data changes.
- External API calls.
- Deployment.
- Incurring cost.

Prohibited:
- Printing secret keys.
- Deletion without approval.
- Reverting the user's changes.
```

### Decision Board

```text
Decision required:
Whether to run the script against actual data.

Options:
1. Run dry-run only.
2. Run on sample data.
3. Run on a limited scope after backup.
4. Run in full.

Recommendation:
Option 2, then confirm results, then request approval for option 3.

Risk:
Data damage, incurred cost, recovery failure.
```

### Assessment

MOP:

- Dry-run implemented.
- Logging and rollback plan written.
- Approval gate set.

MOE:

- Is the risk visible to the user before actual execution?
- Is there a recovery path in case of failure?
- Does the agent stop actions that are out of scope of its authority?

## 6. Case 05: Multi-Agent Task via Order Dissemination

### Mission

Decompose a large, higher-level user goal into per-agent tasks while ensuring the final deliverable integrates into a single intent.

### Commander's intent

Each agent judges freely within its own area of expertise but does not change the mission or intent. The Chief of Staff integrates the deliverables.

### Dissemination Structure

```text
User intent
-> Commander OPORD
-> Chief of Staff tasking
-> S2 research order
-> S3 execution order
-> S4 sustainment order
-> Red Team review order
-> Integrated final output
```

### Subordinate Agent Tasking Examples

S2:

```text
Preserve the higher-level intent.
Your job is not to write conclusions but to produce sources and uncertainty.
For each source, separate the key content from its applicability.
```

S3:

```text
Preserve the higher-level intent.
Your job is to create executable steps and a deliverable structure.
Do not ignore S2's uncertainty; reflect it in the plan.
```

Red Team:

```text
Preserve the higher-level intent.
Your job is not direct editing but finding failure possibilities, exaggeration, and lack of sources.
Attach a severity and a recommended action to each finding.
```

### AAR

Lessons:

- In a multi-agent structure, integration authority matters more than parallelization.
- If each agent is not given the same commander's intent, the deliverables drift in different directions.
- Red Team should have independence but should not hold final integration authority.

## 7. Related Documents

- `military-llm-framework-v0.1.md`
- `agent-roles-and-authority.md`
- `sop-library.md`
- `agent-battle-rhythm.md`
- `decision-risk-assessment.md`
- `prompt-templates.md`
- `evaluation-metrics.md`
