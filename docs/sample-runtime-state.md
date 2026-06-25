# Sample Runtime State

## 0. 목적

이 문서는 군대식 LLM 런타임에서 저장해야 할 상태 객체의 예시를 제공한다.

구현자는 이 문서를 기준으로 JSON/YAML 스키마, DB 테이블, 이벤트 로그를 설계할 수 있다.

## 1. Mission State

```yaml
mission:
  id: M-20260618-001
  title: "군대식 LLM 프레임워크 확장"
  status: in_progress
  requester: user
  created_at: "2026-06-18T09:00:00+09:00"
  mission_statement: "군대식 지휘통제와 문서 체계를 LLM 운용 프레임워크로 문서화한다."
  intent:
    purpose: "왜곡 없는 AI 에이전트 운용체계를 만든다."
    success_conditions:
      - "문서 세트가 README에 연결된다."
      - "출처와 해석이 분리된다."
      - "실제 구현 가능한 DSL과 ROE가 정의된다."
    failure_conditions:
      - "출처 없는 주장"
      - "권한 없는 도구 실행"
      - "문서만 있고 실행 절차 없음"
  constraints:
    - "공개자료 사용"
    - "실제 군사작전 조언 금지"
  current_order: OPORD-20260618-001
```

## 2. OPORD State

```yaml
opord:
  id: OPORD-20260618-001
  mission_id: M-20260618-001
  situation:
    known_facts:
      - "기본 프레임워크 문서가 존재"
      - "한국 자료와 구현 문서가 필요"
    assumptions:
      - "한국군 세부 교리 공개자료는 제한적"
    constraints:
      - "공개자료 기반"
  mission:
    statement: "한국 자료, 구현 가이드, DSL, ROE, 조직도를 추가한다."
  execution:
    tasks:
      - id: T-001
        assigned_to: S2
        task: "한국 공개자료 조사"
      - id: T-002
        assigned_to: S3
        task: "구현 가이드 작성"
      - id: T-003
        assigned_to: S6
        task: "README와 source map 갱신"
  command_and_signal:
    ccir:
      pir:
        - "공식 한국 자료 확인 불가"
      ffir:
        - "README 링크 누락"
      eefi:
        - "민감정보 발견"
```

## 3. Agent Registry

```yaml
agents:
  - id: S2
    name: Intelligence Agent
    model: default
    readiness:
      public_source_research: T
      korean_source_research: P
    tools:
      green:
        - web.search
        - file.read
      amber:
        - authenticated_site.read
      black:
        - fabricate_source

  - id: S3
    name: Operations Agent
    readiness:
      markdown_authoring: T
      code_implementation: P
    tools:
      green:
        - file.write_markdown
        - shell.readonly
      amber:
        - package_install
      red:
        - deploy.production
```

## 4. Task Orders

```yaml
task_orders:
  - id: T-001
    mission_id: M-20260618-001
    assigned_to: S2
    task: "한국 공개 군사자료를 조사해 문서화한다."
    purpose: "한국형 보정 근거 확보"
    deliverables:
      - "docs/korean-military-sources.md"
    status: complete

  - id: T-002
    mission_id: M-20260618-001
    assigned_to: S3
    task: "실제 시스템 구현 가이드를 작성한다."
    purpose: "개념을 런타임 구조로 전환"
    deliverables:
      - "docs/implementation-guide.md"
      - "docs/reference-architecture.md"
    status: complete
```

## 5. Tool Request

```yaml
tool_request:
  id: TR-001
  mission_id: M-20260618-001
  actor: S3
  tool: filesystem
  action: create_file
  target: "docs/prompt-dsl.md"
  roe_class: Green
  approval_required: false
  reason: "문서화 범위 내 새 markdown 생성"
  result: success
```

## 6. Approval Request

```yaml
approval_request:
  id: AR-001
  mission_id: M-20260618-001
  actor: S3
  requested_action: "production deployment"
  tool: deploy
  target: "prod"
  roe_class: Red
  why_needed: "사용자에게 새 기능 공개"
  risk:
    - "서비스 장애"
    - "데이터 마이그레이션 실패"
  rollback:
    - "previous release restore"
  alternatives:
    - "preview deployment"
    - "dry-run"
  status: pending
```

## 7. SITREP Event

```yaml
sitrep:
  id: SITREP-001
  mission_id: M-20260618-001
  timestamp: "2026-06-18T10:00:00+09:00"
  status: in_progress
  completed:
    - "korean-military-sources.md"
    - "implementation-guide.md"
  in_progress:
    - "색인 갱신"
  blocked: []
  ccir: []
  risk:
    - "한국군 세부 교리 공개자료 제한"
  next_action:
    - "README 링크 검증"
```

## 8. FRAGO Event

```yaml
frago:
  id: FRAGO-001
  mission_id: M-20260618-001
  parent_order: OPORD-20260618-001
  reason: "사용자가 계속 진행 지시"
  unchanged_intent:
    - "군대식 LLM 프레임워크 문서화"
  modified_tasks:
    - "reference architecture 추가"
    - "sample runtime state 추가"
  new_constraints: []
```

## 9. Evidence Record

```yaml
evidence:
  id: E-001
  mission_id: M-20260618-001
  source_title: "국가법령정보센터"
  url: "https://www.law.go.kr/"
  source_type: official_law_database
  reliability: A
  claim: "군 관련 법령과 훈령의 공식 확인 경로"
  interpretation: "LLM authority와 ROE의 한국 제도 맥락 근거"
  linked_docs:
    - "korean-military-sources.md"
    - "tool-use-roe.md"
```

## 10. AAR Event

```yaml
aar:
  id: AAR-001
  mission_id: M-20260618-001
  expected:
    - "새 문서 작성"
    - "색인 연결"
  actual:
    - "문서 세트 확장"
    - "README 링크 검증"
  delta:
    - "git 저장소가 아니라 diff 검증 불가"
  causes:
    - "현재 작업 폴더에 .git 없음"
  sustain:
    - "README 링크 존재 검증"
    - "source map과 compendium 동시 갱신"
  improve:
    - "다음부터 runtime state 예시를 먼저 만들면 구현 문서가 더 안정적"
  sop_updates:
    - "새 문서 추가 시 README 링크 파일 존재 검증 수행"
```

## 11. 관련 문서

- `reference-architecture.md`
- `implementation-guide.md`
- `prompt-dsl.md`
- `tool-use-roe.md`
- `approval-ui-patterns.md`
