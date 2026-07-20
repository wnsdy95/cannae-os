# Event Sourcing Model

## 0. Purpose

This document defines the event model for implementing a military-style LLM runtime using the event-sourcing approach.

A basic SQL model is good for querying current state. Event sourcing is good for tracking "what order was given when, and what report or approval changed the state." In military-style command and control, history and decision context matter, so the event log becomes the core audit material.

## 1. Core Principles

| Principle | Description |
| --- | --- |
| Append-only | Events are appended, never modified |
| Mission-scoped | Every event has a mission_id |
| Decision-linked | Approvals/rejections/FRAGOs are linked to a decision point |
| Replayable | Replaying events can restore the current state |
| Auditable | Who, when, and why an action was executed must be traceable |

## 2. Event Envelope

```json
{
  "event_id": "EVT-001",
  "mission_id": "M-DEMO-001",
  "event_type": "ToolRequestCreated",
  "actor": "S3",
  "timestamp": "2026-06-18T11:20:00+09:00",
  "causation_id": "T-DEMO-001",
  "correlation_id": "OPORD-DEMO-001",
  "payload": {}
}
```

## 3. Event Types

| Event | Meaning |
| --- | --- |
| MissionCreated | Mission intake completed |
| OPORDCreated | Operations order created |
| OPORDValidated | Validator result generated |
| TaskOrderIssued | Subordinate task issued |
| ToolRequestCreated | Tool request created |
| PolicyDecisionMade | ROE determination made |
| ApprovalRequested | Approval requested |
| ApprovalGranted | Approval granted |
| ApprovalRejected | Approval rejected |
| ApprovalConsumed | A scoped approval was consumed by an actual execution |
| ApprovalRevoked | Approval revoked |
| ApprovalRenewed | Approval validity period extended |
| ApprovalDelegated | Limited approval authority delegated |
| ApprovalDelegationTerminated | Approval authority delegation revoked or expired |
| ReleaseGateDecided | Final release gate decision combining execution authority and information disclosure authority |
| ToolExecuted | Tool executed |
| ToolBlocked | Tool blocked |
| SITREPIssued | Situation report issued |
| FRAGOIssued | Fragmentary order (change order) issued |
| EvidenceRecorded | Source/claim recorded |
| RiskRaised | Risk escalated |
| AARIssued | After-action review issued |
| ReadinessUpdated | Readiness updated |

## 4. Projection Tables

Projections are built from the event log for query performance.

| Projection | Source events |
| --- | --- |
| mission_current_state | MissionCreated, OPORDCreated, SITREPIssued, AARIssued |
| pending_approvals | ApprovalRequested, ApprovalGranted, ApprovalRejected, ApprovalConsumed, ApprovalRevoked, ApprovalRenewed |
| authority_delegations | ApprovalDelegated, ApprovalDelegationTerminated |
| authority_delegation_dashboard | ApprovalDelegated, ApprovalDelegationTerminated |
| release_gate_decisions | ReleaseGateDecided |
| release_gate_dashboard | ReleaseGateDecided |
| active_risks | RiskRaised, AARIssued |
| tool_audit | ToolRequestCreated, PolicyDecisionMade, ToolExecuted, ToolBlocked |
| evidence_index | EvidenceRecorded |
| readiness_current | ReadinessUpdated |

## 5. Command vs Event

Command:

```text
RequestToolExecution
```

Event:

```text
ToolRequestCreated
PolicyDecisionMade
ToolBlocked
```

A command can be rejected. An event is a fact that has already occurred.

## 6. Red Action Flow

```text
RequestToolExecution
-> ToolRequestCreated
-> PolicyDecisionMade(Red)
-> ApprovalRequested
-> ToolBlocked(pending approval)
```

After approval:

```text
ApprovalGranted
-> ApprovalConsumed
-> ToolExecuted
-> SITREPIssued
```

After rejection:

```text
ApprovalRejected
-> FRAGOIssued(alternative path)
```

## 7. AAR and Learning Flow

```text
AARIssued
-> RiskRaised or RiskClosed
-> ReadinessUpdated
-> SOPUpdateRecommended
```

## 8. Replay Rules

State restoration:

1. Sort events by mission_id in chronological order.
2. Create the initial state with MissionCreated.
3. Set current_order with OPORDCreated.
4. Update the task list with TaskOrderIssued.
5. Update tool state with PolicyDecisionMade and Approval events.
6. Block approval reuse with ApprovalConsumed.
7. Extend approval expiry with ApprovalRenewed, but block scope expansion.
8. Update the limited approval authority projection with ApprovalDelegated.
9. Mark delegated authority as revoked or expired with ApprovalDelegationTerminated.
10. Record the final allow/block decision for final/external output with ReleaseGateDecided.
11. Update the mission timeline with SITREP/FRAGO/AAR.

## 9. Approval Consumption Rules

`ApprovalGranted` is not yet an execution. An `ApprovalConsumed` event is recorded when an actual tool action is executed within the scope of the approval.

Rules:

- Link `approval_scope_id` and `approval_request_id`.
- Mission, actor, action, tool, and target must match the approval scope.
- `consumed_at` must fall within the approval window.
- For `approve_once`, `execution_count_after` must be exactly 1.
- If execution has occurred, `approval_status_after` must be `consumed`.
- Without evidence, AAR and audit are impossible, so the action is not recognized as an execution event.

Implementation links:

