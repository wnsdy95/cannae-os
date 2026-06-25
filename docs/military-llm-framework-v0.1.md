# Military LLM Framework v0.1

## 0. 문서 상태

- 상태: 초안
- 목적: 군대의 지휘통제, 문서 하달, 권한 위임, 보고, 사후관리 체계를 LLM 사용법과 멀티에이전트 운용법으로 번역한다.
- 핵심 질문: 상위 의도가 하위 실행 단위로 내려갈 때 왜곡을 줄이려면 무엇을 문서화하고, 무엇을 승인받고, 무엇을 자율 실행하게 해야 하는가?

## 1. 기본 관점

군대의 문서 체계는 단순 전달 체계가 아니다. 상급 지휘관의 의도를 보존하면서 각 하위 단위가 자기 환경, 자원, 임무에 맞게 실행 문서로 재작성하는 체계다.

이 프레임워크에서 LLM 운용은 다음과 같이 본다.

| 군대 개념 | LLM 운용 개념 |
|---|---|
| 지휘관 의도 | 사용자의 최종 목적, 성공 조건, 금지선 |
| 작전명령(OPORD) | 표준 작업 지시 프롬프트 |
| 경고명령(WARNO) | 사전 준비 지시, 자료 수집 지시 |
| 단편명령(FRAGO) | 중간 변경 지시 |
| 참모 조직 | 역할별 에이전트 |
| CCIR | 즉시 보고해야 할 핵심 정보 |
| 확인 브리핑 | AI가 이해한 임무를 먼저 재진술하는 단계 |
| 백브리핑 | AI가 세부 실행계획을 보고하고 확인받는 단계 |
| 리허설 | 실행 전 시뮬레이션, 검증, 레드팀 |
| AAR | 작업 후 회고와 SOP 개선 |

## 2. 왜곡 없이 하달되는 이유

군대의 명령이 여러 계층을 거쳐도 비교적 안정적으로 실행될 수 있는 이유는 다음 장치들이 중첩되기 때문이다.

### 2.1 표준 용어

용어가 표준화되어야 문서가 계층을 내려가도 의미가 유지된다. LLM 프레임워크에서도 먼저 용어집을 둬야 한다.

예시:

| 용어 | 정의 |
|---|---|
| 임무 | 수행해야 하는 구체적 과업과 목적 |
| 의도 | 왜 이 임무를 수행하는지, 성공 상태가 무엇인지 |
| 제약 | 반드시 지켜야 하는 조건 |
| 금지선 | 에이전트가 절대 넘으면 안 되는 행동 |
| CCIR | 사용자의 판단이 필요한 핵심 정보 |
| FRAGO | 기존 지시를 일부 변경하는 명령 |

### 2.2 표준 문서 형식

OPORD는 보통 다음 5개 문단으로 구성된다.

1. Situation: 현재 상황, 환경, 상대, 아군, 제약.
2. Mission: 누가, 무엇을, 언제, 어디서, 왜 하는지.
3. Execution: 어떻게 수행할지, 의도, 개념, 세부 과업.
4. Sustainment: 자원, 자료, 도구, 비용, 지원.
5. Command and Signal: 보고선, 승인권, 통신 방식, 변경 방식.

LLM용 OPORD도 같은 구조를 사용한다.

### 2.3 상위 의도 보존

하급 단위는 상급 문서를 그대로 베끼지 않는다. 자기 상황에 맞게 재작성한다. 단, 상위 의도와 성공 조건은 보존해야 한다.

LLM에서는 다음 항목을 "변형 금지 항목"으로 둔다.

| 변형 금지 항목 | 설명 |
|---|---|
| 최종 목적 | 사용자가 진짜 얻고자 하는 결과 |
| 성공 조건 | 무엇이면 성공인지 |
| 금지 조건 | 해서는 안 되는 일 |
| 품질 기준 | 정확도, 근거, 형식, 검증 수준 |
| 승인 조건 | 실행 전 사용자 승인 필요 여부 |

반대로 다음 항목은 하위 에이전트가 재작성할 수 있다.

