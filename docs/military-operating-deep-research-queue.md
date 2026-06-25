# Military Operating Deep Research Queue

## 0. 목적

이 문서는 군대 작동방식을 LLM 운용 프레임워크로 전환하기 위해 앞으로 더 깊게 조사해야 할 영역을 관리하는 research backlog다.

이미 정리한 OPORD, mission command, CCIR, 권한, battle rhythm, risk, assessment, training, sustainment, targeting, ROE는 프레임워크의 1차 골격이다. 다음 단계는 군대가 실제로 거대한 조직을 왜곡 없이 움직이게 만드는 세부 운영 장치를 더 촘촘히 뽑아내는 것이다.

핵심 질문:

1. 상급 지휘관의 의도가 왜 중간 계층을 지나도 실제 행동으로 전환되는가?
2. 각 지위는 어떤 승인권, 보고의무, 자율판단권, 사후책임을 갖는가?
3. 문서, 회의, 보고, rehearsals, liaison, knowledge management가 어떻게 왜곡을 줄이는가?
4. 이 구조를 단일 LLM, 멀티 에이전트, tool-using runtime에 어떻게 구현할 수 있는가?

## 1. 리서치 판정 기준

출처를 네 등급으로 분류한다.

| 등급 | 기준 | 프레임워크 사용 |
| --- | --- | --- |
| A | 공식 교리, 법령, 지침, 공식 handbook | 구조, 용어, 권한 모델의 1차 근거 |
| B | 군 교육기관, CALL, Joint Staff J7 focus paper, lessons learned | 운영 절차와 실제 적용 패턴의 근거 |
| C | 학술 논문, 분석 보고서, 싱크탱크 | 효과성, 한계, 비교 연구의 근거 |
| D | 블로그, 인터뷰, 비공식 경험담 | 가설 후보. 직접 근거로 쓰지 않음 |

문서 작성 규칙:

- 원문에서 확인되는 사실은 `Claim`.
- LLM 프레임워크로 옮긴 해석은 `Interpretation`.
- 구현 설계는 `Application`.
- 확실하지 않은 부분은 `Research Gap`.

## 2. 현재 커버된 영역

| 영역 | 현재 산출물 | 남은 gap |
| --- | --- | --- |
| Mission command | `agent-roles-and-authority.md`, `military-operating-system.md` | disciplined initiative를 runtime policy로 더 엄격히 모델링 |
| OPORD/WARNO/FRAGO/SITREP/AAR | `prompt-templates.md`, `prompt-dsl.md`, `schema-files/`, `orders-production-pipeline.md`, `opord-annex-model.md`, `schema-files/annex.schema.json`, `schema-files/frago-scope-change.schema.json`, `rehearsal-to-ccir-router.js`, `information-to-operations-router.js` | 신규 우선순위 지정 대기 |
| CCIR/PIR/FFIR/EEFI | `decision-risk-assessment.md`, `agent-battle-rhythm.md`, `information-to-operations-cycle.md`, `schema-files/information-report.schema.json`, `schema-files/intelligence-assessment.schema.json`, `information-to-operations-router.js` | dashboard projection과 실제 UI queue 통합 |
| 권한/승인 | `tool-use-roe.md`, `approval-ui-patterns.md`, `policy-engine-prototype/`, `approval-scope-policy.md`, `risk-acceptance-authority.md`, `schema-files/approval-scope.schema.json`, `schema-files/approval-consumption-event.schema.json`, `schema-files/approval-revocation-event.schema.json`, `schema-files/approval-renewal-event.schema.json`, `schema-files/approval-delegation-event.schema.json`, `schema-files/approval-delegation-revocation-event.schema.json`, `schema-files/release-gate-decision-event.schema.json`, `schema-files/risk-acceptance.schema.json`, `policy-engine-authority-integration.js`, `policy-engine-release-integration.js`, `release-gate-dashboard-runner.js`, `authority-delegation-projection-runner.js`, `maintenance-dashboard-runner.js`, `aar-to-readiness-update.js`, `rehearsal-to-ccir-router.js`, `dashboard-ui-prototype/release-gate-dashboard-state.json`, `dashboard-ui-prototype/authority-delegation-projection-state.json`, `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json` | 신규 우선순위 지정 대기 |
| 참모조직/부서협력 | `llm-agent-org-chart.md`, `functional-domains.md`, `b2c2wg-operating-model.md`, `interdepartment-collaboration-policy.md`, `schema-files/department-collaboration-charter.schema.json`, `department-collaboration-runner.js` | dashboard collaboration panel과 dependency projection 통합 |
| 조직 신설/폐지/증감축 | `force-structure-change-policy.md`, `schema-files/force-structure-change-order.schema.json`, `force-structure-change-runner.js`, `run-force-structure-change-fixtures.js` | dashboard force-structure panel과 readiness/authority projection 통합 |
| 문서/context 접근 통제 | `role-document-access-policy.md`, `schema-files/document-access-manifest.schema.json`, `document-access-runner.js`, `run-document-access-fixtures.js`, `context-releasability-policy.md`, `context-filter-prototype/` | dashboard document-access/audit panel 통합 |
| 인원 손실/교체/로테이션 | `personnel-continuity-model.md`, `schema-files/continuity-plan.schema.json`, `continuity-drill-runner.js`, `run-continuity-drill-fixtures.js` | dashboard continuity panel과 authority projection 통합 |
| SOF TF / 고위험 임무조직 | `ai-special-operations-tf.md`, `schema-files/sof-tf-charter.schema.json`, `sof-tf-activation-runner.js`, `run-sof-tf-fixtures.js` | dashboard activation panel과 readiness/authority projection 통합 |
| 다국적 교리 정합성 | `multinational-doctrine-consistency-review.md`, `schema-files/doctrine-consistency-review.schema.json`, `doctrine-consistency-runner.js`, `run-doctrine-consistency-fixtures.js` | 호주 ADF 공식 doctrine 접근성 확보 후 source family 추가 검토 |
| 평가/AAR | `evaluation-metrics.md`, `agent-readiness-ledger.md`, `backbrief-and-rehearsal-sop.md` | rehearsal friction point가 CCIR/AAR로 전환되는 절차 |
| 런타임 구현 | `runtime-demo-runner.js`, `event-replay-prototype/`, `dashboard-ui-prototype/` | event store, projection, approval gate의 지속 실행 |

