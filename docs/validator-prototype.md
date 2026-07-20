# Validator Prototype

## 0. Purpose

This document is the prototype design for implementing `schema-files/` and `prompt-dsl-validator.md` as actual code.

The validator is split into two layers.

```text
JSON Schema validation
-> Semantic military-control validation
```

JSON Schema catches missing required fields and type errors. Semantic validation catches the omissions that matter more in military-style LLM operation: absence of intent, absence of authority, absence of CCIR, MOP/MOE imbalance, and high-risk actions taken without approval.

## 1. Input and Output

### Input

```yaml
document:
  type: OPORD
  payload: {}
context:
  mission_state: {}
  agent_registry: []
  tool_policy: {}
  risk_register: []
```

### Output

```yaml
validation_result:
  valid: false
  can_execute: false
  max_severity: critical
  errors:
    - code: MISSING_AUTHORITY
      severity: critical
      path: command_and_signal.authority
      message: "OPORD cannot execute without authority boundaries."
      fix: "Add allowed, approval_required, and prohibited action lists."
  warnings: []
```

## 2. Validator Pipeline

```text
load schema
-> parse document
-> validate schema
-> normalize order type
-> run common semantic rules
-> run type-specific semantic rules
-> run tool-use ROE rules
-> run source discipline rules
-> run assessment rules
-> return result
```

## 3. Pseudocode

```text
function validateDocument(document, context):
  result = emptyResult()

  schema = loadSchema(document.type)
  schemaErrors = validateJsonSchema(schema, document.payload)
  result.add(schemaErrors)

  if schemaErrors.hasCriticalShapeError:
    result.can_execute = false
    return result

  result.add(runCommonRules(document.payload, context))

  if document.type == "OPORD":
    result.add(validateOpord(document.payload, context))
  if document.type == "WARNO":
    result.add(validateWarno(document.payload, context))
  if document.type == "FRAGO":
    result.add(validateFrago(document.payload, context))
  if document.type == "SITREP":
    result.add(validateSitrep(document.payload, context))
  if document.type == "AAR":
    result.add(validateAar(document.payload, context))

  result.add(validateToolUse(document.payload, context))
  result.add(validateSourceDiscipline(document.payload, context))
  result.add(validateAssessment(document.payload, context))

  result.max_severity = computeMaxSeverity(result)
  result.valid = result.max_severity not in ["error", "critical"]
  result.can_execute = result.max_severity != "critical"

  return result
```

## 4. Core Rules

### 4.1 Mission / Intent

| Code | Severity | Condition | Fix |
| --- | --- | --- | --- |
| MISSING_MISSION | error | No mission statement | Add mission.statement |
| MISSING_INTENT | critical | No intent purpose | Add intent.purpose |
| MISSION_INTENT_MERGED | warning | Mission and intent are the same sentence | Separate what to do from why |
| VAGUE_MISSION | warning | Centered on words like "well," "appropriately," "to the fullest extent" | Add an observable end state |

### 4.2 Authority

| Code | Severity | Condition | Fix |
| --- | --- | --- | --- |
| MISSING_AUTHORITY | critical | No authority field | Add allowed/approval/prohibited |
| EMPTY_PROHIBITED_ACTIONS | error | No prohibited actions | Add a prohibited list |
| VAGUE_AUTHORITY | error | "Use your own judgment" | Rewrite as risk-based authority |
| AGENT_RISK_ACCEPTANCE | critical | Agent designated as the acceptor of high risk | Change to human commander approval |

### 4.3 CCIR

| Code | Severity | Condition | Fix |
| --- | --- | --- | --- |
| MISSING_CCIR | error | No CCIR | Add PIR/FFIR/EEFI |
| NO_EEFI | warning | Task can involve sensitive information but has no EEFI | Add EEFI |
| BLOCKED_WITHOUT_ESCALATION | error | Blocked with no decision point | Add escalation |

### 4.4 Tool Use

| Code | Severity | Condition | Fix |
| --- | --- | --- | --- |
| RED_WITHOUT_APPROVAL | critical | Red tool action has no approval | Generate an approval request |
| BLACK_ACTION_REQUESTED | critical | Prohibited action requested | Present a refusal and an alternative |
| WRITE_WITHOUT_TARGET | error | Write action has no target | Specify the target |
| EXTERNAL_SEND_WITHOUT_DATA_SUMMARY | error | No data summary for an external send | Add data affected |

### 4.5 Evidence

| Code | Severity | Condition | Fix |
| --- | --- | --- | --- |
| SOURCE_REQUIRED | error | Research task has no source requirement | Add an evidence requirement |
| CLAIM_WITHOUT_SOURCE | warning | Key claim has no source | Link evidence |
| SOURCE_INTERPRETATION_MERGED | warning | Original claim and interpretation are mixed together | Separate claim from interpretation |

### 4.6 Assessment

| Code | Severity | Condition | Fix |
| --- | --- | --- | --- |
| MISSING_MOP | warning | No performance measure | Add MOP |
| MISSING_MOE | error | No effectiveness measure | Add MOE |
| MOP_ONLY | warning | Only output existence is assessed, with no MOE | Add effectiveness criteria |
| NO_VERIFICATION | error | No verification method | Add test/review/source check |

## 5. Test Cases

### 5.1 OPORD without intent

Input:

```yaml
type: OPORD
mission:
  statement: "Write the document."
```

Expected:

```yaml
errors:
  - code: MISSING_INTENT
    severity: critical
can_execute: false
```

### 5.2 High-risk tool request without approval

Input:

```yaml
tool_request:
  tool: database
  action: update_production
  roe_class: Red
  approval_required: false
```

Expected:

```yaml
errors:
  - code: RED_WITHOUT_APPROVAL
    severity: critical
can_execute: false
```

### 5.3 Research order without evidence rule

Input:

```yaml
task: "Research materials on military command and control."
verification:
  - "Write a summary"
```

Expected:

```yaml
errors:
  - code: SOURCE_REQUIRED
    severity: error
```

### 5.4 MOP only

Input:

```yaml
assessment:
  mop:
    - "Document written"
  moe: []
```

Expected:

```yaml
warnings:
  - code: MOP_ONLY
```

## 6. Implementation Notes

Recommended implementation:

- JSON Schema validator: Ajv or an equivalent library.
- Semantic rules: an array of pure functions.
- Rule output: code, severity, path, message, fix.
- Test runner: a fixture per rule.
- CI gate: cannot execute if critical, cannot task OPORD if error.

## 7. Minimal Rule Interface

```typescript
type ValidationIssue = {
  code: string;
  severity: "info" | "warning" | "error" | "critical";
  path: string;
  message: string;
  fix?: string;
};

type Rule = {
  id: string;
  appliesTo: string[];
  run: (document: unknown, context: RuntimeContext) => ValidationIssue[];
};
```

## 8. Related Documents

- `prompt-dsl-validator.md`
- `prompt-dsl.md`
- `tool-use-roe.md`
- `reference-architecture.md`
- `sample-runtime-state.md`
- `schema-files/README.md`