| 재작성 가능 항목 | 설명 |
|---|---|
| 실행 순서 | 더 나은 순서가 있으면 조정 가능 |
| 세부 방법 | 목적을 유지하는 한 선택 가능 |
| 중간 산출물 형식 | 최종 품질을 높이기 위한 변경 가능 |
| 역할 분배 | 에이전트별 강점에 따라 조정 가능 |

### 2.4 확인 브리핑과 백브리핑

왜곡은 명령을 받은 직후에 가장 많이 발생한다. 그래서 실행 전 다음 두 단계가 필요하다.

| 단계 | 목적 | LLM 적용 |
|---|---|---|
| 확인 브리핑 | 명령을 제대로 이해했는지 즉시 확인 | "내가 이해한 목표/제약/출력은 이것입니다" |
| 백브리핑 | 세부 계획을 만든 뒤 상급자에게 설명 | "이 순서로 실행하고, 이 위험은 이렇게 관리하겠습니다" |

### 2.5 리허설과 레드팀

문서가 실제 실행으로 전환될 때 숨어 있던 모순이 드러난다. 실행 전 리허설은 계획의 공백, 충돌, 위험을 찾는 절차다.

LLM에서는 다음 방식으로 구현한다.

- 실행 계획을 단계별로 시뮬레이션한다.
- 각 단계의 입력, 출력, 실패 조건을 적는다.
- 레드팀 에이전트가 가정, 근거, 누락, 과잉 확신을 검토한다.
- 위험이 크면 실행하지 않고 FRAGO 또는 사용자 승인으로 전환한다.

## 3. 지휘 계층과 에이전트 역할

계급 자체보다 중요한 것은 보직, 지휘관계, 위임된 권한, 보고 기준이다. LLM 시스템도 역할별 책임을 먼저 정해야 한다.

| AI 지위 | 군대 대응 | 주 임무 |
|---|---|---|
| Commander | 지휘관 | 최종 목적, 의도, 위험 허용선, 승인 |
| Chief of Staff | 참모장 | 전체 조정, 작업 분해, 충돌 해결 |
| S2 Intelligence | 정보참모 | 자료 수집, 출처 검증, 불확실성 관리 |
| S3 Operations | 작전참모 | 실행계획, 단계, 우선순위, 동기화 |
| S4 Sustainment | 군수/지원참모 | 자원, 도구, 비용, 지속 가능성 |
| S6 Signal | 통신참모 | 채널, 보고 방식, 로그, 상태 공유 |
| Red Team | 독립 검토조 | 오류, 환각, 취약점, 반례 검토 |
| Executor | 실행 부대 | 코드 작성, 문서 작성, 분석 실행 |
| Recorder | 기록관 | 결정 로그, 변경 이력, AAR |

## 4. 승인 범위

승인권은 "누가 더 높은가"보다 "행동의 위험과 되돌릴 수 있는 정도"로 정한다.

| 승인 등급 | 에이전트 자율 실행 | 사용자 승인 필요 | 예시 |
|---|---|---|---|
| L0 관찰 | 가능 | 불필요 | 파일 읽기, 자료 요약, 초안 작성 |
| L1 가역 작업 | 가능 | 보통 불필요 | 로컬 초안 수정, 테스트 실행 |
| L2 제한 실행 | 조건부 가능 | 상황에 따라 필요 | 정해진 범위 내 코드 변경, 문서 생성 |
| L3 외부 영향 | 제한 | 필요 | 외부 API 호출, 비용 발생, 배포 준비 |
| L4 비가역 작업 | 불가 | 명시 승인 필요 | 삭제, 배포, 결제, 공개 발행 |
| L5 고위험 판단 | 불가 | 사용자 또는 전문가 승인 필요 | 법률, 의료, 재무, 보안상 중대한 결정 |

자율 실행 가능 조건:

1. 상위 의도와 일치한다.
2. 명령 범위 안에 있다.
3. 되돌릴 수 있다.
4. 비용, 보안, 법적 위험이 낮다.
5. CCIR 보고 조건을 건드리지 않는다.
6. 근거 수준이 충분하다.
7. 실패해도 전체 목적을 크게 훼손하지 않는다.

