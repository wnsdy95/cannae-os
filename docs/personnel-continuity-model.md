# Personnel Continuity Model

## 0. 목적

군대는 병사와 지휘관이 죽거나, 다치거나, 전출되거나, 교대되어도 계속 작동해야 한다. 이 문서는 그 조직 운영 원리를 LLM runtime에 적용한다.

핵심은 "사람을 보존한다"가 아니라 "보직, 권한, 기록, 훈련, 승계선, handoff를 보존한다"이다.

```text
person disappears
-> role remains
-> succession rule activates
-> authority boundary transfers or pauses
-> handoff packet and vital records restore context
-> readiness gate limits autonomous action
-> AAR updates training and SOP
```

## 1. 공식 출처 앵커

- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- ADP 6-0, Mission Command: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34403-ADP_6-0-000-WEB-3.pdf
- Federal Continuity Directive planning framework: https://www.fema.gov/sites/default/files/documents/fema_federal-continuity-directive-planning-framework.pdf
- Executing Knowledge Management in Support of Mission Command: https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf
- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716

## 2. 원칙

| 원칙 | 군대식 의미 | LLM runtime 적용 |
| --- | --- | --- |
| Role continuity | 사람은 사라져도 보직은 남는다 | agent instance가 아니라 role id를 source of truth로 둔다 |
| Succession depth | 후임자는 한 명이 아니라 여러 단계로 둔다 | Commander, CoS, S6, release owner는 2-deep 이상 승계 |
| Delegated but bounded authority | 후임자는 전권을 자동 획득하지 않는다 | Green/Amber는 지속, Red/Black/위험수용/외부공개는 retained authority로 제한 |
| Vital records | 필수 기록이 있어야 재구성 가능 | OPORD, authority matrix, event log, handoff packet, source map |
| Battle handover | 교대는 단순 알림이 아니라 겹침, backbrief, rehearsal이다 | rotation 전 overlap, backbrief, verification gate |
| Training pipeline | 사람을 즉석 대체하지 않는다 | successor readiness와 METL evidence가 authority를 제한 |
| Degraded mode | 인원이 줄면 일부 기능은 멈춘다 | critical role loss 시 release/deploy/scope change를 block |

## 3. 조직이 사람 손실을 견디는 장치

### 3.1 보직이 사람보다 먼저다

LLM runtime에서 `S2`, `S3`, `S6`, `CoS`, `Commander`는 특정 모델 세션이 아니라 보직이다.

보직은 다음을 가진다.

- mission-essential functions
- authority boundary
- source-of-truth files
- readiness requirement
- successor chain
- handoff duties
- do-not-do boundary

따라서 agent가 바뀌면 새 agent는 "처음부터 이해"하는 것이 아니라 보직의 packet을 인수한다.

### 3.2 승계선은 pre-event에 작성한다

지휘관 또는 핵심 참모가 사라진 뒤 승계선을 정하면 늦다.

승계선은 사전에 다음을 정한다.

- 누가 1차, 2차, 3차 후임인가?
- 어떤 trigger에서 승계가 발동되는가?
- 어떤 권한은 자동 이전되고, 어떤 권한은 보류되는가?
- 후임자의 readiness가 부족하면 어떤 기능을 중단하는가?
- 누가 통지받는가?

LLM runtime에서는 `schema-files/continuity-plan.schema.json`이 이 계획을 표현한다.

### 3.3 권한은 전부 이전되지 않는다

사람이 빠졌다고 후임자가 모든 결심권을 얻으면 위험하다.

| 권한 | 일반 승계 | 제한 |
| --- | --- | --- |
| routine status update | 이전 가능 | source of truth 필요 |
| Green/Amber tool action | readiness 충족 시 가능 | policy gate 유지 |
| Red action approval | predelegation 없으면 보류 | Commander retained |
| Black action | 이전 불가 | 계속 금지 |
| risk acceptance | Commander retained | explicit decision 필요 |
| final/external release | release review owner 필요 | target-specific review 필요 |
| OPORD scope change | FRAGO 필요 | affected role backbrief/rehearsal |

### 3.4 Handoff는 context dump가 아니다

