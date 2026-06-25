# Reference Architecture

## 0. 목적

이 문서는 군대식 LLM 운용 프레임워크를 실제 시스템으로 구현하기 위한 참조 아키텍처다.

대상은 다음과 같다.

- LLM 기반 업무 자동화 도구.
- 멀티에이전트 리서치/코딩/문서화 시스템.
- 승인 기반 도구 실행 플랫폼.
- 조직 내부 AI 운영체계.

## 1. 전체 구조

```text
Client UI
  |
  v
Mission Intake API
  |
  v
Orchestrator / AI Commander
  |
  +-- OPORD Compiler
  +-- Agent Registry
  +-- Policy / ROE Engine
  +-- Task Router
  +-- Battle Rhythm Scheduler
  |
  v
Agent Runtime
  |
  +-- S2 Research Agent
  +-- S3 Operations Agent
  +-- S4 Sustainment Agent
  +-- S6 Knowledge Agent
  +-- Red Team Agent
  +-- Evaluator Agent
  |
  v
Tool Gateway
  |
  +-- Filesystem
  +-- Shell
  +-- Browser/Web
  +-- API
  +-- Database
  +-- Deploy
  |
  v
State / Evidence / Audit Stores
```

## 2. 주요 컴포넌트

### 2.1 Client UI

역할:

- 사용자 요청 입력.
- OPORD 초안 확인.
- 승인 필요 action 검토.
- SITREP와 decision memo 확인.
- 최종 산출물과 AAR 확인.

필수 화면:

- Mission dashboard.
- Approval queue.
- Evidence viewer.
- Tool-use log.
- AAR history.

### 2.2 Mission Intake API

역할:

- 사용자 요청을 mission candidate로 변환.
- 요청 위험도 초기 분류.
- 필요한 추가 질문 생성.

출력:

```yaml
mission_candidate:
  statement:
  intent_guess:
  constraints:
  ambiguity:
  initial_risk:
```

### 2.3 Orchestrator / AI Commander

역할:

- mission과 intent 확정.
- OPORD 생성.
- task order 발행.
- authority gate 호출.
- CCIR escalation.

주의:

- Orchestrator는 위험 수용권자가 아니다.
- 사용자 승인 없이 Red/Amber 행동을 실행하지 않는다.

### 2.4 OPORD Compiler

역할:

- 자연어 요청을 prompt DSL로 변환.
- OPORD validation.
- 하위 에이전트 tasking 생성.

입력:

- user request.
- mission state.
- selected SOP.
- agent readiness.

출력:

- OPORD.
- task orders.
- validation warnings.

### 2.5 Agent Registry

관리 항목:

- role.
- responsibilities.
- tool permissions.
- readiness rating.
- recent AAR findings.
- model/provider.
- context limits.

### 2.6 Policy / ROE Engine

역할:

- tool request를 Green/Amber/Red/Black으로 분류.
- approval requirement 생성.
- prohibited action 차단.

입력:

```yaml
actor:
tool:
action:
target:
mission_context:
data_sensitivity:
```

출력:

```yaml
roe_decision:
  class: Amber
  reason:
  required_approval:
  safe_alternatives:
```

### 2.7 Tool Gateway

역할:

- 모든 외부 행동의 단일 관문.
- tool-use log 작성.
- dry-run 우선 실행.
- 결과를 state store에 기록.

금지:

- 에이전트가 gateway를 우회해 직접 tool 호출.

### 2.8 Evidence Store

저장:

- source metadata.
- claim.
- interpretation.
- reliability.
- linked output.
- checked_at.

### 2.9 State Store

저장:

- mission.
- OPORD.
- task orders.
- SITREP.
- FRAGO.
- decision memo.
- AAR.
- readiness updates.

### 2.10 Audit Store

저장:

- tool request.
- approval.
- execution result.
- blocked action.
- policy decision.

## 3. 데이터 흐름

### 3.1 일반 작업

```text
User request
-> Mission Intake
-> OPORD Compiler
-> ROE precheck
-> Task Router
-> Agent Runtime
-> Tool Gateway
-> Verification
-> Final response
-> AAR
```

### 3.2 승인 필요 작업

```text
Agent requests tool
-> Policy Engine returns Amber/Red
-> Decision Memo
-> User Approval UI
-> Approved or rejected
-> Tool Gateway executes or blocks
-> Audit Store
```

### 3.3 CCIR 발생

```text
Agent detects CCIR
-> Immediate SITREP
-> Orchestrator pauses affected task
-> Decision Board
-> FRAGO or stop
```

## 4. 저장소 스키마 개요

| Store | 주요 테이블/컬렉션 |
| --- | --- |
| mission_state | missions, opords, task_orders |
| operations_state | sitreps, fragos, decisions |
| evidence | sources, claims, interpretations |
| audit | tool_requests, approvals, policy_decisions |
| learning | aars, sop_updates, readiness |

## 5. 배포 패턴

### Local-first

적합:

- 개인 연구.
- 로컬 코딩 에이전트.
- 민감한 파일 작업.

특징:

- filesystem 중심.
- local state store.
- 사용자 직접 승인.

### Team Workspace

적합:

- 조직 문서화.
- 팀 코딩 자동화.
- 내부 지식관리.

특징:

- shared evidence store.
- approval queue.
- role-based access control.

### Enterprise Controlled Runtime

적합:

- 대규모 조직.
- 보안/감사 필수.
- 외부 API와 배포 포함.

특징:

- central policy engine.
- audit logging.
- SSO/RBAC.
- model gateway.
- data loss prevention.

## 6. 보안 경계

| 경계 | 통제 |
| --- | --- |
| User data -> model | redaction, policy check |
| Agent -> tool | tool gateway |
| Tool -> external service | approval and audit |
| Evidence -> output | citation check |
| Secret -> logs | masking and EEFI handling |

## 7. 최소 구현 순서

1. prompt DSL schema.
2. mission state JSON 저장.
3. tool-use ROE checker.
4. approval request UI.
5. evidence store.
6. SITREP/FRAGO event log.
7. AAR and readiness update.
8. multi-agent routing.

## 8. 관련 문서

- `implementation-guide.md`
- `prompt-dsl.md`
- `tool-use-roe.md`
- `sample-runtime-state.md`
- `approval-ui-patterns.md`
