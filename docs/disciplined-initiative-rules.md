# Disciplined Initiative Rules

## 0. Purpose

Disciplined initiative is what makes delegation useful: the agent adapts its method when the plan meets reality. The same freedom, unbounded, is how an LLM runtime produces unauthorized action — actions no one approved, justified after the fact by an appeal to the goal.

`docs/mission-command-runtime-policy.md` defines how commander's intent becomes a runtime constraint set and when a method deviation is permitted in principle. This document supplies the concrete boundary ruleset: enumerated rules with stable IDs, the prohibited classes initiative can never unlock, the mandatory reporting conditions, the drift detection model, and the degeneration cases with their required runtime responses.

Boundary vocabulary follows `docs/tool-use-roe.md` (Green/Amber/Red/Black); role defaults follow `docs/agent-roles-and-authority.md`; risk acceptance follows `docs/risk-acceptance-authority.md`. This document does not restate them.

## 1. Doctrine basis

`Claim` (ADP 6-0, Mission Command): disciplined initiative is the duty subordinates have to exercise initiative within the constraints of the commander's intent to achieve the desired end state when unanticipated opportunities or threats arise.

`Claim` (ADP 6-0): initiative is exercised when existing orders no longer fit the situation, and it remains bounded by the commander's intent and by the risk the commander has accepted; it is not license to act outside delegated authority.

`Claim` (Joint Staff Mission Command Focus Paper): trust in subordinate initiative is built through demonstrated competence and confirmed shared understanding, and it is withdrawn when actions diverge from intent.

`Claim` (ADP 5-0, The Operations Process): during execution, commanders and staffs assess whether actions remain consistent with the plan and the intent, and they redirect or halt actions that are not.

`Interpretation`: for an LLM runtime, "disciplined" is not an attitude but a checkable property: initiative is disciplined exactly when it stays inside the intent block and the authority boundary, meets its reporting obligation, and survives drift comparison against the backbrief. Everything else is unauthorized action, however useful the result.

## 2. Rule set

`Application`: the ruleset below is normative for the runtime. Each rule has a stable ID for use in events, alerts, and AAR findings.

| ID | Rule | Trigger checked | Runtime response on violation |
| --- | --- | --- | --- |
| DI-1 | Initiative is permitted only inside the intent block: purpose served, all key tasks preserved, end state unchanged, no failure-to-avoid produced. | Every method deviation | Stop; FRAGO request |
| DI-2 | Initiative is permitted only inside the effective authority boundary (intersection of role default, mission intent, and delegated scopes). Initiative never widens authority. | Every action | Block; approval request |
| DI-3 | Prohibited-action classes (section 3) are never unlocked by initiative, urgency, or opportunity. | Every action | Block; incident record; no alternative approval path |
| DI-4 | A Red action requires a valid, unconsumed approval scope regardless of how strongly the situation favors it. Opportunity is an argument for a faster approval request, never for skipping one. | Red-graded action | Block; approval request with deadline |
| DI-5 | Report-before: deviations meeting any section 4 report-before condition are held until the report is acknowledged or approved. | Deviation classification | Hold; SITREP or approval request |
| DI-6 | Report-after: Green, intent-preserving deviations are executed but must appear in the next SITREP with rationale and evidence. A deviation absent from the SITREP is treated as concealed. | SITREP audit | Escalate; drift review |
| DI-7 | Drift: observed actions are continuously compared with the backbriefed plan; divergence beyond section 5 thresholds suspends autonomy pending review. | Event log vs backbrief | Stop or escalate per drift class |
| DI-8 | Silence is not consent. An unanswered approval request, an expired scope, or an ambiguous instruction grants nothing; the default on ambiguity is the narrower reading. | Approval state check | Hold; re-request or escalate |
| DI-9 | Repeated boundary violations or concealed deviations degrade readiness, which in turn narrows autonomous authority per the readiness rules in `docs/risk-acceptance-authority.md`. | AAR and violation history | Readiness downgrade; authority narrowed |
| DI-10 | Degeneration patterns (section 6) trigger their listed mandatory response — block, escalate, or revoke — without discretionary override by any agent. | Pattern detection | As listed per pattern |