handoff packet은 "대화 요약"이 아니라 다음 실행자가 즉시 지휘체계 안으로 들어오기 위한 작전 문서다.

필수 요소:

- current order
- commander intent
- pending decision
- active risk
- last verification
- source-of-truth files
- authority boundary
- successor duty
- do-not-do list

기존 `schema-files/handoff-packet.schema.json`은 context transition을 다룬다. 새 `continuity-plan.schema.json`은 어떤 상황에서 handoff가 반드시 필요한지를 정한다.

### 3.5 교대는 overlap을 갖는다

정상 rotation은 손실 상황보다 더 안전해야 한다. 따라서 outgoing role과 incoming role이 겹치는 시간이 필요하다.

교대 checklist:

1. outgoing role이 current state를 packet으로 고정한다.
2. incoming role이 backbrief한다.
3. CoS 또는 S6가 source-of-truth 파일을 확인한다.
4. high-risk function은 rehearsal한다.
5. authority matrix에서 temporary acting authority를 기록한다.
6. AAR/readiness ledger에 handoff 품질을 남긴다.

## 4. LLM 운영 모델

### 4.1 Agent instance는 expendable하다

모델 세션, sub-agent, tool worker는 언제든 사라질 수 있다고 가정한다.

따라서 금지한다.

- 중요한 결심을 chat memory에만 저장.
- source 없이 "내가 기억하기로" 실행.
- successor 없는 single agent critical path.
- handoff 없이 long-running task 계속 진행.
- readiness가 낮은 successor에게 Red/Black boundary 위임.

### 4.2 Source of truth가 지휘권을 유지한다

작업 재개 우선순위:

1. event log / projection
2. current OPORD / FRAGO
3. authority matrix / approval scope
4. handoff packet
5. decision packet / CCIR alert
6. README / source-map / compendium
7. chat history

chat history는 마지막 보조자료다.

### 4.3 Degraded mode

핵심 역할이 사라지면 runtime은 기능별로 축소된다.

| 손실 | 즉시 계속 가능 | 보류 |
| --- | --- | --- |
| Commander | routine execution within prior OPORD | new Red approval, risk acceptance, scope change |
| CoS | role-local work | cross-role priority change |
| S2 | existing sourced facts | new source reliability override |
| S3 | current approved tasks | new execution sequence |
| S4/S6 | local docs | release, deploy, tool maintenance decision |
| Recorder/KM | already logged work | handoff, source map, AAR closure |

## 5. Continuity drill

continuity는 문서가 아니라 훈련으로 검증한다.

드릴 질문:

- Commander가 없어도 누가 acting integrator가 되는가?
- S6가 없어도 event log, handoff, source-map을 찾을 수 있는가?
- incoming role이 chat history 없이 current order를 설명할 수 있는가?
- release review target이 바뀌면 gate가 막히는가?
- AAR가 readiness/SOP update로 이어지는가?

구현 산출물:

- `schema-files/continuity-plan.schema.json`
- `sample-payloads/valid-continuity-plan.json`
- `sample-payloads/invalid-continuity-plan-single-point-failure.json`
- `continuity-drill-runner.js`
- `run-continuity-drill-fixtures.js`

## 6. Prompt guard

```text
장기 작업 또는 역할 교체가 발생하면:
1. 현재 작업이 어떤 role에 속하는지 확인한다.
2. continuity plan에서 successor chain을 확인한다.
3. handoff packet과 source-of-truth files를 먼저 읽는다.
4. Red/Black, release, risk acceptance, scope change 권한은 자동 승계하지 않는다.
5. incoming role은 backbrief 후 실행한다.
6. 승계 또는 교대 후 AAR/readiness update를 남긴다.
```

## 7. 결론

군대가 사람 손실과 로테이션을 견디는 이유는 사람을 믿어서가 아니다. 보직, 승계, 권한 제한, 필수기록, 훈련, handoff, 사후학습이 사람보다 오래 남기 때문이다.

LLM runtime도 같은 방식이어야 한다. agent는 사라질 수 있지만 mission, intent, authority, event log, source map, handoff packet, readiness ledger는 남아야 한다.
