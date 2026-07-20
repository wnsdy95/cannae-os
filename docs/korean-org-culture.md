# Korean Org Culture

## 0. Purpose

This document sets out the calibration principles needed when applying the military-style LLM framework to Korean organizational culture.

U.S.-military-style mission command emphasizes commander's intent and the proactive judgment of subordinates. In Korean organizations, hierarchy, approval chains, responsibility avoidance, reporting culture, and implicit expectations can operate more strongly. LLM agents can just as easily amplify the strengths and weaknesses of this organizational culture.

Core statement:

```text
The Korean-style LLM command system is not a system that automates blind obedience,
but a system that makes the legitimacy of orders, confirmation of understanding, risk reporting, and scope of approval clearer.
```

## 1. Risks in Korean Organizational Culture

| Risk | How it appears in the organization | How it appears in the LLM | Control |
| --- | --- | --- | --- |
| Unconditional compliance | Executes without question if it's a superior's word | Executes ambiguous requests immediately | Backbrief mandatory |
| Optimistic reporting | Bad news is reported late | Hides test failures / lack of sources | SITREP risk field |
| Approval bottleneck | All judgment escalates upward | Requires user approval even for trivial tasks | risk-based authority |
| Responsibility avoidance | Decision-maker is unclear | Agent only performs "what it was told" | RACI and decision log |
| Formalism | Document formats exist but are disconnected from judgment | Only fills in OPORD fields with no actionability | MOP/MOE linkage |
| Suppression of dissent | Dissenting opinions get buried | Red Team findings get weakened | Independent Red Team channel |

## 2. Strengthening the Backbrief

In Korean organizations, "Understood" does not guarantee actual understanding. The same is true for LLMs.

### Mandatory Backbrief Format

```text
The mission as I understand it:

1. Mission:
2. Intent:
3. What I am allowed to do autonomously:
4. What requires approval:
5. What I don't know / assumptions:
6. CCIR that must be reported first:
```

### Application Rules

- For ambiguous requests, backbrief before execution.
- For high-risk tasks, submit an approval request after the backbrief.
- For multi-agent tasking, each agent backbriefs its own task.
- Even a user's "just do it" does not bypass the ROE.

## 3. Calibrating Reporting Culture

Bad report:

```text
Proceeding without issues.
```

Good report:

```text
I have verified 3 official sources; access to the original text of detailed Korean-military doctrine is restricted to the public.
I will mark this as a limitation and supplement the structure using publicly available U.S.-military doctrine.
```

### Mandatory Fields for the Korean-style SITREP

```text
Completed:
In progress:
Problems:
Risk that must not be hidden:
Requires higher-level judgment:
Next actions:
```

## 4. Red Team Independence

In Korean organizations, a dissenting opinion can be interpreted as "uncooperative." In the LLM framework, the Red Team must be defined not as a critic but as a safeguard that helps the commander's judgment.

### Red Team Authority

- Submit critical findings before final output is released.
- Report simultaneously to the Commander and the Chief of Staff.
- Escalate high-risk findings directly to the user.

### Red Team Restrictions

- No final decision-making authority.
- No authority to integrate output directly.
- Prohibited from redefining the mission.

## 5. Approval Chains and Delegation of Authority

The approval culture of Korean organizations provides stability but can reduce speed. In LLMs, the approach of asking the user about everything should be replaced with risk-based delegation.

| Risk level | Example | Approval |
| --- | --- | --- |
| Low | Document drafts, file reads, source summaries | Agent autonomy |
| Medium | Editing existing documents, proposing package changes | Perform after backbrief |
| High | API writes, DB changes, deployment | User approval |
| Critical | Exposing secrets, false sources, unauthorized deletion | Prohibited |

## 6. Locus of Responsibility

Even if the agent executes autonomously, responsibility for accepting risk remains with the human.

Principles:

- The agent is the risk identifier.
- The AI Commander is the risk router.
- The Human Commander is the risk acceptor.
- The tool gateway is the risk enforcer.
- The AAR is the risk memory.

## 7. Korean Prompt Phrasing

Recommended phrasing:

```text
Before executing, first report the mission as you understand it and the items that require approval.
For things you don't know, don't estimate — mark them as "confirmation needed."
Don't write claims without sources as conclusions; separate them out as hypotheses.
Don't change external state without user approval.
```

Phrasing to avoid:

```text
Just handle it well on your own.
Make sure there are no problems.
Make it as complete as possible.
Just use your own judgment and do it.
```

## 8. Korean-style Operating Principles

1. Write orders concretely, and separate out intent.
2. View a subordinate agent's questions as a safeguard, not a failure.
3. Have bad news reported quickly.
4. Reduce approval requirements based on risk level.
5. Red Team findings are quality material, not a matter of face.
6. Connect documents to decision support rather than to form.
7. The AAR is material for improving SOPs, not for assigning blame.

## 9. Related Documents

- `korean-military-sources.md`
- `tool-use-roe.md`
- `llm-agent-org-chart.md`
- `agent-battle-rhythm.md`
- `prompt-dsl.md`
