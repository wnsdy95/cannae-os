#!/usr/bin/env node

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VALIDATOR = path.join(ROOT, "validator-cli-prototype", "validate.js");

const fixtures = [
  {
    name: "valid mission",
    file: "sample-payloads/valid-mission.json",
    type: "mission",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "missing intent mission",
    file: "sample-payloads/invalid-mission-missing-intent.json",
    type: "mission",
    exitCode: 1,
    requiredCodes: ["MISSING_REQUIRED", "MISSING_INTENT"]
  },
  {
    name: "mission with additional policy override field",
    file: "sample-payloads/invalid-mission-extra-field.json",
    type: "mission",
    exitCode: 1,
    requiredCodes: ["ADDITIONAL_PROPERTY"]
  },
  {
    name: "valid green tool request",
    file: "sample-payloads/valid-tool-request-green.json",
    type: "tool-request",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "red without approval",
    file: "sample-payloads/invalid-tool-request-red-without-approval.json",
    type: "tool-request",
    exitCode: 1,
    requiredCodes: ["RED_WITHOUT_APPROVAL"]
  },
  {
    name: "valid approval request",
    file: "sample-payloads/valid-approval-request.json",
    type: "approval-request",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "valid SITREP",
    file: "sample-payloads/valid-sitrep.json",
    type: "sitrep",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "valid evidence",
    file: "sample-payloads/valid-evidence.json",
    type: "evidence",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "valid AAR",
    file: "sample-payloads/valid-aar.json",
    type: "aar",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "valid authority matrix",
    file: "sample-payloads/valid-authority-matrix.json",
    type: "authority-matrix",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "red authority without approver",
    file: "sample-payloads/invalid-authority-matrix-red-without-approver.json",
    type: "authority-matrix",
    exitCode: 1,
    requiredCodes: ["DEFAULT_ALLOW_TOO_BROAD", "RED_NOT_APPROVAL_REQUIRED", "RED_WITHOUT_APPROVAL_AUTHORITY", "HIGH_RISK_ALLOW"]
  },
  {
    name: "valid decision packet",
    file: "sample-payloads/valid-decision-packet.json",
    type: "decision-packet",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "decision packet without options",
    file: "sample-payloads/invalid-decision-packet-no-options.json",
    type: "decision-packet",
    exitCode: 1,
    requiredCodes: ["DECISION_PACKET_WITHOUT_OPTIONS", "RECOMMENDATION_NOT_IN_OPTIONS", "AUTHORITY_REQUIRED_EMPTY", "DECISION_WITHOUT_EVIDENCE"]
  },
  {
    name: "valid working group",
    file: "sample-payloads/valid-working-group.json",
    type: "working-group",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "valid SOF TF charter",
    file: "sample-payloads/valid-sof-tf-charter.json",
    type: "sof-tf-charter",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "unbounded SOF TF charter",
    file: "sample-payloads/invalid-sof-tf-charter-unbounded.json",
    type: "sof-tf-charter",
    exitCode: 1,
    requiredCodes: [
      "SOF_TF_WITHOUT_TRIGGER",
      "SOF_TF_WITHOUT_RED_RETAINED_AUTHORITY",
      "SOF_TF_DIRECT_ACTION_WITHOUT_APPROVAL",
      "SOF_TF_RED_TEAM_NOT_INDEPENDENT",
      "SOF_TF_RELEASE_REVIEW_NOT_INDEPENDENT",
      "SOF_TF_WITHOUT_RECORDER",
      "SOF_TF_SOURCE_MAP_NOT_REQUIRED",
      "SOF_TF_RELEASE_REVIEW_NOT_REQUIRED",
      "SOF_TF_WITHOUT_FALLBACK_PLAN",
      "SOF_TF_WITHOUT_ABORT_CRITERIA"
    ]
  },
  {
    name: "valid department collaboration charter",
    file: "sample-payloads/valid-department-collaboration-charter.json",
    type: "department-collaboration-charter",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "siloed department collaboration charter",
    file: "sample-payloads/invalid-department-collaboration-charter-siloed.json",
    type: "department-collaboration-charter",
    exitCode: 1,
    requiredCodes: [
      "COLLABORATION_TOO_FEW_DEPARTMENTS",
      "COLLABORATION_WITHOUT_COMMAND",
      "COLLABORATION_WITHOUT_RECORDER",
      "DEPARTMENT_WITHOUT_SOURCE_OF_TRUTH",
      "RELATIONSHIP_UNKNOWN_SUPPORTING_DEPARTMENT",
      "RELATIONSHIP_WITHOUT_REQUIRED_OUTPUTS",
      "RELATIONSHIP_WITHOUT_HANDOFF_INTERFACE",
      "RELATIONSHIP_WITHOUT_LIAISON",
      "LIAISON_NOT_PAIRWISE",
      "COLLABORATION_CONFLICT_AUTHORITY_TOO_LOW",
      "COLLABORATION_WITHOUT_DECISION_PACKET_ROUTE",
      "COLLABORATION_WITHOUT_SOURCE_MAP",
      "COLLABORATION_WITHOUT_EEFI_CONTROLS"
    ]
  },
  {
    name: "valid force structure change order",
    file: "sample-payloads/valid-force-structure-change-order.json",
    type: "force-structure-change-order",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "valid COS wave routing receipt",
    file: "sample-payloads/valid-routing-receipt-wave-cos.json",
    type: "routing-receipt",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "valid S3 agent routing receipt",
    file: "sample-payloads/valid-routing-receipt-agent-s3.json",
    type: "routing-receipt",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "manual routing receipt without router proof",
    file: "sample-payloads/invalid-routing-receipt-manual.json",
    type: "routing-receipt",
    exitCode: 1,
    requiredCodes: [
      "ROUTING_RECEIPT_WITHOUT_MATCHED_ROUTES",
      "ROUTING_RECEIPT_WITHOUT_SOURCE_MAP",
      "ROUTING_RECEIPT_UNROUTED_ARTIFACTS",
      "ROUTING_RECEIPT_NOT_FROM_CONTROLS_ROUTER",
      "ROUTING_RECEIPT_NOT_AI_ACTOR"
    ]
  },
  {
    name: "agent routing receipt with wrong role",
    file: "sample-payloads/invalid-routing-receipt-agent-wrong-role.json",
    type: "routing-receipt",
    exitCode: 1,
    requiredCodes: [
      "AGENT_ROUTING_NOT_S3",
      "AGENT_ROUTING_WRONG_DEPARTMENT",
      "AGENT_ROUTING_WRONG_AUTHORITY"
    ]
  },
  {
    name: "unjustified force structure expansion",
    file: "sample-payloads/invalid-force-structure-change-order-unjustified.json",
    type: "force-structure-change-order",
    exitCode: 1,
    requiredCodes: [
      "FORCE_CHANGE_WITHOUT_EVIDENCE",
      "FORCE_CHANGE_WITHOUT_ALTERNATIVES",
      "FORCE_CHANGE_WITHOUT_NON_ORG_ALTERNATIVE",
      "FORCE_CHANGE_INCOMPLETE_DOTMLPF",
      "FORCE_CHANGE_REQUIRES_COMMANDER",
      "FORCE_CHANGE_WITHOUT_APPROVAL_EVIDENCE",
      "FORCE_CHANGE_WITHOUT_MAINTAINER",
      "FORCE_CHANGE_LOW_READINESS_TARGET",
      "FORCE_CHANGE_WITHOUT_VALIDATION_FIXTURE",
      "FORCE_CHANGE_WITHOUT_HANDOFF",
      "FORCE_CHANGE_WITHOUT_SUNSET",
      "FORCE_CHANGE_WITHOUT_DOC_UPDATE",
      "FORCE_CHANGE_WITHOUT_MOE",
      "FORCE_CHANGE_WITHOUT_SUNSET_CONDITION"
    ]
  },
  {
    name: "valid model force assignment plan",
    file: "sample-payloads/valid-model-force-assignment-plan.json",
    type: "model-force-assignment-plan",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "unready model force monoculture",
    file: "sample-payloads/invalid-model-force-assignment-plan-monoculture.json",
    type: "model-force-assignment-plan",
    exitCode: 1,
    requiredCodes: [
      "MODEL_ASSIGNMENT_FLOATING_VERSION",
      "MODEL_ASSIGNMENT_WITHOUT_EVIDENCE",
      "MODEL_ASSIGNMENT_TASK_NOT_EVALUATED",
      "MODEL_ASSIGNMENT_INSUFFICIENT_READINESS",
      "MODEL_ASSIGNMENT_CONTEXT_INELIGIBLE",
      "MODEL_ASSIGNMENT_SELF_FALLBACK",
      "MODEL_ASSIGNMENT_FALLBACK_NOT_QUALIFIED",
      "MODEL_ASSIGNMENT_FALLBACK_UNREADY",
      "MODEL_ASSIGNMENT_FALLBACK_CONTEXT_INELIGIBLE",
      "MODEL_ASSIGNMENT_CRITICAL_BILLET_WITHOUT_DEPTH",
      "MODEL_ASSIGNMENT_ROUTER_UNREADY",
      "MODEL_ASSIGNMENT_ROUTER_WITHOUT_HELD_OUT_EVAL",
      "MODEL_ASSIGNMENT_CONFIDENCE_ONLY",
      "MODEL_ASSIGNMENT_ASSURANCE_PROFILE_NOT_BILLETED",
      "MODEL_ASSIGNMENT_CORRELATED_ASSURANCE",
      "MODEL_ASSIGNMENT_WITHOUT_DETERMINISTIC_CHECKS",
      "MODEL_ASSIGNMENT_PACE_NOT_DISTINCT",
      "MODEL_ASSIGNMENT_PACE_NOT_TASK_READY",
      "MODEL_ASSIGNMENT_AUTHORITY_FROM_MODEL",
      "MODEL_ASSIGNMENT_HUMAN_AUTHORITY_MISSING",
      "MODEL_ASSIGNMENT_FORCE_MONOCULTURE"
    ]
  },
  {
    name: "valid model registry",
    file: "sample-payloads/valid-model-registry.json",
    type: "model-registry",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "unready model registry",
    file: "sample-payloads/invalid-model-registry-unready.json",
    type: "model-registry",
    exitCode: 1,
    requiredCodes: [
      "MODEL_REGISTRY_FLOATING_IDENTITY",
      "MODEL_REGISTRY_FLOATING_VERSION",
      "MODEL_REGISTRY_SECRET_IN_ENDPOINT_REF",
      "MODEL_REGISTRY_DUPLICATE_TASK_READINESS",
      "MODEL_REGISTRY_READY_WITHOUT_EVIDENCE",
      "MODEL_REGISTRY_EXPIRED_READINESS",
      "MODEL_REGISTRY_INVALID_OWNER",
      "MODEL_REGISTRY_HUMAN_AUTHORITY_MISSING"
    ]
  },
  {
    name: "valid model assignment request",
    file: "sample-payloads/valid-model-assignment-request.json",
    type: "model-assignment-request",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "unsafe model assignment request",
    file: "sample-payloads/invalid-model-assignment-request-unsafe.json",
    type: "model-assignment-request",
    exitCode: 1,
    requiredCodes: [
      "MODEL_REQUEST_WEIGHTS_NOT_100",
      "MODEL_REQUEST_REGISTRY_VERSION_FLOATING",
      "MODEL_REQUEST_CLASSIFICATION_MISMATCH",
      "MODEL_REQUEST_BLACK_PROHIBITED",
      "MODEL_REQUEST_WITHOUT_DEPLOYMENT_BOUNDARY",
      "MODEL_REQUEST_WITHOUT_READY_ROUTER",
      "MODEL_REQUEST_MISSING_COMMAND",
      "MODEL_REQUEST_REQUIRES_ASSURANCE",
      "MODEL_REQUEST_AUTHORITY_FROM_MODEL",
      "MODEL_REQUEST_HUMAN_AUTHORITY_MISSING"
    ]
  },
  {
    name: "valid integrated mission preflight",
    file: "sample-payloads/valid-integrated-mission-preflight.json",
    type: "integrated-mission-preflight",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "unbound integrated mission preflight",
    file: "sample-payloads/invalid-integrated-mission-preflight-unbound.json",
    type: "integrated-mission-preflight",
    exitCode: 1,
    requiredCodes: [
      "INTEGRATED_PREFLIGHT_PATH_TRAVERSAL",
      "INTEGRATED_PREFLIGHT_HUMAN_AUTHORITY_MISSING"
    ]
  },
  {
    name: "valid model usage event",
    file: "sample-payloads/valid-model-usage-event.json",
    type: "model-usage-event",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "self-authorized model usage event",
    file: "sample-payloads/invalid-model-usage-event-self-authorized.json",
    type: "model-usage-event",
    exitCode: 1,
    requiredCodes: [
      "MODEL_USAGE_FLOATING_VERSION",
      "MODEL_USAGE_WITHOUT_AUTHORITY_SNAPSHOT",
      "MODEL_USAGE_WITHOUT_EXTERNAL_EVIDENCE"
    ]
  },
  {
    name: "valid repository artifact manifest",
    file: "sample-payloads/valid-repository-artifact-manifest.json",
    type: "repository-artifact-manifest",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "cross-repository artifact manifest",
    file: "sample-payloads/invalid-repository-artifact-manifest-cross-repo.json",
    type: "repository-artifact-manifest",
    exitCode: 1,
    requiredCodes: [
      "REPOSITORY_ARTIFACT_NAMESPACE_MISMATCH",
      "REPOSITORY_ARTIFACT_COUNT_MISMATCH",
      "REPOSITORY_ARTIFACT_PATH_TRAVERSAL",
      "REPOSITORY_ARTIFACT_CROSS_REPOSITORY_PATH",
      "REPOSITORY_ARTIFACT_ID_PATH_MISMATCH"
    ]
  },
  {
    name: "valid document access manifest",
    file: "sample-payloads/valid-document-access-manifest.json",
    type: "document-access-manifest",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "overbroad document access manifest",
    file: "sample-payloads/invalid-document-access-manifest-overbroad.json",
    type: "document-access-manifest",
    exitCode: 1,
    requiredCodes: [
      "DOCUMENT_ACCESS_WITHOUT_NEED_TO_KNOW",
      "DOCUMENT_ACCESS_ALLOWS_BULK_READ",
      "DOCUMENT_ACCESS_WITHOUT_AUDIT",
      "DOCUMENT_ACCESS_EXCEPTION_WITHOUT_APPROVAL",
      "DOCUMENT_ACCESS_WILDCARD_PATH",
      "DOCUMENT_ACCESS_WITHOUT_ALLOWED_ROLES",
      "DOCUMENT_ACCESS_WITHOUT_DUTIES",
      "DOCUMENT_ACCESS_SENSITIVE_RAW_TOO_BROAD",
      "DOCUMENT_ACCESS_RESTRICTED_RAW",
      "DOCUMENT_ACCESS_REQUIRED_DOC_NOT_DECLARED",
      "DOCUMENT_ACCESS_REQUIRED_DOC_NOT_READABLE",
      "DOCUMENT_ACCESS_DENIED_DOC_REQUIRED",
      "DOCUMENT_ACCESS_ESCALATION_SELF"
    ]
  },
  {
    name: "valid doctrine consistency review",
    file: "sample-payloads/valid-doctrine-consistency-review.json",
    type: "doctrine-consistency-review",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "US-only doctrine consistency review",
    file: "sample-payloads/invalid-doctrine-consistency-review-us-only.json",
    type: "doctrine-consistency-review",
    exitCode: 1,
    requiredCodes: [
      "DOCTRINE_REVIEW_TOO_FEW_SOURCE_FAMILIES",
      "DOCTRINE_REVIEW_TOO_FEW_NON_US_FAMILIES",
      "DOCTRINE_REVIEW_US_ONLY_DISPOSITION",
      "DOCTRINE_REVIEW_CONTROL_DISABLED",
      "DOCTRINE_REVIEW_UNVERIFIED_FINDING",
      "DOCTRINE_REVIEW_PLACEHOLDER_DOC_UPDATE",
      "DOCTRINE_REVIEW_ROLE_ALIAS_MISSING",
      "DOCTRINE_REVIEW_JURISDICTION_GATE_MISSING"
    ]
  },
  {
    name: "working group without disband condition",
    file: "sample-payloads/invalid-working-group-no-disband.json",
    type: "working-group",
    exitCode: 1,
    requiredCodes: ["CHAIR_NOT_IN_PARTICIPANTS", "WORKING_GROUP_WITHOUT_DELIVERABLE", "NO_DISBAND_CONDITION"]
  },
  {
    name: "valid CCIR alert",
    file: "sample-payloads/valid-ccir-alert.json",
    type: "ccir-alert",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "red CCIR alert without decision",
    file: "sample-payloads/invalid-ccir-alert-red-without-decision.json",
    type: "ccir-alert",
    exitCode: 1,
    requiredCodes: ["HIGH_SEVERITY_ALERT_NOT_BLOCKING", "HIGH_SEVERITY_WITHOUT_DECISION"]
  },
  {
    name: "valid handoff packet",
    file: "sample-payloads/valid-handoff-packet.json",
    type: "handoff-packet",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "valid continuity plan",
    file: "sample-payloads/valid-continuity-plan.json",
    type: "continuity-plan",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "continuity plan with single point of failure",
    file: "sample-payloads/invalid-continuity-plan-single-point-failure.json",
    type: "continuity-plan",
    exitCode: 1,
    requiredCodes: [
      "ESSENTIAL_FUNCTION_NOT_TWO_DEEP",
      "SUCCESSOR_CANNOT_BE_SELF",
      "ESSENTIAL_FUNCTION_WITHOUT_HANDOFF",
      "ESSENTIAL_FUNCTION_WITHOUT_VITAL_RECORDS",
      "SUCCESSION_RULE_NOT_TWO_DEEP",
      "SUCCESSION_RULE_SELF_SUCCESSOR",
      "SUCCESSION_WITHOUT_AUTHORITY_LIMITS",
      "ROTATION_WITHOUT_OVERLAP",
      "ROTATION_WITHOUT_BACKBRIEF",
      "ROTATION_WITHOUT_HANDOFF_PACKET",
      "CONTINUITY_WITHOUT_AUTHORITY_RECORD",
      "CONTINUITY_WITHOUT_HANDOFF_RECORD",
      "DEGRADED_MODE_WITHOUT_PAUSED_FUNCTIONS",
      "CONTINUITY_WITHOUT_COMMANDER_RETAINED_DECISIONS"
    ]
  },
  {
    name: "blocked handoff without decision",
    file: "sample-payloads/invalid-handoff-packet-blocked-without-decision.json",
    type: "handoff-packet",
    exitCode: 1,
    requiredCodes: ["HANDOFF_WITHOUT_SOURCE_OF_TRUTH", "BLOCKED_WITHOUT_PENDING_DECISION", "HANDOFF_WITHOUT_PROHIBITIONS"]
  },
  {
    name: "valid context item",
    file: "sample-payloads/valid-context-item.json",
    type: "context-item",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "EEFI context item released to final",
    file: "sample-payloads/invalid-context-item-eefi-final.json",
    type: "context-item",
    exitCode: 1,
    requiredCodes: ["EEFI_RELEASE_TO_FINAL", "RESTRICTED_RELEASE_TO_FINAL", "RAW_EEFI_PRESENT"]
  },
  {
    name: "valid release review",
    file: "sample-payloads/valid-release-review.json",
    type: "release-review",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "release review approves raw EEFI",
    file: "sample-payloads/invalid-release-review-eefi-approved.json",
    type: "release-review",
    exitCode: 1,
    requiredCodes: ["NO_RELEASE_CONSTRAINTS", "RESTRICTED_OR_EEFI_RAW_RELEASE", "NON_PUBLIC_RAW_FINAL_OUTPUT"]
  },
  {
    name: "valid release gate decision event",
    file: "sample-payloads/valid-release-gate-decision-event.json",
    type: "release-gate-decision-event",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "release gate allows missing release review",
    file: "sample-payloads/invalid-release-gate-decision-event-missing-review.json",
    type: "release-gate-decision-event",
    exitCode: 1,
    requiredCodes: ["RELEASE_GATE_RELEASE_BLOCK_NOT_FINAL", "RELEASE_GATE_ALLOW_WITH_FAILED_RELEASE_REVIEW", "RELEASE_GATE_WITHOUT_EVIDENCE"]
  },
  {
    name: "valid maintenance readiness",
    file: "sample-payloads/valid-maintenance-readiness.json",
    type: "maintenance-readiness",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "unavailable maintenance asset without fallback",
    file: "sample-payloads/invalid-maintenance-readiness-unavailable-no-fallback.json",
    type: "maintenance-readiness",
    exitCode: 1,
    requiredCodes: ["MIN_LENGTH", "OVERALL_FULLY_WITH_BAD_ASSETS", "FAILED_ASSET_WITHOUT_FALLBACK", "UNAVAILABLE_WITHOUT_CCIR", "BAD_ASSETS_WITHOUT_COMMANDER_DECISION_FLAG"]
  },
  {
    name: "valid backbrief",
    file: "sample-payloads/valid-backbrief.json",
    type: "backbrief",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "backbrief without stop conditions",
    file: "sample-payloads/invalid-backbrief-no-stop-conditions.json",
    type: "backbrief",
    exitCode: 1,
    requiredCodes: ["BACKBRIEF_WITHOUT_ACTIONS", "BACKBRIEF_WITHOUT_STOP_CONDITIONS", "BACKBRIEF_WITHOUT_RISK_CONTROLS", "LOW_CONFIDENCE_WITHOUT_CLARIFICATION", "DECISION_NEEDED_WITHOUT_QUESTION"]
  },
  {
    name: "valid rehearsal",
    file: "sample-payloads/valid-rehearsal.json",
    type: "rehearsal",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "rehearsal execute with unresolved change",
    file: "sample-payloads/invalid-rehearsal-execute-with-unresolved-change.json",
    type: "rehearsal",
    exitCode: 1,
    requiredCodes: ["REHEARSAL_WITHOUT_BACKBRIEF", "REHEARSAL_WITHOUT_SEQUENCE", "EXECUTE_WITH_UNRESOLVED_CHANGES", "HIGH_FRICTION_WITHOUT_DECISION_POINT"]
  },
  {
    name: "valid annex",
    file: "sample-payloads/valid-annex.json",
    type: "annex",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "annex changes authority",
    file: "sample-payloads/invalid-annex-changes-authority.json",
    type: "annex",
    exitCode: 1,
    requiredCodes: ["ANNEX_CHANGES_INTENT", "ANNEX_CHANGES_AUTHORITY", "ANNEX_WITHOUT_VERIFICATION"]
  },
  {
    name: "valid FRAGO scope change",
    file: "sample-payloads/valid-frago-scope-change.json",
    type: "frago-scope-change",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "FRAGO scope change without backbrief",
    file: "sample-payloads/invalid-frago-scope-change-no-backbrief.json",
    type: "frago-scope-change",
    exitCode: 1,
    requiredCodes: ["FRAGO_SCOPE_WITHOUT_CHANGE_DETAILS", "AUTHORITY_CHANGE_WITHOUT_AUTHORITY_DETAILS", "FRAGO_SCOPE_WITHOUT_AFFECTED_ROLES", "FRAGO_SCOPE_WITHOUT_BACKBRIEF", "FRAGO_SCOPE_WITHOUT_REHEARSAL", "FRAGO_SCOPE_WITHOUT_ANNEX_BOUNDARY_REASON", "AUTHORITY_FRAGO_REQUIRES_COMMANDER"]
  },
  {
    name: "valid information report",
    file: "sample-payloads/valid-information-report.json",
    type: "information-report",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "order-changing information without CCIR",
    file: "sample-payloads/invalid-information-report-order-change-no-ccir.json",
    type: "information-report",
    exitCode: 1,
    requiredCodes: ["INFORMATION_RELEVANT_WITHOUT_CCIR", "ORDER_CHANGE_NOT_ROUTED_TO_DECISION"]
  },
  {
    name: "valid intelligence assessment",
    file: "sample-payloads/valid-intelligence-assessment.json",
    type: "intelligence-assessment",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "low confidence assessment recommends FRAGO",
    file: "sample-payloads/invalid-intelligence-assessment-low-confidence-frago.json",
    type: "intelligence-assessment",
    exitCode: 1,
    requiredCodes: ["LOW_CONFIDENCE_FRAGO", "OPERATIONAL_CHANGE_WITHOUT_COMMANDER_DECISION", "LOW_CONFIDENCE_WITHOUT_GAPS"]
  },
  {
    name: "valid approval scope",
    file: "sample-payloads/valid-approval-scope.json",
    type: "approval-scope",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "approval scope without expiry",
    file: "sample-payloads/invalid-approval-scope-no-expiry.json",
    type: "approval-scope",
    exitCode: 1,
    requiredCodes: ["APPROVAL_WITHOUT_EXPIRY", "APPROVE_ONCE_NOT_SINGLE_USE", "APPROVAL_WITHOUT_ROLLBACK", "APPROVAL_WITHOUT_EVIDENCE", "CONSUMED_APPROVAL_WITHOUT_CONSUMPTION_EVENT"]
  },
  {
    name: "valid risk acceptance",
    file: "sample-payloads/valid-risk-acceptance.json",
    type: "risk-acceptance",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "high risk accepted by S3",
    file: "sample-payloads/invalid-risk-acceptance-high-by-s3.json",
    type: "risk-acceptance",
    exitCode: 1,
    requiredCodes: ["RISK_ACCEPTANCE_REQUIRES_COMMANDER", "RISK_ACCEPTANCE_WITHOUT_EXPIRY", "RISK_ACCEPTANCE_WITHOUT_CONTROLS", "RISK_ACCEPTANCE_WITHOUT_SUPERVISION", "RISK_ACCEPTANCE_WITHOUT_EVIDENCE"]
  },
  {
    name: "valid approval consumption event",
    file: "sample-payloads/valid-approval-consumption-event.json",
    type: "approval-consumption-event",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "approval consumption event mismatch",
    file: "sample-payloads/invalid-approval-consumption-event-mismatch.json",
    type: "approval-consumption-event",
    exitCode: 1,
    requiredCodes: ["APPROVAL_ALREADY_CONSUMED_OR_INACTIVE", "APPROVAL_CONSUMPTION_TARGET_MISMATCH", "APPROVAL_CONSUMED_OUTSIDE_WINDOW", "APPROVE_ONCE_CONSUMPTION_COUNT_INVALID", "EXECUTED_APPROVAL_NOT_MARKED_CONSUMED", "APPROVAL_CONSUMPTION_WITHOUT_EVIDENCE"]
  },
  {
    name: "valid approval revocation event",
    file: "sample-payloads/valid-approval-revocation-event.json",
    type: "approval-revocation-event",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "approval revocation event after consumption",
    file: "sample-payloads/invalid-approval-revocation-event-consumed.json",
    type: "approval-revocation-event",
    exitCode: 1,
    requiredCodes: ["APPROVAL_REVOCATION_NOT_ACTIVE", "APPROVAL_REVOCATION_REQUIRES_COMMANDER", "APPROVAL_REVOCATION_AUTHORITY_MISMATCH", "APPROVAL_REVOKED_OUTSIDE_WINDOW", "APPROVAL_REVOCATION_NOT_MARKED_REVOKED", "APPROVAL_REVOCATION_WITHOUT_REASON", "APPROVAL_REVOCATION_WITHOUT_EVIDENCE", "APPROVAL_REVOCATION_WITHOUT_NOTIFICATION"]
  },
  {
    name: "valid approval renewal event",
    file: "sample-payloads/valid-approval-renewal-event.json",
    type: "approval-renewal-event",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "approval renewal event after expiry",
    file: "sample-payloads/invalid-approval-renewal-event-expired.json",
    type: "approval-renewal-event",
    exitCode: 1,
    requiredCodes: ["APPROVAL_RENEWAL_NOT_ACTIVE", "APPROVAL_RENEWAL_REQUIRES_COMMANDER", "APPROVAL_RENEWAL_AUTHORITY_MISMATCH", "APPROVAL_RENEWED_OUTSIDE_WINDOW", "APPROVAL_RENEWAL_NOT_EXTENSION", "APPROVAL_RENEWAL_EXPIRES_BEFORE_RENEWED_AT", "APPROVAL_RENEWAL_EXPANDS_EXECUTIONS", "APPROVE_ONCE_ALREADY_USED_BEFORE_RENEWAL", "APPROVAL_RENEWAL_NOT_MARKED_ACTIVE", "APPROVAL_RENEWAL_WITHOUT_REASON", "APPROVAL_RENEWAL_WITHOUT_EVIDENCE", "APPROVAL_RENEWAL_WITHOUT_NOTIFICATION"]
  },
  {
    name: "valid approval delegation event",
    file: "sample-payloads/valid-approval-delegation-event.json",
    type: "approval-delegation-event",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "approval delegation attempts retained authority",
    file: "sample-payloads/invalid-approval-delegation-event-retained.json",
    type: "approval-delegation-event",
    exitCode: 1,
    requiredCodes: ["DELEGATION_REQUIRES_COMMANDER", "DELEGATEE_CANNOT_APPROVE_SELF_ROLE", "DELEGATION_CANNOT_INCLUDE_COMMANDER_RETAINED_ROE", "DELEGATION_CANNOT_ACCEPT_HIGH_RISK", "DELEGATION_WITHOUT_TASK_SCOPE", "DELEGATION_EXPIRY_NOT_AFTER_START", "DELEGATION_WITHOUT_LIMITS", "DELEGATION_ALLOWS_SUBDELEGATION", "DELEGATION_WITHOUT_RETAINED_AUTHORITIES", "DELEGATION_WITHOUT_RESTRICTED_CONTEXT_GUARD", "DELEGATION_SENSITIVE_RELEASE_WITHOUT_REVIEW", "DELEGATION_WITHOUT_POST_ACTION_EVIDENCE", "DELEGATION_NOT_MARKED_ACTIVE", "DELEGATION_WITHOUT_NOTIFICATION", "DELEGATION_WITHOUT_REASON", "DELEGATION_WITHOUT_EVIDENCE"]
  },
  {
    name: "valid approval delegation revocation event",
    file: "sample-payloads/valid-approval-delegation-revocation-event.json",
    type: "approval-delegation-revocation-event",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "staff approval delegation revocation event",
    file: "sample-payloads/invalid-approval-delegation-revocation-event-staff.json",
    type: "approval-delegation-revocation-event",
    exitCode: 1,
    requiredCodes: ["DELEGATION_TERMINATION_NOT_ACTIVE", "DELEGATION_TERMINATION_STATUS_MISMATCH", "DELEGATION_TERMINATION_AUTHORITY_MISMATCH", "DELEGATION_REVOCATION_REQUIRES_COMMANDER", "DELEGATION_REVOKED_OUTSIDE_WINDOW", "DELEGATION_TERMINATION_WITHOUT_REASON", "DELEGATION_TERMINATION_WITHOUT_EVIDENCE", "DELEGATION_TERMINATION_WITHOUT_NOTIFICATION"]
  },
  {
    name: "valid AAR readiness update",
    file: "sample-payloads/valid-aar-readiness-update.json",
    type: "aar-readiness-update",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "AAR readiness downgrade without commander review",
    file: "sample-payloads/invalid-aar-readiness-update-no-review.json",
    type: "aar-readiness-update",
    exitCode: 1,
    requiredCodes: ["DOWNGRADE_WITHOUT_COMMANDER_REVIEW"]
  },
  {
    name: "valid bounded self-improvement campaign",
    file: "sample-payloads/valid-self-improvement-campaign.json",
    type: "self-improvement-campaign",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "self-improvement campaign claims AI final authority",
    file: "sample-payloads/invalid-self-improvement-campaign-ai-final-authority.json",
    type: "self-improvement-campaign",
    exitCode: 1,
    requiredCodes: [
      "CONST_MISMATCH",
      "SELF_IMPROVEMENT_HUMAN_AUTHORITY_MISSING",
      "SELF_IMPROVEMENT_EVALUATOR_NOT_INDEPENDENT",
      "SELF_IMPROVEMENT_WITHOUT_INVARIANTS",
      "SELF_IMPROVEMENT_ENVELOPE_TOO_BROAD",
      "SELF_IMPROVEMENT_QUALITY_WEIGHTS_INVALID",
      "SELF_IMPROVEMENT_CHECKPOINT_TRIGGER_MISSING"
    ]
  },
  {
    name: "valid self-improvement checkpoint",
    file: "sample-payloads/valid-self-improvement-checkpoint.json",
    type: "self-improvement-checkpoint",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "self-improvement checkpoint escapes repository",
    file: "sample-payloads/invalid-self-improvement-checkpoint-path-traversal.json",
    type: "self-improvement-checkpoint",
    exitCode: 1,
    requiredCodes: ["SELF_IMPROVEMENT_PATH_TRAVERSAL", "SELF_IMPROVEMENT_PROHIBITED_EXTERNALITY"]
  },
  {
    name: "valid self-improvement decision",
    file: "sample-payloads/valid-self-improvement-decision.json",
    type: "self-improvement-decision",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "self-improvement decision claims self-release",
    file: "sample-payloads/invalid-self-improvement-decision-self-release.json",
    type: "self-improvement-decision",
    exitCode: 1,
    requiredCodes: ["CONST_MISMATCH", "SELF_IMPROVEMENT_SELF_RELEASE", "SELF_IMPROVEMENT_DECISION_EXECUTION_MISMATCH"]
  },
  {
    name: "valid verification plan",
    file: "sample-payloads/valid-verification-plan.json",
    type: "verification-plan",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "verification plan invokes a shell",
    file: "sample-payloads/invalid-verification-plan-shell.json",
    type: "verification-plan",
    exitCode: 1,
    requiredCodes: ["VERIFICATION_PLAN_SHELL_PROHIBITED"]
  },
  {
    name: "valid verification receipt",
    file: "sample-payloads/valid-verification-receipt.json",
    type: "verification-receipt",
    exitCode: 0,
    requiredCodes: []
  },
  {
    name: "self-reported verification receipt",
    file: "sample-payloads/invalid-verification-receipt-self-reported.json",
    type: "verification-receipt",
    exitCode: 1,
    requiredCodes: ["CONST_MISMATCH", "MIN_ITEMS", "VERIFICATION_RECEIPT_SHELL_USED"]
  }
];

