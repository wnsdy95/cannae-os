# Military Operating System

## 0. 목적

이 문서는 군대의 작동 방식을 하나의 운영체계로 보고, 그 구성요소를 LLM 운용 체계로 변환한다.

핵심 관점:

```text
군대는 사람을 많이 모은 조직이 아니라,
불확실한 환경에서 반복적으로 의도, 정보, 권한, 자원, 실행, 학습을 동기화하는 운영체계다.
```

## 1. 군대 운영체계의 계층

| 계층 | 군대 개념 | 역할 | LLM 적용 |
|---|---|---|---|
| 1 | Doctrine | 공통 사고방식 | 프레임워크 원칙 |
| 2 | SOP | 반복 업무 표준화 | 기본 프롬프트/워크플로우 |
| 3 | Commander's Intent | 목적과 성공 상태 | 사용자 의도와 금지선 |
| 4 | Planning Process | 문제 분석과 방책 개발 | 계획-검증-실행 루프 |
| 5 | Orders | 실행 지시 | OPORD/WARNO/FRAGO 프롬프트 |
| 6 | Task Organization | 임무별 조직 재구성 | 임무별 에이전트 팀 구성 |
| 7 | Battle Rhythm | 회의/보고/결정 주기 | 상태 업데이트와 승인 주기 |
| 8 | Decision Support | 결심 지점과 정보 요구 | CCIR/DSM/DST |
| 9 | Risk Management | 위험 식별과 통제 | 승인 등급, 중단 조건 |
| 10 | Liaison | 조직 간 연결 | 에이전트 간 인터페이스 |
| 11 | Knowledge Management | 정보 흐름 관리 | 근거 지도, 문서 저장소 |
| 12 | Assessment | 성과 측정 | MOP/MOE, 테스트, 검증 |
| 13 | AAR | 사후 학습 | 프롬프트/SOP 개선 |

## 2. Doctrine: 공통 사고방식

Doctrine은 세부 매뉴얼이 아니라 조직이 문제를 보는 공통 언어와 원칙이다.

LLM 적용:

- 모든 에이전트가 같은 용어와 판단 기준을 사용한다.
- "정확성", "근거", "승인", "보고", "자율성"의 의미를 표준화한다.
- 프레임워크 문서는 system prompt의 상위 원칙 역할을 한다.

산출물:

- 용어집.
- 원칙 문서.
- 역할별 책임표.
- 금지선과 승인 기준.

## 3. SOP: 반복 업무 표준화

SOP는 반복 업무를 매번 새로 판단하지 않게 만든다. 군은 SOP로 일상적 실행을 자동화하고, 지휘관은 예외와 변화에 집중한다.

LLM 적용:

- 반복 작업은 매번 새 프롬프트를 만들지 않는다.
- 조사, 요약, 코드 변경, 검증, 보고, AAR은 표준 템플릿으로 처리한다.
- SOP는 자유를 없애는 것이 아니라, 중요한 판단에 집중하기 위한 기본값이다.

AI SOP의 최소 구성:

```text
1. 목적
2. 적용 범위
3. 역할과 책임
4. 입력
5. 절차
6. 출력
7. 승인 조건
8. 보고 조건
9. 실패 시 대체 절차
10. 기록과 AAR
```

## 4. Commander's Intent: 목적 보존 장치

Commander's intent는 하위 단위가 상황 변화 속에서도 같은 방향으로 판단하게 하는 장치다.

LLM 적용:

- 에이전트에게 "무엇을 만들라"만 주지 않는다.
- 왜 만드는지, 성공 상태가 무엇인지, 절대 깨면 안 되는 기준을 준다.
- 하위 에이전트가 방법을 바꾸더라도 의도는 바꾸지 못하게 한다.

좋은 AI intent:

```text
목적:
성공 상태:
핵심 제약:
우선순위:
실패로 간주할 조건:
자율 판단 가능한 영역:
승인 필요한 영역:
```

## 5. Planning Process: 생각을 실행 전에 구조화

군은 큰 문제를 바로 실행하지 않는다. MDMP, JPP, MCPP, TLP 같은 절차로 문제를 분석하고 방책을 만든다.

LLM 적용:

- 단순 작업: TLP처럼 빠르게 처리.
- 복잡 작업: MDMP처럼 단계화.
- 불확실한 작업: design methodology처럼 문제 자체를 먼저 프레이밍.

