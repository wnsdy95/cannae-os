# Agent Runtime Playbook

## 0. 목적

이 문서는 군대식 LLM 런타임을 실제로 운영할 때 따를 절차를 정의한다.

대상:

- Orchestrator 운영자.
- 에이전트 런타임 개발자.
- 내부 AI 도구 관리자.
- 문서화/코딩/리서치 자동화 시스템 운영자.

핵심 원칙:

```text
런타임은 모델 호출기가 아니라 지휘통제 시스템이다.
```

## 1. Daily Startup

운영 시작 시 확인한다.

```text
1. active missions 확인.
2. blocked tasks 확인.
3. pending approval 확인.
4. failed tool requests 확인.
5. evidence store sync 확인.
6. agent readiness 변화 확인.
7. unresolved AAR update 확인.
```

출력:

```yaml
startup_brief:
  active_missions:
  pending_decisions:
  high_risk_items:
  degraded_agents:
  required_actions:
```

## 2. Mission Intake Procedure

1. 사용자 요청을 원문 그대로 저장한다.
2. mission statement를 한 문장으로 작성한다.
3. intent를 purpose, success, failure로 나눈다.
4. constraints와 assumptions를 분리한다.
5. initial risk level을 부여한다.
6. OPORD draft를 만든다.
7. validator를 실행한다.
8. critical/error가 있으면 backbrief 또는 추가 질문으로 전환한다.

## 3. OPORD Approval Procedure

OPORD는 다음 조건을 만족해야 tasking 가능하다.

- mission statement 존재.
- intent purpose 존재.
- authority allowed/approval/prohibited 존재.
- CCIR 존재.
- MOP/MOE 존재.
- tool-use ROE와 충돌 없음.

승인 없이 진행 가능한 경우:

- Low risk.
- Green tool actions only.
- public/internal data only.
- reversible outputs.

승인 필요한 경우:

- Red tool action.
- external state change.
- cost risk.
- sensitive data.
- irreversible action.

## 4. Tasking Procedure

1. OPORD에서 task order를 생성한다.
2. 각 task에 assigned_to, task, purpose, deliverables를 둔다.
3. S2 task는 evidence requirement를 포함한다.
4. S3 task는 verification requirement를 포함한다.
5. S4 task는 sustainment estimate를 포함한다.
6. S6 task는 documentation/update target을 포함한다.
7. Red Team task는 independence boundary를 포함한다.

## 5. Execution Loop

```text
Task received
-> Backbrief
-> Tool request
-> ROE check
-> Execute or request approval
-> Record output
-> Verify
-> SITREP
```

실행 중단 조건:

- CCIR 발생.
- validator critical issue.
- tool gateway Red/Black decision.
- evidence conflict.
- user changes mission.
- test failure with unknown blast radius.

## 6. SITREP Procedure

SITREP는 시간표보다 상태 변화 중심으로 발행한다.

발행 트리거:

- task 시작.
- task 완료.
- blocked 발생.
- CCIR 발생.
- approval 필요.
- risk level 상승.
- final verification 전.

필수 필드:

- completed.
- in_progress.
- blocked.
- ccir.
- risk.
- next_action.

## 7. FRAGO Procedure

사용자 요구 변경, 출처 충돌, 도구 실패, 범위 변경이 생기면 FRAGO를 발행한다.

FRAGO는 반드시 아래를 구분한다.

- unchanged intent.
- modified tasks.
- new constraints.
- affected artifacts.
- required confirmation.

금지:

- FRAGO에서 상위 intent를 조용히 바꾸는 것.
- 기존 OPORD 전체를 덮어써 변경 이력을 잃는 것.

## 8. Approval Handling

Amber/Red tool request가 발생하면:

1. tool request를 중단 상태로 둔다.
2. approval request를 만든다.
3. action, tool, target, risk, rollback, alternatives를 표시한다.
4. 사용자 승인 범위를 기록한다.
5. 승인되면 해당 action만 실행한다.
6. 거부되면 대체 경로를 제시한다.

승인 만료:

- mission 변경.
- target 변경.
- risk level 상승.
- 정해진 시간 만료.

## 9. Evidence Handling

리서치 task는 evidence-first로 진행한다.

절차:

1. source metadata 저장.
2. claim 추출.
3. interpretation 분리.
4. reliability rating.
5. linked document 지정.
6. source map 반영.

금지:

- 결론 먼저 작성 후 출처 끼워넣기.
- 출처와 해석 섞기.
- 불확실성 삭제.

## 10. Verification Procedure

검증은 작업 유형별로 다르다.

| 작업 | 검증 |
| --- | --- |
| 문서 작성 | 링크, 헤더, 색인, line count |
| 리서치 | source map, reliability, uncertainty |
| 코드 | 테스트, lint, diff scope |
| 도구 실행 | tool-use log, approval, rollback |
| 배포 | preview, health check, rollback plan |

## 11. Incident Procedure

incident 예:

- 민감정보 출력.
- 승인 없는 Red action.
- 허위 출처 발견.
- 데이터 손상.
- 외부 배포 실수.

절차:

1. affected task 중단.
2. incident SITREP 작성.
3. Commander와 사용자에게 보고.
4. containment action.
5. evidence/log 보존.
6. recovery 또는 rollback.
7. AAR.
8. SOP/ROE 업데이트.

## 12. AAR Procedure

mission 완료 후:

1. expected와 actual 비교.
2. delta 기록.
3. cause 분석.
4. sustain/improve 분리.
5. SOP update 필요 여부 결정.
6. readiness ledger update.
7. risk register update.

## 13. Shutdown Procedure

작업 종료 전:

- active task 상태 저장.
- pending approvals 저장.
- unresolved CCIR 저장.
- source map과 compendium 갱신.
- README 링크 검증.
- next action queue 갱신.

## 14. 관련 문서

- `reference-architecture.md`
- `sample-runtime-state.md`
- `tool-use-roe.md`
- `approval-ui-patterns.md`
- `military-ai-risk-register.md`
- `agent-readiness-ledger.md`
