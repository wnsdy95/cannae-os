# Implementation Guide

## 0. 목적

이 문서는 군대식 LLM 운용 프레임워크를 실제 소프트웨어, 에이전트 시스템, 업무 자동화 환경에 구현하는 방법을 정의한다.

개념 문서의 핵심을 런타임 구조로 바꾸면 다음과 같다.

```text
User request
-> Mission analysis
-> OPORD generation
-> Authority and ROE check
-> Agent tasking
-> Tool-gated execution
-> SITREP and FRAGO loop
-> Verification
-> AAR and memory update
```

## 1. 구현 원칙

| 원칙 | 구현 의미 |
| --- | --- |
| Intent preservation | 사용자 의도를 별도 필드로 저장하고 모든 하위 작업에 전달 |
| Role separation | 리서치, 실행, 검토, 지속지원 역할을 분리 |
| Authority before action | 도구 실행 전 권한과 ROE 확인 |
| Evidence-first | 출처 기반 주장은 evidence store에 연결 |
| Event-driven reporting | 시간보다 상태 변화와 CCIR 중심 보고 |
| Assessment loop | 완료 후 MOP/MOE/AAR 기록 |
| Auditability | 누가 어떤 근거와 권한으로 실행했는지 추적 |

## 2. 최소 시스템 구성

| 컴포넌트 | 역할 |
| --- | --- |
| Mission Intake | 사용자 요청을 mission, intent, constraints로 분해 |
| OPORD Compiler | 구조화 프롬프트 또는 task order 생성 |
| Agent Registry | 역할, 권한, 숙련도, 도구 접근권 관리 |
| Tool Gateway | 파일, 브라우저, API, 배포 도구 사용을 ROE로 통제 |
| Evidence Store | 출처, 주장, 신뢰도, 링크 저장 |
| State Store | SITREP, FRAGO, decision log, AAR 저장 |
| Evaluator | MOP/MOE, 테스트, source discipline 평가 |
| Human Approval UI | 승인 필요 행동을 사용자에게 제시 |

## 3. 데이터 모델

### 3.1 Mission

```yaml
mission:
  id: M-0001
  title: "군대식 LLM 프레임워크 문서화"
  statement: "군대식 지휘통제 체계를 LLM 운용 프레임워크로 문서화한다."
  intent:
    purpose: "왜곡 없는 AI 작업 지휘체계를 만든다."
    success_conditions:
      - "문서 세트가 README에 연결된다."
      - "출처와 적용 해석이 분리된다."
    failure_conditions:
      - "출처 없는 군사 일반론을 핵심 근거로 사용한다."
  constraints:
    - "공개자료만 사용"
    - "실제 군사작전 조언 금지"
  created_by: "user"
```

### 3.2 Agent Role

```yaml
agent_role:
  id: S2
  name: "Intelligence Agent"
  responsibilities:
    - "출처 수집"
    - "불확실성 표시"
    - "PIR 관리"
  authorities:
    allowed:
      - "public_web_research"
      - "source_summary"
    approval_required:
      - "non_public_source_use"
    prohibited:
      - "fabricate_source"
      - "hide_uncertainty"
  readiness:
    source_collection: T
    korean_sources: P
```

### 3.3 Task Order

```yaml
task_order:
  id: T-0001
  mission_id: M-0001
  assigned_to: S2
  task: "한국군 공개자료를 조사하고 LLM 적용점을 정리한다."
  purpose: "한국형 프레임워크 보정 근거 확보"
  deliverables:
    - "korean-military-sources.md"
    - "source-map update"
  ccir:
    - "공식 출처 확인 불가"
    - "법령과 해석 충돌"
  verification:
    - "각 출처에 URL 포함"
    - "출처 주장과 LLM 해석 분리"
```

### 3.4 Tool Request

```yaml
tool_request:
  id: TR-0001
  task_id: T-0001
  actor: S3
  tool: "filesystem.write"
  action: "create_markdown_file"
  target: "docs/implementation-guide.md"
  risk_level: low
  roe_class: allowed
  approval_status: not_required
```

### 3.5 Evidence

```yaml
evidence:
  id: E-0001
  source_title: "ADP 6-0 Mission Command"
  url: "https://armypubs.army.mil/..."
  source_type: "official_doctrine"
  reliability: A
  claim: "Mission command emphasizes commander's intent and disciplined initiative."
  interpretation: "LLM 에이전트에는 intent와 authority boundary가 필요하다."
  linked_documents:
    - "agent-roles-and-authority.md"
```

### 3.6 SITREP

```yaml
sitrep:
  id: S-0001
  mission_id: M-0001
  status: "in_progress"
  completed:
    - "한국 공개자료 조사"
  in_progress:
    - "구현 가이드 작성"
  blocked: []
  ccir: []
  risk:
    - "한국군 세부 교리 공개자료 제한"
  next_action: "prompt DSL 작성"
```

### 3.7 AAR

```yaml
aar:
  id: AAR-0001
  mission_id: M-0001
  expected: "문서 세트를 확장한다."
  actual: "새 문서와 README 연결 완료."
  delta:
    - "한국군 자료는 법령/정책자료 중심으로 제한됨."
  causes:
    - "세부 작전교리 공개성 제한."
  updates:
    - "한국 자료 사용 한계 명시 SOP 추가."
```

