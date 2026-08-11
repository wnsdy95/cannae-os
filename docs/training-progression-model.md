# Training Progression Model

## 0. Purpose

The military increases a unit's autonomy in stages: crawl, walk, run. Each stage is entered and exited against explicit criteria per mission essential task, and the readiness rating that results is an evidence-based determination, not an impression.

The same discipline applies to agent autonomy. `agent-metl.md` defines the essential tasks per role and names the crawl-walk-run stages; `agent-readiness-ledger.md` defines how ratings are recorded. What has been missing is the progression mechanics: the entry and exit criteria per stage, the evidence required to advance, the triggers that force regression, and how each transition is recorded.

This document defines those mechanics. It does not restate the METL itself, and it does not define what authority each rating confers — that mapping lives in `readiness-to-authority-policy.md`.

## 1. Doctrinal Basis

- `Claim`: ADP 7-0 holds that training proficiency is built progressively and assessed against objective task standards, not assumed from general competence.
- `Claim`: FM 7-0 organizes unit training around the METL and uses the crawl-walk-run approach: tasks are trained first under maximum control, then under realistic conditions, then to standard under mission conditions.
- `Claim`: FM 7-0 treats proficiency as perishable; ratings decay when tasks are not sustained, and evaluation follows every training event.
- `Interpretation`: For an LLM agent, "training conditions" are the degree of supervision and blast radius: template-bound drafting, then supervised execution in a bounded scope, then autonomous execution inside the real mission flow.
- `Application`: Each METL task carries a progression stage with entry/exit criteria, an evidence requirement, and regression triggers, all recorded in the readiness ledger and revised by AAR results.
- `Research Gap`: Doctrine does not state how quickly proficiency decays for cognitive tasks, and there is no public baseline for model-behavior drift after model or tool updates. The re-evaluation intervals in section 6 are framework-internal defaults.

## 2. Progression Stages

Progression is per METL task, never per agent. One agent may be at run on one task and crawl on another.

| Stage | Operating condition | Readiness rating band | Authority posture |
| --- | --- | --- | --- |
| Pre-crawl | Task not assessed, or new tool/domain just introduced | X | Execution prohibited; training tasks only |
| Crawl | Output produced strictly from a template, always reviewed before any use | U | Draft/report only |
| Walk | Execution in a bounded scope under supervision, with verification attached | P | Supervised execution per `readiness-to-authority-policy.md` |
| Run | Autonomous execution inside the actual mission flow, within ROE and mission scope | T | Scoped autonomous execution per `readiness-to-authority-policy.md` |

The stage names are the training view; the T/P/U/X ratings are the ledger view. They move together: a stage transition is exactly a rating change with the evidence of section 4 attached.

## 3. Entry and Exit Criteria per METL Task

Every METL task adopts this criteria frame. Task-specific values are set when the task is added to the METL and are refined through AAR.

| Stage | Entry criteria | Exit criteria |
| --- | --- | --- |
| Crawl | Task defined in the METL with an evaluation standard; template or checklist exists; task registered in the readiness ledger at U (or X pending first assessment) | 3 or more template-conformant drafts accepted by the supervising role without structural rework; zero unsourced claims in any accepted draft |
| Walk | Crawl exit met; bounded execution scope defined (tools, targets, stop conditions); supervising role assigned | 3 or more supervised executions with verification passing; agent flagged its own stop conditions and authority boundaries unprompted in each backbrief; no critical AAR finding on the task |
| Run | Walk exit met; commander or CoS confirms the mission flow the task will run in; fixture coverage exists for the task's failure modes | Sustainment only: run status is retained while section 4 evidence stays current and no section 5 trigger fires |

Entry criteria are checked by the CoS before assigning the task at the new stage. Exit criteria are assessed by the Evaluator, whose recommendation is recorded as a readiness update.

## 4. Evidence Required to Advance

A stage promotion is a readiness rating increase and requires all applicable evidence classes below. "The agent seems capable" is not evidence.

