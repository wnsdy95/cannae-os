# Approval Scope Policy

## 0. Purpose

A Red or significant Amber action must not be handled with the single word "approved." In military-style delegation of authority, it matters who approved what, until when, under what conditions, and within what scope.

In an LLM runtime as well, approval is not a blanket permission but a scoped release.

This document standardizes approval once, constraints, expiry, rollback, and evidence requirements.

## 1. Approval principles

| Principle | Meaning | LLM application |
| --- | --- | --- |
| Specificity | The object of approval must be clear | action, tool, target, and mission/task id are required |
| Time bound | Approval must have a valid time window | expires_at or single-use |
| Conditioned | Conditions may be attached | dry-run, backup, rollback, verification |
| Non-transferable | Cannot be extended to a different action | Even for the same role, a different target requires re-approval |
| Auditable | Evidence must be retained | approval event, post-action evidence |
| Revocable | Can be revoked when necessary | FRAGO or approval cancellation |

## 2. Approval types

| Type | Meaning | Usage |
| --- | --- | --- |
| `approve_once` | Allows a single action one time | One Red tool action |
| `approve_with_constraints` | Conditional approval | dry-run first, rollback required |
| `revise` | Revise the plan and resubmit | risk/fallback/evidence insufficient |
| `reject` | Execution prohibited | Outside mission scope or excessive risk |
| `issue_frago` | Changes the mission/priority/authority itself | Requires changing the existing OPORD |

## 3. Approval object fields

```json
{
  "approval_id": "AR-DEMO-001",
  "mission_id": "M-DEMO-001",
  "tool_request_id": "TR-DEMO-002",
  "approved_by": "COMMANDER",
  "decision": "approve_with_constraints",
  "scope": {
    "action": "deploy_production",
    "tool": "deploy",
    "target": "prod.command-post-dashboard",
    "max_executions": 1,
    "valid_from": "2026-06-18T12:00:00+09:00",
    "expires_at": "2026-06-18T13:00:00+09:00"
  },
  "conditions": [
    "Rollback plan attached.",
    "Post-action verification required."
  ],
  "rollback": "Restore previous deployment artifact.",
  "evidence_required": [
    "Approval event.",
    "Execution log.",
    "Verification result."
  ]
}
```

## 4. Approval boundary

What approval does not include:

- A different target.
- A different tool.
- A different time window.
- Credential release.
- Sensitive/restricted context release.
- Repeated execution.
- A change to mission scope.

If scope changes, a new approval or FRAGO is required.

For bounded self-improvement v0.3, the verifier trust policy is also an authority boundary. Adding or reactivating a verifier, changing a public key, reducing the signature or independence-group threshold, broadening allowed repositories/origins, or extending a policy/key validity window requires a new scoped USER approval. A valid verifier signature does not approve its own trust-root change.

## 5. Red action approval flow

1. Tool request is created.
2. Policy engine classifies it as Red.
3. Execution block.
4. Approval request is created.
5. Decision packet is drafted.
6. Commander decision.
7. Approval object is created, or rejection is recorded.
8. Tool gateway verifies that scope/expiry/target/action match.
9. Evidence is recorded after execution.
10. AAR/readiness update.

## 6. Expiry and reuse

By default:

- Red approval is single-use.
- Without an expiry, it is invalid.
- After execution, approval status becomes consumed.
- A consumed approval cannot be reused.

Exceptions:

- Recurring tasks are handled via a FRAGO or an authority matrix update.
- The approval object is not duplicated for reuse.

## 7. Rollback requirement

A Red action is not approved without a rollback or compensation plan.

Required rollback items:

- Prior state.
- Recovery command or procedure.
- Time available for recovery.
- Commander decision point on failure.
- Verification method.

Actions where rollback is not possible:

- Require a higher risk acceptance authority.
- May be classified as Black in some cases.

## 8. Separation of approval and release review

Approval to execute a tool is not approval to disclose information.

Examples:

- Production deploy approval does not permit release of raw credential values.
- External API call approval must include a private data release review.
- Final output approval requires a sensitive context release review.

Therefore, `approval-request` and `release-review` are separate objects.

