# Controls

AI LLM을 군대식 지휘통제, 문서 체계, 권한 위임, 보고, 사후관리 방식으로 운용하기 위한 개념 프레임워크입니다.

## Documents

- [Military LLM Framework v0.1](docs/military-llm-framework-v0.1.md): 전체 개념 교리.
- [Military Operating System](docs/military-operating-system.md): 군대 작동방식의 운영체계화.
- [Agent Roles and Authority](docs/agent-roles-and-authority.md): 지위별 승인, 보고, 자율 판단, 사후관리.
- [Decision Risk Assessment](docs/decision-risk-assessment.md): CCIR, decision support, risk, assessment.
- [Information to Operations Cycle](docs/information-to-operations-cycle.md): 수집된 정보가 running estimate, CCIR, SITREP, decision packet, FRAGO로 전환되는 절차.
- [Personnel Continuity Model](docs/personnel-continuity-model.md): 지휘관/에이전트 손실, 교체, 로테이션에도 조직이 계속 작동하는 승계/인수인계/권한 제한 모델.
- [Prompt Templates](docs/prompt-templates.md): OPORD, WARNO, FRAGO, SITREP, AAR 템플릿.
- [Orders Production Pipeline](docs/orders-production-pipeline.md): 요청을 mission analysis, OPORD, task order, backbrief, rehearsal, FRAGO, AAR로 변환하는 명령 생산 흐름.
- [OPORD Annex Model](docs/opord-annex-model.md): OPORD 본문과 annex를 분리해 source/tool/risk/verification 세부계획을 관리하는 모델.
- [Backbrief and Rehearsal SOP](docs/backbrief-and-rehearsal-sop.md): 실행 전 이해 재진술과 dry-run으로 하달 왜곡을 잡는 절차.
- [SOP Library](docs/sop-library.md): 리서치, 문서화, 구현, 검증, AAR 표준절차.
- [Agent Battle Rhythm](docs/agent-battle-rhythm.md): 단일/멀티에이전트 작업의 보고, 회의, 결심 주기.
- [Functional Domains](docs/functional-domains.md): 군 전투기능, 훈련, 지속지원, 타게팅, ROE의 LLM 운영 매핑.
- [Interdepartment Collaboration Policy](docs/interdepartment-collaboration-policy.md): 군 병과/기능 통합 원리를 부서 간 supported/supporting, liaison, handoff, conflict route 방침으로 변환.
- [Force Structure Change Policy](docs/force-structure-change-policy.md): 병과/보직/부대/TF 신설, 폐지, 증축, 감축을 capability gap, DOTMLPF-P, readiness, transition order로 통제하는 방침.
- [Source Map](docs/source-map.md): 군사 출처와 LLM 프레임워크 구성요소의 근거 지도.
- [Multinational Doctrine Consistency Review](docs/multinational-doctrine-consistency-review.md): 미군 중심 가정이 NATO/영국/캐나다/한국 공식 출처와 충돌하지 않도록 alias, jurisdiction gate, policy disposition을 검토하는 감사 문서.
- [Case Studies](docs/case-studies.md): OPORD부터 AAR까지 실제 적용 사례.
- [Glossary](docs/glossary.md): 군 용어와 LLM 운용 용어의 공통 사전.
- [Evaluation Metrics](docs/evaluation-metrics.md): AI METL, MOP/MOE, readiness rating 평가 체계.
- [Experiments](docs/experiments.md): 군대식 운용 방식의 효과를 검증하기 위한 실험 설계.
- [Korean Military Sources](docs/korean-military-sources.md): 한국군 공개자료, 법령, 정책, KIDA 자료의 적용 노트.
- [Implementation Guide](docs/implementation-guide.md): 실제 LLM 앱/에이전트 런타임 구현 가이드.
- [Prompt DSL](docs/prompt-dsl.md): OPORD, WARNO, FRAGO, SITREP, AAR의 기계 판독형 스키마.
- [Tool Use ROE](docs/tool-use-roe.md): 파일, 셸, 브라우저, API, DB, 배포 도구 사용 교전규칙.
- [LLM Agent Org Chart](docs/llm-agent-org-chart.md): 에이전트 조직도, 지휘관계, RACI, 보고선.
- [Korean Org Culture](docs/korean-org-culture.md): 한국 조직문화에서 backbrief, 보고, Red Team, 결재를 보정하는 방법.
- [Reference Architecture](docs/reference-architecture.md): Orchestrator, policy engine, tool gateway, evidence store 참조 구조.
- [Sample Runtime State](docs/sample-runtime-state.md): mission, OPORD, task order, tool request, SITREP, AAR 상태 예시.
- [Prompt DSL Validator](docs/prompt-dsl-validator.md): OPORD/WARNO/FRAGO/SITREP/AAR 검증 규칙.
- [Approval UI Patterns](docs/approval-ui-patterns.md): Amber/Red 도구 실행 전 사용자 승인 UI 패턴.
- [Schema Files](schema-files/README.md): Prompt DSL과 runtime state의 JSON Schema 묶음.
- [Validator Prototype](docs/validator-prototype.md): DSL validator 의사코드와 테스트 케이스.
- [Agent Runtime Playbook](docs/agent-runtime-playbook.md): 런타임 운영 절차, SITREP/FRAGO/AAR, 장애 대응.
- [Military AI Risk Register](docs/military-ai-risk-register.md): 군대식 AI 운용 위험 목록과 통제책.
- [Agent Readiness Ledger](docs/agent-readiness-ledger.md): 에이전트별 readiness rating과 훈련 계획.
- [Sample Payloads](sample-payloads/README.md): schema와 validator 테스트용 valid/invalid JSON 예시.
- [Policy Engine Rules](docs/policy-engine-rules.md): Green/Amber/Red/Black ROE 판정 규칙.
- [Command Post Dashboard](docs/command-post-dashboard.md): mission board, approval queue, CCIR, evidence viewer 설계.
- [Runtime Automation Roadmap](docs/runtime-automation-roadmap.md): 문서 프레임워크에서 tool-gated runtime까지 구현 로드맵.
- [Controls Doctrine Operator Skill](codex-skills/controls-doctrine-operator/SKILL.md): 방대한 문서/스키마/샘플/러너/fixture를 요청별로 라우팅하고, coverage gate로 누락 artifact를 감지하는 Codex skill.
- [Claude Code Controls Doctrine Operator Skill](.claude/skills/controls-doctrine-operator/SKILL.md): 같은 routing/coverage 체계를 Claude Code CLI project skill로 호출하는 skill.
- [AI CLI Skill Installer](install-ai-cli-skills.sh): Codex CLI와 Claude Code CLI의 skill 폴더를 확인/생성하고 Controls Doctrine Operator skill을 자동 설치하는 shell script.
- [Controls Doctrine Operator HTML](docs/controls-doctrine-operator-skill.html): 사용자 최종결정권자 모드와 AI 역할/부서/권한 라우팅 모드를 설명하는 정적 HTML.
- [Routing Receipt Schema](schema-files/routing-receipt.schema.json): AI 에이전트가 role/department/authority 라우터 실행 증거를 남기는 audit receipt schema.
- [Agent Routing Preflight Runner](agent-routing-preflight-runner.js): 웨이브 시작 전 CoS wave receipt와 각 agent S3 receipt를 검사해 `ready`/`blocked` projection을 만든다.
- [Agent Routing Preflight Fixtures](agent-routing-preflight-fixtures/README.md): 정상 receipt bundle, 누락 agent receipt, stale wave receipt 차단 fixture.
- [Evaluation Fixtures](docs/evaluation-fixtures.md): validator/policy/evidence/runtime 회귀 테스트 fixture 정의.
- [Validator CLI Prototype](validator-cli-prototype/README.md): JSON Schema subset과 semantic rule을 실행하는 Node CLI 초안.
- [Dashboard Wireframes](docs/dashboard-wireframes.md): command post dashboard 화면 wireframe.
- [Data Model SQL](docs/data-model.sql.md): mission/evidence/audit/readiness SQL 저장소 모델.
- [Runtime Demo Scenario](docs/runtime-demo-scenario.md): intake부터 AAR까지 흐르는 end-to-end 데모.
- [Source Reliability Rubric](docs/source-reliability-rubric.md): 출처 신뢰도와 해석 위험 평가 기준.
- [Validator Fixture Runner](validator-cli-prototype/run-fixtures.js): validator fixture expectations 자동 실행기.
- [Policy Engine Prototype](policy-engine-prototype/README.md): ROE 판정 함수를 실제 코드로 분리한 초안.
- [Runtime Demo Payloads](runtime-demo-payloads/README.md): demo mission의 실제 JSON payload 세트.
- [Dashboard UI Prototype](dashboard-ui-prototype/README.md): 정적 command post dashboard HTML prototype.
- [Event Sourcing Model](docs/event-sourcing-model.md): mission event log와 projection 설계.
- [Policy Fixture Runner](policy-engine-prototype/run-policy-fixtures.js): policy engine expected decision 자동 테스트.
- [Runtime Demo Runner](runtime-demo-runner.js): demo payloads와 policy checks end-to-end 실행기.
- [Dashboard State](dashboard-ui-prototype/dashboard-state.json): dashboard prototype 구동용 JSON state.
- [Event Fixtures](event-fixtures/README.md): event sourcing replay용 demo event log.
- [Event Replay Prototype](event-replay-prototype/README.md): event log를 mission projection으로 재생하는 Node prototype.
- [Dashboard State Renderer](dashboard-ui-prototype/render-state.js): event replay projection을 dashboard JSON state로 변환하는 Node script.
- [Event Replay Fixture Runner](event-replay-prototype/run-event-fixtures.js): replay projection과 dashboard 변환 기대값 자동 검증.
- [Runtime Demo OPORD](runtime-demo-payloads/opord.json): demo mission의 OPORD payload.
- [Military Operating Deep Research Queue](docs/military-operating-deep-research-queue.md): 누락된 군 작동영역과 다음 리서치 산출물 큐.
- [Commander Handbook](docs/commander-handbook.md): 사람이 AI 지휘관으로서 intent, 권한, 승인, 보고를 운용하는 실전 지침.
- [AI Special Operations TF](docs/ai-special-operations-tf.md): 미군 SOF 원리를 AI 고위험/고불확실성 task force 운영 모델로 변환.
- [B2C2WG Operating Model](docs/b2c2wg-operating-model.md): boards, bureaus, centers, cells, working groups의 멀티에이전트 운영 모델.
- [CCIR Alerting Model](docs/ccir-alerting-model.md): PIR/FFIR/EEFI/decision point를 dashboard alert와 routing으로 변환.
- [OPSEC Classification Model](docs/opsec-classification-model.md): context sharing, EEFI, releasability, sensitive output 통제 모델.
- [Role Document Access Policy](docs/role-document-access-policy.md): agent role, duty, authority별로 읽을 수 있는 문서만 배포하는 need-to-know 문서 접근 방침.
- [Knowledge Management SOP](docs/knowledge-management-sop.md): decision log, evidence store, event log, handoff packet 운영 절차.
- [Agent METL](docs/agent-metl.md): role별 mission essential task list와 readiness-to-authority 연결.
- [Authority Matrix Schema](schema-files/authority-matrix.schema.json): role/task/tool/target/risk/readiness 기반 권한 matrix schema.
- [Decision Packet Schema](schema-files/decision-packet.schema.json): commander board에 올릴 option/risk/evidence/authority packet schema.
- [Working Group Schema](schema-files/working-group.schema.json): B2C2WG charter와 disband condition schema.
- [SOF TF Charter Schema](schema-files/sof-tf-charter.schema.json): AI 특수부대 TF activation, cell separation, enabler, isolation, rehearsal contract schema.
- [Department Collaboration Charter Schema](schema-files/department-collaboration-charter.schema.json): 부서 간 supported/supporting 관계, liaison, synchronization, conflict route contract schema.
- [Force Structure Change Order Schema](schema-files/force-structure-change-order.schema.json): 조직 신설/폐지/증감축을 capability gap, DOTMLPF-P, authority, readiness, transition, documentation update로 승인하는 order schema.
- [CCIR Alert Schema](schema-files/ccir-alert.schema.json): alert object와 routing contract schema.
- [Handoff Packet Schema](schema-files/handoff-packet.schema.json): context transition 전 current state 전달 packet schema.
- [Continuity Plan Schema](schema-files/continuity-plan.schema.json): 핵심 보직의 승계선, vital records, degraded mode, rotation gate schema.
- [Alert Router Prototype](alert-router-prototype/README.md): event log를 CCIR alert projection으로 변환하는 Node prototype.
- [Readiness Gate Prototype](readiness-gate-prototype/README.md): authority matrix와 readiness rating을 결합한 실행권 판정 prototype.
- [Context Releasability Policy](docs/context-releasability-policy.md): role별 context packet 필터링과 EEFI release policy.
- [Context Item Schema](schema-files/context-item.schema.json): classification, EEFI, allowed roles, final release metadata schema.
- [Document Access Manifest Schema](schema-files/document-access-manifest.schema.json): role, duty, authority 기반 문서 접근 manifest schema.
- [Doctrine Consistency Review Schema](schema-files/doctrine-consistency-review.schema.json): 미군 외 공식 출처군 coverage, policy finding, alias/jurisdiction gate를 검증하는 review schema.
- [Release Review Schema](schema-files/release-review.schema.json): final output/external release review schema.
- [Release Gate Decision Event Schema](schema-files/release-gate-decision-event.schema.json): authority gate와 release review를 합성한 최종 allow/block audit event schema.
- [Context Filter Prototype](context-filter-prototype/README.md): role별 raw/summary/redacted/reference/denied context packet 생성기.
- [Document Access Runner](document-access-runner.js): role/duty/authority를 manifest와 대조해 allowed/denied document projection 생성.
- [Document Access Fixtures](document-access-fixtures/README.md): S2/Executor/S6 document access와 overbroad access 차단 fixture.
- [Doctrine Consistency Runner](doctrine-consistency-runner.js): doctrine consistency review를 source family coverage, unresolved conflict, policy update queue로 projection.
- [Doctrine Consistency Fixtures](doctrine-consistency-fixtures/README.md): US-only doctrine review와 `adopt_us_only` disposition 차단 fixture.
- [Handoff Generator](handoff-generator.js): event replay와 alert projection에서 handoff packet 생성.
- [Decision Packet Linter](decision-packet-linter.js): board packet option/risk/evidence/deadline 검증기.
- [Working Group Event Fixtures](event-fixtures/working-group-event-fixtures.json): WG opened/prepared/decided/closed event log.
- [Maintenance Readiness Model](docs/maintenance-readiness-model.md): tool/resource availability와 sustainment readiness 모델.
- [Maintenance Readiness Schema](schema-files/maintenance-readiness.schema.json): critical asset readiness report schema.
- [Maintenance Dashboard Runner](maintenance-dashboard-runner.js): maintenance readiness report를 ready/degraded/down dashboard projection으로 변환.
- [Maintenance Dashboard State](dashboard-ui-prototype/maintenance-readiness-dashboard-state.json): sustainment readiness dashboard projection state.
- [Backbrief Schema](schema-files/backbrief.schema.json): task owner가 이해한 intent/task/stop condition/approval boundary를 재진술하는 schema.
- [Rehearsal Schema](schema-files/rehearsal.schema.json): execution sequence, friction point, decision point, disposition을 검증하는 schema.
- [Annex Schema](schema-files/annex.schema.json): OPORD 본문과 전문 세부계획을 분리하는 annex contract.
- [FRAGO Scope Change Schema](schema-files/frago-scope-change.schema.json): mission scope/authority 변경을 annex update와 분리하는 FRAGO contract.
- [Information Report Schema](schema-files/information-report.schema.json): raw information intake, source reliability, CCIR candidate, handling instruction schema.
- [Intelligence Assessment Schema](schema-files/intelligence-assessment.schema.json): 평가된 정보가 CCIR, decision, SITREP, FRAGO 출력으로 분기되는 assessment schema.
- [Approval Scope Schema](schema-files/approval-scope.schema.json): single-use approval, expiry, rollback, evidence, consumption metadata schema.
- [Approval Consumption Event Schema](schema-files/approval-consumption-event.schema.json): scoped approval이 실제 실행으로 소비되는 감사 event schema.
- [Approval Revocation Event Schema](schema-files/approval-revocation-event.schema.json): scoped approval 철회와 통지/evidence 감사 event schema.
- [Approval Renewal Event Schema](schema-files/approval-renewal-event.schema.json): scoped approval 유효기간 연장과 권한 확장 차단 감사 event schema.
- [Approval Delegation Event Schema](schema-files/approval-delegation-event.schema.json): approval authority 위임과 commander-retained authority 차단 감사 event schema.
- [Approval Delegation Revocation Event Schema](schema-files/approval-delegation-revocation-event.schema.json): approval authority 위임 철회/만료 projection 감사 event schema.
- [Risk Acceptance Schema](schema-files/risk-acceptance.schema.json): residual risk, authority, duration, supervision, AAR trigger schema.
- [AAR Readiness Update Schema](schema-files/aar-readiness-update.schema.json): AAR finding을 readiness/SOP/maintenance update로 변환한 산출물 schema.
- [Maintenance Readiness Runner](maintenance-readiness-runner.js): critical runner 결과를 readiness report로 변환.
- [AAR Readiness Update Runner](aar-to-readiness-update.js): AAR finding을 readiness recommendation과 follow-up action으로 변환.
- [AAR Readiness Update Fixtures](aar-readiness-update-fixtures/README.md): AAR-to-readiness update 분기 검증 fixture.
- [Orders Dissemination Runner](orders-dissemination-runner.js): OPORD, task order, backbrief, rehearsal의 연결성과 intent 보존을 검증.
- [Rehearsal to CCIR Router](rehearsal-to-ccir-router.js): rehearsal friction/decision point를 CCIR alert와 decision packet으로 변환.
- [Rehearsal to CCIR Fixtures](rehearsal-to-ccir-fixtures/README.md): rehearsal routing 분기 검증 fixture.
- [Information to Operations Router](information-to-operations-router.js): 정보보고와 정보평가를 CCIR alert, decision packet, SITREP, FRAGO draft로 변환.
- [Information to Operations Fixtures](information-to-operations-fixtures/README.md): order change, FFIR SITREP, EEFI release block routing fixture.
- [Continuity Drill Runner](continuity-drill-runner.js): role loss/rotation event를 successor activation, paused functions, required handoff actions로 변환.
- [Continuity Drill Fixtures](continuity-drill-fixtures/README.md): Commander unavailable, S6 rotation continuity drill fixtures.
- [SOF TF Activation Runner](sof-tf-activation-runner.js): SOF TF charter를 go/no-go, approval gate, context distribution, preflight block projection으로 변환.
- [SOF TF Fixtures](sof-tf-fixtures/README.md): valid activation과 unbounded TF 차단 fixture.
- [Department Collaboration Runner](department-collaboration-runner.js): collaboration charter를 relationship edge, missing liaison, commander queue, preflight block projection으로 변환.
- [Department Collaboration Fixtures](department-collaboration-fixtures/README.md): valid cross-functional collaboration과 siloed collaboration 차단 fixture.
- [Force Structure Change Runner](force-structure-change-runner.js): 조직 변경 order를 preflight block, commander queue, transition task, documentation queue, readiness requirement로 projection.
- [Force Structure Change Fixtures](force-structure-change-fixtures/README.md): 정당화된 조직 신설과 근거 없는 증축 차단 fixture.
- [Policy Authority Integration](policy-engine-authority-integration.js): policy, authority matrix, scoped approval, risk acceptance를 합성하는 gate.
- [Authority Integration Fixture Runner](run-authority-integration-fixtures.js): approval 재사용 금지와 risk acceptance 누락 차단 검증.
- [Policy Release Integration](policy-engine-release-integration.js): authority gate와 release review를 합성해 execution approval과 information release approval을 분리 검증.
- [Release Integration Fixtures](release-integration-fixtures/README.md): release-required execution, missing review, invalid review, authority-blocked release fixtures.
- [Release Gate Decision Runner](release-gate-decision-runner.js): release integration output과 release gate decision event의 final decision/snapshot/evidence 일치 검증.
- [Release Gate Decision Fixtures](release-gate-decision-fixtures/README.md): release gate allow, missing review claim, authority-blocked release event fixtures.
- [Release Gate Dashboard Runner](release-gate-dashboard-runner.js): ReleaseGateDecided event를 release/authority/review dashboard queue로 projection.
- [Release Gate Dashboard State](dashboard-ui-prototype/release-gate-dashboard-state.json): release gate dashboard projection state.
- [Approval Consumption Runner](approval-consumption-runner.js): approval scope와 consumption event의 mission/action/tool/target/time/evidence 일치 검증.
- [Approval Consumption Fixtures](approval-consumption-fixtures/README.md): approval consumption event bundle fixtures.
- [Approval Revocation Runner](approval-revocation-runner.js): approval scope와 revocation event의 active status/authority/time/notification/evidence 일치 검증.
- [Approval Revocation Fixtures](approval-revocation-fixtures/README.md): approval revocation event bundle fixtures.
- [Approval Renewal Runner](approval-renewal-runner.js): approval scope와 renewal event의 active status/authority/window/execution-count/evidence 일치 검증.
- [Approval Renewal Fixtures](approval-renewal-fixtures/README.md): approval renewal event bundle fixtures.
- [Approval Delegation Runner](approval-delegation-runner.js): authority matrix와 delegation event의 base rule/ROE/risk/context/subdelegation 제한 검증.
- [Approval Delegation Fixtures](approval-delegation-fixtures/README.md): approval delegation event bundle fixtures.
- [Approval Delegation Revocation Runner](approval-delegation-revocation-runner.js): delegation event와 termination event의 status/authority/time/snapshot/evidence 검증.
- [Approval Delegation Revocation Fixtures](approval-delegation-revocation-fixtures/README.md): approval delegation revocation/expiry event bundle fixtures.
- [Authority Delegation Projection Runner](authority-delegation-projection-runner.js): approval delegation lifecycle event를 active/revoked/expired dashboard projection으로 변환.
- [Authority Delegation Projection State](dashboard-ui-prototype/authority-delegation-projection-state.json): delegated approval authority dashboard projection state.
- [Authority Integration Fixtures](authority-integration-fixtures/README.md): scoped approval/risk acceptance 합성 gate fixtures.
- [Release Review Runner](release-review-runner.js): context filter output과 release review를 비교.
- [Working Group Projection State](dashboard-ui-prototype/working-group-projection-dashboard-state.json): B2C2WG dashboard projection state.
- [Approval Scope Policy](docs/approval-scope-policy.md): approval once, constraints, expiry, rollback 정책.
- [Risk Acceptance Authority](docs/risk-acceptance-authority.md): 위험 수용권한과 commander retained authority.
- [Source Map Linter](source-map-linter.js): 공식 출처 도메인 coverage 검증.
- [Source Map URL Coverage Report](source-map-url-coverage-report.json): 공식 출처 host별 source-map coverage snapshot.
- [Research Compendium](docs/research-compendium.md): 리서치 자료와 해석 모음.

