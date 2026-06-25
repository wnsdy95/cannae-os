# Information to Operations Cycle

## 0. 목적

이 문서는 군대에서 정보를 얻었을 때 그 정보를 어떻게 다루고, 평가하고, 작전 수립/변경명령/상향보고로 연결하는지를 LLM runtime 절차로 변환한다.

핵심은 정보가 들어오는 순간 바로 결론이나 실행으로 뛰지 않는 것이다.

```text
raw information
-> handling/classification
-> source reliability and confidence assessment
-> CCIR classification
-> running estimate update
-> decision support
-> OPORD/annex/FRAGO/SITREP/action
-> AAR/readiness/source update
```

## 1. 공식 출처 앵커

- JP 2-0, Joint Intelligence: https://www.jcs.mil/Doctrine/Joint-Doctrine-Pubs/2-0-Intelligence-Series/
- ADP 2-0, Intelligence: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1007507
- ATP 2-01.3, Intelligence Preparation of the Battlefield/Battlespace: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1023498
- ADP 5-0, The Operations Process: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN18126-ADP_5-0-000-WEB-3.pdf
- FM 5-0, Planning and Orders Production: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN44590-FM_5-0-001-WEB-3.pdf
- JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- Knowledge and Information Management Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/knowledge_and_info_fp.pdf?ver=2018-05-17-102808-507

## 2. 정보 처리 원칙

| 원칙 | 군대식 의미 | LLM runtime 적용 |
| --- | --- | --- |
| 정보와 판단 분리 | raw report와 assessment는 다르다 | 사실, 해석, 권고를 다른 필드로 보관 |
| 출처와 신뢰도 기록 | 출처 reliability와 confidence를 표시한다 | source reliability, confidence, evidence link 필수 |
| CCIR 우선 | 모든 정보가 보고 대상은 아니다 | PIR/FFIR/EEFI/Decision Point로 분류 |
| running estimate 갱신 | 참모는 계속 변하는 판단 자료를 유지한다 | S2/S3/S4/S6 estimate update queue |
| 명령 변경은 공식화 | scope/authority/priority 변경은 FRAGO | annex update와 FRAGO를 분리 |
| 보호정보는 반복 노출 금지 | EEFI는 보고하되 원문을 확산하지 않는다 | raw secret/credential을 alert에 복사하지 않음 |

## 3. 단계별 처리

### 3.1 Receive

정보가 들어오면 먼저 기록한다.

필수 질문:

- 누가 수집했는가?
- 언제 관측/수신했는가?
- 원 출처와 전달 경로는 무엇인가?
- classification과 EEFI 가능성은 무엇인가?
- 어떤 mission/order와 관련되는가?

산출물:

- `InformationReport`
- source/evidence link
- handling instruction

### 3.2 Handle

정보를 공유하기 전에 취급 등급을 정한다.

| 조건 | 조치 |
| --- | --- |
| public/internal, no EEFI | 일반 evidence/assessment 흐름 |
| sensitive/restricted | need-to-know packet |
| credential/secret/private data | EEFI Black alert, raw suppression |
| source unreliable | PIR/watch, 추가 확인 |
| source contradicts OPORD assumption | PIR/Decision Point, running estimate update |

### 3.3 Assess

S2 또는 담당 참모가 정보를 평가한다.

평가 필드:

- key facts
- assessment
- confidence
- source reliability
- operational implication
- information gaps
- recommended outputs

주의:

- low confidence 정보로 FRAGO를 바로 발행하지 않는다.
- 출처 충돌은 결론이 아니라 PIR 또는 decision packet으로 올린다.
- 판단은 commander intent와 authority boundary 안에서만 권고한다.

### 3.4 Classify by CCIR

| 정보 유형 | 분류 | 예시 | 산출물 |
| --- | --- | --- | --- |
| 외부 상황/출처/정책 변화 | PIR | 공식 자료가 기존 가정과 충돌 | evidence review, decision packet |
| 내부 수행능력/도구/자원 변화 | FFIR | validator failure, quota 부족 | SITREP, maintenance action |
| 보호해야 할 정보 | EEFI | credential-like content 발견 | suppression, release review |
| 결심 필요 조건 | DECISION_POINT | scope/authority/priority 변경 필요 | decision packet, FRAGO |

### 3.5 Convert to operational output

| 평가 결과 | 출력 |
| --- | --- |
| 참고만 필요 | running estimate update |
| 현재 상태 공유 필요 | SITREP |
| commander decision 필요 | decision packet |
| mission scope/authority/priority 변경 | FRAGO scope change |
| specialist plan detail 변경 | annex update |
| 민감정보 포함 | EEFI alert + release review |
| 반복 실패/교훈 | AAR readiness update |

## 4. 정보가 작전 수립으로 가는 방식

새 정보는 작전 수립에 네 방식으로 반영된다.

1. **Assumption update**
   - 기존 가정이 유지 가능한지 확인한다.
   - 불확실하면 PIR로 남긴다.

2. **Running estimate update**
   - S2/S3/S4/S6가 자기 기능별 판단을 업데이트한다.
   - 이 단계는 곧바로 명령 변경이 아니다.

3. **Decision support update**
   - decision point, trigger, options, risk, deadline을 만든다.
   - commander가 선택할 수 있는 형태로 올린다.

4. **Order update**
   - 세부계획이면 annex.
   - scope/authority/priority/mission change면 FRAGO.

## 5. 상향 보고 체계

```text
Collector / Agent
-> S2/S3/S4/S6 functional owner
-> CoS integration
-> Commander decision, if CCIR/Red/Black/scope change
-> Recorder/KM event log
```

보고 기준:

| 상황 | 보고 대상 | 방식 |
| --- | --- | --- |
| low confidence but low impact | S2 | running estimate |
| source conflict affects conclusion | CoS/S2 | PIR alert |
| tool/resource failure affects mission | CoS/S4/S6 | FFIR SITREP |
| sensitive info discovered | S6/Commander | EEFI alert |
| scope/authority change needed | Commander | decision packet + FRAGO draft |
| no decision impact | Recorder | event log only |

## 6. LLM prompt guard

```text
새 정보를 받으면 바로 결론을 내지 말고 다음을 수행하라.
1. raw information, source, confidence, classification을 분리 기록한다.
2. PIR/FFIR/EEFI/DECISION_POINT 중 하나로 분류한다.
3. commander decision에 영향을 주는지 판단한다.
4. 영향을 주면 decision packet, FRAGO, SITREP 중 적절한 산출물로 route한다.
5. EEFI 또는 credential-like 정보는 원문을 반복 출력하지 않는다.
6. low-confidence 정보는 FRAGO로 직접 바꾸지 않고 PIR/assessment로 남긴다.
```

## 7. 구현 산출물

- `schema-files/information-report.schema.json`
- `schema-files/intelligence-assessment.schema.json`
- `information-to-operations-router.js`
- `run-information-to-operations-fixtures.js`

## 8. 결론

군대식 정보처리의 핵심은 정보량을 늘리는 것이 아니라, 정보가 어느 결심을 바꿀 수 있는지 분류하고, 그 결심권자에게 정확한 형식으로 올리는 것이다.

LLM runtime에서 새 정보는 답변 재료가 아니라 command system input이다. 따라서 정보는 반드시 source, confidence, classification, CCIR, operational implication, output route를 거쳐야 한다.
