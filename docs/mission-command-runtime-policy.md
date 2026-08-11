# Mission Command Runtime Policy

## 0. Purpose

Mission command lets a large organization act coherently without the senior commander directing every step. The commander fixes why the operation exists and what done looks like; subordinates choose how within explicit boundaries.

`docs/commander-handbook.md` already tells the human commander what inputs to provide, and `docs/agent-roles-and-authority.md` already assigns approval tiers to roles. What is still missing is the runtime layer between them: how a stated intent becomes a machine-checkable constraint set, how that constraint set survives delegation through echelons of agents, and how the runtime decides whether a method change by an agent is disciplined initiative or the start of unauthorized action.

This document defines that runtime policy. The enumerated boundary rules that enforce it are split out into `docs/disciplined-initiative-rules.md`.

This document extends the existing corpus; it does not restate it. The commander input format stays in the handbook, role authority stays in the roles document, and ROE grades stay in `docs/tool-use-roe.md`.

## 1. What commander's intent consists of

`Claim` (ADP 6-0, Mission Command): mission command is the Army's approach to command and control that empowers subordinate decision making and decentralized execution appropriate to the situation, built on principles including commander's intent, mission orders, disciplined initiative, shared understanding, mutual trust, competence, and risk acceptance.

`Claim` (ADP 5-0, The Operations Process): commander's intent is a clear and concise expression of the purpose of the operation and the desired military end state, and it includes the operation's purpose, key tasks, and the conditions that define the end state.

`Claim` (Joint Staff Mission Command Focus Paper): intent must be understood two echelons down, so that subordinates can act consistently with the higher purpose even when the original plan no longer applies and communication with the issuing commander is degraded.

`Interpretation`: for an LLM runtime, intent is not a goal string. A goal states one desired output; intent states the purpose behind the mission, the tasks that must happen in any acceptable solution, the observable conditions of success, the failures that must not be produced on the way, and the line beyond which the agent has no authority regardless of how promising a method looks.

`Application`: the Commander prompt therefore fixes five fields before any method is discussed: `purpose`, `key_tasks`, `end_state`, `failure_to_avoid`, and `authority_boundary`. This matches the intent block in the commander prompt skeleton of `docs/commander-handbook.md` and extends it with an explicit failure and boundary field.

## 2. Intent as a machine-checkable constraint set

`Application`: each intent field maps to a different kind of runtime check. Some fields are mechanically enforceable; others are semantic and are enforced through backbrief and evaluation rather than through a gate.

| Field | Content | Check type | Enforced by |
| --- | --- | --- | --- |
| `purpose` | Why the mission exists; the effect wanted | Semantic | backbrief echo, Evaluator MOE review |
| `key_tasks` | Tasks that any acceptable method must include | Enumerable | task checklist projection; missing task blocks completion claim |
| `end_state` | Observable conditions proving the mission is done | Enumerable | validator/test/replay checks named per condition |
| `failure_to_avoid` | Outcomes that must not be produced even in success | Enumerable plus semantic | detection rules routed as CCIR alerts (`docs/ccir-alerting-model.md`) |
| `authority_boundary` | Actions allowed autonomously, actions requiring approval, actions prohibited | Mechanical | policy engine and ROE grades in `docs/tool-use-roe.md` |

`Application`: intent block example.

```json
{
  "intent_id": "INTENT-DEMO-001",
  "mission_id": "M-DEMO-001",
  "purpose": "Reduce unauthorized execution by making authority boundaries machine-checkable.",
  "key_tasks": [
    "Define the runtime constraint object",
    "Define the delegation continuity rule",
    "Define the deviation gate"
  ],
  "end_state": [
    "Both policy documents exist and pass the doc validators",
    "Boundary vocabulary matches tool-use-roe.md"
  ],
  "failure_to_avoid": [
    "A Red action executed without an approval scope",
    "An intent block whose child widens the parent boundary"
  ],
  "authority_boundary": {
    "green": ["local document drafting", "read-only search", "local validation"],
    "amber": ["structural change to existing files"],
    "red": ["external deployment", "credential use", "cost incurrence"],
    "black": ["secret exposure", "prohibited targets"]
  },
  "parent_intent_id": null
}
```

