# Command Post Dashboard

## 0. 목적

이 문서는 군대식 LLM 런타임의 command post dashboard 화면 설계를 정의한다.

Dashboard는 멋진 모니터링 화면이 아니라 지휘관이 결심할 수 있게 만드는 화면이다. 보여줄 정보와 숨길 정보를 구분해야 한다.

## 1. 핵심 화면

| 화면 | 목적 |
| --- | --- |
| Mission Board | 현재 임무 상태와 intent 확인 |
| Approval Queue | 승인 필요한 도구 행동 처리 |
| CCIR Alerts | 즉시 보고 정보 |
| Evidence Viewer | 주장과 출처 추적 |
| Tool Use Log | 도구 실행 감사 |
| Risk Board | active risk와 controls |
| Readiness Board | 에이전트별 준비태세 |
| AAR Library | 학습과 SOP 업데이트 |

## 2. Mission Board

필드:

- mission id.
- mission statement.
- commander's intent.
- status.
- active tasks.
- next decision point.
- current risk level.
- latest SITREP.

표시 원칙:

- mission과 intent는 항상 상단에 고정.
- task count보다 blocked/decision required를 우선 표시.
- 완료율보다 risk와 decision point를 강조.

## 3. Approval Queue

카드 필드:

```text
Action:
Actor:
Tool:
Target:
ROE:
Why needed:
Risk:
Rollback:
Alternatives:
Approval scope:
```

버튼:

- Approve once.
- Dry-run only.
- Revise request.
- Reject.

금지:

- "Approve all" 기본 버튼.
- risk 없는 승인.
- target 없는 승인.

## 4. CCIR Alerts

우선순위:

1. EEFI / secret exposure.
2. Red/Black tool issue.
3. mission/intent conflict.
4. evidence conflict.
5. blocked task requiring decision.

Alert 예:

```text
EEFI detected
Mission: M-001
Agent: S2
Issue: Possible API token found in file.
Action: Output suppressed. Awaiting user decision.
```

## 5. Evidence Viewer

기능:

- claim과 source 연결.
- reliability rating 표시.
- interpretation 분리.
- linked document 표시.
- checked_at 표시.

목적:

- 지휘관이 "이 주장이 어디서 왔는가"를 즉시 확인.
- Red Team이 unsupported claim을 빠르게 찾음.

## 6. Tool Use Log

필드:

- timestamp.
- actor.
- tool.
- action.
- target.
- ROE class.
- approval id.
- result.
- rollback.

필터:

- Red/Black.
- failed.
- approval required.
- external effect.
- sensitive data.

## 7. Risk Board

표시:

- active high/critical risks.
- owner.
- controls.
- next review.
- linked CCIR.
- residual risk.

좋은 risk card:

```text
R-003 Unauthorized high-risk action
Level: Critical
Control: Tool gateway blocks Red without approval
Status: Active
Last event: none
```

## 8. Readiness Board

표시:

- agent.
- task.
- rating.
- evidence.
- limitations.
- next training.

사용:

- task assignment 전 readiness 확인.
- P/U/X agent는 backbrief 또는 supervision 요구.

## 9. AAR Library

표시:

- mission.
- expected vs actual.
- delta.
- causes.
- SOP updates.
- readiness changes.

목적:

- 같은 실패 반복 방지.
- SOP와 policy engine rule 개선.

## 10. Dashboard Anti-Patterns

| Anti-pattern | 문제 | 교정 |
| --- | --- | --- |
| 완료율 중심 | 위험과 결심 지점을 숨김 | decision required 우선 |
| 로그 과다 노출 | 지휘 판단 방해 | high signal filter |
| approval fatigue | 모든 행동 승인 | ROE 등급별 큐 |
| source hidden | 주장 검증 어려움 | evidence viewer |
| AAR buried | 학습 누락 | AAR update panel |

## 11. 관련 문서

- `approval-ui-patterns.md`
- `reference-architecture.md`
- `sample-runtime-state.md`
- `policy-engine-rules.md`
- `agent-readiness-ledger.md`
