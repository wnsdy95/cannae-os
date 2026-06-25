# Interdepartment Collaboration Policy

## 0. 목적

이 문서는 군대에서 각기 다른 병과와 기능이 협력하는 방식을 LLM/agent 조직의 부서 간 협력 방침으로 변환한다.

군대의 병과 협력은 "서로 도와준다" 수준이 아니다. 지휘통제, 정보, 기동/실행, 화력/효과, 지속지원, 방호, 정보활동이 서로 다른 전문성을 가지되 하나의 지휘관 의도와 작전효과로 통합된다. LLM runtime에서도 research, execution, tool/sustainment, protection/release, Red Team, Recorder/KM가 자기 산출물만 만들면 mission은 깨진다.

핵심 전환:

```text
Military branch cooperation = task-organized combined arms under mission command
AI department cooperation = mission-organized cross-functional cells under bounded authority
```

## 1. 공식 출처 앵커

- ADP 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032715
- FM 3-0, Operations: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1026282
- JP 3-0, Joint Campaigns and Operations: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/3-0-Operations-Series/
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- Joint Headquarters Organization, Staff Integration, and Battle Rhythm Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_hq_org_fp.pdf
- Joint Task Force and Command and Control Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/jtf_and_c2_fp.pdf

## 2. 군 병과 협력에서 가져올 원리

| 군대식 원리 | 의미 | AI 부서 협력 적용 |
| --- | --- | --- |
| Combined arms | 서로 다른 기능을 결합해 단일 기능으로는 못 내는 효과를 만든다 | S2/S3/S4/S6/Protection/Recorder가 하나의 desired effect에 맞춰 산출물을 맞춘다 |
| Warfighting functions | 전투력은 command, intelligence, movement, fires, sustainment, protection, information 통합으로 나온다 | research, execution, tooling, release, risk, documentation을 같은 mission state에 연결한다 |
| Supported/supporting relationship | 모든 부서가 공동 지휘관이 아니다. 특정 phase의 main effort를 정하고 나머지는 지원한다 | 한 phase마다 supported department를 지정하고 supporting department의 output, deadline, handoff interface를 고정한다 |
| Liaison | 기능/조직 사이의 의미 변환과 정보 흐름을 유지한다 | 부서 간 dependency마다 liaison role과 update cadence를 둔다 |
| Battle rhythm | 정보, 분석, 결심, 실행이 정해진 주기로 돈다 | sync event, decision board, SITREP, AAR cadence를 둔다 |
| Common operating picture | 각 기능이 같은 상황판을 보고 일한다 | source map, event log, dashboard projection, current order를 source of truth로 둔다 |
| Deconfliction | 서로의 행동이 충돌하지 않게 사전에 조정한다 | 파일 소유권, release target, tool action, authority boundary 충돌을 CoS/Commander queue로 올린다 |

## 3. 부서 모델

LLM 조직의 부서는 사람/에이전트 수가 아니라 기능 책임으로 나눈다.

| 부서 | 군 기능 대응 | 기본 책임 | 기본 산출물 |
| --- | --- | --- | --- |
| Command / CoS | command and control | 의도, 우선순위, 충돌 조정, 결정 packet | OPORD, FRAGO, decision packet |
| Research / S2 | intelligence | 출처, 불확실성, source conflict, PIR | source map, evidence packet |
| Operations / S3 | movement and maneuver | 실행 순서, tasking, rehearsal, dependency | task order, execution plan |
| Effects / Executor | fires/effects | 목표 상태 변경, code/doc/tool action | target-effect log, implementation diff |
| Sustainment / S4/S6 | sustainment and signal | 도구, 자원, context, fallback, KM | maintenance report, PACE, handoff |
| Protection / Release | protection and OPSEC | EEFI, release review, rollback, risk guard | release review, context filter |
| Red Team / Evaluator | assessment and risk | failure mode, contradiction, abuse case | risk finding, AAR finding |
| Recorder / KM | information and records | source of truth, event log, decision memory | event log, handoff packet, AAR |

## 4. 협력 방침

### 4.1 Mission-first task organization

부서는 고정 조직표가 아니라 mission phase에 맞춰 task organized 된다.

```text
Phase마다 반드시 정한다:
- supported department: 해당 phase의 main effort
- supporting departments: main effort를 가능하게 하는 기능
- required support outputs
- handoff interface
- escalation trigger
```

예시:

| Phase | Supported department | Supporting departments |
| --- | --- | --- |
| 리서치 검증 | Research/S2 | Recorder, Red Team, Protection |
| 실행 계획 | Operations/S3 | Research, Sustainment, Protection |
| 고위험 실행 | Effects/Executor | Operations, Sustainment, Protection, Recorder |
| 외부 release | Protection/Release | Research, Recorder, Commander |

