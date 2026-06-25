# B2C2WG Operating Model

## 0. 목적

B2C2WG는 boards, bureaus, centers, cells, and working groups의 약어다. 군 조직은 모든 문제를 지휘관 한 명에게 직접 올리지 않는다. 성격이 다른 문제를 회의체와 기능조직으로 나누고, battle rhythm 안에서 정보, 분석, 결심, 실행을 반복한다.

LLM 멀티에이전트 운용에서도 같은 문제가 생긴다.

- 모든 에이전트가 동시에 사용자에게 보고하면 정보 과부하가 생긴다.
- 리서치, 실행, 위험, 승인, 지식관리가 한 대화 안에서 섞이면 책임선이 흐려진다.
- 정기적인 decision packet이 없으면 장기 작업이 대화 기억에 의존한다.

이 문서는 B2C2WG를 AI LLM 작전운영체계의 scheduling, decision packet, authority routing 모델로 변환한다.

## 1. 군대식 기능을 LLM runtime으로 변환

| 군대식 요소 | 기능 | LLM 적용 |
| --- | --- | --- |
| Board | 지휘관 결심이 필요한 사안을 심의 | approval, priority, risk acceptance decision board |
| Bureau | 특정 행정/조정 기능을 지속 처리 | source registry, knowledge base, readiness ledger 운영 |
| Center | 상시 감시와 통합상황 유지 | command post dashboard, event replay projection |
| Cell | 특정 기능을 수행하는 실무 단위 | S2 research cell, S3 execution cell, S6 knowledge cell |
| Working Group | 특정 문제를 분석해 board에 올릴 packet 작성 | source review WG, policy WG, AAR WG, architecture WG |

핵심 원칙:

- Working group은 결심하지 않는다. 결심 가능한 packet을 만든다.
- Board는 긴 토론을 하지 않는다. prepared option 중 선택하거나 FRAGO를 낸다.
- Center는 현재 상태를 유지한다. 판단을 꾸미지 않는다.
- Cell은 기능별 실행을 한다. 권한 밖 행동은 CoS로 올린다.
- Bureau는 반복 관리 기능을 안정화한다.

## 2. AI 지휘소 구조

기본 구조:

| Node | 담당 | 산출물 | 보고 대상 |
| --- | --- | --- | --- |
| Commander Board | priority, risk, Red approval, scope change | decision, approval, FRAGO | 사용자 |
| CoS Integration Cell | tasking, deconfliction, battle rhythm | integrated SITREP, decision agenda | Commander |
| S2 Research Cell | source, uncertainty, PIR | evidence packet, source reliability note | CoS |
| S3 Current Ops Center | execution state, blockers, tool actions | task status, blocked action list | CoS |
| S4 Sustainment Cell | token, time, quota, tool availability | resource estimate, degradation plan | CoS |
| S6 KM Bureau | docs, state, event log, source map | updated doctrine, handoff packet | CoS |
| Red Team WG | contradiction, failure mode, exploit path | risk finding, mitigation option | Commander/CoS |
| Evaluator/AAR WG | MOP/MOE, readiness, SOP update | AAR, readiness change | Commander |

## 3. Battle rhythm

LLM runtime은 회의 대신 이벤트를 갖는다.

| 이벤트 | 빈도 | 입력 | 출력 |
| --- | --- | --- | --- |
| Mission Intake | 새 요청 시 | user request | mission draft, CCIR, initial authority |
| Mission Analysis WG | 큰 작업 시작 전 | mission draft, constraints | OPORD draft, risk list |
| Commander Decision Board | Red/priority/scope 필요 시 | decision packet | approve, reject, revise, FRAGO |
| Current Ops Sync | 긴 작업 중 30분 단위 또는 phase 종료 | event log, task state | SITREP |
| Source Review WG | 외부 근거 사용 전 | evidence records | source reliability decision |
| Tool Approval Board | Red/critical Amber action 전 | tool request, policy decision | scoped approval object |
| AAR WG | phase 종료 후 | outputs, tests, decisions | AAR, SOP update, readiness update |
| Handoff Sync | context transition 전 | current projection | handoff packet |

## 4. Decision packet 표준

Board에 올라가는 모든 안건은 아래 형식을 갖는다.