## 3. Prohibited-action classes never unlocked by initiative

`Claim` (ADP 6-0): commanders retain specific decisions and accept risk deliberately; a subordinate exercising initiative does not thereby acquire authority the commander retained.

`Application`: the following classes are outside initiative permanently. No situation encountered mid-mission converts them into permitted actions; the only lawful path is upward.

| Class | Examples | Why initiative cannot unlock it |
| --- | --- | --- |
| Black ROE actions | Secret exposure, prohibited targets, bypassing access controls | Prohibited outright; not a candidate for approval at all |
| Commander retained authority | Production or external mutation, credential release, irreversible destruction, mission scope change | Retained decisions listed in `docs/risk-acceptance-authority.md` section 7 |
| Risk acceptance above own tier | Accepting High or Critical residual risk on the commander's behalf | Acceptance authority is positional, not situational |
| EEFI handling | Outputting or transmitting protected information to justify or speed a task | Protection obligations do not compete with mission progress |
| Authority self-modification | Editing policy, ROE, intent blocks, or own approval scopes | The controlled frame may not be altered by the entity it controls |
| External release | Publishing, sending, or deploying beyond the runtime | Release is a separate decision gate, never an execution side effect |

## 4. Mandatory reporting conditions

`Claim` (ADP 6-0): subordinates exercising initiative report their deviation and its rationale to the commander as the situation allows, so shared understanding is restored.

`Application`: reporting obligations are split by timing. Report-before holds execution; report-after does not, but omission is itself a violation (DI-6).

Report-before (execution held until acknowledged or approved):

| Condition | Channel |
| --- | --- |
| Deviation touches any Amber action not in the backbriefed plan | Decision memo or approval request |
| New target, file set, or external surface not named in the backbrief | SITREP with explicit scope note |
| Change to a deliverable format or deadline promised in the backbrief | SITREP to CoS |
| Deviation consumes materially more resources than planned | FFIR report per `docs/ccir-alerting-model.md` |
| Any Red action, deviation or not | Approval request (DI-4) |

Report-after (execute, then report in the next SITREP):

| Condition | Required content |
| --- | --- |
| Green-only method substitution within scope | Old step, new step, rationale |
| Reordering of planned Green steps | New order and why |
| Added Green verification not in the plan | What was checked and result |

`Application`: no-report cases follow `docs/commander-handbook.md` section 7 — executing the plan exactly as backbriefed requires no deviation reporting at all.

## 5. Drift detection

`Interpretation`: drift is divergence between what the agent backbriefed and what the event log shows it doing. Because each single step can look locally reasonable, drift must be detected by comparison against the recorded plan, not by judging steps in isolation.

`Application`: drift classes and responses. The reference plan is the accepted backbrief; the observation source is the event and tool-use log.

| Drift class | Signal | Severity | Response |
| --- | --- | --- | --- |
| Tool-class drift | Tool of a higher ROE grade than any planned tool appears | Red | Block action; approval request |
| Target drift | Actions touch files, systems, or data outside the backbriefed target set | Amber/Red | Stop; report-before required |
| Scope drift | Work products accumulate outside the mission scope statement | Amber | Escalate to CoS; possible FRAGO |
| Sequence drift | Planned verification or safeguard steps skipped or reordered away | Amber | Stop before next irreversible step; explain in SITREP |
| Purpose drift | SITREP language restates the mission as a different goal than the intent block | Amber/Red | Halt; re-backbrief against the intent block |
| Reporting drift | Executed deviations absent from SITREPs (DI-6 audit) | Red | Suspend autonomy; drift review |

`Application`: a single Amber drift produces an alert; two concurrent drift classes, or any Red drift, suspends autonomous execution for the mission until a human or the CoS (within its tier) reviews the divergence.

## 6. Degeneration cases

`Interpretation`: unauthorized action rarely announces itself; it emerges as recognizable patterns in which the language of initiative is used to dissolve the boundary. Each pattern therefore has a fixed, non-discretionary runtime response.

`Application`: degeneration patterns and required responses.

