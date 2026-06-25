# Decision Risk Assessment

## 0. 목적

이 문서는 군의 decision support, CCIR, risk management, operation assessment 개념을 LLM 에이전트 운용에 적용하기 위한 기준표와 템플릿을 정의한다.

## 1. 결심 지원 체계

군의 decision support는 다음 질문에 답한다.

```text
어떤 조건이 발생하면,
누가,
언제,
어떤 정보를 보고,
어떤 결정을 해야 하는가?
```

LLM 운용에서도 작업 시작 전에 decision point를 정해야 한다.

## 2. Decision Point

Decision point는 작업 중 반드시 판단이 필요한 지점이다.

예시:

| Decision Point | Trigger | 결정권자 | 선택지 |
|---|---|---|---|
| 추가 리서치 여부 | 핵심 근거 부족 | Chief of Staff | 계속/추가조사/중단 |
| 사용자 승인 여부 | 비가역 변경 필요 | Commander | 승인/수정/거절 |
| 외부 도구 사용 여부 | 로컬 정보 부족 | Commander 또는 CoS | 사용/대체/보류 |
| 최종 발행 여부 | 검증 완료 | Commander | 발행/수정/재검증 |

## 3. CCIR

CCIR은 commander decision을 가능하게 하는 핵심 정보다.

AI 시스템에서 CCIR은 "사용자 또는 오케스트레이터가 판단해야 하는 조건"이다.

### 3.1 기본 CCIR

| CCIR | 보고 조건 | 보고 대상 |
|---|---|---|
| 목표 충돌 | 사용자 요구가 서로 충돌 | Commander |
| 근거 부족 | 핵심 주장에 신뢰 출처 없음 | Chief of Staff |
| 권한 초과 | 승인 등급 L3 이상 필요 | Commander |
| 비용 발생 | API, 결제, 장시간 실행 필요 | Commander |
| 보안 위험 | 민감 정보, 비밀, 자격증명 관련 | Commander |
| 비가역 변경 | 삭제, 배포, 공개 발행 | Commander |
| 환각 가능성 높음 | 출처 충돌, 모델 간 불일치 | Red Team + CoS |
| 실행 불가능 | 도구, 파일, 권한 부족 | Chief of Staff |

## 4. Decision Support Matrix

```text
DECISION SUPPORT MATRIX

Mission:
Commander Intent:

| DP | Trigger | CCIR | Info Source | Options | Risk | Decision Maker | Deadline | Action |
|---|---|---|---|---|---|---|---|---|
| DP1 | | | | | | | | |
| DP2 | | | | | | | | |
```

작성 원칙:

- 모든 CCIR은 decision point와 연결한다.
- 정보 요구만 있고 결정이 없으면 CCIR이 아니다.
- 결정권자가 불명확하면 실행 전 정한다.
- deadline이 없으면 보고가 늦어진다.

## 5. Risk Management

군의 risk management는 보통 다음 단계로 설명할 수 있다.

1. 위험 식별.
2. 위험 평가.
3. 통제책 개발과 위험 결심.
4. 통제책 실행.
5. 감독과 평가.

AI 적용:

| 단계 | 질문 |
|---|---|
| 식별 | 무엇이 잘못될 수 있는가? |
| 평가 | 가능성과 영향은 어느 정도인가? |
| 통제 | 어떻게 줄일 수 있는가? |
| 결심 | 누가 이 위험을 수용할 수 있는가? |
| 감독 | 실행 중 위험이 커지는가? |
| 평가 | 다음 SOP에 무엇을 반영할 것인가? |

## 6. AI Risk Matrix

| 가능성 \ 영향 | 낮음 | 중간 | 높음 | 치명 |
|---|---|---|---|---|
| 낮음 | Low | Low | Medium | High |
| 중간 | Low | Medium | High | Critical |
| 높음 | Medium | High | Critical | Critical |
| 거의 확실 | High | Critical | Critical | Critical |

위험 등급별 처리:

| 등급 | 처리 |
|---|---|
| Low | 에이전트 자율 처리 |
| Medium | Chief of Staff 보고 후 진행 |
| High | 통제책 수립 후 승인 필요 |
| Critical | Commander 승인 전 중단 |

## 7. AI Risk Register

```text
RISK REGISTER

| ID | Risk | Cause | Impact | Likelihood | Level | Control | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| R1 | | | | | | | | |
```

예시:

| ID | Risk | Control | Owner |
|---|---|---|---|
| R1 | 출처 없는 사실 단정 | S2 출처 검증, Red Team review | S2 |
| R2 | 사용자 의도 오해 | Backbrief 의무화 | CoS |
| R3 | 범위 확대 | OPORD scope 고정, FRAGO 사용 | S3 |
| R4 | 비가역 변경 | L4 승인 규칙 | Commander |

## 8. Assessment

Assessment는 산출물이 아니라 효과를 보는 절차다.

### 8.1 MOP와 MOE

| 개념 | 질문 | AI 예시 |
|---|---|---|
| MOP | 작업을 했는가? | 문서 생성, 테스트 실행, 출처 수집 |
| MOE | 목적을 달성했는가? | 사용자가 실행 가능, 환각 감소, 의사결정 쉬움 |

### 8.2 Indicator

Indicator는 성공 또는 실패를 보여주는 관찰 가능한 신호다.

예시:

| 목표 | Indicator |
|---|---|
| 문서 체계화 | README에서 모든 문서가 연결됨 |
| 리서치 품질 | 각 주장에 출처와 적용 의견 존재 |
| 권한 통제 | 승인 등급과 CCIR가 명확함 |
| 환각 감소 | 사실/추론/의견이 분리됨 |

## 9. Assessment Plan

```text
ASSESSMENT PLAN

Mission:
Success Criteria:

| Objective | MOP | MOE | Indicator | Data Source | Frequency | Owner |
|---|---|---|---|---|---|---|
| | | | | | | |
```

## 10. Go / No-Go Gate

실행 전 다음 gate를 통과해야 한다.

```text
GO / NO-GO

1. 목표가 명확한가?
2. 성공 조건이 명확한가?
3. 변형 금지 항목이 분리됐는가?
4. 승인 필요 조건이 정의됐는가?
5. CCIR가 정의됐는가?
6. 위험 통제책이 있는가?
7. 검증 방법이 있는가?
8. AAR 저장 위치가 있는가?
```

하나라도 "아니오"이면, 작업 규모에 따라 WARNO 또는 Backbrief 단계로 되돌린다.

## 11. 참고 자료

- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf
- Operation Assessment MTTP: https://www.alssa.mil/mttps/assessment/
- JP 5-0, Joint Planning: https://www.esd.whs.mil/Portals/54/Documents/FOID/Reading%20Room/Joint_Staff/18-F-1152_JP_5-0_Joint_Planning_2020.pdf
- JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf
- MDMP Handbook: https://api.army.mil/e2/c/downloads/2023/11/17/f7177a3c/23-07-594-military-decision-making-process-nov-23-public.pdf

