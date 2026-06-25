# Prompt DSL

## 0. 목적

이 문서는 OPORD, WARNO, FRAGO, SITREP, AAR를 기계가 읽고 검증할 수 있는 프롬프트 DSL로 정의한다.

목표는 멋있는 형식이 아니라, 사용자 의도와 권한 경계를 구조화해 에이전트가 일관되게 처리하게 하는 것이다.

## 1. DSL 설계 원칙

| 원칙 | 설명 |
| --- | --- |
| Explicit intent | mission과 intent를 분리한다 |
| Machine-checkable | 필수 필드를 검증할 수 있어야 한다 |
| Human-readable | 사용자가 그대로 읽고 수정할 수 있어야 한다 |
| Role-aware | 하위 에이전트 tasking이 가능해야 한다 |
| ROE-linked | 도구 사용 권한과 연결되어야 한다 |
| Assessment-ready | MOP/MOE와 검증 기준을 포함해야 한다 |

## 2. 공통 스키마

```yaml
schema_version: "0.1"
type: "OPORD"
id: "ORDER-0001"
created_at: "2026-06-18"
created_by: "Commander"
mission_id: "M-0001"
classification: "public"
```

공통 필드:

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| schema_version | yes | DSL 버전 |
| type | yes | OPORD, WARNO, FRAGO, SITREP, AAR |
| id | yes | 문서 ID |
| mission_id | yes | 연결된 mission |
| created_by | yes | 작성 주체 |
| classification | yes | public, internal, sensitive |

## 3. OPORD DSL

```yaml
schema_version: "0.1"
type: "OPORD"
id: "OPORD-0001"
mission_id: "M-0001"
created_by: "Commander"
classification: "public"

situation:
  background:
    - "군대식 LLM 프레임워크 문서화 진행 중"
  known_facts:
    - "현재 docs/에 프레임워크 문서 세트가 존재"
  assumptions:
    - "공개자료 중심으로 리서치"
  constraints:
    - "비공개 군 자료 사용 금지"

mission:
  statement: "군대식 작동방식을 LLM 운용 프레임워크로 문서화한다."
  target_end_state:
    - "문서 세트가 README에 연결됨"
    - "출처와 적용 해석이 분리됨"

intent:
  purpose: "왜곡 없는 AI 작업 지휘체계를 만든다."
  key_tasks:
    - "자료 조사"
    - "문서화"
    - "SOP와 평가 체계 작성"
  expanded_purpose:
    - "다음 작업자가 이어서 확장할 수 있어야 한다."
  failure_to_avoid:
    - "출처 없는 일반론"
    - "실제 군사작전 조언"

execution:
  concept:
    - "리서치, 구조화, 템플릿화, 평가 설계 순서로 진행"
  tasks:
    - assigned_to: "S2"
      task: "출처 조사와 source map 갱신"
      purpose: "근거 추적성 확보"
    - assigned_to: "S3"
      task: "문서 구조와 실행 절차 작성"
      purpose: "운용 가능성 확보"
  coordinating_instructions:
    - "새 문서는 README에 연결"
    - "출처 없는 주장은 가설로 표시"

sustainment:
  tools:
    - "filesystem"
    - "web research"
  context_budget: "medium"
  fallback:
    - "공식 출처가 부족하면 한계를 명시"

command_and_signal:
  authority:
    allowed:
      - "markdown file creation"
      - "public source summary"
    approval_required:
      - "external publishing"
    prohibited:
      - "classified source use"
      - "fabricated citation"
  ccir:
    pir:
      - "한국군 공개자료 확인 불가"
    ffir:
      - "문서 링크 누락"
    eefi:
      - "민감 정보 발견"
  reports:
    sitrep_trigger:
      - "새 문서 세트 추가"
      - "CCIR 발생"

assessment:
  mop:
    - "문서 생성"
    - "링크 검증"
  moe:
    - "다음 작업자가 실행 가능"
  verification:
    - "rg --files"
    - "wc -l"
```

## 4. WARNO DSL

WARNO는 세부 계획 전 조기 경고와 착수 준비를 위한 문서다.

```yaml
schema_version: "0.1"
type: "WARNO"
id: "WARNO-0001"
mission_id: "M-0001"

warning:
  pending_mission: "한국군 공개자료와 구현 문서 추가"
  likely_tasks:
    - "korean-military-sources.md 작성"
    - "implementation-guide.md 작성"
    - "prompt-dsl.md 작성"
    - "tool-use-roe.md 작성"
  initial_constraints:
    - "공개자료만 사용"
  required_preparation:
    - "현재 문서 세트 확인"
    - "공식 한국 자료 검색"
  earliest_execution: "immediate"
```