## 3. 우선 조사 라인

### 3.1 지휘관 의도와 mission orders

Research questions:

- 지휘관 의도는 어떤 필수 요소로 구성되는가?
- 어느 정도까지 하급자에게 방법을 위임하고, 무엇은 반드시 통제하는가?
- disciplined initiative가 무단행동으로 변질되지 않도록 어떤 경계가 있는가?

Primary sources:

- ADP 6-0, Mission Command
- ADP 5-0, The Operations Process
- Joint Staff Mission Command Focus Paper
- Army University Press mission command articles

LLM mapping:

- Commander prompt는 목표보다 `purpose`, `key tasks`, `end state`, `failure to avoid`, `authority boundary`를 먼저 고정한다.
- 에이전트는 방법을 제안할 수 있지만 Red/Black boundary는 넘지 못한다.
- backbrief를 통해 "나는 무엇을 하려는가 / 왜 하는가 / 어디서 멈추는가"를 재진술하게 한다.

Output artifacts:

- `commander-handbook.md`
- `mission-command-runtime-policy.md`
- `disciplined-initiative-rules.md`

### 3.2 OPORD, annex, orders production

Research questions:

- 표준 명령서 양식이 왜곡을 줄이는 구체 메커니즘은 무엇인가?
- 본문 5개 항목과 annex는 어떤 역할 분담을 하는가?
- WARNO, OPORD, FRAGO 사이의 정보량과 속도 tradeoff는 어떻게 정해지는가?

Primary sources:

- FM 5-0, Planning and Orders Production
- STANAG 2014, Formats for Orders
- MDMP handbook and CALL planning products

LLM mapping:

- 사용자 요청은 곧바로 "프롬프트"가 아니라 mission analysis와 draft OPORD를 거친다.
- 복잡한 작업은 annex로 분리한다: source plan, tool plan, risk plan, verification plan, rollback plan.
- scope change는 새 대화가 아니라 FRAGO event로 기록한다.

Output artifacts:

- `opord-annex-model.md`
- `orders-production-pipeline.md`
- `runtime-demo-payloads/warno.json`
- `runtime-demo-payloads/frago.json`

Current implementation:

- `orders-production-pipeline.md`
- `opord-annex-model.md`
- `runtime-demo-payloads/backbrief.json`
- `runtime-demo-payloads/rehearsal.json`
- `orders-dissemination-runner.js`

### 3.3 Confirmation brief, backbrief, rehearsal

Research questions:

- 명령 하달 직후 하급자가 무엇을 재진술해야 하는가?
- rehearsal은 실제 실행 전 어떤 오류를 잡아내는가?
- rehearsal 결과는 명령 수정, risk control, CCIR 갱신으로 어떻게 연결되는가?

Primary sources:

- Commander and Staff Guide to Rehearsals
- FM 5-0 confirmation brief/backbrief sections
- CALL rehearsal handbooks

