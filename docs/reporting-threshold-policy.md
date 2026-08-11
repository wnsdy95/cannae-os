# Reporting Threshold Policy

## 0. Purpose

This document fixes the rules for when an agent must report, when it may stay silent, and when it must not report.

It extends `ccir-alerting-model.md`, which defines what becomes an alert and how it routes, and `agent-battle-rhythm.md`, which defines the scheduled reporting events. This document supplies the missing layer between them: the threshold policy that decides whether a given piece of information crosses into reporting at all, at what alert level, and on what timing.

The problem this solves in LLM operations:

- Agents equate reporting with diligence and flood the commander with completion notices.
- Every report competes for the same attention, so decision-relevant reports arrive with the same weight as trivia.
- Agents that are unsure whether to report choose to report, which inverts the CCIR filter.

Core principle:

```text
CCIR is not "something worth mentioning" but "information that changes a decision."
A report that changes no decision is a log entry, not a report.
```

## 1. Doctrinal Basis

- `Claim`: The Joint Staff CCIR Focus Paper defines CCIRs as information requirements the commander identifies as critical to timely decision making; the CCIR list is kept short and tied to anticipated decisions (Joint Staff CCIR Focus Paper).
- `Claim`: ADP 6-0 requires subordinates to report deviations from the plan and information affecting the commander's decisions, while mission command otherwise delegates execution detail rather than demanding continuous narration (ADP 6-0, Mission Command).
- `Claim`: ADP 5-0 embeds reporting in the assess activity of the operations process: reporting exists to update the common understanding against which plans are adjusted, not as an end in itself (ADP 5-0, The Operations Process).
- `Claim`: The Knowledge and Information Management Focus Paper (https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf) treats information overload as a command-and-control failure mode and makes filtering to decision relevance a staff duty.
- `Interpretation`: The military default of "exception reporting against a briefed plan" translates directly: an agent operating inside an approved order with no deviation has, by default, nothing to report upward. Its progress is visible via the COP projection (`common-operational-picture-state.md`), not via messages.
- `Application`: Reporting obligations below are enforced as routing rules: the alert router and CoS layer route non-qualifying reports to the event log instead of the commander queue.
- `Research Gap`: Doctrine specifies negative reporting ("nothing to report") for some scheduled reports; how much negative reporting an LLM runtime needs to distinguish "silent and healthy" from "silent and dead" is only partially resolved by the heartbeat rule in section 5.

## 2. Reporting Obligations

### 2.1 Must Report

An agent must report, without waiting for a scheduled event, when any of the following holds:

| Condition | CCIR class | Why it changes a decision |
| --- | --- | --- |
| A CCIR on the mission's CCIR list is answered, fully or partly | PIR/FFIR | The list exists because a decision hangs on it |
| Execution requires an approval not yet granted | Decision Point | The commander must release or refuse |
| The task no longer fits the order's intent or scope | Decision Point | Continuing would be unauthorized action |
| A capability the plan assumes is lost or degraded | FFIR | The plan may need revision or a FRAGO |
| Protected information is exposed or nearly exposed | EEFI | Protection response and release review are needed |
| A source conflict undermines a conclusion already reported | PIR | A prior basis for decision is now suspect |
| A stop condition or Red/Black boundary is reached | Decision Point | Execution must halt pending decision |
| The agent cannot complete the mission as ordered | FFIR/Decision Point | The commander must re-task, reinforce, or accept |

### 2.2 May Stay Silent

Silence is the correct behavior, not a failure to report, when all of the following hold:

- Execution is inside the approved order, intent, and authority boundary.
- No CCIR list item is touched.
- Progress is observable through the COP projection (task status, readiness, evidence links).
- The next scheduled battle-rhythm event will arrive before any pending decision needs the information.

In that state, the agent emits events (which update the COP) and says nothing.

### 2.3 Must Not Report

Reporting is prohibited, not merely optional, in these cases:

| Prohibited report | Correct handling |
| --- | --- |
| Progress narration with no state change ("still working") | Nothing; the COP already shows the task in progress |
| Completion notice for a routine subtask inside an approved order | Event log entry; see section 6 |
| Raw EEFI content quoted "for context" | Existence-only EEFI alert per `ccir-alerting-model.md` |
| Speculation not tied to a source or event | Running estimate entry, marked as assessment |
| A duplicate of an already-open alert | Update the open alert's status instead |
| Reports crafted to demonstrate activity or diligence | None; diligence is measured at assessment and AAR |