AI planning loop:

```text
1. 임무 수령
2. 의도와 제약 확인
3. 정보 공백 식별
4. 방책 생성
5. 방책별 위험 평가
6. 선택 또는 승인 요청
7. 실행명령 생성
8. 실행 중 평가
```

## 6. Orders: 실행을 위한 문서

명령 문서는 생각의 결과를 실행 가능한 형태로 바꾼다.

| 명령 | 목적 | AI 적용 |
|---|---|---|
| WARNO | 준비 시작 | 자료 수집, 환경 확인 |
| OPORD | 본 실행 | 작업 실행 프롬프트 |
| FRAGO | 변경 반영 | 중간 수정 프롬프트 |

핵심 원칙:

- OPORD는 길 수 있지만 mission과 intent는 짧아야 한다.
- 세부 근거와 데이터는 annex로 분리한다.
- 변경은 FRAGO로 누적 관리한다.

## 7. Task Organization: 임무에 맞춰 조직을 바꾼다

군은 고정 조직만으로 싸우지 않는다. 임무에 따라 부대와 지원 관계를 재구성한다.

LLM 적용:

- 모든 작업에 같은 에이전트 구성을 쓰지 않는다.
- 리서치 작업은 S2와 Red Team을 강화.
- 구현 작업은 Executor와 S4를 강화.
- 전략 작업은 Chief of Staff, S3, Red Team을 강화.

예시:

| 작업 유형 | 권장 에이전트 구성 |
|---|---|
| 리서치 | Commander, S2, Red Team, Recorder |
| 코드 구현 | Commander, Chief of Staff, S3, S4, Executor, Red Team |
| 문서화 | Chief of Staff, S2, S3, Recorder |
| 고위험 판단 | Commander, S2, Red Team, 외부 전문가 |

## 8. Battle Rhythm: 조직의 심장박동

Battle rhythm은 회의, 보고, 분석, 결심, 명령 생산이 맞물리는 주기다. 단순 회의 일정이 아니라 지휘관 결심을 지원하는 정보 흐름이다.

LLM 적용:

- 긴 작업은 상태 보고 주기를 둔다.
- 보고는 "무엇을 했다"보다 "어떤 결정이 필요한가" 중심으로 한다.
- 하위 에이전트 산출물이 상위 판단의 입력이 되도록 순서를 맞춘다.

AI battle rhythm 예시:

```text
T0: Commander intent 확정
T1: S2 자료 수집 및 정보 공백 보고
T2: S3 실행계획 작성
T3: Red Team 검토
T4: Chief of Staff 통합
T5: Commander 승인 또는 FRAGO
T6: Executor 실행
T7: Assessment
T8: AAR
```

Battle rhythm 설계 기준:

- 각 이벤트의 output이 다음 이벤트의 input이어야 한다.
- 보고 주기는 작업 속도보다 느리면 안 된다.
- 회의와 보고가 결정을 만들지 못하면 제거한다.
- 상황이 바뀌면 battle rhythm도 바뀐다.

## 9. Decision Support: 결심 지점을 미리 정한다

Decision support는 "언제 어떤 정보가 들어오면 누가 어떤 결정을 해야 하는가"를 미리 정하는 체계다.

LLM 적용:

- 작업 시작 전에 decision point를 정의한다.
- 각 decision point에 필요한 CCIR를 연결한다.
- 정보가 들어오면 자동으로 보고 또는 실행 분기.

AI decision support matrix:

| Decision Point | Trigger | Needed Info | Options | Approver | Action |
|---|---|---|---|---|---|
| 계속 진행 여부 | 핵심 근거 부족 | 출처 신뢰도 | 진행/보류/추가조사 | Commander | FRAGO |
| 외부 검색 여부 | 최신 정보 필요 | 기존 지식 최신성 | 검색/보류 | Chief of Staff | S2 task |
| 배포 여부 | 산출물 완료 | 테스트 결과 | 배포/수정 | Commander | Release |

## 10. Risk Management: 위험은 승인권을 바꾼다

군의 risk management는 위험을 없애는 절차가 아니라, 위험을 식별하고 적절한 수준에서 수용하게 하는 절차다.

LLM 적용:

- 위험이 낮고 가역적이면 에이전트 자율.
- 위험이 높거나 비가역이면 Commander 승인.
- 위험 통제책이 없으면 실행하지 않는다.