LLM mapping:

- 에이전트는 실행 전 `understanding`, `planned actions`, `risk`, `stop conditions`, `needed approvals`를 backbrief한다.
- tool execution 전 dry-run 또는 rehearsal output을 생성한다.
- commander는 rehearsal 결과에 따라 approve, revise, reject, fragment order 중 하나를 선택한다.

Output artifacts:

- `backbrief-and-rehearsal-sop.md`
- `rehearsal-fixtures.json`
- `dry-run-approval-ui.md`

Current implementation:

- `backbrief-and-rehearsal-sop.md`
- `schema-files/backbrief.schema.json`
- `schema-files/rehearsal.schema.json`
- `sample-payloads/valid-backbrief.json`
- `sample-payloads/valid-rehearsal.json`

### 3.4 Staff integration, COS, B2C2WG

Research questions:

- Chief of Staff는 어떻게 지휘관의 결심을 위해 참모를 통합하는가?
- Boards, bureaus, centers, cells, and working groups는 어떤 문제를 해결하는가?
- battle rhythm은 어떤 회의를 만들고 어떤 회의를 금지해야 하는가?

Primary sources:

- FM 6-0, Commander and Staff Organization and Operations
- Joint Headquarters Organization, Staff Integration, and Battle Rhythm Focus Paper
- Chief of Staff Roles and Functions Focus Paper
- Knowledge and Information Management Focus Paper

LLM mapping:

- CoS/Orchestrator는 모든 에이전트의 상급자가 아니라 staff integration layer다.
- B2C2WG는 LLM runtime에서 "정기 decision packet 생성 이벤트"로 구현한다.
- 모든 에이전트가 지휘관에게 직접 길게 보고하지 않는다. CoS가 CCIR 중심으로 압축한다.

Output artifacts:

- `b2c2wg-operating-model.md`
- `chief-of-staff-agent.md`
- `battle-rhythm-scheduler-schema.json`

### 3.5 CCIR, COP, 보고 체계

Research questions:

- 어떤 정보가 commander critical information이 되는가?
- PIR, FFIR, EEFI는 각각 어떤 dashboard alert로 바뀌는가?
- 보고는 얼마나 자주 해야 하며, 언제 보고하지 않아도 되는가?

Primary sources:

- Joint Staff CCIR Focus Paper
- ADP 5-0/6-0 shared understanding and assessment sections
- Knowledge and Information Management Focus Paper

LLM mapping:

- CCIR는 "말할 거리"가 아니라 "결심을 바꾸는 정보"다.
- dashboard alert는 CCIR와 연결되지 않으면 만들지 않는다.
- 에이전트는 completion report보다 exception report를 우선한다.

Output artifacts:

- `ccir-alerting-model.md`
- `common-operational-picture-state.md`
- `reporting-threshold-policy.md`

### 3.6 권한, 승인, retained authority

Research questions:

- 권한은 어떻게 위임되고, 어떤 권한은 상급자가 retained하는가?
- 위험 수용권한은 계층별로 어떻게 나뉘는가?
- 권한의 scope, duration, target, condition은 어떻게 문서화되는가?

Primary sources:

- Joint Staff Authorities Focus Paper
- ATP 5-19, Risk Management
- ROE/SRUF public references
- 법령/규정 공개자료

LLM mapping:

- 에이전트 권한은 role이 아니라 role + task + target + time + risk + readiness의 함수다.
- approval object에는 scope, expiry, rollback, evidence requirement가 있어야 한다.
- Red action approval은 blanket approval이 아니다.

Output artifacts:

- `schema-files/authority-matrix.schema.json`
- `approval-scope-policy.md`
- `risk-acceptance-authority.md`

Current implementation:

- `schema-files/approval-scope.schema.json`
- `schema-files/approval-consumption-event.schema.json`
- `schema-files/approval-revocation-event.schema.json`
- `schema-files/approval-renewal-event.schema.json`
- `schema-files/approval-delegation-event.schema.json`
- `schema-files/approval-delegation-revocation-event.schema.json`
- `schema-files/release-gate-decision-event.schema.json`
- `schema-files/risk-acceptance.schema.json`
- `approval-consumption-runner.js`
- `run-approval-consumption-fixtures.js`
- `approval-revocation-runner.js`
- `run-approval-revocation-fixtures.js`
- `approval-renewal-runner.js`
- `run-approval-renewal-fixtures.js`
- `approval-delegation-runner.js`
- `run-approval-delegation-fixtures.js`
- `approval-delegation-revocation-runner.js`
- `run-approval-delegation-revocation-fixtures.js`
- `policy-engine-authority-integration.js`
- `run-authority-integration-fixtures.js`
- `policy-engine-release-integration.js`
- `run-release-integration-fixtures.js`
- `release-gate-decision-runner.js`
- `run-release-gate-decision-fixtures.js`
- `release-gate-dashboard-runner.js`
- `run-release-gate-dashboard-fixtures.js`
- `dashboard-ui-prototype/release-gate-dashboard-state.json`
- `maintenance-dashboard-runner.js`
- `run-maintenance-dashboard-fixtures.js`
- `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`
- `authority-delegation-projection-runner.js`
- `run-authority-delegation-projection-fixtures.js`
- `dashboard-ui-prototype/authority-delegation-projection-state.json`