## 5. 보고 범위

모든 정보를 보고하면 지휘관은 판단할 수 없다. 보고는 의사결정을 돕는 정보로 제한해야 한다.

| 보고 종류 | 보고 시점 | 내용 |
|---|---|---|
| SITREP | 정기 또는 단계 종료 | 현재 상태, 진행률, 다음 행동 |
| Exception Report | 계획 이탈 시 | 실패, 지연, 도구 오류, 충돌 |
| CCIR Report | 즉시 | 사용자 판단이 필요한 핵심 변화 |
| Completion Report | 완료 시 | 산출물, 검증 결과, 남은 위험 |
| AAR | 사후 | 의도, 실제 결과, 차이, 개선책 |

### 5.1 CCIR 기준

다음은 즉시 보고해야 한다.

- 사용자의 최종 목적이 모호하거나 충돌한다.
- 핵심 가정이 깨졌다.
- 근거가 부족한데 확정 표현이 필요하다.
- 비용, 보안, 법적 위험이 생겼다.
- 되돌릴 수 없는 작업이 필요하다.
- 작업 범위를 넘어서는 변경이 필요하다.
- 에이전트 간 결론이 충돌한다.
- 신뢰할 수 있는 출처가 서로 모순된다.

## 6. 자율 판단 후 수행 가능한 영역

에이전트는 다음 영역에서 자율성을 가진다.

| 영역 | 자율 판단 가능 | 제한 |
|---|---|---|
| 자료 조사 | 검색어, 읽을 순서, 요약 방식 | 출처 없는 사실 단정 금지 |
| 문서 작성 | 구조, 문장, 예시 | 사용자의 의도 변경 금지 |
| 코드 수정 | 국소적 변경, 테스트 추가 | 삭제/대규모 구조 변경은 보고 |
| 검증 | 테스트, 비교, 체크리스트 | 실패 은폐 금지 |
| 역할 분배 | 하위 작업 쪼개기 | 책임자와 최종 승인자 유지 |
| 일정 조정 | 실행 순서 변경 | 마감/목표 변경 금지 |

## 7. 사후 관리

작업은 완료 보고로 끝나지 않는다. 사후 관리는 다음 산출물을 남긴다.

| 산출물 | 목적 |
|---|---|
| Decision Log | 누가, 왜, 어떤 판단을 했는지 |
| Change Log | 어떤 지시가 어떻게 바뀌었는지 |
| Evidence Map | 주장과 근거 출처 연결 |
| Risk Register | 남은 위험과 대응 |
| AAR | 다음 작업에 반영할 교훈 |
| SOP Update | 반복 가능한 절차로 반영 |

### 7.1 AAR 기본 질문

1. 원래 의도는 무엇이었나?
2. 실제로 무엇이 일어났나?
3. 차이는 왜 발생했나?
4. 무엇을 유지할 것인가?
5. 무엇을 개선할 것인가?
6. 다음 SOP 또는 프롬프트에 무엇을 반영할 것인가?

## 8. AI OPORD 템플릿

```text
OPORD: [작업명]

1. Situation
- 배경:
- 현재 상태:
- 사용 가능한 자료:
- 제약:
- 불확실성:

2. Mission
- 누가:
- 무엇을:
- 언제까지:
- 어디에:
- 왜:
- 성공 조건:

3. Execution
- Commander Intent:
- 실행 개념:
- 단계:
- 하위 작업:
- 금지 행동:
- 품질 기준:
- 검증 방식:

4. Sustainment
- 필요한 도구:
- 필요한 자료:
- 비용/토큰/시간 제한:
- 대체 수단:

5. Command and Signal
- 승인 필요 조건:
- 즉시 보고 조건:
- 정기 보고 주기:
- 변경명령 처리 방식:
- 완료 보고 형식:
```

## 9. Backbrief 템플릿

```text
BACKBRIEF

1. 내가 이해한 최종 목적:
2. 변형하면 안 되는 의도/제약:
3. 내가 맡은 임무:
4. 실행 계획:
5. 예상 위험:
6. 확인 필요한 질문:
7. 승인 없이 진행 가능한 범위:
8. 승인 필요한 범위:
```

