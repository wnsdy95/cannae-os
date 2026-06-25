# Agent METL

## 0. 목적

METL은 mission essential task list다. 군은 모든 일을 같은 수준으로 훈련하지 않는다. 임무 수행에 필수적인 과업을 정하고, 그 과업을 기준으로 훈련과 readiness를 평가한다.

LLM 에이전트도 마찬가지다. "똑똑한 모델"이라는 일반 능력만으로 자율권을 줄 수 없다. 역할별 필수과업, 평가 기준, readiness rating, 권한 범위를 연결해야 한다.

## 1. Readiness rating

현재 프레임워크는 네 등급을 사용한다.

| Rating | 의미 | 권한 |
| --- | --- | --- |
| T | Trained. 독립 수행 가능 | Green 자율, 일부 Amber 보고 후 수행 |
| P | Practiced. 감독하 수행 가능 | Green 수행, Amber 사전보고, Red 불가 |
| U | Untrained. 초안/보조 가능 | draft/report만 허용 |
| X | Not assessed or unsafe | 실행 금지, 훈련 필요 |

readiness는 agent 전체가 아니라 task별로 부여한다.

예:

- `S2:public source research = T`
- `S2:legal interpretation = U`
- `S3:local validation = T`
- `S3:production deployment = X`

## 2. Role별 METL

### 2.1 Commander

Essential tasks:

- mission intent 작성.
- priority와 main effort 결정.
- Red risk acceptance.
- FRAGO 발령.
- AAR에서 doctrine/readiness 변경 승인.

Evaluation:

- intent가 observable end state를 포함하는가?
- authority boundary가 명확한가?
- CCIR가 결심정보 중심인가?
- 위험수용이 scope와 expiry를 갖는가?

### 2.2 CoS

Essential tasks:

- agent tasking.
- B2C2WG/battle rhythm 운영.
- decision packet 통합.
- SITREP 압축.
- conflicting guidance deconfliction.

Evaluation:

- commander에게 올린 packet이 결심 가능한가?
- 중복 작업과 충돌이 제거됐는가?
- pending decision과 blocked task가 누락되지 않았는가?

### 2.3 S2 Research

Essential tasks:

- source discovery.
- source reliability rating.
- claim/inference/open question 분리.
- PIR 답변.
- evidence record 작성.

Evaluation:

- 공식/학술/비공식 출처를 구분했는가?
- 최신성 불확실성을 표시했는가?
- 직접 근거와 LLM 해석을 분리했는가?

### 2.4 S3 Operations

Essential tasks:

- task order 작성.
- local execution plan 수립.
- tool request 생성.
- blocked action escalation.
- current ops SITREP 작성.

Evaluation:

- task와 commander's intent가 연결됐는가?
- Red/Amber/Green 분류가 정확한가?
- 실행 전 stop condition을 표시했는가?

### 2.5 S4 Sustainment

Essential tasks:

- token/time/quota/tool availability estimate.
- fallback and degraded mode plan.
- resource priority recommendation.
- long-running task checkpoint plan.

Evaluation:

- resource bottleneck을 commander decision으로 올렸는가?
- fallback이 실제 실행 가능한가?
- context loss 대비가 되어 있는가?

### 2.6 S6 Knowledge

Essential tasks:

- README/source-map/compendium 유지.
- event log and projection 관리.
- handoff packet 작성.
- classification/releasability metadata 관리.
- SOP update 반영.

Evaluation:

- 다음 작업자가 chat history 없이 이어갈 수 있는가?
- source of truth가 명확한가?
- 민감정보가 불필요하게 확산되지 않았는가?

### 2.7 Red Team

Essential tasks:

- assumption challenge.
- failure mode discovery.
- policy bypass attempt.
- source interpretation critique.
- approval risk review.

Evaluation:

- 실제 실행 가능한 risk를 찾았는가?
- finding이 commander decision에 연결되는가?
- Red Team이 실행권을 남용하지 않는가?