### 3.7 Knowledge management, records, audit

Research questions:

- 지식관리와 정보관리는 어떻게 다르며, 둘 다 왜 필요한가?
- 문서 저장소, 용어, read-ahead, decision log는 어떻게 운영되는가?
- 장기 작전에서 기억 손실을 어떻게 줄이는가?

Primary sources:

- Joint Staff Knowledge and Information Management Focus Paper
- CJCSI 5780.01 Knowledge Management
- USFK Knowledge Management Program

LLM mapping:

- 대화 기록은 source of truth가 아니다.
- event log, evidence store, decision log, doctrine docs가 source of truth다.
- 모든 장기 작업은 handoff packet과 current projection을 남긴다.

Output artifacts:

- `knowledge-management-sop.md`
- `decision-log-schema.json`
- `handoff-packet-template.md`

### 3.8 Training, METL, readiness

Research questions:

- 부대는 어떤 기준으로 핵심임무를 정하고 훈련하는가?
- readiness rating은 어떻게 권한 위임과 연결되는가?
- crawl-walk-run 방식은 에이전트 자율성 증대에 어떻게 적용되는가?

Primary sources:

- ADP 7-0, Training
- FM 7-0, Training
- Joint Training Manual

LLM mapping:

- 에이전트별 Mission Essential Task List를 만든다.
- readiness가 낮은 에이전트는 자동 실행권을 갖지 못하고 draft/report 권한만 갖는다.
- AAR 결과는 readiness ledger와 SOP를 수정한다.

Output artifacts:

- `agent-metl.md`
- `training-progression-model.md`
- `readiness-to-authority-policy.md`

### 3.9 Sustainment, logistics, maintenance

Research questions:

- 작전 지속성은 인력, 보급, 정비, 예산, 시간 제약을 어떻게 다루는가?
- 어떤 자원 병목이 지휘관 결심에 올라가야 하는가?
- 정비/가용성 보고가 실제 작전 계획에 어떻게 반영되는가?

Primary sources:

- ADP 4-0, Sustainment
- JP 4-0, Joint Logistics
- 관련 maintenance/readiness 공개 교리

LLM mapping:

- S4 에이전트는 token, wall-clock, API quota, tool availability, context size를 관리한다.
- 장기 작업에는 cache, checkpoint, retry, degraded mode가 필요하다.
- 도구 장애는 기술 문제이면서 지휘 결심 문제다.

Output artifacts:

- `maintenance-readiness-model.md`
- `sustainment-agent-sop.md`
- `resource-priority-policy.md`

### 3.10 Protection, OPSEC, classification

Research questions:

- 보호 기능은 단순 보안이 아니라 작전 지속성을 어떻게 보장하는가?
- OPSEC와 EEFI는 어떤 정보 공개를 막는가?
- classification, releasability, need-to-know는 LLM context sharing에 어떻게 적용되는가?

Primary sources:

- ADP/FM operations and protection doctrine
- OPSEC public references
- classification and records management public rules

LLM mapping:

- context sharing은 기본 허용이 아니라 need-to-know로 제한한다.
- EEFI는 "출력 금지 정보"와 "도구 전달 금지 정보"로 나뉜다.
- evidence store에는 sensitivity label과 releasability가 있어야 한다.

Output artifacts:

- `opsec-classification-model.md`
- `context-releasability-policy.md`
- `sensitive-output-filter.md`

### 3.11 Interoperability, liaison, multinational/interorganizational work

Research questions:

- 다른 조직과 협업할 때 왜 liaison이 필요한가?
- 공통 용어, 공통 템플릿, COP, disclosure process가 왜 중요한가?
- 조직 간 권한 충돌은 어떻게 처리하는가?

Primary sources:

- Commander and Staff Guide to Mission Partner Environment
- Commander and Staff Guide to Multinational Interoperability
- Interorganizational Cooperation Focus Paper
- JTF C2 and Organization Focus Paper

LLM mapping:

- 외부 도구, 외부 팀, 다른 에이전트 프레임워크와 연결할 때 liaison role이 필요하다.
- interop adapter는 데이터 형식뿐 아니라 authority, release, reporting을 변환한다.
- partner-facing output은 내부 reasoning이 아니라 approved release packet이어야 한다.

Output artifacts:

- `liaison-agent-model.md`
- `interop-release-packet.md`
- `partner-command-relationship.md`

## 4. 왜곡 없는 하달의 핵심 메커니즘

군대식 하달이 왜곡을 줄이는 이유는 "명령을 많이 하기 때문"이 아니라, 다음 장치들이 함께 작동하기 때문이다.

| 메커니즘 | 군대식 기능 | LLM 적용 |
| --- | --- | --- |
| 표준 문서 | OPORD/WARNO/FRAGO/SITREP/AAR가 누락을 줄임 | prompt DSL과 schema validation |
| 지휘관 의도 | 세부 방법이 바뀌어도 목적과 end state 유지 | commander intent block |
| nested intent | 상급 의도와 하급 과업 연결 | mission -> OPORD -> task order id linkage |
| confirmation brief | 하급자가 이해한 임무를 재진술 | agent backbrief required |
| rehearsal | 실행 전 충돌과 누락 발견 | dry-run/tool simulation |
| CCIR | 결심에 필요한 정보만 상향 보고 | dashboard alert thresholds |
| authority matrix | 누가 무엇을 승인할 수 있는지 명시 | policy engine + approval object |
| running estimate | 참모 판단이 계속 갱신됨 | agent working state and evidence notes |
| succession and continuity | 보직/승계선/필수기록이 사람 손실을 흡수 | continuity plan, drill runner, degraded mode |
| supported/supporting relationship | phase별 main effort와 지원 기능을 명확히 함 | department collaboration charter relationship edges |
| force management and documentation | 조직은 capability requirement와 문서화된 authorization으로 생기고 사라짐 | force structure change order, DOTMLPF-P review, transition gate |
| liaison | 조직 간 의미 변환과 정보흐름 안정화 | liaison rules and missing liaison projection |
| doctrine consistency review | 미군식 용어와 타국 교리/법제의 충돌을 사전에 식별 | source family coverage, role alias map, jurisdiction gate |
| AAR | 실행 후 학습을 절차로 환류 | readiness ledger and SOP updates |

## 5. 다음 조사 산출물 순서

완료:

- `commander-handbook.md`: 사람이 AI 지휘관으로서 무엇을 정하고 무엇을 위임할지 정리.
- `b2c2wg-operating-model.md`: 멀티에이전트 회의체/작업그룹 모델.
- `schema-files/authority-matrix.schema.json`: 승인권과 retained authority를 기계 판독형으로 정의.
- `ccir-alerting-model.md`: report threshold와 dashboard alert rules.
- `opsec-classification-model.md`: context sharing, EEFI, releasability.
- `knowledge-management-sop.md`: decision log, evidence store, handoff packet.
- `agent-metl.md`: role별 mission essential task list.
- `schema-files/decision-packet.schema.json`: board decision packet 구조.
- `schema-files/working-group.schema.json`: B2C2WG charter 구조.
- `schema-files/ccir-alert.schema.json`: CCIR alert와 routing 구조.
- `alert-router-prototype/`: event log를 alert projection으로 변환.
- `context-releasability-policy.md`: role별 context filter 규칙.
- `readiness-gate-prototype/`: authority matrix와 readiness를 결합한 실행권 판정.
- `schema-files/handoff-packet.schema.json`: context transition packet 구조.
- `schema-files/context-item.schema.json`: classification, EEFI, releasability metadata를 가진 context unit.
- `context-filter-prototype/`: role과 context item을 받아 raw/summary/redacted/reference/denied packet 생성.
- `schema-files/release-review.schema.json`: final output release decision schema.
- `handoff-generator.js`: event projection과 current queues에서 handoff packet 자동 생성.
- `decision-packet-linter.js`: board packet option/risk/evidence/deadline 검증 자동화.
- `event-fixtures/working-group-event-fixtures.json`: WG opened/prepared/closed event replay fixtures.
- `maintenance-readiness-model.md`: tool/resource availability와 readiness.
- `schema-files/maintenance-readiness.schema.json`: tool/resource/context/fallback readiness 객체.
- `maintenance-readiness-runner.js`: critical runner 실행 결과를 readiness report로 변환.
- `release-review-runner.js`: context filter output이 final release constraints를 만족하는지 검증.
- `dashboard-ui-prototype/working-group-projection-dashboard-state.json`: active/closed WG와 decision packet dashboard projection.
- `approval-scope-policy.md`: approval once/constraints/expiry/rollback의 세부 정책.
- `risk-acceptance-authority.md`: 위험 수용권한과 commander retained authority.
- `schema-files/approval-scope.schema.json`: single-use approval, expiry, rollback, evidence, consumption metadata.
- `schema-files/approval-consumption-event.schema.json`: approval scope가 실제 execution으로 소비되는 audit event.
- `schema-files/approval-revocation-event.schema.json`: approval scope가 execution 전 철회되는 audit event.
- `schema-files/approval-renewal-event.schema.json`: approval scope가 execution 전 유효기간만 연장되는 audit event.
- `schema-files/approval-delegation-event.schema.json`: approval authority를 제한적으로 위임하는 audit event.
- `schema-files/approval-delegation-revocation-event.schema.json`: approval authority 위임 철회/만료 projection audit event.
- `schema-files/release-gate-decision-event.schema.json`: execution approval과 information release approval 합성 decision audit event.
- `schema-files/risk-acceptance.schema.json`: residual risk, authority, duration, supervision, AAR trigger.
- `approval-consumption-runner.js`: approval scope와 consumption event의 mission/action/tool/target/time/evidence 대조.
- `run-approval-consumption-fixtures.js`: active consumption, target mismatch, reused approval fixtures.
- `approval-revocation-runner.js`: approval scope와 revocation event의 active status/authority/time/notification/evidence 대조.
- `run-approval-revocation-fixtures.js`: active revocation, consumed revocation, wrong authority fixtures.
- `approval-renewal-runner.js`: approval scope와 renewal event의 active status/authority/window/execution-count/evidence 대조.
- `run-approval-renewal-fixtures.js`: active renewal, expired renewal, scope expansion fixtures.
- `approval-delegation-runner.js`: authority matrix와 delegation event의 base rule/ROE/risk/context/subdelegation 제한 대조.
- `run-approval-delegation-fixtures.js`: bounded delegation, staff retained authority attempt, Red base rule delegation fixtures.
- `approval-delegation-revocation-runner.js`: delegation event와 termination event의 status/authority/time/snapshot/evidence 대조.
- `run-approval-delegation-revocation-fixtures.js`: Commander revocation, recorder expiry projection, staff revocation attempt fixtures.
- `policy-engine-authority-integration.js`: policy, authority matrix, approval scope, risk acceptance 합성 gate.
- `run-authority-integration-fixtures.js`: consumed approval 재사용과 missing risk acceptance 차단 fixture.
- `policy-engine-release-integration.js`: authority gate와 release review 합성 gate.
- `run-release-integration-fixtures.js`: valid release, missing review, invalid review, authority-blocked release fixtures.
- `release-gate-decision-runner.js`: release integration output과 release gate decision event의 final decision/snapshot/evidence 대조.
- `run-release-gate-decision-fixtures.js`: release allow, missing review allow claim, authority-blocked release event fixtures.
- `release-gate-dashboard-runner.js`: ReleaseGateDecided event를 release/authority/review dashboard queue로 projection.
- `run-release-gate-dashboard-fixtures.js`: released, release-review-blocked, authority-blocked projection fixtures.
- `dashboard-ui-prototype/release-gate-dashboard-state.json`: release gate dashboard projection state.
- `maintenance-dashboard-runner.js`: maintenance readiness report를 ready/degraded/down dashboard projection으로 변환.
- `run-maintenance-dashboard-fixtures.js`: ready, degraded, unavailable sustainment projection fixtures.
- `dashboard-ui-prototype/maintenance-readiness-dashboard-state.json`: sustainment readiness dashboard projection state.
- `authority-delegation-projection-runner.js`: delegated approval authority lifecycle event를 dashboard projection으로 변환.
- `run-authority-delegation-projection-fixtures.js`: active, revoked, expired delegation projection fixtures.
- `dashboard-ui-prototype/authority-delegation-projection-state.json`: active/revoked/expired delegated authority dashboard state.
- `source-map-linter.js`: 새 URL과 source-map coverage 검증.
- `source-map-url-coverage-report.json`: 공식 출처 host별 source-map coverage snapshot.
- `aar-to-readiness-update.js`: AAR finding을 readiness recommendation과 follow-up action으로 변환.
- `schema-files/aar-readiness-update.schema.json`: AAR readiness update contract.
- `run-aar-readiness-update-fixtures.js`: normal improvement, critical source failure, sustain-only AAR fixtures.
- `schema-files/annex.schema.json`: OPORD body와 role-specific annex detail을 분리하는 contract.
- `schema-files/frago-scope-change.schema.json`: mission scope/authority 변경을 annex update와 분리하는 FRAGO contract.
- `rehearsal-to-ccir-router.js`: rehearsal friction point와 decision point를 CCIR alert/decision packet으로 변환.
- `run-rehearsal-to-ccir-fixtures.js`: medium/high/sensitive rehearsal routing fixtures.
- `ai-special-operations-tf.md`: 미군 SOF 원리를 AI high-risk task force 운영 모델로 변환.
- `schema-files/sof-tf-charter.schema.json`: SOF TF activation, cell separation, context isolation, enabler, rehearsal contract.
- `sof-tf-activation-runner.js`: SOF TF charter를 go/no-go, approval gate, context distribution, preflight block으로 projection.
- `run-sof-tf-fixtures.js`: valid SOF TF activation과 unbounded TF 차단 fixture.
- `interdepartment-collaboration-policy.md`: 병과/기능 통합 원리를 부서 간 supported/supporting, liaison, handoff, conflict route 방침으로 변환.
- `schema-files/department-collaboration-charter.schema.json`: department relationship, liaison, synchronization, conflict route contract.
- `department-collaboration-runner.js`: collaboration charter를 relationship edge, missing liaison, commander queue, preflight block으로 projection.
- `run-department-collaboration-fixtures.js`: valid cross-functional collaboration과 siloed collaboration 차단 fixture.
- `force-structure-change-policy.md`: force management 원리를 AI 병과/보직/부대/TF 신설, 폐지, 증축, 감축 방침으로 변환.
- `schema-files/force-structure-change-order.schema.json`: capability gap, DOTMLPF-P, authority, readiness, transition, documentation update contract.
- `force-structure-change-runner.js`: force structure change order를 preflight block, commander queue, transition task, documentation queue, readiness requirement로 projection.
- `run-force-structure-change-fixtures.js`: 정당화된 조직 신설과 근거 없는 증축 차단 fixture.
- `role-document-access-policy.md`: role, duty, authority에 맞는 정해진 문서만 읽게 하는 need-to-know 문서 접근 방침.
- `schema-files/document-access-manifest.schema.json`: mission별 document access manifest contract.
- `document-access-runner.js`: manifest를 role/duty/authority와 대조해 allowed/denied document projection 생성.
- `run-document-access-fixtures.js`: S2/Executor/S6 문서 접근과 overbroad access 차단 fixture.
- `information-to-operations-cycle.md`: 정보 수집/평가가 running estimate, CCIR, SITREP, decision packet, FRAGO로 전환되는 절차.
- `schema-files/information-report.schema.json`: raw information intake, source reliability, CCIR candidate, handling metadata.
- `schema-files/intelligence-assessment.schema.json`: confidence, CCIR classification, operational impact, recommended output contract.
- `information-to-operations-router.js`: 정보보고/평가를 작전 산출물로 변환.
- `run-information-to-operations-fixtures.js`: order-changing, FFIR, EEFI routing regression fixtures.
- `personnel-continuity-model.md`: role continuity, succession, vital records, degraded mode, rotation gate 모델.
- `schema-files/continuity-plan.schema.json`: essential function, successor chain, vital records, degraded mode contract.
- `continuity-drill-runner.js`: role loss/rotation event를 successor activation과 paused functions로 변환.
- `run-continuity-drill-fixtures.js`: Commander unavailable, S6 rotation continuity drill fixtures.
- `multinational-doctrine-consistency-review.md`: 미군 중심 가정을 NATO/영국/캐나다/한국 공식 출처와 대조하는 감사 문서.
- `schema-files/doctrine-consistency-review.schema.json`: source family coverage, policy finding, resolution control contract.
- `doctrine-consistency-runner.js`: doctrine consistency review를 source coverage, unresolved conflict, policy update queue로 projection.
- `run-doctrine-consistency-fixtures.js`: valid multinational review와 US-only invalid review fixtures.