AI risk steps:

```text
1. 위험 식별
2. 위험 평가
3. 통제책 수립
4. 승인권자 결정
5. 통제책 적용
6. 실행 중 감시
7. 사후 평가
```

## 11. Liaison: 수평 연결

Liaison은 조직 간 통신을 유지하고 오해를 줄이는 역할이다.

LLM 적용:

- 에이전트 간 인터페이스를 명확히 한다.
- S2가 찾은 근거가 S3 계획에 반영되는지 추적한다.
- Red Team 지적이 Executor 수정으로 이어지는지 확인한다.

AI liaison artifact:

```text
보낸 에이전트:
받는 에이전트:
전달 내용:
필요 행동:
마감:
확인 여부:
```

## 12. Knowledge Management: 정보 흐름을 설계한다

Knowledge management의 목적은 필요한 사람이 필요한 시간에 필요한 형식으로 정보를 받게 하는 것이다.

LLM 적용:

- 모든 자료를 하나의 긴 프롬프트에 넣지 않는다.
- 근거, 결정, 변경, 산출물을 분리 저장한다.
- 검색 가능한 source map과 decision log를 유지한다.

AI knowledge base 구성:

| 저장소 | 내용 |
|---|---|
| Source Map | 자료, 링크, 신뢰도, 요약 |
| Decision Log | 결정, 이유, 승인자 |
| Change Log | FRAGO, 변경 전후 |
| Evidence Map | 주장과 근거 연결 |
| SOP Library | 반복 절차 |
| AAR Library | 교훈과 개선안 |

## 13. Assessment: 잘했는지 측정한다

군의 assessment는 실행이 목표 달성으로 이어지는지 계속 보는 과정이다.

LLM 적용:

- 산출물이 존재하는 것과 임무 성공은 다르다.
- "작업 수행 여부"와 "효과 달성 여부"를 나눈다.

| 구분 | 군 개념 | AI 적용 |
|---|---|---|
| MOP | 수행 측정 | 작업을 했는가, 테스트를 돌렸는가 |
| MOE | 효과 측정 | 사용자 목적을 달성했는가 |
| Indicator | 징후 | 성공/실패를 보여주는 관찰 가능 신호 |

예시:

| 목표 | MOP | MOE |
|---|---|---|
| 문서화 | 문서 생성, 링크 추가 | 사용자가 바로 실행 가능한가 |
| 리서치 | 출처 수집, 요약 | 프레임워크 설계에 반영됐는가 |
| 코드 구현 | 테스트 통과 | 실제 사용 흐름이 개선됐는가 |

## 14. AAR: 학습을 제도화한다

AAR은 결과 보고가 아니라 조직 학습 장치다.

LLM 적용:

- 각 작업 후 prompt, SOP, authority rule 중 무엇을 개선할지 기록한다.
- 실패만 기록하지 말고 유지할 절차도 기록한다.
- 반복 오류는 SOP로 승격한다.

## 15. 전체 루프

```text
Doctrine
-> SOP
-> Intent
-> Planning
-> WARNO
-> OPORD
-> Backbrief
-> Rehearsal
-> Execute
-> SITREP / CCIR / FRAGO
-> Assessment
-> AAR
-> SOP Update
```

## 16. 참고 자료

- FM 6-0, Commander and Staff Organization and Operations: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN35404-FM_6-0-000-WEB-1.pdf
- ATP 3-90.90, Army Tactical Standard Operating Procedures: https://www.scribd.com/document/78673750/ATP-3-90-90
- Executing Knowledge Management in Support of Mission Command: https://api.army.mil/e2/c/downloads/2023/01/19/919a5372/18-02-executing-knowledge-management-in-support-of-mission-command-a-primer-for-senior-leaders-nov-17-public.pdf
- Improving the Battle Rhythm to Operate at the Speed of Relevance: https://ndupress.ndu.edu/Media/News/News-Article-View/Article/2679728/improving-the-battle-rhythm-to-operate-at-the-speed-of-relevance/
- ATP 5-19, Risk Management: https://www.first.army.mil/Portals/102/Users/231/99/999/Risk%20Management%20ATP%205-19.pdf
- Operation Assessment MTTP: https://www.alssa.mil/mttps/assessment/
- JCS CCIR Focus Paper: https://www.jcs.mil/Portals/36/Documents/Doctrine/fp/ccir_fp4th_ed.pdf