### 2.8 Evaluator

Essential tasks:

- MOP/MOE 분리.
- test and verification result 평가.
- AAR 작성.
- readiness update recommendation.
- SOP update recommendation.

Evaluation:

- 산출물 완료와 효과 달성을 구분했는가?
- AAR가 다음 행동으로 이어졌는가?
- readiness 변경 근거가 명시됐는가?

## 3. Readiness-to-authority policy

| Readiness | Green | Amber | Red | Black |
| --- | --- | --- | --- | --- |
| T | 자율 가능 | 보고 후 제한 수행 가능 | approval request만 | 금지 |
| P | 자율 가능 | 승인 또는 supervision 필요 | approval request만 | 금지 |
| U | 초안만 | 초안만 | 불가 | 금지 |
| X | 불가 | 불가 | 불가 | 금지 |

추가 제한:

- production, credential, external mutation은 readiness와 무관하게 Red 이상이다.
- Black은 어떤 readiness에서도 승인할 수 없다.
- readiness가 T여도 mission scope 밖이면 authority가 없다.

## 4. Crawl-Walk-Run 훈련 모델

| 단계 | 설명 | 예시 |
| --- | --- | --- |
| Crawl | 템플릿에 따라 초안 작성 | S2가 source table draft 작성 |
| Walk | 제한된 범위에서 검증 포함 수행 | S3가 local validator 실행 |
| Run | 실제 mission flow 안에서 자율 수행 | S6가 source-map/README/compendium 일괄 갱신 |

승급 조건:

- 같은 task를 3회 이상 성공.
- AAR에서 critical finding 없음.
- validator/test 또는 reviewer evidence 존재.
- authority boundary를 스스로 식별.

강등 조건:

- Red action 미보고.
- source를 과장하거나 hallucination.
- 민감정보 노출.
- 반복적인 handoff failure.

## 5. Evaluation event

readiness update는 event로 남긴다.

```json
{
  "event_type": "ReadinessUpdated",
  "mission_id": "M-DEMO-001",
  "actor": "EVALUATOR",
  "payload": {
    "agent_id": "S3",
    "task": "runtime prototype",
    "previous_rating": "P",
    "new_rating": "T",
    "evidence": [
      "runtime-demo-runner passed",
      "event replay fixture runner passed"
    ],
    "limitations": [
      "No production execution authority"
    ]
  }
}
```

## 6. METL review rhythm

| 시점 | 수행 |
| --- | --- |
| mission 시작 | 필요한 role/task readiness 확인 |
| Red/Amber approval 전 | 해당 task readiness 확인 |
| phase 종료 | AAR 기반 readiness update |
| repeated failure | 훈련 task 생성 |
| new tool 도입 | task readiness X로 시작 |

## 7. Prompt guard

```text
작업 전 role/task readiness를 확인하라.
- 내가 이 task에서 T/P/U/X 중 어디인가?
- 이 action의 ROE class는 무엇인가?
- readiness와 ROE 조합상 자율 실행 가능한가?
- 아니라면 draft, report, approval request 중 무엇을 해야 하는가?
```

## 8. 구현 후보

schema:

- `agent-metl.schema.json`
- `readiness-event.schema.json`

prototype:

- `readiness-gate-prototype/readiness-gate.js`: role/task/readiness/roe_class를 받아 allowed/report_required/approval_required/prohibit 판정.
- `aar-to-readiness.js`: AAR finding을 readiness update recommendation으로 변환.

## 9. 출처 앵커

- ADP 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1032716
- FM 7-0, Training: https://armypubs.army.mil/ProductMaps/PubForm/Details.aspx?PUB_ID=1022335
- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf

## 10. 현 단계 결론

에이전트 권한은 "모델이 좋다"로 주면 안 된다. 권한은 mission, task, tool, target, risk, readiness의 조합으로 계산해야 한다.

따라서 agent METL은 훈련 문서이면서 runtime policy 입력이다.