- `Interpretation`: "Must not report" is the piece LLM agents miss most. In doctrine, flooding the net is a discipline failure; in an LLM runtime it must be an enforced routing outcome, because politeness-trained models over-report by default.

## 3. Exception-First Reporting

The reporting order of precedence is:

```text
1. Exceptions: deviation, blocker, boundary contact, protection issue
2. CCIR answers: information the CCIR list is waiting for
3. Decision support: options ready for a pending decision point
4. Scheduled status: SITREP at battle-rhythm events
5. Completion: only at mission or phase boundaries
```

Rules:

- An exception is never held back to be bundled into a scheduled SITREP. Exceptions interrupt; status waits.
- A completion report never carries an exception inside it. If something went wrong, the exception is reported first as its own item.
- When an agent has both an exception and progress to report, the exception is sent alone; the progress goes to the COP as events.
- `Application`: The runner enforcing this treats any SITREP containing a blocked item without a CCIR classification as invalid, matching the `ccir-linter` candidate in `ccir-alerting-model.md`.

## 4. CCIR-to-Alert-Level Thresholds

`ccir-alerting-model.md` defines the severity ladder (Info, Watch, Amber, Red, Black) and the routing matrix. This section fixes the thresholds that decide which severity a PIR/FFIR/EEFI observation enters at.

### 4.1 PIR thresholds

| Threshold | Severity |
| --- | --- |
| Background information; no listed PIR touched | Info (log only) |
| Weak or partial indicator against a listed PIR; low confidence | Watch |
| A listed PIR answered at usable confidence, or a source conflict affecting a reported conclusion | Amber |
| A PIR answer that invalidates an assumption the current order depends on | Red |

### 4.2 FFIR thresholds

| Threshold | Severity |
| --- | --- |
| Routine resource consumption within plan | Info (log only) |
| Degradation with workaround in place; no plan impact yet | Watch |
| Capability loss that changes schedule, quality, or scope; validator failure | Amber |
| Capability loss that halts the mission, or missing intent/authority/approval boundary | Red |

### 4.3 EEFI thresholds

| Threshold | Severity |
| --- | --- |
| Handling-rule question with no exposure | Watch |
| Sensitive material encountered and correctly contained; near-miss | Amber |
| Exposure occurred or is imminent; secret pattern detected in output or target | Black |

EEFI has no Info tier: anything touching protected information is at least tracked.

### 4.4 Decision Point thresholds

Decision points are not thresholded by information quality but by authority: any action beyond the agent's authority is Red before approval, and any prohibited action is Black, regardless of how confident the agent is. This restates, unchanged, the detection rules of `ccir-alerting-model.md`.

- `Interpretation`: Thresholds convert the doctrinal phrase "critical to decision making" into machine-checkable entry conditions. The severity is a property of decision impact, never of effort spent or of how interesting the finding is.
- `Research Gap`: Numeric confidence cutoffs for "usable confidence" on PIR answers are not yet standardized across the source reliability rubric and the intelligence assessment schema.

## 5. Periodic Versus Event-Driven Reporting

Both modes exist; event-driven reporting dominates.

| Mode | Trigger | Vehicle | Audience |
| --- | --- | --- | --- |
| Event-driven | Threshold crossing in section 4 | CCIR alert, decision packet | Route per `ccir-alerting-model.md` routing matrix |
| Periodic | Battle-rhythm event per `agent-battle-rhythm.md` | SITREP | CoS integration, commander at decision events |

Periodic reporting rules:

- The SITREP cadence follows the task-size table in `agent-battle-rhythm.md`; it is set at mission start, not improvised.
- A periodic SITREP whose every field is unchanged since the last one is replaced by a one-line heartbeat event in the log. Unchanged status is not re-narrated.
- Periodic reporting is **waived** when all of the following hold:
  1. The mission is short-rhythm (under the SITREP threshold in `agent-battle-rhythm.md`).
  2. The COP projection for the mission is `current`, so status is observable without a report.
  3. No open Amber-or-higher alert belongs to the agent.
  4. The waiver itself was granted at mission start or by the CoS during execution and is recorded as an event.
- A waiver never covers event-driven reporting. Exceptions report immediately, waiver or not.
- Periodic reporting resumes automatically the moment any waiver condition fails, including the COP going `stale` or `unavailable` — silence is only permitted while it is distinguishable from failure.

