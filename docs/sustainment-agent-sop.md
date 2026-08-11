# Sustainment Agent SOP

## 0. Purpose

This document is the standing operating procedure for the S4 sustainment agent. It defines how the S4 watches the runtime's consumable and repairable resources, when a resource condition becomes a SITREP or CCIR entry, which drills keep long-running tasks alive, and how a tool outage is handled as both a technical repair task and a command decision.

Position among sibling documents:

- `maintenance-readiness-model.md` defines the readiness state model: dimensions, readiness classes, the failure taxonomy, and the readiness-to-authority integration rule. This SOP does not restate that model; it defines the procedure the S4 runs against it.
- `resource-priority-policy.md` defines who gets a contested resource. This SOP defines how the S4 detects that a resource is contested in the first place and what it reports.
- `agent-battle-rhythm.md` defines the recurring schedule this SOP plugs into.

Scope boundary: the S4 watches and reports. It repairs what falls under its own discretion, and it escalates what does not. It never silently expands mission scope, accepts risk, or reorders priorities to solve a shortage.

## 1. Doctrinal basis

- `Claim`: Sustainment doctrine treats the provision of logistics, personnel, and resources as the function that determines operational reach, endurance, and freedom of action, not as rear-echelon administration (ADP 4-0, Sustainment).
- `Claim`: Joint logistics doctrine requires sustainment to be integrated with operations through shared visibility, anticipation of requirements, and deliberate prioritization across the force (JP 4-0, Joint Logistics).
- `Interpretation`: In the LLM runtime, tokens, wall-clock time, API quota, tool health, and context-window budget are the classes of supply. Operational reach is the amount of work the runtime can complete before a resource class is exhausted, and endurance is the ability to continue across interruptions.
- `Interpretation`: A tool failure is simultaneously an equipment casualty (a repair problem) and a combat-power change (a command problem). Doctrine handles these on two different nets, and this SOP does the same.
- `Application`: The S4 agent runs a fixed watch cycle over the five resource classes, converts threshold crossings into SITREP/CCIR entries, and maintains the checkpoint/cache/retry/degraded-mode drills that give long-running tasks endurance.

## 2. Resource watch cycle

The S4 tracks five resource classes. Each class has a measurement, a budget source, and a watch trigger.

| Resource class | Measurement | Budget source | Watch trigger |
| --- | --- | --- | --- |
| Tokens | Consumed vs mission token budget | Mission order / annex | Each phase boundary and each large tool result |
| Wall-clock time | Elapsed vs mission deadline | Mission order / commander guidance | Each battle-rhythm sync event |
| API quota | Calls and rate-limit headroom per provider | Provider limits, org policy | Each external tool dispatch |
| Tool health | Readiness class per critical asset | `maintenance-readiness-model.md` section 4 | Each check command run, each tool failure event |
| Context budget | Working-context size vs window; source-of-truth freshness | Runtime configuration | Each handoff, each phase boundary |

Watch cycle procedure:

1. At mission start, record the initial budget for each class in a maintenance readiness report (`schema-files/maintenance-readiness.schema.json`).
2. At each watch trigger, re-measure the class and assign Green/Amber/Red per the resource readiness classes in `maintenance-readiness-model.md` section 5.
3. Record every class transition (Green to Amber, Amber to Red, and recoveries) as an event. Steady-state Green is not reported.
4. Project the current state into the sustainment dashboard via `maintenance-dashboard-runner.js`.

- `Application`: The watch cycle is exception-driven. The S4 reports transitions and threshold crossings, not continuous telemetry, matching the CCIR principle that only decision-relevant information moves up.

## 3. Thresholds and reporting

Default thresholds. A mission order or annex may tighten them; only a commander decision may loosen them.

| Class | Amber threshold | Red threshold |
| --- | --- | --- |
| Tokens | 60 percent of budget consumed with less than 60 percent of work complete | Projected consumption exceeds budget before end state |
| Wall-clock time | 50 percent of deadline elapsed with the critical path unfinished | Deadline cannot be met without scope or quality change |
| API quota | Any provider below 25 percent headroom | Rate-limited or hard quota exhaustion on a critical tool |
| Tool health | Any critical asset Poorly or Unknown | Any critical asset Unavailable with no ready fallback |
| Context budget | Working context above 70 percent of window, or source of truth stale | Required context cannot fit even after summarization, or source of truth missing |

Reporting rules:

- Amber produces a SITREP entry to the CoS: class, measurement, trend, S4 action already taken, and the projected time until Red.
- Red produces a CCIR entry (FFIR category: friendly force degradation) routed to the commander queue. A Red entry always names the decision being requested: reprioritize, degrade, extend, or abort.
- A threshold crossing discovered during a drill or rehearsal is reported the same way as one discovered live.
- An Amber report is informational; the mission continues. A Red report opens a commander decision point; affected Red/Black actions hold until decided, per the readiness-to-authority rule in `maintenance-readiness-model.md` section 8.