function runFixture(fixture) {
  const result = spawnSync("node", [VALIDATOR, fixture.file, fixture.type], {
    cwd: ROOT,
    encoding: "utf8"
  });

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    return {
      ok: false,
      fixture,
      reason: `Validator did not return JSON: ${error.message}`,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  const issueCodes = new Set((parsed.issues || []).map(issue => issue.code));
  const missingCodes = fixture.requiredCodes.filter(code => !issueCodes.has(code));
  const ok = result.status === fixture.exitCode && missingCodes.length === 0;

  return {
    ok,
    fixture,
    exitCode: result.status,
    expectedExitCode: fixture.exitCode,
    missingCodes,
    maxSeverity: parsed.max_severity,
    issueCount: parsed.issue_count
  };
}

const results = fixtures.map(runFixture);
const failed = results.filter(result => !result.ok);

for (const result of results) {
  const status = result.ok ? "PASS" : "FAIL";
  console.log(`${status} ${result.fixture.name} (${result.fixture.file})`);
  if (!result.ok) {
    console.log(`  expected exit: ${result.expectedExitCode}, actual: ${result.exitCode}`);
    if (result.missingCodes && result.missingCodes.length) {
      console.log(`  missing issue codes: ${result.missingCodes.join(", ")}`);
    }
    if (result.reason) {
      console.log(`  reason: ${result.reason}`);
    }
  }
}

console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);