## 9. Validator/runner implementation

Implemented artifacts:

- `schema-files/approval-scope.schema.json`
- `schema-files/approval-consumption-event.schema.json`
- `schema-files/approval-revocation-event.schema.json`
- `schema-files/approval-renewal-event.schema.json`
- `schema-files/approval-delegation-event.schema.json`
- `schema-files/approval-delegation-revocation-event.schema.json`
- `sample-payloads/valid-approval-scope.json`
- `sample-payloads/invalid-approval-scope-no-expiry.json`
- `sample-payloads/valid-approval-consumption-event.json`
- `sample-payloads/invalid-approval-consumption-event-mismatch.json`
- `sample-payloads/valid-approval-revocation-event.json`
- `sample-payloads/invalid-approval-revocation-event-consumed.json`
- `sample-payloads/valid-approval-renewal-event.json`
- `sample-payloads/invalid-approval-renewal-event-expired.json`
- `sample-payloads/valid-approval-delegation-event.json`
- `sample-payloads/invalid-approval-delegation-event-retained.json`
- `sample-payloads/valid-approval-delegation-revocation-event.json`
- `sample-payloads/invalid-approval-delegation-revocation-event-staff.json`
- `sample-payloads/valid-release-gate-decision-event.json`
- `sample-payloads/invalid-release-gate-decision-event-missing-review.json`
- `policy-engine-authority-integration.js`
- `run-authority-integration-fixtures.js`
- `approval-consumption-runner.js`
- `run-approval-consumption-fixtures.js`
- `approval-revocation-runner.js`
- `run-approval-revocation-fixtures.js`
- `approval-renewal-runner.js`
- `run-approval-renewal-fixtures.js`
- `approval-delegation-runner.js`
- `run-approval-delegation-fixtures.js`
- `approval-delegation-revocation-runner.js`
- `run-approval-delegation-revocation-fixtures.js`
- `policy-engine-release-integration.js`
- `run-release-integration-fixtures.js`
- `release-gate-decision-runner.js`
- `run-release-gate-decision-fixtures.js`

Implemented semantic checks:

- Red approval without expiry -> fail.
- `approve_once` with `max_executions` other than 1 -> fail.
- consumed approval without consumption event -> fail.
- consumed approval reuse in integration gate -> blocked.
- consumption event must match mission, action, tool, target, actor, time window, and evidence.
- adaptive policy/authority promotion must bind the scope and consumption artifacts by manifest path/hash, use action `promote_self_improvement_candidate`, tool `autonomous-improvement-controller`, target the exact candidate ID, and set the consumption `execution_id` to the checkpoint ID.
- revocation event must target an active approval and match granting authority, scope, time window, notification, and evidence.
- renewal event must target an active approval, preserve action/tool/target/max executions, extend only expiry, and include authority/evidence/notification.
- delegation event must map to an existing approval-required authority rule and cannot delegate Red/Black, high/critical risk, restricted release, or subdelegation.
- delegation termination event must target an active delegation, preserve the source snapshot, distinguish Commander revocation from expiry projection, and notify affected roles.
- release-required execution must pass authority integration and release review independently.
- release gate decision event must preserve authority snapshot, release review snapshot, final decision, reasons, and evidence.
- Approval missing rollback for irreversible action -> fail.
- Tool approval attempts to release restricted context -> fail unless release review exists.

The self-improvement controller consumes this lifecycle directly for policy, authority, scope, and release-affecting candidates. A prose approval claim or an event already bound to another checkpoint is rejected.

## 10. Prompt guard

```text
When requesting Red/Amber approval, include the following.
1. Exact action/tool/target
2. Whether it is single-use or a recurring authorization
3. Expiry
4. Conditions
5. Rollback
6. Post-action evidence
7. Whether a separate release review is required
```

## 11. Source anchors

- Joint Staff Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf

## 12. Conclusion at the current stage

Approval is not "you may do it." Approval is a restricted authority combining action, tool, target, time, condition, rollback, and evidence.

Only by strictly enforcing approval scope in the LLM runtime can unauthorized expansion and blanket permission be prevented.