다음:

1. 현재 deep research/documentation/runtime contract 큐는 완료 상태로 둔다.
2. 호주 ADF 공식 doctrine 사이트 접근성이 확보되면 다국적 source family를 추가 검토한다.
3. 다음 확장은 사용자가 새 우선순위를 지정하면 별도 큐로 연다.

## 6. 리서치 운영 SOP

새 출처를 추가할 때:

1. 출처가 공식/교육/학술/비공식 중 어디인지 표시한다.
2. 직접 근거가 되는 군 개념을 1문장으로 요약한다.
3. LLM 적용은 별도 문장으로 분리한다.
4. `source-map.md`에 연결한다.
5. `research-compendium.md`에 자세한 메모를 저장한다.
6. 필요한 경우 schema, fixture, prototype에 반영한다.

새 문서를 만들 때:

1. 먼저 이 queue에서 research question을 선택한다.
2. 관련 출처를 최소 2개 이상 연결한다.
3. 군 개념과 LLM 해석을 섞지 않는다.
4. 마지막에 executable artifact 후보를 남긴다.

## 7. 주요 출처 묶음

Command and planning:

- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- JP 3-0, Joint Campaigns and Operations: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/
- ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715
- FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- STANAG 2014, Formats for Orders: https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/STANAG%202014%20Edition%2009-%20FORMATS%20FOR%20ORDERS%20%28OPORD%29.pdf