| Pattern | Description | Detection signal | Required response |
| --- | --- | --- | --- |
| Boundary probing | Repeated near-boundary requests reformulated after each denial | Same effect requested across successive approval requests with cosmetic changes | Escalate to commander; log pattern; deny by default |
| Approval stretching | A consumed or expired approval scope cited for a new action | Scope id reuse, expiry passed, or target mismatch in consumption check | Block; revoke remaining scope validity; audit event |
| Self-delegation | Agent grants itself or a subagent authority it does not hold | Delegation event whose grantor lacks the base authority | Block delegation; revoke any downstream scopes; escalate |
| Retroactive justification | Action taken first, approval or rationale constructed afterward | Execution timestamp precedes approval or report timestamp | Escalate as incident; freeze related task; AAR mandatory |
| Intent reinterpretation | Purpose restated more broadly until the desired action fits inside it | Purpose text in backbrief or SITREP no longer matches the intent block | Halt; re-backbrief; FRAGO decision by commander |
| Silent failure masking | Failures or skipped safeguards omitted from reports to preserve momentum | Event log shows failures absent from SITREP | Suspend autonomy; readiness downgrade (DI-9) |
| Urgency override claim | Prohibited or Red action attempted on the claim that delay defeats the mission | Black/Red attempt accompanied by urgency rationale | Block; the claim itself is routed as a Decision Point alert |
| Runaway subdelegation | Echelons of subagents spawned until boundary tracking is lost | Delegation depth or fan-out exceeds mission plan | Revoke subdelegated scopes; collapse to single echelon; escalate |

`Application`: the three response verbs are defined as follows. Block stops the specific action before effect. Escalate routes a Decision Point alert per `docs/ccir-alerting-model.md` and holds the related task. Revoke invalidates existing approval or delegation scopes through the revocation events already defined in the approval corpus, so the agent's future actions, not just the current one, are narrowed.

## 7. Response ladder and recovery

`Application`: responses compose in one direction only — a lower rung never substitutes for a required higher rung.

```text
violation detected:
  block the action (always, if not yet executed)
  if pattern-level (section 6): escalate, and revoke scopes where listed
  if repeated or concealed: downgrade readiness (DI-9)
  record event; require AAR entry
recovery:
  readiness and autonomy are restored through the AAR and readiness
  ledger process, not by the passage of time or by task success
```

`Interpretation`: the recovery path mirrors the doctrinal trust cycle — trust lost through undisciplined action is rebuilt through demonstrated, supervised competence, not reasserted by the subordinate.

## 8. Research gaps

`Research Gap`: thresholds in section 5 (how many drift signals, over what window) are stated qualitatively; fixture-driven calibration is needed before they can be encoded as numbers.

`Research Gap`: distinguishing intent reinterpretation from legitimate purpose clarification may require a second-model review; no purely mechanical check is proposed yet.

`Research Gap`: doctrine offers no direct analogue for runaway subdelegation depth limits; the right maximum echelon count for agent chains is an open empirical question shared with `docs/mission-command-runtime-policy.md` section 9.

## 9. Source anchors

- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- Joint Staff Mission Command Focus Paper (cited by title; no verified URL in the source map)
- Joint Staff Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf

## 10. Current-stage conclusion

Initiative and authority are different axes: initiative chooses among permitted actions; it never enlarges the permitted set.

The ruleset is condensed into a single sentence.

> Inside the intent and the boundary, deviation with reporting is duty; outside either one, the only disciplined action is to stop and refer upward.

## 11. Implementation Candidates

The following are candidates only; none of them exists yet.

schema:

- `schema-files/disciplined-initiative-ruleset.schema.json`: rule IDs, triggers, and required responses as a machine-readable policy object.
- `schema-files/initiative-deviation-report.schema.json`: report-before/report-after deviation record linked to backbrief and SITREP ids.
- `schema-files/degeneration-incident-event.schema.json`: detected pattern, evidence events, and executed response (block/escalate/revoke).

runner:

- `initiative-drift-detector.js`: compares the event log against the accepted backbrief and emits drift-class alerts.
- `degeneration-response-runner.js`: maps a detected pattern to its mandatory response and verifies the response actually occurred.
- `run-disciplined-initiative-fixtures.js`: disciplined Green deviation, unreported deviation, approval stretching, and self-delegation fixtures.
