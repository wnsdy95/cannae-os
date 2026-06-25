# Maintenance Readiness Model

## 0. 목적

군대에서 sustainment와 maintenance는 후방 행정이 아니다. 작전 지속시간, 기동 가능성, 전투력 유지, 위험수용을 결정하는 핵심 기능이다.

LLM runtime에서도 같은 구조가 필요하다.

- 도구가 준비되지 않으면 실행할 수 없다.
- token, quota, wall-clock, context window, file access, network access가 제한되면 임무수행능력이 떨어진다.
- 장애가 나도 degraded mode, fallback, repair path가 있으면 임무를 계속할 수 있다.
- readiness는 agent 능력만이 아니라 tool/resource 상태까지 포함해야 한다.

이 문서는 군의 sustainment/maintenance 원리를 LLM tool/resource readiness model로 변환한다.

## 1. 군사 개념 매핑

| 군사 개념 | 의미 | LLM runtime 적용 |
| --- | --- | --- |
| Sustainment | 작전 지속을 가능하게 하는 지원 기능 | token, time, tool, model, storage, network, human approval 관리 |
| Maintenance | 장비를 사용 가능한 상태로 유지 | validator, policy engine, dashboard, event replay, APIs, scripts의 작동성 확인 |
| Operational reach | 작전 영향력을 유지할 수 있는 범위 | context window, tool availability, API quota, source access 범위 |
| Endurance | 얼마나 오래 임무를 지속할 수 있는가 | long-running task checkpoint, handoff, cache, retry |
| Readiness | 임무 수행 가능 상태 | agent readiness + tool readiness + resource readiness |
| Repair | 고장 복구 | test failure triage, fallback script, schema patch, rollback |

## 2. Readiness dimensions

| Dimension | 질문 | Rating |
| --- | --- | --- |
| Agent | 역할 수행 숙련도가 충분한가? | T/P/U/X |
| Tool | 필요한 도구가 실행 가능한가? | Fully/Poorly/Unavailable |
| Resource | token, time, quota, file access가 충분한가? | Green/Amber/Red |
| Context | source of truth와 handoff가 있는가? | Current/Stale/Missing |
| Verification | test/validator/check가 있는가? | Verified/Partial/Untested |
| Fallback | 실패 시 대안이 있는가? | Ready/Manual/None |

권한 판정은 최소값을 따른다. agent가 T여도 tool이 unavailable이면 실행할 수 없다.

## 3. Maintenance readiness object

```json
{
  "asset_id": "TOOL-VALIDATOR-001",
  "asset_type": "tool",
  "owner": "S6",
  "mission_id": "M-DEMO-001",
  "readiness": "Fully",
  "last_checked_at": "2026-06-18T12:40:00+09:00",
  "check_command": "node validator-cli-prototype/run-fixtures.js",
  "last_result": "pass",
  "dependencies": ["node", "schema-files", "sample-payloads"],
  "fallback": "Manual schema review and targeted validator patch.",
  "ccir_trigger": "Validator runner fails or cannot execute."
}
```

## 4. Tool readiness classes

| Class | 조건 | 실행권 |
| --- | --- | --- |
| Fully | 최근 check 통과, fallback 존재 | 정상 |
| Poorly | 일부 check 누락, degraded mode 필요 | Amber 보고 후 제한 |
| Unavailable | 실행 불가, dependency 없음 | blocked |
| Unknown | 최근 check 없음 | report_required |

## 5. Resource readiness classes

| Class | 조건 | 조치 |
| --- | --- | --- |
| Green | token/time/quota 충분 | 계속 |
| Amber | 한계 접근, 우선순위 필요 | CoS/S4 보고 |
| Red | 임무 실패 가능 | commander decision 또는 FRAGO |

## 6. Maintenance battle rhythm

| 시점 | 점검 | 산출물 |
| --- | --- | --- |
| Mission start | 필수 tool/resource availability | readiness note |
| Before Red/Amber action | target/tool/fallback 확인 | approval packet input |
| Phase close | validator/policy/event/dashboard runner | verification status |
| Failure | fault isolation and repair | incident SITREP |
| AAR | repeated failure 분석 | SOP/readiness update |

## 7. Failure taxonomy