`Application`: the boundary vocabulary is the Green/Amber/Red/Black grading of `docs/tool-use-roe.md`. Red means blocked until an explicit approval scope exists; Black means never available, including to initiative.

## 3. What is delegated and what stays controlled

`Claim` (ADP 6-0): mission orders direct what to accomplish and why, without prescribing how, leaving the maximum possible freedom of action to subordinates consistent with the situation.

`Claim` (ADP 6-0): commanders accept risk deliberately, and some decisions are retained by the commander rather than delegated.

`Interpretation`: delegation of method is not delegation of purpose, boundary, or risk acceptance. The agent owns the plan; the commander owns the frame the plan must fit inside.

`Application`: the runtime split is fixed as follows.

| Delegated to the agent | Controlled, never delegated by default |
| --- | --- |
| Sequence and decomposition of work | `purpose` and `end_state` (change requires FRAGO) |
| Choice among Green tools and methods | `authority_boundary` (change requires FRAGO or explicit delegation event) |
| Draft content, intermediate artifacts | Red approval and risk acceptance (`docs/risk-acceptance-authority.md`) |
| Adding verification steps | Black prohibitions (never unlockable) |
| Proposing alternative methods and FRAGOs | Release of output to external parties |

`Application`: the agent may always propose a method the commander did not anticipate. Proposing costs nothing and crosses no boundary; executing is what the gate controls.

## 4. Intent continuity through echelons

`Claim` (ADP 6-0): subordinate commanders nest their own intent within the higher commander's intent, so that purpose remains aligned across echelons even as each echelon issues its own orders.

`Interpretation`: in a multi-agent runtime, every delegation from Commander to CoS to staff agent to executor is an echelon crossing, and each crossing is an opportunity for the boundary to silently widen or the purpose to silently mutate.

`Application`: intent continuity rules.

| Rule | Statement |
| --- | --- |
| Linkage | Every child intent block carries `parent_intent_id`; a task with no intent lineage to the root mission is blocked. |
| Narrowing only | A child `authority_boundary` must be equal to or narrower than the parent boundary. A child may move an action from Green to Amber; it may never move an action from Red to Green or unlock Black. |
| Purpose inheritance | A child `purpose` must state how it serves the parent `purpose`; the backbrief must restate both. |
| Key task conservation | A parent key task may be decomposed but not dropped; a dropped key task requires a FRAGO at the echelon that owns it. |
| Boundary intersection | When an agent operates under multiple applicable boundaries (role default in `docs/agent-roles-and-authority.md` plus mission intent), the effective authority is the intersection, never the union. |

`Application`: the delegation events already defined for approval authority (`schema-files/approval-delegation-event.schema.json`) carry authority downward; the intent block is the mirror object that carries purpose downward. The two must reference the same mission id so the runtime can check that delegated authority never exceeds the intent boundary.

## 5. When an agent may deviate from the planned method

`Claim` (ADP 6-0): disciplined initiative is the duty subordinates have to exercise initiative within the constraints of the commander's intent when unforeseen opportunities or threats arise and the current order no longer fits the situation.

`Interpretation`: deviation from the backbriefed plan is expected behavior, not an exception. What distinguishes disciplined initiative from unauthorized action is not whether the plan changed but whether three conditions all hold at the moment of change.

`Application`: a method deviation is permitted only when all of the following are true.

1. Intent preserved: the new method still serves `purpose`, still performs every `key_tasks` entry, still targets the same `end_state`, and produces none of `failure_to_avoid`.
2. Boundary intact: every action in the new method carries the same or lower ROE grade as the backbriefed plan; no Red action appears without an existing approval scope; no Black action appears at all; mission scope and targets do not expand.
3. Reporting obligation met: a deviation that stays entirely Green is reported after the fact in the next SITREP with rationale and evidence; a deviation that touches Amber, adds a new target, or changes a deliverable format promised in the backbrief is reported before execution.

`Application`: deviation gate.

```text
on method_change(plan_old, plan_new, intent):
  if any action in plan_new is Black: block, incident record
  if any action in plan_new is Red without valid approval scope: stop, approval request
  if plan_new violates key_tasks, end_state, or failure_to_avoid: stop, FRAGO request
  if plan_new adds targets or expands scope: stop, report before execution
  if plan_new is Green-only and intent-preserving: proceed, log deviation, report in next SITREP
```