| Evidence class | Standard for promotion | Where it lives |
| --- | --- | --- |
| Fixture pass rate | 100 percent pass on the task's designated fixture runners, on 3 consecutive runs including the most recent repository state | Runner output referenced from the ledger entry `evidence` list |
| Supervised run record | The stage-required count of supervised executions, each with a backbrief and a passing verification | Event log; SITREP references |
| AAR findings | Task classified "sustain" or better in the most recent AAR covering it; no open critical finding; no concealed failure | AAR record; `aar-to-readiness-update.js` output |
| Boundary behavior | The agent identified authority boundaries and stop conditions on its own in every counted run | Backbrief records |
| Red Team review | For tasks touching Amber-or-above actions: no open critical Red Team finding on the task | Red Team findings linked to the mission |

The promotion itself is recorded as a `ReadinessUpdated` event and a ledger entry per `schema-files/readiness-ledger.schema.json`; see section 6.

## 5. Regression Triggers

Regression is not punishment; it is the ledger returning to an honest state. Triggers and their effects:

| Trigger | Effect | Floor |
| --- | --- | --- |
| Same task fails twice with the same error class | Demote one stage; generate a training task | Crawl |
| Repeated handoff failure (packet rejected twice under `handoff-packet-template.md` section 6) | Demote one stage on the affected task | Crawl |
| Unsourced claim, source exaggeration, or hallucination in task output | Demote one stage; require Crawl-style review on the next 3 outputs | Crawl |
| Red action executed or attempted without report | Immediate drop to X on the task; commander notified as an FFIR | Pre-crawl |
| Sensitive information exposed | Immediate drop to X on the task; incident handling per OPSEC policy | Pre-crawl |
| Verification failure concealed | Immediate drop to X on the task | Pre-crawl |
| New tool, new domain, or materially changed task scope | Rating held: task re-enters at Crawl or Walk as the Evaluator determines; prior evidence marked stale | Crawl |
| Model change for the executing agent | All run-stage tasks for that agent drop to Walk pending one full evidence cycle | Walk |

A demotion is recorded exactly like a promotion: a `ReadinessUpdated` event with the trigger named in the evidence, so the ledger explains itself.

## 6. Recording Progression in the Readiness Ledger

The readiness ledger is the single record of progression state; the event log is the record of every transition. Chat history records neither.

Rules:

- Every stage transition emits a `ReadinessUpdated` event naming the task, previous rating, new rating, evidence, and limitations, as illustrated in `agent-metl.md` section 5.
- The ledger entry for the task is rewritten to the new rating with the promotion or demotion evidence in `evidence` and the residual restrictions in `limitations`, per `schema-files/readiness-ledger.schema.json`.
- For crawl- and walk-stage tasks, `next_training` names the concrete task that satisfies the next exit criterion — a progression stage without a next training task is a stalled stage.
- Run-stage ratings are re-confirmed at every phase-close AAR and whenever the task has not been performed within the sustainment interval set for it; an overdue re-confirmation holds the rating pending.
- Any consumer of readiness (the readiness gate, the authority matrix, mission preflight) reads the ledger projection, never a stale table in a document.

## 7. Progression Review Rhythm

| Point in time | Action |
| --- | --- |
| Mission start | CoS confirms stage/rating for every role/task pair the mission requires |
| After each supervised run | Supervising role records the run outcome toward walk exit evidence |
| Phase close / AAR | Evaluator applies section 4 evidence and recommends promote/hold/demote per task |
| Regression trigger fires | Immediate demotion per section 5, then a training task is generated |
| New tool or model introduced | Affected tasks re-enter per section 5; training plan updated |

## 8. Prompt Guard

```text
Before assigning or accepting a task, check progression state.
- What stage is this role/task pair at: pre-crawl/crawl/walk/run?
- Am I asking for output beyond the stage's exit evidence?
- If supervision is required, who supervises and where is it recorded?
- If this run counts toward promotion, which evidence class does it feed?
```

## 9. Source Anchors

- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716
- FM 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf
- Joint Training Manual (cited by title; URL not yet registered in `source-map.md`)

## 10. Implementation Candidates

schema:

- `training-progression.schema.json`
- `progression-transition-event.schema.json`

prototype:

- `progression-gate-runner.js`
- `run-progression-fixtures.js`
- `stale-readiness-report.js`