| Failure | 예시 | 군대식 해석 | LLM 조치 |
| --- | --- | --- | --- |
| Tool unavailable | Node missing, API down | 장비 불가동 | blocked, fallback |
| Tool degraded | partial output, flaky test | 제한 운용 | Amber, supervision |
| Resource exhausted | token/quota/time 부족 | 보급 부족 | priority decision |
| Context stale | README/source-map mismatch | COP 불일치 | S6 KM update |
| Verification absent | no test for action | 점검 미수행 | rehearsal/test first |
| Approval unavailable | Red action pending | command decision gap | hold action |

## 8. Readiness-to-authority integration

Execution decision:

```text
can_execute =
  agent_readiness sufficient
  AND tool_readiness != Unavailable
  AND resource_readiness != Red
  AND context_status != Missing
  AND authority_matrix allows or approval exists
```

If any condition fails:

- Tool unavailable -> blocked FFIR.
- Resource Red -> commander decision point.
- Context missing -> S6 handoff/KM task.
- Verification absent -> rehearsal/test task.
- Authority missing -> approval request.

## 9. Maintenance reports

S4/S6 report format:

```text
MAINTENANCE READINESS REPORT:
- Mission:
- Critical tools:
- Unavailable/degraded assets:
- Resource constraints:
- Context freshness:
- Verification status:
- Fallback:
- Commander decision needed:
```

## 10. LLM runtime assets to track

| Asset | Owner | Check |
| --- | --- | --- |
| Validator CLI | S6 | `node validator-cli-prototype/run-fixtures.js` |
| Policy engine | S3/S6 | `node policy-engine-prototype/run-policy-fixtures.js` |
| Event replay | S6 | `node event-replay-prototype/run-event-fixtures.js` |
| Alert router | CoS/S6 | `node alert-router-prototype/run-alert-fixtures.js` |
| Readiness gate | S3/S6 | `node readiness-gate-prototype/run-readiness-fixtures.js` |
| Dashboard projection | S6 | generated state matches saved state |
| Source map | S2/S6 | link and source coverage check |

## 11. Prompt guard

```text
실행 전 maintenance readiness를 확인하라.
1. 필요한 tool이 최근 검증됐는가?
2. resource limit이 mission end state를 위협하는가?
3. context/source-of-truth가 최신인가?
4. 실패 시 fallback이 있는가?
5. readiness 문제가 commander decision인지, S4/S6 수리 task인지 분류하라.
```

## 12. 구현 상태와 후보

schema:

- `maintenance-readiness.schema.json`
- `resource-status.schema.json`

implemented prototype:

- `maintenance-readiness-runner.js`: critical runner들을 실행해 readiness report 생성.
- `maintenance-dashboard-runner.js`: readiness report를 ready/degraded/down dashboard projection으로 변환.
- `run-maintenance-dashboard-fixtures.js`: ready, degraded, unavailable sustainment projection 회귀 검증.
- `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`: dashboard에 투입 가능한 sustainment readiness projection state.

prototype candidates:

- `resource-budget-checker.js`: token/time/quota thresholds를 SITREP/CCIR로 변환.
- `tool-fallback-planner.js`: failed tool에 대한 manual/degraded fallback 제안.

## 13. 출처 앵커

- ADP 4-0, Sustainment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796
- FM 4-0, Sustainment Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN41683-FM_4-0-000-WEB-2.pdf
- JP 4-0, Joint Logistics: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/
- Army Publishing Directorate ATP page for maintenance publications: https://armypubs.army.mil/ProductMaps/PubForm/ATP.aspx
- Army article noting ATP 4-33 Maintenance Operations 2024: https://home.army.mil/wood/contact/publications/engr_mag/Maintenance-Moving-Forward

## 14. 현 단계 결론

LLM 운영에서 "실행 가능"은 모델이 답을 만들 수 있다는 뜻이 아니다. 도구, 자원, context, 검증, fallback, 승인권이 함께 준비되어야 한다.

군대식 sustainment를 적용하면 AI runtime은 다음 질문을 항상 묻는다.

> 이 임무를 지금 시작할 수 있는가, 계속 지속할 수 있는가, 고장나면 복구할 수 있는가?