## 6. When an agent must stop

`Interpretation`: mission command obliges the subordinate to stop and refer upward when the situation has moved outside the intent itself, because at that point no method choice can be disciplined.

`Application`: mandatory stop conditions, each routed as a Decision Point alert per `docs/ccir-alerting-model.md`.

| Condition | Runtime signal | Required action |
| --- | --- | --- |
| Boundary crossing required | Next step is Red without approval, or Black | Stop; approval request or refusal with alternative |
| Intent unachievable | An `end_state` condition is provably unreachable | Stop; FRAGO request |
| Assumption collapse | A fact the plan depends on is falsified | Stop; report as CCIR; hold execution |
| Key task conflict | Two key tasks cannot both be satisfied | Stop; decision packet to commander |
| Instruction conflict | A new user instruction contradicts standing intent | Stop; surface the conflict; do not silently pick one |
| Drift detected | Observed actions diverge from the backbriefed plan beyond rule thresholds | Stop or escalate per `docs/disciplined-initiative-rules.md` |

`Application`: stopping is a reportable success state, not a failure state. An agent that halts on a boundary and requests approval has followed the policy; an agent that improvises past the boundary has broken it, even if the outcome was good.

## 7. Backbrief as the intent verification gate

`Claim` (ADP 5-0): subordinates confirm their understanding of the mission, the commander's intent, and their part in the plan back to the issuing commander before execution.

`Interpretation`: the backbrief is where intent transmission is tested. If the restated intent does not match the issued intent, execution starting anyway is the earliest form of unauthorized action.

`Application`: the runtime backbrief, defined procedurally in `docs/backbrief-and-rehearsal-sop.md`, must restate three things against the intent block: what I am trying to do (purpose and key tasks in the agent's own words), why (link to parent purpose), and where I stop (the authority boundary and the stop conditions of section 6). A backbrief that omits the stop line, echoes a widened boundary, or restates the mission as a different goal is rejected and execution does not begin.

## 8. Runtime gate summary

`Application`: the full policy compresses into one execution gate evaluated before every non-trivial action.

```text
before action:
  require intent lineage to root mission
  require accepted backbrief for this intent
  effective_boundary = intersection(role default, mission intent, delegated scopes)
  if action is Black: prohibit
  if action is Red and no valid approval scope: stop, approval request
  if action deviates from backbriefed plan: run deviation gate (section 5)
  if any stop condition (section 6) holds: stop, route alert
  else: execute, log, report per reporting obligation
```

## 9. Research gaps

`Research Gap`: how far purpose alignment can be checked mechanically rather than by a second model review is unresolved; current design treats purpose as semantic and checks only its restatement, not its truth.

`Research Gap`: doctrine describes intent two echelons down for human formations; whether deeper agent delegation chains need an explicit depth limit before intent fidelity decays has no doctrinal answer and needs empirical testing.

`Research Gap`: the exact SITREP timing for report-after deviations (immediately, batched, or at task end) is an operating parameter this corpus has not yet fixed.

## 10. Source anchors

- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- Joint Staff Mission Command Focus Paper (cited by title; no verified URL in the source map)
- Joint Staff Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf

## 11. Current-stage conclusion

Intent that lives only in prose is advice; intent that lives in a constraint object is policy.

The runtime rule is condensed into a single sentence.

> An agent may change how, on its own, exactly as long as what, why, and where-I-stop remain provably unchanged.

## 12. Implementation Candidates

The following are candidates only; none of them exists yet.

schema:

- `schema-files/commander-intent.schema.json`: the five-field intent block with parent lineage and boundary object.
- `schema-files/intent-delegation-event.schema.json`: echelon crossing event pairing an intent block with a delegated approval scope.
- `schema-files/method-deviation-event.schema.json`: recorded deviation with intent check results and reporting obligation status.

runner:

- `intent-continuity-runner.js`: walks the intent lineage and fails any child block that widens its parent boundary or drops a key task.
- `method-deviation-gate.js`: implements the section 5 gate against a backbrief and a proposed plan change.
- `run-intent-continuity-fixtures.js`: valid nested intent, widened-boundary child, and dropped-key-task fixtures.