## 10. FRAGO 템플릿

```text
FRAGO: [변경명령 번호]

기준 문서:
변경 이유:

1. Situation: 변경 없음 / 변경 내용
2. Mission: 변경 없음 / 변경 내용
3. Execution: 변경 없음 / 변경 내용
4. Sustainment: 변경 없음 / 변경 내용
5. Command and Signal: 변경 없음 / 변경 내용

즉시 적용 여부:
기존 지시와 충돌 시 우선순위:
```

## 11. AAR 템플릿

```text
AAR: [작업명]

1. Expected
- 원래 목표:
- 성공 기준:

2. Actual
- 실제 결과:
- 검증 결과:

3. Delta
- 차이:
- 원인:

4. Sustain
- 유지할 절차:

5. Improve
- 개선할 절차:
- 다음 SOP 반영:
```

## 12. 문서 세트

현재 문서 세트:

1. `military-llm-framework-v0.1.md`: 전체 개념 교리.
2. `military-operating-system.md`: 군대 작동방식을 운영체계로 모델링.
3. `agent-roles-and-authority.md`: 에이전트별 승인권, 보고선, 자율 범위, 사후관리.
4. `decision-risk-assessment.md`: CCIR, decision support, risk, assessment.
5. `prompt-templates.md`: 실제 사용 가능한 OPORD, WARNO, FRAGO, SITREP, AAR 양식.
6. `orders-production-pipeline.md`: request를 mission analysis, OPORD, task order, backbrief, rehearsal, execution, AAR로 변환.
7. `opord-annex-model.md`: OPORD 본문과 annex의 책임 분리.
8. `backbrief-and-rehearsal-sop.md`: 실행 전 이해 확인과 dry-run SOP.
9. `sop-library.md`: 리서치, 문서화, 코드 작업, 검증, 배포, AAR별 표준절차.
10. `agent-battle-rhythm.md`: 단일/멀티에이전트 작업의 보고, 동기화, 결심 주기.
11. `functional-domains.md`: 군 전투기능, 훈련, 지속지원, 타게팅, ROE를 LLM 운영 기능으로 번역.
12. `source-map.md`: 군 문서와 LLM 프레임워크 매핑 근거.
13. `case-studies.md`: OPORD부터 AAR까지 실제 적용 사례.
14. `glossary.md`: 군 용어와 LLM 운용 용어의 공통 사전.
15. `evaluation-metrics.md`: AI METL, MOP/MOE, readiness rating의 측정 지표.
16. `experiments.md`: 군대식 LLM 운용 방식의 비교 실험 설계.
17. `korean-military-sources.md`: 한국군 공개자료, 법령, 정책, KIDA 자료의 적용 노트.
18. `implementation-guide.md`: 실제 LLM 앱/에이전트 런타임 구현 가이드.
19. `prompt-dsl.md`: OPORD, WARNO, FRAGO, SITREP, AAR의 기계 판독형 스키마.
20. `tool-use-roe.md`: 파일, 셸, 브라우저, API, DB, 배포 도구 사용 ROE.
21. `llm-agent-org-chart.md`: 에이전트 조직도, 지휘관계, RACI, 보고선.
22. `korean-org-culture.md`: 한국 조직문화에서 backbrief, 보고, Red Team, 결재를 보정하는 방법.
23. `reference-architecture.md`: Orchestrator, policy engine, tool gateway, evidence store 참조 구조.
24. `sample-runtime-state.md`: mission, OPORD, task order, tool request, SITREP, AAR 상태 예시.
25. `prompt-dsl-validator.md`: OPORD/WARNO/FRAGO/SITREP/AAR 검증 규칙.
26. `approval-ui-patterns.md`: Amber/Red 도구 실행 전 사용자 승인 UI 패턴.
27. `schema-files/`: Prompt DSL과 runtime state의 실제 JSON Schema.
28. `validator-prototype.md`: Prompt DSL validator의 의사코드와 테스트 케이스.
29. `agent-runtime-playbook.md`: 실제 런타임 운영 절차와 장애 대응.
30. `military-ai-risk-register.md`: 군대식 AI 운용 위험 목록과 통제책.
31. `agent-readiness-ledger.md`: 에이전트별 readiness rating과 훈련 계획.
32. `sample-payloads/`: schema와 validator 테스트용 valid/invalid JSON 예시.
33. `policy-engine-rules.md`: Green/Amber/Red/Black ROE 판정 규칙.
34. `command-post-dashboard.md`: mission board, approval queue, CCIR, evidence viewer 설계.
35. `runtime-automation-roadmap.md`: 문서 프레임워크에서 tool-gated runtime까지 구현 로드맵.
36. `evaluation-fixtures.md`: validator/policy/evidence/runtime 회귀 테스트 fixture 정의.
37. `validator-cli-prototype/`: JSON Schema subset과 semantic rule을 실행하는 Node CLI 초안.
38. `dashboard-wireframes.md`: command post dashboard 화면 wireframe.
39. `data-model.sql.md`: mission/evidence/audit/readiness SQL 저장소 모델.
40. `runtime-demo-scenario.md`: intake부터 AAR까지 흐르는 end-to-end 데모.
41. `source-reliability-rubric.md`: 출처 신뢰도와 해석 위험 평가 기준.
42. `validator-cli-prototype/run-fixtures.js`: validator fixture expectations 자동 실행기.
43. `policy-engine-prototype/`: ROE 판정 함수를 실제 코드로 분리한 초안.
44. `runtime-demo-payloads/`: demo mission의 실제 JSON payload 세트.
45. `dashboard-ui-prototype/`: 정적 command post dashboard HTML prototype.
46. `event-sourcing-model.md`: mission event log와 projection 설계.
47. `policy-engine-prototype/run-policy-fixtures.js`: policy engine expected decision 자동 테스트.
48. `runtime-demo-runner.js`: demo payloads와 policy checks end-to-end 실행기.
49. `dashboard-ui-prototype/dashboard-state.json`: dashboard prototype 구동용 JSON state.
50. `event-fixtures/`: event sourcing replay용 demo event log.
51. `event-replay-prototype/`: event log를 mission projection으로 재생하는 Node prototype.
52. `dashboard-ui-prototype/render-state.js`: event replay projection을 dashboard-state.json 형식으로 변환.
53. `event-replay-prototype/run-event-fixtures.js`: replay projection과 dashboard 변환 기대값 자동 검증.
54. `runtime-demo-payloads/opord.json`: demo mission의 OPORD payload.
55. `military-operating-deep-research-queue.md`: 누락된 군 작동영역과 다음 리서치 산출물 큐.
56. `commander-handbook.md`: 사람이 AI 지휘관으로서 intent, 권한, 승인, 보고를 운용하는 실전 지침.
57. `b2c2wg-operating-model.md`: boards, bureaus, centers, cells, working groups의 멀티에이전트 운영 모델.
58. `ccir-alerting-model.md`: PIR/FFIR/EEFI/decision point를 dashboard alert와 routing으로 변환.
59. `opsec-classification-model.md`: context sharing, EEFI, releasability, sensitive output 통제 모델.
60. `knowledge-management-sop.md`: decision log, evidence store, event log, handoff packet 운영 절차.
61. `agent-metl.md`: role별 mission essential task list와 readiness-to-authority 연결.
62. `schema-files/authority-matrix.schema.json`: role/task/tool/target/risk/readiness 기반 권한 matrix schema.
63. `sample-payloads/valid-authority-matrix.json`: authority matrix valid fixture.
64. `sample-payloads/invalid-authority-matrix-red-without-approver.json`: Red authority semantic validation fixture.
65. `schema-files/decision-packet.schema.json`: commander board에 올릴 option/risk/evidence/authority packet schema.
66. `schema-files/working-group.schema.json`: B2C2WG charter와 disband condition schema.
67. `schema-files/ccir-alert.schema.json`: alert object와 routing contract schema.
68. `schema-files/handoff-packet.schema.json`: context transition 전 current state 전달 packet schema.
69. `alert-router-prototype/`: event log를 CCIR alert projection으로 변환하는 Node prototype.
70. `readiness-gate-prototype/`: authority matrix와 readiness rating을 결합한 실행권 판정 prototype.
71. `context-releasability-policy.md`: role별 context packet 필터링과 EEFI release policy.
72. `schema-files/context-item.schema.json`: classification, EEFI, allowed roles, final release metadata schema.
73. `schema-files/release-review.schema.json`: final output/external release review schema.
74. `context-filter-prototype/`: role별 raw/summary/redacted/reference/denied context packet 생성기.
75. `handoff-generator.js`: event replay와 alert projection에서 handoff packet 생성.
76. `decision-packet-linter.js`: board packet option/risk/evidence/deadline 검증기.
77. `event-fixtures/working-group-event-fixtures.json`: WG opened/prepared/decided/closed event log.
78. `maintenance-readiness-model.md`: tool/resource availability와 sustainment readiness 모델.
79. `schema-files/maintenance-readiness.schema.json`: critical asset readiness report schema.
80. `schema-files/backbrief.schema.json`: task owner의 intent/task/stop condition/approval boundary 재진술 schema.
81. `schema-files/rehearsal.schema.json`: 실행 sequence, friction point, decision point, disposition schema.
82. `schema-files/approval-scope.schema.json`: single-use approval, expiry, rollback, evidence, consumption metadata.
83. `schema-files/approval-consumption-event.schema.json`: scoped approval이 실제 실행으로 소비되는 audit event schema.
84. `schema-files/approval-revocation-event.schema.json`: scoped approval이 실행 전 철회되는 audit event schema.
85. `schema-files/approval-renewal-event.schema.json`: scoped approval이 실행 전 유효기간만 연장되는 audit event schema.
86. `schema-files/approval-delegation-event.schema.json`: approval authority를 제한적으로 위임하는 audit event schema.
87. `schema-files/approval-delegation-revocation-event.schema.json`: approval authority 위임 철회/만료 projection audit event schema.
88. `schema-files/release-gate-decision-event.schema.json`: execution approval과 information release approval 합성 decision audit event schema.
89. `schema-files/risk-acceptance.schema.json`: residual risk, authority, duration, supervision, AAR trigger.
90. `maintenance-readiness-runner.js`: critical runner 결과를 readiness report로 변환.
91. `maintenance-dashboard-runner.js`: maintenance readiness report를 ready/degraded/down dashboard projection으로 변환.
92. `run-maintenance-dashboard-fixtures.js`: ready, degraded, unavailable sustainment projection fixtures.
93. `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`: sustainment readiness dashboard projection state.
94. `orders-dissemination-runner.js`: OPORD, task order, backbrief, rehearsal 연결성 검증기.
95. `approval-consumption-runner.js`: approval scope와 consumption event의 mission/action/tool/target/time/evidence 대조.
96. `approval-revocation-runner.js`: approval scope와 revocation event의 active status/authority/time/notification/evidence 대조.
97. `approval-renewal-runner.js`: approval scope와 renewal event의 active status/authority/window/execution-count/evidence 대조.
98. `approval-delegation-runner.js`: authority matrix와 delegation event의 base rule/ROE/risk/context/subdelegation 제한 대조.
99. `approval-delegation-revocation-runner.js`: delegation event와 termination event의 status/authority/time/snapshot/evidence 대조.
100. `policy-engine-authority-integration.js`: policy, authority matrix, approval scope, risk acceptance 합성 gate.
101. `run-authority-integration-fixtures.js`: consumed approval 재사용과 missing risk acceptance 차단 fixture.
102. `policy-engine-release-integration.js`: authority gate와 release review 합성 gate.
103. `run-release-integration-fixtures.js`: valid release, missing review, invalid review, authority-blocked release fixtures.
104. `release-gate-decision-runner.js`: release integration output과 release gate decision event의 final decision/snapshot/evidence 대조.
105. `run-release-gate-decision-fixtures.js`: release allow, missing review allow claim, authority-blocked release event fixtures.
106. `release-gate-dashboard-runner.js`: ReleaseGateDecided event를 release/authority/review dashboard queue로 projection.
107. `run-release-gate-dashboard-fixtures.js`: released, release-review-blocked, authority-blocked projection fixtures.
108. `dashboard-ui-prototype/release-gate-dashboard-state.json`: release gate dashboard projection state.
109. `authority-delegation-projection-runner.js`: delegated approval authority lifecycle event를 dashboard projection으로 변환.
110. `run-authority-delegation-projection-fixtures.js`: active, revoked, expired delegation projection fixtures.
111. `dashboard-ui-prototype/authority-delegation-projection-state.json`: delegated authority dashboard projection state.
112. `release-review-runner.js`: context filter output과 release review를 비교.
113. `dashboard-ui-prototype/working-group-projection-dashboard-state.json`: B2C2WG dashboard projection state.
114. `approval-scope-policy.md`: approval once, constraints, expiry, rollback 정책.
115. `risk-acceptance-authority.md`: 위험 수용권한과 commander retained authority.
116. `source-map-linter.js`: 공식 출처 도메인 coverage 검증.
117. `source-map-url-coverage-report.json`: 공식 출처 host별 source-map coverage snapshot.
118. `aar-to-readiness-update.js`: AAR finding을 readiness/SOP/maintenance update recommendation으로 변환.
119. `schema-files/aar-readiness-update.schema.json`: AAR readiness update contract.
120. `run-aar-readiness-update-fixtures.js`: normal improvement, critical source failure, sustain-only AAR fixtures.
121. `schema-files/annex.schema.json`: OPORD body와 role-specific annex detail을 분리하는 contract.
122. `schema-files/frago-scope-change.schema.json`: mission scope/authority 변경을 annex update와 분리하는 FRAGO contract.
123. `rehearsal-to-ccir-router.js`: rehearsal friction point와 decision point를 CCIR alert/decision packet으로 변환.
124. `run-rehearsal-to-ccir-fixtures.js`: medium/high/sensitive rehearsal routing fixtures.
125. `ai-special-operations-tf.md`: 미군 SOF 원리를 AI high-risk task force 운영 모델로 변환.
126. `schema-files/sof-tf-charter.schema.json`: SOF TF activation, cell separation, enabler, isolation, rehearsal contract.
127. `sof-tf-activation-runner.js`: SOF TF charter를 go/no-go, approval gate, context distribution, preflight block으로 projection.
128. `run-sof-tf-fixtures.js`: valid SOF TF activation과 unbounded TF 차단 fixture.
129. `interdepartment-collaboration-policy.md`: 병과/기능 통합 원리를 부서 간 supported/supporting, liaison, handoff, conflict route 방침으로 변환.
130. `schema-files/department-collaboration-charter.schema.json`: department relationship, liaison, synchronization, conflict route contract.
131. `department-collaboration-runner.js`: collaboration charter를 relationship edge, missing liaison, commander queue, preflight block으로 projection.
132. `run-department-collaboration-fixtures.js`: valid cross-functional collaboration과 siloed collaboration 차단 fixture.
133. `force-structure-change-policy.md`: force management 원리를 AI 병과/보직/부대/TF 신설, 폐지, 증축, 감축 방침으로 변환.
134. `schema-files/force-structure-change-order.schema.json`: capability gap, DOTMLPF-P, authority, readiness, transition, documentation update contract.
135. `force-structure-change-runner.js`: 조직 변경 order를 preflight block, commander queue, transition task, documentation queue, readiness requirement로 projection.
136. `run-force-structure-change-fixtures.js`: 정당화된 조직 신설과 근거 없는 증축 차단 fixture.
137. `information-to-operations-cycle.md`: 정보 수집/평가가 CCIR, running estimate, SITREP, decision packet, FRAGO로 전환되는 절차.
138. `schema-files/information-report.schema.json`: raw information intake와 handling metadata contract.
139. `schema-files/intelligence-assessment.schema.json`: assessed information의 confidence, CCIR, output routing contract.
140. `information-to-operations-router.js`: information report와 assessment를 작전 산출물로 변환.
141. `run-information-to-operations-fixtures.js`: order change, FFIR SITREP, EEFI release-block routing fixtures.
142. `personnel-continuity-model.md`: 인원 손실/교체/로테이션에도 보직과 권한이 이어지는 continuity model.
143. `schema-files/continuity-plan.schema.json`: essential function, successor chain, vital records, degraded mode contract.
144. `continuity-drill-runner.js`: role loss/rotation event를 successor activation과 paused functions로 변환.
145. `run-continuity-drill-fixtures.js`: Commander unavailable, S6 rotation continuity drill fixtures.
146. `role-document-access-policy.md`: role, duty, authority에 맞는 정해진 문서만 읽게 하는 need-to-know 문서 접근 방침.
147. `schema-files/document-access-manifest.schema.json`: mission별 document access manifest contract.
148. `document-access-runner.js`: manifest를 role/duty/authority와 대조해 allowed/denied document projection 생성.
149. `run-document-access-fixtures.js`: S2/Executor/S6 문서 접근과 overbroad access 차단 fixture.
150. `multinational-doctrine-consistency-review.md`: 미군 중심 가정을 NATO/영국/캐나다/한국 공식 출처와 대조해 alias, jurisdiction gate, policy disposition으로 정합화하는 감사 문서.
151. `schema-files/doctrine-consistency-review.schema.json`: source family coverage, policy finding, resolution control, documentation update contract.
152. `doctrine-consistency-runner.js`: doctrine consistency review를 coverage, unresolved conflict, policy update queue로 projection.
153. `run-doctrine-consistency-fixtures.js`: valid multinational review와 US-only invalid review fixture 검증.
154. `research-compendium.md`: 리서치 자료와 해석의 통합 저장소.

