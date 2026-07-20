# Prompt DSL Validator

## 0. Purpose

This document defines the rules for validating the OPORD, WARNO, FRAGO, SITREP, and AAR schemas defined in `prompt-dsl.md`.

The purpose of the Validator is not merely syntax checking. The more important purpose is to catch missing intent, authority, reporting standards, and validation criteria before an LLM task is executed.

## 1. Validator Output

```yaml
validation_result:
  valid: false
  severity: error
  errors:
    - code: MISSING_INTENT
      path: intent.purpose
      message: "intent.purpose is required."
  warnings:
    - code: WEAK_MOE
      path: assessment.moe
      message: "MOE is vague; define observable effect."
  recommended_action: "Request backbrief or revise OPORD."
```

## 2. Severity

| Severity | Meaning | Action |
| --- | --- | --- |
| info | Improvement recommendation | Execution allowed |
| warning | Possible quality degradation | Backbrief recommended |
| error | Must be fixed before execution | Execution halted |
| critical | Risk control failure | Execution halted, report to user |

## 3. Common Rules

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_TYPE | error | `type` is required |
| MISSING_MISSION_ID | error | `mission_id` is required |
| UNKNOWN_CLASSIFICATION | warning | classification must be one of public/internal/sensitive |
| EMPTY_FIELD | warning | A required field is an empty string |
| UNSUPPORTED_VERSION | warning | schema_version is unsupported |

## 4. OPORD Rules

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_MISSION | error | `mission.statement` is required |
| MISSING_INTENT | error | `intent.purpose` is required |
| MISSING_FAILURE_CONDITIONS | warning | No failure conditions to avoid are specified |
| MISSING_AUTHORITY | critical | No authority field present |
| MISSING_CCIR | error | No CCIR present |
| MISSING_ASSESSMENT | error | No assessment present |
| MISSING_MOE | warning | No MOE present |
| TASK_WITHOUT_PURPOSE | warning | Task has no purpose |
| TOOL_WITHOUT_ROE | error | Tool use is present but no ROE is defined |

## 5. WARNO Rules

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_PENDING_MISSION | error | No pending_mission present |
| MISSING_PREPARATION | warning | No required_preparation present |
| NO_INITIAL_CONSTRAINTS | warning | No initial constraints present |

## 6. FRAGO Rules

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_PARENT_ORDER | error | No parent_order present |
| MISSING_UNCHANGED_INTENT | error | No unchanged_intent present |
| NO_MODIFIED_TASKS | warning | No modified tasks present |
| INTENT_REDEFINED | critical | FRAGO arbitrarily alters the higher-level intent |

## 7. SITREP Rules

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_STATUS | error | No status present |
| MISSING_NEXT_ACTION | warning | No next_action present |
| BLOCKED_WITHOUT_REQUEST | error | blocked is present but no required decision request is made |
| RISK_HIDDEN | warning | High-risk task but risk field is empty |

## 8. AAR Rules

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_EXPECTED | error | No expected present |
| MISSING_ACTUAL | error | No actual present |
| MISSING_DELTA | warning | No difference between expected and actual is stated |
| NO_SOP_UPDATE | warning | No statement of whether the SOP was updated |
| BLAME_ONLY_AAR | warning | Contains only blame language with no root-cause analysis |

## 9. Semantic Rules

These are quality rules that are difficult to catch with the formal schema alone.

| Code | Severity | Pattern | Action |
| --- | --- | --- | --- |
| VAGUE_MISSION | warning | Centers on phrases like "well," "appropriately," "as much as possible" | Revise to a result-focused mission |
| VAGUE_AUTHORITY | error | "Use your own judgment" | Separate into allowed/approval/prohibited |
| NO_SOURCE_DISCIPLINE | warning | Research task with no source requirement | Add a source requirement |
| HIGH_RISK_NO_APPROVAL | critical | Red action with no approval present | Execution halted |
| MOP_ONLY | warning | Only measures of performance present, no measures of effectiveness | Add MOE |

## 10. Validator Pseudocode

```text
validate(order):
  check_common_fields(order)
  dispatch_by_type(order.type)
  check_authority(order)
  check_ccir(order)
  check_assessment(order)
  check_semantic_risks(order)
  return validation_result
```

## 11. Principles for Failure Messages

A good failure message should let the user fix the problem immediately.

Bad message:

```text
Invalid OPORD.
```

Good message:

```text
OPORD cannot be executed because authority.prohibited is missing.
Add allowed, approval_required, and prohibited actions before tasking agents.
```

## 12. Related Documents

- `prompt-dsl.md`
- `implementation-guide.md`
- `tool-use-roe.md`
- `evaluation-metrics.md`
