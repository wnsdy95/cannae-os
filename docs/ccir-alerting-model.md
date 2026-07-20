# CCIR Alerting Model

## 0. Purpose

CCIR stands for commander critical information requirements. Not all information warrants reporting. Only information that changes the commander's decision is a priority for reporting.

Without CCIR in LLM operations, the following problems occur.

- Agents over-report trivial progress updates.
- Approvals, risks, and uncertainties end up surfacing late.
- The dashboard becomes a log viewer instead of a decision-making tool.

This document converts PIR, FFIR, EEFI, and decision points into alert routing rules.

## 1. CCIR classification

| Type | Military meaning | LLM runtime meaning | Example |
| --- | --- | --- | --- |
| PIR | Priority intelligence requirement. Decision-relevant information about the enemy/environment/situation | Information needed for research or external fact verification | Whether a source is official, whether the latest policy has changed |
| FFIR | Friendly force information requirement. Mission capability and resource status | tool, token, file, test, agent readiness issues | validator failure, API quota shortage |
| EEFI | Essential elements of friendly information requiring protection | Data that must never be exposed and context-sharing restrictions | secret, credential, private user data |
| Decision Point | The moment a commander's decision is required | approval, priority, scope, risk acceptance | Red tool action, FRAGO required |

## 2. Alert severity

| Severity | Condition | action |
| --- | --- | --- |
| Info | Logging is needed but decision impact is low | event log entry |
| Watch | Requires tracking, no decision needed yet | dashboard watch list |
| Amber | A decision may be needed, limited risk | SITREP or decision packet draft |
| Red | Execution prohibited before approval | approval request and block |
| Black | Prohibited or a protection violation | reject, suppress output, incident AAR |

## 3. Routing matrix

| Alert type | Primary route | Secondary route | Output |
| --- | --- | --- | --- |
| PIR | S2 -> CoS | Source Review WG | evidence packet |
| FFIR | S3/S4/S6 -> CoS | Current Ops Sync | SITREP, resource plan |
| EEFI | S6/Protection -> Commander | Red Team | suppression, incident record |
| Decision Point | CoS -> Commander | Red Team/Evaluator | approval, FRAGO, reject |

Rules:

- EEFI is both an information requirement and something to be protected. Even when reporting on it, the raw sensitive content must not be repeatedly exposed.
- Red alerts must block automatic execution.
- For Amber alerts, a judgment call is made on whether to escalate directly to the commander or have the CoS bundle it into a packet.
- Info/Watch items are not over-reported; they are left only in the dashboard projection.

## 4. Alert object

```json
{
  "alert_id": "ALERT-DEMO-001",
  "mission_id": "M-DEMO-001",
  "type": "DECISION_POINT",
  "severity": "Red",
  "source_event_id": "EVT-DEMO-008",
  "owner": "COS",
  "title": "deploy_production blocked",
  "why_it_matters": "Production deployment changes external state and requires explicit approval.",
  "recommended_route": "Commander Board",
  "required_decision": "Approve once, revise, or reject.",
  "deadline": "before tool execution",
  "sensitive": false,
  "status": "open"
}
```

## 5. Detection rules

| Rule | Condition | Alert |
| --- | --- | --- |
| Red tool request | `roe_class = Red` and no approved scope | Decision Point, Red |
| Black action | `roe_class = Black` or prohibited target/action | EEFI/Decision Point, Black |
| Validator failure | schema or semantic validation error | FFIR, Amber |
| Critical validator failure | missing intent/authority/approval boundary | FFIR/Decision Point, Red |
| Source uncertainty | source reliability below threshold | PIR, Amber |
| Secret pattern | secret/token/private key/password in output or target | EEFI, Black |
| Scope drift | task no longer fits OPORD intent | Decision Point, Amber/Red |
| Context handoff needed | long-running task or compaction risk | FFIR, Watch |
| Readiness low | agent readiness U/X for requested autonomy | FFIR/Decision Point, Amber |

## 6. SITREP, approval request, FRAGO branching

| Situation | Output |
| --- | --- |
| Only a status update is needed | SITREP |
| Approval is needed for tool execution | Approval Request |
| A change to mission scope, priority, or authority | FRAGO |
| Verification of a source claim is needed | Evidence Review Packet |
| Risk control failure | Incident SITREP + AAR |
| A recurring problem | SOP update request |

Determination:

- If the question is "Is it okay to execute this?" -> approval request.
- If the question is "Has the mission changed?" -> FRAGO.
- If the question is "What is the current status?" -> SITREP.
- If the question is "Can this claim be trusted?" -> evidence review.

## 7. Dashboard projection

The dashboard divides alerts into the following panels.

| Panel | Display condition |
| --- | --- |
| Approval Queue | Red decision point, pending approval |
| CCIR Alerts | Amber or higher among PIR/FFIR/EEFI/Decision Point |
| Watch List | Watch severity, long-running risk |
| Evidence Review | source reliability issue, interpretation risk |
| Current Ops | blocked task, failed check, degraded resource |
| Protection | EEFI, sensitive data, context releasability issue |

Prohibited from display:

- Raw EEFI content.
- Credentials, tokens, private keys.
- Chain of thought longer than necessary.
- Unsourced assertions.

## 8. Prompt rule

```text
Before reporting, classify each item as CCIR.
- PIR: external/situational information needed for a decision
- FFIR: mission capability, tool, test, resource issues
- EEFI: information that must be protected
- DECISION_POINT: commander approval or FRAGO required

Summarize or omit detailed progress that does not fall under CCIR.
Do not execute Red or Black alerts; stop with an approval/request or reject.
```

## 9. Implementation candidates

schema:

- `ccir-alert.schema.json`
- `decision-packet.schema.json`

prototype:

- `alert-router.js`: reads the event log and policy decisions to generate the alert projection.
- `ccir-linter.js`: fails any blocked item in a SITREP that lacks a CCIR classification.
- Replace the dashboard `ccir_alerts` panel with event-derived alerts.

## 10. Source anchors

- Joint Staff CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507

## 11. Current-stage conclusion

The goal of CCIR alerting is not an increase in reporting volume but an improvement in decision quality.

In LLM runtime, the reporting rule is condensed into the following single sentence.

> Information that does not affect the commander's decision, mission capability, information requiring protection, or actions requiring approval is not an alert.