```text
DECISION PACKET:
- packet_id:
- mission_id:
- decision_type: priority | approval | scope | risk_acceptance | doctrine_update
- commander_question:
- background:
- options:
- recommended_option:
- risk:
- authority_required:
- evidence:
- deadline:
- if_no_decision:
- proposed_output: approval | rejection | FRAGO | SITREP | SOP update
```

규칙:

- option은 최소 2개 이상이어야 한다. 단, Black action은 option이 아니라 reject recommendation이다.
- recommended option에는 이유와 tradeoff가 있어야 한다.
- source-backed claim과 inference를 분리한다.
- Red Team finding이 있으면 숨기지 않는다.

## 5. Working group charter

새 working group을 만들 때는 charter를 남긴다.

```text
WG CHARTER:
- name:
- mission_id:
- problem:
- chair:
- participants:
- inputs:
- deliverable:
- decision board:
- meeting/event trigger:
- disband condition:
```

LLM runtime에서 WG는 별도 에이전트일 수도 있고, 단일 에이전트 내부의 사고 단계일 수도 있다. 중요한 것은 charter, output, disband condition이 명시되는 것이다.

## 6. 에이전트 회의체 anti-pattern

피해야 할 패턴:

- 모든 에이전트가 같은 질문에 독립적으로 긴 답을 내고 통합자가 없는 구조.
- board와 working group을 구분하지 않는 구조.
- Red Team이 실행권을 갖는 구조.
- decision packet 없이 사용자에게 긴 배경 설명만 올리는 구조.
- 회의체가 해산 조건 없이 계속 살아 있는 구조.
- SITREP이 status dump가 되고 commander decision을 돕지 못하는 구조.

## 7. B2C2WG와 event sourcing 연결

각 회의체 활동은 event log에 남아야 한다.

| Event | 의미 |
| --- | --- |
| `WorkingGroupOpened` | charter 생성 |
| `DecisionPacketPrepared` | board에 올릴 packet 생성 |
| `BoardDecisionMade` | commander decision 기록 |
| `FRAGOIssued` | scope/priority/authority 변경 |
| `WorkingGroupClosed` | 산출물 완료 또는 해산 |
| `SITREPIssued` | current ops state 보고 |
| `AARIssued` | phase learning 기록 |

projection:

- Dashboard는 active WG, pending decision packet, Red approval queue, latest SITREP을 보여준다.
- CoS는 event log를 보고 agenda를 생성한다.
- Evaluator는 board decision이 실제 효과로 이어졌는지 AAR에 연결한다.

## 8. 단일 에이전트에서의 적용

단일 에이전트라도 B2C2WG 사고 순서를 쓴다.

```text
1. S2 Research WG: 필요한 근거와 불확실성 확인
2. S3 Execution Cell: 실행 가능한 단계 분해
3. S6 KM Bureau: 저장될 문서와 상태 정의
4. Red Team WG: failure mode 확인
5. CoS Integration: 충돌 제거와 decision packet 작성
6. Commander Board: 사용자 또는 commander rule이 결심
```

출력은 내부 사고 전체가 아니라 commander에게 필요한 packet으로 압축한다.

## 9. 구현 후보

schema 후보:

- `working-group.schema.json`
- `decision-packet.schema.json`
- `board-decision.schema.json`
- `battle-rhythm-event.schema.json`

prototype 후보:

- `battle-rhythm-scheduler.js`: event log를 읽어 다음 board/WG 이벤트 제안.
- `decision-packet-linter.js`: option, risk, authority, evidence 누락 검증.
- dashboard panel: active WGs, pending packets, next decision deadline.

## 10. 출처 앵커

- Joint Headquarters Organization, Staff Integration, and Battle Rhythm Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_hq_org_fp.pdf
- Chief of Staff Roles and Functions Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/cos_fp.pdf
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507

## 11. 현 단계 결론

B2C2WG의 핵심은 회의를 많이 여는 것이 아니다. 문제 성격별로 분석 장소와 결심 장소를 분리하고, battle rhythm으로 정보가 흐르게 하는 것이다.

LLM 프레임워크에서 이것은 다음 규칙으로 구현된다.

1. Working group은 decision packet을 만든다.
2. Board는 승인, 우선순위, 위험수용, FRAGO만 결정한다.
3. CoS는 모든 에이전트 산출물을 commander-readable packet으로 통합한다.
4. Dashboard는 raw log가 아니라 decision relevance를 보여준다.
5. 모든 packet과 decision은 event log에 남는다.