- `schema-files/approval-consumption-event.schema.json`
- `approval-consumption-runner.js`
- `approval-consumption-fixtures/`

## 10. Approval Revocation Rules

`ApprovalRevoked` is an event that cancels an active approval that has not yet been executed. An attempt to cancel after `ApprovalConsumed` has already occurred is not a revocation and must be handled as an AAR, rollback, or FRAGO.

Rules:

- Link `approval_scope_id` and `approval_request_id`.
- `approval_status_before` and `scope_snapshot.status_before` must be `active`.
- `revocation_authority` must match the authority that granted the approval.
- Action, tool, and target must match the approval scope.
- `revoked_at` must fall within the approval window.
- `approval_status_after` must be `revoked`.
- A revocation requiring notification leaves `notified_roles`.
- Without reason and evidence, it is not recognized as an audit event.

Implementation links:

- `schema-files/approval-revocation-event.schema.json`
- `approval-revocation-runner.js`
- `approval-revocation-fixtures/`

## 11. Approval Renewal Rules

`ApprovalRenewed` is an event that only extends the validity period of an active approval. Changing action, tool, target, granted_to, or max execution requires a new approval or FRAGO rather than a renewal.

Rules:

- Link `approval_scope_id` and `approval_request_id`.
- `approval_status_before` and `scope_snapshot.status_before` must be `active`.
- `renewal_authority` must match the authority that granted the approval.
- Action, tool, and target must match the approval scope.
- `renewed_at` must fall within the existing approval window.
- `new_expires_at` must come after the existing `previous_expires_at`.
- `max_executions_after` cannot increase the existing max execution.
- `approve_once` renewal is only possible for an approval that has not yet been executed.
- A renewal requiring notification leaves `notified_roles`.
- Without reason and evidence, it is not recognized as an audit event.

Implementation links:

- `schema-files/approval-renewal-event.schema.json`
- `approval-renewal-runner.js`
- `approval-renewal-fixtures/`

## 12. Approval Delegation Rules

`ApprovalDelegated` is an event that limitedly delegates part of the Commander's approval authority. Delegation is only valid within existing approval-required rules of the authority matrix, and Red/Black, high/critical residual risk, restricted release, and subdelegation remain Commander-retained.

Rules:

- `authority_matrix_id` must match the mission.
- `delegator` and `actor` must be the Commander.
- A delegatee cannot approve their own role.
- The delegation scope must match the task/tool/target/role of the existing approval-required authority rule.
- `max_roe_class` allows only Amber or lower.
- `max_residual_risk` allows only medium or lower.
- Duration and an approval count limit must be present.
- Retained authorities and restricted context guards must be specified.
- Sensitive context must retain a release review.
- Backbrief, post-action evidence, notification, reason, and evidence must be present.

Implementation links:

- `schema-files/approval-delegation-event.schema.json`
- `approval-delegation-runner.js`
- `approval-delegation-fixtures/`

## 13. Approval Delegation Termination Rules

`ApprovalDelegationTerminated` is an event that terminates delegated approval authority. In military-style authority delegation, termination is more important than creation. Without a termination event, a subordinate staff officer or subordinate agent could mistakenly believe they still hold an expired authority.

Rules:

- `delegation_event_id` must point to the original `ApprovalDelegated` event.
- The mission, authority matrix, delegator, and delegatee of the original delegation and the termination event must match.
- The delegation status before termination must be `active`.
- `termination_kind=revoked` must be performed by the Commander within the active window.
- `termination_kind=expired` may be recorded as a projection by `RECORDER` or the termination authority after expiry.
- `delegation_status_after` must match `termination_kind`.
- The delegation snapshot must preserve the task/action/tool/target/risk/time limit/retained authority/context guardrail/control flag identically to the original.
- Without reason, evidence, and notification, it is not recognized as an audit event.

Implementation links:

- `schema-files/approval-delegation-revocation-event.schema.json`
- `approval-delegation-revocation-runner.js`
- `approval-delegation-revocation-fixtures/`
- `authority-delegation-projection-runner.js`
- `dashboard-ui-prototype/authority-delegation-projection-state.json`

## 14. Release Gate Decision Rules

`ReleaseGateDecided` is the final decision event that combines execution approval and information disclosure approval. Even if a Red action such as a production deploy can be executed with scoped approval and risk acceptance, if the final output or external tool payload contains sensitive information, it cannot go out without a separate release review.

Rules:

- The event must specify the tool request and mission.
- The authority snapshot must preserve the approval/risk acceptance required/valid state.
- The release snapshot must preserve review required/valid, target, review id, and finding count.
- If the authority gate is blocked, the final decision must be `blocked_pending_authority` or `prohibit` even if the release review is valid.
- If the authority gate is allowed and the release review is required but invalid/missing, the final decision must be `blocked_pending_release_review`.
- `allow_scoped_execution_and_release` is only possible when both the authority gate and the release review are valid.
- A blocked decision must leave reasons, and every release gate decision must leave evidence.

Implementation links:

- `schema-files/release-gate-decision-event.schema.json`
- `release-gate-decision-runner.js`
- `release-gate-decision-fixtures/`
- `release-gate-dashboard-runner.js`
- `dashboard-ui-prototype/release-gate-dashboard-state.json`

## 15. Related Documents

- `data-model.sql.md`
- `reference-architecture.md`
- `runtime-demo-payloads/README.md`
- `policy-engine-rules.md`
- `agent-runtime-playbook.md`