## 4. Endurance drills: checkpoint, cache, retry, degraded mode

Long-running tasks survive interruption only if endurance mechanisms are exercised before they are needed.

| Drill | What the S4 verifies | Cadence |
| --- | --- | --- |
| Checkpoint | Every long-running task writes a resumable state snapshot at phase boundaries; the latest checkpoint actually restores | Each phase close |
| Cache | Expensive tool results are cached with a source and freshness stamp; a cache hit is used instead of a re-fetch when fresh | Each repeated tool pattern |
| Retry | Transient tool failures retry with bounded attempts and backoff; retries never re-consume a single-use approval scope | Each external tool class |
| Degraded mode | Each critical capability has a named fallback (per-asset `fallback` field) and the fallback has been executed at least once | Mission start and after any fallback change |

Drill rules:

- A checkpoint is a handoff packet in miniature: it must satisfy the same source-of-truth expectations as `knowledge-management-sop.md` handoffs.
- Retry is for transient faults only. A deterministic failure after one clean retry is treated as an outage (section 5), not retried indefinitely.
- Entering degraded mode is an S4 discretionary action when the fallback stays inside the already-approved authority scope, and a commander decision when it changes output quality, deadline, cost, or risk visible in the mission end state.
- `Research Gap`: How often checkpoint restoration should be exercised on live missions, rather than in fixtures, without wasting the budget it is meant to protect is unresolved.

## 5. Tool outage handling: two lanes

A tool outage is worked in two lanes at once. Neither lane waits for the other.

Technical lane (S4/S6 discretion):

1. Isolate the fault using the failure taxonomy in `maintenance-readiness-model.md` section 7.
2. Attempt bounded retry; check dependencies; run the asset's check command.
3. Activate the named fallback if it stays within existing authority.
4. Record the outage, actions, and result as an incident SITREP.

Command lane (escalation):

1. Assess mission impact: which tasks, phases, and approvals depend on the failed asset.
2. If the outage threatens a key task, a deadline, or the end state, raise a CCIR entry immediately, before the technical lane concludes.
3. Present the commander a decision set: continue degraded, reprioritize per `resource-priority-policy.md`, extend the deadline, or abort the affected task.
4. Record the decision as an event; if it changes mission scope, it is issued as a FRAGO.

Escalate vs degrade rule:

```text
S4 may degrade without escalation only when ALL hold:
- the fallback is named in the readiness report
- output quality remains within the mission's stated acceptance criteria
- no deadline, cost cap, or risk decision changes
- the degradation is reported in the next SITREP

Otherwise: escalate. Degrading silently to protect the schedule
is a sustainment failure, not a sustainment success.
```

## 6. Battle-rhythm integration

| Battle-rhythm point | S4 action | Output |
| --- | --- | --- |
| Mission start | Initial readiness report; budgets recorded; degraded-mode drill for critical assets | Readiness report |
| Recurring sync event | Watch cycle pass over all five classes; trend since last sync | SITREP resource block |
| Before any Red/Amber action | Confirm tool, quota, and fallback for the specific target | Approval packet input |
| Phase close | Checkpoint drill; readiness re-check; cache freshness sweep | Verification status |
| On failure event | Two-lane outage procedure (section 5) | Incident SITREP, CCIR if Red |
| AAR | Recurring shortage and outage pattern analysis | Readiness ledger and SOP update |

- `Application`: The S4 speaks at the sync event through one compressed resource block, not a running commentary. The CoS integrates it into the decision packet only when a threshold or trend demands a decision.
- `Research Gap`: The right sync cadence for very short missions, where a full watch pass may cost more than it protects, needs measurement.

## 7. Prompt guard

```text
S4 sustainment check before continuing execution.
1. Where is each resource class now: tokens, time, quota, tool health, context?
2. Did any class cross Amber or Red since the last check? If Red, which commander decision is requested?
3. Does a current, restorable checkpoint exist for every long-running task?
4. If the next action's tool failed right now, what is the fallback, and is it within existing authority?
5. Is any degradation currently active that has not been reported?
```

## 8. Source anchors

- ADP 4-0, Sustainment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796
- JP 4-0, Joint Logistics: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/
- JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf

## 9. Implementation Candidates

schema:

- `resource-watch-report.schema.json`
- `sustainment-incident-sitrep.schema.json`
- `checkpoint-manifest.schema.json`

prototype:

- `resource-budget-checker.js`
- `checkpoint-drill-runner.js`
- `tool-outage-router.js`
- `run-sustainment-sop-fixtures.js`