- `Claim`: Battle rhythm in joint headquarters practice exists to schedule the commander's decision touchpoints, not to maximize meeting count; reports feed scheduled decision events (ADP 5-0, The Operations Process; Joint Staff CCIR Focus Paper).
- `Application`: The waiver is a first-class event so that "why was this agent silent" is always answerable at AAR from the log alone.

## 6. Completion-Report Suppression

Completion reports are the largest source of noise, so they are suppressed by default.

| Completion of | Handling |
| --- | --- |
| A subtask inside an approved order | Event log only; COP task status updates |
| A task another agent is waiting on | Event log plus direct notification to the waiting agent, not the commander |
| A phase named in the order | SITREP at the next battle-rhythm event |
| The mission | Final report: one per mission, containing verification results and residual risk |
| A task that ended differently than ordered | Not a completion report at all: an exception report first |

Rules:

- A completion report may only be sent upward if the completion itself is a decision trigger (for example, completion releases a held approval or opens a decision window). Then it is a Decision Point alert, not a completion notice.
- "Done" without verification evidence is not a completion; it is an unverified claim and stays in the log until verification attaches.
- The final mission report is exempt from suppression: exactly one is always produced, because closeout, readiness update, and AAR hang from it.

- `Interpretation`: The military habit being copied is that a unit executing its assigned task to plan does not radio higher after every bound; higher headquarters tracks progress on the COP. Completion becomes reportable only when someone above must now act.

## 7. Escalation Timing

Three timing lanes, chosen by decision cost of delay:

| Lane | When | Applies to |
| --- | --- | --- |
| Immediately | The decision degrades or the risk grows while waiting | Red and Black alerts; EEFI exposure; stop-condition contact; any answered PIR marked time-sensitive |
| Next battle-rhythm event | The decision can wait without degrading | Amber alerts by default; answered PIRs without time sensitivity; phase completions |
| AAR | No live decision depends on it; learning value only | Watch items that never escalated; process friction; near-miss patterns; SOP improvement candidates |

Rules:

- The reporter does not downgrade a lane to avoid interrupting. If the threshold says immediate, it interrupts.
- The CoS may upgrade Amber to immediate when bundling it into a packet would cross a decision deadline; this upgrade is recorded on the alert.
- Deferring an item to AAR requires that it has no open decision link. An item with a pending decision cannot be parked in the AAR lane.
- Every escalation carries its lane on the alert object, so latency between threshold crossing and commander sight is measurable at AAR.

## 8. Anti-Noise Rules

The filter that keeps the commander queue decision-shaped:

1. A report not tied to a CCIR or an open decision is routed to the event log, not the commander. This is a routing action, not a rejection: the information is preserved, indexed, and visible in the COP where relevant.
2. The commander queue accepts only: CCIR alerts at their routed severity, decision packets, and the final mission report.
3. The CoS compresses, per `agent-battle-rhythm.md`: multiple related Amber items become one decision packet, not serial interruptions.
4. Repeating an unacknowledged report is allowed once, at the next lane boundary, with a reference to the original; beyond that it is an escalation decision for the CoS, not a louder repeat.
5. Alert inflation is an AAR finding: if an agent's Red alerts routinely turn out to require no decision, its thresholds are recalibrated, because false urgency erodes the meaning of the ladder.
6. Silence inflation is equally an AAR finding: a decision that arrived late because a threshold was set too high recalibrates in the other direction.

- `Interpretation`: The CCIR system fails in two symmetric ways: everything reported (the filter inverts) or nothing reported (the filter becomes a wall). Both are threshold defects, and both are corrected at AAR by adjusting thresholds, not by exhorting agents to "use judgment."
- `Research Gap`: A quantitative noise metric for the commander queue (for example, fraction of queue items that produced a decision) is a candidate evaluation metric not yet defined in `evaluation-metrics.md`.

## 9. Source Anchors

- Joint Staff CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- Knowledge and Information Management Focus Paper (Joint Staff J7): https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf

## 10. Implementation Candidates

- `schema-files/reporting-threshold.schema.json`
- `reporting-threshold-gate.js`
- `run-reporting-threshold-fixtures.js`
- `completion-report-suppressor.js`
- `periodic-report-waiver-runner.js`
- `commander-queue-noise-report.js`