다음 문서화 작업:

1. 현재 deep research/documentation/runtime contract 큐는 완료 상태로 둔다.
2. 다음 확장은 사용자가 새 우선순위를 지정하면 별도 큐로 연다.

## 13. 참고 자료

- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- JP 3-0, Joint Campaigns and Operations: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/
- ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715
- FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282
- JP 3-05, Special Operations: https://www.jcs.mil/Doctrine/DOCNET/JP-3-05-Special-Operations/
- FM 3-05, Army Special Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44116-FM_3-05-000-WEB-1.pdf
- USSOCOM SOF Truths: https://www.socom.mil/about/sof-truths
- NATO/Allied Joint Doctrine AJP-01 official GOV.UK page: https://www.gov.uk/government/publications/ajp-01-d-allied-joint-doctrine
- UK Defence Doctrine JDP 0-01: https://www.gov.uk/government/publications/uk-defence-doctrine-jdp-0-01
- Canadian Armed Forces public page: https://www.canada.ca/en/services/defence/caf.html
- USSOCOM Core Activities: https://www.socom.mil/about/core-activities
- AR 71-32, Force Development and Documentation: https://history.army.mil/Portals/143/Images/Covid/PDF/r71_32.pdf
- DA PAM 71-32 / Army Force Management School digital library: https://www.afms.edu/digitallibrary.html
- How the Army Runs reference material: https://warroom.armywarcollege.edu/reference-materials/
- Force Management Functional Area, DA PAM 600-3 excerpt: https://api.army.mil/e2/c/downloads/2024/04/03/1074fa08/force-management-fa-50-da-pam-600-3.pdf
- Federal Continuity Directive planning framework: https://www.fema.gov/sites/default/files/documents/fema_federal-continuity-directive-planning-framework.pdf
- JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- JCS Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- JCS Joint Task Force and Command and Control Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf
- STANAG 2014, Formats for Orders: https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf
- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf
- DoD Terminology Program: https://www.jcs.mil/doctrine/dod-terminology-program/
- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716
- FM 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335
- ADP 4-0, Sustainment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796
- JP 4-0, Joint Logistics: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/
- JP 3-60, Joint Targeting: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/
- FM 3-60, Army Targeting: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1030750
- FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282
- ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715
- 대한민국 국방부 공개자료: https://www.mnd.go.kr/
- 국가법령정보센터: https://www.law.go.kr/
- 한국국방연구원(KIDA): https://www.kida.re.kr/
