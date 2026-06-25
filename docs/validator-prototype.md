# Validator Prototype

## 0. 목적

이 문서는 `schema-files/`와 `prompt-dsl-validator.md`를 실제 코드로 구현하기 위한 prototype 설계다.

Validator는 두 층으로 나뉜다.

```text
JSON Schema validation
-> Semantic military-control validation
```

JSON Schema는 필수 필드와 타입을 잡는다. Semantic validation은 군대식 LLM 운용에서 더 중요한 누락, 즉 intent 부재, authority 부재, CCIR 부재, MOP/MOE 불균형, 승인 없는 고위험 행동을 잡는다.

## 1. 입력과 출력

### 입력

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

### 출력

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

## 3. 의사코드

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

## 4. 핵심 규칙

### 4.1 Mission / Intent

| Code | Severity | 조건 | Fix |
| --- | --- | --- | --- |
| MISSING_MISSION | error | mission statement 없음 | mission.statement 추가 |
| MISSING_INTENT | critical | intent purpose 없음 | intent.purpose 추가 |
| MISSION_INTENT_MERGED | warning | mission과 intent가 같은 문장 | 해야 할 일과 이유 분리 |
| VAGUE_MISSION | warning | "잘", "적절히", "최대한" 중심 | observable end state 추가 |

### 4.2 Authority

| Code | Severity | 조건 | Fix |
| --- | --- | --- | --- |
| MISSING_AUTHORITY | critical | authority 필드 없음 | allowed/approval/prohibited 추가 |
| EMPTY_PROHIBITED_ACTIONS | error | 금지 행동 없음 | prohibited 목록 추가 |
| VAGUE_AUTHORITY | error | "알아서 판단" | risk-based authority로 재작성 |
| AGENT_RISK_ACCEPTANCE | critical | agent가 high risk 수용자로 지정 | human commander 승인으로 변경 |

### 4.3 CCIR

| Code | Severity | 조건 | Fix |
| --- | --- | --- | --- |
| MISSING_CCIR | error | CCIR 없음 | PIR/FFIR/EEFI 추가 |
| NO_EEFI | warning | 민감정보 처리 가능 작업인데 EEFI 없음 | EEFI 추가 |
| BLOCKED_WITHOUT_ESCALATION | error | blocked인데 decision point 없음 | escalation 추가 |

### 4.4 Tool Use

| Code | Severity | 조건 | Fix |
| --- | --- | --- | --- |
| RED_WITHOUT_APPROVAL | critical | Red tool action에 승인 없음 | approval request 생성 |
| BLACK_ACTION_REQUESTED | critical | 금지 행동 요청 | 거부와 대안 제시 |
| WRITE_WITHOUT_TARGET | error | write action 대상 없음 | target 명시 |
| EXTERNAL_SEND_WITHOUT_DATA_SUMMARY | error | 외부 전송 데이터 요약 없음 | data affected 추가 |

### 4.5 Evidence

| Code | Severity | 조건 | Fix |
| --- | --- | --- | --- |
| SOURCE_REQUIRED | error | 리서치 task인데 source requirement 없음 | evidence requirement 추가 |
| CLAIM_WITHOUT_SOURCE | warning | 핵심 주장에 출처 없음 | evidence 연결 |
| SOURCE_INTERPRETATION_MERGED | warning | 원문 claim과 해석이 섞임 | claim/interpretation 분리 |

### 4.6 Assessment

| Code | Severity | 조건 | Fix |
| --- | --- | --- | --- |
| MISSING_MOP | warning | 수행지표 없음 | MOP 추가 |
| MISSING_MOE | error | 효과지표 없음 | MOE 추가 |
| MOP_ONLY | warning | MOE 없이 산출물 존재만 평가 | 효과 기준 추가 |
| NO_VERIFICATION | error | 검증 방법 없음 | test/review/source check 추가 |

## 5. Test Cases

### 5.1 OPORD without intent

입력:

```yaml
type: OPORD
mission:
  statement: "문서를 작성한다."
```

예상:

```yaml
errors:
  - code: MISSING_INTENT
    severity: critical
can_execute: false
```

### 5.2 High-risk tool request without approval

입력:

```yaml
tool_request:
  tool: database
  action: update_production
  roe_class: Red
  approval_required: false
```

예상:

```yaml
errors:
  - code: RED_WITHOUT_APPROVAL
    severity: critical
can_execute: false
```

### 5.3 Research order without evidence rule

입력:

```yaml
task: "군대 지휘통제 자료를 조사하라."
verification:
  - "요약 작성"
```

예상:

```yaml
errors:
  - code: SOURCE_REQUIRED
    severity: error
```

### 5.4 MOP only

입력:

```yaml
assessment:
  mop:
    - "문서 작성"
  moe: []
```

예상:

```yaml
warnings:
  - code: MOP_ONLY
```

## 6. Implementation Notes

권장 구현:

- JSON Schema validator: Ajv 또는 동등 라이브러리.
- Semantic rules: 순수 함수 배열.
- Rule output: code, severity, path, message, fix.
- Test runner: 각 rule별 fixture.
- CI gate: critical이면 실행 불가, error이면 OPORD tasking 불가.

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

## 8. 관련 문서

- `prompt-dsl-validator.md`
- `prompt-dsl.md`
- `tool-use-roe.md`
- `reference-architecture.md`
- `sample-runtime-state.md`
- `schema-files/README.md`