## 4. 런타임 상태 머신

```text
Intake
-> MissionAnalysis
-> OPORDDraft
-> RiskAndAuthorityCheck
-> Tasking
-> Execution
-> Verification
-> Assessment
-> AAR
-> MemoryUpdate
```

### 상태별 책임

| 상태 | 입력 | 출력 | 중단 조건 |
| --- | --- | --- | --- |
| Intake | user request | raw mission | 요청이 불명확 |
| MissionAnalysis | raw mission | mission, intent, constraints | 위험 도메인 |
| OPORDDraft | mission | OPORD | intent 누락 |
| RiskAndAuthorityCheck | OPORD | ROE class | approval required |
| Tasking | OPORD | task orders | 역할 불명확 |
| Execution | task orders | artifacts, SITREP | CCIR 발생 |
| Verification | artifacts | MOP/MOE result | 검증 실패 |
| Assessment | verification | final judgment | 효과 미달 |
| AAR | result | lessons | 반복 실패 |
| MemoryUpdate | lessons | SOP/source updates | 저장 실패 |

## 5. 권한 게이트 구현

도구 호출 전에는 항상 아래 함수를 통과시킨다.

```text
check_roe(actor, tool, action, target, context) -> allowed | approval_required | prohibited
```

판정 기준:

- actor의 역할 권한.
- action의 위험도.
- target의 민감도.
- mission constraints.
- user approval state.
- system policy.

결과별 동작:

| 결과 | 동작 |
| --- | --- |
| allowed | 실행 후 로그 |
| approval_required | 실행 중단, decision memo 생성 |
| prohibited | 실행 거부, 이유와 대안 보고 |

## 6. Evidence-first 구현

출처 기반 작업에서는 모델 출력보다 evidence object가 먼저 생겨야 한다.

나쁜 흐름:

```text
모델이 결론 작성
-> 나중에 출처 검색
```

좋은 흐름:

```text
출처 수집
-> claim 추출
-> interpretation 분리
-> source map 저장
-> 문서 작성
```

Evidence store 최소 필드:

- source title.
- URL.
- source type.
- reliability.
- claim.
- interpretation.
- linked mission.
- linked document.
- checked at.

## 7. 파일/문서 저장 구조

권장 구조:

```text
docs/
  doctrine/
  sop/
  cases/
  evals/
  sources/
state/
  missions/
  sitreps/
  frago/
  decisions/
  aar/
logs/
  tool-use/
  approvals/
  verification/
```

현재 프로젝트는 단순 문서 세트이므로 `docs/`에 모두 모아두지만, 실제 앱에서는 상태와 로그를 분리해야 한다.

## 8. 구현 단계

### Phase 1: Manual Framework

목표:

- 사람이 README와 문서를 읽고 직접 프롬프트를 작성.

구성:

- 문서 세트.
- 템플릿.
- source map.
- evaluation sheet.

### Phase 2: Assisted Orchestrator

목표:

- 시스템이 사용자 요청을 OPORD 초안으로 변환.
- 사람은 승인과 수정만 수행.

구성:

- OPORD compiler.
- role tasking generator.
- authority checklist.
- source map updater.

### Phase 3: Tool-Gated Agent Runtime

목표:

- 에이전트가 도구를 쓰되 ROE gate를 통과.

구성:

- Agent registry.
- Tool gateway.
- Approval UI.
- SITREP/FRAGO state store.
- Evaluator.

### Phase 4: Learning Organization

목표:

- AAR 결과가 SOP와 prompt DSL에 자동 반영.

구성:

- AAR parser.
- SOP update recommender.
- readiness rating.
- experiment runner.

## 9. 최소 API 설계

```text
POST /missions
POST /missions/{id}/opord
POST /missions/{id}/task-orders
POST /tool-requests/check
POST /tool-requests/{id}/approve
POST /sitreps
POST /fragos
POST /evidence
POST /assessments
POST /aars
GET  /missions/{id}/timeline
GET  /agents/{id}/readiness
```

## 10. 운영 대시보드

대시보드는 예쁜 화면보다 결심에 필요한 정보를 보여줘야 한다.

필수 패널:

- Active missions.
- Decision required.
- CCIR alerts.
- Tool requests.
- Source confidence.
- Verification status.
- AAR updates.
- Agent readiness.

## 11. 실패 모드

| 실패 | 원인 | 통제 |
| --- | --- | --- |
| 에이전트가 무단 실행 | ROE gate 없음 | tool gateway |
| 출처 없는 주장 | evidence store 없음 | source discipline score |
| 문맥 손실 | state 저장 안 함 | SITREP and mission state |
| 과도한 병렬화 | CoS 통합 없음 | task order dependency |
| 승인 병목 | 모든 것을 승인 대상으로 둠 | risk-based authority |
| 형식주의 | 문서가 decision과 연결 안 됨 | decision-linked battle rhythm |

## 12. 관련 문서

- `prompt-dsl.md`
- `tool-use-roe.md`
- `agent-roles-and-authority.md`
- `agent-battle-rhythm.md`
- `evaluation-metrics.md`
- `experiments.md`
