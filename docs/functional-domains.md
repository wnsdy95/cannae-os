# Functional Domains

## 0. Purpose

This document translates the military's warfighting functions, training management, sustainment, targeting, and ROE into LLM operational functions.

An army is not simply an organization that issues orders. Functions such as command and control, intelligence, maneuver, fires, sustainment, protection, and information activities must all operate together for an actual operation to take place. The same is true of an LLM framework. A single good prompt is not enough to reliably sustain long-running tasks, multi-agent coordination, verification, and authority control.

Core statement:

```text
An LLM operating system is not a prompting technique,
but an operational system that combines command and control, intelligence,
execution, sustainment, protection, and assessment.
```

## 1. Translating Military Warfighting Functions into LLM Functions

| Military function | Military meaning | LLM operational function | Key output |
| --- | --- | --- | --- |
| Command and Control | Commander's intent, authority, control, reporting | Preserving user intent, agent authority, approval hierarchy | OPORD prompt, authority matrix |
| Intelligence | Understanding the enemy/environment/risk | Source research, uncertainty, hallucination detection | research note, source map |
| Movement and Maneuver | Gaining advantage through position and action | Task sequencing, file/tool movement, execution path design | execution plan |
| Fires | Applying effects to a target | Modifying, creating, deleting, or invoking a specific target | target-effect list |
| Sustainment | Supply, maintenance, medical, personnel | Managing tokens, time, tools, APIs, context, files | sustainment estimate |
| Protection | Protecting personnel and assets | Security, sensitive information, approval thresholds, rollback | risk register, guardrails |
| Information | Influencing the information environment and messaging | Documentation, knowledge management, user communication | README, compendium, SITREP |

## 2. Command and Control Domain

### Purpose

Preserve user intent through to the end of the task, and clarify which agent may decide what.

### LLM Operational Questions

- Who is the final decision-maker?
- What may an agent change autonomously?
- What information must always be reported?
- At what point is user approval required?
- Where are the mission and intent recorded?

### Required Instruments

- OPORD prompt.
- Commander intent.
- CCIR.
- Authority matrix.
- Backbrief.
- FRAGO.
- AAR.

### Failure Modes

- An agent redefines the user's objective in its own way.
- Subtasks are completed but are inconsistent with the overall objective.
- High-risk work is performed without approval.
- Interim changes are not reflected in the documentation.

## 3. Intelligence Domain

### Purpose

Secure the grounds for decisions and outputs, and make uncertainty explicit.

### LLM Operational Questions

- Which facts require up-to-date confirmation?
- Which sources are primary sources?
- Which claims are inference rather than sourced fact?
- Where do sources conflict?
- Where is the hallucination risk highest?

### Required Instruments

- PIR.
- Source reliability.
- Source map.
- Assumption list.
- Confidence rating.
- Red Team review.

### Intelligence Estimate Format

```text
Question:
Known facts:
Sources:
Assumptions:
Uncertainties:
Implication for mission:
Recommended action:
```

## 4. Movement and Maneuver Domain

### Purpose

Design the sequence and path a task should follow so the objective is achieved at the lowest cost.

For LLMs, this addresses the following in place of physical maneuver.

- Which file to read first.
- Which agent to commit first.
- Whether to parallelize or sequence research and implementation.
- Which module to start applying changes to.
- When to run verification.

### Maneuver Plan Format

```text
Objective:
Entry point:
Main effort:
Supporting efforts:
Sequence:
Decision points:
Fallback path:
Verification:
```

### Failure Modes

- Skipping a document that should have been read first.
- Parallelizing work that should not be parallelized.
- Changing too many files before verification.
- Continuously adding outputs without an overall structure.

## 5. Fires / Effects Domain

### Purpose

Clarify what will be changed and what effect it is intended to produce.

The core of military targeting is not "what to attack" but "what effect is required." In LLM work as well, "what state change will this produce" comes before "create a document" or "modify the code."

### Target-Effect Format

```text
Target:
Desired effect:
Means:
Constraints:
Collateral risk:
Assessment method:
```

### Example

| Target | Desired effect | Means | Assessment |
| --- | --- | --- | --- |
| README | New documents become discoverable | Add links and a reading order | User can locate the document set |
| prompt template | Reduced hallucination | Add OPORD structure and source requirement | Reduction in unsourced claims |
| agent authority | Prevent unauthorized changes | Add approval matrix | High-risk actions are reported before execution |
| research compendium | Knowledge accumulation | Add per-source summaries | Next agent can reuse the grounding |

## 6. Sustainment Domain

### Purpose

Manage resources, tools, time, and context so the task can be sustained to completion.

LLM sustainment includes the following.

- Context budget.
- Token budget.
- File access.
- Whether browsing is available.
- API keys and permissions.
- Test tooling.
- Checkpoints for long-running tasks.
- Where sources and documents are stored.

### Sustainment Estimate Format

