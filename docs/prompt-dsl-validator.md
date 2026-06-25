# Prompt DSL Validator

## 0. 목적

이 문서는 `prompt-dsl.md`에 정의한 OPORD, WARNO, FRAGO, SITREP, AAR 스키마를 검증하는 규칙을 정의한다.

Validator의 목적은 문법 검사만이 아니다. 더 중요한 목적은 LLM 작업이 실행되기 전에 의도, 권한, 보고 기준, 검증 기준의 누락을 잡는 것이다.

## 1. Validator 출력

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

| Severity | 의미 | 동작 |
| --- | --- | --- |
| info | 개선 권고 | 실행 가능 |
| warning | 품질 저하 가능 | backbrief 권장 |
| error | 실행 전 수정 필요 | 실행 중단 |
| critical | 위험 통제 실패 | 실행 중단, 사용자 보고 |

## 3. 공통 규칙

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_TYPE | error | `type` 필수 |
| MISSING_MISSION_ID | error | `mission_id` 필수 |
| UNKNOWN_CLASSIFICATION | warning | classification은 public/internal/sensitive 중 하나 |
| EMPTY_FIELD | warning | 필수 필드가 빈 문자열 |
| UNSUPPORTED_VERSION | warning | schema_version 미지원 |

## 4. OPORD 규칙

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_MISSION | error | `mission.statement` 필수 |
| MISSING_INTENT | error | `intent.purpose` 필수 |
| MISSING_FAILURE_CONDITIONS | warning | 피해야 할 실패 조건 없음 |
| MISSING_AUTHORITY | critical | authority 필드 없음 |
| MISSING_CCIR | error | CCIR 없음 |
| MISSING_ASSESSMENT | error | assessment 없음 |
| MISSING_MOE | warning | MOE 없음 |
| TASK_WITHOUT_PURPOSE | warning | task에 purpose 없음 |
| TOOL_WITHOUT_ROE | error | tool 사용이 있는데 ROE 없음 |

## 5. WARNO 규칙

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_PENDING_MISSION | error | pending_mission 없음 |
| MISSING_PREPARATION | warning | required_preparation 없음 |
| NO_INITIAL_CONSTRAINTS | warning | 초기 제약 없음 |

## 6. FRAGO 규칙

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_PARENT_ORDER | error | parent_order 없음 |
| MISSING_UNCHANGED_INTENT | error | unchanged_intent 없음 |
| NO_MODIFIED_TASKS | warning | 변경 task 없음 |
| INTENT_REDEFINED | critical | FRAGO가 상위 intent를 임의 변경 |

## 7. SITREP 규칙

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_STATUS | error | status 없음 |
| MISSING_NEXT_ACTION | warning | next_action 없음 |
| BLOCKED_WITHOUT_REQUEST | error | blocked가 있는데 필요한 결정 요청 없음 |
| RISK_HIDDEN | warning | high-risk task인데 risk 비어 있음 |

## 8. AAR 규칙

| Code | Severity | Rule |
| --- | --- | --- |
| MISSING_EXPECTED | error | expected 없음 |
| MISSING_ACTUAL | error | actual 없음 |
| MISSING_DELTA | warning | expected와 actual 차이 없음 |
| NO_SOP_UPDATE | warning | SOP 업데이트 여부 없음 |
| BLAME_ONLY_AAR | warning | 원인 분석 없이 책임 표현만 있음 |

## 9. 의미 기반 규칙

정규 스키마만으로 잡기 어려운 품질 규칙이다.

| Code | Severity | Pattern | 조치 |
| --- | --- | --- | --- |
| VAGUE_MISSION | warning | "잘", "적절히", "최대한" 중심 | 결과 중심 mission으로 수정 |
| VAGUE_AUTHORITY | error | "알아서 판단" | allowed/approval/prohibited로 분리 |
| NO_SOURCE_DISCIPLINE | warning | 리서치 작업인데 출처 요구 없음 | source requirement 추가 |
| HIGH_RISK_NO_APPROVAL | critical | Red 행동인데 approval 없음 | 실행 중단 |
| MOP_ONLY | warning | 수행지표만 있고 효과지표 없음 | MOE 추가 |

## 10. Validator 의사코드

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

## 11. 실패 메시지 원칙

좋은 실패 메시지는 사용자가 바로 고칠 수 있어야 한다.

나쁜 메시지:

```text
Invalid OPORD.
```

좋은 메시지:

```text
OPORD cannot be executed because authority.prohibited is missing.
Add allowed, approval_required, and prohibited actions before tasking agents.
```

## 12. 관련 문서

- `prompt-dsl.md`
- `implementation-guide.md`
- `tool-use-roe.md`
- `evaluation-metrics.md`
