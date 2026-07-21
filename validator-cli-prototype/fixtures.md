# Validator CLI Fixture Expectations

## Current Fixtures

| Payload | Type | Expected |
| --- | --- | --- |
| `sample-payloads/valid-mission.json` | `mission` | pass |
| `sample-payloads/invalid-mission-missing-intent.json` | `mission` | fail with `MISSING_REQUIRED` and `MISSING_INTENT` |
| `sample-payloads/invalid-mission-extra-field.json` | `mission` | fail with `ADDITIONAL_PROPERTY` and `can_execute: false` |
| `sample-payloads/valid-tool-request-green.json` | `tool-request` | pass |
| `sample-payloads/invalid-tool-request-red-without-approval.json` | `tool-request` | fail with `RED_WITHOUT_APPROVAL` |
| `sample-payloads/valid-approval-request.json` | `approval-request` | pass |
| `sample-payloads/valid-sitrep.json` | `sitrep` | pass |
| `sample-payloads/valid-evidence.json` | `evidence` | pass |
| `sample-payloads/valid-aar.json` | `aar` | pass |
| `sample-payloads/valid-authority-matrix.json` | `authority-matrix` | pass |
| `sample-payloads/invalid-authority-matrix-red-without-approver.json` | `authority-matrix` | fail with `DEFAULT_ALLOW_TOO_BROAD`, `RED_NOT_APPROVAL_REQUIRED`, `RED_WITHOUT_APPROVAL_AUTHORITY`, and `HIGH_RISK_ALLOW` |
| `sample-payloads/valid-decision-packet.json` | `decision-packet` | pass |
| `sample-payloads/invalid-decision-packet-no-options.json` | `decision-packet` | fail with `DECISION_PACKET_WITHOUT_OPTIONS`, `RECOMMENDATION_NOT_IN_OPTIONS`, `AUTHORITY_REQUIRED_EMPTY`, and `DECISION_WITHOUT_EVIDENCE` |
| `sample-payloads/valid-working-group.json` | `working-group` | pass |
| `sample-payloads/invalid-working-group-no-disband.json` | `working-group` | fail with `CHAIR_NOT_IN_PARTICIPANTS`, `WORKING_GROUP_WITHOUT_DELIVERABLE`, and `NO_DISBAND_CONDITION` |
| `sample-payloads/valid-sof-tf-charter.json` | `sof-tf-charter` | pass |
| `sample-payloads/invalid-sof-tf-charter-unbounded.json` | `sof-tf-charter` | fail with missing trigger, retained authority, independent review, recorder, source map, release review, fallback, and abort controls |
| `sample-payloads/valid-department-collaboration-charter.json` | `department-collaboration-charter` | pass |
| `sample-payloads/invalid-department-collaboration-charter-siloed.json` | `department-collaboration-charter` | fail with missing command/recorder, missing source of truth, unknown dependency, missing outputs, missing liaison, low conflict authority, missing source map, and missing EEFI controls |
| `sample-payloads/valid-force-structure-change-order.json` | `force-structure-change-order` | pass |
| `sample-payloads/invalid-force-structure-change-order-unjustified.json` | `force-structure-change-order` | fail with missing evidence, alternatives, DOTMLPF-P, Commander approval, maintainer, readiness evidence, handoff, sunset, documentation, and MOE controls |
| `sample-payloads/valid-document-access-manifest.json` | `document-access-manifest` | pass |
| `sample-payloads/invalid-document-access-manifest-overbroad.json` | `document-access-manifest` | fail with missing need-to-know, no-bulk-read, audit, approval exception, explicit paths, allowed roles, duties, readable required docs, restricted raw block, and escalation controls |
| `sample-payloads/valid-ccir-alert.json` | `ccir-alert` | pass |
| `sample-payloads/invalid-ccir-alert-red-without-decision.json` | `ccir-alert` | fail with `HIGH_SEVERITY_ALERT_NOT_BLOCKING` and `HIGH_SEVERITY_WITHOUT_DECISION` |
| `sample-payloads/valid-handoff-packet.json` | `handoff-packet` | pass |
| `sample-payloads/invalid-handoff-packet-blocked-without-decision.json` | `handoff-packet` | fail with `HANDOFF_WITHOUT_SOURCE_OF_TRUTH`, `BLOCKED_WITHOUT_PENDING_DECISION`, and `HANDOFF_WITHOUT_PROHIBITIONS` |
| `sample-payloads/valid-continuity-plan.json` | `continuity-plan` | pass |
| `sample-payloads/invalid-continuity-plan-single-point-failure.json` | `continuity-plan` | fail with single-successor, self-successor, missing handoff, missing vital records, unbounded authority, bad rotation, and missing degraded mode controls |
| `sample-payloads/valid-context-item.json` | `context-item` | pass |
| `sample-payloads/invalid-context-item-eefi-final.json` | `context-item` | fail with `EEFI_RELEASE_TO_FINAL`, `RESTRICTED_RELEASE_TO_FINAL`, and `RAW_EEFI_PRESENT` |
| `sample-payloads/valid-release-review.json` | `release-review` | pass |
| `sample-payloads/invalid-release-review-eefi-approved.json` | `release-review` | fail with `NO_RELEASE_CONSTRAINTS`, `RESTRICTED_OR_EEFI_RAW_RELEASE`, and `NON_PUBLIC_RAW_FINAL_OUTPUT` |
| `sample-payloads/valid-release-gate-decision-event.json` | `release-gate-decision-event` | pass |
| `sample-payloads/invalid-release-gate-decision-event-missing-review.json` | `release-gate-decision-event` | fail with `RELEASE_GATE_RELEASE_BLOCK_NOT_FINAL`, `RELEASE_GATE_ALLOW_WITH_FAILED_RELEASE_REVIEW`, and `RELEASE_GATE_WITHOUT_EVIDENCE` |
| `sample-payloads/valid-maintenance-readiness.json` | `maintenance-readiness` | pass |
| `sample-payloads/invalid-maintenance-readiness-unavailable-no-fallback.json` | `maintenance-readiness` | fail with `MIN_LENGTH`, `OVERALL_FULLY_WITH_BAD_ASSETS`, `FAILED_ASSET_WITHOUT_FALLBACK`, `UNAVAILABLE_WITHOUT_CCIR`, and `BAD_ASSETS_WITHOUT_COMMANDER_DECISION_FLAG` |
| `sample-payloads/valid-backbrief.json` | `backbrief` | pass |
| `sample-payloads/invalid-backbrief-no-stop-conditions.json` | `backbrief` | fail with `BACKBRIEF_WITHOUT_ACTIONS`, `BACKBRIEF_WITHOUT_STOP_CONDITIONS`, `BACKBRIEF_WITHOUT_RISK_CONTROLS`, `LOW_CONFIDENCE_WITHOUT_CLARIFICATION`, and `DECISION_NEEDED_WITHOUT_QUESTION` |
| `sample-payloads/valid-rehearsal.json` | `rehearsal` | pass |
| `sample-payloads/invalid-rehearsal-execute-with-unresolved-change.json` | `rehearsal` | fail with `REHEARSAL_WITHOUT_BACKBRIEF`, `REHEARSAL_WITHOUT_SEQUENCE`, `EXECUTE_WITH_UNRESOLVED_CHANGES`, and `HIGH_FRICTION_WITHOUT_DECISION_POINT` |
| `sample-payloads/valid-approval-scope.json` | `approval-scope` | pass |
| `sample-payloads/invalid-approval-scope-no-expiry.json` | `approval-scope` | fail with `APPROVAL_WITHOUT_EXPIRY`, `APPROVE_ONCE_NOT_SINGLE_USE`, `APPROVAL_WITHOUT_ROLLBACK`, `APPROVAL_WITHOUT_EVIDENCE`, and `CONSUMED_APPROVAL_WITHOUT_CONSUMPTION_EVENT` |
| `sample-payloads/valid-approval-consumption-event.json` | `approval-consumption-event` | pass |
| `sample-payloads/invalid-approval-consumption-event-mismatch.json` | `approval-consumption-event` | fail with `APPROVAL_ALREADY_CONSUMED_OR_INACTIVE`, `APPROVAL_CONSUMPTION_TARGET_MISMATCH`, `APPROVAL_CONSUMED_OUTSIDE_WINDOW`, `APPROVE_ONCE_CONSUMPTION_COUNT_INVALID`, `EXECUTED_APPROVAL_NOT_MARKED_CONSUMED`, and `APPROVAL_CONSUMPTION_WITHOUT_EVIDENCE` |
| `sample-payloads/valid-approval-revocation-event.json` | `approval-revocation-event` | pass |
| `sample-payloads/invalid-approval-revocation-event-consumed.json` | `approval-revocation-event` | fail with `APPROVAL_REVOCATION_NOT_ACTIVE`, `APPROVAL_REVOCATION_REQUIRES_COMMANDER`, `APPROVAL_REVOCATION_AUTHORITY_MISMATCH`, `APPROVAL_REVOKED_OUTSIDE_WINDOW`, `APPROVAL_REVOCATION_NOT_MARKED_REVOKED`, `APPROVAL_REVOCATION_WITHOUT_REASON`, `APPROVAL_REVOCATION_WITHOUT_EVIDENCE`, and `APPROVAL_REVOCATION_WITHOUT_NOTIFICATION` |
| `sample-payloads/valid-approval-renewal-event.json` | `approval-renewal-event` | pass |
| `sample-payloads/invalid-approval-renewal-event-expired.json` | `approval-renewal-event` | fail with `APPROVAL_RENEWAL_NOT_ACTIVE`, `APPROVAL_RENEWAL_REQUIRES_COMMANDER`, `APPROVAL_RENEWAL_AUTHORITY_MISMATCH`, `APPROVAL_RENEWED_OUTSIDE_WINDOW`, `APPROVAL_RENEWAL_NOT_EXTENSION`, `APPROVAL_RENEWAL_EXPIRES_BEFORE_RENEWED_AT`, `APPROVAL_RENEWAL_EXPANDS_EXECUTIONS`, `APPROVE_ONCE_ALREADY_USED_BEFORE_RENEWAL`, `APPROVAL_RENEWAL_NOT_MARKED_ACTIVE`, `APPROVAL_RENEWAL_WITHOUT_REASON`, `APPROVAL_RENEWAL_WITHOUT_EVIDENCE`, and `APPROVAL_RENEWAL_WITHOUT_NOTIFICATION` |
| `sample-payloads/valid-approval-delegation-event.json` | `approval-delegation-event` | pass |
| `sample-payloads/invalid-approval-delegation-event-retained.json` | `approval-delegation-event` | fail with `DELEGATION_REQUIRES_COMMANDER`, `DELEGATEE_CANNOT_APPROVE_SELF_ROLE`, `DELEGATION_CANNOT_INCLUDE_COMMANDER_RETAINED_ROE`, `DELEGATION_CANNOT_ACCEPT_HIGH_RISK`, `DELEGATION_WITHOUT_TASK_SCOPE`, `DELEGATION_EXPIRY_NOT_AFTER_START`, `DELEGATION_WITHOUT_LIMITS`, `DELEGATION_ALLOWS_SUBDELEGATION`, `DELEGATION_WITHOUT_RETAINED_AUTHORITIES`, `DELEGATION_WITHOUT_RESTRICTED_CONTEXT_GUARD`, `DELEGATION_SENSITIVE_RELEASE_WITHOUT_REVIEW`, `DELEGATION_WITHOUT_POST_ACTION_EVIDENCE`, `DELEGATION_NOT_MARKED_ACTIVE`, `DELEGATION_WITHOUT_NOTIFICATION`, `DELEGATION_WITHOUT_REASON`, and `DELEGATION_WITHOUT_EVIDENCE` |
| `sample-payloads/valid-approval-delegation-revocation-event.json` | `approval-delegation-revocation-event` | pass |
| `sample-payloads/invalid-approval-delegation-revocation-event-staff.json` | `approval-delegation-revocation-event` | fail with `DELEGATION_TERMINATION_NOT_ACTIVE`, `DELEGATION_TERMINATION_STATUS_MISMATCH`, `DELEGATION_TERMINATION_AUTHORITY_MISMATCH`, `DELEGATION_REVOCATION_REQUIRES_COMMANDER`, `DELEGATION_REVOKED_OUTSIDE_WINDOW`, `DELEGATION_TERMINATION_WITHOUT_REASON`, `DELEGATION_TERMINATION_WITHOUT_EVIDENCE`, and `DELEGATION_TERMINATION_WITHOUT_NOTIFICATION` |
| `sample-payloads/valid-risk-acceptance.json` | `risk-acceptance` | pass |
| `sample-payloads/invalid-risk-acceptance-high-by-s3.json` | `risk-acceptance` | fail with `RISK_ACCEPTANCE_REQUIRES_COMMANDER`, `RISK_ACCEPTANCE_WITHOUT_EXPIRY`, `RISK_ACCEPTANCE_WITHOUT_CONTROLS`, `RISK_ACCEPTANCE_WITHOUT_SUPERVISION`, and `RISK_ACCEPTANCE_WITHOUT_EVIDENCE` |
| `sample-payloads/valid-self-improvement-campaign.json` | `self-improvement-campaign` | pass |
| `sample-payloads/invalid-self-improvement-campaign-ai-final-authority.json` | `self-improvement-campaign` | fail when AI claims final authority, evaluates itself, omits invariants, broadens its envelope, or omits mandatory checkpoints |
| `sample-payloads/valid-self-improvement-checkpoint.json` | `self-improvement-checkpoint` | pass |
| `sample-payloads/invalid-self-improvement-checkpoint-path-traversal.json` | `self-improvement-checkpoint` | fail with repository traversal and prohibited cross-repository externality |
| `sample-payloads/valid-self-improvement-decision.json` | `self-improvement-decision` | pass |
| `sample-payloads/invalid-self-improvement-decision-self-release.json` | `self-improvement-decision` | fail when the controller authorizes its own release |

## Next Fixtures

- OPORD missing authority.
- OPORD MOP-only.
- Black action requested.
- Blocked SITREP without escalation.
- AAR without SOP update.
- Black authority rule with approval authority.
- EEFI alert not marked sensitive.