```text
Task:
Required tools:
Required context:
Time risk:
Token risk:
External dependencies:
Fallback:
Checkpoint:
```

### Applying Sustainment Principles

| Principle | LLM application |
| --- | --- |
| Anticipation | Anticipate the files, tools, and sources needed before a long task |
| Responsiveness | Respond quickly to user change requests and failures |
| Simplicity | Keep the tool chain and document structure simple |
| Economy | Use costly models/tools only where needed |
| Survivability | Maintain documentation and summaries in case of context loss |
| Continuity | Keep saving intermediate results |
| Improvisation | Prepare fallback paths for tool failures |

## 7. Protection Domain

### Purpose

Protect the user's assets, data, security, and work stability.

LLM protection is not merely a "safety filter." It also includes authority, approval, risk management, secrets protection, and rollback capability.

### Protected Assets

- User files.
- Secret keys and tokens.
- Personal information.
- Company confidential information.
- User intent.
- Existing work products.
- External system state.

### Protection Control Examples

| Risk | Control |
| --- | --- |
| Reverting a user's changes | Check the diff before changing, explicit approval |
| Secret key exposure | Report immediately via EEFI, prohibit output |
| Unsourced claims | source requirement |
| Automatic execution of high-risk work | authority gate |
| Context loss | Documentation and checkpoint |
| Model hallucination | Red Team, source map, verification |

## 8. Information Domain

### Purpose

Keep the user and the agent sharing the same situational awareness, and prevent knowledge from being lost.

The Information domain is the union of communication and knowledge management.

### LLM Operational Questions

- Does the user understand the current state?
- Can the next agent pick up where this one left off?
- Where was each judgment recorded?
- Are document names and locations intuitive?
- Does the reporting help decision-making, or hinder it?

### Required Instruments

- README.
- Research compendium.
- Source map.
- SITREP.
- Decision log.
- AAR.
- Glossary.

## 9. Training and Readiness Domain

### Purpose

Assess whether an agent can repeatedly and stably perform an assigned mission.

Armies manage training tasks in peacetime in order to fight well. An LLM framework must likewise define frequently performed missions, in the manner of a METL.

### AI METL Example

| Mission essential task | Evaluation criteria |
| --- | --- |
| Converting user intent into an OPORD | No omission of mission, intent, constraints |
| Source-based research | Every key claim is linked to a source |
| Updating the document set | README, source map, and compendium are updated together |
| Controlling high-risk changes | authority gate and CCIR are functioning |
| Multi-agent integration | Role-specific outputs are integrated into a single conclusion |
| Incorporating AAR | Lessons learned are reflected in an SOP or template |

### Readiness Rating

| Rating | Meaning | Mode of operation |
| --- | --- | --- |
| T | Trained | Can operate autonomously |
| P | Practiced | Operates under supervision |
| U | Untrained | Requires checklists and approval |
| X | Unknown | Restricted operation until evaluated |

## 10. Targeting Domain

### Purpose

Design LLM work as a "chain of objectives and effects" rather than an "activity list."

### D3A Translation

| Stage | Military targeting | LLM task |
| --- | --- | --- |
| Decide | Decide which target and effect matter | Decide which document/code/judgment to change |
| Detect | Confirm target location and status | Confirm current files, sources, defects |
| Deliver | Apply the means | Modify, create, invoke tools |
| Assess | Evaluate the effect | Test, review, confirm the user's goal is achieved |

### Applied Example

```text
Decide: Without a source map, it is difficult to trace the grounding of claims.
Detect: The current document set has no source-map.md.
Deliver: Write source-map.md and link it from the README.
Assess: Confirm existence and links using rg and wc.
```

## 11. ROE Domain

### Purpose

Clarify what actions an agent may take, what actions it must not take, and what actions require approval.

The ROE for LLMs has three layers.

| Layer | Meaning | Example |
| --- | --- | --- |
| Always allowed | Can be performed autonomously | Reading, summarizing, drafting, local verification |
| Approval required | Permitted after approval | External deployment, incurring cost, data changes |
| Prohibited | Must not be performed | Leaking secrets, unauthorized reversal of user changes, fabricating sources |

### ROE Card Format

```text
Mission:
Allowed:
Requires approval:
Prohibited:
Immediate report:
Fallback:
```

## 12. Integrated Operating Model

Each functional domain is not an independent document; they are connected into a single operational loop.

```text
Command and Control
-> Intelligence
-> Maneuver Plan
-> Target/Effect
-> Sustainment Check
-> Protection Gate
-> Execution
-> Information Update
-> Assessment
-> Training/AAR Update
```

## 13. Related Documents

- `military-llm-framework-v0.1.md`
- `military-operating-system.md`
- `agent-roles-and-authority.md`
- `decision-risk-assessment.md`
- `prompt-templates.md`
- `sop-library.md`
- `agent-battle-rhythm.md`
- `source-map.md`
- `research-compendium.md`
