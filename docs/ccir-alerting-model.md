# CCIR Alerting Model

## 0. 목적

CCIR는 commander critical information requirements다. 모든 정보가 보고 대상이 아니다. 지휘관의 결심을 바꾸는 정보만 우선 보고 대상이다.

LLM 운용에서 CCIR가 없으면 다음 문제가 생긴다.

- 에이전트가 사소한 진행상황을 과보고한다.
- 정작 승인, 위험, 불확실성은 늦게 올라온다.
- dashboard가 로그 뷰어가 되고 결심 도구가 되지 못한다.

이 문서는 PIR, FFIR, EEFI, decision point를 alert routing 규칙으로 바꾼다.

## 1. CCIR 분류

| 유형 | 군대식 의미 | LLM runtime 의미 | 예시 |
| --- | --- | --- | --- |
| PIR | 우선 정보요구. 적/환경/상황에 관한 결심정보 | 리서치나 외부 사실 검증에 필요한 정보 | 출처가 공식인지, 최신 정책이 바뀌었는지 |
| FFIR | 아군 정보요구. 임무 수행능력과 자원 상태 | tool, token, file, test, agent readiness 문제 | validator 실패, API quota 부족 |
| EEFI | 보호해야 할 아군 핵심정보 | 노출 금지 데이터와 context sharing 제한 | secret, credential, private user data |
| Decision Point | 지휘관 결심이 필요한 시점 | approval, priority, scope, risk acceptance | Red tool action, FRAGO 필요 |

## 2. Alert severity

| Severity | 조건 | action |
| --- | --- | --- |
| Info | 기록은 필요하나 결심 영향 낮음 | event log 기록 |
| Watch | 추적 필요, 아직 결심 불필요 | dashboard watch list |
| Amber | 결심 가능성 있음, 제한된 위험 | SITREP 또는 decision packet draft |
| Red | 승인 전 실행 금지 | approval request and block |
| Black | 금지 또는 보호 위반 | reject, suppress output, incident AAR |

## 3. Routing matrix

| Alert type | Primary route | Secondary route | Output |
| --- | --- | --- | --- |
| PIR | S2 -> CoS | Source Review WG | evidence packet |
| FFIR | S3/S4/S6 -> CoS | Current Ops Sync | SITREP, resource plan |
| EEFI | S6/Protection -> Commander | Red Team | suppression, incident record |
| Decision Point | CoS -> Commander | Red Team/Evaluator | approval, FRAGO, reject |

규칙:

- EEFI는 정보요구이면서 보호대상이다. 보고 시에도 민감정보 원문을 반복 노출하지 않는다.
- Red alert는 자동 실행을 막아야 한다.
- Amber alert는 commander에게 바로 올릴지 CoS가 packet으로 묶을지 판단한다.
- Info/Watch는 과보고하지 않고 dashboard projection에만 남긴다.

## 4. Alert object

```json
{
  "alert_id": "ALERT-DEMO-001",
  "mission_id": "M-DEMO-001",
  "type": "DECISION_POINT",
  "severity": "Red",
  "source_event_id": "EVT-DEMO-008",
  "owner": "COS",
  "title": "deploy_production blocked",
  "why_it_matters": "Production deployment changes external state and requires explicit approval.",
  "recommended_route": "Commander Board",
  "required_decision": "Approve once, revise, or reject.",
  "deadline": "before tool execution",
  "sensitive": false,
  "status": "open"
}
```

## 5. Detection rules

| Rule | Condition | Alert |
| --- | --- | --- |
| Red tool request | `roe_class = Red` and no approved scope | Decision Point, Red |
| Black action | `roe_class = Black` or prohibited target/action | EEFI/Decision Point, Black |
| Validator failure | schema or semantic validation error | FFIR, Amber |
| Critical validator failure | missing intent/authority/approval boundary | FFIR/Decision Point, Red |
| Source uncertainty | source reliability below threshold | PIR, Amber |
| Secret pattern | secret/token/private key/password in output or target | EEFI, Black |
| Scope drift | task no longer fits OPORD intent | Decision Point, Amber/Red |
| Context handoff needed | long-running task or compaction risk | FFIR, Watch |
| Readiness low | agent readiness U/X for requested autonomy | FFIR/Decision Point, Amber |

## 6. SITREP, approval request, FRAGO 분기

| 상황 | 산출물 |
| --- | --- |
| 상태 공유만 필요 | SITREP |
| 도구 실행 승인이 필요 | Approval Request |
| mission scope, priority, authority 변경 | FRAGO |
| source claim 검증 필요 | Evidence Review Packet |
| 위험 통제 실패 | Incident SITREP + AAR |
| 반복 문제 | SOP update request |

판정:

- "실행해도 되는가?"가 질문이면 approval request.
- "임무가 바뀌었는가?"가 질문이면 FRAGO.
- "무엇이 현재 상태인가?"가 질문이면 SITREP.
- "이 주장을 믿어도 되는가?"가 질문이면 evidence review.

## 7. Dashboard projection

Dashboard는 alert를 다음 panel로 나눈다.

| Panel | 표시 조건 |
| --- | --- |
| Approval Queue | Red decision point, pending approval |
| CCIR Alerts | PIR/FFIR/EEFI/Decision Point 중 Amber 이상 |
| Watch List | Watch severity, long-running risk |
| Evidence Review | source reliability issue, interpretation risk |
| Current Ops | blocked task, failed check, degraded resource |
| Protection | EEFI, sensitive data, context releasability issue |

표시 금지:

- EEFI 원문.
- credential, token, private key.
- 필요 이상으로 긴 chain of thought.
- 출처 없는 단정.

## 8. Prompt rule

```text
보고 전에 각 항목을 CCIR로 분류하라.
- PIR: 결심에 필요한 외부/상황 정보
- FFIR: 수행능력, 도구, 테스트, 자원 문제
- EEFI: 보호해야 할 정보
- DECISION_POINT: commander approval 또는 FRAGO 필요

CCIR에 해당하지 않는 세부 진행상황은 요약하거나 생략하라.
Red 또는 Black alert는 실행하지 말고 approval/request 또는 reject로 멈춰라.
```

## 9. 구현 후보

schema:

- `ccir-alert.schema.json`
- `decision-packet.schema.json`

prototype:

- `alert-router.js`: event log와 policy decision을 읽어 alert projection 생성.
- `ccir-linter.js`: SITREP에 CCIR 분류가 없는 blocked item을 실패 처리.
- dashboard `ccir_alerts` panel을 event-derived alert로 교체.

## 10. 출처 앵커

- Joint Staff CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507

## 11. 현 단계 결론

CCIR alerting의 목표는 보고량 증가가 아니라 결심 품질 향상이다.

LLM runtime에서 보고 규칙은 다음 한 문장으로 압축된다.

> 지휘관의 결심, 임무 수행능력, 보호해야 할 정보, 승인 필요 행동에 영향을 주지 않는 정보는 alert가 아니다.