### 4.2 Supported department는 결심권자가 아니다

Supported department는 해당 phase의 통합 책임을 갖지만, commander-retained authority를 가져가지 않는다.

자동 이전 금지:

- Red tool approval.
- external release approval.
- high/critical residual risk acceptance.
- mission scope FRAGO.
- authority matrix 변경.

이 항목은 항상 Commander 또는 명시된 approval authority로 올라간다.

### 4.3 Supporting department의 책임은 output contract로 적는다

"S2가 도와준다"는 방침이 아니다. 지원은 다음처럼 산출물 계약으로 적는다.

```text
Supporting department:
Required output:
Quality gate:
Due before:
Handoff interface:
Escalation trigger:
Source of truth:
```

이 계약이 없으면 협력은 부탁이 되고, 부탁은 누락된다.

### 4.4 Liaison rule

두 부서 사이에 dependency가 있으면 liaison rule이 있어야 한다.

Liaison은 의사결정자가 아니다. Liaison은 다음을 보장한다.

- 용어와 intent가 같은 의미로 해석되는가.
- 어떤 정보가 raw, summary, redacted, denied인지 명확한가.
- 변경이 task order, source map, release review, handoff에 반영되는가.
- 충돌이 부서 간 논쟁으로 남지 않고 CoS/Commander decision queue로 올라가는가.

### 4.5 Conflict resolution

부서 충돌은 부서끼리 임의로 타협하지 않는다.

| 충돌 유형 | 기본 route |
| --- | --- |
| source conflict | S2 source review -> CoS decision packet |
| execution vs safety | S3/Protection -> Commander decision |
| tool availability | S4/S6 maintenance report -> CoS priority |
| release target mismatch | Protection/Release -> Commander release decision |
| scope change | S3 FRAGO draft -> Commander |
| documentation/state mismatch | Recorder -> CoS handoff sync |

충돌이 mission intent, authority, release, risk에 닿으면 decision packet이 필요하다.

## 5. 실행 절차

```text
1. Mission intake
   - objective, end state, constraints 확인

2. Function mapping
   - 필요한 기능 부서를 식별
   - 각 부서의 owner, output, authority boundary 기록

3. Supported/supporting matrix 작성
   - phase별 supported department와 supporting departments 지정

4. Liaison and interface 설정
   - dependency마다 liaison, cadence, handoff interface 지정

5. Synchronization
   - battle rhythm event, SITREP, decision point, CCIR 설정

6. Execute and deconflict
   - 부서 output을 CoS가 통합
   - conflict는 decision packet으로 격상

7. Handoff and AAR
   - Recorder가 event log, source of truth, unresolved risk, next action 저장
```

## 6. 협력 charter 필수 필드

현재 저장소의 실행 계약은 `schema-files/department-collaboration-charter.schema.json`이다.

필수 요소:

- `departments`: 부서, 기능, lead role, 책임, 산출물, authority boundary, source of truth.
- `relationships`: supported/supporting 관계, support type, required outputs, handoff interface, escalation trigger.
- `liaison_rules`: dependency별 liaison role, 교환 정보, cadence, conflict route.
- `synchronization`: battle rhythm, decision points, dependency matrix.
- `conflict_resolution`: 충돌 결심권자, decision packet 필요 여부, commander escalation 조건.
- `collaboration_controls`: source-map, glossary, no silent scope change, AAR, handoff discipline.
- `information_policy`: need-to-know, context sharing, EEFI controls.
- `exit_criteria`: success, abort, handoff.

## 7. Anti-patterns

- 모든 부서가 동시에 사용자에게 보고한다.
- research, execution, release review, recorder가 같은 role로 합쳐진다.
- 부서 간 dependency가 있지만 liaison이 없다.
- supported department가 commander-retained authority를 가져간다.
- "협업"이라는 말만 있고 required output, due point, handoff interface가 없다.
- conflict를 decision packet이 아니라 긴 토론으로 처리한다.
- shared source of truth가 없어 각 부서가 다른 현실을 본다.
- AAR 없이 다음 mission에 같은 협력 구조를 재사용한다.

## 8. 결론

부서 간 협력 방침의 핵심은 친절한 커뮤니케이션이 아니다. 핵심은 mission phase별 supported/supporting 관계, liaison, output contract, shared source of truth, conflict decision route, AAR를 강제하는 것이다.

LLM runtime에서 이 모델은 다음 한 문장으로 요약된다.

> 여러 부서가 협력한다는 것은 각자 잘하는 것이 아니라, 서로의 산출물이 다음 부서의 실행 조건이 되도록 계약화하는 것이다.