Staff integration and knowledge:

- Joint Headquarters Organization, Staff Integration, and Battle Rhythm: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_hq_org_fp.pdf
- Chief of Staff Roles and Functions: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/cos_fp.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507
- CJCSI 5780.01 Knowledge Management: https://www.jcs.mil/Portals/36/Documents/Library/Instructions/CJCSI%205780.01.pdf

Decision, authority, assessment:

- CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- Authorities Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/authorities_fp.pdf
- Assessment and Risk Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/assessment_risk2020.pdf?ver=2020-03-31-150705-920
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf

Rehearsal and interoperability:

- Commander and Staff Guide to Rehearsals: https://api.army.mil/e2/c/downloads/2023/01/19/48e6a637/19-18-commander-and-staff-guide-to-rehearsals-a-no-fail-approach-handbook-jul-19-public.pdf
- Commander and Staff Guide to Mission Partner Environment: https://api.army.mil/e2/c/downloads/2025/04/29/59b51ef8/no-25-1004-commander-and-staff-guide-to-mission-partner-environment-apr-25.pdf
- Commander and Staff Guide to Multinational Interoperability: https://api.army.mil/e2/c/downloads/2023/01/31/3dadfaa2/20-12.pdf
- Interorganizational Cooperation Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/interorgan_coop_fp.pdf

Special operations:

- JP 3-05, Special Operations: https://www.jcs.mil/Doctrine/DOCNET/JP-3-05-Special-Operations/
- FM 3-05, Army Special Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44116-FM_3-05-000-WEB-1.pdf
- USSOCOM SOF Truths: https://www.socom.mil/about/sof-truths
- USSOCOM Core Activities: https://www.socom.mil/about/core-activities

Force management:

- AR 71-32, Force Development and Documentation: https://history.army.mil/Portals/143/Images/Covid/PDF/r71_32.pdf
- DA PAM 71-32 / Army Force Management School digital library: https://www.afms.edu/digitallibrary.html
- How the Army Runs reference material: https://warroom.armywarcollege.edu/reference-materials/
- Force Management Functional Area, DA PAM 600-3 excerpt: https://api.army.mil/e2/c/downloads/2024/04/03/1074fa08/force-management-fa-50-da-pam-600-3.pdf

Multinational doctrine consistency:

- NATO/Allied Joint Doctrine AJP-01 official GOV.UK page: https://www.gov.uk/government/publications/ajp-01-d-allied-joint-doctrine
- UK Defence Doctrine JDP 0-01: https://www.gov.uk/government/publications/uk-defence-doctrine-jdp-0-01
- UK Joint Operations Doctrine JDP 01: https://www.gov.uk/government/publications/campaigning-a-joint-doctrine-publication
- Canadian Armed Forces public page: https://www.canada.ca/en/services/defence/caf.html
- DND reports and publications: https://www.canada.ca/en/department-national-defence/corporate/reports-publications.html
- CAF Ethos, Trusted to Serve: https://www.canada.ca/en/department-national-defence/corporate/reports-publications/canadian-armed-forces-ethos-trusted-to-serve.html
- Korean public anchors: https://www.mnd.go.kr/, https://www.law.go.kr/, https://www.kida.re.kr/

Training and sustainment:

- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716
- FM 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335
- ADP 4-0, Sustainment: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1028796
- JP 4-0, Joint Logistics: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/4-0-Logistics-Series/

## 8. 현 단계 결론

프레임워크의 다음 발전 방향은 "더 많은 프롬프트 템플릿"이 아니다. 군대식 운영의 강점은 문서 양식, 권한, 보고, rehearsal, 지식관리, AAR가 하나의 loop로 묶인다는 데 있다.

따라서 다음 이터레이션은 세 가지로 압축한다.

1. commander가 줄 입력을 handbook으로 고정한다.
2. authority와 CCIR를 schema/policy로 기계화한다.
3. event log와 dashboard projection을 runtime source of truth로 만든다.