## Reading Order

1. `Military LLM Framework v0.1`
2. `Military Operating System`
3. `Agent Roles and Authority`
4. `Decision Risk Assessment`
5. `Prompt Templates`
6. `SOP Library`
7. `Agent Battle Rhythm`
8. `Functional Domains`
9. `Source Map`
10. `Case Studies`
11. `Glossary`
12. `Evaluation Metrics`
13. `Experiments`
14. `Korean Military Sources`
15. `Implementation Guide`
16. `Prompt DSL`
17. `Tool Use ROE`
18. `LLM Agent Org Chart`
19. `Korean Org Culture`
20. `Reference Architecture`
21. `Sample Runtime State`
22. `Prompt DSL Validator`
23. `Approval UI Patterns`
24. `Schema Files`
25. `Validator Prototype`
26. `Agent Runtime Playbook`
27. `Military AI Risk Register`
28. `Agent Readiness Ledger`
29. `Sample Payloads`
30. `Policy Engine Rules`
31. `Command Post Dashboard`
32. `Runtime Automation Roadmap`
33. `Evaluation Fixtures`
34. `Validator CLI Prototype`
35. `Dashboard Wireframes`
36. `Data Model SQL`
37. `Runtime Demo Scenario`
38. `Source Reliability Rubric`
39. `Validator Fixture Runner`
40. `Policy Engine Prototype`
41. `Runtime Demo Payloads`
42. `Dashboard UI Prototype`
43. `Event Sourcing Model`
44. `Policy Fixture Runner`
45. `Runtime Demo Runner`
46. `Dashboard State`
47. `Event Fixtures`
48. `Event Replay Prototype`
49. `Dashboard State Renderer`
50. `Event Replay Fixture Runner`
51. `Runtime Demo OPORD`
52. `Military Operating Deep Research Queue`
53. `Commander Handbook`
54. `B2C2WG Operating Model`
55. `CCIR Alerting Model`
56. `OPSEC Classification Model`
57. `Knowledge Management SOP`
58. `Agent METL`
59. `Authority Matrix Schema`
60. `Decision Packet Schema`
61. `Working Group Schema`
62. `CCIR Alert Schema`
63. `Handoff Packet Schema`
64. `Alert Router Prototype`
65. `Readiness Gate Prototype`
66. `Context Releasability Policy`
67. `Context Item Schema`
68. `Release Review Schema`
69. `Context Filter Prototype`
70. `Handoff Generator`
71. `Decision Packet Linter`
72. `Working Group Event Fixtures`
73. `Maintenance Readiness Model`
74. `Maintenance Readiness Schema`
75. `Maintenance Readiness Runner`
76. `Release Review Runner`
77. `Working Group Projection State`
78. `Approval Scope Policy`
79. `Risk Acceptance Authority`
80. `Source Map Linter`
81. `Research Compendium`
82. `Orders Production Pipeline`
83. `OPORD Annex Model`
84. `Backbrief and Rehearsal SOP`
85. `Backbrief Schema`
86. `Rehearsal Schema`
87. `Orders Dissemination Runner`
88. `Approval Scope Schema`
89. `Approval Consumption Event Schema`
90. `Risk Acceptance Schema`
91. `Policy Authority Integration`
92. `Authority Integration Fixture Runner`
93. `Approval Consumption Runner`
94. `Approval Consumption Fixtures`
95. `Authority Integration Fixtures`
96. `Information to Operations Cycle`
97. `Information Report Schema`
98. `Intelligence Assessment Schema`
99. `Information to Operations Router`
100. `Information to Operations Fixtures`
101. `Personnel Continuity Model`
102. `Continuity Plan Schema`
103. `Continuity Drill Runner`
104. `Continuity Drill Fixtures`
105. `Routing Receipt Schema`
106. `Agent Routing Preflight Runner`
107. `Agent Routing Preflight Fixtures`