## 5. FRAGO DSL

FRAGO는 전체 OPORD를 다시 쓰지 않고 변경된 부분만 전달한다.

```yaml
schema_version: "0.1"
type: "FRAGO"
id: "FRAGO-0001"
mission_id: "M-0001"
parent_order: "OPORD-0001"

change:
  reason: "사용자가 계속 진행 요청"
  unchanged_intent:
    - "군대식 LLM 프레임워크 문서화"
    - "출처와 적용 해석 분리"
  modified_tasks:
    - task: "한국군 공개자료 문서 추가"
      assigned_to: "S2"
    - task: "프롬프트 DSL 작성"
      assigned_to: "S3"
  new_constraints:
    - "한국군 자료는 공개 한계 명시"
  required_confirmation:
    - "README와 source map 갱신"
```

## 6. SITREP DSL

```yaml
schema_version: "0.1"
type: "SITREP"
id: "SITREP-0001"
mission_id: "M-0001"

status:
  overall: "in_progress"
  completed:
    - "현재 문서 세트 확인"
    - "한국 공개자료 리서치"
  in_progress:
    - "implementation guide 작성"
  blocked: []
  ccir:
    - type: "PIR"
      item: "한국 세부 작전교리 공개성 제한"
      action: "한계 명시"
  risk:
    - "공개 정책자료를 세부 작전교리로 과잉 해석할 위험"
  next_action:
    - "tool-use ROE 작성"
```

## 7. AAR DSL

```yaml
schema_version: "0.1"
type: "AAR"
id: "AAR-0001"
mission_id: "M-0001"

review:
  expected:
    - "문서 세트 확장"
  actual:
    - "새 문서 4개 생성"
  delta:
    - "한국 자료는 법령/정책 중심으로 제한됨"
  causes:
    - "세부 군사 교리 공개 제한"
  sustain:
    - "README와 source map 동시 갱신"
  improve:
    - "한국어 용어와 영어 교리 용어 차이 추가 연구"
  sop_updates:
    - "한국 자료 사용 한계를 명시하는 SOP 추가"
```

## 8. Validation Rules

### OPORD 필수 규칙

- `mission.statement`은 반드시 있어야 한다.
- `intent.purpose`는 반드시 있어야 한다.
- `authority.allowed`, `authority.approval_required`, `authority.prohibited` 중 최소 하나 이상 있어야 한다.
- `assessment.mop`와 `assessment.moe`는 모두 있어야 한다.
- `ccir`는 PIR, FFIR, EEFI 중 최소 하나를 포함해야 한다.

### FRAGO 필수 규칙

- `parent_order`가 있어야 한다.
- `unchanged_intent`가 있어야 한다.
- 변경된 task와 변경되지 않은 intent를 구분해야 한다.

### SITREP 필수 규칙

- completed, in_progress, blocked를 분리해야 한다.
- risk 또는 ccir가 없으면 빈 배열로 명시한다.
- next_action이 있어야 한다.

### AAR 필수 규칙

- expected와 actual을 분리해야 한다.
- delta와 causes를 적어야 한다.
- sustain 또는 improve 중 하나 이상 있어야 한다.
- SOP 업데이트 여부를 명시해야 한다.

## 9. Prompt Compiler

DSL은 모델에게 그대로 줄 수도 있지만, runtime에서는 다음 구조로 컴파일하는 것이 좋다.

```text
System:
너는 지정된 role과 ROE 안에서만 행동한다.

Developer:
DSL validation rules와 output contract.

User:
OPORD/WARNO/FRAGO 본문.

Assistant first response:
Backbrief + assumptions + CCIR check.
```

## 10. Anti-Patterns

| Anti-pattern | 문제 |
| --- | --- |
| mission과 intent를 합침 | 해야 할 일과 이유가 섞임 |
| authority 생략 | 도구 실행 경계가 사라짐 |
| MOP만 있음 | 효과 없는 산출물을 성공으로 판단 |
| FRAGO가 전체 재작성 | 변경 이력 추적 불가 |
| SITREP에 risk 없음 | 지휘판단에 필요한 정보 누락 |
| AAR가 감상문 | SOP 개선으로 연결 안 됨 |

## 11. 관련 문서

- `prompt-templates.md`
- `implementation-guide.md`
- `tool-use-roe.md`
- `evaluation-metrics.md`
- `case-studies.md`
